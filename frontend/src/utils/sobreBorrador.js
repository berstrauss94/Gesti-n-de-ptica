// =====================================================================
// Borradores del Sobre en localStorage (funciones puras, sin React).
// Un borrador por sobre: "nuevo" para el alta y el id para cada sobre guardado,
// así el borrador de un sobre nunca aparece en otro.
//   <PREFIJO><id>            borrador vivo (se escribe en cada cambio)
//   <PREFIJO><id>:respaldo   copia para "Recuperar" (lo que se limpió o un
//                            borrador viejo que no se pudo aplicar solo)
// Formato: { v, datos: { form, items, pagos }, guardadoEn, version, sucursalId, numero }
//   version = updated_at del sobre cuando se empezó el borrador: si el sobre
//   cambió en el servidor después, el borrador NO se aplica solo.
// Todas reciben `storage` (window.localStorage en la app, un doble en las pruebas)
// y nunca tiran: si el navegador bloquea el almacenamiento, devuelven false/null.
// =====================================================================
export const PREFIJO_BORRADOR = 'optica_sobre_borrador_v1:';
const SUFIJO_RESPALDO = ':respaldo';
const VERSION_FORMATO = 1;

export function claveBorrador(sobreId) {
  return PREFIJO_BORRADOR + (sobreId || 'nuevo');
}
function claveRespaldo(sobreId) {
  return claveBorrador(sobreId) + SUFIJO_RESPALDO;
}

function valido(b) {
  return b && b.v === VERSION_FORMATO && b.datos && typeof b.datos.form === 'object'
    && Array.isArray(b.datos.items) && Array.isArray(b.datos.pagos);
}
function leer(storage, clave) {
  try {
    const crudo = storage?.getItem(clave);
    if (!crudo) return null;
    const b = JSON.parse(crudo);
    return valido(b) ? b : null;
  } catch {
    return null;
  }
}
function escribir(storage, clave, valor) {
  try {
    storage.setItem(clave, JSON.stringify(valor));
    return true;
  } catch {
    return false;
  }
}
function quitar(storage, clave) {
  try { storage?.removeItem(clave); } catch { /* almacenamiento bloqueado */ }
}

// ¿Los datos son iguales? (mismo orden de armado -> JSON comparable)
export function mismosDatos(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function leerBorrador(storage, sobreId) { return leer(storage, claveBorrador(sobreId)); }
export function leerRespaldo(storage, sobreId) { return leer(storage, claveRespaldo(sobreId)); }

// Arma el registro que se guarda (borrador o respaldo).
export function armarBorrador(datos, meta = {}) {
  return {
    v: VERSION_FORMATO,
    datos,
    guardadoEn: new Date().toISOString(),
    version: meta.version ?? null,
    sucursalId: meta.sucursalId ?? null,
    numero: meta.numero ?? null,
  };
}

export function guardarBorrador(storage, sobreId, datos, meta = {}) {
  return escribir(storage, claveBorrador(sobreId), armarBorrador(datos, meta));
}

// Guarda una copia para "Recuperar" (pisa la anterior).
export function guardarRespaldo(storage, sobreId, borrador) {
  return borrador ? escribir(storage, claveRespaldo(sobreId), borrador) : false;
}

export function borrarBorrador(storage, sobreId) { quitar(storage, claveBorrador(sobreId)); }
export function borrarRespaldo(storage, sobreId) { quitar(storage, claveRespaldo(sobreId)); }
export function borrarTodo(storage, sobreId) {
  borrarBorrador(storage, sobreId);
  borrarRespaldo(storage, sobreId);
}

// Completa un borrador con los campos que falten (por si una versión nueva del
// formulario agregó campos): base primero, borrador encima.
export function combinar(base, datos) {
  return {
    form: { ...base.form, ...(datos?.form || {}) },
    items: Array.isArray(datos?.items) ? datos.items : base.items,
    pagos: Array.isArray(datos?.pagos) ? datos.pagos : base.pagos,
  };
}

// Decide con qué arranca la consola. Devuelve { datos, restaurado, respaldo, motivo }
//   restaurado: el borrador que se aplicó solo (o null).
//   respaldo:   copia disponible para "Recuperar". Si había un borrador que NO
//               se puede aplicar solo (el sobre cambió en el servidor después,
//               o es un alta de otra sucursal), pasa a respaldo: no se pierde.
//   motivo:     'version' | 'sucursal' cuando el borrador pasó a respaldo.
export function iniciarBorrador(storage, { sobreId, base, version, sucursalId }) {
  const b = leerBorrador(storage, sobreId);
  if (!b) return { datos: base, restaurado: null, respaldo: leerRespaldo(storage, sobreId), motivo: null };
  const mismaVersion = sobreId ? (b.version ?? null) === (version ?? null) : true;
  const mismaSucursal = sobreId ? true : !b.sucursalId || !sucursalId || b.sucursalId === sucursalId;
  if (mismaVersion && mismaSucursal) {
    return { datos: combinar(base, b.datos), restaurado: b, respaldo: leerRespaldo(storage, sobreId), motivo: null };
  }
  guardarRespaldo(storage, sobreId, b);
  borrarBorrador(storage, sobreId);
  return { datos: base, restaurado: null, respaldo: b, motivo: mismaVersion ? 'sucursal' : 'version' };
}

// Borradores vivos (para el aviso de la página de Sobres). Más nuevos primero.
export function listarBorradores(storage) {
  const out = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i);
      if (!k || !k.startsWith(PREFIJO_BORRADOR) || k.endsWith(SUFIJO_RESPALDO)) continue;
      const b = leer(storage, k);
      if (!b) continue;
      const id = k.slice(PREFIJO_BORRADOR.length);
      out.push({ sobreId: id === 'nuevo' ? null : id, ...b });
    }
  } catch { /* almacenamiento bloqueado */ }
  return out.sort((a, b) => String(b.guardadoEn).localeCompare(String(a.guardadoEn)));
}

// "25/11 14:32" para los avisos.
export function horaBorrador(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
