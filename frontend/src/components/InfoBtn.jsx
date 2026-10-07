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

import { useEffect, useState } from 'react';

export default function InfoBtn({ paraQue, comoFunciona, conQueFin }) {
  const [abierto, setAbierto] = useState(false);

  // El cierre al hacer clic/tap fuera lo maneja el overlay (ver más abajo).
  // Cerrar con la tecla Escape
  useEffect(() => {
    if (!abierto) return undefined;
    function escape(e) {
      if (e.key === 'Escape') setAbierto(false);
    }
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [abierto]);

  return (
    <span className="info-wrap">
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
        // Overlay fijo que cubre toda la pantalla: el panel queda centrado y
        // SIEMPRE por encima de cualquier otra capa (inputs, dropdowns, etc.).
        <div
          className="info-overlay"
          onClick={() => setAbierto(false)}
        >
          <div
            className="info-popover"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="info-popover__close"
              aria-label="Cerrar"
              onClick={() => setAbierto(false)}
            >
              ×
            </button>
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
        </div>
      )}
    </span>
  );
}
