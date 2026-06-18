(function () {
  const LEAD_STATUS_OPTIONS = [
    { value: 'not_viewed', label: 'Not Viewed Yet' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'complete', label: 'Complete' }
  ];

  const DASHBOARD_SECTIONS = [
    {
      key: 'contact',
      table: 'contact_requests',
      emptyMessage: 'No contact requests found.',
      columns: [
        { field: 'name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'inquiry_type', formatter: formatInquiryType },
        { field: 'property_interest', wrap: true },
        { field: 'message', wrap: true },
        { field: 'created_at', formatter: formatDateTime },
        { type: 'status' },
        { type: 'notes' },
        { type: 'actions' }
      ]
    },
    {
      key: 'showing',
      table: 'showing_requests',
      emptyMessage: 'No showing requests found.',
      columns: [
        { field: 'name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'property_address', wrap: true },
        { field: 'preferred_date', formatter: formatDateOnly },
        { field: 'preferred_time', formatter: formatTimeString },
        { field: 'message', wrap: true },
        { field: 'created_at', formatter: formatDateTime },
        { type: 'status' },
        { type: 'notes' },
        { type: 'actions' }
      ]
    },
    {
      key: 'renovation',
      table: 'renovation_clients',
      emptyMessage: 'No renovation clients found.',
      columns: [
        { field: 'full_name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'property_address', wrap: true },
        { field: 'service_needed' },
        { field: 'project_type' },
        { field: 'project_description', wrap: true },
        { field: 'timeline' },
        { field: 'budget_range' },
        { field: 'status' },
        { field: 'created_at', formatter: formatDateTime },
      ]
    }
  ];

  function sanitizeLeadStatus(value) {
    return LEAD_STATUS_OPTIONS.some((option) => option.value === value) ? value : 'not_viewed';
  }

  function formatInquiryType(value) {
    // Keep these labels aligned with contact.html field options and the schema constraint.
    const labels = {
      general_inquiry: 'General Inquiry',
      rental_help: 'Help Finding a Rental',
      buyer_agent_request: 'Request Brandy as My Agent',
      property_inquiry: 'Property Inquiry',
      showing_request: 'Request for a Showing',
      renovation_client_inquiry: 'Renovation Client Inquiry',
      renovation_help: 'Help Renovating',
      maintenance_request: 'Maintenance / Property Manager Request',
      seller_help: 'Help Selling My House'
    };
    return escapeHtml(labels[value] || value || 'N/A');
  }

  function getLeadLabel(row) {
    return escapeHtml(row.name || row.full_name || row.email || row.company_name || 'this inquiry');
  }

  function formatDateTime(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }));
  }

  function formatDateOnly(value) {
    if (!value) return 'N/A';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }));
  }

  function formatTimeString(value) {
    if (!value) return 'N/A';
    const normalized = String(value).trim();
    if (!normalized) return 'N/A';

    const parsed = new Date(`1970-01-01T${normalized}`);
    if (!Number.isNaN(parsed.getTime())) {
      return escapeHtml(parsed.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      }));
    }

    return escapeHtml(normalized);
  }

  function getSectionByKey(sectionKey) {
    return DASHBOARD_SECTIONS.find((section) => section.key === sectionKey) || null;
  }

  function getSectionSelectFields(section) {
    const fields = new Set(['id', 'admin_status', 'admin_notes']);
    section.columns.forEach((column) => {
      if (column.field) fields.add(column.field);
    });
    return Array.from(fields).join(', ');
  }

  function renderStatusEditor(sectionKey, row) {
    const current = sanitizeLeadStatus(row.admin_status);
    const options = LEAD_STATUS_OPTIONS.map((option) => {
      const selected = option.value === current ? ' selected' : '';
      return `<option value="${escapeHtml(option.value)}"${selected}>${escapeHtml(option.label)}</option>`;
    }).join('');
    return `<select class="dashboard-inline-select" data-status-input="${escapeHtml(sectionKey)}" aria-label="Lead status for ${getLeadLabel(row)}">${options}</select>`;
  }

  function renderNotesEditor(sectionKey, row) {
    return `<textarea class="dashboard-inline-notes" data-notes-input="${escapeHtml(sectionKey)}" rows="4" aria-label="Admin notes for ${getLeadLabel(row)}">${escapeHtml(row.admin_notes || '')}</textarea>`;
  }

  function renderSaveAction(sectionKey, row) {
    return `<button class="action-link" data-action="save-lead" data-section="${escapeHtml(sectionKey)}" data-id="${escapeHtml(row.id)}" type="button">Save</button>`;
  }

  function initTabs() {
    const tabs = Array.from(document.querySelectorAll('[data-dashboard-tab]'));
    const panels = Array.from(document.querySelectorAll('.dashboard-tab-panel'));
    if (!tabs.length || !panels.length) return;

    tabs.forEach((tab) => {
      tab.addEventListener('click', function () {
        const targetKey = tab.getAttribute('data-dashboard-tab');
        tabs.forEach((button) => {
          const isActive = button === tab;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        panels.forEach((panel) => {
          const isActive = panel.id === `panel-${targetKey}`;
          panel.hidden = !isActive;
          if (isActive) window.refreshMotion?.(panel);
        });
      });
    });
  }

  function setSectionState(sectionKey, options) {
    const loadingEl = document.getElementById(`${sectionKey}-loading`);
    const errorEl = document.getElementById(`${sectionKey}-error`);
    const emptyEl = document.getElementById(`${sectionKey}-empty`);

    if (loadingEl) {
      loadingEl.hidden = !options.loading;
      loadingEl.textContent = options.loadingMessage || loadingEl.textContent;
    }

    if (errorEl) {
      errorEl.hidden = !options.error;
      errorEl.textContent = options.error || '';
    }

    if (emptyEl) {
      emptyEl.hidden = !options.empty;
      if (options.emptyMessage) emptyEl.textContent = options.emptyMessage;
    }
  }

  function renderRows(section, rows) {
    const tbody = document.getElementById(`${section.key}-tbody`);
    if (!tbody) return;

    tbody.innerHTML = rows.map((row) => {
      const cells = section.columns.map((column) => {
        if (column.type === 'status') {
          return `<td class="dashboard-editor-cell">${renderStatusEditor(section.key, row)}</td>`;
        }
        if (column.type === 'notes') {
          return `<td class="dashboard-cell-wrap dashboard-editor-cell">${renderNotesEditor(section.key, row)}</td>`;
        }
        if (column.type === 'actions') {
          return `<td>${renderSaveAction(section.key, row)}</td>`;
        }

        const rawValue = row[column.field];
        const renderedValue = column.formatter
          ? column.formatter(rawValue, row)
          : rawValue === null || rawValue === undefined || String(rawValue).trim() === ''
            ? 'N/A'
            : escapeHtml(rawValue);
        const cellClass = column.wrap ? ' class="dashboard-cell-wrap"' : '';
        return `<td${cellClass}>${renderedValue}</td>`;
      }).join('');

      return `<tr data-row-id="${escapeHtml(row.id)}" data-current-status="${escapeHtml(sanitizeLeadStatus(row.admin_status))}">${cells}</tr>`;
    }).join('');
  }

  async function loadSection(section) {
    const tbody = document.getElementById(`${section.key}-tbody`);
    if (!tbody) return;

    tbody.innerHTML = '';
    setSectionState(section.key, {
      loading: true,
      loadingMessage: `Loading ${section.table.replace(/_/g, ' ')}…`,
      error: '',
      empty: false,
      emptyMessage: section.emptyMessage
    });

    const { data, error } = await supabaseClient
      .from(section.table)
      .select(getSectionSelectFields(section))
      .order('created_at', { ascending: false });

    if (error) {
      console.error(`${section.table} query failed:`, error);
      setSectionState(section.key, {
        loading: false,
        error: `Unable to load records: ${error.message}`,
        empty: false,
        emptyMessage: section.emptyMessage
      });
      return;
    }

    const rows = data || [];
    if (!rows.length) {
      setSectionState(section.key, {
        loading: false,
        error: '',
        empty: true,
        emptyMessage: section.emptyMessage
      });
      return;
    }

    renderRows(section, rows);
    setSectionState(section.key, {
      loading: false,
      error: '',
      empty: false,
      emptyMessage: section.emptyMessage
    });
  }

  async function saveLeadUpdate(sectionKey, rowId, button) {
    const section = getSectionByKey(sectionKey);
    const tbody = document.getElementById(`${sectionKey}-tbody`);
    const row = tbody ? tbody.querySelector(`tr[data-row-id="${rowId}"]`) : null;
    if (!section || !row) return;

    const statusInput = row.querySelector(`[data-status-input="${sectionKey}"]`);
    const notesInput = row.querySelector(`[data-notes-input="${sectionKey}"]`);
    const adminStatus = sanitizeLeadStatus(statusInput ? statusInput.value : row.getAttribute('data-current-status'));
    const adminNotes = notesInput ? notesInput.value.trim() : '';

    if (button) {
      button.disabled = true;
      button.textContent = 'Saving…';
    }

    const { error } = await supabaseClient
      .from(section.table)
      .update({
        admin_status: adminStatus,
        admin_notes: adminNotes || null
      })
      .eq('id', rowId);

    if (error) {
      console.error(`${section.table} update failed:`, error);
      window.alert(`Unable to save lead details: ${error.message}`);
      if (button) {
        button.disabled = false;
        button.textContent = 'Save';
      }
      return;
    }

    await loadSection(section);
  }

  async function guardDashboardAccess() {
    if (typeof supabaseClient === 'undefined' || !supabaseClient) {
      window.location.replace('login.html');
      return null;
    }

    const session = await getSession();
    if (!session) {
      window.location.replace('login.html');
      return null;
    }

    const role = await getCurrentUserRole();
    if (role !== 'admin') {
      window.location.replace(role === 'client' ? 'client-portal.html' : 'login.html');
      return null;
    }

    return session;
  }

  function setupLogout() {
    const logoutButton = document.getElementById('logout-button');
    if (!logoutButton) return;

    logoutButton.addEventListener('click', async function () {
      await supabaseClient.auth.signOut();
      window.location.href = 'login.html';
    });
  }

  async function renderDashboard() {
    const session = await guardDashboardAccess();
    if (!session) return;

    // Auth passed; reveal page content
    const style = document.getElementById('auth-guard-style');
    if (style) style.remove();
    document.body.style.visibility = 'visible';

    const userDisplay = document.getElementById('logged-in-user');
    if (userDisplay) userDisplay.textContent = session.user.email || 'Admin user';

    setupLogout();
    initTabs();
    DASHBOARD_SECTIONS.forEach((section) => {
      const tbody = document.getElementById(`${section.key}-tbody`);
      if (!tbody) return;
      tbody.addEventListener('click', function (event) {
        const button = event.target.closest('[data-action="save-lead"]');
        if (!button) return;
        saveLeadUpdate(button.getAttribute('data-section'), button.getAttribute('data-id'), button);
      });
    });
    await Promise.all(DASHBOARD_SECTIONS.map(loadSection));
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderDashboard();
  });
})();
