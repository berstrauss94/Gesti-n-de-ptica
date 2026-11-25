// =====================================================================
// Modal genérico reutilizable.
// =====================================================================

export default function Modal({ titulo, children, onCerrar, ancho = false }) {
  return (
    <div className="modal-overlay" onMouseDown={onCerrar}>
      <div className={ancho ? 'modal modal--ancho' : 'modal'} role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2>{titulo}</h2>
          <button type="button" className="modal__close" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}
