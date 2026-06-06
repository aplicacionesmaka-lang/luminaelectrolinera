const router = require('express').Router();
const { list, add, setFavorite, toggle, remove } = require('../controllers/paymentMethodController');
const { authMiddleware } = require('../utils/auth');

router.get('/',                  authMiddleware, list);
router.post('/',                 authMiddleware, add);
router.patch('/:id/favorite',   authMiddleware, setFavorite);
router.patch('/:id/toggle',     authMiddleware, toggle);
router.delete('/:id',           authMiddleware, remove);

module.exports = router;
