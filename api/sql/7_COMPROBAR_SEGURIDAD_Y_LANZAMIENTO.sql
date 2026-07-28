-- ColegioLibre · comprobación de seguridad previa al lanzamiento
-- Este archivo es de SOLO LECTURA: no crea, elimina ni modifica datos.

-- 1. Tablas esperadas y estado de RLS
select
  expected.table_name,
  to_regclass('public.' || expected.table_name) is not null as existe,
  coalesce(pg_class.relrowsecurity, false) as rls_activo,
  (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename = expected.table_name
  ) as cantidad_politicas
from (
  values
    ('profiles'),
    ('products'),
    ('conversations'),
    ('messages'),
    ('favorites'),
    ('notifications'),
    ('reports'),
    ('user_blocks'),
    ('transactions'),
    ('reviews'),
    ('schools'),
    ('admins')
) as expected(table_name)
left join pg_class
  on pg_class.oid = to_regclass('public.' || expected.table_name)
order by expected.table_name;

-- 2. Políticas existentes para revisar permisos y roles
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

-- 3. Funciones SECURITY DEFINER: deben tener search_path controlado
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as configuration
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- 4. Triggers automáticos configurados
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 5. Buckets de Storage y estado público
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;

-- 6. Políticas de Storage
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
order by tablename, cmd, policyname;

-- 7. Productos que no deberían ser públicos
select
  count(*) filter (
    where status = 'available'
      and coalesce(moderation_status, 'approved') <> 'approved'
  ) as disponibles_sin_aprobar,
  count(*) filter (
    where status = 'available'
      and title is null
  ) as disponibles_sin_titulo,
  count(*) filter (
    where status = 'available'
      and length(trim(coalesce(description, ''))) < 20
  ) as disponibles_con_descripcion_corta
from public.products;

-- 8. Conversaciones duplicadas por producto y participantes
select
  product_id,
  buyer_id,
  seller_id,
  count(*) as cantidad
from public.conversations
group by product_id, buyer_id, seller_id
having count(*) > 1
order by cantidad desc;

-- 9. Operaciones activas duplicadas por producto
select
  product_id,
  count(*) as operaciones_activas
from public.transactions
where status in ('pending', 'reserved')
group by product_id
having count(*) > 1
order by operaciones_activas desc;

-- 10. Resultado resumido
select
  not exists (
    select 1
    from public.products
    where status = 'available'
      and coalesce(moderation_status, 'approved') <> 'approved'
  ) as productos_publicos_aprobados,
  not exists (
    select 1
    from public.conversations
    group by product_id, buyer_id, seller_id
    having count(*) > 1
  ) as conversaciones_sin_duplicados,
  not exists (
    select 1
    from public.transactions
    where status in ('pending', 'reserved')
    group by product_id
    having count(*) > 1
  ) as operaciones_activas_sin_duplicados;
