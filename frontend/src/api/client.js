// =====================================================================
// Cliente HTTP central (axios).
// - Inyecta el token JWT en cada petición.
// - Ante un 401, limpia la sesión y redirige al login.
// =====================================================================

import axios from 'axios';

const TOKEN_KEY = 'optica_token';

// baseURL vacío en dev => usa el proxy de Vite (/api -> localhost:3000)
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
});

// Interceptor de petición: añade Authorization: Bearer <token>
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor de respuesta: maneja expiración/invalidez del token (401) y
// falta de permisos (403).
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem('optica_user');
      // Evita bucle si ya estamos en login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    // 403: sin permiso. Normalizamos un mensaje claro si el backend no lo trae,
    // para que las páginas muestren algo entendible en vez de un error genérico.
    if (status === 403 && error.response?.data && !error.response.data.error) {
      error.response.data.error = 'No tenés permiso para realizar esta acción.';
    }
    return Promise.reject(error);
  }
);

export { api, TOKEN_KEY };
