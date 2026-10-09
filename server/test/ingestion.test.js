// Device registration and the v1 ingestion API, over HTTP.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startStack } from './helpers/stack.js';

let stack; let api; let model; let prisma; let tokens;
const real = {};
const iso = (offsetSeconds = 0) => new Date(Math.floor(Date.now() / 1000) * 1000 + offsetSeconds * 1000).toISOString();
const reading = (over = {}) => ({ timestamp: iso(), interval_seconds: 60, pm25: 58.4, pm10: 142.7, temperature_c: 30.8, humidity_pct: 76.2, unit: 'ug/m3', ...over });
const send = (token, body, path = '/v1/devices/readings/batch') => api('POST', path, { token, json: body });

before(async () => {
  stack = await startStack();
  ({ api, model, prisma, tokens } = stack);
});
after(() => stack?.close());

test('Mumbai reference data: eight simulated sites, repeatable seed', async () => {
  const check = async () => {
    const { body } = await api('GET', '/localities', { token: tokens.citizen });
    assert.equal(body.city, 'Mumbai');
    assert.deepEqual(body.localities.map((l) => l.name), ['Andheri', 'Bandra', 'Kurla', 'Powai']);
    assert.ok(body.localities.every((l) => l.city === 'Mumbai' && l.siteCount === 2));
    // Map defaults sit on Mumbai, not Delhi.
    assert.ok(Math.abs(body.mapDefault.latitude - 19.08) < 0.1 && Math.abs(body.mapDefault.longitude - 72.88) < 0.1);
    const { sites } = (await api('GET', '/sites', { token: tokens.citizen })).body;
    assert.equal(sites.length, 8);
    for (const s of sites) {
      assert.equal(s.simulated, true);
      assert.match(s.name, /Demo Site/);
      assert.equal(s.device.provenance, 'SIMULATED');
      assert.equal(s.station.simulated, true);
      assert.ok(s.latitude > 18.9 && s.latitude < 19.3 && s.longitude > 72.75 && s.longitude < 73.0, `${s.code} is in Mumbai`);
      assert.ok(s.distanceToBackgroundM >= 240 && s.distanceToBackgroundM <= 410);
    }
  };
  await check();
  stack.seed(); // running the seed again changes nothing
  await check();
  assert.equal(await prisma.device.count(), 8);
  assert.equal(await prisma.site.count(), 8);
  // Credentials are stored as hashes only.
  const device = await prisma.device.findFirst();
  assert.match(device.tokenHash, /^[0-9a-f]{64}$/);
  assert.equal(JSON.stringify(device).includes(stack.simulator.simulatedDeviceToken(device.deviceId)), false);
});

test('device registration is municipal-only and returns the token once', async () => {
  const site = stack.sites['MUM-POW-02'];
  const body = { deviceId: 'VENDOR-TEST-01', siteId: site.id, manufacturer: 'Test Instruments', model: 'TI-PM', ownerName: 'Test contractor', calibratedAt: '2026-09-01' };
  assert.equal((await api('POST', '/municipal/devices', { token: tokens.citizen, json: body })).status, 403);
  assert.equal((await api('POST', '/municipal/devices', { json: body })).status, 401);
  assert.equal((await api('POST', '/municipal/devices', { token: tokens.officer, json: { ...body, deviceId: 'x' } })).status, 400);

  const created = await api('POST', '/municipal/devices', { token: tokens.officer, json: body });
  assert.equal(created.status, 201);
  assert.match(created.body.token, /^awd_[0-9a-f]{64}$/);
  assert.equal(created.body.device.provenance, 'DEVICE');
  assert.equal(created.body.device.publishAllowed, false);
  Object.assign(real, { token: created.body.token, id: created.body.device.id, deviceId: 'VENDOR-TEST-01', siteId: site.id });

  const row = await prisma.device.findUnique({ where: { deviceId: 'VENDOR-TEST-01' } });
  assert.notEqual(row.tokenHash, real.token);
  assert.equal(JSON.stringify(row).includes(real.token), false);
  // The site's simulated stand-in is switched off so sources are not mixed.
  assert.equal((await prisma.device.findFirst({ where: { siteId: site.id, provenance: 'SIMULATED' } })).status, 'DISABLED');
  assert.equal((await api('POST', '/municipal/devices', { token: tokens.officer, json: body })).status, 400);
  const list = await api('GET', '/municipal/devices', { token: tokens.officer });
  assert.equal(list.body.devices.length, 9);
  assert.equal(JSON.stringify(list.body).includes('tokenHash'), false);
});

test('ingestion requires a valid device credential', async () => {
  const body = { device_id: real.deviceId, readings: [reading()] };
  assert.equal((await send(null, body)).status, 401);
  assert.equal((await send('awd_not-a-real-token', body)).status, 401);
  assert.equal((await send(tokens.officer, body)).status, 401); // a user session is not a device credential
  const mismatch = await send(real.token, { ...body, device_id: 'MUM-DEMO-001' });
  assert.equal(mismatch.status, 403);
  await api('PATCH', `/municipal/devices/${real.id}`, { token: tokens.officer, json: { status: 'DISABLED' } });
  assert.equal((await send(real.token, body)).status, 403);
  await api('PATCH', `/municipal/devices/${real.id}`, { token: tokens.officer, json: { status: 'ACTIVE' } });
  assert.equal(await prisma.deviceReading.count({ where: { deviceId: real.id } }), 0);
});

test('a real reading is stored raw, with PM2.5, and is not evaluated against simulated context', async () => {
  const calls = model.state.predictCalls.length;
  const sent = reading({ timestamp: iso(-30) });
  const response = await send(real.token, { device_id: real.deviceId, ...sent }, '/v1/devices/readings');
  assert.equal(response.status, 201);
  assert.deepEqual(
    { accepted: response.body.accepted, duplicates: response.body.duplicates, rejected: response.body.rejected, provenance: response.body.provenance },
    { accepted: 1, duplicates: 0, rejected: [], provenance: 'DEVICE' });
  assert.deepEqual(response.body.evaluations, { INPUT_REJECTED: 1 });

  const stored = await prisma.deviceReading.findFirst({ where: { deviceId: real.id }, include: { observation: { include: { evaluation: true } } } });
  assert.deepEqual(stored.payload, sent);
  assert.equal(stored.provenance, 'DEVICE');
  assert.equal(stored.pm25Ugm3, 58.4);
  assert.equal(stored.quality, 'VALID');
  assert.equal(stored.observation.dataSource, 'DEVICE');
  assert.equal(stored.observation.sitePm25Ugm3, 58.4);
  assert.match(stored.observation.evaluation.reason, /simulated background data.*cannot be paired with a real device/);
  assert.equal(stored.observation.evaluation.isAnomaly, null);
  assert.equal(model.state.predictCalls.length, calls);

  // Idempotent retry of the same reading.
  const retry = await send(real.token, { device_id: real.deviceId, ...sent }, '/v1/devices/readings');
  assert.equal(retry.status, 200);
  assert.deepEqual({ accepted: retry.body.accepted, duplicates: retry.body.duplicates }, { accepted: 0, duplicates: 1 });
  assert.equal(await prisma.deviceReading.count({ where: { deviceId: real.id } }), 1);
});

test('publication permission controls what citizens see', async () => {
  const forCitizen = async () => (await api('GET', '/localities/MUM-POW', { token: tokens.citizen })).body.sites.find((s) => s.code === 'MUM-POW-02');
  const forOfficer = (await api('GET', '/municipal/flagged-sites', { token: tokens.officer })).body.sites.find((s) => s.code === 'MUM-POW-02');
  assert.equal(forOfficer.latest.dataSource, 'DEVICE');
  assert.equal(forOfficer.latest.simulated, false);
  assert.equal(forOfficer.latest.site.pm25Ugm3, 58.4);
  assert.equal(forOfficer.latest.evaluation.status, 'INPUT_REJECTED');

  let site = await forCitizen();
  assert.equal(site.withheld, true);
  assert.equal(site.latest, null);
  assert.deepEqual((await api('GET', `/sites/${site.id}/history?hours=1`, { token: tokens.citizen })).body.points, []);

  await api('PATCH', `/municipal/devices/${real.id}`, { token: tokens.officer, json: { publishAllowed: true } });
  site = await forCitizen();
  assert.equal(site.withheld, false);
  assert.equal(site.latest.dataSource, 'DEVICE');
  assert.equal(site.device.provenance, 'DEVICE');
});

test('request validation: structure, pollutants, size', async () => {
  const bad = async (body, raw) => (await api('POST', '/v1/devices/readings/batch', { token: real.token, json: raw ? undefined : body, raw })).status;
  assert.equal(await bad({ device_id: real.deviceId, readings: [] }), 400);
  assert.equal(await bad({ device_id: real.deviceId, readings: [reading({ timestamp: '09/10/2026 12:00' })] }), 400);
  assert.equal(await bad({ device_id: real.deviceId, readings: [reading({ timestamp: '2026-10-09T12:00:00' })] }), 400); // no time zone
  assert.equal(await bad({ device_id: real.deviceId, readings: [reading({ interval_seconds: 0 })] }), 400);
  assert.equal(await bad({ device_id: real.deviceId, readings: [reading({ pm10: '142' })] }), 400);
  assert.equal(await bad({ device_id: real.deviceId, readings: [reading({ no2: 40 })] }), 400); // unsupported pollutant field
  assert.equal(await bad({ device_id: real.deviceId, readings: Array.from({ length: 121 }, (_, i) => reading({ timestamp: iso(-i) })) }), 400);
  assert.equal(await bad(null, '{"device_id": '), 400);
  assert.equal(await bad(null, JSON.stringify({ device_id: real.deviceId, readings: [reading()], pad: 'x'.repeat(300_000) })), 413);
  assert.equal(await prisma.deviceReading.count({ where: { deviceId: real.id } }), 1);
});

test('timestamp, unit and value problems are reported per reading', async () => {
  const response = await send(real.token, {
    device_id: real.deviceId,
    readings: [
      reading({ timestamp: iso(600) }), // device clock 10 minutes fast
      reading({ timestamp: iso(-9 * 24 * 3600) }), // older than the ingestion window
      reading({ timestamp: iso(-120), unit: 'ppm' }),
      reading({ timestamp: iso(-180), pm10: -5 }),
      reading({ timestamp: iso(-240), pm10: null }),
      reading({ timestamp: iso(-300), pm10: 0.15, pm25: 0.06, unit: 'mg/m3' }),
      reading({ timestamp: iso(-300), pm10: 0.15, pm25: 0.06, unit: 'mg/m3' }), // repeated inside the batch
    ],
  });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.rejected.map((r) => [r.index, r.code]), [[0, 'TIMESTAMP_IN_FUTURE'], [1, 'TIMESTAMP_TOO_OLD'], [2, 'UNSUPPORTED_UNIT']]);
  assert.equal(response.body.accepted, 3);
  assert.equal(response.body.duplicates, 1);

  const rows = await prisma.deviceReading.findMany({ where: { deviceId: real.id }, orderBy: { observedAt: 'desc' }, include: { observation: { include: { evaluation: true } } } });
  const negative = rows.find((r) => r.pm10 === -5);
  assert.equal(negative.quality, 'INVALID');
  assert.match(negative.qualityReason, /PM10 is negative/);
  assert.equal(negative.observation.siteUgm3, null); // an invalid value is never charted
  assert.match(negative.observation.evaluation.reason, /not usable/);
  const missing = rows.find((r) => r.pm10 === null && r.quality === 'INVALID');
  assert.match(missing.qualityReason, /PM10 missing/);
  const converted = rows.find((r) => r.unit === 'mg/m3');
  assert.equal(converted.pm10, 0.15); // as sent
  assert.equal(converted.pm10Ugm3, 150); // normalized
  assert.equal(converted.pm25Ugm3, 60);

  const allBad = await send(real.token, { device_id: real.deviceId, readings: [reading({ timestamp: iso(900) })] });
  assert.equal(allBad.status, 422);
  assert.equal(allBad.body.error.code, 'ALL_READINGS_REJECTED');
  assert.equal(allBad.body.error.rejected[0].code, 'TIMESTAMP_IN_FUTURE');

  const batches = await prisma.ingestionBatch.findMany({ where: { deviceId: real.id }, orderBy: { receivedAt: 'desc' } });
  assert.equal(batches[0].rejected, 1);
  assert.equal(batches[0].rejections[0].code, 'TIMESTAMP_IN_FUTURE');
});

test('the simulator uploads a 15-minute batch through the same API, and retries are idempotent', async () => {
  const site = stack.sites['MUM-AND-01'];
  const at = new Date(Date.now() - 20 * 60_000);
  const calls = model.state.predictCalls.length;
  const [first] = await stack.simulator.publishSimulatedReadings({ siteIds: [site.id], minutes: 15, at });
  assert.equal(first.status, 201);
  assert.equal(first.body.provenance, 'SIMULATED');
  assert.deepEqual({ accepted: first.body.accepted, duplicates: first.body.duplicates, rejected: first.body.rejected.length }, { accepted: 15, duplicates: 0, rejected: 0 });
  assert.deepEqual(first.body.evaluations, { EVALUATED: 15 });
  assert.equal(model.state.predictCalls.length, calls + 15);

  const [again] = await stack.simulator.publishSimulatedReadings({ siteIds: [site.id], minutes: 15, at });
  assert.equal(again.status, 200);
  assert.deepEqual({ accepted: again.body.accepted, duplicates: again.body.duplicates }, { accepted: 0, duplicates: 15 });
  assert.equal(model.state.predictCalls.length, calls + 15);

  const readings = await prisma.deviceReading.findMany({ where: { siteId: site.id }, orderBy: { observedAt: 'asc' }, include: { observation: { include: { evaluation: true } } } });
  assert.equal(readings.length, 15);
  assert.equal((readings[14].observedAt - readings[0].observedAt) / 60_000, 14); // one-minute cadence
  for (const r of readings) {
    assert.equal(r.intervalSeconds, 60);
    assert.equal(r.provenance, 'SIMULATED');
    assert.ok(r.pm25Ugm3 > 0 && r.pm25Ugm3 < r.pm10Ugm3);
    const e = r.observation.evaluation;
    assert.equal(e.status, 'EVALUATED');
    assert.ok(Math.abs(e.observedDifference - (r.pm10Ugm3 - r.observation.backgroundUgm3)) < 1e-6);
    assert.equal(e.scaleId, 'PM10_instantaneous_demo');
    // PM2.5 is stored and displayed, but the PM10 model never sees it.
    assert.deepEqual(Object.keys(e.features).sort(), ['background_value', 'distance_to_background_m', 'humidity_pct', 'relative_wind_alignment', 'temperature_c', 'wind_speed_ms']);
    assert.equal(e.features.temperature_c, r.temperatureC);
    assert.equal(r.observation.pairing.background.provenance, 'SIMULATED');
  }
  for (const call of model.state.predictCalls.slice(calls)) assert.equal(JSON.stringify(call).includes('pm25'), false);
});

test('simulated telemetry is deterministic for a given seed', async () => {
  const site = stack.sites['MUM-BAN-01'];
  const at = new Date('2026-10-09T06:30:00Z');
  const one = stack.simulator.simulateReading({ site, localityCode: 'MUM-BAN', at });
  assert.deepEqual(one, stack.simulator.simulateReading({ site, localityCode: 'MUM-BAN', at }));
  assert.deepEqual(Object.keys(one), ['timestamp', 'interval_seconds', 'pm25', 'pm10', 'temperature_c', 'humidity_pct', 'unit', 'status']);
  const dust = stack.simulator.simulateReading({ site, localityCode: 'MUM-BAN', at, scenario: 'DUST_EVENT' });
  assert.ok(dust.pm10 - one.pm10 >= 70);
  assert.equal(stack.simulator.simulateReading({ site, localityCode: 'MUM-BAN', at, scenario: 'CONNECTIVITY_FAILURE' }), null);
});

test('a longer averaging period is stored but not sent to the instantaneous model', async () => {
  const site = stack.sites['MUM-BAN-02'];
  const deviceId = site.devices[0].deviceId;
  const calls = model.state.predictCalls.length;
  const response = await send(stack.simulator.simulatedDeviceToken(deviceId), { device_id: deviceId, readings: [reading({ timestamp: iso(-60), interval_seconds: 900 })] });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.evaluations, { INPUT_REJECTED: 1 });
  const evaluation = await prisma.anomalyEvaluation.findFirst({ where: { siteId: site.id }, orderBy: { evaluatedAt: 'desc' } });
  assert.match(evaluation.reason, /averaging period \(60 s\) is not comparable with the site reading \(900 s\)/);
  assert.equal(model.state.predictCalls.length, calls);
});

test('model failures keep the reading and record the right status', async () => {
  const site = stack.sites['MUM-KUR-02'];
  const deviceId = site.devices[0].deviceId;
  const token = stack.simulator.simulatedDeviceToken(deviceId);
  const post = (offset) => send(token, { device_id: deviceId, readings: [stack.simulator.simulateReading({ site, localityCode: 'MUM-KUR', at: new Date(Date.now() - offset * 60_000) })] });

  model.state.ready = false;
  await stack.resetModelCache();
  assert.deepEqual((await post(5)).body.evaluations, { MODEL_UNAVAILABLE: 1 });
  model.state.ready = true;
  model.state.failNext = 500;
  await stack.resetModelCache();
  assert.deepEqual((await post(4)).body.evaluations, { MODEL_ERROR: 1 });
  model.state.failNext = 'malformed';
  assert.deepEqual((await post(3)).body.evaluations, { MODEL_ERROR: 1 });
  assert.deepEqual((await post(2)).body.evaluations, { EVALUATED: 1 });
  assert.equal(await prisma.deviceReading.count({ where: { siteId: site.id } }), 4);
  const unevaluated = await prisma.anomalyEvaluation.findMany({ where: { siteId: site.id, status: { not: 'EVALUATED' } } });
  assert.ok(unevaluated.every((e) => e.isAnomaly === null && e.dynamicBarrier === null));
});

test('system status states the model scope and the simulated sources', async () => {
  const { body } = await api('GET', '/system/status', { token: tokens.citizen });
  assert.equal(body.city, 'Mumbai');
  assert.match(body.model.limitations, /synthetic Delhi data/);
  assert.match(body.model.scope, /does not forecast AQI/);
  assert.equal(body.sensors.background.provenance, 'SIMULATED');
  assert.deepEqual(body.sensors.devices, { simulated: 7, real: 1 });
  assert.equal(body.sensors.simulated, false);
});
