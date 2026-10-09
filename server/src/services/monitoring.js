// Monitoring pipeline: stored device reading -> background + weather context ->
// pairing checks -> model adapter -> FastAPI /predict -> PostgreSQL.
import { config } from '../config.js';
import { prisma } from '../db.js';
import { buildPredictRequest, toCanonicalUgm3 } from './modelAdapter.js';
import { getModelInfo, predict } from './modelClient.js';
import { domainWarnings } from './modelDomain.js';
import { pairReading } from './pairing.js';
import { backgroundProvider, weatherProvider } from './providers/index.js';

// Two readings that share a station can ask for the same observation at once.
async function upsertOnce(model, where, create) {
  try {
    return await model.upsert({ where, create, update: {} });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    return model.findUniqueOrThrow({ where });
  }
}

async function fetchBackground(station, at, ctx) {
  const reading = await backgroundProvider.getObservation(station, at, ctx);
  if (!reading) return null;
  const observedAt = new Date(reading.observed_at);
  const pm10Ugm3 = toCanonicalUgm3(reading.pm10, reading.unit);
  const data = {
    pm10: reading.pm10, unit: reading.unit, pm10Ugm3, provenance: reading.provenance, source: reading.source, instrument: reading.instrument ?? null,
  };
  const row = await upsertOnce(prisma.backgroundObservation,
    { stationId_observedAt_intervalSeconds: { stationId: station.id, observedAt, intervalSeconds: reading.interval_seconds } },
    { stationId: station.id, observedAt, intervalSeconds: reading.interval_seconds, ...data });
  return { ...reading, pm10Ugm3, id: row.id };
}

async function fetchWeather(station, at, ctx) {
  const reading = await weatherProvider.getObservation(station, at, ctx);
  if (!reading) return null;
  const observedAt = new Date(reading.observed_at);
  const row = await upsertOnce(prisma.weatherObservation, { stationId_observedAt: { stationId: station.id, observedAt } }, {
    stationId: station.id, observedAt, windSpeedMs: reading.wind_speed_ms ?? null, windDirectionDeg: reading.wind_direction_deg ?? null,
    windConvention: reading.wind_direction_convention ?? null, provenance: reading.provenance, source: reading.source,
  });
  return { ...reading, id: row.id };
}

/** True when this reading and the ones before it all carry the same PM values. */
async function isFlatlined(reading) {
  const count = config.pairing.flatlineReadings;
  if (reading.pm10Ugm3 == null) return false;
  const recent = await prisma.deviceReading.findMany({
    where: { deviceId: reading.deviceId, observedAt: { lte: reading.observedAt } },
    orderBy: { observedAt: 'desc' },
    take: count,
    select: { pm10Ugm3: true, pm25Ugm3: true },
  });
  return recent.length === count && recent.every((r) => r.pm10Ugm3 === reading.pm10Ugm3 && r.pm25Ugm3 === reading.pm25Ugm3);
}

/**
 * Evaluate one stored device reading. Always records what happened; produces a verdict only
 * when every required input is present, compatible and fresh, and the model actually answers.
 *
 * `relabelForHistory` is for the demo history loader only: the model accepts only fresh
 * timestamps, so a past reading is sent with the current time (its prediction does not depend
 * on the clock) and the result is stored against the hour it describes.
 */
export async function evaluateReading(readingId, { relabelForHistory = false } = {}) {
  const reading = await prisma.deviceReading.findUnique({
    where: { id: readingId },
    include: { device: true, site: { include: { locality: true, station: { include: { locality: true } }, simulator: true } } },
  });
  if (!reading) throw new Error(`Device reading ${readingId} not found`);
  const { site } = reading;
  // Simulator scenarios may interrupt the simulated context feeds; they have no effect on real sources.
  const ctx = { scenario: reading.provenance === 'SIMULATED' ? site.simulator?.scenario : undefined };

  const [background, weather, flatlined] = await Promise.all([
    fetchBackground(site.station, reading.observedAt, ctx),
    fetchWeather(site.station, reading.observedAt, ctx),
    isFlatlined(reading),
  ]);
  const paired = pairReading({ reading, flatlined, site, background, weather, policy: config.pairing });

  const historical = relabelForHistory ? reading.observedAt : undefined;
  const observation = await prisma.sensorObservation.create({
    data: {
      siteId: site.id,
      receivedAt: historical,
      dataSource: reading.provenance,
      pollutant: 'PM10',
      averaging: paired.pairing.site.averaging,
      intervalSeconds: reading.intervalSeconds,
      deviceReadingId: reading.id,
      siteSensorId: reading.device.deviceId,
      siteValue: reading.pm10,
      siteUnit: reading.unit,
      siteTimestamp: reading.observedAt,
      siteUgm3: reading.quality === 'VALID' ? reading.pm10Ugm3 : null,
      sitePm25Ugm3: reading.quality === 'VALID' ? reading.pm25Ugm3 : null,
      temperatureC: reading.temperatureC,
      humidityPct: reading.humidityPct,
      backgroundObservationId: background?.id ?? null,
      backgroundSensorId: background ? site.station.code : null,
      backgroundValue: background?.pm10 ?? null,
      backgroundUnit: background?.unit ?? null,
      backgroundTimestamp: background ? new Date(background.observed_at) : null,
      backgroundUgm3: background?.pm10Ugm3 ?? null,
      backgroundSource: background?.source ?? null,
      weatherObservationId: weather?.id ?? null,
      weatherSource: weather?.source ?? null,
      windSpeedMs: weather?.wind_speed_ms ?? null,
      windDirectionDeg: weather?.wind_direction_deg ?? null,
      windConvention: weather?.wind_direction_convention ?? null,
      pairing: paired.pairing,
    },
  });

  const base = { observationId: observation.id, siteId: site.id, evaluatedAt: historical };
  const store = (data) => prisma.anomalyEvaluation.create({ data: { ...base, ...data } });

  if (!paired.ok) return store({ status: 'INPUT_REJECTED', reason: paired.reason });

  const modelInfo = await getModelInfo();
  if (!modelInfo.reachable || !modelInfo.measurement) {
    return store({ status: 'MODEL_UNAVAILABLE', reason: modelInfo.reason || 'Model service is unreachable' });
  }

  const built = buildPredictRequest({ pair: paired.pair, geometry: site, modelInfo, now: historical ?? new Date() });
  if (!built.ok) return store({ status: 'INPUT_REJECTED', reason: built.reason });

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
  if (!modelInfo.ready) return store({ ...sent, status: 'MODEL_UNAVAILABLE', reason: modelInfo.reason || 'Model is not ready' });

  if (historical) {
    const sentAt = new Date().toISOString();
    built.request.background.timestamp = sentAt;
    built.request.site.timestamp = sentAt;
  }
  const outcome = await predict(built.request);
  if (outcome.kind !== 'ok') {
    const status = { unavailable: 'MODEL_UNAVAILABLE', rejected: 'INPUT_REJECTED', error: 'MODEL_ERROR' }[outcome.kind];
    return store({ ...sent, status, reason: outcome.reason });
  }

  const r = outcome.result;
  const warnings = domainWarnings(built.features);
  return store({
    ...sent,
    status: 'EVALUATED',
    observedDifference: r.observedDifference,
    expectedNormalDifference: r.expectedNormalDifference,
    calibratedMargin: r.calibratedMargin,
    dynamicBarrier: r.dynamicBarrier,
    isAnomaly: r.isAnomaly,
    interpretation: r.interpretation,
    modelVersion: modelInfo.version,
    modelAlgorithm: modelInfo.algorithm ?? null,
    modelDataSource: r.dataSource ?? modelInfo.dataSource ?? null,
    modelSyntheticOnly: r.syntheticOnly ?? modelInfo.syntheticOnly ?? null,
    domainWarnings: warnings.length ? warnings : undefined,
  });
}

/** A verdict is "active" only while it is recent; old flags must not linger on dashboards. */
export function isActiveAnomaly(evaluation, now = new Date()) {
  return Boolean(
    evaluation && evaluation.status === 'EVALUATED' && evaluation.isAnomaly === true
    && now.getTime() - new Date(evaluation.evaluatedAt).getTime() <= config.activeAnomalyWindowSeconds * 1000);
}

export const sourcesSummary = () => ({
  background: { provider: backgroundProvider.name, provenance: backgroundProvider.provenance, description: backgroundProvider.description },
  weather: { provider: weatherProvider.name, provenance: weatherProvider.provenance, description: weatherProvider.description },
});
