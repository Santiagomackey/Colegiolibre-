import { authenticatedUser } from '../server/mp-link.js';
import { available, checkoutConfig, linked, reconcileNotification, resume, start, synchronize, UUID, verifiedNotification } from '../server/mp-checkout.js';

function send(res, status, data) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(data));
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (!['GET', 'POST'].includes(req.method)) return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  let config;
  try { config = checkoutConfig(); }
  catch { return send(res, 503, { error: 'MP_CHECKOUT_NOT_CONFIGURED' }); }
  if (!config) return req.method === 'GET'
    ? send(res, 200, { enabled: false, available: false })
    : send(res, 503, { error: 'MP_CHECKOUT_NOT_CONFIGURED' });
  try {
    if (req.method === 'POST' && req.query?.webhook === '1') {
      const id = verifiedNotification(config, req);
      if (!id) return send(res, 401, { error: 'INVALID_SIGNATURE' });
      return send(res, await reconcileNotification(config, id) ? 200 : 503, {});
    }
    const user = await authenticatedUser(config, req);
    if (!user) return send(res, 401, { error: 'AUTH_REQUIRED' });
    if (req.method === 'GET') {
      if (req.query?.seller === '1') return send(res, 200, { enabled: true, linked: await linked(config, user.id) });
      const product = req.query?.product;
      if (typeof product !== 'string' || !UUID.test(product)) return send(res, 400, { error: 'INVALID_PRODUCT' });
      return send(res, 200, { enabled: true, available: await available(config, product) });
    }
    const { action, id } = req.body || {};
    if (typeof id !== 'string' || !UUID.test(id)) return send(res, 400, { error: 'INVALID_ORDER' });
    if (action === 'resume') return send(res, 200, await resume(config, id, user));
    if (action === 'start') return send(res, 200, await start(config, id, user));
    if (action === 'status' || action === 'cancel') {
      return send(res, 200, await synchronize(config, id, user, action === 'cancel'));
    }
    return send(res, 400, { error: 'INVALID_ACTION' });
  } catch (error) {
    const allowed = ['PRODUCT_IN_CHECKOUT', 'PRODUCT_UNAVAILABLE', 'OWN_PRODUCT', 'PROFILE_REQUIRED',
      'ACCOUNT_RESTRICTED', 'ORDER_NOT_FOUND', 'MP_SELLER_NOT_LINKED', 'MP_SELLER_RECONNECT', 'MP_CANNOT_CANCEL'];
    const code = allowed.includes(error.message) ? error.message : 'MP_CHECKOUT_UNAVAILABLE';
    return send(res, code === 'ORDER_NOT_FOUND' ? 404 : allowed.includes(code) ? 409 : 503, { error: code });
  }
}
