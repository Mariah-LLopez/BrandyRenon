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

  function geocodeAddress(address) {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
    return fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'BrandyRenonRealEstate/1.0 (propertiesinco@gmail.com)'
      }
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.length > 0) {
          return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
        }
        return null;
      })
      .catch(function (err) {
        console.warn('Geocoding failed for address:', address, err);
        return null;
      });
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function geocodeSequential(properties) {
    return properties.reduce(function (chain, property, index) {
      return chain.then(function (results) {
        return (index === 0 ? Promise.resolve() : delay(1100))
          .then(function () { return resolveCoords(property); })
          .then(function (coords) {
            results.push(coords ? { coords: coords, property: property } : null);
            return results;
          });
      });
    }, Promise.resolve([]));
  }

  function resolveCoords(property) {
    if (property.lat && property.lng) {
      return Promise.resolve({ lat: property.lat, lng: property.lng });
    }
    return geocodeAddress(property.address);
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
    geocodeSequential(window.PROPERTIES).then(function (results) {
      results.forEach(function (result) {
        if (!result) return;
        const marker = L.marker([result.coords.lat, result.coords.lng]).addTo(map);
        marker.bindPopup(createPopupContent(result.property));
        bounds.push([result.coords.lat, result.coords.lng]);
      });
      if (bounds.length > 1) {
        map.fitBounds(bounds, { padding: [35, 35] });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 15);
      }
    });

    return map;
  }

  function initializeSinglePropertyMap(containerId, lat, lng, property) {
    const container = document.getElementById(containerId);
    if (!container || typeof L === 'undefined') return;

    const map = L.map(containerId, { scrollWheelZoom: false }).setView([lat, lng], 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    L.marker([lat, lng])
      .addTo(map)
      .bindPopup('<strong>' + property.title + '</strong><br>' + property.address)
      .openPopup();

    return map;
  }

  document.addEventListener('DOMContentLoaded', function () {
    initializeMap('homepage-map', { zoom: 7, scrollWheelZoom: false });

    const detailContainer = document.getElementById('property-detail-map');
    const property = window.currentDetailProperty;
    if (detailContainer && property) {
      resolveCoords(property).then(function (coords) {
        if (coords) {
          initializeSinglePropertyMap('property-detail-map', coords.lat, coords.lng, property);
        }
      });
    }
  });
})();
