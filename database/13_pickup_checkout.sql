-- Apply after 12_mercadopago_checkout.sql. Existing payment providers retain their behavior.
begin;
alter table public.purchase_orders drop constraint if exists purchase_orders_payment_provider_check;
alter table public.purchase_orders add constraint purchase_orders_payment_provider_check
 check (payment_provider in ('transfer','mercado_pago','pickup'));

create table if not exists public.pickup_order_links (
 order_id uuid primary key references public.purchase_orders(id) on delete cascade,
 url text not null unique check (url ~ '^https://mpago[.]la/[A-Za-z0-9]{4,64}$'),
 opened_at timestamptz
);
alter table public.pickup_order_links enable row level security;
revoke all on public.pickup_order_links from public,anon,authenticated;

create or replace function public.pickup_checkout_ready()
returns boolean language sql stable set search_path='' as $$ select true $$;

create or replace function public.start_manual_purchase_order(p_product_id uuid,p_provider text)
returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;declare existing public.purchase_orders%rowtype;declare payment public.seller_payment_details%rowtype;declare order_id uuid;declare chat_id uuid;
begin
 if p_provider not in ('transfer','pickup') or p_provider is null then raise exception 'INVALID_ACTION';end if;
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'PROFILE_REQUIRED';end if;
 if exists(select 1 from public.profiles where id=auth.uid() and (account_status='banned' or (account_status='suspended' and (moderation_restriction_until is null or moderation_restriction_until>now())))) then raise exception 'ACCOUNT_RESTRICTED';end if;
 select * into product from public.products where id=p_product_id for update;
 if not found or product.user_id is null then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if product.user_id=auth.uid() then raise exception 'OWN_PRODUCT';end if;
 select * into existing from public.purchase_orders where product_id=p_product_id and status in ('payment_pending','awaiting_confirmation','paid');
 if found then
  if existing.buyer_id=auth.uid() then return existing.id;end if;
  raise exception 'PRODUCT_IN_CHECKOUT';
 end if;
 if coalesce(product.status,'available')<>'available' or coalesce(product.moderation_status,'approved')<>'approved' or product.price is null or product.price<=0 or product.price<>round(product.price::numeric,2) then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if p_provider='transfer' then
  select * into payment from public.seller_payment_details where seller_id=product.user_id;
  if not found then raise exception 'PAYMENT_DETAILS_MISSING';end if;
 end if;
 insert into public.conversations(product_id,buyer_id,seller_id) values(product.id,auth.uid(),product.user_id) on conflict do nothing;
 select id into chat_id from public.conversations where product_id=product.id and buyer_id=auth.uid() and seller_id=product.user_id;
 if chat_id is null then raise exception 'CONVERSATION_UNAVAILABLE';end if;
 insert into public.purchase_orders(product_id,buyer_id,seller_id,conversation_id,product_title,amount,payment_provider) values(product.id,auth.uid(),product.user_id,chat_id,product.title,product.price,p_provider) returning id into order_id;
 if p_provider='transfer' then
  insert into public.order_payment_instructions(order_id,method,alias,account_number,holder_name)
  values(order_id,payment.method,payment.alias,payment.account_number,payment.holder_name);
 end if;
 return order_id;
end;$$;

create or replace function public.start_transfer_order(p_product_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select public.start_manual_purchase_order(p_product_id,'transfer')
$$;

create or replace function public.start_pickup_order(p_product_id uuid)
returns uuid language sql security definer set search_path='' as $$
 select public.start_manual_purchase_order(p_product_id,'pickup')
$$;

create or replace function public.save_pickup_order_link(p_order_id uuid,p_url text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.purchase_orders%rowtype; previous public.pickup_order_links%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if p_url is null or p_url !~ '^https://mpago[.]la/[A-Za-z0-9]{4,64}$' then raise exception 'INVALID_PICKUP_LINK';end if;
 select * into item from public.purchase_orders where id=p_order_id and seller_id=auth.uid() for update;
 if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if item.payment_provider<>'pickup' or item.status<>'payment_pending' then raise exception 'INVALID_ORDER_STATE';end if;
 select * into previous from public.pickup_order_links where order_id=p_order_id;
 if found then
  if previous.url=p_url then return;end if;
  raise exception 'PICKUP_LINK_ALREADY_SHARED';
 end if;
 insert into public.pickup_order_links(order_id,url) values(p_order_id,p_url) on conflict do nothing;
 if not found then raise exception 'PICKUP_LINK_IN_USE';end if;
 insert into public.notifications(user_id,actor_id,type,title,body,product_id,action_url,metadata)
 values(item.buyer_id,item.seller_id,'pickup_link_ready','Ya podés pagar con Mercado Pago',
  'El vendedor agregó un link de pago a tu reserva.',item.product_id,'/compra?id='||item.id,
  jsonb_build_object('order_id',item.id));
end;$$;

create or replace function public.open_pickup_order_link(p_order_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare item public.purchase_orders%rowtype; product uuid; payment_url text;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select product_id into product from public.purchase_orders where id=p_order_id and buyer_id=auth.uid();
 if not found then raise exception 'ORDER_NOT_FOUND';end if;
 perform 1 from public.products where id=product and status='available'
   and coalesce(moderation_status,'approved')='approved' for update;
 if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
 select * into item from public.purchase_orders where id=p_order_id for update;
 if item.payment_provider<>'pickup' or item.status<>'payment_pending' then raise exception 'INVALID_ORDER_STATE';end if;
 update public.pickup_order_links set opened_at=coalesce(opened_at,now())
  where order_id=item.id returning url into payment_url;
 if not found then raise exception 'PICKUP_LINK_MISSING';end if;
 return payment_url;
end;$$;

create or replace function public.get_transfer_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.purchase_orders%rowtype;declare payment jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into item from public.purchase_orders where id=p_order_id and auth.uid() in (buyer_id,seller_id) for update;
 if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if item.status in ('payment_pending','awaiting_confirmation') then select to_jsonb(p)-'order_id' into payment from public.order_payment_instructions p where p.order_id=item.id;end if;
 return to_jsonb(item)||jsonb_build_object('role',case when auth.uid()=item.buyer_id then 'buyer' else 'seller' end,'payment',payment,
  'pickup_link_ready',item.payment_provider='pickup' and exists(select 1 from public.pickup_order_links where order_id=item.id),
  'pickup_link_opened',item.payment_provider='pickup' and exists(select 1 from public.pickup_order_links where order_id=item.id and opened_at is not null),'buyer_name',(select name from public.profiles where id=item.buyer_id),'seller_name',(select name from public.profiles where id=item.seller_id),'listing_available',(select status='available' and coalesce(moderation_status,'approved')='approved' from public.products where id=item.product_id));
end;$$;

create or replace function public.transition_transfer_order(p_order_id uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.purchase_orders%rowtype;declare product uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select product_id into product from public.purchase_orders where id=p_order_id and auth.uid() in (buyer_id,seller_id);
 if not found then raise exception 'ORDER_NOT_FOUND';end if;
 -- Match the checkout lock order so simultaneous starts/confirmations serialize.
 perform 1 from public.products where id=product for update;
 select * into item from public.purchase_orders where id=p_order_id for update;
 if p_action='claim_pickup_link_payment' then
  if auth.uid()<>item.buyer_id then raise exception 'BUYER_ONLY';end if;
  if item.payment_provider<>'pickup' or not exists(
    select 1 from public.pickup_order_links where order_id=item.id and opened_at is not null
  ) then raise exception 'INVALID_ACTION';end if;
  if item.status in ('awaiting_confirmation','paid','delivered') then return;end if;
  if item.status<>'payment_pending' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='awaiting_confirmation',transfer_claimed_at=now(),updated_at=now() where id=item.id;
 elsif p_action='claim_transfer' then
  if item.payment_provider='pickup' then raise exception 'INVALID_ACTION';end if;
  if auth.uid()<>item.buyer_id then raise exception 'BUYER_ONLY';end if;
  if item.status='awaiting_confirmation' then return;end if;
  if item.status<>'payment_pending' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='awaiting_confirmation',transfer_claimed_at=now(),updated_at=now() where id=item.id;
 elsif p_action='confirm_received' then
  if auth.uid()<>item.seller_id then raise exception 'SELLER_ONLY';end if;
  if item.status='paid' then return;end if;
  if item.status<>'awaiting_confirmation' and not (item.payment_provider='pickup' and item.status='payment_pending')
   then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='paid',paid_at=now(),updated_at=now() where id=item.id;
  update public.products set status='sold',reserved_for=item.buyer_id where id=item.product_id;
 elsif p_action='confirm_delivered' then
  if auth.uid()<>item.buyer_id then raise exception 'BUYER_ONLY';end if;
  if item.status='delivered' then return;end if;
  if item.status<>'paid' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='delivered',delivered_at=now(),updated_at=now() where id=item.id;
 elsif p_action in ('cancel','cancel_pickup_link') then
  if item.status='cancelled' then return;end if;
  if item.status<>'payment_pending' then raise exception 'CANNOT_CANCEL_AFTER_TRANSFER';end if;
  if p_action='cancel_pickup_link' and (item.payment_provider<>'pickup' or auth.uid()<>item.seller_id)
   then raise exception 'SELLER_ONLY';end if;
  if p_action='cancel' and item.payment_provider='pickup' and exists(
    select 1 from public.pickup_order_links where order_id=item.id and opened_at is not null
  ) then raise exception 'PICKUP_LINK_CANCEL_REQUIRED';end if;
  update public.purchase_orders set status='cancelled',updated_at=now() where id=item.id;
 else raise exception 'INVALID_ACTION';end if;
end;$$;

create or replace function public.audit_transfer_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare recipient uuid;declare label text;declare note text;declare kind text;
begin
 if tg_op='UPDATE' and old.status=new.status then return new;end if;
 insert into public.purchase_order_events(order_id,actor_id,previous_status,next_status)
 values(new.id,case when auth.uid() in (new.buyer_id,new.seller_id) then auth.uid() else null end,case when tg_op='UPDATE' then old.status else null end,new.status);
 if tg_op='INSERT' and new.payment_provider='pickup' then
  recipient:=new.seller_id;label:='Nueva reserva para retirar';kind:='pickup_reserved';
  note:='Coordiná la entrega de “'||new.product_title||'” con el comprador.';
 elsif new.status='awaiting_confirmation' and new.payment_provider='pickup' then
  recipient:=new.seller_id;label:='El comprador avisó que pagó';kind:='pickup_payment_claim';
  note:='Revisá tus cobros en Mercado Pago antes de confirmar el pago de “'||new.product_title||'”.';
 elsif new.status='awaiting_confirmation' then
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

revoke all on function public.start_manual_purchase_order(uuid,text) from public,anon,authenticated;
revoke all on function public.start_pickup_order(uuid),public.save_pickup_order_link(uuid,text),
 public.open_pickup_order_link(uuid),public.pickup_checkout_ready() from public,anon,authenticated;
grant execute on function public.start_pickup_order(uuid),public.save_pickup_order_link(uuid,text),
 public.open_pickup_order_link(uuid),public.pickup_checkout_ready() to authenticated;
commit;
