'use strict';

// Public menu API — read-only, unauthenticated GET requests against the
// Phase 02 /api/menu/* routes only. Unlike the admin dashboard's api.js,
// this needs no CSRF token (only state-changing /api/admin/* and
// /api/auth/* routes require one — the public menu never calls those) and
// no session-expiry handling (there is no session on this page at all).
async function fetchMenuJson(path) {
  let res;
  try {
    res = await fetch(path, { method: 'GET', credentials: 'same-origin' });
  } catch {
    throw new Error('Network error — please check your connection and try again.');
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message = (body && body.error && body.error.message) || `Request failed (${res.status}).`;
    throw new Error(message);
  }
  return body;
}

const MenuApi = {
  getSettings: () => fetchMenuJson('/api/menu/settings'),
  getCategories: () => fetchMenuJson('/api/menu/categories'),
  // No category query param — the controller already returns products from
  // every publicly-visible category when it's omitted (confirmed by reading
  // publicMenuController.getProducts), so one call covers the whole menu.
  getProducts: () => fetchMenuJson('/api/menu/products'),
  // Manually-curated Top Sellers (owner-approved enhancement) — a
  // separate, already-filtered/sorted list, not something computed here.
  getTopSellers: () => fetchMenuJson('/api/menu/top-sellers'),
};
