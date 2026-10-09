// Citizen complaint endpoints. A citizen can only ever see their own complaints.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { imageUpload, toAttachmentRows } from '../lib/uploads.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { captureSiteEvidence } from '../services/complaints.js';
import { complaintCitizenView, complaintDetailInclude } from '../services/views.js';

const router = Router();

const optionalNumber = (min, max) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(min).max(max).optional());

const createSchema = z.object({
  localityCode: z.string().trim().min(1, 'Choose a locality'),
  siteId: z.preprocess((v) => (v === '' ? undefined : v), z.string().optional()),
  description: z.string().trim().min(10, 'Describe what you saw in at least 10 characters').max(2000),
  locationText: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional()),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
}).superRefine((v, ctx) => {
  if ((v.latitude === undefined) !== (v.longitude === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Provide both latitude and longitude' });
  }
  if (!v.siteId && v.latitude === undefined && !v.locationText) {
    ctx.addIssue({ code: 'custom', path: ['locationText'], message: 'Choose a site, share your location, or describe where this is' });
  }
});

router.post('/', requireRole('CITIZEN'), imageUpload(4).array('photos', 4), async (req, res) => {
  const input = parse(createSchema, req.body);
  if (!req.files?.length) throw badRequest('Some fields are invalid', { fields: { photos: 'Attach at least one photograph' } });

  const locality = await prisma.locality.findUnique({ where: { code: input.localityCode } });
  if (!locality) throw badRequest('Some fields are invalid', { fields: { localityCode: 'Unknown locality' } });
  let site = null;
  if (input.siteId) {
    site = await prisma.site.findFirst({ where: { id: input.siteId, localityId: locality.id } });
    if (!site) throw badRequest('Some fields are invalid', { fields: { siteId: 'This site is not in the selected locality' } });
  }

  // Evidence is attached when it exists; its absence never blocks a report.
  const evidence = await captureSiteEvidence(site?.id);
  const complaint = await prisma.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        citizenId: req.user.id,
        localityId: locality.id,
        siteId: site?.id ?? null,
        description: input.description,
        locationText: input.locationText ?? null,
        latitude: input.latitude ?? site?.latitude ?? null,
        longitude: input.longitude ?? site?.longitude ?? null,
        anomalyEvaluationId: evidence.anomalyEvaluationId,
        sensorSnapshot: evidence.sensorSnapshot ?? undefined,
      },
    });
    await tx.attachment.createMany({
      data: toAttachmentRows(req.files, { complaintId: created.id, uploadedById: req.user.id, kind: 'CITIZEN_PHOTO' }),
    });
    await tx.complaintEvent.create({
      data: {
        complaintId: created.id, actorId: req.user.id, type: 'SUBMITTED', toStatus: 'SUBMITTED',
        metadata: { anomalyEvidenceAttached: Boolean(evidence.anomalyEvaluationId), photos: req.files.length },
      },
    });
    return created;
  });

  const full = await prisma.complaint.findUnique({ where: { id: complaint.id }, include: complaintDetailInclude });
  res.status(201).json({ complaint: complaintCitizenView(full, { detail: true }) });
});

router.get('/', requireRole('CITIZEN'), async (req, res) => {
  const complaints = await prisma.complaint.findMany({
    where: { citizenId: req.user.id },
    include: { locality: true, site: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ complaints: complaints.map((c) => complaintCitizenView(c)) });
});

router.get('/:id', requireRole('CITIZEN'), async (req, res) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, include: complaintDetailInclude });
  // Same response for "missing" and "someone else's" so ids cannot be probed.
  if (!complaint || complaint.citizenId !== req.user.id) throw notFound('Complaint not found');
  res.json({ complaint: complaintCitizenView(complaint, { detail: true }) });
});

export const attachmentsRouter = Router();

attachmentsRouter.get('/:id', async (req, res) => {
  const attachment = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: { complaint: { select: { citizenId: true } } },
  });
  if (!attachment) throw notFound('Attachment not found');
  if (req.user.role !== 'MUNICIPAL') {
    const own = attachment.complaint.citizenId === req.user.id && attachment.kind === 'CITIZEN_PHOTO';
    if (!own) throw (attachment.complaint.citizenId === req.user.id ? forbidden() : notFound('Attachment not found'));
  }
  res.set({
    'Content-Type': attachment.mimeType,
    'Content-Length': String(attachment.sizeBytes),
    'Content-Disposition': 'inline',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=3600',
  });
  res.end(Buffer.from(attachment.data));
});

export default router;
