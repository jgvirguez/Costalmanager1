import { dataService, type SaleHistoryEntry, type ProductStock, type PurchaseOrder, type MayorCuentaMovimientoRow } from './dataService';
import type { BillingItem } from '../types/billing';
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
  totalQty: number;
  unit: string;
  valueUSD: number;
  warehouseDist: {
    galpon: number;
    pesa: number;
    exibicion: number;
  }
}

export type ProfitWindowKey = 'today' | 'week' | 'month';

export interface SkuProfitRow {
  code: string;
  description: string;
  qtySold: number;
  revenueUSD: number;
  costUSD: number;
  profitUSD: number;
}

export interface SaleProfitRow {
  correlativo: string;
  ts: Date;
  revenueUSD: number;
  costUSD: number;
  profitUSD: number;
}

export interface ProfitWindowSummary {
  key: ProfitWindowKey;
  label: string;
  start: Date;
  end: Date;
  tickets: number;
  revenueUSD: number;
  costUSD: number;
  grossProfitUSD: number;
  marginPct: number;
  bySku: SkuProfitRow[];
  topSales: SaleProfitRow[];
}

export interface ProfitReportFilter {
  start: Date;
  end: Date;
  productQuery?: string;
  label?: string;
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

  private formatSaleProductDetails(sale: any): string {
    const items = Array.isArray(sale?.items) ? sale.items : [];
    if (items.length === 0) return 'Sin detalle de productos';
    return items.map((item: any, index: number) => {
      const qty = this.formatNumber(Number(item?.qty ?? 0) || 0, 2);
      const unit = String(item?.unit ?? '').trim();
      const name = String(item?.description ?? item?.code ?? `Producto ${index + 1}`).trim();
      return `${index + 1}) ${name} — ${qty}${unit ? ` ${unit}` : ''}`;
    }).join('\n');
  }

  private formatPurchaseProductDetails(row: any): string {
    const lines = Array.isArray(row?.lines) ? row.lines : [];
    if (lines.length === 0) return String(row?.productDetails ?? '').trim() || 'Sin detalle de productos';
    return lines.map((line: any, index: number) => {
      const qty = this.formatNumber(Number(line?.qty ?? 0) || 0, 2);
      const unit = String(line?.unit ?? '').trim();
      const name = String(line?.productDescription ?? line?.sku ?? `Producto ${index + 1}`).trim();
      return `${index + 1}) ${name} — ${qty}${unit ? ` ${unit}` : ''}`;
    }).join('\n');
  }

  private getReportOperatorLabel(): string {
    const user = dataService.getCurrentUser();
    const byName = String(user?.name ?? '').trim();
    const byEmail = String(user?.email ?? '').trim();
    return byName || byEmail || 'Sistema';
  }

  private auditReportExport(format: 'PDF' | 'CSV' | 'EXCEL', reportName: string, filterLabel?: string): void {
    const actor = this.getReportOperatorLabel();
    const detailParts = [
      `Exportacion ${format}`,
      `Reporte: ${String(reportName || 'N/D')}`,
      `Usuario: ${actor}`
    ];
    if (filterLabel && String(filterLabel).trim()) {
      detailParts.push(`Filtros: ${String(filterLabel).trim()}`);
    }
    detailParts.push(`Fecha: ${new Date().toLocaleString('es-VE')}`);
    void dataService.addAuditEntry('REPORTS', 'EXPORT', detailParts.join(' | ')).catch(() => {});
  }

  private savePdfWithAudit(doc: any, filename: string, reportName: string, filterLabel?: string): void {
    doc.save(filename);
    this.auditReportExport('PDF', reportName, filterLabel);
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

  private applyStandardPdfFooter(doc: any, options?: { executiveSignatures?: boolean }): void {
    const totalPages = Number(doc?.internal?.getNumberOfPages?.() ?? 1);
    const generatedBy = this.getReportOperatorLabel();
    const timestamp = new Date().toLocaleString('es-VE');
    const executiveSignatures = Boolean(options?.executiveSignatures);
    const signer1Label = executiveSignatures ? 'Gerente' : 'Responsable';
    const signer2Label = executiveSignatures ? 'Presidente' : 'Gerente';
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      const pageWidth = Number(doc?.internal?.pageSize?.getWidth?.() ?? 210);
      const pageHeight = Number(doc?.internal?.pageSize?.getHeight?.() ?? 297);
      // Zona segura para impresión en Carta/A4 (evita recorte por márgenes físicos del driver).
      const safeBottomOffset = 30;
      const signatureLineY = pageHeight - (safeBottomOffset - 6);
      const signatureLabelY = pageHeight - (safeBottomOffset - 10);
      const generatedY = pageHeight - 12;

      if (page === totalPages) {
        // Signature lines only on final page
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.25);
        doc.line(14, signatureLineY, 76, signatureLineY);
        doc.line(92, signatureLineY, 154, signatureLineY);

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(71, 85, 105);
        doc.text(signer1Label, 14, signatureLabelY);
        doc.text(signer2Label, 92, signatureLabelY);
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.text(`Generado por ${generatedBy} | ${timestamp}`, pageWidth / 2, generatedY, { align: 'center' });
      doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - 14, generatedY, { align: 'right' });
    }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'normal');
  }

  private saleTimestamp(s: SaleHistoryEntry): Date {
    const asAny = s as any;
    const candidates = [asAny?.timestamp, asAny?.date, asAny?.created_at, asAny?.createdAt];

    const parseDateLike = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
      }
      if (typeof value?.toDate === 'function') {
        const parsed = value.toDate();
        return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
      }
      if (typeof value === 'number') {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      if (typeof value === 'object' && Number.isFinite(value.seconds)) {
        const parsed = new Date(Number(value.seconds) * 1000);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      if (typeof value === 'string') {
        const raw = value.trim();
        if (!raw) return null;

        const native = new Date(raw);
        if (!Number.isNaN(native.getTime())) return native;

        const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
        if (dmy) {
          const day = Number(dmy[1]);
          const month = Number(dmy[2]) - 1;
          const year = Number(dmy[3]);
          const hh = Number(dmy[4] ?? 0);
          const mm = Number(dmy[5] ?? 0);
          const ss = Number(dmy[6] ?? 0);
          const parsed = new Date(year, month, day, hh, mm, ss, 0);
          return Number.isNaN(parsed.getTime()) ? null : parsed;
        }
      }
      return null;
    };

    for (const candidate of candidates) {
      const parsed = parseDateLike(candidate);
      if (parsed) return parsed;
    }
    return new Date(0);
  }

  private isCountableSale(s: SaleHistoryEntry): boolean {
    if ((s as any).voided) return false;
    if (String((s as any).status ?? '').toUpperCase() === 'VOID') return false;
    return true;
  }

  private startLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  }

  private endLocalDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  }

  private weightedAvgCost(product: ProductStock | undefined): number {
    if (!product?.lotes?.length) return 0;
    let w = 0;
    let tq = 0;
    for (const l of product.lotes) {
      const q = Math.max(0, Number(l.qty) || 0);
      if (q <= 0) continue;
      w += q * (Number(l.costUSD) || 0);
      tq += q;
    }
    if (tq <= 0) return 0;
    return w / tq;
  }

  /** COGS de una línea: lotes despachados en la venta; si falta tramo, costo medio ponderado del SKU en inventario actual. */
  private lineItemCOGS(item: BillingItem, products: ProductStock[]): number {
    const product = products.find(p => p.code === item.code);
    const qty = Math.max(0, Number(item.qty) || 0);
    if (qty <= 0) return 0;

    const lots = item.dispatchLotes;
    if (Array.isArray(lots) && lots.length > 0 && product) {
      let cost = 0;
      let assigned = 0;
      for (const d of lots) {
        const dq = Math.max(0, Number(d.qty) || 0);
        const bid = String(d.batchId ?? '').trim();
        if (!bid || bid === 'N/A') continue;
        const batch = product.lotes?.find(l => String(l.id) === bid);
        if (batch) {
          cost += dq * (Number(batch.costUSD) || 0);
          assigned += dq;
        }
      }
      const remainder = Math.max(0, qty - assigned);
      if (remainder > 1e-6) {
        cost += remainder * this.weightedAvgCost(product);
      }
      return this.roundMoney(cost);
    }
    if (product) return this.roundMoney(qty * this.weightedAvgCost(product));
    return 0;
  }

  private saleTotalCOGS(sale: SaleHistoryEntry, products: ProductStock[]): number {
    let t = 0;
    for (const it of sale.items || []) t += this.lineItemCOGS(it, products);
    return this.roundMoney(t);
  }

  private lineListSubtotalUSD(sale: SaleHistoryEntry): number {
    let s = 0;
    for (const it of sale.items || []) {
      s += this.roundMoney((Number(it.qty) || 0) * (Number(it.priceUSD) || 0));
    }
    return this.roundMoney(s);
  }

  private accumulateSkuFromSale(
    sale: SaleHistoryEntry,
    products: ProductStock[],
    map: Map<string, SkuProfitRow>
  ): void {
    const rev = this.roundMoney(Number(sale.totalUSD ?? 0));
    const lineSum = this.lineListSubtotalUSD(sale);
    const items = sale.items || [];
    const n = items.length;
    for (const it of items) {
      const raw = this.roundMoney((Number(it.qty) || 0) * (Number(it.priceUSD) || 0));
      const alloc =
        lineSum > 0
          ? this.roundMoney(raw * (rev / lineSum))
          : n > 0
            ? this.roundMoney(rev / n)
            : 0;
      const cogs = this.lineItemCOGS(it, products);
      const code = String(it.code ?? '');
      const desc = String(it.description ?? '').slice(0, 80);
      const qty = Number(it.qty) || 0;
      const prev =
        map.get(code) ??
        ({
          code,
          description: desc,
          qtySold: 0,
          revenueUSD: 0,
          costUSD: 0,
          profitUSD: 0
        } as SkuProfitRow);
      prev.qtySold += qty;
      prev.revenueUSD = this.roundMoney(prev.revenueUSD + alloc);
      prev.costUSD = this.roundMoney(prev.costUSD + cogs);
      prev.profitUSD = this.roundMoney(prev.revenueUSD - prev.costUSD);
      map.set(code, prev);
    }
  }

  private saleSliceForProductFilter(
    sale: SaleHistoryEntry,
    products: ProductStock[],
    productQuery?: string
  ): {
    include: boolean;
    revenueUSD: number;
    costUSD: number;
    skuRows: SkuProfitRow[];
  } {
    const normalizedQuery = String(productQuery ?? '').trim().toLowerCase();
    const items = Array.isArray(sale.items) ? sale.items : [];
    if (items.length === 0) {
      return { include: false, revenueUSD: 0, costUSD: 0, skuRows: [] };
    }

    if (!normalizedQuery) {
      const skuMap = new Map<string, SkuProfitRow>();
      this.accumulateSkuFromSale(sale, products, skuMap);
      const revenueUSD = this.roundMoney(Number(sale.totalUSD ?? 0));
      const costUSD = this.saleTotalCOGS(sale, products);
      return { include: true, revenueUSD, costUSD, skuRows: Array.from(skuMap.values()) };
    }

    const lineSum = this.lineListSubtotalUSD(sale);
    const saleRevenue = this.roundMoney(Number(sale.totalUSD ?? 0));
    const factor = lineSum > 0 ? saleRevenue / lineSum : 0;

    let matchedRevenue = 0;
    let matchedCost = 0;
    const skuMap = new Map<string, SkuProfitRow>();

    for (const it of items) {
      const code = String(it.code ?? '').toLowerCase();
      const desc = String(it.description ?? '').toLowerCase();
      if (!code.includes(normalizedQuery) && !desc.includes(normalizedQuery)) continue;

      const qty = Number(it.qty ?? 0) || 0;
      if (qty <= 0) continue;

      const rawLine = this.roundMoney(qty * (Number(it.priceUSD ?? 0) || 0));
      const allocRevenue = lineSum > 0
        ? this.roundMoney(rawLine * factor)
        : this.roundMoney(items.length > 0 ? saleRevenue / items.length : 0);
      const lineCost = this.lineItemCOGS(it, products);
      matchedRevenue = this.roundMoney(matchedRevenue + allocRevenue);
      matchedCost = this.roundMoney(matchedCost + lineCost);

      const skuCode = String(it.code ?? '');
      const skuDesc = String(it.description ?? '').slice(0, 80);
      const prev = skuMap.get(skuCode) ?? {
        code: skuCode,
        description: skuDesc,
        qtySold: 0,
        revenueUSD: 0,
        costUSD: 0,
        profitUSD: 0
      };
      prev.qtySold += qty;
      prev.revenueUSD = this.roundMoney(prev.revenueUSD + allocRevenue);
      prev.costUSD = this.roundMoney(prev.costUSD + lineCost);
      prev.profitUSD = this.roundMoney(prev.revenueUSD - prev.costUSD);
      skuMap.set(skuCode, prev);
    }

    return {
      include: skuMap.size > 0,
      revenueUSD: matchedRevenue,
      costUSD: matchedCost,
      skuRows: Array.from(skuMap.values())
    };
  }

  private profitForSalesInRange(start: Date, end: Date, key: ProfitWindowKey): ProfitWindowSummary {
    return this.profitForFilteredRange({ start, end, key });
  }

  private profitForFilteredRange({
    start,
    end,
    key,
    productQuery,
    label
  }: {
    start: Date;
    end: Date;
    key: ProfitWindowKey;
    productQuery?: string;
    label?: string;
  }): ProfitWindowSummary {
    const products = dataService.getStocks();
    const sales = dataService.getSales().filter((s) => {
      if (!this.isCountableSale(s)) return false;
      const t = this.saleTimestamp(s);
      return t >= start && t <= end;
    });

    let revenueUSD = 0;
    let costUSD = 0;
    const saleRows: SaleProfitRow[] = [];

    const globalSkuMap = new Map<string, SkuProfitRow>();
    let ticketCount = 0;

    for (const sale of sales) {
      const slice = this.saleSliceForProductFilter(sale, products, productQuery);
      if (!slice.include) continue;
      ticketCount += 1;
      const rev = slice.revenueUSD;
      const cogs = slice.costUSD;
      const profit = this.roundMoney(rev - cogs);
      revenueUSD += rev;
      costUSD += cogs;
      saleRows.push({
        correlativo: String(sale.correlativo ?? ''),
        ts: this.saleTimestamp(sale),
        revenueUSD: rev,
        costUSD: cogs,
        profitUSD: profit
      });
      for (const row of slice.skuRows) {
        const prev = globalSkuMap.get(row.code) ?? {
          code: row.code,
          description: row.description,
          qtySold: 0,
          revenueUSD: 0,
          costUSD: 0,
          profitUSD: 0
        };
        prev.qtySold += row.qtySold;
        prev.revenueUSD = this.roundMoney(prev.revenueUSD + row.revenueUSD);
        prev.costUSD = this.roundMoney(prev.costUSD + row.costUSD);
        prev.profitUSD = this.roundMoney(prev.revenueUSD - prev.costUSD);
        globalSkuMap.set(row.code, prev);
      }
    }

    revenueUSD = this.roundMoney(revenueUSD);
    costUSD = this.roundMoney(costUSD);
    const grossProfitUSD = this.roundMoney(revenueUSD - costUSD);
    const marginPct =
      revenueUSD > 0 ? this.roundMoney((grossProfitUSD / revenueUSD) * 10000) / 100 : 0;

    const bySku = Array.from(globalSkuMap.values()).sort((a, b) => b.profitUSD - a.profitUSD);
    const topSales = [...saleRows].sort((a, b) => b.profitUSD - a.profitUSD).slice(0, 25);

    const labels: Record<ProfitWindowKey, string> = {
      today: 'Hoy (día calendario)',
      week: 'Últimos 7 días (incluye hoy)',
      month: 'Mes en curso (del 1 al hoy)'
    };

    return {
      key,
      label: label ?? labels[key],
      start,
      end,
      tickets: ticketCount,
      revenueUSD,
      costUSD,
      grossProfitUSD,
      marginPct,
      bySku,
      topSales
    };
  }

  /** Utilidad bruta por ventas: total facturado (USD) menos COGS según lotes despachados o costo medio del inventario. */
  getProfitWindowSummaries(): {
    today: ProfitWindowSummary;
    week: ProfitWindowSummary;
    month: ProfitWindowSummary;
  } {
    const now = new Date();
    const todayStart = this.startLocalDay(now);
    const todayEnd = this.endLocalDay(now);
    const weekStart = this.startLocalDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
    const monthStart = this.startLocalDay(new Date(now.getFullYear(), now.getMonth(), 1));

    return {
      today: this.profitForSalesInRange(todayStart, todayEnd, 'today'),
      week: this.profitForSalesInRange(weekStart, todayEnd, 'week'),
      month: this.profitForSalesInRange(monthStart, todayEnd, 'month')
    };
  }

  getProfitSummaryByFilter(filter: ProfitReportFilter): ProfitWindowSummary {
    return this.profitForFilteredRange({
      start: filter.start,
      end: filter.end,
      key: 'month',
      productQuery: filter.productQuery,
      label: filter.label ?? 'Periodo personalizado'
    });
  }

  exportProfitPerformanceToPDF(filter?: ProfitReportFilter): void {
    const hasFilter = Boolean(filter);
    const summaries = hasFilter && filter
      ? [this.getProfitSummaryByFilter(filter)]
      : (() => {
          const { today, week, month } = this.getProfitWindowSummaries();
          return [today, week, month];
        })();
    const monthLike = summaries[summaries.length - 1];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageHeight = Number(doc?.internal?.pageSize?.getHeight?.() ?? 297);
    // Reserva de pie para firmas + metadata del footer estándar.
    const footerReserve = 40;
    const contentMaxY = pageHeight - footerReserve;
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('UTILIDAD BRUTA (VENTA VS COSTO)', 14, 20);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(
      'COGS: lotes despachados (dispatchLotes) cuando existen; si no, costo medio ponderado del stock actual.',
      14,
      27
    );
    const periodLabel = hasFilter && filter
      ? `${filter.start.toLocaleDateString('es-VE')} a ${filter.end.toLocaleDateString('es-VE')}`
      : 'Hoy / Ultimos 7 dias / Mes en curso';
    const filterLabel = hasFilter && filter
      ? `Producto: ${String(filter.productQuery ?? '').trim() || 'Todos'}`
      : 'Sin filtros adicionales';
    doc.text(`Periodo: ${periodLabel}`, 14, 32);
    doc.text(`Filtros: ${filterLabel}`, 14, 37);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 42);
    doc.setTextColor(0);

    const winRows = summaries.map((summary) => ([
      summary.label,
      `${summary.start.toLocaleDateString('es-VE')} – ${summary.end.toLocaleDateString('es-VE')}`,
      String(summary.tickets),
      this.formatUSD(summary.revenueUSD),
      this.formatUSD(summary.costUSD),
      this.formatUSD(summary.grossProfitUSD),
      `${summary.marginPct.toFixed(1)} %`
    ]));

    autoTable(doc, {
      startY: 46,
      head: [['Periodo', 'Rango', 'Tickets', 'Venta USD', 'Costo USD', 'Utilidad USD', 'Margen %']],
      body: winRows,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: {
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' }
      }
    });

    const after1 = Number((doc as any).lastAutoTable?.finalY ?? 40) + 10;
    doc.setFontSize(10);
    doc.setTextColor(2, 44, 34);
    doc.text('Top SKU por utilidad (mes en curso)', 14, after1);
    doc.setTextColor(0);

    const skuBody = monthLike.bySku.slice(0, 30).map((r) => [
      r.code,
      r.description.substring(0, 36),
      formatQuantity(r.qtySold),
      this.formatUSD(r.revenueUSD),
      this.formatUSD(r.costUSD),
      this.formatUSD(r.profitUSD)
    ]);
    const skuShown = monthLike.bySku.slice(0, 30);
    const skuTotals = skuShown.reduce(
      (acc, r) => {
        acc.qty += Number(r.qtySold ?? 0) || 0;
        acc.revenue += Number(r.revenueUSD ?? 0) || 0;
        acc.cost += Number(r.costUSD ?? 0) || 0;
        acc.profit += Number(r.profitUSD ?? 0) || 0;
        return acc;
      },
      { qty: 0, revenue: 0, cost: 0, profit: 0 }
    );

    autoTable(doc, {
      startY: after1 + 4,
      head: [['SKU', 'Descripción', 'Cant.', 'Venta asignada', 'Costo', 'Utilidad']],
      body: skuBody.length ? skuBody : [['—', 'Sin ventas en el periodo', '—', '—', '—', '—']],
      foot: skuBody.length
        ? [[
            'TOTAL',
            `${skuShown.length} item[s]`,
            formatQuantity(skuTotals.qty),
            this.formatUSD(skuTotals.revenue),
            this.formatUSD(skuTotals.cost),
            this.formatUSD(skuTotals.profit)
          ]]
        : [],
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7 },
      footStyles: { fillColor: [233, 246, 238], textColor: [0, 0, 0], fontStyle: 'bold' },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: (data: any) => {
        if (data.section === 'foot') {
          if (data.column.index >= 2) data.cell.styles.halign = 'right';
          if (data.column.index === 0) {
            data.cell.styles.halign = 'left';
            // Ajuste visual solicitado: TOTAL 1mm arriba y 2mm más a la izquierda.
            data.cell.styles.cellPadding = { top: 1.5, right: 1, bottom: 1, left: 1 };
          }
        }
      }
    });

    const afterSku = Number((doc as any).lastAutoTable?.finalY ?? after1 + 40) + 8;
    this.renderExecutiveSummaryBox(
      doc,
      afterSku,
      [
        { indicador: 'TOTAL VENDIDO', valor1: this.formatUSD(monthLike.revenueUSD), valor2: '-' },
        { indicador: 'TOTAL UTILIDAD', valor1: this.formatUSD(monthLike.grossProfitUSD), valor2: '-' }
      ],
      { valor1: 'VALOR', valor2: '' }
    );

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `UTILIDAD_BRUTA_${new Date().toISOString().split('T')[0]}.pdf`, 'Utilidad Bruta', filterLabel);
  }

  private renderExecutiveSummaryBox(
    doc: any,
    startY: number,
    rows: Array<{ indicador: string; valor1: string; valor2?: string }>,
    headers?: { valor1?: string; valor2?: string; omitValor2Column?: boolean }
  ) {
    const omitValor2 = Boolean(headers?.omitValor2Column);
    const hasValor1 = Boolean(headers && Object.prototype.hasOwnProperty.call(headers, 'valor1'));
    const hasValor2 = Boolean(headers && Object.prototype.hasOwnProperty.call(headers, 'valor2'));
    const valor1Header = omitValor2
      ? (hasValor1 ? String(headers?.valor1 ?? '') : '')
      : (hasValor1 ? String(headers?.valor1 ?? '') : 'VALOR 1');
    const valor2Header = hasValor2 ? String(headers?.valor2 ?? '') : 'VALOR 2';

    if (omitValor2) {
      autoTable(doc, {
        startY,
        head: [['INDICADOR', valor1Header]],
        body: rows.map((r) => [r.indicador, r.valor1]),
        theme: 'grid',
        tableWidth: 130,
        margin: { left: 14 },
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [0, 0, 0] },
        columnStyles: {
          0: { fontStyle: 'bold' },
          1: { halign: 'right' }
        },
        didParseCell: (data: any) => {
          if (data.section === 'head' && data.column.index === 1) {
            data.cell.styles.halign = 'right';
          }
        }
      });
      return;
    }

    autoTable(doc, {
      startY,
      head: [['INDICADOR', valor1Header, valor2Header]],
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
      },
      didParseCell: (data: any) => {
        if (data.section === 'head' && data.column.index >= 1) {
          data.cell.styles.halign = 'right';
        }
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

  /**
   * @param pricingMode `cost` — suma por lote (qty × costo compra). `sale` — existencia × precio de lista (priceUSD).
   */
  getInventoryOverview(pricingMode: 'cost' | 'sale' = 'cost'): InventoryStats[] {
    const stocks = dataService.getStocks();
    return stocks.map((s) => {
      const lotes = s.lotes || [];
      const totalQty = lotes.reduce((sum, lote) => sum + (Number(lote?.qty ?? 0) || 0), 0);
      const listPrice = Number(s.priceUSD ?? 0) || 0;
      let valueUSD = 0;
      if (pricingMode === 'sale') {
        valueUSD = this.roundMoney(totalQty * listPrice);
      } else {
        valueUSD = lotes.reduce((acc, lote) => {
          const qty = Number(lote?.qty ?? 0) || 0;
          const cost = Number(lote?.costUSD ?? 0) || 0;
          return acc + (qty * cost);
        }, 0);
        valueUSD = this.roundMoney(valueUSD);
      }
      return {
        sku: s.code,
        description: s.description,
        totalQty,
        unit: String(s.unit ?? 'UND').trim() || 'UND',
        valueUSD,
        warehouseDist: {
          galpon: s.d3,
          pesa: s.d2,
          exibicion: s.a1
        }
      };
    });
  }

  getTotalValorization(pricingMode: 'cost' | 'sale' = 'cost'): number {
    return this.getInventoryOverview(pricingMode).reduce((acc, curr) => acc + curr.valueUSD, 0);
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const ledger = dataService.getConsolidatedLedger();
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const timestamps = ledger
      .map((e: any) => (e?.timestamp instanceof Date ? e.timestamp : new Date(e?.timestamp ?? Date.now())))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const periodLabel = timestamps.length > 0
      ? `${timestamps[0].toLocaleDateString('es-VE')} a ${timestamps[timestamps.length - 1].toLocaleDateString('es-VE')}`
      : 'Sin registros';

    // Header
    doc.setFontSize(20);
    doc.setTextColor(2, 44, 34); // Emerald 950
    doc.text('REPORTE: LIBRO MAYOR ANALÍTICO', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text(`Periodo: ${periodLabel}`, 14, 30);
    doc.text('Filtros: Sin filtros adicionales', 14, 35);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 40);

    const tableData = ledger.map(entry => [
      entry.timestamp.toLocaleDateString(),
      entry.type === 'INCOME' ? 'INGRESO' : 'EGRESO',
      entry.category,
      entry.description,
      this.formatUSD(entry.amountUSD)
    ]);

    autoTable(doc, {
      startY: 48,
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

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `LIBRO_MAYOR_${new Date().toISOString().split('T')[0]}.pdf`, 'Libro Mayor');
  }

  /**
   * PDF del mayor analítico por cuenta (debe, haber, saldo acumulado) según filtro actual en Finanzas.
   */
  exportMayorCuentaToPDF(
    rows: MayorCuentaMovimientoRow[],
    context: { fechaDesde: string; fechaHasta: string; cuentaCodigo: string }
  ) {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const periodLabel =
      context.fechaDesde && context.fechaHasta
        ? `${context.fechaDesde} a ${context.fechaHasta}`
        : context.fechaDesde
          ? `Desde ${context.fechaDesde}`
          : context.fechaHasta
            ? `Hasta ${context.fechaHasta}`
            : 'Todo el historial (según límite en servidor)';
    const accountLabel = context.cuentaCodigo?.trim()
      ? `Cuenta: ${context.cuentaCodigo.trim()}`
      : 'Todas las cuentas';

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('REPORTE: LIBRO MAYOR POR CUENTA (SALDO ACUMULADO)', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Periodo: ${periodLabel}`, 14, 25);
    doc.text(accountLabel, 14, 30);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 35);

    const tableData = list.map((r) => [
      r.cuentaContableCodigo,
      (r.cuentaContableNombre || '').slice(0, 42).toUpperCase(),
      r.fecha.toLocaleString('es-VE'),
      r.tipoOperacion,
      (r.descripcionAsiento || '').slice(0, 48).toUpperCase(),
      r.debe.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      r.haber.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      r.saldoAcumulado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    ]);

    autoTable(doc, {
      startY: 42,
      head: [[
        'CUENTA', 'NOMBRE', 'FECHA', 'T.OP.', 'DESCRIPCIÓN', 'DEBE', 'HABER', 'SALDO ACUM.'
      ]],
      body: tableData.length > 0 ? tableData : [['—', 'Sin movimientos en el filtro', '', '', '', '', '', '']],
      theme: 'grid',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 6.5, cellPadding: 1.2 },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' }
      }
    });

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(
      doc,
      `MAYOR_CUENTA_${new Date().toISOString().split('T')[0]}.pdf`,
      'Libro Mayor por cuenta'
    );
  }

  exportGeneralOperationsToPDF(
    rows: Array<{
      date: string;
      time: string;
      type: string;
      typeLabel: string;
      correlativo: string;
      entity: string;
      description: string;
      amountUSD: number;
      amountVES: number;
      method: string;
      status: string;
    }>,
    context: { dateRange: { start: string; end: string }; filterLabel?: string }
  ): void {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = this.roundMoney(list.reduce((sum, r) => sum + (Number(r?.amountUSD ?? 0) || 0), 0));
    const totalVES = this.roundMoney(list.reduce((sum, r) => sum + (Number(r?.amountVES ?? 0) || 0), 0));

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('VISION GENERAL CONTABLE - LIBRO DE OPERACIONES', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Periodo: ${context?.dateRange?.start || '-'} a ${context?.dateRange?.end || '-'}`, 14, 22);
    doc.text(`Filtros: ${String(context?.filterLabel ?? '').trim() || 'Sin filtros adicionales'}`, 14, 27);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 32);

    const body = list.map((row) => ([
      `${String(row.date ?? '')} ${String(row.time ?? '')}`.trim(),
      String(row.typeLabel ?? row.type ?? ''),
      String(row.correlativo ?? ''),
      String(row.entity ?? '').slice(0, 28),
      String(row.description ?? '').slice(0, 36),
      this.formatNumber(Number(row.amountUSD ?? 0), 2),
      this.formatNumber(Number(row.amountVES ?? 0), 2),
      String(row.method ?? ''),
      String(row.status ?? '')
    ]));

    autoTable(doc, {
      startY: 37,
      head: [['FECHA/HORA', 'TIPO', 'CORRELATIVO', 'ENTIDAD', 'DESCRIPCION', 'USD', 'VES', 'METODO', 'ESTADO']],
      body: body.length ? body : [['-', 'Sin registros', '-', '-', '-', '0.00', '0.00', '-', '-']],
      foot: [['', '', '', '', 'NETO', this.formatNumber(totalUSD, 2), this.formatNumber(totalVES, 2), '', '']],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: {
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right', fontStyle: 'bold' },
        8: { halign: 'center' }
      }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(
      doc,
      summaryY,
      [
        { indicador: 'MOVIMIENTOS', valor1: String(list.length) },
        { indicador: 'TOTAL USD', valor1: this.formatUSD(totalUSD) },
        { indicador: 'TOTAL BS', valor1: this.formatVES(totalVES) }
      ],
      { valor1: '', omitValor2Column: true }
    );

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `VISION_GENERAL_CONTABLE_${new Date().toISOString().split('T')[0]}.pdf`, 'Vision General Contable', String(context?.filterLabel ?? '').trim());
  }

  async exportARStatementToPDF(
    clientId: string,
    options?: { entries?: any[]; filterNote?: string }
  ): Promise<void> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const cid = String(clientId ?? '').trim();
    const allForClient = dataService.getAREntries().filter(e => String(e.customerId) === cid);
    const hasExplicitList = Array.isArray(options?.entries);
    const clientEntries = hasExplicitList
      ? (options!.entries as any[]).filter((e: any) => String(e?.customerId ?? '').trim() === cid)
      : allForClient;

    if (clientEntries.length === 0) {
      if (allForClient.length === 0) return;
      const clientNameEmpty = allForClient[0]?.customerName ?? 'Cliente';
      doc.setFontSize(14);
      doc.setTextColor(2, 44, 34);
      doc.text('ESTADO DE CUENTA: CLIENTE ESPECIAL', 14, 22);
      doc.setFontSize(11);
      doc.text(String(clientNameEmpty).toUpperCase(), 14, 32);
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(
        'No hay facturas de este cliente en la vista actual (estado, fechas o búsqueda).',
        14,
        44
      );
      doc.setTextColor(0);
      if (options?.filterNote?.trim()) {
        doc.setFontSize(8);
        doc.text(`Filtros: ${options.filterNote.trim()}`, 14, 52);
      }
      this.applyStandardPdfFooter(doc, { executiveSignatures: true });
      this.savePdfWithAudit(doc, `EDC_${String(clientNameEmpty).replace(/ /g, '_')}_SIN_VISTA.pdf`, `Estado de Cuenta Cliente: ${String(clientNameEmpty)}`);
      return;
    }

    const clientName = clientEntries[0].customerName;
    const now = new Date().toLocaleDateString();
    const generatedBy = this.getReportOperatorLabel();
    const filterNote = String(options?.filterNote ?? '').trim();
    const hasFilterNote = Boolean(filterNote);
    const periodDates = clientEntries
      .map((e: any) => (e?.timestamp instanceof Date ? e.timestamp : new Date(e?.timestamp ?? Date.now())))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const periodLabel = periodDates.length > 0
      ? `${periodDates[0].toLocaleDateString('es-VE')} a ${periodDates[periodDates.length - 1].toLocaleDateString('es-VE')}`
      : 'Sin registros';

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('ESTADO DE CUENTA: CLIENTE ESPECIAL', 14, 22);
    doc.setFontSize(12);
    doc.text(clientName.toUpperCase(), 14, 32);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Periodo: ${periodLabel}`, 14, 38);
    doc.text(`Filtros: ${hasFilterNote ? filterNote : 'Sin filtros adicionales'}`, 14, 43);
    doc.text(`Generado por: ${generatedBy} | Fecha de Emisión: ${now}`, 14, 48);

    const tableStartY = 54;

    const tableData = clientEntries.map(e => [
      e.timestamp.toLocaleDateString(),
      e.saleCorrelativo,
      e.dueDate.toLocaleDateString(),
      this.formatUSD(e.amountUSD),
      this.formatUSD(e.balanceUSD),
      e.status === 'PAID' ? 'LIQUIDADO' : (new Date() > e.dueDate ? 'VENCIDO' : 'PENDIENTE')
    ]);

    autoTable(doc, {
      startY: tableStartY,
      head: [['FECHA', 'FAC #', 'VENCIMIENTO', 'MONTO', 'SALDO', 'ESTADO']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34] },
      columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
    });

    const afterInvoicesY = Number((doc as any).lastAutoTable?.finalY ?? tableStartY) + 10;
    doc.setFontSize(10);
    doc.setTextColor(2, 44, 34);
    doc.text('DETALLE DE ABONOS (PAGOS REGISTRADOS)', 14, afterInvoicesY);
    doc.setTextColor(0);

    type PayRow = { ts: number; cells: string[] };
    const payRows: PayRow[] = [];
    const pairs = await Promise.all(
      clientEntries.map(async (e) => {
        const pays = await dataService.getARPayments(e.id);
        return pays.map(p => ({ e, p }));
      })
    );
    for (const group of pairs) {
      for (const { e, p } of group) {
        const created = p.createdAt ? new Date(p.createdAt as string) : new Date();
        const ts = Number.isFinite(created.getTime()) ? created.getTime() : 0;
        const correl = String(p.saleCorrelativo || e.saleCorrelativo || '');
        const useVes = p.currency === 'VES' && (Number(p.amountVES ?? 0) || 0) > 0;
        const amountCell = useVes
          ? this.formatVES(Number(p.amountVES ?? 0))
          : this.formatUSD(Number(p.amountUSD ?? 0));
        const bankRef = [p.bank, p.reference].filter(Boolean).join(' / ').slice(0, 44);
        payRows.push({
          ts,
          cells: [
            created.toLocaleDateString('es-VE'),
            correl,
            amountCell,
            String(p.method || ''),
            bankRef,
            String(p.note || '').slice(0, 52)
          ]
        });
      }
    }
    payRows.sort((a, b) => b.ts - a.ts);
    const paymentBody = payRows.map(r => r.cells);

    autoTable(doc, {
      startY: afterInvoicesY + 4,
      head: [['FECHA', 'FACTURA', 'ABONO', 'MÉTODO', 'BANCO / REF.', 'NOTA']],
      body: paymentBody.length > 0 ? paymentBody : [['—', '—', '—', '—', 'Sin abonos registrados', '']],
      theme: 'striped',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [2, 44, 34] },
      columnStyles: { 2: { halign: 'right' } }
    });

    const totalDue = clientEntries.reduce((a, b) => a + Number(b.balanceUSD ?? 0), 0);
    const finalY = Number((doc as any).lastAutoTable?.finalY ?? afterInvoicesY) + 10;
    doc.setFontSize(12);
    doc.setTextColor(220, 38, 38);
    const dueLabel = hasFilterNote
      ? `SALDO EN ESTA VISTA: ${this.formatUSD(totalDue)}`
      : `SALDO TOTAL EXIGIBLE: ${this.formatUSD(totalDue)}`;
    doc.text(dueLabel, 110, finalY);
    doc.setTextColor(0);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    const summaryRows: Array<{ indicador: string; valor1: string; valor2?: string }> = [
      {
        indicador: hasFilterNote ? 'FACTURAS EN ESTE PDF' : 'FACTURAS DEL CLIENTE',
        valor1: String(clientEntries.length)
      },
      {
        indicador: hasFilterNote ? 'ABONOS (FACTURAS LISTADAS)' : 'ABONOS REGISTRADOS',
        valor1: String(payRows.length)
      },
      { indicador: hasFilterNote ? 'SALDO EN ESTA VISTA' : 'SALDO EXIGIBLE', valor1: this.formatUSD(totalDue) },
      { indicador: 'CLIENTE', valor1: clientName.toUpperCase() }
    ];
    if (hasFilterNote) {
      summaryRows.splice(1, 0, {
        indicador: 'VISTA / FILTROS',
        valor1: filterNote.length > 90 ? `${filterNote.slice(0, 87)}…` : filterNote
      });
    }
    this.renderExecutiveSummaryBox(doc, summaryY, summaryRows);

    const fileSuffix = hasFilterNote ? '_VISTA_FILTRADA' : '';
    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `EDC_${clientName.replace(/ /g, '_')}${fileSuffix}.pdf`, `Estado de Cuenta Cliente: ${clientName}`, filterNote);
  }

  exportARGlobalToPDF(arEntries: any[], options?: { filterLabel?: string }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const dates = (Array.isArray(arEntries) ? arEntries : [])
      .map((e: any) => {
        const raw = e?.timestamp ?? e?.createdAt ?? null;
        return raw instanceof Date ? raw : new Date(raw ?? Date.now());
      })
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const periodLabel = dates.length > 0
      ? `${dates[0].toLocaleDateString('es-VE')} a ${dates[dates.length - 1].toLocaleDateString('es-VE')}`
      : 'Sin registros';
    doc.setFontSize(18); doc.setTextColor(2, 44, 34);
    doc.text('CARTERA AR — CUENTAS POR COBRAR', 14, 22);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Periodo: ${periodLabel}`, 14, 30);
    const filterLabel = String(options?.filterLabel ?? '').trim() || 'Sin filtros adicionales';
    doc.text(`Filtros: ${filterLabel}`, 14, 35);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 40);

    const totalBalance = arEntries.filter(e => e.status !== 'PAID').reduce((a: number, b: any) => a + Number(b.balanceUSD ?? 0), 0);
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`TOTAL POR COBRAR: ${this.formatUSD(totalBalance)}`, 14, 46);

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
      startY: 52,
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

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `AR_GLOBAL_${new Date().toISOString().split('T')[0]}.pdf`, 'CxC Global', filterLabel);
  }

  exportCompanyLoansToPDF(loans: any[], arLoanEntries?: any[]) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = Number(doc?.internal?.pageSize?.getWidth?.() ?? 297);
    const leftRightMargin = 10;
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const list = Array.isArray(loans) ? loans : [];
    const arList = Array.isArray(arLoanEntries) ? arLoanEntries : [];
    const openLoans = list.filter((l: any) => String(l?.status ?? '').toUpperCase() !== 'PAID' && String(l?.status ?? '').toUpperCase() !== 'VOID');
    const paidLoans = list.filter((l: any) => String(l?.status ?? '').toUpperCase() === 'PAID');
    const today = new Date();
    const overdueLoans = openLoans.filter((l: any) => {
      const due = new Date(l?.dueDate ?? Date.now());
      return !Number.isNaN(due.getTime()) && due < today;
    });

    const principalTotal = list.reduce((s: number, l: any) => s + (Number(l?.principalUSD ?? 0) || 0), 0);
    const openBalance = openLoans.reduce((s: number, l: any) => s + (Number(l?.balanceUSD ?? 0) || 0), 0);
    const recovered = Math.max(0, principalTotal - openBalance);
    const employeeOpen = openLoans
      .filter((l: any) => String(l?.beneficiaryType ?? '').toUpperCase() !== 'PARTNER')
      .reduce((s: number, l: any) => s + (Number(l?.balanceUSD ?? 0) || 0), 0);
    const partnerOpen = openLoans
      .filter((l: any) => String(l?.beneficiaryType ?? '').toUpperCase() === 'PARTNER')
      .reduce((s: number, l: any) => s + (Number(l?.balanceUSD ?? 0) || 0), 0);

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('CARTERA DE PRESTAMOS INTERNOS', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 24);
    doc.text(`Registros prestamos: ${list.length} | Documentos CxC vinculados en vista: ${arList.length}`, 14, 29);

    autoTable(doc, {
      startY: 34,
      head: [['INDICADOR', 'VALOR']],
      body: [
        ['Total prestado (historico)', this.formatUSD(principalTotal)],
        ['Saldo abierto', this.formatUSD(openBalance)],
        ['Recuperado', this.formatUSD(recovered)],
        ['Prestamos abiertos', String(openLoans.length)],
        ['Prestamos vencidos', String(overdueLoans.length)],
        ['Saldo abierto trabajadores', this.formatUSD(employeeOpen)],
        ['Saldo abierto socios', this.formatUSD(partnerOpen)],
        ['Prestamos liquidados', String(paidLoans.length)]
      ],
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255] },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } }
    });

    const rows = list.map((l: any) => {
      const due = new Date(l?.dueDate ?? Date.now());
      const isOverdue = String(l?.status ?? '').toUpperCase() !== 'PAID' && String(l?.status ?? '').toUpperCase() !== 'VOID' && !Number.isNaN(due.getTime()) && due < today;
      const statusRaw = String(l?.status ?? 'PENDING').toUpperCase();
      const statusLabel =
        statusRaw === 'PAID' ? 'PAGADO'
        : statusRaw === 'PARTIAL' ? 'PARCIAL'
        : statusRaw === 'PENDING' ? 'PENDIENTE'
        : statusRaw === 'VOID' ? 'ANULADO'
        : statusRaw;
      const principal = Number(l?.principalUSD ?? 0) || 0;
      const balance = Number(l?.balanceUSD ?? 0) || 0;
      const recoveredLoan = Math.max(0, principal - balance);
      const typeLabel = String(l?.beneficiaryType ?? '').toUpperCase() === 'PARTNER' ? 'SOCIO' : 'TRABAJADOR';
      return [
        String(l?.loanCorrelativo ?? l?.id ?? ''),
        typeLabel,
        String(l?.beneficiaryName ?? '').toUpperCase(),
        String(l?.beneficiaryId ?? ''),
        this.formatUSD(principal),
        this.formatUSD(balance),
        this.formatUSD(recoveredLoan),
        due.toLocaleDateString('es-VE'),
        isOverdue ? 'VENCIDO' : statusLabel,
        String(l?.sourceBankName ?? l?.sourceMethod ?? '').slice(0, 28)
      ];
    });

    autoTable(doc, {
      startY: Number((doc as any).lastAutoTable?.finalY ?? 64) + 6,
      margin: { left: leftRightMargin, right: leftRightMargin },
      tableWidth: pageWidth - (leftRightMargin * 2),
      head: [['PRESTAMO', 'TIPO', 'BENEFICIARIO', 'CI/RIF', 'MONTO', 'SALDO', 'RECUPERADO', 'VENCE', 'ESTADO', 'ORIGEN']],
      body: rows.length > 0 ? rows : [['—', '—', 'SIN PRESTAMOS REGISTRADOS', '', '', '', '', '', '', '']],
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: {
        2: { cellWidth: 40 },
        3: { cellWidth: 20 },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
        7: { halign: 'center' },
        8: { halign: 'center', cellWidth: 18 },
        9: { cellWidth: 28 }
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 8 && data.cell.raw === 'VENCIDO') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        }
      }
    });

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `PRESTAMOS_INTERNOS_${new Date().toISOString().split('T')[0]}.pdf`, 'Cartera Prestamos Internos');
  }

  exportAPGlobalToPDF(apEntries: any[], options?: { filterLabel?: string }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const dates = (Array.isArray(apEntries) ? apEntries : [])
      .map((e: any) => {
        const raw = e?.timestamp ?? e?.createdAt ?? null;
        return raw instanceof Date ? raw : new Date(raw ?? Date.now());
      })
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const periodLabel = dates.length > 0
      ? `${dates[0].toLocaleDateString('es-VE')} a ${dates[dates.length - 1].toLocaleDateString('es-VE')}`
      : 'Sin registros';
    doc.setFontSize(18); doc.setTextColor(100, 20, 20);
    doc.text('CUENTAS POR PAGAR', 14, 22);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Periodo: ${periodLabel}`, 14, 30);
    const filterLabel = String(options?.filterLabel ?? '').trim() || 'Sin filtros adicionales';
    doc.text(`Filtros: ${filterLabel}`, 14, 35);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 40);

    const totalBalance = apEntries.filter(e => e.status !== 'PAID').reduce((a: number, b: any) => a + Number(b.balanceUSD ?? 0), 0);
    doc.setFontSize(11); doc.setTextColor(0);
    doc.text(`TOTAL POR PAGAR: ${this.formatUSD(totalBalance)}`, 14, 46);

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
      startY: 52,
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

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `AP_GLOBAL_${new Date().toISOString().split('T')[0]}.pdf`, 'CxP Global', filterLabel);
  }

  exportMarginReportToPDF(filters?: {
    productQuery?: string;
    batchQuery?: string;
    dateRange?: { start?: string; end?: string };
  }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const stocks = dataService.getStocks();
    const movements = dataService.getMovements();
    const sales = dataService.getSales();
    const productQuery = String(filters?.productQuery ?? '').trim().toLowerCase();
    const batchQuery = String(filters?.batchQuery ?? '').trim().toLowerCase();
    const periodStart = String(filters?.dateRange?.start ?? '').trim();
    const periodEnd = String(filters?.dateRange?.end ?? '').trim();
    const parseDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const rangeStartRaw = periodStart ? parseDate(`${periodStart}T00:00:00`) : null;
    const rangeEndRaw = periodEnd ? parseDate(`${periodEnd}T23:59:59`) : null;
    const rangeStart = rangeStartRaw && rangeEndRaw && rangeStartRaw > rangeEndRaw ? rangeEndRaw : rangeStartRaw;
    const rangeEnd = rangeStartRaw && rangeEndRaw && rangeStartRaw > rangeEndRaw ? rangeStartRaw : rangeEndRaw;
    const inPeriod = (value: any): boolean => {
      const d = parseDate(value);
      if (!d) return false;
      if (rangeStart && d < rangeStart) return false;
      if (rangeEnd && d > rangeEnd) return false;
      return true;
    };
    const soldQtyBySkuBatch = new Map<string, number>();

    sales.forEach((sale: any) => {
      if ((sale as any)?.voided) return;
      if (String((sale as any)?.status ?? '').toUpperCase() === 'VOID') return;
      if (!inPeriod((sale as any)?.timestamp)) return;
      const items = Array.isArray(sale?.items) ? sale.items : [];
      items.forEach((item: any) => {
        const sku = String(item?.code ?? '').trim();
        const lotes = Array.isArray(item?.dispatchLotes) ? item.dispatchLotes : [];
        lotes.forEach((lot: any) => {
          const batchId = String(lot?.batchId ?? '').trim();
          const qty = Math.abs(Number(lot?.qty ?? 0) || 0);
          if (!sku || !batchId || qty <= 0) return;
          const key = `${sku}|${batchId}`;
          soldQtyBySkuBatch.set(key, (soldQtyBySkuBatch.get(key) || 0) + qty);
        });
      });
    });
    const rows: any[] = [];
    let totalOnHandCostUSD = 0;
    let totalRevenueUSD = 0;
    let totalSoldProfitUSD = 0;
    let weightedMarginNumerator = 0;
    let weightedMarginDenominator = 0;
    stocks.forEach(product => {
      ((product as any).lotes || []).forEach((batch: any) => {
        const sku = String(product.code ?? '');
        const description = String(product.description ?? '');
        const batchId = String(batch.id ?? batch.lote ?? '');
        if (productQuery && !sku.toLowerCase().includes(productQuery) && !description.toLowerCase().includes(productQuery)) return;
        if (batchQuery && !batchId.toLowerCase().includes(batchQuery)) return;

        const unitCost = Number(batch.costUSD || 0);
        const qty = Number(batch.quantity ?? batch.qty ?? 0);
        if (unitCost <= 0) return;
        const price = Number(product.priceUSD || 0);
        const margin = price > 0 ? ((price - unitCost) / price) * 100 : 0;
        const soldByDispatch = soldQtyBySkuBatch.get(`${sku}|${batchId}`) || 0;
        const soldByMovements = movements
          .filter((m: any) => m.sku === sku && String(m.batchId ?? '') === batchId && inPeriod((m as any)?.timestamp))
          .filter((m: any) => m.type === 'SALE' || m.type === 'VENTA')
          .reduce((sum: number, m: any) => sum + Math.abs(Number(m.qty || 0)), 0);
        const soldBySkuFallback = movements
          .filter((m: any) => m.sku === sku && (m.type === 'SALE' || m.type === 'VENTA') && inPeriod((m as any)?.timestamp))
          .reduce((sum: number, m: any) => sum + Math.abs(Number(m.qty || 0)), 0);
        const soldQty = soldByDispatch > 0 ? soldByDispatch : (soldByMovements > 0 ? soldByMovements : soldBySkuFallback);
        const revenueUSD = soldQty * price;
        const soldProfitUSD = soldQty * (price - unitCost);
        const onHandCostUSD = unitCost * qty;
        totalOnHandCostUSD += onHandCostUSD;
        totalRevenueUSD += revenueUSD;
        totalSoldProfitUSD += soldProfitUSD;
        weightedMarginNumerator += margin * Math.max(0, qty);
        weightedMarginDenominator += Math.max(0, qty);
        rows.push([
          product.code,
          description.substring(0, 30),
          this.formatNumber(qty, 2),
          `$ ${this.formatNumber(unitCost, 3)}`,
          `$ ${this.formatNumber(price, 3)}`,
          `${this.formatNumber(margin, 1)}%`,
          this.formatNumber(soldQty, 2),
          `$ ${this.formatNumber(revenueUSD, 2)}`,
          `$ ${this.formatNumber(soldProfitUSD, 2)}`
        ]);
      });
    });
    rows.sort((a, b) => parseFloat(b[5]) - parseFloat(a[5]));

    const marginReportTitle = productQuery && !batchQuery
      ? 'REPORTE DE MÁRGENES POR PRODUCTO'
      : (batchQuery && !productQuery
        ? 'REPORTE DE MÁRGENES POR LOTE'
        : (productQuery && batchQuery
          ? 'REPORTE DE MÁRGENES POR PRODUCTO Y LOTE'
          : 'REPORTE DE MÁRGENES POR LOTE'));
    doc.setFontSize(18); doc.setTextColor(2, 44, 34);
    doc.text(marginReportTitle, 14, 22);
    const periodLabel = rangeStart && rangeEnd
      ? `${rangeStart.toLocaleDateString('es-VE')} a ${rangeEnd.toLocaleDateString('es-VE')}`
      : 'Corte actual (inventario y ventas acumuladas)';
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Periodo: ${periodLabel}`, 14, 30);
    const marginFilterLabel = [
      `Producto: ${productQuery || 'Todos'}`,
      `Lote: ${batchQuery || 'Todos'}`
    ].join(' | ');
    doc.text(`Filtros: ${marginFilterLabel}`, 14, 35);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 40);

    autoTable(doc, {
      startY: 45,
      head: [['SKU', 'DESCRIPCIÓN', 'STOCK', 'COSTO UNIT.', 'P. VENTA', 'MARGEN %', 'VENDIDO', 'TOTAL $', 'UTILIDAD $']],
      body: rows,
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255,255,255], fontStyle: 'bold' },
      styles: { fontSize: 7.5 },
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' },
        8: { halign: 'right', fontStyle: 'bold' }
      }
    });

    const avgMargin = weightedMarginDenominator > 0
      ? weightedMarginNumerator / weightedMarginDenominator
      : 0;
    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'LOTES EVALUADOS', valor1: String(rows.length) },
      { indicador: 'MARGEN PROMEDIO POND.', valor1: `${avgMargin.toFixed(2)} %` },
      { indicador: 'COSTO EXISTENCIA', valor1: this.formatUSD(totalOnHandCostUSD) },
      { indicador: 'TOTAL VENDIDO HIST.', valor1: this.formatUSD(totalRevenueUSD) },
      { indicador: 'UTILIDAD VENDIDA', valor1: this.formatUSD(totalSoldProfitUSD) }
    ]);

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `MARGENES_${new Date().toISOString().split('T')[0]}.pdf`, 'Margenes', marginFilterLabel);
  }

  exportZClosureToPDF(
    data: {
      date: string;
      totals: { usd: number; ves: number };
      counts: {
        total: number;
        credit?: number;
        cash?: number;
        withoutBreakdown?: number;
        voidedExcluded?: number;
      };
      byMethod: Record<string, { count: number; usd: number; ves: number }>;
      methodDetailGroups?: Array<{
        method: string;
        rows: Array<{
          date: string;
          time: string;
          correlativo: string;
          client: string;
          cashier: string;
          lineUSD: number;
          lineVES: number;
        }>;
        totals: { count: number; usd: number; ves: number };
      }>;
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
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageHeight = Number(doc?.internal?.pageSize?.getHeight?.() ?? 297);
    const footerReserve = 40;
    const contentMaxY = pageHeight - footerReserve;
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();

    doc.setFontSize(20); doc.setTextColor(2, 44, 34);
    doc.text('CIERRE DE CAJA Z', 14, 22);
    doc.setFontSize(11); doc.setTextColor(50);
    doc.text(`Fecha: ${data.date}`, 14, 32);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Periodo: ${data.date}`, 14, 38);
    doc.text(`Cajero: ${cashierLabel}`, 14, 43);
    if (filterLabel.trim()) {
      doc.text(`Filtros: ${filterLabel}`, 14, 48);
      doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 53);
    } else {
      doc.text('Filtros: Sin filtros adicionales', 14, 48);
      doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 53);
    }

    doc.setFontSize(12); doc.setTextColor(0);
    const totalsStartY = 65;
    doc.text(`TOTAL USD:  ${this.formatUSD(data.totals.usd)}`, 14, totalsStartY);
    doc.text(`TOTAL Bs:  ${this.formatVES(data.totals.ves)}`, 14, totalsStartY + 7);
    doc.text(`OPERACIONES: ${data.counts.total}`, 14, totalsStartY + 14);
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `Contado: ${Number(data.counts.cash ?? 0)} | Credito: ${Number(data.counts.credit ?? 0)} | Sin desglose: ${Number(data.counts.withoutBreakdown ?? 0)}`,
      14,
      totalsStartY + 20
    );
    if (Number(data.counts.voidedExcluded ?? 0) > 0) {
      doc.setTextColor(180, 83, 9);
      doc.text(`ANULADAS EXCLUIDAS: ${Number(data.counts.voidedExcluded ?? 0)}`, 14, totalsStartY + 26);
      doc.setTextColor(0);
    }

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

    const methodDetailGroups = Array.isArray(data.methodDetailGroups) ? data.methodDetailGroups : [];
    if (methodDetailGroups.length > 0) {
      let detailStartY = Number((doc as any).lastAutoTable?.finalY ?? (filterLabel.trim() ? 82 : 77)) + 8;
      methodDetailGroups.forEach((group, idx) => {
        if (detailStartY > (contentMaxY - 34)) {
          doc.addPage();
          detailStartY = 20;
        }
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.text(
          `METODO: ${String(group.method ?? '').toUpperCase()} | REGISTROS: ${Number(group?.totals?.count ?? 0)} | TOTAL $: ${this.formatNumber(Number(group?.totals?.usd ?? 0), 2)} | TOTAL Bs: ${this.formatNumber(Number(group?.totals?.ves ?? 0), 2)}`,
          14,
          detailStartY
        );

        const groupRows = (Array.isArray(group.rows) ? group.rows : []).map((row) => [
          String(row.correlativo ?? 'N/D'),
          String(row.client ?? 'N/D').substring(0, 26),
          String(row.cashier ?? 'Sin cajero').substring(0, 22),
          this.formatUSD(Number(row.lineUSD ?? 0)),
          this.formatVES(Number(row.lineVES ?? 0))
        ]);

        autoTable(doc, {
          startY: detailStartY + 3,
          head: [['FACTURA', 'CLIENTE', 'CAJERO', 'MONTO $', 'MONTO Bs']],
          body: groupRows.length > 0 ? groupRows : [['-', 'Sin registros', '-', '$ 0.00', 'Bs 0.00']],
          theme: 'grid',
          headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255], fontStyle: 'bold' },
          styles: { fontSize: 8 },
          columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' } }
        });
        detailStartY = Number((doc as any).lastAutoTable?.finalY ?? detailStartY + 20) + 7;
        if (idx < methodDetailGroups.length - 1 && detailStartY > (contentMaxY - 22)) {
          doc.addPage();
          detailStartY = 20;
        }
      });
    }

    const cashierSections = Array.isArray(data.byCashierSummaries) ? data.byCashierSummaries : [];
    if (cashierSections.length > 0) {
      let sectionY = ((doc as any).lastAutoTable?.finalY ?? (filterLabel.trim() ? 82 : 77)) + 10;
      cashierSections.forEach((cashier, idx) => {
        const needsNewPage = sectionY > (contentMaxY - 34);
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
        if (idx < cashierSections.length - 1 && sectionY > (contentMaxY - 24)) {
          doc.addPage();
          sectionY = 20;
        }
      });
    }

    if (data.variance.hasDeclaration) {
      let finalY = ((doc as any).lastAutoTable?.finalY ?? 90) + 12;
      if (finalY > (contentMaxY - 12)) {
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
      { indicador: 'FACTURAS CONTADO', valor1: String(Number(data.counts.cash ?? 0)) },
      { indicador: 'FACTURAS CREDITO', valor1: String(Number(data.counts.credit ?? 0)) },
      { indicador: 'SIN DESGLOSE', valor1: String(Number(data.counts.withoutBreakdown ?? 0)) },
      ...(Number(data.counts.voidedExcluded ?? 0) > 0
        ? [{ indicador: 'ANULADAS EXCLUIDAS', valor1: String(Number(data.counts.voidedExcluded ?? 0)) }]
        : []),
      { indicador: 'TOTAL CONTADO/CREDITO USD', valor1: this.formatUSD(Number(data.totals.usd ?? 0)) },
      { indicador: 'TOTAL Bs', valor1: this.formatVES(Number(data.totals.ves ?? 0)) }
    ]);

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `CIERRE_Z_${data.date}.pdf`, 'Cierre Z', `Fecha: ${String(data.date ?? '')}`);
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
      netUSD?: number;
    }>,
    date: string,
    cashierLabel: string,
    mode: 'Bs' | 'USD' | 'MIXED' = 'MIXED',
    filterLabel: string = ''
  ) {
    if (!Array.isArray(rows) || rows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = rows.reduce((acc, row) => acc + this.normalizeMoney(row.paymentUSD), 0);
    const totalVES = rows.reduce((acc, row) => acc + this.normalizeMoney(row.paymentVES), 0);
    const totalEquivalentUSD = rows.reduce((acc, row) => acc + this.normalizeMoney(row.equivalentUSD), 0);
    const totalNetUSD = rows.reduce((acc, row) => {
      const explicitNet = this.normalizeMoney((row as any).netUSD);
      if (explicitNet > 0) return acc + explicitNet;
      const rate = Number(row.rateUsed ?? 0) || 0;
      const usd = this.normalizeMoney(row.paymentUSD);
      const vesToUsd = rate > 0 ? (this.normalizeMoney(row.paymentVES) / rate) : 0;
      return acc + usd + vesToUsd;
    }, 0);

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('FACTURACION POR CAJERO - DETALLE DE COBRO', 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Fecha reporte: ${date} | Cajero: ${cashierLabel}`, 14, 25);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 30);
    doc.text(`Total lineas: ${rows.length}`, 14, 35);
    if (filterLabel.trim()) {
      doc.text(`Filtro aplicado: ${filterLabel}`, 14, 40);
    }

    const head = mode === 'USD'
      ? [['FECHA', 'CAJERO', 'FACTURA', 'CLIENTE', 'METODO', 'REFERENCIA', 'MONTO USD']]
      : [['FECHA', 'CAJERO', 'FACTURA', 'CLIENTE', 'METODO', 'REFERENCIA', 'MONTO BS', 'TASA USADA', 'MONTO USD']];

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
      { indicador: 'TOTAL Bs', valor1: this.formatVES(totalVES), valor2: `${this.formatUSD(totalNetUSD)} neto USD` }
    ], {
      valor1: 'REAL FACTURADO',
      valor2: 'TOTAL FACTURADO'
    });

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `FACTURACION_CAJERO_DETALLE_${date}.pdf`, 'Factura por Cajero (Detalle)', `Fecha: ${date} | Cajero: ${cashierLabel}`);
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
      amountUSD?: number;
      amountVES: number;
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
      mode: 'USD' | 'Bs' | 'MIXED';
    }
  ) {
    if (!Array.isArray(rows) || rows.length === 0) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const round = (value: any) => this.roundMoney(Number(value ?? 0) || 0);

    const totalMovementVES = rows.reduce((acc, row) => acc + round(row.amountVES), 0);
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

    const head = context.mode === 'Bs'
      ? [[
          'FECHA', 'BANCO/CUENTA', 'TIPO', 'FACTURA', 'CLIENTE', 'METODO', 'CAJERO', 'REFERENCIA', 'MOV Bs'
        ]]
      : [[
          'FECHA', 'BANCO/CUENTA', 'TIPO', 'FACTURA', 'CLIENTE', 'METODO', 'CAJERO', 'REFERENCIA', 'MOV Bs'
        ]];

    const body = context.mode === 'Bs'
      ? rows.map((row) => [
          `${String(row.date ?? '')} ${String(row.time ?? '')}`.trim(),
          `${String(row.bankName ?? '')} / ${String(row.accountLabel ?? '')} (${String(row.accountId ?? '')})`,
          String(row.sourceLabel ?? ''),
          String(row.correlativo ?? ''),
          String(row.customerName ?? ''),
          String(row.method ?? ''),
          String(row.cashier ?? ''),
          String(row.reference ?? ''),
          sign(round(row.amountVES))
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
          sign(round(row.amountVES))
        ]);

    const foot = context.mode === 'Bs'
      ? [[
          '', '', '', '', '', '', '', 'TOTAL',
          sign(totalMovementVES)
        ]]
      : [[
          '', '', '', '', '', '', '', 'TOTAL',
          sign(totalMovementVES)
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
      columnStyles: context.mode === 'Bs'
        ? { 8: { halign: 'right' } }
        : { 8: { halign: 'right' } }
    });

    const summaryY = this.resolveSummaryStartY(doc, Number((doc as any).lastAutoTable?.finalY ?? 52) + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'MOVIMIENTOS', valor1: String(rows.length) },
      { indicador: 'TOTAL MOV Bs', valor1: sign(totalMovementVES) }
    ]);

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    const treasuryFilterLabel = [
      `Rango: ${context.dateRange.start} a ${context.dateRange.end}`,
      `Flujo: ${context.flowLabel}`,
      `Moneda: ${context.currencyLabel}`,
      `Metodo: ${context.methodLabel}`,
      `Banco: ${context.bankLabel}`,
      `Cuenta: ${context.accountLabel}`
    ].join(' | ');
    this.savePdfWithAudit(doc, `TESORERIA_OPERACIONES_${new Date().toISOString().split('T')[0]}.pdf`, 'Tesoreria Operaciones', treasuryFilterLabel);
  }

  exportPurchasesBookToPDF(
    rows: Array<{ timestamp?: Date; supplier: string; description: string; operator?: string; amountUSD: number; status: string; lines?: any[]; productDetails?: string }>,
    context: { start: string; end: string; search: string; filterLabel?: string }
  ): void {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = this.roundMoney(list.reduce((sum, row) => sum + (Number(row?.amountUSD ?? 0) || 0), 0));

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('LIBRO DE COMPRAS', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Rango: ${context.start} a ${context.end} | Busqueda: ${context.search || 'Todos'}`, 14, 22);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 27);
    doc.text(`Filtros: ${context.filterLabel?.trim() || 'Sin filtros adicionales'}`, 14, 32);

    const body = list.map((row) => ([
      row.timestamp instanceof Date ? row.timestamp.toLocaleDateString('es-VE') : String(row.timestamp ?? ''),
      String(row.supplier ?? ''),
      String(row.description ?? '').slice(0, 48),
      String(row.operator ?? 'SISTEMA').slice(0, 22),
      this.formatPurchaseProductDetails(row),
      this.formatUSD(Number(row.amountUSD ?? 0)),
      String(row.status ?? '')
    ]));

    autoTable(doc, {
      startY: 37,
      head: [['FECHA', 'PROVEEDOR', 'DESCRIPCION', 'OPERADOR', 'DETALLE PRODUCTOS', 'MONTO USD', 'ESTADO']],
      body: body.length ? body : [['-', 'Sin registros', '-', '-', '-', '$ 0.00', '-']],
      foot: [['', '', '', '', 'TOTAL', this.formatUSD(totalUSD), '']],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 7, cellWidth: 'wrap', overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 18 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 24 },
        4: { cellWidth: 46 },
        5: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
        6: { halign: 'center', cellWidth: 20 }
      }
    });

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `LIBRO_COMPRAS_${new Date().toISOString().split('T')[0]}.pdf`, 'Libro de Compras', String(context?.filterLabel ?? '').trim());
  }

  exportSalesBookToPDF(
    rows: SaleHistoryEntry[],
    context: { start: string; end: string; search: string; filterLabel?: string; title?: string }
  ): void {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = this.roundMoney(list.reduce((sum, row) => sum + (Number((row as any)?.totalUSD ?? 0) || 0), 0));
    const totalVES = this.roundMoney(list.reduce((sum, row) => sum + (Number((row as any)?.totalVES ?? 0) || 0), 0));

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text(context.title || 'LIBRO DE VENTAS', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Rango: ${context.start} a ${context.end} | Busqueda: ${context.search || 'Todos'}`, 14, 22);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 27);
    doc.text(`Filtros: ${context.filterLabel?.trim() || 'Sin filtros adicionales'}`, 14, 32);

    const body = list.map((row: any) => ([
      row.timestamp instanceof Date ? row.timestamp.toLocaleDateString('es-VE') : String(row.timestamp ?? ''),
      String(row.correlativo ?? ''),
      String(row.client?.name ?? '').slice(0, 34),
      String(row.client?.id ?? ''),
      this.formatSaleProductDetails(row),
      this.formatUSD(Number(row.totalUSD ?? 0)),
      this.formatVES(Number(row.totalVES ?? 0)),
      String(row.paymentMethod ?? '')
    ]));

    autoTable(doc, {
      startY: 37,
      head: [['FECHA', 'FACTURA', 'CLIENTE', 'RIF/CI', 'DETALLE PRODUCTOS', 'TOTAL USD', 'TOTAL BS', 'METODO']],
      body: body.length ? body : [['-', '-', 'Sin registros', '-', '-', '$ 0.00', 'Bs 0.00', '-']],
      foot: [['', '', '', '', 'TOTAL', this.formatUSD(totalUSD), this.formatVES(totalVES), '']],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 7, cellWidth: 'wrap', overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 24 },
        2: { cellWidth: 38 },
        3: { cellWidth: 28 },
        4: { cellWidth: 82 },
        5: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
        6: { halign: 'right', cellWidth: 28 },
        7: { halign: 'center', cellWidth: 24 }
      }
    });

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `LIBRO_VENTAS_${new Date().toISOString().split('T')[0]}.pdf`, context.title || 'Libro de Ventas', String(context?.filterLabel ?? '').trim());
  }

  exportInvoiceHistoryToPDF(
    rows: Array<{ tipo: string; fecha: string; factura: string; tercero: string; detalle_productos: string; totalUSD: number; estado: string }>,
    context: { title?: string; filterLabel?: string }
  ): void {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = this.roundMoney(list.reduce((sum, row) => sum + (Number(row?.totalUSD ?? 0) || 0), 0));

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text(context.title || 'HISTORIAL DE FACTURAS', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 23);
    doc.text(`Filtros: ${context.filterLabel?.trim() || 'Sin filtros adicionales'}`, 14, 29);

    autoTable(doc, {
      startY: 35,
      head: [['TIPO', 'FECHA', 'FACTURA', 'CLIENTE / PROVEEDOR', 'DETALLE PRODUCTOS', 'TOTAL USD', 'ESTADO']],
      body: list.length ? list.map((row) => [
        row.tipo,
        row.fecha,
        row.factura,
        row.tercero,
        row.detalle_productos,
        this.formatUSD(row.totalUSD),
        row.estado
      ]) : [['-', '-', '-', 'Sin registros', '-', '$ 0.00', '-']],
      foot: [['', '', '', '', 'TOTAL', this.formatUSD(totalUSD), '']],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 7, cellWidth: 'wrap', overflow: 'linebreak' },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 22 },
        2: { cellWidth: 28 },
        3: { cellWidth: 46 },
        4: { cellWidth: 100 },
        5: { halign: 'right', fontStyle: 'bold', cellWidth: 26 },
        6: { halign: 'center', cellWidth: 24 }
      }
    });

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `HISTORIAL_FACTURAS_${new Date().toISOString().split('T')[0]}.pdf`, context.title || 'Historial de Facturas', String(context?.filterLabel ?? '').trim());
  }

  exportExpensesBookToPDF(
    rows: Array<{ timestamp: Date; description: string; category: string; amountUSD: number }>,
    context: { start: string; end: string; category: string; filterLabel?: string }
  ): void {
    const list = Array.isArray(rows) ? rows : [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalUSD = this.roundMoney(list.reduce((sum, row) => sum + (Number(row?.amountUSD ?? 0) || 0), 0));

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('LIBRO DE EGRESOS', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Rango: ${context.start} a ${context.end} | Categoria: ${context.category}`, 14, 22);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 27);
    doc.text(`Filtros: ${context.filterLabel?.trim() || 'Sin filtros adicionales'}`, 14, 32);

    const body = list.map((row) => ([
      row.timestamp instanceof Date ? row.timestamp.toLocaleDateString('es-VE') : String(row.timestamp ?? ''),
      String(row.description ?? '').slice(0, 58),
      String(row.category ?? ''),
      this.formatUSD(Number(row.amountUSD ?? 0))
    ]));

    autoTable(doc, {
      startY: 37,
      head: [['FECHA', 'DESCRIPCION', 'CATEGORIA', 'MONTO USD']],
      body: body.length ? body : [['-', 'Sin registros', '-', '$ 0.00']],
      foot: [['', 'TOTAL', '', this.formatUSD(totalUSD)]],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 8 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } }
    });

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `LIBRO_EGRESOS_${new Date().toISOString().split('T')[0]}.pdf`, 'Libro de Egresos', String(context?.filterLabel ?? '').trim());
  }

  exportShrinkageToPDF(stats: {
    totalNatural: number;
    totalManip: number;
    byProduct: Array<{ description: string; natural: number; manip: number; total: number }>;
  }, context?: { filterLabel?: string }): void {
    const rows = Array.isArray(stats?.byProduct) ? stats.byProduct : [];
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const totalNatural = this.roundMoney(Number(stats?.totalNatural ?? 0) || 0);
    const totalManip = this.roundMoney(Number(stats?.totalManip ?? 0) || 0);
    const totalLoss = this.roundMoney(totalNatural + totalManip);

    doc.setFontSize(16);
    doc.setTextColor(2, 44, 34);
    doc.text('MERMAS Y CONTRACCIONES', 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text('Periodo: Acumulado historico', 14, 22);
    doc.text(`Filtros: ${context?.filterLabel?.trim() || 'Sin filtros adicionales'}`, 14, 27);
    doc.text(`Generado: ${now} | Operador: ${generatedBy}`, 14, 32);

    autoTable(doc, {
      startY: 37,
      head: [['PRODUCTO', 'NATURAL (KG)', 'MANIPULACION (KG)', 'TOTAL (KG)']],
      body: rows.length
        ? rows.map((p) => [
            String(p.description ?? '').slice(0, 48),
            this.formatNumber(Number(p.natural ?? 0), 2),
            this.formatNumber(Number(p.manip ?? 0), 2),
            this.formatNumber(Number(p.total ?? 0), 2)
          ])
        : [['Sin registros', '0.00', '0.00', '0.00']],
      foot: [['TOTAL', this.formatNumber(totalNatural, 2), this.formatNumber(totalManip, 2), this.formatNumber(totalLoss, 2)]],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right', fontStyle: 'bold' } }
    });

    this.applyStandardPdfFooter(doc);
    this.savePdfWithAudit(doc, `MERMAS_${new Date().toISOString().split('T')[0]}.pdf`, 'Mermas', String(context?.filterLabel ?? '').trim());
  }

  exportInventoryToPDF(options?: {
    pricing?: 'cost' | 'sale';
    currency?: 'USD' | 'VES';
    vesRate?: number;
  }) {
    const pricing = options?.pricing === 'sale' ? 'sale' : 'cost';
    const currency = options?.currency === 'VES' ? 'VES' : 'USD';
    const rawRate = Number(options?.vesRate ?? 36.5);
    const vesRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 36.5;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const stocks = this.getInventoryOverview(pricing);
    const now = new Date().toLocaleString();
    const generatedBy = this.getReportOperatorLabel();
    const pricingLabel = pricing === 'sale' ? 'Precio venta (lista)' : 'Precio costo';

    doc.setFontSize(18);
    doc.setTextColor(2, 44, 34);
    doc.text('VALORACIÓN DE INVENTARIO INDUSTRIAL', 14, 22);
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text(`Periodo: Corte actual de inventario`, 14, 30);
    const filterParts = [`Criterio: ${pricingLabel}`];
    if (currency === 'VES') {
      filterParts.push(`Tasa Bs/USD: ${this.formatNumber(vesRate, 4)}`);
    }
    doc.text(`Filtros: ${filterParts.join(' | ')}`, 14, 35);
    doc.text(`Generado: ${now} | Operador: ${generatedBy} | Protocolo FEFO Activo`, 14, 40);

    const valueColHead = currency === 'VES' ? 'VALORACIÓN BS' : 'VALORACIÓN USD';

    const tableData = stocks.map((s) => {
      const usdVal = Number(s.valueUSD ?? 0) || 0;
      const displayVal =
        currency === 'VES' ? usdVal * vesRate : usdVal;
      const formatted =
        currency === 'VES'
          ? this.formatVES(displayVal)
          : `$ ${displayVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
      return [
        s.sku,
        s.description,
        `${this.formatNumber(Number(s.totalQty ?? 0), 3)} ${String(s.unit ?? 'UND').toUpperCase()}`,
        formatted
      ];
    });

    autoTable(doc, {
      startY: 46,
      head: [['SKU', 'DESCRIPCIÓN', 'EXISTENCIA', valueColHead]],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [2, 44, 34] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } }
    });

    const totalUsd = this.getTotalValorization(pricing);
    const totalDisplay = currency === 'VES' ? totalUsd * vesRate : totalUsd;
    const totalLabel =
      currency === 'VES'
        ? `VALOR TOTAL ACTIVO: ${this.formatVES(totalDisplay)}`
        : `VALOR TOTAL ACTIVO: $ ${totalDisplay.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setTextColor(2, 44, 34);
    doc.text(totalLabel, 110, finalY);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'SKU EVALUADOS', valor1: String(stocks.length) },
      {
        indicador: 'VALOR TOTAL ACTIVO',
        valor1:
          currency === 'VES' ? this.formatVES(totalDisplay) : this.formatUSD(Number(totalUsd ?? 0))
      }
    ]);

    this.applyStandardPdfFooter(doc);
    const suffix = `${pricing}_${currency}`.toLowerCase();
    this.savePdfWithAudit(doc, `INVENTARIO_${new Date().toISOString().split('T')[0]}_${suffix}.pdf`, 'Inventario');
  }

  async exportAPStatementToPDF(
    supplierId: string,
    supplierName?: string,
    options?: { startDate?: string; endDate?: string }
  ) {
    const parseDate = (value: any): Date | null => {
      if (!value) return null;
      if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };
    const rangeStart = options?.startDate ? parseDate(`${options.startDate}T00:00:00`) : null;
    const rangeEnd = options?.endDate ? parseDate(`${options.endDate}T23:59:59`) : null;
    const inRange = (value: any): boolean => {
      const d = parseDate(value);
      if (!d) return false;
      if (rangeStart && d < rangeStart) return false;
      if (rangeEnd && d > rangeEnd) return false;
      return true;
    };

    const allSupplierEntries = dataService.getAPEntries().filter(e =>
      e.supplierId === supplierId || e.supplier === supplierName || e.supplier === supplierId
    );
    const apEntries = allSupplierEntries.filter((e: any) => inRange(e?.timestamp ?? e?.dueDate ?? new Date()));
    if (apEntries.length === 0) return;

    const resolvedName = supplierName ?? apEntries[0].supplier;
    const now = new Date().toLocaleDateString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const periodDates = apEntries
      .map((e: any) => (e?.timestamp instanceof Date ? e.timestamp : new Date(e?.timestamp ?? Date.now())))
      .filter((d: Date) => !Number.isNaN(d.getTime()))
      .sort((a: Date, b: Date) => a.getTime() - b.getTime());
    const periodLabel = periodDates.length > 0
      ? `${periodDates[0].toLocaleDateString('es-VE')} a ${periodDates[periodDates.length - 1].toLocaleDateString('es-VE')}`
      : 'Sin registros';

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    doc.setFontSize(18); doc.setTextColor(100, 20, 20);
    doc.text('ESTADO DE CUENTA: PROVEEDOR', 14, 22);
    doc.setFontSize(12); doc.setTextColor(0);
    doc.text(resolvedName.toUpperCase(), 14, 32);
    doc.setFontSize(9); doc.setTextColor(150);
    doc.text(`Periodo: ${periodLabel}`, 14, 38);
    doc.text(
      `Filtros: Proveedor: ${resolvedName.toUpperCase()} | Rango: ${options?.startDate || '—'} a ${options?.endDate || '—'}`,
      14,
      43
    );
    doc.text(`Generado por: ${generatedBy} | Fecha de Emisión: ${now}`, 14, 48);

    const paymentsByAp = await Promise.all(
      apEntries.map(async (entry: any) => ({
        apId: String(entry.id ?? ''),
        payments: await dataService.getAPPayments(String(entry.id ?? ''))
      }))
    );
    const paymentMap = new Map<string, Array<any>>();
    for (const row of paymentsByAp) paymentMap.set(row.apId, row.payments || []);

    const ledgerRows: Array<{
      date: Date;
      tipo: string;
      documento: string;
      detalle: string;
      referencia: string;
      cargoUSD: number;
      abonoUSD: number;
    }> = [];
    for (const e of apEntries as any[]) {
      ledgerRows.push({
        date: new Date(e.timestamp),
        tipo: 'COMPRA',
        documento: String(e.id ?? ''),
        detalle: String(e.description ?? '').substring(0, 58),
        referencia: String(e.invoiceNumber ?? ''),
        cargoUSD: Number(e.amountUSD ?? 0) || 0,
        abonoUSD: 0
      });
      const pays = paymentMap.get(String(e.id ?? '')) || [];
      for (const p of pays) {
        const payDate = new Date(p?.createdAt ?? e.timestamp);
        if (!inRange(payDate)) continue;
        const method = String(p?.method ?? '').trim().toUpperCase();
        const isDebitNote = method.includes('NOTA DEBITO');
        const isCreditNote = method.includes('NOTA CREDITO');
        const amount = Number(p?.amountUSD ?? 0) || 0;
        ledgerRows.push({
          date: payDate,
          tipo: isDebitNote ? 'NOTA DEBITO' : isCreditNote ? 'NOTA CREDITO' : 'ABONO',
          documento: String(e.id ?? ''),
          detalle: String(p?.note ?? p?.description ?? method ?? '').substring(0, 58) || (isDebitNote ? 'Ajuste débito' : 'Abono'),
          referencia: String(p?.reference ?? ''),
          cargoUSD: isDebitNote ? amount : 0,
          abonoUSD: isDebitNote ? 0 : amount
        });
      }
    }
    ledgerRows.sort((a, b) => a.date.getTime() - b.date.getTime());

    let runningBalance = 0;
    const tableData = ledgerRows.map((r) => {
      runningBalance = this.roundMoney(runningBalance + r.cargoUSD - r.abonoUSD);
      return [
        r.date.toLocaleDateString('es-VE'),
        r.tipo,
        r.documento,
        r.detalle,
        r.referencia || '-',
        r.cargoUSD > 0 ? this.formatUSD(r.cargoUSD) : '-',
        r.abonoUSD > 0 ? this.formatUSD(r.abonoUSD) : '-',
        this.formatUSD(runningBalance)
      ];
    });

    autoTable(doc, {
      startY: 54,
      head: [['FECHA', 'TIPO', 'DOCUMENTO', 'DETALLE', 'REFERENCIA', 'CARGO USD', 'ABONO USD', 'SALDO ACUM.']],
      body: tableData,
      theme: 'striped',
      headStyles: { fillColor: [100, 20, 20], textColor: [255, 255, 255] },
      styles: { fontSize: 7.2 },
      columnStyles: {
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', fontStyle: 'bold' }
      },
      didParseCell: (data: any) => {
        if (data.section === 'body' && data.column.index === 1 && data.cell.raw === 'NOTA DEBITO') {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.section === 'body' && data.column.index === 1 && data.cell.raw === 'ABONO') {
          data.cell.styles.textColor = [2, 132, 199];
        }
      }
    });

    const totalCompras = apEntries.reduce((a, b) => a + Number((b as any).amountUSD ?? 0), 0);
    const totalCargosLibro = ledgerRows.reduce((a, r) => a + Number(r.cargoUSD ?? 0), 0);
    const totalAbonos = ledgerRows.reduce((a, r) => a + Number(r.abonoUSD ?? 0), 0);
    const totalCargosExtra = totalCargosLibro - totalCompras;
    const totalDue = this.roundMoney(totalCargosLibro - totalAbonos);
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(12); doc.setTextColor(220, 38, 38);
    doc.text(`SALDO FINAL DEL LIBRO: ${this.formatUSD(totalDue)}`, 110, finalY);
    doc.setTextColor(0);

    const summaryY = this.resolveSummaryStartY(doc, finalY + 8, 40);
    this.renderExecutiveSummaryBox(doc, summaryY, [
      { indicador: 'DOCUMENTOS (COMPRAS)', valor1: String(apEntries.length) },
      { indicador: 'OPERACIONES EN LIBRO', valor1: String(ledgerRows.length) },
      { indicador: 'TOTAL COMPRAS', valor1: this.formatUSD(totalCompras) },
      { indicador: 'TOTAL CARGOS LIBRO', valor1: this.formatUSD(totalCargosLibro) },
      { indicador: 'TOTAL ABONOS', valor1: this.formatUSD(totalAbonos) },
      { indicador: 'CARGOS EXTRA (NOTA DEBITO)', valor1: this.formatUSD(totalCargosExtra) },
      { indicador: 'SALDO FINAL LIBRO', valor1: this.formatUSD(totalDue) },
      { indicador: 'PROVEEDOR', valor1: resolvedName.toUpperCase() }
    ]);

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(doc, `AP_EDC_${resolvedName.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`, `Estado de Cuenta Proveedor: ${resolvedName}`);
  }

  exportPurchaseOrderToPDF(order: PurchaseOrder): void {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date().toLocaleString('es-VE');
    const generatedBy = this.getReportOperatorLabel();
    const rows = Array.isArray(order?.lines) ? order.lines : [];
    const totalOrdered = this.roundMoney(rows.reduce((acc, l) => acc + (Number(l?.qtyOrdered ?? 0) || 0), 0));
    const totalReceived = this.roundMoney(rows.reduce((acc, l) => acc + (Number(l?.qtyReceived ?? 0) || 0), 0));
    const totalPending = this.roundMoney(totalOrdered - totalReceived);

    doc.setFontSize(17);
    doc.setTextColor(2, 44, 34);
    doc.text(`ORDEN DE COMPRA ${String(order?.correlativo ?? '').trim() || 'S/N'}`, 14, 16);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Proveedor: ${String(order?.supplier ?? '').trim() || '-'}`, 14, 22);
    doc.text(`Estatus: ${String(order?.status ?? 'DRAFT')} | Emisión: ${now}`, 14, 27);
    doc.text(`Generado por: ${generatedBy}`, 14, 32);
    doc.text(`Nota: ${String(order?.note ?? '').trim() || 'Sin observaciones'}`, 14, 37);

    autoTable(doc, {
      startY: 42,
      head: [['SKU', 'DESCRIPCIÓN', 'ALM', 'U.M.', 'CANT OC', 'RECIBIDO', 'PENDIENTE']],
      body: rows.length
        ? rows.map((l) => {
            const ordered = Number(l?.qtyOrdered ?? 0) || 0;
            const received = Number(l?.qtyReceived ?? 0) || 0;
            const pending = Math.max(0, ordered - received);
            return [
              String(l?.sku ?? ''),
              String(l?.productDescription ?? '').slice(0, 46),
              String(l?.warehouse ?? ''),
              String(l?.unit ?? ''),
              this.formatNumber(ordered, 4),
              this.formatNumber(received, 4),
              this.formatNumber(pending, 4)
            ];
          })
        : [['-', 'Sin renglones', '-', '-', '0.0000', '0.0000', '0.0000']],
      foot: [[
        '',
        '',
        '',
        'TOTAL',
        this.formatNumber(totalOrdered, 4),
        this.formatNumber(totalReceived, 4),
        this.formatNumber(totalPending, 4)
      ]],
      showFoot: 'lastPage',
      theme: 'striped',
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      footStyles: { fillColor: [240, 253, 244], textColor: [5, 46, 22], fontStyle: 'bold' },
      styles: { fontSize: 8 },
      columnStyles: {
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });

    this.applyStandardPdfFooter(doc, { executiveSignatures: true });
    this.savePdfWithAudit(
      doc,
      `OC_${String(order?.correlativo ?? 'SIN_CORRELATIVO').replace(/[^A-Z0-9_-]+/gi, '_')}_${new Date().toISOString().split('T')[0]}.pdf`,
      `Orden de Compra: ${String(order?.correlativo ?? '').trim() || 'S/N'}`
    );
  }
}

export const reportService = new ReportService();
