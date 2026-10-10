// =====================================================================
// Generador de código de barras Code128 (subset B) en SVG puro.
// Sin dependencias externas. Devuelve un string SVG escaneable con el
// valor codificado, apto para etiquetas de armazones/productos.
//
// Code128B cubre ASCII 32-126 (letras, números y símbolos comunes), que
// es más que suficiente para códigos internos y EAN alfanuméricos.
// =====================================================================

// Patrones de barras de Code128 (107 símbolos). Cada patrón son 6 valores
// (ancho de barras/espacios alternados, empezando por barra).
const PATRONES = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104; // Start Code B
const STOP = 106;

// Codifica un texto en Code128B y devuelve la secuencia de valores (con checksum).
function codificar(texto) {
  const valores = [START_B];
  let suma = START_B;
  for (let i = 0; i < texto.length; i += 1) {
    const code = texto.charCodeAt(i);
    // Code128B: ASCII 32..126 => valor 0..94
    const val = code - 32;
    if (val < 0 || val > 94) continue; // ignora caracteres fuera de rango
    valores.push(val);
    suma += val * (i + 1);
  }
  valores.push(suma % 103); // checksum
  valores.push(STOP);
  return valores;
}

// Genera el SVG del código de barras.
// opts: { alto=50, moduloAncho=2, mostrarTexto=true }
export function barcodeSVG(texto, opts = {}) {
  const alto = opts.alto || 50;
  const m = opts.moduloAncho || 2;
  const mostrarTexto = opts.mostrarTexto !== false;
  const valores = codificar(String(texto || ''));

  let x = 0;
  const rects = [];
  for (const v of valores) {
    const patron = PATRONES[v];
    if (!patron) continue;
    let esBarra = true; // empieza en barra
    for (const chStr of patron) {
      const ancho = Number(chStr) * m;
      if (esBarra) {
        rects.push(`<rect x="${x}" y="0" width="${ancho}" height="${alto}" fill="#000"/>`);
      }
      x += ancho;
      esBarra = !esBarra;
    }
  }

  const anchoTotal = x;
  const altoTotal = alto + (mostrarTexto ? 16 : 0);
  const texto1 = mostrarTexto
    ? `<text x="${anchoTotal / 2}" y="${alto + 13}" font-family="monospace" font-size="12" text-anchor="middle" fill="#000">${escapeXml(String(texto))}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${anchoTotal}" height="${altoTotal}" viewBox="0 0 ${anchoTotal} ${altoTotal}">${rects.join('')}${texto1}</svg>`;
}

function escapeXml(s) {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));
}
