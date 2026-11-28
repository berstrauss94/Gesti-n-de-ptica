// =====================================================================
// Lentes y otros: catálogo de cristales, tratamientos, contactología,
// accesorios y servicios de laboratorio, con precio de lista, rango de
// graduación y días de demora. Se navega por categoría (solapas debajo del buscador)
// o se busca por texto en toda la lista. Solo admin importa la lista (CSV)
// y ajusta precios en bloque.
// =====================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMarcadorSolapa } from '../hooks/useMarcadorSolapa';
import { listarCatalogoLab, contarCategoriasLab, importarCatalogoLab, ajustarPreciosLab } from '../api/laboratorio';
import { normalizar } from '../utils/busquedaNatural';
import InfoBtn from '../components/InfoBtn';
import Modal from '../components/Modal';
import { useEsAdmin } from '../hooks/useEsAdmin';
import { CATEGORIAS_LAB } from '../utils/catalogoLab';

const CATEGORIAS = CATEGORIAS_LAB;

const precio = (p) => `$ ${Number(p).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const escapeHtml = (t) => String(t ?? '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

// Alias de columnas aceptados en el CSV (ya normalizados: sin acentos, "_" por espacio).
const ALIAS = {
  id: ['id', 'codigo', 'cod'],
  categoria: ['categoria', 'rubro'],
  subcategoria_grupo: ['subcategoria_grupo', 'subcategoria', 'grupo'],
  marca_proveedor: ['marca_proveedor', 'marca', 'proveedor'],
  descripcion: ['descripcion', 'detalle', 'nombre'],
  esfera_min: ['esfera_min', 'esf_min'],
  esfera_max: ['esfera_max', 'esf_max'],
  cilindro_min: ['cilindro_min', 'cil_min'],
  cilindro_max: ['cilindro_max', 'cil_max'],
  badge_graduacion_raw: ['badge_graduacion_raw', 'graduacion', 'badge'],
  dias_demora: ['dias_demora', 'dias', 'demora'],
  precio_lista: ['precio_lista', 'precio', 'pvp'],
  es_servicio: ['es_servicio', 'servicio'],
  es_insumo_mostrador: ['es_insumo_mostrador', 'insumo'],
};

// "12.500,50" -> "12500.50"; "1250.5" se deja igual.
function numeroAR(v) {
  const t = String(v ?? '').trim();
  return t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
}

function parsearCSV(texto) {
  const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lineas.length < 2) return { error: 'El archivo está vacío o no tiene filas.' };
  const sep = lineas[0].includes(';') ? ';' : lineas[0].includes('\t') ? '\t' : ',';
  const limpiar = (c) => c.trim().replace(/^"|"$/g, '');
  const enc = lineas[0].split(sep).map((h) => normalizar(limpiar(h)).replace(/\s+/g, '_'));
  const idx = {};
  Object.entries(ALIAS).forEach(([campo, nombres]) => { idx[campo] = enc.findIndex((h) => nombres.includes(h)); });
  const faltan = ['categoria', 'descripcion', 'precio_lista'].filter((c) => idx[c] < 0);
  if (faltan.length) return { error: `Faltan columnas obligatorias: ${faltan.join(', ')}.` };
  const filas = lineas.slice(1).map((l) => {
    const celdas = l.split(sep).map(limpiar);
    const get = (c) => (idx[c] >= 0 ? celdas[idx[c]] : undefined);
    const fila = {};
    Object.keys(ALIAS).forEach((c) => {
      const v = get(c);
      if (v === undefined || v === '') return;
      fila[c] = ['esfera_min', 'esfera_max', 'cilindro_min', 'cilindro_max', 'precio_lista'].includes(c) ? numeroAR(v) : v;
    });
    return fila;
  });
  return { filas };
}

export default function LentesPage() {
  const esAdmin = useEsAdmin();
  const [categoria, setCategoria] = useState(CATEGORIAS[0]);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState(''); // texto aplicado (al buscar)
  const [items, setItems] = useState([]);
  const [conteo, setConteo] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargarConteo = useCallback(async () => {
    try {
      const filas = await contarCategoriasLab();
      setConteo(Object.fromEntries(filas.map((f) => [f.categoria, f.cantidad])));
    } catch { /* el conteo es decorativo */ }
  }, []);

  const cargar = useCallback(async (cat, texto) => {
    setCargando(true); setError('');
    try {
      // Con texto se busca en toda la lista; sin texto, solo en la categoría elegida.
      setItems(await listarCatalogoLab(texto ? { q: texto } : { categoria: cat }));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el catálogo');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarConteo(); }, [cargarConteo]);
  // --- Tema oscuro: marcador que se desliza a la solapa activa ---
  const tabsRef = useRef(null);
  const marcador = useMarcadorSolapa(tabsRef, '.lab-tab.is-active', [categoria, busqueda, conteo], 'lab-tabs__marcador');
  // Entrada escalonada: en la primera carga las tarjetas esperan a que termine
  // de entrar el contenido (paso 4 de la secuencia, 0.8s + 0.7s); al cambiar de
  // categoría arrancan enseguida.
  const [primeraEntrada, setPrimeraEntrada] = useState(true);
  useEffect(() => { const t = setTimeout(() => setPrimeraEntrada(false), 1500); return () => clearTimeout(t); }, []);
  useEffect(() => { cargar(categoria, busqueda); }, [categoria, busqueda, cargar]);

  function elegirCategoria(c) { setQ(''); setBusqueda(''); setCategoria(c); }
  function buscar(e) { e.preventDefault(); setBusqueda(q.trim()); }

  const grupos = useMemo(() => {
    const mapa = new Map();
    items.forEach((it) => {
      const g = it.subcategoria_grupo || 'General';
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g).push(it);
    });
    // El backend ya los manda en el orden de la lista del laboratorio (orden_lista).
    return [...mapa.entries()];
  }, [items]);

  // --- Imprimir lo que se ve (ventana aparte, sin menú ni botones) ---
  function imprimir() {
    if (!items.length) { setError('No hay ítems para imprimir.'); return; }
    const titulo = busqueda ? `Búsqueda: ${busqueda}` : categoria;
    const filas = items.map((s) => `<tr><td>${s.id}</td><td>${escapeHtml(s.subcategoria_grupo)}</td><td>${escapeHtml(s.descripcion)}</td>
      <td>${escapeHtml(s.badge_graduacion_raw)}</td><td class="num">${s.dias_demora ?? ''}</td><td class="num">${precio(s.precio_lista)}</td></tr>`).join('');
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) { setError('El navegador bloqueó la ventana de impresión.'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Lentes y otros</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: system-ui, sans-serif; font-size: 11px; color: #111; }
        h1 { font-size: 16px; margin: 0 0 2px; } p { margin: 0 0 8px; color: #444; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #bbb; padding: 3px 5px; text-align: left; }
        th { background: #eee; } .num { text-align: right; }
        thead { display: table-header-group; } tr { page-break-inside: avoid; }
      </style></head><body>
      <h1>Lentes y otros</h1><p>${escapeHtml(titulo)} · ${items.length} ítem(s) · ${new Date().toLocaleDateString('es-AR')}</p>
      <table><thead><tr><th>ID</th><th>Grupo</th><th>Descripción</th><th>Graduación</th><th>Días</th><th>Precio</th></tr></thead><tbody>${filas}</tbody></table>
      <script>window.onload = function(){ window.print(); };<\/script></body></html>`);
    win.document.close();
  }

  // --- Importar lista (admin) ---
  const [imp, setImp] = useState(null); // { nombre, filas } | { error }
  const [impResultado, setImpResultado] = useState(null);
  const [impEnviando, setImpEnviando] = useState(false);

  async function onArchivo(archivo) {
    if (!archivo) return;
    setImpResultado(null);
    const r = parsearCSV(await archivo.text());
    setImp(r.error ? { nombre: archivo.name, error: r.error } : { nombre: archivo.name, filas: r.filas });
  }
  async function confirmarImportacion() {
    setImpEnviando(true);
    try {
      setImpResultado(await importarCatalogoLab(imp.filas));
      cargarConteo(); cargar(categoria, busqueda);
    } catch (err) {
      setImpResultado({ fallo: err.response?.data?.error || 'No se pudo importar la lista' });
    } finally {
      setImpEnviando(false);
    }
  }

  // --- Ajustar precios en bloque (admin): primero se ve el efecto, después se aplica ---
  const AJ_VACIO = { porcentaje: '', alcance: 'categoria', marca: '' };
  const [aj, setAj] = useState(null);
  const [ajSim, setAjSim] = useState(null);
  const [ajError, setAjError] = useState('');
  const [ajEnviando, setAjEnviando] = useState(false);

  const cuerpoAjuste = (extra) => ({
    porcentaje: Number(String(aj.porcentaje).replace(',', '.')),
    categoria: aj.alcance === 'categoria' ? categoria : undefined,
    marca_proveedor: aj.alcance === 'marca' ? aj.marca.trim() : undefined,
    todo: aj.alcance === 'todo' ? true : undefined,
    ...extra,
  });
  function cambiarAj(parcial) { setAj((a) => ({ ...a, ...parcial })); setAjSim(null); setAjError(''); }
  async function verEfecto(e) {
    e.preventDefault();
    setAjEnviando(true); setAjError('');
    try { setAjSim(await ajustarPreciosLab(cuerpoAjuste({ simular: true }))); }
    catch (err) { setAjError(err.response?.data?.error || 'No se pudo calcular el efecto'); }
    finally { setAjEnviando(false); }
  }
  async function aplicarAjuste() {
    setAjEnviando(true); setAjError('');
    try {
      const r = await ajustarPreciosLab(cuerpoAjuste({}));
      setOk(`Precios actualizados: ${r.registros_actualizados} ítem(s).`);
      setAj(null); setAjSim(null);
      cargar(categoria, busqueda);
    } catch (err) { setAjError(err.response?.data?.error || 'No se pudo aplicar el ajuste'); }
    finally { setAjEnviando(false); }
  }

  return (
    <div className="stack seccion-con-fondo lab-oscuro">
      {/* Paso 3 de la secuencia: fondo oscuro con brillo fucsia (sin imagen) */}
      <div className="seccion-fondo lab-oscuro__fondo" aria-hidden="true" />
      <div className="page-header">
        <h1>
          Lentes y otros
          <InfoBtn
            paraQue="Reúne los cristales, tratamientos, lentes de contacto, accesorios y servicios del laboratorio con su precio, rango de graduación y días de demora."
            comoFunciona="Elegí una categoría en las solapas de arriba o buscá por nombre, grupo, marca o código; si sos admin cargá la lista desde un CSV y ajustá los precios por porcentaje."
            conQueFin="Cotizar al cliente y armar el sobre sin errores: saber qué cristal soporta su receta, cuánto cuesta y cuándo llega."
          />
        </h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="ok-text small" role="status">✓ {ok}</p>}

      <form className="searchbar" onSubmit={buscar}>
        <input
          type="search"
          placeholder="Buscar cristal, código, grupo o marca…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn--ghost">Buscar</button>
        {busqueda && (
          <button type="button" className="btn btn--ghost" onClick={() => elegirCategoria(categoria)}>
            Limpiar búsqueda
          </button>
        )}
        <button type="button" className="btn btn--ghost btn--inline" onClick={imprimir}>Imprimir</button>
        {esAdmin && (
          <>
            <button type="button" className="btn btn--ghost btn--inline" onClick={() => { setOk(''); setAj(AJ_VACIO); setAjSim(null); setAjError(''); }}>
              Ajustar precios
            </button>
            <button type="button" className="btn btn--primary btn--inline" onClick={() => { setImp({}); setImpResultado(null); }}>
              Importar lista
            </button>
          </>
        )}
      </form>

      {/* Categorías como solapas, de izquierda a derecha, debajo del buscador */}
      <nav className="lab-tabs" role="tablist" aria-label="Categorías" ref={tabsRef}>
        <span className={marcador.clase} aria-hidden="true" style={marcador.style} />
        {CATEGORIAS.map((c) => {
          const activa = !busqueda && c === categoria;
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={activa}
              className={activa ? 'lab-tab is-active' : 'lab-tab'}
              onClick={() => elegirCategoria(c)}
            >
              <span>{c}</span>
              {conteo[c] != null && <span className="lab-tab__n">{conteo[c]}</span>}
            </button>
          );
        })}
      </nav>

      {busqueda && (
        <p className="muted small" role="status">Buscando “{busqueda}” en todas las categorías.</p>
      )}

      <div className="lab-layout">
        <div>
          {cargando ? (
            <p className="muted">Cargando…</p>
          ) : grupos.length === 0 ? (
            <div className="card empty">
              <p>
                {busqueda
                  ? `No hay ítems que coincidan con “${busqueda}”.`
                  : 'Esta categoría todavía no tiene ítems.'}
              </p>
              {esAdmin && !busqueda && (
                <p className="muted small">Cargá la lista del laboratorio con “Importar lista” (CSV).</p>
              )}
            </div>
          ) : (
            <div
              key={busqueda ? `q:${busqueda}` : categoria}
              className={`${grupos.length === 1 ? 'lab-grid lab-grid--uno' : 'lab-grid'}${primeraEntrada ? ' lab-grid--primera' : ''}`}
            >
              {grupos.map(([grupo, lista], i) => (
                <div key={grupo} className="lab-card lab-card--entra" style={{ '--i': Math.min(i, 12) }}>
                  <div className="lab-card__head"><span>{grupo}</span><span>{lista.length}</span></div>
                  {lista.map((it) => (
                    <div key={it.id} className="lab-row">
                      <div className="lab-row__cod">
                        <span className="lab-id">{it.id}</span>
                        {it.marca_proveedor && <span className="lab-marca">{it.marca_proveedor}</span>}
                      </div>
                      <div className="lab-row__main">
                        <span className="lab-row__desc">{it.descripcion}</span>
                        {it.badge_graduacion_raw && <span className="lab-badge lab-badge--grad">{it.badge_graduacion_raw}</span>}
                        {it.dias_demora != null && <span className="lab-badge lab-badge--dias">⏱ {it.dias_demora} días</span>}
                        {busqueda && <span className="muted small">{it.categoria}</span>}
                      </div>
                      <span className="lab-row__precio">{precio(it.precio_lista)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {imp && (
        <Modal titulo="Importar lista de lentes y servicios" onCerrar={() => { setImp(null); setImpResultado(null); }}>
          <div className="stack">
            <p className="muted small">
              CSV con encabezados. Obligatorias: categoria, descripcion, precio_lista. Opcionales: id, subcategoria_grupo,
              marca_proveedor, esfera_min, esfera_max, cilindro_min, cilindro_max, graduacion, dias_demora, es_servicio,
              es_insumo_mostrador. Con id se actualiza el ítem (o se crea con ese id); sin id se crea uno nuevo. Una fila con
              error no corta las demás.
            </p>
            <input type="file" accept=".csv,.txt" onChange={(e) => { onArchivo(e.target.files?.[0]); e.target.value = ''; }} />
            {imp.error && <p className="alert alert--error" role="alert">{imp.error}</p>}
            {imp.filas && !impResultado && (
              <p className="small">Se leyeron <strong>{imp.filas.length}</strong> filas de {imp.nombre}.</p>
            )}
            {impResultado?.fallo && <p className="alert alert--error" role="alert">{impResultado.fallo}</p>}
            {impResultado && !impResultado.fallo && (
              <div className="small">
                <p className="ok-text">✓ Nuevos: {impResultado.creados} · Actualizados: {impResultado.actualizados} · Con error: {impResultado.errores.length}</p>
                {impResultado.errores.length > 0 && (
                  <ul>
                    {impResultado.errores.slice(0, 15).map((e) => <li key={e.fila}>Fila {e.fila}: {e.error}</li>)}
                  </ul>
                )}
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => { setImp(null); setImpResultado(null); }}>
                {impResultado ? 'Cerrar' : 'Cancelar'}
              </button>
              {imp.filas && !impResultado && (
                <button type="button" className="btn btn--primary btn--inline" disabled={impEnviando || imp.filas.length === 0} onClick={confirmarImportacion}>
                  {impEnviando ? 'Importando…' : `Importar ${imp.filas.length} filas`}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {aj && (
        <Modal titulo="Ajustar precios en bloque" onCerrar={() => setAj(null)}>
          <form className="stack" onSubmit={verEfecto}>
            <div className="form-grid">
              <label className="field"><span>Porcentaje (ej: 15 o -10)</span>
                <input value={aj.porcentaje} inputMode="decimal" required onChange={(e) => cambiarAj({ porcentaje: e.target.value })} /></label>
              <label className="field"><span>Se aplica a</span>
                <select value={aj.alcance} onChange={(e) => cambiarAj({ alcance: e.target.value })}>
                  <option value="categoria">Solo la categoría: {categoria}</option>
                  <option value="marca">Una marca o proveedor</option>
                  <option value="todo">Todo el catálogo</option>
                </select></label>
              {aj.alcance === 'marca' && (
                <label className="field"><span>Marca o proveedor (nombre exacto)</span>
                  <input value={aj.marca} required onChange={(e) => cambiarAj({ marca: e.target.value })} /></label>
              )}
            </div>
            {ajError && <p className="alert alert--error" role="alert">{ajError}</p>}
            {ajSim && (
              <p className="small" role="status">
                Cambian <strong>{ajSim.cantidad}</strong> ítem(s). La suma de precios pasa de{' '}
                <strong>{precio(ajSim.total_actual)}</strong> a <strong>{precio(ajSim.total_nuevo)}</strong>.
                Los precios se redondean a 2 decimales. Revisalo: no se puede deshacer.
              </p>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setAj(null)}>Cancelar</button>
              <button type="submit" className="btn btn--ghost btn--inline" disabled={ajEnviando}>Ver efecto</button>
              <button type="button" className="btn btn--primary btn--inline" disabled={ajEnviando || !ajSim || ajSim.cantidad === 0} onClick={aplicarAjuste}>
                Aplicar ajuste
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
