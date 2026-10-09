// HTTP client for the existing FastAPI model service. Read-only: it calls
// GET /health-style metadata and POST /predict and never touches the artifact.
import { config } from '../config.js';
import { describeModelVersion, parsePredictResponse } from './modelAdapter.js';

const INFO_TTL_MS = 15_000;
let cachedInfo = null;
let cachedAt = 0;

async function request(path, init) {
  const response = await fetch(`${config.modelApiUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(config.modelTimeoutMs),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

const detailText = (body) => {
  const detail = body?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => `${(d.loc || []).join('.')}: ${d.msg}`).join('; ');
  return null;
};

/**
 * @returns {Promise<{reachable: boolean, ready: boolean, reason: string|null, measurement?: object,
 *   features?: object[], calibration?: object, algorithm?: string, artifactVersion?: number,
 *   dataSource?: string, syntheticOnly?: boolean, calibratedMargin?: number, version: string|null}>}
 */
export async function getModelInfo({ fresh = false } = {}) {
  if (!fresh && cachedInfo && Date.now() - cachedAt < INFO_TTL_MS) return cachedInfo;
  let info;
  try {
    const { status, body } = await request('/model/info');
    if (status !== 200 || !body || typeof body !== 'object') {
      info = { reachable: true, ready: false, reason: `Model service returned HTTP ${status}`, version: null };
    } else {
      info = {
        reachable: true,
        ready: body.ready === true,
        reason: body.ready === true ? null : body.reason || 'Model is not ready',
        measurement: body.configuration?.measurement,
        features: body.configuration?.features,
        calibration: body.configuration?.calibration,
        algorithm: body.algorithm ?? null,
        artifactVersion: body.artifact_version ?? null,
        dataSource: body.data_source ?? null,
        syntheticOnly: body.synthetic_only ?? null,
        calibratedMargin: body.calibrated_margin ?? null,
      };
      info.version = describeModelVersion(info);
    }
  } catch {
    info = { reachable: false, ready: false, reason: 'Model service is unreachable', version: null };
  }
  cachedInfo = info;
  cachedAt = Date.now();
  return info;
}

/**
 * @returns {Promise<{kind: 'ok', result: object} | {kind: 'unavailable'|'rejected'|'error', reason: string}>}
 */
export async function predict(payload) {
  let status;
  let body;
  try {
    ({ status, body } = await request('/predict', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    }));
  } catch {
    cachedInfo = null;
    return { kind: 'unavailable', reason: 'Model service is unreachable' };
  }
  if (status === 200) {
    const result = parsePredictResponse(body);
    if (!result) return { kind: 'error', reason: 'Model service returned a response that does not match the expected schema' };
    return { kind: 'ok', result };
  }
  if (status === 503) {
    cachedInfo = null;
    return { kind: 'unavailable', reason: detailText(body) || 'Model is not ready' };
  }
  if (status === 422) return { kind: 'rejected', reason: detailText(body) || 'Model rejected the readings' };
  return { kind: 'error', reason: detailText(body) || `Model service returned HTTP ${status}` };
}

export function resetModelInfoCache() {
  cachedInfo = null;
}
