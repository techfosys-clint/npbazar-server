const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/collectionController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public
router.get('/', ctrl.list);
router.get('/:slug', ctrl.getBySlug);

// Admin (needs 'collections' page access) — note: these use the numeric/:id
// form, so register them before the public :slug route would ever conflict
// (Express matches by path shape + method, both are GET but different verbs
// below are POST/PATCH/DELETE so there's no ambiguity).
router.post('/', adminAuth, requirePage('collections'), ctrl.create);
router.get('/:id/products', adminAuth, requirePage('collections'), ctrl.products);
router.post('/:id/products', adminAuth, requirePage('collections'), ctrl.addProduct);
router.delete('/:id/products/:productId', adminAuth, requirePage('collections'), ctrl.removeProduct);
router.patch('/:id', adminAuth, requirePage('collections'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('collections'), ctrl.remove);

module.exports = router;
