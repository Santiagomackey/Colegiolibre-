import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setupTransferDb} from './helpers/transfer-db.mjs';
import {challenge,authorizationUrl,configuration,cookie,digest,validNonce} from '../server/mp-link.js';
import handler from '../api/mercadopago-link.js';
const ids={seller:'10000000-0000-0000-0000-000000000001',buyer:'20000000-0000-0000-0000-000000000002',other:'30000000-0000-0000-0000-000000000003',product:'40000000-0000-0000-0000-000000000004'};
test('MP linking uses PKCE, a private cookie, and read-only authorization',()=>{
 const verifier='dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
 assert.equal(challenge(verifier),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
 const url=new URL(authorizationUrl({clientId:'app',redirect:'https://www.colegiolibre.com/api/mercadopago-link'},'s'.repeat(43),verifier));
 assert.equal(url.origin,'https://auth.mercadopago.com');assert.equal(url.searchParams.get('scope'),'read');assert.equal(url.searchParams.get('code_challenge_method'),'S256');assert.equal(url.searchParams.has('client_secret'),false);
 assert.match(cookie('x'),/HttpOnly; Secure; SameSite=Lax/);assert.equal(validNonce('x'.repeat(43)),true);assert.equal(validNonce('bad'),false);
 assert.throws(()=>configuration({MERCADOPAGO_REDIRECT_URI:'http://bad.invalid/api/mercadopago-link'}));
});
test('link attempts are one-use, private, owner-bound, and cannot approve payments',async()=>{
 const db=await setupTransferDb(ids);
 try{
  await db.exec(fs.readFileSync(new URL('../database/11_mercadopago_link.sql',import.meta.url),'utf8'));
  const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role)};
  const run=async(sql,args=[])=> (await db.query(sql,args)).rows[0]?.value;
  const state='a'.repeat(64),launch='b'.repeat(64),binding='c'.repeat(64),verifier='v'.repeat(43);
  await as(ids.seller);await assert.rejects(db.query('select prepare_mp_link($1,$2,$3,$4,$5)',[ids.seller,state,launch,verifier,'web']));
  await as(ids.seller,'service_role');await db.query('select prepare_mp_link($1,$2,$3,$4,$5)',[ids.seller,state,launch,verifier,'web']);
  await assert.rejects(run('select launch_mp_link($1,$2,$3) as value',[state,'wrong',binding]),/INVALID_ATTEMPT/);
  assert.equal((await run('select launch_mp_link($1,$2,$3) as value',[state,launch,binding])).verifier,verifier);
  await assert.rejects(run('select launch_mp_link($1,$2,$3) as value',[state,launch,binding]),/INVALID_ATTEMPT/);
  await assert.rejects(run('select consume_mp_link($1,$2) as value',[state,'wrong']),/INVALID_ATTEMPT/);
  assert.equal((await run('select consume_mp_link($1,$2) as value',[state,binding])).seller_id,ids.seller);
  await assert.rejects(run('select consume_mp_link($1,$2) as value',[state,binding]),/INVALID_ATTEMPT/);
  await db.query('select complete_mp_link($1,$2,$3,$4,$5)',[state,ids.seller,'123456','Cuenta de prueba','Titular de prueba']);
  await as(ids.other);assert.equal(await run('select get_my_mp_link() as value'),null);await assert.rejects(db.query('select * from mp_account_links'));
  await assert.rejects(db.query("select save_linked_mp_alias('prueba.alias','Prueba')"),/MP_LINK_REQUIRED/);
  await as(ids.seller);assert.equal((await run('select get_my_mp_link() as value')).mp_user_id,'123456');
  await db.query("select save_linked_mp_alias('prueba.colegio','')");
  await assert.rejects(db.query("select save_my_payment_details('bank','banco.alias',null,'Titular de prueba')"));
  await as(ids.buyer);const order=await run('select start_transfer_order($1) as value',[ids.product]);const before=await run('select get_transfer_order($1) as value',[order]);assert.equal(before.payment.account_number,null);assert.equal(before.status,'payment_pending');
  await db.query("select transition_transfer_order($1,'claim_transfer')",[order]);assert.equal((await run('select get_transfer_order($1) as value',[order])).status,'awaiting_confirmation');
  // Removing a link also invalidates an in-flight callback; it cannot relink later.
  const state2='d'.repeat(64);await as(ids.seller,'service_role');await db.query('select prepare_mp_link($1,$2,$3,$4,$5)',[ids.seller,state2,launch,verifier,'app']);await run('select launch_mp_link($1,$2,$3) as value',[state2,launch,binding]);await run('select consume_mp_link($1,$2) as value',[state2,binding]);
  await as(ids.seller);await db.query('select remove_my_mp_link()');assert.equal(await run('select get_my_mp_link() as value'),null);
  await as(ids.seller,'service_role');await assert.rejects(db.query('select complete_mp_link($1,$2,$3,$4,$5)',[state2,ids.seller,'999','Other','Other']),/INVALID_ATTEMPT/);
  await as(ids.buyer);assert.equal((await run('select get_transfer_order($1) as value',[order])).payment.alias,'prueba.colegio');
 }finally{await db.close()}
});
test('OAuth server binds verified seller identity and never returns or persists provider tokens',async()=>{
 const keys=['MERCADOPAGO_CLIENT_ID','MERCADOPAGO_CLIENT_SECRET','MERCADOPAGO_REDIRECT_URI','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const saved=globalThis.fetch;
 Object.assign(process.env,{MERCADOPAGO_CLIENT_ID:'test-app',MERCADOPAGO_CLIENT_SECRET:'private-test-secret',MERCADOPAGO_REDIRECT_URI:'https://www.colegiolibre.com/api/mercadopago-link',SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-test'});
 const calls=[];let prepared;
 const response=body=>({ok:true,json:async()=>body});
 globalThis.fetch=async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):null;calls.push({url,body});
  if(url.endsWith('/auth/v1/user'))return response({id:ids.seller});
  if(url.endsWith('/prepare_mp_link')){prepared=body;return response(null)}
  if(url.endsWith('/launch_mp_link'))return response({verifier:prepared.p_verifier});
  if(url.endsWith('/consume_mp_link'))return response({seller_id:ids.seller,verifier:prepared.p_verifier,source:'web'});
  if(url.endsWith('/oauth/token'))return response({access_token:'private-access',refresh_token:'private-refresh',user_id:123456});
  if(url.endsWith('/users/me'))return response({id:123456,first_name:'Titular',last_name:'Prueba'});
  if(url.endsWith('/complete_mp_link'))return response(null);
  throw Error('Unexpected URL');
 };
 const res=()=>({headers:{},status(value){this.code=value},setHeader(k,v){this.headers[k]=v},end(value){this.body=value?JSON.parse(value):null}});
 try{
  const start=res();await handler({method:'POST',headers:{authorization:'Bearer session.jwt'},body:{source:'web'}},start);assert.equal(start.code,200);
  const url=new URL(start.body.url);assert.equal(prepared.p_seller_id,ids.seller);assert.equal(prepared.p_state_hash,digest(url.searchParams.get('state')));
  const launched=res();await handler({method:'GET',url:url.pathname+url.search,headers:{}},launched);assert.equal(launched.code,303);assert.match(launched.headers.Location,/auth.mercadopago.com/);
  const cookieHeader=launched.headers['Set-Cookie'].split(';')[0];const returned=res();await handler({method:'GET',url:'/api/mercadopago-link?state='+url.searchParams.get('state')+'&code=one-use-code',headers:{cookie:cookieHeader}},returned);
  assert.equal(returned.code,303);assert.match(returned.headers.Location,/mp_link=linked/);
  const complete=calls.find(call=>call.url.endsWith('/complete_mp_link'));assert.equal(complete.body.p_seller_id,ids.seller);assert.equal(complete.body.p_mp_user_id,'123456');
  assert.equal(JSON.stringify(complete).includes('private-access'),false);assert.equal(JSON.stringify(returned).includes('private-access'),false);assert.equal(JSON.stringify(complete).includes('private-refresh'),false);
 }finally{globalThis.fetch=saved;for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];}
});
