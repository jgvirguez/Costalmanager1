/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Settings, 
  Plus, 
  Search, 
  Bell, 
  Receipt, 
  Banknote, 
  CheckCircle2, 
  User, 
  Timer,
  Factory,
  Lock,
  LayoutDashboard,
  Landmark,
  Truck,
  ChevronDown,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  BookOpen,
  X,
  DollarSign,
  LogOut
} from 'lucide-react';

import { FractionationView } from './components/views/FractionationView';
import { ClosingView } from './components/views/ClosingView';
import { BillingView } from './components/views/BillingView';
import { InventoryView } from './components/views/InventoryView';
import { FinanceView } from './components/views/FinanceView';
import { DashboardView } from './components/views/DashboardView';
import { ReportsView } from './components/views/ReportsView';
import { SecurityView } from './components/views/SecurityView';
import { WithdrawalModal } from './components/modals/WithdrawalModal';
import { LoginView } from './components/views/LoginView';
import { FirstTimeSetup } from './components/views/FirstTimeSetup';
import { authService, FirebaseUser } from './services/authService';
import { exchangeRateService } from './services/exchangeRateService';
import { CashBoxBreakdownLine, dataService, PermissionKey } from './services/dataService';
import { alertService, InventoryAlert } from './services/alertService';
import { sessionService } from './services/sessionService';
import { AccountingAlert } from './services/dataService';
import { formatDateVE, getVenezuelaDateKey, isSameDayVE } from './utils/dateTimeVE';

type EBProps = { children: React.ReactNode };
type EBState = { hasError: boolean; error: string };
function ErrorBoundary({ children }: EBProps) {
  // Fallback no destructivo mientras se corrige el tipado del boundary de clase.
  return <>{children}</>;
}

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null | 'loading'>('loading');
  const [internalUserReady, setInternalUserReady] = useState(false);
  const [isFirstTimeSetup, setIsFirstTimeSetup] = useState(false);
  const [hasExistingUsers, setHasExistingUsers] = useState<boolean | null>(null);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [authLinkError, setAuthLinkError] = useState<string | null>(null);
  const sessionUidRef = React.useRef<string | null>(null);

  // Timeout de seguridad: máximo 5 segundos en pantalla de carga
  useEffect(() => {
    const timer = setTimeout(() => {
      if (firebaseUser === 'loading') {
        setLoadingTimedOut(true);
        setFirebaseUser(null); // Forzar mostrar login
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [firebaseUser]);

  useEffect(() => {
    return authService.onAuthStateChanged(async (user) => {
      // Si ya hay una sesión identificada en esta pestaña, ignorar eventos de auth
      // que no correspondan a ese mismo UID (evita que otro tab pise este usuario).
      // PERO: permitir logout (user = null) para actualizar el estado correctamente.
      if (sessionUidRef.current && user) {
        if (user.uid !== sessionUidRef.current) return;
      }
      // Siempre reflejar el estado real de auth; el timeout de carga solo debe
      // servir para salir del splash, no para bloquear sesiones válidas.
      setFirebaseUser(user);
      if (user && loadingTimedOut) {
        setLoadingTimedOut(false);
      }
      if (user) {
        setAuthLinkError(null);
      }
      // Limpiar sessionUidRef cuando el usuario cierra sesión
      if (!user) {
        sessionUidRef.current = null;
        sessionService.clearSession();
        dataService.switchUser(''); // Reset user in dataService
        setInternalUserReady(false);
      }
      if (user) {
        setInternalUserReady(false);
        // Si ya hay una sesión activa en esta pestaña y el UID es distinto,
        // es un cambio de auth de otra pestaña — ignorar para no pisar al usuario actual.
        if (sessionUidRef.current && sessionUidRef.current !== user.uid) return;
        // Esperar a que los usuarios estén cargados desde Firestore y buscar por firebaseUid o email
        dataService.ensureUsersRealtimeSync();
        const activateInternalUser = (internalUserId: string): boolean => {
          const targetId = String(internalUserId ?? '').trim();
          if (!targetId) return false;
          dataService.switchUser(targetId);
          const switched = dataService.getCurrentUser();
          if (String(switched?.id ?? '').trim() !== targetId) return false;
          sessionUidRef.current = user.uid;
          setAuthLinkError(null);
          setInternalUserReady(true);
          sessionService.startSession();
          try {
            dataService.reloadAfterAuth();
          } catch (e) {
            console.warn('No se pudo re-inicializar dataService tras login:', e);
          }
          dataService.getCashBoxSessions();
          return true;
        };
        // Intentar hasta 3 segundos para que el listener de Firestore cargue
        let attempts = 0;
        const tryMatch = async () => {
          const authEmail = String(user.email ?? '').trim().toLowerCase();
          const matched = dataService.getUsers().find(
            u =>
              String(u.firebaseUid ?? '').trim() === String(user.uid ?? '').trim() ||
              String(u.email ?? '').trim().toLowerCase() === authEmail
          );
          if (matched) {
            const activated = activateInternalUser(String(matched.id ?? ''));
            if (!activated) {
              if (attempts < 10) {
                attempts++;
                setTimeout(tryMatch, 300);
              }
              return;
            }
            // Aplicar cambio de contraseña pendiente si existe
            try {
              const { doc, getDoc, updateDoc } = await import('firebase/firestore');
              const { db } = await import('./services/firebaseConfig');
              const snap = await getDoc(doc(db, 'users', matched.id));
              const data = snap.data();
              if (data?.passwordPending && data?.pendingPin) {
                await authService.updateUserPassword(user, data.pendingPin);
                await updateDoc(doc(db, 'users', matched.id), {
                  passwordPending: false,
                  pendingPin: null
                });
              }
            } catch (err) {
              console.error('Error aplicando contraseña pendiente:', err);
            }
          } else if (attempts < 6) {
            attempts++;
            setTimeout(tryMatch, 500);
          } else {
            // Fallback defensivo: consulta directa a Firestore por si el cache/listener aún no se actualizó.
            try {
              const { collection, getDocs } = await import('firebase/firestore');
              const { db } = await import('./services/firebaseConfig');
              const usersSnap = await getDocs(collection(db, 'users'));
              const direct = usersSnap.docs
                .map((d) => ({ id: d.id, ...(d.data() as any) }))
                .find((u: any) => {
                  const uidMatch = String(u?.firebaseUid ?? u?.firebase_uid ?? '').trim() === String(user.uid ?? '').trim();
                  const emailMatch = String(u?.email ?? '').trim().toLowerCase() === authEmail;
                  return uidMatch || emailMatch;
                });
              if (direct?.id) {
                const activated = activateInternalUser(String(direct.id));
                if (!activated && attempts < 10) {
                  attempts++;
                  setTimeout(tryMatch, 300);
                  return;
                }
                return;
              }
            } catch (fallbackErr) {
              console.error('Fallback de vinculación Auth->Users falló:', fallbackErr);
            }

            // Evita abrir el shell con usuario fallback ("SISTEMA"/otro) cuando no hubo mapeo real.
            console.error('No se pudo vincular usuario Firebase con usuario interno:', { uid: user.uid, email: user.email });
            setAuthLinkError('No pudimos vincular tu cuenta con un usuario interno activo. Verifica permisos o vínculo en Seguridad.');
            sessionUidRef.current = null;
            sessionService.clearSession();
            dataService.switchUser('');
            setInternalUserReady(false);
            await authService.signOut();
          }
        };
        tryMatch();
      }
    });
  }, []);

  useEffect(() => {
    if (firebaseUser !== null) return;
    async function check() {
      try {
        const { collection, getDocs } = await import('firebase/firestore');
        const { db } = await import('./services/firebaseConfig');
        const snap = await getDocs(collection(db, 'users'));
        setHasExistingUsers(snap.size > 0);
      } catch {
        setHasExistingUsers(false);
      }
    }
    check();
  }, [firebaseUser]);

  if (firebaseUser === 'loading') {
    return (
      <div className="min-h-screen bg-[#022c22] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="Costal" className="w-16 h-16 object-contain opacity-60 animate-pulse" />
          <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Cargando sistema...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    if (isFirstTimeSetup) {
      return <FirstTimeSetup onComplete={() => setIsFirstTimeSetup(false)} />;
    }
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#022c22] via-[#064e3b] to-[#022c22] flex flex-col items-center justify-center p-4">
        {authLinkError && (
          <div className="mb-4 max-w-md w-full rounded-2xl border border-red-300/40 bg-red-500/10 px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-wide text-red-200">{authLinkError}</p>
          </div>
        )}
        <LoginView onSuccess={() => {}} />
        {hasExistingUsers === false && (
          <button
            onClick={() => setIsFirstTimeSetup(true)}
            className="mt-6 text-emerald-400/60 hover:text-emerald-300 text-[11px] font-black uppercase tracking-widest transition-colors"
          >
            ¿Primera vez? Configurar usuario Master
          </button>
        )}
      </div>
    );
  }

  if (!internalUserReady) {
    return (
      <div className="min-h-screen bg-[#022c22] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="/logo.png" alt="Costal" className="w-16 h-16 object-contain opacity-60 animate-pulse" />
          <p className="text-emerald-400 text-[10px] font-black uppercase tracking-widest">Inicializando perfil y permisos...</p>
        </div>
      </div>
    );
  }

  return <AppShell />;
}

function AppShell() {
  const validTabs = ['dashboard','inventory','sales','fractionation','closing','finance','reports','security'] as const;
  type TabType = typeof validTabs[number];
  const safeJsonParse = <T,>(value: string | null, fallback: T): T => {
    if (!value) return fallback;
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };
  const savedTab = localStorage.getItem('activeTab') as TabType | null;
  const [activeTab, setActiveTabState] = useState<TabType>(savedTab && validTabs.includes(savedTab) ? savedTab : 'dashboard');
  const setActiveTab = (tab: TabType) => { setActiveTabState(tab); localStorage.setItem('activeTab', tab); };
  // Cargar tasa BCV guardada o usar default
  const savedBCV = localStorage.getItem('bcvRateData');
  const initialRate = Number(safeJsonParse<{ rate?: number }>(savedBCV, { rate: 36.50 }).rate ?? 36.50) || 36.50;
  const [exchangeRate, setExchangeRate] = useState({ bcv: initialRate, parallel: 42.50 });
  const [currentUser, setCurrentUser] = useState(dataService.getCurrentUser());
  const [isScaleReading, setIsScaleReading] = useState(false);
  const [mockWeight, setMockWeight] = useState(0);
  const [notifications, setNotifications] = useState(0);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [accountingAlerts, setAccountingAlerts] = useState<AccountingAlert[]>([]);
  const [, setTick] = useState(0);
  const [currentSession, setCurrentSession] = useState<any>(null);
  const [showWithdrawalModal, setShowWithdrawalModal] = useState(false);

  // AR Collection Mode: enables BillingView to collect AR payments with full functionality
  const [arCollectionMode, setArCollectionMode] = useState<{
    active: boolean;
    arEntryId: string;
    customerId: string;
    customerName: string;
    balanceUSD: number;
    balanceVES: number;
    description: string;
    saleCorrelativo: string;
  } | null>(null);

  // UX-02: Indicador de sincronización
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const syncTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  // --- SEC-02: Logout por Inactividad ---
  const INACTIVITY_TIMEOUT = 20 * 60 * 1000; // 20 minutos en ms
  const WARNING_BEFORE = 60 * 1000; // Advertencia 1 minuto antes
  const [inactivityWarning, setInactivityWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const lastActivityRef = React.useRef(Date.now());
  const warningTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const logoutTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  // --- Lógica de Tasa Interna Diaria ---
  const [internalRate, setInternalRate] = useState<number>(0);
  const [showRateModal, setShowRateModal] = useState(false);

  // SEC-02: Setup de timers de inactividad
  const resetActivityTimer = React.useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Limpiar timers existentes
    if (warningTimerRef.current) {
      clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current);
      logoutTimerRef.current = null;
    }
    
    // Ocultar advertencia si estaba visible
    if (inactivityWarning) {
      setInactivityWarning(false);
    }
    
    // Configurar nuevo timer para advertencia
    warningTimerRef.current = setTimeout(() => {
      setInactivityWarning(true);
      setTimeRemaining(WARNING_BEFORE);
      
      // Timer para logout después de la advertencia
      logoutTimerRef.current = setTimeout(() => {
        performInactivityLogout();
      }, WARNING_BEFORE);
    }, INACTIVITY_TIMEOUT - WARNING_BEFORE);
  }, [inactivityWarning]);

  const performInactivityLogout = async () => {
    try {
      const token = sessionStorage.getItem('activeSessionToken');
      if (token) {
        await dataService.terminateActiveSession(token);
        sessionStorage.removeItem('activeSessionToken');
        sessionStorage.removeItem('activeSessionUserId');
      }
      // Limpiar sessionService
      sessionService.clearSession();
      await authService.signOut();
      // El listener de onAuthStateChanged manejará el cambio de estado
    } catch (err) {
      console.error('Error en logout por inactividad:', err);
    }
  };

  // SEC-02: Listeners de actividad
  useEffect(() => {
    const activityEvents = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    
    const handleActivity = () => {
      resetActivityTimer();
    };
    
    // Agregar listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, true);
    });
    
    // Iniciar timer
    resetActivityTimer();
    
    return () => {
      // Limpiar listeners y timers
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity, true);
      });
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    };
  }, [resetActivityTimer]);

  // SEC-02: Countdown cuando se muestra advertencia
  useEffect(() => {
    if (!inactivityWarning) return;
    
    const interval = setInterval(() => {
      const elapsed = Date.now() - (lastActivityRef.current + INACTIVITY_TIMEOUT - WARNING_BEFORE);
      const remaining = Math.max(0, WARNING_BEFORE - elapsed);
      setTimeRemaining(remaining);
      
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [inactivityWarning]);

  useEffect(() => {
    const today = getVenezuelaDateKey();
    const savedData = localStorage.getItem('internalRateData');
    if (savedData) {
      const parsed = safeJsonParse<{ date?: string; rate?: number }>(savedData, {});
      if (parsed.date === today) {
        setInternalRate(Number(parsed.rate ?? 0) || 0);
      } else {
        setShowRateModal(true);
      }
    } else {
      setShowRateModal(true);
    }
  }, []);

  const handleSetInternalRate = (rate: number) => {
    const today = getVenezuelaDateKey();
    const oldRate = internalRate;
    localStorage.setItem('internalRateData', JSON.stringify({ date: today, rate: rate }));
    setInternalRate(rate);
    setShowRateModal(false);
    
    // SEC-05: Audit trail para cambio de tasa interna
    dataService.addAuditEntry('RATES', 'INTERNAL_RATE_CHANGE', 
      `Tasa interna cambiada: ${oldRate.toFixed(2)} → ${rate.toFixed(2)} Bs/USD | Fecha: ${today}`);
  };

  const updateRates = async () => {
    try {
      const data = await exchangeRateService.fetchRates();
      setExchangeRate({ bcv: data.bcv, parallel: data.parallel });
      (window as any).__BCV_RATE__ = data.bcv;
      // Guardar tasa válida en localStorage para fallback futuro
      localStorage.setItem('bcvRateData', JSON.stringify({ 
        rate: data.bcv, 
        date: new Date().toISOString(),
        source: 'AlCambio API'
      }));
    } catch (e) {
      console.error('Failed to sync rates', e);
      // Si falla la API, mostrar advertencia en consola con la tasa guardada
      const saved = localStorage.getItem('bcvRateData');
      if (saved) {
        const parsed = safeJsonParse<{ rate?: number; date?: string }>(saved, {});
        if (parsed.rate) {
          console.warn(`Usando tasa BCV guardada: ${parsed.rate} (${parsed.date ?? 'sin fecha'})`);
        }
      }
    }
  };

  useEffect(() => {
    updateRates();
    const interval = setInterval(updateRates, 3600000); // 1 hour
    return () => clearInterval(interval);
  }, []);

  // SEC-06: Heartbeat de sesión activa para evitar expiración falsa por concurrencia
  useEffect(() => {
    const token = sessionStorage.getItem('activeSessionToken');
    const sessionUserId = sessionStorage.getItem('activeSessionUserId');
    if (!token || !sessionUserId || !currentUser?.id || sessionUserId !== currentUser.id) return;

    const beat = async () => {
      try {
        await dataService.touchActiveSession(token);
      } catch {
        // Silencioso: no interrumpir UX por fallos transitorios de red
      }
    };

    void beat();
    const interval = setInterval(() => { void beat(); }, 60000); // 1 min
    return () => clearInterval(interval);
  }, [currentUser?.id]);

  useEffect(() => {
    // Forzar suscripción Firestore de sesiones de caja desde el arranque
    dataService.getCashBoxSessions();

    const update = () => {
      // UX-02: Mostrar indicador de sincronización
      setIsSyncing(true);
      
      setTick(t => t + 1);
      setCurrentSession(dataService.getCurrentCashBoxSession());
      setAlerts(alertService.getAlerts());
      setAccountingAlerts(dataService.getAccountingAlerts());
      setCurrentUser(dataService.getCurrentUser());
      
      // Ocultar indicador después de un breve momento
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      syncTimeoutRef.current = setTimeout(() => {
        setIsSyncing(false);
        setLastSyncTime(new Date());
      }, 500);
    };
    update();
    const unsub = dataService.subscribe(update);

    // Poll de respaldo cada 5s para garantizar sincronía aunque el snapshot llegue tarde
    const poll = setInterval(() => {
      const live = dataService.getCurrentCashBoxSession();
      setCurrentSession(prev => {
        if ((prev?.id ?? null) !== (live?.id ?? null) || (prev?.status ?? null) !== (live?.status ?? null)) {
          return live;
        }
        return prev;
      });
    }, 5000);

    return () => { unsub(); clearInterval(poll); };
  }, []);

  const handleOpenCashBox = async (payload: { initialAmountUSD: number; initialAmountVES: number; openingBreakdown: CashBoxBreakdownLine[] }) => {
    try {
      await dataService.openCashBox({
        userId: currentUser?.id || '',
        userName: currentUser?.name || '',
        stationName: 'Estación Principal',
        ...payload,
        rateBCV: exchangeRate.bcv,
        rateParallel: exchangeRate.parallel,
        rateInternal: internalRate
      });
      setCurrentSession(dataService.getCurrentCashBoxSession());
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCloseCashBox = async () => {
    setActiveTab('closing');
  };

  const handleSwitchUser = (role: any) => {
    dataService.switchUser(role);
    setCurrentUser(dataService.getCurrentUser());
    setActiveTab('dashboard');
  };

  const handleSimulateScale = () => {
    setIsScaleReading(true);
    setMockWeight(0);
    let start = 0;
    const interval = setInterval(() => {
      start += Math.random() * 5;
      setMockWeight(start);
      if (start > 25) {
        clearInterval(interval);
        setMockWeight(25.450);
        setIsScaleReading(false);
      }
    }, 100);
  };

  const canAccess = (permission: PermissionKey) => dataService.hasPermission(permission, currentUser);

  useEffect(() => {
    // Solo verificar permisos si el usuario ya está autenticado (id real cargado)
    if (!currentUser?.id) return;
    const tabPermissionMap: Partial<Record<typeof activeTab, PermissionKey>> = {
      dashboard: 'DASHBOARD_VIEW',
      inventory: 'INVENTORY_READ',
      sales: 'BILLING',
      fractionation: 'FRACTIONATION',
      closing: 'CLOSING_VIEW',
      finance: 'FINANCE_VIEW',
      reports: 'REPORTS_VIEW',
      security: 'SECURITY_VIEW'
    };
    const required = tabPermissionMap[activeTab];
    if (required && !canAccess(required)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  return (
    <div className="flex flex-col min-h-screen bg-surface text-on-surface selection:bg-secondary-container font-sans relative">
      {/* Watermark Background */}
      <div className="fixed inset-0 pointer-events-none z-[-1] flex items-center justify-center overflow-hidden opacity-10">
        <img 
          src="/logo.png" 
          alt="" 
          className="w-[50%] max-w-4xl rotate-[-15deg] grayscale" 
        />
      </div>
      
      <MenuBar onTabChange={setActiveTab} currentUser={currentUser} isSyncing={isSyncing} />
      <div className="flex flex-1">
        <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} currentUser={currentUser} />
        
        <main className="flex-1 flex flex-col min-w-0">
          <TopBar 
            currentUser={currentUser}
            onSwitchUser={handleSwitchUser}
            onScaleClick={handleSimulateScale}             isScaleReading={isScaleReading} 
             weight={mockWeight} 
             alerts={alerts}
             accountingAlerts={accountingAlerts}
             onNotificationClick={() => setNotifications(0)}
             onRateChange={(bcv: number) => setExchangeRate(prev => ({ ...prev, bcv }))}
             onInternalRateChange={(val: number) => handleSetInternalRate(val)}
             onSettingsClick={() => setShowRateModal(true)}
             exchangeRate={exchangeRate.bcv}
             exchangeRateParallel={exchangeRate.parallel}
             internalRate={internalRate}
             currentSession={currentSession}
             onOpenCashBox={handleOpenCashBox}
             onCloseCashBox={handleCloseCashBox}
             onDebitClick={() => setShowWithdrawalModal(true)}
          />
          
          <WithdrawalModal 
            isOpen={showWithdrawalModal}
            onClose={() => setShowWithdrawalModal(false)}
            exchangeRate={internalRate}
            onConfirm={async (data) => {
              if (!currentSession?.id) {
                throw new Error('No hay una sesión de caja abierta. Debe abrir la caja antes de registrar un débito.');
              }
              await dataService.registerCashBoxWithdrawal({
                sessionId: currentSession.id,
                amount: data.amount,
                currency: data.currency,
                method: data.method,
                reason: data.reason,
                user: currentUser,
                rateUsed: internalRate
              });
              alert(`Débito registrado en sesión ${currentSession.id.slice(0,8).toUpperCase()}. Será incluido en el cierre de caja.`);
            }}
          />
          
          <div className={`w-full overflow-y-auto ${activeTab === 'sales' ? 'flex-1 min-h-0 p-2 md:p-4 lg:p-5 xl:p-6' : 'p-4 xl:p-8 space-y-6 xl:space-y-8 max-w-7xl mx-auto'}`}>
            {activeTab === 'dashboard' && canAccess('DASHBOARD_VIEW') && <DashboardView exchangeRates={exchangeRate} accountingAlerts={accountingAlerts} />}
            {activeTab === 'inventory' && canAccess('INVENTORY_READ') && <InventoryView exchangeRate={exchangeRate.bcv} />}
            {activeTab === 'sales' && canAccess('BILLING') && <BillingView scaleWeight={mockWeight} exchangeRateBCV={exchangeRate.bcv} exchangeRateInternal={internalRate} arCollectionMode={arCollectionMode} onClearARCollectionMode={() => setArCollectionMode(null)} activeCashSession={currentSession} />}
            {activeTab === 'fractionation' && canAccess('FRACTIONATION') && (
              <FractionationView 
                scaleWeight={mockWeight}
                onProcess={() => {
                  alert('Desglose Procesado y Lote Actualizado en D2');
                  setActiveTab('inventory');
                }} 
                onCancel={() => setActiveTab('inventory')} 
              />
            )}
            {activeTab === 'closing' && canAccess('CLOSING_VIEW') && <ErrorBoundary><ClosingView exchangeRateBCV={exchangeRate.bcv} exchangeRateParallel={exchangeRate.parallel} exchangeRateInternal={internalRate} /></ErrorBoundary>}
            {activeTab === 'finance' && canAccess('FINANCE_VIEW') && <FinanceView exchangeRate={exchangeRate.bcv} internalRate={internalRate} onStartARCollection={(data) => { setArCollectionMode(data); setActiveTab('sales'); }} />}
            {activeTab === 'reports' && canAccess('REPORTS_VIEW') && <ReportsView />}
            {activeTab === 'security' && canAccess('SECURITY_VIEW') && <SecurityView />}
          </div>
        </main>
      </div>

      {/* SEC-02: Modal de Advertencia de Inactividad */}
      {inactivityWarning && (
        <div className="fixed inset-0 bg-red-900/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="bg-red-600 px-6 py-5 text-center">
              <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-3 animate-pulse">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-[11px] font-black text-red-100 uppercase tracking-widest">⚠️ Sesión por expirar</p>
              <p className="text-white font-black text-xl mt-1">Cierre automático en</p>
              <p className="text-white font-black text-4xl mt-2">{Math.ceil(timeRemaining / 1000)}s</p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-center text-slate-600 text-sm leading-relaxed">
                Tu sesión se cerrará automáticamente por inactividad.<br/>
                <span className="font-bold text-slate-800">Mueve el mouse o presiona cualquier tecla para mantenerla abierta.</span>
              </p>
              <button
                onClick={() => {
                  resetActivityTimer();
                }}
                className="w-full py-4 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Mantener sesión activa
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Tasa Interna Inicial */}
      {showRateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-300">
            <div className="text-center space-y-2 mb-6">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Banknote className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900 tracking-tight uppercase">Configurar Tasa Interna</h3>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                Ingrese la tasa referencial del día para las operaciones internas.
              </p>
            </div>
            
            <form onSubmit={(e) => {
              e.preventDefault();
              const val = parseFloat((e.currentTarget.elements.namedItem('rateInput') as HTMLInputElement).value);
              if (!isNaN(val) && val > 0) handleSetInternalRate(val);
            }}>
              <div className="space-y-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">Bs.</span>
                  <input 
                    name="rateInput"
                    type="number" 
                    step="0.01"
                    min="1"
                    required
                    autoFocus
                    placeholder="Ej. 42.50"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 pl-12 py-3 text-lg font-black text-slate-900 outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                </div>
                <button type="submit" className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[11px] uppercase tracking-[0.2em] shadow-lg shadow-emerald-600/20 transition-all active:scale-95">
                  Confirmar Tasa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function MenuBar({ onTabChange, currentUser, isSyncing }: { onTabChange: (tab: any) => void; currentUser: any; isSyncing?: boolean }) {
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const handleAction = (menu: string, item: string) => {
    setActiveMenu(null);
    const tabMap: Record<string, any> = {
      'Inventario': 'inventory',
      'Facturación': 'sales',
      'Finanzas': 'finance',
      'Producción': 'fractionation',
      'Reportes': 'reports',
      'Panel Principal': 'dashboard',
      'Configuración': 'security',
      'Seguridad': 'security',
      'Usuarios': 'security',
      'Productos': 'inventory',
      'Lotes': 'inventory',
      'Clientes': 'sales',
      'Proveedores': 'finance',
      'RRHH': 'closing',
    };

    if (tabMap[item]) {
      onTabChange(tabMap[item]);
      return;
    }

    if (menu === 'Salidas' && item === 'Reportes') { onTabChange('reports'); return; }
    if (menu === 'Salidas' && item === 'Exportar PDF') { onTabChange('reports'); return; }
    if (menu === 'Salidas' && item === 'Exportar Excel') { onTabChange('reports'); return; }

    if (item === 'Imprimir') { window.print(); return; }

    if (item === 'Salir') {
      if (confirm('¿Desea cerrar la sesión operativa?')) window.location.reload();
      return;
    }

    if (item === 'Calculadora') {
      const expr = prompt('Calculadora — ingrese expresión (ej: 1250 * 36.5):');
      if (expr) {
        try {
          // eslint-disable-next-line no-new-func
          const result = Function(`"use strict"; return (${expr.replace(/[^0-9+\-*/.() ]/g, '')})`)();
          alert(`Resultado: ${Number(result).toLocaleString('es-VE', { maximumFractionDigits: 6 })}`);
        } catch { alert('Expresión inválida.'); }
      }
      return;
    }

    if (item === 'Conversor') {
      const val = prompt('Conversor USD ↔ Bs — ingrese monto en USD (o USD:monto):');
      if (val) {
        const num = parseFloat(String(val).replace(/[^0-9.]/g, ''));
        if (!isNaN(num)) {
          const bcvRate = (window as any).__BCV_RATE__ ?? 36.5;
          alert(`$${num.toFixed(2)} USD = Bs ${(num * bcvRate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (Tasa BCV: ${bcvRate})`);
        } else { alert('Monto inválido.'); }
      }
      return;
    }

    if (item === 'Calendario') {
      const today = new Date();
      alert(`Fecha actual: ${today.toLocaleDateString('es-VE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`);
      return;
    }

    if (item === 'Backup') {
      const data = { exportedAt: new Date().toISOString(), note: 'Backup manual desde MenuBar — use Firestore Console para backup completo.' };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `backup_${new Date().toISOString().split('T')[0]}.json`;
      a.click(); URL.revokeObjectURL(url);
      return;
    }

    if (item === 'Nuevo' || item === 'Abrir' || item === 'Guardar') {
      onTabChange('dashboard');
      return;
    }

    if (item === 'Deshacer' || item === 'Rehacer' || item === 'Cortar' || item === 'Copiar' || item === 'Pegar') { return; }

    if (item === 'Licencia') {
      alert('SISTEMA v2.0 — Licencia Comercial Privada\nProducto: Sistema Integrado de Gestión\nLicenciado para uso interno.');
      return;
    }

    if (item === 'Versión') {
      alert('Sistema Integrado de Gestión v2.0\nMódulos: Inventario · Facturación · Finanzas · Reportes · Cierres');
      return;
    }

    if (item === 'Soporte') {
      alert('Soporte Técnico:\nPara asistencia, contacte al administrador del sistema.');
      return;
    }

    if (item === 'Cascada' || item === 'Mosaico' || item === 'Cerrar Todo') { return; }

    if (item === 'Preferencias') { onTabChange('security'); return; }
  };

  const menuItems = [
    { label: 'Archivos', items: ['Nuevo', 'Abrir', 'Guardar', 'Imprimir', 'Salir'] },
    { label: 'Edición', items: ['Deshacer', 'Rehacer', 'Cortar', 'Copiar', 'Pegar'] },
    { label: 'Registros', items: ['Clientes', 'Proveedores', 'Productos', 'Lotes'] },
    { label: 'Módulos', items: ['Inventario', 'Facturación', 'Finanzas', 'RRHH', 'Producción'] },
    { label: 'Salidas', items: ['Reportes', 'Exportar PDF', 'Exportar Excel'] },
    { label: 'Utilidades', items: ['Calculadora', 'Calendario', 'Conversor', 'Backup'] },
    { label: 'Configuración', items: ['Usuarios', 'Seguridad', 'Preferencias', 'Licencia'] },
    { label: 'Ventana', items: ['Cascada', 'Mosaico', 'Cerrar Todo'] },
    { label: 'Acerca de...', items: ['Versión', 'Soporte'] },
  ];

  return (
    <nav className="bg-[#064e3b] text-emerald-100 text-[13px] font-bold py-1 px-6 flex items-center justify-between border-b border-emerald-800/50 sticky top-0 z-[100] w-full shadow-2xl">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] opacity-70"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] opacity-70"></div>
        <div className="w-2.5 h-2.5 rounded-full bg-[#27c93f] opacity-70"></div>
        <div className="flex items-center gap-2 ml-4 border-l border-emerald-700/50 pl-4">
          <User className="w-3.5 h-3.5 text-emerald-300" />
          <span className="text-emerald-400 font-black tracking-[0.1em] text-[9px] uppercase">OPERADOR:</span>
          <span className="text-white font-black tracking-widest text-[11px] uppercase ml-1">{currentUser?.name ?? 'SISTEMA'}</span>
          
          {/* UX-02: Indicador de sincronización */}
          {isSyncing && (
            <div className="flex items-center gap-1.5 ml-3 animate-pulse">
              <div className="w-3.5 h-3.5 border-2 border-emerald-300/30 border-t-emerald-300 rounded-full animate-spin" />
              <span className="text-[9px] text-emerald-300/80 font-medium">Sync...</span>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}

function Sidebar({ activeTab, setActiveTab, currentUser }: { activeTab: string, setActiveTab: (t: any) => void, currentUser: any }) {
  const canAccess = (permission: PermissionKey) => dataService.hasPermission(permission, currentUser);
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Panel Principal', hidden: !canAccess('DASHBOARD_VIEW') },
    { id: 'sales', icon: Receipt, label: 'Facturación', hidden: !canAccess('BILLING') },
    { id: 'inventory', icon: Package, label: 'Compras e Inventario', hidden: !canAccess('INVENTORY_READ') },
    { id: 'fractionation', icon: Factory, label: 'Desglose', hidden: !canAccess('FRACTIONATION') },
    { id: 'reports', icon: BarChart3, label: 'Reportes', hidden: !canAccess('REPORTS_VIEW') },
    { id: 'closing', icon: Lock, label: 'Cierre de Cajas', hidden: !canAccess('CLOSING_VIEW') },
    { id: 'finance', icon: Landmark, label: 'Finanzas', hidden: !canAccess('FINANCE_VIEW') },
    { id: 'security', icon: ShieldCheck, label: 'Seguridad', hidden: !canAccess('SECURITY_VIEW') },
  ];
  return (
    <aside className="flex flex-col h-[calc(100vh-28px)] w-48 xl:w-64 bg-[#f8fafc] border-r border-slate-200 font-headline text-sm font-medium tracking-tight py-4 xl:py-6 sticky top-[28px]">
      <div className="px-6 mb-8 group flex flex-col items-center text-center">
        <div className="w-16 h-16 xl:w-24 xl:h-24 bg-white rounded-2xl shadow-sm border p-2 flex items-center justify-center mb-2">
           <img src="/logo.png" alt="Costal" className="w-full h-full object-contain" />
        </div>
        <h1 className="text-lg xl:text-2xl font-black tracking-tighter text-slate-900 group-hover:text-emerald-700 transition-colors">Costal</h1>
      </div>
      <nav className="flex-1 px-2 xl:px-3">
        {navItems.filter(i => !i.hidden).map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`w-full flex items-center px-3 xl:px-4 py-1.5 xl:py-2 gap-2 xl:gap-3 rounded-lg transition-all duration-200 group ${isActive ? 'text-slate-900 font-bold bg-white shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50'}`}>
              <item.icon className={`w-4 h-4 transition-colors ${isActive ? 'text-emerald-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
              <span className="text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

 function TopBar({ currentUser, onSwitchUser, onScaleClick, onDebitClick, isScaleReading, weight, alerts, accountingAlerts = [], onNotificationClick, onRateChange, onInternalRateChange, onSettingsClick, exchangeRate, exchangeRateParallel, internalRate, currentSession, onOpenCashBox, onCloseCashBox }: any) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAlertMenu, setShowAlertMenu] = useState(false);
  const [showAccountingMenu, setShowAccountingMenu] = useState(false);
  const [showCashModal, setShowCashModal] = useState(false);
  const [initialCashUSD, setInitialCashUSD] = useState(0);
  const [initialCashVES, setInitialCashVES] = useState(0);
  const canAccess = (permission: PermissionKey) => dataService.hasPermission(permission, currentUser);

  // Cerrar menús al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = () => {
      setShowUserMenu(false);
      setShowAlertMenu(false);
      setShowAccountingMenu(false);
    };
    if (showUserMenu || showAlertMenu || showAccountingMenu) {
      document.addEventListener('click', handleClickOutside, { once: true });
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showUserMenu, showAlertMenu, showAccountingMenu]);
  
  const handleManualRate = () => {
    if (!canAccess('SETTINGS_RATES')) {
      alert('Solo el Administrador puede ajustar las tasas operativas.');
      return;
    }
    const val = prompt('Ajuste Manual de Tasa BCV:', exchangeRate.toFixed(2));
    if (val && !isNaN(parseFloat(val))) {
      const newRate = parseFloat(val);
      const oldRate = exchangeRate;
      onRateChange(newRate);
      
      // Guardar tasa manual en localStorage
      localStorage.setItem('bcvRateData', JSON.stringify({ 
        rate: newRate, 
        date: new Date().toISOString(),
        source: 'Manual'
      }));
      
      // SEC-05: Audit trail para cambio de tasa BCV
      dataService.addAuditEntry('RATES', 'BCV_RATE_CHANGE', 
        `Tasa BCV cambiada manualmente: ${oldRate.toFixed(2)} → ${newRate.toFixed(2)} Bs/USD`);
    }
  };

  const handleManualInternalRate = () => {
    if (!canAccess('SETTINGS_RATES')) {
      alert('Solo el Administrador puede ajustar las tasas operativas.');
      return;
    }
    const val = prompt('Ajuste Manual de Tasa Interna:', internalRate.toFixed(2));
    if (val && !isNaN(parseFloat(val))) {
      const newRate = parseFloat(val);
      const oldRate = internalRate;
      onInternalRateChange(newRate);
      
      // SEC-05: Audit trail para cambio de tasa interna manual
      dataService.addAuditEntry('RATES', 'INTERNAL_RATE_CHANGE', 
        `Tasa interna cambiada manualmente: ${oldRate.toFixed(2)} → ${newRate.toFixed(2)} Bs/USD`);
    }
  };

  return (
    <>
      <header className="flex justify-between items-center w-full px-3 xl:px-8 py-2 xl:py-3 sticky top-[28px] z-50 bg-white/60 backdrop-blur-md border-b border-slate-200/50 font-headline text-sm font-semibold">
      <div className="flex items-center gap-3 xl:gap-12">
        <div className="flex items-center gap-3 xl:gap-6">
          {/* Tasa BCV */}
          <div className="flex items-baseline gap-3 cursor-pointer group" onClick={handleManualRate}>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">VES BCV</span>
              <span className="text-[7px] text-emerald-500 font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">Clic Ajustar</span>
            </div>
            <span className="text-lg font-black text-slate-900 tracking-tighter group-hover:text-emerald-700 transition-colors">{exchangeRate.toFixed(2)}</span>
            {(() => {
              const saved = localStorage.getItem('bcvRateData');
              if (saved) {
                const parsed = JSON.parse(saved);
                const date = new Date(parsed.date);
                const isToday = isSameDayVE(date, new Date());
                return (
                  <span className={`text-[7px] font-bold px-1 py-0.5 rounded ${isToday ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                    {isToday ? 'HOY' : formatDateVE(date, { day: 'numeric', month: 'short' })}
                  </span>
                );
              }
              return null;
            })()}
            <div className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded cursor-pointer hover:bg-emerald-100 transition-colors group/sync" onClick={(e) => { e.stopPropagation(); window.location.reload(); }}>
              <RefreshCw className="w-2.5 h-2.5 group-hover/sync:rotate-180 transition-transform duration-500" />
            </div>
          </div>
          
          <div className="hidden md:block h-6 w-[1px] bg-slate-200"></div>

          {/* Cash Box Session */}
          {canAccess('CLOSING_VIEW') && (
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full animate-pulse ${currentSession ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Caja: {currentSession ? 'Abierta' : 'Cerrada'}
              </span>
              {currentUser.role === 'ADMIN' && (() => {
                const cutoff = getVenezuelaDateKey(Date.now() - 24 * 60 * 60 * 1000);
                const openCount = dataService.getCashBoxSessions().filter(s => s.status === 'OPEN' && s.openDate >= cutoff).length;
                return openCount > 1 ? (
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[8px] font-black">
                    {openCount} cajas
                  </span>
                ) : null;
              })()}
              {!currentSession ? (
                <button
                  onClick={() => setShowCashModal(true)}
                  className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase hover:bg-emerald-200 transition-colors flex items-center gap-1"
                >
                  <DollarSign className="w-3 h-3" />
                  Abrir
                </button>
              ) : (
                <button
                  onClick={onCloseCashBox}
                  className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-[9px] font-black uppercase hover:bg-red-200 transition-colors flex items-center gap-1"
                >
                  <Lock className="w-3 h-3" />
                  Cerrar
                </button>
              )}
            </div>
          )}

        </div>

        <div className="hidden xl:block h-6 w-[1px] bg-slate-200"></div>
        <div className="flex items-center gap-2 xl:gap-3">
          <div className={`w-2 h-2 rounded-full animate-pulse ${currentUser.role === 'ADMIN' ? 'bg-emerald-500' : currentUser.role === 'ALMACENISTA' ? 'bg-amber-500' : 'bg-blue-500'}`}></div>
          <span className="text-slate-500 text-[9px] xl:text-[10px] font-black uppercase tracking-[0.1em] xl:tracking-[0.15em] shrink-0">{currentUser.name} • {currentUser.role}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 xl:gap-6">
        <button onClick={onDebitClick} className="flex items-center gap-2 px-2 xl:px-4 py-1.5 xl:py-2 bg-white text-slate-900 rounded-xl transition-all shadow-sm text-[9px] xl:text-[10px] font-black uppercase tracking-wider xl:tracking-widest border border-slate-200 hover:bg-slate-50">
          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
          Debito
        </button>
        <div className="flex items-center gap-2 xl:gap-4 text-slate-400">
          <div className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors" onClick={() => canAccess('SETTINGS_RATES') ? onSettingsClick() : alert('Acceso Restringido.')}>
            <Settings className="w-4 h-4" />
          </div>
          
          {canAccess('INVENTORY_READ') && <div className="relative">
            <div className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors relative" onClick={(e) => { e.stopPropagation(); setShowAlertMenu(!showAlertMenu); }}>
              <Bell className="w-4 h-4" />
              {alerts.length > 0 && <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-black rounded-full ring-2 ring-white flex items-center justify-center">{alerts.length}</span>}
            </div>

            {showAlertMenu && (
              <div onClick={(e) => e.stopPropagation()} className="fixed right-4 top-20 w-96 max-w-[calc(100vw-2rem)] bg-white border-2 border-slate-200 rounded-2xl shadow-2xl z-[999] animate-in slide-in-from-top-2 overflow-hidden max-h-[80vh]">
                <div className="bg-slate-900 p-4 flex justify-between items-center text-white">
                   <div className="flex items-center gap-2">
                     <Bell className="w-4 h-4 text-emerald-400" />
                     <h5 className="text-[11px] font-black uppercase tracking-widest">Alertas de Inventario ({alerts.length})</h5>
                   </div>
                   <button onClick={() => setShowAlertMenu(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <div className="max-h-[60vh] overflow-y-auto bg-slate-50">
                  {alerts.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 space-y-2">
                       <ShieldCheck className="w-10 h-10 mx-auto opacity-20" />
                       <p className="text-[10px] font-black uppercase">Sistema Íntegro</p>
                    </div>
                  ) : (
                    alerts.map((alert: any) => (
                      <div key={alert.id} className="p-4 border-b border-slate-100 hover:bg-white transition-all flex gap-3 group">
                         <div className={`mt-1 p-1.5 rounded-lg shrink-0 ${alert.severity === 'error' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                            {alert.type === 'LOW_STOCK' ? <ArrowDownRight className="w-3 h-3" /> : <Timer className="w-3 h-3" />}
                         </div>
                         <div className="text-left space-y-0.5">
                            <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{alert.description}</p>
                            <p className="text-[9px] font-bold text-slate-500 leading-tight">{alert.details}</p>
                            <span className="text-[7px] font-black uppercase text-slate-300 tracking-widest">{alert.sku}</span>
                         </div>
                      </div>
                    ))
                  )}
                </div>
                {alerts.length > 0 && (
                  <div className="p-3 bg-white border-t border-slate-100 text-center">
                    <button className="text-[8px] font-black text-emerald-600 uppercase tracking-widest hover:underline">Resolver Protocolos Críticos</button>
                  </div>
                )}
              </div>
            )}
          </div>}

          {/* Alertas Contables — solo si tiene permiso */}
          {canAccess('ACCOUNTING_ALERTS') && (
            <div className="relative">
              <div className="p-2 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors relative" onClick={(e) => { e.stopPropagation(); setShowAccountingMenu(!showAccountingMenu); }}>
                <BookOpen className="w-4 h-4 text-slate-400" />
                {accountingAlerts.length > 0 && (
                  <span className={`absolute top-1.5 right-1.5 w-3.5 h-3.5 text-white text-[8px] font-black rounded-full ring-2 ring-white flex items-center justify-center ${accountingAlerts.some((a: any) => a.severity === 'error') ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}>
                    {accountingAlerts.length}
                  </span>
                )}
              </div>
              {showAccountingMenu && (
                <div onClick={(e) => e.stopPropagation()} className="fixed right-4 top-20 w-[28rem] max-w-[calc(100vw-2rem)] bg-white border-2 border-slate-200 rounded-2xl shadow-2xl z-[999] animate-in slide-in-from-top-2 overflow-hidden max-h-[80vh]">
                  <div className="bg-indigo-950 p-4 flex justify-between items-center text-white">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-indigo-400" />
                      <div>
                        <h5 className="text-[11px] font-black uppercase tracking-widest">Alertas Contables ({accountingAlerts.length})</h5>
                        <p className="text-[8px] font-bold text-indigo-300 uppercase tracking-widest mt-0.5">Operaciones que afectan libros</p>
                      </div>
                    </div>
                    <button onClick={() => setShowAccountingMenu(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto bg-slate-50">
                    {accountingAlerts.length === 0 ? (
                      <div className="p-10 text-center text-slate-400 space-y-2">
                        <ShieldCheck className="w-10 h-10 mx-auto opacity-20" />
                        <p className="text-[10px] font-black uppercase">Sin operaciones pendientes</p>
                      </div>
                    ) : (
                      accountingAlerts.map((alert: any) => {
                        const isError = alert.severity === 'error';
                        const typeLabel =
                          alert.type === 'AP_OVERDUE' ? 'AP Vencida' :
                          alert.type === 'AP_DUE_SOON' ? 'AP Por Vencer' :
                          alert.type === 'AR_OVERDUE' ? 'AR Mora' : 'Aviso';
                        const iconColor = isError ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';
                        return (
                          <div key={alert.id} className="p-4 border-b border-slate-100 hover:bg-white transition-all flex gap-3">
                            <div className={`mt-0.5 px-2 py-1 rounded-lg text-[9px] font-black shrink-0 ${iconColor}`}>
                              {typeLabel}
                            </div>
                            <div className="text-left space-y-0.5 flex-1">
                              <p className="text-[10px] font-black text-slate-900 uppercase leading-none">{alert.label}</p>
                              <p className="text-[9px] font-bold text-slate-500 leading-tight">{alert.description}</p>
                              <div className="flex items-center gap-3 pt-0.5">
                                {alert.daysOverdue != null && (
                                  <span className={`text-[8px] font-black ${isError ? 'text-red-600' : 'text-amber-600'}`}>
                                    {alert.daysOverdue}d de mora
                                  </span>
                                )}
                                {alert.daysUntilDue != null && (
                                  <span className="text-[8px] font-black text-amber-600">
                                    Vence en {alert.daysUntilDue}d
                                  </span>
                                )}
                                {alert.amountUSD > 0 && (
                                  <span className="text-[9px] font-black text-slate-700 font-mono ml-auto">${alert.amountUSD.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <div 
              onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu); }}
              className="w-9 h-9 rounded-full overflow-hidden bg-slate-200 border-2 border-white shadow-sm flex items-center justify-center cursor-pointer hover:border-emerald-600 transition-all"
            >
              <User className="w-5 h-5 text-slate-400" />
            </div>
            {showUserMenu && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl py-2 z-[200] animate-in slide-in-from-top-2">
                {/* Info del usuario actual — solo lectura */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Sesión activa</p>
                  <p className="text-[11px] font-black text-slate-900 uppercase truncate">{currentUser?.name}</p>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{currentUser?.role}</p>
                  {currentUser?.email && <p className="text-[8px] text-slate-400 mt-0.5 truncate">{currentUser.email}</p>}
                </div>
                <div className="pt-1">
                  <button
                    onClick={async () => {
                      sessionService.clearSession();
                      const token = sessionStorage.getItem('activeSessionToken');
                      if (token) {
                        await dataService.terminateActiveSession(token);
                        sessionStorage.removeItem('activeSessionToken');
                        sessionStorage.removeItem('activeSessionUserId');
                      }
                      await authService.signOut();
                      // El listener de onAuthStateChanged manejará el cambio de estado
                      setShowUserMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-[10px] font-black uppercase hover:bg-red-50 text-red-600 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Cerrar Sesión
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
    
    {/* Cash Box Open Modal */}
    {showCashModal && (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full mx-4">
          <h3 className="text-2xl font-black text-slate-900 mb-6">Apertura de Caja</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                Monto Inicial (USD)
              </label>
              <input
                type="number"
                value={initialCashUSD}
                onChange={(e) => setInitialCashUSD(Number(e.target.value))}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-900 focus:border-emerald-500 focus:bg-white transition-all outline-none"
                placeholder="0.00"
              />
            </div>
            
            <div>
              <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest block mb-2">
                Monto Inicial (VES)
              </label>
              <input
                type="number"
                value={initialCashVES}
                onChange={(e) => setInitialCashVES(Number(e.target.value))}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl px-4 py-3 text-lg font-black text-slate-900 focus:border-emerald-500 focus:bg-white transition-all outline-none"
                placeholder="0.00"
              />
            </div>

            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2">
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tasas congeladas para la sesión</div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase">BCV</div>
                  <div className="text-sm font-black text-slate-900">Bs {Number(exchangeRate ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase">Paralela</div>
                  <div className="text-sm font-black text-slate-900">Bs {Number(exchangeRateParallel ?? 0).toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-400 uppercase">Interna</div>
                  <div className="text-sm font-black text-slate-900">Bs {Number(internalRate ?? 0).toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => {
                setShowCashModal(false);
                setInitialCashUSD(0);
                setInitialCashVES(0);
              }}
              className="flex-1 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl text-[11px] font-black uppercase hover:bg-slate-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={async () => {
                await onOpenCashBox({
                  initialAmountUSD: initialCashUSD,
                  initialAmountVES: initialCashVES,
                  openingBreakdown: [
                    {
                      key: 'cash_usd|||',
                      method: 'cash_usd',
                      label: 'Efectivo $',
                      amountUSD: Number(initialCashUSD ?? 0) || 0,
                      amountVES: 0,
                      count: initialCashUSD > 0 ? 1 : 0
                    },
                    {
                      key: 'cash_ves|||',
                      method: 'cash_ves',
                      label: 'Efectivo Bs',
                      amountUSD: 0,
                      amountVES: Number(initialCashVES ?? 0) || 0,
                      count: initialCashVES > 0 ? 1 : 0
                    }
                  ]
                });
                setShowCashModal(false);
              }}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl text-[11px] font-black uppercase hover:bg-emerald-700 transition-all"
            >
              Abrir Caja
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
