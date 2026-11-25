// =====================================================================
// Selector del catálogo "Lentes y otros" dentro del Sobre (modal).
// Muestra las mismas solapas por categoría y la misma búsqueda que la
// página de Lentes y otros; cada fila tiene "Seleccionar".
// Se usa para el lente de LEJOS, el de CERCA y para sumar servicios,
// insumos o accesorios a "Otros".
//
// Props:
//   contexto        'lejos' | 'cerca' | 'otros'  (define el título y la categoría inicial)
//   onSeleccionar(item)   item del catálogo (id, descripcion, subcategoria_grupo, precio_lista, …)
//   onCerrar()
// =====================================================================
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import Modal from '../Modal';
import { listarCatalogoLab } from '../../api/laboratorio';
import { CATEGORIAS_LAB } from '../../utils/catalogoLab';
import { pesos } from '../../utils/sobreTotales';

const TITULO = {
  lejos: 'Elegir lente para la receta de Lejos',
  cerca: 'Elegir lente para la receta de Cerca',
  otros: 'Agregar servicio, insumo o accesorio',
};
const CATEGORIA_INICIAL = { lejos: '1 MONOFOCALES', cerca: '1 MONOFOCALES', otros: '9 TRATAMIENTOS Y SERVICIOS' };

export default function SelectorCatalogoLab({ contexto, onSeleccionar, onCerrar }) {
  const [categoria, setCategoria] = useState(CATEGORIA_INICIAL[contexto] || CATEGORIAS_LAB[0]);
  const [q, setQ] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError('');
    listarCatalogoLab(busqueda ? { q: busqueda } : { categoria })
      .then((data) => { if (vivo) setItems(data); })
      .catch((err) => { if (vivo) setError(err.response?.data?.error || 'No se pudo cargar el catálogo'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [categoria, busqueda]);

  function elegirCategoria(c) { setQ(''); setBusqueda(''); setCategoria(c); }

  return (
    <Modal titulo={TITULO[contexto] || 'Lentes y otros'} onCerrar={onCerrar} ancho>
      <div className="stack">
        {/* div y no <form>: el modal vive dentro del formulario del sobre. */}
        <div className="searchbar" role="search">
          <input
            type="search"
            placeholder="Buscar cristal, código, grupo o marca…"
            value={q}
            autoFocus
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setBusqueda(q.trim()); } }}
          />
          <button type="button" className="btn btn--ghost" onClick={() => setBusqueda(q.trim())}>
            <Search size={14} /> Buscar
          </button>
          {busqueda && (
            <button type="button" className="btn btn--ghost" onClick={() => elegirCategoria(categoria)}>Limpiar</button>
          )}
        </div>

        <nav className="lab-tabs" role="tablist" aria-label="Categorías">
          {CATEGORIAS_LAB.map((c) => {
            const activa = !busqueda && c === categoria;
            return (
              <button key={c} type="button" role="tab" aria-selected={activa}
                className={activa ? 'lab-tab is-active' : 'lab-tab'} onClick={() => elegirCategoria(c)}>
                {c}
              </button>
            );
          })}
        </nav>

        {error && <p className="alert alert--error" role="alert">{error}</p>}
        {cargando ? (
          <p className="muted">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="muted small">{busqueda ? `No hay ítems que coincidan con “${busqueda}”.` : 'Esta categoría no tiene ítems.'}</p>
        ) : (
          <div className="catalogo-sel">
            {items.map((it) => (
              <div key={it.id} className="lab-row">
                <div className="lab-row__cod">
                  <span className="lab-id">{it.id}</span>
                  {it.marca_proveedor && <span className="lab-marca">{it.marca_proveedor}</span>}
                </div>
                <div className="lab-row__main">
                  <span className="lab-row__desc">{it.descripcion}</span>
                  {it.subcategoria_grupo && <span className="muted small">{it.subcategoria_grupo}</span>}
                  {it.badge_graduacion_raw && <span className="lab-badge lab-badge--grad">{it.badge_graduacion_raw}</span>}
                  {it.dias_demora != null && <span className="lab-badge lab-badge--dias">⏱ {it.dias_demora} días</span>}
                </div>
                <span className="lab-row__precio">{pesos(it.precio_lista)}</span>
                <button type="button" className="btn btn--primary btn--inline catalogo-sel__btn" onClick={() => onSeleccionar(it)}>
                  Seleccionar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
