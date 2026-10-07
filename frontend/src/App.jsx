// =====================================================================
// Definición de rutas de la aplicación.
// Público: /login
// Protegido: todo lo que cuelga del layout principal.
// =====================================================================

import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ClientesPage from './pages/ClientesPage';
import ClienteNuevoPage from './pages/ClienteNuevoPage';
import ClienteDetallePage from './pages/ClienteDetallePage';
import MarcosPage from './pages/MarcosPage';
import MarcoNuevoPage from './pages/MarcoNuevoPage';
import TryOnPage from './pages/TryOnPage';
import StockPage from './pages/StockPage';
import TpvPage from './pages/TpvPage';
import ComprasPage from './pages/ComprasPage';
import ConfiguracionPage from './pages/ConfiguracionPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/clientes" element={<ClientesPage />} />
        <Route path="/clientes/nuevo" element={<ClienteNuevoPage />} />
        <Route path="/clientes/:id" element={<ClienteDetallePage />} />
        <Route path="/marcos" element={<MarcosPage />} />
        <Route path="/marcos/nuevo" element={<MarcoNuevoPage />} />
        <Route path="/try-on" element={<TryOnPage />} />
        <Route path="/stock" element={<StockPage />} />
        <Route path="/tpv" element={<TpvPage />} />
        <Route path="/compras" element={<ComprasPage />} />
        <Route path="/configuracion" element={<ConfiguracionPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
