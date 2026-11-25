create table public.school_director_directory (
  school_id uuid primary key references public.schools(id) on delete cascade,
  email text not null check(email=lower(trim(email))),
  source_url text not null,
  last_sent_at timestamptz
);
alter table public.school_director_directory enable row level security;
revoke all on public.school_director_directory from public, anon, authenticated;
grant select on public.school_director_directory to service_role;

create table public.school_director_claims (
  request_id uuid primary key references public.institution_requests(id) on delete cascade,
  school_id uuid not null references public.schools(id),
  user_id uuid not null references auth.users(id),
  verified_at timestamptz not null default now()
);
alter table public.school_director_claims enable row level security;
revoke all on public.school_director_claims from public, anon, authenticated;
grant select on public.school_director_claims to service_role;

create function public.reserve_school_director_mail(p_school uuid) returns boolean
language sql security definer set search_path='' as $$
  with reserved as (
    update public.school_director_directory set last_sent_at=now() where school_id=p_school
      and (last_sent_at is null or last_sent_at < now()-interval '10 minutes') returning 1
  ) select exists(select from reserved)
$$;
revoke all on function public.reserve_school_director_mail(uuid) from public,anon,authenticated;
grant execute on function public.reserve_school_director_mail(uuid) to service_role;

drop index public.institution_requests_one_pending_school_idx;
create unique index institution_requests_pending_per_applicant on public.institution_requests
  (upper(official_school_code),applicant_user_id) where status='pending';

create function public.claim_school_directorship(p_code text,p_slug text,p_name text,p_cycle text)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.schools%rowtype; actor uuid:=auth.uid(); mailbox text; rid uuid;
begin
  select * into s from public.schools where code=upper(p_code) and is_active for update;
  select d.email into mailbox from public.school_director_directory d join auth.users u on lower(u.email)=d.email
    where d.school_id=s.id and u.id=actor and u.email_confirmed_at is not null;
  if mailbox is null then raise exception 'Verificá la casilla oficial de dirección.'; end if;
  if p_slug !~ '^[a-z0-9-]{1,50}$' or length(trim(p_name)) not between 1 and 50 or p_cycle not in ('monthly','annual')
    then raise exception 'Revisá los datos del portal.'; end if;
  if exists(select from public.school_admins a where upper(a.school_code) in (upper(s.code),upper(s.community_code))
    and a.is_active and a.user_id<>actor) then raise exception 'El colegio ya tiene una administración asignada.'; end if;
  select id into rid from public.institution_requests where upper(official_school_code)=upper(s.code)
    and applicant_user_id=actor and status='pending' and requested_plan='Institucional';
  if rid is null then
    insert into public.institution_requests(applicant_user_id,official_school_code,official_school_name,
      requested_code,short_name,contact_email,requested_plan,billing_cycle,status)
    values(actor,s.code,s.name,p_slug,trim(p_name),mailbox,'Institucional',p_cycle,'pending') returning id into rid;
  else
    update public.institution_requests set requested_code=p_slug,short_name=trim(p_name),contact_email=mailbox where id=rid;
  end if;
  insert into public.school_director_claims(request_id,school_id,user_id) values(rid,s.id,actor) on conflict do nothing;
  return rid;
end;
$$;
revoke all on function public.claim_school_directorship(text,text,text,text) from public,anon;
grant execute on function public.claim_school_directorship(text,text,text,text) to authenticated;

create function public.activate_paid_school_director() returns trigger
language plpgsql security definer set search_path='' as $$
declare s public.schools%rowtype; r public.institution_requests%rowtype; alias text;
begin
  if new.paid_through is null or new.paid_through<=now() or new.provider_subscription_id is null then return new; end if;
  if not exists(select from public.school_director_claims c where c.request_id=new.request_id and c.school_id=new.school_id
    and c.user_id=new.user_id) then return new; end if;
  select * into s from public.schools where id=new.school_id for update;
  select * into r from public.institution_requests where id=new.request_id and applicant_user_id=new.user_id
    and official_school_code=s.code and status='pending' for update;
  if not found then return new; end if;
  if exists(select from public.school_admins a where upper(a.school_code) in (upper(s.code),upper(s.community_code))
    and a.is_active and a.user_id<>new.user_id) then return new; end if;
  alias:=upper(coalesce(nullif(s.community_code,''),r.requested_code));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(alias));
  if exists(select from public.schools other where other.id<>s.id and alias in (upper(other.code),upper(other.community_code)))
    or exists(select from public.school_admins a where upper(a.school_code)=alias and a.user_id<>new.user_id) then
    alias:='COLEGO-'||s.id::text;
  end if;
  update public.schools set community_code=alias,short_name=coalesce(nullif(short_name,''),r.short_name),
    portal_enabled=true,membership_status='active',updated_at=now() where id=s.id;
  insert into public.school_admins(school_code,user_id,role,is_active) values(alias,new.user_id,'manager',true)
    on conflict(school_code,user_id) do update set is_active=true;
  update public.institution_requests set status='approved',reviewed_at=now() where id=r.id;
  return new;
end;
$$;
revoke all on function public.activate_paid_school_director() from public,anon,authenticated;
create trigger activate_paid_school_director after insert or update of paid_through on public.institution_subscriptions
for each row execute function public.activate_paid_school_director();
