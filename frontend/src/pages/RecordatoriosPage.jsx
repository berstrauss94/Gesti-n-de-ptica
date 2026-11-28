// =====================================================================
// Recordatorios: avisos automáticos por WhatsApp para que el cliente vuelva
// a su control o turno. Ej: el doctor indica "volvé en 2 meses" -> se elige
// la fecha y cuánto antes avisar (1 mes, 2 semanas, 1 semana, 4 días) y el
// sistema manda los mensajes solo, a las 10:00, con el texto del doctor o el
// de siempre. Desde acá se ve qué está programado, qué salió y qué falló.
// =====================================================================
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listarSucursales } from '../api/stock';
import { listarUsuarios } from '../api/usuarios';
import {
  obtenerConfigNotif, listarRecordatorios, crearRecordatorios, cancelarRecordatorio, procesarRecordatorios,
} from '../api/notificaciones';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';

const AVISOS = [
  { id: '1_mes', label: '1 mes antes' },
  { id: '2_semanas', label: '2 semanas antes' },
  { id: '1_semana', label: '1 semana antes' },
  { id: '4_dias', label: '4 días antes' },
];
const ETIQUETA_AVISO = Object.fromEntries(AVISOS.map((a) => [a.id, a.label]));
const ESTADO_LABEL = { pendiente: 'Programado', enviando: 'Enviando…', enviado: 'Enviado', fallido: 'Falló', cancelado: 'Cancelado' };
const MENSAJE_BASE =
  'Hola {nombre}, te recordamos que el {fecha} tenés tu próximo control en {local}. Escribinos para reservar tu turno. ¡Te esperamos!';
const ATAJOS = [
  { label: '1 mes', meses: 1 }, { label: '2 meses', meses: 2 }, { label: '3 meses', meses: 3 },
  { label: '6 meses', meses: 6 }, { label: '1 año', meses: 12 },
];

const enArgentina = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
function fechaDentroDe(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() + meses);
  return enArgentina(d);
}
function mananaISO() { return enArgentina(new Date(Date.now() + 86400000)); }
// "2027-01-20" -> "20/01/2027"
function fechaCorta(iso) { const [y, m, d] = String(iso).split('-'); return `${d}/${m}/${y}`; }
function etiquetaAviso(r) {
  return r.anticipacion_tipo === 'personalizado'
    ? `${r.dias_antes} día${r.dias_antes === 1 ? '' : 's'} antes`
    : ETIQUETA_AVISO[r.anticipacion_tipo] || r.anticipacion_tipo;
}

const FORM_VACIO = {
  cliente_id: '', nombre: '', telefono: '', fecha_evento: '', anticipaciones: ['1_semana'],
  otros_dias: '', mensaje: '', canal: 'whatsapp', sucursal_id: '', turno_id: '',
};

export default function RecordatoriosPage() {
  const esAdmin = useEsAdmin();
  const [params] = useSearchParams();
  const [sucursales, setSucursales] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [cfg, setCfg] = useState(null);
  const [lista, setLista] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const [aviso, setAviso] = useState('');
  // Si se llega desde un turno ("Recordar"), el formulario viene con sus datos.
  const [form, setForm] = useState(() => ({
    ...FORM_VACIO,
    turno_id: params.get('turno_id') || '',
    nombre: params.get('nombre') || '',
    telefono: params.get('telefono') || '',
    fecha_evento: params.get('fecha') || '',
  }));

  const cargar = useCallback(async (estado) => {
    setCargando(true);
    try {
      setLista(await listarRecordatorios(estado ? { estado } : {}));
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los recordatorios');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, u, c] = await Promise.all([
          listarSucursales(), listarUsuarios({ limit: 300 }), obtenerConfigNotif(),
        ]);
        setSucursales(s);
        setClientes(u.usuarios || []);
        setCfg(c);
        if (s.length) setForm((f) => ({ ...f, sucursal_id: f.sucursal_id || s[0].id }));
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los datos iniciales');
      }
    })();
  }, []);
  useEffect(() => { cargar(filtro); }, [filtro, cargar]);

  function setCampo(c, v) { setForm((f) => ({ ...f, [c]: v })); }
  function elegirCliente(id) {
    const c = clientes.find((x) => x.id === id);
    setForm((f) => ({ ...f, cliente_id: id, nombre: c ? c.nombre_completo : f.nombre }));
  }
  function alternarAviso(id) {
    setForm((f) => ({
      ...f,
      anticipaciones: f.anticipaciones.includes(id) ? f.anticipaciones.filter((x) => x !== id) : [...f.anticipaciones, id],
    }));
  }

  async function programar(e) {
    e.preventDefault();
    setError(''); setOk(''); setAviso('');
    const dias = form.otros_dias.split(/[,\s;]+/).filter(Boolean).map(Number);
    if (dias.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) {
      setError('Los otros días tienen que ser números enteros entre 1 y 365, separados por coma.');
      return;
    }
    setEnviando(true);
    try {
      const r = await crearRecordatorios({
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim(),
        fecha_evento: form.fecha_evento,
        anticipaciones: form.anticipaciones,
        dias_personalizados: dias,
        mensaje: form.mensaje.trim() || undefined,
        canal: form.canal,
        cliente_id: form.cliente_id || undefined,
        sucursal_id: form.sucursal_id || undefined,
        turno_id: form.turno_id || undefined,
      });
      setOk(`Listo: ${r.creados} aviso(s) programado(s) para el control del ${fechaCorta(r.fecha_evento)} (WhatsApp ${r.telefono}).`
        + (r.duplicados ? ` ${r.duplicados} ya estaban programados.` : ''));
      if (r.omitidos?.length) setAviso(`No se programó: ${r.omitidos.join(', ')} (esa fecha de aviso ya pasó).`);
      setForm((f) => ({ ...FORM_VACIO, sucursal_id: f.sucursal_id, fecha_evento: '', anticipaciones: f.anticipaciones }));
      cargar(filtro);
    } catch (err) {
      const d = err.response?.data || {};
      setError(d.error || 'No se pudieron programar los recordatorios');
      if (d.omitidos?.length) setAviso(`Ya pasaron: ${d.omitidos.join(', ')}.`);
    } finally {
      setEnviando(false);
    }
  }

  async function cancelar(id) {
    setError(''); setOk('');
    try { await cancelarRecordatorio(id); cargar(filtro); }
    catch (err) { setError(err.response?.data?.error || 'No se pudo cancelar el recordatorio'); cargar(filtro); }
  }

  async function enviarAhora() {
    setError(''); setOk('');
    try {
      const r = await procesarRecordatorios();
      setOk(r.pausado
        ? `No se envió nada: ${r.pausado}.`
        : `Enviados: ${r.enviados} · Reintentos: ${r.reintentos} · Fallidos: ${r.fallidos} · Cancelados: ${r.cancelados}.`);
      cargar(filtro);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo procesar la cola'); }
  }

  const sinWhatsapp = form.canal === 'whatsapp' && cfg && !cfg.whatsapp_listo;

  return (
    <div className="stack seccion-con-fondo tema-oscuro">
      {/* Tema oscuro: fondo con brillo fucsia (paso 3 de la secuencia de entrada) */}
      <div className="seccion-fondo tema-oscuro__fondo" aria-hidden="true" />
      <div className="page-header">
        <h1>
          Recordatorios
          <InfoBtn
            paraQue="Manda solos los mensajes de WhatsApp que le recuerdan al cliente que tiene que volver a su control o turno."
            comoFunciona="Cargá el cliente, la fecha en que tiene que volver y cuánto antes avisar (1 mes, 2 semanas, 1 semana o 4 días); podés escribir el mensaje que indicó el doctor."
            conQueFin="Que los clientes vuelvan a controlarse y no se pierdan turnos, sin que nadie tenga que acordarse de llamarlos."
          />
        </h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="ok-text small" role="status">✓ {ok}</p>}
      {aviso && <p className="muted small" role="status">{aviso}</p>}
      {sinWhatsapp && (
        <p className="alert alert--error" role="status">
          WhatsApp todavía no está listo: faltan el token, el Phone ID o la plantilla (se cargan en Configuración).
          Podés programar igual: los avisos quedan en espera y salen apenas se complete.
        </p>
      )}
      {cfg && cfg.alertas_activas === false && (
        <p className="alert alert--error" role="status">Las alertas automáticas están desactivadas en Configuración: no se envía ningún aviso.</p>
      )}

      <form className="card stack" onSubmit={programar}>
        <div className="form-grid">
          <label className="field"><span>Cliente (opcional)</span>
            <select value={form.cliente_id} onChange={(e) => elegirCliente(e.target.value)}>
              <option value="">— Escribir a mano —</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo}</option>)}
            </select></label>
          <label className="field"><span>Nombre</span>
            <input value={form.nombre} maxLength={150} required onChange={(e) => setCampo('nombre', e.target.value)} /></label>
          <label className="field"><span>Celular (con código de área)</span>
            <input value={form.telefono} required placeholder="Ej: 11 5555 1234" onChange={(e) => setCampo('telefono', e.target.value)} /></label>
          <label className="field"><span>Sucursal</span>
            <select value={form.sucursal_id} onChange={(e) => setCampo('sucursal_id', e.target.value)}>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select></label>
          <label className="field"><span>Tiene que volver el</span>
            <input type="date" value={form.fecha_evento} min={mananaISO()} required onChange={(e) => setCampo('fecha_evento', e.target.value)} /></label>
          <div className="field">
            <span>Atajo: volver en…</span>
            <div className="searchbar">
              {ATAJOS.map((a) => (
                <button key={a.meses} type="button" className="btn-mini" onClick={() => setCampo('fecha_evento', fechaDentroDe(a.meses))}>{a.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="field">
          <span>Avisar con anticipación</span>
          <div className="searchbar">
            {AVISOS.map((a) => (
              <label key={a.id} className="field field--check">
                <input type="checkbox" checked={form.anticipaciones.includes(a.id)} onChange={() => alternarAviso(a.id)} /> {a.label}
              </label>
            ))}
            <label className="field"><span>Otros días antes (ej: 10, 3)</span>
              <input value={form.otros_dias} placeholder="10, 3" onChange={(e) => setCampo('otros_dias', e.target.value)} /></label>
          </div>
        </div>

        <label className="field"><span>Mensaje (opcional: si lo dejás vacío se usa el de siempre)</span>
          <textarea rows={3} maxLength={600} value={form.mensaje} placeholder={MENSAJE_BASE} onChange={(e) => setCampo('mensaje', e.target.value)} /></label>
        <p className="muted small">
          Podés usar {'{nombre}'}, {'{fecha}'} y {'{local}'}: se reemplazan solos al programar. Los avisos salen a las 10:00.
        </p>

        <div className="form-actions">
          <label className="field"><span>Canal</span>
            <select value={form.canal} onChange={(e) => setCampo('canal', e.target.value)}>
              <option value="whatsapp">WhatsApp al cliente</option>
              <option value="telegram">Telegram (copia interna, para probar)</option>
            </select></label>
          <button type="submit" className="btn btn--primary btn--inline" disabled={enviando}>
            {enviando ? 'Programando…' : 'Programar recordatorios'}
          </button>
        </div>
      </form>

      <div className="searchbar">
        <select aria-label="Estado" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="pendiente">Programados</option>
          <option value="enviado">Enviados</option>
          <option value="fallido">Fallidos</option>
          <option value="cancelado">Cancelados</option>
        </select>
        {esAdmin && (
          <button type="button" className="btn btn--ghost btn--inline" onClick={enviarAhora}>Enviar los que ya tocan, ahora</button>
        )}
      </div>

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card empty"><p>Todavía no hay recordatorios{filtro ? ' con ese estado' : ''}.</p></div>
      ) : (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr><th>Sale</th><th>Cliente</th><th>Vuelve el</th><th>Aviso</th><th>Canal</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {lista.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.fecha_programada).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>
                    {r.nombre_destino || '—'}
                    <div className="muted small">{r.telefono_destino}</div>
                    <div className="muted small" title={r.mensaje_personalizado}>{r.mensaje_personalizado.slice(0, 70)}{r.mensaje_personalizado.length > 70 ? '…' : ''}</div>
                  </td>
                  <td>{fechaCorta(r.fecha_evento)}</td>
                  <td>{etiquetaAviso(r)}</td>
                  <td>{r.canal === 'whatsapp' ? 'WhatsApp' : 'Telegram'}</td>
                  <td>
                    <span className="badge">{ESTADO_LABEL[r.estado] || r.estado}</span>
                    {r.ultimo_error && <div className="muted small">{r.ultimo_error}</div>}
                  </td>
                  <td>
                    {r.estado === 'pendiente' && (
                      <button type="button" className="btn-mini btn-mini--wide" onClick={() => cancelar(r.id)}>Cancelar</button>
                    )}
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
