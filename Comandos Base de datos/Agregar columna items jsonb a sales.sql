-- Detalle de líneas de factura para historial, devoluciones y anulaciones con revert de lotes.
-- Sin esta columna, dataService persistirá advertencia en consola y los ítems quedarán vacíos tras recargar.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.sales.items IS 'Líneas facturadas (código, cantidades, precios, dispatchLotes) — espejo post-FEFO';
