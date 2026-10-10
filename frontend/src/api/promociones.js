// =====================================================================
// Servicios de la API para Promociones / Descuentos del comercio.
// =====================================================================

import { api } from './client';

export async function listarPromociones(soloActivas = false) {
  const { data } = await api.get('/api/promociones', {
    params: soloActivas ? { solo_activas: 1 } : {},
  });
  return data.promociones;
}
export async function crearPromocion(payload) {
  const { data } = await api.post('/api/promociones', payload);
  return data.promocion;
}
export async function cambiarEstadoPromocion(id, activa) {
  const { data } = await api.patch(`/api/promociones/${id}`, { activa });
  return data.promocion;
}
export async function eliminarPromocion(id) {
  await api.delete(`/api/promociones/${id}`);
}
