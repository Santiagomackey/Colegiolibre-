import {PGlite} from '@electric-sql/pglite';
import fs from 'node:fs';
export async function setupTransferDb(ids){const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
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
 await db.exec(fs.readFileSync(new URL('../../database/10_direct_transfer_orders.sql',import.meta.url),'utf8'));
return db;}
