-- Libro mayor analítico por cuenta con saldo acumulado (ventana en SQL).
-- Saldo = saldo de apertura (movimientos anteriores a p_fecha_desde) + suma(debe - haber) en el periodo, por cuenta.
-- Ejecutar en Supabase → SQL (como migración o una sola vez).

create or replace function public.mayor_por_cuenta_saldo(
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_cuenta_codigo text default null,
  p_limite int default 8000
)
returns table (
  cuenta_contable_codigo text,
  cuenta_contable_nombre text,
  asiento_id uuid,
  line_number int,
  fecha timestamptz,
  tipo_operacion text,
  descripcion_asiento text,
  debe numeric(18,2),
  haber numeric(18,2),
  saldo_acumulado numeric(18,2)
)
language sql
stable
security definer
set search_path = public
as $$
  with
  p_c as (
    select nullif(btrim(p_cuenta_codigo), '') as cod
  ),
  asiento_dia as (
    select
      a.id as aid,
      (a.fecha at time zone 'America/Caracas')::date as dia
    from public.asientos_contables a
  ),
  apertura as (
    select
      d.cuenta_contable_codigo as cco,
      sum(d.debe - d.haber)::numeric(18,2) as saldo_ap
    from public.detalles_asiento d
    inner join public.asientos_contables a on a.id = d.asiento_id
    inner join asiento_dia ad on ad.aid = a.id
    cross join p_c
    where
      p_fecha_desde is not null
      and (p_c.cod is null or d.cuenta_contable_codigo = p_c.cod)
      and ad.dia < p_fecha_desde
    group by d.cuenta_contable_codigo
  ),
  base as (
    select
      d.cuenta_contable_codigo,
      d.cuenta_contable_nombre,
      d.asiento_id,
      d.line_number,
      a.fecha,
      a.tipo_operacion,
      a.descripcion as descripcion_asiento,
      d.debe::numeric(18,2) as debe,
      d.haber::numeric(18,2) as haber
    from public.detalles_asiento d
    inner join public.asientos_contables a on a.id = d.asiento_id
    inner join asiento_dia ad on ad.aid = a.id
    cross join p_c
    where
      (p_c.cod is null or d.cuenta_contable_codigo = p_c.cod)
      and (p_fecha_desde is null or ad.dia >= p_fecha_desde)
      and (p_fecha_hasta is null or ad.dia <= p_fecha_hasta)
  ),
  con_saldo as (
    select
      b.cuenta_contable_codigo,
      b.cuenta_contable_nombre,
      b.asiento_id,
      b.line_number,
      b.fecha,
      b.tipo_operacion,
      b.descripcion_asiento,
      b.debe,
      b.haber,
      (coalesce(ap.saldo_ap, 0::numeric)
        + sum(b.debe - b.haber) over (
          partition by b.cuenta_contable_codigo
          order by b.fecha asc, b.asiento_id asc, b.line_number asc
          rows between unbounded preceding and current row
        ))::numeric(18,2) as saldo_acumulado
    from base b
    left join apertura ap on ap.cco = b.cuenta_contable_codigo
  )
  select
    cuenta_contable_codigo,
    cuenta_contable_nombre,
    asiento_id,
    line_number,
    fecha,
    tipo_operacion,
    descripcion_asiento,
    debe,
    haber,
    saldo_acumulado
  from con_saldo
  order by
    cuenta_contable_codigo asc,
    fecha asc,
    asiento_id asc,
    line_number asc
  limit greatest(1, least(coalesce(p_limite, 8000), 50000));
$$;

comment on function public.mayor_por_cuenta_saldo(date, date, text, int) is
  'Mayor analítico: movimientos por línea con saldo acumulado (debe - haber) por cuenta, con saldo de apertura si p_fecha_desde está informado.';

grant execute on function public.mayor_por_cuenta_saldo(date, date, text, int) to authenticated;
grant execute on function public.mayor_por_cuenta_saldo(date, date, text, int) to service_role;
