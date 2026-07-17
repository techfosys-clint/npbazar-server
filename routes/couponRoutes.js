const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/couponController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public: validate a coupon against a subtotal (guest and logged-in checkout
// both need this — the handler itself uses no req.user data).
router.post('/validate', ctrl.validate);

// Admin (needs 'coupons' page access)
router.get('/', adminAuth, requirePage('coupons'), ctrl.list);
router.post('/', adminAuth, requirePage('coupons'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('coupons'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('coupons'), ctrl.remove);

module.exports = router;
