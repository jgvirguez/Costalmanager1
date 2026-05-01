-- Fix: permitir que el ledger_analitico se genere cuando ar_entries llega por UPSERT.
-- Ejecutar en Supabase SQL Editor despues de haber creado ledger_analitico.

begin;

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
    v_operation_type := coalesce(nullif(v_row->>'operation_type', ''), 'AR_ENTRY');
  else
    raise exception 'Tabla operativa no soportada para ledger_analitico: %', v_source_table;
  end if;

  v_reference := coalesce(nullif(v_row->>'id', ''), gen_random_uuid()::text);

  if exists (
    select 1
    from public.ledger_analitico la
    where la.referencia_id = v_reference
      and la.metadata->>'source_table' = v_source_table
      and la.metadata->>'operation_type' = v_operation_type
  ) then
    return new;
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
    raise exception 'Monto invalido para ledger_analitico. Tabla=%, id=%, monto=%', v_source_table, v_reference, v_amount;
  end if;

  v_fecha := coalesce(nullif(v_row->>'timestamp', '')::timestamptz, nullif(v_row->>'created_at', '')::timestamptz, now());
  v_description := coalesce(nullif(v_row->>'description', ''), concat('Registro ', v_operation_type, ' ', v_reference));
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

drop trigger if exists trg_ar_entries_ledger_analitico on public.ar_entries;
create trigger trg_ar_entries_ledger_analitico
after insert or update on public.ar_entries
for each row
execute function public.create_ledger_analitico_from_operational_entry();

drop trigger if exists trg_ap_entries_ledger_analitico on public.ap_entries;
create trigger trg_ap_entries_ledger_analitico
after insert or update on public.ap_entries
for each row
execute function public.create_ledger_analitico_from_operational_entry();

commit;
