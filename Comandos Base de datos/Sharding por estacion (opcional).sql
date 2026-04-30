-- ═══════════════════════════════════════════════════════════════════════════
-- CONCURRENCIA #7: Sharding de correlativos por estación de trabajo (OPCIONAL)
-- ═══════════════════════════════════════════════════════════════════════════
-- Objetivo: Eliminar contención global en correlativos cuando el sistema
-- escale a 100+ usuarios concurrentes. Cada estación tendrá su propio rango
-- de números, evitando que múltiples cajas compitan por la misma SEQUENCE.
--
-- IMPORTANTE: Esta optimización NO es necesaria para 30 usuarios (la SEQUENCE
-- global del CONC-FIX-06 maneja perfectamente ese volumen). Activar solo si
-- el sistema escala a operación masiva.
--
-- Formato propuesto:
--   - Estación 01: G01-XXXXXX, C01-XXXXXX
--   - Estación 02: G02-XXXXXX, C02-XXXXXX
--   - ...
--
-- Sin cambios: el correlativo "global" (G-XXXXXXXX) sigue funcionando.
-- Las estaciones que NO definan station_code usan la SEQUENCE global.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Tabla de configuración de estaciones (si no existe)
CREATE TABLE IF NOT EXISTS public.workstations (
  station_code TEXT PRIMARY KEY,           -- ej: '01', '02', 'CAJA_PPAL'
  station_name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2) Función auxiliar para crear sequences por demanda
CREATE OR REPLACE FUNCTION public.ensure_station_sequence(p_station TEXT, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  seq_name TEXT;
BEGIN
  seq_name := 'sales_correlativo_' || lower(p_station) || '_' || lower(p_kind) || '_seq';
  EXECUTE format(
    'CREATE SEQUENCE IF NOT EXISTS public.%I START WITH 1 INCREMENT BY 1 MINVALUE 1 CACHE 1',
    seq_name
  );
  RETURN seq_name;
END;
$$;

-- 3) RPC: generar correlativo por estación
CREATE OR REPLACE FUNCTION public.next_correlativo_sharded(kind TEXT, station TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  seq_name TEXT;
  next_num BIGINT;
  result TEXT;
  prefix TEXT;
BEGIN
  -- Si no se provee estación, usar la SEQUENCE global de CONC-FIX-06
  IF station IS NULL OR length(trim(station)) = 0 THEN
    RETURN public.next_correlativo(kind);
  END IF;

  seq_name := public.ensure_station_sequence(station, kind);

  EXECUTE format('SELECT nextval(''public.%I'')', seq_name) INTO next_num;

  prefix := CASE WHEN kind = 'CREDIT' THEN 'C' ELSE 'G' END;
  result := prefix || station || '-' || LPAD(next_num::TEXT, 6, '0');

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.next_correlativo_sharded(TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_station_sequence(TEXT, TEXT) TO anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- USO (opcional, solo cuando se quiera activar sharding):
--   const { data } = await supabase.rpc('next_correlativo_sharded',
--     { kind: 'STANDARD', station: '01' });
--   // → 'G01-000123'
--
-- ACTIVAR EN dataService.ts: cambiar la llamada a `next_correlativo` por
-- `next_correlativo_sharded` pasando el `stationName` de currentSession.
-- ═══════════════════════════════════════════════════════════════════════════
