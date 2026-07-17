const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');

// Fully public — the customer's browser and the gateway's own servers hit these.
router.all('/callback/:provider/:orderNumber', ctrl.callback);
router.post('/ipn/:provider/:token', ctrl.ipn);

module.exports = router;
