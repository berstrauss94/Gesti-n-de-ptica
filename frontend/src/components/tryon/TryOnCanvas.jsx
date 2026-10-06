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
export const SIZE = 800;
// Proporción del encuadre facial sobre el alto del canvas.
export const FACE_FRAMING = 0.7;
// Desplazamiento vertical del fondo (aire arriba).
export const FOTO_DY_RATIO = 0.12;

// Calcula cómo se dibuja la foto de fondo dentro del canvas (misma lógica
// que usa el dibujado). Devuelve escala y origen para mapear coords de la
// imagen original -> coords del canvas.
export function calcularLayoutFoto(imgW, imgH) {
  const escala = (SIZE * FACE_FRAMING) / imgH;
  const w = imgW * escala;
  const h = imgH * escala;
  const dx = (SIZE - w) / 2;
  const dy = SIZE * FOTO_DY_RATIO;
  return { escala, dx, dy, w, h };
}

// Convierte un punto (px de la imagen) a coords del canvas.
export function imagenACanvas(punto, imgW, imgH) {
  const { escala, dx, dy } = calcularLayoutFoto(imgW, imgH);
  return { x: dx + punto.x * escala, y: dy + punto.y * escala, escala };
}

const TryOnCanvas = forwardRef(function TryOnCanvas(
  { fotoUrl, marcoUrl, transform, onTransformChange, onFotoCargada, anchor },
  ref
) {
  const canvasRef = useRef(null);
  const [fotoImg, fotoEstado] = useImage(fotoUrl);
  const [marcoImg] = useImage(marcoUrl);

  // Avisar al padre cuando la foto queda cargada (para correr detección facial)
  useEffect(() => {
    if (fotoImg && onFotoCargada) onFotoCargada(fotoImg);
  }, [fotoImg, onFotoCargada]);

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
      const { dx, dy, w, h } = calcularLayoutFoto(fotoImg.width, fotoImg.height);
      ctx.drawImage(fotoImg, dx, dy, w, h);
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = '28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Selecciona una foto', SIZE / 2, SIZE / 2);
    }

    // Marco PNG superpuesto.
    if (marcoImg) {
      const ratio = marcoImg.height / marcoImg.width;

      // Punto base y ancho base: si MediaPipe detectó la cara (anchor), el
      // anteojo se ancla en los ojos; si no, al centro del visor.
      let cxBase;
      let cyBase;
      let anchoBase;
      let anguloBaseRad;

      if (anchor) {
        cxBase = anchor.cx;
        cyBase = anchor.cy;
        // El anteojo suele medir ~2.1x la distancia entre centros de ojos.
        anchoBase = anchor.anchoOjos * 2.1;
        anguloBaseRad = anchor.anguloRad;
      } else {
        cxBase = SIZE / 2;
        cyBase = SIZE * 0.42;
        anchoBase = SIZE * 0.55;
        anguloBaseRad = 0;
      }

      const w = anchoBase * transform.scale;
      const h = w * ratio;
      const cx = cxBase + transform.offsetX;
      const cy = cyBase + transform.offsetY;
      const anguloRad = anguloBaseRad + (transform.rotation * Math.PI) / 180;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(anguloRad);
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
