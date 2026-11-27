// =====================================================================
// Rotabilidad del stock: qué se vende, qué no se mueve y cuánto tarda en venderse.
//
// Fuentes (no hay columnas nuevas: todo sale de lo que el sistema ya registra):
//   - Venta = venta 'entregada' (recién ahí se descuenta el stock), fechada por
//     entregada_at. Presupuestos, señas y anuladas NO cuentan.
//   - Ingreso = movimiento de stock 'entrada' o 'ajuste' positivo (compras
//     confirmadas, cargas manuales). NO cuentan las vueltas por anulación de venta
//     ni los traslados entre sucursales: el producto ya estaba en la óptica.
//   - Días en stock de cada unidad vendida = fecha de entrega - último ingreso de
//     ese producto anterior a la venta (si no hay ingreso registrado, el alta del
//     producto). Es exacto con un solo lote y aproximado si hubo varias reposiciones.
//   - Costo = costo_base ACTUAL del producto (no se guarda el costo de cada venta),
//     así que la ganancia es estimada.
// Las consultas reciben `ejecutar` (query del pool) para poder probarlas.
// Las funciones armar* son puras y se prueban en backend/test/estadisticasStock.test.js.
// =====================================================================

const LIMITE_RANKING = 10;
const LIMITE_SIN_MOVIMIENTO = 50;
const MOTIVOS_NO_INGRESO = ['anulacion de venta', 'traslado desde otra sucursal'];

const n = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v)) || 0;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const nulo = (v) => v === null || v === undefined;

const SQL_ROTABILIDAD = `
WITH vendidos AS (
  SELECT vi.producto_id,
         SUM(vi.cantidad)::int AS unidades,
         SUM(vi.subtotal) AS ingresos,
         SUM(vi.cantidad * GREATEST(EXTRACT(EPOCH FROM (v.entregada_at - COALESCE(ing.fecha, p.created_at))) / 86400, 0))
           / NULLIF(SUM(vi.cantidad), 0) AS dias_promedio,
         MAX(v.entregada_at) AS ultima_venta
    FROM venta_items vi
    JOIN ventas v ON v.id = vi.venta_id
    JOIN productos p ON p.id = vi.producto_id
    LEFT JOIN LATERAL (
      SELECT MAX(m.created_at) AS fecha
        FROM movimientos_stock m
       WHERE m.producto_id = vi.producto_id
         AND m.tipo IN ('entrada', 'ajuste') AND m.cantidad > 0
         AND COALESCE(m.motivo, '') <> ALL($3::text[])
         AND m.created_at <= v.entregada_at
    ) ing ON TRUE
   WHERE v.estado = 'entregada' AND v.entregada_at >= $2
     AND ($1::uuid IS NULL OR v.sucursal_id = $1)
   GROUP BY vi.producto_id
),
historia AS (
  SELECT vi.producto_id, MAX(v.entregada_at) AS ultima_venta
    FROM venta_items vi JOIN ventas v ON v.id = vi.venta_id
   WHERE v.estado = 'entregada' AND ($1::uuid IS NULL OR v.sucursal_id = $1)
   GROUP BY vi.producto_id
),
ingresos AS (
  SELECT producto_id, MAX(created_at) AS ultimo_ingreso
    FROM movimientos_stock
   WHERE tipo IN ('entrada', 'ajuste') AND cantidad > 0
     AND COALESCE(motivo, '') <> ALL($3::text[])
     AND ($1::uuid IS NULL OR sucursal_id = $1)
   GROUP BY producto_id
),
stock AS (
  SELECT producto_id, SUM(cantidad)::int AS stock
    FROM stock_sucursal
   WHERE ($1::uuid IS NULL OR sucursal_id = $1)
   GROUP BY producto_id
)
SELECT p.id AS producto_id, p.codigo, p.nombre, p.marca, p.categoria,
       p.costo_base, p.precio_venta, p.created_at AS alta,
       COALESCE(s.stock, 0) AS stock,
       COALESCE(vd.unidades, 0) AS unidades, COALESCE(vd.ingresos, 0) AS ingresos,
       vd.dias_promedio, vd.ultima_venta,
       h.ultima_venta AS ultima_venta_historica, i.ultimo_ingreso
  FROM productos p
  LEFT JOIN vendidos vd ON vd.producto_id = p.id
  LEFT JOIN historia h ON h.producto_id = p.id
  LEFT JOIN ingresos i ON i.producto_id = p.id
  LEFT JOIN stock s ON s.producto_id = p.id
 WHERE COALESCE(vd.unidades, 0) > 0
    OR (COALESCE(s.stock, 0) > 0 AND p.activo IS NOT FALSE)`;

// Demora de proveedores: días entre que se carga la compra y se confirma su recepción.
const SQL_PROVEEDORES = `
SELECT COALESCE(pr.nombre, 'Sin proveedor') AS proveedor,
       COUNT(*)::int AS compras,
       SUM(c.total) AS total,
       AVG(EXTRACT(EPOCH FROM (c.confirmada_at - c.created_at)) / 86400) AS dias_promedio,
       MAX(EXTRACT(EPOCH FROM (c.confirmada_at - c.created_at)) / 86400) AS dias_maximo,
       MAX(c.confirmada_at) AS ultima
  FROM compras c
  LEFT JOIN proveedores pr ON pr.id = c.proveedor_id
 WHERE c.estado = 'confirmada' AND c.confirmada_at IS NOT NULL AND c.confirmada_at >= $2
   AND ($1::uuid IS NULL OR c.sucursal_id = $1)
 GROUP BY pr.nombre
 ORDER BY dias_promedio DESC NULLS LAST`;

function diasDesde(fecha, ahora) {
  if (!fecha) return null;
  const d = new Date(fecha).getTime();
  return Number.isFinite(d) ? Math.max(Math.floor((ahora - d) / 86400000), 0) : null;
}

// Filas de SQL_ROTABILIDAD -> rankings y resumen.
// diasPeriodo: largo del período en días (para la cobertura del stock).
function armarRotabilidad(filas, { diasPeriodo, ahora = Date.now(), limite = LIMITE_RANKING } = {}) {
  const prods = (filas || []).map((f) => {
    const unidades = n(f.unidades);
    const stock = n(f.stock);
    const costo = n(f.costo_base);
    const ingresos = r2(n(f.ingresos));
    const costoVendido = r2(unidades * costo);
    const porDia = diasPeriodo > 0 ? unidades / diasPeriodo : 0;
    return {
      producto_id: f.producto_id,
      codigo: f.codigo,
      nombre: f.nombre,
      marca: f.marca || null,
      categoria: f.categoria,
      stock,
      unidades,
      ingresos,
      costo_vendido: costoVendido,
      ganancia: r2(ingresos - costoVendido),
      dias_promedio_stock: nulo(f.dias_promedio) ? null : r1(n(f.dias_promedio)),
      // Días que alcanza el stock actual al ritmo de venta del período.
      dias_cobertura: porDia > 0 ? Math.round(stock / porDia) : null,
      ultima_venta: f.ultima_venta || f.ultima_venta_historica || null,
      ultimo_ingreso: f.ultimo_ingreso || null,
      capital_inmovilizado: r2(stock * costo),
      dias_sin_venta: diasDesde(f.ultima_venta_historica || f.ultimo_ingreso || f.alta, ahora),
    };
  });

  const porMasVendido = (a, b) => b.unidades - a.unidades || b.ingresos - a.ingresos
    || String(a.nombre).localeCompare(String(b.nombre));
  const vendidos = prods.filter((p) => p.unidades > 0).sort(porMasVendido);
  const masVendidos = vendidos.slice(0, limite);
  // Los de menor rotación, sin repetir los del top (con pocos vendidos, la lista queda corta o vacía).
  const menosVendidos = vendidos.slice(limite).reverse().slice(0, limite);
  const quietos = prods.filter((p) => p.unidades === 0 && p.stock > 0)
    .sort((a, b) => b.capital_inmovilizado - a.capital_inmovilizado
      || (b.dias_sin_venta ?? 0) - (a.dias_sin_venta ?? 0));

  const unidades = vendidos.reduce((a, p) => a + p.unidades, 0);
  const ingresos = r2(vendidos.reduce((a, p) => a + p.ingresos, 0));
  const costoVendido = r2(vendidos.reduce((a, p) => a + p.costo_vendido, 0));
  // Promedio ponderado por unidades: un modelo que vendió 20 pesa más que uno que vendió 1.
  const conDias = vendidos.filter((p) => p.dias_promedio_stock !== null);
  const unidadesConDias = conDias.reduce((a, p) => a + p.unidades, 0);
  const diasPromedio = unidadesConDias > 0
    ? r1(conDias.reduce((a, p) => a + p.dias_promedio_stock * p.unidades, 0) / unidadesConDias) : null;

  return {
    resumen: {
      unidades_vendidas: unidades,
      productos_vendidos: vendidos.length,
      ingresos,
      costo_vendido: costoVendido,
      ganancia_estimada: r2(ingresos - costoVendido),
      dias_promedio_stock: diasPromedio,
      producto_estrella: masVendidos[0] || null,
      productos_sin_movimiento: quietos.length,
      capital_inmovilizado: r2(quietos.reduce((a, p) => a + p.capital_inmovilizado, 0)),
    },
    mas_vendidos: masVendidos,
    menos_vendidos: menosVendidos,
    sin_movimiento: quietos.slice(0, LIMITE_SIN_MOVIMIENTO),
  };
}

function armarProveedores(filas) {
  return (filas || []).map((f) => ({
    proveedor: f.proveedor,
    compras: n(f.compras),
    total: r2(n(f.total)),
    dias_promedio: nulo(f.dias_promedio) ? null : r1(n(f.dias_promedio)),
    dias_maximo: nulo(f.dias_maximo) ? null : r1(n(f.dias_maximo)),
    ultima: f.ultima || null,
  }));
}

async function obtenerRotabilidad(ejecutar, { sucursalId, desde, diasPeriodo }) {
  const r = await ejecutar(SQL_ROTABILIDAD, [sucursalId || null, desde, MOTIVOS_NO_INGRESO]);
  return armarRotabilidad(r.rows, { diasPeriodo });
}

async function obtenerDemorasProveedores(ejecutar, { sucursalId, desde }) {
  const r = await ejecutar(SQL_PROVEEDORES, [sucursalId || null, desde]);
  return armarProveedores(r.rows);
}

module.exports = {
  obtenerRotabilidad, obtenerDemorasProveedores, armarRotabilidad, armarProveedores,
  MOTIVOS_NO_INGRESO,
};
