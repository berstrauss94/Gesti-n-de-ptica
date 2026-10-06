// =====================================================================
// Quita el fondo "falso" (patrón de ajedrez gris/blanco quemado) de los
// lentes recortados y genera PNG con transparencia REAL.
//
// Estrategia: recorrer píxeles; los que sean grises claros / blancos
// (típicos del ajedrez de fondo) y de baja saturación se vuelven
// transparentes. Un flood-fill desde los bordes evita borrar grises
// que estén DENTRO del anteojo (cristales claros).
//
// Uso:
//   node scripts/quitar-fondo-lentes.js
// Lee de  lentes-recortados/   y escribe en  lentes-transparentes/
// =====================================================================

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));

const ENTRADA = path.join(__dirname, '..', 'lentes-recortados');
const SALIDA = path.join(__dirname, '..', 'lentes-transparentes');

// ¿El pixel parece fondo de ajedrez? (claro y poco saturado)
function esFondo(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturacion = max - min;      // 0 = gris puro
  const brillo = (r + g + b) / 3;
  // Fondo: claro (brillo alto) y casi sin color (saturación baja)
  return brillo > 150 && saturacion < 35;
}

async function procesar(archivo) {
  const rutaIn = path.join(ENTRADA, archivo);
  const { data, info } = await sharp(rutaIn)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const idx = (x, y) => (y * width + x) * channels;

  // Flood-fill desde los 4 bordes: solo volvemos transparentes los píxeles
  // de fondo CONECTADOS al borde. Así no tocamos grises internos del anteojo.
  const visitado = new Uint8Array(width * height);
  const pila = [];

  const encolarBorde = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    pila.push([x, y]);
  };
  for (let x = 0; x < width; x += 1) { encolarBorde(x, 0); encolarBorde(x, height - 1); }
  for (let y = 0; y < height; y += 1) { encolarBorde(0, y); encolarBorde(width - 1, y); }

  while (pila.length) {
    const [x, y] = pila.pop();
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const flat = y * width + x;
    if (visitado[flat]) continue;
    visitado[flat] = 1;

    const i = idx(x, y);
    if (!esFondo(data[i], data[i + 1], data[i + 2])) continue;

    // Es fondo conectado al borde -> transparente
    data[i + 3] = 0;

    pila.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(path.join(SALIDA, archivo));

  // Contar transparencia resultante
  let transp = 0;
  for (let i = 3; i < data.length; i += channels) if (data[i] === 0) transp += 1;
  console.log(`  ${archivo}: ${transp} px transparentes de ${width * height}`);
}

async function main() {
  if (!fs.existsSync(SALIDA)) fs.mkdirSync(SALIDA, { recursive: true });
  const archivos = fs.readdirSync(ENTRADA).filter((f) => f.endsWith('.png'));
  console.log(`Procesando ${archivos.length} lentes...`);
  for (const a of archivos) await procesar(a);
  console.log(`\nListo. PNG transparentes en: ${SALIDA}`);
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
