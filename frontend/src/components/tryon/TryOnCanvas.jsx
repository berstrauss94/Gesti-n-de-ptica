// =====================================================================
// Visor central del Virtual Try-On (Canvas 2D) — Camino A.
// - Dibuja la foto del cliente de fondo con encuadre facial al 70%.
// - Superpone el marco PNG SOLO si la foto es frontal y hay un anchor
//   (centro de ojos) calculado por MediaPipe.
// - El marco es FIJO: no se arrastra, ni zoom, ni rotación manual.
// - Escala antropométrica: el ancho del marco en el canvas se calcula a
//   partir del ancho real del marco (mm) y la referencia de escala
//   mm->px del rostro (DIP real del cliente o distancia de ojos).
// - Los cristales se dibujan con baja opacidad para ver los ojos debajo.
//
// El canvas es cuadrado (1:1), representando el visor de 40cm x 40cm.
// =====================================================================

import { forwardRef, useCallback, useEffect, useRef } from 'react';
import useImage from '../../hooks/useImage';

export const SIZE = 800;
export const FACE_FRAMING = 0.7;
export const FOTO_DY_RATIO = 0.12;
// Opacidad de los cristales (0.15–0.20): deja entrever los ojos.
const OPACIDAD_CRISTAL = 0.82; // alpha del marco completo al dibujar

export function calcularLayoutFoto(imgW, imgH) {
  const escala = (SIZE * FACE_FRAMING) / imgH;
  const w = imgW * escala;
  const h = imgH * escala;
  const dx = (SIZE - w) / 2;
  const dy = SIZE * FOTO_DY_RATIO;
  return { escala, dx, dy, w, h };
}

export function imagenACanvas(punto, imgW, imgH) {
  const { escala, dx, dy } = calcularLayoutFoto(imgW, imgH);
  return { x: dx + punto.x * escala, y: dy + punto.y * escala, escala };
}

const TryOnCanvas = forwardRef(function TryOnCanvas(
  { fotoUrl, marcoUrl, anchor, onFotoCargada },
  ref
) {
  const canvasRef = useRef(null);
  const [fotoImg, fotoEstado] = useImage(fotoUrl);
  const [marcoImg] = useImage(marcoUrl);

  useEffect(() => {
    if (ref) {
      if (typeof ref === 'function') ref(canvasRef.current);
      else ref.current = canvasRef.current;
    }
  }, [ref]);

  useEffect(() => {
    if (fotoImg && onFotoCargada) onFotoCargada(fotoImg);
  }, [fotoImg, onFotoCargada]);

  const dibujar = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Foto de fondo
    if (fotoImg) {
      const { dx, dy, w, h } = calcularLayoutFoto(fotoImg.width, fotoImg.height);
      ctx.drawImage(fotoImg, dx, dy, w, h);
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = '28px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Selecciona una foto', SIZE / 2, SIZE / 2);
      return;
    }

    // Marco: SOLO en foto frontal con anchor (centro de ojos + ancho objetivo)
    if (marcoImg && anchor && anchor.frontal) {
      const ratio = marcoImg.height / marcoImg.width;
      const w = anchor.anchoMarcoPx; // ancho objetivo ya calculado (antropométrico)
      const h = w * ratio;
      const cx = anchor.cx;
      const cy = anchor.cy;

      ctx.save();
      ctx.globalAlpha = OPACIDAD_CRISTAL; // cristales/marco semitransparentes
      ctx.translate(cx, cy);
      ctx.rotate(anchor.anguloRad);
      ctx.drawImage(marcoImg, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }, [fotoImg, marcoImg, anchor]);

  useEffect(() => {
    dibujar();
  }, [dibujar]);

  return (
    <div className="tryon-canvas-wrap">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        className="tryon-canvas tryon-canvas--fijo"
      />
      {fotoEstado === 'cargando' && <span className="tryon-canvas__hint">Cargando foto…</span>}
    </div>
  );
});

export default TryOnCanvas;
