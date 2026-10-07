-- =====================================================================
-- Módulo Compras / Proveedores + Trazabilidad B2B con laboratorios
-- Motor: PostgreSQL 13+. Idempotente.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Proveedores y laboratorios
CREATE TABLE IF NOT EXISTS proveedores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(150) NOT NULL,
    tipo VARCHAR(20) NOT NULL DEFAULT 'proveedor'
      CHECK (tipo IN ('proveedor','laboratorio')),
    cuit VARCHAR(15),
    telefono VARCHAR(50),
    email VARCHAR(120),
    direccion VARCHAR(200),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_proveedores_tipo ON proveedores(tipo);

-- 2. Compras (cabecera de factura de proveedor)
CREATE TABLE IF NOT EXISTS compras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero SERIAL,
    proveedor_id UUID REFERENCES proveedores(id),
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    nro_factura VARCHAR(50),                 -- nro de comprobante del proveedor
    estado VARCHAR(15) NOT NULL DEFAULT 'borrador'
      CHECK (estado IN ('borrador','confirmada','anulada')),
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    recalcular_precios BOOLEAN DEFAULT TRUE, -- aplicar margen y recalcular PVP
    notas TEXT,
    usuario_id UUID REFERENCES usuarios_sistema(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    confirmada_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_sucursal ON compras(sucursal_id);

-- 3. Items de la compra
CREATE TABLE IF NOT EXISTS compra_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compra_id UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
    producto_id UUID NOT NULL REFERENCES productos(id),
    cantidad INT NOT NULL CHECK (cantidad > 0),
    costo_unitario NUMERIC(12,2) NOT NULL,   -- costo al que entró
    subtotal NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compraitems_compra ON compra_items(compra_id);

-- 4. Órdenes de laboratorio (trazabilidad B2B)
CREATE TABLE IF NOT EXISTS ordenes_laboratorio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero SERIAL,
    laboratorio_id UUID REFERENCES proveedores(id),
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    cliente_id UUID REFERENCES usuarios(id),      -- paciente asociado
    venta_id UUID REFERENCES ventas(id),          -- venta/encargo que la originó
    descripcion TEXT NOT NULL,                     -- detalle del trabajo (receta, cristal, etc.)
    estado VARCHAR(25) NOT NULL DEFAULT 'enviado'
      CHECK (estado IN ('enviado','en_proceso','recibido_sucursal','listo_entrega','entregado')),
    fecha_estimada DATE,
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ordenes_estado ON ordenes_laboratorio(estado);
CREATE INDEX IF NOT EXISTS idx_ordenes_cliente ON ordenes_laboratorio(cliente_id);

-- Trigger updated_at para órdenes de laboratorio
DROP TRIGGER IF EXISTS update_ordenes_lab_updated_at ON ordenes_laboratorio;
CREATE TRIGGER update_ordenes_lab_updated_at
BEFORE UPDATE ON ordenes_laboratorio
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
