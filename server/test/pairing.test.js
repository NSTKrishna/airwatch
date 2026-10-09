import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPredictRequest } from '../src/services/modelAdapter.js';
import { domainWarnings } from '../src/services/modelDomain.js';
import { pairReading } from '../src/services/pairing.js';

const now = new Date('2026-10-09T10:00:30Z');
const at = '2026-10-09T10:00:00.000Z';
const policy = { instantMaxIntervalSeconds: 60, maxDistanceM: 2000, weatherMaxSkewSeconds: 600, flatlineReadings: 10 };
const modelInfo = {
  measurement: { type: 'PM10', unit: 'ug/m3', scale_id: 'PM10_instantaneous_demo', max_age_seconds: 3600, max_timestamp_skew_seconds: 60, max_future_seconds: 5 },
  features: ['background_value', 'temperature_c', 'humidity_pct', 'wind_speed_ms', 'distance_to_background_m', 'relative_wind_alignment']
    .map((name) => ({ name, source: name, transform: 'identity' })),
};
const site = { distanceToBackgroundM: 300, siteBearingDeg: 40 };
const make = (over = {}) => ({
  flatlined: false,
  site,
  policy,
  reading: { pm10Ugm3: 142.7, temperatureC: 30.8, humidityPct: 76.2, observedAt: new Date(at), intervalSeconds: 60, provenance: 'SIMULATED', quality: 'VALID', qualityReason: null },
  background: { pm10: 110, pm10Ugm3: 110, unit: 'ug/m3', interval_seconds: 60, observed_at: at, provenance: 'SIMULATED', source: 'simulated-background' },
  weather: { wind_speed_ms: 2.1, wind_direction_deg: 40, wind_direction_convention: 'toward', observed_at: at, provenance: 'SIMULATED', source: 'simulated-weather' },
  ...over,
});
const evaluate = (input) => {
  const paired = pairReading(input);
  return paired.ok ? buildPredictRequest({ pair: paired.pair, geometry: site, modelInfo, now }) : paired;
};

test('a compatible reading, background and wind produce a valid model request', () => {
  const paired = pairReading(make());
  assert.equal(paired.ok, true);
  assert.equal(paired.pairing.background.offset_seconds, 0);
  const built = buildPredictRequest({ pair: paired.pair, geometry: site, modelInfo, now });
  assert.equal(built.ok, true);
  assert.equal(built.request.site.value, 142.7);
  assert.equal(built.request.background.scale_id, 'PM10_instantaneous_demo');
  // Temperature and humidity come from the device; wind from the weather source.
  assert.deepEqual(built.request.features, {
    background_value: 110, temperature_c: 30.8, humidity_pct: 76.2, wind_speed_ms: 2.1, distance_to_background_m: 300, relative_wind_alignment: 1,
  });
  assert.equal('pm25' in built.request.features, false);
});

test('missing background or wind is a reason, never a substituted value', () => {
  assert.match(pairReading(make({ background: null })).reason, /No background PM10 observation/);
  assert.match(pairReading(make({ weather: null })).reason, /Wind speed and direction are not available/);
  const noDirection = make();
  noDirection.weather.wind_direction_deg = null;
  assert.match(pairReading(noDirection).reason, /Wind speed and direction/);
  const noHumidity = make();
  noHumidity.reading.humidityPct = null;
  assert.equal(evaluate(noHumidity).reason, 'Required model input "humidity_pct" is not available');
});

test('stale or misaligned background readings are refused', () => {
  const late = make();
  late.background.observed_at = '2026-10-09T09:57:00.000Z'; // 3 minutes before the site reading
  assert.match(evaluate(late).reason, /180 s apart/);
  const old = make();
  old.reading.observedAt = new Date('2026-10-09T07:00:00Z');
  old.background.observed_at = '2026-10-09T07:00:00.000Z';
  old.weather.observed_at = '2026-10-09T07:00:00.000Z';
  assert.match(evaluate(old).reason, /stale/);
  const windLate = make();
  windLate.weather.observed_at = '2026-10-09T09:40:00.000Z';
  assert.match(pairReading(windLate).reason, /Wind observation is 20 min away/);
});

test('averaging periods must match the instantaneous model contract', () => {
  const hourlyBackground = make();
  hourlyBackground.background.interval_seconds = 3600;
  assert.match(pairReading(hourlyBackground).reason, /Background averaging period \(3600 s\) is not comparable/);
  // Both hourly: comparable with each other, but not what the model was trained on.
  const bothHourly = make();
  bothHourly.reading.intervalSeconds = 3600;
  bothHourly.background.interval_seconds = 3600;
  const result = evaluate(bothHourly);
  assert.equal(result.ok, false);
  assert.match(result.reason, /averaging "3600s-average" does not match the model scale "PM10_instantaneous_demo"/);
});

test('simulated context is never paired with a real device reading', () => {
  const real = make();
  real.reading.provenance = 'DEVICE';
  assert.match(pairReading(real).reason, /simulated background data.*cannot be paired with a real device/);
  real.background.provenance = 'REFERENCE';
  assert.match(pairReading(real).reason, /simulated wind data.*cannot be paired with a real device/);
  real.weather.provenance = 'REFERENCE';
  assert.equal(pairReading(real).ok, true);
});

test('unusable sensors and geometry are refused', () => {
  const invalid = make();
  Object.assign(invalid.reading, { quality: 'INVALID', qualityReason: 'PM10 is negative', pm10Ugm3: -1 });
  assert.match(pairReading(invalid).reason, /not usable: PM10 is negative/);
  assert.match(pairReading(make({ flatlined: true })).reason, /flatlined/);
  assert.match(pairReading(make({ site: { distanceToBackgroundM: 6000, siteBearingDeg: 40 } })).reason, /6000 m from the site/);
  assert.match(pairReading(make({ site: { distanceToBackgroundM: null, siteBearingDeg: 40 } })).reason, /distance and bearing/);
  const ppm = make();
  Object.assign(ppm.background, { unit: 'ppm', pm10Ugm3: null });
  assert.match(pairReading(ppm).reason, /incompatible unit "ppm"/);
});

test('inputs outside the trained range are named', () => {
  assert.deepEqual(domainWarnings({ background_value: 110, humidity_pct: 80, distance_to_background_m: 300 }), []);
  assert.deepEqual(domainWarnings({ background_value: 300, distance_to_background_m: 900 }).map((w) => w.feature), ['background_value', 'distance_to_background_m']);
});
