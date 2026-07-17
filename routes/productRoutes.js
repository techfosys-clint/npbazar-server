const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/productController');
const reviewCtrl = require('../controllers/reviewController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');
const { userAuth } = require('../middleware/userAuth');

// Public
router.get('/', ctrl.list);
router.get('/:slug', ctrl.getBySlug);

// Product reviews (nested)
router.get('/:productId/reviews', reviewCtrl.listForProduct);      // public
router.post('/:productId/reviews', userAuth, reviewCtrl.create);   // logged-in user

// Admin (needs 'products' page access)
router.post('/', adminAuth, requirePage('products'), ctrl.create);
router.post('/bulk-delete', adminAuth, requirePage('products'), ctrl.bulkDelete);
router.post('/bulk-duplicate', adminAuth, requirePage('products'), ctrl.bulkDuplicate);
router.post('/bulk-status', adminAuth, requirePage('products'), ctrl.bulkUpdateStatus);
router.patch('/:id', adminAuth, requirePage('products'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('products'), ctrl.remove);

module.exports = router;
