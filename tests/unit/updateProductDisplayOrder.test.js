// Regression (owner-reported bug): PUT /api/admin/products/:id
// (updateProduct) read and assigned name/description/price/categoryId/
// variants from the request body, but never displayOrder — even though
// the Edit Product form sends it. The fix adds the missing read+assign;
// validation (non-negative integer) is enforced the same way as
// createProduct and the reorder endpoint, via
// src/validators/productValidators.js's updateProductRules (exercised in
// the integration suite, tests/integration/adminProduct.test.js, since
// express-validator needs a real request/route to run against).
//
// This unit test exercises the controller function directly against a
// REAL `Product` mongoose document (genuine schema casting/defaults — no
// mock standing in for Mongoose's own behavior), with only the two
// DB-touching operations stubbed: `Product.findById` (mocked to resolve
// the real in-memory document) and that document's own `.save()`/
// `.populate()` methods (stubbed to resolve immediately, since there's no
// live database in this sandbox — see tests/unit/productPricing.test.js
// for the same "real schema, no DB connection" technique applied to
// `.validate()`). It needs no database and genuinely runs here.
const mongoose = require('mongoose');

function runHandler(handler, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = jest.fn(() => resolve({ res, next }));
    res.json = jest.fn(() => resolve({ res, next }));
    handler(req, res, next);
  });
}

describe('adminProductController.updateProduct — displayOrder (regression)', () => {
  let Product;
  let updateProduct;
  const categoryId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.resetModules();
    Product = require('../../src/models/Product');
    jest.doMock('../../src/models/Product', () => Product);
    ({ updateProduct } = require('../../src/controllers/adminProductController'));
  });

  function fakeSavedProduct(initial) {
    const product = new Product({ name: 'Latte', price: 5000, categoryId, ...initial });
    product.save = jest.fn().mockResolvedValue(undefined);
    product.populate = jest.fn().mockResolvedValue(product);
    jest.spyOn(Product, 'findById').mockResolvedValue(product);
    return product;
  }

  test("updating an existing product's displayOrder persists the new value", async () => {
    const product = fakeSavedProduct({ displayOrder: 2 });

    const req = { params: { id: product._id.toString() }, body: { displayOrder: 7 } };
    const { res } = await runHandler(updateProduct, req);

    expect(product.save).toHaveBeenCalledTimes(1);
    expect(product.displayOrder).toBe(7);
    expect(res.json).toHaveBeenCalledWith({ product });
  });

  test('an order-only update does not change other fields', async () => {
    const product = fakeSavedProduct({
      name: 'Mocha',
      description: 'Rich and chocolatey',
      price: 6000,
      displayOrder: 3,
    });

    const req = { params: { id: product._id.toString() }, body: { displayOrder: 10 } };
    await runHandler(updateProduct, req);

    expect(product.displayOrder).toBe(10);
    expect(product.name).toBe('Mocha');
    expect(product.description).toBe('Rich and chocolatey');
    expect(product.price).toBe(6000);
  });

  test('omitting displayOrder from the request body leaves the existing value untouched', async () => {
    const product = fakeSavedProduct({ displayOrder: 4 });

    const req = { params: { id: product._id.toString() }, body: { name: 'Renamed Latte' } };
    await runHandler(updateProduct, req);

    expect(product.displayOrder).toBe(4);
    expect(product.name).toBe('Renamed Latte');
  });

  test('displayOrder of exactly 0 is accepted (falsy value must not be treated as "not provided")', async () => {
    const product = fakeSavedProduct({ displayOrder: 9 });

    const req = { params: { id: product._id.toString() }, body: { displayOrder: 0 } };
    await runHandler(updateProduct, req);

    expect(product.displayOrder).toBe(0);
  });
});
