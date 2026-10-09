// Device credentials. Tokens are random 256-bit values shown once at registration
// (or derived, for simulated devices); only a SHA-256 hash is stored.
import crypto from 'node:crypto';

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
export const generateToken = () => `awd_${crypto.randomBytes(32).toString('hex')}`;
export const tokenHint = (token) => token.slice(-4);

export const deviceView = (d) => ({
  id: d.id,
  deviceId: d.deviceId,
  manufacturer: d.manufacturer,
  model: d.model,
  ownerName: d.ownerName,
  provenance: d.provenance,
  samplingIntervalSeconds: d.samplingIntervalSeconds,
  status: d.status,
  publishAllowed: d.publishAllowed,
  calibratedAt: d.calibratedAt,
  calibrationNote: d.calibrationNote,
  tokenHint: d.tokenHint,
  lastSeenAt: d.lastSeenAt,
  lastReportedStatus: d.lastReportedStatus,
  createdAt: d.createdAt,
  site: d.site ? { id: d.site.id, code: d.site.code, name: d.site.name, locality: d.site.locality?.name } : undefined,
});
