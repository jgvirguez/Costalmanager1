import { createClient } from '@supabase/supabase-js';
import { MOCK_PRODUCTS } from '../src/data/mockData';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbmd5Y2JjbXh3YmloaHR5cHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEyODEsImV4cCI6MjA5MDI2NzI4MX0.oDggiUR0GAncFAeDDVdCnKIijTJtD3Gg5PyTN2liDDw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function seed() {
  console.log('Iniciando carga a Supabase...');
  
  // Mapear productos al formato de Supabase
  const productsToInsert = MOCK_PRODUCTS.map(p => ({
    code: p.code,
    description: p.description,
    unit: p.unit,
    price_usd: 1.0,
    min_stock: 100.0,
    conversion_ratio: p.unit === 'UN' ? 1.0 : 25.0,
    base_unit: 'KG'
  }));

  const chunkSize = 100;
  for (let i = 0; i < productsToInsert.length; i += chunkSize) {
    const chunk = productsToInsert.slice(i, i + chunkSize);
    const { error } = await supabase
      .from('products')
      .upsert(chunk);
    
    if (error) {
      console.error('Error en chunk:', error);
      break;
    }
    console.log(`Progreso: ${i + chunk.length}/${productsToInsert.length}`);
  }
  
  console.log('¡Carga a Supabase completada con éxito!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
