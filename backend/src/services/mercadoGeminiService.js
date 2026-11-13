// =====================================================================
// Agente "Mercado": enriquece el catálogo con IA.
// Dado marca y/o modelo de un anteojo (completos o parciales), primero busca
// en la base (caché) y, si no hay coincidencia, le pide a Gemini (con búsqueda
// web) las especificaciones técnicas y las guarda en mercado_catalogo.
//
// Búsqueda local, en este orden (antes de gastar cuota de IA):
//   1) Exacta (sin distinguir mayúsculas) cuando vienen marca y modelo.
//   2) Parcial por ILIKE ("Ray-" o "Hexa" encuentran "Ray-Ban" / "I-shape Hexagonal").
//   3) Por similitud (pg_trgm), solo cuando se escribe UN solo campo, para
//      tolerar errores de tipeo ("Rayban" -> "Ray-Ban"). Si la extensión no
//      está disponible, este paso se omite sin romper nada.
// Si nada coincide, se le pasa el texto parcial a Gemini para que resuelva la
// marca/modelo oficial más probable (o devuelva "no_identificado").
//
// Usa fetch nativo (como el resto del backend) y resuelve la API key desde
// la config (variable de entorno o config_notificaciones), igual que el
// Try-On con IA. Mientras el plan de Gemini sea gratuito, Google puede
// responder 429 (cuota) — el servicio devuelve el error claro, sin romper.
// =====================================================================

const { query } = require('../config/db');
const { GEMINI_API_KEY, GEMINI_TEXT_MODEL, GEMINI_TEXT_FALLBACKS } = require('../config/env');

// Cadena de modelos de texto con búsqueda (distinta del modelo de imágenes del
// Try-On): el principal (GEMINI_TEXT_MODEL) y luego los de respaldo
// (GEMINI_TEXT_FALLBACKS). Ambos se configuran en env.js / Railway.
const MODELOS_TEXTO = [...new Set([GEMINI_TEXT_MODEL, ...(GEMINI_TEXT_FALLBACKS || [])].filter(Boolean))];

// Último modelo que respondió bien: se prueba primero en la próxima consulta,
// así no se gastan llamadas en modelos que ya dieron 404.
let modeloPreferido = null;

// Llama a Gemini probando la cadena de modelos. Escala al siguiente SOLO ante
// 404 (modelo retirado/no disponible) o 429 (sin cuota). Cualquier otro error
// (clave inválida 400/403, error del servidor) corta: cambiar de modelo no lo arregla.
// Devuelve { ok, data, modelo } o { ok:false, motivo, detalle, intentos }.
async function llamarGemini(key, body) {
  const orden = modeloPreferido
    ? [modeloPreferido, ...MODELOS_TEXTO.filter((m) => m !== modeloPreferido)]
    : MODELOS_TEXTO;
  const intentos = [];
  for (const modelo of orden) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      modeloPreferido = modelo;
      return { ok: true, data: await res.json(), modelo };
    }
    const texto = await res.text();
    intentos.push(`${modelo}: ${res.status}`);
    if (res.status === 404 || res.status === 429) {
      console.warn(`Gemini ${res.status} con "${modelo}"; pruebo el siguiente modelo.`);
      if (modeloPreferido === modelo) modeloPreferido = null;
      continue;
    }
    return { ok: false, motivo: 'error_api', detalle: `${res.status} (${modelo}): ${texto.slice(0, 300)}`, intentos };
  }
  const todos429 = intentos.every((i) => i.endsWith(': 429'));
  console.error(`Gemini: se agotaron los modelos (${intentos.join(', ')}).`);
  return {
    ok: false,
    motivo: 'error_api',
    detalle: todos429
      ? `Sin cuota en todos los modelos (${intentos.join(', ')}). Revisá el plan de Google AI Studio.`
      : `Ningún modelo disponible (${intentos.join(', ')}). Actualizá GEMINI_TEXT_MODEL / GEMINI_TEXT_FALLBACKS.`,
    intentos,
  };
}

// Largo mínimo de un término de búsqueda y umbral de similitud (pg_trgm).
const MIN_TERMINO = 2;
const UMBRAL_SIMILITUD = 0.35;

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

// Escapa % y _ para que el usuario no pueda usarlos como comodines en ILIKE.
function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

function limpiar(valor) {
  return typeof valor === 'string' ? valor.trim() : '';
}

// Búsqueda exacta (sin distinguir mayúsculas) por marca + modelo.
async function buscarExacto(marca, modelo) {
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

// Busca en la base con marca y/o modelo, completos o parciales.
// Devuelve { registro, coincidencia } o null.
async function buscarLocal(marca, modelo) {
  try {
    // 1) Exacta (solo si vienen los dos campos)
    if (marca && modelo) {
      const exacto = await buscarExacto(marca, modelo);
      if (exacto) return { registro: exacto, coincidencia: 'exacto' };
    }

    // 2) Parcial por ILIKE: cada campo presente debe estar contenido.
    const cond = [];
    const params = [];
    if (marca) { params.push(`%${escaparLike(marca)}%`); cond.push(`marca ILIKE $${params.length}`); }
    if (modelo) { params.push(`%${escaparLike(modelo)}%`); cond.push(`modelo ILIKE $${params.length}`); }
    const parcial = await query(
      `SELECT * FROM mercado_catalogo WHERE ${cond.join(' AND ')}
        ORDER BY actualizado_at DESC LIMIT 1`,
      params
    );
    if (parcial.rows[0]) return { registro: parcial.rows[0], coincidencia: 'parcial' };

    // 3) Similitud (pg_trgm) solo con UN campo: tolera errores de tipeo.
    //    Con los dos campos no se usa para no confundir modelos parecidos
    //    (p. ej. RB3025 vs RB3026).
    if ((marca && !modelo) || (!marca && modelo)) {
      const col = marca ? 'marca' : 'modelo';
      const termino = marca || modelo;
      try {
        const sim = await query(
          `SELECT *, similarity(${col}, $1) AS sim FROM mercado_catalogo
            WHERE similarity(${col}, $1) >= $2
            ORDER BY sim DESC, actualizado_at DESC LIMIT 1`,
          [termino, UMBRAL_SIMILITUD]
        );
        if (sim.rows[0]) return { registro: sim.rows[0], coincidencia: 'similar' };
      } catch (err) {
        // pg_trgm no disponible: se omite este paso.
        console.warn('Búsqueda por similitud omitida (pg_trgm):', err.message);
      }
    }
    return null;
  } catch (err) {
    console.error('Error al buscar en el catálogo de mercado:', err.message);
    return null; // si falla la búsqueda local, se sigue con la IA
  }
}

function construirPrompt(marca, modelo) {
  return `Actúa como un experto en óptica y catálogo de gafas. El usuario buscó un modelo de anteojos o lentes de contacto con datos que pueden ser parciales, incompletos o tener errores de tipeo:
Marca: "${marca || '(no indicada)'}"
Modelo: "${modelo || '(no indicado)'}"

Identifica la marca y el modelo oficiales MÁS PROBABLES (por ejemplo, "Ay-" apunta a la marca "Ray-Ban"). No inventes modelos: si no puedes identificar con confianza un modelo real, responde EXCLUSIVAMENTE {"error":"no_identificado"}.

Si lo identificas, busca y recopila sus especificaciones técnicas completas y medidas. Responde EXCLUSIVAMENTE con un JSON válido con el siguiente formato exacto, sin markdown (marca y modelo van con su nombre oficial):
{
  "marca": "Marca oficial",
  "modelo": "Modelo oficial",
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

// Punto de entrada. Acepta marca y/o modelo (al menos uno, de 2+ caracteres).
// Con `forzar: true` se omite la caché para refrescar los datos con la IA.
// Devuelve { ok, registro, cache, coincidencia } o { ok:false, motivo, detalle }.
async function rastrearYEnriquecerModelo({ marca, modelo, forzar = false }) {
  marca = limpiar(marca);
  modelo = limpiar(modelo);
  if (marca.length < MIN_TERMINO && modelo.length < MIN_TERMINO) {
    return {
      ok: false,
      motivo: 'faltan_datos',
      detalle: `Indicá la marca, el modelo o ambos (mínimo ${MIN_TERMINO} caracteres).`,
    };
  }
  // Un campo de 1 solo carácter no aporta: se ignora.
  if (marca.length < MIN_TERMINO) marca = '';
  if (modelo.length < MIN_TERMINO) modelo = '';

  const local = await buscarLocal(marca, modelo);
  if (local && !forzar) {
    return { ok: true, registro: local.registro, cache: true, coincidencia: local.coincidencia };
  }
  const enCache = local ? local.registro : null;

  const key = await obtenerApiKey();
  if (!key) {
    // Sin credenciales pero con dato previo: se sirve el guardado.
    if (enCache) return { ok: true, registro: enCache, cache: true, coincidencia: local.coincidencia };
    return { ok: false, motivo: 'sin_credenciales', detalle: 'Falta la API key de Google' };
  }

  const body = {
    contents: [{ parts: [{ text: construirPrompt(marca, modelo) }] }],
    tools: [{ googleSearch: {} }],
  };

  try {
    // Recorre la cadena de modelos ANTES de tocar la base: si todos fallan,
    // no se escribe nada.
    const rIA = await llamarGemini(key, body);
    if (!rIA.ok) {
      // Sin IA disponible pero con dato previo (forzar): se sirve lo guardado.
      if (enCache) return { ok: true, registro: enCache, cache: true, coincidencia: local.coincidencia };
      return { ok: false, motivo: rIA.motivo, detalle: rIA.detalle };
    }
    const { data } = rIA;
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

    // La IA no pudo identificar un modelo real con esos datos parciales.
    const marcaIA = limpiar(d.marca).slice(0, 120);
    const modeloIA = limpiar(d.modelo).slice(0, 120);
    if (d.error === 'no_identificado' || !marcaIA || !modeloIA) {
      return {
        ok: false,
        motivo: 'no_identificado',
        detalle: 'No pude identificar un modelo con esos datos. Probá con más letras de la marca o el modelo.',
      };
    }

    // Clave del registro:
    //  - si ya había uno guardado (forzar), se conserva su clave;
    //  - si el usuario escribió los dos campos, se respeta lo escrito;
    //  - si dejó uno vacío o parcial, se usa el nombre oficial que resolvió la IA,
    //    reutilizando la capitalización guardada si ya existía ese modelo.
    let claveMarca;
    let claveModelo;
    if (enCache) {
      claveMarca = enCache.marca;
      claveModelo = enCache.modelo;
    } else if (marca && modelo) {
      claveMarca = marca;
      claveModelo = modelo;
    } else {
      const previo = await buscarExacto(marcaIA, modeloIA);
      if (previo && !forzar) {
        return { ok: true, registro: previo, cache: true, coincidencia: 'ia' };
      }
      claveMarca = previo ? previo.marca : marcaIA;
      claveModelo = previo ? previo.modelo : modeloIA;
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
    return { ok: true, registro: r.rows[0], cache: false, coincidencia: 'ia' };
  } catch (err) {
    console.error('Error en agente Mercado Gemini:', err.message);
    return { ok: false, motivo: 'excepcion', detalle: err.message };
  }
}

module.exports = { rastrearYEnriquecerModelo };
