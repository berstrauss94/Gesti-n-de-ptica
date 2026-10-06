// =====================================================================
// Middleware de autenticación por JWT.
// Protege rutas verificando el token Bearer del header Authorization.
// =====================================================================

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/env');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res
      .status(401)
      .json({ error: 'Token no proporcionado o formato inválido' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // Datos del usuario disponibles para los controllers
    req.user = {
      id: payload.sub,
      usuario: payload.usuario,
      rol: payload.rol,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Restringe acceso según rol. Uso: authRequired, requireRole('admin')
function requireRole(...rolesPermitidos) {
  return (req, res, next) => {
    if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tienes permiso para esta acción' });
    }
    return next();
  };
}

module.exports = { authRequired, requireRole };
