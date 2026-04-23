/**
 * Billing Module Types
 */
export type PaymentMethod = 'transfer' | 'mobile' | 'cash_usd' | 'cash_ves' | 'zelle' | 'debit' | 'biopago' | 'digital_usd' | 'credit' | 'others';

export interface BillingClient {
  id: string;
  name: string;
  address: string;
  phone: string;
  type: 'Natural' | 'Jurídica';
  nationality?: 'V' | 'E' | 'J' | 'G';
  referredBy?: string;
  creditLimit?: number;
  currentBalance?: number;
  creditDays?: number;
  hasCredit?: boolean;
  isSolvent?: boolean;
  creditAuthorizedBy?: string;
  creditAuthorizedAt?: string;
}

export interface BillingItem {
  id: string;
  code: string;
  description: string;
  unit: string;
  qty: number;   // 4 decimal precision
  priceUSD: number; // 8 decimal precision
  priceLevel?: number; // 1 to 5
  tax: number; // Percentage (e.g., 16)
  dispatchLotes?: { warehouse: string; batchId: string; qty: number }[];
}

export interface Invoice {
  id: string;
  correlative: string;
  date: string;
  clientId: string;
  items: BillingItem[];
  paymentMethod: PaymentMethod;
  exchangeRate: number;
  subtotalUSD: number;
  vatUSD: number;
  igtfUSD: number;
  totalUSD: number;
  totalVES: number;
  status: 'pending' | 'paid' | 'cancelled';
}
