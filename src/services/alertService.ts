import { dataService } from './dataService';

export interface InventoryAlert {
  id: string;
  type: 'LOW_STOCK' | 'EXPIRY_SOON' | 'CRITICAL_EXPIRY';
  sku: string;
  description: string;
  details: string;
  severity: 'warning' | 'error';
  timestamp: Date;
}

class AlertService {
  getAlerts(): InventoryAlert[] {
    const alerts: InventoryAlert[] = [];
    const stocks = dataService.getStocks();
    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    const sevenDays = 7 * 24 * 60 * 60 * 1000;

    stocks.forEach(product => {
      const totalStock = product.d3 + product.d2 + product.a1;
      
      // 1. Low Stock Alert
      if (totalStock < product.min) {
        alerts.push({
          id: `low-${product.code}`,
          type: 'LOW_STOCK',
          sku: product.code,
          description: product.description,
          details: `Existencia crítica: ${totalStock.toFixed(2)} ${product.unit} (Min: ${product.min})`,
          severity: totalStock === 0 ? 'error' : 'warning',
          timestamp: new Date()
        });
      }

      // 2. Expiry Alerts per Lote
      product.lotes.forEach(lote => {
        const timeToExpiry = lote.expiry.getTime() - now.getTime();
        
        if (timeToExpiry < 0) {
          alerts.push({
            id: `exp-over-${lote.id}`,
            type: 'CRITICAL_EXPIRY',
            sku: product.code,
            description: product.description,
            details: `Lote ${lote.id} VENCIDO el ${lote.expiry.toLocaleDateString()}`,
            severity: 'error',
            timestamp: new Date()
          });
        } else if (timeToExpiry < sevenDays) {
          alerts.push({
            id: `exp-crit-${lote.id}`,
            type: 'CRITICAL_EXPIRY',
            sku: product.code,
            description: product.description,
            details: `Lote ${lote.id} vence en menos de 7 días (${lote.expiry.toLocaleDateString()})`,
            severity: 'error',
            timestamp: new Date()
          });
        } else if (timeToExpiry < thirtyDays) {
          alerts.push({
            id: `exp-soon-${lote.id}`,
            type: 'EXPIRY_SOON',
            sku: product.code,
            description: product.description,
            details: `Lote ${lote.id} vence en ${Math.ceil(timeToExpiry / (24*60*60*1000))} días`,
            severity: 'warning',
            timestamp: new Date()
          });
        }
      });
    });

    return alerts;
  }
}

export const alertService = new AlertService();
