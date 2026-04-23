import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clipboard,
  FileImage,
  FileText,
  Package,
  PlusCircle,
  Search,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { dataService, ProductStock } from '../../services/dataService';
import { supplierService, Supplier } from '../../services/supplierService';
import { clientService } from '../../services/clientService';
import { normalizeDocumentId } from '../../utils/idNormalization';
import { useHotkeys } from '../../utils/hotkeys';

type PaymentType = 'CASH' | 'CREDIT';
type ProductMode = 'EXISTING' | 'NEW';

interface PurchaseEntryModalProps {
  products: ProductStock[];
  onClose: () => void;
  onSaved?: () => void;
  warehouse?: string;
  title?: string;
  subtitle?: string;
}

type CostCurrency = 'USD' | 'VES';

interface DraftLine {
  mode: ProductMode;
  sku: string;
  newCode: string;
  description: string;
  unit: string;
  qty: string;
  cost: string;
  expiry: string;
  batch: string;
  warehouse: string;
  costCurrency: CostCurrency;
  costVES: string;
  rateVES: string;
  minStock: string;
}

interface PurchaseLine {
  id: string;
  mode: ProductMode;
  sku?: string;
  newCode?: string;
  description: string;
  unit: string;
  qty: number;
  costUSD: number;
  expiry: string;
  batch: string;
  totalLineUSD: number;
  salePrices: number[];
  warehouse: string;
  minStock?: number;
}

const PURCHASE_UNITS = [
  { value: 'KG', label: 'Kilos' },
  { value: 'LT', label: 'Litros' },
  { value: 'SACO', label: 'Sacos' },
  { value: 'BULTO', label: 'Bultos' },
  { value: 'TOBO', label: 'Tobos' },
  { value: 'UN', label: 'Unidad(es)' }
];

const WAREHOUSES = [
  { value: 'Galpon D3', label: 'D3 - GALPÓN' },
  { value: 'Pesa D2', label: 'D2 - PESA' },
  { value: 'exibicion D1', label: 'D1 - EXHIBICIÓN' }
];

const PAYMENT_METHODS = [
  { value: 'cash_usd', label: 'Efectivo $' },
  { value: 'cash_ves', label: 'Efectivo Bs.' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'mobile', label: 'Pago Móvil' },
  { value: 'zelle', label: 'Zelle' },
  { value: 'debit', label: 'Débito / Biopago' }
];

const getPaymentMethodCurrency = (method: string): 'USD' | 'VES' => {
  const normalized = String(method ?? '').trim().toLowerCase();
  if (normalized === 'cash_usd' || normalized === 'zelle') return 'USD';
  return 'VES';
};

const toInputNumber = (value: string) => Number(String(value ?? '').replace(',', '.')) || 0;
const roundTo = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};
const roundMoney = (value: number) => roundTo(value, 2);
const roundPrice = (value: number) => roundTo(value, 8);
const formatBytes = (size: number) => {
  if (!Number.isFinite(size) || size <= 0) return '0 KB';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
};
const formatMoney = (value: number) => `$ ${roundMoney(value).toFixed(2)}`;
const formatQty = (value: number) => roundTo(value, 4).toFixed(4).replace(/\.?(0+)$/, '');
const formatPricePreview = (value: number) => roundPrice(value).toFixed(4);

const buildSalePrices = (salePriceP1: number) => {
  const p1 = roundPrice(salePriceP1);
  return [
    p1,
    roundPrice(p1 * 0.95),
    roundPrice(p1 * 0.9),
    roundPrice(p1 * 0.85),
    roundPrice(p1 * 0.8)
  ];
};

const getUnitLabel = (unit: string) => PURCHASE_UNITS.find((item) => item.value === unit)?.label || unit;

const createDraftLine = (mode: ProductMode = 'EXISTING', defaultWh = 'Galpon D3', rateVES = ''): DraftLine => ({
  mode,
  sku: '',
  newCode: '',
  description: '',
  unit: 'KG',
  qty: '',
  cost: '',
  expiry: '',
  batch: '',
  warehouse: defaultWh,
  costCurrency: 'USD',
  costVES: '',
  rateVES,
  minStock: '0'
});

export function PurchaseEntryModal({
  products,
  onClose,
  onSaved,
  warehouse = 'Galpon D3',
  title = 'Registrar compra de mercancía',
  subtitle = 'La compra entra al inventario y queda lista para facturar'
}: PurchaseEntryModalProps) {
  const [form, setForm] = useState({
    supplier: '',
    supplierDocument: '',
    supplierPhone: '',
    supplierAddress: '',
    invoiceNumber: '',
    invoiceDate: new Date().toISOString().split('T')[0],
    invoiceDueDate: '',
    paymentType: 'CASH' as PaymentType,
    paymentMethod: 'transfer',
    bankId: '',
    bankName: '',
    bankAccountId: '',
    bankAccountLabel: '',
    reference: ''
  });
  const [invoiceRateVES, setInvoiceRateVES] = useState<string>('');
  const [draftLine, setDraftLine] = useState<DraftLine>(() => createDraftLine('EXISTING', warehouse));
  const [items, setItems] = useState<PurchaseLine[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [invoiceDuplicateWarning, setInvoiceDuplicateWarning] = useState<string | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  
  // Estado para búsqueda inteligente de productos
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductIndex, setSelectedProductIndex] = useState(-1);

  // Estado para búsqueda de proveedores/clientes unificados
  const [realtimeTick, setRealtimeTick] = useState(0);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [showSupplierSuggestions, setShowSupplierSuggestions] = useState(false);
  const [selectedSupplierIndex, setSelectedSupplierIndex] = useState(-1);
  
  const unifiedSuppliers = useMemo(() => {
    const sList = supplierService.getSuppliers();
    const cList = clientService.getClients();
    
    // Unir ambas listas priorizando proveedores y deduplicando por ID normalizado
    const map: Record<string, any> = {};
    
    // Primero clientes (como base)
    cList.forEach(c => {
      const id = normalizeDocumentId(c.id);
      map[id] = { id, name: c.name, phone: c.phone, address: c.address };
    });
    
    // Luego proveedores (sobreescriben si hay duplicado porque tienen más data de proveedor)
    sList.forEach(s => {
      const id = normalizeDocumentId(s.id);
      map[id] = { ...s, id };
    });
    
    return Object.values(map);
  }, [realtimeTick]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return [];
    return unifiedSuppliers.filter(s => 
      s.name.toLowerCase().includes(q) || 
      s.id.toLowerCase().includes(q) ||
      normalizeDocumentId(s.id).toLowerCase().includes(q)
    );
  }, [unifiedSuppliers, supplierSearch]);

  React.useEffect(() => {
    const unsubS = supplierService.subscribe(() => setRealtimeTick(t => t + 1));
    const unsubC = clientService.subscribe(() => setRealtimeTick(t => t + 1));
    return () => {
      unsubS();
      unsubC();
    };
  }, []);

  const supplierRef = React.useRef<HTMLDivElement>(null);
  const productSearchRef = useRef<HTMLInputElement>(null);

  useHotkeys({
    F10: () => { if (!saving && items.length > 0 && !showConfirm && !invoiceDuplicateWarning && !checkingDuplicate) handleRequestConfirm(); },
    F2:  () => { productSearchRef.current?.focus(); productSearchRef.current?.select(); },
    F4:  () => { handleAddItem(); },
    Escape: () => { if (showConfirm) { setShowConfirm(false); } else if (!saving) { onClose(); } }
  });

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (supplierRef.current && !supplierRef.current.contains(e.target as Node)) {
        setShowSupplierSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  React.useEffect(() => {
    const invoiceNumber = String(form.invoiceNumber ?? '').trim();
    const supplier = String(form.supplier ?? '').trim();
    setInvoiceDuplicateWarning(null);
    if (!invoiceNumber || !supplier) return;
    setCheckingDuplicate(true);
    const timer = setTimeout(async () => {
      try {
        const result = await dataService.checkInvoiceDuplicate(invoiceNumber, supplier);
        if (result.duplicate) {
          setInvoiceDuplicateWarning(
            `La factura #${invoiceNumber.toUpperCase()} ya fue registrada para "${supplier}"` +
            (result.date ? ` el ${result.date}` : '') + '.'
          );
        } else {
          setInvoiceDuplicateWarning(null);
        }
      } catch {
        setInvoiceDuplicateWarning(null);
      } finally {
        setCheckingDuplicate(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [form.invoiceNumber, form.supplier]);

  const [banks, setBanks] = useState(() => dataService.getBanks());
  React.useEffect(() => {
    setBanks(dataService.getBanks());
    const unsub = dataService.subscribe(() => setBanks(dataService.getBanks()));
    return unsub;
  }, []);
  const paymentCurrency = useMemo(() => getPaymentMethodCurrency(form.paymentMethod), [form.paymentMethod]);
  const compatibleBanks = useMemo(
    () => {
      const filtered = banks.filter((bank) => bank.active && ((bank.supportedMethods || []).length === 0 || (bank.supportedMethods || []).includes(form.paymentMethod)));
      console.log('🏦 Bancos compatibles con', form.paymentMethod, ':', filtered);
      return filtered;
    },
    [banks, form.paymentMethod]
  );
  const selectedBank = useMemo(
    () => compatibleBanks.find((bank) => String(bank.id ?? '') === String(form.bankId ?? '')),
    [compatibleBanks, form.bankId]
  );
  const availableAccounts = useMemo(() => {
    const accounts = Array.isArray(selectedBank?.accounts) ? selectedBank.accounts : [];
    const currencyMatches = accounts.filter((account) => String(account.currency ?? 'VES').trim().toUpperCase() === paymentCurrency);
    console.log('🏦 Cuentas disponibles para', selectedBank?.name, ':', currencyMatches);
    return currencyMatches.length > 0 ? currencyMatches : accounts;
  }, [selectedBank, paymentCurrency]);

  React.useEffect(() => {
    if (draftLine.mode === 'NEW' && !draftLine.newCode) {
      // CORRECCIÓN: Generar código único usando función asíncrona de base de datos
      const generateUniqueCode = async () => {
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          try {
            const nextCode = await dataService.getNextProductCode();
            
            // Validar contra productos existentes
            const existsInProducts = products.some(p => 
              String(p.code ?? '').trim().toUpperCase() === nextCode
            );
            
            // Validar contra items ya agregados en esta compra
            const existsInItems = items.some(item => 
              item.mode === 'NEW' && item.newCode === nextCode
            );
            
            if (!existsInProducts && !existsInItems) {
              return nextCode;
            }
            
            attempts++;
          } catch (error) {
            console.warn('Error generando código:', error);
            attempts++;
          }
        }
        
        // Si no encuentra código único después de varios intentos, usar timestamp
        return `P-${Date.now().toString().slice(-4)}`;
      };
      
      generateUniqueCode().then(uniqueCode => {
        updateDraftLine({ newCode: uniqueCode });
      }).catch(error => {
        console.error('Error generando código único:', error);
        // Fallback: usar timestamp
        updateDraftLine({ newCode: `P-${Date.now().toString().slice(-4)}` });
      });
    }
  }, [draftLine.mode, items, products]);

  React.useEffect(() => {
    if (form.paymentType !== 'CASH') return;
    const selectedStillCompatible = compatibleBanks.some((bank) => String(bank.id ?? '') === String(form.bankId ?? ''));
    if (!selectedStillCompatible && form.bankId) {
      updateForm({ bankId: '', bankName: '', bankAccountId: '', bankAccountLabel: '' });
    }
  }, [compatibleBanks, form.bankId, form.paymentType]);

  React.useEffect(() => {
    if (form.paymentType !== 'CASH') return;
    const exists = availableAccounts.some((account) => String(account.id ?? '') === String(form.bankAccountId ?? ''));
    if (!exists) {
      const fallback = availableAccounts[0];
      updateForm({
        bankAccountId: String(fallback?.id ?? ''),
        bankAccountLabel: String(fallback?.label ?? '')
      });
    }
  }, [availableAccounts, form.bankAccountId, form.paymentType]);

  const availableProducts = useMemo(
    () => [...products].sort((a, b) => `${a.description}`.localeCompare(`${b.description}`)),
    [products]
  );

  const supplierPurchaseHistory = useMemo(() => {
    const name = String(form.supplier ?? '').trim().toLowerCase();
    if (!name) return [];
    return dataService.getAPEntries()
      .filter(e => String(e.supplier ?? '').trim().toLowerCase().includes(name))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [form.supplier]);

  // Filtro para búsqueda inteligente de productos
  const filteredProducts = useMemo(
    () => availableProducts.filter(p => 
      p.code.toLowerCase().includes(productSearch.toLowerCase()) || 
      p.description.toLowerCase().includes(productSearch.toLowerCase())
    ),
    [availableProducts, productSearch]
  );

  const selectedProduct = useMemo(
    () => availableProducts.find((item) => String(item.code ?? '') === String(draftLine.sku ?? '')),
    [availableProducts, draftLine.sku]
  );

  const draftQty = useMemo(() => toInputNumber(draftLine.qty), [draftLine.qty]);
  // Si la línea está en VES, convertir al costo en USD usando la tasa ingresada
  const draftCostVES = useMemo(() => toInputNumber(draftLine.costVES), [draftLine.costVES]);
  const draftRateVES = useMemo(() => toInputNumber(draftLine.rateVES), [draftLine.rateVES]);
  const draftCost = useMemo(() => {
    if (draftLine.costCurrency === 'VES') {
      return draftRateVES > 0 ? roundPrice(draftCostVES / draftRateVES) : 0;
    }
    return roundPrice(toInputNumber(draftLine.cost));
  }, [draftLine.costCurrency, draftLine.cost, draftCostVES, draftRateVES]);
  const draftTotalLineUSD = useMemo(
    () => (draftQty > 0 && draftCost > 0 ? roundMoney(draftQty * draftCost) : 0),
    [draftQty, draftCost]
  );
  const draftTotalLineVES = useMemo(
    () => draftLine.costCurrency === 'VES' && draftCostVES > 0 ? roundMoney(draftQty * draftCostVES) : 0,
    [draftLine.costCurrency, draftQty, draftCostVES]
  );
  const draftSalePriceP1 = useMemo(() => roundPrice(draftCost * 1.3), [draftCost]);
  const draftSalePrices = useMemo(() => buildSalePrices(draftSalePriceP1), [draftSalePriceP1]);
  const invoiceTotalUSD = useMemo(
    () => roundMoney(items.reduce((acc, item) => acc + item.totalLineUSD, 0)),
    [items]
  );
  const invoiceRateNum = useMemo(() => parseFloat(invoiceRateVES.replace(',','.')) || 0, [invoiceRateVES]);
  const invoiceTotalVESEquiv = useMemo(
    () => invoiceRateNum > 0 ? roundMoney(invoiceTotalUSD * invoiceRateNum) : 0,
    [invoiceTotalUSD, invoiceRateNum]
  );
  const totalQty = useMemo(
    () => roundTo(items.reduce((acc, item) => acc + item.qty, 0), 4),
    [items]
  );

  const updateForm = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateDraftLine = (patch: Partial<DraftLine>) => {
    setDraftLine((prev) => ({ ...prev, ...patch }));
  };

  const appendFiles = (incoming?: File[] | null) => {
    const list = Array.from(incoming || []).filter(Boolean);
    if (list.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      const existingKeys = new Set(prev.map((file) => `${file.name}__${file.size}__${file.type}`));
      for (const file of list) {
        const contentType = String(file.type || '').toLowerCase();
        const isAllowed = contentType.startsWith('image/') || contentType === 'application/pdf';
        if (!isAllowed) continue;
        const key = `${file.name}__${file.size}__${file.type}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        next.push(file);
      }
      return next;
    });
  };

  const extractPastedSupportFiles = (itemsList?: DataTransferItemList | null) => {
    if (!itemsList || itemsList.length === 0) return [] as File[];
    const pastedFiles: File[] = [];
    for (let i = 0; i < itemsList.length; i++) {
      const item = itemsList[i] as DataTransferItem | undefined;
      if (!item || item.kind !== 'file') continue;
      const blob = item.getAsFile?.();
      if (!blob) continue;
      const contentType = String(blob.type || item.type || 'application/octet-stream').toLowerCase();
      if (!contentType.startsWith('image/') && contentType !== 'application/pdf') continue;
      const ext = contentType === 'application/pdf' ? 'pdf' : (contentType.split('/')[1] || 'png').toLowerCase();
      const prefix = contentType === 'application/pdf' ? 'documento' : 'whatsapp';
      const fallbackName = `${prefix}_${new Date().toISOString().replace(/[:.]/g, '-')}.${ext}`;
      pastedFiles.push(new File([blob], blob.name || fallbackName, { type: contentType }));
    }
    return pastedFiles;
  };

  const handlePaste: React.ClipboardEventHandler<HTMLDivElement> = (e) => {
    const pastedFiles = extractPastedSupportFiles(e.clipboardData?.items);
    if (pastedFiles.length > 0) {
      e.preventDefault();
      appendFiles(pastedFiles);
    }
  };

  const handleFileInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    appendFiles(Array.from(e.target.files || []));
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, index) => index !== idx));
  };

  const handleAddItem = () => {
    const sku = String(draftLine.sku ?? '').trim();
    const newCode = String(draftLine.newCode ?? '').trim().toUpperCase();
    const description = draftLine.mode === 'EXISTING'
      ? String(selectedProduct?.description ?? '').trim().toUpperCase()
      : String(draftLine.description ?? '').trim().toUpperCase();
    const unit = String(draftLine.unit ?? '').trim().toUpperCase();
    const expiry = String(draftLine.expiry ?? '').trim();
    const batch = String(draftLine.batch ?? '').trim();

    if (draftLine.mode === 'EXISTING' && !sku) {
      setError('Debe seleccionar un producto existente para agregarlo a la factura.');
      return;
    }
    if (draftLine.mode === 'NEW' && !description) {
      setError('Debe indicar la descripción del producto nuevo.');
      return;
    }
    if (draftLine.mode === 'NEW' && description.length < 3) {
      setError('La descripción del producto nuevo debe tener al menos 3 caracteres.');
      return;
    }
    if (!unit) {
      setError('Debe indicar la unidad del producto.');
      return;
    }
    if (!expiry) {
      setError('Debe indicar la caducidad del producto.');
      return;
    }
    if (!batch) {
      setError('Debe indicar el número de lote del producto.');
      return;
    }
    if (!Number.isFinite(draftQty) || draftQty <= 0) {
      setError('La cantidad del producto debe ser mayor a cero.');
      return;
    }
    if (!Number.isFinite(draftCost) || draftCost <= 0) {
      setError('El costo unitario del producto debe ser mayor a cero.');
      return;
    }

    // CORRECCIÓN: Validaciones adicionales para productos nuevos
    if (draftLine.mode === 'NEW') {
      // Validar que el código no esté duplicado en productos existentes
      if (newCode) {
        const existingProduct = products.find(p => String(p.code ?? '').trim().toUpperCase() === newCode);
        if (existingProduct) {
          setError(`El código ${newCode} ya existe para el producto "${existingProduct.description}". Use otro código.`);
          return;
        }
        
        // Validar que no esté duplicado en esta misma compra
        const duplicateInThisPurchase = items.find(item => item.mode === 'NEW' && item.newCode === newCode);
        if (duplicateInThisPurchase) {
          setError(`El código ${newCode} ya fue agregado en esta compra. Use otro código.`);
          return;
        }
      }

      // Validar que el lote no esté duplicado para productos existentes
      if (sku && batch) {
        const existingBatch = items.find(item => 
          item.mode === 'EXISTING' && 
          item.sku === sku && 
          item.batch === batch
        );
        if (existingBatch) {
          setError(`El lote "${batch}" ya existe para el producto ${sku} en esta compra.`);
          return;
        }
      }
    }

    setItems((prev) => ([
      ...prev,
      {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        mode: draftLine.mode,
        sku: draftLine.mode === 'EXISTING' ? sku : undefined,
        newCode: draftLine.mode === 'NEW' ? newCode || undefined : undefined,
        description,
        unit,
        qty: roundTo(draftQty, 4),
        costUSD: draftCost,
        expiry,
        batch,
        totalLineUSD: draftTotalLineUSD,
        salePrices: draftSalePrices,
        warehouse: draftLine.warehouse,
        minStock: draftLine.mode === 'NEW' ? (parseFloat(draftLine.minStock) || 0) : undefined
      }
    ]));
    setDraftLine(createDraftLine(draftLine.mode, warehouse, invoiceRateVES));
    setProductSearch('');
    setSelectedProductIndex(-1);
    setError('');
  };

  const handleSelectSupplier = (s: Supplier) => {
    updateForm({
      supplier: s.name,
      supplierDocument: s.id,
      supplierPhone: s.phone,
      supplierAddress: s.address
    });
    setSupplierSearch(s.name);
    setShowSupplierSuggestions(false);
    setSelectedSupplierIndex(-1);
  };

  const handleSupplierKeyDown = (e: React.KeyboardEvent) => {
    if (!showSupplierSuggestions || filteredSuppliers.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSupplierIndex(prev =>
          prev < filteredSuppliers.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSupplierIndex(prev => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSupplierIndex >= 0) {
          handleSelectSupplier(filteredSuppliers[selectedSupplierIndex]);
        }
        break;
      case 'Escape':
        setShowSupplierSuggestions(false);
        setSelectedSupplierIndex(-1);
        break;
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleRequestConfirm = () => {
    setError('');
    setShowConfirm(true);
  };

  const handleSubmit = async () => {
    const supplier = String(form.supplier ?? '').trim();
    const rawDoc = String(form.supplierDocument ?? '').trim();
    const supplierDocument = normalizeDocumentId(rawDoc);
    const supplierPhone = String(form.supplierPhone ?? '').trim();
    const supplierAddress = String(form.supplierAddress ?? '').trim();
    const invoiceNumber = String(form.invoiceNumber ?? '').trim();
    const invoiceDate = String(form.invoiceDate ?? '').trim();
    const invoiceDueDate = String(form.invoiceDueDate ?? '').trim();

    // Validaciones básicas
    if (!supplier) {
      setError('Debe indicar el proveedor.');
      return;
    }
    if (!invoiceNumber) {
      setError('Debe indicar el número de factura.');
      return;
    }
    if (items.length === 0) {
      setError('Debe agregar al menos un producto a la factura.');
      return;
    }

    // CORRECCIÓN: Validación final para productos nuevos
    const newProductItems = items.filter(item => item.mode === 'NEW');
    for (const item of newProductItems) {
      if (!item.newCode) {
        setError('Uno de los productos nuevos no tiene código asignado.');
        return;
      }
      if (!item.description || item.description.length < 3) {
        setError(`El producto nuevo "${item.newCode}" debe tener una descripción válida.`);
        return;
      }
      
      // Validación final contra base de datos (por si acaso)
      const existingProduct = products.find(p => 
        String(p.code ?? '').trim().toUpperCase() === item.newCode?.toUpperCase()
      );
      if (existingProduct) {
        setError(`El código ${item.newCode} ya existe en la base de datos para "${existingProduct.description}". Use otro código.`);
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      // Guardar/Actualizar el proveedor en el catálogo central
      await supplierService.saveSupplier({
        id: supplierDocument,
        name: supplier,
        phone: supplierPhone,
        address: supplierAddress
      });

      // Opcional: También registrarlo como cliente para que aparezca en Facturación
      try {
        const existingClient = clientService.findClient(supplierDocument);
        if (!existingClient) {
          await clientService.addClient({
            id: supplierDocument,
            name: supplier,
            address: supplierAddress,
            phone: supplierPhone,
            type: supplierDocument.startsWith('J') || supplierDocument.startsWith('G') ? 'Jurídica' : 'Natural',
            nationality: (supplierDocument.charAt(0) as any) || 'V'
          });
        }
      } catch (clientErr) {
        console.warn('No se pudo auto-registrar el proveedor como cliente:', clientErr);
      }

      const result = await dataService.registerPurchaseEntryInvoice({
        supplier,
        supplierDocument,
        supplierPhone,
        supplierAddress,
        invoiceNumber,
        invoiceDate: new Date(invoiceDate),
        invoiceDueDate: invoiceDueDate ? new Date(invoiceDueDate) : undefined,
        totalInvoiceUSD: invoiceTotalUSD,
        paymentType: form.paymentType,
        files,
        warehouse,
        items: items.map((item) => ({
          sku: item.mode === 'EXISTING' ? item.sku : undefined,
          newProduct: item.mode === 'NEW'
            ? {
                code: item.newCode || undefined,
                description: item.description,
                unit: item.unit,
                minStock: item.minStock ?? 0,
                conversionRatio: 1,
                baseUnit: item.unit
              }
            : undefined,
          unit: item.unit,
          qty: item.qty,
          costUSD: item.costUSD,
          expiryDate: new Date(item.expiry),
          batch: item.batch,
          totalLineUSD: item.totalLineUSD,
          warehouse: item.warehouse
        })),
        paymentMethod: form.paymentMethod,
        bankId: form.bankId,
        bankName: form.bankName,
        bankAccountId: form.bankAccountId,
        bankAccountLabel: form.bankAccountLabel,
        reference: form.reference
      });

      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(String(e?.message ?? 'No se pudo registrar la compra.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <div className="fixed inset-0 z-[1200] bg-black/60 flex items-start justify-center p-1 sm:p-2 md:p-4 overflow-y-auto">
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200 my-1 sm:my-2 flex flex-col" style={{ maxHeight: 'calc(100vh - 8px)' }}>
        <div className="p-4 md:p-5 md:p-2 border-b bg-slate-50/30 flex justify-between items-center gap-4 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 bg-emerald-100 rounded-xl shrink-0">
              <Package className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="min-w-0">
              <h4 className="font-headline font-black text-base md:text-xs uppercase tracking-tight text-slate-900">{title}</h4>
              <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{subtitle}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 md:p-5 md:p-2 space-y-3 md:space-y-1.5 overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 md:grid-cols-12 gap-3 md:gap-1.5 items-stretch">
            <div className="relative flex flex-col md:col-span-1 md:col-span-5" ref={supplierRef}>
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Proveedor</label>
              <input
                value={supplierSearch}
                onChange={(e) => {
                  setSupplierSearch(e.target.value);
                  updateForm({ supplier: e.target.value });
                  setShowSupplierSuggestions(true);
                  setSelectedSupplierIndex(-1);
                }}
                onFocus={() => setShowSupplierSuggestions(true)}
                onKeyDown={handleSupplierKeyDown}
                onBlur={() => setTimeout(() => { setShowSupplierSuggestions(false); setSelectedSupplierIndex(-1); }, 200)}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-bold outline-none uppercase h-[38px] md:h-8"
                placeholder="Nombre o RIF del proveedor"
              />
              {showSupplierSuggestions && filteredSuppliers.length > 0 && (
                <div className="absolute z-[1300] w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-xl max-h-48 overflow-y-auto">
                  {filteredSuppliers.map((s, index) => (
                    <div
                      key={s.id}
                      onClick={() => handleSelectSupplier(s)}
                      className={`px-4 md:px-2 py-3 md:py-1 cursor-pointer border-b border-slate-50 last:border-b-0 transition-colors ${
                        index === selectedSupplierIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-[11px] md:text-xs font-black text-slate-900 uppercase">{s.name}</div>
                      <div className="text-[9px] text-slate-500">{s.id}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col md:col-span-1 md:col-span-3">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">RIF o CI</label>
              <input
                value={form.supplierDocument}
                onChange={(e) => updateForm({ supplierDocument: e.target.value.toUpperCase() })}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black uppercase outline-none h-[38px] md:h-8"
                placeholder="Ej: J-12345678-9"
              />
            </div>
            <div className="flex flex-col md:col-span-1 md:col-span-4">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Teléfono</label>
              <input
                value={form.supplierPhone}
                onChange={(e) => updateForm({ supplierPhone: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-bold outline-none h-[38px] md:h-8"
                placeholder="Número de contacto"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-1.5">
            <div className="flex flex-col md:col-span-12">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Dirección</label>
              <input
                value={form.supplierAddress}
                onChange={(e) => updateForm({ supplierAddress: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-bold outline-none h-[38px] md:h-8"
                placeholder="Dirección fiscal o comercial del proveedor"
              />
            </div>
          </div>

          {supplierPurchaseHistory.length > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 md:p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <FileText className="w-3 h-3 text-blue-500 shrink-0" />
                <span className="text-[8px] font-black uppercase tracking-widest text-blue-600">Últimas compras a este proveedor</span>
              </div>
              <div className="space-y-1">
                {supplierPurchaseHistory.map(entry => (
                  <div key={entry.id} className="flex items-center justify-between gap-2 bg-white rounded-lg px-3 md:px-2 py-1.5 border border-blue-100">
                    <div className="min-w-0">
                      <div className="text-[9px] md:text-[8px] font-black text-slate-800 truncate">{entry.description}</div>
                      <div className="text-[8px] font-bold text-slate-400">{entry.timestamp.toLocaleDateString('es-VE')}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[9px] font-black text-slate-900 font-mono">${entry.amountUSD.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                      <div className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md ${entry.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : entry.status === 'OVERDUE' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {entry.status === 'PAID' ? 'Pagado' : entry.status === 'OVERDUE' ? 'Vencido' : 'Pendiente'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 md:grid-cols-12 gap-3 md:gap-1.5 items-stretch">
            <div className="flex flex-col md:col-span-1 md:col-span-4">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Número de factura</label>
              <div className="relative">
                <input
                  value={form.invoiceNumber}
                  onChange={(e) => updateForm({ invoiceNumber: e.target.value.toUpperCase() })}
                  className={`w-full bg-white border rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black uppercase outline-none h-[38px] md:h-8 pr-8 ${invoiceDuplicateWarning ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                  placeholder="Ej: F-001245"
                />
                {checkingDuplicate && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                )}
                {!checkingDuplicate && invoiceDuplicateWarning && (
                  <AlertCircle className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-red-500" />
                )}
              </div>
              {invoiceDuplicateWarning && (
                <div className="mt-1 flex items-start gap-1.5 bg-red-50 border border-red-200 rounded-lg px-2.5 py-1.5">
                  <AlertCircle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  <span className="text-[9px] font-bold text-red-700 leading-tight">{invoiceDuplicateWarning}</span>
                </div>
              )}
            </div>
            <div className="flex flex-col md:col-span-1 md:col-span-4">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Fecha de emisión</label>
              <input
                type="date"
                value={form.invoiceDate}
                onChange={(e) => updateForm({ invoiceDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black outline-none h-[38px] md:h-8"
              />
            </div>
            <div className="flex flex-col md:col-span-1 md:col-span-4">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Vencimiento</label>
              <input
                type="date"
                value={form.invoiceDueDate}
                onChange={(e) => updateForm({ invoiceDueDate: e.target.value })}
                className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black outline-none h-[38px] md:h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] md:gap-1.5 items-start">
            <div className="space-y-3 md:space-y-1.5">
              <div className="rounded-2xl md:rounded-lg border border-slate-200 bg-slate-50/60 p-4 md:p-2 space-y-3 md:space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Producto de factura</div>
                    <div className="text-xs md:text-[10px] font-black text-slate-900 uppercase">Agregue productos</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 lg:gap-1">
                    <button
                      type="button"
                      onClick={() => setDraftLine(createDraftLine('EXISTING'))}
                      className={`px-3 md:px-1.5 py-1.5 md:py-0.5 rounded-lg lg:rounded text-[10px] md:text-xs font-black uppercase tracking-widest border transition-all ${draftLine.mode === 'EXISTING' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-500 border-slate-200'}`}
                    >Existente</button>
                    <button
                      type="button"
                      onClick={() => setDraftLine(createDraftLine('NEW'))}
                      className={`px-3 md:px-1.5 py-1.5 md:py-0.5 rounded-lg lg:rounded text-[10px] md:text-xs font-black uppercase tracking-widest border transition-all ${draftLine.mode === 'NEW' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200'}`}
                    >Nuevo</button>
                  </div>
                </div>

                {draftLine.mode === 'EXISTING' ? (
                  <div className="grid grid-cols-1 md:grid-cols-[1.5fr_0.7fr] md:grid-cols-12 gap-3 md:gap-1.5 items-stretch">
                    <div className="flex flex-col md:col-span-8">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Producto</label>
                      <div className="relative">
                        <div className="flex items-center bg-white px-3 md:px-1.5 py-2 md:py-0.5 rounded-lg lg:rounded border border-slate-200 focus-within:border-emerald-500 transition-all h-[38px] md:h-8">
                          <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                          <input 
                            type="text" 
                            placeholder="REF/DESCRIPCIÓN..."
                            ref={productSearchRef}
                            value={productSearch}
                            onChange={(e) => {
                              setProductSearch(e.target.value);
                              setSelectedProductIndex(-1);
                              if (draftLine.sku && !e.target.value) {
                                updateDraftLine({ sku: '' });
                              }
                            }}
                            onKeyDown={(e) => {
                              if (!productSearch || filteredProducts.length === 0) return;

                              switch (e.key) {
                                case 'ArrowDown':
                                  e.preventDefault();
                                  setSelectedProductIndex(prev =>
                                    prev < filteredProducts.length - 1 ? prev + 1 : prev
                                  );
                                  break;
                                case 'ArrowUp':
                                  e.preventDefault();
                                  setSelectedProductIndex(prev => (prev > 0 ? prev - 1 : prev));
                                  break;
                                case 'Enter':
                                  e.preventDefault();
                                  if (selectedProductIndex >= 0) {
                                    const p = filteredProducts[selectedProductIndex];
                                    updateDraftLine({
                                      sku: p.code,
                                      unit: String(p.unit ?? draftLine.unit ?? 'KG').toUpperCase()
                                    });
                                    setProductSearch(`${p.code} — ${p.description}`);
                                    setSelectedProductIndex(-1);
                                  }
                                  break;
                                case 'Escape':
                                  setSelectedProductIndex(-1);
                                  break;
                              }
                            }}
                            onBlur={() => setTimeout(() => setSelectedProductIndex(-1), 200)}
                            className="bg-transparent border-none text-[11px] md:text-xs font-black text-slate-800 focus:ring-0 flex-1 outline-none uppercase tracking-widest placeholder:text-slate-300 h-full"
                          />
                        </div>
                        
                        {productSearch && !draftLine.sku && (
                          <div className="absolute z-20 w-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg max-h-48 overflow-y-auto">
                            {filteredProducts.length === 0 ? (
                              <div className="px-4 md:px-2 py-3 md:py-1 text-[10px] md:text-xs text-slate-400 text-center">No se encontraron productos</div>
                            ) : (
                              filteredProducts.slice(0, 10).map((p, index) => (
                                <div
                                  key={p.code}
                                  onClick={() => {
                                    updateDraftLine({
                                      sku: p.code,
                                      unit: String(p.unit ?? draftLine.unit ?? 'KG').toUpperCase()
                                    });
                                    setProductSearch(`${p.code} — ${p.description}`);
                                    setSelectedProductIndex(-1);
                                  }}
                                  className={`px-4 md:px-2 py-2 cursor-pointer border-b border-slate-50 last:border-b-0 transition-colors ${
                                    index === selectedProductIndex ? 'bg-slate-100' : 'hover:bg-slate-50'
                                  }`}
                                >
                                  <div className="text-[11px] md:text-xs font-black text-slate-900 uppercase">{p.code}</div>
                                  <div className="text-[9px] text-slate-500">{p.description}</div>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col md:col-span-4">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Unidad</label>
                      <select
                        value={draftLine.unit}
                        onChange={(e) => updateDraftLine({ unit: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black uppercase outline-none h-[38px] md:h-8"
                      >
                        {PURCHASE_UNITS.map((unit) => (
                          <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 md:grid-cols-12 gap-3 md:gap-1.5 items-stretch">
                    <div className="flex flex-col md:col-span-4">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Código (Auto)</label>
                      <input
                        value={draftLine.newCode}
                        readOnly
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black uppercase outline-none cursor-not-allowed text-slate-500 h-[38px] md:h-8"
                        placeholder="Generando..."
                      />
                    </div>
                    <div className="md:col-span-2 md:col-span-6 flex flex-col">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Descripción</label>
                      <input
                        value={draftLine.description}
                        onChange={(e) => updateDraftLine({ description: e.target.value.toUpperCase() })}
                        className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black uppercase outline-none h-[38px] md:h-8"
                        placeholder="Nombre del nuevo producto"
                      />
                    </div>
                    <div className="md:col-span-2 flex flex-col">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Stock Mín.</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draftLine.minStock}
                        onChange={(e) => updateDraftLine({ minStock: e.target.value })}
                        className="w-full bg-amber-50 border border-amber-200 rounded-lg lg:rounded px-3 md:px-1.5 py-2 md:py-0.5 text-[11px] md:text-xs font-black text-amber-800 outline-none focus:border-amber-400 h-[38px] md:h-8"
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}

                {/* Selector de moneda de factura por línea */}
                <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 w-fit">
                  <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 pl-1">Moneda costo:</span>
                  <button
                    type="button"
                    onClick={() => updateDraftLine({ costCurrency: 'USD', costVES: '', rateVES: invoiceRateVES })}
                    className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${draftLine.costCurrency === 'USD' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-emerald-700'}`}
                  >$ USD</button>
                  <button
                    type="button"
                    onClick={() => updateDraftLine({ costCurrency: 'VES', cost: '', rateVES: invoiceRateVES })}
                    className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${draftLine.costCurrency === 'VES' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-blue-700'}`}
                  >Bs. VES</button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 md:grid-cols-12 gap-2 md:gap-1">
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Almacén</label>
                    <select
                      value={draftLine.warehouse}
                      onChange={(e) => updateDraftLine({ warehouse: e.target.value })}
                      className="w-full h-[34px] md:h-7 bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black uppercase outline-none"
                    >
                      {WAREHOUSES.map((wh) => (
                        <option key={wh.value} value={wh.value}>{wh.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Lote</label>
                    <input
                      value={draftLine.batch}
                      onChange={(e) => updateDraftLine({ batch: e.target.value.toUpperCase() })}
                      className="w-full h-[34px] md:h-7 bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black uppercase outline-none"
                      placeholder="L001"
                    />
                  </div>
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Unidad</label>
                    <select
                      value={draftLine.unit}
                      onChange={(e) => updateDraftLine({ unit: e.target.value })}
                      className="w-full h-[34px] md:h-7 bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black uppercase outline-none"
                    >
                      {PURCHASE_UNITS.map((unit) => (
                        <option key={unit.value} value={unit.value}>{unit.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Cantidad</label>
                    <input
                      type="number"
                      step="0.0001"
                      value={draftLine.qty}
                      onChange={(e) => updateDraftLine({ qty: e.target.value })}
                      className="w-full h-[34px] md:h-7 bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black outline-none"
                      placeholder="0"
                    />
                  </div>
                  {draftLine.costCurrency === 'USD' ? (
                    <div className="flex flex-col col-span-1 md:col-span-2">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Costo USD</label>
                      <input
                        type="number"
                        step="0.00000001"
                        value={draftLine.cost}
                        onChange={(e) => updateDraftLine({ cost: e.target.value })}
                        className="w-full h-[34px] md:h-7 bg-white border border-emerald-300 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black outline-none focus:border-emerald-500"
                        placeholder="0.00"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-col col-span-1 md:col-span-2">
                        <label className="text-[8px] font-black uppercase tracking-widest text-blue-500 mb-0.5 md:mb-0.5">Costo Bs.</label>
                        <input
                          type="number"
                          step="0.01"
                          value={draftLine.costVES}
                          onChange={(e) => updateDraftLine({ costVES: e.target.value })}
                          className="w-full h-[34px] md:h-7 bg-blue-50 border border-blue-300 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black outline-none focus:border-blue-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="flex flex-col col-span-1 md:col-span-2">
                        <label className="text-[8px] font-black uppercase tracking-widest text-blue-500 mb-0.5 md:mb-0.5">Tasa Bs/$</label>
                        <input
                          type="number"
                          step="0.01"
                          value={draftLine.rateVES}
                          onChange={(e) => { updateDraftLine({ rateVES: e.target.value }); setInvoiceRateVES(e.target.value); }}
                          className="w-full h-[34px] md:h-7 bg-blue-50 border border-blue-300 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black outline-none focus:border-blue-500"
                          placeholder="Ej: 475.96"
                        />
                      </div>
                    </>
                  )}
                  <div className="flex flex-col col-span-1 md:col-span-2">
                    <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Caducidad</label>
                    <input
                      type="date"
                      value={draftLine.expiry}
                      onChange={(e) => updateDraftLine({ expiry: e.target.value })}
                      className="w-full h-[34px] md:h-7 bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 text-[10px] md:text-xs font-black outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-[0.8fr_1.2fr] md:grid-cols-12 gap-3 md:gap-1.5 items-start">
                  <div className="rounded-xl md:rounded border border-slate-200 bg-white p-3 md:p-1.5 space-y-1 md:space-y-0.5 md:col-span-1 md:col-span-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Subtotal</div>
                    <div className="text-xl md:text-base font-black text-slate-900">{formatMoney(draftTotalLineUSD)}</div>
                    {draftLine.costCurrency === 'VES' && draftTotalLineVES > 0 && (
                      <div className="text-[9px] font-black text-blue-600">Bs. {draftTotalLineVES.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
                    )}
                    {draftLine.costCurrency === 'VES' && draftCost > 0 && (
                      <div className="text-[8px] font-bold text-slate-400">
                        Costo USD: $ {draftCost.toFixed(6)}
                      </div>
                    )}
                    <div className="text-[9px] md:text-[8px] font-bold uppercase tracking-wider text-slate-500">
                      {draftQty > 0 ? `${formatQty(draftQty)} ${getUnitLabel(draftLine.unit)}` : 'Indique cantidad'}
                    </div>
                  </div>
                  <div className="rounded-xl md:rounded border border-slate-200 bg-white p-3 md:p-1.5 space-y-2 md:space-y-0.5 md:col-span-1 md:col-span-8">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[9px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">Precios automáticos</div>
                        <div className="text-[9px] md:text-[8px] font-bold uppercase tracking-wider text-slate-500">P1 = costo + 30%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">P1 base</div>
                        <div className="text-base font-black text-emerald-700">$ {formatPricePreview(draftSalePrices[0] || 0)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 lg:gap-1">
                      {draftSalePrices.map((price, index) => (
                        <div key={`draft-price-${index}`} className="rounded-lg lg:rounded bg-slate-50 border border-slate-200 px-2 md:px-1 py-1.5 lg:py-1">
                          <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">P{index + 1}</div>
                          <div className="text-[10px] md:text-[9px] font-black text-slate-800">$ {formatPricePreview(price)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-4 md:px-2 py-2 md:py-1 rounded-lg lg:rounded bg-blue-600 text-white text-[10px] md:text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 md:gap-1 shadow-md"
                  >
                    <PlusCircle className="w-4 h-4 md:w-3 md:h-3" />
                    Agregar <span className="opacity-60 text-[7px] font-bold normal-case">F4</span>
                  </button>
                </div>
              </div>

              <div className="rounded-xl md:rounded border border-slate-200 bg-white p-3 md:p-1.5 space-y-2 md:space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[9px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">Factura en construcción</div>
                    <div className="text-xs md:text-[10px] font-black text-slate-900 uppercase">{items.length} producto(s)</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">Total</div>
                    <div className="text-xl md:text-base font-black text-slate-900">{formatMoney(invoiceTotalUSD)}</div>
                    {invoiceTotalVESEquiv > 0 && (
                      <div className="text-[9px] font-black text-blue-600">
                        ≈ Bs. {invoiceTotalVESEquiv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                      </div>
                    )}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="rounded-xl md:rounded border border-dashed border-slate-200 bg-slate-50 px-4 md:px-2 py-6 lg:py-4 text-center text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Agregue productos.
                  </div>
                ) : (
                  <div className="space-y-2 md:space-y-1 max-h-48 md:max-h-36 overflow-y-auto">
                    {items.map((item, index) => {
                      const productRef = item.mode === 'EXISTING' && item.sku
                        ? products.find(p => p.code === item.sku)
                        : null;
                      const currentStock = productRef
                        ? productRef.lotes.reduce((sum, l) => sum + (l.qty || 0), 0)
                        : null;
                      const minStock = productRef?.min ?? 0;
                      const isCritical = currentStock !== null && currentStock < minStock && minStock > 0;
                      const isZero = currentStock !== null && currentStock === 0;

                      return (
                        <div key={item.id} className={`rounded-xl md:rounded border p-2.5 md:p-1.5 space-y-2 md:space-y-1 ${isCritical || isZero ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50/70'}`}>
                        {(isCritical || isZero) && (
                          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${isZero ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            <AlertTriangle className="w-3 h-3 shrink-0" />
                            {isZero
                              ? `Sin stock — esta compra repone el producto`
                              : `Stock crítico: ${currentStock!.toLocaleString('es-VE', { maximumFractionDigits: 2 })} ${productRef?.unit ?? ''} (mín. ${minStock})`}
                          </div>
                        )}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[8px] font-black uppercase tracking-widest text-slate-400">#{index + 1}</div>
                            <div className="text-[11px] md:text-[9px] font-black text-slate-900 uppercase leading-tight truncate">{item.description}</div>
                            <div className="flex items-center gap-1.5 text-[8px] md:text-[7px] font-bold uppercase tracking-wider text-slate-500">
                              <span>{item.mode === 'EXISTING' ? (item.sku || 'SIN CÓD') : (item.newCode || 'NUEVO')}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              <span className="text-emerald-700 font-black">{WAREHOUSES.find(w => w.value === item.warehouse)?.label || item.warehouse}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 md:p-1 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                          </button>
                        </div>

                        <div className="grid grid-cols-3 md:grid-cols-6 md:grid-cols-12 gap-1.5 md:gap-0.5 text-[10px] md:text-xs">
                          <div className="rounded-lg bg-white border border-slate-200 px-2 md:px-1 py-1 md:col-span-2">
                            <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">Lote</div>
                            <div className="font-black text-slate-800 uppercase truncate">{item.batch}</div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 px-2 md:px-1 py-1 md:col-span-2">
                            <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">Und</div>
                            <div className="font-black text-slate-800 uppercase">{getUnitLabel(item.unit)}</div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 px-2 md:px-1 py-1 md:col-span-2">
                            <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">Qty</div>
                            <div className="font-black text-slate-800">{formatQty(item.qty)}</div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 px-2 md:px-1 py-1 md:col-span-2">
                            <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">Costo</div>
                            <div className="font-black text-slate-800">$ {formatPricePreview(item.costUSD)}</div>
                          </div>
                          <div className="rounded-lg bg-white border border-slate-200 px-2 md:px-1 py-1 col-span-2 md:col-span-4">
                            <div className="text-[7px] md:text-[6px] font-black uppercase tracking-widest text-slate-400">Subtotal</div>
                            <div className="font-black text-slate-800">{formatMoney(item.totalLineUSD)}</div>
                          </div>
                        </div>

                        <div className="grid grid-cols-5 md:grid-cols-10 gap-1 md:gap-0.5">
                          {item.salePrices.map((price, priceIndex) => (
                            <div key={`${item.id}-${priceIndex}`} className="rounded md:rounded-sm bg-white border border-slate-200 px-1 py-1 text-center">
                              <div className="text-[6px] md:text-[5px] font-black uppercase tracking-widest text-slate-400">P{priceIndex + 1}</div>
                              <div className="text-[9px] md:text-[8px] font-black text-slate-800">${formatPricePreview(price)}</div>
                            </div>
                          ))}
                        </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 md:space-y-1.5">
              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Factura soporte</label>
                <div
                  onPaste={handlePaste}
                  tabIndex={0}
                  className="rounded-xl md:rounded border-2 border-dashed border-slate-200 bg-slate-50 p-3 md:p-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-1.5">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-slate-700">
                        <Clipboard className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                        <span className="text-[10px] md:text-xs font-black uppercase tracking-widest">Pegue o seleccione</span>
                      </div>
                      <p className="text-[9px] md:text-[8px] font-bold text-slate-400 uppercase tracking-wider">Imagen/PDF</p>
                    </div>
                    <label className="inline-flex items-center gap-1.5 md:gap-0.5 px-3 md:px-1.5 py-2 md:py-0.5 rounded-lg lg:rounded bg-white border border-slate-200 text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-700 cursor-pointer hover:bg-slate-100 shrink-0">
                      <Upload className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                      Elegir
                      <input type="file" accept="image/*,application/pdf,.pdf" multiple className="hidden" onChange={handleFileInputChange} />
                    </label>
                  </div>

                  {files.length > 0 && (
                    <div className="mt-3 lg:mt-2 space-y-1.5 lg:space-y-1">
                      {files.map((file, index) => {
                        const isImage = String(file.type || '').startsWith('image/');
                        return (
                          <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg lg:rounded bg-white border border-slate-200 px-3 md:px-1.5 py-2 lg:py-1">
                            <div className="min-w-0 flex items-center gap-2 md:gap-1">
                              <div className={`p-1.5 md:p-1 rounded-lg lg:rounded ${isImage ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                                {isImage ? <FileImage className="w-3.5 h-3.5 lg:w-3 lg:h-3" /> : <FileText className="w-3.5 h-3.5 lg:w-3 lg:h-3" />}
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] md:text-xs font-black text-slate-800 truncate">{file.name}</div>
                                <div className="text-[8px] md:text-[7px] font-bold uppercase tracking-widest text-slate-400">{formatBytes(file.size)}</div>
                              </div>
                            </div>
                            <button type="button" onClick={() => removeFile(index)} className="p-1.5 md:p-1 rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <X className="w-3.5 h-3.5 lg:w-3 lg:h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Modalidad de pago</label>
                <div className="flex bg-slate-100 p-1 rounded-lg lg:rounded">
                  <button
                    type="button"
                    onClick={() => updateForm({ paymentType: 'CASH' })}
                    className={`flex-1 py-2 md:py-1 rounded-md lg:rounded text-[10px] md:text-xs font-black uppercase transition-all ${form.paymentType === 'CASH' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}
                  >Contado</button>
                  <button
                    type="button"
                    onClick={() => updateForm({ paymentType: 'CREDIT' })}
                    className={`flex-1 py-2 md:py-1 rounded-md lg:rounded text-[10px] md:text-xs font-black uppercase transition-all ${form.paymentType === 'CREDIT' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400'}`}
                  >Crédito</button>
                </div>

                {form.paymentType === 'CASH' && (
                  <div className="mt-2 lg:mt-1.5 space-y-2 md:space-y-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {compatibleBanks.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg lg:rounded p-2 md:p-1 text-[9px] md:text-[8px] text-amber-800">
                        <div className="font-black">⚠️ No hay bancos configurados</div>
                        <div>Configure bancos en Finanzas.</div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 md:grid-cols-12 gap-2 md:gap-1">
                      <div className="flex flex-col md:col-span-4">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Método</label>
                        <select
                          value={form.paymentMethod}
                          onChange={(e) => updateForm({ paymentMethod: e.target.value, bankAccountId: '', bankAccountLabel: '' })}
                          className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 py-1.5 md:py-0.5 text-[10px] md:text-xs font-black uppercase outline-none h-[32px] md:h-7"
                        >
                          {PAYMENT_METHODS.map(m => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col md:col-span-4">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Banco</label>
                        <select
                          value={form.bankId}
                          onChange={(e) => {
                            const b = compatibleBanks.find(x => x.id === e.target.value);
                            updateForm({ bankId: e.target.value, bankName: b?.name ?? '', bankAccountId: '', bankAccountLabel: '' });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 py-1.5 md:py-0.5 text-[10px] md:text-xs font-black uppercase outline-none h-[32px] md:h-7"
                        >
                          <option value="">Seleccione</option>
                          {compatibleBanks.map(b => (
                            <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col md:col-span-4">
                        <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Cuenta</label>
                        <select
                          value={form.bankAccountId}
                          onChange={(e) => {
                            const account = availableAccounts.find((item) => item.id === e.target.value);
                            updateForm({ bankAccountId: e.target.value, bankAccountLabel: account?.label ?? '' });
                          }}
                          className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-2 md:px-1 py-1.5 md:py-0.5 text-[10px] md:text-xs font-black uppercase outline-none h-[32px] md:h-7"
                          disabled={!form.bankId}
                        >
                          <option value="">Seleccione</option>
                          {availableAccounts.map((account) => (
                            <option key={account.id} value={account.id}>{account.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5 md:mb-0.5">Referencia</label>
                      <input
                        value={form.reference}
                        onChange={(e) => updateForm({ reference: e.target.value.toUpperCase() })}
                        className="w-full bg-white border border-slate-200 rounded-lg lg:rounded px-3 md:px-1.5 py-1.5 md:py-0.5 text-[10px] md:text-xs font-black uppercase outline-none h-[32px] md:h-7"
                        placeholder="Ej: 123456"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 md:p-1.5 rounded-xl md:rounded bg-slate-50 border border-slate-200 space-y-2 md:space-y-1">
                <div className="text-[9px] md:text-[8px] font-black uppercase tracking-widest text-slate-400">Resumen</div>
                <div className="text-[10px] md:text-xs font-bold text-slate-700 space-y-1 md:space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span>Almacén</span>
                    <span className="font-black text-slate-900">{warehouse}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Productos</span>
                    <span className="font-black text-slate-900">{items.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Cantidad total</span>
                    <span className="font-black text-slate-900">{formatQty(totalQty)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Total factura</span>
                    <span className="font-black text-slate-900">{formatMoney(invoiceTotalUSD)}</span>
                  </div>
                  {invoiceTotalVESEquiv > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-blue-600">Total en Bs.</span>
                      <span className="font-black text-blue-700">Bs. {invoiceTotalVESEquiv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span>Soportes</span>
                    <span className="font-black text-slate-900">{files.length}</span>
                  </div>
                  <div className="grid grid-cols-5 md:grid-cols-10 gap-1 md:gap-0.5 pt-1">
                    {draftSalePrices.map((price, index) => (
                      <div key={`summary-draft-price-${index}`} className="rounded md:rounded-sm bg-white border border-slate-200 px-1 py-1 text-center">
                        <div className="text-[6px] md:text-[5px] font-black uppercase tracking-widest text-slate-400">P{index + 1}</div>
                        <div className="text-[8px] md:text-[7px] font-black text-slate-800">{formatPricePreview(price)}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="pt-1 md:pt-0.5 text-[9px] md:text-[8px] font-bold text-slate-500 leading-snug">
                  {form.paymentType === 'CREDIT'
                    ? 'Se creará cuenta por pagar.'
                    : `Afectará: ${form.bankName || 'banco'}${form.bankAccountLabel ? ` · ${form.bankAccountLabel}` : ''}.`}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2 md:pt-0.5.5 border-t md:sticky md:bottom-0 md:bg-white md:z-10">
            <button
              onClick={onClose}
              className="px-4 md:px-2 py-2 md:py-1 bg-slate-100 text-slate-600 rounded-lg lg:rounded text-[10px] md:text-xs font-black uppercase"
              disabled={saving}
            >Cancelar</button>
            <button
              onClick={handleRequestConfirm}
              className="px-4 md:px-2 py-2 md:py-1 bg-emerald-600 text-white rounded-lg lg:rounded text-[10px] md:text-xs font-black uppercase shadow-lg shadow-emerald-600/20 inline-flex items-center gap-2 md:gap-1"
              disabled={saving || items.length === 0 || !!invoiceDuplicateWarning || checkingDuplicate}
              title={invoiceDuplicateWarning ? invoiceDuplicateWarning : undefined}
            >
              <CheckCircle2 className="w-4 h-4 md:w-3 md:h-3" />
              Registrar <span className="opacity-60 text-[7px] font-bold normal-case">F10</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    {showConfirm && (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && setShowConfirm(false)} />
        <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-100 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">Confirmar Registro de Compra</h3>
              <p className="text-[10px] text-slate-500 font-bold">Esta acción afectará el inventario y las cuentas bancarias.</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100 text-[11px]">
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="font-bold text-slate-500">Proveedor</span>
              <span className="font-black text-slate-900">{form.supplier || '—'}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="font-bold text-slate-500">Factura</span>
              <span className="font-black text-slate-900">{form.invoiceNumber || '—'}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="font-bold text-slate-500">Productos</span>
              <span className="font-black text-slate-900">{items.length} líneas · {formatQty(totalQty)} uds.</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="font-bold text-slate-500">Total</span>
              <span className="font-black text-emerald-700 text-sm">{formatMoney(invoiceTotalUSD)}</span>
            </div>
            {invoiceTotalVESEquiv > 0 && (
              <div className="flex justify-between items-center px-4 py-2.5">
                <span className="font-bold text-slate-500">Equivalente Bs.</span>
                <span className="font-black text-blue-700">Bs. {invoiceTotalVESEquiv.toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
            <div className="flex justify-between items-center px-4 py-2.5">
              <span className="font-bold text-slate-500">Tipo de pago</span>
              <span className={`font-black px-2 py-0.5 rounded-md text-[10px] ${form.paymentType === 'CREDIT' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {form.paymentType === 'CREDIT' ? 'CRÉDITO — Se crea CxP' : `CONTADO — ${form.bankName || 'banco'}${form.bankAccountLabel ? ` · ${form.bankAccountLabel}` : ''}`}
              </span>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-[10px] font-black text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setShowConfirm(false); setError(''); }}
              disabled={saving}
              className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Revisar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving || !!invoiceDuplicateWarning}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              {saving ? (
                <><PlusCircle className="w-4 h-4 animate-spin" /> Guardando...</>
              ) : (
                <><CheckCircle2 className="w-4 h-4" /> Confirmar Compra</>
              )}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
