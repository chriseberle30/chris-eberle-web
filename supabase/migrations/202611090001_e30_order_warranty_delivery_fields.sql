-- Persist all reception fields that the V2 form already collects.
-- Scoped to the E30-GESTION test project before any production rollout.
create or replace function public.e30_crear_orden(
  p_orden jsonb,
  p_sena numeric default 0,
  p_medio text default 'Efectivo'
)
returns bigint
language plpgsql
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_id bigint;
  v_total numeric;
  v_tipo text;
  v_owner uuid := auth.uid();
begin
  if v_owner is null then
    raise exception 'Iniciá sesión.';
  end if;

  v_total := coalesce((p_orden->>'total')::numeric, 0);
  v_tipo := coalesce(nullif(p_orden->>'tipo',''), 'Particular');

  if v_tipo not in ('Particular','Gremio') then
    raise exception 'Tipo de cliente no válido.';
  end if;
  if coalesce(p_sena, 0) < 0 or coalesce(p_sena, 0) > v_total then
    raise exception 'La seña debe estar entre cero y el total.';
  end if;
  if coalesce(nullif(p_orden->>'garantia_dias','')::integer, 0) < 0 then
    raise exception 'La garantía no puede ser negativa.';
  end if;

  insert into public.ordenes (
    cliente_id, cliente, telefono, negocio, tipo, gremio,
    marca, modelo, falla, estado, total, costo, notas, imei,
    garantia_dias, garantia_condiciones, trabajo_realizado, entregada, owner_id
  )
  values (
    nullif(p_orden->>'cliente_id','')::uuid,
    p_orden->>'cliente',
    p_orden->>'telefono',
    coalesce(nullif(p_orden->>'negocio',''), 'E30'),
    v_tipo,
    p_orden->>'gremio',
    coalesce(nullif(p_orden->>'marca',''), 'iPhone'),
    p_orden->>'modelo',
    p_orden->>'falla',
    coalesce(nullif(p_orden->>'estado',''), 'Recibido'),
    v_total,
    coalesce(nullif(p_orden->>'costo','')::numeric, 0),
    p_orden->>'notas',
    p_orden->>'imei',
    nullif(p_orden->>'garantia_dias','')::integer,
    p_orden->>'garantia_condiciones',
    p_orden->>'trabajo_realizado',
    case when p_orden->>'estado' = 'Entregado'
      then coalesce(nullif(p_orden->>'entregada','')::timestamptz, now())
      else null
    end,
    v_owner
  )
  returning id into v_id;

  if coalesce(p_sena, 0) > 0 then
    insert into public.pagos (orden_id, importe, medio, owner_id)
    values (v_id, p_sena, coalesce(nullif(p_medio, ''), 'Efectivo'), v_owner);
  end if;

  return v_id;
end;
$function$;
