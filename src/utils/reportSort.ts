/**
 * Misma regla que el desplegable de cajeros: vacío o solo espacios → "SIN CAJERO".
 * Evita que `operatorName: ''` no coincida con el filtro "SIN CAJERO" (usaba `??` en vez de `||`).
 */
export function normalizeReportCashier(operatorName: unknown): string {
  const raw = String(operatorName ?? '').trim();
  return raw === '' ? 'SIN CAJERO' : raw.toUpperCase();
}

/**
 * Orden de reportes: correlativos G-00000xxx / C-00000xxx de forma numérica.
 */
export function compareCorrelativo(
  a: string | undefined,
  b: string | undefined
): number {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

type SortBy = 'DATE_DESC' | 'DATE_ASC' | 'USD_DESC' | 'USD_ASC' | string;

type SaleRow = {
  timestamp: Date;
  correlativo?: string;
  totalUSD?: number;
};

/**
 * Orden del libro de ventas (UI / export): siempre desempate por correlativo.
 */
export function compareSalesForReport(a: SaleRow, b: SaleRow, sortBy: SortBy): number {
  const sb = String(sortBy || 'DATE_DESC');
  const tA = a.timestamp.getTime();
  const tB = b.timestamp.getTime();
  const usdA = Number(a.totalUSD ?? 0) || 0;
  const usdB = Number(b.totalUSD ?? 0) || 0;
  const ref = compareCorrelativo(a.correlativo, b.correlativo);

  if (sb === 'DATE_ASC') {
    if (tA !== tB) return tA - tB;
    return ref;
  }
  if (sb === 'USD_ASC') {
    if (usdA !== usdB) return usdA - usdB;
    if (tA !== tB) return tB - tA;
    return ref;
  }
  if (sb === 'USD_DESC') {
    if (usdA !== usdB) return usdB - usdA;
    if (tA !== tB) return tB - tA;
    return ref;
  }
  if (tA !== tB) return tB - tA;
  return ref;
}

/**
 * Misma lógica que `compareSalesForReport`, para filas del PDF con columnas
 * ya resueltas (incl. devoluciones con sortUsd = |monto|).
 */
export function compareSalesReportPdfRows(
  a: { sortTime: number; ref: string; sortUsd: number },
  b: { sortTime: number; ref: string; sortUsd: number },
  sortBy: SortBy
): number {
  const sb = String(sortBy || 'DATE_DESC');
  const tA = a.sortTime;
  const tB = b.sortTime;
  const usdA = a.sortUsd;
  const usdB = b.sortUsd;
  const ref = compareCorrelativo(a.ref, b.ref);

  if (sb === 'DATE_ASC') {
    if (tA !== tB) return tA - tB;
    return ref;
  }
  if (sb === 'USD_ASC') {
    if (usdA !== usdB) return usdA - usdB;
    if (tA !== tB) return tB - tA;
    return ref;
  }
  if (sb === 'USD_DESC') {
    if (usdA !== usdB) return usdB - usdA;
    if (tA !== tB) return tB - tA;
    return ref;
  }
  if (tA !== tB) return tB - tA;
  return ref;
}
