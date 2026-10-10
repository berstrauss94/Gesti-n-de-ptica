// =====================================================================
// Servicios de la API para el Módulo Fiscal (AFIP/ARCA).
// =====================================================================

import { api } from './client';

export async function estadoFiscal() {
  const { data } = await api.get('/api/fiscal/estado');
  return data; // { modo, credenciales, punto_venta, cuit }
}

// Config fiscal (solo admin). No devuelve el certificado ni la clave en claro.
export async function obtenerConfigFiscal() {
  const { data } = await api.get('/api/fiscal/config');
  return data; // { cuit, punto_venta, produccion, certificado_cargado, clave_cargada, por_entorno }
}
export async function guardarConfigFiscal(payload) {
  const { data } = await api.put('/api/fiscal/config', payload);
  return data;
}

export async function emitirComprobante(payload) {
  const { data } = await api.post('/api/fiscal/emitir', payload);
  return data; // { comprobante, afip }
}

export async function listarComprobantes(venta_id) {
  const { data } = await api.get('/api/fiscal/comprobantes', { params: venta_id ? { venta_id } : {} });
  return data.comprobantes;
}
