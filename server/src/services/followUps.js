// The citizen-led side of a case: official complaints filed elsewhere, official responses
// received, and what residents saw on site afterwards. It works without anyone at BMC using
// AirWatch, and it never moves the AirWatch review status.
//
// A case therefore has three positions that are reported separately and never merged:
//   airwatch   what the AirWatch case desk has done (Complaint.status)
//   official   what can be shown of an official BMC complaint, from evidence citizens submitted
//   citizen    what residents observed on site
import { prisma } from '../db.js';
import { DUST_AUTHORITY } from '../data/pilot.js';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors.js';
import { distanceM } from './wards.js';

export const FOLLOW_UP_KINDS = ['OFFICIAL_COMPLAINT', 'OFFICIAL_RESPONSE', 'STILL_UNRESOLVED', 'IMPROVEMENT_OBSERVED', 'DISPUTE_CLOSURE', 'NOTE'];
const OFFICIAL = new Set(['OFFICIAL_COMPLAINT', 'OFFICIAL_RESPONSE']);
const OBSERVATION = new Set(['STILL_UNRESOLVED', 'IMPROVEMENT_OBSERVED', 'DISPUTE_CLOSURE']);
export const CHANNEL_KEYS = [...DUST_AUTHORITY.channels.map((c) => c.key), 'other'];
const channelName = (key) => DUST_AUTHORITY.channels.find((c) => c.key === key)?.name ?? null;

const MAX_PER_AUTHOR_PER_DAY = 10;
const DAY_MS = 86_400_000;
const isClosed = (status) => status === 'RESOLVED' || status === 'REJECTED';
const invalid = (fields) => badRequest('Some fields are invalid', { fields });

/** Field-level problems with a follow-up, by kind. Returns `{}` when it is acceptable. */
export function followUpProblems({ kind, note, occurredOn, officialChannel, officialReference }, { photos, acknowledgments, complaintStatus, now = new Date() }) {
  const fields = {};
  const text = note?.trim() ?? '';
  if (occurredOn && occurredOn.getTime() > now.getTime() + DAY_MS) fields.occurredOn = 'This date is in the future';
  if (kind === 'OFFICIAL_COMPLAINT') {
    if (!officialReference?.trim()) fields.officialReference = 'Enter the complaint or reference number you were given';
    if (!officialChannel) fields.officialChannel = 'Choose where you filed it';
    if (!occurredOn) fields.occurredOn = 'Enter the date you filed it';
  } else if (kind === 'OFFICIAL_RESPONSE') {
    if (text.length < 10) fields.note = 'Say what the response was, in at least 10 characters';
    if (photos + acknowledgments === 0) fields.acknowledgment = 'Attach the reply, notice or a photograph that shows it';
  } else if (kind === 'DISPUTE_CLOSURE') {
    if (!isClosed(complaintStatus)) fields.kind = 'Only a closed case can be disputed';
    if (text.length < 10) fields.note = 'Say why you disagree, in at least 10 characters';
  } else if (kind === 'NOTE') {
    if (text.length < 10) fields.note = 'Write at least 10 characters';
  } else if (photos === 0 && text.length < 10) {
    fields.note = 'Add a photograph or describe what you saw in at least 10 characters';
  }
  if (!OFFICIAL.has(kind) && acknowledgments) fields.acknowledgment = 'An acknowledgment belongs with an official complaint or response';
  return fields;
}

/**
 * Add a follow-up to a case. `rows` are attachment rows without ids (see toAttachmentRows).
 * The audit event is written in the same transaction.
 */
export async function addFollowUp(complaint, author, input, { photoRows = [], acknowledgmentRows = [] } = {}) {
  const fields = followUpProblems(input, { photos: photoRows.length, acknowledgments: acknowledgmentRows.length, complaintStatus: complaint.status });
  if (Object.keys(fields).length) throw invalid(fields);
  const recent = await prisma.followUp.count({ where: { complaintId: complaint.id, authorId: author.id, createdAt: { gte: new Date(Date.now() - DAY_MS) } } });
  if (recent >= MAX_PER_AUTHOR_PER_DAY) throw new HttpError(429, 'You have added many follow-ups to this case today. Please try again tomorrow.');

  return prisma.$transaction(async (tx) => {
    const followUp = await tx.followUp.create({
      data: {
        complaintId: complaint.id, authorId: author.id, kind: input.kind,
        note: input.note?.trim() || null, occurredOn: input.occurredOn ?? null,
        latitude: input.latitude ?? null, longitude: input.longitude ?? null,
        officialChannel: OFFICIAL.has(input.kind) ? input.officialChannel ?? null : null,
        officialReference: input.kind === 'OFFICIAL_COMPLAINT' ? input.officialReference.trim() : null,
      },
    });
    const rows = [...photoRows, ...acknowledgmentRows].map((row) => ({ ...row, complaintId: complaint.id, uploadedById: author.id, followUpId: followUp.id }));
    if (rows.length) await tx.attachment.createMany({ data: rows });
    await tx.complaintEvent.create({
      data: {
        complaintId: complaint.id, actorId: author.id, type: 'FOLLOW_UP_ADDED',
        metadata: { followUpId: followUp.id, kind: followUp.kind, photos: photoRows.length, acknowledgment: acknowledgmentRows.length > 0 },
      },
    });
    return followUp;
  });
}

/**
 * A moderator records whether a follow-up's evidence supports what it states. This is a
 * statement about the evidence submitted. It does not change the AirWatch review status.
 */
export async function checkFollowUp(id, actor, { check, note }) {
  const followUp = await prisma.followUp.findUnique({ where: { id } });
  if (!followUp) throw notFound('Follow-up not found');
  if (check === 'SET_ASIDE' && !note?.trim()) throw badRequest('Give the reason for setting this follow-up aside');
  if (followUp.check === check && (followUp.checkNote ?? '') === (note?.trim() ?? '')) throw conflict('This follow-up already has that result');
  await prisma.$transaction([
    prisma.followUp.update({ where: { id }, data: { check, checkNote: note?.trim() || null, checkedById: actor.id, checkedAt: new Date() } }),
    prisma.complaintEvent.create({
      data: {
        complaintId: followUp.complaintId, actorId: actor.id, type: 'FOLLOW_UP_CHECKED', note: note?.trim() || null,
        metadata: { followUpId: id, kind: followUp.kind, check, previous: followUp.check },
      },
    }),
  ]);
  return followUp.complaintId;
}

const day = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

/**
 * The three positions on a case. Follow-ups a moderator set aside count for nothing.
 * @param {{status: string, events?: Array}} complaint  with `events` when the closing time is wanted
 * @param {Array} followUps
 */
export function positions(complaint, followUps = [], now = new Date()) {
  const live = followUps.filter((f) => f.check !== 'SET_ASIDE').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const closedAt = isClosed(complaint.status)
    ? (complaint.events || []).filter((e) => e.type === 'STATUS_CHANGED' && e.toStatus === complaint.status).at(-1)?.createdAt ?? null
    : null;

  // Official: only a moderator-verified acknowledgment or response moves this beyond "reported".
  const filings = live.filter((f) => f.kind === 'OFFICIAL_COMPLAINT');
  const responses = live.filter((f) => f.kind === 'OFFICIAL_RESPONSE');
  const verified = (list) => list.some((f) => f.check === 'VERIFIED');
  const officialState = verified(responses) ? 'ACTION_DOCUMENTED' : verified(filings) ? 'ACKNOWLEDGED' : filings.length || responses.length ? 'REPORTED' : 'NONE';
  const firstFiled = filings.map((f) => f.occurredOn ?? f.createdAt).sort((a, b) => new Date(a) - new Date(b))[0] ?? null;
  const lastResponse = responses.at(-1) ?? null;

  // Citizen: the most recent thing a resident saw on site.
  const observations = live.filter((f) => OBSERVATION.has(f.kind));
  const latest = observations.at(-1) ?? null;
  const citizenState = !latest ? 'NONE' : { STILL_UNRESOLVED: 'PERSISTS', IMPROVEMENT_OBSERVED: 'IMPROVED', DISPUTE_CLOSURE: 'DISPUTED' }[latest.kind];
  const afterClosure = (f) => closedAt && new Date(f.createdAt) > new Date(closedAt);

  return {
    airwatch: { status: complaint.status, closedAt },
    official: {
      state: officialState,
      filings: filings.length,
      firstFiledOn: day(firstFiled),
      lastResponseOn: lastResponse ? day(lastResponse.occurredOn ?? lastResponse.createdAt) : null,
      // How long an official complaint has gone without a recorded response.
      daysWithoutResponse: firstFiled && !responses.length ? Math.max(0, Math.floor((now - new Date(firstFiled)) / DAY_MS)) : null,
    },
    citizen: {
      state: citizenState,
      verified: latest?.check === 'VERIFIED',
      since: latest?.createdAt ?? null,
      counts: {
        persists: observations.filter((f) => f.kind === 'STILL_UNRESOLVED').length,
        improved: observations.filter((f) => f.kind === 'IMPROVEMENT_OBSERVED').length,
        disputes: observations.filter((f) => f.kind === 'DISPUTE_CLOSURE').length,
        residents: new Set(observations.map((f) => f.authorId)).size,
      },
      // AirWatch closed the case as resolved, and a resident has since said otherwise.
      contradictsClosure: complaint.status === 'RESOLVED' && Boolean(latest) && citizenState !== 'IMPROVED' && Boolean(afterClosure(latest)),
    },
    followUps: live.length,
    unchecked: live.filter((f) => f.check === 'UNCHECKED').length,
  };
}

/** Outcome counts across cases: what happened after reports were filed, not how many were filed. */
export function outcomeCounts(complaints) {
  const totals = { reports: 0, officialComplaints: 0, acknowledged: 0, actionDocumented: 0, followUps: 0, improvementReported: 0, improvementVerified: 0, persisting: 0, disputed: 0, airwatchResolved: 0 };
  for (const c of complaints) {
    const p = positions(c, c.followUps);
    totals.reports += 1;
    totals.followUps += p.followUps;
    if (p.official.state !== 'NONE') totals.officialComplaints += 1;
    if (p.official.state === 'ACKNOWLEDGED' || p.official.state === 'ACTION_DOCUMENTED') totals.acknowledged += 1;
    if (p.official.state === 'ACTION_DOCUMENTED') totals.actionDocumented += 1;
    if (p.citizen.state === 'IMPROVED') totals[p.citizen.verified ? 'improvementVerified' : 'improvementReported'] += 1;
    // A closure a resident contests is counted as disputed, whichever words they used.
    const contested = p.citizen.state === 'DISPUTED' || p.citizen.contradictsClosure;
    if (contested) totals.disputed += 1;
    else if (p.citizen.state === 'PERSISTS') totals.persisting += 1;
    if (c.status === 'RESOLVED') totals.airwatchResolved += 1;
  }
  return totals;
}

const TRACK = (kind) => (OFFICIAL.has(kind) ? 'OFFICIAL' : OBSERVATION.has(kind) ? 'CITIZEN' : 'NOTE');

/** How far from the reported place the citizen stood, to the nearest 50 m. Never the position itself. */
function distanceFromSite(followUp, complaint) {
  const site = complaint.project?.latitude != null ? complaint.project : complaint;
  if (followUp.latitude == null || site.latitude == null) return null;
  return Math.round(distanceM(followUp, site) / 50) * 50;
}

/**
 * A follow-up as anyone may see it. The author is only ever "the reporter" or "another
 * resident". Text and photographs appear once a moderator has verified the entry; an
 * acknowledgment document is never public, only the fact that one was attached.
 */
export function followUpPublicView(f, complaint) {
  const verified = f.check === 'VERIFIED';
  const photos = (f.attachments || []).filter((a) => a.kind === 'FOLLOW_UP_PHOTO');
  return {
    id: f.id,
    kind: f.kind,
    track: TRACK(f.kind),
    by: f.authorId === complaint.citizenId ? 'REPORTER' : 'RESIDENT',
    isDemo: f.isDemo,
    createdAt: f.createdAt,
    occurredOn: day(f.occurredOn),
    check: f.check,
    checkedAt: f.checkedAt,
    checkNote: f.checkNote,
    officialChannel: f.officialChannel ? channelName(f.officialChannel) ?? 'Another official channel' : null,
    officialReference: f.check === 'SET_ASIDE' ? null : f.officialReference,
    note: verified ? f.note : null,
    photoCount: photos.length,
    photos: verified ? photos.map((a) => ({ id: a.id, url: `/api/public/attachments/${a.id}`, mimeType: a.mimeType })) : [],
    hasAcknowledgment: (f.attachments || []).some((a) => a.kind === 'OFFICIAL_ACKNOWLEDGMENT'),
    distanceFromSiteM: distanceFromSite(f, complaint),
  };
}

/** A follow-up as the case desk sees it: everything, including who added it. */
export function followUpMunicipalView(f, complaint) {
  return {
    ...followUpPublicView(f, complaint),
    note: f.note,
    officialReference: f.officialReference,
    officialChannelKey: f.officialChannel,
    latitude: f.latitude,
    longitude: f.longitude,
    author: f.author ? { id: f.author.id, name: f.author.name, email: f.author.email } : null,
    checkedBy: f.checkedBy?.name ?? null,
    attachments: (f.attachments || []).map((a) => ({ id: a.id, kind: a.kind, filename: a.filename, url: `/api/attachments/${a.id}` })),
  };
}

export const followUpInclude = {
  orderBy: { createdAt: 'asc' },
  include: { attachments: { orderBy: { createdAt: 'asc' }, omit: { data: true } }, author: true, checkedBy: true },
};
