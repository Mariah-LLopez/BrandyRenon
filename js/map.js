(function () {
  function createPopupContent(property) {
    return `
      <div class="popup-card">
        <img src="${property.photos[0]}" alt="Map preview for ${property.title}">
        <strong>${property.title}</strong>
        <span>${property.address}</span>
        <span>${window.formatPrice ? window.formatPrice(property.price) : property.price}</span>
        ${window.formatStatusBadge ? window.formatStatusBadge(property.status) : property.status}
        <a class="action-link" href="property-detail.html?id=${property.id}">View details</a>
      </div>
    `;
  }

  function initializeMap(containerId, options) {
    const container = document.getElementById(containerId);
    if (!container || typeof L === 'undefined' || !window.PROPERTIES) return;

    const map = L.map(containerId, {
      scrollWheelZoom: options.scrollWheelZoom
    }).setView([39.113014, -105.358887], options.zoom);

    // DEVELOPER NOTE: To use a custom tile provider (e.g. Mapbox), replace the tileLayer URL and add your API key here.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    const bounds = [];
    window.PROPERTIES.forEach((property) => {
      const marker = L.marker([property.lat, property.lng]).addTo(map);
      marker.bindPopup(createPopupContent(property));
      bounds.push([property.lat, property.lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [35, 35] });
    }

    return map;
  }

  function initializeSinglePropertyMap(containerId, property) {
    const container = document.getElementById(containerId);
    if (!container || typeof L === 'undefined' || !property) return;

    const map = L.map(containerId, { scrollWheelZoom: false }).setView([property.lat, property.lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.marker([property.lat, property.lng])
      .addTo(map)
      .bindPopup(`<strong>${property.title}</strong><br>${property.address}`)
      .openPopup();

    return map;
  }

  document.addEventListener('DOMContentLoaded', function () {
    initializeMap('homepage-map', { zoom: 7, scrollWheelZoom: false });
    if (document.getElementById('property-detail-map') && window.currentDetailProperty) {
      initializeSinglePropertyMap('property-detail-map', window.currentDetailProperty);
    }
  });
})();
