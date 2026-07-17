const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/addressController');
const { userAuth } = require('../middleware/userAuth');

router.use(userAuth);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
