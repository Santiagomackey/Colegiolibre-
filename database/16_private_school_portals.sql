begin;

alter table public.institution_subscriptions add column if not exists paid_through timestamptz;
alter table public.institution_subscriptions add column if not exists provider_synced_at timestamptz;

alter table public.institution_subscriptions add column if not exists school_id uuid references public.schools(id);
create unique index if not exists institution_subscriptions_one_open_per_school
  on public.institution_subscriptions(school_id)
  where school_id is not null and status in ('pending','authorized','paused');

create table if not exists public.school_portal_content (
  school_id uuid primary key references public.schools(id) on delete cascade,
  draft jsonb not null default '{}' check (jsonb_typeof(draft)='object' and octet_length(draft::text)<=24000),
  published jsonb check (jsonb_typeof(published)='object' and octet_length(published::text)<=24000),
  revision integer not null default 0,
  published_at timestamptz
);

alter table public.school_portal_content enable row level security;
revoke all on public.school_portal_content from public, anon, authenticated;
grant select, insert, update on public.school_portal_content to service_role;
grant select on public.institution_requests, public.schools, public.school_admins, public.profiles to service_role;
grant select, insert, update on public.institution_subscriptions to service_role;

-- Serialize editor writes and keep saved drafts separate from what members see.
create or replace function public.save_school_portal_content(
  p_school_id uuid, p_revision integer, p_content jsonb, p_publish boolean
) returns integer language plpgsql security invoker set search_path='' as $$
declare new_revision integer;
begin
  insert into public.school_portal_content(school_id) values(p_school_id) on conflict do nothing;
  update public.school_portal_content
  set draft=p_content,
      published=case when p_publish then p_content else published end,
      published_at=case when p_publish then now() else published_at end,
      revision=revision+1
  where school_id=p_school_id and revision=p_revision
  returning revision into new_revision;
  if new_revision is null then raise exception 'PORTAL_CONFLICT'; end if;
  return new_revision;
end;
$$;
revoke all on function public.save_school_portal_content(uuid,integer,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_school_portal_content(uuid,integer,jsonb,boolean) to service_role;
create table if not exists public.school_portal_members (
  school_id uuid not null references public.schools(id) on delete cascade,
  email text not null check (length(email) <= 160 and email = lower(email)),
  created_at timestamptz not null default now(),
  primary key (school_id, email)
);
alter table public.school_portal_members enable row level security;
revoke all on public.school_portal_members from public,anon,authenticated;
grant select,insert,delete on public.school_portal_members to service_role;

commit;
