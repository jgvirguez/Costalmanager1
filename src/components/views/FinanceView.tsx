import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  CreditCard, 
  Timer,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  History,
  Scale,
  RefreshCw,
  Users,
  Building2,
  Download,
  X,
  Plus,
  Trash2,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Printer,
  Loader2,
  Phone,
  Copy,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ReceiptText,
  UserCheck,
  Check
} from 'lucide-react';
import { dataService, ClientAdvance, SupplierAdvance, ExpenseCategory, EXPENSE_CATEGORIES, OperationalExpense, PurchaseInvoiceHistoryEntry, CompanyLoan, type MayorCuentaMovimientoRow } from '../../services/dataService';
import {
  isBankTransactionCountedForBalance,
  ledgerDeltaForBankAggregate,
  sumOpeningBalancesForBank
} from '../../services/bankBalanceUtils';
import { clientService } from '../../services/clientService';
import { supplierService } from '../../services/supplierService';
import { reportService } from '../../services/reportService';
import { printService } from '../../services/printService';
import { buildExcelFriendlyCsv } from '../../utils/csvExport';
import { PurchaseEntryModal } from '../modals/PurchaseEntryModal';
import { ConfirmModal } from '../ConfirmModal';
import { BillingClient } from '../../types/billing';
import { bankBalanceMapKey, useBankBalances } from '../../hooks/useBankBalances';

const CheckIcon = CheckCircle2;

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

export function FinanceView({ exchangeRate = 36.50, internalRate, onStartARCollection }: { exchangeRate?: number, internalRate?: number, onStartARCollection?: (data: { active: boolean; arEntryId: string; customerId: string; customerName: string; balanceUSD: number; balanceVES: number; description: string; saleCorrelativo: string; }) => void }) {
  // SEC-08: Helper de permisos
  const hasPermission = (key: string) => dataService.hasPermission(key as any);
  const canEditFinance = hasPermission('FINANCE_VIEW') || hasPermission('ALL');
  const financeInternalRate = Number(internalRate) > 0 ? Number(internalRate) : (Number(exchangeRate) > 0 ? Number(exchangeRate) : 1);
  const canEditBanks = hasPermission('FINANCE_VIEW') || hasPermission('ALL');
  
  const [activeSubTab, setActiveSubTab] = useState<'indicators' | 'invoices' | 'ar' | 'ap' | 'ledger' | 'expenses' | 'banks' | 'credit' | 'calendar' | 'advances'>('indicators');
  const [invoiceHistoryLoading, setInvoiceHistoryLoading] = useState(false);
  const [invoiceHistorySearch, setInvoiceHistorySearch] = useState('');
  /** Filtros estructurados: Historial Facturas (Finanzas) */
  const [invoiceHistoryKind, setInvoiceHistoryKind] = useState<'ALL' | 'SALES' | 'PURCHASES'>('ALL');
  const [invoiceHistoryDateFrom, setInvoiceHistoryDateFrom] = useState('');
  const [invoiceHistoryDateTo, setInvoiceHistoryDateTo] = useState('');
  const [invoiceHistoryParty, setInvoiceHistoryParty] = useState('');
  const [purchaseInvoiceHistory, setPurchaseInvoiceHistory] = useState<PurchaseInvoiceHistoryEntry[]>([]);
  const [expandedSaleInvoiceId, setExpandedSaleInvoiceId] = useState<string | null>(null);
  const [expandedPurchaseInvoiceId, setExpandedPurchaseInvoiceId] = useState<string | null>(null);

  // FIN-08: Advances management state
  const [advancesData, setAdvancesData] = useState<ClientAdvance[]>([]);
  const [loadingAdvances, setLoadingAdvances] = useState(false);
  const [advShowApplied, setAdvShowApplied] = useState(false);
  const [advSearch, setAdvSearch] = useState('');
  const [expandedAdvClientId, setExpandedAdvClientId] = useState<string | null>(null);
  const [expandedAdvId, setExpandedAdvId] = useState<string | null>(null);
  const [advHistory, setAdvHistory] = useState<Record<string, any[]>>({});
  const [advancesSubTab, setAdvancesSubTab] = useState<'client' | 'supplier'>('client');
  const [applyingAdv, setApplyingAdv] = useState<ClientAdvance | null>(null);
  const [applyAmt, setApplyAmt] = useState('');
  const [applyRef, setApplyRef] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);

  // FIN-09: Supplier advances state
  const [supplierAdvancesData, setSupplierAdvancesData] = useState<SupplierAdvance[]>([]);
  const [loadingSupplierAdvances, setLoadingSupplierAdvances] = useState(false);
  const [supAdvShowApplied, setSupAdvShowApplied] = useState(false);
  const [supAdvSearch, setSupAdvSearch] = useState('');
  const [expandedSupSupplierKey, setExpandedSupSupplierKey] = useState<string | null>(null);
  const [expandedSupAdvId, setExpandedSupAdvId] = useState<string | null>(null);
  const [supAdvHistory, setSupAdvHistory] = useState<Record<string, any[]>>({});
  const [showCreateSupAdv, setShowCreateSupAdv] = useState(false);
  const [applyingSupAdv, setApplyingSupAdv] = useState<SupplierAdvance | null>(null);
  const [supApplyAmt, setSupApplyAmt] = useState('');
  const [supApplyRef, setSupApplyRef] = useState('');
  const [supApplyApId, setSupApplyApId] = useState('');
  const [supApplyLoading, setSupApplyLoading] = useState(false);
  const [createSupAdvForm, setCreateSupAdvForm] = useState({ supplierName: '', amountUSD: '', reference: '', method: '', bankName: '', note: '', currency: 'USD' as 'USD' | 'VES', originalAmountVES: '' });
  const [createSupAdvError, setCreateSupAdvError] = useState('');
  const [createSupAdvSaving, setCreateSupAdvSaving] = useState(false);

  const loadSupplierAdvances = async (includeApplied: boolean) => {
    setLoadingSupplierAdvances(true);
    try {
      const list = await dataService.getAllSupplierAdvancesForAdmin(includeApplied);
      setSupplierAdvancesData(list);
    } finally { setLoadingSupplierAdvances(false); }
  };
  const loadSupAdvHistory = async (advId: string) => {
    if (supAdvHistory[advId]) return;
    const hist = await dataService.getSupplierAdvanceHistory(advId);
    setSupAdvHistory(p => ({ ...p, [advId]: hist }));
  };

  const loadAdvances = async (includeApplied: boolean) => {
    const realtimeList = dataService.getClientAdvancesSnapshot(includeApplied);
    if (realtimeList.length > 0 || !includeApplied) {
      setAdvancesData(realtimeList);
    }
    setLoadingAdvances(true);
    try {
      const list = await dataService.getAllClientAdvancesForAdmin(includeApplied);
      setAdvancesData(list);
    } finally { setLoadingAdvances(false); }
  };
  const loadAdvHistory = async (advId: string) => {
    if (advHistory[advId]) return;
    const hist = await dataService.getAdvanceApplicationHistory(advId);
    setAdvHistory(p => ({ ...p, [advId]: hist }));
  };

  // FEAT-14: Calendar state
  const [calendarDate, setCalendarDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [calendarSelectedDay, setCalendarSelectedDay] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<'month' | 'list'>('month');
  
  const sales = dataService.getSales();
  const mtdStats = dataService.getMTDStats();
  const expensesList = dataService.getExpenses();
  const apEntries = dataService.getAPEntries();
  const arEntries = dataService.getAREntries();
  const companyLoans = dataService.getCompanyLoans();
  const ledger = dataService.getConsolidatedLedger();
  const banks = dataService.getBanks();
  const posTerminals = dataService.getPOSTerminals();
  const stocks = dataService.getStocks();
  const clients = clientService.getClients();
  const users = dataService.getUsers();
  const currentUser = dataService.getCurrentUser();

  const fmt = (value: any, decimals: number = 2) =>
    (Number(value ?? 0) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  const usd = (value: any, decimals: number = 2) => `$ ${fmt(value, decimals)}`;
  const bs = (value: any, decimals: number = 2) => `Bs ${fmt(value, decimals)}`;

  const byMethod = useMemo(() => sales.reduce((acc: any, s) => {
    const method = (s.paymentMethod || 'usd').toLowerCase();
    acc[method] = (acc[method] || 0) + s.totalUSD;
    return acc;
  }, {}), [sales]);

  const parseDayBoundary = (yyyyMmDd: string, endOfDay: boolean) => {
    const s = String(yyyyMmDd ?? '').trim();
    if (!s) return null;
    const d = new Date(s.length >= 10 ? `${s.slice(0, 10)}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const getPurchaseRowDate = (entry: PurchaseInvoiceHistoryEntry): Date | null => {
    const raw = entry.invoiceDate || entry.createdAt;
    if (!raw || !String(raw).trim()) return null;
    const t = new Date(String(raw).includes('T') ? raw : `${String(raw).slice(0, 10)}T12:00:00`);
    return Number.isNaN(t.getTime()) ? null : t;
  };

  const filteredSalesInvoices = useMemo(() => {
    let rows = (sales as any[]).filter((sale: any) => !(sale as any)?.voided && String((sale as any)?.status ?? '').toUpperCase() !== 'VOID');

    const from = parseDayBoundary(invoiceHistoryDateFrom, false);
    const to = parseDayBoundary(invoiceHistoryDateTo, true);
    const getSaleTs = (sale: any): Date | null => {
      const t = sale?.timestamp;
      if (t instanceof Date && !Number.isNaN(t.getTime())) return t;
      const d = new Date(t ?? '');
      return Number.isNaN(d.getTime()) ? null : d;
    };
    if (from) {
      rows = rows.filter((sale: any) => {
        const d = getSaleTs(sale);
        return d ? d >= from : false;
      });
    }
    if (to) {
      rows = rows.filter((sale: any) => {
        const d = getSaleTs(sale);
        return d ? d <= to : false;
      });
    }

    const party = invoiceHistoryParty.trim().toLowerCase();
    if (party) {
      rows = rows.filter((sale: any) => {
        const name = String(sale?.client?.name ?? '').toLowerCase();
        const id = String(sale?.client?.id ?? '').toLowerCase();
        return name.includes(party) || id.includes(party);
      });
    }

    const q = invoiceHistorySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((sale: any) => {
      const correlativo = String(sale?.correlativo ?? '').toLowerCase();
      const customer = String(sale?.client?.name ?? '').toLowerCase();
      const dateLabel = sale?.timestamp instanceof Date ? sale.timestamp.toLocaleDateString('es-VE') : '';
      return correlativo.includes(q) || customer.includes(q) || dateLabel.includes(q);
    });
  }, [
    sales,
    invoiceHistorySearch,
    invoiceHistoryDateFrom,
    invoiceHistoryDateTo,
    invoiceHistoryParty
  ]);

  const filteredPurchaseInvoices = useMemo(() => {
    let rows = [...purchaseInvoiceHistory];

    const from = parseDayBoundary(invoiceHistoryDateFrom, false);
    const to = parseDayBoundary(invoiceHistoryDateTo, true);
    if (from) {
      rows = rows.filter((entry) => {
        const d = getPurchaseRowDate(entry);
        return d ? d >= from : false;
      });
    }
    if (to) {
      rows = rows.filter((entry) => {
        const d = getPurchaseRowDate(entry);
        return d ? d <= to : false;
      });
    }

    const party = invoiceHistoryParty.trim().toLowerCase();
    if (party) {
      rows = rows.filter((entry) => {
        const sup = String(entry.supplier ?? '').toLowerCase();
        const doc = String(entry.supplierDocument ?? '').toLowerCase();
        const inv = String(entry.invoiceNumber ?? entry.invoiceGroupId ?? '').toLowerCase();
        return sup.includes(party) || doc.includes(party) || inv.includes(party);
      });
    }

    const q = invoiceHistorySearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((entry) => {
      const invoice = String(entry.invoiceNumber ?? '').toLowerCase();
      const supplier = String(entry.supplier ?? '').toLowerCase();
      const dateLabel = entry.invoiceDate ? new Date(entry.invoiceDate).toLocaleDateString('es-VE') : '';
      return invoice.includes(q) || supplier.includes(q) || dateLabel.includes(q);
    });
  }, [
    purchaseInvoiceHistory,
    invoiceHistorySearch,
    invoiceHistoryDateFrom,
    invoiceHistoryDateTo,
    invoiceHistoryParty
  ]);

  const invoiceHistoryExportRows = useMemo(() => {
    const rows: Array<{ tipo: string; fecha: string; factura: string; tercero: string; documento: string; detalle_productos: string; totalUSD: number; estado: string }> = [];
    if (invoiceHistoryKind !== 'PURCHASES') {
      filteredSalesInvoices.forEach((sale: any) => {
        rows.push({
          tipo: 'VENTA',
          fecha: sale?.timestamp instanceof Date ? sale.timestamp.toLocaleDateString('es-VE') : '',
          factura: String(sale?.correlativo ?? ''),
          tercero: String(sale?.client?.name ?? ''),
          documento: String(sale?.client?.id ?? ''),
          detalle_productos: formatInvoiceProductDetails(Array.isArray(sale?.items) ? sale.items : []),
          totalUSD: Number(sale?.totalUSD ?? 0) || 0,
          estado: String(sale?.status ?? 'COMPLETED')
        });
      });
    }
    if (invoiceHistoryKind !== 'SALES') {
      filteredPurchaseInvoices.forEach((entry) => {
        rows.push({
          tipo: 'COMPRA',
          fecha: entry.invoiceDate ? new Date(entry.invoiceDate).toLocaleDateString('es-VE') : '',
          factura: entry.invoiceNumber || entry.invoiceGroupId,
          tercero: entry.supplier || '',
          documento: entry.supplierDocument || '',
          detalle_productos: formatInvoiceProductDetails(entry.lines),
          totalUSD: Number(entry.totalInvoiceUSD ?? 0) || 0,
          estado: entry.status
        });
      });
    }
    return rows;
  }, [filteredSalesInvoices, filteredPurchaseInvoices, invoiceHistoryKind]);

  const totalAR = useMemo(() => 
    arEntries.filter(e => e.status !== 'PAID').reduce((acc, e) => acc + e.balanceUSD, 0),
  [arEntries]);
  
  const totalAP = useMemo(() => 
    apEntries.filter(e => e.status !== 'PAID').reduce((acc, e) => acc + e.balanceUSD, 0),
  [apEntries]);

  const [allClientAdvances, setAllClientAdvances] = useState<ClientAdvance[]>([]);
  useEffect(() => {
    // Cargar anticipos para mostrar KPI global en dashboard y en todas las vistas
    if (!clients.length) return;
    const uniqueIds = Array.from(new Set(clients.map(c => c.id)));
    Promise.all(uniqueIds.map(id => dataService.getClientAdvances(id)))
      .then(results => setAllClientAdvances(results.flat()))
      .catch(() => setAllClientAdvances([]));
  }, [clients.length, activeSubTab, arEntries.length]);

  const totalAdvances = useMemo(() => 
    allClientAdvances.reduce((acc, a) => acc + a.balanceUSD, 0),
  [allClientAdvances]);

  /** Cuentas registradas: solo USD (Zelle, etc.), solo Bs, mixto, o sin cuentas. */
  const getBankCurrencyProfile = (b: any): 'USD_ONLY' | 'VES_ONLY' | 'MIXED' | 'UNKNOWN' => {
    const accs = Array.isArray(b?.accounts) ? b.accounts : [];
    if (accs.length === 0) return 'UNKNOWN';
    const hasU = accs.some((a: any) => String(a?.currency ?? '').toUpperCase() === 'USD');
    const hasV = accs.some((a: any) => String(a?.currency ?? '').toUpperCase() === 'VES');
    if (hasU && hasV) return 'MIXED';
    if (hasU) return 'USD_ONLY';
    return 'VES_ONLY';
  };

  // Calcular mayor analítico de bancos (filtrado por moneda si el banco es solo USD o solo Bs)
  const getBankAnalytics = (bankId: string, bank?: any) => {
    try {
      const bankTransactions = allBankTransactions;
      const bankTxAll = bankTransactions.filter(tx => String(tx.bankId) === String(bankId));
      const profile = bank ? getBankCurrencyProfile(bank) : 'UNKNOWN';
      const baseFiltered = bankTxAll.filter((tx) => isBankTransactionCountedForBalance(tx));
      const bankTx =
        profile === 'USD_ONLY'
          ? baseFiltered.filter((tx) => String(tx?.currency ?? 'USD').toUpperCase() === 'USD')
          : profile === 'VES_ONLY'
            ? baseFiltered.filter((tx) => String(tx?.currency ?? '').toUpperCase() === 'VES')
            : baseFiltered;

      if (!bank) {
        const totalInUSD = bankTx.filter((tx) => (Number(tx?.amountUSD ?? 0) || 0) > 0).reduce((s, tx) => s + (Number(tx?.amountUSD ?? 0) || 0), 0);
        const totalOutUSD = bankTx.filter((tx) => (Number(tx?.amountUSD ?? 0) || 0) < 0).reduce((s, tx) => s + Math.abs(Number(tx?.amountUSD ?? 0) || 0), 0);
        const totalInVES = bankTx.filter((tx) => (Number(tx?.amountVES ?? 0) || 0) > 0).reduce((s, tx) => s + (Number(tx?.amountVES ?? 0) || 0), 0);
        const totalOutVES = bankTx.filter((tx) => (Number(tx?.amountVES ?? 0) || 0) < 0).reduce((s, tx) => s + Math.abs(Number(tx?.amountVES ?? 0) || 0), 0);
        const balanceUSD = totalInUSD - totalOutUSD;
        const balanceVES = totalInVES - totalOutVES;
        const methodBreakdown = bankTx.reduce((acc, tx) => {
          if (!tx || !tx.method) return acc;
          const method = tx.method;
          if (!acc[method]) acc[method] = { count: 0, totalUSD: 0, totalVES: 0 };
          acc[method].count++;
          acc[method].totalUSD += Number(tx?.amountUSD ?? 0) || 0;
          acc[method].totalVES += Number(tx?.amountVES ?? 0) || 0;
          return acc;
        }, {} as Record<string, { count: number; totalUSD: number; totalVES: number }>);
        return {
          totalInUSD,
          totalOutUSD,
          balanceUSD,
          totalInVES,
          totalOutVES,
          balanceVES,
          transactionCount: bankTx.length,
          lastTransaction: bankTx.length > 0 ? new Date(Math.max(...bankTx.map((tx) => (tx.createdAt ? new Date(tx.createdAt).getTime() : 0)))) : null,
          methodBreakdown,
          currencyProfile: profile
        };
      }

      let totalInUSD = 0;
      let totalOutUSD = 0;
      let totalInVES = 0;
      let totalOutVES = 0;
      let balanceUSD = sumOpeningBalancesForBank(bank, 'USD');
      let balanceVES = sumOpeningBalancesForBank(bank, 'VES');
      for (const tx of bankTx) {
        const dUsd = ledgerDeltaForBankAggregate(tx, bank, 'USD');
        const dVes = ledgerDeltaForBankAggregate(tx, bank, 'VES');
        if (dUsd > 0) totalInUSD += dUsd;
        else if (dUsd < 0) totalOutUSD += Math.abs(dUsd);
        if (dVes > 0) totalInVES += dVes;
        else if (dVes < 0) totalOutVES += Math.abs(dVes);
        balanceUSD += dUsd;
        balanceVES += dVes;
      }

      const transactionCount = bankTx.length;
      const lastTransaction = bankTx.length > 0
        ? new Date(Math.max(...bankTx.map(tx => tx.createdAt ? new Date(tx.createdAt).getTime() : 0)))
        : null;

      const methodBreakdown = bankTx.reduce((acc, tx) => {
        if (!tx || !tx.method) return acc;
        const method = tx.method;
        if (!acc[method]) {
          acc[method] = { count: 0, totalUSD: 0, totalVES: 0 };
        }
        acc[method].count++;
        acc[method].totalUSD += ledgerDeltaForBankAggregate(tx, bank, 'USD');
        acc[method].totalVES += ledgerDeltaForBankAggregate(tx, bank, 'VES');
        return acc;
      }, {} as Record<string, { count: number; totalUSD: number; totalVES: number }>);

      return {
        totalInUSD,
        totalOutUSD,
        balanceUSD,
        totalInVES,
        totalOutVES,
        balanceVES,
        transactionCount,
        lastTransaction,
        methodBreakdown,
        currencyProfile: profile
      };
    } catch (error) {
      console.error('Error calculating bank analytics:', error);
      return {
        totalInUSD: 0,
        totalOutUSD: 0,
        balanceUSD: 0,
        totalInVES: 0,
        totalOutVES: 0,
        balanceVES: 0,
        transactionCount: 0,
        lastTransaction: null,
        methodBreakdown: {},
        currencyProfile: 'UNKNOWN' as const
      };
    }
  };

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const unsubscribeData = dataService.subscribe(() => setTick(t => t + 1));
    const unsubscribeClients = clientService.subscribe(() => setTick(t => t + 1));
    return () => {
      unsubscribeData();
      unsubscribeClients();
    };
  }, []);

  useEffect(() => {
    if (activeSubTab !== 'advances' || advancesSubTab !== 'client') return;
    setAdvancesData(dataService.getClientAdvancesSnapshot(advShowApplied));
  }, [activeSubTab, advancesSubTab, advShowApplied, tick]);

  useEffect(() => {
    if (activeSubTab !== 'invoices') return;
    let active = true;
    setInvoiceHistoryLoading(true);
    dataService.getPurchaseInvoiceHistory()
      .then((rows) => {
        if (!active) return;
        setPurchaseInvoiceHistory(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        console.error('Error cargando historial de facturas de compra:', error);
        if (active) setPurchaseInvoiceHistory([]);
      })
      .finally(() => {
        if (active) setInvoiceHistoryLoading(false);
      });
    return () => { active = false; };
  }, [activeSubTab, tick]);

  useEffect(() => {
    let active = true;
    dataService.getBankTransactions({ take: 1000 })
      .then((rows) => {
        if (active) setAllBankTransactions(Array.isArray(rows) ? rows : []);
      })
      .catch((error) => {
        console.error('Error loading bank transactions for dashboard:', error);
        if (active) setAllBankTransactions([]);
      });
    return () => {
      active = false;
    };
  }, [tick]);

  // FIN-02: Date filters
  const [arDateRange, setArDateRange] = useState({ start: '', end: '' });
  const [arStatusFilter, setArStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'OVERDUE' | 'PAID' | 'LOANS'>('ALL');
  const [arSearch, setArSearch] = useState('');
  const [arViewMode, setArViewMode] = useState<'GROUPED' | 'ROWS'>('GROUPED');
  const [expandedARCustomerKey, setExpandedARCustomerKey] = useState<string | null>(null);
  const [apDateRange, setApDateRange] = useState({ start: '', end: '' });
  const [apStatusFilter, setApStatusFilter] = useState<'ALL' | 'OPEN' | 'PENDING' | 'OVERDUE' | 'PAID'>('ALL');
  const [apSearch, setApSearch] = useState('');
  const [expandedAPSupplierKey, setExpandedAPSupplierKey] = useState<string | null>(null);
  const [ledgerDateRange, setLedgerDateRange] = useState({ start: '', end: '' });
  // FIN-09: Pagination
  const FIN_PAGE_SIZE = 20;
  const [arPage, setArPage] = useState(0);
  const [apPage, setApPage] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(0);
  const [mayorRows, setMayorRows] = useState<MayorCuentaMovimientoRow[]>([]);
  const [mayorLoading, setMayorLoading] = useState(false);
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('');
  const [cuentaOptionsMayor, setCuentaOptionsMayor] = useState<Array<{ codigo: string; nombre: string }>>([]);
  // FIN-04: Manual bank movement modal
  const [showManualTxModal, setShowManualTxModal] = useState(false);
  const [manualTx, setManualTx] = useState({
    bankId: '',
    accountId: '',
    concept: '',
    reference: '',
    amountUSD: '',
    amountVES: '',
    type: 'IN' as 'IN' | 'OUT'
  });
  const [manualTxError, setManualTxError] = useState('');
  const [manualTxSaving, setManualTxSaving] = useState(false);

  const EXPENSE_PAY_METHODS: Record<string, string> = {
    cash_usd: 'Efectivo USD', cash_ves: 'Efectivo Bs', transfer: 'Transferencia',
    mobile: 'Pago Móvil', zelle: 'Zelle', other: 'Otro'
  };
  const blankExpenseForm = () => ({
    description: '', amountUSD: '', amountVES: '', currency: 'USD' as 'USD'|'VES',
    category: 'OTRO' as ExpenseCategory, supplier: '', paymentMethod: '' as OperationalExpense['paymentMethod'] | '',
    reference: ''
  });
  const [newExpense, setNewExpense] = useState(blankExpenseForm());
  const [expenseSubmitting, setExpenseSubmitting] = useState(false);
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCatFilter, setExpenseCatFilter] = useState<ExpenseCategory | 'ALL'>('ALL');
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<'ACTIVE' | 'VOID' | 'ALL'>('ACTIVE');
  const [expenseMonthFilter, setExpenseMonthFilter] = useState('');
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [payrollEmpId, setPayrollEmpId] = useState('');
  const [payrollEmpSearch, setPayrollEmpSearch] = useState('');
  const [payrollEmpOpen, setPayrollEmpOpen] = useState(false);
  const [payrollSalary, setPayrollSalary] = useState('');
  const [payrollPeriod, setPayrollPeriod] = useState('');
  const [payrollCxcCurrency, setPayrollCxcCurrency] = useState<'USD'|'BS'>('USD');
  const [payrollCxcAmount, setPayrollCxcAmount] = useState('');
  const [payrollObservation, setPayrollObservation] = useState('');
  const [payrollLines, setPayrollLines] = useState<Array<{method: string; bankId: string; accountId: string; currency: 'USD'|'BS'; amountUSD: string; amountBS: string; rate: string; ref: string}>>([{ method: 'cash_usd', bankId: '', accountId: '', currency: 'USD', amountUSD: '', amountBS: '', rate: '', ref: '' }]);
  const [payrollCxcInvoices, setPayrollCxcInvoices] = useState<Record<string, boolean>>({});
  const [payrollCxcAbonos, setPayrollCxcAbonos] = useState<Record<string, string>>({});
  const [payrollSubmitting, setPayrollSubmitting] = useState(false);
  const [payrollError, setPayrollError] = useState('');
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [creditSearch, setCreditSearch] = useState('');
  const [selectedCreditClientId, setSelectedCreditClientId] = useState('');
  const [creditForm, setCreditForm] = useState({ hasCredit: false, creditLimit: '0', creditDays: '0', isSolvent: true, creditAuthorizedBy: '' });
  const [creditFormError, setCreditFormError] = useState('');
  const [creditFormSuccess, setCreditFormSuccess] = useState('');
  const [creditSaving, setCreditSaving] = useState(false);
  const creditSavingRef = React.useRef(false);
  const prevCreditClientIdRef = React.useRef<string>('');
  const lastLoadedClientDataRef = React.useRef<string>('');

  const [showARPaymentsModal, setShowARPaymentsModal] = useState(false);
  const [arPaymentsTarget, setArPaymentsTarget] = useState<any>(null);
  const [arPayments, setArPayments] = useState<any[]>([]);
  const [arPaymentsLoading, setArPaymentsLoading] = useState(false);
  const [arPaymentsError, setArPaymentsError] = useState<string>('');
  // Modal cobro CxC
  const [showARCollectModal, setShowARCollectModal] = useState(false);
  const [arCollectTarget, setArCollectTarget] = useState<any>(null);
  const [arCollectAmount, setArCollectAmount] = useState('');
  const [arCollectMethod, setArCollectMethod] = useState('transfer');
  const [arCollectBank, setArCollectBank] = useState('');
  const [arCollectBankId, setArCollectBankId] = useState('');
  const [arCollectAccountId, setArCollectAccountId] = useState('');
  const [arCollectRate, setArCollectRate] = useState(String(exchangeRate));
  const [arCollectRef, setArCollectRef] = useState('');
  const [arCollectNote, setArCollectNote] = useState('');
  const [arCollectSubmitting, setArCollectSubmitting] = useState(false);
  const [arCollectError, setArCollectError] = useState('');
  const [arCollectLastReceipt, setArCollectLastReceipt] = useState<any>(null);
  /** Saldo total anticipos del cliente (para método Otros en cobro CxC). */
  const [arCollectAdvanceBalance, setArCollectAdvanceBalance] = useState<number | null>(null);
  const [showCreateLoanModal, setShowCreateLoanModal] = useState(false);
  const [loanSubmitting, setLoanSubmitting] = useState(false);
  const [loanError, setLoanError] = useState('');
  const [loanBenSearch, setLoanBenSearch] = useState('');
  const [loanBenOpen, setLoanBenOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    beneficiaryType: 'EMPLOYEE' as 'EMPLOYEE' | 'PARTNER',
    beneficiaryName: '',
    beneficiaryId: '',
    description: '',
    amountUSD: '',
    daysToPay: '30',
    sourceMethod: 'transfer',
    sourceBankName: '',
    sourceBankId: '',
    sourceAccountId: '',
    reference: '',
    note: ''
  });
  const [showAPPaymentModal, setShowAPPaymentModal] = useState(false);
  const [apPayTargetId, setApPayTargetId] = useState('');
  const [apPayTarget, setApPayTarget] = useState<any>(null);
  const [apPayDetail, setApPayDetail] = useState<any>(null);
  const [apPayDetailLoading, setApPayDetailLoading] = useState(false);
  const [apPayLines, setApPayLines] = useState<Array<{
    id: string;
    method: string;
    bankId: string;
    accountId: string;
    amountUSD: string;
    rateUsed: string;
    reference: string;
    note: string;
    files: File[];
  }>>([]);
  const [apPayError, setApPayError] = useState('');
  const [apPaySubmitting, setApPaySubmitting] = useState(false);
  const [showAPPaymentsModal, setShowAPPaymentsModal] = useState(false);
  const [apPaymentsTarget, setApPaymentsTarget] = useState<any>(null);
  const [apPayments, setApPayments] = useState<any[]>([]);
  const [apPaymentsLoading, setApPaymentsLoading] = useState(false);
  const [apPaymentsError, setApPaymentsError] = useState<string>('');
  const [apPaymentsVisibleCount, setApPaymentsVisibleCount] = useState(25);
  const AP_PAYMENTS_PAGE_SIZE = 25;
  const visibleAPPayments = useMemo(
    () => apPayments.slice(0, apPaymentsVisibleCount),
    [apPayments, apPaymentsVisibleCount]
  );
  const hasMoreAPPayments = apPayments.length > apPaymentsVisibleCount;

  const handleViewARPayments = async (ar: any) => {
    setShowARPaymentsModal(true);
    setArPaymentsTarget(ar);
    setArPayments([]);
    setArPaymentsError('');
    setArPaymentsLoading(true);
    try {
      const list = await dataService.getARPayments(ar.id);
      setArPayments(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setArPaymentsError(String(e?.message ?? 'Error cargando pagos'));
    } finally {
      setArPaymentsLoading(false);
    }
  };

  const getClientCreditSummary = React.useCallback((client: BillingClient) => {
    const openEntries = arEntries.filter((entry) => entry.customerId === client.id && entry.status !== 'PAID');
    const debtUSD = openEntries.reduce((acc, entry) => acc + (Number(entry.balanceUSD ?? 0) || 0), 0);
    const overdueCount = openEntries.filter((entry) => new Date(entry.dueDate) < new Date()).length;
    const creditLimit = Number(client.creditLimit ?? 0) || 0;
    const availableCreditUSD = creditLimit > 0 ? Math.max(0, creditLimit - debtUSD) : 0;
    return {
      debtUSD,
      openCount: openEntries.length,
      overdueCount,
      creditLimit,
      hasCredit: client.hasCredit === true,
      isSolvent: client.isSolvent !== false,
      availableCreditUSD,
      exceedsLimit: creditLimit > 0 && debtUSD > creditLimit
    };
  }, [arEntries]);

  const getClientCommercialProfile = React.useCallback((client: BillingClient) => {
    const clientSales = sales
      .filter((sale) => String(sale.client?.id ?? '').trim().toUpperCase() === String(client.id ?? '').trim().toUpperCase())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    const totalOrders = clientSales.length;
    const totalPurchasedUSD = clientSales.reduce((acc, sale) => acc + (Number(sale.totalUSD ?? 0) || 0), 0);
    const averageTicketUSD = totalOrders > 0 ? totalPurchasedUSD / totalOrders : 0;
    const lastPurchase = clientSales[0]?.timestamp ?? null;
    const firstPurchase = clientSales[clientSales.length - 1]?.timestamp ?? null;
    const now = new Date();
    const last30 = new Date(now);
    last30.setDate(last30.getDate() - 30);
    const last90 = new Date(now);
    last90.setDate(last90.getDate() - 90);
    const recent30Count = clientSales.filter((sale) => sale.timestamp >= last30).length;
    const recent90Count = clientSales.filter((sale) => sale.timestamp >= last90).length;
    const visitDays = new Set(clientSales.map((sale) => sale.timestamp.toISOString().split('T')[0])).size;
    const activeMonths = firstPurchase && lastPurchase
      ? Math.max(1, ((lastPurchase.getFullYear() - firstPurchase.getFullYear()) * 12) + (lastPurchase.getMonth() - firstPurchase.getMonth()) + 1)
      : 0;
    const monthlyFrequency = activeMonths > 0 ? totalOrders / activeMonths : 0;
    const daysSinceLastPurchase = lastPurchase ? Math.max(0, Math.floor((now.getTime() - lastPurchase.getTime()) / 86400000)) : null;
    const creditSummary = getClientCreditSummary(client);

    let score = 0;
    if (totalOrders >= 12) score += 2;
    else if (totalOrders >= 6) score += 1;
    if (recent90Count >= 6) score += 2;
    else if (recent90Count >= 3) score += 1;
    if (daysSinceLastPurchase !== null && daysSinceLastPurchase <= 15) score += 2;
    else if (daysSinceLastPurchase !== null && daysSinceLastPurchase <= 30) score += 1;
    if (visitDays >= 8) score += 1;
    if (totalPurchasedUSD >= 500) score += 1;
    if (creditSummary.overdueCount === 0) score += 1;
    else if (creditSummary.overdueCount >= 2) score -= 2;
    else score -= 1;

    const quality = score >= 6
      ? { label: 'Excelente y recurrente', tone: 'emerald', recommendation: 'Cliente estable, frecuente y con buen respaldo comercial.' }
      : score >= 4
        ? { label: 'Buen cliente recurrente', tone: 'sky', recommendation: 'Tiene comportamiento favorable para evaluar crédito.' }
        : score >= 2
          ? { label: 'Cliente en evaluación', tone: 'amber', recommendation: 'Compra con cierta frecuencia, pero conviene asignar límites conservadores.' }
          : { label: 'Riesgo o baja recurrencia', tone: 'red', recommendation: 'Poca recurrencia o señales de riesgo. Recomendado crédito restringido.' };

    return {
      totalOrders,
      totalPurchasedUSD,
      averageTicketUSD,
      recent30Count,
      recent90Count,
      visitDays,
      activeMonths,
      monthlyFrequency,
      firstPurchase,
      lastPurchase,
      daysSinceLastPurchase,
      score,
      quality
    };
  }, [sales, getClientCreditSummary]);

  const filteredCreditClients = useMemo(() => clients.filter((client) => {
    const term = creditSearch.trim().toUpperCase();
    if (!term) return true;
    return client.id.toUpperCase().includes(term) || client.name.toUpperCase().includes(term);
  }), [clients, creditSearch]);

  const selectedCreditClient = useMemo(() => clients.find((client) => client.id === selectedCreditClientId) ?? null, [clients, selectedCreditClientId]);
  const selectedCreditSummary = useMemo(() => selectedCreditClient ? getClientCreditSummary(selectedCreditClient) : null, [selectedCreditClient, getClientCreditSummary]);
  const selectedCommercialProfile = useMemo(() => selectedCreditClient ? getClientCommercialProfile(selectedCreditClient) : null, [selectedCreditClient, getClientCommercialProfile]);
  const creditStats = useMemo(() => {
    const openEntriesByClient = new Map<string, number>();
    arEntries.forEach(entry => {
      if (entry.status !== 'PAID') {
        openEntriesByClient.set(entry.customerId, (openEntriesByClient.get(entry.customerId) || 0) + 1);
      }
    });
    return {
      authorizedCount: clients.filter((client) => client.hasCredit === true).length,
      blockedCount: clients.filter((client) => client.isSolvent === false).length,
      overdueCount: clients.filter((client) => (openEntriesByClient.get(client.id) || 0) > 0).length,
      assignedLimitUSD: clients.reduce((acc, client) => acc + (Number(client.creditLimit ?? 0) || 0), 0)
    };
  }, [clients, arEntries]);
  const activeAuthorizers = useMemo(() => users.filter((user) => user.active !== false), [users]);

  useEffect(() => {
    if (!clients.length) return;

    const exists = clients.some((client) => client.id === selectedCreditClientId);
    if (!selectedCreditClientId || !exists) {
      setSelectedCreditClientId(clients[0].id);
    }
  }, [clients, selectedCreditClientId]);

  useEffect(() => {
    if (creditSavingRef.current) return;
    if (!selectedCreditClientId) return;
    const client = clients.find((c) => c.id === selectedCreditClientId);
    if (!client) return;
    // Build a fingerprint of relevant credit fields to detect actual data changes
    const fingerprint = `${selectedCreditClientId}|${client.hasCredit}|${client.creditLimit}|${client.creditDays}|${client.isSolvent}|${client.creditAuthorizedBy}`;
    if (lastLoadedClientDataRef.current === fingerprint) return;
    lastLoadedClientDataRef.current = fingerprint;
    prevCreditClientIdRef.current = selectedCreditClientId;
    setCreditForm({
      hasCredit: client.hasCredit === true,
      creditLimit: String(Number(client.creditLimit ?? 0) || 0),
      creditDays: String(Number(client.creditDays ?? 0) || 0),
      isSolvent: client.isSolvent !== false,
      creditAuthorizedBy: String(client.creditAuthorizedBy || currentUser?.name || '').toUpperCase()
    });
    setCreditFormError('');
    setCreditFormSuccess('');
  }, [selectedCreditClientId, clients]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveCreditProfile = async () => {
    if (!selectedCreditClient) return;

    const creditLimit = Math.max(0, Number(creditForm.creditLimit ?? 0) || 0);
    const creditDays = Math.max(0, Number(creditForm.creditDays ?? 0) || 0);
    const creditAuthorizedBy = String(creditForm.creditAuthorizedBy ?? '').trim().toUpperCase();

    if (creditForm.hasCredit && creditLimit <= 0) {
      setCreditFormError('Debe asignar un límite de crédito mayor a 0 para autorizar crédito.');
      setCreditFormSuccess('');
      return;
    }
    if (creditForm.hasCredit && !creditAuthorizedBy) {
      setCreditFormError('Debe indicar quién autoriza el crédito para este cliente.');
      setCreditFormSuccess('');
      return;
    }

    try {
      creditSavingRef.current = true;
      setCreditSaving(true);
      setCreditFormError('');
      setCreditFormSuccess('');
      const authorizationChanged = creditAuthorizedBy !== String(selectedCreditClient.creditAuthorizedBy ?? '').trim().toUpperCase();
      await clientService.updateClientCreditProfile(selectedCreditClient.id, {
        hasCredit: creditForm.hasCredit,
        creditLimit,
        creditDays,
        isSolvent: creditForm.isSolvent,
        creditAuthorizedBy: creditForm.hasCredit ? creditAuthorizedBy : '',
        creditAuthorizedAt: creditForm.hasCredit
          ? ((authorizationChanged || !selectedCreditClient.creditAuthorizedAt) ? new Date().toISOString() : String(selectedCreditClient.creditAuthorizedAt ?? ''))
          : ''
      });
      prevCreditClientIdRef.current = '';
      lastLoadedClientDataRef.current = '';
      setCreditFormSuccess('Perfil crediticio actualizado correctamente.');
    } catch (e: any) {
      setCreditFormError(String(e?.message ?? 'Error guardando perfil de crédito.'));
      setCreditFormSuccess('');
    } finally {
      creditSavingRef.current = false;
      setCreditSaving(false);
    }
  };

  const paymentMethodOptions = [
    { id: 'cash_usd', label: 'Efectivo USD' },
    { id: 'cash_ves', label: 'Efectivo Bs' },
    { id: 'transfer', label: 'Transferencia Bs' },
    { id: 'mobile', label: 'Pago Móvil' },
    { id: 'debit', label: 'Débito' },
    { id: 'biopago', label: 'Biopago' },
    { id: 'zelle', label: 'Zelle' },
    { id: 'digital_usd', label: 'Transferencia / Digital USD' }
  ];

  const getBankTxMethodLabel = (method: string) => {
    const value = String(method ?? '').trim().toLowerCase();
    if (value === 'cash_usd') return 'Efectivo';
    if (value === 'cash_ves') return 'Efectivo';
    if (value === 'mobile') return 'Pago Movil';
    if (value === 'transfer') return 'Transferencia';
    if (value === 'debit') return 'Débito';
    if (value === 'biopago') return 'Biopago';
    if (value === 'zelle') return 'Zelle';
    if (value === 'digital_usd') return 'Transferencia / Digital USD';
    if (value === 'others') return 'Otros';
    if (value === 'credit') return 'Crédito';
    return String(method ?? '').trim();
  };

  const getBankTxCurrencyLabel = (currency: string) => {
    const value = String(currency ?? '').trim().toUpperCase();
    if (value === 'VES') return 'Bs';
    if (value === 'USD') return 'USD';
    return value;
  };

  /** Equivalente en USD usando tasa interna del sistema para movimientos en Bs. */
  const bankTxVesToEquivUsd = (t: any): number => {
    const cur = String(t?.currency ?? '').toUpperCase();
    if (cur === 'USD') return Number(t?.amountUSD ?? 0) || 0;
    const v = Number(t?.amountVES ?? 0) || 0;
    if (cur === 'VES') return v / financeInternalRate;
    return 0;
  };

  const formatTraceDate = (value?: string) => {
    const raw = String(value ?? '').trim();
    if (!raw) return '-';
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleDateString();
  };

  const getAPPaymentCurrency = (method: string): 'USD' | 'VES' => {
    const value = String(method ?? '').trim().toLowerCase();
    return value === 'zelle' || value === 'digital_usd' || value === 'cash_usd' ? 'USD' : 'VES';
  };

  const [editingBankId, setEditingBankId] = useState<string>('');
  const [bankFormName, setBankFormName] = useState('');
  const [bankFormActive, setBankFormActive] = useState(true);
  const [bankFormMethods, setBankFormMethods] = useState<Record<string, boolean>>({});
  const [bankAccounts, setBankAccounts] = useState<Array<{ id: string; label: string; currency: 'VES' | 'USD'; accountNumber: string; openingBalance?: number; accountType?: string; holder?: string; rif?: string; phone?: string }>>([]);
  const [bankFormError, setBankFormError] = useState<string>('');
  const [editingPOSTerminalId, setEditingPOSTerminalId] = useState('');
  const [posTerminalName, setPosTerminalName] = useState('');
  const [posTerminalSerial, setPosTerminalSerial] = useState('');
  const [posTerminalMerchantId, setPosTerminalMerchantId] = useState('');
  const [posTerminalAccountId, setPosTerminalAccountId] = useState('');
  const [posTerminalActive, setPosTerminalActive] = useState(true);
  const [posTerminalMethodFlags, setPosTerminalMethodFlags] = useState<Record<string, boolean>>({ debit: true, biopago: true });
  const [posTerminalNotes, setPosTerminalNotes] = useState('');
  const [posTerminalFormError, setPosTerminalFormError] = useState('');

  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; danger?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const openConfirm = (title: string, message: string, onConfirm: () => void, danger = false) =>
    setConfirmModal({ open: true, title, message, onConfirm, danger });
  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, open: false }));

  const [showBankTxModal, setShowBankTxModal] = useState(false);
  const [bankTxTarget, setBankTxTarget] = useState<any>(null);
  const [bankTxList, setBankTxList] = useState<any[]>([]);
  const [bankTxOpBal, setBankTxOpBal] = useState<{ usd: number | null; ves: number | null; loading: boolean }>({
    usd: null,
    ves: null,
    loading: false
  });
  const [bankTxLoading, setBankTxLoading] = useState(false);
  const [bankTxError, setBankTxError] = useState<string>('');
  const [showBankSupportModal, setShowBankSupportModal] = useState(false);
  const [bankSupportList, setBankSupportList] = useState<any[]>([]);
  const [bankSupportIndex, setBankSupportIndex] = useState(0);
  const [bankSupportLoading, setBankSupportLoading] = useState(false);
  const [bankSupportError, setBankSupportError] = useState('');
  const [showBankReportModal, setShowBankReportModal] = useState(false);
  const [selectedBankForReport, setSelectedBankForReport] = useState<any>(null);
  const [bankReportRows, setBankReportRows] = useState<any[]>([]);
  const [bankReportLoading, setBankReportLoading] = useState(false);
  const [bankReportError, setBankReportError] = useState('');
  const [allBankTransactions, setAllBankTransactions] = useState<any[]>([]);

  const activeBanks = React.useMemo(() => (banks || []).filter((bank: any) => bank?.active !== false), [banks]);

  const payrollBalanceKeys = useMemo(() =>
    payrollLines
      .filter(l => l.bankId)
      .map(l => ({
        bankId: l.bankId,
        accountId: l.accountId,
        currency: (l.method === 'cash_usd' || l.method === 'zelle' ? 'USD' : 'VES') as 'USD' | 'VES'
      })),
    [payrollLines]
  );
  const payrollBankBalances = useBankBalances(payrollBalanceKeys);

  const apPayBalanceKeys = React.useMemo(
    () =>
      showAPPaymentModal
        ? apPayLines
            .filter((l) => String(l.bankId ?? '').trim())
            .map((l) => ({
              bankId: String(l.bankId),
              accountId: '',
              currency: (getAPPaymentCurrency(l.method) === 'VES' ? 'VES' : 'USD') as 'USD' | 'VES'
            }))
        : [],
    [showAPPaymentModal, apPayLines]
  );
  const apPayBankBalances = useBankBalances(apPayBalanceKeys);

  const bankWideBalanceKeys = React.useMemo(() => {
    if (activeSubTab !== 'banks') return [];
    return (banks || []).flatMap((b: any) => {
      if (b?.active === false) return [];
      const prof = getBankCurrencyProfile(b);
      const keys: Array<{ bankId: string; accountId: string; currency: 'USD' | 'VES' }> = [];
      if (prof === 'USD_ONLY' || prof === 'MIXED' || prof === 'UNKNOWN') {
        keys.push({ bankId: String(b.id), accountId: '', currency: 'USD' });
      }
      if (prof === 'VES_ONLY' || prof === 'MIXED' || prof === 'UNKNOWN') {
        keys.push({ bankId: String(b.id), accountId: '', currency: 'VES' });
      }
      return keys;
    });
  }, [activeSubTab, banks, tick]);
  const bankWideBalances = useBankBalances(bankWideBalanceKeys);
  const getAPPaymentBankOptions = (method: string) => activeBanks.filter((bank: any) => {
    const supportedMethods = Array.isArray(bank?.supportedMethods) ? bank.supportedMethods : [];
    return supportedMethods.length === 0 || supportedMethods.includes(method);
  });

  const getAPPaymentAccountOptions = (bankId: string, method: string) => {
    const currency = getAPPaymentCurrency(method);
    const bank = activeBanks.find((item: any) => String(item?.id ?? '') === String(bankId ?? ''));
    const accounts = Array.isArray(bank?.accounts) ? bank.accounts : [];
    const compatible = accounts.filter((account: any) => String(account?.currency ?? '').trim().toUpperCase() === currency);
    return compatible.length > 0 ? compatible : accounts;
  };

  const getARCollectBankOptions = (method: string) => {
    const value = String(method ?? '').trim().toLowerCase();
    if (value === 'cash_usd' || value === 'cash_ves' || value === 'others') return [];
    return getAPPaymentBankOptions(value);
  };

  const getARCollectAccountOptions = (bankId: string, method: string) => getAPPaymentAccountOptions(bankId, method);

  const buildAPPaymentLine = (amountUSD = '', method = 'transfer') => {
    const bankOptions = getAPPaymentBankOptions(method);
    const bankId = String(bankOptions[0]?.id ?? '');
    const accountOptions = getAPPaymentAccountOptions(bankId, method);
    return {
      id: `ap-line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      method,
      bankId,
      accountId: String(accountOptions[0]?.id ?? ''),
      amountUSD,
      rateUsed: String(exchangeRate),
      reference: '',
      note: '',
      files: [] as File[]
    };
  };

  const apPayTotalUSD = React.useMemo(
    () => apPayLines.reduce((acc, line) => acc + (Number((line.amountUSD || '').replace(',', '.')) || 0), 0),
    [apPayLines]
  );
  const apPayBalanceUSD = React.useMemo(
    () => Number(apPayDetail?.balanceUSD ?? apPayTarget?.balanceUSD ?? 0) || 0,
    [apPayDetail, apPayTarget]
  );
  const apPayRemainingUSD = React.useMemo(
    () => Math.max(0, Math.round((apPayBalanceUSD - apPayTotalUSD) * 100) / 100),
    [apPayBalanceUSD, apPayTotalUSD]
  );

  useEffect(() => {
    if (!showAPPaymentModal || apPayLines.length === 0) return;
    let changed = false;
    const nextLines = apPayLines.map((line) => {
      const bankOptions = getAPPaymentBankOptions(line.method);
      const nextBankId = bankOptions.some((bank: any) => String(bank?.id ?? '') === String(line.bankId ?? ''))
        ? String(line.bankId ?? '')
        : String(bankOptions[0]?.id ?? '');
      const accountOptions = getAPPaymentAccountOptions(nextBankId, line.method);
      const nextAccountId = accountOptions.some((account: any) => String(account?.id ?? '') === String(line.accountId ?? ''))
        ? String(line.accountId ?? '')
        : String(accountOptions[0]?.id ?? '');
      if (nextBankId !== String(line.bankId ?? '') || nextAccountId !== String(line.accountId ?? '')) {
        changed = true;
        return {
          ...line,
          bankId: nextBankId,
          accountId: nextAccountId
        };
      }
      return line;
    });
    if (changed) {
      setApPayLines(nextLines);
    }
  }, [showAPPaymentModal, apPayLines, activeBanks]);

  const handleViewAPPayments = async (ap: any) => {
    setShowAPPaymentsModal(true);
    setApPaymentsTarget(ap);
    setApPayments([]);
    setApPaymentsVisibleCount(AP_PAYMENTS_PAGE_SIZE);
    setApPaymentsError('');
    setApPaymentsLoading(true);
    try {
      const list = await dataService.getAPPayments(ap.id);
      setApPayments(Array.isArray(list) ? list : []);
    } catch (e: any) {
      setApPaymentsError(String(e?.message ?? 'Error cargando pagos'));
    } finally {
      setApPaymentsLoading(false);
    }
  };

  const resetAPPaymentModal = () => {
    setShowAPPaymentModal(false);
    setApPayTargetId('');
    setApPayTarget(null);
    setApPayDetail(null);
    setApPayDetailLoading(false);
    setApPayLines([]);
    setApPayError('');
    setApPaySubmitting(false);
  };

  const addAPPaymentLine = (amountUSD = '') => {
    setApPayLines((prev) => [...prev, buildAPPaymentLine(amountUSD)]);
  };

  const updateAPPaymentLine = (lineId: string, patch: Partial<{
    method: string;
    bankId: string;
    accountId: string;
    amountUSD: string;
    rateUsed: string;
    reference: string;
    note: string;
    files: File[];
  }>) => {
    setApPayLines((prev) => prev.map((line) => {
      if (line.id !== lineId) return line;
      const next = { ...line, ...patch };
      const methodChanged = Object.prototype.hasOwnProperty.call(patch, 'method');
      const bankChanged = Object.prototype.hasOwnProperty.call(patch, 'bankId');
      const bankOptions = getAPPaymentBankOptions(next.method);
      if (!bankOptions.some((bank: any) => String(bank?.id ?? '') === String(next.bankId ?? ''))) {
        next.bankId = String(bankOptions[0]?.id ?? '');
      }
      const accountOptions = getAPPaymentAccountOptions(next.bankId, next.method);
      if (methodChanged && getAPPaymentCurrency(next.method) === 'VES' && !String(next.rateUsed ?? '').trim()) {
        next.rateUsed = String(exchangeRate);
      }
      if ((methodChanged || bankChanged) && !accountOptions.some((account: any) => String(account?.id ?? '') === String(next.accountId ?? ''))) {
        next.accountId = String(accountOptions[0]?.id ?? '');
      }
      return next;
    }));
  };

  const removeAPPaymentLine = (lineId: string) => {
    setApPayLines((prev) => prev.filter((line) => line.id !== lineId));
  };

  const handleAPPayment = async (ap: any) => {
    const balance = Number(ap?.balanceUSD ?? 0) || 0;
    setApPayTargetId(String(ap?.id ?? ''));
    setApPayTarget(ap);
    setApPayDetail(null);
    setApPayDetailLoading(true);
    setApPayLines([buildAPPaymentLine(balance > 0 ? balance.toFixed(2) : '')]);
    setApPayError('');
    setShowAPPaymentModal(true);
    try {
      const detail = await dataService.getAPEntryDetail(String(ap?.id ?? ''));
      setApPayDetail(detail);
    } catch (e: any) {
      setApPayError(String(e?.message ?? 'No se pudo cargar el detalle de la factura.'));
    } finally {
      setApPayDetailLoading(false);
    }
  };

  const submitAPPayment = async () => {
    if (!apPayTargetId || !apPayTarget) return;
    if (apPayLines.length === 0) {
      setApPayError('Debe agregar al menos un renglón de pago.');
      return;
    }
    let normalizedLines: Array<{
      amountUSD: number;
      method: string;
      currency: 'USD' | 'VES';
      amountVES: number;
      rateUsed: number;
      bank: any;
      account: any;
      reference: string;
      note: string;
      files: File[];
    }> = [];
    try {
      normalizedLines = apPayLines.map((line, index) => {
        const amountUSD = Number((line.amountUSD || '').replace(',', '.')) || 0;
        const method = String(line.method ?? '').trim().toLowerCase();
        const currency = getAPPaymentCurrency(method);
        const bank = activeBanks.find((item: any) => String(item?.id ?? '') === String(line.bankId ?? '')) ?? null;
        const account = getAPPaymentAccountOptions(line.bankId, method)
          .find((item: any) => String(item?.id ?? '') === String(line.accountId ?? '')) ?? null;
        const rateUsed = currency === 'VES' ? (Number((line.rateUsed || '').replace(',', '.')) || 0) : 0;
        const amountVES = currency === 'VES' ? Math.round(amountUSD * rateUsed * 100) / 100 : 0;
        if (!Number.isFinite(amountUSD) || amountUSD <= 0) {
          throw new Error(`El renglón ${index + 1} debe tener un monto USD válido.`);
        }
        if (!bank) {
          throw new Error(`Debe seleccionar un banco válido en el renglón ${index + 1}.`);
        }
        if (!account) {
          throw new Error(`Debe seleccionar una cuenta válida en el renglón ${index + 1}.`);
        }
        if (currency === 'VES' && (!Number.isFinite(rateUsed) || rateUsed <= 0)) {
          throw new Error(`Debe indicar una tasa válida en el renglón ${index + 1}.`);
        }
        return {
          amountUSD,
          method,
          currency,
          amountVES,
          rateUsed,
          bank,
          account,
          reference: String(line.reference ?? '').trim(),
          note: String(line.note ?? '').trim(),
          files: line.files
        };
      });
    } catch (e: any) {
      setApPayError(String(e?.message ?? 'Debe revisar los renglones de pago.'));
      return;
    }
    const totalUSD = normalizedLines.reduce((acc, line) => acc + line.amountUSD, 0);
    if (totalUSD - apPayBalanceUSD > 0.005) {
      setApPayError('La suma de los renglones excede el saldo pendiente de la cuenta por pagar.');
      return;
    }
    const groupedUsage = new Map<string, number>();
    for (const line of normalizedLines) {
      const key = `${String(line.bank.id ?? '')}|${line.currency}`;
      const current = groupedUsage.get(key) ?? 0;
      groupedUsage.set(key, Math.round((current + (line.currency === 'VES' ? line.amountVES : line.amountUSD)) * 100) / 100);
    }
    for (const [key, totalUsed] of groupedUsage.entries()) {
      const [bankId, currency] = key.split('|');
      const cur = currency === 'VES' ? 'VES' : 'USD';
      const available = await dataService.getAvailableBankBalance({ bankId, currency: cur });
      if (available + 0.005 < totalUsed) {
        setApPayError(`Saldo insuficiente en el banco seleccionado. Disponible ${currency === 'VES' ? 'Bs' : '$'} ${available.toFixed(2)} para consumir ${currency === 'VES' ? 'Bs' : '$'} ${totalUsed.toFixed(2)}.`);
        return;
      }
    }

    setApPaySubmitting(true);
    setApPayError('');
    try {
      await dataService.registerAPSplitPayments(apPayTargetId, {
        lines: normalizedLines.map((line) => ({
          amountUSD: line.amountUSD,
          method: line.method,
          currency: line.currency,
          amountVES: line.amountVES,
          rateUsed: line.rateUsed,
          bank: String(line.bank?.name ?? ''),
          bankId: String(line.bank?.id ?? ''),
          bankAccountId: String(line.account?.id ?? ''),
          reference: line.reference,
          note: line.note,
          files: line.files
        }))
      });
      resetAPPaymentModal();
    } catch (e: any) {
      setApPayError(String(e?.message ?? 'Error registrando pago de cuenta por pagar.'));
    } finally {
      setApPaySubmitting(false);
    }
  };

  const resetPOSTerminalForm = () => {
    setEditingPOSTerminalId('');
    setPosTerminalName('');
    setPosTerminalSerial('');
    setPosTerminalMerchantId('');
    setPosTerminalAccountId('');
    setPosTerminalActive(true);
    setPosTerminalMethodFlags({ debit: true, biopago: true });
    setPosTerminalNotes('');
    setPosTerminalFormError('');
  };

  const currentBankPOSTerminals = posTerminals.filter((t: any) => String(t?.bankId ?? '') === String(editingBankId ?? ''));

  const loadPOSTerminalToForm = (id: string) => {
    const terminal: any = posTerminals.find((t: any) => String(t?.id ?? '') === String(id ?? ''));
    if (!terminal) return;
    setEditingPOSTerminalId(String(terminal.id ?? ''));
    setPosTerminalName(String(terminal.name ?? ''));
    setPosTerminalSerial(String(terminal.serial ?? ''));
    setPosTerminalMerchantId(String(terminal.merchantId ?? ''));
    setPosTerminalAccountId(String(terminal.accountId ?? ''));
    setPosTerminalActive(terminal.active !== false);
    setPosTerminalMethodFlags({
      debit: Array.isArray(terminal.supportedMethods) ? terminal.supportedMethods.includes('debit') : true,
      biopago: Array.isArray(terminal.supportedMethods) ? terminal.supportedMethods.includes('biopago') : true
    });
    setPosTerminalNotes(String(terminal.notes ?? ''));
    setPosTerminalFormError('');
  };

  const handleSavePOSTerminal = async () => {
    setPosTerminalFormError('');
    if (!editingBankId) {
      setPosTerminalFormError('Primero debe guardar o seleccionar un banco.');
      return;
    }
    if (!posTerminalAccountId) {
      setPosTerminalFormError('Debe seleccionar una cuenta para la terminal POS.');
      return;
    }
    const supportedMethods = ['debit', 'biopago'].filter((id) => !!posTerminalMethodFlags[id]);
    if (supportedMethods.length === 0) {
      setPosTerminalFormError('Seleccione al menos un método para la terminal POS.');
      return;
    }
    try {
      await dataService.upsertPOSTerminal({
        id: editingPOSTerminalId || undefined,
        name: posTerminalName,
        serial: posTerminalSerial,
        merchantId: posTerminalMerchantId,
        bankId: editingBankId,
        accountId: posTerminalAccountId,
        supportedMethods,
        active: posTerminalActive,
        notes: posTerminalNotes
      });
      resetPOSTerminalForm();
    } catch (e: any) {
      setPosTerminalFormError(String(e?.message ?? 'Error guardando terminal POS.'));
    }
  };

  const handleDeletePOSTerminal = () => {
    if (!editingPOSTerminalId) return;
    openConfirm('Eliminar terminal POS', '¿Eliminar esta terminal POS? Esta acción no se puede deshacer.', async () => {
      closeConfirm();
      try {
        await dataService.deletePOSTerminal(editingPOSTerminalId);
        resetPOSTerminalForm();
      } catch (e: any) {
        setPosTerminalFormError(String(e?.message ?? 'Error eliminando terminal POS.'));
      }
    }, true);
  };

  const openBankSupportPreview = (supports: any[], index = 0) => {
    if (!Array.isArray(supports) || supports.length === 0) return;
    setBankSupportList(supports);
    setBankSupportIndex(Math.max(0, Math.min(index, supports.length - 1)));
    setBankSupportError('');
    setShowBankSupportModal(true);
  };

  const handleOpenBankTransactionSupport = async (tx: any) => {
    const embedded = Array.isArray(tx?.supports) ? tx.supports : [];
    if (embedded.length > 0) {
      openBankSupportPreview(embedded, 0);
      return;
    }

    setBankSupportLoading(true);
    setBankSupportError('');
    try {
      const list = await dataService.getBankTransactionSupports({
        source: String(tx?.source ?? ''),
        sourceId: String(tx?.sourceId ?? '')
      });
      if (Array.isArray(list) && list.length > 0) {
        setBankTxList(prev => prev.map(item => item?.id === tx?.id ? { ...item, supports: list } : item));
        openBankSupportPreview(list, 0);
        return;
      }
      setBankSupportError('Este movimiento no tiene comprobante asociado.');
      setShowBankSupportModal(true);
      setBankSupportList([]);
      setBankSupportIndex(0);
    } catch (e: any) {
      setBankSupportError(String(e?.message ?? 'No se pudo cargar el comprobante.'));
      setShowBankSupportModal(true);
      setBankSupportList([]);
      setBankSupportIndex(0);
    } finally {
      setBankSupportLoading(false);
    }
  };

  const currentBankSupport = bankSupportList[bankSupportIndex] ?? null;
  const currentBankSupportType = String(currentBankSupport?.contentType ?? '').toLowerCase();
  const currentBankSupportUrl = String(currentBankSupport?.url ?? '').trim();
  const currentBankSupportIsImage = currentBankSupportType.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(currentBankSupportUrl);

  const handleViewBankTx = async (bank: any) => {
    setShowBankTxModal(true);
    setBankTxTarget(bank);
    setBankTxLoading(true);
    setBankTxError('');
    try {
      const allTx = await dataService.getBankTransactions();
      let tx = allTx.filter((t: any) => String(t.bankId) === String(bank.id));
      const bprof = getBankCurrencyProfile(bank);
      if (bprof === 'USD_ONLY') {
        tx = tx.filter((t: any) => String(t?.currency ?? 'USD').toUpperCase() === 'USD');
      } else if (bprof === 'VES_ONLY') {
        tx = tx.filter((t: any) => String(t?.currency ?? '').toUpperCase() === 'VES');
      }
      setBankTxList(tx);
    } catch (e: any) {
      setBankTxError(String(e?.message ?? 'Error cargando movimientos'));
    } finally {
      setBankTxLoading(false);
    }
  };

  React.useEffect(() => {
    if (!showBankTxModal || !bankTxTarget?.id) return;
    let cancelled = false;
    const bid = String(bankTxTarget.id);
    const prof = getBankCurrencyProfile(bankTxTarget);
    setBankTxOpBal((s) => ({ ...s, loading: true }));
    (async () => {
      try {
        let usd: number | null = null;
        let ves: number | null = null;
        if (prof !== 'VES_ONLY') {
          usd = await dataService.getAvailableBankBalance({ bankId: bid, currency: 'USD' });
        }
        if (prof !== 'USD_ONLY') {
          ves = await dataService.getAvailableBankBalance({ bankId: bid, currency: 'VES' });
        }
        if (!cancelled) setBankTxOpBal({ usd, ves, loading: false });
      } catch {
        if (!cancelled) setBankTxOpBal({ usd: null, ves: null, loading: false });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showBankTxModal, bankTxTarget, tick]);

  React.useEffect(() => {
    if (!showManualTxModal || !manualTx.bankId) return;
    const bank = activeBanks.find((b: any) => String(b?.id ?? '') === String(manualTx.bankId));
    const accs = Array.isArray(bank?.accounts) ? bank.accounts : [];
    if (accs.length !== 1) return;
    const only = String(accs[0]?.id ?? '').trim();
    if (!only) return;
    setManualTx((p) => (p.accountId === only ? p : { ...p, accountId: only }));
  }, [showManualTxModal, manualTx.bankId, activeBanks]);

  const handleViewBankReport = async (bank: any) => {
    console.log('🏦 Abriendo reporte para banco:', bank);
    setSelectedBankForReport(bank);
    setShowBankReportModal(true);
    setBankReportLoading(true);
    setBankReportError('');
    setBankReportRows([]);
    try {
      const report = await generateBankReport(bank);
      setBankReportRows(Array.isArray(report) ? report : []);
    } catch (e: any) {
      setBankReportError(String(e?.message ?? 'No se pudo generar el reporte bancario.'));
    } finally {
      setBankReportLoading(false);
    }
  };

  const generateBankReport = async (bank: any) => {
    try {
      const bankTransactions = await dataService.getBankTransactions({ take: 1000 }) || [];
      const tx = bankTransactions
        .filter((t: any) => String(t.bankId) === String(bank.id))
        .filter((t: any) => isBankTransactionCountedForBalance(t))
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      let runningBalanceUSD = sumOpeningBalancesForBank(bank, 'USD');
      let runningBalanceVES = sumOpeningBalancesForBank(bank, 'VES');

      return tx.map((transaction: any) => {
        const amountUSD = transaction.amountUSD || 0;
        const amountVES = transaction.amountVES || 0;
        
        // Calcular débito/crédito
        const debitUSD = amountUSD < 0 ? Math.abs(amountUSD) : 0;
        const creditUSD = amountUSD > 0 ? amountUSD : 0;
        const debitVES = amountVES < 0 ? Math.abs(amountVES) : 0;
        const creditVES = amountVES > 0 ? amountVES : 0;
        
        // Actualizar saldo corrido
        runningBalanceUSD += amountUSD;
        runningBalanceVES += amountVES;

        const srcKey = String(transaction.source ?? '').trim().toUpperCase();
        const isManualOut = srcKey === 'MANUAL_ENTRY' && (amountUSD < 0 || amountVES < 0);
        const srcLabel: Record<string, string> = {
          SALE_PAYMENT: 'Cobro de venta', CREDIT_DOWN: 'Abono a crédito',
          AR_PAYMENT: 'Cobro CxC', AP_PAYMENT: 'Pago CxP',
          PURCHASE_PAYMENT: 'Pago de compra', SALE_RETURN: 'Devolución de venta',
          MANUAL_ENTRY: isManualOut ? 'Salida manual' : 'Entrada manual',
        };
        const descripcion = transaction.note || srcLabel[srcKey] || transaction.source || '';
        return {
          fecha: new Date(transaction.createdAt).toLocaleDateString(),
          descripcion,
          referencia: transaction.reference || '',
          metodo: transaction.method || '',
          origen: srcLabel[srcKey] ?? srcKey,
          contraparte: String(transaction.customerName ?? '').trim(),
          debitUSD,
          creditUSD,
          debitVES,
          creditVES,
          saldoUSD: runningBalanceUSD,
          saldoVES: runningBalanceVES,
          tipo: amountUSD >= 0 ? 'CRÉDITO' : 'DÉBITO'
        };
      });
    } catch (error) {
      console.error('Error generating bank report:', error);
      return [];
    }
  };

  const resetBankForm = () => {
    setEditingBankId('');
    setBankFormName('');
    setBankFormActive(true);
    setBankFormMethods({});
    setBankAccounts([]);
    setBankFormError('');
    resetPOSTerminalForm();
  };

  const loadBankToForm = (id: string) => {
    const b: any = banks.find(x => x.id === id);
    if (!b) return;
    setEditingBankId(b.id);
    setBankFormName(String(b.name ?? ''));
    setBankFormActive(b.active !== false);
    setBankFormError('');
    const m: Record<string, boolean> = {};
    (b.supportedMethods || []).forEach((x: string) => {
      const key = String(x);
      m[key === 'transfer_usd' ? 'digital_usd' : key] = true;
    });
    setBankFormMethods(m);
    setBankAccounts(Array.isArray(b.accounts) ? b.accounts : []);
    resetPOSTerminalForm();
  };

  useEffect(() => {
    if (!editingBankId) {
      if (posTerminalAccountId) setPosTerminalAccountId('');
      return;
    }
    const accountExists = bankAccounts.some((a) => String(a.id ?? '') === String(posTerminalAccountId ?? ''));
    if (!accountExists) {
      setPosTerminalAccountId(String(bankAccounts[0]?.id ?? ''));
    }
  }, [editingBankId, bankAccounts, posTerminalAccountId]);

  const toggleMethod = (id: string) => {
    setBankFormMethods(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const addAccountRow = () => {
    setBankAccounts(prev => ([
      ...prev,
      {
        id: Math.random().toString(36).slice(2, 10),
        label: 'Cuenta',
        currency: 'VES',
        accountNumber: '',
        openingBalance: 0
      }
    ]));
  };

  const removeAccountRow = (id: string) => {
    setBankAccounts(prev => prev.filter(a => a.id !== id));
  };

  const updateAccountRow = (id: string, patch: any) => {
    setBankAccounts(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  };

  const handleSaveBank = async () => {
    setBankFormError('');

    const supportedMethods = Array.from(new Set(
      paymentMethodOptions
        .filter(o => !!bankFormMethods[o.id])
        .map(o => (o.id === 'transfer_usd' ? 'digital_usd' : o.id))
    ));

    const accounts = bankAccounts.map(a => ({
      ...a,
      label: String(a.label ?? '').trim(),
      accountNumber: String(a.accountNumber ?? '').trim()
    })).filter(a => a.label && a.accountNumber);

    const normalizeAccountNumber = (v: string) => String(v ?? '').trim().toUpperCase().replace(/[\s\-]/g, '');
    const seen = new Set<string>();
    for (const a of accounts) {
      const key = `${a.currency}|${normalizeAccountNumber(a.accountNumber)}`;
      if (seen.has(key)) {
        setBankFormError(`Cuenta duplicada en el formulario: ${a.currency} ${a.accountNumber}`);
        return;
      }
      seen.add(key);
    }

    try {
      await dataService.upsertBank({
        id: editingBankId || undefined,
        name: bankFormName,
        active: bankFormActive,
        supportedMethods,
        accounts
      });
      resetBankForm();
    } catch (e: any) {
      setBankFormError(String(e?.message ?? 'Error guardando banco'));
    }
  };

  const handleDeleteBank = () => {
    if (!editingBankId) return;
    openConfirm('Eliminar banco', '¿Eliminar este banco? Esta acción no se puede deshacer.', async () => {
      closeConfirm();
      try {
        await dataService.deleteBank(editingBankId);
        resetBankForm();
      } catch (e: any) {
        setBankFormError(String(e?.message ?? 'Error eliminando banco'));
      }
    }, true);
    return;
  };


  const isCompanyLoanAREntry = (ar: any) => {
    const metaKind = String(ar?.meta?.kind ?? '').toUpperCase();
    if (metaKind === 'COMPANY_LOAN') return true;
    return String(ar?.saleCorrelativo ?? '').trim().toUpperCase().startsWith('PREST-');
  };

  // FIN-02: Filtered AR/AP/Ledger
  const filteredAR = React.useMemo(() => {
    const now = new Date();
    const q = arSearch.trim().toUpperCase();
    return arEntries.filter(e => {
      if (arStatusFilter !== 'ALL') {
        if (arStatusFilter === 'OPEN' && e.status === 'PAID') return false;
        if (arStatusFilter === 'OVERDUE' && !(e.status !== 'PAID' && new Date(e.dueDate) < now)) return false;
        if (arStatusFilter === 'PENDING' && !(e.status !== 'PAID' && new Date(e.dueDate) >= now)) return false;
        if (arStatusFilter === 'PAID' && e.status !== 'PAID') return false;
        if (arStatusFilter === 'LOANS' && !isCompanyLoanAREntry(e)) return false;
      }
      if (arDateRange.start) { const d = e.timestamp.toISOString().split('T')[0]; if (d < arDateRange.start) return false; }
      if (arDateRange.end)   { const d = e.timestamp.toISOString().split('T')[0]; if (d > arDateRange.end) return false; }
      if (q) {
        const customerName = String(e.customerName ?? '').toUpperCase();
        const customerId = String(e.customerId ?? '').toUpperCase();
        const saleCorrelativo = String(e.saleCorrelativo ?? '').toUpperCase();
        const description = String(e.description ?? '').toUpperCase();
        if (!customerName.includes(q) && !customerId.includes(q) && !saleCorrelativo.includes(q) && !description.includes(q)) return false;
      }
      return true;
    });
  }, [arEntries, arStatusFilter, arDateRange, arSearch]);

  const arStatementFilterNote = React.useMemo(() => {
    const parts: string[] = [];
    if (arStatusFilter === 'OPEN') parts.push('Pendientes + vencidas');
    else if (arStatusFilter === 'PENDING') parts.push('Solo pendientes (no vencidas)');
    else if (arStatusFilter === 'OVERDUE') parts.push('Solo vencidas');
    else if (arStatusFilter === 'PAID') parts.push('Solo liquidadas');
    else if (arStatusFilter === 'LOANS') parts.push('Solo préstamos internos');
    if (arDateRange.start || arDateRange.end) {
      parts.push(`Documento del ${arDateRange.start || '…'} al ${arDateRange.end || '…'}`);
    }
    if (arSearch.trim()) parts.push(`Búsqueda: «${arSearch.trim()}»`);
    return parts.length ? parts.join(' · ') : '';
  }, [arStatusFilter, arDateRange, arSearch]);

  const exportARStatementForCustomer = useCallback(
    (customerId: string) => {
      const entries = filteredAR.filter((e) => String(e.customerId) === String(customerId));
      const note = arStatementFilterNote.trim() || undefined;
      void reportService
        .exportARStatementToPDF(customerId, { entries, filterNote: note })
        .catch((err) => console.error('Estado de cuenta PDF', err));
    },
    [filteredAR, arStatementFilterNote]
  );

  const filteredAP = React.useMemo(() => {
    const now = new Date();
    const q = apSearch.trim().toUpperCase();
    return apEntries.filter(ap => {
      if (apStatusFilter !== 'ALL') {
        if (apStatusFilter === 'OPEN' && ap.status === 'PAID') return false;
        if (apStatusFilter === 'OVERDUE' && !(ap.status !== 'PAID' && new Date(ap.dueDate) < now)) return false;
        if (apStatusFilter === 'PENDING' && !(ap.status !== 'PAID' && new Date(ap.dueDate) >= now)) return false;
        if (apStatusFilter === 'PAID' && ap.status !== 'PAID') return false;
      }
      if (apDateRange.start) { const d = ap.timestamp.toISOString().split('T')[0]; if (d < apDateRange.start) return false; }
      if (apDateRange.end)   { const d = ap.timestamp.toISOString().split('T')[0]; if (d > apDateRange.end) return false; }
      if (q) {
        const supplier = String(ap.supplier ?? '').toUpperCase();
        const supplierId = String(ap.supplierId ?? '').toUpperCase();
        const id = String(ap.id ?? '').toUpperCase();
        const description = String(ap.description ?? '').toUpperCase();
        if (!supplier.includes(q) && !supplierId.includes(q) && !id.includes(q) && !description.includes(q)) return false;
      }
      return true;
    });
  }, [apEntries, apStatusFilter, apDateRange, apSearch]);

  const exportARFilteredExcel = useCallback(() => {
    const headers = ['Cliente', 'Documento', 'Vencimiento', 'Monto USD', 'Saldo USD', 'Estado'];
    const rows = filteredAR.map((e: any) => {
      const isOverdue = e.status !== 'PAID' && new Date(e.dueDate) < new Date();
      const state = isOverdue ? 'VENCIDO' : (e.status === 'PAID' ? 'PAGADO' : 'PENDIENTE');
      return [
        String(e.customerName ?? ''),
        String(e.saleCorrelativo ?? ''),
        e.dueDate ? new Date(e.dueDate).toLocaleDateString('es-VE') : '',
        Number(e.amountUSD ?? 0).toFixed(2),
        Number(e.balanceUSD ?? 0).toFixed(2),
        state
      ];
    });
    const preambleRows = [
      ['Reporte', 'CxC filtradas'],
      ['Filtro estado', arStatusFilter],
      ['Filtro fecha inicio', arDateRange.start || '-'],
      ['Filtro fecha fin', arDateRange.end || '-'],
      ['Busqueda', arSearch || '-']
    ];
    const csv = buildExcelFriendlyCsv(headers, rows, { preambleRows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cxc_filtradas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAR, arStatusFilter, arDateRange.start, arDateRange.end, arSearch]);

  const exportAPFilteredExcel = useCallback(() => {
    const headers = ['Proveedor', 'ID', 'Vencimiento', 'Saldo USD', 'Estado'];
    const rows = filteredAP.map((e: any) => {
      const isOverdue = e.status !== 'PAID' && new Date(e.dueDate) < new Date();
      const state = isOverdue ? 'VENCIDO' : (e.status === 'PAID' ? 'PAGADO' : 'PENDIENTE');
      return [
        String(e.supplier ?? ''),
        String(e.id ?? ''),
        e.dueDate ? new Date(e.dueDate).toLocaleDateString('es-VE') : '',
        Number(e.balanceUSD ?? 0).toFixed(2),
        state
      ];
    });
    const preambleRows = [
      ['Reporte', 'CxP filtradas'],
      ['Filtro estado', apStatusFilter],
      ['Filtro fecha inicio', apDateRange.start || '-'],
      ['Filtro fecha fin', apDateRange.end || '-'],
      ['Busqueda', apSearch || '-']
    ];
    const csv = buildExcelFriendlyCsv(headers, rows, { preambleRows });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cxp_filtradas_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredAP, apStatusFilter, apDateRange.start, apDateRange.end, apSearch]);

  const groupedAR = React.useMemo(() => {
    const now = new Date();
    const groups = new Map<string, {
      key: string;
      customerName: string;
      customerId: string;
      entries: any[];
      totalBalanceUSD: number;
      totalOriginalUSD: number;
      overdueCount: number;
      pendingCount: number;
      paidCount: number;
    }>();
    for (const item of filteredAR) {
      const key = `${String(item.customerId ?? '').trim() || 'NO_ID'}|${String(item.customerName ?? '').trim() || 'SIN NOMBRE'}`;
      const existing = groups.get(key) ?? {
        key,
        customerName: String(item.customerName ?? 'SIN NOMBRE'),
        customerId: String(item.customerId ?? 'NO_ID'),
        entries: [],
        totalBalanceUSD: 0,
        totalOriginalUSD: 0,
        overdueCount: 0,
        pendingCount: 0,
        paidCount: 0
      };
      const isOverdue = item.status !== 'PAID' && new Date(item.dueDate) < now;
      existing.entries.push(item);
      // Sincronizar Concentración con deuda real pendiente:
      // solo suma saldo de documentos no pagados y saldo positivo.
      const openBalance = item.status === 'PAID' ? 0 : Math.max(0, Number(item.balanceUSD ?? 0) || 0);
      existing.totalBalanceUSD += openBalance;
      existing.totalOriginalUSD += Number(item.amountUSD ?? 0) || 0;
      if (item.status === 'PAID') existing.paidCount += 1;
      else if (isOverdue) existing.overdueCount += 1;
      else existing.pendingCount += 1;
      groups.set(key, existing);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: group.entries.sort((a, b) => {
          const aDue = new Date(a.dueDate).getTime();
          const bDue = new Date(b.dueDate).getTime();
          return aDue - bDue;
        }),
        totalBalanceUSD: Number(group.totalBalanceUSD.toFixed(2)),
        totalOriginalUSD: Number(group.totalOriginalUSD.toFixed(2))
      }))
      .sort((a, b) => b.totalBalanceUSD - a.totalBalanceUSD);
  }, [filteredAR]);

  const groupedAP = React.useMemo(() => {
    const now = new Date();
    const groups = new Map<string, {
      key: string;
      supplier: string;
      supplierId: string;
      entries: any[];
      totalBalanceUSD: number;
      overdueCount: number;
      pendingCount: number;
      paidCount: number;
    }>();
    for (const item of filteredAP) {
      const key = `${String(item.supplierId ?? '').trim() || 'NO_ID'}|${String(item.supplier ?? '').trim() || 'SIN NOMBRE'}`;
      const existing = groups.get(key) ?? {
        key,
        supplier: String(item.supplier ?? 'SIN NOMBRE'),
        supplierId: String(item.supplierId ?? 'NO_ID'),
        entries: [],
        totalBalanceUSD: 0,
        overdueCount: 0,
        pendingCount: 0,
        paidCount: 0
      };
      const isOverdue = item.status !== 'PAID' && new Date(item.dueDate) < now;
      existing.entries.push(item);
      // Sincronizar Concentración con deuda real pendiente:
      // solo suma saldo de documentos no pagados y saldo positivo.
      const openBalance = item.status === 'PAID' ? 0 : Math.max(0, Number(item.balanceUSD ?? 0) || 0);
      existing.totalBalanceUSD += openBalance;
      if (item.status === 'PAID') existing.paidCount += 1;
      else if (isOverdue) existing.overdueCount += 1;
      else existing.pendingCount += 1;
      groups.set(key, existing);
    }
    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        entries: group.entries.sort((a, b) => {
          const aDue = new Date(a.dueDate).getTime();
          const bDue = new Date(b.dueDate).getTime();
          return aDue - bDue;
        }),
        totalBalanceUSD: Number(group.totalBalanceUSD.toFixed(2))
      }))
      .sort((a, b) => b.totalBalanceUSD - a.totalBalanceUSD);
  }, [filteredAP]);

  const displayedAP = React.useMemo(() => {
    if (!expandedAPSupplierKey) return filteredAP;
    const selected = groupedAP.find((g) => g.key === expandedAPSupplierKey);
    if (!selected) return filteredAP;
    return selected.entries;
  }, [filteredAP, groupedAP, expandedAPSupplierKey]);

  useEffect(() => {
    setApPage(0);
  }, [expandedAPSupplierKey, apSearch, apStatusFilter, apDateRange.start, apDateRange.end]);

  useEffect(() => {
    if (!expandedAPSupplierKey) return;
    const exists = groupedAP.some((group) => group.key === expandedAPSupplierKey);
    if (!exists) setExpandedAPSupplierKey(null);
  }, [groupedAP, expandedAPSupplierKey]);

  const advanceBalanceByCustomer = React.useMemo(() => {
    const normalizeCustomerId = (value: any) => String(value ?? '').trim().toUpperCase();
    return allClientAdvances.reduce((acc, adv) => {
      const customerId = normalizeCustomerId(adv.customerId);
      if (!customerId) return acc;
      acc[customerId] = (acc[customerId] || 0) + (Number(adv.balanceUSD ?? 0) || 0);
      return acc;
    }, {} as Record<string, number>);
  }, [allClientAdvances]);

  const openAdvancesByCustomer = React.useMemo(() => {
    const normalizeCustomerId = (value: any) => String(value ?? '').trim().toUpperCase();
    return allClientAdvances.reduce((acc, adv) => {
      const customerId = normalizeCustomerId(adv.customerId);
      if (!customerId) return acc;
      if (!acc[customerId]) acc[customerId] = [];
      acc[customerId].push(adv);
      return acc;
    }, {} as Record<string, ClientAdvance[]>);
  }, [allClientAdvances]);

  const filteredLedger = React.useMemo(() => {
    const dayStr = (e: any) => {
      const t = e?.timestamp;
      if (t instanceof Date && !Number.isNaN(t.getTime())) return t.toISOString().slice(0, 10);
      if (e?.date) return String(e.date).slice(0, 10);
      return String(t ?? '').slice(0, 10);
    };
    return ledger.filter((e: any) => {
      if (ledgerDateRange.start) {
        const d = dayStr(e);
        if (d < ledgerDateRange.start) return false;
      }
      if (ledgerDateRange.end) {
        const d = dayStr(e);
        if (d > ledgerDateRange.end) return false;
      }
      return true;
    });
  }, [ledger, ledgerDateRange]);

  /** Una fila por asiento contable, mismos importes que el mayor (evita montos $0 si `detalles_asiento` no llega por cliente). */
  const operationalLedgerView = React.useMemo(() => {
    if (!Array.isArray(mayorRows) || mayorRows.length === 0) return filteredLedger;
    const bySeat = new Map<
      string,
      { fecha: Date; tipoOperacion: string; descripcionAsiento: string; sumDebe: number; sumHaber: number }
    >();
    for (const r of mayorRows) {
      const id = String(r.asientoId ?? '').trim();
      if (!id) continue;
      const fecha = r.fecha instanceof Date ? r.fecha : new Date(r.fecha);
      const debe = Number(r.debe ?? 0) || 0;
      const haber = Number(r.haber ?? 0) || 0;
      const prev = bySeat.get(id);
      if (!prev) {
        bySeat.set(id, {
          fecha,
          tipoOperacion: String(r.tipoOperacion ?? '').trim(),
          descripcionAsiento: String(r.descripcionAsiento ?? '').trim(),
          sumDebe: debe,
          sumHaber: haber
        });
      } else {
        prev.sumDebe += debe;
        prev.sumHaber += haber;
        bySeat.set(id, prev);
      }
    }
    return Array.from(bySeat.values())
      .map((v) => ({
        timestamp: v.fecha,
        type: dataService.getLedgerFlowTypeForOperation(v.tipoOperacion),
        category: v.tipoOperacion || 'ASIENTO',
        description: v.descripcionAsiento || 'Movimiento contable',
        amountUSD: Math.round(Math.max(v.sumDebe, v.sumHaber) * 100) / 100
      }))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [mayorRows, filteredLedger]);

  useEffect(() => {
    if (activeSubTab !== 'ledger') return;
    let cancelled = false;
    setMayorLoading(true);
    (async () => {
      const opts = await dataService.listCuentasContablesMayor();
      if (!cancelled) setCuentaOptionsMayor(opts);
      const rows = await dataService.fetchMayorCuentaSaldo({
        fechaDesde: ledgerDateRange.start?.trim() || null,
        fechaHasta: ledgerDateRange.end?.trim() || null,
        cuentaCodigo: ledgerAccountFilter.trim() || null
      });
      if (!cancelled) {
        setMayorRows(Array.isArray(rows) ? rows : []);
        setMayorLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setMayorRows([]);
        setMayorLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeSubTab, ledgerDateRange.start, ledgerDateRange.end, ledgerAccountFilter, tick]);

  // FIN-04: Manual bank transaction handler
  const handleManualBankTx = async () => {
    if (!manualTx.bankId || !manualTx.concept) {
      setManualTxError('Banco y concepto son obligatorios');
      return;
    }
    const accountId = String(manualTx.accountId ?? '').trim();
    if (!accountId) {
      setManualTxError('Seleccione la cuenta bancaria.');
      return;
    }
    const rawUSD = parseFloat((manualTx.amountUSD || '0').replace(',', '.'));
    const rawVES = parseFloat((manualTx.amountVES || '0').replace(',', '.'));
    const amtUSD = Number.isFinite(rawUSD) ? Math.abs(rawUSD) : 0;
    const amtVES = Number.isFinite(rawVES) ? Math.abs(rawVES) : 0;
    if (amtUSD === 0 && amtVES === 0) {
      setManualTxError('Ingrese al menos un monto');
      return;
    }
    if (manualTx.type === 'OUT') {
      if (amtUSD > 0) {
        const availableUSD = await dataService.getAvailableBankBalance({
          bankId: manualTx.bankId,
          accountId,
          currency: 'USD'
        });
        if ((availableUSD + 0.005) < amtUSD) {
          setManualTxError(`Saldo insuficiente en USD (cuenta). Disponible: $ ${availableUSD.toFixed(2)}.`);
          return;
        }
      }
      if (amtVES > 0) {
        const availableVES = await dataService.getAvailableBankBalance({
          bankId: manualTx.bankId,
          accountId,
          currency: 'VES'
        });
        if ((availableVES + 0.05) < amtVES) {
          setManualTxError(`Saldo insuficiente en Bs (cuenta). Disponible: Bs ${availableVES.toFixed(2)}.`);
          return;
        }
      }
    }
    setManualTxSaving(true);
    setManualTxError('');
    try {
      // Mantener separación estricta por moneda en movimientos manuales:
      // no convertir automáticamente Bs<->USD aquí para evitar salidas "mixtas" no deseadas.
      const sign = manualTx.type === 'OUT' ? -1 : 1;
      await dataService.addManualBankTransaction({
        bankId: manualTx.bankId,
        accountId,
        amountUSD: sign * amtUSD,
        amountVES: sign * amtVES,
        method: 'MANUAL',
        reference: manualTx.reference || undefined,
        description: manualTx.concept
      });
      setManualTx({ bankId: '', accountId: '', concept: '', reference: '', amountUSD: '', amountVES: '', type: 'IN' });
      setShowManualTxModal(false);
      setTick((t) => t + 1);
    } catch (e: any) {
      setManualTxError(String(e?.message ?? 'Error al guardar'));
    } finally {
      setManualTxSaving(false);
    }
  };

  const handleARPayment = (ar: any) => {
    setArCollectTarget(ar);
    setArCollectAmount('');
    setArCollectMethod('transfer');
    setArCollectBank('');
    const bankOptions = getARCollectBankOptions('transfer');
    const bankId = String(bankOptions[0]?.id ?? '');
    const accountOptions = getARCollectAccountOptions(bankId, 'transfer');
    setArCollectBankId(bankId);
    setArCollectAccountId(String(accountOptions[0]?.id ?? ''));
    setArCollectRate(String(exchangeRate));
    setArCollectRef('');
    setArCollectNote('');
    setArCollectError('');
    setArCollectLastReceipt(null);
    setArCollectAdvanceBalance(null);
    const cid = String(ar?.customerId ?? '').trim();
    if (cid) {
      void dataService
        .getClientAdvanceBalance(cid)
        .then((b) => setArCollectAdvanceBalance(Number(b) || 0))
        .catch(() => setArCollectAdvanceBalance(0));
    } else {
      setArCollectAdvanceBalance(0);
    }
    setShowARCollectModal(true);
  };

  const handleCreateLoan = async () => {
    const amount = Number.parseFloat(String(loanForm.amountUSD || '0').replace(',', '.'));
    const days = Number.parseInt(String(loanForm.daysToPay || '0'), 10);
    if (!loanForm.beneficiaryName.trim()) { setLoanError('Indica el nombre del beneficiario.'); return; }
    if (!loanForm.description.trim()) { setLoanError('Indica la descripción del préstamo.'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { setLoanError('Monto inválido.'); return; }
    if (!Number.isFinite(days) || days <= 0) { setLoanError('Plazo inválido (días).'); return; }
    setLoanSubmitting(true);
    setLoanError('');
    try {
      await dataService.createCompanyLoan({
        beneficiaryType: loanForm.beneficiaryType,
        beneficiaryName: loanForm.beneficiaryName.trim(),
        beneficiaryId: loanForm.beneficiaryId.trim(),
        description: loanForm.description.trim(),
        amountUSD: amount,
        daysToPay: days,
        sourceMethod: loanForm.sourceMethod.trim(),
        sourceBankName: loanForm.sourceBankName.trim(),
        reference: loanForm.reference.trim(),
        note: loanForm.note.trim()
      });
      setShowCreateLoanModal(false);
      setLoanForm({
        beneficiaryType: 'EMPLOYEE',
        beneficiaryName: '',
        beneficiaryId: '',
        description: '',
        amountUSD: '',
        daysToPay: '30',
        sourceMethod: 'transfer',
        sourceBankName: '',
        sourceBankId: '',
        sourceAccountId: '',
        reference: '',
        note: ''
      });
    } catch (e: any) {
      setLoanError(String(e?.message ?? 'No se pudo registrar el préstamo.'));
    } finally {
      setLoanSubmitting(false);
    }
  };

  const handleARCollectSubmit = async () => {
    const amt = parseFloat(arCollectAmount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) { setArCollectError('Ingrese un monto válido mayor a cero.'); return; }
    const balance = Number(arCollectTarget?.balanceUSD ?? 0);
    if (amt > balance + 0.005) { setArCollectError(`El monto excede el saldo pendiente ($${balance.toFixed(2)}).`); return; }
    setArCollectSubmitting(true);
    setArCollectError('');
    try {
      if (arCollectMethod === 'others') {
        const cid = String(arCollectTarget.customerId ?? '').trim();
        if (!cid) {
          setArCollectError('El registro CxC no tiene cliente asociado.');
          return;
        }
        let advBal = arCollectAdvanceBalance;
        if (advBal == null || Number.isNaN(advBal)) {
          advBal = await dataService.getClientAdvanceBalance(cid);
          setArCollectAdvanceBalance(advBal);
        }
        if (advBal + 0.005 < amt) {
          setArCollectError(
            `Saldo de anticipos insuficiente. Disponible: $${(Number(advBal) || 0).toFixed(2)}. Reduzca el monto o use transferencia/efectivo en caja.`
          );
          return;
        }
        const applied = await dataService.applyClientAdvance({
          customerId: cid,
          amountToApplyUSD: amt,
          appliedInCorrelativo: String(arCollectTarget.saleCorrelativo ?? ''),
          appliedInSaleId: String(arCollectTarget.id ?? arCollectTarget.saleCorrelativo ?? '')
        });
        if (applied + 0.02 < amt) {
          setArCollectError(
            `No se pudo cruzar el monto completo contra anticipos (aplicado: $${applied.toFixed(2)}). Verifique Finanzas → Anticipos y reintente.`
          );
          return;
        }
        const noteParts = [arCollectNote?.trim(), 'Abono CxC vía anticipo (Otros · Finanzas)'].filter(Boolean);
        await dataService.registerARPaymentWithSupport(arCollectTarget.id, amt, {
          method: 'Otros (anticipo)',
          bank: '',
          reference: arCollectRef?.trim() || `Anticipo → ${arCollectTarget.saleCorrelativo}`,
          note: noteParts.join(' · '),
          currency: 'USD',
          amountVES: 0,
          rateUsed: 0
        });
        const newBalance = Math.max(0, balance - amt);
        const receiptData = {
          receiptNumber: `REC-${arCollectTarget.saleCorrelativo}-${Date.now().toString(36).toUpperCase()}`,
          customerName: arCollectTarget.customerName,
          customerId: arCollectTarget.customerId || '',
          saleCorrelativo: arCollectTarget.saleCorrelativo,
          amountUSD: amt,
          method: 'Otros (anticipo)',
          bank: undefined,
          reference: arCollectRef?.trim() || undefined,
          note: arCollectNote?.trim() || undefined,
          operatorName: dataService.getCurrentUser()?.name || 'Sistema',
          balanceAfterUSD: newBalance,
          originalAmountUSD: Number(arCollectTarget.amountUSD ?? 0),
          timestamp: new Date()
        };
        setArCollectLastReceipt(receiptData);
        void dataService.getClientAdvanceBalance(cid).then((b) => setArCollectAdvanceBalance(Number(b) || 0));
      } else {
        const isLoan = isCompanyLoanAREntry(arCollectTarget);
        const currency = getAPPaymentCurrency(arCollectMethod);
        const selectedBank = activeBanks.find((item: any) => String(item?.id ?? '') === String(arCollectBankId ?? '')) ?? null;
        const selectedAccount = getARCollectAccountOptions(arCollectBankId, arCollectMethod)
          .find((item: any) => String(item?.id ?? '') === String(arCollectAccountId ?? '')) ?? null;
        const rateUsed = currency === 'VES' ? (Number(String(arCollectRate || '').replace(',', '.')) || 0) : 0;
        if (currency === 'VES' && rateUsed <= 0) {
          setArCollectError('Ingrese la tasa usada para recibir este abono en Bs.');
          return;
        }
        const amountVES = currency === 'VES' ? Math.round(amt * rateUsed * 100) / 100 : 0;
        if (isLoan) {
          const loanId = String(arCollectTarget?.meta?.loanId ?? '').trim();
          if (!loanId) throw new Error('El préstamo no tiene vínculo de auditoría (loanId).');
          await dataService.registerCompanyLoanPayment(loanId, amt, {
            method: arCollectMethod,
            bank: selectedBank?.name || arCollectBank || undefined,
            bankId: selectedBank?.id ? String(selectedBank.id) : undefined,
            bankAccountId: selectedAccount?.id ? String(selectedAccount.id) : undefined,
            bankAccountLabel: selectedAccount?.label ? String(selectedAccount.label) : undefined,
            reference: arCollectRef || undefined,
            note: arCollectNote || undefined,
            currency,
            amountVES,
            rateUsed
          });
        } else {
          await dataService.registerARPaymentWithSupport(arCollectTarget.id, amt, {
            method: arCollectMethod,
            bank: selectedBank?.name || arCollectBank || undefined,
            bankId: selectedBank?.id ? String(selectedBank.id) : undefined,
            bankAccountId: selectedAccount?.id ? String(selectedAccount.id) : undefined,
            bankAccountLabel: selectedAccount?.label ? String(selectedAccount.label) : undefined,
            reference: arCollectRef || undefined,
            note: arCollectNote || undefined,
            currency,
            amountVES,
            rateUsed
          });
        }
        const newBalance = Math.max(0, balance - amt);
        const receiptData = {
          receiptNumber: `REC-${arCollectTarget.saleCorrelativo}-${Date.now().toString(36).toUpperCase()}`,
          customerName: arCollectTarget.customerName,
          customerId: arCollectTarget.customerId || '',
          saleCorrelativo: arCollectTarget.saleCorrelativo,
          amountUSD: amt,
          amountVES,
          rateUsed,
          currency,
          method: arCollectMethod,
          bank: selectedBank?.name || arCollectBank || undefined,
          reference: arCollectRef || undefined,
          note: arCollectNote || undefined,
          operatorName: dataService.getCurrentUser()?.name || 'Sistema',
          balanceAfterUSD: newBalance,
          originalAmountUSD: Number(arCollectTarget.amountUSD ?? 0),
          timestamp: new Date()
        };
        setArCollectLastReceipt(receiptData);
      }
    } catch (e: any) {
      setArCollectError(e?.message || 'Error al registrar el pago.');
    } finally {
      setArCollectSubmitting(false);
    }
  };

  const bankTxModalProfile =
    showBankTxModal && bankTxTarget ? getBankCurrencyProfile(bankTxTarget) : 'UNKNOWN';

  const payrollSystemUsers = dataService.getUsers().filter(u => u.active && (u.companyRole === 'EMPLEADO' || u.companyRole === 'SOCIO'));
  const payrollSelectedUser = payrollSystemUsers.find(u => u.id === payrollEmpId);
  const payrollUserAREntries = payrollSelectedUser?.cedula
    ? arEntries.filter(e => e.customerId === payrollSelectedUser.cedula && e.status !== 'PAID' && (e.balanceUSD ?? 0) > 0)
    : [];
  const payrollSalaryNum = parseFloat(payrollSalary) || 0;
  const payrollCxcAmtNum = parseFloat(payrollCxcAmount) || 0;
  const payrollCxcUSD = payrollCxcCurrency === 'USD' ? payrollCxcAmtNum : payrollCxcAmtNum / (exchangeRate || 1);
  const payrollNeto = Math.max(0, payrollSalaryNum - payrollCxcUSD);
  const payrollTotalPaid = payrollLines.reduce((s, l) => s + (parseFloat(l.amountUSD) || 0), 0);
  const payrollPendiente = Math.max(0, payrollNeto - payrollTotalPaid);
  const closePayrollModal = () => {
    setShowPayrollModal(false);
    setPayrollEmpId(''); setPayrollEmpSearch(''); setPayrollEmpOpen(false);
    setPayrollSalary(''); setPayrollPeriod('');
    setPayrollCxcCurrency('USD'); setPayrollCxcAmount('');
    setPayrollObservation(''); setPayrollError('');
    setPayrollLines([{ method: 'cash_usd', bankId: '', accountId: '', currency: 'USD', amountUSD: '', amountBS: '', rate: '', ref: '' }]);
    setPayrollCxcInvoices({});
    setPayrollCxcAbonos({});
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-6 duration-700 pb-16">
      <div className="flex justify-between items-end gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-slate-900 rounded-[1rem] shadow-xl shadow-slate-900/10">
                <Landmark className="w-6 h-6 text-emerald-400" />
             </div>
             <div>
                <h2 className="font-headline text-2xl md:text-3xl lg:text-4xl font-black tracking-tighter text-slate-900">Tesorería y Cobranzas</h2>
             </div>
          </div>
        </div>
        
        <div className="flex flex-wrap bg-slate-100 p-1.5 rounded-[1.5rem] border border-slate-200 shadow-inner gap-1 w-full lg:w-auto">
           {[
             { id: 'indicators', label: 'Dashboard', icon: Wallet },
             { id: 'invoices', label: 'Historial Facturas', icon: ReceiptText },
             { id: 'credit', label: 'Crédito', icon: Scale },
             { id: 'expenses', label: 'Gastos', icon: AlertCircle },
             { id: 'ar', label: 'Cuentas x Cobrar', icon: ArrowUpRight },
             { id: 'ap', label: 'Cuentas x Pagar', icon: ArrowDownRight },
             { id: 'ledger', label: 'Libro Mayor', icon: History },
             { id: 'banks', label: 'Bancos', icon: Building2 },
             { id: 'calendar', label: 'Calendario', icon: Calendar },
             { id: 'advances', label: 'Anticipos', icon: Wallet }
           ].map((tab) => (
             <button 
               key={tab.id}
               onClick={() => setActiveSubTab(tab.id as any)}
               className={`flex items-center justify-center gap-2 px-3 md:px-4 lg:px-6 py-2 rounded-[1rem] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all duration-300 min-h-[40px] md:min-h-[42px] ${
                 activeSubTab === tab.id 
                   ? 'bg-white text-slate-900 shadow-xl shadow-slate-200/50' 
                   : 'text-slate-400 hover:text-slate-600'
               }`}
             >
               <tab.icon className={`w-3.5 h-3.5 ${activeSubTab === tab.id ? 'text-emerald-600' : ''}`} />
               {tab.label}
             </button>
           ))}
        </div>
      </div>

      {activeSubTab === 'indicators' && (
        <div className="space-y-6 md:space-y-10 animate-in zoom-in-95 duration-500">
           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6 lg:gap-6">
              <FinanceCard 
                title="Bóveda Consolidada (USD)" 
                value={fmt(mtdStats.totalSalesUSD)} 
                unit="USD (MTD)" 
                trend="+100%" 
                variant="dark"
                icon={TrendingUp}
              />
              <FinanceCard 
                title="Cuentas por cobrar" 
                value={fmt(totalAR)} 
                unit="USD" 
                trend={`${arEntries.filter(e => e.status !== 'PAID').length} Pendientes`} 
                variant="info"
                icon={ArrowUpRight}
              />
              <FinanceCard 
                title="Cuentas por pagar" 
                value={fmt(totalAP)} 
                unit="USD" 
                trend={`${apEntries.filter(e => e.status !== 'PAID').length} Proveedores`} 
                variant="warning"
                icon={ArrowDownRight}
              />
              <button
                type="button"
                onClick={() => setActiveSubTab('advances')}
                className="text-left transition-transform hover:scale-[1.02]"
                title="Ver detalle de anticipos de clientes"
              >
                <FinanceCard 
                  title="Saldo a Favor (Anticipos)" 
                  value={fmt(totalAdvances)} 
                  unit="USD" 
                  trend={`${allClientAdvances.filter(a => a.balanceUSD > 0.005).length} Clientes con saldo`} 
                  variant="success"
                  icon={Wallet}
                />
              </button>
              <FinanceCard 
                title="Punto de Equilibrio (MTD)" 
                value={mtdStats.progress} 
                unit="%" 
                progress={mtdStats.progress}
                variant="neutral"
                icon={Timer}
                secondaryLabel={`Meta: ${usd(mtdStats.breakEvenUSD)}`}
              />
           </div>

           {(() => {
             // Ventas de los últimos 7 días (sin anuladas)
             const today = new Date(); today.setHours(23, 59, 59, 999);
             const chartDays = Array.from({ length: 7 }, (_, i) => {
               const d = new Date(today);
               d.setDate(today.getDate() - (6 - i));
               return d;
             });
             const chartData = chartDays.map(day => {
               const start = new Date(day); start.setHours(0, 0, 0, 0);
               const end = new Date(day); end.setHours(23, 59, 59, 999);
               const total = sales
                 .filter(s => (s as any).status !== 'VOID' && s.timestamp >= start && s.timestamp <= end)
                 .reduce((sum, s) => sum + s.totalUSD, 0);
               return { label: day.toLocaleDateString('es-VE', { weekday: 'short', day: 'numeric' }), total };
             });
             const maxVal = Math.max(...chartData.map(d => d.total), 1);
             return (
               <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6 lg:gap-8 items-start">
                 <div className="lg:col-span-8 bg-white p-4 md:p-6 lg:p-10 rounded-[2rem] md:rounded-[2.5rem] lg:rounded-[3rem] border border-slate-200 shadow-sm flex flex-col gap-4 md:gap-6 lg:gap-8 h-full">
                   <div className="flex justify-between items-center px-2 md:px-4">
                     <h3 className="font-headline font-black text-lg md:text-xl lg:text-2xl tracking-tighter text-slate-900">Ventas Últimos 7 Días</h3>
                     <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase">
                       Total: {usd(chartData.reduce((s, d) => s + d.total, 0))}
                     </span>
                   </div>
                   <div className="flex-1 flex items-end gap-2 md:gap-4 h-48 md:h-56 lg:h-64 px-2 md:px-4 bg-slate-50/30 rounded-2xl md:rounded-3xl p-4 md:p-6 border border-dashed border-slate-200">
                     {chartData.map((d, i) => (
                       <div key={i} className="flex-1 flex flex-col items-center gap-1 justify-end h-full">
                        <span className="text-[8px] font-black text-slate-500">{d.total > 0 ? usd(d.total, 0) : ''}</span>
                         <div
                           className={`w-full rounded-t-lg transition-all duration-700 shadow-sm ${d.total > 0 ? 'bg-emerald-500' : 'bg-slate-200'}`}
                           style={{ height: `${Math.max((d.total / maxVal) * 100, d.total > 0 ? 4 : 1)}%` }}
                         />
                         <span className="text-[7px] font-bold text-slate-400 uppercase text-center leading-tight">{d.label}</span>
                       </div>
                     ))}
                   </div>
                 </div>
                 <div className="lg:col-span-4 flex flex-col gap-4 md:gap-6 lg:gap-8">
                   <div className="bg-emerald-900 p-4 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl space-y-4 md:space-y-6 text-white relative overflow-hidden group">
                     <Wallet className="absolute -top-10 -right-10 w-48 h-48 opacity-5 group-hover:opacity-10 transition-opacity" />
                     <div className="flex items-center gap-3 relative z-10">
                       <CreditCard className="w-4 h-4 md:w-5 md:h-5 text-emerald-400" />
                       <h4 className="font-headline font-black text-xs md:text-sm uppercase tracking-widest text-emerald-100">Billetera de Divisas</h4>
                     </div>
                     <div className="relative z-10">
                       <h4 className="text-2xl md:text-3xl lg:text-4xl font-black font-headline tracking-tighter">$ {(Object.values(byMethod).reduce((a: any, b: any) => a + b, 0) as number).toFixed(2)}</h4>
                       <p className="text-[10px] font-bold text-emerald-400/60 uppercase tracking-widest">Total Líquido Estimado</p>
                     </div>
                     {canEditFinance && (
                       <button
                         onClick={() => { setActiveSubTab('banks'); setShowManualTxModal(true); }}
                         className="w-full py-4 bg-white text-emerald-900 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] relative z-10 hover:bg-emerald-50 transition-colors"
                       >
                         Movimiento Manual
                       </button>
                    )}
                   </div>
                 </div>
               </div>
             );
           })()}

           {/* FIN-05: Proyección Flujo de Caja */}
           {(() => {
             const today = new Date();
             today.setHours(0, 0, 0, 0);
             const horizons = [7, 14, 30];
             const cfData = horizons.map(days => {
               const limit = new Date(today);
               limit.setDate(today.getDate() + days);
               const arIn = arEntries.filter(e => e.status !== 'PAID' && e.dueDate >= today && e.dueDate <= limit)
                 .reduce((s, e) => s + Number(e.balanceUSD ?? 0), 0);
               const apOut = apEntries.filter(e => e.status !== 'PAID' && e.dueDate >= today && e.dueDate <= limit)
                 .reduce((s, e) => s + Number(e.balanceUSD ?? 0), 0);
               const overdueAR = arEntries.filter(e => e.status !== 'PAID' && e.dueDate < today)
                 .reduce((s, e) => s + Number(e.balanceUSD ?? 0), 0);
               const overdueAP = apEntries.filter(e => e.status !== 'PAID' && e.dueDate < today)
                 .reduce((s, e) => s + Number(e.balanceUSD ?? 0), 0);
               return { days, arIn, apOut, net: arIn - apOut, overdueAR, overdueAP };
             });

             const arByDate = arEntries
               .filter(e => e.status !== 'PAID')
               .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
               .slice(0, 8);
             const apByDate = apEntries
               .filter(e => e.status !== 'PAID')
               .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
               .slice(0, 8);

             return (
               <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                 <div className="p-8 border-b border-slate-100 bg-[#f8fafc]/50 flex justify-between items-center">
                   <div>
                     <h3 className="font-headline font-black text-lg uppercase tracking-tight">Proyección de Flujo de Caja</h3>
                     <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Entradas AR vs Salidas AP por vencer</p>
                   </div>
                 </div>
                 <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-4 border-b border-slate-100">
                   {cfData.map(h => (
                     <div key={h.days} className={`p-5 rounded-2xl border ${h.net >= 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-red-200 bg-red-50/40'}`}>
                       <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Próximos {h.days} días</div>
                       <div className="space-y-1 text-[11px]">
                         <div className="flex justify-between">
                           <span className="text-slate-500 font-bold">↑ Entradas AR</span>
                           <span className="font-black text-emerald-700">$ {h.arIn.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between">
                           <span className="text-slate-500 font-bold">↓ Salidas AP</span>
                           <span className="font-black text-red-600">$ {h.apOut.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between border-t border-slate-200 pt-1 mt-1">
                           <span className="font-black text-slate-700 uppercase tracking-wide text-[9px]">Neto</span>
                           <span className={`font-black text-[13px] ${h.net >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                             {h.net >= 0 ? '+' : ''}$ {h.net.toFixed(2)}
                           </span>
                         </div>
                       </div>
                     </div>
                   ))}
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                   <div className="p-6">
                     <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-3">Próximos vencimientos AR (por cobrar)</div>
                     {arByDate.length === 0 ? (
                       <div className="text-[10px] opacity-40 font-bold uppercase">Sin CxC pendientes</div>
                     ) : (
                       <div className="space-y-2">
                         {arByDate.map(e => {
                           const isOverdue = e.dueDate < today;
                           const daysLeft = Math.round((e.dueDate.getTime() - today.getTime()) / 86400000);
                           return (
                             <div key={e.id} className={`flex justify-between items-center p-2 rounded-xl ${isOverdue ? 'bg-red-50' : 'bg-slate-50'}`}>
                               <div>
                                 <div className="text-[10px] font-black text-slate-900 uppercase">{String(e.customerName ?? '').slice(0, 22)}</div>
                                 <div className={`text-[9px] font-bold ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                                   {isOverdue ? `Vencido hace ${Math.abs(daysLeft)}d` : `En ${daysLeft}d — ${e.dueDate.toLocaleDateString('es-VE')}`}
                                 </div>
                               </div>
                               <span className="font-black text-[11px] text-emerald-700">$ {Number(e.balanceUSD ?? 0).toFixed(2)}</span>
                             </div>
                           );
                         })}
                       </div>
                    )}
                   </div>
                   <div className="p-6">
                     <div className="text-[9px] font-black uppercase tracking-widest text-red-600 mb-3">Próximos vencimientos AP (por pagar)</div>
                     {apByDate.length === 0 ? (
                       <div className="text-[10px] opacity-40 font-bold uppercase">Sin CxP pendientes</div>
                     ) : (
                       <div className="space-y-2">
                         {apByDate.map(e => {
                           const isOverdue = e.dueDate < today;
                           const daysLeft = Math.round((e.dueDate.getTime() - today.getTime()) / 86400000);
                           return (
                             <div key={e.id} className={`flex justify-between items-center p-2 rounded-xl ${isOverdue ? 'bg-red-50' : 'bg-slate-50'}`}>
                               <div>
                                 <div className="text-[10px] font-black text-slate-900 uppercase">{String(e.supplier ?? '').slice(0, 22)}</div>
                                 <div className={`text-[9px] font-bold ${isOverdue ? 'text-red-600' : 'text-slate-400'}`}>
                                   {isOverdue ? `Vencido hace ${Math.abs(daysLeft)}d` : `En ${daysLeft}d — ${e.dueDate.toLocaleDateString('es-VE')}`}
                                 </div>
                               </div>
                               <span className="font-black text-[11px] text-red-600">$ {Number(e.balanceUSD ?? 0).toFixed(2)}</span>
                             </div>
                           );
                         })}
                       </div>
                    )}
                   </div>
                 </div>
               </div>
             );
           })()}

           {/* P&L — Estado de Resultados del Mes */}
           {(() => {
             const now = new Date();
             const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
             const monthLabel = now.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }).toUpperCase();

             const ingresosMes = sales
               .filter(s => (s as any).status !== 'VOID' && s.timestamp >= startOfMonth)
               .reduce((acc, s) => acc + s.totalUSD, 0);

             const costosMes = apEntries
               .filter(e => (e as any).status !== 'VOID' && e.timestamp >= startOfMonth)
               .reduce((acc, e) => acc + e.amountUSD, 0);

             const gastosMes = expensesList
               .filter(e => e.status !== 'VOID' && e.timestamp >= startOfMonth)
               .reduce((acc, e) => acc + e.amountUSD, 0);

             const utilidadBruta = ingresosMes - costosMes;
             const utilidadNeta = utilidadBruta - gastosMes;
             const margen = ingresosMes > 0 ? ((utilidadNeta / ingresosMes) * 100) : 0;

             return (
               <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                 <div className="px-8 pt-8 pb-4 border-b border-slate-100 flex justify-between items-center">
                   <div>
                     <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Estado de Resultados</h3>
                     <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{monthLabel}</p>
                   </div>
                   <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${utilidadNeta >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                     {utilidadNeta >= 0 ? '▲ Superávit' : '▼ Déficit'}
                   </span>
                 </div>
                 <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 divide-x divide-slate-100">
                   <div className="p-6">
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Ingresos</div>
                     <div className="mt-2 text-2xl font-black font-headline tracking-tighter text-emerald-700">$ {ingresosMes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="text-[8px] text-slate-400 mt-1">Ventas del mes</div>
                   </div>
                   <div className="p-6">
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Costo Mercancía</div>
                     <div className="mt-2 text-2xl font-black font-headline tracking-tighter text-red-500">$ {costosMes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="text-[8px] text-slate-400 mt-1">Compras AP del mes</div>
                   </div>
                   <div className="p-6">
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Utilidad Bruta</div>
                     <div className={`mt-2 text-2xl font-black font-headline tracking-tighter ${utilidadBruta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>$ {utilidadBruta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="text-[8px] text-slate-400 mt-1">Ingresos − Costos</div>
                   </div>
                   <div className="p-6">
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Gastos Operativos</div>
                     <div className="mt-2 text-2xl font-black font-headline tracking-tighter text-orange-500">$ {gastosMes.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="text-[8px] text-slate-400 mt-1">Gastos registrados</div>
                   </div>
                   <div className="p-6 bg-slate-50/50">
                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Utilidad Neta</div>
                     <div className={`mt-2 text-2xl font-black font-headline tracking-tighter ${utilidadNeta >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>$ {utilidadNeta.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                     <div className="text-[8px] mt-1 font-black" style={{ color: margen >= 0 ? '#059669' : '#dc2626' }}>
                       Margen: {margen.toFixed(1)}%
                     </div>
                   </div>
                 </div>
               </div>
             );
           })()}
        </div>
      )}

      {activeSubTab === 'invoices' && (
        <div className="space-y-6 animate-in zoom-in-95 duration-500">
          <div className="bg-white rounded-[2rem] border border-slate-200 p-5 md:p-7 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              <div>
                <h3 className="text-lg md:text-xl font-black tracking-tight text-slate-900">Historial consolidado de facturas</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                  Ventas y compras con el mismo nivel de detalle; elija qué incluir en el reporte y acote por fecha y contraparte
                </p>
              </div>
              <div className="relative w-full md:w-96 shrink-0">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={invoiceHistorySearch}
                  onChange={(e) => setInvoiceHistorySearch(e.target.value)}
                  placeholder="Búsqueda rápida: Nº factura, texto libre..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 py-2 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500/30"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 md:p-5 space-y-4">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Filtros del reporte</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Incluir en el reporte</span>
                  <select
                    value={invoiceHistoryKind}
                    onChange={(e) => setInvoiceHistoryKind(e.target.value as 'ALL' | 'SALES' | 'PURCHASES')}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30"
                  >
                    <option value="ALL">Facturas ventas + compras</option>
                    <option value="SALES">Solo ventas</option>
                    <option value="PURCHASES">Solo compras</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Fecha desde</span>
                  <input
                    type="date"
                    value={invoiceHistoryDateFrom}
                    onChange={(e) => setInvoiceHistoryDateFrom(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Fecha hasta</span>
                  <input
                    type="date"
                    value={invoiceHistoryDateTo}
                    onChange={(e) => setInvoiceHistoryDateTo(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
                <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                  <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">Cliente / Proveedor</span>
                  <input
                    type="text"
                    value={invoiceHistoryParty}
                    onChange={(e) => setInvoiceHistoryParty(e.target.value)}
                    placeholder="Nombre o RIF..."
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500/30 placeholder:text-slate-400"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-slate-500 font-bold leading-snug max-w-xl">
                  Las fechas aplican por fecha de venta (ticket) y por fecha de factura / registro de compra (compras sin fecha documento quedan fuera si filtra solo por período).
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={invoiceHistoryExportRows.length === 0}
                    onClick={() => reportService.exportInvoiceHistoryToPDF(invoiceHistoryExportRows, {
                      title: 'HISTORIAL DE FACTURAS',
                      filterLabel: `Tipo: ${invoiceHistoryKind} | Desde: ${invoiceHistoryDateFrom || 'Inicio'} | Hasta: ${invoiceHistoryDateTo || 'Hoy'} | Tercero: ${invoiceHistoryParty || 'Todos'} | Busqueda: ${invoiceHistorySearch || 'Todos'}`
                    })}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" /> PDF
                  </button>
                  <button
                    type="button"
                    disabled={invoiceHistoryExportRows.length === 0}
                    onClick={() => {
                      const headers = ['tipo', 'fecha', 'factura', 'tercero', 'documento', 'detalle_productos', 'totalUSD', 'estado'];
                      const preambleRows = [
                        ['REPORTE', 'Historial de facturas'],
                        ['TIPO', invoiceHistoryKind],
                        ['FECHA_DESDE', invoiceHistoryDateFrom || '-'],
                        ['FECHA_HASTA', invoiceHistoryDateTo || '-'],
                        ['TERCERO', invoiceHistoryParty || '-'],
                        ['BUSQUEDA', invoiceHistorySearch || '-'],
                        ['GENERADO', new Date().toLocaleString('es-VE')],
                        Array.from({ length: headers.length }, () => '')
                      ];
                      const csv = buildExcelFriendlyCsv(headers, invoiceHistoryExportRows, { preambleRows });
                      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `historial_facturas_${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Download className="w-3 h-3" /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInvoiceHistoryKind('ALL');
                      setInvoiceHistoryDateFrom('');
                      setInvoiceHistoryDateTo('');
                      setInvoiceHistoryParty('');
                      setInvoiceHistorySearch('');
                    }}
                    className="shrink-0 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black uppercase tracking-wider text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Limpiar filtros
                  </button>
                </div>
              </div>
            </div>
          </div>

          {invoiceHistoryKind !== 'PURCHASES' && (
          <div className="bg-white rounded-[2rem] border border-slate-200 p-5 md:p-7 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[12px] md:text-sm font-black uppercase tracking-widest text-emerald-700">Facturas de venta</h4>
              <span className="text-[10px] font-black text-slate-500">{filteredSalesInvoices.length} registro(s)</span>
            </div>
            <div className="overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[980px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Factura</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Cliente</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Fecha</th>
                    <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">Total USD</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Cobro</th>
                    <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSalesInvoices.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-[10px] font-bold text-slate-400">Sin facturas de venta para el filtro actual.</td></tr>
                  )}
                  {filteredSalesInvoices.map((sale: any) => {
                    const saleId = String(sale?.id ?? sale?.correlativo ?? Math.random());
                    const expanded = expandedSaleInvoiceId === saleId;
                    const dateLabel = sale?.timestamp instanceof Date ? sale.timestamp.toLocaleDateString('es-VE') : '—';
                    const payments = Array.isArray(sale?.payments) ? sale.payments : [];
                    const paymentLabel = payments.length > 0
                      ? Array.from(new Set(payments.map((p: any) => String(p?.method ?? 'MIXTO').toUpperCase()))).join(', ')
                      : String(sale?.paymentMethod ?? 'MIXTO').toUpperCase();
                    return (
                      <React.Fragment key={saleId}>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-2 text-[10px] font-black text-slate-800">{String(sale?.correlativo ?? '-')}</td>
                          <td className="px-3 py-2 text-[10px] font-bold text-slate-700">{String(sale?.client?.name ?? '-')}</td>
                          <td className="px-3 py-2 text-[10px] font-mono text-slate-500">{dateLabel}</td>
                          <td className="px-3 py-2 text-right text-[10px] font-black text-slate-900">${Number(sale?.totalUSD ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-[10px] font-bold text-slate-700">{paymentLabel || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setExpandedSaleInvoiceId(expanded ? null : saleId)} className="text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-900">
                              {expanded ? 'Ocultar' : 'Ver'}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={6} className="px-4 py-3">
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Productos facturados</div>
                              <div className="space-y-1">
                                {(Array.isArray(sale?.items) ? sale.items : []).map((it: any, idx: number) => (
                                  <div key={`${saleId}-line-${idx}`} className="flex items-center justify-between text-[10px]">
                                    <span className="font-bold text-slate-700">{String(it?.description ?? it?.code ?? 'Producto')}</span>
                                    <span className="font-mono text-slate-500">{Number(it?.qty ?? 0).toFixed(2)} {String(it?.unit ?? '')} × ${Number(it?.priceUSD ?? 0).toFixed(2)}</span>
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {invoiceHistoryKind !== 'SALES' && (
          <div className="bg-white rounded-[2rem] border border-slate-200 p-5 md:p-7 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[12px] md:text-sm font-black uppercase tracking-widest text-indigo-700">Facturas de compra</h4>
              <span className="text-[10px] font-black text-slate-500">
                {invoiceHistoryLoading ? 'Cargando...' : `${filteredPurchaseInvoices.length} registro(s)`}
              </span>
            </div>
            <div className="overflow-auto rounded-2xl border border-slate-100">
              <table className="w-full min-w-[1100px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Factura</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Proveedor</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Fecha</th>
                    <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">Total USD</th>
                    <th className="px-3 py-2 text-right text-[9px] font-black uppercase tracking-wider text-slate-500">Pagado USD</th>
                    <th className="px-3 py-2 text-left text-[9px] font-black uppercase tracking-wider text-slate-500">Tipo pago</th>
                    <th className="px-3 py-2 text-center text-[9px] font-black uppercase tracking-wider text-slate-500">Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {!invoiceHistoryLoading && filteredPurchaseInvoices.length === 0 && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-[10px] font-bold text-slate-400">Sin facturas de compra para el filtro actual.</td></tr>
                  )}
                  {invoiceHistoryLoading && (
                    <tr><td colSpan={7} className="px-3 py-6 text-center text-[10px] font-bold text-slate-400">Cargando historial de compras...</td></tr>
                  )}
                  {filteredPurchaseInvoices.map((entry) => {
                    const expanded = expandedPurchaseInvoiceId === entry.id;
                    const invoiceDateLabel = entry.invoiceDate ? new Date(entry.invoiceDate).toLocaleDateString('es-VE') : '—';
                    const paidUSD = Number(entry.paidUSD ?? 0) || 0;
                    return (
                      <React.Fragment key={entry.id}>
                        <tr className="border-t border-slate-100">
                          <td className="px-3 py-2 text-[10px] font-black text-slate-800">{entry.invoiceNumber || entry.invoiceGroupId}</td>
                          <td className="px-3 py-2 text-[10px] font-bold text-slate-700">{entry.supplier || '-'}</td>
                          <td className="px-3 py-2 text-[10px] font-mono text-slate-500">{invoiceDateLabel}</td>
                          <td className="px-3 py-2 text-right text-[10px] font-black text-slate-900">${Number(entry.totalInvoiceUSD ?? 0).toFixed(2)}</td>
                          <td className="px-3 py-2 text-right text-[10px] font-black text-emerald-700">${paidUSD.toFixed(2)}</td>
                          <td className="px-3 py-2 text-[10px] font-bold text-slate-700">{entry.paymentType}</td>
                          <td className="px-3 py-2 text-center">
                            <button onClick={() => setExpandedPurchaseInvoiceId(expanded ? null : entry.id)} className="text-[9px] font-black uppercase tracking-widest text-indigo-700 hover:text-indigo-900">
                              {expanded ? 'Ocultar' : 'Ver'}
                            </button>
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={7} className="px-4 py-3 space-y-3">
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-2">Productos comprados</div>
                                <div className="space-y-1">
                                  {entry.lines.map((line) => (
                                    <div key={`${entry.id}-${line.id}-${line.lineNumber}`} className="flex items-center justify-between text-[10px]">
                                      <span className="font-bold text-slate-700">{line.productDescription || line.sku}</span>
                                      <span className="font-mono text-slate-500">{Number(line.qty ?? 0).toFixed(2)} {line.unit || ''} × ${Number(line.costUSD ?? 0).toFixed(2)} = ${Number(line.totalLineUSD ?? 0).toFixed(2)}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Saldo CxP</div>
                                  <div className="mt-1 text-[12px] font-black text-slate-900">
                                    {entry.apBalanceUSD != null ? `$${Number(entry.apBalanceUSD).toFixed(2)}` : '—'}
                                  </div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Métodos de pago</div>
                                  <div className="mt-1 text-[11px] font-black text-slate-900">{entry.paymentMethods.length > 0 ? entry.paymentMethods.join(', ') : '—'}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Soportes</div>
                                  <div className="mt-1 text-[11px] font-black text-slate-900">{entry.supports.length}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          )}
        </div>
      )}

      {activeSubTab === 'credit' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Clientes con crédito</div>
              <div className="mt-3 text-3xl font-black font-headline tracking-tighter text-slate-900">{creditStats.authorizedCount}</div>
              <div className="mt-2 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Autorizados</div>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Límite asignado</div>
              <div className="mt-3 text-3xl font-black font-headline tracking-tighter text-slate-900">$ {creditStats.assignedLimitUSD.toLocaleString()}</div>
              <div className="mt-2 text-[10px] font-bold text-sky-600 uppercase tracking-widest">Capacidad total</div>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Clientes bloqueados</div>
              <div className="mt-3 text-3xl font-black font-headline tracking-tighter text-slate-900">{creditStats.blockedCount}</div>
              <div className="mt-2 text-[10px] font-bold text-red-600 uppercase tracking-widest">Con bloqueo manual</div>
            </div>
            <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
              <div className="text-[8px] font-black uppercase tracking-[0.25em] text-slate-400">Con facturas vencidas</div>
              <div className="mt-3 text-3xl font-black font-headline tracking-tighter text-slate-900">{creditStats.overdueCount}</div>
              <div className="mt-2 text-[10px] font-bold text-amber-600 uppercase tracking-widest">Riesgo alto</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-5 bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm flex flex-col">
              <div className="p-6 border-b bg-slate-50/40">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-slate-900 text-white">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-headline font-black text-lg tracking-tight text-slate-900">Clientes y Política Crediticia</h4>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">Autorice crédito, bloquee o ajuste límites por cliente</p>
                  </div>
                </div>
                <div className="mt-5 relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    placeholder="Buscar por RIF, cédula o razón social"
                    className="w-full rounded-2xl bg-slate-100 border border-slate-200 pl-11 pr-4 py-3 text-[11px] font-black outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <Filter className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                </div>
              </div>
              <div className="max-h-[70vh] overflow-y-auto p-3 space-y-2">
                {filteredCreditClients.length === 0 ? (
                  <div className="p-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">Sin clientes para el filtro actual</div>
                ) : (
                  filteredCreditClients.map((client) => {
                    const summary = getClientCreditSummary(client);
                    const profile = getClientCommercialProfile(client);
                    return (
                      <button
                        key={client.id}
                        onClick={() => setSelectedCreditClientId(client.id)}
                        className={`w-full text-left rounded-2xl border p-4 transition-all ${selectedCreditClientId === client.id ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-black uppercase text-slate-900 truncate">{client.name}</div>
                            <div className="text-[9px] text-slate-400 font-mono mt-1">{client.id}</div>
                          </div>
                          <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${client.hasCredit ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>
                            {client.hasCredit ? 'Crédito' : 'Contado'}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase ${profile.quality.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : profile.quality.tone === 'sky' ? 'bg-sky-100 text-sky-700' : profile.quality.tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                            {profile.quality.label}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
                          <div>
                            <div className="font-black uppercase tracking-widest text-slate-400">Deuda</div>
                            <div className="font-black text-slate-900">$ {summary.debtUSD.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="font-black uppercase tracking-widest text-slate-400">Pendientes</div>
                            <div className={`font-black ${summary.overdueCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>{summary.openCount} / {summary.overdueCount} venc.</div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="xl:col-span-7 bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-6 border-b bg-slate-50/40 flex justify-between items-start gap-4 flex-wrap">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Autorización de crédito</div>
                  <h4 className="font-headline font-black text-xl tracking-tight text-slate-900 mt-1">
                    {selectedCreditClient ? selectedCreditClient.name : 'Seleccione un cliente'}
                  </h4>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {selectedCreditClient ? `${selectedCreditClient.id} • control de riesgo financiero` : 'sin selección activa'}
                  </div>
                </div>
                {selectedCreditClient && (
                  <button
                    onClick={() => setCreditForm({
                      hasCredit: selectedCreditClient.hasCredit === true,
                      creditLimit: String(Number(selectedCreditClient.creditLimit ?? 0) || 0),
                      creditDays: String(Number(selectedCreditClient.creditDays ?? 0) || 0),
                      isSolvent: selectedCreditClient.isSolvent !== false,
                      creditAuthorizedBy: String(selectedCreditClient.creditAuthorizedBy || currentUser?.name || activeAuthorizers[0]?.name || '').toUpperCase()
                    })}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Restablecer
                  </button>
                )}
              </div>

              {!selectedCreditClient || !selectedCreditSummary || !selectedCommercialProfile ? (
                <div className="p-12 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">No hay cliente seleccionado</div>
              ) : (
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Debe actualmente</div>
                      <div className="mt-2 text-[20px] font-black font-headline text-slate-900">$ {selectedCreditSummary.debtUSD.toFixed(2)}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Facturas pendientes</div>
                      <div className="mt-2 text-[20px] font-black font-headline text-slate-900">{selectedCreditSummary.openCount}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Vencidas</div>
                      <div className={`mt-2 text-[20px] font-black font-headline ${selectedCreditSummary.overdueCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{selectedCreditSummary.overdueCount}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Disponible</div>
                      <div className={`mt-2 text-[20px] font-black font-headline ${selectedCreditSummary.exceedsLimit ? 'text-red-600' : 'text-slate-900'}`}>
                        {selectedCreditSummary.creditLimit > 0 ? `$ ${selectedCreditSummary.availableCreditUSD.toFixed(2)}` : 'Sin límite'}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Evaluación comercial del cliente</div>
                        <div className="mt-1 text-[13px] font-black text-slate-900">{selectedCommercialProfile.quality.label}</div>
                      </div>
                      <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase ${selectedCommercialProfile.quality.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700' : selectedCommercialProfile.quality.tone === 'sky' ? 'bg-sky-100 text-sky-700' : selectedCommercialProfile.quality.tone === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                        Score {selectedCommercialProfile.score}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[10px]">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Compras</div>
                        <div className="mt-1 font-black text-slate-900">{selectedCommercialProfile.totalOrders}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Monto histórico</div>
                        <div className="mt-1 font-black text-slate-900">$ {selectedCommercialProfile.totalPurchasedUSD.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Ticket promedio</div>
                        <div className="mt-1 font-black text-slate-900">$ {selectedCommercialProfile.averageTicketUSD.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Última compra</div>
                        <div className="mt-1 font-black text-slate-900">{selectedCommercialProfile.daysSinceLastPurchase === null ? 'Sin historial' : `${selectedCommercialProfile.daysSinceLastPurchase} días`}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Compras últimos 30 días</div>
                        <div className="mt-1 font-black text-slate-900">{selectedCommercialProfile.recent30Count}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Compras últimos 90 días</div>
                        <div className="mt-1 font-black text-slate-900">{selectedCommercialProfile.recent90Count}</div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Frecuencia mensual</div>
                        <div className="mt-1 font-black text-slate-900">{selectedCommercialProfile.monthlyFrequency.toFixed(1)} compras/mes</div>
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[10px]">
                      <div className="font-black uppercase tracking-widest text-slate-400">Recomendación comercial</div>
                      <div className="mt-2 font-bold text-slate-700">{selectedCommercialProfile.quality.recommendation}</div>
                      <div className="mt-2 text-slate-500 font-bold">
                        {selectedCommercialProfile.firstPurchase && selectedCommercialProfile.lastPurchase
                          ? `Relación comercial desde ${selectedCommercialProfile.firstPurchase.toLocaleDateString()} hasta ${selectedCommercialProfile.lastPurchase.toLocaleDateString()} · ${selectedCommercialProfile.visitDays} visitas registradas.`
                          : 'Aún no hay historial suficiente de compras registrado para este cliente.'}
                      </div>
                    </div>
                  </div>

                  {creditFormError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-red-700">
                      {creditFormError}
                    </div>
                  )}

                  {creditFormSuccess && (
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-emerald-700 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> {creditFormSuccess}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={() => setCreditForm((prev) => ({ ...prev, hasCredit: !prev.hasCredit }))}
                      className={`rounded-2xl border p-4 text-left transition-all ${creditForm.hasCredit ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-widest">Beneficio de crédito</div>
                      <div className="mt-1 text-[13px] font-black">{creditForm.hasCredit ? 'Autorizado para compras a crédito' : 'No autorizado'}</div>
                    </button>
                    <button
                      onClick={() => setCreditForm((prev) => ({ ...prev, isSolvent: !prev.isSolvent }))}
                      className={`rounded-2xl border p-4 text-left transition-all ${creditForm.isSolvent ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-red-300 bg-red-50 text-red-900'}`}
                    >
                      <div className="text-[9px] font-black uppercase tracking-widest">Estado financiero</div>
                      <div className="mt-1 text-[13px] font-black">{creditForm.isSolvent ? 'Operativo / solvente' : 'Bloqueado para crédito'}</div>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Quién autoriza el crédito</label>
                      <select
                        value={creditForm.creditAuthorizedBy}
                        onChange={(e) => setCreditForm((prev) => ({ ...prev, creditAuthorizedBy: e.target.value }))}
                        className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none ring-1 ring-slate-100 focus:ring-emerald-500/20"
                      >
                        <option value="">Seleccione autorizante</option>
                        {activeAuthorizers.map((user) => (
                          <option key={user.id} value={String(user.name ?? '').toUpperCase()}>
                            {String(user.name ?? '').toUpperCase()} · {user.role}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Autorización vigente</div>
                      <div className="mt-2 text-[13px] font-black text-slate-900">{selectedCreditClient.creditAuthorizedBy || 'Sin autorizante registrado'}</div>
                      <div className="mt-1 text-[10px] font-bold text-slate-500">
                        {selectedCreditClient.creditAuthorizedAt ? new Date(selectedCreditClient.creditAuthorizedAt).toLocaleString() : 'Sin fecha de autorización'}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Límite de crédito USD</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={creditForm.creditLimit}
                        onChange={(e) => setCreditForm((prev) => ({ ...prev, creditLimit: e.target.value }))}
                        className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[13px] font-black outline-none ring-1 ring-slate-100 focus:ring-emerald-500/20"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Plazo en días</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={creditForm.creditDays}
                        onChange={(e) => setCreditForm((prev) => ({ ...prev, creditDays: e.target.value }))}
                        className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[13px] font-black outline-none ring-1 ring-slate-100 focus:ring-emerald-500/20"
                      />
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Lectura de riesgo</div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[10px]">
                      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Límite configurado</div>
                        <div className="mt-1 font-black text-slate-900">$ {(Number(creditForm.creditLimit ?? 0) || 0).toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Saldo actual</div>
                        <div className="mt-1 font-black text-slate-900">$ {selectedCreditSummary.debtUSD.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                        <div className="font-black uppercase tracking-widest text-slate-400">Disponible proyectado</div>
                        <div className={`mt-1 font-black ${(Number(creditForm.creditLimit ?? 0) || 0) > 0 && selectedCreditSummary.debtUSD > (Number(creditForm.creditLimit ?? 0) || 0) ? 'text-red-600' : 'text-emerald-600'}`}>
                          {(Number(creditForm.creditLimit ?? 0) || 0) > 0 ? `$ ${Math.max(0, (Number(creditForm.creditLimit ?? 0) || 0) - selectedCreditSummary.debtUSD).toFixed(2)}` : 'Sin límite'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveCreditProfile}
                      disabled={creditSaving}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/20 disabled:opacity-60"
                    >
                      {creditSaving ? 'Guardando...' : 'Guardar Política de Crédito'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'ar' && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
           <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-100 bg-[#f8fafc]/50">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <h3 className="font-headline font-black text-lg uppercase tracking-tight">Cuentas por cobrar (clientes especiales)</h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full uppercase">Por Cobrar: $ {totalAR.toFixed(2)}</span>
                    {totalAdvances > 0.005 && (
                      <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-4 py-1.5 rounded-full uppercase">Anticipos: - $ {totalAdvances.toFixed(2)}</span>
                    )}
                    <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-4 py-1.5 rounded-full uppercase">Neto: $ {Math.max(0, totalAR - totalAdvances).toFixed(2)}</span>
                    <button onClick={() => reportService.exportARGlobalToPDF(filteredAR, { filterLabel: arStatementFilterNote || 'Sin filtros adicionales' })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-700 transition-all">
                      <Download className="w-3 h-3" /> PDF
                    </button>
                    <button onClick={exportARFilteredExcel}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-800 transition-all">
                      <Download className="w-3 h-3" /> Excel
                    </button>
                    <button
                      onClick={() => reportService.exportCompanyLoansToPDF(companyLoans, filteredAR.filter((e) => isCompanyLoanAREntry(e)))}
                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-700 text-white rounded-xl text-[9px] font-black uppercase hover:bg-blue-800 transition-all"
                    >
                      <Download className="w-3 h-3" /> PDF Préstamos
                    </button>
                    {canEditFinance && (
                      <button
                        onClick={() => { setLoanError(''); setShowCreateLoanModal(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-700 transition-all"
                      >
                        <Plus className="w-3 h-3" /> Nuevo préstamo
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-emerald-700">Préstamos activos</div>
                    <div className="text-[14px] font-black text-emerald-800">
                      {companyLoans.filter((l) => l.status !== 'PAID' && l.status !== 'VOID').length}
                    </div>
                  </div>
                  <div className="rounded-xl border border-blue-100 bg-blue-50/50 px-3 py-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-blue-700">Saldo préstamos</div>
                    <div className="text-[14px] font-black text-blue-800">
                      $ {companyLoans.filter((l) => l.status !== 'PAID' && l.status !== 'VOID').reduce((s, l) => s + Number(l.balanceUSD ?? 0), 0).toFixed(2)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Emitidos (histórico)</div>
                    <div className="text-[14px] font-black text-slate-800">
                      {companyLoans.length}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <input type="date" value={arDateRange.start} onChange={e => { setArDateRange(p => ({...p, start: e.target.value})); setArPage(0); }}
                      className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32" />
                    <span className="text-slate-300 text-[10px]">—</span>
                    <input type="date" value={arDateRange.end} onChange={e => { setArDateRange(p => ({...p, end: e.target.value})); setArPage(0); }}
                      className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32" />
                  </div>
                  <div className="flex bg-slate-100 rounded-xl overflow-hidden border border-slate-200 text-[9px] font-black uppercase">
                    {(['ALL','OPEN','PENDING','OVERDUE','PAID','LOANS'] as const).map(s => (
                      <button key={s} onClick={() => { setArStatusFilter(s); setArPage(0); }}
                        className={`px-3 py-1.5 transition-all ${arStatusFilter === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-200'}`}>
                        {s === 'ALL' ? 'Todos' : s === 'OPEN' ? 'Pend.+Venc.' : s === 'PENDING' ? 'Pendiente' : s === 'OVERDUE' ? 'Vencido' : s === 'PAID' ? 'Pagado' : 'Préstamos'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 min-w-[260px]">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={arSearch}
                      onChange={(e) => { setArSearch(e.target.value); setArPage(0); }}
                      placeholder="Buscar cliente, cédula, factura..."
                      className="w-full bg-transparent border-0 text-[10px] font-black text-slate-700 placeholder:text-slate-300 focus:ring-0"
                    />
                  </div>
                  <div className="flex bg-slate-100 rounded-xl overflow-hidden border border-slate-200 text-[9px] font-black uppercase">
                    <button
                      onClick={() => setArViewMode('GROUPED')}
                      className={`px-3 py-1.5 transition-all ${arViewMode === 'GROUPED' ? 'bg-emerald-700 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      Por cliente
                    </button>
                    <button
                      onClick={() => setArViewMode('ROWS')}
                      className={`px-3 py-1.5 transition-all ${arViewMode === 'ROWS' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-200'}`}
                    >
                      Por factura
                    </button>
                  </div>
                </div>
              </div>
              {arViewMode === 'GROUPED' ? (
                <div className="p-6 space-y-4">
                  {groupedAR.length === 0 && allClientAdvances.length === 0 ? (
                    <div className="p-16 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">No hay créditos activos</div>
                  ) : (
                    groupedAR.map((group) => {
                      const isExpanded = expandedARCustomerKey === group.key;
                      const customerIdKey = String(group.customerId ?? '').trim().toUpperCase();
                      const customerAdvance = Number(advanceBalanceByCustomer[customerIdKey] ?? 0) || 0;
                      const customerAdvances = (openAdvancesByCustomer[customerIdKey] ?? [])
                        .slice()
                        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
                      return (
                        <div key={group.key} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                          <button
                            onClick={() => setExpandedARCustomerKey((prev) => (prev === group.key ? null : group.key))}
                            className="w-full px-5 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-all text-left"
                          >
                            <div>
                              <div className="text-[13px] font-black text-slate-900 uppercase">{group.customerName}</div>
                              <div className="text-[9px] font-bold text-slate-400 font-mono">{group.customerId} · {group.entries.length} documento(s)</div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end">
                              {group.overdueCount > 0 && <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase bg-red-100 text-red-700">{group.overdueCount} vencida(s)</span>}
                              {group.pendingCount > 0 && <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase bg-blue-100 text-blue-700">{group.pendingCount} pendiente(s)</span>}
                              {customerAdvance > 0.005 && <span className="px-2 py-1 rounded-full text-[8px] font-black uppercase bg-amber-100 text-amber-700">Anticipo: $ {customerAdvance.toFixed(2)}</span>}
                              <span className="text-[13px] font-black text-slate-900">$ {group.totalBalanceUSD.toFixed(2)}</span>
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                          </button>
                          {isExpanded && (
                            <div className="border-t border-slate-100">
                              {customerAdvances.length > 0 && (
                                <div className="px-5 py-4 border-b border-amber-100 bg-amber-50/50">
                                  <div className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-2">
                                    Anticipos del cliente por factura origen
                                  </div>
                                  <div className="space-y-2">
                                    {customerAdvances.map((adv) => (
                                      <div key={adv.id} className="rounded-xl border border-amber-100 bg-white px-3 py-2 flex items-center justify-between gap-3">
                                        <div>
                                          <div className="text-[10px] font-black text-slate-900 uppercase">
                                            Factura origen: {adv.originCorrelativo || 'S/ORIGEN'}
                                          </div>
                                          <div className="text-[9px] font-bold text-slate-500">
                                            Creado: {adv.createdAt ? new Date(adv.createdAt).toLocaleDateString() : '-'} · {adv.status === 'AVAILABLE' ? 'Disponible' : adv.status === 'PARTIAL' ? 'Parcial' : 'Aplicado'}
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-[9px] font-bold text-slate-500">Monto: $ {Number(adv.amountUSD ?? 0).toFixed(2)}</div>
                                          <div className="text-[11px] font-black text-emerald-700">Saldo: $ {Number(adv.balanceUSD ?? 0).toFixed(2)}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {group.entries.map((ar) => {
                                const isOverdue = ar.status !== 'PAID' && new Date() > ar.dueDate;
                                const isLoan = isCompanyLoanAREntry(ar);
                                return (
                                  <div key={ar.id} className={`px-5 py-4 border-b border-slate-100 last:border-b-0 ${isOverdue ? 'bg-red-50/40' : 'bg-white'}`}>
                                    <div className="flex items-start justify-between gap-4">
                                      <div>
                                        <div className="text-[11px] font-black text-slate-900 uppercase">
                                          {isLoan ? 'Préstamo' : 'Factura'} {ar.saleCorrelativo}
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 font-mono">{ar.description}</div>
                                        <div className={`text-[9px] font-black mt-1 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>Vence: {ar.dueDate.toLocaleDateString()}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-[10px] font-bold text-slate-500">Original: $ {ar.amountUSD.toFixed(2)}</div>
                                        <div className="text-[10px] font-bold text-red-500">Recargo: $ {(Number(ar.lateFeeUSD ?? 0) || 0).toFixed(2)}</div>
                                        <div className="text-[13px] font-black text-slate-900">Saldo: $ {ar.balanceUSD.toFixed(2)}</div>
                                      </div>
                                    </div>
                                    <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                                      <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${ar.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : (isOverdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700')}`}>
                                        {ar.status === 'PAID' ? 'Liquidado' : (isOverdue ? 'Vencido' : 'Pendiente')}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        {ar.status !== 'PAID' && (
                                          <>
                                            <button onClick={() => handleARPayment(ar)} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 transition-all">Recibir</button>
                                            {onStartARCollection && (
                                              <button onClick={() => onStartARCollection({
                                                active: true, arEntryId: ar.id, customerId: ar.customerId, customerName: ar.customerName,
                                                balanceUSD: ar.balanceUSD, balanceVES: Math.round(ar.balanceUSD * exchangeRate * 100) / 100,
                                                description: ar.description, saleCorrelativo: ar.saleCorrelativo
                                              })} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700 transition-all">Cobrar en Caja</button>
                                            )}
                                          </>
                                        )}
                                        <button onClick={() => handleViewARPayments(ar)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-emerald-600 hover:text-white transition-all" title="Historial de Pagos"><History className="w-4 h-4" /></button>
                                        <button onClick={() => exportARStatementForCustomer(ar.customerId)} className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-900 hover:text-white transition-all" title="Estado de Cuenta"><FileText className="w-4 h-4" /></button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ) : (
              <>
              
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-slate-50/50 text-[8px] font-black uppercase text-slate-400 border-b border-slate-100">
                          <th className="px-8 py-5">Cliente / Factura</th>
                          <th className="px-8 py-5">F. Vencimiento</th>
                          <th className="px-8 py-5 text-right">Monto Original</th>
                          <th className="px-8 py-5 text-right">Recargo 1%</th>
                          <th className="px-8 py-5 text-right">Saldo Pendiente</th>
                          <th className="px-8 py-5 text-center">Estado</th>
                          <th className="px-8 py-5 text-center">Acciones</th>
                       </tr>
                    </thead>
                    <tbody className="text-[11px]">
                       {filteredAR.length === 0 && allClientAdvances.length === 0 ? (
                         <tr><td colSpan={7} className="p-20 text-center opacity-30 font-black uppercase tracking-widest">No hay créditos activos</td></tr>
                       ) : (
                         <>
                         {allClientAdvances.map((adv) => (
                           <tr key={`adv-${adv.id}`} className="border-b border-amber-100 bg-amber-50/60 hover:bg-amber-50 transition-colors group">
                             <td className="px-8 py-4">
                               <div className="flex items-center gap-2">
                                 <div className="font-black text-amber-900 uppercase">{adv.customerName}</div>
                                 <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase shrink-0 ${
                                   adv.currency === 'VES'
                                     ? 'bg-blue-100 text-blue-700'
                                     : 'bg-emerald-100 text-emerald-700'
                                 }`}>
                                   {adv.currency === 'VES' ? 'Bs → T.I.' : 'USD 1:1'}
                                 </span>
                               </div>
                               <div className="text-[8px] text-amber-600 font-mono">Anticipo · Origen: {adv.originCorrelativo}</div>
                               {adv.currency === 'VES' && adv.originalAmountVES && (
                                 <div className="text-[8px] text-blue-500 font-bold mt-0.5">Bs. {adv.originalAmountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} @ {adv.rateAtCreation?.toFixed(2) ?? '—'}</div>
                               )}
                               {adv.note && <div className="text-[8px] text-amber-500 italic mt-0.5 max-w-[200px] truncate">{adv.note}</div>}
                             </td>
                             <td className="px-8 py-4">
                               <div className="text-[9px] font-bold text-amber-500">{new Date(adv.createdAt).toLocaleDateString()}</div>
                               <div className="text-[7px] text-amber-400">Creado</div>
                             </td>
                             <td className="px-8 py-4 text-right">
                               <span className="font-bold text-amber-700">$ {adv.amountUSD.toFixed(2)}</span>
                               {adv.currency === 'VES' && adv.originalAmountVES && (
                                 <div className="text-[7px] text-blue-500">Bs. {adv.originalAmountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                               )}
                             </td>
                             <td className="px-8 py-4 text-right">
                               <span className="text-amber-300 font-bold text-[10px]">—</span>
                             </td>
                             <td className="px-8 py-4 text-right">
                               <span className="font-black text-emerald-700 text-[13px]">+ $ {adv.balanceUSD.toFixed(2)}</span>
                               <div className="text-[7px] text-emerald-500 font-bold">Saldo a favor</div>
                             </td>
                             <td className="px-8 py-4 text-center">
                               <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase ${
                                 adv.status === 'AVAILABLE' ? 'bg-amber-100 text-amber-700' :
                                 adv.status === 'PARTIAL' ? 'bg-blue-100 text-blue-700' :
                                 'bg-slate-100 text-slate-500'
                               }`}>
                                 {adv.status === 'AVAILABLE' ? 'Disponible' : adv.status === 'PARTIAL' ? 'Parcial' : 'Aplicado'}
                               </span>
                             </td>
                             <td className="px-8 py-4 text-center">
                               <span className="text-[9px] font-black text-amber-600 uppercase tracking-wide">Aplicar en facturación</span>
                             </td>
                           </tr>
                         ))}
                         {filteredAR.slice(arPage * FIN_PAGE_SIZE, (arPage + 1) * FIN_PAGE_SIZE).map((ar) => {
                           const isOverdue = ar.status !== 'PAID' && new Date() > ar.dueDate;
                          const isLoan = isCompanyLoanAREntry(ar);
                           return (
                           <tr key={ar.id} className={`border-b transition-colors group ${isOverdue ? 'bg-red-50/60 border-red-100 hover:bg-red-50' : 'border-slate-50 hover:bg-slate-50'}`}>
                              <td className="px-8 py-5">
                                 <div className="font-black text-slate-900 uppercase">{ar.customerName}</div>
                                 <div className="text-[8px] text-slate-400 font-mono">{isLoan ? 'Préstamo' : 'Fact'}: {ar.saleCorrelativo} | ID: {ar.customerId}</div>
                              </td>
                              <td className="px-8 py-5">
                                 <div className={`font-bold ${new Date() > ar.dueDate && ar.status !== 'PAID' ? 'text-red-500' : 'text-slate-500'}`}>
                                    {ar.dueDate.toLocaleDateString()}
                                 </div>
                              </td>
                              <td className="px-8 py-5 text-right font-bold text-slate-400">$ {ar.amountUSD.toFixed(2)}</td>
                              <td className="px-8 py-5 text-right">
                                {ar.lateFeeUSD > 0 ? (
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className="font-black text-red-600 text-[12px]">+ $ {ar.lateFeeUSD.toFixed(2)}</span>
                                    <span className="text-[7px] font-black text-red-400 uppercase tracking-widest">
                                      Aplicado {ar.penaltyAppliedAt ? new Date(ar.penaltyAppliedAt).toLocaleDateString() : ''}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 font-bold text-[10px]">—</span>
                                )}
                              </td>
                              <td className="px-8 py-5 text-right font-black text-slate-900 text-[13px]">
                                <div className="flex flex-col items-end gap-0.5">
                                  <span>$ {ar.balanceUSD.toFixed(2)}</span>
                                  {ar.lateFeeUSD > 0 && (
                                    <span className="text-[7px] font-black text-red-400 uppercase tracking-widest">Incluye recargo</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-8 py-5 text-center">
                                 <span className={`px-4 py-1 rounded-full text-[8px] font-black uppercase ${ar.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : (new Date() > ar.dueDate ? 'bg-red-100 text-red-700 animate-pulse' : 'bg-blue-100 text-blue-700')}`}>
                                    {ar.status === 'PAID' ? 'Liquidado' : (new Date() > ar.dueDate ? 'Vencido' : 'Pendiente')}
                                 </span>
                              </td>
                              <td className="px-8 py-5 text-center">
                                 <div className="flex items-center justify-center gap-2">
                                   {ar.status !== 'PAID' && (
                                     <>
                                       <button 
                                         onClick={() => handleARPayment(ar)}
                                         className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-emerald-700 shadow-lg shadow-emerald-600/10 transition-all font-headline"
                                       >Recibir Pago</button>
                                       {onStartARCollection && (
                                         <button 
                                           onClick={() => onStartARCollection({
                                             active: true,
                                             arEntryId: ar.id,
                                             customerId: ar.customerId,
                                             customerName: ar.customerName,
                                             balanceUSD: ar.balanceUSD,
                                             balanceVES: Math.round(ar.balanceUSD * exchangeRate * 100) / 100,
                                             description: ar.description,
                                             saleCorrelativo: ar.saleCorrelativo
                                           })}
                                           className="px-4 py-2 bg-blue-600 text-white rounded-lg text-[9px] font-black uppercase hover:bg-blue-700 shadow-lg shadow-blue-600/10 transition-all font-headline"
                                           title="Usar módulo de Facturación con múltiples métodos de pago y vuelto"
                                         >Cobrar en Caja</button>
                                       )}
                                     </>
                                   )}
                                   <button
                                     onClick={() => handleViewARPayments(ar)}
                                     className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-emerald-600 hover:text-white transition-all"
                                     title="Historial de Pagos"
                                   >
                                     <History className="w-4 h-4" />
                                   </button>
                                   <button 
                                     onClick={() => exportARStatementForCustomer(ar.customerId)}
                                     className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                                     title="Estado de Cuenta"
                                   >
                                      <FileText className="w-4 h-4" />
                                   </button>
                                 </div>
                              </td>
                           </tr>
                           );
                         })}
                         </>
                       )}
                    </tbody>
                 </table>
              </div>
              {filteredAR.length > FIN_PAGE_SIZE && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">
                    {arPage * FIN_PAGE_SIZE + 1}–{Math.min((arPage + 1) * FIN_PAGE_SIZE, filteredAR.length)} de {filteredAR.length}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setArPage(p => Math.max(0, p - 1))} disabled={arPage === 0}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setArPage(p => p + 1)} disabled={(arPage + 1) * FIN_PAGE_SIZE >= filteredAR.length}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
              </>
              )}
           </div>

           {showARPaymentsModal && (
            <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-3 md:p-4">
              <div className="w-full max-w-5xl max-h-[94vh] my-2 mx-auto bg-white rounded-[1.4rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
                <div className="p-4 md:p-5 border-b bg-slate-50/70 flex justify-between items-start shrink-0 sticky top-0 z-10">
                   <div>
                    <h4 className="font-headline font-black text-sm md:text-base uppercase tracking-tight">Historial de Pagos AR</h4>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                       {arPaymentsTarget ? `${arPaymentsTarget.customerName} • Fact: ${arPaymentsTarget.saleCorrelativo}` : ''}
                     </div>
                   </div>
                   <button
                     onClick={() => {
                       setShowARPaymentsModal(false);
                       setArPaymentsTarget(null);
                       setArPayments([]);
                       setArPaymentsError('');
                       setArPaymentsLoading(false);
                     }}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase"
                   >Cerrar</button>
                 </div>

                <div className="p-4 md:p-5 overflow-y-auto flex-1 min-h-0">
                   {arPaymentsLoading ? (
                     <div className="p-12 text-center opacity-40 font-black uppercase tracking-widest text-[10px]">Cargando...</div>
                   ) : arPaymentsError ? (
                     <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                       {arPaymentsError}
                     </div>
                   ) : arPayments.length === 0 ? (
                     <div className="p-12 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">Sin pagos registrados</div>
                   ) : (
                    <div className="space-y-2.5">
                       {arPayments.map((p: any) => (
                        <div key={p.id} className="p-3.5 rounded-xl border border-slate-200 bg-white">
                           <div className="flex justify-between gap-6 items-start">
                             <div>
                              <div className="text-[10px] font-black uppercase text-slate-900">
                                 {String(p.method ?? '').toUpperCase()} • {String(p.currency ?? 'USD')}
                               </div>
                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                 {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                               </div>
                             </div>
                             <div className="text-right">
                              <div className="text-[12px] font-black text-emerald-700 font-mono">
                                 $ {Number(p.amountUSD ?? 0).toFixed(2)}
                               </div>
                               {String(p.currency ?? '') === 'VES' && (
                                <div className="text-[10px] font-black text-slate-700 font-mono">
                                   Bs {Number(p.amountVES ?? 0).toFixed(2)} @ {Number(p.rateUsed ?? 0).toFixed(2)}
                                 </div>
                               )}
                             </div>
                           </div>

                          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-3 gap-2">
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Banco</div>
                               <div className="font-bold text-slate-700 uppercase">{String(p.bank ?? '') || '-'}</div>
                             </div>
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Referencia</div>
                               <div className="font-bold text-slate-700">{String(p.reference ?? '') || '-'}</div>
                             </div>
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Actor</div>
                               <div className="font-bold text-slate-700 uppercase">{String(p.actor ?? '') || '-'}</div>
                             </div>
                           </div>

                           {Array.isArray(p.supports) && p.supports.length > 0 && (
                             <div className="mt-4">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Soportes</div>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                 {p.supports.map((s: any, idx: number) => (
                                   <a
                                     key={`${p.id}-s-${idx}`}
                                     href={String(s.url || '#')}
                                     target="_blank"
                                     rel="noreferrer"
                                     className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition-all"
                                   >
                                     <div className="text-[10px] font-black text-slate-800 truncate">{String(s.name ?? 'Soporte')}</div>
                                     <div className="text-[9px] text-slate-400 font-mono truncate">{String(s.provider ?? '')}{s.bucket ? ` • ${s.bucket}` : ''}</div>
                                   </a>
                                 ))}
                               </div>
                             </div>
                           )}
                         </div>
                       ))}
                     </div>
                   )}
                 </div>
               </div>
             </div>
           )}
        </div>
      )}

      {activeSubTab === 'ap' && (
        <div className="space-y-6 animate-in slide-in-from-right-4 duration-500">
           <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-100 bg-[#f8fafc]/50">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                  <div>
                    <h3 className="font-headline font-black text-lg uppercase tracking-tight">Cuentas por pagar</h3>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-4 py-1.5 rounded-full uppercase">Total Deuda: {usd(totalAP)}</span>
                    <button onClick={() => reportService.exportAPGlobalToPDF(filteredAP, { filterLabel: apStatusFilter === 'OPEN' ? 'Pendientes + vencidas' : apStatusFilter })}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase hover:bg-slate-700 transition-all">
                      <Download className="w-3 h-3" /> PDF
                    </button>
                    <button onClick={exportAPFilteredExcel}
                      className="flex items-center gap-1 px-3 py-1.5 bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase hover:bg-emerald-800 transition-all">
                      <Download className="w-3 h-3" /> Excel
                    </button>
                    <button onClick={() => setShowPurchaseModal(true)}
                      className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase shadow-xl shadow-emerald-600/20">
                      Registrar compra
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <div className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    <input type="date" value={apDateRange.start} onChange={e => { setApDateRange(p => ({...p, start: e.target.value})); setApPage(0); }}
                      className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32" />
                    <span className="text-slate-300 text-[10px]">—</span>
                    <input type="date" value={apDateRange.end} onChange={e => { setApDateRange(p => ({...p, end: e.target.value})); setApPage(0); }}
                      className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32" />
                  </div>
                  <div className="flex bg-slate-100 rounded-xl overflow-hidden border border-slate-200 text-[9px] font-black uppercase">
                    {(['ALL','OPEN','PENDING','OVERDUE','PAID'] as const).map(s => (
                      <button key={s} onClick={() => { setApStatusFilter(s); setApPage(0); }}
                        className={`px-3 py-1.5 transition-all ${apStatusFilter === s ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-200'}`}>
                        {s === 'ALL' ? 'Todos' : s === 'OPEN' ? 'Pend.+Venc.' : s === 'PENDING' ? 'Pendiente' : s === 'OVERDUE' ? 'Vencido' : 'Pagado'}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 min-w-[260px]">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={apSearch}
                      onChange={(e) => { setApSearch(e.target.value); setApPage(0); }}
                      placeholder="Buscar proveedor, documento, ID..."
                      className="w-full bg-transparent border-0 text-[10px] font-black text-slate-700 placeholder:text-slate-300 focus:ring-0"
                    />
                  </div>
                </div>
              </div>
              {groupedAP.length > 0 && (
                <div className="px-6 pt-5 pb-2 border-b border-slate-100 bg-slate-50/40">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-3">Concentración por proveedor</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {groupedAP.slice(0, 6).map((group) => {
                      const isExpanded = expandedAPSupplierKey === group.key;
                      return (
                        <button
                          key={group.key}
                          onClick={() => setExpandedAPSupplierKey((prev) => (prev === group.key ? null : group.key))}
                          className={`text-left rounded-xl border px-3 py-2 transition-all ${isExpanded ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                        >
                          <div className="text-[10px] font-black text-slate-900 uppercase truncate">{group.supplier}</div>
                          <div className="mt-0.5 text-[9px] font-bold text-slate-400">{group.entries.length} doc · {group.overdueCount} venc.</div>
                          <div className="mt-1 text-[12px] font-black text-red-700">$ {group.totalBalanceUSD.toFixed(2)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead>
                       <tr className="bg-slate-50/50 text-[8px] font-black uppercase text-slate-400 border-b border-slate-100">
                          <th className="px-8 py-5">Proveedor / ID</th>
                          <th className="px-8 py-5">Vencimiento</th>
                          <th className="px-8 py-5 text-right">Saldo USD</th>
                          <th className="px-8 py-5 text-center">Estado</th>
                          <th className="px-8 py-5 text-center">Acciones</th>
                       </tr>
                    </thead>
                    <tbody className="text-[11px]">
                       {displayedAP.length === 0 ? (
                         <tr><td colSpan={5} className="p-20 text-center opacity-30 font-black uppercase tracking-widest">Sin compromisos pendientes</td></tr>
                       ) : (
                         displayedAP.slice(apPage * FIN_PAGE_SIZE, (apPage + 1) * FIN_PAGE_SIZE).map((ap) => {
                           const isOverdue = ap.status !== 'PAID' && new Date() > ap.dueDate;
                           return (
                           <tr key={ap.id} className={`border-b transition-colors group ${isOverdue ? 'bg-red-50/60 border-red-100 hover:bg-red-50' : 'border-slate-50 hover:bg-slate-50'}`}>
                              <td className="px-8 py-5">
                                 <div className="font-black text-slate-900 uppercase">{ap.supplier}</div>
                                 <div className="text-[8px] text-slate-400 font-mono">{ap.id}</div>
                              </td>
                              <td className={`px-8 py-5 font-bold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                                {ap.dueDate.toLocaleDateString()}
                              </td>
                              <td className="px-8 py-5 text-right font-black text-slate-900 text-[13px]">$ {ap.balanceUSD.toFixed(2)}</td>
                              <td className="px-8 py-5 text-center">
                                <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${isOverdue ? 'bg-red-100 text-red-700 animate-pulse' : ap.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                                  {isOverdue ? 'Vencido' : ap.status === 'PAID' ? 'Pagado' : 'Pendiente'}
                                </span>
                              </td>
                              <td className="px-8 py-5 text-center">
                                 <div className="flex items-center justify-center gap-2">
                                   {ap.status !== 'PAID' && (
                                     <button onClick={() => handleAPPayment(ap)}
                                       className="px-4 py-2 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase hover:bg-slate-800 transition-all shadow-sm">
                                       Abonar
                                     </button>
                                   )}
                                   <button onClick={() => handleViewAPPayments(ap)}
                                     className="p-2 bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-900 hover:text-white transition-all"
                                     title="Historial de pagos">
                                     <History className="w-4 h-4" />
                                   </button>
                                  <button onClick={() => reportService.exportAPStatementToPDF(
                                    ap.supplierId ?? ap.supplier,
                                    ap.supplier,
                                    {
                                      startDate: apDateRange.start,
                                      endDate: apDateRange.end
                                    }
                                  )}
                                     className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                                     title="Estado de cuenta proveedor PDF">
                                     <Download className="w-4 h-4" />
                                   </button>
                                 </div>
                              </td>
                           </tr>
                           );
                         })
                       )}
                    </tbody>
                 </table>
              </div>
              {displayedAP.length > FIN_PAGE_SIZE && (
                <div className="p-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-400 uppercase">
                    {apPage * FIN_PAGE_SIZE + 1}–{Math.min((apPage + 1) * FIN_PAGE_SIZE, displayedAP.length)} de {displayedAP.length}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => setApPage(p => Math.max(0, p - 1))} disabled={apPage === 0}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                    <button onClick={() => setApPage(p => p + 1)} disabled={(apPage + 1) * FIN_PAGE_SIZE >= displayedAP.length}
                      className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
           </div>

           {showAPPaymentModal && apPayTarget && (
             <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
               <div className="w-full max-w-7xl bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
                 <div className="p-8 border-b bg-slate-50/30 flex justify-between items-start gap-6">
                   <div>
                     <h4 className="font-headline font-black text-lg uppercase tracking-tight">Abonar Cuenta por Pagar</h4>
                     <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                       {String(apPayTarget?.supplier ?? '').toUpperCase()} • ID: {String(apPayTarget?.id ?? '')}
                     </div>
                   </div>
                   <button
                     onClick={resetAPPaymentModal}
                     className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                   >
                     <X className="w-5 h-5" />
                   </button>
                 </div>

                 <div className="p-8 space-y-6 max-h-[80vh] overflow-y-auto">
                   {apPayError && (
                     <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                       {apPayError}
                     </div>
                   )}

                   <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                       <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Total factura</div>
                       <div className="mt-2 text-[20px] font-black text-slate-900 font-mono">$ {Number(apPayDetail?.amountUSD ?? apPayTarget?.amountUSD ?? 0).toFixed(2)}</div>
                     </div>
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                       <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Saldo pendiente</div>
                       <div className="mt-2 text-[20px] font-black text-slate-900 font-mono">$ {apPayBalanceUSD.toFixed(2)}</div>
                     </div>
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                       <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Total a abonar</div>
                       <div className="mt-2 text-[20px] font-black text-emerald-700 font-mono">$ {apPayTotalUSD.toFixed(2)}</div>
                     </div>
                     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                       <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Saldo restante</div>
                       <div className="mt-2 text-[20px] font-black text-slate-900 font-mono">$ {apPayRemainingUSD.toFixed(2)}</div>
                     </div>
                   </div>

                   {apPayDetailLoading ? (
                     <div className="p-10 rounded-2xl border border-slate-200 bg-slate-50 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                       Cargando detalle de factura...
                     </div>
                   ) : (
                     <>
                       <div className="rounded-[2rem] border border-slate-200 overflow-hidden">
                         <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between gap-3">
                           <div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Detalle de factura</div>
                             <div className="text-[13px] font-black text-slate-900 uppercase">{String(apPayDetail?.invoiceNumber ?? apPayTarget?.description ?? 'FACTURA SIN DETALLE')}</div>
                           </div>
                           <div className="text-right text-[10px] font-bold text-slate-500 uppercase">
                             <div>Proveedor: {String(apPayDetail?.supplier ?? apPayTarget?.supplier ?? '-')}</div>
                             <div>Documento: {String(apPayDetail?.supplierDocument ?? '-')}</div>
                           </div>
                         </div>
                         <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-4">
                           <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-4">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Factura</div>
                             <div className="mt-2 text-[12px] font-black text-slate-900">{String(apPayDetail?.invoiceNumber ?? '-')}</div>
                           </div>
                           <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-4">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Fecha factura</div>
                             <div className="mt-2 text-[12px] font-black text-slate-900">{apPayDetail?.invoiceDate ? new Date(apPayDetail.invoiceDate).toLocaleDateString() : '-'}</div>
                           </div>
                           <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-4">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Vencimiento</div>
                             <div className="mt-2 text-[12px] font-black text-slate-900">{apPayDetail?.invoiceDueDate ? new Date(apPayDetail.invoiceDueDate).toLocaleDateString() : (apPayDetail?.dueDate ? new Date(apPayDetail.dueDate).toLocaleDateString() : '-')}</div>
                           </div>
                           <div className="rounded-2xl bg-slate-50 border border-slate-200 px-4 py-4">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Soportes factura</div>
                             <div className="mt-2 text-[12px] font-black text-slate-900">{Array.isArray(apPayDetail?.supports) ? apPayDetail.supports.length : 0}</div>
                           </div>
                         </div>
                         {Array.isArray(apPayDetail?.supports) && apPayDetail.supports.length > 0 && (
                           <div className="px-6 pb-6">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-2">Comprobantes de la factura</div>
                             <div className="flex flex-wrap gap-2">
                               {apPayDetail.supports.map((support: any, idx: number) => (
                                 <a
                                   key={`ap-detail-support-${idx}`}
                                   href={String(support?.url ?? '#')}
                                   target="_blank"
                                   rel="noreferrer"
                                   className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-700"
                                 >
                                   {String(support?.name ?? `Soporte ${idx + 1}`)}
                                 </a>
                               ))}
                             </div>
                           </div>
                         )}
                         {Array.isArray(apPayDetail?.lines) && apPayDetail.lines.length > 0 && (
                           <div className="px-6 pb-6">
                             <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-3">Renglones de la factura</div>
                             <div className="overflow-x-auto rounded-2xl border border-slate-200">
                               <table className="w-full text-left">
                                 <thead>
                                   <tr className="bg-slate-50 text-[8px] font-black uppercase text-slate-400">
                                     <th className="px-4 py-3">#</th>
                                     <th className="px-4 py-3">Producto</th>
                                     <th className="px-4 py-3">Cantidad</th>
                                     <th className="px-4 py-3">Costo USD</th>
                                     <th className="px-4 py-3 text-right">Total USD</th>
                                   </tr>
                                 </thead>
                                 <tbody className="text-[11px]">
                                   {apPayDetail.lines.map((row: any) => (
                                     <tr key={row.id} className="border-t border-slate-100">
                                       <td className="px-4 py-3 font-black text-slate-500">{row.lineNumber || '-'}</td>
                                       <td className="px-4 py-3">
                                         <div className="font-black text-slate-900 uppercase">{String(row.productDescription ?? row.sku ?? '-')}</div>
                                         <div className="text-[9px] text-slate-400 font-mono">{String(row.sku ?? '')}</div>
                                       </td>
                                       <td className="px-4 py-3 font-bold text-slate-700">{Number(row.qty ?? 0).toFixed(2)} {String(row.unit ?? '').toUpperCase()}</td>
                                       <td className="px-4 py-3 font-bold text-slate-700">$ {Number(row.costUSD ?? 0).toFixed(2)}</td>
                                       <td className="px-4 py-3 text-right font-black text-slate-900">$ {Number(row.totalLineUSD ?? 0).toFixed(2)}</td>
                                     </tr>
                                   ))}
                                 </tbody>
                               </table>
                             </div>
                           </div>
                         )}
                       </div>

                       <div className="rounded-[2rem] border border-slate-200 overflow-hidden">
                         <div className="px-6 py-4 border-b bg-slate-50 flex items-center justify-between gap-3">
                           <div>
                             <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Renglones de abono</div>
                             <div className="text-[12px] font-bold text-slate-500">Puedes repartir el pago entre distintas cuentas, bancos y métodos.</div>
                           </div>
                           <button
                             onClick={() => addAPPaymentLine(apPayRemainingUSD > 0 ? apPayRemainingUSD.toFixed(2) : '')}
                             className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-emerald-600/20"
                           >
                             <Plus className="w-4 h-4" />
                             Agregar renglón
                           </button>
                         </div>
                         <div className="p-6 space-y-4">
                           {apPayLines.map((line, index) => {
                             const currency = getAPPaymentCurrency(line.method);
                             const bankOptions = getAPPaymentBankOptions(line.method);
                             const accountOptions = getAPPaymentAccountOptions(line.bankId, line.method);
                             const selectedBank = activeBanks.find((bank: any) => String(bank?.id ?? '') === String(line.bankId ?? '')) ?? null;
                             const selectedAccount = accountOptions.find((account: any) => String(account?.id ?? '') === String(line.accountId ?? '')) ?? null;
                             const rateUsed = currency === 'VES' ? (Number((line.rateUsed || '').replace(',', '.')) || 0) : 0;
                             const amountUSD = Number((line.amountUSD || '').replace(',', '.')) || 0;
                             const requiredVES = currency === 'VES' ? Math.round(amountUSD * rateUsed * 100) / 100 : 0;
                            const apBalKey = bankBalanceMapKey(String(line.bankId ?? ''), '', currency);
                             const apBalRow = apPayBankBalances.get(apBalKey);
                            // CxP debe mostrar exactamente el mismo saldo del módulo Bancos
                            // (fuente oficial: getAvailableBankBalance vía useBankBalances),
                            // evitando diferencias temporales por cálculos locales con ventanas parciales.
                            const availableBalance =
                              apBalRow && !apBalRow.loading && !apBalRow.error
                                ? apBalRow.balance
                                : 0;
                             return (
                               <div key={line.id} className="rounded-[1.75rem] border border-slate-200 bg-white p-5 space-y-4">
                                 <div className="flex items-center justify-between gap-3">
                                   <div>
                                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Renglón {index + 1}</div>
                                     <div className="text-[12px] font-black text-slate-900">{paymentMethodOptions.find((option) => option.id === line.method)?.label ?? 'Pago'}</div>
                                   </div>
                                   {apPayLines.length > 1 && (
                                     <button
                                       onClick={() => removeAPPaymentLine(line.id)}
                                       className="inline-flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 rounded-xl text-[10px] font-black uppercase"
                                     >
                                       <Trash2 className="w-4 h-4" />
                                       Quitar
                                     </button>
                                   )}
                                 </div>

                                 <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Método</label>
                                     <select
                                       value={line.method}
                                       onChange={(e) => updateAPPaymentLine(line.id, { method: e.target.value })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                     >
                                       {paymentMethodOptions.map((option) => (
                                         <option key={option.id} value={option.id}>{option.label}</option>
                                       ))}
                                     </select>
                                   </div>
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Banco</label>
                                     <select
                                       value={line.bankId}
                                       onChange={(e) => updateAPPaymentLine(line.id, { bankId: e.target.value })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                     >
                                       {bankOptions.length === 0 ? (
                                         <option value="">Sin bancos compatibles</option>
                                       ) : bankOptions.map((bank: any) => (
                                         <option key={bank.id} value={bank.id}>{String(bank.name ?? '').toUpperCase()}</option>
                                       ))}
                                     </select>
                                   </div>
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cuenta</label>
                                     <select
                                       value={line.accountId}
                                       onChange={(e) => updateAPPaymentLine(line.id, { accountId: e.target.value })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                     >
                                       {accountOptions.length === 0 ? (
                                         <option value="">Sin cuentas compatibles</option>
                                       ) : accountOptions.map((account: any) => (
                                         <option key={account.id} value={account.id}>{String(account.label ?? '').toUpperCase()} • {String(account.currency ?? '')}</option>
                                       ))}
                                     </select>
                                   </div>
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Monto USD</label>
                                     <input
                                       type="number"
                                       min="0"
                                       step="0.01"
                                       value={line.amountUSD}
                                       onChange={(e) => updateAPPaymentLine(line.id, { amountUSD: e.target.value })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                     />
                                   </div>
                                 </div>

                                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                   <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Moneda operativa</div>
                                     <div className="mt-2 text-[16px] font-black text-slate-900 font-mono">{currency}</div>
                                   </div>
                                   <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Saldo disponible</div>
                                     <div className="mt-2 text-[16px] font-black text-emerald-700 font-mono flex items-baseline gap-2 flex-wrap">
                                      {apBalRow?.loading ? (
                                        <span className="text-[9px] font-bold text-slate-400 normal-case">sincronizando…</span>
                                      ) : apBalRow?.error ? (
                                        <span className="text-[9px] font-bold text-amber-500 normal-case">sin datos</span>
                                      ) : (
                                        <>{currency === 'VES' ? 'Bs' : '$'} {availableBalance.toFixed(2)}</>
                                      )}
                                     </div>
                                   </div>
                                   <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                     <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cuenta seleccionada</div>
                                     <div className="mt-2 text-[12px] font-black text-slate-900 uppercase">{String(selectedBank?.name ?? '-')} / {String(selectedAccount?.label ?? '-')}</div>
                                   </div>
                                 </div>

                                 {currency === 'VES' && (
                                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                     <div>
                                       <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Tasa usada</label>
                                       <input
                                         type="number"
                                         min="0"
                                         step="0.01"
                                         value={line.rateUsed}
                                         onChange={(e) => updateAPPaymentLine(line.id, { rateUsed: e.target.value })}
                                         className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                       />
                                     </div>
                                     <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                                       <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Monto estimado en Bs</div>
                                       <div className="mt-2 text-[18px] font-black text-slate-900 font-mono">Bs {requiredVES.toFixed(2)}</div>
                                     </div>
                                   </div>
                                 )}

                                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Referencia</label>
                                     <input
                                       type="text"
                                       value={line.reference}
                                       onChange={(e) => updateAPPaymentLine(line.id, { reference: e.target.value.toUpperCase() })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-black outline-none"
                                     />
                                   </div>
                                   <div>
                                     <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Comprobantes</label>
                                     <input
                                       type="file"
                                       multiple
                                       accept="image/*,application/pdf"
                                       onChange={(e) => updateAPPaymentLine(line.id, { files: Array.from(e.target.files || []) })}
                                       className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[11px] font-black outline-none"
                                     />
                                     {Array.isArray(line.files) && line.files.length > 0 && (
                                       <div className="mt-2 text-[10px] text-slate-500 font-bold">
                                         {line.files.map((file) => file.name).join(' • ')}
                                       </div>
                                     )}
                                   </div>
                                 </div>

                                 <div>
                                   <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nota del abono</label>
                                   <textarea
                                     value={line.note}
                                     onChange={(e) => updateAPPaymentLine(line.id, { note: e.target.value })}
                                     rows={2}
                                     className="w-full mt-1 bg-slate-100 rounded-2xl p-4 text-[12px] font-bold outline-none resize-none"
                                   />
                                 </div>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     </>
                   )}

                   <div className="flex justify-end gap-3">
                     <button
                       onClick={resetAPPaymentModal}
                       className="px-5 py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest"
                     >Cancelar</button>
                     <button
                       onClick={submitAPPayment}
                       disabled={apPaySubmitting}
                       className="px-6 py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-emerald-600/20 disabled:opacity-60"
                     >
                       {apPaySubmitting ? 'Procesando...' : 'Registrar Pago'}
                     </button>
                   </div>
                 </div>
               </div>
             </div>
           )}

           {showAPPaymentsModal && (
            <div className="fixed inset-0 z-50 bg-black/40 overflow-y-auto p-3 md:p-4">
              <div className="w-full max-w-5xl max-h-[94vh] my-2 mx-auto bg-white rounded-[1.4rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
                <div className="p-4 md:p-5 border-b bg-slate-50/70 flex justify-between items-start shrink-0 sticky top-0 z-10">
                   <div>
                    <h4 className="font-headline font-black text-sm md:text-base uppercase tracking-tight">Historial de Pagos AP</h4>
                    <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                       {apPaymentsTarget ? `${apPaymentsTarget.supplier} • ID: ${apPaymentsTarget.id}` : ''}
                     </div>
                   </div>
                   <button
                     onClick={() => {
                       setShowAPPaymentsModal(false);
                       setApPaymentsTarget(null);
                       setApPayments([]);
                      setApPaymentsVisibleCount(AP_PAYMENTS_PAGE_SIZE);
                       setApPaymentsError('');
                       setApPaymentsLoading(false);
                     }}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase"
                   >Cerrar</button>
                 </div>

                <div className="p-4 md:p-5 overflow-y-auto flex-1 min-h-0">
                   {apPaymentsLoading ? (
                     <div className="p-12 text-center opacity-40 font-black uppercase tracking-widest text-[10px]">Cargando...</div>
                   ) : apPaymentsError ? (
                     <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                       {apPaymentsError}
                     </div>
                   ) : apPayments.length === 0 ? (
                     <div className="p-12 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">Sin pagos registrados</div>
                   ) : (
                    <div className="space-y-2.5">
                      {visibleAPPayments.map((p: any) => (
                        <div key={p.id} className="p-3.5 rounded-xl border border-slate-200 bg-white">
                           <div className="flex justify-between gap-6 items-start">
                             <div>
                              <div className="text-[10px] font-black uppercase text-slate-900">
                                 {String(p.method ?? '').toUpperCase()} • {String(p.currency ?? 'USD')}
                               </div>
                              <div className="text-[9px] text-slate-400 font-mono mt-0.5">
                                 {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                               </div>
                             </div>
                             <div className="text-right">
                              <div className="text-[12px] font-black text-red-600 font-mono">
                                 $ {Number(p.amountUSD ?? 0).toFixed(2)}
                               </div>
                               {String(p.currency ?? '') === 'VES' && (
                                <div className="text-[10px] font-black text-slate-700 font-mono">
                                   Bs {Number(p.amountVES ?? 0).toFixed(2)} @ {Number(p.rateUsed ?? 0).toFixed(2)}
                                 </div>
                               )}
                             </div>
                           </div>

                          <div className="mt-2.5 grid grid-cols-1 md:grid-cols-4 gap-2">
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Banco</div>
                               <div className="mt-1 font-black text-slate-900">{String(p.bank ?? 'N/D').toUpperCase()}</div>
                               {!!String(p.accountLabel ?? '').trim() && (
                                 <div className="mt-1 text-slate-500 font-mono">Cuenta: {String(p.accountLabel ?? '')}</div>
                               )}
                             </div>
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Referencia</div>
                               <div className="mt-1 font-black text-slate-900">{String(p.reference ?? '').trim() || 'Sin referencia'}</div>
                             </div>
                            <div className="text-[9px]">
                              <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Operador</div>
                              <div className="mt-1 font-black text-slate-900 uppercase">{String(p.actor ?? 'SISTEMA')}</div>
                            </div>
                            <div className="text-[9px]">
                               <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Comprobante</div>
                               <div className="mt-1 flex items-center gap-2">
                                 <span className="font-black text-slate-900">{Array.isArray(p.supports) ? p.supports.length : 0} archivo(s)</span>
                                 {Array.isArray(p.supports) && p.supports.length > 0 && (
                                   <button
                                     onClick={() => openBankSupportPreview(p.supports, 0)}
                                    className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[8px] font-black uppercase"
                                   >Ver</button>
                                 )}
                               </div>
                             </div>
                           </div>

                           {!!String(p.note ?? '').trim() && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 text-[9px] text-slate-600 font-bold">
                               {String(p.note ?? '')}
                             </div>
                           )}
                         </div>
                       ))}
                      {hasMoreAPPayments && (
                        <div className="pt-1 flex items-center justify-center">
                          <button
                            onClick={() => setApPaymentsVisibleCount((prev) => prev + AP_PAYMENTS_PAGE_SIZE)}
                            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-700"
                          >
                            Cargar mas movimientos
                          </button>
                        </div>
                      )}
                     </div>
                   )}
                 </div>
               </div>
             </div>
           )}
        </div>
      )}

      {activeSubTab === 'expenses' && (() => {
        const activeExpenses = expensesList.filter(e => e.status !== 'VOID');
        const totalMTD = activeExpenses.filter(e => e.budgetMonth === `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`).reduce((s,e) => s + e.amountUSD, 0);
        const totalAll = activeExpenses.reduce((s,e) => s + e.amountUSD, 0);
        const byCategory = Object.entries(EXPENSE_CATEGORIES).map(([key, label]) => ({
          key: key as ExpenseCategory, label,
          total: activeExpenses.filter(e => e.category === key).reduce((s,e) => s + e.amountUSD, 0),
          count: activeExpenses.filter(e => e.category === key).length
        })).filter(c => c.count > 0).sort((a,b) => b.total - a.total);

        const filtered = expensesList.filter(e => {
          if (expenseStatusFilter !== 'ALL' && e.status !== expenseStatusFilter) return false;
          if (expenseCatFilter !== 'ALL' && e.category !== expenseCatFilter) return false;
          if (expenseMonthFilter && e.budgetMonth !== expenseMonthFilter) return false;
          if (expenseSearch) {
            const q = expenseSearch.toLowerCase();
            if (!e.description.toLowerCase().includes(q) && !(e.supplier ?? '').toLowerCase().includes(q)) return false;
          }
          return true;
        }).sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());

        const exportCSV = () => {
          const headers = ['Fecha','Descripción','Categoría','Proveedor','Moneda','Monto USD','Monto Bs','Método Pago','Referencia','Estado','Registrado por'];
          const csvRows: Record<string, string>[] = filtered.map((e) => ({
            'Fecha': e.timestamp.toLocaleDateString('es-VE'),
            'Descripción': e.description,
            'Categoría': EXPENSE_CATEGORIES[e.category] ?? e.category,
            'Proveedor': e.supplier ?? '',
            'Moneda': String(e.currency ?? ''),
            'Monto USD': Number(e.amountUSD ?? 0).toFixed(2),
            'Monto Bs': Number(e.amountVES ?? 0).toFixed(2),
            'Método Pago': e.paymentMethod ?? '',
            'Referencia': e.reference ?? '',
            'Estado': String(e.status ?? ''),
            'Registrado por': e.createdBy ?? ''
          }));
          const totalUSD = filtered.reduce((sum, e) => sum + (Number(e.amountUSD ?? 0) || 0), 0);
          const totalVES = filtered.reduce((sum, e) => sum + (Number(e.amountVES ?? 0) || 0), 0);
          csvRows.push({
            'Fecha': 'TOTAL',
            'Descripción': '',
            'Categoría': '',
            'Proveedor': '',
            'Moneda': '',
            'Monto USD': totalUSD.toFixed(2),
            'Monto Bs': totalVES.toFixed(2),
            'Método Pago': '',
            'Referencia': '',
            'Estado': '',
            'Registrado por': ''
          });
          const preambleRows: string[][] = [
            ['TIPO_REPORTE', 'Libro de Egresos (Finanzas)'],
            ['FILTROS_APLICADOS', [
              `Estado: ${expenseStatusFilter}`,
              `Categoria: ${expenseCatFilter}`,
              `Mes: ${expenseMonthFilter || 'Todos'}`,
              `Busqueda: ${expenseSearch || 'Todos'}`
            ].join(' | ')],
            ['GENERADO_POR', String(dataService.getCurrentUser()?.name ?? dataService.getCurrentUser()?.email ?? 'Sistema')],
            ['FECHA_GENERACION', new Date().toLocaleString('es-VE')],
            Array.from({ length: headers.length }, () => '')
          ];
          const csv = buildExcelFriendlyCsv(headers, csvRows, { preambleRows });
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a'); a.href = url; a.download = `gastos_${new Date().toISOString().split('T')[0]}.csv`; a.click();
          URL.revokeObjectURL(url);
          const generatedAt = new Date().toLocaleString('es-VE');
          const detail = [
            'Exportacion CSV',
            'Reporte: Libro de Egresos (Finanzas)',
            `Filtros: Estado=${expenseStatusFilter}; Categoria=${expenseCatFilter}; Mes=${expenseMonthFilter || 'Todos'}; Busqueda=${expenseSearch || 'Todos'}`,
            `Fecha: ${generatedAt}`
          ].join(' | ');
          void dataService.addAuditEntry('REPORTS', 'EXPORT', detail).catch(() => {});
        };

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Gasto del Mes', value: usd(totalMTD), color: 'red' },
                { label: 'Gasto Total', value: usd(totalAll), color: 'slate' },
                { label: 'Egresos Activos', value: String(activeExpenses.length), color: 'amber' },
                { label: 'Categorías Usadas', value: String(byCategory.length), color: 'indigo' },
              ].map(c => (
                <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{c.label}</p>
                  <p className={`text-2xl font-black mt-1 text-${c.color}-600`}>{c.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Form */}
              <div className="lg:col-span-4 space-y-4">
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-base text-slate-900 flex items-center gap-2"><Plus className="w-4 h-4 text-emerald-600"/> Registrar Gasto</h4>
                    <button
                      type="button"
                      onClick={() => { setPayrollEmpId(''); setPayrollEmpSearch(''); setPayrollEmpOpen(false); setPayrollSalary(''); setPayrollPeriod(''); setPayrollCxcCurrency('USD'); setPayrollCxcAmount(''); setPayrollObservation(''); setPayrollError(''); setPayrollLines([{ method: 'cash_usd', bankId: '', accountId: '', currency: 'USD', amountUSD: '', amountBS: '', rate: '', ref: '' }]); setShowPayrollModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                    >
                      <Users className="w-3 h-3" /> Pago Nómina
                    </button>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Concepto *</label>
                    <input type="text" value={newExpense.description} onChange={e => setNewExpense(p => ({...p, description: e.target.value}))}
                      placeholder="Ej. Pago de internet, flete norte..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"/>
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Categoría *</label>
                    <select value={newExpense.category} onChange={e => setNewExpense(p => ({...p, category: e.target.value as ExpenseCategory}))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all">
                      {Object.entries(EXPENSE_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Moneda</label>
                      <select value={newExpense.currency} onChange={e => setNewExpense(p => ({...p, currency: e.target.value as 'USD'|'VES'}))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all">
                        <option value="USD">USD $</option><option value="VES">Bs</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Monto *</label>
                      <input type="number" min="0" step="0.01" value={newExpense.currency === 'USD' ? newExpense.amountUSD : newExpense.amountVES}
                        onChange={e => setNewExpense(p => newExpense.currency === 'USD' ? {...p, amountUSD: e.target.value} : {...p, amountVES: e.target.value})}
                        placeholder="0.00" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-black outline-none focus:border-emerald-500 transition-all"/>
                    </div>
                  </div>
                  {newExpense.currency === 'VES' && newExpense.amountVES && (
                    <p className="text-[10px] text-emerald-600 font-bold">≈ ${(parseFloat(newExpense.amountVES) / (exchangeRate||1)).toFixed(2)} USD (tasa {exchangeRate.toFixed(2)})</p>
                  )}
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Proveedor / Beneficiario</label>
                    <input type="text" value={newExpense.supplier} onChange={e => setNewExpense(p => ({...p, supplier: e.target.value}))}
                      placeholder="Nombre o empresa" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"/>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Método de Pago</label>
                      <select value={newExpense.paymentMethod ?? ''} onChange={e => setNewExpense(p => ({...p, paymentMethod: e.target.value as any}))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all">
                        <option value="">— Seleccionar —</option>
                        {Object.entries(EXPENSE_PAY_METHODS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Referencia</label>
                      <input type="text" value={newExpense.reference} onChange={e => setNewExpense(p => ({...p, reference: e.target.value}))}
                        placeholder="Nro. comprobante" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"/>
                    </div>
                  </div>
                  <button disabled={expenseSubmitting || !newExpense.description || (!newExpense.amountUSD && !newExpense.amountVES)}
                    onClick={async () => {
                      if (!newExpense.description) return;
                      const amtUSD = newExpense.currency === 'USD' ? parseFloat(newExpense.amountUSD) : parseFloat(newExpense.amountVES) / (exchangeRate||1);
                      const amtVES = newExpense.currency === 'VES' ? parseFloat(newExpense.amountVES) : 0;
                      if (isNaN(amtUSD) || amtUSD <= 0) return;
                      setExpenseSubmitting(true);
                      try {
                        await dataService.addExpense({ description: newExpense.description, amountUSD: amtUSD, amountVES: amtVES || undefined, currency: newExpense.currency, category: newExpense.category, supplier: newExpense.supplier || undefined, paymentMethod: (newExpense.paymentMethod || undefined) as any, reference: newExpense.reference || undefined });
                        setNewExpense(blankExpenseForm());
                      } finally { setExpenseSubmitting(false); }
                    }}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                    {expenseSubmitting ? <><Loader2 className="w-4 h-4 animate-spin"/> Guardando...</> : <><Plus className="w-4 h-4"/> Confirmar Egreso</>}
                  </button>
                </div>

                {/* Top categorías */}
                {byCategory.length > 0 && (
                  <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 space-y-3">
                    <h4 className="font-black text-sm text-slate-900 uppercase tracking-widest">Distribución por Categoría</h4>
                    {byCategory.slice(0,6).map(c => (
                      <div key={c.key}>
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] font-bold text-slate-600">{c.label}</span>
                          <span className="text-[10px] font-black text-slate-900 font-mono">${c.total.toFixed(2)}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{width: `${Math.min(100, (c.total/totalAll)*100)}%`}}/>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Table */}
              <div className="lg:col-span-8 bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b bg-slate-50/50 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="font-black text-sm text-slate-900">Libro de Gastos</h4>
                    <button onClick={exportCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                      <Download className="w-3 h-3"/> Exportar Excel
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="relative col-span-2">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"/>
                      <input type="text" placeholder="Buscar concepto o proveedor..." value={expenseSearch} onChange={e => setExpenseSearch(e.target.value)}
                        className="w-full bg-slate-100 border-0 rounded-xl pl-8 pr-3 py-2 text-[11px] font-bold outline-none"/>
                    </div>
                    <select value={expenseCatFilter} onChange={e => setExpenseCatFilter(e.target.value as any)}
                      className="bg-slate-100 border-0 rounded-xl px-3 py-2 text-[11px] font-bold outline-none">
                      <option value="ALL">Todas las categorías</option>
                      {Object.entries(EXPENSE_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="flex gap-1">
                      <select value={expenseStatusFilter} onChange={e => setExpenseStatusFilter(e.target.value as any)}
                        className="flex-1 bg-slate-100 border-0 rounded-xl px-3 py-2 text-[11px] font-bold outline-none">
                        <option value="ACTIVE">Activos</option><option value="VOID">Anulados</option><option value="ALL">Todos</option>
                      </select>
                      <input type="month" value={expenseMonthFilter} onChange={e => setExpenseMonthFilter(e.target.value)}
                        className="flex-1 bg-slate-100 border-0 rounded-xl px-2 py-2 text-[10px] font-bold outline-none"/>
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-slate-400">{filtered.length} registros · Total: <span className="text-red-600 font-black">${filtered.filter(e=>e.status==='ACTIVE').reduce((s,e)=>s+e.amountUSD,0).toFixed(2)}</span></p>
                </div>

                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                      <tr className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                        <th className="px-4 py-3">Fecha</th>
                        <th className="px-4 py-3">Concepto / Proveedor</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3">Método</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                        <th className="px-4 py-3 text-center">Estado</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 && (
                        <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm font-bold">Sin gastos para los filtros seleccionados</td></tr>
                      )}
                      {filtered.map(exp => (
                        <tr key={exp.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${exp.status === 'VOID' ? 'opacity-50' : ''}`}>
                          <td className="px-4 py-3 text-[10px] font-mono text-slate-500 whitespace-nowrap">{exp.timestamp.toLocaleDateString('es-VE')}</td>
                          <td className="px-4 py-3">
                            <p className="text-[11px] font-black text-slate-900 uppercase leading-tight">{exp.description}</p>
                            {exp.supplier && <p className="text-[9px] text-slate-400 font-bold mt-0.5">{exp.supplier}</p>}
                            {exp.reference && <p className="text-[9px] text-indigo-400 font-mono mt-0.5">Ref: {exp.reference}</p>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase whitespace-nowrap">
                              {EXPENSE_CATEGORIES[exp.category] ?? exp.category}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[9px] text-slate-500 font-bold whitespace-nowrap">
                            {exp.paymentMethod ? EXPENSE_PAY_METHODS[exp.paymentMethod] ?? exp.paymentMethod : '—'}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <p className={`text-[12px] font-black font-mono ${exp.status === 'VOID' ? 'line-through text-slate-400' : 'text-red-600'}`}>
                              ${exp.amountUSD.toFixed(2)}
                            </p>
                            {exp.amountVES && exp.amountVES > 0 && (
                              <p className="text-[9px] text-slate-400 font-mono">Bs {exp.amountVES.toFixed(2)}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {exp.status === 'VOID'
                              ? <span className="px-2 py-0.5 bg-red-50 text-red-500 rounded-lg text-[8px] font-black uppercase">Anulado</span>
                              : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-lg text-[8px] font-black uppercase">Activo</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-right">
                            {exp.status === 'ACTIVE' && (
                              voidingId === exp.id ? (
                                <div className="flex items-center gap-1">
                                  <input type="text" placeholder="Motivo..." value={voidReason} onChange={e => setVoidReason(e.target.value)}
                                    className="border border-red-200 rounded-lg px-2 py-1 text-[9px] font-bold w-24 outline-none"/>
                                  <button onClick={async () => {
                                    if (!voidReason.trim()) return;
                                    await dataService.voidExpense(exp.id, voidReason);
                                    setVoidingId(null); setVoidReason('');
                                  }} className="px-2 py-1 bg-red-600 text-white rounded-lg text-[8px] font-black">✓</button>
                                  <button onClick={() => { setVoidingId(null); setVoidReason(''); }}
                                    className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[8px] font-black">✕</button>
                                </div>
                              ) : (
                                <button onClick={() => { setVoidingId(exp.id); setVoidReason(''); }}
                                  className="px-2 py-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-500 rounded-lg text-[8px] font-black uppercase transition-all">
                                  Anular
                                </button>
                              )
                            )}
                            {exp.status === 'VOID' && exp.voidReason && (
                              <span className="text-[8px] text-slate-400 font-bold">{exp.voidReason}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal Pago Nómina */}
      {showPayrollModal && (() => {
        const totalCxcDesc = Object.entries(payrollCxcInvoices)
          .filter(([,sel]) => sel)
          .reduce((s, [id]) => s + (parseFloat(payrollCxcAbonos[id] || '0') || 0), 0);
        const cxcUSDCalc = totalCxcDesc > 0 ? totalCxcDesc : payrollCxcUSD;
        const netoCalc = Math.max(0, payrollSalaryNum - cxcUSDCalc);
        const pendCalc = Math.max(0, netoCalc - payrollTotalPaid);
        const payrollHasInsufficientBalance = payrollLines.some(l => {
          if (!l.bankId) return false;
          const balCurr = (l.method === 'cash_usd' || l.method === 'zelle') ? 'USD' : 'VES';
          const balKey = bankBalanceMapKey(l.bankId, l.accountId, balCurr);
          const bal = payrollBankBalances.get(balKey);
          if (!bal || bal.loading || bal.error) return false;
          const lineAmt = l.currency === 'BS' ? (parseFloat(l.amountBS) || 0) : (parseFloat(l.amountUSD) || 0);
          return lineAmt > 0 && lineAmt > bal.balance;
        });
        const payrollInsufficientLine = payrollLines.find(l => {
          if (!l.bankId) return false;
          const balCurr = (l.method === 'cash_usd' || l.method === 'zelle') ? 'USD' : 'VES';
          const balKey = bankBalanceMapKey(l.bankId, l.accountId, balCurr);
          const bal = payrollBankBalances.get(balKey);
          if (!bal || bal.loading || bal.error) return false;
          const lineAmt = l.currency === 'BS' ? (parseFloat(l.amountBS) || 0) : (parseFloat(l.amountUSD) || 0);
          return lineAmt > 0 && lineAmt > bal.balance;
        });
        return (
          <div className="fixed inset-0 z-[600] bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-6 overflow-hidden border border-slate-100">

              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* Avatar del empleado seleccionado */}
                  <div className="shrink-0">
                    {payrollSelectedUser?.photoURL ? (
                      <img src={payrollSelectedUser.photoURL} alt={payrollSelectedUser.name}
                        className="w-14 h-14 rounded-2xl object-cover border-2 border-emerald-400/40 shadow-lg"/>
                    ) : (
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 border-white/10 text-2xl font-black
                        ${payrollSelectedUser?.companyRole === 'SOCIO' ? 'bg-violet-900/60 text-violet-300' : 'bg-emerald-900/60 text-emerald-300'}`}>
                        {payrollSelectedUser ? payrollSelectedUser.name.charAt(0) : <Users className="w-6 h-6 text-slate-500"/>}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-black text-lg text-white tracking-tight">
                        {payrollSelectedUser ? payrollSelectedUser.name : 'Pago de Nómina'}
                      </h3>
                      {payrollSelectedUser && (
                        <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest
                          ${payrollSelectedUser.companyRole === 'SOCIO' ? 'bg-violet-500/30 text-violet-300' : 'bg-emerald-500/30 text-emerald-300'}`}>
                          {payrollSelectedUser.companyRole}
                        </span>
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                      {payrollSelectedUser?.cedula ? `CI/RIF: ${payrollSelectedUser.cedula} · ` : ''}Nómina · Multi-método · Cruce CxC
                    </p>
                  </div>
                </div>
                <button onClick={closePayrollModal} className="p-2 hover:bg-white/10 rounded-xl transition-all shrink-0">
                  <X className="w-4 h-4 text-slate-300"/>
                </button>
              </div>

              <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">

                {/* Fila 1: Persona + Período */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Empleado / Socio *</label>
                    <div className="relative">
                      {/* Input buscador */}
                      <div className="flex items-center gap-2 border border-slate-200 rounded-2xl px-3 py-2.5 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100 transition-all bg-white">
                        {payrollSelectedUser?.photoURL ? (
                          <img src={payrollSelectedUser.photoURL} alt="" className="w-6 h-6 rounded-lg object-cover shrink-0"/>
                        ) : payrollSelectedUser ? (
                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0
                            ${payrollSelectedUser.companyRole === 'SOCIO' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {payrollSelectedUser.name.charAt(0)}
                          </div>
                        ) : (
                          <Users className="w-4 h-4 text-slate-300 shrink-0"/>
                        )}
                        <input
                          type="text"
                          value={payrollEmpSearch}
                          onChange={e => { setPayrollEmpSearch(e.target.value); setPayrollEmpOpen(true); if (!e.target.value) { setPayrollEmpId(''); setPayrollCxcInvoices({}); setPayrollCxcAbonos({}); setPayrollCxcAmount(''); } }}
                          onFocus={() => setPayrollEmpOpen(true)}
                          placeholder={payrollSelectedUser ? payrollSelectedUser.name : 'Buscar por nombre o cédula...'}
                          className="flex-1 text-sm font-bold outline-none bg-transparent placeholder:text-slate-300 placeholder:font-normal"
                        />
                        {payrollSelectedUser && (
                          <button type="button" onClick={() => { setPayrollEmpId(''); setPayrollEmpSearch(''); setPayrollEmpOpen(false); setPayrollCxcInvoices({}); setPayrollCxcAbonos({}); setPayrollCxcAmount(''); }}
                            className="p-0.5 hover:bg-slate-100 rounded-lg transition-all">
                            <X className="w-3.5 h-3.5 text-slate-400"/>
                          </button>
                        )}
                      </div>
                      {/* Dropdown resultados */}
                      {payrollEmpOpen && (() => {
                        const q = payrollEmpSearch.toLowerCase().trim();
                        const filtered = payrollSystemUsers.filter(u =>
                          !q || u.name.toLowerCase().includes(q) || (u.cedula ?? '').toLowerCase().includes(q)
                        );
                        if (!filtered.length) return null;
                        return (
                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden max-h-52 overflow-y-auto">
                            {filtered.map(u => (
                              <button key={u.id} type="button"
                                onMouseDown={() => {
                                  setPayrollEmpId(u.id);
                                  setPayrollEmpSearch('');
                                  setPayrollEmpOpen(false);
                                  setPayrollCxcInvoices({});
                                  setPayrollCxcAbonos({});
                                  setPayrollCxcAmount('');
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50 transition-all text-left">
                                {u.photoURL ? (
                                  <img src={u.photoURL} alt="" className="w-8 h-8 rounded-xl object-cover shrink-0 border border-slate-100"/>
                                ) : (
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0
                                    ${u.companyRole === 'SOCIO' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {u.name.charAt(0)}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-black text-slate-900 truncate">{u.name}</p>
                                  {u.cedula && <p className="text-[10px] font-bold text-slate-400">CI: {u.cedula}</p>}
                                </div>
                                <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest shrink-0
                                  ${u.companyRole === 'SOCIO' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                  {u.companyRole}
                                </span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    {payrollSystemUsers.length === 0 && (
                      <p className="text-[10px] text-amber-600 font-bold mt-1">Sin empleados/socios. Asigna el rol en Seguridad.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Período *</label>
                    <input
                      type="text" value={payrollPeriod}
                      onChange={e => setPayrollPeriod(e.target.value)}
                      placeholder="Ej. Abril Q2 2026"
                      className="w-full border border-slate-200 rounded-2xl px-4 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                    />
                  </div>
                </div>

                {/* Sueldo Pactado */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Sueldo Pactado USD *</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                    <input
                      type="number" min="0" step="0.01" value={payrollSalary}
                      onChange={e => setPayrollSalary(e.target.value)}
                      className="w-full border border-slate-200 rounded-2xl pl-8 pr-4 py-2.5 text-sm font-black outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                    />
                  </div>
                </div>

                {/* Descuentos CxC — Facturas pendientes */}
                <div className="border border-amber-100 rounded-2xl overflow-hidden">
                  <div className="bg-amber-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-amber-400"/>
                      <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest">Descuento CxC</p>
                    </div>
                    {payrollUserAREntries.length > 0 && (
                      <span className="bg-amber-200 text-amber-800 text-[9px] font-black px-2 py-0.5 rounded-full">
                        {payrollUserAREntries.length} factura{payrollUserAREntries.length > 1 ? 's' : ''} pendiente{payrollUserAREntries.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    {!payrollSelectedUser && (
                      <p className="text-[10px] text-slate-400 font-bold text-center py-2">Selecciona un empleado/socio para ver sus CxC</p>
                    )}
                    {payrollSelectedUser && !payrollSelectedUser.cedula && (
                      <p className="text-[10px] text-amber-600 font-bold">Este usuario no tiene cédula/RIF. Agrégala en Seguridad para vincular CxC.</p>
                    )}
                    {payrollSelectedUser?.cedula && payrollUserAREntries.length === 0 && (
                      <p className="text-[10px] text-slate-400 font-bold text-center py-2">Sin facturas CxC pendientes para este usuario.</p>
                    )}
                    {payrollUserAREntries.length > 0 && (
                      <div className="space-y-2">
                        {payrollUserAREntries.map(entry => {
                          const isSelected = !!payrollCxcInvoices[entry.id];
                          const maxAbono = entry.balanceUSD ?? 0;
                          const abonoStr = payrollCxcAbonos[entry.id] ?? '';
                          const abonoNum = parseFloat(abonoStr) || 0;
                          return (
                            <div key={entry.id} className={`rounded-2xl border transition-all ${isSelected ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-white'}`}>
                              <div className="flex items-center gap-3 px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={e => {
                                    const sel = e.target.checked;
                                    setPayrollCxcInvoices(prev => ({ ...prev, [entry.id]: sel }));
                                    if (sel && !payrollCxcAbonos[entry.id]) {
                                      setPayrollCxcAbonos(prev => ({ ...prev, [entry.id]: String(maxAbono.toFixed(2)) }));
                                    }
                                    if (!sel) {
                                      setPayrollCxcAbonos(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
                                    }
                                  }}
                                  className="rounded w-4 h-4 border-amber-300 text-amber-500 focus:ring-amber-300"
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black text-slate-700 uppercase">{entry.saleCorrelativo}</span>
                                    <span className="text-[9px] font-bold text-slate-400">Monto original: <span className="text-slate-600">${(entry.amountUSD ?? 0).toFixed(2)}</span></span>
                                    <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${(entry.balanceUSD ?? 0) > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                      Saldo: ${(entry.balanceUSD ?? 0).toFixed(2)}
                                    </span>
                                    <span className="text-[9px] font-bold text-amber-600 uppercase">{entry.status === 'PAID' ? 'Cobrado' : 'Pendiente'}</span>
                                  </div>
                                  <p className="text-[9px] text-slate-400 mt-0.5 truncate">{entry.description}</p>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="px-4 pb-3">
                                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Monto a abonar (máx ${maxAbono.toFixed(2)})</label>
                                  <div className="flex gap-2 items-center">
                                    <input
                                      type="number" min="0.01" step="0.01" max={maxAbono}
                                      value={abonoStr}
                                      onChange={e => setPayrollCxcAbonos(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                      className="w-36 border border-amber-200 rounded-xl px-3 py-1.5 text-sm font-black outline-none focus:border-amber-400 transition-all"
                                    />
                                    <button type="button"
                                      onClick={() => setPayrollCxcAbonos(prev => ({ ...prev, [entry.id]: String(maxAbono.toFixed(2)) }))}
                                      className="text-[9px] font-black text-amber-600 hover:text-amber-800 uppercase tracking-widest transition-all">
                                      Pago total
                                    </button>
                                    {abonoNum > 0 && abonoNum < maxAbono && (
                                      <span className="text-[9px] text-slate-400 font-bold">Pendiente tras abono: ${(maxAbono - abonoNum).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                        <div className="flex justify-between items-center pt-1 px-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total descuento CxC seleccionado</p>
                          <p className="text-base font-black text-amber-700 font-mono">${totalCxcDesc.toFixed(2)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-slate-50 rounded-2xl p-3 text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Pactado</p>
                    <p className="text-base font-black text-slate-900 font-mono">${payrollSalaryNum.toFixed(2)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-3 text-center">
                    <p className="text-[8px] font-black text-amber-500 uppercase tracking-widest mb-1">Desc. CxC</p>
                    <p className="text-base font-black text-amber-700 font-mono">${cxcUSDCalc.toFixed(2)}</p>
                  </div>
                  <div className="bg-emerald-50 rounded-2xl p-3 text-center">
                    <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1">Neto a Pagar</p>
                    <p className="text-base font-black text-emerald-700 font-mono">${netoCalc.toFixed(2)}</p>
                  </div>
                  <div className={`rounded-2xl p-3 text-center ${pendCalc > 0 ? 'bg-red-50' : 'bg-slate-50'}`}>
                    <p className={`text-[8px] font-black uppercase tracking-widest mb-1 ${pendCalc > 0 ? 'text-red-400' : 'text-slate-400'}`}>Pendiente</p>
                    <p className={`text-base font-black font-mono ${pendCalc > 0 ? 'text-red-600' : 'text-slate-900'}`}>${pendCalc.toFixed(2)}</p>
                  </div>
                </div>

                {/* Líneas de pago */}
                <div className="border border-slate-100 rounded-2xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"/>
                      <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Líneas de pago</p>
                    </div>
                    <button type="button"
                      onClick={() => setPayrollLines(prev => [...prev, { method: 'cash_usd', bankId: '', accountId: '', currency: 'USD', amountUSD: '', amountBS: '', rate: '', ref: '' }])}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all">
                      <Plus className="w-3 h-3"/> Línea
                    </button>
                  </div>
                  <div className="p-4 space-y-3">
                    {payrollLines.map((line, idx) => {
                      const isCashLine = line.method === 'cash_usd' || line.method === 'cash_ves';
                      const isUSDMethod = line.method === 'cash_usd' || line.method === 'zelle';
                      const lineBankOpts = isCashLine ? [] : activeBanks.filter((b: any) => {
                        const sm = Array.isArray(b?.supportedMethods) ? b.supportedMethods : [];
                        return sm.length === 0 || sm.includes(line.method);
                      });
                      const lineSelBank = lineBankOpts.find((b: any) => String(b.id) === line.bankId);
                      const lineAccCurr = isUSDMethod ? 'USD' : 'VES';
                      const lineAccOpts = lineSelBank
                        ? (() => { const ac = Array.isArray(lineSelBank.accounts) ? lineSelBank.accounts : []; const m = ac.filter((a: any) => String(a?.currency ?? '').toUpperCase() === lineAccCurr); return m.length > 0 ? m : ac; })()
                        : [];
                      const lineRateNum = parseFloat(line.rate) || exchangeRate || 1;
                      const lineAmtUSD = parseFloat(line.amountUSD) || 0;
                      const lineAmtBS = parseFloat(line.amountBS) || 0;
                      return (
                        <div key={idx} className="rounded-2xl border border-slate-200 p-4 bg-white space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Línea {idx + 1}</span>
                            {payrollLines.length > 1 && (
                              <button type="button" onClick={() => setPayrollLines(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 text-red-300 hover:text-red-500 transition-all rounded-lg hover:bg-red-50">
                                <X className="w-3.5 h-3.5"/>
                              </button>
                            )}
                          </div>
                          {/* Método */}
                          <select value={line.method}
                            onChange={e => {
                              const m = e.target.value;
                              const isUSD = m === 'cash_usd' || m === 'zelle';
                              setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, method: m, bankId: '', accountId: '', currency: isUSD ? 'USD' : 'BS', amountUSD: '', amountBS: '' } : l));
                            }}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 bg-white">
                            {Object.entries(EXPENSE_PAY_METHODS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                          {/* Banco + Cuenta */}
                          {isCashLine ? (
                            <div className="bg-slate-50 rounded-xl px-3 py-2 flex items-center gap-2">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Banco:</span>
                              <span className="text-sm font-black text-slate-700">{line.method === 'cash_usd' ? 'Efectivo USD (Caja)' : 'Efectivo Bs (Caja)'}</span>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Banco</p>
                                <select value={line.bankId}
                                  onChange={e => {
                                    const bid = e.target.value;
                                    const bank = lineBankOpts.find((b: any) => String(b.id) === bid);
                                    setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, bankId: bid, accountId: '' } : l));
                                    void bank;
                                  }}
                                  className="w-full border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:border-emerald-500 bg-white">
                                  <option value="">Seleccionar...</option>
                                  {lineBankOpts.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                                {lineBankOpts.length === 0 && <p className="text-[9px] text-amber-600 font-bold mt-1">Sin bancos para este método</p>}
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cuenta</p>
                                <select value={line.accountId}
                                  onChange={e => setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, accountId: e.target.value } : l))}
                                  disabled={!line.bankId}
                                  className="w-full border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:border-emerald-500 bg-white disabled:opacity-50">
                                  <option value="">Cuenta...</option>
                                  {lineAccOpts.map((a: any) => <option key={a.id} value={a.id}>{a.label}{a.accountNumber ? ` ···${a.accountNumber.slice(-4)}` : ''}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                          {/* Saldo disponible del banco seleccionado */}
                          {line.bankId && (() => {
                            const balCurr = (line.method === 'cash_usd' || line.method === 'zelle') ? 'USD' : 'VES';
                            const balKey = bankBalanceMapKey(line.bankId, line.accountId, balCurr);
                            const bal = payrollBankBalances.get(balKey);
                            const lineAmt = line.currency === 'BS'
                              ? parseFloat(line.amountBS) || 0
                              : parseFloat(line.amountUSD) || 0;
                            const exceeds = bal && !bal.loading && lineAmt > 0 && lineAmt > bal.balance;
                            if (!bal) return null;
                            return (
                              <div className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-black ${exceeds ? 'bg-red-50 border border-red-200' : 'bg-slate-50 border border-slate-100'}`}>
                                <span className={exceeds ? 'text-red-500' : 'text-slate-400'}>
                                  Saldo disponible ({balCurr})
                                </span>
                                {bal.loading ? (
                                  <span className="text-slate-300 animate-pulse">Consultando...</span>
                                ) : bal.error ? (
                                  <span className="text-amber-500">Sin datos</span>
                                ) : (
                                  <span className={exceeds ? 'text-red-600' : 'text-emerald-600'}>
                                    {balCurr === 'VES'
                                      ? `Bs ${bal.balance.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                                      : `$${bal.balance.toFixed(2)}`}
                                    {exceeds && <span className="ml-2 text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-widest">Insuficiente</span>}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {/* Moneda + Montos + Tasa */}
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Moneda</p>
                              <select value={line.currency}
                                onChange={e => setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, currency: e.target.value as 'USD'|'BS', amountUSD: '', amountBS: '' } : l))}
                                disabled={isUSDMethod || line.method === 'cash_ves'}
                                className="w-full border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold outline-none focus:border-emerald-500 bg-white disabled:opacity-60">
                                <option value="USD">USD $</option>
                                <option value="BS">Bs</option>
                              </select>
                            </div>
                            {line.currency === 'BS' && (
                              <div>
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Tasa Bs/$</p>
                                <input type="number" min="1" step="0.01" value={line.rate}
                                  onChange={e => {
                                    const r = e.target.value;
                                    const rn = parseFloat(r) || 1;
                                    setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: r, amountUSD: l.amountBS ? String((parseFloat(l.amountBS) / rn).toFixed(2)) : '' } : l));
                                  }}
                                  placeholder={String(exchangeRate)}
                                  className="w-full border border-slate-200 rounded-xl px-2 py-2 text-xs font-black outline-none focus:border-emerald-500"/>
                              </div>
                            )}
                          </div>
                          {line.currency === 'BS' ? (
                            <div className="space-y-2">
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto Bs *</p>
                                  <input type="number" min="0" step="0.01" value={line.amountBS}
                                    onChange={e => {
                                      const bs = e.target.value;
                                      const rn = parseFloat(line.rate) || exchangeRate || 1;
                                      const usd = parseFloat(bs) ? String((parseFloat(bs) / rn).toFixed(2)) : '';
                                      setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, amountBS: bs, amountUSD: usd } : l));
                                    }}
                                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-black outline-none focus:border-emerald-500"/>
                                </div>
                                <button type="button"
                                  title="Calcular Bs equivalente al pendiente"
                                  onClick={() => {
                                    const rn = parseFloat(line.rate) || exchangeRate || 1;
                                    const paidOthers = payrollLines.filter((_, i) => i !== idx).reduce((s, l) => s + (parseFloat(l.amountUSD) || 0), 0);
                                    const pendUSD = Math.max(0, netoCalc - paidOthers);
                                    const bsCalc = (pendUSD * rn).toFixed(2);
                                    setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, amountBS: bsCalc, amountUSD: String(pendUSD.toFixed(2)) } : l));
                                  }}
                                  className="shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap">
                                  = Bs Pend.
                                </button>
                              </div>
                              {lineAmtBS > 0 && (
                                <div className="bg-emerald-50 rounded-xl px-3 py-2 flex items-center justify-between">
                                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Equivale a USD</span>
                                  <span className="text-sm font-black text-emerald-700">${(lineAmtBS / lineRateNum).toFixed(2)}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Monto USD *</p>
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
                                  <input type="number" min="0" step="0.01" value={line.amountUSD}
                                    onChange={e => setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, amountUSD: e.target.value } : l))}
                                    className="w-full border border-slate-200 rounded-xl pl-6 pr-3 py-2 text-sm font-black outline-none focus:border-emerald-500"/>
                                </div>
                                <button type="button"
                                  title="Completar con el pendiente"
                                  onClick={() => {
                                    const paidOthers = payrollLines.filter((_, i) => i !== idx).reduce((s, l) => s + (parseFloat(l.amountUSD) || 0), 0);
                                    const pendUSD = Math.max(0, netoCalc - paidOthers);
                                    setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, amountUSD: String(pendUSD.toFixed(2)) } : l));
                                  }}
                                  className="shrink-0 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap">
                                  = Pend.
                                </button>
                              </div>
                            </div>
                          )}
                          {/* Referencia */}
                          <div>
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Referencia / Nº Op.</p>
                            <input type="text" value={line.ref}
                              onChange={e => setPayrollLines(prev => prev.map((l, i) => i === idx ? { ...l, ref: e.target.value } : l))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-emerald-500"/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Observación */}
                <div>
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Observación</label>
                  <textarea value={payrollObservation}
                    onChange={e => setPayrollObservation(e.target.value)}
                    placeholder="Comentarios sobre este pago de nómina (opcional)..."
                    rows={2}
                    className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold outline-none focus:border-emerald-500 resize-none transition-all"/>
                </div>

                {payrollError && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-4 py-3 rounded-2xl">
                    <X className="w-3.5 h-3.5 text-red-500 shrink-0"/>
                    <p className="text-[10px] text-red-600 font-bold">{payrollError}</p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-100">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total pagado</p>
                  <p className="text-xl font-black text-emerald-700 font-mono">${payrollTotalPaid.toFixed(2)}</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={closePayrollModal}
                    className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                    Cancelar
                  </button>
                  <button
                    disabled={payrollSubmitting || !payrollEmpId || !payrollSalary || payrollSalaryNum <= 0 || payrollTotalPaid <= 0 || payrollHasInsufficientBalance}
                    onClick={async () => {
                      if (!payrollEmpId || payrollSalaryNum <= 0) { setPayrollError('Selecciona persona y sueldo pactado.'); return; }
                      if (payrollTotalPaid <= 0) { setPayrollError('Agrega al menos una línea de pago con monto.'); return; }
                      if (payrollInsufficientLine) {
                        const insCurr = (payrollInsufficientLine.method === 'cash_usd' || payrollInsufficientLine.method === 'zelle') ? 'USD' : 'VES';
                        const balKey = bankBalanceMapKey(payrollInsufficientLine.bankId, payrollInsufficientLine.accountId, insCurr);
                        const bal = payrollBankBalances.get(balKey);
                        const currency = payrollInsufficientLine.currency === 'BS' ? 'Bs' : 'USD';
                        const requested = payrollInsufficientLine.currency === 'BS' ? (parseFloat(payrollInsufficientLine.amountBS) || 0).toFixed(2) : (parseFloat(payrollInsufficientLine.amountUSD) || 0).toFixed(2);
                        const available = bal ? bal.balance.toFixed(2) : '0.00';
                        setPayrollError(`Saldo insuficiente. Línea: ${payrollInsufficientLine.method.toUpperCase()} · ${currency} ${requested} > Disponible ${currency} ${available}. Reduce el monto o cambia de cuenta.`);
                        return;
                      }
                      const user = payrollSystemUsers.find(u => u.id === payrollEmpId);
                      if (!user) return;
                      setPayrollSubmitting(true); setPayrollError('');
                      try {
                        const primaryLine = payrollLines.find(l => parseFloat(l.amountUSD) > 0);
                        const cxcLines = Object.entries(payrollCxcInvoices)
                          .filter(([,sel]) => sel)
                          .map(([id]) => ({ id, abono: parseFloat(payrollCxcAbonos[id] || '0') || 0 }))
                          .filter(x => x.abono > 0);
                        const totalCxcAbono = cxcLines.reduce((s, x) => s + x.abono, 0);
                        const description = [
                          `Pago de nómina · ${user.name} · ${user.companyRole}`,
                          payrollPeriod ? `Período: ${payrollPeriod}` : '',
                          totalCxcAbono > 0 ? `Cruce CxC: $${totalCxcAbono.toFixed(2)}` : '',
                          payrollObservation || ''
                        ].filter(Boolean).join(' | ');
                        await dataService.addExpense({
                          description,
                          amountUSD: payrollTotalPaid,
                          category: 'NOMINA' as any,
                          supplier: user.name,
                          paymentMethod: (primaryLine?.method || undefined) as any,
                          reference: primaryLine?.ref || undefined
                        });
                        for (const { id, abono } of cxcLines) {
                          await (dataService as any).registerARPaymentWithSupport(id, abono, {
                            method: 'NOMINA_CXC',
                            note: `Abono CxC vía nómina · ${user.name}${payrollPeriod ? ' · ' + payrollPeriod : ''}`,
                            reference: primaryLine?.ref || ''
                          });
                        }
                        closePayrollModal();
                      } catch (e: any) {
                        setPayrollError(e?.message ?? 'Error al registrar.');
                      } finally {
                        setPayrollSubmitting(false);
                      }
                    }}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    {payrollSubmitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin"/> Procesando...</> : <><Check className="w-3.5 h-3.5"/> Registrar Pago</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {activeSubTab === 'ledger' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-10 border-b bg-[#f8fafc]/50">
              <div className="flex flex-col lg:flex-row lg:justify-between gap-4 mb-4">
                <div>
                  <h3 className="font-headline font-black text-2xl tracking-tighter uppercase text-slate-900">Libro Mayor Analítico</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Por cuenta contable: debe, haber y saldo acumulado (Supabase)</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      reportService.exportMayorCuentaToPDF(mayorRows, {
                        fechaDesde: ledgerDateRange.start,
                        fechaHasta: ledgerDateRange.end,
                        cuentaCodigo: ledgerAccountFilter
                      })
                    }
                    className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/10"
                  >
                    <Download className="w-4 h-4" /> PDF Mayor (cuentas)
                  </button>
                  <button
                    type="button"
                    onClick={() => reportService.exportLedgerToPDF()}
                    className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-800 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 border border-slate-200"
                  >
                    <Download className="w-4 h-4" /> PDF Resumen I/E
                  </button>
                </div>
              </div>
              <div className="flex flex-col xl:flex-row xl:items-end gap-4">
                <div className="flex items-center gap-1 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200 w-fit">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  <input
                    type="date"
                    value={ledgerDateRange.start}
                    onChange={(e) => {
                      setLedgerDateRange((p) => ({ ...p, start: e.target.value }));
                      setLedgerPage(0);
                    }}
                    className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32"
                  />
                  <span className="text-slate-300 text-[10px]">—</span>
                  <input
                    type="date"
                    value={ledgerDateRange.end}
                    onChange={(e) => {
                      setLedgerDateRange((p) => ({ ...p, end: e.target.value }));
                      setLedgerPage(0);
                    }}
                    className="bg-transparent border-0 text-[10px] font-black text-slate-700 focus:ring-0 w-32"
                  />
                </div>
                <div className="flex flex-col gap-1 min-w-0 max-w-md">
                  <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">Cuenta contable</span>
                  <select
                    value={ledgerAccountFilter}
                    onChange={(e) => {
                      setLedgerAccountFilter(e.target.value);
                      setLedgerPage(0);
                    }}
                    className="w-full text-[10px] font-black text-slate-800 border border-slate-200 rounded-xl px-3 py-2 bg-white"
                  >
                    <option value="">Todas las cuentas</option>
                    {cuentaOptionsMayor.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} — {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[8px] font-black uppercase text-slate-400 border-b">
                    <th className="px-4 py-4 lg:px-8">Cuenta</th>
                    <th className="px-4 py-4 hidden md:table-cell">Nombre</th>
                    <th className="px-4 py-4">Fecha</th>
                    <th className="px-4 py-4">Tipo op.</th>
                    <th className="px-4 py-4 min-w-[160px]">Descripción (asiento)</th>
                    <th className="px-4 py-4 text-right">Debe</th>
                    <th className="px-4 py-4 text-right">Haber</th>
                    <th className="px-4 py-4 text-right">Saldo acum.</th>
                  </tr>
                </thead>
                <tbody className="text-[10px]">
                  {mayorLoading ? (
                    <tr>
                      <td colSpan={8} className="p-16 text-center text-slate-400 font-bold">
                        <Loader2 className="w-6 h-6 inline animate-spin mr-2" /> Cargando mayor por cuenta…
                      </td>
                    </tr>
                  ) : mayorRows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center text-slate-400 font-bold leading-relaxed max-w-2xl mx-auto">
                        No hay movimientos contables con el filtro indicado, o aún no existe la función{' '}
                        <code className="text-slate-600">public.mayor_por_cuenta_saldo</code> en Supabase. Ejecute el script{' '}
                        <code className="text-slate-600">Comandos Base de datos/RPC mayor_por_cuenta_saldo.sql</code>.
                      </td>
                    </tr>
                  ) : (
                    mayorRows
                      .slice(ledgerPage * FIN_PAGE_SIZE, (ledgerPage + 1) * FIN_PAGE_SIZE)
                      .map((r, idx) => (
                        <tr key={`${r.asientoId}-${r.lineNumber}-${idx}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3 lg:px-8 font-mono font-bold text-slate-700">{r.cuentaContableCodigo}</td>
                          <td className="px-4 py-3 hidden md:table-cell text-slate-500 uppercase text-[9px]">{r.cuentaContableNombre}</td>
                          <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{r.fecha.toLocaleString('es-VE')}</td>
                          <td className="px-4 py-3 font-bold text-slate-500 text-[9px]">{r.tipoOperacion || '—'}</td>
                          <td className="px-4 py-3 text-slate-800 uppercase text-[9px]">{r.descripcionAsiento || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">{r.debe > 0 ? r.debe.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '—'}</td>
                          <td className="px-4 py-3 text-right font-mono text-slate-700">{r.haber > 0 ? r.haber.toLocaleString('es-VE', { minimumFractionDigits: 2 }) : '—'}</td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{r.saldoAcumulado.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
            {!mayorLoading && mayorRows.length > FIN_PAGE_SIZE && (
              <div className="px-6 lg:px-10 py-4 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase">
                  {ledgerPage * FIN_PAGE_SIZE + 1}–{Math.min((ledgerPage + 1) * FIN_PAGE_SIZE, mayorRows.length)} de {mayorRows.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLedgerPage((p) => Math.max(0, p - 1))}
                    disabled={ledgerPage === 0}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerPage((p) => p + 1)}
                    disabled={(ledgerPage + 1) * FIN_PAGE_SIZE >= mayorRows.length}
                    className="p-2 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
            <div className="p-8 lg:p-10 bg-slate-50/30 border-t flex flex-col sm:flex-row flex-wrap justify-end gap-6">
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Suma Debe (filtro)</p>
                <p className="text-xl font-black font-headline text-slate-800">
                  {mayorRows.reduce((a, r) => a + r.debe, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="text-right sm:border-l sm:pl-6">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Suma Haber (filtro)</p>
                <p className="text-xl font-black font-headline text-slate-800">
                  {mayorRows.reduce((a, r) => a + r.haber, 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b bg-slate-50/30">
              <h4 className="font-headline font-black text-sm uppercase text-slate-700">Vista resumen (operativa)</h4>
              <p className="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-widest">
                Mismo periodo y filtros que el mayor: un renglón por asiento (monto = parte mayor entre total debe y total haber del asiento), clasificado ingreso/egreso. No sustituye el mayor analítico por cuenta.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50 text-[8px] font-black uppercase text-slate-400 border-b">
                    <th className="px-6 py-4">Fecha / Hora</th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Categoría</th>
                    <th className="px-6 py-4">Descripción</th>
                    <th className="px-6 py-4 text-right">Monto (USD)</th>
                  </tr>
                </thead>
                <tbody className="text-[11px]">
                  {operationalLedgerView.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-12 text-center opacity-30 font-black uppercase text-xs">
                        Sin movimientos en resumen
                      </td>
                    </tr>
                  ) : (
                    operationalLedgerView.map((entry, idx) => (
                      <tr key={idx} className="border-b border-slate-50">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-500">{entry.timestamp.toLocaleDateString()}</div>
                          <div className="text-[9px] text-slate-300 font-mono uppercase">
                            {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`px-2 py-1 rounded-full text-[8px] font-black uppercase ${
                              entry.type === 'INCOME' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {entry.type === 'INCOME' ? 'Ingreso' : 'Egreso'}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-slate-400 uppercase text-[9px]">{entry.category}</td>
                        <td className="px-6 py-4 text-slate-800 uppercase text-[9px]">{entry.description}</td>
                        <td
                          className={`px-6 py-4 text-right font-black text-[12px] ${
                            entry.type === 'INCOME' ? 'text-emerald-700' : 'text-red-600'
                          }`}
                        >
                          {entry.type === 'INCOME' ? '+' : '-'} $ {entry.amountUSD.toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="p-6 bg-slate-50/20 border-t flex flex-wrap justify-end gap-6">
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase">Total ingresos (filtro fechas resumen)</p>
                <p className="text-lg font-black text-emerald-600">
                  $ {operationalLedgerView.filter((e: any) => e.type === 'INCOME').reduce((a: number, b: any) => a + b.amountUSD, 0).toFixed(2)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase">Total egresos</p>
                <p className="text-lg font-black text-red-600">
                  $ {operationalLedgerView.filter((e: any) => e.type === 'EXPENSE').reduce((a: number, b: any) => a + b.amountUSD, 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'banks' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="lg:col-span-5 bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-slate-50/30 flex justify-between items-center">
              <h4 className="font-headline font-black text-md">Bancos Registrados</h4>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowManualTxModal(true)}
                  className="flex items-center gap-1 px-3 py-2 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase hover:bg-blue-700 transition-all">
                  <Plus className="w-3 h-3" /> Movimiento Manual
                </button>
                <button onClick={resetBankForm}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase">Nuevo</button>
              </div>
            </div>
            <div className="p-4 space-y-2">
              {banks.length === 0 ? (
                <div className="p-10 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">Sin bancos</div>
              ) : (
                banks.map((b: any) => {
                  const analytics = getBankAnalytics(b.id, b);
                  const prof = analytics.currencyProfile ?? 'UNKNOWN';
                  const usdLive = bankWideBalances.get(bankBalanceMapKey(String(b.id), '', 'USD'));
                  const vesLive = bankWideBalances.get(bankBalanceMapKey(String(b.id), '', 'VES'));
                  const balanceUSD =
                    usdLive && !usdLive.loading && !usdLive.error ? usdLive.balance : analytics.balanceUSD;
                  const balanceVES =
                    vesLive && !vesLive.loading && !vesLive.error ? vesLive.balance : analytics.balanceVES;
                  return (
                    <div
                      key={b.id}
                      className={`w-full text-left p-4 rounded-2xl border transition-all ${editingBankId === b.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-100 hover:bg-slate-50'}`}
                    >
                      <div className="flex justify-between items-center gap-3">
                        <button onClick={() => loadBankToForm(b.id)} className="flex-1 text-left">
                          <div className="flex justify-between items-center">
                            <div className="font-black uppercase text-slate-900">{b.name}</div>
                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${b.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.active !== false ? 'Activo' : 'Inactivo'}</span>
                          </div>
                          <div className="text-[9px] text-slate-400 font-mono mt-1">{(b.accounts || []).length} cuentas • {posTerminals.filter((t: any) => String(t?.bankId ?? '') === String(b.id ?? '')).length} POS • {(b.supportedMethods || []).length} métodos</div>
                          
                          {/* Mayor analítico: bancos solo-USD (Zelle, Efectivo USD, etc.) sin saldo equivalente en Bs */}
                          <div className="mt-3 p-3 bg-slate-50 rounded-xl space-y-2">
                            {prof === 'USD_ONLY' && (
                              <div>
                                <div className="text-slate-400 uppercase tracking-wider text-[10px]">Saldo (USD)</div>
                                <div className={`font-black text-[13px] ${balanceUSD >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {usdLive?.loading ? (
                                    <span className="text-slate-400 animate-pulse text-[11px]">Actualizando…</span>
                                  ) : (
                                    usd(balanceUSD, 2)
                                  )}
                                </div>
                                <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Cuentas en dólares — sin Bs</div>
                              </div>
                            )}
                            {prof === 'VES_ONLY' && (
                              <div>
                                <div className="text-slate-400 uppercase tracking-wider text-[10px]">Saldo (Bs)</div>
                                <div className={`font-black text-[13px] ${balanceVES >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {vesLive?.loading ? (
                                    <span className="text-slate-400 animate-pulse text-[11px]">Actualizando…</span>
                                  ) : (
                                    bs(balanceVES, 2)
                                  )}
                                </div>
                                <div className="text-[8px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">Cuentas en bolívares — sin USD</div>
                              </div>
                            )}
                            {(prof === 'MIXED' || prof === 'UNKNOWN') && (
                              <div className="grid grid-cols-2 gap-3 text-[10px]">
                                <div>
                                  <div className="text-slate-400 uppercase tracking-wider">Saldo USD</div>
                                  <div className={`font-black ${balanceUSD >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {usdLive?.loading ? (
                                      <span className="text-slate-400 animate-pulse">…</span>
                                    ) : (
                                      `$${fmt(balanceUSD, 2)}`
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-slate-400 uppercase tracking-wider">Saldo Bs</div>
                                  <div className={`font-black ${balanceVES >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {vesLive?.loading ? (
                                      <span className="text-slate-400 animate-pulse">…</span>
                                    ) : (
                                      bs(balanceVES, 2)
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="grid grid-cols-3 gap-2 text-[9px] text-slate-500">
                              {prof === 'VES_ONLY' ? (
                                <>
                                  <div>
                                    <div className="uppercase">Ingresos</div>
                                    <div className="font-bold text-emerald-600">{bs(analytics.totalInVES, 2)}</div>
                                  </div>
                                  <div>
                                    <div className="uppercase">Egresos</div>
                                    <div className="font-bold text-red-600">{bs(analytics.totalOutVES, 2)}</div>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <div className="uppercase">Ingresos</div>
                                    <div className="font-bold text-emerald-600">${fmt(analytics.totalInUSD, 2)}</div>
                                  </div>
                                  <div>
                                    <div className="uppercase">Egresos</div>
                                    <div className="font-bold text-red-600">${fmt(analytics.totalOutUSD, 2)}</div>
                                  </div>
                                </>
                              )}
                              <div>
                                <div className="uppercase">Movs</div>
                                <div className="font-bold">{analytics.transactionCount}</div>
                              </div>
                            </div>
                            {prof === 'MIXED' && (analytics.totalInVES + analytics.totalOutVES > 0.01) && (
                              <div className="text-[9px] text-slate-500 font-mono">
                                Flujo Bs: +{fmt(analytics.totalInVES, 2)} / −{fmt(Math.abs(analytics.totalOutVES), 2)}
                              </div>
                            )}
                            {analytics.lastTransaction && (
                              <div className="text-[8px] text-slate-400">
                                Último: {analytics.lastTransaction.toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={() => handleViewBankReport(b)}
                          className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all"
                          title="Reporte"
                        >
                          <FileText className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleViewBankTx(b)}
                          className="p-2 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                          title="Movimientos"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-7 bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-8 border-b bg-slate-50/30 flex justify-between items-center">
              <div>
                <h4 className="font-headline font-black text-md">{editingBankId ? 'Editar Banco' : 'Nuevo Banco'}</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Cuentas y métodos aceptados</p>
              </div>
              <div className="flex gap-2">
                {editingBankId && (
                  <button
                    onClick={handleDeleteBank}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase"
                  >Eliminar</button>
                )}
                <button
                  onClick={handleSaveBank}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase"
                >Guardar</button>
              </div>
            </div>

            <div className="p-8 space-y-6">
              {bankFormError && (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                  {bankFormError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Nombre del Banco</label>
                  <input
                    value={bankFormName}
                    onChange={(e) => setBankFormName(e.target.value)}
                    className="w-full mt-1 bg-slate-100 rounded-xl p-4 text-[12px] font-black outline-none ring-1 ring-slate-100 focus:ring-emerald-500/20"
                    placeholder="Ej. BANESCO"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estado</label>
                  <select
                    value={bankFormActive ? '1' : '0'}
                    onChange={(e) => setBankFormActive(e.target.value === '1')}
                    className="w-full mt-1 bg-slate-100 rounded-xl p-4 text-[12px] font-black outline-none ring-1 ring-slate-100 focus:ring-emerald-500/20"
                  >
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Métodos que recibe</label>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                  {paymentMethodOptions.map(o => (
                    <button
                      key={o.id}
                      onClick={() => toggleMethod(o.id)}
                      className={`p-3 rounded-xl border text-left text-[10px] font-black uppercase transition-all ${bankFormMethods[o.id] ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center">
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cuentas</label>
                  <button
                    onClick={addAccountRow}
                    className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase"
                  >Agregar cuenta</button>
                </div>

                <div className="mt-3 space-y-3">
                  {bankAccounts.length === 0 ? (
                    <div className="p-6 text-center text-[10px] font-black uppercase tracking-widest opacity-30">Sin cuentas</div>
                  ) : bankAccounts.map(a => (
                    <div key={a.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/40 space-y-3">
                      <div className="flex justify-between items-center">
                        <div className="text-[10px] font-black uppercase text-slate-700">{a.label || 'Cuenta'}</div>
                        <button
                          onClick={() => removeAccountRow(a.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase text-slate-500"
                        >Quitar</button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Etiqueta</label>
                          <input value={a.label} onChange={(e) => updateAccountRow(a.id, { label: e.target.value })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Moneda</label>
                          <select value={a.currency} onChange={(e) => updateAccountRow(a.id, { currency: e.target.value as 'VES' | 'USD' })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200">
                            <option value="VES">Bs</option>
                            <option value="USD">USD</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nro. Cuenta</label>
                          <input value={a.accountNumber} onChange={(e) => updateAccountRow(a.id, { accountNumber: e.target.value })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Saldo inicial</label>
                          <input
                            type="number"
                            step="0.01"
                            value={a.openingBalance ?? ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateAccountRow(a.id, {
                                openingBalance: e.target.value === '' ? 0 : Number(e.target.value.replace(',', '.')) || 0
                              })
                            }
                            className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200"
                          />
                          <p className="text-[8px] text-slate-400 mt-1 font-bold uppercase tracking-wide">En {a.currency === 'USD' ? 'USD' : 'Bs'} al registrar la cuenta</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Titular</label>
                          <input value={a.holder || ''} onChange={(e) => updateAccountRow(a.id, { holder: e.target.value })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">RIF</label>
                          <input value={a.rif || ''} onChange={(e) => updateAccountRow(a.id, { rif: e.target.value })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Teléfono (PM)</label>
                          <input value={a.phone || ''} onChange={(e) => updateAccountRow(a.id, { phone: e.target.value })} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-6">
                <div className="flex justify-between items-center gap-4 flex-wrap">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Terminales POS</label>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Asocie cada terminal física a una cuenta bancaria</div>
                  </div>
                  <button
                    onClick={resetPOSTerminalForm}
                    className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase"
                  >Nueva terminal</button>
                </div>

                {!editingBankId ? (
                  <div className="mt-4 p-6 rounded-2xl bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                    Guarde primero el banco para poder registrar terminales POS.
                  </div>
                ) : (
                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-12 gap-4">
                    <div className="xl:col-span-5 space-y-3">
                      {posTerminalFormError && (
                        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                          {posTerminalFormError}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Nombre</label>
                          <input value={posTerminalName} onChange={(e) => setPosTerminalName(e.target.value)} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" placeholder="Ej. Caja Principal" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Serial</label>
                          <input value={posTerminalSerial} onChange={(e) => setPosTerminalSerial(e.target.value)} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" placeholder="Terminal / lote" />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Merchant ID</label>
                          <input value={posTerminalMerchantId} onChange={(e) => setPosTerminalMerchantId(e.target.value)} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200" placeholder="Afiliado" />
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Cuenta</label>
                          <select value={posTerminalAccountId} onChange={(e) => setPosTerminalAccountId(e.target.value)} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200">
                            <option value="">Seleccione</option>
                            {bankAccounts.map((a) => (
                              <option key={a.id} value={a.id}>{a.label} • {a.currency} • {a.accountNumber}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Métodos soportados</label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {paymentMethodOptions.filter((o) => o.id === 'debit' || o.id === 'biopago').map((o) => (
                            <button
                              key={o.id}
                              onClick={() => setPosTerminalMethodFlags(prev => ({ ...prev, [o.id]: !prev[o.id] }))}
                              className={`p-3 rounded-xl border text-left text-[10px] font-black uppercase transition-all ${posTerminalMethodFlags[o.id] ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Estado</label>
                          <select value={posTerminalActive ? '1' : '0'} onChange={(e) => setPosTerminalActive(e.target.value === '1')} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200">
                            <option value="1">Activa</option>
                            <option value="0">Inactiva</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Banco</label>
                          <input value={bankFormName} disabled className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[11px] font-black outline-none border border-slate-200 text-slate-500" />
                        </div>
                      </div>

                      <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Notas</label>
                        <textarea value={posTerminalNotes} onChange={(e) => setPosTerminalNotes(e.target.value)} className="w-full mt-1 bg-white rounded-xl p-3 text-[11px] font-bold outline-none border border-slate-200 min-h-[72px]" placeholder="Ubicación, caja, observaciones..." />
                      </div>

                      <div className="flex gap-2 justify-end">
                        {editingPOSTerminalId && (
                          <button onClick={handleDeletePOSTerminal} className="px-4 py-2 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase">Eliminar</button>
                        )}
                        <button onClick={handleSavePOSTerminal} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase">Guardar terminal</button>
                      </div>
                    </div>

                    <div className="xl:col-span-7 space-y-3">
                      {currentBankPOSTerminals.length === 0 ? (
                        <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">
                          Este banco aún no tiene terminales POS registradas.
                        </div>
                      ) : currentBankPOSTerminals.map((t: any) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => loadPOSTerminalToForm(t.id)}
                          className={`w-full text-left p-4 rounded-2xl border transition-all ${editingPOSTerminalId === t.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <div className="font-black uppercase text-slate-900">{t.name}</div>
                              <div className="text-[9px] text-slate-400 font-mono mt-1">{t.accountLabel} • {t.accountNumber || 'Sin cuenta'}</div>
                              <div className="text-[9px] text-slate-500 font-bold uppercase mt-2">{(t.supportedMethods || []).join(' • ') || 'Sin métodos'}</div>
                              {!!String(t.serial ?? '').trim() && (
                                <div className="text-[9px] text-slate-400 font-mono mt-1">Serial: {t.serial}</div>
                              )}
                            </div>
                            <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-full ${t.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{t.active !== false ? 'Activa' : 'Inactiva'}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {showBankTxModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-3 md:p-6 overflow-hidden">
          <div className="w-full max-w-5xl max-h-[92vh] bg-white rounded-[1.25rem] md:rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200 flex flex-col">
            <div className="sticky top-0 z-10 p-4 md:p-8 border-b bg-slate-50/95 backdrop-blur-sm flex justify-between items-start shrink-0">
              <div>
                <h4 className="font-headline font-black text-lg uppercase tracking-tight">Movimientos del Banco</h4>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {bankTxTarget ? String(bankTxTarget.name ?? '').toUpperCase() : ''}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowBankTxModal(false);
                  setBankTxTarget(null);
                  setBankTxList([]);
                  setBankTxError('');
                  setBankTxLoading(false);
                  setBankTxOpBal({ usd: null, ves: null, loading: false });
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase"
              >Cerrar</button>
            </div>

            <div className="p-4 md:p-8 overflow-y-auto min-h-0">
              {bankTxLoading ? (
                <div className="p-12 text-center opacity-40 font-black uppercase tracking-widest text-[10px]">Cargando...</div>
              ) : bankTxError ? (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                  {bankTxError}
                </div>
              ) : (
                <>
                  {bankTxModalProfile === 'USD_ONLY' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total USD</div>
                        <div className="text-2xl font-black font-mono text-emerald-700">
                          {usd(bankTxList.reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                        <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">Solo dólares</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Conciliado</div>
                        <div className="text-2xl font-black font-mono text-emerald-700">
                          {usd(bankTxList.filter((b: any) => b.reconciled).reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                        <div className="text-[9px] text-emerald-500 font-bold mt-1">{bankTxList.filter((b: any) => b.reconciled).length} / {bankTxList.length} movimientos</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-amber-600">Sin conciliar</div>
                        <div className="text-2xl font-black font-mono text-amber-700">
                          {usd(bankTxList.filter((b: any) => !b.reconciled).reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                      </div>
                    </div>
                  )}
                  {bankTxModalProfile === 'VES_ONLY' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Bs</div>
                        <div className="text-2xl font-black font-mono text-slate-900">
                          {bs(bankTxList.reduce((a: number, b: any) => a + Number(b.amountVES ?? 0), 0), 2)}
                        </div>
                      </div>
                      <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Conciliado (Bs)</div>
                        <div className="text-2xl font-black font-mono text-emerald-700">
                          {bs(bankTxList.filter((b: any) => b.reconciled).reduce((a: number, b: any) => a + Number(b.amountVES ?? 0), 0), 2)}
                        </div>
                        <div className="text-[9px] text-emerald-500 font-bold mt-1">{bankTxList.filter((b: any) => b.reconciled).length} / {bankTxList.length} movimientos</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-amber-600">Sin conciliar (Bs)</div>
                        <div className="text-2xl font-black font-mono text-amber-700">
                          {bs(bankTxList.filter((b: any) => !b.reconciled).reduce((a: number, b: any) => a + Number(b.amountVES ?? 0), 0), 2)}
                        </div>
                      </div>
                      <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-blue-600">Equiv. USD (Σ mov.)</div>
                        <div className="text-2xl font-black font-mono text-blue-800">
                          {usd(
                            (bankTxList.reduce((a: number, b: any) => a + Number(b.amountVES ?? 0), 0)) / financeInternalRate,
                            2
                          )}
                        </div>
                        <div className="text-[8px] text-blue-500 font-bold mt-1">Según tasa interna del sistema</div>
                      </div>
                    </div>
                  )}
                  {(bankTxModalProfile === 'MIXED' || bankTxModalProfile === 'UNKNOWN') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total USD</div>
                        <div className="text-2xl font-black font-mono text-emerald-700">
                          {usd(bankTxList.reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                      </div>
                      <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Conciliado</div>
                        <div className="text-2xl font-black font-mono text-emerald-700">
                          {usd(bankTxList.filter((b: any) => b.reconciled).reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                        <div className="text-[9px] text-emerald-500 font-bold mt-1">{bankTxList.filter((b: any) => b.reconciled).length} / {bankTxList.length} movimientos</div>
                      </div>
                      <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-amber-600">Sin conciliar</div>
                        <div className="text-2xl font-black font-mono text-amber-700">
                          {usd(bankTxList.filter((b: any) => !b.reconciled).reduce((a: number, b: any) => a + Number(b.amountUSD ?? 0), 0), 2)}
                        </div>
                      </div>
                      <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/40">
                        <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Bs</div>
                        <div className="text-2xl font-black font-mono text-slate-900">
                          {bs(bankTxList.reduce((a: number, b: any) => a + Number(b.amountVES ?? 0), 0), 2)}
                        </div>
                      </div>
                    </div>
                  )}

                  {bankTxList.length === 0 ? (
                    <div className="p-12 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">Sin movimientos</div>
                  ) : (
                    <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                      {bankTxList.map((t: any) => {
                        const src = String(t.source ?? '').trim().toUpperCase();
                        const isPurchaseTx = src === 'PURCHASE_PAYMENT';
                        const isEgreso =
                          src === 'PURCHASE_PAYMENT' || src === 'AP_PAYMENT' || src === 'SALE_RETURN'
                          || Number(t.amountUSD ?? 0) < 0
                          || (String(t.currency ?? '').toUpperCase() === 'VES' && Number(t.amountVES ?? 0) < 0);
                        const sourceLabelMap: Record<string, string> = {
                          SALE_PAYMENT: 'Cobro de venta',
                          CREDIT_DOWN: 'Abono a crédito',
                          AR_PAYMENT: 'Cobro CxC',
                          AP_PAYMENT: 'Pago CxP',
                          PURCHASE_PAYMENT: 'Pago de compra',
                          SALE_RETURN: 'Devolución de venta',
                          MANUAL_ENTRY: isEgreso ? 'Salida manual' : 'Entrada manual',
                        };
                        const sourceLabel = sourceLabelMap[src] ?? src;
                        const supplierName = String(t.customerName ?? '').trim();
                        const invoiceNumber = String(t.purchaseInvoiceNumber ?? t.saleCorrelativo ?? '').trim();
                        const warehouse = String(t.purchaseWarehouse ?? '').trim();
                        const batches = Array.isArray(t.purchaseBatches) ? t.purchaseBatches.filter(Boolean) : [];
                        const supportCount = Array.isArray(t.supports) ? t.supports.length : 0;
                        return (
                          <div
                            key={t.id}
                            className={`p-5 rounded-2xl border bg-white transition-colors ${t.reconciled ? 'border-emerald-300 bg-emerald-50/30' : (String(t.sourceId ?? '').trim() ? 'hover:border-slate-300 cursor-pointer' : '')} ${isEgreso && !t.reconciled ? 'border-rose-100' : ''}`}
                            onClick={() => !t.reconciled && String(t.sourceId ?? '').trim() ? handleOpenBankTransactionSupport(t) : undefined}
                          >
                            <div className="flex justify-between items-start gap-6">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className={`text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${isEgreso ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {isEgreso ? '▼ Egreso' : '▲ Ingreso'}
                                  </span>
                                  <span className="text-[8px] font-bold text-slate-400 uppercase border border-slate-200 px-1.5 py-0.5 rounded">{sourceLabel}</span>
                                </div>
                                <div className="text-[11px] font-black text-slate-900">
                                  {getBankTxMethodLabel(String(t.method ?? ''))} — {getBankTxCurrencyLabel(String(t.currency ?? ''))}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono mt-1">
                                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}
                                </div>
                                <div className="text-[10px] font-bold text-slate-700 uppercase mt-1">
                                  {isPurchaseTx ? `${supplierName || 'Proveedor'} • Factura ${invoiceNumber || '-'}` : `${supplierName}${String(t.saleCorrelativo ?? '') ? ' • ' + String(t.saleCorrelativo ?? '') : ''}`}
                                </div>
                                {!!String(t.accountLabel ?? '').trim() && (
                                  <div className="text-[10px] text-slate-500 font-mono mt-1">
                                    Cuenta: {String(t.accountLabel ?? '')}
                                  </div>
                                )}
                                <div className="text-[10px] text-slate-500 font-mono mt-1">
                                  Ref: {String(t.reference ?? '-')}
                                </div>
                                {isPurchaseTx && (
                                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Control de factura</div>
                                      <div className="mt-1 text-[10px] font-black text-slate-900 uppercase">{invoiceNumber || '-'}</div>
                                      <div className="mt-1 text-[9px] font-bold text-slate-500">Emisión: {formatTraceDate(String(t.purchaseInvoiceDate ?? ''))}</div>
                                      <div className="text-[9px] font-bold text-slate-500">Vencimiento: {formatTraceDate(String(t.purchaseInvoiceDueDate ?? ''))}</div>
                                    </div>
                                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                      <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Traza de ingreso</div>
                                      <div className="mt-1 text-[9px] font-bold text-slate-700 uppercase">Proveedor: {supplierName || '-'}</div>
                                      <div className="text-[9px] font-bold text-slate-500 uppercase">Almacén: {warehouse || '-'}</div>
                                      <div className="text-[9px] font-bold text-slate-500 uppercase">Lotes: {batches.length > 0 ? batches.join(' • ') : '-'}</div>
                                      <div className="text-[9px] font-bold text-slate-500 uppercase">Líneas: {Number(t.purchaseLineCount ?? 0) || 1}</div>
                                    </div>
                                  </div>
                                )}
                                {String(t.sourceId ?? '').trim() && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenBankTransactionSupport(t);
                                    }}
                                    className="mt-3 px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest hover:bg-emerald-100"
                                  >
                                    {supportCount > 0 ? `Ver comprobante${supportCount > 1 ? 's' : ''} (${supportCount})` : 'Ver comprobante'}
                                  </button>
                                )}
                              </div>
                              <div className="text-right shrink-0 flex flex-col items-end gap-2">
                                {bankTxModalProfile === 'USD_ONLY' && (
                                  <div className={`text-[13px] font-black font-mono ${Number(t.amountUSD ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                    {usd(Number(t.amountUSD ?? 0), 2)}
                                  </div>
                                )}
                                {bankTxModalProfile === 'VES_ONLY' && (
                                  <>
                                    <div className={`text-[13px] font-black font-mono ${Number(t.amountVES ?? 0) < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                                      {bs(Number(t.amountVES ?? 0), 2)}
                                    </div>
                                    <div className="text-[10px] font-bold text-slate-500 max-w-[220px]">
                                      ≈ {usd(bankTxVesToEquivUsd(t), 2)}
                                      {Number(t.rateUsed ?? 0) > 0 && (
                                        <span className="text-slate-400 font-mono block sm:inline sm:ml-1">
                                          (Tasa {Number(t.rateUsed).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })})
                                        </span>
                                      )}
                                    </div>
                                  </>
                                )}
                                {(bankTxModalProfile === 'MIXED' || bankTxModalProfile === 'UNKNOWN') && (
                                  <>
                                    <div className={`text-[13px] font-black font-mono ${Number(t.amountUSD ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                      {usd(Number(t.amountUSD ?? 0), 2)}
                                    </div>
                                    {String(t.currency ?? '').toUpperCase() === 'VES' && (
                                      <>
                                        <div className={`text-[11px] font-black font-mono ${Number(t.amountVES ?? 0) < 0 ? 'text-red-500' : 'text-slate-700'}`}>
                                          {bs(Number(t.amountVES ?? 0), 2)} @ {Number(t.rateUsed ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-500">
                                          ≈ {usd(bankTxVesToEquivUsd(t), 2)} ref. mov.
                                        </div>
                                      </>
                                    )}
                                  </>
                                )}
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!t.id) return;
                                    const isUnreconcile = !!t.reconciled;
                                    let approvalPin = '';
                                    if (isUnreconcile) {
                                      const inputPin = window.prompt('Para desconciliar ingrese clave de Presidente o Gerente:') ?? '';
                                      approvalPin = String(inputPin).trim();
                                      if (!approvalPin) return;
                                    }
                                    setBankTxList(prev => prev.map(tx => tx.id === t.id ? { ...tx, reconciled: !tx.reconciled } : tx));
                                    try {
                                      await dataService.toggleBankTransactionReconciled(t.id, !!t.reconciled, approvalPin);
                                    } catch (err: any) {
                                      setBankTxList(prev => prev.map(tx => tx.id === t.id ? { ...tx, reconciled: !!t.reconciled } : tx));
                                      alert(String(err?.message ?? 'No se pudo actualizar la conciliación.'));
                                    }
                                  }}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[8px] font-black uppercase transition-all border ${
                                    t.reconciled
                                      ? 'bg-emerald-100 text-emerald-700 border-emerald-300 hover:bg-emerald-200'
                                      : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  {t.reconciled ? '✓ Conciliado' : 'Conciliar'}
                                </button>
                                {t.reconciled && t.reconciledBy && (
                                  <div className="text-[8px] text-emerald-600 font-bold">{t.reconciledBy}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showBankSupportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Comprobante</div>
                <div className="text-[12px] font-black text-slate-900 truncate">{String(currentBankSupport?.name ?? 'Soporte')}</div>
              </div>
              <div className="flex items-center gap-2">
                {bankSupportList.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setBankSupportIndex(i => Math.max(0, i - 1))}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest"
                      disabled={bankSupportIndex === 0}
                    >
                      Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => setBankSupportIndex(i => Math.min(bankSupportList.length - 1, i + 1))}
                      className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest"
                      disabled={bankSupportIndex >= bankSupportList.length - 1}
                    >
                      Siguiente
                    </button>
                  </>
                )}
                <a
                  href={currentBankSupportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
                >
                  <Download className="w-3.5 h-3.5" />
                  Abrir
                </a>
                <button
                  type="button"
                  onClick={() => setShowBankSupportModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 max-h-[68vh] overflow-auto">
              {bankSupportLoading ? (
                <div className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Cargando comprobante...</div>
              ) : bankSupportError ? (
                <div className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-200 rounded-xl">{bankSupportError}</div>
              ) : currentBankSupportIsImage ? (
                <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center justify-center min-h-[320px] max-h-[60vh] overflow-auto">
                  <img src={currentBankSupportUrl} alt={String(currentBankSupport?.name ?? 'Soporte')} className="max-w-full max-h-[56vh] object-contain rounded-lg" />
                </div>
              ) : currentBankSupportUrl ? (
                <iframe src={currentBankSupportUrl} title={String(currentBankSupport?.name ?? 'Soporte')} className="w-full h-[58vh] rounded-xl border border-slate-200 bg-white" />
              ) : (
                <div className="p-8 text-center text-[10px] font-black uppercase tracking-widest text-slate-400">Soporte no disponible</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showPurchaseModal && (
        <PurchaseEntryModal
          products={stocks}
          onClose={() => setShowPurchaseModal(false)}
          onSaved={() => setShowPurchaseModal(false)}
        />
      )}

      {/* Modal de Reporte Bancario */}
      {showBankReportModal && selectedBankForReport && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] max-w-6xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
            <div className="p-6 border-b bg-slate-50/30">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-headline font-black text-lg">Reporte Bancario</h3>
                  <p className="text-sm text-slate-600 font-bold uppercase tracking-wider mt-1">{selectedBankForReport.name}</p>
                </div>
                <button
                  onClick={() => {
                    setShowBankReportModal(false);
                    setSelectedBankForReport(null);
                    setBankReportRows([]);
                    setBankReportError('');
                    setBankReportLoading(false);
                  }}
                  className="p-2 bg-slate-100 text-slate-500 rounded-xl hover:bg-slate-900 hover:text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              {bankReportLoading ? (
                <div className="p-12 text-center opacity-40 font-black uppercase tracking-widest text-[10px]">Generando reporte...</div>
              ) : bankReportError ? (
                <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
                  {bankReportError}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                      <div className="text-xs font-black text-emerald-600 uppercase tracking-wider">Ingresos USD</div>
                      <div className="text-xl font-black text-emerald-700">
                        {usd(bankReportRows.reduce((acc: number, item: any) => acc + Number(item.creditUSD ?? 0), 0))}
                      </div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <div className="text-xs font-black text-red-600 uppercase tracking-wider">Egresos USD</div>
                      <div className="text-xl font-black text-red-700">
                        {usd(bankReportRows.reduce((acc: number, item: any) => acc + Number(item.debitUSD ?? 0), 0))}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <div className="text-xs font-black text-blue-600 uppercase tracking-wider">Ingresos Bs</div>
                      <div className="text-xl font-black text-blue-700">
                        {bs(bankReportRows.reduce((acc: number, item: any) => acc + Number(item.creditVES ?? 0), 0))}
                      </div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
                      <div className="text-xs font-black text-orange-600 uppercase tracking-wider">Egresos Bs</div>
                      <div className="text-xl font-black text-orange-700">
                        {bs(bankReportRows.reduce((acc: number, item: any) => acc + Number(item.debitVES ?? 0), 0))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-900 text-white rounded-xl p-6 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Saldo USD</div>
                        <div className={`text-2xl font-black ${(bankReportRows.at(-1)?.saldoUSD ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {usd(Number(bankReportRows.at(-1)?.saldoUSD ?? 0))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Saldo Bs</div>
                        <div className={`text-2xl font-black ${(bankReportRows.at(-1)?.saldoVES ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {bs(Number(bankReportRows.at(-1)?.saldoVES ?? 0))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Movimientos</div>
                        <div className="text-2xl font-black text-white">{bankReportRows.length}</div>
                      </div>
                    </div>
                  </div>

                  {bankReportRows.length === 0 ? (
                    <div className="p-12 text-center opacity-30 font-black uppercase tracking-widest text-[10px]">Sin movimientos para este banco</div>
                  ) : (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 border-b">
                            <tr>
                              <th className="px-4 py-3 text-left font-black text-slate-700 uppercase">Fecha</th>
                              <th className="px-4 py-3 text-left font-black text-slate-700 uppercase">Descripción</th>
                              <th className="px-4 py-3 text-left font-black text-slate-700 uppercase">Referencia</th>
                              <th className="px-4 py-3 text-left font-black text-slate-700 uppercase">Método</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Débito USD</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Crédito USD</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Débito Bs</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Crédito Bs</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Saldo USD</th>
                              <th className="px-4 py-3 text-right font-black text-slate-700 uppercase">Saldo Bs</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bankReportRows.map((item: any, index: number) => (
                              <tr key={`${item.fecha}-${item.referencia}-${index}`} className="border-b hover:bg-slate-50">
                                <td className="px-4 py-3">{item.fecha}</td>
                                <td className="px-4 py-3">{item.descripcion}</td>
                                <td className="px-4 py-3">{item.referencia}</td>
                                <td className="px-4 py-3 uppercase">{item.metodo}</td>
                                <td className="px-4 py-3 text-right font-mono">{Number(item.debitUSD ?? 0) > 0 ? usd(Number(item.debitUSD)) : ''}</td>
                                <td className="px-4 py-3 text-right font-mono">{Number(item.creditUSD ?? 0) > 0 ? usd(Number(item.creditUSD)) : ''}</td>
                                <td className="px-4 py-3 text-right font-mono">{Number(item.debitVES ?? 0) > 0 ? bs(Number(item.debitVES)) : ''}</td>
                                <td className="px-4 py-3 text-right font-mono">{Number(item.creditVES ?? 0) > 0 ? bs(Number(item.creditVES)) : ''}</td>
                                <td className={`px-4 py-3 text-right font-mono font-black ${Number(item.saldoUSD ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {usd(Number(item.saldoUSD ?? 0))}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono font-black ${Number(item.saldoVES ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {bs(Number(item.saldoVES ?? 0))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FIN-04: Modal movimiento bancario manual */}
      {showManualTxModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-200">
            <div className="p-8 border-b bg-slate-50/30 flex justify-between items-center">
              <div>
                <h4 className="font-headline font-black text-lg uppercase tracking-tight">Movimiento Bancario Manual</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Registra entrada o salida sin origen en facturación</p>
              </div>
              <button onClick={() => { setShowManualTxModal(false); setManualTxError(''); }}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-all">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Banco</label>
                <select
                  value={manualTx.bankId}
                  onChange={(e) => setManualTx((p) => ({ ...p, bankId: e.target.value, accountId: '' }))}
                  className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">Seleccione banco...</option>
                  {banks.map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cuenta</label>
                <select
                  value={manualTx.accountId}
                  onChange={(e) => setManualTx((p) => ({ ...p, accountId: e.target.value }))}
                  disabled={!manualTx.bankId}
                  className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
                >
                  <option value="">{manualTx.bankId ? 'Seleccione cuenta…' : 'Primero elija banco'}</option>
                  {(activeBanks.find((b: any) => String(b?.id ?? '') === String(manualTx.bankId))?.accounts || []).map(
                    (a: any) => (
                      <option key={String(a.id)} value={String(a.id)}>
                        {String(a.label ?? a.id)} · {String(a.currency ?? 'VES').toUpperCase()}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tipo de Movimiento</label>
                <div className="flex mt-1 bg-slate-100 rounded-xl overflow-hidden border border-slate-200">
                  {(['IN', 'OUT'] as const).map(t => (
                    <button key={t} onClick={() => setManualTx(p => ({...p, type: t}))}
                      className={`flex-1 py-2 text-[10px] font-black uppercase transition-all ${manualTx.type === t ? (t === 'IN' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'text-slate-500 hover:bg-slate-200'}`}>
                      {t === 'IN' ? '↑ Entrada' : '↓ Salida'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Concepto / Descripción</label>
                <input type="text" value={manualTx.concept} onChange={e => setManualTx(p => ({...p, concept: e.target.value}))}
                  placeholder="Ej: Transferencia interna, ajuste..." 
                  className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto USD</label>
                  <input type="number" min="0" step="0.01" value={manualTx.amountUSD} onChange={e => setManualTx(p => ({...p, amountUSD: e.target.value}))}
                    placeholder="0.00"
                    className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto Bs</label>
                  <input type="number" min="0" step="0.01" value={manualTx.amountVES} onChange={e => setManualTx(p => ({...p, amountVES: e.target.value}))}
                    placeholder="0.00"
                    className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Referencia (opcional)</label>
                <input type="text" value={manualTx.reference} onChange={e => setManualTx(p => ({...p, reference: e.target.value}))}
                  placeholder="N° referencia bancaria"
                  className="w-full mt-1 bg-slate-100 rounded-xl p-3 text-[12px] font-black text-slate-900 border-0 focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              {manualTxError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase">{manualTxError}</div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => { setShowManualTxModal(false); setManualTxError(''); }}
                  className="px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                  Cancelar
                </button>
                <button onClick={handleManualBankTx} disabled={manualTxSaving}
                  className={`px-5 py-2.5 text-white rounded-xl text-[9px] font-black uppercase shadow-lg transition-all disabled:opacity-60 ${manualTx.type === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20' : 'bg-red-600 hover:bg-red-700 shadow-red-600/20'}`}>
                  {manualTxSaving ? 'Guardando...' : `Registrar ${manualTx.type === 'IN' ? 'Entrada' : 'Salida'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* FEAT-14: Calendar tab */}
      {activeSubTab === 'calendar' && (
        <PaymentCalendar
          arEntries={arEntries}
          apEntries={apEntries}
          calendarDate={calendarDate}
          setCalendarDate={setCalendarDate}
          calendarSelectedDay={calendarSelectedDay}
          setCalendarSelectedDay={setCalendarSelectedDay}
          calendarView={calendarView}
          setCalendarView={setCalendarView}
        />
      )}

      {/* FIN-08 + FIN-09: Advances management panel */}
      {activeSubTab === 'advances' && (() => {
        const actor = dataService.getCurrentUser()?.name ?? 'Sistema';
        const filtered = advancesData.filter(a => {
          const q = advSearch.trim().toLowerCase();
          if (!q) return true;
          return a.customerName.toLowerCase().includes(q) ||
            (a.customerId ?? '').toLowerCase().includes(q) ||
            (a.originCorrelativo ?? '').toLowerCase().includes(q) ||
            (a.note ?? '').toLowerCase().includes(q);
        });
        const totalAvail = advancesData.reduce((s, a) => s + a.balanceUSD, 0);
        const byClient = advancesData.reduce((m, a) => {
          m[a.customerId] = (m[a.customerId] ?? 0) + a.balanceUSD;
          return m;
        }, {} as Record<string, number>);
        const clientCount = Object.keys(byClient).length;
        type ClientAdvanceGroup = {
          customerId: string;
          customerName: string;
          totalBalanceUSD: number;
          totalOriginalUSD: number;
          advances: ClientAdvance[];
        };
        const groupedClients = filtered.reduce((acc, adv) => {
          const safeCustomerId = String(adv.customerId ?? '').trim() || 'SIN_ID';
          const safeCustomerName = String(adv.customerName ?? '').trim() || 'Cliente sin nombre';
          const key = `${safeCustomerId}||${safeCustomerName.toUpperCase()}`;
          const existing = acc.get(key);
          if (existing) {
            existing.totalBalanceUSD += Number(adv.balanceUSD || 0);
            existing.totalOriginalUSD += Number(adv.amountUSD || 0);
            existing.advances.push(adv);
          } else {
            acc.set(key, {
              customerId: safeCustomerId,
              customerName: safeCustomerName,
              totalBalanceUSD: Number(adv.balanceUSD || 0),
              totalOriginalUSD: Number(adv.amountUSD || 0),
              advances: [adv]
            });
          }
          return acc;
        }, new Map<string, ClientAdvanceGroup>());
        const groupedClientsList: ClientAdvanceGroup[] = Array.from<ClientAdvanceGroup>(groupedClients.values())
          .sort((a, b) => b.totalBalanceUSD - a.totalBalanceUSD);

        const supFiltered = supplierAdvancesData.filter(a => {
          const q = supAdvSearch.trim().toLowerCase();
          if (!q) return true;
          return a.supplierName.toLowerCase().includes(q) ||
            (a.supplierId ?? '').toLowerCase().includes(q) ||
            (a.reference ?? '').toLowerCase().includes(q) ||
            (a.note ?? '').toLowerCase().includes(q);
        });
        const supTotalAvail = supplierAdvancesData.reduce((s, a) => s + a.balanceUSD, 0);
        const bySupplier = supplierAdvancesData.reduce((m, a) => {
          const key = `${String(a.supplierId ?? '').trim() || 'SIN_ID'}||${String(a.supplierName ?? '').trim().toUpperCase()}`;
          m[key] = (m[key] ?? 0) + a.balanceUSD;
          return m;
        }, {} as Record<string, number>);
        const supplierCount = Object.keys(bySupplier).length;
        type SupplierAdvanceGroup = {
          supplierKey: string;
          supplierId: string;
          supplierName: string;
          totalBalanceUSD: number;
          totalOriginalUSD: number;
          advances: SupplierAdvance[];
        };
        const groupedSuppliers = supFiltered.reduce((acc, adv) => {
          const safeSupplierId = String(adv.supplierId ?? '').trim() || 'SIN_ID';
          const safeSupplierName = String(adv.supplierName ?? '').trim() || 'Proveedor sin nombre';
          const key = `${safeSupplierId}||${safeSupplierName.toUpperCase()}`;
          const existing = acc.get(key);
          if (existing) {
            existing.totalBalanceUSD += Number(adv.balanceUSD || 0);
            existing.totalOriginalUSD += Number(adv.amountUSD || 0);
            existing.advances.push(adv);
          } else {
            acc.set(key, {
              supplierKey: key,
              supplierId: safeSupplierId,
              supplierName: safeSupplierName,
              totalBalanceUSD: Number(adv.balanceUSD || 0),
              totalOriginalUSD: Number(adv.amountUSD || 0),
              advances: [adv]
            });
          }
          return acc;
        }, new Map<string, SupplierAdvanceGroup>());
        const groupedSuppliersList: SupplierAdvanceGroup[] = Array.from<SupplierAdvanceGroup>(groupedSuppliers.values())
          .sort((a, b) => b.totalBalanceUSD - a.totalBalanceUSD);
        const statusColors: Record<string, string> = { AVAILABLE: 'bg-emerald-100 text-emerald-700', PARTIAL: 'bg-amber-100 text-amber-700', APPLIED: 'bg-slate-100 text-slate-500' };
        const statusLabels: Record<string, string> = { AVAILABLE: 'Disponible', PARTIAL: 'Parcial', APPLIED: 'Aplicado' };

        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Sub-tab selector */}
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner gap-1 w-fit">
              {(['client', 'supplier'] as const).map(t => (
                <button key={t} onClick={() => setAdvancesSubTab(t)}
                  className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                    advancesSubTab === t ? 'bg-white text-slate-900 shadow-md' : 'text-slate-400 hover:text-slate-600'
                  }`}>
                  {t === 'client' ? 'Anticipos Clientes' : 'Anticipos Proveedores'}
                </button>
              ))}
            </div>

            {/* ── CLIENTE (FIN-08) ── */}
            {advancesSubTab === 'client' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-100 bg-amber-50/40">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-headline font-black text-lg uppercase tracking-tight text-slate-900">Gestión de Anticipos de Clientes</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Saldos disponibles · Historial · Aplicación manual</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden text-[10px] font-black">
                      <button onClick={() => { setAdvShowApplied(false); loadAdvances(false); }}
                        className={`px-4 py-2 transition-all ${!advShowApplied ? 'bg-amber-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        Disponibles
                      </button>
                      <button onClick={() => { setAdvShowApplied(true); loadAdvances(true); }}
                        className={`px-4 py-2 transition-all ${advShowApplied ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        Todos
                      </button>
                    </div>
                    <button onClick={() => loadAdvances(advShowApplied)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase transition-all">
                      <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                    </button>
                  </div>
                </div>
                {/* KPI bar */}
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-white rounded-2xl border border-amber-200 p-4 text-center">
                    <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Total Disponible</p>
                    <p className="text-xl font-black text-amber-700 mt-1">${totalAvail.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Anticipos Activos</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{advancesData.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Clientes con Saldo</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{clientCount}</p>
                  </div>
                </div>
              </div>
              {/* Search */}
              <div className="px-8 py-4 border-b border-slate-100 flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={advSearch} onChange={e => setAdvSearch(e.target.value)}
                  placeholder="Buscar por cliente, factura origen, nota…"
                  className="flex-1 text-sm font-medium text-slate-700 placeholder:text-slate-300 bg-transparent outline-none" />
                {advSearch && <button onClick={() => setAdvSearch('')}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>}
              </div>
              {/* Load prompt */}
              {advancesData.length === 0 && !loadingAdvances && (
                <div className="p-16 text-center">
                  <button onClick={() => loadAdvances(false)}
                    className="px-8 py-3 bg-amber-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">
                    Cargar anticipos
                  </button>
                  <p className="text-slate-400 text-xs mt-3 font-bold">Los anticipos se cargan bajo demanda desde Firestore</p>
                </div>
              )}
              {loadingAdvances && (
                <div className="p-16 flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                  <span className="text-sm font-bold text-slate-400">Cargando anticipos…</span>
                </div>
              )}
              {/* Table */}
              {!loadingAdvances && advancesData.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-6 py-3 text-center">Detalle</th>
                        <th className="px-6 py-3 text-left">Cliente</th>
                        <th className="px-6 py-3 text-right">Total Original</th>
                        <th className="px-6 py-3 text-right">Saldo Cuenta</th>
                        <th className="px-6 py-3 text-center">Movimientos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-[11px]">
                      {groupedClientsList.length === 0 && (
                        <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-[10px]">Sin resultados</td></tr>
                      )}
                      {groupedClientsList.map(group => {
                        const isClientExpanded = expandedAdvClientId === group.customerId;
                        const statusColors: Record<string, string> = {
                          AVAILABLE: 'bg-emerald-100 text-emerald-700',
                          PARTIAL: 'bg-amber-100 text-amber-700',
                          APPLIED: 'bg-slate-100 text-slate-500'
                        };
                        const statusLabels: Record<string, string> = {
                          AVAILABLE: 'Disponible', PARTIAL: 'Parcial', APPLIED: 'Aplicado'
                        };
                        return (
                          <React.Fragment key={group.customerId}>
                            <tr className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => {
                                    const next = isClientExpanded ? null : group.customerId;
                                    setExpandedAdvClientId(next);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                                  title={isClientExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                                >
                                  {isClientExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <UserCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                  <div className="leading-tight">
                                    <span className="block font-black text-slate-800">{group.customerName}</span>
                                    <span className="block text-[9px] font-mono text-slate-400">ID: {group.customerId}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-slate-600">${group.totalOriginalUSD.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right font-black text-amber-700">${group.totalBalanceUSD.toFixed(2)}</td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600">
                                  {group.advances.length}
                                </span>
                              </td>
                            </tr>
                            {/* Detalle expandible por cliente */}
                            {isClientExpanded && (
                              <tr>
                                <td colSpan={5} className="bg-amber-50/40 px-8 pb-4 pt-2">
                                  <div className="flex items-center gap-2 mb-2">
                                    <ReceiptText className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Movimientos de anticipos del cliente</span>
                                  </div>
                                  <div className="space-y-2">
                                    {group.advances
                                      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
                                      .map((adv) => {
                                        const isExpanded = expandedAdvId === adv.id;
                                        const hist = advHistory[adv.id];
                                        return (
                                          <div key={adv.id} className={`rounded-xl border ${adv.status === 'APPLIED' ? 'border-slate-200 bg-slate-50/60 opacity-70' : 'border-amber-100 bg-white'}`}>
                                            <div className="grid grid-cols-[1.3fr_1.5fr_0.6fr_0.7fr_0.7fr_0.8fr_auto] gap-2 items-center px-4 py-3 text-[10px]">
                                              <div className="font-mono text-slate-600">{adv.originCorrelativo || 'S/ORIGEN'}</div>
                                              <div className="text-slate-500 truncate">{adv.note ?? '—'}</div>
                                              <div className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${adv.currency === 'VES' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{adv.currency === 'VES' ? 'Bs' : (adv.currency ?? 'USD')}</span>
                                              </div>
                                              <div className="text-right font-bold text-slate-700">${adv.amountUSD.toFixed(2)}</div>
                                              <div className="text-right font-black text-amber-700">${adv.balanceUSD.toFixed(2)}</div>
                                              <div className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${statusColors[adv.status] ?? 'bg-slate-100 text-slate-500'}`}>
                                                  {statusLabels[adv.status] ?? adv.status}
                                                </span>
                                              </div>
                                              <div className="flex items-center justify-end gap-2">
                                                <button
                                                  onClick={() => {
                                                    const next = isExpanded ? null : adv.id;
                                                    setExpandedAdvId(next);
                                                    if (next) loadAdvHistory(next);
                                                  }}
                                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                                                  title="Ver historial"
                                                >
                                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                                {adv.status !== 'APPLIED' && (
                                                  <button
                                                    onClick={() => { setApplyingAdv(adv); setApplyAmt(adv.balanceUSD.toFixed(2)); setApplyRef(''); }}
                                                    className="px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 text-[9px] font-black uppercase transition-all"
                                                  >
                                                    Aplicar
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            {isExpanded && (
                                              <div className="px-4 pb-3">
                                                {!hist && <p className="text-[10px] text-slate-400 font-bold">Cargando…</p>}
                                                {hist && hist.length === 0 && <p className="text-[10px] text-slate-400 font-bold">Sin aplicaciones registradas.</p>}
                                                {hist && hist.length > 0 && (
                                                  <table className="w-full text-[10px]">
                                                    <thead>
                                                      <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                                        <th className="text-left pb-1">Fecha</th>
                                                        <th className="text-left pb-1">Referencia</th>
                                                        <th className="text-right pb-1">Aplicado</th>
                                                        <th className="text-right pb-1">Saldo tras</th>
                                                        <th className="text-left pb-1">Actor</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-amber-100">
                                                      {hist.map((h: any) => (
                                                        <tr key={h.id}>
                                                          <td className="py-1 text-slate-500">{h.appliedAt ? new Date(h.appliedAt).toLocaleString('es-VE') : '—'}</td>
                                                          <td className="py-1 font-mono text-slate-600">{h.appliedInCorrelativo}</td>
                                                          <td className="py-1 text-right font-black text-emerald-600">- ${Number(h.appliedUSD).toFixed(2)}</td>
                                                          <td className="py-1 text-right text-slate-500">${Number(h.remainingAfter).toFixed(2)}</td>
                                                          <td className="py-1 text-slate-400">{h.actor}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}

            {/* ── PROVEEDOR (FIN-09) ── */}
            {advancesSubTab === 'supplier' && (
            <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-100 bg-blue-50/40">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h3 className="font-headline font-black text-lg uppercase tracking-tight text-slate-900">Anticipos de Proveedor</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Pagos adelantados a proveedores · Aplicación a CxP</p>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex bg-white border border-slate-200 rounded-xl overflow-hidden text-[10px] font-black">
                      <button onClick={() => { setSupAdvShowApplied(false); loadSupplierAdvances(false); }}
                        className={`px-4 py-2 transition-all ${!supAdvShowApplied ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        Disponibles
                      </button>
                      <button onClick={() => { setSupAdvShowApplied(true); loadSupplierAdvances(true); }}
                        className={`px-4 py-2 transition-all ${supAdvShowApplied ? 'bg-slate-700 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>
                        Todos
                      </button>
                    </div>
                    <button onClick={() => loadSupplierAdvances(supAdvShowApplied)}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-[10px] font-black uppercase transition-all">
                      <RefreshCw className="w-3.5 h-3.5" /> Actualizar
                    </button>
                    {canEditFinance && (
                      <button onClick={() => { setCreateSupAdvForm({ supplierName: '', amountUSD: '', reference: '', method: '', bankName: '', note: '', currency: 'USD', originalAmountVES: '' }); setCreateSupAdvError(''); setShowCreateSupAdv(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-blue-600/20 transition-all">
                        <Plus className="w-3.5 h-3.5" /> Nuevo Anticipo
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 mt-6">
                  <div className="bg-white rounded-2xl border border-blue-200 p-4 text-center">
                    <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Total Disponible</p>
                    <p className="text-xl font-black text-blue-700 mt-1">${supTotalAvail.toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Anticipos Activos</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{supplierAdvancesData.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-slate-200 p-4 text-center">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Proveedores con Saldo</p>
                    <p className="text-xl font-black text-slate-800 mt-1">{supplierCount}</p>
                  </div>
                </div>
              </div>
              <div className="px-8 py-4 border-b border-slate-100 flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-400" />
                <input value={supAdvSearch} onChange={e => setSupAdvSearch(e.target.value)}
                  placeholder="Buscar por proveedor, referencia, nota…"
                  className="flex-1 text-sm font-medium text-slate-700 placeholder:text-slate-300 bg-transparent outline-none" />
                {supAdvSearch && <button onClick={() => setSupAdvSearch('')}><X className="w-4 h-4 text-slate-400 hover:text-slate-600" /></button>}
              </div>
              {supplierAdvancesData.length === 0 && !loadingSupplierAdvances && (
                <div className="p-16 text-center">
                  <button onClick={() => loadSupplierAdvances(false)}
                    className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20">
                    Cargar anticipos
                  </button>
                  <p className="text-slate-400 text-xs mt-3 font-bold">Los anticipos se cargan bajo demanda desde Firestore</p>
                </div>
              )}
              {loadingSupplierAdvances && (
                <div className="p-16 flex items-center justify-center gap-3">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                  <span className="text-sm font-bold text-slate-400">Cargando anticipos…</span>
                </div>
              )}
              {!loadingSupplierAdvances && supplierAdvancesData.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-6 py-3 text-center">Detalle</th>
                        <th className="px-6 py-3 text-left">Proveedor</th>
                        <th className="px-6 py-3 text-right">Total Original</th>
                        <th className="px-6 py-3 text-right">Saldo Cuenta</th>
                        <th className="px-6 py-3 text-center">Movimientos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-[11px]">
                      {groupedSuppliersList.length === 0 && (
                        <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-black uppercase tracking-widest text-[10px]">Sin resultados</td></tr>
                      )}
                      {groupedSuppliersList.map(group => {
                        const isSupplierExpanded = expandedSupSupplierKey === group.supplierKey;
                        return (
                          <React.Fragment key={group.supplierKey}>
                            <tr className="hover:bg-slate-50 transition-colors">
                              <td className="px-6 py-4 text-center">
                                <button
                                  onClick={() => {
                                    const next = isSupplierExpanded ? null : group.supplierKey;
                                    setExpandedSupSupplierKey(next);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                                  title={isSupplierExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                                >
                                  {isSupplierExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                  <div className="leading-tight">
                                    <span className="block font-black text-slate-800">{group.supplierName}</span>
                                    <span className="block text-[9px] font-mono text-slate-400">ID: {group.supplierId}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right font-bold text-slate-600">${group.totalOriginalUSD.toFixed(2)}</td>
                              <td className="px-6 py-4 text-right font-black text-blue-700">${group.totalBalanceUSD.toFixed(2)}</td>
                              <td className="px-6 py-4 text-center">
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-slate-100 text-slate-600">
                                  {group.advances.length}
                                </span>
                              </td>
                            </tr>
                            {isSupplierExpanded && (
                              <tr>
                                <td colSpan={5} className="bg-blue-50/40 px-8 pb-4 pt-2">
                                  <div className="flex items-center gap-2 mb-2">
                                    <ReceiptText className="w-3.5 h-3.5 text-blue-500" />
                                    <span className="text-[9px] font-black text-blue-700 uppercase tracking-widest">Movimientos de anticipos del proveedor</span>
                                  </div>
                                  <div className="space-y-2">
                                    {group.advances
                                      .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
                                      .map((adv) => {
                                        const isExpanded = expandedSupAdvId === adv.id;
                                        const hist = supAdvHistory[adv.id];
                                        return (
                                          <div key={adv.id} className={`rounded-xl border ${adv.status === 'APPLIED' ? 'border-slate-200 bg-slate-50/60 opacity-70' : 'border-blue-100 bg-white'}`}>
                                            <div className="grid grid-cols-[1fr_1.3fr_0.6fr_0.7fr_0.7fr_0.8fr_auto] gap-2 items-center px-4 py-3 text-[10px]">
                                              <div className="font-mono text-slate-600">{adv.reference || 'S/REF'}</div>
                                              <div className="text-slate-500 truncate">{adv.note ?? '—'}</div>
                                              <div className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${adv.currency === 'VES' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{adv.currency === 'VES' ? 'Bs' : (adv.currency ?? 'USD')}</span>
                                              </div>
                                              <div className="text-right font-bold text-slate-700">${adv.amountUSD.toFixed(2)}</div>
                                              <div className="text-right font-black text-blue-700">${adv.balanceUSD.toFixed(2)}</div>
                                              <div className="text-center">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${statusColors[adv.status] ?? 'bg-slate-100 text-slate-500'}`}>
                                                  {statusLabels[adv.status] ?? adv.status}
                                                </span>
                                              </div>
                                              <div className="flex items-center justify-end gap-2">
                                                <button
                                                  onClick={() => { const next = isExpanded ? null : adv.id; setExpandedSupAdvId(next); if (next) loadSupAdvHistory(next); }}
                                                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-all"
                                                >
                                                  {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                                </button>
                                                {adv.status !== 'APPLIED' && canEditFinance && (
                                                  <button
                                                    onClick={() => { setApplyingSupAdv(adv); setSupApplyAmt(adv.balanceUSD.toFixed(2)); setSupApplyRef(''); setSupApplyApId(''); }}
                                                    className="px-3 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-[9px] font-black uppercase transition-all"
                                                  >
                                                    Aplicar a CxP
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            {isExpanded && (
                                              <div className="px-4 pb-3">
                                                {!hist && <p className="text-[10px] text-slate-400 font-bold">Cargando…</p>}
                                                {hist && hist.length === 0 && <p className="text-[10px] text-slate-400 font-bold">Sin aplicaciones registradas.</p>}
                                                {hist && hist.length > 0 && (
                                                  <table className="w-full text-[10px]">
                                                    <thead>
                                                      <tr className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                                        <th className="text-left pb-1">Fecha</th>
                                                        <th className="text-left pb-1">Referencia / CxP</th>
                                                        <th className="text-right pb-1">Aplicado</th>
                                                        <th className="text-right pb-1">Saldo tras</th>
                                                        <th className="text-left pb-1">Actor</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-blue-100">
                                                      {hist.map((h: any) => (
                                                        <tr key={h.id}>
                                                          <td className="py-1 text-slate-500">{h.appliedAt ? new Date(h.appliedAt).toLocaleString('es-VE') : '—'}</td>
                                                          <td className="py-1 font-mono text-slate-600">{h.referenceNote ?? h.apEntryId ?? '—'}</td>
                                                          <td className="py-1 text-right font-black text-emerald-600">- ${Number(h.appliedUSD).toFixed(2)}</td>
                                                          <td className="py-1 text-right text-slate-500">${Number(h.remainingAfter).toFixed(2)}</td>
                                                          <td className="py-1 text-slate-400">{h.actor}</td>
                                                        </tr>
                                                      ))}
                                                    </tbody>
                                                  </table>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            )}
          </div>
        );
      })()}

      {/* Modal crear anticipo proveedor */}
      {showCreateSupAdv && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-blue-700 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-blue-200" />
                <div>
                  <h3 className="font-black text-white text-sm uppercase tracking-wide">Nuevo Anticipo Proveedor</h3>
                  <p className="text-blue-200 text-[10px] font-bold">Pago adelantado registrable</p>
                </div>
              </div>
              <button onClick={() => setShowCreateSupAdv(false)} className="p-1.5 rounded-lg hover:bg-blue-600 transition-all"><X className="w-4 h-4 text-white" /></button>
            </div>
            <div className="p-6 space-y-4">
              {createSupAdvError && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase">{createSupAdvError}</div>}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Proveedor *</label>
                <input type="text" value={createSupAdvForm.supplierName} onChange={e => setCreateSupAdvForm(p => ({...p, supplierName: e.target.value}))}
                  placeholder="Nombre del proveedor"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto USD *</label>
                  <input type="number" min="0.01" step="0.01" value={createSupAdvForm.amountUSD} onChange={e => setCreateSupAdvForm(p => ({...p, amountUSD: e.target.value}))}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Moneda</label>
                  <select value={createSupAdvForm.currency} onChange={e => setCreateSupAdvForm(p => ({...p, currency: e.target.value as 'USD'|'VES'}))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-blue-400">
                    <option value="USD">USD</option>
                    <option value="VES">Bs</option>
                  </select>
                </div>
              </div>
              {createSupAdvForm.currency === 'VES' && (
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto Bs</label>
                  <input type="number" min="0" step="0.01" value={createSupAdvForm.originalAmountVES} onChange={e => setCreateSupAdvForm(p => ({...p, originalAmountVES: e.target.value}))}
                    placeholder="0.00"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-blue-400" />
                </div>
              )}
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Referencia *</label>
                <input type="text" value={createSupAdvForm.reference} onChange={e => setCreateSupAdvForm(p => ({...p, reference: e.target.value}))}
                  placeholder="N° de transferencia o comprobante"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Método pago</label>
                  <input type="text" value={createSupAdvForm.method} onChange={e => setCreateSupAdvForm(p => ({...p, method: e.target.value}))}
                    placeholder="Transferencia, Zelle…"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Banco</label>
                  <input type="text" value={createSupAdvForm.bankName} onChange={e => setCreateSupAdvForm(p => ({...p, bankName: e.target.value}))}
                    placeholder="Banco origen"
                    className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Nota (opcional)</label>
                <input type="text" value={createSupAdvForm.note} onChange={e => setCreateSupAdvForm(p => ({...p, note: e.target.value}))}
                  placeholder="Observación adicional"
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setShowCreateSupAdv(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                disabled={createSupAdvSaving}
                onClick={async () => {
                  const amt = parseFloat(createSupAdvForm.amountUSD.replace(',', '.'));
                  if (!createSupAdvForm.supplierName.trim()) { setCreateSupAdvError('El nombre del proveedor es requerido.'); return; }
                  if (!Number.isFinite(amt) || amt <= 0) { setCreateSupAdvError('Ingrese un monto válido mayor a cero.'); return; }
                  if (!createSupAdvForm.reference.trim()) { setCreateSupAdvError('La referencia es requerida.'); return; }
                  setCreateSupAdvSaving(true);
                  setCreateSupAdvError('');
                  try {
                    await dataService.createSupplierAdvance({
                      supplierName: createSupAdvForm.supplierName.trim(),
                      amountUSD: amt,
                      reference: createSupAdvForm.reference.trim(),
                      method: createSupAdvForm.method.trim() || undefined,
                      bankName: createSupAdvForm.bankName.trim() || undefined,
                      note: createSupAdvForm.note.trim() || undefined,
                      currency: createSupAdvForm.currency,
                      originalAmountVES: createSupAdvForm.currency === 'VES' && createSupAdvForm.originalAmountVES ? parseFloat(createSupAdvForm.originalAmountVES) : undefined
                    });
                    setShowCreateSupAdv(false);
                    await loadSupplierAdvances(supAdvShowApplied);
                  } catch (e: any) {
                    setCreateSupAdvError(e?.message ?? 'Error registrando anticipo');
                  } finally { setCreateSupAdvSaving(false); }
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20">
                {createSupAdvSaving ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aplicar anticipo proveedor a CxP */}
      {applyingSupAdv && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-blue-700 px-6 py-4 flex items-center gap-3">
              <Building2 className="w-5 h-5 text-blue-200" />
              <div>
                <h3 className="font-black text-white text-sm uppercase tracking-wide">Aplicar Anticipo Proveedor</h3>
                <p className="text-blue-200 text-[10px] font-bold">{applyingSupAdv.supplierName}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-blue-50 rounded-2xl p-4 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Saldo disponible:</span><span className="font-black text-blue-700">${applyingSupAdv.balanceUSD.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Referencia:</span><span className="font-mono text-slate-600">{applyingSupAdv.reference}</span></div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto a aplicar ($) *</label>
                <input type="number" step="0.01" min="0.01" max={applyingSupAdv.balanceUSD}
                  value={supApplyAmt} onChange={e => setSupApplyAmt(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">ID Cuenta por Pagar (CxP)</label>
                <select value={supApplyApId} onChange={e => setSupApplyApId(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-blue-400">
                  <option value="">— Sin vincular a CxP (solo registrar) —</option>
                  {apEntries.filter(ap => ap.status !== 'PAID' && ap.supplier.toLowerCase().includes(applyingSupAdv.supplierName.toLowerCase().split(' ')[0])).map(ap => (
                    <option key={ap.id} value={ap.id}>{ap.id} — {ap.supplier} — ${Number(ap.balanceUSD ?? 0).toFixed(2)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Referencia / Motivo *</label>
                <input type="text" placeholder="Ej: Aplicado a factura F-0088"
                  value={supApplyRef} onChange={e => setSupApplyRef(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setApplyingSupAdv(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                disabled={supApplyLoading || !supApplyRef.trim() || parseFloat(supApplyAmt) <= 0}
                onClick={async () => {
                  if (!applyingSupAdv) return;
                  setSupApplyLoading(true);
                  try {
                    await dataService.manualApplySupplierAdvance({
                      advanceId: applyingSupAdv.id,
                      supplierName: applyingSupAdv.supplierName,
                      amountToApplyUSD: parseFloat(supApplyAmt),
                      referenceNote: supApplyRef.trim(),
                      apEntryId: supApplyApId || undefined,
                      actor: dataService.getCurrentUser()?.name ?? 'Sistema'
                    });
                    setSupAdvHistory(p => { const n = { ...p }; delete n[applyingSupAdv.id]; return n; });
                    await loadSupplierAdvances(supAdvShowApplied);
                    setApplyingSupAdv(null);
                  } catch (e: any) {
                    alert(e?.message ?? 'Error aplicando anticipo');
                  } finally { setSupApplyLoading(false); }
                }}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20">
                {supApplyLoading ? 'Aplicando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal aplicar anticipo manualmente */}
      {applyingAdv && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-amber-700 px-6 py-4 flex items-center gap-3">
              <Wallet className="w-5 h-5 text-amber-200" />
              <div>
                <h3 className="font-black text-white text-sm uppercase tracking-wide">Aplicar Anticipo</h3>
                <p className="text-amber-200 text-[10px] font-bold">{applyingAdv.customerName}</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 rounded-2xl p-4 space-y-1 text-[11px]">
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Saldo disponible:</span><span className="font-black text-amber-700">${applyingAdv.balanceUSD.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Moneda:</span><span className="font-black text-slate-700">{applyingAdv.currency ?? 'USD'}</span></div>
                <div className="flex justify-between"><span className="text-slate-500 font-bold">Origen:</span><span className="font-mono text-slate-600">{applyingAdv.originCorrelativo}</span></div>
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Monto a aplicar ($)</label>
                <input type="number" step="0.01" min="0.01" max={applyingAdv.balanceUSD}
                  value={applyAmt} onChange={e => setApplyAmt(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:outline-none focus:border-amber-400" />
              </div>
              <div>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Referencia / Motivo</label>
                <input type="text" placeholder="Ej: Factura F-0042 cobrada en efectivo"
                  value={applyRef} onChange={e => setApplyRef(e.target.value)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-amber-400" />
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button onClick={() => setApplyingAdv(null)}
                className="flex-1 py-2.5 border border-slate-200 rounded-xl text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50 transition-all">
                Cancelar
              </button>
              <button
                disabled={applyLoading || !applyRef.trim() || parseFloat(applyAmt) <= 0}
                onClick={async () => {
                  if (!applyingAdv) return;
                  setApplyLoading(true);
                  try {
                    await dataService.manualApplyClientAdvance({
                      advanceId: applyingAdv.id,
                      customerId: applyingAdv.customerId,
                      amountToApplyUSD: parseFloat(applyAmt),
                      referenceNote: applyRef.trim(),
                      actor: dataService.getCurrentUser()?.name ?? 'Sistema'
                    });
                    setAdvHistory(p => { const n = { ...p }; delete n[applyingAdv.id]; return n; });
                    await loadAdvances(advShowApplied);
                    setApplyingAdv(null);
                  } catch (e: any) {
                    alert(e?.message ?? 'Error aplicando anticipo');
                  } finally {
                    setApplyLoading(false);
                  }
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[10px] font-black uppercase transition-all disabled:opacity-50 shadow-lg shadow-amber-600/20">
                {applyLoading ? 'Aplicando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Cobro CxC */}
      {showARCollectModal && arCollectTarget && !arCollectLastReceipt && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-800 px-6 py-4 flex items-center gap-3">
              <CreditCard className="w-5 h-5 text-emerald-300 shrink-0" />
              <div>
                <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">Recibir Pago CxC</p>
                <p className="text-white font-black text-base leading-tight">{arCollectTarget.customerName}</p>
                <p className="text-emerald-200 text-[9px]">Fact: {arCollectTarget.saleCorrelativo} · Saldo: ${Number(arCollectTarget.balanceUSD ?? 0).toFixed(2)}</p>
              </div>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Monto USD *</label>
                  <input
                    type="number" min="0.01" step="0.01"
                    value={arCollectAmount}
                    onChange={e => setArCollectAmount(e.target.value)}
                    placeholder={`Máx: ${Number(arCollectTarget.balanceUSD ?? 0).toFixed(2)}`}
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-[12px] font-black outline-none"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Método</label>
                  <select
                    value={arCollectMethod}
                    onChange={async (e) => {
                      const v = e.target.value;
                      setArCollectMethod(v);
                      const bankOptions = getARCollectBankOptions(v);
                      const nextBankId = String(bankOptions[0]?.id ?? '');
                      const accountOptions = getARCollectAccountOptions(nextBankId, v);
                      setArCollectBankId(nextBankId);
                      setArCollectAccountId(String(accountOptions[0]?.id ?? ''));
                      setArCollectBank('');
                      if (getAPPaymentCurrency(v) === 'VES') setArCollectRate(String(exchangeRate));
                      if (v === 'others' && arCollectTarget?.customerId) {
                        setArCollectAdvanceBalance(null);
                        try {
                          const b = await dataService.getClientAdvanceBalance(String(arCollectTarget.customerId));
                          setArCollectAdvanceBalance(Number(b) || 0);
                        } catch {
                          setArCollectAdvanceBalance(0);
                        }
                      }
                    }}
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2.5 text-[11px] font-black outline-none"
                  >
                    {paymentMethodOptions.filter(m => m.id !== 'credit').concat([{ id: 'others', label: 'Otros' }]).map(m => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {getAPPaymentCurrency(arCollectMethod) === 'VES' && arCollectMethod !== 'others' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Tasa recibida</label>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={arCollectRate}
                      onChange={e => setArCollectRate(e.target.value)}
                      placeholder="Ej: 48.712"
                      className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Bs al banco</label>
                    <div className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-xl px-3 py-2 text-[11px] font-black text-emerald-700">
                      Bs {(() => {
                        const amount = Number(String(arCollectAmount || '').replace(',', '.')) || 0;
                        const rate = Number(String(arCollectRate || '').replace(',', '.')) || 0;
                        return (Math.round(amount * rate * 100) / 100).toFixed(2);
                      })()}
                    </div>
                  </div>
                </div>
              )}
              {arCollectMethod === 'others' && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2.5 text-[10px] text-amber-950 space-y-1">
                  <p className="font-black uppercase tracking-widest text-[9px] text-amber-800">Otros — cruce con anticipo del cliente</p>
                  <p className="font-bold leading-snug">
                    {arCollectAdvanceBalance === null
                      ? 'Consultando saldo a favor…'
                      : (arCollectAdvanceBalance ?? 0) < 0.01
                        ? 'Este cliente no tiene anticipos disponibles. Use otro método o registre un anticipo en Finanzas → Anticipos.'
                        : `Saldo anticipos disponible: $${(arCollectAdvanceBalance ?? 0).toFixed(2)} · Se descontará de anticipos y se abonará a esta factura (sin movimiento de caja).`}
                  </p>
                </div>
              )}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                  Banco / Entidad {arCollectMethod === 'others' ? <span className="text-slate-400 font-bold normal-case">(opcional)</span> : null}
                </label>
                {(() => {
                  const bankOptions = getARCollectBankOptions(arCollectMethod);
                  const isCash = arCollectMethod === 'cash_usd' || arCollectMethod === 'cash_ves';
                  if (arCollectMethod === 'others' || isCash) {
                    return (
                      <input
                        type="text" value={arCollectBank} onChange={e => setArCollectBank(e.target.value)}
                        placeholder={arCollectMethod === 'others' ? 'No requiere banco al usar anticipo' : 'Caja/Efectivo automático'}
                        disabled={arCollectMethod === 'others' || isCash}
                        className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                    );
                  }
                  return (
                    <select
                      value={arCollectBankId}
                      onChange={(e) => {
                        const nextBankId = e.target.value;
                        setArCollectBankId(nextBankId);
                        const accountOptions = getARCollectAccountOptions(nextBankId, arCollectMethod);
                        setArCollectAccountId(String(accountOptions[0]?.id ?? ''));
                      }}
                      className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none"
                    >
                      <option value="">Seleccione banco</option>
                      {bankOptions.map((bank: any) => (
                        <option key={String(bank?.id ?? '')} value={String(bank?.id ?? '')}>{String(bank?.name ?? '')}</option>
                      ))}
                    </select>
                  );
                })()}
              </div>
              {arCollectMethod !== 'others' && arCollectMethod !== 'cash_usd' && arCollectMethod !== 'cash_ves' && (
                <div>
                  <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Cuenta</label>
                  <select
                    value={arCollectAccountId}
                    onChange={(e) => setArCollectAccountId(e.target.value)}
                    className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none"
                  >
                    <option value="">Seleccione cuenta</option>
                    {getARCollectAccountOptions(arCollectBankId, arCollectMethod).map((account: any) => (
                      <option key={String(account?.id ?? '')} value={String(account?.id ?? '')}>
                        {String(account?.label ?? account?.accountNumber ?? account?.id ?? '')} · {String(account?.currency ?? '')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Referencia</label>
                <input
                  type="text" value={arCollectRef} onChange={e => setArCollectRef(e.target.value)}
                  placeholder="N° de confirmación / referencia"
                  className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none"
                />
              </div>
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 block mb-1">Nota interna</label>
                <input
                  type="text" value={arCollectNote} onChange={e => setArCollectNote(e.target.value)}
                  placeholder="Opcional"
                  className="w-full bg-slate-50 border-2 border-slate-200 focus:border-emerald-400 rounded-xl px-3 py-2 text-[11px] font-black outline-none"
                />
              </div>
              {arCollectError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[10px] font-bold">{arCollectError}</div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => {
                    setShowARCollectModal(false);
                    setArCollectTarget(null);
                    setArCollectAdvanceBalance(null);
                  }}
                  disabled={arCollectSubmitting}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >Cancelar</button>
                <button
                  onClick={handleARCollectSubmit}
                  disabled={
                    arCollectSubmitting ||
                    !arCollectAmount ||
                    (arCollectMethod === 'others' && (arCollectAdvanceBalance ?? 0) < 0.01)
                  }
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {arCollectSubmitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</> : 'Registrar Pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de éxito + imprimir recibo */}
      {showARCollectModal && arCollectLastReceipt && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-700 px-6 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-white mx-auto mb-3" />
              <p className="text-[9px] font-black text-emerald-200 uppercase tracking-widest">Pago Registrado</p>
              <p className="text-3xl font-black text-white mt-1">${arCollectLastReceipt.amountUSD.toFixed(2)}</p>
              <p className="text-emerald-200 text-[9px] mt-1">
                {arCollectLastReceipt.balanceAfterUSD <= 0 ? '✅ Cuenta saldada' : `Saldo restante: $${arCollectLastReceipt.balanceAfterUSD.toFixed(2)}`}
              </p>
            </div>
            <div className="p-5 space-y-2">
              <button
                onClick={() => printService.printARPaymentReceipt(arCollectLastReceipt)}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Imprimir Recibo
              </button>
              <button
                onClick={() => {
                  setShowARCollectModal(false);
                  setArCollectTarget(null);
                  setArCollectLastReceipt(null);
                  setArCollectAdvanceBalance(null);
                }}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showCreateLoanModal && (() => {
        const roleMap: Record<string, string> = { EMPLOYEE: 'EMPLEADO', PARTNER: 'SOCIO' };
        const companyRoleFilter = roleMap[loanForm.beneficiaryType];
        const loanCandidates = dataService.getUsers().filter(u =>
          u.active && u.companyRole === companyRoleFilter
        );
        const q = loanBenSearch.trim().toLowerCase();
        const filteredCandidates = q
          ? loanCandidates.filter(u =>
              u.name.toLowerCase().includes(q) ||
              (u.cedula ?? '').toLowerCase().includes(q) ||
              (u.email ?? '').toLowerCase().includes(q)
            )
          : loanCandidates;
        const selectedBen = loanCandidates.find(u => u.name === loanForm.beneficiaryName);
        return (
        <div className="fixed inset-0 z-[120] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setLoanBenOpen(false)}>
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 px-6 py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {selectedBen?.photoURL ? (
                  <img src={selectedBen.photoURL} alt={selectedBen.name}
                    className="w-12 h-12 rounded-2xl object-cover border-2 border-emerald-400/40 shadow-lg shrink-0"/>
                ) : selectedBen ? (
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black border-2 border-white/10 shrink-0
                    ${loanForm.beneficiaryType === 'PARTNER' ? 'bg-violet-900/60 text-violet-300' : 'bg-emerald-900/60 text-emerald-300'}`}>
                    {selectedBen.name.charAt(0)}
                  </div>
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border-2 border-dashed border-white/20 flex items-center justify-center shrink-0">
                    <Users className="w-5 h-5 text-slate-500"/>
                  </div>
                )}
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Préstamos internos</p>
                  <h4 className="font-black text-lg text-white tracking-tight">
                    {selectedBen ? selectedBen.name : 'Registrar Préstamo'}
                  </h4>
                  {selectedBen?.cedula && (
                    <p className="text-[9px] text-slate-400 font-bold">CI/RIF: {selectedBen.cedula}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => { if (!loanSubmitting) { setShowCreateLoanModal(false); setLoanBenSearch(''); setLoanBenOpen(false); } }}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 transition-all"
                disabled={loanSubmitting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Tipo beneficiario */}
              <div className="md:col-span-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Tipo de beneficiario</p>
                <div className="flex gap-2">
                  {([['EMPLOYEE', 'Trabajador / Empleado'], ['PARTNER', 'Socio']] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => {
                        setLoanForm(p => ({ ...p, beneficiaryType: val, beneficiaryName: '', beneficiaryId: '' }));
                        setLoanBenSearch(''); setLoanBenOpen(false);
                      }}
                      className={`flex-1 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 transition-all
                        ${loanForm.beneficiaryType === val
                          ? val === 'PARTNER' ? 'bg-violet-600 border-violet-600 text-white' : 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                      {label}
                      <span className={`ml-1.5 text-[8px] px-1.5 py-0.5 rounded-full font-black
                        ${loanForm.beneficiaryType === val ? 'bg-white/20' : 'bg-slate-100'}`}>
                        {dataService.getUsers().filter(u => u.active && u.companyRole === (val === 'EMPLOYEE' ? 'EMPLEADO' : 'SOCIO')).length}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Buscador inteligente de beneficiario */}
              <div className="md:col-span-2 relative">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Buscar {loanForm.beneficiaryType === 'EMPLOYEE' ? 'empleado' : 'socio'} *
                </p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"/>
                  <input
                    type="text"
                    value={loanBenSearch || loanForm.beneficiaryName}
                    onChange={e => {
                      setLoanBenSearch(e.target.value);
                      setLoanForm(p => ({ ...p, beneficiaryName: e.target.value, beneficiaryId: '' }));
                      setLoanBenOpen(true);
                    }}
                    onFocus={() => setLoanBenOpen(true)}
                    placeholder={`Nombre, cédula o correo del ${loanForm.beneficiaryType === 'EMPLOYEE' ? 'empleado' : 'socio'}...`}
                    className="w-full border-2 border-slate-200 rounded-2xl pl-9 pr-4 py-3 text-sm font-bold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
                  />
                  {loanForm.beneficiaryName && (
                    <button type="button"
                      onClick={() => { setLoanForm(p => ({ ...p, beneficiaryName: '', beneficiaryId: '' })); setLoanBenSearch(''); setLoanBenOpen(false); }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-slate-500 transition-all">
                      <X className="w-3.5 h-3.5"/>
                    </button>
                  )}
                </div>

                {/* Dropdown resultados */}
                {loanBenOpen && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                    {filteredCandidates.length === 0 ? (
                      <div className="px-4 py-6 text-center">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {loanCandidates.length === 0
                            ? `Sin ${loanForm.beneficiaryType === 'EMPLOYEE' ? 'empleados' : 'socios'} registrados en el sistema`
                            : 'Sin resultados para esa búsqueda'}
                        </p>
                        {loanCandidates.length === 0 && (
                          <p className="text-[9px] text-slate-400 mt-1">Asigna el rol en Seguridad → editar usuario → Rol en empresa</p>
                        )}
                      </div>
                    ) : (
                      filteredCandidates.map(u => (
                        <button key={u.id} type="button"
                          onClick={() => {
                            setLoanForm(p => ({ ...p, beneficiaryName: u.name, beneficiaryId: u.cedula ?? '' }));
                            setLoanBenSearch('');
                            setLoanBenOpen(false);
                          }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-emerald-50 transition-all border-b border-slate-50 last:border-0 text-left">
                          {u.photoURL ? (
                            <img src={u.photoURL} alt={u.name} className="w-9 h-9 rounded-xl object-cover shrink-0"/>
                          ) : (
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0
                              ${u.companyRole === 'SOCIO' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {u.name.charAt(0)}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-black text-slate-900 truncate">{u.name}</p>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                              {u.cedula && <span className="text-[9px] font-bold text-slate-500">CI/RIF: {u.cedula}</span>}
                              {u.email && <span className="text-[9px] font-mono text-slate-400 truncate">{u.email}</span>}
                            </div>
                          </div>
                          <span className={`text-[8px] font-black px-2 py-0.5 rounded-full uppercase shrink-0
                            ${u.companyRole === 'SOCIO' ? 'bg-violet-100 text-violet-600' : 'bg-emerald-100 text-emerald-600'}`}>
                            {u.companyRole}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Documento / Cédula — auto-llenado pero editable */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Documento / Cédula</p>
                <input
                  value={loanForm.beneficiaryId}
                  onChange={e => setLoanForm(p => ({ ...p, beneficiaryId: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                  placeholder="Auto-detectado o manual"
                />
              </div>

              {/* Monto */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Monto USD *</p>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-sm">$</span>
                  <input type="number" min="0.01" step="0.01" value={loanForm.amountUSD}
                    onChange={e => setLoanForm(p => ({ ...p, amountUSD: e.target.value }))}
                    className="w-full border border-slate-200 rounded-2xl pl-7 pr-3 py-2.5 text-sm font-black outline-none focus:border-emerald-500 transition-all"
                    placeholder="0.00"/>
                </div>
              </div>

              {/* Concepto */}
              <div className="md:col-span-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Concepto *</p>
                <input value={loanForm.description}
                  onChange={e => setLoanForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                  placeholder="Motivo del préstamo"/>
              </div>

              {/* Plazo + Método */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Plazo (días)</p>
                <input type="number" min="1" step="1" value={loanForm.daysToPay}
                  onChange={e => setLoanForm(p => ({ ...p, daysToPay: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"/>
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Método salida</p>
                <select value={loanForm.sourceMethod}
                  onChange={e => setLoanForm(p => ({ ...p, sourceMethod: e.target.value, sourceBankName: '', sourceBankId: '', sourceAccountId: '' }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all bg-white">
                  <option value="cash_usd">Efectivo USD</option>
                  <option value="cash_ves">Efectivo Bs</option>
                  <option value="transfer">Transferencia</option>
                  <option value="mobile">Pago Móvil</option>
                  <option value="zelle">Zelle</option>
                  <option value="debit">Débito</option>
                  <option value="other">Otro</option>
                </select>
              </div>

              {/* Banco + Cuenta (solo si no es efectivo) */}
              {(() => {
                const isCash = loanForm.sourceMethod === 'cash_usd' || loanForm.sourceMethod === 'cash_ves';
                const loanBankOptions = isCash ? [] : activeBanks.filter((b: any) => {
                  const sm = Array.isArray(b?.supportedMethods) ? b.supportedMethods : [];
                  return sm.length === 0 || sm.includes(loanForm.sourceMethod);
                });
                const loanSelectedBank = loanBankOptions.find((b: any) => String(b.id) === loanForm.sourceBankId);
                const loanAccountCurrency = (loanForm.sourceMethod === 'zelle' || loanForm.sourceMethod === 'digital_usd') ? 'USD' : loanForm.sourceMethod === 'cash_usd' ? 'USD' : 'VES';
                const loanAccountOptions = loanSelectedBank
                  ? (() => {
                      const accs = Array.isArray(loanSelectedBank.accounts) ? loanSelectedBank.accounts : [];
                      const match = accs.filter((a: any) => String(a?.currency ?? '').toUpperCase() === loanAccountCurrency);
                      return match.length > 0 ? match : accs;
                    })()
                  : [];
                if (isCash) return (
                  <div className="md:col-span-2 bg-slate-50 rounded-2xl px-4 py-2.5 flex items-center gap-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Banco:</span>
                    <span className="text-sm font-black text-slate-700">{loanForm.sourceMethod === 'cash_usd' ? 'Efectivo USD (Caja)' : 'Efectivo Bs (Caja)'}</span>
                  </div>
                );
                return (
                  <>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Banco origen</p>
                      <select value={loanForm.sourceBankId ?? ''}
                        onChange={e => {
                          const bid = e.target.value;
                          const bank = loanBankOptions.find((b: any) => String(b.id) === bid);
                          setLoanForm(p => ({ ...p, sourceBankId: bid, sourceBankName: bank ? String(bank.name) : '', sourceAccountId: '' }));
                        }}
                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all bg-white">
                        <option value="">Seleccionar banco...</option>
                        {loanBankOptions.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                      {loanBankOptions.length === 0 && (
                        <p className="text-[10px] text-amber-600 font-bold mt-1">Sin bancos configurados para este método.</p>
                      )}
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Cuenta</p>
                      <select value={loanForm.sourceAccountId ?? ''}
                        onChange={e => setLoanForm(p => ({ ...p, sourceAccountId: e.target.value }))}
                        disabled={!loanForm.sourceBankId}
                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all bg-white disabled:opacity-50">
                        <option value="">Seleccionar cuenta...</option>
                        {loanAccountOptions.map((a: any) => (
                          <option key={a.id} value={a.id}>{a.label}{a.accountNumber ? ` · ${a.accountNumber.slice(-4)}` : ''}</option>
                        ))}
                      </select>
                    </div>
                  </>
                );
              })()}

              {/* Referencia */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Referencia</p>
                <input value={loanForm.reference}
                  onChange={e => setLoanForm(p => ({ ...p, reference: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                  placeholder="Referencia bancaria/documento"/>
              </div>

              {/* Nota */}
              <div className="md:col-span-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Nota</p>
                <input value={loanForm.note}
                  onChange={e => setLoanForm(p => ({ ...p, note: e.target.value }))}
                  className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm font-bold outline-none focus:border-emerald-500 transition-all"
                  placeholder="Observación para auditoría"/>
              </div>

              {loanError && (
                <div className="md:col-span-2 flex items-center gap-2 text-[10px] font-black text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
                  <X className="w-3.5 h-3.5 shrink-0"/> {loanError}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex justify-between items-center gap-2">
              <div>
                {selectedBen && (
                  <div className="flex items-center gap-2">
                    {selectedBen.photoURL
                      ? <img src={selectedBen.photoURL} alt="" className="w-7 h-7 rounded-xl object-cover"/>
                      : <div className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs font-black
                          ${loanForm.beneficiaryType === 'PARTNER' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {selectedBen.name.charAt(0)}
                        </div>
                    }
                    <span className="text-[10px] font-black text-slate-600">{selectedBen.name}</span>
                    {selectedBen.cedula && <span className="text-[9px] text-slate-400 font-bold">{selectedBen.cedula}</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setShowCreateLoanModal(false); setLoanBenSearch(''); setLoanBenOpen(false); }}
                  className="px-4 py-2 rounded-2xl border border-slate-200 text-[10px] font-black uppercase text-slate-600 bg-white hover:bg-slate-100 transition-all"
                  disabled={loanSubmitting}>Cancelar</button>
                <button onClick={handleCreateLoan}
                  className="px-5 py-2 rounded-2xl text-[10px] font-black uppercase text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-all flex items-center gap-1.5"
                  disabled={loanSubmitting}>
                  {loanSubmitting ? <><Loader2 className="w-3 h-3 animate-spin"/> Guardando...</> : <><Check className="w-3 h-3"/> Registrar préstamo</>}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   FEAT-14: PaymentCalendar — inline below FinanceView body
───────────────────────────────────────────────────────── */
export function PaymentCalendar({ arEntries, apEntries, calendarDate, setCalendarDate, calendarSelectedDay, setCalendarSelectedDay, calendarView, setCalendarView }: {
  arEntries: any[];
  apEntries: any[];
  calendarDate: Date;
  setCalendarDate: (d: Date) => void;
  calendarSelectedDay: string | null;
  setCalendarSelectedDay: (d: string | null) => void;
  calendarView: 'month' | 'list';
  setCalendarView: (v: 'month' | 'list') => void;
}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [selectedEntry, setSelectedEntry] = React.useState<{ entry: any; type: 'AR' | 'AP' } | null>(null);
  const [copied, setCopied] = React.useState(false);

  const handleCopyPhone = (phone: string) => {
    navigator.clipboard.writeText(phone).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }).catch(() => {});
  };

  const getEntryContact = (entry: any, type: 'AR' | 'AP') => {
    if (type === 'AR') {
      const client = clientService.findClient(entry.customerId);
      return {
        name: entry.customerName,
        id: entry.customerId,
        phone: client?.phone ?? '',
        address: client?.address ?? '',
        type: client?.type ?? 'Natural',
        allEntries: arEntries.filter(e => e.customerId === entry.customerId && e.status !== 'PAID' && e.status !== 'VOID'),
      };
    } else {
      const sup = supplierService.findSupplier(entry.supplierId ?? entry.supplier);
      return {
        name: entry.supplier,
        id: entry.supplierId ?? sup?.id ?? '',
        phone: sup?.phone ?? '',
        address: sup?.address ?? '',
        type: 'Proveedor',
        allEntries: apEntries.filter(e => (e.supplierId ?? e.supplier) === (entry.supplierId ?? entry.supplier) && e.status !== 'PAID'),
      };
    }
  };

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay(); // 0=Sun

  // Build day cells
  const days: string[] = [];
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  // Group entries by dueDate YYYY-MM-DD
  const arOpen = arEntries.filter(e => e.status !== 'PAID' && e.status !== 'VOID');
  const apOpen = apEntries.filter(e => e.status !== 'PAID');

  const arByDay: Record<string, any[]> = {};
  const apByDay: Record<string, any[]> = {};
  arOpen.forEach(e => {
    const k = new Date(e.dueDate).toISOString().split('T')[0];
    (arByDay[k] = arByDay[k] ?? []).push(e);
  });
  apOpen.forEach(e => {
    const k = new Date(e.dueDate).toISOString().split('T')[0];
    (apByDay[k] = apByDay[k] ?? []).push(e);
  });

  // Summary for selected day
  const selectedAR = calendarSelectedDay ? (arByDay[calendarSelectedDay] ?? []) : [];
  const selectedAP = calendarSelectedDay ? (apByDay[calendarSelectedDay] ?? []) : [];

  // List view: all pending sorted by dueDate within this month (or all future)
  const listItems = [
    ...arOpen.map(e => ({ ...e, _type: 'AR' as const })),
    ...apOpen.map(e => ({ ...e, _type: 'AP' as const })),
  ].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const prevMonth = () => {
    const d = new Date(year, month - 1, 1);
    setCalendarDate(d);
  };
  const nextMonth = () => {
    const d = new Date(year, month + 1, 1);
    setCalendarDate(d);
  };

  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const DAY_NAMES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 md:p-8 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Finanzas · Vencimientos</p>
            <h3 className="font-headline font-black text-xl md:text-2xl tracking-tighter text-slate-900 uppercase">Calendario de Pagos</h3>
          </div>
          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {(['month','list'] as const).map(v => (
                <button key={v} onClick={() => setCalendarView(v)}
                  className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                    calendarView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>{v === 'month' ? 'Mes' : 'Lista'}</button>
              ))}
            </div>
            {/* Month nav */}
            {calendarView === 'month' && (
              <div className="flex items-center gap-2">
                <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <ChevronLeft className="w-4 h-4 text-slate-500" />
                </button>
                <span className="text-sm font-black text-slate-900 min-w-[130px] text-center">{MONTH_NAMES[month]} {year}</span>
                <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <ChevronRight className="w-4 h-4 text-slate-500" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-slate-100 border-b border-slate-100">
          {[
            { label: 'CxC pendiente', value: `$${arOpen.reduce((s,e) => s + Number(e.balanceUSD??0), 0).toFixed(2)}`, sub: `${arOpen.length} facturas`, color: 'text-emerald-600' },
            { label: 'CxP pendiente', value: `$${apOpen.reduce((s,e) => s + Number(e.balanceUSD??0), 0).toFixed(2)}`, sub: `${apOpen.length} obligaciones`, color: 'text-red-600' },
            { label: 'CxC vencidas', value: `$${arOpen.filter(e=>new Date(e.dueDate)<today).reduce((s,e)=>s+Number(e.balanceUSD??0),0).toFixed(2)}`, sub: `${arOpen.filter(e=>new Date(e.dueDate)<today).length} en mora`, color: 'text-red-500' },
            { label: 'CxP vencidas', value: `$${apOpen.filter(e=>new Date(e.dueDate)<today).reduce((s,e)=>s+Number(e.balanceUSD??0),0).toFixed(2)}`, sub: `${apOpen.filter(e=>new Date(e.dueDate)<today).length} en mora`, color: 'text-red-500' },
          ].map(k => (
            <div key={k.label} className="px-6 py-4">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{k.label}</p>
              <p className={`text-lg font-black font-mono ${k.color}`}>{k.value}</p>
              <p className="text-[8px] text-slate-400 font-bold">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {calendarView === 'month' && (
          <div className="p-4 md:p-6">
            {/* Day headers */}
            <div className="grid grid-cols-7 mb-2">
              {DAY_NAMES.map(d => (
                <div key={d} className="text-center text-[8px] font-black text-slate-400 uppercase tracking-widest py-2">{d}</div>
              ))}
            </div>
            {/* Day cells */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: startOffset }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {days.map(day => {
                const dayAR = arByDay[day] ?? [];
                const dayAP = apByDay[day] ?? [];
                const hasAny = dayAR.length > 0 || dayAP.length > 0;
                const dayDate = new Date(day + 'T00:00:00');
                const isToday = day === today.toISOString().split('T')[0];
                const isOverdue = dayDate < today;
                const isSelected = day === calendarSelectedDay;
                return (
                  <button
                    key={day}
                    onClick={() => setCalendarSelectedDay(isSelected ? null : day)}
                    className={`relative min-h-[52px] md:min-h-[64px] p-1 md:p-2 rounded-2xl border text-left transition-all ${
                      isSelected ? 'bg-slate-900 border-slate-900' :
                      isToday ? 'bg-emerald-50 border-emerald-300' :
                      hasAny ? 'bg-white border-slate-200 hover:border-slate-300' :
                      'bg-slate-50/50 border-transparent hover:bg-slate-50'
                    }`}
                  >
                    <span className={`text-[10px] font-black ${
                      isSelected ? 'text-white' :
                      isToday ? 'text-emerald-700' :
                      'text-slate-600'
                    }`}>{dayDate.getDate()}</span>
                    {/* AR dots */}
                    {dayAR.length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-0.5`}>
                        {dayAR.slice(0, 3).map((_, i) => (
                          <span key={i} className={`w-1.5 h-1.5 rounded-full ${isOverdue ? 'bg-red-500' : 'bg-emerald-400'}`} />
                        ))}
                        {dayAR.length > 3 && <span className={`text-[7px] font-black ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>+{dayAR.length-3}</span>}
                      </div>
                    )}
                    {/* AP dots */}
                    {dayAP.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {dayAP.slice(0, 3).map((_, i) => (
                          <span key={i} className={`w-1.5 h-1.5 rounded-full ${isOverdue ? 'bg-red-400' : 'bg-blue-400'}`} />
                        ))}
                        {dayAP.length > 3 && <span className={`text-[7px] font-black ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>+{dayAP.length-3}</span>}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 pl-2">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400" /><span className="text-[9px] font-black text-slate-400 uppercase">CxC (cobrar)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-blue-400" /><span className="text-[9px] font-black text-slate-400 uppercase">CxP (pagar)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-red-500" /><span className="text-[9px] font-black text-slate-400 uppercase">Vencido</span></div>
            </div>
          </div>
        )}

        {/* List view */}
        {calendarView === 'list' && (
          <div className="divide-y divide-slate-100">
            {listItems.length === 0 && (
              <div className="p-16 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Sin vencimientos pendientes</div>
            )}
            {listItems.map((item, idx) => {
              const due = new Date(item.dueDate);
              const isOverdue = due < today;
              const daysLabel = (() => {
                const diff = Math.ceil((due.getTime() - today.getTime()) / 86400000);
                if (diff < 0) return `Hace ${Math.abs(diff)} día(s)`;
                if (diff === 0) return 'Hoy';
                if (diff === 1) return 'Mañana';
                return `En ${diff} días`;
              })();
              const isActive = selectedEntry?.entry?.id === item.id;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedEntry(isActive ? null : { entry: item, type: item._type })}
                  className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left transition-colors ${
                    isActive
                      ? (item._type === 'AR' ? 'bg-emerald-50' : 'bg-blue-50')
                      : isOverdue ? 'bg-red-50/40 hover:bg-red-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase ${
                      item._type === 'AR' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>{item._type === 'AR' ? 'CxC' : 'CxP'}</span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-900 uppercase truncate">
                        {item._type === 'AR' ? item.customerName : item.supplier}
                      </p>
                      <p className="text-[9px] text-slate-400 font-bold truncate">
                        {item._type === 'AR' ? `Fact: ${item.saleCorrelativo}` : item.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className={`text-[11px] font-black font-mono ${
                        isOverdue ? 'text-red-600' : 'text-slate-900'
                      }`}>${Number(item.balanceUSD ?? 0).toFixed(2)}</p>
                      <p className={`text-[9px] font-bold ${
                        isOverdue ? 'text-red-500' : 'text-slate-400'
                      }`}>{daysLabel}</p>
                    </div>
                    <ExternalLink className="w-3 h-3 text-slate-300" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Day detail panel */}
      {calendarSelectedDay && (selectedAR.length > 0 || selectedAP.length > 0) && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Detalle del día · clic en un registro para ver contacto</p>
              <h4 className="font-headline font-black text-lg tracking-tighter text-slate-900">
                {new Date(calendarSelectedDay + 'T00:00:00').toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h4>
            </div>
            <button onClick={() => { setCalendarSelectedDay(null); setSelectedEntry(null); }} className="p-2 hover:bg-slate-100 rounded-xl">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {selectedAR.map((e: any) => (
              <button
                key={e.id}
                onClick={() => setSelectedEntry(selectedEntry?.entry?.id === e.id ? null : { entry: e, type: 'AR' })}
                className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left transition-colors ${
                  selectedEntry?.entry?.id === e.id ? 'bg-emerald-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase bg-emerald-100 text-emerald-700">CxC</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 uppercase truncate">{e.customerName}</p>
                    <p className="text-[9px] text-slate-400 font-bold">Fact: {e.saleCorrelativo}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-[12px] font-black font-mono text-emerald-700">${Number(e.balanceUSD ?? 0).toFixed(2)}</p>
                  <ExternalLink className="w-3 h-3 text-slate-300" />
                </div>
              </button>
            ))}
            {selectedAP.map((e: any) => (
              <button
                key={e.id}
                onClick={() => setSelectedEntry(selectedEntry?.entry?.id === e.id ? null : { entry: e, type: 'AP' })}
                className={`w-full flex items-center justify-between gap-4 px-6 py-4 text-left transition-colors ${
                  selectedEntry?.entry?.id === e.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 px-2 py-1 rounded-lg text-[8px] font-black uppercase bg-blue-100 text-blue-700">CxP</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-900 uppercase truncate">{e.supplier}</p>
                    <p className="text-[9px] text-slate-400 font-bold truncate">{e.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-[12px] font-black font-mono text-blue-700">${Number(e.balanceUSD ?? 0).toFixed(2)}</p>
                  <ExternalLink className="w-3 h-3 text-slate-300" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Contact / detail drawer */}
      {selectedEntry && (() => {
        const { entry, type } = selectedEntry;
        const contact = getEntryContact(entry, type);
        const isAR = type === 'AR';
        const dueDate = new Date(entry.dueDate);
        const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000);
        const isOverdue = diffDays < 0;
        const totalPending = contact.allEntries.reduce((s: number, e: any) => s + Number(e.balanceUSD ?? 0), 0);
        return (
          <div className={`rounded-[2rem] border shadow-lg overflow-hidden animate-in slide-in-from-bottom-4 duration-300 ${
            isAR ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
          }`}>
            {/* Drawer header */}
            <div className={`p-6 border-b flex items-start justify-between gap-4 ${
              isAR ? 'border-emerald-200 bg-emerald-900' : 'border-blue-200 bg-blue-900'
            }`}>
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-widest text-white/60">
                  {isAR ? 'Cliente · Cuenta por Cobrar' : 'Proveedor · Cuenta por Pagar'}
                </p>
                <h4 className="font-headline font-black text-lg tracking-tighter text-white uppercase truncate">{contact.name}</h4>
                <p className="text-[9px] font-mono text-white/60 mt-0.5">{contact.id}</p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="p-2 hover:bg-white/10 rounded-xl shrink-0">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Contact info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {contact.phone ? (
                  <div className={`flex items-center gap-3 p-4 rounded-2xl ${
                    isAR ? 'bg-white border border-emerald-200' : 'bg-white border border-blue-200'
                  }`}>
                    <div className={`p-2 rounded-xl ${
                      isAR ? 'bg-emerald-100' : 'bg-blue-100'
                    }`}>
                      <Phone className={`w-4 h-4 ${ isAR ? 'text-emerald-700' : 'text-blue-700' }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Teléfono</p>
                      <p className="text-[13px] font-black text-slate-900 font-mono">{contact.phone}</p>
                    </div>
                    <button
                      onClick={() => handleCopyPhone(contact.phone)}
                      className={`p-2 rounded-xl transition-all ${
                        copied ? 'bg-emerald-100 text-emerald-600' : 'hover:bg-slate-100 text-slate-400'
                      }`}
                      title="Copiar número"
                    >
                      {copied ? <CheckIcon className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {contact.phone && (
                      <a
                        href={`https://wa.me/${contact.phone.replace(/\D/g,'')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 rounded-xl hover:bg-green-100 text-slate-400 hover:text-green-600 transition-all"
                        title="Abrir WhatsApp"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200 opacity-50">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase">Sin teléfono registrado</span>
                  </div>
                )}

                {contact.address ? (
                  <div className="flex items-start gap-3 p-4 rounded-2xl bg-white border border-slate-200">
                    <div className="p-2 bg-slate-100 rounded-xl shrink-0">
                      <MapPin className="w-4 h-4 text-slate-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Dirección</p>
                      <p className="text-[10px] font-bold text-slate-700 leading-snug">{contact.address}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-2xl bg-white border border-slate-200 opacity-50">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    <span className="text-[9px] font-black text-slate-400 uppercase">Sin dirección registrada</span>
                  </div>
                )}
              </div>

              {/* This entry highlight */}
              <div className={`rounded-2xl p-4 ${
                isOverdue ? 'bg-red-100 border border-red-200' : (isAR ? 'bg-emerald-100 border border-emerald-200' : 'bg-blue-100 border border-blue-200')
              }`}>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-[8px] font-black uppercase tracking-widest text-slate-500">
                      {isAR ? `Factura: ${entry.saleCorrelativo}` : `ID: ${entry.id}`}
                    </p>
                    <p className={`text-[9px] font-black mt-0.5 ${ isOverdue ? 'text-red-700' : 'text-slate-600' }`}>
                      Vence: {dueDate.toLocaleDateString('es-VE')} · {
                        isOverdue ? `${Math.abs(diffDays)} día(s) vencido` : diffDays === 0 ? 'Hoy' : `En ${diffDays} día(s)`
                      }
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] font-black text-slate-400 uppercase">Saldo esta factura</p>
                    <p className={`text-xl font-black font-mono ${ isOverdue ? 'text-red-700' : (isAR ? 'text-emerald-700' : 'text-blue-700') }`}>
                      ${Number(entry.balanceUSD ?? 0).toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* All pending from same entity */}
              {contact.allEntries.length > 1 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                      Todas las operaciones pendientes ({contact.allEntries.length})
                    </p>
                    <p className={`text-[11px] font-black font-mono ${ isAR ? 'text-emerald-700' : 'text-blue-700' }`}>
                      Total: ${totalPending.toFixed(2)}
                    </p>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {contact.allEntries.map((ae: any) => {
                      const aeDue = new Date(ae.dueDate);
                      const aeOverdue = aeDue < today;
                      return (
                        <div key={ae.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl ${
                          ae.id === entry.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-100'
                        }`}>
                          <div className="min-w-0">
                            <p className={`text-[9px] font-black uppercase truncate ${ ae.id === entry.id ? 'text-white' : 'text-slate-700' }`}>
                              {isAR ? ae.saleCorrelativo : ae.id}
                            </p>
                            <p className={`text-[8px] font-bold ${ ae.id === entry.id ? 'text-slate-400' : (aeOverdue ? 'text-red-500' : 'text-slate-400') }`}>
                              Vence: {aeDue.toLocaleDateString('es-VE')}
                            </p>
                          </div>
                          <p className={`text-[10px] font-black font-mono shrink-0 ${
                            ae.id === entry.id ? 'text-white' : (aeOverdue ? 'text-red-600' : (isAR ? 'text-emerald-700' : 'text-blue-700'))
                          }`}>${Number(ae.balanceUSD ?? 0).toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function FinanceCard({ title, value, unit, trend, variant, progress, icon: Icon, secondaryLabel }: any) {
  const styles: any = {
    dark: 'bg-[#022c22] text-white shadow-2xl shadow-emerald-900/30',
    info: 'bg-white border-2 border-emerald-50 text-slate-900',
    warning: 'bg-white border-2 border-red-50 text-slate-900',
    neutral: 'bg-[#f8fafc] border border-slate-200 text-slate-900 shadow-sm'
  };

  const iconColorMap: any = { dark: 'text-emerald-400', info: 'text-emerald-600', warning: 'text-red-500', neutral: 'text-slate-400' };

  return (
    <div className={`${styles[variant]} p-8 rounded-[2.5rem] flex flex-col transition-all hover:scale-[1.02] cursor-pointer group shrink-0`}>
       <div className="flex justify-between items-start mb-10">
          <p className={`text-[10px] font-black uppercase tracking-[0.2em] transform group-hover:translate-x-1 transition-transform ${variant === 'dark' ? 'text-emerald-400' : 'text-slate-400'}`}>{title}</p>
          <div className={`p-3 rounded-2xl shadow-sm transition-transform group-hover:rotate-12 ${variant === 'dark' ? 'bg-emerald-500 text-emerald-950' : 'bg-slate-100 text-slate-600'}`}>
             <Icon className="w-5 h-5" />
          </div>
       </div>

       <div className="flex items-baseline gap-2 mb-2">
          <h3 className="font-headline text-4xl font-black tracking-tighter leading-none">{value}</h3>
          <span className={`text-[10px] font-black uppercase tracking-widest ${variant === 'dark' ? 'text-emerald-500' : 'text-slate-400'}`}>{unit}</span>
       </div>

       {progress !== undefined ? (
         <div className="mt-auto pt-6">
            <div className="flex justify-between items-center mb-2">
               <span className="text-[8px] font-black uppercase text-slate-400 tracking-widest">{secondaryLabel}</span>
               <span className="text-[10px] font-black text-emerald-600">{progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${progress}%` }}></div>
            </div>
         </div>
       ) : (
         <div className={`mt-auto flex items-center gap-2 pt-6`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${variant === 'warning' ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
            <span className={`text-[9px] font-black uppercase tracking-widest ${variant === 'dark' ? 'text-emerald-400' : (variant === 'warning' ? 'text-red-500' : (variant === 'info' ? 'text-emerald-600' : 'text-slate-400'))}`}>
              {trend}
            </span>
         </div>
       )}
    </div>
  );
}
