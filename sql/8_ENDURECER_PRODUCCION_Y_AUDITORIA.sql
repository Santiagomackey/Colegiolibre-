-- ColegioLibre · endurecimiento final de producción
-- Ejecutar UNA VEZ en un Query nuevo del SQL Editor de Supabase.
-- Es seguro volver a ejecutarlo: tablas, índices y triggers usan IF NOT EXISTS
-- o se reemplazan de forma controlada.

create extension if not exists pgcrypto;

alter table public.products
  add column if not exists image_urls text[] not null default '{}'::text[];

-- =========================================================
-- 1. ÍNDICES PARA BÚSQUEDAS Y PANTALLAS FRECUENTES
-- =========================================================

create index if not exists products_public_catalog_idx
  on public.products (status, moderation_status, created_at desc);

create index if not exists products_school_catalog_idx
  on public.products (school_code, status, created_at desc);

create index if not exists products_category_catalog_idx
  on public.products (category, status, created_at desc);

create index if not exists products_owner_status_idx
  on public.products (user_id, status, updated_at desc);

create index if not exists favorites_user_recent_idx
  on public.favorites (user_id, created_at desc);

create index if not exists messages_conversation_recent_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read, created_at desc);

-- =========================================================
-- 2. HISTORIAL ADMINISTRATIVO INMUTABLE
-- =========================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_recent_idx
  on public.admin_audit_log (created_at desc);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id, created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "Admins read audit log"
on public.admin_audit_log;

create policy "Admins read audit log"
on public.admin_audit_log
for select
to authenticated
using (public.is_admin_account(auth.uid()));

revoke all on public.admin_audit_log from public, anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function public.record_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  action_name text;
  target_kind text := tg_table_name;
  target_uuid uuid;
  change_summary text;
  details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'products' then
    if
      old.status is not distinct from new.status
      and old.moderation_status is not distinct from new.moderation_status
    then
      return new;
    end if;

    action_name := 'product_status_changed';
    target_uuid := new.id;
    change_summary := 'Cambió el estado o la moderación de una publicación.';
    details := jsonb_build_object(
      'title', new.title,
      'previous_status', old.status,
      'next_status', new.status,
      'previous_moderation_status', old.moderation_status,
      'next_moderation_status', new.moderation_status,
      'moderation_reason', new.moderation_reason
    );
  elsif tg_table_name = 'profiles' then
    if old.account_status is not distinct from new.account_status then
      return new;
    end if;

    action_name := 'account_status_changed';
    target_uuid := new.id;
    change_summary := 'Cambió el estado de una cuenta.';
    details := jsonb_build_object(
      'name', new.name,
      'previous_status', old.account_status,
      'next_status', new.account_status
    );
  elsif tg_table_name = 'reports' then
    if old.status is not distinct from new.status then
      return new;
    end if;

    action_name := 'report_status_changed';
    target_uuid := new.id;
    change_summary := 'Cambió el estado de un reporte.';
    details := jsonb_build_object(
      'previous_status', old.status,
      'next_status', new.status,
      'resolution_note', new.resolution_note
    );
  else
    return new;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    summary,
    metadata
  )
  values (
    auth.uid(),
    action_name,
    target_kind,
    target_uuid,
    change_summary,
    details
  );

  return new;
end;
$$;

drop trigger if exists audit_product_sensitive_changes on public.products;
create trigger audit_product_sensitive_changes
after update of status, moderation_status on public.products
for each row
execute function public.record_sensitive_change();

drop trigger if exists audit_profile_account_changes on public.profiles;
create trigger audit_profile_account_changes
after update of account_status on public.profiles
for each row
execute function public.record_sensitive_change();

drop trigger if exists audit_report_status_changes on public.reports;
create trigger audit_report_status_changes
after update of status on public.reports
for each row
execute function public.record_sensitive_change();

-- =========================================================
-- 3. PROTECCIÓN BÁSICA CONTRA SPAM
-- =========================================================

create or replace function public.enforce_message_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_messages integer;
begin
  select count(*)
  into recent_messages
  from public.messages
  where sender_id = new.sender_id
    and created_at > now() - interval '1 minute';

  if recent_messages >= 20 then
    raise exception 'Estás enviando mensajes demasiado rápido. Esperá un momento.';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_rate_limit_before_insert on public.messages;
create trigger messages_rate_limit_before_insert
before insert on public.messages
for each row
execute function public.enforce_message_rate_limit();

create or replace function public.enforce_product_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_products integer;
begin
  select count(*)
  into recent_products
  from public.products
  where user_id = new.user_id
    and created_at > now() - interval '1 hour';

  if recent_products >= 15 then
    raise exception 'Alcanzaste el límite temporal de publicaciones. Intentá más tarde.';
  end if;

  return new;
end;
$$;

drop trigger if exists products_rate_limit_before_insert on public.products;
create trigger products_rate_limit_before_insert
before insert on public.products
for each row
execute function public.enforce_product_rate_limit();

revoke all on function public.record_sensitive_change() from public, anon, authenticated;
revoke all on function public.enforce_message_rate_limit() from public, anon, authenticated;
revoke all on function public.enforce_product_rate_limit() from public, anon, authenticated;

-- =========================================================
-- 4. DESACTIVACIÓN SEGURA DE CUENTA
-- =========================================================

create or replace function public.deactivate_own_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  update public.products
  set status = 'paused', updated_at = now()
  where user_id = current_user_id
    and status in ('available', 'reserved');

  delete from public.favorites
  where user_id = current_user_id;

  delete from public.notifications
  where user_id = current_user_id;

  update public.profiles
  set
    account_status = 'banned',
    name = 'Cuenta desactivada',
    updated_at = now()
  where id = current_user_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    summary
  )
  values (
    current_user_id,
    'account_self_deactivated',
    'profiles',
    current_user_id,
    'La persona desactivó su propia cuenta.'
  );

  return true;
end;
$$;

revoke all on function public.deactivate_own_account() from public, anon;
grant execute on function public.deactivate_own_account() to authenticated;

-- =========================================================
-- 5. COMPROBACIÓN FINAL
-- =========================================================

select
  to_regclass('public.admin_audit_log') is not null as auditoria_configurada,
  (
    select count(*) = 3
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'audit_product_sensitive_changes',
        'audit_profile_account_changes',
        'audit_report_status_changes'
      )
  ) as triggers_auditoria_configurados,
  (
    select count(*) = 2
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'messages_rate_limit_before_insert',
        'products_rate_limit_before_insert'
      )
  ) as limites_spam_configurados;
