import { active, cleanContent, config, paidSubscription, portalDefaults, rest, schoolAccess, schoolCodes, schoolFor, schoolPortalPath, select, send, userFor } from '../server/school-portal.js';

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
    if (req.query?.catalog === '1') {
      const [publication] = await select(cfg,'school_portal_content','published_at',{school_id:school.id});
      if (!publication?.published_at && !manager) return send(res,404,{ error:'El portal todavía no está publicado.' });
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
    if (req.query?.summary === '1') {
      if (!manager) {
        const [published] = await select(cfg,'school_portal_content','published_at',{ school_id:school.id });
        if (!published?.published_at) return send(res,404,{ error:'Tu colegio todavía está preparando el portal.' });
      }
      return send(res,200,{ available:true, path:await schoolPortalPath(cfg,school) });
    }
    const manage = manager && req.query?.manage === '1';
    const members = manage
      ? await select(cfg,'school_portal_members','email',{school_id:school.id},{order:'email.asc',limit:'1000'}) : undefined;
    const fields = manage ? 'draft,published,revision,published_at' : 'published,published_at';
    const [portal] = await select(cfg, 'school_portal_content', fields, { school_id: school.id });
    if (!manager && !portal?.published) return send(res, 404, { error: 'Tu colegio todavía está preparando el portal.' });
    const { code, city, name, display_name } = school;
    return send(res, 200, {
      school: { code, city, name: display_name || name, path:await schoolPortalPath(cfg,school) }, manager, subscription: manage ? subscription : undefined,
      publishedAt: portal?.published_at || null, members,
      content: portal?.published || portalDefaults,
      ...(manage && { draft: { ...portalDefaults, ...(portal?.draft || {}) }, revision: portal?.revision || 0 })
    });
  } catch (error) {
    return send(res, error.status || 503, { error: error.status ? error.message : 'No pudimos cargar el portal. Volvé a intentar.' });
  }
}
