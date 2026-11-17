'use strict';

(function () {
  function redirectToLogin(expired) {
    window.location.replace(expired ? '/admin/login?expired=1' : '/admin/login');
  }

  // Any API call elsewhere in the dashboard that gets a 401 after the
  // initial auth check fires this — one place handles "your session
  // expired, go log in again" instead of every view doing it separately.
  document.addEventListener('fw:session-expired', () => redirectToLogin(true));

  function wireNav() {
    document.querySelectorAll('.nav-link[data-route]').forEach((btn) => {
      btn.addEventListener('click', () => Router.navigate(btn.dataset.route));
    });

    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('logout-btn').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      await withButtonLock(btn, async () => {
        try {
          await Api.logout();
        } catch {
          // Even if the logout request itself fails (e.g. the session was
          // already gone), there is nothing meaningful left to do but send
          // the admin back to the login page.
        }
        redirectToLogin(false);
      });
    });
  }

  function loadBranding() {
    Api.getSettings()
      .then(({ settings }) => {
        if (settings && settings.cafeName) {
          document.getElementById('brand-name').textContent = settings.cafeName;
        }
      })
      .catch(() => {
        /* non-fatal — keep the default brand name */
      });
  }

  async function init() {
    let me;
    try {
      me = await Api.me();
    } catch {
      redirectToLogin(false);
      return;
    }

    document.getElementById('sidebar-user').textContent = me.user.fullName || me.user.username;
    wireNav();
    loadBranding();
    Router.init();
  }

  init();
})();
