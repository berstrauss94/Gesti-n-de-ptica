// =====================================================================
// Servicio de Notificaciones (WhatsApp / Telegram).
//
//  - Lee la configuración desde config_notificaciones (tokens, activo).
//  - Telegram: envío REAL vía Bot API si hay token (funciona con un bot).
//  - WhatsApp: punto de integración (Cloud API de Meta). Requiere cuenta
//    Business verificada y plantillas aprobadas -> hasta entonces, simula.
//  - Si faltan credenciales o las alertas están desactivadas: registra el
//    evento en 'notificaciones' con estado 'simulado'. NUNCA bloquea nada.
// =====================================================================

const { query } = require('../config/db');

async function getConfig() {
  try {
    const r = await query('SELECT * FROM config_notificaciones WHERE id = 1');
    return r.rows[0] || {};
  } catch {
    return {};
  }
}

async function registrar(canal, destino, evento, mensaje, estado, detalle) {
  try {
    await query(
      `INSERT INTO notificaciones (canal, destino, evento, mensaje, estado, detalle)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [canal, destino || null, evento || null, mensaje, estado, detalle || null]
    );
  } catch (err) {
    console.error('No se pudo registrar la notificación:', err.message);
  }
}

// Envío real por Telegram Bot API
async function enviarTelegram(token, chatId, mensaje) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: mensaje }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Telegram ${res.status}: ${t}`);
  }
  return true;
}

// Punto de integración WhatsApp (Meta Cloud API). Pendiente de credenciales.
async function enviarWhatsApp(/* token, phoneId, destino, mensaje */) {
  // POST https://graph.facebook.com/v18.0/<phoneId>/messages con el token.
  // Requiere plantillas aprobadas por Meta para mensajes iniciados por el negocio.
  throw new Error('Integración WhatsApp pendiente de credenciales/plantillas de Meta.');
}

// API pública: notifica por el canal indicado (o telegram por defecto).
// Devuelve el estado ('enviado' | 'simulado' | 'error') sin lanzar excepción.
async function notificar({ canal = 'telegram', destino, evento, mensaje }) {
  const cfg = await getConfig();

  if (cfg.alertas_activas === false) {
    await registrar(canal, destino, evento, mensaje, 'simulado', 'Alertas desactivadas');
    return 'simulado';
  }

  try {
    if (canal === 'telegram') {
      const token = cfg.telegram_token;
      const chat = destino || cfg.telegram_chat_default;
      if (!token || !chat) {
        await registrar(canal, destino, evento, mensaje, 'simulado', 'Sin token/chat de Telegram');
        return 'simulado';
      }
      await enviarTelegram(token, chat, mensaje);
      await registrar(canal, chat, evento, mensaje, 'enviado', null);
      return 'enviado';
    }

    if (canal === 'whatsapp') {
      if (!cfg.whatsapp_token || !cfg.whatsapp_phone_id) {
        await registrar(canal, destino, evento, mensaje, 'simulado', 'Sin credenciales de WhatsApp');
        return 'simulado';
      }
      await enviarWhatsApp(cfg.whatsapp_token, cfg.whatsapp_phone_id, destino, mensaje);
      await registrar(canal, destino, evento, mensaje, 'enviado', null);
      return 'enviado';
    }

    await registrar(canal, destino, evento, mensaje, 'error', 'Canal desconocido');
    return 'error';
  } catch (err) {
    await registrar(canal, destino, evento, mensaje, 'error', err.message);
    return 'error';
  }
}

module.exports = { notificar, getConfig };
