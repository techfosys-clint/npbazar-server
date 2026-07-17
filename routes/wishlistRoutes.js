const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/wishlistController');
const { userAuth } = require('../middleware/userAuth');

router.use(userAuth);

router.get('/', ctrl.getWishlist);
router.post('/', ctrl.addItem);
router.delete('/:productId', ctrl.removeItem);

module.exports = router;
