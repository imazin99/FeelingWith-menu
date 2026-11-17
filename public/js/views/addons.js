'use strict';

Views.register('addons', {
  title: 'Add-ons',
  mount(container) {
    renderAddOns(container);
  },
});

function renderAddOns(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Add-ons</h2>
      <button class="btn btn-primary" id="addon-new-btn">+ New Add-on</button>
    </div>
    <div class="panel"><div class="table-wrap" id="addon-table-wrap"><div class="loading-state">Loading…</div></div></div>
  `;

  container.querySelector('#addon-new-btn').addEventListener('click', () => openAddOnModal(container, null));
  loadAddOns(container);
}

async function loadAddOns(container) {
  const wrap = container.querySelector('#addon-table-wrap');
  try {
    const { addOns } = await Api.listAddOns();
    renderAddOnTable(container, wrap, addOns);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Could not load add-ons: ${escapeHtml(err.message)}</div>`;
  }
}

function renderAddOnTable(container, wrap, addOns) {
  if (addOns.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No add-ons yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Name</th><th>Price</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${addOns
          .map(
            (a) => `
          <tr data-id="${a._id}">
            <td data-label="Name">${escapeHtml(a.name)}</td>
            <td data-label="Price">${Money.formatEgp(a.price)}</td>
            <td data-label="Status">
              <div class="row-actions">
                ${a.isArchived ? '<span class="badge badge-danger">Archived</span>' : a.isVisible ? '<span class="badge badge-success">Visible</span>' : '<span class="badge badge-muted">Hidden</span>'}
                ${!a.isArchived && !a.isAvailable ? '<span class="badge badge-gold">Unavailable</span>' : ''}
              </div>
            </td>
            <td data-label="Actions">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
                ${
                  a.isArchived
                    ? '<button class="btn btn-secondary btn-sm" data-action="restore">Restore</button>'
                    : `<button class="btn btn-secondary btn-sm" data-action="toggle-visibility">${a.isVisible ? 'Hide' : 'Show'}</button>
                       <button class="btn btn-secondary btn-sm" data-action="toggle-availability">${a.isAvailable ? 'Mark Unavailable' : 'Mark Available'}</button>
                       <button class="btn btn-danger btn-sm" data-action="archive">Archive</button>`
                }
              </div>
            </td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;

  wrap.querySelectorAll('tr[data-id]').forEach((row) => {
    const id = row.dataset.id;
    const addOn = addOns.find((a) => a._id === id);

    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openAddOnModal(container, addOn));

    row.querySelector('[data-action="toggle-visibility"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setAddOnVisibility(id, !addOn.isVisible);
          toast('Add-on updated.', 'success');
          loadAddOns(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="toggle-availability"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setAddOnAvailability(id, !addOn.isAvailable);
          toast('Add-on updated.', 'success');
          loadAddOns(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="archive"]')?.addEventListener('click', async (e) => {
      const ok = await confirmAction(`Archive "${addOn.name}"? Products that use it will no longer offer it.`);
      if (!ok) return;
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setAddOnArchived(id, true);
          toast('Add-on archived.', 'success');
          loadAddOns(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="restore"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setAddOnArchived(id, false);
          toast('Add-on restored.', 'success');
          loadAddOns(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });
  });
}

function openAddOnModal(container, addOn) {
  const isEdit = Boolean(addOn);
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>${isEdit ? 'Edit Add-on' : 'New Add-on'}</h3>
        <form id="addon-form" novalidate>
          <div class="field">
            <label for="addon-name">Name</label>
            <input type="text" id="addon-name" name="name" value="${isEdit ? escapeHtml(addOn.name) : ''}" required />
            <p class="field-error" data-field="name"></p>
          </div>
          <div class="field">
            <label for="addon-price">Price (EGP)</label>
            <input type="number" id="addon-price" name="price" min="0" step="0.01" value="${isEdit ? Money.egpInputValue(addOn.price) : ''}" required />
            <p class="field-error" data-field="price"></p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Add-on'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const close = () => {
    root.innerHTML = '';
  };
  root.querySelector('[data-action="cancel"]').addEventListener('click', close);
  root.querySelector('.modal-overlay').addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) close();
  });

  const form = root.querySelector('#addon-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    await withButtonLock(submitBtn, async () => {
      // Entered in EGP (brief, section 8); converted to the existing
      // integer-piastres wire contract right here, once.
      const payload = { name: form.name.value.trim(), price: Money.egpToPiastres(form.price.value) };
      try {
        if (isEdit) {
          await Api.updateAddOn(addOn._id, payload);
        } else {
          await Api.createAddOn(payload);
        }
        toast(isEdit ? 'Add-on updated.' : 'Add-on created.', 'success');
        close();
        loadAddOns(container);
      } catch (err) {
        if (err.status === 400 && err.details) {
          applyFieldErrors(form, err.details);
        } else {
          showApiError(err);
        }
      }
    });
  });
}
