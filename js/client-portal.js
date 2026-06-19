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

  let previewMode = false;
  let activeUserId = null;
  let allProperties = [];
  let allAccounts = [];
  let allDocuments = [];
  let allMaintenanceRequests = [];
  let allMaintenanceFiles = [];

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  function revealPage() {
    document.getElementById('auth-guard-style')?.remove();
    document.body.style.visibility = 'visible';
  }

  function getPreviewClientId() {
    return new URLSearchParams(window.location.search).get('view_as_client');
  }

  function normalizeAccountStatus(value) {
    const map = { pending: 'In Progress', closed: 'Completed', cancelled: 'Archived' };
    return map[String(value || '').toLowerCase()] || value || 'Not Reviewed Yet';
  }

  function normalizeMaintenanceStatus(value) {
    const map = { new: 'Not Reviewed Yet', 'in review': 'In Progress', scheduled: 'In Progress', 'in progress': 'In Progress', closed: 'Completed' };
    return map[String(value || '').toLowerCase()] || value || 'Not Reviewed Yet';
  }

  function setWorkflowTab(group, target) {
    document.querySelectorAll(`[data-workflow-group="${group}"]`).forEach((button) => {
      const active = button.getAttribute('data-workflow-target') === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll(`[data-workflow-panel^="${group}-"]`).forEach((panel) => {
      panel.hidden = panel.getAttribute('data-workflow-panel') !== `${group}-${target}`;
    });
  }

  function initTabs() {
    const buttons = document.querySelectorAll('.portal-tab-bar .portal-tab[data-tab]');
    buttons.forEach((btn) => {
      btn.addEventListener('click', function () {
        buttons.forEach((button) => {
          button.classList.remove('active');
          button.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');
        document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
        const target = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (target) target.hidden = false;
      });
    });

    document.querySelectorAll('.workflow-tab-bar .portal-tab').forEach((button) => {
      button.addEventListener('click', function () {
        setWorkflowTab(button.getAttribute('data-workflow-group'), button.getAttribute('data-workflow-target'));
      });
    });

    setWorkflowTab('client-accounts', 'active');
    setWorkflowTab('client-maintenance', 'active');
  }

  function statusPill(status) {
    const normalized = status || 'Not Reviewed Yet';
    const lower = normalized.toLowerCase();
    let type = 'active';
    if (lower.includes('not reviewed')) type = 'review';
    else if (lower.includes('progress') || lower.includes('pending')) type = 'progress';
    else if (lower.includes('completed') || lower.includes('signed')) type = 'success';
    else if (lower.includes('archived')) type = 'archived';
    return `<span class="status-pill ${type}">${escapeHtml(normalized)}</span>`;
  }

  function formatDateOnly(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleDateString());
  }

  function formatDateTime(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
  }

  function signatureLabel(doc) {
    const status = doc.signature_status || (doc.signed ? 'signed' : (doc.requires_signature ? 'pending_signature' : 'available'));
    if (status === 'signed') return `<span class="badge-doc-signed">Signed</span>`;
    if (status === 'pending_signature') return `<span class="badge-doc-required">Pending Signature</span>`;
    if (status === 'uploaded') return `<span class="badge-doc-required">Uploaded</span>`;
    return '<span class="badge-doc-none">Available</span>';
  }

  function getPropertyById(propertyId) {
    return allProperties.find((property) => property.id === propertyId) || null;
  }

  function getAccountById(accountId) {
    return allAccounts.find((account) => account.id === accountId) || null;
  }

  function getMaintenanceFiles(requestId) {
    return allMaintenanceFiles.filter((file) => file.maintenance_request_id === requestId);
  }

  async function getStorageUrl(bucket, filePath) {
    if (!bucket || !filePath) return null;
    const { data: signedData, error: signedError } = await supabaseClient.storage.from(bucket).createSignedUrl(filePath, 300);
    if (!signedError && signedData?.signedUrl) return signedData.signedUrl;
    const { data: publicData } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
    return publicData?.publicUrl || null;
  }

  async function getDocumentUrl(doc) {
    return getStorageUrl(doc.bucket_name || 'property-documents', doc.file_path);
  }

  async function loadProperties(userId) {
    const grid = document.getElementById('properties-grid-client');
    const empty = document.getElementById('properties-empty');
    const propertySelect = document.getElementById('maintenance-property');
    const { data, error } = await supabaseClient.from('properties').select('*').order('updated_at', { ascending: false });
    if (error) return;
    allProperties = data || [];
    if (propertySelect) {
      propertySelect.innerHTML = '<option value="">Select property…</option>' + allProperties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.property_address)}</option>`).join('');
    }
    if (!allProperties.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = allProperties.map((property) => `
      <div class="dashboard-card">
        <p class="eyebrow">${escapeHtml(property.visibility === 'public' ? 'Public Listing' : 'Internal Property')}</p>
        <h3>${escapeHtml(property.property_address)}</h3>
        <p>${statusPill(property.property_status || 'Active')}</p>
        ${property.notes ? `<p class="table-hint">${escapeHtml(property.notes)}</p>` : ''}
      </div>
    `).join('');
  }

  async function loadAccounts(userId) {
    const { data, error } = await supabaseClient
      .from('accounts')
      .select('*, account_clients!inner(client_id)')
      .eq('account_clients.client_id', userId)
      .order('updated_at', { ascending: false });
    if (error) return;
    allAccounts = (data || []).map((account) => ({ ...account, status: normalizeAccountStatus(account.status) }));
    const select = document.getElementById('client-upload-account');
    if (select) {
      select.innerHTML = '<option value="">Select account…</option>' + allAccounts.filter((account) => account.client_upload_enabled).map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)}</option>`).join('');
    }
    const maintSelect = document.getElementById('maintenance-account');
    if (maintSelect) {
      maintSelect.innerHTML = '<option value="">Select account…</option>' + allAccounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)}</option>`).join('');
    }
    renderAccounts();
    renderDashboardAccounts();
  }

  async function loadDocuments(userId) {
    const { data, error } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('client_id', userId)
      .eq('can_client_view', true)
      .eq('hidden', false)
      .order('created_at', { ascending: false });
    if (error) return;
    allDocuments = data || [];
    renderDocuments();
    renderDashboardFiles();
  }

  async function loadMaintenance(userId) {
    const [requests, files] = await Promise.all([
      supabaseClient.from('maintenance_requests').select('*').eq('client_id', userId).order('created_at', { ascending: false }),
      supabaseClient.from('maintenance_files').select('*').eq('client_id', userId).order('created_at', { ascending: false })
    ]);
    if (!requests.error) {
      allMaintenanceRequests = (requests.data || []).map((request) => ({ ...request, status: normalizeMaintenanceStatus(request.status) }));
    }
    if (!files.error) allMaintenanceFiles = files.data || [];
    renderMaintenanceTables();
    renderDashboardMaintenance();
  }

  function renderDashboardAccounts() {
    const mount = document.getElementById('dashboard-accounts-list');
    const empty = document.getElementById('dashboard-accounts-empty');
    const rows = allAccounts.slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    mount.innerHTML = rows.map((account) => `<div class="dashboard-summary-item"><span>${escapeHtml(account.account_name)}</span><span>${statusPill(account.status)}</span></div>`).join('');
  }

  function renderDashboardFiles() {
    const mount = document.getElementById('dashboard-files-list');
    const empty = document.getElementById('dashboard-files-empty');
    const rows = allDocuments.filter((doc) => doc.signature_url || doc.signature_status === 'pending_signature').slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    mount.innerHTML = rows.map((doc) => `<div class="dashboard-summary-item"><span>${escapeHtml(doc.file_name)}</span><span>${signatureLabel(doc)}</span></div>`).join('');
  }

  function renderDashboardMaintenance() {
    const mount = document.getElementById('dashboard-maintenance-list');
    const empty = document.getElementById('dashboard-maintenance-empty');
    const rows = allMaintenanceRequests.slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    mount.innerHTML = rows.map((request) => `<div class="dashboard-summary-item"><span>${escapeHtml(request.title || 'Maintenance Request')}</span><span>${statusPill(request.status)}</span></div>`).join('');
  }

  function renderAccounts() {
    const groups = {
      active: { mount: document.getElementById('accounts-active-grid'), empty: document.getElementById('accounts-active-empty'), rows: allAccounts.filter((account) => account.status !== 'Completed') },
      completed: { mount: document.getElementById('accounts-completed-grid'), empty: document.getElementById('accounts-completed-empty'), rows: allAccounts.filter((account) => account.status === 'Completed') }
    };
    Object.values(groups).forEach((config) => {
      if (!config.rows.length) {
        config.mount.innerHTML = '';
        config.empty.hidden = false;
        return;
      }
      config.empty.hidden = true;
      config.mount.innerHTML = config.rows.map((account) => `
        <div class="dashboard-card">
          <p class="eyebrow">${escapeHtml(account.account_type || 'Account')}</p>
          <h3>${escapeHtml(account.account_name)}</h3>
          <div class="account-card-meta">
            <p>${statusPill(account.status)}</p>
            <p><strong>Property:</strong> ${escapeHtml(getPropertyById(account.property_id)?.property_address || 'Unassigned')}</p>
            ${account.client_notes ? `<p class="account-card-notes">${escapeHtml(account.client_notes)}</p>` : ''}
            ${account.required_tasks ? `<p><strong>Required:</strong> ${escapeHtml(account.required_tasks)}</p>` : ''}
          </div>
        </div>
      `).join('');
    });
  }

  function renderDocuments() {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!allDocuments.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = allDocuments.map((doc) => `
      <tr>
        <td><button class="action-link document-link" data-action="open-file" data-id="${escapeHtml(doc.id)}" type="button">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category || 'Other')}</td>
        <td>${escapeHtml(getAccountById(doc.account_id)?.account_name || 'Unassigned')}</td>
        <td>${escapeHtml(getPropertyById(doc.property_id)?.property_address || 'Unassigned')}</td>
        <td>${signatureLabel(doc)}</td>
        <td>${formatDateOnly(doc.created_at)}</td>
        <td><div class="table-actions"><button class="action-link" data-action="open-file" data-id="${escapeHtml(doc.id)}" type="button">Open</button>${doc.visibility === 'client_downloadable' || previewMode ? `<button class="action-link" data-action="download-file" data-id="${escapeHtml(doc.id)}" type="button">Download</button>` : ''}${doc.signature_url ? `<button class="action-link badge-doc-required-btn" data-action="sign-file" data-id="${escapeHtml(doc.id)}" type="button">Sign Document</button>` : ''}</div></td>
      </tr>
    `).join('');
  }

  function renderMaintenanceTables() {
    const groups = {
      active: { tbody: document.getElementById('maintenance-active-tbody'), empty: document.getElementById('maintenance-active-empty'), rows: allMaintenanceRequests.filter((request) => request.status !== 'Completed') },
      completed: { tbody: document.getElementById('maintenance-completed-tbody'), empty: document.getElementById('maintenance-completed-empty'), rows: allMaintenanceRequests.filter((request) => request.status === 'Completed') }
    };
    Object.values(groups).forEach((config) => {
      if (!config.rows.length) {
        config.tbody.innerHTML = '';
        config.empty.hidden = false;
        return;
      }
      config.empty.hidden = true;
      config.tbody.innerHTML = config.rows.map((request) => {
        const files = getMaintenanceFiles(request.id);
        const fileLinks = files.length ? `<div class="file-link-grid">${files.map((file) => `<button class="action-link" data-action="open-maint-file" data-id="${escapeHtml(file.id)}" type="button">${escapeHtml(file.file_name)}</button>`).join('')}</div>` : 'None';
        return `
          <tr>
            <td>${formatDateTime(request.created_at)}</td>
            <td>${escapeHtml(getPropertyById(request.property_id)?.property_address || 'Unassigned')}</td>
            <td>${escapeHtml(getAccountById(request.account_id)?.account_name || 'Unassigned')}</td>
            <td class="dashboard-cell-wrap"><strong>${escapeHtml(request.title || 'N/A')}</strong><div class="table-hint">${escapeHtml(request.description || '')}</div></td>
            <td>${escapeHtml(request.priority || 'Medium')}</td>
            <td>${statusPill(request.status)}</td>
            <td>${escapeHtml(request.admin_comments || 'No admin comments yet.')}</td>
            <td>${fileLinks}</td>
          </tr>
        `;
      }).join('');
    });
  }

  async function openDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    const url = await getDocumentUrl(doc);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function downloadDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    const url = await getDocumentUrl(doc);
    if (!url) return;
    const response = await fetch(url);
    if (!response.ok) return;
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = doc.file_name || 'file';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  function openSignatureLink(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc?.signature_url) return;
    window.open(doc.signature_url, '_blank', 'noopener,noreferrer');
  }

  async function openMaintenanceFile(fileId) {
    const file = allMaintenanceFiles.find((item) => item.id === fileId);
    if (!file) return;
    const url = await getStorageUrl(file.bucket_name || 'maintenance-files', file.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleUpload(event, userId) {
    event.preventDefault();
    if (previewMode) return;
    const accountSelect = document.getElementById('client-upload-account');
    const categorySelect = document.getElementById('client-upload-category');
    const fileInput = document.getElementById('client-upload-file');
    const notesInput = document.getElementById('client-upload-notes');
    const uploadBtn = document.getElementById('client-upload-btn');
    const statusEl = document.getElementById('upload-status');
    const account = getAccountById(accountSelect?.value);
    const file = fileInput?.files?.[0] || null;
    if (!account || !account.client_upload_enabled) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Select an account that allows client uploads.';
      return;
    }
    if (!file || !categorySelect?.value) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Select an account, category, and file.';
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = `File must be under ${MAX_FILE_SIZE_MB} MB.`;
      return;
    }
    if (!isAllowedMime(file.type) || !hasAllowedExtension(file.name)) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Unsupported file type.';
      return;
    }
    uploadBtn.disabled = true;
    const filePath = `${userId}/${account.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
    const { error: storageError } = await supabaseClient.storage.from('property-documents').upload(filePath, file);
    if (storageError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Upload failed: ' + storageError.message;
      uploadBtn.disabled = false;
      return;
    }
    const { error: dbError } = await supabaseClient.from('documents').insert([{
      account_id: account.id,
      property_id: account.property_id || null,
      client_id: userId,
      uploaded_by: userId,
      file_name: file.name,
      file_path: filePath,
      bucket_name: 'property-documents',
      file_type: file.type,
      file_size: file.size,
      category: categorySelect.value,
      visibility: 'client_visible',
      can_client_view: true,
      can_client_edit: true,
      notes: notesInput?.value.trim() || null,
      hidden: false,
      updated_at: new Date().toISOString()
    }]);
    uploadBtn.disabled = false;
    if (dbError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'File saved but record failed: ' + dbError.message;
      return;
    }
    event.target.reset();
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'File uploaded successfully.';
    await loadDocuments(userId);
  }

  async function handleMaintenanceSubmit(event, userId) {
    event.preventDefault();
    if (previewMode) return;
    const propertyId = document.getElementById('maintenance-property')?.value || null;
    const accountId = document.getElementById('maintenance-account')?.value || null;
    const priority = document.getElementById('maintenance-priority')?.value || 'Medium';
    const title = document.getElementById('maintenance-title')?.value.trim() || '';
    const description = document.getElementById('maintenance-description')?.value.trim() || '';
    const filesInput = document.getElementById('maintenance-files');
    const statusEl = document.getElementById('maintenance-form-status');
    const submitBtn = document.getElementById('maintenance-submit-btn');
    if (!title || !description) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Title and description are required.';
      return;
    }
    submitBtn.disabled = true;
    const requestPayload = {
      client_id: userId,
      property_id: propertyId,
      account_id: accountId,
      title,
      description,
      priority,
      status: 'Not Reviewed Yet',
      admin_comments: null,
      updated_at: new Date().toISOString()
    };
    const { data: request, error } = await supabaseClient.from('maintenance_requests').insert([requestPayload]).select().single();
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Unable to create request: ' + error.message;
      submitBtn.disabled = false;
      return;
    }
    const uploads = Array.from(filesInput?.files || []);
    for (const file of uploads) {
      if (file.size > MAX_FILE_SIZE_BYTES || !isAllowedMime(file.type) || !hasAllowedExtension(file.name)) continue;
      const bucketName = 'maintenance-files';
      const filePath = `${userId}/${request.id}/${Date.now()}-${sanitizeFilename(file.name)}`;
      const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
      if (!storageError) {
        await supabaseClient.from('maintenance_files').insert([{
          maintenance_request_id: request.id,
          client_id: userId,
          account_id: accountId,
          property_id: propertyId,
          file_name: file.name,
          file_path: filePath,
          bucket_name: bucketName,
          file_type: file.type,
          file_size: file.size,
          category: file.type.startsWith('image/') ? 'Photo' : 'Other'
        }]);
      }
    }
    event.target.reset();
    submitBtn.disabled = false;
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Maintenance request submitted.';
    await loadMaintenance(userId);
  }

  function applyPreviewMode(clientProfile) {
    previewMode = true;
    const hero = document.querySelector('.admin-topbar');
    if (hero) {
      const banner = document.createElement('div');
      banner.className = 'preview-banner';
      banner.innerHTML = `<strong>Preview Mode:</strong> Viewing the client portal as ${escapeHtml(clientProfile.full_name || clientProfile.email)}. <a href="admin.html?tab=users">Return to Admin</a>`;
      hero.parentNode.insertBefore(banner, hero.nextSibling);
    }
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return window.location.replace('login.html');
    const session = await getSession();
    if (!session) return window.location.replace('login.html');
    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile) return window.location.replace('login.html');
    const previewClientId = getPreviewClientId();
    const isAdminPreview = currentProfile.role === 'admin' && previewClientId;
    if (!isAdminPreview && currentProfile.role !== 'client') return window.location.replace(currentProfile.role === 'admin' ? 'admin.html' : 'login.html');
    if (!isAdminPreview && currentProfile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      return window.location.replace('login.html?inactive=1');
    }
    revealPage();
    activeUserId = isAdminPreview ? previewClientId : session.user.id;
    let displayProfile = currentProfile;
    if (isAdminPreview) {
      const { data: previewProfile } = await supabaseClient.from('profiles').select('id, email, full_name, role, status').eq('id', previewClientId).single();
      if (!previewProfile || previewProfile.role !== 'client') return window.location.replace('admin.html?tab=users');
      displayProfile = previewProfile;
      applyPreviewMode(displayProfile);
    }
    document.getElementById('client-name').textContent = displayProfile.full_name || displayProfile.email || 'Client';
    document.getElementById('client-email').textContent = displayProfile.email || '';
    document.getElementById('client-logout')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });
    initTabs();
    await Promise.all([
      loadProperties(activeUserId),
      loadAccounts(activeUserId),
      loadDocuments(activeUserId),
      loadMaintenance(activeUserId)
    ]);
    document.getElementById('documents-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const id = button.getAttribute('data-id');
      const action = button.getAttribute('data-action');
      if (action === 'open-file') openDocument(id);
      if (action === 'download-file') downloadDocument(id);
      if (action === 'sign-file') openSignatureLink(id);
    });
    ['maintenance-active-tbody', 'maintenance-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action="open-maint-file"]');
        if (button) openMaintenanceFile(button.getAttribute('data-id'));
      });
    });
    document.getElementById('client-upload-form')?.addEventListener('submit', function (event) { handleUpload(event, activeUserId); });
    document.getElementById('maintenance-form')?.addEventListener('submit', function (event) { handleMaintenanceSubmit(event, activeUserId); });
  });
})();
