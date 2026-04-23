import { BillingClient } from '../types/billing';
import { normalizeDocumentId } from '../utils/idNormalization';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from './firebaseConfig';

class ClientService {
  private clients: BillingClient[] = [];
  private listeners: (() => void)[] = [];
  private unsubscribeRealtime: (() => void) | null = null;

  static normalizeId(id: string): string {
    return normalizeDocumentId(id);
  }

  constructor() {
    this.init();
  }

  private async init() {
    try {
      const q = query(collection(db, 'clients'), orderBy('name'));
      const snap = await getDocs(q);
      const rawClients = snap.docs.map(d => {
        const c: any = d.data();
        return {
          id: ClientService.normalizeId(c.id ?? d.id),
          name: (c.name ?? '') as string,
          address: (c.address ?? '') as string,
          phone: (c.phone ?? '') as string,
          type: (c.type ?? 'Natural') as 'Natural' | 'Jurídica',
          nationality: (c.nationality ?? 'V') as 'V' | 'E' | 'J' | 'G',
          referredBy: (c.referredBy ?? '') as string,
          creditLimit: Number(c.creditLimit ?? 0) || 0,
          currentBalance: Number(c.currentBalance ?? 0) || 0,
          creditDays: Number(c.creditDays ?? 0) || 0,
          hasCredit: c.hasCredit === true,
          isSolvent: c.isSolvent !== false,
          creditAuthorizedBy: (c.creditAuthorizedBy ?? '') as string,
          creditAuthorizedAt: (c.creditAuthorizedAt ?? '') as string
        };
      });

      // Deduplicar en memoria por ID normalizado
      const uniqueMap: Record<string, BillingClient> = {};
      rawClients.forEach(c => {
        const id = c.id;
        // Si ya existe uno, priorizar el que tenga más información (ej. dirección no vacía)
        if (!uniqueMap[id] || (c.address && !uniqueMap[id].address)) {
          uniqueMap[id] = c;
        }
      });
      this.clients = Object.values(uniqueMap);
    } catch (error) {
      console.error('Industrial OS DB: Error loading clients from Firestore:', error);
    }

    if (!this.unsubscribeRealtime) {
      const q = query(collection(db, 'clients'), orderBy('name'));
      this.unsubscribeRealtime = onSnapshot(
        q,
        (snap) => {
          const rawClients = snap.docs.map(d => {
            const c: any = d.data();
            return {
              id: ClientService.normalizeId(c.id ?? d.id),
              name: (c.name ?? '') as string,
              address: (c.address ?? '') as string,
              phone: (c.phone ?? '') as string,
              type: (c.type ?? 'Natural') as 'Natural' | 'Jurídica',
              nationality: (c.nationality ?? 'V') as 'V' | 'E' | 'J' | 'G',
              referredBy: (c.referredBy ?? '') as string,
              creditLimit: Number(c.creditLimit ?? 0) || 0,
              currentBalance: Number(c.currentBalance ?? 0) || 0,
              creditDays: Number(c.creditDays ?? 0) || 0,
              hasCredit: c.hasCredit === true,
              isSolvent: c.isSolvent !== false,
              creditAuthorizedBy: (c.creditAuthorizedBy ?? '') as string,
              creditAuthorizedAt: (c.creditAuthorizedAt ?? '') as string
            };
          });

          // Deduplicar en tiempo real por ID normalizado
          const uniqueMap: Record<string, BillingClient> = {};
          rawClients.forEach(c => {
            const id = c.id;
            if (!uniqueMap[id] || (c.address && !uniqueMap[id].address)) {
              uniqueMap[id] = c;
            }
          });
          this.clients = Object.values(uniqueMap);
          this.notify();
        },
        (error) => {
          console.error('Industrial OS DB: Firestore realtime error (clients):', error);
        }
      );
    }

    this.notify();
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

  getClients(): BillingClient[] {
    return this.clients;
  }

  findClient(id: string): BillingClient | undefined {
    const nid = ClientService.normalizeId(id);
    return this.clients.find(c => ClientService.normalizeId(c.id) === nid);
  }

  async addClient(newClient: BillingClient) {
    const structuredClient: BillingClient = {
      ...newClient,
      id: ClientService.normalizeId(newClient.id),
      name: newClient.name.trim().toUpperCase()
    };

    if (this.findClient(structuredClient.id)) {
      throw new Error('Sujeto Pasivo ya registrado en la base de datos industrial.');
    }

    try {
      const clientRef = doc(db, 'clients', structuredClient.id);

      try {
        const existingServer = await getDocFromServer(clientRef);
        if (existingServer.exists()) {
          throw new Error('Sujeto Pasivo ya registrado en la base de datos industrial.');
        }
      } catch (e: any) {
        try {
          const existingCache = await getDoc(clientRef);
          if (existingCache.exists()) {
            throw new Error('Sujeto Pasivo ya registrado en la base de datos industrial.');
          }
        } catch {
          // ignore
        }
      }

      await setDoc(clientRef, {
        id: structuredClient.id,
        name: structuredClient.name,
        address: structuredClient.address ?? '',
        phone: structuredClient.phone ?? '',
        type: structuredClient.type,
        nationality: structuredClient.nationality ?? 'V',
        referredBy: structuredClient.referredBy ?? '',
        creditLimit: Number(structuredClient.creditLimit ?? 0) || 0,
        currentBalance: Number(structuredClient.currentBalance ?? 0) || 0,
        creditDays: Number(structuredClient.creditDays ?? 0) || 0,
        hasCredit: structuredClient.hasCredit === true,
        isSolvent: structuredClient.isSolvent !== false,
        creditAuthorizedBy: structuredClient.creditAuthorizedBy ?? '',
        creditAuthorizedAt: structuredClient.creditAuthorizedAt ?? ''
      });
    } catch (error: any) {
      console.error('Error insertando cliente en Firestore:', error);
      throw new Error(`Error sincronizando cliente: ${error?.message ?? 'UNKNOWN_ERROR'}`);
    }

    // Evitar duplicación: onSnapshot será el encargado de reflejar el alta en la lista.
    // Notificamos igual para que la UI reaccione si está esperando.
    this.notify();
    return structuredClient;
  }

  async updateClientCreditProfile(
    clientId: string,
    patch: {
      hasCredit?: boolean;
      creditLimit?: number;
      creditDays?: number;
      isSolvent?: boolean;
      creditAuthorizedBy?: string;
      creditAuthorizedAt?: string;
    }
  ) {
    const normalizedId = ClientService.normalizeId(clientId);
    if (!normalizedId) throw new Error('Cliente inválido para actualización de crédito.');

    const payload = {
      ...(typeof patch.hasCredit === 'boolean' ? { hasCredit: patch.hasCredit } : {}),
      ...(typeof patch.creditLimit === 'number' ? { creditLimit: Number(patch.creditLimit) || 0 } : {}),
      ...(typeof patch.creditDays === 'number' ? { creditDays: Number(patch.creditDays) || 0 } : {}),
      ...(typeof patch.isSolvent === 'boolean' ? { isSolvent: patch.isSolvent } : {}),
      ...(typeof patch.creditAuthorizedBy === 'string' ? { creditAuthorizedBy: patch.creditAuthorizedBy } : {}),
      ...(typeof patch.creditAuthorizedAt === 'string' ? { creditAuthorizedAt: patch.creditAuthorizedAt } : {})
    };

    // Collect ALL Firestore documents that correspond to this logical client.
    // There may be duplicates with slight ID variations (e.g. 'V-9607348' and 'V9607348')
    // that both normalize to the same ID. We must update every matching doc so the
    // dedup logic in onSnapshot doesn't pick a stale document and undo our change.
    const allDocs = await getDocs(query(collection(db, 'clients'), orderBy('name')));
    const matchingDocIds: string[] = [];
    allDocs.docs.forEach(d => {
      const rawInternalId = String(d.data().id ?? '').trim().toUpperCase();
      const rawDocId = String(d.id).trim().toUpperCase();
      if (
        ClientService.normalizeId(rawInternalId) === normalizedId ||
        ClientService.normalizeId(rawDocId) === normalizedId
      ) {
        matchingDocIds.push(d.id);
      }
    });

    if (matchingDocIds.length === 0) {
      // No existing document — create one with the normalized ID
      console.warn(`[clientService] No matching document found for ${normalizedId}, creating new one`);
      await setDoc(doc(db, 'clients', normalizedId), { id: normalizedId, ...payload }, { merge: true });
    } else {
      if (matchingDocIds.length > 1) {
        console.warn(`[clientService] Found ${matchingDocIds.length} duplicate docs for ${normalizedId}: ${matchingDocIds.join(', ')}. Updating all.`);
      }
      // Update every matching doc so dedup can't revert our change
      await Promise.all(
        matchingDocIds.map(docId => updateDoc(doc(db, 'clients', docId), payload))
      );
    }

    this.clients = this.clients.map((client) =>
      ClientService.normalizeId(client.id) === normalizedId
        ? { ...client, ...payload }
        : client
    );

    this.notify();
  }

  async updateClient(clientId: string, data: Partial<BillingClient>) {
    const id = ClientService.normalizeId(clientId);
    if (!id) throw new Error('Cliente inválido.');

    const payload: any = { ...data };
    delete payload.id; // Evitar sobrescribir ID

    await updateDoc(doc(db, 'clients', id), payload);

    this.clients = this.clients.map((client) =>
      ClientService.normalizeId(client.id) === id ? { ...client, ...payload } : client
    );

    this.notify();
  }

  async deleteClient(clientId: string) {
    const id = ClientService.normalizeId(clientId);
    if (!id) throw new Error('Cliente inválido.');

    await setDoc(doc(db, 'clients', id), { active: false }, { merge: true });
    // O eliminar físicamente si se prefiere:
    // await deleteDoc(doc(db, 'clients', id));

    this.clients = this.clients.filter(c => ClientService.normalizeId(c.id) !== id);
    this.notify();
  }
}

export const clientService = new ClientService();
