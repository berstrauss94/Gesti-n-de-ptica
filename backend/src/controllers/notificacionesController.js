// =====================================================================
// Controller de Notificaciones: configuración, historial y envío de prueba.
// =====================================================================

const { query } = require('../config/db');
const { notificar } = require('../services/notificacionesService');

// GET /api/notificaciones/config  (no expone tokens completos)
async function obtenerConfig(req, res) {
  try {
    const r = await query('SELECT * FROM config_notificaciones WHERE id = 1');
    const c = r.rows[0] || {};
    return res.json({
      alertas_activas: c.alertas_activas !== false,
      telegram_configurado: Boolean(c.telegram_token),
      telegram_chat_default: c.telegram_chat_default || '',
      whatsapp_configurado: Boolean(c.whatsapp_token),
      gemini_configurado: Boolean(c.gemini_api_key),
    });
  } catch (err) {
    console.error('Error al obtener config notificaciones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/notificaciones/config
async function guardarConfig(req, res) {
  const b = req.body || {};
  const campos = [];
  const valores = [];
  const permitidos = ['telegram_token', 'telegram_chat_default', 'whatsapp_token', 'whatsapp_phone_id', 'gemini_api_key'];
  permitidos.forEach((c) => {
    if (b[c] !== undefined && b[c] !== '') { valores.push(b[c]); campos.push(`${c} = $${valores.length}`); }
  });
  if (b.alertas_activas !== undefined) {
    valores.push(Boolean(b.alertas_activas)); campos.push(`alertas_activas = $${valores.length}`);
  }
  campos.push('updated_at = CURRENT_TIMESTAMP');
  try {
    if (valores.length > 0) {
      await query(`UPDATE config_notificaciones SET ${campos.join(', ')} WHERE id = 1`, valores);
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('Error al guardar config notificaciones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/notificaciones  (historial)
async function listar(req, res) {
  try {
    const r = await query('SELECT * FROM notificaciones ORDER BY created_at DESC LIMIT 100');
    return res.json({ notificaciones: r.rows });
  } catch (err) {
    console.error('Error al listar notificaciones:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/notificaciones/prueba  { canal, destino, mensaje }
async function prueba(req, res) {
  const { canal, destino, mensaje } = req.body || {};
  const estado = await notificar({
    canal: canal || 'telegram',
    destino,
    evento: 'prueba',
    mensaje: mensaje || 'Mensaje de prueba del Sistema Óptica.',
  });
  return res.json({ estado });
}

module.exports = { obtenerConfig, guardarConfig, listar, prueba };
