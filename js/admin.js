/*
  SECURITY NOTE: This client-side authentication is for DEMONSTRATION ONLY.
  Before deploying to production, replace with server-side authentication using
  a secure framework (e.g., Node.js/Express with bcrypt, Firebase Auth, etc.).
  Passwords must be hashed. Use HTTPS. Implement proper session management.
*/

(function () {
  const SESSION_KEY = 'brandyAdminSession';
  const DB_KEY = 'brandyPrivateDb';
  const CREDENTIALS = {
    ColoradoAccess2026: { password: 'Murdock&Murphy2026', role: 'Admin', displayName: 'Colorado Access Admin' },
    ColoradoAccessUser2026: { password: 'Murdock&Murphy26', role: 'Viewer', displayName: 'Colorado Access Viewer' }
  };

  const PRIVATE_DB = [
    {
      id: 'doc-001',
      propertyId: 'prop-001',
      propertyAddress: '1234 Rocky Mountain Road, Denver, CO 80201',
      propertyStatus: 'Active',
      fileType: 'Document',
      fileName: 'Listing_Agreement_prop001.pdf',
      uploadDate: '2024-01-15',
      lastUpdated: '2024-01-15',
      listingAgent: 'Brandy Renon',
      brokerage: 'Colorado Premier Realty',
      notes: 'Signed listing agreement',
      hidden: false
    },
    {
      id: 'doc-002',
      propertyId: 'prop-002',
      propertyAddress: '5678 Aspen Lane, Boulder, CO 80302',
      propertyStatus: 'Pending',
      fileType: 'Contract',
      fileName: 'Offer_Summary_prop002.pdf',
      uploadDate: '2024-02-01',
      lastUpdated: '2024-02-03',
      listingAgent: 'Brandy Renon',
      brokerage: 'Colorado Premier Realty',
      notes: 'Pending contract packet for internal review',
      hidden: false
    },
    {
      id: 'doc-003',
      propertyId: 'prop-003',
      propertyAddress: '910 Ponderosa Drive, Colorado Springs, CO 80903',
      propertyStatus: 'Active',
      fileType: 'Permit',
      fileName: 'Primary_Suite_Addition_Permit.pdf',
      uploadDate: '2024-02-12',
      lastUpdated: '2024-02-12',
      listingAgent: 'Brandy Renon',
      brokerage: 'Colorado Premier Realty',
      notes: 'Permit package for 2021 addition',
      hidden: false
    },
    {
      id: 'doc-004',
      propertyId: 'prop-004',
      propertyAddress: '222 Pearl Street #4B, Fort Collins, CO 80524',
      propertyStatus: 'Coming Soon',
      fileType: 'Photo',
      fileName: 'Staging_Set_01.jpg',
      uploadDate: '2024-03-08',
      lastUpdated: '2024-03-08',
      listingAgent: 'Brandy Renon',
      brokerage: 'Colorado Premier Realty',
      notes: 'Preview staging photos awaiting marketing approval',
      hidden: true
    },
    {
      id: 'doc-005',
      propertyId: 'prop-005',
      propertyAddress: '789 Evergreen Circle, Lakewood, CO 80226',
      propertyStatus: 'Sold',
      fileType: 'Document',
      fileName: 'Closing_Summary_prop005.pdf',
      uploadDate: '2024-03-21',
      lastUpdated: '2024-03-25',
      listingAgent: 'Brandy Renon',
      brokerage: 'Colorado Premier Realty',
      notes: 'Sold file archive summary',
      hidden: false
    }
  ];

  function seedDb() {
    if (!sessionStorage.getItem(DB_KEY)) {
      sessionStorage.setItem(DB_KEY, JSON.stringify(PRIVATE_DB));
    }
  }

  function getDb() {
    seedDb();
    return JSON.parse(sessionStorage.getItem(DB_KEY) || '[]');
  }

  function saveDb(data) {
    sessionStorage.setItem(DB_KEY, JSON.stringify(data));
  }

  function getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function setSession(session) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  function handleLoginPage() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;
    const existingSession = getSession();
    if (existingSession) {
      window.location.href = 'admin.html';
      return;
    }
    const errorBox = document.getElementById('login-error');

    loginForm.addEventListener('submit', function (event) {
      event.preventDefault();
      const username = loginForm.username.value.trim();
      const password = loginForm.password.value;
      const account = CREDENTIALS[username];

      if (!account || account.password !== password) {
        errorBox.textContent = 'Invalid username or password. Please verify the demo credentials.';
        errorBox.className = 'error-message';
        return;
      }

      setSession({ username, role: account.role, displayName: account.displayName });
      window.location.href = 'admin.html';
    });
  }

  function renderAdminPage() {
    const tableBody = document.getElementById('private-db-body');
    if (!tableBody) return;

    const session = getSession();
    if (!session) {
      window.location.href = 'login.html';
      return;
    }

    seedDb();
    const isAdmin = session.role === 'Admin';
    const userDisplay = document.getElementById('logged-in-user');
    const roleBadge = document.getElementById('role-badge');
    const toolbar = document.getElementById('admin-toolbar');
    const uploadButton = document.getElementById('open-upload-modal');
    const logoutButton = document.getElementById('logout-button');
    const modal = document.getElementById('upload-modal');
    const modalCloseButtons = modal ? modal.querySelectorAll('[data-close-modal]') : [];
    const uploadForm = document.getElementById('upload-form');
    const filterType = document.getElementById('admin-filter-type');
    const filterVisibility = document.getElementById('admin-filter-visibility');
    const filterProperty = document.getElementById('admin-filter-property');
    const tableHint = document.getElementById('table-role-hint');
    const emptyState = document.getElementById('admin-empty-state');

    userDisplay.textContent = session.displayName;
    roleBadge.textContent = session.role;
    roleBadge.className = `role-badge ${isAdmin ? 'role-admin' : 'role-viewer'}`;
    toolbar.hidden = !isAdmin;
    if (!isAdmin && tableHint) {
      tableHint.textContent = 'Viewer access: you can review visible records but cannot upload, hide, or delete entries.';
    }

    function populatePropertyFilter() {
      if (!filterProperty || !window.PROPERTIES) return;
      filterProperty.innerHTML = '<option value="">All properties</option>' + window.PROPERTIES.map((property) => `<option value="${property.id}">${property.title}</option>`).join('');
    }

    function renderRows() {
      const fileTypeValue = filterType ? filterType.value : '';
      const visibilityValue = filterVisibility ? filterVisibility.value : '';
      const propertyValue = filterProperty ? filterProperty.value : '';
      let entries = getDb();

      if (!isAdmin) entries = entries.filter((entry) => !entry.hidden);
      if (fileTypeValue) entries = entries.filter((entry) => entry.fileType === fileTypeValue);
      if (visibilityValue === 'visible') entries = entries.filter((entry) => !entry.hidden);
      if (visibilityValue === 'hidden') entries = entries.filter((entry) => entry.hidden);
      if (propertyValue) entries = entries.filter((entry) => entry.propertyId === propertyValue);

      if (!entries.length) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.hidden = false;
        return;
      }

      if (emptyState) emptyState.hidden = true;
      tableBody.innerHTML = entries.map((entry) => `
        <tr>
          <td>${entry.propertyAddress}</td>
          <td>${entry.propertyId}</td>
          <td>${entry.fileName}</td>
          <td>${entry.fileType}</td>
          <td>${entry.listingAgent}</td>
          <td>${entry.uploadDate}</td>
          <td><span class="${entry.hidden ? 'badge-hidden' : 'badge-visible'}">${entry.hidden ? 'Hidden' : 'Visible'}</span></td>
          <td>
            ${isAdmin ? `
              <div class="table-actions">
                <button type="button" class="action-link" data-action="toggle" data-id="${entry.id}">${entry.hidden ? 'Unhide' : 'Hide'}</button>
                <button type="button" class="action-link" data-action="delete" data-id="${entry.id}">Delete</button>
              </div>
            ` : '<span class="helper-text">View only</span>'}
          </td>
        </tr>
      `).join('');
    }

    function openModal() {
      if (!modal || !isAdmin) return;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
    }

    function closeModal() {
      if (!modal) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }

    if (uploadButton) uploadButton.addEventListener('click', openModal);
    modalCloseButtons.forEach((button) => button.addEventListener('click', closeModal));
    if (modal) {
      modal.addEventListener('click', function (event) {
        if (event.target === modal) closeModal();
      });
    }

    if (logoutButton) {
      logoutButton.addEventListener('click', function () {
        clearSession();
        window.location.href = 'login.html';
      });
    }

    [filterType, filterVisibility, filterProperty].forEach((field) => {
      if (field) field.addEventListener('change', renderRows);
    });

    tableBody.addEventListener('click', function (event) {
      const action = event.target.getAttribute('data-action');
      const id = event.target.getAttribute('data-id');
      if (!action || !id || !isAdmin) return;
      const db = getDb();
      const index = db.findIndex((entry) => entry.id === id);
      if (index === -1) return;

      if (action === 'toggle') {
        db[index].hidden = !db[index].hidden;
        db[index].lastUpdated = new Date().toISOString().slice(0, 10);
        saveDb(db);
        renderRows();
      }

      if (action === 'delete') {
        const confirmed = window.confirm('Delete this demo record from the session storage database?');
        if (!confirmed) return;
        db.splice(index, 1);
        saveDb(db);
        renderRows();
      }
    });

    if (uploadForm) {
      uploadForm.addEventListener('submit', function (event) {
        event.preventDefault();
        if (!isAdmin) return;
        const fileInput = uploadForm.querySelector('[name="uploadFile"]');
        const today = new Date().toISOString().slice(0, 10);
        const db = getDb();
        const entry = {
          id: `doc-${String(Date.now()).slice(-6)}`,
          propertyId: uploadForm.propertyId.value.trim(),
          propertyAddress: uploadForm.propertyAddress.value.trim(),
          propertyStatus: uploadForm.propertyStatus.value,
          fileType: uploadForm.fileType.value,
          fileName: fileInput && fileInput.files && fileInput.files[0] ? fileInput.files[0].name : uploadForm.fileName.value.trim(),
          uploadDate: today,
          lastUpdated: today,
          listingAgent: uploadForm.listingAgent.value.trim(),
          brokerage: uploadForm.brokerage.value.trim(),
          notes: uploadForm.notes.value.trim(),
          hidden: false
        };
        db.unshift(entry);
        saveDb(db);
        uploadForm.reset();
        closeModal();
        renderRows();
      });
    }

    populatePropertyFilter();
    renderRows();
  }

  document.addEventListener('DOMContentLoaded', function () {
    handleLoginPage();
    renderAdminPage();
  });
})();
