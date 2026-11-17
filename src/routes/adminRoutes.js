const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');

const categoryRoutes = require('./adminCategoryRoutes');
const addOnRoutes = require('./adminAddOnRoutes');
const productRoutes = require('./adminProductRoutes');
const userRoutes = require('./adminUserRoutes');
const settingsRoutes = require('./adminSettingsRoutes');

// Architecture doc, section 3 & 4: auth and CSRF are mounted on the WHOLE
// /api/admin router, not added route-by-route — this is what makes it
// structurally impossible for an unauthenticated or CSRF-unprotected
// request to reach any admin write, rather than relying on a check that
// could be forgotten on one route.
const router = express.Router();

router.use(requireAuth);
router.use(requireCsrf);

router.use('/categories', categoryRoutes);
router.use('/addons', addOnRoutes);
router.use('/products', productRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
