/**
 * CSV compatible con Excel (regional es): separador `;`, BOM UTF-8, celdas escapadas.
 * Todas las filas deben tener el mismo ancho (columnas) para que el libro no se "rompa" en columnas.
 */

const EXCEL_CSV_DELIMITER = ';';

function escapeCell(value: unknown, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.length === 0) return '';
  if (/["\n\r]/.test(s) || s.includes(delimiter) || s.includes('\t')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Asegura ancho fijo: rellena con cadenas vacías a la derecha.
 */
function padRow(cells: string[], width: number): string[] {
  const r = cells.slice(0, width);
  while (r.length < width) {
    r.push('');
  }
  return r;
}

export function buildExcelFriendlyCsv(
  columnHeaders: string[],
  dataRows: Record<string, unknown>[],
  options?: {
    /** Filas (array de celdas) antes de la fila de encabezados; se rellenan al ancho. */
    preambleRows?: string[][];
  }
): string {
  const width = columnHeaders.length;
  const d = EXCEL_CSV_DELIMITER;
  const line = (cells: string[]) => padRow(cells, width).map((c) => escapeCell(c, d)).join(d);

  const out: string[] = [];
  (options?.preambleRows ?? []).forEach((r) => {
    out.push(line(padRow(r, width)));
  });
  out.push(line(columnHeaders));
  dataRows.forEach((row) => {
    const cells = columnHeaders.map((h) => (row as any)[h] ?? '');
    out.push(line(cells));
  });
  // Excel en Windows: salto CRLF
  return '\uFEFF' + out.join('\r\n');
}

/**
 * Misma lógica que `buildExcelFriendlyCsv` pero con filas ya en orden de columnas.
 */
export function buildExcelFriendlyMatrixCsv(
  columnHeaders: string[],
  dataRows: (string | number)[][],
  options?: { preambleRows?: string[][] }
): string {
  const width = columnHeaders.length;
  const d = EXCEL_CSV_DELIMITER;
  const line = (cells: string[]) => padRow(cells, width).map((c) => escapeCell(c, d)).join(d);

  const out: string[] = [];
  (options?.preambleRows ?? []).forEach((r) => {
    out.push(line(padRow(r, width)));
  });
  out.push(line(columnHeaders));
  dataRows.forEach((row) => {
    out.push(line((row as string[]).map((c) => (c === null || c === undefined ? '' : String(c)))));
  });
  return '\uFEFF' + out.join('\r\n');
}

export { EXCEL_CSV_DELIMITER };
