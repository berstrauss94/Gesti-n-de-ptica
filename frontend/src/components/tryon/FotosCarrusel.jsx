// =====================================================================
// Carrusel superior: las 3 fotos del cliente. Al clic cambia el fondo.
// =====================================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function FotosCarrusel({ fotos, seleccionadaId, onSeleccionar }) {
  if (!fotos || fotos.length === 0) {
    return <p className="muted">Este cliente no tiene fotos cargadas.</p>;
  }

  return (
    <div className="carrusel carrusel--top">
      {fotos.map((foto) => (
        <button
          key={foto.id}
          type="button"
          className={`carrusel__item ${seleccionadaId === foto.id ? 'is-active' : ''}`}
          onClick={() => onSeleccionar(foto)}
          title={`Foto ${foto.orden_foto}`}
        >
          <img src={`${API_BASE}${foto.ruta_local}`} alt={`Foto ${foto.orden_foto}`} />
        </button>
      ))}
    </div>
  );
}
