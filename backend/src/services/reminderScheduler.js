// =====================================================================
// Programador de recordatorios de turnos.
// Cada pocos minutos busca los avisos de `recordatorios_turnos` que ya
// tocan y los manda por WhatsApp (o Telegram, copia interna).
//
//  - Es seguro con varias instancias: reclama los avisos con
//    FOR UPDATE SKIP LOCKED, así uno no se manda dos veces.
//  - Si las alertas están desactivadas o falta una credencial, los avisos
//    quedan pendientes (no se marcan como enviados ni como fallidos).
//  - Si el envío falla se reintenta (3 intentos, cada 30 min) y después
//    queda como "fallido" con el motivo.
//  - Si ya pasó la fecha del control, el aviso se cancela solo.
// =====================================================================
const { query } = require('../config/db');
const { getConfig, enviarTelegram, enviarWhatsApp, registrar } = require('./notificacionesService');

const INTERVALO_MS = 5 * 60 * 1000;
const PRIMERA_PASADA_MS = 30 * 1000;
const LOTE = 20;
const MAX_INTENTOS = 3;
const REINTENTO_MIN = 30;
const RECLAMO_VENCE_MIN = 15; // un aviso "enviando" más de esto = se cayó el proceso

let corriendo = false;
let timer = null;

// Manda un aviso. Lanza si falla (el motivo queda en ultimo_error).
async function enviarUno(r, cfg) {
  if (r.canal === 'telegram') {
    const copia = `[Copia interna] Recordatorio para ${r.nombre_destino || 'cliente'} (${r.telefono_destino}):\n${r.mensaje_personalizado}`;
    await enviarTelegram(cfg.telegram_token, cfg.telegram_chat_default, copia);
    return cfg.telegram_chat_default;
  }
  await enviarWhatsApp(cfg.whatsapp_token, cfg.whatsapp_phone_id, r.telefono_destino, r.mensaje_personalizado, {
    plantilla: cfg.whatsapp_plantilla || null,
    idioma: cfg.whatsapp_idioma || null,
  });
  return r.telefono_destino;
}

// Canales con credenciales cargadas.
function canalesListos(cfg) {
  const canales = [];
  if (cfg.whatsapp_token && cfg.whatsapp_phone_id) canales.push('whatsapp');
  if (cfg.telegram_token && cfg.telegram_chat_default) canales.push('telegram');
  return canales;
}

// Una pasada. Devuelve { enviados, reintentos, fallidos, cancelados, pausado? }.
async function procesarPendientes() {
  if (corriendo) return { omitido: true };
  corriendo = true;
  const res = { enviados: 0, reintentos: 0, fallidos: 0, cancelados: 0 };
  try {
    const cfg = await getConfig();

    // Avisos que quedaron "enviando" por un corte del servidor: vuelven a la cola.
    await query(
      `UPDATE recordatorios_turnos SET estado = 'pendiente'
        WHERE estado = 'enviando' AND reclamado_at < CURRENT_TIMESTAMP - ($1 || ' minutes')::interval`,
      [String(RECLAMO_VENCE_MIN)]
    );
    // Si ya pasó el día del control, no tiene sentido avisar.
    const venc = await query(
      `UPDATE recordatorios_turnos
          SET estado = 'cancelado', ultimo_error = 'Ya pasó la fecha del control'
        WHERE estado = 'pendiente'
          AND fecha_evento < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Argentina/Buenos_Aires')::date`
    );
    res.cancelados = venc.rowCount;

    if (cfg.alertas_activas === false) return { ...res, pausado: 'Alertas desactivadas' };
    const canales = canalesListos(cfg);
    if (canales.length === 0) return { ...res, pausado: 'Faltan credenciales de WhatsApp o Telegram' };

    const claim = await query(
      `UPDATE recordatorios_turnos
          SET estado = 'enviando', reclamado_at = CURRENT_TIMESTAMP, intentos = intentos + 1
        WHERE id IN (
          SELECT id FROM recordatorios_turnos
           WHERE estado = 'pendiente' AND fecha_programada <= CURRENT_TIMESTAMP AND canal = ANY($1)
           ORDER BY fecha_programada ASC
           LIMIT $2 FOR UPDATE SKIP LOCKED)
        RETURNING *`,
      [canales, LOTE]
    );

    for (const r of claim.rows) {
      try {
        const destino = await enviarUno(r, cfg);
        await query(
          `UPDATE recordatorios_turnos
              SET estado = 'enviado', enviado_at = CURRENT_TIMESTAMP, ultimo_error = NULL
            WHERE id = $1`,
          [r.id]
        );
        await registrar(r.canal, destino, 'recordatorio_turno', r.mensaje_personalizado, 'enviado', null);
        res.enviados += 1;
      } catch (err) {
        const motivo = String(err.message || 'Error al enviar').slice(0, 300);
        if (r.intentos >= MAX_INTENTOS) {
          await query(`UPDATE recordatorios_turnos SET estado = 'fallido', ultimo_error = $2 WHERE id = $1`, [r.id, motivo]);
          res.fallidos += 1;
        } else {
          await query(
            `UPDATE recordatorios_turnos
                SET estado = 'pendiente', ultimo_error = $2,
                    fecha_programada = CURRENT_TIMESTAMP + ($3 || ' minutes')::interval
              WHERE id = $1`,
            [r.id, motivo, String(REINTENTO_MIN)]
          );
          res.reintentos += 1;
        }
        await registrar(r.canal, r.telefono_destino, 'recordatorio_turno', r.mensaje_personalizado, 'error', motivo);
      }
    }
    return res;
  } finally {
    corriendo = false;
  }
}

// Arranca el reloj (una sola vez). No frena el cierre del proceso.
function iniciar() {
  if (timer) return;
  const pasada = () => procesarPendientes().catch((e) => console.error('[recordatorios] error en la pasada:', e.message));
  setTimeout(pasada, PRIMERA_PASADA_MS).unref();
  timer = setInterval(pasada, INTERVALO_MS);
  timer.unref();
  console.log('[recordatorios] programador activo (cada 5 minutos).');
}

function detener() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { iniciar, detener, procesarPendientes, canalesListos };
