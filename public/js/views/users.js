'use strict';

Views.register('users', {
  title: 'Admin Accounts',
  mount(container) {
    renderUsers(container);
  },
});

function renderUsers(container) {
  container.innerHTML = `
    <div class="view-header">
      <h2>Admin Accounts</h2>
      <button class="btn btn-primary" id="user-new-btn">+ New Admin</button>
    </div>
    <div class="panel"><div class="table-wrap" id="user-table-wrap"><div class="loading-state">Loading…</div></div></div>
  `;

  container.querySelector('#user-new-btn').addEventListener('click', () => openUserModal(container));
  loadUsers(container);
}

async function loadUsers(container) {
  const wrap = container.querySelector('#user-table-wrap');
  try {
    const { users } = await Api.listUsers();
    renderUserTable(container, wrap, users);
  } catch (err) {
    wrap.innerHTML = `<div class="empty-state">Could not load admin accounts: ${escapeHtml(err.message)}</div>`;
  }
}

function renderUserTable(container, wrap, users) {
  if (users.length === 0) {
    wrap.innerHTML = '<div class="empty-state">No admin accounts yet.</div>';
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr><th>Username</th><th>Full Name</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${users
          .map(
            (u) => `
          <tr data-id="${u._id}">
            <td data-label="Username">${escapeHtml(u.username)}</td>
            <td data-label="Full Name">${escapeHtml(u.fullName) || '—'}</td>
            <td data-label="Role"><span class="badge badge-gold">${escapeHtml(u.role)}</span></td>
            <td data-label="Status">${u.status === 'active' ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-danger">Inactive</span>'}</td>
            <td data-label="Created">${formatDate(u.createdAt)}</td>
            <td data-label="Actions">
              <div class="row-actions">
                <button class="btn btn-secondary btn-sm" data-action="toggle-status">${u.status === 'active' ? 'Deactivate' : 'Reactivate'}</button>
                <button class="btn btn-secondary btn-sm" data-action="revoke">Revoke Sessions</button>
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
    const user = users.find((u) => u._id === id);

    row.querySelector('[data-action="toggle-status"]').addEventListener('click', async (e) => {
      const nextStatus = user.status === 'active' ? 'inactive' : 'active';
      const ok = await confirmAction(
        nextStatus === 'inactive'
          ? `Deactivate "${user.username}"? Their current session will be revoked immediately.`
          : `Reactivate "${user.username}"?`
      );
      if (!ok) return;
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.setUserStatus(id, nextStatus);
          toast('Account updated.', 'success');
          loadUsers(container);
        } catch (err) {
          showApiError(err);
        }
      });
    });

    row.querySelector('[data-action="revoke"]').addEventListener('click', async (e) => {
      const ok = await confirmAction(`Revoke all sessions for "${user.username}"? They will need to log in again.`);
      if (!ok) return;
      await withButtonLock(e.currentTarget, async () => {
        try {
          await Api.revokeUserSessions(id);
          toast('Sessions revoked.', 'success');
        } catch (err) {
          showApiError(err);
        }
      });
    });
  });
}

function openUserModal(container) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="modal-overlay">
      <div class="modal">
        <h3>New Admin Account</h3>
        <form id="user-form" novalidate>
          <div class="field">
            <label for="user-username">Username</label>
            <input type="text" id="user-username" name="username" required />
            <p class="field-error" data-field="username"></p>
          </div>
          <div class="field">
            <label for="user-fullname">Full Name</label>
            <input type="text" id="user-fullname" name="fullName" />
            <p class="field-error" data-field="fullName"></p>
          </div>
          <div class="field">
            <label for="user-password">Initial Password</label>
            <input type="password" id="user-password" name="password" minlength="8" required />
            <p class="field-error" data-field="password"></p>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Admin</button>
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

  const form = root.querySelector('#user-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    await withButtonLock(submitBtn, async () => {
      const payload = {
        username: form.username.value.trim(),
        password: form.password.value,
        fullName: form.fullName.value.trim() || undefined,
      };
      try {
        await Api.createUser(payload);
        toast('Admin account created.', 'success');
        close();
        loadUsers(container);
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
