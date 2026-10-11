// Public, signed-out read API for the citizen map: wards, verified projects, the DEMO
// monitors standing at them, and citizen reports with their public status history.
//
// Nothing here identifies a citizen or an officer. Readings obey the same publication
// rule as the signed-in citizen API: a device not cleared for publication is withheld.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { CITY } from '../data/mumbai.js';
import { DUST_AUTHORITY } from '../data/pilot.js';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { readAttachment } from '../lib/storage.js';
import { parse } from '../middleware/validate.js';
import { optionalAuth } from '../middleware/auth.js';
import { outcomeCounts } from '../services/followUps.js';
import { systemStatus } from '../services/status.js';
import {
  complaintDetailInclude, complaintListInclude, complaintPublicView, projectRecord, publicComplaintWhere, representativeView, siteHistory, sitesWithLatest, wardView,
} from '../services/views.js';
import { boundaryCollection, boundarySource, distanceM, wardCodeAt } from '../services/wards.js';

const router = Router();

router.use(rateLimit({
  windowMs: 60_000,
  limit: config.env === 'test' ? 100_000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many requests. Please wait a minute and try again.' } },
}));

const OPEN = ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED'];
const audience = { publicOnly: true };

/** DEMO monitors keyed by the code of the project they stand at. */
async function monitorsByProject(where = {}) {
  const sites = await sitesWithLatest({ projectId: { not: null }, ...where }, audience);
  return new Map(sites.map((s) => [s.project.code, {
    siteId: s.id, siteCode: s.code, device: s.device, withheld: s.withheld, latest: s.latest,
    // The comparison station is simulated too, and is not a place on the ground.
    background: { simulated: s.station.simulated, distanceM: s.distanceToBackgroundM },
  }]));
}

const projectWithMonitor = (project, monitors) => ({ ...projectRecord(project), monitor: monitors.get(project.code) ?? null });

async function wardCounts() {
  const [projects, monitors, reports, cases] = await Promise.all([
    prisma.project.groupBy({ by: ['wardId'], where: { active: true }, _count: { _all: true } }),
    sitesWithLatest({ projectId: { not: null } }, audience),
    prisma.complaint.groupBy({ by: ['wardId', 'status'], where: publicComplaintWhere, _count: { _all: true } }),
    prisma.complaint.findMany({ where: publicComplaintWhere, select: { wardId: true, status: true, followUps: true, events: complaintListInclude.events } }),
  ]);
  const counts = new Map();
  const of = (wardId) => {
    if (!counts.has(wardId)) counts.set(wardId, { projects: 0, monitors: 0, flaggedNow: 0, reports: 0, openReports: 0, resolvedReports: 0 });
    return counts.get(wardId);
  };
  for (const row of projects) of(row.wardId).projects = row._count._all;
  for (const row of reports) {
    const c = of(row.wardId);
    c.reports += row._count._all;
    if (OPEN.includes(row.status)) c.openReports += row._count._all;
    if (row.status === 'RESOLVED') c.resolvedReports += row._count._all;
  }
  // What happened after the reports were filed, per ward.
  const byWard = new Map();
  for (const c of cases) byWard.set(c.wardId, [...(byWard.get(c.wardId) || []), c]);
  for (const [wardId, list] of byWard) of(wardId).outcomes = outcomeCounts(list);
  return { counts, monitors, outcomes: outcomeCounts(cases) };
}

router.get('/overview', async (_req, res) => {
  const [wards, { counts, monitors, outcomes }, { sensors }] = await Promise.all([
    prisma.ward.findMany({ orderBy: { code: 'asc' } }),
    wardCounts(),
    systemStatus(),
  ]);
  const bySlug = new Map(wards.map((w) => [w.slug, w.id]));
  for (const site of monitors) {
    const c = counts.get(bySlug.get(site.project.ward.slug));
    if (!c) continue;
    c.monitors += 1;
    if (site.latest?.evaluation?.active) c.flaggedNow += 1;
  }
  const empty = { projects: 0, monitors: 0, flaggedNow: 0, reports: 0, openReports: 0, resolvedReports: 0 };
  const rows = wards.map((w) => ({ ...wardView(w), counts: w.pilot ? counts.get(w.id) ?? empty : null }));
  const totals = rows.filter((w) => w.counts).reduce((sum, w) => {
    for (const key of Object.keys(empty)) sum[key] += w.counts[key];
    return sum;
  }, { ...empty });
  res.json({
    city: CITY.name,
    mapDefault: { latitude: CITY.latitude, longitude: CITY.longitude, zoom: CITY.zoom },
    // A demonstration: no ward office receives anything, and no status here is a BMC decision.
    official: false,
    wards: rows,
    totals,
    outcomes,
    sensors,
    dustAuthority: DUST_AUTHORITY,
    boundarySource: boundarySource(),
  });
});

router.get('/boundaries', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(boundaryCollection());
});

router.get('/wards/:slug', async (req, res) => {
  const ward = await prisma.ward.findUnique({ where: { slug: req.params.slug }, include: { representatives: { orderBy: [{ role: 'asc' }, { constituency: 'asc' }] } } });
  if (!ward) throw notFound('Ward not found');
  const [projects, monitors, reports] = await Promise.all([
    prisma.project.findMany({ where: { wardId: ward.id, active: true }, include: { ward: true }, orderBy: { code: 'asc' } }),
    monitorsByProject({ project: { wardId: ward.id } }),
    prisma.complaint.findMany({
      where: { ...publicComplaintWhere, wardId: ward.id }, include: { ...complaintListInclude, _count: { select: { attachments: { where: { kind: 'CITIZEN_PHOTO' } } } } },
      orderBy: { createdAt: 'desc' }, take: 100,
    }),
  ]);
  res.json({
    ward: wardView(ward),
    representatives: ward.representatives.map(representativeView),
    dustAuthority: DUST_AUTHORITY,
    projects: projects.map((p) => projectWithMonitor(p, monitors)),
    reports: reports.map((c) => complaintPublicView(c)),
  });
});

const projectQuery = z.object({ ward: z.string().trim().max(16).optional(), q: z.string().trim().max(100).optional() });

router.get('/projects', async (req, res) => {
  const query = parse(projectQuery, req.query);
  const where = { active: true };
  if (query.ward) where.ward = { slug: query.ward };
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' };
    where.OR = [{ name: contains }, { developer: contains }, { address: contains }, { registrationNo: contains }, { code: contains }];
  }
  const [projects, monitors] = await Promise.all([
    prisma.project.findMany({ where, include: { ward: true }, orderBy: { code: 'asc' } }),
    monitorsByProject(),
  ]);
  res.json({ projects: projects.map((p) => projectWithMonitor(p, monitors)) });
});

router.get('/projects/:code', async (req, res) => {
  const project = await prisma.project.findFirst({ where: { code: req.params.code, active: true }, include: { ward: true } });
  if (!project) throw notFound('Project not found');
  const [monitors, reports] = await Promise.all([
    monitorsByProject({ projectId: project.id }),
    prisma.complaint.findMany({
      where: { ...publicComplaintWhere, projectId: project.id }, include: { ...complaintListInclude, _count: { select: { attachments: { where: { kind: 'CITIZEN_PHOTO' } } } } },
      orderBy: { createdAt: 'desc' }, take: 50,
    }),
  ]);
  res.json({ project: projectWithMonitor(project, monitors), reports: reports.map((c) => complaintPublicView(c)) });
});

const historyQuery = z.object({ hours: z.coerce.number().int().min(1).max(168).default(24) });

router.get('/sites/:id/history', async (req, res) => {
  const { hours } = parse(historyQuery, req.query);
  const [site] = await sitesWithLatest({ id: req.params.id, projectId: { not: null } }, audience);
  if (!site) throw notFound('Monitor not found');
  res.json(await siteHistory(site, hours));
});

const reportQuery = z.object({
  ward: z.string().trim().max(16).optional(),
  project: z.string().trim().max(64).optional(),
  status: z.enum(['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED', 'REJECTED']).optional(),
});

router.get('/reports', async (req, res) => {
  const query = parse(reportQuery, req.query);
  const where = { ...publicComplaintWhere };
  if (query.ward) where.ward = { slug: query.ward };
  if (query.project) where.project = { code: query.project };
  if (query.status) where.status = query.status;
  const reports = await prisma.complaint.findMany({
    where, include: { ...complaintListInclude, _count: { select: { attachments: { where: { kind: 'CITIZEN_PHOTO' } } } } },
    orderBy: { createdAt: 'desc' }, take: 500,
  });
  res.json({ reports: reports.map((c) => complaintPublicView(c)) });
});

// References look like AW-2026-00042.
router.get('/reports/:reference', optionalAuth, async (req, res) => {
  const match = /^AW-(\d{4})-(\d{1,9})$/i.exec(req.params.reference.trim());
  const complaint = match ? await prisma.complaint.findFirst({ where: { ...publicComplaintWhere, seq: Number(match[2]) }, include: complaintDetailInclude }) : null;
  // A hidden report answers exactly like one that does not exist.
  if (!complaint || new Date(complaint.createdAt).getUTCFullYear() !== Number(match[1])) throw notFound('Report not found');
  res.json({ report: complaintPublicView(complaint, { detail: true, viewerId: req.user?.id }), dustAuthority: DUST_AUTHORITY });
});

// Complete model provenance lives on this deliberate reference page, not in map summaries.
router.get('/methodology', async (_req, res) => {
  const { model, sensors } = await systemStatus();
  res.json({
    model: {
      available: model.ready,
      version: model.version,
      algorithm: model.algorithm,
      artifactVersion: model.artifactVersion,
      dataSource: model.dataSource,
      syntheticOnly: model.syntheticOnly,
      measurement: model.measurement,
      features: model.features,
      calibration: model.calibration,
      calibratedMargin: model.calibratedMargin,
      scope: model.scope,
      limitations: model.limitations,
      trainedDomain: model.trainedDomain,
    },
    monitoring: { simulated: sensors.simulated, simulatedDevices: sensors.devices.simulated, physicalDevices: sensors.devices.real },
  });
});

const locateQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) });

// Which ward a point is in, and the verified projects around it. The point is not stored.
router.get('/locate', async (req, res) => {
  const { lat, lng } = parse(locateQuery, req.query);
  const code = wardCodeAt(lat, lng);
  const ward = code ? await prisma.ward.findUnique({ where: { code } }) : null;
  const projects = ward?.pilot
    ? await prisma.project.findMany({ where: { active: true, latitude: { not: null }, wardId: ward.id }, include: { ward: true } })
    : [];
  const here = { latitude: lat, longitude: lng };
  res.json({
    ward: ward ? wardView(ward) : null,
    nearbyProjects: projects
      .map((p) => ({ code: p.code, name: p.name, address: p.address, distanceM: Math.round(distanceM(here, p)) }))
      .filter((p) => p.distanceM <= 2000)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5),
  });
});

// A citizen's photograph is public only once the report is under review and not hidden, and a
// follow-up photograph only once a moderator has verified that follow-up. An acknowledgment
// document is never served here.
router.get('/attachments/:id', async (req, res) => {
  const attachment = await prisma.attachment.findFirst({
    where: {
      id: req.params.id,
      complaint: publicComplaintWhere,
      OR: [
        { kind: 'CITIZEN_PHOTO', complaint: { status: { not: 'SUBMITTED' } } },
        { kind: 'FOLLOW_UP_PHOTO', followUp: { check: 'VERIFIED' } },
      ],
    },
  });
  if (!attachment) throw notFound('Attachment not found');
  // The browser must ask again each time, so a photograph stops being served the moment its
  // report is hidden or its follow-up is set aside. The check above runs before any 304.
  const etag = `"${attachment.id}"`;
  res.set({ 'Cache-Control': 'no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' });
  if (req.get('if-none-match') === etag) return res.status(304).end();
  res.set({ 'Content-Type': attachment.mimeType, 'Content-Length': String(attachment.sizeBytes), 'Content-Disposition': 'inline' });
  return res.end(await readAttachment(attachment));
});

export default router;
