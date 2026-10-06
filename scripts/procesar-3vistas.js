// =====================================================================
// Procesa una imagen con 3 vistas de un anteojo (frontal | 45 | perfil)
// en fila, sobre fondo de ajedrez "quemado". Produce 3 PNG transparentes:
//   <salida>/frontal.png, 45.png, perfil.png
//
// Pasos: 1) recorta en 3 columnas iguales  2) quita el fondo ajedrez
//        (flood-fill desde bordes)  3) recorta el sobrante transparente.
//
// Uso:
//   node scripts/procesar-3vistas.js "<png-origen>" "<carpeta-salida>"
// =====================================================================

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));

const origen = process.argv[2];
const salida = process.argv[3] || path.join(__dirname, '..', 'marco-3vistas');
if (!origen) {
  console.error('Falta la ruta del PNG de origen.');
  process.exit(1);
}

const NOMBRES = ['frontal', '45', 'perfil'];

function esFondo(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max - min;
  const brillo = (r + g + b) / 3;
  return brillo > 150 && sat < 35;
}

function quitarFondo(bufferRaw, info) {
  const { width, height, channels } = info;
  const data = bufferRaw;
  const total = width * height;
  const visitado = new Uint8Array(total);
  const enCola = new Uint8Array(total);
  // Pila de índices planos (enteros). enCola evita duplicados -> cota = total.
  const pila = new Int32Array(total + 4);
  let top = 0;
  const push = (flat) => {
    if (!visitado[flat] && !enCola[flat]) { enCola[flat] = 1; pila[top] = flat; top += 1; }
  };

  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }

  while (top > 0) {
    top -= 1;
    const flat = pila[top];
    enCola[flat] = 0;
    if (visitado[flat]) continue;
    visitado[flat] = 1;
    const i = flat * channels;
    if (!esFondo(data[i], data[i + 1], data[i + 2])) continue;
    data[i + 3] = 0;
    const x = flat % width;
    const y = (flat - x) / width;
    if (x + 1 < width) push(flat + 1);
    if (x - 1 >= 0) push(flat - 1);
    if (y + 1 < height) push(flat + width);
    if (y - 1 >= 0) push(flat - width);
  }
  return data;
}

async function main() {
  if (!fs.existsSync(salida)) fs.mkdirSync(salida, { recursive: true });
  const meta = await sharp(origen).metadata();
  const colW = Math.floor(meta.width / 3);
  console.log(`Imagen ${meta.width}x${meta.height}. Columna ${colW}x${meta.height}.`);

  for (let c = 0; c < 3; c += 1) {
    const left = c * colW;
    // 1) recortar columna, reducir a ancho manejable, asegurar alpha + raw
    const { data, info } = await sharp(origen)
      .extract({ left, top: 0, width: colW, height: meta.height })
      .resize({ width: 600 }) // suficiente para un anteojo; acelera el flood-fill
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2) quitar fondo
    const limpio = quitarFondo(data, info);

    // 3) re-encode + trim (recorta sobrante transparente)
    const destino = path.join(salida, `${NOMBRES[c]}.png`);
    await sharp(limpio, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .png()
      .trim({ threshold: 10 })
      .toFile(destino);

    console.log(`  -> ${destino}`);
  }
  console.log('\nListo. 3 vistas transparentes generadas.');
}

main().catch((e) => { console.error('Error:', e.message); process.exit(1); });
