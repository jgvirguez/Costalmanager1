import React, { useState, useEffect } from 'react';
import { Search, X, Package, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';
import { BillingItem } from '../../types/billing';
import { formatQuantity, formatUnitCost } from '../../utils/costCalculations';
import { dataService } from '../../services/dataService';

interface ItemSearchModalProps {
  onAdd: (item: BillingItem) => void;
  onCancel: () => void;
  initialQuery?: string;
  initialQty?: number;
  notice?: { type: 'error' | 'info', msg: string } | null;
}

export function ItemSearchModal({ onAdd, onCancel, initialQuery = '', initialQty = 1, notice }: ItemSearchModalProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedQtyStr, setSelectedQtyStr] = useState(initialQty.toString().replace('.', ','));
  const [, setTick] = useState(0);

  useEffect(() => {
    return dataService.subscribe(() => setTick(t => t + 1));
  }, []);
  
  const stocks = dataService.getStocks();

  const filteredProducts = stocks.filter(p => 
    p.code.toLowerCase().includes(query.toLowerCase()) || 
    p.description.toLowerCase().includes(query.toLowerCase())
  );

  const handleQtyChange = (val: string) => {
    const sanitized = val.replace(/[^0-9,.]/g, '');
    setSelectedQtyStr(sanitized);
  };

  const getNumericQty = () => {
    const normalized = selectedQtyStr.replace(',', '.');
    return parseFloat(normalized) || 0;
  };

  const handleAdd = (product: any) => {
    const qty = getNumericQty();
    if (qty <= 0) {
      alert('La cantidad debe ser mayor a cero.');
      return;
    }

    const totalConsolidated = product.d3 + product.d2 + product.a1;

    if (qty > totalConsolidated) {
      alert(`Stock insuficiente en todo el sistema. Disponible total: ${formatQuantity(totalConsolidated)} ${product.unit}.\nRequiere compra/recepción nueva.`);
      return;
    }

    onAdd({
      id: Math.random().toString(36).substr(2, 9),
      code: product.code,
      description: product.description,
      unit: product.unit,
      qty: qty,
      priceUSD: product.prices ? product.prices[0] : product.priceUSD,
      priceLevel: 1,
      tax: 0
    });
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-xl w-full mx-auto animate-in zoom-in duration-300">
        <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900 rounded-xl text-emerald-100"><Package className="w-4 h-4" /></div>
            <h3 className="font-headline font-black text-lg tracking-tighter text-slate-900 uppercase">Catálogo de Activos</h3>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all">
            <Search className="w-3.5 h-3.5 text-slate-400 mr-2.5" />
            <input 
              autoFocus type="text" placeholder="REF/DESCRIPCIÓN..."
              className="bg-transparent border-none text-[11px] font-black text-slate-800 focus:ring-0 flex-1 outline-none uppercase tracking-widest placeholder:text-slate-300"
              value={query} onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {notice && (
            <div className={`p-3 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2 ${notice.type === 'error' ? 'bg-rose-50 text-rose-700 border border-rose-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p className="text-[10px] font-black uppercase tracking-tight leading-tight">{notice.msg}</p>
            </div>
          )}

          <div className="bg-white rounded-xl overflow-hidden border border-slate-100">
            <div className="max-h-[350px] overflow-y-auto">
              {filteredProducts.map((p) => {
                const total = p.d3 + p.d2 + p.a1;
                return (
                  <div 
                    key={p.code} 
                    onClick={() => total > 0 && handleAdd(p)}
                    className={`px-5 py-4 border-b last:border-0 flex justify-between items-center group cursor-pointer transition-all ${total === 0 ? 'opacity-40 grayscale bg-slate-50/50' : 'hover:bg-emerald-50'}`}
                  >
                    <div className="flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-1.5 rounded font-black group-hover:bg-emerald-100">{p.code}</span>
                        <span className="text-[13px] font-black text-slate-900 uppercase leading-none tracking-tight">{p.description}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[12px] font-black text-emerald-700 font-mono tracking-tighter">
                          $ {Number(p.prices?.[0] || p.priceUSD || 0).toFixed(2)}
                        </span>
                        <span className="text-[9px] font-bold text-slate-400 uppercase italic">/ {p.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-baseline gap-1">
                           <span className={`text-[16px] font-black font-mono tracking-tighter ${total === 0 ? 'text-red-500' : 'text-slate-900'}`}>{formatQuantity(total)}</span>
                           <span className="text-[8px] font-black text-slate-400 uppercase">{p.unit}</span>
                        </div>
                        <div className="flex gap-1">
                          <div className={`px-2 py-0.5 rounded text-[8px] font-black border transition-colors ${p.d3 > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                            D3: {formatQuantity(p.d3)}
                          </div>
                          <div className={`px-2 py-0.5 rounded text-[8px] font-black border transition-colors ${p.d2 > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                            D2: {formatQuantity(p.d2)}
                          </div>
                          <div className={`px-2 py-0.5 rounded text-[8px] font-black border transition-colors ${p.a1 > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                            A1: {formatQuantity(p.a1)}
                          </div>
                        </div>
                      </div>
                      <div className={`p-3 rounded-xl transition-all ${total === 0 ? 'bg-slate-100 text-slate-300 shadow-none' : 'bg-white border-2 border-slate-100 text-slate-400 group-hover:bg-emerald-900 group-hover:text-emerald-100 group-hover:border-emerald-900 shadow-sm'}`}>
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="flex items-center justify-between px-2">
             <div className="flex items-center gap-2">
                <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Cant:</label>
                <input 
                  type="text" value={selectedQtyStr} onChange={(e) => handleQtyChange(e.target.value)}
                  className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black text-center focus:ring-2 focus:ring-emerald-500/10 outline-none"
                />
             </div>
             <p className="text-[7px] font-bold text-slate-400 uppercase">* CLIC EN PRODUCTO PARA AGREGAR</p>
          </div>
        </div>
      </div>
    </div>
  );
}
