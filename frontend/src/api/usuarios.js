// =====================================================================
// Servicios de la API para Clientes/Usuarios y sus fotos.
// =====================================================================

import { api } from './client';

// --- Clientes ---
export async function listarUsuarios({ q = '', limit = 50, offset = 0 } = {}) {
  const { data } = await api.get('/api/usuarios', { params: { q, limit, offset } });
  return data; // { usuarios, limit, offset }
}

export async function obtenerUsuario(id) {
  const { data } = await api.get(`/api/usuarios/${id}`);
  return data.usuario;
}

export async function crearUsuario(payload) {
  const { data } = await api.post('/api/usuarios', payload);
  return data.usuario;
}

export async function actualizarUsuario(id, payload) {
  const { data } = await api.put(`/api/usuarios/${id}`, payload);
  return data.usuario;
}

export async function eliminarUsuario(id) {
  await api.delete(`/api/usuarios/${id}`);
}

// --- Fotos de seguimiento ---
export async function listarFotos(usuarioId) {
  const { data } = await api.get(`/api/usuarios/${usuarioId}/fotos`);
  return data.fotos;
}

// archivos: FileList o array de File (hasta 3)
// Modo simple (completar fotos faltantes): sin ángulos, el backend ocupa
// los órdenes libres.
export async function subirFotos(usuarioId, archivos) {
  const form = new FormData();
  Array.from(archivos).forEach((file) => form.append('fotos', file));
  const { data } = await api.post(`/api/usuarios/${usuarioId}/fotos`, form);
  return data.fotos;
}

// Subida con ángulo explícito por foto.
// items: [{ file, angulo }] donde angulo ∈ 'frontal' | '45deg' | 'perfil'.
// Los campos "fotos" y "angulos" van en paralelo (mismo índice).
export async function subirFotosConAngulo(usuarioId, items) {
  const form = new FormData();
  items.forEach(({ file, angulo }) => {
    form.append('fotos', file);
    form.append('angulos', angulo);
  });
  const { data } = await api.post(`/api/usuarios/${usuarioId}/fotos`, form);
  return data.fotos;
}

export async function eliminarFoto(usuarioId, fotoId) {
  await api.delete(`/api/usuarios/${usuarioId}/fotos/${fotoId}`);
}
