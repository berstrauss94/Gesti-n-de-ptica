// =====================================================================
// Controller de Stock por sucursal + movimientos (trazabilidad).
// Los movimientos se registran de forma transaccional junto con el
// ajuste de la cantidad, para que nunca queden inconsistentes.
// =====================================================================

const { pool, query } = require('../config/db');

// Texto de búsqueda de un producto. Debe ser IDÉNTICO a la expresión del índice
// idx_productos_busqueda_trgm de migrate.js (sin el alias "p.") para que
// PostgreSQL use el índice en el ILIKE.
const BUSQUEDA_PRODUCTO = `(COALESCE(p.nombre, '') || ' ' || COALESCE(p.codigo, '') || ' ' || COALESCE(p.codigo_barras, '') || ' ' || COALESCE(p.marca, ''))`;
// Texto del "modelo o referencia": nombre, código y código de barras (sin la marca).
const MODELO_PRODUCTO = `(COALESCE(p.nombre, '') || ' ' || COALESCE(p.codigo, '') || ' ' || COALESCE(p.codigo_barras, ''))`;
// Umbral de parecido (pg_trgm word_similarity) para tolerar errores de tipeo.
const UMBRAL_PARECIDO = 0.45;
// Tope de filas por página ("Todos" en la UI).
const MAX_FILAS = 1000;

// Escapa % y _ para que no actúen como comodines en ILIKE.
function escaparLike(texto) {
  return String(texto).replace(/[\\%_]/g, '\\$&');
}

// GET /api/stock?sucursal_id=&q=&modelo=&categoria=&marca=&genero=&material=
//                &ubicacion_prod=&proveedor_id=&bajo_minimo=&limit=&offset=
// Existencias por sucursal. Devuelve { stock, total, limit, offset, parecidos }.
// q busca por texto parcial en nombre, código, código de barras y marca; modelo,
// en nombre, código y código de barras. Si no hay resultados y q o modelo tienen
// 3+ letras, reintenta por parecido (errores de tipeo) y marca parecidos = true.
async function listar(req, res) {
  const { sucursal_id, categoria, limit = 200, offset = 0 } = req.query;
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const lim = Math.min(Math.max(parseInt(limit, 10) || 200, 1), MAX_FILAS);
  const off = Math.max(parseInt(offset, 10) || 0, 0);

  // Filtros comunes (todo menos la búsqueda de texto). Los productos dados de
  // baja (activo = FALSE) no aparecen en el stock ni en los selectores.
  const cond = ['p.activo IS NOT FALSE'];
  const params = [];
  const igual = (valor, columna) => {
    if (valor) { params.push(valor); cond.push(`${columna} = $${params.length}`); }
  };
  igual(sucursal_id, 'ss.sucursal_id');
  igual(categoria, 'p.categoria');
  igual(req.query.marca, 'p.marca');
  igual(req.query.genero, 'p.genero');
  igual(req.query.material, 'p.material');
  igual(req.query.ubicacion_prod, 'p.ubicacion');
  igual(req.query.proveedor_id, 'p.proveedor_id');
  // "Modelo o referencia": entra como texto de búsqueda (con tolerancia a errores de tipeo).
  const modelo = typeof req.query.modelo === 'string' ? req.query.modelo.trim().slice(0, 100) : '';
  if (req.query.bajo_minimo === 'true') cond.push('ss.cantidad <= ss.stock_minimo');

  // Ejecuta la consulta. `textos` es una lista de { sql, valor }: en cada sql,
  // "$Q" se reemplaza por el parámetro de su valor (también en el orden).
  async function consultar(textos, orden) {
    const c = [...cond];
    const p = [...params];
    let ordenFinal = orden;
    textos.forEach(({ sql, valor }) => {
      p.push(valor);
      const marcador = `$${p.length}`;
      c.push(sql.split('$Q').join(marcador));
      ordenFinal = ordenFinal.split('$Q').join(marcador);
    });
    const where = c.length ? `WHERE ${c.join(' AND ')}` : '';
    p.push(lim, off);
    return query(
      `SELECT ss.id, ss.producto_id, ss.sucursal_id, ss.cantidad, ss.stock_minimo,
              ss.ubicacion, ss.updated_at,
              p.codigo, p.codigo_barras, p.nombre, p.categoria, p.marca,
              p.genero, p.material, p.ubicacion AS ubicacion_prod,
              p.proveedor_id, prov.nombre AS proveedor_nombre,
              p.precio_venta, p.costo_base,
              s.nombre AS sucursal_nombre,
              (ss.cantidad <= ss.stock_minimo) AS bajo_minimo,
              COUNT(*) OVER() AS total_filas
       FROM stock_sucursal ss
       JOIN productos p ON p.id = ss.producto_id
       JOIN sucursales s ON s.id = ss.sucursal_id
       LEFT JOIN proveedores prov ON prov.id = p.proveedor_id
       ${where}
       ORDER BY ${ordenFinal}
       LIMIT $${p.length - 1} OFFSET $${p.length}`,
      p
    );
  }

  const responder = (r, parecidos = false) => {
    const total = r.rows.length ? Number(r.rows[0].total_filas) : 0;
    const stock = r.rows.map(({ total_filas, ...fila }) => fila);
    return res.json({ stock, total, limit: lim, offset: off, parecidos });
  };

  try {
    // Condiciones exactas: cada palabra de q por separado (tienen que aparecer todas;
    // "ray ban" encuentra "Ray-Ban") y el modelo como subcadena. Pueden usar el índice trigram.
    const palabras = q.split(/\s+/).filter(Boolean).slice(0, 8);
    const exactas = palabras.map((t) => ({ sql: `${BUSQUEDA_PRODUCTO} ILIKE $Q`, valor: `%${escaparLike(t)}%` }));
    if (modelo) {
      exactas.push({
        sql: `(p.nombre ILIKE $Q OR p.codigo ILIKE $Q OR p.codigo_barras ILIKE $Q)`,
        valor: `%${escaparLike(modelo)}%`,
      });
    }
    if (!exactas.length) return responder(await consultar([], 'p.nombre ASC'));
    const r = await consultar(exactas, 'p.nombre ASC');
    if (r.rows.length > 0 || off > 0) return responder(r);
    // Sin coincidencias: reintento tolerante a errores de tipeo ("Rayban" -> "Ray-Ban").
    // Cada campo de texto con 3+ letras se busca por parecido; los más cortos, exacto.
    const hayParecido = q.length >= 3 || modelo.length >= 3;
    if (!hayParecido) return responder(r);
    const parecido = (texto, expresion) => ({
      sql: `word_similarity($Q, ${expresion}) >= ${UMBRAL_PARECIDO}`, valor: texto,
    });
    const aprox = [];
    if (q) {
      if (q.length >= 3) aprox.push(parecido(q, BUSQUEDA_PRODUCTO));
      else aprox.push(...exactas.slice(0, palabras.length));
    }
    if (modelo) {
      if (modelo.length >= 3) aprox.push(parecido(modelo, MODELO_PRODUCTO));
      else aprox.push(exactas[exactas.length - 1]);
    }
    try {
      // Orden: el más parecido primero (por el primer campo aproximado).
      const orden = aprox.find((a) => a.sql.startsWith('word_similarity'));
      // El primero de la lista es el que ordena (su "$Q" se reemplaza en el ORDER BY).
      const lista = [orden, ...aprox.filter((a) => a !== orden)];
      const sim = await consultar(lista, `${orden.sql.replace(/ >= [\d.]+$/, '')} DESC, p.nombre ASC`);
      return responder(sim, sim.rows.length > 0);
    } catch (err) {
      // pg_trgm no disponible: se devuelve el resultado vacío del ILIKE.
      console.warn('Búsqueda por parecido omitida (pg_trgm):', err.message);
      return responder(r);
    }
  } catch (err) {
    if (err.code === '22P02') return res.status(400).json({ error: 'Algún filtro tiene un identificador inválido' });
    console.error('Error al listar stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/stock/filtros  -> opciones para los desplegables de Stock, tomadas
// de los productos activos: { marcas, generos, materiales, ubicaciones, proveedores }.
async function listarFiltros(req, res) {
  const distintos = (col) => query(
    `SELECT DISTINCT ${col} AS v FROM productos
      WHERE ${col} IS NOT NULL AND ${col} <> '' AND activo = TRUE
      ORDER BY 1 ASC`
  );
  try {
    const [marcas, generos, materiales, ubicaciones, proveedores] = await Promise.all([
      distintos('marca'), distintos('genero'), distintos('material'), distintos('ubicacion'),
      query(
        `SELECT id, nombre FROM proveedores
          WHERE tipo = 'proveedor' AND activo = TRUE
          ORDER BY nombre ASC`
      ),
    ]);
    const valores = (r) => r.rows.map((x) => x.v);
    return res.json({
      marcas: valores(marcas),
      generos: valores(generos),
      materiales: valores(materiales),
      ubicaciones: valores(ubicaciones),
      proveedores: proveedores.rows,
    });
  } catch (err) {
    console.error('Error al listar filtros de stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// POST /api/stock/movimiento
// Body: { producto_id, sucursal_id, tipo: 'entrada'|'salida'|'ajuste', cantidad, motivo }
//  - entrada: suma cantidad   - salida: resta   - ajuste: fija la cantidad al valor dado
async function registrarMovimiento(req, res) {
  const { producto_id, sucursal_id, tipo, cantidad, motivo } = req.body || {};
  const cant = Number(cantidad);

  if (!producto_id || !sucursal_id || !tipo || !Number.isFinite(cant)) {
    return res.status(400).json({ error: 'producto_id, sucursal_id, tipo y cantidad son obligatorios' });
  }
  if (!['entrada', 'salida', 'ajuste'].includes(tipo)) {
    return res.status(400).json({ error: "tipo debe ser 'entrada', 'salida' o 'ajuste'" });
  }
  if (cant < 0) {
    return res.status(400).json({ error: 'cantidad no puede ser negativa' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Fila de stock (crear si no existe para ese producto+sucursal)
    const sel = await client.query(
      `SELECT cantidad FROM stock_sucursal WHERE producto_id = $1 AND sucursal_id = $2 FOR UPDATE`,
      [producto_id, sucursal_id]
    );
    let actual = 0;
    if (sel.rowCount === 0) {
      await client.query(
        `INSERT INTO stock_sucursal (producto_id, sucursal_id, cantidad) VALUES ($1, $2, 0)`,
        [producto_id, sucursal_id]
      );
    } else {
      actual = sel.rows[0].cantidad;
    }

    // Nueva cantidad según el tipo
    let nueva;
    if (tipo === 'entrada') nueva = actual + cant;
    else if (tipo === 'salida') nueva = actual - cant;
    else nueva = cant; // ajuste: fija el valor

    if (nueva < 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Stock insuficiente: hay ${actual}, intentás sacar ${cant}` });
    }

    await client.query(
      `UPDATE stock_sucursal SET cantidad = $1, updated_at = CURRENT_TIMESTAMP
       WHERE producto_id = $2 AND sucursal_id = $3`,
      [nueva, producto_id, sucursal_id]
    );

    // Registrar el movimiento (cantidad con signo informativo)
    const signo = tipo === 'salida' ? -cant : (tipo === 'entrada' ? cant : nueva - actual);
    await client.query(
      `INSERT INTO movimientos_stock (producto_id, sucursal_id, tipo, cantidad, motivo, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [producto_id, sucursal_id, tipo, signo, motivo || null, req.user?.id || null]
    );

    await client.query('COMMIT');
    return res.status(201).json({ producto_id, sucursal_id, cantidad: nueva });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error en movimiento de stock:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  } finally {
    client.release();
  }
}

// GET /api/stock/movimientos?producto_id=&sucursal_id=
async function listarMovimientos(req, res) {
  const { producto_id, sucursal_id, limit = 100 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 100, 500);
  const cond = [];
  const params = [];
  if (producto_id) { params.push(producto_id); cond.push(`m.producto_id = $${params.length}`); }
  if (sucursal_id) { params.push(sucursal_id); cond.push(`m.sucursal_id = $${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  params.push(lim);
  try {
    const r = await query(
      `SELECT m.id, m.tipo, m.cantidad, m.motivo, m.created_at,
              p.nombre AS producto, s.nombre AS sucursal
       FROM movimientos_stock m
       JOIN productos p ON p.id = m.producto_id
       JOIN sucursales s ON s.id = m.sucursal_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.json({ movimientos: r.rows });
  } catch (err) {
    console.error('Error al listar movimientos:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

// GET /api/stock/marcas  -> lista de marcas distintas (para el filtro de stock)
async function listarMarcas(req, res) {
  try {
    const r = await query(
      `SELECT DISTINCT marca FROM productos
       WHERE marca IS NOT NULL AND marca <> '' AND activo = TRUE
       ORDER BY marca ASC`
    );
    return res.json({ marcas: r.rows.map((x) => x.marca) });
  } catch (err) {
    console.error('Error al listar marcas:', err);
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
}

module.exports = { listar, listarFiltros, registrarMovimiento, listarMovimientos, listarMarcas };
