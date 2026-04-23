import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbmd5Y2JjbXh3YmloaHR5cHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEyODEsImV4cCI6MjA5MDI2NzI4MX0.oDggiUR0GAncFAeDDVdCnKIijTJtD3Gg5PyTN2liDDw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function addInitialStock() {
  console.log('Iniciando carga de stock inicial simbólico...');
  
  // Obtener todos los códigos de productos
  const { data: products } = await supabase.from('products').select('code');
  if (!products) return;

  const batches = products.map(p => ({
    product_code: p.code,
    purchase_date: new Date().toISOString().split('T')[0],
    expiry_date: '2026-12-31',
    quantity: 1.0,
    cost_usd: 1.0,
    warehouse: 'Galpon D3'
  }));

  const chunkSize = 100;
  for (let i = 0; i < batches.length; i += chunkSize) {
    const chunk = batches.slice(i, i + chunkSize);
    const { error } = await supabase.from('inventory_batches').insert(chunk);
    if (error) console.error('Error in batch:', error);
    console.log(`Progreso: ${i + chunk.length}/${batches.length}`);
  }

  console.log('¡Stock inicial cargado! Ahora la app se verá llena.');
  process.exit(0);
}

addInitialStock().catch(err => { console.error(err); process.exit(1); });
