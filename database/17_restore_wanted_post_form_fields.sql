alter table public.wanted_posts
  add column if not exists transaction_type text not null default 'buy'
    check (transaction_type in ('buy', 'exchange', 'either')),
  add column if not exists max_price numeric(12,2)
    check (max_price is null or max_price >= 0);

notify pgrst, 'reload schema';
