const express = require('express');
const ctrl = require('../controllers/adminSettingsController');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.get('/', ctrl.getSettings);
router.patch('/', ctrl.updateSettings);
router.post('/logo', upload.single('image'), ctrl.uploadLogo);

module.exports = router;
