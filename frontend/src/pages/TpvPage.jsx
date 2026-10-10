// =====================================================================
// TPV / Punto de Venta + Cajas.
// - Control de caja (abrir/cerrar con arqueo).
// - Nueva venta: agrega productos del stock, cliente y vendedor, seña.
// - Lista de ventas con entregar (descuenta stock) y anular.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { listarSucursales, listarProductos } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import {
  cajaActual, abrirCaja, cerrarCaja,
  listarVentas, crearVenta, entregarVenta, anularVenta,
} from '../api/ventas';
import { estadoFiscal, emitirComprobante } from '../api/fiscal';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';

const MEDIOS = ['efectivo', 'tarjeta', 'transferencia'];
const ESTADO_LABEL = {
  presupuesto: 'Presupuesto', senada: 'Señada', entregada: 'Entregada', anulada: 'Anulada',
};

export default function TpvPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [caja, setCaja] = useState(null);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Venta en construcción
  const [carrito, setCarrito] = useState([]); // [{producto_id, descripcion, cantidad, precio_unitario}]
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [senaMonto, setSenaMonto] = useState('');
  const [senaMedio, setSenaMedio] = useState('efectivo');
  const [prodSel, setProdSel] = useState('');
  const [fiscal, setFiscal] = useState(null); // estado del módulo fiscal
  const [tipoComp, setTipoComp] = useState({}); // tipo elegido por venta

  useEffect(() => {
    (async () => {
      try {
        const [s, u, f] = await Promise.all([
          listarSucursales(), listarUsuarios({ limit: 200 }), estadoFiscal().catch(() => null),
        ]);
        setSucursales(s);
        setClientes(u.usuarios);
        setFiscal(f);
        if (s.length) setSucursalId(s[0].id);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los datos');
      }
    })();
  }, []);

  async function handleFacturar(ventaId) {
    const tipo = tipoComp[ventaId] || 'INTERNO';
    setError(''); setOk('');
    try {
      const r = await emitirComprobante({ venta_id: ventaId, tipo });
      const c = r.comprobante;
      if (c.estado === 'autorizado') {
        setOk(`Factura ${c.tipo} autorizada. CAE: ${c.cae}`);
      } else if (c.estado === 'simulado') {
        setOk(`Comprobante ${c.tipo} emitido en modo simulación (sin validez fiscal).`);
      } else {
        setError(`Comprobante ${c.tipo}: ${c.observaciones || 'no autorizado'}`);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo emitir el comprobante');
    }
  }

  const refrescar = useCallback(async (sid) => {
    if (!sid) return;
    try {
      const [c, p, v] = await Promise.all([
        cajaActual(sid),
        listarProductos({ limit: 500 }),
        listarVentas({ sucursal_id: sid }),
      ]);
      setCaja(c);
      setProductos(p.productos);
      setVentas(v);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los datos de la sucursal');
    }
  }, []);

  useEffect(() => { refrescar(sucursalId); }, [sucursalId, refrescar]);

  const totalCarrito = useMemo(
    () => carrito.reduce((a, it) => a + it.cantidad * it.precio_unitario, 0),
    [carrito]
  );

  function agregarAlCarrito() {
    const p = productos.find((x) => x.id === prodSel);
    if (!p) return;
    setCarrito((prev) => {
      const existe = prev.find((it) => it.producto_id === p.id);
      if (existe) {
        return prev.map((it) => it.producto_id === p.id ? { ...it, cantidad: it.cantidad + 1 } : it);
      }
      return [...prev, { producto_id: p.id, descripcion: p.nombre, cantidad: 1, precio_unitario: Number(p.precio_venta) }];
    });
    setProdSel('');
  }

  function quitarDelCarrito(pid) {
    setCarrito((prev) => prev.filter((it) => it.producto_id !== pid));
  }

  async function handleAbrirCaja() {
    const monto = window.prompt('Monto inicial de caja ($):', '0');
    if (monto === null) return;
    try {
      const c = await abrirCaja({ sucursal_id: sucursalId, monto_inicial: Number(monto) || 0 });
      setCaja(c); setOk('Caja abierta.');
    } catch (err) { setError(err.response?.data?.error || 'No se pudo abrir la caja'); }
  }

  async function handleCerrarCaja() {
    const monto = window.prompt('Monto en efectivo contado para el arqueo ($):', '0');
    if (monto === null) return;
    try {
      const r = await cerrarCaja(caja.id, Number(monto) || 0);
      setCaja(null);
      setOk(`Caja cerrada. Esperado en efectivo: $${r.esperado_efectivo}. Diferencia: $${r.caja.diferencia}.`);
      refrescar(sucursalId);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cerrar la caja'); }
  }

  async function handleCrearVenta() {
    setError(''); setOk('');
    if (carrito.length === 0) { setError('Agregá al menos un producto'); return; }
    try {
      const payload = {
        sucursal_id: sucursalId,
        caja_id: caja?.id || null,
        cliente_id: clienteId || null,
        vendedor_id: vendedorId || null,
        items: carrito,
      };
      if (Number(senaMonto) > 0) payload.sena = { medio: senaMedio, monto: Number(senaMonto) };
      await crearVenta(payload);
      setOk('Venta creada.');
      setCarrito([]); setClienteId(''); setVendedorId(''); setSenaMonto('');
      refrescar(sucursalId);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo crear la venta'); }
  }

  async function handleEntregar(id) {
    try { await entregarVenta(id); setOk('Venta entregada (stock descontado).'); refrescar(sucursalId); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo entregar'); }
  }
  async function handleAnular(id) {
    if (!window.confirm('¿Anular esta venta?')) return;
    try { await anularVenta(id); setOk('Venta anulada.'); refrescar(sucursalId); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo anular'); }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          TPV / Ventas
          <InfoBtn
            paraQue="Es el punto de venta: registra ventas, señas, entregas y cobros, con control de caja."
            comoFunciona="Abrí la caja, armá la venta agregando productos, elegí cliente y seña, creala y luego entregala y facturala."
            conQueFin="Vender y cobrar de forma ordenada, descontando stock y llevando el arqueo de caja."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          {caja ? (
            <button type="button" className="btn btn--ghost btn--inline" onClick={handleCerrarCaja}>Cerrar caja</button>
          ) : (
            <button type="button" className="btn btn--primary btn--inline" onClick={handleAbrirCaja}>Abrir caja</button>
          )}
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      <div className="card">
        <strong>Caja: </strong>
        {caja ? <span className="ok-text">Abierta (inicial ${Number(caja.monto_inicial).toFixed(2)})</span>
              : <span className="muted">Cerrada — abrí una caja para registrar cobros en efectivo.</span>}
        {fiscal && (
          <span className="muted small" style={{ marginLeft: '1rem' }}>
            · Facturación: <strong>{fiscal.modo}</strong>
            {fiscal.modo === 'simulacion' && ' (sin credenciales AFIP; emite comprobantes internos)'}
          </span>
        )}
      </div>

      {/* Nueva venta */}
      <div className="card">
        <h2 className="section-title">Nueva venta</h2>
        <div className="venta-form">
          <div className="venta-form__row">
            <select value={prodSel} onChange={(e) => setProdSel(e.target.value)}>
              <option value="">Elegir producto…</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre} — ${Number(p.precio_venta).toFixed(2)}</option>
              ))}
            </select>
            <button type="button" className="btn btn--ghost btn--inline" onClick={agregarAlCarrito} disabled={!prodSel}>
              Agregar
            </button>
          </div>

          {carrito.length > 0 && (
            <table className="table table--compact">
              <thead><tr><th>Producto</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th><th></th></tr></thead>
              <tbody>
                {carrito.map((it) => (
                  <tr key={it.producto_id}>
                    <td>{it.descripcion}</td>
                    <td>{it.cantidad}</td>
                    <td>${it.precio_unitario.toFixed(2)}</td>
                    <td>${(it.cantidad * it.precio_unitario).toFixed(2)}</td>
                    <td><button type="button" className="link-btn" onClick={() => quitarDelCarrito(it.producto_id)}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="venta-form__row">
            <label className="field"><span>Cliente (opcional)</span>
              <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                <option value="">Consumidor final</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
              </select></label>
            <label className="field"><span>Seña (opcional)</span>
              <input type="number" min="0" step="0.01" value={senaMonto} onChange={(e) => setSenaMonto(e.target.value)} placeholder="0.00" /></label>
            <label className="field"><span>Medio de la seña</span>
              <select value={senaMedio} onChange={(e) => setSenaMedio(e.target.value)}>
                {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select></label>
          </div>

          <div className="venta-total">
            <strong>Total: ${totalCarrito.toFixed(2)}</strong>
            <button type="button" className="btn btn--primary btn--inline" onClick={handleCrearVenta} disabled={carrito.length === 0}>
              Crear venta
            </button>
          </div>
        </div>
      </div>

      {/* Lista de ventas */}
      <div className="card no-pad">
        <table className="table">
          <thead><tr><th>#</th><th>Cliente</th><th>Estado</th><th>Total</th><th>Pagado</th><th>Acciones</th></tr></thead>
          <tbody>
            {ventas.length === 0 ? (
              <tr><td colSpan="6" className="muted" style={{ padding: '1rem' }}>Sin ventas todavía.</td></tr>
            ) : ventas.map((v) => (
              <tr key={v.id}>
                <td>{v.numero}</td>
                <td>{v.cliente_nombre || 'Consumidor final'}</td>
                <td><span className="badge">{ESTADO_LABEL[v.estado]}</span></td>
                <td>${Number(v.total).toFixed(2)}</td>
                <td>${Number(v.total_pagado).toFixed(2)}</td>
                <td className="col-mov">
                  {['presupuesto', 'senada'].includes(v.estado) && (
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => handleEntregar(v.id)}>Entregar</button>
                  )}
                  {esAdmin && v.estado !== 'anulada' && v.estado !== 'entregada' && (
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => handleAnular(v.id)}>Anular</button>
                  )}
                  {v.estado !== 'anulada' && (
                    <>
                      <select
                        className="select-estado"
                        value={tipoComp[v.id] || 'INTERNO'}
                        onChange={(e) => setTipoComp((prev) => ({ ...prev, [v.id]: e.target.value }))}
                      >
                        <option value="INTERNO">Interno</option>
                        <option value="A">Factura A</option>
                        <option value="B">Factura B</option>
                        <option value="C">Factura C</option>
                      </select>
                      <button type="button" className="btn-mini btn-mini--wide" onClick={() => handleFacturar(v.id)}>Facturar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
