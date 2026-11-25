# Arquitectura del Sistema — Óptica / Centro de Contactología

> Documento vivo. Describe **todo** lo que compone el sistema: tecnologías, nube,
> despliegue, módulos, API, accesos, datos, integraciones y automatizaciones.
>
> **Regla de mantenimiento:** cada vez que se agregue o modifique una
> funcionalidad (una "adhesión"), este documento debe actualizarse en el mismo
> cambio. Hay un hook de Kiro (`.kiro/hooks/sync-arquitectura-doc.json`) que lo
> recuerda automáticamente. Al final está el **Registro de cambios**.

_Última actualización: 2026-10-24 (Médicos: lista completa A a Z)_

---

## 1. Qué es

ERP web completo para una óptica/centro de contactología: clientes y recetas,
catálogo de armazones con prueba virtual (incluida IA), inventario multisucursal,
punto de venta con caja, compras y laboratorio, facturación, agenda de turnos y
notificaciones. Desplegado y funcionando en la nube como un único servicio.

- **Repositorio:** GitHub `berstrauss94/Gesti-n-de-ptica`, rama `main`.
- **Producción:** https://web-production-98afa.up.railway.app

---

## 2. Tecnologías (con qué está programado)

### Backend
- **Node.js** (≥18) + **Express 4**. JavaScript CommonJS.
- Librerías: `pg` (PostgreSQL), `jsonwebtoken` (JWT), `multer` (uploads),
  `sharp` (imágenes), `cors`, `dotenv`.

### Frontend
- **React 18** + **Vite 5**. JavaScript + JSX (ES Modules).
- Librerías: `react-router-dom` 7, `axios`, `lucide-react`,
  `@mediapipe/tasks-vision` (detección facial del Try-On).
- Estilos: CSS plano propio (`styles.css`), paleta fucsia/antracita. Sin framework de UI.

### Base de datos
- **PostgreSQL** con extensión **pgcrypto** (UUID `gen_random_uuid`, bcrypt vía `crypt()`).

---

## 3. Nube y despliegue

- **Plataforma: Railway**, desplegando **desde GitHub** (push a `main` → redeploy automático).
- **Arquitectura: monolito.** Express sirve a la vez: API (`/api/*`), imágenes
  subidas (`/uploads/*`) y el build del frontend (`frontend/dist`). Un dominio, sin CORS cruzado.
- **Arranque** (`package.json` raíz + `Procfile`):
  - `postinstall`: instala backend + frontend y corre `vite build`.
  - `start` / `Procfile` (`web: npm start --prefix backend`): levanta Express.
  - `server.js` ejecuta **migraciones idempotentes** y abre el pool de PostgreSQL al arrancar.
- **Base de datos en la nube:** plugin **PostgreSQL de Railway** (`DATABASE_URL`), con SSL en producción.
- **Persistencia de archivos:** filesystem efímero → **Volumen persistente** en `/data/uploads`
  (`UPLOAD_DIR`). Alternativa para escalar: S3/Cloudinary.
- **Healthcheck:** `GET /health` → `{"status":"ok"}`.

### Variables de entorno (`backend/src/config/env.js`)
Obligatorias: `DATABASE_URL`, `JWT_SECRET`. Otras: `DB_SSL`, `JWT_EXPIRES_IN` (8h),
`CORS_ORIGIN`, `UPLOAD_DIR`, `SERVE_FRONTEND`, `NODE_ENV`, y las de integraciones
(`AFIP_CUIT/CERT/KEY/PUNTO_VENTA/PRODUCCION`, `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`,
`GEMINI_TEXT_MODEL`). Los modelos de Gemini se cambian por variable de entorno, sin tocar código.

---

## 4. Estructura del monorepo

```
Optica/
├─ package.json        # scripts del monorepo
├─ Procfile            # proceso web (Railway)
├─ DEPLOY.md           # guía de despliegue
├─ ARQUITECTURA.md     # este documento
├─ backend/src/
│  ├─ app.js           # middlewares + rutas + SPA fallback
│  ├─ server.js        # arranque, migraciones, cierre ordenado
│  ├─ config/          # env, db (pool), paths, migrate
│  ├─ controllers/     # controllers por módulo
│  ├─ routes/          # routers por módulo
│  ├─ middlewares/     # auth (JWT + roles), upload (multer)
│  └─ services/        # afip, notificaciones, tryon IA
├─ frontend/src/
│  ├─ api/             # wrappers HTTP (axios)
│  ├─ pages/           # páginas
│  ├─ components/      # Layout, Modal, InfoBtn, ProtectedRoute, tryon/*
│  ├─ context/         # AuthContext
│  ├─ hooks/           # useEsAdmin, useFaceLandmarker, useImage
│  └─ styles.css
├─ db/                 # esquemas SQL por módulo + seed admin
├─ scripts/            # utilidades de preparación de imágenes (sharp)
└─ .kiro/              # configuración del agente (steering + hooks)
```

---

## 5. Módulos funcionales

| Módulo | Qué hace |
|---|---|
| **Autenticación** | Login JWT, `me`, cambio de contraseña (bcrypt dentro de Postgres). El botón de cambio de contraseña se quitó de la interfaz: el personal la pide al administrador. El endpoint `POST /auth/cambiar-password` sigue existiendo pero no tiene pantalla. |
| **Dashboard** | KPIs reales: ventas y cobros del día, cajas abiertas, stock bajo mínimo, turnos de hoy, presupuestos abiertos. Filtrable por sucursal. |
| **Clientes/Pacientes** | CRUD, fotos de seguimiento (hasta 3), graduaciones/recetas anidadas. |
| **Marcos (catálogo)** | CRUD de armazones con 3 vistas (frontal/45°/perfil) en PNG transparente. |
| **Virtual Try-On** | Superposición 2D con escalado antropométrico (DIP + MediaPipe) + composición realista con IA (Gemini). |
| **Stock / Inventario** | Multisucursal: existencias, movimientos, alta y edición con género/material/ubicación/proveedor, búsqueda parcial tolerante a errores de tipeo, filtros por marca/género/material/ubicación/proveedor, paginado (20/50/100/todos), recálculo de precios, traslados entre sucursales, export CSV, impresión de etiquetas con código de barras (Code128), **importación de listas de precios de proveedor por CSV**. |
| **TPV / Ventas** | Caja (apertura/cierre con arqueo), ventas, pagos, señas, entrega, anulación, reintegros/retiros de caja, cuenta corriente, **descuentos/promociones por venta**. |
| **Promociones / Descuentos** | El comercio crea sus propios descuentos (porcentaje o monto), los activa/desactiva y los aplica en el TPV. |
| **Obras sociales / Convenios** | Alta de convenios con % de cobertura por defecto; en el TPV se aplica la cobertura y el total refleja lo que paga el paciente. Gestión en Configuración (admin). |
| **Sobres / Órdenes de trabajo** | Orden central de la óptica: paciente + receta completa (lejos/cerca por ojo, con esfera/cilindro/eje/adición/prisma/base/diámetro) + C.Base y DEG por ojo + armazón de lejos y de cerca (del stock o del cliente) + cristal + médico (entidad propia) + obra social + antropometría (DIP, DNP y altura pupilar por ojo) + cotas del armazón + laboratorio + fecha de entrega; estados pendiente/reserva/en taller/entregado/anulado. Consola de dos columnas para crear y editar, con calculadoras de transposición y de adición. Etapa 2: lente de lejos y de cerca elegidos del catálogo "Lentes y otros" (modal con solapas), precios de lente y armazón, servicios/insumos/accesorios ("Otros"), descuento en % o $, recargo, pagos y saldo calculados en vivo; el total ya no se carga a mano. |
| **Comisiones** | Reporte del acumulado de comisiones por vendedor en un período (ventas entregadas), con resumen y detalle. Solo admin. |
| **Catálogo de Mercado** | Modelos que NO están en el local, enriquecidos con IA (Gemini + búsqueda web): marca, modelo, estilo, material, género, medidas, colores, tratamientos y aptitud de graduación. Página `/mercado` con buscador y filtros; alta por IA solo admin. |
| **Compras** | Proveedores, laboratorios, compras (confirmar impacta stock/costos), órdenes de laboratorio, **exportación contable CITI Compras (AFIP) por período**. |
| **Turnos / Agenda** | Alta de turnos, filtro por rango, estados (asistió/ausente/cancelado). |
| **Fiscal (AFIP/ARCA)** | Comprobantes A/B/C/interno con numeración correlativa y QR oficial; modo real listo para activar con certificado. |
| **Notificaciones** | Telegram y WhatsApp (Meta Cloud API) reales, con historial y config. |
| **Recordatorios** | Avisos automáticos por WhatsApp para que el cliente vuelva a su control (1 mes, 2 semanas, 1 semana, 4 días antes, o días a elección), con el mensaje del doctor. |
| **Asistente de ayuda** | Botón flotante rosa (viñeta con "?" blanco) en la esquina inferior derecha que abre un panel de chat: preguntas frecuentes por tema, consulta escrita y, si no hay respuesta guardada, IA (Gemini); todo queda registrado y se puede valorar. |
| **Configuración** | Tokens de integraciones + panel de estado de integraciones. Solo admin. |

**Scripts auxiliares (`scripts/`):** preparación de imágenes con `sharp` (recortar
lentes, quitar fondo, 3 vistas de marcos, logo). No corren en producción.

---

## 6. API (todo bajo `/api`, protegido por JWT salvo login)

- **Auth:** `POST /auth/login` (público), `GET /auth/me`, `POST /auth/cambiar-password`.
- **Dashboard:** `GET /dashboard/resumen`.
- **Clientes:** CRUD `/usuarios` + fotos y graduaciones anidadas.
- **Marcos:** CRUD `/marcos` (subida multiparte de 3 vistas).
- **Try-On IA:** `GET /tryon-ia/estado`, `POST /tryon-ia/generar`.
- **Lentes y otros** (`/lentes`, tabla `catalogo_laboratorio`): `GET /laboratorio/catalogo?categoria=&q=` (cualquier usuario; búsqueda parcial por palabras en descripción, grupo, marca e id, `categoria` sin distinguir mayúsculas), `GET /laboratorio/categorias` (cantidad por categoría), `POST /laboratorio/validar-receta` (`{cristal_id, esfera?, cilindro?}` → `{valid, alertas, dias_demora}`; acepta coma decimal), `PUT /laboratorio/actualizacion-masiva` (admin; `{porcentaje, categoria? | marca_proveedor? | todo, simular?}`; porcentaje entre -90 y 500, redondea a 2 decimales, sin filtro exige `todo: true`, `simular` solo informa el efecto) y `POST /laboratorio/importar` (admin; upsert por `id` asignado, una fila con error no corta el resto, una celda vacía no pisa lo guardado). Categorías fijas "0 CONTROL DE MIOPÍA" … "11 LENTES DE SOL" (`laboratorioController.CATEGORIAS`, el import normaliza "monofocales" → "1 MONOFOCALES").
- **Subidas (Cloudinary):** `POST /uploads/tryon` (multipart, campo `imagen`, JPEG/PNG/WEBP hasta 5 MB; se guarda como WebP en la carpeta `optix_tryon` y devuelve `{url, public_id}`). Sin credenciales responde `409 sin_credenciales`. Solo para imágenes nuevas del Try-On: las fotos de `fotosController` siguen en disco local. Servicio: `services/storageService.js`.
- **Estados de sobres:** `pendiente, reserva, en_taller, lentes, listo, entregado, anulado`. Se validan solo en `sobresController.ESTADOS` (la base ya no tiene CHECK).
- **Mercado:** `POST /mercado/:id/producto` (admin; pasa un modelo de `mercado_catalogo` a `productos` como armazón con sus medidas en `metadatos`, idempotente por `metadatos.mercado_id`, y si `cantidad > 0` deja un pedido simulado = compra en `borrador`; el stock no cambia hasta confirmar esa compra en Compras), `GET /mercado/predict-attributes?marca=` (cualquier usuario; sin IA ni costo: devuelve `{predictions:{genero,material}|null, fuente}` con lo más frecuente en `productos` de esa marca y, si falta, en `mercado_catalogo`; marca de menos de 2 letras → `predictions:null`, más de 120 → 400), `GET /mercado?q=` (cualquier usuario; texto parcial por ILIKE y, si no hay
  resultados, por similitud con `pg_trgm`), `POST /mercado/enriquecer` (admin; body
  `{marca?, modelo?, forzar?}`: alcanza con la marca, el modelo o ambos, completos o parciales,
  mínimo 2 letras). Busca primero en la base (exacta → parcial → similitud si es un solo campo)
  y responde `200` con `cache: true` y `coincidencia` (`exacto|parcial|similar`) sin consultar a
  Gemini. Si no hay coincidencia (o `forzar: true`) consulta a la IA, que resuelve la marca/modelo
  oficial más probable o devuelve `no_identificado` (400), y responde `201` con `coincidencia: "ia"`.
- **Stock:** `/sucursales`, `/productos`, `POST /productos/importar` (admin, lista de precios CSV; empareja por `codigo` y, si no hay, por `codigo_barras`; un producto nuevo exige `codigo`; acepta además `genero`, `material`, `ubicacion` y `proveedor` por nombre o `proveedor_id`; celda vacía no borra; cada fila en su propio SAVEPOINT, así una fila con error no corta la importación), `/stock` (filtros `categoria`, `modelo` = texto parcial en nombre, código o código de barras (si no hay resultados y tiene 3+ letras, reintenta por parecido, igual que `q`), `marca`, `genero`, `material`, `ubicacion_prod`, `proveedor_id`; devuelve `total` y `parecidos`; `limit` hasta 1000), `/stock/marcas`, `GET /stock/filtros` (opciones de los desplegables), movimientos, `/traslados`.
- **TPV:** `/cajas/*` (actual/abrir/cerrar/movimientos), `/ventas/*` (acepta `descuento` al crear), pagos, entregar, anular, `/cuenta-corriente/:id`.
- **Promociones:** `GET /promociones`, `POST /promociones` (admin), `PATCH /promociones/:id` (admin), `DELETE /promociones/:id` (admin).
- **Obras sociales:** `GET /obras-sociales`, `POST /obras-sociales` (admin), `PUT /obras-sociales/:id` (admin), `DELETE /obras-sociales/:id` (admin).
- **Sobres:** `GET /sobres`, `POST /sobres`, `GET /sobres/:id`, `PUT /sobres/:id`, `PATCH /sobres/:id/estado`, `DELETE /sobres/:id`. Las lecturas devuelven además los nombres de médico, armazones (lejos/cerca) y laboratorio; los errores de datos (referencia inexistente, número inválido, eje fuera de rango) responden 400 con mensaje claro. `GET /sobres/:id` (y las respuestas de alta/edición) incluyen `items`, `pagos` y `totales` (subtotal_lejos, subtotal_cerca, total_otros, subtotal, descuento, recargo, total, pagado, saldo). `POST`/`PUT` aceptan `lente_lejos_id/descripcion/precio`, `lente_cerca_*`, `armazon_lejos_precio`, `armazon_cerca_precio`, `descuento_tipo` (`porcentaje`|`monto`|vacío), `descuento_valor`, `recargo`, `items[]` y `pagos[]` (estos dos reemplazan los anteriores, en una transacción); si llega alguno, el servidor recalcula `sobres.total` con `services/sobreTotales.js`. Los pagos todavía no generan movimiento de caja.
- **Médicos:** `GET /medicos?activos=&q=` y `POST /medicos` (cualquier usuario: alta rápida desde el sobre o el cliente; `{ nombre, matricula?, especialidad? }`; si ya existe el mismo nombre + matrícula responde 409 con ese médico), `PUT /medicos/:id`, `DELETE /medicos/:id` (admin; si el médico ya figura en sobres se desactiva en lugar de borrarse).
- **Comisiones:** `GET /comisiones` (admin; filtros desde/hasta/sucursal/vendedor).
- **Stock:** el listado acepta además filtros `genero`, `material`, `ubicacion_prod` (columna `productos.ubicacion`) y `proveedor_id`. `q` busca cada palabra por separado (tienen que aparecer todas) en nombre + código + código de barras + marca (índice trigram `idx_productos_busqueda_trgm`); si no hay resultados y `q` tiene 3+ letras, reintenta por parecido (`word_similarity`) y responde `parecidos: true`. `POST/PUT /productos` aceptan `genero` (Hombre/Mujer/Unisex/Niño), `material`, `ubicacion` (hasta 40) y `proveedor_id`.
- **Compras:** `/proveedores`, `/compras`, `/ordenes-laboratorio`, `GET /compras-citi?periodo=YYYY-MM` (admin, descarga .txt).
- **Fiscal:** `/fiscal/estado`, `GET/PUT /fiscal/config` (admin; config AFIP sin exponer cert/clave), `/fiscal/emitir`, `/fiscal/comprobantes`.
- **Notificaciones:** `/notificaciones/config` (ahora también `whatsapp_plantilla`, `whatsapp_idioma` y `whatsapp_listo`; valida el nombre de plantilla `[a-z0-9_]` y el idioma `es_AR`), `/notificaciones`, `/notificaciones/prueba`.
- **Recordatorios** (`/recordatorios` en el front, `recordatoriosController`): `POST /notificaciones/recordatorios` (`{nombre, telefono, fecha_evento, anticipaciones: ['1_mes','2_semanas','1_semana','4_dias'], dias_personalizados: [n], mensaje?, canal?, turno_id?, cliente_id?, sucursal_id?}`; crea un aviso por anticipación, a las 10:00 de Argentina; los avisos cuya fecha ya pasó se informan en `omitidos` y no se crean; repetir lo mismo no duplica; con `turno_id` toma nombre, teléfono y fecha del turno; el mensaje admite `{nombre}`, `{fecha}`, `{local}`), `GET /notificaciones/recordatorios?estado=`, `PATCH /notificaciones/recordatorios/:id/cancelar` y `POST /notificaciones/recordatorios/procesar` (admin: corre la cola ahora). Teléfonos de Argentina se normalizan a `549…` (`recordatoriosUtil.normalizarTelefono`).
- **Asistente** (`asistenteController`): `GET /asistente/opciones` (menú de categorías y preguntas activas), `POST /asistente/consultar` (`{preguntaId}` responde con lo guardado y devuelve las preguntas relacionadas; `{consultaManual}` hasta 500 caracteres busca primero por parecido, `word_similarity > 0.4`, y solo si no hay coincidencia consulta a Gemini; límite de 15 consultas a la IA por usuario cada 10 minutos, 429 al pasarse), `POST /asistente/valorar` (`{consulta_id, valoracion: 1|-1}`, solo sobre consultas propias) y `GET /asistente/consultas` (admin, filtros `valoracion` y `fuente`).
- **Health:** `GET /health`.

Fuera de `/api`: fallback SPA (sirve `index.html`).

---

## 7. Accesos y seguridad

Control en **dos capas**:

- **Backend** (`middlewares/auth.js`): `authRequired` (valida token, inyecta
  `req.user {id, usuario, rol}`) y `requireRole('admin')` para acciones sensibles
  (anular venta, eliminar cliente/producto, sucursales/proveedores, confirmar
  compra, recalcular precios, crear traslados, guardar tokens).
- **Frontend:** `AuthContext` (token+usuario en localStorage), `ProtectedRoute`
  (redirige a login sin sesión), `client.js` (inyecta JWT; 401 → logout+redirect;
  403 → mensaje claro), `useEsAdmin()` (oculta en UI lo que el backend bloquea).

**Credenciales:** bcrypt coste 12 **dentro de Postgres** (`crypt()`/`gen_salt('bf',12)`);
el backend nunca ve el hash en claro. Login con mensaje genérico. Los tokens de
integraciones NO se devuelven al frontend (solo flags `_configurado`).

---

## 8. Modelo de datos (PostgreSQL)

~22 tablas con UUID y CHECKs, en `db/*.sql` y `backend/src/config/migrate.js` (idempotente):
- **Operación:** `usuarios_sistema` (operadores), `usuarios` (clientes), `sucursales`.
- **Stock:** `productos`, `stock_sucursal`, `movimientos_stock`, `traslados_stock`.
- **TPV:** `cajas`, `ventas` (con `total_bruto`/`descuento_*`/`obra_social_id`/`cobertura_os`), `venta_items`, `pagos`, `cuenta_corriente`, `movimientos_caja`, `promociones`, `obras_sociales`.
- **Compras:** `proveedores`, `compras`, `compra_items`, `ordenes_laboratorio`.
- **Fiscal/avisos/agenda:** `comprobantes_fiscales` (con `payload` JSONB para el QR),
  `config_fiscal` (CUIT/punto de venta/certificado/clave, fila única),
  `config_notificaciones`, `notificaciones`, `turnos`, `recordatorios_turnos`, `faq_categorias`, `faq_preguntas`, `asistente_consultas`, `graduaciones`, `sobres`
  (receta lejos/cerca por ojo), fotos. `productos` tiene además `genero`/`material`/`ubicacion`.

Operaciones críticas (traslados, cierre de caja, confirmar compra) usan
**transacciones con `FOR UPDATE`**.

---

## 9. Integraciones externas

Patrón común: **degradan a modo seguro si falta la credencial, nunca frenan la operación.**

- **AFIP/ARCA** (`afipService.js`): sin certificado → comprobante interno formal
  (numeración correlativa + QR oficial, sin CAE). Con certificado → `autorizarReal`
  cableado (WSAA + WSFEv1), listo para activar en homologación. La config fiscal
  (CUIT, punto de venta, certificado, clave) se resuelve por env **o** desde la
  tabla `config_fiscal`, cargable desde Configuración. **Modelo A: una instalación
  por óptica**, cada óptica carga su propio certificado AFIP y sus credenciales.
- **Try-On IA** (`tryonIAService.js`): composición foto+armazón vía **Google Gemini**
  (`gemini-2.5-flash-image`, configurable con `GEMINI_IMAGE_MODEL`). Sin key → superposición 2D gratis.
- **Agente Mercado** (`mercadoGeminiService.js`): cadena de modelos con `googleSearch`:
  `GEMINI_TEXT_MODEL` (default `gemini-3.8-flash`) y luego `GEMINI_TEXT_FALLBACKS` (default
  `gemini-flash-latest,gemini-2.5-flash`). Escala al siguiente SOLO ante 404 (modelo retirado) o
  429 (sin cuota); otros errores (clave inválida) cortan. Recuerda el último modelo que respondió
  bien y lo prueba primero. Si todos fallan no escribe en la base. Devuelve specs en JSON y hace
  upsert en `mercado_catalogo`.
- **Notificaciones** (`notificacionesService.js`): **Telegram real** (Bot API) y
  **WhatsApp real** (Meta Cloud API v21, `enviarWhatsApp`): con `whatsapp_plantilla` manda una
  plantilla aprobada con el texto en la variable `{{1}}` (única forma de escribirle primero a un
  cliente); sin plantilla manda texto libre, que solo llega si el cliente escribió en las últimas
  24 h. Eventos registrados como `enviado`/`simulado`/`error`.
- **Programador de recordatorios** (`reminderScheduler.js`, arranca en `server.js` después de las
  migraciones): cada 5 minutos toma de `recordatorios_turnos` los avisos que ya tocan
  (`FOR UPDATE SKIP LOCKED`, seguro con varias instancias) y los manda. Si las alertas están
  desactivadas o faltan credenciales, los deja pendientes. Si falla reintenta 3 veces (cada 30 min) y
  queda `fallido` con el motivo; si ya pasó la fecha del control se cancela solo; un aviso que quedó
  `enviando` por un corte vuelve a la cola a los 15 min. Los avisos salen a las 10:00 de Argentina.
  Las credenciales son globales (una fila en `config_notificaciones`), no por sucursal.
- **Asistente de ayuda** (`services/faqSeed.js`, `mercadoGeminiService.generarTexto`): las preguntas frecuentes iniciales se cargan al arrancar (después de las migraciones) y solo se agregan las que faltan, identificadas por `clave`: nunca pisan lo que ya esté en la base. La IA usa la misma clave y la misma cadena de modelos con respaldo que Mercado, con un contexto fijo del sistema (no inventa pantallas ni da consejos médicos) y la consulta del usuario tratada como dato. `asistente_consultas.usuario_id` apunta a `usuarios_sistema` (quien consulta es el personal, no el cliente).

---

## 10. IA, agentes y automatizaciones

**IA dentro del producto:**
- **Try-On generativo con Gemini** (composición realista del armazón sobre la foto).
- **Detección facial con MediaPipe** (modelo de visión en el navegador para escalar el marco).
- No es un sistema multiagente: es IA generativa puntual + un modelo de visión local.

**Automatizaciones de desarrollo (Kiro, en `.kiro/`, NO forman parte del producto):**
- **Steering** (`.kiro/steering/ui-reglas-secciones.md`): regla de UI (InfoBtn
  obligatorio, mapa de z-index, capas, sombras).
- **Steering** (`.kiro/steering/system-evolver.md`): documentación sincronizada, reglas de
  migraciones, cómo cambiar modelos de Gemini y despliegue seguro.
- **Hooks** (`.kiro/hooks/`):
  - `anim-sequence-rules.json`: mantiene la secuencia/tiempos de animación.
  - `info-btn-rules.json`: recuerda el InfoBtn en cada sección.
  - `sync-arquitectura-doc.json`: recuerda actualizar **este** documento en cada cambio.
- **Compuerta de calidad** (scripts del repo):
  - `npm run test:ci`: `migrate:check` (sentencias destructivas o no repetibles, sin base) +
    `npm test` (`node --test` en `backend/test/`: contrato de API sin 500, cadena de Gemini,
    migraciones y calculadoras ópticas) + build del frontend.
  - `npm run hooks:instalar`: instala `.git/hooks/pre-commit` (local), que bloquea el commit si
    falla `test:ci` o si hay código sin `ARQUITECTURA.md`.
  - `npm run deploy`: exige `main` limpio, corre `test:ci` y recién ahí hace `git push origin main`.
    Es manual: nada sube a producción solo.

---

## 11. Frontend — detalle

- **Páginas:** Login, Dashboard, Clientes (lista/nuevo/detalle), Marcos (lista/nuevo),
  Mercado, Try-On, Stock, TPV, Compras, Turnos, Sobres, Comisiones, Configuración.
- **Componentes:** `Layout` (sidebar colapsable animado), `Modal`, `InfoBtn`
  (botón "!" con popover centrado), `ProtectedRoute`, `CambiarPasswordModal`,
  `GraduacionesSeccion`, subsistema `tryon/` (canvas, carruseles, modales) y los
  compartidos de Mercado: `MercadoTabla` (visualización) y `MercadoFormIA` (alta por IA),
  usados tanto por `MercadoPage` como por la sección "En el mercado" de `TryOnPage`.
  Todas las páginas con título llevan `InfoBtn`.
- **Hooks propios:** `useEsAdmin`, `useFaceLandmarker` (MediaPipe), `useImage`.
- **Sobres:** `components/sobres/SobreConsola.jsx` (consola de dos columnas 65/35, alta y edición) y `components/sobres/SelectorArmazon.jsx` (armazón del cliente o búsqueda en stock por modal). Las calculadoras ópticas están en `utils/receta.js` como funciones puras (transposición con eje 1–180, nunca 0; cerca = ESF lejos + ADD). Etapa 2: `SelectorCatalogoLab.jsx` (modal del catálogo con solapas y "Seleccionar", para lente lejos/cerca y para "Otros"), `SobreFinanzas.jsx` (Sub Total Lejos/Cerca/Otros, descuento, recargo, pagos y saldo) y `utils/sobreTotales.js` (misma fórmula que el backend). Las categorías del catálogo se comparten en `utils/catalogoLab.js`; `Modal` acepta `ancho`.
- **Animaciones:** secuencia encadenada (sidebar → íconos → fondo → contenido),
  curvas suaves; el contenido se re-anima en cada navegación.

---

## 12. Deuda técnica / pendientes

- **AFIP real:** emite comprobante interno formal (numeración + QR), sin CAE con
  validez fiscal hasta cargar certificado y validar en homologación.
- **WhatsApp:** en simulación hasta tener cuenta Business + plantillas de Meta.
- **QR visual:** se guarda el string oficial de AFIP, pero no se renderiza como
  imagen todavía (activar junto con el CAE real).
- **Pruebas con base simulada:** hay 40 pruebas (`npm test`), pero usan una base y servicios
- **Sin auditoría transversal unificada** (hay trazabilidad por tabla, no un log central).
- **CORS** debe fijarse al dominio en producción (el server advierte si queda en `*`).
- **Bundle único grande** (~550 KB): se puede dividir con code-splitting.
- **Esquema SQL en dos lugares:** `db/schema.sql` (+ `schema_*.sql`) y
  `backend/src/config/migrate.js` definen tablas distintas; la fuente completa y vigente es
  `migrate.js` (corre al arrancar el servidor). `db/init-remoto.js` ya ejecuta esas mismas
  migraciones después de `schema.sql`, así una base nueva queda completa. Lo que sigue
  pendiente: `psql -f db/schema.sql` por sí solo NO crea turnos, promociones, sobres,
  obras sociales, config fiscal/notificaciones ni traslados; hay que arrancar el servidor o
  usar `init-remoto.js`.
- **Plan de Gemini:** el tier gratuito puede responder 429. Mercado ya cachea (no vuelve
  a consultar un modelo guardado), pero el Try-On con IA (imágenes) no tiene caché.
- **Imágenes en Volumen de Railway**: para escalar el catálogo de marcos (3 vistas PNG
  por armazón) conviene migrar a S3/Cloudinary. Pendiente: requiere cuenta y credenciales
  del servicio elegido; hoy se sirve desde `/data/uploads`.

---

## Registro de cambios

> Agregá acá una línea por cada adhesión/actualización (fecha, qué cambió, archivos clave).

- **2026-10-06** — Documento inicial de arquitectura.
- **2026-10-06** — Mejoras de calibre: Dashboard con KPIs reales
  (`dashboardController` + `dashboardRoutes` + `api/dashboard.js` + `DashboardPage`),
  panel de estado de integraciones en Configuración, y comprobante fiscal formal
  con numeración correlativa + QR AFIP (`afipService`, `fiscalController`).
- **2026-10-06** — 6 herramientas: Turnos/Agenda, traslados de stock,
  reintegros/retiros de caja, filtro de marca y export CSV de stock.
- **2026-10-06** — Nueva imagen de fondo (armazones) en login y Stock.
- **2026-10-06** — Cierre de brecha vs. Optix (parte 1):
  - **Descuentos/Promociones:** tabla `promociones` + columnas `total_bruto`/`descuento_*`
    en `ventas`; `promocionesController` + `promocionesRoutes`; `ventasController.crear`
    aplica descuento; TPV con selector de promo/descuento manual y total neto
    (`TpvPage.jsx`, `api/promociones.js`).
  - **Etiquetas con código de barras:** generador Code128 en SVG puro
    (`utils/barcode.js`) + botón "Etiqueta" imprimible en Stock (`StockPage.jsx`).
  - **Exportación CITI Compras (AFIP):** `comprasController.exportarCITI` +
    ruta `/compras-citi` (admin) + botón por período en Compras
    (`ComprasPage.jsx`, `api/compras.js`).
  - Pendiente (requiere definición/credenciales): módulo de Obras Sociales/Convenios,
    importación de listas de precios de proveedores por CSV, CAE AFIP real y WhatsApp Business.
- **2026-10-06** — Config fiscal AFIP cargable desde la UI (modelo A: una óptica por
  instalación). Tabla `config_fiscal` (fila única) con CUIT, punto de venta, producción,
  certificado y clave; `afipService` resuelve credenciales por env o DB; `fiscalController`
  + rutas `GET/PUT /fiscal/config` (admin, sin exponer cert/clave); sección de carga de
  certificado/clave en Configuración (`ConfiguracionPage.jsx`, `api/fiscal.js`). El dueño
  de cada óptica carga su propio certificado AFIP desde la app, sin tocar el deploy.
- **2026-10-10** — Módulo de Obras Sociales / Convenios: tabla `obras_sociales` +
  columnas `obra_social_id`/`cobertura_os` en `ventas`; `obrasSocialesController` +
  `obrasSocialesRoutes` (listar para todos, ABM admin); `ventasController.crear` aplica
  la cobertura sobre el total; selector de obra social en el TPV con desglose del total
  (`TpvPage.jsx`) y gestión de convenios en Configuración (`ConfiguracionPage.jsx`,
  `api/obrasSociales.js`).
- **2026-10-10** — Importación de listas de precios de proveedor por CSV:
  `productosController.importar` (transaccional, match por código, actualiza o crea)
  + ruta `POST /productos/importar` (admin); el CSV se parsea en el front
  (`StockPage.jsx`: botón "Importar precios" + modal con resumen de resultados),
  `api/stock.js` (`importarListaPrecios`). Cubre el punto de "sincronización con
  proveedores" de la comparativa Optix. Con esto se cerró la lista de pendientes
  implementables; CAE AFIP real y WhatsApp quedan a la espera de credenciales.
- **2026-10-10** — Brecha vs. Optix (segunda tanda, imágenes "ÓPTICA - concept"):
  - **Sobres / Órdenes de trabajo** (módulo nuevo): tabla `sobres` con receta
    completa lejos/cerca por ojo (esf/cil/eje/add/prisma/base/diámetro) + armazón +
    cristal + médico + obra social + fecha de entrega + estados;
    `sobresController` + `sobresRoutes`; `pages/SobresPage.jsx` + `api/sobres.js`;
    ruta `/sobres` y menú.
  - **Comisiones** (reporte, admin): `comisionesController` + `comisionesRoutes`;
    `pages/ComisionesPage.jsx`; ruta `/comisiones` y menú.
  - **Filtros avanzados de armazón**: columnas `genero`/`material`/`ubicacion` en
    `productos` y filtros en `stockController.listar`.
  - La auditoría/exportación de stock ya estaba cubierta por el export CSV + filtros.
- **2026-10-10** — Se agregó "Prueba Virtual" (`/try-on`) al menú lateral
  (`Layout.jsx`); la página ya existía pero no tenía acceso directo desde el sidebar.
- **2026-10-10** — Try-On con IA: se corrigió el nombre del modelo de Gemini a
  `gemini-2.5-flash-image` (el anterior `-image-preview` devolvía 404 NOT_FOUND);
  el prompt de composición se detalló para resultado fotorrealista; y la UI de
  Prueba Virtual ahora muestra el resultado o el error real de la IA en pantalla
  (`backend/src/config/env.js`, `backend/src/services/tryonIAService.js`,
  `frontend/src/pages/TryOnPage.jsx`).
- **2026-10-10** — Agente "Mercado": enriquecimiento de catálogo con IA. Dado
  marca+modelo, consulta a Gemini (`gemini-2.5-flash` con `googleSearch`) las specs
  técnicas y las guarda en la tabla nueva `mercado_catalogo` (upsert por
  `UNIQUE(marca, modelo)`). `mercadoGeminiService` (fetch nativo, key desde env o DB),
  `mercadoController` + `mercadoRoutes` (`GET /mercado`, `POST /mercado/enriquecer`
  admin). Queda cableado y listo; funcionará cuando el plan de Gemini pase a pago
  (hoy el tier gratuito devuelve 429).
- **2026-10-10** — UI del agente Mercado dentro de Prueba Virtual: debajo del
  "Catálogo de marcos" (lo que hay en el local) se agregó la sección separada
  "En el mercado" (modelos que NO están en el local; buscar por marca+modelo
  dispara el agente y lista las specs). `frontend/src/api/mercado.js` +
  `frontend/src/pages/TryOnPage.jsx`. La búsqueda es admin-only y usa el mismo
  Gemini que da 429 hasta activar el plan pago.
- **2026-10-12** — Catálogo de Mercado en el frontend como sección propia:
  nueva página `pages/MercadoPage.jsx` (listado del catálogo enriquecido con
  buscador por marca/modelo contra `GET /mercado`, filtros en memoria por
  estilo/material/género/aptitud de graduación, y alta por IA admin-only vía
  `POST /mercado/enriquecer`), ruta `/mercado` en `App.jsx` y pestaña "Mercado"
  (ícono `Store` de lucide) en el sidebar `Layout.jsx`. Reutiliza el servicio
  `api/mercado.js` ya existente y el componente `InfoBtn`.
- **2026-10-12** — Try-On: recorte del marco al contorno del rostro. El hook
  `useFaceLandmarker` ahora expone el ancho facial sien-a-sien (landmarks 234/454,
  `anchoCara`); `TryOnPage` lo convierte a px del canvas (`anchoCaraPx`) y lo
  pasa en el `anchor`; `components/tryon/TryOnCanvas.jsx` aplica un `clip`
  (roundRect con fallback a rect) limitado a ~1.04x el ancho de la cara antes de
  dibujar el marco, para descartar las patillas/excesos del PNG que quedaban
  flotando por fuera del rostro del cliente.
- **2026-10-12** — Ronda de consistencia tras la revisión de analista/programador:
  - **Esquema:** `mercado_catalogo` agregada a `db/schema.sql` (idéntica a `migrate.js`) +
    índice `idx_mercado_marca_modelo_lower` (búsqueda de caché sin distinguir mayúsculas)
    en ambos lados (`db/schema.sql`, `backend/src/config/migrate.js`).
  - **Caché de IA (Mercado):** `mercadoGeminiService.rastrearYEnriquecerModelo` consulta
    primero la tabla; si el modelo existe NO llama a Gemini (evita el 429). Acepta
    `forzar` para refrescar, y sirve lo guardado si no hay API key. La clave del registro
    es la que escribió el usuario (no la que devuelve la IA), así la caché no se duplica por
    mayúsculas. `mercadoController` responde `200` (caché) o `201` (nuevo) con `cache`.
  - **Frontend sin duplicación:** nuevos `components/MercadoTabla.jsx` y
    `components/MercadoFormIA.jsx`, usados por `pages/MercadoPage.jsx` y por la sección
    "En el mercado" de `pages/TryOnPage.jsx`. `api/mercado.js` ahora devuelve
    `{registro, cache}` y acepta `forzar`.
  - **Try-On:** el recorte del marco (`components/tryon/TryOnCanvas.jsx`) se aplica solo
    en vista frontal; en 45°/perfil no recorta.
  - **UI:** `InfoBtn` agregado a las páginas que no lo tenían (`TryOnPage`,
    `ClienteNuevoPage`, `ClienteDetallePage`, `MarcoNuevoPage`).
  - Pendientes que requieren decisión o credenciales: migración de imágenes a S3/Cloudinary
    y llevar el resto de las tablas de `migrate.js` a `db/*.sql` (ver Deuda técnica).
- **2026-10-12** — Inicialización de base completa: `backend/src/config/migrate.js` ahora
  exporta `MIGRACIONES` y `ejecutarMigraciones(ejecutar)` acepta un ejecutor alternativo
  (por defecto el pool del servidor, sin cambio de comportamiento). `db/init-remoto.js`
  corre esas mismas migraciones después de `schema.sql`, por lo que una base nueva queda
  con todas las tablas (turnos, promociones, sobres, obras sociales, config fiscal, etc.).
  Se aclaró en `DEPLOY.md` que `psql -f db/schema.sql` solo crea las tablas base.
- **2026-10-12** — Modelo de texto de Gemini configurable: `GEMINI_TEXT_MODEL` pasó a
  `backend/src/config/env.js` (default `gemini-2.5-flash`, sobreescribible por variable de
  entorno en Railway). `mercadoGeminiService.js` lo toma de ahí y, ante un 404 de Google,
  devuelve un mensaje claro con el nombre del modelo y cómo cambiarlo. Los modelos NO se
  cambiaron: ante un 404 hay que elegir uno vigente de Google AI Studio (el de imágenes
  debe ser un modelo capaz de generar imágenes).
- **2026-10-12** — Búsqueda parcial en Mercado (marca y/o modelo, completos o parciales):
  `mercadoGeminiService.js` reescrito con búsqueda local en 3 pasos antes de gastar IA
  (exacta → ILIKE con comodines escapados → similitud `pg_trgm` solo si se escribe un único
  campo, para no confundir modelos parecidos como RB3025/RB3026). Si no hay coincidencia, el
  prompt le pide a Gemini resolver la marca/modelo oficial más probable (o `no_identificado`,
  sin inventar). Con marca+modelo completos se respeta lo escrito; con parcial se guarda con el
  nombre oficial, reutilizando la capitalización ya guardada. `mercadoController.js`: valida
  largos (≤120), responde `coincidencia`, y `GET /mercado` cae a similitud si ILIKE no
  encuentra nada. BD: extensión `pg_trgm` + índices GIN `idx_mercado_marca_trgm` /
  `idx_mercado_modelo_trgm` en `db/schema.sql` (dentro de un bloque que no aborta si la
  extensión no está disponible) y `backend/src/config/migrate.js`. Frontend:
  `MercadoFormIA.jsx` acepta un solo campo o texto parcial y explica el origen del resultado;
  `api/mercado.js` devuelve `coincidencia`.
- **2026-10-12** — Modelo de texto de Mercado: Google responde 404 a `gemini-2.5-flash` para
  claves nuevas ("no longer available to new users") y recomienda `gemini-3.8-flash`. Se
  verificó con la API de Google que la clave lista `gemini-3.8-flash` y que responde 200 con
  búsqueda web; el default de `GEMINI_TEXT_MODEL` en `backend/src/config/env.js` pasó a
  `gemini-3.8-flash`. El modelo de imágenes (`gemini-2.5-flash-image`) responde 200 y no se cambió.
- **2026-10-12** — Sobres tipo Optix, Etapa 1 (datos técnicos + editar):
  - **BD** (`backend/src/config/migrate.js`, NO en `db/schema.sql` porque `sobres` solo vive en
    las migraciones): tabla `medicos`; 26 columnas nuevas en `sobres`, una por sentencia (`medico_id`,
    C.Base y DEG por ojo, `armazon_cerca_producto_id`, armazón propio lejos/cerca, DNP/AP por ojo,
    cotas del armazón, `laboratorio_id`, `orden_laboratorio_id`, código de pedido/garantía y observación
    para el laboratorio). `armazon_producto_id` sigue siendo el de lejos y `medico` (texto) se conserva
    para los sobres viejos. Sub-tablas `sobre_items_adicionales` y `sobre_pagos` con CHECKs e índices,
    creadas pero sin uso hasta la Etapa 2.
  - **Backend:** `medicosController.js` + `medicosRoutes.js` (listar para todos, ABM admin, baja lógica
    si está en uso); `sobresController.js` acepta los campos nuevos, normaliza checkboxes y vacíos, y
    traduce errores de PostgreSQL (23503, 22P02, 22003, 22001, 23514) a 400.
  - **Frontend:** `SobresPage.jsx` con botón Abrir para editar; `SobreConsola.jsx`, `SelectorArmazon.jsx`,
    `utils/receta.js`, `api/medicos.js` y estilos `.sobre-consola` en `styles.css`.
  - Pendiente: Etapa 2 (ítems adicionales, pagos ligados a venta/caja, saldo calculado al leer) y
    Etapa 3 (orden de laboratorio, descuento de stock, estados). `DEG` es la degresión: disminución de la potencia desde la zona de cerca hacia la intermedia en lentes ocupacionales (en dioptrías, habitual 0,75 a 2,25).
- **2026-10-12** — Cadena de modelos de Gemini y compuerta de calidad:
  - **IA:** `mercadoGeminiService.js` prueba `GEMINI_TEXT_MODEL` y luego `GEMINI_TEXT_FALLBACKS`
    (nuevo en `backend/src/config/env.js`); escala solo ante 404/429 y recuerda el modelo que
    funcionó. No se incluyó `gemini-1.5-flash`: no figura en la lista de modelos de la clave.
  - **Pruebas:** `backend/test/` (`apiContrato`, `geminiFallback`, `migraciones`, `receta`), 40 en
    total con `node --test` (sin dependencias nuevas).
  - **Migraciones:** `backend/src/config/verificarMigraciones.js` + `backend/scripts/migrate.js`
    (`npm run migrate -- --check-only` sin base; `npm run migrate` contra `DATABASE_URL`).
  - **Compuerta y deploy:** `scripts/git-hooks/pre-commit.js`, `scripts/instalar-git-hooks.js`,
    `scripts/deploy.js`; scripts `test`, `migrate:check`, `test:ci`, `hooks:instalar`, `deploy` en
    `package.json`. Steering nuevo `.kiro/steering/system-evolver.md`.
- **2026-10-12** — `db/init-remoto.js` acepta `DB_SSL=false` para inicializar una base local sin SSL
  (antes forzaba SSL y solo servía con Railway; con Railway sigue igual). Con eso se verificó la
  Etapa 1 de Sobres contra PostgreSQL real (migraciones dos veces, API y pantalla en el navegador).
- **2026-10-12** — Stock con filtros tipo Optix:
  - **Hallazgo:** `genero`, `material` y `ubicacion` ya existían en `productos` y el listado ya los filtraba,
    pero el alta y la edición nunca los guardaban, así que esos filtros siempre quedaban vacíos.
  - **BD** (`migrate.js`): `productos.proveedor_id` + índice, e índice trigram por expresión
    `idx_productos_busqueda_trgm`. No se creó `ubicacion_prod` (duplicaba `productos.ubicacion`).
  - **Backend:** `productosController.js` guarda y valida los atributos; `stockController.js` reescribe
    `listar` (búsqueda por expresión indexada, comodines escapados, filtro por proveedor, `total` con
    `COUNT(*) OVER()`, reintento por parecido) y suma `listarFiltros`; ruta `GET /stock/filtros`.
  - **Frontend:** `StockPage.jsx` con desplegables Marca/Género/Material/Ubicación/Proveedor/Mostrar,
    paginado, aviso de "más parecidos", atributos en alta y edición, y export CSV de todo lo filtrado
    (no solo la página); `api/stock.js` (`listarFiltrosStock`); estilos `.searchbar--filtros` y `.paginado`.
  - Verificado contra PostgreSQL real de prueba (24 chequeos) y 45 pruebas en `npm test`. Pendiente la
    interpretación de búsquedas en lenguaje natural con IA (opcional en la especificación).
- **2026-10-12** — Importación CSV con atributos y búsqueda en lenguaje natural sin IA:
  - **Error corregido en la importación:** una fila que fallaba al guardarse dejaba la transacción de
    PostgreSQL cancelada y todas las filas siguientes fallaban, así que una sola fila mala devolvía 500.
    Ahora cada fila corre en su propio `SAVEPOINT` y solo se descarta esa fila.
  - **Importación** (`productosController.importar`): columnas `genero` (sin distinguir mayúsculas ni
    acentos), `material`, `ubicacion`, `proveedor` (por nombre, entre los proveedores activos; no crea
    proveedores) o `proveedor_id`. Celda vacía = no tocar el dato guardado. `atributos()` acepta el género
    sin acentos ni mayúsculas en alta y edición. En el front, `StockPage.jsx` normaliza los encabezados del
    CSV ("Género", "GENERO", "Proveedor ID").
  - **Búsqueda:** `stockController.listar` busca cada palabra por separado ("ray ban" encuentra "Ray-Ban").
  - **Lenguaje natural sin IA:** `frontend/src/utils/busquedaNatural.js` interpreta el texto antes de buscar
    ("marcos de mujer en metal" -> Género Mujer + Material Metal), con sinónimos y plurales, y reconoce
    cualquier material cargado en la base. Lo detectado se pasa a los desplegables y la pantalla avisa
    "Busqué con: …". Se hizo en el front y no en el backend para que el filtro quede a la vista.
  - Pruebas: `backend/test/busquedaNatural.test.mjs` y casos nuevos en `apiContrato.test.js` (56 en total).
    Verificado contra PostgreSQL real de prueba (16 chequeos, incluido que una fila con error no corta la
    importación).
  - No existen `services/importacionService.js` ni `components/ImportarPreciosModal.jsx` (nombres de la
    especificación): la importación vive en `productosController.js` y el modal en `StockPage.jsx`.
- **2026-10-13** — Stock: la importación CSV empareja por `codigo` o, si no hay, por `codigo_barras`
  (`productosController.importar`; el front acepta las columnas `codigo_barras`/`ean`/`barras`). Nuevo
  `GET /mercado/predict-attributes?marca=` (`mercadoController.predecirAtributos`, sin IA): al salir del
  campo Marca del alta, `StockPage` sugiere género y material solo si están vacíos. El mensaje de "sin
  resultados" nombra los filtros activos y suma el botón "Limpiar filtros y ver todo el stock". La caché de
  mercado ya existía (`mercadoGeminiService`); no existen `importacionService.js` ni `NuevoProductoModal.jsx`
  (nombres de la especificación). Pruebas de contrato nuevas para ambos endpoints.
- **2026-10-14** — Sobres Fase 3 y Cloudinary. Estados nuevos `lentes` y `listo` (`SobresPage`,
  `SobreConsola`, `sobresController.ESTADOS`). Migración que quita el CHECK `sobres_estado_check`: la
  validación queda solo en el backend (única excepción a "solo agregar", permitida por nombre en
  `verificarMigraciones.js`). Las columnas DEG ya existían y no se tocaron (siguen en `NULL` = sin dato).
  Nuevo `POST /uploads/tryon` (`uploadRoutes`, `uploadController`, `services/storageService.js`,
  dependencia `cloudinary`, variables `CLOUDINARY_*`). Las fotos de `fotosController` siguen en disco.
  El Try-On del front todavía no llama a este endpoint.
- **2026-10-15** — `TryOnPage` guarda en Cloudinary cada imagen generada con IA, sin bloquear el
  resultado (`api/uploads.js` → `POST /uploads/tryon`; sin credenciales 409 se ignora y se muestra el
  enlace "Imagen guardada en la nube" solo si se pudo subir). `npm audit fix` en `backend`: `multer`,
  `body-parser` y `qs` actualizados (las 3 vulnerabilidades eran previas a `cloudinary`); 0 pendientes.
- **2026-10-16** — Stock al estilo Optix: desplegable "Categoría" (usa el filtro `categoria` que el backend ya
  tenía), campo "Modelo o referencia" (nuevo parámetro `modelo` en `stockController.listar`: texto parcial
  en nombre, código o código de barras; se aplica al buscar, no en cada tecla) y botón "Imprimir" en
  `StockPage` (abre el listado completo con los filtros vigentes en una ventana aparte, A4 horizontal).
  Ambos filtros entran también en Exportar CSV, en el mensaje de "sin resultados" y en Limpiar filtros.
  No se agregó la categoría "Sol" del ejemplo: las categorías reales son armazón, cristal, lente de
  contacto, accesorio y otro.
- **2026-10-17** — Stock: "Modelo o referencia" ahora tolera errores de tipeo (`stockController.listar`):
  primero busca por subcadena y, si no hay resultados y el texto tiene 3+ letras, reintenta con
  `word_similarity` (umbral 0,45, el mismo de `q`) sobre nombre + código + código de barras, y marca
  `parecidos`. `q` y `modelo` se combinan; `marca` y `categoria` siguen siendo coincidencia exacta
  (son desplegables). Verificado contra PostgreSQL real de prueba (13 casos).
- **2026-10-18** — Stock ↔ Mercado ↔ Compras. Cuando Stock no encuentra nada, el mensaje dice "No hay
  productos que coincidan con…" y ofrece "Buscar en Mercado" (`/mercado?q=`; `MercadoPage` busca sola y
  precarga el formulario de la IA con ese texto). En Mercado, el admin tiene "Cargar en mi catálogo" por
  modelo (`MercadoTabla` con columna de acciones + modal): `POST /mercado/:id/producto`
  (`mercadoController.crearProductoDesdeMercado`) crea el armazón en `productos` con marca, género,
  material y medidas (`metadatos`), sin stock, y opcionalmente un pedido simulado: una compra en
  `borrador` (`compras` + `compra_items`). Al llegar la mercadería se confirma en Compras
  (`comprasController.confirmar`), que suma el stock a la sucursal, registra el movimiento y recalcula el
  precio; desde ahí se vende por TPV y se ve en Stock. Si el modelo ya estaba cargado se reutiliza y se
  actualizan costo y margen si vienen. Verificado contra PostgreSQL real (8 casos). Pendiente: mostrar en
  Try-On solo lo que ya llegó (hoy `marcos` no se vincula con `productos` y exige una imagen).
- **2026-10-19** — Módulo "Lentes y otros" (catálogo de cristales, tratamientos, contactología, accesorios y
  servicios de laboratorio). Tabla nueva `catalogo_laboratorio` (3 sentencias aditivas en `migrate.js`, ids
  asignados tipo 1283 con `SERIAL` alineado al importar), `laboratorioController` + `laboratorioRoutes`
  (`/api/laboratorio/*`, JWT; importar y ajustar precios solo admin), `api/laboratorio.js`, página
  `LentesPage` (`/lentes`, ítem "Lentes y otros" en `Layout`) con menú de 12 categorías a la derecha,
  búsqueda en toda la lista, impresión, importación CSV y ajuste de precios en dos pasos (ver efecto y
  aplicar). Adaptado del borrador en Flask/Tailwind del spec: se usa la conexión y el JWT del proyecto, el
  ajuste masivo exige admin, redondea y no permite "todo el catálogo" sin confirmarlo, y una celda vacía en
  la importación no borra datos. No se implementaron las pestañas "Mi Lista" y "Etiquetas" del spec ni la
  integración de `validar-receta` con el sobre (queda el endpoint listo). Verificado contra PostgreSQL real
  (18 casos) y con pruebas de contrato nuevas.
- **2026-10-20** — Recordatorios automáticos de turnos por WhatsApp. Pestaña nueva "Recordatorios"
  (`RecordatoriosPage`, `/recordatorios`, ícono Bell): se carga cliente, celular y la fecha en que tiene que
  volver (atajos "en 1, 2, 3, 6 meses o 1 año"), cuánto antes avisar (1 mes, 2 semanas, 1 semana, 4 días y/o
  días a elección) y, si hace falta, el mensaje del doctor. Tabla `recordatorios_turnos` (+ columnas
  `whatsapp_plantilla` y `whatsapp_idioma` en `config_notificaciones`; 5 sentencias aditivas en
  `migrate.js`), `recordatoriosController` + rutas bajo `/notificaciones/recordatorios`,
  `services/recordatoriosUtil.js` (fechas, teléfonos AR, mensaje; 11 pruebas) y `services/reminderScheduler.js`
  (reloj de 5 min, arrancado desde `server.js`). `enviarWhatsApp` dejó de ser un punto de integración y
  manda de verdad por la Cloud API de Meta. `TurnosPage` suma el botón "Recordar" por turno pendiente y
  `ConfiguracionPage` los campos de plantilla e idioma. Diferencias con el borrador: se reutilizan
  `whatsapp_token` y `whatsapp_phone_id` (no se duplican columnas), las credenciales son globales y no por
  sucursal, los avisos guardan nombre y teléfono propios (los clientes no tienen teléfono cargado), el control
  puede no existir todavía como turno (`turno_id` es opcional) y no se implementó `respuesta_cliente` ni
  `sms` (requieren webhook de Meta y otro proveedor). Verificado contra PostgreSQL real con Meta simulado
  (20 grupos de casos); **no** verificado contra Meta real (falta la cuenta, el token y la plantilla aprobada).
- **2026-10-24** — Médicos: lista completa A a Z. Entran 29 que faltaban (A a C y M.P. 2044 Asayag Nina, 6141 Alejandro Rosales, 8304 Amarilla Ramiro); el resto ya estaba y se saltea por nombre + matrícula. Se omitió "AaOTRO MEDICO" (comodín del sistema viejo; para un médico nuevo está el botón "+"). Migración aditiva `INSERT ... WHERE NOT EXISTS` en `migrate.js`.
- **2026-10-24** — Médicos: carga de la lista consolidada (D a Z, 92 filas; las que ya estaban se saltean por nombre + matrícula, entran 44 nuevas). Se omitieron "PAOLA SECRETARIA", "REPETIDO, REUSAR" y "Maria Sec Estragó" (no son médicos). Migración aditiva `INSERT ... WHERE NOT EXISTS` en `migrate.js`.
- **2026-10-24** — Médicos. **BD** (`migrate.js`, aditivas): `medicos.especialidad`, índice por `LOWER(nombre)`, carga de 48 médicos de la lista de la óptica (`INSERT ... WHERE NOT EXISTS` por nombre + matrícula; se omitieron "PAOLA SECRETARIA" y "REPETIDO, REUSAR" porque no son médicos) y `usuarios.medico_id` (médico tratante, FK con ON DELETE SET NULL). **Backend:** `POST /medicos` abierto a cualquier usuario y con aviso de duplicado (409); `usuariosController` lee/guarda `medico_id` (valida UUID; FK inexistente -> 400) y devuelve `medico_nombre`/`medico_matricula`. **Frontend:** `components/medicos/SelectorMedico.jsx` (combobox: filtra en vivo por nombre o M.P. sin distinguir acentos, teclado, muestra "M.P. 7966 Velardez Camila", botón verde "+", lista con z-index 60) y `NuevoMedicoModal.jsx` (Apellido, Nombre, M.P., Especialidad; se abre fuera del formulario, así no se pierde lo cargado). Se usan en `SobreConsola` (reemplaza el select y el alta solo-admin), `ClienteNuevoPage` y `ClienteDetallePage` (guarda al elegir). Al elegir paciente en el sobre, si tiene médico tratante y el sobre no tiene médico, se precarga con aviso. Probado contra PostgreSQL real y en Chrome.
- **2026-10-23** — Sobres Etapa 2 (importes). **BD** (`migrate.js`, aditivas): en `sobres` `lente_lejos_id`/`lente_cerca_id` (FK a `catalogo_laboratorio`, ON DELETE SET NULL), `lente_*_descripcion`, `lente_*_precio`, `armazon_lejos_precio`, `armazon_cerca_precio`, `descuento_tipo`, `descuento_valor`, `recargo` (importes con CHECK >= 0); en `sobre_items_adicionales` `catalogo_id` y `orden`. **Backend:** `services/sobreTotales.js` (Sub Total Lejos = lente + armazón; ídem Cerca; Otros = suma de ítems; Total = Sub Total - descuento + recargo, nunca negativo; Saldo = Total - pagos); `sobresController` valida importes, descuento, ítems y pagos, guarda ítems/pagos en transacción y recalcula el total; `obtener` devuelve `items`, `pagos` y `totales`. Un sobre viejo con total manual queda intacto mientras no se editen sus importes; al abrirlo en la consola, ese total aparece como ítem de "Otros". **Frontend:** campo "Lente:" con botón "Lentes y otros" y borrador bajo cada receta, sección "Servicios, insumos, accesorios y otros" (del catálogo o ítem libre), columna derecha con `SobreFinanzas`; el armazón del stock trae su precio de venta. **Pruebas:** `backend/test/sobreTotales.test.js` (7) y casos de contrato de validación; probado contra PostgreSQL real y en Chrome (alta con el lente 1494: total y saldo $416.708).
- **2026-10-22** — "Lentes y otros": el menú de categorías de la derecha pasa a ser una fila de solapas debajo del buscador (`.lab-tabs` / `.lab-tab`, con el conteo de ítems); las tarjetas de grupos usan todo el ancho (`LentesPage.jsx`, `styles.css`).
- **2026-10-22** — Carga inicial de "11 LENTES DE SOL": 1 ítem (1518, LENTE DE SOL, grupo Convencionales, marca LENA, precio $0 a definir). Con esto quedan cargadas las 12 categorías de "Lentes y otros" (471 ítems).
- **2026-10-22** — Carga inicial de "10 ACCESORIOS": 3 ítems en el grupo ACCESORIOS (marca LENA), marcados como insumo de mostrador (`es_insumo_mostrador = TRUE`); migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **2026-10-22** — Carga inicial de "9 TRATAMIENTOS Y SERVICIOS": 13 ítems en 2 grupos (Coloraciones y Reparaciones, Calibrados y Centrado Digital), marcados como servicio (`es_servicio = TRUE`); migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **2026-10-22** — Carga inicial de "8 MULTIPROPOSITOS-GOTAS": 8 líquidos en el grupo Multipropósitos (marca LENA); migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`. En `LentesPage`, cuando la categoría tiene un solo grupo la tarjeta ocupa todo el ancho (`.lab-grid--uno`).
- **2026-10-22** — Carga inicial de "7 CONTACTOLOGIA": 86 ítems en 8 grupos (CooperVision, Johnson, G Perm rígidas y gas perm, RGP esclerales, Bausch+Lomb, Alcon, G Perm blandas convencionales, prótesis oculares), con `orden_lista` siguiendo la numeración; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **2026-10-22** — Carga inicial de "6 PROGRESIVOS VARILUX": 42 ítems en 4 grupos (VARILUX PHYSIO 3.0, VARILUX Liberty 3.0, VARILUX CONFORT 3.0, VARILUX XDESIGN), marca LENA, con el tratamiento (Sin AR, Crizal Forte, Crizal Rock) como etiqueta; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **2026-10-22** — Carga inicial de "5 PROGRESIVOS": 148 ítems en 11 grupos (Digitales Polarys, Convencionales CARL ZEISS, Digitales NOVAR, Digitales CUSTOM, INTELLIGENCE HD, INTELLIGENCE CVI (PROMO 2X1), FREE VIEW Style 180 2X1, INTELLIGENCE Mobile-Sport-Drive, FREE VIEW Style, FREE VIEW, PROGRESIVOS L-N (Convencional)), con `orden_lista` siguiendo la numeración; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`. El precio de 1086 (Poly BlueMax, Mobile-Sport-Drive) se cargó tal cual vino ($52.332) y queda a confirmar.
- **2026-10-22** — Carga inicial de "4 OCUPACIONALES": 32 ítems en 7 grupos (Ocupacionales Digitales CUSTOM, Ocupacional Digitales NOVAR, INTELLIGENCE Desk, ACCESS Linea Zeiss, DIGITIME, INTERVIEW, LITORAL), con `orden_lista` siguiendo la numeración; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`.
- **2026-10-22** — Carga inicial de "3 BIFOCALES": 33 ítems en 4 grupos (BIFOCALES Flap Top, BIFOCALES KRIPTOCK, Flat Top, BIFOCALES INVISIBLES). Nueva columna `catalogo_laboratorio.orden_lista` (orden en que vienen los ítems en la lista del laboratorio): se completó para los 105 ítems ya cargados y `GET /laboratorio/catalogo` ordena por ella (NULL al final, por código), así grupos e ítems se ven como en la lista original. `LentesPage` deja de reordenar los grupos por código. El "Org Polarizado" de Invisibles se cargó con el código 1268 (la lista decía 1288, que ya es "Polarizado" de Monofocales).
- **2026-10-22** — Carga inicial de "2 MONOFOCAL DIGITAL": 27 ítems en 3 grupos (Monofocal Intelligence Digital, EYEZEN, MYOPILUX-PLUS), marca LENA, con graduación o "Sin AR" como etiqueta y días de demora; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`. En `LentesPage` los grupos se ordenan por su primer código (orden de la lista del laboratorio) y se apilan en dos columnas (`.lab-grid` con `columns: 2`), así un grupo corto queda debajo de otro en vez de dejar hueco.
- **2026-10-22** — "Lentes y otros": cada tarjeta de grupo termina en su último ítem (`.lab-grid` con `align-items: start`) y las etiquetas de graduación largas pasan de línea en vez de taparse con el precio (`styles.css`).
- **2026-10-22** — Carga inicial de "1 MONOFOCALES" en "Lentes y otros": 58 ítems en 4 grupos (Mono Lentes de Stock Blancas, con AR, Fotocromaticas y Mono Laboratorio), con marca (LENA, VIST, Cent), graduación como etiqueta y días de demora; migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING`. En `LentesPage` cada fila muestra la marca debajo del código y las etiquetas en la línea de abajo de la descripción.
- **2026-10-22** — Carga inicial del catálogo "Lentes y otros": 20 cristales de control de miopía (Myofix y Myolens, códigos 1493 a 1512, marca Novar, sin días de demora) como migración aditiva `INSERT ... ON CONFLICT (id) DO NOTHING` en `migrate.js`; filas alternadas en verde en `.lab-card` (`styles.css`).
- **2026-10-22** — Alta de cliente: las 3 fotos de seguimiento pasan a ser opcionales (`ClienteNuevoPage.jsx` sube solo las elegidas, cada una con su ángulo; el backend ya aceptaba un subconjunto). `.content` suma espacio inferior para que el botón flotante de ayuda no tape los botones de los formularios.
- **2026-10-22** — Corrección: `/clientes/nuevo` quedaba en blanco porque `ClienteNuevoPage.jsx` usaba `<InfoBtn>` sin importarlo (error desde el commit 8f1bec6; el build de Vite no lo detecta). Se agregó el import y la prueba `backend/test/frontendImports.test.js`, que falla si un `.jsx` usa `InfoBtn` o `Modal` sin importarlo.
- **2026-10-22** — Asistente flotante: el modal desencajado se reemplazó por un botón circular en la esquina inferior derecha (logo de viñeta rosa con "?" blanco, entrada con pop y latido, sin animación si el sistema pide menos movimiento) que abre un panel anclado (`AsistenteVirtualModal` con `abierto/onAbrir/onCerrar`, cierra con Esc). Se quitó el botón "Contraseña" del menú lateral y su modal (la contraseña la gestiona el administrador); la FAQ `config_password` se actualizó con una migración `UPDATE ... WHERE clave`. Se confirmó el significado de `DEG` (degresión).
- **2026-10-21** — Asistente virtual de ayuda. Botón "Ayuda" en el menú lateral (`Layout`) que abre `AsistenteVirtualModal`: menú de preguntas frecuentes por tema, texto libre, preguntas relacionadas y valoración "Útil / No útil". Tablas nuevas `faq_categorias`, `faq_preguntas` y `asistente_consultas` (7 sentencias aditivas en `migrate.js`), `asistenteController` + `asistenteRoutes` (`/api/asistente/*`), `services/faqSeed.js` (18 preguntas iniciales en 8 temas, escritas sobre lo que el sistema hace hoy) y `generarTexto` en `mercadoGeminiService`. Diferencias con el borrador: se reutiliza la cadena de modelos de Gemini por `fetch` en vez de sumar la dependencia `@google/generative-ai`; `usuario_id` apunta a `usuarios_sistema`; se registran todas las consultas y no solo las de IA; se agregaron `clave` y `orden` (para cargar sin duplicar y ordenar), el endpoint de valoración que el borrador no tenía, el límite por usuario y el historial para admin (sin pantalla todavía). Las FAQ se editan por base de datos: no hay pantalla de administración.
