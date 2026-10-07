// =====================================================================
// Catálogo de marcos: grilla con filtros (búsqueda y estilo de forma).
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listarMarcos } from '../api/marcos';
import InfoBtn from '../components/InfoBtn';

const API_BASE = import.meta.env.VITE_API_URL || '';

const ESTILOS = ['OVALADO', 'RECTANGULAR', 'AVIADOR', 'CAT-EYE'];

export default function MarcosPage() {
  const [marcos, setMarcos] = useState([]);
  const [q, setQ] = useState('');
  const [estilo, setEstilo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (busqueda, estiloForma) => {
    setCargando(true);
    setError('');
    try {
      const data = await listarMarcos({ q: busqueda, estilo_forma: estiloForma });
      setMarcos(data.marcos);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los marcos');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar('', '');
  }, [cargar]);

  function handleBuscar(e) {
    e.preventDefault();
    cargar(q, estilo);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Catálogo de marcos
          <InfoBtn
            paraQue="Es el catálogo de armazones/lentes disponibles para la prueba virtual y la venta."
            comoFunciona="Buscá por código, modelo o marca, filtrá por forma, o cargá un marco nuevo con su imagen y medidas (mm)."
            conQueFin="Tener los modelos listos para mostrarlos sobre la foto del cliente y asociarlos a ventas."
          />
        </h1>
        <Link to="/marcos/nuevo" className="btn btn--primary btn--inline">
          + Nuevo marco
        </Link>
      </div>

      <form className="searchbar" onSubmit={handleBuscar}>
        <input
          type="search"
          placeholder="Buscar por código, modelo o marca…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={estilo} onChange={(e) => setEstilo(e.target.value)}>
          <option value="">Todas las formas</option>
          {ESTILOS.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button type="submit" className="btn btn--ghost">Filtrar</button>
      </form>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : marcos.length === 0 ? (
        <div className="card empty">
          <p>No hay marcos en el catálogo.</p>
          <Link to="/marcos/nuevo" className="btn btn--primary btn--inline">
            Agregar el primero
          </Link>
        </div>
      ) : (
        <div className="marcos-grid">
          {marcos.map((m) => (
            <article key={m.id} className="marco-card">
              <div className="marco-card__img">
                <img src={`${API_BASE}${m.ruta_imagen_png}`} alt={m.nombre_modelo} />
              </div>
              <div className="marco-card__body">
                <strong>{m.nombre_modelo}</strong>
                <span className="muted">{m.marca || '—'}</span>
                <span className="badge">{m.codigo}</span>
                {m.estilo_forma && <span className="tag">{m.estilo_forma}</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
