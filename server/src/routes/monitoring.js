// Read-only monitoring data shared by both dashboards.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../middleware/validate.js';
import { getModelInfo } from '../services/modelClient.js';
import { sensorProvider } from '../services/monitoring.js';
import { sitesWithLatest } from '../services/views.js';

const router = Router();

router.get('/system/status', async (_req, res) => {
  const info = await getModelInfo();
  res.json({
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
    },
    sensors: { provider: sensorProvider.name, dataSource: sensorProvider.dataSource, simulated: sensorProvider.dataSource === 'SIMULATED' },
    monitorIntervalSeconds: config.monitorIntervalSeconds,
    activeAnomalyWindowSeconds: config.activeAnomalyWindowSeconds,
  });
});

router.get('/localities', async (_req, res) => {
  const [localities, sites] = await Promise.all([
    prisma.locality.findMany({ orderBy: { name: 'asc' } }),
    sitesWithLatest(),
  ]);
  res.json({
    localities: localities.map((l) => {
      const own = sites.filter((s) => s.locality.code === l.code);
      return {
        code: l.code, name: l.name, latitude: l.latitude, longitude: l.longitude,
        siteCount: own.length,
        activeAnomalies: own.filter((s) => s.latest?.evaluation?.active).length,
      };
    }),
  });
});

router.get('/localities/:code', async (req, res) => {
  const locality = await prisma.locality.findUnique({ where: { code: req.params.code }, include: { stations: true } });
  if (!locality) throw notFound('Locality not found');
  res.json({
    locality: { code: locality.code, name: locality.name, latitude: locality.latitude, longitude: locality.longitude },
    stations: locality.stations.map((s) => ({ code: s.code, name: s.name, latitude: s.latitude, longitude: s.longitude })),
    sites: await sitesWithLatest({ localityId: locality.id }),
  });
});

router.get('/sites', async (_req, res) => {
  res.json({ sites: await sitesWithLatest() });
});

const historyQuery = z.object({ hours: z.coerce.number().int().min(1).max(72).default(6) });

router.get('/sites/:id/history', async (req, res) => {
  const { hours } = parse(historyQuery, req.query);
  const site = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!site) throw notFound('Site not found');
  const bucketMinutes = hours <= 3 ? 1 : hours <= 12 ? 5 : hours <= 24 ? 15 : 60;
  // Columns are UTC "timestamp without time zone"; compare against a UTC literal so the
  // database session time zone cannot shift the window.
  const sinceUtc = new Date(Date.now() - hours * 3_600_000).toISOString();
  const points = await prisma.$queryRaw`
    SELECT date_bin(${`${bucketMinutes} minutes`}::interval, o."receivedAt", TIMESTAMP '2000-01-01') AS t,
           avg(o."backgroundUgm3")::float8 AS background,
           avg(o."siteUgm3")::float8 AS site,
           avg(e."observedDifference")::float8 AS difference,
           avg(e."dynamicBarrier")::float8 AS barrier,
           count(*) FILTER (WHERE e."isAnomaly")::int AS anomalies,
           count(*) FILTER (WHERE e.status = 'EVALUATED')::int AS evaluated
    FROM "SensorObservation" o
    LEFT JOIN "AnomalyEvaluation" e ON e."observationId" = o.id
    WHERE o."siteId" = ${site.id} AND o."receivedAt" >= ${sinceUtc}::timestamp
    GROUP BY 1 ORDER BY 1`;
  res.json({ siteId: site.id, hours, bucketMinutes, unit: 'ug/m3', simulated: sensorProvider.dataSource === 'SIMULATED', points });
});

export default router;
