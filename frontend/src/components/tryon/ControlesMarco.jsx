// =====================================================================
// Controles de ajuste fino del marco: escala, rotación y reset.
// La posición se ajusta por drag directo sobre el canvas.
// =====================================================================

export default function ControlesMarco({ transform, onChange, onReset, disabled }) {
  function setCampo(campo, valor) {
    onChange({ ...transform, [campo]: valor });
  }

  return (
    <div className="controles" aria-disabled={disabled}>
      <label className="control">
        <span>Escala: {transform.scale.toFixed(2)}×</span>
        <input
          type="range"
          min="0.3"
          max="2.5"
          step="0.01"
          value={transform.scale}
          onChange={(e) => setCampo('scale', Number(e.target.value))}
          disabled={disabled}
        />
      </label>

      <label className="control">
        <span>Rotación: {transform.rotation}°</span>
        <input
          type="range"
          min="-45"
          max="45"
          step="1"
          value={transform.rotation}
          onChange={(e) => setCampo('rotation', Number(e.target.value))}
          disabled={disabled}
        />
      </label>

      <button type="button" className="btn btn--ghost btn--inline" onClick={onReset} disabled={disabled}>
        Centrar / Reset
      </button>
    </div>
  );
}
