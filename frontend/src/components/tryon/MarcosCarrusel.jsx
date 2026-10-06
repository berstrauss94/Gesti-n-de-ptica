// =====================================================================
// Carrusel inferior: catálogo de marcos (miniaturas a mitad de escala)
// con el código visible al pie y búsqueda por código o nombre.
// =====================================================================

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function MarcosCarrusel({
  marcos,
  seleccionadoId,
  onSeleccionar,
  q,
  onBuscar,
}) {
  return (
    <div className="marcos-carrusel">
      <div className="searchbar searchbar--compact">
        <input
          type="search"
          placeholder="Buscar marco por código o nombre…"
          value={q}
          onChange={(e) => onBuscar(e.target.value)}
        />
      </div>

      {marcos.length === 0 ? (
        <p className="muted">No hay marcos que coincidan.</p>
      ) : (
        <div className="carrusel carrusel--bottom">
          {marcos.map((m) => (
            <figure
              key={m.id}
              className={`marco-mini ${seleccionadoId === m.id ? 'is-active' : ''}`}
            >
              <button
                type="button"
                className="marco-mini__btn"
                onClick={() => onSeleccionar(m)}
                title={`${m.nombre_modelo} (${m.codigo})`}
              >
                <img src={`${API_BASE}${m.ruta_imagen_png}`} alt={m.nombre_modelo} />
              </button>
              <figcaption>{m.codigo}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
