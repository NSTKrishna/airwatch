// SIMULATED device telemetry.
//
// This module plays the part of a field PM monitor: it produces readings in the
// same normalized contract a real device uses (PM2.5, PM10, temperature, humidity,
// timestamp, sampling interval, status) and publishes them over HTTP to the public
// ingestion API with a device credential. It does not write to the database and
// does not produce background or wind data.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { clamp, environmentAt, floorToMinute, gaussian, rng, round2, siteDifferenceAt } from './simulatedEnvironment.js';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export const SIMULATED_MANUFACTURER = 'AirWatch simulator';

// Device-side scenarios change what the simulated monitor sends (or whether it sends at all).
// Context-side scenarios interrupt the simulated background or wind feed for that site.
export const SCENARIOS = Object.freeze({
  NORMAL: 'Normal conditions',
  DUST_EVENT: 'Construction dust event',
  FLATLINE: 'Flatlined sensor (repeats one value)',
  STALE_READINGS: 'Stale readings (timestamps 2 hours old)',
  INVALID_VALUES: 'Invalid measurements (sensor fault)',
  CONNECTIVITY_FAILURE: 'Connectivity failure (nothing is sent)',
  BACKGROUND_OUTAGE: 'Background station feed unavailable',
  WEATHER_OUTAGE: 'Wind feed unavailable',
});

/** Credential of a simulated device. Derived, so it is never stored in plaintext anywhere. */
export function simulatedDeviceToken(deviceId) {
  if (!config.simulator.tokenSecret) throw new Error('SIMULATOR_TOKEN_SECRET is not set');
  return `awd_${crypto.createHmac('sha256', config.simulator.tokenSecret).update(deviceId).digest('hex')}`;
}

/**
 * One normalized reading for a simulated device at a given minute. Pure and deterministic.
 * @returns {object|null} null when the scenario means the device sends nothing.
 */
export function simulateReading({ site, localityCode, scenario = 'NORMAL', at, onDemand = false }) {
  if (scenario === 'CONNECTIVITY_FAILURE') return null;
  const minute = floorToMinute(at);
  // Scheduled samples fall on the minute. An on-demand sample ("read now") carries the moment it was taken.
  const stamp = onDemand ? at : minute;
  // A flatlined sensor keeps reporting whatever it measured at the start of the day.
  const sampleAt = scenario === 'FLATLINE' ? new Date(Math.floor(minute.getTime() / (24 * HOUR_MS)) * 24 * HOUR_MS) : minute;
  const env = environmentAt(localityCode, sampleAt);
  const noise = rng(`device|${site.code}|${sampleAt.getTime()}`);

  let pm10 = env.background + siteDifferenceAt(site, localityCode, sampleAt);
  if (scenario === 'DUST_EVENT') {
    const episode = rng(`dust|${site.code}|${Math.floor(minute.getTime() / HOUR_MS)}`);
    pm10 += 70 + 40 * episode();
  }
  const pm25 = pm10 * clamp(0.46 + 0.04 * gaussian(noise), 0.3, 0.7);

  const reading = {
    timestamp: stamp.toISOString(),
    interval_seconds: 60,
    pm25: round2(pm25),
    pm10: round2(pm10),
    temperature_c: round2(env.temperature + 0.2 * gaussian(noise)),
    humidity_pct: round2(clamp(env.humidity + 0.8 * gaussian(noise), 0, 100)),
    unit: 'ug/m3',
    status: 'OK',
  };
  if (scenario === 'STALE_READINGS') reading.timestamp = new Date(stamp.getTime() - 2 * HOUR_MS).toISOString();
  if (scenario === 'INVALID_VALUES') Object.assign(reading, { pm10: -1, pm25: null, status: 'FAULT' });
  return reading;
}

let ingestBaseUrl = config.simulator.ingestUrl;
/** Where the simulator posts. Set once the API knows its own address. */
export function setIngestBaseUrl(url) {
  ingestBaseUrl = url.replace(/\/+$/, '');
}

/**
 * Publish the last `minutes` one-minute readings for each simulated device, as one batch per device.
 * Re-sending minutes that were already delivered is harmless: ingestion is idempotent.
 * `onDemand` adds one extra sample taken right now (an operator pressing "read now").
 */
export async function publishSimulatedReadings({ at = new Date(), minutes = 1, siteIds, onDemand = false } = {}) {
  if (!ingestBaseUrl) throw new Error('Simulator has no ingestion URL (set SIMULATOR_INGEST_URL)');
  const devices = await prisma.device.findMany({
    where: { provenance: 'SIMULATED', status: 'ACTIVE', site: { active: true, ...(siteIds ? { id: { in: siteIds } } : {}) } },
    include: { site: { include: { locality: true, simulator: true } } },
    orderBy: { deviceId: 'asc' },
  });
  const end = floorToMinute(at).getTime();
  const results = [];
  for (const device of devices) {
    const scenario = SCENARIOS[device.site.simulator?.scenario] ? device.site.simulator.scenario : 'NORMAL';
    const readings = [];
    for (let i = minutes - 1; i >= 0; i -= 1) {
      const reading = simulateReading({ site: device.site, localityCode: device.site.locality.code, scenario, at: new Date(end - i * MINUTE_MS) });
      if (reading) readings.push(reading);
    }
    if (onDemand) {
      const extra = simulateReading({ site: device.site, localityCode: device.site.locality.code, scenario, at, onDemand: true });
      if (extra && !readings.some((r) => r.timestamp === extra.timestamp)) readings.push(extra);
    }
    if (readings.length === 0) {
      results.push({ deviceId: device.deviceId, siteId: device.siteId, sent: 0, skipped: 'device offline (simulated connectivity failure)' });
      continue;
    }
    try {
      const response = await fetch(`${ingestBaseUrl}/api/v1/devices/readings/batch`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${simulatedDeviceToken(device.deviceId)}` },
        body: JSON.stringify({ device_id: device.deviceId, readings }),
        signal: AbortSignal.timeout(30_000),
      });
      results.push({ deviceId: device.deviceId, siteId: device.siteId, sent: readings.length, status: response.status, body: await response.json().catch(() => null) });
    } catch (error) {
      results.push({ deviceId: device.deviceId, siteId: device.siteId, sent: readings.length, error: error.message });
    }
  }
  return results;
}

/** Periodic publisher. With SIMULATOR_BATCH_MINUTES > 1 readings are held and sent as a batch. */
export function startSimulator() {
  const { intervalSeconds, batchMinutes } = config.simulator;
  const tick = async () => {
    const now = new Date();
    if (batchMinutes > 1 && now.getUTCMinutes() % batchMinutes !== 0) return;
    try {
      const results = await publishSimulatedReadings({ at: now, minutes: batchMinutes });
      const failed = results.filter((r) => r.error || (r.status && r.status >= 400));
      if (failed.length) console.warn(`[simulator] ${failed.length}/${results.length} device uploads failed:`, failed[0].error || failed[0].body?.error?.message);
    } catch (error) {
      console.error('[simulator] publish failed:', error.message);
    }
  };
  tick();
  const timer = setInterval(tick, intervalSeconds * 1000);
  return () => clearInterval(timer);
}
