import { active, cleanContent, config, paidSubscription, portalDefaults, rest, schoolAccess, schoolFor, select, send, userFor } from '../server/school-portal.js';

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'Método no permitido.' });
  try {
    const cfg = config();
    const user = await userFor(cfg, req);
    const school = await schoolFor(cfg, req.query?.code);
    if (!school) return send(res, 404, { error: 'No encontramos ese colegio.' });
    const { manager, member } = await schoolAccess(cfg, user, school);
    if (!manager && !member) return send(res, 403, { error: 'El portal está reservado para miembros verificados o autorizados por este colegio.' });
    const subscription = await paidSubscription(cfg, school);
    if (!active(subscription)) return send(res, 403, { error: 'El colegio todavía no tiene un período pago vigente.' });
    if (req.method === 'POST') {
      if (!manager) return send(res, 403, { error: 'Solo la administración del colegio puede guardar cambios.' });
      const { revision, content, publish, memberAction } = req.body || {};
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
        p_school_id: school.id, p_revision: revision, p_content: cleanContent(content), p_publish: publish
      } });
      return send(res, 200, { revision: next });
    }
    if (req.query?.summary === '1') {
      if (!manager) {
        const [published] = await select(cfg,'school_portal_content','published_at',{ school_id:school.id });
        if (!published?.published_at) return send(res,404,{ error:'Tu colegio todavía está preparando el portal.' });
      }
      return send(res,200,{ available:true });
    }
    const members = manager && req.query?.manage === '1'
      ? await select(cfg,'school_portal_members','email',{school_id:school.id},{order:'email.asc',limit:'1000'}) : undefined;
    const fields = manager ? 'draft,published,revision,published_at' : 'published,published_at';
    const [portal] = await select(cfg, 'school_portal_content', fields, { school_id: school.id });
    if (!manager && !portal?.published) return send(res, 404, { error: 'Tu colegio todavía está preparando el portal.' });
    const { code, city, name, display_name } = school;
    return send(res, 200, {
      school: { code, city, name: display_name || name }, manager, subscription: manager ? subscription : undefined,
      publishedAt: portal?.published_at || null, members,
      content: portal?.published || portalDefaults,
      ...(manager && { draft: { ...portalDefaults, ...(portal?.draft || {}) }, revision: portal?.revision || 0 })
    });
  } catch (error) {
    return send(res, error.status || 503, { error: error.status ? error.message : 'No pudimos cargar el portal. Volvé a intentar.' });
  }
}
