// client-portal.js — Client portal page logic.
// Queries only the signed-in client's own data (transactions, documents, properties).

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

  // ── Reveal body after auth guard passes ───────────────────────────────────
  function revealPage() {
    const style = document.getElementById('auth-guard-style');
    if (style) style.remove();
    document.body.style.visibility = 'visible';
  }

  // ── Tab navigation ────────────────────────────────────────────────────────
  function initTabs() {
    const buttons = document.querySelectorAll('.portal-tab-bar .portal-tab');
    buttons.forEach((btn) => {
      btn.addEventListener('click', function () {
        buttons.forEach((b) => {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        });
        btn.classList.add('active');
        btn.setAttribute('aria-selected', 'true');

        document.querySelectorAll('.tab-panel').forEach((panel) => { panel.hidden = true; });
        const target = document.getElementById('tab-' + btn.getAttribute('data-tab'));
        if (target) target.hidden = false;
      });
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────────
  function statusBadge(status) {
    const map = {
      Active: 'badge-active',
      Pending: 'badge-pending',
      Closed: 'badge-sold',
      Cancelled: 'badge-hidden'
    };
    return `<span class="status-badge ${map[status] || 'badge-coming-soon'}">${escapeHtml(status)}</span>`;
  }

  function sigBadge(doc) {
    if (!doc.requires_signature) return '<span class="badge-doc-none">&mdash;</span>';
    if (doc.signed) {
      const ts = doc.signed_at ? new Date(doc.signed_at).toLocaleDateString() : '';
      return `<span class="badge-doc-signed">Signed ${escapeHtml(ts)}</span>`;
    }
    return '<span class="badge-doc-required">Signature Required</span>';
  }

  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  }

  // ── Load properties (only those linked to the client's transactions) ───────
  async function loadProperties(userId) {
    const grid = document.getElementById('properties-grid-client');
    const empty = document.getElementById('properties-empty');
    if (!grid) return;

    // Get property IDs from the client's transactions
    const { data: txnData, error: txnErr } = await supabaseClient
      .from('transactions')
      .select('property_id')
      .eq('client_id', userId);

    if (txnErr) { console.error('Properties (via transactions) error:', txnErr); return; }

    const propertyIds = (txnData || []).map((t) => t.property_id).filter(Boolean);

    if (!propertyIds.length) {
      if (empty) empty.hidden = false;
      grid.innerHTML = '';
      return;
    }

    const { data, error } = await supabaseClient
      .from('properties')
      .select('*')
      .in('id', propertyIds)
      .order('created_at', { ascending: false });

    if (error) { console.error('Properties error:', error); return; }

    if (!data || !data.length) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    grid.innerHTML = data.map((p) => `
      <div class="dashboard-card">
        <p class="eyebrow">Property</p>
        <h3>${escapeHtml(p.property_address)}</h3>
        <p>${statusBadge(p.property_status)}</p>
        ${p.purchase_price ? `<p><strong>Purchase:</strong> ${escapeHtml(formatCurrency(p.purchase_price))}</p>` : ''}
        ${p.sale_price ? `<p><strong>Sale:</strong> ${escapeHtml(formatCurrency(p.sale_price))}</p>` : ''}
        ${p.notes ? `<p class="table-hint">${escapeHtml(p.notes)}</p>` : ''}
      </div>
    `).join('');
  }

  // ── Load transactions (client's own only) ─────────────────────────────────
  async function loadTransactions(userId) {
    const tbody = document.getElementById('transactions-tbody');
    const empty = document.getElementById('transactions-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('transactions')
      .select('*, properties(property_address)')
      .eq('client_id', userId)
      .order('created_at', { ascending: false });

    if (error) { console.error('Transactions error:', error); return; }

    if (!data || !data.length) {
      if (empty) empty.hidden = false;
      tbody.innerHTML = '';
      return;
    }
    if (empty) empty.hidden = true;
    tbody.innerHTML = data.map((t) => {
      const addr = t.properties ? t.properties.property_address : t.property_id || '&mdash;';
      return `<tr>
        <td>${escapeHtml(addr)}</td>
        <td style="text-transform:capitalize">${escapeHtml(t.transaction_type)}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${t.created_at ? escapeHtml(t.created_at.slice(0, 10)) : '&mdash;'}</td>
      </tr>`;
    }).join('');
  }

  // ── Load documents (client's own only) ────────────────────────────────────
  let allDocuments = [];

  async function loadDocuments(userId) {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    const { data, error } = await supabaseClient
      .from('documents')
      .select('*')
      .eq('client_id', userId)
      .neq('visibility', 'admin_only')
      .eq('hidden', false)
      .order('created_at', { ascending: false });

    if (error) { console.error('Documents error:', error); return; }

    allDocuments = data || [];
    renderDocuments(userId);
  }

  function renderDocuments(userId) {
    const tbody = document.getElementById('documents-tbody');
    const empty = document.getElementById('documents-empty');
    if (!tbody) return;

    if (!allDocuments.length) {
      tbody.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    tbody.innerHTML = allDocuments.map((doc) => {
      const downloadable = doc.visibility === 'client_downloadable';
      const downloadBtn = downloadable
        ? `<button class="action-link" data-action="download" data-id="${escapeHtml(doc.id)}" type="button" aria-label="Download ${escapeHtml(doc.file_name)} (opens in new window)">Download</button>`
        : '';
      const signBtn = doc.requires_signature && !doc.signed
        ? `<button class="action-link badge-doc-required-btn" data-action="sign" data-id="${escapeHtml(doc.id)}" type="button">Acknowledge</button>`
        : '';
      return `<tr>
        <td>${escapeHtml(doc.file_name)}</td>
        <td>${escapeHtml(doc.category) || '&mdash;'}</td>
        <td>${doc.created_at ? escapeHtml(doc.created_at.slice(0, 10)) : '&mdash;'}</td>
        <td>${sigBadge(doc)}</td>
        <td><div class="table-actions">${downloadBtn}${signBtn}</div></td>
      </tr>`;
    }).join('');
  }

  // ── Download a document ───────────────────────────────────────────────────
  async function downloadDocument(docId) {
    const doc = allDocuments.find((d) => d.id === docId);
    if (!doc) return;

    const { data, error } = await supabaseClient.storage
      .from(doc.bucket_name || 'property-documents')
      .createSignedUrl(doc.file_path, 300);

    if (error) {
      console.error('Download error:', error);
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  // ── Signature modal ───────────────────────────────────────────────────────
  let pendingSignDocId = null;

  function openSignatureModal(docId) {
    const doc = allDocuments.find((d) => d.id === docId);
    if (!doc) return;
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
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  function closeSignatureModal() {
    const modal = document.getElementById('signature-modal');
    if (modal) {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }
    pendingSignDocId = null;
  }

  async function confirmSignature(userId) {
    if (!pendingSignDocId) return;
    const confirmBtn = document.getElementById('sig-confirm-btn');
    const status = document.getElementById('sig-status');

    if (confirmBtn) confirmBtn.disabled = true;

    const { error } = await supabaseClient
      .from('documents')
      .update({
        signed: true,
        signed_at: new Date().toISOString(),
        signed_by: userId
      })
      .eq('id', pendingSignDocId);

    if (error) {
      console.error('Signature error:', error);
      if (status) {
        status.className = 'form-status error-message';
        status.textContent = 'Failed to record signature: ' + error.message;
      }
      if (confirmBtn) confirmBtn.disabled = false;
      return;
    }

    if (status) {
      status.className = 'form-status success-message';
      status.textContent = 'Acknowledgement recorded successfully.';
    }

    setTimeout(async () => {
      closeSignatureModal();
      await loadDocuments(userId);
    }, 1500);
  }

  // ── Document upload ───────────────────────────────────────────────────────
  async function handleUpload(event, userId) {
    event.preventDefault();
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
      : Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    const filePath = `${userId}/${uniquePrefix}-${safeFilename}`;

    const { error: storageError } = await supabaseClient.storage
      .from('property-documents')
      .upload(filePath, file);

    if (storageError) {
      if (statusEl) { statusEl.className = 'form-status error-message'; statusEl.textContent = 'Upload failed: ' + storageError.message; }
      if (uploadBtn) uploadBtn.disabled = false;
      return;
    }

    const notes = notesInput ? notesInput.value.trim() : '';

    const { error: dbError } = await supabaseClient
      .from('documents')
      .insert([{
        client_id: userId,
        uploaded_by: userId,
        file_name: file.name,
        file_path: filePath,
        bucket_name: 'property-documents',
        file_type: file.type,
        file_size: file.size,
        category: category,
        visibility: 'client_visible',
        notes: notes || null,
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

  // ── Initialisation ────────────────────────────────────────────────────────
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

    const role = await getCurrentUserRole();
    if (role !== 'client') {
      // Admins who land here are redirected to their dashboard
      if (role === 'admin') { window.location.replace('admin.html'); return; }
      window.location.replace('login.html');
      return;
    }

    // Auth passed — reveal page
    revealPage();

    const userId = session.user.id;
    const userEmail = session.user.email;

    // Fetch profile for display name
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('id', userId)
      .single();

    const nameEl = document.getElementById('client-name');
    const emailEl = document.getElementById('client-email');
    if (nameEl) nameEl.textContent = (profile && profile.full_name) ? profile.full_name : userEmail;
    if (emailEl) emailEl.textContent = userEmail;

    // Logout
    const logoutBtn = document.getElementById('client-logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
      });
    }

    initTabs();

    // Load data scoped to this user
    await Promise.all([
      loadProperties(userId),
      loadTransactions(userId),
      loadDocuments(userId)
    ]);

    // Document table actions (download, sign)
    const docsTbody = document.getElementById('documents-tbody');
    if (docsTbody) {
      docsTbody.addEventListener('click', async function (e) {
        const action = e.target.getAttribute('data-action');
        const id = e.target.getAttribute('data-id');
        if (!action || !id) return;
        if (action === 'download') await downloadDocument(id);
        if (action === 'sign') openSignatureModal(id);
      });
    }

    // Upload form
    const uploadForm = document.getElementById('client-upload-form');
    if (uploadForm) {
      uploadForm.addEventListener('submit', (e) => handleUpload(e, userId));
    }

    // Signature modal controls
    const sigClose = document.getElementById('sig-modal-close');
    if (sigClose) sigClose.addEventListener('click', closeSignatureModal);

    const sigModal = document.getElementById('signature-modal');
    if (sigModal) {
      sigModal.addEventListener('click', function (e) {
        if (e.target === sigModal) closeSignatureModal();
      });
    }

    const sigConfirm = document.getElementById('sig-confirm-btn');
    if (sigConfirm) sigConfirm.addEventListener('click', () => confirmSignature(userId));

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSignatureModal();
    });
  });
})();
