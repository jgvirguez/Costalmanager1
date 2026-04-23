import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const supabaseUrl = 'https://tongycbcmxwbihhtyprn.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbmd5Y2JjbXh3YmloaHR5cHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2OTEyODEsImV4cCI6MjA5MDI2NzI4MX0.oDggiUR0GAncFAeDDVdCnKIijTJtD3Gg5PyTN2liDDw';

const supabase = createClient(supabaseUrl, supabaseAnonKey);
const APPLY = process.argv.includes('--apply');
const PRODUCTS_FILE = path.resolve(process.cwd(), 'Productos.txt');
const CHUNK_SIZE = 100;

type ProductRow = {
  code: string;
  description: string;
  unit: string;
  price_usd: number;
  min_stock: number;
  conversion_ratio: number;
  base_unit: string;
};

const normalizeDescription = (value: string) =>
  String(value ?? '')
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ');

const canonicalizeDescription = (value: string) =>
  normalizeDescription(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\bKGS?\b|\bKG\.\b/g, 'KG')
    .replace(/\bGRS?\b|\bGR\.\b/g, 'GR')
    .replace(/\bLTS?\b|\bLITRO\b|\bLITROS\b/g, 'LT')
    .replace(/\bMLS?\b/g, 'ML')
    .replace(/\bUNIDADES\b|\bUNIDAD\b|\bUNDS?\b|\bUND\.\b/g, 'UN')
    .replace(/\bPREMIUN\b/g, 'PREMIUM')
    .replace(/[^A-Z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getLooseKey = (value: string) => canonicalizeDescription(value).replace(/[ .]/g, '');

const tokenizeDescription = (value: string) => {
  const tokens = canonicalizeDescription(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
  return Array.from(new Set(tokens));
};

const getNumericTokens = (tokens: string[]) => tokens.filter((token) => /\d/.test(token)).sort();

const arraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const getTokenSimilarity = (left: string[], right: string[]) => {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union > 0 ? intersection / union : 0;
};

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

const getNextCode = (existingCodes: Set<string>) => {
  let max = 0;
  for (const code of Array.from(existingCodes)) {
    const match = /^P-(\d{4,})$/i.exec(code);
    if (!match) continue;
    max = Math.max(max, Number(match[1]) || 0);
  }
  let next = max + 1;
  let candidate = `P-${String(next).padStart(4, '0')}`;
  while (existingCodes.has(candidate)) {
    next += 1;
    candidate = `P-${String(next).padStart(4, '0')}`;
  }
  existingCodes.add(candidate);
  return candidate;
};

async function main() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    throw new Error(`No se encontró el archivo: ${PRODUCTS_FILE}`);
  }

  const rawLines = fs.readFileSync(PRODUCTS_FILE, 'utf8').split(/\r?\n/);
  const desiredDescriptions = dedupe(rawLines);

  if (!desiredDescriptions.length) {
    throw new Error('Productos.txt no contiene productos válidos.');
  }

  const { data: currentProducts, error: productsError } = await supabase
    .from('products')
    .select('code, description, unit, price_usd, min_stock, conversion_ratio, base_unit')
    .order('code', { ascending: true });

  if (productsError) {
    throw new Error(`No se pudieron consultar los productos actuales: ${productsError.message}`);
  }

  const products = (currentProducts ?? []) as ProductRow[];
  const existingCodes = new Set<string>();
  const byDescription = new Map<string, ProductRow>();
  const byCanonical = new Map<string, ProductRow[]>();
  const byLooseKey = new Map<string, ProductRow[]>();

  for (const product of products) {
    existingCodes.add(String(product.code ?? '').trim().toUpperCase());
    const key = normalizeDescription(product.description);
    const canonicalKey = canonicalizeDescription(product.description);
    const looseKey = getLooseKey(product.description);
    if (key && !byDescription.has(key)) byDescription.set(key, product);
    if (canonicalKey) byCanonical.set(canonicalKey, [...(byCanonical.get(canonicalKey) ?? []), product]);
    if (looseKey) byLooseKey.set(looseKey, [...(byLooseKey.get(looseKey) ?? []), product]);
  }

  const toUpsert: ProductRow[] = [];
  const keptCodes = new Set<string>();
  const createdDescriptions: string[] = [];
  const matchedDescriptions: string[] = [];
  const usedExistingCodes = new Set<string>();
  let exactMatches = 0;
  let canonicalMatches = 0;
  let looseMatches = 0;
  let fuzzyMatches = 0;

  for (const description of desiredDescriptions) {
    const exactMatch = byDescription.get(description);
    const canonicalKey = canonicalizeDescription(description);
    const looseKey = getLooseKey(description);
    const desiredTokens = tokenizeDescription(description);
    const desiredNumericTokens = getNumericTokens(desiredTokens);
    const desiredUnit = inferUnit(description);

    let existing = exactMatch && !usedExistingCodes.has(String(exactMatch.code ?? '').trim().toUpperCase()) ? exactMatch : undefined;

    if (!existing) {
      const canonicalCandidates = (byCanonical.get(canonicalKey) ?? []).filter((item) => !usedExistingCodes.has(String(item.code ?? '').trim().toUpperCase()));
      if (canonicalCandidates.length === 1) {
        existing = canonicalCandidates[0];
      }
    }

    if (!existing) {
      const looseCandidates = (byLooseKey.get(looseKey) ?? []).filter((item) => !usedExistingCodes.has(String(item.code ?? '').trim().toUpperCase()));
      if (looseCandidates.length === 1) {
        existing = looseCandidates[0];
      }
    }

    if (!existing) {
      let bestCandidate: ProductRow | undefined;
      let bestScore = 0;
      for (const candidate of products) {
        const code = String(candidate.code ?? '').trim().toUpperCase();
        if (!code || usedExistingCodes.has(code)) continue;
        const candidateTokens = tokenizeDescription(candidate.description);
        const candidateNumericTokens = getNumericTokens(candidateTokens);
        if (!arraysEqual(desiredNumericTokens, candidateNumericTokens)) continue;
        const candidateUnit = String(candidate.unit ?? inferUnit(candidate.description)).trim().toUpperCase() || inferUnit(candidate.description);
        if (candidateUnit !== desiredUnit) continue;
        const score = getTokenSimilarity(desiredTokens, candidateTokens);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
      if (bestCandidate && bestScore >= 0.8) {
        existing = bestCandidate;
      }
    }

    if (existing) {
      const code = String(existing.code ?? '').trim().toUpperCase();
      keptCodes.add(code);
      usedExistingCodes.add(code);
      matchedDescriptions.push(description);
      if (exactMatch && code === String(exactMatch.code ?? '').trim().toUpperCase()) exactMatches += 1;
      else if ((byCanonical.get(canonicalKey) ?? []).some((item) => String(item.code ?? '').trim().toUpperCase() === code)) canonicalMatches += 1;
      else if ((byLooseKey.get(looseKey) ?? []).some((item) => String(item.code ?? '').trim().toUpperCase() === code)) looseMatches += 1;
      else fuzzyMatches += 1;
      toUpsert.push({
        code,
        description,
        unit: String(existing.unit ?? inferUnit(description)).trim().toUpperCase() || inferUnit(description),
        price_usd: Number(existing.price_usd ?? 1) || 1,
        min_stock: Number(existing.min_stock ?? 0) || 0,
        conversion_ratio: Number(existing.conversion_ratio ?? 1) || 1,
        base_unit: String(existing.base_unit ?? existing.unit ?? inferUnit(description)).trim().toUpperCase() || inferUnit(description)
      });
      continue;
    }

    const unit = inferUnit(description);
    const code = getNextCode(existingCodes);
    keptCodes.add(code);
    createdDescriptions.push(description);
    toUpsert.push({
      code,
      description,
      unit,
      price_usd: 1,
      min_stock: 0,
      conversion_ratio: 1,
      base_unit: unit
    });
  }

  const productsToDelete = products
    .map((product) => String(product.code ?? '').trim().toUpperCase())
    .filter((code) => code && !keptCodes.has(code));

  const { data: allBatches, error: batchesError } = await supabase
    .from('inventory_batches')
    .select('id, product_code');

  if (batchesError) {
    throw new Error(`No se pudieron consultar los lotes actuales: ${batchesError.message}`);
  }

  const batchIdsToDelete = (allBatches ?? [])
    .filter((batch: any) => productsToDelete.includes(String(batch.product_code ?? '').trim().toUpperCase()))
    .map((batch: any) => String(batch.id));

  const { data: movementReferences, error: movementReferencesError } = await supabase
    .from('movements')
    .select('product_code')
    .in('product_code', productsToDelete);

  if (movementReferencesError) {
    throw new Error(`No se pudieron consultar las referencias históricas: ${movementReferencesError.message}`);
  }

  const referencedProductCodes = new Set(
    (movementReferences ?? [])
      .map((row: any) => String(row.product_code ?? '').trim().toUpperCase())
      .filter(Boolean)
  );

  const deletableProductCodes = productsToDelete.filter((code) => !referencedProductCodes.has(code));
  const protectedProductCodes = productsToDelete.filter((code) => referencedProductCodes.has(code));

  console.log('--- RECTIFICACIÓN DE PRODUCTOS DESDE Productos.txt ---');
  console.log(`Modo: ${APPLY ? 'APLICAR CAMBIOS' : 'SIMULACIÓN'}`);
  console.log(`Productos deseados: ${desiredDescriptions.length}`);
  console.log(`Productos existentes en base: ${products.length}`);
  console.log(`Coincidencias conservadas: ${matchedDescriptions.length}`);
  console.log(`Coincidencias exactas: ${exactMatches}`);
  console.log(`Coincidencias por normalización: ${canonicalMatches}`);
  console.log(`Coincidencias por clave flexible: ${looseMatches}`);
  console.log(`Coincidencias por similitud conservadora: ${fuzzyMatches}`);
  console.log(`Productos nuevos a crear: ${createdDescriptions.length}`);
  console.log(`Productos a eliminar: ${productsToDelete.length}`);
  console.log(`Productos eliminables sin historial: ${deletableProductCodes.length}`);
  console.log(`Productos preservados por historial: ${protectedProductCodes.length}`);
  console.log(`Lotes a eliminar: ${batchIdsToDelete.length}`);

  if (createdDescriptions.length > 0) {
    console.log('Nuevos productos:');
    createdDescriptions.slice(0, 25).forEach((item) => console.log(`  + ${item}`));
    if (createdDescriptions.length > 25) {
      console.log(`  ... y ${createdDescriptions.length - 25} más`);
    }
  }

  if (productsToDelete.length > 0) {
    console.log('Códigos a retirar del catálogo:');
    productsToDelete.slice(0, 25).forEach((item) => console.log(`  - ${item}`));
    if (productsToDelete.length > 25) {
      console.log(`  ... y ${productsToDelete.length - 25} más`);
    }
  }

  if (protectedProductCodes.length > 0) {
    console.log('Códigos preservados por historial en movements:');
    protectedProductCodes.slice(0, 25).forEach((item) => console.log(`  = ${item}`));
    if (protectedProductCodes.length > 25) {
      console.log(`  ... y ${protectedProductCodes.length - 25} más`);
    }
  }

  if (!APPLY) {
    console.log('Simulación finalizada. Ejecuta con --apply para aplicar los cambios.');
    return;
  }

  for (const rows of chunk(toUpsert, CHUNK_SIZE)) {
    const { error } = await supabase.from('products').upsert(rows, { onConflict: 'code' });
    if (error) {
      throw new Error(`Error actualizando productos: ${error.message}`);
    }
  }

  for (const ids of chunk(batchIdsToDelete, CHUNK_SIZE)) {
    const { error } = await supabase.from('inventory_batches').delete().in('id', ids);
    if (error) {
      throw new Error(`Error eliminando lotes: ${error.message}`);
    }
  }

  for (const codes of chunk(deletableProductCodes, CHUNK_SIZE)) {
    const { error } = await supabase.from('products').delete().in('code', codes);
    if (error) {
      throw new Error(`Error eliminando productos: ${error.message}`);
    }
  }

  console.log('Rectificación completada correctamente.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
