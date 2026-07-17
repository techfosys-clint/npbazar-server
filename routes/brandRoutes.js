const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/brandController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public
router.get('/', ctrl.list);
router.get('/:slug', ctrl.getBySlug);

// Admin (needs 'brands' page access)
router.post('/', adminAuth, requirePage('brands'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('brands'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('brands'), ctrl.remove);

module.exports = router;
