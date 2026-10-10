// =====================================================================
// Configuración — Notificaciones (WhatsApp / Telegram).
// Permite cargar tokens, activar/desactivar alertas, enviar una prueba
// y ver el historial de notificaciones.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import {
  obtenerConfigNotif, guardarConfigNotif, listarNotificaciones, enviarPrueba,
} from '../api/notificaciones';
import { estadoFiscal } from '../api/fiscal';
import { estadoTryonIA } from '../api/tryonIA';
import InfoBtn from '../components/InfoBtn';
import { useEsAdmin } from '../hooks/useEsAdmin';

export default function ConfiguracionPage() {
  const esAdmin = useEsAdmin();
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    telegram_token: '', telegram_chat_default: '', whatsapp_token: '', whatsapp_phone_id: '',
    gemini_api_key: '', alertas_activas: true,
  });
  const [historial, setHistorial] = useState([]);
  const [fiscal, setFiscal] = useState(null); // { modo, credenciales, punto_venta }
  const [ia, setIa] = useState(null);         // { habilitado, modelo }
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [c, h, f, i] = await Promise.all([
        obtenerConfigNotif(),
        listarNotificaciones(),
        estadoFiscal().catch(() => null),
        estadoTryonIA().catch(() => null),
      ]);
      setCfg(c);
      setForm((f2) => ({ ...f2, alertas_activas: c.alertas_activas, telegram_chat_default: c.telegram_chat_default || '' }));
      setHistorial(h);
      setFiscal(f);
      setIa(i);
    } catch (err) { setError(err.response?.data?.error || 'No se pudo cargar la configuración'); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function setCampo(c, v) { setForm((f) => ({ ...f, [c]: v })); }

  async function guardar(e) {
    e.preventDefault(); setError(''); setOk('');
    try {
      // Solo mandamos los tokens si se escribieron (no pisar con vacío)
      const payload = { alertas_activas: form.alertas_activas, telegram_chat_default: form.telegram_chat_default };
      if (form.telegram_token) payload.telegram_token = form.telegram_token;
      if (form.whatsapp_token) payload.whatsapp_token = form.whatsapp_token;
      if (form.whatsapp_phone_id) payload.whatsapp_phone_id = form.whatsapp_phone_id;
      if (form.gemini_api_key) payload.gemini_api_key = form.gemini_api_key;
      await guardarConfigNotif(payload);
      setOk('Configuración guardada.');
      setForm((f) => ({ ...f, telegram_token: '', whatsapp_token: '', whatsapp_phone_id: '', gemini_api_key: '' }));
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo guardar'); }
  }

  async function probar() {
    setError(''); setOk('');
    try {
      const r = await enviarPrueba({ canal: 'telegram' });
      setOk(`Prueba: estado "${r.estado}". ${r.estado === 'simulado' ? '(registrada en historial, sin envío real)' : ''}`);
      cargar();
    } catch (err) { setError(err.response?.data?.error || 'No se pudo enviar la prueba'); }
  }

  // Defensa en profundidad: si no es admin, no debería estar acá (el backend
  // igual bloquea guardar). Redirige a Inicio.
  if (!esAdmin) return <Navigate to="/" replace />;

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Configuración · Notificaciones
          <InfoBtn
            paraQue="Centraliza las credenciales y preferencias para avisar al cliente y al equipo por Telegram y WhatsApp."
            comoFunciona="Cargá los tokens de cada canal, activá o desactivá las alertas, enviá una prueba y revisá el historial de envíos."
            conQueFin="Automatizar avisos clave (pedido listo, mora, stock) sin tener que escribir mensajes a mano."
          />
        </h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {/* Panel de estado de integraciones: muestra qué está activo y qué
          queda listo para activar cargando una credencial (modelo all-inclusive). */}
      {cfg && (
        <div className="card no-pad">
          <h2 className="section-title" style={{ padding: '1rem 1rem 0' }}>Estado de las integraciones</h2>
          <table className="table">
            <thead><tr><th>Integración</th><th>Estado</th><th>Detalle</th></tr></thead>
            <tbody>
              <tr>
                <td><strong>Try-On con IA</strong> <span className="muted small">(Google / Gemini)</span></td>
                <td>
                  {ia?.habilitado
                    ? <span className="badge">✓ Activo</span>
                    : <span className="badge tag--rojo">Listo para activar</span>}
                </td>
                <td className="small">
                  {ia?.habilitado
                    ? `Modelo ${ia.modelo}. La prueba realista con IA está disponible en Try-On.`
                    : 'Cargá la API key de Google abajo para habilitar la prueba realista. Mientras tanto funciona la superposición 2D.'}
                </td>
              </tr>
              <tr>
                <td><strong>Facturación AFIP/ARCA</strong></td>
                <td>
                  {fiscal?.modo === 'produccion'
                    ? <span className="badge">✓ Producción</span>
                    : fiscal?.modo === 'homologacion'
                      ? <span className="badge">Homologación</span>
                      : <span className="badge tag--rojo">Modo simulación</span>}
                </td>
                <td className="small">
                  {fiscal?.modo === 'produccion'
                    ? `Emisión de CAE real. Punto de venta ${fiscal.punto_venta}.`
                    : fiscal?.modo === 'homologacion'
                      ? `Credenciales de prueba cargadas (sin validez fiscal). Punto de venta ${fiscal.punto_venta}.`
                      : 'Emite comprobante interno (sin CAE). Cargá el certificado AFIP para pasar a facturación real.'}
                </td>
              </tr>
              <tr>
                <td><strong>Telegram</strong></td>
                <td>
                  {cfg.telegram_configurado
                    ? <span className="badge">✓ Configurado</span>
                    : <span className="badge tag--rojo">Sin token</span>}
                </td>
                <td className="small">
                  {cfg.telegram_configurado
                    ? 'Envío real de avisos por el bot de Telegram.'
                    : 'Cargá el Bot Token para enviar avisos automáticos de verdad.'}
                </td>
              </tr>
              <tr>
                <td><strong>WhatsApp</strong> <span className="muted small">(Meta Cloud API)</span></td>
                <td>
                  {cfg.whatsapp_configurado
                    ? <span className="badge">✓ Configurado</span>
                    : <span className="badge tag--rojo">Sin token</span>}
                </td>
                <td className="small">
                  {cfg.whatsapp_configurado
                    ? 'Credenciales cargadas. Requiere plantillas aprobadas por Meta.'
                    : 'Cargá el token y Phone ID de Meta para habilitar los avisos por WhatsApp.'}
                </td>
              </tr>
              <tr>
                <td><strong>Alertas automáticas</strong></td>
                <td>
                  {cfg.alertas_activas
                    ? <span className="badge">✓ Activas</span>
                    : <span className="badge tag--rojo">Desactivadas</span>}
                </td>
                <td className="small">
                  {cfg.alertas_activas
                    ? 'El sistema dispara avisos ante eventos (venta, mora, stock).'
                    : 'Los avisos quedan registrados en el historial, sin envío real.'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <form className="card form-grid" onSubmit={guardar}>
        <label className="field field--full field--check">
          <input type="checkbox" checked={form.alertas_activas} onChange={(e) => setCampo('alertas_activas', e.target.checked)} />
          <span>Alertas automáticas activas</span>
        </label>

        <label className="field"><span>Telegram Bot Token</span>
          <input value={form.telegram_token} onChange={(e) => setCampo('telegram_token', e.target.value)} placeholder="dejar vacío para no cambiar" /></label>
        <label className="field"><span>Telegram Chat ID (destino por defecto)</span>
          <input value={form.telegram_chat_default} onChange={(e) => setCampo('telegram_chat_default', e.target.value)} /></label>

        <label className="field"><span>WhatsApp Token (Meta)</span>
          <input value={form.whatsapp_token} onChange={(e) => setCampo('whatsapp_token', e.target.value)} placeholder="dejar vacío para no cambiar" /></label>
        <label className="field"><span>WhatsApp Phone ID</span>
          <input value={form.whatsapp_phone_id} onChange={(e) => setCampo('whatsapp_phone_id', e.target.value)} /></label>

        <label className="field field--full"><span>Google / Gemini API Key (Try-On con IA)</span>
          <input value={form.gemini_api_key} onChange={(e) => setCampo('gemini_api_key', e.target.value)} placeholder="dejar vacío para no cambiar — habilita la prueba realista con IA" /></label>

        <div className="form-actions">
          <button type="button" className="btn btn--ghost btn--inline" onClick={probar}>Enviar prueba (Telegram)</button>
          <button type="submit" className="btn btn--primary btn--inline">Guardar</button>
        </div>
      </form>

      <div className="card no-pad">
        <h2 className="section-title" style={{ padding: '1rem 1rem 0' }}>Historial de notificaciones</h2>
        <table className="table">
          <thead><tr><th>Fecha</th><th>Canal</th><th>Evento</th><th>Estado</th><th>Mensaje</th></tr></thead>
          <tbody>
            {historial.length === 0 ? (
              <tr><td colSpan="5" className="muted" style={{ padding: '1rem' }}>Sin notificaciones todavía.</td></tr>
            ) : historial.map((n) => (
              <tr key={n.id}>
                <td className="small">{new Date(n.created_at).toLocaleString()}</td>
                <td>{n.canal}</td>
                <td className="small">{n.evento || '—'}</td>
                <td><span className={`badge ${n.estado === 'enviado' ? '' : n.estado === 'error' ? 'tag--rojo' : ''}`}>{n.estado}</span></td>
                <td className="small">{n.mensaje}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
