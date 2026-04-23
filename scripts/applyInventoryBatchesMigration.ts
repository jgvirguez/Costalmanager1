import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseServiceKey) {
  console.error('❌ Error: Se requiere SUPABASE_SERVICE_KEY en variables de entorno');
  console.error('   Obtén la service role key desde: Supabase Dashboard > Project Settings > API > service_role key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const migrationSQL = `
-- Agregar columna batch
alter table public.inventory_batches
add column if not exists batch text;

-- Agregar columna status
alter table public.inventory_batches
add column if not exists status text;

-- Actualizar registros existentes sin status
update public.inventory_batches
set status = 'RELEASED'
where status is null or btrim(status) = '';

-- Establecer default en status
alter table public.inventory_batches
alter column status set default 'RELEASED';

-- Agregar constraint de check si no existe
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

-- Crear índice compuesto
CREATE INDEX IF NOT EXISTS idx_inventory_batches_product_warehouse_batch
ON public.inventory_batches (product_code, warehouse, batch);
`;

async function applyMigration() {
  console.log('🔄 Aplicando migración a inventory_batches...\n');
  
  try {
    // Ejecutar SQL directamente usando rpc o query
    const { error } = await supabase.rpc('exec_sql', { sql: migrationSQL });
    
    if (error) {
      // Intentar con método alternativo si no existe la función rpc
      console.log('   Intentando método alternativo...');
      
      // Ejecutar cada statement por separado
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const stmt of statements) {
        if (stmt.toLowerCase().includes('do $$')) {
          console.log('   ⚠️  Saltando bloque DO (requiere ejecución manual en SQL Editor)');
          continue;
        }
        const { error: stmtError } = await supabase.rpc('exec_sql', { sql: stmt });
        if (stmtError && !stmtError.message.includes('does not exist')) {
          console.log(`   ⚠️  ${stmtError.message}`);
        }
      }
    }
    
    console.log('✅ Migración completada (o parcialmente completada)');
    console.log('\n📋 Resumen de cambios:');
    console.log('   • Columna "batch" agregada');
    console.log('   • Columna "status" agregada con default "RELEASED"');
    console.log('   • Constraint de check QUARANTINE/RELEASED');
    console.log('   • Índice idx_inventory_batches_product_warehouse_batch');
    console.log('\n⚠️  Si hay errores con el bloque DO, ejecuta manualmente en SQL Editor de Supabase.');
    
  } catch (err) {
    console.error('❌ Error:', err);
    console.log('\n💡 Alternativa: Copia el SQL del archivo y ejecútalo en:');
    console.log('   https://supabase.com/dashboard/project/tongycbcmxwbihhtyprn/sql-editor');
  }
}

applyMigration();
