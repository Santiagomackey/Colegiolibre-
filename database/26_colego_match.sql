-- Reuse wanted_posts and the existing notification webhook.
alter table public.wanted_posts
  add column match_isbn text check (match_isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$'),
  add column match_edition text check (length(match_edition) <= 80),
  add column match_size text check (length(match_size) <= 40),
  add column match_frequency text not null default 'hourly' check (match_frequency in ('hourly','daily','off')),
  add column match_private boolean not null default false,
  add column match_paused boolean not null default false;

alter table public.wanted_posts drop constraint wanted_posts_scope_check,
  add constraint wanted_posts_scope_check check (scope in ('school','zone','both','country'));

create policy "Private Match searches" on public.wanted_posts as restrictive for select
  using (not match_private or user_id=auth.uid());

create function public.colego_match_words(value text) returns tsvector
language sql immutable set search_path='' as $$
  select to_tsvector('pg_catalog.spanish', regexp_replace(
    regexp_replace(translate(lower(coalesce(value,'')), 'áéíóúü', 'aeiouu'),
      '\m(mates|mat|matematica)\M','matematicas','g'),
    '\m(remera|camiseta)\M','remera','g'))
$$;

create function public.colego_match_query(value text, mode text) returns tsquery
language sql immutable set search_path='' as $$
  select to_tsquery('pg_catalog.simple', coalesce(string_agg(quote_literal(term),mode),''))
  from unnest(tsvector_to_array(public.colego_match_words(value))) term
$$;

create index products_match_words_idx on public.products using gin (public.colego_match_words(title))
  where status='available' and moderation_status='approved';
create index wanted_match_words_idx on public.wanted_posts using gin (public.colego_match_words(query))
  where status='active' and not match_paused;
create index products_match_isbn_idx on public.products(isbn) where isbn is not null;
create index wanted_match_isbn_idx on public.wanted_posts(match_isbn) where match_isbn is not null;

-- A selected school is insufficient. Recheck both profiles at matching time.
create function public.colego_verified_school(person uuid, code text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select from public.profiles p where p.id=person and p.school_code=code
    and p.school_verification_status='verified')
$$;
revoke all on function public.colego_verified_school(uuid,text) from public,anon,authenticated;

create function public.colego_my_verified_school(code text) returns boolean
language sql stable security definer set search_path='' as $$
  select public.colego_verified_school(auth.uid(),code)
$$;
revoke all on function public.colego_my_verified_school(text) from public;
grant execute on function public.colego_my_verified_school(text) to authenticated,anon;
create policy "Verified viewers for school requests" on public.wanted_posts as restrictive for select
  using (user_id=auth.uid() or scope not in ('school','both') or public.colego_my_verified_school(school_code));


create function public.colego_match_fit(w public.wanted_posts,p public.products) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(p.status='available' and p.moderation_status='approved' and w.user_id<>p.user_id
    and w.status='active' and not w.match_paused and not public.are_users_blocked(w.user_id,p.user_id)
    and (w.max_price is null or p.price<=w.max_price)
    and (nullif(w.category,'') is null or w.category in ('Otro','Otros') or w.category=p.category)
    and (w.match_size is null or lower(trim(p.size))=lower(trim(w.match_size)))
    and (w.match_edition is null or lower(trim(p.book_edition))=lower(trim(w.match_edition)))
    and case when w.match_isbn is not null then w.match_isbn=p.isbn else
      numnode(plainto_tsquery('pg_catalog.spanish',w.query))>0 and
      public.colego_match_words(p.title) @@
      public.colego_match_query(w.query,' & ') end
    and (w.scope='country' or
      (w.scope in ('zone','both') and nullif(w.zone_code,'')=p.zone_code
        and exists(select from public.profiles buyer where buyer.id=w.user_id and buyer.zone_code=w.zone_code)
        and exists(select from public.profiles seller where seller.id=p.user_id and seller.zone_code=p.zone_code))
      or (w.scope in ('school','both') and w.school_code=p.school_code
        and public.colego_verified_school(w.user_id,w.school_code)
        and public.colego_verified_school(p.user_id,p.school_code))),false)
$$;
revoke all on function public.colego_match_fit(public.wanted_posts,public.products) from public,anon,authenticated;

create function public.colego_match_results(p_wanted uuid)
returns table(id uuid,title text,price integer,condition text,exact_isbn boolean)
language sql stable security definer set search_path='' as $$
  select p.id,p.title,p.price,p.condition,w.match_isbn is not null
  from public.wanted_posts w join public.products p on p.status='available' and p.moderation_status='approved'
    and (p.isbn=w.match_isbn or (w.match_isbn is null and public.colego_match_words(p.title) @@
      public.colego_match_query(w.query,' & ')))
  where w.id=p_wanted and w.user_id=auth.uid() and public.colego_match_fit(w,p)
  order by (p.school_code=w.school_code) desc nulls last, p.price, p.id limit 24
$$;
revoke all on function public.colego_match_results(uuid) from public,anon;
grant execute on function public.colego_match_results(uuid) to authenticated;

create table public.colego_match_push (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  primary key(user_id,product_id)
);
alter table public.colego_match_push enable row level security;
revoke all on public.colego_match_push from public,anon,authenticated;
create index colego_match_push_latest on public.colego_match_push(user_id,created_at desc);

create or replace function public.notify_wanted_product_matches()
returns trigger language plpgsql security definer set search_path='' as $$
declare w public.wanted_posts%rowtype;
begin
  if new.status is distinct from 'available' or new.moderation_status is distinct from 'approved' then return new; end if;
  for w in select candidate.* from public.wanted_posts candidate
    where candidate.status='active' and not candidate.match_paused and candidate.match_frequency<>'off'
      and (candidate.match_isbn=new.isbn or (candidate.match_isbn is null
        and public.colego_match_words(candidate.query) @@ public.colego_match_query(new.title,' | ')))
      and public.colego_match_fit(candidate,new)
    order by candidate.user_id,candidate.created_at
  loop
    perform pg_advisory_xact_lock(hashtext('colego-match'),hashtext(w.user_id::text));
    if not exists(select from public.colego_match_push sent where sent.user_id=w.user_id
      and sent.created_at>now()-case w.match_frequency when 'daily' then interval '1 day' else interval '1 hour' end)
      and not exists(select from public.notifications n where n.user_id=w.user_id and n.product_id=new.id and n.type='wanted_match')
    then
      insert into public.colego_match_push(user_id,product_id) values(w.user_id,new.id) on conflict do nothing;
      if found then
        insert into public.notifications(user_id,actor_id,type,title,body,product_id,action_url,metadata)
        values(w.user_id,new.user_id,'wanted_match','¡Encontramos lo que buscabas!',
          new.title||' por $'||new.price||case w.scope when 'school' then ' en tu colegio.' when 'zone' then ' en tu zona.' else '.' end,
          new.id,'/producto?id='||new.id,jsonb_build_object('wanted_post_id',w.id,'scope',w.scope));
      end if;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger products_notify_wanted_matches on public.products;
create trigger products_notify_wanted_matches after insert or update of title,category,price,status,moderation_status,
  school_code,zone_code,isbn,book_edition,size on public.products for each row execute function public.notify_wanted_product_matches();

create function public.colego_match_push_current(p_wanted uuid,p_product uuid,p_user uuid) returns boolean
language sql security definer set search_path='' as $$
  with dispatch as (
    update public.colego_match_push delivery set dispatched_at=now()
    where delivery.user_id=p_user and delivery.product_id=p_product and delivery.dispatched_at is null
      and exists(select from public.wanted_posts w, public.products p where w.id=p_wanted and p.id=p_product
        and w.user_id=p_user and w.match_frequency<>'off' and public.colego_match_fit(w,p))
    returning 1
  ) select exists(select from dispatch)
$$;
revoke all on function public.colego_match_push_current(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.colego_match_push_current(uuid,uuid,uuid) to service_role;

create or replace function public.open_wanted_chat(p_wanted_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  post public.wanted_posts%rowtype;
  thread uuid;
begin
  select * into post from public.wanted_posts where id=p_wanted_id and status='active' and not match_private for share;
  if actor is null or post.id is null or actor=post.user_id
    or not exists (select 1 from public.profiles p where p.id=actor and
      (post.scope not in ('school','both') or public.colego_verified_school(actor,post.school_code)))
    or public.account_can_trade(actor) is not true or public.account_can_trade(post.user_id) is not true
    or public.are_users_blocked(actor,post.user_id) then
    raise exception 'El pedido no está disponible para responder.';
  end if;
  select id into thread from public.conversations where wanted_post_id=post.id and seller_id=actor;
  if thread is null then
    insert into public.conversations(wanted_post_id,wanted_title,buyer_id,seller_id)
      values(post.id,post.title,post.user_id,actor)
      on conflict (wanted_post_id,seller_id) do nothing returning id into thread;
    if thread is null then
      select id into thread from public.conversations where wanted_post_id=post.id and seller_id=actor;
    end if;
  end if;
  return thread;
end;
$$;

create function public.colego_match_demand(p_title text,p_category text,p_price integer,p_isbn text,p_edition text,p_size text)
returns table(school bigint,zone bigint)
language sql stable security definer set search_path='' as $$
  with seller as (
    select jsonb_populate_record(null::public.products,jsonb_build_object(
      'title',left(p_title,120),'category',left(p_category,30),'price',p_price,'isbn',left(p_isbn,13),
      'book_edition',left(p_edition,80),'size',left(p_size,40),'user_id',p.id,'school_code',p.school_code,
      'zone_code',p.zone_code,'status','available','moderation_status','approved')) as product
    from public.profiles p where p.id=auth.uid() and p_price>0 and length(trim(p_title)) between 3 and 120
  ), totals as (
    select count(distinct w.user_id) filter(where w.scope in ('school','both')
        and w.school_code=(s.product).school_code and public.colego_verified_school(w.user_id,w.school_code)
        and public.colego_verified_school(auth.uid(),w.school_code)) as school,
      count(distinct w.user_id) filter(where w.scope in ('zone','both') and w.zone_code=(s.product).zone_code
        and exists(select from public.profiles p where p.id=w.user_id and p.zone_code=w.zone_code)) as zone
    from seller s join public.wanted_posts w on w.status='active' and not w.match_paused
      and (w.match_isbn=p_isbn or (w.match_isbn is null and public.colego_match_words(w.query) @@ public.colego_match_query(p_title,' | ')))
      and public.colego_match_fit(w,s.product)
  )
  select case when school>=3 then school end,case when zone>=3 then zone end from totals
$$;
revoke all on function public.colego_match_demand(text,text,integer,text,text,text) from public,anon;
grant execute on function public.colego_match_demand(text,text,integer,text,text,text) to authenticated;
