// =====================================================================
// Servicios de la API para Sobres / Órdenes de trabajo óptica.
// =====================================================================

import { api } from './client';

export async function listarSobres(params = {}) {
  const { data } = await api.get('/api/sobres', { params });
  return data.sobres;
}
export async function obtenerSobre(id) {
  const { data } = await api.get(`/api/sobres/${id}`);
  return data.sobre;
}
export async function crearSobre(payload) {
  const { data } = await api.post('/api/sobres', payload);
  return data.sobre;
}
export async function actualizarSobre(id, payload) {
  const { data } = await api.put(`/api/sobres/${id}`, payload);
  return data.sobre;
}
export async function cambiarEstadoSobre(id, estado) {
  const { data } = await api.patch(`/api/sobres/${id}/estado`, { estado });
  return data.sobre;
}
export async function eliminarSobre(id) {
  await api.delete(`/api/sobres/${id}`);
}

// --- Comisiones (reporte, admin) ---
export async function listarComisiones(params = {}) {
  const { data } = await api.get('/api/comisiones', { params });
  return data; // { resumen, detalle, total_comision }
}
