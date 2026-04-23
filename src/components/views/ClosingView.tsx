import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DollarSign, Clock, AlertTriangle, FileText, Lock, Printer, ArrowRight, ShieldCheck, TrendingUp, Package, CreditCard, Smartphone, Building2, Fingerprint, Zap, CheckCircle2, Plus, Trash2, ChevronDown, ChevronUp, Layers, UserPlus, X } from 'lucide-react';
import { useHotkeys } from '../../utils/hotkeys';
import { dataService, CashBoxBreakdownLine, CashBoxSession, CashBoxSessionSummary, CashBoxEnhancedAudit, BankMethodCurrencyBreakdown, AccountingImpactLine } from '../../services/dataService';

// --- Tipos locales para el arqueo de declaración ---
interface BillEntry { denom: number; qty: number; }
interface ElectronicLine { id: string; method: string; bankId: string; bankName: string; amountVES: number; amountUSD: number; othersType: string; note: string; }

const METHOD_LABEL: Record<string, string> = {
  mobile: 'Pago Móvil',
  transfer: 'Transferencia',
  biopago: 'Biopago',
  debit: 'Débito',
  zelle: 'Zelle',
  digital_usd: 'Digital USD',
  others: 'Otros',
  credit: 'Crédito',
};

const METHOD_CURRENCY_MAP: Record<string, 'VES' | 'USD' | 'BOTH'> = {
  cash_ves: 'VES', cash_usd: 'USD',
  mobile: 'VES', transfer: 'VES',
  biopago: 'VES', debit: 'VES',
  zelle: 'USD', digital_usd: 'USD',
  others: 'BOTH', credit: 'BOTH',
};

const OTHERS_TYPES = ['CxC', 'CxP', 'DxC', 'DxV', 'Ant. Cliente', 'Ant. Proveedores'];

export function ClosingView({ exchangeRateBCV = 0, exchangeRateParallel = 0, exchangeRateInternal = 0 }: { exchangeRateBCV?: number; exchangeRateParallel?: number; exchangeRateInternal?: number }) {
  const [step, setStep] = useState(1);
  const [declaredBreakdown, setDeclaredBreakdown] = useState<CashBoxBreakdownLine[]>([]);
  const [explanation, setExplanation] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [closedSuccess, setClosedSuccess] = useState(false);
  const [currentSession, setCurrentSession] = useState<CashBoxSession | null>(null);
  const [sessionSummary, setSessionSummary] = useState<CashBoxSessionSummary | null>(null);
  const [enhancedAudit, setEnhancedAudit] = useState<CashBoxEnhancedAudit | null>(null);
  const [availableSessions, setAvailableSessions] = useState<CashBoxSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [auditCashierFilter, setAuditCashierFilter] = useState('ALL');
  const [auditDateFilter, setAuditDateFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeAuditTab, setActiveAuditTab] = useState<'reconciliation' | 'payments' | 'inventory' | 'accounting' | 'denominations'>('reconciliation');
  const [declaredCreditCount, setDeclaredCreditCount] = useState(0);
  const [declaredCreditAmountUSD, setDeclaredCreditAmountUSD] = useState(0);

  // FEAT-10: Multi-caja
  const [showOpenCashboxModal, setShowOpenCashboxModal] = useState(false);
  const [newCashboxUserId, setNewCashboxUserId] = useState('');
  const [newCashboxUserName, setNewCashboxUserName] = useState('');
  const [newCashboxStation, setNewCashboxStation] = useState('');
  const [newCashboxUSD, setNewCashboxUSD] = useState(0);
  const [newCashboxVES, setNewCashboxVES] = useState(0);
  const [openingCashbox, setOpeningCashbox] = useState(false);
  const [sanitizing, setSanitizing] = useState(false);
  const [sanitizeResult, setSanitizeResult] = useState<string | null>(null);

  // --- Estado de denominaciones de efectivo ---
  const [billsVES, setBillsVES] = useState<BillEntry[]>([{ denom: 100, qty: 0 }]);
  const [billsUSD, setBillsUSD] = useState<BillEntry[]>([{ denom: 1, qty: 0 }]);
  const [showPinConfirm, setShowPinConfirm] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  // --- Estado de líneas electrónicas (método + banco + monto) ---
  const [electronicLines, setElectronicLines] = useState<ElectronicLine[]>([]);
  const declarationSeedKeyRef = useRef<string>('');

  // --- Bancos disponibles ---
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([]);

  const currentUser = dataService.getCurrentUser();
  const today = new Date().toLocaleDateString();

  const METHOD_ICON: Record<string, React.ReactNode> = {
    cash_ves: <DollarSign className="w-4 h-4" />,
    cash_usd: <DollarSign className="w-4 h-4" />,
    mobile: <Smartphone className="w-4 h-4" />,
    transfer: <Building2 className="w-4 h-4" />,
    biopago: <Fingerprint className="w-4 h-4" />,
    debit: <CreditCard className="w-4 h-4" />,
    zelle: <Zap className="w-4 h-4" />,
    digital_usd: <DollarSign className="w-4 h-4" />,
    others: <FileText className="w-4 h-4" />,
  };

  // Cargar bancos disponibles
  useEffect(() => {
    const bs = dataService.getBanks();
    setBanks(bs.map(b => ({ id: b.id, name: b.name })));
  }, []);

  // Convertir denominaciones + líneas electrónicas a CashBoxBreakdownLine[]
  // Helper: resolver nombre del banco "Efectivo Bs"/"Efectivo USD" para alinear la
  // clave declarada con la que guarda persistSalePayments/resolveCashBank en el sistema.
  const resolveCashBankName = (method: 'cash_ves' | 'cash_usd'): string => {
    const allBanks = dataService.getBanks() || [];
    // 1) banco activo con supportedMethods
    let found = allBanks.find((b: any) => b?.active !== false && Array.isArray(b?.supportedMethods) && b.supportedMethods.includes(method));
    // 2) fallback por nombre (EFECTIVO/CAJA + moneda)
    if (!found) {
      found = allBanks.find((b: any) => {
        if (b?.active === false) return false;
        const nm = String(b?.name ?? '').toUpperCase();
        if (!nm.includes('EFECTIVO') && !nm.includes('CAJA')) return false;
        if (method === 'cash_usd') return nm.includes('USD') || nm.includes('$') || nm.includes('DOLAR');
        return nm.includes('BS') || nm.includes('BOLIVAR') || nm.includes('VES');
      });
    }
    // 3) fallback: virtual (coincide con resolveCashBank en dataService)
    if (!found) return method === 'cash_usd' ? 'Efectivo USD' : 'Efectivo Bs';
    return String(found.name ?? '').trim();
  };

  const buildElectronicDeclarationLinesFromBreakdown = (
    source: CashBoxBreakdownLine[],
    preserveAmounts: boolean
  ): ElectronicLine[] => {
    const grouped = new Map<string, ElectronicLine>();
    const inferOthersType = (line: CashBoxBreakdownLine): string => {
      const bank = String(line.bank ?? '').trim();
      if (bank) return bank;
      const accountLabel = String(line.accountLabel ?? '').trim();
      if (accountLabel) return accountLabel;
      const label = String(line.label ?? '').trim();
      if (label.startsWith('Otros ·')) return label.replace('Otros ·', '').trim();
      return '';
    };

    for (const line of Array.isArray(source) ? source : []) {
      const rawMethod = String(line.method ?? '').trim().toLowerCase();
      const method = rawMethod === 'otro' ? 'others' : rawMethod;
      if (!method || method === 'cash_usd' || method === 'cash_ves' || method === 'credit') continue;

      const amountUSD = Number(line.amountUSD ?? 0) || 0;
      const amountVES = Number(line.amountVES ?? 0) || 0;
      if (Math.abs(amountUSD) <= 0.000001 && Math.abs(amountVES) <= 0.000001) continue;

      const isOthers = method === 'others';
      const bankName = String(line.bank ?? '').trim();
      const othersType = isOthers ? inferOthersType(line) : '';
      const groupKey = isOthers ? `${method}|${othersType}` : `${method}|${bankName}`;
      const existing = grouped.get(groupKey);

      if (existing) {
        if (preserveAmounts) {
          existing.amountUSD = Number((existing.amountUSD + amountUSD).toFixed(2));
          existing.amountVES = Number((existing.amountVES + amountVES).toFixed(2));
        }
        continue;
      }

      const bankMatch = !isOthers
        ? banks.find((b) => String(b.name ?? '').trim().toUpperCase() === bankName.toUpperCase())
        : undefined;
      grouped.set(groupKey, {
        id: Math.random().toString(36).slice(2),
        method,
        bankId: bankMatch?.id ?? '',
        bankName: isOthers ? '' : bankName,
        amountVES: preserveAmounts ? Number(amountVES.toFixed(2)) : 0,
        amountUSD: preserveAmounts ? Number(amountUSD.toFixed(2)) : 0,
        othersType,
        note: String(line.note ?? '').trim()
      });
    }

    return Array.from(grouped.values()).sort((a, b) => {
      const m = String(a.method ?? '').localeCompare(String(b.method ?? ''));
      if (m !== 0) return m;
      const aKey = a.method === 'others' ? a.othersType : a.bankName;
      const bKey = b.method === 'others' ? b.othersType : b.bankName;
      return String(aKey ?? '').localeCompare(String(bKey ?? ''));
    });
  };

  const excludeFromCashTotals = (line: Partial<CashBoxBreakdownLine>): boolean => {
    const method = String(line.method ?? '').trim().toLowerCase();
    if (method !== 'others') return false;
    const descriptor = [
      String(line.bank ?? '').trim(),
      String(line.accountLabel ?? '').trim(),
      String(line.label ?? '').trim(),
      String(line.note ?? '').trim()
    ].join(' ').toUpperCase();
    return descriptor.includes('ANT. CLIENTE') || descriptor.includes('ANTICIPO CLIENTE');
  };

  const buildDeclaredBreakdownFromUI = (): CashBoxBreakdownLine[] => {
    const result: CashBoxBreakdownLine[] = [];
    // Efectivo Bs
    const totalCashVES = billsVES.reduce((s, b) => s + b.denom * b.qty, 0);
    if (totalCashVES > 0) {
      const cashBankVES = resolveCashBankName('cash_ves');
      result.push({ key: `cash_ves|${cashBankVES}||VES`, method: 'cash_ves', currency: 'VES', label: 'Efectivo Bs', bank: cashBankVES, accountId: '', accountLabel: '', posTerminalId: '', posTerminalName: '', amountUSD: 0, amountVES: totalCashVES, count: 1, note: '' });
    }
    // Efectivo USD
    const totalCashUSD = billsUSD.reduce((s, b) => s + b.denom * b.qty, 0);
    if (totalCashUSD > 0) {
      const cashBankUSD = resolveCashBankName('cash_usd');
      result.push({ key: `cash_usd|${cashBankUSD}||USD`, method: 'cash_usd', currency: 'USD', label: 'Efectivo USD', bank: cashBankUSD, accountId: '', accountLabel: '', posTerminalId: '', posTerminalName: '', amountUSD: totalCashUSD, amountVES: 0, count: 1, note: '' });
    }
    // Líneas electrónicas — cada línea puede tener USD o VES, se generan por separado
    electronicLines.forEach(line => {
      const subLabel = line.method === 'others' && line.othersType ? line.othersType : line.bankName;
      const displayLabel = line.method === 'others'
        ? `Otros${line.othersType ? ` · ${line.othersType}` : ''}`
        : (METHOD_LABEL[line.method] ?? line.method.toUpperCase());
      const bankVal = line.method === 'others' ? line.othersType : line.bankName;
      // VES
      if (line.amountVES > 0) {
        const keyCur = `${line.method}|${subLabel}||VES`;
        result.push({ key: keyCur, method: line.method, currency: 'VES', label: displayLabel, bank: bankVal, accountId: '', accountLabel: subLabel, posTerminalId: '', posTerminalName: '', amountUSD: 0, amountVES: line.amountVES, count: 1, note: line.note ?? '' });
      }
      // USD
      if (line.amountUSD > 0) {
        const keyCur = `${line.method}|${subLabel}||USD`;
        result.push({ key: keyCur, method: line.method, currency: 'USD', label: displayLabel, bank: bankVal, accountId: '', accountLabel: subLabel, posTerminalId: '', posTerminalName: '', amountUSD: line.amountUSD, amountVES: 0, count: 1, note: line.note ?? '' });
      }
    });
    // Crédito
    if (declaredCreditAmountUSD > 0) result.push({ key: 'credit|||USD', method: 'credit', currency: 'USD', label: 'Crédito', bank: '', accountId: '', accountLabel: '', posTerminalId: '', posTerminalName: '', amountUSD: declaredCreditAmountUSD, amountVES: 0, count: declaredCreditCount, note: '' });
    return result;
  };

  const loadSessionData = async (sessionId?: string) => {
    setLoading(true);
    setError('');
    try {
      const sessions = dataService.getCashBoxSessions();
      setAvailableSessions(sessions);
      const explicitSession = sessionId
        ? sessions.find((session) => session.id === sessionId) ?? null
        : null;
      const openSession = dataService.getCurrentCashBoxSession();
      
      // Para cajeros, mostrar su propia sesión abierta o la última cerrada
      // Para admins, mostrar cualquier sesión o la última cerrada
      let fallbackClosed = null;
      if (currentUser.role === 'ADMIN') {
        fallbackClosed = sessions.find((session) => session.status === 'CLOSED') ?? null;
      } else if (currentUser.role === 'CAJERO') {
        // Para cajeros, buscar su propia sesión cerrada más reciente
        fallbackClosed = sessions
          .filter((session) => session.status === 'CLOSED' && session.userId === currentUser.id)
          .sort((a, b) => b.closeDate.localeCompare(a.closeDate))[0] ?? null;
      }
      
      const session = explicitSession ?? openSession ?? fallbackClosed;
      setCurrentSession(session);
      if (!session) {
        setSessionSummary(null);
        setDeclaredBreakdown([]);
        return;
      }

      const summary = await dataService.getCashBoxSessionSummary(session.id);
      setSessionSummary(summary);
      
      // Load enhanced audit data
      try {
        const enhanced = await dataService.getCashBoxEnhancedAudit(session.id);
        setEnhancedAudit(enhanced);
      } catch (enhancedErr) {
        console.warn('No se pudo cargar auditoría mejorada:', enhancedErr);
        setEnhancedAudit(null);
      }
      
      setSelectedSessionId(session.id);
      setStep(session.status === 'OPEN' ? 1 : 2);
      setDeclaredBreakdown(
        summary.declaredBreakdown.length > 0
          ? summary.declaredBreakdown
          : summary.systemBreakdown.map((line) => ({
              ...line,
              amountUSD: line.method === 'cash_usd' ? line.amountUSD : 0,
              amountVES: line.method === 'cash_ves' ? line.amountVES : 0,
              count: 0,
              note: ''
            }))
      );

      // Seed de líneas electrónicas para declaración:
      // - Si ya hay declaración persistida, respetar esos montos.
      // - Si no hay declaración, precargar SOLO los métodos afectados en sistema con monto 0
      //   para que el cajero los declare (sin exponer montos del sistema en cierre ciego).
      const seedKey = `${session.id}|${summary.declaredBreakdown.length > 0 ? 'DECLARED' : 'SYSTEM'}`;
      if (declarationSeedKeyRef.current !== seedKey) {
        const source = summary.declaredBreakdown.length > 0
          ? summary.declaredBreakdown
          : summary.systemBreakdown;
        const preserveAmounts = summary.declaredBreakdown.length > 0;
        setElectronicLines(buildElectronicDeclarationLinesFromBreakdown(source, preserveAmounts));
        declarationSeedKeyRef.current = seedKey;
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = dataService.subscribe(() => {
      void loadSessionData(selectedSessionId || undefined);
    });
    void loadSessionData(selectedSessionId || undefined);
    return unsubscribe;
  }, [selectedSessionId, currentUser.role, banks]);

  const updateDeclaredLine = (key: string, field: 'amountUSD' | 'amountVES' | 'note', value: number | string) => {
    setDeclaredBreakdown((prev) => prev.map((line) => {
      if (line.key !== key) return line;
      return {
        ...line,
        [field]: field === 'note' ? String(value ?? '') : Number(value ?? 0) || 0
      };
    }));
  };

  const updateCashDeclared = (method: 'cash_usd' | 'cash_ves', value: number) => {
    const numericValue = Number(value ?? 0) || 0;
    setDeclaredBreakdown((prev) => {
      const existing = prev.find((line) => line.method === method);
      const template = existing
        ?? sessionSummary?.systemBreakdown.find((line) => line.method === method)
        ?? {
          key: `${method}|||`,
          method,
          label: method === 'cash_usd' ? 'Efectivo $' : 'Efectivo Bs',
          bank: '',
          accountId: '',
          accountLabel: '',
          posTerminalId: '',
          posTerminalName: '',
          amountUSD: 0,
          amountVES: 0,
          count: 0,
          note: ''
        };
      if (!existing) {
        return [
          ...prev,
          {
            ...template,
            amountUSD: method === 'cash_usd' ? numericValue : 0,
            amountVES: method === 'cash_ves' ? numericValue : 0,
            count: numericValue > 0 ? 1 : 0
          }
        ];
      }
      return prev.map((line) => line.key === existing.key ? {
        ...line,
        amountUSD: method === 'cash_usd' ? numericValue : line.amountUSD,
        amountVES: method === 'cash_ves' ? numericValue : line.amountVES,
        count: numericValue > 0 ? Math.max(1, line.count) : 0
      } : line);
    });
  };

  // Crédito: líneas del sistema con method === 'credit'
  const systemCreditLines = (sessionSummary?.systemBreakdown ?? [])
    .filter(l => l.method === 'credit');
  const systemCreditTotal = systemCreditLines.reduce((s, l) => s + l.amountUSD, 0);
  const systemCreditCount = systemCreditLines.reduce((s, l) => s + l.count, 0);

  // Totales calculados desde UI
  const totalCashVES = billsVES.reduce((s, b) => s + b.denom * b.qty, 0);
  const totalCashUSD = billsUSD.reduce((s, b) => s + b.denom * b.qty, 0);
  const totalElecVES = electronicLines.reduce((s, l) => s + l.amountVES, 0);
  const totalElecUSD = electronicLines.reduce((s, l) => s + l.amountUSD, 0);
  const grandTotalVES = totalCashVES + totalElecVES;
  const grandTotalUSD = totalCashUSD + totalElecUSD;

  // helpers para líneas electrónicas
  const addElectronicLine = () => setElectronicLines(prev => [...prev, { id: Math.random().toString(36).slice(2), method: 'biopago', bankId: '', bankName: '', amountVES: 0, amountUSD: 0, othersType: '', note: '' }]);
  const removeElectronicLine = (id: string) => setElectronicLines(prev => prev.filter(l => l.id !== id));
  const updateElectronicLine = (id: string, patch: Partial<ElectronicLine>) => setElectronicLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));

  // helpers para denominaciones
  const DENOMS_VES = [10, 20, 50, 100, 200, 500];
  const DENOMS_USD = [1, 2, 5, 10, 20, 50, 100];
  const addBillVES = (denom: number) => setBillsVES(prev => { const ex = prev.find(b => b.denom === denom); return ex ? prev.map(b => b.denom === denom ? { ...b, qty: b.qty + 1 } : b) : [...prev, { denom, qty: 1 }]; });
  const addBillUSD = (denom: number) => setBillsUSD(prev => { const ex = prev.find(b => b.denom === denom); return ex ? prev.map(b => b.denom === denom ? { ...b, qty: b.qty + 1 } : b) : [...prev, { denom, qty: 1 }]; });
  const updateBillVES = (denom: number, qty: number) => setBillsVES(prev => prev.map(b => b.denom === denom ? { ...b, qty: Math.max(0, qty) } : b));
  const updateBillUSD = (denom: number, qty: number) => setBillsUSD(prev => prev.map(b => b.denom === denom ? { ...b, qty: Math.max(0, qty) } : b));
  const removeBillVES = (denom: number) => setBillsVES(prev => prev.filter(b => b.denom !== denom));
  const removeBillUSD = (denom: number) => setBillsUSD(prev => prev.filter(b => b.denom !== denom));

  useHotkeys({
    'F10': () => step === 1 ? setStep(2) : handleFinalize(),
    'Escape': () => setStep(1)
  });

  const openSessions = useMemo(
    () => availableSessions.filter(s => s.status === 'OPEN'),
    [availableSessions]
  );

  const systemTotals = sessionSummary ? {
    ves: sessionSummary.totalSystemVES,
    usd: sessionSummary.totalSystemUSD,
    transactions: sessionSummary.sales.length,
    reconciliationFuzzy: Math.max(0, 100 - Math.min(100, Math.abs(sessionSummary.differenceUSD) * 4 + Math.abs(sessionSummary.differenceVES) / 15)),
    operator: currentSession?.userName ?? currentUser.name,
    startTime: currentSession?.openTime ?? 'N/A',
    openDate: currentSession?.openDate ?? today
  } : {
    ves: 0,
    usd: 0,
    transactions: 0,
    reconciliationFuzzy: 0,
    operator: currentUser.name,
    startTime: 'N/A',
    openDate: today
  };

  // LIVE RECONCILIATION: recalcula en vivo la conciliación cruzando el systemBreakdown
  // con el breakdown declarado en UI (antes de que se persista closingDeclaredBreakdown).
  // Se usa mientras la sesión esté OPEN; si ya está CLOSED, el sessionSummary trae los
  // valores persistidos. Usa la misma clave reducida método|banco|moneda que dataService.
  const liveReconciliation = useMemo(() => {
    if (!sessionSummary) return null;
    const declared = buildDeclaredBreakdownFromUI();
    const systemBd = (sessionSummary.systemBreakdown ?? []).map((line: any) => {
      const method = String(line?.method ?? '').trim();
      const bank = String(line?.bank ?? '').trim();
      if ((method === 'cash_usd' || method === 'cash_ves') && !bank) {
        return { ...line, bank: resolveCashBankName(method as 'cash_usd' | 'cash_ves') };
      }
      return line;
    });
    const recKey = (l: any) =>
      `${String(l.method ?? '').trim()}|${String(l.bank ?? '').trim()}|${String(l.currency ?? '').trim()}`;

    const sysMap = new Map<string, any>();
    for (const l of systemBd) {
      const k = recKey(l);
      const ex = sysMap.get(k);
      if (ex) {
        ex.amountUSD += Number(l.amountUSD ?? 0) || 0;
        ex.amountVES += Number(l.amountVES ?? 0) || 0;
        ex.count += Number(l.count ?? 0) || 0;
      } else {
        sysMap.set(k, {
          ...l,
          amountUSD: Number(l.amountUSD ?? 0) || 0,
          amountVES: Number(l.amountVES ?? 0) || 0,
          count: Number(l.count ?? 0) || 0
        });
      }
    }
    const decMap = new Map<string, any>();
    for (const l of declared) {
      const k = recKey(l);
      const ex = decMap.get(k);
      if (ex) {
        ex.amountUSD += Number(l.amountUSD ?? 0) || 0;
        ex.amountVES += Number(l.amountVES ?? 0) || 0;
        ex.count += Number(l.count ?? 0) || 0;
      } else {
        decMap.set(k, {
          ...l,
          amountUSD: Number(l.amountUSD ?? 0) || 0,
          amountVES: Number(l.amountVES ?? 0) || 0,
          count: Number(l.count ?? 0) || 0
        });
      }
    }

    const allKeys = Array.from(new Set([...sysMap.keys(), ...decMap.keys()]));
    const lines = allKeys.map((k) => {
      const s = sysMap.get(k);
      const d = decMap.get(k);
      const currency: 'USD' | 'VES' = (s?.currency ?? d?.currency ?? 'USD') as 'USD' | 'VES';
      const sysUSD = Number(s?.amountUSD ?? 0) || 0;
      const sysVES = Number(s?.amountVES ?? 0) || 0;
      const decUSD = Number(d?.amountUSD ?? 0) || 0;
      const decVES = Number(d?.amountVES ?? 0) || 0;
      return {
        key: k,
        method: String(s?.method ?? d?.method ?? '').trim(),
        label: String(s?.label ?? d?.label ?? ''),
        currency,
        bank: String(s?.bank ?? d?.bank ?? '').trim(),
        accountId: String(s?.accountId ?? d?.accountId ?? '').trim(),
        accountLabel: String(s?.accountLabel ?? d?.accountLabel ?? '').trim(),
        posTerminalId: String(s?.posTerminalId ?? d?.posTerminalId ?? '').trim(),
        posTerminalName: String(s?.posTerminalName ?? d?.posTerminalName ?? '').trim(),
        systemAmountUSD: sysUSD,
        systemAmountVES: sysVES,
        declaredAmountUSD: decUSD,
        declaredAmountVES: decVES,
        differenceUSD: currency === 'USD' ? decUSD - sysUSD : 0,
        differenceVES: currency === 'VES' ? decVES - sysVES : 0,
        count: Number(s?.count ?? d?.count ?? 0) || 0
      };
    }).filter((line) => {
      const isVES = line.currency === 'VES';
      const sys = isVES ? Number(line.systemAmountVES ?? 0) || 0 : Number(line.systemAmountUSD ?? 0) || 0;
      const decl = isVES ? Number(line.declaredAmountVES ?? 0) || 0 : Number(line.declaredAmountUSD ?? 0) || 0;
      const diff = isVES ? Number(line.differenceVES ?? 0) || 0 : Number(line.differenceUSD ?? 0) || 0;
      return Math.abs(sys) > 0.000001 || Math.abs(decl) > 0.000001 || Math.abs(diff) > 0.000001;
    }).sort((a, b) => {
      const cmp = String(a.label).localeCompare(String(b.label));
      if (cmp !== 0) return cmp;
      return (a.currency === 'USD' ? 0 : 1) - (b.currency === 'USD' ? 0 : 1);
    });

    const declaredForTotals = declared.filter((line) => !excludeFromCashTotals(line));
    const totalDeclaredUSD = declaredForTotals.reduce((acc, l) => acc + (Number(l.amountUSD ?? 0) || 0), 0);
    const totalDeclaredVES = declaredForTotals.reduce((acc, l) => acc + (Number(l.amountVES ?? 0) || 0), 0);
    return {
      lines,
      totalDeclaredUSD,
      totalDeclaredVES,
      differenceUSD: totalDeclaredUSD - (Number(sessionSummary.totalSystemUSD ?? 0) || 0),
      differenceVES: totalDeclaredVES - (Number(sessionSummary.totalSystemVES ?? 0) || 0)
    };
  }, [sessionSummary, billsVES, billsUSD, electronicLines, declaredCreditAmountUSD, declaredCreditCount]);

  const canFinalize = currentSession?.status === 'OPEN';
  const declaredTotals = sessionSummary
    ? (canFinalize && liveReconciliation
      ? {
          usd: Number(liveReconciliation.totalDeclaredUSD ?? 0) || 0,
          ves: Number(liveReconciliation.totalDeclaredVES ?? 0) || 0
        }
      : {
          usd: Number(sessionSummary.totalDeclaredUSD ?? 0) || 0,
          ves: Number(sessionSummary.totalDeclaredVES ?? 0) || 0
        })
    : {
        usd: grandTotalUSD + declaredCreditAmountUSD,
        ves: grandTotalVES
      };

  const declaredDenominations = useMemo(() => {
    const toMap = (entries: BillEntry[]) => {
      const map = new Map<number, { qty: number; total: number }>();
      for (const entry of entries) {
        const denom = Number(entry.denom ?? 0) || 0;
        const qty = Number(entry.qty ?? 0) || 0;
        if (denom <= 0 || qty < 0) continue;
        map.set(denom, { qty, total: denom * qty });
      }
      return map;
    };
    const vesMap = toMap(billsVES);
    const usdMap = toMap(billsUSD);
    const totalVes = Array.from(vesMap.values()).reduce((sum, item) => sum + item.total, 0);
    const totalUsd = Array.from(usdMap.values()).reduce((sum, item) => sum + item.total, 0);
    return {
      VES: vesMap,
      USD: usdMap,
      totalVES: totalVes,
      totalUSD: totalUsd
    };
  }, [billsVES, billsUSD]);

  const varianzaVES = declaredTotals.ves - systemTotals.ves;
  const varianzaUSD = declaredTotals.usd - systemTotals.usd;
  const hasVarianza = Math.abs(varianzaVES) > 1 || Math.abs(varianzaUSD) > 0.05;
  const isSupervisor = currentUser.role === 'ADMIN';
  const showAudit = isSupervisor && step === 2;

  const handleFinalize = async () => {
    if (!currentSession) {
      setError('No hay una sesión de caja abierta');
      return;
    }
    if (currentSession.status !== 'OPEN') {
      setError('La sesión seleccionada ya está cerrada');
      return;
    }

    setIsFinalizing(true);
    setError('');
    const finalBreakdown = buildDeclaredBreakdownFromUI();
    const sessionIdBeforeClose = currentSession.id;
    try {
      const closedSession = await dataService.closeCashBoxSession({
        finalAmountUSD: finalBreakdown.filter(l => l.method !== 'credit' && !excludeFromCashTotals(l)).reduce((s, l) => s + l.amountUSD, 0),
        finalAmountVES: finalBreakdown.filter((l) => !excludeFromCashTotals(l)).reduce((s, l) => s + l.amountVES, 0),
        declaredBreakdown: finalBreakdown,
        note: explanation,
        rateBCV: exchangeRateBCV,
        rateParallel: exchangeRateParallel,
        rateInternal: exchangeRateInternal
      });
      // Update local state immediately from the returned session — don't
      // wait for the Firestore snapshot which may arrive late
      setCurrentSession(closedSession);
      
      // Limpiar historial de ventas de localStorage del turno cerrado
      try {
        localStorage.removeItem(`cashbox_sales_${sessionIdBeforeClose}`);
      } catch (e) {
        console.error('Error clearing sales from localStorage:', e);
      }
      
      if (!isSupervisor) {
        setClosedSuccess(true);
      } else {
        // For supervisors reload summary from the now-closed session
        await loadSessionData(sessionIdBeforeClose);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFinalizing(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-700 pb-20">
        <div className="flex justify-center items-center h-96">
          <div className="text-slate-400">Cargando sesión de caja...</div>
        </div>
      </div>
    );
  }

  // Pantalla de \u00e9xito para cajeros tras cerrar
  if (closedSuccess && !isSupervisor) {
    return (
      <div className="max-w-xl mx-auto animate-in fade-in zoom-in-95 duration-700 pb-20 pt-10">
        <div className="bg-white rounded-[3rem] p-16 shadow-2xl border border-slate-100 text-center space-y-6">
          <div className="w-20 h-20 bg-emerald-100 rounded-[2rem] flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black tracking-tighter text-slate-900">Cierre Registrado</h2>
            <p className="text-slate-500 font-bold text-sm">Tu declaraci\u00f3n fue enviada correctamente al sistema.</p>
          </div>
          <div className="bg-slate-50 rounded-2xl p-5 text-left space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-bold text-slate-500">Efectivo + Electr\u00f3nicos Bs</span>
              <span className="font-black text-slate-900 font-mono">Bs {grandTotalVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-bold text-slate-500">Efectivo + Electr\u00f3nicos USD</span>
              <span className="font-black text-slate-900 font-mono">${grandTotalUSD.toFixed(2)}</span>
            </div>
            {declaredCreditAmountUSD > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="font-bold text-amber-600">Cr\u00e9dito declarado ({declaredCreditCount} fact.)</span>
                <span className="font-black text-amber-700 font-mono">${declaredCreditAmountUSD.toFixed(2)}</span>
              </div>
            )}
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">El supervisor revisar\u00e1 y validar\u00e1 el arqueo</p>
        </div>
      </div>
    );
  }

  if (!currentSession) {
    return (
      <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-700 pb-20">
        <div className="bg-white rounded-[3rem] p-16 shadow-sm border border-slate-200/50 text-center">
          <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-slate-900 mb-2">No hay sesi\u00f3n disponible</h2>
          <p className="text-slate-500">Abra una caja para iniciar arqueo o seleccione una sesi\u00f3n cerrada desde supervisi\u00f3n.</p>
        </div>
      </div>
    );
  }

  const recentSessions = availableSessions.slice(0, 12);
  const filteredSessions = availableSessions.filter((session) => {
    // Para cajeros, solo mostrar sus propias sesiones
    if (currentUser.role === 'CAJERO') {
      return session.userId === currentUser.id;
    }
    // Para admins, aplicar filtros de supervisor
    const cashierMatches = auditCashierFilter === 'ALL' || session.userId === auditCashierFilter;
    const dateMatches = !auditDateFilter || session.openDate === auditDateFilter || session.closeDate === auditDateFilter;
    return cashierMatches && dateMatches;
  }).slice(0, 24);
  const cashierOptions: { userId: string; userName: string }[] = [];
  const _cashierSeen = new Set<string>();
  for (const s of availableSessions) {
    if (!_cashierSeen.has(s.userId)) { _cashierSeen.add(s.userId); cashierOptions.push({ userId: s.userId, userName: s.userName }); }
  }
  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-12 duration-700 pb-20">
      <div className="flex justify-between items-start bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200/50">
        <div className="space-y-4">
          <div className="flex items-center gap-4">
             <div className="p-4 bg-slate-900 rounded-3xl shadow-xl shadow-slate-900/10">
                <Lock className="w-8 h-8 text-emerald-400" />
             </div>
             <div>
                <h2 className="font-headline text-4xl font-black tracking-tighter text-slate-900 text-left">{isSupervisor ? 'Auditoría de Cierre de Caja' : 'Declaración de Cierre de Caja'}</h2>
                <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-1 pl-1">{isSupervisor ? 'Supervisoría • Validación de Operador' : 'Operador • Declaración Ciega de Fondos'}</p>
             </div>
          </div>
          <div className="flex items-center gap-6 pl-1 pt-2">
             <div className="flex flex-col text-left">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Cajero de Turno</span>
                <span className="text-sm font-black text-slate-900 underline decoration-emerald-500 decoration-2 underline-offset-4">{systemTotals.operator}</span>
             </div>
             <div className="h-6 w-[1px] bg-slate-200"></div>
             <div className="flex flex-col text-left">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Fecha</span>
                <span className="text-sm font-black text-slate-900">{systemTotals.openDate}</span>
             </div>
             {isSupervisor && (
               <>
                 <div className="h-6 w-[1px] bg-slate-200"></div>
                 <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Primer Ticket</span>
                    <span className="text-sm font-black text-slate-900">{systemTotals.startTime}</span>
                 </div>
                 <div className="h-6 w-[1px] bg-slate-200"></div>
                 <div className="flex flex-col text-left">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none">Operaciones</span>
                    <span className="text-sm font-black text-slate-900">{systemTotals.transactions} Transacciones</span>
                 </div>
               </>
             )}
          </div>
          {/* Tasas de cambio: solo ADMIN */}
          {isSupervisor && (
            <div className="grid grid-cols-3 gap-3 pt-3 max-w-xl">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-left">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tasa BCV</div>
                <div className="text-sm font-black text-slate-900">Bs {Number(currentSession.closeRateBCV ?? currentSession.openRateBCV ?? exchangeRateBCV ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-left">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tasa Paralela</div>
                <div className="text-sm font-black text-slate-900">Bs {Number(currentSession.closeRateParallel ?? currentSession.openRateParallel ?? exchangeRateParallel ?? 0).toFixed(2)}</div>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-left">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tasa Interna</div>
                <div className="text-sm font-black text-slate-900">Bs {Number(currentSession.closeRateInternal ?? currentSession.openRateInternal ?? exchangeRateInternal ?? 0).toFixed(2)}</div>
              </div>
            </div>
          )}
          {/* FEAT-10: Panel de cajas abiertas para ADMIN */}
          {isSupervisor && (
            <div className="pt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cajas activas ahora</span>
                  <span className={`px-2 py-0.5 rounded-full text-[8px] font-black ${openSessions.length > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                    {openSessions.length} abierta{openSessions.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      if (!window.confirm('¿Cerrar automáticamente todas las sesiones huérfanas (abiertas hace más de 24h)?')) return;
                      setSanitizing(true);
                      setSanitizeResult(null);
                      try {
                        const r = await dataService.sanitizeOrphanSessions(1);
                        setSanitizeResult(r.fixed > 0 ? `✓ ${r.fixed} sesión(es) saneadas` : 'Sin sesiones huérfanas');
                      } catch (e: any) {
                        setSanitizeResult(`Error: ${e.message}`);
                      } finally {
                        setSanitizing(false);
                      }
                    }}
                    disabled={sanitizing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
                  >
                    <X className="w-3 h-3" /> {sanitizing ? 'Saneando...' : 'Corregir Cierre de Caja'}
                  </button>
                  <button
                    onClick={() => setShowOpenCashboxModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900 hover:bg-indigo-800 text-white rounded-xl text-[8px] font-black uppercase tracking-widest transition-all"
                  >
                    <UserPlus className="w-3 h-3" /> Abrir caja para usuario
                  </button>
                </div>
                {sanitizeResult && (
                  <p className={`text-[8px] font-black mt-1 ${sanitizeResult.startsWith('✓') ? 'text-emerald-600' : 'text-red-600'}`}>{sanitizeResult}</p>
                )}
              </div>
              {openSessions.length === 0 ? (
                <p className="text-[9px] font-bold text-slate-400 bg-slate-50 rounded-xl px-4 py-3">No hay cajas abiertas en este momento.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {openSessions.map(s => (
                    <div key={s.id} className={`flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-all cursor-pointer ${
                      selectedSessionId === s.id
                        ? 'bg-indigo-50 border-indigo-300'
                        : 'bg-white border-slate-200 hover:border-indigo-200'
                    }`}
                      onClick={() => setSelectedSessionId(s.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] font-black text-slate-900 uppercase truncate">{s.userName}</p>
                        <p className="text-[8px] font-bold text-slate-400 truncate">{s.stationName || s.id.slice(0, 10).toUpperCase()}</p>
                        <p className="text-[8px] font-mono text-slate-400">{s.openDate} · {s.openTime}</p>
                      </div>
                      <span className="shrink-0 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Modal apertura de caja para otro usuario */}
          {showOpenCashboxModal && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[600] flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-indigo-900 px-6 py-5 flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Multi-Caja</p>
                    <p className="text-white font-black text-base">Abrir caja para usuario</p>
                  </div>
                  <button onClick={() => setShowOpenCashboxModal(false)} className="p-1.5 hover:bg-indigo-800 rounded-lg">
                    <X className="w-4 h-4 text-indigo-200" />
                  </button>
                </div>
                <div className="p-6 space-y-4">
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nombre del cajero</label>
                    <input
                      type="text" value={newCashboxUserName} onChange={e => setNewCashboxUserName(e.target.value)}
                      placeholder="Ej: María González"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-bold text-slate-900 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">ID de usuario (login)</label>
                    <input
                      type="text" value={newCashboxUserId} onChange={e => setNewCashboxUserId(e.target.value)}
                      placeholder="Ej: user_cajero2"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-mono text-slate-900 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nombre de caja / estación</label>
                    <input
                      type="text" value={newCashboxStation} onChange={e => setNewCashboxStation(e.target.value)}
                      placeholder="Ej: Caja 2, Mostrador Norte"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[11px] font-bold text-slate-900 outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efectivo inicial USD</label>
                      <input type="number" min={0} step={0.01} value={newCashboxUSD || ''} onChange={e => setNewCashboxUSD(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-mono text-slate-900 outline-none focus:border-indigo-400"
                        placeholder="0.00" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efectivo inicial Bs.</label>
                      <input type="number" min={0} step={0.01} value={newCashboxVES || ''} onChange={e => setNewCashboxVES(parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-[11px] font-mono text-slate-900 outline-none focus:border-indigo-400"
                        placeholder="0.00" />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => setShowOpenCashboxModal(false)} disabled={openingCashbox}
                      className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all">
                      Cancelar
                    </button>
                    <button
                      disabled={openingCashbox || !newCashboxUserId.trim() || !newCashboxUserName.trim()}
                      onClick={async () => {
                        if (!newCashboxUserId.trim() || !newCashboxUserName.trim()) return;
                        setOpeningCashbox(true);
                        try {
                          await dataService.openCashBox({
                            initialAmountUSD: newCashboxUSD,
                            initialAmountVES: newCashboxVES,
                            stationName: newCashboxStation.trim() || '',
                            userId: newCashboxUserId.trim(),
                            userName: newCashboxUserName.trim(),
                            rateBCV: exchangeRateBCV,
                            rateParallel: exchangeRateParallel,
                            rateInternal: exchangeRateInternal,
                          });
                          setNewCashboxUserId(''); setNewCashboxUserName(''); setNewCashboxStation(''); setNewCashboxUSD(0); setNewCashboxVES(0);
                          setShowOpenCashboxModal(false);
                        } catch (e: any) {
                          alert(e.message);
                        } finally {
                          setOpeningCashbox(false);
                        }
                      }}
                      className="flex-1 py-2.5 bg-indigo-900 hover:bg-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                    >
                      {openingCashbox ? 'Abriendo...' : <><UserPlus className="w-3.5 h-3.5" /> Abrir caja</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Selector de sesiones: ADMIN con filtros, cajero sin nada */}
          {isSupervisor && availableSessions.length > 0 && (
            <div className="pt-3">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">Supervisión de sesiones</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <select
                  value={auditCashierFilter}
                  onChange={(e) => setAuditCashierFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                >
                  <option value="ALL">Todos los cajeros</option>
                  {cashierOptions.map((option) => (
                    <option key={option.userId} value={option.userId}>{option.userName}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={auditDateFilter}
                  onChange={(e) => setAuditDateFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                />
                <select
                  value={selectedSessionId}
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold text-slate-900 outline-none"
                >
                  {filteredSessions.length === 0 ? (
                    <option value="">Sin sesiones para el filtro</option>
                  ) : filteredSessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.openDate} • {session.userName} • {session.status === 'OPEN' ? 'ABIERTA' : 'CERRADA'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-3 bg-emerald-50/50 p-6 rounded-3xl border border-emerald-100">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span className="text-emerald-900 text-[11px] font-black uppercase tracking-widest">{new Date().toLocaleTimeString()}</span>
          </div>
          <div className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shadow-lg ${canFinalize ? 'bg-emerald-900 text-white shadow-emerald-900/20' : 'bg-slate-900 text-white shadow-slate-900/20'}`}>
            {canFinalize ? 'Sesión Abierta' : 'Sesión Cerrada'}
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 rounded-[2rem] px-6 py-4 text-sm font-bold">
          {error}
        </div>
      )}

      <div className="bg-white rounded-[4rem] p-16 shadow-2xl border border-slate-100 relative overflow-hidden">
        {step === 1 ? (
          <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in-95 duration-500">
            {/* Header */}
            <div className="text-center space-y-1">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto">
                <ShieldCheck className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-2xl font-black tracking-tighter text-slate-900">Declaración de Cierre</h3>
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Declare el efectivo por denominación y cada pago electrónico por banco</p>
            </div>

            {/* ===== EFECTIVO Bs ===== */}
            <CashDenomSection
              currency="VES"
              bills={billsVES}
              denoms={DENOMS_VES}
              onAdd={addBillVES}
              onUpdate={updateBillVES}
              onRemove={removeBillVES}
              disabled={!canFinalize}
            />

            {/* ===== EFECTIVO USD ===== */}
            <CashDenomSection
              currency="USD"
              bills={billsUSD}
              denoms={DENOMS_USD}
              onAdd={addBillUSD}
              onUpdate={updateBillUSD}
              onRemove={removeBillUSD}
              disabled={!canFinalize}
            />

            {/* ===== PAGOS ELECTRÓNICOS ===== */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-slate-400" />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Pagos Electrónicos / Digitales</span>
                </div>
                <button
                  onClick={addElectronicLine}
                  disabled={!canFinalize}
                  className="flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 hover:bg-emerald-100 transition-all disabled:opacity-40"
                >
                  <Plus className="w-3 h-3" /> Agregar línea
                </button>
              </div>

              {electronicLines.length === 0 && (
                <div className="text-center py-6 text-slate-400 text-xs font-bold border-2 border-dashed border-slate-200 rounded-2xl">
                  Sin pagos electrónicos — pulse "Agregar línea" si recibió alguno
                </div>
              )}

              <div className="space-y-3">
                {electronicLines.map((line) => (
                  <ElectronicLineInput
                    key={line.id}
                    line={line}
                    banks={banks}
                    methodCurrency={METHOD_CURRENCY_MAP}
                    methodLabel={METHOD_LABEL}
                    methodIcon={METHOD_ICON}
                    onChange={(patch: Partial<ElectronicLine>) => updateElectronicLine(line.id, patch)}
                    onRemove={() => removeElectronicLine(line.id)}
                    disabled={!canFinalize}
                  />
                ))}
              </div>

              {electronicLines.length > 0 && (
                <div className="flex justify-end gap-6 pr-2 pt-1">
                  {totalElecVES > 0 && <span className="text-xs font-black text-slate-600">Total Bs: <span className="font-mono">{totalElecVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}</span></span>}
                  {totalElecUSD > 0 && <span className="text-xs font-black text-slate-600">Total USD: <span className="font-mono">${totalElecUSD.toFixed(2)}</span></span>}
                </div>
              )}
            </div>

            {/* ===== CRÉDITO ===== */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CreditCard className="w-4 h-4 text-slate-400" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Ventas a Crédito (no impactan caja física)</span>
              </div>
              <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl p-5 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-amber-900">Facturas a Crédito Emitidas</p>
                    <p className="text-xs text-amber-600 font-bold mt-0.5">Declare cuántas facturas emitió y el monto total</p>
                  </div>
                  {systemCreditCount > 0 && (
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Sistema registra</div>
                      <div className="text-sm font-black text-amber-800">{systemCreditCount} fact. · ${systemCreditTotal.toFixed(2)}</div>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider">N° Facturas</label>
                    <input type="number" min="0"
                      value={declaredCreditCount || ''}
                      onChange={(e) => setDeclaredCreditCount(Number(e.target.value) || 0)}
                      placeholder="0" disabled={!canFinalize}
                      className="w-full bg-white border-2 border-amber-200 rounded-xl px-4 py-3 text-xl font-black text-amber-900 text-center outline-none focus:border-amber-400 transition-all disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Monto Total USD</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-amber-500 font-black text-sm">$</span>
                      <input type="number" min="0" step="0.01"
                        value={declaredCreditAmountUSD || ''}
                        onChange={(e) => setDeclaredCreditAmountUSD(Number(e.target.value) || 0)}
                        placeholder="0.00" disabled={!canFinalize}
                        className="w-full bg-white border-2 border-amber-200 rounded-xl pl-8 pr-4 py-3 text-xl font-black text-amber-900 text-right outline-none focus:border-amber-400 transition-all disabled:opacity-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== RESUMEN TOTAL ===== */}
            <div className="bg-slate-900 rounded-2xl p-5 grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Efectivo + Elect. Bs</div>
                <div className="text-lg font-black text-white font-mono">Bs {grandTotalVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">{totalCashVES > 0 ? `Ef: Bs ${totalCashVES.toLocaleString('es-VE')}` : ''}</div>
              </div>
              <div className="text-center border-x border-slate-700">
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Efectivo + Elect. $</div>
                <div className="text-lg font-black text-white font-mono">${grandTotalUSD.toFixed(2)}</div>
                <div className="text-[9px] text-slate-500 font-mono mt-0.5">{totalCashUSD > 0 ? `Ef: $${totalCashUSD.toFixed(2)}` : ''}</div>
              </div>
              <div className="text-center">
                <div className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">Crédito</div>
                <div className="text-lg font-black text-amber-300 font-mono">${declaredCreditAmountUSD.toFixed(2)}</div>
              </div>
            </div>

            {isSupervisor ? (
              <button
                onClick={() => setStep(2)}
                className="w-full bg-slate-900 text-white py-7 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/30 flex items-center justify-center gap-4 active:scale-95 group"
              >
                Ver Auditoría Completa <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
              </button>
            ) : (
              <button
                onClick={handleFinalize}
                disabled={isFinalizing || !canFinalize}
                className="w-full bg-emerald-600 text-white py-7 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] hover:bg-emerald-500 transition-all shadow-2xl shadow-emerald-600/30 flex items-center justify-center gap-4 active:scale-95 group disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFinalizing ? (
                  <><div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" /> Procesando...</>
                ) : (
                  <><Lock className="w-5 h-5" /> Confirmar y Cerrar Caja</>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-12 animate-in slide-in-from-right-12 duration-700">
            {showAudit ? (
              <>
                <div className="grid grid-cols-3 gap-10">
                  <ResultCard title="SISTEMA (VES)" value={systemTotals.ves} variant="neutral" currency="VES" />
                  <ResultCard title="DECLARADO (VES)" value={declaredTotals.ves} variant="info" currency="VES" />
                  <ResultCard title="VARIANZA (VES)" value={varianzaVES} variant={Math.abs(varianzaVES) < 1 ? 'success' : 'error'} currency="VES" />
                </div>

                <div className="grid grid-cols-3 gap-10">
                  <ResultCard title="SISTEMA (USD)" value={systemTotals.usd} variant="neutral" currency="USD" />
                  <ResultCard title="DECLARADO (USD)" value={declaredTotals.usd} variant="info" currency="USD" />
                  <ResultCard title="VARIANZA (USD)" value={varianzaUSD} variant={Math.abs(varianzaUSD) < 0.05 ? 'success' : 'error'} currency="USD" />
                </div>
              </>
            ) : (
              <div className="space-y-8">
                {/* Cierre ciego para cajeros */}
                {!isSupervisor && (
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-[3rem] p-8 text-center">
                    <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
                    <h3 className="text-xl font-black text-amber-900 mb-2">Cierre Ciego Activado</h3>
                    <p className="text-amber-700 text-sm font-bold">
                      El cierre del operador se registra en modo confidencial y será revisado por auditoría.
                    </p>
                  </div>
                )}

                {/* Totales declarados */}
                <div className="grid grid-cols-2 gap-10">
                  <ResultCard title="DECLARADO (VES)" value={declaredTotals.ves} variant="info" currency="VES" />
                  <ResultCard title="DECLARADO (USD)" value={declaredTotals.usd} variant="info" currency="USD" />
                </div>

                {/* Totales del sistema (solo supervisor/admin) */}
                {isSupervisor && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-10">
                      <ResultCard title="SISTEMA (VES)" value={systemTotals.ves} variant="neutral" currency="VES" />
                      <ResultCard title="SISTEMA (USD)" value={systemTotals.usd} variant="neutral" currency="USD" />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-10">
                      <ResultCard title="VARIANZA (VES)" value={varianzaVES} variant={Math.abs(varianzaVES) < 1 ? 'success' : 'error'} currency="VES" />
                      <ResultCard title="VARIANZA (USD)" value={varianzaUSD} variant={Math.abs(varianzaUSD) < 0.05 ? 'success' : 'error'} currency="USD" />
                    </div>
                  </div>
                )}
              </div>
            )}

            {sessionSummary && showAudit && (
              <div className="bg-slate-50 rounded-[3rem] p-10 space-y-8">
                <h3 className="text-2xl font-black text-slate-900 text-center uppercase tracking-tighter">Resumen Auditado de Sesión</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white rounded-2xl p-6 border border-slate-200">
                    <div className="flex items-center gap-3 text-emerald-600 mb-3">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Ventas</span>
                    </div>
                    <div className="space-y-2">
                      <div className="text-2xl font-black text-slate-900">{sessionSummary.sales.length}</div>
                      <div className="text-sm font-bold text-slate-500">Transacciones</div>
                      <div className="text-lg font-mono font-black text-emerald-600">$ {sessionSummary.totalSalesUSD.toFixed(2)}</div>
                      <div className="text-sm font-mono font-bold text-slate-500">Bs {sessionSummary.totalSalesVES.toFixed(2)}</div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-slate-200">
                    <div className="flex items-center gap-3 text-blue-600 mb-3">
                      <Package className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Inventario</span>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                      {Object.entries(sessionSummary.inventoryMovements.reduce((acc, m) => {
                        const u = String(m.unit || 'Und').trim().toUpperCase();
                        acc[u] = (acc[u] || 0) + m.qtyOut;
                        return acc;
                      }, {} as Record<string, number>)).map(([unit, qty]) => (
                        <div key={unit} className="flex justify-between items-end border-b border-slate-50 pb-1">
                           <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{unit}</span>
                           <span className="text-sm font-black text-slate-900 leading-none">{(qty as number).toFixed(1)}</span>
                        </div>
                      ))}
                      <div className="pt-2 text-[8px] font-black text-slate-400 uppercase tracking-widest text-center border-t border-slate-100 mt-2">
                        {sessionSummary.inventoryMovements.length} SKUs afectados
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl p-6 border border-slate-200">
                    <div className="flex items-center gap-3 text-purple-600 mb-3">
                      <DollarSign className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Métodos</span>
                    </div>
                    <div className="space-y-2 max-h-32 overflow-y-auto">
                      {sessionSummary.systemBreakdown
                        .filter((line) => (Math.abs(Number(line.amountUSD ?? 0)) > 0.000001 || Math.abs(Number(line.amountVES ?? 0)) > 0.000001 || Number(line.count ?? 0) > 0))
                        .map((line) => (
                        <div key={line.key} className="flex justify-between items-center gap-4">
                          <span className="text-xs font-black text-slate-600 uppercase">{line.label}{line.bank ? ` • ${line.bank}` : ''}</span>
                          <span className="text-sm font-mono font-bold text-slate-900">$ {line.amountUSD.toFixed(2)} / Bs {line.amountVES.toFixed(2)} <span className="text-[10px] text-slate-400">({line.count} ops)</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Conciliación por Método</h4>
                  
                  {/* Tabs for different audit views */}
                  {enhancedAudit && (
                    <div className="flex gap-2 mb-4 overflow-x-auto">
                      <button
                        onClick={() => setActiveAuditTab('reconciliation')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activeAuditTab === 'reconciliation' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Conciliación
                      </button>
                      <button
                        onClick={() => setActiveAuditTab('payments')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activeAuditTab === 'payments' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Pagos Detallados
                      </button>
                      <button
                        onClick={() => setActiveAuditTab('accounting')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activeAuditTab === 'accounting' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Impacto Contable
                      </button>
                      <button
                        onClick={() => setActiveAuditTab('denominations')}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                          activeAuditTab === 'denominations' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        Billetes
                      </button>
                    </div>
                  )}
                  
                  {/* Reconciliation Tab */}
                  {(!enhancedAudit || activeAuditTab === 'reconciliation') && (
                    <div className="space-y-2">
                      {/* Header */}
                      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 px-3 pb-1 border-b-2 border-slate-200">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Método / Banco</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Sistema</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Declarado</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Diferencia</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center w-12">Moneda</div>
                      </div>
                      {(canFinalize && liveReconciliation ? liveReconciliation.lines : sessionSummary.reconciliationLines).map((line: any) => {
                        const isVES = line.currency === 'VES';
                        const sysAmt = isVES ? line.systemAmountVES : line.systemAmountUSD;
                        const declAmt = isVES ? line.declaredAmountVES : line.declaredAmountUSD;
                        const diff = isVES ? line.differenceVES : line.differenceUSD;
                        const ok = Math.abs(diff) < (isVES ? 1 : 0.05);
                        const fmt = (v: number) => isVES
                          ? `Bs ${v.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`
                          : `$ ${v.toFixed(2)}`;
                        return (
                          <div key={line.key} className={`grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-2 items-center px-3 py-2.5 rounded-xl transition-all ${
                            ok ? 'bg-slate-50 hover:bg-slate-100' : 'bg-red-50 hover:bg-red-100 border border-red-200'
                          }`}>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap leading-tight">
                                <span className="text-sm font-black text-slate-900 uppercase">{line.label}</span>
                                {line.bank && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[9px] font-black uppercase tracking-wider border border-emerald-200">
                                    <Building2 className="w-2.5 h-2.5" />
                                    {line.bank}
                                  </span>
                                )}
                                {!line.bank && line.accountLabel && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-wider border border-slate-200">
                                    {line.accountLabel}
                                  </span>
                                )}
                              </div>
                              {line.count > 0 && (
                                <div className="text-[10px] font-bold text-slate-400 mt-0.5">{line.count} ops</div>
                              )}
                            </div>
                            <div className="text-sm font-mono font-bold text-slate-700 text-right">{fmt(sysAmt)}</div>
                            <div className="text-sm font-mono font-bold text-slate-700 text-right">{fmt(declAmt)}</div>
                            <div className={`text-sm font-mono font-black text-right ${ok ? 'text-emerald-600' : 'text-red-600'}`}>
                              {diff >= 0 ? '+' : ''}{fmt(diff)}
                            </div>
                            <div className="flex justify-center w-12">
                              <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                isVES ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                              }`}>{isVES ? 'Bs' : 'USD'}</span>
                            </div>
                          </div>
                        );
                      })}
                      {/* Totales separados por moneda */}
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <div className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-1">Total Bolívares (Bs)</div>
                          <div className="flex justify-between text-xs font-bold text-blue-900">
                            <span>Sistema</span><span className="font-mono">{sessionSummary.totalSystemVES.toLocaleString('es-VE', {minimumFractionDigits:2})}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold text-blue-900">
                            <span>Declarado</span><span className="font-mono">{(canFinalize && liveReconciliation ? liveReconciliation.totalDeclaredVES : sessionSummary.totalDeclaredVES).toLocaleString('es-VE', {minimumFractionDigits:2})}</span>
                          </div>
                          <div className={`flex justify-between text-xs font-black mt-1 pt-1 border-t border-blue-200 ${
                            Math.abs(canFinalize && liveReconciliation ? liveReconciliation.differenceVES : sessionSummary.differenceVES) < 1 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            <span>Diferencia</span><span className="font-mono">{(canFinalize && liveReconciliation ? liveReconciliation.differenceVES : sessionSummary.differenceVES) >= 0 ? '+' : ''}{(canFinalize && liveReconciliation ? liveReconciliation.differenceVES : sessionSummary.differenceVES).toLocaleString('es-VE', {minimumFractionDigits:2})}</span>
                          </div>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <div className="text-[9px] font-black text-amber-500 uppercase tracking-widest mb-1">Total Dólares (USD)</div>
                          <div className="flex justify-between text-xs font-bold text-amber-900">
                            <span>Sistema</span><span className="font-mono">$ {sessionSummary.totalSystemUSD.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs font-bold text-amber-900">
                            <span>Declarado</span><span className="font-mono">$ {(canFinalize && liveReconciliation ? liveReconciliation.totalDeclaredUSD : sessionSummary.totalDeclaredUSD).toFixed(2)}</span>
                          </div>
                          <div className={`flex justify-between text-xs font-black mt-1 pt-1 border-t border-amber-200 ${
                            Math.abs(canFinalize && liveReconciliation ? liveReconciliation.differenceUSD : sessionSummary.differenceUSD) < 0.05 ? 'text-emerald-700' : 'text-red-700'
                          }`}>
                            <span>Diferencia</span><span className="font-mono">{(canFinalize && liveReconciliation ? liveReconciliation.differenceUSD : sessionSummary.differenceUSD) >= 0 ? '+' : ''}$ {(canFinalize && liveReconciliation ? liveReconciliation.differenceUSD : sessionSummary.differenceUSD).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Payments Detail Tab */}
                  {enhancedAudit && activeAuditTab === 'payments' && (
                    <div className="space-y-6">
                      {/* Credit Sales Summary */}
                      {enhancedAudit.creditSales.invoices.length > 0 && (
                        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                          <h5 className="text-sm font-black text-amber-900 uppercase tracking-wider mb-3">
                            Ventas a Crédito con Abonos
                          </h5>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span className="font-bold text-amber-700">Total Crédito Emitido:</span>
                              <span className="font-mono font-black text-amber-900">$ {enhancedAudit.creditSales.totalCreditIssuedUSD.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className="font-bold text-amber-700">Abonos Recibidos:</span>
                              <span className="font-mono font-black text-emerald-600">$ {enhancedAudit.creditSales.totalDownPaymentsReceivedUSD.toFixed(2)}</span>
                            </div>
                          </div>
                          <div className="mt-3 max-h-32 overflow-y-auto">
                            {enhancedAudit.creditSales.invoices.map((inv) => (
                              <div key={inv.saleId} className="flex justify-between py-1 text-xs border-b border-amber-200/50 last:border-0">
                                <span className="font-bold text-amber-800">{inv.correlativo} • {inv.customerName}</span>
                                <span className="font-mono">
                                  Total: ${inv.totalUSD.toFixed(2)} | 
                                  Abono: <span className="text-emerald-600">${inv.downPaymentUSD.toFixed(2)}</span> | 
                                  Resta: <span className="text-red-600">${inv.remainingUSD.toFixed(2)}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Débitos / Retiros de Caja */}
                      {(() => {
                        const debits = enhancedAudit.payments.filter(p => p.saleId === 'DEBIT_WITHDRAWAL');
                        if (debits.length === 0) return null;
                        const totalDebitUSD = debits.reduce((s, p) => s + Math.abs(p.amountUSD), 0);
                        return (
                          <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                            <h5 className="text-sm font-black text-red-800 uppercase tracking-wider mb-3 flex items-center gap-2">
                              <span>↓</span> Débitos / Retiros de Caja
                            </h5>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {debits.map((d, idx) => (
                                <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-red-100 last:border-0">
                                  <div>
                                    <span className="font-bold text-red-800 uppercase">{d.note || 'Retiro sin motivo'}</span>
                                    <span className="ml-2 text-red-500 font-bold">{d.actorUserName ?? d.customerName}</span>
                                  </div>
                                  <span className="font-mono font-black text-red-700">
                                    {d.currency === 'VES' ? `Bs ${Math.abs(d.amountVES).toFixed(2)}` : `$${Math.abs(d.amountUSD).toFixed(2)}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-between pt-2 mt-1 border-t border-red-200">
                              <span className="text-xs font-black text-red-700 uppercase">Total Retirado</span>
                              <span className="text-sm font-mono font-black text-red-700">- ${totalDebitUSD.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Bank -> Method -> Currency Breakdown */}
                      <div>
                        <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">
                          Desglose Banco → Método → Moneda
                        </h5>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {enhancedAudit.bankMethodBreakdown.map((breakdown, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                              <div className="flex justify-between items-start">
                                <div>
                                  <div className="text-sm font-black text-slate-900">
                                    {breakdown.bankName} → {breakdown.method.toUpperCase()}
                                  </div>
                                  <div className="text-xs font-bold text-slate-500">{breakdown.accountLabel}</div>
                                </div>
                                <div className="text-right">
                                  {breakdown.currency === 'VES' ? (
                                    <>
                                      <div className="text-sm font-mono font-black text-slate-900">
                                        Bs {breakdown.amountVES.toFixed(2)}
                                      </div>
                                      <div className="text-xs font-mono text-slate-500">
                                        ≈ $ {breakdown.equivalentUSD.toFixed(2)} USD
                                      </div>
                                      {breakdown.transactions[0]?.rateUsed > 0 && (
                                        <div className="text-xs font-mono text-emerald-600">
                                          Tasa: Bs {breakdown.transactions[0].rateUsed.toFixed(2)}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    <div className="text-sm font-mono font-black text-slate-900">
                                      $ {breakdown.amountUSD.toFixed(2)} USD
                                    </div>
                                  )}
                                  <div className="text-xs font-bold text-slate-400">{breakdown.transactionCount} transacciones</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Accounting Impact Tab */}
                  {enhancedAudit && activeAuditTab === 'accounting' && (
                    <div className="space-y-3">
                      <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                        Impacto en Cuentas Contables / Bancarias
                      </h5>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {enhancedAudit.accountingImpact.map((impact, idx) => (
                          <div key={idx} className={`p-3 rounded-xl border ${
                            impact.accountType === 'CASH' 
                              ? 'bg-emerald-50 border-emerald-200' 
                              : 'bg-blue-50 border-blue-200'
                          }`}>
                            <div className="flex justify-between items-start">
                              <div>
                                <div className={`text-sm font-black ${
                                  impact.accountType === 'CASH' ? 'text-emerald-900' : 'text-blue-900'
                                }`}>
                                  {impact.accountType === 'CASH' ? '💰' : '🏦'} {impact.accountName}
                                </div>
                                <div className="text-xs font-bold text-slate-500">
                                  {impact.accountType === 'CASH' ? 'Efectivo en Caja' : `Cuenta Bancaria`}
                                </div>
                              </div>
                              <div className="text-right">
                                {impact.currency === 'VES' ? (
                                  <div className="text-sm font-mono font-black text-slate-900">
                                    Bs {impact.amountVES.toFixed(2)}
                                  </div>
                                ) : (
                                  <div className="text-sm font-mono font-black text-slate-900">
                                    $ {impact.amountUSD.toFixed(2)}
                                  </div>
                                )}
                                <div className="text-xs font-bold text-slate-400">{impact.transactionCount} ops</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 p-3 bg-slate-100 rounded-xl">
                        <p className="text-xs font-bold text-slate-600">
                          💡 Este resumen facilita la conciliación bancaria manual. Cada monto indica la cuenta contable o bancaria donde debe registrarse.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Denominations Report Tab */}
                  {activeAuditTab === 'denominations' && sessionSummary.denominationReport && (
                    <div className="space-y-4">
                      {/* Bolívares */}
                      {sessionSummary.denominationReport.VES.length > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-xs font-black text-blue-800 uppercase tracking-widest">Denominaciones Bs — Flujo de Caja</h5>
                            <span className="text-xs font-black text-blue-600">Sistema (Neto) vs Declarado (Sesión Cajero)</span>
                          </div>
                          <div className="space-y-1">
                            <div className="grid grid-cols-8 gap-2 px-2 pb-1 border-b border-blue-200">
                              <div className="text-[9px] font-black text-blue-400 uppercase">Billete</div>
                              <div className="text-[9px] font-black text-blue-400 uppercase text-center">Recibidos</div>
                              <div className="text-[9px] font-black text-blue-400 uppercase text-right">Total Rec.</div>
                              <div className="text-[9px] font-black text-blue-400 uppercase text-center">Vuelto</div>
                              <div className="text-[9px] font-black text-blue-400 uppercase text-right">Total Vuel.</div>
                              <div className="text-[9px] font-black text-blue-600 uppercase text-right">Sistema Neto</div>
                              <div className="text-[9px] font-black text-indigo-600 uppercase text-right">Declarado</div>
                              <div className="text-[9px] font-black text-slate-600 uppercase text-right">Diferencia</div>
                            </div>
                            {sessionSummary.denominationReport.VES.map((d) => (
                              <div key={d.denom} className="grid grid-cols-8 gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-white/50">
                                <div className="text-sm font-black text-blue-900">Bs {d.denom}</div>
                                <div className="text-center">
                                  <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">+{d.receivedQty}</span>
                                </div>
                                <div className="text-right text-xs font-mono font-black text-emerald-700">{d.receivedTotal.toLocaleString('es-VE')}</div>
                                <div className="text-center">
                                  <span className={`text-xs font-black px-2 py-0.5 rounded ${d.givenAsChangeQty > 0 ? 'text-amber-700 bg-amber-100' : 'text-slate-400 bg-slate-100'}`}>
                                    −{d.givenAsChangeQty}
                                  </span>
                                </div>
                                <div className="text-right text-xs font-mono font-black text-amber-700">{d.givenAsChangeTotal.toLocaleString('es-VE')}</div>
                                <div className={`text-right text-sm font-black font-mono ${d.netTotal >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                                  {d.netTotal >= 0 ? '+' : ''}{d.netTotal.toLocaleString('es-VE')}
                                </div>
                                {canFinalize ? (
                                  <>
                                    <div className="text-right text-xs font-mono font-black text-indigo-700">
                                      {((declaredDenominations.VES.get(d.denom)?.total ?? 0) >= 0 ? '+' : '')}
                                      {(declaredDenominations.VES.get(d.denom)?.total ?? 0).toLocaleString('es-VE')}
                                    </div>
                                    <div className={`text-right text-xs font-mono font-black ${
                                      ((declaredDenominations.VES.get(d.denom)?.total ?? 0) - d.netTotal) >= 0 ? 'text-emerald-700' : 'text-red-600'
                                    }`}>
                                      {(((declaredDenominations.VES.get(d.denom)?.total ?? 0) - d.netTotal) >= 0 ? '+' : '')}
                                      {((declaredDenominations.VES.get(d.denom)?.total ?? 0) - d.netTotal).toLocaleString('es-VE')}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-right text-xs font-black text-slate-400">N/D</div>
                                    <div className="text-right text-xs font-black text-slate-400">N/D</div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-blue-200 grid grid-cols-5 gap-2 text-center">
                            <div>
                              <div className="text-[9px] font-black text-blue-400 uppercase">Total Recibido</div>
                              <div className="text-sm font-black text-emerald-700 font-mono">Bs {sessionSummary.denominationReport.summary.totalReceivedVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-blue-400 uppercase">Total Vuelto</div>
                              <div className="text-sm font-black text-amber-700 font-mono">Bs {sessionSummary.denominationReport.summary.totalGivenVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-blue-600 uppercase">Neto en Caja</div>
                              <div className={`text-lg font-black font-mono ${sessionSummary.denominationReport.summary.netVES >= 0 ? 'text-blue-700' : 'text-red-600'}`}>
                                {sessionSummary.denominationReport.summary.netVES >= 0 ? '+' : ''}Bs {sessionSummary.denominationReport.summary.netVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-indigo-600 uppercase">Declarado Caja</div>
                              <div className="text-sm font-black text-indigo-700 font-mono">
                                {canFinalize ? `Bs ${declaredDenominations.totalVES.toLocaleString('es-VE', {minimumFractionDigits: 2})}` : 'N/D'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-slate-600 uppercase">Dif. Declarado</div>
                              <div className={`text-sm font-black font-mono ${
                                (declaredDenominations.totalVES - sessionSummary.denominationReport.summary.netVES) >= 0 ? 'text-emerald-700' : 'text-red-600'
                              }`}>
                                {canFinalize
                                  ? `${(declaredDenominations.totalVES - sessionSummary.denominationReport.summary.netVES) >= 0 ? '+' : ''}Bs ${(declaredDenominations.totalVES - sessionSummary.denominationReport.summary.netVES).toLocaleString('es-VE', {minimumFractionDigits: 2})}`
                                  : 'N/D'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Dólares */}
                      {sessionSummary.denominationReport.USD.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <div className="flex items-center justify-between mb-3">
                            <h5 className="text-xs font-black text-amber-800 uppercase tracking-widest">Denominaciones USD — Flujo de Caja</h5>
                            <span className="text-xs font-black text-amber-600">Sistema (Neto) vs Declarado (Sesión Cajero)</span>
                          </div>
                          <div className="space-y-1">
                            <div className="grid grid-cols-8 gap-2 px-2 pb-1 border-b border-amber-200">
                              <div className="text-[9px] font-black text-amber-400 uppercase">Billete</div>
                              <div className="text-[9px] font-black text-amber-400 uppercase text-center">Recibidos</div>
                              <div className="text-[9px] font-black text-amber-400 uppercase text-right">Total Rec.</div>
                              <div className="text-[9px] font-black text-amber-400 uppercase text-center">Vuelto</div>
                              <div className="text-[9px] font-black text-amber-400 uppercase text-right">Total Vuel.</div>
                              <div className="text-[9px] font-black text-amber-600 uppercase text-right">Sistema Neto</div>
                              <div className="text-[9px] font-black text-indigo-600 uppercase text-right">Declarado</div>
                              <div className="text-[9px] font-black text-slate-600 uppercase text-right">Diferencia</div>
                            </div>
                            {sessionSummary.denominationReport.USD.map((d) => (
                              <div key={d.denom} className="grid grid-cols-8 gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-white/50">
                                <div className="text-sm font-black text-amber-900">$ {d.denom}</div>
                                <div className="text-center">
                                  <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">+{d.receivedQty}</span>
                                </div>
                                <div className="text-right text-xs font-mono font-black text-emerald-700">{d.receivedTotal.toFixed(2)}</div>
                                <div className="text-center">
                                  <span className={`text-xs font-black px-2 py-0.5 rounded ${d.givenAsChangeQty > 0 ? 'text-amber-700 bg-amber-100' : 'text-slate-400 bg-slate-100'}`}>
                                    −{d.givenAsChangeQty}
                                  </span>
                                </div>
                                <div className="text-right text-xs font-mono font-black text-amber-700">{d.givenAsChangeTotal.toFixed(2)}</div>
                                <div className={`text-right text-sm font-black font-mono ${d.netTotal >= 0 ? 'text-amber-800' : 'text-red-600'}`}>
                                  {d.netTotal >= 0 ? '+' : ''}{d.netTotal.toFixed(2)}
                                </div>
                                {canFinalize ? (
                                  <>
                                    <div className="text-right text-xs font-mono font-black text-indigo-700">
                                      {((declaredDenominations.USD.get(d.denom)?.total ?? 0) >= 0 ? '+' : '')}
                                      {(declaredDenominations.USD.get(d.denom)?.total ?? 0).toFixed(2)}
                                    </div>
                                    <div className={`text-right text-xs font-mono font-black ${
                                      ((declaredDenominations.USD.get(d.denom)?.total ?? 0) - d.netTotal) >= 0 ? 'text-emerald-700' : 'text-red-600'
                                    }`}>
                                      {(((declaredDenominations.USD.get(d.denom)?.total ?? 0) - d.netTotal) >= 0 ? '+' : '')}
                                      {((declaredDenominations.USD.get(d.denom)?.total ?? 0) - d.netTotal).toFixed(2)}
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="text-right text-xs font-black text-slate-400">N/D</div>
                                    <div className="text-right text-xs font-black text-slate-400">N/D</div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-amber-200 grid grid-cols-5 gap-2 text-center">
                            <div>
                              <div className="text-[9px] font-black text-amber-400 uppercase">Total Recibido</div>
                              <div className="text-sm font-black text-emerald-700 font-mono">$ {sessionSummary.denominationReport.summary.totalReceivedUSD.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-amber-400 uppercase">Total Vuelto</div>
                              <div className="text-sm font-black text-amber-700 font-mono">$ {sessionSummary.denominationReport.summary.totalGivenUSD.toFixed(2)}</div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-amber-600 uppercase">Neto en Caja</div>
                              <div className={`text-lg font-black font-mono ${sessionSummary.denominationReport.summary.netUSD >= 0 ? 'text-amber-800' : 'text-red-600'}`}>
                                {sessionSummary.denominationReport.summary.netUSD >= 0 ? '+' : ''}$ {sessionSummary.denominationReport.summary.netUSD.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-indigo-600 uppercase">Declarado Caja</div>
                              <div className="text-sm font-black text-indigo-700 font-mono">
                                {canFinalize ? `$ ${declaredDenominations.totalUSD.toFixed(2)}` : 'N/D'}
                              </div>
                            </div>
                            <div>
                              <div className="text-[9px] font-black text-slate-600 uppercase">Dif. Declarado</div>
                              <div className={`text-sm font-black font-mono ${
                                (declaredDenominations.totalUSD - sessionSummary.denominationReport.summary.netUSD) >= 0 ? 'text-emerald-700' : 'text-red-600'
                              }`}>
                                {canFinalize
                                  ? `${(declaredDenominations.totalUSD - sessionSummary.denominationReport.summary.netUSD) >= 0 ? '+' : ''}$ ${(declaredDenominations.totalUSD - sessionSummary.denominationReport.summary.netUSD).toFixed(2)}`
                                  : 'N/D'}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Sin datos */}
                      {sessionSummary.denominationReport.VES.length === 0 && sessionSummary.denominationReport.USD.length === 0 && (
                        <div className="text-center py-8 text-slate-400">
                          <p className="text-sm font-black uppercase tracking-widest">No hay datos de denominaciones</p>
                          <p className="text-xs mt-1">Las denominaciones se registran al cobrar en efectivo y declarar vuelto.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Ventas del Turno</h4>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {sessionSummary.sales.map((sale, idx) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-slate-100">
                        <div className="flex items-center gap-4">
                          <span className="text-xs font-mono text-slate-400">{sale.correlativo}</span>
                          <span className="text-sm font-black text-slate-900">{sale.customerName || 'S/N'}</span>
                          <span className="text-xs font-bold text-slate-500 uppercase">{sale.paymentMethod}</span>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-mono font-black text-slate-900">$ {sale.totalUSD.toFixed(2)}</div>
                          <div className="text-xs font-mono text-slate-500">Bs {sale.totalVES.toFixed(2)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabla de Artículos Despachados para validación de inventario */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Artículos Despachados (Validación de Inventario)</h4>
                  <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <p className="text-xs font-bold text-blue-700">
                      💡 Verifique que las unidades despachadas coincidan con su recuento físico. 
                      Las cantidades se muestran en su unidad de medida original (Kg, Litros, Unidades).
                    </p>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left py-2 px-3 font-black text-slate-400 uppercase tracking-wider text-xs">SKU</th>
                          <th className="text-left py-2 px-3 font-black text-slate-400 uppercase tracking-wider text-xs">Descripción</th>
                          <th className="text-center py-2 px-3 font-black text-slate-400 uppercase tracking-wider text-xs">Cantidad</th>
                          <th className="text-center py-2 px-3 font-black text-slate-400 uppercase tracking-wider text-xs">Unidad</th>
                          <th className="text-center py-2 px-3 font-black text-slate-400 uppercase tracking-wider text-xs">Lote</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(enhancedAudit?.inventoryDispatch || sessionSummary.inventoryMovements)
                          .reduce((acc, movement) => {
                            const existing = acc.find(item => item.sku === movement.sku);
                            if (existing) {
                              existing.qtyOut += movement.qtyOut;
                            } else {
                              acc.push({
                                sku: movement.sku,
                                description: movement.description,
                                qtyOut: movement.qtyOut,
                                unit: (movement as any).unit || 'UND',
                                batchId: movement.batchId
                              });
                            }
                            return acc;
                          }, [] as Array<{sku: string, description: string, qtyOut: number, unit: string, batchId: string}>)
                          .sort((a, b) => b.qtyOut - a.qtyOut)
                          .map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                              <td className="py-2 px-3 font-mono font-black text-slate-900">{item.sku}</td>
                              <td className="py-2 px-3 font-black text-slate-700">{item.description}</td>
                              <td className="py-2 px-3 text-center">
                                <span className={`inline-block px-2 py-1 rounded-lg text-xs font-black ${item.qtyOut > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {item.qtyOut.toFixed(2)}
                                </span>
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-xs text-slate-500 uppercase">
                                {item.unit}
                              </td>
                              <td className="py-2 px-3 text-center font-mono text-xs text-slate-500">
                                {item.batchId || 'N/A'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                        <tr>
                          <td colSpan={2} className="py-3 px-3 font-black text-slate-900 uppercase tracking-wider text-xs">
                            TOTAL ARTÍCULOS DESPACHADOS
                          </td>
                          <td colSpan={3} className="py-3 px-3 text-center">
                            <span className="inline-block px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-black">
                              {(enhancedAudit?.inventoryDispatch || sessionSummary.inventoryMovements).reduce((sum, movement) => sum + movement.qtyOut, 0).toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {!showAudit && (
              <div className="bg-blue-50 border-2 border-blue-100 p-10 rounded-[3rem] space-y-4">
                <div className="flex items-center gap-4 text-blue-700">
                  <div className="p-3 bg-blue-100 rounded-2xl">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black tracking-tighter uppercase text-left">Declaración lista para cierre</h4>
                    <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest opacity-70">Registro del operador listo para validación de auditoría</p>
                  </div>
                </div>
                <textarea 
                  placeholder="Observación opcional del operador al momento de entregar el cierre..."
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="w-full bg-white border-2 border-blue-100 rounded-[2rem] p-6 text-sm font-bold text-slate-900 focus:ring-4 focus:ring-blue-100 outline-none h-32 transition-all placeholder:text-slate-300 uppercase tracking-tight"
                  disabled={!canFinalize}
                />
              </div>
            )}

            {showAudit && hasVarianza && (
              <div className="bg-red-50 border-2 border-red-100 p-10 rounded-[3rem] space-y-6 animate-in shake duration-500">
                <div className="flex items-center gap-6 text-red-700">
                  <div className="p-3 bg-red-100 rounded-2xl">
                     <AlertTriangle className="w-8 h-8 " />
                  </div>
                  <div>
                     <h4 className="text-2xl font-black tracking-tighter uppercase text-left">Discrepancia Detectada</h4>
                     <p className="text-[10px] font-black text-red-500 uppercase tracking-widest opacity-70">Protocolo de seguridad: Justificación Obligatoria</p>
                  </div>
                </div>
                <textarea 
                  placeholder="Motivo registrado por el operador o nota de supervisión sobre la discrepancia..."
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="w-full bg-white border-2 border-red-100 rounded-[2rem] p-6 text-sm font-bold text-red-900 focus:ring-4 focus:ring-red-100 outline-none h-40 transition-all placeholder:text-red-200 uppercase tracking-tight"
                  disabled={!canFinalize && !isSupervisor}
                />
              </div>
            )}

            <div className="bg-[#022c22] rounded-[3.5rem] p-12 text-white flex justify-between items-center shadow-[0_35px_60px_-15px_rgba(2,44,34,0.3)] relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-12 opacity-5 scale-150 rotate-12">
                 <ShieldCheck className="w-64 h-64" />
              </div>
              
              <div className="space-y-4 relative z-10 text-left">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                   <p className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em]">{showAudit ? 'Auditoría Log: Encadenado' : 'Declaración Ciega Registrada'}</p>
                </div>
                <h4 className="text-6xl font-black tracking-tighter font-headline leading-none">{showAudit ? `${systemTotals.reconciliationFuzzy}%` : `${sessionSummary?.sales.length ?? 0}`}</h4>
                <p className="text-[12px] font-bold text-emerald-100/60 uppercase tracking-widest">{showAudit ? 'Integridad Fiscal de la Jornada' : 'Ventas Registradas en el Turno'}</p>
              </div>

              <div className="flex flex-col gap-4 min-w-[300px] relative z-10">
                <button 
                  onClick={() => { if (!canFinalize || isFinalizing) return; setPinInput(''); setPinError(''); setShowPinConfirm(true); }}
                  disabled={!canFinalize || isFinalizing}
                  className={`w-full py-6 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.3em] shadow-2xl transition-all flex items-center justify-center gap-3 active:scale-95 ${
                    !canFinalize || isFinalizing
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed opacity-50'
                    : 'bg-emerald-500 text-emerald-950 hover:bg-emerald-400'
                  }`}
                >
                  {isFinalizing ? (
                    <div className="flex items-center gap-3">
                       <div className="w-4 h-4 border-2 border-emerald-950/20 border-t-emerald-950 rounded-full animate-spin"></div>
                       Procesando Z...
                    </div>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" /> {canFinalize ? 'Registrar Cierre del Operador' : 'Sesión Revisada'}
                    </>
                  )}
                </button>
                <button onClick={() => window.print()} className="bg-white/10 text-emerald-100 border border-white/10 w-full py-5 rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] hover:bg-white/20 transition-all flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4 opacity-70" /> Imprimir Arqueo X
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ===== MODAL CONFIRMACIÓN PIN CIERRE DE CAJA ===== */}
      {showPinConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#022c22] p-6 text-white text-center">
              <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <Lock className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-black uppercase tracking-tighter">Confirmar Cierre de Caja</h3>
              <p className="text-[10px] text-emerald-400/70 font-black uppercase tracking-widest mt-1">Esta acción es irreversible</p>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">
                  ⚠️ Ingresa tu PIN para confirmar el cierre definitivo de la sesión de caja
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PIN del Operador</label>
                <input
                  type="password"
                  value={pinInput}
                  onChange={e => { setPinInput(e.target.value); setPinError(''); }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const user = dataService.getCurrentUser();
                      if (pinInput === user.pin) {
                        setShowPinConfirm(false);
                        handleFinalize();
                      } else {
                        setPinError('PIN incorrecto. Inténtalo de nuevo.');
                      }
                    }
                  }}
                  placeholder="••••"
                  autoFocus
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-4 py-3 text-center text-2xl font-black tracking-[0.5em] outline-none focus:border-emerald-500 transition-colors"
                />
                {pinError && <p className="text-[10px] font-black text-red-600 text-center uppercase">{pinError}</p>}
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowPinConfirm(false)}
                  className="py-3 bg-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
                >
                  Cancelar
                </button>
                <button
                  disabled={isFinalizing}
                  onClick={() => {
                    const user = dataService.getCurrentUser();
                    if (pinInput === user.pin) {
                      setShowPinConfirm(false);
                      handleFinalize();
                    } else {
                      setPinError('PIN incorrecto. Inténtalo de nuevo.');
                    }
                  }}
                  className="py-3 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
                >
                  {isFinalizing ? 'Procesando...' : 'Confirmar Cierre'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CashDenomSection({ currency, bills, denoms, onAdd, onUpdate, onRemove, disabled }: {
  currency: 'VES' | 'USD';
  bills: BillEntry[];
  denoms: number[];
  onAdd: (d: number) => void;
  onUpdate: (d: number, qty: number) => void;
  onRemove: (d: number) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(true);
  const total = bills.reduce((s, b) => s + b.denom * b.qty, 0);
  const sym = currency === 'VES' ? 'Bs' : '$';
  const label = currency === 'VES' ? 'Efectivo Bs — Billetes' : 'Efectivo USD — Billetes';
  const activeDenoms = bills.map(b => b.denom);
  return (
    <div className="bg-white border-2 border-slate-100 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-all"
      >
        <div className="flex items-center gap-3">
          {currency === 'VES' ? (
            <span className="text-[10px] font-black text-slate-400 uppercase">Bs</span>
          ) : (
            <DollarSign className="w-4 h-4 text-slate-400" />
          )}
          <span className="text-xs font-black text-slate-700 uppercase tracking-wider">{label}</span>
        </div>
        <div className="flex items-center gap-4">
          {total > 0 && <span className="text-sm font-black text-emerald-700 font-mono">{sym} {currency === 'VES' ? total.toLocaleString('es-VE', {minimumFractionDigits: 2}) : total.toFixed(2)}</span>}
          {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="px-5 pb-5 space-y-4">
          {/* Accesos rápidos de denominación */}
          <div className="flex flex-wrap gap-2">
            {denoms.filter(d => !activeDenoms.includes(d)).map(d => (
              <button key={d} onClick={() => onAdd(d)} disabled={disabled}
                className="text-[10px] font-black text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-3 py-1 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700 transition-all disabled:opacity-40"
              >
                + {sym}{d}
              </button>
            ))}
          </div>
          {/* Filas por denominación activa */}
          {bills.length === 0 && (
            <p className="text-xs text-slate-400 font-bold text-center py-2">Pulse una denominación para agregar</p>
          )}
          <div className="space-y-2">
            {[...bills].sort((a, b) => b.denom - a.denom).map(({ denom, qty }) => (
              <div key={denom} className="flex items-center gap-3">
                <span className="w-20 text-xs font-black text-slate-500 text-right">{sym}{denom}</span>
                <span className="text-slate-300">×</span>
                <input
                  type="number" min="0" max="9999"
                  value={qty || ''}
                  onChange={e => onUpdate(denom, Number(e.target.value) || 0)}
                  placeholder="0"
                  disabled={disabled}
                  className="w-20 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-black text-slate-900 text-center outline-none focus:border-emerald-400 focus:bg-white transition-all"
                />
                <span className="text-slate-300">=</span>
                <span className="text-sm font-black text-slate-700 font-mono w-24">{sym} {(denom * qty).toLocaleString('es-VE', {minimumFractionDigits: 2})}</span>
                <button onClick={() => onRemove(denom)} disabled={disabled} className="ml-auto p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-all">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          {bills.length > 0 && (
            <div className="flex justify-end pt-1 border-t border-slate-100">
              <span className="text-sm font-black text-slate-900">Total: <span className="font-mono text-emerald-700">{sym} {currency === 'VES' ? total.toLocaleString('es-VE', {minimumFractionDigits: 2}) : total.toFixed(2)}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ElectronicLineInput({ line, banks, methodCurrency, methodLabel, methodIcon, onChange, onRemove, disabled }: {
  key?: React.Key;
  line: ElectronicLine;
  banks: { id: string; name: string }[];
  methodCurrency: Record<string, 'VES' | 'USD' | 'BOTH'>;
  methodLabel: Record<string, string>;
  methodIcon: Record<string, React.ReactNode>;
  onChange: (patch: Partial<ElectronicLine>) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const cMode = methodCurrency[line.method] ?? 'BOTH';
  const isOthers = line.method === 'others';
  const VES_METHODS = ['mobile', 'transfer', 'biopago', 'debit'];
  const USD_METHODS = ['zelle', 'digital_usd'];
  const showBank = !isOthers;
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
      {/* Fila 1: icono + método + banco/tipo + eliminar */}
      <div className="flex items-center gap-3">
        <div className="p-1.5 bg-white border border-slate-200 rounded-xl shrink-0">
          <span className="text-slate-400">{methodIcon[line.method] ?? <FileText className="w-4 h-4" />}</span>
        </div>
        <select
          value={line.method}
          onChange={e => onChange({ method: e.target.value, amountVES: 0, amountUSD: 0, othersType: '', note: '' })}
          disabled={disabled}
          className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:border-emerald-400 transition-all"
        >
          {VES_METHODS.map(m => <option key={m} value={m}>{methodLabel[m]}</option>)}
          {USD_METHODS.map(m => <option key={m} value={m}>{methodLabel[m]}</option>)}
          <option value="others">{methodLabel['others']}</option>
        </select>
        {showBank && (
          <select
            value={line.bankId}
            onChange={e => {
              const b = banks.find(b => b.id === e.target.value);
              onChange({ bankId: e.target.value, bankName: b?.name ?? '' });
            }}
            disabled={disabled}
            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-black text-slate-900 outline-none focus:border-emerald-400 transition-all"
          >
            <option value="">Banco...</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <button onClick={onRemove} disabled={disabled} className="p-2 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-xl transition-all shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Tipo contable para Otros */}
      {isOthers && (
        <div className="space-y-2">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tipo de operación</p>
          <div className="flex flex-wrap gap-2">
            {OTHERS_TYPES.map(t => (
              <button
                key={t}
                onClick={() => onChange({ othersType: t })}
                disabled={disabled}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-black transition-all ${
                  line.othersType === t
                    ? 'bg-indigo-700 text-white shadow-md'
                    : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <textarea
            value={line.note}
            onChange={e => onChange({ note: e.target.value })}
            placeholder="Observación / detalle de la operación..."
            disabled={disabled}
            rows={2}
            className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 outline-none focus:border-indigo-400 transition-all placeholder:text-slate-300 resize-none"
          />
        </div>
      )}

      {/* Montos */}
      <div className={`grid gap-3 ${ cMode === 'BOTH' ? 'grid-cols-2' : 'grid-cols-1' }`}>
        {(cMode === 'VES' || cMode === 'BOTH') && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">Bs</span>
            <input type="number" min="0" step="0.01"
              value={line.amountVES || ''}
              onChange={e => onChange({ amountVES: Number(e.target.value) || 0 })}
              placeholder="0.00" disabled={disabled}
              className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2.5 text-sm font-black text-slate-900 text-right outline-none focus:border-emerald-400 transition-all"
            />
          </div>
        )}
        {(cMode === 'USD' || cMode === 'BOTH') && (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black text-xs">$</span>
            <input type="number" min="0" step="0.01"
              value={line.amountUSD || ''}
              onChange={e => onChange({ amountUSD: Number(e.target.value) || 0 })}
              placeholder="0.00" disabled={disabled}
              className="w-full bg-white border border-slate-200 rounded-xl pl-7 pr-3 py-2.5 text-sm font-black text-slate-900 text-right outline-none focus:border-emerald-400 transition-all"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ResultCard({ title, value, variant, currency = 'VES' }: { title: string; value: number; variant: string; currency?: 'USD' | 'VES' }) {
  const styles: any = {
    neutral: 'bg-slate-50 border-slate-100 text-slate-400',
    info: 'bg-emerald-50 border-emerald-100 text-emerald-700 shadow-xl shadow-emerald-500/5',
    success: 'bg-[#022c22] text-white border-emerald-900 shadow-xl shadow-emerald-900/10',
    error: 'bg-red-50 text-red-700 border-red-100 shadow-xl shadow-red-500/5 pulse-subtle'
  };
  const formatted = currency === 'USD'
    ? `$ ${Math.abs(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `Bs ${Math.abs(value).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
  const badge = currency === 'USD'
    ? <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 ml-1">USD</span>
    : <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-700 ml-1">Bs</span>;

  return (
    <div className={`p-10 rounded-[3rem] border-2 text-center transition-all group hover:-translate-y-1 duration-300 ${styles[variant]}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-2 opacity-60 leading-none">{title}</p>
      <div className="flex justify-center mb-4">{badge}</div>
      <div className="flex items-baseline justify-center gap-2 flex-wrap min-h-[60px]">
        {value < 0 && <span className="text-2xl font-black">-</span>}
        <h3 className="text-5xl font-black tracking-tighter font-headline leading-none">
          {formatted}
        </h3>
        {variant !== 'neutral' && <span className={`text-xs font-black uppercase ${variant === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>{variant === 'error' ? '!' : '✓'}</span>}
      </div>
    </div>
  );
}
