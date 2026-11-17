// Thin fetch wrapper for the Phase 02 Admin API.
//
// Session auth is the existing HttpOnly cookie — never read or stored
// here. The CSRF token cookie is deliberately NOT HttpOnly (so the
// dashboard's own JS can read it), named `csrfToken` in development and
// `__Host-csrfToken` in production (src/middleware/csrf.js) — this reads
// whichever one is actually present, so the same code works in both.
'use strict';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfToken() {
  return getCookie('__Host-csrfToken') || getCookie('csrfToken');
}

class ApiClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details || null;
  }
}

// Fired whenever a request comes back 401 outside of the initial "am I
// logged in" check — the dashboard shell listens for this to redirect to
// the login page with an "expired" message, in one place, rather than
// every view handling it separately.
const SESSION_EXPIRED_EVENT = 'fw:session-expired';

/**
 * @param {string} path e.g. "/api/admin/products"
 * @param {{method?: string, body?: any, isFormData?: boolean, suppressSessionEvent?: boolean}} [options]
 */
async function apiFetch(path, options = {}) {
  const { method = 'GET', body, isFormData = false, suppressSessionEvent = false } = options;
  const headers = {};
  if (!isFormData && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (!SAFE_METHODS.has(method.toUpperCase())) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  let res;
  try {
    res = await fetch(path, {
      method,
      headers,
      credentials: 'same-origin',
      body: isFormData ? body : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    throw new ApiClientError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (res.status === 204) return null;

  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const message = (data && data.error && data.error.message) || `Request failed (${res.status}).`;
    const details = data && data.error && data.error.details;
    if (res.status === 401 && !suppressSessionEvent) {
      document.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
    }
    throw new ApiClientError(message, res.status, details);
  }

  return data;
}

const Api = {
  get: (path) => apiFetch(path, { method: 'GET' }),
  post: (path, body) => apiFetch(path, { method: 'POST', body }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body }),
  postForm: (path, formData) => apiFetch(path, { method: 'POST', body: formData, isFormData: true }),

  // Auth
  login: (username, password) => apiFetch('/api/auth/login', { method: 'POST', body: { username, password }, suppressSessionEvent: true }),
  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),
  me: () => apiFetch('/api/auth/me', { method: 'GET', suppressSessionEvent: true }),

  // Categories
  listCategories: () => apiFetch('/api/admin/categories'),
  createCategory: (data) => apiFetch('/api/admin/categories', { method: 'POST', body: data }),
  updateCategory: (id, data) => apiFetch(`/api/admin/categories/${id}`, { method: 'PUT', body: data }),
  setCategoryVisibility: (id, isVisible) => apiFetch(`/api/admin/categories/${id}/visibility`, { method: 'PATCH', body: { isVisible } }),
  setCategoryArchived: (id, isArchived) => apiFetch(`/api/admin/categories/${id}/archive`, { method: 'PATCH', body: { isArchived } }),
  reorderCategory: (id, displayOrder) => apiFetch(`/api/admin/categories/${id}/reorder`, { method: 'PATCH', body: { displayOrder } }),
  uploadCategoryImage: (id, formData) => apiFetch(`/api/admin/categories/${id}/image`, { method: 'POST', body: formData, isFormData: true }),
  removeCategoryImage: (id) => apiFetch(`/api/admin/categories/${id}/image`, { method: 'DELETE' }),

  // Add-ons
  listAddOns: () => apiFetch('/api/admin/addons'),
  createAddOn: (data) => apiFetch('/api/admin/addons', { method: 'POST', body: data }),
  updateAddOn: (id, data) => apiFetch(`/api/admin/addons/${id}`, { method: 'PUT', body: data }),
  setAddOnVisibility: (id, isVisible) => apiFetch(`/api/admin/addons/${id}/visibility`, { method: 'PATCH', body: { isVisible } }),
  setAddOnAvailability: (id, isAvailable) => apiFetch(`/api/admin/addons/${id}/availability`, { method: 'PATCH', body: { isAvailable } }),
  setAddOnArchived: (id, isArchived) => apiFetch(`/api/admin/addons/${id}/archive`, { method: 'PATCH', body: { isArchived } }),

  // Products
  listProducts: () => apiFetch('/api/admin/products'),
  createProduct: (data) => apiFetch('/api/admin/products', { method: 'POST', body: data }),
  updateProduct: (id, data) => apiFetch(`/api/admin/products/${id}`, { method: 'PUT', body: data }),
  setProductVisibility: (id, isVisible) => apiFetch(`/api/admin/products/${id}/visibility`, { method: 'PATCH', body: { isVisible } }),
  setProductAvailability: (id, isAvailable) => apiFetch(`/api/admin/products/${id}/availability`, { method: 'PATCH', body: { isAvailable } }),
  setProductArchived: (id, isArchived) => apiFetch(`/api/admin/products/${id}/archive`, { method: 'PATCH', body: { isArchived } }),
  reorderProduct: (id, displayOrder) => apiFetch(`/api/admin/products/${id}/reorder`, { method: 'PATCH', body: { displayOrder } }),
  setProductTopSeller: (id, isTopSeller) => apiFetch(`/api/admin/products/${id}/top-seller`, { method: 'PATCH', body: { isTopSeller } }),
  reorderTopSeller: (id, topSellerOrder) => apiFetch(`/api/admin/products/${id}/top-seller-order`, { method: 'PATCH', body: { topSellerOrder } }),
  setProductAddOns: (id, addOnIds) => apiFetch(`/api/admin/products/${id}/addons`, { method: 'POST', body: { addOnIds } }),
  uploadProductImage: (id, formData) => apiFetch(`/api/admin/products/${id}/image`, { method: 'POST', body: formData, isFormData: true }),

  // Users
  listUsers: () => apiFetch('/api/admin/users'),
  createUser: (data) => apiFetch('/api/admin/users', { method: 'POST', body: data }),
  setUserStatus: (id, status) => apiFetch(`/api/admin/users/${id}/status`, { method: 'PATCH', body: { status } }),
  revokeUserSessions: (id) => apiFetch(`/api/admin/users/${id}/revoke`, { method: 'POST' }),

  // Settings
  getSettings: () => apiFetch('/api/admin/settings'),
  updateSettings: (data) => apiFetch('/api/admin/settings', { method: 'PATCH', body: data }),
  uploadLogo: (formData) => apiFetch('/api/admin/settings/logo', { method: 'POST', body: formData, isFormData: true }),
};
