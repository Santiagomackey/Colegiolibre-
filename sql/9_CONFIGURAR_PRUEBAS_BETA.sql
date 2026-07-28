begin;

create extension if not exists pgcrypto;

create table if not exists public.beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  feedback_type text not null
    check (feedback_type in ('bug', 'confusing', 'suggestion', 'positive')),
  rating smallint not null check (rating between 1 and 10),
  page_path text not null check (char_length(page_path) between 1 and 120),
  description text not null check (char_length(description) between 10 and 2000),
  reproduction_steps text check (
    reproduction_steps is null or char_length(reproduction_steps) <= 1500
  ),
  completed_tasks jsonb not null default '[]'::jsonb,
  device_info jsonb not null default '{}'::jsonb,
  status text not null default 'new'
    check (status in ('new', 'reviewing', 'resolved', 'dismissed')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists beta_feedback_recent_idx
  on public.beta_feedback (created_at desc);

create index if not exists beta_feedback_status_idx
  on public.beta_feedback (status, created_at desc);

create index if not exists beta_feedback_user_idx
  on public.beta_feedback (user_id, created_at desc);

alter table public.beta_feedback enable row level security;

drop policy if exists "Beta testers submit feedback" on public.beta_feedback;
create policy "Beta testers submit feedback"
on public.beta_feedback
for insert
to anon, authenticated
with check (
  (
    auth.uid() is null
    and user_id is null
  )
  or (
    auth.uid() is not null
    and user_id = auth.uid()
  )
);

drop policy if exists "Users read own beta feedback" on public.beta_feedback;
create policy "Users read own beta feedback"
on public.beta_feedback
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_account(auth.uid())
);

drop policy if exists "Admins update beta feedback" on public.beta_feedback;
create policy "Admins update beta feedback"
on public.beta_feedback
for update
to authenticated
using (public.is_admin_account(auth.uid()))
with check (public.is_admin_account(auth.uid()));

drop policy if exists "Admins delete beta feedback" on public.beta_feedback;
create policy "Admins delete beta feedback"
on public.beta_feedback
for delete
to authenticated
using (public.is_admin_account(auth.uid()));

revoke all on public.beta_feedback from public, anon, authenticated;
grant insert on public.beta_feedback to anon, authenticated;
grant select on public.beta_feedback to authenticated;
grant update, delete on public.beta_feedback to authenticated;

commit;

select
  to_regclass('public.beta_feedback') is not null as tabla_beta_configurada,
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.beta_feedback'::regclass
  ) as rls_activado;
