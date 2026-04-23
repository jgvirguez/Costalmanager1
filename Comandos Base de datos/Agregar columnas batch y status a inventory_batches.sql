alter table public.inventory_batches
add column if not exists batch text;

alter table public.inventory_batches
add column if not exists status text;

update public.inventory_batches
set status = 'RELEASED'
where status is null or btrim(status) = '';

alter table public.inventory_batches
alter column status set default 'RELEASED';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'inventory_batches_status_check'
  ) then
    alter table public.inventory_batches
    add constraint inventory_batches_status_check
    check (status in ('QUARANTINE', 'RELEASED'));
  end if;
end $$;

create index if not exists idx_inventory_batches_product_warehouse_batch
on public.inventory_batches (product_code, warehouse, batch);
