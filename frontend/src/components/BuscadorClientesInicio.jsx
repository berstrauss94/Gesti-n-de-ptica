// =====================================================================
// Búsqueda rápida de clientes para el Inicio (DashboardPage).
// Filtra en vivo por nombre o DNI con GET /api/usuarios?q= (la misma búsqueda
// de la página Clientes): arranca con 2 caracteres y espera 300 ms sin teclear.
// Si llega una respuesta vieja (se siguió escribiendo), se descarta.
// Clic o Enter sobre una fila abre la ficha del cliente.
// =====================================================================
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listarUsuarios } from '../api/usuarios';

const MINIMO = 2;
const ESPERA_MS = 300;
const LIMITE = 10;

export default function BuscadorClientesInicio() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');
  const ultima = useRef(0);

  const texto = q.trim();
  const activa = texto.length >= MINIMO;

  useEffect(() => {
    if (!activa) {
      ultima.current += 1; // invalida una búsqueda en curso
      setResultados([]); setBuscando(false); setError('');
      return undefined;
    }
    const id = ++ultima.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const data = await listarUsuarios({ q: texto, limit: LIMITE });
        if (id !== ultima.current) return;
        setResultados(data.usuarios || []);
        setError('');
      } catch (err) {
        if (id !== ultima.current) return;
        setResultados([]);
        setError(err.response?.data?.error || 'No se pudo buscar');
      } finally {
        if (id === ultima.current) setBuscando(false);
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [texto, activa]);

  function abrir(u) { navigate(`/clientes/${u.id}`); }

  return (
    <section className="card inicio-busqueda" aria-labelledby="inicio-busqueda-titulo">
      <div className="inicio-busqueda__cabecera">
        <h2 className="section-title" id="inicio-busqueda-titulo">Buscar cliente</h2>
        <Link to="/clientes/nuevo" className="btn btn--ghost btn--inline">+ Nuevo cliente</Link>
      </div>
      <form className="searchbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          placeholder="Nombre, apellido o DNI…"
          aria-label="Buscar cliente por nombre o DNI"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
      </form>

      {error && <p className="alert alert--error" role="alert">{error}</p>}
      {!activa && <p className="muted small">Escribí al menos {MINIMO} letras o números para buscar.</p>}
      {activa && buscando && resultados.length === 0 && <p className="muted small" role="status">Buscando…</p>}
      {activa && !buscando && !error && resultados.length === 0 && (
        <p className="muted small" role="status">
          No hay clientes con «{texto}». <Link to="/clientes/nuevo">Registralo</Link>.
        </p>
      )}

      {activa && resultados.length > 0 && (
        <div className="inicio-busqueda__tabla">
          <table className="table">
            <thead>
              <tr><th>Nombre</th><th>DNI</th><th>Obra social</th><th>Médico tratante</th><th aria-label="Acciones"></th></tr>
            </thead>
            <tbody>
              {resultados.map((u) => (
                <tr
                  key={u.id}
                  className="inicio-busqueda__fila"
                  tabIndex={0}
                  onClick={() => abrir(u)}
                  onKeyDown={(e) => { if (e.key === 'Enter') abrir(u); }}
                >
                  <td>{u.nombre_completo}</td>
                  <td>{u.dni}</td>
                  <td>{u.obra_social || '—'}</td>
                  <td>{u.medico_nombre ? `${u.medico_matricula ? `M.P. ${u.medico_matricula} ` : ''}${u.medico_nombre}` : '—'}</td>
                  <td className="inicio-busqueda__acciones">
                    <Link to={`/clientes/${u.id}`} onClick={(e) => e.stopPropagation()}>Ver ficha</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {activa && resultados.length === LIMITE && (
        <p className="muted small">Se muestran los primeros {LIMITE}. Escribí más para afinar, o buscá en <Link to="/clientes">Clientes</Link>.</p>
      )}
    </section>
  );
}
