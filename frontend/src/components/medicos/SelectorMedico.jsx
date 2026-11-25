// =====================================================================
// Selector de médico con buscador (combobox).
// Al escribir filtra en vivo por nombre o por matrícula (M.P.), sin
// distinguir mayúsculas ni acentos. Se maneja con el teclado (flechas,
// Enter, Escape) y se cierra al hacer clic afuera. El botón verde "+"
// abre el alta rápida (lo resuelve el padre con onNuevo).
//
// Props:
//   medicos      lista [{ id, nombre, matricula, especialidad, activo }]
//   value        id elegido ('' = sin médico)
//   onChange(id)
//   onNuevo()    opcional: muestra el botón "+" para dar de alta uno nuevo
//   id           id del input (para el <label htmlFor>)
// =====================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ChevronDown } from 'lucide-react';

const sinAcentos = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// "M.P. 7966 Velardez Camila" (o solo el nombre si no tiene matrícula).
export function etiquetaMedico(m) {
  if (!m) return '';
  return m.matricula ? `M.P. ${m.matricula} ${m.nombre}` : m.nombre;
}

export default function SelectorMedico({ medicos, value, onChange, onNuevo, id }) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [resaltado, setResaltado] = useState(0);
  const caja = useRef(null);
  const lista = useRef(null);

  const elegido = medicos.find((m) => m.id === value);
  const opciones = useMemo(() => {
    const t = sinAcentos(q.trim());
    const activos = medicos.filter((m) => m.activo !== false || m.id === value);
    const filtrados = t
      ? activos.filter((m) => sinAcentos(m.nombre).includes(t) || sinAcentos(m.matricula).includes(t))
      : activos;
    return [{ id: '', nombre: 'Sin médico' }, ...filtrados];
  }, [medicos, q, value]);

  // Cerrar al hacer clic afuera.
  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) { setAbierto(false); setQ(''); } };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  // Mantener visible la opción resaltada.
  useEffect(() => {
    if (!abierto || !lista.current) return;
    lista.current.children[resaltado]?.scrollIntoView({ block: 'nearest' });
  }, [resaltado, abierto]);

  function elegir(m) {
    onChange(m.id);
    setAbierto(false);
    setQ('');
  }

  function alTecla(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAbierto(true); setResaltado((i) => Math.min(i + 1, opciones.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setResaltado((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { if (abierto) { e.preventDefault(); if (opciones[resaltado]) elegir(opciones[resaltado]); } }
    else if (e.key === 'Escape') { setAbierto(false); setQ(''); }
  }

  return (
    <div className="medico-sel" ref={caja}>
      <div className="medico-sel__control">
        <input
          id={id}
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder={elegido ? etiquetaMedico(elegido) : 'Seleccioná o escribí nombre / M.P.'}
          value={abierto ? q : etiquetaMedico(elegido)}
          onFocus={() => { setAbierto(true); setQ(''); setResaltado(0); }}
          onChange={(e) => { setQ(e.target.value); setAbierto(true); setResaltado(e.target.value ? 1 : 0); }}
          onKeyDown={alTecla}
        />
        <ChevronDown size={14} className="medico-sel__flecha" aria-hidden="true" />
        {onNuevo && (
          <button type="button" className="medico-sel__nuevo" onClick={onNuevo} title="Nuevo médico" aria-label="Nuevo médico">
            <Plus size={16} />
          </button>
        )}
      </div>
      {abierto && (
        <ul className="medico-sel__lista" role="listbox" ref={lista}>
          {opciones.map((m, i) => (
            <li
              key={m.id || 'ninguno'}
              role="option"
              aria-selected={m.id === value}
              className={[
                'medico-sel__opcion',
                i === resaltado ? 'is-resaltada' : '',
                m.id === value ? 'is-elegida' : '',
                m.id === '' ? 'medico-sel__opcion--ninguno' : '',
              ].join(' ')}
              onMouseDown={(e) => { e.preventDefault(); elegir(m); }}
              onMouseEnter={() => setResaltado(i)}
            >
              {m.id ? etiquetaMedico(m) : m.nombre}
              {m.especialidad && <span className="medico-sel__esp">{m.especialidad}</span>}
            </li>
          ))}
          {opciones.length === 1 && q && (
            <li className="medico-sel__vacio">
              Sin resultados para “{q}”.{onNuevo && ' Usá el botón + para darlo de alta.'}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
