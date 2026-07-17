const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/dashboardController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('dashboard'));

router.get('/stats', ctrl.stats);
router.get('/order-status', ctrl.orderStatusBreakdown);
router.get('/sales', ctrl.salesChart);
router.get('/top-products', ctrl.topProducts);
router.get('/low-stock', ctrl.lowStock);

module.exports = router;
