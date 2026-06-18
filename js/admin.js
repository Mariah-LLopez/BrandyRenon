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
  const SIGNATURE_STATUS_LABELS = {
    available: 'Available',
    pending_signature: 'Pending Signature',
    signed: 'Signed',
    uploaded: 'Uploaded'
  };
  const MAINTENANCE_STATUSES = ['New', 'In Review', 'Scheduled', 'In Progress', 'Completed', 'Closed'];
  const MAINTENANCE_PRIORITIES = ['Low', 'Medium', 'High', 'Emergency'];
  const LEAD_STATUS_OPTIONS = [
    { value: 'not_viewed', label: 'Not Viewed Yet' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' }
  ];
  const LEAD_SECTIONS = {
    contact: {
      table: 'contact_requests',
      tbodyId: 'lead-contact-tbody',
      emptyId: 'lead-contact-empty',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      editable: true,
      columns: ['name', 'email', 'phone', 'inquiry_type', 'property_interest', 'message', 'created_at', 'status', 'notes', 'actions']
    },
    showing: {
      table: 'showing_requests',
      tbodyId: 'lead-showing-tbody',
      emptyId: 'lead-showing-empty',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      editable: true,
      columns: ['name', 'email', 'phone', 'request_type', 'property_address', 'preferred_date', 'preferred_time', 'message', 'created_at', 'status', 'notes', 'actions']
    },
    renovation: {
      table: 'renovation_clients',
      tbodyId: 'lead-renovation-tbody',
      emptyId: 'lead-renovation-empty',
      statusField: 'status',
      editable: false,
      columns: ['full_name', 'email', 'phone', 'property_address', 'service_needed', 'project_type', 'project_description', 'timeline', 'budget_range', 'status', 'created_at']
    }
  };

  let adminUserId = null;
  let allUsers = [];
  let allProperties = [];
  let allTransactions = [];
  let allDocuments = [];
  let allPropertyAssignments = [];
  let allMaintenanceRequests = [];
  let allLeads = { contact: [], showing: [], renovation: [] };

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
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
        if (event.target === modal) {
          closeModal(modal.id.replace('-modal', ''));
        }
      });
    });

    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      document.querySelectorAll('.modal.is-open').forEach((modal) => {
        closeModal(modal.id.replace('-modal', ''));
      });
    });
  }

  function updateTabParams(changes) {
    const params = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([key, value]) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }

  function setActiveMainTab(tabKey) {
    document.querySelectorAll('.portal-tab-bar:not(.leads-sub-tabs) .portal-tab').forEach((button) => {
      const active = button.getAttribute('data-tab') === tabKey;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `tab-${tabKey}`;
    });
  }

  function setActiveLeadTab(tabKey) {
    const targetTab = LEAD_SECTIONS[tabKey] ? tabKey : 'contact';
    document.querySelectorAll('.leads-sub-tabs .portal-tab').forEach((button) => {
      const active = button.getAttribute('data-lead-tab') === targetTab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.lead-tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `lead-tab-${targetTab}`;
    });
  }

  function initTabs() {
    document.querySelectorAll('.portal-tab-bar:not(.leads-sub-tabs) .portal-tab').forEach((button) => {
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

    const params = new URLSearchParams(window.location.search);
    setActiveMainTab(params.get('tab') || 'users');
    setActiveLeadTab(params.get('leadTab') || 'contact');
  }

  function statusBadge(status) {
    const map = { Active: 'badge-active', Pending: 'badge-pending', Sold: 'badge-sold', 'Coming Soon': 'badge-coming-soon', Closed: 'badge-sold', Cancelled: 'badge-hidden' };
    return `<span class="status-badge ${map[status] || 'badge-coming-soon'}">${escapeHtml(status || 'N/A')}</span>`;
  }

  function visibilityLabel(value) {
    return { admin_only: 'Admin Only', client_visible: 'Client View', client_downloadable: 'Client Download' }[value] || value || 'N/A';
  }

  function clientAccessLabel(doc) {
    if (!doc.can_client_view) return 'Hidden from client';
    if (doc.can_client_edit) return 'View + Edit';
    return doc.visibility === 'client_downloadable' ? 'View + Download' : 'View only';
  }

  function signatureStatusLabel(value) {
    return SIGNATURE_STATUS_LABELS[value] || SIGNATURE_STATUS_LABELS.available;
  }

  function sigBadge(doc) {
    const status = doc.signature_status || (doc.signed ? 'signed' : (doc.requires_signature ? 'pending_signature' : 'available'));
    if (status === 'signed') {
      return `<span class="badge-doc-signed">Signed ${escapeHtml(formatDateOnly(doc.signed_at))}</span>`;
    }
    if (status === 'pending_signature') {
      return '<span class="badge-doc-required">Pending Signature</span>';
    }
    if (status === 'uploaded') {
      return '<span class="badge-doc-required">Uploaded</span>';
    }
    return '<span class="badge-doc-none">Available</span>';
  }

  function formatTransactionType(value) {
    const map = {
      purchase: 'Purchase',
      sale: 'Sale',
      lease: 'Lease',
      property_management: 'Property Management',
      rental: 'Rental',
      flip: 'Flip'
    };
    return map[value] || value || 'N/A';
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
    return escapeHtml(date.toLocaleString([], {
      year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }));
  }

  function formatTimeString(value) {
    if (!value) return 'N/A';
    const match = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) return escapeHtml(value);
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
      return escapeHtml(value);
    }
    const parsed = new Date();
    parsed.setHours(hours, minutes, 0, 0);
    return escapeHtml(parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
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

  function populateUserSelect(select, blankLabel) {
    if (!select) return;
    const current = select.value;
    const options = allUsers
      .filter((user) => user.role === 'client')
      .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.full_name || user.email)}</option>`)
      .join('');
    select.innerHTML = `<option value="">${escapeHtml(blankLabel || 'No specific client')}</option>${options}`;
    if (current) select.value = current;
  }

  function populatePropertySelect(select) {
    if (!select) return;
    const current = select.value;
    const hasNone = select.querySelector('option[value=""]');
    const noneText = hasNone ? hasNone.textContent : 'No specific property';
    select.innerHTML = `<option value="">${escapeHtml(noneText)}</option>${allProperties.map((property) => `<option value="${escapeHtml(property.id)}">${escapeHtml(property.property_address)}</option>`).join('')}`;
    if (current) select.value = current;
  }

  async function getStorageUrl(bucket, filePath) {
    if (!bucket || !filePath) return null;
    const { data: signedData, error: signedError } = await supabaseClient.storage.from(bucket).createSignedUrl(filePath, 300);
    if (!signedError && signedData?.signedUrl) return signedData.signedUrl;
    const { data: publicData } = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
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
      console.error('Open document error:', error);
      window.alert(`Unable to open document: ${error.message}`);
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
      link.download = doc.file_name || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Download document error:', error);
      window.alert(`Unable to download document: ${error.message}`);
    }
  }

  async function loadUsersData() {
    const { data, error } = await supabaseClient.rpc('get_admin_user_profiles');
    if (error) {
      console.error('Users RPC error:', error);
      const fallback = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
      if (fallback.error) {
        console.error('Users fallback error:', fallback.error);
        return;
      }
      allUsers = (fallback.data || []).map((row) => ({ ...row, last_login_at: null }));
    } else {
      allUsers = data || [];
    }
    populateUserSelect(document.getElementById('upload-client'));
    populateUserSelect(document.getElementById('txn-client'), 'Select client…');
  }

  async function loadPropertiesData() {
    const { data, error } = await supabaseClient.from('properties').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Properties error:', error);
      return;
    }
    allProperties = data || [];
    populatePropertySelect(document.getElementById('upload-property'));
    populatePropertySelect(document.getElementById('txn-property'));
    populatePropertySelect(document.getElementById('admin-maint-property-filter'));
  }

  async function loadTransactionsData() {
    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, properties(property_address), profiles!transactions_client_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Transactions error:', error);
      return;
    }
    allTransactions = data || [];
  }

  async function loadPropertyAssignmentsData() {
    const { data, error } = await supabaseClient.from('client_property_assignments').select('client_id, property_id');
    if (error) {
      console.error('Property assignments error:', error);
      return;
    }
    allPropertyAssignments = data || [];
  }

  async function loadDocumentsData() {
    const { data, error } = await supabaseClient
      .from('documents')
      .select('*, profiles!documents_client_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Documents error:', error);
      return;
    }
    allDocuments = data || [];
  }

  async function loadMaintenanceData() {
    const { data, error } = await supabaseClient
      .from('maintenance_requests')
      .select('*, profiles!maintenance_requests_client_id_fkey(full_name, email), properties(property_address)')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Maintenance requests error:', error);
      return;
    }
    allMaintenanceRequests = data || [];
  }

  async function loadLeadData(sectionKey) {
    const section = LEAD_SECTIONS[sectionKey];
    if (!section) return;
    const { data, error } = await supabaseClient.from(section.table).select('*').order('created_at', { ascending: false });
    if (error) {
      console.error(`${section.table} error:`, error);
      return;
    }
    allLeads[sectionKey] = data || [];
  }

  async function loadAllLeadData() {
    await Promise.all(Object.keys(LEAD_SECTIONS).map(loadLeadData));
  }

  function getAssignedPropertyIds(userId) {
    const manual = allPropertyAssignments.filter((assignment) => assignment.client_id === userId).map((assignment) => assignment.property_id);
    const transactionLinked = allTransactions.filter((transaction) => transaction.client_id === userId && transaction.property_id).map((transaction) => transaction.property_id);
    return Array.from(new Set([...manual, ...transactionLinked]));
  }

  function getPropertySummary(userId) {
    const labels = getAssignedPropertyIds(userId)
      .map((propertyId) => allProperties.find((property) => property.id === propertyId)?.property_address)
      .filter(Boolean);
    if (!labels.length) return 'None assigned';
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  function getTransactionSummary(userId) {
    const labels = allTransactions
      .filter((transaction) => transaction.client_id === userId)
      .map((transaction) => transaction.properties?.property_address || transaction.id)
      .filter(Boolean);
    if (!labels.length) return 'None assigned';
    if (labels.length <= 2) return labels.join(', ');
    return `${labels.slice(0, 2).join(', ')} +${labels.length - 2} more`;
  }

  function renderUsers() {
    const tbody = document.getElementById('users-tbody');
    const empty = document.getElementById('users-empty');
    if (!tbody) return;

    const term = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const filtered = allUsers.filter((user) => {
      if (!term) return true;
      return [user.full_name, user.email, user.role, user.status].some((value) => String(value || '').toLowerCase().includes(term));
    });

    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = filtered.map((user) => {
      const roleOptions = USER_ROLES.map((role) => `<option value="${role}"${role === user.role ? ' selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>`).join('');
      const statusOptions = USER_STATUSES.map((status) => `<option value="${status}"${status === (user.status || 'active') ? ' selected' : ''}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`).join('');
      const clientActions = user.role === 'client'
        ? `
          <button class="action-link" data-action="assign-properties" data-id="${escapeHtml(user.id)}" type="button">Assign Properties</button>
          <button class="action-link" data-action="assign-transactions" data-id="${escapeHtml(user.id)}" type="button">Assign Transactions</button>
          <button class="action-link" data-action="view-client" data-id="${escapeHtml(user.id)}" type="button">View as Client</button>`
        : '';
      return `<tr data-user-id="${escapeHtml(user.id)}">
        <td>${escapeHtml(user.email)}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-role>${roleOptions}</select></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-status>${statusOptions}</select></td>
        <td>${escapeHtml(formatDateOnly(user.created_at))}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(getPropertySummary(user.id))}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(getTransactionSummary(user.id))}</td>
        <td class="users-actions-cell"><div class="table-actions table-actions-stack">
          <button class="action-link" data-action="save-user" data-id="${escapeHtml(user.id)}" type="button">Save</button>
          ${clientActions}
        </div></td>
      </tr>`;
    }).join('');
  }

  function renderProperties() {
    const tbody = document.getElementById('properties-tbody');
    const empty = document.getElementById('properties-empty');
    if (!tbody) return;
    if (!allProperties.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = allProperties.map((property) => `<tr>
      <td>${escapeHtml(property.property_address)}</td>
      <td>${statusBadge(property.property_status)}</td>
      <td>${property.purchase_price ? '$' + Number(property.purchase_price).toLocaleString() : 'N/A'}</td>
      <td>${property.sale_price ? '$' + Number(property.sale_price).toLocaleString() : 'N/A'}</td>
      <td>${escapeHtml(formatDateOnly(property.created_at))}</td>
      <td><div class="table-actions"><button class="action-link" data-action="delete-property" data-id="${escapeHtml(property.id)}" type="button">Delete</button></div></td>
    </tr>`).join('');
  }

  function renderTransactions() {
    const tbody = document.getElementById('transactions-tbody');
    const empty = document.getElementById('transactions-empty');
    if (!tbody) return;
    if (!allTransactions.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = allTransactions.map((transaction) => `<tr>
      <td>${escapeHtml(transaction.properties?.property_address || 'N/A')}</td>
      <td>${escapeHtml(transaction.profiles?.full_name || transaction.profiles?.email || 'Unassigned')}</td>
      <td>${escapeHtml(formatTransactionType(transaction.transaction_type))}</td>
      <td>${statusBadge(transaction.status)}</td>
      <td>${escapeHtml(formatDateOnly(transaction.created_at))}</td>
      <td><div class="table-actions"><button class="action-link" data-action="delete-transaction" data-id="${escapeHtml(transaction.id)}" type="button">Delete</button></div></td>
    </tr>`).join('');
  }

  function renderDocuments() {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    const visibilityFilter = document.getElementById('admin-filter-visibility')?.value || '';
    const signatureFilter = document.getElementById('admin-filter-signed')?.value || '';
    let filtered = allDocuments.slice();
    if (visibilityFilter) filtered = filtered.filter((doc) => doc.visibility === visibilityFilter);
    if (signatureFilter === 'required') filtered = filtered.filter((doc) => doc.requires_signature || doc.signature_status === 'pending_signature');
    if (signatureFilter === 'signed') filtered = filtered.filter((doc) => (doc.signature_status || (doc.signed ? 'signed' : 'available')) === 'signed');
    if (signatureFilter === 'unsigned') filtered = filtered.filter((doc) => (doc.signature_status || (doc.requires_signature ? 'pending_signature' : 'available')) === 'pending_signature');

    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = filtered.map((doc) => {
      const clientInfo = doc.profiles ? (doc.profiles.full_name || doc.profiles.email) : 'N/A';
      const showSignatureActions = doc.requires_signature || doc.signature_status === 'pending_signature' || doc.signature_url;
      const signatureMeta = doc.signature_provider
        ? `<div class="table-hint">${escapeHtml(doc.signature_provider)}${doc.signature_url ? ' · link added' : ''}</div>`
        : '';
      return `<tr>
        <td><button class="action-link document-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category) || 'N/A'}</td>
        <td>${escapeHtml(clientInfo)}</td>
        <td>${escapeHtml(visibilityLabel(doc.visibility))}</td>
        <td>${escapeHtml(clientAccessLabel(doc))}</td>
        <td>${sigBadge(doc)}${signatureMeta}</td>
        <td>${escapeHtml(formatDateOnly(doc.created_at))}</td>
        <td><div class="table-actions table-actions-stack">
          <button class="action-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">Open</button>
          <button class="action-link" data-action="download-doc" data-id="${escapeHtml(doc.id)}" type="button">Download</button>
          <button class="action-link" data-action="toggle-doc" data-id="${escapeHtml(doc.id)}" type="button">${doc.hidden ? 'Unhide' : 'Hide'}</button>
          <button class="action-link" data-action="delete-doc" data-id="${escapeHtml(doc.id)}" type="button">Delete</button>
          ${showSignatureActions ? `<button class="action-link" data-action="set-signature-link" data-id="${escapeHtml(doc.id)}" type="button">${doc.signature_url ? 'Edit Signature Link' : 'Add Signature Link'}</button>` : ''}
          ${showSignatureActions ? `<button class="action-link" data-action="cycle-signature-status" data-id="${escapeHtml(doc.id)}" type="button">Update Signature Status</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  }

  function renderMaintenanceRequests() {
    const tbody = document.getElementById('maintenance-tbody');
    const empty = document.getElementById('maintenance-empty');
    if (!tbody) return;

    const statusFilter = document.getElementById('admin-maint-status-filter')?.value || '';
    const priorityFilter = document.getElementById('admin-maint-priority-filter')?.value || '';
    const propertyFilter = document.getElementById('admin-maint-property-filter')?.value || '';

    let filtered = allMaintenanceRequests.slice();
    if (statusFilter) filtered = filtered.filter((request) => request.status === statusFilter);
    if (priorityFilter) filtered = filtered.filter((request) => request.priority === priorityFilter);
    if (propertyFilter) filtered = filtered.filter((request) => request.property_id === propertyFilter);

    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = filtered.map((request) => {
      const photoLinks = Array.isArray(request.photo_paths) && request.photo_paths.length
        ? `<div class="maintenance-photo-links">${request.photo_paths.map((photoPath, index) => `<button class="action-link" data-action="open-maint-photo" data-id="${escapeHtml(request.id)}" data-photo-index="${index}" type="button">Photo ${index + 1}</button>`).join('')}</div>`
        : 'None';
      return `<tr>
        <td>${escapeHtml(formatDateTime(request.created_at))}</td>
        <td>${escapeHtml(request.profiles?.full_name || request.profiles?.email || 'N/A')}</td>
        <td>${escapeHtml(request.properties?.property_address || 'Unassigned')}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(request.title || 'N/A')}<div class="table-hint">${escapeHtml(request.description || '')}</div></td>
        <td><select class="dashboard-inline-select" data-maint-priority>${MAINTENANCE_PRIORITIES.map((priority) => `<option value="${priority}"${priority === (request.priority || 'Medium') ? ' selected' : ''}>${priority}</option>`).join('')}</select></td>
        <td><select class="dashboard-inline-select" data-maint-status>${MAINTENANCE_STATUSES.map((status) => `<option value="${status}"${status === (request.status || 'New') ? ' selected' : ''}>${status}</option>`).join('')}</select></td>
        <td><textarea class="dashboard-inline-notes" data-maint-comments rows="3">${escapeHtml(request.admin_comments || '')}</textarea></td>
        <td>${photoLinks}</td>
        <td><div class="table-actions"><button class="action-link" data-action="save-maintenance" data-id="${escapeHtml(request.id)}" type="button">Save</button></div></td>
      </tr>`;
    }).join('');
  }

  function renderLeadStatusSelect(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey];
    const statusField = config?.statusField || 'admin_status';
    const current = row[statusField] || 'not_viewed';
    return `<select class="dashboard-inline-select" data-lead-status="${escapeHtml(sectionKey)}">${LEAD_STATUS_OPTIONS.map((option) => `<option value="${option.value}"${option.value === current ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}</select>`;
  }

  function renderLeadNotes(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey];
    const notesField = config?.notesField || 'admin_notes';
    return `<textarea class="dashboard-inline-notes" data-lead-notes="${escapeHtml(sectionKey)}" rows="4">${escapeHtml(row[notesField] || '')}</textarea>`;
  }

  function renderLeadCell(sectionKey, config, field, row) {
    if (field === 'status') {
      if (config.editable) return renderLeadStatusSelect(sectionKey, row);
      return escapeHtml(row[config.statusField || 'status'] || 'N/A');
    }
    if (field === 'notes') return config.editable ? renderLeadNotes(sectionKey, row) : 'N/A';
    if (field === 'actions') return config.editable ? `<button class="action-link" data-action="save-lead" data-section="${escapeHtml(sectionKey)}" data-id="${escapeHtml(row.id)}" type="button">Save</button>` : 'N/A';
    if (field === 'created_at') return formatDateTime(row.created_at);
    if (field === 'preferred_date') return formatDateOnly(row.preferred_date);
    if (field === 'preferred_time') return formatTimeString(row.preferred_time);
    if (field === 'inquiry_type' || field === 'request_type') return escapeHtml(formatInquiryType(row[field]));
    const value = row[field];
    if (value === null || value === undefined || String(value).trim() === '') return 'N/A';
    return escapeHtml(value);
  }

  function renderLeadSection(sectionKey) {
    const config = LEAD_SECTIONS[sectionKey];
    const tbody = document.getElementById(config.tbodyId);
    const empty = document.getElementById(config.emptyId);
    if (!tbody) return;

    const rows = allLeads[sectionKey] || [];
    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = rows.map((row) => `<tr data-row-id="${escapeHtml(row.id)}">
      ${config.columns.map((field) => {
        const cellClass = ['message', 'property_interest', 'property_address', 'project_description', 'service_area', 'notes'].includes(field) ? ' class="dashboard-cell-wrap"' : '';
        return `<td${cellClass}>${renderLeadCell(sectionKey, config, field, row)}</td>`;
      }).join('')}
    </tr>`).join('');
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
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }
    if (!email) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Email is required.'; }
      return;
    }

    const { error } = await supabaseClient.auth.signInWithOtp({
      email,
      options: { data: { full_name: fullName, role: 'client' }, shouldCreateUser: true }
    });
    if (error) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Invitation failed: ' + error.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = `Invitation sent to ${email}.`; }
    form.reset();
    await loadUsersData();
    renderUsers();
    setTimeout(() => closeModal('invite'), 1500);
  }

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
    await loadPropertiesData();
    renderProperties();
    renderUsers();
    setTimeout(() => closeModal('property'), 1500);
  }

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
    await loadTransactionsData();
    renderTransactions();
    renderUsers();
    setTimeout(() => closeModal('transaction'), 1500);
  }

  async function handleUpload(event) {
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
    const visibility = form.querySelector('[name="visibility"]').value;
    const requiresSignature = document.getElementById('upload-requires-sig').checked;
    const canClientEdit = document.getElementById('upload-client-edit').checked || requiresSignature;
    const canClientView = visibility !== 'admin_only';
    const safeFilename = sanitizeFilename(file.name);
    const uniquePrefix = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = clientId
      ? `admin/users/${clientId}/${uniquePrefix}-${safeFilename}`
      : propertyId
        ? `admin/${propertyId}/${uniquePrefix}-${safeFilename}`
        : `admin/${uniquePrefix}-${safeFilename}`;
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
      visibility,
      can_client_view: canClientView,
      can_client_edit: canClientEdit,
      requires_signature: requiresSignature,
      notes: form.querySelector('[name="notes"]').value.trim() || null,
      hidden: false
    }]);
    if (dbError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'File saved but record failed: ' + dbError.message; }
      return;
    }

    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Document uploaded successfully.'; }
    form.reset();
    await loadDocumentsData();
    renderDocuments();
    setTimeout(() => closeModal('upload'), 1500);
  }

  async function saveUser(userId, row) {
    const role = row.querySelector('[data-user-role]')?.value;
    const status = row.querySelector('[data-user-status]')?.value;
    const { error } = await supabaseClient.from('profiles').update({ role, status }).eq('id', userId);
    if (error) {
      window.alert(`Unable to save user: ${error.message}`);
      return;
    }
    await loadUsersData();
    renderUsers();
    if (userId === adminUserId && role !== 'admin') {
      window.location.href = 'client-portal.html';
    }
  }

  function openPropertyAssignmentModal(userId) {
    const user = allUsers.find((item) => item.id === userId);
    const list = document.getElementById('property-assignment-list');
    const subtitle = document.getElementById('property-assignment-subtitle');
    const form = document.getElementById('property-assignment-form');
    const statusEl = document.getElementById('property-assignment-status');
    if (!list || !form) return;
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }
    form.dataset.userId = userId;
    if (subtitle) subtitle.textContent = user ? `Assign properties to ${user.full_name || user.email}.` : '';
    const assigned = new Set(getAssignedPropertyIds(userId));
    list.innerHTML = allProperties.length
      ? allProperties.map((property) => `<label class="assignment-option"><input type="checkbox" value="${escapeHtml(property.id)}"${assigned.has(property.id) ? ' checked' : ''}> <span>${escapeHtml(property.property_address)}</span></label>`).join('')
      : '<p class="admin-empty-state">No properties are available yet.</p>';
    openModal('property-assignment');
  }

  function openTransactionAssignmentModal(userId) {
    const user = allUsers.find((item) => item.id === userId);
    const list = document.getElementById('transaction-assignment-list');
    const subtitle = document.getElementById('transaction-assignment-subtitle');
    const form = document.getElementById('transaction-assignment-form');
    const statusEl = document.getElementById('transaction-assignment-status');
    if (!list || !form) return;
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }
    form.dataset.userId = userId;
    if (subtitle) subtitle.textContent = user ? `Assign transactions to ${user.full_name || user.email}.` : '';
    list.innerHTML = allTransactions.length
      ? allTransactions.map((transaction) => {
        const checked = transaction.client_id === userId;
        const assignedTo = transaction.profiles?.full_name || transaction.profiles?.email;
        const detail = `${transaction.properties?.property_address || 'No property'} · ${transaction.transaction_type} · ${transaction.status}${assignedTo ? ` · ${assignedTo}` : ''}`;
        return `<label class="assignment-option"><input type="checkbox" value="${escapeHtml(transaction.id)}"${checked ? ' checked' : ''}> <span>${escapeHtml(detail)}</span></label>`;
      }).join('')
      : '<p class="admin-empty-state">No transactions are available yet.</p>';
    openModal('transaction-assignment');
  }

  async function savePropertyAssignments(event) {
    event.preventDefault();
    const form = document.getElementById('property-assignment-form');
    const statusEl = document.getElementById('property-assignment-status');
    const userId = form.dataset.userId;
    const selectedIds = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const { error: deleteError } = await supabaseClient.from('client_property_assignments').delete().eq('client_id', userId);
    if (deleteError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = deleteError.message; }
      return;
    }

    if (selectedIds.length) {
      const { error: insertError } = await supabaseClient.from('client_property_assignments').insert(selectedIds.map((propertyId) => ({ client_id: userId, property_id: propertyId })));
      if (insertError) {
        if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = insertError.message; }
        return;
      }
    }

    await loadPropertyAssignmentsData();
    renderUsers();
    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Property assignments updated.'; }
    setTimeout(() => closeModal('property-assignment'), 1200);
  }

  async function saveTransactionAssignments(event) {
    event.preventDefault();
    const form = document.getElementById('transaction-assignment-form');
    const statusEl = document.getElementById('transaction-assignment-status');
    const userId = form.dataset.userId;
    const selectedIds = Array.from(form.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const currentIds = allTransactions.filter((transaction) => transaction.client_id === userId).map((transaction) => transaction.id);
    const idsToClear = currentIds.filter((id) => !selectedIds.includes(id));
    const updates = [];
    idsToClear.forEach((id) => updates.push(supabaseClient.from('transactions').update({ client_id: null }).eq('id', id)));
    selectedIds.forEach((id) => updates.push(supabaseClient.from('transactions').update({ client_id: userId }).eq('id', id)));
    const results = await Promise.all(updates);
    const failed = results.find((result) => result.error);
    if (failed) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = failed.error.message; }
      return;
    }

    await loadTransactionsData();
    renderTransactions();
    renderUsers();
    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Transaction assignments updated.'; }
    setTimeout(() => closeModal('transaction-assignment'), 1200);
  }

  async function saveLead(sectionKey, rowId, button) {
    const config = LEAD_SECTIONS[sectionKey];
    if (!config || !config.editable) return;
    const tbody = document.getElementById(config.tbodyId);
    const row = tbody ? tbody.querySelector(`tr[data-row-id="${rowId}"]`) : null;
    if (!row) return;
    const adminStatus = row.querySelector(`[data-lead-status="${sectionKey}"]`)?.value || 'not_viewed';
    const adminNotes = row.querySelector(`[data-lead-notes="${sectionKey}"]`)?.value.trim() || null;
    const statusField = config.statusField || 'admin_status';
    const updatePayload = { [statusField]: adminStatus };
    if (config.notesField) updatePayload[config.notesField] = adminNotes;

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }

    const { error } = await supabaseClient.from(config.table).update(updatePayload).eq('id', rowId);
    if (error) {
      window.alert(`Unable to save lead: ${error.message}`);
      if (button) {
        button.disabled = false;
        button.textContent = 'Save';
      }
      return;
    }

    await loadLeadData(sectionKey);
    renderLeadSection(sectionKey);
  }

  async function handleDocumentAction(action, docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    if (action === 'open-doc') return openDocument(docId);
    if (action === 'download-doc') return downloadDocument(docId);
    if (action === 'toggle-doc') {
      const { error } = await supabaseClient.from('documents').update({ hidden: !doc.hidden }).eq('id', docId);
      if (error) { window.alert(error.message); return; }
      await loadDocumentsData();
      renderDocuments();
      return;
    }
    if (action === 'delete-doc') {
      if (!window.confirm('Delete this document? This cannot be undone.')) return;
      if (doc.bucket_name && doc.file_path) {
        await supabaseClient.storage.from(doc.bucket_name).remove([doc.file_path]);
      }
      const { error } = await supabaseClient.from('documents').delete().eq('id', docId);
      if (error) { window.alert(error.message); return; }
      await loadDocumentsData();
      renderDocuments();
      return;
    }
    if (action === 'require-sig') {
      const { error } = await supabaseClient.from('documents').update({ requires_signature: true, can_client_edit: true }).eq('id', docId);
      if (error) { window.alert(error.message); return; }
      await loadDocumentsData();
      renderDocuments();
    }
  }

  async function handlePropertyAction(action, propertyId) {
    if (action !== 'delete-property') return;
    if (!window.confirm('Delete this property? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('properties').delete().eq('id', propertyId);
    if (error) { window.alert(error.message); return; }
    await loadPropertiesData();
    renderProperties();
    renderUsers();
  }

  async function handleTransactionAction(action, transactionId) {
    if (action !== 'delete-transaction') return;
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('transactions').delete().eq('id', transactionId);
    if (error) { window.alert(error.message); return; }
    await loadTransactionsData();
    renderTransactions();
    renderUsers();
  }

  function revealPage() {
    const style = document.getElementById('auth-guard-style');
    if (style) style.remove();
    document.body.style.visibility = 'visible';
  }

  async function renderAdminPage() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      window.location.replace('login.html');
      return;
    }

    const session = await getSession();
    if (!session) {
      window.location.replace('login.html');
      return;
    }

    const profile = await getCurrentUserProfile();
    if (!profile || profile.role !== 'admin') {
      window.location.replace(profile && profile.role === 'client' ? 'client-portal.html' : 'login.html');
      return;
    }

    adminUserId = session.user.id;
    revealPage();
    const userDisplay = document.getElementById('logged-in-user');
    if (userDisplay) userDisplay.textContent = session.user.email;

    document.getElementById('logout-button')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    initTabs();
    setupModalClose();

    document.getElementById('open-invite-modal')?.addEventListener('click', () => openModal('invite'));
    document.getElementById('open-property-modal')?.addEventListener('click', () => openModal('property'));
    document.getElementById('open-transaction-modal')?.addEventListener('click', () => openModal('transaction'));
    document.getElementById('open-upload-modal')?.addEventListener('click', () => openModal('upload'));

    document.getElementById('invite-form')?.addEventListener('submit', handleInvite);
    document.getElementById('property-form')?.addEventListener('submit', handleAddProperty);
    document.getElementById('transaction-form')?.addEventListener('submit', handleAddTransaction);
    document.getElementById('upload-form')?.addEventListener('submit', handleUpload);
    document.getElementById('property-assignment-form')?.addEventListener('submit', savePropertyAssignments);
    document.getElementById('transaction-assignment-form')?.addEventListener('submit', saveTransactionAssignments);

    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    [document.getElementById('admin-filter-visibility'), document.getElementById('admin-filter-signed')].forEach((el) => {
      if (el) el.addEventListener('change', renderDocuments);
    });

    document.getElementById('users-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const userId = button.getAttribute('data-id');
      const row = button.closest('tr');
      if (!action || !userId) return;
      if (action === 'save-user' && row) saveUser(userId, row);
      if (action === 'assign-properties') openPropertyAssignmentModal(userId);
      if (action === 'assign-transactions') openTransactionAssignmentModal(userId);
      if (action === 'view-client') window.location.href = `client-portal.html?view_as_client=${encodeURIComponent(userId)}`;
    });

    document.getElementById('properties-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handlePropertyAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });

    document.getElementById('transactions-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handleTransactionAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });

    document.getElementById('documents-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handleDocumentAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });

    Object.values(LEAD_SECTIONS).forEach((section) => {
      document.getElementById(section.tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action="save-lead"]');
        if (!button) return;
        saveLead(button.getAttribute('data-section'), button.getAttribute('data-id'), button);
      });
    });

    await Promise.all([
      loadUsersData(),
      loadPropertiesData(),
      loadTransactionsData(),
      loadPropertyAssignmentsData(),
      loadDocumentsData(),
      loadAllLeadData()
    ]);

    renderUsers();
    renderProperties();
    renderTransactions();
    renderDocuments();
    renderAllLeadSections();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    await renderAdminPage();
  });
})();
