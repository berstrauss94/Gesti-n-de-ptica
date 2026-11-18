// =====================================================================
// Catálogo de lentes y servicios de laboratorio ("Lentes y otros").
//  - Listar con búsqueda parcial (por palabras) y filtro de categoría.
//  - Validar si una graduación entra en el rango de un cristal.
//  - Importar la lista (CSV desde el front) y ajustar precios en bloque.
// =====================================================================
const { pool, query } = require('../config/db');

// Categorías de la lista de laboratorio (el número ordena el menú).
const CATEGORIAS = [
  '0 CONTROL DE MIOPÍA', '1 MONOFOCALES', '2 MONOFOCAL DIGITAL', '3 BIFOCALES',
  '4 OCUPACIONALES', '5 PROGRESIVOS', '6 PROGRESIVOS VARILUX', '7 CONTACTOLOGIA',
  '8 MULTIPROPOSITOS-GOTAS', '9 TRATAMIENTOS Y SERVICIOS', '10 ACCESORIOS', '11 LENTES DE SOL',
];
const MAX_FILAS_IMPORTAR = 5000;
const MAX_ITEMS = 2000;

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const clave = (t) => sinAcentos(t).toLowerCase().replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim();
const CANON = new Map(CATEGORIAS.map((c) => [clave(c), c]));
// "monofocales" o "1 Monofocales" -> "1 MONOFOCALES"; si no es conocida se deja tal cual.
function categoriaCanonica(t) {
  const x = String(t || '').trim();
  return CANON.get(clave(x)) || x;
}
const escaparLike = (t) => String(t).replace(/[\\%_]/g, '\\$&');

// Número con coma o punto; '' / null -> null; texto inválido -> NaN.
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}
function bool(v) {
  return v === true || ['1', 'true', 'si', 'sí', 's', 'x'].includes(String(v || '').trim().toLowerCase());
}

// GET /api/laboratorio/catalogo?categoria=&q=
async function listar(req, res) {
  try {
    const categoria = typeof req.query.categoria === 'string' ? req.query.categoria.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const cond = ['activo = TRUE'];
    const params = [];
    if (categoria) { params.push(categoria); cond.push(`LOWER(categoria) = LOWER($${params.length})`); }
    q.split(/\s+/).filter(Boolean).slice(0, 8).forEach((t) => {
      params.push(`%${escaparLike(t)}%`);
      const n = params.length;
      cond.push(`(descripcion ILIKE $${n} OR subcategoria_grupo ILIKE $${n} OR marca_proveedor ILIKE $${n} OR id::text ILIKE $${n})`);
    });
    params.push(MAX_ITEMS);
    const r = await query(
      `SELECT * FROM catalogo_laboratorio WHERE ${cond.join(' AND ')}
       ORDER BY subcategoria_grupo ASC NULLS LAST, id ASC LIMIT $${params.length}`,
      params
    );
    return res.json({ status: 'success', count: r.rows.length, data: r.rows });
  } catch (err) {
    console.error('Error al listar catálogo de laboratorio:', err);
    return res.status(500).json({ status: 'error', error: 'Error interno del servidor' });
  }
}

// GET /api/laboratorio/categorias -> cantidad de ítems por categoría
async function categorias(req, res) {
  try {
    const r = await query(
      `SELECT categoria, COUNT(*)::int AS cantidad FROM catalogo_laboratorio
        WHERE activo = TRUE GROUP BY categoria ORDER BY categoria ASC`
    );
    return res.json({ categorias: r.rows });
  } catch (err) {
    console.error('Error al contar categorías de laboratorio:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/laboratorio/validar-receta  { cristal_id, esfera?, cilindro? }
async function validarReceta(req, res) {
  const b = req.body || {};
  const id = Number(b.cristal_id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ valid: false, error: 'cristal_id es obligatorio y debe ser un número' });
  }
  const esf = num(b.esfera);
  const cil = num(b.cilindro);
  if (Number.isNaN(esf) || Number.isNaN(cil)) {
    return res.status(400).json({ valid: false, error: 'La esfera y el cilindro deben ser números' });
  }
  try {
    const r = await query('SELECT * FROM catalogo_laboratorio WHERE id = $1 AND activo = TRUE', [id]);
    if (r.rowCount === 0) return res.status(404).json({ valid: false, error: 'Cristal no encontrado' });
    const c = r.rows[0];
    const alertas = [];
    const revisar = (valor, min, max, nombre) => {
      if (valor === null) return;
      if (min !== null && valor < Number(min)) alertas.push(`${nombre} ${valor} inferior al límite permitido (${min})`);
      if (max !== null && valor > Number(max)) alertas.push(`${nombre} ${valor} superior al límite permitido (${max})`);
    };
    revisar(esf, c.esfera_min, c.esfera_max, 'Esfera');
    revisar(cil, c.cilindro_min, c.cilindro_max, 'Cilindro');
    return res.json({ valid: alertas.length === 0, cristal: c.descripcion, dias_demora: c.dias_demora, alertas });
  } catch (err) {
    console.error('Error al validar receta:', err);
    return res.status(500).json({ error: 'Error al procesar la validación' });
  }
}

// PUT /api/laboratorio/actualizacion-masiva   (admin)
// Body: { porcentaje, categoria?, marca_proveedor?, todo?, simular? }
// Sin categoría ni marca hace falta "todo: true". Con "simular: true" solo
// informa cuántos ítems cambian y cómo queda el total, sin tocar nada.
async function actualizacionMasiva(req, res) {
  const b = req.body || {};
  const pct = num(b.porcentaje);
  if (pct === null || !Number.isFinite(pct) || pct === 0 || pct < -90 || pct > 500) {
    return res.status(400).json({ error: 'El porcentaje debe ser un número distinto de 0, entre -90 y 500' });
  }
  const categoria = typeof b.categoria === 'string' ? b.categoria.trim() : '';
  const marca = typeof b.marca_proveedor === 'string' ? b.marca_proveedor.trim() : '';
  if (!categoria && !marca && b.todo !== true) {
    return res.status(400).json({ error: 'Elegí una categoría o una marca. Para ajustar todo el catálogo confirmalo con "todo".' });
  }
  const factor = 1 + pct / 100;
  const params = [factor];
  const cond = ['activo = TRUE'];
  if (categoria) { params.push(categoria); cond.push(`LOWER(categoria) = LOWER($${params.length})`); }
  if (marca) { params.push(marca); cond.push(`LOWER(marca_proveedor) = LOWER($${params.length})`); }
  const where = cond.join(' AND ');
  try {
    if (b.simular === true) {
      const r = await query(
        `SELECT COUNT(*)::int AS cantidad,
                COALESCE(ROUND(SUM(precio_lista), 2), 0) AS total_actual,
                COALESCE(ROUND(SUM(ROUND(precio_lista * $1, 2)), 2), 0) AS total_nuevo
           FROM catalogo_laboratorio WHERE ${where}`,
        params
      );
      return res.json({ status: 'success', simulacion: true, ...r.rows[0] });
    }
    const r = await query(
      `UPDATE catalogo_laboratorio
          SET precio_lista = ROUND(precio_lista * $1, 2), updated_at = CURRENT_TIMESTAMP
        WHERE ${where}`,
      params
    );
    return res.json({ status: 'success', registros_actualizados: r.rowCount });
  } catch (err) {
    console.error('Error en actualización masiva de laboratorio:', err);
    return res.status(500).json({ error: 'Error al actualizar precios' });
  }
}

// POST /api/laboratorio/importar   (admin)  { filas: [...] }
// Cada fila: { id?, categoria, subcategoria_grupo?, marca_proveedor?, descripcion,
//   esfera_min?, esfera_max?, cilindro_min?, cilindro_max?, badge_graduacion_raw?,
//   dias_demora?, precio_lista, es_servicio?, es_insumo_mostrador? }
// Con id actualiza (o crea con ese id); sin id crea. Una fila con error no corta el resto.
async function importar(req, res) {
  const filas = Array.isArray(req.body?.filas) ? req.body.filas : [];
  if (filas.length === 0) return res.status(400).json({ error: 'No hay filas para importar' });
  if (filas.length > MAX_FILAS_IMPORTAR) {
    return res.status(400).json({ error: `Máximo ${MAX_FILAS_IMPORTAR} filas por importación` });
  }
  const client = await pool.connect();
  const errores = [];
  let creados = 0;
  let actualizados = 0;
  try {
    await client.query('BEGIN');
    for (let i = 0; i < filas.length; i += 1) {
      const f = filas[i] || {};
      const fila = i + 1;
      const descripcion = String(f.descripcion || '').trim();
      const categoria = categoriaCanonica(f.categoria);
      const id = f.id === undefined || f.id === null || f.id === '' ? null : Number(f.id);
      const precio = num(f.precio_lista);
      const rango = [num(f.esfera_min), num(f.esfera_max), num(f.cilindro_min), num(f.cilindro_max)];
      const dias = num(f.dias_demora);
      if (!descripcion || !categoria) { errores.push({ fila, error: 'Faltan la categoría o la descripción' }); continue; }
      if (id !== null && (!Number.isInteger(id) || id <= 0)) { errores.push({ fila, error: 'El id debe ser un entero positivo' }); continue; }
      if (precio === null || !Number.isFinite(precio) || precio < 0) { errores.push({ fila, error: 'Precio inválido' }); continue; }
      if (rango.some((n) => Number.isNaN(n))) { errores.push({ fila, error: 'Esfera o cilindro inválidos' }); continue; }
      if (Number.isNaN(dias) || (dias !== null && (!Number.isInteger(dias) || dias < 0))) { errores.push({ fila, error: 'Días de demora inválidos' }); continue; }
      const vacio = (v) => v === undefined || v === null || v === '';
      const esServicio = vacio(f.es_servicio) ? null : bool(f.es_servicio);
      const esInsumo = vacio(f.es_insumo_mostrador) ? null : bool(f.es_insumo_mostrador);
      const valores = [
        categoria.slice(0, 100), f.subcategoria_grupo ? String(f.subcategoria_grupo).trim().slice(0, 100) : null,
        f.marca_proveedor ? String(f.marca_proveedor).trim().slice(0, 100) : null, descripcion.slice(0, 255),
        ...rango, f.badge_graduacion_raw ? String(f.badge_graduacion_raw).trim().slice(0, 150) : null,
        dias, precio, esServicio, esInsumo,
      ];
      await client.query('SAVEPOINT fila');
      try {
        const cols = 'categoria, subcategoria_grupo, marca_proveedor, descripcion, esfera_min, esfera_max, cilindro_min, cilindro_max, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador';
        // Alta: lo que no viene toma su valor por defecto.
        const vals = '$1::varchar,$2::varchar,$3::varchar,$4::varchar,$5::numeric,$6::numeric,$7::numeric,$8::numeric,$9::varchar,COALESCE($10::int,2),$11::numeric,COALESCE($12::boolean,FALSE),COALESCE($13::boolean,FALSE)';
        let r;
        if (id !== null) {
          // Actualizacion: una celda vacia NO pisa lo que ya estaba guardado.
          r = await client.query(
            `INSERT INTO catalogo_laboratorio (id, ${cols}) VALUES ($14, ${vals})
             ON CONFLICT (id) DO UPDATE SET
               categoria = EXCLUDED.categoria,
               subcategoria_grupo = COALESCE($2::varchar, catalogo_laboratorio.subcategoria_grupo),
               marca_proveedor = COALESCE($3::varchar, catalogo_laboratorio.marca_proveedor),
               descripcion = EXCLUDED.descripcion,
               esfera_min = COALESCE($5::numeric, catalogo_laboratorio.esfera_min),
               esfera_max = COALESCE($6::numeric, catalogo_laboratorio.esfera_max),
               cilindro_min = COALESCE($7::numeric, catalogo_laboratorio.cilindro_min),
               cilindro_max = COALESCE($8::numeric, catalogo_laboratorio.cilindro_max),
               badge_graduacion_raw = COALESCE($9::varchar, catalogo_laboratorio.badge_graduacion_raw),
               dias_demora = COALESCE($10::int, catalogo_laboratorio.dias_demora),
               precio_lista = EXCLUDED.precio_lista,
               es_servicio = COALESCE($12::boolean, catalogo_laboratorio.es_servicio),
               es_insumo_mostrador = COALESCE($13::boolean, catalogo_laboratorio.es_insumo_mostrador),
               activo = TRUE, updated_at = CURRENT_TIMESTAMP
             RETURNING (xmax = 0) AS creado`,
            [...valores, id]
          );
        } else {
          r = await client.query(
            `INSERT INTO catalogo_laboratorio (${cols}) VALUES (${vals}) RETURNING TRUE AS creado`,
            valores
          );
        }        await client.query('RELEASE SAVEPOINT fila');
        if (r.rows[0].creado) creados += 1; else actualizados += 1;
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT fila');
        errores.push({ fila, error: e.code === '22003' ? 'Algún valor numérico es demasiado grande' : 'No se pudo guardar la fila' });
      }
    }
    // Con ids explícitos la secuencia queda atrás: se alinea para que los próximos altas no choquen.
    await client.query(
      `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'),
              GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`
    );
    await client.query('COMMIT');
    return res.json({ status: 'success', creados, actualizados, errores });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Error al importar catálogo de laboratorio:', err);
    return res.status(500).json({ error: 'No se pudo importar la lista' });
  } finally {
    client.release();
  }
}

module.exports = { listar, categorias, validarReceta, actualizacionMasiva, importar, categoriaCanonica, CATEGORIAS };
