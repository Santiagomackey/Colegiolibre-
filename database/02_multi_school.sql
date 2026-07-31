-- ColegioLibre Instituciones
-- Ejecutar una sola vez en Supabase > SQL Editor.

alter table public.schools
  add column if not exists short_name text,
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists membership_status text not null default 'lead',
  add column if not exists primary_color text default '#0B2E6B',
  add column if not exists secondary_color text default '#67C23A',
  add column if not exists accent_color text default '#FFC72C',
  add column if not exists logo_url text,
  add column if not exists logo_background text default '#0B2E6B',
  add column if not exists logo_scale integer not null default 145,
  add column if not exists logo_x integer not null default 0,
  add column if not exists logo_y integer not null default 0,
  add column if not exists custom_domain text,
  add column if not exists contact_email text,
  add column if not exists hero_title text,
  add column if not exists hero_description text,
  add column if not exists settings jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists schools_code_lookup_idx
  on public.schools (upper(code));

create index if not exists schools_membership_idx
  on public.schools (membership_status, portal_enabled);

create table if not exists public.school_admins (
  id uuid primary key default gen_random_uuid(),
  school_code text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (school_code, user_id)
);

create index if not exists school_admins_user_idx
  on public.school_admins (user_id, school_code);

alter table public.school_admins enable row level security;

drop policy if exists "school admins can read membership" on public.school_admins;
create policy "school admins can read membership"
on public.school_admins for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "global admins manage school admins" on public.school_admins;
create policy "global admins manage school admins"
on public.school_admins for all
to authenticated
using (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

drop policy if exists "school managers update branding" on public.schools;
create policy "school managers update branding"
on public.schools for update
to authenticated
using (
  exists (
    select 1 from public.school_admins
    where school_admins.user_id = auth.uid()
      and upper(school_admins.school_code) = upper(schools.code)
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
      and upper(school_admins.school_code) = upper(schools.code)
      and school_admins.is_active = true
  )
  or exists (
    select 1 from public.admins
    where admins.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('school-branding', 'school-branding', true)
on conflict (id) do update set public = true;

drop policy if exists "public school branding" on storage.objects;
create policy "public school branding"
on storage.objects for select
to public
using (bucket_id = 'school-branding');

drop policy if exists "school managers upload branding" on storage.objects;
create policy "school managers upload branding"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'school-branding'
  and (
    exists (
      select 1 from public.school_admins
      where school_admins.user_id = auth.uid()
        and lower(school_admins.school_code) = lower((storage.foldername(name))[1])
        and school_admins.is_active = true
    )
    or exists (
      select 1 from public.admins
      where admins.user_id = auth.uid()
    )
  )
);

update public.schools
set
  portal_enabled = true,
  membership_status = 'active',
  short_name = coalesce(short_name, 'Eccleston'),
  primary_color = coalesce(primary_color, '#0B2E6B'),
  accent_color = coalesce(accent_color, '#FFC72C'),
  logo_background = coalesce(logo_background, '#0B2E6B')
where upper(code) = 'ECCLESTON'
   or upper(coalesce(community_code, '')) = 'ECCLESTON';
