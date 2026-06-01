const router  = require('express').Router();
const express = require('express');
const { topup, wompiWebhook, stripeWebhook, history } = require('../controllers/paymentController');
const { authMiddleware } = require('../utils/auth');

router.post('/topup',           authMiddleware, topup);
router.get('/history',          authMiddleware, history);
router.post('/webhook/wompi',   express.json(), wompiWebhook);
router.post('/webhook/stripe',  express.raw({ type: 'application/json' }), stripeWebhook);

module.exports = router;
