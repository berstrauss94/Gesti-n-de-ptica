// =====================================================================
// Asistente virtual de ayuda: chat con preguntas frecuentes por tema y
// consulta escrita. Las respuestas guardadas salen primero; si no hay,
// responde la IA (y lo avisa). Cada respuesta se puede valorar.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { obtenerOpcionesAsistente, consultarAsistente, valorarConsulta } from '../api/asistente';

const SALUDO = { remitente: 'bot', texto: '¡Hola! ¿Qué duda tenés sobre cómo usar el sistema? Elegí un tema o escribila abajo.' };

// Logo: viñeta rosa con el signo de pregunta blanco.
function LogoAyuda({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 4C12.4 4 3 12.2 3 22.3c0 5.6 2.9 10.6 7.5 14L8.6 44l8.4-4.4c2.2.6 4.5.9 7 .9 11.6 0 21-8.2 21-18.3S35.6 4 24 4z" fill="#d80075" />
      <text x="24" y="31" textAnchor="middle" fontSize="25" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="#ffffff">?</text>
    </svg>
  );
}

export default function AsistenteVirtualModal({ abierto, onAbrir, onCerrar }) {
  const [menu, setMenu] = useState([]);
  const [errorMenu, setErrorMenu] = useState('');
  const [catAbierta, setCatAbierta] = useState(null);
  const [mensajes, setMensajes] = useState([SALUDO]);
  const [texto, setTexto] = useState('');
  const [cargando, setCargando] = useState(false);
  const finRef = useRef(null);

  useEffect(() => {
    if (!abierto || menu.length > 0) return;
    obtenerOpcionesAsistente()
      .then(setMenu)
      .catch(() => setErrorMenu('No se pudieron cargar las preguntas frecuentes. Igual podés escribir tu duda.'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);
  useEffect(() => {
    if (!abierto) return undefined;
    const alTecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTecla);
    return () => window.removeEventListener('keydown', alTecla);
  }, [abierto, onCerrar]);
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
    <>
      {!abierto && (
        <button type="button" className="asistente-fab" onClick={onAbrir}
          aria-label="Abrir el asistente de ayuda" title="¿Necesitás ayuda?">
          <LogoAyuda size={34} />
        </button>
      )}
      {abierto && (
      <section className="asistente-panel" role="dialog" aria-label="Asistente de ayuda">
        <header className="asistente-panel__header">
          <span className="asistente-panel__logo"><LogoAyuda size={26} /></span>
          <h2>Asistente de ayuda</h2>
          <button type="button" className="asistente-panel__cerrar" onClick={onCerrar} aria-label="Cerrar">×</button>
        </header>
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
      </section>
      )}
    </>
  );
}
