// =====================================================================
// Servicios de la API para el Módulo de Stock.
// =====================================================================

import { api } from './client';

// --- Sucursales ---
export async function listarSucursales() {
  const { data } = await api.get('/api/sucursales');
  return data.sucursales;
}
export async function crearSucursal(payload) {
  const { data } = await api.post('/api/sucursales', payload);
  return data.sucursal;
}

// --- Productos ---
export async function listarProductos(params = {}) {
  const { data } = await api.get('/api/productos', { params });
  return data; // { productos, limit, offset }
}
export async function obtenerProducto(id) {
  const { data } = await api.get(`/api/productos/${id}`);
  return data.producto;
}
export async function crearProducto(payload) {
  const { data } = await api.post('/api/productos', payload);
  return data.producto;
}
export async function actualizarProducto(id, payload) {
  const { data } = await api.put(`/api/productos/${id}`, payload);
  return data.producto;
}
export async function eliminarProducto(id) {
  await api.delete(`/api/productos/${id}`);
}
export async function recalcularPrecios(payload) {
  const { data } = await api.post('/api/productos/recalcular-precios', payload);
  return data; // { actualizados }
}

// --- Stock por sucursal ---
export async function listarStock(params = {}) {
  const { data } = await api.get('/api/stock', { params });
  return data; // { stock }
}
export async function registrarMovimiento(payload) {
  const { data } = await api.post('/api/stock/movimiento', payload);
  return data;
}
export async function listarMovimientos(params = {}) {
  const { data } = await api.get('/api/stock/movimientos', { params });
  return data.movimientos;
}
