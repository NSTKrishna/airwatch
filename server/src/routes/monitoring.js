// Read-only monitoring data shared by both dashboards.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { CITY } from '../data/mumbai.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../middleware/validate.js';
import { getModelInfo } from '../services/modelClient.js';
import { TRAINED_DOMAIN } from '../services/modelDomain.js';
import { sourcesSummary } from '../services/monitoring.js';
import { sitesWithLatest, stationView } from '../services/views.js';

const router = Router();

// Citizens only see readings from devices cleared for publication.
const audience = (req) => ({ publicOnly: req.user.role !== 'MUNICIPAL' });

router.get('/system/status', async (_req, res) => {
  const info = await getModelInfo();
  const deviceCounts = await prisma.device.groupBy({ by: ['provenance'], where: { status: 'ACTIVE', site: { active: true } }, _count: { _all: true } });
  const devices = Object.fromEntries(deviceCounts.map((d) => [d.provenance, d._count._all]));
  res.json({
    city: CITY.name,
    model: {
      reachable: info.reachable,
      ready: info.ready,
      reason: info.reason,
      version: info.version,
      algorithm: info.algorithm ?? null,
      dataSource: info.dataSource ?? null,
      syntheticOnly: info.syntheticOnly ?? null,
      calibratedMargin: info.calibratedMargin ?? null,
      measurement: info.measurement ?? null,
      // Facts about the deployed artifact that every consumer of a verdict should know.
      scope: 'Estimates the normal current PM10 site-minus-background difference. It does not forecast AQI, assess PM2.5, or detect tampering.',
      limitations: 'Trained on synthetic Delhi data. It has not been validated for Mumbai or against real instruments.',
      trainedDomain: TRAINED_DOMAIN,
    },
    sensors: {
      devices: { simulated: devices.SIMULATED || 0, real: devices.DEVICE || 0 },
      // True while no authenticated physical monitor is registered.
      simulated: !devices.DEVICE,
      ...sourcesSummary(),
    },
    simulator: { enabled: config.simulator.enabled, intervalSeconds: config.simulator.intervalSeconds, batchMinutes: config.simulator.batchMinutes },
    activeAnomalyWindowSeconds: config.activeAnomalyWindowSeconds,
  });
});

router.get('/localities', async (req, res) => {
  const [localities, sites] = await Promise.all([
    prisma.locality.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    sitesWithLatest({}, audience(req)),
  ]);
  res.json({
    city: CITY.name,
    mapDefault: { latitude: CITY.latitude, longitude: CITY.longitude, zoom: CITY.zoom },
    localities: localities.map((l) => {
      const own = sites.filter((s) => s.locality.code === l.code);
      return {
        code: l.code, name: l.name, city: l.city, latitude: l.latitude, longitude: l.longitude,
        siteCount: own.length,
        activeAnomalies: own.filter((s) => s.latest?.evaluation?.active).length,
      };
    }),
  });
});

router.get('/localities/:code', async (req, res) => {
  const locality = await prisma.locality.findFirst({ where: { code: req.params.code, active: true }, include: { stations: { where: { active: true } } } });
  if (!locality) throw notFound('Locality not found');
  res.json({
    locality: { code: locality.code, name: locality.name, city: locality.city, latitude: locality.latitude, longitude: locality.longitude },
    stations: locality.stations.map(stationView),
    sites: await sitesWithLatest({ localityId: locality.id }, audience(req)),
  });
});

router.get('/sites', async (req, res) => {
  res.json({ sites: await sitesWithLatest({}, audience(req)) });
});

const historyQuery = z.object({ hours: z.coerce.number().int().min(1).max(72).default(6) });

router.get('/sites/:id/history', async (req, res) => {
  const { hours } = parse(historyQuery, req.query);
  const [site] = await sitesWithLatest({ id: req.params.id }, audience(req));
  if (!site) throw notFound('Site not found');
  const bucketMinutes = hours <= 3 ? 1 : hours <= 12 ? 5 : hours <= 24 ? 15 : 60;
  // Columns are UTC "timestamp without time zone"; compare against a UTC literal so the
  // database session time zone cannot shift the window.
  const sinceUtc = new Date(Date.now() - hours * 3_600_000).toISOString();
  const points = site.withheld ? [] : await prisma.$queryRaw`
    SELECT date_bin(${`${bucketMinutes} minutes`}::interval, o."siteTimestamp", TIMESTAMP '2000-01-01') AS t,
           avg(o."backgroundUgm3")::float8 AS background,
           avg(o."siteUgm3")::float8 AS site,
           avg(o."sitePm25Ugm3")::float8 AS pm25,
           avg(e."observedDifference")::float8 AS difference,
           avg(e."dynamicBarrier")::float8 AS barrier,
           count(*) FILTER (WHERE e."isAnomaly")::int AS anomalies,
           count(*) FILTER (WHERE e.status = 'EVALUATED')::int AS evaluated,
           count(*)::int AS readings
    FROM "SensorObservation" o
    LEFT JOIN "AnomalyEvaluation" e ON e."observationId" = o.id
    WHERE o."siteId" = ${site.id} AND o."siteTimestamp" >= ${sinceUtc}::timestamp
    GROUP BY 1 ORDER BY 1`;
  res.json({
    siteId: site.id, hours, bucketMinutes, unit: 'ug/m3',
    // Completeness: how many readings each bucket would hold at the device's sampling interval.
    expectedReadingsPerBucket: site.device ? Math.round((bucketMinutes * 60) / site.device.samplingIntervalSeconds) : null,
    simulated: site.device?.provenance !== 'DEVICE',
    points,
  });
});

export default router;
