-- ═══════════════════════════════════════════════════════════════════════════
-- CONCURRENCIA #6: Correlativos atómicos con PostgreSQL SEQUENCE
-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo: Generar correlativos 100% atómicos a nivel de base de datos.
-- PostgreSQL garantiza que SEQUENCE.nextval es atómico incluso bajo carga
-- concurrente extrema (no hay race condition posible).
--
-- Esto reemplaza/complementa la lógica de generateUniqueCorrelativo en
-- dataService.ts. Si el RPC está disponible, se usa. Si no, fallback a la
-- lógica actual con UNIQUE constraint + retry (CONC-FIX-01).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Crear secuencias separadas para STANDARD y CREDIT
CREATE SEQUENCE IF NOT EXISTS public.sales_correlativo_standard_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

CREATE SEQUENCE IF NOT EXISTS public.sales_correlativo_credit_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- 2) Sincronizar las secuencias con el último correlativo existente para
--    evitar generar números duplicados o saltar a posiciones inválidas.
DO $$
DECLARE
  max_standard INTEGER;
  max_credit INTEGER;
BEGIN
  -- STANDARD: extraer el número de correlativos tipo "G-XXXXXXXX"
  SELECT COALESCE(MAX(CAST(SUBSTRING(correlativo FROM 'G-(\d+)') AS INTEGER)), 0)
    INTO max_standard
  FROM public.sales
  WHERE correlativo LIKE 'G-%';

  -- CREDIT: extraer el número de correlativos tipo "C-XXXXXX"
  SELECT COALESCE(MAX(CAST(SUBSTRING(correlativo FROM 'C-(\d+)') AS INTEGER)), 0)
    INTO max_credit
  FROM public.sales
  WHERE correlativo LIKE 'C-%';

  PERFORM setval('public.sales_correlativo_standard_seq', GREATEST(max_standard, 1), max_standard > 0);
  PERFORM setval('public.sales_correlativo_credit_seq', GREATEST(max_credit, 1), max_credit > 0);

  RAISE NOTICE 'Secuencia STANDARD ajustada a %', max_standard;
  RAISE NOTICE 'Secuencia CREDIT ajustada a %', max_credit;
END $$;

-- 3) Función RPC pública para generar correlativo atómicamente
CREATE OR REPLACE FUNCTION public.next_correlativo(kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  next_num BIGINT;
  result TEXT;
BEGIN
  IF kind = 'CREDIT' THEN
    SELECT nextval('public.sales_correlativo_credit_seq') INTO next_num;
    result := 'C-' || LPAD(next_num::TEXT, 6, '0');
  ELSE
    SELECT nextval('public.sales_correlativo_standard_seq') INTO next_num;
    result := 'G-' || LPAD(next_num::TEXT, 8, '0');
  END IF;
  RETURN result;
END;
$$;

-- 4) Permisos para que el cliente anónimo (Supabase JS) pueda invocar la RPC
GRANT EXECUTE ON FUNCTION public.next_correlativo(TEXT) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- USO desde dataService.ts:
--   const { data, error } = await supabase.rpc('next_correlativo', { kind: 'STANDARD' });
--   // data === 'G-00000123' (atómico, garantizado único)
-- ═══════════════════════════════════════════════════════════════════════════

-- 5) Test rápido (opcional)
-- SELECT public.next_correlativo('STANDARD');  -- debería retornar 'G-00000XXX'
-- SELECT public.next_correlativo('CREDIT');    -- debería retornar 'C-00000XXX'
