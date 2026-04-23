import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  Package, 
  Activity, 
  ArrowUpRight, 
  ArrowDownRight, 
  Zap, 
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  Users,
  ShoppingCart,
  ArrowRightLeft,
  Lock,
  ChevronRight,
  Timer,
  DollarSign,
  X,
  FileText,
  User,
  Calendar,
  Hash,
  BarChart2,
  PieChart as PieIcon,
  ArrowDownLeft,
  RotateCcw,
  Wallet,
  PackagePlus,
  PackageMinus,
  Truck
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { dataService, AccountingAlert, AuditEntry } from '../../services/dataService';
import { reportService } from '../../services/reportService';

const PIE_COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

export function DashboardView({ exchangeRates, accountingAlerts = [] }: { exchangeRates: { bcv: number, parallel: number }; accountingAlerts?: AccountingAlert[] }) {
  const [, setTick] = useState(0);
  const fmt = (value: any, decimals: number = 2) =>
    (Number(value ?? 0) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  const usd = (value: any, decimals: number = 2) => `$ ${fmt(value, decimals)}`;
  const bs = (value: any, decimals: number = 2) => `Bs ${fmt(value, decimals)}`;
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEntry | null>(null);
  const [salePayments, setSalePayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [chartTab, setChartTab] = useState<'sales' | 'methods' | 'cxc'>('sales');
  
  useEffect(() => {
    return dataService.subscribe(() => setTick(t => t + 1));
  }, []);

  useEffect(() => {
    const session = dataService.getCurrentCashBoxSession();
    setCurrentSession(session);
  }, []);

  const currentUser = dataService.getCurrentUser();
  const canSeeAccounting = dataService.hasPermission('ACCOUNTING_ALERTS', currentUser);
  const audit = dataService.getAuditTrail();
  const stocks = dataService.getStocks();
  const sales = dataService.getSales();
  const totalVal = reportService.getTotalValorization();
  const todaySales = sales.filter(s => s.timestamp.toLocaleDateString() === new Date().toLocaleDateString());
  const dailyTotalUSD = todaySales.reduce((acc, s) => {
    const pmts: any[] = (s as any).payments ?? [];
    const changeUSD = pmts.reduce((c, p) => {
      if (!p.cashChangeGiven || !p.cashChangeMethod) return c;
      const rate = Number(p.cashChangeRate ?? p.exchangeRate ?? 1);
      const isVES = p.cashChangeMethod === 'efectivo_bs' || p.cashChangeMethod === 'bs' || p.cashChangeMethod === 'pago_movil';
      return c + (isVES ? Number(p.cashChangeGiven) / (rate || 1) : Number(p.cashChangeGiven));
    }, 0);
    return acc + (s.totalUSD - changeUSD);
  }, 0);

  const criticalIssues = dataService.getCriticalIssues();

  // --- FEAT-11: Chart data ---
  const dailySalesData = useMemo(() => {
    const daily = reportService.getDailySales();
    const last14 = daily.slice(0, 14).reverse();
    return last14.map(d => ({
      date: d.date.slice(5),
      USD: parseFloat(d.totalUSD.toFixed(2)),
      Ops: d.orders
    }));
  }, [sales]);

  const paymentMethodData = useMemo(() => {
    const map: Record<string, number> = {};
    const labelMap: Record<string, string> = {
      cash_usd: 'Efectivo $', cash_ves: 'Efectivo Bs', zelle: 'Zelle',
      transfer: 'Transfer.', pago_movil: 'P.Móvil', debit: 'Débito',
      credit: 'Crédito', others: 'Otros', advance: 'Anticipo',
      EFECTIVO: 'Efectivo', TRANSFERENCIA: 'Transfer.', CREDIT: 'Crédito',
    };
    sales.forEach(s => {
      const pmts: any[] = (s as any).payments ?? [];
      if (pmts.length === 0) {
        const key = labelMap[s.paymentMethod] ?? s.paymentMethod ?? 'Otros';
        map[key] = (map[key] ?? 0) + s.totalUSD;
      } else {
        pmts.forEach((p: any) => {
          if (p.cashChangeGiven) return;
          const key = labelMap[p.method] ?? p.method ?? 'Otros';
          map[key] = (map[key] ?? 0) + (Number(p.amountUSD) || 0);
        });
      }
    });
    return Object.entries(map)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, [sales]);

  const cxcData = useMemo(() => {
    const ar = dataService.getAREntries ? dataService.getAREntries() : [];
    const map: Record<string, number> = {};
    ar.forEach((r: any) => {
      if (r.status === 'PAID') return;
      const name = String(r.clientName ?? r.client ?? 'Desconocido').slice(0, 18);
      map[name] = (map[name] ?? 0) + (Number(r.balanceUSD ?? r.amountUSD ?? 0));
    });
    return Object.entries(map)
      .filter(([, v]) => v > 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }));
  }, []);

  const getEventStyle = (action: string, flowType?: string) => {
    const flow = flowType as string | undefined;
    switch (action) {
      case 'FACTURACION': return { icon: ShoppingCart, color: 'text-emerald-600 bg-emerald-50', mod: 'VENTAS' };
      case 'DEVOLUCION':  return { icon: RotateCcw,    color: 'text-rose-500 bg-rose-50',       mod: 'DEVOLUCIONES' };
      case 'INVENTARIO':
        if (flow === 'INGRESO') return { icon: PackagePlus,  color: 'text-emerald-500 bg-emerald-50', mod: 'INVENTARIO' };
        if (flow === 'EGRESO')  return { icon: PackageMinus, color: 'text-orange-500 bg-orange-50',   mod: 'INVENTARIO' };
        return { icon: Package, color: 'text-blue-500 bg-blue-50', mod: 'INVENTARIO' };
      case 'FINANZAS': return { icon: Wallet,         color: 'text-amber-500 bg-amber-50',     mod: 'FINANZAS' };
      case 'COMPRA':   return { icon: Truck,           color: 'text-purple-500 bg-purple-50',   mod: 'COMPRAS' };
      case 'CXC':      return { icon: TrendingUp,      color: 'text-sky-500 bg-sky-50',         mod: 'CxC' };
      case 'SALE':     return { icon: ShoppingCart,    color: 'text-emerald-500 bg-emerald-50', mod: 'VENTAS' };
      case 'IN':       return { icon: PackagePlus,     color: 'text-emerald-500 bg-emerald-50', mod: 'INVENTARIO' };
      case 'TRANSFER': return { icon: ArrowRightLeft,  color: 'text-blue-500 bg-blue-50',       mod: 'INVENTARIO' };
      case 'FRACTION': return { icon: Package,         color: 'text-amber-500 bg-amber-50',     mod: 'PRODUCCION' };
      case 'AUTH':     return { icon: Lock,            color: 'text-slate-500 bg-slate-50',     mod: 'SEGURIDAD' };
      default:         return { icon: Activity,        color: 'text-slate-500 bg-slate-50',     mod: 'SISTEMA' };
    }
  };

  const getTimeAgo = (date: Date) => {
     const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
     if (seconds < 60) return 'Hace instantes';
     if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
     return `Hace ${Math.floor(seconds / 3600)} hora(s)`;
  };

  const criticalAccounting = accountingAlerts.filter(a => a.severity === 'error');
  const warningAccounting = accountingAlerts.filter(a => a.severity === 'warning');

  return (
    <>
    <div className="space-y-6 xl:space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10 xl:pb-20">

      {/* === PANEL ALERTAS CONTABLES === */}
      {canSeeAccounting && accountingAlerts.length > 0 && (
        <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-xl">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-headline font-black text-xl tracking-tighter uppercase text-slate-900 leading-none">Alertas Contables Pendientes</h3>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                {criticalAccounting.length > 0 && <span className="text-red-500">{criticalAccounting.length} críticas</span>}
                {criticalAccounting.length > 0 && warningAccounting.length > 0 && ' • '}
                {warningAccounting.length > 0 && <span className="text-amber-500">{warningAccounting.length} advertencias</span>}
                {' — Operaciones tipo Otros que afectan contabilidad'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accountingAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-5 rounded-[2rem] border flex items-start gap-4 ${
                  alert.severity === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                <div className={`p-3 rounded-2xl shrink-0 shadow-sm ${
                  alert.severity === 'error' ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-400 text-white'
                }`}>
                  <AlertCircle className="w-4 h-4" />
                </div>
                <div className="flex-1 space-y-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                      alert.severity === 'error' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}>{alert.othersType}</span>
                    <span className="text-[9px] font-black text-slate-400 font-mono">{alert.correlativo}</span>
                  </div>
                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-tighter leading-tight">{alert.label}</p>
                  <p className="text-[9px] font-bold text-slate-500 leading-tight">{alert.description}</p>
                  <div className="flex items-center gap-4 pt-1">
                    <span className="text-[9px] font-black text-slate-400">{alert.clientName}</span>
                    {alert.amountUSD > 0 && <span className="text-[10px] font-black text-slate-700 font-mono">{usd(alert.amountUSD)}</span>}
                    {alert.amountVES > 0 && <span className="text-[10px] font-black text-slate-700 font-mono">{bs(alert.amountVES)}</span>}
                  </div>
                  {alert.note && (
                    <p className="text-[9px] italic text-slate-400 border-t border-slate-200 pt-1 mt-1">"{alert.note}"</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}



      {/* FEAT-11: Charts Section */}
      <div className="bg-white rounded-[2rem] xl:rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 xl:px-10 pt-6 xl:pt-8 pb-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-xl">
              <BarChart2 className="w-4 h-4 text-slate-600" />
            </div>
            <h3 className="font-headline font-black text-lg xl:text-xl tracking-tighter uppercase text-slate-900">Analítica Visual</h3>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {([['sales', 'Ventas'], ['methods', 'Métodos'], ['cxc', 'CxC']] as const).map(([tab, label]) => (
              <button
                key={tab}
                onClick={() => setChartTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                  chartTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >{label}</button>
            ))}
          </div>
        </div>

        <div className="px-2 xl:px-4 py-4 xl:py-6">
          {/* Ventas diarias */}
          {chartTab === 'sales' && (
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-4 mb-3">Ventas USD — últimos 14 días</p>
              {dailySalesData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin datos de ventas aún</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={dailySalesData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradUSD" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} width={48} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 11, fontWeight: 700 }}
                      formatter={(v: any) => [usd(Number(v)), 'Ventas USD']}
                    />
                    <Area type="monotone" dataKey="USD" stroke="#10b981" strokeWidth={2.5} fill="url(#gradUSD)" dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* Métodos de pago */}
          {chartTab === 'methods' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-4 mb-3">Distribución por método — total histórico</p>
                {paymentMethodData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin datos</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={paymentMethodData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                        dataKey="value" paddingAngle={3}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {paymentMethodData.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 11, fontWeight: 700 }}
                        formatter={(v: any) => [usd(Number(v)), 'Total USD']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
              <div className="space-y-2 pr-4">
                {paymentMethodData.map((d, i) => {
                  const total = paymentMethodData.reduce((s, x) => s + x.value, 0);
                  const pct = total > 0 ? (d.value / total * 100) : 0;
                  return (
                    <div key={d.name}>
                      <div className="flex justify-between text-[9px] font-black text-slate-600 mb-1">
                        <span className="uppercase">{d.name}</span>
                        <span className="font-mono">{usd(d.value)} · {fmt(pct, 1)}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* CxC pendiente por cliente */}
          {chartTab === 'cxc' && (
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-4 mb-3">Saldo CxC pendiente por cliente (USD) — top 8</p>
              {cxcData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-slate-300 text-[10px] font-black uppercase tracking-widest">Sin cuentas por cobrar pendientes</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={cxcData} layout="vertical" margin={{ top: 0, right: 48, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 9, fontWeight: 700, fill: '#475569' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 24px rgba(0,0,0,0.10)', fontSize: 11, fontWeight: 700 }}
                      formatter={(v: any) => [usd(Number(v)), 'Saldo USD']}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {cxcData.map((_, i) => (
                        <Cell key={i} fill={i === 0 ? '#ef4444' : i === 1 ? '#f97316' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Global Indicators Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 xl:gap-8">
        <MetricCard title="Ventas del Día" value={usd(dailyTotalUSD)} trend="Neto recibido" detail={`${todaySales.length} transacciones hoy`} color="emerald" icon={TrendingUp} />
        <MetricCard title="Valoración Stock" value={usd(totalVal)} trend="Consolidado" detail="Activos Biológicos" color="blue" icon={Package} />
        <MetricCard 
          title="Tasa AlCambio (Sync)" 
          value={bs(exchangeRates.bcv)} 
          trend={`P: ${fmt(exchangeRates.parallel)}`} 
          detail="Actualizado: 1h" 
          color="amber" 
          icon={RefreshCw} 
        />
        {/* Cash Box Session Status */}
        <div className="bg-white rounded-[1.5rem] xl:rounded-3xl p-4 xl:p-8 shadow-sm border border-slate-200/60 relative overflow-hidden group hover:shadow-xl transition-all">
          <div className="absolute top-0 right-0 p-3 opacity-5 scale-150 rotate-12">
            <DollarSign className="w-16 h-16 text-slate-900" />
          </div>
          <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-2xl ${currentSession ? 'bg-emerald-100' : 'bg-slate-100'}`}>
              <DollarSign className={`w-6 h-6 ${currentSession ? 'text-emerald-600' : 'text-slate-400'}`} />
            </div>
            <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${
              currentSession ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
            }`}>
              {currentSession ? 'ABIERTA' : 'CERRADA'}
            </span>
          </div>
          <div className="space-y-2">
            <h3 className="font-black text-xl xl:text-2xl text-slate-900 tracking-tighter">
              {currentSession ? usd(currentSession.initialAmountUSD) : usd(0)}
            </h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              {currentSession ? `Apertura: ${currentSession.openTime}` : 'Sin sesión'}
            </p>
            {currentSession && (
              <div className="flex items-center gap-2 text-[9px] text-slate-400">
                <Timer className="w-3 h-3" />
                <span>{currentSession.userName}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 xl:gap-10">
        <div className="md:col-span-8 space-y-6 xl:space-y-10">
           {/* Inteligencia Operativa: Asuntos Críticos */}
           <div className="space-y-4 xl:space-y-6">
              <div className="flex items-center gap-3">
                 <AlertCircle className="w-5 h-5 text-red-500" />
                 <h3 className="font-headline font-black text-lg xl:text-2xl tracking-tighter uppercase text-slate-900 leading-none">Resolución de Asuntos Críticos</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {criticalIssues.length === 0 ? (
                    <div className="col-span-2 bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 flex items-center gap-4">
                       <ShieldCheck className="w-8 h-8 text-emerald-600" />
                       <div>
                          <p className="text-[11px] font-black text-emerald-800 uppercase tracking-widest">Estado Perfecto</p>
                          <p className="text-[9px] font-bold text-emerald-600/60 uppercase">No se detectaron irregularidades críticas en la planta.</p>
                       </div>
                    </div>
                 ) : (
                    criticalIssues.map((issue) => (
                       <div key={issue.id} className={`p-5 rounded-[2rem] border flex items-start gap-4 transition-all hover:scale-[1.02] cursor-pointer ${issue.priority === 'CRITICAL' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100'}`}>
                          <div className={`p-3 rounded-2xl ${issue.priority === 'CRITICAL' ? 'bg-red-500 text-white animate-pulse' : 'bg-amber-500 text-white'} shadow-lg`}>
                             {issue.type === 'STOCK' ? <Package className="w-4 h-4" /> : <Timer className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 space-y-1">
                             <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-tighter leading-none">{issue.title}</h4>
                             <p className={`text-[9px] font-black uppercase ${issue.priority === 'CRITICAL' ? 'text-red-700/60' : 'text-amber-700/60'}`}>{issue.detail}</p>
                             <div className="flex items-center gap-1 text-slate-400 mt-2">
                                <span className="text-[8px] font-black uppercase hover:text-slate-900 transition-colors">Resolver Ahora</span>
                                <ChevronRight className="w-3 h-3" />
                             </div>
                          </div>
                       </div>
                    ))
                 )}
              </div>
           </div>

           <div className="bg-white p-5 xl:p-10 rounded-[2rem] xl:rounded-[3rem] border border-slate-200 shadow-sm space-y-5 xl:space-y-8">
              <div className="flex justify-between items-center">
                 <h3 className="font-headline font-black text-lg xl:text-2xl tracking-tighter uppercase">Registros de Actividades Operativas</h3>
                 <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-xl uppercase animate-pulse">En Vivo</span>
              </div>
              
              <div className="space-y-3 xl:space-y-6">
                 {audit.length === 0 ? (
                   <div className="py-20 text-center text-slate-300 font-black uppercase text-[10px] tracking-widest">Esperando primeras operaciones del turno...</div>
                 ) : audit.slice(0, 20).map((event, i) => {
                   const evAny = event as any;
                   const style = getEventStyle(event.action, evAny.flowType);
                   const flowType: string | undefined = evAny.flowType;
                   const subType: string | undefined = evAny.subType;
                   const flowBadge = flowType === 'INGRESO'
                     ? <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 uppercase tracking-wider"><ArrowUpRight className="w-2.5 h-2.5" />Ingreso</span>
                     : flowType === 'EGRESO'
                       ? <span className="inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 uppercase tracking-wider"><ArrowDownLeft className="w-2.5 h-2.5" />Egreso</span>
                       : null;
                   return (
                    <div key={event.id} onClick={async () => {
                       setSelectedEvent(event);
                       setSalePayments([]);
                       if (event.action === 'FACTURACION') {
                         setLoadingPayments(true);
                         try {
                           const pmts = await dataService.getSalePayments(event.id);
                           setSalePayments(pmts);
                         } finally {
                           setLoadingPayments(false);
                         }
                       }
                    }} className="flex items-center gap-3 xl:gap-5 p-3 xl:p-4 rounded-[1.5rem] xl:rounded-[2rem] border border-slate-50 hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer group animate-in slide-in-from-right duration-500" style={{ animationDelay: `${i * 100}ms` }}>
                       <div className={`p-3 rounded-2xl ${style.color} group-hover:scale-110 transition-transform shadow-sm flex-shrink-0`}>
                          <style.icon className="w-5 h-5" />
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            {flowBadge}
                            {subType && <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider border border-slate-200 px-1.5 py-0.5 rounded">{subType}</span>}
                            <span className="text-[8px] font-bold text-slate-300 uppercase">{style.mod}</span>
                          </div>
                          <p className="text-[12px] font-black text-slate-900 uppercase tracking-tight leading-snug truncate">{event.details}</p>
                          <p className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-[0.08em]">
                            {event.timestamp.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })} {event.timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })} • {event.actor}
                          </p>
                       </div>
                       <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span className="text-[7px] font-mono text-slate-300 uppercase tracking-tighter">Hash</span>
                          <span className="text-[9px] font-mono font-black text-slate-400 group-hover:text-emerald-600 transition-colors uppercase leading-none">{event.hash}</span>
                       </div>
                    </div>
                   );
                 })}
              </div>
           </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="md:col-span-4 space-y-8">
           <div className="bg-[#022c22] p-6 xl:p-10 rounded-[2rem] xl:rounded-[3rem] shadow-2xl space-y-6 xl:space-y-8 text-white group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:opacity-10 transition-opacity">
                 <ShieldCheck className="w-48 h-48" />
              </div>
              <div className="space-y-2 relative z-10">
                 <h4 className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em]">Bóveda Consolidada</h4>
                 <div className="flex items-baseline gap-2">
                    <h3 className="text-3xl xl:text-5xl font-black font-headline tracking-tighter leading-none">{usd(totalVal)}</h3>
                    <span className="text-xs font-black text-emerald-500 uppercase">Val. Activos</span>
                 </div>
              </div>
              <div className="space-y-4 pt-10 border-t border-white/10 relative z-10">
                 <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="space-y-1 text-left">
                       <p className="text-[9px] font-black text-emerald-400/50 uppercase tracking-widest">Siguiente Correlativo</p>
                       <p className="text-xs font-black uppercase text-emerald-400 font-mono">{dataService.getCorrelativoString()}</p>
                    </div>
                    <Lock className="w-4 h-4 text-emerald-700" />
                 </div>
                 <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="space-y-1 text-left">
                       <p className="text-[9px] font-black text-emerald-400/50 uppercase tracking-widest">Movimientos Hoy</p>
                       <p className="text-xs font-black uppercase text-white">
                         {audit.filter(e => e.timestamp.toLocaleDateString() === new Date().toLocaleDateString()).length} registros
                       </p>
                    </div>
                    <Activity className="w-4 h-4 text-emerald-700" />
                 </div>
                 <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                    <div className="space-y-1 text-left">
                       <p className="text-[9px] font-black text-emerald-400/50 uppercase tracking-widest">Última Operación</p>
                       <p className="text-[10px] font-black uppercase text-white leading-tight truncate max-w-[140px]">
                         {audit[0] ? audit[0].timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', hour12: true }) + ' · ' + audit[0].action : '—'}
                       </p>
                    </div>
                    <Timer className="w-4 h-4 text-emerald-700" />
                 </div>
              </div>
           </div>
        </div>
      </div>
    </div>

      {/* Modal Detalle de Movimiento */}

      {selectedEvent && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4" onClick={() => setSelectedEvent(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col animate-in zoom-in-95 duration-200" style={{ maxHeight: 'calc(100vh - 2rem)' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={`p-6 text-white ${
              selectedEvent.action === 'FACTURACION' ? 'bg-emerald-700' :
              selectedEvent.action === 'INVENTARIO' ? 'bg-blue-700' :
              selectedEvent.action === 'FINANZAS' ? 'bg-amber-700' :
              selectedEvent.action === 'COMPRA' ? 'bg-purple-700' :
              selectedEvent.action === 'CXC' ? 'bg-sky-700' : 'bg-slate-800'
            }`}>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-70">Detalle de Movimiento</p>
                    <h3 className="text-lg font-black uppercase tracking-tighter leading-none">{selectedEvent.action}</h3>
                  </div>
                </div>
                <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-white/20 rounded-xl transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Descripción */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Descripción</p>
                <p className="text-[13px] font-black text-slate-900 uppercase leading-tight">{selectedEvent.details}</p>
              </div>

              {/* Grid de datos */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Calendar className="w-3 h-3" />
                    <p className="text-[9px] font-black uppercase tracking-widest">Fecha y Hora</p>
                  </div>
                  <p className="text-[11px] font-black text-slate-900">
                    {selectedEvent.timestamp.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                  </p>
                  <p className="text-[10px] font-bold text-slate-600">
                    {selectedEvent.timestamp.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                  </p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <User className="w-3 h-3" />
                    <p className="text-[9px] font-black uppercase tracking-widest">Operador</p>
                  </div>
                  <p className="text-[11px] font-black text-slate-900 uppercase">{selectedEvent.actor}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase">{selectedEvent.action}</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <Hash className="w-3 h-3" />
                    <p className="text-[9px] font-black uppercase tracking-widest">
                      {selectedEvent.action === 'FACTURACION' ? 'Correlativo' : (selectedEvent as any).subType?.includes('ompra') || (selectedEvent as any).subType?.includes('ntrada') ? 'Factura / Ref' : 'Producto / Ref'}
                    </p>
                  </div>
                  <p className="text-[11px] font-black text-slate-900 font-mono uppercase">{selectedEvent.entity}</p>
                </div>

                <div className="bg-slate-50 rounded-2xl p-4 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <ShieldCheck className="w-3 h-3" />
                    <p className="text-[9px] font-black uppercase tracking-widest">Chain Hash</p>
                  </div>
                  <p className="text-[11px] font-black text-emerald-600 font-mono uppercase tracking-widest">{selectedEvent.hash}</p>
                  <p className="text-[8px] font-bold text-slate-400">ID: {selectedEvent.id.slice(0, 16)}...</p>
                </div>
              </div>

              {/* Datos extra según tipo */}
              {(() => {
                if (selectedEvent.action === 'FACTURACION') {
                  const sale = dataService.getSales().find(s => s.id === selectedEvent.id);
                  if (!sale) return null;

                  // Calcular vuelto y neto desde payments reales de Firestore
                  const pmts = salePayments.length > 0 ? salePayments : ((sale as any).payments ?? []);
                  const methodLabels: Record<string, string> = {
                    cash_usd: 'Efectivo $', cash_ves: 'Efectivo Bs', zelle: 'Zelle', transfer: 'Transferencia',
                    pago_movil: 'Pago Móvil', debit: 'Tarjeta Débito', credit: 'Crédito', others: 'Otros'
                  };
                  let totalChangeUSD = 0;
                  let changeLines: { label: string; amount: string }[] = [];
                  pmts.forEach((p: any) => {
                    if (p.cashChangeGiven && p.cashChangeMethod) {
                      const rate = Number(p.cashChangeRate ?? p.exchangeRate ?? 1);
                      const isVES = p.cashChangeMethod === 'efectivo_bs' || p.cashChangeMethod === 'bs' || p.cashChangeMethod === 'pago_movil';
                      const changeUSD = isVES ? Number(p.cashChangeGiven) / (rate || 1) : Number(p.cashChangeGiven);
                      totalChangeUSD += changeUSD;
                      const methodName = methodLabels[p.cashChangeMethod] ?? p.cashChangeMethod;
                      changeLines.push({
                        label: `Vuelto vía ${methodName}`,
                        amount: isVES ? `Bs. ${Number(p.cashChangeGiven).toFixed(2)}` : `$${Number(p.cashChangeGiven).toFixed(2)}`
                      });
                    }
                  });
                  const netUSD = sale.totalUSD - totalChangeUSD;
                  const hasChange = totalChangeUSD > 0.005;

                  // Métodos de cobro reales
                  const paymentLines: { method: string; amount: string }[] = pmts
                    .filter((p: any) => !p.cashChangeGiven && p.method && p.method !== 'credit')
                    .map((p: any) => ({
                      method: methodLabels[p.method] ?? p.method?.toUpperCase(),
                      amount: p.currency === 'VES' || p.amountVES > 0
                        ? `Bs. ${Number(p.amountVES || 0).toFixed(2)}`
                        : `$${Number(p.amountUSD || 0).toFixed(2)}`
                    }));

                  return (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 space-y-3 max-h-72 overflow-y-auto">
                      <div className="flex justify-between items-center">
                        <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Detalle de Venta</p>
                        {loadingPayments && <span className="text-[8px] text-slate-400 animate-pulse">Cargando pagos...</span>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-left">
                        <div className="col-span-2"><p className="text-[8px] text-slate-400 font-black uppercase">Cliente</p><p className="text-[11px] font-black text-slate-900 uppercase">{sale.client.name}</p></div>
                        <div><p className="text-[8px] text-slate-400 font-black uppercase">Correlativo</p><p className="text-[11px] font-black text-slate-900 font-mono">{sale.correlativo}</p></div>
                      </div>

                      {/* Métodos de cobro reales */}
                      {paymentLines.length > 0 && (
                        <div className="border-t border-emerald-100 pt-2 space-y-1">
                          <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-1">Cobros Recibidos</p>
                          {paymentLines.map((pl, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] bg-white rounded-lg px-2 py-1">
                              <span className="font-bold text-slate-700 uppercase">{pl.method}</span>
                              <span className="font-black text-emerald-700">{pl.amount}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Resumen financiero */}
                      <div className="border-t border-emerald-100 pt-2 space-y-1.5">
                        <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest">Resumen Financiero</p>
                        <div className="flex justify-between items-center text-[10px] py-0.5">
                          <span className="text-slate-500 font-bold uppercase">Total Facturado</span>
                          <span className="font-black text-slate-700">${sale.totalUSD.toFixed(2)}</span>
                        </div>
                        {hasChange && changeLines.map((cl, i) => (
                          <div key={i} className="flex justify-between items-center text-[10px] py-0.5 bg-red-50 rounded-lg px-2">
                            <span className="text-red-600 font-black uppercase">{cl.label}</span>
                            <span className="font-black text-red-600">- {cl.amount}</span>
                          </div>
                        ))}
                        <div className={`flex justify-between items-center text-[11px] py-1.5 rounded-lg px-2 border ${
                          hasChange ? 'bg-emerald-100 border-emerald-300' : 'bg-emerald-50 border-emerald-200'
                        }`}>
                          <span className="text-emerald-800 font-black uppercase">{hasChange ? 'Neto Recibido' : 'Cobrado Exacto'}</span>
                          <span className="font-black text-emerald-800 text-[13px]">${netUSD.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Ítems */}
                      {sale.items && sale.items.length > 0 && (
                        <div className="border-t border-emerald-100 pt-2 space-y-1">
                          <p className="text-[8px] font-black text-emerald-700 uppercase tracking-widest mb-1">Ítems Vendidos</p>
                          {sale.items.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center text-[9px] py-1 border-b border-emerald-50">
                              <span className="font-bold text-slate-700 uppercase flex-1 pr-2">{item.description}</span>
                              <span className="font-black text-slate-500">{item.qty} {item.unit}</span>
                              <span className="font-black text-emerald-700 ml-3">${(item.price * item.qty).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }
                if (selectedEvent.action === 'INVENTARIO') {
                  const mov = dataService.getMovements().find((m: any) => m.id === selectedEvent.id);
                  if (!mov) return null;
                  const product = dataService.getStocks().find(p => p.code === mov.sku);
                  const isVenta = mov.type === 'SALE' || mov.qty < 0;
                  const isCompra = mov.type === 'IN' || mov.type === 'PURCHASE' || (mov.qty > 0 && mov.type !== 'FRACTION');
                  const totalUSD = product ? Math.abs(mov.qty) * product.priceUSD : null;
                  const accentColor = isVenta ? 'bg-emerald-50 border-emerald-200' : isCompra ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100';
                  const labelColor = isVenta ? 'text-emerald-700' : isCompra ? 'text-red-700' : 'text-blue-700';
                  const tipoLabel = isVenta ? 'VENTA / SALIDA' : isCompra ? 'COMPRA / ENTRADA' : mov.type;
                  const almacenLabel = isVenta
                    ? `Salió de: ${mov.warehouse}`
                    : isCompra
                    ? `Entró a: ${mov.warehouse}`
                    : mov.warehouse;
                  return (
                    <div className={`border rounded-2xl p-4 space-y-3 ${accentColor}`}>
                      <div className="flex items-center justify-between">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${labelColor}`}>Detalle de Movimiento</p>
                        <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-lg ${isVenta ? 'bg-emerald-600 text-white' : isCompra ? 'bg-red-600 text-white' : 'bg-blue-600 text-white'}`}>{tipoLabel}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {/* SKU + Nombre */}
                        <div className="col-span-2 bg-white/70 rounded-xl p-3">
                          <p className="text-[8px] text-slate-400 font-black uppercase mb-0.5">Producto</p>
                          <p className="text-[10px] font-black text-slate-500 font-mono">{mov.sku}</p>
                          <p className="text-[12px] font-black text-slate-900 uppercase leading-tight">{product?.description ?? mov.sku}</p>
                        </div>
                        {/* Cantidad */}
                        <div className="bg-white/70 rounded-xl p-3">
                          <p className="text-[8px] text-slate-400 font-black uppercase mb-0.5">Cantidad</p>
                          <p className={`text-[15px] font-black ${isVenta ? 'text-emerald-700' : 'text-red-700'}`}>
                            {isVenta ? '-' : '+'}{Math.abs(mov.qty)} {product?.unit ?? ''}
                          </p>
                        </div>
                        {/* Precio total */}
                        <div className="bg-white/70 rounded-xl p-3">
                          <p className="text-[8px] text-slate-400 font-black uppercase mb-0.5">Total Movimiento</p>
                          {totalUSD !== null
                            ? <p className={`text-[15px] font-black ${isVenta ? 'text-emerald-700' : 'text-red-700'}`}>${totalUSD.toFixed(2)}</p>
                            : <p className="text-[11px] font-black text-slate-400">—</p>
                          }
                          {product && <p className="text-[8px] text-slate-400">@ ${product.priceUSD.toFixed(2)} c/u</p>}
                        </div>
                        {/* Almacén origen/destino */}
                        <div className="col-span-2 bg-white/70 rounded-xl p-3">
                          <p className="text-[8px] text-slate-400 font-black uppercase mb-0.5">Almacén</p>
                          <p className="text-[11px] font-black text-slate-900 uppercase">{almacenLabel}</p>
                        </div>
                      </div>
                      {mov.reason && (
                        <div className="bg-white/70 rounded-xl p-3">
                          <p className="text-[8px] text-slate-400 font-black uppercase mb-0.5">Referencia</p>
                          <p className="text-[10px] font-bold text-slate-700">{mov.reason}</p>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              })()}

            </div>
            {/* Footer fijo — siempre visible */}
            <div className="p-4 border-t border-slate-100 bg-white rounded-b-[2.5rem] flex-shrink-0">
              <button onClick={() => setSelectedEvent(null)} className="w-full py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MetricCard({ title, value, trend, detail, color, icon: Icon }: any) {
  const colors: any = {
    emerald: 'text-emerald-500 bg-emerald-50/50 border-emerald-100',
    blue: 'text-blue-500 bg-blue-50/50 border-blue-100',
    amber: 'text-amber-500 bg-amber-50/50 border-amber-100',
    slate: 'text-slate-500 bg-slate-50 border-slate-100'
  };

  return (
    <div className="bg-white p-4 xl:p-8 rounded-[1.5rem] xl:rounded-[2.5rem] border border-slate-200/50 shadow-sm hover:shadow-xl hover:shadow-slate-100/50 transition-all duration-300 group cursor-pointer overflow-hidden relative">
       <div className="absolute -right-4 -top-4 p-8 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
          <Icon className="w-24 h-24" />
       </div>
       <div className="flex justify-between items-start mb-4 xl:mb-8 relative z-10">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
           <div className={`p-3 rounded-2xl ${colors[color]} group-hover:rotate-12 transition-transform`}>
             <Icon className="w-4 h-4" />
          </div>
       </div>
       <div className="space-y-2 relative z-10 text-left">
          <h3 className="text-xl xl:text-3xl font-black font-headline tracking-tighter text-slate-900 group-hover:translate-x-1 transition-transform leading-none">{value}</h3>
          <div className="flex justify-between items-center pt-4 border-t border-slate-50">
             <span className={`text-[10px] font-black uppercase tracking-widest ${color === 'slate' ? 'text-slate-500' : colors[color].split(' ')[0]}`}>{trend}</span>
             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{detail}</span>
          </div>
       </div>
    </div>
  );
}
