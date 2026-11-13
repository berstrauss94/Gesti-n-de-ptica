// =====================================================================
// Servicios de la API para Médicos (firman las recetas de los sobres).
// Listar: cualquier usuario. Alta / edición / baja: admin.
// =====================================================================

import { api } from './client';

export async function listarMedicos(params = {}) {
  const { data } = await api.get('/api/medicos', { params });
  return data.medicos;
}

export async function crearMedico(payload) {
  const { data } = await api.post('/api/medicos', payload);
  return data.medico;
}

export async function actualizarMedico(id, payload) {
  const { data } = await api.put(`/api/medicos/${id}`, payload);
  return data.medico;
}

// Si el médico ya figura en sobres, el backend lo desactiva en lugar de borrarlo.
export async function eliminarMedico(id) {
  const { data } = await api.delete(`/api/medicos/${id}`);
  return data; // { ok, desactivado }
}
