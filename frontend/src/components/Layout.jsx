// =====================================================================
// Layout principal de la zona autenticada: barra superior + contenido.
// Las vistas hijas se renderizan en <Outlet />.
// =====================================================================

import { Outlet, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const { usuario, logout } = useAuth();

  return (
    <div className="layout">
      <header className="topbar">
        <div className="topbar__brand">Óptica · KIRO</div>
        <nav className="topbar__nav">
          <NavLink to="/" end>Inicio</NavLink>
          <NavLink to="/clientes">Clientes</NavLink>
          <NavLink to="/marcos">Marcos</NavLink>
          <NavLink to="/try-on">Prueba Virtual</NavLink>
        </nav>
        <div className="topbar__user">
          <span>{usuario?.usuario} · {usuario?.rol}</span>
          <button type="button" onClick={logout} className="btn btn--ghost">
            Salir
          </button>
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
