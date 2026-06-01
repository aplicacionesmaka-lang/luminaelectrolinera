const router = require('express').Router();
const { register, login, me, getBalance, listUsers, listUsersWithStats } = require('../controllers/userController');
const { authMiddleware, requireRole } = require('../utils/auth');

router.post('/register', register);
router.post('/login',    login);
router.get('/me',        authMiddleware, me);
router.get('/balance',   authMiddleware, getBalance);
router.get('/',          authMiddleware, requireRole('admin'), listUsers);
router.get('/stats',     authMiddleware, requireRole('admin'), listUsersWithStats);

module.exports = router;
