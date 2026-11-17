'use strict';

// Collapsible Product Categories (owner-approved enhancement) — the pure
// decision logic for how many products a category shows and what its
// toggle button should say, extracted out of menu.js so it can be unit-
// tested directly under Node, with no browser/canvas/DOM required (same
// pattern as public/js/money.js + public/js/wheelMath.js). menu.js calls
// these exact functions; this is not a reimplementation of the UI logic.
//
// Deliberately tiny and framework-free: a category's "collapsed" state is
// just "show the first COLLAPSED_COUNT products, by the existing
// displayOrder sort the server already applies" — no new sorting, no new
// data fetched, no change to which products exist or are visible.

const COLLAPSED_COUNT = 2;

// How many of a category's (already displayOrder-sorted) items should be
// rendered right now. `expanded` is per-category UI state (did the admin's
// customer click "Show All" for THIS category); `isSearching` means the
// customer has typed a search query — while searching, nothing is
// collapsed, so a matching product can never be hidden by a category's
// collapsed state (brief, section 3).
function visibleCount(totalItems, expanded, isSearching) {
  if (!Number.isFinite(totalItems) || totalItems < 0) return 0;
  if (isSearching) return totalItems;
  if (totalItems <= COLLAPSED_COUNT) return totalItems;
  return expanded ? totalItems : COLLAPSED_COUNT;
}

// A category only ever needs a "Show All" / "Show Less" button when it has
// more items than the collapsed preview shows, and only while not
// searching (search already reveals everything, so there's nothing left
// to toggle).
function shouldShowToggle(totalItems, isSearching) {
  if (isSearching) return false;
  return Number.isFinite(totalItems) && totalItems > COLLAPSED_COUNT;
}

function toggleButtonLabel(totalItems, expanded) {
  return expanded ? 'Show Less' : `Show All (${totalItems})`;
}

const MenuCollapse = {
  COLLAPSED_COUNT,
  visibleCount,
  shouldShowToggle,
  toggleButtonLabel,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MenuCollapse;
} else {
  window.MenuCollapse = MenuCollapse;
}
