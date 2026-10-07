-- =====================================================================
-- Módulo Fiscal (AFIP/ARCA) — comprobantes asociados a ventas
-- Motor: PostgreSQL 13+. Idempotente.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
    -- Tipo de comprobante: A, B, C (factura) o INTERNO (sin CAE, modo simulación)
    tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('A','B','C','INTERNO')),
    cuit_emisor VARCHAR(15),
    cuit_receptor VARCHAR(15),
    punto_venta INT,
    numero INT,                              -- nro de comprobante AFIP (o interno)
    importe_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    importe_neto NUMERIC(12,2) DEFAULT 0,
    importe_iva NUMERIC(12,2) DEFAULT 0,
    cae VARCHAR(20),                         -- Código de Autorización Electrónico
    cae_vencimiento DATE,
    -- Estado fiscal del comprobante
    estado VARCHAR(15) NOT NULL DEFAULT 'borrador'
      CHECK (estado IN ('borrador','simulado','autorizado','rechazado','anulado')),
    modo VARCHAR(12) NOT NULL DEFAULT 'simulacion'
      CHECK (modo IN ('simulacion','produccion')),
    observaciones TEXT,                      -- mensajes de AFIP / errores
    payload JSONB DEFAULT '{}'::jsonb,       -- request/response crudos (auditoría)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comprobantes_venta ON comprobantes_fiscales(venta_id);
CREATE INDEX IF NOT EXISTS idx_comprobantes_estado ON comprobantes_fiscales(estado);
