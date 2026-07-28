-- ColegioLibre · Flujo de compraventa 1.1
-- Ejecutar una sola vez, DESPUÉS de:
--   1_CONFIGURAR_NOTIFICACIONES_SUPABASE.sql
--   2_CONFIGURAR_CONFIANZA_Y_SEGURIDAD.sql
--
-- Este ajuste:
--   · permite que comprador o vendedor cancelen una reserva;
--   · registra quién la canceló;
--   · avisa al vendedor cuando el comprador cancela;
--   · evita mandarle al comprador un aviso redundante por su propia acción.

alter table public.transactions
  add column if not exists cancelled_by uuid
    references auth.users(id) on delete set null;

create index if not exists transactions_cancelled_by_idx
  on public.transactions (cancelled_by, cancelled_at desc)
  where cancelled_by is not null;

create or replace function public.cancel_product_reservation(
  target_conversation uuid
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  conversation_row public.conversations%rowtype;
  product_row public.products%rowtype;
  recipient_id uuid;
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  select *
  into conversation_row
  from public.conversations
  where id = target_conversation
  for update;

  if not found
    or actor_id not in (
      conversation_row.buyer_id,
      conversation_row.seller_id
    )
  then
    raise exception 'Solo el comprador o el vendedor pueden cancelar esta reserva.';
  end if;

  select *
  into product_row
  from public.products
  where id = conversation_row.product_id
  for update;

  if not found
    or product_row.status <> 'reserved'
    or product_row.reserved_for is distinct from conversation_row.buyer_id
  then
    raise exception 'Esta conversación no tiene una reserva activa.';
  end if;

  update public.transactions
  set
    status = 'cancelled',
    cancelled_at = now(),
    cancelled_by = actor_id,
    updated_at = now()
  where product_id = product_row.id
    and conversation_id = conversation_row.id
    and status = 'reserved';

  if not found then
    raise exception 'No encontramos la operación reservada.';
  end if;

  update public.products
  set
    status = 'available',
    reserved_for = null,
    updated_at = now()
  where id = product_row.id
  returning * into product_row;

  -- Cuando cancela el comprador, avisamos al vendedor. Cuando cancela el
  -- vendedor, el trigger de cambio de estado ya avisa al comprador.
  if actor_id = conversation_row.buyer_id then
    recipient_id := conversation_row.seller_id;

    perform public.upsert_grouped_notification(
      recipient_id,
      actor_id,
      'reservation_cancelled',
      'El comprador canceló la reserva',
      'La reserva de “' || product_row.title || '” fue cancelada.',
      product_row.id,
      conversation_row.id,
      'mensajes.html?id=' || conversation_row.id::text
    );
  end if;

  return product_row;
end;
$$;

create or replace function public.notify_product_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_uuid uuid;
  related_conversation_uuid uuid;
  notification_type text;
  notification_title text;
  notification_body text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  recipient_uuid := coalesce(new.reserved_for, old.reserved_for);
  if recipient_uuid is null or recipient_uuid = new.user_id then
    return new;
  end if;

  if new.status = 'reserved' then
    notification_type := 'reserved';
    notification_title := 'Te reservaron un producto';
    notification_body := 'El vendedor reservó “' || new.title || '” para vos.';
  elsif new.status = 'sold' then
    notification_type := 'sold';
    notification_title := 'Producto marcado como vendido';
    notification_body := '“' || new.title || '” fue marcado como vendido.';
  elsif new.status = 'available' and old.status in ('reserved', 'sold') then
    -- Si el propio comprador canceló, no necesita recibir un aviso sobre su
    -- propia acción. La función anterior ya le avisa al vendedor.
    if old.status = 'reserved' and auth.uid() = old.reserved_for then
      return new;
    end if;

    notification_type := 'available';
    notification_title := 'Producto disponible nuevamente';
    notification_body := '“' || new.title || '” volvió a estar disponible.';
  else
    return new;
  end if;

  select conversations.id
  into related_conversation_uuid
  from public.conversations
  where conversations.product_id = new.id
    and conversations.buyer_id = recipient_uuid
    and conversations.seller_id = new.user_id
  order by conversations.created_at desc
  limit 1;

  perform public.upsert_grouped_notification(
    recipient_uuid,
    new.user_id,
    notification_type,
    notification_title,
    notification_body,
    new.id,
    related_conversation_uuid,
    case
      when related_conversation_uuid is not null
        then 'mensajes.html?id=' || related_conversation_uuid::text
      else 'producto.html?id=' || new.id::text
    end
  );

  return new;
end;
$$;

revoke all on function public.cancel_product_reservation(uuid)
from public, anon, authenticated;
grant execute on function public.cancel_product_reservation(uuid)
to authenticated;

revoke all on function public.notify_product_status_change()
from public, anon, authenticated;

notify pgrst, 'reload schema';

-- Comprobación: los cuatro resultados deben ser true.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transactions'
      and column_name = 'cancelled_by'
  ) as cancelacion_registrada,
  to_regprocedure(
    'public.cancel_product_reservation(uuid)'
  ) is not null as cancelacion_configurada,
  to_regprocedure(
    'public.complete_sale_for_conversation(uuid)'
  ) is not null as venta_configurada,
  to_regprocedure(
    'public.submit_transaction_review(uuid,smallint,text)'
  ) is not null as calificacion_configurada;
