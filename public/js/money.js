'use strict';

// Single source of truth for the EGP <-> piastres conversion, shared by
// the public menu (display-only) and the admin dashboard (price inputs).
// The backend's stored unit is UNCHANGED from every previous phase: an
// integer number of piastres (Product.price, Product.variants[].price,
// AddOn.price — confirmed against productValidators.js/addOnValidators.js,
// both still require/accept piastres on the wire). 1 EGP = 100 piastres —
// the real-world subdivision of the Egyptian pound — is the established
// conversion for that existing contract, not a new business decision.
//
// This module only changes what a human types/reads; it never migrates or
// reinterprets anything already stored. A stored value of 5000 piastres
// means, and has always meant, 50.00 EGP — this just displays/edits it as
// that, instead of as the confusing "5000 pt" from Phases 03/04.
//
// Works both in the browser (attaches to `window`) and under Node (the
// regression tests in tests/unit/money.test.js `require` it directly).

function piastresToEgp(piastres) {
  if (piastres === null || piastres === undefined || Number.isNaN(Number(piastres))) return null;
  // Round at the piastre first (defends against a non-integer value ever
  // reaching here) before dividing, so display never drifts from the
  // integer piastres actually stored.
  return Math.round(Number(piastres)) / 100;
}

// Converts an EGP amount (string from a form field, or number) into an
// integer number of piastres for the existing backend contract. Always
// rounds to the nearest whole piastre (0.01 EGP) — the finest precision
// the stored integer-piastres contract supports — which also guarantees
// the result satisfies productValidators' `isInt({ min: 0 })` on price/
// variant price, and addOnValidators' `isFloat({ min: 0 })` on add-on
// price, without any further rounding needed downstream.
function egpToPiastres(egp) {
  if (egp === null || egp === undefined || egp === '') return null;
  const n = typeof egp === 'string' ? Number(egp) : egp;
  if (Number.isNaN(n)) return null;
  // Rounds at the piastre, not the pound — avoids float artifacts like
  // 150.1 * 100 === 15009.999999999998 producing the wrong integer.
  return Math.round(n * 100);
}

// Customer- and admin-facing display string, e.g. "50.00 EGP". Always 2
// decimal places so whole- and fractional-pound prices read consistently.
function formatEgp(piastres) {
  const egp = piastresToEgp(piastres);
  if (egp === null) return '—';
  return `${egp.toFixed(2)} EGP`;
}

// The plain numeric string to pre-fill a price <input> with when editing
// an existing record (EGP, not piastres) — e.g. 5000 piastres -> "50".
function egpInputValue(piastres) {
  const egp = piastresToEgp(piastres);
  return egp === null ? '' : String(egp);
}

const Money = { piastresToEgp, egpToPiastres, formatEgp, egpInputValue };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Money;
}
if (typeof window !== 'undefined') {
  window.Money = Money;
}
