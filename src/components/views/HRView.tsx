import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  UserPlus,
  DollarSign,
  CreditCard,
  Briefcase,
  ChevronDown,
  X,
  Check,
  AlertTriangle,
  Calendar,
  ClipboardList,
  Building2
} from 'lucide-react';
import {
  dataService
} from '../../services/dataService';

type PayFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
type EmployeeStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

type Employee = {
  id: string;
  createdAt: string;
  name: string;
  cedula: string;
  position: string;
  department: string;
  salaryUSD: number;
  payFrequency: PayFrequency;
  startDate: string;
  status: EmployeeStatus;
  phone: string;
  address: string;
  bankAccount: string;
  bankName: string;
};

type HRAdvance = {
  id: string;
  employeeId: string;
  employeeName: string;
  amountUSD: number;
  reason: string;
  date: string;
  status: 'PENDING' | 'DISCOUNTED';
};

type PayrollRunLine = {
  employeeName: string;
  position: string;
  grossUSD: number;
  advancesDeducted: number;
  netUSD: number;
};

type PayrollRun = {
  id: string;
  correlativo: string;
  frequency: PayFrequency;
  period: string;
  totalUSD: number;
  lines: PayrollRunLine[];
};

const hrApi = dataService as any;

type HRTab = 'employees' | 'advances' | 'payroll';

const FREQ_LABELS: Record<PayFrequency, string> = {
  WEEKLY: 'Semanal',
  BIWEEKLY: 'Quincenal',
  MONTHLY: 'Mensual'
};

const STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  SUSPENDED: 'Suspendido'
};

const STATUS_COLORS: Record<EmployeeStatus, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800',
  INACTIVE: 'bg-slate-100 text-slate-500',
  SUSPENDED: 'bg-red-100 text-red-700'
};

const emptyEmployee: Omit<Employee, 'id' | 'createdAt'> = {
  name: '', cedula: '', position: '', department: '',
  salaryUSD: 0, payFrequency: 'MONTHLY', startDate: '',
  status: 'ACTIVE', phone: '', address: '', bankAccount: '', bankName: ''
};

export function HRView() {
  const [activeTab, setActiveTab] = useState<HRTab>('employees');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<HRAdvance[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  const [showAddEmp, setShowAddEmp] = useState(false);
  const [empForm, setEmpForm] = useState({ ...emptyEmployee });
  const [empSaving, setEmpSaving] = useState(false);
  const [empError, setEmpError] = useState('');

  const [showAddAdv, setShowAddAdv] = useState(false);
  const [advEmpId, setAdvEmpId] = useState('');
  const [advAmount, setAdvAmount] = useState('');
  const [advReason, setAdvReason] = useState('');
  const [advSaving, setAdvSaving] = useState(false);
  const [advError, setAdvError] = useState('');

  const [showPayroll, setShowPayroll] = useState(false);
  const [payFreq, setPayFreq] = useState<PayFrequency>('MONTHLY');
  const [payPeriod, setPayPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [payProcessing, setPayProcessing] = useState(false);
  const [payError, setPayError] = useState('');

  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<Partial<Omit<Employee, 'id' | 'createdAt'>>>({});
  const [editSaving, setEditSaving] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      const [emps, advs, runs] = await Promise.all([
        Promise.resolve(typeof hrApi.getEmployees === 'function' ? hrApi.getEmployees() : []),
        Promise.resolve(typeof hrApi.getHRAdvances === 'function' ? hrApi.getHRAdvances() : []),
        Promise.resolve(typeof hrApi.getPayrollRuns === 'function' ? hrApi.getPayrollRuns() : [])
      ]);
      setEmployees(emps);
      setAdvances(advs);
      setPayrollRuns(runs);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const activeEmployees = useMemo(() => employees.filter(e => e.status === 'ACTIVE'), [employees]);
  const totalPayrollUSD = useMemo(() => activeEmployees.reduce((s, e) => s + e.salaryUSD, 0), [activeEmployees]);
  const pendingAdvances = useMemo(() => advances.filter(a => a.status === 'PENDING'), [advances]);
  const totalPendingAdv = useMemo(() => pendingAdvances.reduce((s, a) => s + a.amountUSD, 0), [pendingAdvances]);

  const handleAddEmployee = async () => {
    if (!empForm.name || !empForm.cedula || !empForm.position || !empForm.salaryUSD) {
      setEmpError('Completa nombre, cédula, cargo y salario.');
      return;
    }
    setEmpSaving(true); setEmpError('');
    try {
      if (typeof hrApi.addEmployee !== 'function') throw new Error('Modulo RRHH no habilitado en DataService.');
      await hrApi.addEmployee(empForm);
      setShowAddEmp(false);
      setEmpForm({ ...emptyEmployee });
      await reload();
    } catch (e: any) {
      setEmpError(e?.message ?? 'Error al guardar.');
    } finally {
      setEmpSaving(false);
    }
  };

  const handleAddAdvance = async () => {
    const amt = parseFloat(advAmount);
    if (!advEmpId || isNaN(amt) || amt <= 0 || !advReason.trim()) {
      setAdvError('Completa todos los campos.');
      return;
    }
    const emp = employees.find(e => e.id === advEmpId);
    if (!emp) { setAdvError('Empleado no encontrado.'); return; }
    setAdvSaving(true); setAdvError('');
    try {
      if (typeof hrApi.addHRAdvance !== 'function') throw new Error('Modulo RRHH no habilitado en DataService.');
      await hrApi.addHRAdvance({
        employeeId: emp.id,
        employeeName: emp.name,
        amountUSD: amt,
        reason: advReason.trim(),
        date: new Date().toISOString()
      });
      setShowAddAdv(false);
      setAdvEmpId(''); setAdvAmount(''); setAdvReason('');
      await reload();
    } catch (e: any) {
      setAdvError(e?.message ?? 'Error al guardar.');
    } finally {
      setAdvSaving(false);
    }
  };

  const handleProcessPayroll = async () => {
    if (!payPeriod) { setPayError('Ingresa el período.'); return; }
    const eligible = employees.filter(e => e.status === 'ACTIVE' && e.payFrequency === payFreq);
    if (eligible.length === 0) { setPayError(`No hay empleados activos con frecuencia ${FREQ_LABELS[payFreq]}.`); return; }
    setPayProcessing(true); setPayError('');
    try {
      if (typeof hrApi.processPayroll !== 'function') throw new Error('Modulo RRHH no habilitado en DataService.');
      await hrApi.processPayroll(payFreq, payPeriod, employees, advances);
      setShowPayroll(false);
      await reload();
    } catch (e: any) {
      setPayError(e?.message ?? 'Error al procesar.');
    } finally {
      setPayProcessing(false);
    }
  };

  const handleEditEmployee = async () => {
    if (!editingEmp) return;
    setEditSaving(true);
    try {
      if (typeof hrApi.updateEmployee !== 'function') throw new Error('Modulo RRHH no habilitado en DataService.');
      await hrApi.updateEmployee(editingEmp.id, editForm);
      setEditingEmp(null);
      await reload();
    } catch { /* ignore */ } finally {
      setEditSaving(false);
    }
  };

  const tabs: { key: HRTab; label: string; icon: React.ElementType }[] = [
    { key: 'employees', label: 'Empleados', icon: Users },
    { key: 'advances', label: 'Anticipos', icon: CreditCard },
    { key: 'payroll', label: 'Nómina', icon: ClipboardList }
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-900 rounded-[1.25rem] shadow-xl">
              <Users className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <h2 className="font-headline text-3xl font-black tracking-tight text-slate-900 uppercase leading-none">Recursos Humanos</h2>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Empleados · Anticipos · Nómina Básica</p>
            </div>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Empleados Activos</p>
          <p className="text-3xl font-black text-slate-900">{activeEmployees.length}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">de {employees.length} registrados</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Masa Salarial / Período</p>
          <p className="text-3xl font-black text-indigo-700">$ {totalPayrollUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">Activos solamente</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Anticipos Pendientes</p>
          <p className="text-3xl font-black text-amber-600">$ {totalPendingAdv.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
          <p className="text-[9px] font-bold text-slate-400 mt-1 uppercase">{pendingAdvances.length} anticipos sin descontar</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all ${isActive ? 'bg-indigo-900 text-white shadow-lg' : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200'}`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          );
        })}
      </div>

      {/* ── EMPLEADOS ─────────────────────────────────────────────────────── */}
      {activeTab === 'employees' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowAddEmp(true); setEmpForm({ ...emptyEmployee }); setEmpError(''); }}
              className="flex items-center gap-2 px-5 py-3 bg-indigo-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-800 transition-all">
              <UserPlus className="w-4 h-4" /> Agregar Empleado
            </button>
          </div>
          {loading ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Cargando...</div>
          ) : employees.length === 0 ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Sin empleados registrados</div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Empleado</th>
                    <th className="px-6 py-3 text-left">Cargo / Depto</th>
                    <th className="px-6 py-3 text-right">Salario USD</th>
                    <th className="px-6 py-3 text-center">Frecuencia</th>
                    <th className="px-6 py-3 text-center">Estado</th>
                    <th className="px-6 py-3 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-900 uppercase">{emp.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono">{emp.cedula} {emp.phone ? `· ${emp.phone}` : ''}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[11px] font-bold text-slate-700">{emp.position}</div>
                        <div className="text-[9px] text-slate-400 uppercase">{emp.department}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-black font-mono text-indigo-700">$ {emp.salaryUSD.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-[9px] font-black bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full uppercase">{FREQ_LABELS[emp.payFrequency]}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${STATUS_COLORS[emp.status]}`}>{STATUS_LABELS[emp.status]}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button onClick={() => { setEditingEmp(emp); setEditForm({ name: emp.name, position: emp.position, department: emp.department, salaryUSD: emp.salaryUSD, payFrequency: emp.payFrequency, status: emp.status, phone: emp.phone, bankAccount: emp.bankAccount, bankName: emp.bankName }); }}
                          className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-[9px] font-black uppercase hover:bg-slate-200 transition-all">
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ANTICIPOS ─────────────────────────────────────────────────────── */}
      {activeTab === 'advances' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowAddAdv(true); setAdvEmpId(''); setAdvAmount(''); setAdvReason(''); setAdvError(''); }}
              className="flex items-center gap-2 px-5 py-3 bg-amber-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-700 transition-all">
              <DollarSign className="w-4 h-4" /> Registrar Anticipo
            </button>
          </div>
          {loading ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Cargando...</div>
          ) : advances.length === 0 ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Sin anticipos registrados</div>
          ) : (
            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Empleado</th>
                    <th className="px-6 py-3 text-left">Motivo</th>
                    <th className="px-6 py-3 text-right">Monto</th>
                    <th className="px-6 py-3 text-center">Fecha</th>
                    <th className="px-6 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {advances.map(adv => (
                    <tr key={adv.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-900 uppercase">{adv.employeeName}</div>
                        <div className="text-[9px] text-slate-400 font-mono">{adv.id}</div>
                      </td>
                      <td className="px-6 py-4 text-[11px] text-slate-600">{adv.reason}</td>
                      <td className="px-6 py-4 text-right font-black font-mono text-amber-700">$ {adv.amountUSD.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center text-[10px] text-slate-500">{new Date(adv.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase ${adv.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'}`}>
                          {adv.status === 'PENDING' ? 'Pendiente' : 'Descontado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── NÓMINA ────────────────────────────────────────────────────────── */}
      {activeTab === 'payroll' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => { setShowPayroll(true); setPayError(''); }}
              className="flex items-center gap-2 px-5 py-3 bg-emerald-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-800 transition-all">
              <ClipboardList className="w-4 h-4" /> Procesar Nómina
            </button>
          </div>
          {loading ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Cargando...</div>
          ) : payrollRuns.length === 0 ? (
            <div className="py-16 text-center text-slate-300 font-black uppercase text-[10px]">Sin nóminas procesadas</div>
          ) : payrollRuns.map(run => (
            <div key={run.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b bg-slate-50 flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-black text-slate-900 uppercase">{run.correlativo}</span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase ml-3">{FREQ_LABELS[run.frequency]} · {run.period}</span>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Total Neto</p>
                  <p className="text-lg font-black text-emerald-700">$ {run.totalUSD.toFixed(2)}</p>
                </div>
              </div>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black text-slate-400 uppercase tracking-wider border-b">
                    <th className="px-6 py-2">Empleado</th>
                    <th className="px-6 py-2 text-right">Bruto</th>
                    <th className="px-6 py-2 text-right">Anticipos</th>
                    <th className="px-6 py-2 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-[11px]">
                  {run.lines.map((l, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <td className="px-6 py-3">
                        <div className="font-black text-slate-900 uppercase">{l.employeeName}</div>
                        <div className="text-[9px] text-slate-400">{l.position}</div>
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-slate-700">$ {l.grossUSD.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right font-mono text-red-500">- $ {l.advancesDeducted.toFixed(2)}</td>
                      <td className="px-6 py-3 text-right font-black font-mono text-emerald-700">$ {l.netUSD.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL: AGREGAR EMPLEADO ───────────────────────────────────────── */}
      {showAddEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col">
            <div className="p-5 border-b bg-indigo-50 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Nuevo Empleado</div>
                <div className="text-[13px] font-black uppercase text-slate-900">Registro de Personal</div>
              </div>
              <button onClick={() => setShowAddEmp(false)} className="p-2 rounded-lg hover:bg-indigo-100 text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-3">
              {[
                { label: 'Nombre Completo', field: 'name', type: 'text', required: true },
                { label: 'Cédula', field: 'cedula', type: 'text', required: true },
                { label: 'Cargo', field: 'position', type: 'text', required: true },
                { label: 'Departamento', field: 'department', type: 'text', required: false },
                { label: 'Teléfono', field: 'phone', type: 'text', required: false },
                { label: 'Banco', field: 'bankName', type: 'text', required: false },
                { label: 'Cuenta Bancaria', field: 'bankAccount', type: 'text', required: false },
              ].map(({ label, field, type }) => (
                <div key={field}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                  <input type={type} value={(empForm as any)[field] ?? ''} onChange={e => setEmpForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Salario (USD)</label>
                  <input type="number" step="0.01" min="0" value={empForm.salaryUSD || ''} onChange={e => setEmpForm(f => ({ ...f, salaryUSD: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Frecuencia de Pago</label>
                  <select value={empForm.payFrequency} onChange={e => setEmpForm(f => ({ ...f, payFrequency: e.target.value as PayFrequency }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                    <option value="MONTHLY">Mensual</option>
                    <option value="BIWEEKLY">Quincenal</option>
                    <option value="WEEKLY">Semanal</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Fecha de Ingreso</label>
                <input type="date" value={empForm.startDate} onChange={e => setEmpForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
              </div>
              {empError && <div className="text-[10px] font-black uppercase text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{empError}</div>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setShowAddEmp(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase">Cancelar</button>
              <button onClick={handleAddEmployee} disabled={empSaving}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${empSaving ? 'bg-slate-200 text-slate-400' : 'bg-indigo-900 text-white hover:bg-indigo-800'}`}>
                {empSaving ? 'Guardando...' : 'Registrar Empleado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: EDITAR EMPLEADO ────────────────────────────────────────── */}
      {editingEmp && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b flex items-center justify-between">
              <div className="text-[13px] font-black uppercase text-slate-900">Editar: {editingEmp.name}</div>
              <button onClick={() => setEditingEmp(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { label: 'Nombre', field: 'name' }, { label: 'Cargo', field: 'position' },
                { label: 'Departamento', field: 'department' }, { label: 'Teléfono', field: 'phone' },
                { label: 'Banco', field: 'bankName' }, { label: 'Cuenta Bancaria', field: 'bankAccount' }
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</label>
                  <input type="text" value={(editForm as any)[field] ?? ''} onChange={e => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Salario USD</label>
                  <input type="number" step="0.01" value={editForm.salaryUSD ?? ''} onChange={e => setEditForm(f => ({ ...f, salaryUSD: parseFloat(e.target.value) || 0 }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Estado</label>
                  <select value={editForm.status ?? 'ACTIVE'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value as EmployeeStatus }))}
                    className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[12px] font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                    <option value="SUSPENDED">Suspendido</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setEditingEmp(null)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase">Cancelar</button>
              <button onClick={handleEditEmployee} disabled={editSaving}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${editSaving ? 'bg-slate-200 text-slate-400' : 'bg-indigo-900 text-white hover:bg-indigo-800'}`}>
                {editSaving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: REGISTRAR ANTICIPO ─────────────────────────────────────── */}
      {showAddAdv && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b bg-amber-50 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-600">Nuevo Anticipo</div>
                <div className="text-[13px] font-black uppercase text-slate-900">Personal</div>
              </div>
              <button onClick={() => setShowAddAdv(false)} className="p-2 rounded-lg hover:bg-amber-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Empleado</label>
                <select value={advEmpId} onChange={e => setAdvEmpId(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:ring-2 focus:ring-amber-500/20">
                  <option value="">-- Seleccionar --</option>
                  {activeEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Monto (USD)</label>
                <input type="number" step="0.01" min="0" value={advAmount} onChange={e => setAdvAmount(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[13px] font-black outline-none focus:ring-2 focus:ring-amber-500/20" placeholder="0.00" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Motivo</label>
                <textarea value={advReason} onChange={e => setAdvReason(e.target.value)} rows={2}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[11px] font-bold outline-none focus:ring-2 focus:ring-amber-500/20 resize-none"
                  placeholder="Ej. Emergencia médica, necesidad personal..." />
              </div>
              {advError && <div className="text-[10px] font-black uppercase text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{advError}</div>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setShowAddAdv(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase">Cancelar</button>
              <button onClick={handleAddAdvance} disabled={advSaving}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${advSaving ? 'bg-slate-200 text-slate-400' : 'bg-amber-600 text-white hover:bg-amber-700'}`}>
                {advSaving ? 'Guardando...' : 'Registrar Anticipo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: PROCESAR NÓMINA ────────────────────────────────────────── */}
      {showPayroll && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b bg-emerald-50 flex items-center justify-between">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Procesar Nómina</div>
                <div className="text-[13px] font-black uppercase text-slate-900">Liquidación de Período</div>
              </div>
              <button onClick={() => setShowPayroll(false)} className="p-2 rounded-lg hover:bg-emerald-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Frecuencia</label>
                <select value={payFreq} onChange={e => setPayFreq(e.target.value as PayFrequency)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20">
                  <option value="MONTHLY">Mensual</option>
                  <option value="BIWEEKLY">Quincenal</option>
                  <option value="WEEKLY">Semanal</option>
                </select>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">Período</label>
                <input type="month" value={payPeriod} onChange={e => setPayPeriod(e.target.value)}
                  className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-[12px] font-bold outline-none focus:ring-2 focus:ring-emerald-500/20" />
              </div>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Empleados a incluir</p>
                <p className="text-2xl font-black text-slate-900">
                  {employees.filter(e => e.status === 'ACTIVE' && e.payFrequency === payFreq).length}
                </p>
                <p className="text-[9px] font-bold text-slate-400 mt-1">activos con frecuencia {FREQ_LABELS[payFreq]}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <p className="text-[9px] font-black text-amber-600 uppercase mb-1">Anticipos pendientes a descontar</p>
                <p className="text-xl font-black text-amber-700">$ {totalPendingAdv.toFixed(2)}</p>
              </div>
              {payError && <div className="text-[10px] font-black uppercase text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{payError}</div>}
            </div>
            <div className="p-5 border-t flex gap-3">
              <button onClick={() => setShowPayroll(false)} className="flex-1 py-3 bg-slate-100 text-slate-700 rounded-xl text-[10px] font-black uppercase">Cancelar</button>
              <button onClick={handleProcessPayroll} disabled={payProcessing}
                className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase ${payProcessing ? 'bg-slate-200 text-slate-400' : 'bg-emerald-900 text-white hover:bg-emerald-800'}`}>
                {payProcessing ? 'Procesando...' : 'Generar Nómina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
