-- ═══════════════════════════════════════════════════════════════════════════
-- CONCURRENCIA #1: Constraint UNIQUE en correlativo de la tabla sales
-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo: Garantizar a nivel de base de datos que NO existan dos ventas con
-- el mismo correlativo, incluso bajo carga concurrente extrema (30+ usuarios).
--
-- Ejecutar en Supabase SQL Editor.
-- Si hay correlativos duplicados existentes, primero ejecutar el bloque de
-- diagnóstico y limpieza al final del archivo.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Diagnóstico previo: ¿hay duplicados actualmente?
SELECT correlativo, COUNT(*) AS cnt
FROM public.sales
WHERE correlativo IS NOT NULL AND correlativo <> ''
GROUP BY correlativo
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 2) Si la consulta anterior retorna 0 filas, ejecutar el constraint:
--    (Si hay duplicados, NO ejecutar esto hasta resolverlos manualmente)
ALTER TABLE public.sales
  ADD CONSTRAINT sales_correlativo_unique UNIQUE (correlativo);

-- 3) Crear índice adicional para acelerar las consultas de generación de
--    correlativo (orden DESC por correlativo).
CREATE INDEX IF NOT EXISTS idx_sales_correlativo_desc
  ON public.sales (correlativo DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- (Opcional) Resolver duplicados antes de aplicar el constraint:
-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE public.sales
--   SET correlativo = correlativo || '-DUP-' || id
--   WHERE id IN (
--     SELECT id FROM (
--       SELECT id, correlativo,
--              ROW_NUMBER() OVER (PARTITION BY correlativo ORDER BY date) AS rn
--       FROM public.sales
--       WHERE correlativo IS NOT NULL AND correlativo <> ''
--     ) t
--     WHERE t.rn > 1
--   );
