# PENDIENTES — SISTEMA COSTAL ERP
> **Última actualización:** 23 Abril 2026 — Incluye revisión de integridad / idempotencia (post–devoluciones)

---

## ⚠️ INTEGRIDAD — IDEMPOTENCIA (riesgos tipo «doble devolución»)

> Tras blindar **devoluciones parciales** (límite por línea + NC previas + bloqueo en vuelo), conviene abordar patrones **análogos**: operaciones que deben ejecutarse **una sola vez** o con **tope** al saldo real, y hoy dependen de la UI o de lectura en memoria sin transacción server-side.

| ID | Prioridad | Riesgo | Acción propuesta |
|----|-----------|--------|------------------|
| INT-01 | Alta | **Registrar venta (`registerSale`)** — Entre pestañas/usuarios o si falla el `processingRef`, puede generarse más de una venta, con doble descuento FEFO y múltiples `bank_transaction` de ingreso (mismo escenario económico que la doble devolución, en sentido inverso). En `DataService` no hay idempotency key ni lock. | Idempotency key (UUID por intento de factura) persistida al insertar; en fallo de red, reconciliar antes de reintentar; opcional: índice único lógico en Supabase (`client_request_id`). |
| INT-02 | Alta | **Cobro CxC** (`registerARPaymentWithSupport` / cobro en caja) — El saldo del `ar_entry` se actualiza con lectura previa; dos envíos simultáneos pueden registrar **dos pagos** por el saldo completo (doble ingreso bancario / doble línea en subcolección `payments`). | `runTransaction` en Firestore leyendo `balanceUSD` y validando `payment <= balance`, o `increment` + comprobación atómica; relectura de documento antes de `appendBankTransaction`. |
| INT-03 | Media | **Anticipos de cliente** (`applyClientAdvance`) — Varias ventas leyendo el mismo saldo de anticipo y aplicando en paralelo pueden **sobre-aplicar** el mismo cupo. | Transacción Firestore al descontar `balanceUSD` en `client_advances`. |
| INT-04 | Media | **Anticipos de proveedor / pagos CxP** — Mismo patrón lectura→escritura en `supplier_advances` y pagos a documentos AP. | Transacciones o validación atómica de saldo igual que INT-02/INT-03. |
| INT-05 | Media | **Anulación de venta (`voidSale`)** — Ya valida `VOID` en memoria/lectura; dos clics ultra-rápidos o dos clientes podrían intentar anular antes de persistir el estado. Menor probabilidad que devolución duplicada pero mismo patrón. | `update` condicionado (`status == 'COMPLETED'`) o transacción; regla de Firestore que rechace segunda anulación. |
| INT-06 | Baja | **Controles solo en memoria** (p. ej. `partialReturnSaleFlight`, `processingRef` en facturación) — No cruzan pestañas ni dispositivos. | Asumir validación definitiva en backend o reglas que impidan estados imposibles; ideal: API con token de idempotencia. |

**Nota:** En facturación, `BillingView` ya usa `processingRef` para evitar doble envío **en la misma pestaña**; INT-01 refiere brechas que esa medida **no cubre**.

---

## 📊 RESUMEN (25 pendientes)

| Módulo | ✅ Hecho | ⏳ Pendiente | Alta | Media | Baja |
|--------|---------|-------------|------|-------|------|
| Seguridad (SEC) | 8 | 1 | 1 | 0 | 0 |
| Funcionalidades Nuevas (FEAT) | 9 | 2 | 1 | 1 | 0 |
| Facturación (BILL) | 18 | 5 | 0 | 3 | 2 |
| Finanzas (FIN) | 14 | 2 | 0 | 2 | 0 |
| Compras / Inventario (INV) | 12 | 1 | 0 | 1 | 0 |
| Caja (CAJA) | 1 | 0 | 0 | 0 | 0 |
| Brechas vs Competencia (CMP) | 9 | 6 | 0 | 3 | 3 |
| Reportes (REP) | 11 | 0 | 0 | 0 | 0 |
| Supervisión (SUP) | 3 | 0 | 0 | 0 | 0 |
| UX / Interfaz (UX) | 6 | 1 | 0 | 0 | 1 |
| Bugs / Fixes | 10 | 0 | 0 | 0 | 0 |
| **TOTAL** | **101** | **18** | **2** | **10** | **6** |

> **Progreso global: ~85%** | 101 completados · 18 pendientes

---

## 🔴 PRIORIDAD ALTA (9)

| ID | Módulo | Descripción |
|----|--------|-------------|
| SEC-04 | Seguridad | PINs alfanuméricos 8+ caracteres o 2FA |
| FEAT-01 | Nuevas | Portal web para clientes (ver CxC, facturas vía link/token único) |

---

## 🟡 PRIORIDAD MEDIA (10)

| ID | Módulo | Descripción |
|----|--------|-------------|
| FEAT-09 | Nuevas | Módulo de Presupuestos / Cotizaciones (convertible a factura con un clic) |
| BILL-FEAT-09 | Facturación | Vencimiento de letra de cambio configurable por cliente (`creditDays`) |
| BILL-FEAT-10 | Facturación | Condiciones de pago configurables en letra de cambio |
| BILL-UX-02 | Facturación | Indicador de tasa activa (BCV vs interna) visible en panel de totales |
| BILL-FEAT-11 | Facturación | Devolución parcial de venta (por ítems específicos, no solo anulación total) con nota de crédito al cliente |
| FIN-10 | Finanzas | Función `voidARPayment` / `voidAPPayment` — reverso de pago CxC/CxP registrado por error |
| FIN-11 | Finanzas | CxP no actualiza estado a `OVERDUE` automáticamente al vencer el plazo — requiere job/revisión periódica al cargar |
| CMP-13 | Competencia | Retenciones IVA / ISLR en facturas de compra y venta |
| CMP-03 | Competencia | Orden de compra (OC) — flujo OC → aprobación → recepción |
| CMP-05 | Competencia | QR / código de barras en factura PDF |

---

## 🟢 PRIORIDAD BAJA (6)

| ID | Módulo | Descripción |
|----|--------|-------------|
| BILL-UX-04 | Facturación | Guía visual completa de atajos (panel cheatsheet con todos los hotkeys) |
| BILL-UX-05 | Facturación | Renombrar tabs "Venta 1" / "Venta 2" con edición inline del label |
| CMP-07 | Competencia | Imagen de producto en catálogo y búsqueda de ítems |
| CMP-08 | Competencia | Comisiones de vendedor por venta o cobro CxC |
| CMP-09 | Competencia | Descuento por volumen automático (qty > X → precio Y) |
| FEAT-12 | Nuevas | Notificaciones por email (stock mínimo, CxP vencidas, mora CxC) |

---

## ✅ IMPLEMENTADO RECIENTEMENTE (esta sesión)

| ID | Descripción |
|----|-------------|
| SEC-03 | Registro de IP / dispositivo en cada login — `login_sessions` en Firestore, detección browser/OS/IP |
| SEC-06 | Control de sesiones concurrentes (máx. 2) — `active_sessions` en Firestore, bloqueo modal en `LoginView` |
| SEC-09 | Alertas de seguridad — `security_alerts` en Firestore, campanita con badge en `SecurityView` |
| FIN-08 | Anticipos por cliente — tab `Anticipos` en `FinanceView`, historial por anticipo, aplicación manual |
| CMP-10 | Importar catálogo desde CSV/Excel — `batchImportProducts` en `dataService`, modal en `InventoryView` |
| INV-11 | Ajuste manual de inventario — `adjustInventoryBatch()` en `dataService`, modal `InventoryAdjustmentModal` + botón naranja en `InventoryView` |
| INV-12 | Traslado entre almacenes — `transferInventoryBatch()` en `dataService`, `TransferModal` refactorizado con lote requerido, merge/create en destino, doble movimiento `TRANSFER`, rollback en origen si falla |
| BILL-FIX-01 | `voidSale` ahora elimina `sale_payments` y `bank_transactions` de Firestore al anular. Fin de ingresos fantasma en bancos |
| BILL-FIX-02 | `voidSale` reemplaza RPC `revert_batch_dispatch` (inexistente) por `UPDATE` directo en `inventory_batches` + movimiento `VOID` en kardex. `dispatchLotes.batchId` ahora guarda UUID completo |
| BUG-FIX-01 | `SaleHistoryEntry` ahora incluye campo `userId?: string`. `registerSale` stampa `userId` al objeto en memoria y persiste `user_id` en Supabase. El mapeo de carga desde Supabase lee `s.user_id`. `getOperatorPerformanceReport` ya filtraba por `sale.userId` y ahora funciona correctamente |
| CAJA-01 | `registerCashBoxWithdrawal` ahora genera `bank_transaction` en Firestore. Resuelve banco activo por método (`cash_usd`/`cash_ves`); si no hay banco configurado usa `bankName='CAJA'` como fallback. Retiros y vueltos de caja impactan el balance bancario en Finanzas |
| FIN-09 | Anticipos de proveedor — interfaz `SupplierAdvance`, métodos `createSupplierAdvance`, `getAllSupplierAdvancesForAdmin`, `manualApplySupplierAdvance`, `applySupplierAdvanceToAP`, `getSupplierAdvanceHistory` en `dataService.ts`. Sub-tab «Anticipos Proveedores» en `FinanceView` con tabla, historial expandible, modal de creación y modal de aplicación a CxP |
| BILL-INT-01 | **Devolución parcial** — validación de cantidades frente a NC previas (Firestore) por `saleCorrelativo` + `lineIndex` en ítems; lock `partialReturnSaleFlight` mientras dura el proceso. Mitiga doble devolución (stock/banco) descrita en INT-0x; ver INT-06 para multi-dispositivo |

---

## 🔒 AUDITORÍA 100% — PENDIENTES DE BLINDAJE

| ID | Prioridad | Brecha detectada | Acción propuesta |
|----|-----------|------------------|------------------|
| AUD-01 | Alta | Ventas continúan en modo local cuando falla persistencia central | Implementar cola durable de sincronización + estado `PENDING_SYNC` visible y auditable |
| AUD-02 | Alta | Fallas en `bank_transactions` no siempre bloquean cierre de flujo | Definir política: bloquear operación crítica o marcar incidente obligatorio de conciliación |
| AUD-03 | Alta | `auditLog` visible limitado a últimos 50 y reconstruido en memoria | Crear bitácora inmutable append-only (`audit_events`) con paginación histórica completa |
| AUD-04 | Media | Actor en algunos eventos aparece como `Admin`/`Operador` genérico | Persistir `actorUserId`, `actorName`, `role`, `sessionId`, `ip`, `device` en cada evento |
| AUD-05 | Media | `addAuditEntry` sin reintento robusto ni fallback transaccional | Agregar retry con backoff + cola de reintentos y alerta si falla escritura |
| AUD-06 | Media | Eventos de seguridad/caja dispersos en colecciones distintas | Unificar correlación por `traceId` entre venta, caja, banco, CxC, CxP y seguridad |
| AUD-07 | Baja | Sin reporte de “huecos de auditoría” operativo | Crear reporte diario de eventos fallidos/no sincronizados para control interno |