-- ColegioLibre · Moderación automática 1.1
-- Ejecutar una sola vez, DESPUÉS de:
--   4_CONFIGURAR_MODERACION_AUTOMATICA.sql
--
-- Este ajuste:
--   · rechaza contacto y pagos externos sin sumar strikes;
--   · reserva los strikes para productos realmente graves;
--   · permite elegir desde Administración si una regla suma strike;
--   · desactiva las reglas demasiado amplias "arma" y "armas".

alter table public.prohibited_product_rules
  add column if not exists adds_strike boolean not null default false;

-- Por seguridad, una regla existente no sanciona la cuenta salvo que esté
-- claramente incluida entre los productos graves conocidos.
update public.prohibited_product_rules
set
  adds_strike = false,
  updated_at = now();

update public.prohibited_product_rules
set
  adds_strike = true,
  updated_at = now()
where severity = 'block'
  and translate(
    lower(btrim(pattern)),
    'áéíóúüñ',
    'aeiouun'
  ) ~ (
    'pistola|revolver|municion|explosiv|cocaina|marihuana|droga|mdma|lsd|'
    'pornograf|contenido sexual|servicio sexual|vape|vaper|cigarrillo|'
    'tabaco|alcohol|cerveza|vodka|dni falso|certificado falso|'
    'documento falso|entrada falsa|medicamento|pastillas|receta medica|'
    'robado|robada|sin numero de serie'
  );

-- "arma" con coincidencia "contiene" también detectaba farmacia o armario.
-- La función privada de Vercel conserva una detección por palabra completa.
update public.prohibited_product_rules
set
  is_active = false,
  updated_at = now()
where is_active
  and match_type = 'contains'
  and lower(btrim(pattern)) in ('arma', 'armas');

drop function if exists public.create_product_rule(
  text, text, text, text, text
);

create or replace function public.create_product_rule(
  rule_field text,
  rule_match_type text,
  rule_pattern text,
  rule_severity text,
  rule_reason text,
  rule_adds_strike boolean default false
)
returns public.prohibited_product_rules
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  created_rule public.prohibited_product_rules%rowtype;
begin
  if actor_id is null or not public.is_admin_account(actor_id) then
    raise exception 'No tenés permisos de administración.';
  end if;

  if rule_field not in ('all', 'title', 'description', 'category')
     or rule_match_type not in ('contains', 'exact')
     or rule_severity not in ('block', 'review') then
    raise exception 'La configuración de la regla no es válida.';
  end if;

  insert into public.prohibited_product_rules (
    field,
    match_type,
    pattern,
    severity,
    adds_strike,
    reason,
    created_by
  )
  values (
    rule_field,
    rule_match_type,
    btrim(rule_pattern),
    rule_severity,
    case
      when rule_severity = 'block' then coalesce(rule_adds_strike, false)
      else false
    end,
    btrim(rule_reason),
    actor_id
  )
  returning * into created_rule;

  return created_rule;
end;
$$;

-- Solo la función privada de Vercel, usando service_role, puede aplicar una
-- decisión automática. Un rechazo medium pausa el producto sin sumar strike.
create or replace function public.apply_automated_moderation_decision(
  target_product_id uuid,
  next_decision text,
  decision_reason text,
  decision_severity text default 'low',
  decision_source text default 'automatic',
  decision_confidence numeric default null,
  decision_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  selected_product public.products%rowtype;
  selected_profile public.profiles%rowtype;
  clean_decision text := lower(btrim(coalesce(next_decision, '')));
  clean_severity text := lower(btrim(coalesce(decision_severity, 'low')));
  clean_source text := lower(btrim(coalesce(decision_source, 'automatic')));
  new_strikes integer;
  restriction_until timestamptz;
  strike_added boolean := false;
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Esta función solo puede ejecutarse desde el servidor privado.';
  end if;

  if clean_decision not in ('approved', 'rejected', 'manual_review') then
    raise exception 'Decisión de moderación inválida.';
  end if;

  if clean_severity not in ('low', 'medium', 'high', 'critical') then
    clean_severity := 'low';
  end if;

  if clean_source not in ('automatic', 'rules', 'openai', 'fallback', 'admin') then
    clean_source := 'automatic';
  end if;

  select *
  into selected_product
  from public.products
  where id = target_product_id
  for update;

  if not found then
    raise exception 'La publicación no existe.';
  end if;

  if selected_product.moderation_status <> 'pending' then
    return jsonb_build_object(
      'product_id', selected_product.id,
      'decision', selected_product.moderation_status,
      'status', selected_product.status,
      'already_processed', true
    );
  end if;

  update public.products
  set
    moderation_status = clean_decision,
    moderation_reason = left(btrim(decision_reason), 800),
    moderation_source = clean_source,
    moderation_confidence = decision_confidence,
    moderated_at = now(),
    status = case when clean_decision = 'approved' then 'available' else 'paused' end,
    updated_at = now()
  where id = selected_product.id;

  update public.product_moderation_reviews
  set
    decision = clean_decision,
    severity = clean_severity,
    reason = left(btrim(decision_reason), 800),
    source = clean_source,
    confidence = decision_confidence,
    raw_details = coalesce(decision_details, '{}'::jsonb),
    updated_at = now()
  where id = (
    select id
    from public.product_moderation_reviews
    where product_id = selected_product.id
      and decision = 'pending'
    order by created_at desc
    limit 1
  );

  if not found then
    insert into public.product_moderation_reviews (
      product_id,
      user_id,
      decision,
      severity,
      reason,
      source,
      confidence,
      raw_details
    )
    values (
      selected_product.id,
      selected_product.user_id,
      clean_decision,
      clean_severity,
      left(btrim(decision_reason), 800),
      clean_source,
      decision_confidence,
      coalesce(decision_details, '{}'::jsonb)
    );
  end if;

  select *
  into selected_profile
  from public.profiles
  where id = selected_product.user_id
  for update;

  new_strikes := coalesce(selected_profile.moderation_strikes, 0);

  if clean_decision = 'rejected'
     and clean_severity in ('high', 'critical') then
    strike_added := true;
    new_strikes := new_strikes + 1;

    if clean_severity = 'critical' then
      restriction_until := now() + interval '7 days';
    elsif new_strikes >= 3 then
      restriction_until := now() + interval '72 hours';
    end if;

    update public.profiles
    set
      moderation_strikes = new_strikes,
      moderation_restriction_until =
        case
          when restriction_until is null then moderation_restriction_until
          else greatest(
            coalesce(moderation_restriction_until, restriction_until),
            restriction_until
          )
        end,
      account_status =
        case
          when restriction_until is not null and account_status <> 'banned'
            then 'suspended'
          else account_status
        end,
      last_moderation_action_at = now()
    where id = selected_product.user_id;

    if restriction_until is not null then
      update public.products
      set status = 'paused', updated_at = now()
      where user_id = selected_product.user_id
        and status in ('available', 'reserved');
    end if;
  end if;

  return jsonb_build_object(
    'product_id', selected_product.id,
    'decision', clean_decision,
    'status', case when clean_decision = 'approved' then 'available' else 'paused' end,
    'reason', left(btrim(decision_reason), 800),
    'strike_added', strike_added,
    'strikes', new_strikes,
    'restriction_until', restriction_until,
    'already_processed', false
  );
end;
$$;

revoke all on function public.create_product_rule(
  text, text, text, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.create_product_rule(
  text, text, text, text, text, boolean
) to authenticated;

revoke all on function public.apply_automated_moderation_decision(
  uuid, text, text, text, text, numeric, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_automated_moderation_decision(
  uuid, text, text, text, text, numeric, jsonb
) to service_role;

notify pgrst, 'reload schema';

-- Comprobación: los cinco resultados deben ser true.
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prohibited_product_rules'
      and column_name = 'adds_strike'
  ) as reglas_con_sancion_configurada,
  to_regprocedure(
    'public.create_product_rule(text,text,text,text,text,boolean)'
  ) is not null as formulario_configurado,
  not exists (
    select 1
    from public.prohibited_product_rules
    where is_active
      and match_type = 'contains'
      and lower(btrim(pattern)) in ('arma', 'armas')
  ) as reglas_amplias_corregidas,
  not exists (
    select 1
    from public.prohibited_product_rules
    where is_active
      and translate(lower(pattern), 'áéíóúüñ', 'aeiouun')
        in ('whatsapp', 'telegram', 'pagar por fuera', 'pago por fuera')
      and adds_strike
  ) as contacto_sin_strike,
  exists (
    select 1
    from public.prohibited_product_rules
    where is_active
      and adds_strike
  ) as reglas_graves_con_strike;
