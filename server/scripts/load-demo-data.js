// Load demonstration history: simulated device readings for the past days, each
// evaluated by the REAL model service, plus demo case history at the pilot's projects.
//
//   node scripts/load-demo-data.js [--days 7] [--no-complaints] [--no-readings]
//
// This is the only place where a past reading is evaluated: the model accepts
// only fresh timestamps, so each one is sent with the current time and stored
// against the time it describes (see evaluateReading). Live readings never take
// this path; they go through the ingestion API.
// Repeatable: readings that already exist are skipped. Nothing is deleted.
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { withStoredAttachments } from '../src/lib/storage.js';
import { toAttachmentRows } from '../src/lib/uploads.js';
import { addEvidence, addNote, captureSiteEvidence, changeStatus } from '../src/services/complaints.js';
import { assessQuality } from '../src/services/ingestion.js';
import { simulateReading } from '../src/services/mockSensorProvider.js';
import { getModelInfo } from '../src/services/modelClient.js';
import { evaluateReading } from '../src/services/monitoring.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const daysArg = Number(args[args.indexOf('--days') + 1]);
const days = args.includes('--days') && daysArg > 0 ? daysArg : 7;
const HOUR_MS = 3_600_000;
const QUARTER_MS = 900_000;

// What a demo case shows as its photograph: one of three synthetic scenes rendered by
// scripts/demo-images/render.py. They are not photographs, show no real site, and carry a
// label saying so in the image itself.
const DEMO_IMAGES = [1, 2, 3].map((n) => ({
  originalname: `demo-image-${n}.jpg`,
  buffer: readFileSync(new URL(`./demo-images/demo-dust-${n}.jpg`, import.meta.url)),
}));
const demoImage = (index) => DEMO_IMAGES[index % DEMO_IMAGES.length];
// Stored and recorded together: if the row cannot be written, the stored object is removed.
const attach = (files, base) => withStoredAttachments(toAttachmentRows(files, base), (rows) => prisma.attachment.createMany({ data: rows }));

// Plain placeholder for documents on demo cases (acknowledgments, inspection evidence).
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

// A few past dust episodes so the history is not uniformly calm. Deterministic per site.
function historicalScenario(siteIndex, time) {
  const hoursAgo = (Date.now() - time) / HOUR_MS;
  const episodes = [[1, 30, 33], [4, 52, 54], [6, 9, 11], [2, 100, 103]]; // [site index, from, to] in hours ago
  return episodes.some(([i, from, to]) => i === siteIndex && hoursAgo >= from && hoursAgo < to) ? 'DUST_EVENT' : 'NORMAL';
}

async function backfill(devices) {
  const now = Date.now();
  const start = Math.floor((now - days * 24 * HOUR_MS) / HOUR_MS) * HOUR_MS;
  // Hourly for older history, every 15 minutes for the most recent day. Stop short of "now":
  // the live simulator owns the present.
  const times = [];
  for (let t = start; t < now - 2 * QUARTER_MS; t += (now - t <= 24 * HOUR_MS ? QUARTER_MS : HOUR_MS)) times.push(t);

  const counts = {};
  let created = 0;
  let anomalies = 0;
  for (const [index, device] of devices.entries()) {
    for (const time of times) {
      const r = simulateReading({ site: device.site, localityCode: device.site.locality.code, scenario: historicalScenario(index, time), at: new Date(time) });
      const observedAt = new Date(r.timestamp);
      const exists = await prisma.deviceReading.findUnique({
        where: { deviceId_observedAt_intervalSeconds: { deviceId: device.id, observedAt, intervalSeconds: r.interval_seconds } },
      });
      if (exists) continue;
      const reading = await prisma.deviceReading.create({
        data: {
          deviceId: device.id, siteId: device.siteId, observedAt, intervalSeconds: r.interval_seconds,
          pm25: r.pm25, pm10: r.pm10, temperatureC: r.temperature_c, humidityPct: r.humidity_pct, unit: r.unit,
          pm25Ugm3: r.pm25, pm10Ugm3: r.pm10, reportedStatus: r.status, provenance: 'SIMULATED',
          ...assessQuality(r, r.pm10, r.pm25), payload: r, receivedAt: observedAt,
        },
      });
      const evaluation = await evaluateReading(reading.id, { relabelForHistory: true });
      if (evaluation.status === 'MODEL_UNAVAILABLE') throw new Error(`Model became unavailable during backfill: ${evaluation.reason}`);
      counts[evaluation.status] = (counts[evaluation.status] || 0) + 1;
      if (evaluation.isAnomaly) anomalies += 1;
      created += 1;
    }
  }
  console.log(`History: ${created} simulated readings across ${devices.length} devices over ${days} days`, counts, `(${anomalies} PM10 excess flags)`);
}

// Demo case history: construction-dust reports at the pilot's verified projects, spread over
// the past ten days and across every stage of the lifecycle. Each is stored with isDemo = true
// and shown as demo history wherever it appears. `ward` and `project` index the pilot's wards
// and that ward's monitored projects, so the history follows whatever the reference data holds.
const HISTORY = [
  { ward: 0, project: 0, hoursAgo: 3, stage: 'SUBMITTED', text: 'Dust blowing across the road from uncovered excavated soil since morning. No water sprinkling seen.' },
  { ward: 0, project: 1, hoursAgo: 28, stage: 'UNDER_REVIEW', text: 'Dumpers leaving the site without covers and dropping soil on the service road. The dust hangs in the air all afternoon.',
    followUps: [
      { kind: 'OFFICIAL_COMPLAINT', hoursAgo: 26, channel: 'marg-portal', ack: true, check: 'VERIFIED', checkNote: 'Reference matches the acknowledgment submitted.' },
      { kind: 'STILL_UNRESOLVED', by: 'resident', hoursAgo: 5, photo: true, note: 'Went past this evening. Dumpers still leaving uncovered.' },
    ] },
  { ward: 0, project: 2, hoursAgo: 77, stage: 'INSPECTION_ASSIGNED', text: 'Barricade sheets are torn on the road side, and cutting work throws dust straight onto the footpath.',
    instruction: 'Check barricade height and whether wet cutting is in use.' },
  { ward: 0, project: 0, hoursAgo: 190, stage: 'RESOLVED', text: 'Debris heap left uncovered next to the compound wall. Dust settles on the cars parked in the lane.',
    note: 'Visited the site. Debris stack on the north side had no cover; sprinkler line was not running.',
    findings: 'Construction debris was stored uncovered along the north boundary and no sprinkling was in progress during the visit.',
    action: 'Site supervisor told to cover the debris with tarpaulin and run the sprinkler line during working hours. Re-check noted for one week later.',
    // Closed by the AirWatch desk, and disputed by the person who reported it.
    followUps: [
      { kind: 'DISPUTE_CLOSURE', hoursAgo: 40, photo: true, check: 'VERIFIED', checkNote: 'Photograph shows the debris stack uncovered.', note: 'The cover lasted two days. The debris is open again and nothing is being sprinkled.' },
      { kind: 'STILL_UNRESOLVED', by: 'resident', hoursAgo: 16, photo: true, note: 'Same this morning: open debris, dust on the lane.' },
    ] },
  { ward: 1, project: 0, hoursAgo: 6, stage: 'SUBMITTED', text: 'Thick dust near the gate whenever trucks enter. Wheels are not being washed and the road is brown with mud.' },
  { ward: 1, project: 1, hoursAgo: 40, stage: 'UNDER_REVIEW', text: 'Concrete breaking work in the open without any screen. Fine dust reaches the bus stop across the road.' },
  { ward: 1, project: 2, hoursAgo: 120, stage: 'RESOLVED', text: 'Sand and aggregate piled in the open, uncovered. Wind carries it into the housing society next door.',
    note: 'Material stack confirmed uncovered on the east side. Photographed.',
    findings: 'Loose sand and aggregate were stockpiled without a cover on the east side of the plot.',
    action: 'Contractor told to cover stockpiles and wet them twice a day. Cover was in place at the follow-up visit.',
    // The whole loop: filed officially, a response recorded, and residents confirm the improvement.
    followUps: [
      { kind: 'OFFICIAL_COMPLAINT', hoursAgo: 116, channel: 'mybmc-app', ack: true, check: 'VERIFIED', checkNote: 'Reference matches the acknowledgment submitted.' },
      { kind: 'OFFICIAL_RESPONSE', hoursAgo: 70, ack: true, check: 'VERIFIED', checkNote: 'Reply as submitted by the citizen.', note: 'Reply received through the app: site visited and the contractor instructed to cover material.' },
      { kind: 'IMPROVEMENT_OBSERVED', by: 'resident', hoursAgo: 30, photo: true, check: 'VERIFIED', checkNote: 'Photograph shows covered stockpiles.', note: 'Stockpiles covered with green sheet and the road was being sprinkled this afternoon.' },
    ] },
  { ward: 1, project: 0, hoursAgo: 150, stage: 'REJECTED', text: 'Dust on the main road in the evening near the signal.',
    reason: 'The photographs show road sweeping on the public road, not work at a construction site. Outside this pilot\'s single category.' },
  { ward: 2, project: 0, hoursAgo: 10, stage: 'SUBMITTED', text: 'Demolition of the old structure going on with no water spray. The whole lane is covered in grey dust.' },
  { ward: 2, project: 1, hoursAgo: 55, stage: 'INSPECTION_ASSIGNED', text: 'Excavated earth loaded onto trucks all night with no covers. Dust inside our flats by morning.',
    instruction: 'Night visit if possible; check truck covers and wheel washing.',
    // Filed officially two days ago; the acknowledgment has not been checked yet.
    followUps: [{ kind: 'OFFICIAL_COMPLAINT', hoursAgo: 50, channel: 'helpline-1916', ack: false }] },
  { ward: 2, project: 2, hoursAgo: 96, stage: 'UNDER_REVIEW', text: 'No green net or sheet on the upper floors where plastering and grinding are in progress.' },
  { ward: 2, project: 1, hoursAgo: 215, stage: 'RESOLVED', text: 'Dry cutting of stone at the entrance in the open. Clouds of white dust during the day.',
    note: 'Dry cutting confirmed at the entrance bay; no misting in use.',
    findings: 'Stone cutting was being done dry at the entrance bay without wet suppression or an enclosure.',
    action: 'Contractor told to move cutting inside an enclosed bay and use wet cutting. Enclosure seen in place at the follow-up visit.' },
  { ward: 3, project: 0, hoursAgo: 4, stage: 'SUBMITTED', text: 'Road outside the site is full of loose soil from the trucks. Every passing vehicle raises dust.' },
  { ward: 3, project: 1, hoursAgo: 33, stage: 'UNDER_REVIEW', text: 'Piling work with heaps of excavated soil lying open along the road for several days.' },
  { ward: 3, project: 2, hoursAgo: 82, stage: 'INSPECTION_ASSIGNED', text: 'Debris being thrown down from upper floors without a chute. Dust cloud every time.',
    instruction: 'Check for a debris chute and covered storage.' },
  { ward: 3, project: 0, hoursAgo: 170, stage: 'RESOLVED', text: 'No sprinkling at all during excavation. Dust visible from our building through the day.',
    note: 'Excavation in progress; tanker on site but not in use at the time of the visit.',
    findings: 'Excavation was in progress without water sprinkling although a tanker was available on site.',
    action: 'Site told to sprinkle during excavation and loading. Sprinkling was observed at the follow-up visit.',
    followUps: [{ kind: 'IMPROVEMENT_OBSERVED', hoursAgo: 60, photo: true, note: 'Sprinkling seen during loading on two visits this week.' }] },
  { ward: 0, project: null, hoursAgo: 60, stage: 'UNDER_REVIEW', text: 'Small plot being dug up behind the shops with no barricade at all. Not on your project list.' },
  { ward: 2, project: null, hoursAgo: 130, stage: 'REJECTED', text: 'Dust in the air near the junction, source not clear.',
    reason: 'No construction activity could be identified from the photographs or the location given.' },
];

// Demo cases loaded before the demo scenes existed carry flat placeholder images. Swap them.
async function refreshDemoImages() {
  const old = await prisma.attachment.findMany({
    where: { filename: { in: ['placeholder-photo.png', 'placeholder-follow-up.png'] }, kind: { in: ['CITIZEN_PHOTO', 'FOLLOW_UP_PHOTO'] }, complaint: { isDemo: true } },
    select: { id: true }, orderBy: { createdAt: 'asc' },
  });
  for (const [index, { id }] of old.entries()) {
    await withStoredAttachments(toAttachmentRows([demoImage(index)], {}), ([row]) => prisma.attachment.update({ where: { id }, data: row }));
  }
  return old.length;
}

async function demoComplaints(sites) {
  if (await prisma.complaint.count({ where: { isDemo: true, locality: { active: true } } })) {
    const replaced = await refreshDemoImages();
    console.log(`Demo case history already exists for the current wards; skipping.${replaced ? ` Replaced ${replaced} placeholder images with the demo scenes.` : ''}`);
    return;
  }
  const users = Object.fromEntries((await prisma.user.findMany()).map((u) => [u.email, u]));
  const citizen = users['citizen@airwatch.test'];
  const officer = users['officer@airwatch.test'];
  const inspector = users['inspector@airwatch.test'];
  const resident = users['resident@airwatch.test'];
  if (!citizen || !officer || !inspector || !resident) throw new Error('Run `npm run db:seed` first: demo accounts are missing');

  const wards = await prisma.ward.findMany({ where: { pilot: true }, orderBy: { code: 'asc' } });
  const sitesOf = (ward) => sites.filter((s) => s.project?.wardId === ward.id);

  let created = 0;
  for (const [index, h] of HISTORY.entries()) {
    const ward = wards[h.ward % wards.length];
    const wardSites = sitesOf(ward);
    if (wardSites.length === 0) continue;
    const site = wardSites[(h.project ?? 0) % wardSites.length];
    const named = h.project !== null;
    const locality = await prisma.locality.findFirst({ where: { wardId: ward.id, active: true } });
    const createdAt = new Date(Date.now() - h.hoursAgo * HOUR_MS);
    const evidence = named ? await captureSiteEvidence(site.id) : { anomalyEvaluationId: null, sensorSnapshot: null };
    // A report that names no project still needs a place: a few hundred metres from a listed
    // project, in the same ward, and labelled as a demo location.
    const spot = named ? site : { latitude: +(site.latitude + 0.0042).toFixed(6), longitude: +(site.longitude - 0.0036).toFixed(6) };
    const complaint = await prisma.complaint.create({
      data: {
        citizenId: citizen.id, localityId: locality.id, wardId: ward.id, isDemo: true, createdAt,
        projectId: named ? site.projectId : null, siteId: named ? site.id : null,
        description: h.text, locationText: named ? null : 'Demo location, not a real address',
        latitude: spot.latitude, longitude: spot.longitude,
        anomalyEvaluationId: evidence.anomalyEvaluationId, sensorSnapshot: evidence.sensorSnapshot ?? undefined,
      },
    });
    await attach([demoImage(index)], { complaintId: complaint.id, uploadedById: citizen.id, kind: 'CITIZEN_PHOTO' });
    await prisma.complaintEvent.create({
      data: { complaintId: complaint.id, actorId: citizen.id, type: 'SUBMITTED', toStatus: 'SUBMITTED', createdAt,
        metadata: { anomalyEvidenceAttached: Boolean(evidence.anomalyEvaluationId), photos: 1, routedToWard: ward.code } },
    });

    // Walk the case through the real lifecycle functions, then spread the audit trail over the
    // time since it was filed so the history reads as it would have happened.
    const id = complaint.id;
    if (h.stage !== 'SUBMITTED') await changeStatus(id, officer, { status: 'UNDER_REVIEW' });
    if (h.stage === 'REJECTED') await changeStatus(id, officer, { status: 'REJECTED', note: h.reason });
    if (['INSPECTION_ASSIGNED', 'RESOLVED'].includes(h.stage)) {
      await changeStatus(id, officer, { status: 'INSPECTION_ASSIGNED', officerId: inspector.id, note: h.instruction });
    }
    if (h.stage === 'RESOLVED') {
      await addNote(id, inspector, h.note);
      await addEvidence(id, inspector,
        toAttachmentRows([{ originalname: 'placeholder-inspection.png', buffer: placeholderPng(480, 360, [150, 158, 150]) }],
          { complaintId: id, uploadedById: inspector.id, kind: 'INSPECTION_EVIDENCE', caption: 'Placeholder image, not a photograph of the site' }),
        'Placeholder image, not a photograph of the site');
      await changeStatus(id, inspector, { status: 'RESOLVED', findings: h.findings, correctiveAction: h.action });
    }
    const later = await prisma.complaintEvent.findMany({ where: { complaintId: id, type: { not: 'SUBMITTED' } }, orderBy: { createdAt: 'asc' } });
    const span = Math.min(h.hoursAgo * 0.8, 96) * HOUR_MS;
    let last = createdAt;
    for (const [i, event] of later.entries()) {
      last = new Date(createdAt.getTime() + (span * (i + 1)) / (later.length + 1));
      await prisma.complaintEvent.update({ where: { id: event.id }, data: { createdAt: last } });
    }
    await prisma.$executeRaw`UPDATE "Complaint" SET "updatedAt" = ${last} WHERE id = ${id}`;

    // Citizen follow-up on the demo case: official complaints with made-up DEMO references,
    // and what residents saw afterwards. Written directly so each entry keeps its own time.
    for (const [n, f] of (h.followUps || []).entries()) {
      const author = f.by === 'resident' ? resident : citizen;
      const at = new Date(Date.now() - f.hoursAgo * HOUR_MS);
      const entry = await prisma.followUp.create({
        data: {
          complaintId: id, authorId: author.id, kind: f.kind, isDemo: true, createdAt: at, occurredOn: at,
          note: f.note ?? null, latitude: f.photo ? site.latitude : null, longitude: f.photo ? site.longitude : null,
          officialChannel: f.channel ?? null,
          officialReference: f.kind === 'OFFICIAL_COMPLAINT' ? `DEMO-${String(index + 1).padStart(2, '0')}${n + 1}-NOT-REAL` : null,
          check: f.check ?? 'UNCHECKED', checkNote: f.checkNote ?? null,
          checkedById: f.check ? officer.id : null, checkedAt: f.check ? new Date(at.getTime() + 3 * HOUR_MS) : null,
        },
      });
      const files = [
        ...(f.photo ? [{ kind: 'FOLLOW_UP_PHOTO', image: demoImage(index + n + 1) }] : []),
        ...(f.ack ? [{ kind: 'OFFICIAL_ACKNOWLEDGMENT', name: 'placeholder-acknowledgment.png', colour: [200, 200, 205] }] : []),
      ];
      for (const file of files) {
        await attach([file.image ?? { originalname: file.name, buffer: placeholderPng(480, 360, file.colour) }],
          { complaintId: id, uploadedById: author.id, kind: file.kind, followUpId: entry.id });
      }
      await prisma.complaintEvent.create({
        data: { complaintId: id, actorId: author.id, type: 'FOLLOW_UP_ADDED', createdAt: at, metadata: { followUpId: entry.id, kind: f.kind, photos: f.photo ? 1 : 0, acknowledgment: Boolean(f.ack) } },
      });
      if (f.check) {
        await prisma.complaintEvent.create({
          data: { complaintId: id, actorId: officer.id, type: 'FOLLOW_UP_CHECKED', createdAt: entry.checkedAt, note: f.checkNote ?? null, metadata: { followUpId: entry.id, kind: f.kind, check: f.check, previous: 'UNCHECKED' } },
        });
      }
    }
    created += 1;
  }
  console.log(`Created ${created} demo cases across ${wards.length} pilot wards, labelled as demo history.`);
}

async function main() {
  // Readings are only ever evaluated by the model service; case history needs no model.
  if (!flag('--no-readings')) {
    const info = await getModelInfo({ fresh: true });
    if (!info.ready) throw new Error(`Model service at ${config.modelApiUrl} is not ready (${info.reason}). Nothing was loaded.`);
    console.log(`Model: ${info.version}`);
  }
  const devices = await prisma.device.findMany({
    where: { provenance: 'SIMULATED', status: 'ACTIVE', site: { active: true } },
    include: { site: { include: { locality: true, project: true } } },
    orderBy: { deviceId: 'asc' },
  });
  if (devices.length === 0) throw new Error('No simulated devices found. Run `npm run db:seed` first.');
  if (!flag('--no-readings')) await backfill(devices);
  if (!flag('--no-complaints')) await demoComplaints(devices.map((d) => d.site));
}

main()
  .catch((error) => {
    console.error(`[load-demo-data] ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
