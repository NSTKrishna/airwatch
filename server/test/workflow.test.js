// End-to-end citizen -> municipal workflow over HTTP against a real PostgreSQL
// test database, using simulated construction-dust readings.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { startModelDouble } from './helpers/modelDouble.js';

const serverDir = fileURLToPath(new URL('..', import.meta.url));
const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL.replace(/\/airwatch(\?|$)/, '/airwatch_test$1');
assert.notEqual(testDbUrl, process.env.DATABASE_URL, 'refusing to run the workflow test against the development database');

// 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let model; let server; let base; let prisma;
const tokens = {};

async function api(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: json ? JSON.stringify(json) : form });
  const type = response.headers.get('content-type') || '';
  return { status: response.status, body: type.includes('json') ? await response.json() : await response.arrayBuffer(), headers: response.headers };
}

function complaintForm(fields, files = [{ name: 'dust.png', data: PNG, type: 'image/png' }]) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  for (const f of files) form.append('photos', new Blob([f.data], { type: f.type }), f.name);
  return form;
}

before(async () => {
  model = await startModelDouble();
  Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: testDbUrl, MODEL_API_URL: model.url, MONITOR_INTERVAL_SECONDS: '0' });
  const env = { ...process.env };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: serverDir, env, stdio: 'pipe' });
  ({ prisma } = await import('../src/db.js'));
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ComplaintEvent","Attachment","Complaint","AnomalyEvaluation","SensorObservation","SimulatorState","Site","Station","Locality","User" RESTART IDENTITY CASCADE');
  execFileSync('node', ['prisma/seed.js'], { cwd: serverDir, env, stdio: 'pipe' });

  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  base = `http://127.0.0.1:${server.address().port}/api`;

  const login = async (email, password) => (await api('POST', '/auth/login', { json: { email, password } })).body.token;
  tokens.citizen = await login('citizen@airwatch.test', 'Citizen@123');
  tokens.officer = await login('officer@airwatch.test', 'Officer@123');
  const other = await api('POST', '/auth/register', { json: { name: 'Other Citizen', email: 'other@example.com', password: 'password123' } });
  assert.equal(other.status, 201);
  assert.equal(other.body.user.role, 'CITIZEN');
  tokens.other = other.body.token;
});

after(async () => {
  server?.close();
  await prisma?.$disconnect();
  await model?.close();
});

const ctx = {};

test('authentication and role boundaries', async () => {
  assert.equal((await api('GET', '/localities')).status, 401);
  assert.equal((await api('GET', '/localities', { token: 'garbage' })).status, 401);
  assert.equal((await api('POST', '/auth/login', { json: { email: 'citizen@airwatch.test', password: 'wrong-password' } })).status, 401);
  // Sign-up cannot be used to obtain a municipal role.
  const sneaky = await api('POST', '/auth/register', { json: { name: 'Sneaky', email: 'sneaky@example.com', password: 'password123', role: 'MUNICIPAL' } });
  assert.equal(sneaky.body.user.role, 'CITIZEN');
  for (const path of ['/municipal/summary', '/municipal/complaints', '/municipal/officers', '/municipal/analytics', '/municipal/simulator', '/mock-sensors/sites/DEL-ROH-A/latest']) {
    assert.equal((await api('GET', path, { token: tokens.citizen })).status, 403, path);
  }
  assert.equal((await api('POST', '/municipal/monitoring/run', { token: tokens.citizen })).status, 403);
  // Officers do not file citizen complaints.
  assert.equal((await api('GET', '/complaints', { token: tokens.officer })).status, 403);
});

test('no verdict is produced while the model is unavailable', async () => {
  model.state.ready = false;
  const { resetModelInfoCache } = await import('../src/services/modelClient.js');
  resetModelInfoCache();
  const sweep = await api('POST', '/municipal/monitoring/run', { token: tokens.officer });
  assert.deepEqual(sweep.body.counts, { MODEL_UNAVAILABLE: 8 });
  const rows = await prisma.anomalyEvaluation.findMany();
  assert.equal(rows.length, 8);
  for (const row of rows) {
    assert.equal(row.isAnomaly, null);
    assert.equal(row.dynamicBarrier, null);
    assert.equal(row.modelVersion, null);
  }
  const summary = await api('GET', '/municipal/summary', { token: tokens.officer });
  assert.equal(summary.body.activeAnomalies, 0);
  assert.equal(summary.body.sitesWithoutAssessment, 8);
  const status = await api('GET', '/system/status', { token: tokens.citizen });
  assert.equal(status.body.model.ready, false);
  assert.equal(status.body.sensors.simulated, true);
  model.state.ready = true;
  resetModelInfoCache();
});

test('a simulated dust event is flagged and stored with sensor values and model version', async () => {
  const sim = await api('GET', '/municipal/simulator', { token: tokens.officer });
  ctx.dusty = sim.body.sites.find((s) => s.code === 'DEL-ROH-A');
  ctx.calm = sim.body.sites.find((s) => s.code === 'DEL-DWK-A');
  const set = await api('PUT', `/municipal/simulator/sites/${ctx.dusty.id}`, { token: tokens.officer, json: { scenario: 'DUST_EVENT' } });
  assert.equal(set.body.isAnomaly, true);
  await api('POST', '/municipal/monitoring/run', { token: tokens.officer });

  const locality = await api('GET', '/localities/DEL-ROH', { token: tokens.citizen });
  const site = locality.body.sites.find((s) => s.id === ctx.dusty.id);
  const e = site.latest.evaluation;
  assert.equal(site.latest.simulated, true);
  assert.equal(e.status, 'EVALUATED');
  assert.equal(e.active, true);
  assert.ok(e.observedDifference > e.dynamicBarrier);
  assert.ok(Math.abs(e.observedDifference - (e.siteValue - e.backgroundValue)) < 1e-9);
  assert.equal(e.interpretation, 'Evidence for review; not proof of a construction violation');
  assert.match(e.model.version, /^TEST_DOUBLE\/artifact-v1\//);
  assert.ok(e.siteTimestamp && e.backgroundTimestamp);

  const flagged = await api('GET', '/municipal/flagged-sites', { token: tokens.officer });
  assert.deepEqual(flagged.body.sites.filter((s) => s.flagged).map((s) => s.code), ['DEL-ROH-A']);
  const history = await api('GET', `/sites/${ctx.dusty.id}/history?hours=1`, { token: tokens.citizen });
  assert.ok(history.body.points.some((p) => p.anomalies > 0));
});

test('stale or incompatible readings never reach the model', async () => {
  const okh = (await api('GET', '/municipal/simulator', { token: tokens.officer })).body.sites.find((s) => s.code === 'DEL-OKH-A');
  for (const [scenario, pattern] of [['STALE_SENSOR', /stale/], ['INCOMPATIBLE_UNIT', /incompatible unit/]]) {
    const before = model.state.predictCalls.length;
    const set = await api('PUT', `/municipal/simulator/sites/${okh.id}`, { token: tokens.officer, json: { scenario } });
    assert.equal(set.body.evaluationStatus, 'INPUT_REJECTED');
    assert.equal(set.body.isAnomaly, null);
    assert.equal(model.state.predictCalls.length, before, `${scenario} must not call /predict`);
    const latest = await prisma.anomalyEvaluation.findFirst({ where: { siteId: okh.id }, orderBy: { evaluatedAt: 'desc' } });
    assert.match(latest.reason, pattern);
  }
  await api('PUT', `/municipal/simulator/sites/${okh.id}`, { token: tokens.officer, json: { scenario: 'NORMAL' } });
});

test('citizen reports the flagged site and anomaly evidence is attached automatically', async () => {
  const created = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ localityCode: 'DEL-ROH', siteId: ctx.dusty.id, description: 'Thick dust cloud, no water sprinkling or covers on the debris.' }),
  });
  assert.equal(created.status, 201);
  const c = created.body.complaint;
  ctx.flaggedComplaint = c;
  assert.match(c.reference, /^AW-\d{4}-\d{5}$/);
  assert.equal(c.status, 'SUBMITTED');
  assert.equal(c.hasAnomalyEvidence, true);
  assert.equal(c.anomalyEvidence.isAnomaly, true);
  assert.equal(c.sensorSnapshot.simulated, true);
  assert.equal(c.attachments.length, 1);

  const image = await api('GET', c.attachments[0].url.replace('/api', ''), { token: tokens.citizen });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(image.body).equals(PNG), true);
});

test('reporting works without an anomaly flag and without a listed site', async () => {
  const calm = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ localityCode: 'DEL-DWK', siteId: ctx.calm.id, description: 'Visible dust from uncovered sand piles near the gate.' }),
  });
  assert.equal(calm.status, 201);
  assert.equal(calm.body.complaint.hasAnomalyEvidence, false);
  assert.equal(calm.body.complaint.anomalyEvidence, null);
  assert.ok(calm.body.complaint.sensorSnapshot);
  ctx.calmComplaint = calm.body.complaint;

  const unlisted = await api('POST', '/complaints', {
    token: tokens.other,
    form: complaintForm({ localityCode: 'DEL-ANV', description: 'Demolition work with heavy dust behind the market.', locationText: 'Lane behind the main market', latitude: 28.65, longitude: 77.31 }),
  });
  assert.equal(unlisted.status, 201);
  assert.equal(unlisted.body.complaint.site, null);
  ctx.otherComplaint = unlisted.body.complaint;
});

test('complaint validation', async () => {
  const noPhoto = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: 'DEL-ROH', siteId: ctx.dusty.id, description: 'Dust everywhere today.' }, []) });
  assert.equal(noPhoto.status, 400);
  assert.ok(noPhoto.body.error.fields.photos);
  const notImage = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ localityCode: 'DEL-ROH', siteId: ctx.dusty.id, description: 'Dust everywhere today.' }, [{ name: 'x.png', data: Buffer.from('<script>alert(1)</script>'), type: 'image/png' }]),
  });
  assert.equal(notImage.status, 400);
  const bad = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: 'DEL-ROH', description: 'short' }) });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.fields.description && bad.body.error.fields.locationText);
  const wrongLocality = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: 'DEL-OKH', siteId: ctx.dusty.id, description: 'Dust everywhere today.' }) });
  assert.equal(wrongLocality.status, 400);
});

test('citizens only see their own complaints', async () => {
  const mine = await api('GET', '/complaints', { token: tokens.citizen });
  assert.equal(mine.body.complaints.length, 2);
  assert.equal((await api('GET', `/complaints/${ctx.otherComplaint.id}`, { token: tokens.citizen })).status, 404);
  const foreignPhoto = ctx.otherComplaint.attachments[0].url.replace('/api', '');
  assert.equal((await api('GET', foreignPhoto, { token: tokens.citizen })).status, 404);
  assert.equal((await api('GET', foreignPhoto)).status, 401);
  assert.equal((await api('POST', `/municipal/complaints/${ctx.flaggedComplaint.id}/status`, { token: tokens.citizen, json: { status: 'RESOLVED' } })).status, 403);
});

test('municipal inbox: search and filters', async () => {
  const all = await api('GET', '/municipal/complaints', { token: tokens.officer });
  assert.equal(all.body.total, 3);
  const withEvidence = await api('GET', '/municipal/complaints?anomaly=yes', { token: tokens.officer });
  assert.deepEqual(withEvidence.body.complaints.map((c) => c.id), [ctx.flaggedComplaint.id]);
  const byRef = await api('GET', `/municipal/complaints?q=${ctx.calmComplaint.reference}`, { token: tokens.officer });
  assert.ok(byRef.body.complaints.some((c) => c.id === ctx.calmComplaint.id));
  const byText = await api('GET', '/municipal/complaints?q=sprinkling', { token: tokens.officer });
  assert.deepEqual(byText.body.complaints.map((c) => c.id), [ctx.flaggedComplaint.id]);
  const byLocality = await api('GET', '/municipal/complaints?locality=DEL-ANV&status=SUBMITTED', { token: tokens.officer });
  assert.deepEqual(byLocality.body.complaints.map((c) => c.id), [ctx.otherComplaint.id]);
  assert.equal((await api('GET', '/municipal/complaints?status=NOPE', { token: tokens.officer })).status, 400);
});

test('lifecycle: Submitted -> Under Review -> Inspection Assigned -> Resolved, with audit trail', async () => {
  const id = ctx.flaggedComplaint.id;
  const path = `/municipal/complaints/${id}`;
  const officer = { token: tokens.officer };
  const step = (json) => api('POST', `${path}/status`, { ...officer, json });

  const detail = await api('GET', path, officer);
  assert.deepEqual(detail.body.allowedTransitions, ['UNDER_REVIEW']);
  assert.equal(detail.body.complaint.anomalyEvidence.isAnomaly, true);
  assert.equal(detail.body.complaint.citizen.email, 'citizen@airwatch.test');

  assert.equal((await step({ status: 'RESOLVED', findings: 'x', correctiveAction: 'y' })).status, 409);
  assert.equal((await step({ status: 'UNDER_REVIEW' })).status, 200);
  assert.equal((await step({ status: 'INSPECTION_ASSIGNED' })).status, 400);

  const officers = (await api('GET', '/municipal/officers', officer)).body.officers;
  const inspector = officers.find((o) => o.email === 'inspector@airwatch.test');
  const citizenId = detail.body.complaint.citizen.id;
  assert.equal((await step({ status: 'INSPECTION_ASSIGNED', officerId: citizenId })).status, 400);
  const assigned = await step({ status: 'INSPECTION_ASSIGNED', officerId: inspector.id, note: 'Site visit scheduled' });
  assert.equal(assigned.body.complaint.assignedOfficer.id, inspector.id);

  assert.equal((await api('POST', `${path}/notes`, { ...officer, json: { note: 'Visited site; excavation without wetting.' } })).status, 201);
  const evidenceForm = new FormData();
  evidenceForm.append('caption', 'Uncovered debris');
  evidenceForm.append('files', new Blob([PNG], { type: 'image/png' }), 'inspection.png');
  const evidence = await api('POST', `${path}/evidence`, { ...officer, form: evidenceForm });
  assert.equal(evidence.status, 201);
  assert.equal(evidence.body.complaint.attachments.filter((a) => a.kind === 'INSPECTION_EVIDENCE').length, 1);

  assert.equal((await step({ status: 'RESOLVED' })).status, 400);
  const resolved = await step({ status: 'RESOLVED', findings: 'Dust suppression not in place during excavation.', correctiveAction: 'Contractor directed to deploy sprinklers and cover debris; re-inspection in 7 days.' });
  assert.equal(resolved.status, 200);
  assert.deepEqual(resolved.body.allowedTransitions, []);
  assert.equal((await step({ status: 'REJECTED', note: 'changed my mind' })).status, 409);
  assert.equal((await api('POST', `${path}/assign`, { ...officer, json: { officerId: inspector.id } })).status, 409);

  const audit = resolved.body.complaint.audit;
  assert.deepEqual(audit.map((e) => e.type), ['SUBMITTED', 'STATUS_CHANGED', 'OFFICER_ASSIGNED', 'STATUS_CHANGED', 'NOTE_ADDED', 'EVIDENCE_UPLOADED', 'STATUS_CHANGED']);
  assert.deepEqual(
    audit.filter((e) => e.type === 'STATUS_CHANGED').map((e) => `${e.fromStatus}>${e.toStatus}`),
    ['SUBMITTED>UNDER_REVIEW', 'UNDER_REVIEW>INSPECTION_ASSIGNED', 'INSPECTION_ASSIGNED>RESOLVED']);
  assert.ok(audit.every((e) => e.actor?.name && e.createdAt));

  // The citizen sees the outcome, but not internal notes, officer names or inspection photos.
  const citizenView = (await api('GET', `/complaints/${id}`, { token: tokens.citizen })).body.complaint;
  assert.equal(citizenView.status, 'RESOLVED');
  assert.match(citizenView.correctiveAction, /sprinklers/);
  assert.deepEqual(citizenView.timeline.map((e) => e.toStatus), ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED']);
  assert.equal(JSON.stringify(citizenView).includes('excavation without wetting'), false);
  assert.equal('assignedOfficer' in citizenView, false);
  assert.equal(citizenView.attachments.length, 1);
  const inspectionPhoto = evidence.body.complaint.attachments.find((a) => a.kind === 'INSPECTION_EVIDENCE');
  assert.equal((await api('GET', inspectionPhoto.url.replace('/api', ''), { token: tokens.citizen })).status, 403);
});

test('lifecycle: rejection needs a reason; dashboard totals add up', async () => {
  const path = `/municipal/complaints/${ctx.calmComplaint.id}/status`;
  const officer = { token: tokens.officer };
  assert.equal((await api('POST', path, { ...officer, json: { status: 'REJECTED', note: 'Too early' } })).status, 409);
  await api('POST', path, { ...officer, json: { status: 'UNDER_REVIEW' } });
  assert.equal((await api('POST', path, { ...officer, json: { status: 'REJECTED' } })).status, 400);
  assert.equal((await api('POST', path, { ...officer, json: { status: 'REJECTED', note: 'Duplicate of an earlier report.' } })).status, 200);

  const summary = (await api('GET', '/municipal/summary', officer)).body;
  assert.equal(summary.totalReports, 3);
  assert.equal(summary.resolvedCases, 1);
  assert.equal(summary.rejectedCases, 1);
  assert.equal(summary.awaitingReview, 1);
  assert.equal(summary.pendingInspections, 0);
  assert.equal(summary.activeAnomalies, 1);

  const analytics = (await api('GET', '/municipal/analytics?hours=1', officer)).body;
  assert.equal(analytics.simulated, true);
  assert.equal(analytics.localities.length, 4);
  assert.ok(analytics.localities.find((l) => l.code === 'DEL-ROH').anomalies >= 1);
  assert.equal(analytics.complaintsByStatus.RESOLVED, 1);
});
