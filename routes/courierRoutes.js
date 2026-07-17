const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/courierController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('courier'));

router.get('/providers', ctrl.listProviders);
router.get('/accounts', ctrl.listAccounts);
router.post('/accounts', ctrl.connectAccount);
router.patch('/accounts/:id', ctrl.updateAccount);
router.post('/accounts/:id/test', ctrl.testConnection);
router.patch('/accounts/:id/default', ctrl.setDefault);
router.delete('/accounts/:id', ctrl.removeAccount);

module.exports = router;
