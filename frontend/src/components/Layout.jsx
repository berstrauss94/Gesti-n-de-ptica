// =====================================================================
// Layout principal: sidebar lateral vertical (estética Gemini/Optix) +
// contenido. Las vistas hijas se renderizan en <Outlet />.
// =====================================================================

import { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
  Home, Users, Glasses, Package, ShoppingCart, Truck, Settings,
  Sparkles, LogOut, KeyRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CambiarPasswordModal from './CambiarPasswordModal';

// Navegación: rutas reales del proyecto. Try-On queda fuera (suspendido).
const MENU = [
  { name: 'Inicio', path: '/', icon: Home, end: true },
  { name: 'Clientes', path: '/clientes', icon: Users },
  { name: 'Marcos', path: '/marcos', icon: Glasses },
  { name: 'Stock', path: '/stock', icon: Package },
  { name: 'TPV / Ventas', path: '/tpv', icon: ShoppingCart },
  { name: 'Compras', path: '/compras', icon: Truck },
  { name: 'Configuración', path: '/configuracion', icon: Settings },
  // { name: 'Virtual Try-On', path: '/try-on', icon: Glasses }, // suspendido
];

export default function Layout() {
  const { usuario, logout } = useAuth();
  const [cambiandoPass, setCambiandoPass] = useState(false);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar__top">
          {/* Marca con animación */}
          <div className="brand">
            <Sparkles className="brand__spark" size={22} />
            <span className="brand__name">Óptica · KIRO</span>
          </div>

          <nav className="nav-menu">
            {MENU.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) => `nav-item ${isActive ? 'is-active' : ''}`}
                >
                  <Icon className="nav-item__icon" size={20} />
                  <span className="nav-item__label">{item.name}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Pie: usuario + sucursal + acciones */}
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
              <KeyRound size={16} /> Contraseña
            </button>
            <button type="button" className="sidebar__btn sidebar__btn--salir" onClick={logout} title="Salir">
              <LogOut size={16} /> Salir
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
