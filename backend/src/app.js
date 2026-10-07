// =====================================================================
// Configuración de la aplicación Express (middlewares + rutas).
// Separada de server.js para facilitar pruebas.
// =====================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { CORS_ORIGIN, SERVE_FRONTEND } = require('./config/env');
const { uploadsPath } = require('./config/paths');
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const marcosRoutes = require('./routes/marcosRoutes');
const graduacionesRoutes = require('./routes/graduacionesRoutes');
const stockRoutes = require('./routes/stockRoutes');
const ventasRoutes = require('./routes/ventasRoutes');
const comprasRoutes = require('./routes/comprasRoutes');
const fiscalRoutes = require('./routes/fiscalRoutes');

const app = express();

// Middlewares base
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir las imágenes subidas de forma estática.
// setHeaders habilita que el <canvas> del frontend pueda exportar sin
// quedar "tainted" cuando el frontend se sirve desde otro origen.
app.use(
  '/uploads',
  express.static(uploadsPath, {
    setHeaders: (res) => {
      res.set('Access-Control-Allow-Origin', CORS_ORIGIN);
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// Healthcheck (útil para Railway)
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/marcos', marcosRoutes);
app.use('/api/graduaciones', graduacionesRoutes);
app.use('/api', stockRoutes);
app.use('/api', ventasRoutes);
app.use('/api', comprasRoutes);
app.use('/api', fiscalRoutes);

// 404 solo para rutas de API (deja pasar lo demás al frontend/SPA)
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// --- Servido del frontend en producción (modo monolito en Railway) ---
if (SERVE_FRONTEND) {
  const distPath = path.join(__dirname, '..', '..', 'frontend', 'dist');

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // Fallback SPA: cualquier ruta no-API devuelve el index.html
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(
      `SERVE_FRONTEND=true pero no existe el build en ${distPath}. ` +
        'Ejecuta el build del frontend antes de arrancar.'
    );
  }
}

// 404 genérico (si no se sirve frontend)
app.use((req, res) => {
  res.status(404).json({ error: 'Recurso no encontrado' });
});

// Manejador de errores central (incluye errores de multer)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err.message);
  const status = err.status || 400;
  res.status(status).json({ error: err.message || 'Error en la solicitud' });
});

module.exports = app;
