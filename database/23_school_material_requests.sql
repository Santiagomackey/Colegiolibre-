alter table public.products
  add column book_edition text check (length(book_edition) between 1 and 80),
  add column isbn text check (isbn ~ '^([0-9]{9}[0-9X]|[0-9]{13})$');

alter table public.conversations
  alter column product_id drop not null,
  add column wanted_post_id uuid references public.wanted_posts(id) on delete cascade,
  add column wanted_title text,
  add constraint conversation_has_one_subject check (num_nonnulls(product_id,wanted_post_id)=1) not valid,
  add constraint conversation_wanted_responder unique (wanted_post_id,seller_id);

alter policy "Anyone reads active wanted posts" on public.wanted_posts using (
  user_id = auth.uid() or (status='active' and (scope <> 'school' or exists (
    select 1 from public.profiles p where p.id=auth.uid() and p.school_code=wanted_posts.school_code
  )))
);
create policy "School requests belong to members" on public.wanted_posts
  as restrictive for all to authenticated using (true) with check (
    scope <> 'school' or exists (select 1 from public.profiles p
      where p.id=auth.uid() and p.school_code=wanted_posts.school_code)
  );

create or replace function public.enforce_conversation_rate_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare actor uuid := case when new.wanted_post_id is null then new.buyer_id else new.seller_id end;
begin
  if (select count(*) from public.conversations where created_at > now()-interval '1 hour'
      and (case when wanted_post_id is null then buyer_id else seller_id end)=actor) >= 30 then
    raise exception 'Creaste demasiadas conversaciones. Esperá antes de continuar.';
  end if;
  return new;
end;
$$;

create function public.open_wanted_chat(p_wanted_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  post public.wanted_posts%rowtype;
  thread uuid;
begin
  select * into post from public.wanted_posts where id=p_wanted_id and status='active' for share;
  if actor is null or post.id is null or actor=post.user_id
    or not exists (select 1 from public.profiles p where p.id=actor and
      (post.scope<>'school' or p.school_code=post.school_code))
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
revoke all on function public.open_wanted_chat(uuid) from public, anon;
grant execute on function public.open_wanted_chat(uuid) to authenticated;
