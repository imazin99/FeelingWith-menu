const express = require('express');
const ctrl = require('../controllers/adminCategoryController');
const validate = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { createCategoryRules, updateCategoryRules, idParamRule } = require('../validators/categoryValidators');

const router = express.Router();

router.get('/', ctrl.listCategories);
router.post('/', createCategoryRules, validate, ctrl.createCategory);
router.get('/:id', idParamRule, validate, ctrl.getCategory);
router.put('/:id', updateCategoryRules, validate, ctrl.updateCategory);
router.patch('/:id/visibility', idParamRule, validate, ctrl.setVisibility);
router.patch('/:id/archive', idParamRule, validate, ctrl.setArchived);
router.patch('/:id/reorder', idParamRule, validate, ctrl.reorder);
router.post('/:id/image', idParamRule, validate, upload.single('image'), ctrl.uploadImage);
router.delete('/:id/image', idParamRule, validate, ctrl.removeImage);

module.exports = router;
