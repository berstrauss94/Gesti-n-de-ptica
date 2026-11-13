# Evolución del sistema, IA y despliegue seguro — Óptica

Reglas permanentes para cualquier cambio en este repositorio. Complementan
`ui-reglas-secciones.md` (reglas de UI).

## 1. Memoria y control de deriva

- Toda adhesión (módulo, endpoint, tabla, integración, página, cambio de
  despliegue) actualiza `ARQUITECTURA.md` en el MISMO cambio: sección
  pertinente, fecha de "Última actualización" y una línea en "Registro de
  cambios". La compuerta de git bloquea el commit si hay código en
  `backend/src` o `frontend/src` sin `ARQUITECTURA.md`.
- No cambiar la arquitectura base: monolito Node.js + Express 4, React 18 +
  Vite, PostgreSQL, desplegado en Railway desde `main`.
- El esquema de base vigente es `backend/src/config/migrate.js` (corre al
  arrancar el servidor). Tablas que solo viven ahí (como `sobres`) NO se
  tocan en `db/schema.sql`: un `ALTER` sobre una tabla inexistente corta la
  inicialización de `db/init-remoto.js`.

## 2. Migraciones

- Una sentencia por elemento del array `MIGRACIONES`; una columna por `ALTER`.
- Solo agregar: `CREATE ... IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`,
  `INSERT ... ON CONFLICT`, `UPDATE ... WHERE`, `DROP TRIGGER IF EXISTS` antes
  de `CREATE TRIGGER`. Nada destructivo (DROP, TRUNCATE, DELETE, RENAME,
  cambio de tipo).
- Validar con `npm run migrate:check` (sin base de datos).

## 3. Modelos de IA (Gemini)

- Los modelos se configuran en `backend/src/config/env.js` y se pisan con
  variables de Railway, sin tocar código:
  - `GEMINI_TEXT_MODEL` + `GEMINI_TEXT_FALLBACKS` (agente Mercado; escala al
    siguiente solo ante 404 o 429).
  - `GEMINI_IMAGE_MODEL` (Try-On: debe ser un modelo que GENERE imágenes).
- Antes de cambiar un nombre de modelo, verificarlo contra la lista real de la
  API (`GET /v1beta/models`) con la clave del cliente, y pedir permiso para
  usar esa clave. No agregar modelos que no figuren en esa lista (por ejemplo,
  la familia 1.5 ya no está disponible para claves nuevas).
- Nunca escribir la API key en archivos del repo ni en commits.

## 4. Compuerta de calidad y despliegue

- `npm run test:ci` = chequeo de migraciones + pruebas (`node --test`:
  contrato de API sin 500, cadena de Gemini, calculadoras ópticas) + build del
  frontend. Debe pasar antes de cualquier commit (`npm run hooks:instalar`
  instala la compuerta local de git).
- Al agregar un endpoint, sumarlo a `backend/test/apiContrato.test.js`.
- El despliegue es explícito: `npm run deploy` (exige `main` limpio, corre la
  compuerta y recién ahí hace `git push origin main`). Nunca hacer push a
  producción sin que el usuario lo pida.
- La compuerta usa una base simulada: no reemplaza probar en el navegador ni
  contra la base real. Avisar siempre qué quedó sin probar.
