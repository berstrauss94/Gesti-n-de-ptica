// =====================================================================
// Sobres / Órdenes de trabajo óptica.
// El Sobre es la orden central: paciente + receta (lejos/cerca por ojo) +
// armazón + cristal + médico + obra social + fecha de entrega. Reutiliza
// clientes y obras sociales ya existentes.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { listarSobres, crearSobre, cambiarEstadoSobre, eliminarSobre } from '../api/sobres';
import { listarSucursales } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import { listarObrasSociales } from '../api/obrasSociales';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';

const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'entregado', 'anulado'];
const ESTADO_LABEL = {
  pendiente: 'Pendiente', reserva: 'Reserva', en_taller: 'En taller',
  entregado: 'Entregado', anulado: 'Anulado',
};

// Campos del form. LEJOS incluye adición; CERCA no.
const FORM_VACIO = {
  cliente_id: '', obra_social_id: '', medico: '', fecha_receta: '', fecha_entrega: '',
  dip: '', armazon_descripcion: '', cristal_descripcion: '', total: '', notas: '',
  lejos_od_esf: '', lejos_od_cil: '', lejos_od_eje: '', lejos_od_add: '', lejos_od_prisma: '', lejos_od_base: '', lejos_od_diam: '',
  lejos_oi_esf: '', lejos_oi_cil: '', lejos_oi_eje: '', lejos_oi_add: '', lejos_oi_prisma: '', lejos_oi_base: '', lejos_oi_diam: '',
  cerca_od_esf: '', cerca_od_cil: '', cerca_od_eje: '', cerca_od_prisma: '', cerca_od_base: '', cerca_od_diam: '',
  cerca_oi_esf: '', cerca_oi_cil: '', cerca_oi_eje: '', cerca_oi_prisma: '', cerca_oi_base: '', cerca_oi_diam: '',
};

export default function SobresPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [clientes, setClientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [sobres, setSobres] = useState([]);
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, u, os] = await Promise.all([
          listarSucursales(),
          listarUsuarios({ limit: 300 }),
          listarObrasSociales(true).catch(() => []),
        ]);
        setSucursales(s);
        setClientes(u.usuarios);
        setObrasSociales(os);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar los datos'); }
    })();
  }, []);

  const cargar = useCallback(async (sid, estado) => {
    if (!sid) return;
    try {
      setSobres(await listarSobres({ sucursal_id: sid, estado: estado || undefined }));
    } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar los sobres'); }
  }, []);

  useEffect(() => { cargar(sucursalId, estadoFiltro); }, [sucursalId, estadoFiltro, cargar]);

  function setC(campo, v) { setForm((f) => ({ ...f, [campo]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk('');
    try {
      const payload = { sucursal_id: sucursalId };
      Object.entries(form).forEach(([k, v]) => { if (v !== '') payload[k] = v; });
      await crearSobre(payload);
      setOk('Sobre creado.');
      setForm(FORM_VACIO);
      setMostrarAlta(false);
      cargar(sucursalId, estadoFiltro);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear el sobre'); }
  }

  async function cambiar(id, estado) {
    setError(''); setOk('');
    try { await cambiarEstadoSobre(id, estado); cargar(sucursalId, estadoFiltro); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el estado'); }
  }

  async function borrar(s) {
    if (!window.confirm(`¿Eliminar el sobre #${s.numero}?`)) return;
    setError(''); setOk('');
    try { await eliminarSobre(s.id); setOk('Sobre eliminado.'); cargar(sucursalId, estadoFiltro); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo eliminar'); }
  }

  // Fila de inputs para un ojo. seccion='lejos' incluye ADD; 'cerca' no.
  function filaOjo(seccion, ojo) {
    const p = `${seccion}_${ojo}`;
    const conAdd = seccion === 'lejos';
    return (
      <tr>
        <td><strong>{ojo.toUpperCase()}</strong></td>
        <td><input value={form[`${p}_esf`]} onChange={(e) => setC(`${p}_esf`, e.target.value)} /></td>
        <td><input value={form[`${p}_cil`]} onChange={(e) => setC(`${p}_cil`, e.target.value)} /></td>
        <td><input value={form[`${p}_eje`]} onChange={(e) => setC(`${p}_eje`, e.target.value)} /></td>
        {conAdd && <td><input value={form[`${p}_add`]} onChange={(e) => setC(`${p}_add`, e.target.value)} /></td>}
        <td><input value={form[`${p}_prisma`]} onChange={(e) => setC(`${p}_prisma`, e.target.value)} /></td>
        <td><input value={form[`${p}_base`]} onChange={(e) => setC(`${p}_base`, e.target.value)} /></td>
        <td><input value={form[`${p}_diam`]} onChange={(e) => setC(`${p}_diam`, e.target.value)} /></td>
      </tr>
    );
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Sobres / Órdenes de trabajo
          <InfoBtn
            paraQue="Es la orden de trabajo central de la óptica: junta el paciente, la receta, el armazón y el cristal en un solo lugar."
            comoFunciona="Cargá un sobre nuevo con la graduación (lejos y cerca por ojo), el armazón, la obra social y la fecha de entrega; seguilo por su estado hasta entregarlo."
            conQueFin="Tené trazado cada trabajo del taller, de la receta a la entrega, sin perder ningún dato técnico."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="">Todos los estados</option>
            {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
          </select>
          <button type="button" className="btn btn--primary btn--inline" onClick={() => setMostrarAlta((v) => !v)}>
            {mostrarAlta ? 'Cerrar' : '+ Nuevo sobre'}
          </button>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {mostrarAlta && (
        <form className="card" onSubmit={guardar}>
          <h2 className="section-title">Datos del sobre</h2>
          <div className="form-grid">
            <label className="field"><span>Paciente</span>
              <select value={form.cliente_id} onChange={(e) => setC('cliente_id', e.target.value)}>
                <option value="">Sin asociar</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo} · {c.dni}</option>)}
              </select></label>
            <label className="field"><span>Obra social</span>
              <select value={form.obra_social_id} onChange={(e) => setC('obra_social_id', e.target.value)}>
                <option value="">Particular</option>
                {obrasSociales.map((os) => <option key={os.id} value={os.id}>{os.nombre}</option>)}
              </select></label>
            <label className="field"><span>Médico</span>
              <input value={form.medico} onChange={(e) => setC('medico', e.target.value)} /></label>
            <label className="field"><span>Fecha receta</span>
              <input type="date" value={form.fecha_receta} onChange={(e) => setC('fecha_receta', e.target.value)} /></label>
            <label className="field"><span>Fecha entrega</span>
              <input type="date" value={form.fecha_entrega} onChange={(e) => setC('fecha_entrega', e.target.value)} /></label>
            <label className="field"><span>DIP (mm)</span>
              <input value={form.dip} onChange={(e) => setC('dip', e.target.value)} /></label>
          </div>

          <h2 className="section-title">Receta — Lejos</h2>
          <table className="data-table">
            <thead><tr><th></th><th>ESF</th><th>CIL</th><th>EJE</th><th>ADD</th><th>Prisma</th><th>Base</th><th>Diám.</th></tr></thead>
            <tbody>{filaOjo('lejos', 'od')}{filaOjo('lejos', 'oi')}</tbody>
          </table>

          <h2 className="section-title">Receta — Cerca</h2>
          <table className="data-table">
            <thead><tr><th></th><th>ESF</th><th>CIL</th><th>EJE</th><th>Prisma</th><th>Base</th><th>Diám.</th></tr></thead>
            <tbody>{filaOjo('cerca', 'od')}{filaOjo('cerca', 'oi')}</tbody>
          </table>

          <h2 className="section-title">Armazón, cristal y total</h2>
          <div className="form-grid">
            <label className="field field--full"><span>Armazón (descripción)</span>
              <input value={form.armazon_descripcion} onChange={(e) => setC('armazon_descripcion', e.target.value)} placeholder="Armazón del paciente / código / modelo" /></label>
            <label className="field field--full"><span>Cristal (descripción)</span>
              <input value={form.cristal_descripcion} onChange={(e) => setC('cristal_descripcion', e.target.value)} placeholder="Tipo de cristal, tratamiento…" /></label>
            <label className="field"><span>Total ($)</span>
              <input type="number" step="0.01" min="0" value={form.total} onChange={(e) => setC('total', e.target.value)} /></label>
            <label className="field field--full"><span>Notas</span>
              <input value={form.notas} onChange={(e) => setC('notas', e.target.value)} /></label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--inline">Guardar sobre</button>
          </div>
        </form>
      )}

      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>#</th><th>Paciente</th><th>Obra social</th><th>Entrega</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
          <tbody>
            {sobres.length === 0 ? (
              <tr><td colSpan="7" className="muted" style={{ padding: '1rem' }}>Sin sobres para este filtro.</td></tr>
            ) : sobres.map((s) => (
              <tr key={s.id}>
                <td>{s.numero}</td>
                <td>{s.cliente_nombre || '—'}</td>
                <td>{s.obra_social_nombre || 'Particular'}</td>
                <td className="small">{s.fecha_entrega ? new Date(s.fecha_entrega).toLocaleDateString() : '—'}</td>
                <td><span className="badge">{ESTADO_LABEL[s.estado]}</span></td>
                <td>$ {Number(s.total).toFixed(2)}</td>
                <td className="col-mov">
                  <select className="select-estado" value={s.estado} onChange={(e) => cambiar(s.id, e.target.value)}>
                    {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                  </select>
                  {esAdmin && (
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => borrar(s)}>Eliminar</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
