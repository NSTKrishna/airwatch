// Runs against the REAL FastAPI model service (MODEL_API_URL). Skipped while the
// trained artifact is not loaded. Replays the repository's published example
// request and compares the answer with reports/delhi_pm10/api_smoke.json, so a
// pass means the served artifact behaves like the one that was evaluated.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import 'dotenv/config';

const base = (process.env.MODEL_API_URL || 'http://127.0.0.1:8001').replace(/\/+$/, '');
const reports = new URL('../../adaptive-aqi-model/reports/delhi_pm10/', import.meta.url);

async function modelInfo() {
  try {
    return await (await fetch(`${base}/model/info`, { signal: AbortSignal.timeout(3000) })).json();
  } catch {
    return null;
  }
}

test('real model reproduces its published smoke-test response', async (t) => {
  const info = await modelInfo();
  if (!info?.ready) return t.skip(`model not ready at ${base}: ${info?.reason || 'service unreachable'}`);

  const smoke = JSON.parse(readFileSync(new URL('api_smoke.json', reports)));
  const request = JSON.parse(readFileSync(new URL('example_request.json', reports)));
  const now = new Date().toISOString();
  request.background.timestamp = now;
  request.site.timestamp = now;

  const response = await fetch(`${base}/predict`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
  assert.equal(response.status, 200);
  const body = await response.json();
  const expected = smoke.incident_response;
  for (const key of ['observed_difference', 'expected_normal_difference', 'calibrated_margin', 'dynamic_barrier']) {
    assert.ok(Math.abs(body[key] - expected[key]) < 1e-6, `${key}: got ${body[key]}, published ${expected[key]}`);
  }
  assert.equal(body.is_anomaly, expected.is_anomaly);
  assert.equal(info.calibrated_margin, smoke.model_info.calibrated_margin);
});

test('real model request built by the AirWatch adapter is accepted', async (t) => {
  const info = await modelInfo();
  if (!info?.ready) return t.skip('model not ready');
  const { buildPredictRequest, parsePredictResponse } = await import('../src/services/modelAdapter.js');
  const now = new Date();
  const built = buildPredictRequest({
    now,
    modelInfo: { measurement: info.configuration.measurement, features: info.configuration.features },
    geometry: { distanceToBackgroundM: 410, siteBearingDeg: 102 },
    pair: {
      pollutant: 'PM10', averaging: 'instantaneous',
      background: { value: 93.14, unit: 'µg/m³', observed_at: now.toISOString() },
      site: { value: 112.35, unit: 'µg/m³', observed_at: now.toISOString() },
      weather: { temperature_c: 24, humidity_pct: 60, wind_speed_ms: 2, wind_direction_deg: 190, wind_direction_convention: 'toward' },
    },
  });
  assert.equal(built.ok, true);
  const response = await fetch(`${base}/predict`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(built.request) });
  assert.equal(response.status, 200);
  assert.ok(parsePredictResponse(await response.json()));
});
