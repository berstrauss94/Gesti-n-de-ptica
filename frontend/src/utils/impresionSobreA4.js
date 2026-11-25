// =====================================================================
// Impresión del Sobre en hoja A4.
// htmlSobreA4(datos) arma un documento HTML completo (función pura, probada en
// backend/test/impresionSobreA4.test.mjs); imprimirSobreA4(datos) lo abre en una
// ventana aparte y lanza el diálogo de impresión (mismo patrón que LentesPage).
// Imprime lo que está en pantalla: si el sobre tiene cambios sin guardar, la hoja
// lleva la marca "BORRADOR — SIN GUARDAR".
//
// datos = {
//   numero, borrador, sucursal, estado,
//   paciente: { nombre, dni }, medico: { nombre, matricula }, obraSocial, laboratorio,
//   armazonLejos, armazonCerca,          // texto ya armado
//   form, items, pagos, totales,         // estado de la consola + calcularTotales()
//   colsLejos, colsCerca, cotas,         // [[campo, etiqueta], ...] de la consola
// }
// Todo texto del usuario se escapa: el documento no ejecuta nada de lo cargado.
// =====================================================================
import { pesos } from './sobreTotales.js';

export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "2026-11-25" -> "25/11/2026"; vacío -> "—"
export function fechaAR(v) {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (v ? esc(v) : '—');
}

const val = (v) => (v === undefined || v === null || String(v).trim() === '' ? '' : esc(v));
const conGuion = (v) => val(v) || '—';

function tablaReceta(titulo, seccion, cols, form) {
  const filas = ['od', 'oi'].map((ojo) => `
      <tr><th>${ojo.toUpperCase()}</th>${cols.map(([c]) => `<td>${val(form[`${seccion}_${ojo}_${c}`])}</td>`).join('')}</tr>`).join('');
  return `
    <section class="bloque">
      <h2>${esc(titulo)}</h2>
      <table class="receta">
        <thead><tr><th></th>${cols.map(([, e]) => `<th>${esc(e)}</th>`).join('')}</tr></thead>
        <tbody>${filas}</tbody>
      </table>
    </section>`;
}

// valorHtml ya viene escapado.
function par(etiqueta, valorHtml) {
  return `<div class="par"><span>${esc(etiqueta)}</span><strong>${valorHtml}</strong></div>`;
}

export function htmlSobreA4(d) {
  const f = d.form || {};
  const t = d.totales || {};
  const items = d.items || [];
  const pagos = d.pagos || [];
  const titulo = d.numero ? `Sobre N° ${esc(d.numero)}` : 'Sobre nuevo';
  const medico = d.medico?.nombre
    ? `${d.medico.matricula ? `M.P. ${esc(d.medico.matricula)} ` : ''}${esc(d.medico.nombre)}` : '—';
  const paciente = d.paciente?.nombre
    ? `${esc(d.paciente.nombre)}${d.paciente.dni ? ` · DNI ${esc(d.paciente.dni)}` : ''}` : 'Sin asociar';
  const descuento = f.descuento_tipo === 'porcentaje'
    ? `Descuento (${esc(f.descuento_valor)}%)` : 'Descuento';

  const filasItems = items.length
    ? items.map((i) => `<tr><td>${conGuion(i.descripcion)}</td><td class="num">${pesos(i.precio)}</td></tr>`).join('')
    : '<tr><td colspan="2" class="vacio">Sin ítems adicionales</td></tr>';
  const filasPagos = pagos.length
    ? pagos.map((p) => `<tr><td>${fechaAR(p.fecha)}</td><td>${conGuion(p.medio_pago)}</td><td>${val(p.detalle)}</td><td class="num">${pesos(p.importe)}</td></tr>`).join('')
    : '<tr><td colspan="4" class="vacio">Sin pagos ni entregas a cuenta</td></tr>';
  const cotas = (d.cotas || []).filter(([c]) => val(f[c]));

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>${titulo}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #c2185b; padding-bottom: 6px; margin-bottom: 8px; }
  header h1 { font-size: 17pt; margin: 0; color: #c2185b; }
  header .meta { text-align: right; font-size: 9.5pt; color: #444; }
  .marca { border: 2px dashed #c62828; color: #c62828; font-weight: bold; text-align: center; padding: 4px; margin-bottom: 8px; letter-spacing: 1px; }
  h2 { font-size: 11pt; margin: 0 0 4px; padding-bottom: 2px; border-bottom: 1px solid #bbb; }
  .bloque { margin-bottom: 9px; break-inside: avoid; }
  .grilla { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
  .par { display: flex; gap: 6px; }
  .par span { color: #555; min-width: 92px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 3px 5px; text-align: left; }
  .receta th, .receta td { text-align: center; min-width: 38px; height: 20px; }
  .receta thead th, .importes th { background: #f1f1f1; }
  .num { text-align: right; white-space: nowrap; }
  .vacio { color: #777; font-style: italic; }
  .columnas { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .totales td { border: none; border-bottom: 1px solid #ddd; }
  .totales .fuerte td { font-weight: bold; font-size: 12pt; border-bottom: 2px solid #111; }
  .texto { white-space: pre-wrap; min-height: 16px; }
  footer { margin-top: 10px; font-size: 8.5pt; color: #666; text-align: right; }
</style></head>
<body>
  <header>
    <div><h1>${titulo}</h1><div>${conGuion(d.sucursal)}</div></div>
    <div class="meta">
      Estado: <strong>${conGuion(d.estado)}</strong><br>
      Receta: ${fechaAR(f.fecha_receta)} · Entrega: <strong>${fechaAR(f.fecha_entrega)}</strong>
    </div>
  </header>
  ${d.borrador ? '<div class="marca">BORRADOR — SIN GUARDAR</div>' : ''}

  <section class="bloque">
    <h2>Paciente</h2>
    <div class="grilla">
      ${par('Paciente', paciente)}
      ${par('Obra social', val(d.obraSocial) || 'Particular')}
      ${par('Médico', medico)}
      ${par('Laboratorio', conGuion(d.laboratorio))}
    </div>
  </section>

  ${tablaReceta('Lejos', 'lejos', d.colsLejos || [], f)}
  <div class="bloque grilla">
    ${par('Lente (L)', conGuion(f.lente_lejos_descripcion))}
    ${par('Armazón (L)', conGuion(d.armazonLejos))}
  </div>
  ${tablaReceta('Cerca', 'cerca', d.colsCerca || [], f)}
  <div class="bloque grilla">
    ${par('Lente (C)', conGuion(f.lente_cerca_descripcion))}
    ${par('Armazón (C)', conGuion(d.armazonCerca))}
  </div>

  <section class="bloque">
    <h2>Medidas</h2>
    <div class="grilla">
      ${par('DIP', conGuion(f.dip))}
      ${par('DNP OD / OI', `${conGuion(f.dnp_od)} / ${conGuion(f.dnp_oi)}`)}
      ${par('A.P. OD / OI', `${conGuion(f.ap_od)} / ${conGuion(f.ap_oi)}`)}
      ${cotas.map(([c, e]) => par(e, val(f[c]))).join('')}
    </div>
  </section>

  <section class="bloque">
    <h2>Detalle</h2>
    <div class="grilla">
      ${par('Cristal', conGuion(f.cristal_descripcion))}
      ${par('Armazón (detalle)', conGuion(f.armazon_descripcion))}
      ${par('Cód. pedido / garantía', conGuion(f.codigo_pedido_garantia))}
    </div>
    ${val(f.observacion_lab) ? `<p>Observación para el laboratorio:</p><div class="texto">${val(f.observacion_lab)}</div>` : ''}
    ${val(f.notas) ? `<p>Notas:</p><div class="texto">${val(f.notas)}</div>` : ''}
  </section>

  <div class="columnas">
    <section class="bloque">
      <h2>Servicios, insumos y otros</h2>
      <table class="importes"><thead><tr><th>Descripción</th><th class="num">Importe</th></tr></thead>
        <tbody>${filasItems}</tbody></table>
    </section>
    <section class="bloque">
      <h2>Importes</h2>
      <table class="totales"><tbody>
        <tr><td>Sub Total Lejos</td><td class="num">${pesos(t.subtotal_lejos)}</td></tr>
        <tr><td>Sub Total Cerca</td><td class="num">${pesos(t.subtotal_cerca)}</td></tr>
        <tr><td>Total Otros</td><td class="num">${pesos(t.total_otros)}</td></tr>
        <tr><td>Sub Total</td><td class="num">${pesos(t.subtotal)}</td></tr>
        <tr><td>${descuento}</td><td class="num">- ${pesos(t.descuento)}</td></tr>
        <tr><td>Recargo</td><td class="num">${pesos(t.recargo)}</td></tr>
        <tr class="fuerte"><td>Total</td><td class="num">${pesos(t.total)}</td></tr>
        <tr><td>Pagado</td><td class="num">${pesos(t.pagado)}</td></tr>
        <tr class="fuerte"><td>Saldo</td><td class="num">${pesos(t.saldo)}</td></tr>
      </tbody></table>
    </section>
  </div>

  <section class="bloque">
    <h2>Pagos</h2>
    <table class="importes"><thead><tr><th>Fecha</th><th>Medio</th><th>Detalle</th><th class="num">Importe</th></tr></thead>
      <tbody>${filasPagos}</tbody></table>
  </section>

  <footer>Impreso el ${esc(new Date().toLocaleString('es-AR'))}</footer>
  <script>window.onload = function () { window.print(); };<\/script>
</body></html>`;
}

// Abre la ventana de impresión. Devuelve false si el navegador bloqueó la ventana.
export function imprimirSobreA4(datos) {
  const w = window.open('', '_blank', 'width=900,height=1100');
  if (!w) return false;
  w.document.open();
  w.document.write(htmlSobreA4(datos));
  w.document.close();
  return true;
}
