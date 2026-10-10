// =====================================================================
// Servicios de la API para el Módulo Turnos / Agenda.
// =====================================================================

import { api } from './client';

export async function listarTurnos(params = {}) {
  const { data } = await api.get('/api/turnos', { params });
  return data.turnos;
}
export async function crearTurno(payload) {
  const { data } = await api.post('/api/turnos', payload);
  return data.turno;
}
export async function cambiarEstadoTurno(id, estado) {
  const { data } = await api.patch(`/api/turnos/${id}/estado`, { estado });
  return data.turno;
}
export async function eliminarTurno(id) {
  await api.delete(`/api/turnos/${id}`);
}
