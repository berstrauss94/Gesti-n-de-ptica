// =====================================================================
// Utilidades ópticas para la receta del Sobre (funciones puras, sin React).
//
// - transponer: pasa una fórmula de cilindro negativo a positivo (o al revés).
//     ESF' = ESF + CIL ; CIL' = -CIL ; EJE' = EJE ± 90 (rango 1..180, nunca 0)
// - calcularCerca: arma la receta de cerca desde la de lejos + adición.
//     ESF cerca = ESF lejos + ADD ; CIL y EJE se copian de lejos.
//
// Los valores llegan como texto del formulario ("+1,25", "-0.75", "") y
// salen formateados como en la receta: con signo y 2 decimales ("+1.25").
// =====================================================================

// Convierte el texto del formulario en número. Acepta coma decimal.
// Devuelve null si está vacío o no es un número.
export function aNumero(valor) {
  if (valor === null || valor === undefined) return null;
  const t = String(valor).trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Dioptrías con signo y 2 decimales: 1.25 -> "+1.25", -0.5 -> "-0.50", 0 -> "0.00".
export function formatearDioptria(n) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  const redondo = Math.round(n * 100) / 100;
  if (redondo === 0) return '0.00';
  return `${redondo > 0 ? '+' : ''}${redondo.toFixed(2)}`;
}

// Eje rotado 90°, siempre en 1..180 (en óptica se escribe 180, no 0).
export function rotarEje(eje) {
  const e = aNumero(eje);
  if (e === null) return null;
  const base = Math.round(e) % 180 === 0 ? 180 : Math.round(e) % 180; // 0 y 180 -> 180
  const rotado = base > 90 ? base - 90 : base + 90;
  return rotado === 0 ? 180 : rotado;
}

// Transpone { esf, cil, eje }. Si no hay cilindro, no hay nada que transponer:
// devuelve null para que la UI avise en lugar de inventar valores.
export function transponer({ esf, cil, eje }) {
  const c = aNumero(cil);
  if (c === null || c === 0) return null;
  const e = aNumero(esf) ?? 0;
  const ejeNuevo = rotarEje(eje);
  return {
    esf: formatearDioptria(e + c),
    cil: formatearDioptria(-c),
    eje: ejeNuevo === null ? '' : String(ejeNuevo),
  };
}

// Receta de cerca desde lejos + adición. Devuelve null si falta la adición.
export function calcularCerca({ esf, cil, eje, add }) {
  const a = aNumero(add);
  if (a === null || a === 0) return null;
  const e = aNumero(esf) ?? 0;
  return {
    esf: formatearDioptria(e + a),
    cil: aNumero(cil) === null ? '' : formatearDioptria(aNumero(cil)),
    eje: aNumero(eje) === null ? '' : String(Math.round(aNumero(eje))),
  };
}
