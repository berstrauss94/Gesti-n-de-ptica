// =====================================================================
// Servicios de la API para Graduaciones (recetas médicas).
// =====================================================================

import { api } from './client';

export async function listarGraduaciones(usuarioId) {
  const { data } = await api.get(`/api/usuarios/${usuarioId}/graduaciones`);
  return data.graduaciones;
}

export async function crearGraduacion(usuarioId, payload) {
  const { data } = await api.post(`/api/usuarios/${usuarioId}/graduaciones`, payload);
  return data.graduacion;
}

export async function actualizarGraduacion(id, payload) {
  const { data } = await api.put(`/api/graduaciones/${id}`, payload);
  return data.graduacion;
}

export async function eliminarGraduacion(id) {
  await api.delete(`/api/graduaciones/${id}`);
}
