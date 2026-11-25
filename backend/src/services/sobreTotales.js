// =====================================================================
// Cálculo de importes del Sobre (misma fórmula que frontend/src/utils/sobreTotales.js).
//   Sub Total Lejos = lente lejos + armazón lejos
//   Sub Total Cerca = lente cerca + armazón cerca
//   Total Otros     = suma de servicios, insumos y accesorios
//   Sub Total       = lejos + cerca + otros
//   Total           = Sub Total - descuento + recargo   (nunca negativo)
//   Saldo           = Total - pagos
// El descuento es un porcentaje (0 a 100) o un monto fijo (tope: el Sub Total).
// =====================================================================

const r2 = (n) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0;
};

function calcularTotales(s = {}, items = [], pagos = []) {
  const subtotal_lejos = r2(r2(s.lente_lejos_precio) + r2(s.armazon_lejos_precio));
  const subtotal_cerca = r2(r2(s.lente_cerca_precio) + r2(s.armazon_cerca_precio));
  const total_otros = r2((items || []).reduce((a, i) => a + r2(i.precio), 0));
  const subtotal = r2(subtotal_lejos + subtotal_cerca + total_otros);

  const valor = Math.max(r2(s.descuento_valor), 0);
  let descuento = 0;
  if (s.descuento_tipo === 'porcentaje') descuento = r2((subtotal * Math.min(valor, 100)) / 100);
  else if (s.descuento_tipo === 'monto') descuento = Math.min(valor, subtotal);

  const recargo = Math.max(r2(s.recargo), 0);
  const total = Math.max(r2(subtotal - descuento + recargo), 0);
  const pagado = r2((pagos || []).reduce((a, p) => a + r2(p.importe), 0));
  const saldo = r2(total - pagado);

  return { subtotal_lejos, subtotal_cerca, total_otros, subtotal, descuento, recargo, total, pagado, saldo };
}

module.exports = { calcularTotales };
