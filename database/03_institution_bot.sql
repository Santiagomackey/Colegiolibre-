-- Bot gratuito de altas institucionales
-- Ejecutar una sola vez después de 02_multi_school.sql.

create table if not exists public.institution_requests (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  official_school_code text not null,
  official_school_name text not null,
  requested_code text not null,
  short_name text not null,
  contact_email text not null,
  requested_plan text not null default 'Comunidad'
    check (requested_plan in ('Comunidad', 'Institucional', 'Red Escolar')),
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly', 'annual')),
  primary_color text not null default '#0B2E6B',
  secondary_color text not null default '#67C23A',
  accent_color text not null default '#FFC72C',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.institution_requests
  add column if not exists requested_plan text not null default 'Comunidad';
alter table public.institution_requests
  add column if not exists billing_cycle text not null default 'monthly';

create index if not exists institution_requests_status_idx
  on public.institution_requests (status, created_at desc);

create unique index if not exists institution_requests_one_pending_school_idx
  on public.institution_requests (upper(official_school_code))
  where status = 'pending';

alter table public.institution_requests enable row level security;

-- Escribe avisos en el sistema existente sin hacer depender el alta de un
-- proveedor de correo o de una API paga.
create or replace function public.create_institution_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_action_url text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  execute $notification$
    insert into public.notifications
      (user_id, type, title, body, action_url, read, metadata)
    values ($1, $2, $3, $4, $5, false, $6)
  $notification$
  using p_user_id, p_type, p_title, p_body, p_action_url, p_metadata;
exception
  when undefined_column or not_null_violation then
    -- Mantiene compatible la migración si una instalación antigua usa otro
    -- esquema de avisos. La solicitud igualmente se guarda y aparece al admin.
    return;
end;
$$;

revoke all on function public.create_institution_notification(uuid, text, text, text, text, jsonb) from public;

create or replace function public.notify_admins_new_institution_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_row record;
begin
  for admin_row in select user_id from public.admins loop
    perform public.create_institution_notification(
      admin_row.user_id,
      'institution_request',
      'Nuevo colegio quiere unirse',
      new.official_school_name || ' envió una solicitud institucional.',
      '/instituciones-admin.html',
      jsonb_build_object(
        'institution_request_id', new.id,
        'official_school_code', new.official_school_code
      )
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists institution_request_notify_admins on public.institution_requests;
create trigger institution_request_notify_admins
after insert on public.institution_requests
for each row execute function public.notify_admins_new_institution_request();

drop policy if exists "applicants create institution requests" on public.institution_requests;
create policy "applicants create institution requests"
on public.institution_requests for insert
to authenticated
with check (
  applicant_user_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "applicants read own institution requests" on public.institution_requests;
create policy "applicants read own institution requests"
on public.institution_requests for select
to authenticated
using (
  applicant_user_id = auth.uid()
  or exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

create or replace function public.approve_institution_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.institution_requests%rowtype;
  portal_code text;
begin
  if not exists (
    select 1 from public.admins where admins.user_id = auth.uid()
  ) then
    raise exception 'Acceso administrativo requerido';
  end if;

  select * into request_row
  from public.institution_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Solicitud inexistente';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada';
  end if;

  portal_code := upper(regexp_replace(request_row.requested_code, '[^a-zA-Z0-9_-]', '', 'g'));
  if portal_code = '' then
    raise exception 'Código de portal inválido';
  end if;

  if exists (
    select 1 from public.schools
    where upper(coalesce(community_code, '')) = portal_code
      and upper(code) <> upper(request_row.official_school_code)
  ) then
    raise exception 'Ese código ya está siendo utilizado';
  end if;

  update public.schools
  set
    community_code = portal_code,
    display_name = request_row.official_school_name,
    short_name = request_row.short_name,
    contact_email = request_row.contact_email,
    primary_color = request_row.primary_color,
    secondary_color = request_row.secondary_color,
    accent_color = request_row.accent_color,
    portal_enabled = true,
    membership_status = 'active',
    is_active = true,
    updated_at = now()
  where upper(code) = upper(request_row.official_school_code);

  if not found then
    raise exception 'No encontramos el colegio oficial seleccionado';
  end if;

  insert into public.school_admins (school_code, user_id, role, is_active)
  values (portal_code, request_row.applicant_user_id, 'manager', true)
  on conflict (school_code, user_id)
  do update set role = 'manager', is_active = true;

  update public.institution_requests
  set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  perform public.create_institution_notification(
    request_row.applicant_user_id,
    'institution_approved',
    'Tu portal institucional fue aprobado',
    request_row.official_school_name || ' ya forma parte de ColegioLibre.',
    '/colegio/' || lower(portal_code),
    jsonb_build_object(
      'institution_request_id', request_row.id,
      'portal_code', lower(portal_code)
    )
  );

  return lower(portal_code);
end;
$$;

create or replace function public.reject_institution_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  request_row public.institution_requests%rowtype;
begin
  if not exists (
    select 1 from public.admins where admins.user_id = auth.uid()
  ) then
    raise exception 'Acceso administrativo requerido';
  end if;

  select * into request_row
  from public.institution_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Solicitud inexistente';
  end if;

  if request_row.status <> 'pending' then
    raise exception 'La solicitud ya fue revisada';
  end if;

  update public.institution_requests
  set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_request_id;

  perform public.create_institution_notification(
    request_row.applicant_user_id,
    'institution_rejected',
    'Revisamos tu solicitud institucional',
    'La solicitud de ' || request_row.official_school_name || ' no fue aprobada. Podés contactarnos desde Ayuda.',
    '/instituciones.html',
    jsonb_build_object('institution_request_id', request_row.id)
  );
end;
$$;

revoke all on function public.approve_institution_request(uuid) from public;
revoke all on function public.reject_institution_request(uuid) from public;
grant execute on function public.approve_institution_request(uuid) to authenticated;
grant execute on function public.reject_institution_request(uuid) to authenticated;

drop policy if exists "school managers update branding" on public.schools;
create policy "school managers update branding"
on public.schools for update
to authenticated
using (
  exists (
    select 1 from public.school_admins
    where school_admins.user_id = auth.uid()
      and (
        upper(school_admins.school_code) = upper(schools.code)
        or upper(school_admins.school_code) = upper(coalesce(schools.community_code, ''))
      )
      and school_admins.is_active = true
  )
  or exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.school_admins
    where school_admins.user_id = auth.uid()
      and (
        upper(school_admins.school_code) = upper(schools.code)
        or upper(school_admins.school_code) = upper(coalesce(schools.community_code, ''))
      )
      and school_admins.is_active = true
  )
  or exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);
