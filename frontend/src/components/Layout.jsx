// =====================================================================
// Layout principal: sidebar lateral COLAPSABLE (estética Gemini/Optix).
//  - Desktop: replegado (solo íconos); se expande al pasar el puntero.
//  - Táctil/móvil: botón ☰ para abrir/cerrar (no hay hover en touch).
// =====================================================================

import { useEffect, useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Home, Users, Glasses, Store, Eye, Package, ShoppingCart, Truck, Settings,
  CalendarClock, FileText, Percent, Sparkles, LogOut, Menu, X, Bell, BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useEsAdmin } from '../hooks/useEsAdmin';
import AsistenteVirtualModal from './AsistenteVirtualModal';
import logo from '../assets/logo.png';

// Orden del menú lateral (definido por la óptica). Configuración no va acá:
// está al pie, arriba de "Salir" (MENU_PIE).
const MENU = [
  { name: 'Inicio', path: '/', icon: Home, end: true },
  { name: 'Clientes', path: '/clientes', icon: Users },
  { name: 'Sobres', path: '/sobres', icon: FileText },
  { name: 'Turnos', path: '/turnos', icon: CalendarClock },
  { name: 'Recordatorios', path: '/recordatorios', icon: Bell },
  { name: 'Marcos', path: '/marcos', icon: Glasses },
  { name: 'Lentes y otros', path: '/lentes', icon: Eye },
  { name: 'Prueba Virtual', path: '/try-on', icon: Sparkles },
  { name: 'Stock', path: '/stock', icon: Package },
  { name: 'Compras / Proveedores', path: '/compras', icon: Truck },
  { name: 'TPV / Ventas', path: '/tpv', icon: ShoppingCart },
  { name: 'Mercado', path: '/mercado', icon: Store },
  // Estadísticas de stock (costos, ganancias y flujo): solo admin
  { name: 'Estadísticas', path: '/estadisticas', icon: BarChart3, adminOnly: true },
  // Comisiones (liquidación): solo admin
  { name: 'Comisiones', path: '/comisiones', icon: Percent, adminOnly: true },
];
// Pie del sidebar, arriba de "Salir". Configuración (tokens, credenciales): solo admin
const MENU_PIE = [
  { name: 'Configuración', path: '/configuracion', icon: Settings, adminOnly: true },
];

const MARCA = 'Centro De Contactología';

export default function Layout() {
  const { usuario, logout } = useAuth();
  const esAdmin = useEsAdmin();
  const location = useLocation();
  // Entrada de la sección: durante 3.3s (contenido 0.8s+0.7s + tarjetas escalonadas)
  // las tarjetas del tema oscuro esperan a que termine de entrar el contenido.
  // Una tarjeta que aparece después (ej. la consola del sobre) entra enseguida.
  const [entrada, setEntrada] = useState({ ruta: null, activa: true });
  useEffect(() => {
    setEntrada({ ruta: location.pathname, activa: true });
    const t = setTimeout(() => setEntrada({ ruta: location.pathname, activa: false }), 3300);
    return () => clearTimeout(t);
  }, [location.pathname]);
  const entrando = entrada.ruta !== location.pathname || entrada.activa;
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [abiertoMovil, setAbiertoMovil] = useState(false); // control táctil

  // Filtra las secciones solo-admin para los usuarios no-admin
  const visible = (item) => !item.adminOnly || esAdmin;
  const menuVisible = MENU.filter(visible);
  const pieVisible = MENU_PIE.filter(visible);
  const enlace = (item, extra = '') => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.path}
        to={item.path}
        end={item.end}
        onClick={() => setAbiertoMovil(false)}
        className={({ isActive }) => `nav-item${extra}${isActive ? ' is-active' : ''}`}
        title={item.name}
      >
        <Icon className="nav-item__icon" size={20} />
        <span className="nav-item__label">{item.name}</span>
      </NavLink>
    );
  };

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

          <nav className="nav-menu" aria-label="Secciones">
            {menuVisible.map((item) => enlace(item))}
          </nav>
        </div>

        <div className="sidebar__bottom">
          {pieVisible.length > 0 && (
            <nav className="nav-menu nav-menu--pie" aria-label="Configuración">
              {pieVisible.map((item) => enlace(item, ' nav-item--pie'))}
            </nav>
          )}
          <div className="sidebar__user">
            <span className="sidebar__user-name">{usuario?.usuario}</span>
            <span className="sidebar__user-rol">{usuario?.rol}</span>
          </div>
          <div className="sidebar__actions">
            <button type="button" className="sidebar__btn sidebar__btn--salir" onClick={logout} title="Salir">
              <LogOut size={16} /> <span className="sidebar__btn-label">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      <main className={entrando ? 'content content--entrando' : 'content'} key={location.pathname}>
        <Outlet />
      </main>
      <AsistenteVirtualModal abierto={asistenteAbierto} onAbrir={() => setAsistenteAbierto(true)} onCerrar={() => setAsistenteAbierto(false)} />
    </div>
  );
}
