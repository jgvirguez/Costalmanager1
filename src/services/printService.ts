import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SaleHistoryEntry, dataService } from './dataService';
import { formatQuantity } from '../utils/costCalculations';
import { compareSalesReportPdfRows } from '../utils/reportSort';

export interface LetraOptions {
  ciudad?: string;
  creditDays?: number;
  domicilioLibrado?: string;
  condicionesPago?: string;
  librador?: string;
  libradorRif?: string;
}

class PrintService {
  private roundMoney(value: number): number {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
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

  private isCreditSaleByBusinessRule(sale: any): boolean {
    const correlativo = String(sale?.correlativo ?? '').trim().toUpperCase();
    const compactCorrelativo = correlativo.replace(/\s+/g, '');
    const hasCreditCorrelativo = compactCorrelativo.startsWith('C-')
      || /^C\d+/.test(compactCorrelativo)
      || /(^|[^A-Z0-9])C-\d+/.test(compactCorrelativo);
    const hasCashCorrelativo = compactCorrelativo.startsWith('G-')
      || /^G\d+/.test(compactCorrelativo)
      || /(^|[^A-Z0-9])G-\d+/.test(compactCorrelativo);
    if (hasCreditCorrelativo) return true;
    if (hasCashCorrelativo) return false;

    const creditOutstandingUSD = Number(sale?.creditOutstandingUSD ?? 0) || 0;
    if (creditOutstandingUSD > 0.0001) return true;

    const payments = Array.isArray(sale?.payments) ? sale.payments : [];
    const hasCreditPaymentLine = payments.some((p: any) => {
      const method = String(p?.method ?? '').trim().toLowerCase();
      return method === 'credit' || method === 'credito' || method === 'crédito';
    });
    if (hasCreditPaymentLine) return true;

    const method = String(sale?.paymentMethod ?? '').trim().toUpperCase();
    return method === 'CREDIT' || method === 'CRÉDITO' || method === 'CREDITO';
  }

  private getReportOperatorLabel(): string {
    const user = dataService.getCurrentUser();
    const byName = String(user?.name ?? '').trim();
    const byEmail = String(user?.email ?? '').trim();
    return byName || byEmail || 'Sistema';
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

  async printInvoice(sale: SaleHistoryEntry, preferredCurrency: 'VES' | 'USD' = 'VES', letraOptions?: LetraOptions) {
    // Optimizado para XP-N160II (80mm con ancho de impresión de 72mm)
    // Manteniendo el estilo de fuente pequeño y compacto solicitado.
    const pw = 72;
    const margin = 2;
    const contentWidth = pw - (margin * 2);

    const isCredit = (sale as any).creditOutstandingUSD > 0 || sale.paymentMethod?.toUpperCase() === 'CREDIT';

    if (isCredit) {
      await this.printLetterCreditInvoice(sale, preferredCurrency, letraOptions);
      return;
    }

    // Altura dinámica: base + items + address lines + captures + footer
    // OPTIMIZADO: Reducido espacio en blanco para ahorrar papel térmico
    const addrExtraLines = sale.client.address ? Math.ceil(sale.client.address.length / 28) : 0;
    const phoneExtra = sale.client.phone ? 3.5 : 0;
    const estimatedHeight = 55 + (sale.items.length * 5) + addrExtraLines * 4 + phoneExtra + (sale.captures?.length || 0) * 45;

    // Altura mínima reducida de 140mm a 85mm para facturas pequeñas
    const finalHeight = Math.max(85, estimatedHeight);

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pw, finalHeight]
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
      y += (addrLines.length - 1) * 3.5;
    }
    y += 3.5;
    doc.text(`FECHA: ${sale.timestamp.toLocaleDateString()} ${sale.timestamp.toLocaleTimeString()}`, margin, y);
    y += 3.5;
    const operLines = doc.splitTextToSize(`OPERADOR: ${(sale.operatorName ?? 'SISTEMA').toUpperCase()}`, contentWidth);
    doc.text(operLines, margin, y);
    y += (operLines.length - 1) * 3.5;
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
      const descStr = doc.splitTextToSize(item.description.toUpperCase(), contentWidth - 25);

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
      doc.text(descStr, margin + 10, y);
      doc.text(totalStr, pw - margin, y, { align: 'right' });

      y += (descStr.length * 3.5) + 1;
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
    doc.text('MANTENGA ESTE TICKET PARA DEVOLUCIONES', pw / 2, y, { align: 'center' });
    y += 3.5;
    doc.text(`${(sale.id || 'S/ID').toString().slice(0, 8).toUpperCase()}`, pw / 2, y, { align: 'center' });

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
    const doc = new jsPDF({ format: 'letter', unit: 'mm' });
    const margin = 20;
    let y = 25;

    // --- LÓGICA DE PRECIO SEGÚN MONEDA ---
    // creditMeta contiene rateInternal y rateBCV guardados al registrar la venta
    const rateInternal: number = (sale as any).creditMeta?.rateInternal || (sale as any).exchangeRate || 1;
    const rateBCV: number = (sale as any).creditMeta?.rateBCV || (sale as any).exchangeRate || 1;
    // totalUSD almacenado = precio internalizado (para pagos en Bs)
    // Para pagos en USD físico el precio nominal es totalUSD directamente
    // creditCurrency guardado en creditMeta tiene prioridad; fallback: inferir del paymentMethod
    const savedCreditCurrency: string = (sale as any).creditMeta?.creditCurrency ?? '';
    const isUSDPayment = savedCreditCurrency === 'USD'
      || (!savedCreditCurrency && ['cash_usd','zelle','digital_usd','CASH_USD','ZELLE','DIGITAL_USD'].includes(sale.paymentMethod ?? ''));
    // Precio nominal USD (sin ajuste de tasa interna) - precio de lista
    const nominalUSD = Math.abs(sale.totalUSD);
    
    // CORRECCIÓN: Calcular total Bs pagado SUMANDO los pagos registrados (más confiable que sale.totalVES)
    // Esto asegura que se use el monto real pagado por el cliente en Bs
    const payments = (sale as any).payments || [];
    const vesMethods = ['cash_ves', 'mobile', 'transfer', 'debit', 'biopago'];
    const totalVESPaid = payments.reduce((sum: number, p: any) => {
      // Si el método es VES, sumar amountVES directamente
      if (vesMethods.includes(p.method)) {
        return sum + Math.abs(Number(p.amountVES || 0));
      }
      // Si el método es USD pero hay amountVES (pago mixto), también sumar
      if (p.amountVES > 0) {
        return sum + Math.abs(Number(p.amountVES || 0));
      }
      return sum;
    }, 0);
    
    // CORRECCIÓN: Cuando paga en Bs y factura es USD, mostrar equivalente USD a tasa BCV
    // Ejemplo: Producto $2.60, paga 1,690 Bs (tasa interna 650), factura USD debe mostrar 1,690/36.50 = $46.30
    const equivalentUSD_BCV = (totalVESPaid > 0 && rateBCV > 0) ? totalVESPaid / rateBCV : nominalUSD;
    // Total en Bs a BCV (para mostrar cuando cliente paga en USD pero quiere ver en Bs)
    const totalVESAtBCV = nominalUSD * rateBCV;
    // Total en Bs a tasa interna (lo que realmente pagó el cliente en Bs)
    const totalVESInternal = totalVESPaid > 0 ? totalVESPaid : (nominalUSD * rateInternal);

    // Seleccionar los valores a mostrar según preferredCurrency
    // Si imprime USD: mostrar precio en $
    //   - Si pago en USD → precio nominal ($2.60)
    //   - Si pago en Bs  → equivalente USD calculado a tasa BCV ($46.30)
    // Si imprime Bs: mostrar precio en Bs
    //   - Si pago en USD → precio nominal × BCV (Bs 94.90 si BCV=36.50)
    //   - Si pago en Bs  → monto Bs pagado a tasa interna (Bs 1,690)
    const displayUSD = isUSDPayment ? nominalUSD : equivalentUSD_BCV;
    const displayVES = isUSDPayment ? totalVESAtBCV : totalVESInternal;
    const displayTotal = preferredCurrency === 'USD'
      ? `$ ${displayUSD.toFixed(3)}`
      : `Bs. ${displayVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}`;
    const letraTotal = preferredCurrency === 'USD' ? displayUSD : displayVES;
    const letraLabel = preferredCurrency === 'USD' ? 'DÓLARES ESTADOUNIDENSES' : 'BOLÍVARES';
    const letraSymbol = preferredCurrency === 'USD' ? '$' : 'Bs.';

    // Calcular precios por ítem proporcionales al total seleccionado
    const rawSubtotalUSD = sale.items.reduce((acc, item) => acc + (item.qty * item.priceUSD), 0);

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
    if (sale.client.phone) {
      doc.text(`TELÉFONO: ${sale.client.phone}`, margin, y);
      y += 5;
    }
    if (sale.client.address) {
      const addrLines = doc.splitTextToSize(`DIRECCIÓN: ${sale.client.address.toUpperCase()}`, 90);
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

      doc.setFontSize(8.5); doc.setFont('helvetica', 'bold');
      const day = sale.timestamp.getDate();
      const month = sale.timestamp.getMonth() + 1;
      const year = sale.timestamp.getFullYear();

      // Vencimiento: usa creditDays del cliente o de opts, fallback 10 días
      const clientCreditDays = (sale.client as any)?.creditDays ?? 0;
      const creditDays = opts?.creditDays ?? (clientCreditDays > 0 ? clientCreditDays : 10);
      const dueDate = new Date(sale.timestamp);
      dueDate.setDate(dueDate.getDate() + creditDays);

      // Campos configurables con defaults
      const ciudad = (opts?.ciudad ?? 'BARQUISIMETO').toUpperCase();
      const domicilioLibrado = (opts?.domicilioLibrado ?? (sale.client.address || 'BARQUISIMETO, EDO. LARA')).toUpperCase();
      const condicionesPago = (opts?.condicionesPago ?? `A ${creditDays} DÍAS FECHA`).toUpperCase();

      const baseX = margin + 25;
      const baseTop = startY + 6.5;
      const totalStr = letraTotal.toLocaleString('es-VE', { minimumFractionDigits: 2 });

      // Línea 1: N°, Ciudad, Fecha, Monto
      doc.text(`${sale.correlativo}`, baseX + 5, baseTop);
      doc.text(ciudad, baseX + 38, baseTop);
      doc.text(`${day}`, baseX + 81, baseTop);
      doc.text(`${month}`, baseX + 98, baseTop);
      doc.text(`${year}`, baseX + 115, baseTop);
      doc.text(`${letraSymbol} ${totalStr}`, margin + w - 50, baseTop);

      // Línea 2: Vencimiento
      const vY = baseTop + 8.5;
      doc.text(`${dueDate.getDate()}`, baseX + 10, vY);
      doc.text(`${dueDate.getMonth() + 1}`, baseX + 32, vY);
      doc.text(`${dueDate.getFullYear()}`, baseX + 65, vY);

      // Línea 3: Condiciones de pago
      doc.setFontSize(7.5);
      doc.text(condicionesPago, baseX + 5, vY + 14);

      // Línea 4: Suma en letras
      doc.text(`*** LA SUMA DE ${letraSymbol} ${totalStr} (${letraLabel}) ***`, baseX + 5, vY + 22.5);

      // Línea 5: Lugar de pago / Valor
      const pY = vY + 31.5;
      doc.setFontSize(8.5);
      doc.text(ciudad, baseX + 22, pY);
      doc.text(`${totalStr}`, baseX + 105, pY);

      // Línea 6: Librado
      const lY = pY + 11.5;
      doc.text(`${sale.client.name.toUpperCase()}`, baseX + 25, lY);
      doc.setFontSize(7);
      doc.text(`RIF: ${sale.client.id} - TEL: ${sale.client.phone || 'S/N'}`, baseX + 5, lY + 6);
      doc.text(`DOMICILIO: ${domicilioLibrado}`, baseX + 5, lY + 12);

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
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });
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
    const creditSales = activeSales.filter((sale) => this.isCreditSaleByBusinessRule(sale));
    const cashSales = activeSales.filter((sale) => !this.isCreditSaleByBusinessRule(sale));
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

    doc.setFontSize(12); doc.setFont('helvetica', 'bold');
    doc.setTextColor(0);
    doc.text(`TOTAL $:  ${this.formatNumber(netTotalUSD, 2)}`, 200, 22, { align: 'right' });
    doc.text(`TOTAL Bs:  ${this.formatNumber(netTotalVES, 2)}`, 200, 28, { align: 'right' });

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

    // Signatures (always below summary; if no space, add new page)
    const summaryFinalY = Number((doc as any).lastAutoTable?.finalY ?? finalY);
    let signY = summaryFinalY + 26;
    if (signY > 258) {
      doc.addPage();
      signY = 245;
    }
    doc.setFontSize(8);
    doc.setTextColor(0);
    doc.text('__________________________', 40, signY);
    doc.text('AUTORIZADO POR FINANZAS', 40, signY + 4);
    doc.text('__________________________', 140, signY);
    doc.text('AUDITORÍA DE CONTROL', 140, signY + 4);

    // --- NUMERACIÓN DE PÁGINAS ---
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Página ${i} de ${totalPages}`, 200, 270, { align: 'right' });
    }

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

