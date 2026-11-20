// =====================================================================
// Recordatorios de turnos / controles: programar avisos automáticos para
// que el cliente vuelva (ej: "dentro de 2 meses" -> avisar 1 mes, 2 semanas,
// 1 semana y 4 días antes). El envío lo hace services/reminderScheduler.
// =====================================================================
const { pool, query } = require('../config/db');
const util = require('../services/recordatoriosUtil');
const { procesarPendientes } = require('../services/reminderScheduler');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS = ['pendiente', 'enviando', 'enviado', 'fallido', 'cancelado'];
const MAX_AVISOS = 8;
const MAX_MENSAJE = 600;
const MAX_ANIOS = 3;

const uuidOrNull = (v) => (typeof v === 'string' && UUID_RE.test(v) ? v : null);
const err400 = (res, error, extra = {}) => res.status(400).json({ error, ...extra });

// POST /api/notificaciones/recordatorios
// Body: { nombre?, telefono?, fecha_evento? (YYYY-MM-DD), turno_id?, cliente_id?, sucursal_id?,
//         anticipaciones: ['1_mes','2_semanas','1_semana','4_dias'], dias_personalizados?: [10, 3],
//         mensaje? (admite {nombre} {fecha} {local}), canal?: 'whatsapp' | 'telegram' }
// Con turno_id, lo que falte (nombre, teléfono, fecha, sucursal) se toma del turno.
async function crear(req, res) {
  const b = req.body || {};
  for (const campo of ['turno_id', 'cliente_id', 'sucursal_id']) {
    if (b[campo] && !uuidOrNull(b[campo])) return err400(res, `${campo} inválido`);
  }
  const canal = b.canal === 'telegram' ? 'telegram' : 'whatsapp';

  try {
    // 1) Datos del turno (si viene) para completar lo que falte
    let turno = null;
    if (b.turno_id) {
      const t = await query(
        `SELECT t.*, u.nombre_completo AS cliente_nombre
           FROM turnos t LEFT JOIN usuarios u ON u.id = t.cliente_id WHERE t.id = $1`,
        [b.turno_id]
      );
      if (t.rowCount === 0) return res.status(404).json({ error: 'Turno no encontrado' });
      turno = t.rows[0];
    }
    const clienteId = b.cliente_id || turno?.cliente_id || null;
    const sucursalId = b.sucursal_id || turno?.sucursal_id || null;

    // 2) Nombre y teléfono
    let nombre = String(b.nombre || turno?.cliente_nombre || turno?.nombre_contacto || '').trim().slice(0, 150);
    if (!nombre && clienteId) {
      const u = await query('SELECT nombre_completo FROM usuarios WHERE id = $1', [clienteId]);
      nombre = u.rows[0]?.nombre_completo || '';
    }
    if (!nombre) return err400(res, 'Falta el nombre del cliente');
    const telefono = util.normalizarTelefono(b.telefono || turno?.telefono_contacto);
    if (!telefono) {
      return err400(res, 'El teléfono no es válido. Escribilo con código de área, por ejemplo 11 5555 1234.');
    }

    // 3) Fecha del control (tiene que ser futura y razonable)
    const fechaEvento = b.fecha_evento ? String(b.fecha_evento).trim() : (turno ? util.fechaISOArgentina(turno.fecha_hora) : '');
    const fe = util.parsearFechaISO(fechaEvento);
    if (!fe) return err400(res, 'Falta la fecha del control o no es válida (usá AAAA-MM-DD)');
    const hoy = util.fechaISOArgentina(new Date());
    if (fechaEvento <= hoy) return err400(res, 'La fecha del control tiene que ser posterior a hoy');
    if (fe.y > Number(hoy.slice(0, 4)) + MAX_ANIOS) return err400(res, `La fecha del control no puede estar a más de ${MAX_ANIOS} años`);

    // 4) Anticipaciones (fijas + días sueltos)
    const fijas = [...new Set(Array.isArray(b.anticipaciones) ? b.anticipaciones : [])];
    if (fijas.some((t) => !util.ANTICIPACIONES[t])) return err400(res, 'Alguna anticipación no es válida');
    const sueltos = [...new Set((Array.isArray(b.dias_personalizados) ? b.dias_personalizados : []).map(Number))];
    if (sueltos.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) {
      return err400(res, 'Los días personalizados tienen que ser números enteros entre 1 y 365');
    }
    const pedidos = [
      ...fijas.map((t) => ({ tipo: t, dias: null, etiqueta: util.ANTICIPACIONES[t].etiqueta })),
      ...sueltos.map((n) => ({ tipo: 'personalizado', dias: n, etiqueta: `${n} día${n === 1 ? '' : 's'} antes` })),
    ];
    if (pedidos.length === 0) return err400(res, 'Elegí al menos una anticipación');
    if (pedidos.length > MAX_AVISOS) return err400(res, `Máximo ${MAX_AVISOS} avisos por control`);

    // 5) Mensaje (el del doctor o el de siempre), ya con los datos puestos
    const personalizado = String(b.mensaje || '').trim();
    if (personalizado.length > MAX_MENSAJE) return err400(res, `El mensaje no puede pasar de ${MAX_MENSAJE} caracteres`);
    let local = null;
    if (sucursalId) {
      const s = await query('SELECT nombre FROM sucursales WHERE id = $1', [sucursalId]);
      local = s.rows[0]?.nombre || null;
    }
    const mensaje = util.armarMensaje(personalizado || util.MENSAJE_BASE, {
      nombre, fecha: util.fechaLarga(fechaEvento), local,
    });

    // 6) Cuándo sale cada aviso. Los que ya pasaron se informan, no se crean.
    const ahora = Date.now();
    const filas = [];
    const omitidos = [];
    pedidos.forEach((p) => {
      const cuando = util.fechaProgramada(fechaEvento, p.tipo, p.dias);
      if (!cuando || cuando.getTime() <= ahora) omitidos.push(p.etiqueta);
      else filas.push({ ...p, cuando });
    });
    if (filas.length === 0) {
      return err400(res, 'Con esas anticipaciones el aviso ya tendría que haber salido. Elegí una más corta o una fecha más lejana.', { omitidos });
    }

    // 7) Guardar (si ya existía el mismo aviso para ese teléfono y fecha, no se duplica)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const creados = [];
      for (const f of filas) {
        const r = await client.query(
          `INSERT INTO recordatorios_turnos
             (turno_id, usuario_id, sucursal_id, nombre_destino, telefono_destino, fecha_evento,
              fecha_programada, anticipacion_tipo, dias_antes, mensaje_personalizado, canal, creado_por)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT DO NOTHING
           RETURNING id, fecha_programada, anticipacion_tipo, dias_antes`,
          [b.turno_id || null, clienteId, sucursalId, nombre, telefono, fechaEvento, f.cuando.toISOString(),
           f.tipo, f.dias, mensaje, canal, req.user?.id || null]
        );
        if (r.rowCount) creados.push({ ...r.rows[0], etiqueta: f.etiqueta });
      }
      await client.query('COMMIT');
      return res.status(201).json({
        creados: creados.length,
        duplicados: filas.length - creados.length,
        omitidos,
        telefono,
        fecha_evento: fechaEvento,
        recordatorios: creados,
      });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  } catch (e) {
    if (e.code === '23503' || e.code === '22P02') return err400(res, 'El cliente, la sucursal o el turno elegido no existe');
    console.error('Error al crear recordatorios:', e);
    return res.status(500).json({ error: 'No se pudieron programar los recordatorios' });
  }
}

// GET /api/notificaciones/recordatorios?estado=&limit=
// Primero lo que está por salir (el más próximo arriba), después lo ya resuelto.
async function listar(req, res) {
  const estado = typeof req.query.estado === 'string' ? req.query.estado : '';
  if (estado && !ESTADOS.includes(estado)) return err400(res, 'estado inválido');
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
  const params = [];
  let where = '';
  if (estado) { params.push(estado); where = `WHERE r.estado = $${params.length}`; }
  params.push(limit);
  try {
    const r = await query(
      `SELECT r.id, r.turno_id, r.usuario_id, r.sucursal_id, s.nombre AS sucursal_nombre,
              r.nombre_destino, r.telefono_destino, to_char(r.fecha_evento, 'YYYY-MM-DD') AS fecha_evento,
              r.fecha_programada, r.anticipacion_tipo, r.dias_antes, r.mensaje_personalizado,
              r.canal, r.estado, r.intentos, r.ultimo_error, r.enviado_at, r.created_at
         FROM recordatorios_turnos r LEFT JOIN sucursales s ON s.id = r.sucursal_id
         ${where}
        ORDER BY CASE WHEN r.estado IN ('pendiente','enviando') THEN 0 ELSE 1 END,
                 CASE WHEN r.estado IN ('pendiente','enviando') THEN r.fecha_programada END ASC,
                 r.created_at DESC
        LIMIT $${params.length}`,
      params
    );
    return res.json({ recordatorios: r.rows });
  } catch (e) {
    console.error('Error al listar recordatorios:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/notificaciones/recordatorios/:id/cancelar
async function cancelar(req, res) {
  if (!uuidOrNull(req.params.id)) return err400(res, 'Id inválido');
  try {
    const r = await query(
      `UPDATE recordatorios_turnos SET estado = 'cancelado', ultimo_error = NULL
        WHERE id = $1 AND estado = 'pendiente' RETURNING id`,
      [req.params.id]
    );
    if (r.rowCount === 1) return res.json({ ok: true });
    const ex = await query('SELECT estado FROM recordatorios_turnos WHERE id = $1', [req.params.id]);
    if (ex.rowCount === 0) return res.status(404).json({ error: 'Recordatorio no encontrado' });
    return res.status(409).json({ error: `Ya no se puede cancelar: está ${ex.rows[0].estado}` });
  } catch (e) {
    console.error('Error al cancelar recordatorio:', e);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/notificaciones/recordatorios/procesar   (admin)
// Corre ahora la misma pasada que hace el reloj cada 5 minutos.
async function procesarAhora(req, res) {
  try {
    return res.json(await procesarPendientes());
  } catch (e) {
    console.error('Error al procesar recordatorios:', e);
    return res.status(500).json({ error: 'No se pudo procesar la cola de recordatorios' });
  }
}

module.exports = { crear, listar, cancelar, procesarAhora };
