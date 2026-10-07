-- =====================================================================
-- Módulo TPV / Ventas + Cajas (multisucursal)
-- Motor: PostgreSQL 13+. Idempotente.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Comisión del vendedor (regla 1): % fijo por usuario
ALTER TABLE usuarios_sistema
  ADD COLUMN IF NOT EXISTS comision_pct NUMERIC(5,2) DEFAULT 0;

-- 1. Cajas (sesiones de caja por sucursal)
CREATE TABLE IF NOT EXISTS cajas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    usuario_apertura UUID REFERENCES usuarios_sistema(id),
    usuario_cierre UUID REFERENCES usuarios_sistema(id),
    estado VARCHAR(10) NOT NULL DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
    monto_inicial NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Totales de cierre por medio de pago (se calculan al cerrar)
    total_efectivo NUMERIC(12,2) DEFAULT 0,
    total_tarjeta NUMERIC(12,2) DEFAULT 0,
    total_transferencia NUMERIC(12,2) DEFAULT 0,
    monto_declarado NUMERIC(12,2),     -- lo que el cajero cuenta físicamente
    diferencia NUMERIC(12,2),          -- declarado - esperado
    abierta_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    cerrada_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_cajas_sucursal ON cajas(sucursal_id);

-- 2. Ventas (cabecera / orden)
CREATE TABLE IF NOT EXISTS ventas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero SERIAL,                                   -- correlativo legible
    sucursal_id UUID NOT NULL REFERENCES sucursales(id),
    caja_id UUID REFERENCES cajas(id),
    cliente_id UUID REFERENCES usuarios(id),         -- cliente (para cta cte)
    vendedor_id UUID REFERENCES usuarios_sistema(id),-- para comisión
    estado VARCHAR(15) NOT NULL DEFAULT 'presupuesto'
      CHECK (estado IN ('presupuesto','senada','entregada','anulada')),
    total NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_pagado NUMERIC(12,2) NOT NULL DEFAULT 0,   -- señas + pagos acumulados
    comision_pct NUMERIC(5,2) DEFAULT 0,             -- snapshot del % al entregar
    comision_monto NUMERIC(12,2) DEFAULT 0,
    stock_descontado BOOLEAN DEFAULT FALSE,          -- regla 3: se marca al entregar
    notas TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    entregada_at TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON ventas(estado);
CREATE INDEX IF NOT EXISTS idx_ventas_sucursal ON ventas(sucursal_id);

-- 3. Items de la venta
CREATE TABLE IF NOT EXISTS venta_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    producto_id UUID REFERENCES productos(id),
    descripcion VARCHAR(200) NOT NULL,   -- snapshot del nombre (por si cambia)
    cantidad INT NOT NULL CHECK (cantidad > 0),
    precio_unitario NUMERIC(12,2) NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_venta ON venta_items(venta_id);

-- 4. Pagos (una venta puede tener varios: seña + saldo)
CREATE TABLE IF NOT EXISTS pagos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
    caja_id UUID REFERENCES cajas(id),
    medio VARCHAR(15) NOT NULL CHECK (medio IN ('efectivo','tarjeta','transferencia')),
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    es_sena BOOLEAN DEFAULT FALSE,
    usuario_id UUID REFERENCES usuarios_sistema(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pagos_venta ON pagos(venta_id);
CREATE INDEX IF NOT EXISTS idx_pagos_caja ON pagos(caja_id);

-- 5. Cuenta corriente (movimientos de saldo por cliente)
CREATE TABLE IF NOT EXISTS cuenta_corriente (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('debito','credito')), -- debito=debe, credito=paga
    monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
    detalle VARCHAR(200),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_ctacte_cliente ON cuenta_corriente(cliente_id);
