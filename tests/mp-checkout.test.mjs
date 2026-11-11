import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { setupTransferDb } from './helpers/transfer-db.mjs';
import { checkoutConfig, encryptToken, hostedUrl, resume, verifyOrder, verifiedNotification } from '../server/mp-checkout.js';

const ids = {
 seller: '10000000-0000-0000-0000-000000000001', buyer: '20000000-0000-0000-0000-000000000002',
 other: '30000000-0000-0000-0000-000000000003', product: '40000000-0000-0000-0000-000000000004'
};
const remote = {
 id: 'ORD12345678', user_id: '111', country_code: 'ARG', currency: 'ARS', external_reference: ids.product,
 total_amount: '1250.50', total_paid_amount: '1250.50', status: 'processed', status_detail: 'accredited',
 last_updated_date: '2026-11-11T11:00:00.000Z'
};

test('Checkout Pro verifies provider origin, order identity, seller, amount and notification signature', () => {
 const order = { id: ids.product, amount: 1250.50, mp_user_id: '111', provider_id: remote.id };
 assert.equal(checkoutConfig({}), null);
 assert.equal(verifyOrder(order, remote), 'accredited');
 assert.equal(verifyOrder(order, { ...remote, status: 'processing' }), 'processing');
 for (const patch of [
  { user_id: '999' }, { external_reference: ids.buyer }, { currency: 'USD' },
  { total_amount: '50.00' }, { total_paid_amount: '50.00' }, { id: 'ORD987654321' }
 ]) assert.throws(() => verifyOrder(order, { ...remote, ...patch }), /MP_ORDER_MISMATCH/);
 assert.equal(hostedUrl('https://www.mercadopago.com.ar/checkout/v1/redirect'), 'https://www.mercadopago.com.ar/checkout/v1/redirect');
 assert.throws(() => hostedUrl('https://www.mercadopago.com.ar.evil.invalid/checkout/'));
 const config = { webhook: 'test-key' };
 const ts = '1794394800000';
 const signature = crypto.createHmac('sha256', config.webhook)
   .update('id:ord12345678;request-id:request-1;ts:' + ts + ';').digest('hex');
 const req = { query: { 'data.id': remote.id }, headers: { 'x-request-id': 'request-1', 'x-signature': 'ts=' + ts + ',v1=' + signature } };
 assert.equal(verifiedNotification(config, req), remote.id);
 req.headers['x-request-id'] = 'another-request';
 assert.equal(verifiedNotification(config, req), null);
});

test('checkout uses the linked seller token, server price and an idempotent provider order', async t => {
 const config = { origin: 'https://www.colegiolibre.com', supabase: 'https://example.supabase.co', key: 'service',
   encryption: Buffer.alloc(32, 4) };
 const url = 'https://www.mercadopago.com.ar/checkout/v1/redirect?order_id=' + remote.id;
 const checkout = { provider_id: null, mp_user_id: '111' };
 const token = encryptToken(config, ids.seller, { access: 'seller-token', expiresAt: Date.now()+300000 });
 t.mock.method(globalThis, 'fetch', async (address, options) => {
  const uri = new URL(address);
  const json = value => new Response(JSON.stringify(value), { status: 200 });
  if (uri.pathname.endsWith('/purchase_orders')) return json([{ id: ids.product, buyer_id: ids.buyer,
    seller_id: ids.seller, amount: '1250.50', product_title: 'Biología', payment_provider: 'mercado_pago', status: 'payment_pending' }]);
  if (uri.pathname.endsWith('/mp_checkout_orders')) return json([checkout]);
  if (uri.pathname.endsWith('/mp_checkout_credentials')) return json([{ encrypted_token: token }]);
  if (uri.pathname === '/v1/orders') {
   assert.equal(options.headers.Authorization, 'Bearer seller-token');
   assert.equal(options.headers['X-Idempotency-Key'], ids.product);
   const body = JSON.parse(options.body);
   assert.equal(body.items[0].unit_price, '1250.50');
   assert.equal(body.config.online.success_url, config.origin + '/compra?id=' + ids.product);
   return json({ ...remote, checkout_url: url, status: 'created' });
  }
  if (uri.pathname.endsWith('/apply_mp_checkout_state')) {
   const body = JSON.parse(options.body);
   checkout.provider_id = body.p_provider_id;
   checkout.checkout_url = body.p_checkout_url;
   return new Response(null, { status: 204 });
  }
  if (uri.pathname === '/v1/orders/' + remote.id) return json({ ...remote, status: 'created' });
  assert.fail('Unexpected request to ' + uri.pathname);
 });
 await assert.rejects(resume(config, ids.product, { id: ids.other }), /ORDER_NOT_FOUND/);
 assert.deepEqual(await resume(config, ids.product, { id: ids.buyer }), { orderId: ids.product, url });
 assert.deepEqual(await resume(config, ids.product, { id: ids.buyer }), { orderId: ids.product, url });
});

test('verified provider state protects stock and rejects manual payment changes', async () => {
 const db = await setupTransferDb(ids);
 const run = async (query, args=[]) => (await db.query(query,args)).rows[0]?.value;
 const as = async (role, id='') => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.role',$1,false), set_config('request.jwt.claim.sub',$2,false)", [role,id]);
  await db.exec('set role ' + role);
 };
 try {
  for (const migration of ['11_mercadopago_link', '12_mercadopago_checkout']) {
   await db.exec(fs.readFileSync(new URL('../database/' + migration + '.sql', import.meta.url), 'utf8'));
  }
  await db.query("insert into mp_account_links(seller_id,mp_user_id,display_name) values($1,'111','Test')", [ids.seller]);
  await db.query("insert into mp_checkout_credentials(seller_id,mp_user_id,encrypted_token) values($1,'111','ciphertext')", [ids.seller]);
  await as('service_role');
  const order = await run('select start_mp_checkout($1,$2) as value',[ids.product,ids.buyer]);
  assert.equal(await run('select start_mp_checkout($1,$2) as value',[ids.product,ids.buyer]), order);
  await assert.rejects(run('select start_mp_checkout($1,$2) as value',[ids.product,ids.other]), /PRODUCT_IN_CHECKOUT/);
  await as('authenticated', ids.buyer);
  assert.equal((await run('select get_transfer_order($1) as value',[order])).payment, null);
  await assert.rejects(db.query("select transition_transfer_order($1,'claim_transfer')",[order]), /MP_PROVIDER_VERIFICATION_REQUIRED/);
  await assert.rejects(db.query('select * from mp_checkout_credentials'));
  await assert.rejects(db.query("select apply_mp_checkout_state($1,'ORD1','accredited',now(),null)",[order]), /permission denied/);
  await as('authenticated', ids.other);
  await assert.rejects(run('select start_transfer_order($1) as value',[ids.product]), /PRODUCT_IN_CHECKOUT/);
  await as('service_role');
  await db.query("select apply_mp_checkout_state($1,'ORD1','accredited',now(),null)",[order]);
  await db.query("select apply_mp_checkout_state($1,'ORD1','canceled',now()-interval '1 minute',null)",[order]);
  await as('authenticated', ids.buyer);
  assert.equal((await run('select get_transfer_order($1) as value',[order])).status, 'paid');
  await db.query("select transition_transfer_order($1,'confirm_delivered')",[order]);
  assert.equal((await run('select get_transfer_order($1) as value',[order])).status, 'delivered');
 } finally { await db.close(); }
});
