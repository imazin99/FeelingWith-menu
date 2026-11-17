const express = require('express');
const ctrl = require('../controllers/adminUserController');
const validate = require('../middleware/validate');
const { createUserRules } = require('../validators/userValidators');

const router = express.Router();

// Any authenticated admin may list/create accounts in this phase — no
// hierarchy to check yet (architecture doc, section 4).
router.get('/', ctrl.listUsers);
router.post('/', createUserRules, validate, ctrl.createUser);
router.patch('/:id/status', ctrl.setStatus);
router.post('/:id/revoke', ctrl.revokeSessions);

module.exports = router;
