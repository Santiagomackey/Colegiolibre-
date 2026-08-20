-- ColegioLibre · Moderación automática 1.0
-- Ejecutar una sola vez, DESPUÉS de:
--   3_CONFIGURAR_VERIFICACION_Y_MODERACION.sql
--
-- Esta migración:
--   · elimina la verificación escolar como requisito de uso;
--   · mantiene como requisitos una cuenta activa, email confirmado y colegio;
--   · pone las publicaciones nuevas o editadas en revisión;
--   · registra decisiones automáticas y manuales;
--   · aplica sanciones temporales progresivas solo para casos graves;
--   · nunca produce un baneo automático definitivo.

alter table public.profiles
  add column if not exists moderation_strikes integer not null default 0,
  add column if not exists moderation_restriction_until timestamptz,
  add column if not exists last_moderation_action_at timestamptz;

alter table public.products
  add column if not exists moderation_status text not null default 'approved',
  add column if not exists moderation_reason text,
  add column if not exists moderation_source text,
  add column if not exists moderation_confidence numeric(5, 4),
  add column if not exists moderated_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_moderation_strikes_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_moderation_strikes_check
      check (moderation_strikes >= 0);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_moderation_status_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_moderation_status_check
      check (
        moderation_status in (
          'pending',
          'approved',
          'rejected',
          'manual_review'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_moderation_confidence_check'
      and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_moderation_confidence_check
      check (
        moderation_confidence is null
        or moderation_confidence between 0 and 1
      );
  end if;
end;
$$;

create table if not exists public.product_moderation_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  decision text not null
    check (decision in ('pending', 'approved', 'rejected', 'manual_review')),
  severity text not null default 'low'
    check (severity in ('low', 'medium', 'high', 'critical')),
  reason text not null,
  source text not null default 'automatic'
    check (source in ('automatic', 'rules', 'openai', 'fallback', 'admin')),
  confidence numeric(5, 4),
  raw_details jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(btrim(reason)) between 2 and 800),
  check (confidence is null or confidence between 0 and 1)
);

create index if not exists product_moderation_reviews_product_idx
  on public.product_moderation_reviews (product_id, created_at desc);

create index if not exists product_moderation_reviews_queue_idx
  on public.product_moderation_reviews (decision, created_at desc);

create index if not exists product_moderation_reviews_user_idx
  on public.product_moderation_reviews (user_id, created_at desc);

-- Ya no se exige código ni aprobación manual del colegio.
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
      and p.account_status <> 'banned'
      and (
        p.account_status = 'active'
        or (
          p.account_status = 'suspended'
          and p.moderation_restriction_until is not null
          and p.moderation_restriction_until <= now()
        )
      )
      and (
        p.moderation_restriction_until is null
        or p.moderation_restriction_until <= now()
      )
      and nullif(btrim(p.school_code), '') is not null
      and u.email_confirmed_at is not null
  );
$$;

-- Los cambios de contenido hechos por una persona vuelven a la cola.
create or replace function public.queue_product_for_moderation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_normal_user boolean :=
    auth.uid() is not null
    and current_user not in ('postgres', 'service_role', 'supabase_admin')
    and not public.is_admin_account(auth.uid());
  content_changed boolean := tg_op = 'INSERT';
begin
  if not is_normal_user then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    content_changed :=
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.image_url is distinct from old.image_url
      or new.price is distinct from old.price;
  end if;

  if content_changed then
    new.status := 'paused';
    new.moderation_status := 'pending';
    new.moderation_reason := 'Estamos revisando la publicación.';
    new.moderation_source := null;
    new.moderation_confidence := null;
    new.moderated_at := null;
  end if;

  if new.status = 'available' and new.moderation_status <> 'approved' then
    raise exception 'Esta publicación todavía no fue aprobada.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_00_queue_for_moderation
on public.products;

create trigger products_00_queue_for_moderation
before insert or update on public.products
for each row
execute function public.queue_product_for_moderation();

create or replace function public.record_product_moderation_queue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  content_changed boolean := tg_op = 'INSERT';
begin
  if tg_op = 'UPDATE' then
    content_changed :=
      new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.category is distinct from old.category
      or new.image_url is distinct from old.image_url
      or new.price is distinct from old.price;
  end if;

  if content_changed and new.moderation_status = 'pending' then
    insert into public.product_moderation_reviews (
      product_id,
      user_id,
      decision,
      severity,
      reason,
      source,
      confidence
    )
    values (
      new.id,
      new.user_id,
      'pending',
      'low',
      'Esperando la revisión automática.',
      'automatic',
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists products_01_record_moderation_queue
on public.products;

create trigger products_01_record_moderation_queue
after insert or update on public.products
for each row
execute function public.record_product_moderation_queue();

-- Conserva control de acceso y propiedad, pero delega el análisis de contenido
-- al bot para poder explicar el resultado sin perder la publicación.
create or replace function public.enforce_product_access_and_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and not public.is_admin_account(auth.uid())
     and not public.account_can_trade(auth.uid()) then
    raise exception 'Confirmá tu email, elegí tu colegio y revisá el estado de tu cuenta.';
  end if;

  if auth.uid() is not null
     and not public.is_admin_account(auth.uid())
     and new.user_id <> auth.uid() then
    raise exception 'No podés modificar publicaciones de otra persona.';
  end if;

  return new;
end;
$$;

-- Solo la función privada de Vercel, usando service_role, puede aplicar
-- una decisión automática. No banea definitivamente a ninguna persona.
create or replace function public.apply_automated_moderation_decision(
  target_product_id uuid,
  next_decision text,
  decision_reason text,
  decision_severity text default 'low',
  decision_source text default 'automatic',
  decision_confidence numeric default null,
  decision_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_product public.products%rowtype;
  selected_profile public.profiles%rowtype;
  clean_decision text := lower(btrim(coalesce(next_decision, '')));
  clean_severity text := lower(btrim(coalesce(decision_severity, 'low')));
  clean_source text := lower(btrim(coalesce(decision_source, 'automatic')));
  new_strikes integer;
  restriction_until timestamptz;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Esta función solo puede ejecutarse desde el servidor privado.';
  end if;

  if clean_decision not in ('approved', 'rejected', 'manual_review') then
    raise exception 'Decisión de moderación inválida.';
  end if;

  if clean_severity not in ('low', 'medium', 'high', 'critical') then
    clean_severity := 'low';
  end if;

  if clean_source not in ('automatic', 'rules', 'openai', 'fallback', 'admin') then
    clean_source := 'automatic';
  end if;

  select *
  into selected_product
  from public.products
  where id = target_product_id
  for update;

  if not found then
    raise exception 'La publicación no existe.';
  end if;

  if selected_product.moderation_status <> 'pending' then
    return jsonb_build_object(
      'product_id', selected_product.id,
      'decision', selected_product.moderation_status,
      'status', selected_product.status,
      'already_processed', true
    );
  end if;

  update public.products
  set
    moderation_status = clean_decision,
    moderation_reason = left(btrim(decision_reason), 800),
    moderation_source = clean_source,
    moderation_confidence = decision_confidence,
    moderated_at = now(),
    status = case when clean_decision = 'approved' then 'available' else 'paused' end,
    updated_at = now()
  where id = selected_product.id;

  update public.product_moderation_reviews
  set
    decision = clean_decision,
    severity = clean_severity,
    reason = left(btrim(decision_reason), 800),
    source = clean_source,
    confidence = decision_confidence,
    raw_details = coalesce(decision_details, '{}'::jsonb),
    updated_at = now()
  where id = (
    select id
    from public.product_moderation_reviews
    where product_id = selected_product.id
      and decision = 'pending'
    order by created_at desc
    limit 1
  );

  if not found then
    insert into public.product_moderation_reviews (
      product_id,
      user_id,
      decision,
      severity,
      reason,
      source,
      confidence,
      raw_details
    )
    values (
      selected_product.id,
      selected_product.user_id,
      clean_decision,
      clean_severity,
      left(btrim(decision_reason), 800),
      clean_source,
      decision_confidence,
      coalesce(decision_details, '{}'::jsonb)
    );
  end if;

  select *
  into selected_profile
  from public.profiles
  where id = selected_product.user_id
  for update;

  new_strikes := coalesce(selected_profile.moderation_strikes, 0);

  -- Un rechazo de severidad medium pausa la publicación, pero no castiga la
  -- cuenta. Los strikes se reservan para infracciones high o critical.
  if clean_decision = 'rejected'
     and clean_severity in ('high', 'critical') then
    new_strikes := new_strikes + 1;

    if clean_severity = 'critical' then
      restriction_until := now() + interval '7 days';
    elsif new_strikes >= 3 then
      restriction_until := now() + interval '72 hours';
    end if;

    update public.profiles
    set
      moderation_strikes = new_strikes,
      moderation_restriction_until =
        case
          when restriction_until is null then moderation_restriction_until
          else greatest(
            coalesce(moderation_restriction_until, restriction_until),
            restriction_until
          )
        end,
      account_status =
        case
          when restriction_until is not null and account_status <> 'banned'
            then 'suspended'
          else account_status
        end,
      last_moderation_action_at = now()
    where id = selected_product.user_id;

    if restriction_until is not null then
      update public.products
      set status = 'paused', updated_at = now()
      where user_id = selected_product.user_id
        and status in ('available', 'reserved');
    end if;
  end if;

  return jsonb_build_object(
    'product_id', selected_product.id,
    'decision', clean_decision,
    'status', case when clean_decision = 'approved' then 'available' else 'paused' end,
    'reason', left(btrim(decision_reason), 800),
    'strikes', new_strikes,
    'restriction_until', restriction_until,
    'already_processed', false
  );
end;
$$;

create or replace function public.review_product_moderation(
  target_product_id uuid,
  next_decision text,
  moderator_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
