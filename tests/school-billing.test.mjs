import test from 'node:test';
import assert from 'node:assert/strict';
import { beginSubscription, notifyRejectedRenewal, paidThrough, syncSubscription } from '../server/school-billing.js';
import { active } from '../server/school-portal.js';

const request = { id:'56087add-3971-44c2-8728-9a3f66a596f5', requested_plan:'Institucional', contact_email:'school@example.com' };
const school = { id:'8fc20ab6-14c6-4d5b-8670-0fea2b36a81f' };
const user = { id:'09170f7c-62f0-4ac6-af96-1b8074e2cba9' };
const cfg = { mpToken:'test-collector-fixture', webhook:'fixture', origin:'https://www.colego.com.ar', supabase:'https://school-fixture.example', key:'fixture' };
const providerId = 'subscription-fixture';
const checkout = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_id=${providerId}`;
const subscription = {
  request_id:request.id, school_id:school.id, user_id:user.id, provider_subscription_id:providerId,
  status:'pending', amount:24900, currency:'ARS', billing_cycle:'monthly'
};

test('starts a school checkout with the platform account and persists one shareable checkout URL', async t => {
  let winningCheckout = false;
  t.mock.method(globalThis,'fetch',async (input,options) => {
    const url = new URL(input);
    const method = options.method;
    if (url.hostname === 'api.mercadopago.com') {
      assert.equal(url.pathname,'/preapproval');
      assert.equal(options.headers.Authorization,'Bearer ' + cfg.mpToken);
      assert.equal(options.headers['X-Idempotency-Key'],'school-' + request.id);
      const body = JSON.parse(options.body);
      assert.equal(body.external_reference,request.id);
      assert.equal(body.auto_recurring.frequency,12);
      assert.equal(body.auto_recurring.transaction_amount,199000);
      assert.equal(body.status,'pending');
      assert.equal(new URL(body.back_url).searchParams.get('request_id'),request.id);
      return Response.json({id:providerId,init_point:checkout});
    }
    if (method === 'POST') {
      assert.equal(JSON.parse(options.body).status,'pending');
      return new Response(null,{status:201});
    }
    if (method === 'PATCH') {
      assert.equal(url.searchParams.get('provider_subscription_id'),'is.null');
      return Response.json(winningCheckout ? [] : [subscription]);
    }
    return Response.json(winningCheckout ? [{...subscription,init_point:checkout}] : []);
  });
  assert.equal(await beginSubscription(cfg,request,school,user,'annual'),checkout);
  winningCheckout = true;
  assert.equal(await beginSubscription(cfg,request,school,user,'annual'),checkout);
});

test('authorization alone keeps the portal locked until a matching ARS charge is accredited', async t => {
  let invoice;
  t.mock.method(globalThis,'fetch',async (input,options) => {
    const url = new URL(input);
    if (url.pathname === '/preapproval/' + providerId) {
      return Response.json({id:providerId,external_reference:request.id,status:'authorized'});
    }
    if (url.pathname === '/authorized_payments/search') {
      assert.equal(url.searchParams.get('preapproval_id'),providerId);
      return Response.json({results:invoice ? [invoice] : []});
    }
    assert.equal(options.method,'PATCH');
    return Response.json([{...subscription,...JSON.parse(options.body)}]);
  });
  assert.equal(active(await syncSubscription(cfg,subscription)),false);
  invoice = {
    preapproval_id:providerId,currency_id:'ARS',transaction_amount:'24900.00',
    debit_date:new Date(Date.now()-60000).toISOString(),payment:{status:'approved',status_detail:'accredited'}
  };
  assert.equal(paidThrough([{...invoice,currency_id:'USD'}],subscription),null);
  assert.equal(paidThrough([{...invoice,transaction_amount:'1.00'}],subscription),null);
  assert.equal(paidThrough([{...invoice,payment:{status:'refunded'}}],subscription),null);
  assert.equal(active(await syncSubscription(cfg,subscription)),true);
});

test('monthly renewal extends access once per approved installment, including after a retry', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-03-01T15:00:00Z'));
  const first = {preapproval_id:providerId, currency_id:'ARS', transaction_amount:24900, debit_date:'2026-01-28T14:00:00Z', payment:{status:'approved'}};
  const renewal = {...first, debit_date:'2026-02-28T14:00:00Z', payment:{status:'rejected'}};
  let remoteStatus = 'authorized';
  t.mock.method(globalThis,'fetch',async (input,options) => {
    const url = new URL(input);
    if (url.pathname.startsWith('/preapproval/')) return Response.json({id:providerId,external_reference:request.id,status:remoteStatus,next_payment_date:'2026-03-28T14:00:00Z'});
    if (url.pathname.endsWith('/search')) {
      const offset = Number(url.searchParams.get('offset') || 0);
      return Response.json({paging:{total:2,offset},results:[offset ? renewal : first]});
    }
    return Response.json([{...subscription,...JSON.parse(options.body)}]);
  });
  const failed = await syncSubscription(cfg,subscription);
  assert.equal(failed.renewalFailed,true);
  assert.equal(active(failed),false);
  renewal.payment.status = 'approved';
  const paid = await syncSubscription(cfg,subscription);
  assert.equal(active(paid),true);
  assert.equal(paid.paid_through,'2026-03-28T14:00:00.000Z');
  assert.equal(paid.nextPaymentDate,'2026-03-28T14:00:00Z');
  remoteStatus = 'cancelled';
  const cancelled = await syncSubscription(cfg,paid);
  assert.equal(cancelled.nextPaymentDate,null);
  assert.equal(cancelled.paid_through,paid.paid_through);
  assert.equal(active(cancelled),true);
});

test('repeated rejected charge events use the same owner notification key',async t => {
  const notices = [];
  t.mock.method(globalThis,'fetch',async (input,opts) => {
    assert.match(String(input),/notifications\?on_conflict=id/);
    assert.equal(opts.headers.Prefer,'resolution=ignore-duplicates');
    notices.push(JSON.parse(opts.body));
    return new Response(null,{status:201});
  });
  const plan = {...subscription,paid_through:'2026-02-28'};
  const invoice = {id:'12345',preapproval_id:providerId,currency_id:'ARS',transaction_amount:24900,payment:{status:'rejected'}};
  await notifyRejectedRenewal(cfg,plan,invoice);
  await notifyRejectedRenewal(cfg,plan,invoice);
  assert.equal(notices.length,2);
  assert.equal(notices[0].user_id,user.id);
  assert.equal(notices[0].id,notices[1].id);
  await notifyRejectedRenewal(cfg,plan,{...invoice,payment:{status:'approved'}});
  assert.equal(notices.length,2);
});
