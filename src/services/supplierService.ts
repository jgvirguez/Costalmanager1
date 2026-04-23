import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { normalizeDocumentId } from '../utils/idNormalization';

export interface Supplier {
  id: string; // RIF or CI
  name: string;
  phone: string;
  address: string;
  email?: string;
  contactName?: string;
  category?: string;
  referredBy?: string;
  active: boolean;
  createdAt: string;
}

class SupplierService {
  private suppliers: Supplier[] = [];
  private listeners: (() => void)[] = [];
  private unsubscribeRealtime: (() => void) | null = null;

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const q = query(collection(db, 'suppliers'), orderBy('name'));
      const snap = await getDocs(q);
      const raw = snap.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          id: normalizeDocumentId(String(data.id || d.id))
        } as Supplier;
      });

      // Deduplicar en memoria por ID normalizado
      const uniqueMap: Record<string, Supplier> = {};
      raw.forEach(s => {
        const id = s.id;
        if (!uniqueMap[id] || (s.address && !uniqueMap[id].address)) {
          uniqueMap[id] = s;
        }
      });
      this.suppliers = Object.values(uniqueMap);
    } catch (error) {
      console.error('SupplierService: Error loading suppliers:', error);
    }

    if (!this.unsubscribeRealtime) {
      const q = query(collection(db, 'suppliers'), orderBy('name'));
      this.unsubscribeRealtime = onSnapshot(q, (snap) => {
        const raw = snap.docs.map(d => {
          const data = d.data();
          return {
            ...data,
            id: normalizeDocumentId(String(data.id || d.id))
          } as Supplier;
        });

        const uniqueMap: Record<string, Supplier> = {};
        raw.forEach(s => {
          const id = s.id;
          if (!uniqueMap[id] || (s.address && !uniqueMap[id].address)) {
            uniqueMap[id] = s;
          }
        });
        this.suppliers = Object.values(uniqueMap);
        this.notify();
      });
    }
  }

  subscribe(listener: () => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notify() {
    this.listeners.forEach(l => l());
  }

  getSuppliers() {
    return this.suppliers;
  }

  findSupplier(idOrName: string) {
    const q = normalizeDocumentId(idOrName);
    const rawQ = idOrName.trim().toUpperCase();
    return this.suppliers.find(s => 
      normalizeDocumentId(s.id) === q || 
      s.name.toUpperCase() === rawQ
    );
  }

  async saveSupplier(supplier: Partial<Supplier>) {
    if (!supplier.id) throw new Error('ID de proveedor requerido');
    
    const nid = normalizeDocumentId(supplier.id);
    const docRef = doc(db, 'suppliers', nid);
    const data = {
      ...supplier,
      id: nid,
      name: supplier.name?.trim().toUpperCase() || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      email: supplier.email || '',
      contactName: supplier.contactName || '',
      category: supplier.category || '',
      referredBy: supplier.referredBy || '',
      active: supplier.active ?? true,
      updatedAt: new Date().toISOString()
    };

    // Si ya existe, mergear createdAt
    const existing = await getDoc(docRef);
    const finalData = existing.exists() 
      ? { ...data, createdAt: existing.data().createdAt || new Date().toISOString() }
      : { ...data, createdAt: new Date().toISOString() };

    await setDoc(docRef, finalData);
    return finalData;
  }

  async deleteSupplier(supplierId: string) {
    const nid = normalizeDocumentId(supplierId);
    await setDoc(doc(db, 'suppliers', nid), { active: false }, { merge: true });
    this.suppliers = this.suppliers.filter(s => normalizeDocumentId(s.id) !== nid);
    this.notify();
  }
}

export const supplierService = new SupplierService();
