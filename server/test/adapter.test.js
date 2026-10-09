import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPredictRequest, checkFreshness, describeModelVersion, parsePredictResponse, relativeWindAlignment, toCanonicalUgm3,
} from '../src/services/modelAdapter.js';

// Contract as served by GET /model/info of adaptive-aqi-model (configs/config.yaml).
const modelInfo = {
  measurement: { type: 'PM10', unit: 'ug/m3', scale_id: 'PM10_instantaneous_demo', max_age_seconds: 3600, max_timestamp_skew_seconds: 60, max_future_seconds: 5 },
  features: ['background_value', 'temperature_c', 'humidity_pct', 'wind_speed_ms', 'distance_to_background_m', 'relative_wind_alignment']
    .map((name) => ({ name, source: name, transform: 'identity' })),
};
const now = new Date('2026-10-09T10:00:00Z');
const geometry = { distanceToBackgroundM: 410, siteBearingDeg: 102 };
const makePair = (overrides = {}) => ({
  data_source: 'SIMULATED', pollutant: 'PM10', averaging: 'instantaneous',
  background: { sensor_id: 'BG', value: 102.01, unit: 'µg/m³', observed_at: now.toISOString() },
  site: { sensor_id: 'S', value: 213.17, unit: 'µg/m³', observed_at: now.toISOString() },
  weather: { temperature_c: 24.31, humidity_pct: 68.49, wind_speed_ms: 1.54, wind_direction_deg: 102, wind_direction_convention: 'toward' },
  ...overrides,
});

test('builds a request matching the FastAPI PredictionRequest schema', () => {
  const built = buildPredictRequest({ pair: makePair(), geometry, modelInfo, now });
  assert.equal(built.ok, true);
  assert.deepEqual(Object.keys(built.request).sort(), ['background', 'features', 'site']);
  assert.deepEqual(built.request.background, {
    value: 102.01, timestamp: now.toISOString(), measurement_type: 'PM10', unit: 'ug/m3', scale_id: 'PM10_instantaneous_demo',
  });
  assert.deepEqual(Object.keys(built.request.features), modelInfo.features.map((f) => f.source));
  assert.equal(built.request.features.background_value, 102.01);
  assert.equal(built.request.features.distance_to_background_m, 410);
  assert.ok(Math.abs(built.request.features.relative_wind_alignment - 1) < 1e-12);
});

test('converts compatible units and rejects incompatible ones', () => {
  assert.equal(toCanonicalUgm3(0.15, 'mg/m3'), 150);
  assert.equal(toCanonicalUgm3(150, 'ug/m3'), 150);
  assert.equal(toCanonicalUgm3(150, 'AQI'), null);
  const pair = makePair();
  pair.site.unit = 'AQI';
  const built = buildPredictRequest({ pair, geometry, modelInfo, now });
  assert.equal(built.ok, false);
  assert.match(built.reason, /incompatible unit/);
});

test('rejects stale, future and mismatched timestamps before inference', () => {
  const stale = makePair();
  stale.site.observed_at = new Date(now.getTime() - 2 * 3600_000).toISOString();
  assert.match(buildPredictRequest({ pair: stale, geometry, modelInfo, now }).reason, /stale/);

  const reading = (offsetSeconds) => ({ timestamp: new Date(now.getTime() + offsetSeconds * 1000) });
  assert.equal(checkFreshness(reading(-3600), reading(-3590), modelInfo.measurement, now), null);
  assert.match(checkFreshness(reading(-3601), reading(-3601), modelInfo.measurement, now), /stale/);
  assert.match(checkFreshness(reading(10), reading(10), modelInfo.measurement, now), /future/);
  assert.match(checkFreshness(reading(-200), reading(-100), modelInfo.measurement, now), /apart/);
});

test('refuses to guess missing feature inputs', () => {
  const pair = makePair();
  delete pair.weather.humidity_pct;
  const built = buildPredictRequest({ pair, geometry, modelInfo, now });
  assert.deepEqual(built, { ok: false, reason: 'Required model input "humidity_pct" is not available' });
});

test('rejects a different pollutant or averaging period', () => {
  assert.match(buildPredictRequest({ pair: makePair({ pollutant: 'PM2.5' }), geometry, modelInfo, now }).reason, /PM2\.5/);
  assert.match(buildPredictRequest({ pair: makePair({ averaging: '24h' }), geometry, modelInfo, now }).reason, /averaging/);
  assert.equal(buildPredictRequest({ pair: makePair(), geometry, modelInfo: { reachable: false }, now }).ok, false);
});

test('wind alignment handles both direction conventions', () => {
  assert.ok(Math.abs(relativeWindAlignment(34, 'toward', 34) - 1) < 1e-12);
  assert.ok(Math.abs(relativeWindAlignment(34, 'from', 34) + 1) < 1e-12);
  assert.equal(relativeWindAlignment(34, undefined, 34), null);
});

test('only accepts well-formed model responses', () => {
  const good = {
    observed_difference: 111.16, expected_normal_difference: 8.1, calibrated_margin: 7.99, dynamic_barrier: 16.09, is_anomaly: true,
    interpretation: 'Evidence for review; not proof of a construction violation', data_source: 'SYNTHETIC_SIMULATION', synthetic_only: true,
  };
  assert.equal(parsePredictResponse(good).isAnomaly, true);
  assert.equal(parsePredictResponse({ ...good, is_anomaly: 'true' }), null);
  assert.equal(parsePredictResponse({ ...good, dynamic_barrier: null }), null);
  assert.equal(parsePredictResponse({ ...good, interpretation: 'Violation confirmed' }), null);
  assert.equal(parsePredictResponse(null), null);
});

test('model version string identifies the artifact and calibration', () => {
  assert.equal(describeModelVersion({ ready: false }), null);
  assert.equal(
    describeModelVersion({ ready: true, algorithm: 'RandomForestRegressor', artifactVersion: 1, calibratedMargin: 7.987498664852918, calibration: { method: 'residual_quantile', quantile: 0.95 } }),
    'RandomForestRegressor/artifact-v1/residual_quantile@0.95/margin=7.987499');
});
