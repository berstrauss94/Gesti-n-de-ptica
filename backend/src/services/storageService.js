// =====================================================================
// Almacenamiento de imágenes nuevas del Try-On en Cloudinary.
// Las fotos históricas (fotosController) siguen en disco local.
// Sin credenciales el servicio queda deshabilitado (no rompe el arranque).
// =====================================================================
const { v2: cloudinary } = require('cloudinary');
const env = require('../config/env');

function habilitado() {
  return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
}

let configurado = false;
function configurar() {
  if (configurado) return;
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configurado = true;
}

// Sube un Buffer y lo guarda como WebP. Devuelve { url, public_id }.
function uploadTryOnImage(fileBuffer) {
  return new Promise((resolve, reject) => {
    if (!habilitado()) return reject(Object.assign(new Error('Cloudinary sin credenciales'), { codigo: 'sin_credenciales' }));
    configurar();
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'optix_tryon', format: 'webp', transformation: [{ quality: 'auto' }] },
      (err, result) => {
        if (err) return reject(err);
        resolve({ url: result.secure_url, public_id: result.public_id });
      }
    );
    stream.end(fileBuffer);
  });
}

module.exports = { habilitado, uploadTryOnImage };
