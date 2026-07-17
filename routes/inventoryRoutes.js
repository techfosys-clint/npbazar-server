const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('inventory'));

router.get('/', ctrl.list);
router.get('/logs', ctrl.logs);
router.get('/profit-report', ctrl.profitReport);
router.post('/stock-in', ctrl.stockIn);
router.post('/adjust', ctrl.adjust);

module.exports = router;
