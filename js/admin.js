(function () {
  const MAX_UPLOAD_FILE_SIZE_MB = 5;
  const MAX_UPLOAD_FILE_SIZE_BYTES = MAX_UPLOAD_FILE_SIZE_MB * 1024 * 1024;
  const ALLOWED_FILE_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp'
  ];
  const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.doc', '.docx', '.xls', '.xlsx', '.txt'];

  function hasAllowedFileExtension(fileName) {
    if (typeof fileName !== 'string') return false;
    const lowerCaseName = fileName.toLowerCase();
    return ALLOWED_FILE_EXTENSIONS.some((extension) => lowerCaseName.endsWith(extension));
  }

  function isAllowedMimeType(mimeType) {
    if (typeof mimeType !== 'string' || !mimeType) return false;
    return ALLOWED_FILE_MIME_TYPES.includes(mimeType.toLowerCase());
  }

  function isAllowedFileType(mimeType, fileName) {
    return isAllowedMimeType(mimeType) && hasAllowedFileExtension(fileName);
  }

  function handleLoginPage() {
    const loginForm = document.getElementById('login-form');
    const loginButton = document.getElementById('login-button');
    if (!loginForm || !loginButton) return;

    const originalButtonLabel = loginButton.textContent;
    const setLoginButtonState = (isLoading) => {
      loginButton.disabled = isLoading;
      loginButton.textContent = isLoading ? 'Logging in...' : originalButtonLabel;
      if (isLoading) {
        loginButton.setAttribute('aria-busy', 'true');
      } else {
        loginButton.removeAttribute('aria-busy');
      }
    };

    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errorBox = document.getElementById('login-error');

      if (errorBox) {
        errorBox.textContent = '';
        errorBox.className = '';
      }

      if (!email || !password) {
        if (errorBox) {
          errorBox.textContent = 'Enter both your email and password.';
          errorBox.className = 'error-message';
        }
        return;
      }

      if (typeof supabaseClient === 'undefined' || !supabaseClient || !supabaseClient.auth) {
        if (errorBox) {
          errorBox.textContent = 'Login is temporarily unavailable. Please refresh and try again.';
          errorBox.className = 'error-message';
        }
        console.error('supabaseClient is not initialized');
        return;
      }

      setLoginButtonState(true);

      try {
        console.log('Attempting sign in for:', email);
        const { data, error } = await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

        console.log('Sign in result — data:', data, 'error:', error);

        if (error) {
          if (errorBox) {
            errorBox.textContent = error.message;
            errorBox.className = 'error-message';
          }
          console.error('Sign in error:', error);
          setLoginButtonState(false);
          return;
        }

        window.location.href = 'admin.html';
      } catch (err) {
        if (errorBox) {
          errorBox.textContent = 'Unable to sign in right now. Please try again.';
          errorBox.className = 'error-message';
        }
        console.error('Login failed:', err);
        setLoginButtonState(false);
      }
    });
  }

  async function renderAdminPage() {
    const tableBody = document.getElementById('private-db-body');
    if (!tableBody) return;

    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      window.location.href = 'login.html';
      return;
    }

    const { data: sessionData } = await supabaseClient.auth.getSession();

    if (!sessionData.session) {
      window.location.href = 'login.html';
      return;
    }

    const userEmail = sessionData.session.user.email;
    const isAdmin = true;

    const userDisplay = document.getElementById('logged-in-user');
    const roleBadge = document.getElementById('role-badge');
    const toolbar = document.getElementById('admin-toolbar');
    const uploadButton = document.getElementById('open-upload-modal');
    const logoutButton = document.getElementById('logout-button');
    const modal = document.getElementById('upload-modal');
    const modalCloseButtons = modal ? modal.querySelectorAll('[data-close-modal]') : [];
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('upload-file-input');
    const filterType = document.getElementById('admin-filter-type');
    const filterVisibility = document.getElementById('admin-filter-visibility');
    const filterProperty = document.getElementById('admin-filter-property');
    const tableHint = document.getElementById('table-role-hint');
    const emptyState = document.getElementById('admin-empty-state');

    if (userDisplay) userDisplay.textContent = userEmail;
    if (roleBadge) roleBadge.textContent = 'Admin';
    if (toolbar) toolbar.hidden = false;

    let allEntries = [];

    async function loadEntries() {
      const { data, error } = await supabaseClient
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Failed to load documents:', error);
        return [];
      }
      return data || [];
    }

    function getPublicUrl(entry) {
      if (!entry.bucket_name || !entry.file_path) return '';
      const { data } = supabaseClient.storage
        .from(entry.bucket_name)
        .getPublicUrl(entry.file_path);
      return data ? data.publicUrl : '';
    }

    function populatePropertyFilter() {
      if (!filterProperty || !window.PROPERTIES) return;
      filterProperty.innerHTML = '<option value="">All properties</option>' +
        window.PROPERTIES.map((p) => `<option value="${p.id}">${p.title}</option>`).join('');
    }

    function renderRows(entries) {
      const fileTypeValue = filterType ? filterType.value : '';
      const visibilityValue = filterVisibility ? filterVisibility.value : '';
      const propertyValue = filterProperty ? filterProperty.value : '';

      let filtered = entries.slice();

      if (fileTypeValue) filtered = filtered.filter((e) => e.file_type === fileTypeValue);
      if (visibilityValue === 'visible') filtered = filtered.filter((e) => !e.hidden);
      if (visibilityValue === 'hidden') filtered = filtered.filter((e) => e.hidden);
      if (propertyValue) filtered = filtered.filter((e) => e.property_id === propertyValue);

      if (!filtered.length) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.hidden = false;
        return;
      }

      if (emptyState) emptyState.hidden = true;
      tableBody.innerHTML = '';
      const tableFragment = document.createDocumentFragment();

      filtered.forEach((entry) => {
        const row = document.createElement('tr');

        const propertyAddressCell = document.createElement('td');
        propertyAddressCell.textContent = entry.property_address || '';
        row.appendChild(propertyAddressCell);

        const propertyIdCell = document.createElement('td');
        propertyIdCell.textContent = entry.property_id || '';
        row.appendChild(propertyIdCell);

        const fileNameCell = document.createElement('td');
        const publicUrl = getPublicUrl(entry);
        if (publicUrl) {
          const fileAnchor = document.createElement('a');
          fileAnchor.href = '#';
          fileAnchor.target = '_blank';
          fileAnchor.rel = 'noopener noreferrer';
          fileAnchor.textContent = entry.file_name || 'Open file';
          fileAnchor.addEventListener('click', function (openEvent) {
            openEvent.preventDefault();
            window.open(publicUrl, '_blank', 'noopener,noreferrer');
          });
          fileNameCell.appendChild(fileAnchor);
        } else {
          fileNameCell.textContent = entry.file_name || '';
        }
        row.appendChild(fileNameCell);

        const fileTypeCell = document.createElement('td');
        fileTypeCell.textContent = entry.file_type || '';
        row.appendChild(fileTypeCell);

        const listingAgentCell = document.createElement('td');
        listingAgentCell.textContent = entry.uploaded_by || '';
        row.appendChild(listingAgentCell);

        const uploadDateCell = document.createElement('td');
        uploadDateCell.textContent = entry.created_at ? entry.created_at.slice(0, 10) : '';
        row.appendChild(uploadDateCell);

        const statusCell = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = entry.hidden ? 'badge-hidden' : 'badge-visible';
        statusBadge.textContent = entry.hidden ? 'Hidden' : 'Visible';
        statusCell.appendChild(statusBadge);
        row.appendChild(statusCell);

        const actionsCell = document.createElement('td');
        const actionsWrapper = document.createElement('div');
        actionsWrapper.className = 'table-actions';

        const toggleButton = document.createElement('button');
        toggleButton.type = 'button';
        toggleButton.className = 'action-link';
        toggleButton.setAttribute('data-action', 'toggle');
        toggleButton.setAttribute('data-id', String(entry.id));
        toggleButton.textContent = entry.hidden ? 'Unhide' : 'Hide';
        actionsWrapper.appendChild(toggleButton);

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.className = 'action-link';
        deleteButton.setAttribute('data-action', 'delete');
        deleteButton.setAttribute('data-id', String(entry.id));
        deleteButton.textContent = 'Delete';
        actionsWrapper.appendChild(deleteButton);

        actionsCell.appendChild(actionsWrapper);
        row.appendChild(actionsCell);

        tableFragment.appendChild(row);
      });

      tableBody.appendChild(tableFragment);
    }

    async function refreshTable() {
      allEntries = await loadEntries();
      renderRows(allEntries);
    }

    function openModal() {
      if (!modal) return;
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
      logoutButton.addEventListener('click', async function () {
        await supabaseClient.auth.signOut();
        window.location.href = 'login.html';
      });
    }

    [filterType, filterVisibility, filterProperty].forEach((field) => {
      if (field) field.addEventListener('change', function () { renderRows(allEntries); });
    });

    tableBody.addEventListener('click', async function (event) {
      const action = event.target.getAttribute('data-action');
      const id = event.target.getAttribute('data-id');
      if (!action || !id) return;

      const entry = allEntries.find((e) => String(e.id) === id);
      if (!entry) return;

      if (action === 'toggle') {
        const { error } = await supabaseClient
          .from('documents')
          .update({ hidden: !entry.hidden })
          .eq('id', id);

        if (error) {
          console.error('Toggle failed:', error);
          alert('Failed to update visibility: ' + error.message);
          return;
        }
        await refreshTable();
      }

      if (action === 'delete') {
        const confirmed = window.confirm('Delete this document? This cannot be undone.');
        if (!confirmed) return;

        if (entry.bucket_name && entry.file_path) {
          const { error: storageError } = await supabaseClient.storage
            .from(entry.bucket_name)
            .remove([entry.file_path]);
          if (storageError) {
            console.error('Storage delete failed:', storageError);
          }
        }

        const { error } = await supabaseClient
          .from('documents')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Delete failed:', error);
          alert('Failed to delete document: ' + error.message);
          return;
        }
        await refreshTable();
      }
    });

    if (uploadForm && fileInput) {
      uploadForm.addEventListener('submit', async function (event) {
        event.preventDefault();

        const selectedFile = fileInput.files[0];

        if (!selectedFile) {
          alert('Please choose a file first.');
          return;
        }

        if (selectedFile.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
          alert(`File size must not exceed ${MAX_UPLOAD_FILE_SIZE_MB} MB.`);
          return;
        }

        if (!isAllowedFileType(selectedFile.type, selectedFile.name)) {
          alert('Unsupported file type. Upload a PDF, image, Word, Excel, or text file.');
          return;
        }

        const bucketName = selectedFile.type.startsWith('image/') ? 'property-images' : 'property-documents';
        const filePath = `${Date.now()}-${selectedFile.name}`;

        const { error: uploadError } = await supabaseClient.storage
          .from(bucketName)
          .upload(filePath, selectedFile);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          alert('Upload failed: ' + uploadError.message);
          return;
        }

        const { error: dbError } = await supabaseClient
          .from('documents')
          .insert([{
            file_name: selectedFile.name,
            file_type: uploadForm.fileType ? uploadForm.fileType.value : selectedFile.type,
            bucket_name: bucketName,
            file_path: filePath,
            file_size: selectedFile.size,
            uploaded_by: uploadForm.listingAgent ? uploadForm.listingAgent.value.trim() : userEmail,
            property_address: uploadForm.propertyAddress ? uploadForm.propertyAddress.value.trim() : '',
            property_id: uploadForm.propertyId ? uploadForm.propertyId.value.trim() : '',
            hidden: false
          }]);

        if (dbError) {
          console.error('DB insert error:', dbError);
          alert('File uploaded but database record failed: ' + dbError.message);
          return;
        }

        uploadForm.reset();
        closeModal();
        await refreshTable();
      });
    }

    populatePropertyFilter();
    await refreshTable();
  }

  document.addEventListener('DOMContentLoaded', async function () {
    handleLoginPage();
    await renderAdminPage();
  });
})();
