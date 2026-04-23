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
const snippetsDir = path.join(root, 'scripts', 'snippets');
const dataServicePath = path.join(root, 'src/services/dataService.ts');
const financeViewPath = path.join(root, 'src/components/views/FinanceView.tsx');
const inventoryViewPath = path.join(root, 'src/components/views/InventoryView.tsx');

const purchaseInterfaces = read(path.join(snippetsDir, 'purchaseInterfaces.txt'));
const purchaseMethods = read(path.join(snippetsDir, 'purchaseMethods.txt'));
const addStockCompat = read(path.join(snippetsDir, 'addStockCompat.txt'));

let dataService = read(dataServicePath);
let financeView = read(financeViewPath);
let inventoryView = read(inventoryViewPath);

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

dataService = insertBefore(
  dataService,
  `  async getBankTransactions(input: {`,
  purchaseMethods,
  'métodos de compra'
);

dataService = replaceBetweenExclusive(
  dataService,
  `  async addStock(sku: string, qtyUnits: number, costUSD: number, expiry: Date, warehouse: string = 'Galpon D3', supplier?: string, paymentType?: 'CASH' | 'CREDIT', invoiceImage?: string) {`,
  `  async registerSale(sale: Omit<SaleHistoryEntry, 'timestamp'>): Promise<SaleHistoryEntry | null> {`,
  addStockCompat,
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
