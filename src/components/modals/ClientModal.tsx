import React, { useState } from 'react';
import { User, X, Check, Phone, MapPin } from 'lucide-react';
import { BillingClient } from '../../types/billing';
import { clientService } from '../../services/clientService';
import { useHotkeys } from '../../utils/hotkeys';
import { normalizeDocumentId } from '../../utils/idNormalization';

interface ClientModalProps {
  onAdd: (client: BillingClient) => void;
  onCancel: () => void;
}

type SeniatFeedback = {
  type: 'info' | 'success' | 'error';
  message: string;
};

const SENIAT_LOOKUP_URL = 'http://contribuyente.seniat.gob.ve/BuscaRif/BuscaRif.jsp';

export function ClientModal({ onAdd, onCancel }: ClientModalProps) {
  const [formData, setFormData] = useState({
    id: '',
    name: '',
    address: '',
    phone: '',
    type: 'Natural' as 'Natural' | 'Jurídica',
    nationality: 'V' as 'V' | 'E' | 'J' | 'G',
    referredBy: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [seniatFeedback, setSeniatFeedback] = useState<SeniatFeedback | null>(null);

  const handleOpenSeniat = () => {
    const popup = window.open(SENIAT_LOOKUP_URL, '_blank', 'noopener,noreferrer');

    if (!popup) {
      setSeniatFeedback({
        type: 'error',
        message: 'El navegador bloqueó la ventana de SENIAT. Permita popups e inténtelo de nuevo.'
      });
      return;
    }

    setSeniatFeedback({
      type: 'info',
      message: 'SENIAT abierto. Complete la consulta en la web y continúe con el registro manual del cliente.'
    });
  };

  useHotkeys({
    'F1': () => handleOpenSeniat(),
    'F10': () => handleSave(),
    'Escape': onCancel
  });

  const handleSave = async () => {
    if (!formData.id || !formData.name) return;
    setIsSaving(true);
    
    try {
      const finalId = normalizeDocumentId(formData.id);

      const newClient = await clientService.addClient({
        ...formData,
        id: finalId
      } as BillingClient);
      
      setIsSaving(false);
      onAdd(newClient);
    } catch (e: any) {
      setIsSaving(false);
      alert(e.message || 'Error al registrar el cliente');
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xl max-w-xl w-full mx-auto animate-in zoom-in duration-300 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-emerald-100 rounded-2xl">
              <User className="w-5 h-5 text-emerald-900" />
            </div>
            <div>
              <h3 className="font-headline font-black text-xl tracking-tighter text-slate-900">Registro Fiscal: Cliente</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none mt-1">Creación de Sujeto Pasivo / RIF</p>
            </div>
          </div>
          <button onClick={onCancel} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-4 space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-headline">Tipo</label>
              <select
                value={formData.nationality}
                onChange={(e) => setFormData({ ...formData, nationality: e.target.value as any })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all appearance-none text-center"
              >
                <option value="V">V</option>
                <option value="E">E</option>
                <option value="J">J</option>
                <option value="G">G</option>
              </select>
            </div>
            <div className="col-span-8 space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block font-headline">ID / Cédula / RIF</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value.toUpperCase().replace(/[^0-9JVEG-]/g, '') })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all font-mono"
                  placeholder="00000000"
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Consulta SENIAT</div>
                <p className="mt-1 text-[10px] font-semibold text-slate-500">Presione `F1` para abrir la web del SENIAT y continuar la consulta manual.</p>
              </div>
              <button
                type="button"
                onClick={handleOpenSeniat}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[9px] font-black uppercase tracking-widest text-emerald-800 hover:bg-emerald-50 transition-all"
              >
                Abrir SENIAT
              </button>
            </div>
            {seniatFeedback && (
              <div className={`mt-2 rounded-xl px-3 py-2 text-[10px] font-bold ${seniatFeedback.type === 'success' ? 'bg-emerald-100 text-emerald-800' : seniatFeedback.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-700'}`}>
                {seniatFeedback.message}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Nombre o Razón Social</label>
            <div className="relative">
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value.toUpperCase() })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                placeholder="PROPIETARIO / EMPRESA..."
              />
              <Check className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Teléfono de Contacto</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all pl-10"
                  placeholder="0000-0000000"
                />
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Referido Por</label>
              <div className="relative">
                <input
                  type="text"
                  value={formData.referredBy}
                  onChange={(e) => setFormData({ ...formData, referredBy: e.target.value.toUpperCase() })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
                  placeholder="QUIEN REFIERE..."
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Jurisdicción / Dirección Fiscal</label>
            <div className="relative">
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value.toUpperCase() })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all pl-10"
                placeholder="AV, CALLE, CIUDAD..."
              />
              <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onCancel}
              className="w-full bg-slate-100 text-slate-500 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button
              disabled={!formData.id || !formData.name || isSaving}
              onClick={handleSave}
              className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-2 shadow-xl ${
                formData.id && formData.name && !isSaving
                  ? 'bg-emerald-900 text-white shadow-emerald-900/20 hover:bg-emerald-800'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isSaving ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sincronizando...
                </>
              ) : (
                'Registrar Cliente (F10)'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
