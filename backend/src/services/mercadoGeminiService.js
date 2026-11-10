// =====================================================================
// Agente "Mercado": enriquece el catálogo con IA.
// Dado marca + modelo de un anteojo, le pide a Gemini (con búsqueda web)
// las especificaciones técnicas y las guarda en la tabla mercado_catalogo.
//
// Usa fetch nativo (como el resto del backend) y resuelve la API key desde
// la config (variable de entorno o config_notificaciones), igual que el
// Try-On con IA. Mientras el plan de Gemini sea gratuito, Google puede
// responder 429 (cuota) — el servicio devuelve el error claro, sin romper.
// =====================================================================

const { query } = require('../config/db');
const { GEMINI_API_KEY } = require('../config/env');

// Modelo de texto con búsqueda (distinto del de imágenes del Try-On).
const MODELO_TEXTO = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';

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

function construirPrompt(marca, modelo) {
  return `Actúa como un experto en óptica y catálogo de gafas. Busca y recopila las especificaciones técnicas completas y medidas del siguiente modelo de anteojos o lentes de contacto:
Marca: "${marca}"
Modelo: "${modelo}"

Responde EXCLUSIVAMENTE con un JSON válido estructurado con el siguiente formato exacto sin markdown:
{
  "marca": "${marca}",
  "modelo": "${modelo}",
  "tipo": "armazon_recetado",
  "estilo": "aviador",
  "genero": "unisex",
  "material": "acetato",
  "calibre_ancho": 52,
  "puente": 18,
  "patilla": 140,
  "altura_cristal": 42,
  "colores": ["Negro mate", "Carey habana"],
  "tratamientos": ["polarizado", "uv400", "blue_light"],
  "aptitud_graduacion": true,
  "descripcion_corta": "Descripción detallada del modelo"
}`;
}

// Llama al modelo, parsea el JSON y hace upsert en mercado_catalogo.
// Caché: si el modelo ya está guardado (sin distinguir mayúsculas), se
// devuelve tal cual y NO se consulta a Gemini. Con `forzar: true` se omite
// la caché para refrescar los datos.
// Devuelve { ok, registro, cache } o { ok:false, motivo, detalle }.
async function buscarEnCache(marca, modelo) {
  try {
    const r = await query(
      `SELECT * FROM mercado_catalogo
        WHERE LOWER(marca) = LOWER($1) AND LOWER(modelo) = LOWER($2)
        LIMIT 1`,
      [marca, modelo]
    );
    return r.rows[0] || null;
  } catch (err) {
    console.error('Error al consultar la caché de mercado:', err.message);
    return null; // si falla la caché, se sigue con la IA
  }
}

async function rastrearYEnriquecerModelo({ marca, modelo, forzar = false }) {
  marca = typeof marca === 'string' ? marca.trim() : marca;
  modelo = typeof modelo === 'string' ? modelo.trim() : modelo;
  if (!marca || !modelo) return { ok: false, motivo: 'faltan_datos', detalle: 'marca y modelo son obligatorios' };

  const enCache = await buscarEnCache(marca, modelo);
  if (enCache && !forzar) return { ok: true, registro: enCache, cache: true };

  const key = await obtenerApiKey();
  if (!key) {
    // Sin credenciales pero con dato previo: se sirve el guardado.
    if (enCache) return { ok: true, registro: enCache, cache: true };
    return { ok: false, motivo: 'sin_credenciales', detalle: 'Falta la API key de Google' };
  }
  // Clave del registro: la ya guardada (si existe) o lo que escribió el usuario.
  // Nunca la que devuelve la IA, para que la caché no se duplique por capitalización.
  const claveMarca = enCache ? enCache.marca : marca;
  const claveModelo = enCache ? enCache.modelo : modelo;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_TEXTO}:generateContent?key=${key}`;
  const body = {
    contents: [{ parts: [{ text: construirPrompt(marca, modelo) }] }],
    tools: [{ googleSearch: {} }],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, motivo: 'error_api', detalle: `${res.status}: ${t.slice(0, 300)}` };
    }
    const data = await res.json();
    const texto = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) return { ok: false, motivo: 'sin_respuesta', detalle: 'La IA no devolvió texto' };

    // Limpia posibles fences de markdown y parsea el JSON
    const limpio = texto.replace(/```json/gi, '').replace(/```/g, '').trim();
    let d;
    try {
      d = JSON.parse(limpio);
    } catch {
      return { ok: false, motivo: 'json_invalido', detalle: 'La IA no devolvió un JSON válido' };
    }

    const upsert = `
      INSERT INTO mercado_catalogo
        (marca, modelo, tipo, estilo, genero, material, calibre_ancho, puente, patilla,
         altura_cristal, colores, tratamientos, aptitud_graduacion, metadata, actualizado_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, NOW())
      ON CONFLICT (marca, modelo) DO UPDATE SET
        tipo = EXCLUDED.tipo, estilo = EXCLUDED.estilo, genero = EXCLUDED.genero,
        material = EXCLUDED.material, calibre_ancho = EXCLUDED.calibre_ancho,
        puente = EXCLUDED.puente, patilla = EXCLUDED.patilla,
        altura_cristal = EXCLUDED.altura_cristal, colores = EXCLUDED.colores,
        tratamientos = EXCLUDED.tratamientos, aptitud_graduacion = EXCLUDED.aptitud_graduacion,
        metadata = EXCLUDED.metadata, actualizado_at = NOW()
      RETURNING *;
    `;
    const valores = [
      claveMarca, claveModelo, d.tipo || null, d.estilo || null, d.genero || null,
      d.material || null, d.calibre_ancho || null, d.puente || null, d.patilla || null,
      d.altura_cristal || null, JSON.stringify(d.colores || []), JSON.stringify(d.tratamientos || []),
      d.aptitud_graduacion ?? true, JSON.stringify({ descripcion: d.descripcion_corta || '' }),
    ];
    const r = await query(upsert, valores);
    return { ok: true, registro: r.rows[0], cache: false };
  } catch (err) {
    console.error('Error en agente Mercado Gemini:', err.message);
    return { ok: false, motivo: 'excepcion', detalle: err.message };
  }
}

module.exports = { rastrearYEnriquecerModelo };
