-- Apply after 13_pickup_checkout.sql.
begin;

create or replace function public.delete_own_listing(p_product_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.products where id=p_product_id and user_id=auth.uid() for update;
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  if exists (select 1 from public.purchase_orders where product_id=p_product_id) then
    raise exception 'LISTING_HAS_ORDERS';
  end if;
  delete from public.products where id=p_product_id and user_id=auth.uid();
exception when foreign_key_violation then
  raise exception 'LISTING_HAS_ORDERS';
end;
$$;
revoke all on function public.delete_own_listing(uuid) from public,anon,authenticated;
grant execute on function public.delete_own_listing(uuid) to authenticated;

create or replace function public.notify_confirmed_sale()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.status is not distinct from new.status or new.status <> 'paid' then return new; end if;
  insert into public.notifications(user_id,actor_id,type,title,body,product_id,action_url,metadata)
  values(new.seller_id,new.buyer_id,'sale_paid','Vendiste un producto',
    'Cobro confirmado de ARS '||replace(new.amount::text,'.',',')||' por “'||new.product_title||'”. Coordiná la entrega en el colegio.',
    new.product_id,'/compra?id='||new.id,
    jsonb_build_object('order_id',new.id,'amount',new.amount,'currency',new.currency));
  return new;
end;
$$;
revoke all on function public.notify_confirmed_sale() from public,anon,authenticated;
drop trigger if exists purchase_order_sale_notification on public.purchase_orders;
create trigger purchase_order_sale_notification after update of status on public.purchase_orders
for each row execute function public.notify_confirmed_sale();

commit;
