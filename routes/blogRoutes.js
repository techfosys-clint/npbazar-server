const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/blogController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public
router.get('/', ctrl.list);

// Admin (needs 'blogs' page access)
router.post('/', adminAuth, requirePage('blogs'), ctrl.create);
router.patch('/:id', adminAuth, requirePage('blogs'), ctrl.update);
router.delete('/:id', adminAuth, requirePage('blogs'), ctrl.remove);

module.exports = router;
