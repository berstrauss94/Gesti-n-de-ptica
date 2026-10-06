// =====================================================================
// Servicios de la API para el catálogo de Marcos.
// =====================================================================

import { api } from './client';

export async function listarMarcos({ q = '', estilo_forma = '', activo, limit = 50, offset = 0 } = {}) {
  const params = { q, limit, offset };
  if (estilo_forma) params.estilo_forma = estilo_forma;
  if (activo !== undefined) params.activo = activo;
  const { data } = await api.get('/api/marcos', { params });
  return data; // { marcos, limit, offset }
}

export async function obtenerMarco(id) {
  const { data } = await api.get(`/api/marcos/${id}`);
  return data.marco;
}

// datos: { codigo, nombre_modelo, marca, material, color, estilo_forma, ancho_mm, ... }
// imagenes: { frontal: File, '45'?: File, perfil?: File }
export async function crearMarco(datos, imagenes = {}) {
  const form = new FormData();
  Object.entries(datos).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, v);
  });
  if (imagenes.frontal) form.append('imagen_frontal', imagenes.frontal);
  if (imagenes['45']) form.append('imagen_45', imagenes['45']);
  if (imagenes.perfil) form.append('imagen_perfil', imagenes.perfil);
  const { data } = await api.post('/api/marcos', form);
  return data.marco;
}

export async function actualizarMarco(id, datos, imagenes = {}) {
  const form = new FormData();
  Object.entries(datos).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, v);
  });
  if (imagenes.frontal) form.append('imagen_frontal', imagenes.frontal);
  if (imagenes['45']) form.append('imagen_45', imagenes['45']);
  if (imagenes.perfil) form.append('imagen_perfil', imagenes.perfil);
  const { data } = await api.put(`/api/marcos/${id}`, form);
  return data.marco;
}

export async function eliminarMarco(id) {
  await api.delete(`/api/marcos/${id}`);
}
