// =====================================================================
// Contexto de autenticación.
// Gestiona el token JWT y los datos del usuario, con persistencia en
// localStorage para sobrevivir recargas de página.
// =====================================================================

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, TOKEN_KEY } from '../api/client';

const USER_KEY = 'optica_user';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [usuario, setUsuario] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [cargando, setCargando] = useState(false);

  // Sincroniza el estado con localStorage
  useEffect(() => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }, [token]);

  useEffect(() => {
    if (usuario) localStorage.setItem(USER_KEY, JSON.stringify(usuario));
    else localStorage.removeItem(USER_KEY);
  }, [usuario]);

  async function login(credenciales) {
    setCargando(true);
    try {
      const { data } = await api.post('/api/auth/login', credenciales);
      setToken(data.token);
      setUsuario(data.usuario);
      return data;
    } finally {
      setCargando(false);
    }
  }

  function logout() {
    setToken(null);
    setUsuario(null);
  }

  const value = useMemo(
    () => ({ token, usuario, cargando, login, logout, autenticado: Boolean(token) }),
    [token, usuario, cargando]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}
