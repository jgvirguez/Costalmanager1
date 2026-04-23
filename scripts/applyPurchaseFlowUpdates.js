const fs = require('fs');
const path = require('path');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function replaceOnce(source, target, replacement, label) {
  if (!source.includes(target)) {
    throw new Error(`No se encontró el bloque esperado para ${label}.`);
  }
  return source.replace(target, replacement);
}

function insertBefore(source, marker, insertion, label) {
  const index = source.indexOf(marker);
  if (index === -1) {
    throw new Error(`No se encontró el marcador para ${label}.`);
  }
  return `${source.slice(0, index)}${insertion}${source.slice(index)}`;
}

function replaceBetweenExclusive(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`No se encontró el inicio para ${label}.`);
  }
  const end = source.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`No se encontró el fin para ${label}.`);
  }
  return `${source.slice(0, start)}${replacement}${source.slice(end)}`;
}

const root = 'c:/Sistema';
const dataServicePath = path.join(root, 'src/services/dataService.ts');
const financeViewPath = path.join(root, 'src/components/views/FinanceView.tsx');
const inventoryViewPath = path.join(root, 'src/components/views/InventoryView.tsx');

let dataService = read(dataServicePath);
let financeView = read(financeViewPath);
let inventoryView = read(inventoryViewPath);

const purchaseInterfaces = `export interface CreateProductInput {
  code?: string;
  description: string;
  unit: string;
  priceUSD?: number;
  minStock?: number;
  conversionRatio?: number;
  baseUnit?: string;
}

export interface PurchaseRegistrationInput {
  sku?: string;
  newProduct?: CreateProductInput;
  supplier: string;
  invoiceNumber: string;
  invoiceDate: Date;
  expiryDate: Date;
  qty: number;
  costUSD: number;
  totalInvoiceUSD: number;
  paymentType: 'CASH' | 'CREDIT';
  files?: File[];
  warehouse?: string;
}

export interface PurchaseRegistrationResult {
  sku: string;
  createdProduct: boolean;
  apEntryId?: string;
  supportsUploadError?: string;
}

`;

dataService = insertBefore(
  dataService,
  `export interface ARPaymentRecord {`,
  purchaseInterfaces,
  'interfaces de compra'
);

dataService = replaceOnce(
  dataService,
  `        lotes: (p.inventory_batches || []).map((b: any) => ({
          id: b.id,
          sku: b.product_code,
          qty: Number(b.quantity),
          expiry: new Date(b.expiry_date),
          warehouse: b.warehouse,
          costUSD: Number(b.cost_usd)
        }))`,
  `        lotes: (p.inventory_batches || []).map((b: any) => ({
          id: b.id,
          sku: b.product_code,
          qty: Number(b.quantity),
          expiry: new Date(b.expiry_date),
          warehouse: b.warehouse,
          costUSD: Number(b.cost_usd),
          supplier: b.supplier ?? undefined,
          paymentType: b.payment_type ?? undefined,
          invoiceImage: b.invoice_image_url ?? undefined
        }))`,
  'mapeo de lotes'
);

const dataServiceMethods = `  private buildNextProductCode() {
    const maxCode = this.products.reduce((max, product) => {
      const match = String(product?.code ?? '').trim().toUpperCase().match(/^P-(\d+)$/);
      const numeric = match ? Number(match[1]) : 0;
      return Number.isFinite(numeric) && numeric > max ? numeric : max;
    }, 0);
    return \`P-\${String(maxCode + 1).padStart(4, '0')}\`;
  }

  async createProduct(input: CreateProductInput): Promise<ProductStock> {
    const description = String(input?.description ?? '').trim().toUpperCase();
    const unit = String(input?.unit ?? 'UN').trim().toUpperCase();
    const code = String(input?.code ?? '').trim().toUpperCase() || this.buildNextProductCode();
    const priceUSD = roundMoney(Number(input?.priceUSD ?? 0) || 0);
    const minStock = Number(input?.minStock ?? 0) || 0;
    const conversionRatio = Number(input?.conversionRatio ?? 1) || 1;
    const baseUnit = String(input?.baseUnit ?? unit).trim().toUpperCase() || unit;

    if (!description) {
      throw new Error('La descripción del producto nuevo es obligatoria.');
    }

    const existing = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === code);
    if (existing) {
      throw new Error(\`Ya existe un producto con el código \${code}.\`);
    }

    const payload = {
      code,
      description,
      unit,
      price_usd: priceUSD,
      min_stock: minStock,
      conversion_ratio: conversionRatio,
      base_unit: baseUnit
    };

    const { error } = await supabase.from('products').insert(payload);
    if (error) {
      throw new Error(String(error?.message ?? 'No se pudo crear el producto nuevo.'));
    }

    const createdProduct: ProductStock = {
      code,
      description,
      unit,
      priceUSD,
      prices: [
        priceUSD,
        priceUSD * 0.95,
        priceUSD * 0.90,
        priceUSD * 0.85,
        priceUSD * 0.80
      ],
      min: minStock,
      conversionRatio,
      baseUnit,
      lotes: []
    };

    this.products.push(createdProduct);
    this.notify();
    return createdProduct;
  }

  async registerPurchaseEntry(input: PurchaseRegistrationInput): Promise<PurchaseRegistrationResult> {
    const qty = Number(input?.qty ?? 0) || 0;
    const costUSD = Number(input?.costUSD ?? 0) || 0;
    const totalInvoiceUSD = roundMoney(Number(input?.totalInvoiceUSD ?? 0) || (qty * costUSD));
    const supplier = String(input?.supplier ?? '').trim();
    const invoiceNumber = String(input?.invoiceNumber ?? '').trim().toUpperCase();
    const warehouse = String(input?.warehouse ?? 'Galpon D3').trim() || 'Galpon D3';
    const paymentType = input?.paymentType === 'CREDIT' ? 'CREDIT' : 'CASH';
    const invoiceDate = input?.invoiceDate instanceof Date ? input.invoiceDate : new Date(input?.invoiceDate as any);
    const expiryDate = input?.expiryDate instanceof Date ? input.expiryDate : new Date(input?.expiryDate as any);
    const files = Array.from(input?.files || []).filter(Boolean) as File[];

    if (!supplier) throw new Error('Debe indicar el proveedor.');
    if (!invoiceNumber) throw new Error('Debe indicar el número de factura.');
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('La cantidad debe ser mayor a cero.');
    if (!Number.isFinite(costUSD) || costUSD <= 0) throw new Error('El costo unitario debe ser mayor a cero.');
    if (!Number.isFinite(totalInvoiceUSD) || totalInvoiceUSD <= 0) throw new Error('El monto total de la factura debe ser mayor a cero.');
    if (!(invoiceDate instanceof Date) || Number.isNaN(invoiceDate.getTime())) throw new Error('La fecha de factura no es válida.');
    if (!(expiryDate instanceof Date) || Number.isNaN(expiryDate.getTime())) throw new Error('La fecha de caducidad no es válida.');

    let createdProduct = false;
    let resolvedProduct: ProductStock | undefined;
    let sku = String(input?.sku ?? '').trim().toUpperCase();

    if (sku) {
      resolvedProduct = this.products.find((product) => String(product?.code ?? '').trim().toUpperCase() === sku);
      if (!resolvedProduct) {
        throw new Error('El producto seleccionado ya no existe en el catálogo.');
      }
    } else if (input?.newProduct) {
      resolvedProduct = await this.createProduct({
        ...input.newProduct,
        priceUSD: Number(input?.newProduct?.priceUSD ?? costUSD) || costUSD,
        minStock: Number(input?.newProduct?.minStock ?? 0) || 0,
        conversionRatio: Number(input?.newProduct?.conversionRatio ?? 1) || 1,
        baseUnit: String(input?.newProduct?.baseUnit ?? input?.newProduct?.unit ?? 'UN').trim().toUpperCase()
      });
      sku = resolvedProduct.code;
      createdProduct = true;
    } else {
      throw new Error('Debe seleccionar un producto existente o crear uno nuevo.');
    }

    const inlineSupports = await this.buildInlineSupports(files);
    const safeInvoice = invoiceNumber.replace(/[^A-Z0-9_-]+/gi, '_');
    const upload = await this.uploadSupportFiles(`purchase_invoices/${sku}/${safeInvoice}_${Date.now()}`, files);
    const supportsToPersist = Array.isArray(upload.supports) && upload.supports.length > 0 ? upload.supports : inlineSupports;
    const primarySupport = supportsToPersist[0]?.url ?? '';

    const { data: newBatch, error } = await supabase.from('inventory_batches').insert({
      product_code: sku,
      quantity: qty,
      cost_usd: costUSD,
      expiry_date: expiryDate.toISOString().split('T')[0],
      purchase_date: invoiceDate.toISOString().split('T')[0],
      warehouse,
      supplier,
      payment_type: paymentType,
      invoice_image_url: primarySupport
    }).select().single();

    if (error) {
      throw new Error(String(error?.message ?? 'No se pudo registrar la compra en inventario.'));
    }

    await supabase.from('movements').insert({
      product_code: sku,
      type: 'IN',
      quantity: qty,
      warehouse,
      reason: `Compra ${invoiceNumber} · ${supplier} (${paymentType === 'CREDIT' ? 'CRÉDITO' : 'CONTADO'})`,
      operator: this.currentUser?.name ?? ''
    });

    let purchaseDocId = '';
    try {
      const purchaseDoc = await addDoc(collection(db, 'purchase_entries'), {
        sku,
        productDescription: resolvedProduct?.description ?? String(input?.newProduct?.description ?? '').trim().toUpperCase(),
        unit: resolvedProduct?.unit ?? String(input?.newProduct?.unit ?? '').trim().toUpperCase(),
        supplier,
        invoiceNumber,
        invoiceDate: invoiceDate.toISOString(),
        expiryDate: expiryDate.toISOString(),
        qty,
        costUSD,
        totalInvoiceUSD,
        warehouse,
        paymentType,
        supports: supportsToPersist,
        storageProvider: upload.storageProvider,
        storageBucket: upload.storageBucket ?? '',
        supportsUploadError: upload.supportsUploadError ?? '',
        batchId: String(newBatch?.id ?? ''),
        actor: this.currentUser?.name ?? '',
        createdAt: new Date().toISOString()
      } as any);
      purchaseDocId = purchaseDoc.id;
    } catch (purchaseMetaError) {
      console.warn('No se pudo guardar metadata de la compra:', purchaseMetaError);
    }

    let apEntryId: string | undefined;
    if (paymentType === 'CREDIT') {
      const apEntry = await this.addAPEntry(
        supplier,
        `Factura ${invoiceNumber}: ${resolvedProduct?.description ?? sku} (${qty} ${resolvedProduct?.unit ?? ''})`,
        totalInvoiceUSD,
        15
      );
      apEntryId = apEntry?.id;

      if (purchaseDocId) {
        try {
          await setDoc(doc(db, 'purchase_entries', purchaseDocId), {
            apEntryId: apEntryId ?? ''
          } as any, { merge: true });
        } catch (purchaseApLinkError) {
          console.warn('No se pudo vincular la compra con AP:', purchaseApLinkError);
        }
      }
    }

    await this.init();
    return {
      sku,
      createdProduct,
      apEntryId,
      supportsUploadError: upload.supportsUploadError ?? ''
    };
  }

`;

dataService = insertBefore(
  dataService,
  `  async getBankTransactions(input: {`,
  dataServiceMethods,
  'métodos de compra'
);

dataService = replaceBetweenExclusive(
  dataService,
  `  async addStock(sku: string, qtyUnits: number, costUSD: number, expiry: Date, warehouse: string = 'Galpon D3', supplier?: string, paymentType?: 'CASH' | 'CREDIT', invoiceImage?: string) {`,
  `  async registerSale(sale: Omit<SaleHistoryEntry, 'timestamp'>): Promise<SaleHistoryEntry | null> {`,
  `  async addStock(sku: string, qtyUnits: number, costUSD: number, expiry: Date, warehouse: string = 'Galpon D3', supplier?: string, paymentType?: 'CASH' | 'CREDIT', invoiceImage?: string) {
    const { error } = await supabase.from('inventory_batches').insert({
      product_code: sku,
      quantity: qtyUnits,
      cost_usd: costUSD,
      expiry_date: expiry.toISOString().split('T')[0],
      purchase_date: new Date().toISOString().split('T')[0],
      warehouse: warehouse,
      supplier: supplier,
      payment_type: paymentType,
      invoice_image_url: invoiceImage
    }).select().single();

    if (error) {
      console.error('Error agregando stock:', error);
    }

    await supabase.from('movements').insert({
      product_code: sku,
      type: 'IN',
      quantity: qtyUnits,
      warehouse: warehouse,
      reason: `Entrada: ${supplier || 'S/Proveedor'} (${paymentType === 'CREDIT' ? 'CRÉDITO' : 'CONTADO'})`,
      operator: this.currentUser.name
    });

    if (paymentType === 'CREDIT' && supplier) {
      await this.addAPEntry(
        supplier,
        `Factura Mercancía: ${sku} (${qtyUnits} kg)`,
        qtyUnits * costUSD,
        15
      );
    }

    await this.init();
    return !error;
  }

`,
  'compatibilidad addStock'
);

financeView = replaceOnce(
  financeView,
  `import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  CreditCard, 
  Timer,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  History,
  Scale,
  RefreshCw,
  Users,
  Building2,
  Download,
  Package,
  X
} from 'lucide-react';
import { formatUnitCost } from '../../utils/costCalculations';
import { dataService } from '../../services/dataService';
import { reportService } from '../../services/reportService';
`,
  `import React, { useState, useEffect } from 'react';
import { 
  Landmark, 
  ArrowUpRight, 
  ArrowDownRight, 
  Wallet, 
  CreditCard, 
  Timer,
  FileText,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  History,
  Scale,
  RefreshCw,
  Users,
  Building2,
  Download
} from 'lucide-react';
import { dataService } from '../../services/dataService';
import { reportService } from '../../services/reportService';
import { PurchaseEntryModal } from '../modals/PurchaseEntryModal';
`,
  'imports FinanceView'
);

financeView = replaceOnce(
  financeView,
  `  const [newExpense, setNewExpense] = useState({ desc: '', amount: '', category: 'FIXED' as 'FIXED' | 'VARIABLE' });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    sku: '',
    supplier: '',
    qty: '',
    cost: '',
    expiry: '',
    paymentType: 'CASH' as 'CASH' | 'CREDIT'
  });
  const [purchaseSaving, setPurchaseSaving] = useState(false);
  const [purchaseError, setPurchaseError] = useState('');
`,
  `  const [newExpense, setNewExpense] = useState({ desc: '', amount: '', category: 'FIXED' as 'FIXED' | 'VARIABLE' });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
`,
  'estado de compra FinanceView'
);

financeView = replaceBetweenExclusive(
  financeView,
  `  const resetPurchaseForm = () => {`,
  `  const handleARPayment = (id: string) => {`,
  ``,
  'handlers de compra FinanceView'
);

financeView = replaceOnce(
  financeView,
  `                     onClick={() => {
                       resetPurchaseForm();
                       setShowPurchaseModal(true);
                     }}`,
  `                     onClick={() => setShowPurchaseModal(true)}`,
  'botón abrir compra FinanceView'
);

financeView = replaceBetweenExclusive(
  financeView,
  `      {showPurchaseModal && (`,
  `    </div>
  );
}`,
  `      {showPurchaseModal && (
        <PurchaseEntryModal
          products={stocks}
          onClose={() => setShowPurchaseModal(false)}
          onSaved={() => setShowPurchaseModal(false)}
        />
      )}
`,
  'modal compra FinanceView'
);

inventoryView = replaceOnce(
  inventoryView,
  `import { useHotkeys } from '../../utils/hotkeys';
`,
  `import { useHotkeys } from '../../utils/hotkeys';
import { PurchaseEntryModal } from '../modals/PurchaseEntryModal';
`,
  'import PurchaseEntryModal InventoryView'
);

inventoryView = replaceOnce(
  inventoryView,
  `      {showInputModal && (
        <InventoryInputModal
          stocks={stocks}
          onClose={() => setShowInputModal(false)}
          currentRate={exchangeRate}
          onConfirm={(sku, qty, cost, expiry, supplier, paymentType, image) => {
            dataService.addStock(sku, qty, cost, new Date(expiry), 'Galpon D3', supplier, paymentType, image);
            setShowInputModal(false);
          }}
        />
      )}`,
  `      {showInputModal && (
        <PurchaseEntryModal
          products={stocks}
          onClose={() => setShowInputModal(false)}
          onSaved={() => setShowInputModal(false)}
        />
      )}`,
  'modal compra InventoryView'
);

write(dataServicePath, dataService);
write(financeViewPath, financeView);
write(inventoryViewPath, inventoryView);

console.log('Cambios aplicados correctamente.');
