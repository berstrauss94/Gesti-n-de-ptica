// =====================================================================
// Módulo de Stock / Inventario (multisucursal).
// - Selector de sucursal.
// - Listado de existencias con búsqueda parcial (tolera errores de tipeo),
//   filtros tipo Optix (marca, género, material, ubicación, proveedor) y
//   paginado (Mostrar 20 / 50 / 100 / Todos).
// - Alta y edición de producto (con código de barras, atributos de filtro y
//   recálculo de precio).
// - Registro de movimientos (entrada/salida/ajuste).
// - Recálculo masivo de precios por margen.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  listarSucursales,
  crearProducto,
  actualizarProducto,
  eliminarProducto,
  listarStock,
  registrarMovimiento,
  listarMovimientos,
  recalcularPrecios,
  listarFiltrosStock,
  crearTraslado,
  importarListaPrecios,
} from '../api/stock';
import fondoStock from '../assets/fondo-stock.jpg';
import { barcodeSVG } from '../utils/barcode';
import { interpretarBusqueda, normalizar } from '../utils/busquedaNatural';
import InfoBtn from '../components/InfoBtn';
import Modal from '../components/Modal';
import { useEsAdmin } from '../hooks/useEsAdmin';

const CATEGORIAS = ['armazon', 'cristal', 'lente_contacto', 'accesorio', 'otro'];
const CAT_LABEL = {
  armazon: 'Armazón', cristal: 'Cristal', lente_contacto: 'Lente de contacto',
  accesorio: 'Accesorio', otro: 'Otro',
};

// Atributos de filtro. Los géneros son una lista cerrada (la valida el backend);
// material y ubicación son texto libre con sugerencias.
const GENEROS = ['Hombre', 'Mujer', 'Unisex', 'Niño'];
const MATERIALES_SUGERIDOS = ['Acetato', 'Metal', 'Titanio', 'Inyección'];
const UBICACIONES_SUGERIDAS = ['Expositor A', 'Expositor B', 'Expositor C'];

// "Mostrar": filas por página. "Todos" pide el tope del backend.
const TODOS = 1000;
const TAMANIOS = [20, 50, 100, TODOS];

const FILTROS_VACIOS = { marca: '', genero: '', material: '', ubicacion: '', proveedor: '' };
const OPCIONES_VACIAS = { marcas: [], generos: [], materiales: [], ubicaciones: [], proveedores: [] };
const PRODUCTO_VACIO = {
  codigo: '', codigo_barras: '', nombre: '', categoria: 'armazon',
  marca: '', costo_base: '', margen_pct: '', cantidad: '',
  genero: '', material: '', ubicacion: '', proveedor_id: '',
};

// Une las opciones guardadas con las sugeridas, sin repetir y ordenadas.
function unirOpciones(guardadas, sugeridas) {
  return [...new Set([...(guardadas || []), ...sugeridas])].sort((a, b) => a.localeCompare(b));
}

// Parámetros del listado a partir de los filtros de la pantalla.
function paramsListado(sucursalId, q, f, limit, offset) {
  return {
    sucursal_id: sucursalId,
    q: q || undefined,
    marca: f.marca || undefined,
    genero: f.genero || undefined,
    material: f.material || undefined,
    ubicacion_prod: f.ubicacion || undefined,
    proveedor_id: f.proveedor || undefined,
    limit,
    offset,
  };
}

export default function StockPage() {
  const esAdmin = useEsAdmin();
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState('');
  const [stock, setStock] = useState([]);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  // Filtros, opciones de los desplegables y paginado
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [opciones, setOpciones] = useState(OPCIONES_VACIAS);
  const [porPagina, setPorPagina] = useState(20);
  const [pagina, setPagina] = useState(0);
  const [total, setTotal] = useState(0);
  const [parecidos, setParecidos] = useState(false);
  // Lo que el intérprete de búsqueda detectó en el texto ("Género Mujer", …).
  const [interpretado, setInterpretado] = useState([]);

  const [mostrarAlta, setMostrarAlta] = useState(false);
  const [prod, setProd] = useState(PRODUCTO_VACIO);

  // Edición de producto (modal) e historial de movimientos (modal)
  const [editando, setEditando] = useState(null); // producto en edición
  const [historial, setHistorial] = useState(null); // { producto, movimientos } | null

  // Traslado entre sucursales
  const [traslado, setTraslado] = useState(null); // { producto } en traslado
  const [trasladoForm, setTrasladoForm] = useState({ destino_id: '', cantidad: '', motivo: '' });

  // Importación de lista de precios (CSV de proveedor)
  const [importar, setImportar] = useState(null); // { filas, crearNuevos } | null
  const [importResultado, setImportResultado] = useState(null);

  const cargarOpciones = useCallback(async () => {
    try {
      setOpciones({ ...OPCIONES_VACIAS, ...(await listarFiltrosStock()) });
    } catch {
      setOpciones(OPCIONES_VACIAS); // sin opciones, los filtros quedan en "Todos"
    }
  }, []);

  // Carga inicial de sucursales y opciones de filtro
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
    cargarOpciones();
  }, [cargarOpciones]);

  const cargarStock = useCallback(async (sid, busqueda, f, pag, tam) => {
    if (!sid) return;
    setCargando(true); setError('');
    try {
      const data = await listarStock(paramsListado(sid, busqueda, f, tam, pag * tam));
      setStock(data.stock);
      setTotal(data.total ?? data.stock.length);
      setParecidos(Boolean(data.parecidos));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el stock');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargarStock(sucursalId, q, filtros, pagina, porPagina); }, [sucursalId, filtros, pagina, porPagina, cargarStock]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recarga la página actual con los filtros vigentes (tras altas, ediciones, movimientos).
  function refrescar() { cargarStock(sucursalId, q, filtros, pagina, porPagina); }

  // Cambiar un filtro o la cantidad por página vuelve a la primera página.
  function setFiltro(campo, valor) { setPagina(0); setInterpretado([]); setFiltros((f) => ({ ...f, [campo]: valor })); }
  function limpiarFiltros() { setPagina(0); setInterpretado([]); setFiltros(FILTROS_VACIOS); }
  const hayFiltros = Object.values(filtros).some(Boolean);

  // Buscar: primero interpreta el texto ("marcos de mujer en metal") y pasa lo
  // que reconoce a los desplegables, así queda a la vista y se puede cambiar.
  function buscar(e) {
    e.preventDefault();
    const r = interpretarBusqueda(q, { materiales: [...opciones.materiales, ...MATERIALES_SUGERIDOS] });
    const nuevos = {
      ...filtros,
      genero: r.genero || filtros.genero,
      material: r.material || filtros.material,
    };
    const cambian = nuevos.genero !== filtros.genero || nuevos.material !== filtros.material;
    setInterpretado(r.detectado);
    if (r.q !== q) setQ(r.q);
    if (cambian || pagina !== 0) {
      setPagina(0);
      setFiltros(nuevos); // el efecto recarga con la búsqueda y los filtros nuevos
    } else {
      cargarStock(sucursalId, r.q, filtros, 0, porPagina);
    }
  }

  // Precio calculado en vivo en el form de alta
  const precioCalculado = useMemo(() => {
    const c = Number(prod.costo_base) || 0;
    const m = Number(prod.margen_pct) || 0;
    return Math.round(c * (1 + m / 100) * 100) / 100;
  }, [prod.costo_base, prod.margen_pct]);

  const materiales = useMemo(() => unirOpciones(opciones.materiales, MATERIALES_SUGERIDOS), [opciones.materiales]);
  const ubicaciones = useMemo(() => unirOpciones(opciones.ubicaciones, UBICACIONES_SUGERIDAS), [opciones.ubicaciones]);

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
        genero: prod.genero || undefined,
        material: prod.material.trim() || undefined,
        ubicacion: prod.ubicacion.trim() || undefined,
        proveedor_id: prod.proveedor_id || undefined,
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
      setProd(PRODUCTO_VACIO);
      setMostrarAlta(false);
      refrescar();
      cargarOpciones();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el producto');
    }
  }

  // Movimiento rápido (+/- 1 o ajuste) sobre una fila
  async function mover(producto_id, tipo, cantidad) {
    setError(''); setOk('');
    try {
      await registrarMovimiento({ producto_id, sucursal_id: sucursalId, tipo, cantidad, motivo: 'ajuste manual' });
      refrescar();
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
      refrescar();
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
      genero: s.genero || '',
      material: s.material || '',
      ubicacion: s.ubicacion_prod || '',
      proveedor_id: s.proveedor_id || '',
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
        // '' borra el dato (el backend lo guarda como vacío)
        genero: editando.genero,
        material: editando.material.trim(),
        ubicacion: editando.ubicacion.trim(),
        proveedor_id: editando.proveedor_id,
      });
      setOk(`Producto "${editando.nombre}" actualizado.`);
      setEditando(null);
      refrescar();
      cargarOpciones();
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
      refrescar();
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

  // Exporta a CSV TODO lo que coincide con la búsqueda y los filtros actuales
  // (no solo la página visible), hasta el tope del backend.
  async function exportarCSV() {
    setError(''); setOk('');
    let filas;
    try {
      filas = (await listarStock(paramsListado(sucursalId, q, filtros, TODOS, 0))).stock;
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo preparar la exportación');
      return;
    }
    if (!filas.length) {
      setError('No hay productos para exportar.');
      return;
    }
    const cols = ['Código', 'Código de barras', 'Nombre', 'Categoría', 'Marca', 'Género', 'Material', 'Ubicación', 'Proveedor', 'Precio', 'Cantidad', 'Bajo mínimo'];
    const esc = (v) => {
      const t = v == null ? '' : String(v);
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const lineas = filas.map((s) => [
      s.codigo,
      s.codigo_barras || '',
      s.nombre,
      CAT_LABEL[s.categoria] || s.categoria,
      s.marca || '',
      s.genero || '',
      s.material || '',
      s.ubicacion_prod || '',
      s.proveedor_nombre || '',
      Number(s.precio_venta).toFixed(2),
      s.cantidad,
      s.bajo_minimo ? 'sí' : 'no',
    ].map(esc).join(';'));
    const csv = [cols.join(';'), ...lineas].join('\r\n');
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
    setOk(`Stock exportado a CSV (${filas.length} productos).`);
  }

  // Parsea un CSV simple (coma o punto y coma) con encabezados y mapea las
  // columnas conocidas a los campos de producto. Abre el modal de importación.
  function parsearCSV(texto) {
    const lineas = String(texto || '').trim().split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lineas.length < 2) { setError('El CSV debe tener encabezado y al menos una fila.'); return; }
    const sep = lineas[0].includes(';') ? ';' : ',';
    // Encabezados sin acentos, en minúscula y con "_" en lugar de espacios:
    // "Género", "genero" y "GENERO" se leen igual; "Proveedor ID" -> "proveedor_id".
    const encabezados = lineas[0].split(sep).map((h) => normalizar(h.trim().replace(/^"|"$/g, '')).replace(/\s+/g, '_'));
    // Alias aceptados por campo (ya normalizados)
    const alias = {
      codigo: ['codigo', 'code', 'sku'],
      nombre: ['nombre', 'descripcion', 'detalle', 'producto'],
      categoria: ['categoria', 'rubro'],
      marca: ['marca'],
      costo_base: ['costo', 'costo_base', 'precio_costo', 'costounitario'],
      margen_pct: ['margen', 'margen_pct', 'markup'],
      precio_venta: ['precio', 'precio_venta', 'pvp', 'precioventa'],
      genero: ['genero', 'sexo'],
      material: ['material'],
      ubicacion: ['ubicacion', 'ubicacion_prod', 'exhibidor', 'expositor'],
      proveedor: ['proveedor', 'proveedor_nombre'],
      proveedor_id: ['proveedor_id', 'id_proveedor'],
    };
    const idx = {};
    Object.entries(alias).forEach(([campo, nombres]) => {
      idx[campo] = encabezados.findIndex((h) => nombres.includes(h));
    });
    if (idx.codigo < 0) { setError('El CSV debe tener una columna "codigo".'); return; }

    const filas = [];
    for (let i = 1; i < lineas.length; i += 1) {
      const celdas = lineas[i].split(sep).map((c) => c.trim());
      const get = (campo) => (idx[campo] >= 0 ? celdas[idx[campo]] : undefined);
      const num = (v) => {
        if (v === undefined || v === '') return undefined;
        return Number(String(v).replace(/\./g, '').replace(',', '.')) || Number(v) || undefined;
      };
      filas.push({
        codigo: get('codigo'),
        nombre: get('nombre') || undefined,
        categoria: get('categoria') || undefined,
        marca: get('marca') || undefined,
        costo_base: num(get('costo_base')),
        margen_pct: num(get('margen_pct')),
        precio_venta: num(get('precio_venta')),
        // Atributos: celda vacía = no tocar lo guardado (lo resuelve el backend).
        genero: get('genero') || undefined,
        material: get('material') || undefined,
        ubicacion: get('ubicacion') || undefined,
        proveedor: get('proveedor') || undefined,
        proveedor_id: get('proveedor_id') || undefined,
      });
    }
    setImportResultado(null);
    setImportar({ filas, crearNuevos: true });
  }

  function onArchivoCSV(file) {
    if (!file) return;
    setError('');
    const reader = new FileReader();
    reader.onload = () => parsearCSV(String(reader.result || ''));
    reader.readAsText(file);
  }

  async function confirmarImportacion() {
    if (!importar?.filas?.length) return;
    setError(''); setOk('');
    try {
      const r = await importarListaPrecios(importar.filas, importar.crearNuevos);
      setImportResultado(r);
      setOk(`Importación: ${r.actualizados} actualizados, ${r.creados} creados, ${r.errores.length} con error.`);
      refrescar();
      cargarOpciones();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo importar la lista de precios');
    }
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
      refrescar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo realizar el traslado');
    }
  }

  // Campos de atributos (género, material, ubicación, proveedor), compartidos
  // entre el alta y la edición. `datos` es el objeto del formulario.
  function camposAtributos(datos, cambiar) {
    return (
      <>
        <label className="field"><span>Género</span>
          <select value={datos.genero} onChange={(e) => cambiar('genero', e.target.value)}>
            <option value="">Sin indicar</option>
            {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
          </select></label>
        <label className="field"><span>Material</span>
          <input list="stock-materiales" maxLength={40} value={datos.material}
            onChange={(e) => cambiar('material', e.target.value)} placeholder="Acetato, Metal…" /></label>
        <label className="field"><span>Ubicación</span>
          <input list="stock-ubicaciones" maxLength={40} value={datos.ubicacion}
            onChange={(e) => cambiar('ubicacion', e.target.value)} placeholder="Expositor A…" /></label>
        <label className="field"><span>Proveedor</span>
          <select value={datos.proveedor_id} onChange={(e) => cambiar('proveedor_id', e.target.value)}>
            <option value="">Sin indicar</option>
            {opciones.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select></label>
      </>
    );
  }

  const desde = total === 0 ? 0 : pagina * porPagina + 1;
  const hasta = Math.min((pagina + 1) * porPagina, total);
  const hayAnterior = pagina > 0;
  const haySiguiente = (pagina + 1) * porPagina < total;

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
            comoFunciona="Elegí la sucursal, buscá aunque sea con parte del nombre, filtrá por marca, género, material, ubicación o proveedor, y ajustá cantidades con los botones +/−."
            conQueFin="Saber qué hay en stock en cada local, encontrarlo rápido y mantener los precios de venta actualizados."
          />
        </h1>
        <div className="tryon-toolbar">
          <select value={sucursalId} onChange={(e) => { setPagina(0); setSucursalId(e.target.value); }}>
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
              <label className="btn btn--ghost btn--inline" style={{ cursor: 'pointer', margin: 0 }}>
                Importar precios
                <input type="file" accept=".csv,.txt" style={{ display: 'none' }}
                  onChange={(e) => { onArchivoCSV(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <button type="button" className="btn btn--primary btn--inline" onClick={() => setMostrarAlta((v) => !v)}>
                {mostrarAlta ? 'Cerrar' : '+ Nuevo producto'}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {/* Sugerencias para material y ubicación (alta y edición) */}
      <datalist id="stock-materiales">{materiales.map((m) => <option key={m} value={m} />)}</datalist>
      <datalist id="stock-ubicaciones">{ubicaciones.map((u) => <option key={u} value={u} />)}</datalist>

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
            <input list="stock-marcas" value={prod.marca} onChange={(e) => setCampo('marca', e.target.value)} /></label>
          {camposAtributos(prod, setCampo)}
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
      <datalist id="stock-marcas">{opciones.marcas.map((m) => <option key={m} value={m} />)}</datalist>

      {/* Búsqueda parcial + filtros tipo Optix */}
      <form className="searchbar searchbar--filtros" onSubmit={buscar}>
        <input type="search" placeholder="Buscar por nombre, código, código de barras o marca (ej: “Ray”)…" value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn btn--ghost">Buscar</button>
        <select aria-label="Marca" value={filtros.marca} onChange={(e) => setFiltro('marca', e.target.value)}>
          <option value="">Todas las marcas</option>
          {opciones.marcas.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Género" value={filtros.genero} onChange={(e) => setFiltro('genero', e.target.value)}>
          <option value="">Todos los géneros</option>
          {GENEROS.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <select aria-label="Material" value={filtros.material} onChange={(e) => setFiltro('material', e.target.value)}>
          <option value="">Todos los materiales</option>
          {/* Incluye el material detectado en la búsqueda aunque todavía no esté cargado en ningún producto */}
          {[...new Set([...opciones.materiales, filtros.material].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Ubicación" value={filtros.ubicacion} onChange={(e) => setFiltro('ubicacion', e.target.value)}>
          <option value="">Todas las ubicaciones</option>
          {opciones.ubicaciones.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        <select aria-label="Proveedor" value={filtros.proveedor} onChange={(e) => setFiltro('proveedor', e.target.value)}>
          <option value="">Todos los proveedores</option>
          {opciones.proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <select aria-label="Mostrar" value={porPagina} onChange={(e) => { setPagina(0); setPorPagina(Number(e.target.value)); }}>
          {TAMANIOS.map((t) => <option key={t} value={t}>{t === TODOS ? 'Mostrar todos' : `Mostrar ${t}`}</option>)}
        </select>
        {hayFiltros && (
          <button type="button" className="btn btn--ghost" onClick={limpiarFiltros}>Limpiar filtros</button>
        )}
      </form>

      {interpretado.length > 0 && (
        <p className="muted small" role="status">
          Busqué con: <strong>{interpretado.join(' · ')}</strong>. Podés cambiarlo en los desplegables.
        </p>
      )}

      {parecidos && !cargando && (
        <p className="muted small" role="status">
          No hubo coincidencias exactas con “{q}”: te mostramos los productos más parecidos.
        </p>
      )}

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : stock.length === 0 ? (
        <div className="card empty">
          <p>{q || hayFiltros ? 'Ningún producto coincide con la búsqueda o los filtros.' : 'Sin productos con stock en esta sucursal.'}</p>
        </div>
      ) : (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr><th>Producto</th><th>Categoría</th><th>Precio</th><th>Cantidad</th><th>Movimiento</th></tr>
            </thead>
            <tbody>
              {stock.map((s) => {
                const atributos = [s.marca, s.genero, s.material, s.ubicacion_prod, s.proveedor_nombre].filter(Boolean);
                return (
                  <tr key={s.id} className={s.bajo_minimo ? 'fila-alerta' : ''}>
                    <td>
                      <strong>{s.nombre}</strong>
                      <div className="muted small">{s.codigo}{s.codigo_barras ? ` · ${s.codigo_barras}` : ''}</div>
                      {atributos.length > 0 && <div className="muted small">{atributos.join(' · ')}</div>}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginado */}
      {!cargando && total > 0 && (
        <div className="paginado" role="navigation" aria-label="Paginado del stock">
          <span className="muted small">Mostrando {desde}–{hasta} de {total}</span>
          <button type="button" className="btn btn--ghost btn--inline" disabled={!hayAnterior} onClick={() => setPagina((p) => p - 1)}>
            ← Anterior
          </button>
          <button type="button" className="btn btn--ghost btn--inline" disabled={!haySiguiente} onClick={() => setPagina((p) => p + 1)}>
            Siguiente →
          </button>
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
              <input list="stock-marcas" value={editando.marca} onChange={(e) => setEditando({ ...editando, marca: e.target.value })} /></label>
            {camposAtributos(editando, (c, v) => setEditando((ed) => ({ ...ed, [c]: v })))}
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

      {/* Modal: importar lista de precios (solo admin) */}
      {importar && (
        <Modal titulo="Importar lista de precios" onCerrar={() => { setImportar(null); setImportResultado(null); }}>
          <p className="muted small">
            Se leyeron <strong>{importar.filas.length}</strong> filas del CSV. Se actualizan los productos
            por <strong>código</strong>; los que no existan se crean si está tildada la opción de abajo.
            Columnas reconocidas: codigo, nombre, categoria, marca, costo, margen, precio,
            genero, material, ubicacion y proveedor (por nombre, tiene que existir en Compras).
            Una celda vacía no borra el dato que ya tenía el producto.
          </p>
          <label className="field field--check">
            <input type="checkbox" checked={importar.crearNuevos}
              onChange={(e) => setImportar((im) => ({ ...im, crearNuevos: e.target.checked }))} />
            <span>Crear productos nuevos si el código no existe</span>
          </label>

          {importResultado ? (
            <div className="card" style={{ marginTop: '0.5rem' }}>
              <p><strong>Resultado:</strong> {importResultado.actualizados} actualizados, {importResultado.creados} creados.</p>
              {importResultado.errores.length > 0 && (
                <>
                  <p className="muted small">{importResultado.errores.length} fila(s) con error:</p>
                  <ul className="muted small" style={{ maxHeight: 160, overflow: 'auto' }}>
                    {importResultado.errores.slice(0, 50).map((e, i) => (
                      <li key={i}>Fila {e.fila}{e.codigo ? ` (${e.codigo})` : ''}: {e.error}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="form-actions">
                <button type="button" className="btn btn--primary btn--inline" onClick={() => { setImportar(null); setImportResultado(null); }}>Cerrar</button>
              </div>
            </div>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setImportar(null)}>Cancelar</button>
              <button type="button" className="btn btn--primary btn--inline" onClick={confirmarImportacion}>
                Importar {importar.filas.length} productos
              </button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
