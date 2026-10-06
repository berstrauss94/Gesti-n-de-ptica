# Despliegue en Railway desde GitHub

Guía para publicar el Sistema Óptica (backend Express + frontend React/Vite + PostgreSQL) en [Railway](https://railway.app).

El proyecto está pensado para desplegarse como **monolito**: Express sirve la API, las imágenes de `/uploads` y el build del frontend (`frontend/dist`). Un solo servicio, un solo dominio, sin problemas de CORS.

---

## 1. Subir el repositorio a GitHub

```bash
git init
git add .
git commit -m "Sistema Óptica: backend + frontend + db"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/<tu-repo>.git
git push -u origin main
```

> El `.gitignore` ya excluye `.env`, `node_modules/`, `uploads/` y `dist/`. Verificá que ningún `.env` con credenciales quede versionado antes del push.

---

## 2. Crear el proyecto en Railway

1. En Railway: **New Project → Deploy from GitHub repo** y elegí tu repositorio.
2. Railway detecta Node.js y usa los scripts del `package.json` de la raíz:
   - `postinstall` instala backend + frontend y construye `frontend/dist`.
   - `start` arranca el backend (`npm start --prefix backend`).
3. El `Procfile` define el proceso web: `web: npm start --prefix backend`.

---

## 3. Agregar PostgreSQL

1. Dentro del proyecto: **New → Database → Add PostgreSQL**.
2. Railway crea la variable `DATABASE_URL` y la expone al servicio.
3. Conectate a la base (pestaña **Data** o con `psql` usando la `DATABASE_URL` pública) y aplicá el esquema y el usuario admin:

   ```bash
   psql "<DATABASE_URL>" -f db/schema.sql

   psql "<DATABASE_URL>" \
     -v admin_user="'Optica_2026'" \
     -v admin_password="'Optica_2026.1234'" \
     -f db/seed_admin.sql
   ```

   > Cambiá la contraseña del admin por una propia. No dejes la de ejemplo en producción.

---

## 4. Volumen persistente para `/uploads`

El filesystem de Railway es **efímero**: se borra en cada despliegue. Para que las fotos y los PNG de marcos no se pierdan:

1. En el servicio: **Settings → Volumes → New Volume**.
2. Mount path sugerido: `/data/uploads`.
3. Definí la variable de entorno `UPLOAD_DIR=/data/uploads` (ver siguiente paso).

El backend crea la carpeta si no existe y guarda ahí todas las subidas.

> Alternativa recomendada para escala: usar almacenamiento externo (S3 o Cloudinary) en vez del volumen. Requiere adaptar el middleware de subida.

---

## 5. Variables de entorno

En **Settings → Variables** del servicio, definí:

| Variable | Valor | Notas |
| --- | --- | --- |
| `DATABASE_URL` | *(la provee Railway)* | Referenciá la del plugin de Postgres |
| `DB_SSL` | `true` | Railway exige SSL |
| `JWT_SECRET` | *(cadena larga y aleatoria)* | Generá una propia, no reutilices ejemplos |
| `JWT_EXPIRES_IN` | `8h` | Opcional |
| `NODE_ENV` | `production` | |
| `SERVE_FRONTEND` | `true` | Para servir `frontend/dist` desde Express |
| `UPLOAD_DIR` | `/data/uploads` | Debe coincidir con el mount del volumen |
| `CORS_ORIGIN` | *(dominio del servicio)* | En monolito, el propio dominio de Railway |
| `ADMIN_USER` | `Optica_2026` | Solo si automatizás el seed; ver nota |
| `ADMIN_PASSWORD` | *(tu contraseña)* | Nunca la dejes en el repo |

> `ADMIN_USER` / `ADMIN_PASSWORD` no los lee el backend directamente: se usan al correr `seed_admin.sql`. Están listados acá por conveniencia si automatizás la siembra del admin.

Generar un `JWT_SECRET` seguro (PowerShell):
```powershell
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Max 256 }))
```

---

## 6. Verificar el despliegue

1. Railway construye y arranca. Mirá los **logs**: debería aparecer `Servidor Óptica escuchando en el puerto ...`.
2. Healthcheck: `https://<tu-dominio>.up.railway.app/health` → `{"status":"ok"}`.
3. Abrí el dominio en el navegador: debería cargar la pantalla de login.
4. Ingresá con `Optica_2026` / la contraseña que sembraste.

---

## Despliegue separado (alternativa)

Si preferís frontend y backend en servicios distintos:

- **Backend**: dejá `SERVE_FRONTEND=false` y configurá `CORS_ORIGIN` con el dominio del frontend.
- **Frontend**: desplegalo como sitio estático (Railway, Vercel o Netlify) con la variable `VITE_API_URL=https://<dominio-del-backend>`.

En este modo, el backend ya envía los headers CORS correctos sobre `/uploads` para que la exportación del canvas (Virtual Try-On) no falle por "tainting".

---

## Desarrollo local

```powershell
# 1. Base de datos (Postgres local corriendo)
psql -d optica -f db/schema.sql
$env:ADMIN_PASSWORD = "Optica_2026.1234"
psql -d optica -v admin_user="'Optica_2026'" -v admin_password="'$env:ADMIN_PASSWORD'" -f db/seed_admin.sql

# 2. Backend (terminal 1)
Copy-Item backend/.env.example backend/.env   # editá los valores
npm start --prefix backend

# 3. Frontend (terminal 2)
Copy-Item frontend/.env.example frontend/.env
npm run dev --prefix frontend
# http://localhost:5173
```
