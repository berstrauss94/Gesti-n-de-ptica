// =====================================================================
// Layout principal: sidebar lateral COLAPSABLE (estética Gemini/Optix).
//  - Desktop: replegado (solo íconos); se expande al pasar el puntero.
//  - Táctil/móvil: botón ☰ para abrir/cerrar (no hay hover en touch).
// =====================================================================

import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Home, Users, Glasses, Package, ShoppingCart, Truck, Settings,
  Sparkles, LogOut, KeyRound, Menu, X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CambiarPasswordModal from './CambiarPasswordModal';

const MENU = [
  { name: 'Inicio', path: '/', icon: Home, end: true },
  { name: 'Clientes', path: '/clientes', icon: Users },
  { name: 'Marcos', path: '/marcos', icon: Glasses },
  { name: 'Stock', path: '/stock', icon: Package },
  { name: 'TPV / Ventas', path: '/tpv', icon: ShoppingCart },
  { name: 'Compras', path: '/compras', icon: Truck },
  { name: 'Configuración', path: '/configuracion', icon: Settings },
];

const MARCA = 'Centro De Contactología';

export default function Layout() {
  const { usuario, logout } = useAuth();
  const [cambiandoPass, setCambiandoPass] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false); // control táctil

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
          <div className="brand">
            <Sparkles className="brand__spark" size={22} />
            <span className="brand__name typing">{MARCA}</span>
          </div>

          <nav className="nav-menu">
            {MENU.map((item) => {
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
          <div className="sidebar__sucursal">
            <span className="sidebar__suc-label">Sucursal activa</span>
            <span className="sidebar__suc-value">Casa Central</span>
          </div>
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

      <main className="content">
        <Outlet />
      </main>

      {cambiandoPass && <CambiarPasswordModal onCerrar={() => setCambiandoPass(false)} />}
    </div>
  );
}
