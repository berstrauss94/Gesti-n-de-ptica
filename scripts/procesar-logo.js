// Recorta el logo a círculo con fondo transparente y lo guarda en assets.
const path = require('path');
const fs = require('fs');
const sharp = require(path.join(__dirname, '..', 'backend', 'node_modules', 'sharp'));

const origen = 'C:/Users/berst/OneDrive/Imágenes/Centro de Contactología 1.jpg';
const outDir = path.join(__dirname, '..', 'frontend', 'src', 'assets');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const size = 240;
const circle = Buffer.from(
  `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`
);

sharp(origen)
  .resize(size, size, { fit: 'cover' })
  .composite([{ input: circle, blend: 'dest-in' }])
  .png()
  .toFile(path.join(outDir, 'logo.png'))
  .then(() => console.log('logo.png circular creado en', outDir))
  .catch((e) => { console.error('Error:', e.message); process.exit(1); });
