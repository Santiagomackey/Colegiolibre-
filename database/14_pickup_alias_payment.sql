-- Apply after 13_pickup_checkout.sql.
begin;

create or replace function public.pickup_alias_payment(p_order_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 item public.purchase_orders%rowtype;
 product public.products%rowtype;
 payment public.order_payment_instructions%rowtype;
 recipient public.seller_payment_details%rowtype;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_action is null or p_action not in ('status','open','claim') then raise exception 'INVALID_ACTION'; end if;
 select * into item from public.purchase_orders where id=p_order_id and buyer_id=auth.uid();
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 select * into product from public.products where id=item.product_id for update;
 select * into item from public.purchase_orders where id=p_order_id and buyer_id=auth.uid() for update;
 if item.payment_provider<>'pickup' or item.status not in ('payment_pending','awaiting_confirmation') then
  raise exception 'INVALID_ORDER_STATE';
 end if;
 select * into payment from public.order_payment_instructions where order_id=item.id and method='mercado_pago';
 if p_action='claim' then
  if payment.order_id is null then raise exception 'PAYMENT_DETAILS_MISSING'; end if;
  if item.status='payment_pending' then
   update public.purchase_orders set status='awaiting_confirmation',transfer_claimed_at=now(),updated_at=now() where id=item.id;
  end if;
  return null;
 end if;
 if exists(select 1 from public.pickup_order_links where order_id=item.id) then
  if p_action='open' then raise exception 'INVALID_ORDER_STATE'; end if;
  return jsonb_build_object('available',false);
 end if;
 if item.status<>'payment_pending' or product.id is null or coalesce(product.status,'available')<>'available'
    or coalesce(product.moderation_status,'approved')<>'approved' or product.user_id is distinct from item.seller_id then
  if p_action='open' then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  return jsonb_build_object('available',false);
 end if;
 if payment.order_id is null then
  select * into recipient from public.seller_payment_details where seller_id=item.seller_id and method='mercado_pago';
  if not found then
   if p_action='open' then raise exception 'PAYMENT_DETAILS_MISSING'; end if;
   return jsonb_build_object('available',false);
  end if;
  if p_action='open' then
   insert into public.order_payment_instructions(order_id,method,alias,account_number,holder_name)
    values(item.id,recipient.method,recipient.alias,recipient.account_number,recipient.holder_name)
    returning * into payment;
  end if;
 end if;
 return jsonb_build_object('available',true,'recipient',
   case when payment.order_id is not null then jsonb_build_object('alias',payment.alias,'holder_name',payment.holder_name) end);
end;$$;

-- The existing link RPC locks the order before inserting. Serialize both
-- payment methods on that same row and keep an issued alias as the only route.
create or replace function public.keep_pickup_alias_payment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.purchase_orders where id=new.order_id for update;
 if exists(select 1 from public.order_payment_instructions where order_id=new.order_id) then
  raise exception 'INVALID_ORDER_STATE';
 end if;
 return new;
end;$$;
drop trigger if exists keep_pickup_alias_payment on public.pickup_order_links;
create trigger keep_pickup_alias_payment before insert on public.pickup_order_links
 for each row execute function public.keep_pickup_alias_payment();

revoke all on function public.pickup_alias_payment(uuid,text),public.keep_pickup_alias_payment() from public,anon,authenticated;
grant execute on function public.pickup_alias_payment(uuid,text) to authenticated;
commit;
