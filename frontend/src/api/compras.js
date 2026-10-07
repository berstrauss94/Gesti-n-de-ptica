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

// --- Compras ---
export async function listarCompras(params = {}) {
  const { data } = await api.get('/api/compras', { params });
  return data.compras;
}
export async function crearCompra(payload) {
  const { data } = await api.post('/api/compras', payload);
  return data.compra;
}
export async function confirmarCompra(id) {
  const { data } = await api.post(`/api/compras/${id}/confirmar`);
  return data.compra;
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
