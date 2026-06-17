const router = require('express').Router();
const { list, create, update, remove, updateStationFinancial, liquidacion } = require('../controllers/aliadoController');
const { authMiddleware, requireRole } = require('../utils/auth');

// rutas fijas primero (antes de /:id)
router.get('/liquidacion',                     authMiddleware, requireRole('admin'), liquidacion);
router.patch('/station/:stationId',            authMiddleware, requireRole('admin'), updateStationFinancial);

router.get('/',    authMiddleware, requireRole('admin'), list);
router.post('/',   authMiddleware, requireRole('admin'), create);
router.put('/:id', authMiddleware, requireRole('admin'), update);
router.delete('/:id', authMiddleware, requireRole('admin'), remove);

module.exports = router;
