const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/customerController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('customers'));

router.get('/', ctrl.list);
router.get('/export', ctrl.exportCsv); // must precede /:id
router.get('/:id', ctrl.detail);
router.delete('/:id', ctrl.deleteCustomer);

module.exports = router;
