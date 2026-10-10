// Reference data + demo accounts. Repeatable and non-destructive: rows are
// upserted, and anything no longer in the reference list is deactivated, never deleted.
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { hashToken, tokenHint } from '../src/services/devices.js';
import { CITY } from '../src/data/mumbai.js';
import { PROJECTS, WARDS, localityCodeFor } from '../src/data/pilot.js';
import { SIMULATED_MANUFACTURER, simulatedDeviceToken } from '../src/services/mockSensorProvider.js';
import { boundaryCollection } from '../src/services/wards.js';

const USERS = [
  { email: 'citizen@airwatch.test', name: 'Asha Verma', role: 'CITIZEN', password: 'Citizen@123' },
  // A second citizen, so demo cases can show follow-up by someone other than the reporter.
  { email: 'resident@airwatch.test', name: 'Demo Residents Group', role: 'CITIZEN', password: 'Citizen@123' },
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

// Stable pseudo-random number in [0, 1) from a string, so a site keeps its geometry across seeds.
function fraction(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

const date = (value) => new Date(`${value}T00:00:00Z`);
// A demo monitor is only placed where the project's position is known to the street or better.
const monitorable = (p) => p.latitude != null && ['site', 'street'].includes(p.coordinatePrecision);

async function seedWards() {
  const pilot = new Map(WARDS.map((w) => [w.code, w]));
  const ids = new Map();
  for (const { properties: b } of boundaryCollection().features) {
    const w = pilot.get(b.code);
    const data = {
      slug: b.slug, name: b.name, latitude: b.latitude, longitude: b.longitude, pilot: Boolean(w),
      areas: w?.areas ?? null, note: w?.note ?? null,
      officeAddress: w?.office.address ?? null, officePhone: w?.office.phone ?? null, officeEmail: w?.office.email ?? null,
      officeLatitude: w?.office.latitude ?? null, officeLongitude: w?.office.longitude ?? null,
      sourceUrls: w?.sourceUrls ?? [], verifiedOn: w ? date(w.verifiedOn) : null,
    };
    const ward = await prisma.ward.upsert({ where: { code: b.code }, create: { code: b.code, ...data }, update: data });
    ids.set(b.code, ward.id);
    if (!w) continue;
    // Representatives are reference data with nothing pointing at them: replace the set.
    await prisma.$transaction([
      prisma.representative.deleteMany({ where: { wardId: ward.id } }),
      prisma.representative.createMany({ data: w.representatives.map((r) => ({ ...r, verifiedOn: date(r.verifiedOn), wardId: ward.id })) }),
    ]);
  }
  for (const w of WARDS) if (!ids.has(w.code)) throw new Error(`Pilot ward ${w.code} has no boundary in wardBoundaries.json`);
  return ids;
}

async function main() {
  const wardIds = await seedWards();
  const localityCodes = [];
  const stationCodes = [];
  const siteCodes = [];
  const localities = new Map();

  for (const w of WARDS) {
    const code = localityCodeFor(w);
    localityCodes.push(code);
    const centre = boundaryCollection().features.find((f) => f.properties.code === w.code).properties;
    const data = { name: w.name, city: CITY.name, latitude: centre.latitude, longitude: centre.longitude, active: true, wardId: wardIds.get(w.code) };
    localities.set(w.code, await prisma.locality.upsert({ where: { code }, create: { code, ...data }, update: data }));
  }

  for (const p of PROJECTS) {
    const { ward: wardCode, verifiedOn, ...fields } = p;
    const locality = localities.get(wardCode);
    if (!locality) throw new Error(`Project ${p.code} names ward ${wardCode}, which is not a pilot ward`);
    const projectData = { ...fields, wardId: wardIds.get(wardCode), verifiedOn: date(verifiedOn), active: true };
    const project = await prisma.project.upsert({ where: { code: p.code }, create: projectData, update: projectData });
    if (!monitorable(p)) continue;

    // The monitoring point stands at the project. Its background station is simulated and is
    // placed within the 240-410 m station distance the PM10 model was trained on.
    const siteCode = `${locality.code.split('-')[0]}-${p.code}`;
    const distance = Math.round(250 + 150 * fraction(`distance|${p.code}`));
    const bearing = Math.round(360 * fraction(`bearing|${p.code}`));
    const stationCode = `BG-${siteCode}`;
    siteCodes.push(siteCode);
    stationCodes.push(stationCode);
    const stationData = {
      name: `Simulated background for ${p.code}`, ...offset(p.latitude, p.longitude, distance, bearing + 180), localityId: locality.id,
      active: true, provenance: 'SIMULATED', operator: 'AirWatch demonstration',
    };
    const station = await prisma.station.upsert({ where: { code: stationCode }, create: { code: stationCode, ...stationData }, update: stationData });
    const siteData = {
      name: p.name, address: p.address ?? `${p.ward} ward`, latitude: p.latitude, longitude: p.longitude,
      localityId: locality.id, stationId: station.id, active: true,
      // A real project location. What is simulated here is the device, which says so itself.
      simulated: false, projectId: project.id, distanceToBackgroundM: distance, siteBearingDeg: bearing,
    };
    const site = await prisma.site.upsert({ where: { code: siteCode }, create: { code: siteCode, ...siteData }, update: siteData });

    const deviceId = `DEMO-${p.code}`;
    const token = simulatedDeviceToken(deviceId);
    const credential = { tokenHash: hashToken(token), tokenHint: tokenHint(token) };
    await prisma.device.upsert({
      where: { deviceId },
      create: {
        deviceId, siteId: site.id, manufacturer: SIMULATED_MANUFACTURER, model: 'Virtual PM monitor (DEMO)', ownerName: 'AirWatch demonstration',
        provenance: 'SIMULATED', samplingIntervalSeconds: 60, publishAllowed: true,
        calibrationNote: 'DEMO device: simulated, not installed at the project and not operated by its developer',
        ...credential,
      },
      // Keep operator-set fields (status, publication) on re-seed; refresh the association and credential.
      update: { siteId: site.id, ...credential },
    });
  }
  await prisma.project.updateMany({ where: { code: { notIn: PROJECTS.map((p) => p.code) }, active: true }, data: { active: false } });

  // Retire the earlier prototype's places without deleting them: complaints still point at them.
  const retired = await prisma.$transaction([
    prisma.site.updateMany({ where: { code: { notIn: siteCodes }, active: true }, data: { active: false } }),
    prisma.station.updateMany({ where: { code: { notIn: stationCodes }, active: true }, data: { active: false } }),
    prisma.locality.updateMany({ where: { code: { notIn: localityCodes }, active: true }, data: { active: false } }),
  ]);

  // Demo accounts are for development and the hackathon demo only. In production the
  // well-known development passwords are refused: supply your own or skip the accounts.
  if (process.env.SEED_DEMO_USERS !== 'false') {
    const production = process.env.NODE_ENV === 'production';
    const override = { CITIZEN: process.env.DEMO_CITIZEN_PASSWORD, MUNICIPAL: process.env.DEMO_OFFICER_PASSWORD };
    for (const u of USERS) {
      const password = override[u.role] || (production ? null : u.password);
      if (!password || password.length < 8) throw new Error(`Set DEMO_${u.role === 'CITIZEN' ? 'CITIZEN' : 'OFFICER'}_PASSWORD (8+ characters) or SEED_DEMO_USERS=false`);
      u.password = password;
    }
    for (const u of USERS) {
      await prisma.user.upsert({
        where: { email: u.email },
        create: { email: u.email, name: u.name, role: u.role, passwordHash: await bcrypt.hash(u.password, 12) },
        // An explicitly supplied password is applied on re-seed; otherwise existing passwords are left alone.
        update: { name: u.name, role: u.role, ...(override[u.role] ? { passwordHash: await bcrypt.hash(u.password, 12) } : {}) },
      });
    }
  }
  console.log(`Seeded ${CITY.name}: ${wardIds.size} wards (${WARDS.length} in the pilot), ${PROJECTS.length} verified projects, ${siteCodes.length} DEMO monitors.`
    + ` Retired ${retired[0].count} earlier sites and ${retired[2].count} localities (kept, inactive).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().finally(() => prisma.$disconnect());
}
