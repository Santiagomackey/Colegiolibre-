-- ColegioLibre · Mensajes 2.0
-- Ejecutar una sola vez en Supabase > SQL Editor.
-- Es idempotente: se puede volver a ejecutar si una parte ya existía.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_different_users check (buyer_id <> seller_id)
);

alter table public.conversations
  add column if not exists product_id uuid references public.products(id) on delete cascade,
  add column if not exists buyer_id uuid references auth.users(id) on delete cascade,
  add column if not exists seller_id uuid references auth.users(id) on delete cascade,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_message_at timestamptz;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.messages
  add column if not exists conversation_id uuid references public.conversations(id) on delete cascade,
  add column if not exists sender_id uuid references auth.users(id) on delete cascade,
  add column if not exists body text,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.conversations'::regclass
      and conname = 'conversations_different_users_v2'
  ) then
    alter table public.conversations
      add constraint conversations_different_users_v2
      check (buyer_id <> seller_id) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.messages'::regclass
      and conname = 'messages_body_length_v2'
  ) then
    alter table public.messages
      add constraint messages_body_length_v2
      check (length(btrim(body)) between 1 and 2000) not valid;
  end if;
end
$$;

-- Si una versión anterior creó chats duplicados, conserva el más antiguo,
-- mueve sus mensajes al chat conservado y elimina solamente el duplicado.
do $$
declare
  duplicate_row record;
begin
  for duplicate_row in
    select
      id,
      first_value(id) over (
        partition by product_id, buyer_id, seller_id
        order by created_at asc, id asc
      ) as keep_id,
      row_number() over (
        partition by product_id, buyer_id, seller_id
        order by created_at asc, id asc
      ) as position
    from public.conversations
    where product_id is not null
      and buyer_id is not null
      and seller_id is not null
  loop
    if duplicate_row.position > 1 then
      update public.messages
      set conversation_id = duplicate_row.keep_id
      where conversation_id = duplicate_row.id;

      delete from public.conversations
      where id = duplicate_row.id;
    end if;
  end loop;
end
$$;

create unique index if not exists conversations_one_per_product_buyer
  on public.conversations (product_id, buyer_id, seller_id);

create index if not exists conversations_buyer_recent_idx
  on public.conversations (buyer_id, last_message_at desc nulls last);

create index if not exists conversations_seller_recent_idx
  on public.conversations (seller_id, last_message_at desc nulls last);

create index if not exists messages_conversation_recent_idx
  on public.messages (conversation_id, created_at);

create index if not exists messages_unread_idx
  on public.messages (conversation_id, sender_id, read_at)
  where read_at is null;

create or replace function public.touch_conversation_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set
    last_message_at = new.created_at,
    updated_at = now()
  where id = new.conversation_id;

  return new;
end;
$$;

drop trigger if exists messages_touch_conversation on public.messages;
create trigger messages_touch_conversation
after insert on public.messages
for each row
execute function public.touch_conversation_from_message();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

-- Reemplaza las políticas antiguas de estas dos tablas por un único modelo
-- consistente. service_role continúa teniendo acceso total porque omite RLS.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('conversations', 'messages')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end
$$;

drop policy if exists "Participants can read conversations"
  on public.conversations;
create policy "Participants can read conversations"
on public.conversations
for select
to authenticated
using (auth.uid() = buyer_id or auth.uid() = seller_id);

drop policy if exists "Buyers can create conversations"
  on public.conversations;
create policy "Buyers can create conversations"
on public.conversations
for insert
to authenticated
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and exists (
    select 1
    from public.products
    where products.id = product_id
      and products.user_id = seller_id
      and products.status = 'available'
  )
);

drop policy if exists "Participants can read messages"
  on public.messages;
create policy "Participants can read messages"
on public.messages
for select
to authenticated
using (
  exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.buyer_id = auth.uid()
        or conversations.seller_id = auth.uid()
      )
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
  )
);

drop policy if exists "Recipients can mark messages read"
  on public.messages;
create policy "Recipients can mark messages read"
on public.messages
for update
to authenticated
using (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.buyer_id = auth.uid()
        or conversations.seller_id = auth.uid()
      )
  )
)
with check (
  sender_id <> auth.uid()
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.buyer_id = auth.uid()
        or conversations.seller_id = auth.uid()
      )
  )
);

-- El vendedor puede reservar, vender o reactivar solamente sus productos.
alter table public.products enable row level security;

drop policy if exists "Users can update own products"
  on public.products;
create policy "Users can update own products"
on public.products
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

grant select, insert on public.conversations to authenticated;
grant select, insert on public.messages to authenticated;
revoke update on public.messages from public, anon, authenticated;
grant update (read_at) on public.messages to authenticated;

alter table public.messages replica identity full;
alter table public.conversations replica identity full;
alter table public.products replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversations'
  ) then
    execute 'alter publication supabase_realtime add table public.conversations';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'products'
  ) then
    execute 'alter publication supabase_realtime add table public.products';
  end if;
end
$$;

-- Comprobación rápida: debe devolver las columnas read_at y last_message_at.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'messages'
      and column_name = 'read_at'
  ) as mensajes_con_lectura,
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'conversations'
      and column_name = 'last_message_at'
  ) as conversaciones_con_actividad;
