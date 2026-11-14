import { authenticatedUser } from './mp-link.js';

export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const PROVIDER_ID = /^[a-z0-9_-]{8,100}$/i;
export const prices = { Institucional: { monthly: 24900, annual: 249000 }, 'Red Escolar': { monthly: 59900, annual: 599000 } };
export const portalDefaults = { name: '', title: 'Bienvenidos a nuestra comunidad', description: '', primary: '#0B2E6B', accent: '#67C23A', logo: '', contact: '', announcements: [], resources: [] };
export const fail = (status, message) => Object.assign(Error(message), { status });

export function config() {
  const { SUPABASE_URL: supabase, SUPABASE_SERVICE_ROLE_KEY: key, MERCADOPAGO_ACCESS_TOKEN: mpToken, MERCADOPAGO_SUBSCRIPTIONS_WEBHOOK_SECRET: webhook } = process.env;
  if (!supabase || !key) throw fail(503, 'El portal no está disponible en este momento.');
  return { supabase, key, mpToken, webhook, origin: 'https://www.colegiolibre.com' };
}

export function send(res, status, payload) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(status).json(payload);
}

export async function userFor(cfg, req) {
  const user = await authenticatedUser(cfg, req);
  if (!user) throw fail(401, 'Iniciá sesión para continuar.');
  return user;
}

export async function rest(cfg, path, { method = 'GET', body, prefer } = {}) {
  const headers = { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json' };
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(cfg.supabase + '/rest/v1/' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(7000)
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    if (result?.message === 'PORTAL_CONFLICT') throw fail(409, 'Otro administrador guardó cambios. Recargá el panel.');
    throw Error('PORTAL_STORAGE_ERROR');
  }
  return result;
}

export function select(cfg, table, fields, filters = {}, extras = {}) {
  const query = new URLSearchParams({ select: fields, ...extras });
  for (const [key, value] of Object.entries(filters)) query.set(key, 'eq.' + value);
  return rest(cfg, table + '?' + query);
}
const first = async (...args) => (await select(...args))[0] || null;
const schoolFields = 'id,code,community_code,name,display_name,city';
export const active = subscription => Date.parse(subscription?.paid_through || '') > Date.now();
export const schoolCodes = school => [...new Set([school.code, school.community_code].filter(Boolean))];

export async function schoolFor(cfg, code) {
  if (typeof code !== 'string' || !/^[\w-]{1,80}$/.test(code)) return null;
  const value = code.toUpperCase();
  return await first(cfg, 'schools', schoolFields, { code: value, is_active: true }, { limit: '1' }) ||
    await first(cfg, 'schools', schoolFields, { community_code: value, is_active: true }, { limit: '1' });
}

export async function schoolAccess(cfg, user, school) {
  const profile = await first(cfg, 'profiles', 'school_code,school_verification_status,account_status', { id: user.id }, { limit: '1' });
  if (['banned','suspended'].includes(profile?.account_status)) return {};
  const codes = schoolCodes(school).map(code => code.toUpperCase());
  const memberships = await select(cfg, 'school_admins', 'school_code', { user_id: user.id, is_active: true });
  const manager = memberships.some(membership => codes.includes(membership.school_code.toUpperCase()));
  const verified = profile?.school_verification_status === 'verified' && codes.includes(profile.school_code?.toUpperCase());
  const email = user.email?.trim().toLowerCase();
  const invited = !manager && !verified && email && user.email_confirmed_at &&
    await first(cfg, 'school_portal_members', 'school_id', { school_id: school.id, email }, { limit:'1' });
  const member = Boolean(verified || invited);
  return { manager, member };
}

export async function paidSubscription(cfg, school) {
  const requests = await select(cfg, 'institution_requests', 'id,requested_plan', { official_school_code: school.code, status: 'approved' });
  const ids = requests.filter(request => Object.hasOwn(prices, request.requested_plan)).map(request => request.id);
  if (!ids.length) return null;
  const query = new URLSearchParams({
    select: 'plan,billing_cycle,amount,currency,status,paid_through',
    request_id: 'in.(' + ids.join(',') + ')',
    paid_through: 'gt.' + new Date().toISOString(), order: 'paid_through.desc', limit: '1'
  });
  return (await rest(cfg, 'institution_subscriptions?' + query))[0] || null;
}

const trimmed = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';
function httpsUrl(value) {
  try {
    const url = new URL(trimmed(value, 600));
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}
export function cleanContent(input) {
  const data = input && typeof input === 'object' ? input : {};
  const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  const list = (value, limit, convert) => Array.isArray(value) ? value.slice(0,limit).map(convert).filter(Boolean) : [];
  return {
    name: trimmed(data.name, 80),
    title: trimmed(data.title, 110),
    description: trimmed(data.description, 650),
    primary: color(data.primary, portalDefaults.primary),
    accent: color(data.accent, portalDefaults.accent),
    logo: httpsUrl(data.logo),
    contact: /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(data.contact) ? trimmed(data.contact, 140) : '',
    announcements: list(data.announcements, 8, item => {
      const title = trimmed(item?.title, 95), body = trimmed(item?.body, 500);
      return title && body ? { title, body } : null;
    }),
    resources: list(data.resources, 12, item => {
      const title = trimmed(item?.title, 95), url = httpsUrl(item?.url);
      return title && url ? { title, url } : null;
    })
  };
}
