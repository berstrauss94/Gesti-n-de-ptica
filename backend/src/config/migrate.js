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
  // --- Orden de la lista del laboratorio: grupos e ítems se muestran como vienen en la lista (NULL = al final, por código). ---
  `ALTER TABLE catalogo_laboratorio ADD COLUMN IF NOT EXISTS orden_lista INTEGER`,
  `UPDATE catalogo_laboratorio AS c SET orden_lista = v.o FROM (VALUES (1493, 1), (1494, 2), (1495, 3), (1496, 4), (1497, 5), (1498, 6), (1499, 7), (1500, 8), (1501, 9), (1502, 10), (1503, 11), (1504, 12), (1505, 13), (1506, 14), (1507, 15), (1508, 16), (1509, 17), (1510, 18), (1511, 19), (1512, 20), (1283, 21), (1531, 22), (1284, 23), (1285, 24), (1286, 25), (1287, 26), (1288, 27), (1289, 28), (1291, 29), (1529, 30), (1550, 31), (1292, 32), (1293, 33), (1530, 34), (1294, 35), (1309, 36), (1310, 37), (1295, 38), (1296, 39), (1390, 40), (1298, 41), (1299, 42), (1300, 43), (1520, 44), (1484, 45), (1301, 46), (1302, 47), (1303, 48), (1304, 49), (1305, 50), (1306, 51), (1307, 52), (1308, 53), (1169, 54), (1526, 55), (1172, 56), (1170, 57), (1536, 58), (1173, 59), (1174, 60), (1175, 61), (1177, 62), (1178, 63), (1179, 64), (1180, 65), (1181, 66), (1182, 67), (1183, 68), (1184, 69), (1185, 70), (1186, 71), (1187, 72), (1188, 73), (1189, 74), (1190, 75), (1201, 76), (1202, 77), (1203, 78), (1340, 79), (1341, 80), (1342, 81), (1343, 82), (1344, 83), (1345, 84), (1347, 85), (1348, 86), (1349, 87), (1350, 88), (1351, 89), (1354, 90), (1355, 91), (1356, 92), (1357, 93), (1358, 94), (1416, 95), (1417, 96), (1418, 97), (1419, 98), (1420, 99), (1421, 100), (1422, 101), (1423, 102), (1424, 103), (1425, 104), (1426, 105)) AS v(id, o) WHERE c.id = v.id AND c.orden_lista IS NULL`,
  // --- Carga inicial: bifocales (Flap Top, Kriptock, Flat Top, Invisibles). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (1532, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'PROMO Bifocal Blanco + ARMAZON ⭐', 'ARMAZON ECONOMICO', NULL, 81602, FALSE, FALSE, 106),
     (1549, '3 BIFOCALES', 'BIFOCALES Flap Top', 'Cent', 'FOTO BLUE AR PROMO', NULL, NULL, 200000, FALSE, FALSE, 107),
     (1191, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico Bco AD: 100a 300', 'Esf +-6.00 cil 4.00', 9, 72000, FALSE, FALSE, 108),
     (1192, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico BlueMax AD: 100 a 300', 'Esf +-600 cil 400', 9, 157092, FALSE, FALSE, 109),
     (1193, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico FotoMax AD: 100 a 300', 'Esf +-600 cil 400', 9, 187000, FALSE, FALSE, 110),
     (1194, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico FotoBlue AD: 100 a 300', 'Esf +-600 cil 400', 9, 216720, FALSE, FALSE, 111),
     (1195, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico Transitions AD: 100 a 300', 'Esf +-600 cil 400', 12, 689965, FALSE, FALSE, 112),
     (1196, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico Polarizado AD: 100 a 300', 'Esf +600-400 cil 400', 10, 411242, FALSE, FALSE, 113),
     (1197, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Poly Bco AD: 100 a 300', 'Esf +-600 cil 400', 10, 126893, FALSE, FALSE, 114),
     (1198, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Poly FotoMax AD: 100 a 300', 'Esf +-600 cil 400', 10, 651690, FALSE, FALSE, 115),
     (1205, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Poli Polarizado', 'Esf+-600 cil-400', 10, 591019, FALSE, FALSE, 116),
     (1227, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico Bco AD: 100a 300 URGENTE!!!', 'Esf +-6.00 cil 4.00', 2, 83776, FALSE, FALSE, 117),
     (1228, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico BlueMax AD: 100 a 300 URGENTE!!!', 'Esf +-600 cil 400', 3, 171864, FALSE, FALSE, 118),
     (1229, '3 BIFOCALES', 'BIFOCALES Flap Top', 'LENA', 'Organico FotoMax AD: 100 a 300 URGENTE!!!', 'Esf +-600 cil 400', 3, 196350, FALSE, FALSE, 119),
     (1278, '3 BIFOCALES', 'BIFOCALES KRIPTOCK', 'LENA', 'Orgánico Blanco', 'Esf +4.00 Cil -4.00', 7, 68064, FALSE, FALSE, 120),
     (72, '3 BIFOCALES', 'Flat Top', 'VIST', 'Mineral Foto', 'Add 100 a 350 +45% por un solo ojo', 7, 753349, FALSE, FALSE, 121),
     (1513, '3 BIFOCALES', 'Flat Top', 'VIST', 'Mineral Blanco', 'Add 100 a 350 +45% por un solo ojo', NULL, 380363, FALSE, FALSE, 122),
     (1514, '3 BIFOCALES', 'Flat Top', 'Cristal', 'FLAT TOP MINERAL BLANCO', NULL, NULL, 220500, FALSE, FALSE, 123),
     (1263, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Orgánico Blanco', 'RX +6.00 a -9.00', 7, 156884, FALSE, FALSE, 124),
     (1264, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Orgánico BlueMax', 'RX +6.00 a -9.00', 7, 206164, FALSE, FALSE, 125),
     (1265, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Org FotoMax', 'RX +6.00 a -9.00', 7, 351280, FALSE, FALSE, 126),
     (1266, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Org Foto BlueMax', 'RX +6.00 a -9.00', 7, 402740, FALSE, FALSE, 127),
     (1267, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Org Transitions', 'RX +6.00 a -9.00', 7, 707216, FALSE, FALSE, 128),
     (1268, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Org Polarizado', 'RX +6.00 a -3.00', 7, 385125, FALSE, FALSE, 129),
     (1269, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Org Espejado Foto', 'RX +6.00 a -9.00', 7, 526820, FALSE, FALSE, 130),
     (1270, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Poly Blanco', 'RX +6.00 a -9.00', 7, 208705, FALSE, FALSE, 131),
     (1271, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Poly BlueMax', 'RX +6.00 a -9.00', 7, 415279, FALSE, FALSE, 132),
     (1272, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Poly FotoMax', 'RX +6.00 a -9.00', 7, 578078, FALSE, FALSE, 133),
     (1273, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', 'Poly Transitions', 'RX +6.00 a -9.00', 7, 665184, FALSE, FALSE, 134),
     (1274, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', '1.67 Blanco', 'RX +6.00 a -9.00', NULL, 670919, FALSE, FALSE, 135),
     (1275, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', '1.67 BlueMax', 'RX +6.00 a -9.00', 7, 1413992, FALSE, FALSE, 136),
     (1276, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', '1.67 FotoMax', 'RX +6.00 a -9.00', NULL, 1436512, FALSE, FALSE, 137),
     (1277, '3 BIFOCALES', 'BIFOCALES INVISIBLES', 'LENA', '1.67 Transitions', 'RX +6.00 a -9.00', 7, 1150285, FALSE, FALSE, 138)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: ocupacionales (Custom, Novar, Intelligence Desk, Access, Digitime, Interview, Litoral). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (84, '4 OCUPACIONALES', 'Ocupacionales Digitales CUSTOM', 'VIST', 'ANTIAGE SUPER HD AR OFFICE 2 🤖', NULL, 4, 447850, FALSE, FALSE, 139),
     (178, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'Orgánico Blanco CERCA 🤖', NULL, 10, 250221, FALSE, FALSE, 140),
     (180, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'Orgánico Blanco CERCA AR DURAX 🤖', NULL, 10, 297805, FALSE, FALSE, 141),
     (181, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'BLUE TECH CERCA AR DURAX 🤖', NULL, 10, 379239, FALSE, FALSE, 142),
     (182, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'Policarbonato Blanco CERCA 🤖', NULL, 10, 353724, FALSE, FALSE, 143),
     (184, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'Policarbonato Blanco CERCA AR DURAX 🤖', NULL, 10, 401308, FALSE, FALSE, 144),
     (186, '4 OCUPACIONALES', 'Ocupacional Digitales NOVAR', 'VIST', 'Orgánico Blanco 1.67 CERCA AR DURAX 🤖', NULL, 10, 561896, FALSE, FALSE, 145),
     (1097, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Organico Blanco', 'Sin AR', 9, 144345, FALSE, FALSE, 146),
     (1098, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Organico BlueMax', 'Sin AR', 9, 206082, FALSE, FALSE, 147),
     (1099, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Organico FotoMax', 'Sin AR', 9, 298821, FALSE, FALSE, 148),
     (1100, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Organico Foto BlueMax', 'Sin AR', 9, 425457, FALSE, FALSE, 149),
     (1101, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Organico Transitions', 'Sin AR', 9, 556056, FALSE, FALSE, 150),
     (1102, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Poly Blanco', 'Sin AR', 9, 161937, FALSE, FALSE, 151),
     (1103, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Poly BlueMax', 'Sin AR', 9, 318438, FALSE, FALSE, 152),
     (1104, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Poly FotoMax', 'Sin AR', 9, 512595, FALSE, FALSE, 153),
     (1105, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', 'Poly Transitions', 'Sin AR', 9, 641601, FALSE, FALSE, 154),
     (1107, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.60 Blue Max', 'Sin AR', 9, 304285, FALSE, FALSE, 155),
     (1108, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.67 Blanco', 'Sin AR', 9, 266766, FALSE, FALSE, 156),
     (1109, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.67 Blue Max', 'Sin AR', 9, 371442, FALSE, FALSE, 157),
     (1110, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.67 Foto Max', 'Sin AR', 9, 605157, FALSE, FALSE, 158),
     (1111, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.67 Transitions', 'Sin AR', 9, 696513, FALSE, FALSE, 159),
     (1112, '4 OCUPACIONALES', 'INTELLIGENCE Desk', 'LENA', '1.74 Blanco', 'Sin AR', 9, 856035, FALSE, FALSE, 160),
     (1168, '4 OCUPACIONALES', 'ACCESS Linea Zeiss', 'LENA', 'Org Blanco Rx +5.00 a -4.00', 'Sin AR', 9, 168420, FALSE, FALSE, 161),
     (1402, '4 OCUPACIONALES', 'DIGITIME', 'LENA', 'Orma Blue UV', 'Sin AR', 12, 524910, FALSE, FALSE, 162),
     (1403, '4 OCUPACIONALES', 'DIGITIME', 'LENA', 'Orma Transitions', 'Sin AR', 12, 844782, FALSE, FALSE, 163),
     (1404, '4 OCUPACIONALES', 'DIGITIME', 'LENA', 'Airwear Blue UV', 'Sin AR', 12, 574122, FALSE, FALSE, 164),
     (1405, '4 OCUPACIONALES', 'DIGITIME', 'LENA', 'Airwear Transitions', 'Sin AR', 12, 1000614, FALSE, FALSE, 165),
     (1406, '4 OCUPACIONALES', 'DIGITIME', 'LENA', '1.67 Stylis Blue UV', 'Sin AR', 12, 606927, FALSE, FALSE, 166),
     (1407, '4 OCUPACIONALES', 'DIGITIME', 'LENA', '1.67 Stylis Transitions', 'Sin AR', 12, 1254870, FALSE, FALSE, 167),
     (1408, '4 OCUPACIONALES', 'INTERVIEW', 'LENA', 'Orma', 'Sin AR', 12, 242151, FALSE, FALSE, 168),
     (1409, '4 OCUPACIONALES', 'INTERVIEW', 'LENA', 'Airwear', 'Sin AR', 12, 499632, FALSE, FALSE, 169),
     (1552, '4 OCUPACIONALES', 'LITORAL', 'Cent', 'Poly Blanco', NULL, NULL, 215985, FALSE, FALSE, 170)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: progresivos (Polarys, Zeiss, Novar, Custom, Intelligence, Free View, L-N). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (86, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Orgánico Blanco', 'Add 100 a 350', 7, 257477, FALSE, FALSE, 171),
     (1523, '5 PROGRESIVOS', 'Digitales Polarys', 'LENA', 'Organico Blanco + AR ARSION 🤖', NULL, 10, 304104, FALSE, FALSE, 172),
     (1542, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Optik Polarizado', 'CR39 1.562', 4, 473303, FALSE, FALSE, 173),
     (88, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Organico BlueMax', 'Add 100 a 350', 8, 313988, FALSE, FALSE, 174),
     (87, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Orgánico Foto GENESIS', 'Add 100 a 300', 8, 394632, FALSE, FALSE, 175),
     (90, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Orgánico FotoGenesis Blue Light Cut', 'Add 100 a 350', 10, 448740, FALSE, FALSE, 176),
     (89, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'ANTIAGE SUPER HD índice 1.60', 'Add 100 a 350', 8, 549032, FALSE, FALSE, 177),
     (542, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Policarbonato Blanco', 'Add 300 a 3500', 10, 333206, FALSE, FALSE, 178),
     (544, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Polarizado', 'Add 300 a 3500', 10, 454371, FALSE, FALSE, 179),
     (1517, '5 PROGRESIVOS', 'Digitales Polarys', 'VIST', 'Blue Light Cut HD 1,60 🤖', NULL, 8, 446012, FALSE, FALSE, 180),
     (1489, '5 PROGRESIVOS', 'Convencionales CARL ZEISS', 'LENA', 'Light 3 DV 1.60 + AR DuraVision Platinum 🤖', 'Esf +10/-8.00 Cil: -6.00', 22, 1249500, FALSE, FALSE, 181),
     (1492, '5 PROGRESIVOS', 'Convencionales CARL ZEISS', 'LENA', 'Orgánico GT2 Photofusion + AR Duravision Platinum 🤖', NULL, 20, 1564500, FALSE, FALSE, 182),
     (1541, '5 PROGRESIVOS', 'Convencionales CARL ZEISS', 'LENA', 'GT2 1.50 + AR DuraVision Platinum 🤖', 'ADD: 1 a 3.5', 20, 1281000, FALSE, FALSE, 183),
     (205, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'BLUE TECH FIRST AR DURAX 🤖', NULL, 10, 501724, FALSE, FALSE, 184),
     (1524, '5 PROGRESIVOS', 'Digitales NOVAR', 'LENA', 'Organico Blanco AI-LENS AR DURAX 🤖', NULL, 12, 1161390, FALSE, FALSE, 185),
     (202, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Orgánico Foto FIRST AR DURAX 🤖', NULL, 10, 709792, FALSE, FALSE, 186),
     (194, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Orgánico Blanco PRECISA AR DURAX 🤖', NULL, 10, 528342, FALSE, FALSE, 187),
     (206, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'BLUE TECH PRECISA AR DURAX 🤖', NULL, 10, 697731, FALSE, FALSE, 188),
     (203, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Orgánico Foto PRECISA AR DURAX 🤖', NULL, 10, 1003901, FALSE, FALSE, 189),
     (195, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Orgánico Blanco EVOLUTION AR DURAX 🤖', NULL, 10, 709183, FALSE, FALSE, 190),
     (204, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Orgánico Foto EVOLUTION AR DURAX 🤖', NULL, 10, 1111753, FALSE, FALSE, 191),
     (207, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'BLUE TECH EVOLUTION AR DURAX 🤖', NULL, 10, 829871, FALSE, FALSE, 192),
     (214, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Blanco FIRST AR DURAX 🤖', NULL, 10, 529313, FALSE, FALSE, 193),
     (215, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Blanco PRECISA AR DURAX 🤖', NULL, 10, 721640, FALSE, FALSE, 194),
     (216, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Blanco EVOLUTION AR DURAX 🤖', NULL, 10, 920463, FALSE, FALSE, 195),
     (217, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Foto PRECISA 🤖', NULL, 10, 1116399, FALSE, FALSE, 196),
     (221, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Foto PRECISA AR DURAX 🤖', NULL, 10, 1211529, FALSE, FALSE, 197),
     (222, '5 PROGRESIVOS', 'Digitales NOVAR', 'VIST', 'Policarbonato Blanco EVOLUTION AR DURAX 🤖', NULL, 10, 1528418, FALSE, FALSE, 198),
     (121, '5 PROGRESIVOS', 'Digitales CUSTOM', 'VIST', 'ANTIAGE SUPER HD AR SERIAL 🤖', NULL, 4, 795149, FALSE, FALSE, 199),
     (122, '5 PROGRESIVOS', 'Digitales CUSTOM', 'VIST', 'ANTIAGE SUPER HD AR PHONE 🤖', NULL, 4, 965539, FALSE, FALSE, 200),
     (123, '5 PROGRESIVOS', 'Digitales CUSTOM', 'VIST', 'ANTIAGE SUPER HD AR PLUS 🤖', NULL, 11, 1070699, FALSE, FALSE, 201),
     (142, '5 PROGRESIVOS', 'Digitales CUSTOM', 'VIST', 'ANTIAGE SUPER HD PODIUM 🤖', 'AR PROLAYER Incluido', 12, 1192724, FALSE, FALSE, 202),
     (1055, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Blanco', 'Sin AR', 15, 472416, FALSE, FALSE, 203),
     (1056, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico BlueMax', 'Sin AR', 15, 502971, FALSE, FALSE, 204),
     (1516, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico BlueMax + AR 🤖', NULL, 16, 567471, FALSE, FALSE, 205),
     (1057, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico FotoMax', 'Sin AR', 15, 670290, FALSE, FALSE, 206),
     (1058, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Foto BlueMax', 'Sin AR', 15, 731307, FALSE, FALSE, 207),
     (1059, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Transitions', 'Sin AR', 15, 892383, FALSE, FALSE, 208),
     (1061, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Polarizado FotoMax', 'Sin AR', 15, 1040634, FALSE, FALSE, 209),
     (1060, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Polarizado', 'Sin AR', 15, 664344, FALSE, FALSE, 210),
     (1062, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Espejado', 'Sin AR', 15, 613143, FALSE, FALSE, 211),
     (1063, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Organico Espejado Foto', 'Sin AR', 15, 747753, FALSE, FALSE, 212),
     (1064, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Poly Blanco', 'Sin AR', 15, 530685, FALSE, FALSE, 213),
     (1065, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Poly BlueMax', 'Sin AR', 15, 595248, FALSE, FALSE, 214),
     (1066, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Poly FotoMax', 'Sin AR', 15, 740934, FALSE, FALSE, 215),
     (1067, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Poly Transitions', 'Sin AR', 15, 1107942, FALSE, FALSE, 216),
     (1068, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', 'Poly Polarizado', 'Sin AR', 15, 860814, FALSE, FALSE, 217),
     (1069, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.60 Blanco Blue', 'Sin AR', 15, 613143, FALSE, FALSE, 218),
     (1071, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.67 Blanco', 'Sin AR', 15, 680157, FALSE, FALSE, 219),
     (1072, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.67 Blue Max', 'Sin AR', 15, 703644, FALSE, FALSE, 220),
     (1073, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.67 Foto Max', 'Sin AR', 15, 965709, FALSE, FALSE, 221),
     (1074, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.67 Transitions', 'Sin AR', 15, 1186443, FALSE, FALSE, 222),
     (1075, '5 PROGRESIVOS', 'INTELLIGENCE HD', 'LENA', '1.74 Blanco', 'Sin AR', 15, 965709, FALSE, FALSE, 223),
     (1034, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Blanco', '2X1 (comparación con Philo)', 15, 586446, FALSE, FALSE, 224),
     (1037, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Foto BlueMax', '2X1 (comparación con Philo)', 9, 834243, FALSE, FALSE, 225),
     (1049, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.60 Antiage', '2X1 (comparación con Philo)', 9, 752259, FALSE, FALSE, 226),
     (1035, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico BlueMax', '2X1 (comparación con Philo)', 15, 641271, FALSE, FALSE, 227),
     (1036, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico FotoMax', '2X1 (comparación con Philo)', 15, 782973, FALSE, FALSE, 228),
     (1491, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Foto BlueMax', 'Sin AR', 17, 820143, FALSE, FALSE, 229),
     (1038, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Transitions', '2X1 (comparación con Philo)', 15, 968337, FALSE, FALSE, 230),
     (1039, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Polarizado', '2X1 (comparación con Philo)', 16, 734688, FALSE, FALSE, 231),
     (1040, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Polarizado Foto', '2X1 (comparación con Philo)', 16, 1350828, FALSE, FALSE, 232),
     (1041, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Espejado Azul, Plata', '2X1 (comparación con Philo)', 16, 675414, FALSE, FALSE, 233),
     (1042, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Organico Espejado Foto', '2X1 (comparación con Philo)', 16, 844269, FALSE, FALSE, 234),
     (1043, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Poly Blanco', '2X1 (comparación con Philo)', 16, 591081, FALSE, FALSE, 235),
     (1044, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Poly BlueMax', '2X1 (comparación con Philo)', 16, 640197, FALSE, FALSE, 236),
     (1045, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Poly FotoMax', '2X1 (comparación con Philo)', 16, 824184, FALSE, FALSE, 237),
     (1046, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Poly Transitions', '2X1 (comparación con Philo)', 16, 1185171, FALSE, FALSE, 238),
     (1047, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', 'Poly Polarizado', '2X1 (comparación con Philo)', 16, 927834, FALSE, FALSE, 239),
     (1048, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.60 Organico Blue', '2X1 (comparación con Philo)', 16, 685572, FALSE, FALSE, 240),
     (1051, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.67 Organico BlueMax', '2X1 (comparación con Philo)', 16, 858318, FALSE, FALSE, 241),
     (1050, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.67 Organico Blanco', '2X1 (comparación con Philo)', 16, 757998, FALSE, FALSE, 242),
     (1052, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.67 Organico FotoMax', '2X1 (comparación con Philo)', 16, 1046049, FALSE, FALSE, 243),
     (1053, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.67 Orgánico Transitions', '2X1 (comparación con Philo)', 16, 1264524, FALSE, FALSE, 244),
     (1054, '5 PROGRESIVOS', 'INTELLIGENCE CVI (PROMO 2X1)', 'LENA', '1.74 Organico Blanco', '2X1 (comparación con Philo)', 16, 1007334, FALSE, FALSE, 245),
     (1113, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Blanco Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 16, 375160, FALSE, FALSE, 246),
     (1114, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org BlueMax Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 16, 408639, FALSE, FALSE, 247),
     (1115, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org FotoMax Rx -6.00 a -9.00', '2X1 (comparación en Confort)', 16, 468201, FALSE, FALSE, 248),
     (1116, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Foto BlueMax Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 16, 580536, FALSE, FALSE, 249),
     (1117, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Transitions Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 16, 875103, FALSE, FALSE, 250),
     (1118, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Polarizado Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 16, 463641, FALSE, FALSE, 251),
     (1119, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Polarizado Foto Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 1239264, FALSE, FALSE, 252),
     (1120, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Espejado Rx +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 439779, FALSE, FALSE, 253),
     (1122, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Org Espejado Foto RX de +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 643464, FALSE, FALSE, 254),
     (1123, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Poly Blanco RX de +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 401898, FALSE, FALSE, 255),
     (1124, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Poly BlueMax RX -6.00 a -9.00', '2X1 (comparación en Confort)', 15, 530304, FALSE, FALSE, 256),
     (1125, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Poly FotoMax RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 641673, FALSE, FALSE, 257),
     (1126, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Poly Transitions RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 914382, FALSE, FALSE, 258),
     (1127, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', 'Poly Polarizado RX +6.00 a -9.00 SIN AR', '2X1 (comparación en Confort)', 15, 746706, FALSE, FALSE, 259),
     (1128, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.60 Blanco Blue RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 479493, FALSE, FALSE, 260),
     (1129, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.60 Antiage RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 488148, FALSE, FALSE, 261),
     (1130, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.67 Blanco RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 546813, FALSE, FALSE, 262),
     (1131, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.67 BlueMax RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 624459, FALSE, FALSE, 263),
     (1132, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.67 FotoMax RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 795849, FALSE, FALSE, 264),
     (1133, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.67 Transitions RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 1009785, FALSE, FALSE, 265),
     (1134, '5 PROGRESIVOS', 'FREE VIEW Style 180 2X1', 'LENA', '1.74 Blanco RX +6.00 a -9.00', '2X1 (comparación en Confort)', 15, 922161, FALSE, FALSE, 266),
     (1076, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Blanco', 'Sin AR', 15, 408072, FALSE, FALSE, 267),
     (1077, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico BlueMax', 'Sin AR', 15, 434334, FALSE, FALSE, 268),
     (1078, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico FotoMax', 'Sin AR', 15, 631248, FALSE, FALSE, 269),
     (1079, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Foto BlueMax', 'Sin AR', 15, 625461, FALSE, FALSE, 270),
     (1080, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Transitions', 'Sin AR', 15, 771624, FALSE, FALSE, 271),
     (1081, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Polarizado', 'Sin AR', 15, 571068, FALSE, FALSE, 272),
     (1082, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Polarizado Foto Azul, Plata', 'Sin AR', 15, 1203795, FALSE, FALSE, 273),
     (1083, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Espejado', 'Sin AR', 15, 534435, FALSE, FALSE, 274),
     (1084, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Organico Espejado Foto', 'Sin AR', 15, 656619, FALSE, FALSE, 275),
     (1085, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Poly Blanco', 'Sin AR', 15, 459630, FALSE, FALSE, 276),
     (1086, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Poly BlueMax', 'Sin AR', 15, 52332, FALSE, FALSE, 277),
     (1087, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Poly FotoMax', 'Sin AR', 15, 623193, FALSE, FALSE, 278),
     (1088, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Poly Transitions', 'Sin AR', 15, 963870, FALSE, FALSE, 279),
     (1089, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', 'Poly Polarizado', 'Sin AR', 15, 747078, FALSE, FALSE, 280),
     (1090, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.60 Blanco Blue', 'Sin AR', 15, 534435, FALSE, FALSE, 281),
     (1092, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.67 Blanco', 'Sin AR', 15, 577869, FALSE, FALSE, 282),
     (1093, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.67 Blue Max', 'Sin AR', 15, 660960, FALSE, FALSE, 283),
     (1094, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.67 FotoMax', 'Sin AR', 15, 830925, FALSE, FALSE, 284),
     (1095, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.67 Transitions', 'Sin AR', 15, 1032990, FALSE, FALSE, 285),
     (1096, '5 PROGRESIVOS', 'INTELLIGENCE Mobile-Sport-Drive', 'LENA', '1.74 Blanco', 'Sin AR', 15, 838476, FALSE, FALSE, 286),
     (1135, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Blanco RX +6.00 a -9.00', 'Sin AR', 15, 330186, FALSE, FALSE, 287),
     (1136, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org BlueMax RX +6.00 a -9.00', 'Sin AR', 15, 374790, FALSE, FALSE, 288),
     (1137, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org FotoMax RX +6.00 a -9.00', 'Sin AR', 15, 455049, FALSE, FALSE, 289),
     (1138, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Foto BlueMax RX +6.00 a -9.00', 'Sin AR', 15, 553776, FALSE, FALSE, 290),
     (1139, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Transitions RX +6.00 a -9.00', 'Sin AR', 15, 694089, FALSE, FALSE, 291),
     (1140, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Polarizado RX +6.00 a -9.00', 'Sin AR', 15, 473919, FALSE, FALSE, 292),
     (1141, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Polarizado Foto RX +6.00 a -9.00', 'Sin AR', 15, 1243764, FALSE, FALSE, 293),
     (1142, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Espejado RX +6.00 a -9.00', 'Sin AR', 15, 424599, FALSE, FALSE, 294),
     (1143, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Org Espejado Foto RX +6.00 a -9.00', 'Sin AR', 15, 536109, FALSE, FALSE, 295),
     (1144, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Poly Blanco RX +6.00 a -9.00', 'Sin AR', 15, 387282, FALSE, FALSE, 296),
     (1145, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Poly BlueMax RX +6.00 a -9.00', 'Sin AR', 15, 471777, FALSE, FALSE, 297),
     (1146, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Poly FotoMax RX +6.00 a -9.00', 'Sin AR', 15, 648045, FALSE, FALSE, 298),
     (1147, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Poly Transitions RX +6.00 a -9.00', 'Sin AR', 15, 943545, FALSE, FALSE, 299),
     (1148, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', 'Poly Polarizado RX +6.00 a -9.00', 'Sin AR', 15, 836325, FALSE, FALSE, 300),
     (1149, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.60 Blanco Blue RX +6.00 a -9.00', 'Sin AR', 15, 493218, FALSE, FALSE, 301),
     (1151, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.67 Blanco RX +6.00 a -9.00', 'Sin AR', 15, 493647, FALSE, FALSE, 302),
     (1152, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.67 BlueMax RX +6.00 a -9.00', 'Sin AR', 15, 621882, FALSE, FALSE, 303),
     (1153, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.67 FotoMax RX +6.00 a -9.00', 'Sin AR', 15, 814884, FALSE, FALSE, 304),
     (1154, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.67 Transitions RX +6.00 a -9.00', 'Sin AR', 15, 1200879, FALSE, FALSE, 305),
     (1155, '5 PROGRESIVOS', 'FREE VIEW Style', 'LENA', '1.74 Blanco RX +6.00 a -9.00', 'Sin AR', 15, 1007880, FALSE, FALSE, 306),
     (1156, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Org Blanco Rx +6.00 a -9.00', 'Sin AR', 15, 214566, FALSE, FALSE, 307),
     (1157, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Org BlueMax Rx +6.00 a -9.00', 'Sin AR', 15, 259110, FALSE, FALSE, 308),
     (1515, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Org BlueMax + AR Rx +6.00 a -9.00 🤖', NULL, 16, 335877, FALSE, FALSE, 309),
     (1158, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Org FotoMax Rx +6.00 a -9.00', 'Sin AR', 16, 352662, FALSE, FALSE, 310),
     (1159, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Org Transitions Rx +6.00 a -9.00', 'Sin AR', 15, 732768, FALSE, FALSE, 311),
     (1160, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Poly Blanco Rx +6.00 a -9.00', 'Sin AR', 15, 300801, FALSE, FALSE, 312),
     (1161, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Poly BlueMax Rx +6.00 a -9.00', 'Sin AR', 15, 430998, FALSE, FALSE, 313),
     (1162, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Poly FotoMax RX +6.00 a -9.00', 'Sin AR', 15, 684207, FALSE, FALSE, 314),
     (1163, '5 PROGRESIVOS', 'FREE VIEW', 'LENA', 'Poly Transitions RX +6.00 a -9.00', 'Sin AR', 15, 1098414, FALSE, FALSE, 315),
     (1394, '5 PROGRESIVOS', 'PROGRESIVOS L-N (Convencional)', 'LENA', 'Organico Blanco', NULL, 10, 131175, FALSE, FALSE, 316),
     (1395, '5 PROGRESIVOS', 'PROGRESIVOS L-N (Convencional)', 'LENA', 'Organico BlueMax', NULL, 10, 143200, FALSE, FALSE, 317),
     (1396, '5 PROGRESIVOS', 'PROGRESIVOS L-N (Convencional)', 'LENA', 'Organico FotoMax', NULL, 10, 180870, FALSE, FALSE, 318)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: progresivos Varilux (Physio 3.0, Liberty 3.0, Confort 3.0, XDesign). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (1232, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Blue UV', 'Sin AR', 15, 1581666, FALSE, FALSE, 319),
     (1233, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Blue UV con AR Crizal Forte 🤖', 'Crizal Forte', 15, 1878657, FALSE, FALSE, 320),
     (1234, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Transitions', 'Sin AR', 15, 2240850, FALSE, FALSE, 321),
     (1235, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Transitions con AR Crizal Forte 🤖', 'Crizal Forte', 15, 2536530, FALSE, FALSE, 322),
     (1238, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Xtractive', 'Sin AR', 15, 1559172, FALSE, FALSE, 323),
     (1237, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Orma Xperio', 'Sin AR', 15, 2240850, FALSE, FALSE, 324),
     (1239, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Airwear Blue UV', 'Sin AR', 15, 1719177, FALSE, FALSE, 325),
     (1240, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Airwear Transitions', 'Sin AR', 15, 2374320, FALSE, FALSE, 326),
     (1241, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Airwear Transitions con AR Crizal Forte 🤖', 'Crizal Forte', 15, 2670000, FALSE, FALSE, 327),
     (1242, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', 'Airwear Xperio', 'Sin AR', 15, 2374320, FALSE, FALSE, 328),
     (1243, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', '1.67 Stylis Blanco con AR Crizal Forte 🤖', 'Crizal Forte', 15, 2094999, FALSE, FALSE, 329),
     (1244, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', '1.67 Stylis Blue UV', 'Sin AR', 15, 1799319, FALSE, FALSE, 330),
     (1245, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', '1.67 Stylis Transitions', 'Sin AR', 15, 2455374, FALSE, FALSE, 331),
     (1246, '6 PROGRESIVOS VARILUX', 'VARILUX PHYSIO 3.0', 'LENA', '1.67 Stylis Transitions con AR Crizal Forte 🤖', 'Crizal Forte', 15, 2751054, FALSE, FALSE, 332),
     (1258, '6 PROGRESIVOS VARILUX', 'VARILUX Liberty 3.0', 'LENA', 'Orma Blue UV', 'Sin AR', 15, 1163256, FALSE, FALSE, 333),
     (1260, '6 PROGRESIVOS VARILUX', 'VARILUX Liberty 3.0', 'LENA', 'Orma Transitions', 'Sin AR', 15, 1821306, FALSE, FALSE, 334),
     (1261, '6 PROGRESIVOS VARILUX', 'VARILUX Liberty 3.0', 'LENA', 'Orma Transitions con AR Crizal Forte 🤖', 'Crizal Forte', 15, 2117160, FALSE, FALSE, 335),
     (1262, '6 PROGRESIVOS VARILUX', 'VARILUX Liberty 3.0', 'LENA', 'Orma Xperio', 'Sin AR', 15, 1821306, FALSE, FALSE, 336),
     (1428, '6 PROGRESIVOS VARILUX', 'VARILUX Liberty 3.0', 'LENA', 'Orma Blue UV con AR Crizal Forte 🤖', 'Crizal Rock', 12, 1459113, FALSE, FALSE, 337),
     (1247, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Blue UV', 'Sin AR', 15, 1293960, FALSE, FALSE, 338),
     (1248, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Blue UV con AR Crizal Forte 🤖', 'Crizal Rock', 15, 1589820, FALSE, FALSE, 339),
     (1249, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Transitions', 'Sin AR', 15, 1954692, FALSE, FALSE, 340),
     (1250, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Transitions con AR Crizal Forte 🤖', 'Crizal Rock', 15, 2250549, FALSE, FALSE, 341),
     (1251, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Xtractive', 'Sin AR', 15, 1954692, FALSE, FALSE, 342),
     (1252, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Orma Xperio', 'Sin AR', 15, 1954692, FALSE, FALSE, 343),
     (1253, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Airwear con AR Crizal Forte 🤖', 'Crizal Rock', 15, 1689648, FALSE, FALSE, 344),
     (1254, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Airwear Blue UV', 'Sin AR', 15, 1393791, FALSE, FALSE, 345),
     (1255, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Airwear Transitions', 'Sin AR', 15, 2088240, FALSE, FALSE, 346),
     (1256, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Airwear Transitions con AR Crizal Forte 🤖', 'Crizal Rock', 15, 2384091, FALSE, FALSE, 347),
     (1257, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', 'Airwear Xperio', 'Sin AR', 15, 2088237, FALSE, FALSE, 348),
     (1480, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', '1.67 Stylis Blanco con AR Crizal Forte 🤖', 'Crizal Rock', 12, 1811850, FALSE, FALSE, 349),
     (1481, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', '1.67 Stylis Blue UV', 'Sin AR', 12, 1515993, FALSE, FALSE, 350),
     (1482, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', '1.67 Stylis Transitions', 'Sin AR', 12, 2164467, FALSE, FALSE, 351),
     (1483, '6 PROGRESIVOS VARILUX', 'VARILUX CONFORT 3.0', 'LENA', '1.67 Stylis Transitions con AR Crizal Forte 🤖', 'Crizal Rock', 12, 2460321, FALSE, FALSE, 352),
     (1410, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', 'Orma Blue UV 🤖', 'Crizal Rock', 12, 1871130, FALSE, FALSE, 353),
     (1411, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', 'Orma Transitions 🤖', 'Crizal Rock', 12, 2317956, FALSE, FALSE, 354),
     (1412, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', 'Orma Xperio 🤖', 'Crizal Rock', 12, 2443959, FALSE, FALSE, 355),
     (1413, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', 'Airwear 🤖', 'Crizal Rock', 12, 2014338, FALSE, FALSE, 356),
     (1414, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', 'Airwear Transitions 🤖', 'Crizal Rock', 12, 2587161, FALSE, FALSE, 357),
     (1415, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', '1.67 Stylis Transitions 🤖', 'Crizal Rock', 12, 2085942, FALSE, FALSE, 358),
     (1427, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', '1.67 Stylis Transitions con AR Crizal Forte 🤖', 'Crizal Rock', 12, 2873577, FALSE, FALSE, 359),
     (1479, '6 PROGRESIVOS VARILUX', 'VARILUX XDESIGN', 'LENA', '1.67 Stylis Bco con AR Crizal Forte 🤖', 'Crizal Rock', 12, 2085942, FALSE, FALSE, 360)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: contactología (CooperVision, Johnson, G-Perm, esclerales, Bausch+Lomb, Alcon, prótesis). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (143, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biomedics 55 Evolutions', 'Esf. +6/-10 D14,2', 2, 156114, FALSE, FALSE, 361),
     (145, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biofinity', 'Esf. +8/-12 D 14', 2, 168683, FALSE, FALSE, 362),
     (146, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biofinity XR', 'Esf. +15/-20 D 14,5', 2, 257985, FALSE, FALSE, 363),
     (147, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biofinity TORIC', 'Esf. +8/-10 Cil -0,75/-2,25 pasos 0,50', 7, 259639, FALSE, FALSE, 364),
     (148, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biofinity TORIC XR', 'Esf. +10/-10 Cil. -225/-550 pasos 0,50', 7, 694575, FALSE, FALSE, 365),
     (149, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Biofinity Multifocal', 'Esf. +6/-8 add 1,00/2,50 pasos 0,50', 7, 256331, FALSE, FALSE, 366),
     (150, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Expressions Colors pk2', 'Verde/Jade/Azul/Gris/Hazel/Topaz/', 2, 145861, FALSE, FALSE, 367),
     (151, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Expressions Colors pk6', 'Aqua', 2, 214988, FALSE, FALSE, 368),
     (870, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'Par lentes de contacto Biomedics 55', NULL, NULL, 39000, FALSE, FALSE, 369),
     (871, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'DESIO MONOCOLOR GRIS, VERDE, MIEL, AZUL', NULL, NULL, 145861, FALSE, FALSE, 370),
     (1033, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'DESIO TRI COLOR GRIS VERDE MIEL AZUL', 'NEUTRA S Y GRADUADAS', NULL, 214988, FALSE, FALSE, 371),
     (1486, '7 CONTACTOLOGIA', 'Lentes de Contacto CooperVision', 'VIST', 'DESIO TRI COLOR DURACION 3 MESES', NULL, NULL, 79200, FALSE, FALSE, 372),
     (1361, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue Oasys pack x6', NULL, NULL, 206655, FALSE, FALSE, 373),
     (1362, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue Oasys para Astigmatismo pack x6', NULL, NULL, 276060, FALSE, FALSE, 374),
     (1364, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue Oasys Multifocal pack x6', NULL, NULL, 317190, FALSE, FALSE, 375),
     (1365, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue 2 pack x6', NULL, NULL, 216285, FALSE, FALSE, 376),
     (1366, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', '1-Day Oasys pack x30', NULL, NULL, 202395, FALSE, FALSE, 377),
     (1367, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', '1-Day Moist pack x30', NULL, NULL, 180150, FALSE, FALSE, 378),
     (1368, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue Vita pack x6', NULL, NULL, 238650, FALSE, FALSE, 379),
     (1369, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', 'Acuvue Vita para Astigmatismo pack x6', NULL, NULL, 358155, FALSE, FALSE, 380),
     (1370, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'Vito', '1-Day Moist para atigmatismo pack x30', NULL, NULL, 246030, FALSE, FALSE, 381),
     (1487, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'LENA', 'Medio Par lentes de contacto oasys', NULL, NULL, 28000, FALSE, FALSE, 382),
     (872, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'LENA', 'Par lentes de contacto oasys', NULL, NULL, 64500, FALSE, FALSE, 383),
     (1537, '7 CONTACTOLOGIA', 'Lentes de contacto Jhonson', 'LENA', 'KIT POST OPERATORIO', NULL, NULL, 36000, FALSE, FALSE, 384),
     (1458, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP PMMA', 'POR UNIDAD', 17, 160713, FALSE, FALSE, 385),
     (1459, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GO F 30', 'AZUL. (POR UNIDAD)', 17, 263250, FALSE, FALSE, 386),
     (1460, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP F30 OPTIMA', 'AZUL. (POR UNIDAD)', 17, 410963, FALSE, FALSE, 387),
     (1461, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP F50', 'POR UNIDAD', 17, 263250, FALSE, FALSE, 388),
     (1462, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP F100', 'POR UNIDAD', 17, 369883, FALSE, FALSE, 389),
     (1463, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP F100 OPTIMA UV', 'POR UNIDAD', 17, 420323, FALSE, FALSE, 390),
     (1464, '7 CONTACTOLOGIA', 'G PERM SA RIGIDAS Y GAS PERM', 'G-Pe', 'GP HYBRID', 'POR UNIDAD', 17, 392568, FALSE, FALSE, 391),
     (1222, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'VIST', 'PROTESIS STANDART', NULL, NULL, 156000, FALSE, FALSE, 392),
     (1465, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'sclearlens esfericas', 'POR UNIDAD', 17, 1281080, FALSE, FALSE, 393),
     (1466, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'sclearlens haptica torica', 'POR UNIDAD', 17, 607750, FALSE, FALSE, 394),
     (1467, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'sclearlens torica', 'POR UNIDAD', 17, 607750, FALSE, FALSE, 395),
     (1468, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'Cambio sclearlens esferica', 'POR UNIDAD', 17, 396435, FALSE, FALSE, 396),
     (1469, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'Cambio sclearlens haptica torica', 'POR UNIDAD', 17, 156200, FALSE, FALSE, 397),
     (1470, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'Cambio sclearlens torica', 'POR UNIDAD', 17, 156200, FALSE, FALSE, 398),
     (1471, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'Lente para caja de pruebas', 'POR UNIDAD', 17, 539340, FALSE, FALSE, 399),
     (1472, '7 CONTACTOLOGIA', 'RGP ESCLERALES', 'G-Pe', 'Recargo por DK200', NULL, NULL, 346275, FALSE, FALSE, 400),
     (929, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Soflens multi 6 Unid. (mensual) +0,25 a +6,00 y 0.00 a -7,00', 'Add: Low (0,75 a 1,50) y High (1,75 a 2,50)', 7, 300414, FALSE, FALSE, 401),
     (931, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Starcolors 2 Unid. (Mensual)', '0,00 (NEUTRO) Dark Green/Blue/Light Green/Gra...', 7, 136929, FALSE, FALSE, 402),
     (932, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Starcolors Graduadas (Mensual) por Unid.', 'Esf: -0,25/-6,00 -0,25 a -6,00 Dark Green/ Blue/ Light Green/...', 7, 73902, FALSE, FALSE, 403),
     (933, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Lunares Neutras (Mensual) 2 Unid.', '0,00 (Neutras) Dark Green/ Blue/ Light Blue/...', 7, 146280, FALSE, FALSE, 404),
     (934, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Lunares Graduadas (Mensual) X2', '0,00 a 5,00 (Pasos 0,25D) -5,00 a -6,00 (Paso...', 7, 154926, FALSE, FALSE, 405),
     (1008, '7 CONTACTOLOGIA', 'LENTES DE CONTACTO BAUSCH+LOMB', 'Cristal', 'Soflens 59', NULL, NULL, 55210, FALSE, FALSE, 406),
     (1371, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Air Optix Plus Hydraglyde pack x6', 'con recubrimiento de plasma', NULL, 155288, FALSE, FALSE, 407),
     (1373, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Air Optix para Astigmatismo Hydraglyde pack x6', NULL, NULL, 230975, FALSE, FALSE, 408),
     (1374, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Air Optix Multifocal Hydraglyde pack x6', 'add LO MED HI', NULL, 263125, FALSE, FALSE, 409),
     (1375, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Air Optix Colors pack x2', 'miel, verde, azul, gris tricolores (neutras/g...', NULL, 137595, FALSE, FALSE, 410),
     (1376, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Freshlook Colorblends - Neutras / Graduación pack x2', 'miel, verde, azul, gris tri colors (neutras/g...', NULL, 108062, FALSE, FALSE, 411),
     (1377, '7 CONTACTOLOGIA', 'Alcon', 'Vito', 'Dailies Aqua Comfort Plus pack x30', NULL, NULL, 103700, FALSE, FALSE, 412),
     (1429, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GPEM C', 'POR UNIDAD', 17, 211998, FALSE, FALSE, 413),
     (1430, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'MG 60', 'POR UNIDAD', 17, 342518, FALSE, FALSE, 414),
     (1431, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GPEM UF Alto Grado', '-10.25 a -20 y +6.25 a +20.00 (POR UNIDAD)', 17, 141440, FALSE, FALSE, 415),
     (1432, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GPEM UF', 'POR UNIDAD', 17, 111345, FALSE, FALSE, 416),
     (1433, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'MG 49', 'POR UNIDAD', 17, 255060, FALSE, FALSE, 417),
     (1434, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'BABY 49', 'POR UNIDAD', 17, 327860, FALSE, FALSE, 418),
     (1435, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'BABY60', 'POR UNIDAD', 17, 440765, FALSE, FALSE, 419),
     (1436, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GPEM K49', 'POR UNIDAD', 17, 661928, FALSE, FALSE, 420),
     (1437, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GPEM K60', 'POR UNIDAD', 17, 889493, FALSE, FALSE, 421),
     (1438, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'FANTASY', 'POR UNIDAD', 17, 141780, FALSE, FALSE, 422),
     (1439, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP PROT Standard', '14.50Ø CB 8.50 8.60 9.00 Diam 14.50 Pupilía Negra de...', 17, 659068, FALSE, FALSE, 423),
     (1440, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP PROT (no standard)', 'CB 8.00mm a 9.30mm Diam 14.50 a 15.00 mm Pup...', 17, 933368, FALSE, FALSE, 424),
     (1441, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP PROT (Pintadas a mano)', 'Pupilia Negra de 4.5 mm o 3.0 mm. (POR UNIDAD..', 17, 1535528, FALSE, FALSE, 425),
     (1442, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP Estenospeica', 'Esf:+/-20,00 CB: 8.00 ±3.30 mm Diam 14.50 o 15.00 mm Pup...', 17, 1535528, FALSE, FALSE, 426),
     (1443, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'COLORFUL 1 / COLORFUL 3', 'POR UNIDAD', 17, 313170, FALSE, FALSE, 427),
     (1444, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'COLORFUL S (Neutra)', 'POR UNIDAD', 17, 85963, FALSE, FALSE, 428),
     (1445, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'COLORFUL (Graduada)', 'POR UNIDAD', 17, 101465, FALSE, FALSE, 429),
     (1446, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'NATURAL COLOR', 'POR UNIDAD', 17, 125645, FALSE, FALSE, 430),
     (1447, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Excelent T', 'POR UNIDAD', 17, 399328, FALSE, FALSE, 431),
     (1448, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Excelent T2', 'POR UNIDAD', 17, 399328, FALSE, FALSE, 432),
     (1449, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'New Toric', 'POR UNIDAD', 17, 399328, FALSE, FALSE, 433),
     (1450, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Excelent T49', 'POR UNIDAD', 17, 533260, FALSE, FALSE, 434),
     (1451, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'New Toric 49', 'POR UNIDAD', 17, 533260, FALSE, FALSE, 435),
     (1452, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP TD', 'POR UNIDAD', 17, 399328, FALSE, FALSE, 436),
     (1453, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Excelent T Protesica', 'POR UNIDAD', 17, 1848633, FALSE, FALSE, 437),
     (1454, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'New Toric Protesica', 'POR UNIDAD', 17, 1213647, FALSE, FALSE, 438),
     (1455, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Excelent T1 color/Excelent T 3 colores', 'POR UNIDAD', 17, 567385, FALSE, FALSE, 439),
     (1456, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'New Toric 1 color/New Toric 3 colores', 'POR UNIDAD', 17, 500334, FALSE, FALSE, 440),
     (1457, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'GP TD 1color/GP TD 3 Color', 'POR UNIDAD', 17, 551623, FALSE, FALSE, 441),
     (1534, '7 CONTACTOLOGIA', 'G PERM BLANDAS CONVECIONALES', 'G-Pe', 'Astoric', 'POR UNIDAD', 17, 331740, FALSE, FALSE, 442),
     (1225, '7 CONTACTOLOGIA', 'PROTESIS OCULARES', 'VIST', 'Protesis Medida', 'Precio por Unidad', 15, 1804380, FALSE, FALSE, 443),
     (1226, '7 CONTACTOLOGIA', 'PROTESIS OCULARES', 'VIST', 'Protesis STD', 'Precio por Unidad', 15, 1500000, FALSE, FALSE, 444),
     (1230, '7 CONTACTOLOGIA', 'PROTESIS OCULARES', 'LENA', 'CASCARILLAS Medidas', 'Precio por Unidad', 15, 429000, FALSE, FALSE, 445),
     (1231, '7 CONTACTOLOGIA', 'PROTESIS OCULARES', 'LENA', 'CASCARILLAS STD', 'Precio por Unidad', 15, 288000, FALSE, FALSE, 446)
   ON CONFLICT (id) DO NOTHING`,
  `SELECT setval(pg_get_serial_sequence('catalogo_laboratorio', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM catalogo_laboratorio), 1))`,
  // --- Carga inicial: multipropósitos (líquidos para lentes de contacto). Solo inserta lo que falta. ---
  `INSERT INTO catalogo_laboratorio (id, categoria, subcategoria_grupo, marca_proveedor, descripcion, badge_graduacion_raw, dias_demora, precio_lista, es_servicio, es_insumo_mostrador, orden_lista)
   VALUES (1538, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'OPTI FREE EXPRES 120 ML', NULL, NULL, 22950, FALSE, FALSE, 447),
     (1539, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'OPTI FREE PURE MOIST 120 ML', NULL, NULL, 28160, FALSE, FALSE, 448),
     (1540, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'RENU 120 ML', NULL, NULL, 18025, FALSE, FALSE, 449),
     (1544, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'OPTI FREE PURE MOIST 355 ML', NULL, NULL, 39935, FALSE, FALSE, 450),
     (1545, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'AOSEP X 360 ML', NULL, NULL, 49168, FALSE, FALSE, 451),
     (1546, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'RENU 355 ML', NULL, NULL, 27625, FALSE, FALSE, 452),
     (1547, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'AVISOR 100 ML', NULL, NULL, 24150, FALSE, FALSE, 453),
     (1548, '8 MULTIPROPOSITOS-GOTAS', 'Multipropósitos', 'LENA', 'AVISOR 350 ML', NULL, NULL, 32288, FALSE, FALSE, 454)
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
