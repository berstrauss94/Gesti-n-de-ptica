// =====================================================================
// Listado de clientes con búsqueda. Enlaza a alta y detalle.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { listarUsuarios } from '../api/usuarios';

export default function ClientesPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const cargar = useCallback(async (busqueda) => {
    setCargando(true);
    setError('');
    try {
      const data = await listarUsuarios({ q: busqueda });
      setUsuarios(data.usuarios);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los clientes');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar('');
  }, [cargar]);

  function handleBuscar(e) {
    e.preventDefault();
    cargar(q);
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>Clientes</h1>
        <Link to="/clientes/nuevo" className="btn btn--primary btn--inline">
          + Nuevo cliente
        </Link>
      </div>

      <form className="searchbar" onSubmit={handleBuscar}>
        <input
          type="search"
          placeholder="Buscar por nombre o DNI…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn--ghost">Buscar</button>
      </form>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : usuarios.length === 0 ? (
        <div className="card empty">
          <p>No hay clientes todavía.</p>
          <Link to="/clientes/nuevo" className="btn btn--primary btn--inline">
            Registrar el primero
          </Link>
        </div>
      ) : (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>DNI</th>
                <th>Obra social</th>
                <th>Edad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => (
                <tr key={u.id}>
                  <td>{u.nombre_completo}</td>
                  <td>{u.dni}</td>
                  <td>{u.obra_social || '—'}</td>
                  <td>{u.edad ?? '—'}</td>
                  <td className="col-action">
                    <Link to={`/clientes/${u.id}`}>Ver</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
