// =====================================================================
// Servicios de la API para el Módulo de Notificaciones.
// =====================================================================

import { api } from './client';

export async function obtenerConfigNotif() {
  const { data } = await api.get('/api/notificaciones/config');
  return data;
}
export async function guardarConfigNotif(payload) {
  const { data } = await api.put('/api/notificaciones/config', payload);
  return data;
}
export async function listarNotificaciones() {
  const { data } = await api.get('/api/notificaciones');
  return data.notificaciones;
}
export async function enviarPrueba(payload) {
  const { data } = await api.post('/api/notificaciones/prueba', payload);
  return data; // { estado }
}

// ---- Recordatorios automáticos de turnos / controles ----
export async function listarRecordatorios(params = {}) {
  const { data } = await api.get('/api/notificaciones/recordatorios', { params });
  return data.recordatorios;
}
// payload: { nombre, telefono, fecha_evento, anticipaciones[], dias_personalizados[], mensaje?, canal?, turno_id?, cliente_id?, sucursal_id? }
export async function crearRecordatorios(payload) {
  const { data } = await api.post('/api/notificaciones/recordatorios', payload);
  return data; // { creados, duplicados, omitidos, telefono, fecha_evento }
}
export async function cancelarRecordatorio(id) {
  const { data } = await api.patch('/api/notificaciones/recordatorios/' + id + '/cancelar');
  return data;
}
export async function procesarRecordatorios() {
  const { data } = await api.post('/api/notificaciones/recordatorios/procesar');
  return data;
}
