-- Contabilidad automatica: asientos contables + detalles + reglas de mapeo
-- Ejecutar en Supabase SQL Editor.

create table if not exists public.asientos_contables (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  id_operacion_origen text not null,
  tipo_operacion text not null,
  descripcion text not null default '',
  moneda text not null default 'USD',
  tasa numeric(18,6),
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_asientos_operacion_origen
  on public.asientos_contables (id_operacion_origen);

create index if not exists idx_asientos_tipo
  on public.asientos_contables (tipo_operacion, fecha desc);

create table if not exists public.detalles_asiento (
  id uuid primary key default gen_random_uuid(),
  asiento_id uuid not null references public.asientos_contables(id) on delete cascade,
  line_number int not null default 1,
  cuenta_contable_codigo text not null,
  cuenta_contable_nombre text not null,
  debe numeric(18,2) not null default 0,
  haber numeric(18,2) not null default 0,
  nota text not null default '',
  created_at timestamptz not null default now(),
  constraint chk_detalles_debe_haber_no_negativos check (debe >= 0 and haber >= 0),
  constraint chk_detalles_no_ambos_valores check ((debe = 0 and haber > 0) or (haber = 0 and debe > 0))
);

create index if not exists idx_detalles_asiento_id
  on public.detalles_asiento (asiento_id, line_number);

create table if not exists public.accounting_account_rules (
  id uuid primary key default gen_random_uuid(),
  operation_type text not null unique,
  debit_account_code text not null,
  debit_account_name text not null,
  credit_account_code text not null,
  credit_account_name text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

insert into public.accounting_account_rules (
  operation_type, debit_account_code, debit_account_name, credit_account_code, credit_account_name
) values
  ('SALE_CASH', '110101', 'CAJA / BANCOS', '410101', 'INGRESOS POR VENTAS'),
  ('SALE_CREDIT', '113101', 'CUENTAS POR COBRAR', '410101', 'INGRESOS POR VENTAS'),
  ('AR_PAYMENT', '110101', 'CAJA / BANCOS', '113101', 'CUENTAS POR COBRAR'),
  ('AP_PAYMENT', '211101', 'CUENTAS POR PAGAR', '110101', 'CAJA / BANCOS'),
  ('SALE_VOID', '410101', 'INGRESOS POR VENTAS', '110101', 'CAJA / BANCOS'),
  ('INVENTORY_ADJUST_INCREASE', '120101', 'INVENTARIO DE MERCANCIA', '510901', 'AJUSTE POSITIVO DE INVENTARIO'),
  ('INVENTORY_ADJUST_DECREASE', '510902', 'AJUSTE NEGATIVO DE INVENTARIO', '120101', 'INVENTARIO DE MERCANCIA')
on conflict (operation_type) do nothing;

create or replace function public.create_accounting_entry(
  p_header jsonb,
  p_details jsonb
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_asiento_id uuid;
  v_total_debe numeric(18,2);
  v_total_haber numeric(18,2);
begin
  if p_header is null then
    raise exception 'Header contable requerido';
  end if;
  if p_details is null or jsonb_typeof(p_details) <> 'array' or jsonb_array_length(p_details) < 2 then
    raise exception 'Detalle contable invalido: min 2 lineas';
  end if;

  select
    coalesce(sum((line->>'debit')::numeric), 0),
    coalesce(sum((line->>'credit')::numeric), 0)
  into v_total_debe, v_total_haber
  from jsonb_array_elements(p_details) as line;

  if abs(v_total_debe - v_total_haber) > 0.01 then
    raise exception 'Asiento desbalanceado. Debe: %, Haber: %', v_total_debe, v_total_haber;
  end if;

  insert into public.asientos_contables (
    fecha,
    id_operacion_origen,
    tipo_operacion,
    descripcion,
    moneda,
    tasa,
    metadata,
    created_by
  )
  values (
    coalesce((p_header->>'operation_date')::timestamptz, now()),
    coalesce(p_header->>'origin_operation_id', ''),
    coalesce(p_header->>'operation_type', ''),
    coalesce(p_header->>'description', ''),
    coalesce(p_header->>'currency', 'USD'),
    nullif(p_header->>'exchange_rate', '')::numeric,
    coalesce(p_header->'metadata', '{}'::jsonb),
    nullif(p_header->>'created_by', '')
  )
  returning id into v_asiento_id;

  insert into public.detalles_asiento (
    asiento_id,
    line_number,
    cuenta_contable_codigo,
    cuenta_contable_nombre,
    debe,
    haber,
    nota
  )
  select
    v_asiento_id,
    coalesce((line->>'line_number')::int, ordinality::int),
    coalesce(line->>'account_code', ''),
    coalesce(line->>'account_name', ''),
    coalesce((line->>'debit')::numeric, 0),
    coalesce((line->>'credit')::numeric, 0),
    coalesce(line->>'note', '')
  from jsonb_array_elements(p_details) with ordinality as t(line, ordinality);

  return v_asiento_id;
end;
$$;

