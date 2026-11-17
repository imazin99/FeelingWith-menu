'use strict';

// Only the approved editable-now fields (Phase 03 brief, section G):
// café name, tagline, logo, contact information, social links, language.
// Deferred display-customization settings have no fields in the API at
// all in this phase and are never shown here.
Views.register('settings', {
  title: 'Settings',
  mount(container) {
    renderSettings(container);
  },
});

async function renderSettings(container) {
  container.innerHTML = '<div class="loading-state">Loading…</div>';
  let settings;
  try {
    ({ settings } = await Api.getSettings());
  } catch (err) {
    container.innerHTML = `<div class="empty-state">Could not load settings: ${escapeHtml(err.message)}</div>`;
    return;
  }

  const contact = settings.contact || {};
  const social = settings.socialLinks || {};

  container.innerHTML = `
    <div class="view-header"><h2>Settings</h2></div>

    <div class="panel">
      <h3>Logo</h3>
      <div class="image-upload-row">
        ${settings.logoUrl ? `<img class="image-preview" id="logo-preview" src="${escapeHtml(settings.logoUrl)}" alt="Current logo" />` : '<div class="thumb-placeholder" style="width:84px;height:84px;">No logo</div>'}
        <div>
          <input type="file" id="logo-file" accept="image/jpeg,image/png,image/webp" />
          <div><button class="btn btn-secondary btn-sm" id="logo-upload-btn" style="margin-top:8px;">Upload / Replace Logo</button></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <h3>General</h3>
      <form id="settings-form" novalidate>
        <div class="form-grid">
          <div class="field">
            <label for="s-cafename">Café Name</label>
            <input type="text" id="s-cafename" name="cafeName" value="${escapeHtml(settings.cafeName)}" required />
            <p class="field-error" data-field="cafeName"></p>
          </div>
          <div class="field">
            <label for="s-language">Language</label>
            <select id="s-language" name="language">
              <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
              <option value="ar" ${settings.language === 'ar' ? 'selected' : ''}>Arabic</option>
            </select>
            <p class="field-error" data-field="language"></p>
          </div>
          <div class="field full">
            <label for="s-tagline">Tagline</label>
            <input type="text" id="s-tagline" name="tagline" value="${escapeHtml(settings.tagline || '')}" />
            <p class="field-error" data-field="tagline"></p>
          </div>
          <div class="field full checkbox-field">
            <input type="checkbox" id="s-rtl" name="isRtl" ${settings.isRtl ? 'checked' : ''} />
            <label for="s-rtl" style="margin:0;">Right-to-left layout</label>
          </div>

          <div class="field">
            <label for="s-phone">Contact Phone</label>
            <input type="text" id="s-phone" name="phone" value="${escapeHtml(contact.phone || '')}" />
          </div>
          <div class="field">
            <label for="s-email">Contact Email</label>
            <input type="email" id="s-email" name="email" value="${escapeHtml(contact.email || '')}" />
          </div>
          <div class="field full">
            <label for="s-address">Address</label>
            <input type="text" id="s-address" name="address" value="${escapeHtml(contact.address || '')}" />
          </div>

          <div class="field">
            <label for="s-instagram">Instagram</label>
            <input type="text" id="s-instagram" name="instagram" value="${escapeHtml(social.instagram || '')}" />
          </div>
          <div class="field">
            <label for="s-facebook">Facebook</label>
            <input type="text" id="s-facebook" name="facebook" value="${escapeHtml(social.facebook || '')}" />
          </div>
          <div class="field">
            <label for="s-tiktok">TikTok</label>
            <input type="text" id="s-tiktok" name="tiktok" value="${escapeHtml(social.tiktok || '')}" />
          </div>
          <div class="field">
            <label for="s-website">Website</label>
            <input type="text" id="s-website" name="website" value="${escapeHtml(social.website || '')}" />
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Save Settings</button>
      </form>
    </div>
  `;

  container.querySelector('#logo-upload-btn').addEventListener('click', async (e) => {
    const fileInput = container.querySelector('#logo-file');
    const file = fileInput.files[0];
    if (!file) {
      toast('Choose an image file first.', 'error');
      return;
    }
    await withButtonLock(e.currentTarget, async () => {
      const formData = new FormData();
      formData.append('image', file);
      try {
        const { settings: updated } = await Api.uploadLogo(formData);
        toast('Logo updated.', 'success');
        renderSettings(container);
        void updated;
      } catch (err) {
        showApiError(err);
      }
    });
  });

  const form = container.querySelector('#settings-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    await withButtonLock(submitBtn, async () => {
      const payload = {
        cafeName: form.cafeName.value.trim(),
        tagline: form.tagline.value.trim() || undefined,
        language: form.language.value,
        isRtl: form.isRtl.checked,
        contact: {
          phone: form.phone.value.trim() || undefined,
          email: form.email.value.trim() || undefined,
          address: form.address.value.trim() || undefined,
        },
        socialLinks: {
          instagram: form.instagram.value.trim() || undefined,
          facebook: form.facebook.value.trim() || undefined,
          tiktok: form.tiktok.value.trim() || undefined,
          website: form.website.value.trim() || undefined,
        },
      };
      try {
        await Api.updateSettings(payload);
        toast('Settings saved.', 'success');
        document.getElementById('brand-name').textContent = payload.cafeName;
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
