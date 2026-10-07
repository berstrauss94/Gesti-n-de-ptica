// =====================================================================
// Servicios de la API para el Módulo Fiscal (AFIP/ARCA).
// =====================================================================

import { api } from './client';

export async function estadoFiscal() {
  const { data } = await api.get('/api/fiscal/estado');
  return data; // { modo, credenciales, punto_venta }
}

export async function emitirComprobante(payload) {
  const { data } = await api.post('/api/fiscal/emitir', payload);
  return data; // { comprobante, afip }
}

export async function listarComprobantes(venta_id) {
  const { data } = await api.get('/api/fiscal/comprobantes', { params: venta_id ? { venta_id } : {} });
  return data.comprobantes;
}
