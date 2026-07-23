const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/adminAuthController');
const { adminAuth, requirePage } = require('../middleware/adminAuth');

// --- Public ---
router.get('/pages', ctrl.getPages);          // available pages for the register form
router.get('/check-superadmin', ctrl.checkSuperAdmin); // check if first admin exists
router.post('/register', ctrl.registerSuperAdmin); // first-ever admin => super admin
router.post('/login', ctrl.login);
router.post('/forgot-password', ctrl.forgotPassword);
router.post('/reset-password', ctrl.resetPassword);

// --- Protected (any logged-in admin) ---
router.get('/me', adminAuth, ctrl.me);
router.patch('/me', adminAuth, ctrl.updateMyProfile);

// --- Protected (needs access to the "staff" page) ---
router.post('/create', adminAuth, requirePage('staff'), ctrl.createAdminOrStaff);
router.get('/', adminAuth, requirePage('staff'), ctrl.listAdmins);
router.patch('/:id', adminAuth, requirePage('staff'), ctrl.updateAdmin);
router.delete('/:id', adminAuth, requirePage('staff'), ctrl.deleteAdmin);

module.exports = router;
