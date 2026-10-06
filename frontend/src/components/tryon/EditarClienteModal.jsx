// =====================================================================
// Edición rápida de cliente (reutiliza PUT /api/usuarios/:id).
// =====================================================================

import { useState } from 'react';
import Modal from '../Modal';
import { actualizarUsuario } from '../../api/usuarios';

export default function EditarClienteModal({ cliente, onCerrar, onGuardado }) {
  const [form, setForm] = useState({
    nombre_completo: cliente.nombre_completo || '',
    dni: cliente.dni || '',
    obra_social: cliente.obra_social || '',
    edad: cliente.edad ?? '',
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
      const actualizado = await actualizarUsuario(cliente.id, {
        nombre_completo: form.nombre_completo.trim(),
        dni: form.dni.trim(),
        obra_social: form.obra_social.trim(),
        edad: form.edad === '' ? null : Number(form.edad),
      });
      onGuardado(actualizado);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar');
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Editar cliente" onCerrar={onCerrar}>
      <form className="form-grid" onSubmit={handleSubmit}>
        {error && <p className="alert alert--error field--full">{error}</p>}

        <label className="field field--full">
          <span>Nombre completo</span>
          <input value={form.nombre_completo} onChange={(e) => setCampo('nombre_completo', e.target.value)} required />
        </label>
        <label className="field">
          <span>DNI</span>
          <input value={form.dni} onChange={(e) => setCampo('dni', e.target.value)} required />
        </label>
        <label className="field">
          <span>Edad</span>
          <input type="number" min="0" max="120" value={form.edad} onChange={(e) => setCampo('edad', e.target.value)} />
        </label>
        <label className="field field--full">
          <span>Obra social</span>
          <input value={form.obra_social} onChange={(e) => setCampo('obra_social', e.target.value)} />
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
