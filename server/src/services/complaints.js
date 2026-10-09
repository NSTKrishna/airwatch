// Complaint lifecycle rules and mutations. Every mutation writes an audit event
// in the same transaction as the change it records.
import { prisma } from '../db.js';
import { config } from '../config.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { observationView } from './views.js';

export const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED', 'REJECTED'];
export const TRANSITIONS = Object.freeze({
  SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['INSPECTION_ASSIGNED', 'REJECTED'],
  INSPECTION_ASSIGNED: ['RESOLVED', 'REJECTED'],
  RESOLVED: [],
  REJECTED: [],
});
export const isClosed = (status) => TRANSITIONS[status].length === 0;

/** Pure check. Returns an error message or null. `next` holds the values the complaint would have after the change. */
export function transitionProblem(from, to, next) {
  if (!TRANSITIONS[from]?.includes(to)) {
    return `A complaint cannot move from ${from} to ${to}`;
  }
  if (to === 'INSPECTION_ASSIGNED' && !next.assignedOfficerId) return 'Assign an inspecting officer first';
  if (to === 'RESOLVED' && !(next.findings?.trim() && next.correctiveAction?.trim())) {
    return 'Inspection findings and the corrective action are required to resolve a complaint';
  }
  if (to === 'REJECTED' && !next.note?.trim()) return 'A reason is required to reject a complaint';
  return null;
}

/** Evidence captured automatically when a complaint names a monitored site. */
export async function captureSiteEvidence(siteId) {
  if (!siteId) return { anomalyEvaluationId: null, sensorSnapshot: null };
  const since = new Date(Date.now() - config.activeAnomalyWindowSeconds * 1000);
  const [anomaly, latest] = await Promise.all([
    prisma.anomalyEvaluation.findFirst({
      where: { siteId, status: 'EVALUATED', isAnomaly: true, evaluatedAt: { gte: since } },
      orderBy: { evaluatedAt: 'desc' },
    }),
    prisma.sensorObservation.findFirst({ where: { siteId }, orderBy: { receivedAt: 'desc' }, include: { evaluation: true } }),
  ]);
  return {
    anomalyEvaluationId: anomaly?.id ?? null,
    sensorSnapshot: latest ? { capturedAt: new Date().toISOString(), ...JSON.parse(JSON.stringify(observationView(latest))) } : null,
  };
}

async function requireOfficer(officerId) {
  const officer = await prisma.user.findFirst({ where: { id: officerId, role: 'MUNICIPAL' } });
  if (!officer) throw badRequest('Selected officer does not exist');
  return officer;
}

async function loadComplaint(id) {
  const complaint = await prisma.complaint.findUnique({ where: { id } });
  if (!complaint) throw notFound('Complaint not found');
  return complaint;
}

export async function changeStatus(id, actor, { status: to, note, officerId, findings, correctiveAction }) {
  const complaint = await loadComplaint(id);
  const officer = officerId ? await requireOfficer(officerId) : null;
  const next = {
    assignedOfficerId: officer?.id ?? complaint.assignedOfficerId,
    findings: findings ?? complaint.findings,
    correctiveAction: correctiveAction ?? complaint.correctiveAction,
    note,
  };
  const problem = transitionProblem(complaint.status, to, next);
  if (problem) throw (TRANSITIONS[complaint.status]?.includes(to) ? badRequest(problem) : conflict(problem));

  const data = { status: to };
  if (to === 'INSPECTION_ASSIGNED') data.assignedOfficerId = next.assignedOfficerId;
  if (to === 'RESOLVED') Object.assign(data, { findings: next.findings.trim(), correctiveAction: next.correctiveAction.trim() });
  if (to === 'REJECTED') data.findings = (findings ?? complaint.findings)?.trim() || note.trim();

  await prisma.$transaction(async (tx) => {
    // Guard on the status we validated against so two officers cannot both transition it.
    const updated = await tx.complaint.updateMany({ where: { id, status: complaint.status }, data });
    if (updated.count !== 1) throw conflict('This complaint was just updated by someone else. Reload and try again.');
    if (officer && officer.id !== complaint.assignedOfficerId && to === 'INSPECTION_ASSIGNED') {
      await tx.complaintEvent.create({
        data: { complaintId: id, actorId: actor.id, type: 'OFFICER_ASSIGNED', metadata: { officerId: officer.id, officerName: officer.name } },
      });
    }
    await tx.complaintEvent.create({
      data: {
        complaintId: id, actorId: actor.id, type: 'STATUS_CHANGED', fromStatus: complaint.status, toStatus: to,
        note: note?.trim() || null,
        metadata: to === 'RESOLVED' ? { findings: data.findings, correctiveAction: data.correctiveAction } : undefined,
      },
    });
  });
}

export async function assignOfficer(id, actor, officerId) {
  const complaint = await loadComplaint(id);
  if (isClosed(complaint.status)) throw conflict('Closed complaints cannot be reassigned');
  const officer = await requireOfficer(officerId);
  if (officer.id === complaint.assignedOfficerId) return;
  await prisma.$transaction([
    prisma.complaint.update({ where: { id }, data: { assignedOfficerId: officer.id } }),
    prisma.complaintEvent.create({
      data: { complaintId: id, actorId: actor.id, type: 'OFFICER_ASSIGNED', metadata: { officerId: officer.id, officerName: officer.name } },
    }),
  ]);
}

export async function addNote(id, actor, note) {
  await loadComplaint(id);
  await prisma.complaintEvent.create({ data: { complaintId: id, actorId: actor.id, type: 'NOTE_ADDED', note: note.trim() } });
}

export async function updateFindings(id, actor, { findings, correctiveAction }) {
  const complaint = await loadComplaint(id);
  if (isClosed(complaint.status)) throw conflict('Closed complaints cannot be edited');
  const data = { findings: findings?.trim() || null, correctiveAction: correctiveAction?.trim() || null };
  await prisma.$transaction([
    prisma.complaint.update({ where: { id }, data }),
    prisma.complaintEvent.create({ data: { complaintId: id, actorId: actor.id, type: 'FINDINGS_UPDATED', metadata: data } }),
  ]);
}

export async function addEvidence(id, actor, rows, caption) {
  const complaint = await loadComplaint(id);
  if (isClosed(complaint.status)) throw conflict('Evidence cannot be added to a closed complaint');
  await prisma.$transaction([
    prisma.attachment.createMany({ data: rows }),
    prisma.complaintEvent.create({
      data: {
        complaintId: id, actorId: actor.id, type: 'EVIDENCE_UPLOADED', note: caption || null,
        metadata: { files: rows.map((r) => r.filename) },
      },
    }),
  ]);
}
