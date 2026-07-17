const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cartController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('carts'));

router.get('/', ctrl.adminList);

module.exports = router;
