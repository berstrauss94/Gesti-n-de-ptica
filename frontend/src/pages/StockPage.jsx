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
  listarStock,
  registrarMovimiento,
  recalcularPrecios,
} from '../api/stock';

const CATEGORIAS = ['armazon', 'cristal', 'lente_contacto', 'accesorio', 'otro'];
const CAT_LABEL = {
  armazon: 'Armazón', cristal: 'Cristal', lente_contacto: 'Lente de contacto',
  accesorio: 'Accesorio', otro: 'Otro',
};

export default function StockPage() {
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

  // Carga inicial de sucursales
  useEffect(() => {
    (async () => {
      try {
        const s = await listarSucursales();
        setSucursales(s);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar las sucursales');
      }
    })();
  }, []);

  const cargarStock = useCallback(async (sid, busqueda) => {
    if (!sid) return;
    setCargando(true); setError('');
    try {
      const data = await listarStock({ sucursal_id: sid, q: busqueda || undefined });
      setStock(data.stock);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el stock');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarStock(sucursalId, ''); }, [sucursalId, cargarStock]);

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
      cargarStock(sucursalId, '');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el producto');
    }
  }

  // Movimiento rápido (+/- 1 o ajuste) sobre una fila
  async function mover(producto_id, tipo, cantidad) {
    setError(''); setOk('');
    try {
      await registrarMovimiento({ producto_id, sucursal_id: sucursalId, tipo, cantidad, motivo: 'ajuste manual' });
      cargarStock(sucursalId, q);
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
      cargarStock(sucursalId, q);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo recalcular');
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Stock / Inventario</h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <button type="button" className="btn btn--ghost btn--inline" onClick={handleRecalcular}>
            Recalcular precios
          </button>
          <button type="button" className="btn btn--primary btn--inline" onClick={() => setMostrarAlta((v) => !v)}>
            {mostrarAlta ? 'Cerrar' : '+ Nuevo producto'}
          </button>
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

      <form className="searchbar" onSubmit={(e) => { e.preventDefault(); cargarStock(sucursalId, q); }}>
        <input type="search" placeholder="Buscar por nombre, código o código de barras…" value={q} onChange={(e) => setQ(e.target.value)} />
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
