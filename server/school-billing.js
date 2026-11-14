import crypto from 'node:crypto';
import { fail, prices, PROVIDER_ID, rest, select } from './school-portal.js';

export const subscriptionFields = 'request_id,school_id,user_id,plan,billing_cycle,amount,currency,provider_subscription_id,status,init_point,paid_through,provider_synced_at';
const known = ['pending', 'authorized', 'paused', 'cancelled'];
export function checkoutUrl(raw) {
  try {
    const url = new URL(raw);
    return url.origin === 'https://www.mercadopago.com.ar' && !url.username && !url.password &&
      url.pathname.startsWith('/subscriptions/') ? url.href : null;
  } catch (_) { return null; }
}

export async function mp(cfg, path, method = 'GET', body, idempotency) {
  if (!cfg.mpToken) throw fail(503, 'El cobro de suscripciones todavía no está habilitado.');
  const headers = { Authorization: 'Bearer ' + cfg.mpToken, 'Content-Type': 'application/json' };
  if (idempotency) headers['X-Idempotency-Key'] = idempotency;
  const res = await fetch('https://api.mercadopago.com' + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) throw fail(502, 'Mercado Pago no pudo completar la solicitud. Volvé a intentar.');
  return res.json();
}

function endOfPeriod(value, cycle) {
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return 0;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + (cycle === 'annual' ? 12 : 1));
  const monthEnd = new Date(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return date.valueOf();
}

export function paidThrough(invoices, subscription) {
  const valid = invoices.filter(invoice =>
    invoice.preapproval_id === subscription.provider_subscription_id &&
    invoice.currency_id === subscription.currency &&
    Number(invoice.transaction_amount) === Number(subscription.amount) &&
    invoice.payment?.status === 'approved' && Date.parse(invoice.debit_date) <= Date.now()
  );
  const end = Math.max(0, ...valid.map(invoice => endOfPeriod(invoice.debit_date, subscription.billing_cycle)));
  return end ? new Date(end).toISOString() : null;
}

export async function syncSubscription(cfg, subscription) {
  const id = subscription.provider_subscription_id;
  if (!id) return subscription;
  if (!PROVIDER_ID.test(id)) throw fail(409, 'El identificador de la suscripción no es válido.');
  const stamp = new Date().toISOString();
  const invoiceQuery = new URLSearchParams({ preapproval_id: id, limit: '20', sort: 'date_created:desc' });
  const [remote, invoices] = await Promise.all([mp(cfg, '/preapproval/' + id), mp(cfg, '/authorized_payments/search?' + invoiceQuery)]);
  if (remote.id !== id || remote.external_reference !== subscription.request_id || !Array.isArray(invoices.results)) {
    throw fail(409, 'Mercado Pago devolvió una suscripción distinta.');
  }
  const status = remote.status === 'canceled' ? 'cancelled' : remote.status;
  if (!known.includes(status)) throw fail(502, 'Estado de suscripción desconocido.');
  const patch = { status, paid_through: paidThrough(invoices.results, subscription), provider_synced_at: stamp, updated_at: stamp };
  const query = new URLSearchParams({
    request_id: 'eq.' + subscription.request_id, provider_subscription_id: 'eq.' + id,
    or: '(provider_synced_at.is.null,provider_synced_at.lt.' + stamp + ')'
  });
  const updated = await rest(cfg, 'institution_subscriptions?' + query, { method:'PATCH', body:patch, prefer:'return=representation' });
  return updated[0] || (await select(cfg, 'institution_subscriptions', subscriptionFields, { request_id: subscription.request_id }))[0];
}

export async function beginSubscription(cfg, request, school, user, cycle, previous) {
  const amount = prices[request.requested_plan]?.[cycle];
  if (!amount || !['monthly','annual'].includes(cycle)) throw fail(400, 'Elegí un plan y una frecuencia válidos.');
  if (!cfg.mpToken || !cfg.webhook) throw fail(503, 'El cobro de suscripciones todavía no está habilitado.');
  const current = await select(cfg, 'institution_subscriptions', 'request_id', { school_id: school.id }, {
    or: '(status.in.(pending,authorized,paused),paid_through.gt.' + new Date().toISOString() + ')', limit:'2'
  });
  if (current.some(row => row.request_id !== request.id)) throw fail(409, 'El colegio ya tiene otra suscripción vigente o en trámite.');
  if (previous?.provider_subscription_id) {
    const saved = await syncSubscription(cfg, previous);
    if (saved.status === 'pending' && saved.billing_cycle === cycle && checkoutUrl(saved.init_point)) return checkoutUrl(saved.init_point);
    if (saved.status === 'pending') throw fail(409, 'Cancelá el pago pendiente antes de cambiar de frecuencia.');
    if (saved.status !== 'cancelled' || Date.parse(saved.paid_through || '') > Date.now()) throw fail(409, 'La suscripción todavía está vigente.');
    // A cancelled row keeps its payment history. A new approved request can start the next plan.
    throw fail(409, 'Esta solicitud ya tuvo una suscripción. Creá una solicitud nueva para volver a contratar.');
  }
  if (previous && previous.billing_cycle !== cycle) throw fail(409, 'Ya hay una contratación iniciada con otra frecuencia.');
  if (!previous) {
    try {
      await rest(cfg, 'institution_subscriptions', { method:'POST', body:{
        request_id: request.id, school_id: school.id, user_id: user.id, plan: request.requested_plan,
        billing_cycle: cycle, amount, currency:'ARS', status:'pending'
      } });
    } catch (_) { throw fail(409, 'Ya hay una contratación en curso. Actualizá la página.'); }
  }
  const result = await mp(cfg, '/preapproval', 'POST', {
    reason: 'ColegioLibre - ' + request.requested_plan,
    external_reference: request.id,
    payer_email: request.contact_email,
    auto_recurring: { frequency: cycle === 'annual' ? 12 : 1, frequency_type:'months', transaction_amount: amount, currency_id:'ARS' },
    back_url: cfg.origin + '/instituciones?payment=return#solicitudes',
    status:'pending'
  }, 'school-' + request.id);
  const url = checkoutUrl(result.init_point);
  if (!PROVIDER_ID.test(result.id || '') || !url) throw fail(502, 'Mercado Pago no devolvió un enlace válido.');
  await rest(cfg, 'institution_subscriptions?request_id=eq.' + request.id, { method:'PATCH', body:{
    provider_subscription_id: result.id, init_point: url, updated_at: new Date().toISOString()
  } });
  return url;
}

export function signedNotification(secret, req) {
  const id = String(req.query?.['data.id'] || '');
  if (!secret || !PROVIDER_ID.test(id) && !/^\d{1,18}$/.test(id)) return null;
  const sig = Object.fromEntries(String(req.headers['x-signature'] || '').split(',').map(value => value.trim().split('=')));
  const requestId = req.headers['x-request-id'];
  if (typeof requestId !== 'string' || !/^\d{10,13}$/.test(sig.ts || '') || !/^[a-f0-9]{64}$/i.test(sig.v1 || '')) return null;
  const digest = crypto.createHmac('sha256', secret).update('id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + sig.ts + ';').digest();
  return crypto.timingSafeEqual(digest, Buffer.from(sig.v1,'hex')) ? id : null;
}
