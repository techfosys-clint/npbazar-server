const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const { userAuth } = require('../middleware/userAuth');

// Public: guest one-click checkout + order tracking (no account needed).
router.post('/guest', ctrl.guestCreate);
router.get('/track', ctrl.track);

router.use(userAuth); // remaining storefront order routes require a logged-in user

router.post('/', ctrl.create);                 // checkout
router.get('/my', ctrl.myOrders);
router.get('/my/:id', ctrl.myOrderDetail);
router.post('/my/:id/cancel', ctrl.cancelMyOrder);

module.exports = router;
