// =====================================================================
// Recorta una lámina PNG con 6 lentes (grilla 3 filas x 2 columnas) en
// 6 PNG individuales, conservando la transparencia. Luego recorta el
// sobrante transparente de cada uno (trim) para dejar el lente ajustado.
//
// Uso:
//   node scripts/recortar-lentes.js "<ruta-png-origen>" "<carpeta-salida>"
//
// Salida: lente-1.png ... lente-6.png (orden: izq->der, arriba->abajo).
// =====================================================================

const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));

const origen = process.argv[2];
const salida = process.argv[3] || path.join(__dirname, '..', 'lentes-recortados');

if (!origen) {
  console.error('Falta la ruta del PNG de origen.');
  process.exit(1);
}

const FILAS = 3;
const COLS = 2;

async function main() {
  if (!fs.existsSync(salida)) fs.mkdirSync(salida, { recursive: true });

  const meta = await sharp(origen).metadata();
  const celdaW = Math.floor(meta.width / COLS);
  const celdaH = Math.floor(meta.height / FILAS);

  console.log(`Imagen ${meta.width}x${meta.height}. Celda ${celdaW}x${celdaH}.`);

  let n = 0;
  for (let fila = 0; fila < FILAS; fila += 1) {
    for (let col = 0; col < COLS; col += 1) {
      n += 1;
      const left = col * celdaW;
      const top = fila * celdaH;
      const destino = path.join(salida, `lente-${n}.png`);

      await sharp(origen)
        .extract({ left, top, width: celdaW, height: celdaH })
        // trim: recorta el borde transparente dejando el lente ajustado.
        // threshold tolera pequeñas sombras semitransparentes.
        .trim({ threshold: 10 })
        .png()
        .toFile(destino);

      console.log(`  -> ${destino}`);
    }
  }

  console.log(`\nListo. ${n} lentes recortados en: ${salida}`);
}

main().catch((err) => {
  console.error('Error al recortar:', err.message);
  process.exit(1);
});
