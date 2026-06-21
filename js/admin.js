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
  const ALLOWED_IMAGE_EXTENSIONS = window.SUPABASE_FILE_RULES?.allowedImageExtensions || ['.jpg', '.jpeg', '.png', '.webp'];
  const ALLOWED_MIME_TYPES = window.SUPABASE_FILE_RULES?.allowedMimeTypes || [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg', 'image/png', 'image/webp'
  ];
  const USER_ROLES = ['admin', 'client'];

  const USER_STATUSES = ['active', 'inactive'];
  
  const USER_TYPES = [
    'Buyer',
    'Seller',
    'Renter',
    'Rental Owner',
    'Renovation Client',
    'Other'
  ];
  
  const LEAD_STATUSES = [
    'Not Reviewed Yet',
    'In Progress',
    'Completed'
  ];
  
  const ITEM_PRIORITIES = [
    'Low',
    'Medium',
    'High'
  ];
  
  const ACCOUNT_STATUSES = [
    'Not Reviewed Yet',
    'In Progress',
    'Active',
    'Pending Signature',
    'Completed',
    'Archived'
  ];
  
  const ACCOUNT_TYPES = [
    'Buyer Account',
    'Seller Account',
    'Rental Account',
    'Rental Owner Account',
    'Renovation Account',
    'Property Management Account',
    'Other'
  ];
  
  const MAINTENANCE_STATUSES = [
    'Not Reviewed Yet',
    'In Progress',
    'Completed'
  ];
  
  const MAINTENANCE_PRIORITIES = [
    'Low',
    'Medium',
    'High'
  ];
  const LEAD_SECTIONS = {
    contact: {
      table: 'contact_requests',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      columns: ['name', 'email', 'phone', 'inquiry_type', 'property_interest', 'message', 'priority', 'created_at', 'status', 'notes']
    },
    showing: {
      table: 'showing_requests',
      statusField: 'admin_status',
      notesField: 'admin_notes',
      columns: ['name', 'email', 'phone', 'property_address', 'preferred_date', 'preferred_time', 'message', 'priority', 'created_at', 'status', 'notes']
    },
    property: {
      table: 'contact_requests',   // derived client-side from allLeads.contact, filtered by inquiry_type
      statusField: 'admin_status',
      notesField: 'admin_notes',
      columns: ['name', 'email', 'phone', 'property_interest', 'message', 'priority', 'created_at', 'status', 'notes']
    },
    renovation: {
      table: 'renovation_clients',
      statusField: 'status',
      notesField: 'admin_notes',
      columns: ['full_name', 'email', 'phone', 'property_address', 'service_needed', 'project_type', 'priority', 'created_at', 'status', 'notes']
    }
  };

  function updatePropertyPhotoHelper(property) {
    const helper = document.getElementById('prop-photos-help');
    if (!helper) return;
    const photoCount = property?.id
      ? allDocuments.filter((doc) => doc.property_id === property.id && doc.category === 'Property Photo' && doc.file_path).length
      : 0;
    helper.textContent = photoCount
      ? `${photoCount} photo${photoCount === 1 ? '' : 's'} currently saved. Uploading more will add to this property.`
      : 'Upload one or more photos for this property. JPG, JPEG, PNG, or WEBP only, up to 10 MB each.';
  }

  function resetPropertyForm(options) {
    const config = options || {};
    const form = document.getElementById('property-form');
    const titleEl = document.getElementById('property-modal-title');
    const submitBtn = document.getElementById('property-submit-btn');
    const statusEl = document.getElementById('property-status');
    if (!form) return;
    form.reset();
    delete form.dataset.editId;
    form.querySelector('[name="property_id"]').value = '';
    if (titleEl) titleEl.textContent = 'Add Property';
    if (submitBtn) submitBtn.textContent = 'Save Property';
    if (!config.preserveStatus && statusEl) {
      statusEl.textContent = '';
      statusEl.className = 'form-status';
    }
    updatePropertyPhotoHelper(null);
  }

  function openPropertyEditor(propertyId) {
    const property = getPropertyById(propertyId);
    const form = document.getElementById('property-form');
    const titleEl = document.getElementById('property-modal-title');
    const submitBtn = document.getElementById('property-submit-btn');
    if (!property || !form) return;
    resetPropertyForm();
    form.dataset.editId = property.id;
    form.querySelector('[name="property_id"]').value = property.id;
    form.querySelector('[name="property_address"]').value = property.property_address || '';
    form.querySelector('[name="property_status"]').value = property.property_status || 'Active';
    form.querySelector('[name="visibility"]').value = property.visibility === 'public' ? 'public' : 'internal';
    form.querySelector('[name="notes"]').value = property.notes || '';
    if (titleEl) titleEl.textContent = 'Edit Property';
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    updatePropertyPhotoHelper(property);
    openModal('property');
  }

  async function uploadPropertyPhotos(propertyId, files, onProgress) {
    const uploadedPaths = [];
    const uploadedFiles = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (typeof onProgress === 'function') onProgress(file.name, i + 1, files.length);
        const validationError = getSupabaseFileValidationError(file, {
          imagesOnly: true,
          maxSizeBytes: MAX_FILE_SIZE_BYTES,
          maxSizeMb: MAX_FILE_SIZE_MB
        });
        if (validationError) throw new Error(`"${file.name}": ${validationError}`);
        const filePath = buildStoragePath(STORAGE_BUCKETS.PROPERTY_IMAGES, {
          propertyId,
          fileName: file.name
        });
        const { error: storageError } = await supabaseClient.storage.from(STORAGE_BUCKETS.PROPERTY_IMAGES).upload(filePath, file);
        if (storageError) {
          console.error(`Photo upload error for "${file.name}":`, storageError);
          throw new Error(`"${file.name}": ${storageError.message}`);
        }
        uploadedPaths.push(filePath);
        uploadedFiles.push({
          file_name: file.name,
          file_path: filePath,
          file_type: file.type || null,
          file_size: file.size
        });
      }
      return { uploaded_paths: uploadedPaths, uploaded_files: uploadedFiles };
    } catch (error) {
      if (uploadedPaths.length) {
        await supabaseClient.storage.from(STORAGE_BUCKETS.PROPERTY_IMAGES).remove(uploadedPaths);
      }
      throw error;
    }
  }

  let adminUserId = null;
  let allUsers = [];
  let allProperties = [];
  let allAccounts = [];
  let allAccountAssignments = [];
  let allPropertyAssignments = [];
  let allDocuments = [];
  let allMaintenanceRequests = [];
  let allMaintenanceFiles = [];
  let allTasks = [];
  let allMessages = [];
  let allSigRequests = [];
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

  function hasAllowedImageExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedImageMime(mime) {
    return ALLOWED_IMAGE_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  function setFormStatus(statusEl, type, message) {
    if (!statusEl) return;
    statusEl.className = type ? `form-status ${type}` : 'form-status';
    statusEl.textContent = message || '';
  }

  function getPrimaryAccountClientId(accountId) {
    return getAccountClientIds(accountId)[0] || null;
  }

  function resolveUploadClientId(accountId, selectedClientId) {
    if (!accountId) return selectedClientId || null;
    const assignedClientIds = getAccountClientIds(accountId);
    if (selectedClientId && assignedClientIds.includes(selectedClientId)) return selectedClientId;
    return getPrimaryAccountClientId(accountId) || selectedClientId || null;
  }

  function buildStoragePath(bucketName, options) {
    const config = options || {};
    const uniquePrefix = createUniqueFilePrefix();
    const safeName = sanitizeFilename(config.fileName);
    if (bucketName === STORAGE_BUCKETS.PROPERTY_IMAGES) {
      return `properties/${config.propertyId || 'unassigned'}/${uniquePrefix}-${safeName}`;
    }
    if (bucketName === STORAGE_BUCKETS.ACCOUNT_FILES) {
      return `clients/${config.clientId || 'admin'}/accounts/${config.accountId || 'unassigned'}/${uniquePrefix}-${safeName}`;
    }
    if (bucketName === STORAGE_BUCKETS.MAINTENANCE_FILES) {
      return `clients/${config.clientId || 'admin'}/maintenance/${config.requestId || 'pending'}/${uniquePrefix}-${safeName}`;
    }
    return `clients/${config.clientId || 'admin'}/documents/${config.propertyId || config.accountId || 'general'}/${uniquePrefix}-${safeName}`;
  }

  async function insertPropertyPhotoDocuments(propertyId, uploadedFiles) {
    if (!propertyId || !uploadedFiles?.length) return;
    const payload = uploadedFiles.map((file) => ({
      property_id: propertyId,
      uploaded_by: adminUserId,
      file_name: file.file_name,
      file_path: file.file_path,
      bucket_name: STORAGE_BUCKETS.PROPERTY_IMAGES,
      file_type: file.file_type,
      file_size: file.file_size,
      category: 'Property Photo',
      visibility: 'admin_only',
      can_client_view: false,
      can_client_edit: false,
      requires_signature: false,
      signature_provider: null,
      signature_url: null,
      signature_status: 'available',
      status: 'Not Reviewed Yet',
      priority: 'Medium',
      notes: 'Public property image',
      hidden: false,
      updated_at: nowIso()
    }));
    const { error } = await supabaseClient.from('documents').insert(payload);
    if (error) throw error;
  }

  function createUniqueFilePrefix() {
    if (typeof crypto !== 'undefined') {
      if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      if (typeof crypto.getRandomValues === 'function') {
        const values = new Uint32Array(4);
        crypto.getRandomValues(values);
        return Array.from(values, (value) => value.toString(16).padStart(8, '0')).join('');
      }
    }
    return `${Date.now()}-${Math.round((typeof performance !== 'undefined' ? performance.now() : 0) * 1000)}`;
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

  function normalizePriority(value) {
    const map = { urgent: 'High', emergency: 'High' };
    return map[String(value || '').toLowerCase()] || (ITEM_PRIORITIES.includes(value) ? value : 'Medium');
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

  function normalizeUserType(value) {
    const map = {
      owner: 'Rental Owner',
      'property owner': 'Rental Owner',
      'property management client': 'Rental Owner',
      'rental owner': 'Rental Owner'
    };
    return map[String(value || '').toLowerCase()] || (USER_TYPES.includes(value) ? value : 'Other');
  }

  function normalizeAccountType(value) {
    const map = {
      buyer: 'Buyer Account',
      seller: 'Seller Account',
      rental: 'Rental Account',
      renter: 'Rental Account',
      lease: 'Rental Account',
      owner: 'Rental Owner Account',
      'property owner': 'Rental Owner Account',
      'rental owner account': 'Rental Owner Account',
      renovation: 'Renovation Account',
      contractor: 'Renovation Account',
      'property management': 'Property Management Account',
      'property management client': 'Property Management Account'
    };
    return map[String(value || '').toLowerCase()] || (ACCOUNT_TYPES.includes(value) ? value : 'Other');
  }

  function normalizeMaintenancePriority(value) {
    return normalizePriority(value);
  }

  function debounce(fn, delay) {
    let timer;
    return function () {
      const args = arguments;
      const ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
    };
  }

  const _debounceTimers = new WeakMap();
  function debouncedUpdate(el, delay, fn) {
    clearTimeout(_debounceTimers.get(el));
    _debounceTimers.set(el, setTimeout(fn, delay));
  }

  function setAutosaveState(indicatorEl, state, errorMsg) {
    if (!indicatorEl) return;
    indicatorEl.textContent = state === 'saving' ? '…' : state === 'saved' ? '✓' : '⚠';
    indicatorEl.className = `autosave-indicator autosave-${state}`;
    indicatorEl.title = errorMsg || '';
    if (state === 'saved') {
      setTimeout(function () {
        if (indicatorEl.className.includes('autosave-saved')) {
          indicatorEl.textContent = '';
          indicatorEl.className = 'autosave-indicator';
          indicatorEl.title = '';
        }
      }, 2000);
    }
  }

  function getFieldIndicator(el) {
    return el.closest('td')?.querySelector('.autosave-indicator') || null;
  }

  function getElementDataId(el, attrName) {
    return el.getAttribute(attrName) || el.closest(`[${attrName}]`)?.getAttribute(attrName) || null;
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
    const target = ['dashboard', 'users', 'properties', 'accounts', 'maintenance', 'leads'].includes(tabKey) ? tabKey : 'dashboard';
    document.querySelectorAll('.portal-tab-bar:not(.leads-sub-tabs):not(.workflow-tab-bar) .portal-tab').forEach((button) => {
      const active = button.getAttribute('data-tab') === target;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.hidden = panel.id !== `tab-${target}`;
    });
  }

  function setActiveLeadTab(tabKey) {
    const validTabs = Object.keys(LEAD_SECTIONS).concat(['completed']);
    const target = validTabs.includes(tabKey) ? tabKey : 'contact';
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
    setActiveMainTab(params.get('tab') || 'dashboard');
    setActiveLeadTab(params.get('leadTab') || 'contact');
    [['accounts', 'active'], ['maintenance', 'active']].forEach(([group, target]) => setWorkflowTab(group, target));
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
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (Number.isNaN(hours) || Number.isNaN(minutes) || hours > 23 || minutes > 59) {
      return escapeHtml(value);
    }
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return escapeHtml(date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
  }

  function formatInquiryType(value) {
    const labels = {
      general_question: 'General Question',
      property_inquiry: 'Property Inquiry',
      showing_request: 'Showing Request',
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
    if (lower.includes('Not Reviewed Yet')) type = 'review';
    else if (lower.includes('progress') || lower.includes('pending')) type = 'progress';
    else if (lower.includes('completed') || lower.includes('signed')) type = 'success';
    else if (lower.includes('archived')) type = 'archived';
    return `<span class="status-pill ${type}">${escapeHtml(normalized)}</span>`;
  }

  function isCompletedStatus(value) {
    return String(value || '').toLowerCase() === 'completed';
  }

  function isSignatureCompletedStatus(value) {
    return ['completed', 'signed', 'declined', 'expired'].includes(String(value || '').toLowerCase());
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

  function renderPropertySelect(options) {
    const config = options || {};
    const current = config.currentId || '';
    const attrName = config.attrName || 'data-property-id';
    const blankLabel = config.blankLabel || 'Unassigned';
    return `<select class="dashboard-inline-select" ${attrName}>
      <option value="">${escapeHtml(blankLabel)}</option>
      ${allProperties.map((property) => `<option value="${escapeHtml(property.id)}"${property.id === current ? ' selected' : ''}>${escapeHtml(property.property_address || 'Unnamed property')}</option>`).join('')}
    </select><span class="autosave-indicator" aria-live="polite"></span>`;
  }

  async function getPropertyPhotoUrls(property) {
    if (!property?.id) return [];
    const docs = allDocuments.filter((doc) => doc.property_id === property.id && doc.category === 'Property Photo' && doc.file_path);
    const urls = await Promise.all(
      docs.map((doc) => {
        const bucket = doc.bucket_name || STORAGE_BUCKETS.PROPERTY_IMAGES;
        if (!doc.bucket_name) console.warn('Property photo document missing bucket_name, defaulting to property-images:', doc.id);
        return getSupabaseStorageUrl(bucket, doc.file_path, { expiresIn: 3600 }).catch((err) => {
          console.error('Failed to get signed URL for property photo:', doc.id, err);
          return null;
        });
      })
    );
    return urls.filter(Boolean);
  }

  function getPropertyPhotoPaths(property) {
    if (!property?.id) return [];
    return allDocuments
      .filter((doc) => doc.property_id === property.id && doc.category === 'Property Photo' && doc.file_path)
      .map((doc) => doc.file_path);
  }

  async function getPrimaryPropertyPhoto(property) {
    return (await getPropertyPhotoUrls(property))[0] || null;
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

  function getAccountsForUser(userId) {
    return allAccounts.filter((account) => getAccountClientIds(account.id).includes(userId));
  }

  function getUsersForProperty(propertyId) {
    const clientIds = new Set(allPropertyAssignments
      .filter((assignment) => assignment.property_id === propertyId)
      .map((assignment) => assignment.client_id));
    allAccounts
      .filter((account) => account.property_id === propertyId)
      .forEach((account) => getAccountClientIds(account.id).forEach((clientId) => clientIds.add(clientId)));
    return Array.from(clientIds)
      .map((clientId) => getUserById(clientId))
      .filter(Boolean);
  }

  function getAccountsForProperty(propertyId) {
    return allAccounts.filter((account) => account.property_id === propertyId);
  }

  function getDocumentsForProperty(propertyId, options) {
    const config = options || {};
    return allDocuments.filter((doc) => {
      if (doc.property_id !== propertyId) return false;
      if (!config.includePhotos && doc.category === 'Property Photo') return false;
      return true;
    });
  }

  function getDocumentsForAccount(accountId) {
    return allDocuments.filter((doc) => doc.account_id === accountId);
  }

  function getAccountPhotoDocs(accountId) {
    return getDocumentsForAccount(accountId).filter((doc) => doc.category === 'Property Photo' || String(doc.category || '').toLowerCase() === 'photo');
  }

  function getAccountReceiptDocs(accountId) {
    return getDocumentsForAccount(accountId).filter((doc) => String(doc.category || '').toLowerCase() === 'receipt');
  }

  function getSignatureRequestsForAccount(accountId) {
    return allSigRequests.filter((sig) => sig.account_id === accountId);
  }

  function getTasksForAccount(accountId) {
    return allTasks.filter((task) => task.account_id === accountId);
  }

  function formatCountLabel(count, singular, plural) {
    if (!count) return `No ${plural || `${singular}s`}`;
    return `${count} ${count === 1 ? singular : (plural || `${singular}s`)}`;
  }

  function renderInlineAssignmentEditor(userId, group) {
    const isPropertyGroup = group === 'properties';
    const options = isPropertyGroup
      ? allProperties.map((property) => ({ id: property.id, label: property.property_address || 'Unnamed property' }))
      : allAccounts.map((account) => ({ id: account.id, label: `${account.account_name} · ${normalizeAccountType(account.account_type || 'Other')}` }));
    const selectedIds = new Set(isPropertyGroup
      ? allPropertyAssignments.filter((assignment) => assignment.client_id === userId).map((assignment) => assignment.property_id)
      : allAccountAssignments.filter((assignment) => assignment.client_id === userId).map((assignment) => assignment.account_id));
    const ariaLabel = isPropertyGroup ? 'Assigned properties' : 'Assigned accounts';
    return `<select class="dashboard-inline-select dashboard-inline-multiselect" data-user-assignments data-assignment-group="${escapeHtml(group)}" data-user-id="${escapeHtml(userId)}" multiple aria-label="${escapeHtml(ariaLabel)}">
      ${options.length ? options.map((option) => `<option value="${escapeHtml(option.id)}"${selectedIds.has(option.id) ? ' selected' : ''}>${escapeHtml(option.label)}</option>`).join('') : '<option value="" disabled>No options available.</option>'}
    </select><span class="autosave-indicator" aria-live="polite"></span>`;
  }

  function renderFileSummaryButtons(files, emptyLabel, limit) {
    const max = limit || 2;
    if (!files.length) return `<div class="mini-asset-stack"><span class="table-hint">${escapeHtml(emptyLabel || 'None')}</span></div>`;
    return `<div class="mini-asset-stack">
      <span class="table-hint">${escapeHtml(formatCountLabel(files.length, 'file'))}</span>
      <div class="inline-file-actions">
        ${files.slice(0, max).map((file) => `<button class="action-link" data-action="open-doc" data-id="${escapeHtml(file.id)}" type="button">${escapeHtml(file.file_name || 'Open file')}</button><button class="action-link" data-action="download-doc" data-id="${escapeHtml(file.id)}" type="button">Download</button>`).join('')}
      </div>
      ${files.length > max ? `<span class="table-hint">+${files.length - max} more</span>` : ''}
    </div>`;
  }

  function populateUserSelect(select, blankLabel) {
    if (!select) return;
    const current = select.value;
    const options = allUsers.filter((user) => user.role !== 'admin').map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.full_name || user.email)}</option>`).join('');
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
    const primaryClientId = getPrimaryAccountClientId(accountId);
    if (uploadClient && primaryClientId) uploadClient.value = primaryClientId;
  }

  async function getStorageUrl(bucket, filePath) {
    return getSupabaseStorageUrl(bucket, filePath, { expiresIn: 3600 });
  }

  async function getDocumentUrl(doc) {
    if (!doc.bucket_name || !doc.file_path) {
      throw new Error('File location information is missing (bucket or path). Unable to open this document.');
    }
    const url = await getStorageUrl(doc.bucket_name, doc.file_path);
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
    const { data, error } = await supabaseClient
      .from('profiles')
      .select('id, email, full_name, phone, role, status, user_type, created_at, updated_at')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) return;
    allUsers = (data || []).map((user) => ({
      ...user,
      role: user.role === 'admin' ? 'admin' : 'client',
      status: user.status || 'active',
      user_type: normalizeUserType(user.user_type)
    }));
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
    allAccounts = (data || []).map((account) => ({
      ...account,
      status: normalizeAccountStatus(account.status),
      priority: normalizePriority(account.priority),
      account_type: normalizeAccountType(account.account_type)
    }));
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
      allMaintenanceRequests = (requests.data || []).map((request) => ({
        ...request,
        status: normalizeMaintenanceStatus(request.status),
        priority: normalizeMaintenancePriority(request.priority)
      }));
    }
    if (!files.error) allMaintenanceFiles = files.data || [];
  }

  async function loadLeadData(sectionKey) {
    const config = LEAD_SECTIONS[sectionKey];
    if (!config || sectionKey === 'property') return; // property is derived client-side from contact data
    const { data, error } = await supabaseClient.from(config.table).select('*').order('created_at', { ascending: false });
    if (error) return;
    allLeads[sectionKey] = (data || []).map((row) => ({
      ...row,
      [config.statusField]: normalizeLeadStatus(row[config.statusField]),
      [config.notesField]: row[config.notesField] || null,
      priority: normalizePriority(row.priority)
    }));
  }

  async function loadAllLeadData() {
    await Promise.all(Object.keys(LEAD_SECTIONS).filter((k) => k !== 'property').map(loadLeadData));
  }

  async function loadTasksData() {
    const { data, error } = await supabaseClient
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) return;
    allTasks = (data || []).map((task) => {
      const statusMap = { 'Not Reviewed': 'Not Reviewed Yet', 'Waiting on User': 'In Progress', 'Waiting on Admin': 'In Progress', Archived: 'Completed' };
      return { ...task, status: statusMap[task.status] || task.status || 'Not Reviewed Yet', priority: normalizePriority(task.priority) };
    });
  }

  async function loadMessagesData() {
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*, profiles!messages_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) return;
    allMessages = (data || []).map((message) => {
      const statusMap = { Open: 'Not Reviewed Yet', 'Not Reviewed': 'Not Reviewed Yet', Replied: 'Completed', Closed: 'Completed' };
      return { ...message, status: statusMap[message.status] || message.status || 'Not Reviewed Yet', priority: normalizePriority(message.priority) };
    });
  }

  async function loadSigRequestsData() {
    const { data, error } = await supabaseClient
      .from('signature_requests')
      .select('*, profiles!signature_requests_user_id_fkey(full_name, email)')
      .order('created_at', { ascending: false });
    if (error) return;
    allSigRequests = data || [];
  }

  function renderUsers() {
    const term = (document.getElementById('user-search')?.value || '').trim().toLowerCase();
    const filtered = allUsers.filter((user) => {
      if (!term) return true;
      return [user.full_name, user.email, user.role, user.status, user.user_type].some((value) => String(value || '').toLowerCase().includes(term));
    });
    const groups = {
      active: filtered.filter((user) => (user.status || 'active') !== 'inactive'),
      inactive: filtered.filter((user) => (user.status || 'active') === 'inactive')
    };
    Object.entries(groups).forEach(([groupKey, rows]) => {
      const tbody = document.getElementById(`users-${groupKey}-tbody`);
      const empty = document.getElementById(`users-${groupKey}-empty`);
      if (!tbody || !empty) return;
      if (!rows.length) {
        tbody.innerHTML = '';
        empty.hidden = false;
        return;
      }
      empty.hidden = true;
      tbody.innerHTML = rows.map((user) => {
      const roleOptions = USER_ROLES.map((role) => `<option value="${role}"${role === user.role ? ' selected' : ''}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>`).join('');
      const typeOptions = USER_TYPES.map((userType) => `<option value="${userType}"${normalizeUserType(user.user_type || 'Other') === userType ? ' selected' : ''}>${escapeHtml(userType)}</option>`).join('');
      const statusOptions = USER_STATUSES.map((status) => `<option value="${status}"${status === (user.status || 'active') ? ' selected' : ''}>${status.charAt(0).toUpperCase() + status.slice(1)}</option>`).join('');
      const clientActions = user.role !== 'admin'
        ? `<button class="action-link" data-action="view-client" data-id="${escapeHtml(user.id)}" type="button">Preview Client Portal</button>`
        : '';
      return `<tr data-user-id="${escapeHtml(user.id)}">
        <td>${escapeHtml(user.email)}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-role>${roleOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-type>${typeOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-user-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-cell-wrap">${renderInlineAssignmentEditor(user.id, 'properties')}</td>
        <td class="dashboard-cell-wrap">${renderInlineAssignmentEditor(user.id, 'accounts')}</td>
        <td>${formatDateTime(user.updated_at || user.created_at)}</td>
        <td class="users-actions-cell"><div class="table-actions table-actions-stack">${clientActions}</div></td>
      </tr>`;
      }).join('');
    });
  }

  async function renderProperties() {
    const tbody = document.getElementById('properties-tbody');
    const empty = document.getElementById('properties-empty');
    if (!allProperties.length) {
      tbody.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    const photoUrls = await Promise.all(allProperties.map((property) => getPrimaryPropertyPhoto(property)));
    tbody.innerHTML = allProperties.map((property, i) => {
      const statusOptions = ['Active', 'Pending', 'Sold', 'Coming Soon'].map((s) => `<option value="${s}"${(property.property_status || 'Active') === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
      const visibilityOptions = [
        `<option value="internal"${property.visibility !== 'public' ? ' selected' : ''}>Internal Property</option>`,
        `<option value="public"${property.visibility === 'public' ? ' selected' : ''}>Public Listing</option>`
      ].join('');
      const photoUrl = photoUrls[i];
      const linkedUsers = getUsersForProperty(property.id);
      const linkedAccounts = getAccountsForProperty(property.id);
      const propertyDocs = getDocumentsForProperty(property.id);
      const photoDocs = getDocumentsForProperty(property.id, { includePhotos: true }).filter((doc) => doc.category === 'Property Photo');
      const photoCount = photoDocs.length;
      const accountTypes = Array.from(new Set(linkedAccounts.map((account) => normalizeAccountType(account.account_type || 'Other'))));
      return `<tr data-property-id="${escapeHtml(property.id)}">
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-prop-visibility>${visibilityOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-cell-wrap"><div class="property-summary-stack">${photoUrl ? `<img class="property-photo-preview" src="${escapeHtml(photoUrl)}" alt="Photo of ${escapeHtml(property.property_address)}">` : '<div class="property-photo-preview property-photo-placeholder">No Photo</div>'}<div class="property-photo-meta"><strong>${escapeHtml(property.property_address)}</strong><span class="property-photo-count">${photoCount} photo${photoCount === 1 ? '' : 's'}</span><span class="table-hint">${property.visibility === 'public' ? 'Public website listing' : 'Internal portal record'}</span></div></div></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-prop-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-cell-wrap">${linkedUsers.length ? linkedUsers.map((user) => escapeHtml(user.full_name || user.email)).join('<br>') : 'Unassigned'}</td>
        <td class="dashboard-cell-wrap">${linkedAccounts.length ? linkedAccounts.map((account) => escapeHtml(account.account_name)).join('<br>') : 'No accounts'}</td>
        <td class="dashboard-cell-wrap">${accountTypes.length ? accountTypes.map((type) => escapeHtml(type)).join('<br>') : 'No account types'}</td>
        <td>${photoDocs.length ? `<div class="mini-asset-stack"><span class="table-hint">${escapeHtml(formatCountLabel(photoDocs.length, 'photo'))}</span><div class="inline-file-actions"><button class="action-link" data-action="open-doc" data-id="${escapeHtml(photoDocs[0].id)}" type="button">Open Photo</button><button class="action-link" data-action="download-doc" data-id="${escapeHtml(photoDocs[0].id)}" type="button">Download</button></div></div>` : '<span class="table-hint">No photos</span>'}</td>
        <td>${renderFileSummaryButtons(propertyDocs, 'No documents')}</td>
        <td><textarea class="dashboard-inline-notes dashboard-notes-sm" data-prop-notes rows="3" aria-label="Property notes">${escapeHtml(property.notes || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span></td>
        <td><div class="table-actions table-actions-stack"><button class="action-link" data-action="edit-property" data-id="${escapeHtml(property.id)}" type="button">Edit / Photos</button><button class="action-link" data-action="delete-property" data-id="${escapeHtml(property.id)}" type="button">Delete</button></div></td>
      </tr>`;
    }).join('');
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
      config.tbody.innerHTML = config.rows.map((account) => {
        const statusOptions = ACCOUNT_STATUSES.map((s) => `<option value="${s}"${account.status === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
        const priorityOptions = ITEM_PRIORITIES.map((priority) => `<option value="${priority}"${priority === (account.priority || 'Medium') ? ' selected' : ''}>${priority}</option>`).join('');
        const accountDocs = getDocumentsForAccount(account.id);
        const accountPhotos = getAccountPhotoDocs(account.id);
        const accountReceipts = getAccountReceiptDocs(account.id);
        const accountSigs = getSignatureRequestsForAccount(account.id);
        const accountTasks = getTasksForAccount(account.id);
        const primaryProperty = getPropertyById(account.property_id);
        return `<tr data-account-id="${escapeHtml(account.id)}">
          <td class="dashboard-cell-wrap"><strong>${escapeHtml(account.account_name)}</strong>${account.client_notes ? `<div class="table-hint">${escapeHtml(account.client_notes)}</div>` : ''}</td>
          <td>${escapeHtml(normalizeAccountType(account.account_type || 'Other'))}</td>
          <td>${escapeHtml(getAccountClientLabels(account.id))}</td>
          <td>${escapeHtml(primaryProperty?.property_address || 'Unassigned')}</td>
          <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-account-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
          <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-account-priority>${priorityOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
          <td>${renderFileSummaryButtons(accountDocs.filter((doc) => doc.category !== 'Property Photo'), 'No documents', 1)}</td>
          <td>${renderFileSummaryButtons(accountPhotos, 'No photos', 1)}</td>
          <td>${renderFileSummaryButtons(accountReceipts, 'No receipts', 1)}</td>
          <td class="dashboard-cell-wrap">${accountSigs.length ? accountSigs.slice(0, 2).map((sig) => `${escapeHtml(sig.title)}<br><span class="table-hint">${escapeHtml(sig.status)}</span>`).join('<br>') : 'No signature requests'}</td>
          <td><textarea class="dashboard-inline-notes dashboard-notes-sm" data-account-notes rows="3">${escapeHtml(account.internal_notes || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span></td>
          <td class="dashboard-cell-wrap"><strong>${formatDateTime(groupKey === 'completed' ? (account.completed_at || account.updated_at) : account.updated_at)}</strong><div class="table-hint">${escapeHtml(formatCountLabel(accountTasks.length, 'task'))} · ${escapeHtml(formatCountLabel(accountDocs.length, 'file'))}</div></td>
          <td><div class="table-actions table-actions-stack"><button class="action-link" data-action="view-account-files" data-id="${escapeHtml(account.id)}" type="button">Files</button><button class="action-link" data-action="account-upload" data-id="${escapeHtml(account.id)}" type="button">Upload File</button><button class="action-link" data-action="delete-account" data-id="${escapeHtml(account.id)}" type="button">Delete</button></div></td>
        </tr>`;
      }).join('');
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
      const statusOptions = TASK_STATUSES.map((status) => `<option value="${escapeHtml(status)}"${status === (doc.status || 'Not Reviewed Yet') ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('');
      return `<tr>
        <td><button class="action-link document-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category || 'Other')}</td>
        <td>${escapeHtml(account?.account_name || 'Unassigned')}</td>
        <td>${escapeHtml(property?.property_address || 'Unassigned')}</td>
        <td>${escapeHtml(clientInfo)}</td>
        <td>${escapeHtml(clientAccessLabel(doc))}</td>
        <td>${sigBadge(doc)}${signatureMeta ? `<div class="table-hint">${escapeHtml(signatureMeta)}</div>` : ''}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-document-status data-document-id="${escapeHtml(doc.id)}">${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
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
          <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-maint-priority>${priorityOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
          <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-maint-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
          <td><textarea class="dashboard-inline-notes" data-maint-comments rows="3">${escapeHtml(request.admin_comments || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span></td>
          <td>${fileLinks}</td>
          <td><div class="table-actions"><button class="action-link" data-action="open-maintenance" data-id="${escapeHtml(request.id)}" type="button">Open</button></div></td>
        </tr>`;
      }).join('');
    });
  }

  function renderLeadStatusSelect(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey] || LEAD_SECTIONS.contact;
    const current = normalizeLeadStatus(row[config.statusField]);
    return `<select class="dashboard-inline-select" data-lead-status="${escapeHtml(sectionKey)}">${LEAD_STATUSES.map((option) => `<option value="${escapeHtml(option)}"${option === current ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select><span class="autosave-indicator" aria-live="polite"></span>`;
  }

  function renderLeadPrioritySelect(sectionKey, row) {
    const current = normalizePriority(row.priority);
    return `<select class="dashboard-inline-select" data-lead-priority="${escapeHtml(sectionKey)}">${ITEM_PRIORITIES.map((option) => `<option value="${escapeHtml(option)}"${option === current ? ' selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select><span class="autosave-indicator" aria-live="polite"></span>`;
  }

  function renderLeadNotes(sectionKey, row) {
    const config = LEAD_SECTIONS[sectionKey] || LEAD_SECTIONS.contact;
    return `<textarea class="dashboard-inline-notes" data-lead-notes="${escapeHtml(sectionKey)}" rows="4">${escapeHtml(row[config.notesField] || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span>`;
  }

  function renderLeadCell(sectionKey, field, row) {
    const config = LEAD_SECTIONS[sectionKey] || LEAD_SECTIONS.contact;
    if (field === 'status') return renderLeadStatusSelect(sectionKey, row);
    if (field === 'priority') return renderLeadPrioritySelect(sectionKey, row);
    if (field === 'notes') return renderLeadNotes(sectionKey, row);
    if (field === 'created_at') return formatDateTime(row.created_at);
    if (field === 'preferred_date') return formatDateOnly(row.preferred_date);
    if (field === 'preferred_time') return formatTimeString(row.preferred_time);
    if (field === 'inquiry_type' || field === 'request_type') return escapeHtml(formatInquiryType(row[field]));
    const value = row[field];
    return value == null || String(value).trim() === '' ? 'N/A' : escapeHtml(value);
  }

  function getLeadRowsForSection(sectionKey) {
    if (sectionKey === 'property') {
      return (allLeads.contact || []).filter((row) => row.inquiry_type === 'property_inquiry');
    }
    if (sectionKey === 'contact') {
      return (allLeads.contact || []).filter((row) => row.inquiry_type !== 'property_inquiry');
    }
    return allLeads[sectionKey] || [];
  }

  function renderLeadSection(sectionKey) {
    const config = LEAD_SECTIONS[sectionKey] || LEAD_SECTIONS.contact;
    const tbody = document.getElementById(`lead-${sectionKey}-tbody`);
    const empty = document.getElementById(`lead-${sectionKey}-empty`);
    if (!tbody) return;
    const rows = getLeadRowsForSection(sectionKey).filter((row) => normalizeLeadStatus(row[config.statusField]) !== 'Completed');
    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = rows.map((row) => `<tr data-row-id="${escapeHtml(row.id)}" data-lead-section="${escapeHtml(sectionKey)}">${config.columns.map((field) => `<td${['message', 'property_interest', 'property_address', 'project_description', 'notes'].includes(field) ? ' class="dashboard-cell-wrap"' : ''}>${renderLeadCell(sectionKey, field, row)}</td>`).join('')}</tr>`).join('');
  }

  function renderCompletedLeads() {
    const tbody = document.getElementById('lead-completed-tbody');
    const empty = document.getElementById('lead-completed-empty');
    if (!tbody) return;
    const completed = [];
    (allLeads.contact || []).filter((r) => r.inquiry_type !== 'property_inquiry' && normalizeLeadStatus(r.admin_status) === 'Completed')
      .forEach((r) => completed.push({ _type: 'Contact Request', _name: r.name, email: r.email, phone: r.phone, created_at: r.created_at, _notes: r.admin_notes }));
    (allLeads.contact || []).filter((r) => r.inquiry_type === 'property_inquiry' && normalizeLeadStatus(r.admin_status) === 'Completed')
      .forEach((r) => completed.push({ _type: 'Property Inquiry', _name: r.name, email: r.email, phone: r.phone, created_at: r.created_at, _notes: r.admin_notes }));
    (allLeads.showing || []).filter((r) => normalizeLeadStatus(r.admin_status) === 'Completed')
      .forEach((r) => completed.push({ _type: 'Showing Request', _name: r.name, email: r.email, phone: r.phone, created_at: r.created_at, _notes: r.admin_notes }));
    (allLeads.renovation || []).filter((r) => normalizeLeadStatus(r.status) === 'Completed')
      .forEach((r) => completed.push({ _type: 'Renovation Client', _name: r.full_name, email: r.email, phone: r.phone, created_at: r.created_at, _notes: r.admin_notes }));
    completed.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    if (!completed.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = completed.map((row) => `<tr>
      <td>${escapeHtml(row._type)}</td>
      <td>${escapeHtml(row._name || 'N/A')}</td>
      <td>${escapeHtml(row.email || 'N/A')}</td>
      <td>${escapeHtml(row.phone || 'N/A')}</td>
      <td>${formatDateTime(row.created_at)}</td>
      <td class="dashboard-cell-wrap">${escapeHtml(row._notes || '')}</td>
    </tr>`).join('');
  }

  function renderAllLeadSections() {
    Object.keys(LEAD_SECTIONS).forEach(renderLeadSection);
    renderCompletedLeads();
  }

  function renderTasks() {
    const tbody = document.getElementById('tasks-tbody');
    const empty = document.getElementById('tasks-empty');
    if (!tbody) return;
    const typeFilter = document.getElementById('task-filter-type')?.value || '';
    const statusFilter = document.getElementById('task-filter-status')?.value || '';
    let filtered = allTasks.slice();
    if (typeFilter) filtered = filtered.filter((t) => t.task_type === typeFilter);
    if (statusFilter) filtered = filtered.filter((t) => t.status === statusFilter);
    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = filtered.map((task) => {
      const account = getAccountById(task.account_id);
      const user = getUserById(task.user_id);
      const statusOptions = TASK_STATUSES.map((s) => `<option value="${s}"${s === task.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
      return `<tr data-task-id="${escapeHtml(task.id)}">
        <td class="dashboard-cell-wrap"><strong>${escapeHtml(task.title)}</strong>${task.user_visible_notes ? `<div class="table-hint">${escapeHtml(task.user_visible_notes)}</div>` : ''}</td>
        <td>${escapeHtml(task.task_type || 'General Message')}</td>
        <td>${escapeHtml(account?.account_name || 'N/A')}</td>
        <td>${escapeHtml(user?.full_name || user?.email || 'N/A')}</td>
        <td>${escapeHtml(task.priority || 'Medium')}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-task-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td>${task.due_date ? escapeHtml(new Date(task.due_date).toLocaleDateString()) : 'None'}</td>
        <td>${formatDateTime(task.created_at)}</td>
        <td><div class="table-actions table-actions-stack"><button class="action-link" data-action="edit-task" data-id="${escapeHtml(task.id)}" type="button">Edit</button><button class="action-link" data-action="delete-task" data-id="${escapeHtml(task.id)}" type="button">Delete</button></div></td>
      </tr>`;
    }).join('');
  }

  function renderMessages() {
    const tbody = document.getElementById('messages-tbody');
    const empty = document.getElementById('messages-empty');
    if (!tbody) return;
    const statusFilter = document.getElementById('message-filter-status')?.value || '';
    let filtered = allMessages.slice();
    if (statusFilter) filtered = filtered.filter((m) => m.status === statusFilter);
    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = filtered.map((msg) => {
      const account = getAccountById(msg.account_id);
      const userInfo = msg.profiles ? (msg.profiles.full_name || msg.profiles.email) : (getUserById(msg.user_id)?.full_name || getUserById(msg.user_id)?.email || 'N/A');
      const statusOptions = MESSAGE_STATUSES.map((s) => `<option value="${s}"${s === msg.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
      const priorityOptions = ITEM_PRIORITIES.map((priority) => `<option value="${priority}"${priority === (msg.priority || 'Medium') ? ' selected' : ''}>${priority}</option>`).join('');
      return `<tr data-message-id="${escapeHtml(msg.id)}">
        <td>${escapeHtml(msg.subject || 'No subject')}</td>
        <td>${escapeHtml(msg.message_type || 'General Message')}</td>
        <td>${escapeHtml(userInfo)}</td>
        <td>${escapeHtml(account?.account_name || 'N/A')}</td>
        <td class="dashboard-cell-wrap">${escapeHtml(msg.message_body || '')}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-message-priority>${priorityOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-message-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td><textarea class="dashboard-inline-notes" data-message-notes rows="2">${escapeHtml(msg.admin_notes || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span></td>
        <td>${formatDateTime(msg.created_at)}</td>
        <td><div class="table-actions"><button class="action-link" data-action="delete-message" data-id="${escapeHtml(msg.id)}" type="button">Delete</button></div></td>
      </tr>`;
    }).join('');
  }

  function renderSigRequests() {
    const tbody = document.getElementById('sig-requests-tbody');
    const empty = document.getElementById('sig-requests-empty');
    if (!tbody) return;
    const statusFilter = document.getElementById('sig-filter-status')?.value || '';
    let filtered = allSigRequests.slice();
    if (statusFilter) filtered = filtered.filter((s) => s.status === statusFilter);
    if (!filtered.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = filtered.map((sig) => {
      const account = getAccountById(sig.account_id);
      const userInfo = sig.profiles ? (sig.profiles.full_name || sig.profiles.email) : (getUserById(sig.user_id)?.full_name || getUserById(sig.user_id)?.email || 'N/A');
      const statusOptions = SIG_REQUEST_STATUSES.map((s) => `<option value="${s}"${s === sig.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('');
      return `<tr data-sig-id="${escapeHtml(sig.id)}">
        <td class="dashboard-cell-wrap"><strong>${escapeHtml(sig.title)}</strong>${sig.signature_url ? `<div class="table-hint"><a href="${escapeHtml(sig.signature_url)}" target="_blank" rel="noopener noreferrer">Open link</a></div>` : ''}</td>
        <td>${escapeHtml(userInfo)}</td>
        <td>${escapeHtml(account?.account_name || 'N/A')}</td>
        <td>${escapeHtml(sig.provider || 'None')}</td>
        <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-sig-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
        <td><textarea class="dashboard-inline-notes" data-sig-notes rows="2">${escapeHtml(sig.admin_notes || '')}</textarea><span class="autosave-indicator" aria-live="polite"></span></td>
        <td>${formatDateTime(sig.created_at)}</td>
        <td><div class="table-actions"><button class="action-link" data-action="delete-sig" data-id="${escapeHtml(sig.id)}" type="button">Delete</button></div></td>
      </tr>`;
    }).join('');
  }

  function renderDashboardWorkspace() {
    const maintenanceBody = document.getElementById('dashboard-maintenance-tbody');
    const maintenanceEmpty = document.getElementById('dashboard-maintenance-empty');
    const actionBody = document.getElementById('dashboard-action-items-tbody');
    const actionEmpty = document.getElementById('dashboard-action-items-empty');
    const completedBody = document.getElementById('dashboard-completed-tasks-tbody');
    const completedEmpty = document.getElementById('dashboard-completed-tasks-empty');

    if (maintenanceBody && maintenanceEmpty) {
      const activeMaintenance = allMaintenanceRequests.filter((request) => !isCompletedStatus(request.status));
      if (!activeMaintenance.length) {
        maintenanceBody.innerHTML = '';
        maintenanceEmpty.hidden = false;
      } else {
        maintenanceEmpty.hidden = true;
        maintenanceBody.innerHTML = activeMaintenance.map((request) => {
          const user = getUserById(request.client_id);
          const statusOptions = MAINTENANCE_STATUSES.map((status) => `<option value="${escapeHtml(status)}"${status === request.status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('');
          return `<tr data-maintenance-id="${escapeHtml(request.id)}">
            <td>${escapeHtml(user?.email || 'N/A')}</td>
            <td>${escapeHtml(user?.role || 'client')}</td>
            <td>${escapeHtml(normalizeUserType(user?.user_type || 'Other'))}</td>
            <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-dash-maint-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
            <td>${formatDateTime(request.created_at)}</td>
            <td class="dashboard-editor-cell">${renderPropertySelect({ currentId: request.property_id, attrName: 'data-dash-maint-property', blankLabel: 'Unassigned' })}</td>
            <td><button class="action-link" data-action="open-maintenance" data-id="${escapeHtml(request.id)}" type="button">Open Request</button></td>
          </tr>`;
        }).join('');
      }
    }

    if (actionBody && actionEmpty) {
      const activeActionItems = allTasks.filter((task) => !isCompletedStatus(task.status) && task.status !== 'Archived' && task.task_type !== 'Maintenance Request');
      if (!activeActionItems.length) {
        actionBody.innerHTML = '';
        actionEmpty.hidden = false;
      } else {
        actionEmpty.hidden = true;
        actionBody.innerHTML = activeActionItems.map((task) => {
          const user = getUserById(task.user_id);
          const statusOptions = TASK_STATUSES.map((status) => `<option value="${escapeHtml(status)}"${status === task.status ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('');
          return `<tr data-task-id="${escapeHtml(task.id)}">
            <td>${escapeHtml(user?.email || 'N/A')}</td>
            <td>${escapeHtml(user?.role || 'client')}</td>
            <td>${escapeHtml(normalizeUserType(user?.user_type || 'Other'))}</td>
            <td class="dashboard-editor-cell"><select class="dashboard-inline-select" data-dash-task-status>${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></td>
            <td>${formatDateTime(task.created_at)}</td>
            <td class="dashboard-editor-cell">${renderPropertySelect({ currentId: task.property_id, attrName: 'data-dash-task-property', blankLabel: 'Unassigned' })}</td>
            <td><button class="action-link" data-action="edit-task" data-id="${escapeHtml(task.id)}" type="button">Open Task</button></td>
          </tr>`;
        }).join('');
      }
    }

    if (completedBody && completedEmpty) {
      const completedRows = [];
      allTasks.filter((task) => isCompletedStatus(task.status)).forEach((task) => {
        const user = getUserById(task.user_id);
        completedRows.push({
          type: task.task_type || 'Task',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: task.completed_at || task.updated_at || task.created_at,
          status: task.status || 'Completed',
          action: `<button class="action-link" data-action="edit-task" data-id="${escapeHtml(task.id)}" type="button">Open Task</button>`
        });
      });
      allMaintenanceRequests.filter((request) => isCompletedStatus(request.status)).forEach((request) => {
        const user = getUserById(request.client_id);
        completedRows.push({
          type: 'Maintenance Request',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: request.completed_at || request.updated_at || request.created_at,
          status: request.status || 'Completed',
          action: `<button class="action-link" data-action="open-maintenance" data-id="${escapeHtml(request.id)}" type="button">Open Request</button>`
        });
      });
      allAccounts.filter((account) => isCompletedStatus(account.status)).forEach((account) => {
        const user = getUserById(getPrimaryAccountClientId(account.id));
        completedRows.push({
          type: 'Account',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: account.completed_at || account.updated_at || account.created_at,
          status: account.status || 'Completed',
          action: `<button class="action-link" data-tab-target="accounts" type="button">Open Accounts</button>`
        });
      });
      allMessages.filter((message) => isCompletedStatus(message.status)).forEach((message) => {
        const user = getUserById(message.user_id);
        completedRows.push({
          type: 'Message',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: message.completed_at || message.updated_at || message.created_at,
          status: message.status || 'Completed',
          action: `<button class="action-link" data-tab-target="leads" type="button">Open Leads</button>`
        });
      });
      allSigRequests.filter((sig) => isSignatureCompletedStatus(sig.status)).forEach((sig) => {
        const user = getUserById(sig.user_id);
        completedRows.push({
          type: 'Signature Request',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: sig.completed_at || sig.updated_at || sig.created_at,
          status: sig.status || 'Completed',
          action: sig.signature_url ? `<a class="action-link" href="${escapeHtml(sig.signature_url)}" target="_blank" rel="noopener noreferrer">Open Signature</a>` : `<button class="action-link" data-tab-target="accounts" type="button">Open Accounts</button>`
        });
      });
      allDocuments.filter((doc) => isCompletedStatus(doc.status)).forEach((doc) => {
        const user = getUserById(doc.client_id);
        completedRows.push({
          type: 'Document',
          email: user?.email || 'N/A',
          role: user?.role || 'client',
          userType: normalizeUserType(user?.user_type || 'Other'),
          completedAt: doc.completed_at || doc.updated_at || doc.created_at,
          status: doc.status || 'Completed',
          action: `<button class="action-link" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button">Open Document</button>`
        });
      });
      const completedLeads = [
        ...(allLeads.contact || []).filter((row) => normalizeLeadStatus(row.admin_status) === 'Completed').map((row) => ({ type: 'Lead', email: row.email || 'N/A', completedAt: row.completed_at || row.updated_at || row.created_at, status: 'Completed' })),
        ...(allLeads.showing || []).filter((row) => normalizeLeadStatus(row.admin_status) === 'Completed').map((row) => ({ type: 'Lead', email: row.email || 'N/A', completedAt: row.completed_at || row.updated_at || row.created_at, status: 'Completed' })),
        ...(allLeads.renovation || []).filter((row) => normalizeLeadStatus(row.status) === 'Completed').map((row) => ({ type: 'Lead', email: row.email || 'N/A', completedAt: row.completed_at || row.updated_at || row.created_at, status: 'Completed' }))
      ];
      completedLeads.forEach((lead) => {
        completedRows.push({
          type: lead.type,
          email: lead.email,
          role: 'lead',
          userType: 'Lead',
          completedAt: lead.completedAt,
          status: lead.status,
          action: '<button class="action-link" data-tab-target="leads" type="button">Open Leads</button>'
        });
      });
      completedRows.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
      if (!completedRows.length) {
        completedBody.innerHTML = '';
        completedEmpty.hidden = false;
      } else {
        completedEmpty.hidden = true;
        completedBody.innerHTML = completedRows.map((item) => `<tr>
          <td>${escapeHtml(item.type)}</td>
          <td>${escapeHtml(item.email)}</td>
          <td>${escapeHtml(item.role)}</td>
          <td>${escapeHtml(item.userType)}</td>
          <td>${formatDateTime(item.completedAt)}</td>
          <td>${statusPill(item.status)}</td>
          <td>${item.action || '—'}</td>
        </tr>`).join('');
      }
    }
  }

  function updateSummaryCards() {
    const activeAccounts = allAccounts.filter((a) => !['Completed', 'Archived'].includes(a.status)).length;
    const filesNeedingAction = allDocuments.filter((d) => {
      const sigState = d.signature_status || (d.signed ? 'signed' : (d.requires_signature ? 'pending_signature' : 'available'));
      return sigState === 'pending_signature' || sigState === 'uploaded' || d.status === 'Not Reviewed Yet';
    }).length;
    const openMaintenance = allMaintenanceRequests.filter((m) => m.status !== 'Completed').length;
    const openMessages = allMessages.filter((m) => m.status !== 'Completed').length
      + (allLeads.contact || []).filter((l) => normalizeLeadStatus(l.admin_status) !== 'Completed').length
      + (allLeads.showing || []).filter((l) => normalizeLeadStatus(l.admin_status) !== 'Completed').length
      + (allLeads.renovation || []).filter((l) => normalizeLeadStatus(l.status) !== 'Completed').length;
    const openSigRequests = allSigRequests.filter((s) => !['Signed', 'Declined', 'Expired'].includes(s.status)).length;
    const sellerTasks = allTasks.filter((t) => t.task_type !== 'Maintenance Request' && !isCompletedStatus(t.status) && t.status !== 'Archived').length;
    const completedTasks = allTasks.filter((t) => isCompletedStatus(t.status)).length
      + allMaintenanceRequests.filter((m) => isCompletedStatus(m.status)).length
      + allAccounts.filter((a) => isCompletedStatus(a.status)).length
      + allMessages.filter((m) => isCompletedStatus(m.status)).length
      + allDocuments.filter((d) => isCompletedStatus(d.status)).length
      + allSigRequests.filter((s) => isSignatureCompletedStatus(s.status)).length
      + (allLeads.contact || []).filter((l) => normalizeLeadStatus(l.admin_status) === 'Completed').length
      + (allLeads.showing || []).filter((l) => normalizeLeadStatus(l.admin_status) === 'Completed').length
      + (allLeads.renovation || []).filter((l) => normalizeLeadStatus(l.status) === 'Completed').length;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    set('summary-accounts', activeAccounts);
    set('summary-files', filesNeedingAction);
    set('summary-maintenance', openMaintenance);
    set('summary-messages', openMessages);
    set('summary-signatures', openSigRequests);
    set('summary-seller-tasks', sellerTasks);
    set('summary-completed-tasks', completedTasks);
    renderDashboardWorkspace();
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
      statusEl.textContent = 'Invitation failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message);
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
    const submitBtn = document.getElementById('property-submit-btn');
    const statusEl = document.getElementById('property-status');
    if (!form || !statusEl) return;
    const propertyAddress = form.querySelector('[name="property_address"]').value.trim();
    const visibility = form.querySelector('[name="visibility"]').value;
    const propertyId = form.dataset.editId || form.querySelector('[name="property_id"]').value || null;
    const photoFiles = Array.from(form.querySelector('[name="property_photos"]')?.files || []);
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
    if (submitBtn) submitBtn.disabled = true;
    statusEl.className = 'form-status';
    statusEl.textContent = 'Saving…';
    try {
      let savedProperty = getPropertyById(propertyId);
      let dbError = null;
      if (propertyId) {
        const { data, error } = await supabaseClient.from('properties').update(payload).eq('id', propertyId).select().single();
        savedProperty = data || savedProperty;
        dbError = error;
      } else {
        const { data, error } = await supabaseClient.from('properties').insert([payload]).select().single();
        savedProperty = data || savedProperty;
        dbError = error;
      }
      if (dbError) {
        console.error('Property save error:', dbError);
        statusEl.className = 'form-status error-message';
        statusEl.textContent = 'Failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(dbError) : dbError.message);
        return;
      }
      if (!savedProperty?.id) {
        statusEl.className = 'form-status error-message';
        statusEl.textContent = 'Property saved successfully, but could not load the record for photo upload. Please refresh and try uploading photos again.';
        await loadPropertiesData();
        renderProperties();
        renderUsers();
        return;
      }
      if (photoFiles.length) {
        try {
          const photoPayload = await uploadPropertyPhotos(savedProperty.id, photoFiles, function (fileName, index, total) {
            setFormStatus(statusEl, '', `Uploading photo ${index} of ${total}: ${fileName}`);
          });
          if (photoPayload.uploaded_files?.length) {
            try {
              await insertPropertyPhotoDocuments(savedProperty.id, photoPayload.uploaded_files);
            } catch (error) {
              if (photoPayload.uploaded_paths?.length) {
                await supabaseClient.storage.from(STORAGE_BUCKETS.PROPERTY_IMAGES).remove(photoPayload.uploaded_paths);
              }
              throw error;
            }
          }
        } catch (error) {
          console.error('Photo upload error:', error);
          setFormStatus(statusEl, 'error-message', `Property saved, but photo upload failed: ${error.message}. You can retry uploading photos by editing this property.`);
          await loadPropertiesData();
          renderProperties();
          renderUsers();
          return;
        }
      }
      statusEl.className = 'form-status success-message';
      statusEl.textContent = propertyId ? 'Property updated.' : 'Property saved.';
      resetPropertyForm({ preserveStatus: true });
      await Promise.all([loadPropertiesData(), loadDocumentsData()]);
      renderProperties();
      renderDocuments();
      renderUsers();
      updateSummaryCards();
      setTimeout(() => {
        closeModal('property');
        resetPropertyForm();
      }, 1200);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
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
      priority: form.querySelector('[name="priority"]').value || 'Medium',
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
      statusEl.textContent = 'Failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message);
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
    const submitBtn = form?.querySelector('button[type="submit"]');
    const files = Array.from(fileInput?.files || []);
    if (!files.length) return setFormStatus(statusEl, 'error-message', 'Select at least one file.');
    for (const file of files) {
      const validationError = getSupabaseFileValidationError(file, {
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
        maxSizeMb: MAX_FILE_SIZE_MB
      });
      if (validationError) return setFormStatus(statusEl, 'error-message', `"${file.name}": ${validationError}`);
    }
    const accountId = form.querySelector('[name="account_id"]').value || null;
    const account = getAccountById(accountId);
    const selectedClientId = form.querySelector('[name="client_id"]').value || null;
    const clientId = resolveUploadClientId(accountId, selectedClientId);
    const propertyId = account?.property_id || form.querySelector('[name="property_id"]').value || null;
    const visibility = form.querySelector('[name="visibility"]').value;
    const isPublicPropertyImage = document.getElementById('upload-public-image')?.checked;
    const requiresSignature = !isPublicPropertyImage && document.getElementById('upload-requires-sig').checked;
    const property = propertyId ? getPropertyById(propertyId) : null;
    const isPublicProperty = property ? (property.visibility === 'public' || property.is_public === true) : false;
    if (isPublicPropertyImage && !propertyId) {
      return setFormStatus(statusEl, 'error-message', 'Select a property before marking a file as a public property image.');
    }
    if (isPublicPropertyImage && property && !isPublicProperty) {
      return setFormStatus(statusEl, 'error-message', 'Only public properties can receive public listing images.');
    }
    const canClientEdit = !isPublicPropertyImage && (document.getElementById('upload-client-edit').checked || requiresSignature);
    const canClientView = !isPublicPropertyImage && visibility !== 'admin_only';
    const bucketName = isPublicPropertyImage
      ? STORAGE_BUCKETS.PROPERTY_IMAGES
      : (accountId ? STORAGE_BUCKETS.ACCOUNT_FILES : STORAGE_BUCKETS.CLIENT_DOCUMENTS);
    if (submitBtn) submitBtn.disabled = true;
    const sharedSignatureUrl = form.querySelector('[name="signature_url"]').value.trim();
    const sharedNotes = form.querySelector('[name="notes"]').value.trim() || null;
    const uploadedPaths = [];
    const insertedDocumentIds = [];
    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        setFormStatus(statusEl, '', `Uploading file ${fileIndex + 1} of ${files.length}: ${file.name}`);
        const filePath = buildStoragePath(bucketName, {
          accountId,
          clientId,
          propertyId,
          fileName: file.name
        });
        const { error: storageError } = await supabaseClient.storage.from(bucketName).upload(filePath, file);
        if (storageError) throw new Error(`"${file.name}": ${storageError.message}`);
        uploadedPaths.push(filePath);
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
          category: isPublicPropertyImage ? 'Property Photo' : (form.querySelector('[name="category"]').value || 'Other'),
          visibility: isPublicPropertyImage ? 'admin_only' : visibility,
          can_client_view: canClientView,
          can_client_edit: canClientEdit,
          requires_signature: requiresSignature,
          signature_provider: form.querySelector('[name="signature_provider"]').value || null,
          signature_status: form.querySelector('[name="signature_status"]').value || (requiresSignature ? 'pending_signature' : 'available'),
          signature_url: sharedSignatureUrl || null,
          status: 'Not Reviewed Yet',
          priority: 'Medium',
          notes: sharedNotes,
          hidden: false,
          updated_at: nowIso()
        };
        const { data: insertedDocument, error: dbError } = await supabaseClient.from('documents').insert([payload]).select('id').single();
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
      if (submitBtn) submitBtn.disabled = false;
      setFormStatus(statusEl, 'error-message', 'Upload failed: ' + error.message);
      await Promise.all([loadDocumentsData(), loadPropertiesData()]);
      renderDocuments();
      renderProperties();
      updateSummaryCards();
      return;
    }
    if (submitBtn) submitBtn.disabled = false;
    setFormStatus(statusEl, 'success-message', `${files.length} file${files.length === 1 ? '' : 's'} uploaded successfully.`);
    form.reset();
    await Promise.all([loadDocumentsData(), loadPropertiesData()]);
    renderDocuments();
    renderProperties();
    updateSummaryCards();
    setTimeout(() => closeModal('upload'), 1200);
  }

  async function handleAddTask(event) {
    event.preventDefault();
    const form = document.getElementById('task-form');
    const statusEl = document.getElementById('task-status-message');
    const title = form.querySelector('[name="title"]').value.trim();
    if (!title) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Task title is required.';
      return;
    }
    const isEdit = !!form.dataset.editId;
    const payload = {
      title,
      task_type: form.querySelector('[name="task_type"]').value || 'General Message',
      status: form.querySelector('[name="status"]').value || 'Not Reviewed Yet',
      priority: form.querySelector('[name="priority"]').value || 'Medium',
      account_id: form.querySelector('[name="account_id"]').value || null,
      user_id: form.querySelector('[name="user_id"]').value || null,
      property_id: form.querySelector('[name="property_id"]').value || null,
      due_date: form.querySelector('[name="due_date"]').value || null,
      description: form.querySelector('[name="description"]').value.trim() || null,
      user_visible_notes: form.querySelector('[name="user_visible_notes"]').value.trim() || null,
      internal_notes: form.querySelector('[name="internal_notes"]').value.trim() || null,
      updated_at: nowIso(),
      completed_at: isCompletedStatus(form.querySelector('[name="status"]').value) ? nowIso() : null
    };
    let error;
    if (isEdit) {
      ({ error } = await supabaseClient.from('tasks').update(payload).eq('id', form.dataset.editId));
    } else {
      ({ error } = await supabaseClient.from('tasks').insert([payload]));
    }
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message);
      return;
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = isEdit ? 'Task updated.' : 'Task created.';
    form.reset();
    delete form.dataset.editId;
    document.getElementById('task-modal-title').textContent = 'New Task';
    await loadTasksData();
    renderTasks();
    updateSummaryCards();
    setTimeout(() => closeModal('task'), 1200);
  }

  function openEditTaskModal(taskId) {
    const task = allTasks.find((t) => t.id === taskId);
    if (!task) return;
    const form = document.getElementById('task-form');
    form.dataset.editId = taskId;
    document.getElementById('task-modal-title').textContent = 'Edit Task';
    form.querySelector('[name="title"]').value = task.title || '';
    form.querySelector('[name="task_type"]').value = task.task_type || 'General Message';
    form.querySelector('[name="status"]').value = task.status || 'Not Reviewed Yet';
    form.querySelector('[name="priority"]').value = task.priority || 'Medium';
    form.querySelector('[name="account_id"]').value = task.account_id || '';
    form.querySelector('[name="user_id"]').value = task.user_id || '';
    form.querySelector('[name="property_id"]').value = task.property_id || '';
    form.querySelector('[name="due_date"]').value = task.due_date || '';
    form.querySelector('[name="description"]').value = task.description || '';
    form.querySelector('[name="user_visible_notes"]').value = task.user_visible_notes || '';
    form.querySelector('[name="internal_notes"]').value = task.internal_notes || '';
    document.getElementById('task-status-message').textContent = '';
    openModal('task');
  }

  async function deleteTask(taskId) {
    if (!window.confirm('Delete this task? This cannot be undone.')) return;
    const { error } = await supabaseClient.from('tasks').delete().eq('id', taskId);
    if (error) return window.alert(error.message);
    await loadTasksData();
    renderTasks();
    updateSummaryCards();
  }

  async function handleAddSigRequest(event) {
    event.preventDefault();
    const form = document.getElementById('sig-request-form');
    const statusEl = document.getElementById('sig-request-status');
    const title = form.querySelector('[name="title"]').value.trim();
    if (!title) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Title is required.';
      return;
    }
    const payload = {
      title,
      account_id: form.querySelector('[name="account_id"]').value || null,
      user_id: form.querySelector('[name="user_id"]').value || null,
      provider: form.querySelector('[name="provider"]').value || null,
      status: form.querySelector('[name="status"]').value || 'Signature Needed',
      signature_url: form.querySelector('[name="signature_url"]').value.trim() || null,
      admin_notes: form.querySelector('[name="admin_notes"]').value.trim() || null,
      updated_at: nowIso(),
      completed_at: isSignatureCompletedStatus(form.querySelector('[name="status"]').value) ? nowIso() : null
    };
    const { error } = await supabaseClient.from('signature_requests').insert([payload]);
    if (error) {
      statusEl.className = 'form-status error-message';
      statusEl.textContent = 'Failed: ' + (typeof formatSupabaseSchemaError === 'function' ? formatSupabaseSchemaError(error) : error.message);
      return;
    }
    statusEl.className = 'form-status success-message';
    statusEl.textContent = 'Signature request created.';
    form.reset();
    await loadSigRequestsData();
    renderSigRequests();
    updateSummaryCards();
    setTimeout(() => closeModal('sig-request'), 1200);
  }

  async function autoSaveTask(rowEl, field, value) {
    const taskId = rowEl.closest('tr')?.getAttribute('data-task-id');
    if (!taskId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const nowCompleted = field === 'status' && isCompletedStatus(value);
    const wasCompleted = isCompletedStatus(allTasks.find((t) => t.id === taskId)?.status);
    const { error } = await supabaseClient.from('tasks').update({
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', taskId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const task = allTasks.find((t) => t.id === taskId);
    if (task) {
      task[field] = value;
      if (nowCompleted) task.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) task.completed_at = null;
    }
    if (field === 'status') renderTasks();
    updateSummaryCards();
  }

  async function autoSaveMessage(rowEl, field, value) {
    const msgId = rowEl.closest('tr')?.getAttribute('data-message-id');
    if (!msgId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const nowCompleted = field === 'status' && isCompletedStatus(value);
    const wasCompleted = isCompletedStatus(allMessages.find((m) => m.id === msgId)?.status);
    const { error } = await supabaseClient.from('messages').update({
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', msgId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const msg = allMessages.find((m) => m.id === msgId);
    if (msg) {
      msg[field] = value;
      if (nowCompleted) msg.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) msg.completed_at = null;
    }
    if (field === 'status') renderMessages();
    updateSummaryCards();
  }

  async function autoSaveSigRequest(rowEl, field, value) {
    const sigId = rowEl.closest('tr')?.getAttribute('data-sig-id');
    if (!sigId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const nowCompleted = field === 'status' && isSignatureCompletedStatus(value);
    const wasCompleted = isSignatureCompletedStatus(allSigRequests.find((s) => s.id === sigId)?.status);
    const { error } = await supabaseClient.from('signature_requests').update({
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', sigId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const sig = allSigRequests.find((s) => s.id === sigId);
    if (sig) {
      sig[field] = value;
      if (nowCompleted) sig.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) sig.completed_at = null;
    }
    if (field === 'status') renderSigRequests();
    updateSummaryCards();
  }

  async function autoSaveDocument(rowEl, field, value) {
    const docId = getElementDataId(rowEl, 'data-document-id');
    if (!docId) return;
    const indicatorEl = rowEl.closest('.account-file-item')?.querySelector('.autosave-indicator')
      || rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const nowCompleted = field === 'status' && isCompletedStatus(value);
    const wasCompleted = isCompletedStatus(allDocuments.find((item) => item.id === docId)?.status);
    const payload = {
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    };
    if (field === 'visibility') payload.can_client_view = value !== 'admin_only';
    const { error } = await supabaseClient.from('documents').update(payload).eq('id', docId);
    if (error) return setAutosaveState(indicatorEl, 'error', error.message);
    setAutosaveState(indicatorEl, 'saved');
    const doc = allDocuments.find((item) => item.id === docId);
    if (doc) {
      doc[field] = value;
      if (field === 'visibility') doc.can_client_view = value !== 'admin_only';
      if (nowCompleted) doc.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) doc.completed_at = null;
    }
    updateSummaryCards();
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

  async function autoSaveUser(rowEl, field, value) {
    const userId = rowEl.closest('tr')?.getAttribute('data-user-id');
    if (!userId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const { error } = await supabaseClient.from('profiles').update({ [field]: value, updated_at: nowIso() }).eq('id', userId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const user = allUsers.find((u) => u.id === userId);
    if (user) user[field] = value;
    if (field === 'role' || field === 'status') renderUsers();
  }

  async function autoSaveUserAssignments(inputEl, group) {
    const userId = inputEl.getAttribute('data-user-id');
    const assignmentGroup = group || inputEl.getAttribute('data-assignment-group');
    if (!userId || !assignmentGroup) return;
    const indicatorEl = inputEl.closest('td')?.querySelector('.autosave-indicator');
    const selectedIds = Array.from(inputEl.selectedOptions || []).map((option) => option.value).filter(Boolean);
    setAutosaveState(indicatorEl, 'saving');
    if (assignmentGroup === 'properties') {
      const { error: deleteError } = await supabaseClient.from('client_property_assignments').delete().eq('client_id', userId);
      if (deleteError) return setAutosaveState(indicatorEl, 'error', deleteError.message);
      if (selectedIds.length) {
        const { error: insertError } = await supabaseClient.from('client_property_assignments').insert(selectedIds.map((propertyId) => ({ client_id: userId, property_id: propertyId })));
        if (insertError) return setAutosaveState(indicatorEl, 'error', insertError.message);
      }
      allPropertyAssignments = allPropertyAssignments.filter((assignment) => assignment.client_id !== userId)
        .concat(selectedIds.map((propertyId) => ({ client_id: userId, property_id: propertyId })));
    } else {
      const { error: deleteError } = await supabaseClient.from('account_clients').delete().eq('client_id', userId);
      if (deleteError) return setAutosaveState(indicatorEl, 'error', deleteError.message);
      if (selectedIds.length) {
        const { error: insertError } = await supabaseClient.from('account_clients').insert(selectedIds.map((accountId) => ({ account_id: accountId, client_id: userId })));
        if (insertError) return setAutosaveState(indicatorEl, 'error', insertError.message);
      }
      allAccountAssignments = allAccountAssignments.filter((assignment) => assignment.client_id !== userId)
        .concat(selectedIds.map((accountId) => ({ account_id: accountId, client_id: userId })));
    }
    setAutosaveState(indicatorEl, 'saved');
    renderUsers();
    renderProperties();
    renderAccounts();
    updateSummaryCards();
  }

  async function autoSaveProperty(rowEl, field, value) {
    const propertyId = rowEl.closest('tr')?.getAttribute('data-property-id');
    if (!propertyId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const dbField = field === 'visibility' ? 'visibility' : field;
    const extraFields = field === 'visibility' ? { is_public: value === 'public' } : {};
    const { error } = await supabaseClient.from('properties').update({ [dbField]: value, ...extraFields, updated_at: nowIso() }).eq('id', propertyId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const prop = allProperties.find((p) => p.id === propertyId);
    if (prop) { prop[field] = value; if (field === 'visibility') prop.is_public = value === 'public'; }
  }

  async function autoSaveAccount(rowEl, field, value) {
    const accountId = rowEl.closest('tr')?.getAttribute('data-account-id');
    if (!accountId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const wasCompleted = allAccounts.find((a) => a.id === accountId)?.status === 'Completed';
    const nowCompleted = field === 'status' && value === 'Completed';
    const { error } = await supabaseClient.from('accounts').update({
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', accountId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const account = allAccounts.find((a) => a.id === accountId);
    if (account) {
      account[field] = value;
      if (nowCompleted) account.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) account.completed_at = null;
    }
    if (field === 'status') renderAccounts();
    updateSummaryCards();
  }

  async function autoSaveMaintenance(rowEl, field, value) {
    const maintenanceId = getElementDataId(rowEl, 'data-maintenance-id');
    if (!maintenanceId) return;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const wasCompleted = isCompletedStatus(allMaintenanceRequests.find((m) => m.id === maintenanceId)?.status);
    const nowCompleted = field === 'status' && isCompletedStatus(value);
    const { error } = await supabaseClient.from('maintenance_requests').update({
      [field]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', maintenanceId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const req = allMaintenanceRequests.find((m) => m.id === maintenanceId);
    if (req) {
      req[field] = value;
      if (nowCompleted) req.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) req.completed_at = null;
    }
    if (field === 'status' || field === 'property_id') renderMaintenanceTables();
    updateSummaryCards();
  }

  async function autoSaveLead(rowEl, sectionKey, field, value) {
    const rowId = rowEl.closest('tr')?.getAttribute('data-row-id');
    if (!rowId) return;
    // Determine actual DB section (property tab rows live in contact table)
    const dbSection = sectionKey === 'property' ? 'contact' : sectionKey;
    const config = LEAD_SECTIONS[dbSection] || LEAD_SECTIONS.contact;
    const indicatorEl = rowEl.closest('td')?.querySelector('.autosave-indicator');
    setAutosaveState(indicatorEl, 'saving');
    const dbField = field === 'status' ? config.statusField : field === 'priority' ? 'priority' : config.notesField;
    const wasCompleted = (allLeads[dbSection] || []).find((r) => r.id === rowId)?.[config.statusField] === 'Completed';
    const nowCompleted = field === 'status' && value === 'Completed';
    const { error } = await supabaseClient.from(config.table).update({
      [dbField]: value,
      updated_at: nowIso(),
      completed_at: nowCompleted ? nowIso() : (wasCompleted && field === 'status' ? null : undefined)
    }).eq('id', rowId);
    if (error) { setAutosaveState(indicatorEl, 'error', error.message); return; }
    setAutosaveState(indicatorEl, 'saved');
    const rows = allLeads[dbSection] || [];
    const row = rows.find((r) => r.id === rowId);
    if (row) {
      row[dbField] = value;
      if (nowCompleted) row.completed_at = new Date().toISOString();
      if (field === 'status' && !nowCompleted && wasCompleted) row.completed_at = null;
    }
    if (field === 'status') {
      renderLeadSection(sectionKey);
      if (sectionKey === 'property' || sectionKey === 'contact') {
        renderLeadSection('contact');
        renderLeadSection('property');
      }
      renderCompletedLeads();
    }
    updateSummaryCards();
  }

  function openMaintenanceDetail(requestId) {
    const request = allMaintenanceRequests.find((item) => item.id === requestId);
    const body = document.getElementById('maintenance-detail-body');
    if (!request || !body) return;
    const files = getMaintenanceFiles(request.id);
    const priorityOptions = MAINTENANCE_PRIORITIES.map((priority) => `<option value="${escapeHtml(priority)}"${priority === (request.priority || 'Medium') ? ' selected' : ''}>${escapeHtml(priority)}</option>`).join('');
    const statusOptions = MAINTENANCE_STATUSES.map((status) => `<option value="${escapeHtml(status)}"${status === (request.status || 'Not Reviewed Yet') ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('');
    body.innerHTML = `<div class="maintenance-detail-grid">
      <section class="maintenance-detail-card"><h3>Property</h3><p>${escapeHtml(getPropertyById(request.property_id)?.property_address || 'Unassigned')}</p></section>
      <section class="maintenance-detail-card"><h3>Account</h3><p>${escapeHtml(getAccountById(request.account_id)?.account_name || 'Unassigned')}</p></section>
      <section class="maintenance-detail-card"><h3>Client</h3><p>${escapeHtml(getUserById(request.client_id)?.full_name || getUserById(request.client_id)?.email || 'N/A')}</p></section>
      <section class="maintenance-detail-card"><h3>Priority</h3><select class="dashboard-inline-select" data-maint-detail-priority data-maintenance-id="${escapeHtml(request.id)}">${priorityOptions}</select><span class="autosave-indicator" aria-live="polite"></span></section>
      <section class="maintenance-detail-card"><h3>Status</h3><select class="dashboard-inline-select" data-maint-detail-status data-maintenance-id="${escapeHtml(request.id)}">${statusOptions}</select><span class="autosave-indicator" aria-live="polite"></span></section>
      <section class="maintenance-detail-card"><h3>Description</h3><p>${escapeHtml(request.description || 'No description provided.')}</p></section>
    </div>
    <section class="maintenance-detail-card">
      <h3>Admin Comments</h3>
      <p>${escapeHtml(request.admin_comments || 'No admin comments yet.')}</p>
    </section>
    <section class="maintenance-detail-card">
      <h3>Attached Files</h3>
      ${files.length ? `<div class="workspace-list">${files.map((file) => `<div class="workspace-list-item"><div class="workspace-list-item-header"><strong>${escapeHtml(file.file_name)}</strong></div><div class="workspace-file-actions"><button class="action-link" data-action="open-maint-file" data-id="${escapeHtml(file.id)}" type="button">Open</button><button class="action-link" data-action="download-maint-file" data-id="${escapeHtml(file.id)}" type="button">Download</button></div></div>`).join('')}</div>` : '<p class="workspace-empty">No attached files.</p>'}
    </section>`;
    openModal('maintenance-detail');
  }

  async function viewAccountFiles(accountId) {
    const account = allAccounts.find((a) => a.id === accountId);
    if (!account) return;
    const modal = document.getElementById('account-files-modal');
    const titleEl = document.getElementById('account-files-title');
    const listEl = document.getElementById('account-files-list');
    if (!modal || !listEl) return;
    if (titleEl) titleEl.textContent = `Files — ${account.account_name}`;
    listEl.innerHTML = '<p class="table-hint">Loading…</p>';
    openModal('account-files');
    const { data: docs, error } = await supabaseClient.from('documents').select('*').eq('account_id', accountId).order('created_at', { ascending: false });
    if (error) { listEl.innerHTML = `<p class="form-status error-message">${escapeHtml(error.message)}</p>`; return; }
    if (!docs || !docs.length) { listEl.innerHTML = '<p class="table-hint">No files uploaded to this account yet.</p>'; return; }
    listEl.innerHTML = docs.map((doc) => `<div class="account-file-item" data-document-id="${escapeHtml(doc.id)}">
      <button class="action-link account-file-name" data-action="open-doc" data-id="${escapeHtml(doc.id)}" type="button" aria-label="Open file ${escapeHtml(doc.file_name || doc.file_path || 'Unnamed file')}">${escapeHtml(doc.file_name || doc.file_path || 'Unnamed file')}</button>
      <div class="account-file-meta">${escapeHtml(doc.file_type || '')} · ${formatDateTime(doc.created_at)}</div>
      <div class="account-file-meta">
        <label>Visibility
          <select class="dashboard-inline-select" data-account-doc-visibility>
            <option value="admin_only"${doc.visibility === 'admin_only' ? ' selected' : ''}>Admin Only</option>
            <option value="client_visible"${doc.visibility === 'client_visible' ? ' selected' : ''}>Client Can View</option>
            <option value="client_downloadable"${doc.visibility === 'client_downloadable' ? ' selected' : ''}>Client Can Download</option>
          </select>
        </label>
        <label>Status
          <select class="dashboard-inline-select" data-account-doc-status>
            ${TASK_STATUSES.map((status) => `<option value="${escapeHtml(status)}"${status === (doc.status || 'Not Reviewed Yet') ? ' selected' : ''}>${escapeHtml(status)}</option>`).join('')}
          </select>
        </label>
        <label>Signature
          <select class="dashboard-inline-select" data-account-doc-signature>
            ${Object.entries(SIGNATURE_STATUS_LABELS).map(([key, label]) => `<option value="${escapeHtml(key)}"${(doc.signature_status || 'available') === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
          </select>
        </label>
        <span class="autosave-indicator" aria-live="polite"></span>
      </div>
      <div class="table-actions">
        <button class="action-link" data-action="download-doc" data-id="${escapeHtml(doc.id)}" type="button">Download</button>
        <button class="action-link" data-action="edit-signature" data-id="${escapeHtml(doc.id)}" type="button">Signature</button>
        <button class="action-link" data-action="delete-doc" data-id="${escapeHtml(doc.id)}" type="button">Delete</button>
      </div>
    </div>`).join('');
    // Replace listEl with a clone to remove any previously attached listeners
    const freshList = listEl.cloneNode(true);
    listEl.parentNode.replaceChild(freshList, listEl);
    freshList.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      handleDocumentAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });
    freshList.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-account-doc-visibility')) autoSaveDocument(el, 'visibility', el.value);
      if (el.hasAttribute('data-account-doc-status')) autoSaveDocument(el, 'status', el.value);
      if (el.hasAttribute('data-account-doc-signature')) autoSaveDocument(el, 'signature_status', el.value);
    });
    const uploadBtn = document.getElementById('account-files-upload-btn');
    if (uploadBtn) {
      const freshUploadBtn = uploadBtn.cloneNode(true);
      uploadBtn.parentNode.replaceChild(freshUploadBtn, uploadBtn);
      freshUploadBtn.addEventListener('click', () => {
        closeModal('account-files');
        document.getElementById('upload-form')?.reset();
        setFormStatus(document.getElementById('upload-status'), '', '');
        document.getElementById('upload-account').value = accountId;
        applyUploadAccountDefaults(accountId);
        openModal('upload');
      });
    }
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
    if (action === 'edit-property') {
      openPropertyEditor(propertyId);
      return;
    }
    if (action !== 'delete-property') return;
    if (!window.confirm('Delete this property? This cannot be undone.')) return;
    const photoDocs = allDocuments.filter((doc) => doc.property_id === propertyId && doc.category === 'Property Photo');
    const photoDocIds = photoDocs.map((doc) => doc.id).filter(Boolean);
    const photoPaths = photoDocs.map((doc) => doc.file_path).filter(Boolean);
    const { error } = await supabaseClient.from('properties').delete().eq('id', propertyId);
    if (error) return window.alert(error.message);
    if (photoDocIds.length) {
      await supabaseClient.from('documents').delete().in('id', photoDocIds);
    }
    if (photoPaths.length) {
      const { error: storageError } = await supabaseClient.storage.from(STORAGE_BUCKETS.PROPERTY_IMAGES).remove(photoPaths);
      if (storageError) {
        window.alert(`Property deleted, but some photo files could not be removed: ${storageError.message}`);
      }
    }
    await loadPropertiesData();
    renderProperties();
    renderUsers();
  }

  async function handleAccountAction(action, accountId) {
    if (action === 'view-account-files') {
      viewAccountFiles(accountId);
      return;
    }
    if (action === 'account-upload') {
      document.getElementById('upload-form')?.reset();
      setFormStatus(document.getElementById('upload-status'), '', '');
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
    document.getElementById('open-property-modal')?.addEventListener('click', () => {
      resetPropertyForm();
      openModal('property');
    });
    document.getElementById('open-account-modal')?.addEventListener('click', () => openModal('account'));
    document.getElementById('open-upload-modal')?.addEventListener('click', () => {
      document.getElementById('upload-form')?.reset();
      setFormStatus(document.getElementById('upload-status'), '', '');
      openModal('upload');
    });
    document.getElementById('open-task-modal')?.addEventListener('click', () => {
      const form = document.getElementById('task-form');
      if (form) { form.reset(); delete form.dataset.editId; }
      document.getElementById('task-modal-title').textContent = 'New Task';
      document.getElementById('task-status-message').textContent = '';
      openModal('task');
    });
    document.getElementById('open-sig-request-modal')?.addEventListener('click', () => openModal('sig-request'));
    document.getElementById('upload-account')?.addEventListener('change', function () { applyUploadAccountDefaults(this.value); });
    document.getElementById('invite-form')?.addEventListener('submit', handleInvite);
    document.getElementById('property-form')?.addEventListener('submit', handleAddProperty);
    document.getElementById('account-form')?.addEventListener('submit', handleAddAccount);
    document.getElementById('upload-form')?.addEventListener('submit', handleUpload);
    document.getElementById('task-form')?.addEventListener('submit', handleAddTask);
    document.getElementById('sig-request-form')?.addEventListener('submit', handleAddSigRequest);
    document.getElementById('property-assignment-form')?.addEventListener('submit', savePropertyAssignments);
    document.getElementById('account-assignment-form')?.addEventListener('submit', saveAccountAssignments);
    document.getElementById('user-search')?.addEventListener('input', renderUsers);
    document.getElementById('admin-filter-visibility')?.addEventListener('change', renderDocuments);
    document.getElementById('admin-filter-signed')?.addEventListener('change', renderDocuments);
    document.getElementById('task-filter-type')?.addEventListener('change', renderTasks);
    document.getElementById('task-filter-status')?.addEventListener('change', renderTasks);
    document.getElementById('message-filter-status')?.addEventListener('change', renderMessages);
    document.getElementById('sig-filter-status')?.addEventListener('change', renderSigRequests);

    // ── Summary card navigation ───────────────────────────────────────────────
    document.querySelectorAll('.summary-card-link[data-tab-target]').forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveMainTab(btn.getAttribute('data-tab-target'));
        updateTabParams({ tab: btn.getAttribute('data-tab-target') });
      });
    });
    document.querySelectorAll('.summary-card-link[data-dashboard-target]').forEach((btn) => {
      btn.addEventListener('click', function () {
        setActiveMainTab('dashboard');
        updateTabParams({ tab: 'dashboard' });
        const target = document.querySelector(`[data-dashboard-section="${btn.getAttribute('data-dashboard-target')}"]`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ── Autosave: Users ──────────────────────────────────────────────────────
    ['users-active-tbody', 'users-inactive-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('change', function (event) {
        const el = event.target;
        if (el.hasAttribute('data-user-role')) autoSaveUser(el, 'role', el.value);
        if (el.hasAttribute('data-user-type')) autoSaveUser(el, 'user_type', normalizeUserType(el.value));
        if (el.hasAttribute('data-user-status')) autoSaveUser(el, 'status', el.value);
        if (el.hasAttribute('data-user-assignments')) {
          autoSaveUserAssignments(el, el.getAttribute('data-assignment-group'));
        }
      });
    });

    // ── Autosave: Properties ─────────────────────────────────────────────────
    document.getElementById('properties-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-prop-status')) autoSaveProperty(el, 'property_status', el.value);
      if (el.hasAttribute('data-prop-visibility')) autoSaveProperty(el, 'visibility', el.value);
    });
    document.getElementById('properties-tbody')?.addEventListener('input', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-prop-notes')) debouncedUpdate(el, 650, () => autoSaveProperty(el, 'notes', el.value.trim() || null));
    });

    // ── Autosave: Accounts ───────────────────────────────────────────────────
    ['accounts-active-tbody', 'accounts-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('change', function (event) {
        const el = event.target;
        if (el.hasAttribute('data-account-status')) autoSaveAccount(el, 'status', el.value);
        if (el.hasAttribute('data-account-priority')) autoSaveAccount(el, 'priority', el.value);
      });
      document.getElementById(tbodyId)?.addEventListener('input', function (event) {
        const el = event.target;
        if (el.hasAttribute('data-account-notes')) debouncedUpdate(el, 650, () => autoSaveAccount(el, 'internal_notes', el.value.trim() || null));
      });
    });

    // ── Autosave: Tasks ──────────────────────────────────────────────────────
    document.getElementById('tasks-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-task-status')) autoSaveTask(el, 'status', el.value);
    });

    // ── Autosave: Messages ───────────────────────────────────────────────────
    document.getElementById('messages-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-message-status')) autoSaveMessage(el, 'status', el.value);
      if (el.hasAttribute('data-message-priority')) autoSaveMessage(el, 'priority', el.value);
    });
    document.getElementById('messages-tbody')?.addEventListener('input', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-message-notes')) debouncedUpdate(el, 650, () => autoSaveMessage(el, 'admin_notes', el.value.trim() || null));
    });

    // ── Autosave: Signature Requests ─────────────────────────────────────────
    document.getElementById('sig-requests-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-sig-status')) autoSaveSigRequest(el, 'status', el.value);
    });
    document.getElementById('sig-requests-tbody')?.addEventListener('input', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-sig-notes')) debouncedUpdate(el, 650, () => autoSaveSigRequest(el, 'admin_notes', el.value.trim() || null));
    });

    // ── Autosave: Maintenance ────────────────────────────────────────────────
    ['maintenance-active-tbody', 'maintenance-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('change', function (event) {
        const el = event.target;
        if (el.hasAttribute('data-maint-priority')) autoSaveMaintenance(el, 'priority', el.value);
        if (el.hasAttribute('data-maint-status')) autoSaveMaintenance(el, 'status', el.value);
      });
      document.getElementById(tbodyId)?.addEventListener('input', function (event) {
        const el = event.target;
        if (el.hasAttribute('data-maint-comments')) debouncedUpdate(el, 650, () => autoSaveMaintenance(el, 'admin_comments', el.value.trim() || null));
      });
    });

    ['users-active-tbody', 'users-inactive-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const userId = button.getAttribute('data-id');
        if (action === 'view-client') window.location.href = `client-portal.html?view_as_client=${encodeURIComponent(userId)}`;
      });
    });

    document.getElementById('properties-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'open-doc' || action === 'download-doc') return handleDocumentAction(action, id);
      handlePropertyAction(action, id);
    });

    ['accounts-active-tbody', 'accounts-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const id = button.getAttribute('data-id');
        if (action === 'open-doc' || action === 'download-doc') return handleDocumentAction(action, id);
        handleAccountAction(action, id);
      });
    });

    document.getElementById('documents-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (button) handleDocumentAction(button.getAttribute('data-action'), button.getAttribute('data-id'));
    });
    document.getElementById('documents-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-document-status')) autoSaveDocument(el, 'status', el.value);
    });
    document.getElementById('tab-dashboard')?.addEventListener('click', function (event) {
      const tabButton = event.target.closest('[data-tab-target]');
      if (tabButton) {
        const tabKey = tabButton.getAttribute('data-tab-target');
        setActiveMainTab(tabKey);
        updateTabParams({ tab: tabKey });
      }
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'open-doc' || action === 'download-doc') handleDocumentAction(action, id);
      if (action === 'open-maintenance') openMaintenanceDetail(id);
      if (action === 'edit-task') openEditTaskModal(id);
    });
    document.getElementById('dashboard-maintenance-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-dash-maint-status')) autoSaveMaintenance(el, 'status', el.value);
      if (el.hasAttribute('data-dash-maint-property')) autoSaveMaintenance(el, 'property_id', el.value || null);
    });
    document.getElementById('dashboard-action-items-tbody')?.addEventListener('change', function (event) {
      const el = event.target;
      if (el.hasAttribute('data-dash-task-status')) autoSaveTask(el, 'status', el.value);
      if (el.hasAttribute('data-dash-task-property')) autoSaveTask(el, 'property_id', el.value || null);
    });

    document.getElementById('tasks-tbody')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'edit-task') openEditTaskModal(id);
      if (action === 'delete-task') deleteTask(id);
    });

    document.getElementById('messages-tbody')?.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'delete-message') {
        if (!window.confirm('Delete this message?')) return;
        const { error } = await supabaseClient.from('messages').delete().eq('id', id);
        if (error) return window.alert(error.message);
        await loadMessagesData();
        renderMessages();
        updateSummaryCards();
      }
    });

    document.getElementById('sig-requests-tbody')?.addEventListener('click', async function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'delete-sig') {
        if (!window.confirm('Delete this signature request?')) return;
        const { error } = await supabaseClient.from('signature_requests').delete().eq('id', id);
        if (error) return window.alert(error.message);
        await loadSigRequestsData();
        renderSigRequests();
        updateSummaryCards();
      }
    });

    ['maintenance-active-tbody', 'maintenance-completed-tbody'].forEach((tbodyId) => {
      document.getElementById(tbodyId)?.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action]');
        if (!button) return;
        const action = button.getAttribute('data-action');
        const id = button.getAttribute('data-id');
        if (action === 'open-maint-file') openMaintenanceFile(id, false);
        if (action === 'download-maint-file') openMaintenanceFile(id, true);
        if (action === 'open-maintenance') openMaintenanceDetail(id);
      });
    });
    document.getElementById('maintenance-detail-body')?.addEventListener('click', function (event) {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.getAttribute('data-action');
      const id = button.getAttribute('data-id');
      if (action === 'open-maint-file') openMaintenanceFile(id, false);
      if (action === 'download-maint-file') openMaintenanceFile(id, true);
    });
    document.getElementById('maintenance-detail-body')?.addEventListener('change', function (event) {
      const target = event.target;
      if (target.hasAttribute('data-maint-detail-priority')) autoSaveMaintenance(target, 'priority', target.value);
      if (target.hasAttribute('data-maint-detail-status')) autoSaveMaintenance(target, 'status', target.value);
    });

    // ── Autosave: Leads ──────────────────────────────────────────────────────
    const allLeadTbodyIds = [...Object.keys(LEAD_SECTIONS).map((k) => `lead-${k}-tbody`), 'lead-completed-tbody'];
    allLeadTbodyIds.forEach((tbodyId) => {
      const el = document.getElementById(tbodyId);
      if (!el) return;
      el.addEventListener('change', function (event) {
        const target = event.target;
        const tr = target.closest('tr');
        const sectionKey = tr?.getAttribute('data-lead-section');
        if (!sectionKey) return;
        if (target.hasAttribute('data-lead-status')) autoSaveLead(target, sectionKey, 'status', target.value);
        if (target.hasAttribute('data-lead-priority')) autoSaveLead(target, sectionKey, 'priority', target.value);
      });
      el.addEventListener('input', function (event) {
        const target = event.target;
        const tr = target.closest('tr');
        const sectionKey = tr?.getAttribute('data-lead-section');
        if (!sectionKey) return;
        if (target.hasAttribute('data-lead-notes')) debouncedUpdate(target, 650, () => autoSaveLead(target, sectionKey, 'notes', target.value.trim() || null));
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
      loadTasksData(),
      loadMessagesData(),
      loadSigRequestsData(),
      loadAllLeadData()
    ]);

    // Populate task modal selects after data is loaded
    populateAccountSelect(document.getElementById('task-account'), 'No account');
    populateUserSelect(document.getElementById('task-user'), 'No specific user');
    populatePropertySelect(document.getElementById('task-property'));
    populateAccountSelect(document.getElementById('sig-req-account'), 'No account');
    populateUserSelect(document.getElementById('sig-req-user'), 'No specific user');

    renderUsers();
    renderProperties();
    renderAccounts();
    renderDocuments();
    renderMaintenanceTables();
    renderTasks();
    renderMessages();
    renderSigRequests();
    renderAllLeadSections();
    updateSummaryCards();
  }

  document.addEventListener('DOMContentLoaded', renderAdminPage);
})();
