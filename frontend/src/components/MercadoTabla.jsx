// =====================================================================
// Tabla reutilizable del Catálogo de Mercado. La usan tanto la página
// /mercado (MercadoPage) como la sección "En el mercado" de Prueba Virtual
// (TryOnPage), para mostrar SIEMPRE los mismos datos con el mismo formato.
//
// Props:
//   items: registros de mercado_catalogo (ya filtrados por quien la usa)
// =====================================================================

// colores/tratamientos pueden llegar como array o como string JSON.
export function aLista(valor) {
  if (Array.isArray(valor)) return valor;
  if (typeof valor === 'string' && valor.trim()) {
    try {
      const p = JSON.parse(valor);
      return Array.isArray(p) ? p : [];
    } catch {
      return [];
    }
  }
  return [];
}

// Medidas en formato óptico: calibre▢puente patilla (mm).
export function formatearMedidas(m) {
  if (!m.calibre_ancho) return '—';
  return `${m.calibre_ancho}▢${m.puente ?? '—'} ${m.patilla ?? '—'}`;
}

function unir(valor) {
  const l = aLista(valor);
  return l.length ? l.join(', ') : '—';
}

export default function MercadoTabla({ items }) {
  return (
    <div className="card no-pad">
      <table className="table">
        <thead>
          <tr>
            <th>Marca</th>
            <th>Modelo</th>
            <th>Estilo</th>
            <th>Género</th>
            <th>Material</th>
            <th>Medidas</th>
            <th>Graduación</th>
            <th>Colores</th>
            <th>Tratamientos</th>
          </tr>
        </thead>
        <tbody>
          {items.map((m) => (
            <tr key={m.id}>
              <td><strong>{m.marca}</strong></td>
              <td>
                {m.modelo}
                {m.metadata?.descripcion && (
                  <div className="muted small">{m.metadata.descripcion}</div>
                )}
              </td>
              <td className="small">{m.estilo || '—'}</td>
              <td className="small">{m.genero || '—'}</td>
              <td className="small">{m.material || '—'}</td>
              <td className="small">{formatearMedidas(m)}</td>
              <td className="small">{m.aptitud_graduacion ? 'Apto' : 'No apto'}</td>
              <td className="small">{unir(m.colores)}</td>
              <td className="small">{unir(m.tratamientos)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
