import { initializeApp } from 'firebase/app';
import { getFirestore, collection, writeBatch, doc } from 'firebase/firestore';
import { MOCK_PRODUCTS } from '../src/data/mockData';

const firebaseConfig = {
  apiKey: "AIzaSyCJYhr3aSI3KP_uWLk1-wFdaw4GdJ6yo8E",
  authDomain: "costalmanager.firebaseapp.com",
  projectId: "costalmanager",
  storageBucket: "costalmanager.firebasestorage.app",
  messagingSenderId: "770709613219",
  appId: "1:770709613219:web:e635c17f143920a7d7ed16",
  measurementId: "G-BDKKXK1RL9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function seed() {
  console.log('Iniciando carga de 1000+ productos...');
  const chunkSize = 400;
  
  for (let i = 0; i < MOCK_PRODUCTS.length; i += chunkSize) {
    const batch = writeBatch(db);
    const chunk = MOCK_PRODUCTS.slice(i, i + chunkSize);
    
    chunk.forEach(p => {
      const ref = doc(db, 'products', p.code);
      batch.set(ref, {
        code: p.code,
        description: p.description,
        unit: p.unit,
        priceUSD: 1.0,
        min: 100,
        conversionRatio: p.unit === 'UN' ? 1 : 25,
        baseUnit: 'KG',
        lotes: []
      });
    });
    
    await batch.commit();
    console.log(`Progreso: ${i + chunk.length}/${MOCK_PRODUCTS.length}`);
  }
  console.log('¡Carga completada con éxito!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
