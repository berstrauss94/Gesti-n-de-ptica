// =====================================================================
// Módulo de Stock / Inventario (multisucursal).
// - Selector de sucursal.
// - Listado de existencias con búsqueda y alerta de stock bajo.
// - Alta de producto (con código de barras y recálculo de precio).
// - Registro de movimientos (entrada/salida/ajuste).
// - Recálculo masivo de precios por margen.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  listarSucursales,
  listarProductos,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarStock,
  registrarMovimiento,
  listarMovimientos,
  recalcularPrecios,
  listarMarcas,
  crearTraslado,
} from '../api/stock';
import fondoStock from '../assets/fondo-stock.jpg';
import { barcodeSVG } from '../utils/barcode';
import InfoBtn from '../components/InfoBtn';
import Modal from '../components/Modal';
import { useEsAdmin } from '../hooks/useEsAdmin';

const CATEGORIAS = ['armazon', 'cristal', 'lente_contacto', 'accesorio', 'otro'];
const CAT_LABEL = {
  armazon: 'Armazón', cristal: 'Cristal', lente_contacto: 'Lente de contacto',
  accesorio: 'Accesorio', otro: 'Otro',
};

export default function StockPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [prod, setProd] = useState({
    codigo: '', codigo_barras: '', nombre: '', categoria: 'armazon',
    marca: '', costo_base: '', margen_pct: '', cantidad: '',
  });

  // Edición de producto (modal) e historial de movimientos (modal)
  const [editando, setEditando] = useState(null); // producto en edición
  const [historial, setHistorial] = useState(null); // { producto, movimientos } | null

  // Filtro por marca y traslado entre sucursales
  const [marcas, setMarcas] = useState([]);
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [traslado, setTraslado] = useState(null); // { producto } en traslado
  const [trasladoForm, setTrasladoForm] = useState({ destino_id: '', cantidad: '', motivo: '' });

  // Carga inicial de sucursales y marcas (para el filtro)
  useEffect(() => {
    (async () => {
      try {
        const [s, m] = await Promise.all([listarSucursales(), listarMarcas().catch(() => [])]);
        setSucursales(s);
        setMarcas(m);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar las sucursales');
      }
    })();
  }, []);

  const cargarStock = useCallback(async (sid, busqueda, marca) => {
    if (!sid) return;
    setCargando(true); setError('');
    try {
      const data = await listarStock({ sucursal_id: sid, q: busqueda || undefined, marca: marca || undefined });
      setStock(data.stock);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el stock');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarStock(sucursalId, q, marcaFiltro); }, [sucursalId, marcaFiltro, cargarStock]); // eslint-disable-line react-hooks/exhaustive-deps

  // Precio calculado en vivo en el form de alta
  const precioCalculado = useMemo(() => {
    const c = Number(prod.costo_base) || 0;
    const m = Number(prod.margen_pct) || 0;
    return Math.round(c * (1 + m / 100) * 100) / 100;
  }, [prod.costo_base, prod.margen_pct]);

  function setCampo(c, v) { setProd((p) => ({ ...p, [c]: v })); }

  async function handleAlta(e) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      const nuevo = await crearProducto({
        codigo: prod.codigo.trim(),
        codigo_barras: prod.codigo_barras.trim() || undefined,
        nombre: prod.nombre.trim(),
        categoria: prod.categoria,
        marca: prod.marca.trim() || undefined,
        costo_base: prod.costo_base || 0,
        margen_pct: prod.margen_pct || 0,
      });
      // Si cargaron cantidad inicial, registrar entrada en la sucursal actual
      const cant = Number(prod.cantidad);
      if (cant > 0) {
        await registrarMovimiento({
          producto_id: nuevo.id, sucursal_id: sucursalId,
          tipo: 'entrada', cantidad: cant, motivo: 'alta de producto',
        });
      }
      setOk(`Producto "${nuevo.nombre}" creado.`);
      setProd({ codigo: '', codigo_barras: '', nombre: '', categoria: 'armazon', marca: '', costo_base: '', margen_pct: '', cantidad: '' });
      setMostrarAlta(false);
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el producto');
    }
  }

  // Movimiento rápido (+/- 1 o ajuste) sobre una fila
  async function mover(producto_id, tipo, cantidad) {
    setError(''); setOk('');
    try {
      await registrarMovimiento({ producto_id, sucursal_id: sucursalId, tipo, cantidad, motivo: 'ajuste manual' });
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el movimiento');
    }
  }

  async function handleRecalcular() {
    const margen = window.prompt('Nuevo margen % a aplicar a TODOS los productos:');
    if (margen === null || margen === '') return;
    try {
      const r = await recalcularPrecios({ margen_pct: Number(margen) });
      setOk(`Precios recalculados: ${r.actualizados} productos.`);
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo recalcular');
    }
  }

  // Abrir el modal de edición con los datos de la fila
  function abrirEdicion(s) {
    setEditando({
      id: s.producto_id,
      codigo: s.codigo || '',
      codigo_barras: s.codigo_barras || '',
      nombre: s.nombre || '',
      categoria: s.categoria || 'armazon',
      marca: s.marca || '',
      costo_base: s.costo_base ?? '',
      margen_pct: s.margen_pct ?? '',
    });
  }

  async function guardarEdicion(e) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await actualizarProducto(editando.id, {
        codigo: editando.codigo.trim(),
        codigo_barras: editando.codigo_barras.trim() || undefined,
        nombre: editando.nombre.trim(),
        categoria: editando.categoria,
        marca: editando.marca.trim() || undefined,
        costo_base: Number(editando.costo_base) || 0,
        margen_pct: Number(editando.margen_pct) || 0,
      });
      setOk(`Producto "${editando.nombre}" actualizado.`);
      setEditando(null);
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo actualizar el producto');
    }
  }

  async function handleEliminarProducto(s) {
    if (!window.confirm(`¿Eliminar el producto "${s.nombre}"? Esta acción no se puede deshacer.`)) return;
    setError(''); setOk('');
    try {
      await eliminarProducto(s.producto_id);
      setOk(`Producto "${s.nombre}" eliminado.`);
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar el producto');
    }
  }

  async function verHistorial(s) {
    setError('');
    try {
      const movimientos = await listarMovimientos({ producto_id: s.producto_id, sucursal_id: sucursalId });
      setHistorial({ producto: s, movimientos });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el historial');
    }
  }

  // Exporta el stock visible actualmente a un archivo CSV (sin backend).
  function exportarCSV() {
    if (!stock.length) {
      setError('No hay productos para exportar.');
      return;
    }
    const cols = ['Código', 'Código de barras', 'Nombre', 'Categoría', 'Marca', 'Precio', 'Cantidad', 'Bajo mínimo'];
    const esc = (v) => {
      const t = v == null ? '' : String(v);
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const filas = stock.map((s) => [
      s.codigo,
      s.codigo_barras || '',
      s.nombre,
      CAT_LABEL[s.categoria] || s.categoria,
      s.marca || '',
      Number(s.precio_venta).toFixed(2),
      s.cantidad,
      s.bajo_minimo ? 'sí' : 'no',
    ].map(esc).join(';'));
    const csv = [cols.join(';'), ...filas].join('\r\n');
    // BOM para que Excel reconozca los acentos (UTF-8)
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const suc = sucursales.find((x) => String(x.id) === String(sucursalId));
    a.href = url;
    a.download = `stock_${suc ? suc.nombre.replace(/\s+/g, '-') : 'sucursal'}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setOk('Stock exportado a CSV.');
  }

  // Genera e imprime una etiqueta con código de barras del producto.
  // Usa el código de barras si existe; si no, el código interno.
  function imprimirEtiqueta(s) {
    const valor = (s.codigo_barras && String(s.codigo_barras).trim()) || s.codigo;
    if (!valor) { setError('El producto no tiene código para la etiqueta.'); return; }
    const svg = barcodeSVG(valor, { alto: 50, moduloAncho: 2 });
    const precio = `$ ${Number(s.precio_venta).toFixed(2)}`;
    const win = window.open('', '_blank', 'width=420,height=320');
    if (!win) { setError('El navegador bloqueó la ventana de impresión.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Etiqueta ${escapeHtml(s.nombre)}</title>
      <style>
        @page { size: 50mm 30mm; margin: 2mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: system-ui, sans-serif; }
        .etiqueta { width: 50mm; padding: 2mm; text-align: center; }
        .et-nombre { font-size: 10px; font-weight: 700; margin: 0 0 1mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .et-precio { font-size: 13px; font-weight: 700; margin: 1mm 0 0; }
        svg { max-width: 100%; height: auto; }
      </style></head>
      <body>
        <div class="etiqueta">
          <p class="et-nombre">${escapeHtml(s.nombre)}</p>
          ${svg}
          <p class="et-precio">${precio}</p>
        </div>
        <script>window.onload = function(){ window.print(); setTimeout(function(){ window.close(); }, 300); };<\/script>
      </body></html>`);
    win.document.close();
  }

  function escapeHtml(t) {
    return String(t || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
  }

  function abrirTraslado(s) {
    setTraslado({ producto: s });
    setTrasladoForm({ destino_id: '', cantidad: '', motivo: '' });
  }

  async function guardarTraslado(e) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await crearTraslado({
        producto_id: traslado.producto.producto_id,
        origen_id: sucursalId,
        destino_id: trasladoForm.destino_id,
        cantidad: Number(trasladoForm.cantidad),
        motivo: trasladoForm.motivo || null,
      });
      setOk('Traslado realizado.');
      setTraslado(null);
      cargarStock(sucursalId, q, marcaFiltro);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo realizar el traslado');
    }
  }

  return (
    <div className="stack seccion-con-fondo">
      {/* Fondo propio de la sección Stock (aparece primero, suave) */}
      <div className="seccion-fondo" style={{ backgroundImage: `url(${fondoStock})` }} aria-hidden="true" />
      <div className="seccion-fondo-velo" aria-hidden="true" />

      <div className="page-header">
        <h1>
          Stock / Inventario
          <InfoBtn
            paraQue="Controla el inventario de productos (armazones, cristales, lentes de contacto) por sucursal."
            comoFunciona="Elegí la sucursal, buscá productos, cargá nuevos con costo y margen, y ajustá cantidades con los botones +/−."
            conQueFin="Saber qué hay en stock en cada local y mantener los precios de venta actualizados."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button type="button" className="btn btn--ghost btn--inline" onClick={exportarCSV}>
            Exportar CSV
          </button>
          {esAdmin && (
            <>
              <button type="button" className="btn btn--ghost btn--inline" onClick={handleRecalcular}>
                Recalcular precios
              </button>
              <button type="button" className="btn btn--primary btn--inline" onClick={() => setMostrarAlta((v) => !v)}>
                {mostrarAlta ? 'Cerrar' : '+ Nuevo producto'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {mostrarAlta && (
        <form className="card form-grid" onSubmit={handleAlta}>
          <label className="field"><span>Código *</span>
            <input value={prod.codigo} onChange={(e) => setCampo('codigo', e.target.value)} required /></label>
          <label className="field"><span>Código de barras</span>
            <input value={prod.codigo_barras} onChange={(e) => setCampo('codigo_barras', e.target.value)} placeholder="EAN/UPC" /></label>
          <label className="field"><span>Nombre *</span>
            <input value={prod.nombre} onChange={(e) => setCampo('nombre', e.target.value)} required /></label>
          <label className="field"><span>Categoría *</span>
            <select value={prod.categoria} onChange={(e) => setCampo('categoria', e.target.value)}>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
            </select></label>
          <label className="field"><span>Marca</span>
            <input value={prod.marca} onChange={(e) => setCampo('marca', e.target.value)} /></label>
          <label className="field"><span>Costo base ($)</span>
            <input type="number" step="0.01" min="0" value={prod.costo_base} onChange={(e) => setCampo('costo_base', e.target.value)} /></label>
          <label className="field"><span>Margen (%)</span>
            <input type="number" step="0.1" min="0" value={prod.margen_pct} onChange={(e) => setCampo('margen_pct', e.target.value)} /></label>
          <label className="field"><span>Precio calculado</span>
            <input value={`$ ${precioCalculado.toFixed(2)}`} readOnly className="readonly" /></label>
          <label className="field"><span>Cantidad inicial</span>
            <input type="number" min="0" value={prod.cantidad} onChange={(e) => setCampo('cantidad', e.target.value)} /></label>
          <div className="form-actions">
            <button type="submit" className="btn btn--primary btn--inline">Guardar producto</button>
          </div>
        </form>
      )}

      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); cargarStock(sucursalId, q, marcaFiltro); }}>
        <input type="search" placeholder="Buscar por nombre, código o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={marcaFiltro} onChange={(e) => setMarcaFiltro(e.target.value)}>
          <option value="">Todas las marcas</option>
          {marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button type="submit" className="btn btn--ghost">Buscar</button>
      </form>

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : stock.length === 0 ? (
        <div className="card empty"><p>Sin productos con stock en esta sucursal.</p></div>
      ) : (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Cantidad</th><th>Movimiento</th></tr>
            </thead>
            <tbody>
              {stock.map((s) => (
                <tr key={s.id} className={s.bajo_minimo ? 'fila-alerta' : ''}>
                  <td>
                    <strong>{s.nombre}</strong>
                    <div className="muted small">{s.codigo}{s.codigo_barras ? ` · ${s.codigo_barras}` : ''}</div>
                  </td>
                  <td>{CAT_LABEL[s.categoria] || s.categoria}</td>
                  <td>$ {Number(s.precio_venta).toFixed(2)}</td>
                  <td>
                    <strong>{s.cantidad}</strong>
                    {s.bajo_minimo && <span className="tag tag--rojo">bajo mínimo</span>}
                  </td>
                  <td className="col-mov">
                    <button type="button" className="btn-mini" onClick={() => mover(s.producto_id, 'salida', 1)}>−</button>
                    <button type="button" className="btn-mini" onClick={() => mover(s.producto_id, 'entrada', 1)}>+</button>
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => verHistorial(s)}>Historial</button>
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => imprimirEtiqueta(s)}>Etiqueta</button>
                    {esAdmin && (
                      <>
                        <button type="button" className="btn-mini btn-mini--wide" onClick={() => abrirEdicion(s)}>Editar</button>
                        <button type="button" className="btn-mini btn-mini--wide" onClick={() => abrirTraslado(s)}>Trasladar</button>
                        <button type="button" className="btn-mini btn-mini--wide" onClick={() => handleEliminarProducto(s)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: editar producto (solo admin) */}
      {editando && (
        <Modal titulo={`Editar producto`} onCerrar={() => setEditando(null)}>
          <form className="form-grid" onSubmit={guardarEdicion}>
            <label className="field"><span>Código *</span>
              <input value={editando.codigo} onChange={(e) => setEditando({ ...editando, codigo: e.target.value })} required /></label>
            <label className="field"><span>Código de barras</span>
              <input value={editando.codigo_barras} onChange={(e) => setEditando({ ...editando, codigo_barras: e.target.value })} placeholder="EAN/UPC" /></label>
            <label className="field"><span>Nombre *</span>
              <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} required /></label>
            <label className="field"><span>Categoría *</span>
              <select value={editando.categoria} onChange={(e) => setEditando({ ...editando, categoria: e.target.value })}>
                {CATEGORIAS.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}
              </select></label>
            <label className="field"><span>Marca</span>
              <input value={editando.marca} onChange={(e) => setEditando({ ...editando, marca: e.target.value })} /></label>
            <label className="field"><span>Costo base ($)</span>
              <input type="number" step="0.01" min="0" value={editando.costo_base} onChange={(e) => setEditando({ ...editando, costo_base: e.target.value })} /></label>
            <label className="field"><span>Margen (%)</span>
              <input type="number" step="0.1" min="0" value={editando.margen_pct} onChange={(e) => setEditando({ ...editando, margen_pct: e.target.value })} /></label>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setEditando(null)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline">Guardar cambios</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: historial de movimientos del producto */}
      {historial && (
        <Modal titulo={`Movimientos · ${historial.producto.nombre}`} onCerrar={() => setHistorial(null)}>
          {historial.movimientos.length === 0 ? (
            <p className="muted">Sin movimientos registrados para este producto en la sucursal.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th></tr></thead>
              <tbody>
                {historial.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{m.tipo}</td>
                    <td>{m.cantidad}</td>
                    <td>{m.motivo || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {/* Modal: trasladar stock a otra sucursal (solo admin) */}
      {traslado && (
        <Modal titulo={`Trasladar · ${traslado.producto.nombre}`} onCerrar={() => setTraslado(null)}>
          <p className="muted small">
            Origen: <strong>{sucursales.find((s) => s.id === sucursalId)?.nombre}</strong>
            {' · '}Disponible: <strong>{traslado.producto.cantidad}</strong>
          </p>
          <form className="form-grid" onSubmit={guardarTraslado}>
            <label className="field field--full"><span>Sucursal destino *</span>
              <select value={trasladoForm.destino_id} onChange={(e) => setTrasladoForm({ ...trasladoForm, destino_id: e.target.value })} required>
                <option value="">Elegir destino…</option>
                {sucursales.filter((s) => s.id !== sucursalId).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select></label>
            <label className="field"><span>Cantidad *</span>
              <input type="number" min="1" max={traslado.producto.cantidad} value={trasladoForm.cantidad} onChange={(e) => setTrasladoForm({ ...trasladoForm, cantidad: e.target.value })} required /></label>
            <label className="field"><span>Motivo</span>
              <input value={trasladoForm.motivo} onChange={(e) => setTrasladoForm({ ...trasladoForm, motivo: e.target.value })} placeholder="Reposición, pedido, etc." /></label>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setTraslado(null)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline">Trasladar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
