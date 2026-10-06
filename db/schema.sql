-- =====================================================================
-- Esquema de base de datos - Sistema Óptica (KIRO UI)
-- Motor: PostgreSQL 13+ (requiere gen_random_uuid, provisto por pgcrypto)
-- =====================================================================

-- Habilitar extensión para hashing seguro
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Usuarios / Credenciales del Sistema con roles estrictos
CREATE TABLE IF NOT EXISTS usuarios_sistema (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    rol VARCHAR(20) DEFAULT 'admin' CHECK (rol IN ('admin', 'optometrista', 'vendedor', 'agente_ia')),
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Biblioteca de Clientes / Usuarios (Con soporte JSONB para IA/Facial)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_completo VARCHAR(150) NOT NULL,
    dni VARCHAR(20) UNIQUE NOT NULL,
    obra_social VARCHAR(100),
    edad INT CHECK (edad >= 0 AND edad <= 120),
    metadatos_ia JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Fotos de Seguimiento (3 fotos por usuario)
CREATE TABLE IF NOT EXISTS fotos_usuario (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    ruta_local VARCHAR(500) NOT NULL,
    orden_foto INT CHECK (orden_foto BETWEEN 1 AND 3),
    metadatos_foto JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_usuario_orden UNIQUE (usuario_id, orden_foto)
);

-- 4. Catálogo de Marcos (Virtual Try-On)
CREATE TABLE IF NOT EXISTS marcos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre_modelo VARCHAR(100) NOT NULL,
    marca VARCHAR(80),
    material VARCHAR(50),
    color VARCHAR(50),
    ruta_imagen_png VARCHAR(500) NOT NULL,
    estilo_forma VARCHAR(50),
    -- Medidas físicas reales del marco (para escalado antropométrico)
    ancho_mm NUMERIC(5,1),   -- ancho frontal total
    alto_mm NUMERIC(5,1),    -- alto del lente
    patilla_mm NUMERIC(5,1), -- largo de la patilla
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Migración idempotente (para bases ya creadas sin estas columnas)
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ancho_mm NUMERIC(5,1);
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS alto_mm NUMERIC(5,1);
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS patilla_mm NUMERIC(5,1);
-- Vistas por ángulo (Camino B). ruta_imagen_png queda como la frontal.
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_frontal VARCHAR(500);
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_45 VARCHAR(500);
ALTER TABLE marcos ADD COLUMN IF NOT EXISTS ruta_perfil VARCHAR(500);

-- 5. Prescripciones y Graduaciones (Con validación biométrica de DIP)
CREATE TABLE IF NOT EXISTS graduaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo_lente VARCHAR(50) NOT NULL CHECK (tipo_lente IN ('Monofocal', 'Bifocal', 'Multifocal', 'Ocupacional')),
    tratamiento_vidrio VARCHAR(200),
    od_esfera NUMERIC(4,2),
    od_cilindro NUMERIC(4,2),
    od_eje INT CHECK (od_eje BETWEEN 0 AND 180),
    od_adicion NUMERIC(4,2),
    oi_esfera NUMERIC(4,2),
    oi_cilindro NUMERIC(4,2),
    oi_eje INT CHECK (oi_eje BETWEEN 0 AND 180),
    oi_adicion NUMERIC(4,2),
    distancia_interpupilar NUMERIC(4,1) CHECK (distancia_interpupilar BETWEEN 40.0 AND 80.0),
    medico_oftalmologo VARCHAR(150),
    fecha_emision DATE NOT NULL,
    datos_ocr JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Configuración de Agentes / System Prompts / Integraciones IA
CREATE TABLE IF NOT EXISTS configuracion_agentes_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre_agente VARCHAR(50) UNIQUE NOT NULL,
    modelo VARCHAR(50) NOT NULL DEFAULT 'gpt-4o',
    system_prompt TEXT NOT NULL,
    parametros JSONB DEFAULT '{"temperature": 0.2, "max_tokens": 1000}'::jsonb,
    activo BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índice secundario para búsquedas por modelo de marco
CREATE INDEX IF NOT EXISTS idx_marcos_nombre ON marcos(nombre_modelo);

-- =====================================================================
-- Trigger para mantener updated_at automáticamente
-- =====================================================================

-- Función genérica reutilizable: fija updated_at al momento del UPDATE
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

-- DROP previo para que el script sea idempotente (CREATE TRIGGER no admite
-- IF NOT EXISTS antes de PostgreSQL 14)
DROP TRIGGER IF EXISTS update_configuracion_agentes_ia_updated_at ON configuracion_agentes_ia;

CREATE TRIGGER update_configuracion_agentes_ia_updated_at
BEFORE UPDATE ON configuracion_agentes_ia
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
