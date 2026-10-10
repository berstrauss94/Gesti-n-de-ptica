// =====================================================================
// Hook helper: indica si el usuario autenticado tiene rol 'admin'.
// Se usa para mostrar/ocultar acciones administrativas en la UI, de modo
// que coincida con el control de roles del backend (requireRole('admin')).
// =====================================================================

import { useAuth } from '../context/AuthContext';

export function useEsAdmin() {
  const { usuario } = useAuth();
  return usuario?.rol === 'admin';
}
