const router  = require('express').Router();
const { list, getById, create, update, updatePrice } = require('../controllers/stationController');
const { authMiddleware, requireRole }   = require('../utils/auth');

router.get('/',       authMiddleware, list);
router.get('/:id',    authMiddleware, getById);
router.post('/',      authMiddleware, requireRole('admin'), create);
router.put('/:id',             authMiddleware, requireRole('admin'), update);
router.patch('/:id/price',     authMiddleware, requireRole('admin'), updatePrice);

module.exports = router;
