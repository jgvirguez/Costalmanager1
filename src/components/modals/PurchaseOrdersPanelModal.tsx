import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileDown,
  Loader2,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X
} from 'lucide-react';
import {
  dataService,
  type PurchaseOrder,
  type PurchaseOrderStatus
} from '../../services/dataService';
import { reportService } from '../../services/reportService';
import { supplierService } from '../../services/supplierService';
import { clientService } from '../../services/clientService';
import { normalizeDocumentId } from '../../utils/idNormalization';
import { PurchaseEntryModal } from './PurchaseEntryModal';
import { formatQuantity } from '../../utils/costCalculations';

type Props = { onClose: () => void };

const WAREHOUSES = [
  { value: 'Galpon D3', label: 'D3' },
  { value: 'Pesa D2', label: 'D2' },
  { value: 'exibicion D1', label: 'D1' }
];

const statusLabel = (s: PurchaseOrderStatus) => {
  switch (s) {
    case 'DRAFT':
      return 'Borrador';
    case 'SUBMITTED':
      return 'En aprobación';
    case 'APPROVED':
      return 'Aprobada';
    case 'CLOSED':
      return 'Cerrada';
    case 'CANCELLED':
      return 'Cancelada';
    default:
      return s;
  }
};

const statusClass = (s: PurchaseOrderStatus) => {
  switch (s) {
    case 'DRAFT':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'SUBMITTED':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'APPROVED':
      return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    case 'CLOSED':
      return 'bg-slate-800 text-white border-slate-800';
    case 'CANCELLED':
      return 'bg-red-50 text-red-700 border-red-200';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

export function PurchaseOrdersPanelModal({ onClose }: Props) {
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [receiveOc, setReceiveOc] = useState<PurchaseOrder | null>(null);
  const [editOc, setEditOc] = useState<PurchaseOrder | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [supplierSuggestIndex, setSupplierSuggestIndex] = useState(-1);
  const [supplierDoc, setSupplierDoc] = useState('');
  const [note, setNote] = useState('');
  const [activeProductSuggestRow, setActiveProductSuggestRow] = useState<number | null>(null);
  const [activeProductSuggestIndex, setActiveProductSuggestIndex] = useState(-1);
  const [supplierTick, setSupplierTick] = useState(0);
  const [draftLines, setDraftLines] = useState<
    Array<{ sku: string; productDescription: string; unit: string; qtyOrdered: string; warehouse: string }>
  >([{ sku: '', productDescription: '', unit: 'KG', qtyOrdered: '', warehouse: 'Galpon D3' }]);

  React.useEffect(() => {
    return dataService.subscribe(() => setTick((t) => t + 1));
  }, []);

  React.useEffect(() => {
    const unsubS = supplierService.subscribe(() => setSupplierTick((t) => t + 1));
    const unsubC = clientService.subscribe(() => setSupplierTick((t) => t + 1));
    return () => {
      unsubS();
      unsubC();
    };
  }, []);

  const orders = useMemo(() => dataService.getPurchaseOrders(), [tick]);
  const stocks = useMemo(() => dataService.getAllStocks(), [tick]);
  const canWrite = dataService.hasPermission('INVENTORY_WRITE') || dataService.hasPermission('ALL');
  const canApprove = dataService.hasPermission('FINANCE_VIEW') || dataService.hasPermission('ALL');

  const unifiedSuppliers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; phone?: string; address?: string }>();
    clientService.getClients().forEach((c) => {
      const id = normalizeDocumentId(c.id);
      if (!id) return;
      map.set(id, { id, name: c.name, phone: c.phone, address: c.address });
    });
    supplierService.getSuppliers().forEach((s) => {
      const id = normalizeDocumentId(s.id);
      if (!id) return;
      map.set(id, { id, name: s.name, phone: s.phone, address: s.address });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [supplierTick]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return [];
    return unifiedSuppliers
      .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
      .slice(0, 8);
  }, [supplierSearch, unifiedSuppliers]);

  const resolveSku = (code: string) => {
    const c = String(code ?? '').trim().toUpperCase();
    const p = stocks.find((s) => String(s.code ?? '').trim().toUpperCase() === c);
    return p ? { sku: p.code, description: p.description, unit: p.unit || 'KG' } : null;
  };

  const addDraftLine = () => {
    setDraftLines((rows) => [...rows, { sku: '', productDescription: '', unit: 'KG', qtyOrdered: '', warehouse: 'Galpon D3' }]);
  };

  const removeDraftLine = (idx: number) => {
    setDraftLines((rows) => rows.filter((_, i) => i !== idx));
  };

  const updateDraftLine = (idx: number, patch: Partial<(typeof draftLines)[0]>) => {
    setDraftLines((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const getLineProductSuggestions = (row: (typeof draftLines)[number]) => {
    const q = `${String(row.sku ?? '').trim()} ${String(row.productDescription ?? '').trim()}`.trim().toLowerCase();
    if (!q) return [];
    return stocks
      .filter((p) => {
        const code = String(p.code ?? '').toLowerCase();
        const desc = String(p.description ?? '').toLowerCase();
        return code.includes(q) || desc.includes(q);
      })
      .slice(0, 8);
  };

  const applyProductToLine = (idx: number, product: { code: string; description: string; unit?: string }) => {
    updateDraftLine(idx, {
      sku: String(product.code ?? '').toUpperCase(),
      productDescription: String(product.description ?? ''),
      unit: String(product.unit ?? 'KG') || 'KG'
    });
    setActiveProductSuggestRow(null);
    setActiveProductSuggestIndex(-1);
  };

  const handleSelectSupplier = (s: { id: string; name: string; phone?: string; address?: string }) => {
    setSupplier(s.name);
    setSupplierSearch(s.name);
    setSupplierDoc(s.id);
    setShowSupplierSuggestions(false);
    setSupplierSuggestIndex(-1);
  };

  const resetDraftForm = () => {
    setSupplier('');
    setSupplierSearch('');
    setShowSupplierSuggestions(false);
    setSupplierSuggestIndex(-1);
    setSupplierDoc('');
    setNote('');
    setActiveProductSuggestRow(null);
    setActiveProductSuggestIndex(-1);
    setDraftLines([{ sku: '', productDescription: '', unit: 'KG', qtyOrdered: '', warehouse: 'Galpon D3' }]);
  };

  const openEditDraft = (oc: PurchaseOrder) => {
    setError('');
    setShowCreate(true);
    setEditOc(oc);
    setSupplier(oc.supplier ?? '');
    setSupplierSearch(oc.supplier ?? '');
    setSupplierDoc(oc.supplierDocument ?? '');
    setNote(oc.note ?? '');
    setDraftLines(
      (oc.lines ?? []).map((line) => ({
        sku: String(line.sku ?? ''),
        productDescription: String(line.productDescription ?? ''),
        unit: String(line.unit ?? 'KG'),
        qtyOrdered: String(line.qtyOrdered ?? ''),
        warehouse: String(line.warehouse ?? 'Galpon D3')
      }))
    );
  };

  const handleCreate = async () => {
    setError('');
    setBusyId('__create__');
    try {
      const lines = draftLines
        .map((r) => {
          const sku = String(r.sku ?? '').trim().toUpperCase();
          const qtyOrdered = Number(String(r.qtyOrdered ?? '').replace(',', '.')) || 0;
          return {
            sku,
            productDescription: String(r.productDescription ?? sku).trim(),
            unit: String(r.unit ?? 'KG').trim() || 'KG',
            qtyOrdered,
            warehouse: String(r.warehouse ?? 'Galpon D3').trim() || 'Galpon D3'
          };
        })
        .filter((l) => l.sku && l.qtyOrdered > 0);
      if (editOc?.id) {
        await dataService.updatePurchaseOrderDraft(editOc.id, {
          supplier: supplier.trim(),
          supplierDocument: normalizeDocumentId(supplierDoc),
          note: note.trim(),
          lines
        });
      } else {
        await dataService.createPurchaseOrderDraft({
          supplier: supplier.trim(),
          supplierDocument: normalizeDocumentId(supplierDoc),
          note: note.trim(),
          lines
        });
      }
      setShowCreate(false);
      setEditOc(null);
      resetDraftForm();
    } catch (e: any) {
      setError(String(e?.message ?? `No se pudo ${editOc ? 'actualizar' : 'crear'} la OC.`));
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async (id: string, fn: () => Promise<void>) => {
    setError('');
    setBusyId(id);
    try {
      await fn();
    } catch (e: any) {
      setError(String(e?.message ?? 'Error'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[1250] bg-slate-900/70 backdrop-blur-sm flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 my-2 overflow-hidden flex flex-col max-h-[calc(100vh-16px)]">
          <div className="p-4 border-b bg-slate-50 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-indigo-100 rounded-xl shrink-0">
                <ClipboardList className="w-4 h-4 text-indigo-700" />
              </div>
              <div className="min-w-0">
                <h3 className="font-headline font-black text-sm uppercase tracking-tight text-slate-900">Órdenes de compra</h3>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Borrador → envío → aprobación → recepción con factura</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canWrite && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !showCreate;
                    setShowCreate(next);
                    if (!next) {
                      setEditOc(null);
                      resetDraftForm();
                    }
                    setError('');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700"
                >
                  <Plus className="w-3.5 h-3.5" /> Nueva OC
                </button>
              )}
              <button type="button" onClick={onClose} className="p-2 rounded-xl bg-slate-200 text-slate-600 hover:bg-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-800">{error}</div>
            )}

            {showCreate && canWrite && (
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-800">
                  {editOc ? `Editar borrador ${editOc.correlativo}` : 'Nueva orden (borrador)'}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="relative">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Proveedor</label>
                    <input
                      value={supplierSearch}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSupplierSearch(value);
                        setSupplier(value);
                        setShowSupplierSuggestions(true);
                        setSupplierSuggestIndex(-1);
                      }}
                      onFocus={() => {
                        setShowSupplierSuggestions(true);
                        setSupplierSuggestIndex(-1);
                      }}
                      onKeyDown={(e) => {
                        if (!showSupplierSuggestions || filteredSuppliers.length === 0) return;
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          setSupplierSuggestIndex((prev) => (prev + 1) % filteredSuppliers.length);
                          return;
                        }
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          setSupplierSuggestIndex((prev) => (prev <= 0 ? filteredSuppliers.length - 1 : prev - 1));
                          return;
                        }
                        if (e.key === 'Enter') {
                          if (supplierSuggestIndex >= 0 && supplierSuggestIndex < filteredSuppliers.length) {
                            e.preventDefault();
                            handleSelectSupplier(filteredSuppliers[supplierSuggestIndex]);
                          }
                          return;
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setShowSupplierSuggestions(false);
                          setSupplierSuggestIndex(-1);
                        }
                      }}
                      onBlur={() => setTimeout(() => { setShowSupplierSuggestions(false); setSupplierSuggestIndex(-1); }, 150)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold"
                      placeholder="Nombre o razón social"
                    />
                    {showSupplierSuggestions && filteredSuppliers.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl max-h-52 overflow-y-auto">
                        {filteredSuppliers.map((s, suggestionIndex) => (
                          <button
                            key={s.id}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => handleSelectSupplier(s)}
                            className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${supplierSuggestIndex === suggestionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                          >
                            <div className="text-[11px] font-black text-slate-800 uppercase">{s.name}</div>
                            <div className="text-[9px] font-bold text-slate-400">{s.id}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[9px] font-black text-slate-500 uppercase">RIF / Doc (opcional)</label>
                    <input
                      value={supplierDoc}
                      onChange={(e) => setSupplierDoc(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold"
                      placeholder="J-xxxxxxxx"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] font-black text-slate-500 uppercase">Nota interna</label>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-[11px] font-bold"
                    placeholder="Observaciones"
                  />
                </div>
                <div className="space-y-2">
                  {draftLines.map((row, idx) => (
                    <div key={idx} className="flex flex-wrap gap-2 items-end bg-white/80 rounded-xl p-2 border border-white">
                      <div className="flex-1 min-w-[100px]">
                        <label className="text-[8px] font-black text-slate-400 uppercase">SKU</label>
                        <input
                          value={row.sku}
                          onChange={(e) => {
                            updateDraftLine(idx, { sku: e.target.value.toUpperCase() });
                            setActiveProductSuggestRow(idx);
                            setActiveProductSuggestIndex(-1);
                          }}
                          onFocus={() => {
                            setActiveProductSuggestRow(idx);
                            setActiveProductSuggestIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            const suggestions = getLineProductSuggestions(row);
                            if (suggestions.length === 0) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setActiveProductSuggestRow(idx);
                              setActiveProductSuggestIndex((prev) => (prev + 1) % suggestions.length);
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setActiveProductSuggestRow(idx);
                              setActiveProductSuggestIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
                              return;
                            }
                            if (e.key === 'Enter') {
                              if (activeProductSuggestRow === idx && activeProductSuggestIndex >= 0 && activeProductSuggestIndex < suggestions.length) {
                                e.preventDefault();
                                const selected = suggestions[activeProductSuggestIndex];
                                applyProductToLine(idx, {
                                  code: selected.code,
                                  description: selected.description,
                                  unit: selected.unit
                                });
                              }
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setActiveProductSuggestRow(null);
                              setActiveProductSuggestIndex(-1);
                            }
                          }}
                          onBlur={() => {
                            const hit = resolveSku(row.sku);
                            if (hit) updateDraftLine(idx, { productDescription: hit.description, unit: hit.unit });
                            setTimeout(() => { setActiveProductSuggestRow(null); setActiveProductSuggestIndex(-1); }, 150);
                          }}
                          className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold font-mono"
                        />
                      </div>
                      <div className="relative flex-[2] min-w-[120px]">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Producto</label>
                        <input
                          value={row.productDescription}
                          onChange={(e) => {
                            updateDraftLine(idx, { productDescription: e.target.value });
                            setActiveProductSuggestRow(idx);
                            setActiveProductSuggestIndex(-1);
                          }}
                          onFocus={() => {
                            setActiveProductSuggestRow(idx);
                            setActiveProductSuggestIndex(-1);
                          }}
                          onKeyDown={(e) => {
                            const suggestions = getLineProductSuggestions(row);
                            if (suggestions.length === 0) return;
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setActiveProductSuggestRow(idx);
                              setActiveProductSuggestIndex((prev) => (prev + 1) % suggestions.length);
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setActiveProductSuggestRow(idx);
                              setActiveProductSuggestIndex((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
                              return;
                            }
                            if (e.key === 'Enter') {
                              if (activeProductSuggestRow === idx && activeProductSuggestIndex >= 0 && activeProductSuggestIndex < suggestions.length) {
                                e.preventDefault();
                                const selected = suggestions[activeProductSuggestIndex];
                                applyProductToLine(idx, {
                                  code: selected.code,
                                  description: selected.description,
                                  unit: selected.unit
                                });
                              }
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setActiveProductSuggestRow(null);
                              setActiveProductSuggestIndex(-1);
                            }
                          }}
                          onBlur={() => setTimeout(() => { setActiveProductSuggestRow(null); setActiveProductSuggestIndex(-1); }, 150)}
                          className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                          placeholder="Buscar por código o nombre"
                        />
                        {activeProductSuggestRow === idx && getLineProductSuggestions(row).length > 0 && (
                          <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl max-h-56 overflow-y-auto">
                            {getLineProductSuggestions(row).map((p, productSuggestionIndex) => (
                              <button
                                key={`${p.code}-${idx}`}
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() =>
                                  applyProductToLine(idx, {
                                    code: p.code,
                                    description: p.description,
                                    unit: p.unit
                                  })
                                }
                                className={`w-full text-left px-3 py-2 border-b border-slate-100 last:border-b-0 ${activeProductSuggestRow === idx && activeProductSuggestIndex === productSuggestionIndex ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                              >
                                <div className="text-[11px] font-black text-slate-800 uppercase">{p.description}</div>
                                <div className="text-[9px] font-bold text-slate-400 font-mono">{p.code}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="w-24">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Cant.</label>
                        <input
                          value={row.qtyOrdered}
                          onChange={(e) => updateDraftLine(idx, { qtyOrdered: e.target.value })}
                          className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-[11px] font-bold"
                        />
                      </div>
                      <div className="w-28">
                        <label className="text-[8px] font-black text-slate-400 uppercase">Alm.</label>
                        <select
                          value={row.warehouse}
                          onChange={(e) => updateDraftLine(idx, { warehouse: e.target.value })}
                          className="mt-0.5 w-full rounded-lg border px-1 py-1.5 text-[10px] font-bold"
                        >
                          {WAREHOUSES.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDraftLine(idx)}
                        disabled={draftLines.length <= 1}
                        className="p-2 rounded-lg border border-red-100 text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addDraftLine}
                    className="text-[9px] font-black uppercase text-indigo-700 hover:underline"
                  >
                    + Renglón
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busyId === '__create__'}
                  onClick={handleCreate}
                  className="w-full py-2.5 rounded-xl bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {busyId === '__create__' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {editOc ? 'Actualizar borrador' : 'Guardar borrador'}
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-slate-100 overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-50 text-[9px] font-black uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">OC</th>
                    <th className="px-3 py-2">Proveedor</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-slate-400 font-bold">
                        No hay órdenes registradas.
                      </td>
                    </tr>
                  )}
                  {orders.map((oc) => {
                    const pending = oc.lines.reduce((a, l) => a + Math.max(0, l.qtyOrdered - l.qtyReceived), 0);
                    return (
                      <tr key={oc.id} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2 font-mono font-black text-slate-900">{oc.correlativo}</td>
                        <td className="px-3 py-2">
                          <div className="font-bold text-slate-800">{oc.supplier}</div>
                          <div className="text-[9px] text-slate-400">
                            {oc.lines.length} línea(s) · pend. {formatQuantity(pending)} u. total orden
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-black uppercase border ${statusClass(oc.status)}`}>
                            {statusLabel(oc.status)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right space-x-1 whitespace-nowrap">
                          {busyId === oc.id && <Loader2 className="w-4 h-4 animate-spin inline text-slate-400" />}
                          <button
                            type="button"
                            disabled={!!busyId}
                            onClick={() => reportService.exportPurchaseOrderToPDF(oc)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 text-slate-700 text-[8px] font-black uppercase"
                          >
                            <FileDown className="w-3 h-3" /> PDF
                          </button>
                          {canWrite && oc.status === 'DRAFT' && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => openEditDraft(oc)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-600 text-white text-[8px] font-black uppercase"
                            >
                              <Pencil className="w-3 h-3" /> Editar
                            </button>
                          )}
                          {canWrite && oc.status === 'DRAFT' && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => runAction(oc.id, () => dataService.submitPurchaseOrder(oc.id))}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500 text-white text-[8px] font-black uppercase"
                            >
                              <Send className="w-3 h-3" /> Enviar
                            </button>
                          )}
                          {canApprove && oc.status === 'SUBMITTED' && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => runAction(oc.id, () => dataService.approvePurchaseOrder(oc.id))}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[8px] font-black uppercase"
                            >
                              <ShieldCheck className="w-3 h-3" /> Aprobar
                            </button>
                          )}
                          {canWrite && (oc.status === 'DRAFT' || oc.status === 'SUBMITTED' || oc.status === 'APPROVED') && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() =>
                                runAction(oc.id, () =>
                                  dataService.cancelPurchaseOrder(oc.id, 'Cancelado desde panel OC')
                                )
                              }
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-200 text-slate-700 text-[8px] font-black uppercase"
                            >
                              Cancelar
                            </button>
                          )}
                          {canWrite && oc.status === 'APPROVED' && pending > 0.0001 && (
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => {
                                setError('');
                                setReceiveOc(oc);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-700 text-white text-[8px] font-black uppercase"
                            >
                              Recepción
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">
              Almacén: envía la OC. Finanzas / supervisor: aprueba. Recepción abre el mismo registro de compra con validación de cantidades vs OC.
            </p>
          </div>
        </div>
      </div>

      {receiveOc && (
        <PurchaseEntryModal
          products={stocks}
          linkedPurchaseOrderId={receiveOc.id}
          linkedPurchaseOrder={receiveOc}
          warehouse="Galpon D3"
          title={`Recepción — ${receiveOc.correlativo}`}
          subtitle="Factura, lotes y pago. No se permiten productos nuevos en recepción contra OC."
          onClose={() => setReceiveOc(null)}
          onSaved={() => setReceiveOc(null)}
        />
      )}
    </>
  );
}
