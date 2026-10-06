// =====================================================================
// Detalle de cliente: datos + fotos de seguimiento.
// Permite subir fotos faltantes (hasta completar 3) y eliminar cliente.
// =====================================================================

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  obtenerUsuario,
  listarFotos,
  subirFotos,
  eliminarUsuario,
} from '../api/usuarios';
import GraduacionesSeccion from '../components/GraduacionesSeccion';

const API_BASE = import.meta.env.VITE_API_URL || '';
const MAX_FOTOS = 3;

export default function ClienteDetallePage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cliente, setCliente] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [subiendo, setSubiendo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError('');
    try {
      const [c, f] = await Promise.all([obtenerUsuario(id), listarFotos(id)]);
      setCliente(c);
      setFotos(f);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el cliente');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function handleSubir(e) {
    const seleccionadas = Array.from(e.target.files);
    if (seleccionadas.length === 0) return;
    setSubiendo(true);
    setError('');
    try {
      await subirFotos(id, seleccionadas.slice(0, MAX_FOTOS - fotos.length));
      await cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron subir las fotos');
    } finally {
      setSubiendo(false);
    }
  }

  async function handleEliminar() {
    if (!window.confirm('¿Eliminar este cliente y todo su historial?')) return;
    try {
      await eliminarUsuario(id);
      navigate('/clientes', { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo eliminar el cliente');
    }
  }

  if (cargando) return <p className="muted">Cargando…</p>;
  if (error && !cliente) return <p className="alert alert--error">{error}</p>;
  if (!cliente) return null;

  const fotosFaltantes = MAX_FOTOS - fotos.length;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <Link to="/clientes" className="back-link">← Clientes</Link>
          <h1>{cliente.nombre_completo}</h1>
        </div>
        <button type="button" className="btn btn--danger" onClick={handleEliminar}>
          Eliminar
        </button>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      <div className="card">
        <dl className="datos">
          <div><dt>DNI</dt><dd>{cliente.dni}</dd></div>
          <div><dt>Obra social</dt><dd>{cliente.obra_social || '—'}</dd></div>
          <div><dt>Edad</dt><dd>{cliente.edad ?? '—'}</dd></div>
        </dl>
      </div>

      <div className="card">
        <div className="page-header">
          <h2>Fotos de seguimiento ({fotos.length}/{MAX_FOTOS})</h2>
        </div>

        <div className="fotos-grid">
          {fotos.map((foto) => (
            <figure key={foto.id} className="foto-item">
              <img src={`${API_BASE}${foto.ruta_local}`} alt={`Foto ${foto.orden_foto}`} />
              <figcaption>Foto {foto.orden_foto}</figcaption>
            </figure>
          ))}
          {fotos.length === 0 && <p className="muted">Sin fotos cargadas.</p>}
        </div>

        {fotosFaltantes > 0 && (
          <label className="field field--full upload-slot">
            <span>Agregar fotos (faltan {fotosFaltantes})</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleSubir}
              disabled={subiendo}
            />
            {subiendo && <small className="muted">Subiendo…</small>}
          </label>
        )}
      </div>

      <GraduacionesSeccion usuarioId={id} />
    </div>
  );
}
