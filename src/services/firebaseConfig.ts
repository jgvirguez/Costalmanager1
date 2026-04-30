import { initializeApp } from 'firebase/app';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAuth, setPersistence, browserSessionPersistence } from 'firebase/auth';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: (import.meta as any).env?.VITE_FIREBASE_API_KEY ?? "AIzaSyCJYhr3aSI3KP_uWLk1-wFdaw4GdJ6yo8E",
  authDomain: (import.meta as any).env?.VITE_FIREBASE_AUTH_DOMAIN ?? "costalmanager.firebaseapp.com",
  projectId: (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID ?? "costalmanager",
  storageBucket: (import.meta as any).env?.VITE_FIREBASE_STORAGE_BUCKET ?? "costalmanager.firebasestorage.app",
  messagingSenderId: (import.meta as any).env?.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "770709613219",
  appId: (import.meta as any).env?.VITE_FIREBASE_APP_ID ?? "1:770709613219:web:e635c17f143920a7d7ed16",
  measurementId: (import.meta as any).env?.VITE_FIREBASE_MEASUREMENT_ID ?? "G-BDKKXK1RL9"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// CONFIGURACIÓN DE PERSISTENCIA: Sesión expira al cerrar el navegador
setPersistence(auth, browserSessionPersistence)
  .then(() => {
    console.log('Persistencia de sesión configurada a SESSION (expira al cerrar navegador)');
  })
  .catch((error) => {
    console.error('Error configurando persistencia de sesión:', error);
  });

enableIndexedDbPersistence(db).catch(() => {
  // ignore
});
export default app;
