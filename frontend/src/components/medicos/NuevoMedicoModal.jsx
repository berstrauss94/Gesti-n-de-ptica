// =====================================================================
// Alta rápida de médico (Apellido, Nombre, M.P., Especialidad).
// Se abre desde el sobre o desde el cliente sin perder lo que ya se cargó:
// tiene su propio <form> y se renderiza FUERA del formulario de origen.
// Si el médico ya existe (mismo nombre y M.P.), lo devuelve igual para elegirlo.
//
// Props: onCreado(medico), onCerrar()
// =====================================================================
import { useState } from 'react';
import Modal from '../Modal';
import { crearMedico } from '../../api/medicos';

export default function NuevoMedicoModal({ onCreado, onCerrar }) {
  const [f, setF] = useState({ apellido: '', nombre: '', matricula: '', especialidad: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const set = (c, v) => setF((x) => ({ ...x, [c]: v }));

  async function guardar(e) {
    e.preventDefault();
    e.stopPropagation(); // no dispara el submit del formulario de atrás
    setError('');
    const nombre = [f.apellido.trim(), f.nombre.trim()].filter(Boolean).join(' ');
    if (!nombre) { setError('Cargá al menos el apellido o el nombre.'); return; }
    const matricula = f.matricula.trim().replace(/^m\.?\s*p\.?\s*/i, ''); // "M.P. 7966" -> "7966"
    setGuardando(true);
    try {
      const m = await crearMedico({ nombre, matricula: matricula || null, especialidad: f.especialidad.trim() || null });
      onCreado(m);
    } catch (err) {
      if (err.response?.status === 409 && err.response.data?.medico) { onCreado(err.response.data.medico); return; }
      setError(err.response?.data?.error || 'No se pudo crear el médico');
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Nuevo médico" onCerrar={onCerrar}>
      <form className="form-grid" onSubmit={guardar}>
        <label className="field"><span>Apellido *</span>
          <input maxLength={75} autoFocus value={f.apellido} onChange={(e) => set('apellido', e.target.value)} /></label>
        <label className="field"><span>Nombre</span>
          <input maxLength={75} value={f.nombre} onChange={(e) => set('nombre', e.target.value)} /></label>
        <label className="field"><span>Matrícula (M.P.)</span>
          <input maxLength={50} inputMode="numeric" placeholder="Ej: 7966" value={f.matricula} onChange={(e) => set('matricula', e.target.value)} /></label>
        <label className="field"><span>Especialidad</span>
          <input maxLength={100} placeholder="Ej: Oftalmología" value={f.especialidad} onChange={(e) => set('especialidad', e.target.value)} /></label>
        {error && <p className="alert alert--error field--full" role="alert">{error}</p>}
        <div className="form-actions">
          <button type="button" className="btn btn--ghost btn--inline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar médico'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
