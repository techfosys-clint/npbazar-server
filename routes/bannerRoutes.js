const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/bannerController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public (storefront reads active banners per placement)
router.get('/', ctrl.list);

// Admin (needs 'banners' page access)
router.post('/', adminAuth, requirePage('banners'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('banners'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('banners'), ctrl.remove);

module.exports = router;
