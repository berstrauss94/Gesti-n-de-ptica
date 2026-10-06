// =====================================================================
// Visor central del Virtual Try-On (Canvas 2D).
// - Dibuja la foto del cliente de fondo con encuadre facial al 70%
//   (la cara ocupa ~70% de la altura, centrada en el tercio superior).
// - Superpone el marco PNG con la transformación interactiva (posición,
//   escala, rotación) controlada por el componente padre.
// - El drag se maneja aquí y reporta el nuevo offset al padre.
//
// El canvas es cuadrado (1:1), representando el visor de 40cm x 40cm.
// =====================================================================

import { forwardRef, useCallback, useEffect, useRef } from 'react';
import useImage from '../../hooks/useImage';

// Resolución interna del canvas (px). Alta para exportar con calidad.
const SIZE = 800;
// Proporción del encuadre facial sobre el alto del canvas.
const FACE_FRAMING = 0.7;

const TryOnCanvas = forwardRef(function TryOnCanvas(
  { fotoUrl, marcoUrl, transform, onTransformChange },
  ref
) {
  const canvasRef = useRef(null);
  const [fotoImg, fotoEstado] = useImage(fotoUrl);
  const [marcoImg] = useImage(marcoUrl);

  // Exponer el elemento canvas al padre (para exportar)
  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') ref(canvasRef.current);
      else ref.current = canvasRef.current;
    }
  }, [ref]);

  // --- Dibujado ---
  const dibujar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Foto de fondo con encuadre facial al 70%
    if (fotoImg) {
      // Escalamos la foto para que su alto "útil" ocupe FACE_FRAMING del canvas,
      // tipo "cover" horizontal, anclando la cara en el tercio superior.
      const escala = (SIZE * FACE_FRAMING) / fotoImg.height;
      const w = fotoImg.width * escala;
      const h = fotoImg.height * escala;
      const dx = (SIZE - w) / 2;
      const dy = SIZE * 0.12; // deja aire arriba; cara centrada alto
      ctx.drawImage(fotoImg, dx, dy, w, h);
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = '28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Selecciona una foto', SIZE / 2, SIZE / 2);
    }

    // Marco PNG superpuesto con la transformación interactiva
    if (marcoImg) {
      const base = SIZE * 0.55; // ancho base del marco (~55% del visor)
      const ratio = marcoImg.height / marcoImg.width;
      const w = base * transform.scale;
      const h = w * ratio;

      const cx = SIZE / 2 + transform.offsetX;
      const cy = SIZE * 0.42 + transform.offsetY; // altura típica de los ojos

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((transform.rotation * Math.PI) / 180);
      ctx.drawImage(marcoImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }, [fotoImg, marcoImg, transform]);

  useEffect(() => {
    dibujar();
  }, [dibujar]);

  // --- Drag & drop del marco ---
  const arrastre = useRef(null);

  function coordsCanvas(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const escalaX = SIZE / rect.width;
    const escalaY = SIZE / rect.height;
    const punto = e.touches ? e.touches[0] : e;
    return {
      x: (punto.clientX - rect.left) * escalaX,
      y: (punto.clientY - rect.top) * escalaY,
    };
  }

  function onPointerDown(e) {
    if (!marcoImg) return;
    const { x, y } = coordsCanvas(e);
    arrastre.current = {
      x,
      y,
      offsetX: transform.offsetX,
      offsetY: transform.offsetY,
    };
  }

  function onPointerMove(e) {
    if (!arrastre.current) return;
    e.preventDefault();
    const { x, y } = coordsCanvas(e);
    onTransformChange({
      ...transform,
      offsetX: arrastre.current.offsetX + (x - arrastre.current.x),
      offsetY: arrastre.current.offsetY + (y - arrastre.current.y),
    });
  }

  function onPointerUp() {
    arrastre.current = null;
  }

  return (
    <div className="tryon-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="tryon-canvas"
        onMouseDown={onPointerDown}
        onMouseMove={onPointerMove}
        onMouseUp={onPointerUp}
        onMouseLeave={onPointerUp}
        onTouchStart={onPointerDown}
        onTouchMove={onPointerMove}
        onTouchEnd={onPointerUp}
      />
      {fotoEstado === 'cargando' && <span className="tryon-canvas__hint">Cargando foto…</span>}
    </div>
  );
});

export default TryOnCanvas;
