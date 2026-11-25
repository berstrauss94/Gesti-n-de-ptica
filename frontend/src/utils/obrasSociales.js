// =====================================================================
// Utilidades de obras sociales.
// La ficha del cliente guarda la obra social por NOMBRE (usuarios.obra_social,
// texto) y el sobre la guarda por ID (sobres.obra_social_id). Para enlazarlas
// se compara el nombre normalizado: sin mayúsculas, sin acentos y sin el "*"
// final que trae la lista de la óptica ("OSDE *" == "osde").
// =====================================================================
export function normalizarObraSocial(nombre) {
  return String(nombre || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Busca en la lista la obra social cuyo nombre coincide con el texto guardado.
export function buscarObraSocialPorNombre(obrasSociales, nombre) {
  const clave = normalizarObraSocial(nombre);
  if (!clave) return null;
  return (obrasSociales || []).find((os) => normalizarObraSocial(os.nombre) === clave) || null;
}
