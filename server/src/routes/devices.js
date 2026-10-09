// Device ingestion API (v1). Authenticated with a per-device bearer token, not a user session.
// Used identically by the simulator, real devices and vendor gateways.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { HttpError, forbidden, unauthorized } from '../lib/errors.js';
import { parse } from '../middleware/validate.js';
import { hashToken } from '../services/devices.js';
import { ingestBatch } from '../services/ingestion.js';

const router = Router();

const bearer = (req) => {
  const [scheme, token] = (req.get('authorization') || '').split(' ');
  return scheme === 'Bearer' && token ? token : null;
};

const limiter = rateLimit({
  windowMs: 60_000,
  limit: config.env === 'test' ? 100_000 : 120,
  standardHeaders: true,
  legacyHeaders: false,
  // Per credential, so one noisy device cannot starve the others behind the same gateway.
  keyGenerator: (req) => {
    const token = bearer(req);
    return token ? `device:${hashToken(token).slice(0, 24)}` : `ip:${req.ip}`;
  },
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests from this device. Retry after a minute.' } },
});

async function requireDevice(req, _res, next) {
  const token = bearer(req);
  if (!token) throw unauthorized('Device token required (Authorization: Bearer <token>)');
  const device = await prisma.device.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!device) throw unauthorized('Unknown device token');
  if (device.status !== 'ACTIVE') throw forbidden('This device is disabled');
  req.device = device;
  next();
}

const nullableNumber = z.number().finite().nullable().optional();
const readingSchema = z.object({
  timestamp: z.string().datetime({ offset: true, message: 'ISO 8601 timestamp with a time zone is required' }),
  interval_seconds: z.number().int().min(1).max(86_400),
  // Concentrations may be null or absent (a sensor can fail); such readings are stored and flagged, not evaluated.
  pm25: nullableNumber,
  pm10: nullableNumber,
  temperature_c: nullableNumber,
  humidity_pct: nullableNumber,
  unit: z.string().trim().min(1).max(16),
  status: z.enum(['OK', 'DEGRADED', 'FAULT']).optional(),
}).strict(); // unknown fields (for example other pollutants) are refused rather than ignored

const batchSchema = z.object({
  device_id: z.string().min(1).max(64),
  readings: z.array(readingSchema).min(1).max(config.ingest.maxBatch),
}).strict();

const singleSchema = readingSchema.extend({ device_id: z.string().min(1).max(64) }).strict();

async function handle(req, res, deviceId, readings) {
  if (deviceId !== req.device.deviceId) throw forbidden('device_id does not match the authenticated device');
  const result = await ingestBatch(req.device, readings);
  const body = {
    device_id: req.device.deviceId,
    provenance: req.device.provenance,
    batch_id: result.batchId,
    received: result.received,
    accepted: result.accepted,
    duplicates: result.duplicates,
    rejected: result.rejected,
    evaluations: result.evaluations,
  };
  // Nothing usable in the request: report it as a client error, with per-reading reasons.
  if (result.accepted === 0 && result.duplicates === 0) {
    throw new HttpError(422, 'No reading in this request could be accepted', { code: 'ALL_READINGS_REJECTED', ...body });
  }
  res.status(result.accepted > 0 ? 201 : 200).json(body);
}

router.post('/readings/batch', limiter, requireDevice, async (req, res) => {
  const input = parse(batchSchema, req.body);
  await handle(req, res, input.device_id, input.readings);
});

router.post('/readings', limiter, requireDevice, async (req, res) => {
  const { device_id: deviceId, ...reading } = parse(singleSchema, req.body);
  await handle(req, res, deviceId, [reading]);
});

export default router;
