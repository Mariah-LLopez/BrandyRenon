// DEVELOPER NOTE: Replace all property data below with actual property details.
// Update property address, price, descriptions, photos, agent info, etc.
// Photo URLs should be replaced with actual hosted images before launch.
const PROPERTIES = [
  {
    id: "prop-001",
    title: "Mountain View Estate",
    address: "1234 Rocky Mountain Road, Denver, CO 80201",
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
    agentLicense: "FA.100012345",
    agentNMLS: "",
    brokerageName: "Colorado Premier Realty",
    licensingDisclosure: "Licensed in Colorado. FA.100012345.",
    fairHousing: "Equal Housing Opportunity. We are pledged to the letter and spirit of the U.S. policy for the achievement of equal housing opportunity throughout the Nation."
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
    agentLicense: "FA.100012345",
    agentNMLS: "",
    brokerageName: "Colorado Premier Realty",
    licensingDisclosure: "Licensed in Colorado. FA.100012345.",
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
    agentLicense: "FA.100012345",
    agentNMLS: "",
    brokerageName: "Colorado Premier Realty",
    licensingDisclosure: "Licensed in Colorado. FA.100012345.",
    fairHousing: "Equal Housing Opportunity."
  },
  {
    id: "prop-004",
    title: "Modern Downtown Condo",
    address: "222 Pearl Street #4B, Fort Collins, CO 80524",
    lat: 40.5853,
    lng: -105.0844,
    status: "Coming Soon",
    price: 375000,
    sqft: 1100,
    bedrooms: 2,
    bathrooms: 2,
    lotSize: "N/A (Condo)",
    description: "Sleek modern condo in the heart of Fort Collins with walkable amenities, stylish finishes, and secure building access.",
    renovationDetails: "Fully updated in 2022. New flooring, lighting, and kitchen appliances throughout.",
    permitInfo: "All updates completed with HOA approval and required permits.",
    hoaInfo: "HOA fee: $320/month. Covers water, trash, building maintenance, and parking.",
    zoningInfo: "Zoned D – Downtown District.",
    photos: [
      "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
      "https://images.unsplash.com/photo-1560185127-6a4df3bda7e6?w=800",
      "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800"
    ],
    listingAgent: "Brandy Renon",
    agentLicense: "FA.100012345",
    agentNMLS: "",
    brokerageName: "Colorado Premier Realty",
    licensingDisclosure: "Licensed in Colorado. FA.100012345.",
    fairHousing: "Equal Housing Opportunity."
  },
  {
    id: "prop-005",
    title: "Luxury Lakefront Retreat",
    address: "789 Evergreen Circle, Lakewood, CO 80226",
    lat: 39.7047,
    lng: -105.0814,
    status: "Sold",
    price: 875000,
    sqft: 4100,
    bedrooms: 5,
    bathrooms: 4,
    lotSize: "0.75 acres",
    description: "Stunning lakefront property with breathtaking views, multiple entertaining areas, and premium finishes throughout the residence.",
    renovationDetails: "Complete luxury renovation in 2020. Chef's kitchen, home theater, wine cellar.",
    permitInfo: "Full renovation completed under permit. Final inspection approved.",
    hoaInfo: "HOA fee: $200/month. Includes lake access, dock maintenance, and community events.",
    zoningInfo: "Zoned A-2 Agricultural/Residential with lake access rights.",
    photos: [
      "https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=800",
      "https://images.unsplash.com/photo-1575517111839-3a3843ee7f5d?w=800",
      "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800"
    ],
    listingAgent: "Brandy Renon",
    agentLicense: "FA.100012345",
    agentNMLS: "",
    brokerageName: "Colorado Premier Realty",
    licensingDisclosure: "Licensed in Colorado. FA.100012345.",
    fairHousing: "Equal Housing Opportunity."
  }
];

// DEVELOPER NOTE: Update AGENT_INFO with actual agent details before launch.
const AGENT_INFO = {
  name: "Brandy Renon",
  license: "FA.100012345",
  nmls: "",
  brokerage: "Colorado Premier Realty",
  brokerageLicense: "EC.100012345",
  phone: "(720) 555-0100",
  email: "brandy@coloradopremierrealty.com",
  website: "www.coloradopremierrealty.com"
};

window.PROPERTIES = PROPERTIES;
window.AGENT_INFO = AGENT_INFO;
