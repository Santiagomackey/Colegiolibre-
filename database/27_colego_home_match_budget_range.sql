-- A lower estimate ranks results. The upper limit still gates matching and alerts.
alter table public.wanted_posts
  add column if not exists min_price numeric
    check (min_price >= 0 and min_price <= 100000000 and
      (max_price is null or min_price <= max_price));

create or replace function public.colego_match_results(p_wanted uuid)
returns table(id uuid,title text,price integer,condition text,exact_isbn boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.title,p.price,p.condition,w.match_isbn is not null
  from public.wanted_posts w join public.products p on p.status='available' and p.moderation_status='approved'
    and (p.isbn=w.match_isbn or (w.match_isbn is null and public.colego_match_words(p.title) @@
      public.colego_match_query(w.query,' & ')))
  where w.id=p_wanted and w.user_id=auth.uid() and public.colego_match_fit(w,p)
  order by (w.min_price is null or p.price>=w.min_price) desc,
    (p.school_code=w.school_code) desc nulls last, p.price, p.id limit 24
$$;
