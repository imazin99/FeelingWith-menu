'use strict';

// Manually-curated "Top Sellers" admin view (owner-approved enhancement).
// Deliberately NOT a sales-analytics screen — nothing here is computed
// from order/sales history (this app has no ordering system at all).
// Backed by two fields directly on Product (src/models/Product.js):
// isTopSeller (on/off) and topSellerOrder (position among OTHER top
// sellers, independent of each product's normal category displayOrder).
const TopSellersState = {
  products: [],
};

Views.register('topsellers', {
  title: 'Top Sellers',
  mount(container) {
    renderTopSellers(container);
  },
});

function renderTopSellers(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Top Sellers</h2>
    </div>
    <p style="color:var(--text-muted); font-size:0.9rem; margin:-8px 0 16px;">
      Manually featured products shown in a dedicated "Top Sellers" section on
      the public menu. This is a curated selection, not an automatically
      calculated sales ranking.
    </p>
    <div class="panel">
      <h3 style="margin-top:0;">Selected Top Sellers</h3>
      <div class="table-wrap" id="ts-selected-wrap"><div class="loading-state">Loading…</div></div>
    </div>
    <div class="panel" style="margin-top:20px;">
      <h3 style="margin-top:0;">Add a Product</h3>
      <div class="filters-bar">
        <input type="text" id="ts-search" placeholder="Search products to add…" />
      </div>
      <div class="table-wrap" id="ts-available-wrap"></div>
    </div>
  `;

  container.querySelector('#ts-search').addEventListener(
    'input',
    debounce((e) => {
      renderAvailableTable(container, e.target.value.trim().toLowerCase());
    }, 200)
  );

  loadTopSellerData(container);
}

async function loadTopSellerData(container) {
  const selectedWrap = container.querySelector('#ts-selected-wrap');
  try {
    const { products } = await Api.listProducts();
    // Non-archived only — an archived product is never eligible to be
    // selected or to stay selected as a Top Seller (it is already
    // excluded from the public menu entirely, same rule as everywhere
    // else in this app).
    TopSellersState.products = products.filter((p) => !p.isArchived);
    renderSelectedTable(container);
    renderAvailableTable(container, '');
  } catch (err) {
    selectedWrap.innerHTML = `<div class="empty-state">Could not load products: ${escapeHtml(err.message)}</div>`;
  }
}

function selectedTopSellers() {
  return TopSellersState.products
    .filter((p) => p.isTopSeller)
    .sort((a, b) => (a.topSellerOrder || 0) - (b.topSellerOrder || 0));
}

function renderSelectedTable(container) {
  const wrap = container.querySelector('#ts-selected-wrap');
  const list = selectedTopSellers();

  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No Top Sellers selected yet — add one below.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Image</th><th>Name</th><th>Status</th><th>Order</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${list
          .map(
            (p, i) => `
          <tr data-id="${p._id}">
            <td data-label="Image">${p.imageUrl ? `<img class="thumb" src="${escapeHtml(p.imageUrl)}" alt="" />` : '<div class="thumb-placeholder">No img</div>'}</td>
            <td data-label="Name">${escapeHtml(p.name)}</td>
            <td data-label="Status">
              ${!p.isVisible ? '<span class="badge badge-muted">Hidden</span>' : !p.isAvailable ? '<span class="badge badge-gold">Unavailable</span>' : '<span class="badge badge-success">Visible</span>'}
            </td>
            <td data-label="Order">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="move-up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
                <button class="btn btn-secondary btn-sm" data-action="move-down" ${i === list.length - 1 ? 'disabled' : ''}>&darr;</button>
              </div>
            </td>
            <td data-label="Actions">
              <button class="btn btn-danger btn-sm" data-action="remove">Remove</button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;

    row.querySelector('[data-action="remove"]').addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setProductTopSeller(id, false);
          toast('Removed from Top Sellers.', 'success');
          await loadTopSellerData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="move-up"]')?.addEventListener('click', async () => {
      const idx = list.findIndex((p) => p._id === id);
      await swapTopSellerOrder(container, list, idx, idx - 1);
    });
    row.querySelector('[data-action="move-down"]')?.addEventListener('click', async () => {
      const idx = list.findIndex((p) => p._id === id);
      await swapTopSellerOrder(container, list, idx, idx + 1);
    });
  });
}

// Swaps topSellerOrder between two adjacent rows, same "two PATCH calls"
// technique used for category/product displayOrder elsewhere in this
// dashboard — there is no bulk-reorder endpoint.
async function swapTopSellerOrder(container, list, idxA, idxB) {
  if (idxB < 0 || idxB >= list.length) return;
  const a = list[idxA];
  const b = list[idxB];
  try {
    await Api.reorderTopSeller(a._id, b.topSellerOrder || 0);
    await Api.reorderTopSeller(b._id, a.topSellerOrder || 0);
    await loadTopSellerData(container);
  } catch (err) {
    showApiError(err);
  }
}

function renderAvailableTable(container, search) {
  const wrap = container.querySelector('#ts-available-wrap');
  if (!wrap) return; // re-render may race a view switch away from this screen

  const available = TopSellersState.products
    .filter((p) => !p.isTopSeller)
    .filter((p) => !search || p.name.toLowerCase().includes(search))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (available.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No other products to add.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Image</th><th>Name</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${available
          .map(
            (p) => `
          <tr data-id="${p._id}">
            <td data-label="Image">${p.imageUrl ? `<img class="thumb" src="${escapeHtml(p.imageUrl)}" alt="" />` : '<div class="thumb-placeholder">No img</div>'}</td>
            <td data-label="Name">${escapeHtml(p.name)}</td>
            <td data-label="Status">
              ${!p.isVisible ? '<span class="badge badge-muted">Hidden</span>' : !p.isAvailable ? '<span class="badge badge-gold">Unavailable</span>' : '<span class="badge badge-success">Visible</span>'}
            </td>
            <td data-label="Actions">
              <button class="btn btn-primary btn-sm" data-action="add">+ Add</button>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    row.querySelector('[data-action="add"]').addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          // Newly added items join at the end of the current order —
          // the admin can then use the up/down controls above to
          // position them precisely.
          const nextOrder = selectedTopSellers().length;
          await Api.setProductTopSeller(id, true);
          await Api.reorderTopSeller(id, nextOrder);
          toast('Added to Top Sellers.', 'success');
          await loadTopSellerData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });
  });
}
