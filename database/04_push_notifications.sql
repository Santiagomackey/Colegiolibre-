-- Registro seguro de dispositivos para notificaciones push.
-- Ejecutar una vez en Supabase después de las migraciones anteriores.

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('android', 'ios')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

drop policy if exists "users read own push tokens" on public.push_tokens;
create policy "users read own push tokens"
on public.push_tokens for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "users delete own push tokens" on public.push_tokens;
create policy "users delete own push tokens"
on public.push_tokens for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.register_push_token(
  p_token text,
  p_platform text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Necesitás iniciar sesión';
  end if;

  if length(trim(coalesce(p_token, ''))) < 20 then
    raise exception 'Token push inválido';
  end if;

  if p_platform not in ('android', 'ios') then
    raise exception 'Plataforma inválida';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (trim(p_token), auth.uid(), p_platform)
  on conflict (token)
  do update set
    user_id = excluded.user_id,
    platform = excluded.platform,
    updated_at = now();
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;

