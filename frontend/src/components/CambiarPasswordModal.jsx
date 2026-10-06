// =====================================================================
// Modal para cambiar la contraseña del usuario autenticado.
// Consume POST /api/auth/cambiar-password.
// =====================================================================

import { useState } from 'react';
import Modal from './Modal';
import { api } from '../api/client';

export default function CambiarPasswordModal({ onCerrar }) {
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres');
      return;
    }
    if (nueva !== repetir) {
      setError('La nueva contraseña y su repetición no coinciden');
      return;
    }

    setGuardando(true);
    try {
      await api.post('/api/auth/cambiar-password', {
        password_actual: actual,
        password_nueva: nueva,
      });
      setOk(true);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la contraseña');
      setGuardando(false);
    }
  }

  return (
    <Modal titulo="Cambiar contraseña" onCerrar={onCerrar}>
      {ok ? (
        <div className="stack">
          <p className="alert alert--ok" role="status">Contraseña actualizada correctamente.</p>
          <div className="form-actions">
            <button type="button" className="btn btn--primary btn--inline" onClick={onCerrar}>
              Cerrar
            </button>
          </div>
        </div>
      ) : (
        <form className="stack" onSubmit={handleSubmit}>
          {error && <p className="alert alert--error" role="alert">{error}</p>}

          <label className="field">
            <span>Contraseña actual</span>
            <input
              type="password"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="field">
            <span>Nueva contraseña (mín. 8 caracteres)</span>
            <input
              type="password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <label className="field">
            <span>Repetir nueva contraseña</span>
            <input
              type="password"
              value={repetir}
              onChange={(e) => setRepetir(e.target.value)}
              autoComplete="new-password"
              required
            />
          </label>

          <div className="form-actions">
            <button type="button" className="btn btn--ghost btn--inline" onClick={onCerrar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Cambiar'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
