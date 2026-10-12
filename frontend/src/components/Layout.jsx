// =====================================================================
// Layout principal: sidebar lateral COLAPSABLE (estética Gemini/Optix).
//  - Desktop: replegado (solo íconos); se expande al pasar el puntero.
//  - Táctil/móvil: botón ☰ para abrir/cerrar (no hay hover en touch).
// =====================================================================

import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Home, Users, Glasses, Package, ShoppingCart, Truck, Settings,
  CalendarClock, FileText, Percent, LogOut, KeyRound, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEsAdmin } from '../hooks/useEsAdmin';
import CambiarPasswordModal from './CambiarPasswordModal';
import logo from '../assets/logo.png';

const MENU = [
  { name: 'Inicio', path: '/', icon: Home, end: true },
  { name: 'Clientes', path: '/clientes', icon: Users },
  { name: 'Marcos', path: '/marcos', icon: Glasses },
  { name: 'Stock', path: '/stock', icon: Package },
  { name: 'TPV / Ventas', path: '/tpv', icon: ShoppingCart },
  { name: 'Compras', path: '/compras', icon: Truck },
  { name: 'Turnos', path: '/turnos', icon: CalendarClock },
  { name: 'Sobres', path: '/sobres', icon: FileText },
  // Comisiones (liquidación): solo admin
  { name: 'Comisiones', path: '/comisiones', icon: Percent, adminOnly: true },
  // Configuración (tokens, credenciales): solo admin
  { name: 'Configuración', path: '/configuracion', icon: Settings, adminOnly: true },
];

const MARCA = 'Centro De Contactología';

export default function Layout() {
  const { usuario, logout } = useAuth();
  const esAdmin = useEsAdmin();
  const location = useLocation();
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false); // control táctil

  // Filtra las secciones solo-admin para los usuarios no-admin
  const menuVisible = MENU.filter((item) => !item.adminOnly || esAdmin);

  return (
    <div className="app-shell">
      {/* Botón hamburguesa (solo visible en móvil/táctil) */}
      <button
        type="button"
        className="menu-toggle"
        onClick={() => setAbiertoMovil((v) => !v)}
        aria-label="Abrir menú"
      >
        {abiertoMovil ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside className={`sidebar ${abiertoMovil ? 'is-open' : ''}`}>
        <div className="sidebar__top">
          <div className="brand" title={MARCA}>
            <img src={logo} alt={MARCA} className="brand__logo" />
            <span className="brand__name typing">{MARCA}</span>
          </div>

          <nav className="nav-menu">
            {menuVisible.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  onClick={() => setAbiertoMovil(false)}
                  className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                  title={item.name}
                >
                  <Icon className="nav-item__icon" size={20} />
                  <span className="nav-item__label">{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        <div className="sidebar__bottom">
          <div className="sidebar__user">
            <span className="sidebar__user-name">{usuario?.usuario}</span>
            <span className="sidebar__user-rol">{usuario?.rol}</span>
          </div>
          <div className="sidebar__actions">
            <button type="button" className="sidebar__btn" onClick={() => setCambiandoPass(true)} title="Cambiar contraseña">
              <KeyRound size={16} /> <span className="sidebar__btn-label">Contraseña</span>
            </button>
            <button type="button" className="sidebar__btn sidebar__btn--salir" onClick={logout} title="Salir">
              <LogOut size={16} /> <span className="sidebar__btn-label">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="content" key={location.pathname}>
        <Outlet />
      </main>

      {cambiandoPass && <CambiarPasswordModal onCerrar={() => setCambiandoPass(false)} />}
    </div>
  );
}
