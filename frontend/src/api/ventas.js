// =====================================================================
// Servicios de la API para el Módulo TPV / Ventas + Cajas.
// =====================================================================

import { api } from './client';

// --- Cajas ---
export async function cajaActual(sucursal_id) {
  const { data } = await api.get('/api/cajas/actual', { params: { sucursal_id } });
  return data.caja;
}
export async function abrirCaja(payload) {
  const { data } = await api.post('/api/cajas/abrir', payload);
  return data.caja;
}
export async function cerrarCaja(id, monto_declarado) {
  const { data } = await api.post(`/api/cajas/${id}/cerrar`, { monto_declarado });
  return data; // { caja, esperado_efectivo }
}

// --- Ventas ---
export async function listarVentas(params = {}) {
  const { data } = await api.get('/api/ventas', { params });
  return data.ventas;
}
export async function obtenerVenta(id) {
  const { data } = await api.get(`/api/ventas/${id}`);
  return data; // { venta, items, pagos }
}
export async function crearVenta(payload) {
  const { data } = await api.post('/api/ventas', payload);
  return data.venta;
}
export async function agregarPago(id, payload) {
  const { data } = await api.post(`/api/ventas/${id}/pago`, payload);
  return data;
}
export async function entregarVenta(id) {
  const { data } = await api.post(`/api/ventas/${id}/entregar`);
  return data;
}
export async function anularVenta(id) {
  const { data } = await api.post(`/api/ventas/${id}/anular`);
  return data;
}

// --- Cuenta corriente ---
export async function cuentaCorriente(clienteId) {
  const { data } = await api.get(`/api/cuenta-corriente/${clienteId}`);
  return data; // { saldo, movimientos }
}
