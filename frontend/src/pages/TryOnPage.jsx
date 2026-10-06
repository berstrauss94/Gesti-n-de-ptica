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

  // ¿El marco tiene cargada la vista pedida?
  function vistaDisponible(marco, vista) {
    if (!marco) return false;
    if (vista === '45') return Boolean(marco.ruta_45);
    if (vista === 'perfil') return Boolean(marco.ruta_perfil);
    return true; // frontal siempre existe
  }

  // Elige la URL de la vista del marco según el ángulo detectado.
  // Cae a frontal si la vista pedida no está cargada.
  function urlVista(marco, vista) {
    if (!marco) return null;
    const mapa = {
      frontal: marco.ruta_frontal || marco.ruta_imagen_png,
      45: marco.ruta_45 || marco.ruta_frontal || marco.ruta_imagen_png,
      perfil: marco.ruta_perfil || marco.ruta_45 || marco.ruta_frontal || marco.ruta_imagen_png,
    };
    const ruta = mapa[vista] || marco.ruta_imagen_png;
    return ruta ? `${API_BASE}${ruta}` : null;
  }

  // Calcula el anchor (posición + ancho antropométrico + vista) a partir de
  // la detección facial y las medidas del marco seleccionado.
  const calcularAnchor = useCallback(
    (img, marco) => {
      if (!img) return null;
      const r = detectar(img);
      if (!r) {
        setEstadoAjuste('sin_rostro');
        return null;
      }

      // Puntos de los ojos en coords del canvas
      const izq = imagenACanvas(r.ojoIzq, r.imgW, r.imgH);
      const der = imagenACanvas(r.ojoDer, r.imgW, r.imgH);
      const centro = { x: (izq.x + der.x) / 2, y: (izq.y + der.y) / 2 };
      const distOjosPx = Math.hypot(der.x - izq.x, der.y - izq.y) || 1;
      const anguloRad = Math.atan2(der.y - izq.y, der.x - izq.x);

      // Escala antropométrica: distancia entre ojos (px) ~ DIP real (mm).
      const dip = dipMm || DIP_ESTANDAR_MM;
      const pxPorMm = distOjosPx / dip;

      // En perfil, la distancia entre ojos deja de ser confiable (se ve 1 ojo),
      // así que usamos la DIP como referencia relativa al ancho de la imagen.
      let anchoMarcoPx;
      if (r.vista === 'perfil') {
        // ancho objetivo ~ ancho real del marco escalado por una referencia
        // estable: usamos la altura del rostro aproximada por la posición.
        anchoMarcoPx = (marco?.ancho_mm ? Number(marco.ancho_mm) : 140) * pxPorMm;
      } else if (marco?.ancho_mm) {
        anchoMarcoPx = Number(marco.ancho_mm) * pxPorMm;
      } else {
        anchoMarcoPx = distOjosPx * 2.1;
      }

      setEstadoAjuste(`ok_${r.vista}`);
      return {
        cx: centro.x,
        cy: centro.y,
        anchoMarcoPx,
        anguloRad,
        vista: r.vista,
        lado: r.lado,
        dibujar: true,
      };
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
  // La vista del marco depende del ángulo detectado en la foto actual
  const vistaActual = anchor?.vista || 'frontal';
  const marcoUrl = urlVista(marcoSel, vistaActual);

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
              {marcoSel && estadoAjuste?.startsWith('ok_') && (
                <p className="ok-text small">
                  ✔ Vista {estadoAjuste.replace('ok_', '')} ajustada a escala real.
                  {vistaActual !== 'frontal' && !vistaDisponible(marcoSel, vistaActual) && (
                    <> (este marco no tiene esa vista cargada; se usa la frontal)</>
                  )}
                </p>
              )}
              {marcoSel && estadoAjuste === 'detectando' && <p className="muted small">Detectando rostro…</p>}
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
