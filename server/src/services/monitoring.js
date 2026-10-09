// Monitoring pipeline: sensor provider -> adapter checks -> FastAPI /predict -> PostgreSQL.
import { config } from '../config.js';
import { prisma } from '../db.js';
import { buildPredictRequest, toCanonicalUgm3 } from './modelAdapter.js';
import { getModelInfo, predict } from './modelClient.js';
import { mockSensorProvider } from './mockSensorProvider.js';
import { replaySensorProvider } from './replaySensorProvider.js';

const providers = { mock: mockSensorProvider, replay: replaySensorProvider };
export const sensorProvider = providers[config.sensorProvider];

const siteInclude = { locality: true };

async function storeObservation(site, pair, receivedAt) {
  const weather = pair.weather || {};
  return prisma.sensorObservation.create({
    data: {
      siteId: site.id,
      receivedAt,
      dataSource: pair.data_source,
      pollutant: pair.pollutant,
      averaging: pair.averaging,
      backgroundSensorId: pair.background.sensor_id,
      backgroundValue: pair.background.value,
      backgroundUnit: pair.background.unit,
      backgroundTimestamp: new Date(pair.background.observed_at),
      siteSensorId: pair.site.sensor_id,
      siteValue: pair.site.value,
      siteUnit: pair.site.unit,
      siteTimestamp: new Date(pair.site.observed_at),
      backgroundUgm3: toCanonicalUgm3(pair.background.value, pair.background.unit),
      siteUgm3: toCanonicalUgm3(pair.site.value, pair.site.unit),
      temperatureC: weather.temperature_c ?? null,
      humidityPct: weather.humidity_pct ?? null,
      windSpeedMs: weather.wind_speed_ms ?? null,
      windDirectionDeg: weather.wind_direction_deg ?? null,
      windConvention: weather.wind_direction_convention ?? null,
    },
  });
}

/**
 * Read one site's sensors, run inference if (and only if) inputs are valid, and persist the outcome.
 *
 * `at` backfills a past hour from a replayable provider. The reading for that hour is sent to the
 * real model relabelled with the current time (the model only accepts fresh timestamps, and its
 * prediction does not depend on the clock), and the result is stored against the historical hour.
 */
export async function evaluateSite(site, { at } = {}) {
  const when = at ?? new Date();
  const pair = await sensorProvider.getPairedReading(site, when, { ignoreScenario: Boolean(at) });
  const observation = await storeObservation(site, pair, at);
  const modelInfo = await getModelInfo();

  const base = { observationId: observation.id, siteId: site.id, evaluatedAt: at };
  const modelIdentity = {
    modelVersion: modelInfo.version,
    modelAlgorithm: modelInfo.algorithm ?? null,
    modelDataSource: modelInfo.dataSource ?? null,
    modelSyntheticOnly: modelInfo.syntheticOnly ?? null,
  };

  if (!modelInfo.reachable || !modelInfo.measurement) {
    return prisma.anomalyEvaluation.create({
      data: { ...base, status: 'MODEL_UNAVAILABLE', reason: modelInfo.reason || 'Model service is unreachable' },
    });
  }

  const built = buildPredictRequest({ pair, geometry: site, modelInfo, now: when });
  if (!built.ok) {
    return prisma.anomalyEvaluation.create({ data: { ...base, status: 'INPUT_REJECTED', reason: built.reason } });
  }

  const sent = {
    backgroundValue: built.background.value,
    siteValue: built.site.value,
    unit: built.background.unit,
    measurementType: built.background.measurement_type,
    scaleId: built.background.scale_id,
    backgroundTimestamp: built.background.timestamp,
    siteTimestamp: built.site.timestamp,
    features: built.features,
  };

  if (!modelInfo.ready) {
    return prisma.anomalyEvaluation.create({
      data: { ...base, ...sent, status: 'MODEL_UNAVAILABLE', reason: modelInfo.reason || 'Model is not ready' },
    });
  }

  if (at) {
    const sentAt = new Date().toISOString();
    built.request.background.timestamp = sentAt;
    built.request.site.timestamp = sentAt;
  }
  const outcome = await predict(built.request);
  if (outcome.kind !== 'ok') {
    const status = { unavailable: 'MODEL_UNAVAILABLE', rejected: 'INPUT_REJECTED', error: 'MODEL_ERROR' }[outcome.kind];
    return prisma.anomalyEvaluation.create({ data: { ...base, ...sent, status, reason: outcome.reason } });
  }

  const r = outcome.result;
  return prisma.anomalyEvaluation.create({
    data: {
      ...base,
      ...sent,
      ...modelIdentity,
      status: 'EVALUATED',
      observedDifference: r.observedDifference,
      expectedNormalDifference: r.expectedNormalDifference,
      calibratedMargin: r.calibratedMargin,
      dynamicBarrier: r.dynamicBarrier,
      isAnomaly: r.isAnomaly,
      interpretation: r.interpretation,
      modelDataSource: r.dataSource ?? modelIdentity.modelDataSource,
      modelSyntheticOnly: r.syntheticOnly ?? modelIdentity.modelSyntheticOnly,
    },
  });
}

let sweepInFlight = null;

/** Evaluate every site once. Concurrent callers share the in-flight sweep. */
export function runMonitoringSweep() {
  if (!sweepInFlight) {
    sweepInFlight = (async () => {
      const sites = await prisma.site.findMany({ include: siteInclude });
      const counts = {};
      for (const site of sites) {
        try {
          const evaluation = await evaluateSite(site);
          counts[evaluation.status] = (counts[evaluation.status] || 0) + 1;
        } catch (error) {
          counts.FAILED = (counts.FAILED || 0) + 1;
          console.error(`[monitor] ${site.code} failed:`, error.message);
        }
      }
      return { sites: sites.length, counts, finishedAt: new Date().toISOString() };
    })().finally(() => {
      sweepInFlight = null;
    });
  }
  return sweepInFlight;
}

export async function evaluateSiteById(siteId) {
  const site = await prisma.site.findUnique({ where: { id: siteId }, include: siteInclude });
  return site ? evaluateSite(site) : null;
}

export function startMonitoringScheduler() {
  if (config.monitorIntervalSeconds <= 0) return () => {};
  const tick = () => runMonitoringSweep().catch((error) => console.error('[monitor] sweep failed:', error.message));
  tick();
  const timer = setInterval(tick, config.monitorIntervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}

/** A verdict is "active" only while it is recent; old flags must not linger on dashboards. */
export function isActiveAnomaly(evaluation, now = new Date()) {
  return Boolean(
    evaluation && evaluation.status === 'EVALUATED' && evaluation.isAnomaly === true
    && now.getTime() - new Date(evaluation.evaluatedAt).getTime() <= config.activeAnomalyWindowSeconds * 1000);
}
