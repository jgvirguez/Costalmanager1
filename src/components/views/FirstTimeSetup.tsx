import React, { useState, useEffect } from 'react';
import { Loader2, Eye, EyeOff, ShieldCheck, AlertTriangle } from 'lucide-react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../../services/firebaseConfig';
import { supabase } from '../../services/supabaseConfig';

interface FirstTimeSetupProps {
  onComplete: () => void;
}

export function FirstTimeSetup({ onComplete }: FirstTimeSetupProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    async function checkSetup() {
      // Verificar flag en Firestore (fuente de verdad Firebase)
      const snap = await getDoc(doc(db, 'system', 'config'));
      if (snap.exists() && snap.data()?.setupCompleted === true) {
        setBlocked(true);
        setTimeout(() => onComplete(), 2500);
        return;
      }
      // Verificar también Supabase como segunda capa
      const { count } = await supabase.from('users').select('id', { count: 'exact', head: true });
      if ((count ?? 0) > 0) {
        setBlocked(true);
        setTimeout(() => onComplete(), 2500);
      }
    }
    checkSetup();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('El nombre es obligatorio');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // Guardar nombre y marcar setup como completado en Firestore
      await setDoc(doc(db, 'system', 'config'), { setupCompleted: true, masterName: name.trim().toUpperCase(), createdAt: new Date().toISOString() }, { merge: true });
      // Registrar en Supabase
      const { supabase: sb } = await import('../../services/supabaseConfig');
      await sb.from('users').insert({ id: `USR-MASTER`, name: name.trim().toUpperCase(), email: email.trim().toLowerCase(), role: 'ADMIN', pin: '', permissions: ['ALL'], active: true });
      onComplete();
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/email-already-in-use') {
        setError('Este correo ya está registrado. Intente iniciar sesión.');
      } else if (code === 'auth/invalid-email') {
        setError('Correo electrónico inválido.');
      } else if (code === 'auth/weak-password') {
        setError('Contraseña demasiado débil. Use al menos 6 caracteres.');
      } else {
        setError('Error al crear el usuario: ' + (err.message || 'Desconocido'));
      }
    } finally {
      setLoading(false);
    }
  };

  if (blocked) {
    return (
      <div className="min-h-screen bg-[#022c22] flex items-center justify-center">
        <div className="text-center space-y-3">
          <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto" />
          <p className="text-white font-black uppercase tracking-widest text-sm">Acceso Restringido</p>
          <p className="text-emerald-400/60 text-[10px] font-bold uppercase tracking-wider">Ya existen usuarios registrados en el sistema</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#022c22] via-[#064e3b] to-[#022c22] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative z-10">
        {/* Warning Banner */}
        <div className="bg-amber-500/20 border border-amber-500/30 rounded-2xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-100 text-sm font-bold">Configuración Inicial del Sistema</p>
            <p className="text-amber-200/70 text-[11px] mt-1">
              No se detectaron usuarios en el sistema. Este paso solo se realiza una vez para crear el usuario Master/Programador.
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8 space-y-3">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-3xl flex items-center justify-center mx-auto border border-white/20 shadow-2xl">
            <ShieldCheck className="w-10 h-10 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Costal Manager</h1>
            <p className="text-emerald-400/80 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Setup Inicial — Usuario Master</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-5">
          <div className="space-y-1">
            <h2 className="text-lg font-black text-slate-900">Crear Usuario Master</h2>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Este usuario tendrá acceso total al sistema y podrá crear otros usuarios desde el módulo de Seguridad.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Nombre Completo
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
                placeholder="EJ: ERICA GONZÁLEZ"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Correo electrónico (Master)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="master@costal.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 pr-12 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Confirmar Contraseña
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                placeholder="Repita la contraseña"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 transition-all"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] font-bold rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-[#022c22] hover:bg-[#064e3b] disabled:opacity-60 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creando usuario...
                </>
              ) : (
                'Crear Usuario Master'
              )}
            </button>
          </form>

          <p className="text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest pt-2 border-t border-slate-100">
            Paso 1 de 1 — Configuración inicial
          </p>
        </div>
      </div>
    </div>
  );
}
