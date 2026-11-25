import { active, cleanContent, contentLimits, config, paidSubscription, portalDefaults, rest, schoolAccess, schoolCodes, schoolFor, schoolPortalPath, select, send, userFor } from '../server/school-portal.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Método no permitido.' });
  try {
    const cfg = config();
    const user = await userFor(cfg, req);
    const school = await schoolFor(cfg, req.query?.code);
    if (!school) return send(res, 404, { error: 'No encontramos ese colegio.' });
    const { manager, member, verified, eligible, requestStatus, name:applicantName, brandingFolder } = await schoolAccess(cfg, user, school);
    if (req.query?.access === '1') {
      if (!eligible || !active(await paidSubscription(cfg,school))) return send(res,403,{error:'Acceso no disponible.'});
      const [site] = await select(cfg,'school_portal_content','published_at',{school_id:school.id});
      if (!site?.published_at) return send(res,404,{error:'El portal todavía no está publicado.'});
      if (req.method === 'POST' && !requestStatus && !verified && !manager) {
        await rest(cfg,'school_portal_access_requests?on_conflict=school_id,user_id',{
          method:'POST',prefer:'resolution=ignore-duplicates',body:{school_id:school.id,user_id:user.id,
            name:applicantName || '',email:user.email.trim().toLowerCase()}
        });
        const [saved] = await select(cfg,'school_portal_access_requests','status',{school_id:school.id,user_id:user.id});
        return send(res,200,{status:saved.status});
      }
      return send(res,200,{status:verified || manager ? 'approved' : requestStatus || 'available'});
    }
    if (!manager && !member) return send(res, 403, { error: 'El portal está reservado para miembros verificados o autorizados por este colegio.' });
    const subscription = await paidSubscription(cfg, school);
    if (!active(subscription)) return send(res, 403, { error: 'El colegio todavía no tiene un período pago vigente.' });
    if (req.method === 'POST') {
      if (!manager) return send(res, 403, { error: 'Solo la administración del colegio puede guardar cambios.' });
      const { revision, content, publish, memberAction } = req.body || {};
      if (req.body?.review) {
        const {review,userId} = req.body;
        if (!['approved','rejected','revoked'].includes(review) || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(userId || ''))
          return send(res,400,{error:'Solicitud inválida.'});
        const changed = await rest(cfg,'rpc/review_school_portal_access',{method:'POST',body:{
          p_school:school.id,p_user:userId,p_status:review,p_actor:user.id,p_name:school.display_name || school.name,
          p_path:'/portal-colegio?code='+encodeURIComponent(school.community_code || school.code)
        }});
        return changed ? send(res,200,{ok:true}) : send(res,409,{error:'La solicitud ya cambió. Recargá el panel.'});
      }
      if (memberAction) {
        const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
        if (!['add','remove'].includes(memberAction) || !/^[a-z0-9._+%'-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email) || email.length > 160) {
          return send(res,400,{ error:'Ingresá un correo válido.' });
        }
        if (memberAction === 'add') {
          await rest(cfg,'school_portal_members?on_conflict=school_id,email',{method:'POST',prefer:'resolution=ignore-duplicates',body:{school_id:school.id,email}});
        } else {
          await rest(cfg,'school_portal_members?' + new URLSearchParams({school_id:'eq.'+school.id,email:'eq.'+email}),{method:'DELETE'});
        }
        return send(res,200,{ok:true});
      }
      if (!Number.isSafeInteger(revision) || revision < 0 || typeof publish !== 'boolean' || !content) {
        return send(res, 400, { error: 'Los datos del portal no son válidos.' });
      }
      const next = await rest(cfg, 'rpc/save_school_portal_content', { method:'POST', body:{
        p_school_id: school.id, p_revision: revision, p_content: cleanContent(content, contentLimits(subscription.plan)), p_publish: publish
      } });
      return send(res, 200, { revision: next });
    }
    const manage = manager && req.query?.manage === '1';
    const fields = manage ? 'draft,published,revision,published_at' : 'published,published_at';
    const [portal] = await select(cfg, 'school_portal_content', fields, { school_id: school.id });
    if (!manager && !portal?.published_at) return send(res, 404, { error: 'Tu colegio todavía está preparando el portal.' });
    if (!manager && portal?.published?.membershipMode === 'verified' && !verified) {
      return send(res, 403, { error: 'Verificá tu pertenencia a este colegio para entrar.' });
    }
    if (req.query?.catalog === '1') {
      const page = Number(req.query.page || 0);
      const category = String(req.query.category || '');
      const term = String(req.query.q || '').trim().slice(0,100);
      const sort = {__proto__:null,recent:'created_at.desc',price:'price.asc',price_desc:'price.desc'}[req.query.sort] || 'created_at.desc';
      if (!Number.isSafeInteger(page) || page < 0 || page > 1000) return send(res,400,{error:'Página inválida.'});
      if (category && !['Libros','Apuntes','Cuadernos','Útiles','Mochilas','Tecnología','Uniformes','Otros'].includes(category)) {
        return send(res,400,{error:'Categoría inválida.'});
      }
      const codes = [...new Set(schoolCodes(school).flatMap(code => [code,code.toUpperCase(),code.toLowerCase()]))]
        .filter(code => /^[a-z0-9_-]{1,80}$/i.test(code));
      if (!codes.length) return send(res,200,{products:[],more:false});
      const query = new URLSearchParams({
        select:'id,title,price,category,condition,image_url',school_code:'in.(' + codes.join(',') + ')',
        status:'eq.available',or:'(moderation_status.eq.approved,moderation_status.is.null)',
        order:sort + ',id.desc',limit:'25',offset:String(page*24)
      });
      if (category) query.set('category','eq.' + category);
      const safeTerm = term.replace(/[^\p{L}\p{N} .-]/gu,' ').trim();
      if (safeTerm) query.set('title','ilike.*' + safeTerm + '*');
      const products = await rest(cfg,'products?' + query);
      return send(res,200,{products:products.slice(0,24),more:products.length>24});
    }
    if (req.query?.summary === '1') return send(res,200,{ available:true, manager, path:schoolPortalPath(school) });
    const members = manage
      ? await select(cfg,'school_portal_members','email',{school_id:school.id},{order:'email.asc',limit:'1000'}) : undefined;
    const { code, city, name, display_name } = school;
    const initialDraft = manage && !portal ? cleanContent({
      name:school.short_name, primary:school.primary_color, accent:school.accent_color
    }) : portalDefaults;
    return send(res, 200, {
      school: { code, city, name: display_name || name, path:schoolPortalPath(school) }, manager, billingOwner:manager && subscription.user_id === user.id, subscription: manage ? {...subscription,user_id:undefined} : undefined,
      publishedAt: portal?.published_at || null, members,
      accessRequests: manage ? await select(cfg,'school_portal_access_requests','user_id,name,email,status',
        {school_id:school.id},{status:'in.(pending,approved)',order:'status.desc,created_at.asc'}) : undefined,
      content: portal?.published || portalDefaults,
      ...(manage && { brandingFolder, limits: contentLimits(subscription.plan), draft: { ...initialDraft, ...(portal?.draft || {}) }, revision: portal?.revision || 0 })
    });
  } catch (error) {
    return send(res, error.status || 503, { error: error.status ? error.message : 'No pudimos cargar el portal. Volvé a intentar.' });
  }
}
