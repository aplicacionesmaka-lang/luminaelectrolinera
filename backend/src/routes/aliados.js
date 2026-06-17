const router = require('express').Router();
const { list, create, update, remove, updateStationFinancial, liquidacion } = require('../controllers/aliadoController');
const { authMiddleware, requireRole } = require('../utils/auth');

router.get('/',                                    authMiddleware, requireRole('admin'), list);
router.post('/',                                   authMiddleware, requireRole('admin'), create);
router.put('/:id',                                 authMiddleware, requireRole('admin'), update);
router.delete('/:id',                              authMiddleware, requireRole('admin'), remove);
router.patch('/stations/:stationId/financial',     authMiddleware, requireRole('admin'), updateStationFinancial);
router.get('/liquidacion',                         authMiddleware, requireRole('admin'), liquidacion);

module.exports = router;
