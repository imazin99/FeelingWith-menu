'use strict';

// Minimal hash-based view switcher — no routing framework (Phase 03
// brief: vanilla JS only). Each view module calls Views.register(name,
// {title, mount}) once at load time; mount(container) is called every
// time that view becomes active and is responsible for rendering itself
// and wiring its own event listeners into `container`.
const Views = (() => {
  const registry = {};
  function register(name, def) {
    registry[name] = def;
  }
  function get(name) {
    return registry[name];
  }
  return { register, get };
})();

const Router = (() => {
  let current = null;

  function routeFromHash() {
    const hash = window.location.hash.replace(/^#\/?/, '');
    return hash || 'overview';
  }

  function show(route) {
    const def = Views.get(route);
    if (!def) {
      route = 'overview';
    }
    current = route;

    document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach((el) => el.classList.remove('active'));

    const section = document.getElementById(`view-${route}`);
    const navBtn = document.querySelector(`.nav-link[data-route="${route}"]`);
    if (section) section.classList.add('active');
    if (navBtn) navBtn.classList.add('active');

    const activeDef = Views.get(route);
    if (activeDef) {
      document.getElementById('view-title').textContent = activeDef.title;
      activeDef.mount(section);
    }

    // Close the mobile sidebar after navigating.
    document.getElementById('sidebar').classList.remove('open');
  }

  function navigate(route) {
    if (window.location.hash === `#${route}`) {
      show(route); // re-run mount even if the hash didn't change (e.g. nav click on current view)
    } else {
      window.location.hash = route;
    }
  }

  function init() {
    window.addEventListener('hashchange', () => show(routeFromHash()));
    show(routeFromHash());
  }

  return { navigate, init, get current() { return current; } };
})();
