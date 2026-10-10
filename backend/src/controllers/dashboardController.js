// =====================================================================
// Controller del Dashboard: KPIs agregados para la pantalla de inicio.
// Todo se calcula en una sola llamada para pintar el tablero rápido.
// Si no se pasa sucursal_id, los KPIs son globales (todas las sucursales).
// =====================================================================

const { query } = require('../config/db');

// GET /api/dashboard/resumen?sucursal_id=
async function resumen(req, res) {
  const { sucursal_id } = req.query;
  // Filtro opcional por sucursal, aplicable a cada subconsulta
  const sucCond = sucursal_id ? ' AND sucursal_id = $1' : '';
  const params = sucursal_id ? [sucursal_id] : [];

  try {
    // Ventas de HOY (no anuladas): cantidad y monto facturado
    const ventasHoy = await query(
      `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0) AS monto
       FROM ventas
       WHERE created_at::date = CURRENT_DATE
         AND estado <> 'anulada'${sucCond}`,
      params
    );

    // Cobrado HOY por medio de pago (lo que realmente entró a caja)
    const cobradoHoy = await query(
      `SELECT COALESCE(SUM(p.monto), 0) AS total
       FROM pagos p
       ${sucursal_id ? 'JOIN ventas v ON v.id = p.venta_id' : ''}
       WHERE p.created_at::date = CURRENT_DATE${sucursal_id ? ' AND v.sucursal_id = $1' : ''}`,
      params
    );

    // Cajas abiertas en este momento
    const cajasAbiertas = await query(
      `SELECT COUNT(*)::int AS cantidad
       FROM cajas
       WHERE estado = 'abierta'${sucCond}`,
      params
    );

    // Productos bajo mínimo (stock <= stock_minimo, con mínimo definido > 0)
    const bajoMinimo = await query(
      `SELECT COUNT(*)::int AS cantidad
       FROM stock_sucursal
       WHERE stock_minimo > 0 AND cantidad <= stock_minimo${sucursal_id ? ' AND sucursal_id = $1' : ''}`,
      params
    );

    // Turnos de HOY, agrupados por estado
    const turnosHoy = await query(
      `SELECT estado, COUNT(*)::int AS cantidad
       FROM turnos
       WHERE fecha_hora::date = CURRENT_DATE${sucCond}
       GROUP BY estado`,
      params
    );
    const turnos = { pendiente: 0, asistio: 0, ausente: 0, cancelado: 0, total: 0 };
    turnosHoy.rows.forEach((r) => {
      turnos[r.estado] = r.cantidad;
      turnos.total += r.cantidad;
    });

    // Presupuestos abiertos (ventas en estado presupuesto/senada): trabajo pendiente
    const presupuestos = await query(
      `SELECT COUNT(*)::int AS cantidad, COALESCE(SUM(total - total_pagado), 0) AS saldo
       FROM ventas
       WHERE estado IN ('presupuesto','senada')${sucCond}`,
      params
    );

    return res.json({
      ventas_hoy: {
        cantidad: ventasHoy.rows[0].cantidad,
        monto: Number(ventasHoy.rows[0].monto),
      },
      cobrado_hoy: Number(cobradoHoy.rows[0].total),
      cajas_abiertas: cajasAbiertas.rows[0].cantidad,
      bajo_minimo: bajoMinimo.rows[0].cantidad,
      turnos_hoy: turnos,
      presupuestos_abiertos: {
        cantidad: presupuestos.rows[0].cantidad,
        saldo: Number(presupuestos.rows[0].saldo),
      },
    });
  } catch (err) {
    console.error('Error al armar el resumen del dashboard:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { resumen };
