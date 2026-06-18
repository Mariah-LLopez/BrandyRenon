(function () {
  const MAX_FILE_SIZE_MB = 10;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
  const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp'
  ];

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }
  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────
  function openModal(id) {
    const m = document.getElementById(id + '-modal');
    if (!m) return;
    m.classList.add('is-open');
    m.setAttribute('aria-hidden', 'false');
  }
  function closeModal(id) {
    const m = document.getElementById(id + '-modal');
    if (!m) return;
    m.classList.remove('is-open');
    m.setAttribute('aria-hidden', 'true');
  }
  function setupModalClose() {
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', function () {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });
    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) {
          const id = modal.id.replace('-modal', '');
          closeModal(id);
        }
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.is-open').forEach((modal) => {
          const id = modal.id.replace('-modal', '');
          closeModal(id);
        });
      }
    });
  }

  // ── Tab navigation ────────────────────────────────────────────────────────
  function initTabs() {
    const mainTabs = document.querySelectorAll('.portal-tab-bar:not(.leads-sub-tabs) .portal-tab');
    mainTabs.forEach((btn) => {
      btn.addEventListener('click', function () {
        mainTabs.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = true; });
        const target = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (target) target.hidden = false;
      });
    });

    const leadTabs = document.querySelectorAll('.leads-sub-tabs .portal-tab');
    leadTabs.forEach((btn) => {
      btn.addEventListener('click', function () {
        leadTabs.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.lead-tab-panel').forEach((p) => { p.hidden = true; });
        const target = document.getElementById('lead-tab-' + btn.getAttribute('data-lead-tab'));
        if (target) target.hidden = false;
      });
    });
  }

  // ── Status badges ─────────────────────────────────────────────────────────
  function statusBadge(status) {
    const map = { Active: 'badge-active', Pending: 'badge-pending', Sold: 'badge-sold', 'Coming Soon': 'badge-coming-soon', Closed: 'badge-sold', Cancelled: 'badge-hidden' };
    return `<span class="status-badge ${map[status] || 'badge-coming-soon'}">${status}</span>`;
  }

  function visibilityLabel(v) {
    return { admin_only: 'Admin Only', client_visible: 'Client View', client_downloadable: 'Downloadable' }[v] || v;
  }

  function sigBadge(doc) {
    if (!doc.requires_signature) return '—';
    if (doc.signed) return `<span class="badge-doc-signed">Signed ${doc.signed_at ? doc.signed_at.slice(0,10) : ''}</span>`;
    return '<span class="badge-doc-required">Pending</span>';
  }

  // ── Cache for selects ─────────────────────────────────────────────────────
  let allUsers = [];
  let allProperties = [];
  let allDocuments = [];

  // ── Load users ────────────────────────────────────────────────────────────
  async function loadUsers() {
    const tbody = document.getElementById('users-tbody');
    const empty = document.getElementById('users-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Users error:', error); return; }

    allUsers = data || [];
    populateUserSelect(document.getElementById('upload-client'));
    populateUserSelect(document.getElementById('txn-client'));

    if (!allUsers.length) { if (empty) empty.hidden = false; tbody.innerHTML = ''; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = allUsers.map((u) => `<tr>
      <td>${u.full_name || '—'}</td>
      <td>${u.email}</td>
      <td>${u.phone || '—'}</td>
      <td><span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-client'}">${u.role}</span></td>
      <td>${u.created_at ? u.created_at.slice(0,10) : '—'}</td>
    </tr>`).join('');
  }

  function populateUserSelect(select) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = '<option value="">No specific client</option>' +
      allUsers.filter((u) => u.role === 'client').map((u) =>
        `<option value="${u.id}">${u.full_name || u.email}</option>`
      ).join('');
    if (current) select.value = current;
  }

  // ── Invite client ─────────────────────────────────────────────────────────
  async function handleInvite(event) {
    event.preventDefault();
    const form = document.getElementById('invite-form');
    const statusEl = document.getElementById('invite-status');
    const email = form.querySelector('[name="email"]').value.trim();
    const fullName = form.querySelector('[name="full_name"]').value.trim();

    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    if (!email) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Email is required.'; }
      return;
    }

    // Use signUp with email/password approach — the invited user will set their own password via magic link or password reset.
    // This creates a user with a temporary random password and marks them as needing password reset.
    const tempPassword = 'Temp!' + Math.random().toString(36).slice(2, 12);
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password: tempPassword,
      options: { data: { full_name: fullName, role: 'client' } }
    });

    if (error) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Invitation failed: ' + error.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = `Invitation sent to ${email}. The client will receive a confirmation email.`; }
    form.reset();
    await loadUsers();
    setTimeout(() => closeModal('invite'), 2500);
  }

  // ── Load properties ───────────────────────────────────────────────────────
  async function loadProperties() {
    const tbody = document.getElementById('properties-tbody');
    const empty = document.getElementById('properties-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient.from('properties').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Properties error:', error); return; }

    allProperties = data || [];
    populatePropertySelect(document.getElementById('upload-property'));
    populatePropertySelect(document.getElementById('txn-property'));

    if (!allProperties.length) { if (empty) empty.hidden = false; tbody.innerHTML = ''; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = allProperties.map((p) => `<tr>
      <td>${p.property_address}</td>
      <td>${statusBadge(p.property_status)}</td>
      <td>${p.purchase_price ? '$' + Number(p.purchase_price).toLocaleString() : '—'}</td>
      <td>${p.sale_price ? '$' + Number(p.sale_price).toLocaleString() : '—'}</td>
      <td>${p.created_at ? p.created_at.slice(0,10) : '—'}</td>
      <td><div class="table-actions">
        <button class="action-link" data-action="delete-property" data-id="${p.id}" type="button">Delete</button>
      </div></td>
    </tr>`).join('');
  }

  function populatePropertySelect(select) {
    if (!select) return;
    const current = select.value;
    const hasNone = select.querySelector('option[value=""]');
    const noneText = hasNone ? hasNone.textContent : 'No specific property';
    select.innerHTML = `<option value="">${noneText}</option>` +
      allProperties.map((p) => `<option value="${p.id}">${p.property_address}</option>`).join('');
    if (current) select.value = current;
  }

  // ── Add property ──────────────────────────────────────────────────────────
  async function handleAddProperty(event) {
    event.preventDefault();
    const form = document.getElementById('property-form');
    const statusEl = document.getElementById('property-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const address = form.querySelector('[name="property_address"]').value.trim();
    if (!address) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Address is required.'; }
      return;
    }

    const { error } = await supabaseClient.from('properties').insert([{
      property_address: address,
      property_status: form.querySelector('[name="property_status"]').value,
      purchase_price: form.querySelector('[name="purchase_price"]').value || null,
      sale_price: form.querySelector('[name="sale_price"]').value || null,
      notes: form.querySelector('[name="notes"]').value.trim() || null
    }]);

    if (error) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Failed: ' + error.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Property saved.'; }
    form.reset();
    await loadProperties();
    setTimeout(() => closeModal('property'), 1500);
  }

  // ── Load transactions ─────────────────────────────────────────────────────
  async function loadTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    const empty = document.getElementById('transactions-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, properties(property_address), profiles(full_name, email)')
      .order('created_at', { ascending: false });

    if (error) { console.error('Transactions error:', error); return; }

    const txns = data || [];
    if (!txns.length) { if (empty) empty.hidden = false; tbody.innerHTML = ''; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = txns.map((t) => {
      const prop = t.properties ? t.properties.property_address : '—';
      const client = t.profiles ? (t.profiles.full_name || t.profiles.email) : '—';
      return `<tr>
        <td>${prop}</td>
        <td>${client}</td>
        <td style="text-transform:capitalize">${t.transaction_type}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${t.created_at ? t.created_at.slice(0,10) : '—'}</td>
        <td><div class="table-actions">
          <button class="action-link" data-action="delete-txn" data-id="${t.id}" type="button">Delete</button>
        </div></td>
      </tr>`;
    }).join('');
  }

  // ── Add transaction ───────────────────────────────────────────────────────
  async function handleAddTransaction(event) {
    event.preventDefault();
    const form = document.getElementById('transaction-form');
    const statusEl = document.getElementById('transaction-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const propertyId = form.querySelector('[name="property_id"]').value;
    const clientId = form.querySelector('[name="client_id"]').value;

    if (!propertyId || !clientId) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Property and client are required.'; }
      return;
    }

    const { error } = await supabaseClient.from('transactions').insert([{
      property_id: propertyId,
      client_id: clientId,
      transaction_type: form.querySelector('[name="transaction_type"]').value,
      status: form.querySelector('[name="status"]').value,
      notes: form.querySelector('[name="notes"]').value.trim() || null
    }]);

    if (error) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Failed: ' + error.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Transaction created.'; }
    form.reset();
    await loadTransactions();
    setTimeout(() => closeModal('transaction'), 1500);
  }

  // ── Load documents ────────────────────────────────────────────────────────
  async function loadDocuments() {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('documents')
      .select('*, profiles!documents_client_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });

    if (error) { console.error('Docs error:', error); return; }
    allDocuments = data || [];
    renderDocuments();
  }

  function renderDocuments() {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    const visFilter = document.getElementById('admin-filter-visibility');
    const sigFilter = document.getElementById('admin-filter-signed');
    const visVal = visFilter ? visFilter.value : '';
    const sigVal = sigFilter ? sigFilter.value : '';

    let filtered = allDocuments.slice();
    if (visVal) filtered = filtered.filter((d) => d.visibility === visVal);
    if (sigVal === 'required') filtered = filtered.filter((d) => d.requires_signature);
    if (sigVal === 'signed') filtered = filtered.filter((d) => d.signed);
    if (sigVal === 'unsigned') filtered = filtered.filter((d) => d.requires_signature && !d.signed);

    if (!filtered.length) { tbody.innerHTML = ''; if (empty) empty.hidden = false; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = filtered.map((doc) => {
      const clientInfo = doc.profiles ? (doc.profiles.full_name || doc.profiles.email) : '—';
      return `<tr>
        <td>${doc.file_name}</td>
        <td>${doc.category || '—'}</td>
        <td>${clientInfo}</td>
        <td>${visibilityLabel(doc.visibility)}</td>
        <td>${sigBadge(doc)}</td>
        <td>${doc.created_at ? doc.created_at.slice(0,10) : '—'}</td>
        <td><div class="table-actions">
          <button class="action-link" data-action="toggle-doc" data-id="${doc.id}" type="button">${doc.hidden ? 'Unhide' : 'Hide'}</button>
          <button class="action-link" data-action="delete-doc" data-id="${doc.id}" type="button">Delete</button>
          ${doc.requires_signature && !doc.signed ? `<button class="action-link" data-action="require-sig" data-id="${doc.id}" type="button">Req. Sig.</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  }

  // ── Upload document ───────────────────────────────────────────────────────
  async function handleUpload(event, adminUserId) {
    event.preventDefault();
    const form = document.getElementById('upload-form');
    const statusEl = document.getElementById('upload-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const fileInput = document.getElementById('upload-file');
    const file = fileInput ? fileInput.files[0] : null;

    if (!file) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Please select a file.'; }
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = `File must be under ${MAX_FILE_SIZE_MB} MB.`; }
      return;
    }
    if (!isAllowedMime(file.type) || !hasAllowedExtension(file.name)) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Unsupported file type.'; }
      return;
    }

    const clientId = form.querySelector('[name="client_id"]').value || null;
    const propertyId = form.querySelector('[name="property_id"]').value || null;
    const filePath = clientId
      ? `admin/users/${clientId}/${Date.now()}-${file.name}`
      : propertyId
        ? `admin/${propertyId}/${Date.now()}-${file.name}`
        : `admin/${Date.now()}-${file.name}`;

    const bucketName = file.type.startsWith('image/') ? 'property-images' : 'property-documents';

    const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
    if (storageError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Upload failed: ' + storageError.message; }
      return;
    }

    const { error: dbError } = await supabaseClient.from('documents').insert([{
      client_id: clientId,
      property_id: propertyId,
      uploaded_by: adminUserId,
      file_name: file.name,
      file_path: filePath,
      bucket_name: bucketName,
      file_type: file.type,
      file_size: file.size,
      category: form.querySelector('[name="category"]').value || null,
      visibility: form.querySelector('[name="visibility"]').value,
      requires_signature: document.getElementById('upload-requires-sig').checked,
      notes: form.querySelector('[name="notes"]').value.trim() || null,
      hidden: false
    }]);

    if (dbError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'File saved but record failed: ' + dbError.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Document uploaded successfully.'; }
    form.reset();
    await loadDocuments();
    setTimeout(() => closeModal('upload'), 1500);
  }

  // ── Document table actions ────────────────────────────────────────────────
  async function handleDocumentAction(action, id) {
    const doc = allDocuments.find((d) => d.id === id);
    if (!doc) return;

    if (action === 'toggle-doc') {
      const { error } = await supabaseClient.from('documents').update({ hidden: !doc.hidden }).eq('id', id);
      if (error) { alert('Failed: ' + error.message); return; }
      await loadDocuments();
    }

    if (action === 'delete-doc') {
      if (!window.confirm('Delete this document? This cannot be undone.')) return;
      if (doc.bucket_name && doc.file_path) {
        await supabaseClient.storage.from(doc.bucket_name).remove([doc.file_path]);
      }
      const { error } = await supabaseClient.from('documents').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await loadDocuments();
    }

    if (action === 'require-sig') {
      const { error } = await supabaseClient.from('documents').update({ requires_signature: true }).eq('id', id);
      if (error) { alert('Failed: ' + error.message); return; }
      await loadDocuments();
    }
  }

  // ── Property table actions ────────────────────────────────────────────────
  async function handlePropertyAction(action, id) {
    if (action === 'delete-property') {
      if (!window.confirm('Delete this property? This cannot be undone.')) return;
      const { error } = await supabaseClient.from('properties').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await loadProperties();
    }
  }

  // ── Transaction table actions ─────────────────────────────────────────────
  async function handleTransactionAction(action, id) {
    if (action === 'delete-txn') {
      if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
      const { error } = await supabaseClient.from('transactions').delete().eq('id', id);
      if (error) { alert('Delete failed: ' + error.message); return; }
      await loadTransactions();
    }
  }

  // ── Leads ─────────────────────────────────────────────────────────────────
  async function loadLeads() {
    await Promise.all([loadFlipLeads(), loadContractorLeads()]);
  }

  async function loadFlipLeads() {
    const tbody = document.getElementById('flip-leads-tbody');
    const empty = document.getElementById('flip-leads-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient.from('house_flip_inquiries').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Flip leads error:', error); return; }

    const rows = data || [];
    if (!rows.length) { if (empty) empty.hidden = false; tbody.innerHTML = ''; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map((r) => `<tr>
      <td>${r.full_name}</td>
      <td>${r.email}</td>
      <td>${r.phone || '—'}</td>
      <td>${r.property_address || '—'}</td>
      <td>${r.estimated_value || '—'}</td>
      <td>${r.created_at ? r.created_at.slice(0,10) : '—'}</td>
    </tr>`).join('');
  }

  async function loadContractorLeads() {
    const tbody = document.getElementById('contractor-leads-tbody');
    const empty = document.getElementById('contractor-leads-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient.from('contractor_inquiries').select('*').order('created_at', { ascending: false });
    if (error) { console.error('Contractor leads error:', error); return; }

    const rows = data || [];
    if (!rows.length) { if (empty) empty.hidden = false; tbody.innerHTML = ''; return; }
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map((r) => `<tr>
      <td>${r.full_name}</td>
      <td>${r.company_name || '—'}</td>
      <td>${r.email}</td>
      <td>${r.service_type || '—'}</td>
      <td>${r.service_area || '—'}</td>
      <td>${r.created_at ? r.created_at.slice(0,10) : '—'}</td>
    </tr>`).join('');
  }

  // ── Login page ────────────────────────────────────────────────────────────
  function handleLoginPage() {
    // Tab switching
    const tabSignin = document.getElementById('tab-signin');
    const tabRegister = document.getElementById('tab-register');
    const panelSignin = document.getElementById('panel-signin');
    const panelRegister = document.getElementById('panel-register');

    if (tabSignin && tabRegister) {
      tabSignin.addEventListener('click', function () {
        tabSignin.classList.add('active');
        tabSignin.setAttribute('aria-selected', 'true');
        tabRegister.classList.remove('active');
        tabRegister.setAttribute('aria-selected', 'false');
        if (panelSignin) panelSignin.hidden = false;
        if (panelRegister) panelRegister.hidden = true;
      });
      tabRegister.addEventListener('click', function () {
        tabRegister.classList.add('active');
        tabRegister.setAttribute('aria-selected', 'true');
        tabSignin.classList.remove('active');
        tabSignin.setAttribute('aria-selected', 'false');
        if (panelRegister) panelRegister.hidden = false;
        if (panelSignin) panelSignin.hidden = true;
      });
    }

    // Sign-in form
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-button');
    if (loginForm && loginBtn) {
      loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const errorBox = document.getElementById('login-error');
        if (errorBox) { errorBox.textContent = ''; errorBox.className = 'form-status'; }

        if (!email || !password) {
          if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Enter both your email and password.'; }
          return;
        }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
          if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Login is temporarily unavailable.'; }
          return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in…';

        try {
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) {
            if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = error.message; }
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
            return;
          }
          // Route based on role
          const role = await getCurrentUserRole();
          window.location.href = role === 'admin' ? 'admin.html' : 'client.html';
        } catch (err) {
          if (errorBox) { errorBox.className = 'form-status error-message'; errorBox.textContent = 'Unable to sign in. Please try again.'; }
          loginBtn.disabled = false;
          loginBtn.textContent = 'Sign In';
        }
      });
    }

    // Register form
    const registerForm = document.getElementById('register-form');
    const registerBtn = document.getElementById('register-button');
    if (registerForm && registerBtn) {
      registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fullName = registerForm.querySelector('[name="full_name"]').value.trim();
        const email = registerForm.querySelector('[name="email"]').value.trim();
        const password = registerForm.querySelector('[name="password"]').value;
        const statusEl = document.getElementById('register-status');
        if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

        if (!email || !password) {
          if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Email and password are required.'; }
          return;
        }
        if (password.length < 8) {
          if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Password must be at least 8 characters.'; }
          return;
        }
        if (typeof supabaseClient === 'undefined' || !supabaseClient) {
          if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Registration is temporarily unavailable.'; }
          return;
        }

        registerBtn.disabled = true;
        registerBtn.textContent = 'Creating account…';

        try {
          const { error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName, role: 'client' } }
          });

          if (error) {
            if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = error.message; }
            registerBtn.disabled = false;
            registerBtn.textContent = 'Create Account';
            return;
          }

          if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Account created! Check your email to confirm your address, then sign in.'; }
          registerForm.reset();
          registerBtn.disabled = false;
          registerBtn.textContent = 'Create Account';
        } catch (err) {
          if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Registration failed. Please try again.'; }
          registerBtn.disabled = false;
          registerBtn.textContent = 'Create Account';
        }
      });
    }
  }

  // ── Admin page ────────────────────────────────────────────────────────────
  async function renderAdminPage() {
    const tableBody = document.getElementById('documents-tbody');
    if (!tableBody) return;

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      window.location.href = 'login.html';
      return;
    }

    const session = await getSession();
    if (!session) { window.location.href = 'login.html'; return; }

    const role = await getCurrentUserRole();
    if (role !== 'admin') {
      window.location.href = role === 'client' ? 'client.html' : 'login.html';
      return;
    }

    const adminUserId = session.user.id;
    const userEmail = session.user.email;

    const userDisplay = document.getElementById('logged-in-user');
    if (userDisplay) userDisplay.textContent = userEmail;

    // Logout
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
      });
    }

    initTabs();
    setupModalClose();

    // Load all data
    await Promise.all([loadUsers(), loadProperties(), loadTransactions(), loadDocuments(), loadLeads()]);

    // Modal openers
    const inviteBtn = document.getElementById('open-invite-modal');
    if (inviteBtn) inviteBtn.addEventListener('click', () => openModal('invite'));

    const propBtn = document.getElementById('open-property-modal');
    if (propBtn) propBtn.addEventListener('click', () => openModal('property'));

    const txnBtn = document.getElementById('open-transaction-modal');
    if (txnBtn) txnBtn.addEventListener('click', () => openModal('transaction'));

    const uploadBtn = document.getElementById('open-upload-modal');
    if (uploadBtn) uploadBtn.addEventListener('click', () => openModal('upload'));

    // Form submissions
    const inviteForm = document.getElementById('invite-form');
    if (inviteForm) inviteForm.addEventListener('submit', handleInvite);

    const propertyForm = document.getElementById('property-form');
    if (propertyForm) propertyForm.addEventListener('submit', handleAddProperty);

    const txnForm = document.getElementById('transaction-form');
    if (txnForm) txnForm.addEventListener('submit', handleAddTransaction);

    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) uploadForm.addEventListener('submit', (e) => handleUpload(e, adminUserId));

    // Document table delegation
    const docsTbody = document.getElementById('documents-tbody');
    if (docsTbody) {
      docsTbody.addEventListener('click', function (e) {
        const action = e.target.getAttribute('data-action');
        const id = e.target.getAttribute('data-id');
        if (!action || !id) return;
        handleDocumentAction(action, id);
      });
    }

    // Properties table delegation
    const propTbody = document.getElementById('properties-tbody');
    if (propTbody) {
      propTbody.addEventListener('click', function (e) {
        const action = e.target.getAttribute('data-action');
        const id = e.target.getAttribute('data-id');
        if (!action || !id) return;
        handlePropertyAction(action, id);
      });
    }

    // Transactions table delegation
    const txnTbody = document.getElementById('transactions-tbody');
    if (txnTbody) {
      txnTbody.addEventListener('click', function (e) {
        const action = e.target.getAttribute('data-action');
        const id = e.target.getAttribute('data-id');
        if (!action || !id) return;
        handleTransactionAction(action, id);
      });
    }

    // Document filters
    [document.getElementById('admin-filter-visibility'), document.getElementById('admin-filter-signed')].forEach((el) => {
      if (el) el.addEventListener('change', renderDocuments);
    });
  }

  // ── Entry point ───────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async function () {
    handleLoginPage();
    await renderAdminPage();
  });
})();
