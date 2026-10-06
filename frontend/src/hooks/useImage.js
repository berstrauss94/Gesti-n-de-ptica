// =====================================================================
// Hook para cargar una imagen (HTMLImageElement) a partir de una URL.
// Devuelve [image, estado]. Usa crossOrigin para permitir exportar el
// canvas sin "tainting" cuando las imágenes vienen del backend.
// =====================================================================

import { useEffect, useState } from 'react';

export default function useImage(src) {
  const [image, setImage] = useState(null);
  const [estado, setEstado] = useState('vacio'); // vacio | cargando | ok | error

  useEffect(() => {
    if (!src) {
      setImage(null);
      setEstado('vacio');
      return undefined;
    }

    let cancelado = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    setEstado('cargando');

    img.onload = () => {
      if (!cancelado) {
        setImage(img);
        setEstado('ok');
      }
    };
    img.onerror = () => {
      if (!cancelado) {
        setImage(null);
        setEstado('error');
      }
    };
    img.src = src;

    return () => {
      cancelado = true;
    };
  }, [src]);

  return [image, estado];
}
