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

const { AFIP_CUIT, AFIP_CERT, AFIP_KEY, AFIP_PUNTO_VENTA, AFIP_PRODUCCION } = require('../config/env');

// ¿Están cargadas las credenciales mínimas para operar con AFIP real?
function credencialesListas() {
  return Boolean(AFIP_CUIT && AFIP_CERT && AFIP_KEY);
}

function estadoServicio() {
  return {
    modo: credencialesListas() ? (AFIP_PRODUCCION ? 'produccion' : 'homologacion') : 'simulacion',
    credenciales: credencialesListas(),
    punto_venta: AFIP_PUNTO_VENTA,
  };
}

// Genera un comprobante en modo simulación (sin CAE real)
function autorizarSimulado(datos) {
  const ahora = new Date();
  const venc = new Date(ahora);
  venc.setDate(venc.getDate() + 10);
  return {
    ok: true,
    modo: 'simulacion',
    estado: 'simulado',
    tipo: datos.tipo === 'INTERNO' ? 'INTERNO' : datos.tipo,
    punto_venta: AFIP_PUNTO_VENTA,
    numero: Math.floor(Math.random() * 90000) + 10000, // nro interno
    cae: null,
    cae_vencimiento: null,
    observaciones: 'Comprobante en modo simulación (sin credenciales AFIP). No tiene validez fiscal.',
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
    return await autorizarReal(datos);
  } catch (err) {
    // Ante cualquier fallo con AFIP, no bloqueamos la venta: avisamos.
    return {
      ok: false,
      modo: 'produccion',
      estado: 'rechazado',
      observaciones: `Error al conectar con AFIP: ${err.message}`,
    };
  }
}

module.exports = { autorizar, estadoServicio, credencialesListas };
