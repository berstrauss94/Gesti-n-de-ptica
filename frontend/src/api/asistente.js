// =====================================================================
// Servicios de la API del asistente virtual de ayuda.
// =====================================================================
import { api } from './client';

export async function obtenerOpcionesAsistente() {
  const { data } = await api.get('/api/asistente/opciones');
  return data.data; // [{ id, nombre, icono, preguntas: [{ id, pregunta }] }]
}
// cuerpo: { preguntaId } o { consultaManual }
export async function consultarAsistente(cuerpo) {
  const { data } = await api.post('/api/asistente/consultar', cuerpo);
  return data; // { fuente, respuesta, consulta_id, opcionesRelacionadas }
}
// valoracion: 1 (útil) o -1 (no útil)
export async function valorarConsulta(consultaId, valoracion) {
  const { data } = await api.post('/api/asistente/valorar', { consulta_id: consultaId, valoracion });
  return data;
}
