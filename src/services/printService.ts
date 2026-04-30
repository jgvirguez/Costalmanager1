import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SaleHistoryEntry, dataService, type ClientAdvance, type SupplierAdvance } from './dataService';
import { clientService } from './clientService';
import { formatQuantity } from '../utils/costCalculations';
import { compareSalesReportPdfRows } from '../utils/reportSort';
import { isCreditSaleByBusinessRule } from '../utils/salesClassification';

export interface LetraOptions {
  ciudad?: string;
  creditDays?: number;
  domicilioLibrado?: string;
  condicionesPago?: string;
  librador?: string;
  libradorRif?: string;
}

class PrintService {
  private escapeHtml(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildPos80TicketHtml(sale: SaleHistoryEntry, preferredCurrency: 'VES' | 'USD'): string {
    const nominalUSD = Math.abs((sale as any).nominalUSD ?? sale.totalUSD);
    const storedTotalVES = Math.abs(Number(sale.totalVES ?? 0));
    const rawSubtotalUSD = sale.items.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);
    const adjustmentFactor = rawSubtotalUSD > 0 ? nominalUSD / rawSubtotalUSD : 1;
    const totalLabel = preferredCurrency === 'USD' ? 'TOTAL (USD):' : 'TOTAL (Bs):';
    const totalValue = preferredCurrency === 'USD'
      ? `$ ${nominalUSD.toFixed(2)}`
      : storedTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const itemBlocks = sale.items.map((item) => {
      let totalStr = '';
      if (preferredCurrency === 'USD') {
        const adjustedItemTotal = item.qty * item.priceUSD * adjustmentFactor;
        totalStr = adjustedItemTotal.toFixed(2);
      } else {
        const itemProportion = rawSubtotalUSD > 0 ? (item.qty * item.priceUSD) / rawSubtotalUSD : 0;
        const itemTotalVES = storedTotalVES * itemProportion;
        totalStr = itemTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      return `<div class="itemRow">
  <div class="colQty">${this.escapeHtml(formatQuantity(item.qty))}</div>
  <div class="colDesc">${this.escapeHtml(String(item.description ?? '').toUpperCase())}</div>
  <div class="colAmt">${this.escapeHtml(totalStr)}</div>
</div>`;
    }).join('');

    return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=302,initial-scale=1" /><title>Ticket ${this.escapeHtml(sale.correlativo)}</title>
<style>
@page { size: 80mm auto; margin: 1mm 2mm 0 2mm; }
/* Sin flex en html: en Firefox el flex + ventana alta estiraba la “página” y sobraba mucho papel. */
html{margin:0;padding:0;min-height:0!important;height:auto!important;background:#fff}
body{margin:0;padding:0;min-height:0!important;height:auto!important;background:#fff;color:#000;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.wrap{width:76mm;margin:0 auto;background:#fff;display:block;overflow:visible}
.ticket{width:72mm;margin:0 auto;padding:2mm 1mm 2mm;box-sizing:border-box;overflow:visible}
/* Bloque explícito 30 mm: margen antes del corte (drivers térmicos varían) */
.cutFeed{height:30mm;min-height:30mm;width:100%;margin:0;padding:0;box-sizing:border-box;flex-shrink:0}
.center{text-align:center}
.logo{width:22mm;height:auto;margin:0 auto 1.5mm;display:block}
.note{font-size:8.2pt;font-weight:700;letter-spacing:0.02em;margin-top:0.5mm}
.sep{border-top:1px dashed #333;margin:2.5mm 0;opacity:0.95}
.meta{font-size:7.2pt;line-height:1.35;font-weight:400}
/* Cabecera ítems: columnas fijas (evita solape DESCRIPCION / TOTAL del diseño anterior) */
.itemsHead{display:flex;flex-direction:row;align-items:flex-end;font-size:7.2pt;font-weight:700;padding-bottom:1mm;border-bottom:1px solid #000;margin-top:1mm}
.colQty{flex:0 0 16%;min-width:0;text-align:left}
.colDesc{flex:1 1 auto;min-width:0;padding:0 1.5mm 0 1mm;text-align:left;word-wrap:break-word;overflow-wrap:anywhere;hyphens:auto}
.colAmt{flex:0 0 26%;min-width:0;text-align:right;white-space:nowrap}
.itemRow{display:flex;flex-direction:row;align-items:flex-start;font-size:7.4pt;padding:1.2mm 0 0;border:none}
.itemRow .colQty{align-self:flex-start;padding-top:0.2mm}
.itemRow .colDesc{line-height:1.18}
.itemRow .colAmt{align-self:flex-start;padding-top:0.2mm}
.total{display:flex;flex-direction:row;justify-content:space-between;align-items:center;font-size:10pt;font-weight:700;margin-top:0.5mm}
.foot1{font-size:8pt;font-weight:700;text-align:center;margin-top:1mm}
.foot2{font-size:6.8pt;text-align:center;margin-top:1mm;line-height:1.25}
.foot3{font-size:6.8pt;text-align:center;margin-top:0.8mm;font-family:Consolas,monospace}
@media print{
@page{margin:0 2mm 0 2mm}
html,body{height:auto!important;min-height:0!important;max-height:none!important;overflow:visible!important}
}
</style></head><body><div class="wrap"><div class="ticket">
<img class="logo" src="/logo.png" alt="logo" />
<div class="center note">NOTA: ${this.escapeHtml(sale.correlativo)}</div>
<div class="sep"></div>
<div class="meta">CLI: ${this.escapeHtml((sale.client?.name ?? '').toUpperCase())}</div>
<div class="meta">RIF: ${this.escapeHtml(sale.client?.id ?? '')}</div>
<div class="meta">FECHA: ${this.escapeHtml(sale.timestamp.toLocaleDateString())} ${this.escapeHtml(sale.timestamp.toLocaleTimeString())}</div>
<div class="meta">OPERADOR: ${this.escapeHtml(String(sale.operatorName ?? 'SISTEMA').toUpperCase())}</div>
<div class="sep"></div>
<div class="itemsHead"><div class="colQty">CANT</div><div class="colDesc">DESCRIPCION</div><div class="colAmt">TOTAL</div></div>
${itemBlocks}
<div class="sep"></div>
<div class="total"><span>${this.escapeHtml(totalLabel)}</span><span>${this.escapeHtml(totalValue)}</span></div>
<div class="sep"></div>
<div class="foot1">¡GRACIAS POR SU COMPRA!</div>
<div class="foot2">MANTENGA EL TICKET DURANTE 3 DIAS PARA DEVOLUCIONES</div>
<div class="foot2">0412-1074562</div>
<div class="foot3">${this.escapeHtml((sale.id || 'S/ID').toString().slice(0, 8).toUpperCase())}</div>
<div class="cutFeed" aria-hidden="true"></div>
</div></div></body></html>`;
  }

  private printPos80TicketHtml(sale: SaleHistoryEntry, preferredCurrency: 'VES' | 'USD', autoPrint: boolean): boolean {
    const popup = window.open('', '_blank', 'width=380,height=520');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(this.buildPos80TicketHtml(sale, preferredCurrency));
    popup.document.close();
    if (autoPrint) {
      const safeClose = () => { try { if (!popup.closed) popup.close(); } catch {} };
      popup.onload = () => {
        try {
          popup.focus();
          popup.onafterprint = () => setTimeout(safeClose, 200);
          setTimeout(() => { try { popup.print(); } catch {} }, 350);
          setTimeout(safeClose, 12000);
        } catch {}
      };
    }
    return true;
  }

  private roundMoney(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  /** Entero 0–999 en letras (masculino), p. ej. 21 → VEINTIÚN, 13 → TRECE. */
  private spanishInteger0to999Masculine(n: number): string {
    const x = Math.min(999, Math.max(0, Math.floor(Number(n) || 0)));
    if (x === 0) return 'CERO';
    const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
    const teens = [
      'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'
    ];
    const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
    const hundreds = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    const h = Math.floor(x / 100);
    const t = Math.floor((x % 100) / 10);
    const u = x % 10;
    const parts: string[] = [];

    if (h > 0) {
      if (h === 1 && t === 0 && u === 0) parts.push('CIEN');
      else parts.push(hundreds[h]);
    }
    if (t === 1) {
      parts.push(teens[u]);
    } else if (t === 2) {
      if (u === 0) parts.push('VEINTE');
      else if (u === 1) parts.push('VEINTIÚN');
      else {
        const veinteA: Record<number, string> = {
          2: 'VEINTIDÓS',
          3: 'VEINTITRÉS',
          4: 'VEINTICUATRO',
          5: 'VEINTICINCO',
          6: 'VEINTISÉIS',
          7: 'VEINTISIETE',
          8: 'VEINTIOCHO',
          9: 'VEINTINUEVE'
        };
        parts.push(veinteA[u] ?? `VEINTI${units[u]}`);
      }
    } else if (t > 2) {
      if (u === 0) parts.push(tens[t]);
      else parts.push(`${tens[t]} Y ${units[u]}`);
    } else if (t === 0 && u > 0 && h > 0) {
      parts.push(units[u]);
    } else if (t === 0 && u > 0 && h === 0) {
      parts.push(units[u]);
    }
    return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }

  private spanishIntegerWords(n: number): string {
    const x = Math.min(999_999, Math.max(0, Math.floor(Number(n) || 0)));
    if (x === 0) return 'CERO';
    if (x < 1000) return this.spanishInteger0to999Masculine(x);
    const miles = Math.floor(x / 1000);
    const rem = x % 1000;
    const milesTxt = miles === 1 ? 'MIL' : `${this.spanishInteger0to999Masculine(miles)} MIL`;
    if (rem === 0) return milesTxt;
    return `${milesTxt} ${this.spanishInteger0to999Masculine(rem)}`.trim();
  }

  /** Monto USD en letras (mayúsculas), ej. "DOS DÓLARES CON TRECE CENTAVOS". */
  private usdAmountToSpanishWords(amount: number): string {
    const abs = this.roundMoney(Math.abs(Number(amount) || 0));
    const dollars = Math.floor(abs + 1e-9);
    const cents = Math.min(99, Math.max(0, Math.round((abs - dollars) * 100 + 1e-9)));
    const dTxt = this.spanishIntegerWords(dollars);
    const cTxt = this.spanishIntegerWords(cents);
    const dLbl = dollars === 1 ? 'DÓLAR' : 'DÓLARES';
    const cLbl = cents === 1 ? 'CENTAVO' : 'CENTAVOS';
    return `${dTxt} ${dLbl} CON ${cTxt} ${cLbl}`;
  }

  /** Monto VES en letras, ej. "MIL BOLÍVARES CON CINCUENTA CÉNTIMOS". */
  private vesAmountToSpanishWords(amount: number): string {
    const abs = this.roundMoney(Math.abs(Number(amount) || 0));
    const bol = Math.floor(abs + 1e-9);
    const cents = Math.min(99, Math.max(0, Math.round((abs - bol) * 100 + 1e-9)));
    const bTxt = this.spanishIntegerWords(bol);
    const cTxt = this.spanishIntegerWords(cents);
    const bLbl = bol === 1 ? 'BOLÍVAR' : 'BOLÍVARES';
    const cLbl = cents === 1 ? 'CÉNTIMO' : 'CÉNTIMOS';
    return `${bTxt} ${bLbl} CON ${cTxt} ${cLbl}`;
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

  private applyStandardReportFooter(doc: any, options?: { executiveSignatures?: boolean }): void {
    const totalPages = Number(doc?.internal?.getNumberOfPages?.() ?? 1);
    const generatedBy = this.getReportOperatorLabel();
    const timestamp = new Date().toLocaleString('es-VE');
    const executiveSignatures = Boolean(options?.executiveSignatures);
    const signer1 = executiveSignatures ? 'GERENTE' : 'RESPONSABLE';
    const signer2 = executiveSignatures ? 'PRESIDENTE' : 'GERENTE';

    for (let i = 1; i <= totalPages; i += 1) {
      doc.setPage(i);
      const pageWidth = Number(doc?.internal?.pageSize?.getWidth?.() ?? 216);
      const pageHeight = Number(doc?.internal?.pageSize?.getHeight?.() ?? 279);
      const footerY = pageHeight - 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120);
      doc.text(`Generado por ${generatedBy} | ${timestamp}`, pageWidth / 2, footerY, { align: 'center' });
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, footerY, { align: 'right' });

      if (i === totalPages) {
        const signLineY = pageHeight - 16;
        const signLabelY = pageHeight - 11;
        doc.setDrawColor(100, 116, 139);
        doc.setLineWidth(0.25);
        doc.line(38, signLineY, 88, signLineY);
        doc.line(138, signLineY, 188, signLineY);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(71, 85, 105);
        doc.text(signer1, 38, signLabelY);
        doc.text(signer2, 138, signLabelY);
      }
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
  }

  private resolveCreditNoteVES(note: any): number {
    const directVES = Number(
      note?.amountVES
      ?? note?.refundAmountVES
      ?? note?.totalVES
      ?? 0
    ) || 0;
    if (Math.abs(directVES) > 0.000001) return Math.abs(directVES);

    const amountUSD = Number(note?.amountUSD ?? note?.totalUSD ?? 0) || 0;
    const rate = Number(
      note?.refundExchangeRate
      ?? note?.rateUsed
      ?? note?.exchangeRate
      ?? 0
    ) || 0;

    if (Math.abs(amountUSD) > 0.000001 && rate > 0) {
      return this.roundMoney(Math.abs(amountUSD) * rate);
    }
    return 0;
  }

  private shortenPdfText(value: string, maxLen: number): string {
    const s = String(value ?? '').trim();
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen - 1)}…`;
  }

  /**
   * PDF listado de anticipos (clientes o proveedores) para reportes gerenciales.
   */
  async printAdvancesReport(params: {
    kind: 'client' | 'supplier';
    periodLabel: string;
    filterLabel: string;
    clientRows?: ClientAdvance[];
    supplierRows?: SupplierAdvance[];
  }) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date();
    const timestamp = now.toLocaleString('es-VE');
    const operatorName = this.getReportOperatorLabel();
    const kind = params.kind;
    const clientRows = params.clientRows ?? [];
    const supplierRows = params.supplierRows ?? [];

    const statusLabel = (s: string) =>
      s === 'AVAILABLE' ? 'DISPONIBLE' : s === 'PARTIAL' ? 'PARCIAL' : s === 'APPLIED' ? 'APLICADO' : String(s || '—');

    try {
      const imgData = await this.getImageData('/logo.png');
      doc.addImage(imgData, 'PNG', 14, 6, 26, 16);
    } catch {
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(2, 44, 34);
      doc.text('COSTAL', 14, 22);
    }

    const title =
      kind === 'client' ? 'REPORTE: ANTICIPOS DE CLIENTES' : 'REPORTE: ANTICIPOS DE PROVEEDORES';
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text(title, 14, 28);

    doc.setFontSize(8.5);
    doc.text(`Periodo (creacion): ${params.periodLabel}`, 14, 33);
    const filterLines = doc.splitTextToSize(`Filtros: ${params.filterLabel}`, 178);
    doc.text(filterLines, 14, 38);
    const headerEndY = 38 + filterLines.length * 4;
    doc.text(`Generado: ${timestamp} | Operador: ${operatorName.toUpperCase()}`, 14, headerEndY + 4);

    let tableHead: string[][] = [];
    let tableBody: string[][] = [];
    let totalOriginal = 0;
    let totalBalance = 0;

    if (kind === 'client') {
      totalOriginal = clientRows.reduce((a, r) => a + this.roundMoney(Number(r.amountUSD) || 0), 0);
      totalBalance = clientRows.reduce((a, r) => a + this.roundMoney(Number(r.balanceUSD) || 0), 0);
      tableHead = [['FECHA', 'CLIENTE', 'RIF/CI', 'MONTO USD', 'SALDO USD', 'ESTADO', 'FACT. ORIG.', 'NOTA', 'ID']];
      tableBody = clientRows.map((r) => {
        const fecha = String(r.createdAt ?? '').slice(0, 10);
        const orig = String(r.originCorrelativo || r.originInvoiceId || '—');
        return [
          fecha,
          this.shortenPdfText(r.customerName, 28).toUpperCase(),
          this.shortenPdfText(r.customerId, 14),
          this.formatNumber(r.amountUSD, 2),
          this.formatNumber(r.balanceUSD, 2),
          statusLabel(r.status),
          this.shortenPdfText(orig, 14),
          this.shortenPdfText(r.note ?? '', 22),
          this.shortenPdfText(r.id, 14)
        ];
      });
    } else {
      totalOriginal = supplierRows.reduce((a, r) => a + this.roundMoney(Number(r.amountUSD) || 0), 0);
      totalBalance = supplierRows.reduce((a, r) => a + this.roundMoney(Number(r.balanceUSD) || 0), 0);
      tableHead = [['FECHA', 'PROVEEDOR', 'REFERENCIA', 'MONTO USD', 'SALDO USD', 'ESTADO', 'NOTA', 'ID']];
      tableBody = supplierRows.map((r) => {
        const fecha = String(r.createdAt ?? '').slice(0, 10);
        return [
          fecha,
          this.shortenPdfText(r.supplierName, 30).toUpperCase(),
          this.shortenPdfText(r.reference || '—', 16),
          this.formatNumber(r.amountUSD, 2),
          this.formatNumber(r.balanceUSD, 2),
          statusLabel(r.status),
          this.shortenPdfText(r.note ?? '', 24),
          this.shortenPdfText(r.id, 14)
        ];
      });
    }

    const count = kind === 'client' ? clientRows.length : supplierRows.length;

    const startY = Math.max(headerEndY + 10, 42);
    const emptyRow =
      kind === 'client'
        ? [['—', 'Sin registros', '', '', '', '', '', '', '']]
        : [['—', 'Sin registros', '', '', '', '', '', '']];
    autoTable(doc, {
      startY,
      head: tableHead,
      body: tableBody.length > 0 ? tableBody : emptyRow,
      styles: { fontSize: kind === 'client' ? 6 : 6.5, cellPadding: 1.2 },
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles:
        kind === 'client'
          ? {
              3: { halign: 'right', fontStyle: 'bold' },
              4: { halign: 'right', fontStyle: 'bold' },
              5: { halign: 'center' }
            }
          : {
              3: { halign: 'right', fontStyle: 'bold' },
              4: { halign: 'right', fontStyle: 'bold' },
              5: { halign: 'center' }
            }
    });

    const tableFinalY = Number((doc as any).lastAutoTable?.finalY ?? startY);
    let ySum = tableFinalY + 10;
    if (ySum > 225) {
      doc.addPage();
      ySum = 20;
    }
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(2, 44, 34);
    doc.text('RESUMEN EJECUTIVO:', 14, ySum);
    doc.setTextColor(0);

    const summaryRows: string[][] = [
      ['ANTICIPOS LISTADOS', String(count), '-'],
      ['MONTO ORIGINAL USD', this.formatUSD(totalOriginal), '-'],
      ['SALDO PENDIENTE USD', this.formatUSD(totalBalance), '-']
    ];
    if (kind === 'client') {
      const totalApplied = this.roundMoney(totalOriginal - totalBalance);
      summaryRows.push(['APLICADO USD', this.formatUSD(totalApplied), '-']);
    }

    autoTable(doc, {
      startY: ySum + 3,
      head: [['INDICADOR', 'USD / CANTIDAD', 'Bs']],
      body: summaryRows,
      theme: 'grid',
      tableWidth: 118,
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

    this.applyStandardReportFooter(doc);

    const blobUrl = URL.createObjectURL(doc.output('blob'));
    window.open(blobUrl, '_blank');
  }

  async printInvoice(sale: SaleHistoryEntry, preferredCurrency: 'VES' | 'USD' = 'VES', letraOptions?: LetraOptions, autoPrint: boolean = false) {
    // Optimizado para XP-N160II (80mm con ancho de impresión de 72mm)
    // Manteniendo el estilo de fuente pequeño y compacto solicitado.
    const pw = 72;
    const margin = 2;
    const contentWidth = pw - (margin * 2);

    const isCredit = isCreditSaleByBusinessRule(sale);

    if (isCredit) {
      await this.printLetterCreditInvoice(sale, preferredCurrency, letraOptions);
      return;
    }

    if (this.printPos80TicketHtml(sale, preferredCurrency, autoPrint)) return;

    // Página de trabajo: altura amplia para no recortar contenido; al final se recorta
    // a la última línea (setHeight) para no desperdiciar papel en impresora térmica (rollo).
    const addrExtraLines = sale.client.address ? Math.ceil(sale.client.address.length / 28) : 0;
    const capExtra = (sale.captures?.length || 0) * 45;
    const estimatedMaxY =
      60 +
      sale.items.length * 28 +
      addrExtraLines * 4 +
      (sale.client.phone ? 4 : 0) +
      capExtra +
      (sale.captures?.length ? 6 : 0) +
      40;
    /* Espacio de trabajo: debe ser > altura final del contenido; se recorta al final con setHeight. */
    const workHeightMm = Math.min(2000, Math.max(400, estimatedMaxY + 80));

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pw, workHeightMm]
    });

    let y = 3; // Reducido de 6mm a 3mm para menos margen superior

    try {
      const imgData = await this.getImageData('/logo.png');
      doc.addImage(imgData, 'PNG', (pw - 25) / 2, y - 4, 25, 10);
      y += 8;
    } catch (e) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('COSTAL', pw / 2, y, { align: 'center' });
      y += 5;
    }

    doc.setFontSize(9);
    doc.text(`NOTA: ${sale.correlativo}`, pw / 2, y, { align: 'center' });
    y += 4;

    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.line(margin, y, pw - margin, y);
    y += 3;

    // --- INFO CLIENTE ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`CLI: ${sale.client.name.toUpperCase()}`, margin, y);
    y += 3.5;
    doc.text(`RIF: ${sale.client.id}`, margin, y);
    if (sale.client.phone) {
      y += 3.5;
      doc.text(`TEL: ${sale.client.phone}`, margin, y);
    }
    if (sale.client.address) {
      y += 3.5;
      const addrLines = doc.splitTextToSize(`DIR: ${sale.client.address.toUpperCase()}`, contentWidth);
      doc.text(addrLines, margin, y);
      y += addrLines.length * 3.5;
    }
    y += 3.5;
    doc.text(`FECHA: ${sale.timestamp.toLocaleDateString()} ${sale.timestamp.toLocaleTimeString()}`, margin, y);
    y += 3.5;
    const operLines = doc.splitTextToSize(`OPERADOR: ${(sale.operatorName ?? 'SISTEMA').toUpperCase()}`, contentWidth);
    doc.text(operLines, margin, y);
    y += operLines.length * 3.5;
    y += 4;

    doc.line(margin, y, pw - margin, y);
    y += 4;

    // --- TABLA DE ITEMS ---
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CANT', margin, y);
    doc.text('DESCRIPCION', margin + 10, y);
    doc.text('TOTAL', pw - margin, y, { align: 'right' });
    y += 4;

    doc.setFont('helvetica', 'normal');

    // Usar nominalUSD (precio real de productos) para imprimir, no el total ajustado por excedente
    const nominalUSD = Math.abs((sale as any).nominalUSD ?? sale.totalUSD);
    const storedTotalVES = Math.abs(sale.totalVES);

    // Calcular factor proporcional sobre el nominal (precio acordado, sin excedentes)
    const rawSubtotalUSD = sale.items.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);
    const adjustmentFactor = rawSubtotalUSD > 0 ? nominalUSD / rawSubtotalUSD : 1;

    // Detectar anticipo dejado como vuelto
    const payments: any[] = Array.isArray((sale as any).payments) ? (sale as any).payments : [];
    const advanceNote = payments.find((p: any) =>
      String(p?.note ?? '').toUpperCase().includes('ANTICIPO') &&
      String(p?.note ?? '').toUpperCase().includes('FACTURA')
    );
    const advanceAmountUSD = advanceNote
      ? Math.abs(Number(advanceNote?.amountUSD ?? 0) || 0)
      : 0;

    sale.items.forEach(item => {
      const qtyStr = formatQuantity(item.qty);
      const descLines = doc.splitTextToSize(item.description.toUpperCase(), contentWidth - 25);
      const lineStep = 3.5;
      // splitTextToSize devuelve siempre string[]; por seguridad, no usar .length de un string (serían caracteres).
      const descLineCount = Array.isArray(descLines) ? descLines.length : 1;

      let totalStr = '';
      if (preferredCurrency === 'USD') {
        const adjustedItemTotal = item.qty * item.priceUSD * adjustmentFactor;
        totalStr = `${adjustedItemTotal.toFixed(2)}`;
      } else {
        const itemProportion = rawSubtotalUSD > 0 ? (item.qty * item.priceUSD) / rawSubtotalUSD : 0;
        const itemTotalVES = storedTotalVES * itemProportion;
        totalStr = `${itemTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
      }

      doc.text(`${qtyStr}`, margin, y);
      doc.text(descLines, margin + 10, y);
      doc.text(totalStr, pw - margin, y, { align: 'right' });

      y += descLineCount * lineStep + 0.5;
    });

    y += 1;
    doc.line(margin, y, pw - margin, y);
    y += 5;

    // --- TOTAL FINAL (precio real de productos) ---
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    if (preferredCurrency === 'USD') {
      doc.text('TOTAL (USD):', margin, y);
      doc.text(`$ ${nominalUSD.toFixed(2)}`, pw - margin, y, { align: 'right' });
    } else {
      doc.text('TOTAL (Bs):', margin, y);
      doc.text(`${storedTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pw - margin, y, { align: 'right' });
    }
    y += 4;

    // --- NOTA DE ANTICIPO (si el cliente dejó el vuelto como anticipo) ---
    if (advanceAmountUSD >= 0.01) {
      y += 1;
      doc.setLineDashPattern([0.3, 0.3], 0);
      doc.line(margin, y, pw - margin, y);
      y += 3;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.text('OBS: ANTICIPO DE CLIENTE', margin, y);
      y += 3.5;
      doc.setFont('helvetica', 'normal');
      const obsLines = doc.splitTextToSize(
        `El cliente deja $${advanceAmountUSD.toFixed(2)} como anticipo / abono a favor. Saldo disponible para proximas compras.`,
        contentWidth
      );
      doc.text(obsLines, margin, y);
      y += obsLines.length * 3.5;
    }

    // --- CAPTURES ---
    if (sale.captures && sale.captures.length > 0) {
      y += 2;
      doc.setFontSize(8);
      doc.text('COMPROBANTES:', margin, y);
      y += 4;

      sale.captures.forEach((cap, idx) => {
        try {
          doc.addImage(cap, 'JPEG', margin, y, contentWidth, 40);
          y += 42;
        } catch (e) {
          y += 3;
        }
      });
    }

    // --- SECCIÓN DE CRÉDITO Y FIRMA ---
    if (isCredit) {
      y += 4;
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      const conditions = doc.splitTextToSize("CONDICIONES: ESTA FACTURA VENCE SEGUN ACUERDO DE 10 DIAZ HABILES PARA CANCELAR LA MISMA. EL INCUMPLIMIENTO DE LOS PLAZOS GENERARA UN RECARGO DEL 10% SOBRE EL TOTAL DE LA MISMA.", contentWidth);
      doc.text(conditions, margin, y);
      y += (conditions.length * 3) + 2;

      doc.setFontSize(8);
      y += 10;
      doc.line(margin + 10, y, pw - margin - 10, y);
      y += 4;
      doc.text("FIRMA DE ACEPTACION", pw / 2, y, { align: 'center' });
      y += 6;
    }

    // --- PIE DE PÁGINA ---
    doc.setLineDashPattern([0.5, 0.5], 0);
    doc.line(margin, y, pw - margin, y);
    y += 3;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('¡GRACIAS POR SU COMPRA!', pw / 2, y, { align: 'center' });
    y += 4;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const devolucionLines = doc.splitTextToSize('MANTENGA EL TICKET DURANTE 3 DIAS PARA DEVOLUCIONES', contentWidth);
    doc.text(devolucionLines, pw / 2, y, { align: 'center' });
    y += devolucionLines.length * 3.5;
    doc.text('0412-1074562', pw / 2, y, { align: 'center' });
    y += 3.5;
    doc.text(`${(sale.id || 'S/ID').toString().slice(0, 8).toUpperCase()}`, pw / 2, y, { align: 'center' });

    // Recorta el MediaBox a la última tinta: imprescindible en rollo 80mm (Chrome/POS suelen respetar la altura del PDF).
    const bottomPadMm = 2;
    const trimmedHeightMm = Math.max(y + bottomPadMm, 18);
    try {
      const pageSize = (doc as any).internal?.pageSize;
      if (pageSize) {
        if (typeof doc.setPage === 'function') doc.setPage(1);
        if (typeof pageSize.setHeight === 'function') {
          pageSize.setHeight(trimmedHeightMm);
        }
        if (Object.prototype.hasOwnProperty.call(pageSize, 'height')) {
          try {
            pageSize.height = trimmedHeightMm;
          } catch {
            // ignorar
          }
        }
        const hCheck = typeof pageSize.getHeight === 'function' ? pageSize.getHeight() : trimmedHeightMm;
        if (hCheck > trimmedHeightMm + 1 && typeof pageSize.setHeight === 'function') {
          pageSize.setHeight(trimmedHeightMm);
        }
      }
    } catch {
      // Si falla, el PDF queda a altura de trabajo.
    }

    const blob = doc.output('blob');
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
  }

  private async getImageData(url: string): Promise<string> {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  private async printLetterCreditInvoice(sale: SaleHistoryEntry, preferredCurrency: 'VES' | 'USD', letraOptions?: LetraOptions) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const margin = 20;
    let y = 25;

    // --- LÓGICA DE PRECIO SEGÚN MONEDA ---
    // total_usd almacenado = monto operativo internalizado (crédito en Bs a tasa interna), alineado con ticket/UI.
    // nominal_usd = precio de lista; no usar (Bs/BCV) para el monto en USD de esta factura.
    const rateInternal: number = (sale as any).creditMeta?.rateInternal || (sale as any).exchangeRate || 1;
    const rateBCV: number = (sale as any).creditMeta?.rateBCV || (sale as any).exchangeRate || 1;
    const rawSubtotalUSD = sale.items.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);
    const nominalListUSD =
      Math.abs(Number(sale.nominalUSD ?? 0)) > 0
        ? Math.abs(Number(sale.nominalUSD))
        : rawSubtotalUSD;
    const internalizedUSD = Math.abs(Number(sale.totalUSD ?? 0));
    // creditCurrency guardada en creditMeta tiene prioridad; fallback: inferir del paymentMethod
    const savedCreditCurrency: string = (sale as any).creditMeta?.creditCurrency ?? '';
    const isUSDPayment = savedCreditCurrency === 'USD'
      || (!savedCreditCurrency && ['cash_usd','zelle','digital_usd','CASH_USD','ZELLE','DIGITAL_USD'].includes(sale.paymentMethod ?? ''));

    const payments = (sale as any).payments || [];
    const vesMethods = ['cash_ves', 'mobile', 'transfer', 'debit', 'biopago'];
    const totalVESPaid = payments.reduce((sum: number, p: any) => {
      if (vesMethods.includes(p.method)) {
        return sum + Math.abs(Number(p.amountVES || 0));
      }
      if (p.amountVES > 0) {
        return sum + Math.abs(Number(p.amountVES || 0));
      }
      return sum;
    }, 0);

    // Referencia Bs a tasa BCV desde precio de lista (columna Bs si el flujo es USD puro)
    const totalVESAtBCV = nominalListUSD * rateBCV;
    const totalVESInternal =
      totalVESPaid > 0 ? totalVESPaid : internalizedUSD * rateInternal;
    const storedVES = Math.abs(Number(sale.totalVES ?? 0));

    // USD mostrado: siempre el total de venta internalizado (mismo criterio que resumen C-00… / crédito Bs)
    const displayUSD =
      internalizedUSD > 0.0005
        ? internalizedUSD
        : (rawSubtotalUSD > 0 ? rawSubtotalUSD : nominalListUSD);
    // Bs: monto registrado; si faltó total_ves, reconstruir desde tasa interna
    const displayVES = isUSDPayment
      ? totalVESAtBCV
      : (storedVES > 0.01 ? storedVES : totalVESInternal);
    const displayTotal = preferredCurrency === 'USD'
      ? `$ ${displayUSD.toFixed(3)}`
      : `Bs. ${displayVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    const letraTotal = preferredCurrency === 'USD' ? displayUSD : displayVES;
    const letraLabel = preferredCurrency === 'USD' ? 'DÓLARES ESTADOUNIDENSES' : 'BOLÍVARES';
    const letraSymbol = preferredCurrency === 'USD' ? '$' : 'Bs.';

    // --- HEADER ---
    try {
      const imgData = await this.getImageData('/logo.png');
      doc.addImage(imgData, 'PNG', margin, y - 10, 35, 15);
      y += 8;
    } catch (e) {
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.text('COSTAL', margin, y);
    }

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('FACTURA DE CRÉDITO', 215 - margin, y, { align: 'right' });
    doc.setFontSize(12); doc.setTextColor(220, 0, 0);
    doc.text(`N°- ${sale.correlativo}`, 215 - margin, y + 8, { align: 'right' });
    doc.setTextColor(0);

    y += 20;
    doc.setDrawColor(200); doc.line(margin, y, 215 - margin, y);
    y += 8;

    const masterClient = clientService.findClient(sale.client.id);
    const resolvedClientAddress = (masterClient?.address || sale.client.address || '').trim();
    const resolvedClientPhone = (masterClient?.phone || sale.client.phone || '').trim();

    // --- INFO CLIENTE ---
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('DATOS DEL CLIENTE:', margin, y);
    doc.text('RESUMEN OPERATIVO:', 120, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.text(`CLIENTE: ${sale.client.name.toUpperCase()}`, margin, y);
    doc.text(`MONTO TOTAL: ${displayTotal}`, 120, y);
    y += 5;
    doc.text(`RIF/CI: ${sale.client.id}`, margin, y);
    y += 5;
    if (resolvedClientPhone) {
      doc.text(`TELÉFONO: ${resolvedClientPhone}`, margin, y);
      y += 5;
    }
    if (resolvedClientAddress) {
      const addrLines = doc.splitTextToSize(`DIRECCIÓN: ${resolvedClientAddress.toUpperCase()}`, 90);
      doc.text(addrLines, margin, y);
      y += addrLines.length * 5;
    }
    doc.text(`FECHA: ${sale.timestamp.toLocaleDateString()}`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text(`OPERADOR: ${(sale.operatorName ?? 'SISTEMA').toUpperCase()}`, margin, y);
    doc.setFont('helvetica', 'normal');
    y += 8;

    // --- TABLA DE ÍTEMS ---
    const colLabel = preferredCurrency === 'USD' ? ['CÓDIGO', 'DESCRIPCIÓN', 'CANTIDAD', 'UNIDAD', 'P. UNIT ($)', 'P. TOTAL ($)']
                                                  : ['CÓDIGO', 'DESCRIPCIÓN', 'CANTIDAD', 'UNIDAD', 'P. UNIT (Bs)', 'P. TOTAL (Bs)'];
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      head: [colLabel],
      body: sale.items.map(i => {
        const proportion = rawSubtotalUSD > 0 ? (i.qty * i.priceUSD) / rawSubtotalUSD : 0;
        if (preferredCurrency === 'USD') {
          const itemTotalUSD = displayUSD * proportion;
          const unitUSD = i.qty > 0 ? itemTotalUSD / i.qty : 0;
          return [i.code, i.description.toUpperCase(), formatQuantity(i.qty), i.unit,
            unitUSD.toFixed(3), itemTotalUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })];
        } else {
          const itemTotalVES = displayVES * proportion;
          const unitVES = i.qty > 0 ? itemTotalVES / i.qty : 0;
          return [i.code, i.description.toUpperCase(), formatQuantity(i.qty), i.unit,
            unitVES.toLocaleString('es-VE', { minimumFractionDigits: 2 }),
            itemTotalVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })];
        }
      }),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [6, 78, 59], textColor: [255, 255, 255], fontStyle: 'bold' }
    });

    y = (doc as any).lastAutoTable.finalY + 15;

    // --- LETRA DE CAMBIO ---
    await this.drawLetraDeCambio(doc, sale, margin, y, letraTotal, letraLabel, letraSymbol, letraOptions);

    // --- FIRMAS ---
    const imgH = 70;
    const ySign = y + imgH + 16;
    const leftLineX1 = margin + 8;
    const leftLineX2 = margin + 72;
    const rightLineX1 = 215 - margin - 72;
    const rightLineX2 = 215 - margin - 8;

    doc.setDrawColor(80);
    doc.line(leftLineX1, ySign, leftLineX2, ySign);
    doc.line(rightLineX1, ySign, rightLineX2, ySign);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('FIRMA DEL CLIENTE', (leftLineX1 + leftLineX2) / 2, ySign + 5, { align: 'center' });
    doc.text('FIRMA NEGOCIO / GERENCIA', (rightLineX1 + rightLineX2) / 2, ySign + 5, { align: 'center' });

    const blobUrl = URL.createObjectURL(doc.output('blob'));
    window.open(blobUrl, '_blank');
  }

  private async drawLetraDeCambio(
    doc: jsPDF, sale: SaleHistoryEntry, margin: number, startY: number,
    letraTotal: number = Math.abs(sale.totalUSD),
    letraLabel: string = 'DÓLARES ESTADOUNIDENSES',
    letraSymbol: string = '$',
    opts?: LetraOptions
  ) {
    try {
      const imgData = await this.getImageData('/letra_de_cambio.png');
      const w = 175;
      const h = 70;
      doc.addImage(imgData, 'PNG', margin, startY, w, h);

      const day = sale.timestamp.getDate();
      const month = sale.timestamp.getMonth() + 1;
      const year = sale.timestamp.getFullYear();

      // Vencimiento: usa creditDays del cliente o de opts, fallback 10 días
      const clientCreditDays = (sale.client as any)?.creditDays ?? 0;
      const creditDays = opts?.creditDays ?? (clientCreditDays > 0 ? clientCreditDays : 10);
      const dueDate = new Date(sale.timestamp);
      dueDate.setDate(dueDate.getDate() + creditDays);

      // Campos configurables con defaults
      const ciudad = (opts?.ciudad?.trim() || 'BARQUISIMETO').toUpperCase();
      const masterClient = clientService.findClient(sale.client.id);
      const clientAddress = (masterClient?.address || sale.client.address || '').trim();
      const clientPhone = (masterClient?.phone || sale.client.phone || '').trim();
      const domicilioLibrado = (opts?.domicilioLibrado?.trim() || clientAddress || 'BARQUISIMETO, EDO. LARA').toUpperCase();
      const empresaLibradora = (opts?.librador?.trim() || 'EMPRENDIMIENTO EL COSTAL').toUpperCase();

      // Coordenadas calibradas sobre plantilla 175×70 mm (public/letra_de_cambio.png).
      // Origen: esquina superior izquierda de la imagen = (margin, startY). Eje Y hacia abajo.
      const imgL = margin;
      const imgT = startY;
      const z = 1.6; // bajada (mm) para alinear con líneas de escritura, sin flotar arriba
      const totalStr = letraTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 });

      // Fila 1: correlativo (compacto), ciudad (ancho acotado), emisión bajo "Día/Mes/Año", monto solo en el recuadro USD
      const y1 = imgT + 7.2 + z;
      const cifraFila1 = `${letraSymbol} ${totalStr}`.replace(/\s+/g, ' ').trim();

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.8);
      const yCorrelativo = y1 + 1.0;
      doc.text(sale.correlativo, imgL + 31, yCorrelativo);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      const yCiudad = y1 + 0.8;
      doc.text(ciudad, imgL + 53, yCiudad);

      // Guiones bajo Día / Mes / Año (a la izquierda del recuadro "USD" para no mezclar el año con el monto)
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      const yFecha = y1 - 1.0;
      doc.text(String(day), imgL + 84, yFecha);
      doc.text(String(month), imgL + 97, yFecha);
      doc.text(String(year), imgL + 111, yFecha);

      doc.setFontSize(7.0);
      doc.text(cifraFila1, imgL + 140, y1, { align: 'right' });

      // Fila 2: vencimiento (El día / de / de)
      const y2 = y1 + 6.0;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.0);
      doc.text(String(dueDate.getDate()), imgL + 39, y2);
      doc.text(String(dueDate.getMonth() + 1), imgL + 56, y2);
      doc.text(String(dueDate.getFullYear()), imgL + 78, y2);

      // Condiciones de pago (también desde modal; si viene vacío, coherente con días al crédito)
      const condRaw = (opts?.condicionesPago ?? '').trim();
      const condText = condRaw || `A ${creditDays} DÍAS FECHA`;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5.8);
      const condLines = doc.splitTextToSize(condText.toUpperCase(), w - 28);
      let yCond = y2 + 3.0;
      condLines.forEach((ln) => {
        doc.text(ln, imgL + 4, yCond);
        yCond += 2.55;
      });
      const yAfterCond = condLines.length > 0 ? yCond + 0.3 : y2;

      // Fila 3: "mandar a pagar / a la orden" → beneficiario (librador)
      const y3 = Math.max(y2 + 12.0, yAfterCond + 4.8);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      const condW = 118;
      doc.text(empresaLibradora, imgL + 30, y3, { maxWidth: condW });
      const rifLibrador = (opts?.libradorRif ?? '').trim();
      let payeeExtraH = 0;
      if (rifLibrador) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.3);
        doc.text(`RIF: ${rifLibrador.toUpperCase()}`, imgL + 30, y3 + 2.4, { maxWidth: condW });
        payeeExtraH = 2.5;
        doc.setFont('helvetica', 'bold');
      }

      // Recuadro gris central: importe en letras
      const y4 = y3 + 6.4 + payeeExtraH;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      const isVesLetra = letraSymbol !== '$' && (letraLabel.includes('BOL') || /bs/i.test(String(letraSymbol)));
      const textoSumaLetras = isVesLetra
        ? `*** ${this.vesAmountToSpanishWords(letraTotal)} ***`
        : letraSymbol === '$'
        ? `*** ${this.usdAmountToSpanishWords(letraTotal)} ***`
        : `*** LA SUMA DE ${letraSymbol} ${totalStr} (${letraLabel}) ***`;
      const sumaLines = doc.splitTextToSize(textoSumaLetras, w - 16);
      let ySuma = y4;
      sumaLines.forEach((ln) => {
        doc.text(ln, imgL + w / 2, ySuma, { align: 'center', maxWidth: w - 14 });
        ySuma += 3.35;
      });
      const y5 = ySuma + 1.8;

      // Lugar de pago / Valor: monto en formato numérico (línea corta + continuación si hace falta)
      doc.setFontSize(8.2);
      doc.setFont('helvetica', 'normal');
      doc.text(ciudad, imgL + 49, y5 + 1);
      doc.setFont('helvetica', 'bold');
      const valorNumericDisplay = `${letraSymbol} ${totalStr}`.replace(/\s+/g, ' ').trim();
      const valorShortWidthMm = 22;
      const valorShortRightX = imgL + 137;
      const yValorMonto = y5 + 1;
      const yValorCont0 = y5 + 4.5;
      let yAfterValor = yValorCont0;
      const valorLongBandMm = Math.min(78, Math.max(36, w - 24));
      const lineasValor = doc.splitTextToSize(valorNumericDisplay, valorLongBandMm);
      doc.text(lineasValor[0] ?? valorNumericDisplay, valorShortRightX, yValorMonto, {
        align: 'right',
        maxWidth: valorShortWidthMm
      });
      let yv = yValorCont0;
      lineasValor.slice(1).forEach((ln) => {
        doc.text(ln, valorShortRightX, yv, { align: 'right' });
        yv += 3.4;
      });
      yAfterValor = lineasValor.length > 1 ? yv : yValorCont0;

      // "y Librado(s)" y datos del librado (más cerca de las líneas; domicilio dentro del marco, no bajo el borde)
      const y6 = Math.max(y5 + 8.0, yAfterValor + 1.5);
      const yLibradoNombre = y6 + 2.5;
      doc.setFontSize(8.0);
      doc.text(sale.client.name.toUpperCase(), imgL + 51, yLibradoNombre);
      doc.setFontSize(6.8);
      doc.text(`RIF: ${sale.client.id} - TEL: ${clientPhone || 'S/N'}`, imgL + 30, yLibradoNombre + 4.4);
      const domiLines = doc.splitTextToSize(`DOMICILIO: ${domicilioLibrado}`, w - 20);
      let yDomi = yLibradoNombre + 7.8;
      domiLines.forEach((line) => {
        doc.text(line, imgL + 30, yDomi);
        yDomi += 2.8;
      });

    } catch (e) {
      console.warn("No se pudo cargar la imagen de la letra de cambio, usando respaldo...");
    }
  }

  async printSalesReport(
    sales: SaleHistoryEntry[],
    range?: { start: string, end: string },
    filters?: {
      client?: string;
      method?: string;
      cashier?: string;
      status?: string;
      minUSD?: string;
      maxUSD?: string;
      sortBy?: string;
    },
    options?: { includeReturns?: boolean, includeVoided?: boolean, showNetTotals?: boolean }
  ) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const now = new Date();
    const timestamp = now.toLocaleString();
    const operatorName = this.getReportOperatorLabel();

    // Get credit notes (returns) for the date range
    const includeReturns = options?.includeReturns === true;
    const includeVoided = options?.includeVoided ?? true;
    const creditNotes = dataService.getCreditNotes();
    const creditNotesInRange = includeReturns
      ? (
          range
            ? creditNotes.filter((cn: any) => {
                const cnDate = new Date(cn.createdAt ?? cn.timestamp ?? new Date());
                const start = new Date(range.start);
                const end = new Date(range.end);
                end.setHours(23, 59, 59);
                const inDate = cnDate >= start && cnDate <= end;
                if (!inDate) return false;
                const q = String(filters?.client ?? '').trim().toLowerCase();
                if (!q) return true;
                const hay = `${String(cn.clientName ?? cn.customerName ?? '')} ${String(cn.clientId ?? '')}`.toLowerCase();
                return hay.includes(q);
              })
            : creditNotes
        )
      : [];

    // Separate voided and active sales
    const voidedSales = sales.filter(s => (s as any).status === 'VOID' || (s as any).voided);
    const activeSales = sales.filter(s => (s as any).status !== 'VOID' && !(s as any).voided);

    // Header Industrial
    try {
      const imgData = await this.getImageData('/logo.png');
      // Logo ajustado para no verse comprimido (proporción más natural)
      doc.addImage(imgData, 'PNG', 14, 6, 26, 16);
    } catch (e) {
      doc.setFontSize(22); doc.setFont('helvetica', 'bold');
      doc.setTextColor(2, 44, 34); // Emerald 950
      doc.text('COSTAL', 14, 22);
    }

    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100);
    doc.text('REPORTE: VISION GENERAL - VENTAS', 14, 28);

    const periodLabel = range ? `${range.start} a ${range.end}` : now.toLocaleDateString();
    const filtersApplied = [
      filters?.client ? `Busqueda: ${String(filters.client).toUpperCase()}` : '',
      filters?.method && filters.method !== 'ALL' ? `Metodo: ${String(filters.method).toUpperCase()}` : '',
      filters?.cashier && filters.cashier !== 'ALL' ? `Cajero: ${String(filters.cashier).toUpperCase()}` : '',
      filters?.status && filters.status !== 'ALL' ? `Estado: ${String(filters.status).toUpperCase()}` : '',
      filters?.minUSD ? `MinUSD: ${String(filters.minUSD)}` : '',
      filters?.maxUSD ? `MaxUSD: ${String(filters.maxUSD)}` : ''
    ].filter(Boolean).join(' | ') || 'Sin filtros adicionales';
    doc.setFontSize(8.5);
    doc.text(`Periodo: ${periodLabel}`, 14, 33);
    const filterLines = doc.splitTextToSize(`Filtros: ${filtersApplied}`, 178);
    doc.text(filterLines, 14, 38);
    const generatedY = 38 + (filterLines.length * 4);
    doc.text(`Generado: ${timestamp} | Operador: ${operatorName.toUpperCase()}`, 14, generatedY + 4);

    // Totales alineados con lo mostrado en cada fila (2 decimales): suma de importes
    // redondeados por línea. Así el total del PDF coincide con la suma manual de la columna.
    const lineUSD = (sale: any) => this.roundMoney(Number(sale?.totalUSD ?? 0) || 0);
    const lineVES = (sale: any) => this.roundMoney(Number(sale?.totalVES ?? 0) || 0);
    const activeTotalUSD = activeSales.reduce((a, s) => a + lineUSD(s), 0);
    const activeTotalVES = activeSales.reduce((a, s) => a + lineVES(s), 0);
    const voidedTotalUSD = voidedSales.reduce((a, s) => a + lineUSD(s), 0);
    const voidedTotalVES = voidedSales.reduce((a, s) => a + lineVES(s), 0);
    const creditSales = activeSales.filter((sale) => isCreditSaleByBusinessRule(sale));
    const cashSales = activeSales.filter((sale) => !isCreditSaleByBusinessRule(sale));
    const creditSalesCount = creditSales.length;
    const cashSalesCount = cashSales.length;
    const creditSalesUSD = creditSales.reduce((sum, sale) => sum + lineUSD(sale), 0);
    const creditSalesVES = creditSales.reduce((sum, sale) => sum + lineVES(sale), 0);
    const cashSalesUSD = cashSales.reduce((sum, sale) => sum + lineUSD(sale), 0);
    const cashSalesVES = cashSales.reduce((sum, sale) => sum + lineVES(sale), 0);
    const returnsTotalUSD = creditNotesInRange.reduce(
      (a, b) => a + this.roundMoney(Math.abs(Number(b.amountUSD || 0))),
      0
    );
    const returnsTotalVES = creditNotesInRange.reduce(
      (a, b) => a + this.roundMoney(this.resolveCreditNoteVES(b)),
      0
    );
    const netTotalUSD = activeTotalUSD - returnsTotalUSD;
    const netTotalVES = activeTotalVES - returnsTotalVES;

    // Filas del PDF: ordenar por instante + correlativo (mismo criterio que la UI según `filters.sortBy`)
    type SalesReportRow = { sortTime: number; ref: string; sortUsd: number; cells: any[] };
    const tableWork: SalesReportRow[] = [];

    activeSales.forEach((s) => {
      const usd = Number(s.totalUSD ?? 0) || 0;
      tableWork.push({
        sortTime: s.timestamp.getTime(),
        ref: String(s.correlativo ?? ''),
        sortUsd: usd,
        cells: [
          s.timestamp.toLocaleDateString('es-VE'),
          s.correlativo,
          s.client.name.substring(0, 30).toUpperCase(),
          s.client.id,
          this.formatNumber(s.totalUSD, 2),
          this.formatNumber(s.totalVES, 2),
          'VENTA'
        ]
      });
    });

    if (includeReturns && creditNotesInRange.length > 0) {
      creditNotesInRange.forEach((cn: any) => {
        const cnDate = new Date(cn.createdAt ?? cn.timestamp ?? new Date());
        const amountUSD = Number(cn.amountUSD || 0);
        const amountVES = this.resolveCreditNoteVES(cn);
        const ref = String(cn.correlativo || cn.id?.slice(0, 8) || '');
        const absUsd = Math.abs(amountUSD);
        tableWork.push({
          sortTime: cnDate.getTime(),
          ref,
          sortUsd: absUsd,
          cells: [
            cnDate.toLocaleDateString('es-VE'),
            ref,
            (cn.clientName || cn.customerName || 'DEVOLUCIÓN').substring(0, 30).toUpperCase(),
            cn.clientId || 'N/A',
            `-${this.formatNumber(amountUSD, 2)}`,
            `-${this.formatNumber(amountVES, 2)}`,
            'DEVOLUCIÓN'
          ]
        });
      });
    }

    if (includeVoided && voidedSales.length > 0) {
      voidedSales.forEach((s) => {
        const usdV = Number(s.totalUSD ?? 0) || 0;
        tableWork.push({
          sortTime: s.timestamp.getTime(),
          ref: String(s.correlativo ?? ''),
          sortUsd: usdV,
          cells: [
            s.timestamp.toLocaleDateString('es-VE'),
            s.correlativo + ' (ANULADA)',
            s.client.name.substring(0, 30).toUpperCase(),
            s.client.id,
            this.formatNumber(s.totalUSD, 2),
            this.formatNumber(s.totalVES, 2),
            'ANULADA'
          ]
        });
      });
    }

    const sortByPdf = String(filters?.sortBy ?? 'DATE_DESC');
    tableWork.sort((a, b) => compareSalesReportPdfRows(a, b, sortByPdf));

    const tableRows = tableWork.map((r) => r.cells);

    autoTable(doc, {
      startY: generatedY + 9,
      head: [['FECHA', 'REF', 'CLIENTE', 'RIF/CI', 'TOTAL $', 'TOTAL Bs', 'TIPO']],
      body: tableRows,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [2, 44, 34], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'center', fontStyle: 'bold' }
      },
      didParseCell: (data: any) => {
        // Color code by type
        if (data.section === 'body') {
          const tipo = data.cell.raw;
          if (tipo === 'DEVOLUCIÓN') {
            data.cell.styles.textColor = [220, 38, 38]; // Red for returns
          } else if (tipo === 'ANULADA') {
            data.cell.styles.textColor = [150, 150, 150]; // Gray for voided
          } else {
            data.cell.styles.textColor = [2, 44, 34]; // Green for sales
          }
        }
      }
    });

    const tableFinalY = Number((doc as any).lastAutoTable?.finalY ?? 0);
    let finalY = tableFinalY > 0 ? tableFinalY + 10 : generatedY + 12;
    // Always render summary; move to a new page when there is not enough space.
    if (finalY > 210) {
      doc.addPage();
      finalY = 20;
    }

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text('RESUMEN DE OPERACIONES:', 14, finalY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(0);

    let yPos = finalY + 5;
    doc.text(`Ventas Activas:     ${this.formatUSD(activeTotalUSD).padStart(16)}   ${this.formatVES(activeTotalVES).padStart(18)}`, 14, yPos);
    yPos += 4;

    if (includeReturns && creditNotesInRange.length > 0) {
      doc.setTextColor(220, 38, 38);
      doc.text(`Devoluciones:      -${this.formatUSD(returnsTotalUSD).replace('$ ', '$').padStart(14)}  -${this.formatVES(returnsTotalVES).replace('Bs ', 'Bs').padStart(16)}`, 14, yPos);
      yPos += 4;
    }

    if (voidedSales.length > 0 && includeVoided) {
      doc.setTextColor(150, 150, 150);
      doc.text(`Anuladas:           ${this.formatUSD(voidedTotalUSD).padStart(16)}   ${this.formatVES(voidedTotalVES).padStart(18)}`, 14, yPos);
      yPos += 4;
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    yPos += 2;
    const executiveRows = [
      [
        `FACTURAS CRÉDITO (${creditSalesCount})`,
        this.formatUSD(creditSalesUSD),
        this.formatVES(creditSalesVES)
      ],
      [
        `FACTURAS CONTADO (${cashSalesCount})`,
        this.formatUSD(cashSalesUSD),
        this.formatVES(cashSalesVES)
      ]
    ];
    if (includeVoided && voidedSales.length > 0) {
      executiveRows.push([
        `FACTURAS ANULADAS (${voidedSales.length})`,
        this.formatUSD(voidedTotalUSD),
        this.formatVES(voidedTotalVES)
      ]);
    }
    executiveRows.push([
      'TOTAL NETO',
      this.formatUSD(netTotalUSD),
      this.formatVES(netTotalVES)
    ]);
    autoTable(doc, {
      startY: yPos,
      head: [['INDICADOR', 'USD / CANTIDAD', 'Bs']],
      body: executiveRows,
      theme: 'grid',
      tableWidth: 118,
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

    this.applyStandardReportFooter(doc);

    const blobUrl = URL.createObjectURL(doc.output('blob'));
    window.open(blobUrl, '_blank');
  }

  async printARPaymentReceipt(params: {
    receiptNumber: string;
    customerName: string;
    customerId: string;
    saleCorrelativo: string;
    amountUSD: number;
    amountVES?: number;
    method: string;
    bank?: string;
    reference?: string;
    note?: string;
    operatorName: string;
    balanceAfterUSD: number;
    originalAmountUSD: number;
    timestamp?: Date;
  }) {
    const pw = 72;
    const margin = 2;
    const cw = pw - margin * 2;
    const ts = params.timestamp ?? new Date();

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 130] });
    doc.setFont('courier', 'bold');

    let y = margin + 3;

    // Header
    doc.setFontSize(9);
    doc.text('COSTAL ERP', pw / 2, y, { align: 'center' }); y += 5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.text('COMPROBANTE DE PAGO CxC', pw / 2, y, { align: 'center' }); y += 4;
    doc.text('================================', pw / 2, y, { align: 'center' }); y += 4;

    // Receipt info
    doc.setFont('courier', 'bold');
    doc.text(`N°: ${params.receiptNumber}`, margin, y); y += 4;
    doc.setFont('courier', 'normal');
    doc.text(`FECHA: ${ts.toLocaleDateString('es-VE')} ${ts.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`, margin, y); y += 4;
    doc.text(`OPERADOR: ${params.operatorName.substring(0, 28).toUpperCase()}`, margin, y); y += 5;

    doc.text('--------------------------------', pw / 2, y, { align: 'center' }); y += 4;

    // Client
    doc.setFont('courier', 'bold');
    doc.text('CLIENTE:', margin, y); y += 4;
    doc.setFont('courier', 'normal');
    const clientLines = doc.splitTextToSize(params.customerName.toUpperCase(), cw);
    clientLines.forEach((line: string) => { doc.text(line, margin, y); y += 3.5; });
    doc.text(`RIF/CI: ${params.customerId}`, margin, y); y += 4;
    doc.text(`FACTURA REF: ${params.saleCorrelativo}`, margin, y); y += 4;

    doc.text('--------------------------------', pw / 2, y, { align: 'center' }); y += 4;

    // Payment detail
    doc.setFont('courier', 'bold');
    doc.text('PAGO RECIBIDO:', margin, y); y += 4;
    doc.setFont('courier', 'normal');
    doc.text(`METODO: ${params.method.toUpperCase()}`, margin, y); y += 4;
    if (params.bank) { doc.text(`BANCO: ${params.bank.toUpperCase().substring(0, 28)}`, margin, y); y += 4; }
    if (params.reference) { doc.text(`REF: ${params.reference.substring(0, 28)}`, margin, y); y += 4; }

    doc.text('================================', pw / 2, y, { align: 'center' }); y += 4;

    doc.setFont('courier', 'bold');
    doc.setFontSize(9);
    doc.text('MONTO ABONADO:', margin, y);
    doc.text(`$ ${params.amountUSD.toFixed(2)}`, pw - margin, y, { align: 'right' }); y += 5;
    if (params.amountVES && params.amountVES > 0) {
      doc.setFontSize(7);
      doc.setFont('courier', 'normal');
      doc.text(`Bs. ${params.amountVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`, pw - margin, y, { align: 'right' }); y += 4;
    }

    doc.setFontSize(7);
    doc.setFont('courier', 'normal');
    doc.text('--------------------------------', pw / 2, y, { align: 'center' }); y += 4;
    doc.text(`Total factura:  $ ${params.originalAmountUSD.toFixed(2)}`, margin, y); y += 4;
    doc.setFont('courier', 'bold');
    const balColor = params.balanceAfterUSD <= 0 ? [0, 128, 0] : [180, 0, 0];
    doc.setTextColor(balColor[0], balColor[1], balColor[2]);
    doc.text(`Saldo restante: $ ${Math.max(0, params.balanceAfterUSD).toFixed(2)}`, margin, y); y += 4;
    doc.setTextColor(0, 0, 0);
    if (params.balanceAfterUSD <= 0) {
      doc.setFont('courier', 'bold');
      doc.text('*** CUENTA SALDADA ***', pw / 2, y, { align: 'center' }); y += 4;
    }

    doc.text('================================', pw / 2, y, { align: 'center' }); y += 4;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.text('Conserve este comprobante.', pw / 2, y, { align: 'center' }); y += 3;
    doc.text('Gracias por su pago.', pw / 2, y, { align: 'center' });

    const blobUrl = URL.createObjectURL(doc.output('blob'));
    window.open(blobUrl, '_blank');
  }
}

export const printService = new PrintService();

