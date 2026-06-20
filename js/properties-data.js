// DEVELOPER NOTE: Replace all property data below with actual property details.
// Update property address, price, descriptions, photos, agent info, etc.
// Photo URLs should be replaced with actual hosted images before launch.
const PROPERTIES = [
  {
    id: "prop-001",
    title: "Mountain View Estate",
    address: "397 Mule Deer Crossing",
    lat: 39.7392,
    lng: -104.9903,
    status: "Active",
    price: 625000,
    sqft: 2850,
    bedrooms: 4,
    bathrooms: 3,
    lotSize: "0.25 acres",
    description: "A beautifully maintained home with stunning mountain views, expansive windows, and inviting indoor-outdoor living spaces ideal for Colorado entertaining.",
    renovationDetails: "Newly renovated kitchen (2023) with quartz countertops, stainless steel appliances, and custom cabinetry. Updated bathrooms with modern fixtures.",
    permitInfo: "All renovations completed with proper permits. Permit numbers on file with listing agent.",
    hoaInfo: "Monthly HOA fee: $150/month. Covers landscaping, snow removal, and community amenities.",
    zoningInfo: "Zoned R-1 Single Family Residential.",
    photos: [
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800",
      "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
      "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800"
    ],
    listingAgent: "Brandy Renon",
    licensingDisclosure: "Independent Level Real Estate Broker - Individual Proprietor",
    fairHousing: "Equal Housing Opportunity."
  },
  {
    id: "prop-002",
    title: "Charming Highlands Bungalow",
    address: "5678 Aspen Lane, Boulder, CO 80302",
    lat: 40.0150,
    lng: -105.2705,
    status: "Pending",
    price: 489000,
    sqft: 1650,
    bedrooms: 3,
    bathrooms: 2,
    lotSize: "0.18 acres",
    description: "Charming bungalow nestled in a quiet neighborhood with easy access to hiking trails, local dining, and Boulder lifestyle amenities.",
    renovationDetails: "Fresh exterior paint, new roof (2022), updated electrical panel.",
    permitInfo: "Roof replacement and electrical update completed with permits. Contact agent for details.",
    hoaInfo: "No HOA.",
    zoningInfo: "Zoned R-2 Low-Density Residential.",
    photos: [
      "https://images.unsplash.com/photo-1449844908441-8829872d2607?w=800",
      "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=800"
    ],
    listingAgent: "Brandy Renon",
    licensingDisclosure: "Independent Level Real Estate Broker - Individual Proprietor",
    fairHousing: "Equal Housing Opportunity."
  },
  {
    id: "prop-003",
    title: "Spacious Suburban Family Home",
    address: "910 Ponderosa Drive, Colorado Springs, CO 80903",
    lat: 38.8339,
    lng: -104.8214,
    status: "Active",
    price: 545000,
    sqft: 3200,
    bedrooms: 5,
    bathrooms: 3.5,
    lotSize: "0.35 acres",
    description: "Spacious family home in a desirable Colorado Springs neighborhood with generous gathering spaces, mature landscaping, and a flexible floor plan.",
    renovationDetails: "Primary suite added in 2021 with spa-like bathroom. Open-concept main floor remodel.",
    permitInfo: "Addition built with full permits and inspections. Available upon request.",
    hoaInfo: "HOA fee: $85/month. Covers community pool, tennis courts, and park maintenance.",
    zoningInfo: "Zoned R-1 Single Family Residential.",
    photos: [
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800",
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800"
    ],
    listingAgent: "Brandy Renon",
    licensingDisclosure: "Independent Level Real Estate Broker - Individual Proprietor",
    fairHousing: "Equal Housing Opportunity."
  },
];

const AGENT_INFO = {
  name: "Brandy Renon",
  license: "II100070680",
  phone: "(719)291-8378",
  email: "propertiesinco@gmail.com",
};

window.PROPERTIES = PROPERTIES;
window.AGENT_INFO = AGENT_INFO;
