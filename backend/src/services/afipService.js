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

// ¿Están cargadas las credenciales mínimas para operar con AFIP real?
function credencialesListas() {
  return Boolean(AFIP_CUIT && AFIP_CERT && AFIP_KEY);
}

// Numeración correlativa por tipo + punto de venta. En simulación la llevamos
// nosotros (último + 1); con AFIP real la define FECompUltimoAutorizado.
async function siguienteNumero(tipo) {
  try {
    const r = await query(
      `SELECT COALESCE(MAX(numero), 0) + 1 AS siguiente
       FROM comprobantes_fiscales
       WHERE tipo = $1 AND punto_venta = $2`,
      [tipo, AFIP_PUNTO_VENTA]
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

function estadoServicio() {
  return {
    modo: credencialesListas() ? (AFIP_PRODUCCION ? 'produccion' : 'homologacion') : 'simulacion',
    credenciales: credencialesListas(),
    punto_venta: AFIP_PUNTO_VENTA,
  };
}

// Genera un comprobante en modo simulación (sin CAE real), pero FORMAL:
// numeración correlativa por punto de venta + QR con el formato oficial AFIP.
async function autorizarSimulado(datos) {
  const tipo = datos.tipo === 'INTERNO' ? 'INTERNO' : datos.tipo;
  const numero = await siguienteNumero(tipo);
  const fecha = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const qr = construirQR({
    fecha,
    cuit: AFIP_CUIT,
    ptoVta: AFIP_PUNTO_VENTA,
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
    punto_venta: AFIP_PUNTO_VENTA,
    numero,
    cae: null,
    cae_vencimiento: null,
    qr_data: qr,
    observaciones: 'Comprobante interno con numeración formal (sin CAE de AFIP). No tiene validez fiscal hasta activar la facturación electrónica.',
  };
}

// --- Punto de integración REAL con AFIP (WSAA + WSFEv1) ---
// Se completa y prueba en homologación con los certificados del titular.
async function autorizarReal(datos) {
  // PASOS A IMPLEMENTAR Y PROBAR EN HOMOLOGACIÓN:
  //  1. WSAA: generar TRA (XML), firmarlo (CMS/PKCS#7) con AFIP_CERT+AFIP_KEY,
  //     enviarlo al WSAA y obtener { token, sign } (cachear ~12h).
  //  2. WSFEv1 (FECAESolicitar): armar el comprobante (tipo A/B/C, pto venta,
  //     nro = último+1 vía FECompUltimoAutorizado, importes, IVA) y solicitar CAE.
  //  3. Parsear la respuesta: CAE, vencimiento, resultado (A=aprobado/R=rechazado)
  //     y observaciones.
  //  Librerías candidatas: 'afip.js' / 'soap' + 'node-forge' para la firma.
  //
  // Hasta tener credenciales reales y validar en homologación, no emitimos un
  // CAE falso: devolvemos un fallo controlado para que el TPV ofrezca el
  // comprobante interno como respaldo.
  return {
    ok: false,
    modo: AFIP_PRODUCCION ? 'produccion' : 'homologacion',
    estado: 'rechazado',
    observaciones:
      'Integración AFIP real pendiente de activación: hay credenciales cargadas, ' +
      'pero la conexión WSAA/WSFEv1 debe validarse en homologación antes de emitir CAE.',
  };
}

// API pública del servicio
// datos: { tipo:'A'|'B'|'C'|'INTERNO', importe_total, importe_neto, importe_iva, cuit_receptor }
async function autorizar(datos) {
  if (datos.tipo === 'INTERNO' || !credencialesListas()) {
    return autorizarSimulado(datos);
  }
  try {
    const r = await autorizarReal(datos);
    // Si la integración real todavía no está operativa, caemos al comprobante
    // interno formal como respaldo (nunca bloqueamos la venta).
    if (!r.ok) {
      const respaldo = await autorizarSimulado(datos);
      respaldo.observaciones = `${r.observaciones} Se emitió comprobante interno de respaldo.`;
      return respaldo;
    }
    return r;
  } catch (err) {
    // Ante cualquier fallo con AFIP, no bloqueamos la venta: comprobante interno.
    const respaldo = await autorizarSimulado(datos);
    respaldo.observaciones = `Error al conectar con AFIP: ${err.message}. Se emitió comprobante interno de respaldo.`;
    return respaldo;
  }
}

module.exports = { autorizar, estadoServicio, credencialesListas };
