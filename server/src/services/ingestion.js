// Normalized ingestion for device telemetry. The simulator, real devices and any
// future vendor adapter all enter the system through ingestBatch().
import { config } from '../config.js';
import { prisma } from '../db.js';
import { toCanonicalUgm3 } from './modelAdapter.js';
import { evaluateReading } from './monitoring.js';

const MAX_PLAUSIBLE_UGM3 = 5000;
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/** Measurement-level quality. A reading that fails here is still stored, flagged INVALID. */
export function assessQuality(r, pm10Ugm3, pm25Ugm3) {
  const problems = [];
  const concentration = (label, raw, value) => {
    if (raw == null) problems.push(`${label} missing`);
    else if (value < 0) problems.push(`${label} is negative`);
    else if (value > MAX_PLAUSIBLE_UGM3) problems.push(`${label} is implausibly high`);
  };
  concentration('PM10', r.pm10, pm10Ugm3);
  concentration('PM2.5', r.pm25, pm25Ugm3);
  if (finite(pm10Ugm3) && finite(pm25Ugm3) && pm10Ugm3 >= 0 && pm25Ugm3 > pm10Ugm3 * 1.05 + 1) problems.push('PM2.5 exceeds PM10');
  if (r.temperature_c != null && (r.temperature_c < -40 || r.temperature_c > 70)) problems.push('temperature out of range');
  if (r.humidity_pct != null && (r.humidity_pct < 0 || r.humidity_pct > 100)) problems.push('humidity out of range');
  if (r.status === 'FAULT') problems.push('device reported a fault');
  return problems.length ? { quality: 'INVALID', qualityReason: problems.join('; ') } : { quality: 'VALID', qualityReason: null };
}

/**
 * @param {object} device  Device row (authenticated).
 * @param {Array<object>} readings  Schema-validated normalized readings.
 * @returns {Promise<{received: number, accepted: number, duplicates: number, rejected: Array<object>, evaluations: Record<string, number>}>}
 */
export async function ingestBatch(device, readings, { now = new Date() } = {}) {
  const rejected = [];
  const candidates = [];
  const seen = new Set();
  let duplicates = 0;

  readings.forEach((r, index) => {
    const observedAt = new Date(r.timestamp);
    const refuse = (code, message) => rejected.push({ index, timestamp: r.timestamp, code, message });
    if (observedAt.getTime() - now.getTime() > config.ingest.maxFutureMs) {
      return refuse('TIMESTAMP_IN_FUTURE', `Timestamp is more than ${config.ingest.maxFutureMs / 1000} s ahead of server time; check the device clock`);
    }
    if (now.getTime() - observedAt.getTime() > config.ingest.maxAgeMs) {
      return refuse('TIMESTAMP_TOO_OLD', `Readings older than ${config.ingest.maxAgeMs / 3_600_000} hours are not accepted`);
    }
    const factorProbe = toCanonicalUgm3(1, r.unit);
    if (factorProbe === null) return refuse('UNSUPPORTED_UNIT', `Unit "${r.unit}" is not supported; send ug/m3 or mg/m3`);
    const key = `${observedAt.getTime()}|${r.interval_seconds}`;
    if (seen.has(key)) {
      duplicates += 1;
      return undefined;
    }
    seen.add(key);
    const pm10Ugm3 = r.pm10 == null ? null : toCanonicalUgm3(r.pm10, r.unit);
    const pm25Ugm3 = r.pm25 == null ? null : toCanonicalUgm3(r.pm25, r.unit);
    candidates.push({
      observedAt,
      row: {
        deviceId: device.id,
        siteId: device.siteId,
        observedAt,
        intervalSeconds: r.interval_seconds,
        pm25: r.pm25 ?? null,
        pm10: r.pm10 ?? null,
        temperatureC: r.temperature_c ?? null,
        humidityPct: r.humidity_pct ?? null,
        unit: r.unit,
        pm25Ugm3,
        pm10Ugm3,
        reportedStatus: r.status ?? null,
        provenance: device.provenance,
        ...assessQuality(r, pm10Ugm3, pm25Ugm3),
        payload: r,
      },
    });
    return undefined;
  });

  // Idempotent retries: anything already stored for (device, timestamp, interval) is a duplicate.
  const existing = candidates.length
    ? await prisma.deviceReading.findMany({
      where: { deviceId: device.id, observedAt: { in: candidates.map((c) => c.observedAt) } },
      select: { observedAt: true, intervalSeconds: true },
    })
    : [];
  const stored = new Set(existing.map((e) => `${e.observedAt.getTime()}|${e.intervalSeconds}`));
  const fresh = candidates.filter((c) => !stored.has(`${c.observedAt.getTime()}|${c.row.intervalSeconds}`));
  duplicates += candidates.length - fresh.length;

  const batch = await prisma.ingestionBatch.create({
    data: {
      deviceId: device.id, received: readings.length, accepted: 0, duplicates, rejected: rejected.length,
      rejections: rejected.length ? rejected : undefined,
    },
  });

  const created = [];
  for (const candidate of fresh.sort((a, b) => a.observedAt - b.observedAt)) {
    try {
      created.push(await prisma.deviceReading.create({ data: { ...candidate.row, batchId: batch.id } }));
    } catch (error) {
      if (error.code !== 'P2002') throw error; // a concurrent retry stored it first
      duplicates += 1;
    }
  }

  const lastStatus = readings.at(-1)?.status ?? null;
  await prisma.$transaction([
    prisma.ingestionBatch.update({ where: { id: batch.id }, data: { accepted: created.length, duplicates } }),
    prisma.device.update({ where: { id: device.id }, data: { lastSeenAt: now, lastReportedStatus: lastStatus } }),
  ]);

  // Raw readings are safely stored at this point; evaluation is a separate step.
  const evaluations = {};
  for (const reading of created) {
    try {
      const evaluation = await evaluateReading(reading.id);
      evaluations[evaluation.status] = (evaluations[evaluation.status] || 0) + 1;
    } catch (error) {
      evaluations.FAILED = (evaluations.FAILED || 0) + 1;
      console.error(`[ingest] evaluation failed for reading ${reading.id}:`, error.message);
    }
  }
  return { batchId: batch.id, received: readings.length, accepted: created.length, duplicates, rejected, evaluations };
}
