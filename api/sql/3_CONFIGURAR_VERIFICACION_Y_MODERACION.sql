-- ColegioLibre · Verificación escolar y moderación 1.0
-- Ejecutar DESPUÉS de:
--   1_CONFIGURAR_MENSAJES_SUPABASE.sql
--   1_CONFIGURAR_NOTIFICACIONES_SUPABASE.sql
--   2_CONFIGURAR_CONFIANZA_Y_SEGURIDAD.sql
--
-- Este script:
--   · verifica el email antes de verificar un colegio;
--   · permite códigos temporales por colegio y revisión manual;
--   · permite suspender o bloquear cuentas;
--   · bloquea o manda a revisión publicaciones prohibidas;
--   · refuerza Publicar, Mi colegio y Mensajes desde Supabase.

create extension if not exists pgcrypto;

alter table public.profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists school_verification_status text not null default 'unverified',
  add column if not exists verification_method text,
  add column if not exists school_verified_at timestamptz,
  add column if not exists school_verification_updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_account_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'suspended', 'banned'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_school_verification_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_school_verification_status_check
      check (
        school_verification_status in (
          'unverified',
          'pending',
          'verified',
          'rejected'
        )
      );
  end if;
end;
$$;

create table if not exists public.school_invite_codes (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  code_hash text not null unique,
  code_prefix text not null,
  label text,
  max_uses integer not null default 1 check (max_uses between 1 and 10000),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (char_length(coalesce(label, '')) <= 120)
);

create index if not exists school_invite_codes_school_idx
  on public.school_invite_codes (school_code, is_active, expires_at desc);

create table if not exists public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_code text not null,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  verification_method text
    check (verification_method is null or verification_method in ('invite_code', 'admin')),
  invite_code_id uuid references public.school_invite_codes(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, school_code),
  check (char_length(coalesce(rejection_reason, '')) <= 500)
);

create index if not exists school_memberships_status_idx
  on public.school_memberships (status, updated_at desc);

create index if not exists school_memberships_school_idx
  on public.school_memberships (school_code, status, updated_at desc);

create table if not exists public.account_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references auth.users(id) on delete cascade,
  previous_status text not null,
  next_status text not null,
  reason text not null,
  moderator_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (previous_status in ('active', 'suspended', 'banned')),
  check (next_status in ('active', 'suspended', 'banned')),
  check (char_length(reason) between 3 and 500)
);

create index if not exists account_moderation_actions_user_idx
  on public.account_moderation_actions (target_user_id, created_at desc);

create table if not exists public.prohibited_product_rules (
  id uuid primary key default gen_random_uuid(),
  field text not null default 'all'
    check (field in ('all', 'title', 'description', 'category')),
  match_type text not null default 'contains'
    check (match_type in ('contains', 'exact')),
  pattern text not null,
  severity text not null default 'block'
    check (severity in ('block', 'review')),
  adds_strike boolean not null default false,
  reason text not null,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(pattern)) between 2 and 120),
  check (char_length(btrim(reason)) between 3 and 300)
);

create unique index if not exists prohibited_product_rules_unique_active_idx
  on public.prohibited_product_rules (
    field,
    match_type,
    lower(pattern),
    severity
  )
  where is_active;

create table if not exists public.product_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  rule_id uuid not null references public.prohibited_product_rules(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  unique (product_id, rule_id)
);

create index if not exists product_moderation_flags_status_idx
  on public.product_moderation_flags (status, created_at desc);

create or replace function public.normalize_school_code(value text)
returns text
language sql
immutable
as $$
  select upper(btrim(coalesce(value, '')));
$$;

create or replace function public.account_can_trade(account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.id = account_id
      and p.account_status = 'active'
      and p.school_verification_status = 'verified'
      and nullif(btrim(p.school_code), '') is not null
      and u.email_confirmed_at is not null
  );
$$;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  trusted_writer boolean :=
    current_user in ('postgres', 'service_role', 'supabase_admin')
    or public.is_admin_account(auth.uid());
begin
  if tg_op = 'INSERT' then
    if not trusted_writer then
      new.account_status := 'active';
      new.school_verification_status := 'unverified';
      new.verification_method := null;
      new.school_verified_at := null;
      new.school_verification_updated_at := now();
    end if;
    return new;
  end if;

  if not trusted_writer then
    new.account_status := old.account_status;
    new.school_verification_status := old.school_verification_status;
    new.verification_method := old.verification_method;
    new.school_verified_at := old.school_verified_at;
    new.school_verification_updated_at := old.school_verification_updated_at;
  end if;

  if public.normalize_school_code(new.school_code)
     is distinct from public.normalize_school_code(old.school_code) then
    new.school_verification_status := 'unverified';
    new.verification_method := null;
    new.school_verified_at := null;
    new.school_verification_updated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields
on public.profiles;

create trigger profiles_protect_security_fields
before insert or update on public.profiles
for each row
execute function public.protect_profile_security_fields();

create or replace function public.request_school_verification()
returns public.school_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  selected_profile public.profiles%rowtype;
  membership public.school_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  select *
  into selected_profile
  from public.profiles
  where id = actor_id
  for update;

  if not found or nullif(btrim(selected_profile.school_code), '') is null then
    raise exception 'Primero seleccioná tu colegio.';
  end if;

  if selected_profile.account_status <> 'active' then
    raise exception 'Tu cuenta no está habilitada para solicitar verificación.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = actor_id
      and email_confirmed_at is not null
  ) then
    raise exception 'Primero confirmá tu correo electrónico.';
  end if;

  insert into public.school_memberships (
    user_id,
    school_code,
    status,
    verification_method,
    updated_at
  )
  values (
    actor_id,
    public.normalize_school_code(selected_profile.school_code),
    'pending',
    null,
    now()
  )
  on conflict (user_id, school_code)
  do update set
    status = case
      when public.school_memberships.status = 'verified'
        then public.school_memberships.status
      else 'pending'
    end,
    rejection_reason = case
      when public.school_memberships.status = 'verified'
        then public.school_memberships.rejection_reason
      else null
    end,
    updated_at = now()
  returning * into membership;

  if membership.status <> 'verified' then
    update public.profiles
    set
      school_verification_status = 'pending',
      verification_method = null,
      school_verified_at = null,
      school_verification_updated_at = now()
    where id = actor_id;
  end if;

  return membership;
end;
$$;

create or replace function public.redeem_school_invite_code(invitation_code text)
returns public.school_memberships
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  normalized_code text := upper(regexp_replace(btrim(coalesce(invitation_code, '')), '\s+', '', 'g'));
  hashed_code text;
  selected_profile public.profiles%rowtype;
  selected_invite public.school_invite_codes%rowtype;
  membership public.school_memberships%rowtype;
begin
  if actor_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  if char_length(normalized_code) < 8 then
    raise exception 'El código de verificación no es válido.';
  end if;

  select *
  into selected_profile
  from public.profiles
  where id = actor_id
  for update;

  if not found or nullif(btrim(selected_profile.school_code), '') is null then
    raise exception 'Primero seleccioná tu colegio.';
  end if;

  if selected_profile.account_status <> 'active' then
    raise exception 'Tu cuenta no está habilitada.';
  end if;

  if not exists (
    select 1
    from auth.users
    where id = actor_id
      and email_confirmed_at is not null
  ) then
    raise exception 'Primero confirmá tu correo electrónico.';
  end if;

  hashed_code := encode(digest(normalized_code, 'sha256'), 'hex');

  select *
  into selected_invite
  from public.school_invite_codes
  where code_hash = hashed_code
  for update;

  if not found
     or not selected_invite.is_active
     or selected_invite.expires_at <= now()
     or selected_invite.used_count >= selected_invite.max_uses then
    raise exception 'El código venció, ya fue usado o no existe.';
  end if;

  if public.normalize_school_code(selected_invite.school_code)
     <> public.normalize_school_code(selected_profile.school_code) then
    raise exception 'Ese código pertenece a otro colegio.';
  end if;

  insert into public.school_memberships (
    user_id,
    school_code,
    status,
    verification_method,
    invite_code_id,
    reviewed_at,
    updated_at
  )
  values (
    actor_id,
    public.normalize_school_code(selected_profile.school_code),
    'verified',
    'invite_code',
    selected_invite.id,
    now(),
    now()
  )
  on conflict (user_id, school_code)
  do update set
    status = 'verified',
    verification_method = 'invite_code',
    invite_code_id = excluded.invite_code_id,
    reviewed_by = null,
    reviewed_at = now(),
    rejection_reason = null,
    updated_at = now()
  returning * into membership;

  update public.school_invite_codes
  set
    used_count = used_count + 1,
    is_active = (used_count + 1) < max_uses,
    updated_at = now()
  where id = selected_invite.id;

  update public.profiles
  set
    school_verification_status = 'verified',
    verification_method = 'invite_code',
    school_verified_at = now(),
    school_verification_updated_at = now()
  where id = actor_id;

  return membership;
end;
$$;

create or replace function public.create_school_invite_code(
  target_school_code text,
  invite_label text default null,
  allowed_uses integer default 1,
  valid_until timestamptz default (now() + interval '7 days')
)
returns table (
  id uuid,
  invitation_code text,
  school_code text,
  expires_at timestamptz,
  max_uses integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  canonical_school_code text := public.normalize_school_code(target_school_code);
  plain_code text;
  created_invite public.school_invite_codes%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  if allowed_uses not between 1 and 10000 then
    raise exception 'La cantidad de usos debe estar entre 1 y 10000.';
  end if;

  if valid_until <= now() then
    raise exception 'La fecha de vencimiento debe ser futura.';
  end if;

  if not exists (
    select 1
    from public.schools s
    where public.normalize_school_code(s.code) = canonical_school_code
       or public.normalize_school_code(s.community_code) = canonical_school_code
  ) then
    raise exception 'El colegio indicado no existe.';
  end if;

  plain_code :=
    'CL-' ||
    upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4)) ||
    '-' ||
    upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));

  insert into public.school_invite_codes (
    school_code,
    code_hash,
    code_prefix,
    label,
    max_uses,
    expires_at,
    created_by
  )
  values (
    canonical_school_code,
    encode(digest(upper(replace(plain_code, ' ', '')), 'sha256'), 'hex'),
    left(plain_code, 7) || '…',
    nullif(btrim(invite_label), ''),
    allowed_uses,
    valid_until,
    actor_id
  )
  returning * into created_invite;

  return query
  select
    created_invite.id,
    plain_code,
    created_invite.school_code,
    created_invite.expires_at,
    created_invite.max_uses;
end;
$$;

create or replace function public.review_school_verification(
  target_membership uuid,
  decision text,
  moderator_note text default null
)
returns public.school_memberships
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  membership public.school_memberships%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  if decision not in ('verified', 'rejected') then
    raise exception 'La decisión debe ser verified o rejected.';
  end if;

  if decision = 'rejected' and char_length(btrim(coalesce(moderator_note, ''))) < 3 then
    raise exception 'Indicá el motivo del rechazo.';
  end if;

  update public.school_memberships
  set
    status = decision,
    verification_method = case when decision = 'verified' then 'admin' else null end,
    reviewed_by = actor_id,
    reviewed_at = now(),
    rejection_reason = case
      when decision = 'rejected' then btrim(moderator_note)
      else null
    end,
    updated_at = now()
  where id = target_membership
  returning * into membership;

  if not found then
    raise exception 'La solicitud no existe.';
  end if;

  update public.profiles
  set
    school_verification_status = decision,
    verification_method = case when decision = 'verified' then 'admin' else null end,
    school_verified_at = case when decision = 'verified' then now() else null end,
    school_verification_updated_at = now()
  where id = membership.user_id
    and public.normalize_school_code(school_code)
      = public.normalize_school_code(membership.school_code);

  return membership;
end;
$$;

create or replace function public.moderate_user_account(
  target_user uuid,
  next_account_status text,
  moderator_reason text
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  previous_status text;
  updated_profile public.profiles%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  if next_account_status not in ('active', 'suspended', 'banned') then
    raise exception 'Estado de cuenta inválido.';
  end if;

  if char_length(btrim(coalesce(moderator_reason, ''))) < 3 then
    raise exception 'Indicá el motivo de la acción.';
  end if;

  if target_user = actor_id or public.is_admin_account(target_user) then
    raise exception 'No podés aplicar esta acción a una cuenta administradora.';
  end if;

  select account_status
  into previous_status
  from public.profiles
  where id = target_user
  for update;

  if not found then
    raise exception 'La cuenta no existe.';
  end if;

  update public.profiles
  set
    account_status = next_account_status,
    updated_at = now()
  where id = target_user
  returning * into updated_profile;

  insert into public.account_moderation_actions (
    target_user_id,
    previous_status,
    next_status,
    reason,
    moderator_id
  )
  values (
    target_user,
    previous_status,
    next_account_status,
    btrim(moderator_reason),
    actor_id
  );

  if next_account_status in ('suspended', 'banned') then
    update public.products
    set status = 'paused', updated_at = now()
    where user_id = target_user
      and status in ('available', 'reserved');
  end if;

  return updated_profile;
end;
$$;

create or replace function public.create_product_rule(
  rule_field text,
  rule_match_type text,
  rule_pattern text,
  rule_severity text,
  rule_reason text,
  rule_adds_strike boolean default false
)
returns public.prohibited_product_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  created_rule public.prohibited_product_rules%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  if rule_field not in ('all', 'title', 'description', 'category')
     or rule_match_type not in ('contains', 'exact')
     or rule_severity not in ('block', 'review') then
    raise exception 'La configuración de la regla no es válida.';
  end if;

  insert into public.prohibited_product_rules (
    field,
    match_type,
    pattern,
    severity,
    adds_strike,
    reason,
    created_by
  )
  values (
    rule_field,
    rule_match_type,
    btrim(rule_pattern),
    rule_severity,
    case
      when rule_severity = 'block' then coalesce(rule_adds_strike, false)
      else false
    end,
    btrim(rule_reason),
    actor_id
  )
  returning * into created_rule;

  return created_rule;
end;
$$;

create or replace function public.toggle_product_rule(
  target_rule uuid,
  next_active boolean
)
returns public.prohibited_product_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  updated_rule public.prohibited_product_rules%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  update public.prohibited_product_rules
  set is_active = next_active, updated_at = now()
  where id = target_rule
  returning * into updated_rule;

  if not found then
    raise exception 'La regla no existe.';
  end if;

  return updated_rule;
end;
$$;

create or replace function public.product_rule_matches(
  rule_field text,
  match_type text,
  pattern text,
  product_title text,
  product_description text,
  product_category text
)
returns boolean
language plpgsql
immutable
as $$
declare
  normalized_pattern text := lower(btrim(coalesce(pattern, '')));
  compared_value text;
begin
  compared_value := case rule_field
    when 'title' then lower(coalesce(product_title, ''))
    when 'description' then lower(coalesce(product_description, ''))
    when 'category' then lower(coalesce(product_category, ''))
    else lower(
      concat_ws(
        ' ',
        coalesce(product_title, ''),
        coalesce(product_description, ''),
        coalesce(product_category, '')
      )
    )
  end;

  if match_type = 'exact' then
    return btrim(compared_value) = normalized_pattern;
  end if;

  return position(normalized_pattern in compared_value) > 0;
end;
$$;

create or replace function public.enforce_product_access_and_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_rule public.prohibited_product_rules%rowtype;
  should_check_rules boolean := tg_op = 'INSERT';
begin
  if auth.uid() is not null
     and not public.is_admin_account(auth.uid())
     and not public.account_can_trade(auth.uid()) then
    raise exception 'Verificá tu colegio y confirmá tu email antes de publicar.';
  end if;

  if auth.uid() is not null
     and not public.is_admin_account(auth.uid())
     and new.user_id <> auth.uid() then
    raise exception 'No podés modificar publicaciones de otra persona.';
  end if;

  if tg_op = 'UPDATE' then
    should_check_rules :=
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or (
        new.status = 'available'
        and old.status is distinct from 'available'
      );
  end if;

  if not should_check_rules then
    return new;
  end if;

  for matched_rule in
    select *
    from public.prohibited_product_rules
    where is_active
    order by case severity when 'block' then 0 else 1 end, created_at
  loop
    if public.product_rule_matches(
      matched_rule.field,
      matched_rule.match_type,
      matched_rule.pattern,
      new.title,
      new.description,
      new.category
    ) then
      if matched_rule.severity = 'block' then
        raise exception 'PRODUCTO_PROHIBIDO: %', matched_rule.reason;
      end if;
      new.status := 'paused';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists products_enforce_access_and_rules
on public.products;

create trigger products_enforce_access_and_rules
before insert or update on public.products
for each row
execute function public.enforce_product_access_and_rules();

create or replace function public.flag_product_for_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.description is not distinct from old.description
     and new.category is not distinct from old.category then
    return new;
  end if;

  insert into public.product_moderation_flags (product_id, rule_id)
  select new.id, rules.id
  from public.prohibited_product_rules rules
  where rules.is_active
    and rules.severity = 'review'
    and public.product_rule_matches(
      rules.field,
      rules.match_type,
      rules.pattern,
      new.title,
      new.description,
      new.category
    )
  on conflict (product_id, rule_id) do nothing;

  return new;
end;
$$;

drop trigger if exists products_flag_for_review
on public.products;

create trigger products_flag_for_review
after insert or update on public.products
for each row
execute function public.flag_product_for_review();

create or replace function public.enforce_transaction_account_access()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_admin_account(auth.uid())
     and not public.account_can_trade(auth.uid()) then
    raise exception 'Tu cuenta debe estar activa y verificada.';
  end if;
  return new;
end;
$$;

drop trigger if exists transactions_enforce_account_access
on public.transactions;

create trigger transactions_enforce_account_access
before insert or update on public.transactions
for each row
execute function public.enforce_transaction_account_access();

alter table public.school_invite_codes enable row level security;
alter table public.school_memberships enable row level security;
alter table public.account_moderation_actions enable row level security;
alter table public.prohibited_product_rules enable row level security;
alter table public.product_moderation_flags enable row level security;

drop policy if exists "Users read own school membership"
on public.school_memberships;
create policy "Users read own school membership"
on public.school_memberships
for select
to authenticated
using (
  auth.uid() = user_id
  or public.is_admin_account(auth.uid())
);

drop policy if exists "Admins read school invite codes"
on public.school_invite_codes;
create policy "Admins read school invite codes"
on public.school_invite_codes
for select
to authenticated
using (public.is_admin_account(auth.uid()));

drop policy if exists "Admins read account actions"
on public.account_moderation_actions;
create policy "Admins read account actions"
on public.account_moderation_actions
for select
to authenticated
using (public.is_admin_account(auth.uid()));

drop policy if exists "Admins read product rules"
on public.prohibited_product_rules;
create policy "Admins read product rules"
on public.prohibited_product_rules
for select
to authenticated
using (public.is_admin_account(auth.uid()));

drop policy if exists "Admins read product flags"
on public.product_moderation_flags;
create policy "Admins read product flags"
on public.product_moderation_flags
for select
to authenticated
using (public.is_admin_account(auth.uid()));

drop policy if exists "Users can update own products"
on public.products;
create policy "Users can update own products"
on public.products
for update
to authenticated
using (
  auth.uid() = user_id
  and public.account_can_trade(auth.uid())
)
with check (
  auth.uid() = user_id
  and public.account_can_trade(auth.uid())
);

drop policy if exists "Users can create own products"
on public.products;
create policy "Users can create own products"
on public.products
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.account_can_trade(auth.uid())
);

drop policy if exists "Buyers can create conversations"
on public.conversations;
create policy "Buyers can create conversations"
on public.conversations
for insert
to authenticated
with check (
  auth.uid() = buyer_id
  and buyer_id <> seller_id
  and public.account_can_trade(buyer_id)
  and public.account_can_trade(seller_id)
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
  and public.account_can_trade(auth.uid())
  and length(btrim(body)) between 1 and 2000
  and exists (
    select 1
    from public.conversations
    where conversations.id = messages.conversation_id
      and (
        conversations.buyer_id = auth.uid()
        or conversations.seller_id = auth.uid()
      )
      and public.account_can_trade(conversations.buyer_id)
      and public.account_can_trade(conversations.seller_id)
      and not public.are_users_blocked(
        conversations.buyer_id,
        conversations.seller_id
      )
  )
);

revoke all on public.school_invite_codes from public, anon;
revoke insert, update, delete on public.school_invite_codes from authenticated;
grant select on public.school_invite_codes to authenticated;

revoke all on public.school_memberships from public, anon;
revoke insert, update, delete on public.school_memberships from authenticated;
grant select on public.school_memberships to authenticated;

revoke all on public.account_moderation_actions from public, anon;
revoke insert, update, delete on public.account_moderation_actions from authenticated;
grant select on public.account_moderation_actions to authenticated;

revoke all on public.prohibited_product_rules from public, anon;
revoke insert, update, delete on public.prohibited_product_rules from authenticated;
grant select on public.prohibited_product_rules to authenticated;

revoke all on public.product_moderation_flags from public, anon;
revoke insert, update, delete on public.product_moderation_flags from authenticated;
grant select on public.product_moderation_flags to authenticated;

revoke all on function public.account_can_trade(uuid)
from public, anon;
grant execute on function public.account_can_trade(uuid)
to authenticated;

revoke all on function public.request_school_verification()
from public, anon;
grant execute on function public.request_school_verification()
to authenticated;

revoke all on function public.redeem_school_invite_code(text)
from public, anon;
grant execute on function public.redeem_school_invite_code(text)
to authenticated;

revoke all on function public.create_school_invite_code(text, text, integer, timestamptz)
from public, anon, authenticated;
grant execute on function public.create_school_invite_code(text, text, integer, timestamptz)
to authenticated;

revoke all on function public.review_school_verification(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.review_school_verification(uuid, text, text)
to authenticated;

revoke all on function public.moderate_user_account(uuid, text, text)
from public, anon, authenticated;
grant execute on function public.moderate_user_account(uuid, text, text)
to authenticated;

revoke all on function public.create_product_rule(
  text, text, text, text, text, boolean
)
from public, anon, authenticated;
grant execute on function public.create_product_rule(
  text, text, text, text, text, boolean
)
to authenticated;

revoke all on function public.toggle_product_rule(uuid, boolean)
from public, anon, authenticated;
grant execute on function public.toggle_product_rule(uuid, boolean)
to authenticated;

-- Comprobación: el resultado esperado es todo "true".
select
  to_regclass('public.school_memberships') is not null
    as membresias_configuradas,
  to_regclass('public.school_invite_codes') is not null
    as invitaciones_configuradas,
  to_regclass('public.prohibited_product_rules') is not null
    as reglas_configuradas,
  to_regclass('public.account_moderation_actions') is not null
    as cuentas_configuradas,
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name in (
        'account_status',
        'school_verification_status',
        'school_verified_at'
      )
  ) as perfiles_configurados;
