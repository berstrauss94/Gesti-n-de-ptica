// =====================================================================
// Servicios de la API para el Dashboard (KPIs de inicio).
// =====================================================================

import { api } from './client';

export async function resumenDashboard(sucursal_id) {
  const { data } = await api.get('/api/dashboard/resumen', {
    params: sucursal_id ? { sucursal_id } : {},
  });
  return data;
}
