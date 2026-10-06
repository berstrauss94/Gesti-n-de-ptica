// =====================================================================
// Rutas de autenticación.
// =====================================================================

const express = require('express');
const { login, me } = require('../controllers/authController');
const { authRequired } = require('../middlewares/auth');

const router = express.Router();

// Público
router.post('/login', login);

// Protegido: devuelve los datos del usuario del token
router.get('/me', authRequired, me);

module.exports = router;
