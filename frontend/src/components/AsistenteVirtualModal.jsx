// =====================================================================
// Asistente virtual de ayuda: chat con preguntas frecuentes por tema y
// consulta escrita. Las respuestas guardadas salen primero; si no hay,
// responde la IA (y lo avisa). Cada respuesta se puede valorar.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { obtenerOpcionesAsistente, consultarAsistente, valorarConsulta } from '../api/asistente';

const SALUDO = { remitente: 'bot', texto: '¡Hola! ¿Qué duda tenés sobre cómo usar el sistema? Elegí un tema o escribila abajo.' };

export default function AsistenteVirtualModal({ onCerrar }) {
  const [menu, setMenu] = useState([]);
  const [errorMenu, setErrorMenu] = useState('');
  const [catAbierta, setCatAbierta] = useState(null);
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const finRef = useRef(null);

  useEffect(() => {
    obtenerOpcionesAsistente()
      .then(setMenu)
      .catch(() => setErrorMenu('No se pudieron cargar las preguntas frecuentes. Igual podés escribir tu duda.'));
  }, []);
  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [mensajes, cargando]);

  const agregar = (m) => setMensajes((prev) => [...prev, m]);

  // Pide la respuesta (por opción o por texto) y la suma al chat.
  async function preguntar(cuerpo, textoUsuario) {
    agregar({ remitente: 'usuario', texto: textoUsuario });
    setCargando(true);
    try {
      const r = await consultarAsistente(cuerpo);
      agregar({
        remitente: 'bot', texto: r.respuesta, fuente: r.fuente,
        consultaId: r.consulta_id, relacionadas: r.opcionesRelacionadas || [],
      });
    } catch (err) {
      agregar({ remitente: 'bot', texto: err.response?.data?.error || 'No pude procesar la consulta. Probá con una de las preguntas del menú.' });
    } finally {
      setCargando(false);
    }
  }

  function enviar(e) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || cargando) return;
    setTexto('');
    preguntar({ consultaManual: t }, t);
  }

  async function valorar(indice, valoracion) {
    const m = mensajes[indice];
    if (!m?.consultaId || m.valorado) return;
    setMensajes((prev) => prev.map((x, i) => (i === indice ? { ...x, valorado: valoracion } : x)));
    try { await valorarConsulta(m.consultaId, valoracion); }
    catch { setMensajes((prev) => prev.map((x, i) => (i === indice ? { ...x, valorado: 0 } : x))); }
  }

  const categoria = menu.find((c) => c.id === catAbierta);

  return (
    <Modal titulo="Asistente de ayuda" onCerrar={onCerrar}>
      <div className="asistente">
        <div className="asistente__chat" role="log" aria-live="polite">
          {mensajes.map((m, i) => (
            <div key={i} className={'asistente__burbuja asistente__burbuja--' + m.remitente}>
              <p>{m.texto}</p>
              {m.fuente === 'ia_gemini' && (
                <p className="muted small">Respuesta generada por IA: verificala si es importante.</p>
              )}
              {m.relacionadas?.length > 0 && (
                <div className="asistente__chips">
                  {m.relacionadas.map((p) => (
                    <button key={p.id} type="button" className="asistente__chip" disabled={cargando}
                      onClick={() => preguntar({ preguntaId: p.id }, p.pregunta)}>{p.pregunta}</button>
                  ))}
                </div>
              )}
              {m.consultaId && (
                <div className="asistente__valorar">
                  <span className="muted small">¿Te sirvió?</span>
                  <button type="button" className="btn-mini" disabled={Boolean(m.valorado)} onClick={() => valorar(i, 1)}>
                    {m.valorado === 1 ? '✓ Útil' : 'Útil'}
                  </button>
                  <button type="button" className="btn-mini" disabled={Boolean(m.valorado)} onClick={() => valorar(i, -1)}>
                    {m.valorado === -1 ? '✓ No útil' : 'No útil'}
                  </button>
                </div>
              )}
            </div>
          ))}
          {cargando && <div className="asistente__burbuja asistente__burbuja--bot"><p className="muted">Buscando la respuesta…</p></div>}
          <div ref={finRef} />
        </div>

        <div className="asistente__menu">
          <p className="asistente__titulo">Preguntas frecuentes por tema</p>
          {errorMenu && <p className="muted small">{errorMenu}</p>}
          <div className="asistente__chips">
            {menu.map((c) => (
              <button key={c.id} type="button"
                className={'asistente__chip asistente__chip--tema' + (c.id === catAbierta ? ' is-active' : '')}
                onClick={() => setCatAbierta(c.id === catAbierta ? null : c.id)}>
                {c.icono ? c.icono + ' ' : ''}{c.nombre}
              </button>
            ))}
          </div>
          {categoria && (
            <div className="asistente__chips">
              {categoria.preguntas.map((p) => (
                <button key={p.id} type="button" className="asistente__chip" disabled={cargando}
                  onClick={() => preguntar({ preguntaId: p.id }, p.pregunta)}>{p.pregunta}</button>
              ))}
            </div>
          )}
        </div>

        <form className="asistente__form" onSubmit={enviar}>
          <input type="text" value={texto} maxLength={500} placeholder="O escribí tu duda acá…"
            aria-label="Tu consulta" onChange={(e) => setTexto(e.target.value)} />
          <button type="submit" className="btn btn--primary btn--inline" disabled={cargando || !texto.trim()}>Enviar</button>
        </form>
      </div>
    </Modal>
  );
}
