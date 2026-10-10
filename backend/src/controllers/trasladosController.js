// =====================================================================
// Controller de Traslados de stock entre sucursales (transaccional).
// Resta del origen y suma al destino, registrando el traslado y dos
// movimientos de stock (salida en origen, entrada en destino).
// =====================================================================

const { pool, query } = require('../config/db');

// GET /api/traslados?producto_id=&sucursal_id=
async function listar(req, res) {
  const { producto_id, sucursal_id, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (producto_id) { params.push(producto_id); cond.push(`t.producto_id = $${params.length}`); }
  if (sucursal_id) {
    params.push(sucursal_id);
    cond.push(`(t.origen_id = $${params.length} OR t.destino_id = $${params.length})`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT t.*, p.nombre AS producto_nombre,
              o.nombre AS origen_nombre, d.nombre AS destino_nombre
       FROM traslados_stock t
       JOIN productos p ON p.id = t.producto_id
       JOIN sucursales o ON o.id = t.origen_id
       JOIN sucursales d ON d.id = t.destino_id
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ traslados: r.rows });
  } catch (err) {
    console.error('Error al listar traslados:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/traslados
// Body: { producto_id, origen_id, destino_id, cantidad, motivo? }
async function crear(req, res) {
  const b = req.body || {};
  const cant = Number(b.cantidad);
  if (!b.producto_id || !b.origen_id || !b.destino_id) {
    return res.status(400).json({ error: 'producto_id, origen_id y destino_id son obligatorios' });
  }
  if (b.origen_id === b.destino_id) {
    return res.status(400).json({ error: 'El origen y el destino deben ser distintos' });
  }
  if (!Number.isFinite(cant) || cant <= 0) {
    return res.status(400).json({ error: 'La cantidad debe ser mayor a 0' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verificar y bloquear el stock de origen
    const sel = await client.query(
      `SELECT cantidad FROM stock_sucursal WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
      [b.producto_id, b.origen_id]
    );
    const enOrigen = sel.rowCount ? sel.rows[0].cantidad : 0;
    if (enOrigen < cant) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente en el origen: hay ${enOrigen}, se piden ${cant}` });
    }

    // Restar del origen
    await client.query(
      `UPDATE stock_sucursal SET cantidad = cantidad - $1, updated_at = CURRENT_TIMESTAMP
       WHERE producto_id = $2 AND sucursal_id = $3`,
      [cant, b.producto_id, b.origen_id]
    );

    // Sumar al destino (crear fila si no existe)
    const selDest = await client.query(
      `SELECT 1 FROM stock_sucursal WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
      [b.producto_id, b.destino_id]
    );
    if (selDest.rowCount === 0) {
      await client.query(
        `INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad) VALUES ($1, $2, $3)`,
        [b.producto_id, b.destino_id, cant]
      );
    } else {
      await client.query(
        `UPDATE stock_sucursal SET cantidad = cantidad + $1, updated_at = CURRENT_TIMESTAMP
         WHERE producto_id = $2 AND sucursal_id = $3`,
        [cant, b.producto_id, b.destino_id]
      );
    }

    // Registrar el traslado
    const tr = await client.query(
      `INSERT INTO traslados_stock (producto_id, origen_id, destino_id, cantidad, motivo, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.producto_id, b.origen_id, b.destino_id, cant, b.motivo || null, req.user?.id || null]
    );

    // Dos movimientos de stock para trazabilidad
    await client.query(
      `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
       VALUES ($1,$2,'salida',$3,'traslado a otra sucursal',$4)`,
      [b.producto_id, b.origen_id, -cant, req.user?.id || null]
    );
    await client.query(
      `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
       VALUES ($1,$2,'entrada',$3,'traslado desde otra sucursal',$4)`,
      [b.producto_id, b.destino_id, cant, req.user?.id || null]
    );

    await client.query('COMMIT');
    return res.status(201).json({ traslado: tr.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear traslado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

module.exports = { listar, crear };
