const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/faqController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public
router.get('/', ctrl.list);

// Admin (needs 'faqs' page access)
router.post('/', adminAuth, requirePage('faqs'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('faqs'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('faqs'), ctrl.remove);

module.exports = router;
