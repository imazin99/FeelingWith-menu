'use strict';

Views.register('categories', {
  title: 'Categories',
  mount(container) {
    renderCategories(container);
  },
});

function renderCategories(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Categories</h2>
      <button class="btn btn-primary" id="cat-new-btn">+ New Category</button>
    </div>
    <div class="panel"><div class="table-wrap" id="cat-table-wrap"><div class="loading-state">Loading…</div></div></div>
  `;

  container.querySelector('#cat-new-btn').addEventListener('click', () => openCategoryModal(container, null));

  loadCategories(container);
}

async function loadCategories(container) {
  const wrap = container.querySelector('#cat-table-wrap');
  try {
    const { categories } = await Api.listCategories();
    categories.sort((a, b) => a.displayOrder - b.displayOrder);
    renderCategoryTable(container, wrap, categories);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Could not load categories: ${escapeHtml(err.message)}</div>`;
  }
}

function renderCategoryTable(container, wrap, categories) {
  if (categories.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No categories yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Name</th><th>Order</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${categories
          .map(
            (c, i) => `
          <tr data-id="${c._id}">
            <td data-label="Name">${escapeHtml(c.name)}</td>
            <td data-label="Order">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="move-up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
                <button class="btn btn-secondary btn-sm" data-action="move-down" ${i === categories.length - 1 ? 'disabled' : ''}>&darr;</button>
              </div>
            </td>
            <td data-label="Status">
              ${c.isArchived ? '<span class="badge badge-danger">Archived</span>' : c.isVisible ? '<span class="badge badge-success">Visible</span>' : '<span class="badge badge-muted">Hidden</span>'}
            </td>
            <td data-label="Actions">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
                ${
                  c.isArchived
                    ? '<button class="btn btn-secondary btn-sm" data-action="restore">Restore</button>'
                    : `<button class="btn btn-secondary btn-sm" data-action="toggle-visibility">${c.isVisible ? 'Hide' : 'Show'}</button>
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
    const category = categories.find((c) => c._id === id);

    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openCategoryModal(container, category));

    row.querySelector('[data-action="toggle-visibility"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setCategoryVisibility(id, !category.isVisible);
          toast('Category updated.', 'success');
          loadCategories(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="archive"]')?.addEventListener('click', async (e) => {
      const ok = await confirmAction(`Archive "${category.name}"? It will be removed from the public menu.`);
      if (!ok) return;
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setCategoryArchived(id, true);
          toast('Category archived.', 'success');
          loadCategories(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="restore"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setCategoryArchived(id, false);
          toast('Category restored.', 'success');
          loadCategories(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="move-up"]')?.addEventListener('click', async (e) => {
      const idx = categories.findIndex((c) => c._id === id);
      await swapDisplayOrder(container, categories, idx, idx - 1, Api.reorderCategory, loadCategories);
    });
    row.querySelector('[data-action="move-down"]')?.addEventListener('click', async (e) => {
      const idx = categories.findIndex((c) => c._id === id);
      await swapDisplayOrder(container, categories, idx, idx + 1, Api.reorderCategory, loadCategories);
    });
  });
}

// Swaps the displayOrder of two adjacent rows (as currently sorted and
// shown) via two PATCH .../reorder calls — there is no bulk-reorder
// endpoint, so this is the smallest change that achieves "move up/down"
// using only what the API already exposes.
async function swapDisplayOrder(container, items, idxA, idxB, reorderFn, reload) {
  if (idxB < 0 || idxB >= items.length) return;
  const a = items[idxA];
  const b = items[idxB];
  try {
    await reorderFn(a._id, b.displayOrder);
    await reorderFn(b._id, a.displayOrder);
    reload(container);
  } catch (err) {
    showApiError(err);
  }
}

function openCategoryModal(container, category) {
  const isEdit = Boolean(category);
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>${isEdit ? 'Edit Category' : 'New Category'}</h3>
        <form id="cat-form" novalidate>
          <div class="field">
            <label for="cat-name">Name</label>
            <input type="text" id="cat-name" name="name" value="${isEdit ? escapeHtml(category.name) : ''}" required />
            <p class="field-error" data-field="name"></p>
          </div>
          <div class="field">
            <label for="cat-order">Display Order</label>
            <input type="number" id="cat-order" name="displayOrder" min="0" value="${isEdit ? category.displayOrder : 0}" />
            <p class="field-error" data-field="displayOrder"></p>
          </div>

          ${
            isEdit
              ? `<div class="field full">
                  <label>Image</label>
                  <div class="image-upload-row">
                    ${category.imageUrl ? `<img class="image-preview" src="${escapeHtml(category.imageUrl)}" alt="" />` : '<div class="thumb-placeholder" style="width:84px;height:84px;">No img</div>'}
                    <div>
                      <input type="file" id="cat-image-file" accept="image/jpeg,image/png,image/webp" />
                      <div class="row-actions" style="margin-top:8px;">
                        <button type="button" class="btn btn-secondary btn-sm" id="cat-image-upload-btn">Upload / Replace</button>
                        ${category.imageUrl ? '<button type="button" class="btn btn-danger btn-sm" id="cat-image-remove-btn">Remove</button>' : ''}
                      </div>
                    </div>
                  </div>
                </div>`
              : `<p style="color:var(--text-muted); font-size:0.85rem;">You can add an image after creating the category.</p>`
          }

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Category'}</button>
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

  const form = root.querySelector('#cat-form');

  if (isEdit) {
    form.querySelector('#cat-image-upload-btn').addEventListener('click', async (e) => {
      const fileInput = form.querySelector('#cat-image-file');
      const file = fileInput.files[0];
      if (!file) {
        toast('Choose an image file first.', 'error');
        return;
      }
      await withButtonLock(e.currentTarget, async () => {
        const formData = new FormData();
        formData.append('image', file);
        try {
          await Api.uploadCategoryImage(category._id, formData);
          toast('Image updated.', 'success');
          close();
          loadCategories(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    const removeBtn = form.querySelector('#cat-image-remove-btn');
    if (removeBtn) {
      removeBtn.addEventListener('click', async (e) => {
        const ok = await confirmAction('Remove this category\'s image? Public category cards will fall back to the default look.');
        if (!ok) return;
        await withButtonLock(e.currentTarget, async () => {
          try {
            await Api.removeCategoryImage(category._id);
            toast('Image removed.', 'success');
            close();
            loadCategories(container);
          } catch (err) {
            showApiError(err);
          }
        });
      });
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    await withButtonLock(submitBtn, async () => {
      const payload = {
        name: form.name.value.trim(),
        displayOrder: form.displayOrder.value === '' ? undefined : Number(form.displayOrder.value),
      };
      try {
        if (isEdit) {
          await Api.updateCategory(category._id, payload);
        } else {
          await Api.createCategory(payload);
        }
        toast(isEdit ? 'Category updated.' : 'Category created.', 'success');
        close();
        loadCategories(container);
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
