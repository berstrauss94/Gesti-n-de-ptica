// =====================================================================
// Servicios de la API para el Módulo Compras / Proveedores.
// =====================================================================

import { api } from './client';

// --- Proveedores / Laboratorios ---
export async function listarProveedores(tipo) {
  const { data } = await api.get('/api/proveedores', { params: tipo ? { tipo } : {} });
  return data.proveedores;
}
export async function crearProveedor(payload) {
  const { data } = await api.post('/api/proveedores', payload);
  return data.proveedor;
}
export async function actualizarProveedor(id, payload) {
  const { data } = await api.put(`/api/proveedores/${id}`, payload);
  return data.proveedor;
}

// --- Compras ---
export async function listarCompras(params = {}) {
  const { data } = await api.get('/api/compras', { params });
  return data.compras;
}
export async function obtenerCompra(id) {
  const { data } = await api.get(`/api/compras/${id}`);
  return data; // { compra, items }
}
export async function crearCompra(payload) {
  const { data } = await api.post('/api/compras', payload);
  return data.compra;
}
export async function confirmarCompra(id) {
  const { data } = await api.post(`/api/compras/${id}/confirmar`);
  return data.compra;
}
// Descarga el archivo CITI Compras (AFIP) del período YYYY-MM como .txt
export async function descargarCITI(periodo) {
  const { data } = await api.get('/api/compras-citi', {
    params: { periodo }, responseType: 'blob',
  });
  const url = URL.createObjectURL(new Blob([data], { type: 'text/plain' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `CITI_COMPRAS_${periodo.replace('-', '')}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// --- Órdenes de laboratorio ---
export async function listarOrdenes(params = {}) {
  const { data } = await api.get('/api/ordenes-laboratorio', { params });
  return data.ordenes;
}
export async function crearOrden(payload) {
  const { data } = await api.post('/api/ordenes-laboratorio', payload);
  return data.orden;
}
export async function cambiarEstadoOrden(id, estado) {
  const { data } = await api.patch(`/api/ordenes-laboratorio/${id}/estado`, { estado });
  return data.orden;
}
