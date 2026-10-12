# Arquitectura del Sistema — Óptica / Centro de Contactología

> Documento vivo. Describe **todo** lo que compone el sistema: tecnologías, nube,
> despliegue, módulos, API, accesos, datos, integraciones y automatizaciones.
>
> **Regla de mantenimiento:** cada vez que se agregue o modifique una
> funcionalidad (una "adhesión"), este documento debe actualizarse en el mismo
> cambio. Hay un hook de Kiro (`.kiro/hooks/sync-arquitectura-doc.json`) que lo
> recuerda automáticamente. Al final está el **Registro de cambios**.

_Última actualización: 2026-10-10 (Sobres/órdenes de trabajo, Comisiones, filtros de armazón)_

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
(`AFIP_CUIT/CERT/KEY/PUNTO_VENTA/PRODUCCION`, `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL`).

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
| **Autenticación** | Login JWT, `me`, cambio de contraseña (bcrypt dentro de Postgres). |
| **Dashboard** | KPIs reales: ventas y cobros del día, cajas abiertas, stock bajo mínimo, turnos de hoy, presupuestos abiertos. Filtrable por sucursal. |
| **Clientes/Pacientes** | CRUD, fotos de seguimiento (hasta 3), graduaciones/recetas anidadas. |
| **Marcos (catálogo)** | CRUD de armazones con 3 vistas (frontal/45°/perfil) en PNG transparente. |
| **Virtual Try-On** | Superposición 2D con escalado antropométrico (DIP + MediaPipe) + composición realista con IA (Gemini). |
| **Stock / Inventario** | Multisucursal: existencias, movimientos, alta, recálculo de precios, filtro por marca, traslados entre sucursales, export CSV, impresión de etiquetas con código de barras (Code128), **importación de listas de precios de proveedor por CSV**. |
| **TPV / Ventas** | Caja (apertura/cierre con arqueo), ventas, pagos, señas, entrega, anulación, reintegros/retiros de caja, cuenta corriente, **descuentos/promociones por venta**. |
| **Promociones / Descuentos** | El comercio crea sus propios descuentos (porcentaje o monto), los activa/desactiva y los aplica en el TPV. |
| **Obras sociales / Convenios** | Alta de convenios con % de cobertura por defecto; en el TPV se aplica la cobertura y el total refleja lo que paga el paciente. Gestión en Configuración (admin). |
| **Sobres / Órdenes de trabajo** | Orden central de la óptica: paciente + receta completa (lejos/cerca por ojo, con esfera/cilindro/eje/adición/prisma/base/diámetro) + armazón + cristal + médico + obra social + fecha de entrega; estados pendiente/reserva/en taller/entregado/anulado. |
| **Comisiones** | Reporte del acumulado de comisiones por vendedor en un período (ventas entregadas), con resumen y detalle. Solo admin. |
| **Compras** | Proveedores, laboratorios, compras (confirmar impacta stock/costos), órdenes de laboratorio, **exportación contable CITI Compras (AFIP) por período**. |
| **Turnos / Agenda** | Alta de turnos, filtro por rango, estados (asistió/ausente/cancelado). |
| **Fiscal (AFIP/ARCA)** | Comprobantes A/B/C/interno con numeración correlativa y QR oficial; modo real listo para activar con certificado. |
| **Notificaciones** | Telegram (real) y WhatsApp (listo para activar), con historial y config. |
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
- **Stock:** `/sucursales`, `/productos`, `POST /productos/importar` (admin, lista de precios CSV), `/stock`, `/stock/marcas`, movimientos, `/traslados`.
- **TPV:** `/cajas/*` (actual/abrir/cerrar/movimientos), `/ventas/*` (acepta `descuento` al crear), pagos, entregar, anular, `/cuenta-corriente/:id`.
- **Promociones:** `GET /promociones`, `POST /promociones` (admin), `PATCH /promociones/:id` (admin), `DELETE /promociones/:id` (admin).
- **Obras sociales:** `GET /obras-sociales`, `POST /obras-sociales` (admin), `PUT /obras-sociales/:id` (admin), `DELETE /obras-sociales/:id` (admin).
- **Sobres:** `GET /sobres`, `POST /sobres`, `GET /sobres/:id`, `PUT /sobres/:id`, `PATCH /sobres/:id/estado`, `DELETE /sobres/:id`.
- **Comisiones:** `GET /comisiones` (admin; filtros desde/hasta/sucursal/vendedor).
- **Stock:** el listado acepta además filtros `genero`, `material`, `ubicacion_prod`.
- **Compras:** `/proveedores`, `/compras`, `/ordenes-laboratorio`, `GET /compras-citi?periodo=YYYY-MM` (admin, descarga .txt).
- **Fiscal:** `/fiscal/estado`, `GET/PUT /fiscal/config` (admin; config AFIP sin exponer cert/clave), `/fiscal/emitir`, `/fiscal/comprobantes`.
- **Notificaciones:** `/notificaciones/config`, `/notificaciones`, `/notificaciones/prueba`.
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
  `config_notificaciones`, `notificaciones`, `turnos`, `graduaciones`, `sobres`
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
  (`gemini-2.5-flash-image-preview`). Sin key → superposición 2D gratis.
- **Notificaciones** (`notificacionesService.js`): **Telegram real** (Bot API);
  WhatsApp (Meta Cloud API) pendiente de plantillas. Eventos registrados como
  `enviado`/`simulado`/`error`.

---

## 10. IA, agentes y automatizaciones

**IA dentro del producto:**
- **Try-On generativo con Gemini** (composición realista del armazón sobre la foto).
- **Detección facial con MediaPipe** (modelo de visión en el navegador para escalar el marco).
- No es un sistema multiagente: es IA generativa puntual + un modelo de visión local.

**Automatizaciones de desarrollo (Kiro, en `.kiro/`, NO forman parte del producto):**
- **Steering** (`.kiro/steering/ui-reglas-secciones.md`): regla de UI (InfoBtn
  obligatorio, mapa de z-index, capas, sombras).
- **Hooks** (`.kiro/hooks/`):
  - `anim-sequence-rules.json`: mantiene la secuencia/tiempos de animación.
  - `info-btn-rules.json`: recuerda el InfoBtn en cada sección.
  - `sync-arquitectura-doc.json`: recuerda actualizar **este** documento en cada cambio.

---

## 11. Frontend — detalle

- **Páginas:** Login, Dashboard, Clientes (lista/nuevo/detalle), Marcos (lista/nuevo),
  Try-On, Stock, TPV, Compras, Turnos, Configuración.
- **Componentes:** `Layout` (sidebar colapsable animado), `Modal`, `InfoBtn`
  (botón "!" con popover centrado), `ProtectedRoute`, `CambiarPasswordModal`,
  `GraduacionesSeccion`, subsistema `tryon/` (canvas, carruseles, modales).
- **Hooks propios:** `useEsAdmin`, `useFaceLandmarker` (MediaPipe), `useImage`.
- **Animaciones:** secuencia encadenada (sidebar → íconos → fondo → contenido),
  curvas suaves; el contenido se re-anima en cada navegación.

---

## 12. Deuda técnica / pendientes

- **AFIP real:** emite comprobante interno formal (numeración + QR), sin CAE con
  validez fiscal hasta cargar certificado y validar en homologación.
- **WhatsApp:** en simulación hasta tener cuenta Business + plantillas de Meta.
- **QR visual:** se guarda el string oficial de AFIP, pero no se renderiza como
  imagen todavía (activar junto con el CAE real).
- **Sin tests automatizados ni ESLint propio** (verificación = build + carga + sintaxis).
- **Sin auditoría transversal unificada** (hay trazabilidad por tabla, no un log central).
- **CORS** debe fijarse al dominio en producción (el server advierte si queda en `*`).
- **Bundle único grande** (~505 KB): se puede dividir con code-splitting.
- **Imágenes en Volumen de Railway**: para escalar conviene S3/Cloudinary.

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
