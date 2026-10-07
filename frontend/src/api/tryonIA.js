// =====================================================================
// Servicios de la API para el Try-On con IA.
// =====================================================================

import { api } from './client';

export async function estadoTryonIA() {
  const { data } = await api.get('/api/tryon-ia/estado');
  return data; // { habilitado, modelo }
}

// foto_ruta / marco_ruta = rutas servibles (/uploads/...) de la foto y el marco
export async function generarTryonIA(foto_ruta, marco_ruta) {
  const { data } = await api.post('/api/tryon-ia/generar', { foto_ruta, marco_ruta });
  return data; // { imagen: dataURL }
}
