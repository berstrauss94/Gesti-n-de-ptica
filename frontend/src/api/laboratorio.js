// =====================================================================
// Servicios de la API del catálogo de lentes y servicios de laboratorio.
// =====================================================================
import { api } from './client';

export async function listarCatalogoLab(params = {}) {
  const { data } = await api.get('/api/laboratorio/catalogo', { params });
  return data.data;
}
export async function contarCategoriasLab() {
  const { data } = await api.get('/api/laboratorio/categorias');
  return data.categorias;
}
export async function validarRecetaLab(payload) {
  const { data } = await api.post('/api/laboratorio/validar-receta', payload);
  return data; // { valid, cristal, dias_demora, alertas }
}
// payload: { porcentaje, categoria?, marca_proveedor?, todo?, simular? }
export async function ajustarPreciosLab(payload) {
  const { data } = await api.put('/api/laboratorio/actualizacion-masiva', payload);
  return data;
}
export async function importarCatalogoLab(filas) {
  const { data } = await api.post('/api/laboratorio/importar', { filas });
  return data; // { creados, actualizados, errores }
}
