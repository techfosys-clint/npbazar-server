const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/cartController');
const { userAuth } = require('../middleware/userAuth');

router.use(userAuth); // all cart routes require a logged-in user

router.get('/', ctrl.getCart);
router.post('/', ctrl.addItem);
router.patch('/item', ctrl.updateItem);
router.delete('/item/:productId', ctrl.removeItem);
router.delete('/', ctrl.clearCart);

module.exports = router;
