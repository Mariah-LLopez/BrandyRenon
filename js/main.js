(function () {
  const NAV_LINKS = [
    { href: 'index.html', label: 'Home' },
    { href: 'properties.html', label: 'Properties' },
    { href: 'map.html', label: 'Map' },
    { href: 'house-flip.html', label: 'Sell Your Home' },
    { href: 'contractor.html', label: 'Contractors' },
    { href: 'contact.html', label: 'Contact' },
    { href: 'login.html', label: 'Portal Login' }
  ];

  function formatPrice(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value || 0);
  }

  function getStatusBadgeClass(status) {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'active') return 'badge-active';
    if (normalized === 'pending') return 'badge-pending';
    if (normalized === 'sold') return 'badge-sold';
    return 'badge-coming-soon';
  }

  function formatStatusBadge(status) {
    return `<span class="status-badge ${getStatusBadgeClass(status)}">${status}</span>`;
  }

  function injectNav() {
    const navMount = document.getElementById('site-nav');
    if (!navMount) return;
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    navMount.innerHTML = `
      <header class="site-header">
        <nav class="navbar" aria-label="Primary navigation">
          <a class="nav-brand" href="index.html" aria-label="Brandy Renon Colorado Real Estate home">
            <span>Brandy Renon | Colorado Real Estate</span>
            <small>Homes across Denver, Boulder, Fort Collins & beyond</small>
          </a>
          <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="primary-menu" aria-label="Toggle navigation menu">
            <span></span>
            <span></span>
            <span></span>
          </button>
          <ul class="nav-menu" id="primary-menu">
            ${NAV_LINKS.map((link) => {
              const isHome = currentPath === '' || currentPath === 'index.html';
              const active = (link.href === 'index.html' && isHome) || currentPath === link.href;
              return `<li><a class="nav-link${active ? ' active' : ''}" href="${link.href}"${active ? ' aria-current="page"' : ''}>${link.label}</a></li>`;
            }).join('')}
          </ul>
        </nav>
      </header>
    `;

    const toggle = navMount.querySelector('.nav-toggle');
    const menu = navMount.querySelector('.nav-menu');
    if (toggle && menu) {
      toggle.addEventListener('click', function () {
        const open = menu.classList.toggle('is-open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }
  }

  function injectFooter() {
    const footerMount = document.getElementById('site-footer');
    if (!footerMount) return;
    footerMount.innerHTML = `
      <footer class="site-footer">
        <div class="footer-grid">
          <div>
            <p><strong>Brandy Renon</strong></p>
            <p>Colorado Premier Realty</p>
            <p>License: FA.100012345</p>
            <p><a href="tel:+17205550100">(720) 555-0100</a></p>
            <p><a href="mailto:brandy@coloradopremierrealty.com">brandy@coloradopremierrealty.com</a></p>
          </div>
          <div>
            <p>Equal Housing Opportunity</p>
            <div class="footer-logo-wrap">
              <img src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%2314293f'/><path d='M12 29 32 13l20 16' stroke='%23C8963E' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/><path d='M18 28v23h28V28' stroke='%23C8963E' stroke-width='4' fill='none' stroke-linecap='round' stroke-linejoin='round'/><path d='M22 35h20M22 42h20' stroke='%23C8963E' stroke-width='4' stroke-linecap='round'/></svg>" alt="Equal Housing Opportunity icon" width="40" height="40">
              <span>Inclusive service for buyers, sellers, and investors.</span>
            </div>
            <div class="footer-links">
              <a href="privacy-policy.html">Privacy Policy</a>
              <a href="terms-of-use.html">Terms of Use</a>
              <a href="fair-housing.html">Fair Housing</a>
              <a href="copyright.html">Copyright</a>
            </div>
          </div>
          <div>
            <p class="disclaimer">Information deemed reliable but not guaranteed. Buyers should independently verify all property details, including square footage, permits, zoning, HOA information, and school district information.</p>
          </div>
        </div>
        <p class="copyright-line">&copy; 2024 Brandy Renon | Colorado Premier Realty. All Rights Reserved.</p>
      </footer>
    `;
  }

  function getPropertyById(id) {
    return (window.PROPERTIES || []).find((property) => property.id === id);
  }

  function renderPropertyCard(property) {
    return `
      <article class="property-card" aria-label="${property.title}">
        <div class="property-card-image-wrap">
          <img class="property-card-image" src="${property.photos[0]}" alt="Exterior view of ${property.title}" loading="lazy">
          <div class="property-card-status">${formatStatusBadge(property.status)}</div>
        </div>
        <div class="property-card-body">
          <div>
            <div class="property-card-price">${formatPrice(property.price)}</div>
            <h3>${property.title}</h3>
            <p class="property-card-address">${property.address}</p>
          </div>
          <ul class="property-meta" aria-label="Property details">
            <li>${property.bedrooms} Beds</li>
            <li>${property.bathrooms} Baths</li>
            <li>${property.sqft.toLocaleString()} Sq Ft</li>
            <li>${property.lotSize}</li>
          </ul>
          <p>${property.description}</p>
          <div class="property-card-actions">
            <a class="btn-secondary" href="property-detail.html?id=${property.id}">View Details</a>
            <a class="btn-primary" href="contact.html?property=${property.id}">Book a Showing</a>
          </div>
        </div>
      </article>
    `;
  }

  function renderHomeProperties() {
    const grid = document.getElementById('featured-properties-grid');
    if (!grid || !window.PROPERTIES) return;
    grid.innerHTML = window.PROPERTIES.map(renderPropertyCard).join('');
  }

  function renderPropertiesPage() {
    const grid = document.getElementById('properties-grid');
    if (!grid || !window.PROPERTIES) return;

    const statusFilter = document.getElementById('filter-status');
    const minPriceFilter = document.getElementById('filter-min-price');
    const maxPriceFilter = document.getElementById('filter-max-price');
    const bedroomFilter = document.getElementById('filter-bedrooms');
    const resultsCount = document.getElementById('results-count');
    const resetButton = document.getElementById('reset-filters');

    function updateGrid() {
      const status = statusFilter ? statusFilter.value : 'All';
      const minPrice = Number(minPriceFilter?.value || 0);
      const maxPrice = Number(maxPriceFilter?.value || 0);
      const minBedrooms = Number(bedroomFilter?.value || 0);

      const filtered = window.PROPERTIES.filter((property) => {
        const matchesStatus = status === 'All' || property.status === status;
        const matchesMinPrice = !minPrice || property.price >= minPrice;
        const matchesMaxPrice = !maxPrice || property.price <= maxPrice;
        const matchesBedrooms = !minBedrooms || property.bedrooms >= minBedrooms;
        return matchesStatus && matchesMinPrice && matchesMaxPrice && matchesBedrooms;
      });

      resultsCount.textContent = `${filtered.length} ${filtered.length === 1 ? 'property' : 'properties'} shown`;
      if (!filtered.length) {
        grid.innerHTML = '<div class="empty-state"><h3>No matching properties</h3><p>Try adjusting the status, price, or bedroom filters to broaden your search.</p></div>';
        return;
      }
      grid.innerHTML = filtered.map(renderPropertyCard).join('');
    }

    [statusFilter, minPriceFilter, maxPriceFilter, bedroomFilter].forEach((element) => {
      if (element) element.addEventListener('input', updateGrid);
      if (element) element.addEventListener('change', updateGrid);
    });

    if (resetButton) {
      resetButton.addEventListener('click', function () {
        if (statusFilter) statusFilter.value = 'All';
        if (minPriceFilter) minPriceFilter.value = '';
        if (maxPriceFilter) maxPriceFilter.value = '';
        if (bedroomFilter) bedroomFilter.value = '0';
        updateGrid();
      });
    }

    updateGrid();
  }

  function setupPropertyGallery() {
    const mainImage = document.getElementById('detail-main-image');
    const thumbs = document.querySelectorAll('.thumbnail-button');
    thumbs.forEach((button) => {
      button.addEventListener('click', function () {
        const image = button.getAttribute('data-image');
        const alt = button.getAttribute('data-alt');
        if (mainImage && image) {
          mainImage.src = image;
          mainImage.alt = alt || mainImage.alt;
        }
        thumbs.forEach((thumb) => thumb.classList.remove('active'));
        button.classList.add('active');
      });
    });
  }

  function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function renderPropertyDetailPage() {
    const mount = document.getElementById('property-detail-content');
    if (!mount || !window.PROPERTIES) return;

    const propertyId = getUrlParam('id');
    const requestedProperty = getPropertyById(propertyId);

    if (propertyId && !requestedProperty) {
      mount.innerHTML = `
        <section class="section">
          <div class="container not-found-card empty-state">
            <h1>Property not found</h1>
            <p>The requested property could not be found. Please browse the full property catalog instead.</p>
            <a class="btn-secondary" href="properties.html">Browse Properties</a>
          </div>
        </section>
      `;
      return;
    }

    const property = requestedProperty || window.PROPERTIES[0];
    mount.innerHTML = `
      <section class="page-hero">
        <div class="container">
          <div class="section-header">
            <span class="eyebrow">Property details</span>
            <h1>${property.title}</h1>
            <p>${property.address}</p>
          </div>
        </div>
      </section>
      <section class="section">
        <div class="container detail-layout">
          <div class="detail-main">
            <div class="detail-gallery">
              <div class="gallery-main">
                <img id="detail-main-image" src="${property.photos[0]}" alt="Primary exterior view of ${property.title}">
              </div>
              <div class="thumbnail-strip" aria-label="Property image gallery">
                ${property.photos.map((photo, index) => `
                  <button class="thumbnail-button ${index === 0 ? 'active' : ''}" type="button" data-image="${photo}" data-alt="Photo ${index + 1} of ${property.title}">
                    <img src="${photo}" alt="Thumbnail ${index + 1} for ${property.title}" loading="lazy">
                  </button>
                `).join('')}
              </div>
            </div>
            <div class="info-card">
              <div class="detail-header">
                <div>
                  ${formatStatusBadge(property.status)}
                  <p class="detail-price">${formatPrice(property.price)}</p>
                  <ul class="quick-stats" aria-label="Property quick stats">
                    <li>${property.bedrooms} Bedrooms</li>
                    <li>${property.bathrooms} Bathrooms</li>
                    <li>${property.sqft.toLocaleString()} Sq Ft</li>
                    <li>${property.lotSize}</li>
                  </ul>
                </div>
                <div class="detail-actions">
                  <button type="button" class="btn-primary" data-open-showing-modal data-property-id="${property.id}">Book a Showing</button>
                  <a class="btn-secondary" href="contact.html?property=${property.id}">Contact Agent</a>
                </div>
              </div>
            </div>
            <div class="info-card">
              <h2>Property Overview</h2>
              <p>${property.description}</p>
            </div>
            <div class="info-card">
              <h2>Renovations & Improvements</h2>
              <p>${property.renovationDetails}</p>
            </div>
            <div class="info-card">
              <h2>Permits, HOA & Zoning</h2>
              <ul class="legal-list">
                <li><strong>Permit Information:</strong> ${property.permitInfo}</li>
                <li><strong>HOA Information:</strong> ${property.hoaInfo}</li>
                <li><strong>Zoning:</strong> ${property.zoningInfo}</li>
              </ul>
            </div>
          </div>
          <aside class="detail-sidebar">
            <div class="sticky-card">
              <div class="agent-card">
                <span class="eyebrow">Listing representation</span>
                <h3>${property.listingAgent}</h3>
                <ul class="agent-contact-list">
                  <li>License: ${property.agentLicense}</li>
                  <li>Brokerage: ${property.brokerageName}</li>
                  <li>${window.AGENT_INFO?.phone || ''}</li>
                  <li>${window.AGENT_INFO?.email || ''}</li>
                </ul>
                <div class="agent-actions">
                  <a class="btn-secondary" href="tel:+17205550100">Call Agent</a>
                  <a class="btn-primary" href="mailto:${window.AGENT_INFO?.email || ''}">Email Agent</a>
                </div>
              </div>
            </div>
            <div class="info-card">
              <h3>Licensing Disclosure</h3>
              <p class="disclosure">${property.licensingDisclosure}</p>
            </div>
            <div class="info-card">
              <h3>Fair Housing Statement</h3>
              <p class="disclosure">${property.fairHousing}</p>
            </div>
          </aside>
        </div>
      </section>
    `;

    const modalPropertySelect = document.querySelector('#showing-form select[name="property"]');
    if (modalPropertySelect) modalPropertySelect.value = property.id;
    setupPropertyGallery();
  }

  function setupModal() {
    const modal = document.getElementById('showing-modal');
    if (!modal) return;
    const openers = document.querySelectorAll('[data-open-showing-modal]');
    const closers = modal.querySelectorAll('[data-close-modal]');

    function openModal(propertyId) {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      const propertySelect = modal.querySelector('select[name="property"]');
      if (propertySelect && propertyId) propertySelect.value = propertyId;
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
    }

    openers.forEach((button) => {
      button.addEventListener('click', function () {
        openModal(button.getAttribute('data-property-id'));
      });
    });

    closers.forEach((button) => button.addEventListener('click', closeModal));
    modal.addEventListener('click', function (event) {
      if (event.target === modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && modal.classList.contains('is-open')) closeModal();
    });
  }

  function init() {
    injectNav();
    injectFooter();
    renderHomeProperties();
    renderPropertiesPage();
    renderPropertyDetailPage();
    setupModal();
  }

  window.formatPrice = formatPrice;
  window.formatStatusBadge = formatStatusBadge;
  window.getStatusBadgeClass = getStatusBadgeClass;
  window.getPropertyById = getPropertyById;
  window.renderPropertyCard = renderPropertyCard;
  window.getUrlParam = getUrlParam;

  document.addEventListener('DOMContentLoaded', init);
})();
