/* ==========================================================================
   Client Portal — Renter Dashboard
   Redesigned to match mockup: card grid, detail views, photos, docs, tasks.
   ========================================================================== */
(function () {
  'use strict';

  /* ── Storage buckets ── */
  const BUCKETS = window.STORAGE_BUCKETS || {
    PROPERTY_IMAGES: 'property-images',
    CLIENT_DOCUMENTS: 'client-documents',
    MAINTENANCE_FILES: 'maintenance-files',
    ACCOUNT_FILES: 'account-files',
    LEGACY_PROPERTY_DOCUMENTS: 'property-documents'
  };
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_TITLE_LENGTH = 100;

  /* ── State ── */
  let activeUserId = null;
  let previewMode = false;
  let currentProfile = null;

  let primaryAccount = null;     // first / best-matching account
  let allAccounts = [];
  let allProperties = [];
  let allPropertyPhotoDocs = [];
  let allDocuments = [];
  let allMaintenanceRequests = [];
  let allMaintenanceFiles = [];
  let allTasks = [];
  let accountMembers = [];       // co-members from get_account_members()

  /* ── Utility helpers ── */
  function revealPage() {
    document.getElementById('auth-guard-style')?.remove();
    document.body.style.visibility = 'visible';
  }

  function getPreviewClientId() {
    return new URLSearchParams(window.location.search).get('view_as_client');
  }

  function setStatus(el, type, msg) {
    if (!el) return;
    el.className = type ? 'form-status ' + type : 'form-status';
    el.textContent = msg || '';
  }

  function buildStoragePath(bucket, opts) {
    // Use crypto.randomUUID() when available; fall back to a time-based prefix
    // (not security-sensitive — only used for path uniqueness in storage).
    const uid = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      ? crypto.randomUUID()
      : Date.now().toString(36) + '-' + performance.now().toString(36).replace('.', '');
    const safe = sanitizeFilename(opts.fileName || 'upload');
    if (bucket === BUCKETS.MAINTENANCE_FILES) {
      return 'clients/' + (opts.clientId || 'unknown') + '/maintenance/' + (opts.requestId || 'pending') + '/' + uid + '-' + safe;
    }
    return 'clients/' + (opts.clientId || 'unknown') + '/documents/' + (opts.accountId || 'general') + '/' + uid + '-' + safe;
  }

  function formatDate(val) {
    if (!val) return 'N/A';
    const d = new Date(val);
    return isNaN(d) ? escapeHtml(val) : escapeHtml(d.toLocaleDateString());
  }

  function deriveTitleFromText(text) {
    if (!text) return '';
    const trimmed = text.trim();
    return trimmed.length > MAX_TITLE_LENGTH ? trimmed.slice(0, MAX_TITLE_LENGTH - 1) + '…' : trimmed;
  }

  function fileIconHtml(fileName) {
    const ext = (fileName || '').toLowerCase().split('.').pop();
    const map = { pdf: '🔴', doc: '🔵', docx: '🔵', xls: '🟢', xlsx: '🟢', jpg: '🟡', jpeg: '🟡', png: '🟡', webp: '🟡' };
    return map[ext] || '⚫';
  }

  function priorityLabel(p) {
    const map = { Low: 'low', Medium: 'medium', High: 'high', Urgent: 'urgent', Emergency: 'urgent' };
    return map[p] || 'medium';
  }

  /* ── Detail panel helpers ── */
  function showPanel(id) {
    document.getElementById('renter-main-dashboard').hidden = true;
    ['person-detail-panel', 'property-detail-panel', 'action-item-detail-panel'].forEach(function (pid) {
      const el = document.getElementById(pid);
      if (el) el.hidden = (pid !== id);
    });
  }

  function hideAllPanels() {
    document.getElementById('renter-main-dashboard').hidden = false;
    ['person-detail-panel', 'property-detail-panel', 'action-item-detail-panel'].forEach(function (pid) {
      const el = document.getElementById(pid);
      if (el) el.hidden = true;
    });
  }

  /* ── Person detail view ── */
  function showPersonDetail(member) {
    document.getElementById('person-detail-heading').textContent = member.full_name || member.email || 'Person';
    document.getElementById('person-full-name').textContent = member.full_name || '—';
    document.getElementById('person-email').textContent = member.email || '—';
    document.getElementById('person-phone').textContent = member.phone || '—';
    const roleLabels = { owner: 'Owner', renter: 'Renter', buyer: 'Buyer', seller: 'Seller', client: 'Client', admin: 'Admin' };
    document.getElementById('person-account-type').textContent = roleLabels[member.role] || (member.role || '—');
    document.getElementById('person-account-status').textContent = member.status ? (member.status.charAt(0).toUpperCase() + member.status.slice(1)) : 'Active';
    showPanel('person-detail-panel');
  }

  /* ── Property detail view ── */
  function showPropertyDetail(property) {
    const addr = property.property_address || 'Property';
    document.getElementById('property-detail-heading').textContent = addr;
    document.getElementById('prop-type').textContent = property.property_type || '—';
    document.getElementById('prop-sqft').textContent = property.square_footage ? property.square_footage.toLocaleString() : '—';
    document.getElementById('prop-beds').textContent = property.bedrooms != null ? property.bedrooms : '—';
    document.getElementById('prop-baths').textContent = property.bathrooms != null ? property.bathrooms : '—';
    document.getElementById('prop-parking').textContent = property.parking || '—';
    document.getElementById('prop-notes').value = property.notes || '';
    showPanel('property-detail-panel');
  }

  /* ── Action item detail view ── */
  function showActionItemDetail(task) {
    document.getElementById('action-item-detail-heading').textContent = task.title || 'Task';
    const body = document.getElementById('action-item-detail-body');

    let sigSection = '';
    if (task.task_type === 'Signature Request' || (task.description || '').toLowerCase().includes('signature')) {
      sigSection = '<div class="action-item-sig-section">' +
        '<p class="renter-sub-label" style="margin-top:1rem">Signature / Document Actions:</p>' +
        '<p class="renter-detail-note">To sign this document, use the link provided by your agent via DocuSign, Adobe Acrobat Sign, Dropbox Sign, or submit a manually signed copy below. This portal does not create legally binding e-signatures.</p>' +
        '<div class="action-item-sig-actions">' +
        (task.signature_url ? '<a href="' + escapeHtml(task.signature_url) + '" target="_blank" rel="noopener noreferrer" class="btn-primary action-item-sig-link">Open Signature Link</a>' : '') +
        '</div>' +
        '<div class="renter-form-group" style="margin-top:1rem">' +
        '<label for="action-item-signed-upload">Upload Signed Document</label>' +
        '<input id="action-item-signed-upload" type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp">' +
        '</div>' +
        '<div class="renter-form-actions">' +
        '<button id="action-item-save-signed" class="btn-primary" data-task-id="' + escapeHtml(task.id) + '" type="button">Save Signed Document</button>' +
        '</div>' +
        '<div id="action-item-upload-status" class="form-status" aria-live="polite"></div>' +
        '</div>';
    }

    body.innerHTML =
      '<div class="renter-detail-row"><span class="renter-detail-key">Priority:</span>' +
        '<span class="renter-detail-val priority-badge priority-' + escapeHtml(priorityLabel(task.priority)) + '">' + escapeHtml(task.priority || 'Medium') + '</span></div>' +
      '<div class="renter-detail-row" style="margin-top:0.75rem"><span class="renter-detail-key">Admin Message:</span>' +
        '<span class="renter-detail-val">' + escapeHtml(task.user_visible_notes || 'No additional notes from your agent.') + '</span></div>' +
      sigSection;

    // Wire up save signed doc button
    const saveBtn = body.querySelector('#action-item-save-signed');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        handleSaveSignedDocument(task.id, body.querySelector('#action-item-signed-upload'), body.querySelector('#action-item-upload-status'));
      });
    }

    showPanel('action-item-detail-panel');
  }

  /* ── Save signed document for a task ── */
  async function handleSaveSignedDocument(taskId, fileInput, statusEl) {
    if (previewMode) return;
    const file = fileInput && fileInput.files && fileInput.files[0];
    if (!file) { setStatus(statusEl, 'error-message', 'Select a file to upload.'); return; }
    const err = getSupabaseFileValidationError(file, { maxSizeBytes: MAX_FILE_BYTES, maxSizeMb: 10 });
    if (err) { setStatus(statusEl, 'error-message', err); return; }
    setStatus(statusEl, '', 'Uploading…');
    const path = buildStoragePath(BUCKETS.ACCOUNT_FILES, { clientId: activeUserId, accountId: primaryAccount?.id, fileName: file.name });
    const { error: storErr } = await supabaseClient.storage.from(BUCKETS.ACCOUNT_FILES).upload(path, file);
    if (storErr) { setStatus(statusEl, 'error-message', 'Upload failed: ' + storErr.message); return; }
    const { error: dbErr } = await supabaseClient.from('documents').insert([{
      client_id: activeUserId,
      uploaded_by: activeUserId,
      account_id: primaryAccount?.id || null,
      property_id: primaryAccount?.property_id || null,
      file_name: file.name,
      file_path: path,
      bucket_name: BUCKETS.ACCOUNT_FILES,
      file_type: file.type,
      file_size: file.size,
      category: 'Signed Document',
      can_client_view: true,
      can_client_edit: true,
      hidden: false,
      signature_status: 'uploaded',
      updated_at: new Date().toISOString()
    }]);
    if (dbErr) { setStatus(statusEl, 'error-message', 'Could not save record: ' + dbErr.message); return; }
    // Mark task complete if it was a signature request
    const { error: taskErr } = await supabaseClient
      .from('tasks')
      .update({ status: 'Completed', updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
      .eq('id', taskId);
    if (taskErr) console.warn('Could not auto-complete task:', taskErr.message);
    setStatus(statusEl, 'success-message', 'Signed document saved successfully!');
    await loadTasks(activeUserId);
  }

  /* ── Load accounts ── */
  async function loadAccounts(userId) {
    const { data, error } = await supabaseClient
      .from('accounts')
      .select('*, account_clients!inner(client_id)')
      .eq('account_clients.client_id', userId)
      .order('updated_at', { ascending: false });
    if (error) { console.error('loadAccounts error:', error); allAccounts = []; return; }
    allAccounts = data || [];
    primaryAccount = allAccounts[0] || null;

    // Populate maintenance property/account selects
    const propSel = document.getElementById('maintenance-property');
    if (propSel && allProperties.length) {
      propSel.innerHTML = '<option value="">Select property…</option>' +
        allProperties.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.property_address) + '</option>'; }).join('');
    }

    // Load co-members for primary account
    accountMembers = [];
    if (primaryAccount) {
      const { data: members, error: rpcErr } = await supabaseClient.rpc('get_account_members', { p_account_id: primaryAccount.id });
      if (rpcErr) console.warn('get_account_members failed:', rpcErr.message);
      accountMembers = members || [];
    }

    renderAccountCard();
    checkMaintenanceState();
  }

  /* ── Load properties ── */
  async function loadProperties(userId) {
    const { data, error } = await supabaseClient
      .from('properties')
      .select('*')
      .order('updated_at', { ascending: false });
    if (error) { console.error('loadProperties error:', error); allProperties = []; }
    allProperties = data || [];

    if (allProperties.length) {
      const { data: photoDocs } = await supabaseClient
        .from('documents')
        .select('id, property_id, file_path, bucket_name, file_name')
        .in('property_id', allProperties.map(function (p) { return p.id; }))
        .eq('category', 'Property Photo')
        .eq('can_client_view', true)
        .eq('hidden', false);
      allPropertyPhotoDocs = photoDocs || [];
    } else {
      allPropertyPhotoDocs = [];
    }

    renderPhotosGrid();
  }

  /* ── Load documents ── */
  async function loadDocuments(userId) {
    const { data, error } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('client_id', userId)
      .eq('can_client_view', true)
      .eq('hidden', false)
      .order('created_at', { ascending: false });
    if (error) { console.error('loadDocuments error:', error); allDocuments = []; }
    allDocuments = data || [];
    renderDocumentsList();
  }

  /* ── Load maintenance requests ── */
  async function loadMaintenance(userId) {
    const [reqRes, fileRes] = await Promise.all([
      supabaseClient.from('maintenance_requests').select('*').eq('client_id', userId).order('created_at', { ascending: false }),
      supabaseClient.from('maintenance_files').select('*').eq('client_id', userId).order('created_at', { ascending: false })
    ]);
    allMaintenanceRequests = reqRes.data || [];
    allMaintenanceFiles = fileRes.data || [];
    checkMaintenanceState();
  }

  /* ── Load tasks (action items) ── */
  async function loadTasks(userId) {
    const { data, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) { console.error('loadTasks error:', error); allTasks = []; }
    allTasks = data || [];
    renderActionItems();
  }

  /* ── RENDER: Account card ── */
  function renderAccountCard() {
    const loadingEl = document.getElementById('renter-account-loading');
    const contentEl = document.getElementById('renter-account-content');
    const emptyEl   = document.getElementById('renter-account-empty');
    if (!primaryAccount) {
      if (loadingEl) loadingEl.hidden = true;
      if (contentEl) contentEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (loadingEl) loadingEl.hidden = true;
    if (emptyEl) emptyEl.hidden = true;
    if (contentEl) contentEl.hidden = false;

    // Classify members by role
    const owners  = accountMembers.filter(function (m) { return ['owner', 'admin'].includes(m.role); });
    const tenants = accountMembers.filter(function (m) { return !['owner', 'admin'].includes(m.role); });

    function renderNames(people, containerId) {
      const el = document.getElementById(containerId);
      if (!el) return;
      if (!people.length) { el.textContent = '—'; return; }
      el.innerHTML = people.map(function (p) {
        return '<button class="renter-person-link" data-container="' + containerId + '" type="button">' +
          escapeHtml(p.full_name || p.email || 'Person') + '</button>';
      }).join(', ');
    }

    // Store members in data attributes for click resolution
    const ownerEl  = document.getElementById('renter-owners-list');
    const tenantEl = document.getElementById('renter-tenants-list');
    renderNames(owners, 'renter-owners-list');
    renderNames(tenants, 'renter-tenants-list');

    // Store classified arrays for click handler lookup
    if (ownerEl)  ownerEl.dataset.members  = JSON.stringify(owners);
    if (tenantEl) tenantEl.dataset.members = JSON.stringify(tenants);

    // Property link
    const propEl = document.getElementById('renter-property-link');
    if (propEl) {
      const property = allProperties.find(function (p) { return p.id === primaryAccount.property_id; });
      if (property) {
        propEl.innerHTML = '<button class="renter-person-link" data-property-id="' + escapeHtml(property.id) + '" type="button">' +
          escapeHtml(property.property_address) + '</button>';
      } else {
        propEl.textContent = '—';
      }
    }
  }

  /* ── RENDER: Maintenance card state ── */
  function checkMaintenanceState() {
    const formView      = document.getElementById('maintenance-form-view');
    const submittedView = document.getElementById('maintenance-submitted-view');
    if (!formView || !submittedView) return;

    const activeRequests = allMaintenanceRequests.filter(function (r) { return r.status !== 'Completed'; });

    if (!activeRequests.length) {
      // No active request — show form
      formView.hidden = false;
      submittedView.hidden = true;

      // Populate property select
      const propSel = document.getElementById('maintenance-property');
      if (propSel && allProperties.length) {
        propSel.innerHTML = '<option value="">Select property…</option>' +
          allProperties.map(function (p) { return '<option value="' + escapeHtml(p.id) + '">' + escapeHtml(p.property_address) + '</option>'; }).join('');
        // Pre-select primary account's property
        if (primaryAccount && primaryAccount.property_id) propSel.value = primaryAccount.property_id;
      }
      return;
    }

    // Has requests — show submitted state
    formView.hidden = true;
    submittedView.hidden = false;

    const statusList = document.getElementById('maintenance-status-list');
    if (!statusList) return;
    statusList.innerHTML = activeRequests.map(function (r) {
      const files = allMaintenanceFiles.filter(function (f) { return f.maintenance_request_id === r.id; });
      const filesHtml = files.length
        ? '<div class="maintenance-status-files">' + files.map(function (f) {
            return '<button class="renter-file-btn" data-maint-file-id="' + escapeHtml(f.id) + '" type="button">' + escapeHtml(f.file_name) + '</button>';
          }).join('') + '</div>'
        : '';
      return '<div class="maintenance-status-item">' +
        '<div class="maintenance-status-row">' +
          '<span class="renter-detail-key">Status:</span>' +
          '<span class="status-pill ' + getStatusClass(r.status) + '">' + escapeHtml(r.status) + '</span>' +
        '</div>' +
        (r.title ? '<div class="maintenance-status-row"><span class="renter-detail-key">Request:</span><span>' + escapeHtml(r.title) + '</span></div>' : '') +
        (r.admin_comments ? '<div class="maintenance-status-row"><span class="renter-detail-key">Admin Comments:</span><span>' + escapeHtml(r.admin_comments) + '</span></div>' : '') +
        filesHtml +
        '</div>';
    }).join('');
  }

  function getStatusClass(status) {
    const s = (status || '').toLowerCase();
    if (s.includes('not reviewed')) return 'review';
    if (s.includes('progress') || s.includes('pending')) return 'progress';
    if (s.includes('completed') || s.includes('signed')) return 'success';
    return 'active';
  }

  /* ── RENDER: Action items ── */
  function renderActionItems() {
    const activeTasks    = allTasks.filter(function (t) { return !['Completed', 'Archived'].includes(t.status); });
    const completedTasks = allTasks.filter(function (t) { return ['Completed', 'Archived'].includes(t.status); });

    const activeMsg    = activeTasks.map(function (t) { return t.user_visible_notes; }).filter(Boolean);
    const completedMsg = completedTasks.map(function (t) { return t.user_visible_notes; }).filter(Boolean);

    function buildTaskHtml(tasks) {
      if (!tasks.length) return '<p class="renter-empty-msg">No items.</p>';
      return tasks.map(function (t) {
        return '<div class="renter-task-item">' +
          '<button class="renter-task-title-btn" data-task-id="' + escapeHtml(t.id) + '" type="button">' +
            escapeHtml(t.title || 'Task') +
          '</button>' +
          (activeTasks.includes(t)
            ? '<button class="renter-complete-btn" data-task-id="' + escapeHtml(t.id) + '" type="button">Complete</button>'
            : '') +
        '</div>';
      }).join('');
    }

    const activeListEl    = document.getElementById('active-tasks-list');
    const completedListEl = document.getElementById('completed-tasks-list');
    const activeMsgEl     = document.getElementById('active-admin-msg');
    const completedMsgEl  = document.getElementById('completed-admin-msg');

    if (activeListEl) activeListEl.innerHTML = buildTaskHtml(activeTasks);
    if (completedListEl) completedListEl.innerHTML = buildTaskHtml(completedTasks);
    if (activeMsgEl) activeMsgEl.textContent = activeMsg.length ? activeMsg.join(' | ') : 'No admin messages.';
    if (completedMsgEl) completedMsgEl.textContent = completedMsg.length ? completedMsg.join(' | ') : 'No completed admin messages.';
  }

  /* ── Complete a task ── */
  async function completeTask(taskId) {
    if (previewMode) return;
    const { error } = await supabaseClient
      .from('tasks')
      .update({ status: 'Completed', updated_at: new Date().toISOString(), completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .eq('user_id', activeUserId);
    if (error) {
      window.alert('Could not complete task: ' + error.message);
      return;
    }
    await loadTasks(activeUserId);
  }

  /* ── RENDER: Photos grid ── */
  async function renderPhotosGrid() {
    const grid    = document.getElementById('photos-grid');
    const empty   = document.getElementById('photos-empty');
    const loading = document.getElementById('photos-loading');
    if (!grid) return;

    // Determine which property photos to show: properties linked to user's accounts
    const accountPropertyIds = allAccounts.map(function (a) { return a.property_id; }).filter(Boolean);
    const visiblePhotoDocs = allPropertyPhotoDocs.filter(function (d) {
      return accountPropertyIds.includes(d.property_id) && d.file_path;
    });

    if (loading) loading.hidden = true;

    if (!visiblePhotoDocs.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    // Get signed/public URLs
    const urls = await Promise.all(visiblePhotoDocs.map(function (doc) {
      const bucket = doc.bucket_name || BUCKETS.PROPERTY_IMAGES;
      return getSupabaseStorageUrl(bucket, doc.file_path, { expiresIn: 3600 })
        .then(function (url) { return { url: url, doc: doc }; })
        .catch(function () { return null; });
    }));
    const valid = urls.filter(Boolean);

    grid.innerHTML = valid.map(function (item) {
      return '<div class="renter-photo-thumb">' +
        '<img src="' + escapeHtml(item.url) + '" alt="' + escapeHtml(item.doc.file_name || 'Property photo') + '" ' +
          'data-photo-url="' + escapeHtml(item.url) + '" ' +
          'loading="lazy" class="renter-photo-img">' +
        '<p class="renter-photo-caption">' + escapeHtml((item.doc.file_name || 'Photo').replace(/\.[^.]+$/, '')) + '</p>' +
      '</div>';
    }).join('');
  }

  /* ── RENDER: Documents list ── */
  function renderDocumentsList() {
    const list    = document.getElementById('documents-scroll-list');
    const empty   = document.getElementById('documents-empty');
    const loading = document.getElementById('documents-loading');
    if (!list) return;

    if (loading) loading.hidden = true;

    // Exclude property photos from document list
    const docs = allDocuments.filter(function (d) { return d.category !== 'Property Photo'; });
    if (!docs.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    list.innerHTML = docs.map(function (doc) {
      const sigBadge = (function () {
        const s = doc.signature_status || (doc.signed ? 'signed' : (doc.requires_signature ? 'pending_signature' : 'available'));
        if (s === 'signed') return '<span class="badge-doc-signed">Signed</span>';
        if (s === 'pending_signature' || s === 'uploaded') return '<span class="badge-doc-required">Pending</span>';
        return '';
      }());
      return '<div class="renter-doc-item">' +
        '<span class="renter-doc-icon" aria-hidden="true">' + fileIconHtml(doc.file_name) + '</span>' +
        '<button class="renter-doc-name" data-action="open-doc" data-doc-id="' + escapeHtml(doc.id) + '" type="button">' +
          escapeHtml(doc.file_name) + '</button>' +
        sigBadge +
        '<span class="renter-doc-date">' + formatDate(doc.created_at) + '</span>' +
        '<span class="renter-doc-actions">' +
          '<button class="action-link" data-action="open-doc" data-doc-id="' + escapeHtml(doc.id) + '" type="button">Open</button>' +
          '<button class="action-link" data-action="download-doc" data-doc-id="' + escapeHtml(doc.id) + '" type="button">Download</button>' +
          (doc.signature_url ? '<button class="action-link badge-doc-required-btn" data-action="sign-doc" data-doc-id="' + escapeHtml(doc.id) + '" type="button">Sign</button>' : '') +
        '</span>' +
      '</div>';
    }).join('');
  }

  /* ── Open / download document ── */
  async function openDocument(docId) {
    const doc = allDocuments.find(function (d) { return d.id === docId; });
    if (!doc || !doc.bucket_name || !doc.file_path) { window.alert('File location is unavailable.'); return; }
    try {
      const url = await getSupabaseStorageUrl(doc.bucket_name, doc.file_path, { expiresIn: 3600 });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { window.alert('Unable to open file: ' + e.message); }
  }

  async function downloadDocument(docId) {
    const doc = allDocuments.find(function (d) { return d.id === docId; });
    if (!doc || !doc.bucket_name || !doc.file_path) { window.alert('File location is unavailable.'); return; }
    try {
      const url = await getSupabaseStorageUrl(doc.bucket_name, doc.file_path, { expiresIn: 3600 });
      if (!url) return;
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = doc.file_name || 'download';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e) { window.alert('Unable to download file: ' + e.message); }
  }

  function openSignatureLink(docId) {
    const doc = allDocuments.find(function (d) { return d.id === docId; });
    if (doc && doc.signature_url) window.open(doc.signature_url, '_blank', 'noopener,noreferrer');
  }

  /* ── Open maintenance file ── */
  async function openMaintenanceFile(fileId) {
    const file = allMaintenanceFiles.find(function (f) { return f.id === fileId; });
    if (!file) return;
    try {
      const url = await getSupabaseStorageUrl(file.bucket_name || BUCKETS.MAINTENANCE_FILES, file.file_path, { expiresIn: 3600 });
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) { window.alert('Unable to open file: ' + e.message); }
  }

  /* ── Submit maintenance request ── */
  async function handleMaintenanceSubmit(event) {
    event.preventDefault();
    if (previewMode) return;
    const propertyId   = document.getElementById('maintenance-property')?.value || null;
    const priority     = document.getElementById('maintenance-priority')?.value || 'Medium';
    const description  = document.getElementById('maintenance-description')?.value.trim() || '';
    const filesInput   = document.getElementById('maintenance-files');
    const statusEl     = document.getElementById('maintenance-form-status');
    const submitBtn    = document.getElementById('maintenance-submit-btn');

    if (!description || !propertyId) {
      setStatus(statusEl, 'error-message', 'Please select a property and describe the issue.');
      return;
    }
    if (description.length > MAX_TITLE_LENGTH) {
      setStatus(statusEl, 'error-message', 'Description is too long. Please keep it under ' + MAX_TITLE_LENGTH + ' characters.');
      return;
    }
    const uploads = Array.from(filesInput ? filesInput.files : []);
    for (const file of uploads) {
      const err = getSupabaseFileValidationError(file, { maxSizeBytes: MAX_FILE_BYTES, maxSizeMb: 10 });
      if (err) { setStatus(statusEl, 'error-message', '"' + file.name + '": ' + err); return; }
    }

    submitBtn.disabled = true;
    setStatus(statusEl, '', 'Submitting…');

    const accountId = primaryAccount?.id || null;
    const { data: request, error } = await supabaseClient
      .from('maintenance_requests')
      .insert([{
        client_id: activeUserId,
        property_id: propertyId,
        account_id: accountId,
        title: deriveTitleFromText(description),
        description,
        priority,
        status: 'Not Reviewed Yet',
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      setStatus(statusEl, 'error-message', 'Unable to submit: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message));
      submitBtn.disabled = false;
      return;
    }

    // Upload attached files
    for (let i = 0; i < uploads.length; i++) {
      const file = uploads[i];
      setStatus(statusEl, '', 'Uploading file ' + (i + 1) + ' of ' + uploads.length + ': ' + file.name);
      const path = buildStoragePath(BUCKETS.MAINTENANCE_FILES, { clientId: activeUserId, requestId: request.id, fileName: file.name });
      const { error: storErr } = await supabaseClient.storage.from(BUCKETS.MAINTENANCE_FILES).upload(path, file);
      if (storErr) { setStatus(statusEl, 'error-message', 'File upload failed: ' + storErr.message); submitBtn.disabled = false; return; }
      await supabaseClient.from('maintenance_files').insert([{
        maintenance_request_id: request.id,
        client_id: activeUserId,
        property_id: propertyId,
        account_id: accountId,
        bucket_name: BUCKETS.MAINTENANCE_FILES,
        file_path: path,
        file_name: file.name,
        file_type: file.type,
        file_size: file.size,
        category: file.type.startsWith('image/') ? 'Photo' : 'Other',
        uploaded_by: activeUserId
      }]);
    }

    // Create admin task for this request
    await supabaseClient.from('tasks').insert([{
      user_id: activeUserId,
      account_id: accountId,
      property_id: propertyId,
      task_type: 'Maintenance Request',
      title: deriveTitleFromText(description),
      description,
      status: 'Not Reviewed',
      priority,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }]);

    notifySubmission({
      submission_type: 'Maintenance Request',
      name: document.getElementById('client-name')?.textContent || 'Portal Client',
      email: document.getElementById('client-email')?.textContent || '',
      phone: '',
      property_of_interest: (allProperties.find(function (p) { return p.id === propertyId; }) || {}).property_address || null,
      details: description,
      submitted_at: new Date().toISOString()
    });

    submitBtn.disabled = false;
    event.target.reset();
    await loadMaintenance(activeUserId);
    await loadTasks(activeUserId);
  }

  /* ── Dashboard-wide delegated click handler ── */
  function initDelegatedClicks() {
    document.body.addEventListener('click', function (e) {
      const target = e.target;

      // Back buttons
      if (target.closest('.renter-back-btn')) {
        hideAllPanels();
        return;
      }

      // Person name link
      const personBtn = target.closest('.renter-person-link[data-container]');
      if (personBtn) {
        const container = document.getElementById(personBtn.dataset.container);
        if (container && container.dataset.members) {
          const members = JSON.parse(container.dataset.members);
          const btn = personBtn;
          // Find the member by matching all buttons in the container
          const allBtns = Array.from(container.querySelectorAll('.renter-person-link[data-container]'));
          const idx = allBtns.indexOf(btn);
          const member = members[idx];
          if (member) showPersonDetail(member);
        }
        return;
      }

      // Property link
      const propBtn = target.closest('.renter-person-link[data-property-id]');
      if (propBtn) {
        const property = allProperties.find(function (p) { return p.id === propBtn.dataset.propertyId; });
        if (property) showPropertyDetail(property);
        return;
      }

      // Task title (open detail)
      const taskTitleBtn = target.closest('.renter-task-title-btn[data-task-id]');
      if (taskTitleBtn) {
        const task = allTasks.find(function (t) { return t.id === taskTitleBtn.dataset.taskId; });
        if (task) showActionItemDetail(task);
        return;
      }

      // Complete task button
      const completeBtn = target.closest('.renter-complete-btn[data-task-id]');
      if (completeBtn) {
        completeTask(completeBtn.dataset.taskId);
        return;
      }

      // Document actions
      const docActionBtn = target.closest('[data-action][data-doc-id]');
      if (docActionBtn) {
        const id = docActionBtn.dataset.docId;
        const action = docActionBtn.dataset.action;
        if (action === 'open-doc') openDocument(id);
        if (action === 'download-doc') downloadDocument(id);
        if (action === 'sign-doc') openSignatureLink(id);
        return;
      }

      // Maintenance file button
      const maintFileBtn = target.closest('[data-maint-file-id]');
      if (maintFileBtn) {
        openMaintenanceFile(maintFileBtn.dataset.maintFileId);
        return;
      }

      // Photo click — open in new tab
      const photoImg = target.closest('.renter-photo-img');
      if (photoImg && photoImg.dataset.photoUrl) {
        window.open(photoImg.dataset.photoUrl, '_blank', 'noopener,noreferrer');
        return;
      }

      // Action items toggle (Active / Complete view switch)
      if (target.id === 'action-active-tab') {
        document.getElementById('action-active-view').hidden = false;
        document.getElementById('action-completed-view').hidden = true;
        document.getElementById('action-active-tab').classList.add('renter-toggle-selected');
        document.getElementById('action-complete-tab').classList.remove('renter-toggle-selected');
        return;
      }
      if (target.id === 'action-complete-tab') {
        document.getElementById('action-active-view').hidden = true;
        document.getElementById('action-completed-view').hidden = false;
        document.getElementById('action-complete-tab').classList.add('renter-toggle-selected');
        document.getElementById('action-active-tab').classList.remove('renter-toggle-selected');
        return;
      }

      // "Submit New Request" button
      if (target.id === 'maintenance-new-btn') {
        document.getElementById('maintenance-submitted-view').hidden = true;
        document.getElementById('maintenance-form-view').hidden = false;
        return;
      }
    });
  }

  /* ── Apply user type label to header ── */
  function applyRoleLabel(profile) {
    const badge  = document.getElementById('client-role-badge');
    const eyebrow = document.getElementById('renter-dashboard-eyebrow');
    const roleDisplay = {
      renter: { label: 'Renter', eyebrow: 'RENTER DASHBOARD', css: 'role-renter' },
      buyer: { label: 'Buyer', eyebrow: 'BUYER DASHBOARD', css: 'role-buyer' },
      seller: { label: 'Seller', eyebrow: 'SELLER DASHBOARD', css: 'role-seller' },
      owner: { label: 'Owner', eyebrow: 'OWNER DASHBOARD', css: 'role-owner' },
      'rental owner': { label: 'Owner', eyebrow: 'OWNER DASHBOARD', css: 'role-owner' },
      'renovation client': { label: 'Client', eyebrow: 'CLIENT DASHBOARD', css: 'role-client' },
      client: { label: 'Client', eyebrow: 'CLIENT DASHBOARD', css: 'role-client' },
      admin: { label: 'Admin', eyebrow: 'CLIENT DASHBOARD', css: 'role-admin' }
    };
    const userTypeKey = String(profile?.user_type || '').toLowerCase();
    const roleKey = String(profile?.role || 'client').toLowerCase();
    const info = roleDisplay[userTypeKey] || roleDisplay[roleKey] || roleDisplay.client;
    if (badge)   { badge.textContent  = info.label; badge.className = 'role-badge ' + info.css; }
    if (eyebrow) eyebrow.textContent  = info.eyebrow;

    // Update account card title
    const cardTitle = document.querySelector('#renter-account-card .renter-card-title');
    if (cardTitle) cardTitle.textContent = info.label + ' Account:';
  }

  /* ── Preview mode banner ── */
  function applyPreviewMode(clientProfile) {
    previewMode = true;
    const hero = document.querySelector('.renter-hero-card');
    if (hero) {
      const banner = document.createElement('div');
      banner.className = 'preview-banner';
      banner.innerHTML = '<strong>Preview Mode:</strong> Viewing portal as ' +
        escapeHtml(clientProfile.full_name || clientProfile.email) +
        '. <a href="admin.html?tab=users">Return to Admin</a>';
      hero.appendChild(banner);
    }
  }

  /* ── DOMContentLoaded ── */
  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      return window.location.replace('login.html');
    }

    const session = await getSession();
    if (!session) return window.location.replace('login.html');

    const profile = await getCurrentUserProfile();
    if (!profile) return window.location.replace('login.html');

    const previewClientId = getPreviewClientId();
    const isAdminPreview  = profile.role === 'admin' && previewClientId;
    const allowedRoles    = ['client', 'renter', 'buyer', 'seller', 'owner'];

    if (!isAdminPreview && !allowedRoles.includes(profile.role)) {
      return window.location.replace(profile.role === 'admin' ? 'admin.html' : 'login.html');
    }
    if (!isAdminPreview && profile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      return window.location.replace('login.html?inactive=1');
    }

    revealPage();
    activeUserId = isAdminPreview ? previewClientId : session.user.id;

    let displayProfile = profile;
    if (isAdminPreview) {
      const { data: p } = await supabaseClient.from('profiles').select('id, email, full_name, role, status, user_type').eq('id', previewClientId).single();
      if (!p || (!allowedRoles.includes(p.role) && p.role !== 'client')) return window.location.replace('admin.html?tab=users');
      displayProfile = p;
      applyPreviewMode(displayProfile);
    }

    currentProfile = displayProfile;

    // Populate header
    const nameEl  = document.getElementById('client-name');
    const emailEl = document.getElementById('client-email');
    if (nameEl)  nameEl.textContent  = displayProfile.full_name || displayProfile.email || 'Client';
    if (emailEl) emailEl.textContent = displayProfile.email || '';
    applyRoleLabel(displayProfile);

    // Logout
    document.getElementById('client-logout')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    // Maintenance form
    document.getElementById('maintenance-form')?.addEventListener('submit', handleMaintenanceSubmit);

    // Delegated clicks (persons, properties, tasks, docs, photos, toggles)
    initDelegatedClicks();

    // Load all data in parallel
    await Promise.all([
      loadProperties(activeUserId),
      loadAccounts(activeUserId),
      loadDocuments(activeUserId),
      loadMaintenance(activeUserId),
      loadTasks(activeUserId)
    ]);
  });
})();
