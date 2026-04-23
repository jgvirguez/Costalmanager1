import React, { useState } from 'react';
import { 
  Package, 
  Hash, 
  ArrowRight, 
  Save, 
  Trash2, 
  AlertTriangle, 
  ArrowDownToLine, 
  Boxes,
  Factory
} from 'lucide-react';
import { useHotkeys } from '../../utils/hotkeys';
import { dataService } from '../../services/dataService';
import { formatQuantity } from '../../utils/costCalculations';

interface FractionationProps {
  onProcess: (data: any) => void;
  onCancel: () => void;
  scaleWeight?: number;
}

export function FractionationView({ onProcess, onCancel, scaleWeight }: FractionationProps) {
  const [selectedSku, setSelectedSku] = useState('');
  const [bultosADesglosar, setBultosADesglosar] = useState(1);
  const [mermaTeorica, setMermaTeorica] = useState(0.05); // 0.05% default
  const [realWeight, setRealWeight] = useState<number | ''>('');
  
  const stocks = dataService.getStocks();
  const product = stocks.find(s => s.code === selectedSku);

  // Consideramos bultos de 25kg por defecto si no está especificado
  const unitWeight = 25; 
  const totalKg = bultosADesglosar * unitWeight;
  const mermaKg = totalKg * (mermaTeorica / 100);
  const netoKg = totalKg - mermaKg;

  const handleExecute = () => {
    if (!product) return;
    
    // 1. Move from D3 to D2
    const success = dataService.transferStock(product.code, 'D3', 'D2', totalKg, 'ERICA');
    
    if (success) {
      // 2. Record the Merma Natural (Deshidratación/Manejo)
      if (mermaKg > 0) {
        dataService.recordMerma(product.code, 'Pesa D2', 'SYSTEM', mermaKg, 'MERMA_NATURAL', 'ERICA');
      }

      // 3. Record Operational Shrinkage if real weight is lower than predicted
      if (realWeight !== '' && realWeight < netoKg) {
        const extraMerma = netoKg - realWeight;
        dataService.recordMerma(product.code, 'Pesa D2', 'SYSTEM', extraMerma, 'MERMA_MANIP', 'ERICA');
      }
      
      const finalYield = realWeight !== '' ? realWeight : netoKg;
      alert(`Protocolo de Desglose Finalizado: +${formatQuantity(finalYield)} KG cargados a Depósito 2.`);
      onProcess({ sku: selectedSku, netoKg: finalYield });
    }
  };

  useHotkeys({
    'F10': handleExecute,
    'Escape': onCancel
  });

  return (
    <div className="bg-white rounded-[2rem] p-8 border border-slate-200 shadow-2xl max-w-2xl mx-auto animate-in zoom-in slide-in-from-bottom-8 duration-500">
      <div className="flex items-center justify-between mb-8 border-b pb-6 border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-900 rounded-2xl shadow-lg">
            <Factory className="w-6 h-6 text-emerald-100" />
          </div>
          <div>
            <h3 className="font-headline font-black text-2xl tracking-tighter text-slate-900">Protocolo de Desglose</h3>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-0.5">Galpón D3 (Contenedor) <ArrowRight className="w-2 h-2 inline" /> Pesa D2 (Granel)</p>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Origen: Galpón D3 (Materia Prima)</label>
          <div className="relative">
            <select 
              value={selectedSku}
              onChange={(e) => setSelectedSku(e.target.value)}
              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-black text-slate-900 outline-none focus:border-emerald-500 transition-all appearance-none cursor-pointer"
            >
              <option value="">Seleccione el activo industrial...</option>
              {stocks.filter(s => s.d3 > 0).map(s => (
                <option key={s.code} value={s.code}>{s.code} — {s.description} | {s.d3} KG disponibles</option>
              ))}
            </select>
            <Boxes className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Unidades (Bultos)</label>
            <div className="relative">
              <input 
                type="number" min="1" value={bultosADesglosar}
                onChange={(e) => setBultosADesglosar(Number(e.target.value))}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-slate-900 outline-none focus:border-emerald-500 transition-all"
              />
              <ArrowDownToLine className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block ml-1">Peso Real Obtenido (Báscula)</label>
            <div className="relative">
              <input 
                type="number" 
                step="0.001"
                value={realWeight}
                onChange={(e) => setRealWeight(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={formatQuantity(netoKg).toString()}
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-xl font-black font-mono text-emerald-700 outline-none focus:border-emerald-500 transition-all"
              />
              <Hash className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
            </div>
          </div>
        </div>

        <div className="bg-[#022c22] rounded-2xl p-6 text-white space-y-4 shadow-xl relative overflow-hidden">
          <div className="flex justify-between items-center text-[9px] font-black text-emerald-500 uppercase tracking-widest border-b border-white/5 pb-3">
            <span>Matriz de Conversión Automática</span>
            <span className="bg-emerald-500 text-emerald-950 px-2 py-0.5 rounded font-black">PRECISIÓN 3D</span>
          </div>
          
          <div className="flex justify-between items-end">
            <div>
              <p className="text-[10px] font-black text-emerald-100 uppercase tracking-widest leading-none">Neto Cargado a Pesa D2</p>
              <div className="flex items-baseline gap-2 mt-2">
                 <h4 className="text-4xl font-black font-headline tracking-tighter">{formatQuantity(netoKg)}</h4>
                 <span className="text-lg font-black text-emerald-500">KG</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-bold text-red-400 uppercase tracking-widest">Merma Técnica (0.05%)</p>
              <p className="text-sm font-black font-mono text-red-400">-{formatQuantity(mermaKg)} KG</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 p-4 bg-slate-900 rounded-2xl border border-slate-800">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <p className="text-[10px] font-bold text-slate-400 leading-tight uppercase">
            Tracee: Operación <span className="text-emerald-400 underline">IRREVERSIBLE</span>. El peso cargado afectará la valoración de inventario en D2.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button onClick={onCancel} className="bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Descartar</button>
          <button 
            disabled={!selectedSku}
            onClick={handleExecute}
            className={`py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedSku ? 'bg-emerald-900 text-white shadow-lg' : 'bg-slate-200 text-slate-400'}`}
          >
            Ejecutar Desglose (F10)
          </button>
        </div>
      </div>
    </div>
  );
}
