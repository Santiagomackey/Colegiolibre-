import { active, config, fail, schoolAccess, schoolFor, select, send, userFor, UUID } from '../server/school-portal.js';
import { beginSubscription, mp, subscriptionFields, syncSubscription } from '../server/school-billing.js';

export default async function handler(req, res) {
  if (!['GET','POST'].includes(req.method)) return send(res, 405, { error:'Método no permitido.' });
  try {
    const cfg = config();
    const user = await userFor(cfg, req);
    const id = req.method === 'GET' ? req.query?.request_id : req.body?.request_id;
    if (typeof id !== 'string' || !UUID.test(id)) throw fail(400, 'Solicitud inválida.');
    const [request] = await select(cfg,'institution_requests','id,official_school_code,requested_plan,billing_cycle,status,contact_email',
      { id, applicant_user_id:user.id, status:'approved' });
    if (!request) throw fail(403, 'Primero debemos aprobar la solicitud institucional.');
    const school = await schoolFor(cfg, request.official_school_code);
    if (!school || !(await schoolAccess(cfg,user,school)).manager) throw fail(403, 'Acceso reservado a la administración del colegio.');
    const [stored] = await select(cfg,'institution_subscriptions',subscriptionFields,{ request_id:id, user_id:user.id });
    const enabled = Boolean(cfg.mpToken && cfg.webhook);
    if (req.method === 'GET') {
      const current = stored?.provider_subscription_id && enabled && req.query?.refresh === '1'
        ? await syncSubscription(cfg, stored) : stored;
      return send(res,200,{ enabled, active:active(current), status:current?.status || 'none', paidThrough:current?.paid_through,
        cycle:current?.billing_cycle, canCancel:Boolean(current?.provider_subscription_id && current.status !== 'cancelled') });
    }
    if (req.body?.action === 'cancel') {
      if (!stored?.provider_subscription_id) throw fail(409, 'No hay una suscripción que cancelar.');
      await mp(cfg,'/preapproval/'+encodeURIComponent(stored.provider_subscription_id),'PUT',{ status:'canceled' });
      const current = await syncSubscription(cfg,stored);
      return send(res,200,{ status:current.status, paidThrough:current.paid_through });
    }
    return send(res,200,{ init_point:await beginSubscription(cfg,request,school,user,req.body?.cycle || request.billing_cycle,stored) });
  } catch (error) {
    return send(res,error.status || 503,{ error:error.status ? error.message : 'No pudimos completar la solicitud. Volvé a intentar.' });
  }
}
