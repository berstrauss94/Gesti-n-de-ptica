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
