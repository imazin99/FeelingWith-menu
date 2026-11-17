const express = require('express');
const ctrl = require('../controllers/adminAddOnController');
const validate = require('../middleware/validate');
const { createAddOnRules, updateAddOnRules, idParamRule } = require('../validators/addOnValidators');

const router = express.Router();

router.get('/', ctrl.listAddOns);
router.post('/', createAddOnRules, validate, ctrl.createAddOn);
router.get('/:id', idParamRule, validate, ctrl.getAddOn);
router.put('/:id', updateAddOnRules, validate, ctrl.updateAddOn);
router.patch('/:id/visibility', idParamRule, validate, ctrl.setVisibility);
router.patch('/:id/availability', idParamRule, validate, ctrl.setAvailability);
router.patch('/:id/archive', idParamRule, validate, ctrl.setArchived);

module.exports = router;
