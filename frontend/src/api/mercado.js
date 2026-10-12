// =====================================================================
// Servicios de la API para el Catálogo de Mercado (enriquecido con IA).
// "En el mercado" = modelos que NO están en el local pero se pueden
// consultar/pedir al proveedor.
// =====================================================================

import { api } from './client';

export async function listarMercado(q) {
  const { data } = await api.get('/api/mercado', { params: q ? { q } : {} });
  return data.catalogo;
}

// Dispara el agente: busca specs del modelo con IA y las guarda.
export async function enriquecerMercado(marca, modelo) {
  const { data } = await api.post('/api/mercado/enriquecer', { marca, modelo });
  return data.registro;
}
