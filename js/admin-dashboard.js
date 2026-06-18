(function () {
  const DASHBOARD_SECTIONS = [
    {
      key: 'contact',
      table: 'contact_requests',
      emptyMessage: 'No contact requests found.',
      columns: [
        { field: 'name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'message', wrap: true },
        { field: 'created_at', formatter: formatDateTime }
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
        { field: 'created_at', formatter: formatDateTime }
      ]
    },
    {
      key: 'contractor',
      table: 'contractor_inquiries',
      emptyMessage: 'No contractor inquiries found.',
      columns: [
        { field: 'full_name' },
        { field: 'company_name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'service_type' },
        { field: 'service_area', wrap: true },
        { field: 'project_description', wrap: true },
        { field: 'created_at', formatter: formatDateTime }
      ]
    },
    {
      key: 'flip',
      table: 'house_flip_inquiries',
      emptyMessage: 'No house flip inquiries found.',
      columns: [
        { field: 'full_name' },
        { field: 'email' },
        { field: 'phone' },
        { field: 'property_address', wrap: true },
        { field: 'property_condition' },
        { field: 'estimated_value' },
        { field: 'project_description', wrap: true },
        { field: 'created_at', formatter: formatDateTime }
      ]
    }
  ];

  function formatDateTime(value) {
    if (!value) return '—';
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
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return escapeHtml(date.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }));
  }

  function formatTimeString(value) {
    if (!value) return '—';
    const normalized = String(value).trim();
    if (!normalized) return '—';

    const parsed = new Date(`1970-01-01T${normalized}`);
    if (!Number.isNaN(parsed.getTime())) {
      return escapeHtml(parsed.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      }));
    }

    return escapeHtml(normalized);
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
          panel.hidden = panel.id !== `panel-${targetKey}`;
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
        const rawValue = row[column.field];
        const renderedValue = column.formatter
          ? column.formatter(rawValue, row)
          : rawValue === null || rawValue === undefined || String(rawValue).trim() === ''
            ? '—'
            : escapeHtml(rawValue);
        const cellClass = column.wrap ? ' class="dashboard-cell-wrap"' : '';
        return `<td${cellClass}>${renderedValue}</td>`;
      }).join('');

      return `<tr>${cells}</tr>`;
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
      .select(section.columns.map((column) => column.field).join(', '))
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

    // Auth passed — reveal page content
    const style = document.getElementById('auth-guard-style');
    if (style) style.remove();
    document.body.style.visibility = 'visible';

    const userDisplay = document.getElementById('logged-in-user');
    if (userDisplay) userDisplay.textContent = session.user.email || 'Admin user';

    setupLogout();
    initTabs();
    await Promise.all(DASHBOARD_SECTIONS.map(loadSection));
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderDashboard();
  });
})();
