// =====================================================================
// Sección de graduaciones dentro del detalle del cliente.
// Lista las recetas y permite agregar una nueva (OD/OI, DIP, tipo, etc.).
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import {
  listarGraduaciones,
  crearGraduacion,
  eliminarGraduacion,
} from '../api/graduaciones';

const TIPOS_LENTE = ['Monofocal', 'Bifocal', 'Multifocal', 'Ocupacional'];

const FORM_VACIO = {
  tipo_lente: 'Monofocal',
  fecha_emision: '',
  od_esfera: '',
  od_cilindro: '',
  od_eje: '',
  od_adicion: '',
  oi_esfera: '',
  oi_cilindro: '',
  oi_eje: '',
  oi_adicion: '',
  distancia_interpupilar: '',
  tratamiento_vidrio: '',
  medico_oftalmologo: '',
};

// Convierte strings vacíos a undefined y numéricos a Number
function normalizar(form) {
  const numericos = [
    'od_esfera', 'od_cilindro', 'od_eje', 'od_adicion',
    'oi_esfera', 'oi_cilindro', 'oi_eje', 'oi_adicion',
    'distancia_interpupilar',
  ];
  const out = {};
  Object.entries(form).forEach(([k, v]) => {
    if (v === '' || v === null) return;
    out[k] = numericos.includes(k) ? Number(v) : v;
  });
  return out;
}

export default function GraduacionesSeccion({ usuarioId }) {
  const [graduaciones, setGraduaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      setGraduaciones(await listarGraduaciones(usuarioId));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las graduaciones');
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function setCampo(c, v) {
    setForm((f) => ({ ...f, [c]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await crearGraduacion(usuarioId, normalizar(form));
      setForm(FORM_VACIO);
      setMostrarForm(false);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la receta');
    } finally {
      setGuardando(false);
    }
  }

  async function handleEliminar(id) {
    if (!window.confirm('¿Eliminar esta receta?')) return;
    try {
      await eliminarGraduacion(id);
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar la receta');
    }
  }

  return (
    <div className="card">
      <div className="page-header">
        <h2>Graduaciones</h2>
        <button
          type="button"
          className="btn btn--primary btn--inline"
          onClick={() => setMostrarForm((v) => !v)}
        >
          {mostrarForm ? 'Cerrar' : '+ Nueva receta'}
        </button>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {mostrarForm && (
        <form className="grad-form" onSubmit={handleSubmit}>
          <div className="grad-form__row">
            <label className="field">
              <span>Tipo de lente *</span>
              <select value={form.tipo_lente} onChange={(e) => setCampo('tipo_lente', e.target.value)} required>
                {TIPOS_LENTE.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Fecha de emisión *</span>
              <input type="date" value={form.fecha_emision} onChange={(e) => setCampo('fecha_emision', e.target.value)} required />
            </label>
            <label className="field">
              <span>DIP (mm)</span>
              <input type="number" step="0.1" min="40" max="80" value={form.distancia_interpupilar} onChange={(e) => setCampo('distancia_interpupilar', e.target.value)} />
            </label>
          </div>

          <table className="grad-table-input">
            <thead>
              <tr><th></th><th>Esfera</th><th>Cilindro</th><th>Eje (0-180)</th><th>Adición</th></tr>
            </thead>
            <tbody>
              <tr>
                <th>OD (derecho)</th>
                <td><input type="number" step="0.25" value={form.od_esfera} onChange={(e) => setCampo('od_esfera', e.target.value)} /></td>
                <td><input type="number" step="0.25" value={form.od_cilindro} onChange={(e) => setCampo('od_cilindro', e.target.value)} /></td>
                <td><input type="number" min="0" max="180" value={form.od_eje} onChange={(e) => setCampo('od_eje', e.target.value)} /></td>
                <td><input type="number" step="0.25" value={form.od_adicion} onChange={(e) => setCampo('od_adicion', e.target.value)} /></td>
              </tr>
              <tr>
                <th>OI (izquierdo)</th>
                <td><input type="number" step="0.25" value={form.oi_esfera} onChange={(e) => setCampo('oi_esfera', e.target.value)} /></td>
                <td><input type="number" step="0.25" value={form.oi_cilindro} onChange={(e) => setCampo('oi_cilindro', e.target.value)} /></td>
                <td><input type="number" min="0" max="180" value={form.oi_eje} onChange={(e) => setCampo('oi_eje', e.target.value)} /></td>
                <td><input type="number" step="0.25" value={form.oi_adicion} onChange={(e) => setCampo('oi_adicion', e.target.value)} /></td>
              </tr>
            </tbody>
          </table>

          <div className="grad-form__row">
            <label className="field">
              <span>Tratamiento del vidrio</span>
              <input value={form.tratamiento_vidrio} onChange={(e) => setCampo('tratamiento_vidrio', e.target.value)} placeholder="Antirreflejo, fotocromático…" />
            </label>
            <label className="field">
              <span>Médico oftalmólogo</span>
              <input value={form.medico_oftalmologo} onChange={(e) => setCampo('medico_oftalmologo', e.target.value)} />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar receta'}
            </button>
          </div>
        </form>
      )}

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : graduaciones.length === 0 ? (
        <p className="muted">Sin recetas registradas.</p>
      ) : (
        <div className="grad-list">
          {graduaciones.map((g) => (
            <article key={g.id} className="grad-item">
              <div className="grad-item__head">
                <span className="badge">{g.tipo_lente}</span>
                <span className="muted">{g.fecha_emision?.slice(0, 10)}</span>
                <button type="button" className="link-btn" onClick={() => handleEliminar(g.id)}>Eliminar</button>
              </div>
              <table className="grad-table-view">
                <thead>
                  <tr><th></th><th>Esf</th><th>Cil</th><th>Eje</th><th>Add</th></tr>
                </thead>
                <tbody>
                  <tr><th>OD</th><td>{g.od_esfera ?? '—'}</td><td>{g.od_cilindro ?? '—'}</td><td>{g.od_eje ?? '—'}</td><td>{g.od_adicion ?? '—'}</td></tr>
                  <tr><th>OI</th><td>{g.oi_esfera ?? '—'}</td><td>{g.oi_cilindro ?? '—'}</td><td>{g.oi_eje ?? '—'}</td><td>{g.oi_adicion ?? '—'}</td></tr>
                </tbody>
              </table>
              <div className="grad-item__meta muted">
                {g.distancia_interpupilar && <span>DIP: {g.distancia_interpupilar} mm</span>}
                {g.tratamiento_vidrio && <span>· {g.tratamiento_vidrio}</span>}
                {g.medico_oftalmologo && <span>· Dr. {g.medico_oftalmologo}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
