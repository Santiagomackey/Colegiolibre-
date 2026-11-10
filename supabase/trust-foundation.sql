-- ColegioLibre trust foundation. Run in Supabase SQL editor before enabling features.
create table if not exists public.seller_verifications (
 user_id uuid primary key references auth.users(id) on delete cascade,
 school_status text not null default 'unverified' check (school_status in ('unverified','pending','verified','rejected')),
 identity_status text not null default 'unverified' check (identity_status in ('unverified','pending','verified','rejected')),
 payment_status text not null default 'unconnected' check (payment_status in ('unconnected','pending','connected','restricted')),
 payment_alias text check (payment_alias is null or (length(payment_alias) between 3 and 80 and payment_alias ~ '^[A-Za-z0-9._-]+$')),
 provider_reference text,
 updated_at timestamptz not null default now()
);
alter table public.seller_verifications enable row level security;
revoke all on public.seller_verifications from anon;
revoke insert, update, delete on public.seller_verifications from authenticated;
grant select on public.seller_verifications to authenticated;
drop policy if exists "read own verification" on public.seller_verifications;
create policy "read own verification" on public.seller_verifications for select to authenticated using (user_id = auth.uid());

create table if not exists public.trust_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 target_type text not null check (target_type in ('user','listing','message')),
 target_id text not null check (length(target_id) between 1 and 160),
 reason text not null check (reason in ('fraud','external_payment','harassment','counterfeit','other')),
 details text check (length(details) <= 2000),
 status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
 created_at timestamptz not null default now()
);
create index if not exists trust_reports_created_idx on public.trust_reports(created_at desc);
alter table public.trust_reports enable row level security;
revoke all on public.trust_reports from anon;
grant select, insert on public.trust_reports to authenticated;
revoke update, delete on public.trust_reports from authenticated;
drop policy if exists "reporter reads own reports" on public.trust_reports;
create policy "reporter reads own reports" on public.trust_reports for select to authenticated using (reporter_id = auth.uid());
drop policy if exists "reporter submits report" on public.trust_reports;
create policy "reporter submits report" on public.trust_reports for insert to authenticated with check (reporter_id = auth.uid() and status = 'open');
-- Admin review and provider callbacks must use a server-side privileged service role,
-- never client-side credentials. Do not accept verification statuses from browser metadata.
-- Identity documents and selfies must be handled by an approved KYC provider, not these tables.
