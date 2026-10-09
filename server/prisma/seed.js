// Reference data + demo accounts for local development. Idempotent.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Locality centres and station -> site geometry follow the synthetic demo
// dataset the model was trained on. Each locality has the single background/site pair the dataset
// contains. Site names and positions are illustrative, not real construction projects.
const LOCALITIES = [
  { code: 'DEL-ROH', name: 'Rohini', latitude: 28.7383, longitude: 77.0822, sites: [
    { suffix: 'A', name: 'Sector 18 Residential Towers', address: 'Sector 18, Rohini', distance: 280, bearing: 34 },
  ] },
  { code: 'DEL-DWK', name: 'Dwarka', latitude: 28.5921, longitude: 77.046, sites: [
    { suffix: 'A', name: 'Sector 21 Metro Depot Extension', address: 'Sector 21, Dwarka', distance: 410, bearing: 102 },
  ] },
  { code: 'DEL-OKH', name: 'Okhla', latitude: 28.5355, longitude: 77.2724, sites: [
    { suffix: 'A', name: 'Okhla Phase II Warehouse Block', address: 'Okhla Industrial Area Phase II', distance: 240, bearing: 16 },
  ] },
  { code: 'DEL-ANV', name: 'Anand Vihar', latitude: 28.6469, longitude: 77.316, sites: [
    { suffix: 'A', name: 'ISBT Redevelopment Works', address: 'Anand Vihar ISBT', distance: 360, bearing: 68 },
  ] },
];

const USERS = [
  { email: 'citizen@airwatch.test', name: 'Asha Verma', role: 'CITIZEN', password: 'Citizen@123' },
  { email: 'officer@airwatch.test', name: 'R. Malhotra', role: 'MUNICIPAL', password: 'Officer@123' },
  { email: 'inspector@airwatch.test', name: 'S. Iyer', role: 'MUNICIPAL', password: 'Officer@123' },
];

// Offset a coordinate by a distance (m) along a bearing (degrees clockwise from north).
function offset(lat, lng, distanceM, bearingDeg) {
  const rad = (bearingDeg * Math.PI) / 180;
  const dLat = (distanceM * Math.cos(rad)) / 111_320;
  const dLng = (distanceM * Math.sin(rad)) / (111_320 * Math.cos((lat * Math.PI) / 180));
  return { latitude: +(lat + dLat).toFixed(6), longitude: +(lng + dLng).toFixed(6) };
}

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Refusing to seed demo accounts in production');

  for (const l of LOCALITIES) {
    const locality = await prisma.locality.upsert({
      where: { code: l.code },
      create: { code: l.code, name: l.name, latitude: l.latitude, longitude: l.longitude },
      update: { name: l.name, latitude: l.latitude, longitude: l.longitude },
    });
    const stationData = { name: `${l.name} background station`, latitude: l.latitude, longitude: l.longitude, localityId: locality.id };
    const station = await prisma.station.upsert({ where: { code: `BG-${l.code}` }, create: { code: `BG-${l.code}`, ...stationData }, update: stationData });
    for (const s of l.sites) {
      const data = {
        name: s.name, address: s.address, localityId: locality.id, stationId: station.id,
        distanceToBackgroundM: s.distance, siteBearingDeg: s.bearing,
        ...offset(l.latitude, l.longitude, s.distance, s.bearing),
      };
      await prisma.site.upsert({ where: { code: `${l.code}-${s.suffix}` }, create: { code: `${l.code}-${s.suffix}`, ...data }, update: data });
    }
  }

  // Retire sites that are no longer in the reference list, unless a complaint points at them.
  const wanted = LOCALITIES.flatMap((l) => l.sites.map((s) => `${l.code}-${s.suffix}`));
  const stale = await prisma.site.findMany({ where: { code: { notIn: wanted }, complaints: { none: {} } } });
  for (const site of stale) {
    await prisma.$transaction([
      prisma.anomalyEvaluation.deleteMany({ where: { siteId: site.id } }),
      prisma.sensorObservation.deleteMany({ where: { siteId: site.id } }),
      prisma.site.delete({ where: { id: site.id } }),
    ]);
  }

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      create: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 12) },
      update: { name: u.name, role: u.role },
    });
  }
  console.log(`Seeded ${LOCALITIES.length} localities, ${LOCALITIES.length} sites, ${USERS.length} demo accounts.`);
}

main().finally(() => prisma.$disconnect());
