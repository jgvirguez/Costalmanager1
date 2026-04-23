import { addDoc, collection } from 'firebase/firestore';
import { db } from './firebaseConfig';

export type AuditSeverity = 'INFO' | 'WARN' | 'ERROR';

export interface AuditEvent {
  actor: string;
  action: string;
  entity: string;
  details?: string;
  severity?: AuditSeverity;
  metadata?: Record<string, unknown>;
}

class AuditService {
  async log(event: AuditEvent): Promise<void> {
    const payload = {
      actor: event.actor,
      action: event.action,
      entity: event.entity,
      details: event.details ?? null,
      severity: event.severity ?? 'INFO',
      metadata: event.metadata ?? null,
      created_at: new Date().toISOString()
    };

    try {
      await addDoc(collection(db, 'audit_logs'), payload);
      return;
    } catch {
      // ignore and fallback below
    }

    try {
      await addDoc(collection(db, 'movements'), {
        type: `AUDIT_${event.action}`,
        product_code: event.entity,
        reason: event.details ?? '',
        operator: event.actor,
        warehouse: 'SISTEMA',
        quantity: 0,
        created_at: new Date().toISOString()
      });
    } catch {
      // Last resort: swallow, never break core flows because of audit
    }
  }
}

export const auditService = new AuditService();
