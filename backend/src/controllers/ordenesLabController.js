// =====================================================================
// Controller de Órdenes de Laboratorio (trazabilidad B2B).
// Estados: enviado -> en_proceso -> recibido_sucursal -> listo_entrega -> entregado
// =====================================================================

const { query } = require('../config/db');
const { notificar } = require('../services/notificacionesService');

const ESTADOS = ['enviado', 'en_proceso', 'recibido_sucursal', 'listo_entrega', 'entregado'];

async function listar(req, res) {
  const { estado, cliente_id, sucursal_id, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (estado) { params.push(estado); cond.push(`o.estado = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); cond.push(`o.cliente_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`o.sucursal_id = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT o.*, l.nombre AS laboratorio_nombre, u.nombre_completo AS cliente_nombre
       FROM ordenes_laboratorio o
       LEFT JOIN proveedores l ON l.id = o.laboratorio_id
       LEFT JOIN usuarios u ON u.id = o.cliente_id
       ${where} ORDER BY o.created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ ordenes: r.rows });
  } catch (err) {
    console.error('Error al listar órdenes:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

async function crear(req, res) {
  const b = req.body || {};
  if (!b.sucursal_id || !b.descripcion) {
    return res.status(400).json({ error: 'sucursal_id y descripcion son obligatorios' });
  }
  try {
    const r = await query(
      `INSERT INTO ordenes_laboratorio
         (laboratorio_id, sucursal_id, cliente_id, venta_id, descripcion, fecha_estimada, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [b.laboratorio_id || null, b.sucursal_id, b.cliente_id || null, b.venta_id || null,
       b.descripcion, b.fecha_estimada || null, b.notas || null]
    );
    return res.status(201).json({ orden: r.rows[0] });
  } catch (err) {
    console.error('Error al crear orden:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/ordenes-laboratorio/:id/estado  { estado }
async function cambiarEstado(req, res) {
  const { estado } = req.body || {};
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  try {
    // Leer el estado actual para validar la transición (no permitir retrocesos
    // ni saltos arbitrarios; sí avanzar o mantenerse)
    const actualR = await query('SELECT estado FROM ordenes_laboratorio WHERE id = $1', [req.params.id]);
    if (actualR.rowCount === 0) return res.status(404).json({ error: 'Orden no encontrada' });
    const estadoActual = actualR.rows[0].estado;
    const idxActual = ESTADOS.indexOf(estadoActual);
    const idxNuevo = ESTADOS.indexOf(estado);
    if (idxNuevo < idxActual) {
      return res.status(409).json({
        error: `No se puede retroceder de "${estadoActual}" a "${estado}"`,
      });
    }

    const r = await query(
      `UPDATE ordenes_laboratorio SET estado = $1 WHERE id = $2 RETURNING *`,
      [estado, req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Orden no encontrada' });

    // Disparador: al pasar a "listo_entrega", avisar al cliente (best-effort).
    if (estado === 'listo_entrega') {
      const orden = r.rows[0];
      const mensaje = `¡Hola! Tu pedido en la óptica (orden #${orden.numero}) ya está listo para retirar.`;
      // No bloqueamos la respuesta por la notificación
      notificar({ canal: 'telegram', evento: 'orden_lista', mensaje }).catch(() => {});
    }
    return res.json({ orden: r.rows[0] });
  } catch (err) {
    console.error('Error al cambiar estado de orden:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, crear, cambiarEstado };
