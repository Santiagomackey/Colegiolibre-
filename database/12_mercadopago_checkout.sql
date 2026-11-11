-- Apply after 11_mercadopago_link.sql. Only the server may settle Checkout Pro orders.
begin;
alter table public.purchase_orders add column if not exists payment_provider text
  not null default 'transfer' check (payment_provider in ('transfer','mercado_pago'));

create table if not exists public.mp_checkout_credentials (
  seller_id uuid primary key references auth.users(id) on delete cascade,
  mp_user_id text not null,
  encrypted_token text not null,
  refresh_lock uuid,
  refresh_until timestamptz
);
create table if not exists public.mp_checkout_orders (
  order_id uuid primary key references public.purchase_orders(id) on delete restrict,
  mp_user_id text not null,
  provider_id text unique,
  provider_state text,
  checkout_url text,
  updated_at timestamptz
);
alter table public.mp_checkout_credentials enable row level security;
alter table public.mp_checkout_orders enable row level security;
revoke all on public.mp_checkout_credentials, public.mp_checkout_orders from public, anon, authenticated;
grant select, insert, update on public.mp_checkout_credentials, public.mp_checkout_orders to service_role;
grant select on public.purchase_orders to service_role;
grant select on public.mp_account_links to service_role;

create or replace function public.save_mp_checkout_link(
  p_state_hash text, p_seller_id uuid, p_mp_user_id text, p_display_name text,
  p_holder_name text, p_encrypted_token text
)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from auth.users where id=p_seller_id for update;
  if exists (
    select 1 from public.mp_checkout_orders m
    join public.purchase_orders o on o.id=m.order_id
    where o.seller_id=p_seller_id and m.mp_user_id<>p_mp_user_id
      and o.status in ('payment_pending','awaiting_confirmation','paid')
  ) then raise exception 'MP_OPEN_ORDERS'; end if;
  perform public.complete_mp_link(p_state_hash,p_seller_id,p_mp_user_id,p_display_name,p_holder_name);
  insert into public.mp_checkout_credentials(seller_id,mp_user_id,encrypted_token)
  values(p_seller_id,p_mp_user_id,p_encrypted_token)
  on conflict(seller_id) do update set mp_user_id=excluded.mp_user_id, encrypted_token=excluded.encrypted_token,
    refresh_lock=null, refresh_until=null;
end;$$;

create or replace function public.start_mp_checkout(p_product_id uuid, p_buyer_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype; existing public.purchase_orders%rowtype;
        account text; checkout_id uuid; chat_id uuid;
begin
  if not exists(select 1 from public.profiles where id=p_buyer_id) then raise exception 'PROFILE_REQUIRED'; end if;
  if exists(select 1 from public.profiles where id=p_buyer_id and
    (account_status='banned' or (account_status='suspended' and
    (moderation_restriction_until is null or moderation_restriction_until>now())))) then raise exception 'ACCOUNT_RESTRICTED'; end if;
  select * into product from public.products where id=p_product_id for update;
  if not found or product.user_id is null then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if product.user_id=p_buyer_id then raise exception 'OWN_PRODUCT'; end if;
  select * into existing from public.purchase_orders where product_id=product.id
    and status in ('payment_pending','awaiting_confirmation','paid');
  if found then
    if existing.buyer_id=p_buyer_id then return existing.id; end if;
    raise exception 'PRODUCT_IN_CHECKOUT';
  end if;
  if coalesce(product.status,'available')<>'available'
    or coalesce(product.moderation_status,'approved')<>'approved'
    or product.price is null or product.price<=0
    or product.price<>round(product.price::numeric,2)
  then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  perform 1 from auth.users where id=product.user_id for update;
  select c.mp_user_id into account from public.mp_checkout_credentials c
    join public.mp_account_links l using(seller_id,mp_user_id) where c.seller_id=product.user_id;
  if account is null then raise exception 'MP_SELLER_NOT_LINKED'; end if;
  insert into public.conversations(product_id,buyer_id,seller_id)
    values(product.id,p_buyer_id,product.user_id) on conflict do nothing;
  select id into chat_id from public.conversations
    where product_id=product.id and buyer_id=p_buyer_id and seller_id=product.user_id;
  if chat_id is null then raise exception 'CONVERSATION_UNAVAILABLE'; end if;
  insert into public.purchase_orders(product_id,buyer_id,seller_id,conversation_id,product_title,amount,payment_provider)
    values(product.id,p_buyer_id,product.user_id,chat_id,product.title,product.price,'mercado_pago')
    returning id into checkout_id;
  insert into public.mp_checkout_orders(order_id,mp_user_id) values(checkout_id,account);
  return checkout_id;
end;$$;

create or replace function public.apply_mp_checkout_state(
  p_order_id uuid,p_provider_id text,p_state text,p_modified timestamptz,p_checkout_url text
)
returns void language plpgsql security definer set search_path='' as $$
declare current_order public.purchase_orders%rowtype; remote public.mp_checkout_orders%rowtype;
begin
  select * into current_order from public.purchase_orders where id=p_order_id;
  if not found or current_order.payment_provider<>'mercado_pago' then raise exception 'ORDER_NOT_FOUND'; end if;
  perform 1 from public.products where id=current_order.product_id for update;
  select * into current_order from public.purchase_orders where id=p_order_id for update;
  select * into remote from public.mp_checkout_orders where order_id=p_order_id for update;
  if not found or (remote.provider_id is not null and remote.provider_id<>p_provider_id)
    then raise exception 'MP_ORDER_MISMATCH'; end if;
  if remote.updated_at is not null and p_modified<remote.updated_at then return; end if;
  if remote.updated_at=p_modified and remote.provider_state in ('accredited','canceled','refunded','partially_refunded')
    and p_state in ('created','processing','failed') then return; end if;
  update public.mp_checkout_orders set provider_id=p_provider_id,provider_state=p_state,updated_at=p_modified,
    checkout_url=coalesce(p_checkout_url,checkout_url)
    where order_id=p_order_id;
  if p_state='accredited' and current_order.status in ('payment_pending','awaiting_confirmation') then
    update public.purchase_orders set status='paid',paid_at=now(),updated_at=now() where id=p_order_id;
    update public.products set status='sold',reserved_for=current_order.buyer_id where id=current_order.product_id;
  elsif p_state='canceled' and current_order.status in ('payment_pending','awaiting_confirmation') then
    update public.purchase_orders set status='cancelled',updated_at=now() where id=p_order_id;
  end if;
end;$$;

-- Browser transfer RPCs can continue to confirm delivery for a paid order.
-- Only verified provider responses can set a Mercado Pago payment state.
create or replace function public.protect_mp_checkout_transition()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.payment_provider='mercado_pago' and new.status is distinct from old.status
    and not (old.status='paid' and new.status='delivered')
    and exists(select 1 from public.mp_checkout_orders m where m.order_id=old.id)
    and coalesce(current_setting('request.jwt.claim.role',true),
      nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','')<>'service_role'
  then raise exception 'MP_PROVIDER_VERIFICATION_REQUIRED'; end if;
  if old.payment_provider='mercado_pago' and new.status='delivered' and old.status='paid'
    and exists(select 1 from public.mp_checkout_orders m where m.order_id=old.id
      and m.provider_state in ('refunded','partially_refunded'))
  then raise exception 'MP_ORDER_REFUNDED'; end if;
  return new;
end;$$;
-- Run as definer to read the private table even on legacy RPCs.
alter function public.protect_mp_checkout_transition() security definer;
drop trigger if exists protect_mp_checkout_transition on public.purchase_orders;
create trigger protect_mp_checkout_transition before update of status on public.purchase_orders
for each row execute function public.protect_mp_checkout_transition();


create or replace function public.delete_mp_checkout_credentials()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (
    select 1 from public.mp_checkout_orders m join public.purchase_orders o on o.id=m.order_id
    where o.seller_id=old.seller_id and o.status in ('payment_pending','awaiting_confirmation','paid')
  ) then raise exception 'MP_OPEN_ORDERS'; end if;
  delete from public.mp_checkout_credentials where seller_id=old.seller_id;
  return old;
end;$$;
drop trigger if exists delete_mp_checkout_credentials on public.mp_account_links;
create trigger delete_mp_checkout_credentials before delete on public.mp_account_links
for each row execute function public.delete_mp_checkout_credentials();

create or replace function public.audit_transfer_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;declare label text;declare note text;declare kind text;
begin
 if tg_op='UPDATE' and old.status=new.status then return new;end if;
 insert into public.purchase_order_events(order_id,actor_id,previous_status,next_status)
 values(new.id,case when auth.uid() in (new.buyer_id,new.seller_id) then auth.uid() else null end,case when tg_op='UPDATE' then old.status else null end,new.status);
 if new.status='awaiting_confirmation' then
  recipient:=new.seller_id;label:='El comprador indicó que transfirió';kind:='payment_claim';note:='Revisá tu cuenta antes de confirmar el pago de “'||new.product_title||'”.';
 elsif new.status='paid' then
  recipient:=new.buyer_id;label:=case when new.payment_provider='mercado_pago' then 'Mercado Pago confirmó tu pago'
    else 'El vendedor confirmó tu pago' end;kind:='payment_confirmed';note:='Ya pueden coordinar la entrega de “'||new.product_title||'” en el colegio.';
 elsif new.status='delivered' then
  recipient:=new.seller_id;label:='El comprador confirmó la entrega';kind:='order_delivered';note:='La compra de “'||new.product_title||'” quedó completada.';
 elsif new.status='cancelled' then
  recipient:=case when auth.uid()=new.buyer_id then new.seller_id else new.buyer_id end;label:='Pedido cancelado';kind:='order_cancelled';note:='El pedido de “'||new.product_title||'” ya no está activo.';
 else return new;
 end if;
 insert into public.notifications(user_id,actor_id,type,title,body,product_id,action_url,metadata)
 values(recipient,case when auth.uid() in (new.buyer_id,new.seller_id) then auth.uid() else null end,kind,label,note,new.product_id,'/compra?id='||new.id,jsonb_build_object('order_id',new.id));
 return new;
end;$$;

revoke all on function public.save_mp_checkout_link(text,uuid,text,text,text,text),
 public.start_mp_checkout(uuid,uuid),public.apply_mp_checkout_state(uuid,text,text,timestamptz,text)
 from public,anon,authenticated;
grant execute on function public.save_mp_checkout_link(text,uuid,text,text,text,text),
 public.start_mp_checkout(uuid,uuid),public.apply_mp_checkout_state(uuid,text,text,timestamptz,text)
 to service_role;
commit;
