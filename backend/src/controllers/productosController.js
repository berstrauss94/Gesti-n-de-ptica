// =====================================================================
// Controller de Productos (catálogo de inventario).
// Incluye recálculo de precio por margen y actualización masiva.
// =====================================================================

const { pool, query } = require('../config/db');

const COLS = `id, codigo, codigo_barras, nombre, categoria, marca, descripcion,
  genero, material, ubicacion, proveedor_id,
  costo_base, margen_pct, precio_venta, iva_pct, activo, metadatos,
  created_at, updated_at`;

// Atributos de filtro (tipo Optix). Las longitudes coinciden con las columnas.
const GENEROS = ['Hombre', 'Mujer', 'Unisex', 'Niño'];
const MAX_ATRIBUTO = { material: 40, ubicacion: 40 };

// Sin acentos y en minúscula, para comparar textos que vienen de planillas.
function sinAcentos(t) {
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// "mujer", "MUJER", "nino" -> el valor canónico de GENEROS (o null si no es uno).
function generoCanonico(t) {
  const n = sinAcentos(t);
  return GENEROS.find((g) => sinAcentos(g) === n) || null;
}

// Valida y normaliza genero/material/ubicacion/proveedor_id del body.
// Devuelve { datos } (solo las claves presentes; '' -> null) o { error }.
function atributos(b) {
  const datos = {};
  if (b.genero !== undefined) {
    const g = b.genero === null ? '' : String(b.genero).trim();
    const canonico = g ? generoCanonico(g) : null;
    if (g && !canonico) return { error: `Género inválido. Debe ser uno de: ${GENEROS.join(', ')}` };
    datos.genero = canonico;
  }
  for (const campo of ['material', 'ubicacion']) {
    if (b[campo] !== undefined) {
      const v = b[campo] === null ? '' : String(b[campo]).trim();
      if (v.length > MAX_ATRIBUTO[campo]) return { error: `${campo} admite hasta ${MAX_ATRIBUTO[campo]} caracteres` };
      datos[campo] = v || null;
    }
  }
  if (b.proveedor_id !== undefined) datos.proveedor_id = b.proveedor_id || null;
  return { datos };
}

function numOrNull(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// precio = costo * (1 + margen/100), redondeado a 2 decimales
function calcularPrecio(costo, margen) {
  const c = Number(costo) || 0;
  const m = Number(margen) || 0;
  return Math.round(c * (1 + m / 100) * 100) / 100;
}

// GET /api/productos  (filtros: q, categoria, codigo_barras)
async function listar(req, res) {
  const { q, categoria, codigo_barras, limit = 100, offset = 0 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const off = parseInt(offset, 10) || 0;
  const cond = [];
  const params = [];

  if (q) {
    params.push(`%${q}%`);
    cond.push(`(nombre ILIKE $${params.length} OR codigo ILIKE $${params.length} OR marca ILIKE $${params.length})`);
  }
  if (categoria) {
    params.push(categoria);
    cond.push(`categoria = $${params.length}`);
  }
  if (codigo_barras) {
    params.push(codigo_barras);
    cond.push(`codigo_barras = $${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim, off);

  try {
    const r = await query(
      `SELECT ${COLS} FROM productos ${where}
       ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    return res.json({ productos: r.rows, limit: lim, offset: off });
  } catch (err) {
    console.error('Error al listar productos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/productos/:id
async function obtener(req, res) {
  try {
    const r = await query(`SELECT ${COLS} FROM productos WHERE id = $1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.json({ producto: r.rows[0] });
  } catch (err) {
    console.error('Error al obtener producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/productos
async function crear(req, res) {
  const b = req.body || {};
  if (!b.codigo || !b.nombre || !b.categoria) {
    return res.status(400).json({ error: 'codigo, nombre y categoria son obligatorios' });
  }
  const costo = numOrNull(b.costo_base) ?? 0;
  const margen = numOrNull(b.margen_pct) ?? 0;
  // Si mandan precio_venta explícito lo respetamos; si no, lo calculamos.
  const precio = numOrNull(b.precio_venta) ?? calcularPrecio(costo, margen);
  const iva = numOrNull(b.iva_pct) ?? 21;
  const { datos: attr, error: errAttr } = atributos(b);
  if (errAttr) return res.status(400).json({ error: errAttr });

  try {
    const r = await query(
      `INSERT INTO productos
         (codigo, codigo_barras, nombre, categoria, marca, descripcion,
          costo_base, margen_pct, precio_venta, iva_pct,
          genero, material, ubicacion, proveedor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING ${COLS}`,
      [b.codigo, b.codigo_barras || null, b.nombre, b.categoria, b.marca || null,
       b.descripcion || null, costo, margen, precio, iva,
       attr.genero ?? null, attr.material ?? null, attr.ubicacion ?? null, attr.proveedor_id ?? null]
    );
    return res.status(201).json({ producto: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un producto con ese código o código de barras' });
    }
    if (err.code === '23514') {
      return res.status(400).json({ error: 'Categoría inválida' });
    }
    if (err.code === '23503' || err.code === '22P02') {
      return res.status(400).json({ error: 'El proveedor elegido no existe' });
    }
    console.error('Error al crear producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// PUT /api/productos/:id  (recalcula precio si cambian costo/margen y no se fija precio)
async function actualizar(req, res) {
  const b = req.body || {};
  const campos = [];
  const valores = [];
  const simples = ['codigo', 'codigo_barras', 'nombre', 'categoria', 'marca', 'descripcion'];
  simples.forEach((c) => {
    if (b[c] !== undefined) { valores.push(b[c]); campos.push(`${c} = $${valores.length}`); }
  });
  ['costo_base', 'margen_pct', 'iva_pct'].forEach((c) => {
    if (b[c] !== undefined) { valores.push(numOrNull(b[c])); campos.push(`${c} = $${valores.length}`); }
  });
  if (b.activo !== undefined) { valores.push(Boolean(b.activo)); campos.push(`activo = $${valores.length}`); }
  const { datos: attr, error: errAttr } = atributos(b);
  if (errAttr) return res.status(400).json({ error: errAttr });
  Object.entries(attr).forEach(([c, v]) => { valores.push(v); campos.push(`${c} = $${valores.length}`); });

  // precio: explícito o recalculado a partir de costo/margen enviados
  if (b.precio_venta !== undefined) {
    valores.push(numOrNull(b.precio_venta)); campos.push(`precio_venta = $${valores.length}`);
  } else if (b.costo_base !== undefined || b.margen_pct !== undefined) {
    try {
      const actual = await query('SELECT costo_base, margen_pct FROM productos WHERE id = $1', [req.params.id]);
      if (actual.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
      const costo = b.costo_base !== undefined ? Number(b.costo_base) : Number(actual.rows[0].costo_base);
      const margen = b.margen_pct !== undefined ? Number(b.margen_pct) : Number(actual.rows[0].margen_pct);
      valores.push(calcularPrecio(costo, margen)); campos.push(`precio_venta = $${valores.length}`);
    } catch (e) { /* ignora, se actualiza sin recalcular */ }
  }

  if (campos.length === 0) return res.status(400).json({ error: 'Nada para actualizar' });
  valores.push(req.params.id);

  try {
    const r = await query(
      `UPDATE productos SET ${campos.join(', ')} WHERE id = $${valores.length} RETURNING ${COLS}`,
      valores
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.json({ producto: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Código o código de barras duplicado' });
    if (err.code === '23503' || err.code === '22P02') return res.status(400).json({ error: 'El proveedor elegido no existe' });
    console.error('Error al actualizar producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/productos/recalcular-precios
// Actualización masiva de precios por margen. Body:
//   { categoria?: 'armazon', margen_pct: 50 }  -> aplica ese margen y recalcula
async function recalcularMasivo(req, res) {
  const margen = numOrNull(req.body?.margen_pct);
  const categoria = req.body?.categoria || null;
  if (margen === null) {
    return res.status(400).json({ error: 'margen_pct es obligatorio' });
  }
  try {
    const params = [margen];
    let where = '';
    if (categoria) { params.push(categoria); where = `WHERE categoria = $2`; }
    const r = await query(
      `UPDATE productos
       SET margen_pct = $1,
           precio_venta = ROUND(costo_base * (1 + $1/100.0), 2)
       ${where}
       RETURNING id`,
      params
    );
    return res.json({ actualizados: r.rowCount });
  } catch (err) {
    console.error('Error en recálculo masivo:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// DELETE /api/productos/:id
async function eliminar(req, res) {
  try {
    const r = await query('DELETE FROM productos WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Producto no encontrado' });
    return res.status(204).send();
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/productos/importar
// Importa/actualiza una lista de precios de proveedor. El frontend parsea el
// CSV y envía las filas ya normalizadas.
// Body: {
//   filas: [{ codigo, nombre?, categoria?, marca?, costo_base?, margen_pct?, precio_venta?,
//             genero?, material?, ubicacion?, proveedor? (nombre) | proveedor_id? }],
//   crear_nuevos?: boolean   // si un código no existe, ¿crearlo? (default true)
// }
// Match por `codigo`. Si viene costo/margen sin precio explícito, recalcula precio.
// Atributos: una celda vacía NO borra lo guardado; solo se pisa lo que trae valor.
// El proveedor se busca por nombre (sin distinguir mayúsculas ni acentos) entre
// los proveedores activos; desde la planilla no se crean proveedores nuevos.
// Cada fila corre en su propio SAVEPOINT: si una falla se descarta solo esa
// fila y el resto de la importación sigue.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mensajeErrorFila(e) {
  if (e.code === '23514') return 'Categoría inválida';
  if (e.code === '23505') return 'Código o código de barras duplicado';
  if (e.code === '22003') return 'Algún número está fuera de rango';
  if (e.code === '22001') return 'Algún texto supera el largo permitido';
  if (e.code === '22P02') return 'Algún valor tiene formato inválido';
  return 'No se pudo guardar';
}

async function importar(req, res) {
  const b = req.body || {};
  const filas = Array.isArray(b.filas) ? b.filas : [];
  const crearNuevos = b.crear_nuevos !== false;
  if (filas.length === 0) {
    return res.status(400).json({ error: 'No se recibieron filas para importar' });
  }
  if (filas.length > 5000) {
    return res.status(400).json({ error: 'La lista supera el máximo de 5000 filas por importación' });
  }
  const resumen = { actualizados: 0, creados: 0, errores: [] };
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Proveedores activos, para resolver la columna "proveedor" por nombre.
    const provs = await client.query(
      `SELECT id, nombre FROM proveedores WHERE tipo = 'proveedor' AND activo = TRUE`
    );
    const provPorNombre = new Map(provs.rows.map((p) => [sinAcentos(p.nombre), p.id]));
    const provIds = new Set(provs.rows.map((p) => String(p.id).toLowerCase()));

    for (let i = 0; i < filas.length; i += 1) {
      const f = filas[i] || {};
      const fila = i + 1;
      const codigo = String(f.codigo || '').trim();
      if (!codigo) { resumen.errores.push({ fila, error: 'Sin código' }); continue; }

      // Atributos: solo los que traen valor (celda vacía = no tocar).
      const conValor = {};
      ['genero', 'material', 'ubicacion'].forEach((c) => {
        if (f[c] !== undefined && f[c] !== null && String(f[c]).trim() !== '') conValor[c] = f[c];
      });
      const { datos: attr, error: errAttr } = atributos(conValor);
      if (errAttr) { resumen.errores.push({ fila, codigo, error: errAttr }); continue; }

      const provId = String(f.proveedor_id ?? '').trim().toLowerCase();
      const provNombre = String(f.proveedor ?? '').trim();
      if (provId) {
        if (!UUID_RE.test(provId) || !provIds.has(provId)) {
          resumen.errores.push({ fila, codigo, error: 'El proveedor indicado no existe' });
          continue;
        }
        attr.proveedor_id = provId;
      } else if (provNombre) {
        const id = provPorNombre.get(sinAcentos(provNombre));
        if (!id) {
          resumen.errores.push({ fila, codigo, error: `Proveedor "${provNombre}" no encontrado (cargalo primero en Compras)` });
          continue;
        }
        attr.proveedor_id = id;
      }

      const costo = numOrNull(f.costo_base);
      const margen = numOrNull(f.margen_pct);
      const precioExplicito = numOrNull(f.precio_venta);

      await client.query('SAVEPOINT fila');
      try {
        // ¿Existe el producto por código?
        const ex = await client.query('SELECT id, costo_base, margen_pct FROM productos WHERE codigo = $1', [codigo]);
        if (ex.rowCount > 0) {
          const actual = ex.rows[0];
          const nuevoCosto = costo ?? Number(actual.costo_base);
          const nuevoMargen = margen ?? Number(actual.margen_pct);
          const nuevoPrecio = precioExplicito ?? calcularPrecio(nuevoCosto, nuevoMargen);
          const sets = ['costo_base = $1', 'margen_pct = $2', 'precio_venta = $3', 'updated_at = CURRENT_TIMESTAMP'];
          const vals = [nuevoCosto, nuevoMargen, nuevoPrecio];
          if (f.nombre) { vals.push(f.nombre); sets.push(`nombre = $${vals.length}`); }
          if (f.marca) { vals.push(f.marca); sets.push(`marca = $${vals.length}`); }
          Object.entries(attr).forEach(([c, v]) => { vals.push(v); sets.push(`${c} = $${vals.length}`); });
          vals.push(actual.id);
          await client.query(`UPDATE productos SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
          resumen.actualizados += 1;
        } else if (crearNuevos) {
          if (!f.nombre) {
            resumen.errores.push({ fila, codigo, error: 'Producto nuevo sin nombre' });
          } else {
            const c = costo ?? 0;
            const m = margen ?? 0;
            const precio = precioExplicito ?? calcularPrecio(c, m);
            await client.query(
              `INSERT INTO productos
                 (codigo, nombre, categoria, marca, costo_base, margen_pct, precio_venta, iva_pct,
                  genero, material, ubicacion, proveedor_id)
               VALUES ($1,$2,$3,$4,$5,$6,$7,21,$8,$9,$10,$11)`,
              [codigo, f.nombre, f.categoria || 'otro', f.marca || null, c, m, precio,
               attr.genero ?? null, attr.material ?? null, attr.ubicacion ?? null, attr.proveedor_id ?? null]
            );
            resumen.creados += 1;
          }
        } else {
          resumen.errores.push({ fila, codigo, error: 'No existe y no se permite crear nuevos' });
        }
        await client.query('RELEASE SAVEPOINT fila');
      } catch (e) {
        // Descarta solo esta fila: la transacción sigue válida para las demás.
        await client.query('ROLLBACK TO SAVEPOINT fila');
        resumen.errores.push({ fila, codigo, error: mensajeErrorFila(e) });
      }
    }
    await client.query('COMMIT');
    return res.json(resumen);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error al importar lista de precios:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

module.exports = { listar, obtener, crear, actualizar, recalcularMasivo, eliminar, importar };
