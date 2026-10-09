// Adapter between sensor-provider payloads and the FastAPI /predict contract.
//
// The request/response shapes mirror adaptive-aqi-model/api/schemas.py. The
// measurement contract (type, unit, scale_id, freshness limits) and the list of
// required feature sources are read from GET /model/info at runtime, so nothing
// about the trained artifact is hard-coded here.

export const CANONICAL_UNIT = 'ug/m3';

// Multipliers into ug/m3. Anything not listed is treated as incompatible.
const UNIT_FACTORS = new Map([
  ['ug/m3', 1], ['ug/m³', 1], ['µg/m3', 1], ['µg/m³', 1], ['μg/m3', 1], ['μg/m³', 1],
  ['mg/m3', 1000], ['mg/m³', 1000],
]);

// Sensor (pollutant, averaging period) -> model scale identifier.
const SCALE_IDS = new Map([['PM10|instantaneous', 'PM10_instantaneous_demo']]);

const EXPECTED_INTERPRETATION = 'Evidence for review; not proof of a construction violation';

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function toCanonicalUgm3(value, unit) {
  const factor = UNIT_FACTORS.get(String(unit ?? '').trim());
  if (factor === undefined || !isFiniteNumber(value)) return null;
  return value * factor;
}

/** cos(angle between the direction the wind flows toward and the station -> site bearing). */
export function relativeWindAlignment(windDirectionDeg, convention, siteBearingDeg) {
  if (!isFiniteNumber(windDirectionDeg) || !isFiniteNumber(siteBearingDeg)) return null;
  let toward;
  if (convention === 'toward') toward = windDirectionDeg;
  else if (convention === 'from') toward = windDirectionDeg + 180;
  else return null;
  return Math.cos(((toward - siteBearingDeg) * Math.PI) / 180);
}

function normaliseReading(label, raw, pollutant, averaging, contract) {
  const value = toCanonicalUgm3(raw.value, raw.unit);
  if (value === null) return { reason: `${label} sensor reports an incompatible unit "${raw.unit}"` };
  if (contract.unit !== CANONICAL_UNIT) return { reason: `Model expects unit "${contract.unit}", which this adapter cannot supply` };
  if (pollutant !== contract.type) return { reason: `${label} sensor measures ${pollutant}; model expects ${contract.type}` };
  const scaleId = SCALE_IDS.get(`${pollutant}|${averaging}`);
  if (!scaleId || scaleId !== contract.scale_id) {
    return { reason: `${label} sensor averaging "${averaging}" does not match the model scale "${contract.scale_id}"` };
  }
  const timestamp = new Date(raw.observed_at);
  if (Number.isNaN(timestamp.getTime())) return { reason: `${label} sensor timestamp is invalid` };
  return { reading: { value, timestamp, measurement_type: contract.type, unit: contract.unit, scale_id: contract.scale_id } };
}

/** Mirrors PredictionEngine.validate_readings so stale data is rejected before any model call. */
export function checkFreshness(background, site, contract, now = new Date()) {
  for (const [label, reading] of [['Background', background], ['Site', site]]) {
    const ageSeconds = (now.getTime() - reading.timestamp.getTime()) / 1000;
    if (ageSeconds > contract.max_age_seconds) {
      return `${label} reading is stale (${Math.round(ageSeconds / 60)} min old; limit ${Math.round(contract.max_age_seconds / 60)} min)`;
    }
    if (ageSeconds < -contract.max_future_seconds) return `${label} reading timestamp is in the future`;
  }
  const skewSeconds = Math.abs(site.timestamp.getTime() - background.timestamp.getTime()) / 1000;
  if (skewSeconds > contract.max_timestamp_skew_seconds) {
    return `Background and site readings are ${Math.round(skewSeconds)} s apart (limit ${contract.max_timestamp_skew_seconds} s)`;
  }
  return null;
}

/**
 * Build a /predict request body.
 * @returns {{ok: true, request: object, background: object, site: object, features: object} | {ok: false, reason: string}}
 */
export function buildPredictRequest({ pair, geometry, modelInfo, now = new Date() }) {
  const contract = modelInfo?.measurement;
  const featureSpecs = modelInfo?.features;
  if (!contract || !Array.isArray(featureSpecs) || featureSpecs.length === 0) {
    return { ok: false, reason: 'Model measurement contract is unknown' };
  }

  const bg = normaliseReading('Background', pair.background, pair.pollutant, pair.averaging, contract);
  if (bg.reason) return { ok: false, reason: bg.reason };
  const site = normaliseReading('Site', pair.site, pair.pollutant, pair.averaging, contract);
  if (site.reason) return { ok: false, reason: site.reason };

  const stale = checkFreshness(bg.reading, site.reading, contract, now);
  if (stale) return { ok: false, reason: stale };

  const weather = pair.weather || {};
  const available = {
    background_value: bg.reading.value,
    temperature_c: weather.temperature_c,
    humidity_pct: weather.humidity_pct,
    wind_speed_ms: weather.wind_speed_ms,
    distance_to_background_m: geometry.distanceToBackgroundM,
    relative_wind_alignment: relativeWindAlignment(
      weather.wind_direction_deg, weather.wind_direction_convention, geometry.siteBearingDeg),
  };

  // No imputation: a feature the model needs but the sensors did not supply
  // blocks inference instead of being guessed.
  const features = {};
  for (const spec of featureSpecs) {
    const value = available[spec.source];
    if (!isFiniteNumber(value)) return { ok: false, reason: `Required model input "${spec.source}" is not available` };
    features[spec.source] = value;
  }

  const wire = (r) => ({ ...r, timestamp: r.timestamp.toISOString() });
  return {
    ok: true,
    background: bg.reading,
    site: site.reading,
    features,
    request: { background: wire(bg.reading), site: wire(site.reading), features },
  };
}

/** Validate a /predict response before anything is stored. Returns null when malformed. */
export function parsePredictResponse(body) {
  if (!body || typeof body !== 'object') return null;
  const numbers = ['observed_difference', 'expected_normal_difference', 'calibrated_margin', 'dynamic_barrier'];
  if (!numbers.every((k) => isFiniteNumber(body[k]))) return null;
  if (typeof body.is_anomaly !== 'boolean') return null;
  if (body.interpretation !== EXPECTED_INTERPRETATION) return null;
  return {
    observedDifference: body.observed_difference,
    expectedNormalDifference: body.expected_normal_difference,
    calibratedMargin: body.calibrated_margin,
    dynamicBarrier: body.dynamic_barrier,
    isAnomaly: body.is_anomaly,
    interpretation: body.interpretation,
    dataSource: typeof body.data_source === 'string' ? body.data_source : null,
    syntheticOnly: typeof body.synthetic_only === 'boolean' ? body.synthetic_only : null,
  };
}

/** Human-readable identity of the served model + calibration, from /model/info. */
export function describeModelVersion(info) {
  if (!info?.ready) return null;
  const cal = info.calibration || {};
  const margin = isFiniteNumber(info.calibratedMargin) ? info.calibratedMargin.toFixed(6) : 'unknown';
  return `${info.algorithm ?? 'unknown'}/artifact-v${info.artifactVersion ?? '?'}/${cal.method ?? '?'}@${cal.quantile ?? '?'}/margin=${margin}`;
}
