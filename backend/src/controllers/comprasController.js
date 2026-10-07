// =====================================================================
// Controller de Compras a proveedores.
// Al CONFIRMAR una compra (transaccional):
//   - Actualiza costo_base del producto con el costo de la compra.
//   - Si recalcular_precios: recalcula precio_venta = costo * (1 + margen/100).
//   - Suma el stock a la sucursal + registra movimiento de entrada.
// =====================================================================

const { pool, query } = require('../config/db');

// GET /api/compras?sucursal_id=&estado=
async function listar(req, res) {
  const { sucursal_id, estado, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (sucursal_id) { params.push(sucursal_id); cond.push(`c.sucursal_id = $${params.length}`); }
  if (estado) { params.push(estado); cond.push(`c.estado = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT c.*, p.nombre AS proveedor_nombre
       FROM compras c LEFT JOIN proveedores p ON p.id = c.proveedor_id
       ${where} ORDER BY c.created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ compras: r.rows });
  } catch (err) {
    console.error('Error al listar compras:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/compras/:id
async function obtener(req, res) {
  try {
    const c = await query('SELECT * FROM compras WHERE id = $1', [req.params.id]);
    if (c.rowCount === 0) return res.status(404).json({ error: 'Compra no encontrada' });
    const items = await query(
      `SELECT ci.*, p.nombre AS producto_nombre
       FROM compra_items ci JOIN productos p ON p.id = ci.producto_id
       WHERE ci.compra_id = $1`,
      [req.params.id]
    );
    return res.json({ compra: c.rows[0], items: items.rows });
  } catch (err) {
    console.error('Error al obtener compra:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/compras
// Body: { proveedor_id?, sucursal_id, nro_factura?, recalcular_precios?,
//         items:[{producto_id, cantidad, costo_unitario}] }
async function crear(req, res) {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!b.sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  if (items.length === 0) return res.status(400).json({ error: 'La compra debe tener al menos un item' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const total = items.reduce((a, it) => a + Number(it.cantidad) * Number(it.costo_unitario), 0);

    const cr = await client.query(
      `INSERT INTO compras (proveedor_id, sucursal_id, nro_factura, recalcular_precios, total, usuario_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.proveedor_id || null, b.sucursal_id, b.nro_factura || null,
       b.recalcular_precios !== false, total, req.user?.id || null]
    );
    const compra = cr.rows[0];

    for (const it of items) {
      const sub = Number(it.cantidad) * Number(it.costo_unitario);
      await client.query(
        `INSERT INTO compra_items (compra_id, producto_id, cantidad, costo_unitario, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [compra.id, it.producto_id, it.cantidad, it.costo_unitario, sub]
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({ compra });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear compra:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// POST /api/compras/:id/confirmar
// Aplica la compra: costo, recálculo de precio y entrada de stock.
async function confirmar(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cr = await client.query('SELECT * FROM compras WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (cr.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Compra no encontrada' }); }
    const compra = cr.rows[0];
    if (compra.estado === 'confirmada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La compra ya está confirmada' }); }
    if (compra.estado === 'anulada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La compra está anulada' }); }

    const items = await client.query('SELECT * FROM compra_items WHERE compra_id = $1', [compra.id]);

    for (const it of items.rows) {
      // 1) Actualizar costo del producto; recalcular PVP si corresponde
      if (compra.recalcular_precios) {
        await client.query(
          `UPDATE productos
           SET costo_base = $1,
               precio_venta = ROUND($1 * (1 + margen_pct/100.0), 2)
           WHERE id = $2`,
          [it.costo_unitario, it.producto_id]
        );
      } else {
        await client.query('UPDATE productos SET costo_base = $1 WHERE id = $2',
          [it.costo_unitario, it.producto_id]);
      }

      // 2) Sumar stock a la sucursal (crear fila si no existe)
      const sel = await client.query(
        'SELECT 1 FROM stock_sucursal WHERE producto_id=$1 AND sucursal_id=$2 FOR UPDATE',
        [it.producto_id, compra.sucursal_id]
      );
      if (sel.rowCount === 0) {
        await client.query(
          'INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad) VALUES ($1,$2,$3)',
          [it.producto_id, compra.sucursal_id, it.cantidad]
        );
      } else {
        await client.query(
          `UPDATE stock_sucursal SET cantidad = cantidad + $1, updated_at=CURRENT_TIMESTAMP
           WHERE producto_id=$2 AND sucursal_id=$3`,
          [it.cantidad, it.producto_id, compra.sucursal_id]
        );
      }

      // 3) Movimiento de entrada (trazabilidad)
      await client.query(
        `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
         VALUES ($1,$2,'entrada',$3,'compra proveedor',$4)`,
        [it.producto_id, compra.sucursal_id, it.cantidad, req.user?.id || null]
      );
    }

    const r = await client.query(
      `UPDATE compras SET estado='confirmada', confirmada_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *`,
      [compra.id]
    );
    await client.query('COMMIT');
    return res.json({ compra: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al confirmar compra:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

module.exports = { listar, obtener, crear, confirmar };
