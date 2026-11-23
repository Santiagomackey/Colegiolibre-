import { active, config, fail, prices, schoolAccess, schoolFor, schoolPortalPath, rest, select, send, userFor, UUID } from '../server/school-portal.js';
import { beginSubscription, mp, subscriptionFields, syncSubscription } from '../server/school-billing.js';

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return send(res, 405, { error:'Método no permitido.' });
  try {
    const cfg = config();
    const user = await userFor(cfg, req);
    const id = req.method === 'GET' ? req.query?.request_id : req.body?.request_id;
    if (typeof id !== 'string' || !UUID.test(id)) throw fail(400, 'Solicitud inválida.');
    const [request] = await select(cfg,'institution_requests','id,official_school_code,requested_plan,billing_cycle,status,contact_email',
      { id, applicant_user_id:user.id });
    if (!request) throw fail(403, 'No encontramos esa inscripción en tu cuenta.');
    const school = await schoolFor(cfg, request.official_school_code);
    if (!school) throw fail(404, 'No encontramos el colegio.');
    const access = await schoolAccess(cfg,user,school);
    const manager = request.status === 'approved' && access.manager;
    const [stored] = await select(cfg,'institution_subscriptions',subscriptionFields,{ request_id:id, user_id:user.id });
    const enabled = Boolean(cfg.mpToken && cfg.webhook);
    if (req.method === 'GET') {
      let current = stored;
      let refreshUnavailable = false;
      if (stored?.provider_subscription_id && enabled && req.query?.refresh === '1') {
        try {
          current = await syncSubscription(cfg, stored);
        } catch (error) {
          if (error.status === 409) throw error;
          refreshUnavailable = true;
        }
      }
      const paid = active(current);
      return send(res, 200, {
        enabled, active:paid, status:current?.status || 'none', paidThrough:current?.paid_through,
        cycle:current?.billing_cycle, amount:current?.amount, prices:stored || request.requested_plan === "Institucional" ? prices[request.requested_plan] : undefined,
        checkoutReady:Boolean(current?.init_point), refreshUnavailable,
        portalPath:paid && manager ? schoolPortalPath(school) : undefined,
        canCancel:enabled && Boolean(current?.provider_subscription_id && current.status !== 'cancelled')
      });
    }
    if (req.body?.action === 'cancel') {
      if (!stored?.provider_subscription_id) throw fail(409, 'No hay una suscripción que cancelar.');
      const providerId = stored.provider_subscription_id;
      const path = '/preapproval/' + encodeURIComponent(providerId);
      let remote = await mp(cfg,path);
      const cancelled = value => ['cancelled','canceled'].includes(value.status);
      if (remote.id !== providerId || remote.external_reference !== id) throw fail(409,'La suscripción no coincide.');
      if (!cancelled(remote)) {
        try { remote = await mp(cfg,path,'PUT',{ status:'canceled' }); }
        catch (error) {
          if (!error.message.includes('HTTP 400')) throw error;
          remote = await mp(cfg,path,'PUT',{ status:'cancelled' });
        }
      }
      if (remote.id !== providerId || !cancelled(remote)) throw fail(502,'Mercado Pago todavía no confirmó la cancelación.');
      const query = new URLSearchParams({request_id:'eq.'+id,provider_subscription_id:'eq.'+providerId});
      await rest(cfg,'institution_subscriptions?'+query,{method:'PATCH',body:{
        status:'cancelled',provider_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }});
      return send(res,200,{status:'cancelled'});
    }
    if (access.manager === undefined || (request.status !== 'pending' && !manager)) throw fail(403, 'Esta inscripción no admite nuevos pagos.');
    return send(res,200,{ init_point:await beginSubscription(cfg,request,school,user,req.body?.cycle || request.billing_cycle,stored) });
  } catch (error) {
    return send(res,error.status || 503,{ error:error.status ? error.message : 'No pudimos completar la solicitud. Volvé a intentar.' });
  }
}
