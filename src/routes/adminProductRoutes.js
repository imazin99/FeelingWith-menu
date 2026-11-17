const express = require('express');
const ctrl = require('../controllers/adminProductController');
const validate = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const {
  createProductRules,
  updateProductRules,
  setAddOnsRules,
  idParamRule,
} = require('../validators/productValidators');

const router = express.Router();

router.get('/', ctrl.listProducts);
router.post('/', createProductRules, validate, ctrl.createProduct);
router.get('/:id', idParamRule, validate, ctrl.getProduct);
router.put('/:id', updateProductRules, validate, ctrl.updateProduct);
router.patch('/:id/visibility', idParamRule, validate, ctrl.setVisibility);
router.patch('/:id/availability', idParamRule, validate, ctrl.setAvailability);
router.patch('/:id/archive', idParamRule, validate, ctrl.setArchived);
router.patch('/:id/reorder', idParamRule, validate, ctrl.reorder);
router.patch('/:id/top-seller', idParamRule, validate, ctrl.setTopSeller);
router.patch('/:id/top-seller-order', idParamRule, validate, ctrl.reorderTopSeller);
router.post('/:id/addons', setAddOnsRules, validate, ctrl.setAddOns);
router.post('/:id/image', idParamRule, validate, upload.single('image'), ctrl.uploadImage);

module.exports = router;
