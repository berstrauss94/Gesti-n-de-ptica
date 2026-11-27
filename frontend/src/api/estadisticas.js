// =====================================================================
// Servicios de la API para Estadísticas (solo admin).
// =====================================================================
import { api } from './client';

// { periodo, resumen, rotabilidad, flujo, proveedores }
export async function estadisticasStock({ sucursalId, meses } = {}) {
  const params = {};
  if (sucursalId) params.sucursal_id = sucursalId;
  if (meses) params.meses = meses;
  const { data } = await api.get('/api/estadisticas/stock', { params });
  return data;
}
