import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://tongycbcmxwbihhtyprn.supabase.co';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
const bucketName = process.env.SUPABASE_SUPPORTS_BUCKET || process.env.VITE_SUPABASE_SUPPORTS_BUCKET || 'supports';

if (!serviceRoleKey) {
  throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY para crear el bucket de soportes.');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) {
    throw listError;
  }

  const exists = Array.isArray(buckets) && buckets.some((bucket) => bucket.name === bucketName);
  if (exists) {
    console.log(`Bucket '${bucketName}' ya existe.`);
    return;
  }

  const { data, error } = await supabase.storage.createBucket(bucketName, {
    public: true,
    fileSizeLimit: '10MB',
    allowedMimeTypes: ['image/*', 'application/pdf']
  });

  if (error) {
    throw error;
  }

  console.log(`Bucket '${bucketName}' creado correctamente.`, data);
}

main().catch((error) => {
  console.error('No se pudo crear el bucket de soportes en Supabase:', error);
  process.exit(1);
});
