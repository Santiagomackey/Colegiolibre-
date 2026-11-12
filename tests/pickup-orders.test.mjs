import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setupTransferDb } from './helpers/transfer-db.mjs';

const ids = {
 seller: '10000000-0000-0000-0000-000000000001',
 buyer: '20000000-0000-0000-0000-000000000002',
 other: '30000000-0000-0000-0000-000000000003',
 product: '40000000-0000-0000-0000-000000000004'
};

test('pickup works without payout details and restricts payment actions by participant and state', async () => {
 const db = await setupTransferDb(ids);
 const as = async id => {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
 };
 const value = async (sql,args=[]) => (await db.query(sql,args)).rows[0]?.value;
 const view = id => value('select get_transfer_order($1) as value',[id]);
 const reserve = () => value('select start_pickup_order($1) as value',[ids.product]);
 const action = (id,next) => db.query('select transition_transfer_order($1,$2)',[id,next]);
 const attach = (id,url) => db.query('select save_pickup_order_link($1,$2)',[id,url]);
 const reveal = id => value('select open_pickup_order_link($1) as value',[id]);
 const url = 'https://mpago.la/ABC1234';
 try {
  for (const migration of ['11_mercadopago_link','12_mercadopago_checkout','13_pickup_checkout']) {
   await db.exec(fs.readFileSync(new URL('../database/'+migration+'.sql',import.meta.url),'utf8'));
  }
  await as(ids.buyer);
  assert.equal(await value('select pickup_checkout_ready() as value'),true);
  await assert.rejects(value('select start_transfer_order($1) as value',[ids.product]),/PAYMENT_DETAILS_MISSING/);
  const first = await reserve();
  assert.equal(await reserve(),first);
  assert.equal((await view(first)).payment_provider,'pickup');
  assert.equal((await view(first)).payment,null);
  await assert.rejects(action(first,'confirm_received'),/SELLER_ONLY/);
  await assert.rejects(attach(first,url),/ORDER_NOT_FOUND/);
  await assert.rejects(reveal(first),/PICKUP_LINK_MISSING/);
  await as(ids.other);
  await assert.rejects(reserve(),/PRODUCT_IN_CHECKOUT/);
  await assert.rejects(view(first),/ORDER_NOT_FOUND/);
  await assert.rejects(reveal(first),/ORDER_NOT_FOUND/);
  await as(ids.seller);
  for (const invalid of ['http://mpago.la/ABC1234','https://mpago.la.evil.test/ABC1234','https://mpago.la/ABC1234?x=y']) {
   await assert.rejects(attach(first,invalid),/INVALID_PICKUP_LINK/);
  }
  await attach(first,url);
  await attach(first,url);
  await assert.rejects(attach(first,'https://mpago.la/XYZ1234'),/PICKUP_LINK_ALREADY_SHARED/);
  await assert.rejects(reveal(first),/ORDER_NOT_FOUND/);
  await as(ids.buyer);
  assert.equal((await view(first)).pickup_link_ready,true);
  assert.equal(JSON.stringify(await view(first)).includes(url),false);
  await assert.rejects(db.query('select url from pickup_order_links'),/permission denied/);
  await assert.rejects(action(first,'claim_pickup_link_payment'),/INVALID_ACTION/);
  assert.equal(await reveal(first),url);
  assert.equal((await view(first)).pickup_link_opened,true);
  await assert.rejects(action(first,'cancel'),/PICKUP_LINK_CANCEL_REQUIRED/);
  await assert.rejects(action(first,'cancel_pickup_link'),/SELLER_ONLY/);
  await as(ids.seller);
  await action(first,'cancel_pickup_link');
  assert.equal((await view(first)).status,'cancelled');
  await as(ids.buyer);
  await assert.rejects(reveal(first),/INVALID_ORDER_STATE/);
  const second = await reserve();
  assert.notEqual(first,second);
  await as(ids.seller);
  await assert.rejects(attach(second,url),/PICKUP_LINK_IN_USE/);
  const secondLink='https://mpago.la/ABC5678';
  await attach(second,secondLink);
  await as(ids.buyer);
  assert.equal(await reveal(second),secondLink);
  await action(second,'claim_pickup_link_payment');
  assert.equal((await view(second)).status,'awaiting_confirmation');
  await assert.rejects(reveal(second),/INVALID_ORDER_STATE/);
  await as(ids.seller);
  await action(second,'confirm_received');
  await as(ids.buyer);
  await action(second,'confirm_delivered');
  assert.equal((await view(second)).status,'delivered');

  await db.exec('reset role');
  const otherProduct = '40000000-0000-0000-0000-000000000005';
  await db.query("insert into products values($1,$2,'Otro libro',250,'available','approved',null)",[otherProduct,ids.seller]);
  await as(ids.buyer);
  const atPickup = await value('select start_pickup_order($1) as value',[otherProduct]);
  await as(ids.seller);
  await action(atPickup,'confirm_received');
  assert.equal((await view(atPickup)).status,'paid');
  await db.exec('reset role');
  assert.equal(await value('select status as value from products where id=$1',[otherProduct]),'sold');
 } finally {
  await db.close();
 }
});
