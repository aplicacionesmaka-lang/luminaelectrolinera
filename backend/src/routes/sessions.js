const router = require('express').Router();
const { myHistory, myStats, getById, listAll, summary } = require('../controllers/sessionController');
const { getAnalytics } = require('../controllers/analyticsController');
const { authMiddleware, requireRole } = require('../utils/auth');

router.get('/my',       authMiddleware, myHistory);
router.get('/mystats',  authMiddleware, myStats);
router.get('/summary',   authMiddleware, requireRole('admin'), summary);
router.get('/analytics', authMiddleware, requireRole('admin'), getAnalytics);
router.get('/',         authMiddleware, requireRole('admin'), listAll);
router.get('/:id',      authMiddleware, getById);

module.exports = router;
