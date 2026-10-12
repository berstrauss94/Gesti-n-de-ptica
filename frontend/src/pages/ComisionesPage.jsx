// =====================================================================
// Comisiones: reporte del acumulado por vendedor en un período.
// Lee las ventas entregadas (donde se calcula la comisión). Solo admin.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { listarComisiones } from '../api/sobres';
import { listarSucursales } from '../api/stock';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';

const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ComisionesPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(primerDia);
  const [hasta, setHasta] = useState(hoy.toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    listarSucursales().then(setSucursales).catch(() => setSucursales([]));
  }, []);

  const cargar = useCallback(async () => {
    setError('');
    try {
      const r = await listarComisiones({
        desde: desde || undefined, hasta: hasta || undefined,
        sucursal_id: sucursalId || undefined,
      });
      setData(r);
    } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar las comisiones'); }
  }, [desde, hasta, sucursalId]);

  useEffect(() => { if (esAdmin) cargar(); }, [cargar, esAdmin]);

  if (!esAdmin) return <Navigate to="/" replace />;

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Comisiones
          <InfoBtn
            paraQue="Muestra cuánta comisión generó cada vendedor en un período, según las ventas entregadas."
            comoFunciona="Elegí el rango de fechas y la sucursal; mirá el resumen por vendedor y el detalle venta por venta."
            conQueFin="Liquidar comisiones con un número claro y respaldado por las ventas reales."
          />
        </h1>
        <div className="tryon-toolbar">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Total comisiones</span>
              <span className="kpi-value">{money(data.total_comision)}</span>
              <span className="kpi-sub muted small">en el período</span>
            </div>
          </div>

          <div className="card no-pad">
            <h2 className="section-title" style={{ padding: '1rem 1rem 0' }}>Resumen por vendedor</h2>
            <table className="table">
              <thead><tr><th>Vendedor</th><th>Ventas</th><th>Total vendido</th><th>Comisión</th></tr></thead>
              <tbody>
                {data.resumen.length === 0 ? (
                  <tr><td colSpan="4" className="muted" style={{ padding: '1rem' }}>Sin ventas entregadas en el período.</td></tr>
                ) : data.resumen.map((r, i) => (
                  <tr key={i}>
                    <td>{r.vendedor || '—'}</td>
                    <td>{r.cantidad}</td>
                    <td>{money(r.total_vendido)}</td>
                    <td><strong>{money(r.total_comision)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card no-pad">
            <h2 className="section-title" style={{ padding: '1rem 1rem 0' }}>Detalle por venta</h2>
            <table className="table">
              <thead><tr><th>#</th><th>Vendedor</th><th>Fecha</th><th>Total</th><th>%</th><th>Comisión</th></tr></thead>
              <tbody>
                {data.detalle.length === 0 ? (
                  <tr><td colSpan="6" className="muted" style={{ padding: '1rem' }}>Sin detalle.</td></tr>
                ) : data.detalle.map((d) => (
                  <tr key={d.id}>
                    <td>{d.numero}</td>
                    <td>{d.vendedor || '—'}</td>
                    <td className="small">{d.entregada_at ? new Date(d.entregada_at).toLocaleDateString() : '—'}</td>
                    <td>{money(d.total)}</td>
                    <td>{Number(d.comision_pct)}%</td>
                    <td>{money(d.comision_monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
