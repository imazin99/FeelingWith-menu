'use strict';

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function toast(message, type = 'info') {
  const stack = document.getElementById('toast-stack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  stack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showApiError(err, fallback = 'Something went wrong.') {
  const message = (err && err.message) || fallback;
  toast(message, 'error');
}

// Applies { field: "message" } validation details (ApiError's `details`
// shape, from express-validator or Mongoose validation errors) onto
// `<p class="field-error" data-field="...">` elements inside `formEl`.
function applyFieldErrors(formEl, details) {
  formEl.querySelectorAll('.field-error').forEach((el) => {
    el.textContent = '';
  });
  if (!details) return;
  Object.entries(details).forEach(([field, message]) => {
    const target = formEl.querySelector(`.field-error[data-field="${field}"]`);
    if (target) target.textContent = message;
  });
}

// Simple confirm modal (replaces window.confirm so styling stays
// consistent) — resolves true/false.
function confirmAction(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px;">
        <h3>Please confirm</h3>
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button class="btn btn-danger" data-action="confirm">Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
        resolve(false);
      }
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
      overlay.remove();
      resolve(false);
    });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
}

// Guards a button against double-submit while an async action runs.
async function withButtonLock(button, fn) {
  if (button.disabled) return;
  const original = button.textContent;
  button.disabled = true;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function debounce(fn, wait = 250) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
