import React, { useState, useMemo, useEffect } from 'react';
import {
  Package,
  Search,
  Filter,
  ArrowRightLeft,
  History,
  AlertTriangle,
  TrendingDown,
  Timer,
  PlusCircle,
  BarChart3,
  FileDown,
  ArrowRight,
  X,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Activity,
  Calendar,
  Camera,
  Clipboard,
  CreditCard,
  DollarSign,
  FileImage,
  FileText,
  Upload,
  Pencil,
  Eye,
  Save,
  ClipboardList,
  Building2,
  TrendingUp,
  BookOpen,
  Trash2,
  ShieldAlert,
  Lock
} from 'lucide-react';
import { ConfirmModal } from '../ConfirmModal';
import { formatQuantity } from '../../utils/costCalculations';
import { dataService, Batch, ProductPriceHistoryRecord } from '../../services/dataService';
import { reportService } from '../../services/reportService';
import { useHotkeys } from '../../utils/hotkeys';
import { PurchaseEntryModal } from '../modals/PurchaseEntryModal';
import { PurchaseOrdersPanelModal } from '../modals/PurchaseOrdersPanelModal';
import { formatDateVE, formatTimeVE } from '../../utils/dateTimeVE';

export function InventoryView({ exchangeRate = 36.50 }: { exchangeRate?: number }) {
  // SEC-08: Helper de permisos
  const hasPermission = (key: string) => dataService.hasPermission(key as any);
  const canEditInventory = hasPermission('INVENTORY_WRITE') || hasPermission('ALL');
  const canFractionate = hasPermission('FRACTIONATION') || hasPermission('ALL');
  const isSuperUser = hasPermission('superUsuario') || hasPermission('Master');
  const showPurchaseOrdersButton = false; // Ocultar temporalmente "Ordenes OC".
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [showInputModal, setShowInputModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showManufacturingModal, setShowManufacturingModal] = useState(false);
  const [, setTick] = useState(0);
  const [batchDetailLote, setBatchDetailLote] = useState<Batch | null>(null);
  const [batchDetailProduct, setBatchDetailProduct] = useState<string>('');
  const [showPurchaseHistory, setShowPurchaseHistory] = useState(false);
  const [purchaseSearch, setPurchaseSearch] = useState('');
  const [kardexProduct, setKardexProduct] = useState<{ code: string; description: string; unit: string } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ code: string; description: string; stock: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [superUserCode, setSuperUserCode] = useState('');
  const [showSuperUserModal, setShowSuperUserModal] = useState(false);
  const [isSuperUserDeleting, setIsSuperUserDeleting] = useState(false);
  const [voidConfirm, setVoidConfirm] = useState<{ entry: any } | null>(null);
  const [voidPin, setVoidPin] = useState('');
  const [voidObservation, setVoidObservation] = useState('');
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidPinError, setVoidPinError] = useState('');
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showPurchaseOrdersModal, setShowPurchaseOrdersModal] = useState(false);

  React.useEffect(() => {
    return dataService.subscribe(() => setTick(t => t + 1));
  }, []);

  const stocks = dataService.getStocks();
  const movements = dataService.getMovements();
  const apEntries = dataService.getAPEntries();
  const contraction = dataService.getContractionIndex();

  // UX-01 FIX: Memoizar cálculos costosos para mejorar rendimiento con muchos lotes
  const totalValUSD = useMemo(() => 
    stocks.reduce((acc, p) =>
      acc + p.lotes.reduce((la, lb) => la + (lb.qty * lb.costUSD), 0), 0
    ), [stocks]);

  // Usar debounce en búsqueda para evitar filtrado constante mientras escribe
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 150);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const filteredItems = useMemo(() => {
    // Si no hay búsqueda, retornar todos (limitado a 1000 para rendimiento)
    if (!debouncedSearch.trim()) {
      return stocks.slice(0, 1000).map(item => ({
        ...item,
        total: item.d3 + item.d2 + item.a1,
        status: (item.d3 + item.d2 + item.a1) < item.min ? 'Crítico' : 'Óptimo',
        statusClass: (item.d3 + item.d2 + item.a1) < item.min ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-800'
      }));
    }
    
    const searchLower = debouncedSearch.toLowerCase();
    return stocks
      .filter(i =>
        i.code.toLowerCase().includes(searchLower) ||
        i.description.toLowerCase().includes(searchLower)
      )
      .slice(0, 500) // Limitar resultados para mantener velocidad
      .map(item => ({
        ...item,
        total: item.d3 + item.d2 + item.a1,
        status: (item.d3 + item.d2 + item.a1) < item.min ? 'Crítico' : 'Óptimo',
        statusClass: (item.d3 + item.d2 + item.a1) < item.min ? 'bg-red-100 text-red-700' : 'bg-emerald-50 text-emerald-800'
      }));
  }, [stocks, debouncedSearch]);

  const totalConsolidated = useMemo(() => 
    filteredItems.reduce((acc, item) => acc + item.total, 0),
  [filteredItems]);

  const fefoList = useMemo(() => {
    // Solo calcular FEFO si hay búsqueda o es la carga inicial
    // Limitar a 100 lotes para evitar procesamiento excesivo
    return stocks
      .flatMap(s => s.lotes)
      .sort((a, b) => a.expiry.getTime() - b.expiry.getTime())
      .slice(0, 5);
  }, [stocks]);

  useHotkeys({
    // SEC-08: Solo permitir hotkeys si tiene permisos
    'F7': () => canEditInventory && setShowInputModal(true),
    'F4': () => canEditInventory && setShowTransferModal(true),
    'Escape': () => { setShowTransferModal(false); setShowInputModal(false); setShowReturnModal(false); setShowNoteModal(false); setShowManufacturingModal(false); setShowAdjustModal(false); setShowPurchaseOrdersModal(false); setExpandedCode(null); },
  });

  const formatTraceDate = (value?: string | Date) => {
    if (!value) return '-';
    const parsed = value instanceof Date ? value : new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : formatDateVE(parsed);
  };

  const handleDeleteProduct = (code: string, description: string, stock: number) => {
    setDeleteConfirm({ code, description, stock });
  };

  const confirmDeleteProduct = async () => {
    if (!deleteConfirm) return;
    
    setIsDeleting(true);
    try {
      await dataService.deleteProduct(deleteConfirm.code);
      setDeleteConfirm(null);
      // Forzar recarga de datos
      setTick(t => t + 1);
    } catch (error) {
      console.error('Error eliminando producto:', error);
      alert(`Error eliminando producto: ${error.message}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSuperUsuario = async () => {
    if (!superUserCode.trim()) {
      alert('Debe ingresar el código del producto a eliminar.');
      return;
    }

    setIsSuperUserDeleting(true);
    try {
      const result = await dataService.superUsuario(superUserCode.trim().toUpperCase());
      alert(result);
      setSuperUserCode('');
      setShowSuperUserModal(false);
      // Forzar recarga de datos
      setTick(t => t + 1);
    } catch (error) {
      alert(error.message);
    } finally {
      setIsSuperUserDeleting(false);
    }
  };

  const openBatchSupport = (lote: Batch) => {
    const url = String(lote.supports?.[0]?.url ?? lote.invoiceImage ?? '').trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-700 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900 rounded-lg shadow-emerald-900/40 shadow-lg">
              <Package className="w-5 h-5 text-emerald-100" />
            </div>
            <h2 className="font-headline text-xl md:text-2xl font-black tracking-tight text-slate-900">Compras e Inventario</h2>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:gap-3">
          <button
            onClick={() => setShowPurchaseHistory(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
          >
            <ClipboardList className="w-4 h-4 text-blue-600" /> Historial
          </button>
          {canEditInventory && showPurchaseOrdersButton && (
            <button
              type="button"
              onClick={() => setShowPurchaseOrdersModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-indigo-200 text-indigo-900 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-indigo-50 transition-all"
            >
              <Clipboard className="w-4 h-4 text-indigo-600" /> Órdenes OC
            </button>
          )}
          <button
            onClick={() => reportService.exportInventoryToPDF({ pricing: 'cost', currency: 'USD' })}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-900 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all"
          >
            <FileDown className="w-4 h-4 text-emerald-600" /> Valorización (Costo)
          </button>
          <button
            onClick={() => setShowInputModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-emerald-900/10 hover:bg-emerald-800 transition-all"
          >
            <PlusCircle className="w-4 h-4" /> Compras
          </button>
          {isSuperUser && (
            <button
              onClick={() => setShowSuperUserModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all"
            >
              <Trash2 className="w-4 h-4" /> SuperUsuario
            </button>
          )}
          {canEditInventory && (
            <button
              onClick={() => setShowReturnModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-red-600/10 hover:bg-red-700 transition-all"
            >
              <ArrowRightLeft className="w-4 h-4" /> Devoluciones
            </button>
          )}
          {canEditInventory && (
            <button
              onClick={() => setShowNoteModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-amber-600/10 hover:bg-amber-700 transition-all"
            >
              <CreditCard className="w-4 h-4" /> Nota C/D
            </button>
          )}
          {canFractionate && (
            <button
              onClick={() => setShowManufacturingModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-blue-600/10 hover:bg-blue-700 transition-all"
            >
              <Package className="w-4 h-4" /> Fabricación
            </button>
          )}
          {canEditInventory && (
            <button
              onClick={() => setShowAdjustModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl shadow-orange-600/10 hover:bg-orange-700 transition-all"
            >
              <ShieldAlert className="w-4 h-4" /> Ajuste Inv.
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard title="Stock Consolidado" value={formatQuantity(totalConsolidated)} unit="kg" progress={82} icon={BarChart3} color="emerald" />
        <MetricCard title="Índice de Contracción" value={contraction.toFixed(2)} unit="%" valueColor="text-red-500" subtitle="Merma sobre Carga" icon={Activity} color="red" />
        <MetricCard title="Valor Neto Inventario" value={totalValUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })} unit="USD" subtitle={`≃ Bs. ${(totalValUSD * exchangeRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`} icon={TrendingDown} color="slate" />
        <MetricCard title="Próximos Vencimientos" value={fefoList.length.toString()} unit="LOTES" subtitle="Protocolo FEFO" icon={Calendar} color="amber" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6 items-start">
        <div className="md:col-span-8 bg-white rounded-[2rem] shadow-sm border border-slate-200/50 overflow-hidden flex flex-col transition-all">
          <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-[#f8fafc]/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <h4 className="font-headline font-black text-base md:text-lg tracking-tighter text-slate-900">Maestro de Existencias</h4>
              <div className="flex items-center bg-white px-3 py-2 rounded-xl border border-slate-200/60 shadow-inner">
                <Search className="w-3.5 h-3.5 text-slate-300 mr-2" />
                <input
                  type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar por SKU o Nombre..."
                  className="bg-transparent border-none text-[10px] font-black text-slate-600 focus:ring-0 w-full sm:w-44 outline-none placeholder:text-slate-300 uppercase tracking-widest"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowTransferModal(true)} className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl text-[8px] font-black uppercase tracking-widest hover:bg-slate-800 shadow-lg">
                <ArrowRightLeft className="w-3 h-3" /> Movimiento Interno (F4)
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#f8fafc] text-[7px] uppercase tracking-widest text-slate-400 font-black border-b border-slate-100">
                  <th className="px-5 py-3 w-[40px]"></th>
                  <th className="px-5 py-3 w-[150px]">SKU / ID</th>
                  <th className="px-5 py-3">Descripción Correo-Biológico</th>
                  <th className="px-4 py-3 text-right bg-blue-50/20">GALPÓN D3</th>
                  <th className="px-4 py-3 text-right bg-amber-50/20">PESA D2</th>
                  <th className="px-4 py-3 text-right bg-emerald-50/20">EXIBICIÓN D1</th>
                  <th className="px-5 py-3 text-right bg-slate-100/50">TOTAL</th>
                  <th className="px-4 py-3 text-center w-[80px]">ACCIONES</th>
                </tr>
              </thead>
              <tbody className="text-[12px]">
                {filteredItems.map((item, i) => (
                  <React.Fragment key={item.code}>
                    <tr className={`hover:bg-slate-50 transition-all border-b border-slate-50 group cursor-pointer ${expandedCode === item.code ? 'bg-slate-50' : ''}`} onClick={() => setExpandedCode(expandedCode === item.code ? null : item.code)}>
                      <td className="px-4 py-3 text-slate-300">{expandedCode === item.code ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                      <td className="px-5 py-3 font-mono text-[10px] font-black text-slate-400 group-hover:text-emerald-700 transition-colors uppercase">{item.code}</td>
                      <td className="px-5 py-3 font-black text-slate-800 uppercase tracking-tighter text-[11px]">{item.description}</td>
                      <td className="px-4 py-3 text-right font-black text-blue-600/80 font-mono text-[11px]">{formatQuantity(item.d3)}</td>
                      <td className="px-4 py-3 text-right font-black text-amber-600/80 font-mono text-[11px]">{formatQuantity(item.d2)}</td>
                      <td className="px-4 py-3 text-right font-black text-emerald-600/80 font-mono text-[11px]">{formatQuantity(item.a1)}</td>
                      <td className="px-5 py-3 text-right bg-slate-50/30">
                        <div className="flex flex-col items-end leading-none">
                          <span className={`font-black text-[13px] tracking-tighter ${item.status === 'Crítico' ? 'text-red-500' : 'text-slate-900'}`}>{formatQuantity(item.total)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canEditInventory && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProduct(item.code, item.description, item.total);
                            }}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-all"
                            title="Eliminar producto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedCode === item.code && (
                      <tr className="bg-slate-100/30 border-b border-slate-200">
                        <td colSpan={8} className="px-12 py-4">
                          <div className="space-y-4">
                            <div className="flex justify-between items-center px-4">
                               <div className="flex items-center gap-2 font-black text-[8px] uppercase text-slate-400 tracking-widest">
                                 <Timer className="w-3 h-3" /> Desglose por Lote (Protocolo FEFO)
                               </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {item.lotes.sort((a, b) => a.expiry.getTime() - b.expiry.getTime()).map(lote => {
                                const displayBatch = String(lote.batch ?? lote.id ?? '').trim() || String(lote.id ?? '');
                                const supportCount = Array.isArray(lote.supports) ? lote.supports.length : 0;
                                return (
                                  <div key={lote.id + lote.warehouse} className="bg-white border rounded-xl p-4 shadow-sm flex flex-col gap-3 group/lote relative">
                                    <div className="flex justify-between items-center gap-3">
                                      <div>
                                        <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Lote {displayBatch}</span>
                                        <div className="text-[8px] font-mono text-slate-400 mt-1">ID Interno: {lote.id}</div>
                                      </div>
                                      <span className="text-[7px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded uppercase">{lote.warehouse}</span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="text-[7px] font-black uppercase tracking-widest text-slate-400">Factura</div>
                                        <div className="mt-1 text-[10px] font-black text-slate-900 uppercase">{lote.invoiceNumber || '-'}</div>
                                      </div>
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                        <div className="text-[7px] font-black uppercase tracking-widest text-slate-400">Ingreso</div>
                                        <div className="mt-1 text-[10px] font-black text-slate-900 uppercase">{formatTraceDate(lote.entryDate)}</div>
                                      </div>
                                    </div>

                                    <div className="space-y-1">
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                        Proveedor: <span className="text-slate-900">{lote.supplier || 'N/A'}</span>
                                      </p>
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                        Pago: <span className={`font-black ${lote.paymentType === 'CREDIT' ? 'text-amber-600' : 'text-emerald-600'}`}>{lote.paymentType || 'N/A'}</span>
                                      </p>
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                        Almacén: <span className="text-slate-900">{lote.warehouse || '-'}</span>
                                      </p>
                                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                        Unidad: <span className="text-slate-900">{lote.unit || 'KG'}</span>
                                      </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div className="rounded-xl border border-slate-100 bg-emerald-50/60 px-3 py-2">
                                        <div className="text-[7px] font-black uppercase tracking-widest text-emerald-700">Cantidad</div>
                                        <div className="mt-1 text-[10px] font-mono font-black text-emerald-700">{formatQuantity(lote.qty)} {lote.unit || 'KG'}</div>
                                      </div>
                                      <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                                        <div className="text-[7px] font-black uppercase tracking-widest text-slate-400">Costo línea</div>
                                        <div className="mt-1 text-[10px] font-mono font-black text-slate-900">$ {((Number(lote.qty ?? 0) || 0) * (Number(lote.costUSD ?? 0) || 0)).toFixed(2)}</div>
                                      </div>
                                    </div>

                                    <div className="flex justify-between items-end mt-1 border-t pt-2 border-slate-50">
                                      <div>
                                        <p className={`text-[8px] font-bold ${new Date(lote.expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 ? 'text-red-500' : 'text-slate-400'}`}>
                                          Exp: {formatDateVE(lote.expiry)}
                                        </p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase">
                                          Factura total: $ {Number(lote.totalInvoiceUSD ?? 0).toFixed(2)}
                                        </p>
                                      </div>
                                      {(lote.invoiceImage || supportCount > 0) && (
                                        <button
                                          type="button"
                                          onClick={() => openBatchSupport(lote)}
                                          className="p-1.5 bg-slate-100 rounded-lg text-slate-400 hover:bg-slate-900 hover:text-white transition-all opacity-0 group-hover/lote:opacity-100"
                                          title="Ver soporte"
                                        >
                                          <Camera className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>

                                    <div className="flex items-center justify-between">
                                      <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                                        Soportes: <span className="text-slate-900">{supportCount || (lote.invoiceImage ? 1 : 0)}</span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => { setBatchDetailLote(lote); setBatchDetailProduct(item.description); }}
                                        className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-900 text-emerald-700 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border border-emerald-200 hover:border-emerald-900"
                                        title="Ver detalle y editar precio"
                                      >
                                        <Pencil className="w-3 h-3" /> Editar
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="pt-2 border-t border-slate-200 flex justify-end">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setKardexProduct({ code: item.code, description: item.description, unit: item.unit }); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-900 text-indigo-700 hover:text-white rounded-lg text-[8px] font-black uppercase tracking-widest transition-all border border-indigo-200 hover:border-indigo-900"
                              >
                                <BookOpen className="w-3 h-3" /> Kardex
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-[9px] font-bold text-slate-500 uppercase">Valores calculados dinámicamente según mermas naturales (deshidratación) y manipulación física.</p>
          </div>
        </div>

        <div className="md:col-span-12 xl:col-span-4 space-y-6">
          <div className="bg-[#022c22] p-6 rounded-[2.5rem] shadow-xl text-white relative overflow-hidden group">
            <div className="flex items-center gap-3 mb-6 relative z-10">
              <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30">
                <Timer className="w-4 h-4 text-emerald-400" />
              </div>
              <h4 className="font-headline font-black text-xs uppercase tracking-widest text-emerald-100">Prioridad FEFO (First Expired)</h4>
            </div>
            <div className="space-y-3 relative z-10">
              {fefoList.map((lote) => (
                <div key={lote.id} className={`p-4 rounded-xl border transition-all ${new Date(lote.expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 ? 'bg-red-500/10 border-red-500/30' : 'bg-white/5 border-white/10'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black text-emerald-500 uppercase tracking-tighter">{lote.id} • {lote.warehouse}</p>
                      <h5 className="font-black text-[10px] uppercase text-white mt-0.5">{stocks.find(s => s.code === lote.sku)?.description}</h5>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[7px] font-black uppercase ${new Date(lote.expiry).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000 ? 'bg-red-500 text-white' : 'bg-emerald-500/20 text-emerald-400'}`}>Exp: {formatDateVE(lote.expiry)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-[2rem] border border-slate-200/50 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <History className="w-4 h-4 text-slate-400" />
                <h4 className="font-headline font-black text-xs uppercase tracking-widest text-slate-900">Live Operation Feed</h4>
              </div>
              <span className="text-[7px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 animate-pulse">LIVE</span>
            </div>
            <div className="space-y-4">
              {movements.slice(0, 5).map((log, idx) => (
                <div key={idx} className="flex gap-3 animate-in slide-in-from-right duration-500">
                  <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${log.type === 'IN' || log.type === 'FRACTION' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                  <div className="space-y-0.5 text-left">
                    <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{log.type}: {log.sku}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tight">
                      {log.warehouse} • {formatQuantity(Math.abs(log.qty))} KG • {formatTimeVE(log.timestamp, { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showInputModal && (
        <PurchaseEntryModal
          products={dataService.getAllStocks()}
          onClose={() => setShowInputModal(false)}
          onSaved={() => setShowInputModal(false)}
        />
      )}

      {showPurchaseOrdersModal && (
        <PurchaseOrdersPanelModal onClose={() => setShowPurchaseOrdersModal(false)} />
      )}

      {showTransferModal && (
        <TransferModal
          stocks={stocks}
          onClose={() => setShowTransferModal(false)}
          onSaved={() => setTick(t => t + 1)}
        />
      )}

      {showAdjustModal && (
        <InventoryAdjustmentModal
          stocks={stocks}
          onClose={() => setShowAdjustModal(false)}
          onSaved={() => setTick(t => t + 1)}
        />
      )}

      {showReturnModal && (
        <PurchaseReturnModal
          stocks={stocks}
          onClose={() => setShowReturnModal(false)}
          onSaved={() => setShowReturnModal(false)}
        />
      )}

      {showNoteModal && (
        <PurchaseAdjustmentNoteModal
          apEntries={apEntries}
          onClose={() => setShowNoteModal(false)}
          onSaved={() => setShowNoteModal(false)}
        />
      )}

      {showManufacturingModal && (
        <ManufacturingModal
          stocks={stocks}
          onClose={() => setShowManufacturingModal(false)}
          onSaved={() => setShowManufacturingModal(false)}
        />
      )}

      {batchDetailLote && (
        <BatchDetailModal
          lote={batchDetailLote}
          productDescription={batchDetailProduct}
          onClose={() => setBatchDetailLote(null)}
          onSaved={(updatedLote) => { setBatchDetailLote(updatedLote); }}
        />
      )}

      {showPurchaseHistory && (
        <PurchaseHistoryModal
          dataService={dataService}
          search={purchaseSearch}
          onSearchChange={setPurchaseSearch}
          onClose={() => { setShowPurchaseHistory(false); setPurchaseSearch(''); }}
          onVoid={async (entry) => {
            setVoidConfirm({ entry });
            setVoidPin('');
            setVoidObservation('');
            setVoidPinError('');
          }}
        />
      )}

      {kardexProduct && (
        <KardexModal
          product={kardexProduct}
          movements={movements}
          stocks={stocks}
          onClose={() => setKardexProduct(null)}
        />
      )}

      {/* Modal de confirmación para eliminar producto */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
              <div className="flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-red-600" />
                <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Eliminar Producto</h3>
              </div>
              <button onClick={() => setDeleteConfirm(null)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-black text-red-900 mb-2">¿Está seguro que desea eliminar este producto?</p>
                <div className="space-y-1 text-xs text-red-700">
                  <p><strong>Código:</strong> {deleteConfirm.code}</p>
                  <p><strong>Descripción:</strong> {deleteConfirm.description}</p>
                  <p><strong>Stock actual:</strong> {deleteConfirm.stock} unidades</p>
                </div>
              </div>

              {deleteConfirm.stock > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <p className="text-xs font-black text-amber-900">
                    ⚠️ Este producto tiene stock. No se puede eliminar hasta que todo el stock sea vendido o devuelto.
                  </p>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <p className="text-xs text-slate-700">
                  <strong>Importante:</strong> Al eliminar este producto:
                </p>
                <ul className="text-xs text-slate-600 mt-2 space-y-1">
                  <li>• Se eliminarán todos sus lotes (incluso sin stock)</li>
                  <li>• Se liberará el correlativo {deleteConfirm.code} para uso futuro</li>
                  <li>• Esta acción no se puede deshacer</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDeleteProduct}
                disabled={isDeleting || deleteConfirm.stock > 0}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60 ${
                  deleteConfirm.stock > 0 
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmación de Anulación con PIN y Observación */}
      {voidConfirm && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-xl">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                </div>
                <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Anular Compra</h3>
              </div>
              <button onClick={() => setVoidConfirm(null)} disabled={isVoiding} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-1">
                <p className="text-xs font-black text-red-900 uppercase tracking-wider">Compra a anular</p>
                <p className="text-sm font-black text-slate-900">{voidConfirm.entry.invoiceNumber || voidConfirm.entry.description}</p>
                <p className="text-xs text-slate-500">{voidConfirm.entry.supplier} · ${Number(voidConfirm.entry.amountUSD || 0).toFixed(2)}</p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Motivo u observación <span className="text-red-500">*</span></label>
                <textarea
                  value={voidObservation}
                  onChange={e => setVoidObservation(e.target.value)}
                  placeholder="Explique el motivo de la anulación..."
                  rows={3}
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-black text-slate-700 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" /> Confirmar con su clave
                </label>
                <input
                  type="password"
                  value={voidPin}
                  onChange={e => { setVoidPin(e.target.value); setVoidPinError(''); }}
                  placeholder="Ingrese su PIN o contraseña"
                  className={`w-full px-4 py-3 border rounded-xl text-sm font-mono font-black text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent ${
                    voidPinError ? 'border-red-400 bg-red-50' : 'border-slate-200'
                  }`}
                />
                {voidPinError && <p className="text-xs font-black text-red-600">{voidPinError}</p>}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setVoidConfirm(null)}
                disabled={isVoiding}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  if (!voidObservation.trim()) {
                    setVoidPinError('Debe ingresar una observación.');
                    return;
                  }
                  if (!voidPin.trim()) {
                    setVoidPinError('Debe ingresar su clave.');
                    return;
                  }
                  if (!dataService.verifyCurrentUserPin(voidPin)) {
                    setVoidPinError('Clave incorrecta. Intente nuevamente.');
                    return;
                  }
                  setIsVoiding(true);
                  try {
                    const entry = voidConfirm.entry;
                    if (entry.isCashPurchase) {
                      await dataService.voidPurchaseEntry(entry.invoiceGroupId || entry.purchaseEntryId, '', voidObservation);
                    } else {
                      await dataService.voidPurchaseEntry('', entry.id, voidObservation);
                    }
                    setVoidConfirm(null);
                    setTick(t => t + 1);
                  } catch (err: any) {
                    setVoidPinError(err.message || 'Error al anular.');
                  } finally {
                    setIsVoiding(false);
                  }
                }}
                disabled={isVoiding || !voidObservation.trim() || !voidPin.trim()}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-60"
              >
                {isVoiding ? 'Anulando...' : 'Confirmar Anulación'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal SuperUsuario - Eliminar productos con errores de compra */}
      {showSuperUserModal && (
        <div className="fixed inset-0 z-[360] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
            <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
              <div className="flex items-center gap-3">
                <Trash2 className="w-6 h-6 text-red-600" />
                <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">SuperUsuario</h3>
              </div>
              <button onClick={() => setShowSuperUserModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-sm font-black text-red-900 mb-2">🔧 Eliminar Producto con Errores de Compra</p>
                <p className="text-xs text-red-700">
                  Esta función elimina completamente un producto con stock basura de compras fallidas.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider">Código del Producto</label>
                <input
                  type="text"
                  value={superUserCode}
                  onChange={(e) => setSuperUserCode(e.target.value.toUpperCase())}
                  placeholder="Ej: P-5422"
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-mono font-black text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                />
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-black text-amber-900">
                  ⚠️ Esta acción eliminará permanentemente:
                </p>
                <ul className="text-xs text-amber-700 mt-2 space-y-1">
                  <li>• Todos los lotes del producto</li>
                  <li>• Todos los movimientos (kardex)</li>
                  <li>• El producto completo</li>
                  <li>• Liberará el correlativo</li>
                </ul>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSuperUserModal(false)}
                disabled={isSuperUserDeleting}
                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={handleSuperUsuario}
                disabled={isSuperUserDeleting || !superUserCode.trim()}
                className="flex-1 bg-red-600 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-60"
              >
                {isSuperUserDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function KardexModal({ product, movements, stocks, onClose }: {
  product: { code: string; description: string; unit: string };
  movements: any[];
  stocks: any[];
  onClose: () => void;
}) {
  const [kardexFilter, setKardexFilter] = useState('');

  const productData = stocks.find(s => s.code === product.code);
  const currentStock = productData?.lotes?.reduce((s: number, l: any) => s + (l.qty || 0), 0) || 0;

  // Tipos con signo FIJO: siempre entran o siempre salen
  const TYPE_LABELS: Record<string, { label: string; color: string; sign: 1 | -1 | 'AUTO' }> = {
    // Ingresos (siempre +)
    'IN':             { label: 'Entrada',              color: 'text-emerald-700 bg-emerald-50',  sign: 1 },
    'PURCHASE':       { label: 'Compra',               color: 'text-emerald-700 bg-emerald-50',  sign: 1 },
    'SALE_RETURN':    { label: 'Devolución venta',     color: 'text-purple-700 bg-purple-50',    sign: 1 },
    'RETURN':         { label: 'Devolución',           color: 'text-purple-700 bg-purple-50',    sign: 1 },
    'MANUFACTURING':  { label: 'Producción',           color: 'text-sky-700 bg-sky-50',          sign: 1 },
    'VOID':           { label: 'Anulación venta',      color: 'text-rose-700 bg-rose-50',        sign: 1 },
    'ADJUSTMENT_IN':  { label: 'Ajuste (+)',           color: 'text-amber-700 bg-amber-50',      sign: 1 },
    // Egresos (siempre -)
    'OUT':            { label: 'Salida',               color: 'text-red-700 bg-red-50',          sign: -1 },
    'SALE':           { label: 'Venta',                color: 'text-red-700 bg-red-50',          sign: -1 },
    'FRACTION':       { label: 'Fraccionado',          color: 'text-blue-700 bg-blue-50',        sign: -1 },
    'WASTE':          { label: 'Merma',                color: 'text-rose-700 bg-rose-50',        sign: -1 },
    'PURCHASE_RETURN':{ label: 'Dev. proveedor',       color: 'text-orange-700 bg-orange-50',    sign: -1 },
    'ADJUSTMENT_OUT': { label: 'Ajuste (-)',           color: 'text-amber-700 bg-amber-50',      sign: -1 },
    'TRANSFER_OUT':   { label: 'Traslado (sale)',      color: 'text-indigo-700 bg-indigo-50',    sign: -1 },
    // Signo VARIABLE: la dirección viene en el signo de quantity guardado en BD
    'ADJUST':         { label: 'Ajuste',               color: 'text-amber-700 bg-amber-50',      sign: 'AUTO' },
    'AJUSTE':         { label: 'Ajuste',               color: 'text-amber-700 bg-amber-50',      sign: 'AUTO' },
    'BATCH_ADJUST':   { label: 'Ajuste de lote',       color: 'text-amber-700 bg-amber-50',      sign: 'AUTO' },
    'TRANSFER':       { label: 'Traslado',             color: 'text-indigo-700 bg-indigo-50',    sign: 'AUTO' },
  };

  const skuMovements = useMemo(() => {
    const seenIds = new Set<string>();
    const raw = movements
      .filter((m: any) => m.sku === product.code)
      .filter((m: any) => {
        const id = String(m.id ?? '');
        if (!id) return true;
        if (seenIds.has(id)) return false;
        seenIds.add(id);
        return true;
      })
      .sort((a, b) => {
        const ta = new Date((a as any).timestamp).getTime();
        const tb = new Date((b as any).timestamp).getTime();
        const sa = Number.isNaN(ta) ? 0 : ta;
        const sb = Number.isNaN(tb) ? 0 : tb;
        if (sa !== sb) return sa - sb;
        return String((a as any).id).localeCompare(String((b as any).id));
      });

    // Paso 1: delta por fila
    const steps = raw.map(m => {
      const rawQty = Number(m.qty ?? 0) || 0;
      const typeU = String(m.type ?? '').toUpperCase();
      const info = TYPE_LABELS[typeU] ?? { label: m.type, color: 'text-slate-700 bg-slate-50', sign: 'AUTO' as const };
      const delta = info.sign === 'AUTO' ? rawQty : info.sign * Math.abs(rawQty);
      const direction: 1 | -1 | 0 = delta > 0.0000001 ? 1 : delta < -0.0000001 ? -1 : 0;
      return { m, info, absQty: Math.abs(delta), direction, delta };
    });

    // Saldo inicial: el sistema solo guarda N movimientos en memoria; si faltan compras antiguas,
    // acumular desde 0 nunca iguala el stock de lotes. Ajustamos apertura para que el último
    // saldo cronológico = stock actual (fuente de verdad = lotes).
    const totalNet = steps.reduce((s, x) => s + x.delta, 0);
    const apertura = Math.round((currentStock - totalNet) * 1000) / 1000;
    let saldo = apertura;
    return steps
      .map(({ m, info, absQty, direction, delta }) => {
        saldo = Math.round((saldo + delta) * 1000) / 1000;
        return { ...m, info, absQty, direction, saldoAcum: saldo };
      })
      .reverse();
  }, [movements, product.code, currentStock]);

  const filtered = useMemo(() => {
    if (!kardexFilter.trim()) return skuMovements;
    const q = kardexFilter.toLowerCase();
    return skuMovements.filter(m =>
      (m.warehouse ?? '').toLowerCase().includes(q) ||
      (m.reason ?? '').toLowerCase().includes(q) ||
      (m.user ?? '').toLowerCase().includes(q) ||
      (m.type ?? '').toLowerCase().includes(q)
    );
  }, [skuMovements, kardexFilter]);

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-start justify-end">
      <div className="h-full w-full max-w-2xl bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="bg-indigo-900 px-6 py-5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4 text-indigo-300" />
              <span className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Kardex de Inventario</span>
            </div>
            <p className="text-white font-black text-base uppercase leading-tight">{product.description}</p>
            <p className="text-indigo-300 text-[9px] font-mono mt-0.5">SKU: {product.code}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-indigo-800 rounded-lg transition-colors shrink-0">
            <X className="w-4 h-4 text-indigo-200" />
          </button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 divide-x border-b shrink-0">
          <div className="px-5 py-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Stock actual</p>
            <p className="text-[18px] font-black font-mono text-emerald-700 mt-0.5">{currentStock.toFixed(3)} <span className="text-[10px] text-slate-400">{product.unit}</span></p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total movimientos</p>
            <p className="text-[18px] font-black font-mono text-slate-800 mt-0.5">{skuMovements.length}</p>
          </div>
          <div className="px-5 py-3">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Entradas totales</p>
            <p className="text-[18px] font-black font-mono text-indigo-700 mt-0.5">
              {skuMovements.filter(m => m.direction === 1).reduce((a, m) => a + m.absQty, 0).toFixed(3)}
            </p>
          </div>
        </div>

        {/* Filtro */}
        <div className="px-5 py-3 border-b shrink-0">
          <div className="flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200">
            <Search className="w-3.5 h-3.5 text-slate-300 mr-2 shrink-0" />
            <input
              type="text" value={kardexFilter} onChange={e => setKardexFilter(e.target.value)}
              placeholder="Filtrar por tipo, almacén, operador, referencia..."
              className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full placeholder:text-slate-300"
            />
          </div>
        </div>

        {/* Tabla */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-300 py-20">
              <BookOpen className="w-10 h-10 mb-3" />
              <p className="text-[10px] font-black uppercase tracking-widest">Sin movimientos registrados</p>
            </div>
          ) : (
            <table className="w-full text-left text-[10px]">
              <thead className="sticky top-0 bg-slate-50 border-b border-slate-100">
                <tr className="text-[7px] uppercase tracking-widest text-slate-400 font-black">
                  <th className="px-4 py-2.5">Fecha</th>
                  <th className="px-4 py-2.5">Tipo</th>
                  <th className="px-4 py-2.5">Almacén</th>
                  <th className="px-4 py-2.5 text-right">Entrada</th>
                  <th className="px-4 py-2.5 text-right">Salida</th>
                  <th className="px-4 py-2.5 text-right">Saldo</th>
                  <th className="px-4 py-2.5">Ref / Operador</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, idx) => (
                  <tr key={m.id + idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-[9px] text-slate-500 whitespace-nowrap">
                      {formatDateVE(new Date(m.timestamp))}<br/>
                      <span className="text-[8px] text-slate-300">{formatTimeVE(new Date(m.timestamp), { hour: '2-digit', minute: '2-digit' })}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase ${m.info.color}`}>{m.info.label}</span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-600 text-[9px] uppercase">{m.warehouse || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-black">
                      {m.direction === 1 ? <span className="text-emerald-700">+{m.absQty.toFixed(3)}</span> : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-black">
                      {m.direction === -1 ? <span className="text-red-600">-{m.absQty.toFixed(3)}</span> : <span className="text-slate-200">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-black text-[11px] text-slate-900">{m.saldoAcum.toFixed(3)}</td>
                    <td className="px-4 py-2.5 min-w-0 max-w-[min(100%,20rem)]">
                      <p className="text-[9px] font-bold text-slate-700 whitespace-normal break-words leading-snug" title={m.reason}>{m.reason || '—'}</p>
                      <p className="text-[8px] text-slate-400 mt-0.5">{m.user || '—'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-slate-50 flex items-center justify-between shrink-0">
          <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest max-w-[85%]">
            {filtered.length} movimiento(s) · El saldo se acumula en orden de fecha y se <span className="text-indigo-600">alinea con &quot;Stock actual&quot;</span> (lotes) aunque falten entradas antiguas en el historial cargado
          </p>
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function InventoryInputModal({ stocks, onClose, onConfirm }: any) {
  const [sku, setSku] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [expiry, setExpiry] = useState('');
  const [supplier, setSupplier] = useState('');
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [image, setImage] = useState<string | null>(null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-10 max-w-xl w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
        <div className="flex justify-between items-center mb-8 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <PlusCircle className="w-6 h-6 text-emerald-900" />
            <h3 className="font-headline font-black text-2xl tracking-tighter text-slate-900 uppercase leading-none">Nueva Recepción (D3)</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Producto Industrial</label>
               <select value={sku} onChange={(e) => setSku(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-emerald-500 outline-none transition-all uppercase">
                 <option value="">Seleccione...</option>
                 {stocks.map((s: any) => <option key={s.code} value={s.code}>{s.code} — {s.description}</option>)}
               </select>
             </div>
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Nombre del Proveedor</label>
               <input type="text" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Ej: Polar, Alimex..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-bold text-slate-900 focus:border-emerald-500 outline-none" />
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad (Bultos/Unid)</label>
              <input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-emerald-500" placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Costo Unit. USD</label>
              <input type="number" step="0.00000001" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-emerald-500" placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-1.5">
               <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Fecha de Caducidad (FEFO)</label>
               <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black font-mono uppercase outline-none focus:border-emerald-500" />
             </div>
             <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Modalidad de Pago</label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                   <button onClick={() => setPaymentType('CASH')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${paymentType === 'CASH' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                      <DollarSign className="w-3 h-3" /> Contado
                   </button>
                   <button onClick={() => setPaymentType('CREDIT')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${paymentType === 'CREDIT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}>
                      <CreditCard className="w-3 h-3" /> Crédito
                   </button>
                </div>
             </div>
          </div>

          <div className="space-y-1.5">
             <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Archivo: Factura de Proveedores</label>
             <div className="group relative w-full h-24 border-2 border-dashed border-slate-200 rounded-2xl flex items-center justify-center bg-slate-50 overflow-hidden hover:border-emerald-900 transition-all">
                {image ? (
                   <img src={image} className="w-full h-full object-cover" alt="Factura" />
                ) : (
                   <div className="flex flex-col items-center gap-1">
                      <Camera className="w-6 h-6 text-slate-300" />
                      <span className="text-[8px] font-black text-slate-400 uppercase">Subir Foto o Escaneo</span>
                   </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
             </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
            <button
              onClick={() => onConfirm(sku, parseFloat(qty), parseFloat(cost), expiry, supplier, paymentType, image)}
              disabled={!sku || !qty || !cost || !expiry}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${(!sku || !qty || !cost || !expiry) ? 'bg-slate-100 text-slate-400' : 'bg-emerald-900 text-white shadow-emerald-900/40 active:scale-95'}`}
            >
              Confirmar Recepción
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InventoryAdjustmentModal({ stocks, onClose, onSaved }: { stocks: any[]; onClose: () => void; onSaved: () => void }) {
  const [sku, setSku] = useState('');
  const [batchId, setBatchId] = useState('');
  const [adjustType, setAdjustType] = useState<'DECREASE' | 'INCREASE'>('DECREASE');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const product = stocks.find((s: any) => s.code === sku);
  const batches = (product?.lotes || [])
    .filter((l: any) => Number(l.qty) > 0 || adjustType === 'INCREASE')
    .sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  const selectedBatch = batches.find((l: any) => l.id === batchId);
  const available = Number(selectedBatch?.qty ?? 0) || 0;
  const adjustQty = Number(qty || 0) || 0;
  const newQtyPreview = adjustType === 'DECREASE'
    ? Math.max(0, available - adjustQty)
    : available + adjustQty;

  const ADJUST_REASONS_DECREASE = [
    'Merma por deterioro',
    'Daño en almacén',
    'Diferencia en conteo físico',
    'Producto vencido retirado',
    'Error de entrada anterior',
    'Otro'
  ];
  const ADJUST_REASONS_INCREASE = [
    'Diferencia en conteo físico',
    'Corrección de entrada',
    'Reintegro por devolución',
    'Otro'
  ];

  const handleConfirm = async () => {
    if (!sku) { setError('Seleccione el producto.'); return; }
    if (!batchId) { setError('Seleccione el lote a ajustar.'); return; }
    if (!adjustQty || adjustQty <= 0) { setError('La cantidad del ajuste debe ser mayor a cero.'); return; }
    if (adjustType === 'DECREASE' && adjustQty > available) {
      setError(`La cantidad a disminuir excede la disponible (${available}).`);
      return;
    }
    if (!reason.trim()) { setError('Seleccione o ingrese el motivo del ajuste.'); return; }

    setSaving(true);
    setError('');
    try {
      const result = await dataService.adjustInventoryBatch({
        batchId,
        sku,
        adjustType,
        qty: adjustQty,
        reason,
        reference: reference.trim() || undefined,
        warehouse: String(selectedBatch?.warehouse ?? '')
      });
      setSuccess(`Ajuste registrado. Nueva cantidad: ${result.newQty.toFixed(3)}`);
      onSaved();
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar el ajuste.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <ShieldAlert className="w-5 h-5 text-orange-600" />
            <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Ajuste de Inventario</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">{error}</div>
          )}
          {success && (
            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase tracking-widest">{success}</div>
          )}

          {/* Tipo de ajuste */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Tipo de Ajuste</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => { setAdjustType('DECREASE'); setReason(''); }}
                className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all ${adjustType === 'DECREASE' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-400'}`}
              >
                ↓ Disminuir (Merma / Daño)
              </button>
              <button
                onClick={() => { setAdjustType('INCREASE'); setReason(''); }}
                className={`flex-1 py-2.5 rounded-lg text-[9px] font-black uppercase transition-all ${adjustType === 'INCREASE' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400'}`}
              >
                ↑ Aumentar (Corrección)
              </button>
            </div>
          </div>

          {/* Producto */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Producto</label>
            <select
              value={sku}
              onChange={(e) => { setSku(e.target.value); setBatchId(''); }}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-orange-500 outline-none uppercase"
            >
              <option value="">Seleccione...</option>
              {stocks.map((s: any) => (
                <option key={s.code} value={s.code}>{s.code} — {s.description}</option>
              ))}
            </select>
          </div>

          {/* Lote */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Lote</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              disabled={!sku}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-orange-500 outline-none uppercase disabled:opacity-40"
            >
              <option value="">Seleccione lote...</option>
              {batches.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {String(l.batch ?? l.id).slice(-8).toUpperCase()} — {l.warehouse} — Exp: {formatDateVE(new Date(l.expiry))} — {Number(l.qty ?? 0).toFixed(3)}
                </option>
              ))}
            </select>
          </div>

          {/* Info del lote seleccionado */}
          {selectedBatch && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Almacén</div>
                <div className="text-[11px] font-black text-slate-900 uppercase">{selectedBatch.warehouse || '—'}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Disponible</div>
                <div className="text-[11px] font-black text-slate-900">{available.toFixed(3)}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Costo Unit.</div>
                <div className="text-[11px] font-black text-slate-900">$ {Number(selectedBatch.costUSD ?? 0).toFixed(3)}</div>
              </div>
            </div>
          )}

          {/* Cantidad + referencia */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad del Ajuste</label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-orange-500"
                placeholder="0.000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Referencia (opcional)</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-orange-500"
                placeholder="Ej: CONTEO-001"
              />
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Motivo del Ajuste</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-orange-500 outline-none"
            >
              <option value="">Seleccione motivo...</option>
              {(adjustType === 'DECREASE' ? ADJUST_REASONS_DECREASE : ADJUST_REASONS_INCREASE).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            {reason === 'Otro' && (
              <input
                type="text"
                value={''}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
                className="w-full bg-slate-50 border-2 border-orange-200 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:border-orange-500 mt-2"
                placeholder="Describa el motivo..."
              />
            )}
          </div>

          {/* Preview del impacto */}
          {selectedBatch && adjustQty > 0 && (
            <div className={`p-5 rounded-2xl text-white shadow-xl ${adjustType === 'DECREASE' ? 'bg-red-950 shadow-red-950/20' : 'bg-emerald-950 shadow-emerald-950/20'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${adjustType === 'DECREASE' ? 'text-red-300' : 'text-emerald-300'}`}>
                  Impacto del ajuste
                </span>
                <span className="text-[10px] font-black text-white/50">
                  {adjustType === 'DECREASE' ? `−${adjustQty.toFixed(3)}` : `+${adjustQty.toFixed(3)}`}
                </span>
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-2xl font-black font-mono text-white/40 line-through">{available.toFixed(3)}</span>
                <span className="text-[10px] text-white/40">→</span>
                <span className="text-3xl font-black font-headline tracking-tighter">{newQtyPreview.toFixed(3)}</span>
              </div>
              {adjustType === 'DECREASE' && (
                <p className="text-[8px] text-red-300 mt-1.5">
                  Impacto valorizado: −$ {(adjustQty * Number(selectedBatch.costUSD ?? 0)).toFixed(2)} USD
                </p>
              )}
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <button
              onClick={onClose}
              className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={saving || !sku || !batchId || adjustQty <= 0 || !reason.trim() || (adjustType === 'DECREASE' && adjustQty > available)}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl
                ${(saving || !sku || !batchId || adjustQty <= 0 || !reason.trim() || (adjustType === 'DECREASE' && adjustQty > available))
                  ? 'bg-slate-100 text-slate-400'
                  : adjustType === 'DECREASE'
                    ? 'bg-red-600 text-white shadow-red-600/30 active:scale-95'
                    : 'bg-emerald-600 text-white shadow-emerald-600/30 active:scale-95'
                }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              {saving ? 'Procesando...' : 'Confirmar Ajuste'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransferModal({ stocks, onClose, onSaved }: { stocks: any[]; onClose: () => void; onSaved: () => void }) {
  const WAREHOUSES = [
    { key: 'Galpon D3', label: 'Galpón D3' },
    { key: 'Pesa D2', label: 'Pesa D2' },
    { key: 'exibicion D1', label: 'Exhibición D1' },
  ];

  const [sku, setSku] = useState('');
  const [fromWh, setFromWh] = useState('Galpon D3');
  const [toWh, setToWh] = useState('Pesa D2');
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const product = stocks.find((s: any) => s.code === sku);
  const originLotes = (product?.lotes || [])
    .filter((l: any) => {
      const wh = String(l.warehouse ?? '').toLowerCase();
      const from = fromWh.toLowerCase();
      return wh === from || wh.includes(from.split(' ')[0]);
    })
    .filter((l: any) => Number(l.qty) > 0)
    .sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  const selectedLote = originLotes.find((l: any) => l.id === batchId);
  const available = Number(selectedLote?.qty ?? 0) || 0;
  const transferQty = parseFloat(qty) || 0;

  const handleConfirm = async () => {
    if (!sku) { setError('Seleccione el producto.'); return; }
    if (!batchId) { setError('Seleccione el lote de origen.'); return; }
    if (!transferQty || transferQty <= 0) { setError('La cantidad debe ser mayor a cero.'); return; }
    if (transferQty > available) { setError(`Excede disponible (${available.toFixed(3)}).`); return; }
    if (fromWh === toWh) { setError('Origen y destino no pueden ser iguales.'); return; }

    setSaving(true); setError('');
    try {
      const result = await dataService.transferInventoryBatch({
        batchId,
        sku,
        qty: transferQty,
        fromWarehouse: fromWh,
        toWarehouse: toWh,
        reference: reference.trim() || undefined
      });
      setSuccess(`Traslado registrado. ${result.transferredQty.toFixed(3)} → ${toWh}`);
      onSaved();
      setTimeout(onClose, 1500);
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar el traslado.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-lg w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200">
        <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-emerald-900" />
            <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Traslado entre Almacenes</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-5">
          {error && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">{error}</div>}
          {success && <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-black uppercase tracking-widest">{success}</div>}

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Producto</label>
            <select value={sku} onChange={(e) => { setSku(e.target.value); setBatchId(''); }} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-emerald-500 outline-none uppercase">
              <option value="">Seleccione producto...</option>
              {stocks.map((s: any) => <option key={s.code} value={s.code}>{s.code} — {s.description}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Origen</label>
              <select value={fromWh} onChange={(e) => { setFromWh(e.target.value); setBatchId(''); }} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase">
                {WAREHOUSES.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Destino</label>
              <select value={toWh} onChange={(e) => setToWh(e.target.value)} className="w-full bg-emerald-900 text-white border-2 border-emerald-900 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase">
                {WAREHOUSES.filter(w => w.key !== fromWh).map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Lote a trasladar (FEFO)</label>
            <select
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              disabled={!sku}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-emerald-500 outline-none uppercase disabled:opacity-40"
            >
              <option value="">Seleccione lote...</option>
              {originLotes.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {String(l.batch ?? l.id).slice(-8).toUpperCase()} — Exp: {formatDateVE(new Date(l.expiry))} — {Number(l.qty ?? 0).toFixed(3)}
                </option>
              ))}
            </select>
          </div>

          {selectedLote && (
            <div className="bg-emerald-950 p-5 rounded-2xl text-white shadow-xl shadow-emerald-950/20">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[8px] font-black text-emerald-400 uppercase tracking-[0.2em]">Disponible en {fromWh}</span>
                <span className="text-[9px] font-black text-white/50">Costo: $ {Number(selectedLote.costUSD ?? 0).toFixed(3)}</span>
              </div>
              <p className="text-3xl font-black font-headline tracking-tighter">{available.toFixed(3)} <span className="text-[12px] text-emerald-300">{selectedLote.unit || 'KG'}</span></p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad a trasladar</label>
              <input
                type="number" step="0.001" min="0.001"
                value={qty} onChange={(e) => setQty(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-2xl font-black font-mono text-center focus:border-emerald-500 outline-none"
                placeholder="0.000"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Referencia (opcional)</label>
              <input
                type="text" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-emerald-500"
                placeholder="Ej: TRF-001"
              />
            </div>
          </div>

          {selectedLote && transferQty > 0 && (
            <div className="bg-slate-900 p-4 rounded-2xl text-white">
              <div className="flex justify-between text-[9px] font-black uppercase tracking-widest">
                <span className="text-slate-400">{fromWh}</span>
                <ArrowRight className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">{toWh}</span>
              </div>
              <div className="flex justify-between mt-2 text-[11px] font-mono font-black">
                <span className="text-red-400">−{transferQty.toFixed(3)}</span>
                <span className="text-emerald-400">+{transferQty.toFixed(3)}</span>
              </div>
            </div>
          )}

          <div className="flex gap-4 pt-2">
            <button onClick={onClose} disabled={saving} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={saving || !sku || !batchId || transferQty <= 0 || transferQty > available || fromWh === toWh}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${
                (saving || !sku || !batchId || transferQty <= 0 || transferQty > available || fromWh === toWh)
                  ? 'bg-slate-100 text-slate-400'
                  : 'bg-emerald-900 text-white shadow-emerald-900/40 active:scale-95'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              {saving ? 'Procesando...' : 'Ejecutar Traslado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseReturnModal({ stocks, onClose, onSaved }: any) {
  const [sku, setSku] = useState('');
  const [batchId, setBatchId] = useState('');
  const [qty, setQty] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const product = stocks.find((s: any) => s.code === sku);
  const batches = (product?.lotes || [])
    .filter((l: any) => Number(l.qty) > 0)
    .sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());
  const selectedBatch = batches.find((l: any) => l.id === batchId);
  const available = Number(selectedBatch?.qty ?? 0) || 0;
  const returnQty = Number(qty || 0) || 0;
  const totalReturnUSD = (returnQty > 0 && selectedBatch) ? returnQty * (Number(selectedBatch.costUSD ?? 0) || 0) : 0;

  const handleConfirm = async () => {
    if (!sku) {
      setError('Debe seleccionar el producto.');
      return;
    }
    if (!batchId) {
      setError('Debe seleccionar el lote de origen.');
      return;
    }
    if (!Number.isFinite(returnQty) || returnQty <= 0) {
      setError('La cantidad a devolver debe ser mayor a cero.');
      return;
    }
    if (returnQty > available) {
      setError('La cantidad a devolver excede la disponible en el lote.');
      return;
    }
    if (!String(reason || '').trim()) {
      setError('Debe indicar el motivo de la devolución.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await dataService.registerPurchaseReturn({
        batchId,
        sku,
        qty: returnQty,
        reason,
        reference
      });

      if (result?.apEntryAdjusted) {
        alert(`Devolución registrada. Se ajustó la cuenta por pagar ${result.apEntryAdjusted}.`);
      }

      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar la devolución.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <ArrowRightLeft className="w-5 h-5 text-red-600" />
            <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Devolución en compra</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Producto</label>
            <select value={sku} onChange={(e) => { setSku(e.target.value); setBatchId(''); }} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-red-500 outline-none transition-all uppercase">
              <option value="">Seleccione...</option>
              {stocks.filter((s: any) => (s.lotes || []).some((l: any) => Number(l.qty) > 0)).map((s: any) => (
                <option key={s.code} value={s.code}>{s.code} — {s.description}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Lote de compra</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-red-500 outline-none transition-all uppercase">
              <option value="">Seleccione lote...</option>
              {batches.map((l: any) => (
                <option key={l.id} value={l.id}>{l.id} — {l.warehouse} — Exp: {formatDateVE(new Date(l.expiry))} — {formatQuantity(l.qty)}</option>
              ))}
            </select>
          </div>

          {selectedBatch && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Proveedor</div>
                <div className="text-[11px] font-black text-slate-900 uppercase">{selectedBatch.supplier || 'N/A'}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Disponible</div>
                <div className="text-[11px] font-black text-slate-900 uppercase">{formatQuantity(available)}</div>
              </div>
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Costo lote USD</div>
                <div className="text-[11px] font-black text-slate-900 uppercase">{Number(selectedBatch.costUSD ?? 0).toFixed(2)}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad a devolver</label>
              <input
                type="number"
                step="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-red-500"
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Referencia</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-red-500"
                placeholder="Ej: DEV-001 / NOTA CR"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[110px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-[11px] font-bold outline-none focus:border-red-500 resize-none"
              placeholder="Explique por qué se devuelve la compra: mal estado, error de despacho, diferencia, vencimiento, etc."
            />
          </div>

          <div className="bg-red-950 p-5 rounded-2xl text-white shadow-xl shadow-red-950/20">
            <div className="flex justify-between items-center mb-1 leading-none">
              <span className="text-[8px] font-black text-red-300 uppercase tracking-[0.2em]">Impacto estimado</span>
              <span className="text-[10px] font-black text-white/50">Retorno al proveedor</span>
            </div>
            <p className="text-3xl font-black font-headline tracking-tighter">$ {totalReturnUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="mt-2 text-[9px] font-bold text-red-100/80 uppercase">Descontará inventario del lote seleccionado y dejará trazabilidad del movimiento.</p>
          </div>

          <div className="flex gap-4 pt-2">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all" disabled={saving}>Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={saving || !sku || !batchId || !qty || returnQty <= 0 || returnQty > available || !String(reason || '').trim()}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${(saving || !sku || !batchId || !qty || returnQty <= 0 || returnQty > available || !String(reason || '').trim()) ? 'bg-slate-100 text-slate-400' : 'bg-red-600 text-white shadow-red-600/30 active:scale-95'}`}
            >
              <CheckCircle2 className="w-5 h-5" /> {saving ? 'Procesando...' : 'Confirmar devolución'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchaseAdjustmentNoteModal({ apEntries, onClose, onSaved }: any) {
  const [type, setType] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [apEntryId, setApEntryId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [amountUSD, setAmountUSD] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const filteredEntries = (apEntries || []).filter((entry: any) => String(entry?.status ?? '').toUpperCase() !== 'PAID');
  const selectedAP = filteredEntries.find((entry: any) => entry.id === apEntryId);
  const resolvedSupplier = String(selectedAP?.supplier ?? supplier).trim();
  const amount = Number(amountUSD || 0) || 0;
  const balanceUSD = Number(selectedAP?.balanceUSD ?? 0) || 0;

  const appendFiles = (incoming?: File[] | null) => {
    const list = Array.from(incoming || []).filter(Boolean);
    if (list.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      const existingKeys = new Set(prev.map((file) => `${file.name}__${file.size}__${file.type}`));
      for (const file of list) {
        const contentType = String(file.type || '').toLowerCase();
        const isAllowed = contentType.startsWith('image/') || contentType === 'application/pdf';
        if (!isAllowed) continue;
        const key = `${file.name}__${file.size}__${file.type}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push(file);
      }
      return next;
    });
  };

  const extractPastedSupportFiles = (items?: DataTransferItemList | null) => {
    if (!items || items.length === 0) return [] as File[];
    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as DataTransferItem | undefined;
      if (!item || item.kind !== 'file') continue;
      const blob = item.getAsFile?.();
      if (!blob) continue;
      const contentType = String(blob.type || item.type || 'application/octet-stream').toLowerCase();
      if (!contentType.startsWith('image/') && contentType !== 'application/pdf') continue;
      const ext = contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1] || 'png').toLowerCase();
      const prefix = contentType === 'application/pdf' ? 'documento' : 'whatsapp';
      const fallbackName = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      pastedFiles.push(new File([blob], blob.name || fallbackName, { type: contentType }));
    }
    return pastedFiles;
  };

  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const pastedFiles = extractPastedSupportFiles(e.clipboardData?.items);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      appendFiles(pastedFiles);
    }
  };

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    appendFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleConfirm = async () => {
    if (type === 'CREDIT' && !apEntryId) {
      setError('La nota de crédito debe aplicarse a una cuenta por pagar existente.');
      return;
    }
    if (!resolvedSupplier) {
      setError('Debe indicar el proveedor de la nota.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('El monto de la nota debe ser mayor a cero.');
      return;
    }
    if (type === 'CREDIT' && amount > balanceUSD) {
      setError('La nota de crédito no puede exceder el saldo de la cuenta por pagar seleccionada.');
      return;
    }
    if (!String(reason || '').trim()) {
      setError('Debe indicar el motivo de la nota.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await dataService.registerPurchaseAdjustmentNote({
        type,
        apEntryId,
        supplier: resolvedSupplier,
        amountUSD: amount,
        reference,
        reason,
        files
      });

      if (result.supportsUploadError) {
        alert(`Nota registrada. Advertencia al subir soporte: ${result.supportsUploadError}`);
      }

      if (result.createdAPEntryId) {
        alert(`Nota registrada. Se creó la cuenta por pagar ${result.createdAPEntryId}.`);
      } else if (result.apEntryId) {
        alert(`Nota registrada. Se ajustó la cuenta por pagar ${result.apEntryId}.`);
      }

      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar la nota.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[330] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-amber-600" />
            <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Nota de crédito / débito</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Tipo de nota</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button onClick={() => setType('CREDIT')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${type === 'CREDIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>
                Crédito
              </button>
              <button onClick={() => setType('DEBIT')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${type === 'DEBIT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}>
                Débito
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cuenta por pagar relacionada</label>
            <select value={apEntryId} onChange={(e) => setApEntryId(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-amber-500 outline-none transition-all uppercase">
              <option value="">{type === 'CREDIT' ? 'Seleccione una cuenta por pagar...' : 'Sin vincular a una cuenta por pagar existente'}</option>
              {filteredEntries.map((entry: any) => (
                <option key={entry.id} value={entry.id}>{entry.id} — {entry.supplier} — Saldo: ${Number(entry.balanceUSD ?? 0).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Proveedor</label>
              <input
                type="text"
                value={selectedAP ? selectedAP.supplier : supplier}
                onChange={(e) => setSupplier(e.target.value.toUpperCase())}
                disabled={Boolean(selectedAP)}
                className={`w-full border-2 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none transition-all ${selectedAP ? 'bg-slate-100 border-slate-100 text-slate-500' : 'bg-slate-50 border-slate-100 text-slate-900 focus:border-amber-500'}`}
                placeholder="Nombre del proveedor"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Monto USD</label>
              <input
                type="number"
                step="0.01"
                value={amountUSD}
                onChange={(e) => setAmountUSD(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-amber-500"
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Referencia</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-amber-500"
                placeholder="Ej: NC-001 / ND-001"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Saldo actual</label>
              <div className="w-full bg-slate-100 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase text-slate-500">
                {selectedAP ? `$ ${balanceUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'SIN CUENTA VINCULADA'}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Motivo</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full min-h-[110px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-[11px] font-bold outline-none focus:border-amber-500 resize-none"
              placeholder="Explique el motivo de la nota: descuento comercial, diferencia en factura, recargo, ajuste administrativo, etc."
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Soportes de la nota</label>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1"><Clipboard className="w-3 h-3" /> Puede pegar desde portapapeles</span>
            </div>

            <div className="border-2 border-dashed border-slate-200 rounded-[1.5rem] p-5 bg-slate-50/50">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Adjunte PDF o imagen</div>
                  <div className="text-[10px] font-bold text-slate-400">Arrastre, seleccione archivo o pegue una captura/documento aquí.</div>
                </div>
                <label className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-amber-700 transition-all shadow-lg shadow-amber-600/20">
                  <Upload className="w-4 h-4" /> Cargar soporte
                  <input type="file" accept="image/*,application/pdf" multiple onChange={handleFileInputChange} className="hidden" />
                </label>
              </div>

              {files.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {files.map((file, idx) => {
                    const isPdf = String(file.type || '').toLowerCase() === 'application/pdf';
                    return (
                      <div key={`${file.name}_${file.size}_${idx}`} className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`p-2 rounded-xl ${isPdf ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                            {isPdf ? <FileText className="w-4 h-4" /> : <FileImage className="w-4 h-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-black text-slate-800 truncate">{file.name}</div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{(Number(file.size || 0) / 1024).toFixed(1)} KB</div>
                          </div>
                        </div>
                        <button type="button" onClick={() => removeFile(idx)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Quitar</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="bg-amber-950 p-5 rounded-2xl text-white shadow-xl shadow-amber-950/20">
            <div className="flex justify-between items-center mb-1 leading-none">
              <span className="text-[8px] font-black text-amber-300 uppercase tracking-[0.2em]">Impacto contable</span>
              <span className="text-[10px] font-black text-white/50">Cuentas por pagar</span>
            </div>
            <p className="text-3xl font-black font-headline tracking-tighter">$ {amount.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="mt-2 text-[9px] font-bold text-amber-100/80 uppercase">{type === 'CREDIT' ? 'Reducirá el saldo por pagar del proveedor.' : (selectedAP ? 'Incrementará el saldo por pagar de la cuenta seleccionada.' : 'Creará una nueva cuenta por pagar para el proveedor.')}</p>
          </div>

          <div className="flex gap-4 pt-2">
            <button onClick={onClose} className="flex-1 bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all" disabled={saving}>Cancelar</button>
            <button
              onClick={handleConfirm}
              disabled={saving || !resolvedSupplier || amount <= 0 || !String(reason || '').trim() || (type === 'CREDIT' && !apEntryId) || (type === 'CREDIT' && amount > balanceUSD)}
              className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${(saving || !resolvedSupplier || amount <= 0 || !String(reason || '').trim() || (type === 'CREDIT' && !apEntryId) || (type === 'CREDIT' && amount > balanceUSD)) ? 'bg-slate-100 text-slate-400' : 'bg-amber-600 text-white shadow-amber-600/30 active:scale-95'}`}
            >
              <CheckCircle2 className="w-5 h-5" /> {saving ? 'Procesando...' : 'Registrar nota'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ManufacturingModal({ stocks, onClose, onSaved }: any) {
  const warehouseOptions = [
    { value: 'Galpon D3', label: 'Galpón D3' },
    { value: 'Pesa D2', label: 'Pesa D2' },
    { value: 'exibicion D1', label: 'Exhibición D1' }
  ];

  const [outputSku, setOutputSku] = useState('');
  const [outputBatch, setOutputBatch] = useState('');
  const [outputWarehouse, setOutputWarehouse] = useState('Pesa D2');
  const [outputStatus, setOutputStatus] = useState<'QUARANTINE' | 'RELEASED'>('QUARANTINE');
  const [outputQty, setOutputQty] = useState('');
  const [productionDate, setProductionDate] = useState(new Date().toISOString().split('T')[0]);
  const [expiryDate, setExpiryDate] = useState('');
  const [reference, setReference] = useState('');
  const [operatingCostUSD, setOperatingCostUSD] = useState('0');
  const [wasteReason, setWasteReason] = useState('');
  const [notes, setNotes] = useState('');
  const [components, setComponents] = useState([{ sku: '', warehouse: 'Pesa D2', qty: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Estados para búsquedas inteligentes
  const [outputProductSearch, setOutputProductSearch] = useState('');
  const [componentSearches, setComponentSearches] = useState<string[]>(['']);

  const outputProduct = stocks.find((stock: any) => stock.code === outputSku);
  const componentOptions = stocks.filter((stock: any) => (stock.lotes || []).some((lote: any) => Number(lote.qty) > 0));
  const validComponents = components.filter((component: any) => String(component.sku || '').trim() && String(component.warehouse || '').trim() && (Number(component.qty || 0) || 0) > 0);
  const finishedQty = Number(outputQty || 0) || 0;
  const operatingCost = Number(operatingCostUSD || 0) || 0;

  // Filtros para búsquedas inteligentes
  const filteredOutputProducts = useMemo(() => 
    stocks.filter(p => 
      p.code.toLowerCase().includes(outputProductSearch.toLowerCase()) || 
      p.description.toLowerCase().includes(outputProductSearch.toLowerCase())
    ), [stocks, outputProductSearch]);

  const getFilteredComponentProducts = (searchQuery: string) => {
    return componentOptions.filter(p => 
      p.code.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  };

  const estimateComponent = (sku: string, warehouse: string, qty: number) => {
    const product = stocks.find((stock: any) => stock.code === sku);
    const lots = (product?.lotes || [])
      .filter((lote: any) => lote.warehouse === warehouse && Number(lote.qty) > 0)
      .sort((a: any, b: any) => new Date(a.expiry).getTime() - new Date(b.expiry).getTime());

    const available = lots.reduce((sum: number, lote: any) => sum + (Number(lote.qty) || 0), 0);
    let remaining = qty;
    let estimatedCostUSD = 0;

    for (const lote of lots) {
      if (remaining <= 0.0001) break;
      const consume = Math.min(Number(lote.qty) || 0, remaining);
      estimatedCostUSD += consume * (Number(lote.costUSD) || 0);
      remaining -= consume;
    }

    return {
      available,
      estimatedCostUSD,
      enough: remaining <= 0.0001
    };
  };

  const componentStats = components.map((component: any) => {
    const qty = Number(component.qty || 0) || 0;
    const estimate = estimateComponent(component.sku, component.warehouse, qty);
    return {
      ...component,
      qty,
      available: estimate.available,
      estimatedCostUSD: estimate.estimatedCostUSD,
      enough: estimate.enough
    };
  });

  const totalInputQty = componentStats.reduce((sum: number, component: any) => sum + (Number(component.qty) || 0), 0);
  const estimatedTotalCostUSD = componentStats.reduce((sum: number, component: any) => sum + (Number(component.estimatedCostUSD) || 0), 0);
  const estimatedProductionCostUSD = estimatedTotalCostUSD + operatingCost;
  const estimatedUnitCostUSD = finishedQty > 0 ? estimatedProductionCostUSD / finishedQty : 0;
  const wasteQty = Math.max(0, totalInputQty - finishedQty);
  const wastePct = totalInputQty > 0 ? (wasteQty / totalInputQty) * 100 : 0;

  const addComponentRow = () => {
    setComponents((prev) => [...prev, { sku: '', warehouse: 'Galpon D3', qty: '' }]);
    setComponentSearches((prev) => [...prev, '']);
  };

  const removeComponentRow = (index: number) => {
    setComponents((prev) => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index));
    setComponentSearches((prev) => prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== index));
  };

  const updateComponent = (index: number, patch: Record<string, string>) => {
    setComponents((prev) => prev.map((component, idx) => idx === index ? { ...component, ...patch } : component));
  };

  const updateComponentSearch = (index: number, search: string) => {
    setComponentSearches((prev) => prev.map((s, idx) => idx === index ? search : s));
  };

  const handleConfirm = async () => {
    if (!outputSku) {
      setError('Debe seleccionar el producto terminado.');
      return;
    }
    if (!String(outputBatch || '').trim()) {
      setError('Debe indicar el lote del producto terminado.');
      return;
    }
    if (!Number.isFinite(finishedQty) || finishedQty <= 0) {
      setError('La cantidad fabricada debe ser mayor a cero.');
      return;
    }
    if (!Number.isFinite(operatingCost) || operatingCost < 0) {
      setError('El costo operativo no es válido.');
      return;
    }
    if (!productionDate) {
      setError('Debe indicar la fecha de fabricación.');
      return;
    }
    if (!expiryDate) {
      setError('Debe indicar la fecha de caducidad del producto terminado.');
      return;
    }
    if (validComponents.length === 0) {
      setError('Debe indicar al menos un insumo con cantidad válida.');
      return;
    }
    if (validComponents.some((component: any) => component.sku === outputSku)) {
      setError('El producto terminado no puede usarse como insumo en la misma fabricación.');
      return;
    }
    const firstInsufficient = componentStats.find((component: any) => String(component.sku || '').trim() && component.qty > 0 && !component.enough);
    if (firstInsufficient) {
      setError(`El insumo ${firstInsufficient.sku} no tiene suficiente stock en ${firstInsufficient.warehouse}.`);
      return;
    }

    setSaving(true);
    setError('');

    try {
      const result = await dataService.registerManufacturing({
        outputSku,
        outputBatch: String(outputBatch).trim().toUpperCase(),
        outputQty: finishedQty,
        outputWarehouse,
        outputStatus,
        productionDate: new Date(productionDate),
        expiryDate: new Date(expiryDate),
        reference,
        operatingCostUSD: operatingCost,
        wasteReason,
        notes,
        components: validComponents.map((component: any) => ({
          sku: String(component.sku).trim().toUpperCase(),
          warehouse: String(component.warehouse).trim(),
          qty: Number(component.qty || 0) || 0
        }))
      });

      alert(`Fabricación registrada. Lote ${result.outputBatch} · costo unitario $${Number(result.unitCostUSD || 0).toFixed(2)} · merma ${Number(result.wasteQty || 0).toFixed(3)}.`);
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar la fabricación.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[340] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2.5rem] p-8 max-w-5xl w-full shadow-2xl animate-in zoom-in duration-300 border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6 border-b pb-4 border-slate-100">
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-blue-600" />
            <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900 uppercase">Orden de fabricación</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-5 space-y-4">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Producto terminado</div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">SKU a fabricar</label>
                    <div className="relative">
                      <div className="flex items-center bg-white px-4 py-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all">
                        <Search className="w-3.5 h-3.5 text-slate-400 mr-2.5" />
                        <input 
                          type="text" 
                          placeholder="REF/DESCRIPCIÓN..."
                          value={outputProductSearch}
                          onChange={(e) => {
                            setOutputProductSearch(e.target.value);
                            if (outputSku && !outputProductSearch) {
                              setOutputSku('');
                            }
                          }}
                          className="bg-transparent border-none text-[11px] font-black text-slate-800 focus:ring-0 flex-1 outline-none uppercase tracking-widest placeholder:text-slate-300"
                        />
                      </div>
                      
                      {outputProductSearch && (
                        <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                          {filteredOutputProducts.length === 0 ? (
                            <div className="px-4 py-3 text-[10px] text-slate-400 text-center">No se encontraron productos</div>
                          ) : (
                            filteredOutputProducts.slice(0, 10).map((p) => (
                              <div
                                key={p.code}
                                onClick={() => {
                                  setOutputSku(p.code);
                                  setOutputProductSearch(`${p.code} — ${p.description}`);
                                }}
                                className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-b-0"
                              >
                                <div className="text-[11px] font-black text-slate-900 uppercase">{p.code}</div>
                                <div className="text-[9px] text-slate-500">{p.description}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Lote de salida</label>
                    <input type="text" value={outputBatch} onChange={(e) => setOutputBatch(e.target.value.toUpperCase())} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-blue-500" placeholder="Ej: FAB-20260404-01" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Almacén destino</label>
                    <select value={outputWarehouse} onChange={(e) => setOutputWarehouse(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-blue-500 outline-none transition-all uppercase">
                      {warehouseOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Estado inicial</label>
                    <select value={outputStatus} onChange={(e) => setOutputStatus(e.target.value as 'QUARANTINE' | 'RELEASED')} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-blue-500 outline-none transition-all uppercase">
                      <option value="QUARANTINE">Cuarentena</option>
                      <option value="RELEASED">Liberado</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad fabricada</label>
                    <input type="number" step="0.001" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-blue-500" placeholder="0" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Fecha de fabricación</label>
                    <input type="date" value={productionDate} onChange={(e) => setProductionDate(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-blue-500" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Caducidad del producto</label>
                    <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-blue-500" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Referencia</label>
                    <input type="text" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase outline-none focus:border-blue-500" placeholder="Ej: FAB-001" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Costo operativo USD</label>
                    <input type="number" step="0.01" min="0" value={operatingCostUSD} onChange={(e) => setOperatingCostUSD(e.target.value)} className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-blue-500" placeholder="0.00" />
                  </div>
                </div>

                {outputProduct && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Producto seleccionado</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{outputProduct.code} — {outputProduct.description}</div>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-[2rem] p-5 space-y-4">
                <div className="flex justify-between items-center gap-4">
                  <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Insumos consumidos</div>
                  <button type="button" onClick={addComponentRow} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all">
                    <PlusCircle className="w-4 h-4" /> Agregar insumo
                  </button>
                </div>

                <div className="space-y-4">
                  {components.map((component: any, index: number) => {
                    const stat = componentStats[index];
                    return (
                      <div key={`component_${index}`} className="bg-white border border-slate-200 rounded-[1.5rem] p-4 space-y-4">
                        <div className="flex justify-between items-center gap-4">
                          <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">Insumo #{index + 1}</div>
                          <button type="button" onClick={() => removeComponentRow(index)} className="px-3 py-2 rounded-xl bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all" disabled={components.length <= 1}>Quitar</button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Producto insumo</label>
                            <div className="relative">
                              <div className="flex items-center bg-white px-4 py-3 rounded-xl border-2 border-slate-100 focus-within:border-blue-500 transition-all">
                                <Search className="w-3.5 h-3.5 text-slate-400 mr-2.5" />
                                <input 
                                  type="text" 
                                  placeholder="REF/DESCRIPCIÓN..."
                                  value={componentSearches[index] || ''}
                                  onChange={(e) => {
                                    updateComponentSearch(index, e.target.value);
                                    if (component.sku && !e.target.value) {
                                      updateComponent(index, { sku: '' });
                                    }
                                  }}
                                  className="bg-transparent border-none text-[11px] font-black text-slate-800 focus:ring-0 flex-1 outline-none uppercase tracking-widest placeholder:text-slate-300"
                                />
                              </div>
                              
                              {componentSearches[index] && (
                                <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                                  {getFilteredComponentProducts(componentSearches[index]).length === 0 ? (
                                    <div className="px-4 py-3 text-[10px] text-slate-400 text-center">No se encontraron productos</div>
                                  ) : (
                                    getFilteredComponentProducts(componentSearches[index]).slice(0, 10).map((p) => (
                                      <div
                                        key={p.code}
                                        onClick={() => {
                                          updateComponent(index, { sku: p.code });
                                          updateComponentSearch(index, `${p.code} — ${p.description}`);
                                        }}
                                        className="px-4 py-2 hover:bg-slate-50 cursor-pointer border-b border-slate-50 last:border-b-0"
                                      >
                                        <div className="text-[11px] font-black text-slate-900 uppercase">{p.code}</div>
                                        <div className="text-[9px] text-slate-500">{p.description}</div>
                                      </div>
                                    ))
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Cantidad</label>
                            <input type="number" step="0.001" value={component.qty} onChange={(e) => updateComponent(index, { qty: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-blue-500" placeholder="0" />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Almacén origen</label>
                            <select value={component.warehouse} onChange={(e) => updateComponent(index, { warehouse: e.target.value })} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 focus:border-blue-500 outline-none transition-all uppercase">
                              {warehouseOptions.map((option) => (
                                <option key={`${option.value}_${index}`} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Disponible</label>
                            <div className={`w-full border-2 rounded-xl px-4 py-3 text-[11px] font-black uppercase ${stat?.enough ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                              {formatQuantity(Number(stat?.available ?? 0))}
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Costo estimado</label>
                            <div className="w-full bg-slate-100 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black uppercase text-slate-700">
                              $ {Number(stat?.estimatedCostUSD ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Motivo de merma</label>
                <input value={wasteReason} onChange={(e) => setWasteReason(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black outline-none focus:border-blue-500" placeholder="Ej: humedad, polvo, descarte natural, ajuste por tostado" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Observaciones</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full min-h-[110px] bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3 text-[11px] font-bold outline-none focus:border-blue-500 resize-none" placeholder="Detalle del proceso, merma interna, lote de referencia, operador, etc." />
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-blue-950 p-5 rounded-[2rem] text-white shadow-xl shadow-blue-950/20">
                <div className="flex justify-between items-center mb-1 leading-none">
                  <span className="text-[8px] font-black text-blue-300 uppercase tracking-[0.2em]">Costo estimado</span>
                  <span className="text-[10px] font-black text-white/50">Producto terminado</span>
                </div>
                <p className="text-3xl font-black font-headline tracking-tighter">$ {estimatedProductionCostUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className="mt-2 text-[9px] font-bold text-blue-100/80 uppercase">Costo unitario estimado: $ {estimatedUnitCostUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-[9px] font-black uppercase">
                  <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-3 text-blue-100">
                    <div className="text-blue-200/70 mb-1">Costo insumos</div>
                    <div>$ {estimatedTotalCostUSD.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 border border-white/10 px-3 py-3 text-blue-100">
                    <div className="text-blue-200/70 mb-1">Costo operativo</div>
                    <div>$ {operatingCost.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-[2rem] p-5 space-y-4">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Resumen operativo</div>
                <div className="grid grid-cols-1 gap-3">
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Insumos válidos</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{validComponents.length}</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Cantidad a ingresar</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{formatQuantity(finishedQty)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Cantidad insumos</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{formatQuantity(totalInputQty)}</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Merma</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{formatQuantity(wasteQty)} ({wastePct.toFixed(2)}%)</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Destino</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{outputWarehouse}</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Lote de salida</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{outputBatch || 'Pendiente'}</div>
                  </div>
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                    <div className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">Estado inicial</div>
                    <div className="text-[12px] font-black text-slate-900 uppercase">{outputStatus === 'QUARANTINE' ? 'Cuarentena' : 'Liberado'}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button onClick={onClose} className="w-full bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all" disabled={saving}>Cancelar</button>
                <button
                  onClick={handleConfirm}
                  disabled={saving || !outputSku || !String(outputBatch || '').trim() || finishedQty <= 0 || operatingCost < 0 || !productionDate || !expiryDate || validComponents.length === 0 || componentStats.some((component: any) => String(component.sku || '').trim() && component.qty > 0 && !component.enough) || validComponents.some((component: any) => component.sku === outputSku)}
                  className={`w-full py-4 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-2xl ${(saving || !outputSku || !String(outputBatch || '').trim() || finishedQty <= 0 || operatingCost < 0 || !productionDate || !expiryDate || validComponents.length === 0 || componentStats.some((component: any) => String(component.sku || '').trim() && component.qty > 0 && !component.enough) || validComponents.some((component: any) => component.sku === outputSku)) ? 'bg-slate-100 text-slate-400' : 'bg-blue-600 text-white shadow-blue-600/30 active:scale-95'}`}
                >
                  <CheckCircle2 className="w-5 h-5" /> {saving ? 'Procesando...' : 'Registrar fabricación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, unit, valueColor = "text-slate-900", subtitle, progress, icon: Icon, color }: any) {
  const iconColorMap: any = { emerald: 'bg-emerald-500/10 text-emerald-600', red: 'bg-red-500/10 text-red-600', slate: 'bg-slate-900/10 text-slate-600', amber: 'bg-amber-500/10 text-amber-600' };
  return (
    <div className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200/50 hover:shadow-xl transition-all group overflow-hidden relative">
      <div className="flex justify-between items-start mb-6">
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] leading-none">{title}</p>
        <div className={`p-2 rounded-xl transition-all group-hover:bg-slate-900 group-hover:text-white ${iconColorMap[color] || iconColorMap.slate}`}><Icon className="w-4 h-4" /></div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <h3 className={`font-headline text-3xl font-black tracking-tighter ${valueColor}`}>{value}</h3>
        <span className="text-[10px] font-black text-slate-400 uppercase">{unit}</span>
      </div>
      {progress !== undefined ? (
        <div className="mt-5 space-y-2">
          <div className="flex justify-between items-center text-[8px] font-black text-slate-300 uppercase">
            <span>Eficiencia Operativa</span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full bg-emerald-500 transition-all duration-1000`} style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      ) : <p className="text-[9px] font-bold mt-3 uppercase text-slate-400 tracking-tighter">{subtitle}</p>}
    </div>
  );
}

function BatchDetailModal({ lote, productDescription, onClose, onSaved }: {
  lote: Batch;
  productDescription: string;
  onClose: () => void;
  onSaved: (updated: Batch) => void;
}) {
  const [editingCost, setEditingCost] = useState(false);
  const [newCost, setNewCost] = useState(String(lote.costUSD ?? ''));
  const [editingPrice, setEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPriceHistory, setShowPriceHistory] = useState(false);
  const [priceHistory, setPriceHistory] = useState<ProductPriceHistoryRecord[]>([]);
  const [priceHistoryLoading, setPriceHistoryLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDeleteBatch = async () => {
    setDeleting(true);
    setError('');
    try {
      await dataService.deleteBatch(String(lote.id));
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'Error al eliminar el lote.'));
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  const stocksSnapshot = dataService.getStocks();
  const currentProduct = useMemo(
    () => stocksSnapshot.find(p => p.lotes.some(l => String(l.id) === String(lote.id))),
    [lote.id, stocksSnapshot]
  );
  const currentPriceUSD = currentProduct?.priceUSD ?? 0;

  const supportCount = Array.isArray(lote.supports) ? lote.supports.length : (lote.invoiceImage ? 1 : 0);
  const isExpiringSoon = lote.expiry && (new Date(lote.expiry).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
  const costNum = Number(lote.costUSD ?? 0);
  const totalLine = (Number(lote.qty ?? 0) || 0) * costNum;

  const handleSavePrice = async () => {
    const val = parseFloat(newPrice.replace(',', '.'));
    if (!Number.isFinite(val) || val <= 0) {
      setError('Ingrese un precio de venta válido mayor a cero.');
      return;
    }
    if (!currentProduct?.code) {
      setError('No se pudo identificar el producto.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await dataService.updateProductPrice(currentProduct.code, val);
      setSuccess(`Precio de venta actualizado a $${val.toFixed(3)} para todos los lotes de ${currentProduct.code}.`);
      setEditingPrice(false);
      // Refresh history if panel is open
      if (showPriceHistory) handleLoadPriceHistory();
    } catch (e: any) {
      setError(String(e?.message ?? 'Error al guardar el precio.'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCost = async () => {
    const val = parseFloat(newCost.replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      setError('Ingrese un costo válido mayor o igual a cero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await dataService.updateBatchCost(String(lote.id), val);
      setSuccess('Costo actualizado correctamente.');
      setEditingCost(false);
      onSaved({ ...lote, costUSD: val });
    } catch (e: any) {
      setError(String(e?.message ?? 'Error al guardar.'));
    } finally {
      setSaving(false);
    }
  };

  const handleLoadPriceHistory = async () => {
    if (!currentProduct?.code) return;
    setPriceHistoryLoading(true);
    try {
      const history = await dataService.getProductPriceHistory(currentProduct.code);
      setPriceHistory(history);
    } finally {
      setPriceHistoryLoading(false);
    }
  };

  const formatDate = (v?: string | Date) => {
    if (!v) return '-';
    const d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? String(v) : formatDateVE(d);
  };

  const rows: { label: string; value: string; highlight?: string }[] = [
    { label: 'ID Interno', value: String(lote.id ?? '-') },
    { label: 'Lote / Factura N°', value: String(lote.batch ?? lote.invoiceNumber ?? '-') },
    { label: 'Factura compra', value: String(lote.invoiceNumber ?? '-') },
    { label: 'Fecha ingreso', value: formatDate(lote.entryDate) },
    { label: 'Fecha factura', value: formatDate(lote.invoiceDate) },
    { label: 'Vencimiento', value: formatDate(lote.expiry), highlight: isExpiringSoon ? 'text-red-600' : 'text-slate-900' },
    { label: 'Almacén', value: String(lote.warehouse ?? '-') },
    { label: 'Proveedor', value: String(lote.supplier ?? '-') },
    { label: 'Documento proveedor', value: String(lote.supplierDocument ?? '-') },
    { label: 'Teléfono proveedor', value: String(lote.supplierPhone ?? '-') },
    { label: 'Modalidad de pago', value: String(lote.paymentType ?? '-'), highlight: lote.paymentType === 'CREDIT' ? 'text-amber-600' : 'text-emerald-600' },
    { label: 'Unidad', value: String(lote.unit ?? 'KG') },
    { label: 'Cantidad actual', value: `${Number(lote.qty ?? 0).toLocaleString('es-VE', { minimumFractionDigits: 3 })} ${lote.unit ?? 'KG'}` },
    { label: 'Factura total USD', value: `$ ${Number(lote.totalInvoiceUSD ?? 0).toFixed(2)}` },
    { label: 'Total línea actual USD', value: `$ ${totalLine.toFixed(2)}` },
    { label: 'Soportes adjuntos', value: String(supportCount) },
  ];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <Eye className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Detalle de Lote</p>
              <p className="text-white font-black text-sm tracking-tight uppercase">{productDescription}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body scrollable */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-[10px] font-black uppercase">{error}</div>
          )}
          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-[10px] font-black uppercase">{success}</div>
          )}

          {/* Tabla de datos del lote */}
          <div className="rounded-2xl border border-slate-100 overflow-hidden">
            {rows.map((row, i) => (
              <div key={row.label} className={`flex justify-between items-center px-4 py-2.5 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{row.label}</span>
                <span className={`text-[10px] font-black ${row.highlight ?? 'text-slate-900'} text-right max-w-[55%] break-all`}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Edición de costo */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-amber-700 uppercase tracking-widest">Costo Unitario USD</p>
                <p className="text-xl font-black text-amber-900 font-mono mt-0.5">$ {costNum.toFixed(3)}</p>
              </div>
              {!editingCost && (
                <button
                  type="button"
                  onClick={() => { setEditingCost(true); setNewCost(String(costNum)); setError(''); setSuccess(''); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                >
                  <Pencil className="w-3 h-3" /> Modificar
                </button>
              )}
            </div>

            {editingCost && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest block">Nuevo Costo Unitario (USD)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={newCost}
                  onChange={e => setNewCost(e.target.value)}
                  autoFocus
                  className="w-full bg-white border-2 border-amber-300 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-amber-500"
                  placeholder="0.000"
                />
                {newCost && Number.isFinite(parseFloat(newCost)) && (
                  <div className="bg-white rounded-xl p-3 border border-amber-100 space-y-1">
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-bold">Total línea nuevo:</span>
                      <span className="font-black text-amber-700">$ {(parseFloat(newCost) * lote.qty).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-[9px]">
                      <span className="text-slate-400 font-bold">Diferencia:</span>
                      <span className={`font-black ${parseFloat(newCost) > costNum ? 'text-red-600' : 'text-emerald-600'}`}>
                        {parseFloat(newCost) > costNum ? '+' : ''}{((parseFloat(newCost) - costNum) * lote.qty).toFixed(2)} USD
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setEditingCost(false); setError(''); }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCost}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? 'Guardando...' : 'Guardar Costo'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Precio de venta */}
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Precio de Venta P1</p>
                <p className="text-xl font-black text-emerald-900 font-mono mt-0.5">$ {currentPriceUSD.toFixed(3)}</p>
                {currentProduct?.prices && currentProduct.prices.length > 1 && (
                  <p className="text-[8px] font-bold text-emerald-600 mt-0.5">
                    P2: ${currentProduct.prices[1]?.toFixed(3)} · P3: ${currentProduct.prices[2]?.toFixed(3)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => { setShowPriceHistory(v => !v); if (!showPriceHistory) await handleLoadPriceHistory(); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  title="Historial de precios"
                >
                  <TrendingUp className="w-3 h-3" /> Historial
                </button>
                {!editingPrice && (
                  <button
                    type="button"
                    onClick={() => { setEditingPrice(true); setNewPrice(String(currentPriceUSD)); setError(''); setSuccess(''); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    <Pencil className="w-3 h-3" /> Modificar
                  </button>
                )}
              </div>
            </div>

            {showPriceHistory && (
              <div className="bg-white rounded-xl border border-emerald-200 overflow-hidden">
                <div className="px-3 py-2 bg-emerald-700 flex items-center justify-between">
                  <span className="text-[9px] font-black text-white uppercase tracking-widest">Historial de Precios — {currentProduct?.code}</span>
                  <button onClick={() => setShowPriceHistory(false)} className="text-emerald-200 hover:text-white"><X className="w-3 h-3" /></button>
                </div>
                {priceHistoryLoading ? (
                  <div className="p-4 text-center text-[9px] font-black text-slate-400 uppercase">Cargando...</div>
                ) : priceHistory.length === 0 ? (
                  <div className="p-4 text-center text-[9px] font-black text-slate-400 uppercase">Sin cambios registrados</div>
                ) : (
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-[8px] font-black uppercase text-slate-400">
                        <th className="px-3 py-2">Fecha</th>
                        <th className="px-3 py-2 text-right">Anterior</th>
                        <th className="px-3 py-2 text-right">Nuevo</th>
                        <th className="px-3 py-2 text-right">Δ%</th>
                        <th className="px-3 py-2">Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceHistory.map((h, i) => {
                        const pct = h.previousPrice > 0 ? ((h.newPrice - h.previousPrice) / h.previousPrice) * 100 : 0;
                        const up = h.newPrice >= h.previousPrice;
                        return (
                          <tr key={h.id} className={`border-t border-slate-100 text-[9px] ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                            <td className="px-3 py-2 font-mono text-slate-500">{new Date(h.changedAt).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' })}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-500">${Number(h.previousPrice).toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-black font-mono text-slate-900">${Number(h.newPrice).toFixed(3)}</td>
                            <td className={`px-3 py-2 text-right font-black ${up ? 'text-emerald-600' : 'text-red-500'}`}>{up ? '+' : ''}{pct.toFixed(1)}%</td>
                            <td className="px-3 py-2 text-slate-500 truncate max-w-[80px]">{h.changedBy}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {editingPrice && (
              <div className="space-y-2">
                <label className="text-[9px] font-black text-emerald-700 uppercase tracking-widest block">Nuevo Precio de Venta P1 (USD)</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  autoFocus
                  className="w-full bg-white border-2 border-emerald-300 rounded-xl px-4 py-3 text-xl font-black font-mono text-center outline-none focus:border-emerald-500"
                  placeholder="0.000"
                />
                <p className="text-[8px] font-bold text-slate-400">Los precios P2–P5 se recalculan automáticamente (95%, 90%, 85%, 80%).</p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setEditingPrice(false); setError(''); }}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSavePrice}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    <Save className="w-3 h-3" />
                    {saving ? 'Guardando...' : 'Guardar Precio'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Soporte adjunto */}
          {(lote.invoiceImage || (Array.isArray(lote.supports) && lote.supports.length > 0)) && (
            <div className="space-y-2">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Soporte de compra</p>
              <button
                type="button"
                onClick={() => {
                  const url = String(lote.supports?.[0]?.url ?? lote.invoiceImage ?? '').trim();
                  if (url) window.open(url, '_blank', 'noopener,noreferrer');
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
              >
                <Camera className="w-4 h-4" /> Ver Factura / Soporte
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-100 shrink-0 flex gap-2">
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleting}
            className="flex items-center gap-1.5 px-4 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border border-red-200 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Eliminar lote
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
          >
            Cerrar
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Eliminar lote"
        message={`¿Eliminar el lote ${String(lote.batch ?? lote.id)} de "${productDescription}"? Esta acción no se puede deshacer y reducirá el stock disponible.`}
        danger
        onConfirm={handleDeleteBatch}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

function PurchaseHistoryModal({ dataService, search, onSearchChange, onClose, onVoid }: {
  dataService: import('../../services/dataService').DataService;
  search: string;
  onSearchChange: (v: string) => void;
  onClose: () => void;
  onVoid: (entry: any) => void | Promise<void>;
}) {
  const [allEntries, setAllEntries] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [voidingId, setVoidingId] = React.useState<string | null>(null);
  const [confirmVoidId, setConfirmVoidId] = React.useState<string | null>(null);
  const [voidError, setVoidError] = React.useState('');

  // Cargar todas las compras al montar el componente
  React.useEffect(() => {
    const loadEntries = async () => {
      try {
        setLoading(true);
        const entries = await dataService.getAllPurchaseEntries();
        setAllEntries(entries);
      } catch (error) {
        console.error('Error al cargar compras:', error);
      } finally {
        setLoading(false);
      }
    };

    loadEntries();
  }, [dataService]);

  const handleRefresh = async () => {
    try {
      setLoading(true);
      const entries = await dataService.getAllPurchaseEntries();
      setAllEntries(entries);
    } catch (error) {
      console.error('Error al recargar compras:', error);
    } finally {
      setLoading(false);
    }
  };

  
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allEntries;
    return allEntries.filter(e =>
      e.supplier.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.id.toLowerCase().includes(q) ||
      (e.invoiceNumber && e.invoiceNumber.toLowerCase().includes(q))
    );
  }, [allEntries, search]);

  const totalUSD = useMemo(() => filtered.reduce((acc, e) => acc + (e.amountUSD || 0), 0), [filtered]);
  const pendingUSD = useMemo(() => filtered.filter(e => e.status !== 'PAID').reduce((acc, e) => acc + (e.balanceUSD || 0), 0), [filtered]);

  const handleVoid = async (entry: import('../../services/dataService').APEntry) => {
    setVoidingId(entry.id);
    setVoidError('');
    try {
      await onVoid(entry);
      setConfirmVoidId(null);
    } catch (err: any) {
      setVoidError(String(err?.message ?? 'Error al anular'));
    } finally {
      setVoidingId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'PAID') return 'bg-emerald-100 text-emerald-700';
    if (status === 'OVERDUE') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };
  const statusLabel = (status: string) => {
    if (status === 'PAID') return 'Pagado';
    if (status === 'OVERDUE') return 'Vencido';
    return 'Pendiente';
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '90vh' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <ClipboardList className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Historial de Compras</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{filtered.length} registros encontrados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleRefresh} 
              disabled={loading}
              className="p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-50"
              title="Recargar historial"
            >
              <RefreshCw className={`w-5 h-5 text-slate-400 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Search + Summary */}
        <div className="px-6 py-3 border-b border-slate-100 shrink-0 flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => onSearchChange(e.target.value)}
              placeholder="Buscar por proveedor, factura o descripción..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-bold text-slate-800 outline-none focus:border-blue-400"
            />
          </div>
          <div className="flex gap-3 shrink-0">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-center">
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Total Compras</div>
              <div className="text-sm font-black text-slate-900">${totalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            </div>
            <div className={`border rounded-xl px-4 py-2 text-center ${pendingUSD > 0 ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Saldo Pendiente</div>
              <div className={`text-sm font-black ${pendingUSD > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>${pendingUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-[11px] font-black uppercase tracking-widest">Sin resultados</p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Fecha</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Proveedor</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Descripción</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400 text-right">Monto</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Tipo</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400 text-right">Saldo</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Vcto.</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400">Estado</th>
                  <th className="px-4 py-3 text-[8px] font-black uppercase tracking-widest text-slate-400 text-center">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400 text-[10px] font-black uppercase">Cargando historial de compras...</td></tr>
                )}
                {voidError && (
                  <tr><td colSpan={9} className="px-4 py-2 bg-red-50 text-red-700 text-[10px] font-black uppercase">{voidError}</td></tr>
                )}
                {!loading && filtered.map(entry => {
                  const isVoid = (entry as any).status === 'VOID';
                  return (
                  <tr key={entry.id} className={`hover:bg-slate-50 transition-colors ${isVoid ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                      {entry.timestamp.toLocaleDateString('es-VE')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        <span className="text-[11px] font-black text-slate-900 uppercase">{entry.supplier}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500 max-w-[240px]">
                      <span className="truncate block">{entry.description}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900 text-[11px] font-mono">
                      ${entry.amountUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${(entry as any).isCashPurchase ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {(entry as any).isCashPurchase ? 'CONTADO' : 'CRÉDITO'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-[11px] font-mono">
                      <span className={entry.balanceUSD > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                        ${entry.balanceUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-bold text-slate-500 whitespace-nowrap">
                      {entry.dueDate.toLocaleDateString('es-VE')}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${isVoid ? 'bg-slate-100 text-slate-400' : statusBadge(entry.status)}`}>
                        {isVoid ? 'Anulado' : statusLabel(entry.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {!isVoid && entry.status !== 'PAID' && (
                        confirmVoidId === entry.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <button onClick={() => handleVoid(entry)} disabled={voidingId === entry.id}
                              className="px-2 py-1 bg-red-600 text-white rounded-lg text-[8px] font-black uppercase hover:bg-red-700 disabled:opacity-60">
                              {voidingId === entry.id ? '...' : 'Confirmar'}
                            </button>
                            <button onClick={() => setConfirmVoidId(null)}
                              className="px-2 py-1 bg-slate-100 text-slate-600 rounded-lg text-[8px] font-black uppercase hover:bg-slate-200">
                              No
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => { setConfirmVoidId(entry.id); setVoidError(''); }}
                            className="px-2 py-1 bg-slate-100 text-red-600 border border-red-200 rounded-lg text-[8px] font-black uppercase hover:bg-red-50 transition-all">
                            Anular
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose} className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
