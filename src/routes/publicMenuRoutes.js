const express = require('express');
const { getCategories, getProducts, getTopSellers, getPublicSettings } = require('../controllers/publicMenuController');

// /api/menu/* — no auth, read-only (architecture doc, section 3). Nothing
// in this router ever calls a write method on a model.
const router = express.Router();

router.get('/categories', getCategories);
router.get('/products', getProducts);
router.get('/top-sellers', getTopSellers);
// Code review fix #5 — see publicMenuController.getPublicSettings for the
// exact field whitelist and why it's safe to expose unauthenticated.
router.get('/settings', getPublicSettings);

module.exports = router;
