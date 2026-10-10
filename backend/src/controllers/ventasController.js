// =====================================================================
// Controller de Ventas / TPV.
// Reglas:
//  - Crear venta (presupuesto/senada): NO mueve stock. Registra items y,
//    si hay seña, el pago inicial.
//  - Entregar: descuenta stock (transaccional), calcula comisión del
//    vendedor y actualiza cuenta corriente si quedó saldo.
//  - Anular: marca anulada (revierte stock si ya se había descontado).
// =====================================================================

const { pool, query } = require('../config/db');

// GET /api/ventas?estado=&cliente_id=&sucursal_id=
async function listar(req, res) {
  const { estado, cliente_id, sucursal_id, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (estado) { params.push(estado); cond.push(`v.estado = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); cond.push(`v.cliente_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`v.sucursal_id = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT v.*, u.nombre_completo AS cliente_nombre
       FROM ventas v
       LEFT JOIN usuarios u ON u.id = v.cliente_id
       ${where}
       ORDER BY v.created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ ventas: r.rows });
  } catch (err) {
    console.error('Error al listar ventas:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/ventas/:id  (con items y pagos)
async function obtener(req, res) {
  try {
    const v = await query('SELECT * FROM ventas WHERE id = $1', [req.params.id]);
    if (v.rowCount === 0) return res.status(404).json({ error: 'Venta no encontrada' });
    const items = await query('SELECT * FROM venta_items WHERE venta_id = $1', [req.params.id]);
    const pagos = await query('SELECT * FROM pagos WHERE venta_id = $1 ORDER BY created_at', [req.params.id]);
    return res.json({ venta: v.rows[0], items: items.rows, pagos: pagos.rows });
  } catch (err) {
    console.error('Error al obtener venta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/ventas
// Body: { sucursal_id, caja_id?, cliente_id?, vendedor_id?, estado?,
//         items:[{producto_id?, descripcion, cantidad, precio_unitario}],
//         sena?: { medio, monto } }
async function crear(req, res) {
  const b = req.body || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!b.sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  if (items.length === 0) return res.status(400).json({ error: 'La venta debe tener al menos un item' });

  // Validar cada item: descripción y cantidad/precio numéricos y no negativos
  for (const it of items) {
    const cant = Number(it.cantidad);
    const precio = Number(it.precio_unitario);
    if (!it.descripcion || String(it.descripcion).trim() === '') {
      return res.status(400).json({ error: 'Cada item debe tener descripción' });
    }
    if (!Number.isFinite(cant) || cant <= 0) {
      return res.status(400).json({ error: `Cantidad inválida en "${it.descripcion}"` });
    }
    if (!Number.isFinite(precio) || precio < 0) {
      return res.status(400).json({ error: `Precio unitario inválido en "${it.descripcion}"` });
    }
  }

  // Validar la seña si viene
  const tieneSena = b.sena && Number(b.sena.monto) > 0;
  if (tieneSena && !['efectivo', 'tarjeta', 'transferencia'].includes(b.sena.medio)) {
    return res.status(400).json({ error: 'El medio de pago de la seña no es válido' });
  }

  const estado = b.estado && ['presupuesto', 'senada'].includes(b.estado) ? b.estado : 'presupuesto';

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Si hay seña (pago real), debe existir una caja ABIERTA en la sucursal.
    let cajaId = b.caja_id || null;
    if (tieneSena) {
      const cajaR = await client.query(
        `SELECT id FROM cajas WHERE sucursal_id = $1 AND estado = 'abierta' ORDER BY abierta_at DESC LIMIT 1`,
        [b.sucursal_id]
      );
      if (cajaR.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'No hay una caja abierta en esta sucursal para registrar la seña' });
      }
      cajaId = cajaR.rows[0].id;
    }

    const total = items.reduce((acc, it) => acc + Number(it.cantidad) * Number(it.precio_unitario), 0);

    const ventaR = await client.query(
      `INSERT INTO ventas (sucursal_id, caja_id, cliente_id, vendedor_id, estado, total)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [b.sucursal_id, cajaId, b.cliente_id || null, b.vendedor_id || null, estado, total]
    );
    const venta = ventaR.rows[0];

    for (const it of items) {
      const sub = Number(it.cantidad) * Number(it.precio_unitario);
      await client.query(
        `INSERT INTO venta_items (venta_id, producto_id, descripcion, cantidad, precio_unitario, subtotal)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [venta.id, it.producto_id || null, it.descripcion, it.cantidad, it.precio_unitario, sub]
      );
    }

    // Seña opcional (NO mueve stock). Ya validamos caja abierta arriba.
    if (tieneSena) {
      await client.query(
        `INSERT INTO pagos (venta_id, caja_id, medio, monto, es_sena, usuario_id)
         VALUES ($1,$2,$3,$4,TRUE,$5)`,
        [venta.id, cajaId, b.sena.medio, Number(b.sena.monto), req.user?.id || null]
      );
      await client.query(
        `UPDATE ventas SET total_pagado = $1, estado = 'senada' WHERE id = $2`,
        [Number(b.sena.monto), venta.id]
      );
    }

    await client.query('COMMIT');
    const final = await query('SELECT * FROM ventas WHERE id = $1', [venta.id]);
    return res.status(201).json({ venta: final.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al crear venta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// POST /api/ventas/:id/pago  { medio, monto }
async function agregarPago(req, res) {
  const { medio, monto } = req.body || {};
  if (!['efectivo', 'tarjeta', 'transferencia'].includes(medio) || !(Number(monto) > 0)) {
    return res.status(400).json({ error: 'medio y monto válidos son obligatorios' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query('SELECT * FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (v.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venta no encontrada' }); }
    const venta = v.rows[0];

    // No aceptar pagos sobre ventas anuladas
    if (venta.estado === 'anulada') {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No se puede registrar un pago en una venta anulada' });
    }

    // Evitar sobrepago: el total pagado no puede superar el total de la venta
    const nuevoPagado = Number(venta.total_pagado) + Number(monto);
    if (nuevoPagado > Number(venta.total) + 0.001) {
      await client.query('ROLLBACK');
      const saldoActual = Number(venta.total) - Number(venta.total_pagado);
      return res.status(409).json({ error: `El pago supera el saldo pendiente ($${saldoActual.toFixed(2)})` });
    }

    // Debe existir una caja ABIERTA en la sucursal de la venta
    const cajaR = await client.query(
      `SELECT id FROM cajas WHERE sucursal_id = $1 AND estado = 'abierta' ORDER BY abierta_at DESC LIMIT 1`,
      [venta.sucursal_id]
    );
    if (cajaR.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'No hay una caja abierta en esta sucursal para registrar el pago' });
    }
    const cajaId = cajaR.rows[0].id;

    await client.query(
      `INSERT INTO pagos (venta_id, caja_id, medio, monto, usuario_id)
       VALUES ($1,$2,$3,$4,$5)`,
      [venta.id, cajaId, medio, Number(monto), req.user?.id || null]
    );
    // Si quedó saldada y seguía como presupuesto/senada, pasa a 'senada'
    const nuevoEstado = (venta.estado === 'presupuesto' && nuevoPagado > 0) ? 'senada' : venta.estado;
    await client.query('UPDATE ventas SET total_pagado = $1, estado = $2 WHERE id = $3',
      [nuevoPagado, nuevoEstado, venta.id]);

    await client.query('COMMIT');
    return res.json({ total_pagado: nuevoPagado, saldo: Number(venta.total) - nuevoPagado });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al agregar pago:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// POST /api/ventas/:id/entregar
// Descuenta stock, calcula comisión y actualiza cuenta corriente del saldo.
async function entregar(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query('SELECT * FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (v.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venta no encontrada' }); }
    const venta = v.rows[0];
    if (venta.estado === 'entregada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La venta ya fue entregada' }); }
    if (venta.estado === 'anulada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'La venta está anulada' }); }

    // 1) Descontar stock de cada item (si tiene producto y no se descontó antes)
    if (!venta.stock_descontado) {
      const items = await client.query('SELECT * FROM venta_items WHERE venta_id = $1', [venta.id]);
      for (const it of items.rows) {
        if (!it.producto_id) continue;
        const sel = await client.query(
          `SELECT cantidad FROM stock_sucursal WHERE producto_id=$1 AND sucursal_id=$2 FOR UPDATE`,
          [it.producto_id, venta.sucursal_id]
        );
        const actual = sel.rowCount ? sel.rows[0].cantidad : 0;
        if (actual < it.cantidad) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Stock insuficiente de "${it.descripcion}": hay ${actual}, se necesitan ${it.cantidad}` });
        }
        await client.query(
          `UPDATE stock_sucursal SET cantidad = cantidad - $1, updated_at=CURRENT_TIMESTAMP
           WHERE producto_id=$2 AND sucursal_id=$3`,
          [it.cantidad, it.producto_id, venta.sucursal_id]
        );
        await client.query(
          `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
           VALUES ($1,$2,'salida',$3,'venta entregada',$4)`,
          [it.producto_id, venta.sucursal_id, -it.cantidad, req.user?.id || null]
        );
      }
    }

    // 2) Comisión del vendedor (snapshot del % al momento de entregar)
    let comisionPct = 0;
    if (venta.vendedor_id) {
      const u = await client.query('SELECT comision_pct FROM usuarios_sistema WHERE id = $1', [venta.vendedor_id]);
      comisionPct = u.rowCount ? Number(u.rows[0].comision_pct) || 0 : 0;
    }
    // Comisión = total * (pct/100), redondeada a centavos
    const comisionMonto = Math.round(Number(venta.total) * (comisionPct / 100) * 100) / 100;

    // 3) Cuenta corriente: si quedó saldo impago y hay cliente, se registra débito
    const saldo = Number(venta.total) - Number(venta.total_pagado);
    if (saldo > 0 && venta.cliente_id) {
      await client.query(
        `INSERT INTO cuenta_corriente (cliente_id, venta_id, tipo, monto, detalle)
         VALUES ($1,$2,'debito',$3,'saldo venta entregada')`,
        [venta.cliente_id, venta.id, saldo]
      );
    }

    const r = await client.query(
      `UPDATE ventas SET estado='entregada', stock_descontado=TRUE,
         comision_pct=$1, comision_monto=$2, entregada_at=CURRENT_TIMESTAMP
       WHERE id=$3 RETURNING *`,
      [comisionPct, comisionMonto, venta.id]
    );

    await client.query('COMMIT');
    return res.json({ venta: r.rows[0], saldo_pendiente: saldo > 0 ? saldo : 0 });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al entregar venta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// POST /api/ventas/:id/anular  (revierte stock si ya se había descontado)
async function anular(req, res) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const v = await client.query('SELECT * FROM ventas WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (v.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Venta no encontrada' }); }
    const venta = v.rows[0];
    if (venta.estado === 'anulada') { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Ya está anulada' }); }

    if (venta.stock_descontado) {
      const items = await client.query('SELECT * FROM venta_items WHERE venta_id = $1', [venta.id]);
      for (const it of items.rows) {
        if (!it.producto_id) continue;
        await client.query(
          `UPDATE stock_sucursal SET cantidad = cantidad + $1, updated_at=CURRENT_TIMESTAMP
           WHERE producto_id=$2 AND sucursal_id=$3`,
          [it.cantidad, it.producto_id, venta.sucursal_id]
        );
        await client.query(
          `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
           VALUES ($1,$2,'entrada',$3,'anulacion de venta',$4)`,
          [it.producto_id, venta.sucursal_id, it.cantidad, req.user?.id || null]
        );
      }
    }
    const r = await client.query(
      `UPDATE ventas SET estado='anulada', stock_descontado=FALSE WHERE id=$1 RETURNING *`,
      [venta.id]
    );
    await client.query('COMMIT');
    return res.json({ venta: r.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al anular venta:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// GET /api/cuenta-corriente/:clienteId  (saldo y movimientos)
async function cuentaCorriente(req, res) {
  try {
    const movs = await query(
      `SELECT * FROM cuenta_corriente WHERE cliente_id = $1 ORDER BY created_at DESC`,
      [req.params.clienteId]
    );
    const saldo = movs.rows.reduce((acc, m) => acc + (m.tipo === 'debito' ? 1 : -1) * Number(m.monto), 0);
    return res.json({ saldo: Math.round(saldo * 100) / 100, movimientos: movs.rows });
  } catch (err) {
    console.error('Error al obtener cuenta corriente:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, agregarPago, entregar, anular, cuentaCorriente };
