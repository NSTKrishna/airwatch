// End-to-end citizen -> municipal workflow over HTTP against a real PostgreSQL
// test database, using simulated construction-dust readings that travel through
// the device ingestion API.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { PNG, complaintForm, startStack } from './helpers/stack.js';

let stack; let api; let model; let prisma;
const tokens = {};

before(async () => {
  stack = await startStack();
  ({ api, model, prisma } = stack);
  Object.assign(tokens, stack.tokens);
  const other = await api('POST', '/auth/register', { json: { name: 'Other Citizen', email: 'other@example.com', password: 'password123' } });
  assert.equal(other.status, 201);
  assert.equal(other.body.user.role, 'CITIZEN');
  tokens.other = other.body.token;
});

after(() => stack?.close());

const ctx = {};

test('authentication and role boundaries', async () => {
  assert.equal((await api('GET', '/localities')).status, 401);
  assert.equal((await api('GET', '/localities', { token: 'garbage' })).status, 401);
  assert.equal((await api('POST', '/auth/login', { json: { email: 'citizen@airwatch.test', password: 'wrong-password' } })).status, 401);
  // Sign-up cannot be used to obtain a municipal role.
  const sneaky = await api('POST', '/auth/register', { json: { name: 'Sneaky', email: 'sneaky@example.com', password: 'password123', role: 'MUNICIPAL' } });
  assert.equal(sneaky.body.user.role, 'CITIZEN');
  for (const path of ['/municipal/summary', '/municipal/complaints', '/municipal/officers', '/municipal/analytics', '/municipal/simulator', '/municipal/devices']) {
    assert.equal((await api('GET', path, { token: tokens.citizen })).status, 403, path);
  }
  assert.equal((await api('POST', '/municipal/monitoring/run', { token: tokens.citizen })).status, 403);
  // Officers do not file citizen complaints.
  assert.equal((await api('GET', '/complaints', { token: tokens.officer })).status, 403);
});

test('no verdict is produced while the model is unavailable', async () => {
  model.state.ready = false;
  await stack.resetModelCache();
  const sweep = await api('POST', '/municipal/monitoring/run', { token: tokens.officer });
  assert.deepEqual(sweep.body.counts, { MODEL_UNAVAILABLE: stack.sites.length });
  const rows = await prisma.anomalyEvaluation.findMany();
  assert.equal(rows.length, stack.sites.length);
  for (const row of rows) {
    assert.equal(row.isAnomaly, null);
    assert.equal(row.dynamicBarrier, null);
    assert.equal(row.modelVersion, null);
  }
  const summary = await api('GET', '/municipal/summary', { token: tokens.officer });
  assert.equal(summary.body.activeAnomalies, 0);
  assert.equal(summary.body.sitesWithoutAssessment, stack.sites.length);
  const status = await api('GET', '/system/status', { token: tokens.citizen });
  assert.equal(status.body.model.ready, false);
  assert.equal(status.body.sensors.simulated, true);
  model.state.ready = true;
  await stack.resetModelCache();
});

test('a simulated dust event is flagged and stored with sensor values and model version', async () => {
  const sim = await api('GET', '/municipal/simulator', { token: tokens.officer });
  ctx.dusty = sim.body.sites.find((s) => s.id === stack.siteIn(0, 0).id);
  ctx.calm = sim.body.sites.find((s) => s.id === stack.siteIn(1, 0).id);
  const set = await api('PUT', `/municipal/simulator/sites/${ctx.dusty.id}`, { token: tokens.officer, json: { scenario: 'DUST_EVENT' } });
  assert.equal(set.body.isAnomaly, true);
  await api('POST', '/municipal/monitoring/run', { token: tokens.officer });

  const locality = await api('GET', `/localities/${stack.localityCodes[0]}`, { token: tokens.citizen });
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
  assert.deepEqual(flagged.body.sites.filter((s) => s.flagged).map((s) => s.code), [ctx.dusty.code]);
  const history = await api('GET', `/sites/${ctx.dusty.id}/history?hours=1`, { token: tokens.citizen });
  assert.ok(history.body.points.some((p) => p.anomalies > 0));
});

test('device and context problems are reported as such and never reach the model', async () => {
  const sim = (await api('GET', '/municipal/simulator', { token: tokens.officer })).body;
  const kurla = sim.sites.find((s) => s.id === stack.siteIn(2, 0).id);
  assert.deepEqual(sim.scenarios.map((s) => s.id), ['NORMAL', 'DUST_EVENT', 'FLATLINE', 'STALE_READINGS', 'INVALID_VALUES', 'CONNECTIVITY_FAILURE', 'BACKGROUND_OUTAGE', 'WEATHER_OUTAGE']);
  const set = (scenario) => api('PUT', `/municipal/simulator/sites/${kurla.id}`, { token: tokens.officer, json: { scenario } });

  for (const [scenario, pattern] of [
    ['STALE_READINGS', /stale/],
    ['INVALID_VALUES', /not usable.*PM10 is negative/],
    ['BACKGROUND_OUTAGE', /No background PM10 observation/],
    ['WEATHER_OUTAGE', /Wind speed and direction are not available/],
  ]) {
    const calls = model.state.predictCalls.length;
    const result = (await set(scenario)).body;
    assert.equal(result.evaluationStatus, 'INPUT_REJECTED', scenario);
    assert.equal(result.isAnomaly, null);
    assert.match(result.reason, pattern);
    assert.equal(model.state.predictCalls.length, calls, `${scenario} must not call /predict`);
  }

  // The raw reading is kept even though no background value existed, and nothing was invented for it.
  const noBackground = await prisma.sensorObservation.findFirst({
    where: { siteId: kurla.id, evaluation: { reason: { contains: 'No background' } } }, include: { deviceReading: true },
  });
  assert.ok(noBackground.deviceReading.pm10 > 0);
  assert.equal(noBackground.backgroundValue, null);
  assert.equal(noBackground.backgroundUgm3, null);

  const offline = (await set('CONNECTIVITY_FAILURE')).body;
  assert.equal(offline.sent, 0);
  assert.match(offline.notSent, /offline/);
  assert.equal(offline.evaluationStatus, null);

  // A flatline is recognised once the device has repeated one value for the configured run length.
  await prisma.simulatorState.update({ where: { siteId: kurla.id }, data: { scenario: 'FLATLINE' } });
  const [flat] = await stack.simulator.publishSimulatedReadings({ siteIds: [kurla.id], minutes: 12, at: new Date(Date.now() - 20 * 60_000) });
  assert.equal(flat.body.accepted, 12);
  assert.equal(flat.body.evaluations.INPUT_REJECTED, 3);
  const flatlined = await prisma.anomalyEvaluation.findFirst({ where: { siteId: kurla.id, reason: { contains: 'flatlined' } } });
  assert.ok(flatlined);
  await set('NORMAL');
});

test('citizen reports the flagged site and anomaly evidence is attached automatically', async () => {
  const created = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ localityCode: stack.localityCodes[0], siteId: ctx.dusty.id, description: 'Thick dust cloud, no water sprinkling or covers on the debris.' }),
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
    form: complaintForm({ localityCode: stack.localityCodes[1], siteId: ctx.calm.id, description: 'Visible dust from uncovered sand piles near the gate.' }),
  });
  assert.equal(calm.status, 201);
  assert.equal(calm.body.complaint.hasAnomalyEvidence, false);
  assert.equal(calm.body.complaint.anomalyEvidence, null);
  assert.ok(calm.body.complaint.sensorSnapshot);
  ctx.calmComplaint = calm.body.complaint;

  const unlisted = await api('POST', '/complaints', {
    token: tokens.other,
    form: complaintForm({ localityCode: stack.localityCodes[3], description: 'Demolition work with heavy dust behind the market.', locationText: 'Lane behind the main market', latitude: 19.12, longitude: 72.91 }),
  });
  assert.equal(unlisted.status, 201);
  assert.equal(unlisted.body.complaint.site, null);
  ctx.otherComplaint = unlisted.body.complaint;
});

test('complaint validation', async () => {
  const noPhoto = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: stack.localityCodes[0], siteId: ctx.dusty.id, description: 'Dust everywhere today.' }, []) });
  assert.equal(noPhoto.status, 400);
  assert.ok(noPhoto.body.error.fields.photos);
  const notImage = await api('POST', '/complaints', {
    token: tokens.citizen,
    form: complaintForm({ localityCode: stack.localityCodes[0], siteId: ctx.dusty.id, description: 'Dust everywhere today.' }, [{ name: 'x.png', data: Buffer.from('<script>alert(1)</script>'), type: 'image/png' }]),
  });
  assert.equal(notImage.status, 400);
  const bad = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: stack.localityCodes[0], description: 'short' }) });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error.fields.description && bad.body.error.fields.locationText);
  const wrongLocality = await api('POST', '/complaints', { token: tokens.citizen, form: complaintForm({ localityCode: stack.localityCodes[2], siteId: ctx.dusty.id, description: 'Dust everywhere today.' }) });
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
  const byLocality = await api('GET', `/municipal/complaints?locality=${stack.localityCodes[3]}&status=SUBMITTED`, { token: tokens.officer });
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
  assert.equal(analytics.localities.length, stack.localityCodes.length);
  assert.ok(analytics.localities.find((l) => l.code === stack.localityCodes[0]).anomalies >= 1);
  assert.equal(analytics.complaintsByStatus.RESOLVED, 1);
});
