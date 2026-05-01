-- Libro Mayor Analitico automatico para CxP/CxC.
-- Ejecutar en Supabase SQL Editor.

begin;

create table if not exists public.ledger_analitico (
  id uuid primary key default gen_random_uuid(),
  fecha_contable timestamptz not null,
  cuenta_codigo text not null,
  descripcion text not null default '',
  debe numeric(18,2) not null default 0,
  haber numeric(18,2) not null default 0,
  saldo_acumulado numeric(18,2) not null default 0,
  referencia_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint chk_ledger_analitico_debe_haber_no_negativos check (debe >= 0 and haber >= 0),
  constraint chk_ledger_analitico_un_lado check (
    (debe > 0 and haber = 0) or (haber > 0 and debe = 0)
  )
);

create index if not exists idx_ledger_analitico_cuenta_fecha
  on public.ledger_analitico (cuenta_codigo, fecha_contable asc, id asc);

create index if not exists idx_ledger_analitico_fecha
  on public.ledger_analitico (fecha_contable desc);

create index if not exists idx_ledger_analitico_referencia
  on public.ledger_analitico (referencia_id);

create index if not exists idx_ledger_analitico_metadata_gin
  on public.ledger_analitico using gin (metadata);

create unique index if not exists uq_ledger_analitico_origen_linea
  on public.ledger_analitico ((metadata->>'source_table'), referencia_id, (metadata->>'line_type'));

create or replace function public.get_ledger_previous_balance(
  p_cuenta_codigo text,
  p_fecha_contable timestamptz,
  p_exclude_id uuid default null
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select la.saldo_acumulado
    from public.ledger_analitico la
    where la.cuenta_codigo = p_cuenta_codigo
      and (p_exclude_id is null or la.id <> p_exclude_id)
      and (la.fecha_contable < p_fecha_contable or (la.fecha_contable = p_fecha_contable and la.id < coalesce(p_exclude_id, la.id)))
    order by la.fecha_contable desc, la.id desc
    limit 1
  ), 0)::numeric(18,2);
$$;

create or replace function public.recalculate_ledger_account_balance(
  p_cuenta_codigo text,
  p_from_fecha timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous numeric(18,2);
begin
  select coalesce(sum(debe - haber), 0)::numeric(18,2)
  into v_previous
  from public.ledger_analitico
  where cuenta_codigo = p_cuenta_codigo
    and fecha_contable < p_from_fecha;

  with ordered as (
    select
      id,
      (v_previous + sum(debe - haber) over (
        order by fecha_contable asc, id asc
        rows between unbounded preceding and current row
      ))::numeric(18,2) as next_balance
    from public.ledger_analitico
    where cuenta_codigo = p_cuenta_codigo
      and fecha_contable >= p_from_fecha
  )
  update public.ledger_analitico la
  set saldo_acumulado = ordered.next_balance
  from ordered
  where la.id = ordered.id;
end;
$$;

create or replace function public.create_ledger_analitico_from_operational_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb;
  v_rule public.accounting_account_rules%rowtype;
  v_operation_type text;
  v_amount numeric(18,2);
  v_fecha timestamptz;
  v_description text;
  v_reference text;
  v_source_table text;
  v_metadata jsonb;
begin
  v_row := to_jsonb(new);
  v_source_table := tg_table_name;

  if v_source_table = 'ap_entries' then
    v_operation_type := coalesce(nullif(v_row->>'operation_type', ''), 'AP_ENTRY');
  elsif v_source_table = 'ar_entries' then
    v_operation_type := coalesce(nullif(v_row->>'operation_type', ''), nullif(v_row->'meta'->>'kind', ''), 'AR_ENTRY');
  else
    raise exception 'Tabla operativa no soportada para ledger_analitico: %', v_source_table;
  end if;

  select *
  into v_rule
  from public.accounting_account_rules
  where operation_type = v_operation_type
    and active = true
  limit 1;

  if not found then
    raise exception 'No existe regla contable activa para operation_type=% en accounting_account_rules', v_operation_type;
  end if;

  v_amount := coalesce(nullif(v_row->>'amount_usd', '')::numeric, nullif(v_row->>'amountUSD', '')::numeric, 0)::numeric(18,2);
  if v_amount <= 0 then
    raise exception 'Monto invalido para ledger_analitico. Tabla=%, id=%, monto=%', v_source_table, coalesce(v_row->>'id', ''), v_amount;
  end if;

  v_fecha := coalesce(nullif(v_row->>'timestamp', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now());
  v_description := coalesce(nullif(v_row->>'description', ''), concat('Registro ', v_operation_type, ' ', coalesce(v_row->>'id', '')));
  v_reference := coalesce(nullif(v_row->>'id', ''), gen_random_uuid()::text);
  v_metadata := jsonb_build_object(
    'source_table', v_source_table,
    'operation_type', v_operation_type,
    'source_status', coalesce(v_row->>'status', ''),
    'source_snapshot', v_row
  );

  insert into public.ledger_analitico (
    fecha_contable,
    cuenta_codigo,
    descripcion,
    debe,
    haber,
    saldo_acumulado,
    referencia_id,
    metadata
  ) values (
    v_fecha,
    v_rule.debit_account_code,
    v_description,
    v_amount,
    0,
    public.get_ledger_previous_balance(v_rule.debit_account_code, v_fecha) + v_amount,
    v_reference,
    v_metadata || jsonb_build_object('line_type', 'DEBIT')
  );

  insert into public.ledger_analitico (
    fecha_contable,
    cuenta_codigo,
    descripcion,
    debe,
    haber,
    saldo_acumulado,
    referencia_id,
    metadata
  ) values (
    v_fecha,
    v_rule.credit_account_code,
    v_description,
    0,
    v_amount,
    public.get_ledger_previous_balance(v_rule.credit_account_code, v_fecha) - v_amount,
    v_reference,
    v_metadata || jsonb_build_object('line_type', 'CREDIT')
  );

  perform public.recalculate_ledger_account_balance(v_rule.debit_account_code, v_fecha);
  perform public.recalculate_ledger_account_balance(v_rule.credit_account_code, v_fecha);

  return new;
end;
$$;

drop trigger if exists trg_ap_entries_ledger_analitico on public.ap_entries;
create trigger trg_ap_entries_ledger_analitico
after insert on public.ap_entries
for each row
execute function public.create_ledger_analitico_from_operational_entry();

drop trigger if exists trg_ar_entries_ledger_analitico on public.ar_entries;
create trigger trg_ar_entries_ledger_analitico
after insert on public.ar_entries
for each row
execute function public.create_ledger_analitico_from_operational_entry();

create or replace view public.v_ledger_analitico_consulta as
select
  id,
  fecha_contable,
  (fecha_contable at time zone 'America/Caracas')::date as fecha_local,
  cuenta_codigo,
  descripcion,
  debe,
  haber,
  saldo_acumulado,
  referencia_id,
  metadata,
  metadata->>'source_table' as tabla_origen,
  metadata->>'operation_type' as tipo_operacion,
  metadata->>'line_type' as tipo_linea
from public.ledger_analitico;

create or replace function public.consultar_ledger_analitico(
  p_fecha_desde date default null,
  p_fecha_hasta date default null,
  p_cuenta_codigo text default null,
  p_limite int default 8000
)
returns table (
  id uuid,
  fecha_contable timestamptz,
  cuenta_codigo text,
  descripcion text,
  debe numeric(18,2),
  haber numeric(18,2),
  saldo_acumulado numeric(18,2),
  referencia_id text,
  metadata jsonb,
  tabla_origen text,
  tipo_operacion text,
  tipo_linea text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.id,
    v.fecha_contable,
    v.cuenta_codigo,
    v.descripcion,
    v.debe,
    v.haber,
    v.saldo_acumulado,
    v.referencia_id,
    v.metadata,
    v.tabla_origen,
    v.tipo_operacion,
    v.tipo_linea
  from public.v_ledger_analitico_consulta v
  where (p_cuenta_codigo is null or btrim(p_cuenta_codigo) = '' or v.cuenta_codigo = btrim(p_cuenta_codigo))
    and (p_fecha_desde is null or v.fecha_local >= p_fecha_desde)
    and (p_fecha_hasta is null or v.fecha_local <= p_fecha_hasta)
  order by v.fecha_contable asc, v.cuenta_codigo asc, v.id asc
  limit greatest(1, least(coalesce(p_limite, 8000), 50000));
$$;

insert into public.accounting_account_rules (
  operation_type,
  debit_account_code,
  debit_account_name,
  credit_account_code,
  credit_account_name
) values
  ('AP_ENTRY', '510101', 'COMPRAS / GASTOS POR PAGAR', '211101', 'CUENTAS POR PAGAR'),
  ('AR_ENTRY', '113101', 'CUENTAS POR COBRAR', '410101', 'INGRESOS POR COBRAR')
on conflict (operation_type) do nothing;

grant select on public.ledger_analitico to authenticated;
grant select on public.v_ledger_analitico_consulta to authenticated;
grant execute on function public.consultar_ledger_analitico(date, date, text, int) to authenticated;

commit;
