// =====================================================================
// Pantalla de Login. Autentica contra POST /api/auth/login.
// =====================================================================

import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, cargando, autenticado } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const destino = location.state?.from?.pathname || '/';

  // Si ya hay sesión, redirección declarativa (sin efectos en render)
  if (autenticado) {
    return <Navigate to={destino} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    try {
      await login({ usuario, password });
      navigate(destino, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || 'No se pudo iniciar sesión';
      setError(msg);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={handleSubmit}>
        <h1 className="login__title">Óptica · KIRO</h1>
        <p className="login__subtitle">Ingresa tus credenciales</p>

        <label className="field">
          <span>Usuario</span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <p className="login__error" role="alert">{error}</p>}

        <button type="submit" className="btn btn--primary" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
