-- =====================================================================
-- Fix: columna user_id faltante en tabla sales
-- Síntoma: al procesar ventas, Supabase respondía 400 con
--   {"code":"PGRST204","message":"Could not find the 'user_id' column of 'sales' in the schema cache"}
-- Efecto previo: el insert fallaba, caía a modo local (memoria), init()
-- recargaba desde BD y la venta se perdía junto con correlativo, libro
-- mayor, bank_transactions y movimientos de inventario.
--
-- El código (dataService.ts → insertWithColumnFallback) ya tolera
-- la ausencia de la columna, pero para tener trazabilidad por operador
-- (reporte getOperatorPerformanceReport) se requiere agregarla.
--
-- Ejecutar UNA sola vez en el SQL Editor de Supabase.
-- =====================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS user_id text;

-- Índice para consultas de rendimiento por operador
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales (user_id);

-- Refrescar cache de esquema de PostgREST/Supabase
NOTIFY pgrst, 'reload schema';
