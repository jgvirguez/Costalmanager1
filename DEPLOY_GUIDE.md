# Guía de Sincronización Local ↔ Nube

## Configuración para Deploy Automático

### Opción 1: Deploy Manual Rápido
```bash
# Construir y desplegar en un solo comando
npm run deploy
```

### Opción 2: Deploy Automático (Modo Watcher)
```bash
# Inicia el watcher que detecta cambios y deploy automático
npm run deploy:watch
```

El watcher:
- 📁 Vigila cambios en la carpeta `src/`
- ⏱️ Espera 3 segundos después del último cambio
- 🔨 Construye automáticamente (`npm run build`)
- 📦 Despliega a Firebase Hosting
- ✅ Notifica cuando termina

### Opción 3: Deploy Automático con GitHub Actions (Requiere configuración)

1. **Configurar Firebase Service Account:**
   ```bash
   # Descargar la clave de servicio desde Firebase Console
   # Ir a Project Settings > Service accounts > Generate new private key
   # Guardar como: firebase-service-account.json
   ```

2. **Configurar GitHub Secrets:**
   - `FIREBASE_SERVICE_ACCOUNT`: Contenido del archivo JSON
   - (Ya viene `GITHUB_TOKEN` por defecto)

3. **Activar:**
   - Subir cambios a GitHub
   - El workflow se ejecuta automáticamente

## Flujo de Trabajo Recomendado

### Desarrollo Local
```bash
# Terminal 1: Servidor de desarrollo
npm run dev

# Terminal 2: Deploy automático (opcional)
npm run deploy:watch
```

### Cuando haces cambios:
1. Guardas el archivo en VS Code
2. Si tienes `deploy:watch` activo → Deploy automático en 3 segundos
3. Si no, ejecutas `npm run deploy` manualmente

### Verificación
```bash
# Ver sitio en producción
https://costalmanager.web.app
```

## Ventajas

✅ **Sincronización inmediata:** Cambios locales → Nube en segundos  
✅ **Sin intervención manual:** El watcher hace todo  
✅ **Build automático:** Siempre compila antes de deploy  
✅ **Notificaciones:** Sabes cuándo termina cada deploy  
✅ **Rollback fácil:** Firebase mantiene versiones anteriores  

## Notas

- El deploy automático solo sube cambios de archivos (`.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.json`)
- Ignora `node_modules` y archivos de configuración
- Puedes detener el watcher con `Ctrl+C`
- El primer deploy puede tardar más por la construcción inicial
