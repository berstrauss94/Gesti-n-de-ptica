// =====================================================================
// Módulo Turnos / Agenda.
// - Lista de turnos por sucursal y rango de fechas.
// - Alta de turno (cliente o nombre suelto, fecha/hora, motivo).
// - Marcar asistencia (asistió / ausente / cancelado) y eliminar.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { listarSucursales } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import { listarTurnos, crearTurno, cambiarEstadoTurno, eliminarTurno } from '../api/turnos';
import InfoBtn from '../components/InfoBtn';
import Modal from '../components/Modal';

const ESTADO_LABEL = {
  pendiente: 'Pendiente', asistio: 'Asistió', ausente: 'Ausente', cancelado: 'Cancelado',
};

// Rango por defecto: hoy a +7 días (en formato date para los inputs)
function hoyISO() { return new Date().toISOString().slice(0, 10); }
function masDiasISO(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const FORM_VACIO = {
  cliente_id: '', nombre_contacto: '', telefono_contacto: '',
  profesional_id: '', fecha: hoyISO(), hora: '10:00', motivo: '',
};

export default function TurnosPage() {
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [clientes, setClientes] = useState([]);
  const [turnos, setTurnos] = useState([]);
  const [desde, setDesde] = useState(hoyISO());
  const [hasta, setHasta] = useState(masDiasISO(7));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);

  // Carga inicial: sucursales, clientes y usuarios del sistema (profesionales)
  useEffect(() => {
    (async () => {
      try {
        const [s, u] = await Promise.all([
          listarSucursales(),
          listarUsuarios({ limit: 300 }),
        ]);
        setSucursales(s);
        setClientes(u.usuarios);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los datos iniciales');
      }
    })();
  }, []);

  const cargar = useCallback(async () => {
    if (!sucursalId) return;
    setCargando(true); setError('');
    try {
      const data = await listarTurnos({
        sucursal_id: sucursalId,
        desde: `${desde}T00:00:00`,
        hasta: `${hasta}T23:59:59`,
      });
      setTurnos(data);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los turnos');
    } finally {
      setCargando(false);
    }
  }, [sucursalId, desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  function setCampo(c, v) { setForm((f) => ({ ...f, [c]: v })); }

  async function guardar(e) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await crearTurno({
        sucursal_id: sucursalId,
        cliente_id: form.cliente_id || null,
        profesional_id: form.profesional_id || null,
        fecha_hora: `${form.fecha}T${form.hora}:00`,
        motivo: form.motivo || null,
        nombre_contacto: form.nombre_contacto || null,
        telefono_contacto: form.telefono_contacto || null,
      });
      setOk('Turno agendado.');
      setForm(FORM_VACIO);
      setMostrarForm(false);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo agendar el turno');
    }
  }

  async function marcar(id, estado) {
    setError('');
    try {
      await cambiarEstadoTurno(id, estado);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el turno');
    }
  }

  async function borrar(id) {
    if (!window.confirm('¿Eliminar este turno?')) return;
    setError('');
    try {
      await eliminarTurno(id);
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar el turno');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Turnos / Agenda
          <InfoBtn
            paraQue="Organiza los turnos de atención de la óptica por día, sucursal y profesional."
            comoFunciona="Elegí la sucursal y el rango de fechas, agendá un turno con el cliente o un nombre suelto, y marcá si asistió."
            conQueFin="Ordenar la agenda de atención y llevar el registro de asistencia de los pacientes."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button type="button" className="btn btn--primary btn--inline" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cerrar' : '+ Nuevo turno'}
          </button>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); cargar(); }}>
        <label className="field"><span>Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label className="field"><span>Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
        <button type="submit" className="btn btn--ghost btn--inline">Filtrar</button>
      </form>

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : turnos.length === 0 ? (
        <div className="card empty"><p>No hay turnos en el rango seleccionado.</p></div>
      ) : (
        <div className="card no-pad">
          <table className="data-table">
            <thead>
              <tr><th>Fecha y hora</th><th>Paciente</th><th>Teléfono</th><th>Profesional</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td>{new Date(t.fecha_hora).toLocaleString()}</td>
                  <td>{t.cliente_nombre || t.nombre_contacto || '—'}</td>
                  <td>{t.telefono_contacto || '—'}</td>
                  <td>{t.profesional_nombre || '—'}</td>
                  <td>{t.motivo || '—'}</td>
                  <td><span className="badge">{ESTADO_LABEL[t.estado]}</span></td>
                  <td className="col-mov">
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => marcar(t.id, 'asistio')}>Asistió</button>
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => marcar(t.id, 'ausente')}>Ausente</button>
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => marcar(t.id, 'cancelado')}>Cancelar</button>
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => borrar(t.id)}>Eliminar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: nuevo turno */}
      {mostrarForm && (
        <Modal titulo="Nuevo turno" onCerrar={() => setMostrarForm(false)}>
          <form className="form-grid" onSubmit={guardar}>
            <label className="field"><span>Cliente (opcional)</span>
              <select value={form.cliente_id} onChange={(e) => setCampo('cliente_id', e.target.value)}>
                <option value="">Sin cliente registrado</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
              </select></label>
            <label className="field"><span>Nombre de contacto (si no es cliente)</span>
              <input value={form.nombre_contacto} onChange={(e) => setCampo('nombre_contacto', e.target.value)} /></label>
            <label className="field"><span>Teléfono</span>
              <input value={form.telefono_contacto} onChange={(e) => setCampo('telefono_contacto', e.target.value)} /></label>
            <label className="field"><span>Fecha *</span>
              <input type="date" value={form.fecha} onChange={(e) => setCampo('fecha', e.target.value)} required /></label>
            <label className="field"><span>Hora *</span>
              <input type="time" value={form.hora} onChange={(e) => setCampo('hora', e.target.value)} required /></label>
            <label className="field field--full"><span>Motivo</span>
              <input value={form.motivo} onChange={(e) => setCampo('motivo', e.target.value)} placeholder="Control, entrega, consulta…" /></label>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setMostrarForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline">Agendar turno</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
