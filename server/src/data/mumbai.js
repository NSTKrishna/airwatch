// Reference geography for the Mumbai demonstration.
export const CITY = { name: 'Mumbai', latitude: 19.076, longitude: 72.8777, zoom: 11 };

// Eight DEMONSTRATION sites in four recognisable Mumbai areas. They are not real
// construction projects and no device is installed at any of them. Each area has
// one simulated background station; sites sit 240-410 m from it, the station
// distance range the PM10 model was trained on.
export const LOCALITIES = [
  { code: 'MUM-AND', name: 'Andheri', latitude: 19.1136, longitude: 72.8697, sites: [
    { suffix: '01', label: 'A', area: 'Andheri East', distance: 300, bearing: 40 },
    { suffix: '02', label: 'B', area: 'Andheri West', distance: 380, bearing: 215 },
  ] },
  { code: 'MUM-BAN', name: 'Bandra', latitude: 19.0596, longitude: 72.8295, sites: [
    { suffix: '01', label: 'A', area: 'Bandra West', distance: 260, bearing: 110 },
    { suffix: '02', label: 'B', area: 'Bandra Kurla Complex side', distance: 400, bearing: 300 },
  ] },
  { code: 'MUM-KUR', name: 'Kurla', latitude: 19.0726, longitude: 72.8845, sites: [
    { suffix: '01', label: 'A', area: 'Kurla West', distance: 340, bearing: 70 },
    { suffix: '02', label: 'B', area: 'Kurla East', distance: 280, bearing: 250 },
  ] },
  { code: 'MUM-POW', name: 'Powai', latitude: 19.1176, longitude: 72.906, sites: [
    { suffix: '01', label: 'A', area: 'Powai lake side', distance: 250, bearing: 20 },
    { suffix: '02', label: 'B', area: 'Hiranandani side', distance: 360, bearing: 160 },
  ] },
];
