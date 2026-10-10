// Response shaping. Citizen-facing and municipal-facing complaint views are
// separate functions so internal fields cannot leak by accident.
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { isActiveAnomaly } from './monitoring.js';

export const complaintReference = (c) => `AW-${new Date(c.createdAt).getUTCFullYear()}-${String(c.seq).padStart(5, '0')}`;

export function evaluationView(e) {
  if (!e) return null;
  return {
    id: e.id,
    status: e.status,
    reason: e.reason,
    evaluatedAt: e.evaluatedAt,
    active: isActiveAnomaly(e),
    isAnomaly: e.isAnomaly,
    backgroundValue: e.backgroundValue,
    siteValue: e.siteValue,
    unit: e.unit,
    backgroundTimestamp: e.backgroundTimestamp,
    siteTimestamp: e.siteTimestamp,
    observedDifference: e.observedDifference,
    expectedNormalDifference: e.expectedNormalDifference,
    calibratedMargin: e.calibratedMargin,
    dynamicBarrier: e.dynamicBarrier,
    interpretation: e.interpretation,
    features: e.features,
    // Inputs outside the range the model was trained on; the verdict is less reliable when present.
    domainWarnings: e.domainWarnings ?? [],
    model: e.modelVersion
      ? { version: e.modelVersion, algorithm: e.modelAlgorithm, dataSource: e.modelDataSource, syntheticOnly: e.modelSyntheticOnly }
      : null,
  };
}

export function observationView(o) {
  if (!o) return null;
  const pairing = o.pairing || {};
  return {
    id: o.id,
    // SIMULATED, or DEVICE for an authenticated physical monitor.
    dataSource: o.dataSource,
    simulated: o.dataSource === 'SIMULATED',
    pollutant: o.pollutant,
    receivedAt: o.receivedAt,
    intervalSeconds: o.intervalSeconds,
    // `background` is null-valued when no compatible background observation existed.
    background: {
      sensorId: o.backgroundSensorId, value: o.backgroundValue, unit: o.backgroundUnit, ugm3: o.backgroundUgm3, timestamp: o.backgroundTimestamp,
      source: o.backgroundSource, provenance: pairing.background?.provenance ?? null,
    },
    site: { sensorId: o.siteSensorId, value: o.siteValue, unit: o.siteUnit, ugm3: o.siteUgm3, pm25Ugm3: o.sitePm25Ugm3, timestamp: o.siteTimestamp },
    weather: {
      temperatureC: o.temperatureC, humidityPct: o.humidityPct, windSpeedMs: o.windSpeedMs, windDirectionDeg: o.windDirectionDeg,
      source: o.weatherSource, provenance: pairing.weather?.provenance ?? null,
    },
    evaluation: evaluationView(o.evaluation),
  };
}

const wardRef = (w) => (w ? { code: w.code, slug: w.slug, name: w.name } : null);

const stationView = (s) => ({
  code: s.code, name: s.name, latitude: s.latitude, longitude: s.longitude, provenance: s.provenance, simulated: s.provenance === 'SIMULATED', operator: s.operator,
});

export const siteSummary = (s) => {
  // The active device; a physical monitor takes precedence over the simulated stand-in.
  const active = s.devices?.filter((d) => d.status === 'ACTIVE') ?? [];
  const device = active.find((d) => d.provenance === 'DEVICE') ?? active[0] ?? s.devices?.[0];
  return {
    id: s.id, code: s.code, name: s.name, address: s.address, latitude: s.latitude, longitude: s.longitude,
    distanceToBackgroundM: s.distanceToBackgroundM,
    // A demonstration site, not a real construction project.
    simulated: s.simulated,
    locality: s.locality ? { code: s.locality.code, name: s.locality.name, city: s.locality.city } : undefined,
    project: s.project ? { code: s.project.code, name: s.project.name, ward: wardRef(s.project.ward) } : null,
    station: s.station ? stationView(s.station) : undefined,
    device: device ? {
      deviceId: device.deviceId, provenance: device.provenance, manufacturer: device.manufacturer, model: device.model,
      samplingIntervalSeconds: device.samplingIntervalSeconds, lastSeenAt: device.lastSeenAt, reportedStatus: device.lastReportedStatus,
      publishAllowed: device.publishAllowed,
    } : null,
  };
};
export { stationView };

/** Latest observation (with its evaluation) for each site id. */
export async function latestObservations(siteIds) {
  if (siteIds.length === 0) return new Map();
  // "Latest" means the most recent observation time, not the most recent upload:
  // a late batch must not displace a newer reading.
  const rows = await prisma.$queryRaw`
    SELECT DISTINCT ON ("siteId") id FROM "SensorObservation"
    WHERE "siteId" IN (${Prisma.join(siteIds)})
    ORDER BY "siteId", "siteTimestamp" DESC`;
  const observations = await prisma.sensorObservation.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: { evaluation: true },
  });
  return new Map(observations.map((o) => [o.siteId, o]));
}

/**
 * Active sites with their latest observation.
 * `publicOnly` applies publication permissions: readings from a device that is not
 * cleared for publication are withheld (municipal users see everything).
 */
export async function sitesWithLatest(where = {}, { publicOnly = false } = {}) {
  const sites = await prisma.site.findMany({
    where: { active: true, ...where },
    include: { locality: true, station: true, devices: true, project: { include: { ward: true } } },
    orderBy: { code: 'asc' },
  });
  const latest = await latestObservations(sites.map((s) => s.id));
  return sites.map((s) => {
    const summary = siteSummary(s);
    const withheld = publicOnly && summary.device && !summary.device.publishAllowed;
    return { ...summary, withheld: Boolean(withheld), latest: withheld ? null : observationView(latest.get(s.id)) };
  });
}

/** Bucketed readings for one site (a `sitesWithLatest` row). Withheld sites return no points. */
export async function siteHistory(site, hours) {
  const bucketMinutes = hours <= 3 ? 1 : hours <= 12 ? 5 : hours <= 24 ? 15 : hours <= 72 ? 60 : 180;
  // Columns are UTC "timestamp without time zone"; compare against a UTC literal so the
  // database session time zone cannot shift the window.
  const sinceUtc = new Date(Date.now() - hours * 3_600_000).toISOString();
  const points = site.withheld ? [] : await prisma.$queryRaw`
    SELECT date_bin(${`${bucketMinutes} minutes`}::interval, o."siteTimestamp", TIMESTAMP '2000-01-01') AS t,
           avg(o."backgroundUgm3")::float8 AS background,
           avg(o."siteUgm3")::float8 AS site,
           avg(o."sitePm25Ugm3")::float8 AS pm25,
           avg(o."temperatureC")::float8 AS temperature,
           avg(o."humidityPct")::float8 AS humidity,
           avg(e."observedDifference")::float8 AS difference,
           avg(e."dynamicBarrier")::float8 AS barrier,
           count(*) FILTER (WHERE e."isAnomaly")::int AS anomalies,
           count(*) FILTER (WHERE e.status = 'EVALUATED')::int AS evaluated,
           count(*)::int AS readings
    FROM "SensorObservation" o
    LEFT JOIN "AnomalyEvaluation" e ON e."observationId" = o.id
    WHERE o."siteId" = ${site.id} AND o."siteTimestamp" >= ${sinceUtc}::timestamp
    GROUP BY 1 ORDER BY 1`;
  return {
    siteId: site.id, hours, bucketMinutes, unit: 'ug/m3',
    // Completeness: how many readings each bucket would hold at the device's sampling interval.
    expectedReadingsPerBucket: site.device ? Math.round((bucketMinutes * 60) / site.device.samplingIntervalSeconds) : null,
    simulated: site.device?.provenance !== 'DEVICE',
    points,
  };
}

const attachmentView = (a) => ({
  id: a.id, kind: a.kind, filename: a.filename, mimeType: a.mimeType, sizeBytes: a.sizeBytes,
  caption: a.caption, createdAt: a.createdAt, url: `/api/attachments/${a.id}`,
});

const anomalyEvidenceView = (c) =>
  c.anomalyEvaluation
    ? { ...evaluationView(c.anomalyEvaluation), dataSource: c.anomalyEvaluation.observation?.dataSource ?? null }
    : null;

const complaintBase = (c) => ({
  id: c.id,
  reference: complaintReference(c),
  status: c.status,
  description: c.description,
  latitude: c.latitude,
  longitude: c.longitude,
  locationText: c.locationText,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  locality: c.locality ? { code: c.locality.code, name: c.locality.name } : undefined,
  site: c.site ? { id: c.site.id, code: c.site.code, name: c.site.name, address: c.site.address, latitude: c.site.latitude, longitude: c.site.longitude } : null,
  // Routing: the ward office the report was directed to, and the verified project it names.
  ward: wardRef(c.ward),
  project: c.project ? { code: c.project.code, name: c.project.name } : null,
  isDemo: c.isDemo,
  hasAnomalyEvidence: Boolean(c.anomalyEvaluationId),
});

// Citizens see public lifecycle events only: no internal notes, no officer identities.
const CITIZEN_EVENT_TYPES = new Set(['SUBMITTED', 'STATUS_CHANGED']);

export function complaintCitizenView(c, { detail = false } = {}) {
  const view = complaintBase(c);
  if (!detail) return view;
  const closed = c.status === 'RESOLVED' || c.status === 'REJECTED';
  return {
    ...view,
    publicHidden: c.publicHidden,
    wardOffice: wardOfficeView(c.ward),
    anomalyEvidence: anomalyEvidenceView(c),
    sensorSnapshot: c.sensorSnapshot,
    findings: closed ? c.findings : null,
    correctiveAction: closed ? c.correctiveAction : null,
    attachments: (c.attachments || []).filter((a) => a.kind === 'CITIZEN_PHOTO').map(attachmentView),
    timeline: (c.events || [])
      .filter((e) => CITIZEN_EVENT_TYPES.has(e.type))
      .map((e) => ({ id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, createdAt: e.createdAt })),
  };
}

const person = (u) => (u ? { id: u.id, name: u.name, email: u.email } : null);

export function complaintMunicipalView(c, { detail = false } = {}) {
  const view = {
    ...complaintBase(c),
    citizen: person(c.citizen),
    assignedOfficer: person(c.assignedOfficer),
    photoCount: c._count?.attachments,
    publicHidden: c.publicHidden,
    hiddenReason: c.hiddenReason,
  };
  if (!detail) return view;
  return {
    ...view,
    wardOffice: wardOfficeView(c.ward),
    projectRecord: c.project ? projectRecord(c.project) : null,
    anomalyEvidence: anomalyEvidenceView(c),
    sensorSnapshot: c.sensorSnapshot,
    findings: c.findings,
    correctiveAction: c.correctiveAction,
    attachments: (c.attachments || []).map((a) => ({ ...attachmentView(a), uploadedBy: a.uploadedBy?.name })),
    audit: (c.events || []).map((e) => ({
      id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, note: e.note,
      metadata: e.metadata, createdAt: e.createdAt, actor: e.actor ? { name: e.actor.name, role: e.actor.role } : null,
    })),
  };
}

export const complaintDetailInclude = {
  locality: true,
  site: true,
  ward: true,
  project: true,
  citizen: true,
  assignedOfficer: true,
  anomalyEvaluation: { include: { observation: true } },
  attachments: { orderBy: { createdAt: 'asc' }, omit: { data: true }, include: { uploadedBy: true } },
  events: { orderBy: { createdAt: 'asc' }, include: { actor: true } },
};

// --- Wards and projects (reference data from cited public sources) ---

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

export const wardOfficeView = (w) => (w ? {
  ...wardRef(w),
  address: w.officeAddress, phone: w.officePhone, email: w.officeEmail,
  latitude: w.officeLatitude, longitude: w.officeLongitude,
  sourceUrls: w.sourceUrls ?? [], verifiedOn: isoDate(w.verifiedOn),
} : null);

export const wardView = (w) => ({
  ...wardRef(w), areas: w.areas, note: w.note, pilot: w.pilot, latitude: w.latitude, longitude: w.longitude,
  office: w.pilot ? wardOfficeView(w) : null,
});

export const representativeView = (r) => ({
  role: r.role, name: r.name, party: r.party, constituency: r.constituency, note: r.note,
  sourceUrl: r.sourceUrl, verifiedOn: isoDate(r.verifiedOn),
});

/** What public records say about a project. No measurement of any kind. */
export const projectRecord = (p) => ({
  code: p.code, name: p.name, developer: p.developer, category: p.category, authority: p.authority,
  registrationNo: p.registrationNo, description: p.description, address: p.address,
  latitude: p.latitude, longitude: p.longitude,
  coordinateSource: p.coordinateSource, coordinatePrecision: p.coordinatePrecision,
  proposedCompletion: p.proposedCompletion, status: p.status, statusConfidence: p.statusConfidence,
  sourceUrls: p.sourceUrls ?? [], verifiedOn: isoDate(p.verifiedOn), notes: p.notes,
  ward: wardRef(p.ward),
});

// --- Public (signed-out) complaint view ---

// How far a report has been checked. A report nobody has looked at yet is shown as a
// pin with its status only: its text and photographs become public once it is under review.
const VERIFICATION = { SUBMITTED: 'UNREVIEWED', UNDER_REVIEW: 'IN_REVIEW', INSPECTION_ASSIGNED: 'IN_REVIEW', RESOLVED: 'INSPECTED', REJECTED: 'NOT_UPHELD' };

const round3 = (v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : null);

/**
 * A complaint as anyone may see it: never the citizen, an officer, an internal note or
 * inspection photographs. The pin sits on the named project, or within about 100 m of
 * where the citizen stood.
 */
export function complaintPublicView(c, { detail = false } = {}) {
  const reviewed = c.status !== 'SUBMITTED';
  const closed = c.status === 'RESOLVED' || c.status === 'REJECTED';
  const onProject = c.project?.latitude != null;
  const photos = (c.attachments || []).filter((a) => a.kind === 'CITIZEN_PHOTO');
  const view = {
    reference: complaintReference(c),
    status: c.status,
    verification: VERIFICATION[c.status],
    isDemo: c.isDemo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    latitude: onProject ? c.project.latitude : round3(c.latitude),
    longitude: onProject ? c.project.longitude : round3(c.longitude),
    locationApproximate: !onProject,
    ward: wardRef(c.ward),
    project: c.project ? { code: c.project.code, name: c.project.name } : null,
    description: reviewed ? c.description : null,
    locationText: reviewed ? c.locationText : null,
    photoCount: c._count?.attachments ?? photos.length,
    hasSensorFlag: Boolean(c.anomalyEvaluationId),
  };
  if (!detail) return view;
  return {
    ...view,
    wardOffice: wardOfficeView(c.ward),
    photos: reviewed ? photos.map((a) => ({ id: a.id, url: `/api/public/attachments/${a.id}`, mimeType: a.mimeType })) : [],
    findings: closed ? c.findings : null,
    correctiveAction: closed ? c.correctiveAction : null,
    timeline: (c.events || [])
      .filter((e) => CITIZEN_EVENT_TYPES.has(e.type))
      .map((e) => ({ id: e.id, type: e.type, fromStatus: e.fromStatus, toStatus: e.toStatus, createdAt: e.createdAt })),
  };
}

/** Complaints the public map may show. */
export const publicComplaintWhere = { publicHidden: false, wardId: { not: null } };
