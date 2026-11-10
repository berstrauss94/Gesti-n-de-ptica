// =====================================================================
// Catálogo de Mercado: modelos que NO están en el local, enriquecidos con
// IA (marca + modelo -> specs técnicas). Listado con buscador y filtros
// (estilo, material, género y aptitud para graduación). El alta/enriquecido
// con IA es solo para admin.
//
// La visualización (MercadoTabla) y el alta por IA (MercadoFormIA) son
// componentes compartidos con la sección "En el mercado" de Prueba Virtual.
// =====================================================================

import { useEffect, useMemo, useState, useCallback } from 'react';
import { listarMercado } from '../api/mercado';
import InfoBtn from '../components/InfoBtn';
import MercadoTabla from '../components/MercadoTabla';
import MercadoFormIA from '../components/MercadoFormIA';
import { useEsAdmin } from '../hooks/useEsAdmin';

export default function MercadoPage() {
  const esAdmin = useEsAdmin();

  const [catalogo, setCatalogo] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  // Buscador (texto libre contra la API) y filtros en memoria.
  const [q, setQ] = useState('');
  const [fEstilo, setFEstilo] = useState('');
  const [fMaterial, setFMaterial] = useState('');
  const [fGenero, setFGenero] = useState('');
  const [fGraduacion, setFGraduacion] = useState(''); // ''|si|no

  const cargar = useCallback(async (busqueda) => {
    setCargando(true);
    setError('');
    try {
      const data = await listarMercado(busqueda || undefined);
      setCatalogo(data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el catálogo de mercado');
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

  // Un modelo recién consultado (o devuelto por la caché) va al tope, sin duplicar.
  function handleAgregado(reg) {
    setCatalogo((prev) => [reg, ...prev.filter((m) => m.id !== reg.id)]);
  }

  // Opciones de filtro derivadas del catálogo cargado (sin valores vacíos).
  const opciones = useMemo(() => {
    const estilos = new Set();
    const materiales = new Set();
    const generos = new Set();
    catalogo.forEach((m) => {
      if (m.estilo) estilos.add(m.estilo);
      if (m.material) materiales.add(m.material);
      if (m.genero) generos.add(m.genero);
    });
    const ord = (s) => [...s].sort((a, b) => a.localeCompare(b));
    return { estilos: ord(estilos), materiales: ord(materiales), generos: ord(generos) };
  }, [catalogo]);

  // Aplica los filtros en memoria sobre lo ya traído de la API.
  const filtrado = useMemo(() => {
    return catalogo.filter((m) => {
      if (fEstilo && m.estilo !== fEstilo) return false;
      if (fMaterial && m.material !== fMaterial) return false;
      if (fGenero && m.genero !== fGenero) return false;
      if (fGraduacion === 'si' && !m.aptitud_graduacion) return false;
      if (fGraduacion === 'no' && m.aptitud_graduacion) return false;
      return true;
    });
  }, [catalogo, fEstilo, fMaterial, fGenero, fGraduacion]);

  const hayFiltros = fEstilo || fMaterial || fGenero || fGraduacion;

  function limpiarFiltros() {
    setFEstilo('');
    setFMaterial('');
    setFGenero('');
    setFGraduacion('');
  }

  return (
    <div className="stack">
      <div className="page-header">
        <h1>
          Catálogo de mercado
          <InfoBtn
            paraQue="Reúne modelos de marcas y lentes que NO tenés en el local, con sus especificaciones técnicas para consultarle al proveedor."
            comoFunciona="Buscá por marca o modelo, filtrá por estilo, material o género, y si sos admin agregá modelos nuevos que la IA enriquece con sus medidas."
            conQueFin="Saber qué podés ofrecer y pedir aunque no esté en stock, para no perder una venta cuando al cliente le interesa un modelo puntual."
          />
        </h1>
      </div>

      {error && <p className="alert alert--error" role="alert">{error}</p>}

      {/* Alta por IA (solo admin): trae specs de un modelo nuevo */}
      {esAdmin && <MercadoFormIA onAgregado={handleAgregado} />}

      {/* Buscador (API) + filtros (en memoria) */}
      <form className="searchbar" onSubmit={handleBuscar}>
        <input
          type="search"
          placeholder="Buscar por marca o modelo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={fEstilo} onChange={(e) => setFEstilo(e.target.value)}>
          <option value="">Todos los estilos</option>
          {opciones.estilos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
          <option value="">Todos los materiales</option>
          {opciones.materiales.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fGenero} onChange={(e) => setFGenero(e.target.value)}>
          <option value="">Todos los géneros</option>
          {opciones.generos.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={fGraduacion} onChange={(e) => setFGraduacion(e.target.value)}>
          <option value="">Graduación: todas</option>
          <option value="si">Apto graduación</option>
          <option value="no">No apto</option>
        </select>
        <button type="submit" className="btn btn--ghost">Buscar</button>
        {hayFiltros && (
          <button type="button" className="btn btn--ghost" onClick={limpiarFiltros}>
            Limpiar filtros
          </button>
        )}
      </form>

      {cargando ? (
        <p className="muted">Cargando…</p>
      ) : filtrado.length === 0 ? (
        <div className="card empty">
          <p>
            {catalogo.length === 0
              ? 'Todavía no hay modelos en el catálogo de mercado.'
              : 'Ningún modelo coincide con la búsqueda o los filtros.'}
          </p>
        </div>
      ) : (
        <MercadoTabla items={filtrado} />
      )}
    </div>
  );
}
