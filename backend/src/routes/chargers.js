const router = require('express').Router();
const { list, getById, create, remoteStart, remoteStop, activeSession } = require('../controllers/chargerController');
const { authMiddleware, requireRole } = require('../utils/auth');

router.get('/',               authMiddleware, list);
router.get('/:id',            authMiddleware, getById);
router.post('/',              authMiddleware, requireRole('admin'), create);
router.post('/:id/start',     authMiddleware, remoteStart);
router.post('/:id/stop',      authMiddleware, remoteStop);
router.get('/:id/session',    authMiddleware, activeSession);

module.exports = router;
