// The public map API and the full accountability loop over HTTP:
// citizen report -> ward routing -> case desk review -> public status history.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PNG, complaintForm, startStack } from './helpers/stack.js';

let stack; let api; let prisma; let tokens;
const ctx = {};
const officer = () => ({ token: tokens.officer });
const publicReport = async (reference) => (await api('GET', `/public/reports/${reference}`)).body.report;
const step = (id, json) => api('POST', `/municipal/complaints/${id}/status`, { ...officer(), json });

before(async () => {
  stack = await startStack();
  ({ api, prisma, tokens } = stack);
  ctx.projects = (await api('GET', '/public/projects')).body.projects;
  ctx.overview = (await api('GET', '/public/overview')).body;
});
after(() => stack?.close());

test('the map is readable without an account, and says what it is', async () => {
  const o = ctx.overview;
  assert.equal(o.city, 'Mumbai');
  assert.equal(o.official, false);
  const pilot = o.wards.filter((w) => w.pilot);
  assert.ok(pilot.length >= 3, 'a few pilot wards');
  assert.ok(o.wards.length > pilot.length, 'the other Mumbai wards are listed for expansion');
  for (const w of pilot) {
    assert.ok(w.counts.projects >= 1 && w.counts.monitors >= 1, `${w.code} has verified projects with demo monitors`);
    assert.ok(w.office.address && w.office.sourceUrls.length && w.office.verifiedOn, `${w.code} office is sourced`);
  }
  assert.ok(o.wards.filter((w) => !w.pilot).every((w) => w.counts === null && w.office === null));
  assert.equal(o.totals.projects, ctx.projects.length);
  assert.equal('model' in o, false, 'model diagnostics are kept off the public map overview');
  assert.equal('sensors' in o, false, 'sensor diagnostics are kept off the public map overview');
  const methodology = (await api('GET', '/public/methodology')).body;
  assert.match(methodology.model.limitations, /not been validated for Mumbai/);
  assert.equal(typeof methodology.model.algorithm, 'string');
  assert.ok(methodology.model.calibration && methodology.model.features.length > 0);
  assert.equal(methodology.monitoring.simulated, true);
  assert.ok(o.dustAuthority.summary && o.dustAuthority.sourceUrls.length && o.dustAuthority.channels.length);

  const boundaries = (await api('GET', '/public/boundaries')).body;
  assert.equal(boundaries.features.length, o.wards.length);
  assert.ok(boundaries.source.url.startsWith('http') && boundaries.source.licence);
  // Signed-out callers still cannot reach anything else.
  assert.equal((await api('GET', '/sites')).status, 401);
  assert.equal((await api('GET', '/municipal/complaints')).status, 401);
});

test('every project is a sourced public record inside its ward; every monitor is a labelled DEMO device', async () => {
  assert.ok(ctx.projects.length >= 10);
  for (const p of ctx.projects) {
    assert.ok(p.name && p.authority && p.category, p.code);
    assert.ok(p.sourceUrls.length >= 1 && p.sourceUrls.every((u) => /^https?:\/\//.test(u)), `${p.code} cites a source`);
    assert.match(p.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(ctx.overview.wards.find((w) => w.slug === p.ward.slug)?.pilot, `${p.code} is in a pilot ward`);
    if (p.latitude == null) {
      assert.equal(p.monitor, null, `${p.code} has no position, so no monitor`);
      continue;
    }
    assert.ok(p.coordinateSource && ['site', 'street', 'locality'].includes(p.coordinatePrecision), `${p.code} says where its position came from`);
    const located = (await api('GET', `/public/locate?lat=${p.latitude}&lng=${p.longitude}`)).body;
    assert.equal(located.ward?.code, p.ward.code, `${p.code} lies inside ${p.ward.code}`);
    if (p.coordinatePrecision === 'locality') {
      assert.equal(p.monitor, null, `${p.code} is only placed approximately, so no monitor`);
    } else {
      assert.equal(p.monitor.device.provenance, 'SIMULATED');
      assert.match(p.monitor.device.deviceId, /^DEMO-/);
      assert.equal(p.monitor.background.simulated, true);
    }
  }
  const wardPage = (await api('GET', `/public/wards/${ctx.projects[0].ward.slug}`)).body;
  assert.ok(wardPage.projects.some((p) => p.code === ctx.projects[0].code));
  for (const r of wardPage.representatives) {
    assert.ok(['CORPORATOR', 'MLA', 'MP'].includes(r.role) && r.name && r.constituency);
    assert.match(r.sourceUrl, /^https?:\/\//);
    assert.match(r.verifiedOn, /^\d{4}-\d{2}-\d{2}$/);
  }
  assert.equal((await api('GET', '/public/wards/nope')).status, 404);
  assert.equal((await api('GET', '/public/projects/NOPE-99')).status, 404);
  const found = (await api('GET', `/public/projects?q=${encodeURIComponent(ctx.projects[0].name.slice(0, 8))}`)).body.projects;
  assert.ok(found.some((p) => p.code === ctx.projects[0].code));
});

test('locating a point: pilot ward, another ward, and outside Mumbai', async () => {
  const p = ctx.projects.find((x) => x.monitor);
  const here = (await api('GET', `/public/locate?lat=${p.latitude}&lng=${p.longitude}`)).body;
  assert.equal(here.ward.pilot, true);
  assert.equal(here.nearbyProjects[0].code, p.code);
  assert.equal(here.nearbyProjects[0].distanceM, 0);
  const other = ctx.overview.wards.find((w) => !w.pilot);
  const elsewhere = (await api('GET', `/public/locate?lat=${other.latitude}&lng=${other.longitude}`)).body;
  assert.equal(elsewhere.ward.code, other.code);
  assert.equal(elsewhere.ward.pilot, false);
  assert.deepEqual(elsewhere.nearbyProjects, []);
  assert.equal((await api('GET', '/public/locate?lat=18.6&lng=72.5')).body.ward, null);
  assert.equal((await api('GET', '/public/locate?lat=abc&lng=72.5')).status, 400);
});

test('demo monitor history carries PM2.5, PM10, temperature and humidity', async () => {
  const p = ctx.projects.find((x) => x.monitor);
  await stack.simulator.publishSimulatedReadings({ siteIds: [p.monitor.siteId], minutes: 10 });
  const history = (await api('GET', `/public/sites/${p.monitor.siteId}/history?hours=6`)).body;
  assert.equal(history.simulated, true);
  assert.ok(history.points.length >= 1);
  for (const point of history.points) {
    for (const key of ['site', 'pm25', 'background', 'temperature', 'humidity']) assert.equal(typeof point[key], 'number', key);
    assert.ok(point.evaluated >= 1 && point.anomalies === 0);
  }
  const now = (await api('GET', `/public/projects/${p.code}`)).body.project.monitor.latest;
  assert.equal(now.simulated, true);
  assert.equal(now.evaluation.status, 'EVALUATED');
  assert.equal((await api('GET', `/public/sites/${p.monitor.siteId}/history?hours=168`)).status, 200);
  assert.equal((await api('GET', `/public/sites/${p.monitor.siteId}/history?hours=500`)).status, 400);
  assert.equal((await api('GET', '/public/sites/nope/history')).status, 404);
});

test('a report is routed by the project named, by location, or by the ward chosen', async () => {
  const p = ctx.projects.find((x) => x.monitor);
  const text = 'Uncovered debris and no water sprinkling at the gate since morning.';
  assert.equal((await api('POST', '/complaints', { form: complaintForm({ projectCode: p.code, description: text }) })).status, 401);

  const named = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ projectCode: p.code, description: text }) });
  assert.equal(named.status, 201);
  ctx.named = named.body.complaint;
  assert.equal(ctx.named.project.code, p.code);
  assert.equal(ctx.named.ward.code, p.ward.code);
  assert.equal(ctx.named.wardOffice.address, ctx.overview.wards.find((w) => w.code === p.ward.code).office.address);
  assert.ok(ctx.named.sensorSnapshot, 'the demo monitor reading at that moment is saved');

  // 0.004 degrees is about 440 m: near the project, and still inside the same ward for this point.
  const spot = { latitude: p.latitude + 0.0004, longitude: p.longitude + 0.0004 };
  const located = await api('POST', '/complaints', {
    token: tokens.citizen, form: complaintForm({ ...spot, description: 'Demolition dust from a small plot that is not on the list.', locationText: 'Lane behind the market' }),
  });
  assert.equal(located.status, 201);
  ctx.located = located.body.complaint;
  assert.equal(ctx.located.project, null);
  assert.equal(ctx.located.ward.code, p.ward.code);

  const chosen = await api('POST', '/complaints', {
    token: tokens.citizen, form: complaintForm({ wardSlug: p.ward.slug, description: 'Trucks without covers on the service road.', locationText: 'Near the petrol pump' }),
  });
  assert.equal(chosen.status, 201);
  assert.equal(chosen.body.complaint.ward.code, p.ward.code);
  ctx.chosen = chosen.body.complaint;

  const other = ctx.overview.wards.find((w) => !w.pilot);
  const outside = await api('POST', '/complaints', {
    token: tokens.citizen, form: complaintForm({ latitude: other.latitude, longitude: other.longitude, description: 'Dust from a site in another ward.' }),
  });
  assert.equal(outside.status, 400);
  assert.match(outside.body.error.fields.latitude, /not part of the pilot/);
  const sea = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ latitude: 18.6, longitude: 72.5, description: 'Dust far out at sea.' }) });
  assert.match(sea.body.error.fields.latitude, /outside the mapped Mumbai wards/);
  const nowhere = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ description: 'Dust somewhere.', locationText: 'Somewhere' }) });
  assert.ok(nowhere.body.error.fields.locationText);
  assert.equal((await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ projectCode: 'NOPE-99', description: text }) })).status, 400);
});

test('an unreviewed report is public as a pin and a status only', async () => {
  const list = (await api('GET', '/public/reports')).body.reports;
  assert.equal(list.length, 3);
  const r = await publicReport(ctx.located.reference);
  assert.equal(r.status, 'SUBMITTED');
  assert.equal(r.verification, 'UNREVIEWED');
  assert.equal(r.description, null);
  assert.equal(r.locationText, null);
  assert.equal(r.photoCount, 1);
  assert.deepEqual(r.photos, []);
  assert.equal(r.isDemo, false);
  // Placed to about 100 m, not on the citizen's doorstep.
  assert.equal(r.locationApproximate, true);
  assert.equal(r.latitude, Math.round(ctx.located.latitude * 1000) / 1000);
  assert.deepEqual(r.timeline.map((e) => e.toStatus), ['SUBMITTED']);
  assert.equal(r.wardOffice.code, ctx.located.ward.code);

  const onProject = await publicReport(ctx.named.reference);
  assert.equal(onProject.locationApproximate, false);
  assert.equal(onProject.latitude, ctx.projects.find((p) => p.code === ctx.named.project.code).latitude);

  // Its photograph is not public yet, even with the id in hand.
  const photoId = ctx.located.attachments[0].id;
  assert.equal((await api('GET', `/public/attachments/${photoId}`)).status, 404);
  const raw = JSON.stringify((await api('GET', `/public/reports/${ctx.located.reference}`)).body);
  for (const secret of ['Asha Verma', 'citizen@airwatch.test', 'Lane behind the market']) assert.equal(raw.includes(secret), false, secret);
  assert.equal((await api('GET', '/public/reports/AW-2026-99999')).status, 404);
  assert.equal((await api('GET', '/public/reports/garbage')).status, 404);
});

test('case desk review shows up in the public status history, step by step', async () => {
  const { id, reference } = ctx.located;
  const inbox = await api('GET', `/municipal/complaints?ward=${ctx.located.ward.slug}`, officer());
  assert.equal(inbox.body.total, 3);
  assert.ok(inbox.body.complaints.every((c) => c.ward.code === ctx.located.ward.code));
  const file = (await api('GET', `/municipal/complaints/${id}`, officer())).body.complaint;
  assert.equal(file.wardOffice.code, ctx.located.ward.code);
  assert.equal(file.publicHidden, false);

  assert.equal((await step(id, { status: 'UNDER_REVIEW' })).status, 200);
  let r = await publicReport(reference);
  assert.equal(r.verification, 'IN_REVIEW');
  assert.match(r.description, /Demolition dust/);
  assert.equal(r.locationText, 'Lane behind the market');
  assert.equal(r.photos.length, 1);
  const photo = await api('GET', r.photos[0].url.replace('/api', ''));
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(photo.body).equals(PNG), true);

  const officers = (await api('GET', '/municipal/officers', officer())).body.officers;
  const inspector = officers.find((o) => o.email === 'inspector@airwatch.test');
  await step(id, { status: 'INSPECTION_ASSIGNED', officerId: inspector.id, note: 'Visit tomorrow morning' });
  await api('POST', `/municipal/complaints/${id}/notes`, { ...officer(), json: { note: 'Internal: plot owner not traceable yet.' } });
  const evidence = new FormData();
  evidence.append('files', new Blob([PNG], { type: 'image/png' }), 'inspection.png');
  const uploaded = await api('POST', `/municipal/complaints/${id}/evidence`, { ...officer(), form: evidence });
  r = await publicReport(reference);
  assert.equal(r.status, 'INSPECTION_ASSIGNED');
  assert.equal(r.findings, null);

  await step(id, { status: 'RESOLVED', findings: 'Demolition without water spray confirmed.', correctiveAction: 'Owner told to sprinkle and screen the plot.' });
  r = await publicReport(reference);
  assert.equal(r.status, 'RESOLVED');
  assert.equal(r.verification, 'INSPECTED');
  assert.match(r.findings, /without water spray/);
  assert.match(r.correctiveAction, /sprinkle/);
  assert.deepEqual(r.timeline.map((e) => e.toStatus), ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED']);
  assert.ok(r.timeline.every((e) => e.createdAt));

  // Officers, internal notes and inspection photographs never reach the public.
  const raw = JSON.stringify((await api('GET', `/public/reports/${reference}`)).body);
  for (const secret of ['S. Iyer', 'R. Malhotra', 'Visit tomorrow', 'not traceable', 'Asha Verma']) assert.equal(raw.includes(secret), false, secret);
  assert.equal(r.photos.length, 1);
  const inspectionPhoto = uploaded.body.complaint.attachments.find((a) => a.kind === 'INSPECTION_EVIDENCE');
  assert.equal((await api('GET', `/public/attachments/${inspectionPhoto.id}`)).status, 404);

  const counts = (await api('GET', '/public/overview')).body.wards.find((w) => w.code === ctx.located.ward.code).counts;
  assert.deepEqual({ reports: counts.reports, open: counts.openReports, resolved: counts.resolvedReports }, { reports: 3, open: 2, resolved: 1 });
});

test('a rejection is public with its reason', async () => {
  const { id, reference } = ctx.chosen;
  await step(id, { status: 'UNDER_REVIEW' });
  await step(id, { status: 'REJECTED', note: 'Road sweeping, not construction work.' });
  const r = await publicReport(reference);
  assert.equal(r.verification, 'NOT_UPHELD');
  assert.equal(r.findings, 'Road sweeping, not construction work.');
  assert.deepEqual(r.timeline.map((e) => e.toStatus), ['SUBMITTED', 'UNDER_REVIEW', 'REJECTED']);
  assert.equal((await api('GET', '/public/reports?status=REJECTED')).body.reports.length, 1);
});

test('moderation: a hidden report leaves the public map and keeps its case', async () => {
  const { id, reference } = ctx.named;
  const path = `/municipal/complaints/${id}/visibility`;
  assert.equal((await api('POST', path, { token: tokens.citizen, json: { hidden: true, reason: 'x' } })).status, 403);
  assert.equal((await api('POST', path, { ...officer(), json: { hidden: true } })).status, 400);
  await step(id, { status: 'UNDER_REVIEW' });
  const photoUrl = (await publicReport(reference)).photos[0].url.replace('/api', '');
  assert.equal((await api('GET', photoUrl)).status, 200);

  const hidden = await api('POST', path, { ...officer(), json: { hidden: true, reason: 'Photograph shows a person\'s face.' } });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.complaint.publicHidden, true);
  assert.equal(hidden.body.complaint.status, 'UNDER_REVIEW');
  assert.equal(hidden.body.complaint.audit.at(-1).type, 'VISIBILITY_CHANGED');
  assert.equal((await api('GET', `/public/reports/${reference}`)).status, 404);
  assert.equal((await api('GET', photoUrl)).status, 404);
  assert.equal((await api('GET', '/public/reports')).body.reports.some((r) => r.reference === reference), false);
  assert.equal((await api('GET', `/public/projects/${ctx.named.project.code}`)).body.reports.length, 0);
  // The citizen still has it, and is told it is off the map.
  const mine = (await api('GET', `/complaints/${id}`, { token: tokens.citizen })).body.complaint;
  assert.equal(mine.publicHidden, true);
  assert.equal(mine.status, 'UNDER_REVIEW');

  await api('POST', path, { ...officer(), json: { hidden: false } });
  assert.equal((await publicReport(reference)).status, 'UNDER_REVIEW');
  assert.equal((await prisma.complaintEvent.count({ where: { complaintId: id, type: 'VISIBILITY_CHANGED' } })), 2);
});
