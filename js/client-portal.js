// client-portal.js - Client portal page logic.
// Queries only the signed-in client's own data, or an admin preview of a client's data.

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

  let allDocuments = [];
  let previewMode = false;
  let activeUserId = null;
  let pendingSignDocId = null;

  function hasAllowedExtension(name) {
    const lower = (name || '').toLowerCase();
    return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  function isAllowedMime(mime) {
    return ALLOWED_MIME_TYPES.includes((mime || '').toLowerCase());
  }

  function revealPage() {
    const style = document.getElementById('auth-guard-style');
    if (style) style.remove();
    document.body.style.visibility = 'visible';
  }

  function getPreviewClientId() {
    return new URLSearchParams(window.location.search).get('view_as_client');
  }

  function initTabs() {
    const buttons = document.querySelectorAll('.portal-tab-bar .portal-tab');
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
        if (target) {
          target.hidden = false;
          window.refreshMotion?.(target);
        }
      });
    });
  }

  function statusBadge(status) {
    const map = { Active: 'badge-active', Pending: 'badge-pending', Closed: 'badge-sold', Cancelled: 'badge-hidden' };
    return `<span class="status-badge ${map[status] || 'badge-coming-soon'}">${escapeHtml(status || 'N/A')}</span>`;
  }

  function sigBadge(doc) {
    if (!doc.requires_signature) return '<span class="badge-doc-none">N/A</span>';
    if (doc.signed) {
      const ts = doc.signed_at ? new Date(doc.signed_at).toLocaleDateString() : '';
      return `<span class="badge-doc-signed">Signed ${escapeHtml(ts)}</span>`;
    }
    return '<span class="badge-doc-required">Signature Required</span>';
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  }

  function formatDateOnly(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleDateString());
  }

  async function getDocumentUrl(doc) {
    const bucket = doc.bucket_name || 'property-documents';
    if (bucket === 'property-images') {
      const { data } = supabaseClient.storage.from(bucket).getPublicUrl(doc.file_path);
      return data.publicUrl;
    }

    const { data, error } = await supabaseClient.storage.from(bucket).createSignedUrl(doc.file_path, 300);
    if (error) throw error;
    return data.signedUrl;
  }

  async function loadProperties(userId) {
    const grid = document.getElementById('properties-grid-client');
    const empty = document.getElementById('properties-empty');
    if (!grid) return;

    const [assignmentResult, transactionResult] = await Promise.all([
      supabaseClient.from('client_property_assignments').select('property_id').eq('client_id', userId),
      supabaseClient.from('transactions').select('property_id').eq('client_id', userId)
    ]);

    if (assignmentResult.error) {
      console.error('Property assignments error:', assignmentResult.error);
      return;
    }
    if (transactionResult.error) {
      console.error('Transactions (for properties) error:', transactionResult.error);
      return;
    }

    const propertyIds = Array.from(new Set([
      ...(assignmentResult.data || []).map((row) => row.property_id),
      ...(transactionResult.data || []).map((row) => row.property_id)
    ].filter(Boolean)));

    if (!propertyIds.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    const { data, error } = await supabaseClient.from('properties').select('*').in('id', propertyIds).order('created_at', { ascending: false });
    if (error) {
      console.error('Properties error:', error);
      return;
    }

    if (!data || !data.length) {
      grid.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    grid.innerHTML = data.map((property) => `
      <div class="dashboard-card">
        <p class="eyebrow">Property</p>
        <h3>${escapeHtml(property.property_address)}</h3>
        <p>${statusBadge(property.property_status)}</p>
        ${property.purchase_price ? `<p><strong>Purchase:</strong> ${escapeHtml(formatCurrency(property.purchase_price))}</p>` : ''}
        ${property.sale_price ? `<p><strong>Sale:</strong> ${escapeHtml(formatCurrency(property.sale_price))}</p>` : ''}
        ${property.notes ? `<p class="table-hint">${escapeHtml(property.notes)}</p>` : ''}
      </div>
    `).join('');
    window.refreshMotion?.(grid);
  }

  async function loadTransactions(userId) {
    const tbody = document.getElementById('transactions-tbody');
    const empty = document.getElementById('transactions-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, properties(property_address)')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Transactions error:', error);
      return;
    }

    if (!data || !data.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    tbody.innerHTML = data.map((transaction) => `
      <tr>
        <td>${escapeHtml(transaction.properties?.property_address || 'N/A')}</td>
        <td style="text-transform:capitalize">${escapeHtml(transaction.transaction_type)}</td>
        <td>${statusBadge(transaction.status)}</td>
        <td>${formatDateOnly(transaction.created_at)}</td>
      </tr>
    `).join('');
  }

  async function loadDocuments(userId) {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('client_id', userId)
      .eq('can_client_view', true)
      .eq('hidden', false)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Documents error:', error);
      return;
    }

    allDocuments = data || [];
    if (!allDocuments.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }

    if (empty) empty.hidden = true;
    tbody.innerHTML = allDocuments.map((doc) => {
      const showDownload = doc.visibility === 'client_downloadable' || previewMode;
      const showSign = !previewMode && doc.requires_signature && !doc.signed && doc.can_client_edit;
      return `<tr>
        <td><button class="action-link document-link" data-action="open" data-id="${escapeHtml(doc.id)}" type="button" aria-label="Open ${escapeHtml(doc.file_name)}">${escapeHtml(doc.file_name)}</button></td>
        <td>${escapeHtml(doc.category) || 'N/A'}</td>
        <td>${formatDateOnly(doc.created_at)}</td>
        <td>${sigBadge(doc)}</td>
        <td><div class="table-actions">
          <button class="action-link" data-action="open" data-id="${escapeHtml(doc.id)}" type="button">Open</button>
          ${showDownload ? `<button class="action-link" data-action="download" data-id="${escapeHtml(doc.id)}" type="button">Download</button>` : ''}
          ${showSign ? `<button class="action-link badge-doc-required-btn" data-action="sign" data-id="${escapeHtml(doc.id)}" type="button">Acknowledge</button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  }

  async function openDocument(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc) return;
    try {
      const url = await getDocumentUrl(doc);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Document open error:', error);
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
      console.error('Document download error:', error);
    }
  }

  function openSignatureModal(docId) {
    const doc = allDocuments.find((item) => item.id === docId);
    if (!doc || !doc.can_client_edit || previewMode) return;
    pendingSignDocId = docId;

    const modal = document.getElementById('signature-modal');
    const docName = document.getElementById('sig-doc-name');
    const checkbox = document.getElementById('sig-checkbox');
    const confirmBtn = document.getElementById('sig-confirm-btn');
    const status = document.getElementById('sig-status');

    if (docName) docName.textContent = doc.file_name;
    if (checkbox) checkbox.checked = false;
    if (confirmBtn) confirmBtn.disabled = true;
    if (status) { status.textContent = ''; status.className = 'form-status'; }

    if (checkbox) {
      checkbox.onchange = function () {
        if (confirmBtn) confirmBtn.disabled = !checkbox.checked;
      };
    }

    if (modal) {
      if (window.openAppModal) {
        window.openAppModal(modal);
      } else {
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
      }
    }
  }

  function closeSignatureModal() {
    const modal = document.getElementById('signature-modal');
    if (modal) {
      if (window.closeAppModal) {
        window.closeAppModal(modal);
      } else {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
      }
    }
    pendingSignDocId = null;
  }

  async function confirmSignature() {
    if (!pendingSignDocId || previewMode) return;
    const confirmBtn = document.getElementById('sig-confirm-btn');
    const status = document.getElementById('sig-status');
    if (confirmBtn) confirmBtn.disabled = true;

    const { error } = await supabaseClient.rpc('client_acknowledge_document', { target_document_id: pendingSignDocId });
    if (error) {
      console.error('Signature error:', error);
      if (status) {
        status.className = 'form-status error-message';
        status.textContent = 'Failed to record acknowledgement: ' + error.message;
      }
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    if (status) {
      status.className = 'form-status success-message';
      status.textContent = 'Acknowledgement recorded successfully.';
    }

    setTimeout(async function () {
      closeSignatureModal();
      await loadDocuments(activeUserId);
    }, 1200);
  }

  async function handleUpload(event, userId) {
    event.preventDefault();
    if (previewMode) return;

    const form = document.getElementById('client-upload-form');
    const fileInput = document.getElementById('client-upload-file');
    const categorySelect = document.getElementById('client-upload-category');
    const notesInput = document.getElementById('client-upload-notes');
    const uploadBtn = document.getElementById('client-upload-btn');
    const statusEl = document.getElementById('upload-status');
    if (statusEl) { statusEl.textContent = ''; statusEl.className = 'form-status'; }

    const file = fileInput ? fileInput.files[0] : null;
    const category = categorySelect ? categorySelect.value : '';
    if (!file) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Please select a file.'; }
      return;
    }
    if (!category) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Please select a document category.'; }
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

    if (uploadBtn) uploadBtn.disabled = true;
    const safeFilename = sanitizeFilename(file.name);
    const uniquePrefix = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const filePath = `${userId}/${uniquePrefix}-${safeFilename}`;

    const { error: storageError } = await supabaseClient.storage.from('property-documents').upload(filePath, file);
    if (storageError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Upload failed: ' + storageError.message; }
      if (uploadBtn) uploadBtn.disabled = false;
      return;
    }

    const { error: dbError } = await supabaseClient.from('documents').insert([{
      client_id: userId,
      uploaded_by: userId,
      file_name: file.name,
      file_path: filePath,
      bucket_name: 'property-documents',
      file_type: file.type,
      file_size: file.size,
      category,
      visibility: 'client_visible',
      can_client_view: true,
      can_client_edit: true,
      notes: notesInput ? notesInput.value.trim() || null : null,
      hidden: false
    }]);
    if (dbError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'File saved but record failed: ' + dbError.message; }
      if (uploadBtn) uploadBtn.disabled = false;
      return;
    }

    if (form) form.reset();
    if (uploadBtn) uploadBtn.disabled = false;
    if (statusEl) { statusEl.className = 'form-status success-message'; statusEl.textContent = 'Document uploaded successfully.'; }
    await loadDocuments(userId);
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

    const uploadTabButton = document.querySelector('.portal-tab[data-tab="upload"]');
    const uploadPanel = document.getElementById('tab-upload');
    if (uploadTabButton) uploadTabButton.hidden = true;
    if (uploadPanel) uploadPanel.hidden = true;
  }

  document.addEventListener('DOMContentLoaded', async function () {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      window.location.replace('login.html');
      return;
    }

    const session = await getSession();
    if (!session) {
      window.location.replace('login.html');
      return;
    }

    const currentProfile = await getCurrentUserProfile();
    if (!currentProfile) {
      window.location.replace('login.html');
      return;
    }

    const previewClientId = getPreviewClientId();
    const isAdminPreview = currentProfile.role === 'admin' && previewClientId;
    if (!isAdminPreview && currentProfile.role !== 'client') {
      window.location.replace(currentProfile.role === 'admin' ? 'admin.html' : 'login.html');
      return;
    }

    if (!isAdminPreview && currentProfile.status === 'inactive') {
      await supabaseClient.auth.signOut();
      window.location.replace('login.html?inactive=1');
      return;
    }

    revealPage();
    activeUserId = isAdminPreview ? previewClientId : session.user.id;
    let displayProfile = currentProfile;

    if (isAdminPreview) {
      const { data: previewProfile } = await supabaseClient.from('profiles').select('id, email, full_name, role, status').eq('id', previewClientId).single();
      if (!previewProfile || previewProfile.role !== 'client') {
        window.location.replace('admin.html?tab=users');
        return;
      }
      displayProfile = previewProfile;
      applyPreviewMode(displayProfile);
    }

    const nameEl = document.getElementById('client-name');
    const emailEl = document.getElementById('client-email');
    if (nameEl) nameEl.textContent = displayProfile.full_name || displayProfile.email || 'Client';
    if (emailEl) emailEl.textContent = displayProfile.email || '';

    document.getElementById('client-logout')?.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });

    initTabs();
    await Promise.all([
      loadProperties(activeUserId),
      loadTransactions(activeUserId),
      loadDocuments(activeUserId)
    ]);

    document.getElementById('documents-tbody')?.addEventListener('click', async function (event) {
      const action = event.target.getAttribute('data-action');
      const id = event.target.getAttribute('data-id');
      if (!action || !id) return;
      if (action === 'open') await openDocument(id);
      if (action === 'download') await downloadDocument(id);
      if (action === 'sign') openSignatureModal(id);
    });

    document.getElementById('client-upload-form')?.addEventListener('submit', function (event) {
      handleUpload(event, activeUserId);
    });

    document.getElementById('sig-modal-close')?.addEventListener('click', closeSignatureModal);
    document.getElementById('signature-modal')?.addEventListener('click', function (event) {
      if (event.target === event.currentTarget) closeSignatureModal();
    });
    document.getElementById('sig-confirm-btn')?.addEventListener('click', confirmSignature);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeSignatureModal();
    });
  });
})();
