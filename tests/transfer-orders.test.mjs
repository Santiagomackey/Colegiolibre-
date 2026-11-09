import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const ids={seller:'10000000-0000-0000-0000-000000000001',buyer:'20000000-0000-0000-0000-000000000002',other:'30000000-0000-0000-0000-000000000003',product:'40000000-0000-0000-0000-000000000004'};
test('direct transfer orders enforce privacy, snapshots and seller-only payment confirmation in PostgreSQL',async t=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 create table auth.users(id uuid primary key);
 create table public.profiles(id uuid primary key,name text,account_status text,moderation_restriction_until timestamptz);
 create table public.products(id uuid primary key,user_id uuid,title text,price numeric,status text,moderation_status text,reserved_for uuid);
 create table public.conversations(id uuid primary key default gen_random_uuid(),product_id uuid,buyer_id uuid,seller_id uuid,unique(product_id,buyer_id,seller_id));
 create table public.notifications(id uuid default gen_random_uuid(),user_id uuid,actor_id uuid,type text,title text,body text,product_id uuid,action_url text,metadata jsonb);
 grant select,update on public.products to authenticated;
 insert into auth.users values('${ids.seller}'),('${ids.buyer}'),('${ids.other}');
 insert into profiles(id,account_status) select id,'active' from auth.users;
 insert into products values('${ids.product}','${ids.seller}','Libro de Matemática',1250.50,'available','approved',null);`);
 await db.exec(fs.readFileSync(new URL('../database/10_direct_transfer_orders.sql',import.meta.url),'utf8'));
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated')};
 const rpc=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.value;
 await as(ids.seller);
 await assert.rejects(db.query("select save_my_payment_details('bank','bad','123','A')"));
 await db.query("select save_my_payment_details('mercado_pago','libros.santi','0000003100012345678901','Santiago Pérez')");
 await as(ids.buyer);
 assert.equal(await rpc('select get_my_payment_details() as value'),null);
 const order=await rpc('select start_transfer_order($1) as value',[ids.product]);
 assert.equal(await rpc('select start_transfer_order($1) as value',[ids.product]),order);
 await t.test('private details are available only to the actual order participants',async()=>{
  await assert.rejects(db.query('select * from seller_payment_details'));
  await assert.rejects(db.query('select * from order_payment_instructions'));
  const checkout=await rpc('select get_transfer_order($1) as value',[order]);assert.equal(checkout.payment.alias,'libros.santi');assert.equal(checkout.amount,1250.50);assert.ok(checkout.conversation_id);
  await as(ids.other);await assert.rejects(rpc('select get_transfer_order($1) as value',[order]),/ORDER_NOT_FOUND/);await assert.rejects(rpc('select start_transfer_order($1) as value',[ids.product]),/PRODUCT_IN_CHECKOUT/);
 });
 await t.test('price and payment instructions remain fixed when the seller changes settings',async()=>{
  await as(ids.seller);await db.query("select save_my_payment_details('bank','nueva.cuenta','0000003100098765432109','Santiago Pérez')");
  await db.query('update products set price=9000 where id=$1',[ids.product]);
  await assert.rejects(db.query("update products set status='reserved' where id=$1",[ids.product]),/PRODUCT_IN_CHECKOUT/);
  await as(ids.buyer);const checkout=await rpc('select get_transfer_order($1) as value',[order]);assert.equal(checkout.amount,1250.50);assert.equal(checkout.payment.alias,'libros.santi');
 });
 await t.test('buyer claims cannot approve payment, skip stages, or write protected rows',async()=>{
  await assert.rejects(db.query("update purchase_orders set status='paid' where id=$1",[order]));
  await assert.rejects(db.query("select transition_transfer_order($1,'confirm_received')",[order]),/SELLER_ONLY/);
  await assert.rejects(db.query("select transition_transfer_order($1,'confirm_delivered')",[order]),/INVALID_ORDER_STATE/);
  await db.query("select transition_transfer_order($1,'claim_transfer')",[order]);
  assert.equal((await rpc('select get_transfer_order($1) as value',[order])).status,'awaiting_confirmation');
  await db.query("select transition_transfer_order($1,'claim_transfer')",[order]);
  await assert.rejects(db.query("select transition_transfer_order($1,'confirm_received')",[order]),/SELLER_ONLY/);
  await assert.rejects(db.query("select transition_transfer_order($1,'cancel')",[order]),/CANNOT_CANCEL_AFTER_TRANSFER/);
 });
 await t.test('only seller confirmation marks paid, hides transfer details and notifies buyer',async()=>{
  await as(ids.seller);await db.query("select transition_transfer_order($1,'confirm_received')",[order]);
  const paid=await rpc('select get_transfer_order($1) as value',[order]);assert.equal(paid.status,'paid');assert.equal(paid.payment,null);
  await assert.rejects(db.query("select transition_transfer_order($1,'confirm_delivered')",[order]),/BUYER_ONLY/);
  await as(ids.buyer);await db.query("select transition_transfer_order($1,'confirm_delivered')",[order]);
  const done=await rpc('select get_transfer_order($1) as value',[order]);assert.equal(done.status,'delivered');assert.equal(done.payment,null);
  await db.exec('reset role');const notices=(await db.query('select type,user_id from notifications order by type')).rows;
  assert.deepEqual(notices.map(n=>n.type),['order_delivered','payment_claim','payment_confirmed']);assert.equal(notices.find(n=>n.type==='payment_claim').user_id,ids.seller);assert.equal(notices.find(n=>n.type==='payment_confirmed').user_id,ids.buyer);
  assert.equal((await db.query('select status from products')).rows[0].status,'sold');
 });
 await t.test('cancelled checkouts release an item without granting access to the old order',async()=>{
  await db.exec('reset role');const product='50000000-0000-0000-0000-000000000005';
  await db.query("insert into products(id,user_id,title,price,status,moderation_status) values($1,$2,'Cuaderno',2000,'available','approved')",[product,ids.seller]);
  await as(ids.seller);await assert.rejects(rpc('select start_transfer_order($1) as value',[product]),/OWN_PRODUCT/);
  await as(ids.buyer);const first=await rpc('select start_transfer_order($1) as value',[product]);await db.query("select transition_transfer_order($1,'cancel')",[first]);
  await as(ids.other);const second=await rpc('select start_transfer_order($1) as value',[product]);assert.notEqual(first,second);
  await assert.rejects(rpc('select get_transfer_order($1) as value',[first]),/ORDER_NOT_FOUND/);
  await as(ids.seller);await assert.rejects(db.query("select transition_transfer_order($1,'confirm_received')",[second]),/INVALID_ORDER_STATE/);
  await db.exec('reset role');await db.exec('set role anon');await assert.rejects(rpc('select get_my_payment_details() as value'));
 });
 }finally{await db.close()}
});
