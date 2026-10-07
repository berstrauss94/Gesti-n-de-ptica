// =====================================================================
// Controller de Cajas: apertura, caja abierta actual, y cierre con arqueo.
// =====================================================================

const { pool, query } = require('../config/db');

// GET /api/cajas/actual?sucursal_id=   -> caja abierta de esa sucursal (o null)
async function actual(req, res) {
  const { sucursal_id } = req.query;
  if (!sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  try {
    const r = await query(
      `SELECT * FROM cajas WHERE sucursal_id = $1 AND estado = 'abierta'
       ORDER BY abierta_at DESC LIMIT 1`,
      [sucursal_id]
    );
    return res.json({ caja: r.rows[0] || null });
  } catch (err) {
    console.error('Error al obtener caja actual:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/cajas/abrir  { sucursal_id, monto_inicial }
async function abrir(req, res) {
  const { sucursal_id, monto_inicial } = req.body || {};
  if (!sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  try {
    // No permitir dos cajas abiertas en la misma sucursal
    const abierta = await query(
      `SELECT id FROM cajas WHERE sucursal_id = $1 AND estado = 'abierta'`,
      [sucursal_id]
    );
    if (abierta.rowCount > 0) {
      return res.status(409).json({ error: 'Ya hay una caja abierta en esta sucursal' });
    }
    const r = await query(
      `INSERT INTO cajas (sucursal_id, usuario_apertura, monto_inicial)
       VALUES ($1, $2, $3) RETURNING *`,
      [sucursal_id, req.user?.id || null, Number(monto_inicial) || 0]
    );
    return res.status(201).json({ caja: r.rows[0] });
  } catch (err) {
    console.error('Error al abrir caja:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/cajas/:id/cerrar  { monto_declarado }
// Calcula totales por medio de pago desde los pagos de la caja y el arqueo.
async function cerrar(req, res) {
  const { id } = req.params;
  const montoDeclarado = req.body?.monto_declarado;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cajaR = await client.query(`SELECT * FROM cajas WHERE id = $1 FOR UPDATE`, [id]);
    if (cajaR.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Caja no encontrada' });
    }
    if (cajaR.rows[0].estado === 'cerrada') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'La caja ya está cerrada' });
    }

    // Totales por medio de pago de todos los pagos de esta caja
    const tot = await client.query(
      `SELECT medio, COALESCE(SUM(monto),0) AS total
       FROM pagos WHERE caja_id = $1 GROUP BY medio`,
      [id]
    );
    const porMedio = { efectivo: 0, tarjeta: 0, transferencia: 0 };
    tot.rows.forEach((row) => { porMedio[row.medio] = Number(row.total); });

    // Esperado en efectivo = monto inicial + efectivo cobrado
    const esperadoEfectivo = Number(cajaR.rows[0].monto_inicial) + porMedio.efectivo;
    const declarado = montoDeclarado != null ? Number(montoDeclarado) : null;
    const diferencia = declarado != null ? Math.round((declarado - esperadoEfectivo) * 100) / 100 : null;

    const r = await client.query(
      `UPDATE cajas SET estado='cerrada', usuario_cierre=$1,
         total_efectivo=$2, total_tarjeta=$3, total_transferencia=$4,
         monto_declarado=$5, diferencia=$6, cerrada_at=CURRENT_TIMESTAMP
       WHERE id=$7 RETURNING *`,
      [req.user?.id || null, porMedio.efectivo, porMedio.tarjeta, porMedio.transferencia,
       declarado, diferencia, id]
    );
    await client.query('COMMIT');
    return res.json({ caja: r.rows[0], esperado_efectivo: esperadoEfectivo });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al cerrar caja:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

module.exports = { actual, abrir, cerrar };
