begin;
create table public.school_portal_access_requests (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  primary key (school_id,user_id)
);
alter table public.school_portal_access_requests enable row level security;
revoke all on public.school_portal_access_requests from public,anon,authenticated;
grant select,insert,update on public.school_portal_access_requests to service_role;

create function public.review_school_portal_access(p_school uuid,p_user uuid,p_status text,p_actor uuid,p_path text,p_name text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if p_status not in ('approved','rejected','revoked') then return false; end if;
  update public.school_portal_access_requests set status=case when p_status='revoked' then 'rejected' else p_status end
  where school_id=p_school and user_id=p_user and status=case when p_status='revoked' then 'approved' else 'pending' end;
  if not found then return false; end if;
  if p_status='approved' then
    insert into public.notifications(user_id,actor_id,type,title,body,action_url)
    values(p_user,p_actor,'school_access_approved','Ya podés entrar a ' || p_name,'Tocá para abrir el portal de tu colegio.',p_path);
  end if;
  return true;
end;
$$;
revoke all on function public.review_school_portal_access(uuid,uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.review_school_portal_access(uuid,uuid,text,uuid,text,text) to service_role;
commit;
