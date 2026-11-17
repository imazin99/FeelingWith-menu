'use strict';

const ProductsState = {
  products: [],
  categories: [],
  addOns: [],
  filters: { category: '', visibility: '', availability: '', archived: 'active', search: '' },
};

Views.register('products', {
  title: 'Products',
  mount(container) {
    renderProducts(container);
  },
});

function renderProducts(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Products</h2>
      <button class="btn btn-primary" id="product-new-btn">+ New Product</button>
    </div>
    <div class="panel">
      <div class="filters-bar">
        <input type="text" id="p-search" placeholder="Search by name…" />
        <select id="p-filter-category"><option value="">All Categories</option></select>
        <select id="p-filter-visibility">
          <option value="">Any Visibility</option>
          <option value="visible">Visible</option>
          <option value="hidden">Hidden</option>
        </select>
        <select id="p-filter-availability">
          <option value="">Any Availability</option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>
        <select id="p-filter-archived">
          <option value="active">Active (not archived)</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>
      <div class="table-wrap" id="product-table-wrap"><div class="loading-state">Loading…</div></div>
    </div>
  `;

  container.querySelector('#product-new-btn').addEventListener('click', () => openProductModal(container, null));

  container.querySelector('#p-search').addEventListener(
    'input',
    debounce((e) => {
      ProductsState.filters.search = e.target.value.trim().toLowerCase();
      renderProductTable(container);
    }, 200)
  );
  container.querySelector('#p-filter-category').addEventListener('change', (e) => {
    ProductsState.filters.category = e.target.value;
    renderProductTable(container);
  });
  container.querySelector('#p-filter-visibility').addEventListener('change', (e) => {
    ProductsState.filters.visibility = e.target.value;
    renderProductTable(container);
  });
  container.querySelector('#p-filter-availability').addEventListener('change', (e) => {
    ProductsState.filters.availability = e.target.value;
    renderProductTable(container);
  });
  container.querySelector('#p-filter-archived').addEventListener('change', (e) => {
    ProductsState.filters.archived = e.target.value;
    renderProductTable(container);
  });

  loadProductData(container);
}

async function loadProductData(container) {
  const wrap = container.querySelector('#product-table-wrap');
  try {
    const [{ products }, { categories }, { addOns }] = await Promise.all([Api.listProducts(), Api.listCategories(), Api.listAddOns()]);
    ProductsState.products = products;
    ProductsState.categories = categories;
    ProductsState.addOns = addOns;

    const categorySelect = container.querySelector('#p-filter-category');
    categorySelect.innerHTML =
      '<option value="">All Categories</option>' + categories.map((c) => `<option value="${c._id}">${escapeHtml(c.name)}</option>`).join('');

    renderProductTable(container);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Could not load products: ${escapeHtml(err.message)}</div>`;
  }
}

function categoryName(categoryId) {
  const c = ProductsState.categories.find((cat) => cat._id === categoryId || cat._id === String(categoryId));
  return c ? c.name : '—';
}

function priceSummary(product) {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return `${product.variants.length} variant${product.variants.length > 1 ? 's' : ''}`;
  }
  return Money.formatEgp(product.price);
}

function applyProductFilters(products) {
  const f = ProductsState.filters;
  return products.filter((p) => {
    if (f.archived === 'active' && p.isArchived) return false;
    if (f.archived === 'archived' && !p.isArchived) return false;
    if (f.category && String(p.categoryId) !== f.category) return false;
    if (f.visibility === 'visible' && !p.isVisible) return false;
    if (f.visibility === 'hidden' && p.isVisible) return false;
    if (f.availability === 'available' && !p.isAvailable) return false;
    if (f.availability === 'unavailable' && p.isAvailable) return false;
    if (f.search && !p.name.toLowerCase().includes(f.search)) return false;
    return true;
  });
}

function renderProductTable(container) {
  const wrap = container.querySelector('#product-table-wrap');
  const list = applyProductFilters(ProductsState.products).sort((a, b) => a.displayOrder - b.displayOrder);

  if (list.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No products match the current filters.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Image</th><th>Name</th><th>Category</th><th>Pricing</th><th>Order</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${list
          .map(
            (p, i) => `
          <tr data-id="${p._id}">
            <td data-label="Image">${p.imageUrl ? `<img class="thumb" src="${escapeHtml(p.imageUrl)}" alt="" />` : '<div class="thumb-placeholder">No img</div>'}</td>
            <td data-label="Name">${escapeHtml(p.name)}</td>
            <td data-label="Category">${escapeHtml(categoryName(p.categoryId))}</td>
            <td data-label="Pricing">${priceSummary(p)}</td>
            <td data-label="Order">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="move-up" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
                <button class="btn btn-secondary btn-sm" data-action="move-down" ${i === list.length - 1 ? 'disabled' : ''}>&darr;</button>
              </div>
            </td>
            <td data-label="Status">
              <div class="row-actions">
                ${p.isArchived ? '<span class="badge badge-danger">Archived</span>' : p.isVisible ? '<span class="badge badge-success">Visible</span>' : '<span class="badge badge-muted">Hidden</span>'}
                ${!p.isArchived && !p.isAvailable ? '<span class="badge badge-gold">Unavailable</span>' : ''}
              </div>
            </td>
            <td data-label="Actions">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="edit">Edit</button>
                ${
                  p.isArchived
                    ? '<button class="btn btn-secondary btn-sm" data-action="restore">Restore</button>'
                    : `<button class="btn btn-secondary btn-sm" data-action="toggle-visibility">${p.isVisible ? 'Hide' : 'Show'}</button>
                       <button class="btn btn-secondary btn-sm" data-action="toggle-availability">${p.isAvailable ? 'Mark Unavailable' : 'Mark Available'}</button>
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
    const product = list.find((p) => p._id === id);

    row.querySelector('[data-action="edit"]').addEventListener('click', () => openProductModal(container, product));

    row.querySelector('[data-action="toggle-visibility"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setProductVisibility(id, !product.isVisible);
          toast('Product updated.', 'success');
          loadProductData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="toggle-availability"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setProductAvailability(id, !product.isAvailable);
          toast('Product updated.', 'success');
          loadProductData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="archive"]')?.addEventListener('click', async (e) => {
      const ok = await confirmAction(`Archive "${product.name}"? It will be removed from the public menu.`);
      if (!ok) return;
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setProductArchived(id, true);
          toast('Product archived.', 'success');
          loadProductData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="restore"]')?.addEventListener('click', async (e) => {
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setProductArchived(id, false);
          toast('Product restored.', 'success');
          loadProductData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="move-up"]')?.addEventListener('click', async () => {
      const idx = list.findIndex((p) => p._id === id);
      await swapProductOrder(container, list, idx, idx - 1);
    });
    row.querySelector('[data-action="move-down"]')?.addEventListener('click', async () => {
      const idx = list.findIndex((p) => p._id === id);
      await swapProductOrder(container, list, idx, idx + 1);
    });
  });
}

async function swapProductOrder(container, list, idxA, idxB) {
  if (idxB < 0 || idxB >= list.length) return;
  const a = list[idxA];
  const b = list[idxB];
  try {
    await Api.reorderProduct(a._id, b.displayOrder);
    await Api.reorderProduct(b._id, a.displayOrder);
    loadProductData(container);
  } catch (err) {
    showApiError(err);
  }
}

// ---------- Create / Edit modal ----------

let variantRowSeq = 0;

function variantRowHtml(variant) {
  variantRowSeq += 1;
  const seq = variantRowSeq;
  return `
    <div class="variant-row" data-seq="${seq}">
      <input type="text" placeholder="Variant name (e.g. Small)" class="variant-name" value="${variant ? escapeHtml(variant.name) : ''}" />
      <input type="number" placeholder="Price (EGP)" min="0" step="0.01" class="variant-price" value="${variant ? Money.egpInputValue(variant.price) : ''}" />
      <label class="checkbox-field" style="white-space:nowrap;">
        <input type="checkbox" class="variant-available" ${!variant || variant.isAvailable ? 'checked' : ''} /> Available
      </label>
      <button type="button" class="btn btn-secondary btn-sm" data-action="remove-variant">&times;</button>
    </div>
  `;
}

function openProductModal(container, product) {
  const isEdit = Boolean(product);
  const root = document.getElementById('modal-root');
  const hasVariants = isEdit && Array.isArray(product.variants) && product.variants.length > 0;
  const attachedAddOnIds = new Set((isEdit ? product.addOnIds || [] : []).map((a) => (typeof a === 'string' ? a : a._id)));

  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal" style="max-width:680px;">
        <h3>${isEdit ? 'Edit Product' : 'New Product'}</h3>
        <form id="product-form" novalidate>
          <div class="form-grid">
            <div class="field full">
              <label for="pf-name">Name</label>
              <input type="text" id="pf-name" name="name" value="${isEdit ? escapeHtml(product.name) : ''}" required />
              <p class="field-error" data-field="name"></p>
            </div>
            <div class="field full">
              <label for="pf-description">Description</label>
              <textarea id="pf-description" name="description" rows="2">${isEdit ? escapeHtml(product.description || '') : ''}</textarea>
              <p class="field-error" data-field="description"></p>
            </div>
            <div class="field">
              <label for="pf-category">Category</label>
              <select id="pf-category" name="categoryId" required>
                ${ProductsState.categories.map((c) => `<option value="${c._id}" ${isEdit && String(product.categoryId) === c._id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
              </select>
              <p class="field-error" data-field="categoryId"></p>
            </div>
            <div class="field">
              <label for="pf-order">Display Order</label>
              <input type="number" id="pf-order" name="displayOrder" min="0" value="${isEdit ? product.displayOrder : 0}" />
              <p class="field-error" data-field="displayOrder"></p>
            </div>
          </div>

          <div class="field full">
            <label>Pricing</label>
            <div class="row-actions" style="margin-bottom:8px;">
              <label class="checkbox-field"><input type="radio" name="pricingMode" value="fixed" ${!hasVariants ? 'checked' : ''} /> Fixed price</label>
              <label class="checkbox-field"><input type="radio" name="pricingMode" value="variants" ${hasVariants ? 'checked' : ''} /> Variants</label>
            </div>
            <div id="pf-fixed-price-wrap" class="field" style="${hasVariants ? 'display:none;' : ''}">
              <input type="number" id="pf-price" name="price" min="0" step="0.01" placeholder="Price (EGP)" value="${isEdit ? Money.egpInputValue(product.price) : ''}" />
              <p class="field-error" data-field="price"></p>
            </div>
            <div id="pf-variants-wrap" style="${hasVariants ? '' : 'display:none;'}">
              <div id="pf-variants-list">
                ${isEdit && hasVariants ? product.variants.map((v) => variantRowHtml(v)).join('') : ''}
              </div>
              <button type="button" class="btn btn-secondary btn-sm" id="pf-add-variant">+ Add Variant</button>
              <p class="field-error" data-field="variants"></p>
            </div>
          </div>

          <div class="field full">
            <label>Add-ons</label>
            <div class="checkbox-list">
              ${
                ProductsState.addOns.length === 0
                  ? '<span style="color:var(--text-muted);font-size:0.85rem;">No add-ons defined yet.</span>'
                  : ProductsState.addOns
                      .map(
                        (a) => `
                <label class="checkbox-field">
                  <input type="checkbox" class="pf-addon" value="${a._id}" ${attachedAddOnIds.has(a._id) ? 'checked' : ''} /> ${escapeHtml(a.name)} (${Money.formatEgp(a.price)})
                </label>`
                      )
                      .join('')
              }
            </div>
          </div>

          ${
            isEdit
              ? `<div class="field full">
                  <label>Image</label>
                  <div class="image-upload-row">
                    ${product.imageUrl ? `<img class="image-preview" src="${escapeHtml(product.imageUrl)}" alt="" />` : '<div class="thumb-placeholder" style="width:84px;height:84px;">No img</div>'}
                    <div>
                      <input type="file" id="pf-image-file" accept="image/jpeg,image/png,image/webp" />
                      <div><button type="button" class="btn btn-secondary btn-sm" id="pf-image-upload-btn" style="margin-top:8px;">Upload / Replace</button></div>
                    </div>
                  </div>
                </div>`
              : `<p style="color:var(--text-muted); font-size:0.85rem;">You can add an image after creating the product.</p>`
          }

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">${isEdit ? 'Save Changes' : 'Create Product'}</button>
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

  const form = root.querySelector('#product-form');
  const fixedWrap = form.querySelector('#pf-fixed-price-wrap');
  const variantsWrap = form.querySelector('#pf-variants-wrap');
  const variantsList = form.querySelector('#pf-variants-list');

  form.querySelectorAll('input[name="pricingMode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      const isVariants = form.pricingMode.value === 'variants';
      fixedWrap.style.display = isVariants ? 'none' : '';
      variantsWrap.style.display = isVariants ? '' : 'none';
    });
  });

  form.querySelector('#pf-add-variant').addEventListener('click', () => {
    variantsList.insertAdjacentHTML('beforeend', variantRowHtml(null));
  });
  variantsList.addEventListener('click', (e) => {
    if (e.target.dataset.action === 'remove-variant') {
      e.target.closest('.variant-row').remove();
    }
  });

  if (isEdit) {
    form.querySelector('#pf-image-upload-btn').addEventListener('click', async (e) => {
      const fileInput = form.querySelector('#pf-image-file');
      const file = fileInput.files[0];
      if (!file) {
        toast('Choose an image file first.', 'error');
        return;
      }
      await withButtonLock(e.currentTarget, async () => {
        const formData = new FormData();
        formData.append('image', file);
        try {
          await Api.uploadProductImage(product._id, formData);
          toast('Image updated.', 'success');
          close();
          loadProductData(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    await withButtonLock(submitBtn, async () => {
      const isVariantMode = form.pricingMode.value === 'variants';
      const addOnIds = Array.from(form.querySelectorAll('.pf-addon:checked')).map((cb) => cb.value);

      // Client-side guard before this ever reaches the API: an empty
      // fixed-price field or an empty/non-numeric variant price would
      // otherwise serialize to `null`/`0`/`NaN` and either silently
      // clear the price or trip a confusing server-side 400. Catch it
      // here with a clear, field-level message instead.
      applyFieldErrors(form, null);
      if (!isVariantMode && form.price.value.trim() === '') {
        applyFieldErrors(form, { price: 'Enter a fixed price, or switch to Variants.' });
        return;
      }
      if (isVariantMode) {
        const rowsCheck = Array.from(variantsList.querySelectorAll('.variant-row'));
        if (rowsCheck.length === 0) {
          applyFieldErrors(form, { variants: 'Add at least one variant, or switch to Fixed price.' });
          return;
        }
        const invalidRow = rowsCheck.some(
          (row) => row.querySelector('.variant-name').value.trim() === '' || row.querySelector('.variant-price').value.trim() === ''
        );
        if (invalidRow) {
          applyFieldErrors(form, { variants: 'Every variant needs a name and a price.' });
          return;
        }
      }

      // addOnIds is sent on create (createProductRules/createProduct both
      // accept it directly) but handled via the dedicated POST /:id/addons
      // endpoint on edit — PUT /:id (updateProductRules/updateProduct)
      // only deals with name/description/price/category/variants.
      const payload = {
        name: form.name.value.trim(),
        description: form.description.value.trim() || undefined,
        categoryId: form.categoryId.value,
        displayOrder: form.displayOrder.value === '' ? undefined : Number(form.displayOrder.value),
        ...(isEdit ? {} : { addOnIds }),
      };

      // All price fields in this form are entered in EGP (brief, section
      // 8) and converted to the existing integer-piastres wire contract
      // right here, once, immediately before building the payload — the
      // stored/backend unit never changes, only what the admin types.
      if (isVariantMode) {
        const rows = Array.from(variantsList.querySelectorAll('.variant-row'));
        payload.variants = rows.map((row) => ({
          name: row.querySelector('.variant-name').value.trim(),
          price: Money.egpToPiastres(row.querySelector('.variant-price').value),
          isAvailable: row.querySelector('.variant-available').checked,
        }));
        payload.price = null; // explicit clear — mutual exclusivity is enforced by the API, not guessed
      } else {
        payload.price = form.price.value === '' ? undefined : Money.egpToPiastres(form.price.value);
        payload.variants = []; // explicit clear, same reasoning
      }

      try {
        if (isEdit) {
          await Api.updateProduct(product._id, payload);
          await Api.setProductAddOns(product._id, addOnIds);
        } else {
          await Api.createProduct(payload);
        }
        toast(isEdit ? 'Product updated.' : 'Product created.', 'success');
        close();
        loadProductData(container);
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
