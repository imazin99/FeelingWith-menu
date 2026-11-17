// Manually-curated Top Sellers (owner-approved enhancement) — unit tests
// for the two admin controller functions in isolation (Product model
// mocked, no database). Public-filtering and persistence-through-a-real-
// DB behavior is covered by tests/integration/topSellers.test.js; this
// file only proves the controllers' own validation and response shape.
function runHandler(handler, req) {
  return new Promise((resolve) => {
    const res = {};
    const next = jest.fn(() => resolve({ res, next }));
    res.json = jest.fn(() => resolve({ res, next }));
    handler(req, res, next);
  });
}

describe('adminProductController.setTopSeller', () => {
  let Product;
  let setTopSeller;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Product', () => ({ findByIdAndUpdate: jest.fn() }));
    Product = require('../../src/models/Product');
    ({ setTopSeller } = require('../../src/controllers/adminProductController'));
  });

  test('rejects a non-boolean isTopSeller', async () => {
    const req = { params: { id: 'p1' }, body: { isTopSeller: 'yes' } };
    const { next } = await runHandler(setTopSeller, req);
    expect(next.mock.calls[0][0].message).toMatch(/must be a boolean/i);
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('sets isTopSeller to true and returns the updated product', async () => {
    const updated = { _id: 'p1', isTopSeller: true };
    Product.findByIdAndUpdate.mockResolvedValue(updated);
    const req = { params: { id: 'p1' }, body: { isTopSeller: true } };
    const { res } = await runHandler(setTopSeller, req);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('p1', { isTopSeller: true }, { new: true, runValidators: true });
    expect(res.json).toHaveBeenCalledWith({ product: updated });
  });

  test('sets isTopSeller to false (deselect)', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', isTopSeller: false });
    const req = { params: { id: 'p1' }, body: { isTopSeller: false } };
    await runHandler(setTopSeller, req);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('p1', { isTopSeller: false }, { new: true, runValidators: true });
  });

  test('404s when the product does not exist', async () => {
    Product.findByIdAndUpdate.mockResolvedValue(null);
    const req = { params: { id: 'missing' }, body: { isTopSeller: true } };
    const { next } = await runHandler(setTopSeller, req);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });
});

describe('adminProductController.reorderTopSeller', () => {
  let Product;
  let reorderTopSeller;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('../../src/models/Product', () => ({ findByIdAndUpdate: jest.fn() }));
    Product = require('../../src/models/Product');
    ({ reorderTopSeller } = require('../../src/controllers/adminProductController'));
  });

  test('rejects a negative topSellerOrder', async () => {
    const req = { params: { id: 'p1' }, body: { topSellerOrder: -1 } };
    const { next } = await runHandler(reorderTopSeller, req);
    expect(next.mock.calls[0][0].message).toMatch(/non-negative/i);
    expect(Product.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('rejects a non-numeric topSellerOrder', async () => {
    const req = { params: { id: 'p1' }, body: { topSellerOrder: 'first' } };
    const { next } = await runHandler(reorderTopSeller, req);
    expect(next.mock.calls[0][0].message).toMatch(/non-negative/i);
  });

  test('accepts 0 as a valid order', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', topSellerOrder: 0 });
    const req = { params: { id: 'p1' }, body: { topSellerOrder: 0 } };
    const { res } = await runHandler(reorderTopSeller, req);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('p1', { topSellerOrder: 0 }, { new: true, runValidators: true });
    expect(res.json).toHaveBeenCalledWith({ product: { _id: 'p1', topSellerOrder: 0 } });
  });

  test('persists a positive topSellerOrder', async () => {
    Product.findByIdAndUpdate.mockResolvedValue({ _id: 'p1', topSellerOrder: 4 });
    const req = { params: { id: 'p1' }, body: { topSellerOrder: 4 } };
    await runHandler(reorderTopSeller, req);
    expect(Product.findByIdAndUpdate).toHaveBeenCalledWith('p1', { topSellerOrder: 4 }, { new: true, runValidators: true });
  });

  test('404s when the product does not exist', async () => {
    Product.findByIdAndUpdate.mockResolvedValue(null);
    const req = { params: { id: 'missing' }, body: { topSellerOrder: 1 } };
    const { next } = await runHandler(reorderTopSeller, req);
    expect(next.mock.calls[0][0].message).toMatch(/not found/i);
  });
});
