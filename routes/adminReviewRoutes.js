const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/reviewController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('reviews'));

router.get('/', ctrl.adminList);
router.patch('/:id', ctrl.adminUpdate);
router.delete('/:id', ctrl.adminRemove);

module.exports = router;
