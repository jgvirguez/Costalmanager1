-- Tabla mínima para trazabilidad detallada de inventario (Kardex extendido).
-- Compatible con dataService.ts:
--   - lectura: select * order by created_at desc limit 5000
--   - inserción: type, sku, quantity, warehouse, batch_id, reason, operator, created_at

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  sku text NOT NULL,
  quantity numeric(18,4) NOT NULL CHECK (quantity <> 0),
  warehouse text NOT NULL,
  batch_id text,
  reason text NOT NULL DEFAULT '',
  operator text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
  ON public.inventory_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_sku_created_at
  ON public.inventory_movements (sku, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_type_created_at
  ON public.inventory_movements (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_batch
  ON public.inventory_movements (batch_id);

COMMENT ON TABLE public.inventory_movements IS
'Trazabilidad detallada de movimientos de inventario (ej: devoluciones SALE_RETURN).';

COMMENT ON COLUMN public.inventory_movements.type IS 'Tipo de movimiento (SALE_RETURN, etc.)';
COMMENT ON COLUMN public.inventory_movements.sku IS 'Codigo de producto';
COMMENT ON COLUMN public.inventory_movements.quantity IS 'Cantidad del movimiento';
COMMENT ON COLUMN public.inventory_movements.warehouse IS 'Almacen asociado';
COMMENT ON COLUMN public.inventory_movements.batch_id IS 'ID del lote afectado (opcional)';
COMMENT ON COLUMN public.inventory_movements.reason IS 'Motivo/descripcion del movimiento';
COMMENT ON COLUMN public.inventory_movements.operator IS 'Usuario/operador que ejecuto el movimiento';

-- Trigger genérico para updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_inventory_movements()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_movements_set_updated_at ON public.inventory_movements;
CREATE TRIGGER trg_inventory_movements_set_updated_at
BEFORE UPDATE ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_inventory_movements();

-- Permisos básicos para API PostgREST (Supabase)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_movements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.inventory_movements TO service_role;
