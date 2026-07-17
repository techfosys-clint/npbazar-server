const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const shipmentCtrl = require('../controllers/shipmentController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

router.use(adminAuth, requirePage('orders'));

router.post('/', ctrl.adminCreate);
router.get('/', ctrl.adminList);
router.get('/:id', ctrl.adminDetail);
router.patch('/:id/status', ctrl.adminUpdateStatus);
router.get('/:id/invoice', ctrl.adminInvoicePdf);
router.post('/:id/send-invoice', ctrl.adminSendInvoice);
router.post('/:id/shipment', shipmentCtrl.createShipment);
router.post('/:id/shipment/refresh', shipmentCtrl.refreshShipmentStatus);

module.exports = router;
