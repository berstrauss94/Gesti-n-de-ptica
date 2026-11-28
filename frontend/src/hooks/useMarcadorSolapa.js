// =====================================================================
// Marcador que se desliza hasta la solapa activa (estilo de "Lentes y otros").
// Mide la solapa activa dentro de `ref` (offsetLeft/Top/Width/Height) y devuelve
// el estilo para un <span> posicionado en absoluto dentro de la barra de solapas.
// La primera medida se ubica sin animación; desde ahí se desliza (clase is-listo,
// transición de 0.6s con la curva estándar, definida en styles.css).
// Se vuelve a medir al cambiar `deps`, al cambiar el tamaño de la barra
// (ResizeObserver) y al cambiar el tamaño de la ventana.
//
// Uso:
//   const barra = useRef(null);
//   const m = useMarcadorSolapa(barra, '.tab.is-active', [tab]);
//   <div className="tabs" ref={barra}>
//     <span className={m.clase} aria-hidden="true" style={m.style} /> ...
// =====================================================================
import { useLayoutEffect, useState } from 'react';

export function useMarcadorSolapa(ref, selectorActiva, deps, claseBase = 'tabs__marcador') {
  const [caja, setCaja] = useState(null); // { x, y, w, h } | null
  const [listo, setListo] = useState(false);

  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return undefined;
    function medir() {
      const act = nav.querySelector(selectorActiva);
      setCaja(act ? { x: act.offsetLeft, y: act.offsetTop, w: act.offsetWidth, h: act.offsetHeight } : null);
    }
    medir();
    const t = setTimeout(() => setListo(true), 50);
    const obs = typeof ResizeObserver === 'function' ? new ResizeObserver(medir) : null;
    obs?.observe(nav);
    window.addEventListener('resize', medir);
    return () => { clearTimeout(t); obs?.disconnect(); window.removeEventListener('resize', medir); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return {
    clase: listo ? `${claseBase} is-listo` : claseBase,
    style: caja
      ? { transform: `translate(${caja.x}px, ${caja.y}px)`, width: caja.w, height: caja.h, opacity: 1 }
      : { opacity: 0 },
  };
}
