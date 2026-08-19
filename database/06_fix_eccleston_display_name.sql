-- Ejecutar una vez en Supabase SQL Editor.
-- Conserva la dirección/localidad como datos secundarios y usa el nombre
-- reconocido por las familias como título del resultado.
update public.schools
set
  display_name = 'Eccleston School',
  short_name = coalesce(nullif(short_name, ''), 'Eccleston'),
  aliases = trim(both ' ' from concat_ws(' ', aliases, 'Eccleston School', 'Eccleston')),
  updated_at = now()
where lower(concat_ws(' ', name, display_name, short_name, aliases, code, address))
  like '%eccleston%';
