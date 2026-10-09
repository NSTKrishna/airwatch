// Load a usable demo state: a week of hourly readings from the synthetic
// dataset, each evaluated by the REAL model service, plus a few sample
// complaints at different lifecycle stages.
//
//   node scripts/load-demo-data.js [--days 7] [--reset] [--no-complaints]
//
// --reset deletes existing readings and evaluations first (complaints are kept
// unless they are demo complaints created by this script).
// Nothing is stored unless the model actually answers.
import zlib from 'node:zlib';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { toAttachmentRows } from '../src/lib/uploads.js';
import { addEvidence, addNote, captureSiteEvidence, changeStatus } from '../src/services/complaints.js';
import { getModelInfo } from '../src/services/modelClient.js';
import { evaluateSite, sensorProvider } from '../src/services/monitoring.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const days = Number(args[args.indexOf('--days') + 1]) > 0 && args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 7;
const HOUR_MS = 3_600_000;
const DEMO_PREFIX = 'Demo report: ';

// Plain placeholder image so demo complaints have an attachment. Not a real photograph.
function placeholderPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y += 1) {
    const shade = 1 - (y / height) * 0.35;
    for (let x = 0; x < width; x += 1) {
      const stripe = ((x + y) >> 4) % 2 ? 0.94 : 1;
      row[1 + x * 3] = r * shade * stripe;
      row[2 + x * 3] = g * shade * stripe;
      row[3 + x * 3] = b * shade * stripe;
    }
    row.copy(raw, y * row.length);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function backfill(sites) {
  if (flag('--reset')) {
    await prisma.complaint.updateMany({ data: { anomalyEvaluationId: null } });
    await prisma.anomalyEvaluation.deleteMany();
    await prisma.sensorObservation.deleteMany();
    await prisma.simulatorState.deleteMany();
    console.log('Cleared existing readings and evaluations.');
  }
  const currentHour = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const earliest = await prisma.sensorObservation.findFirst({ orderBy: { receivedAt: 'asc' } });
  const end = Math.min(currentHour, earliest ? Math.floor(earliest.receivedAt.getTime() / HOUR_MS) * HOUR_MS : currentHour);
  const start = currentHour - days * 24 * HOUR_MS;
  const counts = {};
  let anomalies = 0;
  for (let hour = start; hour < end; hour += HOUR_MS) {
    for (const site of sites) {
      const evaluation = await evaluateSite(site, { at: new Date(hour) });
      counts[evaluation.status] = (counts[evaluation.status] || 0) + 1;
      if (evaluation.isAnomaly) anomalies += 1;
      if (evaluation.status === 'MODEL_UNAVAILABLE') throw new Error(`Model became unavailable during backfill: ${evaluation.reason}`);
    }
  }
  const hours = Math.max(0, (end - start) / HOUR_MS);
  console.log(`Backfilled ${hours} hours x ${sites.length} sites:`, counts, `(${anomalies} anomalous readings)`);
  // One live reading so "now" is populated without waiting for the scheduler.
  for (const site of sites) await evaluateSite(site);
}

async function demoComplaints(sites) {
  if (await prisma.complaint.count({ where: { description: { startsWith: DEMO_PREFIX } } })) {
    console.log('Demo complaints already exist; skipping.');
    return;
  }
  const users = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.email, u]));
  const citizen = users['citizen@airwatch.test'];
  const officer = users['officer@airwatch.test'];
  const inspector = users['inspector@airwatch.test'];
  if (!citizen || !officer || !inspector) throw new Error('Run `npm run db:seed` first: demo accounts are missing');
  const site = (code) => sites.find((s) => s.code === code);

  const create = async ({ siteCode, localityCode, text, locationText, colour, hoursAgo }) => {
    const target = siteCode ? site(siteCode) : null;
    const locality = target?.locality ?? await prisma.locality.findUnique({ where: { code: localityCode } });
    const evidence = await captureSiteEvidence(target?.id);
    const createdAt = new Date(Date.now() - hoursAgo * HOUR_MS);
    const complaint = await prisma.complaint.create({
      data: {
        citizenId: citizen.id, localityId: locality.id, siteId: target?.id ?? null, createdAt,
        description: DEMO_PREFIX + text, locationText: locationText ?? null,
        latitude: target?.latitude ?? locality.latitude, longitude: target?.longitude ?? locality.longitude,
        anomalyEvaluationId: evidence.anomalyEvaluationId, sensorSnapshot: evidence.sensorSnapshot ?? undefined,
      },
    });
    await prisma.attachment.createMany({
      data: toAttachmentRows([{ originalname: 'placeholder-photo.png', buffer: placeholderPng(480, 360, colour) }],
        { complaintId: complaint.id, uploadedById: citizen.id, kind: 'CITIZEN_PHOTO' }),
    });
    await prisma.complaintEvent.create({
      data: { complaintId: complaint.id, actorId: citizen.id, type: 'SUBMITTED', toStatus: 'SUBMITTED', createdAt,
        metadata: { anomalyEvidenceAttached: Boolean(evidence.anomalyEvaluationId), photos: 1 } },
    });
    return complaint.id;
  };

  await create({ siteCode: 'DEL-ROH-A', hoursAgo: 1, colour: [196, 170, 130],
    text: 'Dust blowing across the road from uncovered excavated soil. No water sprinkling seen since morning.' });

  const review = await create({ siteCode: 'DEL-OKH-A', hoursAgo: 6, colour: [176, 160, 140],
    text: 'Trucks leaving the site without covers, leaving a trail of dust on the service lane.' });
  await changeStatus(review, officer, { status: 'UNDER_REVIEW' });

  const assigned = await create({ siteCode: 'DEL-ANV-A', hoursAgo: 20, colour: [188, 150, 118],
    text: 'Demolition debris piled near the boundary wall with no barricade sheets. Dust reaches the bus bays.' });
  await changeStatus(assigned, officer, { status: 'UNDER_REVIEW' });
  await changeStatus(assigned, officer, { status: 'INSPECTION_ASSIGNED', officerId: inspector.id, note: 'Please check barricading and debris cover.' });

  const resolved = await create({ siteCode: 'DEL-DWK-A', hoursAgo: 50, colour: [170, 165, 150],
    text: 'Cutting and grinding work in the open without wet suppression. Fine dust settling on parked vehicles.' });
  await changeStatus(resolved, officer, { status: 'UNDER_REVIEW' });
  await changeStatus(resolved, officer, { status: 'INSPECTION_ASSIGNED', officerId: inspector.id });
  await addNote(resolved, inspector, 'Visited site. Dry cutting confirmed at the east face; no misting in use.');
  await addEvidence(resolved, inspector,
    toAttachmentRows([{ originalname: 'placeholder-inspection.png', buffer: placeholderPng(480, 360, [150, 158, 150]) }],
      { complaintId: resolved, uploadedById: inspector.id, kind: 'INSPECTION_EVIDENCE', caption: 'East face cutting area (placeholder image)' }),
    'East face cutting area (placeholder image)');
  await changeStatus(resolved, inspector, {
    status: 'RESOLVED',
    findings: 'Dry cutting was in progress without wet suppression at the east face.',
    correctiveAction: 'Contractor instructed to use wet cutting and misting. Compliance to be re-checked in 7 days.',
  });

  const rejected = await create({ localityCode: 'DEL-ROH', hoursAgo: 30, colour: [182, 176, 160],
    locationText: 'Service road near the sector market',
    text: 'Dust from road sweeping in the morning, not from a construction site.' });
  await changeStatus(rejected, officer, { status: 'UNDER_REVIEW' });
  await changeStatus(rejected, officer, { status: 'REJECTED', note: 'Not related to construction activity. Forwarded to the sanitation department.' });

  console.log('Created 5 demo complaints (one per lifecycle stage).');
}

async function main() {
  sensorProvider.init();
  const info = await getModelInfo({ fresh: true });
  if (!info.ready) throw new Error(`Model service at ${config.modelApiUrl} is not ready (${info.reason}). Nothing was loaded.`);
  console.log(`Model: ${info.version}`);
  console.log(`Sensor source: ${sensorProvider.name}`);
  const sites = await prisma.site.findMany({ include: { locality: true }, orderBy: { code: 'asc' } });
  if (flag('--reset')) await prisma.complaint.deleteMany({ where: { description: { startsWith: DEMO_PREFIX } } });
  await backfill(sites);
  if (!flag('--no-complaints')) await demoComplaints(sites);
}

main()
  .catch((error) => {
    console.error(`[load-demo-data] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
