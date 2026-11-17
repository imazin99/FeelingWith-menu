// Pricing decision (approved, code review round 2 — fix #6): a product is
// either fixed-price (`price`, no variants) or variant-priced (one or more
// `variants`, each with its own required, integer, non-negative `price` —
// no `priceModifier`), never both.
//
// Mongoose schema/document validation (`.validate()`) runs entirely in
// memory against the schema — it needs no live database connection, so
// this is a genuine, executable unit test (unlike the full integration
// suite, which needs mongodb-memory-server and could not be run in this
// sandbox). It exercises the exact same code path
// (productSchema.pre('validate') + the variant price SchemaType) that the
// admin controllers rely on.
const mongoose = require('mongoose');
const Product = require('../../src/models/Product');

const categoryId = new mongoose.Types.ObjectId();

async function validationErrors(doc) {
  try {
    await doc.validate();
    return null;
  } catch (err) {
    if (!(err instanceof mongoose.Error.ValidationError)) throw err;
    return err;
  }
}

describe('Product pricing — fixed vs. variant, mutually exclusive (fix #6)', () => {
  test('a fixed-price product with no variants is valid', async () => {
    const product = new Product({ name: 'Latte', price: 5000, categoryId });
    const err = await validationErrors(product);
    expect(err).toBeNull();
  });

  test('a variant-priced product with no top-level price is valid', async () => {
    const product = new Product({
      name: 'Latte',
      categoryId,
      variants: [
        { name: 'Small', price: 5000 },
        { name: 'Medium', price: 6500 },
        { name: 'Large', price: 8000 },
      ],
    });
    const err = await validationErrors(product);
    expect(err).toBeNull();
    expect(product.variants.map((v) => v.price)).toEqual([5000, 6500, 8000]);
  });

  test('a product with BOTH a fixed price and variants is invalid', async () => {
    const product = new Product({
      name: 'Latte',
      price: 5000,
      categoryId,
      variants: [{ name: 'Small', price: 5000 }],
    });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(err.errors.price).toBeDefined();
    expect(err.errors.price.message).toMatch(/cannot have both/i);
  });

  test('a product with NEITHER a fixed price nor any variants is invalid', async () => {
    const product = new Product({ name: 'Latte', categoryId });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(err.errors.price).toBeDefined();
  });

  test('an explicitly empty variants array still requires a fixed price', async () => {
    const product = new Product({ name: 'Latte', categoryId, variants: [] });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(err.errors.price).toBeDefined();
  });
});

describe('Fixed price — integer piastres, same as variant price (final review fix #2)', () => {
  test('a fixed price of exactly 0 is valid', async () => {
    const product = new Product({ name: 'Free Sample', price: 0, categoryId });
    const err = await validationErrors(product);
    expect(err).toBeNull();
  });

  test('a positive integer fixed price is valid', async () => {
    const product = new Product({ name: 'Latte', price: 5000, categoryId });
    const err = await validationErrors(product);
    expect(err).toBeNull();
  });

  test('a negative fixed price is invalid', async () => {
    const product = new Product({ name: 'Latte', price: -100, categoryId });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(err.errors.price).toBeDefined();
  });

  test('a non-integer (decimal) fixed price is invalid', async () => {
    const product = new Product({ name: 'Latte', price: 49.99, categoryId });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(err.errors.price).toBeDefined();
    expect(err.errors.price.message).toMatch(/whole number/i);
  });
});

describe('Variant price — required, integer, non-negative (fix #6)', () => {
  test('a variant price of exactly 0 is valid', async () => {
    const product = new Product({ name: 'Water', categoryId, variants: [{ name: 'Cup', price: 0 }] });
    const err = await validationErrors(product);
    expect(err).toBeNull();
  });

  test('a negative variant price is invalid', async () => {
    const product = new Product({ name: 'Latte', categoryId, variants: [{ name: 'Small', price: -100 }] });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(Object.keys(err.errors).some((k) => k.startsWith('variants.0.price'))).toBe(true);
  });

  test('a non-integer (decimal) variant price is invalid', async () => {
    const product = new Product({ name: 'Latte', categoryId, variants: [{ name: 'Small', price: 50.5 }] });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(Object.keys(err.errors).some((k) => k.startsWith('variants.0.price'))).toBe(true);
  });

  test('a variant with no price at all is invalid (required)', async () => {
    const product = new Product({ name: 'Latte', categoryId, variants: [{ name: 'Small' }] });
    const err = await validationErrors(product);
    expect(err).not.toBeNull();
    expect(Object.keys(err.errors).some((k) => k.startsWith('variants.0.price'))).toBe(true);
  });

  test('variants no longer accept priceModifier as a field name (it is simply ignored by the schema)', async () => {
    const product = new Product({
      name: 'Latte',
      categoryId,
      variants: [{ name: 'Small', priceModifier: 15, price: 5000 }],
    });
    const err = await validationErrors(product);
    expect(err).toBeNull();
    expect(product.variants[0].toObject().priceModifier).toBeUndefined();
    expect(product.variants[0].price).toBe(5000);
  });
});
