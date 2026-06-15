const router = require('express').Router();
const { list, getById, create, remoteStart, remoteStop, activeSession, resetCharger, listUnassigned, assignStation } = require('../controllers/chargerController');
const { authMiddleware, requireRole } = require('../utils/auth');

router.get('/unassigned',     authMiddleware, requireRole('admin'), listUnassigned);
router.get('/',               authMiddleware, list);
router.get('/:id',            authMiddleware, getById);
router.post('/',              authMiddleware, requireRole('admin'), create);
router.post('/:id/start',     authMiddleware, remoteStart);
router.post('/:id/stop',      authMiddleware, remoteStop);
router.get('/:id/session',    authMiddleware, activeSession);
router.post('/:id/reset',     authMiddleware, requireRole('admin'), resetCharger);
router.patch('/:id/assign',   authMiddleware, requireRole('admin'), assignStation);

module.exports = router;
