begin;
create table public.help_ai_usage (
  hour_start timestamptz not null,
  bucket text not null,
  used integer not null default 0,
  primary key(hour_start,bucket)
);
alter table public.help_ai_usage enable row level security;
revoke all on public.help_ai_usage from public,anon,authenticated;
grant select,insert,update,delete on public.help_ai_usage to service_role;

create function public.reserve_help_ai_turn(p_bucket text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare
  h timestamptz := date_trunc('hour',now());
  total integer;
begin
  if p_bucket is null or p_bucket !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from public.help_ai_usage where hour_start < h;
  insert into public.help_ai_usage values(h,'total',0) on conflict do nothing;
  select used into total from public.help_ai_usage where hour_start=h and bucket='total' for update;
  if total >= 200 then return false; end if;
  insert into public.help_ai_usage values(h,p_bucket,1)
    on conflict(hour_start,bucket) do update set used=help_ai_usage.used+1 where help_ai_usage.used<20;
  if not found then return false; end if;
  update public.help_ai_usage set used=used+1 where hour_start=h and bucket='total';
  return true;
end; $$;
revoke all on function public.reserve_help_ai_turn(text) from public,anon,authenticated;
grant execute on function public.reserve_help_ai_turn(text) to service_role;
commit;
