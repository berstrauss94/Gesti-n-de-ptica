// =====================================================================
// Formulario reutilizable para agregar un modelo al Catálogo de Mercado
// con IA (marca + modelo -> specs). Lo usan MercadoPage y TryOnPage.
// El backend cachea: si el modelo ya existe no gasta cuota de Gemini.
//
// Props:
//   onAgregado(registro): se llama con el registro guardado (o el de caché)
//   Solo se muestra a admin (el endpoint es admin-only); el padre decide.
// =====================================================================

import { useState } from 'react';
import { enriquecerMercado } from '../api/mercado';

export default function MercadoFormIA({ onAgregado }) {
  const [busca, setBusca] = useState({ marca: '', modelo: '' });
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!busca.marca.trim() || !busca.modelo.trim()) {
      setMsg('Completá marca y modelo.');
      return;
    }
    setMsg('');
    setBuscando(true);
    try {
      const { registro, cache } = await enriquecerMercado(busca.marca.trim(), busca.modelo.trim());
      onAgregado?.(registro);
      setMsg(
        cache
          ? '✓ Ese modelo ya estaba en el catálogo: se mostró lo guardado, sin consultar a la IA.'
          : '✓ Modelo encontrado y agregado al catálogo de mercado.'
      );
      setBusca({ marca: '', modelo: '' });
    } catch (err) {
      const d = err.response?.data || {};
      const detalle = d.detalle ? ` (${d.detalle})` : '';
      setMsg(`${d.error || 'No se pudo consultar el modelo'}${detalle}`);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <>
      <form className="searchbar" onSubmit={handleSubmit}>
        <input
          type="search"
          placeholder="Marca (ej: Ray-Ban)"
          value={busca.marca}
          onChange={(e) => setBusca((b) => ({ ...b, marca: e.target.value }))}
        />
        <input
          type="search"
          placeholder="Modelo (ej: Aviator RB3025)"
          value={busca.modelo}
          onChange={(e) => setBusca((b) => ({ ...b, modelo: e.target.value }))}
        />
        <button type="submit" className="btn btn--primary" disabled={buscando}>
          {buscando ? 'Buscando…' : '✨ Buscar en el mercado'}
        </button>
      </form>
      {msg && (
        <p className={`small ${msg.startsWith('✓') ? 'ok-text' : 'alert alert--error'}`} role="status">
          {msg}
        </p>
      )}
    </>
  );
}
