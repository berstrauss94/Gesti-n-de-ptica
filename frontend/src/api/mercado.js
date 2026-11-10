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
// El backend usa caché: si el modelo ya existe NO consulta a la IA (cache=true),
// salvo que se pida refrescar con `forzar`.
// Devuelve { registro, cache }.
export async function enriquecerMercado(marca, modelo, forzar = false) {
  const { data } = await api.post('/api/mercado/enriquecer', { marca, modelo, forzar });
  return { registro: data.registro, cache: Boolean(data.cache) };
}
