// Municipal operations API. The whole router is mounted behind requireRole('MUNICIPAL').
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import { imageUpload, toAttachmentRows } from '../lib/uploads.js';
import { parse } from '../middleware/validate.js';
import {
  STATUSES, TRANSITIONS, addEvidence, addNote, assignOfficer, changeStatus, updateFindings,
} from '../services/complaints.js';
import { SCENARIOS } from '../services/mockSensorProvider.js';
import { evaluateSiteById, runMonitoringSweep, sensorProvider } from '../services/monitoring.js';
import { complaintDetailInclude, complaintMunicipalView, sitesWithLatest } from '../services/views.js';

const router = Router();

router.get('/summary', async (_req, res) => {
  const [byStatus, sites] = await Promise.all([
    prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
    sitesWithLatest(),
  ]);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of byStatus) counts[row.status] = row._count._all;
  const latest = sites.map((s) => s.latest?.evaluation).filter(Boolean);
  res.json({
    totalReports: Object.values(counts).reduce((a, b) => a + b, 0),
    activeAnomalies: latest.filter((e) => e.active).length,
    pendingInspections: counts.INSPECTION_ASSIGNED,
    awaitingReview: counts.SUBMITTED + counts.UNDER_REVIEW,
    resolvedCases: counts.RESOLVED,
    rejectedCases: counts.REJECTED,
    byStatus: counts,
    monitoredSites: sites.length,
    sitesWithoutAssessment: sites.filter((s) => s.latest?.evaluation?.status !== 'EVALUATED').length,
  });
});

// Sites whose most recent evaluation is a current anomaly, with open-complaint counts.
router.get('/flagged-sites', async (_req, res) => {
  const sites = await sitesWithLatest();
  const open = await prisma.complaint.groupBy({
    by: ['siteId'],
    where: { siteId: { not: null }, status: { in: ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED'] } },
    _count: { _all: true },
  });
  const openBySite = new Map(open.map((r) => [r.siteId, r._count._all]));
  res.json({
    sites: sites.map((s) => ({ ...s, flagged: Boolean(s.latest?.evaluation?.active), openComplaints: openBySite.get(s.id) || 0 })),
  });
});

router.get('/officers', async (_req, res) => {
  const officers = await prisma.user.findMany({ where: { role: 'MUNICIPAL' }, orderBy: { name: 'asc' } });
  res.json({ officers: officers.map((o) => ({ id: o.id, name: o.name, email: o.email })) });
});

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  locality: z.string().optional(),
  assignee: z.string().optional(), // "me", "unassigned" or an officer id
  anomaly: z.enum(['yes', 'no']).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

router.get('/complaints', async (req, res) => {
  const query = parse(listQuery, req.query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.locality) where.locality = { code: query.locality };
  if (query.assignee === 'me') where.assignedOfficerId = req.user.id;
  else if (query.assignee === 'unassigned') where.assignedOfficerId = null;
  else if (query.assignee) where.assignedOfficerId = query.assignee;
  if (query.anomaly) where.anomalyEvaluationId = query.anomaly === 'yes' ? { not: null } : null;
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' };
    const or = [
      { description: contains },
      { locationText: contains },
      { site: { is: { OR: [{ name: contains }, { code: contains }, { address: contains }] } } },
      { citizen: { is: { name: contains } } },
    ];
    // References look like AW-2026-00042; allow searching by the reference or its number.
    const seq = /(\d+)\s*$/.exec(query.q);
    if (seq && Number(seq[1]) < 2_000_000_000) or.push({ seq: Number(seq[1]) });
    where.OR = or;
  }
  const [total, rows] = await Promise.all([
    prisma.complaint.count({ where }),
    prisma.complaint.findMany({
      where,
      include: { locality: true, site: true, citizen: true, assignedOfficer: true, _count: { select: { attachments: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  res.json({ total, page: query.page, pageSize: query.pageSize, complaints: rows.map((c) => complaintMunicipalView(c)) });
});

async function sendDetail(res, id, status = 200) {
  const complaint = await prisma.complaint.findUnique({ where: { id }, include: complaintDetailInclude });
  if (!complaint) throw notFound('Complaint not found');
  res.status(status).json({
    complaint: complaintMunicipalView(complaint, { detail: true }),
    allowedTransitions: TRANSITIONS[complaint.status],
  });
}

router.get('/complaints/:id', (req, res) => sendDetail(res, req.params.id));

const text = (max) => z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(max).optional());

const statusSchema = z.object({
  status: z.enum(STATUSES),
  note: text(2000),
  officerId: text(64),
  findings: text(4000),
  correctiveAction: text(4000),
});

router.post('/complaints/:id/status', async (req, res) => {
  await changeStatus(req.params.id, req.user, parse(statusSchema, req.body));
  await sendDetail(res, req.params.id);
});

router.post('/complaints/:id/assign', async (req, res) => {
  const { officerId } = parse(z.object({ officerId: z.string().min(1, 'Choose an officer') }), req.body);
  await assignOfficer(req.params.id, req.user, officerId);
  await sendDetail(res, req.params.id);
});

router.post('/complaints/:id/notes', async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(1, 'Write a note').max(2000) }), req.body);
  await addNote(req.params.id, req.user, note);
  await sendDetail(res, req.params.id, 201);
});

router.put('/complaints/:id/findings', async (req, res) => {
  const input = parse(z.object({ findings: text(4000), correctiveAction: text(4000) }), req.body);
  await updateFindings(req.params.id, req.user, input);
  await sendDetail(res, req.params.id);
});

router.post('/complaints/:id/evidence', imageUpload(6).array('files', 6), async (req, res) => {
  const { caption } = parse(z.object({ caption: text(300) }), req.body);
  if (!req.files?.length) throw badRequest('Attach at least one image');
  const rows = toAttachmentRows(req.files, {
    complaintId: req.params.id, uploadedById: req.user.id, kind: 'INSPECTION_EVIDENCE', caption: caption ?? null,
  });
  await addEvidence(req.params.id, req.user, rows, caption);
  await sendDetail(res, req.params.id, 201);
});

const analyticsQuery = z.object({ hours: z.coerce.number().int().min(1).max(168).default(24) });

router.get('/analytics', async (req, res) => {
  const { hours } = parse(analyticsQuery, req.query);
  // Columns are UTC "timestamp without time zone"; compare against a UTC literal so the
  // database session time zone cannot shift the window.
  const sinceUtc = new Date(Date.now() - hours * 3_600_000).toISOString();
  const bucketMinutes = hours <= 6 ? 5 : hours <= 24 ? 15 : hours <= 72 ? 60 : 180;
  const [series, localities, complaintRows, statusRows] = await Promise.all([
    prisma.$queryRaw`
      SELECT date_bin(${`${bucketMinutes} minutes`}::interval, o."receivedAt", TIMESTAMP '2000-01-01') AS t,
             l.code AS locality,
             avg(o."backgroundUgm3")::float8 AS background,
             avg(o."siteUgm3")::float8 AS site
      FROM "SensorObservation" o
      JOIN "Site" s ON s.id = o."siteId"
      JOIN "Locality" l ON l.id = s."localityId"
      WHERE o."receivedAt" >= ${sinceUtc}::timestamp
      GROUP BY 1, 2 ORDER BY 1`,
    prisma.$queryRaw`
      SELECT l.code, l.name,
             avg(o."backgroundUgm3")::float8 AS "avgBackground",
             avg(o."siteUgm3")::float8 AS "avgSite",
             avg(e."observedDifference")::float8 AS "avgDifference",
             avg(e."dynamicBarrier")::float8 AS "avgBarrier",
             count(e.id) FILTER (WHERE e.status = 'EVALUATED')::int AS evaluated,
             count(e.id) FILTER (WHERE e."isAnomaly")::int AS anomalies,
             count(e.id) FILTER (WHERE e.status <> 'EVALUATED')::int AS "notAssessed"
      FROM "Locality" l
      LEFT JOIN "Site" s ON s."localityId" = l.id
      LEFT JOIN "SensorObservation" o ON o."siteId" = s.id AND o."receivedAt" >= ${sinceUtc}::timestamp
      LEFT JOIN "AnomalyEvaluation" e ON e."observationId" = o.id
      GROUP BY l.code, l.name ORDER BY l.name`,
    prisma.$queryRaw`
      SELECT l.code,
             count(c.id)::int AS total,
             count(c.id) FILTER (WHERE c.status IN ('SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED'))::int AS open,
             count(c.id) FILTER (WHERE c.status = 'RESOLVED')::int AS resolved,
             count(c.id) FILTER (WHERE c.status = 'REJECTED')::int AS rejected,
             count(c.id) FILTER (WHERE c."anomalyEvaluationId" IS NOT NULL)::int AS "withAnomalyEvidence"
      FROM "Locality" l LEFT JOIN "Complaint" c ON c."localityId" = l.id
      GROUP BY l.code`,
    prisma.complaint.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const complaintsByLocality = new Map(complaintRows.map((r) => [r.code, r]));
  res.json({
    hours,
    bucketMinutes,
    unit: 'ug/m3',
    simulated: sensorProvider.dataSource === 'SIMULATED',
    series,
    localities: localities.map((l) => ({ ...l, complaints: complaintsByLocality.get(l.code) })),
    complaintsByStatus: Object.fromEntries(STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?._count._all || 0])),
  });
});

// --- Monitoring + simulator controls (mock sensors only) ---

router.post('/monitoring/run', async (_req, res) => {
  res.json(await runMonitoringSweep());
});

router.get('/simulator', async (_req, res) => {
  const sites = await prisma.site.findMany({ include: { locality: true, simulator: true }, orderBy: { code: 'asc' } });
  res.json({
    provider: sensorProvider.name,
    providerDescription: sensorProvider.description,
    simulated: true,
    monitorIntervalSeconds: config.monitorIntervalSeconds,
    scenarios: Object.entries(SCENARIOS).map(([id, description]) => ({ id, description })),
    sites: sites.map((s) => ({ id: s.id, code: s.code, name: s.name, locality: s.locality.name, scenario: s.simulator?.scenario || 'NORMAL' })),
  });
});

router.put('/simulator/sites/:id', async (req, res) => {
  const { scenario } = parse(z.object({ scenario: z.enum(Object.keys(SCENARIOS)) }), req.body);
  const site = await prisma.site.findUnique({ where: { id: req.params.id } });
  if (!site) throw notFound('Site not found');
  await prisma.simulatorState.upsert({ where: { siteId: site.id }, create: { siteId: site.id, scenario }, update: { scenario } });
  // Take a reading immediately so the change is visible without waiting for the next sweep.
  const evaluation = await evaluateSiteById(site.id);
  res.json({ siteId: site.id, scenario, evaluationStatus: evaluation.status, isAnomaly: evaluation.isAnomaly });
});

export default router;
