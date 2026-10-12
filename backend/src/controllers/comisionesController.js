// =====================================================================
// Controller de Comisiones.
// Reporta el acumulado de comisiones por vendedor en un período, a partir
// de las ventas ENTREGADAS (que es cuando se calcula la comisión).
// =====================================================================

const { query } = require('../config/db');

// GET /api/comisiones?desde=&hasta=&sucursal_id=&vendedor_id=
async function listar(req, res) {
  const { desde, hasta, sucursal_id, vendedor_id } = req.query;
  const cond = [`v.estado = 'entregada'`];
  const params = [];
  if (desde) { params.push(desde); cond.push(`v.entregada_at::date >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`v.entregada_at::date <= $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`v.sucursal_id = $${params.length}`); }
  if (vendedor_id) { params.push(vendedor_id); cond.push(`v.vendedor_id = $${params.length}`); }
  const where = `WHERE ${cond.join(' AND ')}`;

  try {
    // Detalle por venta
    const detalle = await query(
      `SELECT v.id, v.numero, v.total, v.comision_pct, v.comision_monto, v.entregada_at,
              us.usuario AS vendedor
       FROM ventas v
       LEFT JOIN usuarios_sistema us ON us.id = v.vendedor_id
       ${where}
       ORDER BY v.entregada_at DESC`,
      params
    );
    // Resumen por vendedor
    const resumen = await query(
      `SELECT us.usuario AS vendedor,
              COUNT(*)::int AS cantidad,
              COALESCE(SUM(v.total), 0) AS total_vendido,
              COALESCE(SUM(v.comision_monto), 0) AS total_comision
       FROM ventas v
       LEFT JOIN usuarios_sistema us ON us.id = v.vendedor_id
       ${where}
       GROUP BY us.usuario
       ORDER BY total_comision DESC`,
      params
    );
    const totalComision = resumen.rows.reduce((a, r) => a + Number(r.total_comision), 0);
    return res.json({
      resumen: resumen.rows,
      detalle: detalle.rows,
      total_comision: Math.round(totalComision * 100) / 100,
    });
  } catch (err) {
    console.error('Error al listar comisiones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar };
