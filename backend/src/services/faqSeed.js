// =====================================================================
// Preguntas frecuentes iniciales del asistente de ayuda.
// Se cargan al arrancar el servidor (después de las migraciones) y solo
// agrega lo que falta, identificado por "clave": nunca pisa lo que ya esté
// en la base. Cada respuesta describe lo que el sistema hace hoy.
// =====================================================================
const { query } = require('../config/db');

// rel = claves de preguntas relacionadas (se resuelven a ids al cargar)
const CATEGORIAS = [
  {
    clave: 'stock', nombre: 'Stock', icono: '📦', preguntas: [
      {
        clave: 'stock_buscar', pregunta: '¿Cómo busco un producto en Stock?',
        corta: 'En Stock escribí parte del nombre, código, código de barras o marca y apretá Buscar.',
        detalle: 'En Stock escribí parte del nombre, código, código de barras o marca y apretá Buscar: tolera errores de tipeo. Podés sumar los desplegables de Categoría, Marca, Género, Material, Ubicación y Proveedor, y el campo "Modelo o referencia" (busca en nombre, código y código de barras). Si escribís algo como "marcos de mujer en metal", el sistema completa Género y Material solo y te avisa qué usó. "Limpiar filtros" vuelve a mostrar todo.',
        rel: ['stock_no_aparece', 'stock_importar'],
      },
      {
        clave: 'stock_no_aparece', pregunta: '¿Por qué no aparece un producto en Stock?',
        corta: 'Stock solo muestra los productos que tienen stock cargado en la sucursal elegida.',
        detalle: 'Stock solo muestra los productos que tienen una fila de stock en la sucursal elegida arriba. Revisá tres cosas: 1) que la sucursal sea la correcta; 2) que el producto haya recibido mercadería (un producto cargado sin cantidad, por ejemplo desde Mercado, recién aparece cuando se confirma la compra); 3) que tenga cargados género y material si filtrás por eso: los productos viejos pueden no tenerlos. Si es un modelo que todavía no tenés, el botón "Buscar en Mercado" del mensaje de sin resultados lo busca en la web.',
        rel: ['mercado_cargar', 'stock_importar'],
      },
      {
        clave: 'stock_importar', pregunta: '¿Cómo cargo o actualizo productos con un CSV?',
        corta: 'Con el botón "Importar precios" de Stock (solo admin).',
        detalle: 'Solo admin. En Stock tocá "Importar precios" y elegí el archivo CSV. Se reconocen las columnas codigo, codigo_barras, nombre, categoria, marca, costo, margen, precio, genero, material, ubicacion y proveedor. Cada fila se empareja con el producto por código o, si no hay, por código de barras. Una celda vacía no borra lo que ya estaba cargado y una fila con error no corta las demás: al final ves el detalle.',
        rel: ['stock_buscar'],
      },
      {
        clave: 'stock_mover', pregunta: '¿Cómo sumo o resto unidades de un producto?',
        corta: 'Con los botones + y − de cada fila de Stock.',
        detalle: 'Cada fila de Stock tiene los botones − y + para sacar o sumar una unidad. "Historial" muestra los movimientos del producto y "Etiqueta" imprime la etiqueta con código de barras. Los admin además pueden editar, trasladar a otra sucursal o eliminar el producto.',
        rel: ['compras_cargar'],
      },
    ],
  },
  {
    clave: 'sobres', nombre: 'Sobres', icono: '🧾', preguntas: [
      {
        clave: 'sobres_cargar', pregunta: '¿Cómo cargo un sobre con la receta de un paciente?',
        corta: 'Desde Sobres, creá un sobre nuevo y completá paciente, receta, armazón y cristales.',
        detalle: 'En Sobres creá un sobre nuevo: elegí el paciente, el médico y la obra social, cargá la receta de lejos y de cerca por ojo, el armazón (del stock o el que trae el cliente) y los cristales. La consola trae calculadoras de transposición y de adición para ahorrar cuentas. Guardalo y seguilo por su estado.',
        rel: ['sobres_estados', 'lentes_catalogo'],
      },
      {
        clave: 'sobres_estados', pregunta: '¿Qué significa cada estado de un sobre?',
        corta: 'Pendiente, reserva, en taller, lentes, listo, entregado y anulado.',
        detalle: 'Pendiente: recién cargado. Reserva: señado o reservado. En taller: enviado al laboratorio. Lentes: los lentes ya llegaron del laboratorio. Listo: armado y listo para entregar. Entregado: ya se lo llevó el cliente. Anulado: se canceló. El estado se cambia desde la lista de Sobres.',
        rel: ['sobres_cargar'],
      },
    ],
  },
  {
    clave: 'turnos', nombre: 'Turnos y recordatorios', icono: '📅', preguntas: [
      {
        clave: 'turnos_agendar', pregunta: '¿Cómo agendo un turno?',
        corta: 'En Turnos / Agenda tocá "+ Nuevo turno".',
        detalle: 'En Turnos / Agenda elegí la sucursal y tocá "+ Nuevo turno": cargá el cliente (o un nombre y teléfono sueltos), el profesional, la fecha y hora y el motivo. En la lista, cada turno se marca como Asistió, Ausente o Cancelado. Un turno pendiente tiene el botón "Recordar" para programar el aviso por WhatsApp.',
        rel: ['recordatorios_programar'],
      },
      {
        clave: 'recordatorios_programar', pregunta: '¿Cómo programo un aviso para que el cliente vuelva a su control?',
        corta: 'En la pestaña Recordatorios cargá cliente, celular, fecha y cuánto antes avisar.',
        detalle: 'Entrá a Recordatorios. Cargá el cliente y su celular con código de área, la fecha en que tiene que volver (hay atajos: en 1, 2, 3, 6 meses o 1 año) y marcá cuánto antes avisar: 1 mes, 2 semanas, 1 semana, 4 días o los días que quieras. Si el doctor pidió un mensaje especial, escribilo; podés usar {nombre}, {fecha} y {local}. Los avisos salen solos a las 10:00. Si una fecha de aviso ya pasó, no se crea y el sistema te lo dice.',
        rel: ['recordatorios_no_salen', 'turnos_agendar'],
      },
      {
        clave: 'recordatorios_no_salen', pregunta: '¿Por qué no salió un recordatorio por WhatsApp?',
        corta: 'Casi siempre faltan las credenciales o la plantilla aprobada de WhatsApp.',
        detalle: 'Revisá: 1) que las alertas estén activadas en Configuración; 2) que estén cargados el token, el Phone ID y el nombre de la plantilla aprobada por Meta (sin plantilla, WhatsApp solo entrega si el cliente escribió en las últimas 24 horas); 3) que el celular sea válido. Mientras falte algo, los avisos quedan "Programados" y salen cuando se completa. Si un envío falla se reintenta 3 veces y después queda "Falló" con el motivo a la vista en Recordatorios.',
        rel: ['config_alertas', 'recordatorios_programar'],
      },
    ],
  },
  {
    clave: 'ventas', nombre: 'Ventas y caja', icono: '🛒', preguntas: [
      {
        clave: 'tpv_vender', pregunta: '¿Cómo registro una venta?',
        corta: 'En TPV / Ventas: abrí la caja, agregá productos, elegí cliente y seña, y creá la venta.',
        detalle: 'En TPV / Ventas abrí la caja, armá la venta agregando productos, elegí el cliente y la seña si corresponde, y creala. Después la entregás y la facturás. Al vender se descuenta el stock y la caja lleva el arqueo.',
        rel: ['comisiones_ver'],
      },
      {
        clave: 'comisiones_ver', pregunta: '¿Dónde veo las comisiones de los vendedores?',
        corta: 'En Comisiones (solo admin).',
        detalle: 'En Comisiones, que ven solo los admin: elegí el rango de fechas y la sucursal. Muestra el resumen por vendedor y el detalle venta por venta, según las ventas entregadas.',
        rel: ['tpv_vender'],
      },
    ],
  },
  {
    clave: 'compras', nombre: 'Compras y proveedores', icono: '🚚', preguntas: [
      {
        clave: 'compras_cargar', pregunta: '¿Cómo cargo una compra a un proveedor?',
        corta: 'En Compras cargá los productos y costos y confirmá la compra.',
        detalle: 'En Compras cargá la compra con sus productos, cantidades y costos: queda en borrador. Un admin la confirma cuando llega la mercadería; al confirmar se suma el stock a la sucursal, se actualiza el costo y, si corresponde, se recalcula el precio de venta. Desde la misma pantalla se dan de alta proveedores y laboratorios y se siguen las órdenes de trabajo a laboratorio por estado.',
        rel: ['mercado_cargar', 'stock_mover'],
      },
    ],
  },
  {
    clave: 'mercado', nombre: 'Mercado y catálogo', icono: '🏪', preguntas: [
      {
        clave: 'mercado_cargar', pregunta: '¿Cómo agrego a mi catálogo un modelo que todavía no tengo?',
        corta: 'Buscalo en Mercado y usá "Cargar en mi catálogo" (admin).',
        detalle: 'En Mercado buscá la marca o el modelo; si no está guardado, el admin lo trae de la web con la IA, con sus medidas, material y género. Después, con "Cargar en mi catálogo", queda como producto tuyo sin stock. Si indicás una cantidad, además deja un pedido simulado: una compra en borrador. Cuando llega la mercadería la confirmás en Compras y entra al stock.',
        rel: ['compras_cargar', 'stock_no_aparece'],
      },
      {
        clave: 'lentes_catalogo', pregunta: '¿Dónde veo los cristales y servicios del laboratorio con sus precios?',
        corta: 'En "Lentes y otros".',
        detalle: 'En "Lentes y otros" elegí una categoría del menú de la derecha (de Control de miopía a Lentes de sol) o buscá por nombre, grupo, marca o código. Cada ítem muestra su precio, el rango de graduación y los días de demora. Podés imprimir la lista. Un admin puede importarla desde un CSV y ajustar los precios por porcentaje, viendo antes el efecto.',
        rel: ['sobres_cargar'],
      },
    ],
  },
  {
    clave: 'tryon', nombre: 'Prueba virtual', icono: '🕶️', preguntas: [
      {
        clave: 'tryon_usar', pregunta: '¿Cómo hago la prueba virtual de un armazón?',
        corta: 'En Prueba Virtual elegí cliente, foto y marco.',
        detalle: 'En Prueba Virtual elegí el cliente y una de sus fotos, y después un marco: el sistema lo ajusta al rostro con la foto frontal. Las fotos de 45° y de perfil quedan como referencia. El botón "Prueba realista con IA" genera una imagen más real y solo funciona si hay una clave de Google cargada.',
        rel: ['tryon_ia'],
      },
      {
        clave: 'tryon_ia', pregunta: '¿Por qué no funciona la prueba realista con IA?',
        corta: 'Falta la clave de Google o no tiene cuota.',
        detalle: 'Esa función necesita la clave de Google (Gemini) cargada en Configuración o en el servidor. Sin clave el botón queda deshabilitado y sigue funcionando el ajuste normal del marco. Si hay clave pero falla, el mensaje que aparece trae el motivo que devuelve Google; el más común es que la cuenta no tenga cuota disponible.',
        rel: ['config_alertas'],
      },
    ],
  },
  {
    clave: 'config', nombre: 'Configuración y acceso', icono: '⚙️', preguntas: [
      {
        clave: 'config_alertas', pregunta: '¿Dónde cargo los datos de WhatsApp, Telegram y la clave de la IA?',
        corta: 'En Configuración (solo admin).',
        detalle: 'En Configuración, que ven solo los admin: ahí van el token y el chat de Telegram, el token y el Phone ID de WhatsApp (de Meta), el nombre y el idioma de la plantilla aprobada y la clave de Google para la IA. Los campos de claves quedan vacíos al entrar: si los dejás así, no se cambia lo guardado. "Enviar prueba (Telegram)" confirma que el aviso llega.',
        rel: ['recordatorios_no_salen'],
      },
      {
        clave: 'config_password', pregunta: '¿Cómo cambio mi contraseña?',
        corta: 'Con el botón "Contraseña" de abajo, en el menú lateral.',
        detalle: 'En el menú lateral, abajo, está el botón "Contraseña": te pide la contraseña actual y la nueva. Si no podés entrar, pedile a un admin que te la restablezca.',
        rel: [],
      },
    ],
  },
];

// Agrega lo que falte. No toca lo que ya existe. Nunca lanza.
async function sembrar() {
  try {
    const nuevas = []; // [{ clave, rel }] solo de las preguntas que se crean en esta pasada
    const idPorClave = new Map();
    for (let ci = 0; ci < CATEGORIAS.length; ci += 1) {
      const c = CATEGORIAS[ci];
      await query(
        `INSERT INTO faq_categorias (clave, nombre, icono, orden) VALUES ($1,$2,$3,$4) ON CONFLICT (clave) DO NOTHING`,
        [c.clave, c.nombre, c.icono, ci + 1]
      );
      const cat = (await query('SELECT id FROM faq_categorias WHERE clave = $1', [c.clave])).rows[0];
      for (let pi = 0; pi < c.preguntas.length; pi += 1) {
        const p = c.preguntas[pi];
        const r = await query(
          `INSERT INTO faq_preguntas (categoria_id, clave, orden, pregunta, respuesta_corta, respuesta_detallada)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (clave) DO NOTHING RETURNING id`,
          [cat.id, p.clave, pi + 1, p.pregunta, p.corta, p.detalle]
        );
        if (r.rowCount) nuevas.push({ clave: p.clave, rel: p.rel });
      }
    }
    if (nuevas.length === 0) return { agregadas: 0 };
    const todas = await query('SELECT id, clave FROM faq_preguntas WHERE clave IS NOT NULL');
    todas.rows.forEach((x) => idPorClave.set(x.clave, x.id));
    for (const n of nuevas) {
      const ids = n.rel.map((k) => idPorClave.get(k)).filter(Boolean);
      await query('UPDATE faq_preguntas SET opciones_siguientes = $2::jsonb WHERE clave = $1', [n.clave, JSON.stringify(ids)]);
    }
    console.log(`[asistente] preguntas frecuentes cargadas: ${nuevas.length}.`);
    return { agregadas: nuevas.length };
  } catch (err) {
    console.error('[asistente] no se pudieron cargar las preguntas frecuentes:', err.message);
    return { agregadas: 0, error: err.message };
  }
}

module.exports = { sembrar, CATEGORIAS };
