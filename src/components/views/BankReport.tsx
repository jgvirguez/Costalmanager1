import React, { useState, useEffect } from 'react';
import { AlertCircle, Download } from 'lucide-react';
import { dataService } from '../../services/dataService';
import { buildExcelFriendlyMatrixCsv } from '../../utils/csvExport';

export function BankReport({ bank, onClose }: { bank: any; onClose: () => void }) {
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const fmt = (value: any, decimals: number = 2) =>
    (Number(value ?? 0) || 0).toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  const usd = (value: any, decimals: number = 2) => `$ ${fmt(value, decimals)}`;
  const bs = (value: any, decimals: number = 2) => `Bs ${fmt(value, decimals)}`;

  console.log('🏦 BankReport renderizado con bank:', bank);

  useEffect(() => {
    const generateReport = async () => {
      console.log('🏦 Iniciando generación de reporte para bank:', bank?.id);
      try {
        setLoading(true);
        const bankTransactions = await dataService.getBankTransactions() || [];
        console.log('🏦 Transacciones bancarias obtenidas:', bankTransactions.length);
        
        const tx = bankTransactions.filter((t: any) => String(t.bankId) === String(bank.id))
          .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        
        console.log('🏦 Transacciones filtradas para este banco:', tx.length);
        console.log('🏦 Primera transacción:', tx[0]);
        console.log('🏦 Última transacción:', tx[tx.length - 1]);

        let runningBalanceUSD = 0;
        let runningBalanceVES = 0;

        const report = tx.map((transaction: any, index: number) => {
          const amountUSD = transaction.amountUSD || 0;
          const amountVES = transaction.amountVES || 0;
          
          const debitUSD = amountUSD < 0 ? Math.abs(amountUSD) : 0;
          const creditUSD = amountUSD > 0 ? amountUSD : 0;
          const debitVES = amountVES < 0 ? Math.abs(amountVES) : 0;
          const creditVES = amountVES > 0 ? amountVES : 0;
          
          runningBalanceUSD += amountUSD;
          runningBalanceVES += amountVES;

          const result = {
            fecha: new Date(transaction.createdAt).toLocaleDateString(),
            descripcion: transaction.note || transaction.source || '',
            referencia: transaction.reference || '',
            metodo: transaction.method || '',
            debitUSD,
            creditUSD,
            debitVES,
            creditVES,
            saldoUSD: runningBalanceUSD,
            saldoVES: runningBalanceVES,
            tipo: amountUSD > 0 ? 'CRÉDITO' : 'DÉBITO'
          };
          
          console.log(`🏦 Tx ${index + 1}:`, result);
          return result;
        });

        console.log('🏦 Reporte generado con', report.length, 'filas');
        console.log('🏦 Saldo final USD:', runningBalanceUSD);
        console.log('🏦 Saldo final Bs:', runningBalanceVES);
        setReportData(report);
      } catch (err: any) {
        console.error('🏦 Error generando reporte:', err);
        setError(String(err?.message ?? 'Error generando reporte'));
      } finally {
        console.log('🏦 Finalizando carga');
        setLoading(false);
      }
    };

    if (bank?.id) {
      generateReport();
    } else {
      console.error('🏦 No hay bank.id disponible');
      setError('No se pudo identificar el banco');
      setLoading(false);
    }
  }, [bank.id]);

  const totals = reportData.reduce((acc, item) => ({
    totalDebitUSD: acc.totalDebitUSD + item.debitUSD,
    totalCreditUSD: acc.totalCreditUSD + item.creditUSD,
    totalDebitVES: acc.totalDebitVES + item.debitVES,
    totalCreditVES: acc.totalCreditVES + item.creditVES
  }), { totalDebitUSD: 0, totalCreditUSD: 0, totalDebitVES: 0, totalCreditVES: 0 });

  const finalBalanceUSD = totals.totalCreditUSD - totals.totalDebitUSD;
  const finalBalanceVES = totals.totalCreditVES - totals.totalDebitVES;

  if (loading) {
    console.log('🏦 Mostrando estado loading');
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto mb-4"></div>
          <div className="text-sm font-black text-slate-600 uppercase tracking-wider">Generando reporte...</div>
        </div>
      </div>
    );
  }

  if (error) {
    console.log('🏦 Mostrando estado error:', error);
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <div className="text-sm font-black text-red-600 uppercase tracking-wider">{error}</div>
        </div>
      </div>
    );
  }

  console.log('🏦 Renderizando reporte con', reportData.length, 'filas');

  return (
    <div className="space-y-6">
      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="text-xs font-black text-emerald-600 uppercase tracking-wider">Total Crédito USD</div>
          <div className="text-xl font-black text-emerald-700">{usd(totals.totalCreditUSD)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs font-black text-red-600 uppercase tracking-wider">Total Débito USD</div>
          <div className="text-xl font-black text-red-700">{usd(totals.totalDebitUSD)}</div>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="text-xs font-black text-blue-600 uppercase tracking-wider">Total Crédito Bs</div>
          <div className="text-xl font-black text-blue-700">{bs(totals.totalCreditVES)}</div>
        </div>
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="text-xs font-black text-orange-600 uppercase tracking-wider">Total Débito Bs</div>
          <div className="text-xl font-black text-orange-700">{bs(totals.totalDebitVES)}</div>
        </div>
      </div>

      {/* Saldo Final */}
      <div className="bg-slate-900 text-white rounded-xl p-6">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Saldo Final USD</div>
            <div className={`text-2xl font-black ${finalBalanceUSD >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {usd(finalBalanceUSD)}
            </div>
          </div>
          <div>
            <div className="text-xs font-black text-slate-400 uppercase tracking-wider">Saldo Final Bs</div>
            <div className={`text-2xl font-black ${finalBalanceVES >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {bs(finalBalanceVES)}
            </div>
          </div>
        </div>
      </div>

      {/* Tabla de Movimientos */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 border-b">
          <div className="text-sm font-black text-slate-900 uppercase tracking-wider">Mayor de Movimientos</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-black text-slate-700 uppercase">Fecha</th>
                <th className="px-4 py-2 text-left font-black text-slate-700 uppercase">Descripción</th>
                <th className="px-4 py-2 text-left font-black text-slate-700 uppercase">Referencia</th>
                <th className="px-4 py-2 text-left font-black text-slate-700 uppercase">Método</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Débito USD</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Crédito USD</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Débito Bs</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Crédito Bs</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Saldo USD</th>
                <th className="px-4 py-2 text-right font-black text-slate-700 uppercase">Saldo Bs</th>
              </tr>
            </thead>
            <tbody>
              {reportData.map((item, index) => (
                <tr key={index} className="border-b hover:bg-slate-50">
                  <td className="px-4 py-2">{item.fecha}</td>
                  <td className="px-4 py-2 font-mono">{item.descripcion}</td>
                  <td className="px-4 py-2">{item.referencia}</td>
                  <td className="px-4 py-2">{item.metodo}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.debitUSD > 0 ? usd(item.debitUSD) : ''}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.creditUSD > 0 ? usd(item.creditUSD) : ''}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.debitVES > 0 ? bs(item.debitVES) : ''}</td>
                  <td className="px-4 py-2 text-right font-mono">{item.creditVES > 0 ? bs(item.creditVES) : ''}</td>
                  <td className={`px-4 py-2 text-right font-mono font-black ${item.saldoUSD >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {usd(item.saldoUSD)}
                  </td>
                  <td className={`px-4 py-2 text-right font-mono font-black ${item.saldoVES >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {bs(item.saldoVES)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Botones de acción */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => {
            const colHeaders = ['Fecha', 'Descripción', 'Referencia', 'Método', 'Débito USD', 'Crédito USD', 'Débito Bs', 'Crédito Bs', 'Saldo USD', 'Saldo Bs'];
            const dataRows = reportData.map((item) => [
              item.fecha,
              item.descripcion,
              item.referencia,
              item.metodo,
              item.debitUSD,
              item.creditUSD,
              item.debitVES,
              item.creditVES,
              item.saldoUSD,
              item.saldoVES
            ]);
            const w = colHeaders.length;
            const emptyTail = () => Array.from({ length: Math.max(0, w - 2) }, () => '');
            const csv = buildExcelFriendlyMatrixCsv(colHeaders, dataRows, {
              preambleRows: [
                ['TIPO', 'Mayor bancario', ...emptyTail()],
                ['BANCO', String(bank?.name ?? ''), ...emptyTail()],
                ['GENERADO', new Date().toLocaleString('es-VE'), ...emptyTail()],
                Array.from({ length: w }, () => '')
              ]
            });
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reporte_${bank.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-2"
        >
          <Download className="w-3.5 h-3.5" />
          Exportar Excel
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-wider"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
