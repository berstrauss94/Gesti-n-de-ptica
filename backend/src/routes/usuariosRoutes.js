// =====================================================================
// Rutas de Usuarios / Clientes (protegidas por JWT).
// Incluye las fotos de seguimiento anidadas bajo cada cliente.
// =====================================================================

const express = require('express');
const {
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
} = require('../controllers/usuariosController');
const {
  subirFotos,
  listarFotos,
  eliminarFoto,
} = require('../controllers/fotosController');
const {
  listar: listarGraduaciones,
  crear: crearGraduacion,
} = require('../controllers/graduacionesController');
const { authRequired, requireRole } = require('../middlewares/auth');
const { upload } = require('../middlewares/upload');

const router = express.Router();

// Todas las rutas de clientes requieren autenticación
router.use(authRequired);

// --- CRUD de clientes ---
router.get('/', listar);
router.post('/', crear);
router.get('/:id', obtener);
router.put('/:id', actualizar);
// Eliminar cliente es destructivo: solo admin
router.delete('/:id', requireRole('admin'), eliminar);

// --- Fotos de seguimiento (hasta 3), anidadas al cliente ---
router.get('/:usuarioId/fotos', listarFotos);
router.post('/:usuarioId/fotos', upload.array('fotos', 3), subirFotos);
router.delete('/:usuarioId/fotos/:fotoId', eliminarFoto);

// --- Graduaciones anidadas al cliente ---
router.get('/:usuarioId/graduaciones', listarGraduaciones);
router.post('/:usuarioId/graduaciones', crearGraduacion);

module.exports = router;
