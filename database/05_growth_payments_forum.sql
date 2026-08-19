-- ColegioLibre: planes pagos, pedidos de materiales y coincidencias automáticas.
-- Ejecutar una vez en Supabase > SQL Editor.

alter table public.institution_requests
  add column if not exists subscription_status text not null default 'not_required',
  add column if not exists mercadopago_subscription_id text;

create table if not exists public.institution_subscriptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.institution_requests(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  plan text not null,
  billing_cycle text not null,
  amount numeric(12,2) not null,
  currency text not null default 'ARS',
  provider text not null default 'mercadopago',
  provider_subscription_id text unique,
  status text not null default 'pending',
  init_point text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists institution_subscriptions_request_unique
  on public.institution_subscriptions(request_id);

alter table public.institution_subscriptions enable row level security;
drop policy if exists "Users read own subscriptions" on public.institution_subscriptions;
create policy "Users read own subscriptions" on public.institution_subscriptions
  for select to authenticated using (auth.uid() = user_id);

create table if not exists public.wanted_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  query text not null check (char_length(query) between 2 and 120),
  category text,
  transaction_type text not null default 'buy' check (transaction_type in ('buy','exchange','either')),
  description text,
  scope text not null check (scope in ('school','zone','country')),
  school_code text,
  school_name text,
  zone_code text,
  country text not null default 'Argentina',
  status text not null default 'active' check (status in ('active','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wanted_posts
  add column if not exists transaction_type text not null default 'buy';

create index if not exists wanted_posts_match_idx
  on public.wanted_posts(status, scope, school_code, zone_code);
alter table public.wanted_posts enable row level security;
drop policy if exists "Anyone reads active wanted posts" on public.wanted_posts;
create policy "Anyone reads active wanted posts" on public.wanted_posts
  for select using (status = 'active' or auth.uid() = user_id);
drop policy if exists "Users create wanted posts" on public.wanted_posts;
create policy "Users create wanted posts" on public.wanted_posts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users update own wanted posts" on public.wanted_posts;
create policy "Users update own wanted posts" on public.wanted_posts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users delete own wanted posts" on public.wanted_posts;
create policy "Users delete own wanted posts" on public.wanted_posts
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.notify_wanted_product_matches()
returns trigger language plpgsql security definer set search_path = public as $$
declare wanted record;
declare searchable text;
begin
  if coalesce(new.status, 'available') <> 'available' then return new; end if;
  searchable := lower(concat_ws(' ', new.title, new.description, new.category));
  for wanted in
    select * from public.wanted_posts w
    where w.status = 'active'
      and w.user_id <> new.user_id
      and searchable like '%' || lower(w.query) || '%'
      and (
        w.scope = 'country'
        or (w.scope = 'zone' and upper(coalesce(w.zone_code,'')) = upper(coalesce(new.zone_code,'')))
        or (w.scope = 'school' and upper(coalesce(w.school_code,'')) = upper(coalesce(new.school_code,'')))
      )
  loop
    if not exists (
      select 1 from public.notifications n
      where n.user_id = wanted.user_id and n.product_id = new.id
        and n.type = 'wanted_match'
        and n.metadata->>'wanted_post_id' = wanted.id::text
    ) then
      insert into public.notifications
        (user_id, actor_id, type, title, body, product_id, action_url, metadata)
      values
        (wanted.user_id, new.user_id, 'wanted_match', 'Encontramos lo que buscabas',
         'Se publicó “' || new.title || '” en ColegioLibre.', new.id,
         'producto.html?id=' || new.id,
         jsonb_build_object('wanted_post_id', wanted.id, 'scope', wanted.scope));
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists products_notify_wanted_matches on public.products;
create trigger products_notify_wanted_matches
after insert on public.products for each row execute function public.notify_wanted_product_matches();
