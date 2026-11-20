// =====================================================================
// Funciones puras de los recordatorios de turnos (sin base de datos ni red,
// para poder probarlas solas):
//  - Cuándo se manda cada aviso según la anticipación elegida.
//  - Normalización de teléfonos argentinos al formato de WhatsApp.
//  - Armado del texto del mensaje.
// Los avisos salen a las 10:00 hora de Argentina (UTC-3, sin horario de verano).
// =====================================================================

const HORA_ENVIO = 10;      // hora local de Argentina
const OFFSET_ART = 3;       // Argentina = UTC-3

// Anticipaciones fijas. 'personalizado' usa dias_antes.
const ANTICIPACIONES = {
  '1_mes': { meses: 1, etiqueta: '1 mes antes' },
  '2_semanas': { dias: 14, etiqueta: '2 semanas antes' },
  '1_semana': { dias: 7, etiqueta: '1 semana antes' },
  '4_dias': { dias: 4, etiqueta: '4 días antes' },
};

const MENSAJE_BASE =
  'Hola {nombre}, te recordamos que el {fecha} tenés tu próximo control en {local}. '
  + 'Escribinos para reservar tu turno. ¡Te esperamos!';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// 'YYYY-MM-DD' real (rechaza 2026-02-31). Devuelve { y, m, d } o null.
function parsearFechaISO(texto) {
  const t = String(texto || '').trim();
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!r) return null;
  const y = Number(r[1]); const m = Number(r[2]); const d = Number(r[3]);
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return { y, m, d };
}

// Día calendario (YYYY-MM-DD) de un instante, en hora de Argentina.
function fechaISOArgentina(instante) {
  const t = instante instanceof Date ? instante : new Date(instante);
  return new Date(t.getTime() - OFFSET_ART * 3600 * 1000).toISOString().slice(0, 10);
}

// "2027-01-20" -> "20 de enero de 2027"
function fechaLarga(iso) {
  const f = parsearFechaISO(iso);
  if (!f) return String(iso || '');
  return `${f.d} de ${MESES[f.m - 1]} de ${f.y}`;
}

// Cuándo se manda el aviso: el día del control menos la anticipación, a las
// 10:00 de Argentina. "1 mes" resta un mes calendario (31/03 -> 28/02).
// Devuelve un Date (instante) o null si los datos no sirven.
function fechaProgramada(fechaEventoISO, tipo, diasPersonalizados) {
  const f = parsearFechaISO(fechaEventoISO);
  if (!f) return null;
  let base; // medianoche UTC del día del aviso
  if (tipo === 'personalizado') {
    const n = Number(diasPersonalizados);
    if (!Number.isInteger(n) || n < 1 || n > 365) return null;
    base = Date.UTC(f.y, f.m - 1, f.d) - n * 86400000;
  } else {
    const a = ANTICIPACIONES[tipo];
    if (!a) return null;
    if (a.meses) {
      const total = f.y * 12 + (f.m - 1) - a.meses;
      const ny = Math.floor(total / 12);
      const nm = total % 12;
      const ultimo = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
      base = Date.UTC(ny, nm, Math.min(f.d, ultimo));
    } else {
      base = Date.UTC(f.y, f.m - 1, f.d) - a.dias * 86400000;
    }
  }
  return new Date(base + (HORA_ENVIO + OFFSET_ART) * 3600 * 1000);
}

// Teléfono -> formato de WhatsApp (solo dígitos, con país). Argentina móvil:
// 549 + código de área + número, sin 0 ni 15. Devuelve null si no se puede.
//   "011 15 5555-1234" -> 5491155551234     "+54 9 11 5555 1234" -> 5491155551234
//   "11 5555 1234"     -> 5491155551234     "+1 305 555 1234"    -> 13055551234
function normalizarTelefono(crudo) {
  const original = String(crudo || '').trim();
  let d = original.replace(/\D/g, '');
  if (!d) return null;
  const conPais = original.startsWith('+') || d.startsWith('00');
  if (d.startsWith('00')) d = d.slice(2);

  // Ya trae el país Argentina (con o sin "+")
  if (d.startsWith('54') && (d.length === 12 || d.length === 13)) {
    if (d.length === 12 && d.startsWith('549')) return null; // "549" + 9 dígitos: número truncado
    if (d.length === 12) d = `549${d.slice(2)}`; // faltaba el 9 de móvil
    return d.length === 13 && d.startsWith('549') ? d : null;
  }
  // 54 es solo Argentina: si llegó acá es que le faltan o le sobran dígitos
  if (d.startsWith('54')) return null;
  // Otro país: solo si lo escribieron con "+" o "00"
  if (conPais) return d.length >= 10 && d.length <= 15 ? d : null;

  // Número local argentino
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) return d.startsWith('15') ? null : `549${d}`; // código de área + número
  if (d.length === 12) {
    // código de área (2 a 4 dígitos) + "15" + número: se quita el 15
    for (const pos of [2, 3, 4]) {
      if (d.slice(pos, pos + 2) === '15') {
        const sin = d.slice(0, pos) + d.slice(pos + 2);
        if (sin.length === 10) return `549${sin}`;
      }
    }
  }
  return null;
}

// Reemplaza {nombre}, {fecha} y {local} (sin distinguir mayúsculas).
function armarMensaje(plantilla, { nombre, fecha, local }) {
  const valores = { nombre: nombre || 'cliente', fecha: fecha || '', local: local || 'nuestra óptica' };
  return String(plantilla || MENSAJE_BASE).replace(/\{(nombre|fecha|local)\}/gi, (_, k) => valores[k.toLowerCase()]);
}

module.exports = {
  ANTICIPACIONES, MENSAJE_BASE, HORA_ENVIO,
  parsearFechaISO, fechaISOArgentina, fechaLarga, fechaProgramada, normalizarTelefono, armarMensaje,
};
