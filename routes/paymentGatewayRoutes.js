const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentGatewayController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public — the checkout page needs this list for both guests and logged-in users.
router.get('/active', ctrl.listActive);

router.use(adminAuth, requirePage('payments'));

router.get('/providers', ctrl.listProviders);
router.get('/accounts', ctrl.listAccounts);
router.post('/accounts', ctrl.connectAccount);
router.patch('/accounts/:id', ctrl.updateAccount);
router.post('/accounts/:id/test', ctrl.testConnection);
router.delete('/accounts/:id', ctrl.removeAccount);

module.exports = router;
