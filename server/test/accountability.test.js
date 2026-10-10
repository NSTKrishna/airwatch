// The independent accountability loop over HTTP: a citizen reports, files officially elsewhere,
// records the acknowledgment, and residents add what they see on site. AirWatch's own review,
// the official complaint and the residents' observations stay three separate positions.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { PNG, complaintForm, startStack } from './helpers/stack.js';
import { stripMetadata } from '../src/lib/imageMetadata.js';

let stack; let api; let prisma; let tokens;
const ctx = {};
const officer = () => ({ token: tokens.officer });
const today = () => new Date().toISOString().slice(0, 10);
const publicReport = async (reference) => (await api('GET', `/public/reports/${reference}`)).body.report;
const caseFile = async (id) => (await api('GET', `/municipal/complaints/${id}`, officer())).body;
const step = (id, json) => api('POST', `/municipal/complaints/${id}/status`, { ...officer(), json });
const check = (followUpId, json) => api('POST', `/municipal/follow-ups/${followUpId}/check`, { ...officer(), json });

function followUp(reference, token, fields, { photos = [], acknowledgment } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  for (const data of photos) form.append('photos', new Blob([data], { type: 'image/png' }), 'site.png');
  if (acknowledgment) form.append('acknowledgment', new Blob([acknowledgment], { type: 'image/png' }), 'acknowledgment.png');
  return api('POST', `/complaints/reports/${reference}/follow-ups`, { token, form });
}

// A JPEG shaped like a phone photograph: JFIF, EXIF with an orientation and a GPS-looking
// payload, XMP, a comment, then image data.
function jpegWithMetadata() {
  const segment = (marker, body) => {
    const head = Buffer.alloc(4);
    head.writeUInt16BE(0xff00 | marker, 0);
    head.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([head, body]);
  };
  const tiff = Buffer.alloc(26 + 24);
  tiff.write('II', 0, 'latin1');
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x0112, 10); // Orientation
  tiff.writeUInt16LE(3, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt16LE(6, 18); // rotated 90 degrees
  tiff.write('GPS 19.1234N 72.8765E', 26, 'latin1');
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])),
    segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>owner=Asha</x:xmpmeta>', 'latin1')),
    segment(0xfe, Buffer.from('shot on my phone', 'latin1')),
    segment(0xdb, Buffer.alloc(65, 1)),
    Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]),
  ]);
}

before(async () => {
  stack = await startStack();
  ({ api, prisma, tokens } = stack);
  const other = await api('POST', '/auth/register', { json: { name: 'Neighbour Nair', email: 'neighbour@example.com', password: 'password123' } });
  tokens.other = other.body.token;
  ctx.project = (await api('GET', '/public/projects')).body.projects.find((p) => p.monitor);
});
after(() => stack?.close());

test('uploaded photographs lose their embedded metadata and keep their orientation', () => {
  const jpeg = jpegWithMetadata();
  const clean = stripMetadata(jpeg, 'image/jpeg');
  const text = clean.toString('latin1');
  for (const secret of ['GPS 19.1234N', 'xmpmeta', 'owner=Asha', 'shot on my phone']) assert.equal(text.includes(secret), false, secret);
  assert.ok(text.includes('JFIF'), 'the JFIF header is kept');
  assert.equal(clean.subarray(-9).equals(jpeg.subarray(-9)), true, 'image data is untouched');
  // The only EXIF left is a 36-byte block holding the orientation.
  const exif = clean.indexOf(Buffer.from('Exif\0\0', 'latin1'));
  assert.equal(clean.readUInt16BE(exif - 2), 34);
  assert.equal(clean.readUInt16BE(exif + 24), 6);

  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(zlib.crc32(body), body.length + 4);
    return out;
  };
  const png = Buffer.concat([PNG.subarray(0, PNG.length - 12), chunk('tEXt', Buffer.from('Comment\0taken at home')), chunk('eXIf', Buffer.from('GPS')), PNG.subarray(PNG.length - 12)]);
  assert.equal(stripMetadata(png, 'image/png').equals(PNG), true);

  const riffChunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'latin1');
    head.writeUInt32LE(data.length, 4);
    return Buffer.concat([head, data, Buffer.alloc(data.length % 2)]);
  };
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x0c; // says EXIF and XMP follow
  const body = Buffer.concat([riffChunk('VP8X', vp8x), riffChunk('VP8 ', Buffer.from([1, 2, 3])), riffChunk('EXIF', Buffer.from('GPS 19.1')), riffChunk('XMP ', Buffer.from('<x/>'))]);
  const riff = Buffer.alloc(12);
  riff.write('RIFF', 0, 'latin1');
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write('WEBP', 8, 'latin1');
  const webp = stripMetadata(Buffer.concat([riff, body]), 'image/webp');
  assert.equal(webp.includes('GPS 19.1') || webp.includes('<x/>'), false);
  assert.equal(webp.readUInt32LE(4), webp.length - 8);
  assert.equal(webp[20] & 0x0c, 0);
  assert.throws(() => stripMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2]), 'image/jpeg'), { malformedImage: true });
});

test('a citizen finds a project, reports dust and gets a case link with three separate positions', async () => {
  const p = ctx.project;
  const found = (await api('GET', `/public/projects?q=${encodeURIComponent(p.name.slice(0, 10))}`)).body.projects;
  assert.ok(found.some((x) => x.code === p.code));

  const form = complaintForm({ projectCode: p.code, description: 'Uncovered debris at the gate and no sprinkling all morning.' }, [{ name: 'gate.jpg', data: jpegWithMetadata(), type: 'image/jpeg' }]);
  const created = await api('POST', '/complaints', { token: tokens.citizen, form });
  assert.equal(created.status, 201);
  ctx.report = created.body.complaint;
  const mine = (await api('GET', `/complaints/${ctx.report.id}`, { token: tokens.citizen })).body;
  // Everything needed to file officially comes with the case: the ward office and the verified channels.
  assert.ok(mine.complaint.wardOffice.address);
  assert.ok(mine.dustAuthority.channels.every((c) => c.key && c.name && c.url));
  assert.ok(mine.dustAuthority.channels.some((c) => c.key === 'marg-portal'));

  // The case link works signed out.
  const r = await publicReport(ctx.report.reference);
  assert.deepEqual(r.positions.airwatch, { status: 'SUBMITTED', closedAt: null });
  assert.equal(r.positions.official.state, 'NONE');
  assert.equal(r.positions.citizen.state, 'NONE');
  assert.deepEqual(r.followUps, []);

  // The stored photograph no longer carries the phone's metadata.
  const stored = await prisma.attachment.findFirst({ where: { complaintId: ctx.report.id } });
  const bytes = Buffer.from(stored.data).toString('latin1');
  assert.equal(bytes.includes('GPS 19.1234N') || bytes.includes('owner=Asha'), false);
  assert.equal(stored.sizeBytes, stored.data.length);
});

test('recording an official complaint filed elsewhere, and what a follow-up may not do', async () => {
  const { reference, id } = ctx.report;
  const filing = { kind: 'OFFICIAL_COMPLAINT', officialChannel: 'marg-portal', officialReference: 'TEST-REF-4471', occurredOn: today() };
  assert.equal((await followUp(reference, undefined, filing)).status, 401);
  assert.equal((await followUp(reference, tokens.officer, filing)).status, 403);
  assert.equal((await followUp('AW-2026-99999', tokens.citizen, filing)).status, 404);
  const missing = await followUp(reference, tokens.citizen, { kind: 'OFFICIAL_COMPLAINT' });
  assert.equal(missing.status, 400);
  assert.ok(missing.body.error.fields.officialReference && missing.body.error.fields.officialChannel && missing.body.error.fields.occurredOn);
  assert.equal((await followUp(reference, tokens.citizen, { ...filing, officialChannel: 'whatsapp' })).status, 400);
  assert.ok((await followUp(reference, tokens.citizen, { ...filing, occurredOn: '2031-01-01' })).body.error.fields.occurredOn);
  // An open case cannot be "disputed", and an observation needs a photograph or a description.
  assert.ok((await followUp(reference, tokens.citizen, { kind: 'DISPUTE_CLOSURE', note: 'I disagree with this outcome.' })).body.error.fields.kind);
  assert.ok((await followUp(reference, tokens.citizen, { kind: 'STILL_UNRESOLVED' })).body.error.fields.note);
  assert.equal((await followUp(reference, tokens.citizen, { kind: 'NOPE' })).status, 400);

  const added = await followUp(reference, tokens.citizen, filing, { acknowledgment: PNG });
  assert.equal(added.status, 201);
  assert.equal(added.body.complaint.positions.official.state, 'REPORTED');

  const r = await publicReport(reference);
  // Reported by a citizen is not the same as acknowledged, and the AirWatch review has not moved.
  assert.equal(r.positions.official.state, 'REPORTED');
  assert.equal(r.positions.official.firstFiledOn, today());
  assert.equal(r.positions.official.daysWithoutResponse, 0);
  assert.equal(r.positions.airwatch.status, 'SUBMITTED');
  assert.equal(r.status, 'SUBMITTED');
  const [entry] = r.followUps;
  assert.deepEqual(
    { kind: entry.kind, track: entry.track, by: entry.by, check: entry.check, ref: entry.officialReference, channel: entry.officialChannel, ack: entry.hasAcknowledgment },
    { kind: 'OFFICIAL_COMPLAINT', track: 'OFFICIAL', by: 'REPORTER', check: 'UNCHECKED', ref: 'TEST-REF-4471', channel: 'BMC MARG grievance portal', ack: true });
  assert.deepEqual(entry.photos, []);

  // The acknowledgment document can carry personal details: the case desk sees it, the public never does.
  const file = await caseFile(id);
  const ack = file.complaint.followUps[0].attachments.find((a) => a.kind === 'OFFICIAL_ACKNOWLEDGMENT');
  assert.equal((await api('GET', ack.url.replace('/api', ''), officer())).status, 200);
  assert.equal((await api('GET', `/public/attachments/${ack.id}`)).status, 404);
  assert.equal(file.complaint.followUps[0].author.email, 'citizen@airwatch.test');
  ctx.filingId = entry.id;
});

test('a moderator verifies the acknowledgment; that is not an AirWatch resolution', async () => {
  const { reference, id } = ctx.report;
  assert.equal((await api('POST', `/municipal/follow-ups/${ctx.filingId}/check`, { token: tokens.citizen, json: { check: 'VERIFIED' } })).status, 403);
  assert.equal((await check(ctx.filingId, { check: 'SET_ASIDE' })).status, 400);
  assert.equal((await check('nope', { check: 'VERIFIED' })).status, 404);
  const verified = await check(ctx.filingId, { check: 'VERIFIED', note: 'Reference matches the acknowledgment screenshot.' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.complaint.status, 'SUBMITTED');
  assert.deepEqual(verified.body.allowedTransitions, ['UNDER_REVIEW']);
  assert.deepEqual(verified.body.complaint.audit.map((e) => e.type), ['SUBMITTED', 'FOLLOW_UP_ADDED', 'FOLLOW_UP_CHECKED']);
  assert.equal((await check(ctx.filingId, { check: 'VERIFIED', note: 'Reference matches the acknowledgment screenshot.' })).status, 409);

  const r = await publicReport(reference);
  assert.equal(r.positions.official.state, 'ACKNOWLEDGED');
  assert.equal(r.positions.airwatch.status, 'SUBMITTED');
  assert.equal(r.positions.citizen.state, 'NONE');
  assert.equal(r.followUps[0].check, 'VERIFIED');
  assert.match(r.followUps[0].checkNote, /matches the acknowledgment/);
  assert.equal((await api('GET', `/municipal/complaints?followUp=unchecked`, officer())).body.total, 0);
  assert.equal((await api('GET', `/complaints/${id}`, { token: tokens.citizen })).body.complaint.positions.official.state, 'ACKNOWLEDGED');
});

test('residents add what they see on site; text and photographs wait for a moderator', async () => {
  const { reference } = ctx.report;
  const p = ctx.project;
  // A neighbour, not the reporter, goes and looks.
  const persists = await followUp(reference, tokens.other,
    { kind: 'STILL_UNRESOLVED', note: 'Debris still uncovered on the north side this evening.', latitude: p.latitude + 0.0009, longitude: p.longitude },
    { photos: [PNG] });
  assert.equal(persists.status, 201);
  assert.equal('description' in persists.body.complaint, false, 'a neighbour is not given the reporter\'s own page');

  let r = await publicReport(reference);
  assert.deepEqual({ state: r.positions.citizen.state, verified: r.positions.citizen.verified }, { state: 'PERSISTS', verified: false });
  const seen = r.followUps.at(-1);
  assert.deepEqual({ by: seen.by, track: seen.track, note: seen.note, photos: seen.photos, count: seen.photoCount }, { by: 'RESIDENT', track: 'CITIZEN', note: null, photos: [], count: 1 });
  assert.equal(seen.distanceFromSiteM, 100, 'distance from the site, never the position');
  assert.equal('latitude' in seen, false);
  const file = await caseFile(ctx.report.id);
  const photo = file.complaint.followUps.at(-1).attachments[0];
  assert.equal((await api('GET', `/public/attachments/${photo.id}`)).status, 404);
  assert.equal((await api('GET', photo.url.replace('/api', ''), { token: tokens.other })).status, 200, 'the uploader can see their own photograph');
  assert.equal((await api('GET', photo.url.replace('/api', ''), { token: tokens.citizen })).status, 403);

  // Later the reporter sees an improvement, and the moderator checks that evidence.
  const improved = await followUp(reference, tokens.citizen, { kind: 'IMPROVEMENT_OBSERVED', note: 'Debris covered with tarpaulin and sprinklers running.' }, { photos: [PNG] });
  assert.equal(improved.status, 201);
  r = await publicReport(reference);
  assert.deepEqual({ state: r.positions.citizen.state, verified: r.positions.citizen.verified }, { state: 'IMPROVED', verified: false });
  assert.deepEqual(r.positions.citizen.counts, { persists: 1, improved: 1, disputes: 0, residents: 2 });

  const improvedId = r.followUps.at(-1).id;
  await check(improvedId, { check: 'VERIFIED' });
  r = await publicReport(reference);
  assert.equal(r.positions.citizen.verified, true);
  const shown = r.followUps.at(-1);
  assert.match(shown.note, /tarpaulin/);
  assert.equal(shown.photos.length, 1);
  const served = await api('GET', shown.photos[0].url.replace('/api', ''));
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('cache-control'), 'no-cache');
  // The AirWatch review is still where it was: nobody on the case desk has acted on the case.
  assert.equal(r.status, 'SUBMITTED');
  assert.deepEqual(r.timeline.map((e) => e.toStatus), ['SUBMITTED']);

  // Setting an entry aside takes it out of the positions and keeps it in the trail, without its content.
  await check(seen.id, { check: 'SET_ASIDE', note: 'Photograph shows a different site.' });
  r = await publicReport(reference);
  assert.deepEqual(r.positions.citizen.counts, { persists: 0, improved: 1, disputes: 0, residents: 1 });
  const aside = r.followUps.find((f) => f.id === seen.id);
  assert.deepEqual({ check: aside.check, note: aside.note, photos: aside.photos, reason: aside.checkNote }, { check: 'SET_ASIDE', note: null, photos: [], reason: 'Photograph shows a different site.' });

  const raw = JSON.stringify((await api('GET', `/public/reports/${reference}`)).body);
  for (const secret of ['Asha Verma', 'Neighbour Nair', 'neighbour@example.com', 'citizen@airwatch.test', 'R. Malhotra']) assert.equal(raw.includes(secret), false, secret);

  const outcomes = (await api('GET', '/public/overview')).body.outcomes;
  assert.deepEqual(
    { reports: outcomes.reports, official: outcomes.officialComplaints, acknowledged: outcomes.acknowledged, action: outcomes.actionDocumented, improved: outcomes.improvementVerified, resolved: outcomes.airwatchResolved },
    { reports: 1, official: 1, acknowledged: 1, action: 0, improved: 1, resolved: 0 });
});

test('an official response moves the official position only when its evidence is verified', async () => {
  const { reference } = ctx.report;
  assert.ok((await followUp(reference, tokens.citizen, { kind: 'OFFICIAL_RESPONSE', note: 'Ward office says a notice was issued.' })).body.error.fields.acknowledgment);
  const added = await followUp(reference, tokens.citizen, { kind: 'OFFICIAL_RESPONSE', note: 'Ward office reply: stop-work notice issued to the contractor.', occurredOn: today() }, { acknowledgment: PNG });
  assert.equal(added.status, 201);
  let r = await publicReport(reference);
  assert.equal(r.positions.official.state, 'ACKNOWLEDGED', 'an unverified response changes nothing');
  assert.equal(r.positions.official.daysWithoutResponse, null);
  await check(r.followUps.at(-1).id, { check: 'VERIFIED' });
  r = await publicReport(reference);
  assert.equal(r.positions.official.state, 'ACTION_DOCUMENTED');
  assert.equal(r.status, 'SUBMITTED');
});

test('AirWatch resolves a case and the citizen disputes it: both positions stay on the record', async () => {
  const p = ctx.project;
  const created = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ projectCode: p.code, description: 'Trucks leaving uncovered and the road is thick with dust.' }) });
  const { id, reference } = created.body.complaint;
  const inspector = (await api('GET', '/municipal/officers', officer())).body.officers.find((o) => o.email === 'inspector@airwatch.test');
  await step(id, { status: 'UNDER_REVIEW' });
  await step(id, { status: 'INSPECTION_ASSIGNED', officerId: inspector.id });
  await step(id, { status: 'RESOLVED', findings: 'Trucks were leaving uncovered.', correctiveAction: 'Contractor told to cover every load.' });

  // Resolved by AirWatch says nothing about what residents see.
  let r = await publicReport(reference);
  assert.equal(r.positions.airwatch.status, 'RESOLVED');
  assert.ok(r.positions.airwatch.closedAt);
  assert.equal(r.positions.citizen.state, 'NONE');
  assert.equal(r.positions.official.state, 'NONE');
  let outcomes = (await api('GET', '/public/overview')).body.outcomes;
  assert.equal(outcomes.airwatchResolved, 1);
  assert.equal(outcomes.improvementVerified + outcomes.improvementReported, 1, 'only the first case has an observed improvement');

  const dispute = await followUp(reference, tokens.citizen, { kind: 'DISPUTE_CLOSURE', note: 'Loads are still uncovered every night. Nothing changed on the ground.' }, { photos: [PNG] });
  assert.equal(dispute.status, 201);
  r = await publicReport(reference);
  assert.equal(r.status, 'RESOLVED', 'the AirWatch record of its own review is not rewritten');
  assert.match(r.correctiveAction, /cover every load/);
  assert.deepEqual({ state: r.positions.citizen.state, contradicts: r.positions.citizen.contradictsClosure }, { state: 'DISPUTED', contradicts: true });
  assert.deepEqual(r.timeline.map((e) => e.toStatus), ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED']);
  assert.deepEqual(r.followUps.map((f) => f.kind), ['DISPUTE_CLOSURE']);

  // The case desk sees the dispute, can check its evidence, and its lifecycle is unchanged.
  const disputed = await api('GET', '/municipal/complaints?followUp=disputed', officer());
  assert.deepEqual(disputed.body.complaints.map((c) => c.id), [id]);
  assert.equal(disputed.body.complaints[0].positions.citizen.state, 'DISPUTED');
  const file = await caseFile(id);
  assert.deepEqual(file.allowedTransitions, []);
  assert.equal(file.complaint.audit.at(-1).type, 'FOLLOW_UP_ADDED');
  await check(file.complaint.followUps[0].id, { check: 'VERIFIED', note: 'Night photograph shows uncovered loads.' });
  r = await publicReport(reference);
  assert.equal(r.positions.citizen.verified, true);
  assert.equal(r.status, 'RESOLVED');

  // A plain "still unresolved" after the closure contradicts it too; an improvement does not.
  await followUp(reference, tokens.other, { kind: 'STILL_UNRESOLVED', note: 'Same again this morning, dust across the lane.' });
  r = await publicReport(reference);
  assert.deepEqual({ state: r.positions.citizen.state, contradicts: r.positions.citizen.contradictsClosure }, { state: 'PERSISTS', contradicts: true });
  await followUp(reference, tokens.other, { kind: 'IMPROVEMENT_OBSERVED', note: 'Loads covered tonight and the road was washed.' });
  r = await publicReport(reference);
  assert.deepEqual({ state: r.positions.citizen.state, contradicts: r.positions.citizen.contradictsClosure }, { state: 'IMPROVED', contradicts: false });
  outcomes = (await api('GET', '/public/overview')).body.outcomes;
  assert.equal(outcomes.followUps, 6, 'three live entries on each case; the one set aside is not counted');
});

test('hiding a report stops its photographs being served, cached copy or not', async () => {
  const { reference, id } = ctx.report;
  await step(id, { status: 'UNDER_REVIEW' });
  const photo = (await publicReport(reference)).photos[0];
  const path = photo.url.replace('/api', '');
  const first = await api('GET', path);
  assert.equal(first.status, 200);
  const etag = first.headers.get('etag');
  assert.equal((await api('GET', path, { headers: { 'if-none-match': etag } })).status, 304);
  await api('POST', `/municipal/complaints/${id}/visibility`, { ...officer(), json: { hidden: true, reason: 'Test of moderation.' } });
  assert.equal((await api('GET', path, { headers: { 'if-none-match': etag } })).status, 404);
  // The reporter can still add to their own hidden case; nobody else can reach it.
  assert.equal((await followUp(reference, tokens.citizen, { kind: 'NOTE', note: 'Adding a note while it is hidden.' })).status, 201);
  assert.equal((await followUp(reference, tokens.other, { kind: 'NOTE', note: 'Trying to reach a hidden case.' })).status, 404);
});

test('a report cannot be filed under one ward and another ward\'s area', async () => {
  const p = ctx.project;
  const elsewhere = stack.localityCodes.find((code) => code !== stack.sites.find((s) => s.project.code === p.code).locality.code);
  const text = 'Dust from uncovered soil heaps by the road.';
  const byProject = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ projectCode: p.code, localityCode: elsewhere, description: text }) });
  assert.equal(byProject.status, 400);
  assert.match(byProject.body.error.fields.localityCode, /not the area selected/);
  const byPoint = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ latitude: p.latitude, longitude: p.longitude, localityCode: elsewhere, description: text }) });
  assert.match(byPoint.body.error.fields.localityCode, /not the area selected/);
  const wrongWard = (await api('GET', '/public/overview')).body.wards.find((w) => w.pilot && w.code !== p.ward.code);
  const byWard = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ latitude: p.latitude, longitude: p.longitude, wardSlug: wrongWard.slug, description: text }) });
  assert.match(byWard.body.error.fields.wardSlug, /not the ward selected/);
});
