// =====================================================================
// Servicios de la API para Obras Sociales / Convenios.
// =====================================================================

import { api } from './client';

export async function listarObrasSociales(soloActivas = false) {
  const { data } = await api.get('/api/obras-sociales', {
    params: soloActivas ? { solo_activas: 1 } : {},
  });
  return data.obras_sociales;
}
export async function crearObraSocial(payload) {
  const { data } = await api.post('/api/obras-sociales', payload);
  return data.obra_social;
}
export async function actualizarObraSocial(id, payload) {
  const { data } = await api.put(`/api/obras-sociales/${id}`, payload);
  return data.obra_social;
}
export async function eliminarObraSocial(id) {
  await api.delete(`/api/obras-sociales/${id}`);
}
