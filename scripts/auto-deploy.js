import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const WATCH_DIR = path.join(__dirname, '../src');
const DEBOUNCE_TIME = 3000; // 3 segundos después del último cambio

let debounceTimer = null;

console.log('🚀 Iniciando watcher para deploy automático a Firebase...');
console.log('📁 Vigilando cambios en:', WATCH_DIR);
console.log('⏱️  Tiempo de espera:', DEBOUNCE_TIME + 'ms');

function deploy() {
  try {
    console.log('\n🔨 Construyendo proyecto...');
    execSync('npm run build', { stdio: 'inherit' });
    
    console.log('📦 Desplegando a Firebase Hosting...');
    execSync('firebase deploy --only hosting', { stdio: 'inherit' });
    
    console.log('✅ Deploy completado exitosamente');
    console.log('🌐 Sitio actualizado en: https://costalmanager.web.app');
  } catch (error) {
    console.error('❌ Error en el deploy:', error.message);
  }
}

// Función para manejar cambios con debounce
function handleChange() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  
  console.log('📝 Cambio detectado, esperando para hacer deploy...');
  
  debounceTimer = setTimeout(() => {
    console.log('⏰ Ejecutando deploy automático...');
    deploy();
  }, DEBOUNCE_TIME);
}

// Iniciar watcher (usando Node.js simple)
if (fs.existsSync(WATCH_DIR)) {
  const watcher = fs.watch(WATCH_DIR, { recursive: true }, (eventType, filename) => {
    if (filename) {
      // Ignorar archivos que no son TypeScript/JavaScript/CSS
      if (!/\.(ts|tsx|js|jsx|css|json)$/.test(filename)) {
        return;
      }
      handleChange();
    }
  });
  
  console.log('👀 Watcher activo. Presiona Ctrl+C para detener.');
  
  // Deploy inicial
  console.log('🎯 Ejecutando deploy inicial...');
  deploy();
  
  // Manejar cierre
  process.on('SIGINT', () => {
    console.log('\n🛑 Deteniendo watcher...');
    watcher.close();
    process.exit(0);
  });
} else {
  console.error('❌ Directorio no encontrado:', WATCH_DIR);
}
