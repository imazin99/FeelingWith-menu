'use strict';

// Pure math for the "Let Us Choose For You" recommendation wheel —
// deliberately separated from public/js/menu.js's DOM/canvas code so the
// winner-selection logic itself can be unit-tested directly under Node
// (tests/unit/wheelMath.test.js), with no browser/canvas required. Same
// pattern as public/js/money.js: works both in the browser (attaches to
// `window`) and under Node (`require`d directly by the tests).
//
// Segment layout convention (must match menu.js's drawWheel() exactly):
// segment 0 starts at the top (12 o'clock) and segments proceed CLOCKWISE
// in index order — i.e. segment i spans degrees [i * 360/count, (i+1) *
// 360/count) measured clockwise from the top.

// A uniformly-random integer in [0, count). Takes `random` as a parameter
// (defaulting to Math.random) purely so a test can supply a deterministic
// sequence instead of monkey-patching the global.
function pickRandomIndex(count, random) {
  if (!Number.isInteger(count) || count <= 0) return -1;
  const rand = typeof random === 'function' ? random : Math.random;
  return Math.floor(rand() * count);
}

// The amount of rotation (degrees) to ADD to the wheel's current total
// rotation so that, once applied, the chosen segment's center lands
// exactly under the fixed top pointer — i.e.
// (currentRotationDeg + result) % 360 === expected center-under-pointer
// angle. `extraSpins` full rotations are added purely for visual effect
// (0 under prefers-reduced-motion) and never change WHICH segment ends up
// under the pointer, only how many times the wheel visibly spins first.
function computeSpinRotation({ currentRotationDeg, chosenIndex, segmentCount, extraSpins }) {
  if (!Number.isInteger(segmentCount) || segmentCount <= 0) {
    throw new Error('computeSpinRotation: segmentCount must be a positive integer.');
  }
  if (!Number.isInteger(chosenIndex) || chosenIndex < 0 || chosenIndex >= segmentCount) {
    throw new Error('computeSpinRotation: chosenIndex out of range for segmentCount.');
  }
  const segmentDeg = 360 / segmentCount;
  const centerDeg = (chosenIndex + 0.5) * segmentDeg;
  const spins = Number.isFinite(extraSpins) && extraSpins >= 0 ? extraSpins : 0;
  const add = spins * 360 + ((360 - ((currentRotationDeg + centerDeg) % 360)) % 360);
  return currentRotationDeg + add;
}

// Inverse check used only by tests: given a final (not-yet-normalized)
// rotation and the segment count, returns which segment index is under
// the fixed top pointer — i.e. verifies computeSpinRotation's own
// contract independently of how it computed the rotation.
function resolveLandedIndex(rotationDeg, segmentCount) {
  if (!Number.isInteger(segmentCount) || segmentCount <= 0) return -1;
  const segmentDeg = 360 / segmentCount;
  // The pointer is fixed at the top (0deg). After rotating the wheel by
  // rotationDeg clockwise, the segment now at the top is the one that
  // *started* at -rotationDeg (mod 360) from the top.
  const normalized = ((-rotationDeg % 360) + 360) % 360;
  return Math.floor(normalized / segmentDeg) % segmentCount;
}

const WheelMath = { pickRandomIndex, computeSpinRotation, resolveLandedIndex };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = WheelMath;
} else {
  window.WheelMath = WheelMath;
}
