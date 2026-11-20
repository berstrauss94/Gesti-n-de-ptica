// =====================================================================
// Servicio de Notificaciones (WhatsApp / Telegram).
//
//  - Lee la configuración desde config_notificaciones (tokens, activo).
//  - Telegram: envío REAL vía Bot API si hay token (funciona con un bot).
//  - WhatsApp: envío REAL por la Cloud API de Meta si hay token y Phone ID. Para
//    escribirle primero a un cliente hace falta una plantilla aprobada (ver
//    whatsapp_plantilla en la configuración).
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

// Envío real por WhatsApp Cloud API (Meta).
//  - Con plantilla: mensaje de una plantilla aprobada, con el texto en la variable {{1}}.
//    Es lo único que Meta permite para escribirle primero a un cliente.
//  - Sin plantilla: texto libre (solo llega si el cliente escribió en las últimas 24 h).
const GRAPH_URL = 'https://graph.facebook.com/v21.0';
function textoParaPlantilla(t) {
  // Meta no admite saltos de línea ni muchos espacios seguidos dentro de una variable.
  return String(t || '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim().slice(0, 1000);
}
async function enviarWhatsApp(token, phoneId, destino, mensaje, opciones) {
  const op = opciones || {};
  const to = String(destino || '').replace(/\D/g, '');
  if (!to) throw new Error('Falta el número de destino');
  const cuerpo = op.plantilla
    ? {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: op.plantilla,
        language: { code: op.idioma || 'es_AR' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: textoParaPlantilla(mensaje) }] }],
      },
    }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(mensaje || '').slice(0, 4000) } };
  const res = await fetch(GRAPH_URL + '/' + encodeURIComponent(phoneId) + '/messages', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalle = data && data.error && data.error.message ? data.error.message : 'sin detalle';
    throw new Error('WhatsApp ' + res.status + ': ' + detalle);
  }
  return (data.messages && data.messages[0] && data.messages[0].id) || true;
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
      await enviarWhatsApp(cfg.whatsapp_token, cfg.whatsapp_phone_id, destino, mensaje, {
        plantilla: cfg.whatsapp_plantilla || null,
        idioma: cfg.whatsapp_idioma || null,
      });
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

module.exports = { notificar, getConfig, enviarTelegram, enviarWhatsApp, registrar };
