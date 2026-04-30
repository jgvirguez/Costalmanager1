import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  UserPlus, 
  ShieldCheck, 
  ShieldAlert, 
  UserCircle, 
  Key, 
  Activity, 
  Trash2, 
  Check, 
  X,
  Lock,
  Eye,
  EyeOff,
  UserCheck,
  Settings,
  Users,
  Contact,
  Truck,
  Building2,
  Search,
  Edit2,
  Phone,
  MapPin,
  IdCard,
  Loader2,
  MonitorSmartphone,
  RefreshCw,
  Bell,
  BellRing,
  UserCog,
  KeyRound
} from 'lucide-react';
import { dataService, UserRole, User, PermissionKey } from '../../services/dataService';
import { ConfirmModal } from '../ConfirmModal';
import { db } from '../../services/firebaseConfig';
import { collection, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { clientService } from '../../services/clientService';
import { supplierService } from '../../services/supplierService';
import { BillingClient } from '../../types/billing';
import { Supplier } from '../../services/supplierService';

export function SecurityView() {
  const [users, setUsers] = useState<User[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('CAJERO');
  const [newPin, setNewPin] = useState('');
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('CAJERO');
  const [editPin, setEditPin] = useState('');
  const [editPermissions, setEditPermissions] = useState<PermissionKey[]>([]);
  const [newPermissions, setNewPermissions] = useState<PermissionKey[]>(dataService.getPermissionsForRole('CAJERO'));
  const [showPin, setShowPin] = useState(false);
  const [showEditPin, setShowEditPin] = useState(false);
  const [, setTick] = useState(0);
  const [isRegisteringExisting, setIsRegisteringExisting] = useState(false);
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('CAJERO');
  const [regPin, setRegPin] = useState('');
  const [regUid, setRegUid] = useState('');
  const [regPermissions, setRegPermissions] = useState<PermissionKey[]>(dataService.getPermissionsForRole('CAJERO'));
  const [showRegPin, setShowRegPin] = useState(false);
  const permissionDefinitions = dataService.getPermissionDefinitions().filter((item) => item.key !== 'ALL');
  const permissionsByModule = permissionDefinitions.reduce((acc, item) => {
    const key = item.module;
    const existing = acc.get(key) ?? [];
    existing.push(item);
    acc.set(key, existing);
    return acc;
  }, new Map<string, typeof permissionDefinitions>());

  // Tab management
  const [activeTab, setActiveTab] = useState<'USERS' | 'ENTITIES' | 'ACCESOS'>('USERS');
  const [loginSessions, setLoginSessions] = useState<any[]>([]);
  const [loadingLoginSessions, setLoadingLoginSessions] = useState(false);
  const [loginSessionsFilter, setLoginSessionsFilter] = useState<'ALL' | 'OK' | 'FAIL'>('ALL');
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [loadingActiveSessions, setLoadingActiveSessions] = useState(false);
  const loadActiveSessions = async () => {
    setLoadingActiveSessions(true);
    const sessions = await dataService.getAllActiveSessions();
    setActiveSessions(sessions);
    setLoadingActiveSessions(false);
  };
  const loadLoginSessions = async () => {
    setLoadingLoginSessions(true);
    const sessions = await dataService.getLoginSessions(150);
    setLoginSessions(sessions);
    setLoadingLoginSessions(false);
  };

  // SEC-09: Security alerts
  const [secAlerts, setSecAlerts] = useState<any[]>([]);
  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const unreadAlerts = secAlerts.filter(a => !a.read);
  useEffect(() => {
    dataService.getSecurityAlerts().then(setSecAlerts);
  }, []);
  const handleMarkAllRead = async () => {
    await dataService.markAllSecurityAlertsRead();
    setSecAlerts(p => p.map(a => ({ ...a, read: true })));
  };
  const handleMarkOneRead = async (id: string) => {
    await dataService.markSecurityAlertRead(id);
    setSecAlerts(p => p.map(a => a.id === id ? { ...a, read: true } : a));
  };

  const [activeSubTab, setActiveSubTab] = useState<'CLIENTS' | 'SUPPLIERS'>('CLIENTS');

  // Login lockouts state
  const [lockouts, setLockouts] = useState<Array<{ id: string; email: string; isLocked: boolean; lockedUntil: number; attempts: number; lastAttempt: number }>>([]);
  const [loadingLockouts, setLoadingLockouts] = useState(false);

  // Entities state
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [entitySearch, setEntitySearch] = useState('');
  const [editingClient, setEditingClient] = useState<BillingClient | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; title: string; message: string; danger?: boolean; onConfirm: () => void }>({ open: false, title: '', message: '', onConfirm: () => {} });
  const openConfirm = (title: string, message: string, onConfirm: () => void, danger = false) =>
    setConfirmModal({ open: true, title, message, onConfirm, danger });
  const closeConfirm = () => setConfirmModal(prev => ({ ...prev, open: false }));
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    // Activar listener en tiempo real de Supabase al entrar al módulo
    dataService.ensureUsersRealtimeSync();
    setUsers(dataService.getUsers());
    setClients(clientService.getClients());
    setSuppliers(supplierService.getSuppliers());

    const unsubData = dataService.subscribe(() => {
      setUsers(dataService.getUsers());
      setTick(t => t + 1);
    });
    const unsubClients = clientService.subscribe(() => setClients(clientService.getClients()));
    const unsubSuppliers = supplierService.subscribe(() => setSuppliers(supplierService.getSuppliers()));

    // Suscribirse a bloqueos de login en tiempo real
    setLoadingLockouts(true);
    const lockoutsQuery = query(collection(db, 'login_lockouts'), where('isLocked', '==', true));
    const unsubLockouts = onSnapshot(lockoutsQuery, (snap) => {
      const data = snap.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as any[];
      setLockouts(data.filter(item => item.lockedUntil > Date.now()));
      setLoadingLockouts(false);
    }, () => setLoadingLockouts(false));

    return () => {
      unsubData();
      unsubClients();
      unsubSuppliers();
      unsubLockouts();
    };
  }, []);

  const handleUnlockAccount = (email: string) => {
    openConfirm(
      'Desbloquear cuenta',
      `¿Desbloquear la cuenta ${email}?`,
      async () => {
        closeConfirm();
        try { await dataService.adminUnlockAccount(email); } catch {}
      }
    );
  };

  useEffect(() => {
    setNewPermissions(dataService.getPermissionsForRole(newRole));
  }, [newRole]);

  const handleRegisterExisting = async () => {
    if (!regName || !regEmail || !regPin || !regUid) {
      alert('Completa todos los campos incluyendo el UID de Firebase');
      return;
    }
    if (regPin.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres alfanuméricos');
      return;
    }
    try {
      await dataService.registerExistingFirebaseUser(regName, regEmail, regRole, regPin, regUid, regPermissions);
      setRegName(''); setRegEmail(''); setRegPin(''); setRegUid('');
      setRegPermissions(dataService.getPermissionsForRole('CAJERO'));
      setRegRole('CAJERO');
      setIsRegisteringExisting(false);
      alert('✅ Usuario sincronizado exitosamente con el sistema.');
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    }
  };

  const handleAddUser = async () => {
    if (!newName || !newEmail || !newPin) return;
    if (newPin.length < 8) {
      alert('La contraseña debe tener al menos 8 caracteres alfanuméricos');
      return;
    }
    try {
      await dataService.addUser(newName.trim().toUpperCase(), newEmail.trim().toLowerCase(), newRole, newPin, newPermissions);
      setNewName('');
      setNewEmail('');
      setNewPin('');
      setNewPermissions(dataService.getPermissionsForRole('CAJERO'));
      setNewRole('CAJERO');
      setIsAdding(false);
      alert('✅ Operador creado exitosamente. El usuario puede iniciar sesión inmediatamente con su email y contraseña.');
    } catch (error: any) {
      alert(`❌ Error al crear operador: ${error.message || 'Error desconocido'}`);
    }
  };

  const startEditUser = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email || '');
    setEditRole(user.role);
    // SEC-FIX: No prellenar el PIN por seguridad, pero mostrar indicador visual
    setEditPin('');
    setEditPermissions([...user.permissions]);
  };

  const handleEditUser = async () => {
    if (!editingUser || !editName) return;
    const patch: any = {
      name: editName,
      email: editEmail,
      role: editRole,
      permissions: editPermissions,
    };
    if (editPin) {
      if (editPin.length < 8) {
        alert('La contraseña debe tener al menos 8 caracteres alfanuméricos');
        return;
      }
      patch.pin = editPin;
    }
    try {
      await dataService.updateUserAccess(editingUser.id, patch);
      setEditingUser(null);
      setEditPin('');
      setEditEmail('');
    } catch (error: any) {
      alert(`❌ Error al actualizar usuario: ${error.message}`);
    }
  };

  const toggleEditPermission = (permission: PermissionKey) => {
    setEditPermissions((prev) => prev.includes(permission)
      ? prev.filter((entry) => entry !== permission)
      : [...prev, permission]);
  };

  useEffect(() => {
    if (editingUser) {
      setEditPermissions(dataService.getPermissionsForRole(editRole));
    }
  }, [editRole, editingUser]);

  const togglePermission = (permission: PermissionKey) => {
    setNewPermissions((prev) => prev.includes(permission)
      ? prev.filter((entry) => entry !== permission)
      : [...prev, permission]);
  };

  const getPinStrength = (pin: string): { score: number; label: string; color: string } => {
    if (!pin) return { score: 0, label: '', color: '' };
    let score = 0;
    if (pin.length >= 8) score++;
    if (/[a-z]/.test(pin)) score++;
    if (/[A-Z]/.test(pin)) score++;
    if (/[0-9]/.test(pin)) score++;
    if (/[^a-zA-Z0-9]/.test(pin)) score++;
    if (score <= 1) return { score, label: 'Débil', color: 'bg-red-500' };
    if (score <= 3) return { score, label: 'Media', color: 'bg-amber-500' };
    return { score, label: 'Fuerte', color: 'bg-emerald-500' };
  };

  const PinStrength = ({ pin }: { pin: string }) => {
    const { score, label, color } = getPinStrength(pin);
    if (!pin) return null;
    return (
      <div className="space-y-1">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= score ? color : 'bg-slate-200'}`} />
          ))}
        </div>
        <p className={`text-[8px] font-black uppercase tracking-wider ${score <= 1 ? 'text-red-600' : score <= 3 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {label} {pin.length < 8 ? `· faltan ${8 - pin.length} caracteres` : '· mínimo cumplido'}
        </p>
      </div>
    );
  };

  const [deletingUser, setDeletingUser] = useState<User | null>(null);

  // PIN sync diagnostic state
  const [pinDiagnosis, setPinDiagnosis] = useState<{
    totalUsers: number;
    usersWithPendingPins: number;
    usersWithoutFirebaseUid: number;
    details: Array<{
      id: string;
      name: string;
      email: string;
      status: 'synced' | 'pending' | 'no_firebase' | 'no_pin';
      firestorePin?: string;
      pendingPin?: string;
    }>;
  } | null>(null);
  const [loadingPinDiagnosis, setLoadingPinDiagnosis] = useState(false);
  const [showPinDiagnosis, setShowPinDiagnosis] = useState(false);

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      await dataService.deleteUser(deletingUser.id);
      setDeletingUser(null);
    } catch (e: any) {
      alert(`No se pudo eliminar usuario: ${e?.message ?? 'Error desconocido'}`);
    }
  };

  const permissionLabelMap = new Map(dataService.getPermissionDefinitions().map((item) => [item.key, item.label]));

  const toggleUserStatus = (id: string, current: boolean) => {
    dataService.updateUserStatus(id, !current);
  };

  const handlePinDiagnosis = async () => {
    setLoadingPinDiagnosis(true);
    try {
      const diagnosis = await dataService.diagnosePinSync();
      setPinDiagnosis(diagnosis);
      setShowPinDiagnosis(true);
    } catch (e) {
      alert('Error al diagnosticar PINs: ' + (e as Error).message);
    } finally {
      setLoadingPinDiagnosis(false);
    }
  };

  const handleForcePinSync = async (userIds?: string[]) => {
    const ids = userIds || pinDiagnosis?.details.filter(d => d.status === 'pending').map(d => d.id) || [];
    if (ids.length === 0) {
      alert('No hay usuarios con PINs pendientes de sincronización.');
      return;
    }
    openConfirm(
      'Forzar sincronización',
      `¿Forzar sincronización de ${ids.length} usuario(s)? Deberán cerrar sesión y volver a iniciar sesión.`,
      async () => {
        closeConfirm();
        try {
          await dataService.forcePinSyncForUsers(ids);
          await handlePinDiagnosis();
        } catch {}
      }
    );
  };

  const auditLog = dataService.getAuditTrail().filter(l => l.action === 'AUTH' || l.action === 'SECURITY' || l.action === 'USER_CREATE');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header Industrial */}
      <div className="flex justify-between items-end">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-slate-900 rounded-xl text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
             </div>
             <h2 className="font-headline text-2xl font-black tracking-tight text-slate-900 uppercase">Centro de Seguridad Operativa</h2>
          </div>
          <p className="text-slate-500 text-[10px] uppercase tracking-[0.3em] font-black pl-11">Gestión de Acceso • Matrices de Permisos • Auditoría</p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* SEC-09: Alert bell */}
          <div className="relative">
            <button
              onClick={() => setShowAlertsPanel(p => !p)}
              className="relative p-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
            >
              {unreadAlerts.length > 0
                ? <BellRing className="w-4 h-4 text-amber-600"/>
                : <Bell className="w-4 h-4 text-slate-400"/>}
              {unreadAlerts.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 bg-red-600 text-white rounded-full text-[8px] font-black flex items-center justify-center">
                  {unreadAlerts.length}
                </span>
              )}
            </button>
            {showAlertsPanel && (
              <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b bg-slate-50 flex items-center justify-between">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Alertas de Seguridad</span>
                  {unreadAlerts.length > 0 && (
                    <button onClick={handleMarkAllRead} className="text-[9px] font-black text-indigo-600 hover:underline">Marcar todas leídas</button>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                  {secAlerts.length === 0 && (
                    <p className="px-4 py-6 text-center text-slate-400 text-xs font-bold">Sin alertas recientes</p>
                  )}
                  {secAlerts.slice(0, 30).map(a => {
                    const icons: Record<string, React.ReactNode> = {
                      USER_CREATED: <UserPlus className="w-3.5 h-3.5 text-emerald-600"/>,
                      ROLE_CHANGED: <UserCog className="w-3.5 h-3.5 text-indigo-600"/>,
                      PASSWORD_CHANGED: <KeyRound className="w-3.5 h-3.5 text-amber-600"/>
                    };
                    const labels: Record<string, string> = {
                      USER_CREATED: 'Usuario creado',
                      ROLE_CHANGED: 'Rol modificado',
                      PASSWORD_CHANGED: 'Contraseña cambiada'
                    };
                    const dt = a.timestamp ? new Date(a.timestamp) : null;
                    return (
                      <div key={a.id} className={`flex items-start gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${
                        !a.read ? 'bg-amber-50/40' : ''
                      }`} onClick={() => handleMarkOneRead(a.id)}>
                        <div className="mt-0.5 shrink-0">{icons[a.type] ?? <ShieldAlert className="w-3.5 h-3.5 text-slate-400"/>}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] font-black text-slate-800 uppercase tracking-wide">{labels[a.type] ?? a.type}</span>
                            {!a.read && <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"/>}
                          </div>
                          <p className="text-[10px] font-bold text-slate-600 truncate">{a.targetUserName}</p>
                          {a.detail && <p className="text-[9px] text-slate-400 font-mono truncate">{a.detail}</p>}
                          <p className="text-[9px] text-slate-300 mt-0.5">{dt ? dt.toLocaleString('es-VE') : ''} · por {a.actorName}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        <div className="flex items-center bg-slate-100 p-1 rounded-2xl">
          <button 
            onClick={() => setActiveTab('USERS')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'USERS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-3.5 h-3.5" /> Usuarios
          </button>
          <button 
            onClick={() => setActiveTab('ENTITIES')}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'ENTITIES' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Contact className="w-3.5 h-3.5" /> Entidades
          </button>
          <button 
            onClick={() => { setActiveTab('ACCESOS'); loadLoginSessions(); loadActiveSessions(); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'ACCESOS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <MonitorSmartphone className="w-3.5 h-3.5" /> Accesos
          </button>
        </div>
        </div>

        {activeTab === 'USERS' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePinDiagnosis()}
              disabled={loadingPinDiagnosis}
              className="flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
              title="Diagnóstico de sincronización de PINs"
            >
              {loadingPinDiagnosis ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />} 
              Diagnóstico PINs
            </button>
            <button
              onClick={() => setIsRegisteringExisting(true)}
              className="flex items-center gap-2 px-4 py-3 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-amber-700 transition-all active:scale-95"
              title="Registrar usuario ya creado en Firebase"
            >
              <UserCheck className="w-4 h-4" /> Vincular Firebase
            </button>
            <button 
              onClick={() => setIsAdding(true)}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-emerald-800 transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4" /> Crear Nuevo Operador
            </button>
          </div>
        )}
      </div>

      {activeTab === 'ACCESOS' && (
        <div className="space-y-5 animate-in fade-in slide-in-from-top-4 duration-500">
          {/* Active sessions panel */}
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b bg-slate-50/50 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-sm">Sesiones Activas Ahora</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Máx. 2 por usuario · Stale &gt; 8h se limpian al login</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase ${
                  activeSessions.length === 0 ? 'bg-emerald-50 text-emerald-700' : activeSessions.length >= 2 ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                }`}>{activeSessions.length} activa(s)</span>
                <button onClick={loadActiveSessions} disabled={loadingActiveSessions}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loadingActiveSessions ? 'animate-spin' : ''}`}/>
                </button>
              </div>
            </div>
            {loadingActiveSessions ? (
              <div className="flex items-center justify-center py-8 gap-3 text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin"/><span className="text-xs font-bold">Cargando...</span>
              </div>
            ) : activeSessions.length === 0 ? (
              <p className="px-6 py-6 text-center text-slate-400 text-sm font-bold">Sin sesiones activas</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {activeSessions.map(s => {
                  const ua = String(s.userAgent ?? '');
                  const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : ua.includes('Edge') ? 'Edge' : 'Navegador';
                  const started = s.startedAt ? new Date(s.startedAt) : null;
                  const lastSeen = s.lastSeen ? new Date(s.lastSeen) : null;
                  const staleHours = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 3600000) : null;
                  const matchedUser = users.find(u => u.id === s.userId);
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50/50">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          staleHours !== null && staleHours < 1 ? 'bg-emerald-500' : staleHours !== null && staleHours < 4 ? 'bg-amber-400' : 'bg-red-400'
                        }`}/>
                        <div>
                          <p className="text-[11px] font-black text-slate-900">{matchedUser?.name ?? s.userId}</p>
                          <p className="text-[9px] text-slate-400 font-bold">{browser} · {s.platform ?? 'Desconocido'} · IP: {s.ip}</p>
                          <p className="text-[9px] text-slate-300 font-mono">
                            Inicio: {started ? started.toLocaleString('es-VE') : '—'} · Última actividad: {lastSeen ? lastSeen.toLocaleString('es-VE') : '—'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          await dataService.terminateActiveSession(s.sessionToken);
                          setActiveSessions(p => p.filter(x => x.id !== s.id));
                        }}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                      >
                        Terminar
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-slate-50/50 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-slate-900 text-base">Historial de Accesos</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">IP · Dispositivo · Éxito / Fallo · Fecha</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl">
                  {(['ALL','OK','FAIL'] as const).map(f => (
                    <button key={f} onClick={() => setLoginSessionsFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        loginSessionsFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                      }`}>
                      {f === 'ALL' ? 'Todos' : f === 'OK' ? '✓ Exitosos' : '✗ Fallidos'}
                    </button>
                  ))}
                </div>
                <button onClick={loadLoginSessions} disabled={loadingLoginSessions}
                  className="p-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-600 ${loadingLoginSessions ? 'animate-spin' : ''}`}/>
                </button>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
              {loadingLoginSessions ? (
                <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin"/>
                  <span className="text-sm font-bold">Cargando registros...</span>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-slate-50 border-b border-slate-200">
                    <tr className="text-[8px] font-black text-slate-400 uppercase tracking-wider">
                      <th className="px-4 py-3">Fecha / Hora</th>
                      <th className="px-4 py-3">Usuario</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">IP</th>
                      <th className="px-4 py-3">Plataforma</th>
                      <th className="px-4 py-3">Navegador</th>
                      <th className="px-4 py-3 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loginSessions
                      .filter(s => loginSessionsFilter === 'ALL' ? true : loginSessionsFilter === 'OK' ? s.success : !s.success)
                      .map(s => {
                        const ua = String(s.userAgent ?? '');
                        const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : ua.includes('Edge') ? 'Edge' : 'Otro';
                        const dt = s.timestamp ? new Date(s.timestamp) : null;
                        return (
                          <tr key={s.id} className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${!s.success ? 'bg-red-50/30' : ''}`}>
                            <td className="px-4 py-3 text-[10px] font-mono text-slate-500 whitespace-nowrap">
                              {dt ? dt.toLocaleDateString('es-VE') : '—'}<br/>
                              <span className="text-slate-400">{dt ? dt.toLocaleTimeString('es-VE') : ''}</span>
                            </td>
                            <td className="px-4 py-3 text-[11px] font-black text-slate-900">{s.userName ?? '—'}</td>
                            <td className="px-4 py-3 text-[10px] text-slate-500 font-mono">{s.email}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[9px] font-black font-mono">{s.ip ?? 'N/A'}</span>
                            </td>
                            <td className="px-4 py-3 text-[10px] text-slate-500 font-bold">{s.platform ?? '—'}</td>
                            <td className="px-4 py-3 text-[10px] text-slate-500 font-bold">{browser}</td>
                            <td className="px-4 py-3 text-center">
                              {s.success
                                ? <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-lg text-[8px] font-black uppercase">✓ Exitoso</span>
                                : <div className="space-y-0.5">
                                    <span className="block px-2 py-0.5 bg-red-50 text-red-700 rounded-lg text-[8px] font-black uppercase">✗ Fallido</span>
                                    {s.failReason && <span className="text-[8px] text-red-400 font-bold">{s.failReason}</span>}
                                  </div>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    {loginSessions.length === 0 && !loadingLoginSessions && (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm font-bold">Sin registros de acceso aún</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'USERS' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* User Management List */}
        <div className="lg:col-span-8 space-y-6">
          {/* Alerta: usuarios de Firebase Auth no vinculados */}
          {users.length <= 1 && (
            <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 flex items-start gap-3">
              <span className="text-xl mt-0.5">⚠️</span>
              <div>
                <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">Usuarios de Firebase no registrados en el sistema</p>
                <p className="text-[9px] text-amber-700 font-bold mb-2">
                  Tienes usuarios creados en Firebase Authentication que aún no están vinculados al sistema. Para vincularlos, haz clic en <strong>"Vincular Firebase"</strong> e ingresa el correo, nombre, rol y el UID que aparece en Firebase Console → Authentication.
                </p>
                <button
                  onClick={() => setIsRegisteringExisting(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all active:scale-95"
                >
                  Vincular ahora →
                </button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {users.map(user => (
              <div 
                key={user.id} 
                className={`bg-white p-6 rounded-[2rem] border border-slate-200/60 shadow-sm transition-all relative overflow-hidden group ${!user.active ? 'opacity-60 grayscale' : 'hover:shadow-xl'}`}
              >
                {!user.active && (
                   <div className="absolute inset-0 bg-slate-900/5 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3 z-10">
                      <div className="bg-red-500 text-white text-[8px] font-black uppercase px-4 py-1.5 rounded-full shadow-lg">Cuenta Desactivada</div>
                      <button
                        onClick={() => toggleUserStatus(user.id, user.active)}
                        className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all active:scale-95 shadow-lg"
                      >
                        Reactivar Usuario
                      </button>
                   </div>
                )}

                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-2xl ${user.role === 'ADMIN' ? 'bg-emerald-50 text-emerald-600' : user.role === 'ALMACENISTA' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                      <UserCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 uppercase tracking-tighter text-lg leading-none">{user.name}</h4>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{user.role}</p>
                      {user.email && (
                        <p className="text-[8px] font-mono text-slate-500 mt-1 truncate max-w-[140px]" title={user.email}>{user.email}</p>
                      )}
                    </div>
                  </div>
                  <button 
                    onClick={() => toggleUserStatus(user.id, user.active)}
                    className={`p-2 rounded-lg transition-colors relative z-20 ${user.active ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                  >
                    {user.active ? <X className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => startEditUser(user)}
                    className="p-2 rounded-lg transition-colors relative z-20 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                  {user.id !== 'u1' && (
                    <button
                      onClick={() => setDeletingUser(user)}
                      className="p-2 rounded-lg transition-colors relative z-20 text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 pb-2">
                    <span>Permisos Activos</span>
                    <span>{user.permissions.length} Permisos</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {user.permissions.map(p => (
                      <span key={p} className="px-2 py-1 bg-slate-100 rounded-md text-[7px] font-black text-slate-500 uppercase tracking-tighter">{permissionLabelMap.get(p) ?? p}</span>
                    ))}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-50 flex justify-between items-center">
                   <div className="flex items-center gap-2">
                      <Key className="w-3 h-3 text-slate-300" />
                      <span className={`text-[9px] font-black uppercase tracking-wider ${
                        !user.pin ? 'text-red-500' :
                        user.pin.length >= 8 ? 'text-emerald-600' : 'text-amber-500'
                      }`}>
                        {!user.pin ? 'Sin clave' : user.pin.length >= 8 ? '🔐 Clave segura' : `⚠️ Clave corta (${user.pin.length} chars)`}
                      </span>
                   </div>
                   <span className="text-[8px] font-mono text-slate-300">{user.id}</span>
                </div>
              </div>
            ))}
          </div>

          {/* User Registration Form Modal Simulation */}
          {isAdding && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
               <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm min-h-full" onClick={() => setIsAdding(false)}></div>
               <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-[2.5rem] shadow-2xl relative z-10 overflow-y-auto max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] my-auto animate-in zoom-in-95 duration-300 border border-white/20">
                  <div className="bg-emerald-950 p-5 sm:p-8 text-white sticky top-0 z-20">
                     <div className="flex items-center gap-3 mb-2">
                        <Lock className="w-5 h-5 text-emerald-400" />
                        <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter">Nuevo Operador</h3>
                     </div>
                     <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Defina nivel de acceso y credenciales</p>
                  </div>

                  <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                        <input 
                           type="text" value={newName} onChange={e => setNewName(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 transition-all"
                           placeholder="EJ: PEDRO PÉREZ"
                        />
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico (Login)</label>
                        <input 
                           type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 transition-all"
                           placeholder="usuario@email.com"
                        />
                        <p className="text-[8px] text-slate-400 ml-1">Este correo se usará para el login en Firebase</p>
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rol en el Sistema</label>
                        <select 
                           value={newRole} onChange={e => setNewRole(e.target.value as UserRole)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 transition-all appearance-none cursor-pointer"
                        >
                           <option value="ADMIN">Administrador Full</option>
                           <option value="SUPERVISOR">Supervisor</option>
                           <option value="FINANZAS">Finanzas</option>
                           <option value="ALMACENISTA">Almacenista</option>
                           <option value="CAJERO">Operador de Ventas</option>
                        </select>
                     </div>

                     <div className="space-y-3 text-left">
                        <div className="flex items-center justify-between">
                           <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Permisos por Módulo</label>
                           <button
                              type="button"
                              onClick={() => setNewPermissions(dataService.getPermissionsForRole(newRole))}
                              className="text-[8px] font-black uppercase tracking-widest text-emerald-600 hover:underline"
                           >
                              Por Defecto
                           </button>
                        </div>
                        <div className="max-h-44 sm:max-h-48 overflow-y-auto rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-3 sm:space-y-4">
                           {Array.from(permissionsByModule.entries()).map(([module, items]) => (
                              <div key={module} className="space-y-2">
                                 <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{module}</div>
                                 <div className="grid grid-cols-1 gap-2">
                                    {items.map((permission) => {
                                      const checked = newPermissions.includes(permission.key);
                                      return (
                                        <label key={permission.key} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-slate-200 cursor-pointer hover:border-emerald-300 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => togglePermission(permission.key)}
                                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                                          />
                                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">{permission.label}</span>
                                        </label>
                                      );
                                    })}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña (8+ caracteres alfanuméricos) — Firebase Auth</label>
                        <div className="relative">
                           <input 
                              type={showPin ? "text" : "password"}
                              value={newPin} onChange={e => setNewPin(e.target.value)}
                              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-emerald-500 transition-all pr-12"
                              placeholder="Mín. 8 caracteres alfanuméricos"
                           />
                           <button 
                              onClick={() => setShowPin(!showPin)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-emerald-500 transition-colors"
                           >
                              {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                           </button>
                        </div>
                        <PinStrength pin={newPin} />
                        <p className="text-[8px] text-amber-600 ml-1 font-bold">⚠️ Este email + contraseña se usarán para iniciar sesión. Usa letras, números y símbolos.</p>
                     </div>

                     <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-2 sm:pt-4 pb-2 sm:pb-4">
                        <button onClick={() => setIsAdding(false)} className="bg-slate-100 text-slate-500 py-3 sm:py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95">Descartar</button>
                        <button onClick={handleAddUser} className="bg-emerald-900 text-white py-3 sm:py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20 active:scale-95 transition-all">Activar Cuenta</button>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Register Existing Firebase User Modal */}
          {isRegisteringExisting && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
               <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm min-h-full" onClick={() => setIsRegisteringExisting(false)}></div>
               <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-[2.5rem] shadow-2xl relative z-10 overflow-y-auto max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] my-auto animate-in zoom-in-95 duration-300 border border-white/20">
                  <div className="bg-amber-700 p-5 sm:p-8 text-white sticky top-0 z-20">
                     <div className="flex items-center gap-3 mb-2">
                        <UserCheck className="w-5 h-5 text-amber-200" />
                        <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter">Vincular Usuario Firebase</h3>
                     </div>
                     <p className="text-[9px] font-bold text-amber-200 uppercase tracking-widest">Registra en el sistema un usuario ya creado en Firebase Auth</p>
                  </div>
                  <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
                     <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[9px] text-amber-800 font-bold">
                        ⚠️ Usa esto para usuarios creados directamente en Firebase Console. El UID lo encuentras en Firebase Auth → columna "UID del usuario".
                     </div>
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                        <input type="text" value={regName} onChange={e => setRegName(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-amber-500 transition-all"
                           placeholder="EJ: CARLIANNY CORDERO" />
                     </div>
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico (Firebase)</label>
                        <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-amber-500 transition-all"
                           placeholder="usuario@email.com" />
                     </div>
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">UID de Firebase</label>
                        <input type="text" value={regUid} onChange={e => setRegUid(e.target.value.trim())}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-mono text-slate-900 outline-none focus:border-amber-500 transition-all"
                           placeholder="1rwaITyuQtaYqX998dcwzeJh..." />
                        <p className="text-[8px] text-slate-400 ml-1">Cópialo desde Firebase Console → Authentication → usuarios</p>
                     </div>
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rol en el Sistema</label>
                        <select value={regRole} onChange={e => setRegRole(e.target.value as UserRole)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-amber-500 transition-all appearance-none cursor-pointer">
                           <option value="ADMIN">Administrador Full</option>
                           <option value="SUPERVISOR">Supervisor</option>
                           <option value="FINANZAS">Finanzas</option>
                           <option value="ALMACENISTA">Almacenista</option>
                           <option value="CAJERO">Operador de Ventas</option>
                        </select>
                     </div>
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Contraseña (8+ caracteres alfanuméricos)</label>
                        <div className="relative">
                           <input type={showRegPin ? "text" : "password"}
                              value={regPin} onChange={e => setRegPin(e.target.value)}
                              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-amber-500 transition-all pr-12"
                              placeholder="Mín. 8 caracteres alfanuméricos" />
                           <button onClick={() => setShowRegPin(!showRegPin)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-amber-500 transition-colors">
                              {showRegPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                           </button>
                        </div>
                        <PinStrength pin={regPin} />
                        <p className="text-[8px] text-amber-600 font-bold ml-1">Debe coincidir con la contraseña de Firebase Auth del usuario</p>
                     </div>
                     <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-2 pb-2">
                        <button onClick={() => setIsRegisteringExisting(false)} className="bg-slate-100 text-slate-500 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95">Cancelar</button>
                        <button onClick={handleRegisterExisting} className="bg-amber-700 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all">Vincular Usuario</button>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Edit User Modal */}
          {editingUser && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
               <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm min-h-full" onClick={() => setEditingUser(null)}></div>
               <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-[2.5rem] shadow-2xl relative z-10 overflow-y-auto max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] my-auto animate-in zoom-in-95 duration-300 border border-white/20">
                  <div className="bg-blue-950 p-5 sm:p-8 text-white sticky top-0 z-20">
                     <div className="flex items-center gap-3 mb-2">
                        <Settings className="w-5 h-5 text-blue-400" />
                        <h3 className="text-lg sm:text-xl font-black uppercase tracking-tighter">Editar Operador</h3>
                     </div>
                     <p className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Modifique acceso y credenciales</p>
                  </div>
                  
                  <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Completo</label>
                        <input 
                           type="text" value={editName} onChange={e => setEditName(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500 transition-all"
                           placeholder="EJ: PEDRO PÉREZ"
                        />
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Correo Electrónico (Login)</label>
                        <input 
                           type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500 transition-all"
                           placeholder="usuario@email.com"
                        />
                        <p className="text-[8px] text-slate-400 ml-1">Este correo se usa para autenticación en Firebase</p>
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Rol en el Sistema</label>
                        <select 
                           value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}
                           className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500 transition-all appearance-none cursor-pointer"
                        >
                           <option value="ADMIN">Administrador Full</option>
                           <option value="SUPERVISOR">Supervisor</option>
                           <option value="FINANZAS">Finanzas</option>
                           <option value="ALMACENISTA">Almacenista</option>
                           <option value="CAJERO">Operador de Ventas</option>
                        </select>
                     </div>

                     <div className="space-y-3 text-left">
                        <div className="flex items-center justify-between">
                           <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Permisos por Módulo</label>
                           <button
                              type="button"
                              onClick={() => setEditPermissions(dataService.getPermissionsForRole(editRole))}
                              className="text-[8px] font-black uppercase tracking-widest text-blue-600 hover:underline"
                           >
                              Por Defecto
                           </button>
                        </div>
                        <div className="max-h-44 sm:max-h-48 overflow-y-auto rounded-xl sm:rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4 space-y-3 sm:space-y-4">
                           {Array.from(permissionsByModule.entries()).map(([module, items]) => (
                              <div key={module} className="space-y-2">
                                 <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{module}</div>
                                 <div className="grid grid-cols-1 gap-2">
                                    {items.map((permission) => {
                                      const checked = editPermissions.includes(permission.key);
                                      return (
                                        <label key={permission.key} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2 border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleEditPermission(permission.key)}
                                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                                          />
                                          <span className="text-[10px] font-black text-slate-700 uppercase tracking-wide">{permission.label}</span>
                                        </label>
                                      );
                                    })}
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     <div className="space-y-2 text-left">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          {editingUser?.pin ? '🔐 Cambiar Contraseña (dejar vacío para mantener actual)' : '🔓 Nueva Contraseña (8+ caracteres) — opcional'}
                        </label>
                        <div className="relative">
                           <input 
                              type={showEditPin ? "text" : "password"}
                              value={editPin} onChange={e => setEditPin(e.target.value)}
                              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-sm font-black text-slate-900 outline-none focus:border-blue-500 transition-all pr-12"
                              placeholder="Mín. 8 caracteres alfanuméricos"
                           />
                           <button 
                              onClick={() => setShowEditPin(!showEditPin)}
                              className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-blue-500 transition-colors"
                           >
                              {showEditPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                           </button>
                        </div>
                        {editPin && <PinStrength pin={editPin} />}
                        <p className="text-[8px] text-slate-500">Deje vacío para mantener la contraseña actual</p>
                     </div>

                     <div className="grid grid-cols-2 gap-3 sm:gap-4 pt-2 sm:pt-4 pb-2 sm:pb-4">
                        <button onClick={() => setEditingUser(null)} className="bg-slate-100 text-slate-500 py-3 sm:py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95">Cancelar</button>
                        <button onClick={handleEditUser} className="bg-blue-900 text-white py-3 sm:py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 active:scale-95 transition-all">Guardar Cambios</button>
                     </div>
                  </div>
               </div>
            </div>
          )}

          {/* Delete User Confirmation Modal */}
          {deletingUser && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 sm:p-0">
               <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setDeletingUser(null)}></div>
               <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
                  <div className="bg-red-950 p-8 text-white">
                     <div className="flex items-center gap-3 mb-2">
                        <Trash2 className="w-5 h-5 text-red-400" />
                        <h3 className="text-xl font-black uppercase tracking-tighter">Eliminar Operador</h3>
                     </div>
                     <p className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Esta acción no se puede deshacer</p>
                  </div>
                  
                  <div className="p-8 space-y-6">
                     <div className="bg-red-50 border-2 border-red-100 rounded-2xl p-6">
                        <p className="text-sm font-black text-red-900 text-center uppercase tracking-wide">
                           ¿Está seguro de eliminar permanentemente a:
                        </p>
                        <p className="text-lg font-black text-red-700 text-center mt-2">
                           {deletingUser.name}
                        </p>
                        <p className="text-[10px] font-bold text-red-500 text-center mt-1 uppercase">
                           {deletingUser.role} • {deletingUser.id}
                        </p>
                     </div>
                     <div className="grid grid-cols-2 gap-4 pt-4">
                        <button onClick={() => setDeletingUser(null)} className="bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Cancelar</button>
                        <button onClick={handleDeleteUser} className="bg-red-900 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-900/20 active:scale-95 transition-all hover:bg-red-800">Eliminar</button>
                     </div>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Security Audit Sidebar */}
        <div className="lg:col-span-4 space-y-8">
           {/* Cuentas Bloqueadas */}
           <div className="bg-red-950 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden ring-1 ring-red-500/20">
              <div className="absolute top-0 right-0 p-10 opacity-5">
                <ShieldAlert className="w-32 h-32 text-red-400" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                   <ShieldAlert className="w-5 h-5 text-red-500" />
                   <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Cuentas Bloqueadas</h4>
                   {lockouts.length > 0 && (
                     <span className="ml-auto bg-red-500 text-white text-[8px] font-black px-2 py-1 rounded-full">{lockouts.length}</span>
                   )}
                </div>
                
                <div className="space-y-4 max-h-64 overflow-y-auto">
                  {loadingLockouts ? (
                    <p className="text-[9px] text-red-400/60 italic font-black uppercase tracking-widest py-4 text-center">Cargando...</p>
                  ) : lockouts.length === 0 ? (
                    <p className="text-[9px] text-red-400/40 italic font-black uppercase tracking-widest py-10 text-center">No hay cuentas bloqueadas</p>
                  ) : lockouts.map((lockout) => (
                    <div key={lockout.id} className="bg-white/5 border border-red-500/20 p-4 rounded-2xl space-y-2 hover:bg-white/10 transition-colors">
                       <div className="flex justify-between items-start">
                          <div>
                            <div className="text-[9px] font-black text-red-400 uppercase tracking-wider">{lockout.email}</div>
                            <div className="text-[8px] text-red-300/70 mt-1">
                              {lockout.attempts} intentos fallidos
                            </div>
                            <div className="text-[8px] text-red-300/70">
                              Bloqueado hasta: {new Date(lockout.lockedUntil).toLocaleTimeString()}
                            </div>
                          </div>
                          <button
                            onClick={() => handleUnlockAccount(lockout.email)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase tracking-wider transition-colors"
                          >
                            Desbloquear
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden ring-1 ring-white/10">
              <div className="absolute top-0 right-0 p-10 opacity-5">
                <Shield className="w-32 h-32 text-emerald-400" />
              </div>
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                   <Activity className="w-5 h-5 text-emerald-500" />
                   <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Logs de Seguridad</h4>
                </div>
                
                <div className="space-y-4">
                  {auditLog.length === 0 ? (
                    <p className="text-[9px] text-emerald-500/40 italic font-black uppercase tracking-widest py-10 text-center">Sin incidentes de seguridad...</p>
                  ) : auditLog.map((log, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-4 rounded-2xl space-y-2 hover:bg-white/10 transition-colors cursor-default">
                       <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-emerald-500">
                          <span>{log.action}</span>
                          <span className="text-slate-500">{log.timestamp.toLocaleTimeString()}</span>
                       </div>
                       <p className="text-[10px] text-emerald-100 font-bold leading-tight">{log.details}</p>
                    </div>
                  ))}
                </div>
              </div>
           </div>
        </div>
      </div>
    ) : (
        /* ENTITIES MANAGEMENT MODULE */
        <div className="space-y-6">
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200/60 shadow-sm space-y-8">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-center bg-slate-100 p-1 rounded-2xl self-start">
                   <button 
                     onClick={() => setActiveSubTab('CLIENTS')}
                     className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'CLIENTS' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500'}`}
                   >
                     <Building2 className="w-3.5 h-3.5" /> Cartera de Clientes
                   </button>
                   <button 
                     onClick={() => setActiveSubTab('SUPPLIERS')}
                     className={`flex items-center gap-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'SUPPLIERS' ? 'bg-white text-emerald-900 shadow-sm' : 'text-slate-500'}`}
                   >
                     <Truck className="w-3.5 h-3.5" /> Maestro Proveedores
                   </button>
                </div>

                <div className="relative flex-1 max-w-md">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                     type="text" 
                     value={entitySearch}
                     onChange={(e) => setEntitySearch(e.target.value)}
                     placeholder={`Buscar ${activeSubTab === 'CLIENTS' ? 'cliente' : 'proveedor'} por nombre o RIF...`}
                     className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-[11px] font-black uppercase outline-none focus:border-emerald-500 transition-all"
                   />
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(activeSubTab === 'CLIENTS' ? clients : suppliers)
                  .filter(e => {
                    const search = entitySearch.toLowerCase();
                    return (e?.name || '').toLowerCase().includes(search) || (e?.id || '').toLowerCase().includes(search);
                  })
                  .map(entity => (
                    <div key={entity.id} className="p-6 bg-slate-50/50 border border-slate-100 rounded-[2rem] hover:bg-white hover:shadow-xl transition-all group overflow-hidden relative">
                       <div className="flex justify-between items-start mb-4">
                          <div className={`p-3 rounded-2xl ${activeSubTab === 'CLIENTS' ? 'bg-emerald-100/50 text-emerald-700' : 'bg-blue-100/50 text-blue-700'}`}>
                             {activeSubTab === 'CLIENTS' ? <Building2 className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                          </div>
                          <div className="flex items-center gap-2">
                             <button 
                               onClick={() => activeSubTab === 'CLIENTS' ? setEditingClient(entity as BillingClient) : setEditingSupplier(entity as Supplier)}
                               className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 opacity-0 group-hover:opacity-100 hover:text-emerald-600 transition-all shadow-sm"
                             >
                                <Edit2 className="w-3.5 h-3.5" />
                             </button>
                             <button 
                               onClick={() => openConfirm(
                                 `Eliminar ${activeSubTab === 'CLIENTS' ? 'cliente' : 'proveedor'}`,
                                 `¿Está seguro de eliminar este ${activeSubTab === 'CLIENTS' ? 'cliente' : 'proveedor'}? Esta acción no se puede deshacer.`,
                                 async () => {
                                   closeConfirm();
                                   if (activeSubTab === 'CLIENTS') await clientService.deleteClient(entity.id);
                                   else await supplierService.deleteSupplier(entity.id);
                                 },
                                 true
                               )}
                               className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-all shadow-sm"
                             >
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          </div>
                       </div>
                       <h4 className="font-black text-slate-900 uppercase tracking-tighter text-sm line-clamp-1">{entity.name}</h4>
                       <div className="flex items-center gap-1.5 mt-1">
                          <IdCard className="w-3 h-3 text-slate-400" />
                          <span className="text-[10px] font-mono font-bold text-slate-400">{entity.id}</span>
                       </div>
                       
                       <div className="mt-6 pt-4 border-t border-slate-200/60 space-y-3">
                          {entity.referredBy && (
                             <div className="flex items-center gap-2 text-blue-600 mb-1">
                                <Users className="w-3 h-3" />
                                <span className="text-[8px] font-black uppercase tracking-wider">Referido: {entity.referredBy}</span>
                             </div>
                          )}
                          <div className="flex items-center gap-2 text-slate-500">
                             <Phone className="w-3 h-3" />
                             <span className="text-[9px] font-black uppercase">{entity.phone || 'Sin teléfono'}</span>
                          </div>
                          <div className="flex items-start gap-2 text-slate-500">
                             <MapPin className="w-3 h-3 mt-1 shrink-0" />
                             <span className="text-[9px] font-black uppercase leading-tight line-clamp-2">{entity.address || 'Sin dirección registrada'}</span>
                          </div>
                       </div>
                    </div>
                  ))}
             </div>
          </div>
        </div>
      )}

      {/* Entity Edit Modals */}
      {(editingClient || editingSupplier) && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => { setEditingClient(null); setEditingSupplier(null); }}></div>
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 border border-white/20">
              <div className="bg-slate-900 p-8 text-white">
                 <div className="flex items-center gap-3 mb-2">
                    <Edit2 className="w-5 h-5 text-emerald-400" />
                    <h3 className="text-xl font-black uppercase tracking-tighter">Actualizar Información</h3>
                 </div>
                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    {editingClient ? 'Expediente de Cliente' : 'Expediente de Proveedor'} — {editingClient?.id || editingSupplier?.id}
                 </p>
              </div>

              <div className="p-8 space-y-6">
                 <div className="space-y-4">
                    <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Razón Social / Nombre</label>
                       <input 
                         type="text" 
                         value={editingClient?.name || editingSupplier?.name || ''} 
                         onChange={(e) => {
                           const val = e.target.value.toUpperCase();
                           if (editingClient) setEditingClient({...editingClient, name: val});
                           else if (editingSupplier) setEditingSupplier({...editingSupplier, name: val});
                         }}
                         className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-emerald-500 transition-all font-sans"
                       />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Teléfono</label>
                          <input 
                            type="text" 
                            value={editingClient?.phone || editingSupplier?.phone || ''} 
                            onChange={(e) => {
                              const val = e.target.value;
                              if (editingClient) setEditingClient({...editingClient, phone: val});
                              else if (editingSupplier) setEditingSupplier({...editingSupplier, phone: val});
                            }}
                            className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-emerald-500 transition-all font-mono"
                          />
                       </div>
                       {editingClient && (
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Cliente</label>
                            <select 
                              value={editingClient.type} 
                              onChange={(e) => setEditingClient({...editingClient, type: e.target.value as any})}
                              className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-emerald-500 transition-all"
                            >
                               <option value="Natural">Persona Natural</option>
                               <option value="Jurídica">Persona Jurídica</option>
                            </select>
                         </div>
                       )}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Referido Por (Opcional)</label>
                        <div className="relative">
                           <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                           <input 
                             type="text" 
                             placeholder="Nombre del referente..."
                             value={editingClient?.referredBy || editingSupplier?.referredBy || ''} 
                             onChange={(e) => {
                               const val = e.target.value.toUpperCase();
                               if (editingClient) setEditingClient({...editingClient, referredBy: val});
                               else if (editingSupplier) setEditingSupplier({...editingSupplier, referredBy: val});
                             }}
                             className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl pl-11 pr-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-blue-500 transition-all font-sans"
                           />
                        </div>
                     </div>

                     <div className="space-y-1.5">
                       <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Dirección Fiscal / Despacho</label>
                       <textarea 
                         rows={3}
                         value={editingClient?.address || editingSupplier?.address || ''} 
                         onChange={(e) => {
                           const val = e.target.value.toUpperCase();
                           if (editingClient) setEditingClient({...editingClient, address: val});
                           else if (editingSupplier) setEditingSupplier({...editingSupplier, address: val});
                         }}
                         className="w-full bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-3 text-[11px] font-black text-slate-900 outline-none focus:border-emerald-500 transition-all resize-none leading-relaxed font-sans"
                       />
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 pt-4">
                    <button 
                      onClick={() => { setEditingClient(null); setEditingSupplier(null); }} 
                      className="bg-slate-100 text-slate-500 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all font-sans"
                    >
                      Cancelar
                    </button>
                    <button 
                      onClick={async () => {
                        if (editingClient) {
                          await clientService.updateClient(editingClient.id, editingClient); 
                          setEditingClient(null);
                        } else if (editingSupplier) {
                          await supplierService.saveSupplier(editingSupplier);
                          setEditingSupplier(null);
                        }
                      }}
                      className="bg-emerald-900 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-900/20 hover:bg-emerald-800 transition-all font-sans"
                    >
                      Sincronizar Cambios
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* PIN Sync Diagnosis Modal */}
      {showPinDiagnosis && pinDiagnosis && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl rounded-[2rem] shadow-2xl animate-in zoom-in duration-300 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="bg-blue-600 p-6 text-white sticky top-0 z-10">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5" />
                  <h3 className="font-headline font-black text-lg tracking-tight uppercase">Diagnóstico de Sincronización de PINs</h3>
                </div>
                <button onClick={() => setShowPinDiagnosis(false)} className="p-2 hover:bg-white/20 rounded-full"><X className="w-5 h-5" /></button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-slate-50 p-4 rounded-xl text-center">
                  <div className="text-2xl font-black text-slate-900">{pinDiagnosis.totalUsers}</div>
                  <div className="text-[9px] font-black text-slate-400 uppercase">Total Usuarios</div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl text-center">
                  <div className="text-2xl font-black text-emerald-700">{pinDiagnosis.details.filter(d => d.status === 'synced').length}</div>
                  <div className="text-[9px] font-black text-emerald-600 uppercase">Sincronizados</div>
                </div>
                <div className="bg-amber-50 p-4 rounded-xl text-center">
                  <div className="text-2xl font-black text-amber-700">{pinDiagnosis.usersWithPendingPins}</div>
                  <div className="text-[9px] font-black text-amber-600 uppercase">Pendientes</div>
                </div>
                <div className="bg-red-50 p-4 rounded-xl text-center">
                  <div className="text-2xl font-black text-red-700">{pinDiagnosis.usersWithoutFirebaseUid}</div>
                  <div className="text-[9px] font-black text-red-600 uppercase">Sin Firebase</div>
                </div>
              </div>

              {/* Pending Users List */}
              {pinDiagnosis.usersWithPendingPins > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Usuarios con PIN pendiente de sincronización</h4>
                    <button 
                      onClick={() => handleForcePinSync()}
                      className="px-4 py-2 bg-amber-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all"
                    >
                      Forzar Sincronización
                    </button>
                  </div>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {pinDiagnosis.details.filter(d => d.status === 'pending').map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <div>
                          <div className="text-[11px] font-black text-slate-900">{user.name}</div>
                          <div className="text-[9px] text-slate-500">{user.email}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[9px] font-bold text-amber-700">PIN en espera:</div>
                          <div className="text-[11px] font-black font-mono text-amber-900">{user.pendingPin}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[9px] text-amber-700 bg-amber-50 p-3 rounded-xl">
                    ⚠️ Estos usuarios deben cerrar sesión e iniciar nuevamente para que el PIN se sincronice con Firebase Auth.
                  </p>
                </div>
              )}

              {/* Users without PIN */}
              {pinDiagnosis.details.filter(d => d.status === 'no_pin').length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Usuarios sin PIN configurado</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {pinDiagnosis.details.filter(d => d.status === 'no_pin').map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl">
                        <div>
                          <div className="text-[11px] font-black text-slate-900">{user.name}</div>
                          <div className="text-[9px] text-slate-500">{user.email}</div>
                        </div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Sin PIN</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Synced Users */}
              {pinDiagnosis.details.filter(d => d.status === 'synced').length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Usuarios sincronizados correctamente</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {pinDiagnosis.details.filter(d => d.status === 'synced').slice(0, 5).map(user => (
                      <div key={user.id} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                        <div>
                          <div className="text-[11px] font-black text-slate-900">{user.name}</div>
                          <div className="text-[9px] text-slate-500">{user.email}</div>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-600 uppercase">✓ Sincronizado</span>
                      </div>
                    ))}
                    {pinDiagnosis.details.filter(d => d.status === 'synced').length > 5 && (
                      <div className="text-center text-[9px] text-slate-400">
                        ... y {pinDiagnosis.details.filter(d => d.status === 'synced').length - 5} más
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button 
                onClick={() => setShowPinDiagnosis(false)}
                className="w-full py-4 bg-slate-100 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={confirmModal.open}
        title={confirmModal.title}
        message={confirmModal.message}
        danger={confirmModal.danger}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
