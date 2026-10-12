// =====================================================================
// Controller del Catálogo de Mercado (enriquecido con IA).
// Dispara el agente que busca specs de un modelo y las guarda, y lista
// lo ya enriquecido. Alta/enriquecido: solo admin (definido en la ruta).
// =====================================================================

const { query } = require('../config/db');
const { rastrearYEnriquecerModelo } = require('../services/mercadoGeminiService');

// POST /api/mercado/enriquecer  { marca, modelo }
async function enriquecer(req, res) {
  const { marca, modelo } = req.body || {};
  const r = await rastrearYEnriquecerModelo({ marca, modelo });
  if (!r.ok) {
    // 409 cuando es un tema de cuota/credenciales (no es error de nuestro server)
    const status = ['sin_credenciales', 'error_api'].includes(r.motivo) ? 409 : 400;
    return res.status(status).json({ error: 'No se pudo enriquecer el modelo', motivo: r.motivo, detalle: r.detalle });
  }
  return res.status(201).json({ registro: r.registro });
}

// GET /api/mercado?q=
async function listar(req, res) {
  const { q, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const params = [];
  let where = '';
  if (q) {
    params.push(`%${q}%`);
    where = `WHERE marca ILIKE $1 OR modelo ILIKE $1`;
  }
  params.push(lim);
  try {
    const r = await query(
      `SELECT * FROM mercado_catalogo ${where}
       ORDER BY actualizado_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ catalogo: r.rows });
  } catch (err) {
    console.error('Error al listar catálogo de mercado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { enriquecer, listar };
