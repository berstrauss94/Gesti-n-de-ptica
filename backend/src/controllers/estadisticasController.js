// =====================================================================
// Estadísticas e inteligencia de stock (solo admin: muestra costos y ganancias).
// GET /api/estadisticas/stock?sucursal_id=&meses=6
//   sucursal_id  opcional (vacío = todas las sucursales)
//   meses        1 a 24 (default 6); el período arranca el día 1 del mes más viejo
//                y llega hasta hoy, en hora de Argentina.
// Junta tres cálculos que corren en paralelo sobre el mismo período:
//   rotabilidadService (rankings, días en stock, stock inmóvil, demora de proveedores)
//   flujoCajaService   (ventas, unidades, cobros y compras por mes)
// Son consultas SQL, no agentes de IA: los números salen de la base, no se estiman.
// =====================================================================
const { query } = require('../config/db');
const { obtenerRotabilidad, obtenerDemorasProveedores } = require('../services/rotabilidadService');
const { obtenerFlujoMensual, inicioPeriodo } = require('../services/flujoCajaService');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MESES_DEFAULT = 6;
const MESES_MAX = 24;

// Devuelve { sucursalId, meses } o { error }.
function leerFiltros(q = {}) {
  const sucursalId = q.sucursal_id ? String(q.sucursal_id) : null;
  if (sucursalId && !UUID_RE.test(sucursalId)) return { error: 'Sucursal inválida' };
  let meses = MESES_DEFAULT;
  if (q.meses !== undefined && q.meses !== '') {
    meses = Number(q.meses);
    if (!Number.isInteger(meses) || meses < 1 || meses > MESES_MAX) {
      return { error: `El período debe ser de 1 a ${MESES_MAX} meses` };
    }
  }
  return { sucursalId, meses };
}

async function stock(req, res) {
  const f = leerFiltros(req.query);
  if (f.error) return res.status(400).json({ error: f.error });
  try {
    const desde = await inicioPeriodo(query, f.meses);
    const diasPeriodo = desde ? Math.max((Date.now() - new Date(desde).getTime()) / 86400000, 1) : f.meses * 30;
    const [rotabilidad, flujo, proveedores] = await Promise.all([
      obtenerRotabilidad(query, { sucursalId: f.sucursalId, desde, diasPeriodo }),
      obtenerFlujoMensual(query, { sucursalId: f.sucursalId, meses: f.meses }),
      obtenerDemorasProveedores(query, { sucursalId: f.sucursalId, desde }),
    ]);
    return res.json({
      periodo: { meses: f.meses, desde, sucursal_id: f.sucursalId, dias: Math.round(diasPeriodo) },
      resumen: rotabilidad.resumen,
      rotabilidad: {
        mas_vendidos: rotabilidad.mas_vendidos,
        menos_vendidos: rotabilidad.menos_vendidos,
        sin_movimiento: rotabilidad.sin_movimiento,
      },
      flujo,
      proveedores,
    });
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Sucursal inválida' });
    console.error('Error al calcular estadísticas de stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { stock, leerFiltros };
