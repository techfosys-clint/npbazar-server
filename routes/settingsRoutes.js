const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/settingsController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.get('/', ctrl.get); // public storefront config
router.patch('/', adminAuth, requirePage('settings'), ctrl.update);

module.exports = router;
