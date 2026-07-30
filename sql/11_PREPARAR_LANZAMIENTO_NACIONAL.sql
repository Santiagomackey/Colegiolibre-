-- ColegioLibre · preparación final para lanzamiento nacional
-- Ejecutar en un Query NUEVO, una vez aplicados los archivos 1 a 10.
-- Es idempotente: puede volver a ejecutarse sin duplicar políticas o triggers.

begin;

-- =========================================================
-- 1. STORAGE: cada usuario escribe únicamente en su carpeta
-- =========================================================

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'product-images',
  'product-images',
  true,
  6291456,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ColegioLibre solo utiliza este bucket. Se eliminan políticas de escritura
-- anteriores para que una regla permisiva vieja no anule la nueva protección.
do $$
declare
  selected_policy record;
begin
  for selected_policy in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      selected_policy.policyname
    );
  end loop;
end;
$$;

drop policy if exists "Public reads product images" on storage.objects;
create policy "Public reads product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

drop policy if exists "Users upload own product images" on storage.objects;
create policy "Users upload own product images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'products'
);

drop policy if exists "Users update own product images" on storage.objects;
create policy "Users update own product images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
  and (storage.foldername(name))[2] = 'products'
);

drop policy if exists "Users delete own product images" on storage.objects;
create policy "Users delete own product images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================
-- 2. CATÁLOGO: solo se expone lo aprobado
-- =========================================================

do $$
declare
  selected_policy record;
begin
  for selected_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and cmd = 'SELECT'
  loop
    execute format(
      'drop policy if exists %I on public.products',
      selected_policy.policyname
    );
  end loop;
end;
$$;

create policy "Public reads approved available products"
on public.products
for select
to anon, authenticated
using (
  status = 'available'
  and coalesce(moderation_status, 'approved') = 'approved'
);

create policy "Owners participants and admins read private products"
on public.products
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin_account(auth.uid())
  or exists (
    select 1
    from public.conversations c
    where c.product_id = products.id
      and auth.uid() in (c.buyer_id, c.seller_id)
  )
);

-- =========================================================
-- 3. VALIDACIÓN DE PUBLICACIONES EN EL SERVIDOR
-- =========================================================

create or replace function public.validate_product_payload()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  selected_url text;
  allowed_image_prefix constant text :=
    'https://riqhwmszshleyyaxlwqu.supabase.co/storage/v1/object/public/product-images/';
begin
  new.title := btrim(coalesce(new.title, ''));
  new.description := btrim(coalesce(new.description, ''));
  new.category := btrim(coalesce(new.category, ''));
  new.condition := btrim(coalesce(new.condition, ''));

  if char_length(new.title) not between 3 and 120 then
    raise exception 'El título debe tener entre 3 y 120 caracteres.';
  end if;

  if char_length(new.description) not between 20 and 500 then
    raise exception 'La descripción debe tener entre 20 y 500 caracteres.';
  end if;

  if new.category not in (
    'Libros', 'Apuntes', 'Cuadernos', 'Útiles', 'Mochilas',
    'Tecnología', 'Uniformes', 'Otros'
  ) then
    raise exception 'La categoría no es válida.';
  end if;

  if new.condition not in ('Nuevo', 'Como nuevo', 'Usado', 'Muy usado') then
    raise exception 'El estado del producto no es válido.';
  end if;

  if new.price is null or new.price <= 0 or new.price > 100000000 then
    raise exception 'El precio no es válido.';
  end if;

  if cardinality(coalesce(new.image_urls, '{}'::text[])) > 6 then
    raise exception 'Solo podés publicar hasta 6 imágenes.';
  end if;

  if char_length(coalesce(new.location, '')) > 160
     or char_length(coalesce(new.custom_location, '')) > 160 then
    raise exception 'La ubicación es demasiado extensa.';
  end if;

  if new.image_url is not null
     and left(new.image_url, char_length(allowed_image_prefix)) <> allowed_image_prefix then
    raise exception 'La imagen principal no pertenece a ColegioLibre.';
  end if;

  foreach selected_url in array coalesce(new.image_urls, '{}'::text[]) loop
    if left(selected_url, char_length(allowed_image_prefix)) <> allowed_image_prefix then
      raise exception 'Una imagen no pertenece a ColegioLibre.';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists products_validate_payload_before_write on public.products;
create trigger products_validate_payload_before_write
before insert or update of
  title,
  description,
  category,
  condition,
  price,
  image_url,
  image_urls,
  location,
  custom_location
on public.products
for each row
execute function public.validate_product_payload();

revoke all on function public.validate_product_payload()
from public, anon, authenticated;

-- =========================================================
-- 4. LÍMITES DE ABUSO ADICIONALES
-- =========================================================

create or replace function public.enforce_conversation_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.conversations
    where buyer_id = new.buyer_id
      and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Creaste demasiadas conversaciones. Esperá antes de continuar.';
  end if;
  return new;
end;
$$;

drop trigger if exists conversations_rate_limit_before_insert
on public.conversations;
create trigger conversations_rate_limit_before_insert
before insert on public.conversations
for each row execute function public.enforce_conversation_rate_limit();

create or replace function public.enforce_favorite_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.favorites
    where user_id = new.user_id
      and created_at > now() - interval '1 hour'
  ) >= 180 then
    raise exception 'Guardaste demasiados favoritos en poco tiempo.';
  end if;
  return new;
end;
$$;

drop trigger if exists favorites_rate_limit_before_insert
on public.favorites;
create trigger favorites_rate_limit_before_insert
before insert on public.favorites
for each row execute function public.enforce_favorite_rate_limit();

create or replace function public.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.reports
    where reporter_id = new.reporter_id
      and created_at > now() - interval '1 day'
  ) >= 12 then
    raise exception 'Alcanzaste el límite diario de reportes.';
  end if;
  return new;
end;
$$;

drop trigger if exists reports_rate_limit_before_insert
on public.reports;
create trigger reports_rate_limit_before_insert
before insert on public.reports
for each row execute function public.enforce_report_rate_limit();

create or replace function public.enforce_client_error_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.client_errors
    where user_id = new.user_id
      and created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'Límite temporal de diagnósticos alcanzado.';
  end if;
  return new;
end;
$$;

drop trigger if exists client_errors_rate_limit_before_insert
on public.client_errors;
create trigger client_errors_rate_limit_before_insert
before insert on public.client_errors
for each row execute function public.enforce_client_error_rate_limit();

revoke all on function public.enforce_conversation_rate_limit()
from public, anon, authenticated;
revoke all on function public.enforce_favorite_rate_limit()
from public, anon, authenticated;
revoke all on function public.enforce_report_rate_limit()
from public, anon, authenticated;
revoke all on function public.enforce_client_error_rate_limit()
from public, anon, authenticated;

-- =========================================================
-- 5. RETENCIÓN: limpieza gratuita, manual o programable
-- =========================================================

create or replace function public.cleanup_expired_operational_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  removed_errors integer := 0;
  removed_notifications integer := 0;
begin
  if not public.is_admin_account(auth.uid())
     and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'No tenés permisos para ejecutar esta limpieza.';
  end if;

  delete from public.client_errors
  where created_at < now() - interval '30 days';
  get diagnostics removed_errors = row_count;

  delete from public.notifications
  where created_at < now() - interval '180 days';
  get diagnostics removed_notifications = row_count;

  return jsonb_build_object(
    'client_errors', removed_errors,
    'notifications', removed_notifications,
    'executed_at', now()
  );
end;
$$;

revoke all on function public.cleanup_expired_operational_data()
from public, anon;
grant execute on function public.cleanup_expired_operational_data()
to authenticated;

commit;

-- =========================================================
-- 6. RESULTADO ESPERADO: todas las columnas deben ser true
-- =========================================================

select
  exists (
    select 1 from storage.buckets
    where id = 'product-images'
      and public
      and file_size_limit = 6291456
  ) as imagenes_configuradas,
  (
    select count(*) = 2
    from pg_policies
    where schemaname = 'public'
      and tablename = 'products'
      and cmd = 'SELECT'
  ) as catalogo_protegido,
  (
    select count(*) = 5
    from information_schema.triggers
    where trigger_schema = 'public'
      and trigger_name in (
        'products_validate_payload_before_write',
        'conversations_rate_limit_before_insert',
        'favorites_rate_limit_before_insert',
        'reports_rate_limit_before_insert',
        'client_errors_rate_limit_before_insert'
      )
  ) as limites_nacionales_configurados,
  to_regprocedure('public.cleanup_expired_operational_data()') is not null
    as limpieza_configurada;
