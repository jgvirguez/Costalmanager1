/**
 * Cálculo unificado de saldos bancarios (neto = saldo inicial + suma de movimientos firmados).
 * Los montos en `bank_transactions` se guardan con signo: ingresos > 0, egresos < 0.
 */

export function roundMoney(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Movimientos que cuentan para el saldo operativo (no pendientes / anulados; no desconciliados explícitos). */
export function isBankTransactionCountedForBalance(row: any): boolean {
  const st = String(row?.status ?? '').trim().toUpperCase();
  if (
    ['PENDING', 'PENDIENTE', 'CANCELLED', 'CANCELADO', 'VOID', 'ANULADO', 'REJECTED', 'FALLIDO'].includes(st)
  ) {
    return false;
  }
  if (row?.reconciled === false) return false;
  if (row?.completed === false) return false;
  return true;
}

/** Monto firmado en la columna de la moneda pedida (USD → amountUSD, VES → amountVES). */
export function signedLedgerAmountInCurrency(row: any, currency: 'USD' | 'VES'): number {
  if (currency === 'USD') return Number(row?.amountUSD ?? 0) || 0;
  return Number(row?.amountVES ?? 0) || 0;
}

export function getOpeningBalanceForAccount(account: any): number {
  const v = Number(account?.openingBalance ?? account?.initialBalance ?? 0) || 0;
  return roundMoney(v);
}

/**
 * Saldo neto de una cuenta concreta (o todas las cuentas del banco si `accountId` vacío),
 * en una sola moneda, incluyendo saldo inicial de la cuenta cuando aplica.
 */
export function computeNetBankBalanceFromTransactions(options: {
  transactions: any[];
  bankId: string;
  accountId?: string | null;
  currency: 'USD' | 'VES';
  openingBalance?: number;
}): number {
  const { transactions, bankId, accountId, currency } = options;
  const opening = Number(options.openingBalance ?? 0) || 0;
  const bid = String(bankId ?? '').trim();
  const aid = accountId ? String(accountId).trim() : '';
  let sum = opening;
  for (const row of transactions) {
    if (String(row?.bankId ?? '').trim() !== bid) continue;
    if (aid && String(row?.accountId ?? '').trim() !== aid) continue;
    if (!isBankTransactionCountedForBalance(row)) continue;
    sum += signedLedgerAmountInCurrency(row, currency);
  }
  return roundMoney(sum);
}

/** Suma saldos iniciales de todas las cuentas del banco en la moneda indicada. */
export function sumOpeningBalancesForBank(bank: any, targetCurrency: 'USD' | 'VES'): number {
  const accounts = Array.isArray(bank?.accounts) ? bank.accounts : [];
  return roundMoney(
    accounts
      .filter((a: any) => String(a?.currency ?? '').toUpperCase() === targetCurrency)
      .reduce((s: number, a: any) => s + getOpeningBalanceForAccount(a), 0)
  );
}

/**
 * Delta firmado de un movimiento para el agregado por banco (varias cuentas / mixto):
 * solo suma en el bucket USD o VES que corresponde a la moneda de la cuenta o, si no hay cuenta, a `tx.currency`.
 */
export function ledgerDeltaForBankAggregate(tx: any, bank: any, targetCurrency: 'USD' | 'VES'): number {
  if (!isBankTransactionCountedForBalance(tx)) return 0;
  if (String(tx?.bankId ?? '').trim() !== String(bank?.id ?? '').trim()) return 0;
  const accounts = Array.isArray(bank?.accounts) ? bank.accounts : [];
  const aid = String(tx?.accountId ?? '').trim();
  const acc = accounts.find((a: any) => String(a?.id ?? '').trim() === aid);
  const accCurrency = acc ? String(acc.currency ?? '').toUpperCase() : '';
  const txCurrency = String(tx?.currency ?? '').toUpperCase();
  if (targetCurrency === 'USD') {
    if (accCurrency === 'USD' || (!acc && txCurrency === 'USD')) return signedLedgerAmountInCurrency(tx, 'USD');
    return 0;
  }
  if (accCurrency === 'VES' || (!acc && txCurrency === 'VES')) return signedLedgerAmountInCurrency(tx, 'VES');
  return 0;
}

export function computeBankWideNetBalance(
  transactions: any[],
  bank: any,
  targetCurrency: 'USD' | 'VES'
): number {
  const opening = sumOpeningBalancesForBank(bank, targetCurrency);
  let sum = opening;
  for (const row of transactions) {
    sum += ledgerDeltaForBankAggregate(row, bank, targetCurrency);
  }
  return roundMoney(sum);
}
