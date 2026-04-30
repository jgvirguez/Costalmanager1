import { supabase } from './supabaseConfig';

export type LedgerOperationType =
  | 'SALE_CASH'
  | 'SALE_CREDIT'
  | 'AR_PAYMENT'
  | 'AP_PAYMENT'
  | 'SALE_VOID'
  | 'INVENTORY_ADJUST_INCREASE'
  | 'INVENTORY_ADJUST_DECREASE';

export interface LedgerDetailInput {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  note?: string;
}

export interface LedgerEntryInput {
  operationDate: string;
  originOperationId: string;
  operationType: LedgerOperationType;
  description: string;
  currency?: 'USD' | 'VES';
  exchangeRate?: number;
  createdBy?: string;
  metadata?: Record<string, unknown>;
  details: LedgerDetailInput[];
}

interface LedgerAccountRule {
  debit: { accountCode: string; accountName: string };
  credit: { accountCode: string; accountName: string };
}

const DEFAULT_LEDGER_RULES: Record<LedgerOperationType, LedgerAccountRule> = {
  SALE_CASH: {
    debit: { accountCode: '110101', accountName: 'CAJA / BANCOS' },
    credit: { accountCode: '410101', accountName: 'INGRESOS POR VENTAS' }
  },
  SALE_CREDIT: {
    debit: { accountCode: '113101', accountName: 'CUENTAS POR COBRAR' },
    credit: { accountCode: '410101', accountName: 'INGRESOS POR VENTAS' }
  },
  AR_PAYMENT: {
    debit: { accountCode: '110101', accountName: 'CAJA / BANCOS' },
    credit: { accountCode: '113101', accountName: 'CUENTAS POR COBRAR' }
  },
  AP_PAYMENT: {
    debit: { accountCode: '211101', accountName: 'CUENTAS POR PAGAR' },
    credit: { accountCode: '110101', accountName: 'CAJA / BANCOS' }
  },
  SALE_VOID: {
    debit: { accountCode: '410101', accountName: 'INGRESOS POR VENTAS' },
    credit: { accountCode: '110101', accountName: 'CAJA / BANCOS' }
  },
  INVENTORY_ADJUST_INCREASE: {
    debit: { accountCode: '120101', accountName: 'INVENTARIO DE MERCANCIA' },
    credit: { accountCode: '510901', accountName: 'AJUSTE POSITIVO DE INVENTARIO' }
  },
  INVENTORY_ADJUST_DECREASE: {
    debit: { accountCode: '510902', accountName: 'AJUSTE NEGATIVO DE INVENTARIO' },
    credit: { accountCode: '120101', accountName: 'INVENTARIO DE MERCANCIA' }
  }
};

export class MissingLedgerRuleError extends Error {
  constructor(operationType: LedgerOperationType) {
    super(`No existe mapeo de cuentas contables para ${operationType}. Configure accounting_account_rules.`);
    this.name = 'MissingLedgerRuleError';
  }
}

export class LedgerIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LedgerIntegrityError';
  }
}

export class LedgerService {
  async buildBalancedDetailsFromAmount(params: {
    operationType: LedgerOperationType;
    amount: number;
    note?: string;
  }): Promise<LedgerDetailInput[]> {
    const normalizedAmount = Math.round((Number(params.amount) || 0) * 100) / 100;
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      throw new LedgerIntegrityError('El monto contable debe ser mayor a cero.');
    }
    const rule = await this.getRule(params.operationType);
    return [
      {
        accountCode: rule.debit.accountCode,
        accountName: rule.debit.accountName,
        debit: normalizedAmount,
        credit: 0,
        note: params.note
      },
      {
        accountCode: rule.credit.accountCode,
        accountName: rule.credit.accountName,
        debit: 0,
        credit: normalizedAmount,
        note: params.note
      }
    ];
  }

  async createLedgerEntry(input: LedgerEntryInput): Promise<{ seatId: string }> {
    this.validateDetails(input.details);
    const payloadHeader = {
      operation_date: input.operationDate,
      origin_operation_id: input.originOperationId,
      operation_type: input.operationType,
      description: input.description,
      currency: input.currency ?? 'USD',
      exchange_rate: Number(input.exchangeRate ?? 0) || null,
      created_by: String(input.createdBy ?? '').trim() || null,
      metadata: input.metadata ?? {}
    };
    const payloadDetails = input.details.map((d, index) => ({
      line_number: index + 1,
      account_code: d.accountCode,
      account_name: d.accountName,
      debit: Math.round((Number(d.debit) || 0) * 100) / 100,
      credit: Math.round((Number(d.credit) || 0) * 100) / 100,
      note: d.note ?? ''
    }));

    const { data, error } = await supabase.rpc('create_accounting_entry', {
      p_header: payloadHeader,
      p_details: payloadDetails
    });

    if (error) {
      throw new LedgerIntegrityError(`No se pudo crear asiento contable: ${String(error.message ?? 'error desconocido')}`);
    }
    return { seatId: String((data as any) ?? '') };
  }

  private async getRule(operationType: LedgerOperationType): Promise<LedgerAccountRule> {
    const { data, error } = await supabase
      .from('accounting_account_rules')
      .select('debit_account_code,debit_account_name,credit_account_code,credit_account_name,active')
      .eq('operation_type', operationType)
      .eq('active', true)
      .limit(1);

    if (!error && Array.isArray(data) && data.length > 0) {
      const row: any = data[0];
      return {
        debit: {
          accountCode: String(row?.debit_account_code ?? '').trim(),
          accountName: String(row?.debit_account_name ?? '').trim()
        },
        credit: {
          accountCode: String(row?.credit_account_code ?? '').trim(),
          accountName: String(row?.credit_account_name ?? '').trim()
        }
      };
    }

    const fallback = DEFAULT_LEDGER_RULES[operationType];
    if (!fallback) throw new MissingLedgerRuleError(operationType);
    return fallback;
  }

  private validateDetails(details: LedgerDetailInput[]): void {
    if (!Array.isArray(details) || details.length < 2) {
      throw new LedgerIntegrityError('Un asiento contable debe tener al menos dos lineas.');
    }
    const totals = details.reduce(
      (acc, d) => {
        acc.debit += Math.round((Number(d.debit) || 0) * 100) / 100;
        acc.credit += Math.round((Number(d.credit) || 0) * 100) / 100;
        return acc;
      },
      { debit: 0, credit: 0 }
    );
    const balanced = Math.abs(totals.debit - totals.credit) <= 0.01;
    if (!balanced) {
      throw new LedgerIntegrityError(`Asiento desbalanceado: debe=${totals.debit.toFixed(2)} haber=${totals.credit.toFixed(2)}.`);
    }
  }
}

