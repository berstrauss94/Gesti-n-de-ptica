// =====================================================================
// Servicio de Try-On con IA generativa (composición realista).
//
// Toma la foto del cliente + la imagen del anteojo y pide a un modelo
// de generación/edición de imágenes de Google que componga una imagen
// realista con el anteojo puesto.
//
//  - Sin GEMINI_API_KEY (ni en env ni en config DB): deshabilitado.
//    Devuelve { ok:false, motivo:'sin_credenciales' } y el front sigue
//    usando la superposición 2D (gratis).
//  - Con API key: llama al modelo. *** El endpoint/forma exacta de la API
//    de edición de imágenes de Google puede cambiar; esta llamada se valida
//    contra la API real cuando se carga la credencial. ***
//
// Costo: la generación con IA tiene costo por imagen. Por eso queda OFF
// por defecto hasta que el titular cargue su API key con facturación.
// =====================================================================

const { query } = require('../config/db');
const { GEMINI_API_KEY, GEMINI_IMAGE_MODEL } = require('../config/env');

// Resuelve la API key: primero env, luego la guardada en config_notificaciones.
async function obtenerApiKey() {
  if (GEMINI_API_KEY) return GEMINI_API_KEY;
  try {
    const r = await query('SELECT gemini_api_key FROM config_notificaciones WHERE id = 1');
    return r.rows[0]?.gemini_api_key || '';
  } catch {
    return '';
  }
}

async function estado() {
  const key = await obtenerApiKey();
  return { habilitado: Boolean(key), modelo: GEMINI_IMAGE_MODEL };
}

// Genera la composición. fotoB64 / marcoB64 = imágenes en base64 (data).
// Devuelve { ok, imagen_b64 } o { ok:false, motivo }.
async function generar({ fotoB64, marcoB64, fotoMime = 'image/jpeg', marcoMime = 'image/png' }) {
  const key = await obtenerApiKey();
  if (!key) return { ok: false, motivo: 'sin_credenciales' };
  if (!fotoB64 || !marcoB64) return { ok: false, motivo: 'faltan_imagenes' };

  // --- Punto de integración real con la API de imágenes de Google ---
  // Modelo de edición/compose (ej. gemini-2.5-flash-image-preview) vía
  // generativelanguage.googleapis.com. Se envían ambas imágenes + un prompt
  // que pide colocar el anteojo sobre el rostro de forma realista, sin
  // alterar la identidad de la persona ni la forma/color del anteojo.
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${key}`;

  const prompt =
    'Colocá de forma realista los anteojos de la segunda imagen sobre el rostro ' +
    'de la primera imagen, respetando el ángulo de la cara, el tamaño y la ' +
    'perspectiva. No cambies el rostro de la persona ni la forma ni el color de ' +
    'los anteojos. Devolvé solo la imagen compuesta.';

  const body = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: fotoMime, data: fotoB64 } },
        { inline_data: { mime_type: marcoMime, data: marcoB64 } },
      ],
    }],
  };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, motivo: 'error_api', detalle: `${res.status}: ${t.slice(0, 300)}` };
    }
    const data = await res.json();
    // Buscar la parte de imagen en la respuesta
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const imgPart = parts.find((p) => p.inline_data || p.inlineData);
    const inline = imgPart?.inline_data || imgPart?.inlineData;
    if (!inline?.data) {
      return { ok: false, motivo: 'sin_imagen', detalle: 'La IA no devolvió una imagen.' };
    }
    return { ok: true, imagen_b64: inline.data, mime: inline.mime_type || 'image/png' };
  } catch (err) {
    return { ok: false, motivo: 'excepcion', detalle: err.message };
  }
}

module.exports = { estado, generar, obtenerApiKey };
