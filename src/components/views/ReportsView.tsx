import React from 'react';
import {
  BarChart,
  TrendingUp,
  Download,
  Calendar,
  Activity,
  DollarSign,
  Layers,
  ShoppingBag,
  ShieldCheck,
  Receipt,
  Package,
  Wallet,
  Calculator,
  AlertTriangle,
  Scale,
  Coins,
  CreditCard,
  Landmark,
  Lock,
  ChevronLeft,
  ChevronRight,
  Truck,
  FileText,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Users,
  User,
  ChevronUp,
  ChevronDown,
  CircleDollarSign
} from 'lucide-react';
import { reportService } from '../../services/reportService';
import { dataService, type ClientAdvance, type SupplierAdvance, type PurchaseInvoiceHistoryEntry } from '../../services/dataService';
import { computeBankWideNetBalance, isBankTransactionCountedForBalance } from '../../services/bankBalanceUtils';
import { formatQuantity, formatUnitCost } from '../../utils/costCalculations';
import { compareCorrelativo, compareSalesForReport, normalizeReportCashier } from '../../utils/reportSort';
import { buildExcelFriendlyCsv } from '../../utils/csvExport';
import { isCreditSaleByBusinessRule } from '../../utils/salesClassification';
import { printService } from '../../services/printService';

type ReportTab = 'overview' | 'sales' | 'profit' | 'margins' | 'inventory' | 'treasury' | 'zclosure' | 'purchases' | 'expenses' | 'shrinkage' | 'cashier' | 'advances';
type CashierViewMode = 'GENERAL' | 'METHODS' | 'DETAIL';
type CashierDetailRateMode = 'LINE' | 'BCV' | 'INTERNAL';
type OverviewMovementType = 'ALL' | 'VENTA' | 'COMPRA' | 'DEVOLUCION' | 'EGRESO' | 'ANTICIPO' | 'COBRO_AR' | 'PAGO_AP' | 'MERMA';
type OverviewFlow = 'ALL' | 'INCOME' | 'EXPENSE';
type SalesFilters = {
  client: string;
  method: string;
  cashier: string;
  status: string;
  minUSD: string;
  maxUSD: string;
  sortBy: string;
};
type SalesFilterPreset = {
  id: string;
  name: string;
  dateRange: { start: string; end: string };
  filters: SalesFilters;
  createdAt: string;
};
const INITIAL_SALES_FILTERS: SalesFilters = {
  client: '',
  method: 'ALL',
  cashier: 'ALL',
  status: 'ALL',
  minUSD: '',
  maxUSD: '',
  sortBy: 'DATE_DESC'
};
const SALES_FILTER_PRESETS_KEY = 'reports_sales_filter_presets_v1';
const REPORTS_VALUATION_RATE_KEY = 'reports_valuation_ves_rate_v1';

const formatInvoiceProductDetails = (lines: any[]): string => {
  const list = Array.isArray(lines) ? lines : [];
  if (list.length === 0) return 'Sin detalle de productos';
  return list.map((line: any, index: number) => {
    const qty = Number(line?.qty ?? 0) || 0;
    const unit = String(line?.unit ?? '').trim();
    const name = String(line?.productDescription ?? line?.description ?? line?.sku ?? line?.code ?? `Producto ${index + 1}`).trim();
    return `${index + 1}) ${name} - ${qty.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${unit ? ` ${unit}` : ''}`;
  }).join(' | ');
};

/** Misma regla que Finanzas > Bancos para saber qué monedas consultar por banco. */
function getBankCurrencyProfileForTreasury(b: any): 'USD_ONLY' | 'VES_ONLY' | 'MIXED' | 'UNKNOWN' {
  const accs = Array.isArray(b?.accounts) ? b.accounts : [];
  if (accs.length === 0) return 'UNKNOWN';
  const hasU = accs.some((a: any) => String(a?.currency ?? '').toUpperCase() === 'USD');
  const hasV = accs.some((a: any) => String(a?.currency ?? '').toUpperCase() === 'VES');
  if (hasU && hasV) return 'MIXED';
  if (hasU) return 'USD_ONLY';
  return 'VES_ONLY';
}

export function ReportsView() {
  const fmt = React.useCallback((value: any, decimals: number = 2) =>
    (Number(value ?? 0) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }), []);
  const usd = React.useCallback((value: any, decimals: number = 2) => `$ ${fmt(value, decimals)}`, [fmt]);
  const bs = React.useCallback((value: any, decimals: number = 2) => `Bs ${fmt(value, decimals)}`, [fmt]);
  /** Misma regla que totales en PDF: sumar importe redondeado a 2 decimales por fila. */
  const roundMoney = React.useCallback(
    (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100,
    []
  );

  const [tick, setTick] = React.useState(0);
  React.useEffect(() => {
    return dataService.subscribe(() => setTick(t => t + 1));
  }, []);

  const [activeTab, setActiveTab] = React.useState<ReportTab>('overview');
  const [filters, setFilters] = React.useState<SalesFilters>(INITIAL_SALES_FILTERS);
  const [overviewMovementType, setOverviewMovementType] = React.useState<OverviewMovementType>('ALL');
  const [overviewFlow, setOverviewFlow] = React.useState<OverviewFlow>('ALL');
  const [overviewQuery, setOverviewQuery] = React.useState('');
  const [dateRange, setDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [profitDateRange, setProfitDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [profitProductQuery, setProfitProductQuery] = React.useState<string>('ALL');
  const [marginFilterMode, setMarginFilterMode] = React.useState<'PRODUCT' | 'BATCH'>('PRODUCT');
  const [marginFilterQuery, setMarginFilterQuery] = React.useState('');
  const [marginDateRange, setMarginDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [invView, setInvView] = React.useState<'stock' | 'valorizacion' | 'lotes' | 'kardex'>('stock');
  const [invSearch, setInvSearch] = React.useState('');
  const [invWarehouse, setInvWarehouse] = React.useState<'ALL' | 'Galpon D3' | 'Pesa D2' | 'exibicion D1'>('ALL');
  const [zDate, setZDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [zSelectedCashierIds, setZSelectedCashierIds] = React.useState<string[]>([]);
  const [zMethodFilter, setZMethodFilter] = React.useState<string>('ALL');
  const [salesPage, setSalesPage] = React.useState(0);
  const [salesBookKind, setSalesBookKind] = React.useState<'ALL' | 'CASH' | 'CREDIT'>('ALL');
  const [salesBookPage, setSalesBookPage] = React.useState(0);
  const SALES_PER_PAGE = 25;
  const [purchaseSearch, setPurchaseSearch] = React.useState('');
  const [purchaseDateRange, setPurchaseDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [purchaseInvoiceHistory, setPurchaseInvoiceHistory] = React.useState<PurchaseInvoiceHistoryEntry[]>([]);
  const [expenseCategory, setExpenseCategory] = React.useState<'ALL' | 'FIXED' | 'VARIABLE'>('ALL');
  const [expenseDateRange, setExpenseDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [advanceDateRange, setAdvanceDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 90)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [advanceSearch, setAdvanceSearch] = React.useState('');
  const [advancesReportKind, setAdvancesReportKind] = React.useState<'client' | 'supplier'>('client');
  const [advancesIncludeApplied, setAdvancesIncludeApplied] = React.useState(false);
  const [supplierAdvancesForReport, setSupplierAdvancesForReport] = React.useState<SupplierAdvance[]>([]);
  const [loadingAdvancesReport, setLoadingAdvancesReport] = React.useState(false);
  const [advancesRefreshKey, setAdvancesRefreshKey] = React.useState(0);
  /** Valoración inventario en reportes: costo vs lista, USD vs Bs (tasa manual si Bs). */
  const [valuationPricing, setValuationPricing] = React.useState<'cost' | 'sale'>('cost');
  const [valuationCurrency, setValuationCurrency] = React.useState<'USD' | 'VES'>('USD');
  const [valuationVesRateInput, setValuationVesRateInput] = React.useState(() => {
    try {
      const raw = localStorage.getItem('bcvRateData');
      if (raw) {
        const parsed = JSON.parse(raw) as { rate?: number };
        if (typeof parsed.rate === 'number' && parsed.rate > 0) return String(parsed.rate);
      }
      const saved = localStorage.getItem(REPORTS_VALUATION_RATE_KEY);
      if (saved && Number(saved) > 0) return saved;
    } catch {}
    return '36.50';
  });
  const valuationVesRate = React.useMemo(() => {
    const n = Number(String(valuationVesRateInput).replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : 36.5;
  }, [valuationVesRateInput]);

  const invFilteredStocks = React.useMemo(() => {
    const stocks = dataService.getStocks();
    const q = invSearch.toLowerCase().trim();
    return stocks.filter((s: any) => {
      const matchSearch = !q || s.code?.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q);
      const matchWh = invWarehouse === 'ALL' || (s.lotes || []).some((l: any) => l.warehouse === invWarehouse);
      return matchSearch && matchWh;
    });
  }, [tick, invSearch, invWarehouse]);

  /** Todos los productos (export CSV): solo filtro por búsqueda (incluye con y sin existencia en todos los almacenes). */
  const invCatalogStocks = React.useMemo(() => {
    const stocks = dataService.getStocks();
    const q = invSearch.toLowerCase().trim();
    if (!q) return stocks;
    return stocks.filter(
      (s: any) =>
        s.code?.toLowerCase().includes(q) ||
        String(s.description ?? '')
          .toLowerCase()
          .includes(q)
    );
  }, [tick, invSearch]);

  const invLotRows = React.useMemo(() => {
    const out: Array<{ s: any; l: any }> = [];
    for (const s of invFilteredStocks) {
      for (const l of s.lotes || []) {
        if (invWarehouse !== 'ALL' && l.warehouse !== invWarehouse) continue;
        out.push({ s, l });
      }
    }
    return out;
  }, [invFilteredStocks, invWarehouse]);

  const invExportFilterLabel = React.useMemo(
    () =>
      `Búsqueda: ${invSearch.trim() || '—'} | Almacén: ${invWarehouse === 'ALL' ? 'Todos' : invWarehouse}`,
    [invSearch, invWarehouse]
  );

  React.useEffect(() => {
    if (activeTab !== 'purchases') return;
    let active = true;
    dataService.getPurchaseInvoiceHistory()
      .then((rows) => {
        if (active) setPurchaseInvoiceHistory(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setPurchaseInvoiceHistory([]);
      });
    return () => { active = false; };
  }, [activeTab, tick]);

  React.useEffect(() => {
    try {
      localStorage.setItem(REPORTS_VALUATION_RATE_KEY, String(valuationVesRate));
    } catch {}
  }, [valuationVesRate]);

  const [allBankTx, setAllBankTx] = React.useState<any[]>([]);
  /** Saldos netos por banco (misma API que Finanzas > Bancos); null = aún no cargado en pestaña Tesorería. */
  const [treasuryOfficialBalances, setTreasuryOfficialBalances] = React.useState<Record<string, { usd: number; ves: number }> | null>(null);
  const [treasuryOfficialBalancesLoading, setTreasuryOfficialBalancesLoading] = React.useState(false);
  const [treasurySelectedBankId, setTreasurySelectedBankId] = React.useState<string>('ALL');
  const [treasurySelectedAccountKey, setTreasurySelectedAccountKey] = React.useState<string>('ALL');
  const [treasuryFlowFilter, setTreasuryFlowFilter] = React.useState<'ALL' | 'GENERAL' | 'SALES' | 'PURCHASES'>('GENERAL');
  const [treasuryCurrencyFilter, setTreasuryCurrencyFilter] = React.useState<'ALL' | 'USD' | 'VES'>('ALL');
  const [treasuryMethodFilter, setTreasuryMethodFilter] = React.useState<string>('ALL');
  const [treasuryDateRange, setTreasuryDateRange] = React.useState({
    start: new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [cashDeclaration, setCashDeclaration] = React.useState({ usd: '', ves: '' });
  const [presetName, setPresetName] = React.useState('');
  const [salesFilterPresets, setSalesFilterPresets] = React.useState<SalesFilterPreset[]>([]);

  // REPORT-01: Cashier billing report state
  const [cashierReportDate, setCashierReportDate] = React.useState(new Date().toISOString().split('T')[0]);
  const [selectedCashierId, setSelectedCashierId] = React.useState<string>('ALL');
  const [showCashierDetail, setShowCashierDetail] = React.useState<string | null>(null);
  const [cashierViewMode, setCashierViewMode] = React.useState<CashierViewMode>('GENERAL');
  const [cashierMethodFilter, setCashierMethodFilter] = React.useState<string>('ALL');
  const [cashierDetailRateMode, setCashierDetailRateMode] = React.useState<CashierDetailRateMode>('LINE');
  const [showCashierIdentityAudit, setShowCashierIdentityAudit] = React.useState(false);
  const currentUser = dataService.getCurrentUser();
  const hasPermission = React.useCallback((key: string) => dataService.hasPermission(key as any, currentUser), [currentUser]);
  const canViewSalesReports = hasPermission('REPORTS_SALES') || hasPermission('ALL');
  const canViewProfitReport = hasPermission('REPORTS_PROFIT_VIEW') || hasPermission('ALL');
  const canViewInventoryReports = hasPermission('REPORTS_INVENTORY') || hasPermission('ALL');
  const canViewFinancialReports = hasPermission('FINANCE_VIEW') || hasPermission('ALL');
  const canExportTreasuryReports = hasPermission('REPORTS_TREASURY_EXPORT') || hasPermission('ALL');
  const canExportExpensesReports = hasPermission('REPORTS_EXPENSES_EXPORT') || hasPermission('ALL');
  const canExportMarginsReports = hasPermission('REPORTS_MARGINS_EXPORT') || hasPermission('ALL');
  const canExportPurchasesReports = hasPermission('REPORTS_PURCHASES_EXPORT') || hasPermission('ALL');
  const canExportShrinkageReports = hasPermission('REPORTS_SHRINKAGE_EXPORT') || hasPermission('ALL');
  const canExportZClosureReports = hasPermission('REPORTS_ZCLOSURE_EXPORT') || hasPermission('ALL');
  const canExportCashierReports = hasPermission('REPORTS_CASHIER_EXPORT') || hasPermission('ALL');
  const canExportProfitReports = hasPermission('REPORTS_PROFIT_EXPORT') || hasPermission('ALL');
  const canSeeOverviewFinanceBlocks = canViewFinancialReports;
  const canSeeOverviewInventoryBlocks = canViewInventoryReports;
  const reportTabAccess = React.useMemo<Record<ReportTab, boolean>>(() => ({
    overview: canViewSalesReports,
    sales: canViewSalesReports,
    profit: canViewProfitReport,
    zclosure: canViewSalesReports,
    cashier: canViewSalesReports,
    margins: canViewInventoryReports,
    inventory: canViewInventoryReports,
    shrinkage: canViewInventoryReports,
    treasury: canViewFinancialReports,
    purchases: canViewFinancialReports,
    expenses: canViewFinancialReports,
    advances: canViewFinancialReports
  }), [canViewFinancialReports, canViewInventoryReports, canViewProfitReport, canViewSalesReports]);
  const canSeeCashierIdentityAudit = Boolean(
    currentUser
    && (
      currentUser.role === 'ADMIN'
      || dataService.hasPermission('ALL', currentUser)
      || dataService.hasPermission('SECURITY_VIEW', currentUser)
    )
  );

  const dailyStats = reportService.getDailySales();
  const inventoryStats = React.useMemo(
    () => reportService.getInventoryOverview(valuationPricing),
    [tick, valuationPricing]
  );
  const totalValUSD = React.useMemo(
    () => reportService.getTotalValorization(valuationPricing),
    [tick, valuationPricing]
  );
  const valuationDisplayAmount = React.useMemo(() => {
    const base = Number(totalValUSD) || 0;
    return valuationCurrency === 'VES' ? roundMoney(base * valuationVesRate) : roundMoney(base);
  }, [totalValUSD, valuationCurrency, valuationVesRate]);

  const formatValuationKpi = React.useCallback(
    (amount: number) =>
      valuationCurrency === 'VES' ? bs(amount, 2) : usd(amount, 2),
    [valuationCurrency, bs, usd]
  );

  const todayLiq = reportService.getTodayLiquidation();
  const companyLoans = dataService.getCompanyLoans();
  const companyLoansSummary = React.useMemo(() => {
    const today = new Date();
    const open = companyLoans.filter((l: any) => l.status !== 'PAID' && l.status !== 'VOID');
    const overdue = open.filter((l: any) => {
      const due = new Date(l?.dueDate ?? Date.now());
      return !Number.isNaN(due.getTime()) && due < today;
    });
    const openBalance = open.reduce((sum: number, l: any) => sum + (Number(l?.balanceUSD ?? 0) || 0), 0);
    return {
      total: companyLoans.length,
      openCount: open.length,
      overdueCount: overdue.length,
      openBalance
    };
  }, [companyLoans]);
  const profitProductOptions = React.useMemo(() => {
    const options = dataService.getStocks().map((p: any) => ({
      code: String(p.code ?? ''),
      description: String(p.description ?? '')
    }));
    return options.sort((a, b) => a.code.localeCompare(b.code));
  }, [tick]);

  const profitFilterPayload = React.useMemo(() => {
    const startRaw = new Date(`${profitDateRange.start}T00:00:00`);
    const endRaw = new Date(`${profitDateRange.end}T23:59:59`);
    const now = new Date();
    const start = Number.isNaN(startRaw.getTime()) ? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0) : startRaw;
    const end = Number.isNaN(endRaw.getTime()) ? new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) : endRaw;
    return {
      start,
      end,
      productQuery: profitProductQuery === 'ALL' ? undefined : profitProductQuery,
      label: profitProductQuery === 'ALL'
        ? 'Periodo filtrado'
        : `Periodo filtrado · SKU ${profitProductQuery}`
    };
  }, [profitDateRange.start, profitDateRange.end, profitProductQuery]);

  const profitSummary = React.useMemo(
    () => reportService.getProfitSummaryByFilter(profitFilterPayload),
    [tick, profitFilterPayload]
  );
  const profitSkuTotals = React.useMemo(() => {
    return profitSummary.bySku.reduce((acc, row) => {
      acc.qtySold += Number(row.qtySold ?? 0) || 0;
      acc.revenueUSD += Number(row.revenueUSD ?? 0) || 0;
      acc.costUSD += Number(row.costUSD ?? 0) || 0;
      acc.profitUSD += Number(row.profitUSD ?? 0) || 0;
      return acc;
    }, { qtySold: 0, revenueUSD: 0, costUSD: 0, profitUSD: 0 });
  }, [profitSummary.bySku]);
  const profitTopSalesTotals = React.useMemo(() => {
    return profitSummary.topSales.reduce((acc, row) => {
      acc.revenueUSD += Number(row.revenueUSD ?? 0) || 0;
      acc.costUSD += Number(row.costUSD ?? 0) || 0;
      acc.profitUSD += Number(row.profitUSD ?? 0) || 0;
      return acc;
    }, { revenueUSD: 0, costUSD: 0, profitUSD: 0 });
  }, [profitSummary.topSales]);

  const normalizePaymentToken = React.useCallback((raw: any): string => {
    return String(raw ?? '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }, []);

  const paymentMethodLabel = React.useCallback((methodRaw: any, bankRaw?: any, noteRaw?: any): string => {
    const methodBase = normalizePaymentToken(methodRaw);
    const method = methodBase.replace(/\s+/g, '_');
    const bank = normalizePaymentToken(bankRaw);
    const note = normalizePaymentToken(noteRaw);
    if (method === 'others' || method === 'other' || method === 'otro') {
      const bankLabelRaw = String(bankRaw ?? '').trim();
      const bankUpper = bankLabelRaw.toUpperCase();
      const noteUpper = String(noteRaw ?? '').trim().toUpperCase();
      const hasCxP = bankUpper === 'CXP' || noteUpper.includes('CXP') || note.includes('cxp');
      const hasCxC = bankUpper === 'CXC' || noteUpper.includes('CXC') || note.includes('cxc');
      const hasDxV = bankUpper === 'DXV' || noteUpper.includes('DXV') || note.includes('dxv');
      const hasDxC = bankUpper === 'DXC' || noteUpper.includes('DXC') || note.includes('dxc');
      if (hasCxP) return 'Otros · CxP';
      if (hasCxC) return 'Otros · CxC';
      if (hasDxV) return 'Otros · DxV';
      if (hasDxC) return 'Otros · DxC';
      if (bank.includes('ant. cliente') || bank.includes('anticipo cliente')) return 'Otros · Ant. Cliente';
      if (bank.includes('ant. proveedores') || bank.includes('anticipo proveedores')) return 'Otros · Ant. Proveedores';
      if (note.includes('ant. cliente') || note.includes('anticipo cliente')) return 'Otros · Ant. Cliente';
      if (note.includes('ant. proveedores') || note.includes('anticipo proveedores')) return 'Otros · Ant. Proveedores';
      if (bankLabelRaw) return `Otros · ${bankLabelRaw}`;
      return 'Otros';
    }
    const map: Record<string, string> = {
      cash_usd: 'Efectivo USD',
      cash_ves: 'Efectivo Bs',
      usd: 'Efectivo USD',
      ves: 'Efectivo Bs',
      zelle: 'Zelle',
      binance: 'Binance',
      mobile: 'Pago Móvil',
      transfer: 'Transferencia',
      debit: 'Débito',
      credit: 'Crédito',
      biopago: 'Biopago',
      others: 'Otros',
      other: 'Otro'
    };
    if (map[method]) return map[method];
    if (method.includes('pago_movil') || method === 'pmovil' || method === 'movil') return 'Pago Móvil';
    if (method.includes('transfer') || method === 'transf' || method === 'trf') return 'Transferencia';
    if (method.includes('debit')) return 'Débito';
    if (method.includes('biopago') || method.includes('bio pago')) return 'Biopago';
    if (method.includes('zelle')) return 'Zelle';
    if (method.includes('cash_usd') || method.includes('efectivo_usd')) return 'Efectivo USD';
    if (method.includes('cash_ves') || method.includes('efectivo_bs') || method.includes('efectivo_ves')) return 'Efectivo Bs';
    if (method === 'mixto' || method === 'mixed') return 'Sin desglose';
    if (method === 'credito') return 'Crédito';
    if (bank.includes('efectivo usd')) return 'Efectivo USD';
    if (bank.includes('efectivo bs') || bank.includes('efectivo ves')) return 'Efectivo Bs';
    if (bank.includes('biopago')) return 'Biopago';
    if (bank.includes('pago movil')) return 'Pago Móvil';
    if (bank.includes('transfer')) return 'Transferencia';
    if (bank.includes('debit')) return 'Débito';
    return String(methodRaw || bankRaw || 'Otro');
  }, [normalizePaymentToken]);

  const overviewMethodLabel = React.useCallback((methodRaw: any, bankRaw?: any): string => {
    const base = paymentMethodLabel(methodRaw, bankRaw);
    if (base === 'Efectivo USD') return 'Efectivo $';
    if (base === 'Pago Móvil') return 'Pago Movil';
    return base;
  }, [paymentMethodLabel]);

  type BankSalePaymentAggLine = { method: string; amountUSD: number; amountVES: number; count: number; rateUsed: number; reference: string };

  const bankTxSalePaymentIndexes = React.useMemo(() => {
    const byCorrelativo: Record<string, BankSalePaymentAggLine[]> = {};
    const bySaleId: Record<string, BankSalePaymentAggLine[]> = {};
    const push = (bucket: Record<string, BankSalePaymentAggLine[]>, key: string, line: BankSalePaymentAggLine) => {
      if (!bucket[key]) bucket[key] = [];
      bucket[key].push(line);
    };
    allBankTx.forEach((tx: any) => {
      const source = String(tx?.source ?? '').toUpperCase();
      if (source !== 'SALE_PAYMENT' && source !== 'CREDIT_DOWN') return;
      const method = paymentMethodLabel(tx?.method, tx?.bankName ?? tx?.bank, tx?.note);
      const amountUSD = Math.abs(Number(tx?.amountUSD ?? 0) || 0);
      const amountVES = Math.abs(Number(tx?.amountVES ?? 0) || 0);
      const rateUsed = Number(tx?.rateUsed ?? 0) || 0;
      const reference = String(tx?.reference ?? '').trim();
      if (amountUSD <= 0.0001 && amountVES <= 0.0001) return;
      const line: BankSalePaymentAggLine = { method, amountUSD, amountVES, count: 1, rateUsed, reference };
      const correlativo = String(tx?.saleCorrelativo ?? '').trim();
      if (correlativo) push(byCorrelativo, correlativo, line);
      const sourceId = String(tx?.sourceId ?? '').trim();
      const colon = sourceId.indexOf(':');
      if (colon > 0) {
        const saleIdFromTx = sourceId.slice(0, colon).trim();
        if (saleIdFromTx) push(bySaleId, saleIdFromTx, line);
      }
    });
    return { byCorrelativo, bySaleId };
  }, [allBankTx, paymentMethodLabel]);

  const cxpSaleCorrelativoHints = React.useMemo(() => {
    const hints = new Set<string>();
    dataService.getExpenses().forEach((expense: any) => {
      const text = String(expense?.description ?? '').toUpperCase();
      if (!text.includes('CXP ACTUALIZADO')) return;
      const viaMatch = text.match(/V[IÍ]A\s+([A-Z]-\d+)/);
      if (viaMatch?.[1]) {
        hints.add(String(viaMatch[1]).trim().toUpperCase());
      }
    });
    return hints;
  }, [tick]);

  const extractSalePaymentLines = React.useCallback((sale: any) => {
    const lines: Array<{ method: string; amountUSD: number; amountVES: number; count: number; rateUsed: number; reference: string }> = [];
    const appendMissingCreditLine = () => {
      if (!isCreditSaleByBusinessRule(sale)) return;
      const hasCreditLine = lines.some((line) => String(line.method ?? '').trim().toLowerCase() === 'crédito' || String(line.method ?? '').trim().toLowerCase() === 'credito');
      if (hasCreditLine) return;
      const explicitCredit = Number((sale as any)?.creditOutstandingUSD ?? 0) || 0;
      const nonCreditUSD = lines.reduce((sum, line) => sum + (Number(line.amountUSD ?? 0) || 0), 0);
      const fallbackCredit = Math.max(0, (Number(sale?.totalUSD ?? 0) || 0) - nonCreditUSD);
      const amountUSD = explicitCredit > 0.0001 ? explicitCredit : fallbackCredit;
      if (amountUSD <= 0.0001) return;
      lines.push({
        method: 'Crédito',
        amountUSD,
        amountVES: 0,
        count: 1,
        rateUsed: Number(sale?.exchangeRate ?? 0) || 0,
        reference: ''
      });
    };
    const payments = Array.isArray(sale?.payments) ? sale.payments : [];
    if (payments.length > 0) {
      payments.forEach((p: any) => {
        const method = paymentMethodLabel(p?.method, p?.bank, p?.note);
        const amountUSD = Math.abs(Number(p?.amountUSD ?? 0) || 0);
        const amountVES = Math.abs(Number(p?.amountVES ?? 0) || 0);
        const rateUsed = Number(p?.rateUsed ?? 0) || 0;
        const reference = String(p?.reference ?? '').trim();
        if (amountUSD <= 0.0001 && amountVES <= 0.0001) return;
        lines.push({ method, amountUSD, amountVES, count: 1, rateUsed, reference });
      });
      appendMissingCreditLine();
      if (lines.length > 0) return lines;
    }
    const correlativo = String(sale?.correlativo ?? '').trim();
    const fromCorrelativo = correlativo && Array.isArray(bankTxSalePaymentIndexes.byCorrelativo[correlativo])
      ? bankTxSalePaymentIndexes.byCorrelativo[correlativo]
      : [];
    if (fromCorrelativo.length > 0) {
      lines.push(...fromCorrelativo);
      appendMissingCreditLine();
      return lines;
    }
    const saleId = String(sale?.id ?? '').trim();
    const fromSaleId = saleId && Array.isArray(bankTxSalePaymentIndexes.bySaleId[saleId])
      ? bankTxSalePaymentIndexes.bySaleId[saleId]
      : [];
    if (fromSaleId.length > 0) {
      lines.push(...fromSaleId);
      appendMissingCreditLine();
      return lines;
    }
    // Fallback para ventas antiguas sin detalle de payments.
    // Si el método histórico es MIXTO pero no hay líneas, no inventar
    // clasificación: marcar como "Sin desglose".
    const saleMethodRaw = String(sale?.paymentMethod ?? '').trim();
    const saleMethodNormalized = normalizePaymentToken(saleMethodRaw);
    const fallbackMethod = (saleMethodNormalized === 'mixto' || saleMethodNormalized === 'mixed')
      ? 'Sin desglose'
      : paymentMethodLabel(saleMethodRaw);
    const correlativoUpper = String(sale?.correlativo ?? '').trim().toUpperCase();
    const looksLikeCxpCross = (
      cxpSaleCorrelativoHints.has(correlativoUpper)
      || (saleMethodNormalized === 'others' && normalizePaymentToken((sale as any)?.notes ?? '').includes('cxp'))
      || normalizePaymentToken((sale as any)?.notes ?? '').includes('reconciliacion cxp')
    );
    if (looksLikeCxpCross) {
      lines.push({
        method: 'Otros · CxP',
        amountUSD: Math.abs(Number(sale?.totalUSD ?? 0) || 0),
        amountVES: Math.abs(Number(sale?.totalVES ?? 0) || 0),
        count: 1,
        rateUsed: Number(sale?.exchangeRate ?? 0) || 0,
        reference: ''
      });
      return lines;
    }
    if (isCreditSaleByBusinessRule(sale)) {
      lines.push({
        method: 'Crédito',
        amountUSD: Math.abs(Number((sale as any)?.creditOutstandingUSD ?? sale?.totalUSD ?? 0) || 0),
        amountVES: 0,
        count: 1,
        rateUsed: Number(sale?.exchangeRate ?? 0) || 0,
        reference: ''
      });
    } else {
      lines.push({
        method: fallbackMethod,
        amountUSD: Math.abs(Number(sale?.totalUSD ?? 0) || 0),
        amountVES: Math.abs(Number(sale?.totalVES ?? 0) || 0),
        count: 1,
        rateUsed: Number(sale?.exchangeRate ?? 0) || 0,
        reference: ''
      });
    }
    return lines;
  }, [paymentMethodLabel, bankTxSalePaymentIndexes, cxpSaleCorrelativoHints, normalizePaymentToken]);

  const salesMethodOptions = React.useMemo(() => {
    const methods = new Set<string>();
    dataService.getSales().forEach((sale) => methods.add(String(sale.paymentMethod || 'OTRO').toUpperCase()));
    return Array.from(methods).sort((a, b) => a.localeCompare(b));
  }, [tick]);

  const salesCashierOptions = React.useMemo(() => {
    const cashiers = new Set<string>();
    dataService.getSales().forEach((sale: any) => cashiers.add(normalizeReportCashier(sale.operatorName)));
    return Array.from(cashiers).sort((a, b) => a.localeCompare(b));
  }, [tick]);

  const classifyCreditSale = React.useCallback((sale: any) => isCreditSaleByBusinessRule(sale), []);

  const filteredSales = React.useMemo(() => {
    const q = String(filters.client ?? '').trim().toLowerCase();
    const minUSD = Number.parseFloat(String(filters.minUSD ?? '').replace(',', '.'));
    const maxUSD = Number.parseFloat(String(filters.maxUSD ?? '').replace(',', '.'));

    const result = dataService.getSales().filter((sale: any) => {
      const saleDate = sale.timestamp.toISOString().split('T')[0];
      const dateMatch = saleDate >= dateRange.start && saleDate <= dateRange.end;
      if (!dateMatch) return false;

      const haystack = [
        sale.client?.name,
        sale.client?.id,
        sale.correlativo,
        sale.operatorName,
        sale.paymentMethod
      ].map((v) => String(v ?? '').toLowerCase()).join(' ');
      const queryMatch = q.length === 0 || haystack.includes(q);
      if (!queryMatch) return false;

      const method = String(sale.paymentMethod ?? '').toUpperCase();
      const methodMatch = filters.method === 'ALL' || method === String(filters.method).toUpperCase();
      if (!methodMatch) return false;

      const cashier = normalizeReportCashier(sale.operatorName);
      const cashierMatch = filters.cashier === 'ALL' || cashier === String(filters.cashier).toUpperCase();
      if (!cashierMatch) return false;

      const status = String((sale as any).status ?? 'COMPLETED').toUpperCase();
      const isCredit = classifyCreditSale(sale);
      const statusMatch = filters.status === 'ALL'
        || (filters.status === 'VOID' && status === 'VOID')
        || (filters.status === 'COMPLETED' && status !== 'VOID')
        || (filters.status === 'CREDIT' && status !== 'VOID' && isCredit)
        || (filters.status === 'CASH' && status !== 'VOID' && !isCredit);
      if (!statusMatch) return false;

      const totalUSD = Number(sale.totalUSD ?? 0) || 0;
      if (Number.isFinite(minUSD) && totalUSD < minUSD) return false;
      if (Number.isFinite(maxUSD) && totalUSD > maxUSD) return false;
      return true;
    });

    const sortBy = String(filters.sortBy ?? 'DATE_DESC');
    return result.sort((a, b) =>
      compareSalesForReport(
        { timestamp: a.timestamp, correlativo: a.correlativo, totalUSD: a.totalUSD },
        { timestamp: b.timestamp, correlativo: b.correlativo, totalUSD: b.totalUSD },
        sortBy
      )
    );
  }, [dateRange.start, dateRange.end, filters, tick, classifyCreditSale]);

  const filteredSalesSplitSummary = React.useMemo(() => {
    return filteredSales.reduce((acc, sale: any) => {
      const isCredit = classifyCreditSale(sale);
      const usd = roundMoney(Number(sale?.totalUSD ?? 0) || 0);
      const ves = roundMoney(Number(sale?.totalVES ?? 0) || 0);
      if (isCredit) {
        acc.credit.count += 1;
        acc.credit.totalUSD += usd;
        acc.credit.totalVES += ves;
      } else {
        acc.cash.count += 1;
        acc.cash.totalUSD += usd;
        acc.cash.totalVES += ves;
      }
      return acc;
    }, {
      credit: { count: 0, totalUSD: 0, totalVES: 0 },
      cash: { count: 0, totalUSD: 0, totalVES: 0 }
    });
  }, [filteredSales, classifyCreditSale, roundMoney]);

  const filteredSalesTotals = React.useMemo(() => {
    return filteredSales.reduce((acc, sale: any) => {
      acc.count += 1;
      acc.totalUSD += roundMoney(Number(sale?.totalUSD ?? 0) || 0);
      acc.totalVES += roundMoney(Number(sale?.totalVES ?? 0) || 0);
      return acc;
    }, { count: 0, totalUSD: 0, totalVES: 0 });
  }, [filteredSales, roundMoney]);

  /** Libro de ventas (pestaña Ventas): refina contado/crédito sin duplicar Estado cuando ya es CASH/CREDIT. */
  const salesBookRows = React.useMemo(() => {
    const st = String(filters.status ?? 'ALL').toUpperCase();
    if (st === 'CASH' || st === 'CREDIT') return filteredSales;
    if (salesBookKind === 'CASH') {
      return filteredSales.filter((sale: any) => !classifyCreditSale(sale));
    }
    if (salesBookKind === 'CREDIT') {
      return filteredSales.filter((sale: any) => classifyCreditSale(sale));
    }
    return filteredSales;
  }, [filteredSales, filters.status, salesBookKind, classifyCreditSale]);

  const salesBookTotals = React.useMemo(() => {
    return salesBookRows.reduce((acc, sale: any) => {
      acc.count += 1;
      acc.totalUSD += roundMoney(Number(sale?.totalUSD ?? 0) || 0);
      acc.totalVES += roundMoney(Number(sale?.totalVES ?? 0) || 0);
      return acc;
    }, { count: 0, totalUSD: 0, totalVES: 0 });
  }, [salesBookRows, roundMoney]);

  const salesBookSplitSummary = React.useMemo(() => {
    return salesBookRows.reduce((acc, sale: any) => {
      const isCredit = classifyCreditSale(sale);
      const u = roundMoney(Number(sale?.totalUSD ?? 0) || 0);
      const v = roundMoney(Number(sale?.totalVES ?? 0) || 0);
      if (isCredit) {
        acc.credit.count += 1;
        acc.credit.totalUSD += u;
        acc.credit.totalVES += v;
      } else {
        acc.cash.count += 1;
        acc.cash.totalUSD += u;
        acc.cash.totalVES += v;
      }
      return acc;
    }, {
      credit: { count: 0, totalUSD: 0, totalVES: 0 },
      cash: { count: 0, totalUSD: 0, totalVES: 0 }
    });
  }, [salesBookRows, classifyCreditSale, roundMoney]);

  const salesBookStatusLabel = React.useMemo(() => {
    const st = String(filters.status ?? 'ALL').toUpperCase();
    if (st === 'CREDIT') return 'Crédito (filtro Estado)';
    if (st === 'CASH') return 'Contado (filtro Estado)';
    if (salesBookKind === 'CREDIT') return 'Solo crédito';
    if (salesBookKind === 'CASH') return 'Solo contado';
    return 'Contado y crédito';
  }, [filters.status, salesBookKind]);

  const salesStatusLabel = React.useMemo(() => {
    const status = String(filters.status ?? 'ALL').toUpperCase();
    if (status === 'CREDIT') return 'Facturas Crédito';
    if (status === 'CASH') return 'Facturas Contado';
    if (status === 'COMPLETED') return 'Facturas Completadas';
    if (status === 'VOID') return 'Facturas Anuladas';
    return 'Facturas Filtradas';
  }, [filters.status]);

  React.useEffect(() => {
    setSalesPage(0);
  }, [filters.client, filters.method, filters.cashier, filters.status, filters.minUSD, filters.maxUSD, filters.sortBy, dateRange.start, dateRange.end]);

  React.useEffect(() => {
    setSalesBookPage(0);
  }, [salesBookKind, filters.client, filters.method, filters.cashier, filters.status, filters.minUSD, filters.maxUSD, filters.sortBy, dateRange.start, dateRange.end]);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SALES_FILTER_PRESETS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      const cleaned = parsed
        .filter((p: any) => p && typeof p === 'object' && typeof p.name === 'string' && p.dateRange && p.filters)
        .map((p: any) => ({
          id: String(p.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`),
          name: String(p.name),
          dateRange: {
            start: String(p.dateRange.start ?? dateRange.start),
            end: String(p.dateRange.end ?? dateRange.end)
          },
          filters: {
            client: String(p.filters.client ?? ''),
            method: String(p.filters.method ?? 'ALL'),
            cashier: String(p.filters.cashier ?? 'ALL'),
            status: String(p.filters.status ?? 'ALL'),
            minUSD: String(p.filters.minUSD ?? ''),
            maxUSD: String(p.filters.maxUSD ?? ''),
            sortBy: String(p.filters.sortBy ?? 'DATE_DESC')
          },
          createdAt: String(p.createdAt ?? new Date().toISOString())
        } as SalesFilterPreset));
      setSalesFilterPresets(cleaned);
    } catch {
      setSalesFilterPresets([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem(SALES_FILTER_PRESETS_KEY, JSON.stringify(salesFilterPresets));
    } catch {
      // noop
    }
  }, [salesFilterPresets]);

  const saveCurrentSalesPreset = React.useCallback(() => {
    const nextName = presetName.trim();
    if (!nextName) return;
    const newPreset: SalesFilterPreset = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: nextName,
      dateRange: { ...dateRange },
      filters: { ...filters },
      createdAt: new Date().toISOString()
    };
    setSalesFilterPresets((prev) => [newPreset, ...prev].slice(0, 20));
    setPresetName('');
  }, [presetName, dateRange, filters]);

  const applySalesPreset = React.useCallback((preset: SalesFilterPreset) => {
    setDateRange({ ...preset.dateRange });
    setFilters({ ...INITIAL_SALES_FILTERS, ...preset.filters });
  }, []);

  const deleteSalesPreset = React.useCallback((presetId: string) => {
    setSalesFilterPresets((prev) => prev.filter((p) => p.id !== presetId));
  }, []);

  const applyManagementTemplate = React.useCallback((templateId: 'credit_month' | 'today_cashier' | 'high_ticket') => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    if (templateId === 'credit_month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      setDateRange({ start: monthStart, end: today });
      setFilters((prev) => ({ ...prev, ...INITIAL_SALES_FILTERS, status: 'CREDIT', sortBy: 'USD_DESC' }));
      return;
    }
    if (templateId === 'today_cashier') {
      setDateRange({ start: today, end: today });
      setFilters((prev) => ({ ...prev, ...INITIAL_SALES_FILTERS, sortBy: 'USD_DESC' }));
      return;
    }
    setDateRange({ start: today, end: today });
    setFilters((prev) => ({ ...prev, ...INITIAL_SALES_FILTERS, minUSD: '100', sortBy: 'USD_DESC' }));
  }, []);

  const chartStats = [...dailyStats].reverse().slice(-7);
  const maxUSD = Math.max(...chartStats.map(s => s.totalUSD), 100);

  // ═══════════════════════════════════════════════════════════════════════
  // BALANCE CONTABLE DEL PERÍODO (Ingresos vs Egresos)
  // ═══════════════════════════════════════════════════════════════════════
  const accountingBalance = React.useMemo(() => {
    const startDate = new Date(dateRange.start + 'T00:00:00');
    const endDate = new Date(dateRange.end + 'T23:59:59');
    const inRange = (ts: Date | string | undefined) => {
      if (!ts) return false;
      const t = ts instanceof Date ? ts : new Date(ts);
      return t >= startDate && t <= endDate;
    };

    // INGRESOS — mismas ventas que el "Libro de ventas" (rango de fechas + filtros de cajero, estado, etc.)
    const periodSales = filteredSales.filter(
      (s) => (s as any).status !== 'VOID' && !(s as any).voided
    );
    // Ventas al contado (no crédito) → efectivo cobrado inmediato
    const cashSalesUSD = periodSales
      .filter(s => !classifyCreditSale(s))
      .reduce((a, s) => a + Number(s.totalUSD ?? 0), 0);
    // Ventas a crédito (quedan como AR, no entra efectivo aún)
    const creditSalesUSD = periodSales
      .filter(s => classifyCreditSale(s))
      .reduce((a, s) => a + Number(s.totalUSD ?? 0), 0);
    // Cobros AR en el período (via bank_transactions source AR_PAYMENT)
    const arCollectionsUSD = allBankTx
      .filter(tx => inRange(tx?.createdAt) && String(tx?.source ?? '') === 'AR_PAYMENT')
      .reduce((a, tx) => a + Math.abs(Number(tx?.amountUSD ?? 0)), 0);

    // EGRESOS
    const expenses = dataService.getExpenses().filter(e =>
      inRange(e.timestamp) && e.status !== 'VOID'
    );
    const expensesUSD = expenses.reduce((a, e) => a + Number(e.amountUSD ?? 0), 0);
    const fixedExpUSD = expenses.filter(e => e.type === 'FIXED').reduce((a, e) => a + Number(e.amountUSD ?? 0), 0);
    const variableExpUSD = expenses.filter(e => e.type === 'VARIABLE').reduce((a, e) => a + Number(e.amountUSD ?? 0), 0);

    // Compras del período (AP entries creadas)
    const apEntries = dataService.getAPEntries().filter(ap => inRange(ap.timestamp));
    const purchasesUSD = apEntries.reduce((a, ap) => a + Number(ap.amountUSD ?? 0), 0);
    // Pagos AP en el período (egreso efectivo)
    const apPaymentsUSD = allBankTx
      .filter(tx => inRange(tx?.createdAt) && (String(tx?.source ?? '') === 'AP_PAYMENT' || String(tx?.source ?? '') === 'PURCHASE_PAYMENT'))
      .reduce((a, tx) => a + Math.abs(Number(tx?.amountUSD ?? 0)), 0);

    // Devoluciones / Notas de crédito del período
    const creditNotes = dataService.getCreditNotes().filter((cn: any) => inRange(cn.timestamp || cn.createdAt));
    const creditNotesUSD = creditNotes.reduce((a: number, cn: any) => a + Math.abs(Number(cn.amountUSD ?? cn.totalUSD ?? 0)), 0);

    // Mermas valoradas (movimientos tipo WASTE/ADJUSTMENT_OUT en USD)
    const stocks = dataService.getStocks();
    const costBySku: Record<string, number> = {};
    stocks.forEach((p: any) => {
      const lotes = p.lotes || [];
      if (lotes.length > 0) {
        const avg = lotes.reduce((a: number, l: any) => a + Number(l.costUSD ?? 0), 0) / lotes.length;
        costBySku[p.code] = avg;
      }
    });
    const shrinkageMovs = dataService.getMovements().filter((m: any) =>
      inRange(m.timestamp) &&
      ['WASTE', 'ADJUSTMENT_OUT'].includes(String(m.type ?? '').toUpperCase())
    );
    const shrinkageUSD = shrinkageMovs.reduce((a: number, m: any) =>
      a + Math.abs(Number(m.qty ?? 0)) * (costBySku[m.sku] ?? 0), 0);

    const totalIngresosUSD = cashSalesUSD + arCollectionsUSD;
    const totalEgresosUSD = expensesUSD + apPaymentsUSD + creditNotesUSD;
    const netoUSD = totalIngresosUSD - totalEgresosUSD;

    return {
      ingresos: {
        cashSalesUSD,
        creditSalesUSD,
        arCollectionsUSD,
        totalUSD: totalIngresosUSD,
        salesCount: periodSales.length
      },
      egresos: {
        expensesUSD,
        fixedExpUSD,
        variableExpUSD,
        purchasesUSD,
        apPaymentsUSD,
        creditNotesUSD,
        shrinkageUSD,
        totalUSD: totalEgresosUSD,
        expensesCount: expenses.length,
        purchasesCount: apEntries.length
      },
      netoUSD
    };
  }, [dateRange.start, dateRange.end, allBankTx, isCreditSaleByBusinessRule, filteredSales]);

  // ═══════════════════════════════════════════════════════════════════════
  // ANTICIPOS / ABONOS DE CLIENTES EN EL PERÍODO
  // ═══════════════════════════════════════════════════════════════════════
  const clientAdvancesSummary = React.useMemo(() => {
    const startDate = new Date(dateRange.start + 'T00:00:00');
    const endDate = new Date(dateRange.end + 'T23:59:59');
    const inRange = (ts: Date | string | undefined) => {
      if (!ts) return false;
      const t = ts instanceof Date ? ts : new Date(ts);
      return t >= startDate && t <= endDate;
    };

    // Anticipos creados en el período (nuevos créditos a favor)
    const advances = dataService.getAllClientAdvances();
    const periodAdvances = advances.filter((a: any) =>
      inRange(a.createdAt) && a.status !== 'VOID'
    );
    const newAdvancesUSD = periodAdvances
      .filter((a: any) => a.originInvoiceId) // Solo anticipos generados desde vuelto (no depósitos directos)
      .reduce((sum: number, a: any) => sum + Number(a.amountUSD ?? 0), 0);
    
    const directDepositsUSD = periodAdvances
      .filter((a: any) => !a.originInvoiceId) // Depósitos directos de anticipos
      .reduce((sum: number, a: any) => sum + Number(a.amountUSD ?? 0), 0);

    // Aplicaciones de anticipos (consumo del saldo a favor)
    const applications = allBankTx.filter(tx =>
      inRange(tx?.createdAt) && String(tx?.source ?? '') === 'ADVANCE_APPLICATION'
    );
    const appliedUSD = applications.reduce((sum, tx) =>
      sum + Math.abs(Number(tx?.amountUSD ?? 0)), 0);

    // Saldo actual pendiente de anticipos
    const currentBalanceUSD = (advances || []).reduce((sum: number, a: any) =>
      sum + Number(a.balanceUSD ?? 0), 0);

    return {
      newAdvancesUSD,
      directDepositsUSD,
      appliedUSD,
      currentBalanceUSD,
      createdCount: periodAdvances.length,
      applications: applications.length
    };
  }, [dateRange.start, dateRange.end, allBankTx]);

  // ═══════════════════════════════════════════════════════════════════════
  // LIBRO DE OPERACIONES CONSOLIDADO (Todas las transacciones del período)
  // ═══════════════════════════════════════════════════════════════════════
  const operationsJournal = React.useMemo(() => {
    const startDate = new Date(dateRange.start + 'T00:00:00');
    const endDate = new Date(dateRange.end + 'T23:59:59');
    const salesInRange = dataService.getSales().filter((sale: any) => {
      const ts = sale?.timestamp instanceof Date ? sale.timestamp : new Date(sale?.timestamp ?? Date.now());
      return ts >= startDate && ts <= endDate;
    });
    const ops: Array<{
      date: string;
      time: string;
      type: 'VENTA' | 'COMPRA' | 'DEVOLUCION' | 'EGRESO' | 'ANTICIPO' | 'COBRO_AR' | 'PAGO_AP' | 'MERMA';
      typeLabel: string;
      correlativo: string;
      entity: string;
      description: string;
      amountUSD: number;
      amountVES: number;
      method: string;
      status: string;
      timestamp: number;
      flow: 'INCOME' | 'EXPENSE';
    }> = [];

    // Método en ventas: usar el mismo desglose que cierre Z / bancos (payments + bank_tx SALE_PAYMENT),
    // no solo sale.paymentMethod (p. ej. MIXTO → "Sin desglose" aunque en banco figure Pago Móvil).
    const resolveSaleJournalMethod = (sale: any): string => {
      const lines = extractSalePaymentLines(sale);
      if (!Array.isArray(lines) || lines.length === 0) {
        return overviewMethodLabel(sale?.paymentMethod);
      }
      const normalized = [...new Set(lines.map((l) => overviewMethodLabel(l.method)).filter(Boolean))];
      return normalized.length > 0 ? normalized.join(' + ') : overviewMethodLabel(sale?.paymentMethod);
    };

    // Ventas del período (incluye anuladas para trazabilidad contable)
    salesInRange.forEach((s: any) => {
      const isVoided = (s as any).status === 'VOID' || (s as any).voided;
      const saleTs = s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp);
      ops.push({
        date: saleTs.toISOString().split('T')[0],
        time: saleTs.toISOString().split('T')[1].slice(0, 5),
        type: 'VENTA',
        typeLabel: isVoided
          ? 'Venta (Anulada)'
          : (classifyCreditSale(s) ? 'Venta Crédito' : 'Venta Contado'),
        correlativo: s.correlativo ?? '',
        entity: s.client?.name ?? 'Cliente',
        description: `${(s as any).items?.length ?? 0} ítem(s)`,
        amountUSD: Number(s.totalUSD ?? 0) || 0,
        amountVES: Number(s.totalVES ?? 0) || 0,
        method: resolveSaleJournalMethod(s),
        status: isVoided ? 'ANULADA' : 'COMPLETADA',
        timestamp: saleTs.getTime(),
        flow: 'INCOME'
      });
    });

    // Compras
    dataService.getAPEntries().forEach(ap => {
      if (ap.timestamp >= startDate && ap.timestamp <= endDate) {
        ops.push({
          date: ap.timestamp.toISOString().split('T')[0],
          time: ap.timestamp.toISOString().split('T')[1].slice(0,5),
          type: 'COMPRA',
          typeLabel: ap.status === 'PAID' ? 'Compra Pagada' : 'Compra Crédito',
          correlativo: ap.id.slice(-8).toUpperCase(),
          entity: ap.supplier,
          description: ap.description,
          amountUSD: -ap.amountUSD,
          amountVES: 0,
          method: ap.status === 'PAID' ? 'Efectivo $' : 'Crédito',
          status: ap.status,
          timestamp: ap.timestamp.getTime(),
          flow: 'EXPENSE'
        });
      }
    });

    // Devoluciones (Credit Notes)
    (dataService.getCreditNotes ? dataService.getCreditNotes() : []).forEach((cn: any) => {
      const ts = cn.timestamp ? new Date(cn.timestamp) : new Date(cn.createdAt);
      if (ts >= startDate && ts <= endDate && cn.status !== 'VOID') {
        ops.push({
          date: ts.toISOString().split('T')[0],
          time: ts.toISOString().split('T')[1].slice(0,5),
          type: 'DEVOLUCION',
          typeLabel: 'Devolución',
          correlativo: cn.correlativo || `NC-${cn.id?.slice(-6)}`,
          entity: cn.clientName || cn.customerName || 'Cliente',
          description: cn.reason || 'Nota de Crédito',
          amountUSD: -(cn.amountUSD || cn.totalUSD || 0),
          amountVES: -(cn.amountVES || cn.totalVES || 0),
          method: overviewMethodLabel(cn.refundMethod || 'cash_usd', cn.bankName ?? cn.bank),
          status: cn.status || 'PENDING',
          timestamp: ts.getTime(),
          flow: 'EXPENSE'
        });
      }
    });

    // Egresos (Expenses)
    dataService.getExpenses().forEach(e => {
      if (e.timestamp >= startDate && e.timestamp <= endDate && e.status !== 'VOID') {
        ops.push({
          date: e.timestamp.toISOString().split('T')[0],
          time: e.timestamp.toISOString().split('T')[1].slice(0,5),
          type: 'EGRESO',
          typeLabel: e.type === 'FIXED' ? 'Gasto Fijo' : 'Gasto Variable',
          correlativo: e.id.slice(-8).toUpperCase(),
          entity: e.supplier || 'Gasto Operativo',
          description: e.description,
          amountUSD: -e.amountUSD,
          amountVES: -(e.amountVES || 0),
          method: overviewMethodLabel(e.paymentMethod || 'other'),
          status: e.status,
          timestamp: e.timestamp.getTime(),
          flow: 'EXPENSE'
        });
      }
    });

    // Anticipos creados
    dataService.getAllClientAdvances().forEach((a: any) => {
      const ts = a.createdAt ? new Date(a.createdAt) : new Date();
      if (ts >= startDate && ts <= endDate && a.status !== 'VOID') {
        ops.push({
          date: ts.toISOString().split('T')[0],
          time: ts.toISOString().split('T')[1].slice(0,5),
          type: 'ANTICIPO',
          typeLabel: a.originInvoiceId ? 'Anticipo por Vuelto' : 'Anticipo Directo',
          correlativo: a.id?.slice(-8).toUpperCase() || 'ANT-???',
          entity: a.customerName || 'Cliente',
          description: a.note || `Anticipo: $${Number(a.amountUSD || 0).toFixed(2)}`,
          amountUSD: Number(a.amountUSD || 0),
          amountVES: Number(a.originalAmountVES || a.amountVES || 0),
          method: String(a.currency || 'USD').toUpperCase() === 'VES' ? 'Efectivo Bs' : 'Efectivo $',
          status: a.status || 'ACTIVE',
          timestamp: ts.getTime(),
          flow: 'INCOME'
        });
      }
    });

    // Cobros AR y Pagos AP desde bank_transactions
    allBankTx.forEach(tx => {
      const ts = tx.createdAt ? new Date(tx.createdAt) : new Date();
      if (ts >= startDate && ts <= endDate) {
        const source = String(tx.source || '');
        const isIncoming = (tx.amountUSD || 0) > 0 || (tx.amountVES || 0) > 0;
        
        if (source === 'AR_PAYMENT' && isIncoming) {
          ops.push({
            date: ts.toISOString().split('T')[0],
            time: ts.toISOString().split('T')[1].slice(0,5),
            type: 'COBRO_AR',
            typeLabel: 'Cobro Cuenta por Cobrar',
            correlativo: tx.saleCorrelativo || tx.sourceId?.slice(-8) || '',
            entity: tx.customerName || 'Cliente',
            description: tx.note || 'Cobro de factura',
            amountUSD: Math.abs(tx.amountUSD || 0),
            amountVES: Math.abs(tx.amountVES || 0),
            method: overviewMethodLabel(tx.method || 'transfer', tx.bankName ?? tx.bank),
            status: 'COMPLETADO',
            timestamp: ts.getTime(),
            flow: 'INCOME'
          });
        } else if ((source === 'AP_PAYMENT' || source === 'PURCHASE_PAYMENT') && !isIncoming) {
          ops.push({
            date: ts.toISOString().split('T')[0],
            time: ts.toISOString().split('T')[1].slice(0,5),
            type: 'PAGO_AP',
            typeLabel: source === 'PURCHASE_PAYMENT' ? 'Pago Compra' : 'Pago Proveedor',
            correlativo: tx.saleCorrelativo || tx.sourceId?.slice(-8) || '',
            entity: tx.customerName || tx.bankName || 'Proveedor',
            description: tx.note || 'Pago a proveedor',
            amountUSD: -Math.abs(tx.amountUSD || 0),
            amountVES: -Math.abs(tx.amountVES || 0),
            method: overviewMethodLabel(tx.method || 'transfer', tx.bankName ?? tx.bank),
            status: 'COMPLETADO',
            timestamp: ts.getTime(),
            flow: 'EXPENSE'
          });
        }
      }
    });

    return ops.sort((a, b) => {
      const dt = b.timestamp - a.timestamp;
      if (dt !== 0) return dt;
      return compareCorrelativo(a.correlativo, b.correlativo);
    });
  }, [dateRange.start, dateRange.end, allBankTx, classifyCreditSale, overviewMethodLabel, extractSalePaymentLines, tick]);

  const filteredOperationsJournal = React.useMemo(() => {
    const q = overviewQuery.trim().toLowerCase();
    return operationsJournal.filter((op) => {
      const typeMatch = overviewMovementType === 'ALL' || op.type === overviewMovementType;
      if (!typeMatch) return false;
      const flowMatch = overviewFlow === 'ALL' || op.flow === overviewFlow;
      if (!flowMatch) return false;
      if (!q) return true;
      const haystack = [
        op.date,
        op.time,
        op.type,
        op.typeLabel,
        op.correlativo,
        op.entity,
        op.description,
        op.method,
        op.status
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [operationsJournal, overviewMovementType, overviewFlow, overviewQuery]);

  const filteredOperationsTotals = React.useMemo(() => {
    return filteredOperationsJournal.reduce((acc, op) => {
      acc.count += 1;
      acc.totalUSD += Number(op.amountUSD ?? 0) || 0;
      acc.totalVES += Number(op.amountVES ?? 0) || 0;
      return acc;
    }, { count: 0, totalUSD: 0, totalVES: 0 });
  }, [filteredOperationsJournal]);

  // ═══════════════════════════════════════════════════════════════════════
  // MOVIMIENTOS DE INVENTARIO (Entradas y Salidas del período)
  // ═══════════════════════════════════════════════════════════════════════
  const inventoryMovements = React.useMemo(() => {
    const startDate = new Date(dateRange.start + 'T00:00:00');
    const endDate = new Date(dateRange.end + 'T23:59:59');
    const IN_TYPES = new Set(['IN', 'PURCHASE', 'SALE_RETURN', 'RETURN', 'MANUFACTURING', 'VOID', 'ADJUSTMENT_IN']);
    const OUT_TYPES = new Set(['OUT', 'SALE', 'FRACTION', 'WASTE', 'PURCHASE_RETURN', 'ADJUSTMENT_OUT', 'TRANSFER_OUT']);

    const movs = dataService.getMovements().filter((m: any) => {
      const t = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp);
      return t >= startDate && t <= endDate;
    });

    const stocks = dataService.getStocks();
    const productMap: Record<string, { description: string; unit: string; cost: number }> = {};
    stocks.forEach((p: any) => {
      const lotes = p.lotes || [];
      const avgCost = lotes.length > 0
        ? lotes.reduce((a: number, l: any) => a + Number(l.costUSD ?? 0), 0) / lotes.length
        : 0;
      productMap[p.code] = {
        description: p.description || p.code,
        unit: p.unit || '',
        cost: avgCost
      };
    });

    // Agrupar por SKU
    const bySku: Record<string, { sku: string; description: string; unit: string; inQty: number; outQty: number; inValueUSD: number; outValueUSD: number; movCount: number }> = {};
    let totalInQty = 0, totalOutQty = 0, totalInUSD = 0, totalOutUSD = 0;

    for (const m of movs) {
      const type = String(m.type ?? '').toUpperCase();
      const rawQty = Number(m.qty ?? 0) || 0;
      const absQty = Math.abs(rawQty);
      const sku = String(m.sku ?? '');
      const info = productMap[sku] || { description: sku, unit: '', cost: 0 };

      if (!bySku[sku]) {
        bySku[sku] = {
          sku,
          description: info.description,
          unit: info.unit,
          inQty: 0, outQty: 0, inValueUSD: 0, outValueUSD: 0, movCount: 0
        };
      }
      bySku[sku].movCount++;

      // Determinar dirección: tipos fijos o AUTO con signo
      const isIn = IN_TYPES.has(type) || (type === 'ADJUST' && rawQty > 0) || (type === 'BATCH_ADJUST' && rawQty > 0);
      const isOut = OUT_TYPES.has(type) || (type === 'ADJUST' && rawQty < 0) || (type === 'BATCH_ADJUST' && rawQty < 0);

      if (isIn) {
        bySku[sku].inQty += absQty;
        bySku[sku].inValueUSD += absQty * info.cost;
        totalInQty += absQty;
        totalInUSD += absQty * info.cost;
      } else if (isOut) {
        bySku[sku].outQty += absQty;
        bySku[sku].outValueUSD += absQty * info.cost;
        totalOutQty += absQty;
        totalOutUSD += absQty * info.cost;
      }
    }

    const byProduct = Object.values(bySku)
      .filter(p => p.inQty > 0 || p.outQty > 0)
      .sort((a, b) => (b.inQty + b.outQty) - (a.inQty + a.outQty));

    return {
      totalInQty, totalOutQty, totalInUSD, totalOutUSD,
      totalMovements: movs.length,
      byProduct
    };
  }, [dateRange.start, dateRange.end]);

  const inventoryVolumeLabel = React.useMemo(() => {
    const byUnit = inventoryStats.reduce((acc, row) => {
      const unit = String(row.unit ?? 'UND').trim().toUpperCase() || 'UND';
      acc[unit] = (acc[unit] || 0) + (Number(row.totalQty ?? 0) || 0);
      return acc;
    }, {} as Record<string, number>);
    const parts = (Object.entries(byUnit) as Array<[string, number]>)
      .filter(([, qty]) => Math.abs(qty) > 0.000001)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([unit, qty]) => `${fmt(Number(qty), 3)} ${unit}`);
    return parts.length > 0 ? parts.join(' · ') : '0 UND';
  }, [inventoryStats]);

  const valuationTrendLabel = React.useMemo(() => {
    const base = valuationPricing === 'cost' ? 'Precio costo' : 'Precio venta (lista)';
    if (valuationCurrency === 'VES') {
      return `${base} · Bs @ ${fmt(valuationVesRate, 4)}`;
    }
    return `${base} · USD`;
  }, [valuationPricing, valuationCurrency, valuationVesRate, fmt]);

  const kpis = [
    { title: 'Ventas de Hoy', value: usd(todayLiq.totalUSD), trend: `${todayLiq.count} Ops`, color: 'emerald' },
    { title: 'Valoracion Activo', value: formatValuationKpi(valuationDisplayAmount), trend: valuationTrendLabel, color: 'slate' },
    { title: 'Ticket Promedio', value: usd(dailyStats.reduce((a, b) => a + b.totalUSD, 0) / (dailyStats.length || 1)), trend: 'Historico', color: 'blue' },
    { title: 'Volumen Total', value: inventoryVolumeLabel, trend: 'Stock Real', color: 'amber' },
  ];

  // MARGIN DATA - Solo costo de compra real
  const landedCostData = React.useMemo(() => {
    const stocks = dataService.getStocks();
    const sales = dataService.getSales();
    const movements = dataService.getMovements();
    const soldQtyBySkuBatch = new Map<string, number>();
    const parseDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const periodStartRaw = parseDate(`${marginDateRange.start}T00:00:00`);
    const periodEndRaw = parseDate(`${marginDateRange.end}T23:59:59`);
    const periodStart = periodStartRaw && periodEndRaw && periodStartRaw > periodEndRaw ? periodEndRaw : periodStartRaw;
    const periodEnd = periodStartRaw && periodEndRaw && periodStartRaw > periodEndRaw ? periodStartRaw : periodEndRaw;
    const inPeriod = (value: any): boolean => {
      const parsed = parseDate(value);
      if (!parsed || !periodStart || !periodEnd) return true;
      return parsed >= periodStart && parsed <= periodEnd;
    };
    sales.forEach((sale: any) => {
      if ((sale as any)?.voided) return;
      if (String((sale as any)?.status ?? '').toUpperCase() === 'VOID') return;
      if (!inPeriod(sale?.timestamp)) return;
      const items = Array.isArray(sale?.items) ? sale.items : [];
      items.forEach((item: any) => {
        const sku = String(item?.code ?? '').trim();
        const lotes = Array.isArray(item?.dispatchLotes) ? item.dispatchLotes : [];
        lotes.forEach((lot: any) => {
          const batchId = String(lot?.batchId ?? '').trim();
          const qty = Math.abs(Number(lot?.qty ?? 0) || 0);
          if (!sku || !batchId || qty <= 0) return;
          const key = `${sku}|${batchId}`;
          soldQtyBySkuBatch.set(key, (soldQtyBySkuBatch.get(key) || 0) + qty);
        });
      });
    });
    const batches: any[] = [];
    stocks.forEach(product => {
      const productBatches = (product as any).lotes || [];
      productBatches.forEach((batch: any) => {
        const unitCost = Number(batch.costUSD || 0);
        const qty = Number(batch.quantity ?? batch.qty ?? 0);
        const initialQty = Number(batch.initialQty ?? batch.quantity ?? batch.qty ?? 0);
        const purchaseCost = unitCost * initialQty;
        const onHandCostUSD = unitCost * qty;
        const currentPrice = Number(product.priceUSD || 0);
        const grossMarginPct = currentPrice > 0 ? ((currentPrice - unitCost) / currentPrice) * 100 : 0;
        const batchId = String(batch.id ?? batch.lote ?? '');
        const soldByDispatch = soldQtyBySkuBatch.get(`${String(product.code ?? '')}|${batchId}`) || 0;
        const movementsByBatch = movements.filter((m: any) =>
          m.sku === product.code &&
          String(m.batchId ?? '') === batchId &&
          inPeriod((m as any)?.timestamp)
        );
        const soldByBatchMovement = movementsByBatch.filter(m => m.type === 'SALE' || m.type === 'VENTA').reduce((sum, m) => sum + Math.abs(m.qty || 0), 0);
        const soldBySkuFallback = movements
          .filter((m: any) => m.sku === product.code && (m.type === 'SALE' || m.type === 'VENTA') && inPeriod((m as any)?.timestamp))
          .reduce((sum, m) => sum + Math.abs(m.qty || 0), 0);
        const soldQty = soldByDispatch > 0 ? soldByDispatch : (soldByBatchMovement > 0 ? soldByBatchMovement : soldBySkuFallback);
        const revenueUSD = soldQty * currentPrice;
        const soldProfitUSD = soldQty * (currentPrice - unitCost);
        if (unitCost > 0) {
          batches.push({
            batchId: batchId || `${product.code}-${Date.now()}`,
            sku: product.code,
            description: product.description,
            purchaseCostUSD: purchaseCost,
            onHandCostUSD,
            qty,
            unitCost,
            currentPriceUSD: currentPrice,
            grossMarginPct,
            soldQty,
            revenueUSD,
            soldProfitUSD
          });
        }
      });
    });
    return batches.filter(b => {
      const query = marginFilterQuery.trim().toLowerCase();
      if (!query) return true;
      if (marginFilterMode === 'PRODUCT') {
        return b.sku.toLowerCase().includes(query) || String(b.description ?? '').toLowerCase().includes(query);
      }
      return b.batchId.toLowerCase().includes(query);
    }).sort((a, b) => b.grossMarginPct - a.grossMarginPct);
  }, [marginFilterMode, marginFilterQuery, marginDateRange.start, marginDateRange.end, tick]);

  // REP-01 FIX: Load real bank transactions for treasury
  React.useEffect(() => {
    let active = true;
    dataService.getBankTransactions({ take: 2000 })
      .then(rows => { if (active) setAllBankTx(Array.isArray(rows) ? rows : []); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  // Saldos "Saldo por banco" = getAvailableBankBalance (todos los movimientos en Firestore por banco), no la ventana truncada de allBankTx.
  React.useEffect(() => {
    if (activeTab !== 'treasury') return;
    let cancelled = false;
    setTreasuryOfficialBalancesLoading(true);
    const banks = (dataService.getBanks() || []).filter((b: any) => b?.active !== false);
    (async () => {
      const next: Record<string, { usd: number; ves: number }> = {};
      await Promise.all(
        banks.map(async (b: any) => {
          const id = String(b?.id ?? '').trim();
          if (!id) return;
          const prof = getBankCurrencyProfileForTreasury(b);
          let usd = 0;
          let ves = 0;
          try {
            if (prof === 'USD_ONLY' || prof === 'MIXED' || prof === 'UNKNOWN') {
              usd = await dataService.getAvailableBankBalance({ bankId: id, currency: 'USD' });
            }
            if (prof === 'VES_ONLY' || prof === 'MIXED' || prof === 'UNKNOWN') {
              ves = await dataService.getAvailableBankBalance({ bankId: id, currency: 'VES' });
            }
          } catch (e) {
            console.warn('[ReportsView] tesorería: no se pudo leer saldo oficial del banco', id, e);
          }
          next[id] = { usd, ves };
        })
      );
      if (!cancelled) {
        setTreasuryOfficialBalances(next);
        setTreasuryOfficialBalancesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, tick]);

  // TREASURY DATA — saldos por banco alineados con Finanzas; conteo/última fecha desde ventana sincronizada allBankTx
  const treasuryData = React.useMemo(() => {
    const banks = (dataService.getBanks() || []).filter((bank: any) => bank?.active !== false);
    const counted = allBankTx.filter((tx) => isBankTransactionCountedForBalance(tx));
    const officialReady = treasuryOfficialBalances !== null;
    const bankBalances = banks.map((bank) => {
      const bid = String(bank?.id ?? '');
      const txs = counted.filter((tx) => String(tx?.bankId ?? '') === String(bank.id));
      const rowOfficial = officialReady ? treasuryOfficialBalances![bid] : undefined;
      const balanceUSD =
        rowOfficial !== undefined
          ? rowOfficial.usd
          : computeBankWideNetBalance(counted, bank, 'USD');
      const balanceVES =
        rowOfficial !== undefined
          ? rowOfficial.ves
          : computeBankWideNetBalance(counted, bank, 'VES');
      const lastTx = txs.length > 0 ? new Date(Math.max(...txs.map((tx) => new Date(tx.createdAt ?? 0).getTime()))) : null;
      return { ...bank, balanceUSD, balanceVES, txCount: txs.length, lastTx };
    });
    const usdTotal = officialReady
      ? bankBalances.reduce((acc, b) => acc + (Number(b.balanceUSD) || 0), 0)
      : 0;
    const vesTotal = officialReady
      ? bankBalances.reduce((acc, b) => acc + (Number(b.balanceVES) || 0), 0)
      : 0;
    return {
      usdTotal,
      vesTotal,
      banks: bankBalances,
      officialBalancesReady: officialReady,
      officialBalancesLoading: treasuryOfficialBalancesLoading
    };
  }, [allBankTx, tick, treasuryOfficialBalances, treasuryOfficialBalancesLoading]);

  const treasuryBankOptions = React.useMemo(() => {
    return (dataService.getBanks() || [])
      .filter((bank: any) => bank?.active !== false)
      .map((bank: any) => ({
        id: String(bank?.id ?? ''),
        name: String(bank?.name ?? 'Banco'),
        accounts: Array.isArray(bank?.accounts) ? bank.accounts : []
      }))
      .filter((bank: any) => bank.id);
  }, [tick]);

  const treasurySelectedBank = React.useMemo(() => {
    if (treasurySelectedBankId === 'ALL') return null;
    return treasuryBankOptions.find((bank: any) => String(bank.id) === String(treasurySelectedBankId)) ?? null;
  }, [treasurySelectedBankId, treasuryBankOptions]);

  const treasuryAccountOptions = React.useMemo(() => {
    if (!treasurySelectedBank) return [];
    return (treasurySelectedBank.accounts || [])
      .map((account: any) => ({
        key: `${treasurySelectedBank.id}::${String(account?.id ?? '')}`,
        accountId: String(account?.id ?? ''),
        label: String(account?.label ?? 'Cuenta'),
        accountNumber: String(account?.accountNumber ?? ''),
        currency: String(account?.currency ?? '')
      }))
      .filter((account: any) => account.accountId);
  }, [treasurySelectedBank]);

  React.useEffect(() => {
    setTreasurySelectedAccountKey('ALL');
  }, [treasurySelectedBankId]);

  const treasuryMethodOptions = React.useMemo(() => {
    const selectedBankNameNorm = String(treasurySelectedBank?.name ?? '').trim().toUpperCase();
    const selectedAccountId = treasurySelectedAccountKey === 'ALL'
      ? ''
      : String(treasurySelectedAccountKey).split('::')[1] ?? '';
    const methods = new Set<string>();

    allBankTx.forEach((tx: any) => {
      if (!tx) return;
      const createdAt = new Date(tx?.createdAt ?? Date.now());
      const txDate = createdAt.toISOString().split('T')[0];
      if (txDate < treasuryDateRange.start || txDate > treasuryDateRange.end) return;

      const source = String(tx?.source ?? '').toUpperCase();
      const isSaleFlow = source === 'SALE_PAYMENT' || source === 'CREDIT_DOWN';
      const isPurchaseFlow = source === 'PURCHASE_PAYMENT' || source === 'AP_PAYMENT';
      const isGeneralFlow = isSaleFlow || isPurchaseFlow;
      const amountUSD = Number(tx?.amountUSD ?? 0) || 0;
      const amountVES = Number(tx?.amountVES ?? 0) || 0;
      const hasUSD = Math.abs(amountUSD) > 0.0001;
      const hasVES = Math.abs(amountVES) > 0.0001;
      if (treasuryFlowFilter === 'GENERAL' && !isGeneralFlow) return;
      if (treasuryFlowFilter === 'SALES' && !isSaleFlow) return;
      if (treasuryFlowFilter === 'PURCHASES' && !isPurchaseFlow) return;
      if (treasuryCurrencyFilter === 'USD' && !hasUSD) return;
      if (treasuryCurrencyFilter === 'VES' && !hasVES) return;

      if (treasurySelectedBankId !== 'ALL') {
        const txBankId = String(tx?.bankId ?? '').trim();
        const txBankNameNorm = String(tx?.bankName ?? '').trim().toUpperCase();
        const bankMatch = (txBankId && txBankId === treasurySelectedBankId)
          || (selectedBankNameNorm && txBankNameNorm && txBankNameNorm === selectedBankNameNorm);
        if (!bankMatch) return;
      }

      if (selectedAccountId) {
        const txAccountId = String(tx?.accountId ?? '').trim();
        if (!txAccountId || txAccountId !== selectedAccountId) return;
      }

      const label = paymentMethodLabel(tx?.method, tx?.bankName ?? tx?.bank);
      methods.add(String(label || 'Otro'));
    });

    return Array.from(methods).sort((a, b) => a.localeCompare(b));
  }, [
    allBankTx,
    paymentMethodLabel,
    treasuryDateRange.start,
    treasuryDateRange.end,
    treasuryFlowFilter,
    treasuryCurrencyFilter,
    treasurySelectedBankId,
    treasurySelectedAccountKey,
    treasurySelectedBank
  ]);

  React.useEffect(() => {
    if (treasuryMethodFilter === 'ALL') return;
    if (!treasuryMethodOptions.includes(treasuryMethodFilter)) {
      setTreasuryMethodFilter('ALL');
    }
  }, [treasuryMethodFilter, treasuryMethodOptions]);

  const treasuryDetailRows = React.useMemo(() => {
    const selectedBankNameNorm = String(treasurySelectedBank?.name ?? '').trim().toUpperCase();
    const selectedAccountId = treasurySelectedAccountKey === 'ALL'
      ? ''
      : String(treasurySelectedAccountKey).split('::')[1] ?? '';

    const rows = allBankTx
      .filter((tx: any) => {
        if (!tx) return false;
        const createdAt = new Date(tx?.createdAt ?? Date.now());
        const txDate = createdAt.toISOString().split('T')[0];
        if (txDate < treasuryDateRange.start || txDate > treasuryDateRange.end) return false;
        const source = String(tx?.source ?? '').toUpperCase();
        const isSaleFlow = source === 'SALE_PAYMENT' || source === 'CREDIT_DOWN';
        const isPurchaseFlow = source === 'PURCHASE_PAYMENT' || source === 'AP_PAYMENT';
        const isGeneralFlow = isSaleFlow || isPurchaseFlow;
        const correlativoNorm = String(tx?.saleCorrelativo ?? '').trim().toUpperCase();
        const customerNorm = String(tx?.customerName ?? '').trim().toUpperCase();
        const isInternalOperationalRow =
          correlativoNorm === 'DEBITO'
          || customerNorm.includes('RETIRO DE CAJA');
        const amountUSD = Number(tx?.amountUSD ?? 0) || 0;
        const amountVES = Number(tx?.amountVES ?? 0) || 0;
        const hasUSD = Math.abs(amountUSD) > 0.0001;
        const hasVES = Math.abs(amountVES) > 0.0001;
        if (treasuryFlowFilter === 'GENERAL' && !isGeneralFlow) return false;
        if (treasuryFlowFilter === 'SALES' && !isSaleFlow) return false;
        if (treasuryFlowFilter === 'PURCHASES' && !isPurchaseFlow) return false;
        // En vistas operativas (general/ventas/compras) ocultar movimientos internos de retiro,
        // para que el reporte se enfoque en operaciones de factura/proveedor.
        if (treasuryFlowFilter !== 'ALL' && isInternalOperationalRow) return false;
        if (treasuryCurrencyFilter === 'USD' && !hasUSD) return false;
        if (treasuryCurrencyFilter === 'VES' && !hasVES) return false;
        const txMethodLabel = paymentMethodLabel(tx?.method, tx?.bankName ?? tx?.bank);
        if (treasuryMethodFilter !== 'ALL' && String(txMethodLabel) !== treasuryMethodFilter) return false;
        if (treasurySelectedBankId !== 'ALL') {
          const txBankId = String(tx?.bankId ?? '').trim();
          const txBankNameNorm = String(tx?.bankName ?? '').trim().toUpperCase();
          const bankMatch = (txBankId && txBankId === treasurySelectedBankId)
            || (selectedBankNameNorm && txBankNameNorm && txBankNameNorm === selectedBankNameNorm);
          if (!bankMatch) return false;
        }
        if (selectedAccountId) {
          const txAccountId = String(tx?.accountId ?? '').trim();
          if (!txAccountId || txAccountId !== selectedAccountId) return false;
        }
        return true;
      })
      .sort((a: any, b: any) => {
        const t = new Date(a?.createdAt ?? 0).getTime() - new Date(b?.createdAt ?? 0).getTime();
        if (t !== 0) return t;
        return compareCorrelativo(
          String(a?.correlativo ?? a?.reference ?? a?.id ?? ''),
          String(b?.correlativo ?? b?.reference ?? b?.id ?? '')
        );
      });

    let runningUSD = 0;
    let runningVES = 0;
    return rows.map((tx: any) => {
      const amountUSD = Number(tx?.amountUSD ?? 0) || 0;
      const amountVES = Number(tx?.amountVES ?? 0) || 0;
      const rateUsed = Number(tx?.rateUsed ?? 0) || 0;
      runningUSD += amountUSD;
      runningVES += amountVES;
      const dateObj = new Date(tx?.createdAt ?? Date.now());
      const source = String(tx?.source ?? '').toUpperCase();
      const sourceLabelMap: Record<string, string> = {
        SALE_PAYMENT: 'Cobro de venta',
        CREDIT_DOWN: 'Abono de crédito',
        AR_PAYMENT: 'Cobro CxC',
        AP_PAYMENT: 'Pago CxP',
        PURCHASE_PAYMENT: 'Pago compra',
        MANUAL_ENTRY: 'Ajuste manual',
        SALE_RETURN: 'Devolución'
      };
      return {
        date: dateObj.toISOString().split('T')[0],
        time: dateObj.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        bankName: String(tx?.bankName ?? ''),
        accountLabel: String(tx?.accountLabel ?? ''),
        accountId: String(tx?.accountId ?? ''),
        source,
        sourceLabel: sourceLabelMap[source] ?? source ?? 'Movimiento',
        correlativo: String(tx?.saleCorrelativo ?? '').trim(),
        customerName: String(tx?.customerName ?? '').trim(),
        method: paymentMethodLabel(tx?.method, tx?.bankName ?? tx?.bank),
        cashier: String(tx?.actor ?? '').trim() || 'N/D',
        reference: String(tx?.reference ?? '').trim(),
        rateUsed,
        amountUSD,
        amountVES,
        runningUSD,
        runningVES
      };
    });
  }, [allBankTx, treasurySelectedBankId, treasurySelectedAccountKey, treasurySelectedBank, paymentMethodLabel, treasuryDateRange.start, treasuryDateRange.end, treasuryFlowFilter, treasuryCurrencyFilter, treasuryMethodFilter]);

  const treasuryDetailTotals = React.useMemo(() => {
    return {
      count: treasuryDetailRows.length,
      movementUSD: treasuryDetailRows.reduce((sum, row) => sum + (Number(row.amountUSD ?? 0) || 0), 0),
      movementVES: treasuryDetailRows.reduce((sum, row) => sum + (Number(row.amountVES ?? 0) || 0), 0),
      balanceUSD: treasuryDetailRows.length > 0 ? treasuryDetailRows[treasuryDetailRows.length - 1].runningUSD : 0,
      balanceVES: treasuryDetailRows.length > 0 ? treasuryDetailRows[treasuryDetailRows.length - 1].runningVES : 0
    };
  }, [treasuryDetailRows]);

  // Z-CLOSURE DATA - Sin IVA ni IGTF
  const zClosureData = React.useMemo(() => {
    const dailySales = dataService.getSales().filter((s: any) => s.timestamp.toISOString().split('T')[0] === zDate);
    const activeSales = dailySales.filter((s: any) => String((s as any).status ?? '').toUpperCase() !== 'VOID' && !(s as any).voided);
    const voidedExcluded = Math.max(0, dailySales.length - activeSales.length);
    const users = dataService.getUsers();
    const normalizeIdentity = (value: any) =>
      String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokenizeIdentity = (value: any) =>
      normalizeIdentity(value).split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const namesLikelySame = (a: any, b: any) => {
      const ta = tokenizeIdentity(a);
      const tb = tokenizeIdentity(b);
      if (ta.length === 0 || tb.length === 0) return false;
      const fullA = ta.join(' ');
      const fullB = tb.join(' ');
      if (fullA === fullB) return true;
      if (fullA.includes(fullB) || fullB.includes(fullA)) return true;
      const firstA = ta[0];
      const firstB = tb[0];
      if (firstA !== firstB) return false;
      const lastA = ta[ta.length - 1];
      const lastB = tb[tb.length - 1];
      if (!lastA || !lastB) return true;
      return lastA.slice(0, 5) === lastB.slice(0, 5);
    };
    const usersById = new Map<string, any>();
    const usersByFirebaseUid = new Map<string, any>();
    const usersByEmail = new Map<string, any>();
    users.forEach((u: any) => {
      const id = String(u?.id ?? '').trim();
      const firebaseUid = String(u?.firebaseUid ?? '').trim();
      const emailNorm = normalizeIdentity(u?.email ?? '');
      if (id) usersById.set(id, u);
      if (firebaseUid) usersByFirebaseUid.set(firebaseUid, u);
      if (emailNorm) usersByEmail.set(emailNorm, u);
    });
    const sessionWindows = dataService.getCashBoxSessions().map((session: any) => {
      const openTimeRaw = String(session?.openTime ?? '').trim();
      const closeTimeRaw = String(session?.closeTime ?? '').trim();
      const safeOpenTime = /^\d{2}:\d{2}/.test(openTimeRaw) ? openTimeRaw.slice(0, 5) : '00:00';
      const safeCloseTime = /^\d{2}:\d{2}/.test(closeTimeRaw) ? closeTimeRaw.slice(0, 5) : '23:59';
      const startMs = new Date(`${String(session?.openDate ?? '')}T${safeOpenTime}:00`).getTime();
      const closeDate = String(session?.closeDate ?? '').trim() || String(session?.openDate ?? '').trim();
      const endMs = Number.isFinite(new Date(`${closeDate}T${safeCloseTime}:59`).getTime())
        ? new Date(`${closeDate}T${safeCloseTime}:59`).getTime()
        : new Date(`${String(session?.openDate ?? '')}T23:59:59`).getTime();
      return {
        userId: String(session?.userId ?? '').trim(),
        userName: String(session?.userName ?? '').trim(),
        startMs,
        endMs
      };
    }).filter((session: any) =>
      !!session.userId
      && Number.isFinite(session.startMs)
      && Number.isFinite(session.endMs)
      && session.endMs >= session.startMs
    );
    const resolveOperatorBySessionWindow = (sale: any, preferredNames: string[] = []) => {
      const saleTime = sale?.timestamp instanceof Date
        ? sale.timestamp.getTime()
        : new Date(sale?.timestamp ?? Date.now()).getTime();
      if (!Number.isFinite(saleTime)) return null;
      const matches = sessionWindows
        .filter((session: any) => saleTime >= session.startMs && saleTime <= session.endMs);
      if (matches.length === 0) return null;
      const normalizedPreferred = preferredNames
        .map((n) => String(n ?? '').trim())
        .filter(Boolean);
      const preferredSession = matches.find((session: any) =>
        normalizedPreferred.some((name) => namesLikelySame(name, session?.userName ?? ''))
      );
      const matchedSession = preferredSession
        ?? [...matches].sort((a: any, b: any) => b.startMs - a.startMs)[0];
      if (!matchedSession) return null;
      const matchedUserId = String(matchedSession.userId ?? '').trim();
      const matchedUser = usersById.get(matchedUserId);
      return {
        userId: matchedUserId,
        name: String(matchedUser?.name ?? '').trim() || matchedSession.userName || ''
      };
    };

    const bankActorByCorrelativo = new Map<string, { actorUserId: string; actorName: string }>();
    allBankTx.forEach((tx: any) => {
      const source = String(tx?.source ?? '').toUpperCase();
      if (source !== 'SALE_PAYMENT' && source !== 'CREDIT_DOWN') return;
      const correlativo = String(tx?.saleCorrelativo ?? '').trim();
      if (!correlativo) return;
      const actorUserId = String(tx?.actorUserId ?? '').trim();
      const actorName = String(tx?.actor ?? '').trim();
      const prev = bankActorByCorrelativo.get(correlativo);
      if (!prev || (!prev.actorUserId && actorUserId) || (!prev.actorName && actorName)) {
        bankActorByCorrelativo.set(correlativo, { actorUserId, actorName });
      }
    });

    const resolveSaleOperatorIdentity = (sale: any) => {
      const saleUserIdRaw = String(sale?.userId ?? '').trim();
      const saleUserIdNorm = normalizeIdentity(saleUserIdRaw);
      const saleOperatorNameRaw = String(sale?.operatorName ?? sale?.operator ?? '').trim();
      const saleCorrelativo = String(sale?.correlativo ?? '').trim();
      const bankActor = bankActorByCorrelativo.get(saleCorrelativo);
      const bankActorUserId = String(bankActor?.actorUserId ?? '').trim();
      const bankActorUserIdNorm = normalizeIdentity(bankActorUserId);
      const bankActorName = String(bankActor?.actorName ?? '').trim();

      const directUser =
        usersById.get(saleUserIdRaw)
        || usersByFirebaseUid.get(saleUserIdRaw)
        || usersByEmail.get(saleUserIdNorm)
        || usersById.get(bankActorUserId)
        || usersByFirebaseUid.get(bankActorUserId)
        || usersByEmail.get(bankActorUserIdNorm);

      if (directUser) {
        return {
          userId: String(directUser?.id ?? '').trim(),
          name: String(directUser?.name ?? '').trim() || saleOperatorNameRaw || bankActorName || 'Sin cajero'
        };
      }

      const nameMatchUser = users.find((u: any) => {
        const userName = String(u?.name ?? '').trim();
        if (!userName) return false;
        if (saleOperatorNameRaw && namesLikelySame(userName, saleOperatorNameRaw)) return true;
        if (bankActorName && namesLikelySame(userName, bankActorName)) return true;
        return false;
      });

      if (nameMatchUser) {
        return {
          userId: String(nameMatchUser?.id ?? '').trim(),
          name: String(nameMatchUser?.name ?? '').trim() || saleOperatorNameRaw || bankActorName || 'Sin cajero'
        };
      }

      const sessionOperator = resolveOperatorBySessionWindow(sale, [saleOperatorNameRaw, bankActorName]);
      if (sessionOperator?.name) {
        return sessionOperator;
      }

      return {
        userId: saleUserIdRaw || bankActorUserId || '',
        name: saleOperatorNameRaw || bankActorName || 'Sin cajero'
      };
    };

    const salesWithOperator = activeSales.map((sale: any) => ({
      sale,
      operator: resolveSaleOperatorIdentity(sale)
    }));

    const selectedCashiers = users.filter((u) => zSelectedCashierIds.includes(String(u.id)));
    const cashierFilteredEntries = zSelectedCashierIds.length === 0
      ? salesWithOperator
      : salesWithOperator.filter((entry: any) => {
          const opUserId = String(entry?.operator?.userId ?? '').trim();
          if (opUserId && zSelectedCashierIds.includes(opUserId)) return true;
          return selectedCashiers.some((selected: any) => namesLikelySame(selected?.name ?? '', entry?.operator?.name ?? ''));
        });

    const cashierFilteredSales = cashierFilteredEntries.map((entry: any) => entry.sale);

    const availableMethods = new Set<string>();
    const byMethod: Record<string, { count: number; usd: number; ves: number }> = {};
    const detailRowsByMethod: Array<{
      method: string;
      date: string;
      time: string;
      timestampMs: number;
      correlativo: string;
      client: string;
      cashier: string;
      lineUSD: number;
      lineVES: number;
    }> = [];
    const byCashierSummaries: Record<string, { cashierName: string; salesCount: number; totalUSD: number; totalVES: number; methods: Record<string, { count: number; usd: number; ves: number }> }> = {};
    const salesIncludedByMethodFilter = new Set<string>();
    const creditSalesIncluded = new Set<string>();
    const cashSalesIncluded = new Set<string>();
    const salesWithoutMethodBreakdown = new Set<string>();
    const salesWithPaymentBreakdown: Array<{
      date: string;
      time: string;
      timestampMs: number;
      correlativo: string;
      client: string;
      cashier: string;
      totalUSD: number;
      totalVES: number;
      methodsLabel: string;
      methodsCount: number;
    }> = [];

    cashierFilteredEntries.forEach((entry: any) => {
      const sale = entry.sale;
      const operator = entry.operator ?? {};
      const cashierName = String(operator?.name ?? sale?.operatorName ?? sale?.operator ?? 'Sin cajero').trim() || 'Sin cajero';
      const paymentLines = extractSalePaymentLines(sale);
      const filteredLines = paymentLines.filter((line) => {
        const method = line.method || 'OTRO';
        availableMethods.add(method);
        return zMethodFilter === 'ALL' || method === zMethodFilter;
      });
      if (filteredLines.length === 0) return;

      const saleKey = String(sale?.id ?? sale?.correlativo ?? `${cashierName}-${sale?.timestamp?.getTime?.() ?? ''}`);
      salesIncludedByMethodFilter.add(saleKey);
      if (classifyCreditSale(sale)) creditSalesIncluded.add(saleKey);
      else cashSalesIncluded.add(saleKey);
      if (paymentLines.length === 1 && String(paymentLines[0]?.method ?? '').trim().toUpperCase() === 'SIN DESGLOSE') {
        salesWithoutMethodBreakdown.add(saleKey);
      }

      if (!byCashierSummaries[cashierName]) {
        byCashierSummaries[cashierName] = {
          cashierName,
          salesCount: 0,
          totalUSD: 0,
          totalVES: 0,
          methods: {}
        };
      }
      byCashierSummaries[cashierName].salesCount += 1;
      filteredLines.forEach((line) => {
        const method = line.method || 'OTRO';
        if (!byCashierSummaries[cashierName].methods[method]) {
          byCashierSummaries[cashierName].methods[method] = { count: 0, usd: 0, ves: 0 };
        }
        byCashierSummaries[cashierName].methods[method].count += line.count;
        byCashierSummaries[cashierName].methods[method].usd += line.amountUSD;
        byCashierSummaries[cashierName].methods[method].ves += line.amountVES;
        byCashierSummaries[cashierName].totalUSD += line.amountUSD;
        byCashierSummaries[cashierName].totalVES += line.amountVES;
      });

      filteredLines.forEach((line) => {
        const method = line.method || 'OTRO';
        if (!byMethod[method]) byMethod[method] = { count: 0, usd: 0, ves: 0 };
        byMethod[method].count += line.count;
        byMethod[method].usd += line.amountUSD;
        byMethod[method].ves += line.amountVES;
      });

      const saleDate = sale?.timestamp instanceof Date ? sale.timestamp : new Date(sale?.timestamp ?? Date.now());
      filteredLines.forEach((line) => {
        const method = String(line.method || 'OTRO');
        detailRowsByMethod.push({
          method,
          date: saleDate.toISOString().split('T')[0],
          time: saleDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
          timestampMs: saleDate.getTime(),
          correlativo: String(sale?.correlativo ?? ''),
          client: String(sale?.client?.name ?? ''),
          cashier: cashierName,
          lineUSD: Number(line.amountUSD ?? 0) || 0,
          lineVES: Number(line.amountVES ?? 0) || 0
        });
      });

      const methodsLabel = filteredLines
        .map((line) => {
          const usdValue = Number(line.amountUSD ?? 0) || 0;
          const vesValue = Number(line.amountVES ?? 0) || 0;
          const parts: string[] = [];
          if (Math.abs(usdValue) > 0.0001) parts.push(`$ ${usdValue.toFixed(2)}`);
          if (Math.abs(vesValue) > 0.0001) parts.push(`Bs ${vesValue.toFixed(2)}`);
          const amountLabel = parts.length > 0 ? ` (${parts.join(' | ')})` : '';
          return `${line.method}${amountLabel}`;
        })
        .join(' + ');

      salesWithPaymentBreakdown.push({
        date: saleDate.toISOString().split('T')[0],
        time: saleDate.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }),
        timestampMs: saleDate.getTime(),
        correlativo: String(sale?.correlativo ?? ''),
        client: String(sale?.client?.name ?? ''),
        cashier: cashierName,
        totalUSD: Number(sale?.totalUSD ?? 0) || 0,
        totalVES: Number(sale?.totalVES ?? 0) || 0,
        methodsLabel: methodsLabel || 'Sin desglose',
        methodsCount: filteredLines.length
      });
    });
    const totalUSD = Object.values(byMethod).reduce((sum, item) => sum + (Number(item.usd ?? 0) || 0), 0);
    const totalVES = Object.values(byMethod).reduce((sum, item) => sum + (Number(item.ves ?? 0) || 0), 0);
    const declaredUSD = parseFloat(cashDeclaration.usd) || 0;
    const declaredVES = parseFloat(cashDeclaration.ves) || 0;
    const methodDetailGroups = Object.entries(
      detailRowsByMethod.reduce((acc, row) => {
        if (!acc[row.method]) acc[row.method] = [];
        acc[row.method].push(row);
        return acc;
      }, {} as Record<string, typeof detailRowsByMethod>)
    )
      .map(([method, rows]) => ({
        method,
        rows: rows.sort((a, b) => {
          const byCorrelativo = compareCorrelativo(String(a.correlativo ?? ''), String(b.correlativo ?? ''));
          if (byCorrelativo !== 0) return byCorrelativo;
          return Number(a.timestampMs ?? 0) - Number(b.timestampMs ?? 0);
        }),
        totals: rows.reduce((totals, row) => ({
          count: totals.count + 1,
          usd: totals.usd + (Number(row.lineUSD ?? 0) || 0),
          ves: totals.ves + (Number(row.lineVES ?? 0) || 0)
        }), { count: 0, usd: 0, ves: 0 })
      }))
      .sort((a, b) => a.method.localeCompare(b.method));

    return {
      date: zDate,
      sales: cashierFilteredSales,
      selectedCashierNames: selectedCashiers.map((u) => String(u.name ?? '')).filter(Boolean),
      methodOptions: Array.from(availableMethods).sort((a, b) => a.localeCompare(b)),
      totals: { usd: totalUSD, ves: totalVES },
      byMethod,
      methodDetailGroups,
      byCashierSummaries: Object.values(byCashierSummaries)
        .map((summary) => ({
          ...summary,
          methodRows: Object.entries(summary.methods)
            .map(([method, data]) => ({ method, ...(data as any) }))
            .sort((a, b) => (Number(b.usd ?? 0) - Number(a.usd ?? 0)))
        }))
        .sort((a, b) => Number(b.totalUSD ?? 0) - Number(a.totalUSD ?? 0)),
      salesDetailRows: salesWithPaymentBreakdown.sort((a, b) => {
        const t = Number(b.timestampMs ?? 0) - Number(a.timestampMs ?? 0);
        if (t !== 0) return t;
        return compareCorrelativo(String(a.correlativo ?? ''), String(b.correlativo ?? ''));
      }),
      counts: {
        total: salesIncludedByMethodFilter.size,
        credit: creditSalesIncluded.size,
        cash: cashSalesIncluded.size,
        withoutBreakdown: salesWithoutMethodBreakdown.size,
        voidedExcluded
      },
      variance: { usd: declaredUSD - totalUSD, ves: declaredVES - totalVES, hasDeclaration: cashDeclaration.usd !== '' || cashDeclaration.ves !== '' }
    };
  }, [zDate, zSelectedCashierIds, zMethodFilter, cashDeclaration, extractSalePaymentLines, allBankTx, classifyCreditSale]);

  React.useEffect(() => {
    const methodOptions = Array.isArray((zClosureData as any).methodOptions) ? (zClosureData as any).methodOptions : [];
    if (zMethodFilter === 'ALL') return;
    if (!methodOptions.includes(zMethodFilter)) {
      setZMethodFilter('ALL');
    }
  }, [zMethodFilter, zClosureData]);

  // PURCHASES TAB DATA
  const filteredPurchases = React.useMemo(() => {
    const ap = dataService.getAPEntries();
    return ap.filter(e => {
      const d = e.timestamp.toISOString().split('T')[0];
      const dateOk = d >= purchaseDateRange.start && d <= purchaseDateRange.end;
      const term = purchaseSearch.trim().toUpperCase();
      const searchOk = !term || String(e.supplier ?? '').toUpperCase().includes(term) || String(e.description ?? '').toUpperCase().includes(term);
      return dateOk && searchOk;
    }).sort((a, b) => {
      const dt = b.timestamp.getTime() - a.timestamp.getTime();
      if (dt !== 0) return dt;
      return compareCorrelativo(a.id, b.id);
    });
  }, [purchaseSearch, purchaseDateRange]);

  const purchaseBookExportRows = React.useMemo(() => {
    const source = purchaseInvoiceHistory.length > 0
      ? purchaseInvoiceHistory.map((entry) => {
          const rawDate = entry.invoiceDate || entry.createdAt || '';
          const timestamp = rawDate
            ? new Date(String(rawDate).includes('T') ? rawDate : `${String(rawDate).slice(0, 10)}T12:00:00`)
            : new Date(0);
          return {
            timestamp,
            supplier: entry.supplier,
            description: entry.invoiceNumber ? `Factura ${entry.invoiceNumber}` : entry.invoiceGroupId,
            operator: String(entry.operatorName ?? '').trim() || 'SISTEMA',
            amountUSD: Number(entry.totalInvoiceUSD ?? 0) || 0,
            status: entry.status,
            lines: entry.lines,
            productDetails: formatInvoiceProductDetails(entry.lines)
          };
        })
      : filteredPurchases.map((entry: any) => ({
          timestamp: entry.timestamp,
          supplier: entry.supplier,
          description: entry.description,
          operator: String((entry as any).createdBy ?? '').trim() || 'SISTEMA',
          amountUSD: Number(entry.amountUSD ?? 0) || 0,
          status: entry.status,
          lines: [],
          productDetails: String(entry.description ?? '')
        }));

    const term = purchaseSearch.trim().toUpperCase();
    return source.filter((row) => {
      const d = row.timestamp instanceof Date && !Number.isNaN(row.timestamp.getTime())
        ? row.timestamp.toISOString().slice(0, 10)
        : '';
      const dateOk = d >= purchaseDateRange.start && d <= purchaseDateRange.end;
      const searchOk = !term
        || String(row.supplier ?? '').toUpperCase().includes(term)
        || String(row.description ?? '').toUpperCase().includes(term)
        || String(row.productDetails ?? '').toUpperCase().includes(term);
      return dateOk && searchOk;
    }).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [purchaseInvoiceHistory, filteredPurchases, purchaseSearch, purchaseDateRange]);

  // EXPENSES TAB DATA
  const filteredExpenses = React.useMemo(() => {
    const expenses = dataService.getExpenses();
    return expenses.filter(e => {
      const d = e.timestamp.toISOString().split('T')[0];
      const dateOk = d >= expenseDateRange.start && d <= expenseDateRange.end;
      const catOk = expenseCategory === 'ALL' || e.category === expenseCategory;
      return dateOk && catOk;
    }).sort((a, b) => {
      const dt = b.timestamp.getTime() - a.timestamp.getTime();
      if (dt !== 0) return dt;
      return compareCorrelativo(a.id, b.id);
    });
  }, [expenseCategory, expenseDateRange]);

  // SHRINKAGE DATA
  const shrinkageStats = React.useMemo(() => {
    const movements = dataService.getMovements();
    const mermas = movements.filter(m => m.type === 'MERMA_NATURAL' || m.type === 'MERMA_MANIP');
    const byProduct: Record<string, { description: string; natural: number; manip: number; total: number }> = {};
    mermas.forEach(m => {
      const stock = dataService.getStocks().find(s => s.code === m.sku);
      if (!byProduct[m.sku]) byProduct[m.sku] = { description: stock?.description ?? m.sku, natural: 0, manip: 0, total: 0 };
      const qty = Math.abs(m.qty || 0);
      if (m.type === 'MERMA_NATURAL') byProduct[m.sku].natural += qty;
      else byProduct[m.sku].manip += qty;
      byProduct[m.sku].total += qty;
    });
    return {
      byProduct: Object.values(byProduct).sort((a, b) => b.total - a.total),
      totalNatural: mermas.filter(m => m.type === 'MERMA_NATURAL').reduce((a, b) => a + Math.abs(b.qty || 0), 0),
      totalManip: mermas.filter(m => m.type === 'MERMA_MANIP').reduce((a, b) => a + Math.abs(b.qty || 0), 0),
      count: mermas.length
    };
  }, []);

  // KPI COMPARISON (vs 7 days prior)
  const prevPeriodStats = React.useMemo(() => {
    const sales = dataService.getSales();
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - 14);
    const mid  = new Date(now); mid.setDate(mid.getDate() - 7);
    const current = sales.filter(s => s.timestamp >= mid && s.timestamp <= now);
    const prev    = sales.filter(s => s.timestamp >= start && s.timestamp < mid);
    const currentUSD = current.reduce((a, b) => a + b.totalUSD, 0);
    const prevUSD    = prev.reduce((a, b) => a + b.totalUSD, 0);
    const pct = prevUSD > 0 ? ((currentUSD - prevUSD) / prevUSD) * 100 : 0;
    return { currentUSD, prevUSD, pct, up: pct >= 0 };
  }, []);

  // Payment method distribution (REP-09) — alineado con filtros del libro de ventas
  const methodDist = React.useMemo(() => {
    const dist: Record<string, number> = {};
    filteredSales.forEach((s: any) => {
      if (s.status === 'VOID' || s.voided) return;
      const m = String(s.paymentMethod || 'OTRO').toUpperCase();
      dist[m] = (dist[m] || 0) + Number(s.totalUSD ?? 0);
    });
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    return Object.entries(dist)
      .map(([method, usd]) => ({ method, usd, pct: total > 0 ? (usd / total) * 100 : 0 }))
      .sort((a, b) => b.usd - a.usd);
  }, [filteredSales]);

  // REPORT-01: Cashier billing report calculations
  const cashierReportData = React.useMemo(() => {
    const sales = dataService.getSales();
    const users = dataService.getUsers();
    const normalizeIdentity = (value: any) =>
      String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const tokenizeIdentity = (value: any) =>
      normalizeIdentity(value).split(/\s+/).map((token) => token.trim()).filter(Boolean);
    const namesLikelySame = (a: any, b: any) => {
      const ta = tokenizeIdentity(a);
      const tb = tokenizeIdentity(b);
      if (ta.length === 0 || tb.length === 0) return false;
      const fullA = ta.join(' ');
      const fullB = tb.join(' ');
      if (fullA === fullB) return true;
      if (fullA.includes(fullB) || fullB.includes(fullA)) return true;
      const firstA = ta[0];
      const firstB = tb[0];
      if (firstA !== firstB) return false;
      const lastA = ta[ta.length - 1];
      const lastB = tb[tb.length - 1];
      if (!lastA || !lastB) return true;
      // Tolera diferencias pequeñas de apellido (Herrero/Herrera, etc.).
      return lastA.slice(0, 5) === lastB.slice(0, 5);
    };
    
    const usersById = new Map<string, any>();
    const usersByFirebaseUid = new Map<string, any>();
    const usersByEmail = new Map<string, any>();
    users.forEach((u: any) => {
      const id = String(u?.id ?? '').trim();
      const firebaseUid = String(u?.firebaseUid ?? '').trim();
      const emailNorm = normalizeIdentity(u?.email ?? '');
      if (id) usersById.set(id, u);
      if (firebaseUid) usersByFirebaseUid.set(firebaseUid, u);
      if (emailNorm) usersByEmail.set(emailNorm, u);
    });
    const sessionWindows = dataService.getCashBoxSessions().map((session: any) => {
      const openTimeRaw = String(session?.openTime ?? '').trim();
      const closeTimeRaw = String(session?.closeTime ?? '').trim();
      const safeOpenTime = /^\d{2}:\d{2}/.test(openTimeRaw) ? openTimeRaw.slice(0, 5) : '00:00';
      const safeCloseTime = /^\d{2}:\d{2}/.test(closeTimeRaw) ? closeTimeRaw.slice(0, 5) : '23:59';
      const startMs = new Date(`${String(session?.openDate ?? '')}T${safeOpenTime}:00`).getTime();
      const closeDate = String(session?.closeDate ?? '').trim() || String(session?.openDate ?? '').trim();
      const endMs = Number.isFinite(new Date(`${closeDate}T${safeCloseTime}:59`).getTime())
        ? new Date(`${closeDate}T${safeCloseTime}:59`).getTime()
        : new Date(`${String(session?.openDate ?? '')}T23:59:59`).getTime();
      return {
        userId: String(session?.userId ?? '').trim(),
        userName: String(session?.userName ?? '').trim(),
        startMs,
        endMs
      };
    }).filter((session: any) =>
      !!session.userId
      && Number.isFinite(session.startMs)
      && Number.isFinite(session.endMs)
      && session.endMs >= session.startMs
    );
    const resolveOperatorBySessionWindow = (sale: any, preferredNames: string[] = []) => {
      const saleTime = sale?.timestamp instanceof Date
        ? sale.timestamp.getTime()
        : new Date(sale?.timestamp ?? Date.now()).getTime();
      if (!Number.isFinite(saleTime)) return null;
      const matches = sessionWindows
        .filter((session: any) => saleTime >= session.startMs && saleTime <= session.endMs);
      if (matches.length === 0) return null;
      const normalizedPreferred = preferredNames
        .map((n) => String(n ?? '').trim())
        .filter(Boolean);
      const preferredSession = matches.find((session: any) =>
        normalizedPreferred.some((name) => namesLikelySame(name, session?.userName ?? ''))
      );
      const matchedSession = preferredSession
        ?? [...matches].sort((a: any, b: any) => b.startMs - a.startMs)[0];
      if (!matchedSession) return null;
      const matchedUserId = String(matchedSession.userId ?? '').trim();
      const matchedUser = usersById.get(matchedUserId);
      return {
        userId: matchedUserId,
        firebaseUid: String(matchedUser?.firebaseUid ?? '').trim(),
        emailNorm: normalizeIdentity(matchedUser?.email ?? ''),
        name: String(matchedUser?.name ?? '').trim() || matchedSession.userName || '',
        nameNorm: normalizeIdentity(matchedUser?.name ?? '') || normalizeIdentity(matchedSession.userName ?? ''),
        source: 'SESSION_WINDOW',
        sourceDetail: 'cashbox_sessions'
      };
    };

    const bankActorByCorrelativo = new Map<string, { actorUserId: string; actorName: string }>();
    allBankTx.forEach((tx: any) => {
      const source = String(tx?.source ?? '').toUpperCase();
      if (source !== 'SALE_PAYMENT' && source !== 'CREDIT_DOWN') return;
      const correlativo = String(tx?.saleCorrelativo ?? '').trim();
      if (!correlativo) return;
      const actorUserId = String(tx?.actorUserId ?? '').trim();
      const actorName = String(tx?.actor ?? '').trim();
      const prev = bankActorByCorrelativo.get(correlativo);
      if (!prev || (!prev.actorUserId && actorUserId) || (!prev.actorName && actorName)) {
        bankActorByCorrelativo.set(correlativo, { actorUserId, actorName });
      }
    });

    const resolveSaleOperatorIdentity = (sale: any) => {
      const saleUserIdRaw = String(sale?.userId ?? '').trim();
      const saleUserIdNorm = normalizeIdentity(saleUserIdRaw);
      const saleOperatorNameRaw = String(sale?.operatorName ?? sale?.operator ?? '').trim();
      const saleOperatorNameNorm = normalizeIdentity(saleOperatorNameRaw);
      const saleCorrelativo = String(sale?.correlativo ?? '').trim();
      const bankActor = bankActorByCorrelativo.get(saleCorrelativo);
      const bankActorUserId = String(bankActor?.actorUserId ?? '').trim();
      const bankActorUserIdNorm = normalizeIdentity(bankActorUserId);
      const bankActorName = String(bankActor?.actorName ?? '').trim();
      const bankActorNameNorm = normalizeIdentity(bankActorName);

      const directUser =
        usersById.get(saleUserIdRaw)
        || usersByFirebaseUid.get(saleUserIdRaw)
        || usersByEmail.get(saleUserIdNorm)
        || usersById.get(bankActorUserId)
        || usersByFirebaseUid.get(bankActorUserId)
        || usersByEmail.get(bankActorUserIdNorm);

      if (directUser) {
        return {
          userId: String(directUser?.id ?? '').trim(),
          firebaseUid: String(directUser?.firebaseUid ?? '').trim(),
          emailNorm: normalizeIdentity(directUser?.email ?? ''),
          name: String(directUser?.name ?? '').trim() || saleOperatorNameRaw || bankActorName || 'Sin cajero',
          nameNorm: normalizeIdentity(directUser?.name ?? '') || saleOperatorNameNorm || bankActorNameNorm,
          source: 'DIRECTORY_MATCH',
          sourceDetail: saleUserIdRaw
            ? 'sale.userId'
            : bankActorUserId
            ? 'bank_transactions.actorUserId'
            : 'identidad relacionada'
        };
      }

      const nameMatchUser = users.find((u: any) => {
        const userName = String(u?.name ?? '').trim();
        if (!userName) return false;
        if (saleOperatorNameRaw && namesLikelySame(userName, saleOperatorNameRaw)) return true;
        if (bankActorName && namesLikelySame(userName, bankActorName)) return true;
        return false;
      });

      if (nameMatchUser) {
        return {
          userId: String(nameMatchUser?.id ?? '').trim(),
          firebaseUid: String(nameMatchUser?.firebaseUid ?? '').trim(),
          emailNorm: normalizeIdentity(nameMatchUser?.email ?? ''),
          name: String(nameMatchUser?.name ?? '').trim() || saleOperatorNameRaw || bankActorName || 'Sin cajero',
          nameNorm: normalizeIdentity(nameMatchUser?.name ?? '') || saleOperatorNameNorm || bankActorNameNorm,
          source: 'NAME_MATCH',
          sourceDetail: saleOperatorNameRaw
            ? 'sale.operatorName'
            : bankActorName
            ? 'bank_transactions.actor'
            : 'nombre aproximado'
        };
      }

      const sessionOperator = resolveOperatorBySessionWindow(sale, [saleOperatorNameRaw, bankActorName]);
      if (sessionOperator?.name) {
        return sessionOperator;
      }

      return {
        userId: saleUserIdRaw || bankActorUserId || '',
        firebaseUid: '',
        emailNorm: '',
        name: saleOperatorNameRaw || bankActorName || 'Sin cajero',
        nameNorm: saleOperatorNameNorm || bankActorNameNorm || normalizeIdentity('Sin cajero'),
        source: 'RAW_FALLBACK',
        sourceDetail: saleOperatorNameRaw
          ? 'sale.operatorName'
          : bankActorName
          ? 'bank_transactions.actor'
          : 'sin identidad'
      };
    };

    // Filtrar ventas por fecha seleccionada
    const salesWithIdentity = sales
      .filter((s) => {
        const saleDate = s.timestamp.toISOString().split('T')[0];
        return saleDate === cashierReportDate;
      })
      .map((sale: any) => ({
        sale,
        operator: resolveSaleOperatorIdentity(sale)
      }));
    
    // Si hay cajero seleccionado, filtrar por cajero
    const selectedCashier = users.find((u) => String(u.id) === String(selectedCashierId));
    const selectedCashierNameNorm = normalizeIdentity(selectedCashier?.name ?? '');
    const selectedCashierFirebaseUid = String((selectedCashier as any)?.firebaseUid ?? '').trim();
    const selectedCashierEmail = normalizeIdentity((selectedCashier as any)?.email ?? '');
    const cashierSales = selectedCashierId === 'ALL'
      ? salesWithIdentity
      : salesWithIdentity.filter((entry: any) => {
          const operator = entry.operator ?? {};
          const resolvedUserId = String(operator.userId ?? '').trim();
          const resolvedFirebaseUid = String(operator.firebaseUid ?? '').trim();
          const resolvedEmail = normalizeIdentity(operator.emailNorm ?? '');
          const resolvedName = String(operator.name ?? '').trim();
          const resolvedNameNorm = normalizeIdentity(operator.nameNorm ?? resolvedName);

          // Prioridad 1: IDs técnicos
          if (resolvedUserId && resolvedUserId === selectedCashierId) return true;
          if (resolvedFirebaseUid && selectedCashierFirebaseUid && resolvedFirebaseUid === selectedCashierFirebaseUid) return true;

          // Prioridad 2: email normalizado
          if (resolvedEmail && selectedCashierEmail && resolvedEmail === selectedCashierEmail) return true;

          // Prioridad 3: nombre normalizado / fuzzy
          if (selectedCashierNameNorm && resolvedNameNorm && resolvedNameNorm === selectedCashierNameNorm) return true;
          if (selectedCashier?.name && resolvedName && namesLikelySame(selectedCashier.name, resolvedName)) return true;

          return false;
        });
    
    // Agrupar por cajero
    type IdentityAuditRow = {
      invoiceDate: string;
      correlativo: string;
      cashierResolved: string;
      identitySource: string;
      identityDetail: string;
      saleUserId: string;
      saleOperatorName: string;
      bankActorUserId: string;
      bankActorName: string;
    };
    type ProductSummary = { code: string; description: string; qty: number; unit: string };
    type PaymentMethodSummary = { 
      method: string;
      amountUSD: number;
      amountVES: number;
      count: number;
    };
    type InvoicePaymentLine = {
      method: string;
      amountUSD: number;
      amountVES: number;
      count: number;
      rateUsed: number;
      reference: string;
    };
    type CashierInvoiceSummary = {
      id: string;
      correlativo: string;
      clientName: string;
      timestamp: Date;
      totalUSD: number;
      totalVES: number;
      bcvRate: number;
      internalRate: number;
      paymentLines: InvoicePaymentLine[];
    };
    type CashierSummary = { 
      name: string; 
      salesCount: number; 
      totalUSD: number;
      totalVES: number;
      products: Record<string, ProductSummary>;
      paymentMethods: Record<string, PaymentMethodSummary>;
      invoices: CashierInvoiceSummary[];
    };
    
    const byCashier: Record<string, CashierSummary> = {};
    const identityAuditRows: IdentityAuditRow[] = [];
    
    // Totales globales de métodos de pago
    const globalPaymentMethods: Record<string, PaymentMethodSummary> = {};
    
    cashierSales.forEach((entry: any) => {
      const sale = entry.sale;
      const operator = entry.operator ?? {};
      const cashierName = String(operator.name ?? sale.operatorName ?? sale.operator ?? 'Sin cajero').trim() || 'Sin cajero';
      const saleDateIso = sale?.timestamp instanceof Date
        ? sale.timestamp.toISOString().split('T')[0]
        : new Date(sale?.timestamp ?? Date.now()).toISOString().split('T')[0];
      const bankActor = bankActorByCorrelativo.get(String(sale?.correlativo ?? '').trim());
      identityAuditRows.push({
        invoiceDate: saleDateIso,
        correlativo: String(sale?.correlativo ?? ''),
        cashierResolved: cashierName,
        identitySource: String(operator.source ?? 'RAW_FALLBACK'),
        identityDetail: String(operator.sourceDetail ?? ''),
        saleUserId: String(sale?.userId ?? '').trim(),
        saleOperatorName: String(sale?.operatorName ?? sale?.operator ?? '').trim(),
        bankActorUserId: String(bankActor?.actorUserId ?? '').trim(),
        bankActorName: String(bankActor?.actorName ?? '').trim()
      });
      if (!byCashier[cashierName]) {
        byCashier[cashierName] = { 
          name: cashierName, 
          salesCount: 0, 
          totalUSD: 0,
          totalVES: 0,
          products: {},
          paymentMethods: {},
          invoices: []
        };
      }
      
      byCashier[cashierName].salesCount++;
      byCashier[cashierName].totalUSD += sale.totalUSD || 0;
      byCashier[cashierName].totalVES += sale.totalVES || 0;
      
      // Agregar productos vendidos
      (sale.items || []).forEach(item => {
        const code = String(item.code || 'N/A');
        if (!byCashier[cashierName].products[code]) {
          byCashier[cashierName].products[code] = {
            code,
            description: String(item.description || code),
            qty: 0,
            unit: String(item.unit || 'unid')
          };
        }
        byCashier[cashierName].products[code].qty += Number(item.qty || 0);
      });
      
      // Agregar métodos de pago (soporta ventas mixtas por línea de pago)
      const paymentLines = extractSalePaymentLines(sale);
      const bcvRate = Number((sale as any)?.exchangeRate ?? 0) || 0;
      const inferredLineRate = paymentLines.find((line) => Number(line?.rateUsed ?? 0) > 0)?.rateUsed ?? 0;
      const internalRate = Number((sale as any)?.creditMeta?.rateInternal ?? inferredLineRate ?? bcvRate ?? 0) || 0;
      byCashier[cashierName].invoices.push({
        id: String((sale as any).id ?? `${sale.correlativo}-${sale.timestamp.getTime()}`),
        correlativo: String(sale.correlativo ?? ''),
        clientName: String((sale as any)?.client?.name ?? 'Sin cliente'),
        timestamp: sale.timestamp instanceof Date ? sale.timestamp : new Date(sale.timestamp),
        totalUSD: Number(sale.totalUSD ?? 0) || 0,
        totalVES: Number(sale.totalVES ?? 0) || 0,
        bcvRate,
        internalRate,
        paymentLines: paymentLines.map((line) => ({
          method: String(line.method ?? 'Otro'),
          amountUSD: Number(line.amountUSD ?? 0) || 0,
          amountVES: Number(line.amountVES ?? 0) || 0,
          count: Number(line.count ?? 1) || 1,
          rateUsed: Number(line.rateUsed ?? 0) || 0,
          reference: String(line.reference ?? '').trim()
        }))
      });
      paymentLines.forEach((line) => {
        const methodLabel = line.method;
        const amountUSD = line.amountUSD;
        const amountVES = line.amountVES;

        if (!byCashier[cashierName].paymentMethods[methodLabel]) {
          byCashier[cashierName].paymentMethods[methodLabel] = {
            method: methodLabel,
            amountUSD: 0,
            amountVES: 0,
            count: 0
          };
        }
        byCashier[cashierName].paymentMethods[methodLabel].amountUSD += amountUSD;
        byCashier[cashierName].paymentMethods[methodLabel].amountVES += amountVES;
        byCashier[cashierName].paymentMethods[methodLabel].count += line.count;

        if (!globalPaymentMethods[methodLabel]) {
          globalPaymentMethods[methodLabel] = {
            method: methodLabel,
            amountUSD: 0,
            amountVES: 0,
            count: 0
          };
        }
        globalPaymentMethods[methodLabel].amountUSD += amountUSD;
        globalPaymentMethods[methodLabel].amountVES += amountVES;
        globalPaymentMethods[methodLabel].count += line.count;
      });
    });
    
    // Calcular totales generales
    const totalUSD = cashierSales.reduce((a, entry: any) => a + (entry?.sale?.totalUSD || 0), 0);
    const totalVES = cashierSales.reduce((a, entry: any) => a + (entry?.sale?.totalVES || 0), 0);
    const totalCount = cashierSales.length;
    
    // Productos totales del día (para vista general)
    const totalProducts: Record<string, ProductSummary> = {};
    cashierSales.forEach((entry: any) => {
      const sale = entry.sale;
      (sale.items || []).forEach(item => {
        const code = String(item.code || 'N/A');
        if (!totalProducts[code]) {
          totalProducts[code] = {
            code,
            description: String(item.description || code),
            qty: 0,
            unit: String(item.unit || 'unid')
          };
        }
        totalProducts[code].qty += Number(item.qty || 0);
      });
    });
    
    return {
      cashiers: Object.values(byCashier)
        .map((cashier) => ({
          ...cashier,
          invoices: [...cashier.invoices].sort((a, b) => {
            const dt = b.timestamp.getTime() - a.timestamp.getTime();
            if (dt !== 0) return dt;
            return compareCorrelativo(a.correlativo, b.correlativo);
          })
        }))
        .sort((a, b) => b.totalUSD - a.totalUSD),
      totalUSD,
      totalVES,
      totalCount,
      totalProducts: Object.values(totalProducts).sort((a, b) => b.qty - a.qty),
      globalPaymentMethods: Object.values(globalPaymentMethods).sort((a, b) => b.amountUSD - a.amountUSD),
      identityAuditRows: [...identityAuditRows].sort((a, b) =>
        compareCorrelativo(String(b.correlativo ?? ''), String(a.correlativo ?? ''))
      ),
      date: cashierReportDate
    };
  }, [cashierReportDate, selectedCashierId, extractSalePaymentLines, allBankTx, tick]);

  const cashierInvoiceExportRows = React.useMemo(() => {
    return cashierReportData.cashiers.flatMap((cashier: any) =>
      (Array.isArray(cashier.invoices) ? cashier.invoices : []).flatMap((invoice: any) => {
        const ts = invoice?.timestamp ? new Date(invoice.timestamp) : null;
        const lines = Array.isArray(invoice?.paymentLines) && invoice.paymentLines.length > 0
          ? invoice.paymentLines
          : [{ method: 'Sin desglose', amountUSD: 0, amountVES: 0, rateUsed: 0 }];
        return lines.map((line: any) => ({
          cashier: String(cashier.name ?? ''),
          invoiceDate: ts ? ts.toISOString().split('T')[0] : '',
          invoiceTime: ts ? ts.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : '',
          correlativo: String(invoice?.correlativo ?? ''),
          client: String(invoice?.clientName ?? ''),
          paymentMethod: String(line?.method ?? 'Sin desglose'),
          paymentUSD: Number(line?.amountUSD ?? 0) || 0,
          paymentVES: Number(line?.amountVES ?? 0) || 0,
          reference: String(line?.reference ?? '').trim(),
          lineRate: Number(line?.rateUsed ?? 0) || 0,
          bcvRate: Number(invoice?.bcvRate ?? 0) || 0,
          internalRate: Number(invoice?.internalRate ?? 0) || 0,
          invoiceTotalUSD: Number(invoice?.totalUSD ?? 0) || 0,
          invoiceTotalVES: Number(invoice?.totalVES ?? 0) || 0
        }));
      })
    );
  }, [cashierReportData]);

  const cashierDetailMethodOptions = React.useMemo(() => {
    const methods = new Set<string>();
    cashierInvoiceExportRows.forEach((row) => methods.add(String(row.paymentMethod ?? 'Sin desglose')));
    return Array.from(methods).sort((a, b) => a.localeCompare(b));
  }, [cashierInvoiceExportRows]);

  const cashierVesMethods = React.useMemo(() => new Set([
    'Efectivo Bs',
    'Pago Móvil',
    'Transferencia',
    'Débito',
    'Biopago'
  ]), []);

  const cashierUsdMethods = React.useMemo(() => new Set([
    'Efectivo USD',
    'Zelle',
    'Binance',
    'USD Digital'
  ]), []);

  const cashierSelectedMethodKind = React.useMemo<'ALL' | 'VES' | 'USD' | 'OTHER'>(() => {
    if (cashierMethodFilter === 'ALL') return 'ALL';
    if (cashierVesMethods.has(cashierMethodFilter)) return 'VES';
    if (cashierUsdMethods.has(cashierMethodFilter)) return 'USD';
    return 'OTHER';
  }, [cashierMethodFilter, cashierVesMethods, cashierUsdMethods]);

  const methodRequiresReference = React.useCallback((methodRaw: string): boolean => {
    const token = normalizePaymentToken(methodRaw).replace(/\s+/g, '_');
    if (!token) return false;
    return (
      token.includes('pago_movil') ||
      token.includes('transfer') ||
      token.includes('debit') ||
      token.includes('biopago') ||
      token.includes('zelle') ||
      token.includes('binance') ||
      token.includes('digital')
    );
  }, [normalizePaymentToken]);

  React.useEffect(() => {
    if (cashierMethodFilter === 'ALL') return;
    if (!cashierDetailMethodOptions.includes(cashierMethodFilter)) {
      setCashierMethodFilter('ALL');
    }
  }, [cashierMethodFilter, cashierDetailMethodOptions]);

  const cashierDetailRows = React.useMemo(() => {
    const baseRows = cashierInvoiceExportRows.filter((row) => (
      cashierMethodFilter === 'ALL' || String(row.paymentMethod) === cashierMethodFilter
    ));
    return baseRows.map((row) => {
      const rawVesAmount = Number(row.paymentVES ?? 0) || 0;
      const rawUsdAmount = Number(row.paymentUSD ?? 0) || 0;
      const methodToken = normalizePaymentToken(row.paymentMethod).replace(/\s+/g, '_');
      const isVesMethod =
        cashierVesMethods.has(String(row.paymentMethod ?? ''))
        || methodToken.includes('efectivo_bs')
        || methodToken.includes('efectivo_ves')
        || methodToken.includes('pago_movil')
        || methodToken.includes('transfer')
        || methodToken.includes('debit')
        || methodToken.includes('biopago');
      const forceUsdOnlyMethod =
        cashierUsdMethods.has(String(row.paymentMethod ?? ''))
        || String(row.paymentMethod ?? '') === 'Efectivo USD'
        || methodToken.includes('efectivo_usd')
        || methodToken.includes('cxp')
        || methodToken.includes('credito');
      // Regla solicitada para REP Factura x Cajero:
      // cobros en USD efectivo o CxP no deben contaminar columna/total Bs.
      const vesAmount = forceUsdOnlyMethod ? 0 : rawVesAmount;
      const usdAmount = rawUsdAmount;
      const lineRate = Number(row.lineRate ?? 0) || 0;
      const bcvRate = Number(row.bcvRate ?? 0) || 0;
      const internalRate = Number(row.internalRate ?? 0) || 0;

      const selectedRate = cashierDetailRateMode === 'BCV'
        ? bcvRate
        : cashierDetailRateMode === 'INTERNAL'
        ? internalRate
        : lineRate;

      // Regla contable para detalle por cajero:
      // si la línea ya trae USD explícito (p.ej. CxP en USD), ese es el valor real.
      // Solo convertir desde Bs cuando no exista monto USD en la línea.
      const hasUsdAmount = Math.abs(usdAmount) > 0.0001 && !isVesMethod;
      // "Equiv USD" en este reporte ahora representa solo salida/cobro real en USD.
      // No convierte líneas en Bs para esta columna.
      const equivalentUSD = hasUsdAmount ? usdAmount : 0;

      // Separación estricta por moneda:
      // - USD real: solo lo que venga explícitamente en amountUSD.
      // - Bs real: en amountVES.
      // No mezclar para el total principal USD.
      const usdReceived = hasUsdAmount ? usdAmount : 0;
      const netUSD = usdReceived + (vesAmount > 0 && selectedRate > 0 ? (vesAmount / selectedRate) : 0);

      return {
        ...row,
        paymentVES: vesAmount,
        appliedRate: selectedRate,
        equivalentUSD,
        usdReceived,
        netUSD
      };
    });
  }, [cashierInvoiceExportRows, cashierMethodFilter, cashierDetailRateMode, normalizePaymentToken, cashierUsdMethods, cashierVesMethods]);

  const cashierDetailTotals = React.useMemo(() => {
    const totalVES = cashierDetailRows.reduce((sum, row) => sum + (Number(row.paymentVES ?? 0) || 0), 0);
    const totalEquivalentUSD = cashierDetailRows.reduce((sum, row) => sum + (Number(row.equivalentUSD ?? 0) || 0), 0);
    const totalUSDReceived = cashierDetailRows.reduce((sum, row) => sum + (Number(row.usdReceived ?? 0) || 0), 0);
    const totalNetUSD = cashierDetailRows.reduce((sum, row) => sum + (Number((row as any).netUSD ?? 0) || 0), 0);
    return {
      count: cashierDetailRows.length,
      totalVES,
      totalEquivalentUSD,
      totalUSDReceived,
      totalNetUSD
    };
  }, [cashierDetailRows]);

  const cashierGlobalMethodsView = React.useMemo(() => {
    if (cashierMethodFilter === 'ALL') return cashierReportData.globalPaymentMethods;
    return cashierReportData.globalPaymentMethods.filter((pm) => String(pm.method) === cashierMethodFilter);
  }, [cashierReportData.globalPaymentMethods, cashierMethodFilter]);

  const advanceDateBounds = React.useMemo(() => {
    const start = new Date(`${advanceDateRange.start}T00:00:00`);
    const end = new Date(`${advanceDateRange.end}T23:59:59.999`);
    return { start, end };
  }, [advanceDateRange.start, advanceDateRange.end]);

  const reportClientAdvancesRows = React.useMemo(() => {
    const { start, end } = advanceDateBounds;
    const q = advanceSearch.trim().toLowerCase();
    return (dataService.getAllClientAdvances() as ClientAdvance[])
      .filter((a) => {
        const ts = new Date(a.createdAt);
        if (Number.isNaN(ts.getTime()) || ts < start || ts > end) return false;
        if (!advancesIncludeApplied && a.status === 'APPLIED') return false;
        if (!q) return true;
        const hay = [
          a.customerName,
          a.customerId,
          a.originCorrelativo,
          a.originInvoiceId,
          a.note ?? '',
          a.id
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [tick, advanceDateBounds, advanceSearch, advancesIncludeApplied]);

  const reportSupplierAdvancesRows = React.useMemo(() => {
    const { start, end } = advanceDateBounds;
    const q = advanceSearch.trim().toLowerCase();
    return supplierAdvancesForReport.filter((a) => {
      const ts = new Date(a.createdAt);
      if (Number.isNaN(ts.getTime()) || ts < start || ts > end) return false;
      if (!q) return true;
      const hay = [
        a.supplierName,
        a.supplierId ?? '',
        a.reference,
        a.note ?? '',
        a.id
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }, [supplierAdvancesForReport, advanceDateBounds, advanceSearch]);

  const advancesClientTotals = React.useMemo(
    () => ({
      count: reportClientAdvancesRows.length,
      originalUSD: reportClientAdvancesRows.reduce((s, a) => s + (Number(a.amountUSD) || 0), 0),
      balanceUSD: reportClientAdvancesRows.reduce((s, a) => s + (Number(a.balanceUSD) || 0), 0)
    }),
    [reportClientAdvancesRows]
  );

  const advancesSupplierTotals = React.useMemo(
    () => ({
      count: reportSupplierAdvancesRows.length,
      originalUSD: reportSupplierAdvancesRows.reduce((s, a) => s + (Number(a.amountUSD) || 0), 0),
      balanceUSD: reportSupplierAdvancesRows.reduce((s, a) => s + (Number(a.balanceUSD) || 0), 0)
    }),
    [reportSupplierAdvancesRows]
  );

  React.useEffect(() => {
    if (activeTab !== 'advances' || advancesReportKind !== 'supplier') {
      setLoadingAdvancesReport(false);
      return;
    }
    let cancelled = false;
    setLoadingAdvancesReport(true);
    dataService
      .getAllSupplierAdvancesForAdmin(advancesIncludeApplied)
      .then((list) => {
        if (!cancelled) {
          setSupplierAdvancesForReport(Array.isArray(list) ? list : []);
        }
      })
      .catch(() => {
        if (!cancelled) setSupplierAdvancesForReport([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingAdvancesReport(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, advancesReportKind, advancesIncludeApplied, advancesRefreshKey]);

  const tabs = [
    { key: 'overview',   label: 'Visión General',  icon: BarChart },
    { key: 'sales',      label: 'Ventas',          icon: ShoppingBag },
    { key: 'profit',     label: 'Utilidad vendida', icon: CircleDollarSign },
    { key: 'margins',    label: 'Márgenes',         icon: Package },
    { key: 'inventory',  label: 'Inventario',        icon: Package },
    { key: 'treasury',   label: 'Tesorería',        icon: Wallet },
    { key: 'purchases',  label: 'Libro Compras',    icon: Truck },
    { key: 'expenses',   label: 'Egresos',          icon: TrendingDown },
    { key: 'advances',   label: 'Anticipos',        icon: CreditCard },
    { key: 'shrinkage',  label: 'Mermas',           icon: Scale },
    { key: 'zclosure',   label: 'Cierre Caja',      icon: Lock },
    { key: 'cashier',    label: 'Factura x Cajero', icon: Users }
  ].filter((tab) => reportTabAccess[tab.key as ReportTab]);

  React.useEffect(() => {
    if (tabs.length === 0) return;
    const exists = tabs.some((tab) => tab.key === activeTab);
    if (!exists) setActiveTab(tabs[0].key as ReportTab);
  }, [activeTab, tabs]);

  const getActiveReportLabel = React.useCallback(() => {
    const map: Record<ReportTab, string> = {
      overview: 'Vision General',
      sales: 'Ventas',
      profit: 'Utilidad vendida',
      margins: 'Margenes',
      inventory: 'Inventario',
      treasury: 'Tesoreria',
      zclosure: 'Cierre Caja',
      purchases: 'Libro de Compras',
      expenses: 'Libro de Egresos',
      advances: 'Anticipos',
      shrinkage: 'Mermas',
      cashier: 'Factura x Cajero'
    };
    return map[activeTab] ?? 'Reporte';
  }, [activeTab]);

  const getActiveFilterLabel = React.useCallback(() => {
    if (activeTab === 'overview') {
      return [
        `Rango: ${dateRange.start} a ${dateRange.end}`,
        `Tipo mov.: ${overviewMovementType === 'ALL' ? 'Todos' : overviewMovementType}`,
        `Flujo: ${overviewFlow === 'ALL' ? 'Todos' : (overviewFlow === 'INCOME' ? 'Ingresos' : 'Egresos')}`,
        `Busqueda: ${overviewQuery.trim() || 'Todos'}`
      ].join(' | ');
    }
    if (activeTab === 'sales') {
      const tipo =
        String(filters.status ?? '').toUpperCase() === 'CASH' ? 'Contado (Estado)'
          : String(filters.status ?? '').toUpperCase() === 'CREDIT' ? 'Crédito (Estado)'
            : salesBookKind === 'CASH' ? 'Solo contado'
              : salesBookKind === 'CREDIT' ? 'Solo crédito'
                : 'Contado y crédito';
      return [
        `Libro ventas: ${tipo}`,
        `Rango: ${dateRange.start} a ${dateRange.end}`,
        `Cliente: ${filters.client || 'Todos'}`,
        `Metodo: ${filters.method || 'ALL'}`,
        `Cajero: ${filters.cashier || 'ALL'}`,
        `Estado: ${filters.status || 'ALL'}`
      ].join(' | ');
    }
    if (activeTab === 'cashier') {
      const selectedCashierName = selectedCashierId === 'ALL'
        ? 'Todos'
        : (dataService.getUsers().find((u) => u.id === selectedCashierId)?.name ?? 'Cajero');
      return [
        `Fecha: ${cashierReportDate}`,
        `Cajero: ${selectedCashierName}`,
        `Vista: ${cashierViewMode}`,
        `Metodo: ${cashierMethodFilter === 'ALL' ? 'Todos' : cashierMethodFilter}`
      ].join(' | ');
    }
    if (activeTab === 'treasury') {
      const selectedAccountId = treasurySelectedAccountKey === 'ALL'
        ? ''
        : String(treasurySelectedAccountKey).split('::')[1] ?? '';
      const selectedAccount = treasuryAccountOptions.find((acc: any) => String(acc.accountId) === String(selectedAccountId));
      return [
        `Rango: ${treasuryDateRange.start} a ${treasuryDateRange.end}`,
        `Flujo: ${treasuryFlowFilter}`,
        `Moneda: ${treasuryCurrencyFilter}`,
        `Metodo: ${treasuryMethodFilter === 'ALL' ? 'Todos' : treasuryMethodFilter}`,
        `Banco: ${treasurySelectedBank ? treasurySelectedBank.name : 'Todos'}`,
        `Cuenta: ${selectedAccount ? `${selectedAccount.label} (${selectedAccount.accountId})` : 'Todas'}`
      ].join(' | ');
    }
    if (activeTab === 'zclosure') {
      const selectedCashierNames = zSelectedCashierIds.length === 0
        ? 'Todos'
        : dataService.getUsers()
            .filter((u) => zSelectedCashierIds.includes(String(u.id)))
            .map((u) => u.name)
            .join(', ');
      return `Fecha: ${zDate} | Cajeros: ${selectedCashierNames || 'Todos'} | Metodo: ${zMethodFilter === 'ALL' ? 'Todos' : zMethodFilter}`;
    }
    if (activeTab === 'purchases') {
      return `Rango: ${purchaseDateRange.start} a ${purchaseDateRange.end} | Busqueda: ${purchaseSearch || 'Todos'}`;
    }
    if (activeTab === 'expenses') {
      return `Rango: ${expenseDateRange.start} a ${expenseDateRange.end} | Categoria: ${expenseCategory}`;
    }
    if (activeTab === 'advances') {
      return [
        `Tipo: ${advancesReportKind === 'client' ? 'Clientes' : 'Proveedores'}`,
        `Rango: ${advanceDateRange.start} a ${advanceDateRange.end}`,
        advancesIncludeApplied ? 'Incluye aplicados' : 'Solo disponibles / parciales',
        `Busqueda: ${advanceSearch.trim() || '—'}`
      ].join(' | ');
    }
    if (activeTab === 'profit') {
      return [
        `Rango: ${profitDateRange.start} a ${profitDateRange.end}`,
        `Producto: ${profitProductQuery === 'ALL' ? 'Todos' : profitProductQuery}`,
        'Base: ventas no anuladas; costo por lote despachado o promedio de stock'
      ].join(' | ');
    }
    if (activeTab === 'margins') {
      const filterTarget = marginFilterMode === 'PRODUCT'
        ? `Filtro por Producto: ${marginFilterQuery.trim() || 'Todos'}`
        : `Filtro por Lote: ${marginFilterQuery.trim() || 'Todos'}`;
      return `Periodo: ${marginDateRange.start} a ${marginDateRange.end} | ${filterTarget}`;
    }
    return 'Sin filtros adicionales';
  }, [
    activeTab,
    dateRange.start,
    dateRange.end,
    filters.client,
    filters.method,
    filters.cashier,
    filters.status,
    selectedCashierId,
    cashierReportDate,
    cashierViewMode,
    cashierMethodFilter,
    treasuryDateRange.start,
    treasuryDateRange.end,
    treasuryFlowFilter,
    treasuryCurrencyFilter,
    treasuryMethodFilter,
    treasurySelectedBank,
    treasurySelectedAccountKey,
    treasuryAccountOptions,
    zDate,
    zSelectedCashierIds,
    zMethodFilter,
    purchaseDateRange.start,
    purchaseDateRange.end,
    purchaseSearch,
    expenseDateRange.start,
    expenseDateRange.end,
    expenseCategory,
    salesBookKind,
    advancesReportKind,
    advanceDateRange.start,
    advanceDateRange.end,
    advancesIncludeApplied,
    advanceSearch,
    profitDateRange.start,
    profitDateRange.end,
    profitProductQuery,
    overviewMovementType,
    overviewFlow,
    overviewQuery,
    marginFilterMode,
    marginFilterQuery,
    marginDateRange.start,
    marginDateRange.end
  ]);

  const exportCSV = (rows: any[], filename: string, context?: { reportLabel?: string; filterLabel?: string; includeTotals?: boolean }) => {
    if (!rows.length) return;
    const reportLabel = context?.reportLabel ?? getActiveReportLabel();
    const filterLabel = context?.filterLabel ?? getActiveFilterLabel();
    const includeTotals = Boolean(context?.includeTotals);
    const generatedBy = String(currentUser?.name ?? currentUser?.email ?? 'Sistema');
    const generatedAt = new Date().toLocaleString('es-VE');
    const keySet = new Set<string>();
    rows.forEach((r) => {
      if (r && typeof r === 'object') {
        Object.keys(r).forEach((k) => keySet.add(k));
      }
    });
    const firstKeys = rows[0] && typeof rows[0] === 'object' ? Object.keys(rows[0]) : [];
    const extra = Array.from(keySet).filter((k) => !firstKeys.includes(k)).sort((a, b) => a.localeCompare(b, 'es'));
    const headers = firstKeys.length > 0 ? [...firstKeys, ...extra] : Array.from(keySet);
    if (headers.length === 0) return;
    const csvRows = [...rows];
    if (includeTotals) {
      const numericHeaders = headers.filter((h) =>
        csvRows.every((r: any) => {
          const v = r?.[h];
          if (v === '' || v == null) return true;
          return Number.isFinite(Number(v));
        })
      );
      if (numericHeaders.length > 0) {
        const totalRow: Record<string, any> = {};
        headers.forEach((h, idx) => {
          if (idx === 0) {
            totalRow[h] = 'TOTAL';
            return;
          }
          if (!numericHeaders.includes(h)) {
            totalRow[h] = '';
            return;
          }
          const sum = csvRows.reduce((acc: number, r: any) => acc + (Number(r?.[h] ?? 0) || 0), 0);
          totalRow[h] = roundMoney(sum);
        });
        csvRows.push(totalRow);
      }
    }
    const preambleRows: string[][] = [
      ['TIPO_REPORTE', reportLabel],
      ['FILTROS_APLICADOS', filterLabel],
      ['GENERADO_POR', generatedBy],
      ['FECHA_GENERACION', generatedAt],
      Array.from({ length: headers.length }, () => '')
    ];
    const csv = buildExcelFriendlyCsv(headers, csvRows, { preambleRows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    const detail = [
      'Exportacion CSV',
      `Reporte: ${reportLabel}`,
      `Archivo: ${filename}`,
      `Filtros: ${filterLabel}`,
      `Fecha: ${generatedAt}`
    ].join(' | ');
    void dataService.addAuditEntry('REPORTS', 'EXPORT', detail).catch(() => {});
  };

  if (tabs.length === 0) {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-[11px] font-black uppercase tracking-wider text-amber-700">
            Sin acceso a subreportes habilitados para este usuario.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-emerald-900 rounded-[1.25rem] shadow-xl shadow-emerald-950/20">
              <BarChart className="w-5 h-5 text-emerald-100" />
            </div>
            <div>
              <h2 className="font-headline text-3xl font-black tracking-tight text-slate-900 uppercase leading-none">Centro de Inteligencia</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Modulo de Reportes Gerenciales</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as ReportTab)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${
                isActive ? "bg-emerald-900 text-white shadow-lg" : "bg-white text-slate-600 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "overview" && (
        <div className="space-y-8">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Periodo</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <Calendar className="w-3 h-3 text-slate-400 ml-1" />
                <input type="date" value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0" />
                <span className="text-[10px] font-black text-slate-300 px-1">/</span>
                <input type="date" value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Búsqueda</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <ShoppingBag className="w-3 h-3 text-slate-400 ml-1" />
                <input type="text" placeholder="Cliente, RIF, factura, cajero..." value={filters.client}
                  onChange={(e) => setFilters(prev => ({ ...prev, client: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300 w-56" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Método</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <CreditCard className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.method}
                  onChange={(e) => setFilters(prev => ({ ...prev, method: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="ALL">TODOS</option>
                  {salesMethodOptions.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <Activity className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="ALL">TODOS</option>
                  <option value="COMPLETED">COMPLETADAS</option>
                  <option value="VOID">ANULADAS</option>
                  <option value="CASH">CONTADO</option>
                  <option value="CREDIT">CRÉDITO</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cajero</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <User className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.cashier}
                  onChange={(e) => setFilters(prev => ({ ...prev, cashier: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 max-w-[170px]"
                >
                  <option value="ALL">TODOS</option>
                  {salesCashierOptions.map((cashier) => (
                    <option key={cashier} value={cashier}>{cashier}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Rango USD</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <DollarSign className="w-3 h-3 text-slate-400 ml-1" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Min"
                  value={filters.minUSD}
                  onChange={(e) => setFilters(prev => ({ ...prev, minUSD: e.target.value }))}
                  className="w-16 bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300"
                />
                <span className="text-[10px] font-black text-slate-300">-</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Max"
                  value={filters.maxUSD}
                  onChange={(e) => setFilters(prev => ({ ...prev, maxUSD: e.target.value }))}
                  className="w-16 bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Orden</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <TrendingUp className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="DATE_DESC">Fecha desc</option>
                  <option value="DATE_ASC">Fecha asc</option>
                  <option value="USD_DESC">Monto desc</option>
                  <option value="USD_ASC">Monto asc</option>
                </select>
              </div>
            </div>
            <button
              onClick={() => setFilters(INITIAL_SALES_FILTERS)}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Limpiar filtros
            </button>
            <button
              onClick={() => reportService.exportGeneralOperationsToPDF(
                filteredOperationsJournal,
                { dateRange, filterLabel: getActiveFilterLabel() }
              )}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-900 transition-all"
            >
              <Download className="w-3 h-3" /> PDF General
            </button>
            <button onClick={() => exportCSV(
              filteredOperationsJournal.map(o => ({
                fecha: o.date,
                hora: o.time,
                tipo: o.type,
                tipo_label: o.typeLabel,
                correlativo: o.correlativo,
                entidad: o.entity,
                descripcion: o.description,
                usd: Number(o.amountUSD ?? 0),
                ves: Number(o.amountVES ?? 0),
                metodo: o.method,
                estado: o.status
              })),
              `vision_general_contable_${dateRange.start}_${dateRange.end}.csv`,
              { reportLabel: 'Vision General Contable', filterLabel: getActiveFilterLabel(), includeTotals: true }
            )}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">
              <Download className="w-3 h-3" /> Excel General
            </button>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Guardar filtro favorito</span>
                <input
                  type="text"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Ej: Ventas crédito del mes"
                  className="min-w-[260px] bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-slate-700 placeholder:text-slate-300"
                />
              </div>
              <button
                onClick={saveCurrentSalesPreset}
                disabled={!presetName.trim()}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 disabled:opacity-40 transition-all"
              >
                Guardar preset
              </button>
              <div className="ml-auto flex flex-wrap gap-2">
                <button onClick={() => applyManagementTemplate('credit_month')} className="px-3 py-2 bg-purple-100 text-purple-700 rounded-xl text-[9px] font-black uppercase hover:bg-purple-200 transition-all">Crédito mes</button>
                <button onClick={() => applyManagementTemplate('today_cashier')} className="px-3 py-2 bg-cyan-100 text-cyan-700 rounded-xl text-[9px] font-black uppercase hover:bg-cyan-200 transition-all">Cajeros hoy</button>
                <button onClick={() => applyManagementTemplate('high_ticket')} className="px-3 py-2 bg-amber-100 text-amber-700 rounded-xl text-[9px] font-black uppercase hover:bg-amber-200 transition-all">Tickets altos</button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {salesFilterPresets.length === 0 ? (
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Sin presets guardados</div>
              ) : salesFilterPresets.map((preset) => (
                <div key={preset.id} className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5">
                  <button
                    onClick={() => applySalesPreset(preset)}
                    className="text-[9px] font-black uppercase text-slate-700 hover:text-emerald-700 transition-colors"
                    title={`Aplicar preset ${preset.name}`}
                  >
                    {preset.name}
                  </button>
                  <button
                    onClick={() => deleteSalesPreset(preset.id)}
                    className="text-[8px] font-black uppercase text-red-500 hover:text-red-700 transition-colors"
                    title={`Eliminar preset ${preset.name}`}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-600 bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5">
            <span className="font-black uppercase text-slate-500 tracking-wider">Totales contables con filtros actuales</span>
            <span className="text-slate-400">|</span>
            <span>{filteredOperationsTotals.count} movimientos</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-800">USD neto {usd(filteredOperationsTotals.totalUSD)}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-800">VES neto {bs(filteredOperationsTotals.totalVES)}</span>
            <span className="ml-1 text-slate-400 font-normal">(Alineado con el libro de operaciones y su exportación.)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {kpis.map((kpi, i) => (
              <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm hover:shadow-2xl transition-all">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">{kpi.title}</p>
                <h3 className="text-3xl font-black font-headline tracking-tighter text-slate-900">{kpi.value}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">{kpi.trend}</p>
              </div>
            ))}
            {/* REP-10: Comparativa período */}
            <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200/60 shadow-sm hover:shadow-2xl transition-all">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-4">Ventas (7d vs 7d ant.)</p>
              <h3 className="text-3xl font-black font-headline tracking-tighter text-slate-900">$ {prevPeriodStats.currentUSD.toFixed(0)}</h3>
              <div className={`flex items-center gap-1 mt-1 ${prevPeriodStats.up ? 'text-emerald-600' : 'text-red-600'}`}>
                {prevPeriodStats.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                <span className="text-[9px] font-black uppercase">{prevPeriodStats.pct.toFixed(1)}% vs período anterior</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 uppercase mb-6">Ventas Diarias (ultimos 7 dias)</h3>
              <div className="h-64 flex items-end gap-2">
                {chartStats.map((stat, i) => (
                  <div key={i} className="flex-1 flex flex-col gap-2">
                    <div className="bg-emerald-100 rounded-t-lg relative overflow-hidden" style={{ height: `${(stat.totalUSD / maxUSD) * 200}px` }}>
                      <div className="absolute bottom-0 left-0 right-0 bg-emerald-500" style={{ height: "100%" }}></div>
                    </div>
                    <div className="text-center">
                      <p className="text-[9px] font-black text-slate-400">{stat.date.slice(5)}</p>
                      <p className="text-[10px] font-black text-emerald-700">${stat.totalUSD.toFixed(0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="lg:col-span-4 bg-slate-900 p-6 rounded-[2rem] text-white">
              <div className="flex flex-col gap-4 mb-6">
                <h3 className="text-lg font-black uppercase">Valoracion de Inventario</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[9px] font-black uppercase tracking-widest">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-white/50">Criterio</span>
                    <select
                      value={valuationPricing}
                      onChange={(e) => setValuationPricing(e.target.value === 'sale' ? 'sale' : 'cost')}
                      className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-black normal-case tracking-normal"
                    >
                      <option value="cost">Precio costo</option>
                      <option value="sale">Precio venta (lista)</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-white/50">Moneda total</span>
                    <select
                      value={valuationCurrency}
                      onChange={(e) => setValuationCurrency(e.target.value === 'VES' ? 'VES' : 'USD')}
                      className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-black normal-case tracking-normal"
                    >
                      <option value="USD">Total en USD</option>
                      <option value="VES">Total en Bs</option>
                    </select>
                  </label>
                </div>
                {valuationCurrency === 'VES' && (
                  <label className="flex flex-col gap-1.5 text-[9px] font-black uppercase tracking-widest">
                    <span className="text-white/50">Tasa Bs/USD</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={valuationVesRateInput}
                      onChange={(e) => setValuationVesRateInput(e.target.value)}
                      className="bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white font-mono font-black normal-case tracking-normal"
                      placeholder="Ej. 36.50"
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2 items-center">
                  <button
                    type="button"
                    onClick={() =>
                      reportService.exportInventoryToPDF({
                        pricing: valuationPricing,
                        currency: valuationCurrency,
                        vesRate: valuationVesRate
                      })
                    }
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-[9px] font-black uppercase tracking-widest transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    PDF valorización
                  </button>
                  <span className="text-[8px] font-bold text-white/40 normal-case">
                    Mismo criterio y tasa que la tabla
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                {inventoryStats.slice(0, 5).map((p, i) => {
                  const usdVal = Number(p.valueUSD) || 0;
                  const shown =
                    valuationCurrency === 'VES' ? roundMoney(usdVal * valuationVesRate) : usdVal;
                  const shownText = valuationCurrency === 'VES' ? bs(shown, 0) : usd(shown, 0);
                  return (
                    <div key={i} className="flex justify-between items-center border-b border-white/10 pb-2 gap-2">
                      <span className="text-[10px] font-bold uppercase truncate">{p.description.slice(0, 20)}</span>
                      <span className="text-[11px] font-black font-mono shrink-0">{shownText}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* REP-09: Distribución por método de pago */}
          {methodDist.length > 0 && (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-lg font-black text-slate-900 uppercase">Ventas por Método de Pago</h3>
                <button onClick={() => exportCSV(
                  methodDist,
                  `metodos_pago_${new Date().toISOString().split('T')[0]}.csv`,
                  { reportLabel: 'Ventas por metodo de pago', filterLabel: getActiveFilterLabel(), includeTotals: true }
                )}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
              <div className="p-6 space-y-3">
                {methodDist.map((m, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <span className="text-[10px] font-black text-slate-700 uppercase w-32 shrink-0">{m.method}</span>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${m.pct}%` }} />
                    </div>
                    <span className="text-[10px] font-black text-slate-900 font-mono w-24 text-right shrink-0">$ {m.usd.toFixed(2)}</span>
                    <span className="text-[9px] font-black text-slate-400 w-12 text-right shrink-0">{m.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* KPIs DE OPERACIONES CONSOLIDADAS */}
          {canSeeOverviewFinanceBlocks ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Ventas */}
            <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <Receipt className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Ventas</span>
              </div>
              <p className="text-xl font-black font-mono text-emerald-700">${accountingBalance.ingresos.cashSalesUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">{filteredSales.length} ops</p>
            </div>
            {/* Compras */}
            <div className="bg-white p-5 rounded-2xl border border-blue-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Truck className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Compras</span>
              </div>
              <p className="text-xl font-black font-mono text-blue-700">${accountingBalance.egresos.purchasesUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">{accountingBalance.egresos.purchasesCount} facturas</p>
            </div>
            {/* Devoluciones */}
            <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-amber-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-4 h-4 text-amber-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Devoluciones</span>
              </div>
              <p className="text-xl font-black font-mono text-amber-700">-${accountingBalance.egresos.creditNotesUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">Notas de crédito</p>
            </div>
            {/* Egresos/Gastos */}
            <div className="bg-white p-5 rounded-2xl border border-red-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-red-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Gastos</span>
              </div>
              <p className="text-xl font-black font-mono text-red-700">-${accountingBalance.egresos.expensesUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">{accountingBalance.egresos.expensesCount} registros</p>
            </div>
            {/* Anticipos */}
            <div className="bg-white p-5 rounded-2xl border border-purple-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Coins className="w-4 h-4 text-purple-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Anticipos</span>
              </div>
              <p className="text-xl font-black font-mono text-purple-700">${clientAdvancesSummary.newAdvancesUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">{clientAdvancesSummary.createdCount} creados</p>
            </div>
            {/* Cobros AR */}
            <div className="bg-white p-5 rounded-2xl border border-cyan-200 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-cyan-100 rounded-xl flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-cyan-600" />
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase">Cobros AR</span>
              </div>
              <p className="text-xl font-black font-mono text-cyan-700">${accountingBalance.ingresos.arCollectionsUSD.toFixed(0)}</p>
              <p className="text-[8px] font-bold text-slate-400">Recuperación crédito</p>
            </div>
          </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-wider text-amber-700">
              Resumen financiero oculto por permisos. Se requiere FINANCE_VIEW.
            </div>
          )}

          {canSeeOverviewFinanceBlocks ? (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-900 rounded-2xl flex items-center justify-center shrink-0">
                    <CircleDollarSign className="w-5 h-5 text-blue-100" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase">Préstamos Internos</h3>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                      Reporte rápido de cartera (trabajadores y socios)
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => reportService.exportCompanyLoansToPDF(companyLoans)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-800 transition-all"
                >
                  <FileText className="w-3 h-3" /> Abrir PDF
                </button>
              </div>
              <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3 bg-blue-50/40">
                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Registrados</div>
                  <div className="text-[14px] font-black text-slate-900">{companyLoansSummary.total}</div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-white px-3 py-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-blue-600">Activos</div>
                  <div className="text-[14px] font-black text-blue-700">{companyLoansSummary.openCount}</div>
                </div>
                <div className="rounded-xl border border-red-100 bg-white px-3 py-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-red-600">Vencidos</div>
                  <div className="text-[14px] font-black text-red-700">{companyLoansSummary.overdueCount}</div>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white px-3 py-2">
                  <div className="text-[8px] font-black uppercase tracking-widest text-emerald-600">Saldo abierto</div>
                  <div className="text-[14px] font-black text-emerald-700">{usd(companyLoansSummary.openBalance)}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* LIBRO DE OPERACIONES CONSOLIDADO */}
          {canSeeOverviewFinanceBlocks ? (
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">Libro de Operaciones</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                    {filteredOperationsJournal.length} registros filtrados · movimientos contables consolidados
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={overviewMovementType}
                  onChange={(e) => setOverviewMovementType((e.target.value as OverviewMovementType) || 'ALL')}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black uppercase border border-slate-200"
                >
                  <option value="ALL">Todos los tipos</option>
                  <option value="VENTA">Ventas</option>
                  <option value="COMPRA">Compras</option>
                  <option value="DEVOLUCION">Devoluciones / Notas crédito</option>
                  <option value="EGRESO">Egresos</option>
                  <option value="ANTICIPO">Anticipos</option>
                  <option value="COBRO_AR">Cobros AR</option>
                  <option value="PAGO_AP">Pagos AP</option>
                  <option value="MERMA">Mermas</option>
                </select>
                <select
                  value={overviewFlow}
                  onChange={(e) => setOverviewFlow((e.target.value as OverviewFlow) || 'ALL')}
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black uppercase border border-slate-200"
                >
                  <option value="ALL">Todos los flujos</option>
                  <option value="INCOME">Solo ingresos</option>
                  <option value="EXPENSE">Solo egresos</option>
                </select>
                <input
                  type="text"
                  value={overviewQuery}
                  onChange={(e) => setOverviewQuery(e.target.value)}
                  placeholder="Buscar por entidad, correlativo, descripción..."
                  className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-[9px] font-black border border-slate-200 min-w-[260px]"
                />
                <button
                  onClick={() => {
                    setOverviewMovementType('ALL');
                    setOverviewFlow('ALL');
                    setOverviewQuery('');
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-50 transition-all"
                >
                  Limpiar
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => reportService.exportGeneralOperationsToPDF(
                    filteredOperationsJournal,
                    { dateRange, filterLabel: getActiveFilterLabel() }
                  )}
                  className="flex items-center gap-2 px-3 py-1.5 bg-emerald-950 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-900 transition-all"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => exportCSV(
                  filteredOperationsJournal.map(o => ({
                    fecha: o.date,
                    hora: o.time,
                    tipo: o.type,
                    tipo_label: o.typeLabel,
                    correlativo: o.correlativo,
                    entidad: o.entity,
                    descripcion: o.description,
                    usd: o.amountUSD.toFixed(2),
                    ves: o.amountVES.toFixed(2),
                    metodo: o.method,
                    estado: o.status
                  })),
                  `libro_operaciones_${dateRange.start}_${dateRange.end}.csv`,
                  { reportLabel: 'Libro de Operaciones Contables', filterLabel: getActiveFilterLabel(), includeTotals: true }
                )}
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-800 transition-all">
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Fecha/Hora</th>
                    <th className="px-4 py-3 text-left">Tipo</th>
                    <th className="px-4 py-3 text-left">Correlativo</th>
                    <th className="px-4 py-3 text-left">Entidad</th>
                    <th className="px-4 py-3 text-left">Descripción</th>
                    <th className="px-4 py-3 text-right">Monto USD</th>
                    <th className="px-4 py-3 text-right">Monto Bs</th>
                    <th className="px-4 py-3 text-center">Método</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOperationsJournal.length === 0 ? (
                    <tr><td colSpan={9} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin operaciones en este período</td></tr>
                  ) : filteredOperationsJournal.slice(0, 200).map((op, i) => {
                    const isIncome = op.amountUSD > 0 || op.amountVES > 0;
                    const typeColors: Record<string, string> = {
                      'VENTA': 'bg-emerald-100 text-emerald-700',
                      'COMPRA': 'bg-blue-100 text-blue-700',
                      'DEVOLUCION': 'bg-amber-100 text-amber-700',
                      'EGRESO': 'bg-red-100 text-red-700',
                      'ANTICIPO': 'bg-purple-100 text-purple-700',
                      'COBRO_AR': 'bg-cyan-100 text-cyan-700',
                      'PAGO_AP': 'bg-orange-100 text-orange-700'
                    };
                    return (
                      <tr key={i} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="text-[10px] font-mono text-slate-700">{op.date}</div>
                          <div className="text-[9px] font-mono text-slate-400">{op.time}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${typeColors[op.type] || 'bg-slate-100 text-slate-600'}`}>
                            {op.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[10px] font-black font-mono text-slate-900">{op.correlativo}</td>
                        <td className="px-4 py-3 text-[10px] font-bold text-slate-700 truncate max-w-[120px]">{op.entity}</td>
                        <td className="px-4 py-3 text-[10px] text-slate-600 truncate max-w-[150px]">{op.description}</td>
                        <td className={`px-4 py-3 text-right text-[11px] font-black font-mono ${isIncome ? 'text-emerald-700' : 'text-red-700'}`}>
                          {isIncome ? '+' : ''}${op.amountUSD.toFixed(2)}
                        </td>
                        <td className={`px-4 py-3 text-right text-[11px] font-black font-mono ${op.amountVES > 0 ? 'text-emerald-700' : op.amountVES < 0 ? 'text-red-700' : 'text-slate-400'}`}>
                          {op.amountVES !== 0 ? `${op.amountVES > 0 ? '+' : ''}Bs ${op.amountVES.toFixed(2)}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-[9px] font-bold text-slate-500 uppercase">{op.method}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex px-2 py-0.5 rounded-md bg-slate-100 text-[8px] font-black uppercase text-slate-500">{op.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {operationsJournal.length > 50 && (
                  <tfoot>
                    <tr><td colSpan={9} className="py-3 text-center text-[9px] font-bold text-slate-400 uppercase">
                      Mostrando 50 de {operationsJournal.length} operaciones. Exporta CSV para ver todas.
                    </td></tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          ) : null}

          {/* BALANCE CONTABLE DEL PERÍODO */}
          {canSeeOverviewFinanceBlocks ? (
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-900 rounded-2xl flex items-center justify-center shrink-0">
                  <Scale className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">Balance Contable del Período</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                    {dateRange.start} → {dateRange.end} · Flujo real de caja
                  </p>
                </div>
              </div>
              <div className={`px-5 py-2 rounded-2xl text-[11px] font-black uppercase tracking-widest ${accountingBalance.netoUSD >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                Neto: {accountingBalance.netoUSD >= 0 ? '+' : ''}$ {accountingBalance.netoUSD.toFixed(2)}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
              {/* INGRESOS */}
              <div className="p-6 bg-emerald-50/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-[12px] font-black text-emerald-700 uppercase tracking-wide">Ingresos</h4>
                  </div>
                  <span className="text-lg font-black font-mono text-emerald-700">$ {accountingBalance.ingresos.totalUSD.toFixed(2)}</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center py-2 border-b border-emerald-100">
                    <div>
                      <span className="font-black text-slate-700 uppercase">Ventas al contado</span>
                      <p className="text-[9px] text-slate-400 font-bold">{accountingBalance.ingresos.salesCount} operaciones totales</p>
                    </div>
                    <span className="font-black font-mono text-emerald-700">$ {accountingBalance.ingresos.cashSalesUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-emerald-100">
                    <div>
                      <span className="font-black text-slate-700 uppercase">Cobros AR (Crédito)</span>
                      <p className="text-[9px] text-slate-400 font-bold">Cobranza de cuentas por cobrar</p>
                    </div>
                    <span className="font-black font-mono text-emerald-700">$ {accountingBalance.ingresos.arCollectionsUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-slate-500">
                    <div>
                      <span className="font-bold uppercase text-[10px]">Ventas a crédito (informativo)</span>
                      <p className="text-[8px] text-slate-400 font-bold">Aún no cobradas - generan AR</p>
                    </div>
                    <span className="font-mono text-[10px]">$ {accountingBalance.ingresos.creditSalesUSD.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* EGRESOS */}
              <div className="p-6 bg-red-50/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-4 h-4 text-red-600" />
                    <h4 className="text-[12px] font-black text-red-700 uppercase tracking-wide">Egresos</h4>
                  </div>
                  <span className="text-lg font-black font-mono text-red-700">$ {accountingBalance.egresos.totalUSD.toFixed(2)}</span>
                </div>
                <div className="space-y-2 text-[11px]">
                  <div className="flex justify-between items-center py-2 border-b border-red-100">
                    <div>
                      <span className="font-black text-slate-700 uppercase">Gastos operativos</span>
                      <p className="text-[9px] text-slate-400 font-bold">
                        Fijos: ${accountingBalance.egresos.fixedExpUSD.toFixed(2)} · Variables: ${accountingBalance.egresos.variableExpUSD.toFixed(2)}
                      </p>
                    </div>
                    <span className="font-black font-mono text-red-700">$ {accountingBalance.egresos.expensesUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-red-100">
                    <div>
                      <span className="font-black text-slate-700 uppercase">Pagos a proveedores</span>
                      <p className="text-[9px] text-slate-400 font-bold">Egreso bancario efectivo</p>
                    </div>
                    <span className="font-black font-mono text-red-700">$ {accountingBalance.egresos.apPaymentsUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-red-100">
                    <div>
                      <span className="font-black text-slate-700 uppercase">Devoluciones (NC)</span>
                      <p className="text-[9px] text-slate-400 font-bold">Notas de crédito emitidas</p>
                    </div>
                    <span className="font-black font-mono text-red-700">$ {accountingBalance.egresos.creditNotesUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-slate-500">
                    <div>
                      <span className="font-bold uppercase text-[10px]">Compras del período (informativo)</span>
                      <p className="text-[8px] text-slate-400 font-bold">Facturas ingresadas - generan AP</p>
                    </div>
                    <span className="font-mono text-[10px]">$ {accountingBalance.egresos.purchasesUSD.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 text-slate-500">
                    <div>
                      <span className="font-bold uppercase text-[10px]">Mermas valoradas (informativo)</span>
                      <p className="text-[8px] text-slate-400 font-bold">Pérdidas de inventario al costo</p>
                    </div>
                    <span className="font-mono text-[10px]">$ {accountingBalance.egresos.shrinkageUSD.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {/* MOVIMIENTOS DE INVENTARIO */}
          {canSeeOverviewInventoryBlocks ? (
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-900 rounded-2xl flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase">Movimientos de Inventario</h3>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                    {inventoryMovements.totalMovements} movimientos · {inventoryMovements.byProduct.length} productos afectados
                  </p>
                </div>
              </div>
              <button onClick={() => exportCSV(
                inventoryMovements.byProduct.map(p => ({
                  sku: p.sku, descripcion: p.description, unidad: p.unit,
                  entradas: p.inQty.toFixed(3), salidas: p.outQty.toFixed(3),
                  valor_entradas_usd: p.inValueUSD.toFixed(2),
                  valor_salidas_usd: p.outValueUSD.toFixed(2)
                })),
                `movimientos_inventario_${dateRange.start}_${dateRange.end}.csv`,
                { reportLabel: 'Movimientos de inventario', filterLabel: getActiveFilterLabel(), includeTotals: true }
              )}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-800 transition-all">
                <Download className="w-3 h-3" /> Excel
              </button>
            </div>
            {/* KPIs de movimientos */}
            <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
              <div className="p-5 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entradas</p>
                <p className="text-2xl font-black font-mono text-emerald-700 mt-1">{inventoryMovements.totalInQty.toFixed(1)}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Unidades</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Entradas</p>
                <p className="text-2xl font-black font-mono text-emerald-700 mt-1">${inventoryMovements.totalInUSD.toFixed(0)}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">USD (al costo)</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Salidas</p>
                <p className="text-2xl font-black font-mono text-red-700 mt-1">{inventoryMovements.totalOutQty.toFixed(1)}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">Unidades</p>
              </div>
              <div className="p-5 text-center">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valor Salidas</p>
                <p className="text-2xl font-black font-mono text-red-700 mt-1">${inventoryMovements.totalOutUSD.toFixed(0)}</p>
                <p className="text-[8px] font-bold text-slate-400 uppercase mt-0.5">USD (al costo)</p>
              </div>
            </div>
            {/* Tabla por producto */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">SKU / Producto</th>
                    <th className="px-6 py-3 text-right text-emerald-600">Entradas</th>
                    <th className="px-6 py-3 text-right text-red-600">Salidas</th>
                    <th className="px-6 py-3 text-right">Flujo Neto</th>
                    <th className="px-6 py-3 text-right">Valor Neto USD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inventoryMovements.byProduct.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin movimientos en este período</td></tr>
                  ) : inventoryMovements.byProduct.slice(0, 30).map((p) => {
                    const netQty = p.inQty - p.outQty;
                    const netUSD = p.inValueUSD - p.outValueUSD;
                    return (
                      <tr key={p.sku} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                          <div className="text-[11px] font-black text-slate-900">{p.description}</div>
                          <div className="text-[9px] font-mono text-slate-400">{p.sku} · {p.movCount} mov.</div>
                        </td>
                        <td className="px-6 py-3 text-right">
                          {p.inQty > 0 ? (
                            <>
                              <div className="text-[11px] font-black font-mono text-emerald-700">+{p.inQty.toFixed(3)}</div>
                              <div className="text-[8px] text-slate-400">${p.inValueUSD.toFixed(2)}</div>
                            </>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3 text-right">
                          {p.outQty > 0 ? (
                            <>
                              <div className="text-[11px] font-black font-mono text-red-700">-{p.outQty.toFixed(3)}</div>
                              <div className="text-[8px] text-slate-400">${p.outValueUSD.toFixed(2)}</div>
                            </>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={`px-6 py-3 text-right text-[11px] font-black font-mono ${netQty >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                          {netQty >= 0 ? '+' : ''}{netQty.toFixed(3)} {p.unit}
                        </td>
                        <td className={`px-6 py-3 text-right text-[11px] font-black font-mono ${netUSD >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                          {netUSD >= 0 ? '+' : ''}${netUSD.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {inventoryMovements.byProduct.length > 30 && (
                  <tfoot>
                    <tr><td colSpan={5} className="py-3 text-center text-[9px] font-bold text-slate-400 uppercase">
                      Mostrando 30 de {inventoryMovements.byProduct.length} productos. Exporta CSV para ver todos.
                    </td></tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          ) : (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-wider text-indigo-700">
              Detalle de inventario oculto por permisos. Se requiere REPORTS_INVENTORY.
            </div>
          )}

          {/* REP-03: Libro de ventas con paginación */}
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase">Libro de Ventas</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                  Mostrando {Math.min((salesPage + 1) * SALES_PER_PAGE, filteredSales.length)} de {filteredSales.length} registros
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => reportService.exportSalesBookToPDF(filteredSales as any, {
                    start: dateRange.start,
                    end: dateRange.end,
                    search: filters.client,
                    filterLabel: getActiveFilterLabel(),
                    title: 'LIBRO DE VENTAS'
                  })}
                  disabled={filteredSales.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-950 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => {
                  const creditCount = filteredSalesSplitSummary.credit.count;
                  const cashCount = filteredSalesSplitSummary.cash.count;
                  const creditUSD = filteredSalesSplitSummary.credit.totalUSD;
                  const cashUSD = filteredSalesSplitSummary.cash.totalUSD;
                  const creditVES = filteredSalesSplitSummary.credit.totalVES;
                  const cashVES = filteredSalesSplitSummary.cash.totalVES;
                  exportCSV(
                    [
                      ...filteredSales.map(s => ({
                        fecha: s.timestamp.toISOString().slice(0, 10),
                        correlativo: s.correlativo,
                        cliente: s.client.name,
                        rif: s.client.id,
                        totalUSD: s.totalUSD,
                        totalVES: s.totalVES,
                        detalle_productos: formatInvoiceProductDetails((s as any).items),
                        metodo: s.paymentMethod
                      })),
                      {
                        fecha: '— RESUMEN —',
                        correlativo: 'Total facturas (listado)',
                        cliente: String(filteredSales.length),
                        rif: '',
                        totalUSD: '',
                        totalVES: '',
                        detalle_productos: '',
                        metodo: ''
                      },
                      {
                        fecha: 'RESUMEN',
                        correlativo: 'Contado (G)',
                        cliente: `Facturas: ${cashCount}`,
                        rif: '',
                        totalUSD: cashUSD,
                        totalVES: cashVES,
                        detalle_productos: '',
                        metodo: ''
                      },
                      {
                        fecha: 'RESUMEN',
                        correlativo: 'Crédito (C)',
                        cliente: `Facturas: ${creditCount}`,
                        rif: '',
                        totalUSD: creditUSD,
                        totalVES: creditVES,
                        detalle_productos: '',
                        metodo: ''
                      }
                    ],
                    `libro_ventas_${new Date().toISOString().split('T')[0]}.csv`
                  );
                }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Fecha</th>
                    <th className="px-6 py-3 text-left">Correlativo</th>
                    <th className="px-6 py-3 text-left">Cliente</th>
                    <th className="px-6 py-3 text-right">Total $</th>
                    <th className="px-6 py-3 text-right">Total Bs</th>
                    <th className="px-6 py-3 text-center">Método</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSales.slice(salesPage * SALES_PER_PAGE, (salesPage + 1) * SALES_PER_PAGE).map((sale, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-[11px] font-mono text-slate-600">{sale.timestamp.toISOString().slice(0, 10)}</td>
                      <td className="px-6 py-3 text-[11px] font-black text-slate-900">{sale.correlativo}</td>
                      <td className="px-6 py-3 text-[11px] text-slate-700">{sale.client.name}</td>
                      <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-emerald-700">{usd(sale.totalUSD)}</td>
                      <td className="px-6 py-3 text-[11px] font-mono text-right text-slate-600">{bs(sale.totalVES)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className="inline-flex px-2 py-1 rounded-lg bg-slate-100 text-[9px] font-black uppercase text-slate-600">{sale.paymentMethod}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-100">
                  <tr className="border-b border-slate-300">
                    <td className="px-6 py-2 text-[10px] font-black uppercase text-slate-800" colSpan={3}>
                      Total Filtro Activo ({salesStatusLabel}) - Facturas: {filteredSalesTotals.count}
                    </td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">
                      {usd(filteredSalesTotals.totalUSD)}
                    </td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">
                      {bs(filteredSalesTotals.totalVES)}
                    </td>
                    <td className="px-6 py-2 text-center text-[9px] font-black uppercase text-slate-700">
                      Filtro
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-2 text-[9px] font-black uppercase text-slate-600" colSpan={3}>
                      Totales Contado (G) - Facturas: {filteredSalesSplitSummary.cash.count}
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-emerald-700">
                      {usd(filteredSalesSplitSummary.cash.totalUSD)}
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-emerald-700">
                      {bs(filteredSalesSplitSummary.cash.totalVES)}
                    </td>
                    <td className="px-6 py-2 text-center text-[9px] font-black uppercase text-emerald-700">
                      Contado
                    </td>
                  </tr>
                  <tr>
                    <td className="px-6 py-2 text-[9px] font-black uppercase text-slate-600" colSpan={3}>
                      Totales Crédito (C) - Facturas: {filteredSalesSplitSummary.credit.count}
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-cyan-700">
                      {usd(filteredSalesSplitSummary.credit.totalUSD)}
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-cyan-700">
                      {bs(filteredSalesSplitSummary.credit.totalVES)}
                    </td>
                    <td className="px-6 py-2 text-center text-[9px] font-black uppercase text-cyan-700">
                      Crédito
                    </td>
                  </tr>
                  <tr className="border-t border-slate-300">
                    <td className="px-6 py-2 text-[10px] font-black uppercase text-slate-800" colSpan={3}>
                      Total General - Facturas: {filteredSales.length}
                    </td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">
                      {usd(filteredSalesSplitSummary.cash.totalUSD + filteredSalesSplitSummary.credit.totalUSD)}
                    </td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">
                      {bs(filteredSalesSplitSummary.cash.totalVES + filteredSalesSplitSummary.credit.totalVES)}
                    </td>
                    <td className="px-6 py-2 text-center text-[9px] font-black uppercase text-slate-700">
                      General
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {filteredSales.length > SALES_PER_PAGE && (
              <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase">
                  Página {salesPage + 1} de {Math.ceil(filteredSales.length / SALES_PER_PAGE)}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => setSalesPage(p => Math.max(0, p - 1))} disabled={salesPage === 0}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={() => setSalesPage(p => Math.min(Math.ceil(filteredSales.length / SALES_PER_PAGE) - 1, p + 1))} disabled={(salesPage + 1) * SALES_PER_PAGE >= filteredSales.length}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-3">
                Resumen de Facturas Filtradas
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-300 bg-white px-4 py-3">
                  <p className="text-[10px] font-black uppercase text-slate-700">{salesStatusLabel}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                    Facturas: {filteredSalesTotals.count}
                  </p>
                  <p className="text-[11px] font-black font-mono text-slate-900 mt-1">
                    USD: {usd(filteredSalesTotals.totalUSD)}
                  </p>
                  <p className="text-[10px] font-black font-mono text-slate-700">
                    Bs: {bs(filteredSalesTotals.totalVES)}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase text-emerald-700">Contado (G)</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                    Facturas: {filteredSalesSplitSummary.cash.count}
                  </p>
                  <p className="text-[11px] font-black font-mono text-emerald-800 mt-1">
                    USD: {usd(filteredSalesSplitSummary.cash.totalUSD)}
                  </p>
                  <p className="text-[10px] font-black font-mono text-emerald-700">
                    Bs: {bs(filteredSalesSplitSummary.cash.totalVES)}
                  </p>
                </div>
                <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase text-cyan-700">Crédito (C)</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                    Facturas: {filteredSalesSplitSummary.credit.count}
                  </p>
                  <p className="text-[11px] font-black font-mono text-cyan-800 mt-1">
                    USD: {usd(filteredSalesSplitSummary.credit.totalUSD)}
                  </p>
                  <p className="text-[10px] font-black font-mono text-cyan-700">
                    Bs: {bs(filteredSalesSplitSummary.credit.totalVES)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Periodo</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <Calendar className="w-3 h-3 text-slate-400 ml-1" />
                <input type="date" value={dateRange.start}
                  onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0" />
                <span className="text-[10px] font-black text-slate-300 px-1">/</span>
                <input type="date" value={dateRange.end}
                  onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Búsqueda</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <ShoppingBag className="w-3 h-3 text-slate-400 ml-1" />
                <input type="text" placeholder="Cliente, RIF, factura, cajero..." value={filters.client}
                  onChange={(e) => setFilters(prev => ({ ...prev, client: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300 w-56" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Método</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <CreditCard className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.method}
                  onChange={(e) => setFilters(prev => ({ ...prev, method: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="ALL">TODOS</option>
                  {salesMethodOptions.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Estado</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <Activity className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="ALL">TODOS</option>
                  <option value="COMPLETED">COMPLETADAS</option>
                  <option value="VOID">ANULADAS</option>
                  <option value="CASH">CONTADO</option>
                  <option value="CREDIT">CRÉDITO</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Cajero</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <User className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.cashier}
                  onChange={(e) => setFilters(prev => ({ ...prev, cashier: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 max-w-[170px]"
                >
                  <option value="ALL">TODOS</option>
                  {salesCashierOptions.map((cashier) => (
                    <option key={cashier} value={cashier}>{cashier}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Rango USD</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <DollarSign className="w-3 h-3 text-slate-400 ml-1" />
                <input type="number" min="0" step="0.01" placeholder="Min" value={filters.minUSD}
                  onChange={(e) => setFilters(prev => ({ ...prev, minUSD: e.target.value }))}
                  className="w-16 bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300" />
                <span className="text-[10px] font-black text-slate-300">-</span>
                <input type="number" min="0" step="0.01" placeholder="Max" value={filters.maxUSD}
                  onChange={(e) => setFilters(prev => ({ ...prev, maxUSD: e.target.value }))}
                  className="w-16 bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0 placeholder:text-slate-300" />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Orden</span>
              <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                <TrendingUp className="w-3 h-3 text-slate-400 ml-1" />
                <select
                  value={filters.sortBy}
                  onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                  className="bg-transparent border-0 p-0 text-[10px] font-black uppercase text-slate-600 focus:ring-0"
                >
                  <option value="DATE_DESC">Fecha desc</option>
                  <option value="DATE_ASC">Fecha asc</option>
                  <option value="USD_DESC">Monto desc</option>
                  <option value="USD_ASC">Monto asc</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => { setFilters(INITIAL_SALES_FILTERS); setSalesBookKind('ALL'); }}
              className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
            >
              Limpiar filtros
            </button>
            <button
              type="button"
              disabled={salesBookRows.length === 0}
              onClick={() => printService.printSalesReport(
                salesBookRows,
                dateRange,
                filters,
                {
                  includeReturns: false,
                  includeVoided: filters.status === 'ALL' || filters.status === 'VOID',
                  showNetTotals: true
                }
              )}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-3 h-3" /> Exportar PDF
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de venta (contado / crédito)</span>
            <div className="flex flex-wrap items-center gap-2">
              {(['ALL', 'CASH', 'CREDIT'] as const).map((k) => {
                const active = salesBookKind === k;
                const disabled = filters.status === 'CASH' || filters.status === 'CREDIT';
                const label = k === 'ALL' ? 'Ambas' : k === 'CASH' ? 'Solo contado' : 'Solo crédito';
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={disabled}
                    onClick={() => setSalesBookKind(k)}
                    className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                      disabled ? 'opacity-40 cursor-not-allowed bg-slate-100 text-slate-400 border-slate-200'
                        : active ? 'bg-emerald-900 text-white border-emerald-900 shadow-md'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
              {(filters.status === 'CASH' || filters.status === 'CREDIT') && (
                <span className="text-[9px] font-bold text-slate-500 uppercase ml-2">
                  Use Estado CONTADO/CRÉDITO; tipo fijo por ese filtro.
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[9px] font-bold text-slate-600 bg-slate-50/80 border border-slate-200/80 rounded-2xl px-4 py-2.5">
            <span className="font-black uppercase text-slate-500 tracking-wider">Totales (pestaña Ventas)</span>
            <span className="text-slate-400">|</span>
            <span>{salesBookRows.length} facturas</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-800">{usd(salesBookTotals.totalUSD)}</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-slate-800">{bs(salesBookTotals.totalVES)}</span>
            <span className="text-slate-400">·</span>
            <span className="font-black uppercase text-emerald-700">{salesBookStatusLabel}</span>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center flex-wrap gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase">Libro de ventas</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">
                  Mostrando {Math.min((salesBookPage + 1) * SALES_PER_PAGE, salesBookRows.length)} de {salesBookRows.length} registros
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={salesBookRows.length === 0}
                  onClick={() => reportService.exportSalesBookToPDF(salesBookRows as any, {
                    start: dateRange.start,
                    end: dateRange.end,
                    search: filters.client,
                    filterLabel: getActiveFilterLabel(),
                    title: 'LIBRO DE VENTAS'
                  })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-950 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button
                  type="button"
                  disabled={salesBookRows.length === 0}
                  onClick={() => {
                    const creditCount = salesBookSplitSummary.credit.count;
                    const cashCount = salesBookSplitSummary.cash.count;
                    const creditUSD = salesBookSplitSummary.credit.totalUSD;
                    const cashUSD = salesBookSplitSummary.cash.totalUSD;
                    const creditVES = salesBookSplitSummary.credit.totalVES;
                    const cashVES = salesBookSplitSummary.cash.totalVES;
                    exportCSV(
                      [
                        ...salesBookRows.map(s => ({
                          fecha: s.timestamp.toISOString().slice(0, 10),
                          correlativo: s.correlativo,
                          cliente: s.client.name,
                          rif: s.client.id,
                          totalUSD: s.totalUSD,
                          totalVES: s.totalVES,
                          metodo: s.paymentMethod,
                          detalle_productos: formatInvoiceProductDetails((s as any).items),
                          tipo: classifyCreditSale(s) ? 'CREDITO' : 'CONTADO'
                        })),
                        {
                          fecha: '— RESUMEN —',
                          correlativo: 'Total facturas (listado)',
                          cliente: String(salesBookRows.length),
                          rif: '',
                          totalUSD: '',
                          totalVES: '',
                          metodo: '',
                          detalle_productos: '',
                          tipo: ''
                        },
                        {
                          fecha: 'RESUMEN',
                          correlativo: 'Contado (G)',
                          cliente: `Facturas: ${cashCount}`,
                          rif: '',
                          totalUSD: cashUSD,
                          totalVES: cashVES,
                          metodo: '',
                          detalle_productos: '',
                          tipo: ''
                        },
                        {
                          fecha: 'RESUMEN',
                          correlativo: 'Crédito (C)',
                          cliente: `Facturas: ${creditCount}`,
                          rif: '',
                          totalUSD: creditUSD,
                          totalVES: creditVES,
                          metodo: '',
                          detalle_productos: '',
                          tipo: ''
                        }
                      ],
                      `libro_ventas_${new Date().toISOString().split('T')[0]}.csv`,
                      { reportLabel: 'Ventas', filterLabel: getActiveFilterLabel() }
                    );
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Fecha</th>
                    <th className="px-6 py-3 text-left">Correlativo</th>
                    <th className="px-6 py-3 text-left">Cliente</th>
                    <th className="px-6 py-3 text-center">Tipo</th>
                    <th className="px-6 py-3 text-right">Total $</th>
                    <th className="px-6 py-3 text-right">Total Bs</th>
                    <th className="px-6 py-3 text-center">Método</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {salesBookRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-16 text-center text-slate-300 font-black uppercase text-sm">
                        Sin ventas con los filtros seleccionados
                      </td>
                    </tr>
                  ) : salesBookRows.slice(salesBookPage * SALES_PER_PAGE, (salesBookPage + 1) * SALES_PER_PAGE).map((sale, i) => {
                    const cred = classifyCreditSale(sale);
                    return (
                      <tr key={`${sale.correlativo}-${i}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 text-[11px] font-mono text-slate-600">{sale.timestamp.toISOString().slice(0, 10)}</td>
                        <td className="px-6 py-3 text-[11px] font-black text-slate-900">{sale.correlativo}</td>
                        <td className="px-6 py-3 text-[11px] text-slate-700">{sale.client.name}</td>
                        <td className="px-6 py-3 text-center">
                          <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${cred ? 'bg-cyan-100 text-cyan-800' : 'bg-emerald-100 text-emerald-800'}`}>
                            {cred ? 'Crédito' : 'Contado'}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-emerald-700">{usd(sale.totalUSD)}</td>
                        <td className="px-6 py-3 text-[11px] font-mono text-right text-slate-600">{bs(sale.totalVES)}</td>
                        <td className="px-6 py-3 text-center">
                          <span className="inline-flex px-2 py-1 rounded-lg bg-slate-100 text-[9px] font-black uppercase text-slate-600">{sale.paymentMethod}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-slate-300 bg-slate-100">
                  <tr className="border-b border-slate-300">
                    <td className="px-6 py-2 text-[10px] font-black uppercase text-slate-800" colSpan={4}>
                      Total listado ({salesBookStatusLabel}) — Facturas: {salesBookTotals.count}
                    </td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">{usd(salesBookTotals.totalUSD)}</td>
                    <td className="px-6 py-2 text-[11px] font-black font-mono text-right text-slate-900">{bs(salesBookTotals.totalVES)}</td>
                    <td className="px-6 py-2 text-center text-[9px] font-black uppercase text-slate-700">—</td>
                  </tr>
                  <tr>
                    <td className="px-6 py-2 text-[9px] font-black uppercase text-slate-600" colSpan={4}>
                      Subtotal contado (G) — {salesBookSplitSummary.cash.count} facturas
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-emerald-700">{usd(salesBookSplitSummary.cash.totalUSD)}</td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-emerald-700">{bs(salesBookSplitSummary.cash.totalVES)}</td>
                    <td />
                  </tr>
                  <tr>
                    <td className="px-6 py-2 text-[9px] font-black uppercase text-slate-600" colSpan={4}>
                      Subtotal crédito (C) — {salesBookSplitSummary.credit.count} facturas
                    </td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-cyan-800">{usd(salesBookSplitSummary.credit.totalUSD)}</td>
                    <td className="px-6 py-2 text-[10px] font-black font-mono text-right text-cyan-800">{bs(salesBookSplitSummary.credit.totalVES)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {salesBookRows.length > SALES_PER_PAGE && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                <span className="text-[10px] font-black text-slate-500 uppercase">
                  Página {salesBookPage + 1} de {Math.ceil(salesBookRows.length / SALES_PER_PAGE) || 1}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setSalesBookPage(p => Math.max(0, p - 1))} disabled={salesBookPage === 0}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button type="button" onClick={() => setSalesBookPage(p => Math.min(Math.max(0, Math.ceil(salesBookRows.length / SALES_PER_PAGE) - 1), p + 1))} disabled={(salesBookPage + 1) * SALES_PER_PAGE >= salesBookRows.length}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REP-01 FIX + REP-02: Treasury único con datos reales */}
      {activeTab === "treasury" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-900 rounded-xl">
                  <Wallet className="w-5 h-5 text-emerald-100" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Tesorería por Moneda</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Saldos por banco = misma suma que Finanzas &gt; Bancos (historial completo en Firestore)
                  </p>
                </div>
              </div>
              <button onClick={() => exportCSV(
                treasuryData.banks.map(b => ({ banco: b.name, saldoUSD: b.balanceUSD, saldoVES: b.balanceVES, transacciones: b.txCount })),
                `tesoreria_${new Date().toISOString().split('T')[0]}.csv`,
                { reportLabel: 'Tesoreria por banco', filterLabel: getActiveFilterLabel(), includeTotals: true }
              )}
                disabled={!canExportTreasuryReports || !treasuryData.officialBalancesReady}
                className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="w-3 h-3" /> Excel
              </button>
            </div>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-blue-50 p-6 rounded-2xl border border-blue-200">
                <div className="flex items-center gap-3 mb-4">
                  <DollarSign className="w-6 h-6 text-blue-700" />
                  <h4 className="text-lg font-black text-blue-900 uppercase">Dólares (USD)</h4>
                </div>
                <div className="border-t border-blue-200 pt-3">
                  <span className="text-[12px] font-black text-blue-800 uppercase">Total USD</span>
                  <div className="text-3xl font-black font-mono text-blue-900 mt-1">
                    {treasuryData.officialBalancesReady ? usd(treasuryData.usdTotal) : (
                      <span className="text-lg text-blue-700/70 animate-pulse">Consultando…</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-200">
                <div className="flex items-center gap-3 mb-4">
                  <Coins className="w-6 h-6 text-emerald-700" />
                  <h4 className="text-lg font-black text-emerald-900 uppercase">Bolívares (Bs)</h4>
                </div>
                <div className="border-t border-emerald-200 pt-3">
                  <span className="text-[12px] font-black text-emerald-800 uppercase">Total Bs</span>
                  <div className="text-3xl font-black font-mono text-emerald-900 mt-1">
                    {treasuryData.officialBalancesReady ? bs(treasuryData.vesTotal) : (
                      <span className="text-lg text-emerald-800/70 animate-pulse">Consultando…</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <h4 className="text-[12px] font-black text-slate-600 uppercase mb-1 flex items-center gap-2">
                <Landmark className="w-4 h-4" /> Saldo por Banco
              </h4>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide mb-3">
                El número de transacciones y la última fecha usan la ventana sincronizada en memoria; los importes usan el libro completo.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {!treasuryData.officialBalancesReady && (
                  <div className="col-span-full text-center py-6 text-sm font-bold text-slate-500">
                    {treasuryData.officialBalancesLoading ? 'Sincronizando saldos con el módulo Bancos…' : 'Preparando saldos…'}
                  </div>
                )}
                {treasuryData.officialBalancesReady && treasuryData.banks.map(bank => (
                  <div key={bank.id} className="bg-white p-4 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-4 h-4 text-slate-400" />
                      <span className="text-[11px] font-black text-slate-900 truncate">{bank.name}</span>
                    </div>
                    {bank.balanceUSD !== 0 && (
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] font-black text-blue-500 uppercase">USD</span>
                        <span className="text-[13px] font-black font-mono text-blue-900">{usd(bank.balanceUSD)}</span>
                      </div>
                    )}
                    {bank.balanceVES !== 0 && (
                      <div className="flex justify-between items-center">
                        <span className="text-[9px] font-black text-emerald-500 uppercase">Bs</span>
                        <span className="text-[13px] font-black font-mono text-emerald-900">{bs(bank.balanceVES)}</span>
                      </div>
                    )}
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <span className="text-[8px] font-bold text-slate-400 uppercase">{bank.txCount} transacciones</span>
                      {bank.lastTx && <span className="text-[8px] font-bold text-slate-300 ml-2">· últ. {(bank.lastTx as Date).toLocaleDateString('es-VE')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h4 className="text-[12px] font-black text-slate-600 uppercase flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Operaciones Bancarias Detalladas
                  </h4>
                  <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">
                    Banco: {treasurySelectedBank ? treasurySelectedBank.name : 'Todos'} · Cuenta: {treasurySelectedAccountKey !== 'ALL'
                      ? (treasuryAccountOptions.find((acc: any) => String(acc.accountId) === String(treasurySelectedAccountKey).split('::')[1])?.label ?? String(treasurySelectedAccountKey).split('::')[1])
                      : 'Todas'}
                  </p>
                </div>
                <button
                  disabled={treasuryDetailRows.length === 0 || !canExportTreasuryReports}
                  onClick={() => exportCSV(
                    [
                      ...treasuryDetailRows.map((row) => ({
                        fecha: `${row.date} ${row.time}`.trim(),
                        banco: row.bankName,
                        cuenta: row.accountLabel,
                        cuentaId: row.accountId,
                        tipoOperacion: row.sourceLabel,
                        factura: row.correlativo || '',
                        cliente: row.customerName || '',
                        metodo: row.method,
                        cajero: row.cashier,
                        referencia: row.reference || '',
                        tasaUsada: row.rateUsed > 0 ? row.rateUsed.toFixed(4) : '',
                        movimientoVES: row.amountVES.toFixed(2)
                      })),
                      {
                        fecha: '',
                        banco: '',
                        cuenta: '',
                        cuentaId: '',
                        tipoOperacion: '',
                        factura: '',
                        cliente: '',
                        metodo: 'TOTAL',
                        cajero: '',
                        referencia: '',
                        tasaUsada: '',
                        movimientoVES: treasuryDetailTotals.movementVES.toFixed(2)
                      }
                    ],
                    `tesoreria_operaciones_${new Date().toISOString().split('T')[0]}.csv`,
                    { reportLabel: 'Tesoreria operaciones detalladas', filterLabel: getActiveFilterLabel() }
                  )}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel Operaciones
                </button>
                <button
                  disabled={treasuryDetailRows.length === 0 || !canExportTreasuryReports}
                  onClick={() => {
                    const selectedAccountId = treasurySelectedAccountKey === 'ALL'
                      ? ''
                      : String(treasurySelectedAccountKey).split('::')[1] ?? '';
                    const selectedAccount = treasuryAccountOptions.find((acc: any) => String(acc.accountId) === String(selectedAccountId));
                    const flowLabel = treasuryFlowFilter === 'GENERAL'
                      ? 'General Ventas+Compras'
                      : treasuryFlowFilter === 'ALL'
                      ? 'Todas'
                      : treasuryFlowFilter === 'SALES'
                      ? 'Ventas'
                      : 'Compras';
                    const currencyLabel = treasuryCurrencyFilter === 'ALL'
                      ? 'Ambas'
                      : treasuryCurrencyFilter === 'VES'
                      ? 'Bs'
                      : 'USD';
                    const pdfMode = treasuryCurrencyFilter === 'USD'
                      ? 'USD'
                      : treasuryCurrencyFilter === 'VES'
                      ? 'Bs'
                      : 'MIXED';
                    reportService.exportTreasuryOperationsToPDF(
                      treasuryDetailRows.map((row) => ({
                        date: row.date,
                        time: row.time,
                        bankName: row.bankName,
                        accountLabel: row.accountLabel,
                        accountId: row.accountId,
                        sourceLabel: row.sourceLabel,
                        correlativo: row.correlativo,
                        customerName: row.customerName,
                        method: row.method,
                        cashier: row.cashier,
                        reference: row.reference,
                        rateUsed: row.rateUsed,
                        amountVES: row.amountVES,
                        runningUSD: row.runningUSD,
                        runningVES: row.runningVES
                      })),
                      {
                        dateRange: treasuryDateRange,
                        flowLabel,
                        currencyLabel,
                        methodLabel: treasuryMethodFilter === 'ALL' ? 'Todos' : treasuryMethodFilter,
                        bankLabel: treasurySelectedBank ? treasurySelectedBank.name : 'Todos',
                        accountLabel: selectedAccount ? `${selectedAccount.label} (${selectedAccount.accountId})` : 'Todas',
                        mode: pdfMode
                      }
                    );
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> PDF Operaciones
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-4">
                <div className="md:col-span-2">
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Rango de fechas</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={treasuryDateRange.start}
                      onChange={(e) => setTreasuryDateRange((prev) => ({ ...prev, start: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                    />
                    <input
                      type="date"
                      value={treasuryDateRange.end}
                      onChange={(e) => setTreasuryDateRange((prev) => ({ ...prev, end: e.target.value }))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Tipo de flujo</p>
                  <select
                    value={treasuryFlowFilter}
                    onChange={(e) => setTreasuryFlowFilter(e.target.value as 'ALL' | 'GENERAL' | 'SALES' | 'PURCHASES')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                  >
                    <option value="GENERAL">General Ventas+Compras</option>
                    <option value="ALL">Todas (incluye ajustes)</option>
                    <option value="SALES">Solo ventas</option>
                    <option value="PURCHASES">Solo compras</option>
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Moneda</p>
                  <select
                    value={treasuryCurrencyFilter}
                    onChange={(e) => setTreasuryCurrencyFilter(e.target.value as 'ALL' | 'USD' | 'VES')}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                  >
                    <option value="ALL">Ambas</option>
                    <option value="USD">Solo USD (o equiv.)</option>
                    <option value="VES">Solo Bs (o equiv.)</option>
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Método</p>
                  <select
                    value={treasuryMethodFilter}
                    onChange={(e) => setTreasuryMethodFilter(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                  >
                    <option value="ALL">Todos</option>
                    {treasuryMethodOptions.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Banco</p>
                  <select
                    value={treasurySelectedBankId}
                    onChange={(e) => setTreasurySelectedBankId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                  >
                    <option value="ALL">Todos los bancos</option>
                    {treasuryBankOptions.map((bank: any) => (
                      <option key={bank.id} value={bank.id}>
                        {bank.name} ({bank.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Cuenta</p>
                  <select
                    value={treasurySelectedAccountKey}
                    onChange={(e) => setTreasurySelectedAccountKey(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                    disabled={treasurySelectedBankId === 'ALL'}
                  >
                    <option value="ALL">{treasurySelectedBankId === 'ALL' ? 'Seleccione banco primero' : 'Todas las cuentas'}</option>
                    {treasuryAccountOptions.map((account: any) => (
                      <option key={account.key} value={account.key}>
                        {account.label} {account.accountNumber ? `- ${account.accountNumber}` : ''} {account.currency ? `(${account.currency})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[8px] uppercase font-black text-slate-400">Mov. neto Bs</p>
                  <p className="text-[14px] font-black text-emerald-700">Bs {treasuryDetailTotals.movementVES.toFixed(2)}</p>
                  <p className="text-[8px] text-slate-400">Saldo filtrado: Bs {treasuryDetailTotals.balanceVES.toFixed(2)}</p>
                </div>
              </div>

              <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr className="text-[9px] font-black uppercase text-slate-500">
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Banco / Cuenta</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Factura</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Método</th>
                      <th className="px-3 py-2">Cajero</th>
                      <th className="px-3 py-2">Referencia</th>
                      <th className="px-3 py-2 text-right">Tasa</th>
                      <th className="px-3 py-2 text-right">Mov. Bs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {treasuryDetailRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-10 text-center text-slate-300 font-black uppercase text-[11px]">
                          Sin movimientos para el filtro seleccionado
                        </td>
                      </tr>
                    ) : treasuryDetailRows.map((row, idx) => (
                      <tr key={`${row.date}-${row.accountId}-${row.correlativo}-${idx}`} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 text-[10px] text-slate-700">{row.date} {row.time}</td>
                        <td className="px-3 py-2 text-[10px] text-slate-700">
                          <p className="font-black text-slate-900">{row.bankName || '-'}</p>
                          <p className="text-slate-500">{row.accountLabel || '-'} {row.accountId ? `(${row.accountId})` : ''}</p>
                        </td>
                        <td className="px-3 py-2 text-[10px] text-slate-700">{row.sourceLabel}</td>
                        <td className="px-3 py-2 text-[10px] font-mono text-slate-900">{row.correlativo || '-'}</td>
                        <td className="px-3 py-2 text-[10px] text-slate-700">{row.customerName || '-'}</td>
                        <td className="px-3 py-2 text-[10px] font-black text-slate-700 uppercase">{row.method || '-'}</td>
                        <td className="px-3 py-2 text-[10px] text-slate-700">{row.cashier || 'N/D'}</td>
                        <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{row.reference || '-'}</td>
                        <td className="px-3 py-2 text-[10px] text-right font-mono text-slate-600">
                          {row.rateUsed > 0 ? row.rateUsed.toFixed(4) : '-'}
                        </td>
                        <td className={`px-3 py-2 text-[10px] text-right font-mono font-black ${row.amountVES >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {row.amountVES >= 0 ? '+' : ''}{row.amountVES.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[9px] text-slate-500 font-bold uppercase mt-3">
                Registros: {treasuryDetailTotals.count} | Flujo: {treasuryFlowFilter === 'GENERAL' ? 'General Ventas+Compras' : treasuryFlowFilter === 'ALL' ? 'Todas' : treasuryFlowFilter === 'SALES' ? 'Ventas' : 'Compras'} | Moneda: {treasuryCurrencyFilter === 'ALL' ? 'Ambas' : treasuryCurrencyFilter === 'VES' ? 'Bs' : 'USD'} | Método: {treasuryMethodFilter === 'ALL' ? 'Todos' : treasuryMethodFilter} | Rango: {treasuryDateRange.start} a {treasuryDateRange.end} | Banco: {treasurySelectedBank ? treasurySelectedBank.name : 'Todos'}
                {treasurySelectedAccountKey !== 'ALL' ? ` | Cuenta: ${String(treasurySelectedAccountKey).split('::')[1]}` : ''}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* REP-04: Libro de Compras */}
      {activeTab === "purchases" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Libro de Compras</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Facturas de proveedores registradas</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <input type="date" value={purchaseDateRange.start} onChange={e => setPurchaseDateRange(p => ({ ...p, start: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0" />
                  <span className="text-slate-300">/</span>
                  <input type="date" value={purchaseDateRange.end} onChange={e => setPurchaseDateRange(p => ({ ...p, end: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0" />
                </div>
                <input type="text" placeholder="Proveedor / descripción..." value={purchaseSearch}
                  onChange={e => setPurchaseSearch(e.target.value)}
                  className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black text-slate-700 focus:ring-2 focus:ring-emerald-500 w-48" />
                <button onClick={() => exportCSV(
                  purchaseBookExportRows.map(e => ({
                    fecha: e.timestamp.toISOString().slice(0,10),
                    proveedor: e.supplier,
                    descripcion: e.description,
                    operador: String((e as any).operator ?? '').trim() || 'SISTEMA',
                    detalle_productos: e.productDetails,
                    montoUSD: e.amountUSD,
                    estado: e.status
                  })),
                  `libro_compras_${new Date().toISOString().split('T')[0]}.csv`,
                  { reportLabel: 'Libro de compras', filterLabel: getActiveFilterLabel(), includeTotals: true }
                )}
                  disabled={!canExportPurchasesReports}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-3 h-3" /> Excel
                </button>
                <button
                  disabled={!canExportPurchasesReports}
                  onClick={() => reportService.exportPurchasesBookToPDF(purchaseBookExportRows, {
                    start: purchaseDateRange.start,
                    end: purchaseDateRange.end,
                    search: purchaseSearch,
                    filterLabel: getActiveFilterLabel()
                  })}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Proveedor</th>
                    <th className="px-6 py-3">Descripción</th>
                    <th className="px-6 py-3 text-right">Monto $</th>
                    <th className="px-6 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPurchases.length === 0 ? (
                    <tr><td colSpan={5} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin registros en este período</td></tr>
                  ) : filteredPurchases.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-[11px] font-mono text-slate-500">{e.timestamp.toLocaleDateString('es-VE')}</td>
                      <td className="px-6 py-3 text-[11px] font-black text-slate-900">{e.supplier}</td>
                      <td className="px-6 py-3 text-[11px] text-slate-600 max-w-xs truncate">{e.description}</td>
                      <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-slate-900">$ {e.amountUSD.toFixed(2)}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${e.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : e.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {e.status === 'PAID' ? 'Pagado' : e.status === 'OVERDUE' ? 'Vencido' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {filteredPurchases.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={3} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase">Total ({filteredPurchases.length} facturas)</td>
                      <td className="px-6 py-3 text-right font-black font-mono text-slate-900 text-[12px]">$ {filteredPurchases.reduce((a, b) => a + b.amountUSD, 0).toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Anticipos clientes / proveedores (Firestore) */}
      {activeTab === 'advances' && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-amber-50/40 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Reporte de anticipos</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">
                  Listado por línea · mismos datos que Finanzas &gt; Anticipos
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden text-[10px] font-black">
                  <button
                    type="button"
                    onClick={() => setAdvancesReportKind('client')}
                    className={`px-4 py-2 transition-all ${advancesReportKind === 'client' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Clientes
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancesReportKind('supplier')}
                    className={`px-4 py-2 transition-all ${advancesReportKind === 'supplier' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Proveedores
                  </button>
                </div>
                <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden text-[10px] font-black">
                  <button
                    type="button"
                    onClick={() => setAdvancesIncludeApplied(false)}
                    className={`px-3 py-2 transition-all ${!advancesIncludeApplied ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Disponibles
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdvancesIncludeApplied(true)}
                    className={`px-3 py-2 transition-all ${advancesIncludeApplied ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    Todos
                  </button>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <input
                    type="date"
                    value={advanceDateRange.start}
                    onChange={(e) => setAdvanceDateRange((p) => ({ ...p, start: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0"
                  />
                  <span className="text-slate-300">/</span>
                  <input
                    type="date"
                    value={advanceDateRange.end}
                    onChange={(e) => setAdvanceDateRange((p) => ({ ...p, end: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0"
                  />
                </div>
                <input
                  type="text"
                  placeholder={advancesReportKind === 'client' ? 'Cliente, factura, nota…' : 'Proveedor, referencia, nota…'}
                  value={advanceSearch}
                  onChange={(e) => setAdvanceSearch(e.target.value)}
                  className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black text-slate-700 focus:ring-2 focus:ring-amber-500 min-w-[12rem] flex-1 max-w-xs"
                />
                <button
                  type="button"
                  onClick={() => setAdvancesRefreshKey((k) => k + 1)}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all"
                >
                  Actualizar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 px-8 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="rounded-2xl border border-amber-200 bg-white p-4 text-center">
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Registros (filtrados)</p>
                <p className="text-xl font-black text-slate-900 mt-1">
                  {advancesReportKind === 'client' ? advancesClientTotals.count : advancesSupplierTotals.count}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Monto original USD</p>
                <p className="text-xl font-black text-slate-800 mt-1">
                  ${(advancesReportKind === 'client' ? advancesClientTotals.originalUSD : advancesSupplierTotals.originalUSD).toFixed(2)}
                </p>
              </div>
              <div className="rounded-2xl border border-amber-200 bg-white p-4 text-center">
                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Saldo pendiente USD</p>
                <p className="text-xl font-black text-amber-700 mt-1">
                  ${(advancesReportKind === 'client' ? advancesClientTotals.balanceUSD : advancesSupplierTotals.balanceUSD).toFixed(2)}
                </p>
              </div>
            </div>

            {advancesReportKind === 'client' && (
              <div className="p-4 sm:px-8 sm:pb-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={reportClientAdvancesRows.length === 0}
                  onClick={() =>
                    exportCSV(
                      reportClientAdvancesRows.map((a) => ({
                        fecha: String(a.createdAt ?? '').slice(0, 10),
                        cliente: a.customerName,
                        clienteId: a.customerId,
                        montoUSD: roundMoney(a.amountUSD),
                        saldoUSD: roundMoney(a.balanceUSD),
                        moneda: a.currency,
                        bsOriginal: a.originalAmountVES ?? '',
                        tasa: a.rateAtCreation ?? '',
                        estado: a.status,
                        facturaOrigen: a.originCorrelativo || a.originInvoiceId || '',
                        nota: a.note ?? '',
                        idAnticipo: a.id
                      })),
                      `anticipos_clientes_${new Date().toISOString().split('T')[0]}.csv`,
                      { reportLabel: 'Anticipos Clientes', filterLabel: getActiveFilterLabel(), includeTotals: true }
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel
                </button>
                <button
                  type="button"
                  disabled={reportClientAdvancesRows.length === 0}
                  onClick={() =>
                    void printService.printAdvancesReport({
                      kind: 'client',
                      periodLabel: `${advanceDateRange.start} a ${advanceDateRange.end}`,
                      filterLabel: getActiveFilterLabel(),
                      clientRows: reportClientAdvancesRows
                    })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              </div>
            )}

            {advancesReportKind === 'supplier' && (
              <div className="p-4 sm:px-8 sm:pb-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={reportSupplierAdvancesRows.length === 0 || loadingAdvancesReport}
                  onClick={() =>
                    exportCSV(
                      reportSupplierAdvancesRows.map((a) => ({
                        fecha: String(a.createdAt ?? '').slice(0, 10),
                        proveedor: a.supplierName,
                        proveedorId: a.supplierId ?? '',
                        montoUSD: roundMoney(a.amountUSD),
                        saldoUSD: roundMoney(a.balanceUSD),
                        moneda: a.currency,
                        bsOriginal: a.originalAmountVES ?? '',
                        referencia: a.reference,
                        metodo: a.method ?? '',
                        estado: a.status,
                        nota: a.note ?? '',
                        idAnticipo: a.id
                      })),
                      `anticipos_proveedores_${new Date().toISOString().split('T')[0]}.csv`,
                      { reportLabel: 'Anticipos Proveedores', filterLabel: getActiveFilterLabel(), includeTotals: true }
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel
                </button>
                <button
                  type="button"
                  disabled={reportSupplierAdvancesRows.length === 0 || loadingAdvancesReport}
                  onClick={() =>
                    void printService.printAdvancesReport({
                      kind: 'supplier',
                      periodLabel: `${advanceDateRange.start} a ${advanceDateRange.end}`,
                      filterLabel: getActiveFilterLabel(),
                      supplierRows: reportSupplierAdvancesRows
                    })
                  }
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              </div>
            )}

            <div className="overflow-x-auto">
              {advancesReportKind === 'supplier' && loadingAdvancesReport ? (
                <div className="py-20 text-center text-[11px] font-bold text-slate-400 uppercase">Cargando anticipos de proveedor…</div>
              ) : advancesReportKind === 'client' ? (
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3">Fecha</th>
                      <th className="px-6 py-3">Cliente</th>
                      <th className="px-6 py-3 text-right">Monto USD</th>
                      <th className="px-6 py-3 text-right">Saldo USD</th>
                      <th className="px-6 py-3 text-center">Estado</th>
                      <th className="px-6 py-3">Fact. origen</th>
                      <th className="px-6 py-3 max-w-[200px]">Nota</th>
                      <th className="px-6 py-3 font-mono text-[8px]">Id</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportClientAdvancesRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-300 font-black uppercase text-sm">
                          Sin anticipos de clientes con los filtros seleccionados
                        </td>
                      </tr>
                    ) : (
                      reportClientAdvancesRows.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-[11px] font-mono text-slate-600">{String(a.createdAt ?? '').slice(0, 10)}</td>
                          <td className="px-6 py-3 text-[11px]">
                            <span className="font-black text-slate-900 block">{a.customerName}</span>
                            <span className="text-[9px] font-mono text-slate-400">{a.customerId}</span>
                          </td>
                          <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-slate-800">{usd(a.amountUSD)}</td>
                          <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-amber-700">{usd(a.balanceUSD)}</td>
                          <td className="px-6 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                a.status === 'AVAILABLE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : a.status === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {a.status === 'AVAILABLE' ? 'Disponible' : a.status === 'PARTIAL' ? 'Parcial' : 'Aplicado'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-[10px] font-mono text-slate-700">{a.originCorrelativo || a.originInvoiceId || '—'}</td>
                          <td className="px-6 py-3 text-[10px] text-slate-600 max-w-[220px] truncate" title={a.note}>
                            {a.note || '—'}
                          </td>
                          <td className="px-6 py-3 text-[9px] font-mono text-slate-400 truncate max-w-[100px]" title={a.id}>
                            {a.id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="px-6 py-3">Fecha</th>
                      <th className="px-6 py-3">Proveedor</th>
                      <th className="px-6 py-3 text-right">Monto USD</th>
                      <th className="px-6 py-3 text-right">Saldo USD</th>
                      <th className="px-6 py-3 text-center">Estado</th>
                      <th className="px-6 py-3">Referencia</th>
                      <th className="px-6 py-3 max-w-[200px]">Nota</th>
                      <th className="px-6 py-3 font-mono text-[8px]">Id</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reportSupplierAdvancesRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-16 text-center text-slate-300 font-black uppercase text-sm">
                          Sin anticipos de proveedores con los filtros seleccionados
                        </td>
                      </tr>
                    ) : (
                      reportSupplierAdvancesRows.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-3 text-[11px] font-mono text-slate-600">{String(a.createdAt ?? '').slice(0, 10)}</td>
                          <td className="px-6 py-3 text-[11px]">
                            <span className="font-black text-slate-900 block">{a.supplierName}</span>
                            {a.supplierId ? <span className="text-[9px] font-mono text-slate-400">{a.supplierId}</span> : null}
                          </td>
                          <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-slate-800">{usd(a.amountUSD)}</td>
                          <td className="px-6 py-3 text-[11px] font-black font-mono text-right text-amber-700">{usd(a.balanceUSD)}</td>
                          <td className="px-6 py-3 text-center">
                            <span
                              className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                                a.status === 'AVAILABLE'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : a.status === 'PARTIAL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {a.status === 'AVAILABLE' ? 'Disponible' : a.status === 'PARTIAL' ? 'Parcial' : 'Aplicado'}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-[10px] font-mono text-slate-700">{a.reference || '—'}</td>
                          <td className="px-6 py-3 text-[10px] text-slate-600 max-w-[220px] truncate" title={a.note}>
                            {a.note || '—'}
                          </td>
                          <td className="px-6 py-3 text-[9px] font-mono text-slate-400 truncate max-w-[100px]" title={a.id}>
                            {a.id}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-[9px] text-slate-500 font-bold uppercase px-8 py-3 border-t border-slate-100">
              Clientes: datos en tiempo real desde Firestore. Proveedores: se consultan al elegir la pestaña o al pulsar Actualizar.
            </p>
          </div>
        </div>
      )}

      {/* REP-05: Egresos / Gastos */}
      {activeTab === "expenses" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Libro de Egresos</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gastos operativos fijos y variables</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-100 p-2 rounded-xl border border-slate-200">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <input type="date" value={expenseDateRange.start} onChange={e => setExpenseDateRange(p => ({ ...p, start: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0" />
                  <span className="text-slate-300">/</span>
                  <input type="date" value={expenseDateRange.end} onChange={e => setExpenseDateRange(p => ({ ...p, end: e.target.value }))}
                    className="bg-transparent border-0 p-0 text-[10px] font-black text-slate-600 focus:ring-0" />
                </div>
                <div className="flex bg-slate-100 rounded-xl border border-slate-200 overflow-hidden text-[10px] font-black uppercase">
                  {(['ALL', 'FIXED', 'VARIABLE'] as const).map(cat => (
                    <button key={cat} onClick={() => setExpenseCategory(cat)}
                      className={`px-3 py-2 transition-all ${expenseCategory === cat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}>
                      {cat === 'ALL' ? 'Todos' : cat === 'FIXED' ? 'Fijos' : 'Variables'}
                    </button>
                  ))}
                </div>
                <button onClick={() => exportCSV(
                  filteredExpenses.map(e => ({ fecha: e.timestamp.toISOString().slice(0,10), descripcion: e.description, categoria: e.category, montoUSD: e.amountUSD })),
                  `egresos_${new Date().toISOString().split('T')[0]}.csv`,
                  { reportLabel: 'Libro de egresos', filterLabel: getActiveFilterLabel(), includeTotals: true }
                )}
                  disabled={!canExportExpensesReports}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-3 h-3" /> Excel
                </button>
                <button
                  disabled={!canExportExpensesReports}
                  onClick={() => reportService.exportExpensesBookToPDF(filteredExpenses, {
                    start: expenseDateRange.start,
                    end: expenseDateRange.end,
                    category: expenseCategory,
                    filterLabel: getActiveFilterLabel()
                  })}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-3 h-3" /> PDF
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3">Fecha</th>
                    <th className="px-6 py-3">Descripción</th>
                    <th className="px-6 py-3 text-center">Categoría</th>
                    <th className="px-6 py-3 text-right">Monto $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.length === 0 ? (
                    <tr><td colSpan={4} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin registros en este período</td></tr>
                  ) : filteredExpenses.map((e, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-[11px] font-mono text-slate-500">{e.timestamp.toLocaleDateString('es-VE')}</td>
                      <td className="px-6 py-3 text-[11px] text-slate-700">{e.description}</td>
                      <td className="px-6 py-3 text-center">
                        <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black uppercase ${e.category === 'FIXED' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                          {e.category === 'FIXED' ? 'Fijo' : 'Variable'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right font-black font-mono text-slate-900 text-[11px]">$ {e.amountUSD.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
                {filteredExpenses.length > 0 && (
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td colSpan={3} className="px-6 py-3 text-[10px] font-black text-slate-500 uppercase">Total ({filteredExpenses.length} registros)</td>
                      <td className="px-6 py-3 text-right font-black font-mono text-slate-900 text-[12px]">$ {filteredExpenses.reduce((a, b) => a + b.amountUSD, 0).toFixed(2)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REP-08: Mermas */}
      {activeTab === "shrinkage" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Mermas y Contracciones</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pérdidas por merma natural y manipulación</p>
              </div>
              <button onClick={() => exportCSV(
                shrinkageStats.byProduct.map(p => ({ producto: p.description, merma_natural_kg: p.natural, merma_manip_kg: p.manip, total_kg: p.total })),
                `mermas_${new Date().toISOString().split('T')[0]}.csv`,
                { reportLabel: 'Mermas y contracciones', filterLabel: getActiveFilterLabel(), includeTotals: true }
              )}
                disabled={!canExportShrinkageReports}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="w-3 h-3" /> Excel
              </button>
              <button
                disabled={!canExportShrinkageReports}
                onClick={() => reportService.exportShrinkageToPDF(shrinkageStats, { filterLabel: getActiveFilterLabel() })}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <FileText className="w-3 h-3" /> PDF
              </button>
            </div>

            <div className="grid grid-cols-3 gap-px bg-slate-200 border-b border-slate-200">
              {[
                { label: 'Merma Natural', value: `${shrinkageStats.totalNatural.toFixed(2)} kg`, color: 'text-amber-700' },
                { label: 'Merma Manipulación', value: `${shrinkageStats.totalManip.toFixed(2)} kg`, color: 'text-red-700' },
                { label: 'Total Pérdida', value: `${(shrinkageStats.totalNatural + shrinkageStats.totalManip).toFixed(2)} kg`, color: 'text-slate-900' },
              ].map((s, i) => (
                <div key={i} className="bg-white p-6">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{s.label}</p>
                  <p className={`text-2xl font-black font-mono mt-1 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3">Producto</th>
                    <th className="px-6 py-3 text-right">Natural (kg)</th>
                    <th className="px-6 py-3 text-right">Manipulación (kg)</th>
                    <th className="px-6 py-3 text-right">Total (kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shrinkageStats.byProduct.length === 0 ? (
                    <tr><td colSpan={4} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin mermas registradas</td></tr>
                  ) : shrinkageStats.byProduct.map((p, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-[11px] font-black text-slate-900">{p.description}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-mono text-amber-700">{p.natural.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-mono text-red-700">{p.manip.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-black font-mono text-slate-900">{p.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'profit' && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Utilidad bruta vendida</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 max-w-2xl">
                  Total USD facturado menos costo de mercancía vendida (lotes despachados en la venta; si no hay trazabilidad,
                  costo medio ponderado del stock actual del SKU).
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!canExportProfitReports}
                  onClick={() => reportService.exportProfitPerformanceToPDF(profitFilterPayload)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button
                  type="button"
                  disabled={!canExportProfitReports}
                  onClick={() => {
                    const baseRows = profitSummary.bySku.map((r) => ({
                      sku: r.code,
                      descripcion: r.description,
                      qty_vendida: r.qtySold,
                      venta_usd: r.revenueUSD,
                      costo_usd: r.costUSD,
                      utilidad_usd: r.profitUSD
                    }));
                    const summaryRows = [
                      {
                        sku: 'RESUMEN',
                        descripcion: 'Total Vendido',
                        qty_vendida: '',
                        venta_usd: profitSummary.revenueUSD,
                        costo_usd: '',
                        utilidad_usd: ''
                      },
                      {
                        sku: 'RESUMEN',
                        descripcion: 'Total Utilidad',
                        qty_vendida: '',
                        venta_usd: '',
                        costo_usd: '',
                        utilidad_usd: profitSummary.grossProfitUSD
                      }
                    ];
                    exportCSV(
                      [...baseRows, ...summaryRows],
                      `utilidad_sku_mes_${new Date().toISOString().split('T')[0]}.csv`,
                      { reportLabel: 'Utilidad por SKU (periodo filtrado)', filterLabel: getActiveFilterLabel(), includeTotals: false }
                    );
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel mes (SKU)
                </button>
              </div>
            </div>

            <div className="p-8 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Desde</label>
                <input
                  type="date"
                  value={profitDateRange.start}
                  onChange={(e) => setProfitDateRange((prev) => ({ ...prev, start: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Hasta</label>
                <input
                  type="date"
                  value={profitDateRange.end}
                  onChange={(e) => setProfitDateRange((prev) => ({ ...prev, end: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700"
                />
              </div>
              <div>
                <label className="block text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Producto</label>
                <select
                  value={profitProductQuery}
                  onChange={(e) => setProfitProductQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 bg-white"
                >
                  <option value="ALL">Todos</option>
                  {profitProductOptions.map((p) => (
                    <option key={p.code} value={p.code}>
                      {p.code} - {p.description}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-slate-200 border-b border-slate-200">
              <div className="bg-white p-6 space-y-3 md:col-span-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{profitSummary.label}</p>
                <p className="text-[10px] font-bold text-slate-500">
                  {profitSummary.start.toLocaleDateString('es-VE')} — {profitSummary.end.toLocaleDateString('es-VE')}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 font-black uppercase text-[8px]">Tickets</span>
                    <p className="font-black text-slate-800">{profitSummary.tickets}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-black uppercase text-[8px]">Ítems vendidos</span>
                    <p className="font-black text-slate-800">{formatQuantity(profitSkuTotals.qtySold)}</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-black uppercase text-[8px]">Margen %</span>
                    <p className="font-black text-emerald-700">{profitSummary.marginPct.toFixed(1)} %</p>
                  </div>
                  <div>
                    <span className="text-slate-400 font-black uppercase text-[8px]">Venta USD</span>
                    <p className="font-mono font-black text-slate-800">{usd(profitSummary.revenueUSD)}</p>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-400 font-black uppercase text-[8px]">Costo USD</span>
                    <p className="font-mono font-black text-amber-800">{usd(profitSummary.costUSD)}</p>
                  </div>
                </div>
                <div className="flex justify-between text-[12px] pt-2 border-t border-slate-100">
                  <span className="text-slate-900 font-black uppercase">Utilidad</span>
                  <span className="font-mono font-black text-emerald-700">{usd(profitSummary.grossProfitUSD)}</span>
                </div>
              </div>
            </div>

            <div className="p-8 border-b border-slate-100">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                Detalle por SKU — periodo filtrado (por utilidad)
              </h4>
              <div className="overflow-x-auto max-h-[360px] overflow-y-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50 sticky top-0 z-10">
                    <tr className="text-[9px] font-black text-slate-400 uppercase">
                      <th className="px-4 py-3">SKU</th>
                      <th className="px-4 py-3">Descripción</th>
                      <th className="px-4 py-3 text-right">Cant.</th>
                      <th className="px-4 py-3 text-right">Venta USD</th>
                      <th className="px-4 py-3 text-right">Costo</th>
                      <th className="px-4 py-3 text-right">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitSummary.bySku.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-300 font-black uppercase">
                          Sin ventas en el periodo filtrado
                        </td>
                      </tr>
                    ) : (
                      profitSummary.bySku.map((r) => (
                        <tr key={r.code} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2 font-mono font-black text-slate-600">{r.code}</td>
                          <td className="px-4 py-2 font-bold text-slate-800 max-w-[200px] truncate">{r.description}</td>
                          <td className="px-4 py-2 text-right font-mono text-slate-600">{formatQuantity(r.qtySold)}</td>
                          <td className="px-4 py-2 text-right font-mono">{usd(r.revenueUSD)}</td>
                          <td className="px-4 py-2 text-right font-mono text-amber-800">{usd(r.costUSD)}</td>
                          <td className="px-4 py-2 text-right font-black font-mono text-emerald-700">{usd(r.profitUSD)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {profitSummary.bySku.length > 0 && (
                    <tfoot className="bg-slate-100 border-t border-slate-200">
                      <tr className="text-[10px] font-black uppercase text-slate-700">
                        <td className="px-4 py-2" colSpan={2}>Total filas ({profitSummary.bySku.length} ítems SKU)</td>
                        <td className="px-4 py-2 text-right font-mono">{formatQuantity(profitSkuTotals.qtySold)}</td>
                        <td className="px-4 py-2 text-right font-mono">{usd(profitSkuTotals.revenueUSD)}</td>
                        <td className="px-4 py-2 text-right font-mono text-amber-800">{usd(profitSkuTotals.costUSD)}</td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-700">{usd(profitSkuTotals.profitUSD)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>

            <div className="p-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                Tickets con mayor utilidad (periodo filtrado, top 25)
              </h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-50">
                    <tr className="text-[9px] font-black text-slate-400 uppercase">
                      <th className="px-4 py-3">Fecha</th>
                      <th className="px-4 py-3">Factura</th>
                      <th className="px-4 py-3 text-right">Venta</th>
                      <th className="px-4 py-3 text-right">Costo</th>
                      <th className="px-4 py-3 text-right">Utilidad</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {profitSummary.topSales.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-300 font-black uppercase">—</td>
                      </tr>
                    ) : (
                      profitSummary.topSales.map((s, idx) => (
                        <tr key={`${s.correlativo}-${idx}`} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2 font-mono text-slate-600">{s.ts.toLocaleString('es-VE')}</td>
                          <td className="px-4 py-2 font-black">{s.correlativo}</td>
                          <td className="px-4 py-2 text-right font-mono">{usd(s.revenueUSD)}</td>
                          <td className="px-4 py-2 text-right font-mono text-amber-800">{usd(s.costUSD)}</td>
                          <td className="px-4 py-2 text-right font-black font-mono text-emerald-700">{usd(s.profitUSD)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {profitSummary.topSales.length > 0 && (
                    <tfoot className="bg-slate-100 border-t border-slate-200">
                      <tr className="text-[10px] font-black uppercase text-slate-700">
                        <td className="px-4 py-2" colSpan={2}>Total tickets mostrados ({profitSummary.topSales.length})</td>
                        <td className="px-4 py-2 text-right font-mono">{usd(profitTopSalesTotals.revenueUSD)}</td>
                        <td className="px-4 py-2 text-right font-mono text-amber-800">{usd(profitTopSalesTotals.costUSD)}</td>
                        <td className="px-4 py-2 text-right font-mono text-emerald-700">{usd(profitTopSalesTotals.profitUSD)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-emerald-950">
                    <tr className="text-[9px] font-black uppercase tracking-wider text-white">
                      <th className="px-4 py-2">Indicador</th>
                      <th className="px-4 py-2 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white text-[11px]">
                    <tr>
                      <td className="px-4 py-2 font-black uppercase text-slate-700">Total Vendido</td>
                      <td className="px-4 py-2 text-right font-mono font-black text-slate-900">{usd(profitSummary.revenueUSD)}</td>
                    </tr>
                    <tr className="bg-emerald-50">
                      <td className="px-4 py-2 font-black uppercase text-emerald-800">Total Utilidad</td>
                      <td className="px-4 py-2 text-right font-mono font-black text-emerald-800">{usd(profitSummary.grossProfitUSD)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "margins" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex justify-between items-center">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">
                  {marginFilterMode === 'PRODUCT' ? 'Márgenes por Producto' : 'Márgenes por Lote'}
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Costo de compra real vs precio de venta actual</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => reportService.exportMarginReportToPDF({
                  productQuery: marginFilterMode === 'PRODUCT' ? marginFilterQuery : '',
                  batchQuery: marginFilterMode === 'BATCH' ? marginFilterQuery : '',
                  dateRange: marginDateRange
                })}
                  disabled={!canExportMarginsReports}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-950 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-3 h-3" /> PDF
                </button>
                <button onClick={() => exportCSV(
                  landedCostData.map(b => ({ sku: b.sku, descripcion: b.description, costo_unit_usd: b.unitCost, costo_lote_inicial_usd: b.purchaseCostUSD, costo_existencia_usd: b.onHandCostUSD, qty: b.qty, precio_venta: b.currentPriceUSD, margen_pct: Number(b.grossMarginPct.toFixed(1)), vendido_qty: b.soldQty, total_usd: b.revenueUSD, utilidad_vendida_usd: b.soldProfitUSD })),
                  `margenes_${new Date().toISOString().split('T')[0]}.csv`,
                  {
                    reportLabel: marginFilterMode === 'PRODUCT' ? 'Margenes por producto' : 'Margenes por lote',
                    filterLabel: getActiveFilterLabel(),
                    includeTotals: true
                  }
                )}
                  disabled={!canExportMarginsReports}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                  <Download className="w-3 h-3" /> Excel
                </button>
              </div>
            </div>
            <div className="px-8 py-4 border-b border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="date"
                value={marginDateRange.start}
                onChange={(e) => setMarginDateRange((prev) => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 bg-white"
              />
              <input
                type="date"
                value={marginDateRange.end}
                onChange={(e) => setMarginDateRange((prev) => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 bg-white"
              />
              <select
                value={marginFilterMode}
                onChange={(e) => {
                  const nextMode = (e.target.value === 'BATCH' ? 'BATCH' : 'PRODUCT') as 'PRODUCT' | 'BATCH';
                  setMarginFilterMode(nextMode);
                  setMarginFilterQuery('');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 bg-white"
              >
                <option value="PRODUCT">Filtrar por Producto</option>
                <option value="BATCH">Filtrar por Lote</option>
              </select>
              <input
                type="text"
                value={marginFilterQuery}
                onChange={(e) => setMarginFilterQuery(e.target.value)}
                placeholder={marginFilterMode === 'PRODUCT'
                  ? 'Escribe SKU o nombre del producto (ej: Mani)'
                  : 'Escribe numero/codigo de lote'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 md:col-span-3"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3">SKU</th>
                    <th className="px-6 py-3">Descripción</th>
                    <th className="px-6 py-3 text-right">Stock</th>
                    <th className="px-6 py-3 text-right">Costo Unit. $</th>
                    <th className="px-6 py-3 text-right">Precio Venta $</th>
                    <th className="px-6 py-3 text-right">Margen %</th>
                    <th className="px-6 py-3 text-right">Vendido</th>
                    <th className="px-6 py-3 text-right">Total $</th>
                    <th className="px-6 py-3 text-right">Utilidad $</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {landedCostData.length === 0 ? (
                    <tr><td colSpan={9} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin lotes con costo registrado</td></tr>
                  ) : landedCostData.map((b, i) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-[10px] font-black text-slate-500 font-mono">{b.sku}</td>
                      <td className="px-6 py-3 text-[11px] font-black text-slate-900 max-w-xs truncate">{b.description}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-mono text-slate-600">{formatQuantity(b.qty)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-mono text-slate-700">$ {b.unitCost.toFixed(3)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-black font-mono text-emerald-700">$ {b.currentPriceUSD.toFixed(3)}</td>
                      <td className="px-6 py-3 text-right">
                        <span className={`inline-flex px-2 py-1 rounded-lg text-[10px] font-black ${
                          b.grossMarginPct >= 30 ? 'bg-emerald-100 text-emerald-700' :
                          b.grossMarginPct >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>{b.grossMarginPct.toFixed(1)}%</span>
                      </td>
                      <td className="px-6 py-3 text-right text-[11px] font-mono text-slate-500">{formatQuantity(b.soldQty)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-black font-mono text-blue-700">$ {b.revenueUSD.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right text-[11px] font-black font-mono text-emerald-700">$ {b.soldProfitUSD.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(() => {
              const stocks = dataService.getStocks();
              const withStock = stocks.filter(s => (s.lotes || []).reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0) > 0);
              const totalValCosto = inventoryStats.reduce((a, s) => a + (Number(s.valueUSD) || 0), 0);
              const totalValVenta = reportService.getTotalValorization('sale');
              const bajoMinimo = stocks.filter(s => {
                const total = (s.lotes || []).reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                const min = Number((s as any).minStock ?? 0) || 0;
                return min > 0 && total < min;
              }).length;
              return (
                <>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Productos con Stock</p>
                    <p className="text-3xl font-black text-slate-900 mt-1">{withStock.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valorización (Venta)</p>
                    <p className="text-3xl font-black text-emerald-600 mt-1">$ {totalValVenta.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Valorización (Costo)</p>
                    <p className="text-3xl font-black text-blue-600 mt-1">$ {totalValCosto.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Bajo Mínimo</p>
                    <p className={`text-3xl font-black mt-1 ${bajoMinimo > 0 ? 'text-red-500' : 'text-slate-900'}`}>{bajoMinimo}</p>
                  </div>
                </>
              );
            })()}
          </div>

          {/* Tabla de Inventario */}
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-3">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Reportes de Inventario</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Valorización · Lotes · Kardex</p>
              </div>
              <div className="flex flex-col items-end gap-2 max-w-xl">
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <input
                    type="text"
                    value={invSearch}
                    onChange={e => setInvSearch(e.target.value)}
                    placeholder="Buscar producto..."
                    className="px-4 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 w-48 outline-none focus:border-emerald-400 bg-white"
                  />
                  <select
                    value={invWarehouse}
                    onChange={e => setInvWarehouse(e.target.value as any)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-bold text-slate-700 bg-white outline-none focus:border-emerald-400"
                  >
                    <option value="ALL">Todos los almacenes</option>
                    <option value="Galpon D3">Galpón D3</option>
                    <option value="Pesa D2">Pesa D2</option>
                    <option value="exibicion D1">Exhibición D1</option>
                  </select>
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date().toISOString().split('T')[0];
                      if (invView === 'stock') {
                        const rows = invFilteredStocks
                          .map((s: any) => {
                            const total = (s.lotes || []).reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                            if (total <= 0.000001) return null;
                            return {
                              codigo: s.code,
                              descripcion: s.description,
                              galpon: roundMoney(Number(s.d3 ?? 0) || 0),
                              pesa: roundMoney(Number(s.d2 ?? 0) || 0),
                              exhibicion: roundMoney(Number(s.a1 ?? 0) || 0),
                              total_existencia: roundMoney(total),
                              unidad: s.unit ?? '',
                              estado: 'CON EXISTENCIA'
                            };
                          })
                          .filter(Boolean) as any[];
                        if (!rows.length) {
                          window.alert('No hay productos con existencia para los filtros actuales.');
                          return;
                        }
                        exportCSV(rows, `inventario_stock_disponible_${date}.csv`, {
                          reportLabel: 'Stock actual (solo con existencia)',
                          filterLabel: invExportFilterLabel,
                          includeTotals: false
                        });
                        return;
                      }
                      if (invView === 'valorizacion') {
                        const rows = invFilteredStocks
                          .map((s: any) => {
                            const lotes = s.lotes || [];
                            const total = lotes.reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                            if (total <= 0.000001) return null;
                            const valCosto = lotes.reduce(
                              (a: number, l: any) => a + (Number(l.qty) || 0) * (Number(l.costUSD) || 0),
                              0
                            );
                            const pCostoPond = total > 0 ? valCosto / total : 0;
                            return {
                              codigo: s.code,
                              descripcion: s.description,
                              galpon: roundMoney(Number(s.d3 ?? 0) || 0),
                              pesa: roundMoney(Number(s.d2 ?? 0) || 0),
                              exhibicion: roundMoney(Number(s.a1 ?? 0) || 0),
                              total_unidades: roundMoney(total),
                              unidad: s.unit ?? '',
                              precio_costo_promedio_ponderado_usd: roundMoney(pCostoPond),
                              valor_inventario_a_costo_usd: roundMoney(valCosto),
                              nota: 'Valor = suma (cantidad × costo USD) por lote con existencia'
                            };
                          })
                          .filter(Boolean) as any[];
                        if (!rows.length) {
                          window.alert('No hay existencia para valorizar a costo con los filtros actuales.');
                          return;
                        }
                        exportCSV(rows, `inventario_valorizacion_costo_disponible_${date}.csv`, {
                          reportLabel: 'Valorización a costo (existencia disponible)',
                          filterLabel: invExportFilterLabel,
                          includeTotals: false
                        });
                        return;
                      }
                      const rows = invLotRows.map(({ s, l }) => {
                        const qty = Number(l.qty) || 0;
                        const cost = Number(l.costUSD) || 0;
                        const valCosto = roundMoney(qty * cost);
                        const exp = l.expiry ? new Date(l.expiry) : null;
                        const now = new Date();
                        const expired = Boolean(exp && exp < now);
                        return {
                          sku: s.code,
                          producto: s.description,
                          lote_codigo: String(l.batch ?? ''),
                          lote_id: String(l.id ?? ''),
                          almacen: l.warehouse ?? '',
                          cantidad: roundMoney(qty),
                          unidad: s.unit ?? '',
                          costo_unitario_usd: roundMoney(cost),
                          valor_costo_lote_usd: valCosto,
                          fecha_vencimiento_iso: exp ? exp.toISOString().split('T')[0] : '',
                          fecha_vencimiento: exp ? exp.toLocaleDateString('es-VE') : '',
                          estado_lote: qty <= 0 ? 'VACIO' : expired ? 'VENCIDO' : 'OK'
                        };
                      });
                      if (!rows.length) {
                        window.alert('No hay líneas de lote para exportar con los filtros actuales.');
                        return;
                      }
                      exportCSV(rows, `inventario_lotes_vencimiento_${date}.csv`, {
                        reportLabel: 'Lotes y fechas de vencimiento (una fila por lote)',
                        filterLabel: invExportFilterLabel,
                        includeTotals: false
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-700 transition-all"
                  >
                    <Download className="w-3 h-3" /> CSV ({invView === 'stock' ? 'stock' : invView === 'valorizacion' ? 'costo' : 'lotes'})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const date = new Date().toISOString().split('T')[0];
                      const rows = invCatalogStocks.map((s: any) => {
                        const lotes = s.lotes || [];
                        const total = lotes.reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                        return {
                          codigo: s.code,
                          descripcion: s.description,
                          galpon: roundMoney(Number(s.d3 ?? 0) || 0),
                          pesa: roundMoney(Number(s.d2 ?? 0) || 0),
                          exhibicion: roundMoney(Number(s.a1 ?? 0) || 0),
                          total_existencia: roundMoney(total),
                          unidad: s.unit ?? '',
                          estado_existencia: total > 0.000001 ? 'CON EXISTENCIA' : 'SIN EXISTENCIA'
                        };
                      });
                      if (!rows.length) {
                        window.alert('No hay productos que coincidan con la búsqueda.');
                        return;
                      }
                      const catLabel = invSearch.trim()
                        ? `Catálogo filtrado por búsqueda (todos los almacenes)`
                        : 'Catálogo completo (todos los productos, todos los almacenes)';
                      exportCSV(rows, `inventario_catalogo_completo_${date}.csv`, {
                        reportLabel: 'Todos los productos (con y sin existencia)',
                        filterLabel: catLabel,
                        includeTotals: false
                      });
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-slate-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-500 transition-all"
                  >
                    <Download className="w-3 h-3" /> Todos los productos
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const fl = invExportFilterLabel;
                      if (invView === 'stock') {
                        const rows = invFilteredStocks
                          .map((s: any) => {
                            const total = (s.lotes || []).reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                            if (total <= 0.000001) return null;
                            return {
                              code: String(s.code ?? ''),
                              description: String(s.description ?? ''),
                              galpon: Number(s.d3 ?? 0) || 0,
                              pesa: Number(s.d2 ?? 0) || 0,
                              exhib: Number(s.a1 ?? 0) || 0,
                              total,
                              unit: String(s.unit ?? ''),
                              estado: 'CON EXISTENCIA'
                            };
                          })
                          .filter(Boolean) as Array<{
                            code: string;
                            description: string;
                            galpon: number;
                            pesa: number;
                            exhib: number;
                            total: number;
                            unit: string;
                            estado: string;
                          }>;
                        if (!rows.length) {
                          window.alert('No hay productos con existencia para el PDF.');
                          return;
                        }
                        reportService.exportInventoryStockOnHandPDF({ rows, filterLabel: fl });
                        return;
                      }
                      if (invView === 'valorizacion') {
                        reportService.exportInventoryToPDF({
                          pricing: 'cost',
                          currency: valuationCurrency,
                          vesRate: valuationVesRate,
                          onlyWithStock: true
                        });
                        return;
                      }
                      const now = new Date();
                      const rows = invLotRows.map(({ s, l }) => {
                        const qty = Number(l.qty) || 0;
                        const cost = Number(l.costUSD) || 0;
                        const valCosto = roundMoney(qty * cost);
                        const exp = l.expiry ? new Date(l.expiry) : null;
                        const expired = Boolean(exp && exp < now);
                        const estado = qty <= 0 ? 'VACIO' : expired ? 'VENCIDO' : 'OK';
                        return {
                          sku: String(s.code ?? ''),
                          producto: String(s.description ?? ''),
                          lote_codigo: String(l.batch ?? ''),
                          lote_id: String(l.id ?? ''),
                          almacen: String(l.warehouse ?? ''),
                          cantidad: qty,
                          unidad: String(s.unit ?? ''),
                          costo_unit_usd: cost,
                          valor_costo_usd: valCosto,
                          fecha_vencimiento: exp ? exp.toLocaleDateString('es-VE') : '—',
                          estado_lote: estado
                        };
                      });
                      reportService.exportInventoryLotsExpiryPDF({ rows, filterLabel: fl });
                    }}
                    className="flex items-center gap-2 px-3 py-2 bg-emerald-800 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all"
                  >
                    <Download className="w-3 h-3" /> PDF ({invView === 'stock' ? 'stock' : invView === 'valorizacion' ? 'costo disp.' : 'lotes'})
                  </button>
                </div>
                <p className="text-[8px] text-slate-400 font-bold text-right leading-snug">
                  CSV/PDF usan la pestaña activa. &quot;Todos los productos&quot; exporta el listado completo (búsqueda opcional), con y sin stock, en todos los almacenes.
                </p>
              </div>
            </div>

            {/* Sub-tabs: Stock Actual / Valorización / Lotes */}
            <div>
              <div className="px-8 border-b border-slate-100 flex gap-6">
                {(['stock', 'valorizacion', 'lotes'] as const).map(v => {
                  const labels: Record<string, string> = { stock: 'Stock Actual', valorizacion: 'Valorización Completa', lotes: 'Lotes' };
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setInvView(v)}
                      className={`py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all ${
                        invView === v ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                      }`}
                    >{labels[v]}</button>
                  );
                })}
              </div>

              <div className="overflow-x-auto">
                {invView === 'stock' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">Código</th>
                        <th className="px-5 py-3">Descripción</th>
                        <th className="px-4 py-3 text-right bg-blue-50/40">Galpón</th>
                        <th className="px-4 py-3 text-right bg-amber-50/40">Pesa</th>
                        <th className="px-4 py-3 text-right bg-emerald-50/40">Exhib.</th>
                        <th className="px-5 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invFilteredStocks.length === 0 ? (
                        <tr><td colSpan={7} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin productos</td></tr>
                      ) : invFilteredStocks.map((s: any) => {
                        const total = (s.lotes || []).reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                        return (
                          <tr key={s.code} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-[10px] font-black font-mono text-slate-500">{s.code}</td>
                            <td className="px-5 py-3 text-[11px] font-black text-slate-900 uppercase">{s.description}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-mono text-blue-600 bg-blue-50/20">{formatQuantity(s.d3 ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-mono text-amber-600 bg-amber-50/20">{formatQuantity(s.d2 ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-mono text-emerald-600 bg-emerald-50/20">{formatQuantity(s.a1 ?? 0)}</td>
                            <td className="px-5 py-3 text-right text-[12px] font-black font-mono text-slate-900">{formatQuantity(total)} <span className="text-[9px] text-slate-400">{s.unit}</span></td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black ${total > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                {total > 0 ? 'OK' : 'SIN STOCK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {invView === 'valorizacion' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">Código</th>
                        <th className="px-5 py-3">Descripción</th>
                        <th className="px-4 py-3 text-right bg-blue-50/40">Galpón</th>
                        <th className="px-4 py-3 text-right bg-amber-50/40">Pesa</th>
                        <th className="px-4 py-3 text-right bg-emerald-50/40">Exhib.</th>
                        <th className="px-4 py-3 text-right">Total</th>
                        <th className="px-4 py-3 text-right">P.Costo $</th>
                        <th className="px-4 py-3 text-right">P.Venta $</th>
                        <th className="px-4 py-3 text-right">Val.Costo $</th>
                        <th className="px-4 py-3 text-right">Val.Venta $</th>
                        <th className="px-4 py-3 text-right">Margen $</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invFilteredStocks.length === 0 ? (
                        <tr><td colSpan={12} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin productos</td></tr>
                      ) : invFilteredStocks.map((s: any) => {
                        const lotes = s.lotes || [];
                        const total = lotes.reduce((a: number, l: any) => a + (Number(l.qty) || 0), 0);
                        const valCosto = lotes.reduce((a: number, l: any) => a + ((Number(l.qty) || 0) * (Number(l.costUSD) || 0)), 0);
                        const pVenta = Number(s.priceUSD) || 0;
                        const valVenta = total * pVenta;
                        const margen = valVenta - valCosto;
                        const avgCosto = lotes.length > 0 ? lotes.reduce((a: number, l: any) => a + (Number(l.costUSD) || 0), 0) / lotes.length : 0;
                        return (
                          <tr key={s.code} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-[10px] font-black font-mono text-slate-500">{s.code}</td>
                            <td className="px-5 py-3 text-[11px] font-black text-slate-900 uppercase max-w-[180px] truncate">{s.description}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-blue-600 bg-blue-50/20">{formatQuantity(s.d3 ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-amber-600 bg-amber-50/20">{formatQuantity(s.d2 ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-emerald-600 bg-emerald-50/20">{formatQuantity(s.a1 ?? 0)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-black font-mono text-slate-900">{formatQuantity(total)} <span className="text-[8px] text-slate-400">{s.unit}</span></td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-slate-600">$ {avgCosto.toFixed(4)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-emerald-700">$ {pVenta.toFixed(4)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-black font-mono text-blue-700">$ {valCosto.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-black font-mono text-emerald-700">$ {valVenta.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-black font-mono">
                              <span className={margen >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                                {margen >= 0 ? '' : '-'}$ {Math.abs(margen).toFixed(2)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black ${total > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                                {total > 0 ? 'OK' : 'SIN STOCK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                {invView === 'lotes' && (
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-5 py-3">SKU</th>
                        <th className="px-5 py-3">Producto</th>
                        <th className="px-4 py-3">Lote</th>
                        <th className="px-4 py-3">Almacén</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Costo Unit. $</th>
                        <th className="px-4 py-3 text-right">Val. Costo $</th>
                        <th className="px-4 py-3 text-center">Vto.</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invLotRows.length === 0 ? (
                        <tr><td colSpan={9} className="py-16 text-center text-slate-300 font-black uppercase text-sm">Sin lotes</td></tr>
                      ) : invLotRows.map(({ s, l }) => {
                        const qty = Number(l.qty) || 0;
                        const cost = Number(l.costUSD) || 0;
                        const valCosto = qty * cost;
                        const exp = l.expiry ? new Date(l.expiry) : null;
                        const now = new Date();
                        const expired = Boolean(exp && exp < now);
                        const expLabel = exp ? exp.toLocaleDateString('es-VE') : '—';
                        return (
                          <tr key={`${s.code}-${l.id}`} className="hover:bg-slate-50 transition-colors">
                            <td className="px-5 py-3 text-[10px] font-black font-mono text-slate-500">{s.code}</td>
                            <td className="px-5 py-3 text-[11px] font-black text-slate-900 uppercase max-w-[160px] truncate">{s.description}</td>
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-600">{String(l.batch ?? l.id ?? '').slice(0, 10)}</td>
                            <td className="px-4 py-3 text-[10px] font-bold text-slate-600">{l.warehouse ?? '—'}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-black font-mono text-slate-900">{formatQuantity(qty)} <span className="text-[8px] text-slate-400">{s.unit}</span></td>
                            <td className="px-4 py-3 text-right text-[10px] font-mono text-slate-600">$ {cost.toFixed(4)}</td>
                            <td className="px-4 py-3 text-right text-[10px] font-black font-mono text-blue-700">$ {valCosto.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center text-[10px] font-mono">
                              <span className={expired ? 'text-red-600 font-black' : 'text-slate-500'}>{expLabel}</span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`inline-flex px-2 py-1 rounded-lg text-[9px] font-black ${qty > 0 && !expired ? 'bg-emerald-100 text-emerald-700' : qty === 0 ? 'bg-slate-100 text-slate-400' : 'bg-red-100 text-red-600'}`}>
                                {qty === 0 ? 'VACÍO' : expired ? 'VENCIDO' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "zclosure" && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-900 rounded-xl">
                  <Lock className="w-5 h-5 text-slate-100" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 uppercase">Cierre de Caja Z</h3>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consolidado Diario con Declaracion</p>
                </div>
              </div>
              <button onClick={() => {
                const selectedCashierLabel = zSelectedCashierIds.length === 0
                  ? 'Todos los cajeros'
                  : dataService.getUsers()
                      .filter((u) => zSelectedCashierIds.includes(String(u.id)))
                      .map((u) => u.name)
                      .join(', ');
                reportService.exportZClosureToPDF(
                  zClosureData,
                  selectedCashierLabel || 'Todos los cajeros',
                  `Metodo: ${zMethodFilter === 'ALL' ? 'Todos' : zMethodFilter}`
                );
              }}
                disabled={!canExportZClosureReports}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Download className="w-3 h-3" /> Imprimir PDF
              </button>
              <button
                disabled={!canExportZClosureReports}
                onClick={() => exportCSV(
                  Array.isArray((zClosureData as any).methodDetailGroups) && (zClosureData as any).methodDetailGroups.length > 0
                    ? (zClosureData as any).methodDetailGroups.flatMap((group: any) => {
                        const rows = Array.isArray(group?.rows) ? group.rows : [];
                        const detailRows = rows.map((row: any) => ({
                          metodo: String(group?.method ?? ''),
                          fecha: row.date,
                          hora: row.time,
                          factura: row.correlativo || 'N/D',
                          cliente: row.client || 'N/D',
                          cajero: row.cashier || 'Sin cajero',
                          monto_usd: Number(row.lineUSD ?? 0) || 0,
                          monto_bs: Number(row.lineVES ?? 0) || 0
                        }));
                        const totals = group?.totals ?? {};
                        return [
                          ...detailRows,
                          {
                            metodo: String(group?.method ?? ''),
                            fecha: '',
                            hora: '',
                            factura: 'SUBTOTAL',
                            cliente: '',
                            cajero: '',
                            monto_usd: Number(totals?.usd ?? 0) || 0,
                            monto_bs: Number(totals?.ves ?? 0) || 0
                          }
                        ];
                      })
                    : Object.entries(zClosureData.byMethod).map(([method, data]: [string, any]) => ({
                        metodo: method,
                        operaciones: Number(data?.count ?? 0) || 0,
                        total_usd: Number(data?.usd ?? 0) || 0,
                        total_bs: Number(data?.ves ?? 0) || 0
                      })),
                  `cierre_z_${zDate}.csv`,
                  { reportLabel: 'Cierre Caja', filterLabel: getActiveFilterLabel(), includeTotals: true }
                )}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-3 h-3" /> Excel
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">
                <Calendar className="w-4 h-4 text-slate-400" />
                <input type="date" value={zDate} onChange={(e) => setZDate(e.target.value)}
                  className="bg-transparent border-0 text-[12px] font-black uppercase text-slate-700 focus:ring-0" />
              </div>
              <div className="flex items-center gap-2 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <select
                  value={zMethodFilter}
                  onChange={(e) => setZMethodFilter(e.target.value)}
                  className="bg-transparent border-0 text-[12px] font-black uppercase text-slate-700 focus:ring-0"
                >
                  <option value="ALL">Todos los métodos</option>
                  {(zClosureData as any).methodOptions?.map((method: string) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-4 h-4 text-slate-400" />
                <p className="text-[10px] font-black text-slate-500 uppercase">Cajeros del cierre</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setZSelectedCashierIds([])}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                    zSelectedCashierIds.length === 0
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Todos
                </button>
                {dataService.getUsers()
                  .filter((u) => u.role === 'CAJERO' || u.role === 'ADMIN')
                  .map((u) => {
                    const selected = zSelectedCashierIds.includes(String(u.id));
                    return (
                      <button
                        key={u.id}
                        onClick={() => {
                          setZSelectedCashierIds((prev) =>
                            prev.includes(String(u.id))
                              ? prev.filter((id) => id !== String(u.id))
                              : [...prev, String(u.id)]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase border transition-all ${
                          selected
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {u.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                <p className="text-[9px] font-black text-emerald-600 uppercase">Ventas Total $</p>
                <p className="text-xl font-black text-emerald-900">$ {zClosureData.totals.usd.toLocaleString()}</p>
                <p className="text-[10px] text-emerald-700">{zClosureData.counts.total} ops</p>
                <p className="text-[9px] text-emerald-700 mt-1">
                  {Number((zClosureData as any).counts?.cash ?? 0)} contado · {Number((zClosureData as any).counts?.credit ?? 0)} credito
                </p>
              </div>
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-200">
                <p className="text-[9px] font-black text-blue-600 uppercase">Ventas Total Bs</p>
                <p className="text-xl font-black text-blue-900">Bs. {zClosureData.totals.ves.toLocaleString()}</p>
              </div>
              <div className="bg-amber-50 p-4 rounded-xl border border-amber-200">
                <p className="text-[9px] font-black text-amber-700 uppercase">Anuladas excluidas</p>
                <p className="text-xl font-black text-amber-900">{Number((zClosureData as any).counts?.voidedExcluded ?? 0)}</p>
                <p className="text-[10px] text-amber-700">No participan en el cierre</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-[9px] font-black text-slate-600 uppercase">Sin desglose</p>
                <p className="text-xl font-black text-slate-900">{Number((zClosureData as any).counts?.withoutBreakdown ?? 0)}</p>
                <p className="text-[10px] text-slate-500">Ventas MIXTO sin lineas de pago</p>
              </div>
            </div>

            {Array.isArray((zClosureData as any).byCashierSummaries) && (zClosureData as any).byCashierSummaries.length > 0 && (
              <div className="mb-6">
                <h4 className="text-[12px] font-black text-slate-600 uppercase mb-3">Desglose por Cajero Seleccionado</h4>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {(zClosureData as any).byCashierSummaries.map((cashier: any, idx: number) => (
                    <div key={`${cashier.cashierName}-${idx}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                        <div>
                          <p className="text-[11px] font-black text-slate-900 uppercase">{cashier.cashierName}</p>
                          <p className="text-[9px] font-bold text-slate-400 uppercase">
                            {cashier.salesCount} facturas filtradas
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] font-black text-emerald-700">$ {Number(cashier.totalUSD ?? 0).toFixed(2)}</p>
                          <p className="text-[10px] font-mono text-blue-700">{bs(Number(cashier.totalVES ?? 0))}</p>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                              <th className="px-3 py-2">Método</th>
                              <th className="px-3 py-2 text-right">Ops</th>
                              <th className="px-3 py-2 text-right">Total $</th>
                              <th className="px-3 py-2 text-right">Total Bs</th>
                            </tr>
                          </thead>
                          <tbody className="text-[11px]">
                            {Array.isArray(cashier.methodRows) && cashier.methodRows.length > 0 ? cashier.methodRows.map((row: any, rIdx: number) => (
                              <tr key={`${cashier.cashierName}-${row.method}-${rIdx}`} className="border-b border-slate-50 hover:bg-slate-50">
                                <td className="px-3 py-2 font-black text-slate-800 uppercase">{row.method}</td>
                                <td className="px-3 py-2 text-right font-mono">{row.count}</td>
                                <td className="px-3 py-2 text-right font-black font-mono">$ {Number(row.usd ?? 0).toFixed(2)}</td>
                                <td className="px-3 py-2 text-right font-mono text-slate-600">{bs(Number(row.ves ?? 0))}</td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-300 font-black uppercase text-[10px]">
                                  Sin métodos para este cajero
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
              <h4 className="text-[12px] font-black text-slate-600 uppercase mb-3 flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Declaracion del Cajero
              </h4>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase">Efectivo $:</span>
                  <input type="number" placeholder="0.00" value={cashDeclaration.usd}
                    onChange={(e) => setCashDeclaration(prev => ({ ...prev, usd: e.target.value }))}
                    className="w-32 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-black text-slate-900 focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-black text-slate-500 uppercase">Efectivo Bs:</span>
                  <input type="number" placeholder="0.00" value={cashDeclaration.ves}
                    onChange={(e) => setCashDeclaration(prev => ({ ...prev, ves: e.target.value }))}
                    className="w-32 bg-white border border-slate-200 rounded-lg px-3 py-2 text-[12px] font-black text-slate-900 focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>

              {zClosureData.variance.hasDeclaration && (
                <div className={`mt-4 p-3 rounded-lg border-2 ${Math.abs(zClosureData.variance.usd) > 0.01 || Math.abs(zClosureData.variance.ves) > 0.01 ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    {Math.abs(zClosureData.variance.usd) > 0.01 || Math.abs(zClosureData.variance.ves) > 0.01 ? (
                      <AlertTriangle className="w-5 h-5 text-red-600" />
                    ) : (
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    )}
                    <span className={`text-[12px] font-black uppercase ${Math.abs(zClosureData.variance.usd) > 0.01 || Math.abs(zClosureData.variance.ves) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>
                      {Math.abs(zClosureData.variance.usd) > 0.01 || Math.abs(zClosureData.variance.ves) > 0.01 ? "VARIANZA DETECTADA" : "CUADRE PERFECTO"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-[10px] text-slate-500">Diferencia $:</span>
                      <span className={`ml-2 text-[14px] font-black font-mono ${Math.abs(zClosureData.variance.usd) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>
                        {zClosureData.variance.usd >= 0 ? "+" : ""}$ {zClosureData.variance.usd.toFixed(2)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">Diferencia Bs:</span>
                      <span className={`ml-2 text-[14px] font-black font-mono ${Math.abs(zClosureData.variance.ves) > 0.01 ? "text-red-700" : "text-emerald-700"}`}>
                        {zClosureData.variance.ves >= 0 ? "+" : ""}Bs. {zClosureData.variance.ves.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <h4 className="text-[12px] font-black text-slate-600 uppercase mb-3">Ventas por Metodo de Pago</h4>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-4 py-3">Metodo</th>
                    <th className="px-4 py-3 text-right">Operaciones</th>
                    <th className="px-4 py-3 text-right">Total $</th>
                    <th className="px-4 py-3 text-right">Total Bs</th>
                    <th className="px-4 py-3 text-right">% del Total</th>
                  </tr>
                </thead>
                <tbody className="text-[11px]">
                  {Object.entries(zClosureData.byMethod).length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-slate-300 font-black uppercase">No hay ventas registradas</td></tr>
                  ) : Object.entries(zClosureData.byMethod).map(([method, data]: [string, any], i) => (
                    <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-3 font-black text-slate-900 uppercase">{method}</td>
                      <td className="px-4 py-3 text-right font-mono">{data.count}</td>
                      <td className="px-4 py-3 text-right font-black font-mono">$ {data.usd.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">Bs. {data.ves.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-full">
                          {zClosureData.totals.usd > 0 ? ((data.usd / zClosureData.totals.usd) * 100).toFixed(1) : 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto mt-6">
              {zSelectedCashierIds.length === 0 && Array.isArray((zClosureData as any).methodDetailGroups) && (zClosureData as any).methodDetailGroups.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-[12px] font-black text-slate-600 uppercase mb-3">Detalle por método (todos los cajeros)</h4>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    {(zClosureData as any).methodDetailGroups.map((group: any, groupIdx: number) => (
                      <div key={`${group.method}-${groupIdx}`} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                          <div>
                            <p className="text-[11px] font-black text-slate-900 uppercase">{group.method}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                              {Number(group?.totals?.count ?? 0)} registros
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] font-black text-emerald-700">$ {Number(group?.totals?.usd ?? 0).toFixed(2)}</p>
                            <p className="text-[10px] font-mono text-blue-700">{bs(Number(group?.totals?.ves ?? 0))}</p>
                          </div>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                <th className="px-3 py-2">Factura</th>
                                <th className="px-3 py-2">Cliente</th>
                                <th className="px-3 py-2">Cajero</th>
                                <th className="px-3 py-2 text-right">Monto $</th>
                                <th className="px-3 py-2 text-right">Monto Bs</th>
                              </tr>
                            </thead>
                            <tbody className="text-[11px]">
                              {(Array.isArray(group.rows) ? group.rows : []).map((row: any, rowIdx: number) => (
                                <tr key={`${group.method}-${row.correlativo}-${rowIdx}`} className="border-b border-slate-50 hover:bg-slate-50">
                                  <td className="px-3 py-2 font-black text-slate-800">{row.correlativo || 'N/D'}</td>
                                  <td className="px-3 py-2 text-slate-700">{row.client || 'N/D'}</td>
                                  <td className="px-3 py-2 text-slate-700">{row.cashier || 'Sin cajero'}</td>
                                  <td className="px-3 py-2 text-right font-mono font-black">$ {Number(row.lineUSD ?? 0).toFixed(2)}</td>
                                  <td className="px-3 py-2 text-right font-mono">Bs {Number(row.lineVES ?? 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <h4 className="text-[12px] font-black text-slate-600 uppercase mb-3">Detalle por venta (registro de pago)</h4>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="px-3 py-3">Fecha</th>
                    <th className="px-3 py-3">Factura</th>
                    <th className="px-3 py-3">Cliente</th>
                    <th className="px-3 py-3">Cajero</th>
                    <th className="px-3 py-3">Metodos registrados</th>
                    <th className="px-3 py-3 text-right">Total $</th>
                    <th className="px-3 py-3 text-right">Total Bs</th>
                  </tr>
                </thead>
                <tbody className="text-[11px]">
                  {Array.isArray((zClosureData as any).salesDetailRows) && (zClosureData as any).salesDetailRows.length > 0 ? (
                    (zClosureData as any).salesDetailRows.map((row: any, idx: number) => (
                      <tr key={`${row.correlativo}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="px-3 py-2 font-mono text-[10px] text-slate-600">{row.date} {row.time}</td>
                        <td className="px-3 py-2 font-black text-slate-800">{row.correlativo || 'N/D'}</td>
                        <td className="px-3 py-2 text-slate-700">{row.client || 'N/D'}</td>
                        <td className="px-3 py-2 text-slate-700">{row.cashier || 'Sin cajero'}</td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className="font-black text-slate-500 mr-1">[{Number(row.methodsCount ?? 0)}]</span>
                          {row.methodsLabel || 'Sin desglose'}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-black">$ {Number(row.totalUSD ?? 0).toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-mono">Bs {Number(row.totalVES ?? 0).toFixed(2)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-300 font-black uppercase text-[10px]">
                        No hay ventas para mostrar detalle de metodos
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* REPORT-01: Facturación por Cajero */}
      {activeTab === "cashier" && (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-[#f8fafc]/50 flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Facturación por Cajero</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ventas y productos facturados por cada cajero</p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={cashierReportDate}
                  onChange={(e) => setCashierReportDate(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700 focus:ring-2 focus:ring-emerald-500"
                />
                <select
                  value={selectedCashierId}
                  onChange={(e) => setSelectedCashierId(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700 focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="ALL">Todos los Cajeros</option>
                  {dataService.getUsers()
                    .filter(u => u.role === 'CAJERO' || u.role === 'ADMIN')
                    .map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                </select>
                <select
                  value={cashierMethodFilter}
                  onChange={(e) => setCashierMethodFilter(e.target.value)}
                  className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700 focus:ring-2 focus:ring-emerald-500"
                  title="Filtrar reporte por método de pago"
                >
                  <option value="ALL">Todos los métodos</option>
                  {cashierDetailMethodOptions.map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
                <div className="flex bg-slate-100 rounded-xl border border-slate-200 overflow-hidden text-[9px] font-black uppercase">
                  <button
                    onClick={() => setCashierViewMode('GENERAL')}
                    className={`px-3 py-2 transition-all ${cashierViewMode === 'GENERAL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    General
                  </button>
                  <button
                    onClick={() => setCashierViewMode('METHODS')}
                    className={`px-3 py-2 transition-all ${cashierViewMode === 'METHODS' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Por método
                  </button>
                  <button
                    onClick={() => setCashierViewMode('DETAIL')}
                    className={`px-3 py-2 transition-all ${cashierViewMode === 'DETAIL' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'}`}
                  >
                    Detallado
                  </button>
                </div>
                <button
                  disabled={!canExportCashierReports}
                  onClick={() => exportCSV(
                    [
                      ...cashierDetailRows.map((row) => (
                        cashierSelectedMethodKind === 'USD'
                          ? {
                              fecha: `${row.invoiceDate} ${row.invoiceTime}`.trim(),
                              cajero: row.cashier,
                              factura: row.correlativo,
                              cliente: row.client,
                              metodo: row.paymentMethod,
                              referencia: methodRequiresReference(row.paymentMethod) ? (row.reference || 'N/D') : '-',
                              montoUSD: row.usdReceived.toFixed(2)
                            }
                          : {
                              fecha: `${row.invoiceDate} ${row.invoiceTime}`.trim(),
                              cajero: row.cashier,
                              factura: row.correlativo,
                              cliente: row.client,
                              metodo: row.paymentMethod,
                              referencia: methodRequiresReference(row.paymentMethod) ? (row.reference || 'N/D') : '-',
                              montoBS: row.paymentVES.toFixed(2),
                              tasaUsada: row.appliedRate > 0 ? row.appliedRate.toFixed(4) : 'N/D',
                              montoUSD: row.equivalentUSD.toFixed(2)
                            }
                      )),
                      cashierSelectedMethodKind === 'USD'
                        ? {
                            fecha: '',
                            cajero: '',
                            factura: '',
                            cliente: '',
                            metodo: 'TOTAL',
                            montoUSD: cashierDetailTotals.totalUSDReceived.toFixed(2)
                          }
                        : {
                            fecha: '',
                            cajero: '',
                            factura: '',
                            cliente: '',
                            metodo: 'TOTAL',
                            montoBS: cashierDetailTotals.totalVES.toFixed(2),
                            tasaUsada: '',
                            montoUSD: cashierDetailTotals.totalEquivalentUSD.toFixed(2)
                          }
                    ],
                    `facturacion_cajeros_detalle_${cashierReportDate}.csv`
                  )}
                  className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-slate-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> Excel Detalle
                </button>
                <button
                  disabled={!canExportCashierReports}
                  onClick={() => {
                    const selectedCashierName = selectedCashierId === 'ALL'
                      ? 'Todos los cajeros'
                      : (dataService.getUsers().find((u) => u.id === selectedCashierId)?.name ?? 'Cajero');
                    reportService.exportCashierInvoiceDetailToPDF(
                      cashierDetailRows.map((row) => ({
                        cashier: row.cashier,
                        invoiceDate: row.invoiceDate,
                        invoiceTime: row.invoiceTime,
                        correlativo: row.correlativo,
                        client: row.client,
                        paymentMethod: row.paymentMethod,
                        reference: row.reference,
                        paymentUSD: row.usdReceived,
                        paymentVES: cashierSelectedMethodKind === 'USD' ? 0 : row.paymentVES,
                        rateUsed: row.appliedRate,
                        equivalentUSD: row.equivalentUSD,
                        netUSD: row.netUSD
                      })),
                      cashierReportDate,
                      selectedCashierName,
                      cashierSelectedMethodKind === 'USD'
                        ? 'USD'
                        : cashierSelectedMethodKind === 'VES'
                        ? 'Bs'
                        : 'MIXED',
                      `Metodo: ${cashierMethodFilter === 'ALL' ? 'Todos' : cashierMethodFilter} | Vista: ${cashierViewMode} | Fecha: ${cashierReportDate}`
                    );
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-800 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-3 h-3" /> PDF Detalle
                </button>
              </div>
            </div>

            {/* Totales Generales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6 bg-slate-50/50">
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-emerald-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase">Total Ventas</span>
                </div>
                <p className="text-2xl font-black text-slate-900">{cashierReportData.totalCount}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="w-4 h-4 text-blue-500" />
                  <span className="text-[10px] font-black text-slate-400 uppercase">Total Facturado USD</span>
                </div>
                <p className="text-2xl font-black text-slate-900">$ {cashierReportData.totalUSD.toFixed(2)}</p>
              </div>
              <div className="bg-white p-4 rounded-xl border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-black text-emerald-600">Bs</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase">Total Facturado Bs</span>
                </div>
                <p className="text-2xl font-black text-slate-900">Bs {cashierReportData.totalVES.toFixed(2)}</p>
              </div>
            </div>

            {/* Diagnóstico de identidad de cajero (solo admin/seguridad) */}
            {canSeeCashierIdentityAudit && (
              <div className="px-6 pb-2">
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase text-amber-700 tracking-wider">Diagnóstico técnico</p>
                      <p className="text-[11px] font-bold text-amber-900">
                        Muestra cómo se identificó el operador por factura (para auditoría de clasificación).
                      </p>
                    </div>
                    <button
                      onClick={() => setShowCashierIdentityAudit((prev) => !prev)}
                      className="px-3 py-2 bg-amber-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-amber-800 transition-all"
                    >
                      {showCashierIdentityAudit ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}
                    </button>
                  </div>

                  {showCashierIdentityAudit && (
                    <div className="mt-4 overflow-x-auto bg-white border border-amber-200 rounded-xl">
                      <table className="w-full text-left">
                        <thead className="bg-amber-50 border-b border-amber-100">
                          <tr className="text-[9px] font-black uppercase text-amber-700">
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Factura</th>
                            <th className="px-3 py-2">Cajero resuelto</th>
                            <th className="px-3 py-2">Fuente</th>
                            <th className="px-3 py-2">Detalle</th>
                            <th className="px-3 py-2">sale.userId</th>
                            <th className="px-3 py-2">sale.operatorName</th>
                            <th className="px-3 py-2">bank.actorUserId</th>
                            <th className="px-3 py-2">bank.actor</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-amber-100">
                          {Array.isArray((cashierReportData as any).identityAuditRows) && (cashierReportData as any).identityAuditRows.length > 0 ? (
                            (cashierReportData as any).identityAuditRows.map((row: any, idx: number) => (
                              <tr key={`${row.correlativo}-${idx}`} className="hover:bg-amber-50/40 transition-colors">
                                <td className="px-3 py-2 text-[10px] text-slate-700">{row.invoiceDate}</td>
                                <td className="px-3 py-2 text-[10px] font-mono text-slate-900">{row.correlativo || '-'}</td>
                                <td className="px-3 py-2 text-[10px] font-black text-slate-900">{row.cashierResolved || 'Sin cajero'}</td>
                                <td className="px-3 py-2 text-[10px] font-black text-amber-700">{row.identitySource || '-'}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-700">{row.identityDetail || '-'}</td>
                                <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{row.saleUserId || '-'}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-700">{row.saleOperatorName || '-'}</td>
                                <td className="px-3 py-2 text-[10px] font-mono text-slate-600">{row.bankActorUserId || '-'}</td>
                                <td className="px-3 py-2 text-[10px] text-slate-700">{row.bankActorName || '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={9} className="py-8 text-center text-slate-400 text-[10px] font-black uppercase">
                                Sin registros para diagnóstico en la fecha seleccionada
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Resumen Global de Métodos de Pago */}
            {cashierGlobalMethodsView.length > 0 && (cashierViewMode === 'GENERAL' || cashierViewMode === 'METHODS') && (
              <div className="p-6 border-t border-slate-200 bg-blue-50/30">
                <h4 className="text-[12px] font-black text-slate-600 uppercase mb-4 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" /> Resumen Global por Método de Pago
                </h4>
                {cashierViewMode === 'GENERAL' ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {cashierGlobalMethodsView.map((pm, idx) => (
                      <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                        <p className="text-[10px] font-black text-slate-700 uppercase">{pm.method}</p>
                        <p className="text-[9px] text-slate-500">{pm.count} operaciones</p>
                        {pm.amountUSD > 0 && (
                          <p className="text-lg font-black text-blue-600 mt-1">$ {pm.amountUSD.toFixed(2)}</p>
                        )}
                        {pm.amountVES > 0 && (
                          <p className="text-lg font-black text-emerald-600 mt-1">Bs {pm.amountVES.toFixed(2)}</p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="overflow-x-auto bg-white rounded-xl border border-slate-200">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-[9px] font-black uppercase text-slate-500">
                          <th className="px-4 py-3">Método</th>
                          <th className="px-4 py-3 text-right">Operaciones</th>
                          <th className="px-4 py-3 text-right">Total USD</th>
                          <th className="px-4 py-3 text-right">Total Bs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {cashierGlobalMethodsView.map((pm, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-[11px] font-black text-slate-900 uppercase">{pm.method}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-mono text-slate-600">{pm.count}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-black font-mono text-blue-700">$ {pm.amountUSD.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right text-[11px] font-black font-mono text-emerald-700">Bs {pm.amountVES.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Lista de Cajeros */}
            {cashierViewMode === 'DETAIL' && (
            <div className="p-6">
              <h4 className="text-[12px] font-black text-slate-600 uppercase mb-4 flex items-center gap-2">
                <Users className="w-4 h-4" /> Desglose por Cajero
              </h4>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Método de pago</p>
                    <select
                      value={cashierMethodFilter}
                      onChange={(e) => setCashierMethodFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                    >
                      <option value="ALL">Todos</option>
                      {cashierDetailMethodOptions.map((method) => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-slate-500 mb-1">Equivalente USD con tasa</p>
                    <select
                      value={cashierDetailRateMode}
                      onChange={(e) => setCashierDetailRateMode(e.target.value as CashierDetailRateMode)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-black text-slate-700"
                      disabled={cashierSelectedMethodKind === 'USD'}
                    >
                      <option value="LINE">Tasa de la operación</option>
                      <option value="BCV">Tasa BCV de la factura</option>
                      <option value="INTERNAL">Tasa interna de la factura</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                      <p className="text-[8px] uppercase font-black text-slate-400">
                        {cashierSelectedMethodKind === 'USD' ? 'Total USD filtrado' : 'Sumatoria Bs filtrada'}
                      </p>
                      {cashierSelectedMethodKind === 'USD' ? (
                        <p className="text-[14px] font-black text-blue-700">$ {cashierDetailTotals.totalUSDReceived.toFixed(2)}</p>
                      ) : (
                        <p className="text-[14px] font-black text-emerald-700">Bs {cashierDetailTotals.totalVES.toFixed(2)}</p>
                      )}
                    </div>
                    {cashierSelectedMethodKind !== 'USD' && (
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <p className="text-[8px] uppercase font-black text-slate-400">Equivalente USD filtrado</p>
                        <p className="text-[14px] font-black text-blue-700">$ {cashierDetailTotals.totalEquivalentUSD.toFixed(2)}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[9px] font-black uppercase text-slate-500">
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2">Cajero</th>
                        <th className="px-3 py-2">Factura</th>
                        <th className="px-3 py-2">Cliente</th>
                        <th className="px-3 py-2">Método</th>
                        <th className="px-3 py-2">Referencia</th>
                        <th className="px-3 py-2 text-right">{cashierSelectedMethodKind === 'USD' ? 'Monto USD' : 'Monto Bs'}</th>
                        {cashierSelectedMethodKind !== 'USD' && <th className="px-3 py-2 text-right">Tasa usada</th>}
                        {cashierSelectedMethodKind !== 'USD' && <th className="px-3 py-2 text-right">Equiv. USD</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cashierDetailRows.length === 0 ? (
                        <tr>
                          <td colSpan={cashierSelectedMethodKind === 'USD' ? 7 : 9} className="py-10 text-center text-slate-300 font-black uppercase text-[11px]">
                            Sin registros para el filtro seleccionado
                          </td>
                        </tr>
                      ) : cashierDetailRows.map((row, idx) => (
                        <tr key={`${row.correlativo}-${row.paymentMethod}-${idx}`} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-2 text-[10px] text-slate-700">{row.invoiceDate} {row.invoiceTime}</td>
                          <td className="px-3 py-2 text-[10px] font-black text-slate-800">{row.cashier}</td>
                          <td className="px-3 py-2 text-[10px] font-mono text-slate-900">{row.correlativo}</td>
                          <td className="px-3 py-2 text-[10px] text-slate-700">{row.client}</td>
                          <td className="px-3 py-2 text-[10px] font-black text-slate-700 uppercase">{row.paymentMethod}</td>
                          <td className="px-3 py-2 text-[10px] font-mono text-slate-700">
                            {methodRequiresReference(row.paymentMethod) ? (row.reference || 'N/D') : '-'}
                          </td>
                          {cashierSelectedMethodKind === 'USD' ? (
                            <td className="px-3 py-2 text-[10px] text-right font-mono font-black text-blue-700">$ {row.usdReceived.toFixed(2)}</td>
                          ) : (
                            <>
                              <td className="px-3 py-2 text-[10px] text-right font-mono font-black text-emerald-700">Bs {row.paymentVES.toFixed(2)}</td>
                              <td className="px-3 py-2 text-[10px] text-right font-mono text-slate-600">
                                {row.appliedRate > 0 ? row.appliedRate.toFixed(4) : 'N/D'}
                              </td>
                              <td className="px-3 py-2 text-[10px] text-right font-mono font-black text-blue-700">$ {row.equivalentUSD.toFixed(2)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[9px] text-slate-500 font-bold uppercase">
                  Registros: {cashierDetailTotals.count} | Método: {cashierMethodFilter === 'ALL' ? 'Todos' : cashierMethodFilter}
                  {cashierSelectedMethodKind === 'USD'
                    ? ` | Total USD: $ ${cashierDetailTotals.totalUSDReceived.toFixed(2)}`
                    : ` | Total Bs: Bs ${cashierDetailTotals.totalVES.toFixed(2)} | Monto USD: $ ${cashierDetailTotals.totalEquivalentUSD.toFixed(2)}`}
                </p>
              </div>
              
              {cashierReportData.cashiers.length === 0 ? (
                <div className="py-16 text-center text-slate-300 font-black uppercase text-sm">
                  Sin ventas registradas para esta fecha
                </div>
              ) : (
                <div className="space-y-4">
                  {cashierReportData.cashiers.map((cashier, idx) => (
                    <div key={idx} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      {/* Header del Cajero */}
                      <div 
                        className="p-4 bg-slate-50/80 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setShowCashierDetail(showCashierDetail === cashier.name ? null : cashier.name)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-black text-slate-900">{cashier.name}</p>
                            <p className="text-[10px] text-slate-500">{cashier.salesCount} ventas</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-lg font-black text-slate-900">$ {cashier.totalUSD.toFixed(2)}</p>
                            <p className="text-[9px] text-slate-400 uppercase">Total Facturado</p>
                          </div>
                          {showCashierDetail === cashier.name ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </div>
                      
                      {/* Detalle de Métodos de Pago y Productos */}
                      {showCashierDetail === cashier.name && (
                        <div className="p-4 border-t border-slate-100 space-y-4">
                          {/* Facturas procesadas por el cajero */}
                          {Array.isArray((cashier as any).invoices) && (cashier as any).invoices.length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-black text-slate-500 uppercase mb-3">Facturas Procesadas y Forma de Cobro</h5>
                              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                                <table className="w-full text-left">
                                  <thead className="bg-slate-50 border-b border-slate-100">
                                    <tr className="text-[9px] font-black uppercase text-slate-500">
                                      <th className="px-3 py-2">Hora</th>
                                      <th className="px-3 py-2">Factura</th>
                                      <th className="px-3 py-2">Cliente</th>
                                      <th className="px-3 py-2">Cobro por método</th>
                                      <th className="px-3 py-2 text-right">Total USD</th>
                                      <th className="px-3 py-2 text-right">Total Bs</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 bg-white">
                                    {(cashier as any).invoices.map((inv: any) => (
                                      <tr key={inv.id} className="align-top hover:bg-slate-50 transition-colors">
                                        <td className="px-3 py-2 text-[10px] font-mono text-slate-600">
                                          {new Date(inv.timestamp).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-3 py-2 text-[10px] font-black text-slate-900">{inv.correlativo || 'S/C'}</td>
                                        <td className="px-3 py-2 text-[10px] text-slate-700">{inv.clientName || 'Sin cliente'}</td>
                                        <td className="px-3 py-2">
                                          <div className="flex flex-wrap gap-1.5">
                                            {(Array.isArray(inv.paymentLines) ? inv.paymentLines : []).map((line: any, lidx: number) => (
                                              <span key={`${inv.id}-line-${lidx}`} className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 text-blue-800 rounded-md px-2 py-1 text-[9px] font-black uppercase">
                                                {line.method}
                                                {Number(line.amountUSD || 0) > 0 ? <span className="font-mono text-[9px]">$ {Number(line.amountUSD || 0).toFixed(2)}</span> : null}
                                                {Number(line.amountVES || 0) > 0 ? <span className="font-mono text-[9px]">Bs {Number(line.amountVES || 0).toFixed(2)}</span> : null}
                                              </span>
                                            ))}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 text-right text-[10px] font-black font-mono text-blue-700">$ {Number(inv.totalUSD || 0).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right text-[10px] font-black font-mono text-emerald-700">Bs {Number(inv.totalVES || 0).toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Métodos de Pago por Cajero */}
                          {Object.values(cashier.paymentMethods).length > 0 && (
                            <div>
                              <h5 className="text-[10px] font-black text-slate-500 uppercase mb-3">Métodos de Pago</h5>
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                {(Object.values(cashier.paymentMethods) as any[])
                                  .sort((a, b) => b.amountUSD - a.amountUSD)
                                  .map((pm: any, pidx) => (
                                    <div key={pidx} className="bg-blue-50 p-2 rounded-lg border border-blue-100">
                                      <p className="text-[9px] font-black text-slate-700 uppercase">{pm.method}</p>
                                      <p className="text-[8px] text-slate-500">{pm.count} ventas</p>
                                      {pm.amountUSD > 0 && (
                                        <p className="text-sm font-black text-blue-600">$ {pm.amountUSD.toFixed(2)}</p>
                                      )}
                                      {pm.amountVES > 0 && (
                                        <p className="text-sm font-black text-emerald-600">Bs {pm.amountVES.toFixed(2)}</p>
                                      )}
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                          
                          {/* Productos Facturados */}
                          <div>
                            <h5 className="text-[10px] font-black text-slate-500 uppercase mb-3">Productos Facturados</h5>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {Object.values(cashier.products)
                                .sort((a: any, b: any) => b.qty - a.qty)
                                .map((product: any, pidx: any) => (
                                  <div key={pidx} className="bg-slate-50 p-3 rounded-lg">
                                    <p className="text-[10px] font-black text-slate-700 truncate">{product.description}</p>
                                    <p className="text-[9px] text-slate-500">{product.code}</p>
                                    <p className="text-lg font-black text-emerald-600 mt-1">
                                      {product.qty} <span className="text-[10px]">{product.unit}</span>
                                    </p>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            )}

            {/* Resumen General de Productos */}
            {cashierReportData.totalProducts.length > 0 && cashierViewMode !== 'METHODS' && (
              <div className="p-6 border-t border-slate-200 bg-slate-50/30">
                <h4 className="text-[12px] font-black text-slate-600 uppercase mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" /> Resumen General de Productos Vendidos ({cashierReportDate})
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {cashierReportData.totalProducts.map((product, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                      <p className="text-[10px] font-black text-slate-700 truncate" title={product.description}>
                        {product.description}
                      </p>
                      <p className="text-[9px] text-slate-400">{product.code}</p>
                      <p className="text-xl font-black text-blue-600 mt-2">
                        {product.qty} <span className="text-[11px] text-slate-500">{product.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
