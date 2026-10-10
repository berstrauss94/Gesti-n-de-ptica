// =====================================================================
// Servicio de facturación electrónica AFIP/ARCA.
//
// Dos modos:
//  - SIMULACIÓN (por defecto): si faltan AFIP_CUIT/CERT/KEY, genera un
//    comprobante interno sin CAE. NUNCA bloquea la venta del TPV.
//  - PRODUCCIÓN/HOMOLOGACIÓN: si hay credenciales, debe autenticarse por
//    WSAA (token+sign) y autorizar el comprobante por WSFEv1 (obtener CAE).
//    *** La integración real con los WebServices se implementa y prueba
//    contra el ambiente de homologación de AFIP con los certificados
//    reales. Hasta entonces, cae a simulación con un aviso. ***
// =====================================================================

const { query } = require('../config/db');
const { AFIP_CUIT, AFIP_CERT, AFIP_KEY, AFIP_PUNTO_VENTA, AFIP_PRODUCCION } = require('../config/env');

// Mapeo de tipo de comprobante a código AFIP (para el QR y, luego, WSFEv1).
const COD_TIPO_AFIP = { A: 1, B: 6, C: 11, INTERNO: 0 };

// Resuelve la configuración fiscal efectiva. Precedencia: variables de entorno
// (si están) y, si no, la fila única de config_fiscal cargada desde la UI.
// Modelo A (una instalación por óptica): cada óptica carga su propio certificado.
async function obtenerConfig() {
  let cuit = AFIP_CUIT, cert = AFIP_CERT, key = AFIP_KEY;
  let puntoVenta = AFIP_PUNTO_VENTA, produccion = AFIP_PRODUCCION;
  if (!(cuit && cert && key)) {
    try {
      const r = await query('SELECT * FROM config_fiscal WHERE id = 1');
      const c = r.rows[0];
      if (c) {
        cuit = cuit || c.cuit || '';
        cert = cert || c.certificado || '';
        key = key || c.clave_privada || '';
        if (!AFIP_PUNTO_VENTA || AFIP_PUNTO_VENTA === 1) puntoVenta = c.punto_venta || puntoVenta;
        if (!AFIP_CUIT) produccion = Boolean(c.produccion);
      }
    } catch { /* sin DB o sin tabla: queda la config de env */ }
  }
  return { cuit, cert, key, puntoVenta, produccion };
}

// ¿Están cargadas las credenciales mínimas para operar con AFIP real?
async function credencialesListas() {
  const c = await obtenerConfig();
  return Boolean(c.cuit && c.cert && c.key);
}

// Numeración correlativa por tipo + punto de venta. En simulación la llevamos
// nosotros (último + 1); con AFIP real la define FECompUltimoAutorizado.
async function siguienteNumero(tipo, puntoVenta) {
  try {
    const r = await query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM comprobantes_fiscales
       WHERE tipo = $1 AND punto_venta = $2`,
      [tipo, puntoVenta]
    );
    return r.rows[0].siguiente;
  } catch {
    return 1;
  }
}

// Arma el string del QR según la especificación oficial de AFIP:
// https://www.afip.gob.ar/fe/qr/  -> URL + ?p=<json base64>
function construirQR({ fecha, cuit, ptoVta, tipoCod, nro, importe, cae }) {
  const datos = {
    ver: 1,
    fecha,
    cuit: Number(cuit) || 0,
    ptoVta,
    tipoCmp: tipoCod,
    nroCmp: nro,
    importe,
    moneda: 'PES',
    ctz: 1,
    tipoCodAut: cae ? 'E' : 'A',
    codAut: cae ? Number(cae) : 0,
  };
  const b64 = Buffer.from(JSON.stringify(datos)).toString('base64');
  return `https://www.afip.gob.ar/fe/qr/?p=${b64}`;
}

async function estadoServicio() {
  const c = await obtenerConfig();
  const listas = Boolean(c.cuit && c.cert && c.key);
  return {
    modo: listas ? (c.produccion ? 'produccion' : 'homologacion') : 'simulacion',
    credenciales: listas,
    punto_venta: c.puntoVenta,
    cuit: c.cuit || null,
  };
}

// Genera un comprobante en modo simulación (sin CAE real), pero FORMAL:
// numeración correlativa por punto de venta + QR con el formato oficial AFIP.
async function autorizarSimulado(datos, cfg) {
  const c = cfg || (await obtenerConfig());
  const tipo = datos.tipo === 'INTERNO' ? 'INTERNO' : datos.tipo;
  const numero = await siguienteNumero(tipo, c.puntoVenta);
  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const qr = construirQR({
    fecha,
    cuit: c.cuit,
    ptoVta: c.puntoVenta,
    tipoCod: COD_TIPO_AFIP[tipo] ?? 0,
    nro: numero,
    importe: Number(datos.importe_total) || 0,
    cae: null,
  });
  return {
    ok: true,
    modo: 'simulacion',
    estado: 'simulado',
    tipo,
    punto_venta: c.puntoVenta,
    numero,
    cae: null,
    cae_vencimiento: null,
    qr_data: qr,
    observaciones: 'Comprobante interno con numeración formal (sin CAE de AFIP). No tiene validez fiscal hasta activar la facturación electrónica.',
  };
}

// --- Punto de integración REAL con AFIP (WSAA + WSFEv1) ---
// Se completa y prueba en homologación con los certificados del titular.
async function autorizarReal(datos, cfg) {
  // PASOS A IMPLEMENTAR Y PROBAR EN HOMOLOGACIÓN:
  //  1. WSAA: generar TRA (XML), firmarlo (CMS/PKCS#7) con cfg.cert+cfg.key,
  //     enviarlo al WSAA y obtener { token, sign } (cachear ~12h).
  //  2. WSFEv1 (FECAESolicitar): armar el comprobante (tipo A/B/C, pto venta,
  //     nro = último+1 vía FECompUltimoAutorizado, importes, IVA) y solicitar CAE.
  //  3. Parsear la respuesta: CAE, vencimiento, resultado (A=aprobado/R=rechazado)
  //     y observaciones.
  //  Librerías candidatas: 'afip.js' / 'soap' + 'node-forge' para la firma.
  //  Las credenciales salen de cfg (env o config_fiscal cargada por la óptica).
  //
  // Hasta tener credenciales reales y validar en homologación, no emitimos un
  // CAE falso: devolvemos un fallo controlado para que el TPV ofrezca el
  // comprobante interno como respaldo.
  return {
    ok: false,
    modo: cfg.produccion ? 'produccion' : 'homologacion',
    estado: 'rechazado',
    observaciones:
      'Integración AFIP real pendiente de activación: hay credenciales cargadas, ' +
      'pero la conexión WSAA/WSFEv1 debe validarse en homologación antes de emitir CAE.',
  };
}

// API pública del servicio
// datos: { tipo:'A'|'B'|'C'|'INTERNO', importe_total, importe_neto, importe_iva, cuit_receptor }
async function autorizar(datos) {
  const cfg = await obtenerConfig();
  const listas = Boolean(cfg.cuit && cfg.cert && cfg.key);
  if (datos.tipo === 'INTERNO' || !listas) {
    return autorizarSimulado(datos, cfg);
  }
  try {
    const r = await autorizarReal(datos, cfg);
    // Si la integración real todavía no está operativa, caemos al comprobante
    // interno formal como respaldo (nunca bloqueamos la venta).
    if (!r.ok) {
      const respaldo = await autorizarSimulado(datos, cfg);
      respaldo.observaciones = `${r.observaciones} Se emitió comprobante interno de respaldo.`;
      return respaldo;
    }
    return r;
  } catch (err) {
    // Ante cualquier fallo con AFIP, no bloqueamos la venta: comprobante interno.
    const respaldo = await autorizarSimulado(datos, cfg);
    respaldo.observaciones = `Error al conectar con AFIP: ${err.message}. Se emitió comprobante interno de respaldo.`;
    return respaldo;
  }
}

// Config pública para la UI: NO expone el certificado ni la clave, solo flags.
async function configPublica() {
  const c = await obtenerConfig();
  return {
    cuit: c.cuit || '',
    punto_venta: c.puntoVenta,
    produccion: Boolean(c.produccion),
    razon_social: '',
    certificado_cargado: Boolean(c.cert),
    clave_cargada: Boolean(c.key),
    por_entorno: Boolean(AFIP_CUIT && AFIP_CERT && AFIP_KEY),
  };
}

// Guarda la config fiscal en la fila única config_fiscal. Solo se actualizan
// los campos presentes (no pisa el certificado/clave si no se reenvían).
async function guardarConfig(b = {}) {
  const campos = [];
  const valores = [];
  const set = (col, val) => { valores.push(val); campos.push(`${col} = $${valores.length}`); };
  if (b.cuit !== undefined) set('cuit', String(b.cuit).replace(/\D/g, '').slice(0, 11) || null);
  if (b.punto_venta !== undefined) set('punto_venta', parseInt(b.punto_venta, 10) || 1);
  if (b.produccion !== undefined) set('produccion', Boolean(b.produccion));
  if (b.razon_social !== undefined) set('razon_social', b.razon_social || null);
  if (b.certificado) set('certificado', b.certificado);
  if (b.clave_privada) set('clave_privada', b.clave_privada);
  campos.push('updated_at = CURRENT_TIMESTAMP');
  if (valores.length > 0) {
    await query(`UPDATE config_fiscal SET ${campos.join(', ')} WHERE id = 1`, valores);
  }
  return configPublica();
}

module.exports = { autorizar, estadoServicio, credencialesListas, configPublica, guardarConfig };
