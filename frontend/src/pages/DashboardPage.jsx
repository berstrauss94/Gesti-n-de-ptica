// =====================================================================
// Dashboard: tablero de inicio con KPIs reales de la óptica.
// Muestra ventas del día, cobrado, caja, stock bajo mínimo, turnos de hoy
// y presupuestos abiertos. Filtrable por sucursal (o visión global).
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import InfoBtn from '../components/InfoBtn';
import { listarSucursales } from '../api/stock';
import { resumenDashboard } from '../api/dashboard';

const money = (n) => `$ ${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DashboardPage() {
  const { usuario } = useAuth();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState(''); // '' = todas
  const [data, setData] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listarSucursales().then(setSucursales).catch(() => setSucursales([]));
  }, []);

  const cargar = useCallback(async (sid) => {
    setCargando(true); setError('');
    try {
      const r = await resumenDashboard(sid || undefined);
      setData(r);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los indicadores');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(sucursalId); }, [sucursalId, cargar]);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Hola, {usuario?.usuario}
          <InfoBtn
            paraQue="Es el tablero de inicio: muestra el pulso de la óptica del día de un vistazo."
            comoFunciona="Elegí una sucursal (o dejá todas) y revisá ventas, cobros, caja, stock bajo y turnos de hoy."
            conQueFin="Tomar decisiones rápidas sobre caja, reposición y agenda sin entrar módulo por módulo."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            <option value="">Todas las sucursales</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {cargando ? (
        <p className="muted">Cargando indicadores…</p>
      ) : data && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <span className="kpi-label">Ventas de hoy</span>
              <span className="kpi-value">{money(data.ventas_hoy.monto)}</span>
              <span className="kpi-sub muted small">{data.ventas_hoy.cantidad} operación(es)</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Cobrado hoy</span>
              <span className="kpi-value">{money(data.cobrado_hoy)}</span>
              <span className="kpi-sub muted small">pagos ingresados</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Cajas abiertas</span>
              <span className="kpi-value">{data.cajas_abiertas}</span>
              <span className="kpi-sub muted small">en este momento</span>
            </div>
            <div className={`kpi-card ${data.bajo_minimo > 0 ? 'kpi-card--alerta' : ''}`}>
              <span className="kpi-label">Stock bajo mínimo</span>
              <span className="kpi-value">{data.bajo_minimo}</span>
              <span className="kpi-sub muted small">producto(s) a reponer</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Turnos de hoy</span>
              <span className="kpi-value">{data.turnos_hoy.total}</span>
              <span className="kpi-sub muted small">{data.turnos_hoy.pendiente} pendiente(s)</span>
            </div>
            <div className="kpi-card">
              <span className="kpi-label">Presupuestos abiertos</span>
              <span className="kpi-value">{data.presupuestos_abiertos.cantidad}</span>
              <span className="kpi-sub muted small">saldo {money(data.presupuestos_abiertos.saldo)}</span>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Turnos de hoy por estado</h2>
            <div className="chips">
              <span className="badge">Pendientes: {data.turnos_hoy.pendiente}</span>
              <span className="badge">Asistieron: {data.turnos_hoy.asistio}</span>
              <span className="badge">Ausentes: {data.turnos_hoy.ausente}</span>
              <span className="badge">Cancelados: {data.turnos_hoy.cancelado}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
