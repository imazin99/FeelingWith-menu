'use strict';

// Overview stats. There is no dedicated stats endpoint in the Phase 02
// API (by design — "Use the existing backend data and endpoints"), so
// these are computed client-side from the full admin product/category
// lists. Decision (flagged for approval in the Phase 03 report): counts
// exclude archived records — an archived product/category is treated as
// removed from active management, not as part of "total".
Views.register('overview', {
  title: 'Overview',
  mount(container) {
    container.innerHTML = '<div class="loading-state">Loading…</div>';

    Promise.all([Api.listProducts(), Api.listCategories()])
      .then(([{ products }, { categories }]) => {
        const activeProducts = products.filter((p) => !p.isArchived);
        const activeCategories = categories.filter((c) => !c.isArchived);
        const visible = activeProducts.filter((p) => p.isVisible).length;
        const hidden = activeProducts.filter((p) => !p.isVisible).length;
        const unavailable = activeProducts.filter((p) => !p.isAvailable).length;

        const cards = [
          { label: 'Total Products', value: activeProducts.length },
          { label: 'Total Categories', value: activeCategories.length },
          { label: 'Visible Products', value: visible },
          { label: 'Hidden Products', value: hidden },
          { label: 'Unavailable Products', value: unavailable },
        ];

        container.innerHTML = `
          <div class="view-header"><h2>Overview</h2></div>
          <div class="stat-grid">
            ${cards
              .map(
                (c) => `
              <div class="stat-card">
                <div class="stat-value">${c.value}</div>
                <div class="stat-label">${escapeHtml(c.label)}</div>
              </div>`
              )
              .join('')}
          </div>
        `;
      })
      .catch((err) => {
        container.innerHTML = `<div class="empty-state">Could not load overview data: ${escapeHtml(err.message)}</div>`;
      });
  },
});
