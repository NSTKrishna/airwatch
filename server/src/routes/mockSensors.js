// Stand-in for an external sensor API. Everything served here is SIMULATED.
import { Router } from 'express';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { sensorProvider } from '../services/monitoring.js';

const router = Router();

router.get('/sites/:code/latest', async (req, res) => {
  const site = await prisma.site.findUnique({ where: { code: req.params.code }, include: { locality: true } });
  if (!site) throw notFound('Unknown site');
  res.json(await sensorProvider.getPairedReading(site));
});

export default router;
