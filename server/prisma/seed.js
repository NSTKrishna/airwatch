// Reference data + demo accounts. Repeatable and non-destructive: rows are
// upserted, and anything no longer in the reference list is deactivated, never deleted.
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { hashToken, tokenHint } from '../src/services/devices.js';
import { CITY, LOCALITIES } from '../src/data/mumbai.js';
import { SIMULATED_MANUFACTURER, simulatedDeviceToken } from '../src/services/mockSensorProvider.js';

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
  const localityCodes = [];
  const stationCodes = [];
  const siteCodes = [];
  let deviceNumber = 0;

  for (const l of LOCALITIES) {
    localityCodes.push(l.code);
    const localityData = { name: l.name, city: CITY.name, latitude: l.latitude, longitude: l.longitude, active: true };
    const locality = await prisma.locality.upsert({ where: { code: l.code }, create: { code: l.code, ...localityData }, update: localityData });

    const stationCode = `BG-${l.code}`;
    stationCodes.push(stationCode);
    const stationData = {
      name: `${l.name} simulated background station`, latitude: l.latitude, longitude: l.longitude, localityId: locality.id,
      active: true, provenance: 'SIMULATED', operator: 'AirWatch demonstration',
    };
    const station = await prisma.station.upsert({ where: { code: stationCode }, create: { code: stationCode, ...stationData }, update: stationData });

    for (const s of l.sites) {
      const code = `${l.code}-${s.suffix}`;
      siteCodes.push(code);
      const siteData = {
        name: `${l.name} Demo Site ${s.label}`,
        address: `Simulated location, ${s.area}`,
        localityId: locality.id, stationId: station.id, active: true, simulated: true,
        distanceToBackgroundM: s.distance, siteBearingDeg: s.bearing,
        ...offset(l.latitude, l.longitude, s.distance, s.bearing),
      };
      const site = await prisma.site.upsert({ where: { code }, create: { code, ...siteData }, update: siteData });

      deviceNumber += 1;
      const deviceId = `MUM-DEMO-${String(deviceNumber).padStart(3, '0')}`;
      const token = simulatedDeviceToken(deviceId);
      const credential = { tokenHash: hashToken(token), tokenHint: tokenHint(token) };
      await prisma.device.upsert({
        where: { deviceId },
        create: {
          deviceId, siteId: site.id, manufacturer: SIMULATED_MANUFACTURER, model: 'Virtual PM monitor', ownerName: 'AirWatch demonstration',
          provenance: 'SIMULATED', samplingIntervalSeconds: 60, publishAllowed: true, calibrationNote: 'Simulated device: no physical calibration',
          ...credential,
        },
        // Keep operator-set fields (status, publication) on re-seed; refresh the association and credential.
        update: { siteId: site.id, ...credential },
      });
    }
  }

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
  console.log(`Seeded ${CITY.name}: ${localityCodes.length} localities, ${siteCodes.length} simulated sites and devices.`
    + ` Retired ${retired[0].count} earlier sites and ${retired[2].count} localities (kept, inactive).`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().finally(() => prisma.$disconnect());
}
