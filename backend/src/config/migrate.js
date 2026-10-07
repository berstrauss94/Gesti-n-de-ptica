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
