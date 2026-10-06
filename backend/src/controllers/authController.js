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

// POST /api/auth/cambiar-password  (requiere token válido)
// Verifica la contraseña actual y guarda la nueva (bcrypt coste 12).
async function cambiarPassword(req, res) {
  const { password_actual, password_nueva } = req.body || {};

  if (!password_actual || !password_nueva) {
    return res
      .status(400)
      .json({ error: 'password_actual y password_nueva son obligatorias' });
  }
  if (password_nueva.length < 8) {
    return res
      .status(400)
      .json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }
  if (password_nueva === password_actual) {
    return res
      .status(400)
      .json({ error: 'La nueva contraseña debe ser distinta de la actual' });
  }

  try {
    // Verifica la contraseña actual contra el hash almacenado
    const verif = await query(
      `SELECT id FROM usuarios_sistema
       WHERE id = $1
         AND password_hash = crypt($2, password_hash)
         AND activo = TRUE`,
      [req.user.id, password_actual]
    );

    if (verif.rowCount === 0) {
      return res.status(401).json({ error: 'La contraseña actual no es correcta' });
    }

    // Guarda el nuevo hash (bcrypt coste 12, igual que el seed inicial)
    await query(
      `UPDATE usuarios_sistema
       SET password_hash = crypt($1, gen_salt('bf', 12))
       WHERE id = $2`,
      [password_nueva, req.user.id]
    );

    return res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (err) {
    console.error('Error al cambiar contraseña:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { login, me, cambiarPassword };
