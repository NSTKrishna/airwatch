// Pairing and enrichment: decide whether one site reading, a background
// observation and a weather observation are compatible enough to be sent to the
// PM10 model together. Pure functions; no I/O.
//
// When anything required is missing or incompatible the answer is a reason, not
// a substitute value.
const seconds = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 1000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** "instantaneous" for short samples, otherwise a label the model adapter will refuse. */
export function averagingClass(intervalSeconds, policy) {
  return intervalSeconds <= policy.instantMaxIntervalSeconds ? 'instantaneous' : `${intervalSeconds}s-average`;
}

/**
 * @param {object} input
 * @param {{pm10Ugm3: number|null, temperatureC: number|null, humidityPct: number|null, observedAt: Date, intervalSeconds: number,
 *   provenance: string, quality: string, qualityReason: string|null}} input.reading
 * @param {boolean} input.flatlined
 * @param {{distanceToBackgroundM: number, siteBearingDeg: number}} input.site
 * @param {object|null} input.background  BackgroundReading with canonical `pm10Ugm3`
 * @param {object|null} input.weather     WeatherReading
 * @param {{instantMaxIntervalSeconds: number, maxDistanceM: number, weatherMaxSkewSeconds: number, flatlineReadings: number}} input.policy
 * @returns {{ok: true, pair: object, pairing: object} | {ok: false, reason: string, pairing: object}}
 */
export function pairReading({ reading, flatlined, site, background, weather, policy }) {
  const averaging = averagingClass(reading.intervalSeconds, policy);
  const pairing = {
    site: { provenance: reading.provenance, interval_seconds: reading.intervalSeconds, averaging },
    station: { distance_m: site.distanceToBackgroundM, bearing_deg: site.siteBearingDeg },
    background: background ? {
      provenance: background.provenance, source: background.source, observed_at: background.observed_at,
      interval_seconds: background.interval_seconds, instrument: background.instrument ?? null,
      offset_seconds: seconds(background.observed_at, reading.observedAt),
    } : null,
    weather: weather ? {
      provenance: weather.provenance, source: weather.source, observed_at: weather.observed_at,
      offset_seconds: seconds(weather.observed_at, reading.observedAt),
    } : null,
  };
  const reject = (reason) => ({ ok: false, reason, pairing });

  if (reading.quality !== 'VALID' || !finite(reading.pm10Ugm3)) {
    return reject(`Sensor reading is not usable: ${reading.qualityReason || 'PM10 value missing'}`);
  }
  if (flatlined) {
    return reject(`Sensor appears flatlined: the last ${policy.flatlineReadings} readings are identical`);
  }
  if (!finite(site.distanceToBackgroundM) || !finite(site.siteBearingDeg)) {
    return reject('Station-to-site distance and bearing are not recorded for this site');
  }
  if (site.distanceToBackgroundM > policy.maxDistanceM) {
    return reject(`Background station is ${Math.round(site.distanceToBackgroundM)} m from the site (limit ${policy.maxDistanceM} m)`);
  }

  if (!background) return reject('No background PM10 observation is available for this time');
  if (!finite(background.pm10Ugm3)) return reject(`Background station reports an incompatible unit "${background.unit}"`);
  // Synthetic context must never be combined with a real measurement.
  if (reading.provenance !== 'SIMULATED' && background.provenance === 'SIMULATED') {
    return reject('Only simulated background data is available, which cannot be paired with a real device reading');
  }
  const backgroundAveraging = averagingClass(background.interval_seconds, policy);
  if (backgroundAveraging !== averaging) {
    return reject(`Background averaging period (${background.interval_seconds} s) is not comparable with the site reading (${reading.intervalSeconds} s)`);
  }

  if (!weather || !finite(weather.wind_speed_ms) || !finite(weather.wind_direction_deg)) {
    return reject('Wind speed and direction are not available for this time');
  }
  if (reading.provenance !== 'SIMULATED' && weather.provenance === 'SIMULATED') {
    return reject('Only simulated wind data is available, which cannot be paired with a real device reading');
  }
  if (pairing.weather.offset_seconds > policy.weatherMaxSkewSeconds) {
    return reject(`Wind observation is ${Math.round(pairing.weather.offset_seconds / 60)} min away from the site reading (limit ${Math.round(policy.weatherMaxSkewSeconds / 60)} min)`);
  }

  return {
    ok: true,
    pairing,
    // Shape consumed by modelAdapter.buildPredictRequest. Background/site timestamp skew and
    // freshness are checked there against the model's own contract.
    pair: {
      pollutant: 'PM10',
      averaging,
      background: { value: background.pm10Ugm3, unit: 'ug/m3', observed_at: background.observed_at },
      site: { value: reading.pm10Ugm3, unit: 'ug/m3', observed_at: new Date(reading.observedAt).toISOString() },
      weather: {
        temperature_c: reading.temperatureC,
        humidity_pct: reading.humidityPct,
        wind_speed_ms: weather.wind_speed_ms,
        wind_direction_deg: weather.wind_direction_deg,
        wind_direction_convention: weather.wind_direction_convention,
      },
    },
  };
}
