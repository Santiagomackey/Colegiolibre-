import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

test('school requests are private and repeated offers reopen the same conversation', async () => {
  const db = new PGlite();
  const owner='00000000-0000-4000-8000-000000000001', seller='00000000-0000-4000-8000-000000000002', other='00000000-0000-4000-8000-000000000003';
  try {
    await db.exec(`create schema auth; create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql as $$select current_setting('app.actor')::uuid$$;
      create table products(id uuid primary key);
      create table profiles(id uuid primary key,school_code text);
      create table wanted_posts(id uuid primary key,user_id uuid,title text,status text,scope text,school_code text);
      create table conversations(id uuid primary key default gen_random_uuid(),product_id uuid not null,buyer_id uuid,seller_id uuid,created_at timestamptz default now());
      create function account_can_trade(uuid) returns boolean language sql as $$select true$$;
      create function are_users_blocked(uuid,uuid) returns boolean language sql as $$select false$$;
      alter table wanted_posts enable row level security;
      create policy "Anyone reads active wanted posts" on wanted_posts for select using(true);
      grant select on profiles,wanted_posts to authenticated;
      grant usage on schema auth to authenticated;`);
    await db.exec(readFileSync(new URL('../database/23_school_material_requests.sql',import.meta.url),'utf8'));
    await db.exec(`insert into profiles values ('${owner}','A'),('${seller}','A'),('${other}','B');
      insert into wanted_posts values ('${owner}','${owner}','Biology','active','school','A');
      set role authenticated; set app.actor='${seller}';`);
    const open=async()=> (await db.query('select open_wanted_chat($1) as id',[owner])).rows[0].id;
    assert.equal((await db.query('select * from wanted_posts')).rows.length,1);
    const first=await open(); assert.ok(first); assert.equal(await open(),first);
    await db.exec(`set app.actor='${other}'`);
    assert.equal((await db.query('select * from wanted_posts')).rows.length,0);
    await assert.rejects(open,/no está disponible/);
    await db.exec(`set app.actor='${owner}'`);
    await assert.rejects(open,/no está disponible/);
    await db.exec(`reset role; update wanted_posts set status='closed'; set role authenticated; set app.actor='${seller}';`);
    await assert.rejects(open,/no está disponible/);
  } finally { await db.close(); }
});
