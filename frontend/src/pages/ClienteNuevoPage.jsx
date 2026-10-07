// =====================================================================
// Alta de cliente + subida OBLIGATORIA de las 3 fotos de seguimiento,
// cada una en su slot etiquetado por ángulo:
//   Slot 1: Frontal   -> orden_foto 1
//   Slot 2: 45° (semi) -> orden_foto 2
//   Slot 3: Perfil 90° -> orden_foto 3
// Esto garantiza la secuencia visual Frontal -> 45° -> Perfil en el carrusel.
// Flujo: 1) validar 3 slots, 2) crear cliente, 3) subir fotos con ángulo.
// =====================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { crearUsuario, subirFotosConAngulo } from '../api/usuarios';

// Definición de los 3 slots (orden visual Frontal -> 45° -> Perfil)
const SLOTS = [
  { key: 'frontal', label: 'Foto Frontal', hint: 'Vista de frente (0°)' },
  { key: '45deg', label: 'Foto 45° (Semi-perfil)', hint: 'Rostro girado ~45°' },
  { key: 'perfil', label: 'Foto Perfil (90°)', hint: 'Vista de costado' },
];

export default function ClienteNuevoPage() {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    nombre_completo: '',
    dni: '',
    obra_social: '',
    edad: '',
  });
  // fotos por slot: { frontal: File|null, '45deg': File|null, perfil: File|null }
  const [fotos, setFotos] = useState({ frontal: null, '45deg': null, perfil: null });
  const [previews, setPreviews] = useState({ frontal: '', '45deg': '', perfil: '' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  function setCampo(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleSlot(key, e) {
    const file = e.target.files[0] || null;
    setFotos((prev) => ({ ...prev, [key]: file }));
    setPreviews((prev) => {
      // Liberar la URL anterior para no fugar memoria
      if (prev[key]) URL.revokeObjectURL(prev[key]);
      return { ...prev, [key]: file ? URL.createObjectURL(file) : '' };
    });
  }

  const slotsCompletos = SLOTS.every((s) => fotos[s.key]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!slotsCompletos) {
      const faltantes = SLOTS.filter((s) => !fotos[s.key]).map((s) => s.label);
      setError(`Faltan fotos obligatorias: ${faltantes.join(', ')}.`);
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre_completo: form.nombre_completo.trim(),
        dni: form.dni.trim(),
        obra_social: form.obra_social.trim() || undefined,
        edad: form.edad === '' ? undefined : Number(form.edad),
      };
      const cliente = await crearUsuario(payload);

      // Enviar las 3 fotos con su ángulo explícito (orden garantizado)
      const items = SLOTS.map((s) => ({ file: fotos[s.key], angulo: s.key }));
      await subirFotosConAngulo(cliente.id, items);

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

        <div className="field--full">
          <span className="slots-title">Fotos de seguimiento (3 obligatorias) *</span>
          <p className="aviso-fotos">
            Importante: subí la foto del rostro tal cual (JPG/PNG normal). No uses
            fotos con el fondo recortado o "transparente" (cuadriculado): el sistema
            necesita la cara con su fondo real para el probador.
          </p>
          <div className="slots-grid">
            {SLOTS.map((slot, i) => (
              <div key={slot.key} className={`slot ${fotos[slot.key] ? 'slot--ok' : ''}`}>
                <div className="slot__head">
                  <span className="slot__num">{i + 1}</span>
                  <div>
                    <strong>{slot.label}</strong>
                    <small className="muted">{slot.hint}</small>
                  </div>
                </div>

                <div className="slot__preview">
                  {previews[slot.key] ? (
                    <img src={previews[slot.key]} alt={slot.label} />
                  ) : (
                    <span className="slot__placeholder">Sin foto</span>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(e) => handleSlot(slot.key, e)}
                  required
                />
              </div>
            ))}
          </div>
        </div>

        <div className="form-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/clientes')}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn--primary btn--inline"
            disabled={guardando || !slotsCompletos}
          >
            {guardando ? 'Guardando…' : 'Guardar cliente'}
          </button>
        </div>
      </form>
    </div>
  );
}
