-- Run after 10_direct_transfer_orders.sql. Linking identifies an MP account;
-- it does not verify alias ownership or approve incoming external transfers.
begin;
create table if not exists public.mp_account_links (
 seller_id uuid primary key references auth.users(id) on delete cascade,
 mp_user_id text not null check(mp_user_id ~ '^[0-9]+$'),
 display_name text not null,
 holder_name text,
 linked_at timestamptz not null default now()
);
create table if not exists public.mp_link_attempts (
 state_hash text primary key,
 launch_hash text unique,
 cookie_hash text,
 seller_id uuid not null references auth.users(id) on delete cascade,
 verifier text not null,
 source text not null check(source in ('web','app')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 launched_at timestamptz,
 consumed_at timestamptz
);
alter table public.mp_account_links enable row level security;
alter table public.mp_link_attempts enable row level security;
revoke all on public.mp_account_links,public.mp_link_attempts from public,anon,authenticated;

create or replace function public.prepare_mp_link(p_seller_id uuid,p_state_hash text,p_launch_hash text,p_verifier text,p_source text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_seller_id for update;
 if not found then raise exception 'USER_NOT_FOUND';end if;
 delete from public.mp_link_attempts where expires_at<now();
 if (select count(*) from public.mp_link_attempts where seller_id=p_seller_id)>=5 then raise exception 'TOO_MANY_ATTEMPTS';end if;
 if length(p_state_hash)<>64 or length(p_launch_hash)<>64 or length(p_verifier)<43 then raise exception 'INVALID_ATTEMPT';end if;
 insert into public.mp_link_attempts(state_hash,launch_hash,seller_id,verifier,source) values(p_state_hash,p_launch_hash,p_seller_id,p_verifier,p_source);
end;$$;
create or replace function public.launch_mp_link(p_state_hash text,p_launch_hash text,p_cookie_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.mp_link_attempts%rowtype;
begin
 select * into item from public.mp_link_attempts where state_hash=p_state_hash and launch_hash=p_launch_hash and launched_at is null and expires_at>now() for update;
 if not found then raise exception 'INVALID_ATTEMPT';end if;
 update public.mp_link_attempts set launch_hash=null,cookie_hash=p_cookie_hash,launched_at=now() where state_hash=p_state_hash;
 return jsonb_build_object('verifier',item.verifier);
end;$$;
create or replace function public.consume_mp_link(p_state_hash text,p_cookie_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.mp_link_attempts%rowtype;
begin
 update public.mp_link_attempts set consumed_at=now() where state_hash=p_state_hash and cookie_hash=p_cookie_hash and launched_at is not null and consumed_at is null and expires_at>now() returning * into item;
 if not found then raise exception 'INVALID_ATTEMPT';end if;
 return jsonb_build_object('seller_id',item.seller_id,'verifier',item.verifier,'source',item.source);
end;$$;
create or replace function public.complete_mp_link(p_state_hash text,p_seller_id uuid,p_mp_user_id text,p_display_name text,p_holder_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_seller_id for update;
 if not exists(select 1 from public.mp_link_attempts where state_hash=p_state_hash and seller_id=p_seller_id and consumed_at is not null and expires_at>now()) then raise exception 'INVALID_ATTEMPT';end if;
 insert into public.mp_account_links(seller_id,mp_user_id,display_name,holder_name)
 values(p_seller_id,p_mp_user_id,left(p_display_name,100),nullif(left(p_holder_name,100),''))
 on conflict(seller_id) do update set mp_user_id=excluded.mp_user_id,display_name=excluded.display_name,holder_name=excluded.holder_name,linked_at=now();
 delete from public.mp_link_attempts where seller_id=p_seller_id;
end;$$;
create or replace function public.get_my_mp_link()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return (select to_jsonb(l)-'seller_id' from public.mp_account_links l where l.seller_id=auth.uid());
end;$$;
create or replace function public.remove_my_mp_link()
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 perform 1 from auth.users where id=auth.uid() for update;
 delete from public.mp_link_attempts where seller_id=auth.uid();
 delete from public.mp_account_links where seller_id=auth.uid();
end;$$;

-- A linked MP account only needs an alias for a manual transfer. Bank accounts
-- still require all 22 digits. Existing order snapshots are never rewritten.
alter table public.seller_payment_details alter column account_number drop not null;
alter table public.seller_payment_details drop constraint if exists seller_payment_details_account_number_check;
alter table public.seller_payment_details add constraint seller_payment_details_account_number_check check (
 (method='mercado_pago' and account_number is null)
 or (account_number is not null and account_number ~ '^[0-9]{22}$' and account_number !~ '^([0-9])\1{21}$')
);
alter table public.order_payment_instructions alter column account_number drop not null;
create or replace function public.save_linked_mp_alias(p_alias text,p_holder_name text)
returns void language plpgsql security definer set search_path='' as $$
declare linked public.mp_account_links%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into linked from public.mp_account_links where seller_id=auth.uid();
 if not found then raise exception 'MP_LINK_REQUIRED';end if;
 insert into public.seller_payment_details(seller_id,method,alias,account_number,holder_name)
 values(auth.uid(),'mercado_pago',lower(trim(p_alias)),null,coalesce(nullif(trim(linked.holder_name),''),trim(p_holder_name)))
 on conflict(seller_id) do update set method=excluded.method,alias=excluded.alias,account_number=null,holder_name=excluded.holder_name,updated_at=now();
end;$$;
revoke all on function public.prepare_mp_link(uuid,text,text,text,text),public.launch_mp_link(text,text,text),public.consume_mp_link(text,text),public.complete_mp_link(text,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_mp_link(uuid,text,text,text,text),public.launch_mp_link(text,text,text),public.consume_mp_link(text,text),public.complete_mp_link(text,uuid,text,text,text) to service_role;
revoke all on function public.get_my_mp_link(),public.remove_my_mp_link(),public.save_linked_mp_alias(text,text) from public,anon,authenticated;
grant execute on function public.get_my_mp_link(),public.remove_my_mp_link(),public.save_linked_mp_alias(text,text) to authenticated;
commit;
