export function isCreditSaleByBusinessRule(sale: any): boolean {
  const correlativo = String(sale?.correlativo ?? '').trim().toUpperCase();
  const compactCorrelativo = correlativo.replace(/\s+/g, '');
  const hasCreditCorrelativo = compactCorrelativo.startsWith('C-')
    || /^C\d+/.test(compactCorrelativo)
    || /(^|[^A-Z0-9])C-\d+/.test(compactCorrelativo);
  const hasCashCorrelativo = compactCorrelativo.startsWith('G-')
    || /^G\d+/.test(compactCorrelativo)
    || /(^|[^A-Z0-9])G-\d+/.test(compactCorrelativo);
  if (hasCreditCorrelativo) return true;
  if (hasCashCorrelativo) return false;

  const creditOutstandingUSD = Number(sale?.creditOutstandingUSD ?? 0) || 0;
  if (creditOutstandingUSD > 0.0001) return true;

  const payments = Array.isArray(sale?.payments) ? sale.payments : [];
  const hasCreditPaymentLine = payments.some((p: any) => {
    const method = String(p?.method ?? '').trim().toLowerCase();
    return method === 'credit' || method === 'credito' || method === 'crédito';
  });
  if (hasCreditPaymentLine) return true;

  const method = String(sale?.paymentMethod ?? '').trim().toUpperCase();
  return method === 'CREDIT' || method === 'CRÉDITO' || method === 'CREDITO';
}
