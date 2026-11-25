// =====================================================================
// Consola del Sobre (alta y edición) — Etapa 1 tipo Optix.
// Dos columnas:
//   - Izquierda (65%): datos técnicos — encabezado, médico, receta lejos y
//     cerca (con C.Base y DEG), calculadoras ópticas, armazones, antropometría
//     (DIP/DNP/AP), cotas del armazón y laboratorio.
//   - Derecha (35%): resumen, importes y acciones (Etapa 2): Sub Total
//     Lejos / Cerca / Otros, descuento, recargo, Total, pagos y Saldo,
//     recalculados en vivo (utils/sobreTotales; el servidor recalcula al guardar).
// El lente de lejos y el de cerca se eligen del catálogo "Lentes y otros"
// (SelectorCatalogoLab) y quedan copiados al sobre con su precio.
//
// Props:
//   sobre         sobre a editar (null = nuevo)
//   sucursalId    sucursal activa (para alta y búsqueda de stock)
//   clientes, obrasSociales, medicos, laboratorios  listas para los selectores
//   esAdmin       (sin uso: el alta rápida de médicos está abierta a todos)
//   sucursalNombre nombre de la sucursal activa (para la impresión del alta)
//   onGuardado(sobre), onCancelar(), onMedicoCreado(medico)
//
// Panel de acciones (debajo del Resumen): Guardar, Editar, Limpiar, Recuperar e
// Imprimir (A4). Un sobre guardado se abre BLOQUEADO (solo lectura) y "Editar" lo
// habilita. Todo lo cargado se autoguarda como borrador en este equipo
// (hooks/useSobreBorrador): sobrevive a recargar la página, cambiar de sección o
// un cierre del navegador, y se borra al guardar en el sistema o al limpiar.
// =====================================================================

import { useEffect, useMemo, useState } from 'react';
import { Search, Eraser, Plus, X, Save, Pencil, RotateCcw, Printer } from 'lucide-react';
import { crearSobre, actualizarSobre } from '../../api/sobres';
import { transponer, calcularCerca } from '../../utils/receta';
import SelectorArmazon from './SelectorArmazon';
import SelectorMedico from '../medicos/SelectorMedico';
import { buscarObraSocialPorNombre } from '../../utils/obrasSociales';
import NuevoMedicoModal from '../medicos/NuevoMedicoModal';
import SelectorCatalogoLab from './SelectorCatalogoLab';
import SobreFinanzas from './SobreFinanzas';
import { calcularTotales, pesos } from '../../utils/sobreTotales';
import { useSobreBorrador } from '../../hooks/useSobreBorrador';
import { mismosDatos, horaBorrador } from '../../utils/sobreBorrador';
import { imprimirSobreA4 } from '../../utils/impresionSobreA4';

const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'lentes', 'listo', 'entregado', 'anulado'];
const ESTADO_LABEL = {
  pendiente: 'Pendiente', reserva: 'Reserva', en_taller: 'En taller',
  lentes: 'Lentes', listo: 'Listo', entregado: 'Entregado', anulado: 'Anulado',
};

// Columnas de la grilla de receta. LEJOS lleva ADD; CERCA lleva DEG.
// "Base prisma" es la dirección del prisma (IN/OUT/UP/DOWN); "C.Base" es la curva base.
const COLS_LEJOS = [
  ['esf', 'ESF'], ['cil', 'CIL'], ['eje', 'EJE'], ['add', 'ADD'],
  ['prisma', 'Prisma'], ['base', 'Base prisma'], ['diam', 'Diám.'], ['cbase', 'C.Base'],
];
const COLS_CERCA = [
  ['esf', 'ESF'], ['cil', 'CIL'], ['eje', 'EJE'],
  ['prisma', 'Prisma'], ['base', 'Base prisma'], ['diam', 'Diám.'], ['cbase', 'C.Base'], ['deg', 'DEG'],
];

const COTAS = [
  ['arm_vertical', 'Vertical'], ['arm_horizontal', 'Horizontal'], ['arm_diagonal', 'Diagonal'],
  ['arm_puente', 'Puente'], ['arm_distancia_vertice', 'Dist. vértice'], ['arm_ff', 'FF'],
  ['arm_pantoscopico', 'Pantoscópico (°)'], ['arm_angulo_facial', 'Ángulo facial (°)'],
];

function camposReceta(seccion, cols) {
  return ['od', 'oi'].flatMap((ojo) => cols.map(([c]) => `${seccion}_${ojo}_${c}`));
}

const CAMPOS_FINANZAS = [
  'lente_lejos_id', 'lente_lejos_descripcion', 'lente_lejos_precio',
  'lente_cerca_id', 'lente_cerca_descripcion', 'lente_cerca_precio',
  'armazon_lejos_precio', 'armazon_cerca_precio',
  'descuento_tipo', 'descuento_valor', 'recargo',
];
const PRECIOS = ['lente_lejos_precio', 'lente_cerca_precio', 'armazon_lejos_precio', 'armazon_cerca_precio'];

// Ítems y pagos guardados -> filas editables. Un sobre viejo con total cargado a
// mano (sin precios ni ítems) conserva ese importe como ítem de "Otros".
function itemsDesde(sobre) {
  const items = (sobre?.items || []).map((i) => ({
    descripcion: i.descripcion, precio: String(i.precio), catalogo_id: i.catalogo_id ?? null, dias_demora: i.dias_demora ?? null,
  }));
  const legado = sobre?.id && Number(sobre.total) > 0 && !items.length && PRECIOS.every((c) => sobre[c] == null);
  if (legado) items.push({ descripcion: 'Total cargado a mano (antes del cálculo automático)', precio: String(sobre.total), catalogo_id: null, dias_demora: null });
  return items;
}
function pagosDesde(sobre) {
  return (sobre?.pagos || []).map((p) => ({
    fecha: String(p.fecha || '').slice(0, 10), detalle: p.detalle || '', medio_pago: p.medio_pago, importe: String(p.importe),
  }));
}

const CAMPOS_TEXTO = [
  'cliente_id', 'obra_social_id', 'medico_id', 'fecha_receta', 'fecha_entrega', 'estado',
  'dip', 'dnp_od', 'dnp_oi', 'ap_od', 'ap_oi',
  'armazon_producto_id', 'armazon_cerca_producto_id',
  'armazon_descripcion', 'cristal_descripcion',
  ...COTAS.map(([c]) => c),
  'laboratorio_id', 'codigo_pedido_garantia', 'observacion_lab',
  'notas',
  // Etapa 2: importes (el total ya no se carga a mano)
  ...CAMPOS_FINANZAS,
  ...camposReceta('lejos', COLS_LEJOS),
  ...camposReceta('cerca', COLS_CERCA),
];

// Arma el estado del formulario desde un sobre guardado (o vacío).
function formDesde(sobre) {
  const f = {};
  CAMPOS_TEXTO.forEach((c) => {
    const v = sobre?.[c];
    if (v === null || v === undefined) f[c] = '';
    else if (c.startsWith('fecha_')) f[c] = String(v).slice(0, 10);
    else f[c] = String(v);
  });
  if (!f.estado) f.estado = 'pendiente';
  f.armazon_lejos_es_propio = Boolean(sobre?.armazon_lejos_es_propio);
  f.armazon_cerca_es_propio = Boolean(sobre?.armazon_cerca_es_propio);
  f.armazon_lejos_nombre = sobre?.armazon_lejos_nombre
    ? `${sobre.armazon_lejos_codigo} · ${sobre.armazon_lejos_nombre}` : '';
  f.armazon_cerca_nombre = sobre?.armazon_cerca_nombre
    ? `${sobre.armazon_cerca_codigo} · ${sobre.armazon_cerca_nombre}` : '';
  return f;
}

// Coma decimal -> punto ("1,25" -> "1.25") para que PostgreSQL lo acepte.
function normalizarNumero(v) {
  return typeof v === 'string' && /^[+-]?\d+,\d+$/.test(v.trim()) ? v.trim().replace(',', '.') : v;
}

// Aviso al abrir la consola según lo que encontró el autoguardado.
function mensajeInicio(inicio, esEdicion) {
  if (inicio.restaurado) {
    return `Se recuperó lo que habías cargado sin guardar (${horaBorrador(inicio.restaurado.guardadoEn)}). ${esEdicion ? 'Revisalo y guardá los cambios.' : 'Revisalo y guardá el sobre.'}`;
  }
  if (inicio.motivo === 'version') {
    return `Hay cambios sin guardar de este sobre (${horaBorrador(inicio.respaldo.guardadoEn)}), pero el sobre se modificó después en el sistema. Si los querés, tocá "Recuperar".`;
  }
  if (inicio.motivo === 'sucursal') {
    return `Hay un sobre nuevo sin guardar de otra sucursal (${horaBorrador(inicio.respaldo.guardadoEn)}). Si lo querés acá, tocá "Recuperar".`;
  }
  return '';
}

export default function SobreConsola({
  sobre, sucursalId, sucursalNombre, clientes, obrasSociales, medicos, laboratorios, esAdmin,
  onGuardado, onCancelar, onMedicoCreado,
}) {
  const esEdicion = Boolean(sobre?.id);
  // Lo guardado en el sistema (o el alta vacía): referencia para saber si hay cambios.
  const [base] = useState(() => ({ form: formDesde(sobre), items: itemsDesde(sobre), pagos: pagosDesde(sobre) }));
  const borrador = useSobreBorrador({
    sobreId: sobre?.id, base, version: sobre?.updated_at || null,
    sucursalId: sobre?.sucursal_id || sucursalId, numero: sobre?.numero || null,
  });
  const [form, setForm] = useState(() => borrador.inicio.datos.form);
  // Un sobre guardado abre en solo lectura, salvo que se haya recuperado un borrador suyo.
  const [bloqueado, setBloqueado] = useState(() => esEdicion && !borrador.inicio.restaurado);
  const [avisoBorrador, setAvisoBorrador] = useState(() => mensajeInicio(borrador.inicio, esEdicion));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nuevoMedico, setNuevoMedico] = useState(false);
  const [items, setItems] = useState(() => borrador.inicio.datos.items);
  const [pagos, setPagos] = useState(() => borrador.inicio.datos.pagos);
  const [selector, setSelector] = useState(null); // 'lejos' | 'cerca' | 'otros' | null
  const totales = useMemo(() => calcularTotales(form, items, pagos), [form, items, pagos]);
  const datos = useMemo(() => ({ form, items, pagos }), [form, items, pagos]);
  const hayCambios = !mismosDatos(datos, base);
  const { sincronizar } = borrador;
  // Autoguardado: cada cambio se escribe en el borrador local.
  useEffect(() => { sincronizar(datos); }, [datos, sincronizar]);

  function setC(campo, v) { setForm((f) => ({ ...f, [campo]: v })); }

  // --- Calculadoras ópticas ---
  function transponerOjo(ojo) {
    const p = `lejos_${ojo}`;
    const r = transponer({ esf: form[`${p}_esf`], cil: form[`${p}_cil`], eje: form[`${p}_eje`] });
    if (!r) { setAviso(`${ojo.toUpperCase()}: cargá un cilindro distinto de 0 para transponer.`); return; }
    setForm((f) => ({ ...f, [`${p}_esf`]: r.esf, [`${p}_cil`]: r.cil, [`${p}_eje`]: r.eje }));
    setAviso(`${ojo.toUpperCase()} lejos transpuesto.`);
  }

  function calcularCercaDesdeLejos() {
    const hechos = [];
    const cambios = {};
    ['od', 'oi'].forEach((ojo) => {
      const r = calcularCerca({
        esf: form[`lejos_${ojo}_esf`], cil: form[`lejos_${ojo}_cil`],
        eje: form[`lejos_${ojo}_eje`], add: form[`lejos_${ojo}_add`],
      });
      if (r) {
        cambios[`cerca_${ojo}_esf`] = r.esf;
        cambios[`cerca_${ojo}_cil`] = r.cil;
        cambios[`cerca_${ojo}_eje`] = r.eje;
        hechos.push(ojo.toUpperCase());
      }
    });
    if (!hechos.length) { setAviso('Cargá la ADD en lejos para calcular la receta de cerca.'); return; }
    setForm((f) => ({ ...f, ...cambios }));
    setAviso(`Receta de cerca calculada para ${hechos.join(' y ')} (ESF lejos + ADD).`);
  }

  // --- Lente y "Otros" desde el catálogo "Lentes y otros" ---
  function elegirDelCatalogo(it) {
    const precio = String(Number(it.precio_lista) || 0);
    if (selector === 'otros') {
      setItems((xs) => [...xs, {
        descripcion: `#${it.id} · ${it.descripcion}`.slice(0, 200), precio, catalogo_id: it.id, dias_demora: it.dias_demora ?? null,
      }]);
      setAviso(`Agregado a Otros: ${it.descripcion} (${pesos(it.precio_lista)}).`);
    } else {
      const sec = selector; // 'lejos' | 'cerca'
      const nombre = [it.subcategoria_grupo, it.descripcion].filter(Boolean).join(' · ').slice(0, 255);
      setForm((f) => ({ ...f, [`lente_${sec}_id`]: String(it.id), [`lente_${sec}_descripcion`]: nombre, [`lente_${sec}_precio`]: precio }));
      setAviso(`Lente asignado a Receta ${sec === 'lejos' ? 'Lejos' : 'Cerca'}: #${it.id} ${it.descripcion} (${pesos(it.precio_lista)}).`);
    }
    setSelector(null);
  }
  function quitarLente(sec) {
    setForm((f) => ({ ...f, [`lente_${sec}_id`]: '', [`lente_${sec}_descripcion`]: '', [`lente_${sec}_precio`]: '' }));
  }
  function cambiarItem(i, campo, v) { setItems((xs) => xs.map((x, j) => (j === i ? { ...x, [campo]: v } : x))); }

  function campoLente(sec) {
    const desc = form[`lente_${sec}_descripcion`];
    const id = form[`lente_${sec}_id`];
    return (
      <div className="lente-campo">
        <span className="lente-campo__label">Lente:</span>
        <span className={desc ? 'lente-campo__valor' : 'lente-campo__valor muted'}>
          {desc ? <>{id && <span className="lab-id">{id}</span>} {desc}</> : 'Sin lente elegido'}
        </span>
        <button type="button" className="btn-mini btn-mini--wide" onClick={() => setSelector(sec)}
          title="Elegir del catálogo Lentes y otros">
          <Search size={12} /> Lentes y otros
        </button>
        {desc && (
          <button type="button" className="btn-mini" onClick={() => quitarLente(sec)}
            aria-label={`Quitar lente de ${sec}`} title="Quitar lente">
            <Eraser size={12} />
          </button>
        )}
      </div>
    );
  }

  // --- Alta rápida de médico (cualquier usuario) ---
  function medicoCreado(m) {
    onMedicoCreado?.(m);
    setC('medico_id', m.id);
    setNuevoMedico(false);
  }

  // Al elegir paciente se precargan, solo si el sobre todavía no los tiene, el médico
  // tratante y la obra social de su ficha (la ficha guarda el nombre; se busca en la lista).
  function elegirPaciente(id) {
    const c = clientes.find((x) => x.id === id);
    setForm((f) => {
      const precargarMedico = !f.medico_id && c?.medico_id;
      const os = !f.obra_social_id ? buscarObraSocialPorNombre(obrasSociales, c?.obra_social) : null;
      const avisos = [];
      if (precargarMedico) avisos.push(`médico ${c.medico_nombre || ''}`);
      if (os) avisos.push(`obra social ${os.nombre}`);
      if (avisos.length) setAviso(`Precargado desde la ficha del paciente: ${avisos.join(' y ')}.`);
      return {
        ...f,
        cliente_id: id,
        medico_id: precargarMedico ? c.medico_id : f.medico_id,
        obra_social_id: os ? os.id : f.obra_social_id,
      };
    });
  }

  // --- Guardar sobre ---
  async function guardar(e) {
    e.preventDefault();
    if (bloqueado || guardando) return;
    setError(''); setAviso('');
    if (!esEdicion && !sucursalId) { setError('Elegí una sucursal.'); return; }
    const payload = {};
    CAMPOS_TEXTO.forEach((c) => {
      const v = normalizarNumero(form[c]);
      // En edición se mandan también los vacíos para poder borrar un dato.
      if (esEdicion || v !== '') payload[c] = v;
    });
    payload.armazon_lejos_es_propio = form.armazon_lejos_es_propio;
    payload.armazon_cerca_es_propio = form.armazon_cerca_es_propio;
    if (!esEdicion) payload.sucursal_id = sucursalId;
    payload.items = items.map((i) => ({
      descripcion: i.descripcion, precio: normalizarNumero(i.precio), catalogo_id: i.catalogo_id, dias_demora: i.dias_demora,
    }));
    payload.pagos = pagos.map((p) => ({ ...p, importe: normalizarNumero(p.importe) }));

    setGuardando(true);
    try {
      const guardado = esEdicion
        ? await actualizarSobre(sobre.id, payload)
        : await crearSobre(payload);
      // Quedó en el sistema: el borrador local ya no hace falta.
      borrador.confirmarGuardado();
      onGuardado?.(guardado);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el sobre');
    } finally {
      setGuardando(false);
    }
  }

  // --- Panel de acciones ---
  function aplicar(d) { setForm(d.form); setItems(d.items); setPagos(d.pagos); }

  function editar() {
    setBloqueado(false);
    setAvisoBorrador('');
  }

  // Limpiar: alta -> formulario vacío; sobre guardado -> vuelve a lo guardado.
  // Lo que se descarta queda como respaldo para "Recuperar".
  function limpiar() {
    const pregunta = esEdicion
      ? '¿Descartar los cambios sin guardar? El sobre vuelve a como está guardado. Podés deshacerlo con "Recuperar".'
      : '¿Limpiar el sobre? Se borra todo lo cargado. Podés deshacerlo con "Recuperar".';
    if (!window.confirm(pregunta)) return;
    borrador.limpiar(datos);
    aplicar(base);
    setError(''); setAviso('');
    if (esEdicion) setBloqueado(true);
    setAvisoBorrador('Sobre limpio. Si fue un error, tocá "Recuperar".');
  }

  function recuperar() {
    if (hayCambios && !window.confirm('Recuperar reemplaza lo que está cargado ahora. ¿Seguir?')) return;
    const d = borrador.recuperar();
    if (!d) return;
    aplicar(d);
    setBloqueado(false);
    setAvisoBorrador('Se recuperó el borrador. Revisalo y guardá el sobre.');
  }

  function textoArmazon(sec) {
    if (form[`armazon_${sec}_es_propio`]) return 'Propio del paciente';
    return form[`armazon_${sec}_nombre`] || '';
  }

  function imprimir() {
    const med = medicos.find((m) => m.id === form.medico_id);
    const os = obrasSociales.find((o) => o.id === form.obra_social_id);
    const lab = laboratorios.find((l) => l.id === form.laboratorio_id);
    const ok = imprimirSobreA4({
      numero: sobre?.numero || null,
      borrador: !esEdicion || hayCambios,
      sucursal: sobre?.sucursal_nombre || sucursalNombre || '',
      estado: ESTADO_LABEL[form.estado],
      paciente: cliente ? { nombre: cliente.nombre_completo, dni: cliente.dni } : null,
      medico: med ? { nombre: med.nombre, matricula: med.matricula } : (sobre?.medico ? { nombre: sobre.medico } : null),
      obraSocial: os?.nombre || '',
      laboratorio: lab?.nombre || '',
      armazonLejos: textoArmazon('lejos'),
      armazonCerca: textoArmazon('cerca'),
      form, items, pagos, totales,
      colsLejos: COLS_LEJOS, colsCerca: COLS_CERCA, cotas: COTAS,
    });
    if (!ok) setError('El navegador bloqueó la ventana de impresión: permití las ventanas emergentes para este sitio.');
  }

  let estadoBorrador;
  if (bloqueado) estadoBorrador = 'Sobre guardado. Tocá "Editar" para modificarlo.';
  else if (borrador.falla) estadoBorrador = 'No se pudo guardar el borrador en este navegador: guardá el sobre para no perder los datos.';
  else if (hayCambios && borrador.guardadoEn) estadoBorrador = `Borrador guardado en este equipo (${horaBorrador(borrador.guardadoEn)}).`;
  else if (esEdicion) estadoBorrador = 'Sin cambios.';
  else estadoBorrador = 'Lo que cargues se guarda solo como borrador en este equipo.';

  function filaReceta(seccion, ojo, cols) {
    const p = `${seccion}_${ojo}`;
    return (
      <tr key={p}>
        <td><strong>{ojo.toUpperCase()}</strong></td>
        {cols.map(([c, etiqueta]) => (
          <td key={c}>
            <input
              aria-label={`${etiqueta} ${ojo.toUpperCase()} ${seccion}`}
              value={form[`${p}_${c}`]}
              onChange={(e) => setC(`${p}_${c}`, e.target.value)}
              inputMode={c === 'base' ? 'text' : 'decimal'}
            />
          </td>
        ))}
        {seccion === 'lejos' && (
          <td>
            <button
              type="button"
              className="btn-mini"
              onClick={() => transponerOjo(ojo)}
              title="Transponer cilindro"
              aria-label={`Transponer ${ojo.toUpperCase()} lejos`}
            >
              ⇄
            </button>
          </td>
        )}
      </tr>
    );
  }

  const cliente = clientes.find((c) => c.id === form.cliente_id);
  const sucursalStock = sobre?.sucursal_id || sucursalId;

  return (
    <>
      <form className="sobre-consola" onSubmit={guardar}>
        {/* ===== Columna izquierda: datos técnicos ===== */}
        <div className="sobre-consola__tecnica card">
          <h2 className="section-title">
            {esEdicion ? `Sobre #${sobre.numero}` : 'Nuevo sobre'}
            {bloqueado && <span className="badge sobre-badge-lectura">Solo lectura</span>}
          </h2>
          <fieldset className="sobre-bloque" disabled={bloqueado}>

          <div className="form-grid">
            <label className="field"><span>Paciente</span>
              <select value={form.cliente_id} onChange={(e) => elegirPaciente(e.target.value)}>
                <option value="">Sin asociar</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo} · {c.dni}</option>)}
              </select></label>
            <label className="field"><span>Obra social</span>
              <select value={form.obra_social_id} onChange={(e) => setC('obra_social_id', e.target.value)}>
                <option value="">Particular</option>
                {obrasSociales.map((os) => <option key={os.id} value={os.id}>{os.nombre}</option>)}
              </select></label>
            <div className="field">
              <label htmlFor="sobre-medico"><span>Médico</span></label>
              <SelectorMedico id="sobre-medico" medicos={medicos} value={form.medico_id}
                onChange={(id) => setC('medico_id', id)} onNuevo={() => setNuevoMedico(true)} />
              {sobre?.medico && !form.medico_id && (
                <span className="muted small">Cargado antes como texto: {sobre.medico}</span>
              )}
            </div>
            <label className="field"><span>Fecha receta</span>
              <input type="date" value={form.fecha_receta} onChange={(e) => setC('fecha_receta', e.target.value)} /></label>
            <label className="field"><span>Fecha entrega</span>
              <input type="date" value={form.fecha_entrega} onChange={(e) => setC('fecha_entrega', e.target.value)} /></label>
            {esEdicion && (
              <label className="field"><span>Estado</span>
                <select value={form.estado} onChange={(e) => setC('estado', e.target.value)}>
                  {ESTADOS.map((s) => <option key={s} value={s}>{ESTADO_LABEL[s]}</option>)}
                </select></label>
            )}
          </div>

          <h3 className="sobre-subtitulo">Receta — Lejos</h3>
          <div className="tabla-scroll">
            <table className="data-table rx-table">
              <thead>
                <tr><th></th>{COLS_LEJOS.map(([c, e]) => <th key={c}>{e}</th>)}<th title="Transponer">Transp.</th></tr>
              </thead>
              <tbody>{filaReceta('lejos', 'od', COLS_LEJOS)}{filaReceta('lejos', 'oi', COLS_LEJOS)}</tbody>
            </table>
          </div>
          {campoLente('lejos')}

          <div className="sobre-subtitulo sobre-subtitulo--accion">
            <h3>Receta — Cerca</h3>
            <button type="button" className="btn-mini btn-mini--wide" onClick={calcularCercaDesdeLejos}>
              Calcular desde lejos + ADD
            </button>
          </div>
          <div className="tabla-scroll">
            <table className="data-table rx-table">
              <thead><tr><th></th>{COLS_CERCA.map(([c, e]) => <th key={c}>{e}</th>)}</tr></thead>
              <tbody>{filaReceta('cerca', 'od', COLS_CERCA)}{filaReceta('cerca', 'oi', COLS_CERCA)}</tbody>
            </table>
          </div>
          {campoLente('cerca')}
          {aviso && <p className="muted small" role="status">{aviso}</p>}

          <h3 className="sobre-subtitulo">Armazones</h3>
          <div className="armazones-grid">
            <SelectorArmazon
              titulo="Armazón lejos"
              sucursalId={sucursalStock}
              esPropio={form.armazon_lejos_es_propio}
              productoId={form.armazon_producto_id}
              productoNombre={form.armazon_lejos_nombre}
              onChange={({ esPropio, productoId, productoNombre, precio }) => setForm((f) => ({
                ...f, armazon_lejos_es_propio: esPropio, armazon_producto_id: productoId || '', armazon_lejos_nombre: productoNombre || '',
                armazon_lejos_precio: precio !== undefined && precio !== null ? String(precio) : (productoId ? f.armazon_lejos_precio : ''),
              }))}
            />
            <SelectorArmazon
              titulo="Armazón cerca"
              sucursalId={sucursalStock}
              esPropio={form.armazon_cerca_es_propio}
              productoId={form.armazon_cerca_producto_id}
              productoNombre={form.armazon_cerca_nombre}
              onChange={({ esPropio, productoId, productoNombre, precio }) => setForm((f) => ({
                ...f, armazon_cerca_es_propio: esPropio, armazon_cerca_producto_id: productoId || '', armazon_cerca_nombre: productoNombre || '',
                armazon_cerca_precio: precio !== undefined && precio !== null ? String(precio) : (productoId ? f.armazon_cerca_precio : ''),
              }))}
            />
          </div>

          <div className="sobre-subtitulo sobre-subtitulo--accion">
            <h3>Servicios, insumos, accesorios y otros</h3>
            <span className="otros-acciones">
              <button type="button" className="btn-mini btn-mini--wide" onClick={() => setSelector('otros')}>
                <Plus size={12} /> Del catálogo
              </button>
              <button type="button" className="btn-mini btn-mini--wide"
                onClick={() => setItems((xs) => [...xs, { descripcion: '', precio: '', catalogo_id: null, dias_demora: null }])}>
                <Plus size={12} /> Ítem libre
              </button>
            </span>
          </div>
          {items.length === 0 ? (
            <p className="muted small">Sin ítems adicionales.</p>
          ) : (
            <div className="otros-lista">
              {items.map((it, i) => (
                <div key={i} className="otros-fila">
                  <input aria-label={`Descripción del ítem ${i + 1}`} maxLength={200} placeholder="Descripción"
                    value={it.descripcion} onChange={(e) => cambiarItem(i, 'descripcion', e.target.value)} />
                  <span className="fin-importe__input">
                    <span aria-hidden="true">$</span>
                    <input type="number" min="0" step="0.01" aria-label={`Precio del ítem ${i + 1}`}
                      value={it.precio} onChange={(e) => cambiarItem(i, 'precio', e.target.value)} />
                  </span>
                  <button type="button" className="btn-mini" aria-label={`Quitar ítem ${i + 1}`} title="Quitar"
                    onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}

          <h3 className="sobre-subtitulo">Antropometría (mm)</h3>
          <div className="form-grid form-grid--compacta">
            <label className="field"><span>DIP</span>
              <input inputMode="decimal" value={form.dip} onChange={(e) => setC('dip', e.target.value)} /></label>
            <label className="field"><span>DNP OD</span>
              <input inputMode="decimal" value={form.dnp_od} onChange={(e) => setC('dnp_od', e.target.value)} /></label>
            <label className="field"><span>DNP OI</span>
              <input inputMode="decimal" value={form.dnp_oi} onChange={(e) => setC('dnp_oi', e.target.value)} /></label>
            <label className="field"><span>Altura pupilar OD</span>
              <input inputMode="decimal" value={form.ap_od} onChange={(e) => setC('ap_od', e.target.value)} /></label>
            <label className="field"><span>Altura pupilar OI</span>
              <input inputMode="decimal" value={form.ap_oi} onChange={(e) => setC('ap_oi', e.target.value)} /></label>
          </div>

          <h3 className="sobre-subtitulo">Cotas del armazón (mm)</h3>
          <div className="form-grid form-grid--compacta">
            {COTAS.map(([c, etiqueta]) => (
              <label key={c} className="field"><span>{etiqueta}</span>
                <input inputMode="decimal" value={form[c]} onChange={(e) => setC(c, e.target.value)} /></label>
            ))}
          </div>

          <h3 className="sobre-subtitulo">Laboratorio</h3>
          <div className="form-grid">
            <label className="field"><span>Laboratorio</span>
              <select value={form.laboratorio_id} onChange={(e) => setC('laboratorio_id', e.target.value)}>
                <option value="">Sin asignar</option>
                {laboratorios.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
              </select></label>
            <label className="field"><span>Código de pedido / garantía</span>
              <input maxLength={100} value={form.codigo_pedido_garantia} onChange={(e) => setC('codigo_pedido_garantia', e.target.value)} /></label>
            <label className="field field--full"><span>Observación para el laboratorio</span>
              <textarea rows={2} value={form.observacion_lab} onChange={(e) => setC('observacion_lab', e.target.value)} /></label>
          </div>
          </fieldset>
        </div>

        {/* ===== Columna derecha: resumen y acciones ===== */}
        <aside className="sobre-consola__resumen card">
          <h2 className="section-title">Resumen</h2>
          <dl className="sobre-resumen">
            <dt>Paciente</dt><dd>{cliente ? cliente.nombre_completo : 'Sin asociar'}</dd>
            <dt>Estado</dt><dd><span className="badge">{ESTADO_LABEL[form.estado]}</span></dd>
          </dl>

          <div className="sobre-acciones" role="toolbar" aria-label="Acciones del sobre">
            <button type="submit" className="sobre-accion sobre-accion--guardar" disabled={bloqueado || guardando}
              title="Guardar el sobre en el sistema">
              <Save size={18} aria-hidden="true" /><span>{guardando ? 'Guardando…' : 'Guardar'}</span>
            </button>
            <button type="button" className="sobre-accion sobre-accion--editar" onClick={editar}
              disabled={!esEdicion || !bloqueado} title="Habilitar la edición de este sobre">
              <Pencil size={18} aria-hidden="true" /><span>Editar</span>
            </button>
            <button type="button" className="sobre-accion sobre-accion--limpiar" onClick={limpiar}
              disabled={!hayCambios || guardando}
              title={esEdicion ? 'Descartar los cambios sin guardar' : 'Vaciar el sobre'}>
              <Eraser size={18} aria-hidden="true" /><span>Limpiar</span>
            </button>
            <button type="button" className="sobre-accion sobre-accion--recuperar" onClick={recuperar}
              disabled={!borrador.hayRespaldo || guardando}
              title={borrador.respaldoEn ? `Recuperar lo cargado (${horaBorrador(borrador.respaldoEn)})` : 'No hay nada para recuperar'}>
              <RotateCcw size={18} aria-hidden="true" /><span>Recuperar</span>
            </button>
            <button type="button" className="sobre-accion sobre-accion--imprimir" onClick={imprimir}
              title="Imprimir el sobre en hoja A4">
              <Printer size={18} aria-hidden="true" /><span>Imprimir</span>
            </button>
          </div>
          <p className={`sobre-borrador-estado small${borrador.falla ? ' sobre-borrador-estado--falla' : ''}`} role="status">{estadoBorrador}</p>
          {avisoBorrador && <p className="alert alert--info" role="status">{avisoBorrador}</p>}

          <fieldset className="sobre-bloque sobre-bloque--resumen" disabled={bloqueado}>

          <label className="field"><span>Cristal</span>
            <input maxLength={200} value={form.cristal_descripcion} onChange={(e) => setC('cristal_descripcion', e.target.value)} placeholder="Tipo de cristal, tratamiento…" /></label>
          <label className="field"><span>Detalle del armazón</span>
            <input maxLength={200} value={form.armazon_descripcion} onChange={(e) => setC('armazon_descripcion', e.target.value)} placeholder="Color, modelo del armazón propio…" /></label>
          <label className="field"><span>Notas</span>
            <textarea rows={3} value={form.notas} onChange={(e) => setC('notas', e.target.value)} /></label>

          <SobreFinanzas form={form} setC={setC} pagos={pagos} setPagos={setPagos} totales={totales} />
          </fieldset>

          {error && <p className="alert alert--error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost btn--inline" onClick={onCancelar}
              title="Cerrar la consola (lo que no guardaste queda como borrador en este equipo)">Cerrar</button>
            <button type="submit" className="btn btn--primary btn--inline" disabled={bloqueado || guardando}>
              {guardando ? 'Guardando…' : (esEdicion ? 'Guardar cambios' : 'Crear sobre')}
            </button>
          </div>
        </aside>
      </form>

      {selector && (
        <SelectorCatalogoLab contexto={selector} onSeleccionar={elegirDelCatalogo} onCerrar={() => setSelector(null)} />
      )}

      {/* Fuera del <form> del sobre: Enter acá guarda el médico, no el sobre. */}
      {nuevoMedico && <NuevoMedicoModal onCreado={medicoCreado} onCerrar={() => setNuevoMedico(false)} />}
    </>
  );
}
