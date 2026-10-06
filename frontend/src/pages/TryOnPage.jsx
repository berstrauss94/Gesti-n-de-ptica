// =====================================================================
// Virtual Try-On (Fase 3).
// Orquesta: selección de cliente -> fotos (carrusel superior) +
// catálogo de marcos (carrusel inferior con búsqueda) -> Canvas 2D con
// marco superpuesto (drag/zoom/rotación) -> exportación de la captura.
// Edición rápida de cliente y marco vía modales (endpoints PUT).
// =====================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { listarUsuarios, obtenerUsuario, listarFotos } from '../api/usuarios';
import { listarMarcos } from '../api/marcos';
import TryOnCanvas, { imagenACanvas } from '../components/tryon/TryOnCanvas';
import useFaceLandmarker from '../hooks/useFaceLandmarker';
import FotosCarrusel from '../components/tryon/FotosCarrusel';
import MarcosCarrusel from '../components/tryon/MarcosCarrusel';
import ControlesMarco from '../components/tryon/ControlesMarco';
import EditarClienteModal from '../components/tryon/EditarClienteModal';
import EditarMarcoModal from '../components/tryon/EditarMarcoModal';

const API_BASE = import.meta.env.VITE_API_URL || '';

const TRANSFORM_INICIAL = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };

export default function TryOnPage() {
  // Selección de cliente
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [cliente, setCliente] = useState(null);

  // Datos del cliente seleccionado
  const [fotos, setFotos] = useState([]);
  const [fotoSel, setFotoSel] = useState(null);

  // Catálogo de marcos
  const [marcos, setMarcos] = useState([]);
  const [marcoSel, setMarcoSel] = useState(null);
  const [qMarco, setQMarco] = useState('');

  // Transformación del marco en el canvas (ajuste fino sobre el auto-ajuste)
  const [transform, setTransform] = useState(TRANSFORM_INICIAL);

  // Ancla de auto-ajuste calculada por MediaPipe (centro/ancho/ángulo de ojos
  // en coords del canvas). null = sin detección -> posicionamiento manual.
  const [anchor, setAnchor] = useState(null);
  const [autoAjuste, setAutoAjuste] = useState('idle'); // idle|detectando|ok|sin_rostro

  // Modales de edición
  const [editandoCliente, setEditandoCliente] = useState(false);
  const [editandoMarco, setEditandoMarco] = useState(false);

  const [error, setError] = useState('');
  const canvasRef = useRef(null);

  const { listo: faceListo, detectar } = useFaceLandmarker();

  // Cuando la foto queda cargada en el canvas, corremos la detección facial.
  const handleFotoCargada = useCallback(
    (img) => {
      if (!faceListo) return;
      setAutoAjuste('detectando');
      // Pequeño defer para no bloquear el render
      setTimeout(() => {
        try {
          const r = detectar(img);
          if (!r) {
            setAnchor(null);
            setAutoAjuste('sin_rostro');
            return;
          }
          // Mapear ojos (px de la imagen) a coords del canvas
          const ci = imagenACanvas(r.centro, r.imgW, r.imgH);
          const izq = imagenACanvas(r.ojoIzq, r.imgW, r.imgH);
          const der = imagenACanvas(r.ojoDer, r.imgW, r.imgH);
          const anchoOjosCanvas = Math.hypot(der.x - izq.x, der.y - izq.y);
          setAnchor({
            cx: ci.x,
            cy: ci.y,
            anchoOjos: anchoOjosCanvas,
            anguloRad: Math.atan2(der.y - izq.y, der.x - izq.x),
          });
          setTransform(TRANSFORM_INICIAL); // el anteojo cae centrado en los ojos
          setAutoAjuste('ok');
        } catch {
          setAnchor(null);
          setAutoAjuste('sin_rostro');
        }
      }, 30);
    },
    [faceListo, detectar]
  );

  // Cargar lista de clientes y catálogo de marcos al inicio
  useEffect(() => {
    (async () => {
      try {
        const [uData, mData] = await Promise.all([listarUsuarios({ limit: 200 }), listarMarcos({ limit: 200 })]);
        setClientes(uData.usuarios);
        setMarcos(mData.marcos);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudieron cargar los datos');
      }
    })();
  }, []);

  // Al elegir cliente: cargar sus datos y fotos
  useEffect(() => {
    if (!clienteId) {
      setCliente(null);
      setFotos([]);
      setFotoSel(null);
      return;
    }
    (async () => {
      try {
        const [c, f] = await Promise.all([obtenerUsuario(clienteId), listarFotos(clienteId)]);
        setCliente(c);
        setFotos(f);
        setFotoSel(f[0] || null); // primera foto por defecto
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudo cargar el cliente');
      }
    })();
  }, [clienteId]);

  // Filtrado del carrusel de marcos por código o nombre (cliente-side)
  const marcosFiltrados = useMemo(() => {
    const term = qMarco.trim().toLowerCase();
    if (!term) return marcos;
    return marcos.filter(
      (m) =>
        m.codigo.toLowerCase().includes(term) ||
        m.nombre_modelo.toLowerCase().includes(term)
    );
  }, [marcos, qMarco]);

  // Cambiar de foto preserva el marco y su transformación
  const handleSeleccionarFoto = useCallback((foto) => setFotoSel(foto), []);

  // Al elegir un marco, reseteamos la transformación para centrarlo
  const handleSeleccionarMarco = useCallback((marco) => {
    setMarcoSel(marco);
    setTransform(TRANSFORM_INICIAL);
  }, []);

  function handleReset() {
    setTransform(TRANSFORM_INICIAL);
  }

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
    } catch (err) {
      // toDataURL falla si el canvas quedó "tainted" (CORS)
      setError('No se pudo exportar la imagen (posible restricción CORS en las imágenes).');
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
          <button
            type="button"
            className="btn btn--primary btn--inline"
            onClick={handleExportar}
            disabled={!fotoSel}
          >
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
          {/* Carrusel superior: fotos del cliente */}
          <div className="card">
            <h2 className="section-title">Fotos del cliente</h2>
            <FotosCarrusel
              fotos={fotos}
              seleccionadaId={fotoSel?.id}
              onSeleccionar={handleSeleccionarFoto}
            />
          </div>

          {/* Visor central + controles */}
          <div className="tryon-main">
            <TryOnCanvas
              ref={canvasRef}
              fotoUrl={fotoUrl}
              marcoUrl={marcoUrl}
              transform={transform}
              onTransformChange={setTransform}
              onFotoCargada={handleFotoCargada}
              anchor={anchor}
            />
            <div className="tryon-side">
              <h2 className="section-title">Ajuste del marco</h2>
              {marcoSel ? (
                <>
                  <div className="marco-activo">
                    <span className="badge">{marcoSel.codigo}</span>
                    <strong>{marcoSel.nombre_modelo}</strong>
                    <button type="button" className="link-btn" onClick={() => setEditandoMarco(true)}>
                      Editar
                    </button>
                  </div>
                  <ControlesMarco transform={transform} onChange={setTransform} onReset={handleReset} />
                  {autoAjuste === 'ok' && (
                    <p className="ok-text small">✔ Ajuste automático aplicado sobre los ojos.</p>
                  )}
                  {autoAjuste === 'detectando' && (
                    <p className="muted small">Detectando rostro…</p>
                  )}
                  {autoAjuste === 'sin_rostro' && (
                    <p className="muted small">No se detectó rostro; ajustá el marco manualmente.</p>
                  )}
                  <p className="muted small">Podés afinar arrastrando, con zoom y rotación.</p>
                </>
              ) : (
                <p className="muted">Seleccioná un marco del catálogo de abajo.</p>
              )}
            </div>
          </div>

          {/* Carrusel inferior: catálogo de marcos con búsqueda */}
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
