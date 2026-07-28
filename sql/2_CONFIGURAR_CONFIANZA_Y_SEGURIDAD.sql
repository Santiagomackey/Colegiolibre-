-- ColegioLibre · Confianza y seguridad 1.0
-- Ejecutar DESPUÉS de:
--   1_CONFIGURAR_MENSAJES_SUPABASE.sql
--   1_CONFIGURAR_NOTIFICACIONES_SUPABASE.sql
-- en Supabase > SQL Editor > New query.
--
-- Este archivo no procesa pagos. Registra reservas/ventas, habilita
-- calificaciones verificadas y agrega reportes y bloqueos.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists rating numeric(3, 2) not null default 0,
  add column if not exists rating_count integer not null default 0,
  add column if not exists sales_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'cancelled')),
  reserved_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

alter table public.transactions
  add column if not exists cancelled_by uuid
    references auth.users(id) on delete set null;

create unique index if not exists transactions_one_open_product_idx
  on public.transactions (product_id)
  where status = 'reserved';

create index if not exists transactions_buyer_recent_idx
  on public.transactions (buyer_id, updated_at desc);

create index if not exists transactions_seller_recent_idx
  on public.transactions (seller_id, updated_at desc);

create index if not exists transactions_conversation_idx
  on public.transactions (conversation_id, updated_at desc);

create index if not exists transactions_cancelled_by_idx
  on public.transactions (cancelled_by, cancelled_at desc)
  where cancelled_by is not null;

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewed_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reviewer_id <> reviewed_id),
  check (char_length(coalesce(comment, '')) <= 500),
  unique (transaction_id, reviewer_id)
);

create index if not exists reviews_reviewed_recent_idx
  on public.reviews (reviewed_id, created_at desc);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks (blocked_id);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null
    check (target_type in ('product', 'user', 'conversation')),
  product_id uuid references public.products(id) on delete set null,
  reported_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  reason text not null
    check (
      reason in (
        'spam',
        'fraud',
        'inappropriate',
        'harassment',
        'unsafe',
        'wrong_information',
        'other'
      )
    ),
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  resolution_note text,
  evidence jsonb not null default '{}'::jsonb,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(coalesce(details, '')) <= 1000)
);

alter table public.reports
  add column if not exists evidence jsonb not null default '{}'::jsonb;

create index if not exists reports_status_recent_idx
  on public.reports (status, created_at desc);

create index if not exists reports_reporter_recent_idx
  on public.reports (reporter_id, created_at desc);

create or replace function public.are_users_blocked(
  first_user uuid,
  second_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks
    where
      (blocker_id = first_user and blocked_id = second_user)
      or
      (blocker_id = second_user and blocked_id = first_user)
  );
$$;

create or replace function public.is_admin_account(account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where user_id = account_id
  );
$$;

create or replace function public.refresh_profile_trust(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    rating = coalesce(
      (
        select round(avg(reviews.rating)::numeric, 2)
        from public.reviews
        where reviews.reviewed_id = target_user
      ),
      0
    ),
    rating_count = (
      select count(*)::integer
      from public.reviews
      where reviews.reviewed_id = target_user
    ),
    sales_count = (
      select count(*)::integer
      from public.transactions
      where transactions.seller_id = target_user
        and transactions.status = 'completed'
    ),
    updated_at = now()
  where profiles.id = target_user;
end;
$$;

create or replace function public.reserve_product_for_conversation(
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
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  select *
  into conversation_row
  from public.conversations
  where id = target_conversation
  for update;

  if not found or conversation_row.seller_id <> actor_id then
    raise exception 'Solo el vendedor puede reservar este producto.';
  end if;

  if public.are_users_blocked(
    conversation_row.buyer_id,
    conversation_row.seller_id
  ) then
    raise exception 'No se puede reservar dentro de esta conversación.';
  end if;

  select *
  into product_row
  from public.products
  where id = conversation_row.product_id
  for update;

  if not found
    or product_row.user_id <> actor_id
    or product_row.status <> 'available'
  then
    raise exception 'El producto ya no está disponible.';
  end if;

  update public.transactions
  set
    status = 'cancelled',
    cancelled_at = now(),
    updated_at = now()
  where product_id = product_row.id
    and status = 'reserved';

  insert into public.transactions (
    product_id,
    conversation_id,
    buyer_id,
    seller_id,
    status
  )
  values (
    product_row.id,
    conversation_row.id,
    conversation_row.buyer_id,
    conversation_row.seller_id,
    'reserved'
  );

  update public.products
  set
    status = 'reserved',
    reserved_for = conversation_row.buyer_id,
    updated_at = now()
  where id = product_row.id
  returning * into product_row;

  return product_row;
end;
$$;

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
    raise exception 'Esta conversación no tiene la reserva activa.';
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

create or replace function public.complete_sale_for_conversation(
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
  transaction_id uuid;
begin
  select *
  into conversation_row
  from public.conversations
  where id = target_conversation
  for update;

  if actor_id is null
    or not found
    or conversation_row.seller_id <> actor_id
  then
    raise exception 'Solo el vendedor puede completar esta venta.';
  end if;

  select *
  into product_row
  from public.products
  where id = conversation_row.product_id
  for update;

  if not found
    or product_row.user_id <> actor_id
    or product_row.status not in ('available', 'reserved')
    or (
      product_row.reserved_for is not null
      and product_row.reserved_for <> conversation_row.buyer_id
    )
  then
    raise exception 'El producto no puede venderse desde esta conversación.';
  end if;

  update public.transactions
  set
    status = 'completed',
    completed_at = now(),
    updated_at = now()
  where product_id = product_row.id
    and conversation_id = conversation_row.id
    and status = 'reserved'
  returning id into transaction_id;

  if transaction_id is null then
    insert into public.transactions (
      product_id,
      conversation_id,
      buyer_id,
      seller_id,
      status,
      completed_at
    )
    values (
      product_row.id,
      conversation_row.id,
      conversation_row.buyer_id,
      conversation_row.seller_id,
      'completed',
      now()
    )
    returning id into transaction_id;
  end if;

  update public.products
  set
    status = 'sold',
    reserved_for = conversation_row.buyer_id,
    updated_at = now()
  where id = product_row.id
  returning * into product_row;

  perform public.refresh_profile_trust(conversation_row.seller_id);
  return product_row;
end;
$$;

create or replace function public.reopen_product_listing(
  target_product uuid
)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  product_row public.products%rowtype;
begin
  update public.products
  set
    status = 'available',
    reserved_for = null,
    updated_at = now()
  where id = target_product
    and user_id = actor_id
    and status = 'sold'
  returning * into product_row;

  if product_row.id is null then
    raise exception 'No se pudo volver a publicar este producto.';
  end if;

  return product_row;
end;
$$;

create or replace function public.submit_transaction_review(
  target_transaction uuid,
  selected_rating smallint,
  review_comment text default null
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  transaction_row public.transactions%rowtype;
  target_user uuid;
  review_row public.reviews%rowtype;
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  if selected_rating not between 1 and 5 then
    raise exception 'La calificación debe ser de 1 a 5.';
  end if;

  if char_length(coalesce(review_comment, '')) > 500 then
    raise exception 'El comentario supera los 500 caracteres.';
  end if;

  select *
  into transaction_row
  from public.transactions
  where id = target_transaction
    and status = 'completed';

  if not found
    or actor_id not in (transaction_row.buyer_id, transaction_row.seller_id)
  then
    raise exception 'No podés calificar esta operación.';
  end if;

  target_user := case
    when actor_id = transaction_row.buyer_id then transaction_row.seller_id
    else transaction_row.buyer_id
  end;

  insert into public.reviews (
    transaction_id,
    reviewer_id,
    reviewed_id,
    rating,
    comment
  )
  values (
    transaction_row.id,
    actor_id,
    target_user,
    selected_rating,
    nullif(btrim(review_comment), '')
  )
  returning * into review_row;

  perform public.refresh_profile_trust(target_user);
  return review_row;
end;
$$;

create or replace function public.create_safety_report(
  selected_target_type text,
  selected_target_id uuid,
  selected_reason text,
  report_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  report_id uuid;
  product_target uuid;
  user_target uuid;
  conversation_target uuid;
  conversation_row public.conversations%rowtype;
  report_evidence jsonb := '{}'::jsonb;
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  if selected_target_type not in ('product', 'user', 'conversation') then
    raise exception 'Tipo de reporte inválido.';
  end if;

  if selected_reason not in (
    'spam',
    'fraud',
    'inappropriate',
    'harassment',
    'unsafe',
    'wrong_information',
    'other'
  ) then
    raise exception 'Motivo de reporte inválido.';
  end if;

  if char_length(coalesce(report_details, '')) > 1000 then
    raise exception 'El detalle supera los 1000 caracteres.';
  end if;

  if selected_target_type = 'product' then
    select products.id, products.user_id
    into product_target, user_target
    from public.products
    where products.id = selected_target_id;

    if product_target is null or user_target = actor_id then
      raise exception 'No se puede reportar esta publicación.';
    end if;
  elsif selected_target_type = 'user' then
    if selected_target_id = actor_id then
      raise exception 'No podés reportarte a vos mismo.';
    end if;
    user_target := selected_target_id;
  else
    select *
    into conversation_row
    from public.conversations
    where id = selected_target_id
      and actor_id in (buyer_id, seller_id);

    if not found then
      raise exception 'No podés reportar esta conversación.';
    end if;

    conversation_target := conversation_row.id;
    product_target := conversation_row.product_id;
    user_target := case
      when actor_id = conversation_row.buyer_id then conversation_row.seller_id
      else conversation_row.buyer_id
    end;

    select jsonb_build_object(
      'messages',
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'sender_id', evidence_rows.sender_id,
            'body', evidence_rows.body,
            'created_at', evidence_rows.created_at
          )
          order by evidence_rows.created_at asc
        ),
        '[]'::jsonb
      )
    )
    into report_evidence
    from (
      select sender_id, body, created_at
      from public.messages
      where conversation_id = conversation_row.id
      order by created_at desc
      limit 20
    ) as evidence_rows;
  end if;

  insert into public.reports (
    reporter_id,
    target_type,
    product_id,
    reported_user_id,
    conversation_id,
    reason,
    details,
    evidence
  )
  values (
    actor_id,
    selected_target_type,
    product_target,
    user_target,
    conversation_target,
    selected_reason,
    nullif(btrim(report_details), ''),
    report_evidence
  )
  returning id into report_id;

  return report_id;
end;
$$;

create or replace function public.block_user(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or target_user is null or actor_id = target_user then
    raise exception 'No se puede bloquear este usuario.';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id)
  values (actor_id, target_user)
  on conflict (blocker_id, blocked_id) do nothing;

  return true;
end;
$$;

create or replace function public.unblock_user(target_user uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_blocks
  where blocker_id = auth.uid()
    and blocked_id = target_user;

  return found;
end;
$$;

create or replace function public.moderate_safety_report(
  target_report uuid,
  moderation_action text,
  moderator_note text default null
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  report_row public.reports%rowtype;
  next_status text;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de moderación.';
  end if;

  if moderation_action not in (
    'reviewing',
    'resolved',
    'dismissed',
    'pause_product'
  ) then
    raise exception 'Acción de moderación inválida.';
  end if;

  select *
  into report_row
  from public.reports
  where id = target_report
  for update;

  if not found then
    raise exception 'No se encontró el reporte.';
  end if;

  if moderation_action = 'pause_product' then
    if report_row.product_id is null then
      raise exception 'Este reporte no tiene una publicación asociada.';
    end if;

    update public.products
    set
      status = 'paused',
      updated_at = now()
    where id = report_row.product_id;

    next_status := 'resolved';
  else
    next_status := moderation_action;
  end if;

  update public.reports
  set
    status = next_status,
    resolution_note = nullif(btrim(moderator_note), ''),
    resolved_by = case
      when next_status in ('resolved', 'dismissed') then actor_id
      else null
    end,
    resolved_at = case
      when next_status in ('resolved', 'dismissed') then now()
      else null
    end,
    updated_at = now()
  where id = report_row.id
  returning * into report_row;

  return report_row;
end;
$$;

create or replace function public.notify_completed_transaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_title text;
begin
  if new.status <> 'completed' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select coalesce(nullif(btrim(title), ''), 'el producto')
  into product_title
  from public.products
  where id = new.product_id;

  insert into public.notifications (
    user_id,
    actor_id,
    type,
    title,
    body,
    product_id,
    conversation_id,
    action_url,
    metadata
  )
  values
    (
      new.buyer_id,
      new.seller_id,
      'review_requested',
      '¿Cómo fue la compra?',
      'Calificá tu experiencia con ' || product_title || '.',
      new.product_id,
      new.conversation_id,
      'mensajes.html?id=' || new.conversation_id,
      jsonb_build_object('transaction_id', new.id)
    ),
    (
      new.seller_id,
      new.buyer_id,
      'review_requested',
      '¿Cómo fue la venta?',
      'Calificá tu experiencia con ' || product_title || '.',
      new.product_id,
      new.conversation_id,
      'mensajes.html?id=' || new.conversation_id,
      jsonb_build_object('transaction_id', new.id)
    );

  return new;
end;
$$;

drop trigger if exists trust_after_transaction_completed
on public.transactions;

create trigger trust_after_transaction_completed
after insert or update of status on public.transactions
for each row
execute function public.notify_completed_transaction();

alter table public.transactions enable row level security;
alter table public.reviews enable row level security;
alter table public.user_blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Participants read transactions"
on public.transactions;
create policy "Participants read transactions"
on public.transactions
for select
to authenticated
using (auth.uid() in (buyer_id, seller_id));

drop policy if exists "Everyone reads reviews"
on public.reviews;
create policy "Everyone reads reviews"
on public.reviews
for select
to anon, authenticated
using (true);

drop policy if exists "Users read own blocks"
on public.user_blocks;
create policy "Users read own blocks"
on public.user_blocks
for select
to authenticated
using (auth.uid() = blocker_id);

drop policy if exists "Reporters and admins read reports"
on public.reports;
create policy "Reporters and admins read reports"
on public.reports
for select
to authenticated
using (
  auth.uid() = reporter_id
  or public.is_admin_account(auth.uid())
);

drop policy if exists "Admins update reports"
on public.reports;
create policy "Admins update reports"
on public.reports
for update
to authenticated
using (public.is_admin_account(auth.uid()))
with check (public.is_admin_account(auth.uid()));

drop policy if exists "Buyers can create conversations"
on public.conversations;
create policy "Buyers can create conversations"
on public.conversations
for insert
to authenticated
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and not public.are_users_blocked(buyer_id, seller_id)
  and exists (
    select 1
    from public.products
    where products.id = product_id
      and products.user_id = seller_id
      and products.status = 'available'
  )
);

drop policy if exists "Participants can send messages"
on public.messages;
create policy "Participants can send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and length(btrim(body)) between 1 and 2000
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.buyer_id = auth.uid()
        or conversations.seller_id = auth.uid()
      )
      and not public.are_users_blocked(
        conversations.buyer_id,
        conversations.seller_id
      )
  )
);

revoke all on public.transactions from public, anon;
revoke insert, update, delete on public.transactions from authenticated;
grant select on public.transactions to authenticated;

revoke insert, update, delete on public.reviews from public, anon, authenticated;
grant select on public.reviews to anon, authenticated;

revoke all on public.user_blocks from public, anon;
revoke insert, update, delete on public.user_blocks from authenticated;
grant select on public.user_blocks to authenticated;

revoke all on public.reports from public, anon;
revoke insert, delete on public.reports from authenticated;
grant select on public.reports to authenticated;
grant update (status, resolution_note, resolved_by, resolved_at, updated_at)
on public.reports to authenticated;

revoke all on function public.are_users_blocked(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.are_users_blocked(uuid, uuid)
to authenticated;
revoke all on function public.is_admin_account(uuid)
from public, anon, authenticated;
grant execute on function public.is_admin_account(uuid)
to authenticated;
revoke all on function public.refresh_profile_trust(uuid)
from public, anon, authenticated;
revoke all on function public.notify_completed_transaction()
from public, anon, authenticated;

revoke all on function public.reserve_product_for_conversation(uuid)
from public, anon, authenticated;
grant execute on function public.reserve_product_for_conversation(uuid)
to authenticated;

revoke all on function public.cancel_product_reservation(uuid)
from public, anon, authenticated;
grant execute on function public.cancel_product_reservation(uuid)
to authenticated;

revoke all on function public.complete_sale_for_conversation(uuid)
from public, anon, authenticated;
grant execute on function public.complete_sale_for_conversation(uuid)
to authenticated;

revoke all on function public.reopen_product_listing(uuid)
from public, anon, authenticated;
grant execute on function public.reopen_product_listing(uuid)
to authenticated;

revoke all on function public.submit_transaction_review(uuid, smallint, text)
from public, anon, authenticated;
grant execute on function public.submit_transaction_review(uuid, smallint, text)
to authenticated;

revoke all on function public.create_safety_report(text, uuid, text, text)
from public, anon, authenticated;
grant execute on function public.create_safety_report(text, uuid, text, text)
to authenticated;

revoke all on function public.block_user(uuid)
from public, anon, authenticated;
grant execute on function public.block_user(uuid)
to authenticated;

revoke all on function public.unblock_user(uuid)
from public, anon, authenticated;
grant execute on function public.unblock_user(uuid)
to authenticated;

revoke all on function public.moderate_safety_report(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.moderate_safety_report(uuid, text, text)
to authenticated;

select
  to_regclass('public.transactions') is not null as operaciones_configuradas,
  to_regclass('public.reviews') is not null as calificaciones_configuradas,
  to_regclass('public.reports') is not null as reportes_configurados,
  to_regclass('public.user_blocks') is not null as bloqueos_configurados;
