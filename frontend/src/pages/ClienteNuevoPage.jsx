// =====================================================================
// Alta de cliente + subida opcional de las 3 fotos de seguimiento.
// Flujo: 1) crear cliente -> obtener id, 2) si hay fotos, subirlas.
// =====================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crearUsuario, subirFotos } from '../api/usuarios';

const MAX_FOTOS = 3;

export default function ClienteNuevoPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    nombre_completo: '',
    dni: '',
    obra_social: '',
    edad: '',
  });
  const [fotos, setFotos] = useState([]); // File[]
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleFotos(e) {
    const seleccionadas = Array.from(e.target.files).slice(0, MAX_FOTOS);
    setFotos(seleccionadas);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const payload = {
        nombre_completo: form.nombre_completo.trim(),
        dni: form.dni.trim(),
        obra_social: form.obra_social.trim() || undefined,
        edad: form.edad === '' ? undefined : Number(form.edad),
      };
      const cliente = await crearUsuario(payload);

      if (fotos.length > 0) {
        await subirFotos(cliente.id, fotos);
      }

      navigate(`/clientes/${cliente.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el cliente');
      setGuardando(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Nuevo cliente</h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Nombre completo *</span>
          <input
            type="text"
            value={form.nombre_completo}
            onChange={(e) => setCampo('nombre_completo', e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>DNI *</span>
          <input
            type="text"
            value={form.dni}
            onChange={(e) => setCampo('dni', e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Obra social</span>
          <input
            type="text"
            value={form.obra_social}
            onChange={(e) => setCampo('obra_social', e.target.value)}
          />
        </label>

        <label className="field">
          <span>Edad</span>
          <input
            type="number"
            min="0"
            max="120"
            value={form.edad}
            onChange={(e) => setCampo('edad', e.target.value)}
          />
        </label>

        <label className="field field--full">
          <span>Fotos de seguimiento (hasta {MAX_FOTOS})</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleFotos}
          />
          {fotos.length > 0 && (
            <small className="muted">{fotos.length} foto(s) seleccionada(s)</small>
          )}
        </label>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/clientes')}
          >
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
