// =====================================================================
// Consola del Sobre (alta y edición) — Etapa 1 tipo Optix.
// Dos columnas:
//   - Izquierda (65%): datos técnicos — encabezado, médico, receta lejos y
//     cerca (con C.Base y DEG), calculadoras ópticas, armazones, antropometría
//     (DIP/DNP/AP), cotas del armazón y laboratorio.
//   - Derecha (35%): resumen y acciones. La consola financiera (ítems
//     adicionales, pagos y saldo) llega en la Etapa 2.
//
// Props:
//   sobre         sobre a editar (null = nuevo)
//   sucursalId    sucursal activa (para alta y búsqueda de stock)
//   clientes, obrasSociales, medicos, laboratorios  listas para los selectores
//   esAdmin       habilita el alta rápida de médicos
//   onGuardado(sobre), onCancelar(), onMedicoCreado(medico)
// =====================================================================

import { useState } from 'react';
import { crearSobre, actualizarSobre } from '../../api/sobres';
import { crearMedico } from '../../api/medicos';
import { transponer, calcularCerca } from '../../utils/receta';
import Modal from '../Modal';
import SelectorArmazon from './SelectorArmazon';

const ESTADOS = ['pendiente', 'reserva', 'en_taller', 'entregado', 'anulado'];
const ESTADO_LABEL = {
  pendiente: 'Pendiente', reserva: 'Reserva', en_taller: 'En taller',
  entregado: 'Entregado', anulado: 'Anulado',
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

const CAMPOS_TEXTO = [
  'cliente_id', 'obra_social_id', 'medico_id', 'fecha_receta', 'fecha_entrega', 'estado',
  'dip', 'dnp_od', 'dnp_oi', 'ap_od', 'ap_oi',
  'armazon_producto_id', 'armazon_cerca_producto_id',
  'armazon_descripcion', 'cristal_descripcion',
  ...COTAS.map(([c]) => c),
  'laboratorio_id', 'codigo_pedido_garantia', 'observacion_lab',
  'notas', 'total',
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

export default function SobreConsola({
  sobre, sucursalId, clientes, obrasSociales, medicos, laboratorios, esAdmin,
  onGuardado, onCancelar, onMedicoCreado,
}) {
  const esEdicion = Boolean(sobre?.id);
  const [form, setForm] = useState(() => formDesde(sobre));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nuevoMedico, setNuevoMedico] = useState(null); // { nombre, matricula } | null
  const [errorMedico, setErrorMedico] = useState('');

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

  // --- Alta rápida de médico (admin) ---
  async function guardarMedico(e) {
    e.preventDefault();
    setErrorMedico('');
    if (!nuevoMedico.nombre.trim()) { setErrorMedico('El nombre es obligatorio.'); return; }
    try {
      const m = await crearMedico({ nombre: nuevoMedico.nombre, matricula: nuevoMedico.matricula });
      onMedicoCreado?.(m);
      setC('medico_id', m.id);
      setNuevoMedico(null);
    } catch (err) {
      setErrorMedico(err.response?.data?.error || 'No se pudo crear el médico');
    }
  }

  // --- Guardar sobre ---
  async function guardar(e) {
    e.preventDefault();
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

    setGuardando(true);
    try {
      const guardado = esEdicion
        ? await actualizarSobre(sobre.id, payload)
        : await crearSobre(payload);
      onGuardado?.(guardado);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el sobre');
    } finally {
      setGuardando(false);
    }
  }

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
  const medicosActivos = medicos.filter((m) => m.activo || m.id === form.medico_id);
  const sucursalStock = sobre?.sucursal_id || sucursalId;

  return (
    <>
      <form className="sobre-consola" onSubmit={guardar}>
        {/* ===== Columna izquierda: datos técnicos ===== */}
        <div className="sobre-consola__tecnica card">
          <h2 className="section-title">
            {esEdicion ? `Sobre #${sobre.numero}` : 'Nuevo sobre'}
          </h2>

          <div className="form-grid">
            <label className="field"><span>Paciente</span>
              <select value={form.cliente_id} onChange={(e) => setC('cliente_id', e.target.value)}>
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
              <select id="sobre-medico" value={form.medico_id} onChange={(e) => setC('medico_id', e.target.value)}>
                <option value="">Sin médico</option>
                {medicosActivos.map((m) => (
                  <option key={m.id} value={m.id}>{m.nombre}{m.matricula ? ` · MP ${m.matricula}` : ''}</option>
                ))}
              </select>
              {esAdmin && (
                <button type="button" className="link-btn" onClick={() => setNuevoMedico({ nombre: '', matricula: '' })}>
                  + Nuevo médico
                </button>
              )}
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
          {aviso && <p className="muted small" role="status">{aviso}</p>}

          <h3 className="sobre-subtitulo">Armazones</h3>
          <div className="armazones-grid">
            <SelectorArmazon
              titulo="Armazón lejos"
              sucursalId={sucursalStock}
              esPropio={form.armazon_lejos_es_propio}
              productoId={form.armazon_producto_id}
              productoNombre={form.armazon_lejos_nombre}
              onChange={({ esPropio, productoId, productoNombre }) => setForm((f) => ({
                ...f, armazon_lejos_es_propio: esPropio, armazon_producto_id: productoId || '', armazon_lejos_nombre: productoNombre || '',
              }))}
            />
            <SelectorArmazon
              titulo="Armazón cerca"
              sucursalId={sucursalStock}
              esPropio={form.armazon_cerca_es_propio}
              productoId={form.armazon_cerca_producto_id}
              productoNombre={form.armazon_cerca_nombre}
              onChange={({ esPropio, productoId, productoNombre }) => setForm((f) => ({
                ...f, armazon_cerca_es_propio: esPropio, armazon_cerca_producto_id: productoId || '', armazon_cerca_nombre: productoNombre || '',
              }))}
            />
          </div>

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
        </div>

        {/* ===== Columna derecha: resumen y acciones ===== */}
        <aside className="sobre-consola__resumen card">
          <h2 className="section-title">Resumen</h2>
          <dl className="sobre-resumen">
            <dt>Paciente</dt><dd>{cliente ? cliente.nombre_completo : 'Sin asociar'}</dd>
            <dt>Estado</dt><dd><span className="badge">{ESTADO_LABEL[form.estado]}</span></dd>
          </dl>

          <label className="field"><span>Cristal</span>
            <input maxLength={200} value={form.cristal_descripcion} onChange={(e) => setC('cristal_descripcion', e.target.value)} placeholder="Tipo de cristal, tratamiento…" /></label>
          <label className="field"><span>Detalle del armazón</span>
            <input maxLength={200} value={form.armazon_descripcion} onChange={(e) => setC('armazon_descripcion', e.target.value)} placeholder="Color, modelo del armazón propio…" /></label>
          <label className="field"><span>Total ($)</span>
            <input type="number" step="0.01" min="0" value={form.total} onChange={(e) => setC('total', e.target.value)} /></label>
          <label className="field"><span>Notas</span>
            <textarea rows={3} value={form.notas} onChange={(e) => setC('notas', e.target.value)} /></label>

          <p className="muted small">
            Ítems adicionales, pagos y saldo se suman en la próxima etapa. Por ahora el total se carga a mano.
          </p>

          {error && <p className="alert alert--error" role="alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost btn--inline" onClick={onCancelar}>Cancelar</button>
            <button type="submit" className="btn btn--primary btn--inline" disabled={guardando}>
              {guardando ? 'Guardando…' : (esEdicion ? 'Guardar cambios' : 'Crear sobre')}
            </button>
          </div>
        </aside>
      </form>

      {/* Fuera del <form> del sobre: Enter acá guarda el médico, no el sobre. */}
      {nuevoMedico && (
        <Modal titulo="Nuevo médico" onCerrar={() => setNuevoMedico(null)}>
          <form className="form-grid" onSubmit={guardarMedico}>
            <label className="field field--full"><span>Nombre *</span>
              <input maxLength={150} value={nuevoMedico.nombre} autoFocus
                onChange={(e) => setNuevoMedico((m) => ({ ...m, nombre: e.target.value }))} /></label>
            <label className="field field--full"><span>Matrícula</span>
              <input maxLength={50} value={nuevoMedico.matricula}
                onChange={(e) => setNuevoMedico((m) => ({ ...m, matricula: e.target.value }))} /></label>
            {errorMedico && <p className="alert alert--error field--full" role="alert">{errorMedico}</p>}
            <div className="form-actions">
              <button type="button" className="btn btn--ghost btn--inline" onClick={() => setNuevoMedico(null)}>Cancelar</button>
              <button type="submit" className="btn btn--primary btn--inline">Guardar médico</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
