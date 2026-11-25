// =====================================================================
// Importes del Sobre (columna derecha): Sub Total Lejos / Cerca / Otros,
// Sub Total, descuento (sin / % / $), recargo, Total, pagos y Saldo.
// Todo se recalcula en cada tecla con utils/sobreTotales (el servidor
// vuelve a calcular al guardar).
//
// Props:
//   form, setC(campo, valor)   estado del sobre (precios, descuento, recargo)
//   pagos, setPagos            lista de pagos [{ fecha, detalle, medio_pago, importe }]
//   totales                    resultado de calcularTotales(form, items, pagos)
// =====================================================================
import { Plus, X } from 'lucide-react';
import { pesos } from '../../utils/sobreTotales';

export const MEDIOS_PAGO = ['Efectivo', 'Tarjeta de Credito', 'Tarjeta de Debito', 'Q.R.', 'Transferencia', 'Cuenta Corriente'];
const MEDIO_LABEL = { 'Tarjeta de Credito': 'Tarjeta de crédito', 'Tarjeta de Debito': 'Tarjeta de débito', 'Q.R.': 'QR' };

const hoy = () => new Date().toISOString().slice(0, 10);

function Importe({ etiqueta, value, onChange }) {
  return (
    <label className="fin-importe">
      <span>{etiqueta}</span>
      <span className="fin-importe__input">
        <span aria-hidden="true">$</span>
        <input type="number" min="0" step="0.01" inputMode="decimal" value={value}
          aria-label={etiqueta} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export default function SobreFinanzas({ form, setC, pagos, setPagos, totales }) {
  function cambiarPago(i, campo, v) {
    setPagos((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));
  }

  return (
    <div className="fin">
      <section className="fin-bloque fin-bloque--lejos">
        <h3>Sub Total <strong>Lejos</strong></h3>
        <Importe etiqueta="Lente (L)" value={form.lente_lejos_precio} onChange={(v) => setC('lente_lejos_precio', v)} />
        <Importe etiqueta="Armazón (L)" value={form.armazon_lejos_precio} onChange={(v) => setC('armazon_lejos_precio', v)} />
        <p className="fin-sub">{pesos(totales.subtotal_lejos)}</p>
      </section>

      <section className="fin-bloque fin-bloque--cerca">
        <h3>Sub Total <strong>Cerca</strong></h3>
        <Importe etiqueta="Lente (C)" value={form.lente_cerca_precio} onChange={(v) => setC('lente_cerca_precio', v)} />
        <Importe etiqueta="Armazón (C)" value={form.armazon_cerca_precio} onChange={(v) => setC('armazon_cerca_precio', v)} />
        <p className="fin-sub">{pesos(totales.subtotal_cerca)}</p>
      </section>

      <div className="fin-linea"><span>Total Otros</span><strong>{pesos(totales.total_otros)}</strong></div>

      <div className="fin-resumen">
        <div className="fin-linea"><span>Sub Total</span><strong>{pesos(totales.subtotal)}</strong></div>
        <div className="fin-linea fin-linea--descuento">
          <select value={form.descuento_tipo} aria-label="Tipo de descuento"
            onChange={(e) => setC('descuento_tipo', e.target.value)}>
            <option value="">SIN DESCUENTO</option>
            <option value="porcentaje">Descuento en %</option>
            <option value="monto">Descuento en $</option>
          </select>
          {form.descuento_tipo && (
            <input type="number" min="0" step="0.01" max={form.descuento_tipo === 'porcentaje' ? 100 : undefined}
              aria-label="Valor del descuento" placeholder={form.descuento_tipo === 'porcentaje' ? '%' : '$'}
              value={form.descuento_valor} onChange={(e) => setC('descuento_valor', e.target.value)} />
          )}
          <strong>- {pesos(totales.descuento)}</strong>
        </div>
        <div className="fin-linea fin-linea--recargo">
          <span>Recargos</span>
          <input type="number" min="0" step="0.01" aria-label="Recargos" value={form.recargo}
            onChange={(e) => setC('recargo', e.target.value)} />
        </div>
        <div className="fin-linea fin-linea--total"><span>Total</span><strong>{pesos(totales.total)}</strong></div>
      </div>

      <section className="fin-pagos">
        <div className="fin-pagos__head">
          <h3>Pagos</h3>
          <button type="button" className="btn-mini btn-mini--wide"
            onClick={() => setPagos((ps) => [...ps, { fecha: hoy(), detalle: '', medio_pago: 'Efectivo', importe: '' }])}>
            <Plus size={12} /> Pago
          </button>
        </div>
        {pagos.length === 0 && <p className="muted small">Sin pagos ni entregas a cuenta.</p>}
        {pagos.map((p, i) => (
          <div key={i} className="fin-pago">
            <input type="date" aria-label={`Fecha del pago ${i + 1}`} value={p.fecha}
              onChange={(e) => cambiarPago(i, 'fecha', e.target.value)} />
            <select aria-label={`Medio del pago ${i + 1}`} value={p.medio_pago}
              onChange={(e) => cambiarPago(i, 'medio_pago', e.target.value)}>
              {MEDIOS_PAGO.map((m) => <option key={m} value={m}>{MEDIO_LABEL[m] || m}</option>)}
            </select>
            <input aria-label={`Detalle del pago ${i + 1}`} placeholder="Detalle (seña, saldo…)" maxLength={150}
              value={p.detalle} onChange={(e) => cambiarPago(i, 'detalle', e.target.value)} />
            <input type="number" min="0.01" step="0.01" aria-label={`Importe del pago ${i + 1}`} placeholder="$"
              value={p.importe} onChange={(e) => cambiarPago(i, 'importe', e.target.value)} />
            <button type="button" className="btn-mini" aria-label={`Quitar pago ${i + 1}`} title="Quitar pago"
              onClick={() => setPagos((ps) => ps.filter((_, j) => j !== i))}><X size={12} /></button>
          </div>
        ))}
        <div className="fin-linea"><span>Pagos</span><strong>{pesos(totales.pagado)}</strong></div>
        <p className="muted small">Los pagos quedan registrados en el sobre; todavía no generan movimiento de caja.</p>
      </section>

      <div className={`fin-saldo ${totales.saldo < 0 ? 'fin-saldo--favor' : ''}`}>
        <span>{totales.saldo < 0 ? 'Saldo a favor' : 'Saldo'}</span>
        <strong>{pesos(Math.abs(totales.saldo))}</strong>
      </div>
    </div>
  );
}
