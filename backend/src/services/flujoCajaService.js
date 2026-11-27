// =====================================================================
// Serie mensual de ventas, cobros y compras (hora de Argentina).
// Un mes por fila, incluidos los meses sin movimiento (en 0), del más viejo al actual.
//   - ventas / unidades / operaciones: ventas 'entregadas', por fecha de entrega.
//   - cobrado_ventas: pagos del TPV por fecha de cobro (sin los de ventas anuladas:
//     el sistema no registra la devolución, se asume que se devolvió).
//   - cobrado_sobres: pagos cargados en los sobres, por su fecha. Se suman aparte
//     porque hoy NO pasan por la caja del TPV.
//   - compras: compras a proveedores 'confirmadas', por fecha de confirmación.
//   - flujo_neto = cobrado (ventas + sobres) - compras.
// armarFlujo es pura y se prueba en backend/test/estadisticasStock.test.js.
// =====================================================================

const ZONA = 'America/Argentina/Buenos_Aires';
const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v)) || 0;
const r2 = (v) => Math.round(v * 100) / 100;

// $1 = sucursal (uuid o null), $2 = cantidad de meses (incluye el actual).
const SQL_SERIE = `
WITH meses AS (
  SELECT to_char(g, 'YYYY-MM') AS mes
    FROM generate_series(
      date_trunc('month', now() AT TIME ZONE '${ZONA}') - make_interval(months => $2::int - 1),
      date_trunc('month', now() AT TIME ZONE '${ZONA}'),
      interval '1 month') AS g
),
desde AS (
  SELECT (date_trunc('month', now() AT TIME ZONE '${ZONA}') - make_interval(months => $2::int - 1))
         AT TIME ZONE '${ZONA}' AS inicio
),
v AS (
  SELECT to_char(v.entregada_at AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes,
         COUNT(*)::int AS operaciones, SUM(v.total) AS ventas
    FROM ventas v, desde
   WHERE v.estado = 'entregada' AND v.entregada_at >= desde.inicio
     AND ($1::uuid IS NULL OR v.sucursal_id = $1)
   GROUP BY 1
),
u AS (
  SELECT to_char(v.entregada_at AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes,
         SUM(vi.cantidad)::int AS unidades
    FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id, desde
   WHERE v.estado = 'entregada' AND v.entregada_at >= desde.inicio AND vi.producto_id IS NOT NULL
     AND ($1::uuid IS NULL OR v.sucursal_id = $1)
   GROUP BY 1
),
cv AS (
  SELECT to_char(p.created_at AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes, SUM(p.monto) AS cobrado
    FROM pagos p JOIN ventas v ON v.id = p.venta_id, desde
   WHERE v.estado <> 'anulada' AND p.created_at >= desde.inicio
     AND ($1::uuid IS NULL OR v.sucursal_id = $1)
   GROUP BY 1
),
cs AS (
  SELECT to_char(sp.fecha AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes, SUM(sp.importe) AS cobrado
    FROM sobre_pagos sp JOIN sobres s ON s.id = sp.sobre_id, desde
   WHERE s.estado <> 'anulado' AND sp.fecha >= desde.inicio
     AND ($1::uuid IS NULL OR s.sucursal_id = $1)
   GROUP BY 1
),
co AS (
  SELECT to_char(c.confirmada_at AT TIME ZONE '${ZONA}', 'YYYY-MM') AS mes,
         COUNT(*)::int AS cantidad, SUM(c.total) AS compras
    FROM compras c, desde
   WHERE c.estado = 'confirmada' AND c.confirmada_at >= desde.inicio
     AND ($1::uuid IS NULL OR c.sucursal_id = $1)
   GROUP BY 1
)
SELECT m.mes,
       COALESCE(v.operaciones, 0) AS operaciones, COALESCE(v.ventas, 0) AS ventas,
       COALESCE(u.unidades, 0) AS unidades,
       COALESCE(cv.cobrado, 0) AS cobrado_ventas, COALESCE(cs.cobrado, 0) AS cobrado_sobres,
       COALESCE(co.cantidad, 0) AS cantidad_compras, COALESCE(co.compras, 0) AS compras
  FROM meses m
  LEFT JOIN v ON v.mes = m.mes
  LEFT JOIN u ON u.mes = m.mes
  LEFT JOIN cv ON cv.mes = m.mes
  LEFT JOIN cs ON cs.mes = m.mes
  LEFT JOIN co ON co.mes = m.mes
 ORDER BY m.mes ASC`;

// Inicio del período (primer día del mes más viejo, hora de Argentina), para las
// consultas de rotabilidad y proveedores: así todo el tablero mira el mismo período.
const SQL_INICIO = `
SELECT (date_trunc('month', now() AT TIME ZONE '${ZONA}') - make_interval(months => $1::int - 1))
       AT TIME ZONE '${ZONA}' AS inicio`;

// Filas de SQL_SERIE -> serie mensual con flujo neto, variación y totales.
function armarFlujo(filas) {
  let anterior = null;
  const meses = (filas || []).map((f) => {
    const ventas = r2(n(f.ventas));
    const cobradoVentas = r2(n(f.cobrado_ventas));
    const cobradoSobres = r2(n(f.cobrado_sobres));
    const cobrado = r2(cobradoVentas + cobradoSobres);
    const compras = r2(n(f.compras));
    const fila = {
      mes: f.mes,
      operaciones: n(f.operaciones),
      unidades: n(f.unidades),
      ventas,
      cobrado_ventas: cobradoVentas,
      cobrado_sobres: cobradoSobres,
      cobrado,
      cantidad_compras: n(f.cantidad_compras),
      compras,
      flujo_neto: r2(cobrado - compras),
      // Variación de ventas contra el mes anterior (null si el anterior fue 0).
      variacion_ventas_pct: anterior && anterior.ventas > 0
        ? Math.round(((ventas - anterior.ventas) / anterior.ventas) * 1000) / 10 : null,
    };
    anterior = fila;
    return fila;
  });
  const suma = (c) => r2(meses.reduce((a, m) => a + m[c], 0));
  return {
    meses,
    totales: {
      operaciones: suma('operaciones'),
      unidades: suma('unidades'),
      ventas: suma('ventas'),
      cobrado: suma('cobrado'),
      compras: suma('compras'),
      flujo_neto: suma('flujo_neto'),
    },
  };
}

async function inicioPeriodo(ejecutar, meses) {
  const r = await ejecutar(SQL_INICIO, [meses]);
  return r.rows[0]?.inicio || null;
}

async function obtenerFlujoMensual(ejecutar, { sucursalId, meses }) {
  const r = await ejecutar(SQL_SERIE, [sucursalId || null, meses]);
  return armarFlujo(r.rows);
}

module.exports = { obtenerFlujoMensual, inicioPeriodo, armarFlujo, ZONA };
