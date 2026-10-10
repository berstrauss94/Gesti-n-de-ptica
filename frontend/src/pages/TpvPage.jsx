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
  listarVentas, obtenerVenta, crearVenta, agregarPago, entregarVenta, anularVenta,
  cuentaCorriente, registrarMovimientoCaja,
} from '../api/ventas';
import { estadoFiscal, emitirComprobante } from '../api/fiscal';
import { listarPromociones } from '../api/promociones';
import InfoBtn from '../components/InfoBtn';
import Modal from '../components/Modal';
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

  // Promociones/descuentos del comercio
  const [promos, setPromos] = useState([]);
  const [descTipo, setDescTipo] = useState('ninguno'); // ninguno | porcentaje | monto
  const [descValor, setDescValor] = useState('');
  const [descMotivo, setDescMotivo] = useState('');

  // Venta en construcción
  const [carrito, setCarrito] = useState([]); // [{producto_id, descripcion, cantidad, precio_unitario}]
  const [clienteId, setClienteId] = useState('');
  const [vendedorId, setVendedorId] = useState('');
  const [senaMonto, setSenaMonto] = useState('');
  const [senaMedio, setSenaMedio] = useState('efectivo');
  const [prodSel, setProdSel] = useState('');
  const [fiscal, setFiscal] = useState(null); // estado del módulo fiscal
  const [tipoComp, setTipoComp] = useState({}); // tipo elegido por venta
  const [detalle, setDetalle] = useState(null); // { venta, items, pagos }
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMedio, setPagoMedio] = useState('efectivo');
  const [cuenta, setCuenta] = useState(null); // { cliente, saldo, movimientos }
  const [movCaja, setMovCaja] = useState(null); // form de reintegro/retiro de caja

  useEffect(() => {
    (async () => {
      try {
        const [s, u, f, pr] = await Promise.all([
          listarSucursales(), listarUsuarios({ limit: 200 }), estadoFiscal().catch(() => null),
          listarPromociones(true).catch(() => []),
        ]);
        setSucursales(s);
        setClientes(u.usuarios);
        setFiscal(f);
        setPromos(pr);
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

  const totalBruto = useMemo(
    () => carrito.reduce((a, it) => a + it.cantidad * it.precio_unitario, 0),
    [carrito]
  );

  // Monto del descuento según tipo/valor, acotado para no pasarse del bruto.
  const descMonto = useMemo(() => {
    const val = Number(descValor) || 0;
    if (descTipo === 'porcentaje') return Math.round(totalBruto * (Math.min(val, 100) / 100) * 100) / 100;
    if (descTipo === 'monto') return Math.round(Math.min(val, totalBruto) * 100) / 100;
    return 0;
  }, [descTipo, descValor, totalBruto]);

  const totalCarrito = Math.round((totalBruto - descMonto) * 100) / 100;

  // Al elegir una promo guardada, carga su tipo/valor en el descuento manual.
  function aplicarPromo(id) {
    const p = promos.find((x) => x.id === id);
    if (!p) { setDescTipo('ninguno'); setDescValor(''); setDescMotivo(''); return; }
    setDescTipo(p.tipo);
    setDescValor(String(p.valor));
    setDescMotivo(p.nombre);
  }

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
      if (descTipo !== 'ninguno' && Number(descValor) > 0) {
        payload.descuento = { tipo: descTipo, valor: Number(descValor), motivo: descMotivo || null };
      }
      await crearVenta(payload);
      setOk('Venta creada.');
      setCarrito([]); setClienteId(''); setVendedorId(''); setSenaMonto('');
      setDescTipo('ninguno'); setDescValor(''); setDescMotivo('');
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

  async function verDetalle(id) {
    setError('');
    try { setDetalle(await obtenerVenta(id)); setPagoMonto(''); setPagoMedio('efectivo'); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cargar el detalle'); }
  }

  async function handleRegistrarPago() {
    if (!(Number(pagoMonto) > 0)) { setError('Ingresá un monto válido'); return; }
    setError(''); setOk('');
    try {
      await agregarPago(detalle.venta.id, { medio: pagoMedio, monto: Number(pagoMonto) });
      setOk('Pago registrado.');
      // Recargar el detalle y la lista
      setDetalle(await obtenerVenta(detalle.venta.id));
      setPagoMonto('');
      refrescar(sucursalId);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo registrar el pago'); }
  }

  async function verCuentaCorriente(clienteId, nombre) {
    if (!clienteId) return;
    setError('');
    try {
      const r = await cuentaCorriente(clienteId);
      setCuenta({ cliente: nombre, saldo: r.saldo, movimientos: r.movimientos });
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar la cuenta corriente'); }
  }

  async function guardarMovimientoCaja(e) {
    e.preventDefault();
    setError(''); setOk('');
    try {
      await registrarMovimientoCaja(caja.id, {
        tipo: movCaja.tipo,
        medio: movCaja.medio,
        monto: Number(movCaja.monto),
        motivo: movCaja.motivo || null,
      });
      setOk(movCaja.tipo === 'ingreso' ? 'Reintegro/ingreso registrado.' : 'Retiro/egreso registrado.');
      setMovCaja(null);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el movimiento de caja');
    }
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
            <>
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setMovCaja({ tipo: 'egreso', medio: 'efectivo', monto: '', motivo: '' })}>Reintegro / Retiro</button>
              <button type="button" className="btn btn--ghost btn--inline" onClick={handleCerrarCaja}>Cerrar caja</button>
            </>
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

          {/* Descuento / promoción (propio del comercio) */}
          <div className="venta-form__row">
            <label className="field"><span>Promoción guardada</span>
              <select value="" onChange={(e) => aplicarPromo(e.target.value)}>
                <option value="">— Elegir / sin promo —</option>
                {promos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} ({p.tipo === 'porcentaje' ? `${Number(p.valor)}%` : `$${Number(p.valor).toFixed(2)}`})
                  </option>
                ))}
              </select></label>
            <label className="field"><span>Tipo de descuento</span>
              <select value={descTipo} onChange={(e) => setDescTipo(e.target.value)}>
                <option value="ninguno">Sin descuento</option>
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="monto">Monto fijo ($)</option>
              </select></label>
            <label className="field"><span>Valor del descuento</span>
              <input type="number" min="0" step="0.01" value={descValor}
                onChange={(e) => setDescValor(e.target.value)}
                disabled={descTipo === 'ninguno'} placeholder="0" /></label>
            <label className="field"><span>Motivo (opcional)</span>
              <input value={descMotivo} onChange={(e) => setDescMotivo(e.target.value)}
                placeholder="Ej: promo cliente frecuente" /></label>
          </div>

          <div className="venta-total">
            <div className="venta-total__detalle">
              {descMonto > 0 && (
                <>
                  <span className="muted small">Subtotal: ${totalBruto.toFixed(2)}</span>
                  <span className="muted small">Descuento: −${descMonto.toFixed(2)}</span>
                </>
              )}
              <strong>Total: ${totalCarrito.toFixed(2)}</strong>
            </div>
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
                  <button type="button" className="btn-mini btn-mini--wide" onClick={() => verDetalle(v.id)}>Ver</button>
                  {v.cliente_id && (
                    <button type="button" className="btn-mini btn-mini--wide" onClick={() => verCuentaCorriente(v.cliente_id, v.cliente_nombre)}>Cta cte</button>
                  )}
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

      {/* Modal: detalle de venta (ítems + pagos) + registrar pago */}
      {detalle && (
        <Modal titulo={`Venta #${detalle.venta.numero}`} onCerrar={() => setDetalle(null)}>
          <p className="muted small">
            Estado: <strong>{ESTADO_LABEL[detalle.venta.estado]}</strong>
            {' · '}Total: <strong>${Number(detalle.venta.total).toFixed(2)}</strong>
            {' · '}Pagado: <strong>${Number(detalle.venta.total_pagado).toFixed(2)}</strong>
            {' · '}Saldo: <strong>${(Number(detalle.venta.total) - Number(detalle.venta.total_pagado)).toFixed(2)}</strong>
          </p>

          <h3 className="section-title">Ítems</h3>
          <table className="data-table">
            <thead><tr><th>Descripción</th><th>Cant.</th><th>P. Unit.</th><th>Subtotal</th></tr></thead>
            <tbody>
              {detalle.items.map((it) => (
                <tr key={it.id}>
                  <td>{it.descripcion}</td>
                  <td>{it.cantidad}</td>
                  <td>$ {Number(it.precio_unitario).toFixed(2)}</td>
                  <td>$ {Number(it.subtotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="section-title">Pagos</h3>
          {detalle.pagos && detalle.pagos.length > 0 ? (
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Medio</th><th>Monto</th><th>Seña</th></tr></thead>
              <tbody>
                {detalle.pagos.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleString()}</td>
                    <td>{p.medio}</td>
                    <td>$ {Number(p.monto).toFixed(2)}</td>
                    <td>{p.es_sena ? 'Sí' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <p className="muted">Sin pagos registrados.</p>}

          {/* Registrar pago (si la venta no está anulada y queda saldo) */}
          {detalle.venta.estado !== 'anulada'
            && Number(detalle.venta.total_pagado) < Number(detalle.venta.total) && (
            <div className="venta-form__row" style={{ marginTop: '1rem' }}>
              <label className="field"><span>Monto del pago</span>
                <input type="number" min="0" step="0.01" value={pagoMonto} onChange={(e) => setPagoMonto(e.target.value)} placeholder="0.00" /></label>
              <label className="field"><span>Medio</span>
                <select value={pagoMedio} onChange={(e) => setPagoMedio(e.target.value)}>
                  {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select></label>
              <button type="button" className="btn btn--primary btn--inline" onClick={handleRegistrarPago}>Registrar pago</button>
            </div>
          )}
        </Modal>
      )}

      {/* Modal: cuenta corriente del cliente */}
      {cuenta && (
        <Modal titulo={`Cuenta corriente · ${cuenta.cliente || 'Cliente'}`} onCerrar={() => setCuenta(null)}>
          <p className="venta-total"><strong>Saldo actual: $ {Number(cuenta.saldo).toFixed(2)}</strong></p>
          {cuenta.movimientos.length === 0 ? (
            <p className="muted">Sin movimientos en la cuenta corriente.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Detalle</th></tr></thead>
              <tbody>
                {cuenta.movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>{new Date(m.created_at).toLocaleString()}</td>
                    <td>{m.tipo}</td>
                    <td>$ {Number(m.monto).toFixed(2)}</td>
                    <td>{m.detalle || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {/* Modal: reintegro / retiro de caja */}
      {movCaja && (
        <Modal titulo="Movimiento de caja" onCerrar={() => setMovCaja(null)}>
          <form className="form-grid" onSubmit={guardarMovimientoCaja}>
            <label className="field"><span>Tipo</span>
              <select value={movCaja.tipo} onChange={(e) => setMovCaja({ ...movCaja, tipo: e.target.value })}>
                <option value="egreso">Retiro / Egreso (gasto)</option>
                <option value="ingreso">Reintegro / Ingreso</option>
              </select></label>
            <label className="field"><span>Medio</span>
              <select value={movCaja.medio} onChange={(e) => setMovCaja({ ...movCaja, medio: e.target.value })}>
                {MEDIOS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select></label>
            <label className="field"><span>Monto *</span>
              <input type="number" min="0.01" step="0.01" value={movCaja.monto} onChange={(e) => setMovCaja({ ...movCaja, monto: e.target.value })} required /></label>
            <label className="field field--full"><span>Motivo</span>
              <input value={movCaja.motivo} onChange={(e) => setMovCaja({ ...movCaja, motivo: e.target.value })} placeholder="Retiro para proveedor, vuelto, etc." /></label>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setMovCaja(null)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline">Registrar</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
