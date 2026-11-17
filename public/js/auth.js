'use strict';

// Login page controller. Session auth is the existing HttpOnly cookie —
// nothing here ever touches localStorage/sessionStorage for the session
// or CSRF token (Phase 03 brief, "Never store JWT tokens in
// localStorage or sessionStorage").
(function () {
  const form = document.getElementById('login-form');
  const alertArea = document.getElementById('alert-area');
  const submitBtn = document.getElementById('login-submit');

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired') === '1') {
    alertArea.innerHTML = '<div class="alert alert-info">Your session expired. Please log in again.</div>';
  }

  // Already logged in? Skip the login form entirely.
  Api.me()
    .then(() => {
      window.location.replace('/admin');
    })
    .catch(() => {
      /* not logged in — stay on this page */
    });

  // Branding: best-effort, read-only, public endpoint — no auth needed,
  // and failing to load it should never block the login form itself.
  fetch('/api/menu/settings')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data && data.settings && data.settings.cafeName) {
        document.getElementById('brand-name').textContent = data.settings.cafeName;
      }
    })
    .catch(() => {});

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;

    const username = form.username.value.trim();
    const password = form.password.value;
    alertArea.innerHTML = '';

    if (!username || !password) {
      alertArea.innerHTML = '<div class="alert alert-error">Username and password are required.</div>';
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in…';
    try {
      await Api.login(username, password);
      window.location.href = '/admin';
    } catch (err) {
      let message = err.message || 'Login failed.';
      if (err.status === 429) {
        message = 'Too many login attempts. Please try again later.';
      } else if (err.status === 401) {
        message = 'Invalid username or password.';
      }
      alertArea.innerHTML = `<div class="alert alert-error">${escapeHtml(message)}</div>`;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Log In';
    }
  });
})();
