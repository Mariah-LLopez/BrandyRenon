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
  const USER_ROLES = ['admin', 'client'];
  const USER_STATUSES = ['active', 'inactive'];
  const LEAD_STATUSES = ['Not Reviewed Yet', 'In Progress', 'Completed'];
  const ACCOUNT_STATUSES = ['Not Reviewed Yet', 'In Progress', 'Active', 'Pending Signature', 'Completed', 'Archived'];
  const ACCOUNT_TYPES = ['Buyer', 'Seller', 'Rental', 'Lease', 'Property Management', 'Renovation', 'Other'];
  const MAINTENANCE_STATUSES = ['Not Reviewed Yet', 'In Progress', 'Completed'];
  const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'];
  const SIGNATURE_STATUS_LABELS = {
    available: 'Available',
    pending_signature: 'Pending Signature',
    signed: 'Signed',
    uploaded: 'Uploaded'
  };
  const LEAD_SECTIONS = {
    contact: {
      table: 'contact_requests',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      columns: ['name', 'email', 'phone', 'inquiry_type', 'property_interest', 'message', 'created_at', 'status', 'notes', 'actions']
    },
    showing: {
      table: 'showing_requests',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      columns: ['name', 'email', 'phone', 'request_type', 'property_address', 'preferred_date', 'preferred_time', 'message', 'created_at', 'status', 'notes', 'actions']
    },
    renovation: {
      table: 'renovation_clients',
      statusField: 'status',
      notesField: 'admin_notes',
      columns: ['full_name', 'email', 'phone', 'property_address', 'service_needed', 'project_type', 'project_description', 'created_at', 'status', 'notes', 'actions']
    }
  };

  let adminUserId = null;
  let allUsers = [];
  let allProperties = [];
  let allAccounts = [];
  let allAccountAssignments = [];
  let allPropertyAssignments = [];
  let allDocuments = [];
  let allMaintenanceRequests = [];
  let allMaintenanceFiles = [];
  let allLeads = { contact: [], showing: [], renovation: [] };

  function nowIso() {
    return new Date().toISOString();
  }

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  function normalizeLeadStatus(value) {
    const map = {
      not_viewed: 'Not Reviewed Yet',
      not_reviewed_yet: 'Not Reviewed Yet',
      complete: 'Completed',
      completed: 'Completed',
      in_progress: 'In Progress'
    };
    return map[String(value || '').toLowerCase()] || (LEAD_STATUSES.includes(value) ? value : 'Not Reviewed Yet');
  }

  function normalizeMaintenanceStatus(value) {
    const map = {
      new: 'Not Reviewed Yet',
      'in review': 'In Progress',
      scheduled: 'In Progress',
      'in progress': 'In Progress',
      completed: 'Completed',
      closed: 'Completed'
    };
    return map[String(value || '').toLowerCase()] || (MAINTENANCE_STATUSES.includes(value) ? value : 'Not Reviewed Yet');
  }

  function normalizeAccountStatus(value) {
    const map = {
      pending: 'In Progress',
      closed: 'Completed',
      cancelled: 'Archived'
    };
    return map[String(value || '').toLowerCase()] || (ACCOUNT_STATUSES.includes(value) ? value : 'Not Reviewed Yet');
  }

  function openModal(id) {
    const modal = document.getElementById(id + '-modal');
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id + '-modal');
    if (!modal) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setupModalClose() {
    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
      btn.addEventListener('click', function () {
        closeModal(btn.getAttribute('data-close-modal'));
      });
    });

    document.querySelectorAll('.modal').forEach((modal) => {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal(modal.id.replace('-modal', ''));
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.modal.is-open').forEach((modal) => closeModal(modal.id.replace('-modal', '')));
    });
  }

  function updateTabParams(changes) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`);
  }

  function setActiveMainTab(tabKey) {
    document.querySelectorAll('.portal-tab-bar:not(.leads-sub-tabs):not(.workflow-tab-bar) .portal-tab').forEach((button) => {
      const active = button.getAttribute('data-tab') === tabKey;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `tab-${tabKey}`;
    });
  }

  function setActiveLeadTab(tabKey) {
    const target = LEAD_SECTIONS[tabKey] ? tabKey : 'contact';
    document.querySelectorAll('.leads-sub-tabs .portal-tab').forEach((button) => {
      const active = button.getAttribute('data-lead-tab') === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.lead-tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `lead-tab-${target}`;
    });
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
    document.querySelectorAll('.portal-tab-bar .portal-tab[data-tab]').forEach((button) => {
      button.addEventListener('click', function () {
        const tabKey = button.getAttribute('data-tab');
        setActiveMainTab(tabKey);
        updateTabParams({ tab: tabKey });
      });
    });

    document.querySelectorAll('.leads-sub-tabs .portal-tab').forEach((button) => {
      button.addEventListener('click', function () {
        const leadTab = button.getAttribute('data-lead-tab');
        setActiveLeadTab(leadTab);
        updateTabParams({ tab: 'leads', leadTab: leadTab });
      });
    });

    document.querySelectorAll('.workflow-tab-bar .portal-tab').forEach((button) => {
      button.addEventListener('click', function () {
        setWorkflowTab(button.getAttribute('data-workflow-group'), button.getAttribute('data-workflow-target'));
      });
    });

    const params = new URLSearchParams(window.location.search);
    setActiveMainTab(params.get('tab') || 'users');
    setActiveLeadTab(params.get('leadTab') || 'contact');
    [['accounts', 'active'], ['maintenance', 'active'], ['lead-contact', 'active'], ['lead-showing', 'active'], ['lead-renovation', 'active']].forEach(([group, target]) => setWorkflowTab(group, target));
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

  function formatTimeString(value) {
    if (!value) return 'N/A';
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return escapeHtml(value);
    const date = new Date();
    date.setHours(Number(match[1]), Number(match[2]), 0, 0);
    return escapeHtml(date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }

  function formatInquiryType(value) {
    const labels = {
      general_question: 'General Question',
      general_inquiry: 'General Question',
      property_inquiry: 'Property Inquiry',
      showing_request: 'Showing Request',
      renovation_client_inquiry: 'Renovation Client Inquiry',
      contractor_inquiry: 'Renovation Client Inquiry',
      house_flip_inquiry: 'Renovation Client Inquiry',
      rental_help: 'Help Finding a Rental',
      buyer_agent_request: 'Request Brandy as My Agent',
      renovation_help: 'Help Renovating',
      maintenance_request: 'Maintenance / Property Manager Request',
      seller_help: 'Help Selling My House'
    };
    return labels[value] || value || 'N/A';
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

  function signatureStatusLabel(value) {
    return SIGNATURE_STATUS_LABELS[value] || SIGNATURE_STATUS_LABELS.available;
  }

  function sigBadge(doc) {
    const status = doc.signature_status || (doc.signed ? 'signed' : (doc.requires_signature ? 'pending_signature' : 'available'));
    if (status === 'signed') return `<span class="badge-doc-signed">${escapeHtml(signatureStatusLabel(status))}</span>`;
    if (status === 'pending_signature') return `<span class="badge-doc-required">${escapeHtml(signatureStatusLabel(status))}</span>`;
    if (status === 'uploaded') return `<span class="badge-doc-required">Uploaded</span>`;
    return `<span class="badge-doc-none">${escapeHtml(signatureStatusLabel(status))}</span>`;
  }

  function visibilityLabel(value) {
    return { admin_only: 'Admin Only', client_visible: 'Client View', client_downloadable: 'Client Download' }[value] || value || 'N/A';
  }

  function clientAccessLabel(doc) {
    if (!doc.can_client_view) return 'Hidden from client';
    if (doc.can_client_edit) return 'View + Edit';
    return doc.visibility === 'client_downloadable' ? 'View + Download' : 'View only';
  }

  function getPropertyById(propertyId) {
    return allProperties.find((property) => property.id === propertyId) || null;
  }

  function getAccountById(accountId) {
    return allAccounts.find((account) => account.id === accountId) || null;
  }

  function getUserById(userId) {
    return allUsers.find((user) => user.id === userId) || null;
  }

  function getAccountClientIds(accountId) {
    return allAccountAssignments.filter((assignment) => assignment.account_id === accountId).map((assignment) => assignment.client_id);
  }

  function getAccountClientLabels(accountId) {
    const labels = getAccountClientIds(accountId)
      .map((clientId) => getUserById(clientId))
      .filter(Boolean)
      .map((user) => user.full_name || user.email);
    return labels.length ? labels.join(', ') : 'Unassigned';
  }

  function getAssignedPropertyIds(userId) {
    const direct = allPropertyAssignments.filter((assignment) => assignment.client_id === userId).map((assignment) => assignment.property_id);
    const accountLinked = allAccounts.filter((account) => getAccountClientIds(account.id).includes(userId) && account.property_id).map((account) => account.property_id);
    return Array.from(new Set([...direct, ...accountLinked]));
  }

  function getPropertySummary(userId) {
    const labels = getAssignedPropertyIds(userId).map((propertyId) => getPropertyById(propertyId)?.property_address).filter(Boolean);
    if (!labels.length) return 'None assigned';
    return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  function getAccountSummary(userId) {
    const labels = allAccounts
      .filter((account) => getAccountClientIds(account.id).includes(userId))
      .map((account) => account.account_name)
      .filter(Boolean);
    if (!labels.length) return 'None assigned';
    return labels.length <= 2 ? labels.join(', ') : `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  function populateUserSelect(select, blankLabel) {
    if (!select) return;
    const current = select.value;
    const options = allUsers.filter((user) => user.role === 'client').map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.full_name || user.email)}</option>`).join('');
    select.innerHTML = `<option value="">${escapeHtml(blankLabel || 'No specific client')}</option>${options}`;
    if (current) select.value = current;
  }

  function populatePropertySelect(select) {
    if (!select) return;
    const current = select.value;
    const noneText = select.querySelector('option[value=""]')?.textContent || 'No specific property';
    select.innerHTML = `<option value="">${escapeHtml(noneText)}</option>${allProperties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.property_address)}</option>`).join('')}`;
    if (current) select.value = current;
  }

  function populateAccountSelect(select, blankLabel) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = `<option value="">${escapeHtml(blankLabel || 'No specific account')}</option>${allAccounts.map((account) => `<option value="${escapeHtml(account.id)}">${escapeHtml(account.account_name)}</option>`).join('')}`;
    if (current) select.value = current;
  }

  function applyUploadAccountDefaults(accountId) {
    const uploadProperty = document.getElementById('upload-property');
    const uploadClient = document.getElementById('upload-client');
    if (!accountId) return;
    const account = getAccountById(accountId);
    if (!account) return;
    if (uploadProperty && account.property_id) uploadProperty.value = account.property_id;
    const clientIds = getAccountClientIds(accountId);
    if (uploadClient && clientIds.length === 1) uploadClient.value = clientIds[0];
  }

  async function getStorageUrl(bucket, filePath) {
    if (!bucket || !filePath) return null;
    const { data: signedData, error: signedError } = await supabaseClient.storage.from(bucket).createSignedUrl(filePath, 300);
    if (!signedError && signedData?.signedUrl) return signedData.signedUrl;
    const { data: publicData } = await supabaseClient.storage.from(bucket).getPublicUrl(filePath);
    return publicData?.publicUrl || null;
  }

  async function getDocumentUrl(doc) {
    const bucket = doc.bucket_name || 'property-documents';
    const url = await getStorageUrl(bucket, doc.file_path);
    if (!url) throw new Error('Document URL unavailable');
    return url;
  }

  async function openDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    try {
      const url = await getDocumentUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      window.alert(`Unable to open file: ${error.message}`);
    }
  }

  async function downloadDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    try {
      const url = await getDocumentUrl(doc);
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

  function getMaintenanceFiles(requestId) {
    return allMaintenanceFiles.filter((file) => file.maintenance_request_id === requestId);
  }

  async function openMaintenanceFile(fileId, download) {
    const file = allMaintenanceFiles.find((item) => item.id === fileId);
    if (!file) return;
    try {
      const url = await getStorageUrl(file.bucket_name || 'maintenance-files', file.file_path);
      if (!download) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = file.file_name || 'maintenance-file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      window.alert(`Unable to access maintenance file: ${error.message}`);
    }
  }

  async function loadUsersData() {
    const { data, error } = await supabaseClient.rpc('get_admin_user_profiles');
    if (error) {
      const fallback = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
      if (fallback.error) return;
      allUsers = fallback.data || [];
    } else {
      allUsers = data || [];
    }
    populateUserSelect(document.getElementById('upload-client'));
    populateUserSelect(document.getElementById('account-client'), 'No client selected');
  }

  async function loadPropertiesData() {
    const { data, error } = await supabaseClient.from('properties').select('*').order('updated_at', { ascending: false });
    if (error) return;
    allProperties = data || [];
    populatePropertySelect(document.getElementById('upload-property'));
    populatePropertySelect(document.getElementById('account-property'));
  }

  async function loadAccountsData() {
    const { data, error } = await supabaseClient.from('accounts').select('*').order('updated_at', { ascending: false });
    if (error) return;
    allAccounts = (data || []).map((account) => ({ ...account, status: normalizeAccountStatus(account.status) }));
    populateAccountSelect(document.getElementById('upload-account'));
  }

  async function loadAccountAssignmentsData() {
    const { data, error } = await supabaseClient.from('account_clients').select('account_id, client_id');
    if (error) return;
    allAccountAssignments = data || [];
  }

  async function loadPropertyAssignmentsData() {
    const { data, error } = await supabaseClient.from('client_property_assignments').select('client_id, property_id');
    if (error) return;
    allPropertyAssignments = data || [];
  }

  async function loadDocumentsData() {
    const { data, error } = await supabaseClient
      .from('documents')
      .select('*, profiles!documents_client_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) return;
    allDocuments = data || [];
  }

  async function loadMaintenanceData() {
    const [requests, files] = await Promise.all([
      supabaseClient.from('maintenance_requests').select('*, profiles!maintenance_requests_client_id_fkey(full_name, email)').order('created_at', { ascending: false }),
      supabaseClient.from('maintenance_files').select('*').order('created_at', { ascending: false })
    ]);
    if (!requests.error) {
      allMaintenanceRequests = (requests.data || []).map((request) => ({ ...request, status: normalizeMaintenanceStatus(request.status) }));
    }
    if (!files.error) allMaintenanceFiles = files.data || [];
  }

  async function loadLeadData(sectionKey) {
    const config = LEAD_SECTIONS[sectionKey];
    if (!config) return;
    const { data, error } = await supabaseClient.from(config.table).select('*').order('created_at', { ascending: false });
    if (error) return;
    allLeads[sectionKey] = (data || []).map((row) => ({
      ...row,
      [config.statusField]: normalizeLeadStatus(row[config.statusField]),
      [config.notesField]: row[config.notesField] || null
    }));
  }

  async function loadAllLeadData() {
    await Promise.all(Object.keys(LEAD_SECTIONS).map(loadLeadData));
  }

  function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    const empty = document.getElementById('users-empty');
    const term = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const filtered = allUsers.filter((user) => {
      if (!term) return true;
      return [user.full_name, user.email, user.role, user.status].some((value) => String(value || '').toLowerCase().includes(term));
    });
    if (!filtered.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = filtered.map((user) => {
      const roleOptions = USER_ROLES.map((role) => `<option value="${role}"${role === user.role ? ' selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>`).join('');
      const statusOptions = USER_STATUSES.map((status) => `<option value="${status}"${status === (user.status || 'active') ? ' selected' : ''}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`).join('');
      const clientActions = user.role === 'client'
        ? `<button class="action-link" data-action="assign-properties" data-id="${escapeHtml(user.id)}" type="button">Assign Properties</button>
           <button class="action-link" data-action="assign-accounts" data-id="${escapeHtml(user.id)}" type="button">Assign Accounts</button>
           <button class="action-link" data-action="view-client" data-id="${escapeHtml(user.id)}" type="button">View as Client</button>`
        : '';
      return `<tr data-user-id="${escapeHtml(user.id)}">
        <td>${escapeHtml(user.email)}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-role>${roleOptions}</select></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-status>${statusOptions}</select></td>
        <td>${formatDateOnly(user.created_at)}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(getPropertySummary(user.id))}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(getAccountSummary(user.id))}</td>
        <td class="users-actions-cell"><div class="table-actions table-actions-stack"><button class="action-link" data-action="save-user" data-id="${escapeHtml(user.id)}" type="button">Save</button>${clientActions}</div></td>
      </tr>`;
    }).join('');
  }

  function renderProperties() {
    const tbody = document.getElementById('properties-tbody');
    const empty = document.getElementById('properties-empty');
    if (!allProperties.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = allProperties.map((property) => `<tr>
      <td class="dashboard-cell-wrap"><strong>${escapeHtml(property.property_address)}</strong>${property.notes ? `<div class="table-hint">${escapeHtml(property.notes)}</div>` : ''}</td>
      <td>${statusPill(property.property_status || 'Active')}</td>
      <td>${escapeHtml(property.visibility === 'public' ? 'Public Listing' : 'Internal Property')}</td>
      <td>${property.is_public ? 'Yes' : 'No'}</td>
      <td>${formatDateTime(property.updated_at || property.created_at)}</td>
      <td><div class="table-actions"><button class="action-link" data-action="delete-property" data-id="${escapeHtml(property.id)}" type="button">Delete</button></div></td>
    </tr>`).join('');
  }

  function renderAccounts() {
    const groups = {
      active: { tbody: document.getElementById('accounts-active-tbody'), empty: document.getElementById('accounts-active-empty'), rows: allAccounts.filter((account) => account.status !== 'Completed') },
      completed: { tbody: document.getElementById('accounts-completed-tbody'), empty: document.getElementById('accounts-completed-empty'), rows: allAccounts.filter((account) => account.status === 'Completed') }
    };
    Object.entries(groups).forEach(([groupKey, config]) => {
      if (!config.rows.length) {
        config.tbody.innerHTML = '';
        config.empty.hidden = false;
        return;
      }
      config.empty.hidden = true;
      config.tbody.innerHTML = config.rows.map((account) => `<tr>
        <td class="dashboard-cell-wrap"><strong>${escapeHtml(account.account_name)}</strong>${account.client_notes ? `<div class="table-hint">${escapeHtml(account.client_notes)}</div>` : ''}</td>
        <td>${escapeHtml(getAccountClientLabels(account.id))}</td>
        <td>${escapeHtml(getPropertyById(account.property_id)?.property_address || 'Unassigned')}</td>
        <td>${escapeHtml(account.account_type || 'Other')}</td>
        <td>${statusPill(account.status)}</td>
        <td>${formatDateTime(groupKey === 'completed' ? (account.completed_at || account.updated_at) : account.updated_at)}</td>
        <td><div class="table-actions table-actions-stack"><button class="action-link" data-action="account-upload" data-id="${escapeHtml(account.id)}" type="button">Upload File</button><button class="action-link" data-action="delete-account" data-id="${escapeHtml(account.id)}" type="button">Delete</button></div></td>
      </tr>`).join('');
    });
  }

  function renderDocuments() {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    const visibilityFilter = document.getElementById('admin-filter-visibility')?.value || '';
    const signatureFilter = document.getElementById('admin-filter-signed')?.value || '';
    let filtered = allDocuments.slice();
    if (visibilityFilter) filtered = filtered.filter((doc) => doc.visibility === visibilityFilter);
    if (signatureFilter === 'required') filtered = filtered.filter((doc) => doc.requires_signature || doc.signature_url);
    if (signatureFilter === 'signed') filtered = filtered.filter((doc) => (doc.signature_status || (doc.signed ? 'signed' : 'available')) === 'signed');
    if (signatureFilter === 'pending') filtered = filtered.filter((doc) => (doc.signature_status || (doc.requires_signature ? 'pending_signature' : 'available')) === 'pending_signature');
    if (!filtered.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    tbody.innerHTML = filtered.map((doc) => {
      const account = getAccountById(doc.account_id);
      const property = getPropertyById(doc.property_id);
      const clientInfo = doc.profiles ? (doc.profiles.full_name || doc.profiles.email) : (getUserById(doc.client_id)?.full_name || getUserById(doc.client_id)?.email || 'N/A');
      const signatureMeta = [doc.signature_provider, doc.signature_url ? 'link added' : ''].filter(Boolean).join(' · ');
      return `<tr>
        <td><button class="action-link document-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category || 'Other')}</td>
        <td>${escapeHtml(account?.account_name || 'Unassigned')}</td>
        <td>${escapeHtml(property?.property_address || 'Unassigned')}</td>
        <td>${escapeHtml(clientInfo)}</td>
        <td>${escapeHtml(clientAccessLabel(doc))}</td>
        <td>${sigBadge(doc)}${signatureMeta ? `<div class="table-hint">${escapeHtml(signatureMeta)}</div>` : ''}</td>
        <td>${formatDateTime(doc.created_at)}</td>
        <td><div class="table-actions table-actions-stack"><button class="action-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">Open</button><button class="action-link" data-action="download-doc" data-id="${escapeHtml(doc.id)}" type="button">Download</button><button class="action-link" data-action="edit-signature" data-id="${escapeHtml(doc.id)}" type="button">Edit Signature</button><button class="action-link" data-action="toggle-doc" data-id="${escapeHtml(doc.id)}" type="button">${doc.hidden ? 'Unhide' : 'Hide'}</button><button class="action-link" data-action="delete-doc" data-id="${escapeHtml(doc.id)}" type="button">Delete</button></div></td>
      </tr>`;
    }).join('');
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
          ? `<div class="file-link-grid">${files.map((file) => `<button class="action-link" data-action="open-maint-file" data-id="${escapeHtml(file.id)}" type="button">${escapeHtml(file.file_name)}</button><button class="action-link" data-action="download-maint-file" data-id="${escapeHtml(file.id)}" type="button">Download</button>`).join('')}</div>`
          : 'None';
        const priorityOptions = MAINTENANCE_PRIORITIES.map((priority) => `<option value="${priority}"${priority === (request.priority || 'Medium') ? ' selected' : ''}>${priority}</option>`).join('');
        const statusOptions = MAINTENANCE_STATUSES.map((status) => `<option value="${status}"${status === request.status ? ' selected' : ''}>${status}</option>`).join('');
        return `<tr data-maintenance-id="${escapeHtml(request.id)}">
          <td>${formatDateTime(request.created_at)}</td>
          <td>${escapeHtml(getUserById(request.client_id)?.full_name || getUserById(request.client_id)?.email || 'N/A')}</td>
          <td>${escapeHtml(getPropertyById(request.property_id)?.property_address || 'Unassigned')}</td>
          <td>${escapeHtml(getAccountById(request.account_id)?.account_name || 'Unassigned')}</td>
          <td class="dashboard-cell-wrap"><strong>${escapeHtml(request.title || 'N/A')}</strong><div class="table-hint">${escapeHtml(request.description || '')}</div></td>
          <td><select class="dashboard-inline-select" data-maint-priority>${priorityOptions}</select></td>
          <td><select class="dashboard-inline-select" data-maint-status>${statusOptions}</select></td>
          <td><textarea class="dashboard-inline-notes" data-maint-comments rows="3">${escapeHtml(request.admin_comments || '')}</textarea></td>
          <td>${fileLinks}</td>
          <td><div class="table-actions"><button class="action-link" data-action="save-maintenance" data-id="${escapeHtml(request.id)}" type="button">Save</button></div></td>
        </tr>`;
      }).join('');
    });
  }

  function renderLeadStatusSelect(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey];
    const current = normalizeLeadStatus(row[config.statusField]);
    return `<select class="dashboard-inline-select" data-lead-status="${escapeHtml(sectionKey)}">${LEAD_STATUSES.map((option) => `<option value="${escapeHtml(option)}"${option === current ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select>`;
  }

  function renderLeadNotes(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey];
    return `<textarea class="dashboard-inline-notes" data-lead-notes="${escapeHtml(sectionKey)}" rows="4">${escapeHtml(row[config.notesField] || '')}</textarea>`;
  }

  function renderLeadCell(sectionKey, field, row) {
    const config = LEAD_SECTIONS[sectionKey];
    if (field === 'status') return renderLeadStatusSelect(sectionKey, row);
    if (field === 'notes') return renderLeadNotes(sectionKey, row);
    if (field === 'actions') return `<button class="action-link" data-action="save-lead" data-section="${escapeHtml(sectionKey)}" data-id="${escapeHtml(row.id)}" type="button">Save</button>`;
    if (field === 'created_at') return formatDateTime(row.created_at);
    if (field === 'preferred_date') return formatDateOnly(row.preferred_date);
    if (field === 'preferred_time') return formatTimeString(row.preferred_time);
    if (field === 'inquiry_type' || field === 'request_type') return escapeHtml(formatInquiryType(row[field]));
    const value = row[field];
    return value == null || String(value).trim() === '' ? 'N/A' : escapeHtml(value);
  }

  function renderLeadSection(sectionKey) {
    const config = LEAD_SECTIONS[sectionKey];
    const rows = allLeads[sectionKey] || [];
    ['active', 'completed'].forEach((group) => {
      const tbody = document.getElementById(`lead-${sectionKey}-${group}-tbody`);
      const empty = document.getElementById(`lead-${sectionKey}-${group}-empty`);
      const filtered = rows.filter((row) => normalizeLeadStatus(row[config.statusField]) === 'Completed' ? group === 'completed' : group === 'active');
      if (!filtered.length) {
        tbody.innerHTML = '';
        empty.hidden = false;
        return;
      }
      empty.hidden = true;
      tbody.innerHTML = filtered.map((row) => `<tr data-row-id="${escapeHtml(row.id)}">${config.columns.map((field) => `<td${['message', 'property_interest', 'property_address', 'project_description', 'notes'].includes(field) ? ' class="dashboard-cell-wrap"' : ''}>${renderLeadCell(sectionKey, field, row)}</td>`).join('')}</tr>`).join('');
    });
  }

  function renderAllLeadSections() {
    Object.keys(LEAD_SECTIONS).forEach(renderLeadSection);
  }

  async function handleInvite(event) {
    event.preventDefault();
    const form = document.getElementById('invite-form');
    const statusEl = document.getElementById('invite-status');
    const email = form.querySelector('[name="email"]').value.trim();
    const fullName = form.querySelector('[name="full_name"]').value.trim();
    if (!email) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Email is required.';
      return;
    }
    const { error } = await supabaseClient.auth.signInWithOtp({ email, options: { data: { full_name: fullName, role: 'client' }, shouldCreateUser: true } });
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Invitation failed: ' + error.message;
      return;
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = `Invitation sent to ${email}.`;
    form.reset();
    await loadUsersData();
    renderUsers();
    setTimeout(() => closeModal('invite'), 1200);
  }

  async function handleAddProperty(event) {
    event.preventDefault();
    const form = document.getElementById('property-form');
    const statusEl = document.getElementById('property-status');
    const propertyAddress = form.querySelector('[name="property_address"]').value.trim();
    const visibility = form.querySelector('[name="visibility"]').value;
    if (!propertyAddress) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Address is required.';
      return;
    }
    const payload = {
      property_address: propertyAddress,
      property_status: form.querySelector('[name="property_status"]').value,
      visibility,
      is_public: visibility === 'public',
      notes: form.querySelector('[name="notes"]').value.trim() || null,
      updated_at: nowIso()
    };
    const { error } = await supabaseClient.from('properties').insert([payload]);
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Failed: ' + error.message;
      return;
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Property saved.';
    form.reset();
    await loadPropertiesData();
    renderProperties();
    renderUsers();
    setTimeout(() => closeModal('property'), 1200);
  }

  async function handleAddAccount(event) {
    event.preventDefault();
    const form = document.getElementById('account-form');
    const statusEl = document.getElementById('account-status-message');
    const accountName = form.querySelector('[name="account_name"]').value.trim();
    if (!accountName) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Account name is required.';
      return;
    }
    const status = normalizeAccountStatus(form.querySelector('[name="status"]').value);
    const payload = {
      account_name: accountName,
      property_id: form.querySelector('[name="property_id"]').value || null,
      account_type: form.querySelector('[name="account_type"]').value || 'Other',
      status,
      client_upload_enabled: !!form.querySelector('[name="client_upload_enabled"]').checked,
      transaction_details: form.querySelector('[name="transaction_details"]').value.trim() || null,
      internal_notes: form.querySelector('[name="internal_notes"]').value.trim() || null,
      client_notes: form.querySelector('[name="client_notes"]').value.trim() || null,
      required_tasks: form.querySelector('[name="required_tasks"]').value.trim() || null,
      updated_at: nowIso(),
      completed_at: status === 'Completed' ? nowIso() : null
    };
    const { data, error } = await supabaseClient.from('accounts').insert([payload]).select().single();
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Failed: ' + error.message;
      return;
    }
    const clientId = form.querySelector('[name="primary_client_id"]').value || null;
    if (clientId) {
      await supabaseClient.from('account_clients').upsert([{ account_id: data.id, client_id: clientId }], { onConflict: 'account_id,client_id' });
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Account created.';
    form.reset();
    await Promise.all([loadAccountsData(), loadAccountAssignmentsData()]);
    renderAccounts();
    renderUsers();
    setTimeout(() => closeModal('account'), 1200);
  }

  async function handleUpload(event) {
    event.preventDefault();
    const form = document.getElementById('upload-form');
    const statusEl = document.getElementById('upload-status');
    const fileInput = document.getElementById('upload-file');
    const file = fileInput?.files?.[0] || null;
    if (!file) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Please select a file.';
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
    const accountId = form.querySelector('[name="account_id"]').value || null;
    const account = getAccountById(accountId);
    const assignedClientIds = accountId ? getAccountClientIds(accountId) : [];
    const clientId = form.querySelector('[name="client_id"]').value || (assignedClientIds.length === 1 ? assignedClientIds[0] : null);
    const propertyId = form.querySelector('[name="property_id"]').value || account?.property_id || null;
    const visibility = form.querySelector('[name="visibility"]').value;
    const requiresSignature = document.getElementById('upload-requires-sig').checked;
    const canClientEdit = document.getElementById('upload-client-edit').checked || requiresSignature;
    const canClientView = visibility !== 'admin_only';
    const bucketName = file.type.startsWith('image/') ? 'property-images' : 'property-documents';
    const uniquePrefix = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = `${accountId || clientId || 'admin'}/${uniquePrefix}-${sanitizeFilename(file.name)}`;
    const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
    if (storageError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Upload failed: ' + storageError.message;
      return;
    }
    const signatureUrl = form.querySelector('[name="signature_url"]').value.trim();
    const payload = {
      account_id: accountId,
      client_id: clientId,
      property_id: propertyId,
      uploaded_by: adminUserId,
      file_name: file.name,
      file_path: filePath,
      bucket_name: bucketName,
      file_type: file.type,
      file_size: file.size,
      category: form.querySelector('[name="category"]').value || 'Other',
      visibility,
      can_client_view: canClientView,
      can_client_edit: canClientEdit,
      requires_signature: requiresSignature,
      signature_provider: form.querySelector('[name="signature_provider"]').value || null,
      signature_status: form.querySelector('[name="signature_status"]').value || (requiresSignature ? 'pending_signature' : 'available'),
      signature_url: signatureUrl || null,
      notes: form.querySelector('[name="notes"]').value.trim() || null,
      hidden: false,
      updated_at: nowIso()
    };
    const { error: dbError } = await supabaseClient.from('documents').insert([payload]);
    if (dbError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'File saved but record failed: ' + dbError.message;
      return;
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'File uploaded successfully.';
    form.reset();
    await loadDocumentsData();
    renderDocuments();
    setTimeout(() => closeModal('upload'), 1200);
  }

  async function saveUser(userId, row) {
    const role = row.querySelector('[data-user-role]')?.value;
    const status = row.querySelector('[data-user-status]')?.value;
    const { error } = await supabaseClient.from('profiles').update({ role, status }).eq('id', userId);
    if (error) return window.alert(`Unable to save user: ${error.message}`);
    await loadUsersData();
    renderUsers();
  }

  function openPropertyAssignmentModal(userId) {
    const list = document.getElementById('property-assignment-list');
    const subtitle = document.getElementById('property-assignment-subtitle');
    const form = document.getElementById('property-assignment-form');
    const user = getUserById(userId);
    form.dataset.userId = userId;
    subtitle.textContent = user ? `Assign properties to ${user.full_name || user.email}.` : '';
    const assigned = new Set(getAssignedPropertyIds(userId));
    list.innerHTML = allProperties.length
      ? allProperties.map((property) => `<label class="assignment-option"><input type="checkbox" value="${escapeHtml(property.id)}"${assigned.has(property.id) ? ' checked' : ''}> <span>${escapeHtml(property.property_address)}</span></label>`).join('')
      : '<p class="admin-empty-state">No properties are available yet.</p>';
    openModal('property-assignment');
  }

  function openAccountAssignmentModal(userId) {
    const list = document.getElementById('account-assignment-list');
    const subtitle = document.getElementById('account-assignment-subtitle');
    const form = document.getElementById('account-assignment-form');
    const user = getUserById(userId);
    form.dataset.userId = userId;
    subtitle.textContent = user ? `Assign accounts to ${user.full_name || user.email}.` : '';
    const assigned = new Set(allAccountAssignments.filter((assignment) => assignment.client_id === userId).map((assignment) => assignment.account_id));
    list.innerHTML = allAccounts.length
      ? allAccounts.map((account) => `<label class="assignment-option"><input type="checkbox" value="${escapeHtml(account.id)}"${assigned.has(account.id) ? ' checked' : ''}> <span>${escapeHtml(account.account_name)} · ${escapeHtml(account.account_type || 'Other')} · ${escapeHtml(account.status)}</span></label>`).join('')
      : '<p class="admin-empty-state">No accounts are available yet.</p>';
    openModal('account-assignment');
  }

  async function savePropertyAssignments(event) {
    event.preventDefault();
    const form = document.getElementById('property-assignment-form');
    const statusEl = document.getElementById('property-assignment-status');
    const userId = form.dataset.userId;
    const selectedIds = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    const { error: deleteError } = await supabaseClient.from('client_property_assignments').delete().eq('client_id', userId);
    if (deleteError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = deleteError.message;
      return;
    }
    if (selectedIds.length) {
      const { error: insertError } = await supabaseClient.from('client_property_assignments').insert(selectedIds.map((propertyId) => ({ client_id: userId, property_id: propertyId })));
      if (insertError) {
        statusEl.className = 'form-status error-message';
        statusEl.textContent = insertError.message;
        return;
      }
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Property assignments updated.';
    await loadPropertyAssignmentsData();
    renderUsers();
    setTimeout(() => closeModal('property-assignment'), 1200);
  }

  async function saveAccountAssignments(event) {
    event.preventDefault();
    const form = document.getElementById('account-assignment-form');
    const statusEl = document.getElementById('account-assignment-status');
    const userId = form.dataset.userId;
    const selectedIds = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    const { error: deleteError } = await supabaseClient.from('account_clients').delete().eq('client_id', userId);
    if (deleteError) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = deleteError.message;
      return;
    }
    if (selectedIds.length) {
      const { error: insertError } = await supabaseClient.from('account_clients').insert(selectedIds.map((accountId) => ({ account_id: accountId, client_id: userId })));
      if (insertError) {
        statusEl.className = 'form-status error-message';
        statusEl.textContent = insertError.message;
        return;
      }
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Account assignments updated.';
    await loadAccountAssignmentsData();
    renderUsers();
    renderAccounts();
    setTimeout(() => closeModal('account-assignment'), 1200);
  }

  async function saveLead(sectionKey, rowId, button) {
    const config = LEAD_SECTIONS[sectionKey];
    const row = button.closest('tr');
    const status = row.querySelector(`[data-lead-status="${sectionKey}"]`)?.value || 'Not Reviewed Yet';
    const notes = row.querySelector(`[data-lead-notes="${sectionKey}"]`)?.value.trim() || null;
    button.disabled = true;
    button.textContent = 'Saving…';
    const payload = {
      [config.statusField]: status,
      [config.notesField]: notes,
      updated_at: nowIso(),
      completed_at: status === 'Completed' ? nowIso() : null
    };
    const { error } = await supabaseClient.from(config.table).update(payload).eq('id', rowId);
    if (error) {
      button.disabled = false;
      button.textContent = 'Save';
      return window.alert(`Unable to save lead: ${error.message}`);
    }
    await loadLeadData(sectionKey);
    renderLeadSection(sectionKey);
  }

  async function saveMaintenance(rowId, button) {
    const row = button.closest('tr');
    const status = row.querySelector('[data-maint-status]')?.value || 'Not Reviewed Yet';
    const priority = row.querySelector('[data-maint-priority]')?.value || 'Medium';
    const adminComments = row.querySelector('[data-maint-comments]')?.value.trim() || null;
    button.disabled = true;
    button.textContent = 'Saving…';
    const { error } = await supabaseClient.from('maintenance_requests').update({
      status,
      priority,
      admin_comments: adminComments,
      updated_at: nowIso(),
      completed_at: status === 'Completed' ? nowIso() : null
    }).eq('id', rowId);
    if (error) {
      button.disabled = false;
      button.textContent = 'Save';
      return window.alert(`Unable to save maintenance request: ${error.message}`);
    }
    await loadMaintenanceData();
    renderMaintenanceTables();
  }

  async function editSignatureMetadata(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    const provider = window.prompt('Signature provider (DocuSign, Dropbox Sign, Adobe Acrobat Sign, Manual Upload):', doc.signature_provider || '');
    if (provider === null) return;
    const status = window.prompt('Signature status (available, pending_signature, signed, uploaded):', doc.signature_status || (doc.requires_signature ? 'pending_signature' : 'available'));
    if (status === null) return;
    const signatureUrl = window.prompt('External signature URL (leave blank to clear):', doc.signature_url || '');
    if (signatureUrl === null) return;
    const requiresSignature = !!(provider || signatureUrl || status === 'pending_signature' || status === 'signed');
    const { error } = await supabaseClient.from('documents').update({
      requires_signature: requiresSignature,
      signature_provider: provider || null,
      signature_status: status || (requiresSignature ? 'pending_signature' : 'available'),
      signature_url: signatureUrl.trim() || null,
      updated_at: nowIso()
    }).eq('id', docId);
    if (error) return window.alert(error.message);
    await loadDocumentsData();
    renderDocuments();
  }

  async function handleDocumentAction(action, docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    if (action === 'open-doc') return openDocument(docId);
    if (action === 'download-doc') return downloadDocument(docId);
    if (action === 'edit-signature') return editSignatureMetadata(docId);
    if (action === 'toggle-doc') {
      const { error } = await supabaseClient.from('documents').update({ hidden: !doc.hidden, updated_at: nowIso() }).eq('id', docId);
      if (error) return window.alert(error.message);
      await loadDocumentsData();
      renderDocuments();
      return;
    }
    if (action === 'delete-doc') {
      if (!window.confirm('Delete this file? This cannot be undone.')) return;
      if (doc.bucket_name && doc.file_path) await supabaseClient.storage.from(doc.bucket_name).remove([doc.file_path]);
      const { error } = await supabaseClient.from('documents').delete().eq('id', docId);
      if (error) return window.alert(error.message);
      await loadDocumentsData();
      renderDocuments();
    }
  }

  async function handlePropertyAction(action, propertyId) {
    if (action !== 'delete-property') return;
    if (!window.confirm('Delete this property? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('properties').delete().eq('id', propertyId);
    if (error) return window.alert(error.message);
    await loadPropertiesData();
    renderProperties();
    renderUsers();
  }

  async function handleAccountAction(action, accountId) {
    if (action === 'account-upload') {
      document.getElementById('upload-account').value = accountId;
      applyUploadAccountDefaults(accountId);
      openModal('upload');
      return;
    }
    if (action !== 'delete-account') return;
    if (!window.confirm('Delete this account? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('accounts').delete().eq('id', accountId);
    if (error) return window.alert(error.message);
    await Promise.all([loadAccountsData(), loadAccountAssignmentsData()]);
    renderAccounts();
    renderUsers();
  }

  function revealPage() {
    document.getElementById('auth-guard-style')?.remove();
    document.body.style.visibility = 'visible';
  }

  async function renderAdminPage() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) return window.location.replace('login.html');
    const session = await getSession();
    if (!session) return window.location.replace('login.html');
    const profile = await getCurrentUserProfile();
    if (!profile || profile.role !== 'admin') return window.location.replace(profile && profile.role === 'client' ? 'client-portal.html' : 'login.html');
    adminUserId = session.user.id;
    revealPage();
    document.getElementById('logged-in-user').textContent = session.user.email;
    document.getElementById('logout-button')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });
    initTabs();
    setupModalClose();
    document.getElementById('open-invite-modal')?.addEventListener('click', () => openModal('invite'));
    document.getElementById('open-property-modal')?.addEventListener('click', () => openModal('property'));
    document.getElementById('open-account-modal')?.addEventListener('click', () => openModal('account'));
    document.getElementById('open-upload-modal')?.addEventListener('click', () => openModal('upload'));
    document.getElementById('upload-account')?.addEventListener('change', function () { applyUploadAccountDefaults(this.value); });
    document.getElementById('invite-form')?.addEventListener('submit', handleInvite);
    document.getElementById('property-form')?.addEventListener('submit', handleAddProperty);
    document.getElementById('account-form')?.addEventListener('submit', handleAddAccount);
    document.getElementById('upload-form')?.addEventListener('submit', handleUpload);
    document.getElementById('property-assignment-form')?.addEventListener('submit', savePropertyAssignments);
    document.getElementById('account-assignment-form')?.addEventListener('submit', saveAccountAssignments);
    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('admin-filter-visibility')?.addEventListener('change', renderDocuments);
    document.getElementById('admin-filter-signed')?.addEventListener('change', renderDocuments);

    document.getElementById('users-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const userId = button.getAttribute('data-id');
      const row = button.closest('tr');
      if (action === 'save-user' && row) saveUser(userId, row);
      if (action === 'assign-properties') openPropertyAssignmentModal(userId);
      if (action === 'assign-accounts') openAccountAssignmentModal(userId);
      if (action === 'view-client') window.location.href = `client-portal.html?view_as_client=${encodeURIComponent(userId)}`;
    });

    document.getElementById('properties-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (button) handlePropertyAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });

    ['accounts-active-tbody', 'accounts-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (button) handleAccountAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
      });
    });

    document.getElementById('documents-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (button) handleDocumentAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });

    ['maintenance-active-tbody', 'maintenance-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const id = button.getAttribute('data-id');
        if (action === 'save-maintenance') saveMaintenance(id, button);
        if (action === 'open-maint-file') openMaintenanceFile(id, false);
        if (action === 'download-maint-file') openMaintenanceFile(id, true);
      });
    });

    Object.keys(LEAD_SECTIONS).forEach((sectionKey) => {
      ['active', 'completed'].forEach((group) => {
        document.getElementById(`lead-${sectionKey}-${group}-tbody`)?.addEventListener('click', function (event) {
          const button = event.target.closest('[data-action="save-lead"]');
          if (button) saveLead(sectionKey, button.getAttribute('data-id'), button);
        });
      });
    });

    await Promise.all([
      loadUsersData(),
      loadPropertiesData(),
      loadAccountsData(),
      loadAccountAssignmentsData(),
      loadPropertyAssignmentsData(),
      loadDocumentsData(),
      loadMaintenanceData(),
      loadAllLeadData()
    ]);

    renderUsers();
    renderProperties();
    renderAccounts();
    renderDocuments();
    renderMaintenanceTables();
    renderAllLeadSections();
  }

  document.addEventListener('DOMContentLoaded', renderAdminPage);
})();
