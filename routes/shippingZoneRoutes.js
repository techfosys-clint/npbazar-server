const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/shippingZoneController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public (checkout can preview zone list if needed)
router.get('/', ctrl.list);

// Admin (needs 'shipping' page access)
router.post('/', adminAuth, requirePage('shipping'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('shipping'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('shipping'), ctrl.remove);

module.exports = router;
