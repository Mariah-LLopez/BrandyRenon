(function () {
  const STORAGE_BUCKETS = window.STORAGE_BUCKETS || {
    PROPERTY_IMAGES: 'property-images',
    CLIENT_DOCUMENTS: 'client-documents',
    MAINTENANCE_FILES: 'maintenance-files',
    ACCOUNT_FILES: 'account-files',
    LEGACY_PROPERTY_DOCUMENTS: 'property-documents'
  };
  const MAX_FILE_SIZE_MB = 10;
  const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
  const ALLOWED_EXTENSIONS = window.SUPABASE_FILE_RULES?.allowedExtensions || ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.webp'];
  const ALLOWED_MIME_TYPES = window.SUPABASE_FILE_RULES?.allowedMimeTypes || [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp'
  ];

  let previewMode = false;
  let activeUserId = null;
  let allProperties = [];
  let allAccounts = [];
  let allDocuments = [];
  let allPropertyPhotoDocs = [];
  let allMaintenanceRequests = [];
  let allMaintenanceFiles = [];
  let allClientMessages = [];
  let allClientTasks = [];

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  function setFormStatus(statusEl, type, message) {
    if (!statusEl) return;
    statusEl.className = type ? `form-status ${type}` : 'form-status';
    statusEl.textContent = message || '';
  }

  function buildStoragePath(bucketName, options) {
    const config = options || {};
    const uniquePrefix = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeName = sanitizeFilename(config.fileName);
    if (bucketName === STORAGE_BUCKETS.MAINTENANCE_FILES) {
      return `clients/${config.clientId || 'unknown'}/maintenance/${config.requestId || 'pending'}/${uniquePrefix}-${safeName}`;
    }
    if (bucketName === STORAGE_BUCKETS.ACCOUNT_FILES) {
      return `clients/${config.clientId || 'unknown'}/accounts/${config.accountId || 'unassigned'}/${uniquePrefix}-${safeName}`;
    }
    return `clients/${config.clientId || 'unknown'}/documents/${config.accountId || config.propertyId || 'general'}/${uniquePrefix}-${safeName}`;
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

  function normalizeTaskStatus(value) {
    const map = { 'not reviewed': 'Not Reviewed Yet', 'waiting on user': 'In Progress', 'waiting on admin': 'In Progress', archived: 'Completed' };
    return map[String(value || '').toLowerCase()] || value || 'Not Reviewed Yet';
  }

  function normalizeMessageStatus(value) {
    const map = { open: 'Not Reviewed Yet', 'not reviewed': 'Not Reviewed Yet', replied: 'Completed', closed: 'Completed' };
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

    document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
    const defaultTab = document.getElementById('tab-accounts');
    if (defaultTab) defaultTab.hidden = false;
    buttons.forEach((button) => {
      const active = button.getAttribute('data-tab') === 'accounts';
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    setWorkflowTab('client-accounts', 'active');
    setWorkflowTab('client-maintenance', 'active');
    setWorkflowTab('client-files', 'active');
    setWorkflowTab('client-messages', 'active');
    setWorkflowTab('client-tasks', 'active');
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

  function getSignatureState(doc) {
    return doc.signature_status || (doc.signed ? 'signed' : (doc.requires_signature ? 'pending_signature' : 'available'));
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

  function signatureBadge(doc) {
    const status = getSignatureState(doc);
    if (status === 'signed') return `<span class="badge-doc-signed">Signed</span>`;
    if (status === 'pending_signature') return `<span class="badge-doc-required">Pending Signature</span>`;
    if (status === 'uploaded') return `<span class="badge-doc-required">Uploaded</span>`;
    return '<span class="badge-doc-none">Available</span>';
  }

  function renderDocumentActions(doc) {
    const buttons = [
      `<button class="action-link" data-action="open-file" data-id="${escapeHtml(doc.id)}" type="button">Open</button>`
    ];
    if (doc.visibility === 'client_downloadable' || previewMode) {
      buttons.push(`<button class="action-link" data-action="download-file" data-id="${escapeHtml(doc.id)}" type="button">Download</button>`);
    }
    if (doc.signature_url) {
      buttons.push(`<button class="action-link badge-doc-required-btn" data-action="sign-file" data-id="${escapeHtml(doc.id)}" type="button">Sign Document</button>`);
    }
    return `<div class="table-actions">${buttons.join('')}</div>`;
  }

  function renderMaintenanceFileActions(file) {
    return `<span class="table-actions"><button class="action-link" data-action="open-maint-file" data-id="${escapeHtml(file.id)}" type="button">${escapeHtml(file.file_name)}</button><button class="action-link" data-action="download-maint-file" data-id="${escapeHtml(file.id)}" type="button">Download</button></span>`;
  }

  function getPropertyById(propertyId) {
    return allProperties.find((property) => property.id === propertyId) || null;
  }

  function getPropertyPhotoUrls(property) {
    if (!property?.id) return [];
    return allPropertyPhotoDocs
      .filter((doc) => doc.property_id === property.id && doc.file_path)
      .map((doc) => {
        const { data } = supabaseClient.storage.from('property-images').getPublicUrl(doc.file_path);
        return data?.publicUrl || null;
      })
      .filter(Boolean);
  }

  function getPrimaryPropertyPhoto(property) {
    return getPropertyPhotoUrls(property)[0] || null;
  }

  function getAccountById(accountId) {
    return allAccounts.find((account) => account.id === accountId) || null;
  }

  function getMaintenanceFiles(requestId) {
    return allMaintenanceFiles.filter((file) => file.maintenance_request_id === requestId);
  }

  async function getStorageUrl(bucket, filePath) {
    return getSupabaseStorageUrl(bucket, filePath, { expiresIn: 300 });
  }

  async function getDocumentUrl(doc) {
    return getStorageUrl(doc.bucket_name || STORAGE_BUCKETS.CLIENT_DOCUMENTS, doc.file_path);
  }

  async function loadProperties(userId) {
    const grid = document.getElementById('properties-grid-client');
    const empty = document.getElementById('properties-empty');
    const propertySelect = document.getElementById('maintenance-property');
    const { data, error } = await supabaseClient.from('properties').select('*').order('updated_at', { ascending: false });
    if (error) return;
    allProperties = data || [];
    if (allProperties.length) {
      const propertyIds = allProperties.map((p) => p.id);
      const { data: photoDocs } = await supabaseClient
        .from('documents')
        .select('id, property_id, file_path, bucket_name')
        .in('property_id', propertyIds)
        .eq('category', 'Property Photo');
      allPropertyPhotoDocs = photoDocs || [];
    } else {
      allPropertyPhotoDocs = [];
    }
    if (propertySelect) {
      propertySelect.innerHTML = '<option value="">Select property…</option>' + allProperties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.property_address)}</option>`).join('');
    }
    const inquiryPropertySelect = document.getElementById('inquiry-property');
    if (inquiryPropertySelect) {
      inquiryPropertySelect.innerHTML = '<option value="">Select property…</option>' + allProperties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.property_address)}</option>`).join('');
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
    const inquiryAccountSelect = document.getElementById('inquiry-account');
    if (inquiryAccountSelect) {
      inquiryAccountSelect.innerHTML = '<option value="">Select account…</option>' + allAccounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)}</option>`).join('');
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
    const rows = allDocuments.filter((doc) => doc.signature_url || getSignatureState(doc) === 'pending_signature').slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    mount.innerHTML = rows.map((doc) => `<div class="dashboard-summary-item"><span>${escapeHtml(doc.file_name)}</span><span>${signatureBadge(doc)}</span></div>`).join('');
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
      config.mount.innerHTML = config.rows.map((account) => {
        const property = getPropertyById(account.property_id);
        const propertyPhoto = getPrimaryPropertyPhoto(property);
        return `
        <div class="dashboard-card">
          <p class="eyebrow">${escapeHtml(account.account_type || 'Account')}</p>
          <h3>${escapeHtml(account.account_name)}</h3>
          <div class="account-property-stack">
            ${propertyPhoto ? `<img class="account-property-preview" src="${escapeHtml(propertyPhoto)}" alt="Photo of ${escapeHtml(property?.property_address || account.account_name)}">` : ''}
            <div class="account-card-meta">
            <p>${statusPill(account.status)}</p>
            <p><strong>Property:</strong> ${escapeHtml(property?.property_address || 'Unassigned')}</p>
            ${account.client_notes ? `<p class="account-card-notes">${escapeHtml(account.client_notes)}</p>` : ''}
            ${account.required_tasks ? `<p><strong>Required:</strong> ${escapeHtml(account.required_tasks)}</p>` : ''}
          </div>
          </div>
        </div>
      `;
      }).join('');
    });
  }

  function renderDocuments() {
    const groups = {
      active: {
        tbody: document.getElementById('documents-active-tbody'),
        empty: document.getElementById('documents-active-empty'),
        rows: allDocuments.filter((doc) => !['Completed', 'signed'].includes(doc.status || '') && getSignatureState(doc) !== 'signed')
      },
      completed: {
        tbody: document.getElementById('documents-completed-tbody'),
        empty: document.getElementById('documents-completed-empty'),
        rows: allDocuments.filter((doc) => (doc.status || '') === 'Completed' || getSignatureState(doc) === 'signed')
      }
    };
    Object.values(groups).forEach((group) => {
      if (!group.tbody) return;
      if (!group.rows.length) {
        group.tbody.innerHTML = '';
        if (group.empty) group.empty.hidden = false;
        return;
      }
      if (group.empty) group.empty.hidden = true;
      group.tbody.innerHTML = group.rows.map((doc) => `
      <tr>
        <td><button class="action-link document-link" data-action="open-file" data-id="${escapeHtml(doc.id)}" type="button">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category || 'Other')}</td>
        <td>${escapeHtml(getAccountById(doc.account_id)?.account_name || 'Unassigned')}</td>
        <td>${escapeHtml(getPropertyById(doc.property_id)?.property_address || 'Unassigned')}</td>
        <td>${signatureBadge(doc)}</td>
        <td>${formatDateOnly(doc.created_at)}</td>
        <td>${renderDocumentActions(doc)}</td>
      </tr>
    `).join('');
    });
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
        const fileLinks = files.length
          ? `<div class="file-link-grid">${files.map((file) => renderMaintenanceFileActions(file)).join('')}</div>`
          : 'None';
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
    try {
      const url = await getDocumentUrl(doc);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(`Unable to open file: ${error.message}`);
    }
  }

  async function downloadDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    try {
      const url = await getDocumentUrl(doc);
      if (!url) return;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = doc.file_name || 'file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(`Unable to download file: ${error.message}`);
    }
  }

  function openSignatureLink(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc?.signature_url) return;
    window.open(doc.signature_url, '_blank', 'noopener,noreferrer');
  }

  async function openMaintenanceFile(fileId) {
    const file = allMaintenanceFiles.find((item) => item.id === fileId);
    if (!file) return;
    try {
      const url = await getStorageUrl(file.bucket_name || STORAGE_BUCKETS.MAINTENANCE_FILES, file.file_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(`Unable to open maintenance file: ${error.message}`);
    }
  }

  async function downloadMaintenanceFile(fileId) {
    const file = allMaintenanceFiles.find((item) => item.id === fileId);
    if (!file) return;
    try {
      const url = await getStorageUrl(file.bucket_name || STORAGE_BUCKETS.MAINTENANCE_FILES, file.file_path);
      if (!url) return;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.file_name || 'maintenance-file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(`Unable to download maintenance file: ${error.message}`);
    }
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
    const files = Array.from(fileInput?.files || []);
    if (!account || !account.client_upload_enabled) {
      setFormStatus(statusEl, 'error-message', 'Select an account that allows client uploads.');
      return;
    }
    if (!files.length || !categorySelect?.value) {
      setFormStatus(statusEl, 'error-message', 'Select an account, category, and at least one file.');
      return;
    }
    for (const file of files) {
      const validationError = getSupabaseFileValidationError(file, {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        maxSizeMb: MAX_FILE_SIZE_MB
      });
      if (validationError) {
        setFormStatus(statusEl, 'error-message', `"${file.name}": ${validationError}`);
        return;
      }
    }
    uploadBtn.disabled = true;
    const bucketName = accountSelect?.value && account ? STORAGE_BUCKETS.ACCOUNT_FILES : STORAGE_BUCKETS.CLIENT_DOCUMENTS;
    const sharedNotes = notesInput?.value.trim() || null;
    const uploadedPaths = [];
    const insertedDocumentIds = [];
    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        setFormStatus(statusEl, '', `Uploading file ${fileIndex + 1} of ${files.length}: ${file.name}`);
        const filePath = buildStoragePath(bucketName, {
          clientId: userId,
          accountId: account?.id || null,
          propertyId: account?.property_id || null,
          fileName: file.name
        });
        const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
        if (storageError) throw new Error(`"${file.name}": ${storageError.message}`);
        uploadedPaths.push(filePath);
        const { data: insertedDocument, error: dbError } = await supabaseClient
          .from('documents')
          .insert([{
            account_id: account.id,
            property_id: account.property_id || null,
            client_id: userId,
            uploaded_by: userId,
            file_name: file.name,
            file_path: filePath,
            bucket_name: bucketName,
            file_type: file.type,
            file_size: file.size,
            category: categorySelect.value,
            visibility: 'client_visible',
            can_client_view: true,
            can_client_edit: true,
            status: 'Not Reviewed Yet',
            priority: 'Medium',
            notes: sharedNotes,
            hidden: false,
            updated_at: new Date().toISOString()
          }])
          .select('id')
          .single();
        if (dbError) {
          throw new Error(`"${file.name}": ${typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(dbError) : dbError.message}`);
        }
        if (insertedDocument?.id) insertedDocumentIds.push(insertedDocument.id);
      }
    } catch (error) {
      if (insertedDocumentIds.length) {
        const { error: rollbackDbError } = await supabaseClient.from('documents').delete().in('id', insertedDocumentIds);
        if (rollbackDbError) console.error('Document rollback failed:', rollbackDbError);
      }
      if (uploadedPaths.length) {
        const { error: rollbackStorageError } = await supabaseClient.storage.from(bucketName).remove(uploadedPaths);
        if (rollbackStorageError) console.error('Storage rollback failed:', rollbackStorageError);
      }
      uploadBtn.disabled = false;
      setFormStatus(statusEl, 'error-message', 'Upload failed: ' + error.message);
      return;
    }
    uploadBtn.disabled = false;
    event.target.reset();
    setFormStatus(statusEl, 'success-message', `${files.length} file${files.length === 1 ? '' : 's'} uploaded successfully.`);
    notifySubmission({
      submission_type: 'Client Document Upload',
      name: document.getElementById('client-name')?.textContent || 'Portal Client',
      email: document.getElementById('client-email')?.textContent || '',
      phone: '',
      property_of_interest: getPropertyById(account.property_id)?.property_address || null,
      details: `Uploaded ${files.length} file${files.length === 1 ? '' : 's'}`,
      submitted_at: new Date().toISOString()
    });
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
    if (!title || !description || !propertyId) {
      setFormStatus(statusEl, 'error-message', 'Please provide a title, description, and select a property.');
      return;
    }
    const uploads = Array.from(filesInput?.files || []);
    for (const file of uploads) {
      const validationError = getSupabaseFileValidationError(file, {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        maxSizeMb: MAX_FILE_SIZE_MB
      });
      if (validationError) {
        setFormStatus(statusEl, 'error-message', `"${file.name}": ${validationError}`);
        return;
      }
    }
    submitBtn.disabled = true;
    setFormStatus(statusEl, '', 'Submitting…');
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
      setFormStatus(statusEl, 'error-message', 'Unable to create request: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message));
      submitBtn.disabled = false;
      return;
    }
    for (let index = 0; index < uploads.length; index++) {
      const file = uploads[index];
      const bucketName = STORAGE_BUCKETS.MAINTENANCE_FILES;
      const filePath = buildStoragePath(bucketName, {
        clientId: userId,
        requestId: request.id,
        fileName: file.name
      });
      setFormStatus(statusEl, '', `Uploading file ${index + 1} of ${uploads.length}: ${file.name}`);
      const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
      if (storageError) {
        submitBtn.disabled = false;
        setFormStatus(statusEl, 'error-message', 'Maintenance file upload failed: ' + storageError.message);
        await loadMaintenance(userId);
        return;
      }
      const { error: fileError } = await supabaseClient.from('maintenance_files').insert([{
        maintenance_request_id: request.id,
        client_id: userId,
        property_id: propertyId,
        account_id: accountId,
        bucket_name: bucketName,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category: file.type.startsWith('image/') ? 'Photo' : 'Other',
        uploaded_by: userId
      }]);
      if (fileError) {
        await supabaseClient.storage.from(bucketName).remove([filePath]);
        submitBtn.disabled = false;
        setFormStatus(statusEl, 'error-message', 'Maintenance file save failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(fileError) : fileError.message));
        return;
      }
    }
    event.target.reset();
    submitBtn.disabled = false;
    setFormStatus(statusEl, 'success-message', 'Maintenance request submitted.');
    notifySubmission({
      submission_type: 'Maintenance Request',
      name: document.getElementById('client-name')?.textContent || 'Portal Client',
      email: document.getElementById('client-email')?.textContent || '',
      phone: '',
      property_of_interest: getPropertyById(propertyId)?.property_address || null,
      details: description,
      submitted_at: new Date().toISOString()
    });
    // Auto-create an admin task for this maintenance request
    await supabaseClient.from('tasks').insert([{
      user_id: userId,
      account_id: accountId || null,
      property_id: propertyId || null,
      task_type: 'Maintenance Request',
      title: title,
      description: description,
      status: 'Not Reviewed Yet',
      priority: priority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
    await loadMaintenance(userId);
  }

  async function loadMessages(userId) {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return;
    allClientMessages = (data || []).map((row) => ({ ...row, status: normalizeMessageStatus(row.status) }));
    renderClientMessages();
    renderDashboardMessages();
  }

  async function loadTasks(userId) {
    const { data, error } = await supabaseClient
      .from('tasks')
      .select('*, accounts(account_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) return;
    allClientTasks = (data || []).map((row) => ({ ...row, status: normalizeTaskStatus(row.status) }));
    renderClientTasks();
    renderDashboardTasks();
  }

  function renderClientMessages() {
    const groups = {
      active: {
        tbody: document.getElementById('client-messages-active-tbody'),
        empty: document.getElementById('client-messages-active-empty'),
        rows: allClientMessages.filter((msg) => !['Completed', 'Closed'].includes(msg.status || ''))
      },
      completed: {
        tbody: document.getElementById('client-messages-completed-tbody'),
        empty: document.getElementById('client-messages-completed-empty'),
        rows: allClientMessages.filter((msg) => ['Completed', 'Closed'].includes(msg.status || ''))
      }
    };
    Object.values(groups).forEach((group) => {
      if (!group.tbody) return;
      if (!group.rows.length) {
        group.tbody.innerHTML = '';
        if (group.empty) group.empty.hidden = false;
        return;
      }
      if (group.empty) group.empty.hidden = true;
      group.tbody.innerHTML = group.rows.map((msg) => `
      <tr>
        <td>${formatDateTime(msg.created_at)}</td>
        <td>${escapeHtml(msg.message_type || 'Message')}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(msg.subject || '')}</td>
        <td>${escapeHtml(msg.priority || 'Medium')}</td>
        <td>${statusPill(msg.status || 'Open')}</td>
      </tr>
    `).join('');
    });
  }

  function renderClientTasks() {
    const groups = {
      active: {
        tbody: document.getElementById('client-tasks-active-tbody'),
        empty: document.getElementById('client-tasks-active-empty'),
        rows: allClientTasks.filter((task) => !['Completed', 'Archived'].includes(task.status || ''))
      },
      completed: {
        tbody: document.getElementById('client-tasks-completed-tbody'),
        empty: document.getElementById('client-tasks-completed-empty'),
        rows: allClientTasks.filter((task) => ['Completed', 'Archived'].includes(task.status || ''))
      }
    };
    Object.values(groups).forEach((group) => {
      if (!group.tbody) return;
      if (!group.rows.length) {
        group.tbody.innerHTML = '';
        if (group.empty) group.empty.hidden = false;
        return;
      }
      if (group.empty) group.empty.hidden = true;
      group.tbody.innerHTML = group.rows.map((task) => `
      <tr>
        <td class="dashboard-cell-wrap"><strong>${escapeHtml(task.title || 'Task')}</strong></td>
        <td>${escapeHtml(task.task_type || '')}</td>
        <td>${escapeHtml(task.accounts?.account_name || 'Unassigned')}</td>
        <td>${escapeHtml(task.priority || 'Medium')}</td>
        <td>${formatDateOnly(task.due_date)}</td>
        <td>${statusPill(task.status || 'Not Reviewed')}</td>
        <td>${escapeHtml(task.user_visible_notes || '')}</td>
      </tr>
    `).join('');
    });
  }

  function renderDashboardMessages() {
    const mount = document.getElementById('dashboard-messages-list');
    const empty = document.getElementById('dashboard-messages-empty');
    if (!mount) return;
    const rows = allClientMessages.slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    mount.innerHTML = rows.map((msg) => `<div class="dashboard-summary-item"><span>${escapeHtml(msg.subject || msg.message_type || 'Message')}</span><span>${statusPill(msg.status || 'Open')}</span></div>`).join('');
  }

  function renderDashboardTasks() {
    const mount = document.getElementById('dashboard-tasks-list');
    const empty = document.getElementById('dashboard-tasks-empty');
    if (!mount) return;
    const rows = allClientTasks.filter((t) => t.status !== 'Completed' && t.status !== 'Archived').slice(0, 4);
    if (!rows.length) {
      mount.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    mount.innerHTML = rows.map((task) => `<div class="dashboard-summary-item"><span>${escapeHtml(task.title || 'Task')}</span><span>${statusPill(task.status || 'Not Reviewed')}</span></div>`).join('');
  }

  async function handleInquirySubmit(event, userId) {
    event.preventDefault();
    if (previewMode) return;
    const typeEl = document.getElementById('inquiry-type');
    const accountEl = document.getElementById('inquiry-account');
    const propertyEl = document.getElementById('inquiry-property');
    const subjectEl = document.getElementById('inquiry-subject');
    const bodyEl = document.getElementById('inquiry-body');
    const statusEl = document.getElementById('inquiry-form-status');
    const submitBtn = document.getElementById('inquiry-submit-btn');
    if (!typeEl?.value || !subjectEl?.value.trim() || !bodyEl?.value.trim()) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Message type, subject, and message body are required.';
      return;
    }
    submitBtn.disabled = true;
    const { data: msg, error } = await supabaseClient.from('messages').insert([{
      user_id: userId,
      account_id: accountEl?.value || null,
      property_id: propertyEl?.value || null,
      message_type: typeEl.value,
      subject: subjectEl.value.trim(),
      message_body: bodyEl.value.trim(),
      status: 'Not Reviewed Yet',
      priority: 'Medium',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]).select().single();
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Unable to send message: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message);
      submitBtn.disabled = false;
      return;
    }
    // Auto-create an admin task
    await supabaseClient.from('tasks').insert([{
      user_id: userId,
      account_id: accountEl?.value || null,
      property_id: propertyEl?.value || null,
      task_type: 'Property Inquiry',
      title: subjectEl.value.trim(),
      description: bodyEl.value.trim(),
      status: 'Not Reviewed Yet',
      priority: 'Medium',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);
    notifySubmission({
      submission_type: 'Portal Message / Request',
      name: document.getElementById('client-name')?.textContent || 'Portal Client',
      email: document.getElementById('client-email')?.textContent || '',
      phone: '',
      property_of_interest: getPropertyById(propertyEl?.value || null)?.property_address || null,
      details: bodyEl.value.trim(),
      submitted_at: new Date().toISOString()
    });
    event.target.reset();
    submitBtn.disabled = false;
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Message sent successfully.';
    await loadMessages(userId);
  }

  function detectClientRoles() {
    const types = allAccounts.map((a) => (a.account_type || '').toLowerCase());
    return {
      isBuyer: types.some((t) => t === 'buyer'),
      isSeller: types.some((t) => t === 'seller'),
      isRenter: types.some((t) => t === 'renter' || t === 'rental' || t === 'lease')
    };
  }

  function applyRoleUI() {
    const messagesTabBtn = document.getElementById('tab-btn-messages');
    const tasksTabBtn = document.getElementById('tab-btn-tasks');
    const messagesCard = document.getElementById('dashboard-messages-card');
    const tasksCard = document.getElementById('dashboard-tasks-card');
    if (messagesTabBtn) messagesTabBtn.hidden = false;
    if (tasksTabBtn) tasksTabBtn.hidden = false;
    if (messagesCard) messagesCard.hidden = false;
    if (tasksCard) tasksCard.hidden = false;
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
    if (!isAdminPreview && currentProfile.role !== 'client' && !['renter', 'buyer', 'seller'].includes(currentProfile.role)) return window.location.replace(currentProfile.role === 'admin' ? 'admin.html' : 'login.html');
    if (!isAdminPreview && currentProfile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      return window.location.replace('login.html?inactive=1');
    }
    revealPage();
    activeUserId = isAdminPreview ? previewClientId : session.user.id;
    let displayProfile = currentProfile;
    if (isAdminPreview) {
      const { data: previewProfile } = await supabaseClient.from('profiles').select('id, email, full_name, role, status').eq('id', previewClientId).single();
      if (!previewProfile || (previewProfile.role !== 'client' && !['renter', 'buyer', 'seller'].includes(previewProfile.role))) return window.location.replace('admin.html?tab=users');
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
      loadMaintenance(activeUserId),
      loadMessages(activeUserId),
      loadTasks(activeUserId)
    ]);
    applyRoleUI();
    ['documents-active-tbody', 'documents-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const id = button.getAttribute('data-id');
        const action = button.getAttribute('data-action');
        if (action === 'open-file') openDocument(id);
        if (action === 'download-file') downloadDocument(id);
        if (action === 'sign-file') openSignatureLink(id);
      });
    });
    ['maintenance-active-tbody', 'maintenance-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const id = button.getAttribute('data-id');
        if (action === 'open-maint-file') openMaintenanceFile(id);
        if (action === 'download-maint-file') downloadMaintenanceFile(id);
      });
    });
    document.getElementById('client-upload-form')?.addEventListener('submit', function (event) { handleUpload(event, activeUserId); });
    document.getElementById('maintenance-form')?.addEventListener('submit', function (event) { handleMaintenanceSubmit(event, activeUserId); });
    document.getElementById('inquiry-form')?.addEventListener('submit', function (event) { handleInquirySubmit(event, activeUserId); });
  });
})();
