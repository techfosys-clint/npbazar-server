const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/phoneVerificationController');

// Public — guests need to verify a phone with no account at all.
router.post('/send', ctrl.sendOtp);
router.post('/verify', ctrl.verifyOtp);

module.exports = router;
