// =====================================================================
// Controller Fiscal: emisión de comprobantes (factura A/B/C o interno).
// Usa afipService: real si hay credenciales, simulación si no.
// =====================================================================

const { query } = require('../config/db');
const { AFIP_CUIT, AFIP_PUNTO_VENTA } = require('../config/env');
const afip = require('../services/afipService');

// GET /api/fiscal/estado  -> en qué modo está el módulo
async function estado(req, res) {
  return res.json(afip.estadoServicio());
}

// POST /api/fiscal/emitir
// Body: { venta_id, tipo: 'A'|'B'|'C'|'INTERNO', cuit_receptor? }
async function emitir(req, res) {
  const { venta_id, tipo, cuit_receptor } = req.body || {};
  if (!tipo || !['A', 'B', 'C', 'INTERNO'].includes(tipo)) {
    return res.status(400).json({ error: "tipo debe ser 'A', 'B', 'C' o 'INTERNO'" });
  }

  try {
    // Tomar importes de la venta (si se asocia a una)
    let total = Number(req.body?.importe_total) || 0;
    if (venta_id) {
      const v = await query('SELECT total FROM ventas WHERE id = $1', [venta_id]);
      if (v.rowCount === 0) return res.status(404).json({ error: 'Venta no encontrada' });
      total = Number(v.rows[0].total);
    }
    // IVA 21% desglosado (neto + iva = total)
    const neto = Math.round((total / 1.21) * 100) / 100;
    const iva = Math.round((total - neto) * 100) / 100;

    const resultado = await afip.autorizar({
      tipo, importe_total: total, importe_neto: neto, importe_iva: iva, cuit_receptor,
    });

    // Persistir el comprobante (quede autorizado, simulado o rechazado)
    const r = await query(
      `INSERT INTO comprobantes_fiscales
         (venta_id, tipo, cuit_emisor, cuit_receptor, punto_venta, numero,
          importe_total, importe_neto, importe_iva, cae, cae_vencimiento,
          estado, modo, observaciones)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        venta_id || null, tipo, AFIP_CUIT || null, cuit_receptor || null,
        resultado.punto_venta || AFIP_PUNTO_VENTA, resultado.numero || null,
        total, neto, iva, resultado.cae || null, resultado.cae_vencimiento || null,
        resultado.estado, resultado.modo === 'simulacion' ? 'simulacion' : 'produccion',
        resultado.observaciones || null,
      ]
    );

    // El comprobante se emite siempre (aunque sea interno/simulado): no bloquea el TPV.
    return res.status(201).json({ comprobante: r.rows[0], afip: resultado });
  } catch (err) {
    console.error('Error al emitir comprobante:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/fiscal/comprobantes?venta_id=
async function listar(req, res) {
  const { venta_id, limit = 100 } = req.query;
  const params = [];
  let where = '';
  if (venta_id) { params.push(venta_id); where = 'WHERE venta_id = $1'; }
  params.push(Math.min(parseInt(limit, 10) || 100, 500));
  try {
    const r = await query(
      `SELECT * FROM comprobantes_fiscales ${where}
       ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ comprobantes: r.rows });
  } catch (err) {
    console.error('Error al listar comprobantes:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { estado, emitir, listar };
