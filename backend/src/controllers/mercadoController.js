// =====================================================================
// Controller del Catálogo de Mercado (enriquecido con IA).
// Dispara el agente que busca specs de un modelo y las guarda, y lista
// lo ya enriquecido. Alta/enriquecido: solo admin (definido en la ruta).
// =====================================================================

const { query } = require('../config/db');
const { rastrearYEnriquecerModelo } = require('../services/mercadoGeminiService');
const { generoCanonico } = require('./productosController');

// Largo máximo de marca/modelo (coincide con VARCHAR(120) de la tabla).
const MAX_TEXTO = 120;
// Umbral de similitud (pg_trgm) para el listado tolerante a errores de tipeo.
const UMBRAL_SIMILITUD = 0.35;

// Escapa % y _ para que no actúen como comodines en ILIKE.
function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

// POST /api/mercado/enriquecer  { marca?, modelo?, forzar? }
// Alcanza con enviar la marca, el modelo o ambos (completos o parciales).
async function enriquecer(req, res) {
  const { marca, modelo, forzar } = req.body || {};
  const textoValido = (v) => v === undefined || v === null || (typeof v === 'string' && v.length <= MAX_TEXTO);
  if (!textoValido(marca) || !textoValido(modelo)) {
    return res.status(400).json({
      error: 'Marca y modelo deben ser texto de hasta 120 caracteres',
      motivo: 'datos_invalidos',
    });
  }
  const r = await rastrearYEnriquecerModelo({ marca, modelo, forzar: forzar === true });
  if (!r.ok) {
    // 409 cuando es un tema de cuota/credenciales (no es error de nuestro server)
    const status = ['sin_credenciales', 'error_api'].includes(r.motivo) ? 409 : 400;
    return res.status(status).json({ error: 'No se pudo enriquecer el modelo', motivo: r.motivo, detalle: r.detalle });
  }
  // 200 si salió de la caché (sin gastar cuota de IA); 201 si se creó/actualizó.
  return res.status(r.cache ? 200 : 201).json({
    registro: r.registro,
    cache: Boolean(r.cache),
    coincidencia: r.coincidencia || null, // exacto | parcial | similar | ia
  });
}

// GET /api/mercado?q=
// Busca por texto parcial en marca o modelo (ILIKE). Si no hay resultados y
// el término tiene 3+ letras, reintenta por similitud (pg_trgm) para tolerar
// errores de tipeo ("Rayban" -> "Ray-Ban").
async function listar(req, res) {
  const { q, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const termino = typeof q === 'string' ? q.trim() : '';
  try {
    if (!termino) {
      const todo = await query(
        'SELECT * FROM mercado_catalogo ORDER BY actualizado_at DESC LIMIT $1',
        [lim]
      );
      return res.json({ catalogo: todo.rows });
    }

    const r = await query(
      `SELECT * FROM mercado_catalogo
        WHERE marca ILIKE $1 OR modelo ILIKE $1
        ORDER BY actualizado_at DESC LIMIT $2`,
      [`%${escaparLike(termino)}%`, lim]
    );
    if (r.rows.length > 0 || termino.length < 3) {
      return res.json({ catalogo: r.rows });
    }

    try {
      const sim = await query(
        `SELECT *, GREATEST(similarity(marca, $1), similarity(modelo, $1)) AS sim
           FROM mercado_catalogo
          WHERE similarity(marca, $1) >= $2 OR similarity(modelo, $1) >= $2
          ORDER BY sim DESC, actualizado_at DESC LIMIT $3`,
        [termino, UMBRAL_SIMILITUD, lim]
      );
      return res.json({ catalogo: sim.rows });
    } catch (err) {
      // pg_trgm no disponible: se devuelve vacío en lugar de romper.
      console.warn('Búsqueda por similitud omitida (pg_trgm):', err.message);
      return res.json({ catalogo: [] });
    }
  } catch (err) {
    console.error('Error al listar catálogo de mercado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}


// GET /mercado/predict-attributes?marca=  (sin IA, sin costo)
// Sugiere genero/material segun lo mas frecuente en productos de esa marca
// y, si no hay datos, en el catalogo de mercado.
async function masFrecuente(tabla, col, marca) {
  const { rows } = await query(
    `SELECT ${col} AS valor FROM ${tabla}
      WHERE LOWER(marca) = LOWER($1) AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col} ORDER BY COUNT(*) DESC, ${col} ASC LIMIT 1`,
    [marca]
  );
  return rows[0] ? rows[0].valor : null;
}

function capitalizar(t) {
  const x = String(t || '').trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : null;
}

async function predecirAtributos(req, res) {
  try {
    const marca = String(req.query.marca || '').trim();
    if (marca.length > 120) return res.status(400).json({ error: 'Marca demasiado larga' });
    if (marca.length < 2) return res.json({ predictions: null, fuente: [] });

    const fuente = [];
    let genero = await masFrecuente('productos', 'genero', marca);
    let material = await masFrecuente('productos', 'material', marca);
    if (genero || material) fuente.push('productos');

    if (!genero || !material) {
      const gM = !genero ? await masFrecuente('mercado_catalogo', 'genero', marca).catch(() => null) : null;
      const mM = !material ? await masFrecuente('mercado_catalogo', 'material', marca).catch(() => null) : null;
      if (gM || mM) fuente.push('mercado');
      genero = genero || gM;
      material = material || mM;
    }
    genero = genero ? generoCanonico(genero) || null : null;
    material = capitalizar(material);
    if (!genero && !material) return res.json({ predictions: null, fuente: [] });
    res.json({ predictions: { genero, material }, fuente });
  } catch (err) {
    console.error('[mercado] predecirAtributos:', err.message);
    res.status(500).json({ error: 'No se pudo sugerir atributos' });
  }
}

module.exports = { enriquecer, listar, predecirAtributos };
