const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/courierWebhookController');

// Public — couriers call this directly, no adminAuth. Auth is the
// URL-embedded webhookSecret token, checked inside the controller.
router.post('/:provider/:token', ctrl.receive);

module.exports = router;
