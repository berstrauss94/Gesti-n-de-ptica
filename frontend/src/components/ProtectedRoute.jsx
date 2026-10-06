// =====================================================================
// Ruta protegida: redirige a /login si no hay sesión activa.
// =====================================================================

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children }) {
  const { autenticado } = useAuth();
  const location = useLocation();

  if (!autenticado) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}
