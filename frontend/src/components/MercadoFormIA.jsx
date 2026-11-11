// =====================================================================
// Formulario reutilizable para buscar/agregar un modelo al Catálogo de
// Mercado. Lo usan MercadoPage y TryOnPage.
//
// Se puede completar la marca, el modelo o ambos, y alcanza con texto
// parcial (ej: "Ray-", "Hexa"). El backend primero busca en lo ya guardado
// y solo consulta a la IA (Gemini) si no hay coincidencia, así no gasta cuota.
//
// Props:
//   onAgregado(registro): se llama con el registro guardado (o el de caché)
//   Solo se muestra a admin (el endpoint es admin-only); el padre decide.
// =====================================================================

import { useState } from 'react';
import { enriquecerMercado } from '../api/mercado';

const MIN_TERMINO = 2;

// Mensaje según de dónde salió el resultado (lo informa el backend).
function mensajeExito(cache, coincidencia, registro) {
  const nombre = `${registro.marca} ${registro.modelo}`;
  if (!cache) return `✓ Modelo encontrado con IA y agregado: ${nombre}.`;
  if (coincidencia === 'exacto') return `✓ ${nombre} ya estaba en el catálogo: se mostró lo guardado, sin consultar a la IA.`;
  if (coincidencia === 'similar') return `✓ Te mostré el más parecido que ya estaba guardado: ${nombre}.`;
  return `✓ Coincidencia en el catálogo: ${nombre} (sin consultar a la IA).`;
}

export default function MercadoFormIA({ onAgregado }) {
  const [busca, setBusca] = useState({ marca: '', modelo: '' });
  const [buscando, setBuscando] = useState(false);
  const [msg, setMsg] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    const marca = busca.marca.trim();
    const modelo = busca.modelo.trim();
    if (marca.length < MIN_TERMINO && modelo.length < MIN_TERMINO) {
      setMsg(`Completá la marca, el modelo o ambos (mínimo ${MIN_TERMINO} letras).`);
      return;
    }
    setMsg('');
    setBuscando(true);
    try {
      const { registro, cache, coincidencia } = await enriquecerMercado(marca, modelo);
      onAgregado?.(registro);
      setMsg(mensajeExito(cache, coincidencia, registro));
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
          placeholder="Marca (ej: Ray-Ban, o solo “Ray-”)"
          maxLength={120}
          value={busca.marca}
          onChange={(e) => setBusca((b) => ({ ...b, marca: e.target.value }))}
        />
        <input
          type="search"
          placeholder="Modelo (ej: Aviator RB3025, o solo “Hexa”)"
          maxLength={120}
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
