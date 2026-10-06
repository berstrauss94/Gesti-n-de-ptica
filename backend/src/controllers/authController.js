// =====================================================================
// Controller de autenticación.
// Valida credenciales contra usuarios_sistema usando la función crypt()
// de PostgreSQL (bcrypt) y emite un token JWT.
// =====================================================================

const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../config/env');

// POST /api/auth/login
async function login(req, res) {
  const { usuario, password } = req.body || {};

  if (!usuario || !password) {
    return res
      .status(400)
      .json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    // La comparación bcrypt se hace dentro de Postgres: crypt() re-aplica el
    // salt almacenado en el propio hash y compara en tiempo constante.
    const sql = `
      SELECT id, usuario, rol
      FROM usuarios_sistema
      WHERE usuario = $1
        AND password_hash = crypt($2, password_hash)
        AND activo = TRUE
      LIMIT 1
    `;
    const result = await query(sql, [usuario, password]);

    if (result.rowCount === 0) {
      // Mensaje genérico para no revelar si el usuario existe
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const user = result.rows[0];

    const token = jwt.sign(
      { usuario: user.usuario, rol: user.rol },
      JWT_SECRET,
      { subject: user.id, expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({
      token,
      usuario: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
      },
    });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/auth/me  (requiere token válido)
async function me(req, res) {
  return res.json({ usuario: req.user });
}

module.exports = { login, me };
