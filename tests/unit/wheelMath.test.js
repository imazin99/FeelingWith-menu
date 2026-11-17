// Recommendation wheel visual polish (owner-approved enhancement) — the
// winner-selection math (public/js/wheelMath.js) was extracted out of
// public/js/menu.js specifically so it can be unit-tested directly under
// Node, with no browser/canvas/DOM required (same pattern as
// public/js/money.js + tests/unit/money.test.js). menu.js itself now
// calls these exact functions (confirmed by reading menu.js's
// renderWheel()), so this is testing the real implementation, not a
// reimplementation of it.
const WheelMath = require('../../public/js/wheelMath');

describe('WheelMath.pickRandomIndex', () => {
  test('returns -1 for a zero or negative count', () => {
    expect(WheelMath.pickRandomIndex(0)).toBe(-1);
    expect(WheelMath.pickRandomIndex(-3)).toBe(-1);
  });

  test('always returns 0 for a single eligible product', () => {
    for (let i = 0; i < 20; i++) {
      expect(WheelMath.pickRandomIndex(1, Math.random)).toBe(0);
    }
  });

  test('stays within [0, count) across many draws, using the real Math.random', () => {
    for (let i = 0; i < 500; i++) {
      const idx = WheelMath.pickRandomIndex(7);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(7);
      expect(Number.isInteger(idx)).toBe(true);
    }
  });

  test('accepts an injected random source for deterministic tests', () => {
    expect(WheelMath.pickRandomIndex(5, () => 0)).toBe(0);
    expect(WheelMath.pickRandomIndex(5, () => 0.999999)).toBe(4);
    expect(WheelMath.pickRandomIndex(5, () => 0.41)).toBe(2);
  });
});

describe('WheelMath.computeSpinRotation + resolveLandedIndex (winner-selection correctness)', () => {
  test('throws on an invalid segmentCount', () => {
    expect(() => WheelMath.computeSpinRotation({ currentRotationDeg: 0, chosenIndex: 0, segmentCount: 0 })).toThrow();
    expect(() => WheelMath.computeSpinRotation({ currentRotationDeg: 0, chosenIndex: 0, segmentCount: 1.5 })).toThrow();
  });

  test('throws on a chosenIndex out of range', () => {
    expect(() => WheelMath.computeSpinRotation({ currentRotationDeg: 0, chosenIndex: 3, segmentCount: 3 })).toThrow();
    expect(() => WheelMath.computeSpinRotation({ currentRotationDeg: 0, chosenIndex: -1, segmentCount: 3 })).toThrow();
  });

  // The actual correctness property that matters: whatever rotation gets
  // computed, resolving it back (an independent inverse calculation, not
  // just re-running the same formula) must land on the SAME index that
  // was requested. Exercised across every segment count from 1 (edge
  // case: a single eligible product) up through a crowded 12-item menu,
  // every valid chosenIndex within each, several starting rotations
  // (so it isn't coincidentally only correct starting from 0), and with
  // and without the decorative extra full spins — i.e. exactly the
  // "edge cases: zero/one/two/many eligible products" the brief asks for
  // (zero is handled one level up in menu.js, which never calls this at
  // all when there are no eligible products — see renderWheel's early
  // return — so it is not a case this function itself needs to accept).
  const startingRotations = [0, 45, 179.5, 360, 724, -90];
  const extraSpinsOptions = [0, 6];

  for (const segmentCount of [1, 2, 3, 4, 5, 8, 12]) {
    for (let chosenIndex = 0; chosenIndex < segmentCount; chosenIndex++) {
      test(`segmentCount=${segmentCount}, chosenIndex=${chosenIndex}: always resolves back to the chosen index`, () => {
        for (const currentRotationDeg of startingRotations) {
          for (const extraSpins of extraSpinsOptions) {
            const landedDeg = WheelMath.computeSpinRotation({ currentRotationDeg, chosenIndex, segmentCount, extraSpins });
            expect(WheelMath.resolveLandedIndex(landedDeg, segmentCount)).toBe(chosenIndex);
          }
        }
      });
    }
  }

  test('extraSpins only adds full rotations — never changes which segment lands under the pointer', () => {
    const base = WheelMath.computeSpinRotation({ currentRotationDeg: 30, chosenIndex: 2, segmentCount: 5, extraSpins: 0 });
    const withSpins = WheelMath.computeSpinRotation({ currentRotationDeg: 30, chosenIndex: 2, segmentCount: 5, extraSpins: 6 });
    expect(withSpins - base).toBe(6 * 360);
    expect(WheelMath.resolveLandedIndex(base, 5)).toBe(2);
    expect(WheelMath.resolveLandedIndex(withSpins, 5)).toBe(2);
  });

  test('the result is always a forward (non-negative) amount of additional rotation from currentRotationDeg', () => {
    const current = 350;
    const landed = WheelMath.computeSpinRotation({ currentRotationDeg: current, chosenIndex: 0, segmentCount: 4, extraSpins: 0 });
    expect(landed).toBeGreaterThanOrEqual(current);
  });

  test('a missing/undefined extraSpins defaults to 0 (no decorative spins, still lands correctly)', () => {
    const landed = WheelMath.computeSpinRotation({ currentRotationDeg: 0, chosenIndex: 1, segmentCount: 3 });
    expect(WheelMath.resolveLandedIndex(landed, 3)).toBe(1);
  });
});

describe('WheelMath.resolveLandedIndex edge cases', () => {
  test('returns -1 for an invalid segmentCount', () => {
    expect(WheelMath.resolveLandedIndex(100, 0)).toBe(-1);
  });

  test('handles a rotation of exactly 0', () => {
    expect(WheelMath.resolveLandedIndex(0, 4)).toBe(0);
  });

  test('handles a large multi-thousand-degree rotation the same as its normalized equivalent', () => {
    expect(WheelMath.resolveLandedIndex(4 * 360 + 90, 4)).toBe(WheelMath.resolveLandedIndex(90, 4));
  });
});
