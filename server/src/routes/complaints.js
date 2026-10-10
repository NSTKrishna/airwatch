// Citizen complaint endpoints. A citizen can only ever see their own complaints.
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { imageUpload, toAttachmentRows } from '../lib/uploads.js';
import { requireRole } from '../middleware/auth.js';
import { parse } from '../middleware/validate.js';
import { DUST_AUTHORITY } from '../data/pilot.js';
import { captureSiteEvidence, routeComplaint } from '../services/complaints.js';
import { CHANNEL_KEYS, FOLLOW_UP_KINDS, addFollowUp } from '../services/followUps.js';
import { complaintCitizenView, complaintDetailInclude, complaintListInclude, publicComplaintWhere } from '../services/views.js';

const router = Router();

const optionalNumber = (min, max) =>
  z.preprocess((v) => (v === '' || v == null ? undefined : Number(v)), z.number().min(min).max(max).optional());

const optionalText = z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(64).optional());

// Construction dust is the only kind of report this pilot takes, so there is no category field.
const createSchema = z.object({
  // Where the report belongs. One of: a verified project, a monitored site, coordinates, or a ward.
  projectCode: optionalText,
  siteId: optionalText,
  wardSlug: optionalText,
  localityCode: optionalText,
  description: z.string().trim().min(10, 'Describe what you saw in at least 10 characters').max(2000),
  locationText: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(300).optional()),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
}).superRefine((v, ctx) => {
  if ((v.latitude === undefined) !== (v.longitude === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Provide both latitude and longitude' });
  }
  if (!v.projectCode && !v.siteId && v.latitude === undefined && !v.locationText) {
    ctx.addIssue({ code: 'custom', path: ['locationText'], message: 'Choose a site, share your location, or describe where this is' });
  }
});

router.post('/', requireRole('CITIZEN'), imageUpload(4).array('photos', 4), async (req, res) => {
  const input = parse(createSchema, req.body);
  if (!req.files?.length) throw badRequest('Some fields are invalid', { fields: { photos: 'Attach at least one photograph' } });

  const { project, site, ward, locality } = await routeComplaint(input);

  // Evidence is attached when it exists; its absence never blocks a report.
  const evidence = await captureSiteEvidence(site?.id);
  const complaint = await prisma.$transaction(async (tx) => {
    const created = await tx.complaint.create({
      data: {
        citizenId: req.user.id,
        localityId: locality.id,
        wardId: ward?.id ?? null,
        projectId: project?.id ?? null,
        siteId: site?.id ?? null,
        description: input.description,
        locationText: input.locationText ?? null,
        latitude: input.latitude ?? site?.latitude ?? project?.latitude ?? null,
        longitude: input.longitude ?? site?.longitude ?? project?.longitude ?? null,
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
        metadata: { anomalyEvidenceAttached: Boolean(evidence.anomalyEvaluationId), photos: req.files.length, routedToWard: ward?.code ?? null },
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
    include: complaintListInclude,
    orderBy: { createdAt: 'desc' },
  });
  res.json({ complaints: complaints.map((c) => complaintCitizenView(c)) });
});

router.get('/:id', requireRole('CITIZEN'), async (req, res) => {
  const complaint = await prisma.complaint.findUnique({ where: { id: req.params.id }, include: complaintDetailInclude });
  // Same response for "missing" and "someone else's" so ids cannot be probed.
  if (!complaint || complaint.citizenId !== req.user.id) throw notFound('Complaint not found');
  res.json({ complaint: complaintCitizenView(complaint, { detail: true }), dustAuthority: DUST_AUTHORITY });
});

// --- Citizen follow-up: the independent side of a case ---

// A date that exists: 2026-02-31 and 2026-99-99 have the right shape and are not dates.
const isCalendarDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

const followUpSchema = z.object({
  kind: z.enum(FOLLOW_UP_KINDS),
  note: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(2000).optional()),
  // The day the citizen says it happened (filed, replied to, or observed), as YYYY-MM-DD.
  occurredOn: z.preprocess((v) => (v === '' || v == null ? undefined : v), z.string().refine(isCalendarDate, 'Use a real date like 2026-10-10').optional()),
  latitude: optionalNumber(-90, 90),
  longitude: optionalNumber(-180, 180),
  officialChannel: z.preprocess((v) => (v === '' ? undefined : v), z.enum(CHANNEL_KEYS).optional()),
  officialReference: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().min(3, 'Enter the number as it appears on the acknowledgment').max(60).optional()),
}).superRefine((v, ctx) => {
  if ((v.latitude === undefined) !== (v.longitude === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['latitude'], message: 'Provide both latitude and longitude' });
  }
});

const followUpUpload = imageUpload(5).fields([{ name: 'photos', maxCount: 4 }, { name: 'acknowledgment', maxCount: 1 }]);

// Any signed-in citizen can add to a public case, not only the person who reported it: a
// neighbour or a resident group can file officially, or go and look, on the reporter's behalf.
router.post('/reports/:reference/follow-ups', requireRole('CITIZEN'), followUpUpload, async (req, res) => {
  const input = parse(followUpSchema, req.body);
  const match = /^AW-(\d{4})-(\d{1,9})$/i.exec(req.params.reference.trim());
  const complaint = match ? await prisma.complaint.findFirst({
    where: { seq: Number(match[2]), OR: [publicComplaintWhere, { citizenId: req.user.id }] },
  }) : null;
  if (!complaint || new Date(complaint.createdAt).getUTCFullYear() !== Number(match[1])) throw notFound('Report not found');

  const base = { complaintId: complaint.id, uploadedById: req.user.id };
  await addFollowUp(complaint, req.user, { ...input, occurredOn: input.occurredOn ? new Date(`${input.occurredOn}T00:00:00Z`) : undefined }, {
    photoRows: toAttachmentRows(req.files?.photos, { ...base, kind: 'FOLLOW_UP_PHOTO' }),
    acknowledgmentRows: toAttachmentRows(req.files?.acknowledgment, { ...base, kind: 'OFFICIAL_ACKNOWLEDGMENT' }),
  });
  const full = await prisma.complaint.findUnique({ where: { id: complaint.id }, include: complaintDetailInclude });
  const view = complaintCitizenView(full, { detail: true });
  // Someone who is not the reporter gets the trail and the positions, not the reporter's own page.
  res.status(201).json(full.citizenId === req.user.id ? { complaint: view } : { complaint: { reference: view.reference, positions: view.positions, followUps: view.followUps } });
});

export const attachmentsRouter = Router();

attachmentsRouter.get('/:id', async (req, res) => {
  const attachment = await prisma.attachment.findUnique({
    where: { id: req.params.id },
    include: { complaint: { select: { citizenId: true } } },
  });
  if (!attachment) throw notFound('Attachment not found');
  if (req.user.role !== 'MUNICIPAL') {
    // A citizen sees the photographs of their own report, and whatever they uploaded themselves.
    const own = (attachment.complaint.citizenId === req.user.id && attachment.kind === 'CITIZEN_PHOTO')
      || (attachment.uploadedById === req.user.id && attachment.kind !== 'INSPECTION_EVIDENCE');
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
