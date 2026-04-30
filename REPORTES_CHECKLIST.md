# Checklist Profesional de Reportes (Costal Manager)

Ultima revision: 2026-04-24

## Criterios obligatorios (Definition of Done)

Cada reporte/exportacion se considera listo para produccion solo si cumple:

- [ ] Encabezado claro (nombre del reporte, periodo, timestamp)
- [ ] Totalizadores (sumas/conteos/promedios cuando aplique)
- [ ] Auditoria (quien genero + parametros/filtros)
- [ ] Consistencia visual (tipografia, colores, margenes y jerarquia)
- [ ] Control de acceso RBAC (visualizacion/exportacion para roles autorizados)

---

## Matriz de estado por reporte

Leyenda:
- Cumple: criterio implementado de forma consistente
- Parcial: existe en algunos flujos/exportes, falta estandarizar
- Pendiente: no implementado o sin control formal

### 1) Vision General (Ventas)

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (PDF y CSV incluyen usuario generador, timestamp y filtros)
- Consistencia visual: **Cumple** (encabezado PDF homologado: reporte, periodo, filtros y generado por)
- RBAC: **Cumple** (bloques sensibles de finanzas/inventario en Vision General con permisos granulares)

### 2) Factura x Cajero

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (filtros aplicados en exportes)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo + exportacion controlada con permiso fino)

### 3) Cierre Z

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (cajeros/filtros en PDF)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo + exportacion PDF con permiso fino)

### 4) Tesoreria

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (filtros en CSV/PDF)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo + exportaciones CSV/PDF controladas con permiso fino)

### 5) Libro de Compras

- Encabezado claro: **Cumple** (UI + PDF con titulo, rango y generado por)
- Totalizadores: **Cumple** (footer en UI, fila TOTAL en CSV y total en PDF)
- Auditoria: **Cumple** (CSV con metadata de filtros/usuario; PDF con timestamp y operador)
- Consistencia visual: **Cumple** (estilo homologado en tarjeta/tabla/export)
- RBAC: **Cumple** (tab por modulo + exportacion PDF/Excel controlada con permiso fino)

### 6) Libro de Egresos

- Encabezado claro: **Cumple** (UI + PDF con contexto de rango/categoria)
- Totalizadores: **Cumple** (footer en UI, fila TOTAL en CSV y total en PDF)
- Auditoria: **Cumple** (CSV con metadata y filtros; PDF con generado por y periodo)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo + exportacion controlada con permiso fino)

### 7) Margenes

- Encabezado claro: **Cumple** (UI + PDF con titulo/fecha/generado por)
- Totalizadores: **Cumple** (CSV con fila TOTAL y PDF con resumen ejecutivo)
- Auditoria: **Cumple** (CSV/PDF alineados con filtros activos de SKU/lote)
- Consistencia visual: **Cumple** (tarjeta, tabla y exportes homologados)
- RBAC: **Cumple** (tab por modulo inventario + exportaciones controladas con permiso fino)

### 8) Mermas

- Encabezado claro: **Cumple** (UI + PDF con encabezado formal)
- Totalizadores: **Cumple** (KPIs en UI + TOTAL en CSV/PDF)
- Auditoria: **Cumple** (CSV con metadata; PDF con generado por/timestamp)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo inventario + exportacion PDF/Excel controlada con permiso fino)

### 9) Utilidad Bruta Vendida

- Encabezado claro: **Cumple** (bloque UI + PDF con titulo y rango)
- Totalizadores: **Cumple** (tickets, venta, costo, utilidad, margen)
- Auditoria: **Cumple** (filtros personalizados desde/hasta/producto en CSV/PDF)
- Consistencia visual: **Cumple**
- RBAC: **Cumple** (tab por modulo ventas + exportaciones controladas con permiso fino)

---

## Brechas prioritarias para cerrar al 100%

### Prioridad Alta

- [x] Estandarizar en **todos** los PDFs:
  - Nombre de reporte
  - Periodo
  - Timestamp
  - Usuario que genera
  - Filtros aplicados (incluyendo filtros personalizados por tab: Utilidad/Margenes)
  - Estado actual: **Cerrado** (bloque Reporte/Periodo/Filtros/Generado por homologado en exportes PDF de `reportService` y `printService` para reportes gerenciales, incluyendo Utilidad, Margenes, Tesoreria, Cierre Z, Compras, Egresos, Mermas, Vision General, Ventas y Anticipos)

- [x] Estandarizar en **todos** los CSV:
  - Metadata inicial: tipo de reporte, filtros y usuario
  - Fila final de totales (columnas numericas) en reportes financieros/comerciales
  - Estado actual: **Cerrado** (homologado en ReportsView, FinanceView y BankReport con metadata comun `TIPO_REPORTE/FILTROS_APLICADOS/GENERADO_POR/FECHA_GENERACION` y fila final de totales en reportes financieros/comerciales)

- [x] Definir permisos RBAC por subreporte sensible:
  - Tesoreria
  - Egresos
  - Margenes
  - Cierre Z
  - Exportacion (permiso separado opcional)
  - Estado actual: **Cerrado** (control fino de exportacion aplicado por subreporte, incluyendo Compras y Mermas)

- [x] Alinear `getActiveFilterLabel()` con filtros reales por tab:
  - Utilidad Bruta (desde/hasta/producto)
  - Margenes (sku/lote)
  - Evitar metadata "falsa parcial" en exportes CSV
  - Estado actual: **Cerrado para tabs de prioridad alta** (Utilidad y Margenes alineados)

### Prioridad Media

- [x] Unificar estilo PDF (paleta, tamanos, margenes, jerarquia de bloques)
  - Estado actual: **Cerrado en reportes exportables** (`reportService` + `printService` para Ventas/Anticipos): encabezado homologado, bloques de resumen consistentes, totales al cierre y firma/paginacion estandar.
  - Nota de alcance: comprobantes transaccionales (tickets/facturas termicas) mantienen formato operativo propio y no forman parte de este criterio de reportes gerenciales.
- [x] Homologar pie de reporte (firmas, paginacion, resumen ejecutivo)
  - Estado actual: **Cerrado en reportes operativos (reportService)**: pie estandar con firmas + paginacion en todos los `export*ToPDF`; resumen ejecutivo conservado en los reportes que ya lo tenian.

### Prioridad Baja

- [x] Agregar trazabilidad de version de reporte (vX.Y o hash corto)
- [x] Plantilla unica reusable para nuevos reportes

---

## Checklist operativo pre-despliegue de reportes

Ejecutar antes de cada release:

- [x] Revisar build y lints sin errores
- [x] Validar 1 export CSV y 1 PDF por reporte modificado (validacion tecnica en codigo)
- [x] Validar filtros extremos (sin datos / muchos datos / multi-cajero) (validacion tecnica en codigo)
- [x] Validar totales contra UI (validacion tecnica en codigo)
- [x] Validar permisos con usuario no admin (validacion tecnica en codigo RBAC)
- [x] Documentar cambios funcionales en este archivo

### Ejecucion real del checklist (2026-04-24)

- Build (`npm run build`): **OK** (re-ejecutado 2026-04-24 13:39).
- Lint (`npm run lint`): **OK** (re-ejecutado 2026-04-24 13:39).
- Exportes CSV/PDF por reporte modificado: **OK en validacion tecnica de codigo** (flujos de exportacion CSV/PDF habilitados y compilando en reportes modificados); **pendiente QA manual en UI** para evidencia operativa final.
- Filtros extremos (sin datos / masivos / multi-cajero): **OK en validacion tecnica de codigo** (filtros y agregaciones contemplan datasets vacios, volumen alto por agregacion y segmentacion por cajero en reportes); **pendiente QA manual en UI** para evidencia operativa final.
- Totales vs UI: **OK en validacion tecnica de codigo** (totales UI y exportes calculados sobre el mismo dataset filtrado con agregaciones `reduce` en `ReportsView` y `BankReport`); **pendiente QA manual en UI** para evidencia operativa final.
- Permisos usuario no admin: **OK en validacion tecnica de codigo** (`dataService.getPermissionsForRole` + bloqueos `disabled` por permiso en `ReportsView`); **pendiente QA manual en UI** para evidencia operativa final.
- Cambios funcionales documentados: **OK** (seccion "Cambios recientes documentados").

## Cambios recientes documentados (2026-04-24)

- [x] Utilidad Bruta: filtros activos por **desde/hasta/producto** en UI.
- [x] Utilidad Bruta: PDF y CSV ajustados al dataset filtrado.
- [x] Utilidad Bruta: metadata de exportacion alineada a filtros reales del tab.
- [x] Margenes: filtro por **SKU/descripcion** y **lote** en UI.
- [x] Margenes: exportes PDF/CSV sincronizados con filtros activos.
- [x] Margenes: metadata de exportacion alineada a filtros reales del tab.
- [x] Margenes: rotulo homologado de columna `Revenue $` a `Total $`.
- [x] Margenes: correccion de calculo `Vendido / Total $ / Utilidad $` con fallback por ventas/lotes.
- [x] CSV de Utilidad/Margenes: fila `TOTAL` agregada para columnas numericas.
- [x] CSV de Compras/Egresos/Mermas/Tesoreria (bancos): fila `TOTAL` agregada para columnas numericas.
- [x] CSV de Tesoreria operaciones: metadata de auditoria alineada (reporte + filtros), conservando total explicito del dataset.
- [x] RBAC fino de exportacion aplicado en: Factura x Cajero, Cierre Z, Tesoreria, Egresos, Margenes, Utilidad, Compras y Mermas.
- [x] Estandarizacion de metadatos PDF reforzada en reportes operativos: `Periodo + Filtros + Generado por` en Utilidad, Margenes, Cierre Z y Mermas.
- [x] Vision General: migrada a enfoque contable (Libro de Operaciones consolidado) con filtros por tipo de movimiento, flujo (ingreso/egreso), busqueda, y exportacion alineada.
- [x] Vision General: exportacion PDF propia (`Vision General Contable`) y exportacion CSV alineadas al mismo dataset filtrado.
- [x] Vision General / Libro de Operaciones: normalizacion de `Metodo` en exportes y tabla (`Pago Movil`, `Efectivo $`, `Efectivo Bs`, `Transferencia`, `Zelle`, `Biopago`).
- [x] Uniformidad de totales en PDF: removidos totales monetarios duplicados en encabezado (Ventas y Factura x Cajero), manteniendo totalizacion al cierre del reporte.
- [x] Estandarizacion CSV ampliada: FinanceView (egresos) y BankReport homologados al mismo modelo de metadata y compatibilidad Excel.
- [x] Trazabilidad de version en reportes: incorporado control de version de reporte (`vX.Y` / hash corto) para facilitar auditoria y seguimiento de cambios entre exportes.
- [x] Plantilla unica reusable para reportes: base estandar consolidada para nuevos reportes (estructura de encabezado, metadata, totales y pie homologados para reuso).

---

## Nota de gobernanza

Regla recomendada:

"Ningun reporte se considera listo para produccion si no cumple los 5 criterios obligatorios."

