// =====================================================================
// Edición rápida de marco (reutiliza PUT /api/marcos/:id).
// No cambia la imagen aquí; solo metadatos de catálogo.
// =====================================================================

import { useState } from 'react';
import Modal from '../Modal';
import { actualizarMarco } from '../../api/marcos';

const ESTILOS = ['OVALADO', 'RECTANGULAR', 'AVIADOR', 'CAT-EYE'];

export default function EditarMarcoModal({ marco, onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    codigo: marco.codigo || '',
    nombre_modelo: marco.nombre_modelo || '',
    marca: marco.marca || '',
    material: marco.material || '',
    color: marco.color || '',
    estilo_forma: marco.estilo_forma || '',
    ancho_mm: marco.ancho_mm ?? '',
    alto_mm: marco.alto_mm ?? '',
    patilla_mm: marco.patilla_mm ?? '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function setCampo(c, v) {
    setForm((f) => ({ ...f, [c]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const actualizado = await actualizarMarco(marco.id, form);
      onGuardado(actualizado);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar');
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Editar marco" onCerrar={onCerrar}>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error && <p className="alert alert--error field--full">{error}</p>}

        <label className="field">
          <span>Código</span>
          <input value={form.codigo} onChange={(e) => setCampo('codigo', e.target.value)} required />
        </label>
        <label className="field">
          <span>Modelo</span>
          <input value={form.nombre_modelo} onChange={(e) => setCampo('nombre_modelo', e.target.value)} required />
        </label>
        <label className="field">
          <span>Marca</span>
          <input value={form.marca} onChange={(e) => setCampo('marca', e.target.value)} />
        </label>
        <label className="field">
          <span>Material</span>
          <input value={form.material} onChange={(e) => setCampo('material', e.target.value)} />
        </label>
        <label className="field">
          <span>Color</span>
          <input value={form.color} onChange={(e) => setCampo('color', e.target.value)} />
        </label>
        <label className="field">
          <span>Estilo / forma</span>
          <select value={form.estilo_forma} onChange={(e) => setCampo('estilo_forma', e.target.value)}>
            <option value="">Sin especificar</option>
            {ESTILOS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label className="field">
          <span>Ancho frontal (mm)</span>
          <input type="number" step="0.1" min="0" value={form.ancho_mm} onChange={(e) => setCampo('ancho_mm', e.target.value)} />
        </label>
        <label className="field">
          <span>Alto de lente (mm)</span>
          <input type="number" step="0.1" min="0" value={form.alto_mm} onChange={(e) => setCampo('alto_mm', e.target.value)} />
        </label>
        <label className="field">
          <span>Largo de patilla (mm)</span>
          <input type="number" step="0.1" min="0" value={form.patilla_mm} onChange={(e) => setCampo('patilla_mm', e.target.value)} />
        </label>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost btn--inline" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
