const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/analyticsController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// Public — the storefront calls this on every page load to record a page view.
router.post('/track', ctrl.track);

// Admin (needs 'reports' page access)
router.use(adminAuth, requirePage('reports'));

router.get('/summary', ctrl.summary);
router.get('/sales-over-time', ctrl.salesOverTime);
router.get('/aov-over-time', ctrl.aovOverTime);
router.get('/conversion-over-time', ctrl.conversionOverTime);
router.get('/by-channel', ctrl.byChannel);
router.get('/by-product', ctrl.byProduct);
router.get('/by-collection', ctrl.byCollection);
router.get('/products-sell-through', ctrl.sellThrough);
router.get('/sessions-over-time', ctrl.sessionsOverTime);
router.get('/device-breakdown', ctrl.deviceBreakdown);
router.get('/referrer-breakdown', ctrl.referrerBreakdown);
router.get('/landing-pages', ctrl.landingPages);
router.get('/funnel', ctrl.funnel);

module.exports = router;
