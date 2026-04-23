/**
 * Industrial ID Normalization Utility
 * Standardizes Venezuelan Document IDs (RIF/CI) to 'PREFIX-NUMBER' format.
 */
export function normalizeDocumentId(id: string): string {
  let cleaned = String(id ?? '').trim().toUpperCase();
  if (!cleaned) return '';
  
  // Format: V-12345678, J-12345678, etc.
  if (/^[VEJGP]-[0-9]+$/.test(cleaned)) return cleaned;
  
  // If it has a prefix but no hyphen (V12345678)
  const match = cleaned.match(/^([VEJGP])([0-9]+)$/);
  if (match) return `${match[1]}-${match[2]}`;
  
  // If only digits (9607348), assume 'V-'
  if (/^[0-9]+$/.test(cleaned)) return `V-${cleaned}`;
  
  // Aggressive cleanup for malformed inputs (e.g. V- 123, V 123, 12.345.678)
  const prefixMatch = cleaned.match(/^([VEJGP])/);
  const prefix = prefixMatch ? prefixMatch[1] : 'V';
  const digits = cleaned.replace(/[^0-9]/g, '');
  
  if (digits) {
    return `${prefix}-${digits}`;
  }
  
  return cleaned;
}
