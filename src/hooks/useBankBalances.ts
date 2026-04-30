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

/**
 * Carga y mantiene los saldos disponibles de una lista de pares (bankId, accountId).
 * Se re-consulta cada vez que cambia la lista de keys.
 *
 * @param keys  Array de { bankId, accountId, currency }
 * @returns     Map con clave `${bankId}::${accountId}` → BankBalanceEntry
 */
export function useBankBalances(
  keys: Array<{ bankId: string; accountId: string; currency: 'USD' | 'VES' }>
): Map<string, BankBalanceEntry> {
  const [balances, setBalances] = useState<Map<string, BankBalanceEntry>>(new Map());

  const fetch = useCallback(async () => {
    const unique = keys.filter(k => k.bankId);
    if (unique.length === 0) { setBalances(new Map()); return; }

    const next = new Map<string, BankBalanceEntry>();
    unique.forEach(k => {
      const key = `${k.bankId}::${k.accountId}`;
      next.set(key, { ...k, balance: 0, loading: true, error: false });
    });
    setBalances(new Map(next));

    await Promise.all(
      unique.map(async k => {
        const key = `${k.bankId}::${k.accountId}`;
        try {
          const balance = await dataService.getAvailableBankBalance({
            bankId: k.bankId,
            accountId: k.accountId || undefined,
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
