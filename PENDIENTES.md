# PENDIENTES — SISTEMA COSTAL ERP
> **Última actualización:** 24 Abril 2026 — BILL-SEC-01; verificación INT-01…INT-06 (estado en tabla INTEGRIDAD)

---

## 🔥 CRÍTICO / ALTA — programado 26 Abril 2026 (modelo **GPT 5.5**)

| ID | Prioridad | Tema | Acción (resumen) |
|----|-----------|------|------------------|
| **BILL-SEC-01** | **Crítica** | **Facturación: `Ant. Cliente`, `DxV` e integridad de cierre** | (1) Capar o rechazar en `addPayment` / al finalizar si el monto de línea `Ant. Cliente` excede el **saldo real** (USD o VES según nota). (2) Tras `applyClientAdvance`, **abortar o bloquear** la venta si el USD **aplicado** en firestore < **suma** de líneas de anticipo (hoy el sistema puede dejar un “pago en papel” sin respaldo; ver análisis 24-04-2026). (3) En horizon técnico, evaluar recálculo en **función/Edge** o cierre algebraico: `Σ cobros reales` + reglas (DxV, tasa) = total factura — la UI valida, pero el cliente confía en el payload. |

> **Contexto:** riesgo de fuga contable caja/anticipo si un operador o sesión maliciosa registra anticipo **mayor** al saldo: la factura cuadra en pantalla, pero en BD solo se descuenta el saldo disponible.

---

## ⚠️ INTEGRIDAD — IDEMPOTENCIA (riesgos tipo «doble devolución»)

> Tras blindar **devoluciones parciales** (límite por línea + NC previas + bloqueo en vuelo), los ítems **INT-01 a INT-05** quedaron **mitigados en código** (ver tabla). Sigue siendo deseable evolución **server-side** para INT-06 y para el cierre algebraico de facturación (véase **BILL-SEC-01**).

| ID | Prioridad | Estado (verificado código abr 2026) | Evidencia / pendiente |
|----|-----------|--------------------------------------|-------------------------|
| INT-01 | Alta | **Mitigado** | `registerSale`: `clientRequestId` → `findSaleByClientRequestId` antes de insertar; persistencia `client_request_id` + retorno idempotente si duplicado. `BillingView` asigna `saleRequestId` / `clientRequestId` al procesar. *Opcional aún:* índice único en Supabase sobre `client_request_id`. |
| INT-02 | Alta | **Mitigado** | `registerARPaymentWithSupport`: `runTransaction` en `ar_entries` — lee `balanceUSD`, rechaza si saldada o monto > saldo, `tx.set` pago + `tx.update` saldo atómico; luego `appendBankTransaction`. |
| INT-03 | Media | **Mitigado** | `applyClientAdvance` y `manualApplyClientAdvance`: cada aplicación en `runTransaction` sobre `client_advances` (balance + aplicación). |
| INT-04 | Media | **Mitigado (parcial)** | Anticipo proveedor: `applySupplierAdvanceToAP` / `manualApplySupplierAdvance` con `runTransaction`. Pagos CxP: `registerAPSplitPayments` usa **lock** `ap_payment_locks` + relectura de `balance_usd` en Supabase antes de pagar; serializa concurrencia por `apId`. *No* es un único `runTransaction` que incluya subcolección `payments` + Supabase AP en una sola transacción SQL. |
| INT-05 | Media | **Mitigado** | `voidSale`: lock distribuido `sale_void_locks` vía `runTransaction` (TTL 5 min) antes de anular; evita doble void entre pestañas/dispositivos. |
| INT-06 | Baja | **Residual** | `processingRef` en `BillingView` sigue siendo **solo misma pestaña**. Devolución parcial: `partialReturnSaleFlight` + transacciones en `dataService` — mejor que nada, no sustituye API server-side única. |

**Nota:** En facturación, `processingRef` evita doble envío **en la misma pestaña**; INT-01 a INT-05 quedan cubiertos en el cliente/servicios actuales según la tabla anterior. INT-06 describe el techo sin backend dedicado.

---

## 📊 RESUMEN (26 pendientes)

| Módulo | ✅ Hecho | ⏳ Pendiente | Alta | Media | Baja |
|--------|---------|-------------|------|-------|------|
| Seguridad (SEC) | 8 | 1 | 1 | 0 | 0 |
| Funcionalidades Nuevas (FEAT) | 9 | 2 | 1 | 1 | 0 |
| Facturación (BILL) | 18 | 6 | 1 | 3 | 2 |
| Finanzas (FIN) | 14 | 2 | 0 | 2 | 0 |
| Compras / Inventario (INV) | 12 | 1 | 0 | 1 | 0 |
| Caja (CAJA) | 1 | 0 | 0 | 0 | 0 |
| Brechas vs Competencia (CMP) | 9 | 6 | 0 | 3 | 3 |
| Reportes (REP) | 11 | 0 | 0 | 0 | 0 |
| Supervisión (SUP) | 3 | 0 | 0 | 0 | 0 |
| UX / Interfaz (UX) | 6 | 1 | 0 | 0 | 1 |
| Bugs / Fixes | 10 | 0 | 0 | 0 | 0 |
| **TOTAL** | **101** | **19** | **3** | **10** | **6** |

> **Progreso global: ~84%** | 101 completados · 19 pendientes

---

## 🔴 PRIORIDAD ALTA (10) — *incluye BILL-SEC-01 (26 abr, GPT 5.5)*

| ID | Módulo | Descripción |
|----|--------|-------------|
| **BILL-SEC-01** | **Facturación** | **Validación estricta Ant. Cliente vs saldo y coherencia post-`applyClientAdvance` (+ revisión cierre vs `registerSale`)** — *crítica; detalle en sección 26 abr* |
| SEC-04 | Seguridad | PINs alfanuméricos 8+ caracteres o 2FA |
| FEAT-01 | Nuevas | Portal web para clientes (ver CxC, facturas vía link/token único) |

---

## 🟡 PRIORIDAD MEDIA (10)

| ID | Módulo | Descripción |
|----|--------|-------------|
| FEAT-09 | Nuevas | Módulo de Presupuestos / Cotizaciones (convertible a factura con un clic) |
| INV-FEAT-13 | Compras / Inventario | **Protocolo de Desglose por Saco -> Kg (con proveedor/lote y costo real):** registrar compra en unidad `Saco` (ej. 5 sacos a $90), luego en Desglose seleccionar producto + proveedor/lote, indicar cantidad de sacos a desglosar y peso real por saco (ej. 50 kg). El sistema debe descontar sacos del lote origen, crear entrada en kg al almacén/pesa, calcular costo unitario real (`$90 / 50 = $1.80/kg`) y aplicar reglas de precios/beneficios por producto sin mezclar monedas ni romper trazabilidad. |
| BILL-FEAT-09 | Facturación | Vencimiento de letra de cambio configurable por cliente (`creditDays`) |
| BILL-FEAT-10 | Facturación | Condiciones de pago configurables en letra de cambio |
| BILL-UX-02 | Facturación | Indicador de tasa activa (BCV vs interna) visible en panel de totales |
| BILL-FEAT-11 | Facturación | Devolución parcial de venta (por ítems específicos, no solo anulación total) con nota de crédito al cliente |
| FIN-10 | Finanzas | Función `voidARPayment` / `voidAPPayment` — reverso de pago CxC/CxP registrado por error |
| FIN-11 | Finanzas | CxP no actualiza estado a `OVERDUE` automáticamente al vencer el plazo — requiere job/revisión periódica al cargar |
| INV-13 | Compras / Inventario | Ejecutar en Supabase el script `Comandos Base de datos/Crear tabla inventory_movements.sql` para habilitar trazabilidad detallada (SALE_RETURN) y eliminar error `404` en `rest/v1/inventory_movements`; validar lectura, inserción y realtime tras despliegue. |
| CMP-13 | Competencia | Retenciones IVA / ISLR en facturas de compra y venta |
| CMP-03 | Competencia | OC **MVP** (Inventario → «Órdenes OC»): borrador → envío → aprobación (Finanzas/Supervisor) → recepción con factura vinculada; anular compra revierte cantidades en OC. **Sigue:** editar borrador en UI, PDF/export, reglas avanzadas |
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
| CMP-03 | **Orden de compra (MVP):** Firestore `purchase_orders` + listener en `dataService`; correlativo `OC-AAAA-#####` vía `system_counters`; panel `PurchaseOrdersPanelModal` y botón en `InventoryView`; recepción con `PurchaseEntryModal` (`purchaseOrderId`, validación SKU/cantidad/almacén); `purchase_entries` guarda `purchaseOrderId` / `purchaseOrderLineId`; `voidPurchaseEntry` revierte `qtyReceived` |

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