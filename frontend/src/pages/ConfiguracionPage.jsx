// =====================================================================
// Configuración — Notificaciones (WhatsApp / Telegram).
// Permite cargar tokens, activar/desactivar alertas, enviar una prueba
// y ver el historial de notificaciones.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import {
  obtenerConfigNotif, guardarConfigNotif, listarNotificaciones, enviarPrueba,
} from '../api/notificaciones';

export default function ConfiguracionPage() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    telegram_token: '', telegram_chat_default: '', whatsapp_token: '', whatsapp_phone_id: '',
    gemini_api_key: '', alertas_activas: true,
  });
  const [historial, setHistorial] = useState([]);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [c, h] = await Promise.all([obtenerConfigNotif(), listarNotificaciones()]);
      setCfg(c);
      setForm((f) => ({ ...f, alertas_activas: c.alertas_activas, telegram_chat_default: c.telegram_chat_default || '' }));
      setHistorial(h);
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

  return (
    <div className="stack">
      <div className="page-header"><h1>Configuración · Notificaciones</h1></div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {ok && <p className="alert alert--ok" role="status">{ok}</p>}

      {cfg && (
        <div className="card">
          <p className="muted small">
            Estado actual — Telegram: <strong>{cfg.telegram_configurado ? 'configurado' : 'sin token'}</strong>
            {' · '}WhatsApp: <strong>{cfg.whatsapp_configurado ? 'configurado' : 'sin token'}</strong>
            {' · '}Alertas: <strong>{cfg.alertas_activas ? 'activas' : 'desactivadas'}</strong>
          </p>
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
