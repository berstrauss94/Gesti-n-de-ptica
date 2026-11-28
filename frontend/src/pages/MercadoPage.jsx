// =====================================================================
// Catálogo de Mercado: modelos que NO están en el local, enriquecidos con
// IA (marca + modelo -> specs técnicas). Listado con buscador y filtros
// (estilo, material, género y aptitud para graduación). El alta/enriquecido
// con IA es solo para admin.
//
// La visualización (MercadoTabla) y el alta por IA (MercadoFormIA) son
// componentes compartidos con la sección "En el mercado" de Prueba Virtual.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listarMercado, cargarModeloEnCatalogo } from '../api/mercado';
import { listarSucursales } from '../api/stock';
import { listarProveedores } from '../api/compras';
import Modal from '../components/Modal';
import InfoBtn from '../components/InfoBtn';
import MercadoTabla from '../components/MercadoTabla';
import MercadoFormIA from '../components/MercadoFormIA';
import { useEsAdmin } from '../hooks/useEsAdmin';

export default function MercadoPage() {
  const esAdmin = useEsAdmin();

  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Buscador (texto libre contra la API) y filtros en memoria.
  // Si llegás desde Stock sin resultados, viene el texto en ?q= y se busca solo.
  const [params] = useSearchParams();
  const qInicial = (params.get('q') || '').slice(0, 120);
  const [q, setQ] = useState(qInicial);
  const [fEstilo, setFEstilo] = useState('');
  const [fMaterial, setFMaterial] = useState('');
  const [fGenero, setFGenero] = useState('');
  const [fGraduacion, setFGraduacion] = useState(''); // ''|si|no

  const cargar = useCallback(async (busqueda) => {
    setCargando(true);
    setError('');
    try {
      const data = await listarMercado(busqueda || undefined);
      setCatalogo(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el catálogo de mercado');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(qInicial);
  }, [cargar]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Pasar un modelo a tu catálogo / simular un pedido (solo admin) ---
  const [carga, setCarga] = useState(null); // modelo elegido
  const [form, setForm] = useState({ codigo: '', costo: '', margen_pct: '', cantidad: '0', sucursal_id: '', proveedor_id: '' });
  const [sucursales, setSucursales] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [errCarga, setErrCarga] = useState('');
  const [okCarga, setOkCarga] = useState('');

  async function abrirCarga(m) {
    setErrCarga(''); setOkCarga('');
    setForm({ codigo: '', costo: '', margen_pct: '', cantidad: '0', sucursal_id: '', proveedor_id: '' });
    setCarga(m);
    try {
      const [s, p] = await Promise.all([listarSucursales(), listarProveedores('proveedor')]);
      setSucursales(s || []);
      setProveedores(p || []);
      if (s?.length) setForm((f) => ({ ...f, sucursal_id: s[0].id }));
    } catch { /* sin listas: se puede cargar igual solo al catálogo */ }
  }

  async function confirmarCarga(e) {
    e.preventDefault();
    setErrCarga(''); setEnviando(true);
    try {
      const r = await cargarModeloEnCatalogo(carga.id, {
        codigo: form.codigo.trim() || undefined,
        costo: form.costo === '' ? undefined : Number(form.costo),
        margen_pct: form.margen_pct === '' ? undefined : Number(form.margen_pct),
        cantidad: Number(form.cantidad) || 0,
        sucursal_id: Number(form.cantidad) > 0 ? form.sucursal_id : undefined,
        proveedor_id: form.proveedor_id || undefined,
      });
      const base = r.reutilizado
        ? `${r.producto.nombre} ya estaba en tu catálogo (código ${r.producto.codigo}).`
        : `${r.producto.nombre} quedó cargado en tu catálogo (código ${r.producto.codigo}), con stock 0.`;
      setOkCarga(r.compra
        ? `${base} Pedido simulado de ${form.cantidad} u. en Compras (borrador N° ${r.compra.numero}): confirmalo cuando llegue y entra al stock.`
        : base);
      setCarga(null);
    } catch (err) {
      setErrCarga(err.response?.data?.error || 'No se pudo cargar el modelo');
    } finally {
      setEnviando(false);
    }
  }

  function handleBuscar(e) {
    e.preventDefault();
    cargar(q);
  }

  // Un modelo recién consultado (o devuelto por la caché) va al tope, sin duplicar.
  function handleAgregado(reg) {
    setCatalogo((prev) => [reg, ...prev.filter((m) => m.id !== reg.id)]);
  }

  // Opciones de filtro derivadas del catálogo cargado (sin valores vacíos).
  const opciones = useMemo(() => {
    const estilos = new Set();
    const materiales = new Set();
    const generos = new Set();
    catalogo.forEach((m) => {
      if (m.estilo) estilos.add(m.estilo);
      if (m.material) materiales.add(m.material);
      if (m.genero) generos.add(m.genero);
    });
    const ord = (s) => [...s].sort((a, b) => a.localeCompare(b));
    return { estilos: ord(estilos), materiales: ord(materiales), generos: ord(generos) };
  }, [catalogo]);

  // Aplica los filtros en memoria sobre lo ya traído de la API.
  const filtrado = useMemo(() => {
    return catalogo.filter((m) => {
      if (fEstilo && m.estilo !== fEstilo) return false;
      if (fMaterial && m.material !== fMaterial) return false;
      if (fGenero && m.genero !== fGenero) return false;
      if (fGraduacion === 'si' && !m.aptitud_graduacion) return false;
      if (fGraduacion === 'no' && m.aptitud_graduacion) return false;
      return true;
    });
  }, [catalogo, fEstilo, fMaterial, fGenero, fGraduacion]);

  const hayFiltros = fEstilo || fMaterial || fGenero || fGraduacion;

  function limpiarFiltros() {
    setFEstilo('');
    setFMaterial('');
    setFGenero('');
    setFGraduacion('');
  }

  return (
    <div className="stack seccion-con-fondo tema-oscuro">
      {/* Tema oscuro: fondo con brillo fucsia (paso 3 de la secuencia de entrada) */}
      <div className="seccion-fondo tema-oscuro__fondo" aria-hidden="true" />
      <div className="page-header">
        <h1>
          Catálogo de mercado
          <InfoBtn
            paraQue="Reúne modelos de marcas y lentes que NO tenés en el local, con sus especificaciones técnicas para consultarle al proveedor."
            comoFunciona="Buscá por marca o modelo, filtrá por estilo, material o género, y si sos admin agregá modelos nuevos que la IA enriquece con sus medidas."
            conQueFin="Saber qué podés ofrecer y pedir aunque no esté en stock, para no perder una venta cuando al cliente le interesa un modelo puntual."
          />
        </h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {/* Alta por IA (solo admin): trae specs de un modelo nuevo */}
      {esAdmin && <MercadoFormIA onAgregado={handleAgregado} inicial={{ marca: '', modelo: qInicial }} />}
      {okCarga && <p className="ok-text small" role="status">✓ {okCarga}</p>}

      {/* Buscador (API) + filtros (en memoria) */}
      <form className="searchbar" onSubmit={handleBuscar}>
        <input
          type="search"
          placeholder="Buscar por marca o modelo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={fEstilo} onChange={(e) => setFEstilo(e.target.value)}>
          <option value="">Todos los estilos</option>
          {opciones.estilos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
          <option value="">Todos los materiales</option>
          {opciones.materiales.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fGenero} onChange={(e) => setFGenero(e.target.value)}>
          <option value="">Todos los géneros</option>
          {opciones.generos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fGraduacion} onChange={(e) => setFGraduacion(e.target.value)}>
          <option value="">Graduación: todas</option>
          <option value="si">Apto graduación</option>
          <option value="no">No apto</option>
        </select>
        <button type="submit" className="btn btn--ghost">Buscar</button>
        {hayFiltros && (
          <button type="button" className="btn btn--ghost" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </form>

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : filtrado.length === 0 ? (
        <div className="card empty">
          <p>
            {catalogo.length === 0
              ? (q ? `“${q}” todavía no está en el catálogo. Usá “Buscar en el mercado” para traerlo de la web.` : 'Todavía no hay modelos en el catálogo de mercado.')
              : 'Ningún modelo coincide con la búsqueda o los filtros.'}
          </p>
        </div>
      ) : (
        <MercadoTabla
          items={filtrado}
          acciones={esAdmin ? (m) => (
            <button type="button" className="btn-mini btn-mini--wide" onClick={() => abrirCarga(m)}>
              Cargar en mi catálogo
            </button>
          ) : undefined}
        />
      )}
      {carga && (
        <Modal titulo={`Cargar · ${carga.marca} ${carga.modelo}`} onCerrar={() => setCarga(null)}>
          <form className="stack" onSubmit={confirmarCarga}>
            <p className="muted small">
              Se guarda como armazón en tu catálogo con sus medidas, género y material, y podés
              dejar un pedido simulado. El stock no cambia hasta que confirmes esa compra en Compras.
            </p>
            {errCarga && <p className="alert alert--error" role="alert">{errCarga}</p>}
            <div className="form-grid">
              <label className="field"><span>Código (opcional)</span>
                <input value={form.codigo} maxLength={50} placeholder="Se arma solo si lo dejás vacío"
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })} /></label>
              <label className="field"><span>Costo por unidad</span>
                <input type="number" min="0" step="0.01" value={form.costo}
                  onChange={(e) => setForm({ ...form, costo: e.target.value })} /></label>
              <label className="field"><span>Margen %</span>
                <input type="number" min="0" step="0.1" value={form.margen_pct}
                  onChange={(e) => setForm({ ...form, margen_pct: e.target.value })} /></label>
              <label className="field"><span>Cantidad a pedir (0 = solo catálogo)</span>
                <input type="number" min="0" step="1" value={form.cantidad}
                  onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></label>
              {Number(form.cantidad) > 0 && (
                <label className="field"><span>Sucursal que recibe</span>
                  <select value={form.sucursal_id} onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })} required>
                    {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select></label>
              )}
              <label className="field"><span>Proveedor (opcional)</span>
                <select value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}>
                  <option value="">Sin proveedor</option>
                  {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></label>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setCarga(null)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline" disabled={enviando}>
                {enviando ? 'Guardando…' : Number(form.cantidad) > 0 ? 'Cargar y simular pedido' : 'Cargar en mi catálogo'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
