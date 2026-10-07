-- =====================================================================
-- Módulo de Stock / Inventario (multisucursal desde el día 1)
-- Motor: PostgreSQL 13+
-- Idempotente: se puede re-ejecutar sin romper nada.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Sucursales (locales)
CREATE TABLE IF NOT EXISTS sucursales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(120) NOT NULL,
    codigo VARCHAR(30) UNIQUE NOT NULL,     -- ej: 'CENTRO', 'SUC-01'
    direccion VARCHAR(200),
    telefono VARCHAR(50),
    activa BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Sucursal por defecto (para que el sistema funcione desde el inicio)
INSERT INTO sucursales (nombre, codigo, direccion)
VALUES ('Casa Central', 'CENTRAL', 'Sucursal principal')
ON CONFLICT (codigo) DO NOTHING;

-- 2. Usuarios del sistema: a qué sucursal pertenecen
ALTER TABLE usuarios_sistema
  ADD COLUMN IF NOT EXISTS sucursal_id UUID REFERENCES sucursales(id);

-- 3. Catálogo de productos (datos generales, no dependen de la sucursal)
CREATE TABLE IF NOT EXISTS productos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) UNIQUE NOT NULL,       -- SKU interno
    codigo_barras VARCHAR(80) UNIQUE,         -- EAN/UPC (opcional)
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(30) NOT NULL
      CHECK (categoria IN ('armazon', 'cristal', 'lente_contacto', 'accesorio', 'otro')),
    marca VARCHAR(80),
    descripcion TEXT,
    costo_base NUMERIC(12,2) DEFAULT 0,       -- costo del proveedor
    margen_pct NUMERIC(6,2) DEFAULT 0,        -- % de ganancia aplicado
    precio_venta NUMERIC(12,2) DEFAULT 0,     -- precio final al público
    iva_pct NUMERIC(5,2) DEFAULT 21,          -- alícuota IVA
    activo BOOLEAN DEFAULT TRUE,
    metadatos JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_productos_nombre ON productos(nombre);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria);

-- 4. Stock por sucursal (existencia de cada producto en cada local)
CREATE TABLE IF NOT EXISTS stock_sucursal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    cantidad INT NOT NULL DEFAULT 0 CHECK (cantidad >= 0),
    stock_minimo INT DEFAULT 0 CHECK (stock_minimo >= 0),  -- para alertas
    ubicacion VARCHAR(80),                                 -- estante/góndola
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unico_producto_sucursal UNIQUE (producto_id, sucursal_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_sucursal ON stock_sucursal(sucursal_id);

-- 5. Movimientos de stock (trazabilidad: entradas, salidas, ajustes)
CREATE TABLE IF NOT EXISTS movimientos_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producto_id UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
    sucursal_id UUID NOT NULL REFERENCES sucursales(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
    cantidad INT NOT NULL,                 -- + entrada / - salida (signo según tipo)
    motivo VARCHAR(200),                   -- ej: 'compra proveedor', 'venta TPV', 'rotura'
    usuario_id UUID REFERENCES usuarios_sistema(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mov_producto ON movimientos_stock(producto_id);
CREATE INDEX IF NOT EXISTS idx_mov_sucursal ON movimientos_stock(sucursal_id);

-- 6. Trigger updated_at para productos (reutiliza la función del schema base)
DROP TRIGGER IF EXISTS update_productos_updated_at ON productos;
CREATE TRIGGER update_productos_updated_at
BEFORE UPDATE ON productos
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
