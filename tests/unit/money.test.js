'use strict';

// Regression tests for the EGP <-> piastres conversion used by both the
// public menu and the admin dashboard (public/js/money.js). Pure
// functions, no Express app or DB needed — runs under the existing Jest
// unit-test config exactly like every other tests/unit/*.test.js file.
const Money = require('../../public/js/money');

describe('money: piastresToEgp', () => {
  test('converts whole-pound piastres to EGP', () => {
    expect(Money.piastresToEgp(5000)).toBe(50);
  });

  test('converts fractional-pound piastres to EGP', () => {
    expect(Money.piastresToEgp(1250)).toBe(12.5);
    expect(Money.piastresToEgp(1)).toBe(0.01);
  });

  test('handles zero', () => {
    expect(Money.piastresToEgp(0)).toBe(0);
  });

  test('returns null for null/undefined (never silently coerces to 0)', () => {
    expect(Money.piastresToEgp(null)).toBeNull();
    expect(Money.piastresToEgp(undefined)).toBeNull();
  });
});

describe('money: egpToPiastres', () => {
  test('converts whole EGP to piastres', () => {
    expect(Money.egpToPiastres(150)).toBe(15000);
  });

  test('converts decimal EGP to piastres without float drift', () => {
    // A naive `150.1 * 100` is 15009.999999999998 in IEEE 754 — this must
    // still land on the correct integer piastre value.
    expect(Money.egpToPiastres(150.1)).toBe(15010);
    expect(Money.egpToPiastres(12.5)).toBe(1250);
    expect(Money.egpToPiastres(0.01)).toBe(1);
  });

  test('accepts a string, as it arrives from a form field', () => {
    expect(Money.egpToPiastres('50')).toBe(5000);
    expect(Money.egpToPiastres('12.5')).toBe(1250);
  });

  test('handles zero', () => {
    expect(Money.egpToPiastres(0)).toBe(0);
    expect(Money.egpToPiastres('0')).toBe(0);
  });

  test('returns null for empty/missing input (never silently sends 0)', () => {
    expect(Money.egpToPiastres('')).toBeNull();
    expect(Money.egpToPiastres(null)).toBeNull();
    expect(Money.egpToPiastres(undefined)).toBeNull();
  });

  test('round-trips through piastresToEgp without drift for common amounts', () => {
    [0, 1, 50, 99, 100, 150.5, 12.34, 999.99].forEach((egp) => {
      const piastres = Money.egpToPiastres(egp);
      expect(Number.isInteger(piastres)).toBe(true);
      expect(Money.piastresToEgp(piastres)).toBeCloseTo(egp, 2);
    });
  });

  test('a value already-converted once is not altered by converting again with the same input (no double-apply)', () => {
    // Guards the "does not accidentally multiply or divide prices twice"
    // requirement: round-tripping piastres -> egp -> piastres must return
    // the exact original integer, for a representative range of stored
    // piastres values.
    [0, 1, 500, 5000, 12345, 999999].forEach((storedPiastres) => {
      const egpForEditing = Money.egpToPiastres(Money.piastresToEgp(storedPiastres));
      expect(egpForEditing).toBe(storedPiastres);
    });
  });
});

describe('money: formatEgp (customer/admin display)', () => {
  test('formats with two decimal places and the EGP suffix, never "pt"', () => {
    expect(Money.formatEgp(5000)).toBe('50.00 EGP');
    expect(Money.formatEgp(1250)).toBe('12.50 EGP');
    expect(Money.formatEgp(1)).toBe('0.01 EGP');
    expect(Money.formatEgp(0)).toBe('0.00 EGP');
  });

  test('renders a dash for null/undefined instead of "0.00 EGP"', () => {
    expect(Money.formatEgp(null)).toBe('—');
    expect(Money.formatEgp(undefined)).toBe('—');
  });
});

describe('money: egpInputValue (admin form pre-fill)', () => {
  test('renders a whole-pound amount without a trailing decimal', () => {
    expect(Money.egpInputValue(5000)).toBe('50');
  });

  test('renders a fractional-pound amount in full', () => {
    expect(Money.egpInputValue(1250)).toBe('12.5');
  });

  test('renders an empty string for null/undefined (never "0")', () => {
    expect(Money.egpInputValue(null)).toBe('');
    expect(Money.egpInputValue(undefined)).toBe('');
  });
});
