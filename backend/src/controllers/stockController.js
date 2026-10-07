// =====================================================================
// Controller de Stock por sucursal + movimientos (trazabilidad).
// Los movimientos se registran de forma transaccional junto con el
// ajuste de la cantidad, para que nunca queden inconsistentes.
// =====================================================================

const { pool, query } = require('../config/db');

// GET /api/stock?sucursal_id=&q=&categoria=  (existencias por sucursal)
async function listar(req, res) {
  const { sucursal_id, q, categoria, limit = 200, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 200, 500);
  const off = parseInt(offset, 10) || 0;
  const cond = [];
  const params = [];

  if (sucursal_id) { params.push(sucursal_id); cond.push(`ss.sucursal_id = $${params.length}`); }
  if (q) {
    params.push(`%${q}%`);
    const p = `$${params.length}`;
    cond.push(`(p.nombre ILIKE ${p} OR p.codigo ILIKE ${p} OR p.codigo_barras ILIKE ${p})`);
  }
  if (categoria) { params.push(categoria); cond.push(`p.categoria = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim, off);

  try {
    const r = await query(
      `SELECT ss.id, ss.producto_id, ss.sucursal_id, ss.cantidad, ss.stock_minimo,
              ss.ubicacion, ss.updated_at,
              p.codigo, p.codigo_barras, p.nombre, p.categoria, p.marca,
              p.precio_venta, p.costo_base,
              s.nombre AS sucursal_nombre,
              (ss.cantidad <= ss.stock_minimo) AS bajo_minimo
       FROM stock_sucursal ss
       JOIN productos p ON p.id = ss.producto_id
       JOIN sucursales s ON s.id = ss.sucursal_id
       ${where}
       ORDER BY p.nombre ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ stock: r.rows, limit: lim, offset: off });
  } catch (err) {
    console.error('Error al listar stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/stock/movimiento
// Body: { producto_id, sucursal_id, tipo: 'entrada'|'salida'|'ajuste', cantidad, motivo }
//  - entrada: suma cantidad   - salida: resta   - ajuste: fija la cantidad al valor dado
async function registrarMovimiento(req, res) {
  const { producto_id, sucursal_id, tipo, cantidad, motivo } = req.body || {};
  const cant = Number(cantidad);

  if (!producto_id || !sucursal_id || !tipo || !Number.isFinite(cant)) {
    return res.status(400).json({ error: 'producto_id, sucursal_id, tipo y cantidad son obligatorios' });
  }
  if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
    return res.status(400).json({ error: "tipo debe ser 'entrada', 'salida' o 'ajuste'" });
  }
  if (cant < 0) {
    return res.status(400).json({ error: 'cantidad no puede ser negativa' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fila de stock (crear si no existe para ese producto+sucursal)
    const sel = await client.query(
      `SELECT cantidad FROM stock_sucursal WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
      [producto_id, sucursal_id]
    );
    let actual = 0;
    if (sel.rowCount === 0) {
      await client.query(
        `INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad) VALUES ($1, $2, 0)`,
        [producto_id, sucursal_id]
      );
    } else {
      actual = sel.rows[0].cantidad;
    }

    // Nueva cantidad según el tipo
    let nueva;
    if (tipo === 'entrada') nueva = actual + cant;
    else if (tipo === 'salida') nueva = actual - cant;
    else nueva = cant; // ajuste: fija el valor

    if (nueva < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente: hay ${actual}, intentás sacar ${cant}` });
    }

    await client.query(
      `UPDATE stock_sucursal SET cantidad = $1, updated_at = CURRENT_TIMESTAMP
       WHERE producto_id = $2 AND sucursal_id = $3`,
      [nueva, producto_id, sucursal_id]
    );

    // Registrar el movimiento (cantidad con signo informativo)
    const signo = tipo === 'salida' ? -cant : (tipo === 'entrada' ? cant : nueva - actual);
    await client.query(
      `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [producto_id, sucursal_id, tipo, signo, motivo || null, req.user?.id || null]
    );

    await client.query('COMMIT');
    return res.status(201).json({ producto_id, sucursal_id, cantidad: nueva });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en movimiento de stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// GET /api/stock/movimientos?producto_id=&sucursal_id=
async function listarMovimientos(req, res) {
  const { producto_id, sucursal_id, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (producto_id) { params.push(producto_id); cond.push(`m.producto_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`m.sucursal_id = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT m.id, m.tipo, m.cantidad, m.motivo, m.created_at,
              p.nombre AS producto, s.nombre AS sucursal
       FROM movimientos_stock m
       JOIN productos p ON p.id = m.producto_id
       JOIN sucursales s ON s.id = m.sucursal_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ movimientos: r.rows });
  } catch (err) {
    console.error('Error al listar movimientos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, registrarMovimiento, listarMovimientos };
