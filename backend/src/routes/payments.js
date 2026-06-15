const router  = require('express').Router();
const express = require('express');
const { topup, wompiWebhook, payuWebhook, nequiWebhook, history, checkStatus } = require('../controllers/paymentController');
const { authMiddleware } = require('../utils/auth');

router.post('/topup',                authMiddleware, topup);
router.get('/history',               authMiddleware, history);
router.get('/status/:reference',     authMiddleware, checkStatus);

// Webhooks públicos — cada pasarela llama a su endpoint
router.post('/wompi/webhook',        express.json(), wompiWebhook);
router.post('/payu/webhook',         express.urlencoded({ extended: true }), payuWebhook);
router.post('/nequi/webhook',        express.json(), nequiWebhook);

module.exports = router;
