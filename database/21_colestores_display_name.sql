-- Refresh only platform-authored text in the installed versions of these routines.
do $migration$
declare routine record;
begin
  for routine in
    select pg_get_functiondef(p.oid) as definition
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('notify_new_message','notify_new_favorite','notification_actor_name',
                        'validate_product_payload','approve_institution_request','notify_wanted_product_matches')
      and p.prosrc like '%ColegioLibre%'
  loop
    execute replace(routine.definition,'ColegioLibre','Colestores');
  end loop;
end
$migration$;
