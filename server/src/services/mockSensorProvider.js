// SIMULATED sensor source. Produces plausible paired PM10 readings and weather
// for each site so the rest of the pipeline can be exercised end to end.
// Nothing here is a real measurement; every payload carries data_source = SIMULATED.
//
// The generator is independent of the ML model: it never calls it and does not
// know its barrier. Coefficients below are a rough description of the public
// synthetic demo dataset's baseline behaviour, not model internals.
import { prisma } from '../db.js';

export const DATA_SOURCE = 'SIMULATED';
export const SCENARIOS = Object.freeze({
  NORMAL: 'Typical site activity',
  DUST_EVENT: 'Injected construction dust episode',
  STALE_SENSOR: 'Site sensor stops reporting (last reading 2 h old)',
  INCOMPATIBLE_UNIT: 'Site sensor reports an AQI index instead of a concentration',
});

const BACKGROUND_MEAN = { 'DEL-ROH': 102, 'DEL-DWK': 91, 'DEL-OKH': 116, 'DEL-ANV': 131 };
const TICK_MS = 30_000;

// Small deterministic PRNG so repeated reads within one tick agree.
function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i += 1) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

const gaussian = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
const round2 = (v) => Math.round(v * 100) / 100;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function simulate(site, localityCode, scenario, now) {
  const tick = Math.floor(now.getTime() / TICK_MS);
  const hourSlot = Math.floor(now.getTime() / 3_600_000);
  const localHour = ((now.getUTCHours() + now.getUTCMinutes() / 60 + 5.5) % 24 + 24) % 24;
  const daily = Math.cos(((localHour - 15) / 24) * 2 * Math.PI); // +1 mid-afternoon, -1 before dawn

  // Locality-level conditions drift hourly; per-tick jitter is small.
  const area = rng(`${localityCode}|${hourSlot}`);
  const jitter = rng(`${localityCode}|${tick}`);
  const temperature = clamp(22 + 5 * daily + 2 * gaussian(area) + 0.2 * gaussian(jitter), 5, 38);
  const humidity = clamp(58 - 14 * daily + 8 * gaussian(area) + 0.5 * gaussian(jitter), 17, 96);
  const windSpeed = clamp(2 + 1.1 * daily + 0.8 * gaussian(area) + 0.1 * gaussian(jitter), 0.1, 6.5);
  const windToward = (area() * 360 + 4 * gaussian(jitter) + 360) % 360;
  const background = clamp(
    (BACKGROUND_MEAN[localityCode] ?? 100) * (1 - 0.13 * daily) + 18 * gaussian(area) + 1.5 * gaussian(jitter), 25, 260);

  const local = rng(`${site.code}|${tick}`);
  const alignment = Math.cos(((windToward - site.siteBearingDeg) * Math.PI) / 180);
  let difference = 9 + 0.05 * background + 0.07 * temperature - 0.013 * humidity - 0.85 * windSpeed
    + 3.5 * alignment + 4.5 * gaussian(local);
  if (scenario === 'DUST_EVENT') difference += 60 + 50 * local();

  const observedAt = now.toISOString();
  const reading = (sensorId, value) => ({ sensor_id: sensorId, value: round2(value), unit: 'µg/m³', observed_at: observedAt });
  const pair = {
    data_source: DATA_SOURCE,
    simulated: true,
    scenario,
    pollutant: 'PM10',
    averaging: 'instantaneous',
    background: reading(`BG-${localityCode}`, background),
    site: reading(`SITE-${site.code}`, background + difference),
    weather: {
      temperature_c: round2(temperature),
      humidity_pct: round2(humidity),
      wind_speed_ms: round2(windSpeed),
      wind_direction_deg: round2(windToward),
      wind_direction_convention: 'toward',
      observed_at: observedAt,
    },
  };
  if (scenario === 'STALE_SENSOR') pair.site.observed_at = new Date(now.getTime() - 2 * 3_600_000).toISOString();
  if (scenario === 'INCOMPATIBLE_UNIT') pair.site.unit = 'AQI';
  return pair;
}

export const mockSensorProvider = {
  name: 'mock',
  dataSource: DATA_SOURCE,
  /** @param {{id: string, code: string, siteBearingDeg: number, locality: {code: string}}} site */
  async getPairedReading(site, now = new Date()) {
    const state = await prisma.simulatorState.findUnique({ where: { siteId: site.id } });
    const scenario = state && SCENARIOS[state.scenario] ? state.scenario : 'NORMAL';
    return simulate(site, site.locality.code, scenario, now);
  },
};
