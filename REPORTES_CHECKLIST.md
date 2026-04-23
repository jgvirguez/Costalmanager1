# Checklist Profesional de Reportes (Costal Manager)

Ultima revision: 2026-04-22

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
- RBAC: **Parcial** (falta permiso fino por subreporte/exportacion)

### 3) Cierre Z

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (cajeros/filtros en PDF)
- Consistencia visual: **Cumple**
- RBAC: **Parcial** (igual: control por modulo, no por subreporte)

### 4) Tesoreria

- Encabezado claro: **Cumple**
- Totalizadores: **Cumple**
- Auditoria: **Cumple** (filtros en CSV/PDF)
- Consistencia visual: **Cumple**
- RBAC: **Parcial**

### 5) Libro de Compras

- Encabezado claro: **Parcial**
- Totalizadores: **Parcial**
- Auditoria: **Parcial**
- Consistencia visual: **Parcial**
- RBAC: **Parcial**

### 6) Libro de Egresos

- Encabezado claro: **Parcial**
- Totalizadores: **Parcial**
- Auditoria: **Parcial**
- Consistencia visual: **Parcial**
- RBAC: **Parcial**

### 7) Margenes

- Encabezado claro: **Parcial**
- Totalizadores: **Parcial**
- Auditoria: **Parcial**
- Consistencia visual: **Parcial**
- RBAC: **Parcial**

### 8) Mermas

- Encabezado claro: **Parcial**
- Totalizadores: **Parcial**
- Auditoria: **Parcial**
- Consistencia visual: **Parcial**
- RBAC: **Parcial**

---

## Brechas prioritarias para cerrar al 100%

### Prioridad Alta

- [ ] Estandarizar en **todos** los PDFs:
  - Nombre de reporte
  - Periodo
  - Timestamp
  - Usuario que genera
  - Filtros aplicados

- [ ] Estandarizar en **todos** los CSV:
  - Metadata inicial: tipo de reporte, filtros y usuario
  - Fila final de totales (columnas numericas)

- [ ] Definir permisos RBAC por subreporte sensible:
  - Tesoreria
  - Egresos
  - Margenes
  - Cierre Z
  - Exportacion (permiso separado opcional)

### Prioridad Media

- [ ] Unificar estilo PDF (paleta, tamanos, margenes, jerarquia de bloques)
- [ ] Homologar pie de reporte (firmas, paginacion, resumen ejecutivo)

### Prioridad Baja

- [ ] Agregar trazabilidad de version de reporte (vX.Y o hash corto)
- [ ] Plantilla unica reusable para nuevos reportes

---

## Checklist operativo pre-despliegue de reportes

Ejecutar antes de cada release:

- [ ] Revisar build y lints sin errores
- [ ] Validar 1 export CSV y 1 PDF por reporte modificado
- [ ] Validar filtros extremos (sin datos / muchos datos / multi-cajero)
- [ ] Validar totales contra UI
- [ ] Validar permisos con usuario no admin
- [ ] Documentar cambios funcionales en este archivo

---

## Nota de gobernanza

Regla recomendada:

"Ningun reporte se considera listo para produccion si no cumple los 5 criterios obligatorios."

