const router = require('express').Router();
const { create, myReservations, cancel, availability } = require('../controllers/reservationController');
const { authMiddleware } = require('../utils/auth');

router.get('/my',            authMiddleware, myReservations);
router.get('/availability',  authMiddleware, availability);
router.post('/',             authMiddleware, create);
router.delete('/:id',        authMiddleware, cancel);

module.exports = router;
