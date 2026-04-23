import React, { useState } from 'react';
import { X, Banknote, AlertCircle, ArrowUpRight } from 'lucide-react';

interface WithdrawalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: {
    amount: number;
    currency: 'USD' | 'VES';
    method: 'cash_usd' | 'cash_ves';
    reason: string;
  }) => Promise<void>;
  exchangeRate: number;
}

export function WithdrawalModal({ isOpen, onClose, onConfirm, exchangeRate }: WithdrawalModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [currency, setCurrency] = useState<'USD' | 'VES'>('USD');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount.replace(',', '.'));
    if (isNaN(numAmount) || numAmount <= 0) {
      alert('Monto inválido');
      return;
    }
    if (!reason.trim()) {
      alert('Debe indicar un motivo');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        amount: numAmount,
        currency,
        method: currency === 'USD' ? 'cash_usd' : 'cash_ves',
        reason: reason.trim()
      });
      setAmount('');
      setReason('');
      onClose();
    } catch (err: any) {
      alert(err.message || 'Error registrando retiro');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[1000] flex items-center justify-center p-4">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-slate-900 p-6 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500/20 rounded-xl">
              <Banknote className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.15em]">Retiro de Efectivo</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Funcion Debito de Caja</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setCurrency('USD')}
              className={`py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${currency === 'USD' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
            >
              <span className="text-lg font-black tracking-tighter">Efectivo $</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrency('VES')}
              className={`py-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1 ${currency === 'VES' ? 'border-emerald-600 bg-emerald-50 text-emerald-600' : 'border-slate-100 bg-slate-50 text-slate-400 hover:border-slate-200'}`}
            >
              <span className="text-lg font-black tracking-tighter">Efectivo Bs</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Monto a Retirar</label>
              <div className="relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-2xl font-black text-slate-900 focus:border-emerald-600 focus:bg-white transition-all outline-none"
                  autoFocus
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl shadow-sm border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400">{currency === 'VES' ? 'Bs' : '$'}</span>
                </div>
              </div>
              {currency === 'VES' && amount && !isNaN(parseFloat(amount)) && (
                <p className="mt-2 ml-1 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                  Equivale a: ${(parseFloat(amount.replace(',', '.')) / (exchangeRate || 1)).toFixed(2)} USD 
                  <span className="text-slate-400 ml-2 font-bold">(Tasa: {exchangeRate.toFixed(2)})</span>
                </p>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5 ml-1">Motivo del Retiro</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej. Pago de flete, suministro de oficina, adelanto de nomina..."
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:bg-white transition-all outline-none min-h-[100px] resize-none"
              />
            </div>
          </div>

          <div className="bg-amber-50 rounded-2xl p-4 flex gap-3 border border-amber-100">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Aviso Importante</p>
              <p className="text-[9px] font-bold text-amber-700 leading-normal">
                Esta operacion descontara el efectivo de la caja actual y generara un registro de gasto. Esta accion es irreversible para el cuadre de hoy.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>Procesando Retiro...</>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                Confirmar y Descontar de Caja
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
