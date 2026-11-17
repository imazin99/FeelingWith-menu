const AddOn = require('../models/AddOn');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/admin/addons
const listAddOns = asyncHandler(async (req, res) => {
  const addOns = await AddOn.find().sort({ name: 1 });
  res.json({ addOns });
});

// POST /api/admin/addons
const createAddOn = asyncHandler(async (req, res) => {
  const { name, price } = req.body;
  const addOn = await AddOn.create({ name, price });
  res.status(201).json({ addOn });
});

// GET /api/admin/addons/:id
const getAddOn = asyncHandler(async (req, res) => {
  const addOn = await AddOn.findById(req.params.id);
  if (!addOn) throw ApiError.notFound('Add-on not found.');
  res.json({ addOn });
});

// PUT /api/admin/addons/:id — name/price
const updateAddOn = asyncHandler(async (req, res) => {
  const { name, price } = req.body;
  const addOn = await AddOn.findByIdAndUpdate(
    req.params.id,
    { ...(name !== undefined ? { name } : {}), ...(price !== undefined ? { price } : {}) },
    { new: true, runValidators: true }
  );
  if (!addOn) throw ApiError.notFound('Add-on not found.');
  res.json({ addOn });
});

// PATCH /api/admin/addons/:id/visibility — { isVisible }
const setVisibility = asyncHandler(async (req, res) => {
  const { isVisible } = req.body;
  if (typeof isVisible !== 'boolean') throw ApiError.badRequest('isVisible must be a boolean.');
  const addOn = await AddOn.findByIdAndUpdate(req.params.id, { isVisible }, { new: true, runValidators: true });
  if (!addOn) throw ApiError.notFound('Add-on not found.');
  res.json({ addOn });
});

// PATCH /api/admin/addons/:id/availability — { isAvailable }
const setAvailability = asyncHandler(async (req, res) => {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== 'boolean') throw ApiError.badRequest('isAvailable must be a boolean.');
  const addOn = await AddOn.findByIdAndUpdate(
    req.params.id,
    { isAvailable },
    { new: true, runValidators: true }
  );
  if (!addOn) throw ApiError.notFound('Add-on not found.');
  res.json({ addOn });
});

// PATCH /api/admin/addons/:id/archive — { isArchived }
const setArchived = asyncHandler(async (req, res) => {
  const { isArchived } = req.body;
  if (typeof isArchived !== 'boolean') throw ApiError.badRequest('isArchived must be a boolean.');
  const addOn = await AddOn.findByIdAndUpdate(
    req.params.id,
    { isArchived },
    { new: true, runValidators: true }
  );
  if (!addOn) throw ApiError.notFound('Add-on not found.');
  res.json({ addOn });
});

module.exports = {
  listAddOns,
  createAddOn,
  getAddOn,
  updateAddOn,
  setVisibility,
  setAvailability,
  setArchived,
};
