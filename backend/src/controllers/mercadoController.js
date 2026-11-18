// =====================================================================
// Controller del Catálogo de Mercado (enriquecido con IA).
// Dispara el agente que busca specs de un modelo y las guarda, y lista
// lo ya enriquecido. Alta/enriquecido: solo admin (definido en la ruta).
// =====================================================================

const { pool, query } = require('../config/db');
const { rastrearYEnriquecerModelo } = require('../services/mercadoGeminiService');
const { generoCanonico, sinAcentos } = require('./productosController');

// Largo máximo de marca/modelo (coincide con VARCHAR(120) de la tabla).
const MAX_TEXTO = 120;
// Umbral de similitud (pg_trgm) para el listado tolerante a errores de tipeo.
const UMBRAL_SIMILITUD = 0.35;

// Escapa % y _ para que no actúen como comodines en ILIKE.
function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

// POST /api/mercado/enriquecer  { marca?, modelo?, forzar? }
// Alcanza con enviar la marca, el modelo o ambos (completos o parciales).
async function enriquecer(req, res) {
  const { marca, modelo, forzar } = req.body || {};
  const textoValido = (v) => v === undefined || v === null || (typeof v === 'string' && v.length <= MAX_TEXTO);
  if (!textoValido(marca) || !textoValido(modelo)) {
    return res.status(400).json({
      error: 'Marca y modelo deben ser texto de hasta 120 caracteres',
      motivo: 'datos_invalidos',
    });
  }
  const r = await rastrearYEnriquecerModelo({ marca, modelo, forzar: forzar === true });
  if (!r.ok) {
    // 409 cuando es un tema de cuota/credenciales (no es error de nuestro server)
    const status = ['sin_credenciales', 'error_api'].includes(r.motivo) ? 409 : 400;
    return res.status(status).json({ error: 'No se pudo enriquecer el modelo', motivo: r.motivo, detalle: r.detalle });
  }
  // 200 si salió de la caché (sin gastar cuota de IA); 201 si se creó/actualizó.
  return res.status(r.cache ? 200 : 201).json({
    registro: r.registro,
    cache: Boolean(r.cache),
    coincidencia: r.coincidencia || null, // exacto | parcial | similar | ia
  });
}

// GET /api/mercado?q=
// Busca por texto parcial en marca o modelo (ILIKE). Si no hay resultados y
// el término tiene 3+ letras, reintenta por similitud (pg_trgm) para tolerar
// errores de tipeo ("Rayban" -> "Ray-Ban").
async function listar(req, res) {
  const { q, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const termino = typeof q === 'string' ? q.trim() : '';
  try {
    if (!termino) {
      const todo = await query(
        'SELECT * FROM mercado_catalogo ORDER BY actualizado_at DESC LIMIT $1',
        [lim]
      );
      return res.json({ catalogo: todo.rows });
    }

    const r = await query(
      `SELECT * FROM mercado_catalogo
        WHERE marca ILIKE $1 OR modelo ILIKE $1
        ORDER BY actualizado_at DESC LIMIT $2`,
      [`%${escaparLike(termino)}%`, lim]
    );
    if (r.rows.length > 0 || termino.length < 3) {
      return res.json({ catalogo: r.rows });
    }

    try {
      const sim = await query(
        `SELECT *, GREATEST(similarity(marca, $1), similarity(modelo, $1)) AS sim
           FROM mercado_catalogo
          WHERE similarity(marca, $1) >= $2 OR similarity(modelo, $1) >= $2
          ORDER BY sim DESC, actualizado_at DESC LIMIT $3`,
        [termino, UMBRAL_SIMILITUD, lim]
      );
      return res.json({ catalogo: sim.rows });
    } catch (err) {
      // pg_trgm no disponible: se devuelve vacío en lugar de romper.
      console.warn('Búsqueda por similitud omitida (pg_trgm):', err.message);
      return res.json({ catalogo: [] });
    }
  } catch (err) {
    console.error('Error al listar catálogo de mercado:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}


// GET /mercado/predict-attributes?marca=  (sin IA, sin costo)
// Sugiere genero/material segun lo mas frecuente en productos de esa marca
// y, si no hay datos, en el catalogo de mercado.
async function masFrecuente(tabla, col, marca) {
  const { rows } = await query(
    `SELECT ${col} AS valor FROM ${tabla}
      WHERE LOWER(marca) = LOWER($1) AND ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col} ORDER BY COUNT(*) DESC, ${col} ASC LIMIT 1`,
    [marca]
  );
  return rows[0] ? rows[0].valor : null;
}

function capitalizar(t) {
  const x = String(t || '').trim();
  return x ? x.charAt(0).toUpperCase() + x.slice(1).toLowerCase() : null;
}

async function predecirAtributos(req, res) {
  try {
    const marca = String(req.query.marca || '').trim();
    if (marca.length > 120) return res.status(400).json({ error: 'Marca demasiado larga' });
    if (marca.length < 2) return res.json({ predictions: null, fuente: [] });

    const fuente = [];
    let genero = await masFrecuente('productos', 'genero', marca);
    let material = await masFrecuente('productos', 'material', marca);
    if (genero || material) fuente.push('productos');

    if (!genero || !material) {
      const gM = !genero ? await masFrecuente('mercado_catalogo', 'genero', marca).catch(() => null) : null;
      const mM = !material ? await masFrecuente('mercado_catalogo', 'material', marca).catch(() => null) : null;
      if (gM || mM) fuente.push('mercado');
      genero = genero || gM;
      material = material || mM;
    }
    genero = genero ? generoCanonico(genero) || null : null;
    material = capitalizar(material);
    if (!genero && !material) return res.json({ predictions: null, fuente: [] });
    res.json({ predictions: { genero, material }, fuente });
  } catch (err) {
    console.error('[mercado] predecirAtributos:', err.message);
    res.status(500).json({ error: 'No se pudo sugerir atributos' });
  }
}

// POST /mercado/:id/producto   (admin)
// Pasa un modelo del catálogo de mercado a TU catálogo (tabla productos, con
// sus medidas en metadatos) y, si cantidad > 0, deja un pedido SIMULADO: una
// compra en borrador. El stock no cambia hasta que se confirma esa compra en
// Compras (cuando la mercadería llega).
// Body: { codigo?, costo?, margen_pct?, cantidad?, sucursal_id?, proveedor_id? }
// Es idempotente por modelo: si ya está en el catálogo, reutiliza el producto.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const slug = (t) => sinAcentos(String(t || '')).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const numero = (v, def) => (v === undefined || v === null || v === '' ? def : Number(v));

async function crearProductoDesdeMercado(req, res) {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Id de modelo inválido' });
  const b = req.body || {};
  const costo = numero(b.costo, 0);
  const margen = numero(b.margen_pct, 0);
  const cantidad = numero(b.cantidad, 0);
  if (![costo, margen, cantidad].every(Number.isFinite) || costo < 0 || margen < 0) {
    return res.status(400).json({ error: 'Costo, margen y cantidad deben ser números válidos' });
  }
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > 100000) {
    return res.status(400).json({ error: 'La cantidad debe ser un entero entre 0 y 100000' });
  }
  if (cantidad > 0 && !b.sucursal_id) {
    return res.status(400).json({ error: 'Elegí la sucursal que recibe el pedido' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mr = await client.query('SELECT * FROM mercado_catalogo WHERE id = $1', [id]);
    if (mr.rowCount === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Modelo no encontrado en el catálogo de mercado' }); }
    const m = mr.rows[0];

    let producto;
    let reutilizado = false;
    const ex = await client.query(
      `SELECT id, codigo, nombre, costo_base, margen_pct, precio_venta FROM productos WHERE metadatos->>'mercado_id' = $1 LIMIT 1`, [id]
    );
    if (ex.rowCount > 0) {
      producto = ex.rows[0];
      reutilizado = true;
      // Si ahora viene un costo o un margen, se aplican al producto que ya estaba.
      const hayCosto = costo > 0;
      const hayMargen = b.margen_pct !== undefined && b.margen_pct !== null && b.margen_pct !== '';
      if (hayCosto || hayMargen) {
        const costoNuevo = hayCosto ? costo : Number(producto.costo_base) || 0;
        const margenNuevo = hayMargen ? margen : Number(producto.margen_pct) || 0;
        const precioNuevo = Math.round(costoNuevo * (1 + margenNuevo / 100) * 100) / 100;
        const up = await client.query(
          `UPDATE productos SET costo_base = $1, margen_pct = $2, precio_venta = $3 WHERE id = $4
           RETURNING id, codigo, nombre, costo_base, margen_pct, precio_venta`,
          [costoNuevo, margenNuevo, precioNuevo, producto.id]
        );
        producto = up.rows[0];
      }
    } else {
      const codigo = String(b.codigo || '').trim().slice(0, 50)
        || `MER-${slug(m.marca)}-${slug(m.modelo)}`.slice(0, 50);
      const precio = Math.round(costo * (1 + margen / 100) * 100) / 100;
      const material = m.material ? String(m.material).slice(0, 40) : null;
      const genero = generoCanonico(m.genero) || null;
      const metadatos = {
        mercado_id: id,
        calibre_ancho: m.calibre_ancho, puente: m.puente, patilla: m.patilla, altura_cristal: m.altura_cristal,
        estilo: m.estilo, tipo: m.tipo, colores: m.colores, tratamientos: m.tratamientos,
        aptitud_graduacion: m.aptitud_graduacion,
      };
      // Solo caracteres simples: así no depende de la codificación de la base.
      const medidas = m.calibre_ancho ? ` Medidas (calibre/puente/patilla): ${m.calibre_ancho}/${m.puente ?? '-'}/${m.patilla ?? '-'} mm.` : '';
      const ins = await client.query(
        `INSERT INTO productos
           (codigo, nombre, categoria, marca, descripcion, costo_base, margen_pct, precio_venta, iva_pct,
            genero, material, proveedor_id, metadatos)
         VALUES ($1,$2,'armazon',$3,$4,$5,$6,$7,21,$8,$9,$10,$11)
         RETURNING id, codigo, nombre, costo_base, precio_venta`,
        [codigo, `${m.marca} ${m.modelo}`.slice(0, 150), m.marca,
         `Cargado desde el catálogo de mercado.${medidas}`.slice(0, 500),
         costo, margen, precio, genero, material, b.proveedor_id || null, JSON.stringify(metadatos)]
      );
      producto = ins.rows[0];
    }

    let compra = null;
    if (cantidad > 0) {
      const costoItem = costo > 0 ? costo : Number(producto.costo_base) || 0;
      const total = Math.round(cantidad * costoItem * 100) / 100;
      const cr = await client.query(
        `INSERT INTO compras (proveedor_id, sucursal_id, recalcular_precios, total, notas, usuario_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, numero, estado, total`,
        [b.proveedor_id || null, b.sucursal_id, costoItem > 0, total,
         `Pedido simulado desde Mercado: ${m.marca} ${m.modelo}`, req.user?.id || null]
      );
      compra = cr.rows[0];
      await client.query(
        `INSERT INTO compra_items (compra_id, producto_id, cantidad, costo_unitario, subtotal)
         VALUES ($1,$2,$3,$4,$5)`,
        [compra.id, producto.id, cantidad, costoItem, total]
      );
    }
    await client.query('COMMIT');
    return res.status(201).json({ producto, reutilizado, compra });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') return res.status(409).json({ error: 'Ya existe un producto con ese código: elegí otro' });
    if (err.code === '23503' || err.code === '22P02') return res.status(400).json({ error: 'La sucursal o el proveedor elegido no existe' });
    console.error('[mercado] crearProductoDesdeMercado:', err.message);
    return res.status(500).json({ error: 'No se pudo cargar el modelo en tu catálogo' });
  } finally {
    client.release();
  }
}

module.exports = { enriquecer, listar, predecirAtributos, crearProductoDesdeMercado };
