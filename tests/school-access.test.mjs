import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import portalApi from '../api/school-portal.js';
import { safePushPath } from '../server/push-payload.js';

test('school manager reviews two independent families and sends one scoped approval', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  const [school,manager,first,second] = [1,2,3,4].map(n=>'00000000-0000-4000-8000-00000000000'+n);
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create schema auth; create table auth.users(id uuid primary key);create table schools(id uuid primary key);
    create table notifications(user_id uuid,actor_id uuid,type text,title text,body text,action_url text);
    insert into schools values('${school}');insert into auth.users values('${manager}'),('${first}'),('${second}');`);
  await db.exec(await readFile(new URL('../database/19_school_access_requests.sql',import.meta.url),'utf8'));
  for (const role of ['anon','authenticated']) {
    const result = await db.query("select has_table_privilege($1,'school_portal_access_requests','select') allowed",[role]);
    assert.equal(result.rows[0].allowed,false);
  }
  const env = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous = env.map(k => process.env[k]);
  t.after(()=>env.forEach((k,i)=>previous[i] === undefined ? delete process.env[k] : process.env[k]=previous[i]));
  process.env.SUPABASE_URL='https://school.example';
  process.env.SUPABASE_SERVICE_ROLE_KEY='test';
  let actor,profileCode='A1';
  t.mock.method(globalThis,'fetch',async (raw,options) => {
    const url=new URL(raw), table=url.pathname.split('/').at(-1), q=url.searchParams;
    const body=options.body && JSON.parse(options.body);
    let rows;
    switch(table) {
      case 'user': rows={id:actor,email:actor+'@example.org',email_confirmed_at:'2026-01-01'}; break;
      case 'schools': rows=q.has('id') ? [] : [{id:school,code:'A1',name:'Escuela Uno'}]; break;
      case 'profiles': rows=[{name:'Familia',school_code:profileCode}]; break;
      case 'school_admins': rows=actor===manager ? [{school_code:'A1'}] : []; break;
      case 'school_portal_members': rows=[]; break;
      case 'institution_requests': rows=[{id:'plan',requested_plan:'Institucional'}]; break;
      case 'institution_subscriptions': rows=[{paid_through:'2099-01-01'}]; break;
      case 'school_portal_content': rows=[{published_at:'2026-01-01',published:{membershipMode:'verified'}}]; break;
      case 'school_portal_access_requests':
        if (body) {
          await db.query('insert into school_portal_access_requests(school_id,user_id,name,email) values($1,$2,$3,$4) on conflict do nothing',[body.school_id,body.user_id,body.name,body.email]);rows=null;
        } else {
          const filters=[q.get('school_id').slice(3)];
          if(q.has('user_id')) filters.push(q.get('user_id').slice(3));
          rows=(await db.query('select * from school_portal_access_requests where school_id=$1'+(filters.length>1?' and user_id=$2':''),filters)).rows;
        }
        break;
      case 'review_school_portal_access':
        rows=(await db.query('select review_school_portal_access($1,$2,$3,$4,$5,$6) changed',[body.p_school,body.p_user,body.p_status,body.p_actor,body.p_path,body.p_name])).rows[0].changed;
        break;
      default: throw Error(table);
    }
    return Response.json(rows);
  });
  async function call(user,query={},body) {
    actor=user;
    const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
    await portalApi({method:body?'POST':'GET',query:{code:'a1',...query},headers:{authorization:'Bearer fixture'},body},res);
    return res;
  }
  profileCode='B2';
  assert.equal((await call(first,{access:'1'},{})).code,403);
  profileCode='A1';
  for (const id of [first,first,second]) {
    assert.equal((await call(id,{access:'1'},{})).data.status,'pending');
    assert.equal((await call(id,{catalog:'1'})).code,403);
  }
  assert.equal((await call(first,{}, {review:'approved',userId:first})).code,403);
  assert.equal((await call(manager,{manage:'1'})).data.accessRequests.length,2);
  for(const [id,status] of [[first,'approved'],[second,'rejected']]) {
    assert.equal((await call(manager,{}, {review:status,userId:id})).code,200);
    assert.equal((await call(id,{access:'1'})).data.status,status);
  }
  assert.equal((await call(manager,{}, {review:'approved',userId:first})).code,409);
  assert.equal((await call(first)).code,200);
  assert.equal((await call(second)).code,403);
  const {rows}=await db.query('select * from notifications');
  assert.equal(rows.length,1);
  assert.equal(rows[0].user_id,first);
  assert.equal(safePushPath(rows[0].action_url),'/portal-colegio?code=A1');
  profileCode='B2';
  assert.equal((await call(first)).code,403);
  profileCode='A1';
  assert.equal((await call(manager,{}, {review:'revoked',userId:first})).code,200);
  assert.equal((await call(first)).code,403);
});
