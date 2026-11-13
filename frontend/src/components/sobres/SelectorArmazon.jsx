// =====================================================================
// Selector de armazón del Sobre (lejos o cerca).
// Dos modos:
//   - "Armazón del cliente": el paciente trae el suyo (es_propio = true).
//   - "Buscar en stock": abre un modal y busca armazones de la sucursal.
//
// Props:
//   titulo        texto del bloque ("Armazón lejos" / "Armazón cerca")
//   sucursalId    sucursal donde buscar stock
//   esPropio      boolean
//   productoId    id del producto elegido (o '')
//   productoNombre nombre a mostrar del elegido
//   onChange({ esPropio, productoId, productoNombre })
// =====================================================================

import { useState } from 'react';
import Modal from '../Modal';
import { listarStock } from '../../api/stock';

export default function SelectorArmazon({
  titulo, sucursalId, esPropio, productoId, productoNombre, onChange,
}) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState('');

  async function buscar(e) {
    e?.preventDefault();
    if (!sucursalId) { setError('Elegí una sucursal primero.'); return; }
    setBuscando(true); setError('');
    try {
      const data = await listarStock({ sucursal_id: sucursalId, q: q.trim() || undefined, categoria: 'armazon', limit: 50 });
      setResultados(data.stock || []);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo buscar en el stock');
    } finally {
      setBuscando(false);
    }
  }

  function abrir() {
    setAbierto(true);
    setResultados([]);
    setQ('');
    buscar();
  }

  function elegir(s) {
    onChange({ esPropio: false, productoId: s.producto_id, productoNombre: `${s.codigo} · ${s.nombre}` });
    setAbierto(false);
  }

  return (
    <div className="armazon-selector">
      <span className="armazon-selector__titulo">{titulo}</span>
      <div className="armazon-selector__modos" role="radiogroup" aria-label={titulo}>
        <label className="field--check">
          <input
            type="radio"
            checked={esPropio}
            onChange={() => onChange({ esPropio: true, productoId: '', productoNombre: '' })}
          />
          <span>Armazón del cliente</span>
        </label>
        <label className="field--check">
          <input
            type="radio"
            checked={!esPropio}
            onChange={() => onChange({ esPropio: false, productoId, productoNombre })}
          />
          <span>Del stock</span>
        </label>
      </div>

      {!esPropio && (
        <div className="armazon-selector__elegido">
          <span className={productoId ? '' : 'muted'}>{productoId ? productoNombre : 'Sin armazón elegido'}</span>
          <button type="button" className="btn-mini btn-mini--wide" onClick={abrir}>Buscar en stock</button>
          {productoId && (
            <button
              type="button"
              className="btn-mini btn-mini--wide"
              onClick={() => onChange({ esPropio: false, productoId: '', productoNombre: '' })}
            >
              Quitar
            </button>
          )}
        </div>
      )}

      {abierto && (
        <Modal titulo={`${titulo} · buscar en stock`} onCerrar={() => setAbierto(false)}>
          {/* div y no <form>: este modal se renderiza dentro del formulario del
              sobre, y un form anidado haría que Enter guarde el sobre. */}
          <div className="searchbar" role="search">
            <input
              type="search"
              placeholder="Código, nombre o código de barras…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscar(); } }}
              autoFocus
            />
            <button type="button" className="btn btn--ghost" onClick={() => buscar()} disabled={buscando}>
              {buscando ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          {error && <p className="alert alert--error" role="alert">{error}</p>}
          {!buscando && resultados.length === 0 ? (
            <p className="muted small">No hay armazones que coincidan en esta sucursal.</p>
          ) : (
            <table className="data-table">
              <thead><tr><th>Código</th><th>Armazón</th><th>Marca</th><th>Stock</th><th>Precio</th><th></th></tr></thead>
              <tbody>
                {resultados.map((s) => (
                  <tr key={s.id}>
                    <td>{s.codigo}</td>
                    <td>{s.nombre}</td>
                    <td>{s.marca || '—'}</td>
                    <td>{s.cantidad}</td>
                    <td>$ {Number(s.precio_venta).toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-mini btn-mini--wide"
                        onClick={() => elegir(s)}
                        disabled={s.cantidad <= 0}
                        title={s.cantidad <= 0 ? 'Sin stock en esta sucursal' : 'Elegir este armazón'}
                      >
                        Elegir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </div>
  );
}
