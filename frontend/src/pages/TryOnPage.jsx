// =====================================================================
// Virtual Try-On (Camino A).
// - Superposición del marco SOLO en la foto frontal.
// - Escalado antropométrico: ancho real del marco (mm) + referencia de
//   escala mm->px del rostro (DIP real del cliente si existe; si no, se
//   asume una DIP estándar de 63 mm sobre la distancia de ojos detectada).
// - Marco fijo (no manipulable). Perfil/45° quedan como referencia facial.
// =====================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { listarUsuarios, obtenerUsuario, listarFotos } from '../api/usuarios';
import { listarMarcos } from '../api/marcos';
import { listarGraduaciones } from '../api/graduaciones';
import TryOnCanvas, { imagenACanvas } from '../components/tryon/TryOnCanvas';
import FotosCarrusel from '../components/tryon/FotosCarrusel';
import MarcosCarrusel from '../components/tryon/MarcosCarrusel';
import EditarClienteModal from '../components/tryon/EditarClienteModal';
import EditarMarcoModal from '../components/tryon/EditarMarcoModal';
import useFaceLandmarker from '../hooks/useFaceLandmarker';

const API_BASE = import.meta.env.VITE_API_URL || '';

// DIP estándar adulto si el cliente no tiene receta con DIP cargada.
const DIP_ESTANDAR_MM = 63;

export default function TryOnPage() {
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [cliente, setCliente] = useState(null);

  const [fotos, setFotos] = useState([]);
  const [fotoSel, setFotoSel] = useState(null);
  const [dipMm, setDipMm] = useState(null); // DIP real del cliente (mm) o null

  const [marcos, setMarcos] = useState([]);
  const [marcoSel, setMarcoSel] = useState(null);
  const [qMarco, setQMarco] = useState('');

  // Ancla de dibujo del marco (centro ojos + ancho objetivo en px + ángulo)
  const [anchor, setAnchor] = useState(null);
  const [estadoAjuste, setEstadoAjuste] = useState('idle'); // idle|detectando|ok|no_frontal|sin_rostro

  const [editandoCliente, setEditandoCliente] = useState(false);
  const [editandoMarco, setEditandoMarco] = useState(false);

  const [error, setError] = useState('');
  const canvasRef = useRef(null);
  const { listo: faceListo, detectar } = useFaceLandmarker();

  // Guardamos la última imagen cargada para recalcular si cambia el marco
  const ultimaImg = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [uData, mData] = await Promise.all([
          listarUsuarios({ limit: 200 }),
          listarMarcos({ limit: 200 }),
        ]);
        setClientes(uData.usuarios);
        setMarcos(mData.marcos);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los datos');
      }
    })();
  }, []);

  useEffect(() => {
    if (!clienteId) {
      setCliente(null);
      setFotos([]);
      setFotoSel(null);
      setDipMm(null);
      return;
    }
    (async () => {
      try {
        const [c, f, grads] = await Promise.all([
          obtenerUsuario(clienteId),
          listarFotos(clienteId),
          listarGraduaciones(clienteId).catch(() => []),
        ]);
        setCliente(c);
        setFotos(f);
        setFotoSel(f[0] || null);
        // DIP: tomamos la de la graduación más reciente que la tenga
        const conDip = grads.find((g) => g.distancia_interpupilar != null);
        setDipMm(conDip ? Number(conDip.distancia_interpupilar) : null);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudo cargar el cliente');
      }
    })();
  }, [clienteId]);

  const marcosFiltrados = useMemo(() => {
    const term = qMarco.trim().toLowerCase();
    if (!term) return marcos;
    return marcos.filter(
      (m) =>
        m.codigo.toLowerCase().includes(term) ||
        m.nombre_modelo.toLowerCase().includes(term)
    );
  }, [marcos, qMarco]);

  // Calcula el anchor (posición + ancho antropométrico) a partir de la
  // detección facial y las medidas del marco seleccionado.
  const calcularAnchor = useCallback(
    (img, marco) => {
      if (!img) return null;
      const r = detectar(img);
      if (!r) {
        setEstadoAjuste('sin_rostro');
        return null;
      }
      if (!r.esFrontal) {
        setEstadoAjuste('no_frontal');
        return null;
      }

      // Puntos de los ojos en coords del canvas
      const izq = imagenACanvas(r.ojoIzq, r.imgW, r.imgH);
      const der = imagenACanvas(r.ojoDer, r.imgW, r.imgH);
      const centro = { x: (izq.x + der.x) / 2, y: (izq.y + der.y) / 2 };
      const distOjosPx = Math.hypot(der.x - izq.x, der.y - izq.y);
      const anguloRad = Math.atan2(der.y - izq.y, der.x - izq.x);

      // Referencia de escala mm -> px: la distancia entre centros de ojos
      // en px equivale a la DIP real (mm). Si no hay DIP, usamos estándar.
      const dip = dipMm || DIP_ESTANDAR_MM;
      const pxPorMm = distOjosPx / dip;

      // Ancho objetivo del marco en px: su ancho real (mm) * px/mm.
      // Si el marco no tiene ancho_mm, caemos a una proporción razonable
      // (el frente de un anteojo suele medir ~2.1x la DIP).
      let anchoMarcoPx;
      if (marco && marco.ancho_mm) {
        anchoMarcoPx = Number(marco.ancho_mm) * pxPorMm;
      } else {
        anchoMarcoPx = distOjosPx * 2.1;
      }

      setEstadoAjuste('ok');
      return { cx: centro.x, cy: centro.y, anchoMarcoPx, anguloRad, frontal: true };
    },
    [detectar, dipMm]
  );

  const handleFotoCargada = useCallback(
    (img) => {
      ultimaImg.current = img;
      if (!faceListo) return;
      setEstadoAjuste('detectando');
      setTimeout(() => {
        setAnchor(calcularAnchor(img, marcoSel));
      }, 30);
    },
    [faceListo, calcularAnchor, marcoSel]
  );

  // Al cambiar el marco, recalculamos el ancho con sus medidas
  useEffect(() => {
    if (ultimaImg.current && faceListo && marcoSel) {
      setAnchor(calcularAnchor(ultimaImg.current, marcoSel));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcoSel, faceListo]);

  const handleSeleccionarFoto = useCallback((foto) => setFotoSel(foto), []);
  const handleSeleccionarMarco = useCallback((marco) => setMarcoSel(marco), []);

  function handleExportar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const nombre = cliente ? cliente.nombre_completo.replace(/\s+/g, '_') : 'tryon';
      const marcoCod = marcoSel ? `_${marcoSel.codigo}` : '';
      a.href = url;
      a.download = `tryon_${nombre}${marcoCod}.png`;
      a.click();
    } catch {
      setError('No se pudo exportar la imagen (posible restricción CORS).');
    }
  }

  const fotoUrl = fotoSel ? `${API_BASE}${fotoSel.ruta_local}` : null;
  const marcoUrl = marcoSel ? `${API_BASE}${marcoSel.ruta_imagen_png}` : null;

  return (
    <div className="stack tryon">
      <div className="page-header">
        <h1>Prueba Virtual</h1>
        <div className="tryon-toolbar">
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
            <option value="">Seleccionar cliente…</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre_completo} · {c.dni}
              </option>
            ))}
          </select>
          {cliente && (
            <button type="button" className="btn btn--ghost btn--inline" onClick={() => setEditandoCliente(true)}>
              Editar cliente
            </button>
          )}
          <button type="button" className="btn btn--primary btn--inline" onClick={handleExportar} disabled={!fotoSel}>
            Exportar PNG
          </button>
        </div>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {!cliente ? (
        <div className="card empty">
          <p>Elegí un cliente para comenzar la prueba virtual.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2 className="section-title">Fotos del cliente</h2>
            <FotosCarrusel fotos={fotos} seleccionadaId={fotoSel?.id} onSeleccionar={handleSeleccionarFoto} />
          </div>

          <div className="tryon-main">
            <TryOnCanvas
              ref={canvasRef}
              fotoUrl={fotoUrl}
              marcoUrl={marcoUrl}
              anchor={anchor}
              onFotoCargada={handleFotoCargada}
            />
            <div className="tryon-side">
              <h2 className="section-title">Prueba</h2>
              {marcoSel ? (
                <div className="marco-activo">
                  <span className="badge">{marcoSel.codigo}</span>
                  <strong>{marcoSel.nombre_modelo}</strong>
                  <button type="button" className="link-btn" onClick={() => setEditandoMarco(true)}>
                    Editar
                  </button>
                </div>
              ) : (
                <p className="muted">Seleccioná un marco del catálogo de abajo.</p>
              )}

              {/* Estado del ajuste */}
              {marcoSel && estadoAjuste === 'ok' && (
                <p className="ok-text small">✔ Ajustado a escala real sobre la foto frontal.</p>
              )}
              {marcoSel && estadoAjuste === 'detectando' && <p className="muted small">Detectando rostro…</p>}
              {marcoSel && estadoAjuste === 'no_frontal' && (
                <p className="muted small">
                  Esta foto no es frontal. El marco solo se superpone en la foto de frente;
                  las de 45° y perfil quedan como referencia.
                </p>
              )}
              {marcoSel && estadoAjuste === 'sin_rostro' && (
                <p className="muted small">No se detectó un rostro en esta foto.</p>
              )}

              {/* Info de escala */}
              <div className="escala-info muted small">
                <div>DIP del cliente: {dipMm ? `${dipMm} mm` : `estándar (${DIP_ESTANDAR_MM} mm)`}</div>
                {marcoSel?.ancho_mm && <div>Ancho del marco: {marcoSel.ancho_mm} mm</div>}
                {marcoSel && !marcoSel.ancho_mm && (
                  <div>Este marco no tiene ancho (mm) cargado: se usa proporción estimada.</div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <h2 className="section-title">Catálogo de marcos</h2>
            <MarcosCarrusel
              marcos={marcosFiltrados}
              seleccionadoId={marcoSel?.id}
              onSeleccionar={handleSeleccionarMarco}
              q={qMarco}
              onBuscar={setQMarco}
            />
          </div>
        </>
      )}

      {editandoCliente && cliente && (
        <EditarClienteModal
          cliente={cliente}
          onCerrar={() => setEditandoCliente(false)}
          onGuardado={(actualizado) => {
            setCliente(actualizado);
            setClientes((prev) => prev.map((c) => (c.id === actualizado.id ? actualizado : c)));
            setEditandoCliente(false);
          }}
        />
      )}

      {editandoMarco && marcoSel && (
        <EditarMarcoModal
          marco={marcoSel}
          onCerrar={() => setEditandoMarco(false)}
          onGuardado={(actualizado) => {
            setMarcoSel(actualizado);
            setMarcos((prev) => prev.map((m) => (m.id === actualizado.id ? actualizado : m)));
            setEditandoMarco(false);
          }}
        />
      )}
    </div>
  );
}
