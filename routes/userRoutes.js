const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/userAuthController');
const { userAuth } = require('../middleware/userAuth');

// --- Public ---
router.post('/register', ctrl.register);
router.post('/verify-otp', ctrl.verifyOtp);
router.post('/resend-otp', ctrl.resendOtp);
router.post('/login', ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

// --- Protected ---
router.get('/me', userAuth, ctrl.me);

module.exports = router;
