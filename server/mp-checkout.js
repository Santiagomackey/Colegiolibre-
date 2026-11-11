import crypto from 'node:crypto';
import { configuration } from './mp-link.js';

const PROVIDER = 'https://api.mercadopago.com';
const PROVIDER_ID = /^ORD[A-Za-z0-9]{6,70}$/;
export const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export function checkoutConfig(env = process.env) {
  if (env.MERCADOPAGO_CHECKOUT_ENABLED !== '1') return null;
  const encryption = env.MERCADOPAGO_CHECKOUT_KEY?.trim();
  const webhook = env.MERCADOPAGO_ORDERS_WEBHOOK_SECRET?.trim();
  if (!/^[a-f0-9]{64}$/i.test(encryption || '') || !webhook) throw Error('MP_CHECKOUT_NOT_CONFIGURED');
  return { ...configuration(env), encryption: Buffer.from(encryption, 'hex'), webhook };
}

export function encryptToken(config, seller, token) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.encryption, iv);
  cipher.setAAD(Buffer.from(seller));
  const data = Buffer.concat([cipher.update(JSON.stringify(token), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(part => part.toString('base64url')).join('.');
}

function decryptToken(config, seller, encrypted) {
  const [iv, tag, data] = encrypted.split('.').map(part => Buffer.from(part, 'base64url'));
  const cipher = crypto.createDecipheriv('aes-256-gcm', config.encryption, iv);
  cipher.setAAD(Buffer.from(seller));
  cipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]));
}

async function storage(config, path, { body, method = 'GET', headers = {} } = {}) {
  const response = await fetch(config.supabase + '/rest/v1/' + path, {
    method, headers: { apikey: config.key, Authorization: 'Bearer ' + config.key,
      'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(8000)
  });
  const payload = await response.text();
  const value = payload ? JSON.parse(payload) : null;
  if (!response.ok) throw Error(value?.message || 'MP_STORAGE_ERROR');
  return value;
}

const rpc = (config, name, body) => storage(config, 'rpc/' + name, { method: 'POST', body });
async function row(config, table, fields, filters) {
  const query = new URLSearchParams({ select: fields, limit: '1' });
  for (const [key, value] of Object.entries(filters)) query.set(key, 'eq.' + value);
  return (await storage(config, table + '?' + query))[0] || null;
}

export async function available(config, productId) {
  const product = await row(config, 'products', 'user_id,status,moderation_status', { id: productId });
  if (!product?.user_id || (product.status || 'available') !== 'available' ||
      (product.moderation_status || 'approved') !== 'approved') return false;
  return linked(config, product.user_id);
}

export async function linked(config, sellerId) {
  const account = await row(config, 'mp_checkout_credentials', 'encrypted_token,mp_user_id', { seller_id: sellerId });
  if (!account) return false;
  const token = decryptToken(config, sellerId, account.encrypted_token);
  return Boolean(token.refresh || token.expiresAt > Date.now()) &&
    Boolean(await row(config, 'mp_account_links', 'seller_id', { seller_id: sellerId, mp_user_id: account.mp_user_id }));
}

async function sellerToken(config, order) {
  const filters = { seller_id: order.seller_id, mp_user_id: order.mp_user_id };
  const account = await row(config, 'mp_checkout_credentials', 'encrypted_token', filters);
  if (!account) throw Error('MP_SELLER_NOT_LINKED');
  const token = decryptToken(config, order.seller_id, account.encrypted_token);
  if (token.expiresAt > Date.now() + 60000) return token.access;
  if (!token.refresh) throw Error('MP_SELLER_RECONNECT');

  const lock = crypto.randomUUID();
  const now = new Date().toISOString();
  const query = new URLSearchParams({
    seller_id: 'eq.' + order.seller_id, mp_user_id: 'eq.' + order.mp_user_id,
    encrypted_token: 'eq.' + account.encrypted_token,
    or: '(refresh_until.is.null,refresh_until.lt.' + now + ')'
  });
  const claimed = await storage(config, 'mp_checkout_credentials?' + query, {
    method: 'PATCH', headers: { Prefer: 'return=representation' },
    body: { refresh_lock: lock, refresh_until: new Date(Date.now() + 45000).toISOString() }
  });
  if (!claimed.length) throw Error('MP_PROVIDER_UNAVAILABLE');
  const release = 'mp_checkout_credentials?refresh_lock=eq.' + lock;
  try {
    const response = await fetch(PROVIDER + '/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', client_id: config.clientId,
        client_secret: config.clientSecret, refresh_token: token.refresh }),
      signal: AbortSignal.timeout(10000)
    });
    const fresh = await response.json();
    if (!response.ok) throw Error(fresh.error === 'invalid_grant' ? 'MP_SELLER_RECONNECT' : 'MP_PROVIDER_UNAVAILABLE');
    if (!fresh.access_token || !fresh.refresh_token || !(Number(fresh.expires_in) > 0) ||
        String(fresh.user_id) !== order.mp_user_id) throw Error('MP_ORDER_MISMATCH');
    const updated = await storage(config, release, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: { refresh_lock: null, refresh_until: null, encrypted_token: encryptToken(config, order.seller_id, {
        access: fresh.access_token, refresh: fresh.refresh_token, expiresAt: Date.now() + Number(fresh.expires_in) * 1000
      }) }
    });
    if (!updated.length) throw Error('MP_PROVIDER_UNAVAILABLE');
    return fresh.access_token;
  } catch (error) {
    await storage(config, release, { method: 'PATCH', body: { refresh_lock: null, refresh_until: null } }).catch(() => {});
    throw error;
  }
}

async function provider(config, order, operation, path, body, idempotency) {
  const access = await sellerToken(config, order);
  const headers = { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json' };
  if (idempotency) headers['X-Idempotency-Key'] = idempotency;
  const response = await fetch(PROVIDER + path, {
    method: operation, headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw Error(response.status === 401 ? 'MP_SELLER_RECONNECT' : 'MP_PROVIDER_UNAVAILABLE');
  return response.json();
}

async function localOrder(config, orderId, userId) {
  const order = await row(config, 'purchase_orders', 'id,buyer_id,seller_id,amount,product_title,status,payment_provider', { id: orderId });
  if (!order || (userId && ![order.buyer_id, order.seller_id].includes(userId))) throw Error('ORDER_NOT_FOUND');
  if (order.payment_provider !== 'mercado_pago') return order;
  const checkout = await row(config, 'mp_checkout_orders', 'provider_id,provider_state,mp_user_id,checkout_url', { order_id: orderId });
  if (!checkout) throw Error('ORDER_NOT_FOUND');
  return { ...order, ...checkout };
}

export function hostedUrl(raw) {
  const url = new URL(raw);
  if (url.origin !== 'https://www.mercadopago.com.ar' || url.username || url.password ||
      !url.pathname.startsWith('/checkout/')) throw Error('MP_INVALID_REDIRECT');
  return url.href;
}

function amount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1e10) throw Error('MP_INVALID_AMOUNT');
  return parsed.toFixed(2);
}

export function verifyOrder(order, remote) {
  if (!PROVIDER_ID.test(remote?.id || '') ||
      (order.provider_id && order.provider_id !== remote.id) ||
      remote.external_reference !== order.id || remote.country_code !== 'ARG' ||
      String(remote.user_id) !== order.mp_user_id ||
      (remote.currency && remote.currency !== 'ARS') ||
      (remote.currency_id && remote.currency_id !== 'ARS') ||
      amount(remote.total_amount) !== amount(order.amount) ||
      !Number.isFinite(Date.parse(remote.last_updated_date))) throw Error('MP_ORDER_MISMATCH');
  if (remote.status === 'processed' && remote.status_detail === 'accredited') {
    if (amount(remote.total_paid_amount) !== amount(order.amount)) throw Error('MP_ORDER_MISMATCH');
    return 'accredited';
  }
  if (remote.status === 'refunded') return 'refunded';
  if (remote.status_detail === 'partially_refunded') return 'partially_refunded';
  if (['canceled', 'expired'].includes(remote.status)) return 'canceled';
  if (['created', 'failed'].includes(remote.status)) return remote.status;
  return 'processing';
}

async function apply(config, order, remote) {
  const state = verifyOrder(order, remote);
  await rpc(config, 'apply_mp_checkout_state', {
    p_order_id: order.id, p_provider_id: remote.id, p_state: state, p_modified: remote.last_updated_date,
    p_checkout_url: remote.checkout_url ? hostedUrl(remote.checkout_url) : null
  });
  return state;
}

export async function start(config, productId, user) {
  const id = await rpc(config, 'start_mp_checkout', { p_product_id: productId, p_buyer_id: user.id });
  return resume(config, id, user);
}

export async function resume(config, id, user) {
  const order = await localOrder(config, id, user.id);
  if (order.buyer_id !== user.id) throw Error('ORDER_NOT_FOUND');
  if (order.payment_provider !== 'mercado_pago' || order.status !== 'payment_pending') return { orderId: id };
  const back = config.origin + '/compra?id=' + id;
  const total = amount(order.amount);
  const remote = order.provider_id
    ? await provider(config, order, 'GET', '/v1/orders/' + order.provider_id)
    : await provider(config, order, 'POST', '/v1/orders', {
      type: 'online', processing_mode: 'manual', capture_mode: 'automatic',
      total_amount: total, external_reference: id, expiration_time: 'PT30M',
      items: [{ title: order.product_title.slice(0, 120), quantity: 1, unit_price: total }],
      config: { online: { success_url: back, pending_url: back, failure_url: back, auto_return: 'all', retries: { allowed: true } } }
    }, id);
  const state = await apply(config, order, remote);
  const url = remote.checkout_url || order.checkout_url;
  return { orderId: id, url: ['created', 'failed'].includes(state) && url ? hostedUrl(url) : null };
}

export async function synchronize(config, id, user, cancel = false) {
  const order = await localOrder(config, id, user?.id);
  if (order.payment_provider !== 'mercado_pago') throw Error('ORDER_NOT_FOUND');
  if (!order.provider_id) {
    if (cancel) throw Error('MP_CANNOT_CANCEL');
    return { state: 'created' };
  }
  const path = '/v1/orders/' + order.provider_id;
  if (cancel) {
    if (order.status !== 'payment_pending' || !user) throw Error('MP_CANNOT_CANCEL');
    try {
      await provider(config, order, 'POST', path + '/cancel', undefined, 'cancel-' + id);
    } catch (error) {
      if (error.message !== 'MP_PROVIDER_UNAVAILABLE') throw error;
    }
  }
  const remote = await provider(config, order, 'GET', path);
  const state = await apply(config, order, remote);
  if (cancel && state !== 'canceled') throw Error('MP_CANNOT_CANCEL');
  return { state };
}

export function verifiedNotification(config, req) {
  const id = String(req.query?.['data.id'] || '');
  if (!PROVIDER_ID.test(id)) return null;
  const signature = Object.fromEntries(String(req.headers['x-signature'] || '').split(',')
    .map(part => part.trim().split('=')));
  const requestId = req.headers['x-request-id'];
  if (typeof requestId !== 'string' || !/^\d{10,13}$/.test(signature.ts || '') ||
      !/^[a-f0-9]{64}$/i.test(signature.v1 || '')) return null;
  const digest = crypto.createHmac('sha256', config.webhook)
    .update('id:' + id.toLowerCase() + ';request-id:' + requestId + ';ts:' + signature.ts + ';')
    .digest();
  return crypto.timingSafeEqual(digest, Buffer.from(signature.v1, 'hex')) ? id : null;
}

export async function reconcileNotification(config, providerId) {
  const order = await row(config, 'mp_checkout_orders', 'order_id', { provider_id: providerId });
  if (!order) return false;
  await synchronize(config, order.order_id);
  return true;
}
