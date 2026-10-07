// =====================================================================
// Módulo Compras / Proveedores (3 pestañas):
//  - Compras: ingreso de factura de proveedor + confirmar (suma stock,
//    actualiza costo y recalcula precios).
//  - Proveedores / Laboratorios: ABM.
//  - Órdenes de laboratorio: trazabilidad B2B con estados.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { listarSucursales, listarProductos } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import {
  listarProveedores, crearProveedor,
  listarCompras, crearCompra, confirmarCompra,
  listarOrdenes, crearOrden, cambiarEstadoOrden,
} from '../api/compras';
import InfoBtn from '../components/InfoBtn';

const ESTADOS_ORDEN = ['enviado', 'en_proceso', 'recibido_sucursal', 'listo_entrega', 'entregado'];
const ORDEN_LABEL = {
  enviado: 'Enviado', en_proceso: 'En proceso', recibido_sucursal: 'Recibido en sucursal',
  listo_entrega: 'Listo para entregar', entregado: 'Entregado',
};

export default function ComprasPage() {
  const [tab, setTab] = useState('compras');
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await listarSucursales();
        setSucursales(s);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar sucursales'); }
    })();
  }, []);

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Compras / Proveedores
          <InfoBtn
            paraQue="Gestiona las compras a proveedores, el alta de proveedores/laboratorios y las órdenes de trabajo a laboratorio."
            comoFunciona="Cargá una compra con sus productos y costos y confirmala (suma stock y actualiza precios); seguí las órdenes por su estado."
            conQueFin="Reponer inventario, mantener los costos al día y seguir los trabajos enviados a laboratorio hasta la entrega."
          />
        </h1>
        <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'compras' ? 'is-active' : ''}`} onClick={() => setTab('compras')}>Compras</button>
        <button className={`tab ${tab === 'proveedores' ? 'is-active' : ''}`} onClick={() => setTab('proveedores')}>Proveedores</button>
        <button className={`tab ${tab === 'ordenes' ? 'is-active' : ''}`} onClick={() => setTab('ordenes')}>Órdenes de laboratorio</button>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {tab === 'compras' && <TabCompras sucursalId={sucursalId} setError={setError} setOk={setOk} />}
      {tab === 'proveedores' && <TabProveedores setError={setError} setOk={setOk} />}
      {tab === 'ordenes' && <TabOrdenes sucursalId={sucursalId} setError={setError} setOk={setOk} />}
    </div>
  );
}

// --------------------------------------------------------------------
function TabCompras({ sucursalId, setError, setOk }) {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [proveedorId, setProveedorId] = useState('');
  const [nroFactura, setNroFactura] = useState('');
  const [recalc, setRecalc] = useState(true);
  const [items, setItems] = useState([]);
  const [prodSel, setProdSel] = useState('');

  const cargar = useCallback(async () => {
    if (!sucursalId) return;
    try {
      const [pr, pd, co] = await Promise.all([
        listarProveedores(), listarProductos({ limit: 500 }), listarCompras({ sucursal_id: sucursalId }),
      ]);
      setProveedores(pr); setProductos(pd.productos); setCompras(co);
    } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar las compras'); }
  }, [sucursalId, setError]);

  useEffect(() => { cargar(); }, [cargar]);

  const total = useMemo(() => items.reduce((a, it) => a + it.cantidad * it.costo_unitario, 0), [items]);

  function agregar() {
    const p = productos.find((x) => x.id === prodSel);
    if (!p) return;
    setItems((prev) => [...prev, {
      producto_id: p.id, nombre: p.nombre, cantidad: 1, costo_unitario: Number(p.costo_base) || 0,
    }]);
    setProdSel('');
  }
  function setItem(i, campo, val) {
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [campo]: Number(val) } : it));
  }

  async function guardar() {
    setError(''); setOk('');
    if (items.length === 0) { setError('Agregá al menos un producto'); return; }
    try {
      await crearCompra({
        proveedor_id: proveedorId || null,
        sucursal_id: sucursalId,
        nro_factura: nroFactura || null,
        recalcular_precios: recalc,
        items: items.map(({ producto_id, cantidad, costo_unitario }) => ({ producto_id, cantidad, costo_unitario })),
      });
      setOk('Compra creada en borrador. Confirmala para aplicar stock y precios.');
      setItems([]); setNroFactura(''); setProveedorId('');
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear la compra'); }
  }

  async function confirmar(id) {
    try { await confirmarCompra(id); setOk('Compra confirmada: stock y precios actualizados.'); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo confirmar'); }
  }

  return (
    <>
      <div className="card">
        <h2 className="section-title">Nueva compra</h2>
        <div className="venta-form">
          <div className="venta-form__row">
            <label className="field"><span>Proveedor</span>
              <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
                <option value="">Sin especificar</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select></label>
            <label className="field"><span>Nº factura</span>
              <input value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} /></label>
            <label className="field field--check">
              <input type="checkbox" checked={recalc} onChange={(e) => setRecalc(e.target.checked)} />
              <span>Recalcular precios de venta</span>
            </label>
          </div>

          <div className="venta-form__row">
            <select value={prodSel} onChange={(e) => setProdSel(e.target.value)}>
              <option value="">Elegir producto…</option>
              {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button type="button" className="btn btn--ghost btn--inline" onClick={agregar} disabled={!prodSel}>Agregar</button>
          </div>

          {items.length > 0 && (
            <table className="table table--compact">
              <thead><tr><th>Producto</th><th>Cantidad</th><th>Costo unit.</th><th>Subtotal</th></tr></thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={it.producto_id}>
                    <td>{it.nombre}</td>
                    <td><input type="number" min="1" value={it.cantidad} onChange={(e) => setItem(i, 'cantidad', e.target.value)} style={{ width: 70 }} /></td>
                    <td><input type="number" min="0" step="0.01" value={it.costo_unitario} onChange={(e) => setItem(i, 'costo_unitario', e.target.value)} style={{ width: 100 }} /></td>
                    <td>${(it.cantidad * it.costo_unitario).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="venta-total">
            <strong>Total compra: ${total.toFixed(2)}</strong>
            <button type="button" className="btn btn--primary btn--inline" onClick={guardar} disabled={items.length === 0}>Crear compra</button>
          </div>
        </div>
      </div>

      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>#</th><th>Proveedor</th><th>Factura</th><th>Total</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {compras.length === 0 ? (
              <tr><td colSpan="6" className="muted" style={{ padding: '1rem' }}>Sin compras.</td></tr>
            ) : compras.map((c) => (
              <tr key={c.id}>
                <td>{c.numero}</td>
                <td>{c.proveedor_nombre || '—'}</td>
                <td>{c.nro_factura || '—'}</td>
                <td>${Number(c.total).toFixed(2)}</td>
                <td><span className="badge">{c.estado}</span></td>
                <td>{c.estado === 'borrador' && <button className="btn-mini btn-mini--wide" onClick={() => confirmar(c.id)}>Confirmar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --------------------------------------------------------------------
function TabProveedores({ setError, setOk }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState({ nombre: '', tipo: 'proveedor', cuit: '', telefono: '', email: '' });

  const cargar = useCallback(async () => {
    try { setLista(await listarProveedores()); }
    catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar proveedores'); }
  }, [setError]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk('');
    try {
      await crearProveedor(form);
      setOk('Proveedor creado.'); setForm({ nombre: '', tipo: 'proveedor', cuit: '', telefono: '', email: '' });
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear'); }
  }

  return (
    <>
      <form className="card form-grid" onSubmit={guardar}>
        <label className="field"><span>Nombre *</span>
          <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} required /></label>
        <label className="field"><span>Tipo</span>
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
            <option value="proveedor">Proveedor</option>
            <option value="laboratorio">Laboratorio</option>
          </select></label>
        <label className="field"><span>CUIT</span>
          <input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })} /></label>
        <label className="field"><span>Teléfono</span>
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></label>
        <label className="field"><span>Email</span>
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <div className="form-actions"><button className="btn btn--primary btn--inline">Agregar</button></div>
      </form>

      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>CUIT</th><th>Contacto</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id}>
                <td>{p.nombre}</td>
                <td><span className="badge">{p.tipo}</span></td>
                <td>{p.cuit || '—'}</td>
                <td className="muted small">{p.telefono || ''} {p.email || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// --------------------------------------------------------------------
function TabOrdenes({ sucursalId, setError, setOk }) {
  const [ordenes, setOrdenes] = useState([]);
  const [labs, setLabs] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [form, setForm] = useState({ laboratorio_id: '', cliente_id: '', descripcion: '', fecha_estimada: '' });

  const cargar = useCallback(async () => {
    if (!sucursalId) return;
    try {
      const [o, l, c] = await Promise.all([
        listarOrdenes({ sucursal_id: sucursalId }),
        listarProveedores('laboratorio'),
        listarUsuarios({ limit: 200 }),
      ]);
      setOrdenes(o); setLabs(l); setClientes(c.usuarios);
    } catch (err) { setError(err.response?.data?.error || 'No se pudieron cargar las órdenes'); }
  }, [sucursalId, setError]);
  useEffect(() => { cargar(); }, [cargar]);

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk('');
    if (!form.descripcion) { setError('La descripción del trabajo es obligatoria'); return; }
    try {
      await crearOrden({ ...form, sucursal_id: sucursalId, laboratorio_id: form.laboratorio_id || null, cliente_id: form.cliente_id || null, fecha_estimada: form.fecha_estimada || null });
      setOk('Orden creada.'); setForm({ laboratorio_id: '', cliente_id: '', descripcion: '', fecha_estimada: '' });
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear la orden'); }
  }

  async function cambiar(id, estado) {
    try { await cambiarEstadoOrden(id, estado); cargar(); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cambiar el estado'); }
  }

  return (
    <>
      <form className="card form-grid" onSubmit={guardar}>
        <label className="field"><span>Laboratorio</span>
          <select value={form.laboratorio_id} onChange={(e) => setForm({ ...form, laboratorio_id: e.target.value })}>
            <option value="">Sin especificar</option>
            {labs.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select></label>
        <label className="field"><span>Cliente / paciente</span>
          <select value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
            <option value="">Sin especificar</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
          </select></label>
        <label className="field"><span>Fecha estimada</span>
          <input type="date" value={form.fecha_estimada} onChange={(e) => setForm({ ...form, fecha_estimada: e.target.value })} /></label>
        <label className="field field--full"><span>Descripción del trabajo *</span>
          <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Cristales, graduación, color, etc." required /></label>
        <div className="form-actions"><button className="btn btn--primary btn--inline">Crear orden</button></div>
      </form>

      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>#</th><th>Laboratorio</th><th>Cliente</th><th>Trabajo</th><th>Estado</th></tr></thead>
          <tbody>
            {ordenes.length === 0 ? (
              <tr><td colSpan="5" className="muted" style={{ padding: '1rem' }}>Sin órdenes.</td></tr>
            ) : ordenes.map((o) => (
              <tr key={o.id}>
                <td>{o.numero}</td>
                <td>{o.laboratorio_nombre || '—'}</td>
                <td>{o.cliente_nombre || '—'}</td>
                <td className="small">{o.descripcion}</td>
                <td>
                  <select value={o.estado} onChange={(e) => cambiar(o.id, e.target.value)} className="select-estado">
                    {ESTADOS_ORDEN.map((s) => <option key={s} value={s}>{ORDEN_LABEL[s]}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
