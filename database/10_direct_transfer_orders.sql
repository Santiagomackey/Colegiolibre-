-- Direct external transfers. Requires products, profiles, conversations and notifications migrations.
-- Payment details never belong in the publicly readable profiles table.
begin;
create table if not exists public.seller_payment_details (
 seller_id uuid primary key references auth.users(id) on delete cascade,
 method text not null check(method in ('mercado_pago','bank')),
 alias text not null check(alias ~ '^[a-z0-9.-]{6,20}$'),
 account_number text not null check(account_number ~ '^[0-9]{22}$' and account_number !~ '^([0-9])\1{21}$'),
 holder_name text not null check(length(trim(holder_name)) between 2 and 100 and holder_name !~ '[[:cntrl:]]'),
 updated_at timestamptz not null default now()
);
create table if not exists public.purchase_orders (
 id uuid primary key default gen_random_uuid(),
 product_id uuid not null references public.products(id) on delete restrict,
 buyer_id uuid not null references auth.users(id) on delete restrict,
 seller_id uuid not null references auth.users(id) on delete restrict,
 conversation_id uuid not null references public.conversations(id) on delete restrict,
 product_title text not null,
 amount numeric(12,2) not null check(amount>0),
 currency text not null default 'ARS' check(currency='ARS'),
 status text not null default 'payment_pending' check(status in ('payment_pending','awaiting_confirmation','paid','delivered','cancelled')),
 transfer_claimed_at timestamptz,
 paid_at timestamptz,
 delivered_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(buyer_id<>seller_id)
);
create unique index if not exists purchase_orders_one_open_product on public.purchase_orders(product_id) where status in ('payment_pending','awaiting_confirmation','paid');
create index if not exists purchase_orders_buyer on public.purchase_orders(buyer_id,created_at desc);
create index if not exists purchase_orders_seller on public.purchase_orders(seller_id,created_at desc);
create table if not exists public.order_payment_instructions (
 order_id uuid primary key references public.purchase_orders(id) on delete cascade,
 method text not null,
 alias text not null,
 account_number text not null,
 holder_name text not null
);
create table if not exists public.purchase_order_events (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.purchase_orders(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,
 previous_status text,
 next_status text not null,
 created_at timestamptz not null default now()
);
alter table public.seller_payment_details enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.order_payment_instructions enable row level security;
alter table public.purchase_order_events enable row level security;
-- RPC-only access prevents callers from setting amounts, participants or payment status.
revoke all on public.seller_payment_details,public.purchase_orders,public.order_payment_instructions,public.purchase_order_events from public,anon,authenticated;

create or replace function public.get_my_payment_details()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return (select to_jsonb(d)-'seller_id' from public.seller_payment_details d where d.seller_id=auth.uid());
end;$$;
create or replace function public.save_my_payment_details(p_method text,p_alias text,p_account_number text,p_holder_name text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 insert into public.seller_payment_details(seller_id,method,alias,account_number,holder_name)
 values(auth.uid(),p_method,lower(trim(p_alias)),regexp_replace(p_account_number,'[[:space:]]','','g'),trim(p_holder_name))
 on conflict(seller_id) do update set method=excluded.method,alias=excluded.alias,account_number=excluded.account_number,holder_name=excluded.holder_name,updated_at=now();
end;$$;

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
  recipient:=new.buyer_id;label:='El vendedor confirmó tu pago';kind:='payment_confirmed';note:='Ya pueden coordinar la entrega de “'||new.product_title||'” en el colegio.';
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
drop trigger if exists purchase_orders_audit on public.purchase_orders;
create trigger purchase_orders_audit after insert or update of status on public.purchase_orders for each row execute function public.audit_transfer_order();

create or replace function public.start_transfer_order(p_product_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare product public.products%rowtype;declare existing public.purchase_orders%rowtype;declare payment public.seller_payment_details%rowtype;declare order_id uuid;declare chat_id uuid;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 if not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'PROFILE_REQUIRED';end if;
 if exists(select 1 from public.profiles where id=auth.uid() and (account_status='banned' or (account_status='suspended' and (moderation_restriction_until is null or moderation_restriction_until>now())))) then raise exception 'ACCOUNT_RESTRICTED';end if;
 select * into product from public.products where id=p_product_id for update;
 if not found then raise exception 'PRODUCT_UNAVAILABLE';end if;
 if product.user_id=auth.uid() then raise exception 'OWN_PRODUCT';end if;
 select * into existing from public.purchase_orders where product_id=p_product_id and status in ('payment_pending','awaiting_confirmation','paid');
 if found then
  if existing.buyer_id=auth.uid() then return existing.id;end if;
  raise exception 'PRODUCT_IN_CHECKOUT';
 end if;
 if coalesce(product.status,'available')<>'available' or coalesce(product.moderation_status,'approved')<>'approved' or product.price is null or product.price<=0 or product.price<>round(product.price::numeric,2) then raise exception 'PRODUCT_UNAVAILABLE';end if;
 select * into payment from public.seller_payment_details where seller_id=product.user_id;
 if not found then raise exception 'PAYMENT_DETAILS_MISSING';end if;
 insert into public.conversations(product_id,buyer_id,seller_id) values(product.id,auth.uid(),product.user_id) on conflict do nothing;
 select id into chat_id from public.conversations where product_id=product.id and buyer_id=auth.uid() and seller_id=product.user_id;
 if chat_id is null then raise exception 'CONVERSATION_UNAVAILABLE';end if;
 insert into public.purchase_orders(product_id,buyer_id,seller_id,conversation_id,product_title,amount) values(product.id,auth.uid(),product.user_id,chat_id,product.title,product.price) returning id into order_id;
 insert into public.order_payment_instructions(order_id,method,alias,account_number,holder_name) values(order_id,payment.method,payment.alias,payment.account_number,payment.holder_name);
 return order_id;
end;$$;

create or replace function public.get_transfer_order(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.purchase_orders%rowtype;declare payment jsonb;
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 select * into item from public.purchase_orders where id=p_order_id and auth.uid() in (buyer_id,seller_id) for update;
 if not found then raise exception 'ORDER_NOT_FOUND';end if;
 if item.status in ('payment_pending','awaiting_confirmation') then select to_jsonb(p)-'order_id' into payment from public.order_payment_instructions p where p.order_id=item.id;end if;
 return to_jsonb(item)||jsonb_build_object('role',case when auth.uid()=item.buyer_id then 'buyer' else 'seller' end,'payment',payment,'buyer_name',(select name from public.profiles where id=item.buyer_id),'seller_name',(select name from public.profiles where id=item.seller_id),'listing_available',(select status='available' and coalesce(moderation_status,'approved')='approved' from public.products where id=item.product_id));
end;$$;
create or replace function public.list_my_transfer_orders()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED';end if;
 return coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('role',case when o.buyer_id=auth.uid() then 'buyer' else 'seller' end) order by o.created_at desc) from (select * from public.purchase_orders where auth.uid() in (buyer_id,seller_id) order by created_at desc limit 100) o),'[]'::jsonb);
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
 if p_action='claim_transfer' then
  if auth.uid()<>item.buyer_id then raise exception 'BUYER_ONLY';end if;
  if item.status='awaiting_confirmation' then return;end if;
  if item.status<>'payment_pending' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='awaiting_confirmation',transfer_claimed_at=now(),updated_at=now() where id=item.id;
 elsif p_action='confirm_received' then
  if auth.uid()<>item.seller_id then raise exception 'SELLER_ONLY';end if;
  if item.status='paid' then return;end if;
  if item.status<>'awaiting_confirmation' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='paid',paid_at=now(),updated_at=now() where id=item.id;
  update public.products set status='sold',reserved_for=item.buyer_id where id=item.product_id;
 elsif p_action='confirm_delivered' then
  if auth.uid()<>item.buyer_id then raise exception 'BUYER_ONLY';end if;
  if item.status='delivered' then return;end if;
  if item.status<>'paid' then raise exception 'INVALID_ORDER_STATE';end if;
  update public.purchase_orders set status='delivered',delivered_at=now(),updated_at=now() where id=item.id;
 elsif p_action='cancel' then
  if item.status='cancelled' then return;end if;
  if item.status<>'payment_pending' then raise exception 'CANNOT_CANCEL_AFTER_TRANSFER';end if;
  update public.purchase_orders set status='cancelled',updated_at=now() where id=item.id;
 else raise exception 'INVALID_ACTION';end if;
end;$$;

-- Other selling/reservation flows cannot sell the same item during an active checkout.
create or replace function public.guard_product_transfer_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.user_id is distinct from old.user_id or (new.status is distinct from old.status and new.status in ('sold','reserved'))) and exists(select 1 from public.purchase_orders where product_id=old.id and status in ('awaiting_confirmation','payment_pending')) then raise exception 'PRODUCT_IN_CHECKOUT';end if;
 return new;
end;$$;
drop trigger if exists products_guard_transfer_order on public.products;
create trigger products_guard_transfer_order before update on public.products for each row execute function public.guard_product_transfer_order();

revoke all on function public.get_my_payment_details(),public.save_my_payment_details(text,text,text,text),public.start_transfer_order(uuid),public.get_transfer_order(uuid),public.list_my_transfer_orders(),public.transition_transfer_order(uuid,text),public.audit_transfer_order(),public.guard_product_transfer_order() from public,anon,authenticated;
grant execute on function public.get_my_payment_details(),public.save_my_payment_details(text,text,text,text),public.start_transfer_order(uuid),public.get_transfer_order(uuid),public.list_my_transfer_orders(),public.transition_transfer_order(uuid,text) to authenticated;
commit;
