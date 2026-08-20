-- ColegioLibre · Notificaciones 1.1
-- Ejecutar en un QUERY NUEVO de Supabase > SQL Editor.
-- Podés volver a ejecutarlo: está preparado para no duplicar triggers.

create extension if not exists pgcrypto;

-- Favoritos es una dependencia del sistema de notificaciones.
-- Se crea acá si el proyecto todavía no tiene esta tabla.
create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now()
);

create unique index if not exists favorites_user_product_unique_idx
  on public.favorites (user_id, product_id);

create index if not exists favorites_product_idx
  on public.favorites (product_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text not null,
  body text,
  product_id uuid references public.products(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action_url text,
  read boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists actor_id uuid references auth.users(id) on delete set null,
  add column if not exists type text,
  add column if not exists title text,
  add column if not exists body text,
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade,
  add column if not exists action_url text,
  add column if not exists read boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.products
  add column if not exists reserved_for uuid references auth.users(id) on delete set null;

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read, updated_at desc);

create index if not exists notifications_conversation_idx
  on public.notifications (conversation_id, updated_at desc)
  where conversation_id is not null;

create index if not exists notifications_product_idx
  on public.notifications (product_id, updated_at desc)
  where product_id is not null;

create index if not exists products_reserved_for_idx
  on public.products (reserved_for)
  where reserved_for is not null;

create or replace function public.notification_actor_name(actor_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(btrim(profiles.name), ''),
    'Alguien de ColegioLibre'
  )
  from public.profiles
  where profiles.id = actor_uuid
  limit 1;
$$;

create or replace function public.upsert_grouped_notification(
  recipient_uuid uuid,
  actor_uuid uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  related_product_uuid uuid default null,
  related_conversation_uuid uuid default null,
  destination_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_id uuid;
  next_count integer;
begin
  if recipient_uuid is null or recipient_uuid = actor_uuid then
    return null;
  end if;

  select notifications.id
  into existing_id
  from public.notifications
  where notifications.user_id = recipient_uuid
    and notifications.type = notification_type
    and notifications.read = false
    and notifications.product_id is not distinct from related_product_uuid
    and notifications.conversation_id is not distinct from related_conversation_uuid
  order by notifications.updated_at desc
  limit 1
  for update;

  if existing_id is not null then
    select coalesce((metadata ->> 'count')::integer, 1) + 1
    into next_count
    from public.notifications
    where id = existing_id;

    update public.notifications
    set
      actor_id = actor_uuid,
      title = notification_title,
      body = notification_body,
      action_url = destination_url,
      metadata = jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        '{count}',
        to_jsonb(next_count),
        true
      ),
      updated_at = now()
    where id = existing_id;

    return existing_id;
  end if;

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
  values (
    recipient_uuid,
    actor_uuid,
    notification_type,
    notification_title,
    notification_body,
    related_product_uuid,
    related_conversation_uuid,
    destination_url,
    jsonb_build_object('count', 1)
  )
  returning id into existing_id;

  return existing_id;
end;
$$;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  recipient_uuid uuid;
  actor_name text;
  product_title text;
begin
  select *
  into conversation_row
  from public.conversations
  where id = new.conversation_id;

  if not found then
    return new;
  end if;

  recipient_uuid := case
    when new.sender_id = conversation_row.buyer_id then conversation_row.seller_id
    else conversation_row.buyer_id
  end;

  actor_name := coalesce(
    public.notification_actor_name(new.sender_id),
    'Alguien de ColegioLibre'
  );

  select coalesce(nullif(btrim(products.title), ''), 'tu producto')
  into product_title
  from public.products
  where products.id = conversation_row.product_id;

  -- Cada mensaje crea una fila nueva. Esto es intencional: el Database Webhook
  -- escucha INSERT y así también envía push si ya había otro mensaje sin leer.
  if recipient_uuid is not null and recipient_uuid <> new.sender_id then
    insert into public.notifications (
      user_id, actor_id, type, title, body, product_id,
      conversation_id, action_url, metadata
    ) values (
      recipient_uuid,
      new.sender_id,
      'message',
      'Nuevo mensaje de ' || actor_name,
      left(new.body, 140),
      conversation_row.product_id,
      new.conversation_id,
      'mensajes.html?id=' || new.conversation_id::text,
      jsonb_build_object('message_id', new.id)
    );
  end if;

  return new;
end;
$$;

create or replace function public.notify_new_favorite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_uuid uuid;
  actor_name text;
  product_title text;
begin
  select products.user_id, products.title
  into owner_uuid, product_title
  from public.products
  where products.id = new.product_id;

  if owner_uuid is null or owner_uuid = new.user_id then
    return new;
  end if;

  actor_name := coalesce(
    public.notification_actor_name(new.user_id),
    'Alguien de ColegioLibre'
  );

  perform public.upsert_grouped_notification(
    owner_uuid,
    new.user_id,
    'favorite',
    'Guardaron tu publicación',
    actor_name || ' guardó “' || coalesce(product_title, 'tu producto') || '” en favoritos.',
    new.product_id,
    null,
    'producto.html?id=' || new.product_id::text
  );

  return new;
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

drop trigger if exists notifications_after_message_insert on public.messages;
create trigger notifications_after_message_insert
after insert on public.messages
for each row
execute function public.notify_new_message();

drop trigger if exists notifications_after_favorite_insert on public.favorites;
create trigger notifications_after_favorite_insert
after insert on public.favorites
for each row
execute function public.notify_new_favorite();

drop trigger if exists notifications_after_product_status on public.products;
create trigger notifications_after_product_status
after update of status, reserved_for on public.products
for each row
execute function public.notify_product_status_change();

alter table public.notifications enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "Users read own favorites"
on public.favorites;

create policy "Users read own favorites"
on public.favorites
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1
    from public.products
    where products.id = favorites.product_id
      and products.user_id = auth.uid()
  )
);

drop policy if exists "Users create own favorites"
on public.favorites;

create policy "Users create own favorites"
on public.favorites
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users delete own favorites"
on public.favorites;

create policy "Users delete own favorites"
on public.favorites
for delete
to authenticated
using (auth.uid() = user_id);

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notifications'
  loop
    execute format(
      'drop policy if exists %I on public.notifications',
      policy_row.policyname
    );
  end loop;
end
$$;

create policy "Users read own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users mark own notifications read"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

revoke all on public.notifications from public, anon;
revoke insert, delete, update on public.notifications from authenticated;
grant select on public.notifications to authenticated;
grant update (read) on public.notifications to authenticated;

revoke all on public.favorites from public, anon;
revoke update on public.favorites from authenticated;
grant select, insert, delete on public.favorites to authenticated;

revoke all on function public.upsert_grouped_notification(
  uuid, uuid, text, text, text, uuid, uuid, text
) from public, anon, authenticated;

revoke all on function public.notification_actor_name(uuid)
from public, anon, authenticated;

alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end
$$;

select
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'favorites'
  ) as tabla_favoritos,
  exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'notifications'
  ) as tabla_notificaciones,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'reserved_for'
  ) as productos_con_reserva,
  (
    select count(*) = 3
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'notifications_after_message_insert',
        'notifications_after_favorite_insert',
        'notifications_after_product_status'
      )
  ) as tres_automatizaciones;
