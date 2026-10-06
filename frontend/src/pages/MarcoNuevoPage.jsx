// =====================================================================
// Alta de marco con subida de PNG transparente (obligatorio).
// =====================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crearMarco } from '../api/marcos';

const ESTILOS = ['OVALADO', 'RECTANGULAR', 'AVIADOR', 'CAT-EYE'];

export default function MarcoNuevoPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    codigo: '',
    nombre_modelo: '',
    marca: '',
    material: '',
    color: '',
    estilo_forma: '',
    ancho_mm: '',
    alto_mm: '',
    patilla_mm: '',
  });
  const [imagen, setImagen] = useState(null);
  const [preview, setPreview] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleImagen(e) {
    const file = e.target.files[0] || null;
    setImagen(file);
    setPreview(file ? URL.createObjectURL(file) : '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!imagen) {
      setError('La imagen PNG del marco es obligatoria');
      return;
    }

    setGuardando(true);
    try {
      const marco = await crearMarco(form, imagen);
      navigate('/marcos', { replace: true, state: { creado: marco.id } });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el marco');
      setGuardando(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Nuevo marco</h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      <form className="card form-grid" onSubmit={handleSubmit}>
        <label className="field">
          <span>Código *</span>
          <input type="text" value={form.codigo} onChange={(e) => setCampo('codigo', e.target.value)} required />
        </label>

        <label className="field">
          <span>Modelo *</span>
          <input type="text" value={form.nombre_modelo} onChange={(e) => setCampo('nombre_modelo', e.target.value)} required />
        </label>

        <label className="field">
          <span>Marca</span>
          <input type="text" value={form.marca} onChange={(e) => setCampo('marca', e.target.value)} />
        </label>

        <label className="field">
          <span>Material</span>
          <input type="text" value={form.material} onChange={(e) => setCampo('material', e.target.value)} />
        </label>

        <label className="field">
          <span>Color</span>
          <input type="text" value={form.color} onChange={(e) => setCampo('color', e.target.value)} />
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
          <input type="number" step="0.1" min="0" value={form.ancho_mm}
            onChange={(e) => setCampo('ancho_mm', e.target.value)} placeholder="ej: 140" />
        </label>

        <label className="field">
          <span>Alto de lente (mm)</span>
          <input type="number" step="0.1" min="0" value={form.alto_mm}
            onChange={(e) => setCampo('alto_mm', e.target.value)} placeholder="ej: 43" />
        </label>

        <label className="field">
          <span>Largo de patilla (mm)</span>
          <input type="number" step="0.1" min="0" value={form.patilla_mm}
            onChange={(e) => setCampo('patilla_mm', e.target.value)} placeholder="ej: 143" />
        </label>

        <label className="field field--full">
          <span>Imagen PNG transparente *</span>
          <input type="file" accept="image/png" onChange={handleImagen} required />
        </label>

        {preview && (
          <div className="field--full preview-png">
            <img src={preview} alt="Vista previa del marco" />
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn--ghost" onClick={() => navigate('/marcos')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar marco'}
          </button>
        </div>
      </form>
    </div>
  );
}
