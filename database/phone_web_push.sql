create table if not exists public.web_push_devices (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,
  auth text not null
);
create index if not exists web_push_devices_user_idx on public.web_push_devices(user_id);
alter table public.web_push_devices enable row level security;
revoke all on public.web_push_devices from public, anon, authenticated;
grant select, delete on public.web_push_devices to service_role;

create or replace function public.register_web_push(p_endpoint text, p_p256dh text, p_auth text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or length(p_endpoint) > 2048
     or p_endpoint !~ '^https://(fcm\.googleapis\.com|web\.push\.apple\.com|updates\.push\.services\.mozilla\.com)/'
     or p_p256dh !~ '^[A-Za-z0-9_-]{87}$' or p_auth !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Invalid subscription';
  end if;
  insert into public.web_push_devices as d (endpoint,user_id,p256dh,auth)
  values (p_endpoint,auth.uid(),p_p256dh,p_auth)
  on conflict (endpoint) do update set user_id=excluded.user_id
  where d.auth=excluded.auth and d.p256dh=excluded.p256dh;
end;
$$;
revoke all on function public.register_web_push(text,text,text) from public, anon;
grant execute on function public.register_web_push(text,text,text) to authenticated;
