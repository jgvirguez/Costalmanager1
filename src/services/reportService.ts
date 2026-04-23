import { dataService } from './dataService';
import { formatQuantity } from '../utils/costCalculations';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface DailyStats {
  date: string;
  totalUSD: number;
  totalVES: number;
  orders: number;
}

export interface InventoryStats {
  sku: string;
  description: string;
  totalKg: number;
  valueUSD: number;
  warehouseDist: {
    galpon: number;
    pesa: number;
    exibicion: number;
  }
}

class ReportService {
  private roundMoney(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  private normalizeMoney(value: any): number {
    return this.roundMoney(Math.abs(Number(value ?? 0) || 0));
  }

  private formatNumber(value: any, decimals: number = 2): string {
    const normalized = Number(value ?? 0) || 0;
    return normalized.toLocaleString('es-VE', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  private formatUSD(value: any): string {
    return `$ ${this.formatNumber(value, 2)}`;
  }

  private formatVES(value: any): string {
    return `Bs ${this.formatNumber(value, 2)}`;
  }

  private getReportOperatorLabel(): string {
    const user = dataService.getCurrentUser();
    const byName = String(user?.name ?? '').trim();
    const byEmail = String(user?.email ?? '').trim();
    return byName || byEmail || 'Sistema';
  }

  private resolveSummaryStartY(doc: any, preferredY: number, minSpace: number = 52): number {
    const pageHeight = Number(doc?.internal?.pageSize?.getHeight?.() ?? 297);
    const bottomMargin = 12;
    if (preferredY + minSpace > pageHeight - bottomMargin) {
      doc.addPage();
      return 20;
    }
    return preferredY;
  }

  private renderExecutiveSummaryBox(
    doc: any,
    startY: number,
    rows: Array<{ indicador: string; valor1: string; valor2?: string }>
  ) {
    autoTable(doc, {
      startY,
      head: [['INDICADOR', 'VALOR 1', 'VALOR 2']],
      body: rows.map((r) => [r.indicador, r.valor1, r.valor2 ?? '-']),
      theme: 'grid',
      tableWidth: 130,
      margin: { left: 14 },
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      bodyStyles: { textColor: [0, 0, 0] },
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' }
      }
    });
  }

  getDailySales(): DailyStats[] {
    const sales = dataService.getSales();
    const statsMap: Record<string, DailyStats> = {};

    sales.forEach(sale => {
      // Use YYYY-MM-DD for reliable sorting
      const date = sale.timestamp.toISOString().split('T')[0];
      if (!statsMap[date]) {
        statsMap[date] = { date, totalUSD: 0, totalVES: 0, orders: 0 };
      }
      statsMap[date].totalUSD += sale.totalUSD;
      statsMap[date].totalVES += sale.totalVES;
      statsMap[date].orders += 1;
    });

    return Object.values(statsMap).sort((a,b) => b.date.localeCompare(a.date));
  }

  getTodayLiquidation() {
    const sales = dataService.getSales();
    const today = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.timestamp.toISOString().split('T')[0] === today);
    
    return {
      totalUSD: todaySales.reduce((a, b) => a + b.totalUSD, 0),
      totalVES: todaySales.reduce((a, b) => a + b.totalVES, 0),
      count: todaySales.length,
      byMethod: {
        CASH: todaySales.filter(s => s.paymentMethod === 'EFECTIVO' || s.paymentMethod === 'CASH').reduce((a, b) => a + b.totalUSD, 0),
        TRANSFER: todaySales.filter(s => s.paymentMethod === 'TRANSFERENCIA' || s.paymentMethod === 'PAGO_MOVIL').reduce((a, b) => a + b.totalUSD, 0),
        CREDIT: todaySales.filter(s => s.paymentMethod === 'CREDIT' || s.paymentMethod === 'CRÉDITO').reduce((a, b) => a + b.totalUSD, 0)
      }
    };
  }

  getInventoryOverview(): InventoryStats[] {
    const stocks = dataService.getStocks();
    return stocks.map(s => ({
      sku: s.code,
      description: s.description,
      totalKg: s.d3 + s.d2 + s.a1,
      valueUSD: (s.d3 + s.d2 + s.a1) * s.priceUSD,
      warehouseDist: {
        galpon: s.d3,
        pesa: s.d2,
        exibicion: s.a1
      }
    }));
  }

  getTotalValorization(): number {
    return this.getInventoryOverview().reduce((acc, curr) => acc + curr.valueUSD, 0);
  }

  getPaymentMethodDistribution() {
    const sales = dataService.getSales();
    const dist: Record<string, number> = {};
    sales.forEach(s => {
      const method = s.paymentMethod.toUpperCase();
      dist[method] = (dist[method] || 0) + s.totalUSD;
    });
    return dist;
  }

  getContractionStats() {
    return {
      index: dataService.getContractionIndex(),
      totalMermasKg: dataService.getMovements()
        .filter(m => m.type === 'MERMA_NATURAL' || m.type === 'MERMA_MANIP')
        .reduce((a,b) => a + Math.abs(b.qty), 0),
      byType: {
        natural: dataService.getMovements().filter(m => m.type === 'MERMA_NATURAL').reduce((a,b) => a + Math.abs(b.qty), 0),
        manipulation: dataService.getMovements().filter(m => m.type === 'MERMA_MANIP').reduce((a,b) => a + Math.abs(b.qty), 0)
      }
    };
  }

  // --- PDF REPORT GENERATION ---

  exportLedgerToPDF() {
    const doc = new jsPDF();
    const ledger = dataService.getConsolidatedLedger();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();

    // Header
    doc.setFontSize(20);
    doc.setTextColor(2, 44, 34); // Emerald 950
    doc.text('REPORTE: LIBRO MAYOR ANALÍTICO', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);
    doc.text('CORPORACIÓN INDUSTRIAL - CONTROL FINANCIERO', 14, 35);

    const tableData = ledger.map(entry => [
      entry.timestamp.toLocaleDateString(),
      entry.type === 'INCOME' ? 'INGRESO' : 'EGRESO',
      entry.category,
      entry.description,
      this.formatUSD(entry.amountUSD)
    ]);

    autoTable(doc, {
      startY: 45,
      head: [['FECHA', 'TIPO', 'CATEGORÍA', 'DESCRIPCIÓN', 'MONTO USD']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } }
    });

    const totalIncome = ledger.filter(e => e.type === 'INCOME').reduce((a, b) => a + b.amountUSD, 0);
    const totalExpense = ledger.filter(e => e.type === 'EXPENSE').reduce((a, b) => a + b.amountUSD, 0);
    const net = totalIncome - totalExpense;

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`TOTAL INGRESOS: $ ${totalIncome.toLocaleString()}`, 130, finalY);
    doc.text(`TOTAL EGRESOS: $ ${totalExpense.toLocaleString()}`, 130, finalY + 5);
    doc.setFontSize(12);
    if (net >= 0) {
      doc.setTextColor(5, 150, 105);
    } else {
      doc.setTextColor(220, 38, 38);
    }
    doc.text(`BALANCE NETO: $ ${net.toLocaleString()}`, 130, finalY + 15);
    doc.setTextColor(0);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 22, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'TOTAL INGRESOS', valor1: this.formatUSD(totalIncome) },
      { indicador: 'TOTAL EGRESOS', valor1: this.formatUSD(totalExpense) },
      { indicador: 'TOTAL NETO', valor1: this.formatUSD(net) }
    ]);

    doc.save(`LIBRO_MAYOR_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportARStatementToPDF(clientId: string) {
    const doc = new jsPDF();
    const clientEntries = dataService.getAREntries().filter(e => e.customerId === clientId);
    if (clientEntries.length === 0) return;

    const clientName = clientEntries[0].customerName;
    const now = new Date().toLocaleDateString();
    const generatedBy = this.getReportOperatorLabel();

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('ESTADO DE CUENTA: CLIENTE ESPECIAL', 14, 22);
    doc.setFontSize(12);
    doc.text(clientName.toUpperCase(), 14, 32);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Fecha de Emisión: ${now}`, 14, 38);
    doc.text(`Generado por: ${generatedBy}`, 14, 43);

    const tableData = clientEntries.map(e => [
      e.timestamp.toLocaleDateString(),
      e.saleCorrelativo,
      e.dueDate.toLocaleDateString(),
      this.formatUSD(e.amountUSD),
      this.formatUSD(e.balanceUSD),
      e.status === 'PAID' ? 'LIQUIDADO' : (new Date() > e.dueDate ? 'VENCIDO' : 'PENDIENTE')
    ]);

    autoTable(doc, {
      startY: 48,
      head: [['FECHA', 'FAC #', 'VENCIMIENTO', 'MONTO', 'SALDO', 'ESTADO']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
    });

    const totalDue = clientEntries.reduce((a, b) => a + b.balanceUSD, 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    doc.text(`SALDO TOTAL EXIGIBLE: $ ${totalDue.toLocaleString()}`, 110, finalY);
    doc.setTextColor(0);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'FACTURAS DEL CLIENTE', valor1: String(clientEntries.length) },
      { indicador: 'SALDO EXIGIBLE', valor1: this.formatUSD(totalDue) },
      { indicador: 'CLIENTE', valor1: clientName.toUpperCase() }
    ]);

    doc.save(`EDC_${clientName.replace(/ /g, '_')}.pdf`);
  }

  exportARGlobalToPDF(arEntries: any[]) {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    doc.setFontSize(18); doc.setTextColor(2, 44, 34);
    doc.text('CARTERA AR — CUENTAS POR COBRAR', 14, 22);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);

    const totalBalance = arEntries.filter(e => e.status !== 'PAID').reduce((a: number, b: any) => a + Number(b.balanceUSD ?? 0), 0);
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`TOTAL POR COBRAR: ${this.formatUSD(totalBalance)}`, 14, 38);

    const rows = arEntries.map((e: any) => {
      const isOverdue = e.status !== 'PAID' && new Date() > new Date(e.dueDate);
      return [
        String(e.customerName ?? '').toUpperCase(),
        String(e.saleCorrelativo ?? ''),
        new Date(e.dueDate).toLocaleDateString('es-VE'),
        this.formatUSD(Number(e.amountUSD ?? 0)),
        this.formatUSD(Number(e.balanceUSD ?? 0)),
        isOverdue ? 'VENCIDO' : (e.status === 'PAID' ? 'PAGADO' : 'PENDIENTE')
      ];
    });

    autoTable(doc, {
      startY: 44,
      head: [['CLIENTE', 'FACTURA', 'VENCIMIENTO', 'ORIGINAL', 'SALDO', 'ESTADO']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'center' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 5 && data.cell.raw === 'VENCIDO') {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 60) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'FACTURAS EN CARTERA', valor1: String(arEntries.length) },
      { indicador: 'TOTAL POR COBRAR', valor1: this.formatUSD(totalBalance) }
    ]);

    doc.save(`AR_GLOBAL_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportAPGlobalToPDF(apEntries: any[]) {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    doc.setFontSize(18); doc.setTextColor(100, 20, 20);
    doc.text('PASIVOS CIRCULANTES — CUENTAS POR PAGAR (AP)', 14, 22);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);

    const totalBalance = apEntries.filter(e => e.status !== 'PAID').reduce((a: number, b: any) => a + Number(b.balanceUSD ?? 0), 0);
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`TOTAL POR PAGAR: ${this.formatUSD(totalBalance)}`, 14, 38);

    const rows = apEntries.map((ap: any) => {
      const isOverdue = ap.status !== 'PAID' && new Date() > new Date(ap.dueDate);
      return [
        String(ap.supplier ?? '').toUpperCase(),
        String(ap.id ?? ''),
        new Date(ap.dueDate).toLocaleDateString('es-VE'),
        this.formatUSD(Number(ap.balanceUSD ?? 0)),
        isOverdue ? 'VENCIDO' : (ap.status === 'PAID' ? 'PAGADO' : 'PENDIENTE')
      ];
    });

    autoTable(doc, {
      startY: 44,
      head: [['PROVEEDOR', 'ID', 'VENCIMIENTO', 'SALDO', 'ESTADO']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [100, 20, 20], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 8 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' }, 4: { halign: 'center' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 4 && data.cell.raw === 'VENCIDO') {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 60) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'DOCUMENTOS AP', valor1: String(apEntries.length) },
      { indicador: 'TOTAL POR PAGAR', valor1: this.formatUSD(totalBalance) }
    ]);

    doc.save(`AP_GLOBAL_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportMarginReportToPDF() {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const stocks = dataService.getStocks();
    const rows: any[] = [];
    stocks.forEach(product => {
      ((product as any).lotes || []).forEach((batch: any) => {
        const purchaseCost = Number(batch.costUSD || 0) * Number(batch.initialQty || batch.quantity || 0);
        const qty = Number(batch.quantity || 0);
        if (purchaseCost <= 0) return;
        const unitCost = qty > 0 ? purchaseCost / qty : 0;
        const price = Number(product.priceUSD || 0);
        const margin = price > 0 ? ((price - unitCost) / price) * 100 : 0;
        rows.push([
          product.code,
          product.description.substring(0, 30),
          this.formatNumber(qty, 2),
          `$ ${this.formatNumber(unitCost, 3)}`,
          `$ ${this.formatNumber(price, 3)}`,
          `${this.formatNumber(margin, 1)}%`
        ]);
      });
    });
    rows.sort((a, b) => parseFloat(b[5]) - parseFloat(a[5]));

    doc.setFontSize(18); doc.setTextColor(2, 44, 34);
    doc.text('REPORTE DE MÁRGENES POR LOTE', 14, 22);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);

    autoTable(doc, {
      startY: 36,
      head: [['SKU', 'DESCRIPCIÓN', 'STOCK', 'COSTO UNIT.', 'P. VENTA', 'MARGEN %']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' } }
    });

    const avgMargin = rows.length > 0
      ? rows.reduce((acc, row) => acc + Number(String(row[5]).replace('%', '')), 0) / rows.length
      : 0;
    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'LOTES EVALUADOS', valor1: String(rows.length) },
      { indicador: 'MARGEN PROMEDIO', valor1: `${avgMargin.toFixed(2)} %` }
    ]);

    doc.save(`MARGENES_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportZClosureToPDF(
    data: {
      date: string;
      totals: { usd: number; ves: number };
      counts: { total: number };
      byMethod: Record<string, { count: number; usd: number; ves: number }>;
      byCashierSummaries?: Array<{
        cashierName: string;
        salesCount: number;
        totalUSD: number;
        totalVES: number;
        methodRows: Array<{ method: string; count: number; usd: number; ves: number }>;
      }>;
      variance: { usd: number; ves: number; hasDeclaration: boolean };
    },
    cashierLabel: string = 'Todos los cajeros',
    filterLabel: string = ''
  ) {
    const doc = new jsPDF();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();

    doc.setFontSize(20); doc.setTextColor(2, 44, 34);
    doc.text('CIERRE DE CAJA Z', 14, 22);
    doc.setFontSize(11); doc.setTextColor(50);
    doc.text(`Fecha: ${data.date}`, 14, 32);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Cajero: ${cashierLabel}`, 14, 38);
    if (filterLabel.trim()) {
      doc.text(`Filtro: ${filterLabel}`, 14, 43);
      doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 48);
    } else {
      doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 43);
    }

    doc.setFontSize(12); doc.setTextColor(0);
    const totalsStartY = filterLabel.trim() ? 60 : 55;
    doc.text(`TOTAL USD:  ${this.formatUSD(data.totals.usd)}`, 14, totalsStartY);
    doc.text(`TOTAL Bs:  ${this.formatVES(data.totals.ves)}`, 14, totalsStartY + 7);
    doc.text(`OPERACIONES: ${data.counts.total}`, 14, totalsStartY + 14);

    const rows = Object.entries(data.byMethod).map(([method, d]) => [
      method, String(d.count),
      this.formatUSD(d.usd),
      this.formatVES(d.ves),
      data.totals.usd > 0 ? `${((d.usd / data.totals.usd) * 100).toFixed(1)}%` : '0%'
    ]);

    autoTable(doc, {
      startY: filterLabel.trim() ? 82 : 77,
      head: [['MÉTODO', 'OPS', 'TOTAL $', 'TOTAL Bs', '% DEL TOTAL']],
      body: rows,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 9 },
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } }
    });

    const cashierSections = Array.isArray(data.byCashierSummaries) ? data.byCashierSummaries : [];
    if (cashierSections.length > 0) {
      let sectionY = ((doc as any).lastAutoTable?.finalY ?? (filterLabel.trim() ? 82 : 77)) + 10;
      cashierSections.forEach((cashier, idx) => {
        const needsNewPage = sectionY > 175;
        if (needsNewPage) {
          doc.addPage();
          sectionY = 20;
        }

        doc.setFontSize(11);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `CAJERO: ${String(cashier.cashierName ?? '').toUpperCase()} | FACTURAS: ${Number(cashier.salesCount ?? 0)} | TOTAL $: ${this.formatNumber(Number(cashier.totalUSD ?? 0), 2)} | TOTAL Bs: ${this.formatNumber(Number(cashier.totalVES ?? 0), 2)}`,
          14,
          sectionY
        );

        const cashierRows = (Array.isArray(cashier.methodRows) ? cashier.methodRows : []).map((row) => [
          String(row.method ?? ''),
          String(Number(row.count ?? 0)),
          this.formatUSD(Number(row.usd ?? 0)),
          this.formatVES(Number(row.ves ?? 0))
        ]);

        autoTable(doc, {
          startY: sectionY + 4,
          head: [['MÉTODO', 'OPS', 'TOTAL $', 'TOTAL Bs']],
          body: cashierRows.length > 0 ? cashierRows : [['Sin datos', '0', '$ 0.00', 'Bs. 0.00']],
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8.5 },
          columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } }
        });

        sectionY = ((doc as any).lastAutoTable?.finalY ?? sectionY + 20) + 8;
        if (idx < cashierSections.length - 1 && sectionY > 175) {
          doc.addPage();
          sectionY = 20;
        }
      });
    }

    if (data.variance.hasDeclaration) {
      let finalY = ((doc as any).lastAutoTable?.finalY ?? 90) + 12;
      if (finalY > 255) {
        doc.addPage();
        finalY = 24;
      }
      const hasVariance = Math.abs(data.variance.usd) > 0.01 || Math.abs(data.variance.ves) > 0.01;
      doc.setFontSize(11);
      if (hasVariance) { doc.setTextColor(220, 38, 38); doc.text('⚠ VARIANZA DETECTADA', 14, finalY); }
      else { doc.setTextColor(5, 150, 105); doc.text('✓ CUADRE PERFECTO', 14, finalY); }
      doc.setFontSize(9); doc.setTextColor(0);
      doc.text(`Diferencia $: ${data.variance.usd >= 0 ? '+' : ''}${this.formatNumber(data.variance.usd, 2)}`, 14, finalY + 7);
      doc.text(`Diferencia Bs: ${data.variance.ves >= 0 ? '+' : ''}${this.formatNumber(data.variance.ves, 2)}`, 14, finalY + 13);
    }

    const zSummaryStart = this.resolveSummaryStartY(
      doc,
      Number((doc as any).lastAutoTable?.finalY ?? 90) + 10,
      40
    );
    this.renderExecutiveSummaryBox(doc, zSummaryStart, [
      { indicador: 'FACTURAS', valor1: String(data.counts.total) },
      { indicador: 'TOTAL CONTADO/CREDITO USD', valor1: this.formatUSD(Number(data.totals.usd ?? 0)) },
      { indicador: 'TOTAL Bs', valor1: this.formatVES(Number(data.totals.ves ?? 0)) }
    ]);

    doc.save(`CIERRE_Z_${data.date}.pdf`);
  }

  exportCashierInvoiceDetailToPDF(
    rows: Array<{
      cashier: string;
      invoiceDate: string;
      invoiceTime: string;
      correlativo: string;
      client: string;
      paymentMethod: string;
      reference?: string;
      paymentUSD: number;
      paymentVES: number;
      rateUsed?: number;
      equivalentUSD?: number;
    }>,
    date: string,
    cashierLabel: string,
    mode: 'VES' | 'USD' | 'MIXED' = 'MIXED',
    filterLabel: string = ''
  ) {
    if (!Array.isArray(rows) || rows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = rows.reduce((acc, row) => acc + this.normalizeMoney(row.paymentUSD), 0);
    const totalVES = rows.reduce((acc, row) => acc + this.normalizeMoney(row.paymentVES), 0);
    const totalEquivalentUSD = rows.reduce((acc, row) => acc + this.normalizeMoney(row.equivalentUSD), 0);

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('FACTURACION POR CAJERO - DETALLE DE COBRO', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Fecha reporte: ${date} | Cajero: ${cashierLabel}`, 14, 25);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);
    if (mode === 'USD') {
      doc.text(`Total lineas: ${rows.length} | Total USD: ${this.formatUSD(totalUSD)}`, 14, 35);
    } else if (mode === 'VES') {
      doc.text(`Total lineas: ${rows.length} | Total Bs: ${this.formatVES(totalVES)} | Equiv USD: ${this.formatUSD(totalEquivalentUSD)}`, 14, 35);
    } else {
      doc.text(`Total lineas: ${rows.length} | Total USD: ${this.formatUSD(totalUSD)} | Total Bs: ${this.formatVES(totalVES)}`, 14, 35);
    }
    if (filterLabel.trim()) {
      doc.text(`Filtro aplicado: ${filterLabel}`, 14, 40);
    }

    const head = mode === 'USD'
      ? [['FECHA', 'CAJERO', 'FACTURA', 'CLIENTE', 'METODO', 'REFERENCIA', 'MONTO USD']]
      : [['FECHA', 'CAJERO', 'FACTURA', 'CLIENTE', 'METODO', 'REFERENCIA', 'MONTO BS', 'TASA USADA', 'EQUIV USD']];

    const body = mode === 'USD'
      ? rows.map((row) => [
          `${String(row.invoiceDate ?? '')} ${String(row.invoiceTime ?? '')}`.trim(),
          String(row.cashier ?? ''),
          String(row.correlativo ?? ''),
          String(row.client ?? ''),
          String(row.paymentMethod ?? ''),
          String(row.reference ?? ''),
          this.formatUSD(this.normalizeMoney(row.paymentUSD))
        ])
      : rows.map((row) => [
          `${String(row.invoiceDate ?? '')} ${String(row.invoiceTime ?? '')}`.trim(),
          String(row.cashier ?? ''),
          String(row.correlativo ?? ''),
          String(row.client ?? ''),
          String(row.paymentMethod ?? ''),
          String(row.reference ?? ''),
          this.formatVES(this.normalizeMoney(row.paymentVES)),
          Number(row.rateUsed ?? 0) > 0 ? Number(row.rateUsed ?? 0).toFixed(4) : 'N/D',
          this.formatUSD(this.normalizeMoney(row.equivalentUSD))
        ]);

    const foot = mode === 'USD'
      ? [[
          '',
          '',
          '',
          '',
          '',
          'TOTAL',
          this.formatUSD(totalUSD)
        ]]
      : [[
          '',
          '',
          '',
          '',
          '',
          'TOTAL',
          this.formatVES(totalVES),
          '',
          this.formatUSD(totalEquivalentUSD)
        ]];

    autoTable(doc, {
      startY: filterLabel.trim() ? 45 : 40,
      head,
      body,
      foot,
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold', halign: 'right' },
      styles: { fontSize: 7.5 },
      columnStyles: mode === 'USD'
        ? { 6: { halign: 'right' } }
        : { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'TOTAL FACTURAS', valor1: String(rows.length) },
      { indicador: 'TOTAL USD', valor1: this.formatUSD(totalUSD) },
      { indicador: 'TOTAL Bs', valor1: this.formatVES(totalVES), valor2: `${this.formatUSD(totalEquivalentUSD)} equiv` }
    ]);

    doc.save(`FACTURACION_CAJERO_DETALLE_${date}.pdf`);
  }

  exportTreasuryOperationsToPDF(
    rows: Array<{
      date: string;
      time: string;
      bankName: string;
      accountLabel: string;
      accountId: string;
      sourceLabel: string;
      correlativo: string;
      customerName: string;
      method: string;
      cashier: string;
      reference?: string;
      rateUsed?: number;
      amountUSD: number;
      amountVES: number;
      equivalentUSD: number;
      equivalentVES: number;
      runningUSD: number;
      runningVES: number;
    }>,
    context: {
      dateRange: { start: string; end: string };
      flowLabel: string;
      currencyLabel: string;
      methodLabel: string;
      bankLabel: string;
      accountLabel: string;
      mode: 'USD' | 'VES' | 'MIXED';
    }
  ) {
    if (!Array.isArray(rows) || rows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const round = (value: any) => this.roundMoney(Number(value ?? 0) || 0);

    const totalMovementUSD = rows.reduce((acc, row) => acc + round(row.amountUSD), 0);
    const totalMovementVES = rows.reduce((acc, row) => acc + round(row.amountVES), 0);
    const totalEquivalentUSD = rows.reduce((acc, row) => acc + round(row.equivalentUSD), 0);
    const totalEquivalentVES = rows.reduce((acc, row) => acc + round(row.equivalentVES), 0);
    const finalBalanceUSD = rows.length > 0 ? round(rows[rows.length - 1].runningUSD) : 0;
    const finalBalanceVES = rows.length > 0 ? round(rows[rows.length - 1].runningVES) : 0;
    const sign = (value: number) => `${value >= 0 ? '+' : ''}${this.formatNumber(value, 2)}`;

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('TESORERIA - OPERACIONES BANCARIAS DETALLADAS', 14, 16);
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    doc.text(`Banco/Cuenta objetivo: ${context.bankLabel} / ${context.accountLabel}`, 14, 21);
    doc.setFontSize(8.5);
    doc.setTextColor(100);
    doc.text(`Rango: ${context.dateRange.start} a ${context.dateRange.end} | Flujo: ${context.flowLabel} | Moneda: ${context.currencyLabel} | Metodo: ${context.methodLabel}`, 14, 27);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 32);

    const head = context.mode === 'USD'
      ? [[
          'FECHA', 'BANCO/CUENTA', 'TIPO', 'FACTURA', 'CLIENTE', 'METODO', 'CAJERO', 'REFERENCIA', 'MOV USD', 'EQUIV USD', 'SALDO USD'
        ]]
      : context.mode === 'VES'
      ? [[
          'FECHA', 'BANCO/CUENTA', 'TIPO', 'FACTURA', 'CLIENTE', 'METODO', 'CAJERO', 'REFERENCIA', 'MOV Bs', 'EQUIV Bs', 'SALDO Bs'
        ]]
      : [[
          'FECHA', 'BANCO/CUENTA', 'TIPO', 'FACTURA', 'CLIENTE', 'METODO', 'CAJERO', 'REFERENCIA', 'MOV USD', 'MOV Bs', 'EQUIV USD', 'EQUIV Bs', 'SALDO USD', 'SALDO Bs'
        ]];

    const body = context.mode === 'USD'
      ? rows.map((row) => [
          `${String(row.date ?? '')} ${String(row.time ?? '')}`.trim(),
          `${String(row.bankName ?? '')} / ${String(row.accountLabel ?? '')} (${String(row.accountId ?? '')})`,
          String(row.sourceLabel ?? ''),
          String(row.correlativo ?? ''),
          String(row.customerName ?? ''),
          String(row.method ?? ''),
          String(row.cashier ?? ''),
          String(row.reference ?? ''),
          sign(round(row.amountUSD)),
          sign(round(row.equivalentUSD)),
          sign(round(row.runningUSD))
        ])
      : context.mode === 'VES'
      ? rows.map((row) => [
          `${String(row.date ?? '')} ${String(row.time ?? '')}`.trim(),
          `${String(row.bankName ?? '')} / ${String(row.accountLabel ?? '')} (${String(row.accountId ?? '')})`,
          String(row.sourceLabel ?? ''),
          String(row.correlativo ?? ''),
          String(row.customerName ?? ''),
          String(row.method ?? ''),
          String(row.cashier ?? ''),
          String(row.reference ?? ''),
          sign(round(row.amountVES)),
          sign(round(row.equivalentVES)),
          sign(round(row.runningVES))
        ])
      : rows.map((row) => [
          `${String(row.date ?? '')} ${String(row.time ?? '')}`.trim(),
          `${String(row.bankName ?? '')} / ${String(row.accountLabel ?? '')} (${String(row.accountId ?? '')})`,
          String(row.sourceLabel ?? ''),
          String(row.correlativo ?? ''),
          String(row.customerName ?? ''),
          String(row.method ?? ''),
          String(row.cashier ?? ''),
          String(row.reference ?? ''),
          sign(round(row.amountUSD)),
          sign(round(row.amountVES)),
          sign(round(row.equivalentUSD)),
          sign(round(row.equivalentVES)),
          sign(round(row.runningUSD)),
          sign(round(row.runningVES))
        ]);

    const foot = context.mode === 'USD'
      ? [[
          '', '', '', '', '', '', '', 'TOTAL',
          sign(totalMovementUSD),
          sign(totalEquivalentUSD),
          sign(finalBalanceUSD)
        ]]
      : context.mode === 'VES'
      ? [[
          '', '', '', '', '', '', '', 'TOTAL',
          sign(totalMovementVES),
          sign(totalEquivalentVES),
          sign(finalBalanceVES)
        ]]
      : [[
          '', '', '', '', '', '', '', 'TOTAL',
          sign(totalMovementUSD),
          sign(totalMovementVES),
          sign(totalEquivalentUSD),
          sign(totalEquivalentVES),
          sign(finalBalanceUSD),
          sign(finalBalanceVES)
        ]];

    autoTable(doc, {
      startY: 36,
      head,
      body,
      foot,
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold', halign: 'right' },
      styles: { fontSize: 7 },
      columnStyles: context.mode === 'USD'
        ? { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } }
        : context.mode === 'VES'
        ? { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' } }
        : { 8: { halign: 'right' }, 9: { halign: 'right' }, 10: { halign: 'right' }, 11: { halign: 'right' }, 12: { halign: 'right' }, 13: { halign: 'right' } }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'MOVIMIENTOS', valor1: String(rows.length) },
      { indicador: 'TOTAL MOV USD', valor1: sign(totalMovementUSD), valor2: sign(totalEquivalentUSD) },
      { indicador: 'TOTAL MOV Bs', valor1: sign(totalMovementVES), valor2: sign(totalEquivalentVES) },
      { indicador: 'SALDO FINAL', valor1: sign(finalBalanceUSD), valor2: sign(finalBalanceVES) }
    ]);

    doc.save(`TESORERIA_OPERACIONES_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportInventoryToPDF() {
    const doc = new jsPDF();
    const stocks = this.getInventoryOverview();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('VALORACIÓN DE INVENTARIO INDUSTRIAL', 14, 22);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Actualizado: ${now} | Operador: ${generatedBy} | Protocolo FEFO Activo`, 14, 30);

    const tableData = stocks.map(s => [
      s.sku,
      s.description,
      `${s.totalKg.toLocaleString()} kg`,
      `$ ${s.valueUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
    ]);

    autoTable(doc, {
      startY: 40,
      head: [['SKU', 'DESCRIPCIÓN', 'EXISTENCIA', 'VALORACIÓN USD']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [2, 44, 34] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const total = this.getTotalValorization();
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(2, 44, 34);
    doc.text(`VALOR TOTAL ACTIVO: $ ${total.toLocaleString()}`, 110, finalY);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'SKU EVALUADOS', valor1: String(stocks.length) },
      { indicador: 'VALOR TOTAL ACTIVO', valor1: this.formatUSD(Number(total ?? 0)) }
    ]);

    doc.save(`INVENTARIO_${new Date().toISOString().split('T')[0]}.pdf`);
  }

  exportAPStatementToPDF(supplierId: string, supplierName?: string) {
    const apEntries = dataService.getAPEntries().filter(e =>
      e.supplierId === supplierId || e.supplier === supplierName || e.supplier === supplierId
    );
    if (apEntries.length === 0) return;

    const resolvedName = supplierName ?? apEntries[0].supplier;
    const now = new Date().toLocaleDateString('es-VE');
    const generatedBy = this.getReportOperatorLabel();

    const doc = new jsPDF();
    doc.setFontSize(18); doc.setTextColor(100, 20, 20);
    doc.text('ESTADO DE CUENTA: PROVEEDOR', 14, 22);
    doc.setFontSize(12); doc.setTextColor(0);
    doc.text(resolvedName.toUpperCase(), 14, 32);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Fecha de Emisión: ${now}`, 14, 38);
    doc.text(`Generado por: ${generatedBy}`, 14, 43);

    const tableData = apEntries.map(e => [
      e.timestamp.toLocaleDateString('es-VE'),
      String(e.description ?? '').substring(0, 40),
      e.dueDate.toLocaleDateString('es-VE'),
      this.formatUSD(Number(e.amountUSD ?? 0)),
      this.formatUSD(Number(e.balanceUSD ?? 0)),
      e.status === 'PAID' ? 'PAGADO' : (new Date() > e.dueDate ? 'VENCIDO' : 'PENDIENTE')
    ]);

    autoTable(doc, {
      startY: 48,
      head: [['FECHA', 'DESCRIPCIÓN', 'VENCIMIENTO', 'MONTO', 'SALDO', 'ESTADO']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [100, 20, 20], textColor: [255, 255, 255] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' }, 5: { halign: 'center' } },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 5 && data.cell.raw === 'VENCIDO') {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    });

    const totalDue = apEntries.filter(e => e.status !== 'PAID').reduce((a, b) => a + Number(b.balanceUSD ?? 0), 0);
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setTextColor(220, 38, 38);
    doc.text(`SALDO TOTAL EXIGIBLE: ${this.formatUSD(totalDue)}`, 110, finalY);
    doc.setTextColor(0);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'FACTURAS DEL PROVEEDOR', valor1: String(apEntries.length) },
      { indicador: 'SALDO EXIGIBLE', valor1: this.formatUSD(totalDue) },
      { indicador: 'PROVEEDOR', valor1: resolvedName.toUpperCase() }
    ]);

    doc.save(`AP_EDC_${resolvedName.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
  }
}

export const reportService = new ReportService();
