import React, { useState, useEffect } from 'react';
import { Loader2, Eye, EyeOff, ShieldCheck, Lock } from 'lucide-react';
import { authService } from '../../services/authService';
import { dataService } from '../../services/dataService';

interface LoginViewProps {
  onSuccess: () => void;
}

export function LoginView({ onSuccess }: LoginViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);

  const MAX_ATTEMPTS = 5;
  const MAX_CONCURRENT_SESSIONS = 2;
  const [concurrentBlock, setConcurrentBlock] = useState(false);
  const [concurrentSessions, setConcurrentSessions] = useState<any[]>([]);
  const LOCKOUT_MINUTES = 15;

  // Verificar si hay bloqueo activo al cargar
  useEffect(() => {
    const checkLockout = async () => {
      if (!email) return;
      const lockStatus = await dataService.getLoginLockoutStatus(email.trim().toLowerCase());
      if (lockStatus?.isLocked && lockStatus?.lockedUntil) {
        const remaining = Math.ceil((lockStatus.lockedUntil - Date.now()) / 60000);
        if (remaining > 0) {
          setIsLocked(true);
          setLockRemaining(remaining);
          setError(`Cuenta bloqueada por ${remaining} minutos. Contacte al administrador.`);
        } else {
          // Desbloqueo automático por tiempo
          await dataService.clearLoginLockout(email.trim().toLowerCase());
          setIsLocked(false);
        }
      }
    };
    checkLockout();
  }, [email]);

  // Contador regresivo de bloqueo
  useEffect(() => {
    if (!isLocked || lockRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockRemaining(prev => {
        if (prev <= 1) {
          setIsLocked(false);
          setError('');
          return 0;
        }
        return prev - 1;
      });
    }, 60000);
    return () => clearInterval(timer);
  }, [isLocked, lockRemaining]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (isLocked) {
      setError(`Cuenta bloqueada por ${lockRemaining} minutos. Contacte al administrador.`);
      return;
    }
    setError('');
    setLoading(true);
    try {
      // Verificar bloqueo antes de intentar
      const lockStatus = await dataService.getLoginLockoutStatus(normalizedEmail);
      if (lockStatus?.isLocked) {
        const remaining = Math.ceil((lockStatus.lockedUntil - Date.now()) / 60000);
        setIsLocked(true);
        setLockRemaining(remaining);
        setError(`Cuenta bloqueada por ${remaining} minutos. Contacte al administrador.`);
        setLoading(false);
        return;
      }

      await authService.signIn(normalizedEmail, password);

      // SEC-03 + SEC-06: Obtener IP y datos del dispositivo
      const matchedUser = dataService.getUsers().find(
        u => String(u.email ?? '').trim().toLowerCase() === normalizedEmail
      );
      let ip = 'N/A';
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const ipData = await ipRes.json();
        ip = ipData.ip ?? 'N/A';
      } catch { ip = 'N/A'; }
      const platform = navigator.platform ?? (navigator as any).userAgentData?.platform ?? 'Desconocido';
      const userAgent = navigator.userAgent;

      // SEC-06: Verificar sesiones concurrentes
      if (matchedUser?.id) {
        // Limpiar token local previo (si existe) para evitar que cuente doble
        const previousToken = sessionStorage.getItem('activeSessionToken');
        if (previousToken) {
          try { await dataService.terminateActiveSession(previousToken); } catch {}
          sessionStorage.removeItem('activeSessionToken');
          sessionStorage.removeItem('activeSessionUserId');
        }

        const activeSessions = await dataService.getActiveSessionsForUser(matchedUser.id);
        // Limpiar sesiones stale (sin actividad > 8h) o corruptas
        const staleThreshold = Date.now() - 8 * 60 * 60 * 1000;
        const staleSessions = activeSessions.filter(s => {
          const lastSeenTs = new Date(s.lastSeen).getTime();
          if (!Number.isFinite(lastSeenTs)) return true; // sesión inválida/huérfana
          return lastSeenTs < staleThreshold;
        });
        for (const s of staleSessions) await dataService.terminateActiveSession(s.sessionToken);

        // Releer sesiones activas tras limpieza
        let freshSessions = (await dataService.getActiveSessionsForUser(matchedUser.id)).filter(s => {
          const lastSeenTs = new Date(s.lastSeen).getTime();
          return Number.isFinite(lastSeenTs) && lastSeenTs >= staleThreshold;
        });

        // Auto saneamiento: cerrar sesiones más antiguas hasta liberar cupo
        if (freshSessions.length >= MAX_CONCURRENT_SESSIONS) {
          const sortedByLastSeen = [...freshSessions].sort(
            (a, b) => new Date(a.lastSeen).getTime() - new Date(b.lastSeen).getTime()
          );
          while (sortedByLastSeen.length >= MAX_CONCURRENT_SESSIONS) {
            const oldest = sortedByLastSeen.shift();
            if (!oldest) break;
            await dataService.terminateActiveSession(oldest.sessionToken);
          }
          freshSessions = (await dataService.getActiveSessionsForUser(matchedUser.id)).filter(s => {
            const lastSeenTs = new Date(s.lastSeen).getTime();
            return Number.isFinite(lastSeenTs) && lastSeenTs >= staleThreshold;
          });
        }

        if (freshSessions.length >= MAX_CONCURRENT_SESSIONS) {
          // Bloquear login — demasiadas sesiones activas
          await authService.signOut();
          setConcurrentSessions(freshSessions);
          setConcurrentBlock(true);
          setLoading(false);
          return;
        }
      }

      // SEC-03: Registrar acceso exitoso en historial
      dataService.recordLoginSession({
        email: normalizedEmail,
        userId: matchedUser?.id,
        userName: matchedUser?.name,
        ip,
        userAgent,
        platform,
        success: true
      });

      // SEC-06: Registrar sesión activa
      if (matchedUser?.id) {
        const sessionToken = `${matchedUser.id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        sessionStorage.setItem('activeSessionToken', sessionToken);
        sessionStorage.setItem('activeSessionUserId', matchedUser.id);
        await dataService.registerActiveSession(matchedUser.id, sessionToken, { ip, userAgent, platform });
      }

      // Login exitoso: limpiar intentos fallidos
      await dataService.clearLoginLockout(normalizedEmail);
      setFailedAttempts(0);
      onSuccess();
    } catch (err: any) {
      const code = err?.code ?? '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        // Incrementar contador de intentos fallidos
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        
        const remainingAttempts = MAX_ATTEMPTS - newAttempts;
        
        // SEC-03: Registrar intento fallido
        dataService.recordLoginSession({
          email: normalizedEmail, ip: 'N/A',
          userAgent: navigator.userAgent,
          platform: navigator.platform ?? 'Desconocido',
          success: false,
          failReason: 'Credenciales incorrectas'
        });
        if (remainingAttempts <= 0) {
          // Bloquear cuenta
          const lockedUntil = Date.now() + (LOCKOUT_MINUTES * 60000);
          await dataService.setLoginLockout(normalizedEmail, {
            isLocked: true,
            lockedUntil,
            attempts: newAttempts,
            lastAttempt: Date.now()
          });
          setIsLocked(true);
          setLockRemaining(LOCKOUT_MINUTES);
          setError(`Cuenta bloqueada por ${LOCKOUT_MINUTES} minutos tras ${MAX_ATTEMPTS} intentos fallidos. Contacte al administrador.`);
          
          // Registrar auditoría de bloqueo
          await dataService.addAuditEntry('SECURITY', 'ACCOUNT_LOCKED', `Cuenta bloqueada por intentos fallidos: ${normalizedEmail}`);
        } else {
          // Guardar intento fallido
          await dataService.recordFailedLoginAttempt(normalizedEmail, newAttempts);
          setError(`Correo o contraseña incorrectos. Intentos restantes: ${remainingAttempts}`);
        }
      } else if (code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Intente más tarde.');
      } else if (code === 'auth/network-request-failed') {
        setError('Sin conexión. Verifique su red.');
      } else {
        setError('Error al iniciar sesión. Intente de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  };

  if (concurrentBlock) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#022c22] via-[#064e3b] to-[#022c22] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-2xl">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">Sesiones Concurrentes</h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Límite de {MAX_CONCURRENT_SESSIONS} sesiones simultáneas</p>
            </div>
          </div>
          <p className="text-sm font-bold text-slate-600">
            Tu usuario ya tiene <span className="text-amber-600 font-black">{concurrentSessions.length} sesión(es) activa(s)</span>. Para continuar, cierra las sesiones existentes o contacta al administrador.
          </p>
          <div className="space-y-2">
            {concurrentSessions.map(s => {
              const ua = String(s.userAgent ?? '');
              const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : ua.includes('Edge') ? 'Edge' : 'Navegador';
              const dt = s.startedAt ? new Date(s.startedAt) : null;
              return (
                <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-2xl p-3 border border-slate-100">
                  <div>
                    <p className="text-[11px] font-black text-slate-800">{browser} · {s.platform ?? 'Desconocido'}</p>
                    <p className="text-[9px] font-mono text-slate-400">{s.ip} · {dt ? dt.toLocaleString('es-VE') : '—'}</p>
                  </div>
                  <button
                    onClick={async () => {
                      await dataService.terminateActiveSession(s.sessionToken);
                      setConcurrentSessions(p => p.filter(x => x.id !== s.id));
                      if (concurrentSessions.length <= 1) setConcurrentBlock(false);
                    }}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                  >
                    Cerrar
                  </button>
                </div>
              );
            })}
          </div>
          <button
            onClick={() => { setConcurrentBlock(false); setConcurrentSessions([]); }}
            className="w-full py-3 border border-slate-200 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all"
          >
            Volver al Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#022c22] via-[#064e3b] to-[#022c22] flex items-center justify-center p-4">
      {/* Watermark */}
      <div className="fixed inset-0 pointer-events-none flex items-center justify-center opacity-5">
        <img src="/logo.png" alt="" className="w-[40%] max-w-2xl rotate-[-15deg] grayscale" />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Header */}
        <div className="text-center mb-8 space-y-3">
          <div className="w-20 h-20 bg-white/10 backdrop-blur rounded-3xl flex items-center justify-center mx-auto border border-white/20 shadow-2xl">
            <img src="/logo.png" alt="Costal" className="w-14 h-14 object-contain" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-white tracking-tighter">Costal Manager</h1>
            <p className="text-emerald-400/80 text-[10px] font-black uppercase tracking-[0.3em] mt-1">Sistema de Gestión Operativa</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 space-y-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Acceso Seguro — Firebase Auth</span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                Correo electrónico
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="usuario@empresa.com"
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
                  placeholder="••••••••"
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

            {isLocked && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Cuenta Temporalmente Bloqueada</p>
                  <p className="text-[11px] font-bold text-amber-700 mt-1">
                    Tiempo restante: {lockRemaining} minutos
                  </p>
                  <p className="text-[9px] text-amber-600 mt-1">
                    Contacte al administrador del sistema para desbloqueo inmediato.
                  </p>
                </div>
              </div>
            )}

            {error && !isLocked && (
              <div className={`border rounded-xl px-4 py-3 text-[11px] font-bold uppercase tracking-wide ${failedAttempts >= 3 ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {error}
                {failedAttempts >= 3 && failedAttempts < MAX_ATTEMPTS && (
                  <div className="mt-1 text-[9px] opacity-80">
                    ⚠️ {MAX_ATTEMPTS - failedAttempts} intentos restantes antes del bloqueo
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isLocked}
              className="w-full py-3 bg-[#022c22] hover:bg-[#064e3b] disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                'Iniciar Sesión'
              )}
            </button>
          </form>

          <p className="text-center text-[9px] font-bold text-slate-300 uppercase tracking-widest pt-2 border-t border-slate-100">
            Proyecto Costal · costalmanager.web.app
          </p>
        </div>
      </div>
    </div>
  );
}
