// =====================================================================
// Intérprete local (sin IA, sin costo) de búsquedas en lenguaje natural para
// Stock. Ejemplo: "marcos de mujer en metal" -> genero Mujer, material Metal
// y texto de búsqueda vacío.
//
// - Género: lista cerrada con sinónimos y plurales (dama, caballero, niña…).
// - Material: cualquiera de los materiales conocidos (los cargados en la base
//   más los sugeridos), sin distinguir mayúsculas ni acentos, también en plural
//   ("metales", "acetatos"). Se prefiere la forma escrita en la base.
// - Palabras de relleno ("de", "en", "marcos", "armazones"…) se descartan.
// - Lo que queda va como texto de búsqueda.
// =====================================================================

export function normalizar(t) {
  return String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const SINONIMOS_GENERO = {
  Mujer: ['mujer', 'mujeres', 'dama', 'damas', 'femenino', 'femeninos', 'femenina', 'femeninas'],
  Hombre: ['hombre', 'hombres', 'caballero', 'caballeros', 'masculino', 'masculinos'],
  Unisex: ['unisex'],
  'Niño': ['nino', 'ninos', 'nina', 'ninas', 'infantil', 'infantiles'],
};
const GENERO_POR_PALABRA = new Map(
  Object.entries(SINONIMOS_GENERO).flatMap(([g, palabras]) => palabras.map((p) => [p, g]))
);

const RELLENO = new Set([
  'de', 'del', 'en', 'para', 'con', 'y', 'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'marco', 'marcos', 'armazon', 'armazones', 'anteojo', 'anteojos',
]);

// ¿La palabra escrita coincide con la del material (también en plural)?
function coincide(escrita, material) {
  return escrita === material || escrita === `${material}s` || escrita === `${material}es`;
}

// Devuelve { q, genero, material, detectado } donde detectado describe lo que
// se interpretó (para mostrarlo en pantalla). Si no detecta nada, q queda igual.
export function interpretarBusqueda(texto, { materiales = [] } = {}) {
  const original = String(texto ?? '').trim();
  const palabras = original.split(/\s+/).filter(Boolean);
  const norm = palabras.map(normalizar);
  const usada = palabras.map(() => false);
  let genero = null;
  let material = null;

  // Material: primero los de más palabras ("acero inoxidable" antes que "acero").
  const candidatos = [...new Set(materiales.filter(Boolean))]
    .map((m) => ({ valor: m, partes: normalizar(m).split(/\s+/).filter(Boolean) }))
    .filter((m) => m.partes.length)
    .sort((a, b) => b.partes.length - a.partes.length);
  for (const m of candidatos) {
    if (material) break;
    for (let i = 0; i + m.partes.length <= norm.length; i += 1) {
      const encaja = m.partes.every((p, k) => {
        const j = i + k;
        if (usada[j]) return false;
        // El plural solo se acepta en la última palabra del material.
        return k === m.partes.length - 1 ? coincide(norm[j], p) : norm[j] === p;
      });
      if (encaja) {
        material = m.valor;
        m.partes.forEach((_, k) => { usada[i + k] = true; });
        break;
      }
    }
  }

  // Género: la primera palabra reconocida; se descartan todas las de género.
  norm.forEach((p, i) => {
    if (usada[i]) return;
    const g = GENERO_POR_PALABRA.get(p);
    if (g) {
      if (!genero) genero = g;
      usada[i] = true;
    }
  });

  if (!genero && !material) return { q: original, genero: null, material: null, detectado: [] };

  const resto = palabras.filter((_, i) => !usada[i] && !RELLENO.has(norm[i]));
  const detectado = [];
  if (genero) detectado.push(`Género ${genero}`);
  if (material) detectado.push(`Material ${material}`);
  return { q: resto.join(' '), genero, material, detectado };
}
