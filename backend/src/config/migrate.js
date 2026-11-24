// =====================================================================
// Migraciones idempotentes que corren al arrancar el servidor.
// Usan la conexión interna (DATABASE_URL) de Railway: no exponen nada.
// Solo agregan columnas si faltan (seguro de re-ejecutar).
// =====================================================================

const { query } = require('./db');

const MIGRACIONES = [
  // Extensión necesaria para gen_random_uuid(), crypt() y gen_salt().
  // Debe ir PRIMERO: sin ella, nada funciona (ver runner, falla fuerte).
  `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`,

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

  // --- Try-On con IA: API key de Google (opcional, se puede cargar por UI) ---
  `ALTER TABLE config_notificaciones ADD COLUMN IF NOT EXISTS gemini_api_key VARCHAR(200)`,

  // --- Config fiscal AFIP/ARCA (fila única; cargable por UI en modelo 1 óptica/instalación) ---
  `CREATE TABLE IF NOT EXISTS config_fiscal (
     id INT PRIMARY KEY DEFAULT 1,
     cuit VARCHAR(11),
     punto_venta INT NOT NULL DEFAULT 1,
     produccion BOOLEAN NOT NULL DEFAULT FALSE,
     certificado TEXT,
     clave_privada TEXT,
     razon_social VARCHAR(150),
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT config_fiscal_unica CHECK (id = 1)
   )`,
  `INSERT INTO config_fiscal (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,

  // --- Módulo Turnos / Agenda ---
  `CREATE TABLE IF NOT EXISTS turnos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     cliente_id UUID REFERENCES usuarios(id),
     profesional_id UUID REFERENCES usuarios_sistema(id),
     fecha_hora TIMESTAMP WITH TIME ZONE NOT NULL,
     motivo VARCHAR(200),
     nombre_contacto VARCHAR(150),
     telefono_contacto VARCHAR(50),
     estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
       CHECK (estado IN ('pendiente','asistio','ausente','cancelado')),
     notas TEXT,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_turnos_sucursal ON turnos(sucursal_id)`,
  `CREATE INDEX IF NOT EXISTS idx_turnos_fecha ON turnos(fecha_hora)`,

  // --- Movimientos manuales de caja (reintegros, retiros, gastos) ---
  `CREATE TABLE IF NOT EXISTS movimientos_caja (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     caja_id UUID NOT NULL REFERENCES cajas(id),
     tipo VARCHAR(15) NOT NULL CHECK (tipo IN ('ingreso','egreso')),
     medio VARCHAR(15) NOT NULL DEFAULT 'efectivo'
       CHECK (medio IN ('efectivo','tarjeta','transferencia')),
     monto NUMERIC(12,2) NOT NULL CHECK (monto > 0),
     motivo VARCHAR(200),
     usuario_id UUID REFERENCES usuarios_sistema(id),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mov_caja ON movimientos_caja(caja_id)`,

  // --- Traslados de stock entre sucursales ---
  `CREATE TABLE IF NOT EXISTS traslados_stock (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     producto_id UUID NOT NULL REFERENCES productos(id),
     origen_id UUID NOT NULL REFERENCES sucursales(id),
     destino_id UUID NOT NULL REFERENCES sucursales(id),
     cantidad INT NOT NULL CHECK (cantidad > 0),
     motivo VARCHAR(200),
     usuario_id UUID REFERENCES usuarios_sistema(id),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT origen_distinto_destino CHECK (origen_id <> destino_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_traslados_producto ON traslados_stock(producto_id)`,

  // --- Descuentos / promociones a nivel venta (TPV) ---
  // total_bruto = suma de items sin descuento; total = neto cobrado.
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS total_bruto NUMERIC(12,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_tipo VARCHAR(10) DEFAULT 'ninguno'
     CHECK (descuento_tipo IN ('ninguno','porcentaje','monto'))`,
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_valor NUMERIC(12,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_monto NUMERIC(12,2) NOT NULL DEFAULT 0`,
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento_motivo VARCHAR(120)`,

  // --- Promociones reutilizables definidas por el usuario ---
  // El comercio crea sus propios descuentos/promos y los aplica en el TPV.
  `CREATE TABLE IF NOT EXISTS promociones (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(120) NOT NULL,
     tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('porcentaje','monto')),
     valor NUMERIC(12,2) NOT NULL CHECK (valor > 0),
     activa BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_promociones_activa ON promociones(activa)`,

  // --- Obras sociales / Convenios ---
  // Cada convenio tiene un % de cobertura por defecto. En la venta se registra
  // cuánto cubre la obra social y cuánto queda a cargo del paciente.
  `CREATE TABLE IF NOT EXISTS obras_sociales (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(120) NOT NULL,
     cobertura_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (cobertura_pct >= 0 AND cobertura_pct <= 100),
     cuit VARCHAR(11),
     notas VARCHAR(200),
     activa BOOLEAN NOT NULL DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_obras_sociales_activa ON obras_sociales(activa)`,
  // En la venta: a cuánto cubre la obra social (si corresponde)
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS obra_social_id UUID REFERENCES obras_sociales(id)`,
  `ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cobertura_os NUMERIC(12,2) NOT NULL DEFAULT 0`,

  // --- Sobres / Órdenes de trabajo óptica ---
  // El "Sobre" es la orden de trabajo central de la óptica: une paciente,
  // receta (lejos + cerca, por ojo), armazón, cristal, médico, obra social
  // y fecha de entrega. Puede vincularse a una venta del TPV.
  `CREATE TABLE IF NOT EXISTS sobres (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     numero SERIAL,
     sucursal_id UUID NOT NULL REFERENCES sucursales(id),
     cliente_id UUID REFERENCES usuarios(id),
     venta_id UUID REFERENCES ventas(id) ON DELETE SET NULL,
     obra_social_id UUID REFERENCES obras_sociales(id),
     medico VARCHAR(150),
     fecha_receta DATE,
     fecha_entrega DATE,
     estado VARCHAR(15) NOT NULL DEFAULT 'pendiente'
       CHECK (estado IN ('pendiente','reserva','en_taller','entregado','anulado')),
     -- Receta LEJOS (por ojo): esfera, cilindro, eje, adición, prisma, base, diámetro
     lejos_od_esf NUMERIC(5,2), lejos_od_cil NUMERIC(5,2), lejos_od_eje INT CHECK (lejos_od_eje BETWEEN 0 AND 180),
     lejos_od_add NUMERIC(5,2), lejos_od_prisma NUMERIC(5,2), lejos_od_base VARCHAR(10), lejos_od_diam NUMERIC(5,2),
     lejos_oi_esf NUMERIC(5,2), lejos_oi_cil NUMERIC(5,2), lejos_oi_eje INT CHECK (lejos_oi_eje BETWEEN 0 AND 180),
     lejos_oi_add NUMERIC(5,2), lejos_oi_prisma NUMERIC(5,2), lejos_oi_base VARCHAR(10), lejos_oi_diam NUMERIC(5,2),
     -- Receta CERCA (por ojo)
     cerca_od_esf NUMERIC(5,2), cerca_od_cil NUMERIC(5,2), cerca_od_eje INT CHECK (cerca_od_eje BETWEEN 0 AND 180),
     cerca_od_prisma NUMERIC(5,2), cerca_od_base VARCHAR(10), cerca_od_diam NUMERIC(5,2),
     cerca_oi_esf NUMERIC(5,2), cerca_oi_cil NUMERIC(5,2), cerca_oi_eje INT CHECK (cerca_oi_eje BETWEEN 0 AND 180),
     cerca_oi_prisma NUMERIC(5,2), cerca_oi_base VARCHAR(10), cerca_oi_diam NUMERIC(5,2),
     dip NUMERIC(5,1),
     -- Productos y descripción libre
     armazon_producto_id UUID REFERENCES productos(id),
     armazon_descripcion VARCHAR(200),
     cristal_descripcion VARCHAR(200),
     notas TEXT,
     total NUMERIC(12,2) NOT NULL DEFAULT 0,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  // Fase 3: los estados (incluidos 'lentes' y 'listo') se validan en
  // sobresController (ESTADOS). Se quita el CHECK de la base: es la única
  // excepción a "solo agregar", permitida por nombre en verificarMigraciones.
  `ALTER TABLE sobres DROP CONSTRAINT IF EXISTS sobres_estado_check`,
  `CREATE INDEX IF NOT EXISTS idx_sobres_cliente ON sobres(cliente_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sobres_estado ON sobres(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_sobres_sucursal ON sobres(sucursal_id)`,

  // --- Campos avanzados de armazón/producto (filtros tipo Optix) ---
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS genero VARCHAR(15)`,
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS material VARCHAR(40)`,
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS ubicacion VARCHAR(40)`,

  // --- Catálogo de mercado enriquecido con IA (agente Gemini + búsqueda) ---
  // Guarda specs técnicas de modelos de anteojos obtenidas por el agente.
  // UNIQUE (marca, modelo) habilita el ON CONFLICT del upsert.
  `CREATE TABLE IF NOT EXISTS mercado_catalogo (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     marca VARCHAR(120) NOT NULL,
     modelo VARCHAR(120) NOT NULL,
     tipo VARCHAR(40),
     estilo VARCHAR(40),
     genero VARCHAR(20),
     material VARCHAR(40),
     calibre_ancho INT,
     puente INT,
     patilla INT,
     altura_cristal INT,
     colores JSONB DEFAULT '[]'::jsonb,
     tratamientos JSONB DEFAULT '[]'::jsonb,
     aptitud_graduacion BOOLEAN DEFAULT TRUE,
     metadata JSONB DEFAULT '{}'::jsonb,
     actualizado_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     CONSTRAINT mercado_catalogo_marca_modelo_unico UNIQUE (marca, modelo)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_mercado_marca ON mercado_catalogo(marca)`,
  // Búsqueda de caché sin distinguir mayúsculas (misma definición que db/schema.sql)
  `CREATE INDEX IF NOT EXISTS idx_mercado_marca_modelo_lower
     ON mercado_catalogo (LOWER(marca), LOWER(modelo))`,
  // Búsqueda parcial / tolerante a errores de tipeo (pg_trgm). Cada sentencia
  // va por separado: si la extensión no está disponible, la migración registra
  // el error y sigue, y la app cae a ILIKE.
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE INDEX IF NOT EXISTS idx_mercado_marca_trgm
     ON mercado_catalogo USING gin (marca gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_mercado_modelo_trgm
     ON mercado_catalogo USING gin (modelo gin_trgm_ops)`,

  // --- Sobres tipo Optix (Etapa 1) ---
  // Médicos como entidad (se conserva sobres.medico en texto para los sobres viejos).
  `CREATE TABLE IF NOT EXISTS medicos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     nombre VARCHAR(150) NOT NULL,
     matricula VARCHAR(50),
     activo BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  // Una columna por sentencia: si una falla, las demás se crean igual.
  // armazon_producto_id (ya existente) es el armazón de LEJOS.
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS medico_id UUID REFERENCES medicos(id)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS cerca_od_deg NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS cerca_oi_deg NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS lejos_od_cbase NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS lejos_oi_cbase NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS cerca_od_cbase NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS cerca_oi_cbase NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS armazon_cerca_producto_id UUID REFERENCES productos(id)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS armazon_cerca_es_propio BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS armazon_lejos_es_propio BOOLEAN DEFAULT FALSE`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS dnp_od NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS dnp_oi NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS ap_od NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS ap_oi NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_vertical NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_horizontal NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_diagonal NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_puente NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_distancia_vertice NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_ff NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_pantoscopico NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS arm_angulo_facial NUMERIC(5,2)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS laboratorio_id UUID REFERENCES proveedores(id)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS orden_laboratorio_id UUID REFERENCES ordenes_laboratorio(id)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS codigo_pedido_garantia VARCHAR(100)`,
  `ALTER TABLE sobres ADD COLUMN IF NOT EXISTS observacion_lab TEXT`,
  // Sub-tablas (se usan desde la Etapa 2: ítems adicionales y pagos).
  `CREATE TABLE IF NOT EXISTS sobre_items_adicionales (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     sobre_id UUID NOT NULL REFERENCES sobres(id) ON DELETE CASCADE,
     producto_id UUID REFERENCES productos(id),
     descripcion VARCHAR(200) NOT NULL,
     dias_demora INT DEFAULT 0,
     precio NUMERIC(12,2) NOT NULL CHECK (precio >= 0)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sobre_items_sobre_id ON sobre_items_adicionales(sobre_id)`,
  `CREATE TABLE IF NOT EXISTS sobre_pagos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     sobre_id UUID NOT NULL REFERENCES sobres(id) ON DELETE CASCADE,
     caja_movimiento_id UUID,
     venta_id UUID REFERENCES ventas(id),
     fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     detalle VARCHAR(150),
     importe NUMERIC(12,2) NOT NULL CHECK (importe > 0),
     medio_pago VARCHAR(50) NOT NULL CHECK (medio_pago IN
       ('Efectivo','Tarjeta de Credito','Tarjeta de Debito','Q.R.','Transferencia','Cuenta Corriente'))
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sobre_pagos_sobre_id ON sobre_pagos(sobre_id)`,

  // --- Filtros de inventario tipo Optix ---
  // genero / material / ubicacion ya existen en productos (más arriba); la API
  // expone productos.ubicacion como "ubicacion_prod". Acá solo se suma el proveedor.
  `ALTER TABLE productos ADD COLUMN IF NOT EXISTS proveedor_id UUID REFERENCES proveedores(id)`,
  `CREATE INDEX IF NOT EXISTS idx_productos_proveedor ON productos(proveedor_id)`,
  // Búsqueda parcial/tolerante a errores de tipeo en Stock. La expresión debe ser
  // IDÉNTICA a BUSQUEDA_PRODUCTO de stockController.js para que se use el índice.
  // (pg_trgm ya se crea en la sección de Mercado.)
  `CREATE INDEX IF NOT EXISTS idx_productos_busqueda_trgm ON productos USING gin
     ((COALESCE(nombre, '') || ' ' || COALESCE(codigo, '') || ' ' || COALESCE(codigo_barras, '') || ' ' || COALESCE(marca, '')) gin_trgm_ops)`,
  // --- Catálogo de lentes y servicios de laboratorio ("Lentes y otros") ---
  `CREATE TABLE IF NOT EXISTS catalogo_laboratorio (
     id SERIAL PRIMARY KEY,
     categoria VARCHAR(100) NOT NULL,
     subcategoria_grupo VARCHAR(100),
     marca_proveedor VARCHAR(100),
     descripcion VARCHAR(255) NOT NULL,
     esfera_min NUMERIC(5,2),
     esfera_max NUMERIC(5,2),
     cilindro_min NUMERIC(5,2),
     cilindro_max NUMERIC(5,2),
     badge_graduacion_raw VARCHAR(150),
     dias_demora INTEGER DEFAULT 2,
     precio_lista NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (precio_lista >= 0),
     es_servicio BOOLEAN DEFAULT FALSE,
     es_insumo_mostrador BOOLEAN DEFAULT FALSE,
     activo BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_catalogo_lab_categoria ON catalogo_laboratorio (LOWER(categoria))`,
  `CREATE INDEX IF NOT EXISTS idx_catalogo_lab_marca ON catalogo_laboratorio (LOWER(marca_proveedor))`,
  // --- Recordatorios automáticos de turnos / controles (WhatsApp) ---
  `ALTER TABLE config_notificaciones ADD COLUMN IF NOT EXISTS whatsapp_plantilla VARCHAR(100)`,
  `ALTER TABLE config_notificaciones ADD COLUMN IF NOT EXISTS whatsapp_idioma VARCHAR(10) DEFAULT 'es_AR'`,
  `CREATE TABLE IF NOT EXISTS recordatorios_turnos (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     turno_id UUID REFERENCES turnos(id) ON DELETE CASCADE,
     usuario_id UUID REFERENCES usuarios(id) ON DELETE CASCADE,
     sucursal_id UUID REFERENCES sucursales(id) ON DELETE CASCADE,
     nombre_destino VARCHAR(150),
     telefono_destino VARCHAR(30) NOT NULL,
     fecha_evento DATE NOT NULL,
     fecha_programada TIMESTAMP WITH TIME ZONE NOT NULL,
     anticipacion_tipo VARCHAR(20) NOT NULL
       CHECK (anticipacion_tipo IN ('1_mes','2_semanas','1_semana','4_dias','personalizado')),
     dias_antes INTEGER CHECK (dias_antes IS NULL OR dias_antes BETWEEN 1 AND 365),
     mensaje_personalizado TEXT NOT NULL,
     canal VARCHAR(20) NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','telegram')),
     estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
       CHECK (estado IN ('pendiente','enviando','enviado','fallido','cancelado')),
     intentos INTEGER NOT NULL DEFAULT 0,
     ultimo_error TEXT,
     reclamado_at TIMESTAMP WITH TIME ZONE,
     enviado_at TIMESTAMP WITH TIME ZONE,
     creado_por UUID REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_recordatorios_estado_fecha ON recordatorios_turnos (estado, fecha_programada)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_recordatorio_en_cola ON recordatorios_turnos (telefono_destino, fecha_evento, fecha_programada, canal) WHERE estado IN ('pendiente','enviando')`,
  // --- Asistente virtual de ayuda (preguntas frecuentes + historial de consultas) ---
  `CREATE TABLE IF NOT EXISTS faq_categorias (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     clave VARCHAR(60),
     nombre VARCHAR(100) NOT NULL,
     icono VARCHAR(50),
     orden INT DEFAULT 0
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_categorias_clave ON faq_categorias (clave)`,
  `CREATE TABLE IF NOT EXISTS faq_preguntas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     categoria_id UUID REFERENCES faq_categorias(id) ON DELETE CASCADE,
     clave VARCHAR(60),
     orden INT DEFAULT 0,
     pregunta TEXT NOT NULL,
     respuesta_corta TEXT NOT NULL,
     respuesta_detallada TEXT,
     opciones_siguientes JSONB DEFAULT '[]'::jsonb,
     activo BOOLEAN DEFAULT TRUE
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_faq_preguntas_clave ON faq_preguntas (clave)`,
  `CREATE INDEX IF NOT EXISTS idx_faq_preguntas_categoria ON faq_preguntas (categoria_id)`,
  `CREATE TABLE IF NOT EXISTS asistente_consultas (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     usuario_id UUID REFERENCES usuarios_sistema(id) ON DELETE SET NULL,
     consulta_manual TEXT NOT NULL,
     respuesta_otorgada TEXT NOT NULL,
     fuente VARCHAR(20) CHECK (fuente IN ('opcion_multiple','ia_gemini','busqueda_local')),
     valoracion INT CHECK (valoracion IN (1, -1)),
     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
   )`,
  `CREATE INDEX IF NOT EXISTS idx_asistente_consultas_fecha ON asistente_consultas (created_at DESC)`,
  `UPDATE faq_preguntas SET respuesta_corta = 'Por seguridad la contraseña no se cambia desde el sistema: pedísela al administrador.', respuesta_detallada = 'Por seguridad la contraseña no se cambia desde el sistema. Si necesitás cambiarla o la olvidaste, consultá con el administrador y él te la restablece.' WHERE clave = 'config_password'`,
  // --- Carga inicial: control de miopía (Myofix / Myolens, Novar). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, dias_demora, precio_lista, es_servicio, es_insumo_mostrador)
   VALUES (1493, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Organico BLUE-TECH AR DURAX', NULL, 457253, FALSE, FALSE),
     (1494, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Policarbonato Blanco', NULL, 416708, FALSE, FALSE),
     (1495, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Policarbonato Blanco AR DURAX', NULL, 489913, FALSE, FALSE),
     (1496, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Stylis 1.67 blanco AR DURAX', NULL, 655869, FALSE, FALSE),
     (1497, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Organico Fotosensible', NULL, 556684, FALSE, FALSE),
     (1498, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Organico Fotosensible AR DURAX', NULL, 629889, FALSE, FALSE),
     (1499, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Policarbonato Fotosensible', NULL, 714155, FALSE, FALSE),
     (1500, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Policarbonato Fotosensible AR DURAX', NULL, 787360, FALSE, FALSE),
     (1501, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Organico blanco', NULL, 335056, FALSE, FALSE),
     (1502, '0 CONTROL DE MIOPÍA', 'MYOFIX Novar para el Control', 'Novar', 'Organico blanco AR DURAX', NULL, 408261, FALSE, FALSE),
     (1503, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Organico Blanco', NULL, 191597, FALSE, FALSE),
     (1504, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Organico blanco AR DURAX', NULL, 229663, FALSE, FALSE),
     (1505, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Organico BLUE-TECH AR DURAX', NULL, 257224, FALSE, FALSE),
     (1506, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Organico Fotosensible', NULL, 358953, FALSE, FALSE),
     (1507, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Organico Fotosensible AR DURAX', NULL, 397019, FALSE, FALSE),
     (1508, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Policarbonato Blanco', NULL, 237532, FALSE, FALSE),
     (1509, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Policarbonato Blanco AR DURAX', NULL, 275598, FALSE, FALSE),
     (1510, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Policarbonato Fotosensible', NULL, 458208, FALSE, FALSE),
     (1511, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Policarbonato Fotosensible AR DURAX', NULL, 496274, FALSE, FALSE),
     (1512, '0 CONTROL DE MIOPÍA', 'MYOLENS Novar para el Confort', 'Novar', 'Stylis 1.67 blanco AR DURAX', NULL, 310049, FALSE, FALSE)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: monofocales (stock blancas, stock con AR, stock fotocromáticas, laboratorio). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador)
   VALUES (1283, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Orgánico Blanco', 'Esf.+6.00/-4.00 Cil -2.00', 5, 21500, FALSE, FALSE),
     (1531, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'PROMO Organico Blanco + ARMAZON ⭐', 'Solamente graduaciones de stock', NULL, 28932, FALSE, FALSE),
     (1284, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Orgánico R/Extendida', 'Esf.+/-4.00 Cil: +4.00/-4.00 · Esf +4.00/-4.00 Cil +4.00/-4.00', 5, 28000, FALSE, FALSE),
     (1285, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Poly Blanco', 'Esf.+6.00/-4.00 Cil -2.00', 5, 42990, FALSE, FALSE),
     (1286, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Solares', 'Neutro', 5, 47814, FALSE, FALSE),
     (1287, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Solares Espejado', 'Neutros: Plata/Oro/Azul/Rojo/Verde/Púrpura', 5, 66625, FALSE, FALSE),
     (1288, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Polarizado', 'Neutros Gris, Sepia y G15 - Base 6 y 8', 5, 60800, FALSE, FALSE),
     (1289, '1 MONOFOCALES', 'Mono Lentes de Stock Blancas', 'LENA', 'Mineral Blanco Esferico', 'Esf. al 6.00', 5, 206000, FALSE, FALSE),
     (1291, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Organico AR 🤖', 'Esf.+6.00/-4.00 Cil -2.00', 2, 42900, FALSE, FALSE),
     (1529, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Organico BlueMax 🤖', 'Esf+6.00/-6.00 Cil -2.00', 2, 58900, FALSE, FALSE),
     (1550, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'Cent', 'BLUE + AR CRIZAL 2x1', NULL, NULL, 217800, FALSE, FALSE),
     (1292, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Organico R/Ext con AR 🤖', '+4.00 -4.00 y -4.00 -4.00', 5, 62000, FALSE, FALSE),
     (1293, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'PROMO Org BLUE AR + Armazon ⭐🤖', 'Esf: +/-4,00 Cil: -2,00/+2,00 · Esf: -8,00/+6,00', 2, 55000, FALSE, FALSE),
     (1530, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Organico BIO BLUE + AR 🤖', 'Esf+6.00/-8.00 Cil -2.00', 2, 58900, FALSE, FALSE),
     (1294, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Organico BIO BLUE R/Ext + AR 🤖', 'Esf.+4.00/-4.00 Cil -4.00 combinados +4.25 a...', 5, 86500, FALSE, FALSE),
     (1309, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'GAMA Blue Light Cut. AR Triple layer 🤖', 'Esf. +/-6 Comb. Esf. +/-4 Cil.+2', 3, 85090, FALSE, FALSE),
     (1310, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'GAMA Blue Light Cut. AR Triple layer R-Ext 🤖', 'Esf +4.00/-4.00 Cil -4.00', 5, 115200, FALSE, FALSE),
     (1295, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Poly AR 🤖', 'Esf.+6.00/-4.00 Cil -2.00', 5, 64400, FALSE, FALSE),
     (1296, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'Poly BlueMax AR 🤖', 'Esf.+6.00/-2.00 Cil -4.00', 5, 138450, FALSE, FALSE),
     (1390, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'VIST', 'ANTIAGE HD AR 🤖', 'Esf. +/- 6.00 combinados Esf. +4.00/-6.00 Cil...', 2, 177786, FALSE, FALSE),
     (1298, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'VIST', 'ANTIAGE HD R/EXT AR 🤖', 'Esf.+4.00/-4.00 Cil -4.00', 5, 223453, FALSE, FALSE),
     (1299, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'HD BIO 1.61 AR 🤖', 'Esf +4.00/-8.00 Cil -2.00', 5, 114124, FALSE, FALSE),
     (1300, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'HD BIO 1.61 R/Ext AR 🤖', 'Esf +6.00/-10.00/-2.00/f -8.00/-3.00', 5, 156000, FALSE, FALSE),
     (1520, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'LENA', 'HD BIO 1.67 R/Ext 🤖', 'Esférico hasta -16 Combinado hasta -12.00-2...', 7, 191440, FALSE, FALSE),
     (1484, '1 MONOFOCALES', 'Mono Lentes de Stock con AR', 'VIST', 'Stylis 1.67 Blue R/Ext 🤖', 'CIL: -4.00 ESF: -16.00 ESF: -12.00 CIL: -2.0...', 8, 193000, FALSE, FALSE),
     (1301, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Organico Foto AR 🤖', 'Esf +6.00// +4.00/-4.00 Cil -2.00', 5, 93000, FALSE, FALSE),
     (1302, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Organico Foto R/Ext AR 🤖', 'Esf +4.00/-4.00 y -4.00/-4.00', 5, 158152, FALSE, FALSE),
     (1303, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Organico Foto BlueMax 🤖', 'Esf +4.00/-4.00 Cil -2.00', 5, 172488, FALSE, FALSE),
     (1304, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Organico Transitions', 'Esf +4.00/-2.00 Cil -2.00', 5, 343000, FALSE, FALSE),
     (1305, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Organico Foto Espejado', 'Neutro (Plata, Oro, Azul, Rojo)', 5, 167577, FALSE, FALSE),
     (1306, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Poly FotoMax 🤖', 'Esf +2.00/-6.00 Cil -2.00', 5, 228774, FALSE, FALSE),
     (1307, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Mineral Foto Esferico', 'Esf +/- 4.00', 5, 323837, FALSE, FALSE),
     (1308, '1 MONOFOCALES', 'Mono Lentes de Stock Fotocromaticas', 'LENA', 'Mineral Foto Cilindrico', 'esf +/-4.00 Cil -2.00', 5, 192080, FALSE, FALSE),
     (1169, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico Blanco D58', 'Esf: +6,25/+10,00 Esf: -6,25/-10,00 Esf: +/-10,00 Cil: -2,25/-6,00 (10% de recargo por cada grado de prisma)', 10, 80305, FALSE, FALSE),
     (1526, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico BlueMax', '+-800/-1000 cil -800 (10% de recargo por cada...', 9, 115215, FALSE, FALSE),
     (1172, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico BlueMax AR 🤖', 'Esf +8.00/-1.00 cil -8.00', 10, 224280, FALSE, FALSE),
     (1170, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico Polarizado', '+-800/400', 9, 223590, FALSE, FALSE),
     (1536, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'FOTO COLORS - Fotocromáticos con colores', 'PURPURA, ROSADO, AZUL, MARRON, VERDE', 10, 321060, FALSE, FALSE),
     (1173, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico FotoMax (CONSULTAR BASES LAB)', 'Esf +8.00/-10.00 cil -8.00', 10, 153260, FALSE, FALSE),
     (1174, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico Foto BlueMax', 'Esf +8.00/-10.00 cil -8.00', 10, 192908, FALSE, FALSE),
     (1175, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico Transitions', 'Esf +7.00/-13.00 cil -4.00', 10, 460000, FALSE, FALSE),
     (1177, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Mineral Blanco', 'Esf +8.00/-4.00', 10, 129900, FALSE, FALSE),
     (1178, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Poly Blanco D70', 'Esf +8.00/-10.00 cil -4.00', 10, 92069, FALSE, FALSE),
     (1179, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Poly BlueMax', 'Esf +8.00/-10.00 cil -4.00', 10, 141603, FALSE, FALSE),
     (1180, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Poly FotoMax', 'Esf +3.00/-12.00 cil -4.00', 10, 242034, FALSE, FALSE),
     (1181, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Poly Transitions', 'Esf +8.00/-12.00 cil -4.00', 10, 581301, FALSE, FALSE),
     (1182, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice HD 1.61 Blue', 'Esf +3.00/-12.00 cil -4.00', 10, 236850, FALSE, FALSE),
     (1183, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'ANTIAGE HD AR', 'Esf +3.00/-12.00 cil -4.00', 10, 411600, FALSE, FALSE),
     (1184, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice Org. Bco. XT 1.67', 'Esf +8.00/-14.00 cil -4.00', 10, 209748, FALSE, FALSE),
     (1185, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice XT 1.67 BlueMax', 'Esf +3.00/-14.00 cil -4.00', 10, 235171, FALSE, FALSE),
     (1186, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice XT 1.67 FotoMax', 'Esf +8.00/-14.00 cil -4.00', 10, 362823, FALSE, FALSE),
     (1187, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice Stylis 1.67 Bco', 'Esf +8.00/-14.00 cil -4.00', 10, 263988, FALSE, FALSE),
     (1188, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice Stylis 1.67 Blue Max', 'Esf +8.00/-14.00 cil -4.00', 10, 282500, FALSE, FALSE),
     (1189, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice Stylis 1.67 Transitions', 'Esf +8.00/-14.00 cil -4.00', 10, 720102, FALSE, FALSE),
     (1190, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Alto Indice ND 1.74', 'Esf +18.00/-14.00 cil -4.00', 10, 606003, FALSE, FALSE),
     (1201, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Organico Aclimates', '+700-1300/400', 12, 304385, FALSE, FALSE),
     (1202, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Poli Polarizado', '+800-1200/400', 12, 319543, FALSE, FALSE),
     (1203, '1 MONOFOCALES', 'Mono Laboratorio', 'LENA', 'Mineral Fotocromatico', '+-800/400', 9, 260943, FALSE, FALSE)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: monofocal digital (Intelligence Digital, Eyezen, Myopilux Plus). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador)
   VALUES (1340, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico blanco 🤖', 'Rx +1200 a -1000', 9, 117714, FALSE, FALSE),
     (1341, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico BlueMax 🤖', 'Rx +1200 a -1000', 9, 171210, FALSE, FALSE),
     (1342, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico FotoMax 🤖', 'Rx +1200 a -1000', 9, 221607, FALSE, FALSE),
     (1343, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico Foto BlueMax 🤖', 'Rx +1200 a -1000', 9, 272151, FALSE, FALSE),
     (1344, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico Transitions 🤖', 'Rx +1200 a -1000', 9, 481890, FALSE, FALSE),
     (1345, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Organico Polarizado 🤖', 'Rx +1200 a -1000', 9, 284166, FALSE, FALSE),
     (1347, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Poly Blanco 🤖', 'Rx +1100 a -1500', 9, 163290, FALSE, FALSE),
     (1348, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Poly BlueMax 🤖', 'Rx +900 a -1200', 9, 241041, FALSE, FALSE),
     (1349, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Poly FotoMax 🤖', 'Rx +900 a -1200', 9, 648783, FALSE, FALSE),
     (1350, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Poly Transitions 🤖', 'Rx +900 a -1200', 9, 903408, FALSE, FALSE),
     (1351, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', 'Poly Polarizado 🤖', 'Rx +900 a -1200', 9, 526977, FALSE, FALSE),
     (1354, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', '1.67 Organico Blanco 🤖', 'Rx +1000 a -1000', 9, 287697, FALSE, FALSE),
     (1355, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', '1.67 Blue Max 🤖', 'Rx +1000 a -1000', 9, 311322, FALSE, FALSE),
     (1356, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', '1.67 Foto Max 🤖', 'Rx +1000 a -1000', 9, 435438, FALSE, FALSE),
     (1357, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', '1.67 Transitions 🤖', 'Rx +1000 a -1000', 9, 925302, FALSE, FALSE),
     (1358, '2 MONOFOCAL DIGITAL', 'Monofocal Intelligence Digital', 'LENA', '1.74 Blanco 🤖', 'Rx +1000 a -1000', 9, 846030, FALSE, FALSE),
     (1416, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', 'Orma Blue UV', 'Sin AR', 12, 299517, FALSE, FALSE),
     (1417, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', 'Orma Transitions Gris', 'Sin AR', 12, 780318, FALSE, FALSE),
     (1418, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', 'Orma Transitions Cafe', 'Sin AR', 12, 961602, FALSE, FALSE),
     (1419, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', 'Airwear Blue UV', 'Sin AR', 12, 299517, FALSE, FALSE),
     (1420, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', 'Airwear Transitions', 'Sin AR', 12, 867021, FALSE, FALSE),
     (1421, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', '1.67 Stylis Blue UV', 'Sin AR', 12, 512325, FALSE, FALSE),
     (1422, '2 MONOFOCAL DIGITAL', 'EYEZEN', 'LENA', '1.67 Transitions', 'Sin AR', 12, 1332054, FALSE, FALSE),
     (1423, '2 MONOFOCAL DIGITAL', 'MYOPILUX-PLUS', 'LENA', 'Airwear Blue UV', 'Sin AR', 12, 559620, FALSE, FALSE),
     (1424, '2 MONOFOCAL DIGITAL', 'MYOPILUX-PLUS', 'LENA', 'Airwear Transitions', 'Sin AR', 12, 867021, FALSE, FALSE),
     (1425, '2 MONOFOCAL DIGITAL', 'MYOPILUX-PLUS', 'LENA', '1.67 Stylis Blue UV', 'Sin AR', 12, 717261, FALSE, FALSE),
     (1426, '2 MONOFOCAL DIGITAL', 'MYOPILUX-PLUS', 'LENA', '1.67 Stylis Transitions', 'Sin AR', 12, 1300524, FALSE, FALSE)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
];

// `ejecutar` permite reutilizar las mismas migraciones desde otro cliente
// (p. ej. db/init-remoto.js). Por defecto usa el pool del servidor.
async function ejecutarMigraciones(ejecutar = query) {
  for (let i = 0; i < MIGRACIONES.length; i += 1) {
    const sql = MIGRACIONES[i];
    try {
      await ejecutar(sql);
    } catch (err) {
      // La primera migración (CREATE EXTENSION pgcrypto) es CRÍTICA: sin ella
      // fallan los UUID y el hashing. Avisar fuerte para no quedar con un
      // servidor "arriba" pero inservible.
      if (i === 0) {
        console.error(
          '\n*** MIGRACIÓN CRÍTICA FALLIDA: no se pudo habilitar pgcrypto. ' +
          'La base no funcionará correctamente. ***\n', err.message
        );
      } else {
        // El resto son idempotentes (IF NOT EXISTS): registrar y seguir.
        console.error('Migración falló (continuo):', sql, '-', err.message);
      }
    }
  }
  console.log('Migraciones de columnas verificadas.');
}

module.exports = { ejecutarMigraciones, MIGRACIONES };
