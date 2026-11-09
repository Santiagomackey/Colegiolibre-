-- Run after 05_growth_payments_forum.sql and 08_marketplace_loop.sql.
-- Eligible, approved listings only; a later moderation approval also triggers matching.
begin;
create or replace function public.notify_wanted_product_matches()
returns trigger language plpgsql security definer set search_path = public as $$
declare wanted record;
declare searchable text;
begin
  if coalesce(new.status,'available') <> 'available'
     or coalesce(new.moderation_status,'approved') <> 'approved' then return new; end if;
  searchable := translate(lower(concat_ws(' ',new.title,new.description,new.category)), 'áéíóúüñ','aeiouun');
  for wanted in
    select w.* from public.wanted_posts w
    where w.status='active' and w.user_id<>new.user_id
      and length(trim(w.query))>=3
      and (w.max_price is null or new.price<=w.max_price)
      and (w.scope='country'
        or (w.scope='school' and nullif(w.school_code,'') is not null and upper(w.school_code)=upper(new.school_code))
        or (w.scope='zone' and nullif(w.zone_code,'') is not null and upper(w.zone_code)=upper(new.zone_code)))
      and not exists (
        select 1 from unnest(regexp_split_to_array(translate(lower(trim(w.query)),'áéíóúüñ','aeiouun'),'[^[:alnum:]]+')) as terms(term)
        where length(term)>0 and position(term in searchable)=0
      )
  loop
    if not exists(select 1 from public.notifications n where n.user_id=wanted.user_id and n.product_id=new.id and n.type='wanted_match' and n.metadata->>'wanted_post_id'=wanted.id::text) then
      insert into public.notifications(user_id,actor_id,type,title,body,product_id,action_url,metadata)
      values(wanted.user_id,new.user_id,'wanted_match','Encontramos lo que buscabas','Se publicó “'||new.title||'” en ColegioLibre.',new.id,'/producto?id='||new.id,jsonb_build_object('wanted_post_id',wanted.id,'scope',wanted.scope));
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function public.notify_wanted_product_matches() from public;
drop trigger if exists products_notify_wanted_matches on public.products;
create trigger products_notify_wanted_matches after insert or update of title,description,category,price,status,moderation_status,school_code,zone_code on public.products for each row execute function public.notify_wanted_product_matches();
commit;
