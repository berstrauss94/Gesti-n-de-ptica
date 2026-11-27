// =====================================================================
// Estadísticas e inteligencia de stock (solo admin).
// Lee GET /api/estadisticas/stock y muestra, para la sucursal y el período elegidos:
//   - indicadores: unidades, ingresos, ganancia estimada, días promedio en stock,
//     stock inmóvil y flujo neto;
//   - velocidad de venta (unidades por mes, gráfico de barras en CSS);
//   - comparativo mensual: ventas, cobrado, compras y flujo neto;
//   - ranking de más vendidos y de menor rotación;
//   - stock inmóvil (con stock y sin ventas en el período) y capital parado;
//   - demora de proveedores (de la carga de la compra a su confirmación).
// Cómo se calcula cada número: services/rotabilidadService.js y flujoCajaService.js.
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';
import { listarSucursales } from '../api/stock';
import { estadisticasStock } from '../api/estadisticas';
import { pesos } from '../utils/sobreTotales';

const PERIODOS = [
  [3, 'Últimos 3 meses'], [6, 'Últimos 6 meses'], [12, 'Últimos 12 meses'], [24, 'Últimos 24 meses'],
];
const NOMBRE_MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function etiquetaMes(mes) {
  const [a, m] = String(mes).split('-');
  return `${NOMBRE_MES[Number(m) - 1] || m} ${a}`;
}
function fecha(v) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR');
}
const dias = (v) => (v === null || v === undefined ? '—' : `${String(v).replace('.', ',')} días`);
const entero = (v) => Number(v || 0).toLocaleString('es-AR');

function Producto({ p }) {
  return (
    <>
      <strong>{p.nombre}</strong>
      <span className="muted small est-producto__sub">{p.codigo}{p.marca ? ` · ${p.marca}` : ''}</span>
    </>
  );
}

export default function EstadisticasStockPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [meses, setMeses] = useState(6);
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (esAdmin) listarSucursales().then(setSucursales).catch(() => setSucursales([]));
  }, [esAdmin]);

  const cargar = useCallback(async (sid, m) => {
    setCargando(true); setError('');
    try {
      setData(await estadisticasStock({ sucursalId: sid || undefined, meses: m }));
    } catch (err) {
      setData(null);
      setError(err.response?.data?.error || 'No se pudieron calcular las estadísticas');
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => { if (esAdmin) cargar(sucursalId, meses); }, [esAdmin, sucursalId, meses, cargar]);

  if (!esAdmin) return <Navigate to="/" replace />;

  const r = data?.resumen;
  const flujo = data?.flujo;
  const maxUnidades = Math.max(1, ...(flujo?.meses || []).map((m) => m.unidades));

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Estadísticas de stock
          <InfoBtn
            paraQue="Mostrá qué productos se venden, cuáles están parados y cómo vienen las ventas, los cobros y las compras mes a mes."
            comoFunciona="Elegí la sucursal y el período: los números salen de las ventas entregadas, los pagos, las compras confirmadas y los movimientos de stock."
            conQueFin="Decidir qué reponer, qué liquidar y cuánta plata queda parada en el stock, con datos reales."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)} aria-label="Sucursal">
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select value={meses} onChange={(e) => setMeses(Number(e.target.value))} aria-label="Período">
            {PERIODOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {cargando && !data && <p className="muted">Calculando estadísticas…</p>}

      {data && (
        <div className={`stack${cargando ? ' est-recargando' : ''}`}>
          <p className="muted small est-periodo">
            Desde el {fecha(data.periodo.desde)} hasta hoy ({entero(data.periodo.dias)} días).
          </p>

          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Unidades vendidas</span>
              <span className="kpi-value">{entero(r.unidades_vendidas)}</span>
              <span className="kpi-sub muted small">{entero(r.productos_vendidos)} producto(s) distintos</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Ingresos por productos</span>
              <span className="kpi-value">{pesos(r.ingresos)}</span>
              <span className="kpi-sub muted small">ganancia estimada {pesos(r.ganancia_estimada)}</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Días promedio en stock</span>
              <span className="kpi-value">{r.dias_promedio_stock === null ? '—' : String(r.dias_promedio_stock).replace('.', ',')}</span>
              <span className="kpi-sub muted small">del ingreso a la entrega al cliente</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Producto estrella</span>
              <span className="kpi-value kpi-value--texto">{r.producto_estrella?.nombre || '—'}</span>
              <span className="kpi-sub muted small">
                {r.producto_estrella ? `${entero(r.producto_estrella.unidades)} unidad(es)` : 'sin ventas en el período'}
              </span>
            </div>
            <div className={`kpi-card ${r.productos_sin_movimiento > 0 ? 'kpi-card--alerta' : ''}`}>
              <span className="kpi-label">Stock inmóvil</span>
              <span className="kpi-value">{entero(r.productos_sin_movimiento)}</span>
              <span className="kpi-sub muted small">{pesos(r.capital_inmovilizado)} parados (a costo)</span>
            </div>
            <div className={`kpi-card ${flujo.totales.flujo_neto < 0 ? 'kpi-card--alerta' : ''}`}>
              <span className="kpi-label">Flujo neto del período</span>
              <span className="kpi-value">{pesos(flujo.totales.flujo_neto)}</span>
              <span className="kpi-sub muted small">cobrado {pesos(flujo.totales.cobrado)} − compras {pesos(flujo.totales.compras)}</span>
            </div>
          </div>

          <section className="card" aria-labelledby="est-velocidad">
            <h2 className="section-title" id="est-velocidad">Velocidad de venta (unidades por mes)</h2>
            {flujo.totales.unidades === 0 ? (
              <p className="muted small">No hubo ventas entregadas en el período.</p>
            ) : (
              <div className="est-barras" role="img"
                aria-label={flujo.meses.map((m) => `${etiquetaMes(m.mes)}: ${m.unidades} unidades`).join(', ')}>
                {flujo.meses.map((m) => (
                  <div key={m.mes} className="est-barra" title={`${etiquetaMes(m.mes)}: ${m.unidades} unidad(es), ${pesos(m.ventas)}`}>
                    <span className="est-barra__valor">{m.unidades}</span>
                    <span className="est-barra__columna" style={{ height: `${Math.max((m.unidades / maxUnidades) * 100, m.unidades ? 4 : 1)}%` }} />
                    <span className="est-barra__mes">{etiquetaMes(m.mes)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card no-pad" aria-labelledby="est-flujo">
            <h2 className="section-title est-card-titulo" id="est-flujo">Comparativo mensual: ventas, cobros y compras</h2>
            <div className="est-tabla-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Mes</th><th className="num">Ventas</th><th className="num">Var.</th><th className="num">Unidades</th>
                    <th className="num">Cobrado</th><th className="num">Compras</th><th className="num">Flujo neto</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {[...flujo.meses].reverse().map((m) => (
                    <tr key={m.mes}>
                      <td><strong>{etiquetaMes(m.mes)}</strong></td>
                      <td className="num">{pesos(m.ventas)}<span className="muted small est-sub">{entero(m.operaciones)} venta(s)</span></td>
                      <td className={`num ${m.variacion_ventas_pct > 0 ? 'est-pos' : m.variacion_ventas_pct < 0 ? 'est-neg' : ''}`}>
                        {m.variacion_ventas_pct === null ? '—' : `${m.variacion_ventas_pct > 0 ? '+' : ''}${String(m.variacion_ventas_pct).replace('.', ',')}%`}
                      </td>
                      <td className="num">{entero(m.unidades)}</td>
                      <td className="num">
                        {pesos(m.cobrado)}
                        {m.cobrado_sobres > 0 && <span className="muted small est-sub">{pesos(m.cobrado_sobres)} en sobres</span>}
                      </td>
                      <td className="num">{pesos(m.compras)}<span className="muted small est-sub">{entero(m.cantidad_compras)} compra(s)</span></td>
                      <td className={`num ${m.flujo_neto < 0 ? 'est-neg' : 'est-pos'}`}><strong>{pesos(m.flujo_neto)}</strong></td>
                      <td>
                        {m.cobrado === 0 && m.compras === 0
                          ? <span className="badge">Sin movimiento</span>
                          : <span className={`badge ${m.flujo_neto >= 0 ? 'est-badge--ok' : 'est-badge--neg'}`}>{m.flujo_neto >= 0 ? 'Superávit' : 'Déficit / reposición'}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="est-columnas">
            <section className="card no-pad" aria-labelledby="est-top">
              <h2 className="section-title est-card-titulo" id="est-top">Más vendidos</h2>
              {data.rotabilidad.mas_vendidos.length === 0 ? <p className="muted small est-vacio">Sin ventas en el período.</p> : (
                <table className="table">
                  <thead><tr><th>Producto</th><th className="num">Unid.</th><th className="num">Días en stock</th><th className="num">Stock alcanza</th></tr></thead>
                  <tbody>
                    {data.rotabilidad.mas_vendidos.map((p) => (
                      <tr key={p.producto_id}>
                        <td className="est-producto"><Producto p={p} /></td>
                        <td className="num"><strong>{entero(p.unidades)}</strong><span className="muted small est-sub">{pesos(p.ingresos)}</span></td>
                        <td className="num">{dias(p.dias_promedio_stock)}</td>
                        <td className="num">{p.stock === 0 ? <span className="est-neg">Sin stock</span> : dias(p.dias_cobertura)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section className="card no-pad" aria-labelledby="est-bottom">
              <h2 className="section-title est-card-titulo" id="est-bottom">Menor rotación (con alguna venta)</h2>
              {data.rotabilidad.menos_vendidos.length === 0 ? (
                <p className="muted small est-vacio">
                  {data.rotabilidad.mas_vendidos.length ? 'Todos los productos vendidos entran en "Más vendidos".' : 'Sin ventas en el período.'}
                </p>
              ) : (
                <table className="table">
                  <thead><tr><th>Producto</th><th className="num">Unid.</th><th className="num">Días en stock</th><th className="num">Stock</th></tr></thead>
                  <tbody>
                    {data.rotabilidad.menos_vendidos.map((p) => (
                      <tr key={p.producto_id}>
                        <td className="est-producto"><Producto p={p} /></td>
                        <td className="num"><strong>{entero(p.unidades)}</strong></td>
                        <td className="num">{dias(p.dias_promedio_stock)}</td>
                        <td className="num">{entero(p.stock)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          <section className="card no-pad" aria-labelledby="est-quietos">
            <h2 className="section-title est-card-titulo" id="est-quietos">
              Stock inmóvil: con stock y sin ventas en el período
              {r.productos_sin_movimiento > data.rotabilidad.sin_movimiento.length && (
                <span className="muted small"> (los {data.rotabilidad.sin_movimiento.length} con más capital de {entero(r.productos_sin_movimiento)})</span>
              )}
            </h2>
            {data.rotabilidad.sin_movimiento.length === 0 ? <p className="muted small est-vacio">No hay stock parado: todo lo que tiene existencias se vendió en el período.</p> : (
              <div className="est-tabla-scroll">
                <table className="table">
                  <thead><tr><th>Producto</th><th className="num">Stock</th><th className="num">Capital (costo)</th><th>Último ingreso</th><th>Última venta</th><th className="num">Sin vender</th></tr></thead>
                  <tbody>
                    {data.rotabilidad.sin_movimiento.map((p) => (
                      <tr key={p.producto_id}>
                        <td className="est-producto"><Producto p={p} /></td>
                        <td className="num">{entero(p.stock)}</td>
                        <td className="num">{pesos(p.capital_inmovilizado)}</td>
                        <td>{fecha(p.ultimo_ingreso)}</td>
                        <td>{p.ultima_venta ? fecha(p.ultima_venta) : 'Nunca'}</td>
                        <td className="num">{dias(p.dias_sin_venta)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card no-pad" aria-labelledby="est-prov">
            <h2 className="section-title est-card-titulo" id="est-prov">Demora de proveedores</h2>
            {data.proveedores.length === 0 ? <p className="muted small est-vacio">No hay compras confirmadas en el período.</p> : (
              <table className="table">
                <thead><tr><th>Proveedor</th><th className="num">Compras</th><th className="num">Total</th><th className="num">Demora promedio</th><th className="num">Demora máxima</th><th>Última</th></tr></thead>
                <tbody>
                  {data.proveedores.map((p) => (
                    <tr key={p.proveedor}>
                      <td><strong>{p.proveedor}</strong></td>
                      <td className="num">{entero(p.compras)}</td>
                      <td className="num">{pesos(p.total)}</td>
                      <td className="num">{dias(p.dias_promedio)}</td>
                      <td className="num">{dias(p.dias_maximo)}</td>
                      <td>{fecha(p.ultima)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <details className="card est-notas">
            <summary>Cómo se calculan estos números</summary>
            <ul className="small">
              <li><strong>Ventas:</strong> solo las entregadas (recién ahí sale el stock), por fecha de entrega. Presupuestos, señas y anuladas no cuentan.</li>
              <li><strong>Días en stock:</strong> de la última entrada del producto (compra o carga manual) a la entrega al cliente. Es exacto con un solo lote y aproximado si se repuso varias veces. Los traslados entre sucursales y las devoluciones por anulación no reinician la cuenta.</li>
              <li><strong>Ganancia y capital:</strong> con el costo actual de cada producto, porque el sistema no guarda el costo de cada venta.</li>
              <li><strong>Cobrado:</strong> pagos del TPV (sin ventas anuladas) más los pagos cargados en los sobres, que hoy no pasan por la caja.</li>
              <li><strong>Compras:</strong> compras confirmadas a proveedores, por fecha de confirmación. La demora es el tiempo entre que se carga la compra y se confirma su recepción.</li>
            </ul>
          </details>
        </div>
      )}
    </div>
  );
}
