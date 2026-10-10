// Read-only monitoring data shared by both dashboards.
import { Router } from 'express';
import { z } from 'zod';
import { CITY } from '../data/mumbai.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { parse } from '../middleware/validate.js';
import { systemStatus } from '../services/status.js';
import { siteHistory, sitesWithLatest, stationView } from '../services/views.js';

const router = Router();

// Citizens only see readings from devices cleared for publication.
const audience = (req) => ({ publicOnly: req.user.role !== 'MUNICIPAL' });

router.get('/system/status', async (_req, res) => res.json(await systemStatus()));

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
  res.json(await siteHistory(site, hours));
});

export default router;
