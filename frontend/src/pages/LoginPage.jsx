// =====================================================================
// Pantalla de Login. Autentica contra POST /api/auth/login.
// =====================================================================

import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import logo from '../assets/logo.png';
import fondo from '../assets/fondo-local.jpg';

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
      {/* 0) Fondo: aparece primero, antes que el logo */}
      <div className="login__fondo" style={{ backgroundImage: `url(${fondo})` }} aria-hidden="true" />
      <div className="login__fondo-velo" aria-hidden="true" />

      {/* 1) Logo grande, FUERA de la tarjeta, arriba */}
      <img src={logo} alt="Centro de Contactología" className="login__logo" />

      {/* 2) Tarjeta de login (aparece al terminar el logo) */}
      <form className="login__card" onSubmit={handleSubmit}>
        <h1 className="login__title">Centro de Contactología</h1>
        <p className="login__subtitle">Ingresa tus credenciales</p>

        {/* 3) Sub-casillas en cascada de arriba hacia abajo */}
        <label className="field login__stagger login__stagger--1">
          <span>Usuario</span>
          <input
            type="text"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            autoComplete="username"
            required
          />
        </label>

        <label className="field login__stagger login__stagger--2">
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

        <button type="submit" className="btn btn--primary login__stagger login__stagger--3" disabled={cargando}>
          {cargando ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  );
}
