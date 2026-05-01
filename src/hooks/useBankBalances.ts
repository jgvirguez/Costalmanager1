import { useState, useEffect, useCallback } from 'react';
import { dataService } from '../services/dataService';

export interface BankBalanceEntry {
  bankId: string;
  accountId: string;
  currency: 'USD' | 'VES';
  balance: number;
  loading: boolean;
  error: boolean;
}

/** Clave estable para el mapa de saldos (incluye moneda; cuenta vacía = saldo agregado del banco). */
export function bankBalanceMapKey(
  bankId: string,
  accountId: string | undefined | null,
  currency: 'USD' | 'VES'
): string {
  const aid = String(accountId ?? '').trim();
  return `${String(bankId ?? '').trim()}::${aid || 'ALL'}::${currency}`;
}

/**
 * Carga y mantiene los saldos vía `getAvailableBankBalance` (Firestore, misma regla que el módulo Bancos).
 * Se re-consulta cada vez que cambia la lista de keys.
 *
 * @param keys  Array de { bankId, accountId, currency } — `accountId` vacío = todo el banco en esa moneda
 * @returns     Map con clave `bankBalanceMapKey(...)` → BankBalanceEntry
 */
export function useBankBalances(
  keys: Array<{ bankId: string; accountId: string; currency: 'USD' | 'VES' }>
): Map<string, BankBalanceEntry> {
  const [balances, setBalances] = useState<Map<string, BankBalanceEntry>>(new Map());

  const fetch = useCallback(async () => {
    const seen = new Set<string>();
    const unique = keys.filter((k) => {
      if (!String(k.bankId ?? '').trim()) return false;
      const key = bankBalanceMapKey(k.bankId, k.accountId, k.currency);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (unique.length === 0) { setBalances(new Map()); return; }

    const next = new Map<string, BankBalanceEntry>();
    unique.forEach(k => {
      const key = bankBalanceMapKey(k.bankId, k.accountId, k.currency);
      next.set(key, { ...k, balance: 0, loading: true, error: false });
    });
    setBalances(new Map(next));

    await Promise.all(
      unique.map(async k => {
        const key = bankBalanceMapKey(k.bankId, k.accountId, k.currency);
        try {
          const balance = await dataService.getAvailableBankBalance({
            bankId: k.bankId,
            accountId: String(k.accountId ?? '').trim() || undefined,
            currency: k.currency
          });
          next.set(key, { ...k, balance, loading: false, error: false });
        } catch {
          next.set(key, { ...k, balance: 0, loading: false, error: true });
        }
      })
    );
    setBalances(new Map(next));
  }, [JSON.stringify(keys)]);

  useEffect(() => { void fetch(); }, [fetch]);

  return balances;
}
