# Sistema Costal — ERP

Aplicación administrativa (facturación, inventario, finanzas, caja, reportes). Cliente web en **React + Vite**.

## Producción

| Recurso | Detalle |
|--------|---------|
| **Hosting (app)** | [https://costalmanager.web.app](https://costalmanager.web.app) (Firebase Hosting) |
| **Proyecto Firebase** | `costalmanager` (ver `.firebaserc`) |
| **Firebase** | Auth, Firestore, Storage, etc. según `src/services/firebaseConfig.ts` |
| **Supabase** | Base relacional (p. ej. ventas, inventario, movimientos); URL y claves en variables de entorno |

> **Despliegue:** `npm run deploy` (build + Firebase). Más detalle en [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md).

## Ejecutar en local

**Requisitos:** Node.js, credenciales Firebase (`VITE_FIREBASE_*`) y Supabase según [`.env.example`](.env.example) (copiar a `.env` / `.env.local`).

```bash
npm install
npm run dev
```

Por defecto el dev server escucha en el puerto configurado en `package.json` (p. ej. `2000`).

## Documentación adicional

- [DEPLOY_GUIDE.md](DEPLOY_GUIDE.md) — deploy manual, watcher y GitHub Actions
- [PENDIENTES.md](PENDIENTES.md) — roadmap y riesgos de integridad
- [REPORTES_CHECKLIST.md](REPORTES_CHECKLIST.md) — reportes

---

*Banner anterior (AI Studio) omitido: el origen de edición ahora es este repositorio local.*
