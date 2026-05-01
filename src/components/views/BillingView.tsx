import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  Receipt,
  Banknote,
  CheckCircle2,
  Trash2,
  UserPlus,
  AlertCircle,
  Hash,
  ArrowRight,
  PackagePlus,
  ArrowLeft,
  RefreshCw,
  Calculator,
  CreditCard,
  X,
  Layers,
  Loader2,
  RotateCcw
} from 'lucide-react';
import { BillingClient, BillingItem, PaymentMethod } from '../../types/billing';
import { formatQuantity, formatUnitCost } from '../../utils/costCalculations';
import { useHotkeys } from '../../utils/hotkeys';
import { ClientModal } from '../modals/ClientModal';
import { ItemSearchModal } from '../modals/ItemSearchModal';
import { CalculatorModal } from '../modals/CalculatorModal';
import { clientService } from '../../services/clientService';
import { dataService, ClientAdvance, type CashBoxSession } from '../../services/dataService';
import { printService, LetraOptions } from '../../services/printService';
import { useToast } from '../../hooks/useToast';
import { ToastContainer } from '../Toast';
import { ConfirmModal } from '../ConfirmModal';
import { formatDateVE, formatTimeVE } from '../../utils/dateTimeVE';

function QuantityInput({ value, onChange, unit, max, onError }: { value: number, onChange: (val: number) => void, unit: string, max: number, onError?: (msg: string) => void }) {
  const [strValue, setStrValue] = React.useState(value.toString().replace('.', ','));

  React.useEffect(() => {
    setStrValue(value.toString().replace('.', ','));
  }, [value]);

  const handleChange = (newVal: string) => {
    const sanitized = newVal.replace(/[^0-9,.]/g, '');
    setStrValue(sanitized);

    const parsed = parseFloat(sanitized.replace(',', '.'));
    if (!isNaN(parsed)) {
      if (parsed > max) {
        if (onError) onError(`Cantidad excede el stock disponible (${formatQuantity(max)}).`);
        setStrValue(max.toString().replace('.', ','));
        onChange(max);
      } else {
        onChange(parsed);
      }
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <input
        type="text"
        value={strValue}
        onChange={(e) => handleChange(e.target.value)}
        className="w-16 bg-white border border-slate-200 rounded px-2 py-0.5 text-right font-mono text-[11px] font-bold focus:ring-2 focus:ring-emerald-500/10 outline-none"
      />
      <span className="text-[8px] font-black text-slate-300">{unit}</span>
    </div>
  );
}

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amountUSD: number;
  amountVES: number;
  bank?: string;
  bankAccountId?: string;
  bankAccountLabel?: string;
  posTerminalId?: string;
  posTerminalName?: string;
  reference?: string;
  note?: string;
  rateUsed?: number;
  files?: File[];
  supports?: any[];
}

interface BillingSession {
  id: string;
  /** Idempotency key por intento de facturación (INT-01). */
  saleRequestId?: string;
  client: BillingClient | null;
  items: BillingItem[];
  payments: PaymentEntry[];
  captures: string[];
  searchClientId: string;
  label: string;
  selectedIds: string[];
  globalDiscount?: {
    type: 'percent' | 'fixed';
    value: number;
  };
  saleNotes?: string;
}

// Cliente genérico para ventas al contado (sin cliente específico)
const GENERIC_CASH_CLIENT: BillingClient = {
  id: 'CONTADO',
  name: 'VENTA AL CONTADO',
  type: 'Natural',
  phone: '',
  address: '',
  referredBy: '',
  hasCredit: false,
  isSolvent: true,
  creditLimit: 0,
  creditDays: 0
};

export function BillingView({ scaleWeight, exchangeRateBCV = 36.50, exchangeRateInternal = 42.50, arCollectionMode, onClearARCollectionMode, activeCashSession }: { scaleWeight?: number, exchangeRateBCV?: number, exchangeRateInternal?: number, arCollectionMode?: { active: boolean; arEntryId: string; customerId: string; customerName: string; balanceUSD: number; balanceVES: number; description: string; saleCorrelativo: string; } | null, onClearARCollectionMode?: () => void, activeCashSession?: CashBoxSession | null }) {
  const { toasts, showToast, removeToast } = useToast();
  
  // Session Management
  const arBanksFallbackByMethod: Partial<Record<Exclude<PaymentMethod, 'credit'>, string[]>> = {
    transfer: ['BANESCO', 'BANCO DE VENEZUELA', 'MERCANTIL', 'PROVINCIAL', 'BNC', 'OTRO'],
    mobile: ['BANESCO', 'BANCO DE VENEZUELA', 'MERCANTIL', 'PROVINCIAL', 'BNC', 'OTRO'],
    debit: ['BANESCO', 'BANCO DE VENEZUELA', 'MERCANTIL', 'PROVINCIAL', 'BNC', 'OTRO'],
    biopago: ['BANESCO', 'BANCO DE VENEZUELA', 'MERCANTIL', 'PROVINCIAL', 'BNC', 'OTRO'],
    cash_usd: [],
    cash_ves: [],
    zelle: [],
    digital_usd: [],
    others: ['OTRO']
  };

  const banks = dataService.getBanks();
  const posTerminals = dataService.getPOSTerminals();
  const arBanksByMethod = useMemo(() => {
    const byMethod: Partial<Record<Exclude<PaymentMethod, 'credit'>, string[]>> = {};
    const active = (banks || []).filter((b: any) => b?.active !== false);
    const methods: Array<Exclude<PaymentMethod, 'credit'>> = ['transfer', 'mobile', 'debit', 'biopago', 'cash_usd', 'cash_ves', 'zelle', 'digital_usd', 'others'];
    for (const m of methods) {
      if (m === 'others') {
        byMethod[m] = ['OTRO'];
        continue;
      }
      const opts = active
        .filter((b: any) => Array.isArray(b.supportedMethods) && b.supportedMethods.includes(m))
        .map((b: any) => String(b.name ?? '').trim())
        .filter((n: string) => !!n);

      const unique = Array.from(new Set(opts));
      byMethod[m] = unique.length > 0 ? unique : (arBanksFallbackByMethod[m] ?? []);
    }
    return byMethod;
  }, [banks]);

  const roundMoney = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const roundFX = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

  const [sessions, setSessions] = useState<BillingSession[]>([{
    id: Math.random().toString(36).substr(2, 9),
    client: null,
    items: [],
    payments: [],
    captures: [],
    searchClientId: '',
    label: 'Venta 1',
    selectedIds: [],
    globalDiscount: undefined,
    saleNotes: ''
  }]);
  const [activeSessionId, setActiveSessionId] = useState(sessions[0].id);

  const currentSession = sessions.find(s => s.id === activeSessionId) || sessions[0];
  const effectiveCashSession = activeCashSession ?? dataService.getCurrentCashBoxSession();
  const hasCashBoxOpen = !!effectiveCashSession && effectiveCashSession.status === 'OPEN';
  const [realtimeTick, setRealtimeTick] = useState(0);
  const activeClient = React.useMemo(() => {
    if (!currentSession.client) return null;
    return clientService.findClient(currentSession.client.id) ?? currentSession.client;
  }, [currentSession.client, realtimeTick]);

  const clientAccountStatus = React.useMemo(() => {
    const client = activeClient;
    if (!client) {
      return {
        debtUSD: 0,
        openCount: 0,
        overdueCount: 0,
        dueSoonCount: 0,
        creditLimit: 0,
        availableCreditUSD: 0,
        hasCredit: false,
        manualSolvent: true,
        isSolvent: true,
        exceedsLimit: false
      };
    }

    const arEntries = dataService.getAREntries();
    const now = new Date();
    const dueSoonDays = 3;
    const dueSoonThreshold = new Date(now);
    dueSoonThreshold.setDate(dueSoonThreshold.getDate() + dueSoonDays);

    const open = arEntries.filter(ar => ar.customerId === client.id && ar.status !== 'PAID');
    const overdue = open.filter(ar => new Date(ar.dueDate) < now);
    const dueSoon = open.filter(ar => {
      const d = new Date(ar.dueDate);
      return d >= now && d <= dueSoonThreshold;
    });

    const debtUSD = open.reduce((a, b) => a + (b.balanceUSD || 0), 0);
    const creditLimit = client.creditLimit || 0;
    const manualSolvent = client.isSolvent !== false;
    const isSolvent = open.length === 0;
    const exceedsLimit = creditLimit > 0 && debtUSD > creditLimit;
    const availableCreditUSD = creditLimit > 0 ? Math.max(0, roundMoney(creditLimit - debtUSD)) : 0;

    return {
      debtUSD,
      openCount: open.length,
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      creditLimit,
      availableCreditUSD,
      hasCredit: client.hasCredit === true,
      manualSolvent,
      isSolvent,
      exceedsLimit
    };
  }, [activeClient, realtimeTick, sessions]);

  // Helper to update current session
  const updateCurrentSession = (updates: Partial<BillingSession>) => {
    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, ...updates } : s));
  };

  // Logical Stock Reservation Helper - Optimizado con Map para O(1) lookup
  const reservedQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach(s => {
      s.items.forEach(i => {
        map.set(i.code, (map.get(i.code) || 0) + i.qty);
      });
    });
    return map;
  }, [sessions]);
  
  const getReservedQty = React.useCallback((code: string) => {
    return reservedQtyMap.get(code) || 0;
  }, [reservedQtyMap]);

  // Modal de selección de moneda para impresión post-venta
  const [pendingPrintSale, setPendingPrintSale] = useState<any>(null);
  
  // Historial de ventas del turno para reimpresión - Persiste en localStorage vinculado a la sesión de caja
  const getSalesStorageKey = (sessionId: string) => `cashbox_sales_${sessionId}`;
  
  const loadSalesFromStorage = (sessionId: string): Array<{ id: string; correlativo: string; clientName: string; totalUSD: number; totalVES: number; timestamp: Date; paymentMethod: string; sale: any }> => {
    try {
      const data = localStorage.getItem(getSalesStorageKey(sessionId));
      if (!data) return [];
      const parsed = JSON.parse(data);
      // Restaurar fechas como objetos Date
      return parsed.map((sale: any) => ({
        ...sale,
        timestamp: new Date(sale.timestamp)
      }));
    } catch {
      return [];
    }
  };
  
  const saveSalesToStorage = (sessionId: string, sales: Array<{ id: string; correlativo: string; clientName: string; totalUSD: number; totalVES: number; timestamp: Date; paymentMethod: string; sale: any }>) => {
    try {
      localStorage.setItem(getSalesStorageKey(sessionId), JSON.stringify(sales));
    } catch (e) {
      console.error('Error saving sales to localStorage:', e);
    }
  };
  
  const clearSalesStorage = (sessionId: string) => {
    try {
      localStorage.removeItem(getSalesStorageKey(sessionId));
    } catch (e) {
      console.error('Error clearing sales from localStorage:', e);
    }
  };
  
  const recentSales = dataService.getSalesForCurrentSession();
  const canAuditAndReturnAnyInvoice = dataService.hasPermission('SALES_VOID') || dataService.hasPermission('ALL');
  const historySalesSource = React.useMemo(() => {
    if (!canAuditAndReturnAnyInvoice) return recentSales as any[];
    return dataService.getSales().map((s: any) => ({
      id: s.id,
      saleId: s.id,
      correlativo: s.correlativo,
      customerId: s.client?.id,
      customerName: s.client?.name,
      totalUSD: s.totalUSD,
      totalVES: s.totalVES,
      paymentMethod: s.paymentMethod,
      exchangeRate: s.exchangeRate,
      timestamp: s.timestamp,
      items: s.items ?? [],
      payments: s.payments ?? []
    }));
  }, [canAuditAndReturnAnyInvoice, recentSales, realtimeTick]);
  const [showSalesHistoryPanel, setShowSalesHistoryPanel] = useState(false);
  const [saleToReprint, setSaleToReprint] = useState<any>(null);
  const [saleToVoid, setSaleToVoid] = useState<any>(null);
  const [voidReason, setVoidReason] = useState('');
  const [saleToReturn, setSaleToReturn] = useState<any>(null);
  const [returnReason, setReturnReason] = useState('');
  const [returnQtys, setReturnQtys] = useState<Record<string, string>>({});
  const [returningPartial, setReturningPartial] = useState(false);
  const [returnResult, setReturnResult] = useState<{
    creditNoteCorrelativo: string;
    creditNoteAmountUSD: number;
    refundMethod?: string;
    refundBank?: string;
    /** Clave técnica del método (p. ej. mobile) heredada del movimiento, para etiquetas */
    effectiveRefundMethodKey?: string;
    returnedItems?: Array<{ code: string; description: string; qty: number; priceUSD: number; lineTotalUSD: number }>;
    movementDetails?: Array<{ method: string; bank: string; amountUSD: number; amountVES: number; rateUsed: number; reference: string }>;
  } | null>(null);
  const [returnRefundMethod, setReturnRefundMethod] = useState<string>('cash_usd');
  const [returnRefundBank, setReturnRefundBank] = useState<string>('');
  const [returnRefundBankId, setReturnRefundBankId] = useState<string>('');
  const [returnRefundAmountVES, setReturnRefundAmountVES] = useState<string>('');
  /** Carga perezosa de ítems (Supabase + backup cashbox_sales) al abrir devolución */
  const [fetchingReturnSaleId, setFetchingReturnSaleId] = useState<string | null>(null);
  /** Una clave por línea de factura (evita colisión si el mismo código aparece en dos filas) */
  const returnLineKey = (lineIdx: number) => `rline-${lineIdx}`;
  /** Etiqueta amigable para claves tipo mobile, cash_usd (igual que en caja) */
  const paymentMethodKeyLabel = (key: string) => {
    const k = String(key ?? '')
      .toLowerCase()
      .trim();
    const map: Record<string, string> = {
      cash_usd: 'USD efectivo',
      cash_ves: 'Bs efectivo',
      transfer: 'Transferencia',
      mobile: 'Pago móvil',
      zelle: 'Zelle',
      digital_usd: 'USD digital',
      debit: 'Débito',
      biopago: 'Biopago',
      others: 'Otros',
      credit: 'Crédito'
    };
    if (map[k]) return map[k];
    if (k.includes('pago_movil') || k === 'movil' || k === 'pmovil') return 'Pago móvil';
    if (k.includes('transfer')) return 'Transferencia';
    if (k.includes('efectivo_usd') || k.includes('cash usd')) return 'USD efectivo';
    if (k.includes('efectivo_bs') || k.includes('efectivo_ves') || k.includes('cash ves')) return 'Bs efectivo';
    return k ? k.replace(/_/g, ' ') : 'N/A';
  };
  const paymentMethodVisualIcon = (key: string) => {
    const k = String(key ?? '').toLowerCase().trim();
    if (k === 'mobile' || k.includes('pago_movil') || k === 'movil' || k === 'pmovil') return '📱';
    if (k === 'transfer' || k.includes('transfer')) return '🏦';
    if (k === 'debit') return '💳';
    if (k === 'biopago') return '🧬';
    if (k === 'cash_usd' || k.includes('efectivo_usd')) return '💵';
    if (k === 'cash_ves' || k.includes('efectivo_ves') || k.includes('efectivo_bs')) return '💶';
    if (k === 'zelle' || k === 'digital_usd') return '🌐';
    if (k === 'credit') return '🧾';
    return '🔹';
  };
  const returnOriginalPaymentLines = useMemo(() => {
    if (!saleToReturn) return [] as Array<{ method: string; bank: string; amountUSD: number; amountVES: number; rateUsed: number }>;
    const payments = Array.isArray((saleToReturn as any)?.payments) ? (saleToReturn as any).payments : [];
    const lines = payments
      .filter((p: any) => !p?.cashChangeGiven && String(p?.method ?? '') !== 'credit')
      .map((p: any) => ({
        method: String(p?.method ?? saleToReturn.paymentMethod ?? ''),
        bank: String(p?.bank ?? p?.bankName ?? ''),
        amountUSD: Number(p?.amountUSD ?? 0) || 0,
        amountVES: Number(p?.amountVES ?? 0) || 0,
        rateUsed: Number(p?.rateUsed ?? p?.exchangeRate ?? saleToReturn?.exchangeRate ?? 0) || 0
      }));
    if (lines.length > 0) return lines;
    return [{
      method: String(saleToReturn.paymentMethod ?? ''),
      bank: '',
      amountUSD: Number(saleToReturn.totalUSD ?? 0) || 0,
      amountVES: Number(saleToReturn.totalVES ?? 0) || 0,
      rateUsed: Number((saleToReturn as any)?.exchangeRate ?? 0) || 0
    }];
  }, [saleToReturn]);
  const returnAutoPreview = useMemo(() => {
    if (!saleToReturn) return { totalUSD: 0, ratio: 0, lines: [] as Array<{ method: string; bank: string; amountUSD: number; amountVES: number; rateUsed: number }> };
    const rm = (n: number) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
    const totalUSD = (saleToReturn.items || []).reduce((acc: number, item: any, lineIdx: number) => {
      const qty = parseFloat(String(returnQtys[returnLineKey(lineIdx)] ?? '0').replace(',', '.')) || 0;
      return acc + qty * (item.priceUSD ?? 0);
    }, 0);
    const saleTotalUSD = Number(saleToReturn.totalUSD ?? 0) || 0;
    const ratio = saleTotalUSD > 0 ? Math.max(0, Math.min(1, totalUSD / saleTotalUSD)) : 0;
    const base = returnOriginalPaymentLines;
    const lines = base.map((l) => ({
      ...l,
      amountUSD: rm(l.amountUSD * ratio),
      amountVES: rm(l.amountVES * ratio)
    }));
    const targetUSD = rm(base.reduce((a, b) => a + (Number(b.amountUSD ?? 0) || 0), 0) * ratio);
    const targetVES = rm(base.reduce((a, b) => a + (Number(b.amountVES ?? 0) || 0), 0) * ratio);
    const currentUSD = rm(lines.reduce((a, b) => a + b.amountUSD, 0));
    const currentVES = rm(lines.reduce((a, b) => a + b.amountVES, 0));
    if (lines.length > 0) {
      lines[0].amountUSD = rm(lines[0].amountUSD + (targetUSD - currentUSD));
      lines[0].amountVES = rm(lines[0].amountVES + (targetVES - currentVES));
    }
    return { totalUSD, ratio, lines };
  }, [saleToReturn, returnQtys, returnOriginalPaymentLines]);
  const [salesHistoryPage, setSalesHistoryPage] = useState(0);
  const SALES_HISTORY_PAGE_SIZE = 20;
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; danger?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const openConfirm = (title: string, message: string, onConfirm: () => void, danger = false) =>
    setConfirmModal({ open: true, title, message, onConfirm, danger });
  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, open: false }));
  const [voidingSale, setVoidingSale] = useState(false);
  const [salesHistorySearch, setSalesHistorySearch] = useState('');
  const [salesHistoryFilter, setSalesHistoryFilter] = useState<'all' | 'today' | 'hour'>('today');

  // Local UI States
  const [currentPayMethod, setCurrentPayMethod] = useState<PaymentMethod>('cash_ves');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payAmountTouched, setPayAmountTouched] = useState(false);
  const [payBank, setPayBank] = useState<string>('BANESCO');
  const [dxvModeOverride, setDxvModeOverride] = useState<'VES' | 'USD' | null>(null);
  const [payPOSTerminalId, setPayPOSTerminalId] = useState<string>('');
  const [payRef, setPayRef] = useState<string>('');
  const [payNote, setPayNote] = useState<string>('');
  const [payFiles, setPayFiles] = useState<File[]>([]);
  const [customRate, setCustomRate] = useState<string>(exchangeRateInternal.toString());
  // Denominaciones de efectivo en cobro
  const DENOMS_USD = [1, 2, 5, 10, 20, 50, 100];
  const DENOMS_VES = [10, 20, 50, 100, 200, 500];
  const [cashDenomsUSD, setCashDenomsUSD] = useState<{denom: number; qty: number}[]>([]);
  const [cashDenomsVES, setCashDenomsVES] = useState<{denom: number; qty: number}[]>([]);
  const cashTotalUSD = useMemo(() => cashDenomsUSD.reduce((s, b) => s + b.denom * b.qty, 0), [cashDenomsUSD]);
  const cashTotalVES = useMemo(() => cashDenomsVES.reduce((s, b) => s + b.denom * b.qty, 0), [cashDenomsVES]);
  const addDenomUSD = (d: number) => setCashDenomsUSD(prev => { const ex = prev.find(b => b.denom === d); return ex ? prev.map(b => b.denom === d ? {...b, qty: b.qty+1} : b) : [...prev, {denom: d, qty: 1}]; });
  const addDenomVES = (d: number) => setCashDenomsVES(prev => { const ex = prev.find(b => b.denom === d); return ex ? prev.map(b => b.denom === d ? {...b, qty: b.qty+1} : b) : [...prev, {denom: d, qty: 1}]; });
  const updDenomUSD = (d: number, q: number) => setCashDenomsUSD(prev => prev.map(b => b.denom === d ? {...b, qty: Math.max(0,q)} : b));
  const updDenomVES = (d: number, q: number) => setCashDenomsVES(prev => prev.map(b => b.denom === d ? {...b, qty: Math.max(0,q)} : b));
  const remDenomUSD = (d: number) => setCashDenomsUSD(prev => prev.filter(b => b.denom !== d));
  const remDenomVES = (d: number) => setCashDenomsVES(prev => prev.filter(b => b.denom !== d));
  // Estado de vuelto
  const [changeMethod, setChangeMethod] = useState<'cash_usd' | 'cash_ves' | 'mobile' | 'transfer' | 'zelle'>('cash_ves');
  const [changeBank, setChangeBank] = useState<string>('');
  const [changeDeclared, setChangeDeclared] = useState(false);
  const [changeAsAdvance, setChangeAsAdvance] = useState(false);
  const [changeCustomRate, setChangeCustomRate] = useState<string>('');

  // Denominaciones del VUELTO entregado al cliente (flujo A: mismo método al cobrar en efectivo)
  const [changeDenomsUSD, setChangeDenomsUSD] = useState<{denom: number; qty: number}[]>([]);
  const [changeDenomsVES, setChangeDenomsVES] = useState<{denom: number; qty: number}[]>([]);
  const changeDenomsTotalUSD = useMemo(() => changeDenomsUSD.reduce((s, b) => s + b.denom * b.qty, 0), [changeDenomsUSD]);
  const changeDenomsTotalVES = useMemo(() => changeDenomsVES.reduce((s, b) => s + b.denom * b.qty, 0), [changeDenomsVES]);
  const addChangeDenomUSD = (d: number) => setChangeDenomsUSD(prev => { const ex = prev.find(b => b.denom === d); return ex ? prev.map(b => b.denom === d ? {...b, qty: b.qty+1} : b) : [...prev, {denom: d, qty: 1}]; });
  const addChangeDenomVES = (d: number) => setChangeDenomsVES(prev => { const ex = prev.find(b => b.denom === d); return ex ? prev.map(b => b.denom === d ? {...b, qty: b.qty+1} : b) : [...prev, {denom: d, qty: 1}]; });
  const updChangeDenomUSD = (d: number, q: number) => setChangeDenomsUSD(prev => prev.map(b => b.denom === d ? {...b, qty: Math.max(0,q)} : b));
  const updChangeDenomVES = (d: number, q: number) => setChangeDenomsVES(prev => prev.map(b => b.denom === d ? {...b, qty: Math.max(0,q)} : b));
  const remChangeDenomUSD = (d: number) => setChangeDenomsUSD(prev => prev.filter(b => b.denom !== d));
  const remChangeDenomVES = (d: number) => setChangeDenomsVES(prev => prev.filter(b => b.denom !== d));
  // Override manual del total de vuelto entregado (string para permitir edición progresiva)
  const [changeGivenOverride, setChangeGivenOverride] = useState<string>('');

  const handleSelectPayBank = (bank: string) => {
    setPayBank(bank);
    const _subtotal = currentSession.items.reduce((acc, i) => acc + (i.priceUSD * i.qty), 0);
    const _nominalUSD = roundFX(_subtotal);
    const _internalRate = parseFloat(customRate) || exchangeRateInternal;
    const _totalVES = roundMoney(_nominalUSD * _internalRate);
    const _paidUSD = currentSession.payments.reduce((a,p) => a+p.amountUSD, 0);
    const _paidVES = currentSession.payments.reduce((a,p) => a+(p.amountVES||0), 0);

    if (bank === 'CxP' && currentSession?.client) {
      const isCxpVESMode = payNote.includes('TASA:');
      const remainingNominalUSD = _nominalUSD - _paidUSD;
      const remainingVES = _totalVES - _paidVES;
      const toPay = isCxpVESMode ? remainingVES : remainingNominalUSD;
      setPayAmount(String(toPay));
      setPayAmountTouched(true);
    }
    if (bank === 'DxV') {
      // Detectar modo VES mayoritário igual que registeredPaymentsAreVES
      const _excDxV = currentSession.payments.filter(p => !(p.method === 'others' && String(p.bank??'').toUpperCase()==='DXV'));
      const _vesM = new Set(['cash_ves','mobile','transfer','debit','biopago']);
      const _vv = _excDxV.filter(p => _vesM.has(p.method)).reduce((a,p)=>a+(p.amountVES||0),0);
      const _uv = _excDxV.filter(p => !_vesM.has(p.method)).reduce((a,p)=>a+(p.amountUSD||0)*_internalRate,0);
      const _tv = _vv + _uv;
      const isVES = _excDxV.length > 0 && _tv > 0 && (_vv/_tv) >= 0.6;
      setDxvModeOverride(null); // reset override, auto-detect
      if (isVES) {
        const usdMixVES = _excDxV.filter(p=>!_vesM.has(p.method)).reduce((a,p)=>a+(p.amountUSD||0)*_internalRate,0);
        const faltanteVES = roundMoney(Math.max(0, _totalVES - _paidVES - usdMixVES));
        setPayAmount(faltanteVES.toFixed(2));
        setPayNote('DESCUENTO POR VENTA DxV (VES)');
      } else {
        const faltanteUSD = roundFX(Math.max(0, _nominalUSD - _paidUSD));
        setPayAmount(faltanteUSD.toFixed(3));
        setPayNote('DESCUENTO POR VENTA DxV (USD)');
      }
      setPayAmountTouched(true);
    }
  };

  const [creditCurrency, setCreditCurrency] = useState<'USD' | 'VES'>('USD');
  const [creditDownEnabled, setCreditDownEnabled] = useState(false);
  const [creditDownCurrency, setCreditDownCurrency] = useState<'USD' | 'VES'>('USD');
  const [creditDownAmountUSD, setCreditDownAmountUSD] = useState<string>('');
  const [creditDownAmountVES, setCreditDownAmountVES] = useState<string>('');
  const [creditDownRateUsed, setCreditDownRateUsed] = useState<string>(exchangeRateBCV.toString());
  const [creditDownMethod, setCreditDownMethod] = useState<Exclude<PaymentMethod, 'credit'>>('transfer');
  const [creditDownBank, setCreditDownBank] = useState<string>('BANESCO');
  const [creditDownPOSTerminalId, setCreditDownPOSTerminalId] = useState<string>('');
  const [creditDownRef, setCreditDownRef] = useState<string>('');
  const [creditDownFiles, setCreditDownFiles] = useState<File[]>([]);
  const [showClientModal, setShowClientModal] = useState(false);
  const [clientSuggestions, setClientSuggestions] = useState<BillingClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedClientIndex, setSelectedClientIndex] = useState(-1);
  const [showItemModal, setShowItemModal] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showARModal, setShowARModal] = useState(false);
  const [arPage, setArPage] = useState(0);
  const AR_PAGE_SIZE = 10;
  const [showARPaymentModal, setShowARPaymentModal] = useState(false);
  // Local AR collection state when user initiates from within BillingView (same flow as FinanceView's onStartARCollection)
  const [localARCollection, setLocalARCollection] = useState<null | { active: boolean; arEntryId: string; customerId: string; customerName: string; balanceUSD: number; balanceVES: number; description: string; saleCorrelativo: string; }>(null);
  const [arPayTargetId, setArPayTargetId] = useState<string>('');
  const [arPayBalanceUSD, setArPayBalanceUSD] = useState<number>(0);
  const [arPayAmount, setArPayAmount] = useState<string>('');
  const [arPayAmountVES, setArPayAmountVES] = useState<string>('');
  const [arPayCurrency, setArPayCurrency] = useState<'USD' | 'VES'>('USD');
  const [arPayRateUsed, setArPayRateUsed] = useState<string>(exchangeRateBCV.toString());
  const [arPayMethod, setArPayMethod] = useState<Exclude<PaymentMethod, 'credit'>>('transfer');
  const [arPayBank, setArPayBank] = useState<string>('BANESCO');
  const [arPayReference, setArPayReference] = useState<string>('');
  const [arPayManualVES, setArPayManualVES] = useState(false);
  const [arPayNote, setArPayNote] = useState<string>('');
  const [arPayFiles, setArPayFiles] = useState<File[]>([]);
  const [arPaySubmitting, setArPaySubmitting] = useState(false);
  const [arPayError, setArPayError] = useState<string>('');
  // Excedente (overpayment): vuelto / abono a otra factura / anticipo
  const [arPayExcessMode, setArPayExcessMode] = useState<'change' | 'apply_to_ar' | 'advance'>('advance');
  const [arPayChangeMethod, setArPayChangeMethod] = useState<'cash_usd' | 'cash_ves' | 'mobile' | 'transfer' | 'zelle' | 'debit'>('cash_ves');
  const [arPayChangeBank, setArPayChangeBank] = useState<string>('');
  const [arPayChangeRate, setArPayChangeRate] = useState<string>('');
  const [arPaySecondaryArId, setArPaySecondaryArId] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = React.useRef(false);
  const [pendingQty, setPendingQty] = useState(1);
  const [initialSearch, setInitialSearch] = useState('');
  const [searchNotice, setSearchNotice] = useState<{ type: 'error' | 'info', msg: string } | null>(null);
  const [itemSuggestions, setItemSuggestions] = useState<any[]>([]);
  const [showItemSuggestions, setShowItemSuggestions] = useState(false);
  const [selectedItemIndex, setSelectedItemIndex] = useState(-1);
  const [hoveredItem, setHoveredItem] = useState<BillingItem | null>(null);
  const [quickSearch, setQuickSearch] = useState('');
  const [clientAdvanceBalance, setClientAdvanceBalance] = useState<number>(0);
  const [clientAdvances, setClientAdvances] = useState<ClientAdvance[]>([]);
  const [antClienteCurrency, setAntClienteCurrency] = useState<'USD' | 'VES'>('USD');
  const [showProcessConfirm, setShowProcessConfirm] = useState(false);
  const [pendingLetraConfig, setPendingLetraConfig] = useState<{ sale: any; currency: 'USD' | 'VES' } | null>(null);
  const [letraForm, setLetraForm] = useState<LetraOptions>({});

  // Suscribir al historial de ventas del turno activo desde Firestore (cashbox_sales)
  const subscribedSessionIdRef = React.useRef<string>('');
  useEffect(() => {
    const liveCashSession = activeCashSession ?? dataService.getCurrentCashBoxSession();
    const sessionId = liveCashSession?.id ?? '';
    const isOpen = liveCashSession?.status === 'OPEN';

    if (isOpen && sessionId && subscribedSessionIdRef.current !== sessionId) {
      subscribedSessionIdRef.current = sessionId;
      dataService.subscribeCurrentSessionSales(sessionId);
    } else if (!isOpen && liveCashSession) {
      // Sesión confirmada como cerrada — limpiar
      if (subscribedSessionIdRef.current) {
        subscribedSessionIdRef.current = '';
        dataService.clearCurrentSessionSales();
      }
    }
  }, [realtimeTick, activeCashSession?.id, activeCashSession?.status]);
  
  useEffect(() => {
    const unsubscribeData = dataService.subscribe(() => setRealtimeTick((t) => t + 1));
    const unsubscribeClients = clientService.subscribe(() => setRealtimeTick((t) => t + 1));
    return () => {
      unsubscribeData();
      unsubscribeClients();
    };
  }, []);

  const activeClientId = currentSession?.client?.id ?? '';
  useEffect(() => {
    if (!activeClientId) { setClientAdvanceBalance(0); setClientAdvances([]); return; }
    dataService.getClientAdvances(activeClientId).then(list => {
      setClientAdvances(list);
      setClientAdvanceBalance(list.reduce((a, x) => a + x.balanceUSD, 0));
    }).catch(() => { setClientAdvanceBalance(0); setClientAdvances([]); });
  }, [activeClientId]);

  // Effective AR collection mode: either from parent prop (FinanceView) or local state (BillingView's own AR modal)
  const effectiveARCollection = arCollectionMode?.active ? arCollectionMode : localARCollection;
  const clearEffectiveARCollection = () => {
    if (localARCollection) setLocalARCollection(null);
    onClearARCollectionMode?.();
  };

  // AR Collection Mode: Auto-configure session when collecting AR payment via Billing
  useEffect(() => {
    if (!effectiveARCollection?.active) return;
    
    // Clear current session and set up AR collection
    const client = clientService.findClient(effectiveARCollection.customerId);
    if (!client) {
      showToast('Cliente no encontrado para cobranza AR.', 'error');
      return;
    }

    // Create virtual item representing the AR payment
    const arItem: BillingItem = {
      id: `AR_${effectiveARCollection.arEntryId}`,
      code: 'COBRO-AR',
      description: `Cobro AR - ${effectiveARCollection.description} (Fact: ${effectiveARCollection.saleCorrelativo})`,
      unit: 'SERV',
      qty: 1,
      priceUSD: effectiveARCollection.balanceUSD,
      tax: 0,
      dispatchLotes: []
    };

    // Update session with AR item and client
    updateCurrentSession({
      items: [arItem],
      client: client,
      searchClientId: client.id,
      label: `Cobro AR - ${client.name.split(' ')[0]}`,
      payments: [],
      globalDiscount: undefined,
      saleNotes: `Cobro de Cuenta por Cobrar: ${effectiveARCollection.saleCorrelativo}`
    });

    showToast(`Modo Cobranza AR activado. Cliente: ${client.name}`, 'info');
  }, [effectiveARCollection?.active, effectiveARCollection?.arEntryId]);

  useHotkeys({
    'F2': () => createNewSession(),
    'F3': () => setShowCalculator(true),
    'F4': () => setShowClientModal(true),
    'F10': () => {
      if (!hasCashBoxOpen) { showToast('No hay sesión de caja abierta. Abra la caja primero.', 'error'); return; }
      if (currentSession.items.length === 0) { showToast('No hay productos en la venta.', 'warning'); return; }
      setShowProcessConfirm(true);
    },
    'Escape': () => {
      setShowClientModal(false);
      setShowItemModal(false);
      setShowCalculator(false);
      setShowARModal(false);
      setShowARPaymentModal(false);
      setSearchNotice(null);
      setShowSuggestions(false);
      setShowItemSuggestions(false);
    }
  });

  const clientAREntries = React.useMemo(() => {
    if (!activeClient) return [];
    return dataService
      .getAREntries()
      .filter(ar => ar.customerId === activeClient.id && ar.status !== 'PAID')
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [activeClient, clientAccountStatus.openCount, clientAccountStatus.debtUSD, realtimeTick]);

  const handleClientARPayment = (id: string) => {
    const entry = dataService.getAREntries().find(e => e.id === id);
    if (!entry) {
      showToast('No se encontró la cuenta por cobrar.', 'error');
      return;
    }
    const balance = Number(entry.balanceUSD ?? 0) || 0;
    if (balance <= 0) {
      showToast('Esta cuenta no tiene saldo pendiente.', 'warning');
      return;
    }
    // Validar que haya sesión de caja abierta
    const cashSession = dataService.getCurrentCashBoxSession();
    if (!cashSession || cashSession.status !== 'OPEN') {
      showToast('Debe abrir una sesión de caja antes de cobrar CxC.', 'warning');
      return;
    }
    // Activar el flujo de Caja (igual que "Cobrar en Caja" desde Finanzas)
    setLocalARCollection({
      active: true,
      arEntryId: entry.id,
      customerId: entry.customerId,
      customerName: entry.customerName,
      balanceUSD: balance,
      balanceVES: Math.round(balance * exchangeRateBCV * 100) / 100,
      description: entry.description,
      saleCorrelativo: entry.saleCorrelativo
    });
    setShowARModal(false);
  };

  const arPayRateNumber = useMemo(() => {
    const n = parseFloat((arPayRateUsed || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [arPayRateUsed]);

  const arPaySuggestedVES = useMemo(() => {
    if (!arPayBalanceUSD || !arPayRateNumber) return 0;
    return roundMoney(arPayBalanceUSD * arPayRateNumber);
  }, [arPayBalanceUSD, arPayRateNumber]);

  const activePOSTerminals = useMemo(() => (posTerminals || []).filter((t: any) => t?.active !== false), [posTerminals]);
  const selectedPayPOSTerminal = useMemo(() => activePOSTerminals.find((t: any) => String(t?.id ?? '') === String(payPOSTerminalId ?? '')) ?? null, [activePOSTerminals, payPOSTerminalId]);
  const selectedCreditDownPOSTerminal = useMemo(() => activePOSTerminals.find((t: any) => String(t?.id ?? '') === String(creditDownPOSTerminalId ?? '')) ?? null, [activePOSTerminals, creditDownPOSTerminalId]);
  const payPOSTerminalOptions = useMemo(() => {
    if (currentPayMethod !== 'debit' && currentPayMethod !== 'biopago') return [];
    return activePOSTerminals.filter((t: any) =>
      Array.isArray(t?.supportedMethods) && t.supportedMethods.includes(currentPayMethod) &&
      (!payBank || String(t?.bankName ?? '').trim().toUpperCase() === String(payBank ?? '').trim().toUpperCase())
    );
  }, [activePOSTerminals, currentPayMethod, payBank]);
  const creditDownPOSTerminalOptions = useMemo(() => {
    if (creditDownMethod !== 'debit' && creditDownMethod !== 'biopago') return [];
    return activePOSTerminals.filter((t: any) =>
      Array.isArray(t?.supportedMethods) && t.supportedMethods.includes(creditDownMethod) &&
      (!creditDownBank || String(t?.bankName ?? '').trim().toUpperCase() === String(creditDownBank ?? '').trim().toUpperCase())
    );
  }, [activePOSTerminals, creditDownMethod, creditDownBank]);

  useEffect(() => {
    const opts = arBanksByMethod[arPayMethod] ?? [];
    if (opts.length === 0) {
      if (arPayBank) setArPayBank('');
      return;
    }
    if (!arPayBank || !opts.includes(arPayBank)) {
      setArPayBank(opts[0] ?? '');
    }
  }, [arPayMethod]);

  useEffect(() => {
    // No resetear el banco si es una selección especial dentro de 'Otros'
    const specialBanks = ['CXP', 'CxP', 'DxV', 'Ant. Cliente', 'Ant. Proveedores'];
    if (specialBanks.some(s => String(payBank).toUpperCase() === s.toUpperCase())) return;

    const opts = arBanksByMethod[currentPayMethod as Exclude<PaymentMethod, 'credit'>] ?? [];
    if (opts.length === 0) {
      if (payBank) setPayBank('');
      return;
    }
    if (!payBank || !opts.includes(payBank)) {
      setPayBank(opts[0] ?? '');
    }
  }, [currentPayMethod, arBanksByMethod, payBank]);

  useEffect(() => {
    if (arPayCurrency !== 'VES') return;
    if (arPayManualVES) return;
    if (!arPaySuggestedVES) {
      setArPayAmountVES('');
      return;
    }
    setArPayAmountVES(arPaySuggestedVES.toFixed(2));
  }, [arPayCurrency, arPayManualVES, arPaySuggestedVES]);

  const submitARPayment = async () => {
    if (!arPayTargetId) return;

    const rateUsed = parseFloat((arPayRateUsed || '').replace(',', '.')) || 0;
    const amountUSD = parseFloat((arPayAmount || '').replace(',', '.')) || 0;
    const amountVES = parseFloat((arPayAmountVES || '').replace(',', '.')) || 0;

    let paymentUSD = 0;
    if (arPayCurrency === 'USD') {
      paymentUSD = amountUSD;
    } else {
      if (rateUsed <= 0) {
        showToast('Debe indicar una tasa válida para cobros en Bs.', 'warning');
        return;
      }
      paymentUSD = amountVES / rateUsed;
    }

    paymentUSD = roundMoney(paymentUSD);

    if (!Number.isFinite(paymentUSD) || paymentUSD <= 0) return;

    const methodUpper = String(arPayMethod ?? '').trim().toUpperCase();
    const bankUpper = String(arPayBank ?? '').trim().toUpperCase();
    const noteUpper = String(arPayNote ?? '').trim().toUpperCase();
    const isCxpCollection =
      (methodUpper === 'OTHERS' || methodUpper === 'OTRO')
      && (bankUpper.includes('CXP') || noteUpper.includes('CXP') || noteUpper.includes('RECONCILIACION'));
    if (isCxpCollection) {
      const arEntry = dataService.getAREntries().find((e) => String(e.id) === String(arPayTargetId));
      const customerName = String(arEntry?.customerName ?? '').trim();
      const customerId = String(arEntry?.customerId ?? '').trim();
      const apPendingUSD = dataService.getAPBalanceForClient(customerName, customerId);
      if (apPendingUSD <= 0.005) {
        showToast('No hay CxP pendiente para este cliente/proveedor. Cambie el método o revise CxP.', 'warning');
        return;
      }
      if (paymentUSD - apPendingUSD > 0.005) {
        showToast(`Monto CxP excedido: intenta cobrar $${paymentUSD.toFixed(2)} y solo hay $${apPendingUSD.toFixed(2)} en CxP.`, 'warning');
        return;
      }
    }

    setArPaySubmitting(true);
    setArPayError('');
    try {
      const excessUSD = roundMoney(Math.max(0, paymentUSD - arPayBalanceUSD));
      const hasExcess = excessUSD > 0.005;

      // Validaciones de excedente según destino
      if (hasExcess) {
        if (arPayExcessMode === 'apply_to_ar' && !arPaySecondaryArId) {
          showToast('Seleccione la factura donde abonar el excedente.', 'warning');
          setArPaySubmitting(false);
          return;
        }
        if (arPayExcessMode === 'change') {
          const needsBank = arPayChangeMethod === 'transfer' || arPayChangeMethod === 'mobile' || arPayChangeMethod === 'zelle' || arPayChangeMethod === 'debit';
          if (needsBank && !arPayChangeBank) {
            showToast('Seleccione el banco de salida del vuelto.', 'warning');
            setArPaySubmitting(false);
            return;
          }
          if (arPayChangeMethod === 'cash_ves' || arPayChangeMethod === 'mobile' || arPayChangeMethod === 'transfer' || arPayChangeMethod === 'debit') {
            const cRate = parseFloat((arPayChangeRate || arPayRateUsed || '').replace(',', '.')) || 0;
            if (cRate <= 0) {
              showToast('Indique la tasa para convertir el vuelto a Bs.', 'warning');
              setArPaySubmitting(false);
              return;
            }
          }
        }
      }

      const excessParam = hasExcess
        ? arPayExcessMode === 'change'
          ? {
              kind: 'change' as const,
              method: arPayChangeMethod,
              bank: arPayChangeBank || arPayBank || undefined,
              rateUsed: parseFloat((arPayChangeRate || arPayRateUsed || '').replace(',', '.')) || rateUsed || exchangeRateBCV
            }
          : arPayExcessMode === 'apply_to_ar'
            ? { kind: 'apply_to_ar' as const, secondaryArId: arPaySecondaryArId }
            : { kind: 'advance' as const }
        : { kind: 'none' as const };

      const timeoutMs = 120000;
      await Promise.race([
        dataService.registerARPaymentWithExcess({
          arId: arPayTargetId,
          receivedUSD: paymentUSD,
          receivedVES: arPayCurrency === 'VES' ? roundMoney(amountVES) : 0,
          currency: arPayCurrency,
          rateUsed: arPayCurrency === 'VES' ? rateUsed : 0,
          method: arPayMethod,
          bank: arPayBank,
          reference: arPayReference,
          note: arPayNote,
          files: arPayFiles,
          excess: excessParam
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado subiendo soporte / registrando pago. Revise conexión y permisos de Storage.')), timeoutMs))
      ]);
      if (hasExcess) {
        const modeLabel = arPayExcessMode === 'change' ? 'vuelto' : arPayExcessMode === 'apply_to_ar' ? 'abono a otra factura' : 'anticipo';
        showToast(`Cobro registrado. Excedente $${excessUSD.toFixed(2)} → ${modeLabel}.`, 'success');
      } else {
        showToast(`Cobro registrado: $${paymentUSD.toFixed(2)}.`, 'success');
      }
      setShowARPaymentModal(false);
      setArPayTargetId('');
      setArPayBalanceUSD(0);
      setArPayAmount('');
      setArPayAmountVES('');
      setArPayCurrency('USD');
      setArPayRateUsed(exchangeRateBCV.toString());
      setArPayMethod('transfer');
      setArPayBank('BANESCO');
      setArPayReference('');
      setArPayManualVES(false);
      setArPayNote('');
      setArPayFiles([]);
      setArPayExcessMode('advance');
      setArPayChangeMethod('cash_ves');
      setArPayChangeBank('');
      setArPayChangeRate('');
      setArPaySecondaryArId('');
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : 'Error desconocido registrando pago.';
      setArPayError(msg);
      showToast(msg, 'error');
    } finally {
      setArPaySubmitting(false);
    }
  };

  const extractPastedSupportFiles = (items?: DataTransferItemList | null) => {
    if (!items || items.length === 0) return [] as File[];
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = (items as any)[i] as DataTransferItem | undefined;
      if (!it || !it.type || !it.type.startsWith('image/')) continue;
      const blob = it.getAsFile?.();
      if (!blob) continue;

      const ext = (it.type.split('/')[1] || 'png').toLowerCase();
      const name = `whatsapp_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      pastedFiles.push(new File([blob], name, { type: it.type }));
    }

    return pastedFiles;
  };

  const handleARSupportPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const pastedFiles = extractPastedSupportFiles(e.clipboardData?.items);

    if (pastedFiles.length > 0) {
      e.preventDefault();
      setArPayFiles(prev => [...prev, ...pastedFiles]);
    }
  };

  const removeArPayFile = (idx: number) => {
    setArPayFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handlePaySupportPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const pastedFiles = extractPastedSupportFiles(e.clipboardData?.items);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      setPayFiles(prev => [...prev, ...pastedFiles]);
    }
  };

  const removePayFile = (idx: number) => {
    setPayFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleCreditDownSupportPaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const pastedFiles = extractPastedSupportFiles(e.clipboardData?.items);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      setCreditDownFiles(prev => [...prev, ...pastedFiles]);
    }
  };

  const removeCreditDownFile = (idx: number) => {
    setCreditDownFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const createNewSession = () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newSession: BillingSession = {
      id: newId,
      client: null,
      items: [],
      payments: [],
      captures: [],
      searchClientId: '',
      label: `Venta ${sessions.length + 1}`,
      selectedIds: [],
      globalDiscount: undefined,
      saleNotes: ''
    };
    setSessions([...sessions, newSession]);
    setActiveSessionId(newId);
  };

  const closeSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length === 1) {
      updateCurrentSession({ items: [], payments: [], client: null, searchClientId: '', captures: [], label: 'Venta 1', selectedIds: [], globalDiscount: undefined, saleNotes: '', saleRequestId: undefined });
      return;
    }
    const sessionToClose = sessions.find(s => s.id === id);
    if (sessionToClose && sessionToClose.items.length > 0) {
      openConfirm('Cerrar venta', '¿Cerrar esta venta con productos cargados? Se perderán los items no facturados.', () => {
        closeConfirm();
        const newSessions = sessions.filter(s => s.id !== id);
        setSessions(newSessions);
        if (activeSessionId === id) setActiveSessionId(newSessions[0].id);
      });
      return;
    }

    const newSessions2 = sessions.filter(s => s.id !== id);
    setSessions(newSessions2);
    if (activeSessionId === id) setActiveSessionId(newSessions2[0].id);
  };

  // ===== CÁLCULOS DE LA SESIÓN =====
  const internalRateNumber = parseFloat(customRate) || exchangeRateInternal;
  
  // 1. Cálculos base de items y descuentos
  const subtotalUSD = currentSession.items.reduce((acc, i) => acc + (i.priceUSD * i.qty), 0);
  const globalDiscount = currentSession.globalDiscount;
  const discountAmountUSD = globalDiscount
    ? globalDiscount.type === 'percent'
      ? roundFX(subtotalUSD * (globalDiscount.value / 100))
      : roundFX(globalDiscount.value)
    : 0;
  const totalUSDNominal = roundFX(Math.max(0, subtotalUSD - discountAmountUSD));

  // 2. Cálculos de totales VES y USD internalizado
  const totalVESInternal = roundMoney(totalUSDNominal * internalRateNumber);
  const totalUSDInternalized = exchangeRateBCV > 0 ? roundFX(totalVESInternal / exchangeRateBCV) : totalUSDNominal;

  // 3. Totales según método de pago seleccionado
  const usdMethods = new Set<PaymentMethod>(['cash_usd', 'zelle', 'digital_usd']);
  // FIX: Cuando es crédito en USD, usar precio nominal (base USD), no internalizado
  const isCreditUSDMode = currentPayMethod === 'credit' && creditCurrency === 'USD';
  const isCreditVESMode = currentPayMethod === 'credit' && creditCurrency === 'VES';
  const totalUSD = (usdMethods.has(currentPayMethod) || isCreditUSDMode) ? totalUSDNominal : totalUSDInternalized;
  // Facturación en Bs siempre a tasa interna (requisito operativo).
  const totalVES = roundMoney(totalUSDNominal * internalRateNumber);

  // 4. Cálculos de pagos recibidos
  const vesMethodSet = new Set(['cash_ves', 'mobile', 'transfer', 'debit', 'biopago']);
  const isVESPayment = (p: any) =>
    vesMethodSet.has(p.method) || (p.method === 'others' && String(p.note ?? '').includes('TASA:'));

  const currentTotalPaidUSD = currentSession.payments
    .filter(p => p.method !== 'credit')
    .reduce((acc, p) => acc + (p.amountUSD || 0), 0);
  const currentTotalPaidVES = currentSession.payments
    .filter(p =>
      p.method !== 'credit' &&
      !(p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente') &&
      isVESPayment(p)
    )
    .reduce((acc, p) => acc + (p.amountVES || 0), 0);
  const paymentsExcludingDxV = currentSession.payments.filter(p => !(p.method === 'others' && (String(p.bank ?? '').toUpperCase() === 'DXV' || String(p.bank ?? '') === 'Ant. Cliente')));

  // Ant. Cliente se excluye de `paymentsExcludingDxV` (criterio contable / DxV), pero en vista VES su abono
  // equivale a Bs a tasa interna y debe descontarse del faltante (evita falso Bs. 65 = 0,1×650, etc.).
  const antClientePaidAsVES = currentSession.payments
    .filter(p => p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente' && p.method !== 'credit')
    .reduce((a, p) => {
      if ((p.amountVES || 0) > 0.005) return a + (p.amountVES || 0);
      return a + (p.amountUSD || 0) * internalRateNumber;
    }, 0);

  // 5. Detección de moneda dominante
  const vesValuePaid = paymentsExcludingDxV.filter(p => vesMethodSet.has(p.method)).reduce((a, p) => a + (p.amountVES || 0), 0);
  const usdValuePaid = paymentsExcludingDxV.filter(p => !vesMethodSet.has(p.method)).reduce((a, p) => a + (p.amountUSD || 0) * internalRateNumber, 0);
  const totalValuePaid = vesValuePaid + usdValuePaid;
  const registeredPaymentsAreVES = paymentsExcludingDxV.length > 0 && totalValuePaid > 0 && (vesValuePaid / totalValuePaid) >= 0.6;

  // 6. Cálculos de vuelto/overpayment
  const hasAnyCreditPayment = currentSession.payments.some(p => p.method === 'credit');
  const usdFromNonVesExclDxV = registeredPaymentsAreVES
    ? paymentsExcludingDxV.filter(p => !vesMethodSet.has(p.method)).reduce((a, p) => a + (p.amountUSD || 0) * internalRateNumber, 0)
    : 0;
  const usdFromNonVesExclDxVNoCredit = registeredPaymentsAreVES
    ? paymentsExcludingDxV.filter(p => !vesMethodSet.has(p.method) && p.method !== 'credit').reduce((a, p) => a + (p.amountUSD || 0) * internalRateNumber, 0)
    : 0;
  const usdPaidAsVES = usdFromNonVesExclDxV + (registeredPaymentsAreVES ? antClientePaidAsVES : 0);
  const usdPaidAsVESForOverpayment = usdFromNonVesExclDxVNoCredit + (registeredPaymentsAreVES ? antClientePaidAsVES : 0);
  const nominalTotalForPaid = registeredPaymentsAreVES ? roundMoney(totalUSDNominal * internalRateNumber) : totalUSDNominal;
  const overpaymentUSD = (registeredPaymentsAreVES || hasAnyCreditPayment) ? 0 : roundFX(Math.max(0, currentTotalPaidUSD - totalUSDNominal));
  const overpaymentVES = (!registeredPaymentsAreVES || hasAnyCreditPayment) ? 0 : roundMoney(Math.max(0, currentTotalPaidVES + usdPaidAsVESForOverpayment - nominalTotalForPaid));
  const realRemainingUSD = registeredPaymentsAreVES ? 0 : roundFX(Math.max(0, totalUSDNominal - currentTotalPaidUSD));
  const realRemainingVES = registeredPaymentsAreVES ? roundMoney(Math.max(0, nominalTotalForPaid - currentTotalPaidVES - usdPaidAsVES)) : 0;

  // 7. Flags de selección de banco/método
  const isCxPSelected = String(payBank).toUpperCase() === 'CXP';
  const isCxPVESMode = isCxPSelected && payNote.includes('TASA:');
  const isDxVSelected = String(payBank) === 'DxV' && !registeredPaymentsAreVES;
  const isAntClienteSelected = String(payBank) === 'Ant. Cliente';
  const antClienteEffectiveTotal = antClienteCurrency === 'VES' ? totalUSDInternalized : totalUSDNominal;

  // 8. Cálculos finales de faltante
  const effectiveTotalUSD = (isCxPSelected && !isCxPVESMode) || isDxVSelected
    ? totalUSDNominal
    : isAntClienteSelected ? antClienteEffectiveTotal : totalUSD;
  const remainingUSD = Math.max(0, roundFX(effectiveTotalUSD - currentTotalPaidUSD));
  const remainingVES = Math.max(0, roundMoney(totalVES - currentTotalPaidVES));
  const effectiveRemainingUSD = currentSession.payments.length === 0 ? remainingUSD : realRemainingUSD;
  const effectiveRemainingVES = currentSession.payments.length === 0 ? remainingVES : realRemainingVES;

  const isBsMethod = currentPayMethod === 'cash_ves' || currentPayMethod === 'mobile' || currentPayMethod === 'transfer' || currentPayMethod === 'debit' || currentPayMethod === 'biopago';
  const missingInVES = registeredPaymentsAreVES || isBsMethod || isCxPVESMode;
  const missingLabel = missingInVES ? 'Bs.' : '$';
  const settlementVesRate = exchangeRateBCV > 0 ? exchangeRateBCV : internalRateNumber;
  const toVesEquivalentFromUSD = (p: any) => {
    const isAntCliente = p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente';
    // FIX BILL-ANT-01: Los anticipos del cliente (Ant. Cliente) representan saldo USD
    // del cliente. Como `totalVES` se calcula con `internalRateNumber`, la equivalencia
    // de los anticipos en Bs DEBE usar la misma tasa interna (independientemente de si
    // el anticipo fue registrado como [USD] o [VES]). Si se usa BCV aquí mientras el total
    // se calcula a tasa interna, se infla artificialmente el faltante en Bs.
    // En cobros directos USD->Bs (cash_usd, zelle) sí usar BCV (settlementVesRate)
    // para reflejar el cambio efectivo de divisas en caja.
    const rate = isAntCliente ? internalRateNumber : settlementVesRate;
    return (Number(p.amountUSD ?? 0) || 0) * (Number(rate) || 1);
  };
  // Cuando el método activo es VES y hay pagos USD previos (ej: anticipo USD), descontar su equiv. Bs del total VES pendiente
  const usdAlreadyPaidAsVES = isBsMethod && !registeredPaymentsAreVES
    ? currentSession.payments
        .filter(p => p.method !== 'credit' && !vesMethodSet.has(p.method))
        .reduce((a, p) => a + toVesEquivalentFromUSD(p), 0)
    : 0;
  const remainingVESAdjusted = Math.max(0, roundMoney(remainingVES - usdAlreadyPaidAsVES));
  const missingValue = registeredPaymentsAreVES
    ? roundMoney(Math.max(0, (totalUSDNominal * internalRateNumber) - currentTotalPaidVES - usdPaidAsVES))
    : isBsMethod ? remainingVESAdjusted
    : isCxPVESMode ? Math.max(0, roundMoney(totalVES - currentTotalPaidVES))
    : (isCxPSelected || isDxVSelected) ? Math.max(0, roundFX(totalUSDNominal - currentTotalPaidUSD))
    : missingInVES ? effectiveRemainingVES : effectiveRemainingUSD;
  const confirmTotalUSD = (hasAnyCreditPayment && creditCurrency === 'VES') || registeredPaymentsAreVES
    ? totalUSDInternalized
    : totalUSDNominal;

  // 9. Cálculos de crédito
  const pendingCreditUSD = roundMoney(currentSession.payments.filter((p) => p.method === 'credit').reduce((acc, p) => acc + (p.amountUSD || 0), 0));
  const projectedCreditDebtUSD = roundMoney(clientAccountStatus.debtUSD + pendingCreditUSD);
  const projectedExceedsLimit = clientAccountStatus.creditLimit > 0 && projectedCreditDebtUSD > clientAccountStatus.creditLimit;
  const projectedAvailableCreditUSD = clientAccountStatus.creditLimit > 0 ? Math.max(0, roundMoney(clientAccountStatus.creditLimit - projectedCreditDebtUSD)) : 0;

  const creditDownRateNumber = useMemo(() => {
    const n = parseFloat((creditDownRateUsed || '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }, [creditDownRateUsed]);

  const creditDownPaymentUSD = useMemo(() => {
    if (!creditDownEnabled) return 0;
    const aUSD = parseFloat((creditDownAmountUSD || '').replace(',', '.')) || 0;
    const aVES = parseFloat((creditDownAmountVES || '').replace(',', '.')) || 0;
    if (creditDownCurrency === 'USD') return roundMoney(aUSD);
    if (!creditDownRateNumber) return 0;
    return roundMoney(aVES / creditDownRateNumber);
  }, [creditDownEnabled, creditDownCurrency, creditDownAmountUSD, creditDownAmountVES, creditDownRateNumber]);

  const creditDownPaymentVES = useMemo(() => {
    if (!creditDownEnabled) return 0;
    const aUSD = parseFloat((creditDownAmountUSD || '').replace(',', '.')) || 0;
    const aVES = parseFloat((creditDownAmountVES || '').replace(',', '.')) || 0;
    if (creditDownCurrency === 'VES') return roundMoney(aVES);
    return roundMoney(aUSD * exchangeRateBCV);
  }, [creditDownEnabled, creditDownCurrency, creditDownAmountUSD, creditDownAmountVES, exchangeRateBCV]);

  useEffect(() => {
    setCustomRate(exchangeRateInternal.toString());
  }, [exchangeRateInternal]);

  useEffect(() => {
    const opts = arBanksByMethod[creditDownMethod] ?? [];
    if (opts.length === 0) {
      if (creditDownBank) setCreditDownBank('');
      return;
    }
    if (!creditDownBank || !opts.includes(creditDownBank)) {
      setCreditDownBank(opts[0] ?? '');
    }
  }, [creditDownMethod]);

  useEffect(() => {
    if (currentPayMethod !== 'debit' && currentPayMethod !== 'biopago') {
      if (payPOSTerminalId) setPayPOSTerminalId('');
      return;
    }
    if (payPOSTerminalOptions.length === 0) {
      if (payPOSTerminalId) setPayPOSTerminalId('');
      return;
    }
    if (!payPOSTerminalId || !payPOSTerminalOptions.some((t: any) => String(t.id ?? '') === String(payPOSTerminalId ?? ''))) {
      setPayPOSTerminalId(String(payPOSTerminalOptions[0]?.id ?? ''));
    }
  }, [currentPayMethod, payPOSTerminalOptions, payPOSTerminalId]);

  useEffect(() => {
    if (!selectedPayPOSTerminal) return;
    const terminalBank = String(selectedPayPOSTerminal.bankName ?? '').trim();
    if (terminalBank && terminalBank !== payBank) {
      setPayBank(terminalBank);
    }
  }, [selectedPayPOSTerminal, payBank]);

  useEffect(() => {
    if (creditDownMethod !== 'debit' && creditDownMethod !== 'biopago') {
      if (creditDownPOSTerminalId) setCreditDownPOSTerminalId('');
      return;
    }
    if (creditDownPOSTerminalOptions.length === 0) {
      if (creditDownPOSTerminalId) setCreditDownPOSTerminalId('');
      return;
    }
    if (!creditDownPOSTerminalId || !creditDownPOSTerminalOptions.some((t: any) => String(t.id ?? '') === String(creditDownPOSTerminalId ?? ''))) {
      setCreditDownPOSTerminalId(String(creditDownPOSTerminalOptions[0]?.id ?? ''));
    }
  }, [creditDownMethod, creditDownPOSTerminalOptions, creditDownPOSTerminalId]);

  useEffect(() => {
    if (!selectedCreditDownPOSTerminal) return;
    const terminalBank = String(selectedCreditDownPOSTerminal.bankName ?? '').trim();
    if (terminalBank && terminalBank !== creditDownBank) {
      setCreditDownBank(terminalBank);
    }
  }, [selectedCreditDownPOSTerminal, creditDownBank]);

  useEffect(() => {
    if (remainingUSD > 0.0001 && !payAmountTouched) {
      if (isBsMethod) {
        setPayAmount(remainingVESAdjusted.toFixed(2));
      } else {
        setPayAmount(remainingUSD.toFixed(3));
      }
    }
  }, [remainingUSD, remainingVES, remainingVESAdjusted, currentPayMethod, customRate, exchangeRateInternal, payAmountTouched]);

  const handleSearchClient = () => {
    const found = clientService.findClient(currentSession.searchClientId);
    if (found) {
      updateCurrentSession({ client: found, label: found.name.split(' ')[0] });
      setShowSuggestions(false);
    } else showToast('Cliente no encontrado.', 'warning');
  };

  const handleClientSearchChange = (value: string) => {
    const v = value.toUpperCase();
    updateCurrentSession({ searchClientId: v });
    if (v.length >= 2) {
      const all = clientService.getClients();
      const matches = all.filter(c =>
        c.id.toUpperCase().includes(v) ||
        c.name.toUpperCase().includes(v)
      ).slice(0, 6);
      setClientSuggestions(matches);
      setShowSuggestions(matches.length > 0);
      setSelectedClientIndex(-1);
    } else {
      setShowSuggestions(false);
      setSelectedClientIndex(-1);
    }
  };

  const selectClientSuggestion = (c: BillingClient) => {
    updateCurrentSession({ client: c, searchClientId: c.id, label: c.name.split(' ')[0] });
    setShowSuggestions(false);
    setSelectedClientIndex(-1);
  };

  const handleClientKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || clientSuggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSearchClient();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedClientIndex(prev =>
          prev < clientSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedClientIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedClientIndex >= 0) {
          selectClientSuggestion(clientSuggestions[selectedClientIndex]);
        } else {
          handleSearchClient();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedClientIndex(-1);
        break;
    }
  };

  const addItem = (item: BillingItem) => {
    const newItems = [...currentSession.items];
    const existing = newItems.find(i => i.code === item.code && i.priceUSD === item.priceUSD);
    if (existing) {
      existing.qty += item.qty;
    } else {
      newItems.push(item);
    }
    updateCurrentSession({ items: newItems });
    setQuickSearch('');
    setTimeout(() => {
      const el = document.getElementById('quick-search-input');
      if (el) el.focus();
    }, 100);
  };

  const removeItem = (id: string) => {
    updateCurrentSession({
      items: currentSession.items.filter(i => i.id !== id),
      selectedIds: currentSession.selectedIds.filter(sid => sid !== id)
    });
  };

  const handleProcess = async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const client = activeClient;
      if (currentSession.items.length === 0) {
        showToast('No hay productos en la venta.', 'warning');
        return;
      }

      // Flag for AR Collection Mode - will process after validations
      const isARCollectionMode = effectiveARCollection?.active && currentSession.items.some(i => i.code === 'COBRO-AR');

      // Para ventas a CRÉDITO se requiere un cliente real (no CONTADO)
      const hasCreditPayment = currentSession.payments.some(p => p.method === 'credit');
      if (hasCreditPayment && (!client || client.id === 'CONTADO')) {
        showToast('Las ventas a CRÉDITO requieren seleccionar un cliente real.', 'warning');
        return;
      }

      // Para ventas al CONTADO sin cliente, usar el cliente genérico
      const finalClient = client || GENERIC_CASH_CLIENT;

      // Calcular totales pagados reales (independiente del método seleccionado actualmente)
      // BILL-FIX-01: Excluir pagos a CRÉDITO del cálculo de vuelto - el crédito no es pago real
      const realPaidUSD = currentSession.payments
        .filter(p => p.method !== 'credit')
        .reduce((acc, p) => acc + (p.amountUSD || 0), 0);
      const _vesSet = new Set(['cash_ves', 'mobile', 'transfer', 'debit', 'biopago']);
      const isOperationalVESPayment = (p: any) =>
        _vesSet.has(p.method) || (p.method === 'others' && String(p.note ?? '').includes('TASA:'));
      const realPaidVES = currentSession.payments
        .filter(p => p.method !== 'credit' && isOperationalVESPayment(p))
        .reduce((acc, p) => acc + (p.amountVES || 0), 0);
      // Detectar si los pagos son mayoritariamente en Bs (lógica por valor, umbral 60%)
      const nonDxVPayments = currentSession.payments.filter(p => !(p.method === 'others' && String(p.bank ?? '').toUpperCase() === 'DXV'));
      const _vesPaid = nonDxVPayments.filter(p => isOperationalVESPayment(p)).reduce((a,p) => a+(p.amountVES||0), 0);
      const _usdPaid = nonDxVPayments.filter(p => !isOperationalVESPayment(p)).reduce((a,p) => a+(p.amountUSD||0)*internalRateNumber, 0);
      const _totalPaid = _vesPaid + _usdPaid;
      const paymentsAreVES = nonDxVPayments.length > 0 && _totalPaid > 0 && (_vesPaid / _totalPaid) >= 0.6;
      // Descuento DxV en la moneda correcta
      const dxvPayments = currentSession.payments.filter(p => p.method === 'others' && String(p.bank ?? '').toUpperCase() === 'DXV');
      const effectiveDxVDiscountVES = roundMoney(dxvPayments.reduce((a, p) => a + (p.amountVES || 0), 0));
      const effectiveDxVDiscountUSD = roundFX(dxvPayments.reduce((a, p) => a + (p.amountUSD || 0), 0));
      const totalVESNominalForCheck = roundMoney(totalUSDNominal * internalRateNumber);

      // BILL-FIX-06: Ant. Cliente en VES usa precio internalizado como referencia, no el nominal.
      // Reconstruir el total de referencia sumando cada pago Ant. Cliente con su precio correcto.
      const antClientePaymentsInSession = currentSession.payments.filter(
        p => p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente'
      );
      // Para cada pago Ant. Cliente, la nota contiene [USD] o [VES]; determinar cuál referencia usar.
      // Si la nota contiene [VES] → el amountUSD ya fue ingresado al precio internalizado → usar internalizedUSD como techo
      // Si la nota contiene [USD] → usar nominalUSD
      // La forma más segura: sumar sus amountUSD directamente y comparar contra el precio que corresponde.
      // Si todos los anticipos son VES → referencia = totalUSDInternalized; si USD → totalUSDNominal; mixto → suma proporcional.
      const antClienteUSDPaid = antClientePaymentsInSession.reduce((a, p) => a + (p.amountUSD || 0), 0);
      const antClienteIsVES = antClientePaymentsInSession.some(p => String(p.note ?? '').includes('[VES]'));
      const antClienteIsUSD = antClientePaymentsInSession.some(p => String(p.note ?? '').includes('[USD]'));
      // Precio de referencia para validar faltante: si anticipo VES → internalizado, si USD → nominal
      const antClienteRefTotal = antClienteIsVES && !antClienteIsUSD
        ? totalUSDInternalized
        : totalUSDNominal;
      // Pagos no-AntCliente en USD para la validación
      const realPaidUSDExAnt = currentSession.payments
        .filter(p => p.method !== 'credit' && !(p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente'))
        .reduce((acc, p) => acc + (p.amountUSD || 0), 0);
      // Total de referencia efectivo = precio de referencia del anticipo (cubierto por antCliente) + resto cubierto por otros pagos
      // Si hay anticipo, verificar: antClienteUSDPaid >= antClienteRefTotal ó el resto cubre el nominal
      const antClienteCoversAll = antClienteUSDPaid > 0 && antClienteUSDPaid >= antClienteRefTotal - 0.05;
      // Ajustar realPaidUSD para la comparación: si el anticipo VES cubre su precio internalizado,
      // "normalizar" ese pago al precio nominal para la validación contra totalUSDNominal
      const normalizedAntClienteUSD = antClienteIsVES && !antClienteIsUSD && antClienteCoversAll
        ? totalUSDNominal  // anticipo VES cubre → equivale a pagar el nominal completo
        : antClienteUSDPaid;
      const realPaidUSDNormalized = roundFX(realPaidUSDExAnt + normalizedAntClienteUSD);

      // En modo VES dominante: el overpayment se mide en Bs (suma VES de todos los pagos vs nominal Bs)
      // En modo USD: el overpayment se mide en USD
      // BILL-FIX-01: En ventas a CRÉDITO no hay vuelto - no hay pago inmediato
      const realOverUSD = paymentsAreVES || hasCreditPayment ? 0 : roundFX(Math.max(0, realPaidUSDNormalized - totalUSDNominal));
      const realOverVES = paymentsAreVES || hasCreditPayment ? 0 : roundMoney(Math.max(0, realPaidVES - totalVESNominalForCheck));
      const hasOverpayment = !hasCreditPayment && (realOverUSD > 0.005 || realOverVES > 0.5);

      // BILL-FIX-02: En ventas a CRÉDITO, no validar faltante de pago - el crédito cubre el monto
      // AR COLLECTION: Special validation for AR collection mode
      if (isARCollectionMode) {
        const arRequiredUSD = effectiveARCollection!.balanceUSD;
        const totalPaidUSD = currentSession.payments.reduce((acc, p) => acc + (p.amountUSD || 0), 0);
        const totalPaidVES = currentSession.payments.reduce((acc, p) => acc + (p.amountVES || 0), 0);
        const arOverUSD = roundFX(Math.max(0, totalPaidUSD - arRequiredUSD));
        const arOverVES = roundMoney(Math.max(0, totalPaidVES - (arRequiredUSD * internalRateNumber)));
        const arHasOverpayment = arOverUSD > 0.005 || arOverVES > 0.5;
        
        if (!arHasOverpayment) {
          // Validate full payment received for AR
          const arMissingUSD = roundFX(Math.max(0, arRequiredUSD - totalPaidUSD));
          if (arMissingUSD > 0.05) {
            showToast(`Falta por cobrar en AR: $${arMissingUSD.toFixed(2)}`, 'warning');
            return;
          }
        }
        // Validate change declaration for AR
        if (arHasOverpayment && !changeDeclared && !changeAsAdvance) {
          showToast(`Hay un vuelto pendiente en AR de $${arOverUSD.toFixed(2)} / Bs.${arOverVES.toFixed(2)}. Declare cómo lo entregará.`, 'warning');
          return;
        }
      } else if (!hasOverpayment && !hasCreditPayment) {
        const allowUsdMissing = 0.05;
        const allowVesMissing = 0.5;
        const hasAnyVesInMix = nonDxVPayments.some(p => isOperationalVESPayment(p));
        if (paymentsAreVES || hasAnyVesInMix) {
          // Comparar en VES: también sumar equiv. Bs de los pagos USD del mix
          const usdMixAsVES = nonDxVPayments
            .filter(p => !isOperationalVESPayment(p))
            .reduce((a,p) => a + toVesEquivalentFromUSD(p), 0);
          const realMissingVES = roundMoney(Math.max(0, totalVESNominalForCheck - realPaidVES - usdMixAsVES - effectiveDxVDiscountVES));
          if (realMissingVES > allowVesMissing) {
            showToast(`Falta por cobrar: Bs.${realMissingVES.toFixed(2)}`, 'warning');
            return;
          }
        } else {
          // Comparar en USD usando el paid normalizado (Ant. Cliente VES ya ajustado)
          const realMissingUSD = roundFX(Math.max(0, totalUSDNominal - realPaidUSDNormalized - effectiveDxVDiscountUSD));
          if (realMissingUSD > allowUsdMissing) {
            showToast(`Falta por cobrar: $${realMissingUSD.toFixed(3)}`, 'warning');
            return;
          }
        }
      }
      // Validar que el vuelto esté declarado si hay overpayment significativo (ventas normales)
      if (!isARCollectionMode && hasOverpayment && !changeDeclared && !changeAsAdvance) {
        showToast(`Hay un vuelto pendiente de $${realOverUSD.toFixed(2)} / Bs.${realOverVES.toFixed(2)}. Declare cómo lo entregará.`, 'warning');
        return;
      }

      // Advanced Credit Audit (Risk Verification)
      const creditPayments = currentSession.payments.filter(p => p.method === 'credit');
      if (creditPayments.length > 0 && finalClient && finalClient.id !== 'CONTADO') {
        const creditTotal = creditPayments.reduce((a, b) => a + b.amountUSD, 0);
        const clientLimit = client.creditLimit || 0;
        const arEntries = dataService.getAREntries();
        const currentDebt = arEntries
          .filter(ar => ar.customerId === client.id && ar.status !== 'PAID')
          .reduce((a, b) => a + b.balanceUSD, 0);

        // 0. Authorization Check
        if (client.hasCredit !== true) {
          showToast('Venta Denegada: El cliente no tiene autorización para compras a crédito.', 'error');
          return;
        }
        if (client.isSolvent === false) {
          showToast('Venta Denegada: El cliente presenta bloqueos financieros (Insolvente).', 'error');
          return;
        }

        // 1. Check Límite de Crédito
        if (currentDebt + creditTotal > clientLimit && clientLimit > 0) {
          const projected = currentDebt + creditTotal;
          showToast(`Venta Denegada: Cliente excede límite de crédito. Deuda: $${currentDebt.toFixed(2)}, Nuevo: $${creditTotal.toFixed(2)}`, 'error');
          return;
        }

        // 2. Check Overdue Invoices
        const now = new Date();
        const overdue = arEntries.find(ar =>
          ar.customerId === client.id &&
          ar.status !== 'PAID' &&
          new Date(ar.dueDate) < now
        );
        if (overdue) {
          showToast('Venta Denegada: El cliente tiene facturas vencidas.', 'error');
          return;
        }
      }

      // Strict Reference Audit...
      const invalidRef = currentSession.payments.find(p =>
        (p.method !== 'cash_usd' && p.method !== 'cash_ves' && p.method !== 'others' && p.method !== 'credit') &&
        (!p.reference || p.reference.length < 6)
      );
      if (invalidRef) {
        showToast(`La referencia para ${invalidRef.method.toUpperCase()} es inválida (mín. 6 caracteres).`, 'warning');
        return;
      }

      setIsProcessing(true);

      let finalPayments = [...currentSession.payments];
      
      // Auto-add current selection if list is empty but we have a valid selection
      if (finalPayments.length === 0 && (parseFloat(payAmount) > 0 || currentPayMethod === 'credit')) {
        const amountFloat = parseFloat(payAmount) || 0;
        const activeRateNumber = parseFloat(customRate) || exchangeRateInternal;
        const useInternalRate = currentPayMethod === 'others';
        const rateForConversion = useInternalRate ? internalRateNumber : activeRateNumber;
        const rateForVES = useInternalRate ? internalRateNumber : exchangeRateBCV;
        const isBs = currentPayMethod === 'cash_ves' || currentPayMethod === 'mobile' || currentPayMethod === 'transfer' || currentPayMethod === 'debit' || currentPayMethod === 'biopago';

        // Caso especial: CxP en VES — el campo ya tiene Bs, no convertir de nuevo
        const isCxpVES = String(payBank).toUpperCase().includes('CXP') && payNote.includes('TASA:');
        const cxpRateMatch = isCxpVES ? payNote.match(/TASA:\s*([\d.]+)/) : null;
        const cxpRate = cxpRateMatch ? parseFloat(cxpRateMatch[1]) : 0;

        let amountInUSD: number;
        let amountInVES: number;

        if (isCxpVES && cxpRate > 0) {
          // El campo contiene Bs → USD = Bs / tasa acordada
          amountInVES = amountFloat;
          amountInUSD = amountFloat / cxpRate;
        } else {
          // For CxP USD: use nominal price without conversion (like cash_usd, zelle)
          const isCxPUSD = String(payBank).toUpperCase().includes('CXP') && !payNote.includes('TASA:');
          const isAutoDxVVES = String(payBank) === 'DxV' && registeredPaymentsAreVES;
          if (isCxPUSD) {
            amountInUSD = amountFloat;
            amountInVES = amountFloat * exchangeRateBCV;
          } else if (isAutoDxVVES) {
            // DxV en modo VES: el campo contiene Bs
            amountInVES = amountFloat;
            amountInUSD = roundFX(amountFloat / (internalRateNumber || 1));
          } else {
            amountInUSD = isBs ? (amountFloat / rateForConversion) : amountFloat;
            amountInVES = isBs ? amountFloat : (amountFloat * rateForVES);
          }
        }

        if (currentPayMethod === 'credit') {
           // Handle credit auto-add
           const creditUSD = totalUSD;
           const creditVES = totalUSD * exchangeRateBCV;
           finalPayments.push({
             id: 'auto-credit',
             method: 'credit',
             amountUSD: roundMoney(creditUSD),
             amountVES: roundMoney(creditVES),
             rateUsed: internalRateNumber
           });
        } else if (amountInUSD > 0) {
           finalPayments.push({
             id: 'auto-add',
             method: currentPayMethod,
             amountUSD: roundMoney(amountInUSD),
             amountVES: roundMoney(amountInVES),
             bank: payBank,
             reference: payRef,
             note: currentPayMethod === 'others' ? (payNote || payBank) : undefined,
             rateUsed: isCxpVES ? cxpRate : (isBs ? rateForConversion : (useInternalRate ? internalRateNumber : exchangeRateBCV)),
             cashDenominations: currentPayMethod === 'cash_usd'
               ? (cashDenomsUSD.filter(b => b.qty > 0).length > 0 ? cashDenomsUSD.filter(b => b.qty > 0) : undefined)
               : currentPayMethod === 'cash_ves'
               ? (cashDenomsVES.filter(b => b.qty > 0).length > 0 ? cashDenomsVES.filter(b => b.qty > 0) : undefined)
               : undefined
           });
        }
      }

      // Evaluar tipo de venta DESPUÉS del auto-add para capturar crédito auto-añadido
      const isCreditSale = finalPayments.some(p => p.method === 'credit');
      // CORRELATIVO FIX: Usar método async que consulta la BD para evitar duplicados
      const finalCorrelativo = await dataService.getNextCorrelativo(isCreditSale ? 'CREDIT' : 'STANDARD');

      // Detectar pago DxV y extraer el descuento en ambas monedas
      const dxvPaymentFinal = finalPayments.find(p => p.method === 'others' && String(p.bank ?? '').toUpperCase() === 'DXV');
      const dxvFinalUSD = dxvPaymentFinal ? roundFX(dxvPaymentFinal.amountUSD) : 0;
      const dxvFinalVES = dxvPaymentFinal ? roundMoney((dxvPaymentFinal as any).amountVES || 0) : 0;
      const isDxVVESFinal = dxvFinalVES > 0.5;
      if (dxvPaymentFinal) {
        const dxvIdx = finalPayments.indexOf(dxvPaymentFinal);
        finalPayments[dxvIdx] = { ...dxvPaymentFinal, isDxV: true };
      }

      // Validación final: comparar en la moneda dominante de los pagos
      const finalNonDxV = finalPayments.filter(p => !(p as any).isDxV);
      const isCxPUSDMethod = finalPayments.some(p => p.method === 'others' && p.bank?.toUpperCase().includes('CXP') && !p.note?.includes('TASA:'));
      const isAntClienteUSDMethod = finalPayments.some(p => p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente' && String(p.note ?? '').includes('[USD]'));
      const isOperationalVESFinalPayment = (p: any) =>
        _vesSet.has(p.method) ||
        (p.method === 'others' && (
          String(p.note ?? '').includes('TASA:') ||
          (String(p.bank ?? '') === 'Ant. Cliente' && String(p.note ?? '').includes('[VES]'))
        ));
      // Detectar modo VES: mayoría por valor
      const _fVesPaid = finalNonDxV.filter(p => isOperationalVESFinalPayment(p)).reduce((a,p) => a+(p.amountVES||0), 0);
      const _fUsdPaid = finalNonDxV.filter(p => !isOperationalVESFinalPayment(p)).reduce((a,p) => a+(p.amountUSD||0)*internalRateNumber, 0);
      const _fTotalPaid = _fVesPaid + _fUsdPaid;
      const finalPaymentsAreVES = finalNonDxV.length > 0 && _fTotalPaid > 0 && (_fVesPaid / _fTotalPaid) >= 0.6;
      const hasAnyVesInFinalMix = finalNonDxV.some(p => isOperationalVESFinalPayment(p));
      // Venta solo con renglón(s) a crédito: no comparar "pago" vs total aquí; el monto se valida al agregar
      // el crédito. Si no, se mezclaba USD ref. BCV (totalUSD) con amountUSD a veces en base nominal
      // y aparecía un faltante falso (~nominal×(int/BCV−1)).
      const isOnlyNonDxVCredit =
        finalNonDxV.length > 0 && finalNonDxV.every(p => p.method === 'credit');
      if (!isOnlyNonDxVCredit) {
        if (finalPaymentsAreVES || hasAnyVesInFinalMix || isDxVVESFinal) {
          // Modo VES: comparar en bolívares, incluir equiv. Bs de pagos USD del mix
          // FIX BILL-ANT-02: Los anticipos Ant. Cliente [VES] se almacenan con amountVES=0
          // (ver addPayment línea ~2108: isAntClienteMode ? 0 : ...). Para validar correctamente
          // su aporte en Bs, usar amountUSD * internalRateNumber como fallback cuando amountVES=0.
          const paidVESTotal = finalNonDxV
            .filter(p => isOperationalVESFinalPayment(p))
            .reduce((acc, p) => {
              const isAntClienteVES =
                p.method === 'others' &&
                String(p.bank ?? '') === 'Ant. Cliente' &&
                String(p.note ?? '').includes('[VES]');
              if (isAntClienteVES && (p.amountVES || 0) < 0.005) {
                return acc + (p.amountUSD || 0) * internalRateNumber;
              }
              return acc + (p.amountVES || 0);
            }, 0);
          const usdMixAsVESFinal = finalNonDxV.filter(p => !isOperationalVESFinalPayment(p)).reduce((a, p) => a + (p.amountUSD || 0) * internalRateNumber, 0);
          const requiredVES = roundMoney(totalUSDNominal * internalRateNumber);
          const missingVES = roundMoney(Math.max(0, requiredVES - paidVESTotal - usdMixAsVESFinal - dxvFinalVES));
          if (missingVES > 0.5) {
            showToast(`Pago insuficiente: Faltan Bs.${missingVES.toFixed(2)} por registrar.`, 'warning');
            return;
          }
        } else {
          // Modo USD: comparar en dólares
          const payTotal = finalNonDxV.reduce((acc, p) => acc + p.amountUSD, 0);
          const requiredTotalUSD = (isCxPUSDMethod || isAntClienteUSDMethod) ? totalUSDNominal : totalUSD;
          const requiredAfterDxV = roundFX(requiredTotalUSD - dxvFinalUSD);
          // Seguridad: el DxV no puede ser el único cobro (debe haber al menos un pago real)
          if (dxvFinalUSD > 0 && finalNonDxV.length === 0) {
            showToast('Pago insuficiente: El DxV es un ajuste contable, debe haber un pago real.', 'warning');
            return;
          }
          if (payTotal < requiredAfterDxV - 0.05) {
            showToast(`Pago insuficiente: Faltan $${(requiredAfterDxV - payTotal).toFixed(3)} por registrar.`, 'warning');
            return;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════════════════════
      // AR COLLECTION MODE: Process AR payment via Cash Box (after all validations)
      // ═══════════════════════════════════════════════════════════════════════════
      if (isARCollectionMode) {
        try {
          setIsProcessing(true);
          const activeCashSession = dataService.getCurrentCashBoxSession();
          if (!activeCashSession?.id) {
            showToast('No hay sesión de caja abierta. Abra la caja primero.', 'error');
            return;
          }

          // Prepare payments for AR processing
          const arPayments = currentSession.payments.map(p => ({
            method: p.method,
            amountUSD: p.amountUSD,
            amountVES: p.amountVES,
            bank: p.bank,
            bankAccountId: p.bankAccountId,
            bankAccountLabel: p.bankAccountLabel,
            reference: p.reference,
            note: p.note,
            currency: p.currency || 'USD',
            rateUsed: p.rateUsed || exchangeRateInternal
          }));

          // Calculate totals and change
          const arRequiredUSD = effectiveARCollection!.balanceUSD;
          const totalPaidUSD = arPayments.reduce((acc, p) => acc + (p.amountUSD || 0), 0);
          const totalPaidVES = arPayments.reduce((acc, p) => acc + (p.amountVES || 0), 0);
          const changeUSD = roundFX(Math.max(0, totalPaidUSD - arRequiredUSD));
          const changeVES = roundMoney(Math.max(0, totalPaidVES - (arRequiredUSD * internalRateNumber)));

          // Process AR collection via dataService with change handling
          const result = await dataService.processARCollectionInCashBox({
            arEntryId: effectiveARCollection!.arEntryId,
            payments: arPayments,
            changeUSD,
            changeVES,
            changeDeclared,
            changeMethod: changeDeclared ? changeMethod : undefined,
            changeBank: changeDeclared ? changeBank : undefined,
            changeAsAdvance,
            sessionId: activeCashSession.id,
            exchangeRateBCV,
            exchangeRateInternal: internalRateNumber,
            actor: dataService.getCurrentUser()?.name || 'Sistema'
          });

          if (result.success) {
            const changeMsg = result.changeGivenUSD > 0.005 
              ? ` - Vuelto: $${result.changeGivenUSD.toFixed(2)}` 
              : result.changeGivenVES > 0.5 
                ? ` - Vuelto: Bs.${result.changeGivenVES.toFixed(2)}` 
                : '';
            showToast(`Cobro AR procesado. Pagado: $${result.totalPaidUSD.toFixed(2)}${changeMsg}`, 'success');
            
            // Clear AR collection mode (both local and parent-prop)
            clearEffectiveARCollection();
            
            // Reset session
            if (sessions.length === 1) {
              updateCurrentSession({ items: [], payments: [], client: null, searchClientId: '', captures: [], label: 'Venta 1', selectedIds: [], globalDiscount: undefined, saleNotes: '', saleRequestId: undefined });
            } else {
              closeSession(activeSessionId, { stopPropagation: () => {} } as any);
            }
            
            // Reset change state
            setChangeDeclared(false); setChangeAsAdvance(false); setChangeMethod('cash_ves'); setChangeBank(''); setChangeCustomRate('');
            setShowProcessConfirm(false);
            return;
          }
        } catch (err: any) {
          showToast('Error en cobranza AR: ' + (err?.message || 'Error desconocido'), 'error');
          return;
        } finally {
          setIsProcessing(false);
          processingRef.current = false;
        }
      }

      // Excluir DxV del total efectivo recibido para calcular el factor de ajuste
      const realReceivedPayments = finalPayments.filter(p => !(p as any).isDxV);
      const _vesMethodsSet = new Set(['cash_ves','mobile','transfer','debit','biopago']);
      // En modo VES: usar solo pagos VES para calcular effectiveTotalVES (excluir USD del mix)
      const vesOnlyPayments = realReceivedPayments.filter(p => _vesMethodsSet.has(p.method) || (p.method==='others'&&(p.note??'').includes('TASA:')));
      const usdOnlyPayments = realReceivedPayments.filter(p => !_vesMethodsSet.has(p.method) && !(p.method==='others'&&(p.note??'').includes('TASA:')));
      const effectiveTotalVES = vesOnlyPayments.reduce((acc, p) => acc + (p.amountVES || 0), 0);
      const effectiveTotalUSD = finalPaymentsAreVES
        // Modo VES: convertir VES pagados a USD usando tasa interna + agregar USD pagados directamente
        ? (effectiveTotalVES / internalRateNumber) + usdOnlyPayments.reduce((acc,p) => acc+(p.amountUSD||0),0)
        // Modo USD: sumar directamente los amountUSD
        : realReceivedPayments.reduce((acc, p) => acc + (p.amountUSD || 0), 0);
      const baseSubtotalUSD = currentSession.items.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);
      const adjustmentFactor = baseSubtotalUSD > 0 ? (effectiveTotalUSD / baseSubtotalUSD) : 1;

      let finalLegalTotalUSD = 0;
      const adjustedItems = currentSession.items.map(item => {
        const adjPrice = item.priceUSD * adjustmentFactor;
        const rowTotal = Number((item.qty * adjPrice).toFixed(3));
        finalLegalTotalUSD += rowTotal;
        return { ...item, priceUSD: adjPrice };
      });

      const creditOutstandingUSD = finalPayments
        .filter(p => p.method === 'credit')
        .reduce((a, b) => a + (b.amountUSD || 0), 0);

      // Adjuntar metadata de vuelto al primer pago en efectivo si aplica
      if ((overpaymentUSD > 0.005 || overpaymentVES > 0.5) && changeDeclared) {
        const cashIdx = finalPayments.findIndex(p => p.method === 'cash_usd' || p.method === 'cash_ves');
        const rateForChange = parseFloat(changeCustomRate) || exchangeRateBCV;
        const changeIsVES = changeMethod === 'cash_ves' || changeMethod === 'mobile' || changeMethod === 'transfer';
        const changeIsUSD = changeMethod === 'cash_usd' || changeMethod === 'zelle';
        let changeAmountNote = '';
        if (overpaymentUSD > 0.005) {
          if (changeIsVES) {
            const inVES = roundMoney(overpaymentUSD * rateForChange);
            changeAmountNote = `Bs.${inVES.toLocaleString('es-VE',{minimumFractionDigits:2})} (Tasa: ${rateForChange.toFixed(2)})`;
          } else {
            changeAmountNote = `$${overpaymentUSD.toFixed(2)}`;
          }
        } else {
          if (changeIsUSD && rateForChange > 0) {
            const inUSD = roundFX(overpaymentVES / rateForChange);
            changeAmountNote = `$${inUSD.toFixed(2)} (Tasa: ${rateForChange.toFixed(2)})`;
          } else {
            changeAmountNote = `Bs.${overpaymentVES.toLocaleString('es-VE',{minimumFractionDigits:2})}`;
          }
        }
        if (cashIdx >= 0) {
          const changeIsCashUSD = changeMethod === 'cash_usd';
          const changeIsCashVES = changeMethod === 'cash_ves';
          const changeDenomsForThis = changeIsCashUSD
            ? changeDenomsUSD.filter(b => b.qty > 0)
            : changeIsCashVES
            ? changeDenomsVES.filter(b => b.qty > 0)
            : [];
          finalPayments[cashIdx] = {
            ...finalPayments[cashIdx],
            cashChangeGiven: overpaymentUSD > 0.005 ? overpaymentUSD : overpaymentVES,
            cashChangeMethod: changeMethod,
            cashChangeBank: changeBank || undefined,
            cashChangeRate: rateForChange,
            cashChangeDenominations: changeDenomsForThis.length > 0 ? changeDenomsForThis : undefined,
            cashChangeDenominationsCurrency: changeDenomsForThis.length > 0
              ? (changeIsCashUSD ? 'USD' : 'VES')
              : undefined,
            note: `VUELTO: ${changeAmountNote} vía ${changeMethod.toUpperCase().replace('_',' ')}${changeBank ? ` (${changeBank})` : ''}`
          };
        }
      }

      const requestId =
        String(currentSession.saleRequestId ?? '').trim()
        || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
      if (!currentSession.saleRequestId) {
        updateCurrentSession({ saleRequestId: requestId });
      }

      const processedSale = await dataService.registerSale({
        clientRequestId: requestId,
        correlativo: finalCorrelativo,
        client,
        items: adjustedItems,
        // totalUSD: en modo VES = precio internalizado, en modo USD = precio nominal
        // Esto garantiza que el registro contable refleje el precio real cobrado
        totalUSD: dxvFinalUSD > 0 ? roundFX(finalLegalTotalUSD - dxvFinalUSD) : finalLegalTotalUSD,
        totalVES: roundMoney(totalUSDNominal * internalRateNumber),
        // Guardar también precio nominal para referencia contable en ventas USD
        nominalUSD: totalUSDNominal,
        // Descuento DxV (ajuste contable)
        discountUSD: dxvFinalUSD > 0 ? dxvFinalUSD : undefined,
        discountType: dxvFinalUSD > 0 ? 'DxV' : undefined,
        // Descuento global comercial (porcentaje o monto fijo)
        globalDiscount: currentSession.globalDiscount && currentSession.globalDiscount.value > 0 ? {
          type: currentSession.globalDiscount.type,
          value: currentSession.globalDiscount.value,
          amountUSD: discountAmountUSD
        } : undefined,
        paymentMethod: isCreditSale
          ? 'CREDIT'
          : (finalPayments.length === 1 ? finalPayments[0].method.toUpperCase() : 'MIXTO'),
        exchangeRate: exchangeRateBCV,
        captures: currentSession.captures,
        payments: changeAsAdvance && currentSession.client
          ? [...finalPayments, {
              id: 'advance-note',
              method: 'others',
              bank: 'Ant. Cliente',
              amountUSD: overpaymentUSD > 0.005 ? overpaymentUSD
                : (overpaymentVES > 0.5 ? roundFX(overpaymentVES / (parseFloat(changeCustomRate) || exchangeRateBCV)) : 0),
              amountVES: 0,
              note: `ANTICIPO CLIENTE: Vuelto dejado como anticipo en FACTURA ${finalCorrelativo}`
            }]
          : finalPayments,
        creditOutstandingUSD,
        creditMeta: {
          rateInternal: internalRateNumber,
          rateBCV: exchangeRateBCV,
          // FIX: Determinar correctamente la moneda del pago (no solo para crédito)
          creditCurrency: isCreditSale ? creditCurrency : (registeredPaymentsAreVES ? 'VES' : 'USD')
        },
        // Observaciones/nota interna de la factura
        notes: currentSession.saleNotes?.trim() || undefined
      } as any);

      // Si el cliente dejó el vuelto como anticipo, NO volver a crearlo aquí.
      // El alta del anticipo ya la realiza dataService durante el post-proceso de la venta.
      if (processedSale && changeAsAdvance && currentSession.client) {
        const advanceUSD = overpaymentUSD > 0.005 ? overpaymentUSD
          : (overpaymentVES > 0.5 ? roundFX(overpaymentVES / (parseFloat(changeCustomRate) || exchangeRateBCV)) : 0);
        if (advanceUSD >= 0.01) {
          try {
            // Solo recargar anticipos del cliente para reflejar el saldo actualizado en UI.
            const updatedAdvances = await dataService.getClientAdvances(currentSession.client.id);
            setClientAdvances(updatedAdvances);
            setClientAdvanceBalance(updatedAdvances.reduce((a, x) => a + x.balanceUSD, 0));
            showToast(`Anticipo registrado: $${advanceUSD.toFixed(2)} a favor del cliente`, 'success');
          } catch (e) {
            console.warn('No se pudo recargar anticipo desde vuelto:', e);
            showToast('Venta procesada. Verifique el anticipo en Finanzas > Anticipos.', 'warning');
          }
        }
      }

      // BILL-BUG-04 FIX: Registrar el vuelto como salida de caja cuando se entrega al cliente (no como anticipo)
      // Esto asegura que el arqueo de caja refleje el efectivo real disponible
      if (processedSale && changeDeclared && !changeAsAdvance) {
        const activeCashSession = dataService.getCurrentCashBoxSession();
        if (activeCashSession?.id) {
          // Determinar moneda y monto del vuelto
          const changeIsVES = changeMethod === 'cash_ves' || changeMethod === 'mobile' || changeMethod === 'transfer';
          const changeIsUSD = changeMethod === 'cash_usd' || changeMethod === 'zelle';
          
          if (changeIsUSD && overpaymentUSD > 0.005) {
            try {
              await dataService.registerCashBoxWithdrawal({
                sessionId: activeCashSession.id,
                amount: overpaymentUSD,
                currency: 'USD',
                method: 'cash_usd',
                reason: `VUELTO Factura ${processedSale.correlativo} - Cliente: ${client?.name || 'Contado'}`,
                user: dataService.getCurrentUser() || { id: 'SYSTEM', name: 'Sistema' },
                rateUsed: exchangeRateBCV
              });
              showToast(`Vuelto $${overpaymentUSD.toFixed(2)} registrado como salida de caja.`, 'success');
            } catch (e) {
              console.warn('No se pudo registrar salida de caja por vuelto:', e);
              showToast('Advertencia: No se pudo registrar la salida de caja del vuelto.', 'warning');
            }
          } else if (changeIsVES && overpaymentVES > 0.5) {
            try {
              await dataService.registerCashBoxWithdrawal({
                sessionId: activeCashSession.id,
                amount: overpaymentVES,
                currency: 'VES',
                method: 'cash_ves',
                reason: `VUELTO Factura ${processedSale.correlativo} - Cliente: ${client?.name || 'Contado'}`,
                user: dataService.getCurrentUser() || { id: 'SYSTEM', name: 'Sistema' },
                rateUsed: parseFloat(changeCustomRate) || exchangeRateBCV
              });
              showToast(`Vuelto Bs.${overpaymentVES.toFixed(2)} registrado como salida de caja.`, 'success');
            } catch (e) {
              console.warn('No se pudo registrar salida de caja por vuelto:', e);
              showToast('Advertencia: No se pudo registrar la salida de caja del vuelto.', 'warning');
            }
          }
        }
      }

      if (processedSale) {
        // Notificar si se generó AR (crédito) para que el usuario sepa que se registró
        if (creditOutstandingUSD > 0.01 && currentSession.client) {
          // Recargar anticipos también por si aplicó alguno
          try {
            const updatedAdvances = await dataService.getClientAdvances(currentSession.client.id);
            setClientAdvances(updatedAdvances);
            setClientAdvanceBalance(updatedAdvances.reduce((a, x) => a + x.balanceUSD, 0));
          } catch {}
          showToast(
            `✓ Crédito registrado: $${creditOutstandingUSD.toFixed(2)} a ${currentSession.client.name}. Ver en Finanzas > CxC`,
            'success'
          );
        }
        setChangeDeclared(false); setChangeAsAdvance(false); setChangeMethod('cash_ves'); setChangeBank(''); setChangeCustomRate('');
        // Limpiar la sesión ANTES de mostrar el modal para que el usuario no vea la factura vieja
        if (sessions.length === 1) {
          updateCurrentSession({ items: [], payments: [], captures: [], client: null, searchClientId: '', label: 'Venta 1', selectedIds: [], saleRequestId: undefined });
        } else {
          const cid = currentSession.id;
          const newSessions = sessions.filter(s => s.id !== cid);
          setSessions(newSessions);
          setActiveSessionId(newSessions[0].id);
        }
        // Mostrar modal de selección de moneda para imprimir
        setPendingPrintSale(processedSale);
        
        // El historial se actualiza automáticamente desde Firestore vía onSnapshot
        // (legacy localStorage code removed)
        if (false) {
          const newSale = {
            id: processedSale.id || Math.random().toString(36).substr(2, 9),
            correlativo: processedSale.correlativo,
            clientName: processedSale.client?.name || 'Sin cliente',
            totalUSD: processedSale.totalUSD,
            totalVES: processedSale.totalVES,
            timestamp: new Date(),
            paymentMethod: processedSale.paymentMethod || 'CONTADO',
            sale: processedSale
          };
          const updated = [newSale].slice(0, 50);
          void updated;
          const activeCashSession = dataService.getCurrentCashBoxSession();
          void activeCashSession;
          return [newSale];
        }
      }
    } catch (error) {
      console.error('CRITICAL BILLING ERROR:', error);
      showToast('Error procesando: ' + (error instanceof Error ? error.message : 'Error desconocido al registrar en DB'), 'error');
    } finally {
      setIsProcessing(false);
      processingRef.current = false;
    }
  };

  const handleQuickAdd = (input: string) => {
    let term = input.trim().toUpperCase();
    let qty = scaleWeight && scaleWeight > 0 ? scaleWeight : 1;
    if (term.includes('*')) {
      const parts = term.split('*');
      term = parts[0].trim();
      qty = parseFloat(parts[1].replace(',', '.')) || 1;
    }
    if (!term) return;
    const stocks = dataService.getStocks();
    let product = stocks.find(p => p.code.toUpperCase() === term || p.description.toUpperCase() === term);
    if (!product) {
      const matches = stocks.filter(p => p.description.toUpperCase().includes(term) || p.code.toUpperCase().includes(term));
      if (matches.length === 1) product = matches[0];
      else { setInitialSearch(term); setPendingQty(qty); setShowItemModal(true); return; }
    }
    if (product) {
      addItem({
        id: Math.random().toString(36).substr(2, 9),
        code: product.code,
        description: product.description,
        unit: product.unit,
        qty: qty,
        priceUSD: product.prices ? product.prices[0] : product.priceUSD,
        priceLevel: 1,
        tax: 16
      });
      setQuickSearch('');
    }
  };

  const updateItemQty = (id: string, newQty: number) => {
    updateCurrentSession({
      items: currentSession.items.map(i => i.id === id ? { ...i, qty: newQty } : i)
    });
  };

  const updateItemPriceLevel = (id: string, code: string, level: number) => {
    const product = dataService.getStocks().find(p => p.code === code);
    if (!product || !product.prices) return;
    updateCurrentSession({
      items: currentSession.items.map(i => i.id === id ? { ...i, priceLevel: level, priceUSD: product.prices![level - 1] } : i)
    });
  };

  const addPayment = () => {
    if (currentPayMethod === 'credit') {
      // creditCurrency determina si el precio base es nominal (USD) o internalizado (VES)
      // USD: cliente paga en $ → precio nominal sin inflar ($29.90)
      // VES: cliente paga en Bs → precio inflado a tasa interna ($40.833 → Bs 19,435)
      const baseRemainingUSD = creditCurrency === 'USD' ? totalUSDNominal : remainingUSD;
      const downUSD = Math.max(0, Math.min(baseRemainingUSD, creditDownPaymentUSD));
      const baseOutstandingUSD = Math.max(0, roundMoney(baseRemainingUSD - downUSD));
      // USD: el restante está en precio nominal (lista) → $ en AR y Bs a tasa BCV.
      // VES: `remainingUSD` / `baseOutstandingUSD` ya vienen de `effectiveTotalUSD` = `totalUSDInternalized`
      // (no son nominales). No multiplicar otra vez por tasa int/BCV: eso inflaba el crédito (~BCV/USD "duplicado").
      const creditUSD = Math.max(0, roundMoney(baseOutstandingUSD));
      const creditVES = creditCurrency === 'USD'
        ? roundMoney(baseOutstandingUSD * exchangeRateBCV)
        : roundMoney(baseOutstandingUSD * internalRateNumber);
      if (downUSD > 0 && creditDownEnabled) {
        const needsRefDown = creditDownMethod !== 'cash_usd' && creditDownMethod !== 'cash_ves' && creditDownMethod !== 'others';
        if (needsRefDown && (!creditDownRef || creditDownRef.length < 6)) {
          showToast(`La referencia es obligatoria (mín. 6) para abonos tipo ${creditDownMethod.toUpperCase()}.`, 'warning');
          return;
        }
        if ((creditDownMethod === 'debit' || creditDownMethod === 'biopago') && !selectedCreditDownPOSTerminal) {
          showToast('Debe seleccionar una terminal POS para abonos por débito o biopago.', 'warning');
          return;
        }
      }

      const downPayment: PaymentEntry | null = (creditDownEnabled && downUSD > 0) ? {
        id: Math.random().toString(36).substr(2, 9),
        method: creditDownMethod as any,
        amountUSD: roundMoney(downUSD),
        amountVES: creditDownCurrency === 'VES' ? creditDownPaymentVES : (downUSD * exchangeRateBCV),
        bank: (creditDownMethod === 'mobile' || creditDownMethod === 'transfer' || creditDownMethod === 'digital_usd' || creditDownMethod === 'debit' || creditDownMethod === 'biopago') ? creditDownBank : undefined,
        bankAccountId: selectedCreditDownPOSTerminal ? String(selectedCreditDownPOSTerminal.accountId ?? '') : undefined,
        bankAccountLabel: selectedCreditDownPOSTerminal ? String(selectedCreditDownPOSTerminal.accountLabel ?? '') : undefined,
        posTerminalId: selectedCreditDownPOSTerminal ? String(selectedCreditDownPOSTerminal.id ?? '') : undefined,
      } : null;

      // Create the credit payment entry for the outstanding balance
      const creditPayment: PaymentEntry = {
        id: Math.random().toString(36).substr(2, 9),
        method: 'credit',
        amountUSD: roundMoney(creditUSD),
        amountVES: roundMoney(creditVES),
        rateUsed: internalRateNumber,
        note: creditDownEnabled && downUSD > 0 ? `Abono inicial: $${downUSD.toFixed(2)}` : undefined
      };

      // Add both down payment (if any) and credit payment to the session
      const newPayments = [...currentSession.payments];
      if (downPayment) newPayments.push(downPayment);
      newPayments.push(creditPayment);

      updateCurrentSession({
        payments: newPayments
      });

      setPayAmount('');
      setPayAmountTouched(false);
      setPayRef('');
      setPayNote('');
      setCreditDownAmountUSD('');
      setCreditDownAmountVES('');
      setCreditDownRef('');
      setCreditDownFiles([]);
      return;
    }

    const amountFloat = parseFloat(payAmount) || 0;
    const activeRateNumber = parseFloat(customRate) || exchangeRateInternal;
    if (amountFloat <= 0) return;

    // Strict Validation: Required Reference (Digital ONLY, Credit exempt)
    const needsRef = currentPayMethod !== 'cash_usd' && currentPayMethod !== 'cash_ves' && currentPayMethod !== 'others' && currentPayMethod !== 'credit';
    if (needsRef && (!payRef || payRef.length < 6)) {
      showToast(`La referencia es obligatoria (mín. 6 dígitos) para cobros tipo ${currentPayMethod.toUpperCase()}.`, 'warning');
      return;
    }
    if ((currentPayMethod === 'debit' || currentPayMethod === 'biopago') && !selectedPayPOSTerminal) {
      showToast('Debe seleccionar una terminal POS para pagos por débito o biopago.', 'warning');
      return;
    }

    // Validación preventiva banco ↔ método: el banco seleccionado debe soportar el método
    // Evita que se registren pagos contra un banco que no está configurado para recibirlos,
    // lo que causaría inconsistencias en bank_transactions y en el cierre de caja.
    const methodsRequiringBank: PaymentMethod[] = ['mobile', 'transfer', 'digital_usd', 'debit', 'biopago', 'zelle'];
    if (methodsRequiringBank.includes(currentPayMethod)) {
      const allowedBanks = arBanksByMethod[currentPayMethod as Exclude<PaymentMethod, 'credit'>] ?? [];
      if (!payBank || !String(payBank).trim()) {
        showToast(`Debe seleccionar un banco para el método ${currentPayMethod.toUpperCase()}.`, 'warning');
        return;
      }
      if (allowedBanks.length > 0 && !allowedBanks.includes(payBank)) {
        showToast(`El banco "${payBank}" no está configurado para recibir pagos por ${currentPayMethod.toUpperCase()}. Revise supportedMethods en Finanzas → Bancos.`, 'warning');
        return;
      }
    }

    const useInternalRate = currentPayMethod === 'others';
    const rateForConversion = useInternalRate ? internalRateNumber : activeRateNumber;
    const rateForVES = useInternalRate ? internalRateNumber : exchangeRateBCV;

    // For CxP USD mode: use amount as-is (nominal price), don't convert
    const isCxPUSDMode = useInternalRate && String(payBank).toUpperCase() === 'CXP' && !payNote.includes('TASA:');
    // Ant. Cliente is a pure USD accounting cross — no VES equivalent should be stored
    const isAntClienteMode = useInternalRate && String(payBank) === 'Ant. Cliente';
    // DxV en VES: override manual tiene prioridad sobre auto-detección
    const isDxVVESMode = String(payBank) === 'DxV' && (dxvModeOverride !== null ? dxvModeOverride === 'VES' : registeredPaymentsAreVES);
    const amountInUSD = isDxVVESMode ? roundFX(amountFloat / (internalRateNumber || 1))
                        : isBsMethod ? (amountFloat / rateForConversion)
                        : amountFloat;
    const amountInVES = isDxVVESMode ? roundMoney(amountFloat)
                        : isBsMethod ? amountFloat
                        : isAntClienteMode ? 0
                        : isCxPUSDMode ? (amountFloat * exchangeRateBCV) : (amountFloat * rateForVES);

    // BILL-SEC-01: no registrar renglones Ant. Cliente por encima del saldo (reserva USD vs [VES] en la nota)
    if (isAntClienteMode) {
      const advUSDBal = clientAdvances.filter(a => (a.currency ?? 'USD') === 'USD').reduce((s, a) => s + a.balanceUSD, 0);
      const advVESBal = clientAdvances.filter(a => a.currency === 'VES').reduce((s, a) => s + a.balanceUSD, 0);
      const noteU = (payNote || '').toUpperCase();
      const pool: 'USD' | 'VES' = noteU.includes('[VES]') ? 'VES' : (noteU.includes('[USD]') ? 'USD' : antClienteCurrency);
      const cap = pool === 'VES' ? advVESBal : advUSDBal;
      const poolForNote = (n: string | undefined) => (String(n ?? '').toUpperCase().includes('[VES]') ? 'VES' as const : 'USD' as const);
      const samePoolAlready = currentSession.payments
        .filter(p => p.method === 'others' && String(p.bank ?? '') === 'Ant. Cliente' && poolForNote(p.note) === pool)
        .reduce((a, p) => a + (Number(p.amountUSD) || 0), 0);
      const lineUsd = roundFX(Number(amountInUSD) || 0);
      if (lineUsd > 0.005 && cap <= 0.005) {
        showToast(`No hay saldo de anticipo ${pool} para aplicar (disponible: $${cap.toFixed(2)}).`, 'error');
        return;
      }
      if (samePoolAlready + lineUsd > cap + 0.02) {
        showToast(
          `Monto de Ant. Cliente [${pool}] excede el saldo. Disponible: $${cap.toFixed(2)}; en esta venta: $${samePoolAlready.toFixed(2)}; renglón: $${lineUsd.toFixed(2)}.`,
          'error'
        );
        return;
      }
    }

    updateCurrentSession({
      payments: [...currentSession.payments, {
        id: Math.random().toString(36).substr(2, 9),
        method: currentPayMethod,
        amountUSD: roundMoney(amountInUSD),
        amountVES: roundMoney(amountInVES),
        bank: (currentPayMethod === 'mobile' || currentPayMethod === 'transfer' || currentPayMethod === 'digital_usd' || currentPayMethod === 'debit' || currentPayMethod === 'biopago' || currentPayMethod === 'zelle' || currentPayMethod === 'others') ? payBank : undefined,
        bankAccountId: selectedPayPOSTerminal ? String(selectedPayPOSTerminal.accountId ?? '') : undefined,
        bankAccountLabel: selectedPayPOSTerminal ? String(selectedPayPOSTerminal.accountLabel ?? '') : undefined,
        posTerminalId: selectedPayPOSTerminal ? String(selectedPayPOSTerminal.id ?? '') : undefined,
        posTerminalName: selectedPayPOSTerminal ? String(selectedPayPOSTerminal.name ?? '') : undefined,
        reference: payRef,
        note: currentPayMethod === 'others' ? (payNote || payBank) : (currentPayMethod === 'credit' ? (payNote || undefined) : undefined),
        files: payFiles,
        rateUsed: isBsMethod
          ? rateForConversion
          : isCxPUSDMode ? exchangeRateBCV
          : (useInternalRate ? internalRateNumber : exchangeRateBCV),
        cashDenominations: currentPayMethod === 'cash_usd'
          ? (cashDenomsUSD.length > 0 ? cashDenomsUSD.filter(b => b.qty > 0) : undefined)
          : currentPayMethod === 'cash_ves'
          ? (cashDenomsVES.length > 0 ? cashDenomsVES.filter(b => b.qty > 0) : undefined)
          : undefined,
        // Denominaciones entregadas como vuelto (solo si hay vuelto real en este pago en efectivo)
        cashChangeDenominations: currentPayMethod === 'cash_usd'
          ? (changeDenomsUSD.filter(b => b.qty > 0).length > 0 ? changeDenomsUSD.filter(b => b.qty > 0) : undefined)
          : currentPayMethod === 'cash_ves'
          ? (changeDenomsVES.filter(b => b.qty > 0).length > 0 ? changeDenomsVES.filter(b => b.qty > 0) : undefined)
          : undefined,
        cashChangeDenominationsCurrency: currentPayMethod === 'cash_usd'
          ? (changeDenomsUSD.filter(b => b.qty > 0).length > 0 ? 'USD' : undefined)
          : currentPayMethod === 'cash_ves'
          ? (changeDenomsVES.filter(b => b.qty > 0).length > 0 ? 'VES' : undefined)
          : undefined,
        cashChangeGivenOverride: (currentPayMethod === 'cash_usd' || currentPayMethod === 'cash_ves') && changeGivenOverride.trim() !== '' && !isNaN(parseFloat(changeGivenOverride))
          ? parseFloat(changeGivenOverride)
          : undefined
      }]
    });
    setPayAmount(''); setPayAmountTouched(false); setPayRef(''); setPayNote(''); setPayFiles([]);
    if (currentPayMethod === 'debit' || currentPayMethod === 'biopago') setPayPOSTerminalId('');
    if (currentPayMethod === 'cash_usd') { setCashDenomsUSD([]); setChangeDenomsUSD([]); setChangeGivenOverride(''); }
    if (currentPayMethod === 'cash_ves') { setCashDenomsVES([]); setChangeDenomsVES([]); setChangeGivenOverride(''); }
    if (String(payBank) === 'DxV') setDxvModeOverride(null);
  };

  const removePayment = (id: string) => {
    const payment = currentSession.payments.find(p => p.id === id);
    if (payment) {
      // SEC-05: Audit trail para eliminación de pago
      dataService.addAuditEntry('PAYMENTS', 'PAYMENT_REMOVED', 
        `Pago eliminado: ${payment.method} | $${payment.amountUSD.toFixed(2)} | ${payment.bank || 'Sin banco'} | Sesión: ${currentSession.label} | Usuario: ${dataService.getCurrentUser()?.name || 'Sistema'}`);
    }
    updateCurrentSession({
      payments: currentSession.payments.filter(p => p.id !== id)
    });
  };

  const handleItemSearchChange = (value: string) => {
    setQuickSearch(value);
    let term = value.toUpperCase();
    if (term.includes('*')) term = term.split('*')[0].trim();
    if (term.length >= 2) {
      const matches = dataService.getStocks().filter(p => p.description.toUpperCase().includes(term) || p.code.toUpperCase().includes(term)).slice(0, 10);
      setItemSuggestions(matches);
      setShowItemSuggestions(matches.length > 0);
      setSelectedItemIndex(-1);
    } else {
      setShowItemSuggestions(false);
      setSelectedItemIndex(-1);
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent) => {
    if (!showItemSuggestions || itemSuggestions.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleQuickAdd(quickSearch);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedItemIndex(prev =>
          prev < itemSuggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedItemIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedItemIndex >= 0) {
          const p = itemSuggestions[selectedItemIndex];
          addItem({ id: Math.random().toString(36).substr(2, 9), code: p.code, description: p.description, unit: p.unit, qty: 1, priceUSD: p.priceUSD, priceLevel: 1, tax: 16 });
          setQuickSearch('');
          setShowItemSuggestions(false);
          setSelectedItemIndex(-1);
        } else {
          handleQuickAdd(quickSearch);
        }
        break;
      case 'Escape':
        setShowItemSuggestions(false);
        setSelectedItemIndex(-1);
        break;
    }
  };

  const paymentMethodOptions: Array<{ id: PaymentMethod; l: string }> = [
    { id: 'cash_usd', l: 'Efec $' },
    { id: 'cash_ves', l: 'Efec Bs' },
    { id: 'zelle', l: 'Zelle' },
    { id: 'mobile', l: 'PMóvil' },
    { id: 'transfer', l: 'Transf' },
    { id: 'debit', l: 'Débito' },
    { id: 'biopago', l: 'BioPago' },
    { id: 'digital_usd', l: 'Digital $' },
    { id: 'credit', l: 'Crédito' },
    { id: 'others', l: 'Otros' }
  ];

  const currentPaymentMethodLabel = paymentMethodOptions.find((method) => method.id === currentPayMethod)?.l ?? currentPayMethod;
  const clientFinancialLabel = !activeClient
    ? 'Sin cliente'
    : !clientAccountStatus.manualSolvent
      ? 'Bloqueado'
      : clientAccountStatus.overdueCount > 0
        ? 'Vencida'
        : clientAccountStatus.exceedsLimit
          ? 'Límite excedido'
          : clientAccountStatus.isSolvent
            ? 'Solvente'
            : 'Con deuda';
  const clientFinancialClass = !activeClient
    ? 'rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500'
    : !clientAccountStatus.manualSolvent
      ? 'rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-black uppercase text-red-700'
      : clientAccountStatus.overdueCount > 0 || clientAccountStatus.exceedsLimit
        ? 'rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black uppercase text-amber-700'
        : clientAccountStatus.isSolvent
          ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-700'
          : 'rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-[10px] font-black uppercase text-sky-700';
  return (
    <div className="flex h-full min-h-0 flex-col gap-0.5 animate-in fade-in duration-500 overflow-hidden bg-slate-50 text-[95%]">
      {/* Banner: Caja no abierta */}
      {!hasCashBoxOpen && (
        <div className="flex items-center gap-3 bg-red-600 text-white px-4 py-2.5">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest">
            ⚠️ No hay caja abierta — Debes abrir tu sesión de caja antes de registrar ventas. Ve al módulo <strong>Cierre de Caja</strong> y abre tu turno.
          </p>
        </div>
      )}
      {/* Sessions Bar */}
      <div className="flex items-center bg-white px-3 py-1.5 gap-1.5 border-b border-slate-200 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2 px-2 border-r pr-3 mr-1">
          <Layers className="w-4 h-4 text-teal-700" />
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Sesiones</span>
        </div>
        {sessions.map((s, idx) => (
          <div
            key={s.id}
            className={`shrink-0 h-8 px-1.5 rounded-full flex items-center gap-1 transition-all ${activeSessionId === s.id ? 'bg-teal-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
          >
            <button
              onClick={() => setActiveSessionId(s.id)}
              className="h-7 px-2 text-[9px] font-black uppercase flex items-center"
            >
              <span className="truncate max-w-[100px]">{s.label}</span>
            </button>
            <button
              onClick={(e) => closeSession(s.id, e)}
              className={`p-0.5 rounded-full hover:bg-red-500 hover:text-white transition-all ${activeSessionId === s.id ? 'text-white/40' : 'text-slate-300'}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button onClick={createNewSession} className="shrink-0 h-8 w-8 bg-teal-700 text-white rounded-full flex items-center justify-center hover:bg-teal-800 transition-all">
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Client & Business Name Bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:items-center md:gap-1.5.5">
          <div className="flex flex-col gap-1.5 w-full md:w-52 lg:w-60 xl:w-64">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Cliente (RIF/V)</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text" value={currentSession.searchClientId} onChange={(e) => handleClientSearchChange(e.target.value)}
                  onKeyDown={handleClientKeyDown}
                  onBlur={() => setTimeout(() => { setShowSuggestions(false); setSelectedClientIndex(-1); }, 150)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-bold text-slate-800 outline-none transition-all focus:border-teal-500 focus:ring-2 focus:ring-teal-200"
                  placeholder="V-24326997"
                />
                {showSuggestions && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[18rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
                    {clientSuggestions.map((c, index) => (
                      <button
                        key={c.id}
                        onMouseDown={() => selectClientSuggestion(c)}
                        className={`flex w-full flex-col border-b px-3 py-2 text-left last:border-0 transition-colors ${
                          index === selectedClientIndex ? 'bg-teal-100' : 'hover:bg-teal-50'
                        }`}
                      >
                        <span className="text-[10px] font-black uppercase text-slate-800">{c.name}</span>
                        <span className="text-[8px] font-bold text-slate-400">{c.id}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setShowClientModal(true)} className="rounded-lg bg-teal-700 px-3.5 py-1.5 text-[8px] font-black uppercase tracking-wide text-white transition-colors hover:bg-teal-800">R-Nuevo (F4)</button>
              <button 
                onClick={() => {
                  updateCurrentSession({ 
                    client: GENERIC_CASH_CLIENT, 
                    searchClientId: 'CONTADO', 
                    label: 'CONTADO' 
                  });
                }}
                className={`rounded-lg px-3.5 py-1.5 text-[8px] font-black uppercase tracking-wide text-white transition-colors ${
                  activeClient?.id === 'CONTADO' 
                    ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-300' 
                    : 'bg-slate-600 hover:bg-slate-700'
                }`}
                title="Venta rápida al contado sin cliente específico"
              >
                CONTADO
              </button>
            </div>
          </div>

        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <label className="text-[8px] font-black text-slate-400 uppercase tracking-wider">Razón social</label>
            <div className={`rounded-lg px-4 py-1.5 flex items-center text-[11px] font-black uppercase tracking-wide truncate ${
              activeClient 
                ? activeClient.id === 'CONTADO' 
                  ? 'bg-emerald-600 text-white'
                  : 'bg-teal-800 text-white' 
                : 'border border-dashed border-slate-300 bg-slate-100 text-slate-400'
            }`}>
              {activeClient ? activeClient.name : 'Sin cliente seleccionado'}
              {activeClient?.id === 'CONTADO' && (
                <span className="ml-2 text-[8px] opacity-80">(Venta rápida)</span>
              )}
            </div>
          </div>

        <div className="flex gap-2 w-full md:w-auto">
            <div className="flex-1 md:w-28 lg:w-30 xl:w-32">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Estado</div>
              <div className={clientFinancialClass}>{clientFinancialLabel}</div>
            </div>
            <div className="flex-1 md:w-32 lg:w-34 xl:w-36">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Correlativo</div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[10px] font-black text-amber-700 font-mono">
                #PENDIENTE
              </div>
            </div>
          </div>
        </div>

        {activeClient && (() => {
          // Calculate severity colors based on credit usage and status
          const creditLimit = clientAccountStatus.creditLimit || 0;
          const debt = clientAccountStatus.debtUSD || 0;
          const creditUsedPct = creditLimit > 0 ? (debt / creditLimit) * 100 : 0;
          
          // Debe panel color based on credit usage %
          const debeBgClass = debt <= 0.01 
            ? 'bg-emerald-50 border-emerald-200' 
            : creditUsedPct < 30 
              ? 'bg-emerald-50 border-emerald-200' 
              : creditUsedPct < 60 
                ? 'bg-amber-50 border-amber-200' 
                : creditUsedPct < 85 
                  ? 'bg-orange-50 border-orange-200' 
                  : 'bg-red-50 border-red-200';
          const debeTextClass = debt <= 0.01 
            ? 'text-emerald-800' 
            : creditUsedPct < 30 
              ? 'text-emerald-800' 
              : creditUsedPct < 60 
                ? 'text-amber-800' 
                : creditUsedPct < 85 
                  ? 'text-orange-800' 
                  : 'text-red-800';
          
          // Condición panel color
          const condicionBgClass = clientAccountStatus.isSolvent && debt <= 0.01
            ? 'bg-emerald-50 border-emerald-200' 
            : clientAccountStatus.isSolvent 
              ? 'bg-amber-50 border-amber-200' 
              : 'bg-red-50 border-red-200';
          const condicionTextClass = clientAccountStatus.isSolvent && debt <= 0.01
            ? 'text-emerald-800' 
            : clientAccountStatus.isSolvent 
              ? 'text-amber-800' 
              : 'text-red-800';
          
          // Pendientes panel color
          const pendientesBgClass = clientAccountStatus.openCount === 0 
            ? 'bg-emerald-50 border-emerald-200' 
            : clientAccountStatus.overdueCount > 0 
              ? 'bg-red-50 border-red-200' 
              : clientAccountStatus.openCount > 3 
                ? 'bg-orange-50 border-orange-200' 
                : clientAccountStatus.openCount > 1 
                  ? 'bg-amber-50 border-amber-200' 
                  : 'bg-emerald-50 border-emerald-200';
          const pendientesTextClass = clientAccountStatus.openCount === 0 
            ? 'text-emerald-800' 
            : clientAccountStatus.overdueCount > 0 
              ? 'text-red-800' 
              : clientAccountStatus.openCount > 3 
                ? 'text-orange-800' 
                : clientAccountStatus.openCount > 1 
                  ? 'text-amber-800' 
                  : 'text-emerald-800';
          
          // Exposición panel color (usa valores reales registrados, no proyección de sesión)
          const availablePct = creditLimit > 0 ? (clientAccountStatus.availableCreditUSD / creditLimit) * 100 : 0;
          const exposicionBgClass = !clientAccountStatus.hasCredit 
            ? 'bg-slate-50 border-slate-200' 
            : creditLimit <= 0 
              ? 'bg-slate-50 border-slate-200' 
              : availablePct > 50 
                ? 'bg-emerald-50 border-emerald-200' 
                : availablePct > 20 
                  ? 'bg-amber-50 border-amber-200' 
                  : availablePct > 0 
                    ? 'bg-orange-50 border-orange-200' 
                    : 'bg-red-50 border-red-200';
          const exposicionTextClass = !clientAccountStatus.hasCredit 
            ? 'text-slate-700' 
            : creditLimit <= 0 
              ? 'text-slate-700' 
              : availablePct > 50 
                ? 'text-emerald-800' 
                : availablePct > 20 
                  ? 'text-amber-800' 
                  : availablePct > 0 
                    ? 'text-orange-800' 
                    : 'text-red-800';
          const exposicionLabelClass = !clientAccountStatus.hasCredit 
            ? 'text-slate-500' 
            : creditLimit <= 0 
              ? 'text-slate-500' 
              : availablePct > 50 
                ? 'text-emerald-600' 
                : availablePct > 20 
                  ? 'text-amber-600' 
                  : availablePct > 0 
                    ? 'text-orange-600' 
                    : 'text-red-600';
          
          return (
            <div className={`mt-3 grid grid-cols-2 gap-2 ${clientAdvanceBalance > 0.005 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
              <div className={`rounded-xl border px-4 py-3 ${condicionBgClass}`}>
                <div className={`text-[10px] font-black uppercase tracking-widest ${clientAccountStatus.isSolvent && debt <= 0.01 ? 'text-emerald-600' : clientAccountStatus.isSolvent ? 'text-amber-600' : 'text-red-600'}`}>Condición</div>
                <div className={`mt-1.5 text-[13px] font-black uppercase ${condicionTextClass}`}>{clientFinancialLabel}</div>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${debeBgClass}`}>
                <div className={`text-[10px] font-black uppercase tracking-widest ${debt <= 0.01 ? 'text-emerald-600' : creditUsedPct < 30 ? 'text-emerald-600' : creditUsedPct < 60 ? 'text-amber-600' : creditUsedPct < 85 ? 'text-orange-600' : 'text-red-600'}`}>Debe</div>
                <div className={`mt-1.5 text-[14px] font-black font-mono ${debeTextClass}`}>$ {clientAccountStatus.debtUSD.toFixed(2)}</div>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${pendientesBgClass}`}>
                <div className={`text-[10px] font-black uppercase tracking-widest ${clientAccountStatus.openCount === 0 ? 'text-emerald-600' : clientAccountStatus.overdueCount > 0 ? 'text-red-600' : clientAccountStatus.openCount > 3 ? 'text-orange-600' : clientAccountStatus.openCount > 1 ? 'text-amber-600' : 'text-emerald-600'}`}>Pendientes</div>
                <div className={`mt-1.5 text-[13px] font-black ${pendientesTextClass}`}>{clientAccountStatus.openCount} fact. {clientAccountStatus.overdueCount > 0 ? `• ${clientAccountStatus.overdueCount} venc.` : ''}</div>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${exposicionBgClass}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className={`text-[10px] font-black uppercase tracking-widest ${exposicionLabelClass}`}>Disponible</div>
                    <div className={`mt-1.5 text-[14px] font-black font-mono ${exposicionTextClass}`}>{clientAccountStatus.creditLimit > 0 ? `$ ${clientAccountStatus.availableCreditUSD.toFixed(2)}` : 'Sin límite'}</div>
                    <div className={`text-[10px] font-bold ${exposicionTextClass}`}>Usado: $ {clientAccountStatus.debtUSD.toFixed(2)}</div>
                  </div>
                  {clientAccountStatus.openCount > 0 && (
                    <button type="button" onClick={() => setShowARModal(true)} className="rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-white hover:bg-slate-800">
                      Ver AR
                    </button>
                  )}
                </div>
              </div>

              {clientAdvanceBalance > 0.005 && (
                <div className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 col-span-2 md:col-span-1">
                  <div className="flex items-center justify-between gap-1">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Anticipo</div>
                      <div className="mt-1.5 text-[14px] font-black font-mono text-amber-800">$ {clientAdvanceBalance.toFixed(2)}</div>
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {clientAdvances.some(a => a.currency === 'USD') && <span className="text-[8px] font-black bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">USD</span>}
                        {clientAdvances.some(a => a.currency === 'VES') && <span className="text-[8px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Bs → T.I.</span>}
                      </div>
                    </div>
                    <div className="text-lg">💰</div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Banner de anticipo disponible */}
      {activeClient && clientAdvanceBalance > 0.005 && (
        <div className="mt-2 flex items-center gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-2.5 shadow-sm">
          <span className="text-xl shrink-0">💰</span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
              Anticipo disponible: <span className="text-amber-900 text-[12px]">${clientAdvanceBalance.toFixed(2)}</span>
            </p>
            <p className="text-[9px] font-bold text-amber-600 truncate">
              {activeClient.name} tiene saldo a favor. Puedes aplicarlo en el cobro usando <strong>Ant. Cliente</strong>.
            </p>
            {clientAdvances.some(a => a.currency === 'VES') && (
              <p className="text-[8px] font-bold text-blue-600 mt-0.5">
                ⚠️ Anticipo en Bs: se aplicará a <strong>tasa interna</strong>. Anticipo en $: se aplica 1:1.
              </p>
            )}
          </div>
          {clientAdvances.length > 0 && (
            <div className="shrink-0 text-right space-y-0.5">
              {clientAdvances.map(adv => (
                <div key={adv.id} className="text-[8px] font-black text-amber-700 flex items-center gap-1 justify-end">
                  <span className={`px-1 py-0.5 rounded text-[7px] font-black ${
                    adv.currency === 'VES' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>{adv.currency === 'VES' ? 'Bs' : 'USD'}</span>
                  ${adv.balanceUSD.toFixed(2)} · {adv.originCorrelativo}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Area */}
      <div className="flex-1 min-h-0 grid grid-cols-1 gap-1.5 overflow-hidden md:grid-cols-[minmax(0,1fr)_12rem] md:grid-cols-[minmax(0,1fr)_14rem] xl:grid-cols-[minmax(0,1fr)_15.5rem] 2xl:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <div className="relative z-20 flex-1 bg-white rounded-2xl shadow-sm border border-slate-200/50 flex flex-col overflow-visible min-h-0">
            <div className="relative z-30 px-3 py-1.5 border-b flex flex-col sm:flex-row justify-between bg-slate-50/50 gap-1.5 overflow-visible">
              <div className="relative flex-1 max-md">
                <input
                  id="quick-search-input"
                  type="text" placeholder="SKU O SCANNER..."
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-[9px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-500"
                  value={quickSearch} onChange={(e) => handleItemSearchChange(e.target.value)}
                  onKeyDown={handleItemKeyDown}
                  onBlur={() => setTimeout(() => { setShowItemSuggestions(false); setSelectedItemIndex(-1); }, 200)}
                />
                <PackagePlus className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                {showItemSuggestions && (
                  <div className="absolute left-0 top-full mt-2 w-full max-w-[min(640px,calc(100vw-8rem))] rounded-2xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.18)] z-[120] overflow-hidden max-h-[360px] overflow-y-auto animate-in slide-in-from-top-1 ring-1 ring-emerald-100">
                    <div className="sticky top-0 bg-white/95 backdrop-blur px-4 py-2 border-b flex justify-between items-center">
                      <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest">Sugerencias (Stock Lógico)</span>
                      <span className="text-[7px] text-amber-600 font-bold italic animate-pulse">Reserva dinámica activada</span>
                    </div>
                    {itemSuggestions.map((p, index) => {
                      const physicalTotal = (p.d3 || 0) + (p.d2 || 0) + (p.a1 || 0);
                      const reservedQty = getReservedQty(p.code);
                      const availableTotal = Math.max(0, physicalTotal - reservedQty);
                      const inCurrent = currentSession.items.find(i => i.code === p.code)?.qty || 0;
                      const isSelected = index === selectedItemIndex;

                      return (
                        <button
                          key={p.code}
                          onMouseDown={() => { addItem({ id: Math.random().toString(36).substr(2, 9), code: p.code, description: p.description, unit: p.unit, qty: 1, priceUSD: p.priceUSD, priceLevel: 1, tax: 16 }); setQuickSearch(''); setSelectedItemIndex(-1); }}
                          className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 flex justify-between items-center group transition-all ${
                            isSelected ? 'bg-emerald-100' : 'hover:bg-emerald-50'
                          } ${availableTotal === 0 && physicalTotal > 0 ? 'bg-amber-50/30' : physicalTotal === 0 ? 'opacity-50 grayscale' : ''}`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-black uppercase text-slate-800 group-hover:text-emerald-800">{p.description}</span>
                              {inCurrent > 0 && <span className="bg-emerald-100 text-emerald-700 text-[7px] px-1 rounded-sm font-black italic">EN ESTA VENTA</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[8px] font-mono text-slate-400">{p.code}</span>
                              <span className="text-[9px] font-black text-emerald-600">${p.priceUSD.toFixed(3)} <span className="text-[7px] text-slate-300 font-bold">/ {p.unit}</span></span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[12px] font-black font-mono leading-none ${availableTotal <= 0 ? 'text-red-500' : 'text-slate-700'}`}>{formatQuantity(availableTotal)}</span>
                              <span className="text-[7px] font-black text-slate-400 uppercase">{p.unit}</span>
                            </div>
                            <div className="flex gap-2 text-[7px] font-black uppercase text-slate-400">
                              <span>Fis: {formatQuantity(physicalTotal)}</span>
                              {reservedQty > 0 && <span className="text-amber-500">Reserv: {formatQuantity(reservedQty)}</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="flex gap-2 sm:justify-end">
                <button onClick={() => setShowCalculator(true)} className="px-3 py-1.5 bg-slate-800 text-white text-[7px] font-black uppercase rounded-lg flex items-center gap-1.5"><Calculator className="w-3 h-3" /> F3</button>
                <button onClick={() => setShowItemModal(true)} className="px-3 py-1.5 bg-emerald-900 text-white text-[7px] font-black uppercase rounded-lg flex items-center gap-1.5"><Plus className="w-3 h-3" /> Añadir</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto relative z-10 bg-white rounded-b-2xl">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white z-10 border-b text-[7px] uppercase tracking-widest text-slate-400 font-black">
                  <tr>
                    <th className="px-3 py-1.5 w-8">
                      <input
                        type="checkbox"
                        checked={currentSession.items.length > 0 && currentSession.selectedIds.length === currentSession.items.length}
                        onChange={(e) => updateCurrentSession({ selectedIds: e.target.checked ? currentSession.items.map(i => i.id) : [] })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </th>
                    <th className="px-2 py-1.5">Item</th>
                    <th className="px-3 py-1.5">Precio</th>
                    <th className="px-3 py-1.5 text-right">Cant.</th>
                    <th className="px-3 py-1.5 text-right">Total $</th>
                    <th className="px-3 py-1.5 text-center"></th>
                  </tr>
                </thead>
                <tbody className="text-[10px]">
                  {currentSession.items.map(i => (
                    <tr
                      key={i.id}
                      className={`border-b border-slate-50 transition-all cursor-crosshair ${currentSession.selectedIds.includes(i.id) ? 'bg-emerald-50/50' : 'hover:bg-emerald-50'}`}
                      onMouseEnter={() => setHoveredItem(i)}
                      onMouseLeave={() => setHoveredItem(null)}
                    >
                      <td className="px-3 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={currentSession.selectedIds.includes(i.id)}
                          onChange={(e) => {
                            const ids = e.target.checked ? [...currentSession.selectedIds, i.id] : currentSession.selectedIds.filter(id => id !== i.id);
                            updateCurrentSession({ selectedIds: ids });
                          }}
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <p className="font-black text-slate-800 uppercase text-[11px] leading-tight">{i.description}</p>
                        <p className="text-[7px] font-mono text-slate-400">{i.code}</p>
                        {(() => {
                          const prod = dataService.getStocks().find(p => p.code === i.code);
                          const avail = prod?.lotes?.reduce((s, l) => s + (l.qty || 0), 0) || 0;
                          const remaining = avail - i.qty;
                          if (remaining <= 3 && remaining >= 0) return (
                            <span className="inline-flex items-center gap-0.5 mt-0.5 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[7px] font-black">
                              ⚠️ Stock bajo: {remaining} restante{remaining !== 1 ? 's' : ''}
                            </span>
                          );
                          return null;
                        })()}
                      </td>
                      <td className="px-3 py-1.5">
                        <select value={i.priceLevel || 1} onChange={(e) => updateItemPriceLevel(i.id, i.code, parseInt(e.target.value))} className="bg-transparent text-[9px] font-black outline-none cursor-pointer">
                          {[1, 2, 3, 4, 5].map(l => <option key={l} value={l}>P{l} - ${dataService.getStocks().find(p => p.code === i.code)?.prices![l - 1].toFixed(3)}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        {(() => {
                          const product = dataService.getStocks().find(p => p.code === i.code);
                          const availableStock = product?.lotes?.reduce((sum, lote) => sum + (lote.qty || 0), 0) || 0;
                          return (
                            <QuantityInput 
                              value={i.qty} 
                              unit={i.unit} 
                              max={availableStock} 
                              onChange={(v) => updateItemQty(i.id, v)} 
                              onError={(msg) => showToast(msg, 'warning')} 
                            />
                          );
                        })()}
                      </td>
                      <td className="px-3 py-1.5 text-right font-black text-emerald-700 font-mono text-[10px]">{(i.qty * i.priceUSD).toLocaleString('es-VE', { minimumFractionDigits: 3 })}</td>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => removeItem(i.id)} className="text-slate-200 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="relative z-0 bg-white p-2.5 rounded-2xl border border-slate-200 shadow-sm space-y-2.5">
            <div className="flex flex-col gap-1.5 border-b border-slate-100 pb-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <label className="block text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Módulo de pago</label>
                <p className="mt-0.5 text-[9px] font-semibold text-slate-500">Seleccione un método y registre el cobro.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 lg:min-w-[220px]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Faltante</div>
                  <div className={`mt-1 text-[14px] font-black font-mono leading-none ${missingValue <= (isBsMethod ? 0.5 : 0.005) ? 'text-emerald-600' : 'text-amber-600'}`}>{missingLabel} {isBsMethod ? missingValue.toFixed(2) : missingValue.toFixed(3)}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-right">
                  <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Método actual</div>
                  <div className="mt-1 text-[10px] font-black uppercase text-slate-800">{currentPaymentMethodLabel}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-2.5 md:grid-cols-[160px_minmax(0,1fr)] md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[190px_minmax(0,1fr)]">
              <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-2 xl:self-start">
                {paymentMethodOptions.map(m => {
                  const total = currentSession.payments.filter(p => p.method === m.id).reduce((a, p) => a + p.amountUSD, 0);
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setCurrentPayMethod(m.id as any); setPayAmount(''); setPayAmountTouched(false); setPayFiles([]); }}
                      className={`rounded-xl border px-2.5 py-2 text-left transition-all ${currentPayMethod === m.id ? (m.id === 'credit' ? 'border-indigo-300 bg-indigo-50 text-indigo-900' : 'border-emerald-300 bg-emerald-50 text-emerald-900') : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="text-[7px] font-black uppercase tracking-wide">{m.l}</div>
                      <div className="mt-0.5 text-[8px] font-bold text-slate-400">{total > 0 ? `$${total.toFixed(2)}` : 'Sin registro'}</div>
                    </button>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 space-y-2 overflow-auto max-h-[20rem] xl:max-h-[19rem]">
                <div className="flex flex-col gap-1.5 xl:flex-row xl:items-end">
                  <div className="flex-1">
                    <label className="mb-1 block text-[7px] font-black uppercase tracking-widest text-slate-400">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-black tracking-tighter text-slate-300">{isBsMethod ? 'Bs.' : '$'}</span>
                      <input
                        autoFocus
                        type="number" step="0.001" value={payAmount} onChange={(e) => { setPayAmountTouched(true); setPayAmount(e.target.value); }} onKeyDown={(e) => e.key === 'Enter' && addPayment()}
                        className={`w-full rounded-2xl border-2 border-slate-200 bg-white pl-10 pr-3 py-2.5 font-mono font-black tracking-tighter text-slate-900 outline-none transition-all focus:border-emerald-500 ${payAmount.length > 8 ? 'text-lg' : 'text-xl lg:text-[1.35rem]'}`}
                      />
                    </div>
                  </div>

                  {isBsMethod && (
                    <div className="w-full sm:w-36 xl:w-28 shrink-0">
                      <label className="mb-1 block text-[7px] font-black uppercase tracking-widest text-slate-400">Tasa</label>
                      <input
                        type="number" step="0.01" value={customRate} onChange={(e) => setCustomRate(e.target.value)}
                        className="w-full rounded-2xl border-2 border-amber-100 bg-amber-50 px-3 py-2.5 text-center text-[10px] font-black text-amber-700 outline-none focus:border-amber-400"
                      />
                    </div>
                  )}

                  {(currentPayMethod !== 'cash_usd' && currentPayMethod !== 'cash_ves' && currentPayMethod !== 'others' && currentPayMethod !== 'credit') && (
                    <div className="w-full sm:w-36 xl:w-32 shrink-0">
                      <label className="mb-1 block text-[7px] font-black uppercase tracking-widest text-slate-400">Referencia</label>
                      <input
                        type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addPayment()}
                        placeholder="REF#"
                        className="w-full rounded-2xl border-2 border-slate-200 bg-white px-3 py-2.5 text-center text-[10px] font-black uppercase outline-none focus:border-emerald-500"
                      />
                    </div>
                  )}

                  <button onClick={addPayment} className="w-full sm:w-28 xl:w-24 shrink-0 rounded-2xl bg-emerald-600 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-emerald-700 active:scale-95">
                    Agregar
                  </button>
                </div>

                {/* Panel de denominaciones de billetes — solo efectivo */}
                {(currentPayMethod === 'cash_usd' || currentPayMethod === 'cash_ves') && (
                  <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                    <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                        {currentPayMethod === 'cash_usd' ? '💵 Billetes USD' : '🪙 Billetes Bs'}
                      </span>
                      {(currentPayMethod === 'cash_usd' ? cashTotalUSD : cashTotalVES) > 0 && (
                        <span className="text-[10px] font-black text-emerald-700 font-mono">
                          {currentPayMethod === 'cash_usd' ? `$ ${cashTotalUSD.toFixed(2)}` : `Bs ${cashTotalVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}`}
                        </span>
                      )}
                    </div>
                    <div className="px-4 py-3 space-y-3">
                      {/* Botones rápidos de denominación */}
                      <div className="flex flex-wrap gap-1.5">
                        {(currentPayMethod === 'cash_usd' ? DENOMS_USD : DENOMS_VES)
                          .filter(d => !(currentPayMethod === 'cash_usd' ? cashDenomsUSD : cashDenomsVES).find(b => b.denom === d))
                          .map(d => (
                            <button key={d} type="button"
                              onClick={() => currentPayMethod === 'cash_usd' ? addDenomUSD(d) : addDenomVES(d)}
                              className="text-[9px] font-black text-slate-500 bg-white border border-slate-200 rounded-full px-2.5 py-1 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all"
                            >
                              + {currentPayMethod === 'cash_usd' ? '$' : 'Bs'}{d}
                            </button>
                          ))
                        }
                      </div>
                      {/* Filas activas */}
                      <div className="space-y-1.5">
                        {[...(currentPayMethod === 'cash_usd' ? cashDenomsUSD : cashDenomsVES)]
                          .sort((a, b) => b.denom - a.denom)
                          .map(({ denom, qty }) => (
                            <div key={denom} className="flex items-center gap-2">
                              <span className="w-16 text-[10px] font-black text-slate-500 text-right">
                                {currentPayMethod === 'cash_usd' ? '$' : 'Bs'}{denom}
                              </span>
                              <span className="text-slate-300 text-xs">×</span>
                              <input type="number" min="0" max="9999" value={qty || ''}
                                onChange={e => currentPayMethod === 'cash_usd' ? updDenomUSD(denom, Number(e.target.value)||0) : updDenomVES(denom, Number(e.target.value)||0)}
                                placeholder="0"
                                className="w-16 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-sm font-black text-slate-900 text-center outline-none focus:border-emerald-400 transition-all"
                              />
                              <span className="text-slate-300 text-xs">=</span>
                              <span className="text-[10px] font-black text-slate-700 font-mono w-20">
                                {currentPayMethod === 'cash_usd' ? `$ ${(denom*qty).toFixed(2)}` : `Bs ${(denom*qty).toLocaleString('es-VE',{minimumFractionDigits:2})}`}
                              </span>
                              <button type="button"
                                onClick={() => currentPayMethod === 'cash_usd' ? remDenomUSD(denom) : remDenomVES(denom)}
                                className="ml-auto p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        }
                      </div>
                      {/* Vuelto con denominaciones entregadas */}
                      {(() => {
                        const isCashUSD = currentPayMethod === 'cash_usd';
                        const isCashVES = currentPayMethod === 'cash_ves';
                        const received = isCashUSD ? cashTotalUSD : cashTotalVES;
                        const charged = parseFloat(payAmount) || 0;
                        const autoChange = Math.max(0, received - charged);
                        if (autoChange <= 0) return null;
                        const sym = isCashUSD ? '$' : 'Bs';
                        const denoms = isCashUSD ? DENOMS_USD : DENOMS_VES;
                        const activeDenoms = isCashUSD ? changeDenomsUSD : changeDenomsVES;
                        const denomsTotal = isCashUSD ? changeDenomsTotalUSD : changeDenomsTotalVES;
                        const overrideFloat = parseFloat(changeGivenOverride);
                        const effectiveChange = !isNaN(overrideFloat) && overrideFloat >= 0
                          ? overrideFloat
                          : (activeDenoms.length > 0 ? denomsTotal : autoChange);
                        const mismatch = activeDenoms.length > 0 && Math.abs(denomsTotal - effectiveChange) > 0.005;
                        const fmt = (v: number) => isCashUSD ? `${sym} ${v.toFixed(2)}` : `${sym} ${v.toLocaleString('es-VE',{minimumFractionDigits:2})}`;
                        return (
                          <div className="pt-2 mt-2 border-t border-slate-100 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Vuelto entregado</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[8px] font-black text-slate-300 uppercase">Auto: {fmt(autoChange)}</span>
                                <input
                                  type="number" min="0" step="0.01"
                                  value={changeGivenOverride}
                                  onChange={(e) => setChangeGivenOverride(e.target.value)}
                                  placeholder={autoChange.toFixed(2)}
                                  className="w-24 bg-white border border-slate-200 rounded-xl px-2 py-1 text-sm font-black text-amber-700 text-right font-mono outline-none focus:border-amber-400 transition-all"
                                />
                              </div>
                            </div>
                            {/* Botones rápidos para denominaciones del vuelto */}
                            <div className="flex flex-wrap gap-1.5">
                              {denoms.filter(d => !activeDenoms.find(b => b.denom === d)).map(d => (
                                <button key={d} type="button"
                                  onClick={() => isCashUSD ? addChangeDenomUSD(d) : addChangeDenomVES(d)}
                                  className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-all"
                                >
                                  − {sym}{d}
                                </button>
                              ))}
                            </div>
                            {/* Filas de denominaciones entregadas */}
                            {activeDenoms.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {[...activeDenoms].sort((a, b) => b.denom - a.denom).map(({ denom, qty }) => (
                                  <div key={denom} className="flex items-center gap-2">
                                    <span className="w-16 text-[10px] font-black text-amber-600 text-right">− {sym}{denom}</span>
                                    <span className="text-slate-300 text-xs">×</span>
                                    <input type="number" min="0" max="9999" value={qty || ''}
                                      onChange={e => isCashUSD ? updChangeDenomUSD(denom, Number(e.target.value)||0) : updChangeDenomVES(denom, Number(e.target.value)||0)}
                                      placeholder="0"
                                      className="w-16 bg-white border border-amber-200 rounded-xl px-2 py-1.5 text-sm font-black text-amber-700 text-center outline-none focus:border-amber-400 transition-all"
                                    />
                                    <span className="text-slate-300 text-xs">=</span>
                                    <span className="text-[10px] font-black text-amber-700 font-mono w-20">− {fmt(denom * qty)}</span>
                                    <button type="button"
                                      onClick={() => isCashUSD ? remChangeDenomUSD(denom) : remChangeDenomVES(denom)}
                                      className="ml-auto p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                                    >
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <div className="flex justify-between items-center pt-1">
                                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total denominaciones</span>
                                  <span className={`text-sm font-black font-mono ${mismatch ? 'text-red-600' : 'text-amber-700'}`}>{fmt(denomsTotal)}</span>
                                </div>
                                {mismatch && (
                                  <div className="text-[9px] font-black text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1">
                                    ⚠ Denominaciones ({fmt(denomsTotal)}) no coinciden con el total declarado ({fmt(effectiveChange)}). Diferencia: {fmt(Math.abs(denomsTotal - effectiveChange))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {(currentPayMethod === 'mobile' || currentPayMethod === 'transfer' || currentPayMethod === 'digital_usd' || currentPayMethod === 'debit' || currentPayMethod === 'biopago' || currentPayMethod === 'zelle') && ((arBanksByMethod[currentPayMethod] ?? []).length > 0) && (
                  <div className="flex gap-2 mt-2 overflow-x-auto pb-1 no-scrollbar">
                    {(arBanksByMethod[currentPayMethod] ?? []).map(b => (
                      <button key={b} onClick={() => setPayBank(b)} className={`shrink-0 px-3.5 py-1.5 rounded-xl text-[8px] font-black transition-all ${payBank === b ? 'bg-emerald-800 text-white shadow-md' : 'bg-white border text-slate-400 hover:bg-slate-50'}`}>{b}</button>
                    ))}
                  </div>
                )}

                {(currentPayMethod === 'debit' || currentPayMethod === 'biopago') && (
                  <div className="mt-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Terminal POS</label>
                    <select value={payPOSTerminalId} onChange={(e) => setPayPOSTerminalId(e.target.value)} className="w-full mt-1 bg-white border-2 border-slate-200 rounded-2xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:border-emerald-500">
                      <option value="">Seleccione una terminal</option>
                      {payPOSTerminalOptions.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name} • {t.accountLabel}</option>
                      ))}
                    </select>
                  </div>
                )}

                {currentPayMethod === 'others' && (
                  <div className="flex flex-col gap-4 mt-3 bg-white p-4 rounded-2xl border-2 border-gray-100 shadow-sm">
                    {/* Botones de Tipo de otros (Nivel 1) */}
                    <div className="flex flex-wrap gap-2">
                      {['CxP', 'DxV', 'Ant. Cliente'].map((b) => {
                        const apBal = b === 'CxP' ? dataService.getAPBalanceBySupplier(currentSession.client?.name ?? '') : 0;
                        const antBal = b === 'Ant. Cliente' ? clientAdvanceBalance : 0;
                        const isSelected = payBank === b || (b === 'CxP' && payBank === 'CXP');
                        const isDisabledAnt = b === 'Ant. Cliente' && antBal <= 0.005;
                        return (
                          <button
                            key={b}
                            type="button"
                            disabled={isDisabledAnt}
                            onClick={() => {
                              const targetBank = b === 'CxP' ? 'CXP' : b;
                              handleSelectPayBank(targetBank);
                              if (b === 'CxP') {
                                setPayNote('RECONCILIACION CXP');
                              }
                              if (b === 'Ant. Cliente') {
                                const advUSD = clientAdvances.filter(a => (a.currency ?? 'USD') === 'USD').reduce((s, a) => s + a.balanceUSD, 0);
                                const advVES = clientAdvances.filter(a => a.currency === 'VES').reduce((s, a) => s + a.balanceUSD, 0);
                                // Seleccionar moneda dominante del anticipo disponible
                                const dominant: 'USD' | 'VES' = advVES > advUSD ? 'VES' : 'USD';
                                setAntClienteCurrency(dominant);
                                // Precio de referencia según moneda dominante
                                const refTotal = dominant === 'VES' ? totalUSDInternalized : totalUSDNominal;
                                const avail = dominant === 'VES' ? advVES : advUSD;
                                const applyAmt = Math.min(avail, refTotal > 0 ? refTotal : avail);
                                setPayAmount(applyAmt.toFixed(3));
                                setPayNote(`ANTICIPO CLIENTE [${dominant}]`);
                                setPayAmountTouched(true);
                              }
                            }}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all transform active:scale-95 shadow-sm border-2 ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 ring-4 ring-indigo-500/20'
                                : isDisabledAnt
                                  ? 'bg-gray-50 text-gray-300 border-gray-100 cursor-not-allowed'
                                  : 'bg-white text-gray-700 border-gray-100 hover:border-indigo-300'
                            }`}
                          >
                            {b}
                            {apBal > 0 && <span className="ml-1 text-emerald-600">(${apBal.toFixed(2)})</span>}
                            {antBal > 0.005 && b === 'Ant. Cliente' && <span className="ml-1 text-amber-600">(${antBal.toFixed(2)})</span>}
                            {isDisabledAnt && <span className="ml-1 text-gray-300">(sin saldo)</span>}
                          </button>
                        );
                      })}
                    </div>

                    {/* Panel DxV — Descuento por Venta */}
                    {String(payBank) === 'DxV' && (() => {
                      // isVESMode: override manual tiene prioridad sobre auto-detección
                      const isVESMode = dxvModeOverride !== null ? dxvModeOverride === 'VES' : registeredPaymentsAreVES;
                      const isAutoDetected = dxvModeOverride === null;
                      const dxvRaw = parseFloat(payAmount) || 0;
                      const dxvAmountUSD = isVESMode
                        ? roundFX(dxvRaw / (internalRateNumber || 1))
                        : roundFX(dxvRaw);
                      const dxvAmountVES = isVESMode
                        ? roundMoney(dxvRaw)
                        : roundMoney(dxvRaw * internalRateNumber);
                      const alreadyPaidUSD = currentSession.payments.reduce((a,p) => a+p.amountUSD, 0);
                      const alreadyPaidVES = currentSession.payments.reduce((a,p) => a+(p.amountVES||0), 0);
                      const totalVESNominal = roundMoney(totalUSDNominal * internalRateNumber);
                      const netUSD = roundFX(totalUSDNominal - dxvAmountUSD);
                      const netVES = roundMoney(totalVESNominal - dxvAmountVES);

                      const handleDxVModeSwitch = (newMode: 'USD' | 'VES') => {
                        setDxvModeOverride(newMode);
                        // Recalcular el monto en la nueva moneda
                        const usdMixVES = paymentsExcludingDxV.filter(p => !vesMethodSet.has(p.method)).reduce((a,p)=>a+(p.amountUSD||0)*internalRateNumber,0) + antClientePaidAsVES;
                        if (newMode === 'VES') {
                          const faltanteVES = roundMoney(Math.max(0, totalVESNominal - alreadyPaidVES - usdMixVES));
                          setPayAmount(faltanteVES.toFixed(2));
                          setPayNote('DESCUENTO POR VENTA DxV (VES)');
                        } else {
                          const faltanteUSD = roundFX(Math.max(0, totalUSDNominal - alreadyPaidUSD));
                          setPayAmount(faltanteUSD.toFixed(3));
                          setPayNote('DESCUENTO POR VENTA DxV (USD)');
                        }
                        setPayAmountTouched(true);
                      };

                      return (
                        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-violet-500" />
                              <span className="text-[10px] font-black text-violet-800 uppercase tracking-widest">Descuento por Venta (DxV)</span>
                            </div>
                            {/* Toggle manual de moneda */}
                            <div className="flex items-center gap-1 bg-white border border-violet-200 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleDxVModeSwitch('USD')}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all ${
                                  !isVESMode
                                    ? 'bg-emerald-500 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-emerald-600'
                                }`}
                              >
                                $ USD
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDxVModeSwitch('VES')}
                                className={`px-2.5 py-1 rounded-md text-[9px] font-black transition-all ${
                                  isVESMode
                                    ? 'bg-blue-500 text-white shadow-sm'
                                    : 'text-slate-400 hover:text-blue-600'
                                }`}
                              >
                                Bs. VES
                              </button>
                            </div>
                          </div>
                          {isAutoDetected && (
                            <p className="text-[8px] text-violet-400 font-bold">
                              Modo detectado automáticamente según pagos registrados. Puedes cambiarlo manualmente.
                            </p>
                          )}
                          <p className="text-[9px] text-violet-600 font-bold leading-relaxed">
                            Ajuste contable en <strong>{isVESMode ? 'bolívares' : 'dólares'}</strong> que cierra la diferencia entre el total facturado y el monto recibido.
                          </p>
                          <div className="bg-white rounded-lg p-3 space-y-1.5 border border-violet-100">
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400 font-bold">Total facturado:</span>
                              <span className="font-black text-slate-700">
                                {isVESMode ? `Bs. ${totalVESNominal.toLocaleString('es-VE', {minimumFractionDigits:2})}` : `$${totalUSDNominal.toFixed(3)}`}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400 font-bold">Ya cobrado:</span>
                              <span className="font-black text-slate-700">
                                {isVESMode ? `Bs. ${alreadyPaidVES.toLocaleString('es-VE', {minimumFractionDigits:2})}` : `$${alreadyPaidUSD.toFixed(3)}`}
                              </span>
                            </div>
                            <div className="flex justify-between text-[10px] text-red-600">
                              <span className="font-black">Descuento DxV:</span>
                              <span className="font-black">
                                {isVESMode ? `- Bs. ${dxvAmountVES.toLocaleString('es-VE', {minimumFractionDigits:2})}` : `- $${dxvAmountUSD.toFixed(3)}`}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1.5 border-t border-violet-100">
                              <span className="font-black text-violet-800">Total efectivo (neto):</span>
                              <span className="font-black text-violet-800">
                                {isVESMode ? `Bs. ${netVES.toLocaleString('es-VE', {minimumFractionDigits:2})}` : `$${netUSD.toFixed(3)}`}
                              </span>
                            </div>
                            <div className="flex justify-between text-[9px] text-slate-400">
                              <span>Equivalente en {isVESMode ? '$' : 'Bs.'}:</span>
                              <span className="font-mono">{isVESMode ? `≈ $${netUSD.toFixed(3)}` : `≈ Bs. ${netVES.toLocaleString('es-VE',{minimumFractionDigits:2})}`}</span>
                            </div>
                          </div>
                          <p className="text-[9px] text-violet-500 italic">
                            Al procesar, el descuento de {isVESMode ? `Bs. ${dxvAmountVES.toLocaleString('es-VE', {minimumFractionDigits:2})} (≈ $${dxvAmountUSD.toFixed(3)})` : `$${dxvAmountUSD.toFixed(3)} (≈ Bs. ${dxvAmountVES.toLocaleString('es-VE',{minimumFractionDigits:2})})`} quedará trazable en auditoría.
                          </p>
                        </div>
                      );
                    })()}

                    {/* Panel Ant. Cliente — Anticipo de Cliente disponible */}
                    {String(payBank) === 'Ant. Cliente' && (() => {
                      const applyAmt = parseFloat(payAmount) || 0;
                      const advUSDBalance = clientAdvances.filter(a => (a.currency ?? 'USD') === 'USD').reduce((s, a) => s + a.balanceUSD, 0);
                      const advVESBalance = clientAdvances.filter(a => a.currency === 'VES').reduce((s, a) => s + a.balanceUSD, 0);
                      const activeAvail = antClienteCurrency === 'VES' ? advVESBalance : advUSDBalance;
                      const balAfter = roundFX(Math.max(0, activeAvail - applyAmt));
                      // Precio de referencia correcto según moneda del anticipo
                      const refPrice = antClienteCurrency === 'VES' ? totalUSDInternalized : totalUSDNominal;
                      const refLabel = antClienteCurrency === 'VES'
                        ? `$${totalUSDInternalized.toFixed(3)} (precio × tasa interna)`
                        : `$${totalUSDNominal.toFixed(3)} (precio nominal)`;
                      return (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-amber-500" />
                              <span className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Anticipo de Cliente</span>
                            </div>
                            {/* Selector de moneda del anticipo */}
                            <div className="flex bg-white border border-amber-200 rounded-lg p-0.5">
                              {(['USD', 'VES'] as const).map(cur => (
                                <button
                                  key={cur}
                                  type="button"
                                  onClick={() => {
                                    setAntClienteCurrency(cur);
                                    const avail = cur === 'VES' ? advVESBalance : advUSDBalance;
                                    const ref = cur === 'VES' ? totalUSDInternalized : totalUSDNominal;
                                    const amt = Math.min(avail, ref > 0 ? ref : avail);
                                    setPayAmount(amt.toFixed(3));
                                    setPayNote(`ANTICIPO CLIENTE [${cur}]`);
                                    setPayAmountTouched(true);
                                  }}
                                  className={`px-3 py-1 rounded-md text-[10px] font-black transition-all ${
                                    antClienteCurrency === cur
                                      ? 'bg-amber-600 text-white shadow'
                                      : 'text-amber-700 hover:bg-amber-100'
                                  }`}
                                >
                                  {cur}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="bg-amber-100/60 rounded-lg px-3 py-2 text-[9px] font-bold text-amber-800">
                            {antClienteCurrency === 'VES'
                              ? 'Anticipo recibido en Bolívares → se aplica al precio internalizado (tasa interna).'
                              : 'Anticipo recibido en USD → se aplica al precio nominal (costo/inventario).'}
                          </div>
                          <div className="bg-white rounded-lg p-3 space-y-1.5 border border-amber-100">
                            {advUSDBalance > 0.005 && (
                              <div className="flex justify-between text-[10px]">
                                <span className="text-slate-400 font-bold">Saldo anticipos USD:</span>
                                <span className={`font-black ${ antClienteCurrency === 'USD' ? 'text-amber-700' : 'text-slate-400' }`}>${advUSDBalance.toFixed(2)}</span>
                              </div>
                            )}
                            {advVESBalance > 0.005 && (
                              <div className="flex justify-between text-[10px]">
                                <span className="text-slate-400 font-bold">Saldo anticipos VES (equiv. $):</span>
                                <span className={`font-black ${ antClienteCurrency === 'VES' ? 'text-amber-700' : 'text-slate-400' }`}>${advVESBalance.toFixed(2)}</span>
                              </div>
                            )}
                            <div className="flex justify-between text-[10px] border-t border-amber-100 pt-1.5">
                              <span className="text-slate-400 font-bold">Precio ref. ({antClienteCurrency}):</span>
                              <span className="font-black text-slate-700 text-[9px]">{refLabel}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-emerald-600">
                              <span className="font-black">Aplicando:</span>
                              <span className="font-black">- ${applyAmt.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1.5 border-t border-amber-100">
                              <span className="font-black text-amber-800">Saldo restante anticipo:</span>
                              <span className="font-black text-amber-800">${balAfter.toFixed(2)}</span>
                            </div>
                          </div>
                          {clientAdvances.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-[8px] font-black uppercase tracking-widest text-amber-500">Detalle de anticipos</div>
                              {clientAdvances.map(adv => (
                                <div key={adv.id} className={`flex items-center justify-between rounded-lg px-3 py-1.5 border text-[9px] ${
                                  (adv.currency ?? 'USD') === antClienteCurrency
                                    ? 'bg-amber-100 border-amber-300'
                                    : 'bg-white border-amber-100 opacity-50'
                                }`}>
                                  <div className="min-w-0">
                                    <span className="text-slate-500 truncate block">{adv.note || adv.originCorrelativo}</span>
                                    <span className={`text-[8px] font-black uppercase ${ adv.currency === 'VES' ? 'text-blue-500' : 'text-emerald-600' }`}>{adv.currency ?? 'USD'}</span>
                                  </div>
                                  <span className="font-black text-amber-700 shrink-0">${adv.balanceUSD.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          <p className="text-[9px] text-amber-500 italic">
                            Al procesar, se descontará ${applyAmt.toFixed(3)} del saldo de anticipos {antClienteCurrency} del cliente.
                          </p>
                        </div>
                      );
                    })()}

                    {/* Panel de Control de Moneda y Tasa (Solo para CxP) */}
                    {(String(payBank).toUpperCase().includes('CXP')) && (() => {
                      // Extraer la tasa de la nota si existe
                      const rateMatch = payNote.match(/TASA:\s*([\d.]+)/);
                      const cxpRate = rateMatch ? parseFloat(rateMatch[1]) : 0;
                      const isVES = payNote.includes('TASA:');
                      const amountRaw = parseFloat(payAmount) || 0;
                      // Si está en VES: el monto en el campo son Bs. -> descuento en $ = Bs / tasa
                      // Si está en USD: el monto en el campo son $ -> descuento en $ = directo
                      const apDiscountUSD = isVES && cxpRate > 0 ? amountRaw / cxpRate : amountRaw;
                      const amountInBs = isVES ? amountRaw : amountRaw * (cxpRate || exchangeRateBCV);

                      return (
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-inner space-y-3">
                          {/* Header: selección de moneda */}
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Configuración de Cruce CxP
                            </label>
                            <div className="flex bg-white rounded-lg p-0.5 border border-slate-200 shadow-sm">
                              {['USD', 'VES'].map((m) => {
                                const isActive = m === 'USD' ? !isVES : isVES;
                                return (
                                  <button
                                    key={m}
                                    type="button"
                                    onClick={() => {
                                      if (m === 'USD') {
                                        // Cambiar a USD: convertir el monto actual de Bs a $ si venía de VES
                                        if (isVES && cxpRate > 0) {
                                          setPayAmount((amountRaw / cxpRate).toFixed(3));
                                        }
                                        setPayNote('RECONCILIACION CXP');
                                        setPayAmountTouched(true);
                                      } else {
                                        // Cambiar a VES:
                                        // El monto en Bs es SIEMPRE el total de la factura en Bs (totalVES)
                                        // no se re-convierte el USD internalizado (eso causaba doble conversión)
                                        const bsAmount = totalVES; // Bs del carrito directamente
                                        const defaultRate = exchangeRateInternal; // Tasa inicial = interna
                                        setPayAmount(bsAmount.toFixed(2));
                                        setPayNote(`RECONCILIACION CXP (TASA: ${defaultRate.toFixed(2)})`);
                                        setPayAmountTouched(true);
                                      }
                                    }}
                                    className={`px-4 py-1.5 rounded-md text-[11px] font-black transition-all ${
                                      isActive
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : 'text-slate-400 hover:text-slate-600'
                                    }`}
                                  >
                                    {m === 'USD' ? '$ USD' : 'Bs. VES'}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Selector de tasa (solo si VES está activo) */}
                          {isVES && (
                            <div className="grid grid-cols-2 gap-2">
                              {[
                                { label: 'Tasa BCV', val: exchangeRateBCV, sub: 'Oficial' },
                                { label: 'Tasa Interna', val: exchangeRateInternal, sub: 'Mercado' }
                              ].map((t) => {
                                const isSelected = Math.abs(cxpRate - t.val) < 0.01;
                                return (
                                  <button
                                    key={t.label}
                                    type="button"
                                    onClick={() => {
                                      // Al cambiar de tasa, el monto en Bs NO cambia (es el mismo vale)
                                      // Solo cambia la tasa en la nota → cambia el descuento en AP
                                      // Bs fijo = totalVES. Si ya hay un Bs en el campo, lo respetamos.
                                      // Pero si venimos de USD, usar totalVES
                                      const currentBs = isVES ? amountRaw : totalVES;
                                      setPayAmount(currentBs.toFixed(2));
                                      setPayNote(`RECONCILIACION CXP (TASA: ${t.val.toFixed(2)})`);
                                      setPayAmountTouched(true);
                                    }}
                                    className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                                      isSelected
                                        ? 'bg-white border-indigo-500 shadow-md ring-2 ring-indigo-200'
                                        : 'bg-transparent border-slate-100 hover:border-slate-300'
                                    }`}
                                  >
                                    <span className="text-[9px] font-bold text-slate-400 uppercase">{t.sub}</span>
                                    <span className="text-[13px] font-black text-indigo-900">{t.val.toFixed(2)}</span>
                                    <span className="text-[9px] text-slate-500">{t.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          {/* Resumen del descuento real en AP */}
                          <div className="bg-white rounded-xl p-3 border border-indigo-100 space-y-1">
                            {isVES && (
                              <div className="flex justify-between text-[10px]">
                                <span className="text-slate-400">Monto en Bs:</span>
                                <span className="font-bold text-slate-700">
                                  {amountRaw.toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-[10px]">
                              <span className="text-slate-400">Tasa aplicada:</span>
                              <span className="font-bold text-slate-700">
                                {isVES ? `${cxpRate.toFixed(2)} Bs/$` : '1:1 (directo en $)'}
                              </span>
                            </div>
                            <div className="flex justify-between text-[11px] pt-1 border-t border-indigo-50">
                              <span className="font-black text-slate-600">Descuento en AP (USD):</span>
                              <span className="font-black text-indigo-600">
                                - $ {apDiscountUSD.toFixed(3)}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {currentPayMethod === 'others' && activeClient && dataService.getAPBalanceBySupplier(activeClient.name) > 0 && (
                   <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl p-2 flex items-center gap-2">
                      <div className="bg-amber-400 p-1 rounded-lg">
                         <AlertCircle className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-[9px] font-black text-amber-800 uppercase tracking-tight">
                         Sugerencia: Este cliente posee una cuenta por pagar de ${dataService.getAPBalanceBySupplier(activeClient.name).toFixed(2)} disponible para compensación.
                      </div>
                   </div>
                )}

                {currentPayMethod === 'others' && (
                  <div className="mt-2">
                    <textarea
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Observación / acotación del pago..."
                      className="w-full bg-white border-2 border-slate-200 rounded-2xl px-3 py-2 text-[10px] font-bold outline-none focus:border-emerald-500 min-h-[40px]"
                    />
                  </div>
                )}

                {(currentPayMethod !== 'cash_usd' && currentPayMethod !== 'cash_ves' && currentPayMethod !== 'credit') && (
                  <div className="mt-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400">Soporte / Comprobante</label>
                    <div
                      tabIndex={0}
                      onPaste={handlePaySupportPaste}
                      className="w-full mt-1 bg-white border border-dashed border-slate-300 rounded-xl px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20"
                      title="Haga click aquí y pegue (Ctrl+V) la imagen copiada desde WhatsApp Web"
                    >
                      Pegue aquí el comprobante (Ctrl+V)
                      <div className="text-[8px] font-bold normal-case tracking-normal text-slate-400 mt-1">
                        También puede seleccionar archivos abajo.
                      </div>
                    </div>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={(e) => setPayFiles(Array.from(e.target.files || []))}
                      className="w-full mt-1 text-[10px] font-bold"
                    />
                    {payFiles.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        <div className="text-[9px] text-slate-500 font-bold">
                          {payFiles.length} archivo(s) seleccionado(s)
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          {payFiles.map((f, idx) => {
                            const isImg = f.type.startsWith('image/');
                            const url = isImg ? URL.createObjectURL(f) : '';
                            return (
                              <div key={`${f.name}-${idx}`} className="relative border rounded-lg overflow-hidden bg-slate-50">
                                {isImg ? (
                                  <img src={url} alt={f.name} className="w-full h-14 object-cover" onLoad={() => URL.revokeObjectURL(url)} />
                                ) : (
                                  <div className="h-14 flex items-center justify-center text-[8px] font-black text-slate-400 uppercase">PDF</div>
                                )}
                                <div className="p-1 text-[8px] font-bold text-slate-500 truncate" title={f.name}>{f.name}</div>
                                <button type="button" onClick={() => removePayFile(idx)} className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded p-1" title="Quitar">
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {currentPayMethod === 'credit' && (
                  <div className="mt-2 space-y-2">
                    {/* Toggle de moneda del crédito */}
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black text-indigo-700 uppercase tracking-widest">Moneda del Crédito</span>
                        <div className="flex items-center gap-1 bg-white border border-indigo-200 rounded-lg p-0.5">
                          <button
                            type="button"
                            onClick={() => setCreditCurrency('USD')}
                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${creditCurrency === 'USD' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-400 hover:text-emerald-600'}`}
                          >
                            $ USD
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreditCurrency('VES')}
                            className={`px-3 py-1 rounded-md text-[9px] font-black transition-all ${creditCurrency === 'VES' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-400 hover:text-blue-600'}`}
                          >
                            Bs. VES
                          </button>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-2.5 border border-indigo-100 space-y-1">
                        {creditCurrency === 'USD' ? (
                          <>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-400 font-bold">Precio nominal:</span>
                              <span className="font-black text-emerald-700">${totalUSDNominal.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-400 font-bold">Tasa referencia (BCV):</span>
                              <span className="font-black text-slate-600">{exchangeRateBCV.toFixed(2)} Bs/$</span>
                            </div>
                            <p className="text-[8px] text-slate-400 italic">El cliente pagará en USD al precio sin inflación.</p>
                          </>
                        ) : (
                          <>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-400 font-bold">Precio internalizado:</span>
                              <span className="font-black text-blue-700">${remainingUSD.toFixed(3)}</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-400 font-bold">Equivalente Bs (tasa interna):</span>
                              <span className="font-black text-blue-700">Bs. {(remainingUSD * internalRateNumber).toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-slate-400 font-bold">Tasa interna:</span>
                              <span className="font-black text-slate-600">{internalRateNumber.toFixed(2)} Bs/$</span>
                            </div>
                            <p className="text-[8px] text-slate-400 italic">El cliente pagará en Bs al precio protegido (inflado).</p>
                          </>
                        )}
                      </div>
                    </div>

                    <textarea
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder="Observación del crédito (plazo, acuerdo, condiciones, etc.)"
                      className="w-full bg-white border-2 border-slate-200 rounded-2xl px-3 py-2 text-[10px] font-bold outline-none focus:border-emerald-500 min-h-[40px]"
                    />

                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-2.5">
                      <div className="flex items-center justify-between">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-500">Abono inmediato (opcional)</div>
                        <label className="flex items-center gap-2 text-[9px] font-black text-slate-700">
                          <input
                            type="checkbox"
                            checked={creditDownEnabled}
                            onChange={(e) => setCreditDownEnabled(e.target.checked)}
                          />
                          Activar
                        </label>
                      </div>

                      {creditDownEnabled && (
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Moneda</label>
                              <select
                                value={creditDownCurrency}
                                onChange={(e) => setCreditDownCurrency(e.target.value as any)}
                                className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-black uppercase outline-none"
                              >
                                <option value="USD">USD</option>
                                <option value="VES">BS</option>
                              </select>
                            </div>

                            {creditDownCurrency === 'USD' ? (
                              <div>
                                <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Monto (USD)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={creditDownAmountUSD}
                                  onChange={(e) => setCreditDownAmountUSD(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black outline-none"
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Monto (Bs)</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={creditDownAmountVES}
                                  onChange={(e) => setCreditDownAmountVES(e.target.value)}
                                  placeholder="0.00"
                                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black outline-none"
                                />
                              </div>
                            )}
                          </div>

                          {creditDownCurrency === 'VES' && (
                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Tasa (Bs por USD)</label>
                              <input
                                type="number"
                                step="0.01"
                                value={creditDownRateUsed}
                                onChange={(e) => setCreditDownRateUsed(e.target.value)}
                                className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[10px] font-black outline-none"
                              />
                            </div>
                          )}

                          <div>
                            <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Método del abono</label>
                            <select
                              value={creditDownMethod}
                              onChange={(e) => setCreditDownMethod(e.target.value as any)}
                              className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-black uppercase outline-none"
                            >
                              <option value="transfer">Transferencia</option>
                              <option value="mobile">Pago Móvil</option>
                              <option value="debit">Débito</option>
                              <option value="biopago">Biopago</option>
                              <option value="zelle">Zelle</option>
                              <option value="digital_usd">Digital USD</option>
                              <option value="cash_usd">Efectivo USD</option>
                              <option value="cash_ves">Efectivo Bs</option>
                              <option value="others">Otros</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Banco</label>
                              {(arBanksByMethod[creditDownMethod] ?? []).length > 0 ? (
                                <select
                                  value={creditDownBank}
                                  onChange={(e) => setCreditDownBank(e.target.value)}
                                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-black uppercase outline-none"
                                >
                                  {(arBanksByMethod[creditDownMethod] ?? []).map((b) => (
                                    <option key={b} value={b}>{b}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="text"
                                  value={creditDownBank}
                                  onChange={(e) => setCreditDownBank(e.target.value)}
                                  className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-bold uppercase outline-none"
                                  placeholder="No aplica"
                                  disabled
                                />
                              )}
                            </div>

                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Referencia</label>
                              <input
                                type="text"
                                value={creditDownRef}
                                onChange={(e) => setCreditDownRef(e.target.value)}
                                className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-bold outline-none"
                                placeholder="Ej. #123456"
                              />
                            </div>
                          </div>

                          {(creditDownMethod === 'debit' || creditDownMethod === 'biopago') && (
                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Terminal POS</label>
                              <select
                                value={creditDownPOSTerminalId}
                                onChange={(e) => setCreditDownPOSTerminalId(e.target.value)}
                                className="w-full mt-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-[9px] font-black uppercase outline-none"
                              >
                                <option value="">Seleccione una terminal</option>
                                {creditDownPOSTerminalOptions.map((t: any) => (
                                  <option key={t.id} value={t.id}>{t.name} • {t.accountLabel}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          <div className="text-[9px] font-bold text-slate-500">
                            Abono: $ {creditDownPaymentUSD.toFixed(2)} | Queda a crédito: $ {Math.max(0, (remainingUSD - creditDownPaymentUSD)).toFixed(2)}
                          </div>

                          {(creditDownMethod !== 'cash_usd' && creditDownMethod !== 'cash_ves') && (
                            <div>
                              <label className="text-[7px] font-black uppercase tracking-widest text-slate-400">Soporte / Comprobante</label>
                              <div
                                tabIndex={0}
                                onPaste={handleCreditDownSupportPaste}
                                className="w-full mt-1 bg-white border border-dashed border-slate-300 rounded-xl px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20"
                                title="Haga click aquí y pegue (Ctrl+V) la imagen copiada desde WhatsApp Web"
                              >
                                Pegue aquí el comprobante (Ctrl+V)
                                <div className="text-[8px] font-bold normal-case tracking-normal text-slate-400 mt-1">
                                  También puede seleccionar archivos abajo.
                                </div>
                              </div>
                              <input
                                type="file"
                                multiple
                                accept="image/*,application/pdf"
                                onChange={(e) => setCreditDownFiles(Array.from(e.target.files || []))}
                                className="w-full mt-1 text-[10px] font-bold"
                              />
                              {creditDownFiles.length > 0 && (
                                <div className="mt-2 space-y-1.5">
                                  <div className="text-[9px] text-slate-500 font-bold">
                                    {creditDownFiles.length} archivo(s) seleccionado(s)
                                  </div>
                                  <div className="grid grid-cols-3 gap-2">
                                    {creditDownFiles.map((f, idx) => {
                                      const isImg = f.type.startsWith('image/');
                                      const url = isImg ? URL.createObjectURL(f) : '';
                                      return (
                                        <div key={`${f.name}-${idx}`} className="relative border rounded-lg overflow-hidden bg-slate-50">
                                          {isImg ? (
                                            <img src={url} alt={f.name} className="w-full h-14 object-cover" onLoad={() => URL.revokeObjectURL(url)} />
                                          ) : (
                                            <div className="h-14 flex items-center justify-center text-[8px] font-black text-slate-400 uppercase">PDF</div>
                                          )}
                                          <div className="p-1 text-[8px] font-bold text-slate-500 truncate" title={f.name}>{f.name}</div>
                                          <button type="button" onClick={() => removeCreditDownFile(idx)} className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded p-1" title="Quitar">
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="min-w-0 flex flex-col gap-1.5 md:w-[12rem] lg:w-[14rem] xl:w-[15.5rem] 2xl:w-[17rem]">
           {/* Panel de Descuento Global */}
           <div className="rounded-2xl bg-gradient-to-br from-violet-800 to-violet-900 p-2.5 shadow-lg">
             <div className="flex items-center justify-between mb-2">
               <div className="text-[9px] font-black uppercase tracking-wider text-violet-300/80">Descuento Global</div>
               {globalDiscount && globalDiscount.value > 0 && (
                 <button 
                   onClick={() => updateCurrentSession({ globalDiscount: undefined })}
                   className="text-[8px] text-violet-300 hover:text-white underline"
                 >
                   Quitar
                 </button>
               )}
             </div>
             <div className="flex gap-2 mb-2">
               <select
                 value={globalDiscount?.type || 'percent'}
                 onChange={(e) => {
                   const type = e.target.value as 'percent' | 'fixed';
                   const currentValue = globalDiscount?.value || 0;
                   updateCurrentSession({ globalDiscount: { type, value: currentValue } });
                 }}
                 className="bg-violet-950/50 border border-violet-700 rounded-lg px-2 py-1 text-[9px] font-black text-white outline-none focus:border-violet-400"
              >
                 <option value="percent">% Porcentaje</option>
                 <option value="fixed">$ Monto fijo</option>
               </select>
               <input
                 type="number"
                 min="0"
                 max={globalDiscount?.type === 'percent' ? 100 : subtotalUSD}
                 step={globalDiscount?.type === 'percent' ? 1 : 0.01}
                 value={globalDiscount?.value || ''}
                 onChange={(e) => {
                   const val = parseFloat(e.target.value) || 0;
                   const type = globalDiscount?.type || 'percent';
                   updateCurrentSession({ globalDiscount: { type, value: val } });
                 }}
                 placeholder={globalDiscount?.type === 'percent' ? '0%' : '$0.00'}
                 className="flex-1 bg-violet-950/50 border border-violet-700 rounded-lg px-2 py-1 text-[10px] font-black text-white outline-none focus:border-violet-400 text-right"
               />
             </div>
             {globalDiscount && globalDiscount.value > 0 && (
               <div className="flex justify-between text-[9px] text-violet-200/80">
                 <span>Subtotal: ${subtotalUSD.toFixed(2)}</span>
                 <span className="font-black text-emerald-300">-{discountAmountUSD.toFixed(2)}</span>
               </div>
             )}
           </div>

           {/* Panel de Notas/Observaciones de la Factura */}
           <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-800 p-2.5 shadow-lg">
             <div className="flex items-center justify-between mb-2">
               <div className="text-[9px] font-black uppercase tracking-wider text-slate-300/80">Nota / Observación</div>
               {currentSession.saleNotes && (
                 <button 
                   onClick={() => updateCurrentSession({ saleNotes: '' })}
                   className="text-[8px] text-slate-400 hover:text-white underline"
                 >
                   Limpiar
                 </button>
               )}
             </div>
             <textarea
               value={currentSession.saleNotes || ''}
               onChange={(e) => updateCurrentSession({ saleNotes: e.target.value })}
               placeholder="Ej: Cliente pagará diferencia mañana, Precio especial autorizado por gerencia, etc."
               rows={2}
               maxLength={250}
               className="w-full bg-slate-950/50 border border-slate-600 rounded-lg px-2 py-1.5 text-[9px] font-bold text-white outline-none focus:border-slate-400 resize-none placeholder:text-slate-500"
             />
             <div className="flex justify-between text-[7px] text-slate-500 mt-1">
               <span>Máx. 250 caracteres</span>
               <span>{(currentSession.saleNotes || '').length}/250</span>
             </div>
           </div>

           <div className="rounded-2xl bg-gradient-to-br from-teal-800 to-teal-900 p-3 shadow-lg">
             <div className="flex items-start justify-between gap-3">
               <div>
                 <div className="text-[9px] font-black uppercase tracking-wider text-teal-300/80">Total (Int. Bs)</div>
                 <div className="mt-1 text-[20px] md:text-[22px] lg:text-[24px] xl:text-[26px] font-black font-mono text-white leading-none tracking-tight">Bs. {totalVESInternal.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                 <div className="text-[7px] font-bold uppercase tracking-wide text-teal-400/60 mt-1">Ajuste operativo aplicado</div>
               </div>
               <div className="text-right">
                 <div className="text-[9px] font-black uppercase tracking-wider text-teal-300/80">Total $</div>
                 <div className="mt-1 text-[16px] md:text-[18px] lg:text-[19px] xl:text-[20px] font-black font-mono text-white/95 leading-none">$ {totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 4 })}</div>
                 <div className="text-[7px] font-bold uppercase tracking-wide text-teal-400/60 mt-1">BCV: {exchangeRateBCV.toLocaleString('es-VE')}</div>
               </div>
             </div>
           </div>

          {/* Selection / Hover Detail Dashboard */}
          <div className={`transition-all duration-300 ${(currentSession.selectedIds.length > 0 || hoveredItem) ? 'h-auto opacity-100 translate-y-0 scale-100' : 'h-0 opacity-0 -translate-y-2 scale-95 pointer-events-none'}`}>
            {currentSession.selectedIds.length > 0 ? (
              <div className="bg-white border border-emerald-200 rounded-2xl p-2.5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5"><CheckCircle2 className="w-12 h-12 text-emerald-700" /></div>
                <div className="flex justify-between items-center mb-1.5 border-b border-slate-100 pb-1.5">
                  <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-500">Selección</span>
                  <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[8px] font-black">{currentSession.selectedIds.length} items</span>
                </div>
                {(() => {
                  const selItems = currentSession.items.filter(it => currentSession.selectedIds.includes(it.id));
                  const subUSD = selItems.reduce((a, b) => a + (b.priceUSD * b.qty), 0);
                  return (
                    <div className="grid grid-cols-3 gap-2">
                       <div className="bg-blue-50 p-2 rounded-xl border border-blue-200">
                          <span className="text-[7px] font-black text-blue-600 uppercase leading-none block mb-1">Total Físico ($)</span>
                          <span className="text-[12px] font-mono font-black text-blue-800 font-headline">${subUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                       </div>
                       <div className="bg-slate-50 p-2 rounded-xl border border-slate-200">
                          <span className="text-[7px] font-black text-slate-400 uppercase leading-none block mb-1">Total $</span>
                          <span className="text-[12px] font-mono font-black text-slate-900 font-headline">${((subUSD * internalRateNumber) / exchangeRateBCV).toLocaleString('es-VE', { minimumFractionDigits: 4 })}</span>
                       </div>
                       <div className="bg-emerald-50 p-2 rounded-xl border border-emerald-100 text-right">
                          <span className="text-[7px] font-black text-emerald-700 uppercase leading-none block mb-1">Total Bs</span>
                          <span className="text-[12px] font-mono font-black text-emerald-800 font-headline">{(subUSD * internalRateNumber).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                       </div>
                    </div>
                  );
                })()}
              </div>
            ) : hoveredItem ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-2 opacity-5"><Hash className="w-12 h-12" /></div>
                <p className="text-[8px] font-black text-slate-800 uppercase truncate mb-1.5 pr-6 border-b pb-1 border-slate-100">{hoveredItem.description}</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-50 p-2 rounded-xl border">
                    <span className="text-[7px] font-black text-slate-400 uppercase leading-none block mb-0.5">Precio Unit ($)</span>
                    <span className="text-[11px] font-mono font-black text-emerald-700 font-headline">${hoveredItem.priceUSD.toLocaleString('es-VE', { minimumFractionDigits: 3 })}</span>
                    <span className="text-[6px] text-slate-300 font-bold block">POR {hoveredItem.unit}</span>
                  </div>
                  <div className="bg-amber-50 p-2 rounded-xl border border-amber-100 text-right">
                    <span className="text-[7px] font-black text-amber-600 uppercase leading-none block mb-0.5">Importe Int. (Bs)</span>
                    <span className="text-[11px] font-mono font-black text-amber-700 font-headline">{(hoveredItem.priceUSD * hoveredItem.qty * internalRateNumber).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    <span className="text-[6px] text-amber-300 font-bold block">CANT: {formatQuantity(hoveredItem.qty)}</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Botón de historial de ventas */}
          <button
            onClick={() => setShowSalesHistoryPanel(true)}
            className="w-full py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-wider text-slate-600 transition-all flex items-center justify-center gap-2"
          >
            <Receipt className="w-4 h-4" />
            Historial de Ventas {recentSales.length > 0 && `(${recentSales.length})`}
          </button>

          <div className="flex-1 min-h-0 overflow-auto bg-white rounded-2xl border border-slate-200 p-2.5 space-y-1.5 shadow-sm">
            <p className="text-[7px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 px-1">Historial del Cobro</p>
            {currentSession.payments.length === 0 ? (
              <div className="py-5 text-center opacity-20"><CreditCard className="w-7 h-7 mx-auto opacity-20 mb-2" /><span className="text-[7px] font-black uppercase">A l'attente du paiement</span></div>
            ) : (
              currentSession.payments.map(p => (
                <div key={p.id} className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex justify-between items-center group animate-in slide-in-from-right-2">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-800 uppercase leading-none mb-0.5">{p.method.replace('cash_', 'EFE ')}</span>
                    <span className="text-[7px] font-black text-slate-300 uppercase font-mono">{p.reference || p.bank || ''}</span>
                    {p.note && (
                      <span className="text-[8px] font-bold text-slate-500 leading-tight">{p.note}</span>
                    )}
                    {Array.isArray(p.files) && p.files.length > 0 && (
                      <span className="text-[7px] font-black text-emerald-600 uppercase">{p.files.length} soporte(s)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Mostrar en la moneda del método: Bs para métodos VES, $ para USD */}
                    {(() => {
                      const isDxV = p.method === 'others' && String(p.bank ?? '').toUpperCase() === 'DXV';
                      const isDxVVES = isDxV && ((p.note ?? '').includes('VES') || (p.amountVES || 0) > 0.5);
                      const isVESMethod = p.method === 'cash_ves' || p.method === 'mobile' || p.method === 'transfer' || p.method === 'debit' || p.method === 'biopago' || (p.method === 'others' && (p.note ?? '').includes('TASA:'));
                      if (isVESMethod) {
                        return <span className="text-[11px] font-black text-blue-700 font-mono">Bs. {(p.amountVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>;
                      } else if (isDxVVES) {
                        return <span className="text-[11px] font-black text-violet-700 font-mono">- Bs. {(p.amountVES || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>;
                      } else if (isDxV) {
                        return <span className="text-[11px] font-black text-violet-700 font-mono">- ${(p.amountUSD || 0).toLocaleString('es-VE', { minimumFractionDigits: 3 })}</span>;
                      } else {
                        return <span className="text-[11px] font-black text-emerald-700 font-mono">${(p.amountUSD || 0).toLocaleString('es-VE', { minimumFractionDigits: 3 })}</span>;
                      }
                    })()}
                    <button onClick={() => removePayment(p.id)} className="text-slate-200 hover:text-red-500 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Panel de vuelto — aparece cuando el cliente paga de más */}
          {(overpaymentUSD > 0.005 || overpaymentVES > 0.5) && (() => {
            // Determinar si el vuelto es en USD o Bs según el método elegido
            const changeIsVES = changeMethod === 'cash_ves' || changeMethod === 'mobile' || changeMethod === 'transfer';
            const changeIsUSD = changeMethod === 'cash_usd' || changeMethod === 'zelle';
            const rateForChange = parseFloat(changeCustomRate) || exchangeRateBCV;

            // Overpayment base: en la moneda del pago recibido
            const baseOverUSD = overpaymentUSD;
            const baseOverVES = overpaymentVES;

            // Calcular el monto del vuelto en la moneda del método elegido
            let changeAmountDisplay = '';
            let changeAmountAlt = '';
            if (baseOverUSD > 0.005) {
              // El pago fue en USD → convertir si el vuelto es en Bs
              if (changeIsVES) {
                const inVES = roundMoney(baseOverUSD * rateForChange);
                changeAmountDisplay = `Bs. ${inVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
                changeAmountAlt = `($${baseOverUSD.toFixed(2)} × ${rateForChange.toFixed(2)})`;
              } else {
                changeAmountDisplay = `$ ${baseOverUSD.toFixed(2)}`;
                changeAmountAlt = '';
              }
            } else {
              // El pago fue en Bs → convertir si el vuelto es en USD
              if (changeIsUSD) {
                const inUSD = rateForChange > 0 ? roundFX(baseOverVES / rateForChange) : 0;
                changeAmountDisplay = `$ ${inUSD.toFixed(2)}`;
                changeAmountAlt = `(Bs.${baseOverVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })} ÷ ${rateForChange.toFixed(2)})`;
              } else {
                changeAmountDisplay = `Bs. ${baseOverVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
                changeAmountAlt = '';
              }
            }

            // ¿Requiere tasa de conversión? Sólo si las monedas difieren
            const needsRate = (baseOverUSD > 0.005 && changeIsVES) || (baseOverVES > 0.5 && changeIsUSD);
            const needsBank = changeMethod === 'mobile' || changeMethod === 'transfer' || changeMethod === 'zelle';

            return (
              <div className={`rounded-2xl border-2 overflow-hidden transition-all ${
                changeAsAdvance ? 'border-indigo-400 bg-indigo-50' : changeDeclared ? 'border-emerald-400 bg-emerald-50' : 'border-amber-400 bg-amber-50'
              }`}>
                {/* Cabecera */}
                <div className="px-3 py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base">↩️</span>
                    <div>
                      <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest">
                        {changeAsAdvance ? '✓ Anticipo confirmado' : changeDeclared ? '✓ Vuelto declarado' : 'Debe dar vuelto'}
                      </p>
                      <p className="text-[13px] font-black font-mono text-amber-900 leading-tight">
                        {changeAmountDisplay}
                      </p>
                      {changeAmountAlt && (
                        <p className="text-[8px] font-bold text-amber-500 font-mono">{changeAmountAlt}</p>
                      )}
                    </div>
                  </div>
                  {(changeDeclared || changeAsAdvance) && (
                    <div className="text-right">
                      {changeAsAdvance
                        ? <p className="text-[8px] font-black text-amber-700 uppercase">Quedará como anticipo</p>
                        : <p className="text-[8px] font-black text-emerald-700 uppercase">{changeMethod.replace('_', ' ')}{changeBank ? ` · ${changeBank}` : ''}</p>
                      }
                      <button onClick={() => { setChangeDeclared(false); setChangeAsAdvance(false); }} className="text-[8px] font-black text-slate-400 hover:text-amber-600 hover:underline">Editar</button>
                    </div>
                  )}
                </div>

                {/* Formulario de selección */}
                {!changeDeclared && !changeAsAdvance && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-amber-200 pt-2.5">
                    <p className="text-[8px] font-black text-amber-700 uppercase tracking-widest">¿Cómo entrega el vuelto?</p>

                    {/* Métodos */}
                    <div className="flex flex-wrap gap-1.5">
                      {([
                        { id: 'cash_ves', label: 'Efec Bs' },
                        { id: 'cash_usd', label: 'Efec $' },
                        { id: 'mobile',   label: 'P. Móvil' },
                        { id: 'transfer', label: 'Transfer.' },
                        { id: 'zelle',    label: 'Zelle' },
                      ] as const).map(m => (
                        <button key={m.id} type="button"
                          onClick={() => { setChangeMethod(m.id); setChangeDeclared(false); }}
                          className={`px-3 py-1.5 rounded-xl text-[9px] font-black transition-all ${
                            changeMethod === m.id
                              ? 'bg-amber-700 text-white shadow'
                              : 'bg-white border border-amber-300 text-amber-700 hover:bg-amber-100'
                          }`}
                        >{m.label}</button>
                      ))}
                    </div>

                    {/* Tasa de conversión — solo si monedas difieren */}
                    {needsRate && (
                      <div>
                        <label className="text-[7px] font-black text-amber-600 uppercase tracking-widest block mb-1">
                          Tasa {baseOverUSD > 0.005 ? 'USD→Bs' : 'Bs→USD'} (BCV por defecto)
                        </label>
                        <input
                          type="number" step="0.01"
                          value={changeCustomRate}
                          onChange={e => setChangeCustomRate(e.target.value)}
                          placeholder={exchangeRateBCV.toFixed(2)}
                          className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-[10px] font-black text-amber-900 text-center outline-none focus:border-amber-500"
                        />
                        <p className="text-[7px] text-amber-500 mt-0.5 text-center">
                          Tasa BCV: {exchangeRateBCV.toFixed(2)} · Interna: {exchangeRateInternal.toFixed(2)}
                        </p>
                      </div>
                    )}

                    {/* Banco destino — para Pago Móvil / Transferencia / Zelle */}
                    {needsBank && (
                      <input
                        type="text"
                        value={changeBank}
                        onChange={e => setChangeBank(e.target.value)}
                        placeholder={changeMethod === 'zelle' ? 'Correo / teléfono Zelle' : 'Banco destino (ej: BANESCO)'}
                        className="w-full bg-white border border-amber-300 rounded-xl px-3 py-1.5 text-[9px] font-black uppercase outline-none focus:border-amber-500"
                      />
                    )}

                    {/* Panel de denominaciones del vuelto — solo para efectivo */}
                    {(changeMethod === 'cash_usd' || changeMethod === 'cash_ves') && (() => {
                      const isChUSD = changeMethod === 'cash_usd';
                      const denoms = isChUSD ? DENOMS_USD : DENOMS_VES;
                      const activeDenoms = isChUSD ? changeDenomsUSD : changeDenomsVES;
                      const denomsTotal = isChUSD ? changeDenomsTotalUSD : changeDenomsTotalVES;
                      const sym = isChUSD ? '$' : 'Bs';
                      const fmt = (v: number) => isChUSD ? `${sym} ${v.toFixed(2)}` : `${sym} ${v.toLocaleString('es-VE',{minimumFractionDigits:2})}`;
                      return (
                        <div className="bg-white rounded-xl px-3 py-2 border border-amber-200 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[8px] font-black text-slate-500 uppercase">Denominaciones entregadas</span>
                            {denomsTotal > 0 && (
                              <span className="text-[10px] font-black text-amber-700 font-mono">{fmt(denomsTotal)}</span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {denoms.filter(d => !activeDenoms.find(b => b.denom === d)).map(d => (
                              <button key={d} type="button"
                                onClick={() => isChUSD ? addChangeDenomUSD(d) : addChangeDenomVES(d)}
                                className="text-[9px] font-black text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 hover:bg-amber-100 transition-all"
                              >
                                − {sym}{d}
                              </button>
                            ))}
                          </div>
                          {activeDenoms.length > 0 && (
                            <div className="space-y-1.5">
                              {[...activeDenoms].sort((a, b) => b.denom - a.denom).map(({ denom, qty }) => (
                                <div key={denom} className="flex items-center gap-2">
                                  <span className="w-14 text-[10px] font-black text-amber-600 text-right">{sym}{denom}</span>
                                  <span className="text-slate-300 text-xs">×</span>
                                  <input type="number" min="0" max="9999" value={qty || ''}
                                    onChange={e => isChUSD ? updChangeDenomUSD(denom, Number(e.target.value)||0) : updChangeDenomVES(denom, Number(e.target.value)||0)}
                                    placeholder="0"
                                    className="w-14 bg-white border border-amber-200 rounded-lg px-2 py-1 text-xs font-black text-amber-700 text-center outline-none focus:border-amber-400"
                                  />
                                  <span className="text-slate-300 text-xs">=</span>
                                  <span className="text-[10px] font-black text-amber-700 font-mono flex-1">{fmt(denom * qty)}</span>
                                  <button type="button"
                                    onClick={() => isChUSD ? remChangeDenomUSD(denom) : remChangeDenomVES(denom)}
                                    className="p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    {/* Resumen del vuelto calculado */}
                    {(() => {
                      const expectedChangeAmount = baseOverUSD > 0.005
                        ? (changeIsVES
                          ? roundMoney(baseOverUSD * rateForChange)
                          : roundFX(baseOverUSD))
                        : (changeIsUSD
                          ? (rateForChange > 0 ? roundFX(baseOverVES / rateForChange) : 0)
                          : roundMoney(baseOverVES));
                      const deliveredByDenoms = changeMethod === 'cash_usd' ? changeDenomsTotalUSD : changeDenomsTotalVES;
                      const overrideFloat = parseFloat(changeGivenOverride);
                      const deliveredChangeAmount = !isNaN(overrideFloat) && overrideFloat >= 0
                        ? overrideFloat
                        : ((changeMethod === 'cash_usd' ? changeDenomsUSD : changeDenomsVES).length > 0 ? deliveredByDenoms : 0);
                      const pendingChangeAmount = Math.max(0, expectedChangeAmount - deliveredChangeAmount);
                      const excessChangeAmount = Math.max(0, deliveredChangeAmount - expectedChangeAmount);
                      const sym = changeMethod === 'cash_usd' ? '$' : 'Bs';
                      const fmt = (v: number) => changeMethod === 'cash_usd'
                        ? `${sym} ${v.toFixed(2)}`
                        : `${sym} ${v.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;

                      return (
                        <div className="bg-white rounded-xl px-3 py-2 border border-amber-200 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-[8px] font-black text-slate-500 uppercase">Vuelto total</span>
                            <span className="text-sm font-black font-mono text-amber-800">{fmt(expectedChangeAmount)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div className="rounded-lg bg-slate-50 border border-slate-200 py-1.5">
                              <p className="text-[8px] font-black text-slate-500 uppercase">Entregado</p>
                              <p className="text-[10px] font-black font-mono text-slate-800">{fmt(deliveredChangeAmount)}</p>
                            </div>
                            <div className={`rounded-lg border py-1.5 ${
                              pendingChangeAmount > 0.005 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'
                            }`}>
                              <p className={`text-[8px] font-black uppercase ${
                                pendingChangeAmount > 0.005 ? 'text-red-600' : 'text-emerald-600'
                              }`}>Pendiente</p>
                              <p className={`text-[10px] font-black font-mono ${
                                pendingChangeAmount > 0.005 ? 'text-red-700' : 'text-emerald-700'
                              }`}>{fmt(pendingChangeAmount)}</p>
                            </div>
                            <div className={`rounded-lg border py-1.5 ${
                              excessChangeAmount > 0.005 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
                            }`}>
                              <p className={`text-[8px] font-black uppercase ${
                                excessChangeAmount > 0.005 ? 'text-amber-700' : 'text-slate-500'
                              }`}>Exceso</p>
                              <p className={`text-[10px] font-black font-mono ${
                                excessChangeAmount > 0.005 ? 'text-amber-800' : 'text-slate-700'
                              }`}>{fmt(excessChangeAmount)}</p>
                            </div>
                          </div>
                          {excessChangeAmount > 0.005 && (
                            <div className="text-[9px] font-black text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                              ⚠ Exceso de vuelto por denominación no exacta: {fmt(excessChangeAmount)} (favor cliente).
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() => setChangeDeclared(true)}
                      className="w-full py-2 rounded-xl bg-amber-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-amber-700 active:scale-95 transition-all"
                    >
                      Confirmar vuelto · {changeAmountDisplay}
                    </button>

                    {currentSession.client && (
                      <button
                        type="button"
                        onClick={() => setChangeAsAdvance(true)}
                        className="w-full py-2 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all"
                      >
                        Dejar como anticipo · {changeAmountDisplay}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {(() => {
            const hasOver = overpaymentUSD > 0.005 || overpaymentVES > 0.5;
            const paid = currentSession.payments.length > 0;
            const allPaidVES = paid && currentSession.payments.every(p => p.method === 'cash_ves' || p.method === 'mobile' || p.method === 'transfer' || p.method === 'debit' || p.method === 'biopago');
            // BILL-FIX-02: Si hay pago a CRÉDITO, no bloquear por faltante - el crédito cubre el monto pendiente
            const hasCreditPayment = currentSession.payments.some(p => p.method === 'credit');
            // Cuando hay overpayment declarado → habilitado. Si no hay overpayment → verificar remaining normal
            // Pero si hay crédito, siempre permitir (el crédito va a Cuentas por Cobrar)
            const missingBlock = !hasOver && !hasCreditPayment && (allPaidVES ? effectiveRemainingVES > 0.5 : effectiveRemainingUSD > 0.05);
            const overBlock = hasOver && !changeDeclared && !changeAsAdvance;
            const btnDisabled = isProcessing || currentSession.items.length === 0 || !currentSession.client || missingBlock || overBlock || !hasCashBoxOpen;
            return (
          <button
            disabled={btnDisabled}
            onClick={() => setShowProcessConfirm(true)}
            className={`w-full rounded-2xl py-2.5 text-[10px] font-black uppercase tracking-[0.16em] transition-all flex flex-col items-center justify-center gap-0.5 shadow-sm active:scale-95 ${btnDisabled ? 'bg-slate-100 text-slate-300' : 'bg-emerald-700 text-white hover:bg-emerald-800'}`}
          >
            {isProcessing ? 'SISTEMA PROCESANDO...' : (
              <>
                <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Finalizar venta</span>
                <span className="text-[7px] opacity-70 font-bold tracking-normal">Presione F10</span>
              </>
            )}
          </button>
            );
          })()}
        </div>
      </div>

      {showClientModal && <ClientModal onAdd={(c) => { updateCurrentSession({ client: c, searchClientId: c.id, label: c.name.split(' ')[0] }); setShowClientModal(false); }} onCancel={() => setShowClientModal(false)} />}
      {showItemModal && (
        <ItemSearchModal
          initialQuery={initialSearch}
          initialQty={pendingQty}
          notice={searchNotice}
          onAdd={addItem}
          onCancel={() => { setShowItemModal(false); setSearchNotice(null); }}
        />
      )}
      {showCalculator && <CalculatorModal onClose={() => setShowCalculator(false)} />}

      {showARModal && activeClient && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Cuentas x Cobrar (AR)</div>
                <div className="text-[13px] font-black uppercase text-slate-900 truncate">{activeClient.name} · {activeClient.id}</div>
              </div>
              <button
                type="button"
                onClick={() => setShowARModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                title="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
                <div className="flex gap-2 items-center flex-wrap">
                  <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-red-600 text-white ring-1 ring-red-300">
                    Pendiente: $ {clientAccountStatus.debtUSD.toFixed(2)}
                  </span>
                  {clientAccountStatus.overdueCount > 0 && (
                    <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-red-700 text-white ring-1 ring-red-300 animate-pulse">
                      Vencidas: {clientAccountStatus.overdueCount}
                    </span>
                  )}
                  {clientAccountStatus.dueSoonCount > 0 && (
                    <span className="px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider bg-amber-200 text-amber-900 ring-1 ring-amber-300">
                      Por vencer: {clientAccountStatus.dueSoonCount}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowARModal(false)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Volver a Facturar
                </button>
              </div>

              <div className="overflow-x-auto border rounded-xl">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Factura / Descripción</th>
                      <th className="px-4 py-3">Vence</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px]">
                    {clientAREntries.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-[10px] font-black uppercase tracking-widest text-slate-300">Sin cuentas por cobrar</td></tr>
                    ) : (
                      clientAREntries.slice(arPage * AR_PAGE_SIZE, (arPage + 1) * AR_PAGE_SIZE).map((ar) => {
                        const overdue = new Date() > new Date(ar.dueDate);
                        return (
                          <tr key={ar.id} className="border-t hover:bg-slate-50">
                            <td className="px-4 py-3">
                              <div className="font-black uppercase text-slate-900">Fact: {ar.saleCorrelativo}</div>
                              <div className="text-[9px] text-slate-400 font-mono truncate">{ar.description} · {ar.id}</div>
                            </td>
                            <td className="px-4 py-3">
                              <div className={`text-[11px] font-black ${overdue ? 'text-red-600' : 'text-slate-600'}`}>{formatDateVE(new Date(ar.dueDate))}</div>
                            </td>
                            <td className="px-4 py-3 text-right font-bold text-slate-400">$ {ar.amountUSD.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right font-black text-slate-900">$ {ar.balanceUSD.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleClientARPayment(ar.id)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${overdue ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                              >
                                Recibir Pago
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {clientAREntries.length > AR_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-3">
                  <button
                    onClick={() => setArPage(p => Math.max(0, p - 1))}
                    disabled={arPage === 0}
                    className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl disabled:opacity-40 transition-all"
                  >← Anterior</button>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    {arPage + 1} / {Math.ceil(clientAREntries.length / AR_PAGE_SIZE)} &middot; {clientAREntries.length} registros
                  </span>
                  <button
                    onClick={() => setArPage(p => Math.min(Math.ceil(clientAREntries.length / AR_PAGE_SIZE) - 1, p + 1))}
                    disabled={(arPage + 1) * AR_PAGE_SIZE >= clientAREntries.length}
                    className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl disabled:opacity-40 transition-all"
                  >Siguiente →</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showARPaymentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registrar Pago (AR)</div>
                <div className="text-[12px] font-black uppercase text-slate-900">Soporte de pago y auditoría</div>
              </div>
              <button
                type="button"
                onClick={() => setShowARPaymentModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
                title="Cerrar"
                disabled={arPaySubmitting}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 gap-3">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Deuda / Saldo (USD)</div>
                  <div className="text-[13px] font-black text-slate-900">$ {arPayBalanceUSD.toFixed(2)}</div>
                  {arPayCurrency === 'VES' && arPayRateNumber > 0 && (
                    <div className="text-[10px] font-bold text-slate-500 mt-1">
                      Equivalente según tasa: Bs {arPaySuggestedVES.toFixed(2)}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Método de pago</label>
                  <select
                    value={arPayMethod}
                    onChange={(e) => setArPayMethod(e.target.value as any)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/20"
                    disabled={arPaySubmitting}
                  >
                    <option value="transfer">Transferencia</option>
                    <option value="mobile">Pago Móvil</option>
                    <option value="debit">Débito</option>
                    <option value="biopago">Biopago</option>
                    <option value="zelle">Zelle</option>
                    <option value="digital_usd">Digital USD</option>
                    <option value="cash_usd">Efectivo USD</option>
                    <option value="cash_ves">Efectivo Bs</option>
                    <option value="others">Otros</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Moneda</label>
                    <select
                      value={arPayCurrency}
                      onChange={(e) => {
                        const next = e.target.value as any;
                        setArPayCurrency(next);
                        if (next === 'VES') {
                          setArPayManualVES(false);
                        }
                      }}
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/20"
                      disabled={arPaySubmitting}
                    >
                      <option value="USD">USD</option>
                      <option value="VES">BS</option>
                    </select>
                  </div>

                  {arPayCurrency === 'USD' ? (
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto (USD)</label>
                      <input
                        type="text"
                        value={arPayAmount}
                        onChange={(e) => setArPayAmount(e.target.value)}
                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-black outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Ej. 10.00"
                        disabled={arPaySubmitting}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto (Bs)</label>
                      <input
                        type="text"
                        value={arPayAmountVES}
                        onChange={(e) => {
                          setArPayManualVES(true);
                          setArPayAmountVES(e.target.value);
                        }}
                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-black outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="Ej. 360,50"
                        disabled={arPaySubmitting}
                      />
                    </div>
                  )}
                </div>

                {arPayCurrency === 'VES' && (
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Tasa usada (Bs por USD)</label>
                    <input
                      type="text"
                      value={arPayRateUsed}
                      onChange={(e) => {
                        setArPayRateUsed(e.target.value);
                        // Si el usuario no ha editado el monto en Bs manualmente, se autocalcula.
                        // Si ya lo editó, no se toca.
                      }}
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] font-black outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ej. 36.50"
                      disabled={arPaySubmitting}
                    />
                    <div className="mt-1 flex items-center justify-between">
                      <div className="text-[9px] font-bold text-slate-400">
                        {arPayManualVES ? 'Monto Bs editado manualmente.' : 'Monto Bs calculado automáticamente.'}
                      </div>
                      <button
                        type="button"
                        className="text-[9px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-800"
                        onClick={() => {
                          setArPayManualVES(false);
                          if (arPaySuggestedVES) setArPayAmountVES(arPaySuggestedVES.toFixed(2));
                        }}
                        disabled={arPaySubmitting || !arPaySuggestedVES}
                      >
                        Usar calculado
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Banco</label>
                    {(arBanksByMethod[arPayMethod] ?? []).length > 0 ? (
                      <select
                        value={arPayBank}
                        onChange={(e) => setArPayBank(e.target.value)}
                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:ring-2 focus:ring-emerald-500/20"
                        disabled={arPaySubmitting}
                      >
                        {(arBanksByMethod[arPayMethod] ?? []).map((b) => (
                          <option key={b} value={b}>{b}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={arPayBank}
                        onChange={(e) => setArPayBank(e.target.value)}
                        className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="No aplica"
                        disabled
                      />
                    )}
                  </div>

                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Referencia</label>
                    <input
                      type="text"
                      value={arPayReference}
                      onChange={(e) => setArPayReference(e.target.value)}
                      className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="Ej. #123456"
                      disabled={arPaySubmitting}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Observación / Referencia</label>
                  <input
                    type="text"
                    value={arPayNote}
                    onChange={(e) => setArPayNote(e.target.value)}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="Ej. Transferencia, efectivo, detalle, banco..."
                    disabled={arPaySubmitting}
                  />
                </div>

                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Soportes (Fotos/PDF)</label>
                  <div
                    tabIndex={0}
                    onPaste={handleARSupportPaste}
                    className="w-full mt-1 bg-slate-50 border border-dashed border-slate-300 rounded-xl px-4 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500/20"
                    title="Haga click aquí y pegue (Ctrl+V) la imagen copiada desde WhatsApp Web"
                  >
                    Pegue aquí el comprobante (Ctrl+V)
                    <div className="text-[9px] font-bold normal-case tracking-normal text-slate-400 mt-1">
                      También puede seleccionar archivos abajo.
                    </div>
                  </div>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={(e) => setArPayFiles(Array.from(e.target.files || []))}
                    className="w-full mt-1 text-[11px] font-bold"
                    disabled={arPaySubmitting}
                  />
                  {arPayFiles.length > 0 && (
                    <div className="mt-2 space-y-2">
                      <div className="text-[10px] text-slate-500 font-bold">
                        {arPayFiles.length} archivo(s) seleccionado(s)
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {arPayFiles.map((f, idx) => {
                          const isImg = f.type.startsWith('image/');
                          const url = isImg ? URL.createObjectURL(f) : '';
                          return (
                            <div key={`${f.name}-${idx}`} className="relative border rounded-lg overflow-hidden bg-slate-50">
                              {isImg ? (
                                <img src={url} alt={f.name} className="w-full h-20 object-cover" onLoad={() => URL.revokeObjectURL(url)} />
                              ) : (
                                <div className="h-20 flex items-center justify-center text-[9px] font-black text-slate-400 uppercase">PDF</div>
                              )}
                              <div className="p-1 text-[8px] font-bold text-slate-500 truncate" title={f.name}>{f.name}</div>
                              <button type="button" onClick={() => removeArPayFile(idx)} className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded p-1" title="Quitar" disabled={arPaySubmitting}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {(() => {
                const enteredUSD = arPayCurrency === 'USD'
                  ? (parseFloat((arPayAmount || '').replace(',', '.')) || 0)
                  : (() => {
                      const r = parseFloat((arPayRateUsed || '').replace(',', '.')) || 0;
                      const v = parseFloat((arPayAmountVES || '').replace(',', '.')) || 0;
                      return r > 0 ? v / r : 0;
                    })();
                const excessUSD = roundMoney(Math.max(0, enteredUSD - arPayBalanceUSD));
                if (excessUSD < 0.005) return null;

                const otherAROptions = clientAREntries.filter(ar => ar.id !== arPayTargetId && (Number(ar.balanceUSD ?? 0) > 0.005));
                const changeNeedsRate = arPayChangeMethod === 'cash_ves' || arPayChangeMethod === 'mobile' || arPayChangeMethod === 'transfer' || arPayChangeMethod === 'debit';
                const changeNeedsBank = arPayChangeMethod === 'transfer' || arPayChangeMethod === 'mobile' || arPayChangeMethod === 'zelle' || arPayChangeMethod === 'debit';

                return (
                  <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-amber-700">Excedente detectado</div>
                        <div className="text-[14px] font-black font-mono text-amber-900">$ {excessUSD.toFixed(2)}</div>
                      </div>
                      <div className="text-[9px] font-bold text-amber-700 text-right">
                        Saldo factura: $ {arPayBalanceUSD.toFixed(2)}<br/>
                        Recibido: $ {enteredUSD.toFixed(2)}
                      </div>
                    </div>

                    <div>
                      <div className="text-[9px] font-black uppercase tracking-widest text-amber-700 mb-1">¿Qué hacer con el excedente?</div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setArPayExcessMode('change')}
                          className={`py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${arPayExcessMode === 'change' ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border border-amber-200'}`}
                        >Entregar vuelto</button>
                        <button
                          type="button"
                          onClick={() => setArPayExcessMode('apply_to_ar')}
                          disabled={otherAROptions.length === 0}
                          className={`py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${arPayExcessMode === 'apply_to_ar' ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border border-amber-200'} disabled:opacity-40 disabled:cursor-not-allowed`}
                          title={otherAROptions.length === 0 ? 'Sin otras facturas pendientes' : ''}
                        >Abonar a otra factura</button>
                        <button
                          type="button"
                          onClick={() => setArPayExcessMode('advance')}
                          className={`py-2 px-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${arPayExcessMode === 'advance' ? 'bg-amber-600 text-white' : 'bg-white text-amber-700 border border-amber-200'}`}
                        >Anticipo cliente</button>
                      </div>
                    </div>

                    {arPayExcessMode === 'change' && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[8px] font-black uppercase tracking-widest text-amber-700">Método del vuelto</label>
                          <select
                            value={arPayChangeMethod}
                            onChange={(e) => setArPayChangeMethod(e.target.value as any)}
                            className="w-full mt-1 bg-white border border-amber-200 rounded-lg px-2 py-2 text-[11px] font-black outline-none"
                          >
                            <option value="cash_ves">Efectivo Bs</option>
                            <option value="cash_usd">Efectivo USD</option>
                            <option value="transfer">Transferencia</option>
                            <option value="mobile">Pago Móvil</option>
                            <option value="zelle">Zelle</option>
                            <option value="debit">Débito</option>
                          </select>
                        </div>
                        {changeNeedsBank && (
                          <div>
                            <label className="text-[8px] font-black uppercase tracking-widest text-amber-700">Banco salida</label>
                            <input
                              type="text"
                              value={arPayChangeBank}
                              onChange={(e) => setArPayChangeBank(e.target.value)}
                              placeholder="Ej: BANESCO"
                              className="w-full mt-1 bg-white border border-amber-200 rounded-lg px-2 py-2 text-[11px] font-black outline-none"
                            />
                          </div>
                        )}
                        {changeNeedsRate && (
                          <div className={changeNeedsBank ? 'col-span-2' : ''}>
                            <label className="text-[8px] font-black uppercase tracking-widest text-amber-700">Tasa Bs/USD (para convertir el vuelto)</label>
                            <input
                              type="number" step="0.01"
                              value={arPayChangeRate}
                              onChange={(e) => setArPayChangeRate(e.target.value)}
                              placeholder={String(exchangeRateBCV.toFixed(2))}
                              className="w-full mt-1 bg-white border border-amber-200 rounded-lg px-2 py-2 text-[11px] font-black outline-none"
                            />
                            {(() => {
                              const r = parseFloat((arPayChangeRate || '').replace(',', '.')) || 0;
                              return r > 0
                                ? <div className="text-[9px] text-amber-700 font-bold mt-1">Equivalente: Bs {(excessUSD * r).toFixed(2)}</div>
                                : null;
                            })()}
                          </div>
                        )}
                        <div className="col-span-2 text-[9px] font-bold text-amber-700">
                          {arPayChangeMethod === 'cash_usd' || arPayChangeMethod === 'cash_ves'
                            ? 'Se registrará como retiro de la caja abierta.'
                            : 'Se registrará como egreso del banco indicado.'}
                        </div>
                      </div>
                    )}

                    {arPayExcessMode === 'apply_to_ar' && (
                      <div>
                        <label className="text-[8px] font-black uppercase tracking-widest text-amber-700">Factura donde abonar</label>
                        <select
                          value={arPaySecondaryArId}
                          onChange={(e) => setArPaySecondaryArId(e.target.value)}
                          className="w-full mt-1 bg-white border border-amber-200 rounded-lg px-2 py-2 text-[11px] font-black outline-none"
                        >
                          <option value="">Seleccionar...</option>
                          {otherAROptions.map(ar => (
                            <option key={ar.id} value={ar.id}>
                              {ar.saleCorrelativo} — Saldo ${Number(ar.balanceUSD ?? 0).toFixed(2)} — Vence {formatDateVE(new Date(ar.dueDate))}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {arPayExcessMode === 'advance' && (
                      <div className="text-[10px] font-bold text-amber-800 bg-white border border-amber-200 rounded-lg px-3 py-2">
                        Se creará un anticipo por ${excessUSD.toFixed(2)} a favor de <b>{clientAccountStatus.hasCredit ? '' : ''}{activeClient?.name || 'el cliente'}</b>. Podrás aplicarlo en facturas futuras.
                      </div>
                    )}
                  </div>
                );
              })()}

              {arPayError && (
                <div className="text-[10px] font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  {arPayError}
                </div>
              )}
            </div>

            <div className="p-5 border-t bg-white">
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowARPaymentModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest"
                  disabled={arPaySubmitting}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={submitARPayment}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest ${arPaySubmitting ? 'bg-slate-200 text-slate-400' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                  disabled={arPaySubmitting}
                >
                  {arPaySubmitting ? 'Guardando...' : 'Confirmar Pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de moneda para impresión de factura */}
      {pendingPrintSale && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-5 text-center">
              <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Venta Procesada</p>
              <p className="text-white font-black text-sm mt-1">{pendingPrintSale.correlativo}</p>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">¿En qué moneda imprimir la factura?</p>
              {(() => {
                const paymentMethodNormalized = String((pendingPrintSale as any)?.paymentMethod ?? '')
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toUpperCase()
                  .trim();
                const hasCreditPayment = Array.isArray((pendingPrintSale as any)?.payments)
                  && (pendingPrintSale as any).payments.some((p: any) => String(p?.method ?? '').toLowerCase() === 'credit');
                const isCredit = Number((pendingPrintSale as any)?.creditOutstandingUSD ?? 0) > 0
                  || paymentMethodNormalized === 'CREDIT'
                  || paymentMethodNormalized === 'CREDITO'
                  || hasCreditPayment;
                const handlePrint = (cur: 'USD' | 'VES') => {
                  const sale = pendingPrintSale;
                  setPendingPrintSale(null);
                  if (isCredit) {
                    const clientCreditDays = (sale?.client as any)?.creditDays ?? 0;
                    setLetraForm({
                      ciudad: 'BARQUISIMETO',
                      creditDays: clientCreditDays > 0 ? clientCreditDays : 10,
                      domicilioLibrado: (sale?.client as any)?.address || 'BARQUISIMETO, EDO. LARA',
                      condicionesPago: `A ${clientCreditDays > 0 ? clientCreditDays : 10} DÍAS FECHA`,
                      librador: 'EMPRENDIMIENTO EL COSTAL',
                      libradorRif: '',
                    });
                    setPendingLetraConfig({ sale, currency: cur });
                  } else {
                    printService.printInvoice(sale, cur, undefined, true);
                  }
                };
                return (
                  <>
                    <button onClick={() => handlePrint('USD')} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <span className="text-lg">$</span> Dólares (USD)
                    </button>
                    <button onClick={() => handlePrint('VES')} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <span className="text-lg">Bs</span> Bolívares (VES)
                    </button>
                    <button onClick={() => setPendingPrintSale(null)} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                      No imprimir
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Panel de Historial de Ventas del Turno - Consulta y Reimpresión */}
      {showSalesHistoryPanel && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
                    <Receipt className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Consulta de Ventas</p>
                    <p className="text-white font-black text-lg leading-none">Historial del Turno</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSalesHistoryPanel(false)}
                  className="p-2 text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="p-4 border-b border-slate-100 bg-slate-50 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={salesHistorySearch}
                  onChange={(e) => setSalesHistorySearch(e.target.value)}
                  placeholder="Buscar por correlativo, cliente o fecha..."
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-[11px] font-bold text-slate-800 outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex gap-2">
                {[
                  { key: 'today', label: 'Hoy' },
                  { key: 'hour', label: 'Última hora' },
                  { key: 'all', label: 'Todo' }
                ].map((filter) => (
                  <button
                    key={filter.key}
                    onClick={() => setSalesHistoryFilter(filter.key as any)}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                      salesHistoryFilter === filter.key
                        ? 'bg-emerald-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Sales List */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const now = new Date();
                // Normalizar entradas CashBoxSaleAudit a objeto de visualización
                let filtered = (historySalesSource as any[]).map((s: any) => ({
                  id: s.id,
                  correlativo: String(s.correlativo ?? ''),
                  clientName: String(s.customerName ?? s.clientName ?? ''),
                  totalUSD: Number(s.totalUSD ?? 0),
                  totalVES: Number(s.totalVES ?? 0),
                  paymentMethod: String(s.paymentMethod ?? ''),
                  timestamp: s.timestamp instanceof Date ? s.timestamp : new Date(s.timestamp ?? Date.now()),
                  saleObj: { id: s.saleId ?? s.id, correlativo: s.correlativo, client: { id: s.customerId, name: s.customerName ?? s.clientName }, items: s.items ?? [], payments: s.payments ?? [], totalUSD: s.totalUSD, totalVES: s.totalVES, paymentMethod: s.paymentMethod, exchangeRate: s.exchangeRate, timestamp: new Date(s.timestamp ?? Date.now()) }
                }));

                if (salesHistoryFilter === 'hour') {
                  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
                  filtered = filtered.filter(s => s.timestamp >= oneHourAgo);
                }
                if (salesHistoryFilter === 'today') {
                  const today = now.toDateString();
                  filtered = filtered.filter((s) => s.timestamp.toDateString() === today);
                }

                if (salesHistorySearch.trim()) {
                  const search = salesHistorySearch.toLowerCase();
                  filtered = filtered.filter(s =>
                    s.correlativo.toLowerCase().includes(search) ||
                    s.clientName.toLowerCase().includes(search) ||
                    formatDateVE(s.timestamp).includes(search) ||
                    formatTimeVE(s.timestamp).includes(search)
                  );
                }

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-10">
                      <Receipt className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                      <p className="text-slate-400 text-[11px] font-bold">No se encontraron ventas</p>
                      <p className="text-slate-300 text-[9px] mt-1">{salesHistorySearch ? 'Intente con otros términos de búsqueda' : 'Procese una venta para verla aquí'}</p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filtered.map((sale) => (
                      <div key={sale.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 hover:bg-white hover:shadow-md transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="bg-emerald-100 text-emerald-700 text-[9px] font-black px-2 py-0.5 rounded">
                                {sale.correlativo}
                              </span>
                              <span className="text-[9px] text-slate-400">{formatTimeVE(sale.timestamp)}</span>
                            </div>
                            <p className="text-[11px] font-black text-slate-800 truncate">{sale.clientName}</p>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">
                                {sale.paymentMethod === 'CREDIT' ? 'Crédito' :
                                 sale.paymentMethod === 'MIXTO' ? 'Mixto' :
                                 sale.paymentMethod}
                              </span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-black text-emerald-700 font-mono">${sale.totalUSD.toFixed(2)}</p>
                            <p className="text-[9px] text-slate-500">Bs. {sale.totalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</p>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => { setSaleToReprint(sale.saleObj); setShowSalesHistoryPanel(false); }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all"
                              >
                                Reimprimir
                              </button>
                              {dataService.hasPermission('SALES_VOID') && (
                                <button
                                  disabled={fetchingReturnSaleId !== null}
                                  onClick={async () => {
                                    const rowKey = String(sale.id ?? sale.correlativo);
                                    setFetchingReturnSaleId(rowKey);
                                    try {
                                      const sid = String(
                                        (sale as any).saleObj?.id ??
                                          (sale as any).saleId ??
                                          sale.id ??
                                          ''
                                      );
                                      const withLines = sid
                                        ? await dataService.getSaleForReturn(sid)
                                        : null;
                                      setSaleToReturn(withLines ?? (sale as any).saleObj);
                                      setReturnQtys({});
                                      setReturnReason('');
                                      setReturnRefundMethod('cash_usd');
                                      setReturnRefundBank('');
                                      setReturnRefundBankId('');
                                      setReturnRefundAmountVES('');
                                      setShowSalesHistoryPanel(false);
                                    } finally {
                                      setFetchingReturnSaleId(null);
                                    }
                                  }}
                                  className="px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all flex items-center gap-1 disabled:opacity-50"
                                >
                                  {fetchingReturnSaleId === String(sale.id ?? sale.correlativo) ? (
                                    <><Loader2 className="w-2.5 h-2.5 animate-spin" /> Cargando…</>
                                  ) : (
                                    <><RotateCcw className="w-2.5 h-2.5" /> Devolver</>
                                  )}
                                </button>
                              )}
                              {dataService.hasPermission('SALES_VOID') && sale.paymentMethod !== 'CREDIT' && (
                                <button
                                  onClick={() => { setSaleToVoid(sale.saleObj); setShowSalesHistoryPanel(false); }}
                                  className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-all"
                                >
                                  Anular
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center">
              <p className="text-[9px] text-slate-500">
                Mostrando {historySalesSource.length} {canAuditAndReturnAnyInvoice ? 'facturas del sistema' : 'ventas del turno'}
              </p>
              <button
                onClick={() => setShowSalesHistoryPanel(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de selección de moneda para reimpresión */}
      {saleToReprint && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[2001] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-slate-900 px-6 py-5 text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                <Receipt className="w-6 h-6 text-white" />
              </div>
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Reimprimir Factura</p>
              <p className="text-white font-black text-sm mt-1">{saleToReprint.correlativo}</p>
              <p className="text-slate-400 text-[10px] mt-0.5">{saleToReprint.client?.name || 'Sin cliente'}</p>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest text-center mb-4">Seleccione moneda para reimprimir</p>
              {(() => {
                const paymentMethodNormalized = String((saleToReprint as any)?.paymentMethod ?? '')
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toUpperCase()
                  .trim();
                const hasCreditPayment = Array.isArray((saleToReprint as any)?.payments)
                  && (saleToReprint as any).payments.some((p: any) => String(p?.method ?? '').toLowerCase() === 'credit');
                const isCredit = Number((saleToReprint as any)?.creditOutstandingUSD ?? 0) > 0
                  || paymentMethodNormalized === 'CREDIT'
                  || paymentMethodNormalized === 'CREDITO'
                  || hasCreditPayment;
                const handleReprint = (cur: 'USD' | 'VES') => {
                  const sale = saleToReprint;
                  setSaleToReprint(null);
                  if (isCredit) {
                    const clientCreditDays = (sale?.client as any)?.creditDays ?? 0;
                    setLetraForm({
                      ciudad: 'BARQUISIMETO',
                      creditDays: clientCreditDays > 0 ? clientCreditDays : 10,
                      domicilioLibrado: (sale?.client as any)?.address || 'BARQUISIMETO, EDO. LARA',
                      condicionesPago: `A ${clientCreditDays > 0 ? clientCreditDays : 10} DÍAS FECHA`,
                      librador: 'EMPRENDIMIENTO EL COSTAL',
                      libradorRif: '',
                    });
                    setPendingLetraConfig({ sale, currency: cur });
                  } else {
                    printService.printInvoice(sale, cur, undefined, true);
                  }
                };
                return (
                  <>
                    <button onClick={() => handleReprint('USD')} className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <span className="text-lg">$</span> Dólares (USD)
                    </button>
                    <button onClick={() => handleReprint('VES')} className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <span className="text-lg">Bs</span> Bolívares (VES)
                    </button>
                    <button onClick={() => setSaleToReprint(null)} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
                      Cancelar
                    </button>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* BILL-UX-01: Modal de confirmación antes de procesar venta */}
      {showProcessConfirm && (
        <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-sm z-[2002] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-800 px-6 py-5 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
              <p className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">Confirmación de Venta</p>
              <p className="text-white font-black text-lg leading-tight mt-1">¿Procesar esta venta?</p>
            </div>
            <div className="p-5 space-y-3">
              {/* Resumen */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Cliente</span>
                  <span className="text-[11px] font-black text-slate-800 uppercase">{currentSession.client?.name || 'CONTADO'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Ítems</span>
                  <span className="text-[11px] font-black text-slate-800">{currentSession.items.length} producto(s) · {currentSession.items.reduce((a, i) => a + i.qty, 0)} uds.</span>
                </div>
                <div className="h-px bg-slate-200" />
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total USD</span>
                  <span className="text-[15px] font-black text-emerald-700 font-mono">
                    $ {confirmTotalUSD.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Bs.</span>
                  <span className="text-[11px] font-black text-slate-600 font-mono">
                    Bs. {(hasAnyCreditPayment && creditCurrency === 'USD'
                      ? roundMoney(totalUSDNominal * exchangeRateBCV)
                      : hasAnyCreditPayment && creditCurrency === 'VES'
                        ? totalVESInternal
                        : roundMoney(totalUSDNominal * internalRateNumber)
                    ).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {currentSession.payments.length > 0 && (
                  <>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Método</span>
                      <span className="text-[10px] font-black text-slate-700 uppercase">
                        {currentSession.payments.length === 1
                          ? currentSession.payments[0].method.replace('_', ' ')
                          : `Mixto (${currentSession.payments.length} métodos)`}
                      </span>
                    </div>
                  </>
                )}
                {/* Alerta items con stock bajo */}
                {currentSession.items.some(i => {
                  const prod = dataService.getStocks().find(p => p.code === i.code);
                  const avail = prod?.lotes?.reduce((s, l) => s + (l.qty || 0), 0) || 0;
                  return avail - i.qty <= 3 && avail - i.qty >= 0;
                }) && (
                  <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-[8px] font-black text-amber-700 uppercase tracking-wider">⚠️ Stock bajo tras esta venta:</p>
                    {currentSession.items
                      .filter(i => {
                        const prod = dataService.getStocks().find(p => p.code === i.code);
                        const avail = prod?.lotes?.reduce((s, l) => s + (l.qty || 0), 0) || 0;
                        return avail - i.qty <= 3 && avail - i.qty >= 0;
                      })
                      .map(i => {
                        const prod = dataService.getStocks().find(p => p.code === i.code);
                        const avail = prod?.lotes?.reduce((s, l) => s + (l.qty || 0), 0) || 0;
                        const remaining = avail - i.qty;
                        return (
                          <p key={i.id} className="text-[8px] font-bold text-amber-600 mt-0.5">
                            · {i.description.substring(0, 28)} → quedan <strong>{remaining}</strong> uds.
                          </p>
                        );
                      })
                    }
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowProcessConfirm(false)}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >Cancelar</button>
                <button
                  onClick={() => { setShowProcessConfirm(false); handleProcess(); }}
                  disabled={isProcessing}
                  className="flex-1 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : <><CheckCircle2 className="w-4 h-4" /> Confirmar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de anulación de venta */}
      {saleToVoid && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[2002] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-900 px-6 py-5 text-center">
              <div className="w-12 h-12 bg-red-700 rounded-full flex items-center justify-center mx-auto mb-2">
                <Trash2 className="w-6 h-6 text-white" />
              </div>
              <p className="text-[10px] font-black text-red-300 uppercase tracking-widest">⚠️ Anular Venta</p>
              <p className="text-white font-black text-lg mt-1">{saleToVoid.correlativo}</p>
              <p className="text-red-200 text-[10px] mt-0.5">${saleToVoid.totalUSD?.toFixed(2) || '0.00'} - {saleToVoid.client?.name || 'Sin cliente'}</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-3">
                <p className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">⚠️ Advertencia</p>
                <p className="text-[10px] text-amber-700 mt-1">
                  Esta acción anulará permanentemente la factura y revertirá el stock. 
                  Solo se puede anular dentro de las 24 horas posteriores a la emisión.
                </p>
              </div>
              
              <div>
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">
                  Motivo de anulación (requerido)
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Ej: Error en monto, cliente canceló, duplicado, etc."
                  rows={3}
                  maxLength={150}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-bold text-slate-800 outline-none focus:border-red-500 resize-none"
                />
                <p className="text-[8px] text-slate-400 mt-1 text-right">{voidReason.length}/150</p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setSaleToVoid(null);
                    setVoidReason('');
                    setVoidingSale(false);
                  }}
                  disabled={voidingSale}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!voidReason.trim()) {
                      showToast('Debe ingresar un motivo para la anulación.', 'warning');
                      return;
                    }
                    if (!saleToVoid?.id) {
                      showToast('Error: La venta no tiene ID válido.', 'error');
                      return;
                    }
                    setVoidingSale(true);
                    try {
                      const result2 = await dataService.voidSale(
                        saleToVoid.id,
                        voidReason.trim(),
                        dataService.getCurrentUser()?.name || 'Sistema'
                      );
                      if (result2.success) {
                        showToast(`Factura ${saleToVoid.correlativo} anulada exitosamente.`, 'success');
                        // Historial se actualiza automáticamente por Firestore onSnapshot
                        setSaleToVoid(null);
                        setVoidReason('');
                      } else {
                        showToast(`Error: ${result2.error}`, 'error');
                      }
                    } catch (e: any) {
                      showToast(e.message || 'Error al anular la venta', 'error');
                    } finally {
                      setVoidingSale(false);
                    }
                  }}
                  disabled={voidingSale || !voidReason.trim()}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {voidingSale ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Anulando...
                    </>
                  ) : (
                    'Anular Factura'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal Devolución Parcial */}
      {saleToReturn && !returnResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[2003] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="bg-amber-700 px-6 py-4 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-600 rounded-full flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-[9px] font-black text-amber-200 uppercase tracking-widest">Devolución Parcial</p>
                  <p className="text-white font-black text-base leading-tight">{saleToReturn.correlativo}</p>
                  <p className="text-amber-200 text-[9px]">{saleToReturn.client?.name} — ${saleToReturn.totalUSD?.toFixed(2)}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="p-4 space-y-2 overflow-y-auto flex-1">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Selecciona los ítems y cantidades a devolver</p>
              {(!(saleToReturn.items || []).length) && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] font-bold text-amber-900">
                  No se encontró el detalle de productos de esta factura. Si la venta es antigua, solo había totales en base de datos. Las ventas nuevas deberían listar automáticamente; si el problema continúa, revisa conexión a Supabase y reglas (RLS) de lectura/escritura en la tabla <span className="font-mono">sales</span>.
                </div>
              )}
              {(saleToReturn.items || []).map((item: any, lineIdx: number) => {
                const maxQty = Number(item.qty ?? 0);
                const rlk = returnLineKey(lineIdx);
                const inputVal = returnQtys[rlk] ?? '';
                const parsedQty = parseFloat(String(inputVal).replace(',', '.')) || 0;
                const lineTotal = parsedQty * (item.priceUSD ?? 0);
                return (
                  <div key={rlk} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    parsedQty > 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-slate-900 uppercase truncate">{item.description}</p>
                      <p className="text-[8px] font-bold text-slate-400">{item.code} · Facturado: {maxQty} {item.unit ?? ''} · ${(item.priceUSD ?? 0).toFixed(4)}/u</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {parsedQty > 0 && <span className="text-[8px] font-black text-amber-700">${lineTotal.toFixed(2)}</span>}
                      <input
                        type="number"
                        min="0"
                        max={maxQty}
                        step="0.001"
                        placeholder="0"
                        value={inputVal}
                        onChange={e => setReturnQtys(prev => ({ ...prev, [rlk]: e.target.value }))}
                        className="w-20 text-center bg-white border-2 border-slate-200 focus:border-amber-400 rounded-lg px-2 py-1.5 text-[11px] font-black outline-none"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Resumen */}
              {(() => {
                const total = (saleToReturn.items || []).reduce((acc: number, item: any, lineIdx: number) => {
                  const qty = parseFloat(String(returnQtys[returnLineKey(lineIdx)] ?? '0').replace(',', '.')) || 0;
                  return acc + qty * (item.priceUSD ?? 0);
                }, 0);
                return total > 0 ? (
                  <div className="flex justify-between items-center bg-amber-100 border border-amber-200 rounded-xl px-4 py-2.5">
                    <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest">Nota de Crédito a emitir</span>
                    <span className="text-base font-black text-amber-900">${total.toFixed(2)}</span>
                  </div>
                ) : null;
              })()}

              {/* Devolución automática espejo */}
              <div className="pt-1">
                <div className="rounded-2xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 space-y-2 mb-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-blue-700 uppercase tracking-widest block">Cómo se pagó la factura original</label>
                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-700 bg-blue-100 border border-blue-200 rounded-full px-2 py-0.5">
                      Origen
                    </span>
                  </div>
                  {returnOriginalPaymentLines.length === 0 ? (
                    <p className="text-[9px] text-blue-700/70">Sin detalle de pago en esta factura.</p>
                  ) : returnOriginalPaymentLines.map((line, idx) => (
                    <div key={`orig-${line.method}-${line.bank}-${idx}`} className="flex items-center justify-between gap-2 text-[9px] font-mono border-b border-blue-200/70 last:border-0 pb-1.5 last:pb-0">
                      <span className="font-black text-blue-900 uppercase">
                        {paymentMethodVisualIcon(line.method)} Método de Pago: {paymentMethodKeyLabel(line.method)}{line.bank ? ` + Banco: ${line.bank}` : ''}
                      </span>
                      <span className="text-blue-800">
                        $ {line.amountUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {' / '}
                        Bs {line.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {line.rateUsed > 0 ? ` @ ${line.rateUsed.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block">Desglose automático de reintegro (espejo de factura)</label>
                    <span className="text-[8px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5">
                      Reintegro
                    </span>
                  </div>
                  <p className="text-[9px] font-bold text-emerald-800/80">
                    Se devolverá por los mismos métodos/bancos de la factura, de forma proporcional a los productos seleccionados.
                  </p>
                  {returnAutoPreview.lines.length === 0 ? (
                    <p className="text-[9px] text-emerald-700/70">Seleccione cantidades para ver el desglose.</p>
                  ) : returnAutoPreview.lines.map((line, idx) => (
                    <div key={`${line.method}-${line.bank}-${idx}`} className="flex items-center justify-between gap-2 text-[9px] font-mono border-b border-emerald-200/70 last:border-0 pb-1.5 last:pb-0">
                      <span className="font-black text-emerald-900 uppercase">
                        {paymentMethodVisualIcon(line.method)} Método de Pago: {paymentMethodKeyLabel(line.method) || 'METODO'}{line.bank ? ` + Banco: ${line.bank}` : ''}
                      </span>
                      <span className="text-emerald-800">
                        $ {line.amountUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {' / '}
                        Bs {line.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        {line.rateUsed > 0 ? ` @ ${line.rateUsed.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Motivo */}
              <div className="pt-1">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">Motivo (requerido)</label>
                <textarea
                  value={returnReason}
                  onChange={e => setReturnReason(e.target.value)}
                  placeholder="Ej: Producto en mal estado, error de despacho, exceso de cantidad..."
                  rows={2}
                  maxLength={150}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-3 py-2 text-[11px] font-bold text-slate-800 outline-none focus:border-amber-400 resize-none"
                />
                <p className="text-[8px] text-slate-400 text-right mt-0.5">{returnReason.length}/150</p>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 flex gap-2 shrink-0">
              <button
                onClick={() => { setSaleToReturn(null); setReturnReason(''); setReturnQtys({}); setReturnRefundMethod('cash_usd'); setReturnRefundBank(''); setReturnRefundBankId(''); setReturnRefundAmountVES(''); }}
                disabled={returningPartial}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                disabled={returningPartial || !returnReason.trim() || (saleToReturn.items || []).every((item: any, lineIdx: number) => !(parseFloat(String(returnQtys[returnLineKey(lineIdx)] ?? '0').replace(',', '.')) > 0))}
                onClick={async () => {
                  const itemsToReturn = (saleToReturn.items || []).reduce((acc: any[], item: any, lineIdx: number) => {
                    const qty = parseFloat(String(returnQtys[returnLineKey(lineIdx)] ?? '0').replace(',', '.')) || 0;
                    const max = Number(item.qty ?? 0);
                    if (qty <= 0) return acc;
                    if (qty > max) { showToast(`Cantidad a devolver de "${item.description}" excede lo facturado (${max}).`, 'warning'); throw new Error('qty_exceeded'); }
                    acc.push({
                      code: item.code,
                      description: item.description,
                      qty,
                      priceUSD: item.priceUSD ?? 0,
                      lineIndex: lineIdx,
                      dispatchLotes: item.dispatchLotes
                    });
                    return acc;
                  }, []);
                  if (itemsToReturn.length === 0) { showToast('Ingresa una cantidad mayor a 0 en al menos un ítem.', 'warning'); return; }
                  const saleInternalRate = Number((saleToReturn as any)?.creditMeta?.rateInternal ?? (saleToReturn as any)?.exchangeRate ?? 0) || 0;
                  const requestedBcvRate = Number(exchangeRateBCV ?? 0) || 0;
                  const refundRateToUse = saleInternalRate > 0 ? saleInternalRate : requestedBcvRate;
                  setReturningPartial(true);
                  try {
                    const res = await dataService.partialReturnSale({
                      saleId: saleToReturn.id || '',
                      saleCorrelativo: saleToReturn.correlativo,
                      clientId: saleToReturn.client?.id || '',
                      clientName: saleToReturn.client?.name || '',
                      returnItems: itemsToReturn,
                      reason: returnReason.trim(),
                      authorizedBy: dataService.getCurrentUser()?.name || 'Sistema',
                      refundMethod: returnRefundMethod,
                      refundBank: returnRefundBank || undefined,
                      refundBankId: returnRefundBankId || undefined,
                      refundAmountVES: returnRefundAmountVES ? parseFloat(returnRefundAmountVES) : undefined,
                      refundExchangeRate: refundRateToUse
                    });
                    if (res.success) {
                      const det = Array.isArray((res as any).movementDetails) ? (res as any).movementDetails : [];
                      const firstMov = det[0] as { method?: string; bank?: string } | undefined;
                      const keyFromMov = firstMov?.method != null
                        ? String(firstMov.method).toLowerCase().trim()
                        : '';
                      const effectiveKey = keyFromMov
                        || String(returnRefundMethod || 'cash_usd').toLowerCase();
                      setReturnResult({
                        creditNoteCorrelativo: res.creditNoteCorrelativo!,
                        creditNoteAmountUSD: res.creditNoteAmountUSD!,
                        refundMethod: returnRefundMethod,
                        effectiveRefundMethodKey: effectiveKey,
                        refundBank: (firstMov?.bank && String(firstMov.bank).trim()) || (returnRefundBank || undefined),
                        returnedItems: itemsToReturn.map((i) => ({
                          code: i.code,
                          description: i.description,
                          qty: i.qty,
                          priceUSD: i.priceUSD,
                          lineTotalUSD: Math.round((i.qty * (i.priceUSD ?? 0) + Number.EPSILON) * 100) / 100
                        })),
                        movementDetails: det
                      });
                      const detail = Array.isArray((res as any).movementDetails) && (res as any).movementDetails.length > 0
                        ? ` | Movimientos: ${(res as any).movementDetails.length}`
                        : '';
                      showToast(`Devolución registrada: ${res.creditNoteCorrelativo}${detail}`, 'success');
                    } else {
                      showToast(`Error: ${res.error}`, 'error');
                    }
                  } catch (e: any) {
                    if (e?.message !== 'qty_exceeded') showToast(e?.message || 'Error al procesar la devolución', 'error');
                  } finally {
                    setReturningPartial(false);
                  }
                }}
                className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                {returningPartial ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</> : 'Emitir Nota de Crédito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resultado de Nota de Crédito */}
      {returnResult && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[2004] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-emerald-700 px-6 py-8 text-center">
              <CheckCircle2 className="w-12 h-12 text-white mx-auto mb-3" />
              <p className="text-[9px] font-black text-emerald-200 uppercase tracking-widest">Devolución Procesada</p>
              <p className="text-white font-black text-xl mt-1">{returnResult.creditNoteCorrelativo}</p>
              <p className="text-3xl font-black text-emerald-100 mt-2">${returnResult.creditNoteAmountUSD.toFixed(2)}</p>
              <p className="text-[9px] text-emerald-300 mt-1">Nota de crédito registrada — Stock revertido</p>
            </div>
            <div className="p-5 space-y-3 max-h-[min(80vh,640px)] overflow-y-auto">
              {Array.isArray(returnResult.returnedItems) && returnResult.returnedItems.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Productos devueltos</p>
                  <ul className="space-y-2">
                    {returnResult.returnedItems.map((it, i) => (
                      <li key={`${it.code}-${i}`} className="flex items-start justify-between gap-2 text-[10px] text-slate-800 border-b border-slate-200/80 last:border-0 pb-2 last:pb-0">
                        <span className="font-bold min-w-0">
                          <span className="text-slate-500 font-mono">{it.code}</span> · {it.description}
                          <span className="text-slate-500"> · {it.qty} u. × ${(it.priceUSD ?? 0).toFixed(4)}</span>
                        </span>
                        <span className="font-black text-emerald-800 shrink-0">
                          ${it.lineTotalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-2">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">Método de devolución</span>
                <span className="text-[11px] font-black text-slate-800 text-right">
                  {paymentMethodKeyLabel(returnResult.effectiveRefundMethodKey ?? returnResult.refundMethod ?? '')}
                  {(returnResult.refundBank || (returnResult.movementDetails && returnResult.movementDetails[0]?.bank))
                    ? ` · ${returnResult.refundBank || returnResult.movementDetails?.[0]?.bank || ''}`
                    : ''}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Detalle del movimiento registrado</p>
                {Array.isArray(returnResult.movementDetails) && returnResult.movementDetails.length > 0 ? (
                  <div className="space-y-1.5">
                    {returnResult.movementDetails.map((m, idx) => (
                      <div key={`${m.reference}-${idx}`} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                        <span className="font-black text-slate-700">
                          {paymentMethodKeyLabel(m.method)}
                          {m.bank ? ` · ${m.bank}` : ''}
                        </span>
                        <span className="text-slate-600">
                          $ {Number(m.amountUSD ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {' / '}
                          Bs {Number(m.amountVES ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {Number(m.rateUsed ?? 0) > 0 ? ` @ ${Number(m.rateUsed ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">Sin líneas bancarias detalladas (verifique configuración bancaria).</p>
                )}
              </div>
              <button
                onClick={() => { setReturnResult(null); setSaleToReturn(null); setReturnReason(''); setReturnQtys({}); setReturnRefundMethod('cash_usd'); setReturnRefundBank(''); setReturnRefundBankId(''); setReturnRefundAmountVES(''); }}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuración de Letra de Cambio */}
      {pendingLetraConfig && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[2010] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-2xl flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Letra de Cambio</p>
                  <p className="text-white font-black text-base leading-none">Configurar campos</p>
                </div>
              </div>
              <p className="text-slate-400 text-[10px] mt-2">
                {pendingLetraConfig.sale?.correlativo} · {pendingLetraConfig.sale?.client?.name} · {pendingLetraConfig.currency}
              </p>
            </div>
            <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
              {/* Ciudad */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Ciudad emisora</label>
                <input
                  type="text"
                  value={letraForm.ciudad ?? ''}
                  onChange={e => setLetraForm(p => ({ ...p, ciudad: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all uppercase"
                  placeholder="BARQUISIMETO"
                />
              </div>
              {/* Días de crédito / Vencimiento */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Días hasta vencimiento</label>
                <input
                  type="number"
                  min="1"
                  value={letraForm.creditDays ?? 10}
                  onChange={e => {
                    const days = Math.max(1, parseInt(e.target.value) || 1);
                    setLetraForm(p => ({ ...p, creditDays: days, condicionesPago: `A ${days} DÍAS FECHA` }));
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                />
                <p className="text-[9px] text-slate-400 mt-1">Fecha de vencimiento: <span className="font-black text-slate-600">{(() => {
                  const d = new Date(pendingLetraConfig.sale?.timestamp || Date.now());
                  d.setDate(d.getDate() + (letraForm.creditDays ?? 10));
                  return formatDateVE(d, { day: '2-digit', month: '2-digit', year: 'numeric' });
                })()}</span></p>
              </div>
              {/* Condiciones de pago */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Condiciones de pago</label>
                <input
                  type="text"
                  value={letraForm.condicionesPago ?? ''}
                  onChange={e => setLetraForm(p => ({ ...p, condicionesPago: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all uppercase"
                  placeholder="A 30 DÍAS FECHA"
                />
              </div>
              {/* Domicilio del librado */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Domicilio del librado (cliente)</label>
                <input
                  type="text"
                  value={letraForm.domicilioLibrado ?? ''}
                  onChange={e => setLetraForm(p => ({ ...p, domicilioLibrado: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all uppercase"
                  placeholder="BARQUISIMETO, EDO. LARA"
                />
              </div>
              {/* Beneficiario (a la orden de) */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">A la orden de (beneficiario)</label>
                <input
                  type="text"
                  value={letraForm.librador ?? ''}
                  onChange={e => setLetraForm(p => ({ ...p, librador: e.target.value.toUpperCase() }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all uppercase"
                  placeholder="EMPRENDIMIENTO EL COSTAL"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">RIF del beneficiario (opcional)</label>
                <input
                  type="text"
                  value={letraForm.libradorRif ?? ''}
                  onChange={e => setLetraForm(p => ({ ...p, libradorRif: e.target.value }))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400/30 focus:border-amber-400 transition-all"
                  placeholder="J-XXXXXXXX-X"
                />
              </div>
              {/* Info de cliente — solo lectura */}
              <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1 border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Datos del librado (auto)</p>
                <p className="text-[11px] font-black text-slate-700">{pendingLetraConfig.sale?.client?.name}</p>
                <p className="text-[10px] text-slate-500">RIF: {pendingLetraConfig.sale?.client?.id} · TEL: {pendingLetraConfig.sale?.client?.phone || 'S/N'}</p>
              </div>
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => { setPendingLetraConfig(null); setLetraForm({}); }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const { sale, currency } = pendingLetraConfig;
                  setPendingLetraConfig(null);
                  await printService.printInvoice(sale, currency, letraForm);
                  setLetraForm({});
                }}
                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <Receipt className="w-4 h-4" /> Imprimir Letra
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}
