// =====================================================================
// Servicios de la API para subir imágenes nuevas del Try-On a Cloudinary.
// =====================================================================
import { api } from './client';

// Sube un Blob (JPEG/PNG/WEBP, hasta 5 MB) y devuelve { url, public_id }.
// No se fija Content-Type a mano: axios agrega el boundary del multipart.
export async function subirImagenTryOn(blob) {
  const formData = new FormData();
  formData.append('imagen', blob, 'tryon.webp');
  const { data } = await api.post('/api/uploads/tryon', formData);
  return data;
}
