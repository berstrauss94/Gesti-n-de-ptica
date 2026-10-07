// =====================================================================
// Botón de ayuda informativo de sección: un "!" que, al tocarlo, abre un
// popover con 3 puntos (para qué sirve, cómo funciona, con qué fin).
// Se cierra al hacer clic/tap fuera.
//
// Uso:
//   <InfoBtn
//     paraQue="..."
//     comoFunciona="..."
//     conQueFin="..."
//   />
// =====================================================================

import { useEffect, useRef, useState } from 'react';

export default function InfoBtn({ paraQue, comoFunciona, conQueFin }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  // Cerrar al hacer clic/tap fuera
  useEffect(() => {
    if (!abierto) return undefined;
    function fuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    document.addEventListener('touchstart', fuera);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('touchstart', fuera);
    };
  }, [abierto]);

  return (
    <span className="info-wrap" ref={ref}>
      <button
        type="button"
        className="info-btn"
        aria-label="Información de la sección"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
      >
        !
      </button>
      {abierto && (
        <div className="info-popover" role="dialog">
          {paraQue && (
            <div className="info-popover__item">
              <span className="info-popover__label">¿Para qué sirve?</span>
              <p>{paraQue}</p>
            </div>
          )}
          {comoFunciona && (
            <div className="info-popover__item">
              <span className="info-popover__label">¿Cómo funciona?</span>
              <p>{comoFunciona}</p>
            </div>
          )}
          {conQueFin && (
            <div className="info-popover__item">
              <span className="info-popover__label">¿Con qué fin?</span>
              <p>{conQueFin}</p>
            </div>
          )}
        </div>
      )}
    </span>
  );
}
