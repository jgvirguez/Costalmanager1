export interface Item {
  sku: string;
  name: string;
  min_stock: number; // 4 decimals precision
  base_uom_id: 'gram' | 'unit';
  category: string;
}

export interface Batch {
  id: string;
  sku: string;
  expiry_date: string;
  cost_per_unit: number; // 8 decimals precision (Landed Cost)
  initial_quantity: number;
  current_quantity: number;
  warehouse_id: 'D3' | 'D2' | 'A1';
  lot_id: string; // Traceability link
}

export interface Warehouse {
  id: 'D3' | 'D2' | 'A1';
  name: string;
  description: string;
}

export interface InventoryMove {
  id: string;
  timestamp: string;
  sku: string;
  batch_id: string;
  type: 'IN' | 'OUT' | 'ADJ' | 'TRANSFER' | 'FRACTION';
  quantity: number; // 4 decimals
  from_warehouse?: string;
  to_warehouse?: string;
  reason_code: string; // Merma, Daño, Ajuste, Desglose
  user_id: string;
  metadata?: {
    pre_state: number;
    post_state: number;
    reference_id?: string;
  };
}

export const WAREHOUSES: Warehouse[] = [
  { id: 'D3', name: 'Depósito 3', description: 'Recepción Masiva (Bultos/Sacos)' },
  { id: 'D2', name: 'Depósito 2', description: 'Pesado/Fraccionamiento (Granel)' },
  { id: 'A1', name: 'Almacén 1', description: 'Exhibición/Venta (Anaquel)' },
];
