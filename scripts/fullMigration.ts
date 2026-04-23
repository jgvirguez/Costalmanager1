import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import { initializeApp } from 'firebase/app';
import { collection, doc, getDocs, getFirestore, writeBatch } from 'firebase/firestore';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbmd5Y2JjbXh3YmloaHR5cHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEyODEsImV4cCI6MjA5MDI2NzI4MX0.oDggiUR0GAncFAeDDVdCnKIijTJtD3Gg5PyTN2liDDw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const firebaseConfig = {
  apiKey: 'AIzaSyCJYhr3aSI3KP_uWLk1-wFdaw4GdJ6yo8E',
  authDomain: 'costalmanager.firebaseapp.com',
  projectId: 'costalmanager',
  storageBucket: 'costalmanager.appspot.com',
  messagingSenderId: '770709613219',
  appId: '1:770709613219:web:e635c17f143920a7d7ed16',
  measurementId: 'G-BDKKXK1RL9'
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

const normalizeDescription = (value: string) =>
  String(value ?? '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

const dedupe = (values: string[]) => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeDescription(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
};

const inferUnit = (description: string) => {
  const value = normalizeDescription(description);
  if (/(\bML\b|\bLT\b|\bLITRO\b|\bLITROS\b|\bGALON\b|\bGALONES\b|\bCC\b)/.test(value)) return 'LT';
  if (/(\bUNIDAD\b|\bUNIDADES\b|\bUND\b|\bUND\.\b|\bPQ\b|\bPOTE\b|\bLATA\b|\bFRASCO\b|\bCAJA\b|\bBOLSA\b|\bSOBRE\b|\bBOTELLA\b)/.test(value)) return 'UN';
  return 'KG';
};

const chunk = <T,>(items: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function clearFirestoreCollection(collectionName: string) {
  const snap = await getDocs(collection(db, collectionName));
  const docs = snap.docs;
  const chunkSize = 400;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const batch = writeBatch(db);
    docs.slice(i, i + chunkSize).forEach((entry) => {
      batch.delete(doc(db, collectionName, entry.id));
    });
    await batch.commit();
  }
  return docs.length;
}

async function fullMigration() {
  console.log('--- INICIANDO MIGRACIÓN TOTAL ---');
  
  // 1. Limpiar todo lo anterior
  console.log('Limpiando base de datos...');
  await supabase.from('inventory_batches').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('products').delete().neq('code', '');
  const deletedPurchaseEntries = await clearFirestoreCollection('purchase_entries');
  const deletedPurchaseReturns = await clearFirestoreCollection('purchase_returns');
  console.log(`Firestore purchase_entries eliminados: ${deletedPurchaseEntries}`);
  console.log(`Firestore purchase_returns eliminados: ${deletedPurchaseReturns}`);

  // 2. Leer archivo Productos.txt
  const content = fs.readFileSync('Productos.txt', 'utf-8');
  const lines = dedupe(content.split(/\r?\n/))
    .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  
  console.log(`Leídas ${lines.length} líneas de Productos.txt`);

  // 3. Preparar productos
  const productsToInsert = lines.map((desc, index) => {
    const code = `P-${(index + 1).toString().padStart(3, '0')}`;
    const unit = inferUnit(desc);

    return {
      code,
      description: desc.toUpperCase(),
      unit: unit,
      price_usd: 1.0,
      min_stock: 0.0,
      conversion_ratio: 1.0,
      base_unit: unit
    };
  });

  if (productsToInsert.length !== 464) {
    throw new Error(`Se esperaban 464 productos y se obtuvieron ${productsToInsert.length}. Revise Productos.txt antes de continuar.`);
  }

  console.log('Primeros 10 productos del catálogo final:');
  productsToInsert.slice(0, 10).forEach((product) => {
    console.log(`  ${product.code} · ${product.description}`);
  });

  console.log('Últimos 10 productos del catálogo final:');
  productsToInsert.slice(-10).forEach((product) => {
    console.log(`  ${product.code} · ${product.description}`);
  });

  // 4. Insertar en bloques (Supabase/Postgres limit)
  const chunkSize = 100;
  for (const productChunk of chunk(productsToInsert, chunkSize)) {
    const { error } = await supabase.from('products').insert(productChunk);
    if (error) {
      console.error('Error insertando bloque:', error);
      throw error;
    }
    const lastCode = productChunk[productChunk.length - 1]?.code ?? '';
    console.log(`Progreso: ${lastCode} (${productChunk.length} productos en este bloque)`);
  }

  console.log('--- MIGRACIÓN COMPLETADA CON ÉXITO (STOCK EN 0) ---');
  process.exit(0);
}

fullMigration().catch(err => {
  console.error(err);
  process.exit(1);
});
