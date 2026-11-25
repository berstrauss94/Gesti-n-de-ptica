// =====================================================================
// Controller de Sobres / Órdenes de trabajo óptica.
// El Sobre une paciente + receta (lejos/cerca por ojo) + armazón + cristal
// + médico + obra social + fecha de entrega. Es la orden central del taller.
//
// Etapa 1 (Optix): médico relacional, curva base (C.Base) y DEG por ojo,
// armazón de cerca, armazón propio del cliente, antropometría (DNP/AP),
// cotas del armazón y datos de laboratorio.
// Etapa 2: lente de lejos y de cerca elegidos del catálogo "Lentes y otros"
// (con descripción y precio copiados al sobre), precios de armazones,
// ítems adicionales, descuento, recargo y pagos. El total y el saldo se
// calculan acá (services/sobreTotales.js); el total ya no se carga a mano.
// =====================================================================

const { pool, query } = require('../config/db');
const { calcularTotales } = require('../services/sobreTotales');

// Campos de importes: si el body trae alguno (o items/pagos), el total se recalcula.
const CAMPOS_FINANZAS = [
  'lente_lejos_id', 'lente_lejos_descripcion', 'lente_lejos_precio',
  'lente_cerca_id', 'lente_cerca_descripcion', 'lente_cerca_precio',
  'armazon_lejos_precio', 'armazon_cerca_precio',
  'descuento_tipo', 'descuento_valor', 'recargo',
];

// Campos de receta y datos editables del sobre (todos opcionales salvo sucursal).
// armazon_producto_id = armazón de LEJOS (columna original).
const CAMPOS = [
  'cliente_id', 'venta_id', 'obra_social_id', 'medico', 'medico_id', 'fecha_receta', 'fecha_entrega', 'estado',
  'lejos_od_esf', 'lejos_od_cil', 'lejos_od_eje', 'lejos_od_add', 'lejos_od_prisma', 'lejos_od_base', 'lejos_od_diam', 'lejos_od_cbase',
  'lejos_oi_esf', 'lejos_oi_cil', 'lejos_oi_eje', 'lejos_oi_add', 'lejos_oi_prisma', 'lejos_oi_base', 'lejos_oi_diam', 'lejos_oi_cbase',
  'cerca_od_esf', 'cerca_od_cil', 'cerca_od_eje', 'cerca_od_prisma', 'cerca_od_base', 'cerca_od_diam', 'cerca_od_cbase', 'cerca_od_deg',
  'cerca_oi_esf', 'cerca_oi_cil', 'cerca_oi_eje', 'cerca_oi_prisma', 'cerca_oi_base', 'cerca_oi_diam', 'cerca_oi_cbase', 'cerca_oi_deg',
  'dip', 'dnp_od', 'dnp_oi', 'ap_od', 'ap_oi',
  'armazon_producto_id', 'armazon_lejos_es_propio', 'armazon_cerca_producto_id', 'armazon_cerca_es_propio',
  'armazon_descripcion', 'cristal_descripcion',
  'arm_vertical', 'arm_horizontal', 'arm_diagonal', 'arm_puente', 'arm_distancia_vertice',
  'arm_ff', 'arm_pantoscopico', 'arm_angulo_facial',
  'laboratorio_id', 'codigo_pedido_garantia', 'observacion_lab',
  'notas', 'total',
  ...CAMPOS_FINANZAS,
];

const BOOLEANOS = ['armazon_lejos_es_propio', 'armazon_cerca_es_propio'];
const IMPORTES = ['lente_lejos_precio', 'lente_cerca_precio', 'armazon_lejos_precio', 'armazon_cerca_precio', 'descuento_valor', 'recargo'];
const DESCUENTOS = ['porcentaje', 'monto'];
const MEDIOS_PAGO = ['Efectivo', 'Tarjeta de Credito', 'Tarjeta de Debito', 'Q.R.', 'Transferencia', 'Cuenta Corriente'];
const MAX_FILAS = 50;
const MAX_IMPORTE = 9999999999.99; // NUMERIC(12,2)

// 'lentes' = lentes recibidos del laboratorio; 'listo' = armado y listo para entrega.
// La base ya no restringe el estado: esta lista es la única validación.
const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'lentes', 'listo', 'entregado', 'anulado'];

// Columnas descriptivas que se suman al leer un sobre (nombres para la UI).
const SELECT_DETALLE = `
  SELECT s.*, u.nombre_completo AS cliente_nombre, u.dni AS cliente_dni,
         os.nombre AS obra_social_nombre, suc.nombre AS sucursal_nombre,
         m.nombre AS medico_nombre, m.matricula AS medico_matricula,
         pl.nombre AS armazon_lejos_nombre, pl.codigo AS armazon_lejos_codigo,
         pc.nombre AS armazon_cerca_nombre, pc.codigo AS armazon_cerca_codigo,
         lab.nombre AS laboratorio_nombre
  FROM sobres s
  LEFT JOIN usuarios u ON u.id = s.cliente_id
  LEFT JOIN obras_sociales os ON os.id = s.obra_social_id
  LEFT JOIN sucursales suc ON suc.id = s.sucursal_id
  LEFT JOIN medicos m ON m.id = s.medico_id
  LEFT JOIN productos pl ON pl.id = s.armazon_producto_id
  LEFT JOIN productos pc ON pc.id = s.armazon_cerca_producto_id
  LEFT JOIN proveedores lab ON lab.id = s.laboratorio_id`;

// Normaliza un valor del body: '' -> null; booleanos de checkbox -> boolean.
function normalizar(campo, valor) {
  if (valor === '') return null;
  if (BOOLEANOS.includes(campo)) {
    if (valor === null) return false;
    return valor === true || valor === 'true';
  }
  return valor;
}

// Número con punto o coma; '' / null -> null; inválido -> NaN.
function numero(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
const importeValido = (n) => n !== null && !Number.isNaN(n) && n >= 0 && n <= MAX_IMPORTE;
const textoCorto = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max));

// Valida importes, descuento, ítems y pagos. Devuelve un mensaje de error o null.
// Deja en b los ítems y pagos ya limpios (b._items / b._pagos).
function validarFinanzas(b) {
  for (const c of IMPORTES) {
    if (b[c] === undefined) continue;
    const n = numero(b[c]);
    if (n !== null && !importeValido(n)) return `${c} debe ser un importe mayor o igual a 0`;
  }
  if (b.descuento_tipo !== undefined && b.descuento_tipo !== null && b.descuento_tipo !== ''
    && !DESCUENTOS.includes(b.descuento_tipo)) {
    return 'descuento_tipo debe ser "porcentaje" o "monto" (o vacío para sin descuento)';
  }
  if (b.descuento_tipo === 'porcentaje' && numero(b.descuento_valor) > 100) {
    return 'El descuento en porcentaje no puede pasar de 100';
  }
  for (const c of ['lente_lejos_id', 'lente_cerca_id']) {
    if (b[c] === undefined || b[c] === null || b[c] === '') continue;
    if (!Number.isInteger(Number(b[c])) || Number(b[c]) <= 0) return `${c} debe ser un código del catálogo`;
  }

  if (b.items !== undefined) {
    if (!Array.isArray(b.items)) return 'items debe ser una lista';
    if (b.items.length > MAX_FILAS) return `Se admiten hasta ${MAX_FILAS} ítems por sobre`;
    const items = [];
    for (const [i, it] of b.items.entries()) {
      const descripcion = textoCorto(it?.descripcion, 200);
      const precio = numero(it?.precio);
      if (!descripcion) return `El ítem ${i + 1} no tiene descripción`;
      if (!importeValido(precio)) return `El ítem ${i + 1} tiene un precio inválido`;
      const dias = numero(it?.dias_demora);
      const cat = numero(it?.catalogo_id);
      if (dias !== null && (!Number.isInteger(dias) || dias < 0)) return `El ítem ${i + 1} tiene días de demora inválidos`;
      if (cat !== null && (!Number.isInteger(cat) || cat <= 0)) return `El ítem ${i + 1} tiene un código de catálogo inválido`;
      items.push({ descripcion, precio, dias_demora: dias ?? 0, catalogo_id: cat, orden: i });
    }
    b._items = items;
  }

  if (b.pagos !== undefined) {
    if (!Array.isArray(b.pagos)) return 'pagos debe ser una lista';
    if (b.pagos.length > MAX_FILAS) return `Se admiten hasta ${MAX_FILAS} pagos por sobre`;
    const pagos = [];
    for (const [i, p] of b.pagos.entries()) {
      const importe = numero(p?.importe);
      if (!importeValido(importe) || importe === 0) return `El pago ${i + 1} tiene un importe inválido`;
      if (!MEDIOS_PAGO.includes(p?.medio_pago)) return `El pago ${i + 1} tiene un medio de pago inválido. Opciones: ${MEDIOS_PAGO.join(', ')}`;
      let fecha = null;
      if (p?.fecha) {
        const d = new Date(p.fecha);
        if (Number.isNaN(d.getTime())) return `El pago ${i + 1} tiene una fecha inválida`;
        fecha = d.toISOString();
      }
      pagos.push({ importe, medio_pago: p.medio_pago, detalle: textoCorto(p?.detalle, 150) || null, fecha });
    }
    b._pagos = pagos;
  }
  return null;
}

const tocaFinanzas = (b) => CAMPOS_FINANZAS.some((c) => b[c] !== undefined) || b.items !== undefined || b.pagos !== undefined;

// Traduce errores de PostgreSQL a mensajes claros (null si no es conocido).
function errorConocido(err) {
  if (err.code === '23514') return 'Algún valor viola las validaciones (ejes 0-180, importes negativos, etc.)';
  if (err.code === '23503') return 'Alguna referencia no existe (paciente, médico, armazón, lente, laboratorio u obra social)';
  if (err.code === '22P02') return 'Hay un valor con formato inválido (número o identificador)';
  if (err.code === '22003') return 'Algún número está fuera de rango';
  if (err.code === '22001') return 'Algún texto supera el largo permitido';
  return null;
}

// Reemplaza ítems y pagos del sobre (si vinieron) y recalcula el total. Usa la conexión de la transacción.
async function guardarFinanzas(cli, sobreId, b) {
  if (b._items) {
    await cli.query('DELETE FROM sobre_items_adicionales WHERE sobre_id = $1', [sobreId]);
    for (const it of b._items) {
      await cli.query(
        `INSERT INTO sobre_items_adicionales (sobre_id, descripcion, precio, dias_demora, catalogo_id, orden)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [sobreId, it.descripcion, it.precio, it.dias_demora, it.catalogo_id, it.orden]
      );
    }
  }
  if (b._pagos) {
    await cli.query('DELETE FROM sobre_pagos WHERE sobre_id = $1', [sobreId]);
    for (const p of b._pagos) {
      await cli.query(
        `INSERT INTO sobre_pagos (sobre_id, fecha, detalle, importe, medio_pago)
         VALUES ($1, COALESCE($2::timestamptz, CURRENT_TIMESTAMP), $3, $4, $5)`,
        [sobreId, p.fecha, p.detalle, p.importe, p.medio_pago]
      );
    }
  }
  const s = await cli.query('SELECT * FROM sobres WHERE id = $1', [sobreId]);
  const items = await cli.query('SELECT precio FROM sobre_items_adicionales WHERE sobre_id = $1', [sobreId]);
  const t = calcularTotales(s.rows[0], items.rows, []);
  await cli.query('UPDATE sobres SET total = $1 WHERE id = $2', [t.total, sobreId]);
}

// Sobre con nombres, ítems, pagos y totales calculados.
async function detalle(id) {
  const r = await query(`${SELECT_DETALLE} WHERE s.id = $1`, [id]);
  if (r.rowCount === 0) return null;
  const items = await query(
    `SELECT id, descripcion, precio, dias_demora, catalogo_id FROM sobre_items_adicionales
      WHERE sobre_id = $1 ORDER BY orden ASC NULLS LAST, id`, [id]
  );
  const pagos = await query(
    'SELECT id, fecha, detalle, importe, medio_pago FROM sobre_pagos WHERE sobre_id = $1 ORDER BY fecha, id', [id]
  );
  const sobre = r.rows[0];
  return { ...sobre, items: items.rows, pagos: pagos.rows, totales: calcularTotales(sobre, items.rows, pagos.rows) };
}

// Ejecuta fn(cli) dentro de una transacción.
async function enTransaccion(fn) {
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const out = await fn(cli);
    await cli.query('COMMIT');
    return out;
  } catch (err) {
    try { await cli.query('ROLLBACK'); } catch { /* conexión caída */ }
    throw err;
  } finally {
    cli.release();
  }
}

// GET /api/sobres?estado=&cliente_id=&sucursal_id=&desde=&hasta=
async function listar(req, res) {
  const { estado, cliente_id, sucursal_id, desde, hasta, limit = 200 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 200, 1000);
  const cond = [];
  const params = [];
  if (estado) { params.push(estado); cond.push(`s.estado = $${params.length}`); }
  if (cliente_id) { params.push(cliente_id); cond.push(`s.cliente_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`s.sucursal_id = $${params.length}`); }
  if (desde) { params.push(desde); cond.push(`s.created_at::date >= $${params.length}`); }
  if (hasta) { params.push(hasta); cond.push(`s.created_at::date <= $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `${SELECT_DETALLE}
       ${where}
       ORDER BY s.created_at DESC LIMIT $${params.length}`,
      params
    );
    return res.json({ sobres: r.rows });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al listar sobres:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/sobres/:id  -> incluye items, pagos y totales
async function obtener(req, res) {
  try {
    const sobre = await detalle(req.params.id);
    if (!sobre) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al obtener sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/sobres   (+ items[], pagos[] opcionales)
async function crear(req, res) {
  const b = req.body || {};
  if (!b.sucursal_id) return res.status(400).json({ error: 'sucursal_id es obligatorio' });
  if (b.estado && !ESTADOS.includes(b.estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  const errFin = validarFinanzas(b);
  if (errFin) return res.status(400).json({ error: errFin });

  const columnas = ['sucursal_id'];
  const valores = [b.sucursal_id];
  CAMPOS.forEach((c) => {
    if (b[c] !== undefined && b[c] !== '') { columnas.push(c); valores.push(normalizar(c, b[c])); }
  });
  const placeholders = valores.map((_, i) => `$${i + 1}`);
  try {
    const id = await enTransaccion(async (cli) => {
      const r = await cli.query(
        `INSERT INTO sobres (${columnas.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
        valores
      );
      const nuevoId = r.rows[0]?.id;
      if (!nuevoId) throw Object.assign(new Error('sin id'), { sinFila: true });
      if (tocaFinanzas(b)) await guardarFinanzas(cli, nuevoId, b);
      return nuevoId;
    });
    return res.status(201).json({ sobre: await detalle(id) });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al crear sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/sobres/:id  (actualización parcial; items[] y pagos[] reemplazan los anteriores)
async function actualizar(req, res) {
  const b = req.body || {};
  if (b.estado !== undefined && !ESTADOS.includes(b.estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  const errFin = validarFinanzas(b);
  if (errFin) return res.status(400).json({ error: errFin });

  const campos = [];
  const valores = [];
  CAMPOS.forEach((c) => {
    if (b[c] !== undefined) { valores.push(normalizar(c, b[c])); campos.push(`${c} = $${valores.length}`); }
  });
  if (campos.length === 0 && b.items === undefined && b.pagos === undefined) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }
  try {
    const existe = await enTransaccion(async (cli) => {
      if (campos.length) {
        valores.push(req.params.id);
        const r = await cli.query(
          `UPDATE sobres SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING id`,
          valores
        );
        if (r.rowCount === 0) return false;
      } else {
        const r = await cli.query('SELECT id FROM sobres WHERE id = $1', [req.params.id]);
        if (r.rowCount === 0) return false;
      }
      if (tocaFinanzas(b)) await guardarFinanzas(cli, req.params.id, b);
      return true;
    });
    if (!existe) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre: await detalle(req.params.id) });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al actualizar sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PATCH /api/sobres/:id/estado  { estado }
async function cambiarEstado(req, res) {
  const { estado } = req.body || {};
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido. Debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  try {
    const r = await query('UPDATE sobres SET estado = $1 WHERE id = $2 RETURNING *', [estado, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ sobre: r.rows[0] });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al cambiar estado del sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/sobres/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM sobres WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Sobre no encontrado' });
    return res.json({ ok: true });
  } catch (err) {
    const msg = errorConocido(err);
    if (msg) return res.status(400).json({ error: msg });
    console.error('Error al eliminar sobre:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, obtener, crear, actualizar, cambiarEstado, eliminar, MEDIOS_PAGO };
