import { MOCK_PRODUCTS } from '../data/mockData';
import currentProductCatalogRaw from '../../Productos.txt?raw';
import { BillingItem, BillingClient } from '../types/billing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { supabase } from './supabaseConfig';
import { normalizeDocumentId } from '../utils/idNormalization';
import { auth, db, storage } from './firebaseConfig';
import { authService } from './authService';

export type UserRole = 'ADMIN' | 'ALMACENISTA' | 'CAJERO' | 'FINANZAS' | 'SUPERVISOR';

export type PermissionKey =
  | 'ALL'
  | 'DASHBOARD_VIEW'
  | 'BILLING'
  | 'SALES_READ'
  | 'SALES_VOID'
  | 'INVENTORY_READ'
  | 'INVENTORY_WRITE'
  | 'FRACTIONATION'
  | 'CLOSING_VIEW'
  | 'CLOSING_AUDIT'
  | 'FINANCE_VIEW'
  | 'REPORTS_VIEW'
  | 'REPORTS_SALES'
  | 'REPORTS_INVENTORY'
  | 'SECURITY_VIEW'
  | 'SETTINGS_RATES'
  | 'ACCOUNTING_ALERTS';

export interface PermissionDefinition {
  key: PermissionKey;
  label: string;
  module: string;
}

export interface User {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  pin?: string;
  permissions: PermissionKey[];
  active: boolean;
  firebaseUid?: string;
}

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: 'ALL', label: 'Acceso total', module: 'Sistema' },
  { key: 'DASHBOARD_VIEW', label: 'Ver panel principal', module: 'Dashboard' },
  { key: 'BILLING', label: 'Facturar ventas', module: 'Ventas' },
  { key: 'SALES_READ', label: 'Consultar ventas', module: 'Ventas' },
  { key: 'SALES_VOID', label: 'Anular ventas facturadas', module: 'Ventas' },
  { key: 'INVENTORY_READ', label: 'Ver inventario', module: 'Inventario' },
  { key: 'INVENTORY_WRITE', label: 'Modificar inventario y compras', module: 'Inventario' },
  { key: 'FRACTIONATION', label: 'Procesar desglose', module: 'Producción' },
  { key: 'CLOSING_VIEW', label: 'Abrir y cerrar caja', module: 'Caja' },
  { key: 'CLOSING_AUDIT', label: 'Auditar cierres de caja', module: 'Caja' },
  { key: 'FINANCE_VIEW', label: 'Acceder a finanzas', module: 'Finanzas' },
  { key: 'REPORTS_VIEW', label: 'Ver reportes', module: 'Reportes' },
  { key: 'REPORTS_SALES', label: 'Ver reportes de ventas', module: 'Reportes' },
  { key: 'REPORTS_INVENTORY', label: 'Ver reportes de inventario', module: 'Reportes' },
  { key: 'SECURITY_VIEW', label: 'Gestionar usuarios y permisos', module: 'Seguridad' },
  { key: 'SETTINGS_RATES', label: 'Ajustar tasas operativas', module: 'Configuración' },
  { key: 'ACCOUNTING_ALERTS', label: 'Ver alertas contables (CxP, CxC, DxC, etc.)', module: 'Contabilidad' }
];

export interface BankAccount {
  id: string;
  label: string;
  currency: 'VES' | 'USD';
  accountNumber: string;
  accountType?: string;
  holder?: string;
  rif?: string;
  phone?: string;
}

export interface BankEntity {
  id: string;
  name: string;
  accounts: BankAccount[];
  supportedMethods: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface POSTerminal {
  id: string;
  name: string;
  serial?: string;
  merchantId?: string;
  bankId: string;
  bankName: string;
  accountId: string;
  accountLabel: string;
  accountNumber?: string;
  supportedMethods: string[];
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const normalizeBankAccountNumber = (v: string) =>
  String(v ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s\-]/g, '');

const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const roundQtyValue = (value: number) => roundTo(value, 4);
const roundPriceValue = (value: number) => roundTo(value, 8);
const roundPercentPrice = (basePrice: number, factor: number) => roundPriceValue(basePrice * factor);

const normalizeCatalogDescription = (value: string) =>
  String(value ?? '')
    .toUpperCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`´]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\bKGS?\b|\bKG\.\b/g, 'KG')
    .replace(/\bGRS?\b|\bGR\.\b/g, 'GR')
    .replace(/\bLTS?\b|\bLITRO\b|\bLITROS\b/g, 'LT')
    .replace(/\bMLS?\b/g, 'ML')
    .replace(/\bUNIDADES\b|\bUNIDAD\b|\bUNDS?\b|\bUND\.\b/g, 'UN')
    .replace(/\bPREMIUN\b/g, 'PREMIUM')
    .replace(/[^A-Z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const CURRENT_PRODUCT_CATALOG = new Set(
  String(currentProductCatalogRaw ?? '')
    .split(/\r?\n/)
    .map((line) => normalizeCatalogDescription(line))
    .filter(Boolean)
);

export interface Batch {
  id: string;
  sku: string;
  qty: number;
  expiry: Date;
  warehouse: string;
  costUSD: number;
  batch?: string;
  status?: string;
  supplier?: string;
  paymentType?: 'CASH' | 'CREDIT';
  invoiceImage?: string;
  purchaseEntryId?: string;
  invoiceGroupId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  supplierDocument?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  totalInvoiceUSD?: number;
  totalLineUSD?: number;
  unit?: string;
  lineNumber?: number;
  linesCount?: number;
  entryDate?: string;
  supports?: ARPaymentSupport[];
}

export interface InventoryMovement {
  id: string;
  type: string;
  sku: string;
  qty: number;
  user: string;
  timestamp: Date;
  warehouse: string;
  batchId?: string;
  reason?: string;
}

export interface ProductStock {
  code: string;
  description: string;
  unit: string;
  priceUSD: number;
  prices: number[];
  min: number;
  conversionRatio: number;
  baseUnit: string;
  lotes: Batch[];
}

export interface SaleHistoryEntry {
  id?: string;
  correlativo: string;
  client: BillingClient;
  items: BillingItem[];
  totalUSD: number;
  totalVES: number;
  paymentMethod: string;
  exchangeRate: number;
  captures?: string[];
  payments?: any[];
  operatorName?: string;
  userId?: string;
  timestamp: Date;
  notes?: string;
  status?: 'PAID' | 'VOID' | 'PENDING';
  voided?: boolean;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
  globalDiscount?: {
    type: 'percent' | 'fixed';
    value: number;
    amountUSD: number;
  };
}

/** Líneas de factura para columna `items` (jsonb) en public.sales. */
function serializeSaleLineItemsForStorage(items: BillingItem[]): Record<string, unknown>[] {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const row: Record<string, unknown> = {
      id: String(it.id ?? it.code ?? ''),
      code: String(it.code ?? ''),
      description: String(it.description ?? ''),
      unit: String(it.unit ?? ''),
      qty: roundQtyValue(Number(it.qty) || 0),
      priceUSD: roundPriceValue(Number(it.priceUSD) || 0),
      tax: Number(it.tax) || 0
    };
    if (it.priceLevel != null) row.priceLevel = it.priceLevel;
    if (Array.isArray(it.dispatchLotes) && it.dispatchLotes.length > 0) {
      row.dispatchLotes = it.dispatchLotes.map((d) => ({
        warehouse: String(d.warehouse ?? ''),
        batchId: String(d.batchId ?? ''),
        qty: roundQtyValue(Number(d.qty) || 0)
      }));
    }
    return row;
  });
}

function parseSaleLineItemsFromDb(raw: unknown): BillingItem[] {
  if (raw == null) return [];
  let arr: unknown[] = [];
  if (Array.isArray(raw)) arr = raw;
  else if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      arr = Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  } else {
    return [];
  }
  return arr.map((it: any) => {
    const item: BillingItem = {
      id: String(it?.id ?? it?.code ?? ''),
      code: String(it?.code ?? ''),
      description: String(it?.description ?? ''),
      unit: String(it?.unit ?? ''),
      qty: roundQtyValue(Number(it?.qty) || 0),
      priceUSD: roundPriceValue(Number(it?.priceUSD) ?? 0),
      tax: Number(it?.tax) || 0
    };
    if (it?.priceLevel != null) item.priceLevel = Number(it.priceLevel);
    if (Array.isArray(it?.dispatchLotes) && it.dispatchLotes.length > 0) {
      item.dispatchLotes = it.dispatchLotes.map((d: any) => ({
        warehouse: String(d?.warehouse ?? ''),
        batchId: String(d?.batchId ?? ''),
        qty: roundQtyValue(Number(d?.qty) || 0)
      }));
    }
    return item;
  });
}

/** Mapea una fila de public.sales (Supabase) a SaleHistoryEntry (hidrata `items` jsonb). */
function mapSupabaseSaleRowToHistoryEntry(s: any): SaleHistoryEntry {
  const rawPaymentMethod = String(s?.payment_method ?? s?.paymentMethod ?? '').trim();
  const ts = s?.date
    ? new Date(s.date)
    : s?.created_at
      ? new Date(s.created_at)
      : s?.timestamp
        ? new Date(s.timestamp)
        : new Date();
  return {
    id: s?.id,
    correlativo: String(s?.correlativo ?? ''),
    client: {
      name: String(s?.customer_name ?? ''),
      id: String(s?.customer_id ?? ''),
      address: '',
      phone: '',
      type: 'Natural'
    } as BillingClient,
    items: parseSaleLineItemsFromDb(s?.items),
    payments: Array.isArray(s?.payments) ? s.payments : [],
    totalUSD: Number(s?.total_usd ?? s?.totalUSD ?? 0),
    totalVES: Number(s?.total_ves ?? s?.totalVES ?? 0),
    paymentMethod: rawPaymentMethod || 'MIXTO',
    exchangeRate: Number(s?.exchange_rate ?? s?.exchangeRate ?? 0) || 0,
    captures: [],
    timestamp: ts,
    operator: s?.operator,
    operatorName: s?.operator,
    userId: s?.user_id ?? '',
    status: s?.status,
    voided: s?.voided,
    voidReason: s?.void_reason,
    voidedBy: s?.voided_by,
    voidedAt: s?.voided_at
  } as SaleHistoryEntry;
}

export interface AuditEntry {
  id: string;
  timestamp: Date;
  actor: string;
  action: string;
  entity: string;
  details: string;
  hash: string;
}

export type ExpenseCategory =
  | 'NOMINA' | 'ALQUILER' | 'SERVICIOS' | 'FLETE' | 'SUMINISTROS'
  | 'MANTENIMIENTO' | 'PUBLICIDAD' | 'IMPUESTOS' | 'BANCARIO' | 'OTRO';

export const EXPENSE_CATEGORIES: Record<ExpenseCategory, string> = {
  NOMINA: 'Nómina / RRHH',
  ALQUILER: 'Alquiler',
  SERVICIOS: 'Servicios (luz, agua, internet)',
  FLETE: 'Flete / Transporte',
  SUMINISTROS: 'Suministros / Papelería',
  MANTENIMIENTO: 'Mantenimiento / Reparaciones',
  PUBLICIDAD: 'Publicidad / Marketing',
  IMPUESTOS: 'Impuestos / Tasas',
  BANCARIO: 'Comisiones Bancarias',
  OTRO: 'Otro',
};

export interface OperationalExpense {
  id: string;
  timestamp: Date;
  description: string;
  amountUSD: number;
  amountVES?: number;
  currency: 'USD' | 'VES';
  category: ExpenseCategory;
  type?: 'FIXED' | 'VARIABLE';
  subcategory?: string;
  supplier?: string;
  paymentMethod?: 'cash_usd' | 'cash_ves' | 'transfer' | 'mobile' | 'zelle' | 'other';
  reference?: string;
  status: 'ACTIVE' | 'VOID';
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: string;
  createdBy?: string;
  budgetMonth?: string;
}

export interface APEntry {
  id: string;
  timestamp: Date;
  supplier: string;
  supplierId?: string;
  description: string;
  amountUSD: number;
  balanceUSD: number;
  dueDate: Date;
  status: 'PENDING' | 'OVERDUE' | 'PAID';
}

export interface AREntry {
  id: string;
  timestamp: Date;
  customerName: string;
  customerId: string;
  description: string;
  amountUSD: number;
  balanceUSD: number;
  dueDate: Date;
  status: 'PENDING' | 'OVERDUE' | 'PAID' | 'VOID';
  saleCorrelativo: string;
  lateFeeUSD: number;
  penaltyAppliedAt?: string;
  voidReason?: string;
  voidedBy?: string;
  voidedAt?: string;
}

export interface ClientAdvance {
  id: string;
  customerId: string;
  customerName: string;
  amountUSD: number;
  balanceUSD: number;
  currency: 'USD' | 'VES';
  originalAmountVES?: number;
  rateAtCreation?: number;
  status: 'AVAILABLE' | 'APPLIED' | 'PARTIAL';
  originInvoiceId: string;
  originCorrelativo: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface SupplierAdvance {
  id: string;
  supplierId?: string;
  supplierName: string;
  amountUSD: number;
  balanceUSD: number;
  currency: 'USD' | 'VES';
  originalAmountVES?: number;
  rateAtCreation?: number;
  status: 'AVAILABLE' | 'APPLIED' | 'PARTIAL';
  reference: string;
  method?: string;
  bankId?: string;
  bankName?: string;
  apEntryApplied?: string;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface ARPaymentSupport {
  name: string;
  url: string;
  path: string;
  contentType: string;
  size: number;
  provider?: 'firebase' | 'supabase' | 'inline';
  bucket?: string;
}

export interface CreateProductInput {
  code?: string;
  description: string;
  unit: string;
  priceUSD?: number;
  minStock?: number;
  conversionRatio?: number;
  baseUnit?: string;
}

export interface PurchaseRegistrationInput {
  sku?: string;
  newProduct?: CreateProductInput;
  supplier: string;
  supplierDocument?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceDueDate?: Date;
  expiryDate: Date;
  qty: number;
  costUSD: number;
  totalInvoiceUSD: number;
  paymentType: 'CASH' | 'CREDIT';
  paymentMethod?: string;
  bankId?: string;
  bankName?: string;
  bankAccountId?: string;
  bankAccountLabel?: string;
  reference?: string;
  files?: File[];
  warehouse?: string;
}

export interface PurchaseRegistrationItemInput {
  sku?: string;
  newProduct?: CreateProductInput;
  unit?: string;
  qty: number;
  costUSD: number;
  expiryDate: Date;
  batch: string;
  totalLineUSD?: number;
  warehouse?: string;
}

export interface PurchaseRegistrationInvoiceInput {
  supplier: string;
  supplierDocument?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  invoiceNumber: string;
  invoiceDate: Date;
  invoiceDueDate?: Date;
  totalInvoiceUSD?: number;
  paymentType: 'CASH' | 'CREDIT';
  paymentMethod?: string;
  bankId?: string;
  bankName?: string;
  bankAccountId?: string;
  bankAccountLabel?: string;
  reference?: string;
  files?: File[];
  warehouse?: string;
  items: PurchaseRegistrationItemInput[];
}

export interface PurchaseRegistrationResult {
  sku: string;
  createdProduct: boolean;
  apEntryId?: string;
  supportsUploadError?: string;
}

export interface PurchaseRegistrationInvoiceItemResult {
  sku: string;
  createdProduct: boolean;
  batchId: string;
  priceUSD: number;
  totalLineUSD: number;
}

export interface PurchaseRegistrationInvoiceResult {
  items: PurchaseRegistrationInvoiceItemResult[];
  apEntryId?: string;
  supportsUploadError?: string;
  totalInvoiceUSD: number;
}

export interface APInvoiceDetailLine {
  id: string;
  lineNumber: number;
  sku: string;
  productDescription: string;
  qty: number;
  unit?: string;
  costUSD: number;
  totalLineUSD: number;
  batch?: string;
  expiryDate?: string;
  warehouse?: string;
}

export interface APEntryDetail {
  apId: string;
  supplier: string;
  description: string;
  amountUSD: number;
  balanceUSD: number;
  dueDate: string;
  status: 'PENDING' | 'OVERDUE' | 'PAID';
  invoiceGroupId?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  invoiceDueDate?: string;
  supplierDocument?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supports: ARPaymentSupport[];
  lines: APInvoiceDetailLine[];
}

export interface APPaymentLineInput {
  note?: string;
  files?: File[];
  method?: string;
  currency?: 'USD' | 'VES';
  amountUSD: number;
  amountVES?: number;
  rateUsed?: number;
  bank?: string;
  bankId?: string;
  bankAccountId?: string;
  reference?: string;
}

export interface PurchaseReturnInput {
  batchId: string;
  sku: string;
  qty: number;
  reason: string;
  reference?: string;
}

export interface PurchaseReturnResult {
  batchId: string;
  sku: string;
  qty: number;
  totalUSD: number;
  apEntryAdjusted?: string;
}

export interface PurchaseAdjustmentNoteInput {
  type: 'CREDIT' | 'DEBIT';
  supplier?: string;
  apEntryId?: string;
  amountUSD: number;
  reference?: string;
  reason: string;
  relatedPurchaseId?: string;
  files?: File[];
}

export interface PurchaseAdjustmentNoteResult {
  noteId: string;
  type: 'CREDIT' | 'DEBIT';
  supplier: string;
  amountUSD: number;
  apEntryId?: string;
  createdAPEntryId?: string;
  supportsUploadError?: string;
}

export interface ManufacturingComponentInput {
  sku: string;
  warehouse: string;
  qty: number;
}

export interface ManufacturingInput {
  outputSku: string;
  outputBatch: string;
  outputQty: number;
  outputWarehouse?: string;
  outputStatus?: 'QUARANTINE' | 'RELEASED';
  expiryDate: Date;
  productionDate?: Date;
  reference?: string;
  notes?: string;
  operatingCostUSD?: number;
  wasteReason?: string;
  components: ManufacturingComponentInput[];
}

export interface ManufacturingResult {
  batchId: string;
  outputSku: string;
  outputBatch: string;
  outputQty: number;
  totalInputCostUSD: number;
  totalOperatingCostUSD: number;
  totalProductionCostUSD: number;
  unitCostUSD: number;
  wasteQty: number;
  wastePct: number;
  outputStatus: 'QUARANTINE' | 'RELEASED';
  consumedComponents: number;
}

export interface CashBoxSession {
  id: string;
  userId: string;
  userName: string;
  stationName?: string;
  openDate: string;
  openTime: string;
  openRateBCV?: number;
  openRateParallel?: number;
  openRateInternal?: number;
  initialAmountUSD: number;
  initialAmountVES: number;
  openingBreakdown?: CashBoxBreakdownLine[];
  status: 'OPEN' | 'CLOSED';
  closeDate?: string;
  closeTime?: string;
  closeRateBCV?: number;
  closeRateParallel?: number;
  closeRateInternal?: number;
  finalAmountUSD?: number;
  finalAmountVES?: number;
  closingDeclaredBreakdown?: CashBoxBreakdownLine[];
  closingNote?: string;
  systemClosureUSD?: number;
  systemClosureVES?: number;
  differenceUSD?: number;
  differenceVES?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CashBoxBreakdownLine {
  key: string;
  method: string;
  label: string;
  currency?: 'USD' | 'VES';
  bank?: string;
  accountId?: string;
  accountLabel?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  amountUSD: number;
  amountVES: number;
  count: number;
  note?: string;
}

export interface CashBoxReconciliationLine {
  key: string;
  method: string;
  label: string;
  currency: 'USD' | 'VES';
  bank?: string;
  accountId?: string;
  accountLabel?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  systemAmountUSD: number;
  systemAmountVES: number;
  declaredAmountUSD: number;
  declaredAmountVES: number;
  differenceUSD: number;
  differenceVES: number;
  count: number;
}

// Enhanced Audit Interfaces for Credit Sales and Partial Payments
export interface CashBoxPaymentAuditDetail {
  sourceId: string;
  saleId: string;
  saleCorrelativo: string;
  customerId: string;
  customerName: string;
  method: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  rateUsed: number;
  bank?: string;
  accountId?: string;
  accountLabel?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  reference?: string;
  note?: string;
  actor: string;
  createdAt: string;
  // Credit sale specific
  isCreditDownPayment: boolean;
  invoiceTotalUSD: number;
  invoiceTotalVES: number;
  remainingCreditUSD: number;
}

export interface BankMethodCurrencyBreakdown {
  bankId?: string;
  bankName: string;
  accountId?: string;
  accountLabel?: string;
  method: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  equivalentUSD: number; // For Bs, converted to USD using rateUsed
  transactionCount: number;
  transactions: CashBoxPaymentAuditDetail[];
}

export interface InventoryDispatchDetail {
  sku: string;
  description: string;
  qtyOut: number;
  unit: string;
  timestamp: string;
  batchId?: string;
  saleCorrelativo: string;
  customerName: string;
}

export interface AccountingImpactLine {
  accountType: 'CASH' | 'BANK' | 'CREDIT_AR';
  accountName: string;
  bankName?: string;
  accountLabel?: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  transactionCount: number;
}

export interface CashBoxEnhancedAudit {
  session: CashBoxSession;
  // Payments (actual cash received, not invoice totals)
  payments: CashBoxPaymentAuditDetail[];
  creditSales: {
    invoices: Array<{
      saleId: string;
      correlativo: string;
      customerName: string;
      totalUSD: number;
      totalVES: number;
      creditAmountUSD: number;
      downPaymentUSD: number;
      remainingUSD: number;
    }>;
    totalCreditIssuedUSD: number;
    totalDownPaymentsReceivedUSD: number;
  };
  // Bank -> Method -> Currency breakdown
  bankMethodBreakdown: BankMethodCurrencyBreakdown[];
  // Comparison table data
  reconciliationLines: CashBoxReconciliationLine[];
  // Inventory dispatch with units
  inventoryDispatch: InventoryDispatchDetail[];
  // Accounting/Banking impact
  accountingImpact: AccountingImpactLine[];
  // Totals
  totals: {
    cashReceivedUSD: number;
    cashReceivedVES: number;
    creditSalesUSD: number;
    creditSalesVES: number;
    totalTransactions: number;
    totalItemsSold: number;
  };
}

export interface CashBoxSaleAudit {
  id: string;
  saleId: string;
  cashBoxSessionId?: string;
  userId: string;
  userName: string;
  correlativo: string;
  customerId: string;
  customerName: string;
  items: BillingItem[];
  payments: any[];
  totalUSD: number;
  totalVES: number;
  nominalUSD?: number;
  exchangeRate?: number;
  paymentMethod: string;
  timestamp: string;
}

export interface CashBoxSessionSummary {
  session: CashBoxSession;
  sales: Array<{
    id: string;
    correlativo: string;
    customerName: string;
    totalUSD: number;
    totalVES: number;
    paymentMethod: string;
    timestamp: string;
  }>;
  inventoryMovements: Array<{
    sku: string;
    description: string;
    qtyOut: number;
    unit: string;
    timestamp: string;
    batchId?: string;
  }>;
  paymentDetails: SalePaymentRecord[];
  paymentMethodTotals: Array<{
    method: string;
    amountUSD: number;
    amountVES: number;
    count: number;
  }>;
  systemBreakdown: CashBoxBreakdownLine[];
  declaredBreakdown: CashBoxBreakdownLine[];
  reconciliationLines: CashBoxReconciliationLine[];
  totalSalesUSD: number;
  totalSalesVES: number;
  totalItemsSold: number;
  totalSystemUSD: number;
  totalSystemVES: number;
  totalDeclaredUSD: number;
  totalDeclaredVES: number;
  differenceUSD: number;
  differenceVES: number;
  denominationReport?: CashBoxDenominationReport;
}

export interface CashDenominationFlow {
  denom: number;
  receivedQty: number;
  receivedTotal: number;
  givenAsChangeQty: number;
  givenAsChangeTotal: number;
  netQty: number;
  netTotal: number;
}

export interface CashBoxDenominationReport {
  VES: CashDenominationFlow[];
  USD: CashDenominationFlow[];
  summary: {
    totalReceivedVES: number;
    totalReceivedUSD: number;
    totalGivenVES: number;
    totalGivenUSD: number;
    netVES: number;
    netUSD: number;
  };
}

export interface CashBoxClosureRecord {
  id: string;
  cashBoxSessionId: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt: string;
  exchangeRateBCV: number;
  exchangeRateParallel: number;
  exchangeRateInternal: number;
  declaredBreakdown: CashBoxBreakdownLine[];
  declaredTotalUSD: number;
  declaredTotalVES: number;
  systemBreakdown: CashBoxBreakdownLine[];
  systemTotalUSD: number;
  systemTotalVES: number;
  differenceUSD: number;
  differenceVES: number;
  operatorNote: string;
  salesSnapshot: CashBoxSessionSummary['sales'];
  inventorySnapshot: CashBoxSessionSummary['inventoryMovements'];
  paymentDetailsSnapshot: CashBoxSessionSummary['paymentDetails'];
  reconciliationLines: CashBoxReconciliationLine[];
  totalSalesUSD: number;
  totalSalesVES: number;
  totalItemsSold: number;
  createdAt: string;
  updatedAt: string;
}

export interface ARPaymentRecord {
  arId: string;
  customerId: string;
  customerName: string;
  saleCorrelativo: string;
  method: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  rateUsed: number;
  bank?: string;
  reference?: string;
  note: string;
  supports: ARPaymentSupport[];
  actor: string;
  createdAt: string;
}

export interface APPaymentRecord {
  apId: string;
  supplier: string;
  description: string;
  method: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  rateUsed: number;
  bank?: string;
  bankId?: string;
  accountId?: string;
  accountLabel?: string;
  reference?: string;
  note: string;
  supports: ARPaymentSupport[];
  actor: string;
  createdAt: string;
  storageProvider?: 'firebase' | 'supabase' | 'inline' | 'none';
  storageBucket?: string;
  supportsUploadError?: string;
}

export interface CashDenominationEntry {
  denom: number;
  qty: number;
}

export interface SalePaymentRecord {
  sourceId: string;
  saleId: string;
  cashBoxSessionId?: string;
  saleCorrelativo: string;
  customerId: string;
  customerName: string;
  method: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  rateUsed: number;
  bank?: string;
  accountId?: string;
  accountLabel?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  reference?: string;
  note?: string;
  supports: ARPaymentSupport[];
  cashDenominations?: CashDenominationEntry[];
  cashReceivedTotal?: number;
  cashChangeTotal?: number;
  cashChangeDenominations?: CashDenominationEntry[];
  cashChangeDenominationsCurrency?: 'USD' | 'VES';
  cashChangeGivenOverride?: number;
  actor: string;
  actorUserId?: string;
  createdAt: string;
}

export interface ProductPriceHistoryRecord {
  id: string;
  productCode: string;
  previousPrice: number;
  newPrice: number;
  changedAt: string;
  changedBy: string;
  note?: string;
}

export interface BankTransactionRecord {
  bankId?: string;
  bankName: string;
  accountId?: string;
  accountLabel?: string;
  method: string;
  source: 'AR_PAYMENT' | 'SALE_PAYMENT' | 'CREDIT_DOWN' | 'AP_PAYMENT' | 'PURCHASE_PAYMENT' | 'MANUAL_ENTRY' | 'SALE_RETURN';
  sourceId: string;
  cashBoxSessionId?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  arId: string;
  customerId: string;
  customerName: string;
  saleCorrelativo: string;
  currency: 'USD' | 'VES';
  amountUSD: number;
  amountVES: number;
  rateUsed: number;
  reference?: string;
  note?: string;
  supports?: ARPaymentSupport[];
  storageProvider?: 'firebase' | 'supabase' | 'inline' | 'none';
  storageBucket?: string;
  supportsUploadError?: string;
  purchaseInvoiceGroupId?: string;
  purchaseInvoiceNumber?: string;
  purchaseInvoiceDate?: string;
  purchaseInvoiceDueDate?: string;
  purchaseSupplierDocument?: string;
  purchaseWarehouse?: string;
  purchaseBatches?: string[];
  purchaseLineCount?: number;
  actor: string;
  actorUserId?: string;
  createdAt: string;
  reconciled?: boolean;
  reconciledAt?: string;
  reconciledBy?: string;
}

export interface AccountingAlert {
  id: string;
  saleId: string;
  correlativo: string;
  clientName: string;
  date: string;
  othersType: string;
  amountUSD: number;
  amountVES: number;
  note: string;
  label: string;
  description: string;
  severity: 'warning' | 'error';
  daysOverdue?: number;
  daysUntilDue?: number;
}

const ACCOUNTING_ALERT_META: Record<string, { label: string; description: string; severity: 'warning' | 'error' }> = {
  'CxP': {
    label: 'Cruce Ventas \u2194 Cuentas por Pagar',
    description: 'Se cobr\u00f3 una venta aplicando un cruce contra Cuentas por Pagar. Esto afecta el pasivo de la empresa. Requiere registro contable.',
    severity: 'error'
  },
  'CxC': {
    label: 'Cobro aplicado a Cuentas por Cobrar',
    description: 'Pago imputado como abono a una Cuenta por Cobrar existente. Verificar conciliaci\u00f3n en el m\u00f3dulo de cartera.',
    severity: 'warning'
  },
  'DxC': {
    label: 'Descuento / Devoluci\u00f3n por Cobrar',
    description: 'Se registr\u00f3 un descuento o devoluci\u00f3n contra una cuenta por cobrar. Verificar impacto en facturaci\u00f3n.',
    severity: 'warning'
  },
  'DxV': {
    label: 'Descuento / Devoluci\u00f3n en Ventas',
    description: 'Devoluci\u00f3n o descuento registrado directamente en la venta. Verificar nota de cr\u00e9dito correspondiente.',
    severity: 'warning'
  },
  'Ant. Cliente': {
    label: 'Anticipo de Cliente',
    description: 'Venta cobrada total o parcialmente con un anticipo de cliente. Verificar saldo del anticipo en finanzas.',
    severity: 'warning'
  },
  'Ant. Proveedores': {
    label: 'Anticipo de Proveedor aplicado a Venta',
    description: 'Se aplic\u00f3 un anticipo de proveedor como pago en una venta. Revise el impacto en Cuentas por Pagar con su contador.',
    severity: 'error'
  }
};

export class DataService {
  private products: ProductStock[] = [];
  private allProducts: ProductStock[] = [];
  /** Libro de movimientos (tabla `movements` en Supabase) */
  private movements: InventoryMovement[] = [];
  /**
   * Movimientos de inventario detallados (tabla `inventory_movements`), p. ej. devolución de venta (SALE_RETURN).
   * Se fusionan en getMovements() con `movements` para Kardex; el panel de auditoría usa solo `movements`.
   */
  private inventoryLedgerMovements: InventoryMovement[] = [];
  private sales: SaleHistoryEntry[] = [];
  private auditLog: AuditEntry[] = [];
  private expenses: OperationalExpense[] = [];
  private apEntries: APEntry[] = [];
  private arEntries: AREntry[] = [];
  private arUnsubscribe: (() => void) | null = null;
  private creditNotes: any[] = [];
  private creditNotesUnsubscribe: (() => void) | null = null;
  private clientAdvances: ClientAdvance[] = [];
  private clientAdvancesUnsubscribe: (() => void) | null = null;
  private currentSessionSales: CashBoxSaleAudit[] = [];
  private currentSessionSalesUnsubscribe: (() => void) | null = null;
  private supabaseSubscribed: boolean = false;
  private usersRealtimeChannel: any = null;
  private banks: BankEntity[] = [];
  private banksUnsubscribe: (() => void) | null = null;
  private cashBoxSessions: CashBoxSession[] = [];
  private cashBoxSessionsUnsubscribe: (() => void) | null = null;
  private currentSession: CashBoxSession | null = null;
  private posTerminals: POSTerminal[] = [];
  private posTerminalsUnsubscribe: (() => void) | null = null;
  private users: User[] = [];
  private nextCorrelativo: number = 1;
  private nextCreditCorrelativo: number = 1;
  private currentUser: User = {
    id: '',
    name: 'SISTEMA',
    role: 'CAJERO',
    pin: '',
    permissions: [],
    active: false
  };
  private listeners: (() => void)[] = [];
  private lastInitTime: number = 0;
  private readonly INIT_DEBOUNCE_MS = 2000; // Mínimo 2 segundos entre recargas completas
  private initPromise: Promise<void> | null = null;
  /** Evita doble envío en paralelo para la misma factura mientras dura el proceso de devolución. */
  private partialReturnSaleFlight = new Set<string>();

  constructor() {
    this.init();
  }

  private normalizePermissions(permissions: Array<string | PermissionKey> | undefined, role?: UserRole): PermissionKey[] {
    const allowed = new Set<PermissionKey>(PERMISSION_DEFINITIONS.map((entry) => entry.key));
    const fallback = this.getPermissionsForRole(role ?? 'CAJERO');
    const normalized = Array.from(new Set(
      (Array.isArray(permissions) ? permissions : fallback)
        .map((entry) => String(entry ?? '').trim().toUpperCase() as PermissionKey)
        .filter((entry): entry is PermissionKey => allowed.has(entry))
    ));
    if (normalized.includes('ALL')) return ['ALL'];
    return normalized.length > 0 ? normalized : fallback;
  }

  hasPermission(permission: PermissionKey, user: User | null = this.currentUser): boolean {
    if (!user) return false;
    const permissions = this.normalizePermissions(user.permissions, user.role);
    return permissions.includes('ALL') || permissions.includes(permission);
  }

  getPermissionDefinitions(): PermissionDefinition[] {
    return PERMISSION_DEFINITIONS;
  }

  async toggleBankTransactionReconciled(txId: string, currentValue: boolean): Promise<void> {
    const newValue = !currentValue;
    const actor = this.getCurrentUser()?.name ?? 'SISTEMA';
    await setDoc(doc(db, 'bank_transactions', txId), {
      reconciled: newValue,
      reconciledAt: newValue ? new Date().toISOString() : '',
      reconciledBy: newValue ? actor : ''
    } as any, { merge: true });
  }

  async addManualBankTransaction(input: { bankId: string; amountUSD: number; amountVES: number; method: string; reference?: string; description: string; }): Promise<void> {
    const bank = this.banks.find(b => String(b.id) === String(input.bankId));
    if (!bank) throw new Error('Banco no encontrado');
    const actor = this.getCurrentUser()?.name ?? 'SISTEMA';
    const tx: BankTransactionRecord = {
      bankId: String(bank.id),
      bankName: bank.name,
      method: input.method || 'MANUAL',
      source: 'MANUAL_ENTRY',
      sourceId: `MAN-${Date.now()}`,
      arId: '',
      customerId: '',
      customerName: input.description,
      saleCorrelativo: '',
      currency: 'USD',
      amountUSD: input.amountUSD,
      amountVES: input.amountVES,
      rateUsed: 1,
      reference: input.reference ?? '',
      note: input.description,
      actor,
      createdAt: new Date().toISOString(),
    };
    await this.appendBankTransaction(tx);
  }

  private async appendBankTransaction(tx: BankTransactionRecord): Promise<void> {
    const bankName = String(tx.bankName ?? '').trim();
    if (!bankName) return;
    if (bankName.toUpperCase() === 'OTRO') return;
    await addDoc(collection(db, 'bank_transactions'), tx as any);
  }

  private isMissingSupabaseColumn(error: any, table: string, column: string) {
    const message = String(error?.message ?? '').toLowerCase();
    return message.includes(`could not find the '${String(column).toLowerCase()}' column`) && message.includes(String(table).toLowerCase());
  }

  // Extract missing column name from Supabase PGRST204 error, if present
  private extractMissingColumnName(error: any): string | null {
    const message = String(error?.message ?? '');
    const match = message.match(/could not find the ['"`]?([a-zA-Z0-9_]+)['"`]?\s+column/i);
    return match ? match[1] : null;
  }

  private async insertWithColumnFallback(
    table: string,
    payload: Record<string, any>,
    options: { select?: boolean } = {}
  ) {
    const runInsert = async (p: Record<string, any>) => {
      const q = supabase.from(table).insert(p);
      return options.select ? await q.select().single() : await q;
    };

    let current: Record<string, any> = { ...payload };
    const droppedCols: string[] = [];
    // Retry up to N times, dropping one unknown column per attempt
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await runInsert(current);
      if (!res.error) return res;
      const missing = this.extractMissingColumnName(res.error);
      if (!missing || !Object.prototype.hasOwnProperty.call(current, missing)) {
        if (droppedCols.length > 0) {
          console.warn(`Supabase insert en '${table}' continuó fallando tras omitir columnas [${droppedCols.join(', ')}]:`, res.error?.message);
        }
        return res;
      }
      droppedCols.push(missing);
      console.warn(`Supabase: columna '${missing}' no existe en '${table}'. Reintentando sin ella.`);
      const next = { ...current };
      delete next[missing];
      current = next;
    }
    // Last resort: return the last attempt result
    return await runInsert(current);
  }

  private async insertSaleWithFallback(payload: Record<string, any>) {
    return await this.insertWithColumnFallback('sales', payload, { select: true });
  }

  /**
   * Guarda el detalle de líneas (jsonb) en public.sales.
   * Requiere columna `items` (jsonb). Si no existe, se registra advertencia.
   */
  private async persistSaleLineItemsToSupabase(saleId: string, items: BillingItem[]): Promise<void> {
    if (!saleId) return;
    const payload = { items: serializeSaleLineItemsForStorage(items) };
    const { error } = await supabase.from('sales').update(payload).eq('id', saleId);
    if (error) {
      const miss = this.extractMissingColumnName(error);
      if (String(miss).toLowerCase() === 'items') {
        console.warn(
          '[dataService] public.sales.items (jsonb) no existe. Ejecuta el SQL en Comandos Base de datos/Agregar columna items jsonb a sales.sql para devoluciones e historial.'
        );
        return;
      }
      console.warn('No se pudo persistir items de venta en Supabase:', error.message);
    }
  }

  private async insertMovementWithFallback(payload: Record<string, any>) {
    const initial = await supabase.from('movements').insert(payload);
    if (!initial.error) return initial;

    const errorMessage = String(initial.error?.message ?? '').toLowerCase();
    const missingOperator = Object.prototype.hasOwnProperty.call(payload, 'operator')
      && errorMessage.includes("could not find the 'operator' column")
      && errorMessage.includes('movements');

    if (missingOperator) {
      const fallbackPayload = { ...payload };
      delete (fallbackPayload as any).operator;
      const retry = await supabase.from('movements').insert(fallbackPayload);
      if (!retry.error) return retry;
    }

    // Generic fallback: drop any other missing column reported by Supabase
    return await this.insertWithColumnFallback('movements', payload);
  }

  private generateUniqueBatchNumber(sku: string): string {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0].replace(/-/g, ''); // YYYYMMDD
    const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, ''); // HHMMSS
    const randomSuffix = Math.random().toString(36).substring(2, 5).toUpperCase(); // 3 chars
    const skuSuffix = sku.substring(0, 3).padEnd(3, 'X'); // First 3 chars of SKU
    
    return `${skuSuffix}${dateStr}${timeStr}${randomSuffix}`;
  }

  private async insertInventoryBatchWithFallback(payload: Record<string, any>) {
    console.log('Insertando lote con payload:', payload);
    
    // MEJORA: Validar payload antes de insertar y ajustar para estructura real
    const requiredFields = ['product_code', 'quantity', 'cost_usd', 'expiry_date', 'purchase_date', 'warehouse'];
    const missingFields = requiredFields.filter(field => !payload[field]);
    if (missingFields.length > 0) {
      console.error('Campos requeridos faltantes:', missingFields);
      throw new Error(`ERROR: Faltan campos requeridos para crear el lote: ${missingFields.join(', ')}`);
    }
    
    // CORRECCIÓN: Eliminar campos que no existen en la tabla inventory_batches
    const adjustedPayload = { ...payload };
    delete adjustedPayload.batch;
    delete adjustedPayload.status;
    delete adjustedPayload.supplier;
    
    console.log('Payload ajustado (sin campos batch, status y supplier):', adjustedPayload);
    
    console.log('Payload validado, procediendo con inserción...');
    
    const initial = await supabase.from('inventory_batches').insert(adjustedPayload).select().single();
    
    console.log('Respuesta de Supabase:', { 
      data: initial.data, 
      error: initial.error, 
      status: initial.status 
    });
    
    if (!initial.error && initial.data) {
      console.log('Lote insertado exitosamente:', initial.data);
      return initial;
    }

    // MEJORA: Análisis detallado del error
    const errorMessage = String(initial.error?.message ?? '').toLowerCase();
    const errorCode = String(initial.error?.code ?? '').trim();
    const errorDetails = String(initial.error?.details ?? '').toLowerCase();
    
    console.error('Error inicial insertando lote:', { 
      error: initial.error, 
      errorCode, 
      errorMessage,
      errorDetails,
      payload: {
        product_code: payload.product_code,
        batch: payload.batch,
        warehouse: payload.warehouse,
        quantity: payload.quantity,
        cost_usd: payload.cost_usd
      }
    });
    
    // Error de duplicidad (unique constraint violation)
    if (errorCode === '23505' || errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
      console.error('ERROR DE UNICIDAD EN LOTE:', {
        payload: {
          product_code: payload.product_code,
          batch: payload.batch,
          warehouse: payload.warehouse
        },
        error: initial.error
      });
      throw new Error(`ERROR: El lote "${payload.batch}" ya existe para el producto "${payload.product_code}" en la base de datos. Este es un error de duplicidad que no debería ocurrir. Por favor, recargue la página e intente con un número de lote diferente.`);
    }
    
    // Error de columna faltante
    if (errorMessage.includes('column') && errorMessage.includes('does not exist')) {
      console.error('ERROR DE COLUMNA FALTANTE:', initial.error);
      throw new Error(`ERROR: La estructura de la base de datos ha cambiado. Contacte al administrador del sistema. Detalles: ${initial.error?.message}`);
    }
    
    // Error de conexión
    if (errorMessage.includes('connection') || errorMessage.includes('timeout') || errorMessage.includes('network')) {
      console.error('ERROR DE CONEXIÓN:', initial.error);
      throw new Error(`ERROR: Problema de conexión con la base de datos. Por favor, verifique su conexión a internet e intente nuevamente.`);
    }
    
    // Error de permisos
    if (errorMessage.includes('permission') || errorMessage.includes('unauthorized') || errorMessage.includes('forbidden')) {
      console.error('ERROR DE PERMISOS:', initial.error);
      throw new Error(`ERROR: No tiene permisos para realizar esta operación. Contacte al administrador del sistema.`);
    }
    
    // Error genérico con más detalles
    console.error('ERROR GENÉRICO DE INSERCIÓN:', initial.error);
    throw new Error(`ERROR: No se pudo insertar el lote "${payload.batch}" para el producto "${payload.product_code}". Error: ${initial.error?.message || 'Error desconocido'}. Código: ${errorCode || 'N/A'}. Por favor, recargue la página e intente nuevamente.`);
  }

  private resolvePaymentCurrency(method: string): 'USD' | 'VES' {
    const normalized = String(method ?? '').trim().toLowerCase();
    if (normalized === 'cash_usd' || normalized === 'zelle' || normalized === 'digital_usd') return 'USD';
    return 'VES';
  }

  // Resuelve el banco de "Efectivo" para un método en efectivo.
  // Busca primero por supportedMethods, luego por nombre (EFECTIVO + USD/$/BS/BOLIVAR/VES).
  // Si no existe banco configurado, devuelve estructura virtual para no perder el registro.
  private resolveCashBank(method: 'cash_usd' | 'cash_ves'): { bankId: string; bankName: string; accountId: string; accountLabel: string } {
    this.ensureBanksSubscription();
    const targetCurrency = method === 'cash_usd' ? 'USD' : 'VES';

    // 1) Buscar banco activo que soporte explícitamente este método
    let cashBank = this.banks.find(b => {
      if (b?.active === false) return false;
      const supports = Array.isArray(b?.supportedMethods) ? b.supportedMethods : [];
      return supports.includes(method);
    });
    // 2) Fallback: buscar por nombre "Efectivo USD/Bs"
    if (!cashBank) {
      cashBank = this.banks.find(b => {
        if (b?.active === false) return false;
        const nameUpper = String(b?.name ?? '').toUpperCase();
        if (!nameUpper.includes('EFECTIVO') && !nameUpper.includes('CAJA')) return false;
        if (method === 'cash_usd') return nameUpper.includes('USD') || nameUpper.includes('$') || nameUpper.includes('DOLAR');
        return nameUpper.includes('BS') || nameUpper.includes('BOLIVAR') || nameUpper.includes('VES');
      });
    }
    // 3) Fallback final: cualquier banco activo con cuenta de la moneda adecuada
    if (!cashBank) {
      cashBank = this.banks.find(b => {
        if (b?.active === false) return false;
        const accs = Array.isArray(b?.accounts) ? b.accounts : [];
        return accs.some((a: any) => String(a?.currency ?? '').toUpperCase() === targetCurrency);
      });
    }

    if (cashBank) {
      const accs = Array.isArray(cashBank.accounts) ? cashBank.accounts : [];
      const acc = accs.find((a: any) => String(a?.currency ?? '').toUpperCase() === targetCurrency) ?? accs[0];
      if (acc) {
        return {
          bankId: String(cashBank.id ?? ''),
          bankName: String(cashBank.name ?? ''),
          accountId: String(acc.id ?? ''),
          accountLabel: String(acc.label ?? 'Caja')
        };
      }
    }

    // Sin banco configurado: usar estructura virtual con IDs fijos para agrupar en reportes
    return {
      bankId: method === 'cash_usd' ? 'CASH_USD' : 'CASH_VES',
      bankName: method === 'cash_usd' ? 'Efectivo USD' : 'Efectivo Bs',
      accountId: method === 'cash_usd' ? 'CASH_USD_MAIN' : 'CASH_VES_MAIN',
      accountLabel: 'Caja Principal'
    };
  }

  private resolveBankAccountForMethod(input: {
    bankId?: string;
    bankName?: string;
    paymentMethod?: string;
    accountId?: string;
  }): { bankId: string; bankName: string; accountId: string; accountLabel: string } | null {
    this.ensureBanksSubscription();
    const bankId = String(input?.bankId ?? '').trim();
    const bankName = String(input?.bankName ?? '').trim();
    const paymentMethod = String(input?.paymentMethod ?? '').trim().toLowerCase();
    const requestedAccountId = String(input?.accountId ?? '').trim();
    const resolvedBank = bankId
      ? this.banks.find((b) => String(b.id ?? '').trim() === bankId)
      : this.banks.find((b) => String(b.name ?? '').trim().toUpperCase() === bankName.toUpperCase());
    if (!resolvedBank) return null;

    const supportedMethods = Array.isArray(resolvedBank.supportedMethods) ? resolvedBank.supportedMethods : [];
    if (paymentMethod && supportedMethods.length > 0 && !supportedMethods.includes(paymentMethod)) {
      throw new Error(`El banco ${resolvedBank.name} no está configurado para el método ${paymentMethod.toUpperCase()}.`);
    }

    const accounts = Array.isArray(resolvedBank.accounts) ? resolvedBank.accounts : [];
    const paymentCurrency = this.resolvePaymentCurrency(paymentMethod);
    const compatibleAccounts = accounts.filter((account) => String(account?.currency ?? 'VES').trim().toUpperCase() === paymentCurrency);
    const accountPool = compatibleAccounts.length > 0 ? compatibleAccounts : accounts;
    if (accountPool.length === 0) {
      throw new Error(`El banco ${resolvedBank.name} no tiene cuentas configuradas para registrar el pago.`);
    }

    const resolvedAccount = requestedAccountId
      ? accountPool.find((account) => String(account.id ?? '').trim() === requestedAccountId)
      : accountPool[0];
    if (!resolvedAccount) {
      throw new Error(`Debe seleccionar una cuenta válida del banco ${resolvedBank.name}.`);
    }

    return {
      bankId: String(resolvedBank.id ?? '').trim(),
      bankName: String(resolvedBank.name ?? '').trim(),
      accountId: String(resolvedAccount.id ?? '').trim(),
      accountLabel: String(resolvedAccount.label ?? '').trim()
    };
  }

  private async getAvailableBankBalance(input: {
    bankId?: string;
    accountId?: string;
    currency?: 'USD' | 'VES';
  }): Promise<number> {
    const bankId = String(input?.bankId ?? '').trim();
    const accountId = String(input?.accountId ?? '').trim();
    const currency = (input?.currency === 'VES' ? 'VES' : 'USD') as 'USD' | 'VES';
    if (!bankId) return 0;

    const constraints: any[] = [where('bankId', '==', bankId)];
    if (accountId) constraints.push(where('accountId', '==', accountId));

    const OUTFLOW_SOURCES = new Set(['AP_PAYMENT', 'PURCHASE_PAYMENT']);
    const snap = await getDocs(query(collection(db, 'bank_transactions'), ...constraints));
    return snap.docs.reduce((acc, d) => {
      const row: any = d.data() || {};
      const amount = Number(currency === 'VES' ? row?.amountVES ?? 0 : row?.amountUSD ?? 0);
      const sign = OUTFLOW_SOURCES.has(String(row?.source ?? '')) ? -1 : 1;
      return acc + sign * amount;
    }, 0);
  }

  getPOSTerminals() { this.ensurePOSTerminalsSubscription(); return this.posTerminals; }

  private ensurePOSTerminalsSubscription() {
    if (this.posTerminalsUnsubscribe) return;
    const q = query(collection(db, 'pos_terminals'), orderBy('name', 'asc'));
    this.posTerminalsUnsubscribe = onSnapshot(
      q,
      (snap) => {
        this.posTerminals = snap.docs.map(d => {
          const t: any = d.data();
          return {
            id: String(t.id ?? d.id),
            name: String(t.name ?? ''),
            serial: String(t.serial ?? '').trim(),
            merchantId: String(t.merchantId ?? '').trim(),
            bankId: String(t.bankId ?? '').trim(),
            bankName: String(t.bankName ?? '').trim(),
            accountId: String(t.accountId ?? '').trim(),
            accountLabel: String(t.accountLabel ?? '').trim(),
            accountNumber: String(t.accountNumber ?? '').trim(),
            supportedMethods: Array.isArray(t.supportedMethods) ? t.supportedMethods : ['debit', 'biopago'],
            active: t.active !== false,
            notes: String(t.notes ?? '').trim(),
            createdAt: String(t.createdAt ?? ''),
            updatedAt: String(t.updatedAt ?? '')
          } as POSTerminal;
        });
        this.notify();
      },
      (error) => console.error('Error cargando terminales POS:', error)
    );
  }

  private ensureCashBoxSessionsSubscription() {
    if (this.cashBoxSessionsUnsubscribe) return;
    const q = query(collection(db, 'cashbox_sessions'), orderBy('createdAt', 'desc'));
    this.cashBoxSessionsUnsubscribe = onSnapshot(
      q,
      (snap) => {
        this.cashBoxSessions = snap.docs.map(d => {
          const s: any = d.data();
          return {
            id: String(s.id ?? d.id),
            userId: String(s.userId ?? ''),
            userName: String(s.userName ?? ''),
            openDate: String(s.openDate ?? ''),
            openTime: String(s.openTime ?? ''),
            stationName: s.stationName ? String(s.stationName) : '',
            openRateBCV: Number(s.openRateBCV ?? 0),
            openRateParallel: Number(s.openRateParallel ?? 0),
            openRateInternal: Number(s.openRateInternal ?? 0),
            initialAmountUSD: Number(s.initialAmountUSD ?? 0),
            initialAmountVES: Number(s.initialAmountVES ?? 0),
            status: s.status as 'OPEN' | 'CLOSED',
            closeDate: String(s.closeDate ?? ''),
            closeTime: String(s.closeTime ?? ''),
            closeRateBCV: Number(s.closeRateBCV ?? 0),
            closeRateParallel: Number(s.closeRateParallel ?? 0),
            closeRateInternal: Number(s.closeRateInternal ?? 0),
            finalAmountUSD: Number(s.finalAmountUSD ?? 0),
            finalAmountVES: Number(s.finalAmountVES ?? 0),
            openingBreakdown: Array.isArray(s.openingBreakdown) ? s.openingBreakdown : [],
            closingDeclaredBreakdown: Array.isArray(s.closingDeclaredBreakdown) ? s.closingDeclaredBreakdown : [],
            closingNote: String(s.closingNote ?? ''),
            systemClosureUSD: Number(s.systemClosureUSD ?? 0),
            systemClosureVES: Number(s.systemClosureVES ?? 0),
            differenceUSD: Number(s.differenceUSD ?? 0),
            differenceVES: Number(s.differenceVES ?? 0),
            createdAt: String(s.createdAt ?? ''),
            updatedAt: String(s.updatedAt ?? '')
          } as CashBoxSession;
        });
        // Update current session if needed
        const openSession = this.cashBoxSessions.find(s => s.status === 'OPEN' && s.userId === this.currentUser.id);
        this.currentSession = openSession || null;
        this.notify();
      },
      (error) => console.error('Error cargando sesiones de caja:', error)
    );
  }

  async upsertPOSTerminal(input: {
    id?: string;
    name: string;
    serial?: string;
    merchantId?: string;
    bankId: string;
    accountId: string;
    supportedMethods?: string[];
    active?: boolean;
    notes?: string;
  }): Promise<string> {
    this.ensureBanksSubscription();
    this.ensurePOSTerminalsSubscription();
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('Nombre de terminal POS requerido.');

    const bankId = String(input.bankId ?? '').trim();
    const accountId = String(input.accountId ?? '').trim();
    if (!bankId) throw new Error('Banco requerido para la terminal POS.');
    if (!accountId) throw new Error('Cuenta requerida para la terminal POS.');

    const bank = this.banks.find(b => String(b.id ?? '').trim() === bankId);
    if (!bank) throw new Error('Banco no encontrado para la terminal POS.');
    const account = (bank.accounts || []).find(a => String(a.id ?? '').trim() === accountId);
    if (!account) throw new Error('Cuenta no encontrada para la terminal POS.');

    const normalized = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    const id = String(input.id ?? `POS_${normalized}`);
    const now = new Date().toISOString();
    const serial = String(input.serial ?? '').trim().toUpperCase();
    const merchantId = String(input.merchantId ?? '').trim();

    const duplicateSerial = this.posTerminals.find(t => t.id !== id && serial && String(t.serial ?? '').trim().toUpperCase() === serial);
    if (duplicateSerial) throw new Error(`Ya existe una terminal POS con ese serial: ${duplicateSerial.name}`);

    const duplicateName = this.posTerminals.find(t => t.id !== id && String(t.name ?? '').trim().toUpperCase() === name.toUpperCase());
    if (duplicateName) throw new Error(`Ya existe una terminal POS con ese nombre: ${duplicateName.name}`);

    const terminal: POSTerminal = {
      id,
      name,
      serial,
      merchantId,
      bankId,
      bankName: String(bank.name ?? '').trim(),
      accountId,
      accountLabel: String(account.label ?? '').trim(),
      accountNumber: String(account.accountNumber ?? '').trim(),
      supportedMethods: Array.isArray(input.supportedMethods) && input.supportedMethods.length > 0 ? input.supportedMethods : ['debit', 'biopago'],
      active: input.active !== false,
      notes: String(input.notes ?? '').trim(),
      createdAt: now,
      updatedAt: now
    };

    const existing = this.posTerminals.find(t => t.id === id);
    await setDoc(doc(db, 'pos_terminals', id), {
      ...terminal,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    } as any, { merge: true });

    return id;
  }

  async deletePOSTerminal(id: string): Promise<void> {
    this.ensurePOSTerminalsSubscription();
    const terminalId = String(id || '').trim();
    if (!terminalId) return;
    await deleteDoc(doc(db, 'pos_terminals', terminalId));
  }

  private async uploadSupportFiles(basePath: string, files?: File[]): Promise<{
    supports: ARPaymentSupport[];
    storageProvider: 'firebase' | 'supabase' | 'inline' | 'none';
    storageBucket?: string;
    supportsUploadError?: string;
  }> {
    const list = Array.from(files || []).filter(Boolean);
    const supports: ARPaymentSupport[] = [];
    if (list.length === 0) {
      return { supports, storageProvider: 'none' };
    }

    const supabaseBucket = ((import.meta as any).env?.VITE_SUPABASE_SUPPORTS_BUCKET ?? 'supports') as string;

    const uploadWithFirebase = async () => {
      for (const f of list) {
        const safeName = (f.name || 'support').replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${basePath}/${safeName}`;
        const storageRef = ref(storage, path);
        const uploadTimeoutMs = 30000;
        await Promise.race([
          uploadBytes(storageRef, f),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout subiendo soporte a Firebase Storage.')), uploadTimeoutMs))
        ]);
        const url = await Promise.race([
          getDownloadURL(storageRef),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout obteniendo URL de soporte (Firebase).')), uploadTimeoutMs))
        ]) as string;
        supports.push({
          name: f.name,
          url,
          path,
          contentType: f.type || 'application/octet-stream',
          size: f.size,
          provider: 'firebase'
        });
      }
    };

    const uploadWithSupabase = async () => {
      console.log('🗂️ Iniciando upload a Supabase con', list.length, 'archivos');
      console.log('🗂️ Bucket:', supabaseBucket);

      for (const f of list) {
        console.log('🗂️ Procesando archivo:', f.name, 'tamaño:', f.size, 'tipo:', f.type);
        const safeName = (f.name || 'support').replace(/[^a-zA-Z0-9._-]/g, '_');
        const objectPath = `${basePath}/${Date.now()}_${safeName}`;

        console.log('🗂️ Ruta en Supabase:', objectPath);

        try {
          const { error, data } = await supabase.storage
            .from(supabaseBucket)
            .upload(objectPath, f, {
              upsert: true,
              contentType: f.type || 'application/octet-stream'
            });

          if (error) {
            console.error('🗂️ Error Supabase upload:', error);
            throw new Error(error.message);
          }

          console.log('🗂️ Upload exitoso, data:', data);

          const { data: urlData } = supabase.storage.from(supabaseBucket).getPublicUrl(objectPath);
          const url = urlData?.publicUrl || '';

          console.log('🗂️ URL pública:', url);

          supports.push({
            name: f.name,
            url,
            path: objectPath,
            contentType: f.type || 'application/octet-stream',
            size: f.size,
            provider: 'supabase',
            bucket: supabaseBucket
          });

          console.log('🗂️ Soporte agregado a la lista');
        } catch (err) {
          console.error('🗂️ Error procesando archivo', f.name, ':', err);
          throw err;
        }
      }

      console.log('🗂️ Upload a Supabase completado, supports:', supports.length);
    };

    try {
      console.log('🗂️ Intentando upload con Supabase primero...');
      await uploadWithSupabase();
      console.log('🗂️ Supabase upload exitoso');
      return {
        supports,
        storageProvider: 'supabase',
        storageBucket: supabaseBucket,
        supportsUploadError: ''
      };
    } catch (eSupabase: any) {
      console.error('🗂️ Supabase upload fallido:', eSupabase);
      supports.length = 0;
      try {
        console.log('🗂️ Intentando upload con Firebase como fallback...');
        await uploadWithFirebase();
        console.log('🗂️ Firebase upload exitoso');
        return {
          supports,
          storageProvider: 'firebase',
          storageBucket: '',
          supportsUploadError: String(eSupabase?.message || 'Supabase Storage no disponible, se usó Firebase.')
        };
      } catch (eFirebase: any) {
        console.error('🗂️ Firebase upload fallido:', eFirebase);
        const msgSupabase = eSupabase?.message ? String(eSupabase.message) : 'Error subiendo soporte a Supabase Storage.';
        const msgFirebase = eFirebase?.message ? String(eFirebase.message) : 'Error subiendo soporte a Firebase Storage.';
        console.error('🗂️ Ambos uploads fallaron - Supabase:', msgSupabase, 'Firebase:', msgFirebase);
        const inlineSupports = await this.buildInlineSupports(list);
        if (inlineSupports.length > 0) {
          console.log('🗂️ Usando fallback inline para soportes:', inlineSupports.length);
          return {
            supports: inlineSupports,
            storageProvider: 'inline',
            storageBucket: '',
            supportsUploadError: ''
          };
        }
        return {
          supports,
          storageProvider: 'none',
          storageBucket: supabaseBucket,
          supportsUploadError: `Supabase: ${msgSupabase} | Firebase: ${msgFirebase}`
        };
      }
    }
  }

  private async fileToDataUrl(file: File): Promise<string> {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('No se pudo leer el soporte.'));
      reader.readAsDataURL(file);
    });
  }

  private async buildInlineSupports(files?: File[]): Promise<ARPaymentSupport[]> {
    const list = Array.from(files || []).filter(Boolean).slice(0, 2);
    const supports: ARPaymentSupport[] = [];
    for (const f of list) {
      if (Number(f.size || 0) > 700000) continue;
      const dataUrl = await this.fileToDataUrl(f);
      if (!dataUrl) continue;
      supports.push({
        name: f.name,
        url: dataUrl,
        path: `inline:${f.name}`,
        contentType: f.type || 'application/octet-stream',
        size: f.size,
        provider: 'inline'
      });
    }
    return supports;
  }

  private async persistSalePayments(sale: Omit<SaleHistoryEntry, 'timestamp'>, saleId: string, payments: any[]): Promise<void> {
    for (const p of payments) {
      const method = String(p?.method ?? '').trim();
      if (!method || method === 'credit') continue;
      const sourceId = `${saleId}:${String(p?.id ?? method)}`;
      const isBsMethod = method === 'cash_ves' || method === 'transfer' || method === 'mobile' || method === 'debit' || method === 'biopago';

      // CASH AUTO-ROUTING: para cash_usd / cash_ves, resolver siempre el banco "Efectivo"
      // aunque el formulario no lo haya asignado, para que sale_payments refleje correctamente
      // el banco en el breakdown del cierre de caja.
      let paymentBank = String(p?.bank ?? '').trim();
      let paymentAccountId = String(p?.bankAccountId ?? '').trim();
      let paymentAccountLabel = String(p?.bankAccountLabel ?? '').trim();
      const isCashMethodForPersist = method === 'cash_usd' || method === 'cash_ves';
      if (isCashMethodForPersist && !paymentBank) {
        try {
          const cashResolution = this.resolveCashBank(method as 'cash_usd' | 'cash_ves');
          if (cashResolution) {
            paymentBank = cashResolution.bankName;
            if (!paymentAccountId) paymentAccountId = cashResolution.accountId;
            if (!paymentAccountLabel) paymentAccountLabel = cashResolution.accountLabel;
          }
        } catch (e) {
          console.warn('persistSalePayments: no se pudo resolver banco de efectivo:', e);
        }
      }

      const payload: SalePaymentRecord = {
        sourceId,
        saleId,
        cashBoxSessionId: this.currentSession?.status === 'OPEN' ? this.currentSession.id : '',
        saleCorrelativo: sale.correlativo,
        customerId: sale.client.id,
        customerName: sale.client.name,
        method,
        currency: isBsMethod ? 'VES' : 'USD',
        amountUSD: Number(p?.amountUSD ?? 0) || 0,
        amountVES: Number(p?.amountVES ?? 0) || 0,
        rateUsed: Number(p?.rateUsed ?? 0) || 0,
        bank: paymentBank,
        accountId: paymentAccountId,
        accountLabel: paymentAccountLabel,
        posTerminalId: String(p?.posTerminalId ?? '').trim(),
        posTerminalName: String(p?.posTerminalName ?? '').trim(),
        reference: String(p?.reference ?? '').trim(),
        note: String(p?.note ?? '').trim(),
        supports: Array.isArray(p?.supports) ? p.supports : [],
        actor: this.currentUser?.name ?? '',
        actorUserId: this.currentUser?.id ?? '',
        createdAt: new Date().toISOString()
      };
      // Agregar campos opcionales de denominaciones solo si existen (Firestore rechaza undefined)
      const hasDenoms = Array.isArray(p?.cashDenominations) && p.cashDenominations.length > 0;
      if (hasDenoms) {
        const denomTotal = p.cashDenominations.reduce((s: number, b: any) => s + (Number(b.denom) * Number(b.qty)), 0);
        (payload as any).cashDenominations = p.cashDenominations;
        (payload as any).cashReceivedTotal = denomTotal;
        (payload as any).cashChangeTotal = Math.max(0, denomTotal - (Number(p?.amountUSD ?? 0) || Number(p?.amountVES ?? 0) || 0));
      }
      // Agregar campos de vuelto declarado solo si existen
      if (p?.cashChangeGiven !== undefined) (payload as any).cashChangeGiven = p.cashChangeGiven;
      if (p?.cashChangeMethod) (payload as any).cashChangeMethod = p.cashChangeMethod;
      if (p?.cashChangeBank) (payload as any).cashChangeBank = p.cashChangeBank;
      if (p?.cashChangeRate !== undefined) (payload as any).cashChangeRate = p.cashChangeRate;

      // Denominaciones entregadas como vuelto (nuevo flujo). Si el cajero declaró
      // qué billetes salieron, se persiste el arreglo y el total real entregado
      // queda sincronizado con la suma de denominaciones.
      const hasChangeDenoms = Array.isArray(p?.cashChangeDenominations) && p.cashChangeDenominations.length > 0;
      if (hasChangeDenoms) {
        const changeDenomTotal = p.cashChangeDenominations.reduce(
          (s: number, b: any) => s + (Number(b.denom) * Number(b.qty)),
          0
        );
        (payload as any).cashChangeDenominations = p.cashChangeDenominations;
        (payload as any).cashChangeTotal = changeDenomTotal;
        if (p?.cashChangeDenominationsCurrency) {
          (payload as any).cashChangeDenominationsCurrency = p.cashChangeDenominationsCurrency;
        }
      }
      // Override manual del total de vuelto (cuando el cliente se llevó menos
      // del auto-calculado, por ejemplo propina o vuelto parcial).
      if (p?.cashChangeGivenOverride !== undefined) {
        (payload as any).cashChangeGivenOverride = Number(p.cashChangeGivenOverride) || 0;
      }
      // Filtrar cualquier undefined restante antes de enviar a Firestore
      const cleanPayload = Object.fromEntries(Object.entries(payload as any).filter(([, v]) => v !== undefined));
      await setDoc(doc(db, 'sale_payments', sourceId), cleanPayload, { merge: true });

      // Cruzar con CxP (Cuentas por Pagar) si el método es Others y el banco es CxP
      if (method === 'others' && (String(p?.bank ?? '').trim().toUpperCase() === 'CXP' || String(p?.note ?? '').trim().toUpperCase().includes('CXP'))) {
        await this.applyAPOffsetBySale(sale.client.name, payload.amountUSD, sale.correlativo, sale.client.id);
      }
    }
  }

  private async normalizeSalePayments(payments: any[]): Promise<any[]> {
    const list = Array.isArray(payments) ? payments : [];
    const normalized: any[] = [];
    for (const p of list) {
      normalized.push({
        ...p,
        id: String(p?.id ?? Math.random().toString(36).substr(2, 9)),
        supports: Array.isArray(p?.supports) && p.supports.length > 0
          ? p.supports
          : await this.buildInlineSupports(Array.isArray(p?.files) ? p.files : [])
      });
    }
    return normalized;
  }

  private async syncSalePaymentSupportsAsync(sale: Omit<SaleHistoryEntry, 'timestamp'>, saleId: string, payments: any[]): Promise<void> {
    const list = Array.isArray(payments) ? payments : [];
    for (const p of list) {
      const method = String(p?.method ?? '').trim();
      if (!method || method === 'credit') continue;
      const sourceId = `${saleId}:${String(p?.id ?? method)}`;
      const upload = await this.uploadSupportFiles(`sale_payments/${saleId}/${String(p?.id ?? method)}`, Array.isArray(p?.files) ? p.files : []);
      const supportsToPersist = Array.isArray(upload.supports) && upload.supports.length > 0
        ? upload.supports
        : (Array.isArray(p?.supports) ? p.supports : []);

      await setDoc(doc(db, 'sale_payments', sourceId), {
        supports: supportsToPersist,
        supportsUploadError: upload.supportsUploadError ?? '',
        storageProvider: upload.storageProvider,
        storageBucket: upload.storageBucket ?? ''
      } as any, { merge: true });

      const q = query(collection(db, 'bank_transactions'), where('sourceId', '==', sourceId));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        await updateDoc(d.ref, {
          supports: supportsToPersist,
          supportsUploadError: upload.supportsUploadError ?? '',
          storageProvider: upload.storageProvider,
          storageBucket: upload.storageBucket ?? ''
        } as any);
      }

      const saleInMemory = this.sales.find(s => String(s.id ?? '') === String(saleId));
      if (saleInMemory && Array.isArray((saleInMemory as any).payments)) {
        (saleInMemory as any).payments = (saleInMemory as any).payments.map((entry: any) =>
          String(entry?.id ?? '') === String(p?.id ?? '')
            ? {
              ...entry,
              supports: supportsToPersist,
              supportsUploadError: upload.supportsUploadError,
              storageProvider: upload.storageProvider,
              storageBucket: upload.storageBucket
            }
            : entry
        );
      }
      this.notify();
    }
  }

  async getSalePayments(saleId: string): Promise<any[]> {
    const id = String(saleId ?? '').trim();
    if (!id) return [];
    const snap = await getDocs(query(collection(db, 'sale_payments'), where('saleId', '==', id)));
    return snap.docs.map(d => ({ sourceId: d.id, ...d.data() }));
  }

  async getSalePaymentSupports(sourceId: string): Promise<ARPaymentSupport[]> {
    const id = String(sourceId ?? '').trim();
    if (!id) return [];
    const snap = await getDoc(doc(db, 'sale_payments', id));
    if (!snap.exists()) return [];
    const data: any = snap.data() || {};
    return Array.isArray(data.supports) ? data.supports : [];
  }

  private async getPurchaseEntriesByInvoiceGroupId(sourceId: string): Promise<any[]> {
    const id = String(sourceId ?? '').trim();
    if (!id) return [];
    const snap = await getDocs(query(collection(db, 'purchase_entries'), where('invoiceGroupId', '==', id)));
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a: any, b: any) => Number(a?.lineNumber ?? 0) - Number(b?.lineNumber ?? 0));
  }

  private dedupeSupports(list: any[]): ARPaymentSupport[] {
    const seen = new Set<string>();
    const supports: ARPaymentSupport[] = [];
    for (const item of Array.isArray(list) ? list : []) {
      if (!item) continue;
      const key = `${String(item?.url ?? '')}__${String(item?.path ?? '')}__${String(item?.name ?? '')}`;
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      supports.push(item as ARPaymentSupport);
    }
    return supports;
  }

  private buildPurchaseTraceMetadata(rows: any[]) {
    const list = Array.isArray(rows) ? rows : [];
    const first = list[0] ?? null;
    const supports = this.dedupeSupports(list.flatMap((row: any) => Array.isArray(row?.supports) ? row.supports : []));
    const warehouses = Array.from(new Set(list.map((row: any) => String(row?.warehouse ?? '').trim()).filter(Boolean)));
    const batches = Array.from(new Set(list.map((row: any) => String(row?.batch ?? '').trim()).filter(Boolean)));
    return {
      invoiceGroupId: String(first?.invoiceGroupId ?? ''),
      invoiceNumber: String(first?.invoiceNumber ?? ''),
      invoiceDate: String(first?.invoiceDate ?? ''),
      invoiceDueDate: String(first?.invoiceDueDate ?? ''),
      supplier: String(first?.supplier ?? ''),
      supplierDocument: String(first?.supplierDocument ?? ''),
      warehouse: warehouses.join(' • '),
      batches,
      linesCount: list.length,
      supports
    };
  }

  async getPurchasePaymentSupports(sourceId: string): Promise<ARPaymentSupport[]> {
    const rows = await this.getPurchaseEntriesByInvoiceGroupId(sourceId);
    return this.buildPurchaseTraceMetadata(rows).supports;
  }

  async getBankTransactionSupports(input: { source?: string; sourceId?: string }): Promise<ARPaymentSupport[]> {
    const source = String(input?.source ?? '').trim().toUpperCase();
    const sourceId = String(input?.sourceId ?? '').trim();
    if (!sourceId) return [];
    if (source === 'PURCHASE_PAYMENT') {
      return await this.getPurchasePaymentSupports(sourceId);
    }
    return await this.getSalePaymentSupports(sourceId);
  }

  private async appendSaleBankTransactions(sale: Omit<SaleHistoryEntry, 'timestamp'>, saleId: string, payments: any[]): Promise<void> {
    for (const p of payments) {
      const method = String(p?.method ?? '').trim();
      if (!method || method === 'credit') continue;
      // Skip "Ant. Cliente" payments - handled as advance application, not bank deposit
      const bankName = String(p?.bank ?? '').trim();
      if (bankName === 'Ant. Cliente') continue;
      // Skip CxP cross payments - handled in CxP offset, not bank deposit
      if (bankName.toUpperCase() === 'CXP' || String(p?.note ?? '').toUpperCase().includes('CXP')) continue;
      if (bankName.toUpperCase() === 'OTRO') continue;

      // CASH AUTO-ROUTING: Para cash_usd / cash_ves, SIEMPRE intentar rutear al banco "Efectivo"
      // Ignora cualquier bankName residual del formulario que no corresponda a efectivo
      let bankResolution: { bankId: string; bankName: string; accountId: string; accountLabel: string } | null = null;
      const isCashMethod = method === 'cash_usd' || method === 'cash_ves';
      if (isCashMethod) {
        bankResolution = this.resolveCashBank(method as 'cash_usd' | 'cash_ves');
      } else {
        if (!bankName) continue; // método no-efectivo sin banco → no registrar
        bankResolution = this.resolveBankAccountForMethod({
          bankId: String(p?.bankId ?? '').trim(),
          bankName,
          paymentMethod: method,
          accountId: String(p?.bankAccountId ?? '').trim()
        });
      }
      if (!bankResolution) {
        console.warn(`No se pudo resolver cuenta bancaria para venta ${sale.correlativo} con banco ${bankName} y método ${method}`);
        continue;
      }

      const isBsMethod = method === 'cash_ves' || method === 'transfer' || method === 'mobile' || method === 'debit' || method === 'biopago';
      const tx: BankTransactionRecord = {
        bankId: bankResolution.bankId,
        bankName: bankResolution.bankName,
        accountId: bankResolution.accountId,
        accountLabel: bankResolution.accountLabel,
        method,
        source: (sale.paymentMethod === 'CREDIT' || sale.paymentMethod === 'CRÉDITO') ? 'CREDIT_DOWN' : 'SALE_PAYMENT',
        sourceId: `${saleId}:${String(p?.id ?? method)}`,
        cashBoxSessionId: this.currentSession?.status === 'OPEN' ? this.currentSession.id : '',
        posTerminalId: String(p?.posTerminalId ?? '').trim(),
        posTerminalName: String(p?.posTerminalName ?? '').trim(),
        arId: '',
        customerId: sale.client.id,
        customerName: sale.client.name,
        saleCorrelativo: sale.correlativo,
        currency: isBsMethod ? 'VES' : 'USD',
        amountUSD: Number(p?.amountUSD ?? 0) || 0,
        amountVES: Number(p?.amountVES ?? 0) || 0,
        rateUsed: Number(p?.rateUsed ?? 0) || 0,
        reference: String(p?.reference ?? '').trim(),
        note: String(p?.note ?? '').trim(),
        supports: Array.isArray(p?.supports) ? p.supports : [],
        actor: this.currentUser?.name ?? '',
        actorUserId: this.currentUser?.id ?? '',
        createdAt: new Date().toISOString()
      };
      await this.appendBankTransaction(tx);
    }
  }

  private async persistCashBoxSaleAudit(sale: SaleHistoryEntry): Promise<void> {
    const sanitizeFirestoreValue = (value: any): any => {
      if (value === undefined) return null;
      if (value === null) return null;
      if (value instanceof Date) return value.toISOString();
      if (Array.isArray(value)) {
        return value.map((entry) => sanitizeFirestoreValue(entry));
      }
      if (typeof value === 'object') {
        return Object.fromEntries(
          Object.entries(value)
            .filter(([_, entry]) => entry !== undefined)
            .map(([key, entry]) => [key, sanitizeFirestoreValue(entry)])
        );
      }
      return value;
    };

    const payload: CashBoxSaleAudit = {
      id: String(sale.id ?? ''),
      saleId: String(sale.id ?? ''),
      cashBoxSessionId: this.currentSession?.status === 'OPEN' ? this.currentSession.id : '',
      userId: this.currentUser?.id ?? '',
      userName: this.currentUser?.name ?? '',
      correlativo: String(sale.correlativo ?? ''),
      customerId: String(sale.client?.id ?? ''),
      customerName: String(sale.client?.name ?? ''),
      items: sanitizeFirestoreValue(Array.isArray(sale.items) ? sale.items : []),
      payments: sanitizeFirestoreValue(Array.isArray((sale as any).payments) ? (sale as any).payments : []),
      totalUSD: Number(sale.totalUSD ?? 0) || 0,
      totalVES: Number(sale.totalVES ?? 0) || 0,
      nominalUSD: Number((sale as any).nominalUSD ?? sale.totalUSD ?? 0) || 0,
      exchangeRate: Number(sale.exchangeRate ?? 0) || 0,
      paymentMethod: String(sale.paymentMethod ?? ''),
      timestamp: sale.timestamp instanceof Date ? sale.timestamp.toISOString() : new Date().toISOString()
    };
    await setDoc(doc(db, 'cashbox_sales', String(sale.id ?? Math.random().toString(36).substr(2, 9))), sanitizeFirestoreValue(payload) as any, { merge: true });
  }

  private async buildNextProductCode(reservedCodes: Set<string> = new Set()) {
    // Usar primer hueco disponible (consistente con getNextProductCode)
    const { data: allProducts } = await supabase
      .from('products')
      .select('code')
      .like('code', 'P-%');
    
    const occupiedNums = new Set(
      (allProducts || [])
        .map(p => String(p.code ?? '').trim().toUpperCase())
        .filter(code => /^P-\d+$/.test(code))
        .map(code => parseInt(code.replace('P-', '')))
    );
    
    // Agregar reservedCodes al set de ocupados
    for (const rc of reservedCodes) {
      const match = String(rc).trim().toUpperCase().match(/^P-(\d+)$/);
      if (match) occupiedNums.add(parseInt(match[1]));
    }

    // Primer número disponible desde 1 (respeta huecos)
    let nextNum = 1;
    while (occupiedNums.has(nextNum)) nextNum++;
    return `P-${String(nextNum).padStart(4, '0')}`;
  }

  private isProductCodeDuplicateError(error: any) {
    const code = String(error?.code ?? '').trim();
    const message = String(error?.message ?? '').toLowerCase();
    return code === '23505' || message.includes('products_pkey') || message.includes('duplicate key value');
  }

  private normalizePurchaseUnit(unit: string, fallback: string = 'UN') {
    const normalized = String(unit ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, ' ');

    if (!normalized) return fallback;
    if (['KG', 'KILO', 'KILOS'].includes(normalized)) return 'KG';
    if (['LT', 'LITRO', 'LITROS'].includes(normalized)) return 'LT';
    if (['SACO', 'SACOS', 'ZACO', 'ZACOS'].includes(normalized)) return 'SACO';
    if (['BULTO', 'BULTOS'].includes(normalized)) return 'BULTO';
    if (['TOBO', 'TOBOS'].includes(normalized)) return 'TOBO';
    if (['UN', 'UND', 'UNIDAD', 'UNIDADES'].includes(normalized)) return 'UN';
    return normalized;
  }

  private buildProductPrices(priceUSD: number) {
    const p1 = roundPriceValue(Math.max(0, Number(priceUSD) || 0));
    return [
      p1,
      roundPercentPrice(p1, 0.95),
      roundPercentPrice(p1, 0.90),
      roundPercentPrice(p1, 0.85),
      roundPercentPrice(p1, 0.80)
    ];
  }

  private calculateSalePriceFromCost(costUSD: number) {
    return roundPriceValue((Number(costUSD) || 0) * 1.3);
  }

  private async syncProductCommercialTerms(product: ProductStock, input: { unit: string; salePriceUSD: number; }) {
    const unit = this.normalizePurchaseUnit(input.unit || product.unit || 'UN', product.unit || 'UN');
    const priceUSD = roundPriceValue(input.salePriceUSD);
    const prices = this.buildProductPrices(priceUSD);

    const { error } = await supabase
      .from('products')
      .update({
        unit,
        price_usd: priceUSD,
        conversion_ratio: 1,
        base_unit: unit
      })
      .eq('code', product.code);

    if (error) {
      throw new Error(String(error?.message ?? `No se pudo actualizar el precio de venta para ${product.code}.`));
    }

    const updatedProduct: ProductStock = {
      ...product,
      unit,
      baseUnit: unit,
      conversionRatio: 1,
      priceUSD,
      prices
    };

    this.products = this.products.map((item) => item.code === updatedProduct.code ? { ...item, ...updatedProduct } : item);
    return updatedProduct;
  }

  // MEJORA: Función para pre-generar códigos sin crear productos
  async preGenerateProductCodes(newProducts: CreateProductInput[]): Promise<Map<string, string>> {
    const codeMap = new Map<string, string>();
    
    console.log('Pre-generando códigos para', newProducts.length, 'productos nuevos');
    
    // Consultar BD UNA SOLA VEZ — evita que múltiples productos nuevos en la misma
    // factura reciban el mismo código (el loop anterior releia BD antes de insertar)
    const { data: existingProducts, error } = await supabase
      .from('products')
      .select('code')
      .like('code', 'P-%');
    
    if (error) throw new Error(`No se pudieron consultar los códigos existentes: ${error.message}`);
    
    // Set de números ocupados: BD + los que reservemos en este lote
    const occupiedNums = new Set(
      (existingProducts || [])
        .map(p => String(p.code ?? '').trim().toUpperCase())
        .filter(code => /^P-\d+$/.test(code))
        .map(code => parseInt(code.replace('P-', '')))
    );
    
    for (let i = 0; i < newProducts.length; i++) {
      const product = newProducts[i];
      const productKey = `${product.description}_${product.unit}_${i}`;
      
      // Primer número libre (respeta huecos y reservas previas de este mismo lote)
      let nextNum = 1;
      while (occupiedNums.has(nextNum)) nextNum++;
      
      const code = `P-${String(nextNum).padStart(4, '0')}`;
      occupiedNums.add(nextNum); // Reservar para que el siguiente producto no repita
      codeMap.set(productKey, code);
      console.log(`Código pre-generado para "${product.description}": ${code}`);
    }
    
    return codeMap;
  }

  async createProduct(input: CreateProductInput, preGeneratedCode?: string): Promise<ProductStock> {
    const description = String(input?.description ?? '').trim().toUpperCase();
    const unit = this.normalizePurchaseUnit(String(input?.unit ?? 'UN'), 'UN');
    const requestedCode = String(input?.code ?? '').trim().toUpperCase();
    const priceUSD = roundPriceValue(Number(input?.priceUSD ?? 0) || 0);
    const minStock = Number(input?.minStock ?? 0) || 0;
    const conversionRatio = Number(input?.conversionRatio ?? 1) || 1;
    const baseUnit = this.normalizePurchaseUnit(String(input?.baseUnit ?? unit), unit) || unit;

    if (!description) {
      throw new Error('La descripción del producto nuevo es obligatoria.');
    }

    // MEJORA: Usar código pre-generado o generar uno nuevo solo si es necesario
    let code = preGeneratedCode || requestedCode;
    
    // CORRECCIÓN: Validar código antes de intentar crear
    if (code) {
      const existing = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === code);
      if (existing) {
        throw new Error(`Ya existe un producto con el código ${code}.`);
      }
      
      // También verificar en la base de datos por si acaso
      const { data: dbExisting } = await supabase
        .from('products')
        .select('code')
        .eq('code', code)
        .single();
      
      if (dbExisting) {
        throw new Error(`Ya existe un producto con el código ${code}.`);
      }
    }

    const reservedCodes = new Set<string>();
    let insertError: any = null;

    // CORRECCIÓN: Solo generar código si no se proporcionó uno
    for (let attempt = 0; attempt < 10; attempt++) {
      if (!code) {
        code = await this.buildNextProductCode(reservedCodes);
      }

      const payload = {
        code,
        description,
        unit,
        price_usd: priceUSD,
        min_stock: minStock,
        conversion_ratio: conversionRatio,
        base_unit: baseUnit
      };

      const { error } = await supabase.from('products').insert(payload);
      if (!error) {
        insertError = null;
        break;
      }

      insertError = error;
      if (!this.isProductCodeDuplicateError(error)) {
        throw new Error(String(error?.message ?? 'No se pudo crear el producto nuevo.'));
      }

      // Si el usuario solicitó un código específico y ya existe, no reintentar
      if (requestedCode && attempt === 0) {
        throw new Error(`Ya existe un producto con el código ${requestedCode}.`);
      }

      // Reservar el código que falló y generar uno nuevo
      reservedCodes.add(code);
      code = '';
      
      // Pequeña pausa para evitar condiciones de carrera
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (insertError) {
      throw new Error(String(insertError?.message ?? 'No se pudo generar un código único para el producto nuevo después de varios intentos.'));
    }

    const createdProduct: ProductStock = {
      code,
      description,
      unit,
      priceUSD,
      minStock,
      conversionRatio,
      baseUnit,
      stock: 0,
      reserved: 0,
      available: 0,
      status: 'ACTIVE'
    };

    this.products.push(createdProduct);
    this.notify();
    return createdProduct;
  }

  async registerPurchaseEntryInvoice(input: PurchaseRegistrationInvoiceInput): Promise<PurchaseRegistrationInvoiceResult> {
    // MEJORA: Hacer seguimiento de productos creados para rollback si es necesario
    const createdProducts: ProductStock[] = [];
    
    try {
      const supplier = String(input?.supplier ?? '').trim();
      const rawDoc = String(input?.supplierDocument ?? '').trim();
      const supplierDocument = normalizeDocumentId(rawDoc);
      const supplierPhone = String(input?.supplierPhone ?? '').trim();
      const supplierAddress = String(input?.supplierAddress ?? '').trim();
      const invoiceNumber = String(input?.invoiceNumber ?? '').trim().toUpperCase();
      const warehouse = String(input?.warehouse ?? 'Galpon D3').trim() || 'Galpon D3';
      const paymentType = input?.paymentType === 'CREDIT' ? 'CREDIT' : 'CASH';
      const invoiceDate = input?.invoiceDate instanceof Date ? input.invoiceDate : new Date(input?.invoiceDate as any);
      const invoiceDueDate = input?.invoiceDueDate instanceof Date ? input.invoiceDueDate : (input?.invoiceDueDate ? new Date(input.invoiceDueDate as any) : null);
      const files = Array.from(input?.files || []).filter(Boolean) as File[];
      const rawItems = Array.isArray(input?.items) ? input.items : [];
      const paymentMethod = String(input?.paymentMethod ?? '').trim();
      const bankId = String(input?.bankId ?? '').trim();
      const bankName = String(input?.bankName ?? '').trim();
      const bankAccountId = String(input?.bankAccountId ?? '').trim();
      const bankAccountLabel = String(input?.bankAccountLabel ?? '').trim();
      const reference = String(input?.reference ?? '').trim();
      const now = new Date();

      if (!supplier) throw new Error('Debe indicar el proveedor.');
      if (!invoiceNumber) throw new Error('Debe indicar el número de factura.');

      // 0. Duplication Check
      const qDuplicate = query(
        collection(db, 'purchase_entries'),
        where('invoiceNumber', '==', invoiceNumber),
        where('supplier', '==', supplier),
        limit(1)
      );
      const snapDuplicate = await getDocs(qDuplicate);
      if (!snapDuplicate.empty) {
        const existingDoc = snapDuplicate.docs[0];
        const existingData = existingDoc.data();
        const existingDate = existingData?.invoiceDate ? 
          new Date(existingData.invoiceDate.toDate ? existingData.invoiceDate.toDate() : existingData.invoiceDate).toLocaleDateString('es-VE') : 
          'fecha desconocida';
        
        throw new Error(`FACTURA DUPLICADA: Ya existe la factura #${invoiceNumber} para el proveedor "${supplier}" (registrada el ${existingDate}).\n\nSi es una factura diferente, verifique el número o use un número de control adicional.`);
      }

      if (!(invoiceDate instanceof Date) || Number.isNaN(invoiceDate.getTime())) throw new Error('La fecha de factura no es válida.');
      if (invoiceDueDate && Number.isNaN(invoiceDueDate.getTime())) throw new Error('El vencimiento de la factura no es válido.');
      if (rawItems.length === 0) throw new Error('Debe agregar al menos un producto a la factura.');
      if (paymentType === 'CASH' && !paymentMethod) throw new Error('Debe indicar el método de pago.');

      // MEJORA: Pre-generar códigos para productos nuevos ANTES de cualquier creación
      const newProducts = rawItems.filter(item => item?.newProduct && !item?.sku).map(item => item.newProduct!);
      let preGeneratedCodes: Map<string, string> | null = null;
      
      if (newProducts.length > 0) {
        console.log(`Pre-generando ${newProducts.length} códigos para productos nuevos...`);
        try {
          preGeneratedCodes = await this.preGenerateProductCodes(newProducts);
          console.log('Códigos pre-generados exitosamente');
        } catch (error) {
          console.error('Error en pre-generación de códigos:', error);
          throw new Error(`No se pudieron generar los códigos para los productos nuevos: ${error}`);
        }
      }

    // Auto-routing para efectivo: si el método es cash_usd/cash_ves, resolver al banco "Efectivo"
    // aunque no se haya seleccionado banco explícito
    const cashBankResolution = paymentType === 'CASH'
      ? ((paymentMethod === 'cash_usd' || paymentMethod === 'cash_ves')
          ? this.resolveCashBank(paymentMethod as 'cash_usd' | 'cash_ves')
          : this.resolveBankAccountForMethod({
              bankId,
              bankName,
              paymentMethod,
              accountId: bankAccountId
            }))
      : null;

    const normalizedItems = rawItems.map((item, index) => {
      const qty = roundQtyValue(Number(item?.qty ?? 0) || 0);
      const costUSD = roundPriceValue(Number(item?.costUSD ?? 0) || 0);
      const expiryDate = item?.expiryDate instanceof Date ? item.expiryDate : new Date(item?.expiryDate as any);
      const totalLineUSD = roundMoney(Number(item?.totalLineUSD ?? 0) || (qty * costUSD));
      let batch = String(item?.batch ?? '').trim().toUpperCase();
      
      // MEJORA: Generar automáticamente número de lote si está vacío
      if (!batch) {
        // Para productos nuevos, el SKU no está disponible aún, usamos la descripción como referencia
        let sku = String(item?.sku ?? '').trim().toUpperCase();
        
        if (!sku && item?.newProduct) {
          // Para productos nuevos, generar un SKU temporal basado en la descripción
          const tempDesc = String(item.newProduct.description ?? '').trim().toUpperCase().substring(0, 10);
          sku = `NEW-${tempDesc}`;
        }
        
        if (sku) {
          batch = this.generateUniqueBatchNumber(sku);
          console.log(`Lote generado automáticamente para ${sku}: ${batch}`);
        } else {
          throw new Error(`No se puede generar lote automático sin SKU en el renglón ${index + 1}.`);
        }
      }

      if (!Number.isFinite(qty) || qty <= 0) throw new Error(`La cantidad del renglón ${index + 1} debe ser mayor a cero.`);
      if (!Number.isFinite(costUSD) || costUSD <= 0) throw new Error(`El costo unitario del renglón ${index + 1} debe ser mayor a cero.`);
      if (!(expiryDate instanceof Date) || Number.isNaN(expiryDate.getTime())) throw new Error(`La fecha de caducidad del renglón ${index + 1} no es válida.`);
      if (!Number.isFinite(totalLineUSD) || totalLineUSD <= 0) throw new Error(`El subtotal del renglón ${index + 1} debe ser mayor a cero.`);

      return {
        ...item,
        qty,
        costUSD,
        expiryDate,
        batch,
        totalLineUSD,
        unit: this.normalizePurchaseUnit(String(item?.unit ?? item?.newProduct?.unit ?? 'UN'), 'UN')
      };
    });

    const computedInvoiceTotalUSD = roundMoney(normalizedItems.reduce((acc, item) => acc + item.totalLineUSD, 0));
    const totalInvoiceUSD = roundMoney(Number(input?.totalInvoiceUSD ?? 0) || computedInvoiceTotalUSD);

    if (!Number.isFinite(totalInvoiceUSD) || totalInvoiceUSD <= 0) throw new Error('El monto total de la factura debe ser mayor a cero.');

    // Validación de unicidad de lotes antes de insertar (usando data en memoria
    // porque la tabla Supabase inventory_batches no tiene columna batch — el
    // número de lote se persiste como metadata en Firestore purchase_entries).
    for (let i = 0; i < normalizedItems.length; i++) {
      const item = normalizedItems[i];
      const sku = String(item?.sku ?? '').trim().toUpperCase();
      const batch = String(item?.batch ?? '').trim().toUpperCase();

      if (!sku || !batch) continue;

      // 1. Verificar contra lotes ya existentes del producto en memoria
      const product = this.products.find(p => String(p?.code ?? '').trim().toUpperCase() === sku);
      if (product && Array.isArray(product.lotes)) {
        const conflict = product.lotes.find(l => String(l?.batch ?? '').trim().toUpperCase() === batch);
        if (conflict) {
          throw new Error(`El lote "${batch}" ya existe para el producto "${sku}". Use un número de lote diferente.`);
        }
      }

      // 2. Verificar contra otros items en esta misma compra
      const duplicateInThisPurchase = normalizedItems.some((otherItem, otherIndex) =>
        otherIndex !== i &&
        String(otherItem?.sku ?? '').trim().toUpperCase() === sku &&
        String(otherItem?.batch ?? '').trim().toUpperCase() === batch
      );
      if (duplicateInThisPurchase) {
        throw new Error(`El lote "${batch}" está duplicado en esta misma compra para el producto "${sku}". Cada lote debe ser único por producto.`);
      }
    }

    const inlineSupports = await this.buildInlineSupports(files);
    const safeInvoice = invoiceNumber.replace(/[^A-Z0-9_-]+/gi, '_');
    const invoiceGroupId = `${safeInvoice}_${Date.now()}`;
    const upload = await this.uploadSupportFiles(`purchase_invoices/${invoiceGroupId}`, files);
    const supportsToPersist = Array.isArray(upload.supports) && upload.supports.length > 0 ? upload.supports : inlineSupports;
    const itemsResult: PurchaseRegistrationInvoiceItemResult[] = [];
    const purchaseDocIds: string[] = [];

    for (let index = 0; index < normalizedItems.length; index++) {
      const item = normalizedItems[index];
      let createdProduct = false;
      let resolvedProduct: ProductStock | undefined;
      let sku = String(item?.sku ?? '').trim().toUpperCase();

      if (sku) {
        resolvedProduct = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === sku);
        if (!resolvedProduct) throw new Error(`El producto seleccionado en el renglón ${index + 1} ya no existe en el catálogo.`);
      } else if (item?.newProduct) {
        const salePriceUSD = this.calculateSalePriceFromCost(item.costUSD);
        
        // MEJORA: Usar código pre-generado para evitar basura
        const productKey = `${item.newProduct.description}_${item.unit}_${index}`;
        const preGeneratedCode = preGeneratedCodes?.get(productKey);
        
        if (!preGeneratedCode) {
          throw new Error(`No se encontró código pre-generado para el producto "${item.newProduct.description}" en el renglón ${index + 1}.`);
        }
        
        console.log(`Creando producto con código pre-generado: ${preGeneratedCode}`);
        
        resolvedProduct = await this.createProduct({
          ...item.newProduct,
          unit: item.unit,
          priceUSD: salePriceUSD,
          minStock: Number(item?.newProduct?.minStock ?? 0) || 0,
          conversionRatio: 1,
          baseUnit: item.unit
        }, preGeneratedCode);
        
        sku = resolvedProduct.code;
        createdProduct = true;
        createdProducts.push(resolvedProduct); // MEJORA: Agregar a lista para rollback
        console.log(`Producto creado exitosamente: ${sku}`);
      } else {
        throw new Error(`Debe seleccionar o crear un producto en el renglón ${index + 1}.`);
      }

      // BUG-05 FIX: Solo calcular precio de venta para productos NUEVOS
      // Para productos existentes, respetar el precio configurado manualmente
      let salePriceUSD: number;
      if (createdProduct) {
        // Producto nuevo: aplicar cálculo automático
        salePriceUSD = this.calculateSalePriceFromCost(item.costUSD);
        resolvedProduct = await this.syncProductCommercialTerms(resolvedProduct, {
          unit: item.unit || resolvedProduct.unit,
          salePriceUSD
        });
      } else {
        // Producto existente: mantener precio actual, solo actualizar unidad si cambió
        salePriceUSD = resolvedProduct.priceUSD;
        resolvedProduct = await this.syncProductCommercialTerms(resolvedProduct, {
          unit: item.unit || resolvedProduct.unit,
          salePriceUSD // Mantener precio existente
        });
      }

      const { data: newBatch, error } = await this.insertInventoryBatchWithFallback({
        product_code: sku,
        quantity: item.qty,
        cost_usd: item.costUSD,
        expiry_date: item.expiryDate.toISOString().split('T')[0],
        purchase_date: invoiceDate.toISOString().split('T')[0],
        warehouse: item.warehouse || warehouse
        // supplier, batch y status se eliminan automáticamente en insertInventoryBatchWithFallback
      });

      if (error) {
        console.error(`Error al registrar lote para producto ${sku}:`, error);
        throw new Error(`No se pudo registrar el renglón ${index + 1} en inventario: ${String(error?.message ?? 'Error desconocido')}`);
      }

      // CORRECCIÓN: Verificar que el lote se creó correctamente
      // NOTA: insertInventoryBatchWithFallback usa .single() → data es objeto, NO array
      if (!newBatch) {
        console.error(`No se devolvió ID del lote para producto ${sku}`);
        throw new Error(`No se pudo obtener el ID del lote para el producto ${sku} en el renglón ${index + 1}.`);
      }

      console.log(`Lote creado exitosamente: Producto=${sku}, Lote=${item.batch}, ID=${newBatch.id}, Cantidad=${item.qty}`);

      await supabase.from('movements').insert({
        product_code: sku,
        type: 'IN',
        quantity: item.qty,
        warehouse: item.warehouse || warehouse,
        reason: `Compra ${invoiceNumber} · ${supplier} · Item ${index + 1}/${normalizedItems.length} (${paymentType === 'CREDIT' ? 'CRÉDITO' : 'CONTADO'})`,
        operator: this.currentUser?.name ?? ''
      });

      try {
        const purchaseDoc = await addDoc(collection(db, 'purchase_entries'), {
          invoiceGroupId,
          lineNumber: index + 1,
          linesCount: normalizedItems.length,
          sku,
          productDescription: resolvedProduct?.description ?? String(item?.newProduct?.description ?? '').trim().toUpperCase(),
          unit: resolvedProduct?.unit ?? item.unit,
          batch: item.batch,
          supplier,
          supplierDocument,
          supplierPhone,
          supplierAddress,
          supplierMeta: {
            name: supplier,
            document: supplierDocument,
            phone: supplierPhone,
            address: supplierAddress
          },
          invoiceNumber,
          invoiceDate: invoiceDate.toISOString(),
          invoiceDueDate: invoiceDueDate ? invoiceDueDate.toISOString() : '',
          expiryDate: item.expiryDate.toISOString(),
          qty: item.qty,
          costUSD: item.costUSD,
          totalLineUSD: item.totalLineUSD,
          totalInvoiceUSD,
          salePriceUSD,
          salePrices: this.buildProductPrices(salePriceUSD),
          warehouse,
          paymentType,
          paymentMethod,
          bankId: cashBankResolution?.bankId ?? bankId,
          bankName: cashBankResolution?.bankName ?? bankName,
          bankAccountId: cashBankResolution?.accountId ?? bankAccountId,
          bankAccountLabel: cashBankResolution?.accountLabel ?? bankAccountLabel,
          reference,
          supports: supportsToPersist,
          storageProvider: upload.storageProvider,
          storageBucket: upload.storageBucket ?? '',
          supportsUploadError: upload.supportsUploadError ?? '',
          batchId: String(newBatch?.id ?? ''),
          actor: this.currentUser?.name ?? '',
          createdAt: new Date().toISOString()
        } as any);
        purchaseDocIds.push(purchaseDoc.id);
      } catch (purchaseMetaError) {
        console.warn('No se pudo guardar metadata de la compra:', purchaseMetaError);
      }

      itemsResult.push({
        sku,
        createdProduct,
        batchId: String(newBatch?.id ?? ''),
        priceUSD: salePriceUSD,
        totalLineUSD: item.totalLineUSD
      });
    }

    let apEntryId: string | undefined;
    if (paymentType === 'CREDIT') {
      const apEntry = await this.addAPEntry(
        supplier,
        `Factura ${invoiceNumber}: ${normalizedItems.length} producto(s)`,
        totalInvoiceUSD,
        15,
        supplierDocument
      );
      apEntryId = apEntry?.id;

      for (const purchaseDocId of purchaseDocIds) {
        try {
          await setDoc(doc(db, 'purchase_entries', purchaseDocId), {
            apEntryId: apEntryId ?? ''
          } as any, { merge: true });
        } catch (purchaseApLinkError) {
          console.warn('No se pudo vincular la compra con AP:', purchaseApLinkError);
        }
      }
    } else if (paymentType === 'CASH' && cashBankResolution) {
      await this.appendBankTransaction({
        bankId: cashBankResolution.bankId,
        bankName: cashBankResolution.bankName,
        accountId: cashBankResolution.accountId,
        accountLabel: cashBankResolution.accountLabel,
        method: paymentMethod || 'cash_usd',
        source: 'PURCHASE_PAYMENT',
        sourceId: invoiceGroupId || '',
        arId: '',
        customerId: '',
        customerName: supplier,
        saleCorrelativo: invoiceNumber,
        currency: (paymentMethod === 'cash_ves' || paymentMethod === 'mobile' || paymentMethod === 'transfer' || paymentMethod === 'debit' || paymentMethod === 'biopago') ? 'VES' : 'USD',
        amountUSD: -Math.abs(totalInvoiceUSD),
        amountVES: 0,
        rateUsed: 0,
        reference,
        note: `Pago de compra: Factura ${invoiceNumber} · ${supplier}`,
        supports: supportsToPersist,
        storageProvider: upload.storageProvider,
        storageBucket: upload.storageBucket ?? '',
        supportsUploadError: upload.supportsUploadError ?? '',
        purchaseInvoiceGroupId: invoiceGroupId,
        purchaseInvoiceNumber: invoiceNumber,
        purchaseInvoiceDate: invoiceDate.toISOString(),
        purchaseInvoiceDueDate: invoiceDueDate ? invoiceDueDate.toISOString() : '',
        purchaseSupplierDocument: supplierDocument,
        purchaseWarehouse: Array.from(new Set(normalizedItems.map((item) => String(item?.warehouse || warehouse).trim()).filter(Boolean))).join(' • '),
        purchaseBatches: Array.from(new Set(normalizedItems.map((item) => String(item?.batch ?? '').trim()).filter(Boolean))),
        purchaseLineCount: normalizedItems.length,
        actor: this.currentUser?.name ?? '',
        createdAt: now.toISOString()
      });
    } else if (paymentType === 'CASH' && bankName && !cashBankResolution) {
      console.warn(`No se pudo registrar bank_transaction para compra ${invoiceNumber}: no se encontró cuenta válida para banco ${bankName} y método ${paymentMethod}`);
    }

    // 7. Registrar gasto en libro mayor
    await this.addExpense(
      `Compra: Factura ${invoiceNumber} · ${supplier}`,
      totalInvoiceUSD,
      'VARIABLE'
    );

    await this.init();
    return {
      items: itemsResult,
      apEntryId,
      supportsUploadError: upload.supportsUploadError ?? '',
      totalInvoiceUSD
    };
  } catch (error) {
    // MEJORA: Rollback automático de productos creados si algo falla
    console.error('Error en registro de compra, iniciando rollback de productos creados:', error);
    
    if (createdProducts.length > 0) {
      try {
        await this.rollbackCreatedProducts(createdProducts);
        console.log(`Rollback completado: ${createdProducts.length} productos eliminados.`);
      } catch (rollbackError) {
        console.error('Error crítico: No se pudo completar el rollback de productos:', rollbackError);
        // Lanzar error original pero informar sobre el problema de rollback
        throw new Error(`${error.message}. ADVERTENCIA: No se pudieron eliminar ${createdProducts.length} productos creados. Contacte al administrador.`);
      }
    }
    
    throw error;
  }
  }

  async voidPurchaseEntry(invoiceGroupId: string, apEntryId?: string, observation?: string): Promise<void> {
    if (!this.hasPermission('INVENTORY_WRITE')) throw new Error('Sin permiso para anular compras.');
    const actor = this.getCurrentUser()?.name ?? 'SISTEMA';
    const voidObservation = String(observation ?? '').trim() || 'Sin observación';
    const voidedAt = new Date().toISOString();

    let snap = await getDocs(query(collection(db, 'purchase_entries'), where('invoiceGroupId', '==', invoiceGroupId)));
    if (snap.empty && apEntryId) {
      snap = await getDocs(query(collection(db, 'purchase_entries'), where('apEntryId', '==', apEntryId)));
    }
    if (snap.empty) throw new Error('No se encontraron renglones de la compra a anular.');

    const rows = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const alreadyVoided = rows.some((r: any) => r.status === 'VOID');
    if (alreadyVoided) throw new Error('Esta compra ya fue anulada.');

    // Recopilar IDs de AP entries y SKUs únicos de esta compra
    const apEntryIds = [...new Set(rows.map((r: any) => String(r.apEntryId ?? '').trim()).filter(Boolean))];
    const skusInPurchase = [...new Set(rows.map((r: any) => String(r.sku ?? '').trim().toUpperCase()).filter(Boolean))];

    for (const row of rows) {
      try {
        // 1. Marcar purchase entry como VOID en Firebase con auditoría completa
        await setDoc(doc(db, 'purchase_entries', row.id), {
          status: 'VOID',
          voidedAt,
          voidedBy: actor,
          voidObservation,
          voidedByRole: this.getCurrentUser()?.role ?? '',
          voidedByUserId: this.getCurrentUser()?.id ?? ''
        } as any, { merge: true });

        // 2. ELIMINAR el lote completamente (no solo poner quantity:0)
        // Así el stock desaparece del inventario
        const batchId = String(row.batchId ?? '').trim();
        if (batchId) {
          const { error: batchError } = await supabase
            .from('inventory_batches')
            .delete()
            .eq('id', batchId);
          if (batchError) {
            console.warn(`No se pudo eliminar lote ${batchId}:`, batchError);
          } else {
            console.log(`Lote ${batchId} eliminado correctamente.`);
          }
        }

        // 3. Registrar movimiento de salida en kardex
        const sku = String(row.sku ?? '').trim();
        const qty = Number(row.qty ?? 0);
        if (sku && qty > 0) {
          await supabase.from('movements').insert({
            product_code: sku,
            type: 'OUT',
            quantity: qty,
            warehouse: String(row.warehouse ?? 'Galpon D3'),
            reason: `ANULACIÓN COMPRA ${String(row.invoiceNumber ?? '')} · ${String(row.supplier ?? '')}`,
            operator: actor
          });
        }
      } catch (rowError) {
        console.error(`Error procesando fila ${row.id}:`, rowError);
      }
    }

    // 4. Actualizar AP entries en SUPABASE con observación y auditoría completa
    for (const apId of apEntryIds) {
      const { error } = await supabase
        .from('ap_entries')
        .update({
          status: 'VOID',
          voided_at: voidedAt,
          voided_by: actor,
          void_observation: voidObservation
        })
        .eq('id', apId);
      if (error) {
        // Si la columna no existe, intentar solo status
        await supabase.from('ap_entries').update({ status: 'VOID' }).eq('id', apId);
        console.warn(`AP entry ${apId}: columnas de auditoría pueden no existir en esquema:`, error);
      } else {
        console.log(`AP entry ${apId} marcado como VOID con observación.`);
      }
    }

    // 5. Eliminar producto si quedó sin lotes tras la anulación
    for (const sku of skusInPurchase) {
      try {
        const { data: remainingBatches } = await supabase
          .from('inventory_batches')
          .select('id')
          .eq('product_code', sku);

        if (!remainingBatches || remainingBatches.length === 0) {
          console.log(`Producto ${sku} sin lotes tras anulación, eliminando producto...`);
          await supabase.from('products').delete().eq('code', sku);
          this.products = this.products.filter(p => p.code !== sku);
          this.allProducts = this.allProducts.filter(p => p.code !== sku);
          console.log(`Producto ${sku} eliminado. Correlativo liberado.`);
        }
      } catch (e) {
        console.warn(`No se pudo verificar/eliminar producto ${sku}:`, e);
      }
    }

    await this.init();
  }

  async checkInvoiceDuplicate(invoiceNumber: string, supplier: string): Promise<{ duplicate: boolean; date?: string }> {
    const inv = String(invoiceNumber ?? '').trim().toUpperCase();
    const sup = String(supplier ?? '').trim();
    if (!inv || !sup) return { duplicate: false };
    const q = query(
      collection(db, 'purchase_entries'),
      where('invoiceNumber', '==', inv),
      where('supplier', '==', sup),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return { duplicate: false };
    const data = snap.docs[0].data();
    const date = data?.invoiceDate
      ? new Date(data.invoiceDate.toDate ? data.invoiceDate.toDate() : data.invoiceDate).toLocaleDateString('es-VE')
      : undefined;
    return { duplicate: true, date };
  }

  async registerPurchaseEntry(input: PurchaseRegistrationInput): Promise<PurchaseRegistrationResult> {
    const result = await this.registerPurchaseEntryInvoice({
      supplier: input.supplier,
      supplierDocument: input.supplierDocument,
      supplierPhone: input.supplierPhone,
      supplierAddress: input.supplierAddress,
      invoiceNumber: input.invoiceNumber,
      invoiceDate: input.invoiceDate,
      invoiceDueDate: input.invoiceDueDate,
      totalInvoiceUSD: input.totalInvoiceUSD,
      paymentType: input.paymentType,
      paymentMethod: input.paymentMethod,
      bankId: input.bankId,
      bankName: input.bankName,
      bankAccountId: input.bankAccountId,
      bankAccountLabel: input.bankAccountLabel,
      reference: input.reference,
      files: input.files,
      warehouse: input.warehouse,
      items: [{
        sku: input.sku,
        newProduct: input.newProduct,
        unit: input.newProduct?.unit,
        qty: input.qty,
        costUSD: input.costUSD,
        expiryDate: input.expiryDate,
        batch: String((input as any).batch ?? '').trim().toUpperCase(),
        totalLineUSD: input.totalInvoiceUSD
      }]
    });

    const firstItem = result.items[0];
    if (!firstItem) {
      throw new Error('No se pudo registrar el producto de la compra.');
    }

    return {
      sku: firstItem.sku,
      createdProduct: firstItem.createdProduct,
      apEntryId: result.apEntryId,
      supportsUploadError: result.supportsUploadError ?? ''
    };
  }

  async updateBatchCost(batchId: string, newCostUSD: number): Promise<void> {
    const cost = Math.max(0, Number(newCostUSD) || 0);
    const { error } = await supabase
      .from('inventory_batches')
      .update({ cost_usd: cost })
      .eq('id', batchId);
    if (error) throw new Error(String(error?.message ?? 'No se pudo actualizar el costo del lote.'));
    
    // SEC-05: Audit trail para cambio de costo de lote
    await this.addAuditEntry('INVENTORY', 'BATCH_COST_CHANGE', 
      `Cambio costo lote: ${batchId} | Nuevo costo: $${cost.toFixed(2)} | Usuario: ${this.currentUser?.name || 'Sistema'}`);
    
    // Actualizar en memoria
    for (const product of this.products) {
      const lote = product.lotes.find(l => String(l.id) === String(batchId));
      if (lote) {
        lote.costUSD = cost;
        break;
      }
    }
    this.notify();
  }

  async adjustInventoryBatch(input: {
    batchId: string;
    sku: string;
    adjustType: 'DECREASE' | 'INCREASE';
    qty: number;
    reason: string;
    reference?: string;
    warehouse: string;
  }): Promise<{ newQty: number }> {
    if (!this.hasPermission('INVENTORY_WRITE') && !this.hasPermission('ALL')) {
      throw new Error('Sin permiso para ajustar inventario.');
    }
    const batchId = String(input?.batchId ?? '').trim();
    const sku = String(input?.sku ?? '').trim().toUpperCase();
    const qty = Number(input?.qty ?? 0) || 0;
    const reason = String(input?.reason ?? '').trim();
    const reference = String(input?.reference ?? '').trim().toUpperCase();
    const warehouse = String(input?.warehouse ?? '').trim();

    if (!batchId) throw new Error('Debe seleccionar el lote a ajustar.');
    if (!sku) throw new Error('SKU de producto requerido.');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad del ajuste debe ser mayor a cero.');
    if (!reason) throw new Error('Debe indicar el motivo del ajuste.');

    const product = this.products.find(p => String(p?.code ?? '').trim().toUpperCase() === sku);
    if (!product) throw new Error('El producto seleccionado no existe en el catálogo.');

    const batch = product.lotes.find(l => String(l?.id ?? '').trim() === batchId);
    if (!batch) throw new Error('El lote seleccionado no existe.');

    const currentQty = Number(batch.qty ?? 0) || 0;
    const delta = input.adjustType === 'DECREASE' ? -qty : qty;
    const newQty = roundQtyValue(Math.max(0, currentQty + delta));

    if (input.adjustType === 'DECREASE' && qty > currentQty) {
      throw new Error(`La cantidad a disminuir (${qty}) excede la disponible en el lote (${currentQty}).`);
    }

    const { error } = await supabase
      .from('inventory_batches')
      .update({ quantity: newQty })
      .eq('id', batchId);

    if (error) throw new Error(String(error?.message ?? 'No se pudo ajustar el lote.'));

    const movQty = input.adjustType === 'DECREASE' ? -qty : qty;
    const reasonText = `Ajuste ${input.adjustType === 'DECREASE' ? 'negativo' : 'positivo'}: ${reason}${reference ? ` [${reference}]` : ''}`;

    try {
      await this.insertMovementWithFallback({
        product_code: sku,
        type: 'ADJUST',
        quantity: movQty,
        warehouse,
        reason: reasonText,
        operator: this.currentUser?.name ?? 'SISTEMA'
      });
      // KARDEX FIX: agregar movimiento al array local para que el Kardex se actualice inmediatamente
      // (sin esperar al realtime subscription de Supabase)
      this.movements.unshift({
        id: `adj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'ADJUST',
        sku,
        qty: movQty,
        user: this.currentUser?.name ?? 'SISTEMA',
        timestamp: new Date(),
        warehouse,
        reason: reasonText
      } as any);
    } catch (e) {
      console.warn('No se pudo registrar movimiento de ajuste:', e);
    }

    await this.addAuditEntry(
      'INVENTORY',
      'BATCH_ADJUST',
      `Ajuste ${input.adjustType}: ${sku} | Lote: ${batchId} | Almacén: ${warehouse} | Anterior: ${currentQty} → Nuevo: ${newQty} | Motivo: ${reason}${reference ? ` | Ref: ${reference}` : ''} | Usuario: ${this.currentUser?.name ?? 'SISTEMA'}`
    );

    for (const p of this.products) {
      const l = p.lotes.find(l => String(l.id) === batchId);
      if (l) { l.qty = newQty; break; }
    }
    this.notify();
    return { newQty };
  }

  async transferInventoryBatch(input: {
    batchId: string;
    sku: string;
    qty: number;
    fromWarehouse: string;
    toWarehouse: string;
    reference?: string;
  }): Promise<{ transferredQty: number; newBatchId: string }> {
    if (!this.hasPermission('INVENTORY_WRITE') && !this.hasPermission('ALL')) {
      throw new Error('Sin permiso para transferir inventario.');
    }
    const batchId = String(input?.batchId ?? '').trim();
    const sku = String(input?.sku ?? '').trim().toUpperCase();
    const qty = Number(input?.qty ?? 0) || 0;
    const fromWarehouse = String(input?.fromWarehouse ?? '').trim();
    const toWarehouse = String(input?.toWarehouse ?? '').trim();
    const reference = String(input?.reference ?? '').trim().toUpperCase();

    if (!batchId) throw new Error('Debe seleccionar el lote a trasladar.');
    if (!sku) throw new Error('SKU de producto requerido.');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad a trasladar debe ser mayor a cero.');
    if (!fromWarehouse) throw new Error('Debe indicar el almacén de origen.');
    if (!toWarehouse) throw new Error('Debe indicar el almacén de destino.');
    if (fromWarehouse === toWarehouse) throw new Error('El almacén de origen y destino no pueden ser el mismo.');

    const product = this.products.find(p => String(p?.code ?? '').trim().toUpperCase() === sku);
    if (!product) throw new Error('El producto no existe en el catálogo.');

    const sourceBatch = product.lotes.find(l => String(l?.id ?? '').trim() === batchId);
    if (!sourceBatch) throw new Error('El lote seleccionado no existe.');

    const currentQty = Number(sourceBatch.qty ?? 0) || 0;
    if (qty > currentQty) {
      throw new Error(`La cantidad a trasladar (${qty}) excede la disponible en el lote (${currentQty}).`);
    }

    const newSourceQty = roundQtyValue(Math.max(0, currentQty - qty));

    // 1. Descontar del lote origen
    const { error: decreaseError } = await supabase
      .from('inventory_batches')
      .update({ quantity: newSourceQty })
      .eq('id', batchId);

    if (decreaseError) throw new Error(String(decreaseError?.message ?? 'No se pudo descontar el lote de origen.'));

    // 2. Buscar lote existente en destino con mismo producto, lote-label y costo
    const batchLabel = String(sourceBatch.batch ?? batchId).trim();
    const costUSD = Number(sourceBatch.costUSD ?? 0) || 0;
    const expiryDate = sourceBatch.expiry instanceof Date
      ? sourceBatch.expiry.toISOString().split('T')[0]
      : String(sourceBatch.expiry ?? '').split('T')[0];

    const { data: existingRows } = await supabase
      .from('inventory_batches')
      .select('id, quantity')
      .eq('product_code', sku)
      .eq('warehouse', toWarehouse)
      .eq('batch', batchLabel)
      .limit(1);

    let newBatchId = '';

    if (existingRows && existingRows.length > 0) {
      // Sumar al lote existente en destino
      const existingId = String((existingRows[0] as any).id);
      const existingQty = Number((existingRows[0] as any).quantity ?? 0) || 0;
      const mergedQty = roundQtyValue(existingQty + qty);
      const { error: mergeError } = await supabase
        .from('inventory_batches')
        .update({ quantity: mergedQty })
        .eq('id', existingId);
      if (mergeError) {
        // Rollback origen
        await supabase.from('inventory_batches').update({ quantity: currentQty }).eq('id', batchId);
        throw new Error(String(mergeError?.message ?? 'No se pudo actualizar el lote de destino.'));
      }
      newBatchId = existingId;
    } else {
      // Crear nuevo lote en destino
      const { data: newBatch, error: createError } = await this.insertInventoryBatchWithFallback({
        product_code: sku,
        quantity: qty,
        cost_usd: costUSD,
        expiry_date: expiryDate,
        purchase_date: new Date().toISOString().split('T')[0],
        warehouse: toWarehouse,
        batch: batchLabel,
        status: String((sourceBatch as any).status ?? 'RELEASED'),
        supplier: String(sourceBatch.supplier ?? '').trim() || 'TRASLADO'
      });
      if (createError) {
        // Rollback origen
        await supabase.from('inventory_batches').update({ quantity: currentQty }).eq('id', batchId);
        throw new Error(String(createError?.message ?? 'No se pudo crear el lote en el destino.'));
      }
      newBatchId = String((newBatch as any)?.id ?? '');
    }

    // 3. Registrar movimientos de salida y entrada
    const reasonText = `Traslado ${fromWarehouse} → ${toWarehouse}${reference ? ` [${reference}]` : ''}`;
    try {
      await this.insertMovementWithFallback({
        product_code: sku,
        type: 'TRANSFER',
        quantity: -qty,
        warehouse: fromWarehouse,
        reason: reasonText,
        operator: this.currentUser?.name ?? 'SISTEMA'
      });
      await this.insertMovementWithFallback({
        product_code: sku,
        type: 'TRANSFER',
        quantity: qty,
        warehouse: toWarehouse,
        reason: reasonText,
        operator: this.currentUser?.name ?? 'SISTEMA'
      });
    } catch (e) {
      console.warn('No se pudo registrar movimiento de traslado:', e);
    }

    await this.addAuditEntry(
      'INVENTORY',
      'BATCH_TRANSFER',
      `Traslado: ${sku} | Lote: ${batchLabel} | ${fromWarehouse} → ${toWarehouse} | Qty: ${qty}${reference ? ` | Ref: ${reference}` : ''} | Usuario: ${this.currentUser?.name ?? 'SISTEMA'}`
    );

    // 4. Actualizar in-memory
    if (sourceBatch) { (sourceBatch as any).qty = newSourceQty; }
    // Forzar re-init para cargar el nuevo lote destino
    this.notify();
    setTimeout(() => this.init(), 500);

    return { transferredQty: qty, newBatchId };
  }

  async deleteBatch(batchId: string): Promise<void> {
    const id = String(batchId ?? '').trim();
    if (!id) throw new Error('ID de lote inválido.');

    // CORRECCIÓN: Verificar si el lote tiene stock antes de eliminar
    const { data: batchData, error: fetchError } = await supabase
      .from('inventory_batches')
      .select('id, quantity, product_code, batch')
      .eq('id', id)
      .single();
    
    if (fetchError) throw new Error('No se pudo encontrar el lote.');
    if (!batchData) throw new Error('El lote no existe.');
    
    const quantity = Number(batchData.quantity) || 0;
    if (quantity > 0) {
      throw new Error(`No se puede eliminar el lote "${batchData.batch}" del producto "${batchData.product_code}" porque tiene ${quantity} unidades disponibles. Primero debe realizar una devolución o ajuste de inventario.`);
    }

    const { error } = await supabase
      .from('inventory_batches')
      .delete()
      .eq('id', id);
    if (error) throw new Error(String(error?.message ?? 'No se pudo eliminar el lote.'));

    await this.addAuditEntry('INVENTORY', 'BATCH_DELETE',
      `Lote eliminado: ${id} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    for (const product of this.products) {
      const idx = product.lotes.findIndex(l => String(l.id) === id);
      if (idx !== -1) {
        product.lotes.splice(idx, 1);
        break;
      }
    }
    this.notify();
  }

  async updateProductPrice(productCode: string, newPriceUSD: number): Promise<void> {
    const code = String(productCode ?? '').trim().toUpperCase();
    if (!code) throw new Error('Debe indicar el código del producto.');
    const price = Math.max(0, Number(newPriceUSD) || 0);
    if (!Number.isFinite(price) || price <= 0) throw new Error('El precio de venta debe ser mayor a cero.');

    const product = this.products.find(p => String(p.code).trim().toUpperCase() === code);
    if (!product) throw new Error('El producto no existe en el catálogo.');

    const previousPrice = Number(product.priceUSD ?? 0);
    const prices = this.buildProductPrices(price);

    const { error } = await supabase
      .from('products')
      .update({ price_usd: price })
      .eq('code', code);
    if (error) throw new Error(String(error?.message ?? 'No se pudo actualizar el precio de venta.'));

    // FEAT-08: persist price history to Firestore
    await addDoc(collection(db, 'product_price_history'), {
      productCode: code,
      previousPrice,
      newPrice: price,
      changedAt: new Date().toISOString(),
      changedBy: this.currentUser?.name ?? 'SISTEMA'
    });

    await this.addAuditEntry('INVENTORY', 'PRODUCT_PRICE_CHANGE',
      `Cambio precio venta: ${code} | Anterior: $${previousPrice.toFixed(3)} → Nuevo: $${price.toFixed(3)} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    this.products = this.products.map(p =>
      p.code === code ? { ...p, priceUSD: price, prices } : p
    );
    this.notify();
  }

  async getProductPriceHistory(productCode: string): Promise<ProductPriceHistoryRecord[]> {
    const code = String(productCode ?? '').trim().toUpperCase();
    if (!code) return [];
    const snap = await getDocs(
      query(
        collection(db, 'product_price_history'),
        where('productCode', '==', code),
        orderBy('changedAt', 'desc'),
        limit(50)
      )
    );
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ProductPriceHistoryRecord));
  }

  async registerPurchaseReturn(input: PurchaseReturnInput): Promise<PurchaseReturnResult> {
    const batchId = String(input?.batchId ?? '').trim();
    const sku = String(input?.sku ?? '').trim().toUpperCase();
    const qty = Number(input?.qty ?? 0) || 0;
    const reason = String(input?.reason ?? '').trim();
    const reference = String(input?.reference ?? '').trim().toUpperCase();

    if (!batchId) throw new Error('Debe seleccionar el lote a devolver.');
    if (!sku) throw new Error('Debe seleccionar el producto de la devolución.');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad a devolver debe ser mayor a cero.');
    if (!reason) throw new Error('Debe indicar el motivo de la devolución.');

    const product = this.products.find((item) => String(item?.code ?? '').trim().toUpperCase() === sku);
    if (!product) throw new Error('El producto seleccionado no existe en el catálogo.');

    const batch = product.lotes.find((item) => String(item?.id ?? '').trim() === batchId);
    if (!batch) throw new Error('El lote seleccionado ya no existe.');
    if (!Number.isFinite(batch.qty) || batch.qty <= 0) throw new Error('El lote seleccionado no tiene existencia disponible.');
    if (qty > batch.qty) throw new Error('La cantidad a devolver excede la disponible en el lote.');

    const nextQty = roundMoney(Math.max(0, batch.qty - qty));
    const totalUSD = roundMoney(qty * (Number(batch.costUSD ?? 0) || 0));

    const { error } = await supabase
      .from('inventory_batches')
      .update({ quantity: nextQty })
      .eq('id', batchId);

    if (error) {
      throw new Error(String(error?.message ?? 'No se pudo descontar el lote devuelto.'));
    }

    await supabase.from('movements').insert({
      product_code: sku,
      type: 'PURCHASE_RETURN',
      quantity: qty, // CORRECCIÓN: Devolución usa cantidad positiva
      warehouse: batch.warehouse,
      reason: `Devolución compra${reference ? ` ${reference}` : ''}: ${reason}`,
      operator: this.currentUser?.name ?? ''
    });

    // SEC-05: Audit trail para devolución de compra
    await this.addAuditEntry('INVENTORY', 'PURCHASE_RETURN', 
      `Devolución compra: ${sku} | Lote: ${batchId} | ${qty} unidades | $${totalUSD.toFixed(2)} | Motivo: ${reason} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    let purchaseEntryId = '';
    let apEntryAdjusted: string | undefined;

    try {
      const purchaseSnap = await getDocs(query(collection(db, 'purchase_entries'), where('batchId', '==', batchId), limit(1)));
      const purchaseDoc = purchaseSnap.docs[0];
      const purchaseData = purchaseDoc?.data() as any;

      if (purchaseDoc) {
        purchaseEntryId = purchaseDoc.id;
      }

      await addDoc(collection(db, 'purchase_returns'), {
        batchId,
        sku,
        qty,
        totalUSD,
        warehouse: batch.warehouse,
        supplier: batch.supplier ?? '',
        unitCostUSD: Number(batch.costUSD ?? 0) || 0,
        paymentType: batch.paymentType ?? '',
        reason,
        reference,
        purchaseEntryId,
        actor: this.currentUser?.name ?? '',
        createdAt: new Date().toISOString()
      } as any);

      if (purchaseDoc) {
        const returnedQty = roundMoney(Number(purchaseData?.returnedQty ?? 0) + qty);
        const returnedTotalUSD = roundMoney(Number(purchaseData?.returnedTotalUSD ?? 0) + totalUSD);

        await setDoc(doc(db, 'purchase_entries', purchaseDoc.id), {
          returnedQty,
          returnedTotalUSD,
          lastReturnAt: new Date().toISOString(),
          lastReturnReason: reason,
          lastReturnReference: reference
        } as any, { merge: true });

        const apEntryId = String(purchaseData?.apEntryId ?? '').trim();
        if (apEntryId) {
          await this.adjustAPEntryBalance(apEntryId, -totalUSD);
          apEntryAdjusted = apEntryId;
        }
      }
    } catch (returnMetaError) {
      console.warn('No se pudo guardar metadata de la devolución de compra:', returnMetaError);
    }

    await this.init();

    return {
      batchId,
      sku,
      qty,
      totalUSD,
      apEntryAdjusted
    };
  }

  async registerPurchaseAdjustmentNote(input: PurchaseAdjustmentNoteInput): Promise<PurchaseAdjustmentNoteResult> {
    const type = input?.type === 'DEBIT' ? 'DEBIT' : 'CREDIT';
    const apEntryId = String(input?.apEntryId ?? '').trim();
    const reference = String(input?.reference ?? '').trim().toUpperCase();
    const reason = String(input?.reason ?? '').trim();
    let relatedPurchaseId = String(input?.relatedPurchaseId ?? '').trim();
    const amountUSD = roundMoney(Number(input?.amountUSD ?? 0) || 0);
    const files = Array.from(input?.files || []).filter(Boolean) as File[];

    if (!Number.isFinite(amountUSD) || amountUSD <= 0) {
      throw new Error('El monto de la nota debe ser mayor a cero.');
    }
    if (!reason) {
      throw new Error('Debe indicar el motivo de la nota.');
    }

    const apEntry = apEntryId ? this.apEntries.find((item) => item.id === apEntryId) : undefined;
    if (apEntryId && !apEntry) {
      throw new Error('La cuenta por pagar seleccionada ya no existe.');
    }

    const supplier = String(input?.supplier ?? apEntry?.supplier ?? '').trim();
    if (!supplier) {
      throw new Error('Debe indicar el proveedor de la nota.');
    }

    if (type === 'CREDIT' && !apEntryId) {
      throw new Error('La nota de crédito debe aplicarse sobre una cuenta por pagar existente.');
    }

    if (type === 'CREDIT' && apEntry && amountUSD > (Number(apEntry.balanceUSD ?? 0) || 0) + 0.005) {
      throw new Error('La nota de crédito no puede exceder el saldo actual de la cuenta por pagar.');
    }

    let createdAPEntryId: string | undefined;
    let adjustedAPEntryId: string | undefined;

    if (apEntryId) {
      await this.adjustAPEntryBalance(apEntryId, type === 'CREDIT' ? -amountUSD : amountUSD);
      adjustedAPEntryId = apEntryId;
    } else if (type === 'DEBIT') {
      const newApEntry = await this.addAPEntry(
        supplier,
        `Nota de débito${reference ? ` ${reference}` : ''}: ${reason}`,
        amountUSD,
        15
      );
      createdAPEntryId = newApEntry.id;
    }

    if (!relatedPurchaseId && apEntryId) {
      try {
        const purchaseSnap = await getDocs(query(collection(db, 'purchase_entries'), where('apEntryId', '==', apEntryId), limit(1)));
        const purchaseDoc = purchaseSnap.docs[0];
        if (purchaseDoc) {
          relatedPurchaseId = purchaseDoc.id;
        }
      } catch (purchaseLookupError) {
        console.warn('No se pudo ubicar la compra relacionada a la cuenta por pagar:', purchaseLookupError);
      }
    }

    const safeReference = reference || `${type}_${Date.now()}`;
    const inlineSupports = await this.buildInlineSupports(files);
    const upload = await this.uploadSupportFiles(`purchase_adjustment_notes/${supplier.replace(/[^A-Z0-9_-]+/gi, '_')}/${safeReference}`, files);
    const supportsToPersist = Array.isArray(upload.supports) && upload.supports.length > 0 ? upload.supports : inlineSupports;

    const noteDoc = await addDoc(collection(db, 'purchase_adjustment_notes'), {
      type,
      supplier,
      apEntryId: adjustedAPEntryId ?? '',
      createdAPEntryId: createdAPEntryId ?? '',
      amountUSD,
      reference,
      reason,
      relatedPurchaseId,
      supports: supportsToPersist,
      storageProvider: upload.storageProvider,
      storageBucket: upload.storageBucket ?? '',
      supportsUploadError: upload.supportsUploadError ?? '',
      actor: this.currentUser?.name ?? '',
      createdAt: new Date().toISOString()
    } as any);

    if (relatedPurchaseId) {
      try {
        const purchaseRef = doc(db, 'purchase_entries', relatedPurchaseId);
        const purchaseSnap = await getDoc(purchaseRef);
        const purchaseData = purchaseSnap.exists() ? purchaseSnap.data() : {};
        const currentCreditTotal = Number((purchaseData as any)?.creditNoteTotalUSD ?? 0) || 0;
        const currentDebitTotal = Number((purchaseData as any)?.debitNoteTotalUSD ?? 0) || 0;

        await setDoc(purchaseRef, {
          creditNoteTotalUSD: type === 'CREDIT' ? roundMoney(currentCreditTotal + amountUSD) : currentCreditTotal,
          debitNoteTotalUSD: type === 'DEBIT' ? roundMoney(currentDebitTotal + amountUSD) : currentDebitTotal,
          lastAdjustmentNoteAt: new Date().toISOString(),
          lastAdjustmentNoteType: type,
          lastAdjustmentNoteReference: reference,
          lastAdjustmentNoteReason: reason
        } as any, { merge: true });
      } catch (purchaseNoteError) {
        console.warn('No se pudo vincular la nota con la compra relacionada:', purchaseNoteError);
      }
    }

    await supabase.from('movements').insert({
      product_code: relatedPurchaseId || adjustedAPEntryId || createdAPEntryId || supplier.toUpperCase(),
      type: type === 'CREDIT' ? 'PURCHASE_CREDIT_NOTE' : 'PURCHASE_DEBIT_NOTE',
      quantity: 0,
      warehouse: 'SISTEMA',
      reason: `Nota ${type === 'CREDIT' ? 'CRÉDITO' : 'DÉBITO'}${reference ? ` ${reference}` : ''}: ${supplier} · $${amountUSD.toFixed(2)} · ${reason}`,
      operator: this.currentUser?.name ?? ''
    });

    // SEC-05: Audit trail para nota de ajuste de compra
    await this.addAuditEntry('PURCHASES', `PURCHASE_${type}_NOTE`, 
      `Nota ${type}: ${supplier} | $${amountUSD.toFixed(2)} | Ref: ${reference || 'N/A'} | Motivo: ${reason} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    await this.init();

    return {
      noteId: noteDoc.id,
      type,
      supplier,
      amountUSD,
      apEntryId: adjustedAPEntryId,
      createdAPEntryId,
      supportsUploadError: upload.supportsUploadError ?? ''
    };
  }

  async registerManufacturing(input: ManufacturingInput): Promise<ManufacturingResult> {
    const outputSku = String(input?.outputSku ?? '').trim().toUpperCase();
    const outputBatch = String(input?.outputBatch ?? '').trim().toUpperCase();
    const outputWarehouse = String(input?.outputWarehouse ?? 'Pesa D2').trim() || 'Pesa D2';
    const outputStatus = String(input?.outputStatus ?? 'QUARANTINE').trim().toUpperCase() === 'RELEASED' ? 'RELEASED' : 'QUARANTINE';
    const reference = String(input?.reference ?? '').trim().toUpperCase();
    const notes = String(input?.notes ?? '').trim();
    const wasteReason = String(input?.wasteReason ?? '').trim();
    const outputQty = Number(input?.outputQty ?? 0) || 0;
    const operatingCostUSD = roundMoney(Number(input?.operatingCostUSD ?? 0) || 0);
    const expiryDate = input?.expiryDate instanceof Date ? input.expiryDate : new Date(input?.expiryDate as any);
    const productionDate = input?.productionDate instanceof Date ? input.productionDate : (input?.productionDate ? new Date(input.productionDate as any) : new Date());
    const rawComponents = Array.isArray(input?.components) ? input.components : [];

    if (!outputSku) throw new Error('Debe seleccionar el producto terminado.');
    if (!outputBatch) throw new Error('Debe indicar el lote del producto terminado.');
    if (!Number.isFinite(outputQty) || outputQty <= 0) throw new Error('La cantidad fabricada debe ser mayor a cero.');
    if (!Number.isFinite(operatingCostUSD) || operatingCostUSD < 0) throw new Error('El costo operativo no es válido.');
    if (!(expiryDate instanceof Date) || Number.isNaN(expiryDate.getTime())) throw new Error('La fecha de caducidad del producto terminado no es válida.');
    if (!(productionDate instanceof Date) || Number.isNaN(productionDate.getTime())) throw new Error('La fecha de fabricación no es válida.');

    const outputProduct = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === outputSku);
    if (!outputProduct) throw new Error('El producto terminado seleccionado ya no existe en el catálogo.');

    const normalizedMap = new Map<string, ManufacturingComponentInput>();
    for (const component of rawComponents) {
      const sku = String(component?.sku ?? '').trim().toUpperCase();
      const warehouse = String(component?.warehouse ?? '').trim();
      const qty = Number(component?.qty ?? 0) || 0;
      if (!sku || !warehouse || !Number.isFinite(qty) || qty <= 0) continue;
      const key = `${sku}__${warehouse}`;
      const existing = normalizedMap.get(key);
      normalizedMap.set(key, {
        sku,
        warehouse,
        qty: Number((Number(existing?.qty ?? 0) + qty).toFixed(3))
      });
    }

    const components = Array.from(normalizedMap.values());
    if (components.length === 0) throw new Error('Debe indicar al menos un insumo para fabricar.');
    if (components.some((component) => component.sku === outputSku)) {
      throw new Error('El producto terminado no puede consumirse como su propio insumo.');
    }

    const consumptionPlans: Array<{
      component: ManufacturingComponentInput;
      description: string;
      totalCostUSD: number;
      segments: Array<{ id: string; previousQty: number; consumedQty: number; costUSD: number; expiryDate: string; }>;
    }> = [];

    for (const component of components) {
      const componentProduct = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === component.sku);
      if (!componentProduct) {
        throw new Error(`El insumo ${component.sku} ya no existe en el catálogo.`);
      }

      const { data: batches, error } = await supabase.from('inventory_batches')
        .select('*')
        .eq('product_code', component.sku)
        .eq('warehouse', component.warehouse)
        .gt('quantity', 0)
        .order('expiry_date', { ascending: true });

      if (error) {
        throw new Error(String(error?.message ?? `No se pudo consultar el stock del insumo ${component.sku}.`));
      }

      const available = (batches || []).reduce((sum, batch) => sum + (Number((batch as any)?.quantity ?? 0) || 0), 0);
      if (available + 0.0001 < component.qty) {
        throw new Error(`El insumo ${component.sku} no tiene disponibilidad suficiente en ${component.warehouse}.`);
      }

      let remaining = component.qty;
      const segments: Array<{ id: string; previousQty: number; consumedQty: number; costUSD: number; expiryDate: string; }> = [];
      let totalCostUSD = 0;

      for (const batch of batches || []) {
        if (remaining <= 0.0001) break;
        const previousQty = Number((batch as any)?.quantity ?? 0) || 0;
        const consumedQty = Math.min(previousQty, remaining);
        if (consumedQty <= 0) continue;
        const costUSD = Number((batch as any)?.cost_usd ?? 0) || 0;
        segments.push({
          id: String((batch as any)?.id ?? ''),
          previousQty,
          consumedQty,
          costUSD,
          expiryDate: String((batch as any)?.expiry_date ?? '')
        });
        totalCostUSD += consumedQty * costUSD;
        remaining = Number((remaining - consumedQty).toFixed(6));
      }

      if (remaining > 0.0001) {
        throw new Error(`No se pudo completar el consumo FEFO del insumo ${component.sku}.`);
      }

      consumptionPlans.push({
        component,
        description: componentProduct.description,
        totalCostUSD: roundMoney(totalCostUSD),
        segments
      });
    }

    const totalInputQty = roundQtyValue(components.reduce((sum, component) => sum + (Number(component?.qty ?? 0) || 0), 0));
    const totalInputCostUSD = roundMoney(consumptionPlans.reduce((sum, plan) => sum + plan.totalCostUSD, 0));
    const totalProductionCostUSD = roundMoney(totalInputCostUSD + operatingCostUSD);
    const wasteQty = roundQtyValue(Math.max(0, totalInputQty - outputQty));
    const wastePct = totalInputQty > 0 ? roundMoney((wasteQty / totalInputQty) * 100) : 0;
    const unitCostUSD = roundMoney(totalProductionCostUSD / outputQty);
    if (!Number.isFinite(unitCostUSD) || unitCostUSD <= 0) {
      throw new Error('No se pudo calcular el costo unitario de fabricación.');
    }

    let createdBatchId = '';
    const revertSegments = consumptionPlans.flatMap((plan) => plan.segments);

    try {
      for (const plan of consumptionPlans) {
        for (const segment of plan.segments) {
          const nextQty = Number((segment.previousQty - segment.consumedQty).toFixed(6));
          const { error } = await supabase.from('inventory_batches').update({ quantity: nextQty }).eq('id', segment.id);
          if (error) {
            throw new Error(String(error?.message ?? `No se pudo descontar el insumo ${plan.component.sku}.`));
          }
        }
      }

      const { data: newBatch, error: newBatchError } = await this.insertInventoryBatchWithFallback({
        product_code: outputSku,
        quantity: outputQty,
        cost_usd: unitCostUSD,
        expiry_date: expiryDate.toISOString().split('T')[0],
        purchase_date: productionDate.toISOString().split('T')[0],
        warehouse: outputWarehouse,
        batch: outputBatch,
        status: outputStatus,
        supplier: 'FABRICACION INTERNA'
      });

      if (newBatchError) {
        throw new Error(String(newBatchError?.message ?? 'No se pudo registrar el lote del producto terminado.'));
      }

      createdBatchId = String((newBatch as any)?.id ?? '');

      const movementRows = [
        ...consumptionPlans.map((plan) => ({
          product_code: plan.component.sku,
          type: 'MANUFACTURE_CONSUME',
          quantity: -plan.component.qty,
          warehouse: plan.component.warehouse,
          reason: `Fabricación${reference ? ` ${reference}` : ''}: consumo para ${outputSku}`,
          operator: this.currentUser?.name ?? ''
        })),
        {
          product_code: outputSku,
          type: 'MANUFACTURE_OUT',
          quantity: outputQty,
          warehouse: outputWarehouse,
          reason: `Fabricación${reference ? ` ${reference}` : ''}: ingreso de producto terminado`,
          operator: this.currentUser?.name ?? ''
        }
      ];

      const { error: movementError } = await supabase.from('movements').insert(movementRows as any);
      if (movementError) {
        throw new Error(String(movementError?.message ?? 'No se pudo registrar la trazabilidad de fabricación.'));
      }
    } catch (manufacturingError) {
      if (createdBatchId) {
        await supabase.from('inventory_batches').delete().eq('id', createdBatchId);
      }
      for (const segment of revertSegments) {
        await supabase.from('inventory_batches').update({ quantity: segment.previousQty }).eq('id', segment.id);
      }
      throw manufacturingError;
    }

    try {
      await addDoc(collection(db, 'manufacturing_orders'), {
        outputSku,
        outputDescription: outputProduct.description,
        outputBatch,
        outputQty,
        outputWarehouse,
        outputStatus,
        outputBatchId: createdBatchId,
        totalInputQty,
        totalInputCostUSD,
        totalOperatingCostUSD: operatingCostUSD,
        totalProductionCostUSD,
        unitCostUSD,
        wasteQty,
        wastePct,
        wasteReason,
        productionDate: productionDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        reference,
        notes,
        components: consumptionPlans.map((plan) => ({
          sku: plan.component.sku,
          description: plan.description,
          warehouse: plan.component.warehouse,
          qty: plan.component.qty,
          totalCostUSD: plan.totalCostUSD,
          segments: plan.segments.map((segment) => ({
            batchId: segment.id,
            qty: segment.consumedQty,
            costUSD: segment.costUSD,
            expiryDate: segment.expiryDate
          }))
        })),
        actor: this.currentUser?.name ?? '',
        createdAt: new Date().toISOString()
      } as any);
    } catch (manufacturingMetaError) {
      console.warn('No se pudo guardar metadata de fabricación:', manufacturingMetaError);
    }

    // SEC-05: Audit trail para fabricación
    await this.addAuditEntry('INVENTORY', 'MANUFACTURING', 
      `Fabricación: ${outputSku} | Lote: ${outputBatch} | ${outputQty} unidades | Costo: $${unitCostUSD.toFixed(2)} | Insumos: ${components.length} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    await this.init();

    return {
      batchId: createdBatchId,
      outputSku,
      outputBatch,
      outputQty,
      totalInputCostUSD,
      totalOperatingCostUSD: operatingCostUSD,
      totalProductionCostUSD,
      unitCostUSD,
      wasteQty,
      wastePct,
      outputStatus,
      consumedComponents: components.length
    };
  }

  async getBankTransactions(input?: {
    bankId?: string;
    bankName?: string;
    take?: number;
  }): Promise<Array<BankTransactionRecord & { id: string }>> {
    const requestedTake = Number(input?.take ?? 0) || 0;
    const take = requestedTake > 0 ? Math.max(1, Math.min(1000, requestedTake)) : 0;
    const bankId = String(input?.bankId ?? '').trim();
    const bankName = String(input?.bankName ?? '').trim();
    const constraints: any[] = [];

    if (bankId) constraints.unshift(where('bankId', '==', bankId));
    else if (bankName) constraints.unshift(where('bankName', '==', bankName));

    const q = query(collection(db, 'bank_transactions'), ...constraints);
    const snap = await getDocs(q);
    const rows = snap.docs
      .map(d => ({
        id: d.id,
        ...(d.data() as any)
      }))
      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));

    const purchaseSourceIds = Array.from(new Set(
      rows
        .filter((row: any) => String(row?.source ?? '').trim().toUpperCase() === 'PURCHASE_PAYMENT')
        .map((row: any) => String(row?.sourceId ?? '').trim())
        .filter(Boolean)
    ));

    const purchaseTraceBySourceId = new Map<string, ReturnType<DataService['buildPurchaseTraceMetadata']>>();
    for (const sourceId of purchaseSourceIds) {
      const purchaseRows = await this.getPurchaseEntriesByInvoiceGroupId(sourceId);
      if (purchaseRows.length === 0) continue;
      purchaseTraceBySourceId.set(sourceId, this.buildPurchaseTraceMetadata(purchaseRows));
    }

    return rows
      .map((row: any) => {
        if (String(row?.source ?? '').trim().toUpperCase() !== 'PURCHASE_PAYMENT') return row;
        const trace = purchaseTraceBySourceId.get(String(row?.sourceId ?? '').trim());
        if (!trace) return row;
        return {
          ...row,
          customerName: String(row?.customerName ?? '').trim() || trace.supplier,
          saleCorrelativo: String(row?.saleCorrelativo ?? '').trim() || trace.invoiceNumber,
          supports: Array.isArray(row?.supports) && row.supports.length > 0 ? row.supports : trace.supports,
          purchaseInvoiceGroupId: String(row?.purchaseInvoiceGroupId ?? '').trim() || trace.invoiceGroupId,
          purchaseInvoiceNumber: String(row?.purchaseInvoiceNumber ?? '').trim() || trace.invoiceNumber,
          purchaseInvoiceDate: String(row?.purchaseInvoiceDate ?? '').trim() || trace.invoiceDate,
          purchaseInvoiceDueDate: String(row?.purchaseInvoiceDueDate ?? '').trim() || trace.invoiceDueDate,
          purchaseSupplierDocument: String(row?.purchaseSupplierDocument ?? '').trim() || trace.supplierDocument,
          purchaseWarehouse: String(row?.purchaseWarehouse ?? '').trim() || trace.warehouse,
          purchaseBatches: Array.isArray(row?.purchaseBatches) && row.purchaseBatches.length > 0 ? row.purchaseBatches : trace.batches,
          purchaseLineCount: Number(row?.purchaseLineCount ?? 0) || trace.linesCount
        };
      })
      .slice(0, take || undefined);
  }

  private resolveBankIdByName(name: string): string | undefined {
    const n = String(name ?? '').trim().toUpperCase();
    if (!n) return undefined;
    const found = (this.banks || []).find(b => String(b.name ?? '').trim().toUpperCase() === n);
    return found?.id;
  }

  private async init(force: boolean = false): Promise<void> {
    // BUG-06 FIX: Evitar recargas muy frecuentes con debounce
    const now = Date.now();
    if (!force && (now - this.lastInitTime) < this.INIT_DEBOUNCE_MS) {
      // Solo notificar a listeners sin recargar desde BD
      this.notify();
      return;
    }
    
    // Si ya hay una inicialización en progreso, esperarla
    if (this.initPromise) {
      return this.initPromise;
    }
    
    this.initPromise = this._doInit();
    try {
      await this.initPromise;
      this.lastInitTime = Date.now();
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInit(): Promise<void> {
    let purchaseEntriesByBatchId = new Map<string, any>();
    try {
      const purchaseSnap = await getDocs(collection(db, 'purchase_entries'));
      purchaseEntriesByBatchId = new Map(
        purchaseSnap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .filter((row: any) => String(row?.batchId ?? '').trim())
          .map((row: any) => [String(row.batchId).trim(), row])
      );
    } catch (purchaseTraceError) {
      console.warn('No se pudo cargar metadata de compras para inventario:', purchaseTraceError);
    }

    // 1. Cargar productos y sus lotes desde Supabase
    const { data: pData, error: pError } = await supabase
      .from('products')
      .select('*, inventory_batches(*)');

    if (pError) {
      console.error('Error cargando productos:', pError);
    } else if (pData) {
      const mapBatch = (b: any, purchaseMeta: any, p: any) => ({
        id: b.id,
        sku: b.product_code,
        qty: Number(b.quantity),
        expiry: new Date(b.expiry_date),
        warehouse: String(purchaseMeta?.warehouse ?? b.warehouse ?? ''),
        costUSD: Number(b.cost_usd),
        batch: String(purchaseMeta?.batch ?? b.batch ?? '') || undefined,
        status: String(purchaseMeta?.status ?? b.status ?? '') || undefined,
        supplier: String(purchaseMeta?.supplier ?? b.supplier ?? '') || undefined,
        paymentType: purchaseMeta?.paymentType === 'CREDIT' ? 'CREDIT' : (purchaseMeta?.paymentType === 'CASH' ? 'CASH' : undefined),
        invoiceImage: Array.isArray(purchaseMeta?.supports) && purchaseMeta.supports.length > 0 ? String(purchaseMeta.supports[0]?.url ?? '') : undefined,
        purchaseEntryId: String(purchaseMeta?.id ?? '') || undefined,
        invoiceGroupId: String(purchaseMeta?.invoiceGroupId ?? '') || undefined,
        invoiceNumber: String(purchaseMeta?.invoiceNumber ?? '') || undefined,
        invoiceDate: String(purchaseMeta?.invoiceDate ?? '') || undefined,
        invoiceDueDate: String(purchaseMeta?.invoiceDueDate ?? '') || undefined,
        supplierDocument: String(purchaseMeta?.supplierDocument ?? '') || undefined,
        supplierPhone: String(purchaseMeta?.supplierPhone ?? '') || undefined,
        supplierAddress: String(purchaseMeta?.supplierAddress ?? '') || undefined,
        totalInvoiceUSD: Number(purchaseMeta?.totalInvoiceUSD ?? 0) || undefined,
        totalLineUSD: Number(purchaseMeta?.totalLineUSD ?? 0) || undefined,
        unit: String(purchaseMeta?.unit ?? p.unit ?? '') || undefined,
        lineNumber: Number(purchaseMeta?.lineNumber ?? 0) || undefined,
        linesCount: Number(purchaseMeta?.linesCount ?? 0) || undefined,
        entryDate: String(purchaseMeta?.createdAt ?? purchaseMeta?.invoiceDate ?? b.purchase_date ?? '') || undefined,
        supports: Array.isArray(purchaseMeta?.supports) ? purchaseMeta.supports : []
      });
      const mapProduct = (p: any) => {
        const basePrice = Number(p.price_usd);
        return {
          code: p.code,
          description: p.description,
          unit: p.unit,
          priceUSD: basePrice,
          prices: [
            basePrice,
            basePrice * 0.95,
            basePrice * 0.90,
            basePrice * 0.85,
            basePrice * 0.80
          ],
          min: Number(p.min_stock),
          conversionRatio: Number(p.conversion_ratio),
          baseUnit: p.base_unit,
          lotes: (p.inventory_batches || []).map((b: any) => {
            const purchaseMeta = purchaseEntriesByBatchId.get(String(b?.id ?? '').trim()) ?? null;
            return mapBatch(b, purchaseMeta, p);
          })
        };
      };
      // Todos los productos sin filtro (para compras/inventario)
      this.allProducts = pData.map(mapProduct);
      // Solo productos del catálogo activo (para ventas)
      this.products = pData
        .filter((p: any) => CURRENT_PRODUCT_CATALOG.has(normalizeCatalogDescription(String(p?.description ?? ''))))
        .map(p => {
          const basePrice = Number(p.price_usd);
          return {
            code: p.code,
            description: p.description,
            unit: p.unit,
            priceUSD: basePrice,
            prices: [
              basePrice,
              basePrice * 0.95, // P2 (-5%)
              basePrice * 0.90, // P3 (-10%)
              basePrice * 0.85, // P4 (-15%)
              basePrice * 0.80  // P5 (-20%)
            ],
            min: Number(p.min_stock),
            conversionRatio: Number(p.conversion_ratio),
            baseUnit: p.base_unit,
            lotes: (p.inventory_batches || []).map((b: any) => {
              const purchaseMeta = purchaseEntriesByBatchId.get(String(b?.id ?? '').trim()) ?? null;
              return {
                id: b.id,
                sku: b.product_code,
                qty: Number(b.quantity),
                expiry: new Date(b.expiry_date),
                warehouse: String(purchaseMeta?.warehouse ?? b.warehouse ?? ''),
                costUSD: Number(b.cost_usd),
                batch: String(purchaseMeta?.batch ?? b.batch ?? '') || undefined,
                status: String(purchaseMeta?.status ?? b.status ?? '') || undefined,
                supplier: String(purchaseMeta?.supplier ?? b.supplier ?? '') || undefined,
                paymentType: purchaseMeta?.paymentType === 'CREDIT' ? 'CREDIT' : (purchaseMeta?.paymentType === 'CASH' ? 'CASH' : undefined),
                invoiceImage: Array.isArray(purchaseMeta?.supports) && purchaseMeta.supports.length > 0 ? String(purchaseMeta.supports[0]?.url ?? '') : undefined,
                purchaseEntryId: String(purchaseMeta?.id ?? '') || undefined,
                invoiceGroupId: String(purchaseMeta?.invoiceGroupId ?? '') || undefined,
                invoiceNumber: String(purchaseMeta?.invoiceNumber ?? '') || undefined,
                invoiceDate: String(purchaseMeta?.invoiceDate ?? '') || undefined,
                invoiceDueDate: String(purchaseMeta?.invoiceDueDate ?? '') || undefined,
                supplierDocument: String(purchaseMeta?.supplierDocument ?? '') || undefined,
                supplierPhone: String(purchaseMeta?.supplierPhone ?? '') || undefined,
                supplierAddress: String(purchaseMeta?.supplierAddress ?? '') || undefined,
                totalInvoiceUSD: Number(purchaseMeta?.totalInvoiceUSD ?? 0) || undefined,
                totalLineUSD: Number(purchaseMeta?.totalLineUSD ?? 0) || undefined,
                unit: String(purchaseMeta?.unit ?? p.unit ?? '') || undefined,
                lineNumber: Number(purchaseMeta?.lineNumber ?? 0) || undefined,
                linesCount: Number(purchaseMeta?.linesCount ?? 0) || undefined,
                entryDate: String(purchaseMeta?.createdAt ?? purchaseMeta?.invoiceDate ?? b.purchase_date ?? '') || undefined,
                supports: Array.isArray(purchaseMeta?.supports) ? purchaseMeta.supports : []
              };
            })
          };
        });
    }

    // 2. Cargar ventas
    const { data: sData, error: sError } = await supabase
      .from('sales')
      .select('*')
      .order('date', { ascending: false });

    if (sData) {
      this.sales = sData.map(s => mapSupabaseSaleRowToHistoryEntry(s));

      // --- FIX: Buscar el último correlativo para no chocar ---
      const counters = sData.reduce((acc, s) => {
        const correlativo = String(s.correlativo ?? '').trim().toUpperCase();
        const parts = correlativo.split('-');
        const n = parts.length > 1 ? parseInt(parts[1]) : 0;
        if (!Number.isFinite(n)) return acc;
        if (correlativo.startsWith('C-')) {
          acc.credit = Math.max(acc.credit, n);
        } else {
          acc.standard = Math.max(acc.standard, n);
        }
        return acc;
      }, { standard: 0, credit: 0 });
      this.nextCorrelativo = counters.standard + 1;
      this.nextCreditCorrelativo = counters.credit + 1;
    }

    // 3. Cargar movimientos (tabla histórica `movements` — ventas, ajustes, etc.)
    const { data: mData } = await supabase
      .from('movements')
      .select('*')
      .order('date', { ascending: false })
      .limit(200);

    this.movements = mData
      ? mData.map(m => ({
          id: m.id.toString(),
          type: m.type,
          sku: m.product_code,
          qty: Number(m.quantity),
          user: m.operator,
          timestamp: new Date(m.date || new Date()),
          warehouse: m.warehouse,
          reason: m.reason || ''
        }))
      : [];

    // 3b. Kardex / trazabilidad: devoluciones y otros mov. en `inventory_movements` (no están en `movements`)
    this.inventoryLedgerMovements = [];
    try {
      const { data: invRows, error: invErr } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5000);
      if (!invErr && invRows && invRows.length > 0) {
        for (const row of invRows as any[]) {
          const mapped = this.mapSupabaseInventoryMovementRow(row);
          if (mapped) this.inventoryLedgerMovements.push(mapped);
        }
      }
    } catch (e) {
      console.warn('inventory_movements: no se pudo cargar (Kardex sin devoluciones detalladas):', e);
    }

    // 4. Suscribirse a cambios en tiempo real
    if (!this.supabaseSubscribed) {
      supabase
        .channel('db-all-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movements' }, () => this.init())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_movements' }, () => this.init())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => this.init())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => this.init())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'ap_entries' }, () => this.init())
        .subscribe();
      this.supabaseSubscribed = true;
    }

    // 5. Cargar Expenses desde Firestore
    try {
      const expSnap = await getDocs(query(collection(db, 'expenses'), orderBy('timestamp', 'desc'), limit(500)));
      this.expenses = expSnap.docs.map(d => {
        const e = d.data();
        return {
          id: String(e.id ?? d.id),
          timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
          description: String(e.description ?? ''),
          amountUSD: Number(e.amountUSD ?? e.amount_usd ?? 0),
          amountVES: Number(e.amountVES ?? 0) || undefined,
          currency: (e.currency === 'VES' ? 'VES' : 'USD') as 'USD' | 'VES',
          category: (e.category ?? 'OTRO') as ExpenseCategory,
          supplier: e.supplier ?? undefined,
          paymentMethod: e.paymentMethod ?? undefined,
          reference: e.reference ?? undefined,
          status: (e.status === 'VOID' ? 'VOID' : 'ACTIVE') as 'ACTIVE' | 'VOID',
          voidReason: e.voidReason ?? undefined,
          voidedAt: e.voidedAt ?? undefined,
          voidedBy: e.voidedBy ?? undefined,
          createdBy: e.createdBy ?? undefined,
          budgetMonth: e.budgetMonth ?? undefined
        };
      });
    } catch (_expErr) {
      // fallback: Supabase
      const { data: expData } = await supabase.from('expenses').select('*');
      if (expData) {
        this.expenses = expData.map(e => ({
          id: e.id, timestamp: new Date(e.timestamp), description: e.description,
          amountUSD: Number(e.amount_usd ?? 0), currency: 'USD' as const, category: 'OTRO' as ExpenseCategory, status: 'ACTIVE' as const
        }));
      }
    }

    // 6. Cargar AP desde Supabase
    const { data: apData } = await supabase.from('ap_entries').select('*').order('timestamp', { ascending: false });
    if (apData) {
      this.apEntries = apData.map(ap => ({
        id: ap.id,
        timestamp: new Date(ap.timestamp),
        supplier: ap.supplier,
        // Eliminado supplier_id por no existir en esquema DB
        description: ap.description,
        amountUSD: Number(ap.amount_usd),
        balanceUSD: Number(ap.balance_usd),
        dueDate: new Date(ap.due_date),
        status: ap.status as any
      }));
    }

    // 7b. Cargar Notas de Crédito (devoluciones) desde Firestore
    if (!this.creditNotesUnsubscribe) {
      const qCN = query(collection(db, 'credit_notes'), orderBy('createdAt', 'desc'));
      this.creditNotesUnsubscribe = onSnapshot(
        qCN,
        (snap) => {
          this.creditNotes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          this.notify();
        },
        (error) => {
          console.error('Error cargando notas de crédito desde Firestore:', error);
        }
      );
    }

    // 7c. Cargar Anticipos de Clientes desde Firestore
    if (!this.clientAdvancesUnsubscribe) {
      const qCA = query(collection(db, 'client_advances'), orderBy('createdAt', 'desc'));
      this.clientAdvancesUnsubscribe = onSnapshot(
        qCA,
        (snap) => {
          this.clientAdvances = snap.docs.map(d => {
            const data: any = d.data();
            return {
              id: (data.id ?? d.id) as string,
              customerId: String(data.customerId ?? ''),
              customerName: String(data.customerName ?? ''),
              amountUSD: Number(data.amountUSD ?? 0),
              balanceUSD: Number(data.balanceUSD ?? 0),
              currency: (data.currency ?? 'USD') as 'USD' | 'VES',
              originalAmountVES: Number(data.originalAmountVES ?? 0),
              rateAtCreation: Number(data.rateAtCreation ?? 0),
              status: (data.status ?? 'AVAILABLE') as 'AVAILABLE' | 'APPLIED' | 'PARTIAL',
              originInvoiceId: String(data.originInvoiceId ?? ''),
              originCorrelativo: String(data.originCorrelativo ?? ''),
              createdAt: String(data.createdAt ?? new Date().toISOString()),
              updatedAt: String(data.updatedAt ?? new Date().toISOString()),
              note: String(data.note ?? '')
            };
          });
          this.notify();
        },
        (error) => {
          console.error('Error cargando anticipos de clientes desde Firestore:', error);
        }
      );
    }

    // 7. Cargar AR desde Firestore
    if (!this.arUnsubscribe) {
      const q = query(collection(db, 'ar_entries'), orderBy('timestamp', 'desc'));
      this.arUnsubscribe = onSnapshot(
        q,
        (snap) => {
          this.arEntries = snap.docs.map(d => {
            const ar: any = d.data();
            return {
              id: (ar.id ?? d.id) as string,
              timestamp: new Date(ar.timestamp ?? new Date().toISOString()),
              customerName: (ar.customerName ?? ar.customer_name ?? '') as string,
              customerId: (ar.customerId ?? ar.customer_id ?? '') as string,
              description: (ar.description ?? '') as string,
              amountUSD: Number(ar.amountUSD ?? ar.amount_usd ?? 0),
              balanceUSD: Number(ar.balanceUSD ?? ar.balance_usd ?? 0),
              dueDate: new Date(ar.dueDate ?? ar.due_date ?? new Date().toISOString()),
              status: (ar.status ?? 'PENDING') as any,
              saleCorrelativo: (ar.saleCorrelativo ?? ar.sale_correlativo ?? '') as string,
              lateFeeUSD: Number(ar.lateFeeUSD ?? 0),
              penaltyAppliedAt: ar.penaltyAppliedAt ?? undefined
            };
          });
          void this.applyOverduePenalties();
          this.notify();
        },
        (error) => {
          console.error('Error cargando AR desde Firestore:', error);
        }
      );
    }

    // 8. Cargar Usuarios desde Supabase con listener en tiempo real
    this.ensureUsersRealtimeSync();

    // 9. Construir Live Feed Unificado (Audit Log)
    const logs: AuditEntry[] = [];
    const saleItemsMap = new Map<string, string[]>();

    // Inventario
    // INV_INGRESO: movimientos que SIEMPRE suman stock
    // INV_EGRESO: movimientos que SIEMPRE restan stock
    // PURCHASE_RETURN (devolución a proveedor) = EGRESO: sale mercancía del almacén
    // VOID (anulación venta) = INGRESO: regresa el stock despachado
    // ADJUST/AJUSTE/TRANSFER: signo variable, se resuelve con el signo de qty más abajo
    const INV_INGRESO = new Set(['IN', 'PURCHASE', 'SALE_RETURN', 'MANUFACTURING', 'VOID', 'ADJUSTMENT_IN']);
    const INV_EGRESO  = new Set(['OUT', 'SALE', 'WASTE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'PURCHASE_RETURN', 'FRACTION']);
    this.movements.forEach(m => {
      const product = this.products.find(p => p.code === m.sku);
      const description = product ? product.description : m.sku;
      const unit = product ? product.unit : 'UND';
      const label = m.reason ? `${m.reason}` : `${m.type}`;
      const isMovement = Math.abs(m.qty) > 0.0001;
      const mType = String(m.type ?? '').toUpperCase();
      const invFlowType = INV_INGRESO.has(mType) || m.qty > 0
        ? 'INGRESO'
        : INV_EGRESO.has(mType) || m.qty < 0
          ? 'EGRESO'
          : 'NEUTRO';
      const subTypeLabels: Record<string, string> = {
        IN: 'Entrada de inventario', OUT: 'Salida de inventario',
        SALE: 'Despacho por venta', SALE_RETURN: 'Devolución de venta',
        PURCHASE: 'Entrada por compra', PURCHASE_RETURN: 'Devolución a proveedor',
        MANUFACTURING: 'Producción/Fabricación', TRANSFER: 'Traslado entre almacenes',
        ADJUSTMENT_IN: 'Ajuste positivo', ADJUSTMENT_OUT: 'Ajuste negativo',
        BATCH_ADJUST: 'Ajuste de lote', WASTE: 'Merma/Pérdida'
      };
      const subType = subTypeLabels[mType] ?? mType;

      const corrMatch = (m.reason || '').match(/(G-|C-)\d+/i);
      if (corrMatch && isMovement) {
        const corr = corrMatch[0].toUpperCase();
        const itemLine = `${Math.abs(m.qty)} ${unit} ${description}`;
        if (!saleItemsMap.has(corr)) saleItemsMap.set(corr, []);
        saleItemsMap.get(corr)!.push(itemLine);
      }

      // Para compras (IN), mostrar número de factura en lugar del código de producto
      // El reason tiene formato: "Compra <FACTURA> · <PROVEEDOR> · Item N/N ..."
      let entityRef = m.sku;
      if (mType === 'IN' || mType === 'PURCHASE') {
        const invoiceMatch = (m.reason || '').match(/^Compra\s+(\S+)/i);
        if (invoiceMatch) entityRef = invoiceMatch[1].replace(/·$/, '').trim();
      }

      logs.push({
        id: m.id,
        timestamp: m.timestamp,
        actor: m.user,
        action: 'INVENTARIO',
        entity: entityRef,
        details: isMovement
          ? `${label}: ${Math.abs(m.qty)} ${unit} DE ${description} EN ${m.warehouse}`
          : `${label}: ${m.reason || m.sku}`,
        hash: m.id.slice(0, 8).toUpperCase(),
        flowType: invFlowType,
        subType
      } as any);
    });

    // Facturación
    this.sales.forEach(s => {
      const relatedItems = saleItemsMap.get(s.correlativo.toUpperCase()) || [];
      const itemsSummary = relatedItems.length > 0
        ? ` [${relatedItems.join('; ')}]`
        : '';

      const payments: any[] = (s as any).payments ?? [];
      const totalChangeUSD = payments.reduce((acc: number, p: any) => {
        if (p.cashChangeGiven && p.cashChangeMethod) {
          const rate = Number(p.cashChangeRate ?? p.exchangeRate ?? 1);
          return acc + (p.cashChangeMethod === 'efectivo_bs' || p.cashChangeMethod === 'bs'
            ? Number(p.cashChangeGiven ?? 0) / (rate || 1)
            : Number(p.cashChangeGiven ?? 0));
        }
        return acc;
      }, 0);
      const netUSD = s.totalUSD - totalChangeUSD;
      const netLabel = totalChangeUSD > 0.005
        ? `$${netUSD.toFixed(2)} neto (vuelto $${totalChangeUSD.toFixed(2)})`
        : `$${s.totalUSD.toFixed(2)}`;
      logs.push({
        id: s.id,
        timestamp: s.timestamp,
        actor: (s as any).operator || 'SISTEMA',
        action: 'FACTURACION',
        entity: s.correlativo,
        details: `Venta: ${s.client.name} - ${netLabel}${itemsSummary}`,
        hash: s.id.slice(0, 8).toUpperCase(),
        flowType: 'INGRESO',
        subType: 'Ingreso por venta'
      } as any);
    });

    // Notas de crédito (devoluciones de venta)
    this.creditNotes.forEach((cn: any) => {
      if (!cn.amountUSD) return;
      logs.push({
        id: cn.id,
        timestamp: new Date(cn.createdAt ?? Date.now()),
        actor: cn.authorizedBy ?? 'SISTEMA',
        action: 'DEVOLUCION',
        entity: cn.correlativo,
        details: `Devolución NC ${cn.correlativo} — ${cn.clientName ?? cn.clientId} — $${Number(cn.amountUSD).toFixed(2)} | Método: ${cn.refundMethod ?? ''} | Motivo: ${cn.reason ?? ''}`,
        hash: String(cn.id ?? '').slice(0, 8).toUpperCase(),
        flowType: 'EGRESO',
        subType: 'Devolución de venta'
      } as any);
    });

    // Finanzas (Gastos/Retiros)
    this.expenses.forEach(e => {
      logs.push({
        id: e.id,
        timestamp: e.timestamp,
        actor: 'Operador',
        action: 'FINANZAS',
        entity: e.category,
        details: `Egreso operativo: ${e.description} - $${e.amountUSD.toFixed(2)}`,
        hash: e.id.slice(0, 8).toUpperCase(),
        flowType: 'EGRESO',
        subType: 'Gasto operativo'
      } as any);
    });

    // Compras / AP
    this.apEntries.forEach(ap => {
      logs.push({
        id: ap.id,
        timestamp: ap.timestamp,
        actor: 'Admin',
        action: 'COMPRA',
        entity: ap.supplier,
        details: `Compra: ${ap.description} - $${ap.amountUSD.toFixed(2)}`,
        hash: ap.id.slice(0, 8).toUpperCase(),
        flowType: 'EGRESO',
        subType: 'Compra a proveedor'
      } as any);
    });

    // Cuentas por Cobrar
    this.arEntries.forEach(ar => {
      logs.push({
        id: ar.id,
        timestamp: ar.timestamp,
        actor: 'Admin',
        action: 'CXC',
        entity: ar.customerName,
        details: `Cargo CxC: ${ar.description} - $${ar.amountUSD.toFixed(2)}`,
        hash: ar.id.slice(0, 8).toUpperCase(),
        flowType: 'INGRESO',
        subType: 'Cuenta por cobrar'
      } as any);
    });

    // Ordenar por fecha (descendente) y limitar a los últimos 50
    this.auditLog = logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()).slice(0, 50);

    this.notify();
  }

  async getARPayments(arId: string): Promise<Array<ARPaymentRecord & { id: string }>> {
    const id = String(arId || '').trim();
    if (!id) return [];
    const q = query(collection(db, 'ar_entries', id, 'payments'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));
  }

  async getAPEntryDetail(apId: string): Promise<APEntryDetail | null> {
    const id = String(apId || '').trim();
    if (!id) return null;

    let entry = this.apEntries.find(e => e.id === id);
    if (!entry) {
      const { data, error } = await supabase.from('ap_entries').select('*').eq('id', id).maybeSingle();
      if (error || !data) return null;
      entry = {
        id,
        timestamp: new Date((data as any)?.timestamp ?? new Date().toISOString()),
        supplier: String((data as any)?.supplier ?? ''),
        description: String((data as any)?.description ?? ''),
        amountUSD: Number((data as any)?.amount_usd ?? (data as any)?.amountUSD ?? 0) || 0,
        balanceUSD: Number((data as any)?.balance_usd ?? (data as any)?.balanceUSD ?? 0) || 0,
        dueDate: new Date((data as any)?.due_date ?? (data as any)?.dueDate ?? new Date().toISOString()),
        status: (((data as any)?.status ?? 'PENDING') as any)
      };
    }

    const purchaseSnap = await getDocs(query(collection(db, 'purchase_entries'), where('apEntryId', '==', id)));
    const docs = purchaseSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    docs.sort((a: any, b: any) => Number(a?.lineNumber ?? 0) - Number(b?.lineNumber ?? 0));
    const first = docs[0] as any;

    return {
      apId: id,
      supplier: String(entry?.supplier ?? ''),
      description: String(entry?.description ?? ''),
      amountUSD: Number(entry?.amountUSD ?? 0) || 0,
      balanceUSD: Number(entry?.balanceUSD ?? 0) || 0,
      dueDate: entry?.dueDate ? entry.dueDate.toISOString() : '',
      status: (entry?.status ?? 'PENDING') as any,
      invoiceGroupId: String(first?.invoiceGroupId ?? ''),
      invoiceNumber: String(first?.invoiceNumber ?? ''),
      invoiceDate: String(first?.invoiceDate ?? ''),
      invoiceDueDate: String(first?.invoiceDueDate ?? ''),
      supplierDocument: String(first?.supplierDocument ?? ''),
      supplierPhone: String(first?.supplierPhone ?? ''),
      supplierAddress: String(first?.supplierAddress ?? ''),
      supports: Array.isArray(first?.supports) ? first.supports : [],
      lines: docs.map((row: any) => ({
        id: String(row?.id ?? ''),
        lineNumber: Number(row?.lineNumber ?? 0) || 0,
        sku: String(row?.sku ?? ''),
        productDescription: String(row?.productDescription ?? ''),
        qty: Number(row?.qty ?? 0) || 0,
        unit: String(row?.unit ?? ''),
        costUSD: Number(row?.costUSD ?? 0) || 0,
        totalLineUSD: Number(row?.totalLineUSD ?? 0) || 0,
        batch: String(row?.batch ?? ''),
        expiryDate: String(row?.expiryDate ?? ''),
        warehouse: String(row?.warehouse ?? '')
      }))
    };
  }

  async getAPPayments(apId: string): Promise<Array<APPaymentRecord & { id: string }>> {
    const id = String(apId || '').trim();
    if (!id) return [];
    const q = query(collection(db, 'ap_entries', id, 'payments'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({
      id: d.id,
      ...(d.data() as any)
    }));
  }

  getUsers() { return this.users; }

  ensureUsersRealtimeSync() {
    if (this.usersRealtimeChannel) return;
    const mapUser = (id: string, u: any): User => ({
      id,
      name: u.name ?? '',
      email: u.email ?? undefined,
      role: (u.role ?? 'CAJERO') as UserRole,
      pin: u.pin ?? '',
      permissions: this.normalizePermissions(
        Array.isArray(u.permissions) ? u.permissions : (typeof u.permissions === 'string' ? JSON.parse(u.permissions) : []),
        (u.role ?? 'CAJERO') as UserRole
      ),
      active: u.active ?? true,
      firebaseUid: u.firebaseUid ?? u.firebase_uid ?? undefined
    });
    const applyUsers = (docs: { id: string; data: () => any }[]) => {
      this.users = docs.map(d => mapUser(d.id, d.data()));
      this.notify();
    };
    // Carga inmediata sin esperar al listener
    getDocs(collection(db, 'users')).then(snap => applyUsers(snap.docs)).catch(console.error);
    // Listener en tiempo real de Firestore (INSERT / UPDATE / DELETE)
    this.usersRealtimeChannel = onSnapshot(
      collection(db, 'users'),
      (snap) => applyUsers(snap.docs),
      (error) => console.error('Error en listener de usuarios Firestore:', error)
    );
  }

  getBanks() { this.ensureBanksSubscription(); return this.banks; }

  private ensureBanksSubscription() {
    if (this.banksUnsubscribe) return;
    const q = query(collection(db, 'banks'), orderBy('name', 'asc'));
    this.banksUnsubscribe = onSnapshot(
      q,
      (snap) => {
        this.banks = snap.docs.map(d => {
          const b: any = d.data();
          return {
            id: (b.id ?? d.id) as string,
            name: String(b.name ?? ''),
            accounts: Array.isArray(b.accounts) ? b.accounts : [],
            supportedMethods: Array.isArray(b.supportedMethods) ? b.supportedMethods : [],
            active: b.active !== false,
            createdAt: String(b.createdAt ?? ''),
            updatedAt: String(b.updatedAt ?? '')
          } as BankEntity;
        });
        this.notify();
      },
      (error) => console.error('Error cargando bancos:', error)
    );
  }

  async upsertBank(input: {
    id?: string;
    name: string;
    accounts: BankAccount[];
    supportedMethods: string[];
    active?: boolean;
  }): Promise<string> {
    this.ensureBanksSubscription();
    this.ensurePOSTerminalsSubscription();
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('Nombre de banco requerido.');

    const normalized = name.toUpperCase().replace(/\s+/g, '_').replace(/[^A-Z0-9_]/g, '');
    const id = String(input.id ?? `BANK_${normalized}`);
    const now = new Date().toISOString();
    const docRef = doc(db, 'banks', id);

    const rawAccounts = Array.isArray(input.accounts) ? input.accounts : [];
    const accounts = rawAccounts.map(a => ({
      ...a,
      id: String(a.id ?? Math.random().toString(36).slice(2, 10)),
      label: String(a.label ?? '').trim(),
      accountNumber: String(a.accountNumber ?? '').trim(),
      currency: (a.currency === 'USD' ? 'USD' : 'VES') as any
    })).filter(a => a.label && a.accountNumber);

    const seen = new Set<string>();
    for (const a of accounts) {
      const key = `${a.currency}|${normalizeBankAccountNumber(a.accountNumber)}`;
      if (seen.has(key)) {
        throw new Error(`Cuenta duplicada dentro del banco: ${a.currency} ${a.accountNumber}`);
      }
      seen.add(key);
    }

    const conflicts: Array<{ bankName: string; currency: string; accountNumber: string }> = [];
    for (const other of this.banks) {
      if (other.id === id) continue;
      for (const oa of (other.accounts || [])) {
        const otherKey = `${oa.currency}|${normalizeBankAccountNumber(oa.accountNumber)}`;
        if (seen.has(otherKey)) {
          conflicts.push({
            bankName: other.name,
            currency: oa.currency,
            accountNumber: oa.accountNumber
          });
        }
      }
    }
    if (conflicts.length > 0) {
      const c = conflicts[0];
      throw new Error(`Esa cuenta ya existe en otro banco: ${c.bankName} (${c.currency} ${c.accountNumber})`);
    }

    const linkedTerminals = this.posTerminals.filter(t => String(t.bankId ?? '').trim() === id);
    const invalidTerminal = linkedTerminals.find(t => !accounts.some(a => String(a.id ?? '').trim() === String(t.accountId ?? '').trim()));
    if (invalidTerminal) {
      throw new Error(`La terminal POS ${invalidTerminal.name} usa una cuenta que está intentando eliminar o cambiar.`);
    }

    const bank: BankEntity = {
      id,
      name,
      accounts,
      supportedMethods: Array.isArray(input.supportedMethods) ? input.supportedMethods : [],
      active: input.active !== false,
      createdAt: now,
      updatedAt: now
    };

    const existing = this.banks.find(b => b.id === id);
    await setDoc(docRef, {
      ...bank,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    } as any, { merge: true });

    for (const terminal of linkedTerminals) {
      const account = accounts.find(a => String(a.id ?? '').trim() === String(terminal.accountId ?? '').trim());
      if (!account) continue;
      await updateDoc(doc(db, 'pos_terminals', terminal.id), {
        bankName: name,
        accountLabel: String(account.label ?? '').trim(),
        accountNumber: String(account.accountNumber ?? '').trim(),
        updatedAt: now
      } as any);
    }

    return id;
  }

  async updateBank(id: string, patch: Partial<Omit<BankEntity, 'id' | 'createdAt'>>): Promise<void> {
    this.ensureBanksSubscription();
    const bankId = String(id || '').trim();
    if (!bankId) return;
    const now = new Date().toISOString();
    await updateDoc(doc(db, 'banks', bankId), {
      ...patch,
      updatedAt: now
    } as any);
  }

  async deleteBank(id: string): Promise<void> {
    this.ensureBanksSubscription();
    this.ensurePOSTerminalsSubscription();
    const bankId = String(id || '').trim();
    if (!bankId) return;
    const linkedTerminal = this.posTerminals.find(t => String(t.bankId ?? '').trim() === bankId);
    if (linkedTerminal) {
      throw new Error(`No puede eliminar este banco porque la terminal POS ${linkedTerminal.name} está asociada a él.`);
    }
    await deleteDoc(doc(db, 'banks', bankId));
  }

  async addUser(name: string, email: string, role: UserRole, pin: string, permissions?: PermissionKey[]) {
    // 1. Crear usuario en Firebase Authentication automáticamente
    let firebaseUserId: string | null = null;
    try {
      const userCredential = await authService.createUser(email.trim().toLowerCase(), pin);
      firebaseUserId = userCredential.user.uid;
      console.log('Usuario creado en Firebase:', firebaseUserId);
    } catch (error: any) {
      console.error('Error al crear usuario en Firebase:', error);
      if (error.code === 'auth/email-already-in-use') {
        throw new Error('Este correo electrónico ya está registrado en Firebase. Use otro correo o elimine el usuario existente.');
      }
      throw new Error(`Error al crear usuario en Firebase: ${error.message}`);
    }

    // 2. Crear usuario local
    const newUser: User = {
      id: `USR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      name,
      email,
      role,
      pin,
      permissions: this.normalizePermissions(permissions, role),
      active: true,
      firebaseUid: firebaseUserId // Guardar referencia al UID de Firebase
    };

    // 3. Guardar en Firestore
    await setDoc(doc(db, 'users', newUser.id), {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      pin: newUser.pin,
      permissions: newUser.permissions,
      active: newUser.active,
      firebaseUid: firebaseUserId,
      createdAt: new Date().toISOString()
    });

    this.addAuditEntry('SECURITY', 'USER_CREATE', `Nuevo usuario creado: ${name} (${role}) - Firebase UID: ${firebaseUserId}`);
    this.postSecurityAlert('USER_CREATED', {
      targetUserId: newUser.id,
      targetUserName: newUser.name,
      actorName: this.currentUser?.name ?? 'Sistema',
      detail: `Rol: ${role} · Email: ${email}`
    });
    return newUser;
  }

  async registerExistingFirebaseUser(name: string, email: string, role: UserRole, pin: string, firebaseUid: string, permissions?: PermissionKey[]) {
    const newUser: User = {
      id: `USR-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      name: name.trim().toUpperCase(),
      email: email.trim().toLowerCase(),
      role,
      pin,
      permissions: this.normalizePermissions(permissions, role),
      active: true,
      firebaseUid
    };
    await setDoc(doc(db, 'users', newUser.id), {
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      pin: newUser.pin,
      permissions: newUser.permissions,
      active: newUser.active,
      firebaseUid,
      createdAt: new Date().toISOString()
    });
    this.addAuditEntry('SECURITY', 'USER_CREATE', `Usuario Firebase registrado en sistema: ${newUser.name} (${role}) - UID: ${firebaseUid}`);
    this.postSecurityAlert('USER_CREATED', {
      targetUserId: newUser.id,
      targetUserName: newUser.name,
      actorName: this.currentUser?.name ?? 'Sistema',
      detail: `Rol: ${role} · Email: ${email} · Vinculado`
    });
    return newUser;
  }

  async updateUserAccess(id: string, patch: { name?: string; email?: string; role?: UserRole; pin?: string; permissions?: PermissionKey[]; active?: boolean }) {
    const user = this.users.find(u => u.id === id);
    if (!user) return;
    const nextRole = patch.role ?? user.role;
    const newPin = patch.pin !== undefined ? String(patch.pin).trim() : user.pin;
    const updated: User = {
      ...user,
      name: patch.name !== undefined ? String(patch.name).trim().toUpperCase() : user.name,
      email: patch.email !== undefined ? String(patch.email).trim().toLowerCase() : user.email,
      role: nextRole,
      pin: newPin,
      permissions: patch.permissions ? this.normalizePermissions(patch.permissions, nextRole) : this.normalizePermissions(user.permissions, nextRole),
      active: patch.active ?? user.active
    };
    const firestorePayload: any = {
      name: updated.name,
      email: updated.email,
      role: updated.role,
      pin: updated.pin,
      permissions: updated.permissions,
      active: updated.active,
      updatedAt: new Date().toISOString()
    };
    // Si se cambia el PIN, manejar actualización en Firebase Auth
    if (patch.pin !== undefined) {
      const firebaseCurrentUser = auth.currentUser;
      if (firebaseCurrentUser && (firebaseCurrentUser.uid === user.firebaseUid || firebaseCurrentUser.email === user.email)) {
        // Es el usuario actualmente logueado — aplicar cambio de contraseña inmediatamente
        try {
          await authService.updateUserPassword(firebaseCurrentUser, newPin!);
          firestorePayload.passwordPending = false;
        } catch (err: any) {
          throw new Error(`Error actualizando contraseña en Firebase Auth: ${err.message}`);
        }
      } else {
        // Es otro usuario — marcar contraseña pendiente para aplicar en su próximo login
        firestorePayload.passwordPending = true;
        firestorePayload.pendingPin = newPin;
      }
    }
    await updateDoc(doc(db, 'users', id), firestorePayload);
    if (this.currentUser.id === id) {
      this.currentUser = updated;
    }
    this.addAuditEntry('SECURITY', 'USER_UPDATE', `Acceso actualizado para: ${updated.name} (${updated.role})`);
    if (patch.role !== undefined && patch.role !== user.role) {
      this.postSecurityAlert('ROLE_CHANGED', {
        targetUserId: id,
        targetUserName: updated.name,
        actorName: this.currentUser?.name ?? 'Sistema',
        detail: `${user.role} → ${patch.role}`
      });
    }
    if (patch.pin !== undefined) {
      this.postSecurityAlert('PASSWORD_CHANGED', {
        targetUserId: id,
        targetUserName: updated.name,
        actorName: this.currentUser?.name ?? 'Sistema'
      });
    }
  }

  async updateUserStatus(id: string, active: boolean) {
    const user = this.users.find(u => u.id === id);
    if (user) {
      await updateDoc(doc(db, 'users', id), { active, updatedAt: new Date().toISOString() } as any);
    }
  }

  async deleteUser(id: string) {
    if (id === this.currentUser.id) throw new Error('No puedes eliminar tu propio usuario activo');
    const user = this.users.find(u => u.id === id);
    if (!user) throw new Error('Usuario no encontrado');

    await deleteDoc(doc(db, 'users', id));
    this.addAuditEntry('SECURITY', 'USER_DELETE', `Usuario eliminado permanentemente: ${user.name} (${user.role})`);
  }

  // ─── CONTROL DE INTENTOS DE LOGIN Y BLOQUEO DE CUENTA ─────────────────────

  async getLoginLockoutStatus(email: string): Promise<{ isLocked: boolean; lockedUntil?: number; attempts?: number } | null> {
    try {
      const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      const snap = await getDoc(doc(db, 'login_lockouts', docId));
      if (!snap.exists()) return null;
      const data = snap.data() as any;
      return {
        isLocked: data?.isLocked ?? false,
        lockedUntil: data?.lockedUntil,
        attempts: data?.attempts ?? 0
      };
    } catch (e) {
      return null;
    }
  }

  async setLoginLockout(email: string, data: { isLocked: boolean; lockedUntil: number; attempts: number; lastAttempt: number }) {
    try {
      const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'login_lockouts', docId), {
        ...data,
        email: email.toLowerCase(),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Error guardando bloqueo:', e);
    }
  }

  async clearLoginLockout(email: string) {
    try {
      const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await deleteDoc(doc(db, 'login_lockouts', docId));
    } catch (e) {
      // Ignorar si no existe
    }
  }

  async recordFailedLoginAttempt(email: string, attempts: number) {
    try {
      const docId = email.toLowerCase().replace(/[^a-z0-9]/g, '_');
      await setDoc(doc(db, 'login_lockouts', docId), {
        email: email.toLowerCase(),
        attempts,
        lastAttempt: Date.now(),
        isLocked: false,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) {
      console.warn('Error registrando intento fallido:', e);
    }
  }

  async adminUnlockAccount(email: string) {
    // Solo admin puede ejecutar esto - verificación de permisos ya debe estar hecha
    await this.clearLoginLockout(email);
    this.addAuditEntry('SECURITY', 'ACCOUNT_UNLOCK', `Cuenta desbloqueada por administrador: ${email}`);
  }

  // ─── SEC-09: ALERTAS DE SEGURIDAD ────────────────────────────────────────────

  async postSecurityAlert(type: 'USER_CREATED' | 'ROLE_CHANGED' | 'PASSWORD_CHANGED', payload: {
    targetUserId: string;
    targetUserName: string;
    actorName: string;
    detail?: string;
  }) {
    try {
      await addDoc(collection(db, 'security_alerts'), {
        type,
        targetUserId: payload.targetUserId,
        targetUserName: payload.targetUserName,
        actorName: payload.actorName,
        detail: payload.detail ?? '',
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (e) {
      console.warn('No se pudo guardar alerta de seguridad:', e);
    }
  }

  async getSecurityAlerts(onlyUnread = false): Promise<Array<{
    id: string; type: string; targetUserName: string; actorName: string;
    detail: string; timestamp: string; read: boolean;
  }>> {
    try {
      const snap = await getDocs(query(
        collection(db, 'security_alerts'),
        orderBy('timestamp', 'desc'),
        limit(200)
      ));
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
      return onlyUnread ? all.filter((a: any) => !a.read) : all;
    } catch { return []; }
  }

  async markSecurityAlertRead(id: string) {
    try {
      await updateDoc(doc(db, 'security_alerts', id), { read: true });
    } catch { /* silencioso */ }
  }

  async markAllSecurityAlertsRead() {
    try {
      const snap = await getDocs(query(collection(db, 'security_alerts'), where('read', '==', false)));
      for (const d of snap.docs) await updateDoc(d.ref, { read: true });
    } catch { /* silencioso */ }
  }

  // ─── SEC-03: REGISTRO DE ACCESOS / IP / DISPOSITIVO ────────────────────────

  async recordLoginSession(data: {
    email: string;
    userId?: string;
    userName?: string;
    ip: string;
    userAgent: string;
    platform: string;
    success: boolean;
    failReason?: string;
  }) {
    try {
      const now = new Date().toISOString();
      await addDoc(collection(db, 'login_sessions'), {
        ...data,
        timestamp: now,
        date: now.split('T')[0]
      });
    } catch (e) {
      console.warn('No se pudo registrar sesión de acceso:', e);
    }
  }

  async getLoginSessions(limitCount = 100): Promise<Array<{
    id: string; email: string; userId?: string; userName?: string;
    ip: string; userAgent: string; platform: string;
    success: boolean; failReason?: string; timestamp: string; date: string;
  }>> {
    try {
      const snap = await getDocs(query(
        collection(db, 'login_sessions'),
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      ));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (e) {
      return [];
    }
  }

  // ─── SEC-06: CONTROL DE SESIONES CONCURRENTES ──────────────────────────────

  async registerActiveSession(userId: string, sessionToken: string, meta: { ip: string; userAgent: string; platform: string }) {
    try {
      await setDoc(doc(db, 'active_sessions', sessionToken), {
        userId,
        sessionToken,
        ip: meta.ip,
        userAgent: meta.userAgent,
        platform: meta.platform,
        startedAt: new Date().toISOString(),
        lastSeen: new Date().toISOString()
      });
    } catch (e) {
      console.warn('No se pudo registrar sesión activa:', e);
    }
  }

  async getActiveSessionsForUser(userId: string): Promise<Array<{ id: string; sessionToken: string; ip: string; userAgent: string; platform: string; startedAt: string; lastSeen: string }>> {
    try {
      const snap = await getDocs(query(collection(db, 'active_sessions'), where('userId', '==', userId)));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (e) {
      return [];
    }
  }

  async terminateActiveSession(sessionToken: string) {
    try {
      await deleteDoc(doc(db, 'active_sessions', sessionToken));
    } catch (e) {
      console.warn('No se pudo terminar sesión activa:', e);
    }
  }

  async terminateAllSessionsForUser(userId: string, exceptToken?: string) {
    try {
      const snap = await getDocs(query(collection(db, 'active_sessions'), where('userId', '==', userId)));
      for (const d of snap.docs) {
        if (!exceptToken || d.id !== exceptToken) {
          await deleteDoc(d.ref);
        }
      }
    } catch (e) {
      console.warn('No se pudieron terminar sesiones:', e);
    }
  }

  async getAllActiveSessions(): Promise<Array<{ id: string; userId: string; sessionToken: string; ip: string; userAgent: string; platform: string; startedAt: string; lastSeen: string }>> {
    try {
      const snap = await getDocs(collection(db, 'active_sessions'));
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch (e) {
      return [];
    }
  }

  async touchActiveSession(sessionToken: string) {
    try {
      await updateDoc(doc(db, 'active_sessions', sessionToken), { lastSeen: new Date().toISOString() });
    } catch { /* silencioso */ }
  }

  // ─── SINCRONIZACIÓN DE PINS ─────────────────────────────────────────────────

  /**
   * Obtiene lista de usuarios con PINs pendientes de sincronización
   * Útil para diagnóstico y resolución de problemas de login
   */
  getUsersWithPendingPins(): Array<{ id: string; name: string; email: string; pendingPin: string; firebaseUid?: string }> {
    return this.users
      .filter(u => u.active && (u as any).passwordPending && (u as any).pendingPin)
      .map(u => ({
        id: u.id,
        name: u.name,
        email: u.email || '',
        pendingPin: (u as any).pendingPin,
        firebaseUid: (u as any).firebaseUid
      }));
  }

  /**
   * Fuerza sincronización de PINs marcándolos como pendientes para próximo login.
   * NOTA: La sincronización real ocurre cuando cada usuario hace login exitoso.
   * Esta función marca usuarios específicos para que se sincronicen automáticamente.
   */
  async forcePinSyncForUsers(userIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const userId of userIds) {
      try {
        const user = this.users.find(u => u.id === userId);
        if (!user || !user.active) {
          failed.push(userId);
          continue;
        }

        // Marcar para sincronización forzada
        await updateDoc(doc(db, 'users', userId), {
          forcePinSync: true,
          pinSyncRequestedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        } as any);

        success.push(userId);
      } catch (e) {
        failed.push(userId);
      }
    }

    if (success.length > 0) {
      this.addAuditEntry('SECURITY', 'PIN_SYNC_FORCED', 
        `Sincronización forzada de PINs para ${success.length} usuarios: ${success.join(', ')}`);
    }

    return { success, failed };
  }

  /**
   * Diagnóstico completo de sincronización de PINs
   * Compara el PIN en Firestore vs lo que debería estar en Firebase Auth
   */
  async diagnosePinSync(): Promise<{
    totalUsers: number;
    usersWithPendingPins: number;
    usersWithoutFirebaseUid: number;
    details: Array<{
      id: string;
      name: string;
      email: string;
      status: 'synced' | 'pending' | 'no_firebase' | 'no_pin';
      firestorePin?: string;
      pendingPin?: string;
    }>;
  }> {
    const details = this.users.map(u => {
      const hasFirebaseUid = !!(u as any).firebaseUid;
      const hasPendingPin = !!(u as any).passwordPending && !!(u as any).pendingPin;
      const hasPin = !!u.pin;

      let status: 'synced' | 'pending' | 'no_firebase' | 'no_pin';
      if (!hasFirebaseUid) {
        status = 'no_firebase';
      } else if (!hasPin) {
        status = 'no_pin';
      } else if (hasPendingPin) {
        status = 'pending';
      } else {
        status = 'synced';
      }

      return {
        id: u.id,
        name: u.name,
        email: u.email || '',
        status,
        firestorePin: u.pin,
        pendingPin: (u as any).pendingPin
      };
    });

    return {
      totalUsers: this.users.length,
      usersWithPendingPins: details.filter(d => d.status === 'pending').length,
      usersWithoutFirebaseUid: details.filter(d => d.status === 'no_firebase').length,
      details
    };
  }

  getPermissionsForRole(role: UserRole): PermissionKey[] {
    switch (role) {
      case 'ADMIN': return ['ALL'];
      case 'SUPERVISOR': return ['DASHBOARD_VIEW', 'BILLING', 'SALES_READ', 'SALES_VOID', 'INVENTORY_READ', 'CLOSING_VIEW', 'CLOSING_AUDIT', 'FINANCE_VIEW', 'REPORTS_VIEW', 'REPORTS_SALES', 'REPORTS_INVENTORY', 'ACCOUNTING_ALERTS', 'SETTINGS_RATES'];
      case 'FINANZAS': return ['DASHBOARD_VIEW', 'FINANCE_VIEW', 'SALES_READ', 'REPORTS_VIEW', 'REPORTS_SALES', 'REPORTS_INVENTORY', 'ACCOUNTING_ALERTS', 'CLOSING_AUDIT'];
      case 'ALMACENISTA': return ['DASHBOARD_VIEW', 'INVENTORY_READ', 'INVENTORY_WRITE', 'FRACTIONATION', 'REPORTS_VIEW', 'REPORTS_INVENTORY'];
      case 'CAJERO': return ['DASHBOARD_VIEW', 'BILLING', 'SALES_READ', 'CLOSING_VIEW', 'REPORTS_VIEW', 'REPORTS_SALES'];
      default: return [];
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

  private getCashBoxMethodLabel(method: string) {
    switch (String(method ?? '').trim()) {
      case 'cash_usd': return 'Efectivo $';
      case 'cash_ves': return 'Efectivo Bs';
      case 'mobile': return 'Pago Móvil';
      case 'transfer': return 'Transferencia';
      case 'debit': return 'Débito';
      case 'biopago': return 'Biopago';
      case 'zelle': return 'Zelle';
      case 'digital_usd': return 'Digital $';
      case 'others': return 'Otros';
      case 'credit': return 'Crédito';
      default: return String(method ?? '').trim().toUpperCase() || 'SIN MÉTODO';
    }
  }

  private buildCashBoxBreakdownKey(line: Partial<CashBoxBreakdownLine>) {
    return [
      String(line.method ?? '').trim(),
      String(line.bank ?? '').trim(),
      String(line.accountId ?? '').trim(),
      String(line.posTerminalId ?? '').trim(),
      String(line.currency ?? '').trim()
    ].join('|');
  }

  private normalizeCashBoxBreakdownLine(line: Partial<CashBoxBreakdownLine>): CashBoxBreakdownLine {
    const inferredCurrency: 'USD' | 'VES' = line.currency
      ? line.currency
      : (line.method === 'cash_ves' || line.method === 'transfer' || line.method === 'mobile' || line.method === 'debit' || line.method === 'biopago')
        ? 'VES'
        : 'USD';
    const normalized: CashBoxBreakdownLine = {
      key: '',
      method: String(line.method ?? '').trim(),
      label: String(line.label ?? '').trim() || this.getCashBoxMethodLabel(String(line.method ?? '').trim()),
      currency: inferredCurrency,
      bank: String(line.bank ?? '').trim(),
      accountId: String(line.accountId ?? '').trim(),
      accountLabel: String(line.accountLabel ?? '').trim(),
      posTerminalId: String(line.posTerminalId ?? '').trim(),
      posTerminalName: String(line.posTerminalName ?? '').trim(),
      amountUSD: roundMoney(Number(line.amountUSD ?? 0) || 0),
      amountVES: roundMoney(Number(line.amountVES ?? 0) || 0),
      count: Number(line.count ?? 0) || 0,
      note: String(line.note ?? '').trim()
    };
    normalized.key = String(line.key ?? '').trim() || this.buildCashBoxBreakdownKey(normalized);
    return normalized;
  }

  private mergeCashBoxBreakdown(lines: Partial<CashBoxBreakdownLine>[]): CashBoxBreakdownLine[] {
    const acc = new Map<string, CashBoxBreakdownLine>();
    for (const raw of Array.isArray(lines) ? lines : []) {
      const line = this.normalizeCashBoxBreakdownLine(raw);
      if (!line.method) continue;
      const existing = acc.get(line.key);
      if (existing) {
        existing.amountUSD = roundMoney(existing.amountUSD + line.amountUSD);
        existing.amountVES = roundMoney(existing.amountVES + line.amountVES);
        existing.count += line.count;
        existing.note = existing.note || line.note;
      } else {
        acc.set(line.key, { ...line });
      }
    }
    return Array.from(acc.values()).sort((a, b) => {
      const labelA = String(a.label ?? '').trim();
      const labelB = String(b.label ?? '').trim();
      return labelA.localeCompare(labelB);
    });
  }

  private buildOpeningBreakdown(initialAmountUSD: number, initialAmountVES: number, lines?: CashBoxBreakdownLine[]): CashBoxBreakdownLine[] {
    const normalizeCashLine = (line: CashBoxBreakdownLine): CashBoxBreakdownLine => {
      const method = String(line.method ?? '').trim();
      if ((method === 'cash_usd' || method === 'cash_ves') && !String(line.bank ?? '').trim()) {
        try {
          const resolved = this.resolveCashBank(method as 'cash_usd' | 'cash_ves');
          return {
            ...line,
            bank: resolved.bankName,
            accountId: String(line.accountId ?? '').trim() || resolved.accountId,
            accountLabel: String(line.accountLabel ?? '').trim() || resolved.accountLabel
          };
        } catch {
          return line;
        }
      }
      return line;
    };
    const isNonZero = (line: CashBoxBreakdownLine) =>
      Math.abs(Number(line.amountUSD ?? 0)) > 0.000001 || Math.abs(Number(line.amountVES ?? 0)) > 0.000001;

    if (Array.isArray(lines) && lines.length > 0) {
      const normalized = this.mergeCashBoxBreakdown(lines)
        .map(normalizeCashLine)
        .filter(isNonZero);
      return this.mergeCashBoxBreakdown(normalized);
    }

    const openingLines: Partial<CashBoxBreakdownLine>[] = [];
    if (initialAmountUSD > 0) {
      const usdBank = this.resolveCashBank('cash_usd');
      openingLines.push({
        method: 'cash_usd',
        label: this.getCashBoxMethodLabel('cash_usd'),
        bank: usdBank.bankName,
        accountId: usdBank.accountId,
        accountLabel: usdBank.accountLabel,
        amountUSD: initialAmountUSD,
        amountVES: 0,
        count: 1
      });
    }
    if (initialAmountVES > 0) {
      const vesBank = this.resolveCashBank('cash_ves');
      openingLines.push({
        method: 'cash_ves',
        label: this.getCashBoxMethodLabel('cash_ves'),
        bank: vesBank.bankName,
        accountId: vesBank.accountId,
        accountLabel: vesBank.accountLabel,
        amountUSD: 0,
        amountVES: initialAmountVES,
        count: 1
      });
    }
    return this.mergeCashBoxBreakdown(openingLines);
  }

  private async getCashBoxSales(session: CashBoxSession): Promise<CashBoxSaleAudit[]> {
    const bySession = await getDocs(query(collection(db, 'cashbox_sales'), where('cashBoxSessionId', '==', session.id)));
    let rows = bySession.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as CashBoxSaleAudit[];
    if (rows.length === 0) {
      const startedAt = `${session.openDate}T${session.openTime}:00.000Z`;
      const endedAt = session.status === 'CLOSED' && session.closeDate && session.closeTime
        ? `${session.closeDate}T${session.closeTime}:59.999Z`
        : new Date().toISOString();
      const fallback = await getDocs(query(
        collection(db, 'cashbox_sales'),
        where('userId', '==', session.userId)
      ));
      rows = fallback.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((row: any) => {
          const ts = String(row?.timestamp ?? '');
          return ts >= startedAt && ts <= endedAt;
        }) as CashBoxSaleAudit[];
    }
    return rows.sort((a, b) => String(a.timestamp ?? '').localeCompare(String(b.timestamp ?? '')));
  }

  private async getCashBoxPaymentDetails(session: CashBoxSession): Promise<SalePaymentRecord[]> {
    const bySession = await getDocs(query(collection(db, 'sale_payments'), where('cashBoxSessionId', '==', session.id)));
    let rows = bySession.docs.map((d) => ({ sourceId: d.id, ...(d.data() as any) })) as SalePaymentRecord[];
    if (rows.length === 0) {
      const startedAt = `${session.openDate}T${session.openTime}:00.000Z`;
      const endedAt = session.status === 'CLOSED' && session.closeDate && session.closeTime
        ? `${session.closeDate}T${session.closeTime}:59.999Z`
        : new Date().toISOString();
      const fallback = await getDocs(query(
        collection(db, 'sale_payments'),
        where('actorUserId', '==', session.userId)
      ));
      rows = fallback.docs
        .map((d) => ({ sourceId: d.id, ...(d.data() as any) }))
        .filter((row: any) => {
          const ts = String(row?.createdAt ?? '');
          return ts >= startedAt && ts <= endedAt;
        }) as SalePaymentRecord[];
    }
    return rows.sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
  }

  private async getCashBoxClosureRecord(sessionId: string): Promise<CashBoxClosureRecord | null> {
    const snap = await getDoc(doc(db, 'cashbox_closures', sessionId));
    if (!snap.exists()) return null;
    return snap.data() as CashBoxClosureRecord;
  }

  private buildCashBoxSummaryFromClosureRecord(session: CashBoxSession, record: CashBoxClosureRecord): CashBoxSessionSummary {
    const paymentDetails = Array.isArray(record.paymentDetailsSnapshot) ? record.paymentDetailsSnapshot : [];
    const systemBreakdown = this.buildCashBoxOperationalBreakdown(paymentDetails);
    const declaredBreakdown = this.mergeCashBoxBreakdown(Array.isArray(record.declaredBreakdown) ? record.declaredBreakdown : []);
    const reconciliationLines = this.buildCashBoxReconciliationLines(systemBreakdown, declaredBreakdown);
    const systemBreakdownForTotals = systemBreakdown.filter((line) => !this.excludeFromCashBoxOperationalTotals(line));
    const declaredBreakdownForTotals = declaredBreakdown.filter((line) => !this.excludeFromCashBoxOperationalTotals(line));
    const totalSystemUSD = roundMoney(systemBreakdownForTotals.filter(l => l.currency !== 'VES').reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0));
    const totalSystemVES = roundMoney(systemBreakdownForTotals.filter(l => l.currency !== 'USD').reduce((sum, line) => sum + (Number(line.amountVES ?? 0) || 0), 0));
    const totalDeclaredUSD = roundMoney(declaredBreakdownForTotals.filter(l => l.currency !== 'VES').reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0));
    const totalDeclaredVES = roundMoney(declaredBreakdownForTotals.filter(l => l.currency !== 'USD').reduce((sum, line) => sum + (Number(line.amountVES ?? 0) || 0), 0));
    return {
      session,
      sales: Array.isArray(record.salesSnapshot) ? record.salesSnapshot : [],
      inventoryMovements: Array.isArray(record.inventorySnapshot) ? record.inventorySnapshot : [],
      paymentDetails,
      paymentMethodTotals: this.mergeCashBoxBreakdown(systemBreakdown).map((line) => ({
        method: line.method,
        amountUSD: Number(line.amountUSD ?? 0) || 0,
        amountVES: Number(line.amountVES ?? 0) || 0,
        count: Number(line.count ?? 0) || 0
      })),
      systemBreakdown,
      declaredBreakdown,
      reconciliationLines,
      totalSalesUSD: Number(record.totalSalesUSD ?? 0) || 0,
      totalSalesVES: Number(record.totalSalesVES ?? 0) || 0,
      totalItemsSold: Number(record.totalItemsSold ?? 0) || 0,
      totalSystemUSD,
      totalSystemVES,
      totalDeclaredUSD,
      totalDeclaredVES,
      differenceUSD: roundMoney(totalDeclaredUSD - totalSystemUSD),
      differenceVES: roundMoney(totalDeclaredVES - totalSystemVES),
      denominationReport: (record as any).denominationReport ?? undefined
    };
  }

  private buildCashBoxOperationalBreakdown(paymentDetails: SalePaymentRecord[]): CashBoxBreakdownLine[] {
    const paymentBreakdown = (Array.isArray(paymentDetails) ? paymentDetails : []).map((line) => {
      const method = String(line.method ?? '').trim();
      let bank = String(line.bank ?? '').trim();
      let accountId = String(line.accountId ?? '').trim();
      let accountLabel = String(line.accountLabel ?? '').trim();

      if ((method === 'cash_usd' || method === 'cash_ves') && !bank) {
        try {
          const resolution = this.resolveCashBank(method as 'cash_usd' | 'cash_ves');
          if (resolution) {
            bank = resolution.bankName;
            if (!accountId) accountId = resolution.accountId;
            if (!accountLabel) accountLabel = resolution.accountLabel;
          }
        } catch {
          // keep legacy values
        }
      }

      return {
        method,
        label: this.getCashBoxMethodLabel(method),
        currency: (line.currency ?? (method === 'cash_ves' || method === 'transfer' || method === 'mobile' || method === 'debit' || method === 'biopago' ? 'VES' : 'USD')) as 'USD' | 'VES',
        bank,
        accountId,
        accountLabel,
        posTerminalId: String(line.posTerminalId ?? '').trim(),
        posTerminalName: String(line.posTerminalName ?? '').trim(),
        amountUSD: Number(line.amountUSD ?? 0) || 0,
        amountVES: Number(line.amountVES ?? 0) || 0,
        count: 1,
        note: String(line.note ?? '').trim()
      } as CashBoxBreakdownLine;
    });

    return this.mergeCashBoxBreakdown(paymentBreakdown);
  }

  private excludeFromCashBoxOperationalTotals(line: Partial<CashBoxBreakdownLine>): boolean {
    const method = String(line.method ?? '').trim().toLowerCase();
    if (method !== 'others') return false;
    const descriptor = [
      String(line.bank ?? '').trim(),
      String(line.accountLabel ?? '').trim(),
      String(line.label ?? '').trim(),
      String(line.note ?? '').trim()
    ].join(' ').toUpperCase();
    return descriptor.includes('ANT. CLIENTE') || descriptor.includes('ANTICIPO CLIENTE');
  }

  private buildCashBoxReconciliationLines(systemBreakdown: CashBoxBreakdownLine[], declaredBreakdown: CashBoxBreakdownLine[]): CashBoxReconciliationLine[] {
    const reconciliationKey = (line: CashBoxBreakdownLine) =>
      `${String(line.method ?? '').trim()}|${String(line.bank ?? '').trim()}|${String(line.currency ?? '').trim()}`;

    const systemByRecKey = new Map<string, CashBoxBreakdownLine>();
    for (const line of systemBreakdown) {
      const rk = reconciliationKey(line);
      const existing = systemByRecKey.get(rk);
      if (existing) {
        existing.amountUSD = roundMoney(existing.amountUSD + line.amountUSD);
        existing.amountVES = roundMoney(existing.amountVES + line.amountVES);
        existing.count += line.count;
      } else {
        systemByRecKey.set(rk, { ...line });
      }
    }

    const declaredByRecKey = new Map<string, CashBoxBreakdownLine>();
    for (const line of declaredBreakdown) {
      const rk = reconciliationKey(line);
      const existing = declaredByRecKey.get(rk);
      if (existing) {
        existing.amountUSD = roundMoney(existing.amountUSD + line.amountUSD);
        existing.amountVES = roundMoney(existing.amountVES + line.amountVES);
        existing.count += line.count;
      } else {
        declaredByRecKey.set(rk, { ...line });
      }
    }

    return Array.from(new Set([...systemByRecKey.keys(), ...declaredByRecKey.keys()]))
      .map((rk) => {
        const systemLine = systemByRecKey.get(rk);
        const declaredLine = declaredByRecKey.get(rk);
        const currency: 'USD' | 'VES' = systemLine?.currency ?? declaredLine?.currency ?? 'USD';
        return {
          key: rk,
          method: String(systemLine?.method ?? declaredLine?.method ?? '').trim(),
          label: String(systemLine?.label ?? declaredLine?.label ?? ''),
          currency,
          bank: String(systemLine?.bank ?? declaredLine?.bank ?? '').trim(),
          accountId: String(systemLine?.accountId ?? declaredLine?.accountId ?? '').trim(),
          accountLabel: String(systemLine?.accountLabel ?? declaredLine?.accountLabel ?? '').trim(),
          posTerminalId: String(systemLine?.posTerminalId ?? declaredLine?.posTerminalId ?? '').trim(),
          posTerminalName: String(systemLine?.posTerminalName ?? declaredLine?.posTerminalName ?? '').trim(),
          systemAmountUSD: roundMoney(Number(systemLine?.amountUSD ?? 0) || 0),
          systemAmountVES: roundMoney(Number(systemLine?.amountVES ?? 0) || 0),
          declaredAmountUSD: roundMoney(Number(declaredLine?.amountUSD ?? 0) || 0),
          declaredAmountVES: roundMoney(Number(declaredLine?.amountVES ?? 0) || 0),
          differenceUSD: roundMoney(currency === 'USD' ? (Number(declaredLine?.amountUSD ?? 0) || 0) - (Number(systemLine?.amountUSD ?? 0) || 0) : 0),
          differenceVES: roundMoney(currency === 'VES' ? (Number(declaredLine?.amountVES ?? 0) || 0) - (Number(systemLine?.amountVES ?? 0) || 0) : 0),
          count: Number(systemLine?.count ?? declaredLine?.count ?? 0) || 0
        } as CashBoxReconciliationLine;
      })
      .filter((line) => {
        const isVES = line.currency === 'VES';
        const sys = isVES ? Number(line.systemAmountVES ?? 0) || 0 : Number(line.systemAmountUSD ?? 0) || 0;
        const decl = isVES ? Number(line.declaredAmountVES ?? 0) || 0 : Number(line.declaredAmountUSD ?? 0) || 0;
        const diff = isVES ? Number(line.differenceVES ?? 0) || 0 : Number(line.differenceUSD ?? 0) || 0;
        return Math.abs(sys) > 0.000001 || Math.abs(decl) > 0.000001 || Math.abs(diff) > 0.000001;
      })
      .sort((a, b) => {
        const labelCmp = String(a.label ?? '').trim().localeCompare(String(b.label ?? '').trim());
        if (labelCmp !== 0) return labelCmp;
        return (a.currency === 'USD' ? 0 : 1) - (b.currency === 'USD' ? 0 : 1);
      });
  }

  private async persistCashBoxClosureRecord(session: CashBoxSession, summary: CashBoxSessionSummary, input: { declaredBreakdown: CashBoxBreakdownLine[]; note: string; rateBCV: number; rateParallel: number; rateInternal: number }, closedAt: string): Promise<void> {
    const record: CashBoxClosureRecord = {
      id: session.id,
      cashBoxSessionId: session.id,
      userId: session.userId,
      userName: session.userName,
      openedAt: `${session.openDate}T${session.openTime}:00.000Z`,
      closedAt,
      exchangeRateBCV: Number(input.rateBCV ?? session.openRateBCV ?? 0) || 0,
      exchangeRateParallel: Number(input.rateParallel ?? session.openRateParallel ?? 0) || 0,
      exchangeRateInternal: Number(input.rateInternal ?? session.openRateInternal ?? 0) || 0,
      declaredBreakdown: this.mergeCashBoxBreakdown(input.declaredBreakdown),
      declaredTotalUSD: summary.totalDeclaredUSD,
      declaredTotalVES: summary.totalDeclaredVES,
      systemBreakdown: summary.systemBreakdown,
      systemTotalUSD: summary.totalSystemUSD,
      systemTotalVES: summary.totalSystemVES,
      differenceUSD: summary.differenceUSD,
      differenceVES: summary.differenceVES,
      operatorNote: input.note,
      salesSnapshot: summary.sales,
      inventorySnapshot: summary.inventoryMovements,
      paymentDetailsSnapshot: summary.paymentDetails,
      reconciliationLines: summary.reconciliationLines,
      totalSalesUSD: summary.totalSalesUSD,
      totalSalesVES: summary.totalSalesVES,
      totalItemsSold: summary.totalItemsSold,
      denominationReport: summary.denominationReport,
      createdAt: closedAt,
      updatedAt: closedAt
    };
    await setDoc(doc(db, 'cashbox_closures', session.id), record as any, { merge: false });
  }

  getCurrentUser() { return this.currentUser; }

  verifyCurrentUserPin(pin: string): boolean {
    const user = this.currentUser;
    if (!user) return false;
    return String(user.pin ?? '').trim() === String(pin ?? '').trim();
  }

  getCashBoxSessions() {
    this.ensureCashBoxSessionsSubscription();
    return this.cashBoxSessions;
  }

  getCurrentCashBoxSession() {
    this.ensureCashBoxSessionsSubscription();
    return this.currentSession;
  }

  async openCashBox(input: {
    userId: string;
    userName: string;
    stationName?: string;
    initialAmountUSD: number;
    initialAmountVES: number;
    initialBreakdown?: CashBoxBreakdownLine[];
    rateBCV?: number;
    rateParallel?: number;
    rateInternal?: number;
    clientIP?: string;
    deviceInfo?: string;
  }): Promise<CashBoxSession> {
    this.ensureCashBoxSessionsSubscription();


    const { userId, userName, stationName } = input;

    // Check in-memory first (fast path)
    const existingOpenMemory = this.cashBoxSessions.find(s => s.status === 'OPEN' && s.userId === userId);
    if (existingOpenMemory) {
      if (userId === this.currentUser.id) {
        this.currentSession = existingOpenMemory;
        this.notify();
      }
      return existingOpenMemory;
    }
    // Double-check Firestore to handle stale cache (e.g. after a failed close)
    const existingSnap = await getDocs(
      query(collection(db, 'cashbox_sessions'),
        where('userId', '==', userId),
        where('status', '==', 'OPEN'),
        limit(1)
      )
    );
    if (!existingSnap.empty) {
      // Sync this session into memory so the UI can see it
      const d: any = existingSnap.docs[0].data();
      const syncedSession: CashBoxSession = {
        id: String(d.id ?? existingSnap.docs[0].id),
        userId: String(d.userId ?? ''),
        userName: String(d.userName ?? ''),
        openDate: String(d.openDate ?? ''),
        openTime: String(d.openTime ?? ''),
        openRateBCV: Number(d.openRateBCV ?? 0),
        openRateParallel: Number(d.openRateParallel ?? 0),
        openRateInternal: Number(d.openRateInternal ?? 0),
        initialAmountUSD: Number(d.initialAmountUSD ?? 0),
        initialAmountVES: Number(d.initialAmountVES ?? 0),
        openingBreakdown: Array.isArray(d.openingBreakdown) ? d.openingBreakdown : [],
        closingDeclaredBreakdown: [],
        closingNote: '',
        status: 'OPEN',
        closeDate: '', closeTime: '',
        closeRateBCV: 0, closeRateParallel: 0, closeRateInternal: 0,
        finalAmountUSD: 0, finalAmountVES: 0,
        systemClosureUSD: 0, systemClosureVES: 0,
        differenceUSD: 0, differenceVES: 0,
        createdAt: String(d.createdAt ?? ''),
        updatedAt: String(d.updatedAt ?? '')
      };
      if (!this.cashBoxSessions.find(s => s.id === syncedSession.id)) {
        this.cashBoxSessions.push(syncedSession);
      }
      this.currentSession = syncedSession;
      this.notify();
      return syncedSession;
    }

    const payload = typeof input === 'number'
      ? { initialAmountUSD: (input as number), initialAmountVES: 0, openingBreakdown: [] as CashBoxBreakdownLine[], rateBCV: 0, rateParallel: 0, rateInternal: 0 }
      : {
        initialAmountUSD: Number(input?.initialAmountUSD ?? 0) || 0,
        initialAmountVES: Number(input?.initialAmountVES ?? 0) || 0,
        openingBreakdown: Array.isArray(input?.initialBreakdown) ? input.initialBreakdown : [],
        rateBCV: Number(input?.rateBCV ?? 0) || 0,
        rateParallel: Number(input?.rateParallel ?? 0) || 0,
        rateInternal: Number(input?.rateInternal ?? 0) || 0
      };
    const now = new Date();
    const sessionId = `CASH_${now.getTime()}_${userId}`;
    const openingBreakdown = this.buildOpeningBreakdown(payload.initialAmountUSD, payload.initialAmountVES, payload.openingBreakdown);
    const session: CashBoxSession = {
      id: sessionId,
      userId,
      userName,
      stationName,
      openDate: now.toISOString().split('T')[0],
      openTime: now.toTimeString().split(' ')[0].substring(0, 5),
      openRateBCV: payload.rateBCV,
      openRateParallel: payload.rateParallel,
      openRateInternal: payload.rateInternal,
      initialAmountUSD: payload.initialAmountUSD,
      initialAmountVES: payload.initialAmountVES,
      openingBreakdown,
      status: 'OPEN',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    await setDoc(doc(db, 'cashbox_sessions', sessionId), session);
    
    // MEJORA DE AUDITORÍA: Registro detallado de apertura de caja
    const auditDetails = [
      `Cajero: ${userName}`,
      `Monto inicial: $${payload.initialAmountUSD.toFixed(2)} USD / Bs.${payload.initialAmountVES.toFixed(2)}`,
      `Estación: ${stationName || 'No especificada'}`,
      `Tasas: BCV=${payload.rateBCV} | Paralela=${payload.rateParallel} | Interna=${payload.rateInternal}`
    ];
    
    if (input.clientIP) auditDetails.push(`IP: ${input.clientIP}`);
    if (input.deviceInfo) auditDetails.push(`Dispositivo: ${input.deviceInfo}`);
    
    // Validaciones de auditoría
    const hour = now.getHours();
    if (hour < 6 || hour > 22) {
      auditDetails.push('⚠️ APERTURA FUERA DE HORARIO NORMAL');
    }
    
    if (payload.initialAmountUSD > 1000) {
      auditDetails.push('⚠️ MONTO INICIAL ELEVADO');
    }
    
    // Verificar historial de aperturas del cajero
    const recentSessions = this.cashBoxSessions
      .filter(s => s.userId === userId && s.status === 'OPEN')
      .slice(0, 5);
    
    if (recentSessions.length > 0) {
      auditDetails.push(`⚠️ CAJERO CON SESIÓN ACTIVA EXISTENTE`);
    }
    
    await this.addAuditEntry('CASHIER', 'CASHBOX_OPEN', auditDetails.join(' | '));
    
    // Actualizar memoria inmediatamente sin esperar el snapshot de Firestore
    if (!this.cashBoxSessions.find(s => s.id === sessionId)) {
      this.cashBoxSessions.unshift(session);
    }
    if (userId === this.currentUser.id) {
      this.currentSession = session;
    }
    this.notify();
    return session;
  }

  async closeCashBoxSession(input: number | { finalAmountUSD?: number; finalAmountVES?: number; declaredBreakdown?: CashBoxBreakdownLine[]; note?: string; rateBCV?: number; rateParallel?: number; rateInternal?: number } = 0, finalAmountVESArg: number = 0): Promise<CashBoxSession> {
    this.ensureCashBoxSessionsSubscription();

    // Recovery: if Firestore already closed the session but memory hasn't synced yet
    if (!this.currentSession || this.currentSession.status !== 'OPEN') {
      // Check Firestore directly for the user's session
      const liveSnap = await getDocs(
        query(collection(db, 'cashbox_sessions'),
          where('userId', '==', this.currentUser.id),
          where('status', '==', 'OPEN'),
          limit(1)
        )
      );
      if (liveSnap.empty) {
        throw new Error('No hay una sesión de caja abierta para el usuario actual');
      }
      // Sync the open session into memory and proceed
      const liveData: any = liveSnap.docs[0].data();
      this.currentSession = {
        id: String(liveData.id ?? liveSnap.docs[0].id),
        userId: String(liveData.userId ?? ''),
        userName: String(liveData.userName ?? ''),
        openDate: String(liveData.openDate ?? ''),
        openTime: String(liveData.openTime ?? ''),
        openRateBCV: Number(liveData.openRateBCV ?? 0),
        openRateParallel: Number(liveData.openRateParallel ?? 0),
        openRateInternal: Number(liveData.openRateInternal ?? 0),
        initialAmountUSD: Number(liveData.initialAmountUSD ?? 0),
        initialAmountVES: Number(liveData.initialAmountVES ?? 0),
        openingBreakdown: Array.isArray(liveData.openingBreakdown) ? liveData.openingBreakdown : [],
        closingDeclaredBreakdown: Array.isArray(liveData.closingDeclaredBreakdown) ? liveData.closingDeclaredBreakdown : [],
        closingNote: String(liveData.closingNote ?? ''),
        status: 'OPEN',
        closeDate: '', closeTime: '',
        closeRateBCV: 0, closeRateParallel: 0, closeRateInternal: 0,
        finalAmountUSD: 0, finalAmountVES: 0,
        systemClosureUSD: 0, systemClosureVES: 0,
        differenceUSD: 0, differenceVES: 0,
        createdAt: String(liveData.createdAt ?? ''),
        updatedAt: String(liveData.updatedAt ?? '')
      } as CashBoxSession;
    }

    const sessionToClose = this.currentSession;
    if (!sessionToClose) {
      throw new Error('No hay una sesión de caja abierta para el usuario actual');
    }

    const payload = typeof input === 'number'
      ? { finalAmountUSD: input, finalAmountVES: finalAmountVESArg, declaredBreakdown: [] as CashBoxBreakdownLine[], note: '', rateBCV: 0, rateParallel: 0, rateInternal: 0 }
      : {
        finalAmountUSD: Number(input?.finalAmountUSD ?? 0) || 0,
        finalAmountVES: Number(input?.finalAmountVES ?? 0) || 0,
        declaredBreakdown: Array.isArray(input?.declaredBreakdown) ? input.declaredBreakdown : [],
        note: String(input?.note ?? '').trim(),
        rateBCV: Number(input?.rateBCV ?? 0) || 0,
        rateParallel: Number(input?.rateParallel ?? 0) || 0,
        rateInternal: Number(input?.rateInternal ?? 0) || 0
      };
    const declaredBreakdown = this.mergeCashBoxBreakdown(
      payload.declaredBreakdown.length > 0
        ? payload.declaredBreakdown
        : [
          { method: 'cash_usd', label: this.getCashBoxMethodLabel('cash_usd'), amountUSD: payload.finalAmountUSD, amountVES: 0, count: payload.finalAmountUSD > 0 ? 1 : 0 },
          { method: 'cash_ves', label: this.getCashBoxMethodLabel('cash_ves'), amountUSD: 0, amountVES: payload.finalAmountVES, count: payload.finalAmountVES > 0 ? 1 : 0 }
        ]
    );
    const summary = await this.getCashBoxSessionSummary(sessionToClose.id);
    const now = new Date();
    const declaredBreakdownForTotals = declaredBreakdown.filter((line) => !this.excludeFromCashBoxOperationalTotals(line));
    const totalDeclaredUSD = roundMoney(declaredBreakdownForTotals.reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0));
    const totalDeclaredVES = roundMoney(declaredBreakdownForTotals.reduce((sum, line) => sum + (Number(line.amountVES ?? 0) || 0), 0));
    const differenceUSD = roundMoney(totalDeclaredUSD - summary.totalSystemUSD);
    const differenceVES = roundMoney(totalDeclaredVES - summary.totalSystemVES);

    const updatedSession: Partial<CashBoxSession> = {
      status: 'CLOSED',
      closeDate: now.toISOString().split('T')[0],
      closeTime: now.toTimeString().split(' ')[0].substring(0, 5),
      closeRateBCV: payload.rateBCV,
      closeRateParallel: payload.rateParallel,
      closeRateInternal: payload.rateInternal,
      finalAmountUSD: payload.finalAmountUSD,
      finalAmountVES: payload.finalAmountVES,
      closingDeclaredBreakdown: declaredBreakdown,
      closingNote: payload.note,
      systemClosureUSD: summary.totalSystemUSD,
      systemClosureVES: summary.totalSystemVES,
      differenceUSD,
      differenceVES,
      updatedAt: now.toISOString()
    };

    const sessionIdToClose = sessionToClose.id;
    const closedSession = { ...sessionToClose, ...updatedSession } as CashBoxSession;

    await updateDoc(doc(db, 'cashbox_sessions', sessionIdToClose), updatedSession);

    // MEJORA DE AUDITORÍA: Registro detallado de cierre de caja
    const auditDetails = [
      `Cajero: ${sessionToClose.userName || this.currentUser.name || 'OPERADOR'}`,
      `Sesión: ${sessionIdToClose}`,
      `Ventas: $${summary.totalSalesUSD.toFixed(2)} USD`,
      `Declarado: $${summary.totalDeclaredUSD.toFixed(2)} USD`,
      `Diferencia: $${summary.differenceUSD.toFixed(2)} USD`
    ];
    
    // Validaciones de auditoría para cierre
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) {
      auditDetails.push('⚠️ CIERRE FUERA DE HORARIO NORMAL');
    }
    
    if (Math.abs(summary.differenceUSD) > 50) {
      auditDetails.push('⚠️ DIFERENCIA SIGNIFICATIVA EN CIERRE');
    }
    
    if (summary.totalSalesUSD > 5000) {
      auditDetails.push('⚠️ VOLUMEN DE VENTAS ELEVADO');
    }
    
    // Calcular duración de la sesión
    const sessionDuration = new Date().getTime() - new Date(sessionToClose.createdAt).getTime();
    const hours = sessionDuration / (1000 * 60 * 60);
    if (hours > 12) {
      auditDetails.push('⚠️ SESIÓN PROLONGADA (>12 horas)');
    }
    
    await this.addAuditEntry('CASHIER', 'CASHBOX_CLOSE', auditDetails.join(' | '));

    // Immediately update in-memory state so the session reads as CLOSED
    // without waiting for the Firestore snapshot to arrive
    this.currentSession = null;
    this.cashBoxSessions = this.cashBoxSessions.map(s =>
      s.id === sessionIdToClose ? closedSession : s
    );
    this.notify();

    // Persist the closure record asynchronously — failure here must NOT
    // leave the session in a zombie OPEN state (Firestore already has CLOSED)
    try {
      await this.persistCashBoxClosureRecord(
        closedSession,
        {
          ...summary,
          declaredBreakdown,
          totalDeclaredUSD,
          totalDeclaredVES,
          differenceUSD,
          differenceVES,
          reconciliationLines: summary.reconciliationLines.map((line) => {
            const declaredLine = declaredBreakdown.find((entry) => entry.key === line.key);
            return {
              ...line,
              declaredAmountUSD: Number(declaredLine?.amountUSD ?? 0) || 0,
              declaredAmountVES: Number(declaredLine?.amountVES ?? 0) || 0,
              differenceUSD: roundMoney((Number(declaredLine?.amountUSD ?? 0) || 0) - (Number(line.systemAmountUSD ?? 0) || 0)),
              differenceVES: roundMoney((Number(declaredLine?.amountVES ?? 0) || 0) - (Number(line.systemAmountVES ?? 0) || 0))
            };
          })
        },
        {
          declaredBreakdown,
          note: payload.note,
          rateBCV: payload.rateBCV,
          rateParallel: payload.rateParallel,
          rateInternal: payload.rateInternal
        },
        now.toISOString()
      );
    } catch (persistErr) {
      console.error('closeCashBoxSession: closure record failed (session is already CLOSED in Firestore):', persistErr);
    }

    return closedSession;
  }

  async getCashBoxSessionSummary(sessionId: string): Promise<CashBoxSessionSummary> {
    this.ensureCashBoxSessionsSubscription();

    let session = this.cashBoxSessions.find(s => s.id === sessionId);
    if (!session) {
      // Memory not synced yet — fetch directly from Firestore
      const snap = await getDoc(doc(db, 'cashbox_sessions', sessionId));
      if (!snap.exists()) throw new Error('Sesión de caja no encontrada');
      const d: any = snap.data();
      session = {
        id: String(d.id ?? snap.id),
        userId: String(d.userId ?? ''),
        userName: String(d.userName ?? ''),
        openDate: String(d.openDate ?? ''),
        openTime: String(d.openTime ?? ''),
        openRateBCV: Number(d.openRateBCV ?? 0),
        openRateParallel: Number(d.openRateParallel ?? 0),
        openRateInternal: Number(d.openRateInternal ?? 0),
        initialAmountUSD: Number(d.initialAmountUSD ?? 0),
        initialAmountVES: Number(d.initialAmountVES ?? 0),
        openingBreakdown: Array.isArray(d.openingBreakdown) ? d.openingBreakdown : [],
        closingDeclaredBreakdown: Array.isArray(d.closingDeclaredBreakdown) ? d.closingDeclaredBreakdown : [],
        closingNote: String(d.closingNote ?? ''),
        status: d.status as 'OPEN' | 'CLOSED',
        closeDate: String(d.closeDate ?? ''),
        closeTime: String(d.closeTime ?? ''),
        closeRateBCV: Number(d.closeRateBCV ?? 0),
        closeRateParallel: Number(d.closeRateParallel ?? 0),
        closeRateInternal: Number(d.closeRateInternal ?? 0),
        finalAmountUSD: Number(d.finalAmountUSD ?? 0),
        finalAmountVES: Number(d.finalAmountVES ?? 0),
        systemClosureUSD: Number(d.systemClosureUSD ?? 0),
        systemClosureVES: Number(d.systemClosureVES ?? 0),
        differenceUSD: Number(d.differenceUSD ?? 0),
        differenceVES: Number(d.differenceVES ?? 0),
        createdAt: String(d.createdAt ?? ''),
        updatedAt: String(d.updatedAt ?? '')
      } as CashBoxSession;
      // Cache it in memory
      if (!this.cashBoxSessions.find(s => s.id === session!.id)) {
        this.cashBoxSessions.push(session);
      }
    }

    if (session.status === 'CLOSED') {
      const closureRecord = await this.getCashBoxClosureRecord(session.id);
      if (closureRecord) {
        return this.buildCashBoxSummaryFromClosureRecord(session, closureRecord);
      }
    }

    const saleAudits = await this.getCashBoxSales(session);
    const paymentDetails = await this.getCashBoxPaymentDetails(session);
    const sales = saleAudits.map((sale) => ({
      id: String(sale.saleId ?? sale.id ?? ''),
      correlativo: String(sale.correlativo ?? ''),
      customerName: String(sale.customerName ?? ''),
      totalUSD: Number(sale.totalUSD ?? 0) || 0,
      totalVES: Number(sale.totalVES ?? 0) || 0,
      paymentMethod: String(sale.paymentMethod ?? ''),
      timestamp: String(sale.timestamp ?? '')
    }));

    const inventorySource = saleAudits.flatMap((sale) => {
      const ts = String(sale.timestamp ?? '');
      return (Array.isArray(sale.items) ? sale.items : []).flatMap((item: any) => {
        const dispatch = Array.isArray(item?.dispatchLotes) ? item.dispatchLotes : [];
        if (dispatch.length > 0) {
          return dispatch.map((lote: any) => ({
            sku: String(item?.code ?? ''),
            description: String(item?.description ?? ''),
            qtyOut: Number(lote?.qty ?? 0) || 0,
            unit: String(item?.unit ?? 'Und'),
            timestamp: ts,
            batchId: String(lote?.batchId ?? '')
          }));
        }
        return [{
          sku: String(item?.code ?? ''),
          description: String(item?.description ?? ''),
          qtyOut: Number(item?.qty ?? 0) || 0,
          unit: String(item?.unit ?? 'Und'),
          timestamp: ts,
          batchId: ''
        }];
      });
    });
    const inventoryMovements = inventorySource.filter((line) => line.sku || line.description);

    const paymentMethodTotals = Array.from(paymentDetails.reduce((acc, line) => {
      const key = String(line.method ?? '').trim();
      const existing = acc.get(key) ?? { method: key, amountUSD: 0, amountVES: 0, count: 0 };
      existing.amountUSD = roundMoney(existing.amountUSD + (Number(line.amountUSD ?? 0) || 0));
      existing.amountVES = roundMoney(existing.amountVES + (Number(line.amountVES ?? 0) || 0));
      existing.count += 1;
      acc.set(key, existing);
      return acc;
    }, new Map<string, { method: string; amountUSD: number; amountVES: number; count: number }>()).values());

    // Conciliación operativa: usar solo movimientos de facturación/pagos de la sesión.
    // La apertura de caja se mantiene auditada en la sesión, pero no altera la varianza
    // operativa por método de cobro en este resumen.
    const systemBreakdown = this.buildCashBoxOperationalBreakdown(paymentDetails);
    const declaredBreakdown = this.mergeCashBoxBreakdown(session.closingDeclaredBreakdown ?? []);
    const reconciliationLines = this.buildCashBoxReconciliationLines(systemBreakdown, declaredBreakdown);

    const totalSalesUSD = roundMoney(sales.reduce((sum, sale) => sum + (Number(sale.totalUSD ?? 0) || 0), 0));
    const totalSalesVES = roundMoney(sales.reduce((sum, sale) => sum + (Number(sale.totalVES ?? 0) || 0), 0));
    const totalItemsSold = inventoryMovements.reduce((sum, movement) => sum + (Number(movement.qtyOut ?? 0) || 0), 0);
    const systemBreakdownForTotals = systemBreakdown.filter((line) => !this.excludeFromCashBoxOperationalTotals(line));
    const declaredBreakdownForTotals = declaredBreakdown.filter((line) => !this.excludeFromCashBoxOperationalTotals(line));
    const totalSystemUSD = roundMoney(systemBreakdownForTotals.filter(l => l.currency !== 'VES').reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0));
    const totalSystemVES = roundMoney(systemBreakdownForTotals.filter(l => l.currency !== 'USD').reduce((sum, line) => sum + (Number(line.amountVES ?? 0) || 0), 0));
    const totalDeclaredUSD = roundMoney(declaredBreakdownForTotals.filter(l => l.currency !== 'VES').reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0));
    const totalDeclaredVES = roundMoney(declaredBreakdownForTotals.filter(l => l.currency !== 'USD').reduce((sum, line) => sum + (Number(line.amountVES ?? 0) || 0), 0));
    const differenceUSD = roundMoney(totalDeclaredUSD - totalSystemUSD);
    const differenceVES = roundMoney(totalDeclaredVES - totalSystemVES);

    // Reporte de denominaciones: billetes recibidos vs entregados como vuelto
    const denominationReport = this.buildDenominationReport(paymentDetails);

    return {
      session,
      sales,
      inventoryMovements,
      paymentDetails,
      paymentMethodTotals,
      systemBreakdown,
      declaredBreakdown,
      reconciliationLines,
      totalSalesUSD,
      totalSalesVES,
      totalItemsSold,
      totalSystemUSD,
      totalSystemVES,
      totalDeclaredUSD,
      totalDeclaredVES,
      differenceUSD,
      differenceVES,
      denominationReport
    };
  }

  private buildDenominationReport(paymentDetails: SalePaymentRecord[]): CashBoxDenominationReport {
    const DENOMS_VES = [10, 20, 50, 100, 200, 500];
    const DENOMS_USD = [1, 2, 5, 10, 20, 50, 100];

    const normalizeMethod = (method: string): string => String(method ?? '').trim().toLowerCase();
    const resolvePaymentCashCurrency = (record: SalePaymentRecord): 'USD' | 'VES' | null => {
      const method = normalizeMethod(record.method);
      if (method === 'cash_usd') return 'USD';
      if (method === 'cash_ves') return 'VES';
      return null;
    };
    const resolveChangeCashCurrency = (record: SalePaymentRecord): 'USD' | 'VES' | null => {
      if (record.cashChangeDenominationsCurrency === 'USD' || record.cashChangeDenominationsCurrency === 'VES') {
        return record.cashChangeDenominationsCurrency;
      }
      const method = normalizeMethod((record as any).cashChangeMethod ?? record.method);
      if (method === 'cash_usd') return 'USD';
      if (method === 'cash_ves') return 'VES';
      return null;
    };

    const aggregate = (
      denoms: number[],
      records: SalePaymentRecord[],
      key: 'cashDenominations' | 'cashChangeDenominations',
      targetCurrency: 'USD' | 'VES'
    ) => {
      const map = new Map<number, CashDenominationFlow>();
      for (const d of denoms) {
        map.set(d, { denom: d, receivedQty: 0, receivedTotal: 0, givenAsChangeQty: 0, givenAsChangeTotal: 0, netQty: 0, netTotal: 0 });
      }
      for (const r of records) {
        const currencyForRecord = key === 'cashDenominations'
          ? resolvePaymentCashCurrency(r)
          : resolveChangeCashCurrency(r);
        if (currencyForRecord !== targetCurrency) continue;
        const arr = r[key] as CashDenominationEntry[] | undefined;
        if (!Array.isArray(arr)) continue;
        for (const e of arr) {
          const d = Number(e.denom);
          const q = Number(e.qty) || 0;
          if (!map.has(d)) continue; // skip unknown denominations
          const entry = map.get(d)!;
          if (key === 'cashDenominations') {
            entry.receivedQty += q;
            entry.receivedTotal += d * q;
          } else {
            entry.givenAsChangeQty += q;
            entry.givenAsChangeTotal += d * q;
          }
        }
      }
      // Calculate net
      for (const entry of map.values()) {
        entry.netQty = entry.receivedQty - entry.givenAsChangeQty;
        entry.netTotal = entry.receivedTotal - entry.givenAsChangeTotal;
      }
      return Array.from(map.values()).filter(x => x.receivedQty > 0 || x.givenAsChangeQty > 0);
    };

    const vesReceived = aggregate(DENOMS_VES, paymentDetails, 'cashDenominations', 'VES');
    const vesGiven = aggregate(DENOMS_VES, paymentDetails, 'cashChangeDenominations', 'VES');
    const usdReceived = aggregate(DENOMS_USD, paymentDetails, 'cashDenominations', 'USD');
    const usdGiven = aggregate(DENOMS_USD, paymentDetails, 'cashChangeDenominations', 'USD');

    // Merge received and given
    const merge = (received: CashDenominationFlow[], given: CashDenominationFlow[]): CashDenominationFlow[] => {
      const map = new Map<number, CashDenominationFlow>();
      for (const r of received) map.set(r.denom, { ...r });
      for (const g of given) {
        const existing = map.get(g.denom);
        if (existing) {
          existing.givenAsChangeQty = g.givenAsChangeQty;
          existing.givenAsChangeTotal = g.givenAsChangeTotal;
          existing.netQty = existing.receivedQty - existing.givenAsChangeQty;
          existing.netTotal = existing.receivedTotal - existing.givenAsChangeTotal;
        } else {
          map.set(g.denom, { ...g, receivedQty: 0, receivedTotal: 0, netQty: -g.givenAsChangeQty, netTotal: -g.givenAsChangeTotal });
        }
      }
      return Array.from(map.values()).sort((a, b) => b.denom - a.denom);
    };

    const VES = merge(vesReceived, vesGiven);
    const USD = merge(usdReceived, usdGiven);

    const totalReceivedVES = VES.reduce((s, x) => s + x.receivedTotal, 0);
    const totalReceivedUSD = USD.reduce((s, x) => s + x.receivedTotal, 0);
    const totalGivenVES = VES.reduce((s, x) => s + x.givenAsChangeTotal, 0);
    const totalGivenUSD = USD.reduce((s, x) => s + x.givenAsChangeTotal, 0);

    return {
      VES,
      USD,
      summary: {
        totalReceivedVES,
        totalReceivedUSD,
        totalGivenVES,
        totalGivenUSD,
        netVES: totalReceivedVES - totalGivenVES,
        netUSD: totalReceivedUSD - totalGivenUSD
      }
    };
  }

  async sanitizeOrphanSessions(cutoffDays: number = 1): Promise<{ fixed: number; ids: string[] }> {
    this.ensureCashBoxSessionsSubscription();
    const cutoff = new Date(Date.now() - cutoffDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const orphans = this.cashBoxSessions.filter(s => s.status === 'OPEN' && s.openDate < cutoff);
    const now = new Date().toISOString();
    const fixed: string[] = [];
    for (const s of orphans) {
      try {
        await updateDoc(doc(db, 'cashbox_sessions', s.id), {
          status: 'CLOSED',
          closeDate: s.openDate,
          closeTime: '00:00',
          closingNote: 'Sesión huérfana cerrada automáticamente por saneamiento de datos',
          finalAmountUSD: 0,
          finalAmountVES: 0,
          updatedAt: now
        });
        fixed.push(s.id);
      } catch (e) {
        console.warn(`No se pudo sanear sesión ${s.id}:`, e);
      }
    }
    return { fixed: fixed.length, ids: fixed };
  }

  // Enhanced Cash Box Audit with Credit Sales and Partial Payments Support
  async getCashBoxEnhancedAudit(sessionId: string): Promise<CashBoxEnhancedAudit> {
    this.ensureCashBoxSessionsSubscription();

    const session = this.cashBoxSessions.find(s => s.id === sessionId);
    if (!session) {
      throw new Error('Sesión de caja no encontrada');
    }

    // Get all sales data for this session
    const saleAudits = await this.getCashBoxSales(session);
    const paymentDetails = await this.getCashBoxPaymentDetails(session);

    // Get AR payments (abonos) made during this session
    const arPayments = await this.getARPaymentsForSession(session);

    // Combine sale payments and AR payments
    const allPayments: CashBoxPaymentAuditDetail[] = [
      ...paymentDetails.map(p => this.enhancePaymentDetail(p, saleAudits)),
      ...arPayments
    ];

    // Separate credit sales from regular sales
    const creditSales = this.analyzeCreditSales(saleAudits, paymentDetails);

    // Build Bank -> Method -> Currency breakdown
    const bankMethodBreakdown = this.buildBankMethodBreakdown(allPayments);

    // Build reconciliation lines (comparing declared vs system)
    const reconciliationLines = await this.buildEnhancedReconciliation(session, allPayments);

    // Build inventory dispatch with proper units
    const inventoryDispatch = this.buildInventoryDispatch(saleAudits);

    // Build accounting impact summary
    const accountingImpact = this.buildAccountingImpact(allPayments, bankMethodBreakdown);

    // Calculate totals
    const cashReceivedUSD = allPayments
      .filter(p => !p.isCreditDownPayment)
      .reduce((sum, p) => sum + p.amountUSD, 0);
    const cashReceivedVES = allPayments
      .filter(p => !p.isCreditDownPayment)
      .reduce((sum, p) => sum + p.amountVES, 0);

    return {
      session,
      payments: allPayments,
      creditSales,
      bankMethodBreakdown,
      reconciliationLines,
      inventoryDispatch,
      accountingImpact,
      totals: {
        cashReceivedUSD: roundMoney(cashReceivedUSD),
        cashReceivedVES: roundMoney(cashReceivedVES),
        creditSalesUSD: roundMoney(creditSales.totalCreditIssuedUSD),
        creditSalesVES: roundMoney(creditSales.totalCreditIssuedUSD * (session.openRateBCV || 1)),
        totalTransactions: allPayments.length,
        totalItemsSold: inventoryDispatch.reduce((sum, item) => sum + item.qtyOut, 0)
      }
    };
  }

  private enhancePaymentDetail(
    payment: SalePaymentRecord,
    saleAudits: CashBoxSaleAudit[]
  ): CashBoxPaymentAuditDetail {
    const sale = saleAudits.find(s => s.saleId === payment.saleId);
    const isCreditDownPayment = sale?.paymentMethod?.toUpperCase().includes('CREDIT') || false;
    const invoiceTotalUSD = sale?.totalUSD || 0;
    const invoiceTotalVES = sale?.totalVES || 0;
    const downPaymentUSD = isCreditDownPayment ? payment.amountUSD : 0;
    const remainingCreditUSD = isCreditDownPayment ? (invoiceTotalUSD - downPaymentUSD) : 0;

    return {
      ...payment,
      isCreditDownPayment,
      invoiceTotalUSD,
      invoiceTotalVES,
      remainingCreditUSD
    };
  }

  private async getARPaymentsForSession(session: CashBoxSession): Promise<CashBoxPaymentAuditDetail[]> {
    const startedAt = `${session.openDate}T${session.openTime}:00.000Z`;
    const endedAt = session.status === 'CLOSED' && session.closeDate && session.closeTime
      ? `${session.closeDate}T${session.closeTime}:59.999Z`
      : new Date().toISOString();

    // Query AR payments from Firestore for this session time range
    const paymentsQuery = query(
      collection(db, 'ar_payments'),
      where('createdAt', '>=', startedAt),
      where('createdAt', '<=', endedAt)
    );

    const snap = await getDocs(paymentsQuery);
    return snap.docs.map(d => {
      const p: any = d.data();
      return {
        sourceId: d.id,
        saleId: p.arId || '',
        saleCorrelativo: p.saleCorrelativo || '',
        customerId: p.customerId || '',
        customerName: p.customerName || '',
        method: p.method || 'other',
        currency: p.currency || 'USD',
        amountUSD: Number(p.amountUSD) || 0,
        amountVES: Number(p.amountVES) || 0,
        rateUsed: Number(p.rateUsed) || 0,
        bank: p.bank || '',
        accountId: p.accountId || '',
        accountLabel: p.accountLabel || '',
        reference: p.reference || '',
        note: p.note || '',
        actor: p.actor || '',
        createdAt: p.createdAt || new Date().toISOString(),
        isCreditDownPayment: true,
        invoiceTotalUSD: 0,
        invoiceTotalVES: 0,
        remainingCreditUSD: 0
      };
    });
  }

  private analyzeCreditSales(
    sales: CashBoxSaleAudit[],
    payments: SalePaymentRecord[]
  ): CashBoxEnhancedAudit['creditSales'] {
    const creditInvoices = sales.filter(s =>
      s.paymentMethod?.toUpperCase().includes('CREDIT')
    );

    const invoices = creditInvoices.map(sale => {
      const salePayments = payments.filter(p => p.saleId === sale.saleId);
      const downPaymentUSD = salePayments.reduce((sum, p) => sum + p.amountUSD, 0);
      const creditAmountUSD = sale.totalUSD;

      return {
        saleId: sale.saleId,
        correlativo: sale.correlativo,
        customerName: sale.customerName,
        totalUSD: sale.totalUSD,
        totalVES: sale.totalVES,
        creditAmountUSD,
        downPaymentUSD,
        remainingUSD: roundMoney(creditAmountUSD - downPaymentUSD)
      };
    });

    const totalCreditIssuedUSD = invoices.reduce((sum, inv) => sum + inv.creditAmountUSD, 0);
    const totalDownPaymentsReceivedUSD = invoices.reduce((sum, inv) => sum + inv.downPaymentUSD, 0);

    return {
      invoices,
      totalCreditIssuedUSD: roundMoney(totalCreditIssuedUSD),
      totalDownPaymentsReceivedUSD: roundMoney(totalDownPaymentsReceivedUSD)
    };
  }

  private buildBankMethodBreakdown(
    payments: CashBoxPaymentAuditDetail[]
  ): BankMethodCurrencyBreakdown[] {
    const groups = new Map<string, BankMethodCurrencyBreakdown>();

    for (const payment of payments) {
      const bankName = payment.bank || 'EFECTIVO';
      const accountLabel = payment.accountLabel || 'Caja Principal';
      const key = `${bankName}|${payment.method}|${payment.currency}`;

      if (!groups.has(key)) {
        groups.set(key, {
          bankId: payment.bank ? this.resolveBankIdByName(payment.bank) : undefined,
          bankName,
          accountId: payment.accountId,
          accountLabel,
          method: payment.method,
          currency: payment.currency,
          amountUSD: 0,
          amountVES: 0,
          equivalentUSD: 0,
          transactionCount: 0,
          transactions: []
        });
      }

      const group = groups.get(key)!;
      group.amountUSD += payment.amountUSD;
      group.amountVES += payment.amountVES;
      group.transactionCount++;
      group.transactions.push(payment);

      // Calculate USD equivalent
      if (payment.currency === 'VES' && payment.rateUsed > 0) {
        group.equivalentUSD += payment.amountVES / payment.rateUsed;
      } else {
        group.equivalentUSD += payment.amountUSD;
      }
    }

    // Round values
    for (const group of groups.values()) {
      group.amountUSD = roundMoney(group.amountUSD);
      group.amountVES = roundMoney(group.amountVES);
      group.equivalentUSD = roundMoney(group.equivalentUSD);
    }

    return Array.from(groups.values()).sort((a, b) =>
      a.bankName.localeCompare(b.bankName) ||
      a.method.localeCompare(b.method)
    );
  }

  private async buildEnhancedReconciliation(
    session: CashBoxSession,
    payments: CashBoxPaymentAuditDetail[]
  ): Promise<CashBoxReconciliationLine[]> {
    // Group payments by method
    const methodGroups = new Map<string, {
      method: string;
      currency: 'USD' | 'VES';
      bank?: string;
      accountId?: string;
      accountLabel?: string;
      systemUSD: number;
      systemVES: number;
      count: number;
    }>();

    for (const payment of payments) {
      const key = payment.bank
        ? `${payment.method}|${payment.bank}|${payment.accountId || 'default'}|${payment.currency}`
        : `${payment.method}|${payment.currency}`;

      if (!methodGroups.has(key)) {
        methodGroups.set(key, {
          method: payment.method,
          currency: payment.currency,
          bank: payment.bank,
          accountId: payment.accountId,
          accountLabel: payment.accountLabel,
          systemUSD: 0,
          systemVES: 0,
          count: 0
        });
      }

      const group = methodGroups.get(key)!;
      group.systemUSD += payment.amountUSD;
      group.systemVES += payment.amountVES;
      group.count++;
    }

    // Get declared amounts from session
    const declaredBreakdown = session.closingDeclaredBreakdown || [];

    // Build reconciliation lines
    const allKeys = new Set([
      ...methodGroups.keys(),
      ...declaredBreakdown.map(d =>
        d.bank ? `${d.method}|${d.bank}|${d.accountId || 'default'}` : d.method
      )
    ]);

    return Array.from(allKeys).map(key => {
      const systemGroup = methodGroups.get(key);
      const declared = declaredBreakdown.find(d =>
        d.bank
          ? `${d.method}|${d.bank}|${d.accountId || 'default'}` === key
          : d.method === key
      );

      const systemUSD = systemGroup?.systemUSD || 0;
      const systemVES = systemGroup?.systemVES || 0;
      const declaredUSD = declared?.amountUSD || 0;
      const declaredVES = declared?.amountVES || 0;

      const method = systemGroup?.method || declared?.method || '';
      const inferredCurrency: 'USD' | 'VES' = declared?.currency
        ?? systemGroup?.currency
        ?? (method === 'cash_ves' || method === 'transfer' || method === 'mobile' || method === 'debit' || method === 'biopago' ? 'VES' : 'USD');
      return {
        key,
        method,
        label: this.getCashBoxMethodLabel(method),
        currency: inferredCurrency,
        bank: systemGroup?.bank || declared?.bank,
        accountId: systemGroup?.accountId || declared?.accountId,
        accountLabel: systemGroup?.accountLabel || declared?.accountLabel,
        systemAmountUSD: roundMoney(systemUSD),
        systemAmountVES: roundMoney(systemVES),
        declaredAmountUSD: roundMoney(declaredUSD),
        declaredAmountVES: roundMoney(declaredVES),
        differenceUSD: roundMoney(inferredCurrency === 'USD' ? declaredUSD - systemUSD : 0),
        differenceVES: roundMoney(inferredCurrency === 'VES' ? declaredVES - systemVES : 0),
        count: systemGroup?.count || 0
      };
    }).sort((a, b) => (a.bank || '').localeCompare(b.bank || '') || a.label.localeCompare(b.label));
  }

  private buildInventoryDispatch(sales: CashBoxSaleAudit[]): InventoryDispatchDetail[] {
    const dispatch: InventoryDispatchDetail[] = [];

    for (const sale of sales) {
      for (const item of (sale.items || [])) {
        const dispatchLotes = (item as any).dispatchLotes || [];

        if (dispatchLotes.length > 0) {
          for (const lote of dispatchLotes) {
            dispatch.push({
              sku: item.code,
              description: item.description,
              qtyOut: lote.qty || 0,
              unit: item.unit,
              timestamp: sale.timestamp,
              batchId: lote.batchId,
              saleCorrelativo: sale.correlativo,
              customerName: sale.customerName
            });
          }
        } else {
          dispatch.push({
            sku: item.code,
            description: item.description,
            qtyOut: item.qty,
            unit: item.unit,
            timestamp: sale.timestamp,
            batchId: '',
            saleCorrelativo: sale.correlativo,
            customerName: sale.customerName
          });
        }
      }
    }

    return dispatch.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
  }

  private buildAccountingImpact(
    payments: CashBoxPaymentAuditDetail[],
    bankBreakdown: BankMethodCurrencyBreakdown[]
  ): AccountingImpactLine[] {
    const impacts: AccountingImpactLine[] = [];

    // Cash impact (non-bank payments)
    const cashPayments = payments.filter(p => !p.bank);
    if (cashPayments.length > 0) {
      const cashUSD = cashPayments.filter(p => p.currency === 'USD').reduce((s, p) => s + p.amountUSD, 0);
      const cashVES = cashPayments.filter(p => p.currency === 'VES').reduce((s, p) => s + p.amountVES, 0);

      if (cashUSD > 0) {
        impacts.push({
          accountType: 'CASH',
          accountName: 'Caja Chica $',
          currency: 'USD',
          amountUSD: roundMoney(cashUSD),
          amountVES: 0,
          transactionCount: cashPayments.filter(p => p.currency === 'USD').length
        });
      }
      if (cashVES > 0) {
        impacts.push({
          accountType: 'CASH',
          accountName: 'Caja Chica Bs',
          currency: 'VES',
          amountUSD: 0,
          amountVES: roundMoney(cashVES),
          transactionCount: cashPayments.filter(p => p.currency === 'VES').length
        });
      }
    }

    // Bank impacts
    for (const breakdown of bankBreakdown) {
      if (breakdown.bankId) {
        impacts.push({
          accountType: 'BANK',
          accountName: `${breakdown.bankName} - ${breakdown.accountLabel}`,
          bankName: breakdown.bankName,
          accountLabel: breakdown.accountLabel,
          currency: breakdown.currency,
          amountUSD: breakdown.currency === 'USD' ? breakdown.amountUSD : 0,
          amountVES: breakdown.currency === 'VES' ? breakdown.amountVES : 0,
          transactionCount: breakdown.transactionCount
        });
      }
    }

    return impacts.sort((a, b) =>
      a.accountType.localeCompare(b.accountType) ||
      a.accountName.localeCompare(b.accountName)
    );
  }

  switchUser(roleOrUserId: UserRole | string) {
    const requested = String(roleOrUserId ?? '').trim();
    const user = this.users.find(u => u.id === requested && u.active)
      ?? this.users.find(u => u.role === requested && u.active);
    if (user) {
      this.currentUser = user;
      // Re-evaluar currentSession para el nuevo usuario con los datos ya en memoria
      const openSession = this.cashBoxSessions.find(s => s.status === 'OPEN' && s.userId === user.id);
      this.currentSession = openSession || null;
      this.addAuditEntry('AUTH', 'SESSION', `Sesión iniciada: ${user.name} (${user.role})`);
    }
    this.notify();
  }

  public async addAuditEntry(action: string, entity: string, details: string) {
    await supabase.from('movements').insert({
      type: action,
      product_code: entity,
      reason: details,
      operator: this.currentUser?.name || 'Sistema',
      warehouse: 'SISTEMA',
      quantity: 0
    });
  }

  async getNextProductCode(): Promise<string> {
    // Consultar BD directamente para tener los códigos reales (incluyendo huecos por eliminaciones)
    try {
      console.log('Obteniendo siguiente código de producto desde BD...');
      
      const { data: existingProducts, error } = await supabase
        .from('products')
        .select('code')
        .like('code', 'P-%');
      
      if (error) {
        console.warn('Error consultando BD, usando fallback local:', error);
        return this.getNextProductCodeFallback();
      }
      
      // Construir set de números ocupados
      const existingNums = new Set(
        (existingProducts || [])
          .map(p => String(p.code ?? '').trim().toUpperCase())
          .filter(code => /^P-\d+$/.test(code))
          .map(code => parseInt(code.replace('P-', '')))
      );
      
      console.log(`Códigos P-XXXX en BD: ${existingNums.size}`);
      
      // Buscar el PRIMER número disponible desde 1 (respeta huecos dejados por eliminaciones)
      for (let i = 1; i <= 9999; i++) {
        if (!existingNums.has(i)) {
          const nextCode = `P-${i.toString().padStart(4, '0')}`;
          console.log(`Siguiente código disponible: ${nextCode}`);
          return nextCode;
        }
      }
      
      // Fallback extremo: max + 1
      const max = existingNums.size > 0 ? Math.max(...existingNums) : 0;
      return `P-${(max + 1).toString().padStart(4, '0')}`;
      
    } catch (error) {
      console.warn('Error en getNextProductCode, usando fallback:', error);
      return this.getNextProductCodeFallback();
    }
  }

  private getNextProductCodeFallback(): string {
    // Fallback usando arrays locales (mismo algoritmo: primer hueco disponible)
    console.log('Usando fallback local para generar código de producto...');
    
    const existingNums = new Set(
      [...this.products, ...this.allProducts]
        .map(p => String(p.code ?? '').trim().toUpperCase())
        .filter(code => /^P-\d+$/.test(code))
        .map(code => parseInt(code.replace('P-', '')))
    );

    console.log(`Fallback - Códigos locales encontrados: ${existingNums.size}`);
    
    // Primer número disponible desde 1
    for (let i = 1; i <= 9999; i++) {
      if (!existingNums.has(i)) {
        const nextCode = `P-${i.toString().padStart(4, '0')}`;
        console.log(`Fallback - Siguiente código disponible: ${nextCode}`);
        return nextCode;
      }
    }
    
    const max = existingNums.size > 0 ? Math.max(...existingNums) : 0;
    return `P-${(max + 1).toString().padStart(4, '0')}`;
  }

  // MEJORA: Función para eliminar productos y liberar correlativos
  async deleteProduct(productCode: string): Promise<boolean> {
    try {
      console.log(`Eliminando producto ${productCode} y liberando correlativo...`);
      
      // 1. Verificar que el producto existe (buscar en allProducts, no solo en catálogo activo)
      let product = this.allProducts.find(p => String(p.code ?? '').trim().toUpperCase() === productCode.toUpperCase());
      if (!product) {
        // Si no se encuentra en allProducts, verificar directamente en la base de datos
        console.log(`Producto ${productCode} no encontrado en array local, verificando en base de datos...`);
        const { data: dbProduct, error } = await supabase
          .from('products')
          .select('code, description')
          .eq('code', productCode)
          .single();
        
        if (error || !dbProduct) {
          throw new Error(`El producto ${productCode} no existe en el sistema.`);
        }
        
        console.log(`Producto ${productCode} encontrado en base de datos: ${dbProduct.description}`);
        // Crear un objeto producto mínimo para continuar con la eliminación
        product = {
          code: dbProduct.code,
          description: dbProduct.description,
          lotes: []
        };
      }
      
      // 2. Verificar que no tenga stock en ningún lote
      let totalStock = 0;
      if (product.lotes && product.lotes.length > 0) {
        totalStock = product.lotes.reduce((sum, lote) => sum + (Number(lote.qty) || 0), 0);
      }
      
      // Si no se encontró stock en el array local, verificar directamente en la base de datos
      if (totalStock === 0) {
        console.log(`Verificando stock del producto ${productCode} directamente en base de datos...`);
        const { data: batches, error: batchError } = await supabase
          .from('inventory_batches')
          .select('quantity')
          .eq('product_code', productCode);
        
        if (!batchError && batches) {
          totalStock = batches.reduce((sum, batch) => sum + (Number(batch.quantity) || 0), 0);
        }
      }
      
      if (totalStock > 0) {
        throw new Error(`No se puede eliminar el producto ${productCode} porque tiene ${totalStock} unidades en stock. Debe vender o devolver todo el stock primero.`);
      }
      
      // 3. Eliminar lotes del producto (aunque no tengan stock)
      if (product.lotes && product.lotes.length > 0) {
        const { error: batchError } = await supabase
          .from('inventory_batches')
          .delete()
          .eq('product_code', productCode);
        
        if (batchError) {
          console.warn('Advertencia: No se pudieron eliminar todos los lotes:', batchError);
        }
      }
      
      // 4. Eliminar el producto de la base de datos
      const { error: productError } = await supabase
        .from('products')
        .delete()
        .eq('code', productCode);
      
      if (productError) {
        throw new Error(`Error eliminando el producto: ${productError.message}`);
      }
      
      // 5. Eliminar del array local (ambos arrays)
      this.products = this.products.filter(p => String(p.code ?? '').trim().toUpperCase() !== productCode.toUpperCase());
      this.allProducts = this.allProducts.filter(p => String(p.code ?? '').trim().toUpperCase() !== productCode.toUpperCase());
      
      console.log(`Producto ${productCode} eliminado exitosamente. Correlativo ${productCode} liberado.`);
      
      return true;
    } catch (error) {
      console.error(`Error eliminando producto ${productCode}:`, error);
      throw error;
    }
  }

  // MEJORA: Función para rollback de productos creados en compra fallida
  async rollbackCreatedProducts(createdProducts: ProductStock[]): Promise<void> {
    console.log(`Haciendo rollback de ${createdProducts.length} productos creados...`);
    
    for (const product of createdProducts) {
      try {
        await this.deleteProduct(product.code);
        console.log(`Rollback exitoso: Producto ${product.code} eliminado.`);
      } catch (error) {
        console.error(`Error en rollback del producto ${product.code}:`, error);
        // Continuar con los demás productos aunque uno falle
      }
    }
  }

  // MEJORA: Función especial para eliminar productos con stock basura de compras fallidas
  async deleteProductWithGarbageStock(productCode: string): Promise<boolean> {
    try {
      console.log(`Eliminando producto ${productCode} con stock basura de compra fallida...`);
      
      // 1. Verificar que el producto existe (buscar en allProducts)
      let product = this.allProducts.find(p => String(p.code ?? '').trim().toUpperCase() === productCode.toUpperCase());
      if (!product) {
        // Si no se encuentra, verificar directamente en la base de datos
        console.log(`Producto ${productCode} no encontrado en array local, verificando en base de datos...`);
        const { data: dbProduct, error } = await supabase
          .from('products')
          .select('code, description')
          .eq('code', productCode)
          .single();
        
        if (error || !dbProduct) {
          throw new Error(`El producto ${productCode} no existe en el sistema.`);
        }
        
        console.log(`Producto ${productCode} encontrado en base de datos: ${dbProduct.description}`);
        product = {
          code: dbProduct.code,
          description: dbProduct.description,
          lotes: []
        };
      }
      
      // 2. Eliminar FORZADAMENTE todos los lotes del producto (incluso con stock)
      console.log(`Eliminando todos los lotes del producto ${productCode} (incluso con stock)...`);
      const { error: batchError } = await supabase
        .from('inventory_batches')
        .delete()
        .eq('product_code', productCode);
      
      if (batchError) {
        console.warn('Advertencia: No se pudieron eliminar todos los lotes:', batchError);
        throw new Error(`Error eliminando lotes del producto: ${batchError.message}`);
      }
      
      console.log(`Todos los lotes del producto ${productCode} eliminados.`);
      
      // 3. Eliminar movimientos del producto (limpiar kardex basura)
      console.log(`Eliminando movimientos del producto ${productCode}...`);
      const { error: movementError } = await supabase
        .from('movements')
        .delete()
        .eq('product_code', productCode);
      
      if (movementError) {
        console.warn('Advertencia: No se pudieron eliminar todos los movimientos:', movementError);
      } else {
        console.log(`Movimientos del producto ${productCode} eliminados.`);
      }
      
      // 4. Eliminar el producto de la base de datos
      console.log(`Eliminando producto ${productCode} de la base de datos...`);
      const { error: productError } = await supabase
        .from('products')
        .delete()
        .eq('code', productCode);
      
      if (productError) {
        throw new Error(`Error eliminando el producto: ${productError.message}`);
      }
      
      // 5. Eliminar del array local (ambos arrays)
      this.products = this.products.filter(p => String(p.code ?? '').trim().toUpperCase() !== productCode.toUpperCase());
      this.allProducts = this.allProducts.filter(p => String(p.code ?? '').trim().toUpperCase() !== productCode.toUpperCase());
      
      console.log(`Producto ${productCode} con stock basura eliminado exitosamente. Correlativo ${productCode} liberado.`);
      
      return true;
    } catch (error) {
      console.error(`Error eliminando producto ${productCode} con stock basura:`, error);
      throw error;
    }
  }

  // FUNCIÓN SUPERUSUARIO: Eliminar productos con errores de compra (solo superUsuario/Master)
  async superUsuario(productCode: string): Promise<string> {
    // Verificar permisos
    if (!this.hasPermission('superUsuario') && !this.hasPermission('Master')) {
      throw new Error('❌ ACCESO DENEGADO: Solo usuarios superUsuario o Master pueden usar esta función.');
    }

    try {
      console.log(`🔧 SUPERUSUARIO: Eliminando producto ${productCode} con errores de compra...`);
      
      // 1. Eliminar lotes
      await supabase.from('inventory_batches').delete().eq('product_code', productCode);
      
      // 2. Eliminar movimientos
      await supabase.from('movements').delete().eq('product_code', productCode);
      
      // 3. Eliminar producto
      await supabase.from('products').delete().eq('code', productCode);
      
      // 4. Actualizar arrays locales
      this.products = this.products.filter(p => p.code !== productCode);
      this.allProducts = this.allProducts.filter(p => p.code !== productCode);
      
      const message = `✅ SUPERUSUARIO: Producto ${productCode} eliminado completamente. Correlativo liberado.`;
      console.log(message);
      return message;
      
    } catch (error) {
      const errorMsg = `❌ Error eliminando ${productCode}: ${error.message}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // --- MÉTODOS COMPATIBLES CON LA UI ---

  getAllStocks() {
    const source = this.allProducts.length > 0 ? this.allProducts : this.products;
    return source.map(p => {
      const aggregates = { d3: 0, d2: 0, a1: 0 };
      (p.lotes || []).forEach(l => {
        const wh = String(l.warehouse ?? '').toLowerCase();
        if (wh.includes('d3') || wh.includes('galpon')) aggregates.d3 += Number(l.qty) || 0;
        else if (wh.includes('d2') || wh.includes('pesa')) aggregates.d2 += Number(l.qty) || 0;
        else if (wh.includes('a1') || wh.includes('exib')) aggregates.a1 += Number(l.qty) || 0;
      });
      return { ...p, ...aggregates };
    });
  }

  getStocks() {
    // CORRECCIÓN: Usar la misma lógica que getAllStocks() para consistencia
    const source = this.allProducts.length > 0 ? this.allProducts : this.products;
    return source.map(p => {
      const aggregates = { d3: 0, d2: 0, a1: 0 };
      (p.lotes || []).forEach(l => {
        const wh = String(l.warehouse ?? '').toLowerCase();
        if (wh.includes('d3') || wh.includes('galpon')) aggregates.d3 += Number(l.qty) || 0;
        else if (wh.includes('d2') || wh.includes('pesa')) aggregates.d2 += Number(l.qty) || 0;
        else if (wh.includes('a1') || wh.includes('exib')) aggregates.a1 += Number(l.qty) || 0;
      });
      return { ...p, ...aggregates };
    });
  }

  getSales() { return this.sales; }

  /**
   * Venta con líneas de detalle para la UI de devolución: lee `items` en Supabase (jsonb)
   * y, si faltan (venta antigua o RLS), rellena con la auditoría de caja en Firestore (`cashbox_sales`).
   */
  async getSaleForReturn(saleId: string): Promise<SaleHistoryEntry | null> {
    const id = String(saleId ?? '').trim();
    if (!id) return null;

    let fromSupabase: SaleHistoryEntry | null = null;
    try {
      const { data, error } = await supabase.from('sales').select('*').eq('id', id).maybeSingle();
      if (!error && data) fromSupabase = mapSupabaseSaleRowToHistoryEntry(data);
    } catch (e) {
      console.warn('[getSaleForReturn] Supabase:', e);
    }

    if (fromSupabase && Array.isArray(fromSupabase.items) && fromSupabase.items.length > 0) {
      return fromSupabase;
    }

    try {
      const snap = await getDoc(doc(db, 'cashbox_sales', id));
      if (snap.exists()) {
        const d: any = snap.data();
        const fromAudit = parseSaleLineItemsFromDb(d?.items);
        if (fromAudit.length > 0) {
          if (fromSupabase) {
            return {
              ...fromSupabase,
              items: fromAudit,
              payments:
                Array.isArray(d?.payments) && d.payments.length > 0
                  ? d.payments
                  : fromSupabase.payments
            };
          }
          return {
            id: String(d.saleId ?? d.id ?? id),
            correlativo: String(d.correlativo ?? ''),
            client: {
              name: String(d.customerName ?? ''),
              id: String(d.customerId ?? ''),
              address: '',
              phone: '',
              type: 'Natural'
            } as BillingClient,
            items: fromAudit,
            payments: Array.isArray(d.payments) ? d.payments : [],
            totalUSD: Number(d.totalUSD ?? 0) || 0,
            totalVES: Number(d.totalVES ?? 0) || 0,
            paymentMethod: String(d.paymentMethod ?? 'MIXTO'),
            exchangeRate: Number(d.exchangeRate ?? 0) || 0,
            captures: [],
            timestamp: d.timestamp ? new Date(d.timestamp) : new Date(),
            operatorName: d.userName,
            userId: d.userId
          } as SaleHistoryEntry;
        }
      }
    } catch (e) {
      console.warn('[getSaleForReturn] cashbox_sales:', e);
    }

    return fromSupabase;
  }

  getSalesForCurrentSession(): CashBoxSaleAudit[] {
    return this.currentSessionSales;
  }

  subscribeCurrentSessionSales(sessionId: string): void {
    if (this.currentSessionSalesUnsubscribe) {
      this.currentSessionSalesUnsubscribe();
      this.currentSessionSalesUnsubscribe = null;
    }
    if (!sessionId) {
      this.currentSessionSales = [];
      this.notify();
      return;
    }
    const q = query(
      collection(db, 'cashbox_sales'),
      where('cashBoxSessionId', '==', sessionId),
      orderBy('timestamp', 'desc')
    );
    this.currentSessionSalesUnsubscribe = onSnapshot(q, (snap) => {
      this.currentSessionSales = snap.docs.map(d => ({ id: d.id, ...d.data() } as CashBoxSaleAudit));
      this.notify();
    }, (err) => {
      console.error('Error cargando ventas del turno:', err);
    });
  }

  clearCurrentSessionSales(): void {
    if (this.currentSessionSalesUnsubscribe) {
      this.currentSessionSalesUnsubscribe();
      this.currentSessionSalesUnsubscribe = null;
    }
    this.currentSessionSales = [];
    this.notify();
  }

  getAccountingAlerts(): AccountingAlert[] {
    const alerts: AccountingAlert[] = [];
    const OTHERS_ACCOUNTING = ['CxP', 'CxC', 'DxC', 'DxV', 'Ant. Cliente', 'Ant. Proveedores'];
    for (const sale of this.sales) {
      const payments: any[] = Array.isArray(sale.payments) ? sale.payments : [];
      for (const p of payments) {
        const method = String(p?.method ?? '').trim();
        if (method !== 'others') continue;
        const bankField = String(p?.bank ?? p?.note ?? '').trim();
        const noteField = String(p?.note ?? '').trim();
        const othersType = OTHERS_ACCOUNTING.find(t => bankField.startsWith(t) || noteField.startsWith(t)) ?? bankField;
        if (!othersType) continue;
        const meta = ACCOUNTING_ALERT_META[othersType] ?? { label: othersType, description: `Operación tipo "${othersType}" registrada en ventas.`, severity: 'warning' as const };
        alerts.push({
          id: `acct-${sale.id ?? sale.correlativo}-${p?.id ?? Math.random().toString(36).slice(2)}`,
          saleId: String(sale.id ?? ''),
          correlativo: String(sale.correlativo ?? ''),
          clientName: String(sale.client?.name ?? ''),
          date: sale.timestamp instanceof Date ? sale.timestamp.toISOString() : String(sale.timestamp ?? ''),
          othersType,
          amountUSD: Number(p?.amountUSD ?? 0) || 0,
          amountVES: Number(p?.amountVES ?? 0) || 0,
          note: noteField,
          label: meta.label,
          description: meta.description,
          severity: meta.severity
        });
      }
    }

    // FIN-06: AP overdue and near-due (≤3 days) alerts
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in3 = new Date(today); in3.setDate(today.getDate() + 3);
    for (const ap of this.getAPEntries()) {
      if (ap.status === 'PAID') continue;
      const due = ap.dueDate instanceof Date ? ap.dueDate : new Date(ap.dueDate);
      const isOverdue = due < today;
      const isDueSoon = !isOverdue && due <= in3;
      if (!isOverdue && !isDueSoon) continue;
      const daysLeft = Math.round((due.getTime() - today.getTime()) / 86400000);
      alerts.push({
        id: `fin-ap-${ap.id}`,
        saleId: '',
        correlativo: ap.id,
        clientName: ap.supplier,
        date: due.toISOString(),
        othersType: isOverdue ? 'AP VENCIDA' : 'AP PRÓXIMA',
        amountUSD: Number(ap.balanceUSD ?? 0),
        amountVES: 0,
        note: '',
        label: isOverdue ? `CxP Vencida — ${ap.supplier}` : `CxP vence en ${daysLeft}d — ${ap.supplier}`,
        description: isOverdue
          ? `Factura AP vencida hace ${Math.abs(daysLeft)} día(s). Saldo: $${Number(ap.balanceUSD ?? 0).toFixed(2)}`
          : `Factura AP vence el ${due.toLocaleDateString('es-VE')}. Saldo: $${Number(ap.balanceUSD ?? 0).toFixed(2)}`,
        severity: isOverdue ? 'error' : 'warning',
        daysOverdue: isOverdue ? Math.abs(daysLeft) : undefined,
        daysUntilDue: isDueSoon ? daysLeft : undefined
      });
    }

    // FIN-06: AR overdue (>7 days past due) alerts
    const in7ago = new Date(today); in7ago.setDate(today.getDate() - 7);
    for (const ar of this.getAREntries()) {
      if (ar.status === 'PAID' || ar.status === 'VOID') continue;
      const due = ar.dueDate instanceof Date ? ar.dueDate : new Date(ar.dueDate);
      if (due >= in7ago) continue;
      const daysOverdue = Math.round((today.getTime() - due.getTime()) / 86400000);
      alerts.push({
        id: `fin-ar-${ar.id}`,
        saleId: ar.saleCorrelativo ?? '',
        correlativo: ar.saleCorrelativo ?? ar.id,
        clientName: ar.customerName,
        date: due.toISOString(),
        othersType: 'AR MORA',
        amountUSD: Number(ar.balanceUSD ?? 0),
        amountVES: 0,
        note: '',
        label: `CxC en mora — ${ar.customerName}`,
        description: `Factura AR lleva ${daysOverdue} días vencida. Saldo: $${Number(ar.balanceUSD ?? 0).toFixed(2)}`,
        severity: daysOverdue > 30 ? 'error' : 'warning',
        daysOverdue
      });
    }

    return alerts;
  }

  getAuditTrail() { return this.auditLog; }

  // CORRELATIVO FIX: Generate unique correlativo by querying DB for the last one
  async getNextCorrelativo(kind: 'STANDARD' | 'CREDIT' = 'STANDARD'): Promise<string> {
    const prefix = kind === 'CREDIT' ? 'C-' : 'G-';
    const padLength = kind === 'CREDIT' ? 6 : 8;

    try {
      // Query the last sale with this prefix to find max correlativo
      const { data, error } = await supabase
        .from('sales')
        .select('correlativo')
        .ilike('correlativo', `${prefix}%`)
        .order('date', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('Error fetching last correlativo:', error);
        // Fallback to memory counter + random suffix to avoid collision
        const counter = kind === 'CREDIT' ? this.nextCreditCorrelativo++ : this.nextCorrelativo++;
        return `${prefix}${counter.toString().padStart(padLength, '0')}`;
      }

      // Extract the highest number from existing correlativos
      let maxNumber = 0;
      if (data && data.length > 0) {
        for (const sale of data) {
          const corr = String(sale.correlativo || '').trim().toUpperCase();
          if (corr.startsWith(prefix)) {
            const numPart = corr.substring(prefix.length);
            const num = parseInt(numPart, 10);
            if (Number.isFinite(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        }
      }

      // Generate next correlativo
      const nextNumber = maxNumber + 1;
      const correlativo = `${prefix}${nextNumber.toString().padStart(padLength, '0')}`;

      // Update memory counters to match
      if (kind === 'CREDIT') {
        this.nextCreditCorrelativo = nextNumber + 1;
      } else {
        this.nextCorrelativo = nextNumber + 1;
      }

      return correlativo;
    } catch (err) {
      console.error('Error generating correlativo:', err);
      // Emergency fallback with timestamp to ensure uniqueness
      const timestamp = Date.now().toString().slice(-6);
      const counter = kind === 'CREDIT' ? this.nextCreditCorrelativo++ : this.nextCorrelativo++;
      return `${prefix}${counter.toString().padStart(padLength - 6, '0')}${timestamp}`;
    }
  }

  // Deprecated: use getNextCorrelativo instead
  getCorrelativoString(kind: 'STANDARD' | 'CREDIT' = 'STANDARD') {
    if (kind === 'CREDIT') {
      return `C-${this.nextCreditCorrelativo.toString().padStart(6, '0')}`;
    }
    return `G-${this.nextCorrelativo.toString().padStart(8, '0')}`;
  }

  getContractionIndex() {
    const totalIn = this.movements.filter(m => m.type === 'IN').reduce((a, b) => a + b.qty, 0);
    const totalMerma = this.movements.filter(m => m.type.startsWith('MERMA')).reduce((a, b) => a + Math.abs(b.qty), 0);
    return totalIn > 0 ? (totalMerma / totalIn) * 100 : 0;
  }

  async recordMerma(sku: string, warehouse: string, operator: string, qty: number, type: 'MERMA_NATURAL' | 'MERMA_MANIP', reason: string) {
    // 1. Get batches to deduct from
    const { data: batches } = await supabase.from('inventory_batches')
      .select('*')
      .eq('product_code', sku)
      .eq('warehouse', warehouse)
      .gt('quantity', 0)
      .order('expiry_date', { ascending: true });

    if (batches && batches.length > 0) {
      let remaining = qty;
      for (const b of batches) {
        if (remaining <= 0) break;
        const discount = Math.min(b.quantity, remaining);
        await supabase.from('inventory_batches').update({ quantity: b.quantity - discount }).eq('id', b.id);
        remaining -= discount;
      }
    }

    // 2. Record movement
    await supabase.from('movements').insert({
      product_code: sku,
      type: type,
      quantity: -qty,
      warehouse: warehouse,
      reason: reason,
      operator: operator
    });

    await this.init();
    return true;
  }

  /**
   * Kardex: `movements` (incluye devoluciones duplicadas aquí) + `inventory_movements` histórico,
   * sin duplicar la misma línea lógica.
   */
  getMovements() {
    return this.mergeKardexMovementSources();
  }

  private mergeKardexMovementSources(): InventoryMovement[] {
    const roundK = (n: number) => roundTo(Number(n) || 0, 4);
    const key = (m: InventoryMovement) =>
      `${String(m.sku)}|${String(m.type ?? '').toUpperCase()}|${new Date(m.timestamp).getTime()}|${roundK(m.qty)}|${String(m.reason ?? '').slice(0, 200)}`;
    const seen = new Set<string>();
    const out: InventoryMovement[] = [];
    for (const m of this.movements) {
      const k = key(m);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    for (const m of this.inventoryLedgerMovements) {
      const k = key(m);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(m);
    }
    return out;
  }

  /** Misma línea de detalle para devolución en `inventory_movements` y `movements` (Kardex). */
  private buildSaleReturnMovementReason(params: {
    creditNoteCorrelativo: string;
    saleCorrelativo: string;
    clientName: string;
    userReason: string;
    batchLabel: string;
  }): string {
    const u = String(params.userReason ?? '').trim();
    return [
      `Ingreso por devolución de venta`,
      `NC: ${params.creditNoteCorrelativo}`,
      `Factura origen: ${params.saleCorrelativo}`,
      `Cliente: ${params.clientName}`,
      params.batchLabel,
      u ? `Motivo: ${u}` : ''
    ]
      .filter(Boolean)
      .join(' · ');
  }

  /** Registro en tabla `movements` para que el Kardex vea entradas como las salidas por venta. */
  private async insertMovementsTableSaleReturnLine(input: {
    productCode: string;
    qty: number;
    warehouse: string;
    reason: string;
    operator: string;
    dateIso: string;
  }): Promise<void> {
    try {
      await this.insertMovementWithFallback({
        product_code: input.productCode,
        type: 'SALE_RETURN',
        quantity: Math.abs(Number(input.qty) || 0),
        warehouse: input.warehouse,
        reason: input.reason,
        operator: input.operator,
        date: input.dateIso
      });
    } catch (e) {
      console.warn('[insertMovementsTableSaleReturnLine] Kardex movements:', e);
    }
  }

  /** Normaliza fila de `inventory_movements` a InventoryMovement. */
  private mapSupabaseInventoryMovementRow(row: any): InventoryMovement | null {
    if (!row) return null;
    const sku = String(row.sku ?? row.product_code ?? '')
      .trim();
    if (!sku) return null;
    const qty = Math.abs(Number(row.quantity ?? row.qty ?? 0) || 0);
    if (qty <= 0) return null;
    const ts = row.created_at ?? row.date ?? row.timestamp;
    return {
      id: `inv-${String(row.id)}`,
      type: String(row.type ?? 'SALE_RETURN'),
      sku,
      qty,
      user: String(row.operator ?? row.user ?? ''),
      timestamp: ts ? new Date(ts) : new Date(),
      warehouse: String(row.warehouse ?? ''),
      batchId: row.batch_id != null ? String(row.batch_id) : undefined,
      reason: String(row.reason ?? '')
    };
  }
  getExpenses() { return this.expenses; }

  async addExpense(input: string | {
    description: string;
    amountUSD: number;
    amountVES?: number;
    currency?: 'USD' | 'VES';
    category?: ExpenseCategory;
    supplier?: string;
    paymentMethod?: OperationalExpense['paymentMethod'];
    reference?: string;
  }, amountUSD?: number, _legacyCat?: string) {
    const now = new Date();
    const budgetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let expense: OperationalExpense;
    if (typeof input === 'string') {
      expense = {
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: now,
        description: input,
        amountUSD: amountUSD ?? 0,
        currency: 'USD',
        category: 'OTRO',
        status: 'ACTIVE',
        createdBy: this.currentUser?.name ?? '',
        budgetMonth
      };
    } else {
      expense = {
        id: Math.random().toString(36).substr(2, 9).toUpperCase(),
        timestamp: now,
        description: input.description,
        amountUSD: input.amountUSD,
        amountVES: input.amountVES,
        currency: input.currency ?? 'USD',
        category: input.category ?? 'OTRO',
        supplier: input.supplier,
        paymentMethod: input.paymentMethod,
        reference: input.reference,
        status: 'ACTIVE',
        createdBy: this.currentUser?.name ?? '',
        budgetMonth
      };
    }

    await addDoc(collection(db, 'expenses'), {
      id: expense.id,
      timestamp: expense.timestamp.toISOString(),
      description: expense.description,
      amountUSD: expense.amountUSD,
      amountVES: expense.amountVES ?? 0,
      currency: expense.currency,
      category: expense.category,
      supplier: expense.supplier ?? '',
      paymentMethod: expense.paymentMethod ?? '',
      reference: expense.reference ?? '',
      status: expense.status,
      createdBy: expense.createdBy ?? '',
      budgetMonth: expense.budgetMonth ?? ''
    });

    this.expenses.push(expense);
    this.notify();
    return expense;
  }

  async voidExpense(id: string, reason: string) {
    const idx = this.expenses.findIndex(e => e.id === id);
    if (idx === -1) throw new Error('Gasto no encontrado');
    const now = new Date().toISOString();
    const snap = await getDocs(query(collection(db, 'expenses'), where('id', '==', id)));
    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, {
        status: 'VOID',
        voidReason: reason,
        voidedAt: now,
        voidedBy: this.currentUser?.name ?? ''
      });
    }
    this.expenses[idx] = {
      ...this.expenses[idx],
      status: 'VOID',
      voidReason: reason,
      voidedAt: now,
      voidedBy: this.currentUser?.name ?? ''
    };
    this.notify();
  }

  async registerCashBoxWithdrawal(payload: {
    sessionId: string;
    amount: number;
    currency: 'USD' | 'VES';
    method: 'cash_usd' | 'cash_ves';
    reason: string;
    user: any;
    rateUsed: number;
  }) {
    if (!payload.sessionId) throw new Error('No hay una sesión activa');

    const paymentRecord = {
      saleId: 'DEBIT_WITHDRAWAL',
      saleCorrelativo: 'DEBITO',
      customerId: 'INTERNAL',
      customerName: 'RETIRO DE CAJA',
      method: payload.method,
      currency: payload.currency,
      amountUSD: payload.currency === 'USD' ? -Math.abs(payload.amount) : -Math.abs(payload.amount / payload.rateUsed),
      amountVES: payload.currency === 'VES' ? -Math.abs(payload.amount) : 0,
      rateUsed: payload.rateUsed,
      note: payload.reason,
      actorUserId: payload.user.id,
      actorUserName: payload.user.name,
      cashBoxSessionId: payload.sessionId,
      createdAt: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'sale_payments'), paymentRecord);

    // CAJA-01: Generar bank_transaction para que el retiro impacte el balance bancario
    try {
      // Intentar resolver banco configurado para el método (cash_usd / cash_ves)
      let bankResolution: { bankId: string; bankName: string; accountId: string; accountLabel: string } | null = null;
      try {
        // Buscar primer banco activo que soporte el método
        this.ensureBanksSubscription();
        const matchingBank = this.banks.find(b => {
          if (b.active === false) return false;
          const supported = Array.isArray(b.supportedMethods) ? b.supportedMethods : [];
          return supported.length === 0 || supported.includes(payload.method);
        });
        if (matchingBank) {
          bankResolution = this.resolveBankAccountForMethod({
            bankId: String(matchingBank.id ?? ''),
            paymentMethod: payload.method
          });
        }
      } catch (_) { /* no banco con ese método */ }

      const withdrawalTx: BankTransactionRecord = {
        bankId: bankResolution?.bankId ?? '',
        bankName: bankResolution?.bankName ?? 'CAJA',
        accountId: bankResolution?.accountId ?? '',
        accountLabel: bankResolution?.accountLabel ?? 'Efectivo',
        method: payload.method,
        source: 'SALE_PAYMENT',
        sourceId: docRef.id,
        cashBoxSessionId: payload.sessionId,
        arId: '',
        customerId: 'INTERNAL',
        customerName: 'RETIRO DE CAJA',
        saleCorrelativo: 'DEBITO',
        currency: payload.currency,
        amountUSD: paymentRecord.amountUSD,
        amountVES: paymentRecord.amountVES,
        rateUsed: payload.rateUsed,
        note: payload.reason,
        actor: payload.user?.name ?? 'SISTEMA',
        actorUserId: payload.user?.id ?? '',
        createdAt: new Date().toISOString()
      };
      await addDoc(collection(db, 'bank_transactions'), withdrawalTx as any);
    } catch (e) {
      console.warn('CAJA-01: no se pudo registrar bank_transaction para retiro de caja:', e);
    }

    // Also record as an operational expense for the general ledger
    const displayAmount = payload.currency === 'VES' ? `${payload.amount} Bs` : `$${payload.amount}`;
    const rateText = payload.currency === 'VES' ? ` (Tasa: ${payload.rateUsed})` : '';

    await this.addExpense({
      description: `DEBITO [${displayAmount}]${rateText} - ${payload.reason}`,
      amountUSD: Math.abs(paymentRecord.amountUSD),
      amountVES: payload.currency === 'VES' ? payload.amount : 0,
      currency: payload.currency,
      category: 'OTRO',
      paymentMethod: payload.method
    });

    await this.init();
    return { id: docRef.id, ...paymentRecord };
  }

  getMTDStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const mtdSales = this.sales.filter(s => s.timestamp >= startOfMonth);
    const mtdExpenses = this.expenses.filter(e => e.timestamp >= startOfMonth);

    const totalSalesUSD = mtdSales.reduce((a, b) => a + b.totalUSD, 0);
    const totalExpensesUSD = mtdExpenses.reduce((a, b) => a + b.amountUSD, 0);

    // Cálculo simplificado de margen comercial bruto promedio (si no hay datos, asumimos 30% como fallback seguro)
    // En una versión más pro, calcularíamos (Venta - Costo FEFO) real.
    const averageMargin = 0.35; // 35% de margen industrial estimado

    // Punto de Equilibrio (Ventas requeridas para cubrir gastos)
    const breakEvenUSD = averageMargin > 0 ? (totalExpensesUSD / averageMargin) : 0;

    // Porcentaje de progreso hacia el punto de equilibrio
    const progress = breakEvenUSD > 0 ? Math.min((totalSalesUSD / breakEvenUSD) * 100, 100) : (totalSalesUSD > 0 ? 100 : 0);

    return {
      totalSalesUSD,
      totalExpensesUSD,
      breakEvenUSD,
      progress: Math.round(progress * 10) / 10
    };
  }

  getAPEntries() { return this.apEntries; }

  // CORRECCIÓN: Función para obtener todas las compras (crédito y contado) para el historial
  async getAllPurchaseEntries(): Promise<any[]> {
    try {
      // Forzar recarga de AP entries para obtener datos actualizados
      await this.init(true);
      
      // Obtener compras de Firestore (purchase_entries)
      // Nota: el campo de fecha en el documento es 'createdAt' (string ISO), no 'timestamp'
      const purchaseSnap = await getDocs(collection(db, 'purchase_entries'));
      const rawDocs = purchaseSnap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      // Deduplicar por invoiceGroupId: cada factura guarda un doc por ítem
      // Tomamos el primer doc de cada grupo como representante de la factura completa
      const groupMap = new Map<string, any>();
      for (const data of rawDocs) {
        const groupKey = String(data.invoiceGroupId || data.id).trim();
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, data);
        } else {
          // Si algún ítem del grupo está VOID y otro no, el grupo se considera VOID solo si todos lo están
          const existing = groupMap.get(groupKey);
          if (String(data.status ?? '').toUpperCase() !== 'VOID') {
            existing.status = data.status; // al menos un ítem activo = factura activa
          }
        }
      }

      const purchaseEntries = Array.from(groupMap.values()).map(data => {
        const createdRaw = data.createdAt;
        const ts = createdRaw ? new Date(createdRaw) : new Date();
        return {
          id: data.invoiceGroupId || data.id,
          timestamp: ts,
          supplier: data.supplier || '',
          description: data.invoiceNumber ? `Factura ${data.invoiceNumber}` : 'Compra',
          amountUSD: data.totalInvoiceUSD || 0,
          balanceUSD: 0,
          dueDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          status: data.status === 'VOID' ? 'VOID' : 'PAID',
          paymentType: data.paymentType || 'CASH',
          invoiceNumber: data.invoiceNumber || '',
          warehouse: data.warehouse || '',
          isCashPurchase: true,
          purchaseEntryId: data.id,
          invoiceGroupId: data.invoiceGroupId || data.id
        };
      });

      // Obtener AP entries (compras de crédito) - ahora actualizados
      const apEntriesFormatted = this.apEntries.map(ap => ({
        ...ap,
        isCashPurchase: false,
        purchaseEntryId: ap.id
      }));

      // Combinar y ordenar por fecha
      const allEntries = [...purchaseEntries, ...apEntriesFormatted]
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      console.log(`getAllPurchaseEntries: ${purchaseEntries.length} compras de contado, ${apEntriesFormatted.length} compras de crédito`);
      
      return allEntries;
    } catch (error) {
      console.error('Error al obtener todas las compras:', error);
      return [];
    }
  }

  async addAPEntry(supplier: string, description: string, amountUSD: number, daysToPay: number, supplierId?: string) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysToPay);

    const entry: APEntry = {
      id: `AP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
      timestamp: new Date(),
      supplier,
      supplierId,
      description,
      amountUSD,
      balanceUSD: amountUSD,
      dueDate,
      status: 'PENDING'
    };

    const { error } = await supabase.from('ap_entries').insert({
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      supplier: entry.supplier,
      description: entry.description,
      amount_usd: entry.amountUSD,
      balance_usd: entry.balanceUSD,
      due_date: entry.dueDate.toISOString(),
      status: entry.status
    });

    if (error) {
      console.error('Error al insertar cuenta por pagar:', error);
      throw new Error(`Error de base de datos: ${error.message}`);
    }

    this.apEntries.push(entry);
    this.notify();
    return entry;
  }

  async adjustAPEntryBalance(id: string, deltaUSD: number) {
    const apId = String(id || '').trim();
    if (!apId) return;

    const entry = this.apEntries.find((item) => item.id === apId);
    if (!entry) return;

    const nextBalance = roundMoney(Math.max(0, Number(entry.balanceUSD ?? 0) + (Number(deltaUSD ?? 0) || 0)));
    entry.balanceUSD = nextBalance;
    entry.status = nextBalance <= 0.005 ? 'PAID' : (entry.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING');

    await supabase.from('ap_entries').update({
      balance_usd: entry.balanceUSD,
      status: entry.status
    }).eq('id', apId);

    this.notify();
  }

  async registerAPPayment(id: string, paymentUSD: number) {
    const entry = this.apEntries.find(e => e.id === id);
    if (!entry) return;

    entry.balanceUSD = roundMoney(Math.max(0, (entry.balanceUSD || 0) - (paymentUSD || 0)));
    if (entry.balanceUSD <= 0.005) {
      entry.balanceUSD = 0;
      entry.status = 'PAID';
    }

    await supabase.from('ap_entries').update({
      balance_usd: entry.balanceUSD,
      status: entry.status
    }).eq('id', id);

    this.notify();
  }

  async registerAPPaymentWithSupport(
    id: string,
    paymentUSD: number,
    payload?: {
      note?: string;
      files?: File[];
      method?: string;
      currency?: 'USD' | 'VES';
      amountVES?: number;
      rateUsed?: number;
      bank?: string;
      bankId?: string;
      bankAccountId?: string;
      reference?: string;
    }
  ) {
    return await this.registerAPSplitPayments(id, {
      lines: [{
        amountUSD: paymentUSD,
        note: payload?.note,
        files: payload?.files,
        method: payload?.method,
        currency: payload?.currency,
        amountVES: payload?.amountVES,
        rateUsed: payload?.rateUsed,
        bank: payload?.bank,
        bankId: payload?.bankId,
        bankAccountId: payload?.bankAccountId,
        reference: payload?.reference
      }]
    });
  }

  async registerAPSplitPayments(
    id: string,
    payload: {
      lines: APPaymentLineInput[];
    }
  ) {
    let entry = this.apEntries.find(e => e.id === id);
    if (!entry) {
      const { data, error } = await supabase.from('ap_entries').select('*').eq('id', id).maybeSingle();
      if (error || !data) return;
      entry = {
        id,
        timestamp: new Date((data as any)?.timestamp ?? new Date().toISOString()),
        supplier: String((data as any)?.supplier ?? ''),
        description: String((data as any)?.description ?? ''),
        amountUSD: Number((data as any)?.amount_usd ?? (data as any)?.amountUSD ?? 0) || 0,
        balanceUSD: Number((data as any)?.balance_usd ?? (data as any)?.balanceUSD ?? 0) || 0,
        dueDate: new Date((data as any)?.due_date ?? (data as any)?.dueDate ?? new Date().toISOString()),
        status: (((data as any)?.status ?? 'PENDING') as any)
      };
    }

    if (!entry) throw new Error('No se encontró la cuenta por pagar.');

    const normalizedLines = Array.isArray(payload?.lines)
      ? payload.lines.map((line) => {
        const amountUSD = roundMoney(Number(line?.amountUSD ?? 0) || 0);
        const method = String(line?.method ?? 'transfer').trim().toLowerCase();
        const currency = ((line?.currency ?? this.resolvePaymentCurrency(method)) === 'VES' ? 'VES' : 'USD') as 'USD' | 'VES';
        const rateUsed = Number(line?.rateUsed ?? 0) || 0;
        const amountVES = currency === 'VES'
          ? roundMoney(Number(line?.amountVES ?? 0) || 0)
          : 0;
        // Auto-routing para efectivo (cash_usd/cash_ves) aunque no se seleccione banco
        const bankResolution = (method === 'cash_usd' || method === 'cash_ves')
          ? this.resolveCashBank(method as 'cash_usd' | 'cash_ves')
          : this.resolveBankAccountForMethod({
              bankId: String(line?.bankId ?? '').trim(),
              bankName: String(line?.bank ?? '').trim(),
              paymentMethod: method,
              accountId: String(line?.bankAccountId ?? '').trim()
            });
        if (!bankResolution) {
          throw new Error('Debe seleccionar un banco y una cuenta válidos para cada renglón de pago.');
        }
        if (!Number.isFinite(amountUSD) || amountUSD <= 0) {
          throw new Error('Cada renglón de pago debe tener un monto USD válido.');
        }
        if (currency === 'VES' && (!Number.isFinite(rateUsed) || rateUsed <= 0)) {
          throw new Error('Cada pago en bolívares debe tener una tasa válida.');
        }
        if (currency === 'VES' && (!Number.isFinite(amountVES) || amountVES <= 0)) {
          throw new Error('Cada pago en bolívares debe indicar su monto VES.');
        }
        return {
          amountUSD,
          method,
          currency,
          rateUsed,
          amountVES,
          bankResolution,
          reference: String(line?.reference ?? '').trim(),
          note: String(line?.note ?? '').trim(),
          files: Array.isArray(line?.files) ? line.files : []
        };
      }).filter((line) => line.amountUSD > 0)
      : [];

    if (normalizedLines.length === 0) {
      throw new Error('Debe agregar al menos un renglón de pago.');
    }

    const totalPaymentUSD = roundMoney(normalizedLines.reduce((acc, line) => acc + line.amountUSD, 0));
    if (totalPaymentUSD - Number(entry.balanceUSD ?? 0) > 0.005) {
      throw new Error('La suma de los renglones excede el saldo pendiente de la cuenta por pagar.');
    }

    const groupedUsage = new Map<string, number>();
    for (const line of normalizedLines) {
      const key = `${line.bankResolution.bankId}|${line.bankResolution.accountId}|${line.currency}`;
      const current = groupedUsage.get(key) ?? 0;
      groupedUsage.set(key, roundMoney(current + (line.currency === 'VES' ? line.amountVES : line.amountUSD)));
    }

    for (const [key, total] of groupedUsage.entries()) {
      const [bankId, accountId, currencyValue] = key.split('|');
      const availableBalance = await this.getAvailableBankBalance({
        bankId,
        accountId,
        currency: (currencyValue === 'VES' ? 'VES' : 'USD') as 'USD' | 'VES'
      });
      if (availableBalance + 0.005 < total) {
        throw new Error(`Saldo insuficiente en la cuenta seleccionada. Disponible ${currencyValue === 'VES' ? 'Bs' : '$'} ${availableBalance.toFixed(2)} para consumir ${currencyValue === 'VES' ? 'Bs' : '$'} ${total.toFixed(2)}.`);
      }
    }

    for (const line of normalizedLines) {
      const paymentDoc: APPaymentRecord = {
        apId: id,
        supplier: entry.supplier,
        description: entry.description,
        method: line.method,
        currency: line.currency,
        amountUSD: line.amountUSD,
        amountVES: line.amountVES,
        rateUsed: line.currency === 'VES' ? line.rateUsed : 0,
        bank: line.bankResolution.bankName,
        bankId: line.bankResolution.bankId,
        accountId: line.bankResolution.accountId,
        accountLabel: line.bankResolution.accountLabel,
        reference: line.reference,
        note: line.note,
        supports: [],
        actor: this.currentUser?.name ?? '',
        createdAt: new Date().toISOString(),
        storageProvider: 'none',
        storageBucket: '',
        supportsUploadError: ''
      };

      const paymentRef = await addDoc(collection(db, 'ap_entries', id, 'payments'), paymentDoc as any);
      const upload = await this.uploadSupportFiles(`ap_payments/${id}/${paymentRef.id}`, line.files);
      const supportsToPersist = Array.isArray(upload.supports) ? upload.supports : [];

      await updateDoc(paymentRef, {
        supports: supportsToPersist,
        storageProvider: upload.storageProvider,
        storageBucket: upload.storageBucket ?? '',
        supportsUploadError: upload.supportsUploadError ?? ''
      } as any);

      try {
        await this.appendBankTransaction({
          bankId: line.bankResolution.bankId,
          bankName: line.bankResolution.bankName,
          accountId: line.bankResolution.accountId,
          accountLabel: line.bankResolution.accountLabel,
          method: line.method,
          source: 'AP_PAYMENT',
          sourceId: paymentRef.id,
          arId: '',
          customerId: '',
          customerName: entry.supplier,
          saleCorrelativo: entry.id,
          currency: line.currency,
          amountUSD: -Math.abs(line.amountUSD),
          amountVES: line.currency === 'VES' ? -Math.abs(line.amountVES) : 0,
          rateUsed: line.currency === 'VES' ? line.rateUsed : 0,
          reference: line.reference,
          note: line.note || `Pago de cuenta por pagar: ${entry.supplier}`,
          supports: supportsToPersist,
          actor: this.currentUser?.name ?? '',
          createdAt: new Date().toISOString()
        });
      } catch (e: any) {
        console.warn('No se pudo registrar bank_transaction (AP):', e?.message ?? e);
      }
    }

    const nextBalance = roundMoney(Math.max(0, (Number(entry.balanceUSD ?? 0) || 0) - totalPaymentUSD));
    entry.balanceUSD = nextBalance;
    entry.status = nextBalance <= 0.005 ? 'PAID' : (entry.status === 'OVERDUE' ? 'OVERDUE' : 'PENDING');

    await supabase.from('ap_entries').update({
      balance_usd: entry.balanceUSD,
      status: entry.status
    }).eq('id', id);

    this.notify();
  }

  getAREntries() { return this.arEntries; }

  async applyOverduePenalties(): Promise<void> {
    const now = new Date();
    const LATE_FEE_RATE = 0.01; // 1% sobre el monto original de la factura
    const toUpdate = this.arEntries.filter(e =>
      e.status !== 'PAID' &&
      e.dueDate < now &&
      !e.penaltyAppliedAt
    );
    for (const entry of toUpdate) {
      const fee = roundMoney(entry.amountUSD * LATE_FEE_RATE);
      const newBalance = roundMoney(entry.balanceUSD + fee);
      const appliedAt = now.toISOString();
      entry.lateFeeUSD = fee;
      entry.penaltyAppliedAt = appliedAt;
      entry.balanceUSD = newBalance;
      entry.status = 'OVERDUE';
      try {
        await updateDoc(doc(db, 'ar_entries', entry.id), {
          balanceUSD: newBalance,
          status: 'OVERDUE',
          lateFeeUSD: fee,
          penaltyAppliedAt: appliedAt
        });
      } catch (e) {
        console.error('applyOverduePenalties: no se pudo actualizar', entry.id, e);
      }
    }
    if (toUpdate.length > 0) this.notify();
  }

  async addAREntry(customerName: string, customerId: string, description: string, amountUSD: number, saleCorrelativo: string, daysToPay: number = 15, meta?: Record<string, any>): Promise<string> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + daysToPay);

    const normalizedCorrelativo = (saleCorrelativo || '').trim().toUpperCase().replace(/\s+/g, '');
    const deterministicId = `AR-${normalizedCorrelativo}`;

    const entry: AREntry = {
      id: deterministicId,
      timestamp: new Date(),
      customerName,
      customerId,
      description,
      amountUSD,
      balanceUSD: amountUSD,
      dueDate,
      status: 'PENDING',
      saleCorrelativo,
      lateFeeUSD: 0
    };

    await setDoc(doc(db, 'ar_entries', deterministicId), {
      id: entry.id,
      timestamp: entry.timestamp.toISOString(),
      customerName: entry.customerName,
      customerId: entry.customerId,
      description: entry.description,
      amountUSD: entry.amountUSD,
      balanceUSD: entry.balanceUSD,
      dueDate: entry.dueDate.toISOString(),
      status: entry.status,
      saleCorrelativo: entry.saleCorrelativo,
      lateFeeUSD: 0,
      ...(meta ? { meta } : {})
    }, { merge: true });

    // Always update local array and notify - the realtime listener will sync from Firestore
    const existingIndex = this.arEntries.findIndex(e => e.id === entry.id);
    if (existingIndex >= 0) {
      this.arEntries[existingIndex] = entry; // Update existing
    } else {
      this.arEntries.push(entry); // Add new
    }
    this.notify();
    return deterministicId;
  }

  async registerARPayment(id: string, paymentUSD: number) {
    const entry = this.arEntries.find(e => e.id === id);
    if (!entry) return;

    entry.balanceUSD = roundMoney(Math.max(0, (entry.balanceUSD || 0) - (paymentUSD || 0)));
    if (entry.balanceUSD <= 0.005) {
      entry.balanceUSD = 0;
      entry.status = 'PAID';
    }

    await updateDoc(doc(db, 'ar_entries', id), {
      balanceUSD: entry.balanceUSD,
      status: entry.status
    });

    this.notify();
  }

  async registerARPaymentWithSupport(
    id: string,
    paymentUSD: number,
    payload?: {
      note?: string;
      files?: File[];
      method?: string;
      currency?: 'USD' | 'VES';
      amountVES?: number;
      rateUsed?: number;
      bank?: string;
      reference?: string;
    }
  ) {
    let entry = this.arEntries.find(e => e.id === id);
    if (!entry) {
      const snap = await getDoc(doc(db, 'ar_entries', id));
      if (!snap.exists()) return;
      const d: any = snap.data();
      entry = {
        id,
        timestamp: new Date(d.timestamp ?? new Date().toISOString()),
        customerName: String(d.customerName ?? ''),
        customerId: String(d.customerId ?? ''),
        description: String(d.description ?? ''),
        amountUSD: Number(d.amountUSD ?? 0) || 0,
        balanceUSD: Number(d.balanceUSD ?? 0) || 0,
        dueDate: new Date(d.dueDate ?? new Date().toISOString()),
        status: (d.status ?? 'PENDING') as any,
        saleCorrelativo: String(d.saleCorrelativo ?? '')
      } as any;
    }

    const rateUsed = Number(payload?.rateUsed ?? 0) || 0;
    const currency = (payload?.currency ?? 'USD') as 'USD' | 'VES';
    const amountVES = Number(payload?.amountVES ?? 0) || 0;
    const amountUSD = Number(paymentUSD) || 0;
    const method = String(payload?.method ?? 'AR_PAYMENT');

    const supports: ARPaymentSupport[] = [];
    const paymentDoc: ARPaymentRecord = {
      arId: id,
      customerId: entry.customerId,
      customerName: entry.customerName,
      saleCorrelativo: entry.saleCorrelativo,
      method,
      currency,
      amountUSD,
      amountVES,
      rateUsed,
      bank: payload?.bank ?? '',
      reference: payload?.reference ?? '',
      note: payload?.note ?? '',
      supports: [],
      actor: this.currentUser?.name ?? '',
      createdAt: new Date().toISOString()
    };

    const paymentRef = await addDoc(collection(db, 'ar_entries', id, 'payments'), paymentDoc as any);

    // Alimentar módulo Bancos (solo append): registrar transacción por banco+método.
    try {
      const bankName = String(payload?.bank ?? '').trim();
      if (bankName && bankName.toUpperCase() !== 'OTRO') {
        const bankTx: BankTransactionRecord = {
          bankId: this.resolveBankIdByName(bankName),
          bankName,
          method,
          source: 'AR_PAYMENT',
          sourceId: paymentRef.id,
          arId: id,
          customerId: entry.customerId,
          customerName: entry.customerName,
          saleCorrelativo: entry.saleCorrelativo,
          currency,
          amountUSD,
          amountVES,
          rateUsed,
          reference: String(payload?.reference ?? '').trim(),
          note: String(payload?.note ?? '').trim(),
          actor: this.currentUser?.name ?? '',
          createdAt: new Date().toISOString()
        };
        await this.appendBankTransaction(bankTx);
      }
    } catch (e: any) {
      console.warn('No se pudo registrar bank_transaction:', e?.message ?? e);
    }

    if (payload?.files && payload.files.length > 0) {
      const supabaseBucket = ((import.meta as any).env?.VITE_SUPABASE_SUPPORTS_BUCKET ?? 'supports') as string;

      const uploadWithFirebase = async () => {
        for (const f of payload.files || []) {
          const safeName = (f.name || 'support').replace(/[^a-zA-Z0-9._-]/g, '_');
          const path = `ar_payments/${id}/${paymentRef.id}/${safeName}`;
          const storageRef = ref(storage, path);
          const uploadTimeoutMs = 30000;
          await Promise.race([
            uploadBytes(storageRef, f),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout subiendo soporte a Firebase Storage.')), uploadTimeoutMs))
          ]);
          const url = await Promise.race([
            getDownloadURL(storageRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout obteniendo URL de soporte (Firebase).')), uploadTimeoutMs))
          ]) as string;
          supports.push({
            name: f.name,
            url,
            path,
            contentType: f.type || 'application/octet-stream',
            size: f.size,
            provider: 'firebase'
          });
        }
      };

      const uploadWithSupabase = async () => {
        for (const f of payload.files || []) {
          const safeName = (f.name || 'support').replace(/[^a-zA-Z0-9._-]/g, '_');
          const objectPath = `ar_payments/${id}/${paymentRef.id}/${Date.now()}_${safeName}`;
          const { error } = await supabase.storage
            .from(supabaseBucket)
            .upload(objectPath, f, {
              upsert: true,
              contentType: f.type || 'application/octet-stream'
            });

          if (error) {
            throw new Error(error.message);
          }

          const { data } = supabase.storage.from(supabaseBucket).getPublicUrl(objectPath);
          const url = data?.publicUrl || '';
          supports.push({
            name: f.name,
            url,
            path: objectPath,
            contentType: f.type || 'application/octet-stream',
            size: f.size,
            provider: 'supabase',
            bucket: supabaseBucket
          });
        }
      };

      try {
        // Intentar Firebase primero (si está activo). Si falla, fallback a Supabase.
        await uploadWithFirebase();
        await updateDoc(paymentRef, {
          supports,
          storageProvider: 'firebase'
        } as any);
      } catch (eFirebase: any) {
        // Limpiar y reintentar en Supabase para evitar mezcla de providers en un mismo pago.
        supports.length = 0;
        try {
          await uploadWithSupabase();
          await updateDoc(paymentRef, {
            supports,
            storageProvider: 'supabase',
            storageBucket: supabaseBucket,
            supportsUploadError: String(eFirebase?.message || 'Firebase Storage no disponible, se usó Supabase.')
          } as any);
        } catch (eSupabase: any) {
          const msgSupabase = eSupabase?.message ? String(eSupabase.message) : 'Error subiendo soporte a Supabase Storage.';
          const msgFirebase = eFirebase?.message ? String(eFirebase.message) : 'Error subiendo soporte a Firebase Storage.';
          // No bloquear conciliación del pago: registramos el error para auditoría y seguimos.
          await updateDoc(paymentRef, {
            supports,
            supportsUploadError: `Firebase: ${msgFirebase} | Supabase: ${msgSupabase}`,
            storageProvider: 'none'
          } as any);
        }
      }
    }

    entry.balanceUSD = Math.max(0, entry.balanceUSD - paymentUSD);
    if (entry.balanceUSD === 0) entry.status = 'PAID';

    await updateDoc(doc(db, 'ar_entries', id), {
      balanceUSD: entry.balanceUSD,
      status: entry.status,
      lastPaymentAt: new Date().toISOString()
    } as any);

    this.notify();
  }

  // Process AR Collection via Cash Box (Billing View) with multiple payments and change handling
  async processARCollectionInCashBox(params: {
    arEntryId: string;
    payments: Array<{
      method: string;
      amountUSD: number;
      amountVES?: number;
      bank?: string;
      reference?: string;
      currency?: 'USD' | 'VES';
      rateUsed?: number;
    }>;
    changeUSD?: number;
    changeVES?: number;
    changeDeclared?: boolean;
    changeMethod?: 'cash_usd' | 'cash_ves' | 'mobile' | 'transfer' | 'zelle';
    changeBank?: string;
    changeAsAdvance?: boolean;
    sessionId?: string;
    exchangeRateBCV?: number;
    exchangeRateInternal?: number;
    actor?: string;
  }): Promise<{ success: boolean; totalPaidUSD: number; changeGivenUSD: number; changeGivenVES: number; newBalanceUSD: number }> {
    const { 
      arEntryId, payments, changeUSD = 0, changeVES = 0, 
      changeDeclared = false, changeMethod, changeBank, changeAsAdvance = false,
      sessionId, exchangeRateBCV = 36.5, exchangeRateInternal = 36.5, actor = 'Sistema'
    } = params;
    
    // Get AR Entry
    let entry = this.arEntries.find(e => e.id === arEntryId);
    if (!entry) {
      const snap = await getDoc(doc(db, 'ar_entries', arEntryId));
      if (!snap.exists()) throw new Error('AR Entry not found');
      const d: any = snap.data();
      entry = {
        id: arEntryId,
        timestamp: new Date(d.timestamp ?? new Date().toISOString()),
        customerName: String(d.customerName ?? ''),
        customerId: String(d.customerId ?? ''),
        description: String(d.description ?? ''),
        amountUSD: Number(d.amountUSD ?? 0) || 0,
        balanceUSD: Number(d.balanceUSD ?? 0) || 0,
        dueDate: new Date(d.dueDate ?? new Date().toISOString()),
        status: (d.status ?? 'PENDING') as any,
        saleCorrelativo: String(d.saleCorrelativo ?? '')
      } as any;
    }

    const originalBalance = entry.balanceUSD;
    let totalPaidUSD = 0;
    let totalPaidVES = 0;

    // Process each payment
    for (const payment of payments) {
      const amountUSD = Number(payment.amountUSD) || 0;
      const amountVES = Number(payment.amountVES) || 0;
      totalPaidUSD += amountUSD;
      totalPaidVES += amountVES;

      await this.registerARPaymentWithSupport(arEntryId, amountUSD, {
        method: payment.method,
        currency: payment.currency || 'USD',
        amountVES,
        rateUsed: payment.rateUsed,
        bank: payment.bank,
        reference: payment.reference,
        note: `Cobro en Caja${sessionId ? ` (Sesión: ${sessionId.slice(0, 8)})` : ''}`
      });
    }

    // Calculate change to give
    const changeGivenUSD = roundMoney(changeUSD);
    const changeGivenVES = roundMoney(changeVES);
    const hasChange = changeGivenUSD > 0.005 || changeGivenVES > 0.5;

    // Handle change (vuelto) according to declared method
    if (hasChange && changeDeclared && !changeAsAdvance && sessionId) {
      const activeCashSession = this.getCurrentCashBoxSession();
      if (activeCashSession?.id === sessionId) {
        // Determine change handling based on method
        const isCashUSD = changeMethod === 'cash_usd';
        const isCashVES = changeMethod === 'cash_ves';
        const isBankTransfer = changeMethod === 'transfer' || changeMethod === 'mobile' || changeMethod === 'zelle';
        
        if (isCashUSD && changeGivenUSD > 0.005) {
          // Cash USD change - register as cash box withdrawal
          await this.registerCashBoxWithdrawal({
            sessionId,
            amount: changeGivenUSD,
            currency: 'USD',
            method: 'cash_usd',
            reason: `VUELTO Cobro AR ${entry.saleCorrelativo} - Cliente: ${entry.customerName}`,
            user: this.currentUser || { id: 'SYSTEM', name: 'Sistema' },
            rateUsed: exchangeRateInternal
          });
        } else if (isCashVES && changeGivenVES > 0.5) {
          // Cash VES change - register as cash box withdrawal
          await this.registerCashBoxWithdrawal({
            sessionId,
            amount: changeGivenVES,
            currency: 'VES',
            method: 'cash_ves',
            reason: `VUELTO Cobro AR ${entry.saleCorrelativo} - Cliente: ${entry.customerName}`,
            user: this.currentUser || { id: 'SYSTEM', name: 'Sistema' },
            rateUsed: exchangeRateBCV
          });
        } else if (isBankTransfer && changeBank) {
          // Bank transfer change - register as bank withdrawal
          const rateForVES = changeMethod === 'zelle' ? exchangeRateInternal : exchangeRateBCV;
          const changeUSDForBank = changeGivenUSD > 0.005 ? changeGivenUSD : roundMoney(changeGivenVES / rateForVES);
          
          if (changeUSDForBank > 0.005) {
            // Register bank withdrawal
            await this.addManualBankTransaction({
              bankId: changeBank,
              amountUSD: changeUSDForBank,
              amountVES: changeGivenVES > 0.5 ? changeGivenVES : 0,
              method: changeMethod,
              reference: `VUELTO-AR-${entry.saleCorrelativo}`,
              description: `Vuelto Cobro AR ${entry.saleCorrelativo} - Cliente: ${entry.customerName}`
            });
          }
        } else if (changeGivenUSD > 0.005 || changeGivenVES > 0.5) {
          // Default: register as cash box withdrawal in the appropriate currency
          if (changeGivenUSD > 0.005) {
            await this.registerCashBoxWithdrawal({
              sessionId,
              amount: changeGivenUSD,
              currency: 'USD',
              method: 'cash_usd',
              reason: `VUELTO Cobro AR ${entry.saleCorrelativo} - Cliente: ${entry.customerName}`,
              user: this.currentUser || { id: 'SYSTEM', name: 'Sistema' },
              rateUsed: exchangeRateInternal
            });
          }
          if (changeGivenVES > 0.5) {
            await this.registerCashBoxWithdrawal({
              sessionId,
              amount: changeGivenVES,
              currency: 'VES',
              method: 'cash_ves',
              reason: `VUELTO Cobro AR ${entry.saleCorrelativo} - Cliente: ${entry.customerName}`,
              user: this.currentUser || { id: 'SYSTEM', name: 'Sistema' },
              rateUsed: exchangeRateBCV
            });
          }
        }
      }
    }

    // Handle change as advance (if selected)
    if (hasChange && changeAsAdvance && entry.customerId) {
      const advanceUSD = changeGivenUSD > 0.005 ? changeGivenUSD : roundMoney(changeGivenVES / exchangeRateInternal);
      if (advanceUSD >= 0.01) {
        // Si el vuelto es en Bs (efectivo VES o método VES), clasificar el anticipo como VES
        const isVESChange = changeGivenVES > 0.5 && !(changeMethod === 'cash_usd' || changeMethod === 'zelle');
        const advCurrency: 'USD' | 'VES' = isVESChange ? 'VES' : 'USD';
        await this.createClientAdvance({
          customerId: entry.customerId,
          customerName: entry.customerName,
          amountUSD: advanceUSD,
          originInvoiceId: arEntryId,
          originCorrelativo: entry.saleCorrelativo,
          currency: advCurrency,
          originalAmountVES: advCurrency === 'VES' ? changeGivenVES : undefined,
          rateAtCreation: advCurrency === 'VES' ? exchangeRateBCV : undefined,
          note: `Vuelto de cobro AR convertido a anticipo. AR: ${entry.saleCorrelativo} [${advCurrency}]`
        });
        
        await this.addAuditEntry('FINANCE', 'AR_CHANGE_AS_ADVANCE',
          `Vuelto de cobro AR ${entry.saleCorrelativo} convertido a anticipo: $${advanceUSD.toFixed(2)} [${advCurrency}] - Cliente: ${entry.customerName}`
        );
      }
    }

    // Reload AR entry to get updated balance
    const updatedEntry = this.arEntries.find(e => e.id === arEntryId);
    const newBalanceUSD = updatedEntry?.balanceUSD ?? 0;

    // Audit trail
    const changeInfo = hasChange 
      ? (changeAsAdvance 
        ? `Vuelto como anticipo: $${changeGivenUSD.toFixed(2)}` 
        : changeMethod 
          ? `Vuelto via ${changeMethod}${changeBank ? ` (${changeBank})` : ''}: $${changeGivenUSD.toFixed(2)}/Bs.${changeGivenVES.toFixed(2)}`
          : `Vuelto: $${changeGivenUSD.toFixed(2)}/Bs.${changeGivenVES.toFixed(2)}`)
      : 'Sin vuelto';
    
    await this.addAuditEntry('AR', 'AR_COLLECTION_CASHBOX', 
      `Cobro AR en Caja: ${entry.saleCorrelativo} - Cliente: ${entry.customerName} - ` +
      `Pagado: $${totalPaidUSD.toFixed(2)} - ${changeInfo} - ` +
      `Nuevo Saldo: $${newBalanceUSD.toFixed(2)} - Actor: ${actor}`
    );

    this.notify();

    return {
      success: true,
      totalPaidUSD,
      changeGivenUSD,
      changeGivenVES,
      newBalanceUSD
    };
  }

  // ─── COBRO AR CON EXCEDENTE ─────────────────────────────────────────────
  // El cliente paga una factura (AR) con un monto mayor al saldo. El excedente
  // puede: (1) devolverse como vuelto (caja o banco), (2) abonarse a otra
  // factura pendiente del mismo cliente, o (3) quedar como anticipo del cliente.
  // Mantiene doble partida: el banco/caja recibe el monto completo recibido,
  // y se contra-registra el vuelto o se reparte entre AR/anticipo.
  async registerARPaymentWithExcess(params: {
    arId: string;
    receivedUSD: number;
    receivedVES?: number;
    currency: 'USD' | 'VES';
    rateUsed?: number;
    method: string;
    bank: string;
    reference?: string;
    note?: string;
    files?: File[];
    excess?:
      | { kind: 'none' }
      | {
          kind: 'change';
          method: 'cash_usd' | 'cash_ves' | 'transfer' | 'mobile' | 'zelle' | 'debit';
          bank?: string;
          rateUsed?: number;
        }
      | { kind: 'apply_to_ar'; secondaryArId: string }
      | { kind: 'advance' };
  }): Promise<{
    success: boolean;
    appliedPrimaryUSD: number;
    excessUSD: number;
    excessHandled: 'none' | 'change' | 'apply_to_ar' | 'advance';
    newPrimaryBalanceUSD: number;
  }> {
    const {
      arId, receivedUSD, receivedVES = 0, currency, rateUsed = 0,
      method, bank, reference, note, files, excess = { kind: 'none' }
    } = params;

    let primary = this.arEntries.find(e => e.id === arId);
    if (!primary) {
      const snap = await getDoc(doc(db, 'ar_entries', arId));
      if (!snap.exists()) throw new Error('Factura AR no encontrada.');
      const d: any = snap.data();
      primary = {
        id: arId,
        timestamp: new Date(d.timestamp ?? new Date().toISOString()),
        customerName: String(d.customerName ?? ''),
        customerId: String(d.customerId ?? ''),
        description: String(d.description ?? ''),
        amountUSD: Number(d.amountUSD ?? 0) || 0,
        balanceUSD: Number(d.balanceUSD ?? 0) || 0,
        dueDate: new Date(d.dueDate ?? new Date().toISOString()),
        status: (d.status ?? 'PENDING') as any,
        saleCorrelativo: String(d.saleCorrelativo ?? '')
      } as any;
    }

    const primaryBalance = Number(primary!.balanceUSD ?? 0) || 0;
    const received = roundMoney(receivedUSD);
    if (!(received > 0)) throw new Error('El monto recibido debe ser mayor a cero.');

    const appliedPrimaryUSD = roundMoney(Math.min(received, primaryBalance));
    const excessUSD = roundMoney(Math.max(0, received - primaryBalance));

    const excessMode = excessUSD > 0.005
      ? (excess.kind === 'none' ? { kind: 'advance' as const } : excess)
      : { kind: 'none' as const };

    const receivedVESTotal = Number(receivedVES) || 0;
    const rate = Number(rateUsed) || 0;
    const primaryVES = currency === 'VES' && received > 0
      ? roundMoney((appliedPrimaryUSD / received) * receivedVESTotal)
      : 0;
    const excessVES = currency === 'VES' && received > 0
      ? roundMoney(receivedVESTotal - primaryVES)
      : 0;

    // 1) Aplicar al AR primario
    await this.registerARPaymentWithSupport(arId, appliedPrimaryUSD, {
      method,
      currency,
      amountVES: primaryVES,
      rateUsed: rate,
      bank,
      reference,
      note: note || (excessUSD > 0.005
        ? `Cobro AR + excedente $${excessUSD.toFixed(2)} (${excessMode.kind})`
        : 'Cobro AR'),
      files
    });

    // 2) Manejar excedente
    if (excessMode.kind === 'apply_to_ar') {
      await this.registerARPaymentWithSupport(excessMode.secondaryArId, excessUSD, {
        method,
        currency,
        amountVES: excessVES,
        rateUsed: rate,
        bank,
        reference,
        note: `Abono por excedente de cobro AR ${primary!.saleCorrelativo}`
      });
    } else if (excessMode.kind === 'advance') {
      await this.createClientAdvance({
        customerId: primary!.customerId,
        customerName: primary!.customerName,
        amountUSD: excessUSD,
        originInvoiceId: arId,
        originCorrelativo: primary!.saleCorrelativo,
        currency,
        originalAmountVES: currency === 'VES' ? excessVES : undefined,
        rateAtCreation: currency === 'VES' && rate > 0 ? rate : undefined,
        note: `Excedente de cobro AR ${primary!.saleCorrelativo} ($${excessUSD.toFixed(2)})`
      });
      try {
        const bankName = String(bank ?? '').trim();
        if (bankName && bankName.toUpperCase() !== 'OTRO') {
          const tx: BankTransactionRecord = {
            bankId: this.resolveBankIdByName(bankName),
            bankName,
            method,
            source: 'CLIENT_ADVANCE' as any,
            sourceId: `ADV-${arId}`,
            arId,
            customerId: primary!.customerId,
            customerName: primary!.customerName,
            saleCorrelativo: primary!.saleCorrelativo,
            currency,
            amountUSD: excessUSD,
            amountVES: excessVES,
            rateUsed: rate,
            reference: reference ?? '',
            note: `Anticipo por excedente AR ${primary!.saleCorrelativo}`,
            actor: this.currentUser?.name ?? '',
            createdAt: new Date().toISOString()
          };
          await this.appendBankTransaction(tx);
        }
      } catch (e) {
        console.warn('No se pudo registrar bank_transaction del excedente (anticipo):', e);
      }
    } else if (excessMode.kind === 'change') {
      const cm = excessMode.method;
      const cb = String(excessMode.bank ?? bank ?? '').trim();
      const cRate = Number(excessMode.rateUsed ?? rate) || 0;
      const session = this.getCurrentCashBoxSession();

      if (cm === 'cash_usd' || cm === 'cash_ves') {
        if (!session?.id) {
          throw new Error('Para entregar vuelto en efectivo debe haber una sesión de caja abierta.');
        }
        const amount = cm === 'cash_ves' && cRate > 0
          ? roundMoney(excessUSD * cRate)
          : excessUSD;
        await this.registerCashBoxWithdrawal({
          sessionId: session.id,
          amount,
          currency: cm === 'cash_ves' ? 'VES' : 'USD',
          method: cm,
          reason: `VUELTO cobro AR ${primary!.saleCorrelativo} - ${primary!.customerName}`,
          user: this.currentUser || { id: 'SYSTEM', name: 'Sistema' },
          rateUsed: cRate || 1
        });
      } else {
        if (!cb) throw new Error('Seleccione el banco para el vuelto.');
        const changeVES = cRate > 0 ? roundMoney(excessUSD * cRate) : 0;
        const tx: BankTransactionRecord = {
          bankId: this.resolveBankIdByName(cb),
          bankName: cb,
          method: cm,
          source: 'AR_CHANGE' as any,
          sourceId: `CHG-${arId}`,
          arId,
          customerId: primary!.customerId,
          customerName: primary!.customerName,
          saleCorrelativo: primary!.saleCorrelativo,
          currency: cm === 'zelle' ? 'USD' : 'VES',
          amountUSD: -Math.abs(excessUSD),
          amountVES: cm === 'zelle' ? 0 : -Math.abs(changeVES),
          rateUsed: cRate,
          reference: reference ?? '',
          note: `Vuelto cobro AR ${primary!.saleCorrelativo}`,
          actor: this.currentUser?.name ?? '',
          createdAt: new Date().toISOString()
        };
        await this.appendBankTransaction(tx);
      }
    }

    await this.addAuditEntry('AR', 'AR_COLLECTION_WITH_EXCESS',
      `Cobro AR ${primary!.saleCorrelativo} - ${primary!.customerName} | ` +
      `Recibido: $${received.toFixed(2)} | Aplicado: $${appliedPrimaryUSD.toFixed(2)} | ` +
      `Excedente: $${excessUSD.toFixed(2)} (${excessMode.kind})`
    );

    const updatedPrimary = this.arEntries.find(e => e.id === arId);
    const newPrimaryBalanceUSD = Number(updatedPrimary?.balanceUSD ?? 0) || 0;

    this.notify();

    return {
      success: true,
      appliedPrimaryUSD,
      excessUSD,
      excessHandled: excessMode.kind,
      newPrimaryBalanceUSD
    };
  }

  getCriticalIssues() {
    const issues: { id: string, type: 'STOCK' | 'AP' | 'AR', priority: 'HIGH' | 'CRITICAL', title: string, detail: string }[] = [];

    // 1. Stock Crítico
    this.getStocks().forEach(s => {
      const total = s.d3 + s.d2 + s.a1;
      if (total < s.min) {
        issues.push({
          id: `STOCK-${s.code}`,
          type: 'STOCK',
          priority: total === 0 ? 'CRITICAL' : 'HIGH',
          title: `Stock Crítico: ${s.description}`,
          detail: `Existencia actual: ${total} ${s.unit} (Mín: ${s.min})`
        });
      }
    });

    // 2. Deuda Proveedores Vencida (AP)
    const now = new Date();
    this.apEntries.forEach(ap => {
      if (ap.status !== 'PAID' && ap.dueDate < now) {
        issues.push({
          id: ap.id,
          type: 'AP',
          priority: 'CRITICAL',
          title: `Pago Vencido: ${ap.supplier}`,
          detail: `Saldo pendiente: $${ap.balanceUSD.toFixed(2)} (Venció el ${ap.dueDate.toLocaleDateString()})`
        });
      }
    });

    // 3. Cartera Clientes Vencida (AR)
    this.arEntries.forEach(ar => {
      if (ar.status !== 'PAID' && ar.dueDate < now) {
        issues.push({
          id: ar.id,
          type: 'AR',
          priority: 'HIGH',
          title: `Cobro Vencido: ${ar.customerName}`,
          detail: `Saldo pendiente: $${ar.balanceUSD.toFixed(2)} (Venció el ${ar.dueDate.toLocaleDateString()})`
        });
      }
    });

    return issues;
  }

  getCreditNotes(): any[] {
    return [...this.creditNotes];
  }

  // Getter síncrono para todos los anticipos (usado en reportes)
  getAllClientAdvances(): ClientAdvance[] {
    return [...this.clientAdvances];
  }

  getConsolidatedLedger() {
    const entries: { timestamp: Date, type: 'INCOME' | 'EXPENSE', category: string, description: string, amountUSD: number }[] = [];

    // Sales (Cash/Bank) — excluir ventas anuladas
    this.getSales().forEach(s => {
      if (s.paymentMethod !== 'CREDIT' && (s as any).status !== 'VOID') {
        entries.push({
          timestamp: s.timestamp,
          type: 'INCOME',
          category: 'VENTA',
          description: `Venta Factura ${s.correlativo} (${s.client.name})`,
          amountUSD: s.totalUSD
        });
      }
    });

    // Notas de crédito por devoluciones — restan del ingreso
    this.creditNotes.forEach(cn => {
      if (!cn.amountUSD || cn.amountUSD <= 0) return;
      entries.push({
        timestamp: new Date(cn.createdAt ?? cn.timestamp ?? new Date().toISOString()),
        type: 'EXPENSE',
        category: 'DEVOLUCION',
        description: `Devolución ${cn.correlativo} (${cn.clientName ?? cn.clientId ?? ''}) — Ref: ${cn.saleCorrelativo ?? ''}`,
        amountUSD: cn.amountUSD
      });
    });

    // Expenses — excluir gastos anulados
    this.expenses.filter(e => e.status !== 'VOID').forEach(e => {
      entries.push({
        timestamp: e.timestamp,
        type: 'EXPENSE',
        category: 'GASTO',
        description: e.description,
        amountUSD: e.amountUSD
      });
    });

    // AP/AR are complicated because only payments (abonos) affect the ledger
    // For now, let's just use Sales and Expenses as the base ledger.
    // Future: Track payment history entries separately.

    return entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async addStock(sku: string, qtyUnits: number, costUSD: number, expiry: Date, warehouse: string = 'Galpon D3', supplier?: string, paymentType?: 'CASH' | 'CREDIT', invoiceImage?: string) {
    const { error } = await supabase.from('inventory_batches').insert({
      product_code: sku,
      quantity: qtyUnits,
      cost_usd: costUSD,
      expiry_date: expiry.toISOString().split('T')[0],
      purchase_date: new Date().toISOString().split('T')[0],
      warehouse: warehouse,
      supplier: supplier
    }).select().single();

    if (error) {
      console.error('Error agregando stock:', error);
    }

    await supabase.from('movements').insert({
      product_code: sku,
      type: 'IN',
      quantity: qtyUnits,
      warehouse: warehouse,
      reason: `Entrada: ${supplier || 'S/Proveedor'} (${paymentType === 'CREDIT' ? 'CRÉDITO' : 'CONTADO'})`,
      operator: this.currentUser.name
    });

    if (paymentType === 'CREDIT' && supplier) {
      await this.addAPEntry(
        supplier,
        `Factura Mercancía: ${sku} (${qtyUnits} kg)`,
        qtyUnits * costUSD,
        15
      );
    }

    await this.init();
    return !error;
  }

  // Helper: Check if correlativo already exists
  private async checkCorrelativoExists(correlativo: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('id')
        .eq('correlativo', correlativo)
        .limit(1);
      if (error) return false; // Assume not exists on error (will fail on insert if dup)
      return !!(data && data.length > 0);
    } catch {
      return false;
    }
  }

  // Helper: Generate unique correlativo with collision detection
  private async generateUniqueCorrelativo(kind: 'STANDARD' | 'CREDIT', maxRetries = 5): Promise<string> {
    const prefix = kind === 'CREDIT' ? 'C-' : 'G-';
    const padLength = kind === 'CREDIT' ? 6 : 8;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Get current max from DB
      const { data } = await supabase
        .from('sales')
        .select('correlativo')
        .ilike('correlativo', `${prefix}%`)
        .order('date', { ascending: false })
        .limit(100);

      let maxNumber = 0;
      if (data && data.length > 0) {
        for (const s of data) {
          const corr = String(s.correlativo || '').trim().toUpperCase();
          if (corr.startsWith(prefix)) {
            const num = parseInt(corr.substring(prefix.length), 10);
            if (Number.isFinite(num) && num > maxNumber) {
              maxNumber = num;
            }
          }
        }
      }

      // Add attempt offset to avoid collision with concurrent users
      const nextNumber = maxNumber + 1 + attempt;
      const correlativo = `${prefix}${nextNumber.toString().padStart(padLength, '0')}`;

      // Verify it's not taken (race condition check)
      const exists = await this.checkCorrelativoExists(correlativo);
      if (!exists) {
        // Update memory counters
        if (kind === 'CREDIT') {
          this.nextCreditCorrelativo = nextNumber + 1;
        } else {
          this.nextCorrelativo = nextNumber + 1;
        }
        return correlativo;
      }

      // If exists, retry with next number
      console.warn(`Correlativo ${correlativo} ya existe, intentando siguiente...`);
    }

    // Emergency: use timestamp-based correlativo
    const timestamp = Date.now().toString().slice(-8);
    const emergency = `${prefix}ERR${timestamp}`;
    console.error(`No se pudo generar correlativo único después de ${maxRetries} intentos. Usando: ${emergency}`);
    return emergency;
  }

  async registerSale(sale: Omit<SaleHistoryEntry, 'timestamp'>): Promise<SaleHistoryEntry | null> {
    // Validate cash box session is open for cashier role
    if (this.currentUser.role === 'CAJERO' && (!this.currentSession || this.currentSession.status !== 'OPEN')) {
      throw new Error('Debe abrir una sesión de caja antes de registrar ventas');
    }

    // Stamp the operator who registered this sale
    (sale as any).operatorName = String(this.currentUser?.name ?? '').trim() || 'SISTEMA';
    (sale as any).userId = String(this.currentUser?.id ?? '').trim();

    const timestamp = new Date();
    const normalizedPaymentMethod = String(sale.paymentMethod ?? '').trim().toUpperCase();
    const isCreditSale = normalizedPaymentMethod === 'CREDIT' || normalizedPaymentMethod === 'CRÉDITO';

    // CORRELATIVO FIX: Generate unique correlativo with collision detection
    // If the provided correlativo already exists, generate a new one
    let finalCorrelativo = sale.correlativo;
    const correlativoExists = await this.checkCorrelativoExists(finalCorrelativo);
    if (correlativoExists) {
      console.warn(`Correlativo ${finalCorrelativo} ya existe. Generando nuevo...`);
      finalCorrelativo = await this.generateUniqueCorrelativo(isCreditSale ? 'CREDIT' : 'STANDARD');
    }

    // exchange_rate debe ser siempre la tasa BCV real, no totalVES/totalUSD
    const bcvRate = Number(sale.exchangeRate) || (sale.totalUSD > 0 ? sale.totalVES / sale.totalUSD : 1);
    const { data: newSale, error: sError } = await this.insertSaleWithFallback({
      correlativo: finalCorrelativo,
      customer_name: sale.client.name,
      customer_id: sale.client.id,
      total_usd: sale.totalUSD,
      total_ves: sale.totalVES,
      nominal_usd: (sale as any).nominalUSD ?? sale.totalUSD,
      exchange_rate: bcvRate,
      status: 'COMPLETED',
      operator: this.currentUser.name,
      user_id: this.currentUser.id ?? '',
      date: new Date().toISOString()
    });

    if (sError) {
      console.warn('Modo Local Activo: Error guardando en Supabase, procesando venta solo en memoria local.', sError);
      const mockSale: SaleHistoryEntry = {
        id: Math.random().toString(36).substr(2, 9),
        ...sale,
        correlativo: finalCorrelativo,
        timestamp
      };
      const paymentsPreparedRaw = await this.normalizeSalePayments(((sale as any).payments ?? []) as any[]);
      const paymentsPrepared = Array.isArray(paymentsPreparedRaw) ? paymentsPreparedRaw : [];
      mockSale.payments = paymentsPrepared.map((p: any) => ({ ...p, files: undefined }));
      this.sales.unshift(mockSale);
      await this.persistCashBoxSaleAudit(mockSale);
      await this.persistSalePayments(sale, String(mockSale.id), paymentsPrepared.map((p: any) => ({ ...p, files: undefined })));
      await this.appendSaleBankTransactions(sale, String(mockSale.id), paymentsPrepared.map((p: any) => ({ ...p, files: undefined })));
      void this.syncSalePaymentSupportsAsync(sale, String(mockSale.id), paymentsPrepared);
      // CRITICAL FIX: Procesar AR, CxP y Anticipos también en modo offline/mock
      await this.processPostSaleEffects(sale, mockSale, finalCorrelativo);
      // CORRELATIVO FIX: El contador ya se actualizó en getNextCorrelativo
      await this.init();
      return mockSale;
    }

    // FEFO Discount Logic
    const itemsWithDispatch: BillingItem[] = [];

    for (const item of sale.items) {
      const product = this.products.find(p => p.code === item.code);
      if (!product) {
        itemsWithDispatch.push(item);
        continue;
      }

      let remaining = item.qty;
      const sortedLotes = [...product.lotes].sort((a, b) => a.expiry.getTime() - b.expiry.getTime());
      const dispatchLotes: { warehouse: string; batchId: string; qty: number }[] = [];

      for (const lote of sortedLotes) {
        if (remaining <= 0) break;
        const discount = Math.min(lote.qty, remaining);

        if (discount > 0) {
          await supabase.from('inventory_batches')
            .update({ quantity: lote.qty - discount })
            .eq('id', lote.id);

          try {
            await this.insertMovementWithFallback({
              product_code: item.code,
              type: 'SALE',
              quantity: -discount,
              warehouse: lote.warehouse,
              reason: `Venta ${finalCorrelativo}`,
              operator: this.currentUser.name,
              date: new Date().toISOString()
            });
          } catch (e) {
            console.warn('No se pudo registrar movimiento de venta en Supabase:', e);
          }

          dispatchLotes.push({
            warehouse: lote.warehouse,
            batchId: String(lote.id || 'N/A'),
            qty: discount
          });

          remaining -= discount;
        }
      }

      itemsWithDispatch.push({
        ...item,
        dispatchLotes
      });
    }

    const finalSale: SaleHistoryEntry = {
      ...sale,
      id: newSale?.id || Math.random().toString(36).substr(2, 9),
      correlativo: finalCorrelativo,
      items: itemsWithDispatch,
      timestamp
    };
    const paymentsPreparedRaw = await this.normalizeSalePayments(((sale as any).payments ?? []) as any[]);
    const paymentsPrepared = Array.isArray(paymentsPreparedRaw) ? paymentsPreparedRaw : [];
    finalSale.payments = paymentsPrepared.map((p: any) => ({ ...p, files: undefined }));
    await this.persistCashBoxSaleAudit(finalSale);
    await this.persistSalePayments(sale, String(finalSale.id), paymentsPrepared.map((p: any) => ({ ...p, files: undefined })));

    try {
      await this.appendSaleBankTransactions(sale, String(finalSale.id), paymentsPrepared.map((p: any) => ({ ...p, files: undefined })));
    } catch (e: any) {
      console.warn('No se pudo registrar bank_transaction (SALE):', e?.message ?? e);
    }

    // CRITICAL FIX: Procesar AR, CxP y Anticipos (independiente del path Supabase/Mock)
    await this.processPostSaleEffects(sale, finalSale, finalCorrelativo);
    // Skip duplicate inline processing below
    if (false) {
    const payments = ((sale as any).payments ?? []) as any[];
    const creditLine = payments.find(p => p?.method === 'credit');
    const creditOutstandingUSD = Number(
      (sale as any).creditOutstandingUSD
      ?? payments
        .filter(p => p?.method === 'credit')
        .reduce((acc, p) => acc + (Number(p?.amountUSD ?? 0) || 0), 0)
    ) || 0;
    const creditMeta = (sale as any).creditMeta ?? {};
    const rateInternal = Number(creditMeta?.rateInternal ?? creditLine?.rateUsed ?? 0) || 0;
    const rateBCV = Number(creditMeta?.rateBCV ?? sale.exchangeRate ?? 0) || 0;
    const baseOutstandingVES = Number(creditLine?.amountVES ?? 0) || 0;
    const baseOutstandingUSD = (rateInternal > 0) ? roundMoney(baseOutstandingVES / rateInternal) : 0;

    if (creditOutstandingUSD > 0) {
      await this.addAREntry(
        sale.client.name,
        sale.client.id,
        'Venta en Lote Industrial a Crédito',
        creditOutstandingUSD,
        finalCorrelativo,
        10,
        {
          creditModel: 'INTERNAL_RATE',
          rateInternal,
          rateBCV,
          baseOutstandingUSD,
          baseOutstandingVES,
          internalizedOutstandingUSD: creditOutstandingUSD
        }
      );
    }

    // 1. Identificar pagos que son CxP (Cualquiera por 'OTHERS' o 'CXP' explícito)
    const apPayments = payments.filter((p: any) => {
      const meth = String(p.method || '').trim().toUpperCase();
      const bank = String(p.bank || '').trim().toUpperCase();
      const note = String(p.note || '').trim().toUpperCase();
      
      // Si dice CXP en cualquier lado o es OTHERS/OTRO y el cliente tiene deuda conocida
      const isExplicitCXP = meth.includes('CXP') || bank.includes('CXP') || note.includes('CXP') || note.includes('RECONCILIACION');
      const isGenericOther = meth === 'OTHERS' || meth === 'OTRO';
      const currentAPBal = this.getAPBalanceBySupplier(sale.client.name);
      
      return isExplicitCXP || (isGenericOther && currentAPBal > 0);
    });

    if (apPayments.length > 0) {
       await this.addExpense(
         `[CXP] Iniciando cruce de cuentas para: ${sale.client.name} | Monto: $${apPayments.reduce((a,b)=>a+(b.amountUSD||0),0).toFixed(2)}`,
         0,
         'VARIABLE'
       );
    }

    for (const apP of apPayments) {
      let amountUSD = Number(apP.amountUSD || 0) || 0;
      
      // Si el pago tiene una tasa de cruce, el monto viene en Bs → convertir a USD real
      const note = String(apP.note || apP.bank || '').toUpperCase();
      const rateMatch = note.match(/TASA:\s*([\d.]+)/);
      if (rateMatch) {
        const cxpRate = parseFloat(rateMatch[1]);
        // El amountUSD que llega es calculado por el sistema (amountVES / BCV).
        // Pero el descuento real en AP debe ser: amountVES / cxpRate
        const amountVES = Number(apP.amountVES || 0) || (amountUSD * cxpRate);
        if (cxpRate > 0 && amountVES > 0) {
          amountUSD = amountVES / cxpRate;
        }
      }
      
      if (amountUSD > 0) {
        await this.applyAPOffsetBySale(
          sale.client.name,
          amountUSD,
          finalCorrelativo,
          sale.client.id
        );
      }
    }

    // ── ANTICIPOS DE CLIENTE ──────────────────────────────────────────────────
    // 1. Si hay un pago tipo "Ant. Cliente", descontar del saldo de anticipos
    const antClientePayments = payments.filter((p: any) => {
      const bank = String(p?.bank ?? '').trim();
      const noteUpper = String(p?.note ?? '').trim().toUpperCase();
      const isAnticipoPayment = bank === 'Ant. Cliente' || noteUpper.includes('ANT. CLIENTE') || noteUpper.includes('ANTICIPO CLIENTE');
      // Si el pago es una marca de "vuelto dejado como anticipo", NO consumir anticipos existentes.
      const isAdvanceCreationOnly = noteUpper.includes('VUELTO DEJADO COMO ANTICIPO') || noteUpper.includes('EXCEDENTE DE PAGO');
      return isAnticipoPayment && !isAdvanceCreationOnly;
    });

    if (antClientePayments.length > 0) {
      const totalApplied = antClientePayments.reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
      if (totalApplied > 0.005) {
        try {
          await this.applyClientAdvance({
            customerId: sale.client.id,
            amountToApplyUSD: totalApplied,
            appliedInCorrelativo: finalCorrelativo,
            appliedInSaleId: String(finalSale.id ?? '')
          });
        } catch (e) {
          console.warn('No se pudo aplicar anticipo de cliente:', e);
        }
      }
    }

    // 2. Si el total pagado supera el total de la factura → crear anticipo por diferencia
    const totalPaidUSD = payments
      .filter((p: any) => p?.method !== 'credit')
      .reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
    const invoiceTotalUSD = Number(sale.totalUSD ?? 0) || 0;
    const surplusUSD = roundMoney(totalPaidUSD - invoiceTotalUSD);

    if (surplusUSD >= 0.01 && invoiceTotalUSD > 0 && antClientePayments.length === 0) {
      try {
        // Detectar moneda dominante de los pagos para clasificar el anticipo
        const vesPayMethods = new Set(['cash_ves', 'mobile', 'transfer', 'debit', 'biopago']);
        const totalPaidVESValue = payments
          .filter((p: any) => vesPayMethods.has(String(p?.method ?? '')))
          .reduce((a: number, p: any) => a + (Number(p?.amountVES ?? 0) || 0), 0);
        const totalPaidUSDValue = payments
          .filter((p: any) => !vesPayMethods.has(String(p?.method ?? '')) && p?.method !== 'credit')
          .reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
        const advCurrency: 'USD' | 'VES' = totalPaidVESValue > 0 && totalPaidVESValue > totalPaidUSDValue * (sale.exchangeRate || 1)
          ? 'VES'
          : 'USD';
        const advRateVES = payments.find((p: any) => vesPayMethods.has(String(p?.method ?? '')));
        const surplusVES = advCurrency === 'VES' ? roundMoney(surplusUSD * (sale.exchangeRate || 1)) : undefined;
        await this.createClientAdvance({
          customerId: sale.client.id,
          customerName: sale.client.name,
          amountUSD: surplusUSD,
          originInvoiceId: String(finalSale.id ?? ''),
          originCorrelativo: finalCorrelativo,
          currency: advCurrency,
          originalAmountVES: surplusVES,
          rateAtCreation: advCurrency === 'VES' ? (sale.exchangeRate || undefined) : undefined,
          note: `Excedente de pago en factura ${finalCorrelativo} ($${surplusUSD.toFixed(2)}) [${advCurrency}]`
        });
      } catch (e) {
        console.warn('No se pudo crear anticipo por excedente:', e);
      }
    }
    // ── FIN ANTICIPOS DE CLIENTE ──────────────────────────────────────────────
    } // end if(false) - duplicate logic disabled

    // CORRELATIVO FIX: El contador ya se actualizó en getNextCorrelativo
    // No incrementar aquí para evitar saltos en la numeración

    await this.persistSaleLineItemsToSupabase(String(finalSale.id ?? ''), finalSale.items);
    await this.init();
    return finalSale;
  }

  // ─── PROCESAMIENTO POST-VENTA (AR, CxP, Anticipos) ──────────────────────────
  // Extraído para que funcione tanto en path Supabase como en path Mock/Offline
  private async processPostSaleEffects(
    sale: Omit<SaleHistoryEntry, 'timestamp'>,
    finalSale: SaleHistoryEntry,
    finalCorrelativo: string
  ): Promise<void> {
    const payments = ((sale as any).payments ?? []) as any[];

    // ── CUENTAS POR COBRAR (AR) ──────────────────────────────────────────────
    const creditLine = payments.find(p => p?.method === 'credit');
    const creditOutstandingUSD = Number(
      (sale as any).creditOutstandingUSD
      ?? payments
        .filter(p => p?.method === 'credit')
        .reduce((acc, p) => acc + (Number(p?.amountUSD ?? 0) || 0), 0)
    ) || 0;
    const creditMeta = (sale as any).creditMeta ?? {};
    const rateInternal = Number(creditMeta?.rateInternal ?? creditLine?.rateUsed ?? 0) || 0;
    const rateBCV = Number(creditMeta?.rateBCV ?? sale.exchangeRate ?? 0) || 0;
    const baseOutstandingVES = Number(creditLine?.amountVES ?? 0) || 0;
    const baseOutstandingUSD = (rateInternal > 0) ? roundMoney(baseOutstandingVES / rateInternal) : 0;

    if (creditOutstandingUSD > 0 && sale.client?.id) {
      try {
        await this.addAREntry(
          sale.client.name,
          sale.client.id,
          `Venta a Crédito - Factura ${finalCorrelativo}`,
          creditOutstandingUSD,
          finalCorrelativo,
          Number((sale.client as any).creditDays) || 10,
          {
            creditModel: 'INTERNAL_RATE',
            rateInternal,
            rateBCV,
            baseOutstandingUSD,
            baseOutstandingVES,
            internalizedOutstandingUSD: creditOutstandingUSD
          }
        );
        console.log(`[AR] Creada cuenta por cobrar: ${finalCorrelativo} - ${sale.client.name} - $${creditOutstandingUSD.toFixed(2)}`);
      } catch (e) {
        console.error('[AR] Error creando cuenta por cobrar:', e);
      }
    }

    // ── CxP OFFSET (cruce de cuentas) ───────────────────────────────────────
    const apPayments = payments.filter((p: any) => {
      const meth = String(p.method || '').trim().toUpperCase();
      const bank = String(p.bank || '').trim().toUpperCase();
      const note = String(p.note || '').trim().toUpperCase();
      const isExplicitCXP = meth.includes('CXP') || bank.includes('CXP') || note.includes('CXP') || note.includes('RECONCILIACION');
      const isGenericOther = meth === 'OTHERS' || meth === 'OTRO';
      const currentAPBal = this.getAPBalanceBySupplier(sale.client.name);
      return isExplicitCXP || (isGenericOther && currentAPBal > 0);
    });

    if (apPayments.length > 0) {
      try {
        await this.addExpense(
          `[CXP] Iniciando cruce de cuentas para: ${sale.client.name} | Monto: $${apPayments.reduce((a, b) => a + (b.amountUSD || 0), 0).toFixed(2)}`,
          0,
          'VARIABLE'
        );
      } catch (e) { console.warn('No se pudo registrar expense de cruce CxP:', e); }
    }

    for (const apP of apPayments) {
      let amountUSD = Number(apP.amountUSD || 0) || 0;
      const note = String(apP.note || apP.bank || '').toUpperCase();
      const rateMatch = note.match(/TASA:\s*([\d.]+)/);
      if (rateMatch) {
        const cxpRate = parseFloat(rateMatch[1]);
        const amountVES = Number(apP.amountVES || 0) || (amountUSD * cxpRate);
        if (cxpRate > 0 && amountVES > 0) {
          amountUSD = amountVES / cxpRate;
        }
      }
      if (amountUSD > 0) {
        try {
          await this.applyAPOffsetBySale(sale.client.name, amountUSD, finalCorrelativo, sale.client.id);
        } catch (e) { console.warn('No se pudo aplicar offset AP:', e); }
      }
    }

    // ── ANTICIPOS DE CLIENTE ────────────────────────────────────────────────
    const antClientePayments = payments.filter((p: any) => {
      const bank = String(p?.bank ?? '').trim();
      const noteUpper = String(p?.note ?? '').trim().toUpperCase();
      const isAnticipoPayment = bank === 'Ant. Cliente' || noteUpper.includes('ANT. CLIENTE') || noteUpper.includes('ANTICIPO CLIENTE');
      // Si el pago es una marca de "vuelto dejado como anticipo", NO consumir anticipos existentes.
      const isAdvanceCreationOnly = noteUpper.includes('VUELTO DEJADO COMO ANTICIPO') || noteUpper.includes('EXCEDENTE DE PAGO');
      return isAnticipoPayment && !isAdvanceCreationOnly;
    });

    if (antClientePayments.length > 0 && sale.client?.id) {
      const totalApplied = antClientePayments.reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
      if (totalApplied > 0.005) {
        try {
          await this.applyClientAdvance({
            customerId: sale.client.id,
            amountToApplyUSD: totalApplied,
            appliedInCorrelativo: finalCorrelativo,
            appliedInSaleId: String(finalSale.id ?? '')
          });
          console.log(`[ANTICIPO] Aplicado anticipo: $${totalApplied.toFixed(2)} en factura ${finalCorrelativo}`);
        } catch (e) {
          console.warn('No se pudo aplicar anticipo de cliente:', e);
        }
      }
    }

    // Anticipo por excedente de pago
    const totalPaidUSD = payments
      .filter((p: any) => p?.method !== 'credit')
      .reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
    const invoiceTotalUSD = Number(sale.totalUSD ?? 0) || 0;
    const surplusUSD = roundMoney(totalPaidUSD - invoiceTotalUSD);

    if (surplusUSD >= 0.01 && invoiceTotalUSD > 0 && antClientePayments.length === 0 && sale.client?.id) {
      try {
        const vesPayMethods = new Set(['cash_ves', 'mobile', 'transfer', 'debit', 'biopago']);
        const totalPaidVESValue = payments
          .filter((p: any) => vesPayMethods.has(String(p?.method ?? '')))
          .reduce((a: number, p: any) => a + (Number(p?.amountVES ?? 0) || 0), 0);
        const totalPaidUSDValue = payments
          .filter((p: any) => !vesPayMethods.has(String(p?.method ?? '')) && p?.method !== 'credit')
          .reduce((a: number, p: any) => a + (Number(p?.amountUSD ?? 0) || 0), 0);
        const advCurrency: 'USD' | 'VES' = totalPaidVESValue > 0 && totalPaidVESValue > totalPaidUSDValue * (sale.exchangeRate || 1)
          ? 'VES'
          : 'USD';
        const surplusVES = advCurrency === 'VES' ? roundMoney(surplusUSD * (sale.exchangeRate || 1)) : undefined;
        await this.createClientAdvance({
          customerId: sale.client.id,
          customerName: sale.client.name,
          amountUSD: surplusUSD,
          originInvoiceId: String(finalSale.id ?? ''),
          originCorrelativo: finalCorrelativo,
          currency: advCurrency,
          originalAmountVES: surplusVES,
          rateAtCreation: advCurrency === 'VES' ? (sale.exchangeRate || undefined) : undefined,
          note: `Excedente de pago en factura ${finalCorrelativo} ($${surplusUSD.toFixed(2)}) [${advCurrency}]`
        });
        console.log(`[ANTICIPO] Creado por excedente: $${surplusUSD.toFixed(2)} [${advCurrency}] en factura ${finalCorrelativo}`);
      } catch (e) {
        console.warn('No se pudo crear anticipo por excedente:', e);
      }
    }
  }

  // ─── ANULACIÓN DE VENTA (VOID SALE) ─────────────────────────────────────────

  async voidSale(saleId: string, reason: string, authorizedBy: string): Promise<{ success: boolean; error?: string }> {
    // Verificar permisos
    if (!this.hasPermission('SALES_VOID') && !this.hasPermission('ALL')) {
      return { success: false, error: 'Permiso denegado: Se requiere autorización para anular ventas' };
    }

    try {
      // Buscar la venta en memoria o en Supabase
      let saleToVoid = this.sales.find(s => s.id === saleId);
      
      if (!saleToVoid) {
        // Buscar en Supabase
        const { data: saleData, error: saleError } = await supabase
          .from('sales')
          .select('*')
          .eq('id', saleId)
          .single();
        
        if (saleError || !saleData) {
          return { success: false, error: 'Venta no encontrada' };
        }
        saleToVoid = mapSupabaseSaleRowToHistoryEntry(saleData);
      }

      // Verificar que la venta no esté ya anulada
      if ((saleToVoid as any).status === 'VOID' || (saleToVoid as any).voided) {
        return { success: false, error: 'Esta venta ya ha sido anulada anteriormente' };
      }

      // Verificar que la venta no sea muy antigua (máximo 24 horas para anulación desde caja)
      const saleDate = new Date(saleToVoid.timestamp);
      const hoursSinceSale = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60);
      
      // Solo ADMIN puede anular ventas de más de 24 horas
      if (hoursSinceSale > 24 && !this.hasPermission('ALL')) {
        return { success: false, error: 'Solo un administrador puede anular ventas de más de 24 horas' };
      }

      const voidTimestamp = new Date().toISOString();
      const voidCorrelativo = `VOID-${saleToVoid.correlativo}`;

      // 1. Revertir el stock si la venta tenía items con lotes (BILL-FIX-02: UPDATE directo, sin RPC)
      if (saleToVoid.items && saleToVoid.items.length > 0) {
        for (const item of saleToVoid.items) {
          if (item.dispatchLotes && item.dispatchLotes.length > 0) {
            for (const dispatch of item.dispatchLotes) {
              const batchId = String(dispatch.batchId ?? '').trim();
              const revertQty = Number(dispatch.qty ?? 0) || 0;
              if (!batchId || batchId === 'N/A' || revertQty <= 0) continue;

              const { data: batchRow, error: fetchErr } = await supabase
                .from('inventory_batches')
                .select('id, quantity')
                .eq('id', batchId)
                .maybeSingle();

              if (fetchErr || !batchRow) {
                console.warn(`VOID: lote ${batchId} no encontrado en inventory_batches, omitiendo revert.`);
                continue;
              }

              const currentQty = Number((batchRow as any).quantity ?? 0) || 0;
              const newQty = roundQtyValue(currentQty + revertQty);

              const { error: revertError } = await supabase
                .from('inventory_batches')
                .update({ quantity: newQty })
                .eq('id', batchId);

              if (revertError) {
                console.warn(`VOID: error revirtiendo lote ${batchId}:`, revertError);
              } else {
                try {
                  await this.insertMovementWithFallback({
                    product_code: item.code,
                    type: 'VOID',
                    quantity: revertQty,
                    warehouse: dispatch.warehouse,
                    reason: `Anulación venta ${saleToVoid.correlativo}: ${reason}`,
                    operator: this.currentUser?.name ?? authorizedBy
                  });
                } catch (e) {
                  console.warn('VOID: no se pudo registrar movimiento de reversión:', e);
                }
              }
            }
          }
        }
      }

      // 2. Marcar la venta como anulada en Supabase
      const { error: updateError } = await supabase
        .from('sales')
        .update({
          status: 'VOID',
          voided: true,
          void_reason: reason,
          voided_by: this.currentUser?.name || authorizedBy,
          voided_at: voidTimestamp,
          original_correlativo: saleToVoid.correlativo,
          correlativo: voidCorrelativo
        })
        .eq('id', saleId);

      if (updateError) {
        console.error('Error marcando venta como anulada:', updateError);
        return { success: false, error: 'Error al actualizar el estado de la venta' };
      }

      // 3. Revertir sale_payments en Firestore.
      // Importante: NO eliminar bank_transactions originales (auditoría append-only).
      try {
        const salePaySnap = await getDocs(query(collection(db, 'sale_payments'), where('saleId', '==', saleId)));
        for (const d of salePaySnap.docs) {
          await deleteDoc(d.ref);
        }
      } catch (e) {
        console.warn('VOID: no se pudieron eliminar sale_payments:', e);
      }

      try {
        const btSnap = await getDocs(query(
          collection(db, 'bank_transactions'),
          where('saleCorrelativo', '==', saleToVoid.correlativo)
        ));
        // Crear contramovimiento de reverso por cada ingreso original.
        for (const d of btSnap.docs) {
          const tx: any = d.data();
          const originalUSD = Number(tx?.amountUSD ?? 0) || 0;
          const originalVES = Number(tx?.amountVES ?? 0) || 0;
          if (Math.abs(originalUSD) < 0.000001 && Math.abs(originalVES) < 0.000001) continue;
          await this.appendBankTransaction({
            bankId: String(tx?.bankId ?? ''),
            bankName: String(tx?.bankName ?? ''),
            accountId: String(tx?.accountId ?? ''),
            accountLabel: String(tx?.accountLabel ?? ''),
            method: String(tx?.method ?? saleToVoid.paymentMethod ?? 'cash_usd'),
            source: 'SALE_RETURN',
            sourceId: String(voidCorrelativo),
            arId: '',
            customerId: String(saleToVoid?.client?.id ?? ''),
            customerName: String(saleToVoid?.client?.name ?? ''),
            saleCorrelativo: String(saleToVoid.correlativo ?? ''),
            currency: String(tx?.currency ?? (Math.abs(originalVES) > 0.000001 ? 'VES' : 'USD')).toUpperCase() as 'USD' | 'VES',
            amountUSD: -Math.abs(originalUSD),
            amountVES: -Math.abs(originalVES),
            rateUsed: Number(tx?.rateUsed ?? tx?.exchangeRate ?? 0) || 0,
            reference: `REV-${voidCorrelativo}`,
            note: `Reverso por anulación ${saleToVoid.correlativo}: ${reason}`,
            actor: this.currentUser?.name || authorizedBy,
            createdAt: voidTimestamp
          });
        }
      } catch (e) {
        console.warn('VOID: no se pudieron registrar reversos bancarios:', e);
      }

      // 4. Registrar auditoría
      this.addAuditEntry(
        'SALES',
        'SALE_VOID',
        `Venta anulada: ${saleToVoid.correlativo} | Cliente: ${saleToVoid.client?.name || 'N/A'} | Total: $${saleToVoid.totalUSD?.toFixed(2) || 0} | Motivo: ${reason} | Autorizado por: ${authorizedBy}`
      );

      // 5. Si es venta a crédito, actualizar la entrada en AR como anulada
      if (saleToVoid.paymentMethod === 'CREDIT' || saleToVoid.paymentMethod === 'credit') {
        const arEntries = this.getAREntries();
        const arEntry = arEntries.find(ar => ar.saleCorrelativo === saleToVoid.correlativo);
        if (arEntry) {
          await supabase.from('ar_entries').update({
            status: 'VOID',
            balanceUSD: 0,
            void_reason: `Venta anulada: ${reason}`,
            voided_by: this.currentUser?.name || authorizedBy,
            voided_at: voidTimestamp
          }).eq('id', arEntry.id);
        }
      }

      // 5. Actualizar en memoria
      const saleIndex = this.sales.findIndex(s => s.id === saleId);
      if (saleIndex >= 0) {
        this.sales[saleIndex] = {
          ...this.sales[saleIndex],
          status: 'VOID' as any,
          correlativo: voidCorrelativo
        };
      }

      // 6. Notificar cambios
      this.notify();

      return { success: true };
    } catch (error) {
      console.error('Error anulando venta:', error);
      return { success: false, error: 'Error interno al procesar la anulación' };
    }
  }

  /**
   * Suma cantidades ya devueltas por notas de crédito previas (misma factura)
   * para evitar doble devolución y exceso sobre lo facturado.
   */
  private async aggregatePriorSaleReturns(
    saleId: string,
    saleCorrelativo: string
  ): Promise<{ byLine: Map<number, number>; byCode: Map<string, number> }> {
    const byLine = new Map<number, number>();
    const byCode = new Map<string, number>();
    const scor = String(saleCorrelativo ?? '').trim();
    const sid = String(saleId ?? '').trim();
    if (!scor && !sid) return { byLine, byCode };
    try {
      const snap = scor
        ? await getDocs(query(collection(db, 'credit_notes'), where('saleCorrelativo', '==', scor)))
        : await getDocs(query(collection(db, 'credit_notes'), where('saleId', '==', sid)));
      for (const d of snap.docs) {
        const data: any = d.data();
        if (String(data?.type ?? '') !== 'SALE_RETURN') continue;
        if (String(data?.status ?? '').toUpperCase() === 'VOID') continue;
        const items = Array.isArray(data?.items) ? data.items : [];
        for (const it of items) {
          const q0 = roundTo(Number(it?.qty) || 0, 4);
          if (q0 <= 0) continue;
          const code = String(it?.code ?? '').trim().toUpperCase();
          if (code) byCode.set(code, (byCode.get(code) || 0) + q0);
          if (it?.lineIndex !== undefined && it?.lineIndex !== null) {
            const li = Math.floor(Number(it.lineIndex));
            if (Number.isFinite(li) && li >= 0) {
              byLine.set(li, (byLine.get(li) || 0) + q0);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[aggregatePriorSaleReturns] No se pudieron leer devoluciones previas:', e);
    }
    return { byLine, byCode };
  }

  // ─── DEVOLUCIÓN PARCIAL DE VENTA ────────────────────────────────────────────

  async partialReturnSale(params: {
    saleId: string;
    saleCorrelativo: string;
    clientId: string;
    clientName: string;
    returnItems: Array<{
      code: string;
      description: string;
      qty: number;
      priceUSD: number;
      lineIndex?: number;
      dispatchLotes?: { warehouse: string; batchId: string; qty: number }[];
    }>;
    reason: string;
    authorizedBy: string;
    refundMethod?: string;
    refundBank?: string;
    refundBankId?: string;
    refundAmountVES?: number;
    refundExchangeRate?: number;
  }): Promise<{
    success: boolean;
    creditNoteCorrelativo?: string;
    creditNoteAmountUSD?: number;
    movementDetails?: Array<{ method: string; bank: string; amountUSD: number; amountVES: number; rateUsed: number; reference: string }>;
    error?: string;
  }> {
    if (!this.hasPermission('SALES_VOID') && !this.hasPermission('ALL')) {
      return { success: false, error: 'Permiso denegado: Se requiere autorización para procesar devoluciones' };
    }
    if (!params.returnItems || params.returnItems.length === 0) {
      return { success: false, error: 'Debe seleccionar al menos un ítem para devolver' };
    }
    const returnFlightKey =
      (String(params.saleId ?? '').trim() && `id:${String(params.saleId).trim()}`) ||
      (String(params.saleCorrelativo ?? '').trim() && `c:${String(params.saleCorrelativo).trim()}`) ||
      'return-unknown';
    if (this.partialReturnSaleFlight.has(returnFlightKey)) {
      return { success: false, error: 'Ya se está procesando una devolución de esta factura. Espere a que finalice.' };
    }
    this.partialReturnSaleFlight.add(returnFlightKey);
    try {
      let saleForValidation: SaleHistoryEntry | null =
        (this.sales.find(
          (s: any) =>
            String(s.id ?? '') === String(params.saleId ?? '') || String(s.correlativo ?? '') === String(params.saleCorrelativo ?? '')
        ) as SaleHistoryEntry) ?? null;
      if (!saleForValidation || !Array.isArray(saleForValidation.items) || saleForValidation.items.length === 0) {
        if (String(params.saleId ?? '').trim()) {
          saleForValidation = await this.getSaleForReturn(String(params.saleId));
        }
      }
      if (!saleForValidation || !Array.isArray(saleForValidation.items) || saleForValidation.items.length === 0) {
        return { success: false, error: 'No se pudo verificar el detalle de la factura. Reabra el historial e intente de nuevo.' };
      }
      const { byLine, byCode } = await this.aggregatePriorSaleReturns(params.saleId, params.saleCorrelativo);
      for (const item of params.returnItems) {
        const req = roundTo(Number(item.qty) || 0, 4);
        if (req <= 0) {
          return { success: false, error: 'Las cantidades a devolver deben ser mayores a cero.' };
        }
        if (item.lineIndex !== undefined && item.lineIndex !== null) {
          const li = Math.floor(Number(item.lineIndex));
          const line: any = saleForValidation.items[li];
          if (!line) {
            return { success: false, error: `Línea de factura no válida (índice ${li}).` };
          }
          if (String(line.code ?? '').trim().toUpperCase() !== String(item.code ?? '').trim().toUpperCase()) {
            return { success: false, error: 'Inconsistencia entre línea y producto. Recargue la factura e intente de nuevo.' };
          }
          const maxQ = roundTo(Number(line.qty) || 0, 4);
          const already = byLine.get(li) || 0;
          if (req + already > maxQ + 0.0001) {
            const can = roundTo(Math.max(0, maxQ - already), 4);
            return {
              success: false,
              error: `No puede devolver ${req} unidad(es): el máximo pendiente en esta línea es ${can} (facturado ${maxQ}, ya devuelto ${already}).`
            };
          }
        } else {
          const codeU = String(item.code ?? '').trim().toUpperCase();
          let maxSold = 0;
          for (const ln of saleForValidation.items) {
            if (String(ln.code ?? '').trim().toUpperCase() === codeU) {
              maxSold = roundTo(maxSold + roundTo(Number((ln as any).qty) || 0, 4), 4);
            }
          }
          if (maxSold <= 0) {
            return { success: false, error: `Producto ${codeU} no figura en la factura.` };
          }
          const already = byCode.get(codeU) || 0;
          if (req + already > maxSold + 0.0001) {
            const can = roundTo(Math.max(0, maxSold - already), 4);
            return {
              success: false,
              error: `No puede devolver ${req} unidad(es): el máximo pendiente de este producto en la factura es ${can} (facturado en total ${maxSold}, ya devuelto ${already}).`
            };
          }
        }
      }

      const returnTimestamp = new Date().toISOString();
      const creditNoteCorrelativo = `NC-${params.saleCorrelativo}-${Date.now().toString(36).toUpperCase()}`;
      const creditNoteAmountUSD = roundMoney(
        params.returnItems.reduce((acc, item) => acc + roundMoney(item.qty * item.priceUSD), 0)
      );
      const saleRecord = saleForValidation;
      const saleTotalUSD = Number(saleRecord?.totalUSD ?? 0) || 0;
      const returnRatio = saleTotalUSD > 0 ? Math.max(0, Math.min(1, creditNoteAmountUSD / saleTotalUSD)) : 0;
      const refundMethod = params.refundMethod ?? 'cash_usd';
      const isBsRefundMethod = refundMethod === 'cash_ves' || refundMethod === 'transfer' || refundMethod === 'mobile' || refundMethod === 'debit' || refundMethod === 'biopago';

      // Ingresos bancarios de la factura (Firestore). No existía this.bankTransactions; hay que leer de la colección.
      let saleTxCandidates: any[] = [];
      try {
        const btSnap = await getDocs(
          query(
            collection(db, 'bank_transactions'),
            where('saleCorrelativo', '==', String(params.saleCorrelativo ?? ''))
          )
        );
        saleTxCandidates = btSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as any) }))
          .filter(
            (tx: any) =>
              (Number(tx?.amountUSD ?? 0) || 0) > 0 || (Number(tx?.amountVES ?? 0) || 0) > 0
          );
      } catch (e) {
        console.warn('[partialReturnSale] No se pudieron leer bank_transactions de la factura:', e);
        saleTxCandidates = [];
      }
      const txByMethod = saleTxCandidates.find((tx: any) => String(tx?.method ?? '') === refundMethod);
      const txByBsAmount = saleTxCandidates.find((tx: any) => (Number(tx?.amountVES ?? 0) || 0) > 0);
      const txAny = saleTxCandidates[0];
      const sourceTx = txByMethod ?? txByBsAmount ?? txAny;
      const hasOriginalBankTrace = saleTxCandidates.length > 0;
      const originalRate = Number(sourceTx?.rateUsed ?? sourceTx?.exchangeRate ?? 0) || 0;
      const requestedRate = Number(params.refundExchangeRate ?? 0) || 0;
      const effectiveRefundRate = isBsRefundMethod ? (originalRate > 0 ? originalRate : requestedRate) : requestedRate;
      if (isBsRefundMethod && !hasOriginalBankTrace && effectiveRefundRate <= 0) {
        return { success: false, error: 'No se pudo determinar la tasa de devolución en Bs. Verifique la factura original.' };
      }
      const requestedRefundVES = Number(params.refundAmountVES ?? 0) || 0;
      const effectiveRefundVES = isBsRefundMethod
        ? (requestedRefundVES > 0 ? roundMoney(requestedRefundVES) : roundMoney(creditNoteAmountUSD * effectiveRefundRate))
        : 0;
      const movementDetails: Array<{ method: string; bank: string; amountUSD: number; amountVES: number; rateUsed: number; reference: string }> = [];

      // 1. Revertir stock de los lotes despachados proporcionalmente
      const allRevertedBatchIds: string[] = [];
      for (const item of params.returnItems) {
        const hasDispatch = item.dispatchLotes && item.dispatchLotes.length > 0;

        if (hasDispatch) {
          // Caso A: tenemos info exacta del lote despachado → revertir exactamente
          let qtyToReturn = item.qty;
          for (const dispatch of item.dispatchLotes!) {
            if (qtyToReturn <= 0) break;
            const revertQty = roundTo(Math.min(dispatch.qty, qtyToReturn), 4);
            if (revertQty <= 0) continue;
            const { data: batchData } = await supabase
              .from('inventory_batches')
              .select('quantity')
              .eq('id', dispatch.batchId)
              .single();
            if (batchData) {
              const newQty = roundTo((batchData as any).quantity + revertQty, 4);
              await supabase
                .from('inventory_batches')
                .update({ quantity: newQty })
                .eq('id', dispatch.batchId);
              allRevertedBatchIds.push(dispatch.batchId);
              // Actualizar en memoria
              for (const p of [...this.products, ...this.allProducts]) {
                const l = p.lotes.find(l => String(l.id) === String(dispatch.batchId));
                if (l) { l.qty = newQty; break; }
              }
            }
            const retReasonA = this.buildSaleReturnMovementReason({
              creditNoteCorrelativo,
              saleCorrelativo: params.saleCorrelativo,
              clientName: params.clientName,
              userReason: params.reason,
              batchLabel: `Lote: ${String(dispatch.batchId)} · ${dispatch.warehouse}`
            });
            await supabase.from('inventory_movements').insert({
              type: 'SALE_RETURN',
              sku: item.code,
              quantity: revertQty,
              warehouse: dispatch.warehouse,
              batch_id: dispatch.batchId,
              reason: retReasonA,
              operator: params.authorizedBy,
              created_at: returnTimestamp
            });
            await this.insertMovementsTableSaleReturnLine({
              productCode: item.code,
              qty: revertQty,
              warehouse: dispatch.warehouse,
              reason: retReasonA,
              operator: params.authorizedBy,
              dateIso: returnTimestamp
            });
            qtyToReturn = roundTo(qtyToReturn - revertQty, 4);
          }
        } else {
          // Caso B: sin info de lote (venta antigua) → fallback FIFO por producto en Supabase
          let qtyToReturn = item.qty;
          const { data: batches } = await supabase
            .from('inventory_batches')
            .select('*')
            .eq('product_code', item.code)
            .gt('quantity', 0)
            .order('expiry_date', { ascending: true });

          if (batches && batches.length > 0) {
            for (const batch of batches) {
              if (qtyToReturn <= 0) break;
              const available = Number(batch.quantity) || 0;
              const revertQty = roundTo(Math.min(available, qtyToReturn), 4);
              if (revertQty <= 0) continue;
              const newQty = roundTo(available + revertQty, 4);
              await supabase
                .from('inventory_batches')
                .update({ quantity: newQty })
                .eq('id', batch.id);
              allRevertedBatchIds.push(String(batch.id));
              // Actualizar en memoria
              for (const p of [...this.products, ...this.allProducts]) {
                const l = p.lotes.find(l => String(l.id) === String(batch.id));
                if (l) { l.qty = newQty; break; }
              }
              const retReasonB = this.buildSaleReturnMovementReason({
                creditNoteCorrelativo,
                saleCorrelativo: params.saleCorrelativo,
                clientName: params.clientName,
                userReason: params.reason,
                batchLabel: `Lote: ${String(batch.id)} (FIFO) · ${String(batch.warehouse ?? 'Galpon D3')}`
              });
              await supabase.from('inventory_movements').insert({
                type: 'SALE_RETURN',
                sku: item.code,
                quantity: revertQty,
                warehouse: String(batch.warehouse ?? 'Galpon D3'),
                batch_id: String(batch.id),
                reason: retReasonB,
                operator: params.authorizedBy,
                created_at: returnTimestamp
              });
              await this.insertMovementsTableSaleReturnLine({
                productCode: item.code,
                qty: revertQty,
                warehouse: String(batch.warehouse ?? 'Galpon D3'),
                reason: retReasonB,
                operator: params.authorizedBy,
                dateIso: returnTimestamp
              });
              qtyToReturn = roundTo(qtyToReturn - revertQty, 4);
            }
          } else {
            // Sin lotes existentes → crear lote nuevo con la cantidad devuelta
            const productMem = this.products.find(p => String(p.code).toUpperCase() === String(item.code).toUpperCase());
            const warehouse = productMem?.lotes?.[0]?.warehouse ?? 'Galpon D3';
            const { data: newBatch } = await supabase
              .from('inventory_batches')
              .insert({
                product_code: item.code,
                quantity: item.qty,
                cost_usd: item.priceUSD,
                expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                purchase_date: new Date().toISOString().split('T')[0],
                warehouse,
                supplier: `Devolución NC: ${creditNoteCorrelativo}`
              })
              .select()
              .single();
            if (newBatch) {
              allRevertedBatchIds.push(String((newBatch as any).id));
              const retReasonC = this.buildSaleReturnMovementReason({
                creditNoteCorrelativo,
                saleCorrelativo: params.saleCorrelativo,
                clientName: params.clientName,
                userReason: params.reason,
                batchLabel: `Lote nuevo: ${String((newBatch as any).id)} · ${warehouse}`
              });
              await supabase.from('inventory_movements').insert({
                type: 'SALE_RETURN',
                sku: item.code,
                quantity: item.qty,
                warehouse,
                batch_id: String((newBatch as any).id),
                reason: retReasonC,
                operator: params.authorizedBy,
                created_at: returnTimestamp
              });
              await this.insertMovementsTableSaleReturnLine({
                productCode: item.code,
                qty: item.qty,
                warehouse,
                reason: retReasonC,
                operator: params.authorizedBy,
                dateIso: returnTimestamp
              });
            }
          }
        }
      }

      // 2. Registrar nota de crédito en AR (crédito a favor del cliente)
      await addDoc(collection(db, 'credit_notes'), {
        correlativo: creditNoteCorrelativo,
        type: 'SALE_RETURN',
        saleId: params.saleId,
        saleCorrelativo: params.saleCorrelativo,
        clientId: params.clientId,
        clientName: params.clientName,
        amountUSD: creditNoteAmountUSD,
        reason: params.reason,
        authorizedBy: params.authorizedBy,
        items: params.returnItems.map((i) => {
          const row: Record<string, unknown> = {
            code: i.code,
            description: i.description,
            qty: i.qty,
            priceUSD: i.priceUSD,
            totalUSD: roundMoney(i.qty * i.priceUSD)
          };
          if (i.lineIndex !== undefined && i.lineIndex !== null) row.lineIndex = i.lineIndex;
          return row;
        }),
        status: 'PENDING',
        refundMethod,
        refundBank: params.refundBank ?? '',
        refundAmountVES: effectiveRefundVES,
        refundExchangeRate: effectiveRefundRate,
        refundRateSource: originalRate > 0 ? 'ORIGINAL_SALE' : 'REQUESTED',
        createdAt: returnTimestamp
      });

      // 3. Auditoría
      await this.addAuditEntry(
        'SALES',
        'SALE_PARTIAL_RETURN',
        `Devolución parcial: ${params.saleCorrelativo} | NC: ${creditNoteCorrelativo} | Cliente: ${params.clientName} | Monto: $${creditNoteAmountUSD.toFixed(2)} | Método: ${params.refundMethod ?? 'cash_usd'}${params.refundBank ? ' / ' + params.refundBank : ''} | Ítems: ${params.returnItems.length} | Motivo: ${params.reason} | Por: ${params.authorizedBy}`
      );

      // 3b. Registrar egreso bancario de la devolución.
      // Si existe trazabilidad de ingreso original, devolvemos espejo por cada línea bancaria.
      try {
        if (hasOriginalBankTrace && returnRatio > 0) {
          const baseLines = saleTxCandidates.map((tx: any) => ({
            tx,
            usd: roundMoney((Number(tx?.amountUSD ?? 0) || 0) * returnRatio),
            ves: roundMoney((Number(tx?.amountVES ?? 0) || 0) * returnRatio)
          }));
          const targetUSD = roundMoney(saleTxCandidates.reduce((a: number, tx: any) => a + (Number(tx?.amountUSD ?? 0) || 0), 0) * returnRatio);
          const targetVES = roundMoney(saleTxCandidates.reduce((a: number, tx: any) => a + (Number(tx?.amountVES ?? 0) || 0), 0) * returnRatio);
          const currentUSD = roundMoney(baseLines.reduce((a: number, l: any) => a + l.usd, 0));
          const currentVES = roundMoney(baseLines.reduce((a: number, l: any) => a + l.ves, 0));
          if (baseLines.length > 0) {
            baseLines[0].usd = roundMoney(baseLines[0].usd + (targetUSD - currentUSD));
            baseLines[0].ves = roundMoney(baseLines[0].ves + (targetVES - currentVES));
          }
          for (const line of baseLines) {
            if (Math.abs(line.usd) < 0.000001 && Math.abs(line.ves) < 0.000001) continue;
            await this.appendBankTransaction({
              bankId: String(line.tx?.bankId ?? ''),
              bankName: String(line.tx?.bankName ?? ''),
              accountId: String(line.tx?.accountId ?? ''),
              accountLabel: String(line.tx?.accountLabel ?? ''),
              method: String(line.tx?.method ?? refundMethod),
              source: 'SALE_RETURN',
              sourceId: creditNoteCorrelativo,
              arId: '',
              customerId: params.clientId,
              customerName: params.clientName,
              saleCorrelativo: params.saleCorrelativo,
              currency: String(line.tx?.currency ?? (Math.abs(line.ves) > 0.000001 ? 'VES' : 'USD')).toUpperCase() as 'USD' | 'VES',
              amountUSD: -Math.abs(line.usd),
              amountVES: -Math.abs(line.ves),
              rateUsed: Number(line.tx?.rateUsed ?? line.tx?.exchangeRate ?? 0) || 0,
              reference: `${creditNoteCorrelativo}:${String(line.tx?.reference ?? '').trim() || String(line.tx?.method ?? '').trim()}`,
              note: `Devolución NC espejo: ${creditNoteCorrelativo} | Factura: ${params.saleCorrelativo} | Motivo: ${params.reason}`,
              actor: params.authorizedBy,
              createdAt: returnTimestamp
            });
            movementDetails.push({
              method: String(line.tx?.method ?? refundMethod),
              bank: String(line.tx?.bankName ?? ''),
              amountUSD: -Math.abs(line.usd),
              amountVES: -Math.abs(line.ves),
              rateUsed: Number(line.tx?.rateUsed ?? line.tx?.exchangeRate ?? 0) || 0,
              reference: `${creditNoteCorrelativo}:${String(line.tx?.reference ?? '').trim() || String(line.tx?.method ?? '').trim()}`
            });
          }
        } else {
          const refMethod = refundMethod;
          const isBsMethod = isBsRefundMethod;
          const bankName = String(params.refundBank ?? '').trim();
          const bankId = String(params.refundBankId ?? '').trim();
          let bankResolution: { bankId: string; bankName: string; accountId: string; accountLabel: string } | null = null;
          if (bankId) {
            bankResolution = this.resolveBankAccountForMethod({ bankId, paymentMethod: refMethod });
          } else if (bankName && bankName.toUpperCase() !== 'OTRO') {
            bankResolution = this.resolveBankAccountForMethod({ bankName, paymentMethod: refMethod });
          }
          if (!bankResolution && !isBsMethod) {
            const usdBanks = this.banks.filter(b => b.active !== false);
            if (usdBanks.length > 0) {
              const b = usdBanks[0];
              const accs = Array.isArray(b.accounts) ? b.accounts : [];
              const acc = accs.find((a: any) => String(a?.currency ?? '').toUpperCase() === 'USD') ?? accs[0];
              if (acc) bankResolution = { bankId: String(b.id), bankName: b.name, accountId: String(acc.id ?? ''), accountLabel: String(acc.label ?? '') };
            }
          }
          if (bankResolution) {
            const refAmountVES = effectiveRefundVES;
            const rateUsed = effectiveRefundRate;
            const amtUSD = isBsMethod ? roundMoney(refAmountVES / (rateUsed || 1)) : creditNoteAmountUSD;
            await this.appendBankTransaction({
              bankId: bankResolution.bankId,
              bankName: bankResolution.bankName,
              accountId: bankResolution.accountId,
              accountLabel: bankResolution.accountLabel,
              method: refMethod,
              source: 'SALE_RETURN',
              sourceId: creditNoteCorrelativo,
              arId: '',
              customerId: params.clientId,
              customerName: params.clientName,
              saleCorrelativo: params.saleCorrelativo,
              currency: isBsMethod ? 'VES' : 'USD',
              amountUSD: -Math.abs(amtUSD),
              amountVES: isBsMethod ? -Math.abs(refAmountVES) : 0,
              rateUsed,
              reference: creditNoteCorrelativo,
              note: `Devolución NC: ${creditNoteCorrelativo} | Motivo: ${params.reason}`,
              actor: params.authorizedBy,
              createdAt: returnTimestamp
            });
            movementDetails.push({
              method: refMethod,
              bank: String(bankResolution.bankName ?? ''),
              amountUSD: -Math.abs(amtUSD),
              amountVES: isBsMethod ? -Math.abs(refAmountVES) : 0,
              rateUsed,
              reference: creditNoteCorrelativo
            });
          }
        }
      } catch (bankErr: any) {
        console.warn('No se pudo registrar bank_transaction (SALE_RETURN):', bankErr?.message ?? bankErr);
      }

      // 4. Recargar inventario en memoria para reflejar el stock revertido
      try {
        const { data: updatedBatches } = await supabase
          .from('inventory_batches')
          .select('*')
          .in('id', allRevertedBatchIds);
        if (updatedBatches && updatedBatches.length > 0) {
          for (const batch of updatedBatches) {
            for (const product of this.products) {
              const lote = product.lotes.find(l => String(l.id) === String(batch.id));
              if (lote) {
                lote.qty = Number(batch.quantity) || 0;
                break;
              }
            }
            for (const product of this.allProducts) {
              const lote = product.lotes.find(l => String(l.id) === String(batch.id));
              if (lote) {
                lote.qty = Number(batch.quantity) || 0;
                break;
              }
            }
          }
        }
      } catch (e) {
        console.warn('No se pudo actualizar inventario en memoria tras devolución:', e);
      }

      this.notify();
      await this.init(true);
      return { success: true, creditNoteCorrelativo, creditNoteAmountUSD, movementDetails };
    } catch (error: any) {
      console.error('Error en devolución parcial:', error);
      return { success: false, error: error?.message || 'Error interno al procesar la devolución' };
    } finally {
      this.partialReturnSaleFlight.delete(returnFlightKey);
    }
  }

  async transferStock(sku: string, fromWh: string, toWh: string, qty: number, user: string, batchId?: string) {
    const product = this.products.find(p => p.code === sku);
    if (!product) return false;

    // Simplificación de traslado para Supabase
    const { data: batches } = await supabase.from('inventory_batches')
      .select('*')
      .eq('product_code', sku)
      .eq('warehouse', fromWh);

    if (!batches || batches.length === 0) return false;

    let remaining = qty;
    for (const b of batches) {
      if (remaining <= 0) break;
      const move = Math.min(b.quantity, remaining);

      // Descontar del origen
      await supabase.from('inventory_batches').update({ quantity: b.quantity - move }).eq('id', b.id);

      // Sumar al destino (o crear nuevo lote)
      const { data: existing } = await supabase.from('inventory_batches')
        .select('*')
        .eq('product_code', sku)
        .eq('warehouse', toWh)
        .eq('expiry_date', b.expiry_date)
        .limit(1);

      if (existing && existing.length > 0) {
        await supabase.from('inventory_batches').update({ quantity: Number(existing[0].quantity) + move }).eq('id', existing[0].id);
      } else {
        await supabase.from('inventory_batches').insert({
          product_code: sku,
          warehouse: toWh,
          quantity: move,
          expiry_date: b.expiry_date,
          purchase_date: b.purchase_date,
          cost_usd: b.cost_usd
        });
      }
      remaining -= move;
    }

    // Registrar movimiento de traslado
    await supabase.from('movements').insert({
      product_code: sku,
      type: 'TRANSFER',
      quantity: qty,
      warehouse: `${fromWh} -> ${toWh}`,
      reason: `Traslado Interno`,
      operator: this.currentUser.name
    });

    // SEC-05: Audit trail para traslado de inventario
    await this.addAuditEntry('INVENTORY', 'TRANSFER', 
      `Traslado: ${sku} | ${qty} unidades | ${fromWh} → ${toWh} | Usuario: ${this.currentUser?.name || 'Sistema'}`);

    await this.init();
    return true;
  }

  private findAPEntriesForClient(name: string, id: string = ''): APEntry[] {
    const normalize = (s: string) => 
      String(s || '')
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar acentos
        .replace(/[^a-z0-9]/g, ""); // Solo letras y números

    const queryNameClean = normalize(name);
    // Extraer solo números para comparación de ID
    const queryId = String(id || '').trim().replace(/[^0-9]/g, ""); 
    
    if (!queryNameClean && !queryId) return [];

    const found = this.apEntries.filter((e) => {
      if (e.status === 'PAID' || Number(e.balanceUSD) <= 0) return false;

      const eNameOrig = String(e.supplier || '').trim().toLowerCase();
      const eNameClean = normalize(eNameOrig);
      
      // 1. Coincidencia por ID numérico (si el queryId existe)
      if (queryId) {
         // Buscar números dentro del nombre del proveedor (ej: "JOSE 24326997")
         const eNameNumbers = eNameOrig.replace(/[^0-9]/g, "");
         if (eNameNumbers.includes(queryId) || queryId.includes(eNameNumbers && eNameNumbers.length > 5 ? eNameNumbers : "NOMATCH")) return true;
      }

      // 2. Coincidencia por Nombre limpio (Resiliente a nombres parciales)
      if (queryNameClean && eNameClean) {
         if (eNameClean === queryNameClean || eNameClean.includes(queryNameClean) || queryNameClean.includes(eNameClean)) return true;
      }

      return false;
    });

    return found;
  }

  getAPBalanceBySupplier(name: string): number {
    const entries = this.findAPEntriesForClient(name);
    return roundMoney(entries.reduce((acc, e) => acc + (Number(e.balanceUSD) || 0), 0));
  }

  private async applyAPOffsetBySale(clientName: string, amountUSD: number, saleCorrelativo: string, clientId?: string) {
    if (amountUSD <= 0) return;
    const pending = this.findAPEntriesForClient(clientName, clientId || '')
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let remaining = amountUSD;
    for (const entry of pending) {
      if (remaining <= 0) break;

      const discount = Math.min(remaining, entry.balanceUSD);
      const newBalance = roundMoney(entry.balanceUSD - discount);

      // Registrar pago/abono en CxP
      const payment: APPaymentRecord = {
        apId: entry.id,
        supplier: entry.supplier,
        description: entry.description,
        method: 'venta',
        currency: 'USD',
        amountUSD: discount,
        amountVES: 0,
        rateUsed: 0,
        bank: 'COMPENSACION VENTAS',
        bankId: 'INTERNAL',
        accountId: 'INTERNAL',
        accountLabel: 'COMPENSACION VENTAS',
        reference: saleCorrelativo,
        note: `Se realizó un descuento de la cuenta por pagar ${entry.id} por la venta ${saleCorrelativo} del proveedor/cliente ${entry.supplier}`,
        supports: [],
        actor: this.currentUser?.name ?? 'SISTEMA',
        createdAt: new Date().toISOString()
      };

      // 1. PRIMERO Actualizar balance en Supabase (LO MÁS IMPORTANTE)
      const { error: updateError } = await supabase.from('ap_entries').update({
        balance_usd: newBalance,
        status: newBalance <= 0 ? 'PAID' : entry.status
      }).eq('id', entry.id);

      if (updateError) {
        console.error('ERROR CRITICO CXP SUPABASE:', updateError);
        throw new Error(`No se pudo actualizar el saldo en la base de datos: ${updateError.message}`);
      }

      // 2. Registrar Auditoría en Feed
      await this.addExpense(
        `[OFICIAL] CxP ACTUALIZADO: ${entry.supplier} - Nuevo Saldo $${newBalance.toFixed(2)} (vía ${saleCorrelativo})`,
        0,
        'VARIABLE'
      );

      // 3. Registrar Historico en Firestore (Segundo plano, no bloqueante)
      try {
        await addDoc(collection(db, 'ap_entries', entry.id, 'payments'), payment as any);
      } catch (e) {
        console.warn('Error al guardar historial (no afecta saldo):', e);
      }

      remaining = roundMoney(remaining - discount);
    }

    // Si queda saldo restante después de agotar AP, el sistema lo ignora o podría reportarlo
    // En este caso lo dejamos así para no complicar el flujo
  }

  // ─── ANTICIPOS DE CLIENTE ────────────────────────────────────────────────

  async createClientAdvance(params: {
    customerId: string;
    customerName: string;
    amountUSD: number;
    originInvoiceId: string;
    originCorrelativo: string;
    note?: string;
    currency?: 'USD' | 'VES';
    originalAmountVES?: number;
    rateAtCreation?: number;
  }): Promise<ClientAdvance> {
    const now = new Date().toISOString();
    const advance: Omit<ClientAdvance, 'id'> = {
      customerId: params.customerId,
      customerName: params.customerName,
      amountUSD: roundMoney(params.amountUSD),
      balanceUSD: roundMoney(params.amountUSD),
      currency: params.currency ?? 'USD',
      originalAmountVES: params.originalAmountVES,
      rateAtCreation: params.rateAtCreation,
      status: 'AVAILABLE',
      originInvoiceId: params.originInvoiceId,
      originCorrelativo: params.originCorrelativo,
      createdAt: now,
      updatedAt: now,
      note: params.note ?? `Excedente de factura ${params.originCorrelativo}`
    };
    // FIRESTORE FIX: eliminar campos undefined para evitar error "Unsupported field value: undefined"
    const payload: Record<string, any> = {};
    for (const [k, v] of Object.entries(advance)) {
      if (v !== undefined) payload[k] = v;
    }
    const ref = await addDoc(collection(db, 'client_advances'), payload);
    return { id: ref.id, ...advance };
  }

  async getClientAdvances(customerId: string): Promise<ClientAdvance[]> {
    try {
      const snap = await getDocs(
        query(
          collection(db, 'client_advances'),
          where('customerId', '==', customerId),
          where('status', 'in', ['AVAILABLE', 'PARTIAL'])
        )
      );
      return snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          customerId: String(data.customerId ?? ''),
          customerName: String(data.customerName ?? ''),
          amountUSD: Number(data.amountUSD ?? 0),
          balanceUSD: Number(data.balanceUSD ?? 0),
          currency: (data.currency ?? 'USD') as 'USD' | 'VES',
          originalAmountVES: data.originalAmountVES ? Number(data.originalAmountVES) : undefined,
          rateAtCreation: data.rateAtCreation ? Number(data.rateAtCreation) : undefined,
          status: (data.status ?? 'AVAILABLE') as ClientAdvance['status'],
          originInvoiceId: String(data.originInvoiceId ?? ''),
          originCorrelativo: String(data.originCorrelativo ?? ''),
          createdAt: String(data.createdAt ?? ''),
          updatedAt: String(data.updatedAt ?? ''),
          note: data.note ? String(data.note) : undefined
        };
      });
    } catch (e) {
      console.warn('No se pudieron cargar anticipos de cliente:', e);
      return [];
    }
  }

  async getClientAdvanceBalance(customerId: string): Promise<number> {
    const advances = await this.getClientAdvances(customerId);
    return roundMoney(advances.reduce((acc, a) => acc + a.balanceUSD, 0));
  }

  async applyClientAdvance(params: {
    customerId: string;
    amountToApplyUSD: number;
    appliedInCorrelativo: string;
    appliedInSaleId: string;
  }): Promise<number> {
    const advances = await this.getClientAdvances(params.customerId);
    const sorted = advances.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let remaining = roundMoney(params.amountToApplyUSD);

    for (const adv of sorted) {
      if (remaining <= 0.005) break;
      const discount = roundMoney(Math.min(adv.balanceUSD, remaining));
      if (discount <= 0) continue;

      const newBalance = roundMoney(adv.balanceUSD - discount);
      const newStatus: ClientAdvance['status'] = newBalance <= 0.005 ? 'APPLIED' : 'PARTIAL';

      try {
        await updateDoc(doc(db, 'client_advances', adv.id), {
          balanceUSD: newBalance,
          status: newStatus,
          updatedAt: new Date().toISOString(),
          lastAppliedInCorrelativo: params.appliedInCorrelativo,
          lastAppliedInSaleId: params.appliedInSaleId
        });
        await addDoc(collection(db, 'client_advances', adv.id, 'applications'), {
          appliedUSD: discount,
          remainingAfter: newBalance,
          appliedInCorrelativo: params.appliedInCorrelativo,
          appliedInSaleId: params.appliedInSaleId,
          appliedAt: new Date().toISOString(),
          actor: this.currentUser?.name ?? ''
        });
      } catch (e) {
        console.warn('Error aplicando anticipo de cliente:', e);
      }

      remaining = roundMoney(remaining - discount);
    }

    return roundMoney(params.amountToApplyUSD - remaining);
  }

  async getAdvanceApplicationHistory(advanceId: string): Promise<Array<{
    id: string; appliedUSD: number; remainingAfter: number;
    appliedInCorrelativo: string; appliedAt: string; actor: string;
  }>> {
    try {
      const snap = await getDocs(
        query(collection(db, 'client_advances', advanceId, 'applications'), orderBy('appliedAt', 'desc'))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch { return []; }
  }

  async getAllClientAdvancesForAdmin(includeApplied = false): Promise<ClientAdvance[]> {
    try {
      const statusFilter = includeApplied
        ? ['AVAILABLE', 'PARTIAL', 'APPLIED']
        : ['AVAILABLE', 'PARTIAL'];
      const snap = await getDocs(
        query(collection(db, 'client_advances'), where('status', 'in', statusFilter), orderBy('createdAt', 'desc'), limit(500))
      );
      return snap.docs.map(d => {
        const data = d.data() as any;
        return {
          id: d.id,
          customerId: String(data.customerId ?? ''),
          customerName: String(data.customerName ?? ''),
          amountUSD: Number(data.amountUSD ?? 0),
          balanceUSD: Number(data.balanceUSD ?? 0),
          currency: (data.currency ?? 'USD') as 'USD' | 'VES',
          originalAmountVES: data.originalAmountVES ? Number(data.originalAmountVES) : undefined,
          rateAtCreation: data.rateAtCreation ? Number(data.rateAtCreation) : undefined,
          status: (data.status ?? 'AVAILABLE') as ClientAdvance['status'],
          originInvoiceId: String(data.originInvoiceId ?? ''),
          originCorrelativo: String(data.originCorrelativo ?? ''),
          createdAt: String(data.createdAt ?? ''),
          updatedAt: String(data.updatedAt ?? ''),
          note: data.note ? String(data.note) : undefined
        };
      });
    } catch { return []; }
  }

  async manualApplyClientAdvance(params: {
    advanceId: string;
    customerId: string;
    amountToApplyUSD: number;
    referenceNote: string;
    actor: string;
  }): Promise<void> {
    const snap = await getDocs(query(
      collection(db, 'client_advances'),
      where('customerId', '==', params.customerId),
      where('status', 'in', ['AVAILABLE', 'PARTIAL'])
    ));
    const advance = snap.docs.find(d => d.id === params.advanceId);
    if (!advance) throw new Error('Anticipo no encontrado');
    const data = advance.data() as any;
    const currentBalance = Number(data.balanceUSD ?? 0);
    const toApply = Math.min(currentBalance, params.amountToApplyUSD);
    if (toApply <= 0.005) throw new Error('Monto a aplicar inválido o saldo insuficiente');
    const newBalance = roundMoney(currentBalance - toApply);
    const newStatus: ClientAdvance['status'] = newBalance <= 0.005 ? 'APPLIED' : 'PARTIAL';
    await updateDoc(advance.ref, {
      balanceUSD: newBalance,
      status: newStatus,
      updatedAt: new Date().toISOString()
    });
    await addDoc(collection(db, 'client_advances', params.advanceId, 'applications'), {
      appliedUSD: toApply,
      remainingAfter: newBalance,
      appliedInCorrelativo: params.referenceNote,
      appliedInSaleId: 'MANUAL',
      appliedAt: new Date().toISOString(),
      actor: params.actor
    });
    this.addAuditEntry('FINANCE', 'ADVANCE_MANUAL_APPLY',
      `Anticipo ${params.advanceId} aplicado manualmente: $${toApply.toFixed(2)} · ${params.referenceNote}`);
  }

  // ─── ANTICIPOS DE PROVEEDOR (FIN-09) ────────────────────────────────────────

  private mapSupplierAdvanceDoc(d: any): SupplierAdvance {
    const data = (typeof d.data === 'function' ? d.data() : d) as any;
    return {
      id: String(d.id ?? data.id ?? ''),
      supplierId: data.supplierId ? String(data.supplierId) : undefined,
      supplierName: String(data.supplierName ?? ''),
      amountUSD: Number(data.amountUSD ?? 0),
      balanceUSD: Number(data.balanceUSD ?? 0),
      currency: (data.currency ?? 'USD') as 'USD' | 'VES',
      originalAmountVES: data.originalAmountVES ? Number(data.originalAmountVES) : undefined,
      rateAtCreation: data.rateAtCreation ? Number(data.rateAtCreation) : undefined,
      status: (data.status ?? 'AVAILABLE') as SupplierAdvance['status'],
      reference: String(data.reference ?? ''),
      method: data.method ? String(data.method) : undefined,
      bankId: data.bankId ? String(data.bankId) : undefined,
      bankName: data.bankName ? String(data.bankName) : undefined,
      apEntryApplied: data.apEntryApplied ? String(data.apEntryApplied) : undefined,
      createdAt: String(data.createdAt ?? ''),
      updatedAt: String(data.updatedAt ?? ''),
      note: data.note ? String(data.note) : undefined
    };
  }

  async createSupplierAdvance(params: {
    supplierName: string;
    supplierId?: string;
    amountUSD: number;
    reference: string;
    method?: string;
    bankId?: string;
    bankName?: string;
    note?: string;
    currency?: 'USD' | 'VES';
    originalAmountVES?: number;
    rateAtCreation?: number;
  }): Promise<SupplierAdvance> {
    if (!this.hasPermission('FINANCE_VIEW') && !this.hasPermission('ALL')) {
      throw new Error('Sin permiso para registrar anticipos de proveedor.');
    }
    const supplierName = String(params.supplierName ?? '').trim();
    if (!supplierName) throw new Error('Nombre del proveedor requerido.');
    const amountUSD = roundMoney(Number(params.amountUSD ?? 0) || 0);
    if (amountUSD <= 0) throw new Error('El monto del anticipo debe ser mayor a cero.');
    const reference = String(params.reference ?? '').trim().toUpperCase();
    if (!reference) throw new Error('La referencia del anticipo es requerida.');

    const now = new Date().toISOString();
    const advance: Omit<SupplierAdvance, 'id'> = {
      supplierId: params.supplierId ? String(params.supplierId) : undefined,
      supplierName,
      amountUSD,
      balanceUSD: amountUSD,
      currency: params.currency ?? 'USD',
      originalAmountVES: params.originalAmountVES,
      rateAtCreation: params.rateAtCreation,
      status: 'AVAILABLE',
      reference,
      method: params.method,
      bankId: params.bankId,
      bankName: params.bankName,
      createdAt: now,
      updatedAt: now,
      note: params.note ?? `Anticipo proveedor ${supplierName} — Ref: ${reference}`
    };

    const ref = await addDoc(collection(db, 'supplier_advances'), advance as any);
    await this.addAuditEntry(
      'FINANCE',
      'SUPPLIER_ADVANCE_CREATED',
      `Anticipo proveedor: ${supplierName} | $${amountUSD.toFixed(2)} | Ref: ${reference} | Usuario: ${this.currentUser?.name ?? 'SISTEMA'}`
    );
    return { id: ref.id, ...advance };
  }

  async getSupplierAdvances(supplierName: string, includeApplied = false): Promise<SupplierAdvance[]> {
    try {
      const statusFilter = includeApplied ? ['AVAILABLE', 'PARTIAL', 'APPLIED'] : ['AVAILABLE', 'PARTIAL'];
      const snap = await getDocs(
        query(
          collection(db, 'supplier_advances'),
          where('supplierName', '==', supplierName),
          where('status', 'in', statusFilter),
          orderBy('createdAt', 'desc')
        )
      );
      return snap.docs.map(d => this.mapSupplierAdvanceDoc(d));
    } catch (e) {
      console.warn('No se pudieron cargar anticipos de proveedor:', e);
      return [];
    }
  }

  async getSupplierAdvanceBalance(supplierName: string): Promise<number> {
    const advances = await this.getSupplierAdvances(supplierName);
    return roundMoney(advances.reduce((acc, a) => acc + a.balanceUSD, 0));
  }

  async getAllSupplierAdvancesForAdmin(includeApplied = false): Promise<SupplierAdvance[]> {
    try {
      const statusFilter = includeApplied ? ['AVAILABLE', 'PARTIAL', 'APPLIED'] : ['AVAILABLE', 'PARTIAL'];
      const snap = await getDocs(
        query(
          collection(db, 'supplier_advances'),
          where('status', 'in', statusFilter),
          orderBy('createdAt', 'desc'),
          limit(500)
        )
      );
      return snap.docs.map(d => this.mapSupplierAdvanceDoc(d));
    } catch (e) {
      console.warn('No se pudieron cargar todos los anticipos de proveedor:', e);
      return [];
    }
  }

  async applySupplierAdvanceToAP(params: {
    supplierName: string;
    amountToApplyUSD: number;
    apEntryId: string;
  }): Promise<number> {
    const advances = await this.getSupplierAdvances(params.supplierName);
    const sorted = advances.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let remaining = roundMoney(params.amountToApplyUSD);

    for (const adv of sorted) {
      if (remaining <= 0.005) break;
      const discount = roundMoney(Math.min(adv.balanceUSD, remaining));
      if (discount <= 0) continue;

      const newBalance = roundMoney(adv.balanceUSD - discount);
      const newStatus: SupplierAdvance['status'] = newBalance <= 0.005 ? 'APPLIED' : 'PARTIAL';

      try {
        await updateDoc(doc(db, 'supplier_advances', adv.id), {
          balanceUSD: newBalance,
          status: newStatus,
          updatedAt: new Date().toISOString(),
          apEntryApplied: params.apEntryId
        });
        await addDoc(collection(db, 'supplier_advances', adv.id, 'applications'), {
          appliedUSD: discount,
          remainingAfter: newBalance,
          apEntryId: params.apEntryId,
          appliedAt: new Date().toISOString(),
          actor: this.currentUser?.name ?? ''
        });
      } catch (e) {
        console.warn('Error aplicando anticipo de proveedor:', e);
      }

      remaining = roundMoney(remaining - discount);
    }

    const applied = roundMoney(params.amountToApplyUSD - remaining);
    if (applied > 0) {
      await this.adjustAPEntryBalance(params.apEntryId, -applied);
      await this.addAuditEntry(
        'FINANCE',
        'SUPPLIER_ADVANCE_APPLIED_TO_AP',
        `Anticipo proveedor aplicado a CxP ${params.apEntryId}: $${applied.toFixed(2)} | Proveedor: ${params.supplierName}`
      );
    }
    return applied;
  }

  async manualApplySupplierAdvance(params: {
    advanceId: string;
    supplierName: string;
    amountToApplyUSD: number;
    referenceNote: string;
    apEntryId?: string;
    actor: string;
  }): Promise<void> {
    const snap = await getDocs(query(
      collection(db, 'supplier_advances'),
      where('supplierName', '==', params.supplierName),
      where('status', 'in', ['AVAILABLE', 'PARTIAL'])
    ));
    const advance = snap.docs.find(d => d.id === params.advanceId);
    if (!advance) throw new Error('Anticipo de proveedor no encontrado');
    const data = advance.data() as any;
    const currentBalance = Number(data.balanceUSD ?? 0);
    const toApply = roundMoney(Math.min(currentBalance, params.amountToApplyUSD));
    if (toApply <= 0.005) throw new Error('Monto a aplicar inválido o saldo insuficiente');
    const newBalance = roundMoney(currentBalance - toApply);
    const newStatus: SupplierAdvance['status'] = newBalance <= 0.005 ? 'APPLIED' : 'PARTIAL';

    await updateDoc(advance.ref, {
      balanceUSD: newBalance,
      status: newStatus,
      updatedAt: new Date().toISOString(),
      ...(params.apEntryId ? { apEntryApplied: params.apEntryId } : {})
    });
    await addDoc(collection(db, 'supplier_advances', params.advanceId, 'applications'), {
      appliedUSD: toApply,
      remainingAfter: newBalance,
      referenceNote: params.referenceNote,
      apEntryId: params.apEntryId ?? 'MANUAL',
      appliedAt: new Date().toISOString(),
      actor: params.actor
    });

    if (params.apEntryId) {
      await this.adjustAPEntryBalance(params.apEntryId, -toApply);
    }

    await this.addAuditEntry(
      'FINANCE',
      'SUPPLIER_ADVANCE_MANUAL_APPLY',
      `Anticipo proveedor ${params.advanceId} aplicado manualmente: $${toApply.toFixed(2)} · ${params.referenceNote} | Actor: ${params.actor}`
    );
  }

  async getSupplierAdvanceHistory(advanceId: string): Promise<Array<{
    id: string; appliedUSD: number; remainingAfter: number;
    referenceNote?: string; apEntryId?: string; appliedAt: string; actor: string;
  }>> {
    try {
      const snap = await getDocs(
        query(collection(db, 'supplier_advances', advanceId, 'applications'), orderBy('appliedAt', 'desc'))
      );
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
    } catch { return []; }
  }

  // ─── SUPERVISIÓN DE OPERADORES ─────────────────────────────────────────────

  /**
   * Reporte consolidado de operadores por período
   * Incluye ventas, transacciones, promedios y horarios
   */
  getOperatorPerformanceReport(options?: { 
    startDate?: string; 
    endDate?: string;
    operatorIds?: string[];
  }): Array<{
    userId: string;
    userName: string;
    role: string;
    totalSalesUSD: number;
    totalSalesVES: number;
    transactionCount: number;
    averageTicketUSD: number;
    firstSaleTime: string | null;
    lastSaleTime: string | null;
    sessionsCount: number;
    creditSalesUSD: number;
    cashSalesUSD: number;
    transferSalesUSD: number;
    mobileSalesUSD: number;
    zelleSalesUSD: number;
  }> {
    const sessions = this.getCashBoxSessions();
    const sales = this.sales;
    
    // Filtrar por fecha si se especifica
    const startDate = options?.startDate;
    const endDate = options?.endDate;
    const operatorIds = options?.operatorIds;
    
    // Obtener operadores únicos de las sesiones
    const operatorMap = new Map<string, {
      userId: string;
      userName: string;
      role: string;
      sessions: CashBoxSession[];
    }>();
    
    for (const session of sessions) {
      if (!operatorMap.has(session.userId)) {
        const user = this.users.find(u => u.id === session.userId);
        operatorMap.set(session.userId, {
          userId: session.userId,
          userName: session.userName,
          role: user?.role ?? 'CAJERO',
          sessions: []
        });
      }
      operatorMap.get(session.userId)!.sessions.push(session);
    }
    
    // Filtrar por IDs si se especifica
    const operatorsToProcess = operatorIds 
      ? Array.from(operatorMap.values()).filter(op => operatorIds.includes(op.userId))
      : Array.from(operatorMap.values());
    
    return operatorsToProcess.map(operator => {
      // Filtrar sesiones por fecha
      const relevantSessions = operator.sessions.filter(s => {
        if (startDate && s.openDate < startDate) return false;
        if (endDate && s.openDate > endDate) return false;
        return true;
      });
      
      // Obtener ventas de este operador en el período
      const operatorSales = sales.filter(sale => {
        if (sale.userId !== operator.userId) return false;
        const saleDate = sale.timestamp.toISOString().split('T')[0];
        if (startDate && saleDate < startDate) return false;
        if (endDate && saleDate > endDate) return false;
        return true;
      });
      
      // Calcular métricas
      const totalSalesUSD = operatorSales.reduce((sum, s) => sum + s.totalUSD, 0);
      const totalSalesVES = operatorSales.reduce((sum, s) => sum + s.totalVES, 0);
      const transactionCount = operatorSales.length;
      const averageTicketUSD = transactionCount > 0 ? totalSalesUSD / transactionCount : 0;
      
      // Horarios
      const sortedSales = [...operatorSales].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      const firstSaleTime = sortedSales.length > 0 ? sortedSales[0].timestamp.toTimeString().slice(0, 5) : null;
      const lastSaleTime = sortedSales.length > 0 ? sortedSales[sortedSales.length - 1].timestamp.toTimeString().slice(0, 5) : null;
      
      // Por método de pago
      const creditSalesUSD = operatorSales.filter(s => s.paymentMethod === 'CREDIT' || s.paymentMethod === 'credit').reduce((sum, s) => sum + s.totalUSD, 0);
      const cashSalesUSD = operatorSales.filter(s => s.paymentMethod === 'CASH' || s.paymentMethod === 'EFECTIVO' || s.paymentMethod === 'cash_usd').reduce((sum, s) => sum + s.totalUSD, 0);
      const transferSalesUSD = operatorSales.filter(s => s.paymentMethod === 'TRANSFERENCIA' || s.paymentMethod === 'TRANSFER' || s.paymentMethod === 'transfer').reduce((sum, s) => sum + s.totalUSD, 0);
      const mobileSalesUSD = operatorSales.filter(s => s.paymentMethod === 'PAGO_MOVIL' || s.paymentMethod === 'mobile').reduce((sum, s) => sum + s.totalUSD, 0);
      const zelleSalesUSD = operatorSales.filter(s => s.paymentMethod === 'ZELLE' || s.paymentMethod === 'zelle').reduce((sum, s) => sum + s.totalUSD, 0);
      
      return {
        userId: operator.userId,
        userName: operator.userName,
        role: operator.role,
        totalSalesUSD,
        totalSalesVES,
        transactionCount,
        averageTicketUSD: Math.round(averageTicketUSD * 100) / 100,
        firstSaleTime,
        lastSaleTime,
        sessionsCount: relevantSessions.length,
        creditSalesUSD,
        cashSalesUSD,
        transferSalesUSD,
        mobileSalesUSD,
        zelleSalesUSD
      };
    }).sort((a, b) => b.totalSalesUSD - a.totalSalesUSD);
  }

  /**
   * Comparación lado-a-lado de operadores
   */
  compareOperators(operatorIds: string[]): Array<{
    userId: string;
    userName: string;
    totalSalesUSD: number;
    transactionCount: number;
    averageTicketUSD: number;
    sessionsCount: number;
    totalDifferencesUSD: number;
    differenceCount: number;
    ranking: number;
  }> {
    const report = this.getOperatorPerformanceReport({ operatorIds });
    const sessions = this.getCashBoxSessions();
    
    return report.map((op, index) => {
      // Calcular diferencias de caja
      const operatorSessions = sessions.filter(s => s.userId === op.userId && s.status === 'CLOSED');
      const totalDifferencesUSD = operatorSessions.reduce((sum, s) => sum + Math.abs(s.differenceUSD ?? 0), 0);
      const differenceCount = operatorSessions.filter(s => Math.abs(s.differenceUSD ?? 0) > 0.01).length;
      
      return {
        userId: op.userId,
        userName: op.userName,
        totalSalesUSD: op.totalSalesUSD,
        transactionCount: op.transactionCount,
        averageTicketUSD: op.averageTicketUSD,
        sessionsCount: op.sessionsCount,
        totalDifferencesUSD,
        differenceCount,
        ranking: index + 1
      };
    });
  }

  /**
   * Detectar operadores con diferencias recurrentes
   * Retorna alertas para operadores con problemas
   */
  getOperatorDifferenceAlerts(options?: {
    days?: number;
    minDifferenceCount?: number;
    minDifferenceAmount?: number;
  }): Array<{
    userId: string;
    userName: string;
    alertType: 'FREQUENT' | 'HIGH_AMOUNT' | 'PATTERN_ALWAYS_SHORT' | 'PATTERN_ALWAYS_OVER';
    severity: 'warning' | 'critical';
    message: string;
    details: {
      differenceCount: number;
      totalDifferenceUSD: number;
      averageDifferenceUSD: number;
      sessionsAnalyzed: number;
    };
    recommendation: string;
  }> {
    const days = options?.days ?? 7;
    const minCount = options?.minDifferenceCount ?? 3;
    const minAmount = options?.minDifferenceAmount ?? 10;
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    
    const sessions = this.getCashBoxSessions().filter(s => 
      s.status === 'CLOSED' && 
      (s.closeDate ?? s.openDate) >= cutoffStr
    );
    
    const alerts: ReturnType<typeof this.getOperatorDifferenceAlerts> = [];
    
    // Agrupar sesiones por operador
    const operatorSessions = new Map<string, CashBoxSession[]>();
    for (const session of sessions) {
      if (!operatorSessions.has(session.userId)) {
        operatorSessions.set(session.userId, []);
      }
      operatorSessions.get(session.userId)!.push(session);
    }
    
    for (const [userId, userSessions] of operatorSessions) {
      const user = this.users.find(u => u.id === userId);
      if (!user) continue;
      
      const differences = userSessions.map(s => ({
        amount: s.differenceUSD ?? 0,
        isShort: (s.differenceUSD ?? 0) < 0,
        isOver: (s.differenceUSD ?? 0) > 0
      }));
      
      const sessionsWithDifferences = differences.filter(d => Math.abs(d.amount) > 0.01);
      const differenceCount = sessionsWithDifferences.length;
      const totalDifferenceUSD = differences.reduce((sum, d) => sum + Math.abs(d.amount), 0);
      const averageDifferenceUSD = differenceCount > 0 ? totalDifferenceUSD / differenceCount : 0;
      
      // Alerta: Diferencias frecuentes (>3 veces en la semana)
      if (differenceCount >= minCount) {
        alerts.push({
          userId,
          userName: user.name,
          alertType: 'FREQUENT',
          severity: 'warning',
          message: `${user.name} ha presentado ${differenceCount} diferencias de caja en los últimos ${days} días`,
          details: {
            differenceCount,
            totalDifferenceUSD,
            averageDifferenceUSD,
            sessionsAnalyzed: userSessions.length
          },
          recommendation: `Revisar procedimientos de cierre de caja con ${user.name}. Considerar entrenamiento adicional.`
        });
      }
      
      // Alerta: Diferencias de alto monto (>1% o $10)
      const significantDifferences = sessionsWithDifferences.filter(d => {
        const onePercentThreshold = Math.abs(d.amount) > (userSessions[0]?.systemClosureUSD ?? 0) * 0.01;
        const absoluteThreshold = Math.abs(d.amount) > minAmount;
        return onePercentThreshold || absoluteThreshold;
      });
      
      if (significantDifferences.length > 0) {
        alerts.push({
          userId,
          userName: user.name,
          alertType: 'HIGH_AMOUNT',
          severity: 'critical',
          message: `${user.name} tiene ${significantDifferences.length} diferencias significativas (>1% o $${minAmount})`,
          details: {
            differenceCount: significantDifferences.length,
            totalDifferenceUSD: significantDifferences.reduce((sum, d) => sum + Math.abs(d.amount), 0),
            averageDifferenceUSD: significantDifferences.reduce((sum, d) => sum + Math.abs(d.amount), 0) / significantDifferences.length,
            sessionsAnalyzed: userSessions.length
          },
          recommendation: `Investigar inmediatamente. Posible error de procedimiento o irregularidad.`
        });
      }
      
      // Alerta: Patrón siempre faltante
      const alwaysShort = sessionsWithDifferences.length >= 2 && sessionsWithDifferences.every(d => d.isShort);
      if (alwaysShort && sessionsWithDifferences.length >= 2) {
        alerts.push({
          userId,
          userName: user.name,
          alertType: 'PATTERN_ALWAYS_SHORT',
          severity: 'critical',
          message: `${user.name} SIEMPRE presenta faltantes de caja (${sessionsWithDifferences.length} sesiones consecutivas)`,
          details: {
            differenceCount: sessionsWithDifferences.length,
            totalDifferenceUSD: sessionsWithDifferences.filter(d => d.isShort).reduce((sum, d) => sum + Math.abs(d.amount), 0),
            averageDifferenceUSD: sessionsWithDifferences.filter(d => d.isShort).reduce((sum, d) => sum + Math.abs(d.amount), 0) / sessionsWithDifferences.length,
            sessionsAnalyzed: userSessions.length
          },
          recommendation: `ACCION URGENTE: El patrón consistente de faltantes sugiere problema grave. Revisar procedimientos y considerar acciones disciplinarias.`
        });
      }
      
      // Alerta: Patrón siempre sobrante
      const alwaysOver = sessionsWithDifferences.length >= 2 && sessionsWithDifferences.every(d => d.isOver);
      if (alwaysOver && sessionsWithDifferences.length >= 2) {
        alerts.push({
          userId,
          userName: user.name,
          alertType: 'PATTERN_ALWAYS_OVER',
          severity: 'warning',
          message: `${user.name} SIEMPRE presenta sobrantes de caja (${sessionsWithDifferences.length} sesiones consecutivas)`,
          details: {
            differenceCount: sessionsWithDifferences.length,
            totalDifferenceUSD: sessionsWithDifferences.filter(d => d.isOver).reduce((sum, d) => sum + d.amount, 0),
            averageDifferenceUSD: sessionsWithDifferences.filter(d => d.isOver).reduce((sum, d) => sum + d.amount, 0) / sessionsWithDifferences.length,
            sessionsAnalyzed: userSessions.length
          },
          recommendation: `Revisar si el operador está siguiendo correctamente el procedimiento de declaración de fondos.`
        });
      }
    }
    
    // Ordenar por severidad (critical primero)
    return alerts.sort((a, b) => {
      if (a.severity === 'critical' && b.severity === 'warning') return -1;
      if (a.severity === 'warning' && b.severity === 'critical') return 1;
      return b.details.totalDifferenceUSD - a.details.totalDifferenceUSD;
    });
  }

  /**
   * Bloquear caja de operador hasta revisión
   */
  async blockOperatorCashBox(userId: string, reason: string): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('Usuario no encontrado');
    
    // Cerrar sesión de caja abierta si existe
    const openSession = this.cashBoxSessions.find(s => s.userId === userId && s.status === 'OPEN');
    if (openSession) {
      await this.closeCashBoxSession({
        finalAmountUSD: 0,
        finalAmountVES: 0,
        declaredBreakdown: [],
        note: `Caja bloqueada por supervisor: ${reason}`,
        rateBCV: 0,
        rateParallel: 0,
        rateInternal: 0
      });
    }
    
    // Agregar nota al usuario
    await updateDoc(doc(db, 'users', userId), {
      cashBoxBlocked: true,
      cashBoxBlockedReason: reason,
      cashBoxBlockedAt: new Date().toISOString(),
      cashBoxBlockedBy: this.currentUser?.id ?? 'SYSTEM'
    } as any);
    
    this.addAuditEntry('SECURITY', 'CASHBOX_BLOCKED', 
      `Caja de ${user.name} bloqueada. Motivo: ${reason}`);
  }

  /**
   * Desbloquear caja de operador
   */
  async unblockOperatorCashBox(userId: string): Promise<void> {
    const user = this.users.find(u => u.id === userId);
    if (!user) throw new Error('Usuario no encontrado');
    
    await updateDoc(doc(db, 'users', userId), {
      cashBoxBlocked: false,
      cashBoxBlockedReason: null,
      cashBoxUnblockedAt: new Date().toISOString(),
      cashBoxUnblockedBy: this.currentUser?.id ?? 'SYSTEM'
    } as any);
    
    this.addAuditEntry('SECURITY', 'CASHBOX_UNBLOCKED', 
      `Caja de ${user.name} desbloqueada`);
  }

}

export const dataService = new DataService();
