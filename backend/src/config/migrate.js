// =====================================================================
// Migraciones idempotentes que corren al arrancar el servidor.
// Usan la conexión interna (DATABASE_URL) de Railway: no exponen nada.
// Solo agregan columnas si faltan (seguro de re-ejecutar).
// =====================================================================

const { query } = require('./db');

const MIGRACIONES = [
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ancho_mm NUMERIC(5,1)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS alto_mm NUMERIC(5,1)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS patilla_mm NUMERIC(5,1)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_frontal VARCHAR(500)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_45 VARCHAR(500)`,
  `ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_perfil VARCHAR(500)`,
  // Backfill: los marcos viejos usan su imagen única como vista frontal
  `UPDATE marcos SET ruta_frontal = ruta_imagen_png WHERE ruta_frontal IS NULL`,

  // --- Módulo Stock (multisucursal) ---
  `CREATE TABLE IF NOT EXISTS sucursales (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(120) NOT NULL,
     codigo VARCHAR(30) UNIQUE NOT NULL,
     direccion VARCHAR(200),
     telefono VARCHAR(50),
     activa BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `INSERT INTO sucursales (nombre, codigo, direccion)
     VALUES ('Casa Central', 'CENTRAL', 'Sucursal principal')
     ON CONFLICT (codigo) DO NOTHING`,
  `ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id)`,
  `CREATE TABLE IF NOT EXISTS productos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     codigo VARCHAR(50) UNIQUE NOT NULL,
     codigo_barras VARCHAR(80) UNIQUE,
     nombre VARCHAR(150) NOT NULL,
     categoria VARCHAR(30) NOT NULL
       CHECK (categoria IN ('armazon','cristal','lente_contacto','accesorio','otro')),
     marca VARCHAR(80),
     descripcion TEXT,
     costo_base NUMERIC(12,2) DEFAULT 0,
     margen_pct NUMERIC(6,2) DEFAULT 0,
     precio_venta NUMERIC(12,2) DEFAULT 0,
     iva_pct NUMERIC(5,2) DEFAULT 21,
     activo BOOLEAN DEFAULT TRUE,
     metadatos JSONB DEFAULT '{}'::jsonb,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre)`,
  `CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria)`,
  `CREATE TABLE IF NOT EXISTS stock_sucursal (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
     sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
     cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
     stock_minimo INT DEFAULT 0 CHECK (stock_minimo >= 0),
     ubicacion VARCHAR(80),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT unico_producto_sucursal UNIQUE (producto_id, sucursal_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_stock_sucursal ON stock_sucursal(sucursal_id)`,
  `CREATE TABLE IF NOT EXISTS movimientos_stock (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
     sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
     tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada','salida','ajuste')),
     cantidad INT NOT NULL,
     motivo VARCHAR(200),
     usuario_id UUID REFERENCES usuarios_sistema(id),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_stock(producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mov_sucursal ON movimientos_stock(sucursal_id)`,
  // Asegura la función del trigger (por si la base no la tenía)
  `CREATE OR REPLACE FUNCTION update_updated_at_column()
     RETURNS TRIGGER AS $$
     BEGIN NEW.updated_at = CURRENT_TIMESTAMP; RETURN NEW; END;
     $$ LANGUAGE 'plpgsql'`,
  `DROP TRIGGER IF EXISTS update_productos_updated_at ON productos`,
  `CREATE TRIGGER update_productos_updated_at
     BEFORE UPDATE ON productos FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()`,

  // --- Módulo TPV / Ventas + Cajas ---
  `ALTER TABLE usuarios_sistema ADD COLUMN IF NOT EXISTS comision_pct NUMERIC(5,2) DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS cajas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     usuario_apertura UUID REFERENCES usuarios_sistema(id),
     usuario_cierre UUID REFERENCES usuarios_sistema(id),
     estado VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
     monto_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
     total_efectivo NUMERIC(12,2) DEFAULT 0,
     total_tarjeta NUMERIC(12,2) DEFAULT 0,
     total_transferencia NUMERIC(12,2) DEFAULT 0,
     monto_declarado NUMERIC(12,2),
     diferencia NUMERIC(12,2),
     abierta_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     cerrada_at TIMESTAMP WITH TIME ZONE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_cajas_sucursal ON cajas(sucursal_id)`,
  `CREATE TABLE IF NOT EXISTS ventas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     caja_id UUID REFERENCES cajas(id),
     cliente_id UUID REFERENCES usuarios(id),
     vendedor_id UUID REFERENCES usuarios_sistema(id),
     estado VARCHAR(15) NOT NULL DEFAULT 'presupuesto'
       CHECK (estado IN ('presupuesto','senada','entregada','anulada')),
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     total_pagado NUMERIC(12,2) NOT NULL DEFAULT 0,
     comision_pct NUMERIC(5,2) DEFAULT 0,
     comision_monto NUMERIC(12,2) DEFAULT 0,
     stock_descontado BOOLEAN DEFAULT FALSE,
     notas TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     entregada_at TIMESTAMP WITH TIME ZONE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_ventas_sucursal ON ventas(sucursal_id)`,
  `CREATE TABLE IF NOT EXISTS venta_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
     producto_id UUID REFERENCES productos(id),
     descripcion VARCHAR(200) NOT NULL,
     cantidad INT NOT NULL CHECK (cantidad > 0),
     precio_unitario NUMERIC(12,2) NOT NULL,
     subtotal NUMERIC(12,2) NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_items_venta ON venta_items(venta_id)`,
  `CREATE TABLE IF NOT EXISTS pagos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
     caja_id UUID REFERENCES cajas(id),
     medio VARCHAR(15) NOT NULL CHECK (medio IN ('efectivo','tarjeta','transferencia')),
     monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
     es_sena BOOLEAN DEFAULT FALSE,
     usuario_id UUID REFERENCES usuarios_sistema(id),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pagos_caja ON pagos(caja_id)`,
  `CREATE TABLE IF NOT EXISTS cuenta_corriente (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     cliente_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
     venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
     tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('debito','credito')),
     monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
     detalle VARCHAR(200),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ctacte_cliente ON cuenta_corriente(cliente_id)`,

  // --- Módulo Compras / Proveedores + Laboratorios ---
  `CREATE TABLE IF NOT EXISTS proveedores (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(150) NOT NULL,
     tipo VARCHAR(20) NOT NULL DEFAULT 'proveedor' CHECK (tipo IN ('proveedor','laboratorio')),
     cuit VARCHAR(15), telefono VARCHAR(50), email VARCHAR(120), direccion VARCHAR(200),
     activo BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_proveedores_tipo ON proveedores(tipo)`,
  `CREATE TABLE IF NOT EXISTS compras (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     proveedor_id UUID REFERENCES proveedores(id),
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     nro_factura VARCHAR(50),
     estado VARCHAR(15) NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','confirmada','anulada')),
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     recalcular_precios BOOLEAN DEFAULT TRUE,
     notas TEXT,
     usuario_id UUID REFERENCES usuarios_sistema(id),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     confirmada_at TIMESTAMP WITH TIME ZONE
   )`,
  `CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id)`,
  `CREATE INDEX IF NOT EXISTS idx_compras_sucursal ON compras(sucursal_id)`,
  `CREATE TABLE IF NOT EXISTS compra_items (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
     producto_id UUID NOT NULL REFERENCES productos(id),
     cantidad INT NOT NULL CHECK (cantidad > 0),
     costo_unitario NUMERIC(12,2) NOT NULL,
     subtotal NUMERIC(12,2) NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_compraitems_compra ON compra_items(compra_id)`,
  `CREATE TABLE IF NOT EXISTS ordenes_laboratorio (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     laboratorio_id UUID REFERENCES proveedores(id),
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     cliente_id UUID REFERENCES usuarios(id),
     venta_id UUID REFERENCES ventas(id),
     descripcion TEXT NOT NULL,
     estado VARCHAR(25) NOT NULL DEFAULT 'enviado'
       CHECK (estado IN ('enviado','en_proceso','recibido_sucursal','listo_entrega','entregado')),
     fecha_estimada DATE,
     notas TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes_laboratorio(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes_laboratorio(cliente_id)`,
  `DROP TRIGGER IF EXISTS update_ordenes_lab_updated_at ON ordenes_laboratorio`,
  `CREATE TRIGGER update_ordenes_lab_updated_at
     BEFORE UPDATE ON ordenes_laboratorio FOR EACH ROW
     EXECUTE FUNCTION update_updated_at_column()`,

  // --- Módulo Fiscal (AFIP/ARCA) ---
  `CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
     tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('A','B','C','INTERNO')),
     cuit_emisor VARCHAR(15), cuit_receptor VARCHAR(15),
     punto_venta INT, numero INT,
     importe_total NUMERIC(12,2) NOT NULL DEFAULT 0,
     importe_neto NUMERIC(12,2) DEFAULT 0,
     importe_iva NUMERIC(12,2) DEFAULT 0,
     cae VARCHAR(20), cae_vencimiento DATE,
     estado VARCHAR(15) NOT NULL DEFAULT 'borrador'
       CHECK (estado IN ('borrador','simulado','autorizado','rechazado','anulado')),
     modo VARCHAR(12) NOT NULL DEFAULT 'simulacion' CHECK (modo IN ('simulacion','produccion')),
     observaciones TEXT,
     payload JSONB DEFAULT '{}'::jsonb,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comprobantes_venta ON comprobantes_fiscales(venta_id)`,
  `CREATE INDEX IF NOT EXISTS idx_comprobantes_estado ON comprobantes_fiscales(estado)`,

  // --- Módulo Notificaciones (WhatsApp / Telegram) ---
  `CREATE TABLE IF NOT EXISTS config_notificaciones (
     id INT PRIMARY KEY DEFAULT 1,
     telegram_token VARCHAR(120),
     telegram_chat_default VARCHAR(60),
     whatsapp_token VARCHAR(300),
     whatsapp_phone_id VARCHAR(60),
     alertas_activas BOOLEAN DEFAULT TRUE,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT config_unica CHECK (id = 1)
   )`,
  `INSERT INTO config_notificaciones (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS notificaciones (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     canal VARCHAR(15) NOT NULL CHECK (canal IN ('whatsapp','telegram')),
     destino VARCHAR(120),
     evento VARCHAR(40),
     mensaje TEXT NOT NULL,
     estado VARCHAR(15) NOT NULL DEFAULT 'simulado'
       CHECK (estado IN ('simulado','enviado','error')),
     detalle TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_notif_evento ON notificaciones(evento)`,
];

async function ejecutarMigraciones() {
  for (const sql of MIGRACIONES) {
    try {
      await query(sql);
    } catch (err) {
      // No bloquear el arranque por una migración; registrar y seguir.
      console.error('Migración falló (continuo):', sql, '-', err.message);
    }
  }
  console.log('Migraciones de columnas verificadas.');
}

module.exports = { ejecutarMigraciones };
