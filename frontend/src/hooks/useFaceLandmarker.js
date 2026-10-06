// =====================================================================
// Hook que inicializa el FaceLandmarker de MediaPipe (tasks-vision) una
// sola vez y expone una función detectar(imagen) que devuelve los puntos
// clave del rostro útiles para posicionar un anteojo:
//   { ojoIzq, ojoDer, centro, anchoOjos, anguloRad }  en coords de la imagen.
// Si no detecta rostro, devuelve null.
// =====================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// Índices de landmarks de Face Mesh (esquinas externas de cada ojo)
const OJO_IZQ_EXT = 33;   // ojo izquierdo del sujeto (lado derecho de la imagen)
const OJO_DER_EXT = 263;  // ojo derecho del sujeto
const OJO_IZQ_INT = 133;
const OJO_DER_INT = 362;

export default function useFaceLandmarker() {
  const landmarkerRef = useRef(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
        );
        const fl = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          numFaces: 1,
        });
        if (!cancelado) {
          landmarkerRef.current = fl;
          setListo(true);
        }
      } catch (err) {
        if (!cancelado) setError(err.message || 'No se pudo inicializar la detección facial');
      }
    })();
    return () => {
      cancelado = true;
      if (landmarkerRef.current) {
        landmarkerRef.current.close?.();
        landmarkerRef.current = null;
      }
    };
  }, []);

  // imagen: HTMLImageElement ya cargado. Devuelve datos en píxeles de la imagen.
  const detectar = useCallback((imagen) => {
    const fl = landmarkerRef.current;
    if (!fl || !imagen) return null;

    const res = fl.detect(imagen);
    const caras = res?.faceLandmarks;
    if (!caras || caras.length === 0) return null;

    const pts = caras[0]; // normalizados 0..1
    const W = imagen.naturalWidth || imagen.width;
    const H = imagen.naturalHeight || imagen.height;
    const px = (p) => ({ x: p.x * W, y: p.y * H });

    // Centro de cada ojo = promedio de esquina externa e interna
    const izqExt = px(pts[OJO_IZQ_EXT]);
    const izqInt = px(pts[OJO_IZQ_INT]);
    const derExt = px(pts[OJO_DER_EXT]);
    const derInt = px(pts[OJO_DER_INT]);
    const ojoIzq = { x: (izqExt.x + izqInt.x) / 2, y: (izqExt.y + izqInt.y) / 2 };
    const ojoDer = { x: (derExt.x + derInt.x) / 2, y: (derExt.y + derInt.y) / 2 };

    const centro = { x: (ojoIzq.x + ojoDer.x) / 2, y: (ojoIzq.y + ojoDer.y) / 2 };
    const dx = ojoDer.x - ojoIzq.x;
    const dy = ojoDer.y - ojoIzq.y;
    const anchoOjos = Math.hypot(dx, dy); // distancia interpupilar en px
    const anguloRad = Math.atan2(dy, dx); // inclinación de la línea de ojos

    // Estimación de yaw (giro horizontal de la cabeza):
    // comparamos la distancia de cada ojo a la punta de la nariz (landmark 1).
    const nariz = px(pts[1]);
    const dIzq = Math.hypot(ojoIzq.x - nariz.x, ojoIzq.y - nariz.y);
    const dDer = Math.hypot(ojoDer.x - nariz.x, ojoDer.y - nariz.y);
    const asimetria = Math.abs(dIzq - dDer) / Math.max(dIzq, dDer); // 0=frontal, ~1=perfil

    // Clasificación del ángulo de la foto en 3 categorías.
    let vista;
    if (asimetria < 0.22) vista = 'frontal';
    else if (asimetria < 0.55) vista = '45';
    else vista = 'perfil';

    // Lado hacia el que mira (para espejar la vista 45/perfil si hace falta):
    // si el ojo derecho está más lejos de la nariz, la cara mira a la izquierda.
    const lado = dDer > dIzq ? 'izquierda' : 'derecha';

    const esFrontal = vista === 'frontal';

    return {
      ojoIzq, ojoDer, centro, anchoOjos, anguloRad,
      asimetria, vista, lado, esFrontal, imgW: W, imgH: H,
    };
  }, []);

  return { listo, error, detectar };
}
