#!/usr/bin/env node
/**
 * Workaround para el bug npm#4828 (https://github.com/npm/cli/issues/4828)
 *
 * @tailwindcss/oxide es un binario nativo (Rust + NAPI-RS) cuyas dependencias
 * por plataforma se instalan vía optionalDependencies. Cuando se ejecuta
 * `npm install` sin un package-lock.json prexistente, npm falla en resolver
 * dichas optionalDependencies anidadas, dejando al loader sin binding.
 *
 * Este script se ejecuta en `postinstall` y fuerza la instalación del paquete
 * de binding apropiado para la plataforma actual, evitando el bug.
 */

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function detectMusl() {
  // Intenta detectar Alpine/musl. ubuntu-latest siempre es glibc.
  try {
    const ldd = fs.readFileSync('/usr/bin/ldd', 'utf-8');
    return ldd.includes('musl');
  } catch (_) {
    return false;
  }
}

function getOxideVersion() {
  try {
    const pkgPath = path.join(
      __dirname,
      '..',
      'node_modules',
      '@tailwindcss',
      'oxide',
      'package.json'
    );
    return require(pkgPath).version;
  } catch (_) {
    return null;
  }
}

function targetPackage() {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'linux' && arch === 'x64') {
    return detectMusl()
      ? '@tailwindcss/oxide-linux-x64-musl'
      : '@tailwindcss/oxide-linux-x64-gnu';
  }
  if (platform === 'linux' && arch === 'arm64') {
    return detectMusl()
      ? '@tailwindcss/oxide-linux-arm64-musl'
      : '@tailwindcss/oxide-linux-arm64-gnu';
  }
  if (platform === 'darwin' && arch === 'x64') {
    return '@tailwindcss/oxide-darwin-x64';
  }
  if (platform === 'darwin' && arch === 'arm64') {
    return '@tailwindcss/oxide-darwin-arm64';
  }
  if (platform === 'win32' && arch === 'x64') {
    return '@tailwindcss/oxide-win32-x64-msvc';
  }
  if (platform === 'win32' && arch === 'arm64') {
    return '@tailwindcss/oxide-win32-arm64-msvc';
  }
  return null;
}

function bindingAlreadyInstalled(pkgName) {
  try {
    const dir = path.join(__dirname, '..', 'node_modules', ...pkgName.split('/'));
    if (!fs.existsSync(dir)) return false;
    const files = fs.readdirSync(dir);
    return files.some((f) => f.endsWith('.node'));
  } catch (_) {
    return false;
  }
}

function main() {
  const pkg = targetPackage();
  if (!pkg) {
    console.log(`[install-platform-binding] Plataforma no soportada: ${process.platform}/${process.arch} — saltando.`);
    return;
  }

  if (bindingAlreadyInstalled(pkg)) {
    console.log(`[install-platform-binding] ${pkg} ya está instalado — OK.`);
    return;
  }

  const version = getOxideVersion();
  if (!version) {
    console.log('[install-platform-binding] @tailwindcss/oxide no instalado aún — saltando.');
    return;
  }

  const spec = `${pkg}@${version}`;
  console.log(`[install-platform-binding] Instalando ${spec} (workaround npm#4828)...`);
  try {
    execSync(`npm install --no-save --no-audit --no-fund ${spec}`, {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    console.log(`[install-platform-binding] ${spec} instalado correctamente.`);
  } catch (err) {
    console.warn(`[install-platform-binding] No se pudo instalar ${spec}: ${err.message}`);
    // No fallar el postinstall: el build se quejará si realmente falta.
  }
}

main();
