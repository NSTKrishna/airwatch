const IST = 'Asia/Kolkata';

export const fmtNumber = (value, digits = 1, locale = 'en-IN') =>
  (typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '–');

export const fmtDateTime = (value, locale = 'en-IN') =>
  (value ? new Date(value).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: IST }) : '–');

export const fmtTime = (value, locale = 'en-IN') =>
  (value ? new Date(value).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: IST }) : '–');

export const fmtDate = (value, locale = 'en-IN') =>
  (value ? new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: IST }) : '–');

export function fmtRelative(value, locale = 'en-IN') {
  if (!value) return '–';
  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86400), 'day');
}

const RECENT_MS = 15 * 60_000;

/** Minutes since the device last produced a reading, or null when it has never reported. */
export const minutesSince = (latest) => (latest?.site?.timestamp ? Math.floor((Date.now() - new Date(latest.site.timestamp).getTime()) / 60_000) : null);

/** True when the newest reading is too old to describe the present. */
export const isStale = (latest) => Boolean(latest) && Date.now() - new Date(latest.site.timestamp).getTime() > RECENT_MS;

/** flagged | normal | none, from a site's latest observation. */
export function verdictOf(latest) {
  const e = latest?.evaluation;
  if (!e || e.status !== 'EVALUATED' || isStale(latest)) return 'none';
  if (e.isAnomaly && e.active) return 'flagged';
  // An old verdict of either kind is no longer a statement about now.
  if (!e.isAnomaly && Date.now() - new Date(e.evaluatedAt).getTime() < RECENT_MS) return 'normal';
  return 'none';
}

export const STATUS_ORDER = ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED'];

/** Why a site has no current PM10 assessment: a locale key suffix plus its variables. */
export function noAssessmentReason(site) {
  if (site.withheld) return { key: 'WITHHELD' };
  const latest = site.latest;
  if (!latest) return { key: 'NO_DATA' };
  if (isStale(latest)) return { key: 'NO_RECENT_DATA', vars: { minutes: minutesSince(latest) } };
  const e = latest.evaluation;
  if (!e || e.status === 'EVALUATED') return { key: 'NO_DATA' };
  return { key: e.status, vars: { reason: e.reason || '' } };
}

const FEATURE_LABELS = {
  background_value: 'background PM10', temperature_c: 'temperature', humidity_pct: 'humidity', wind_speed_ms: 'wind speed',
  distance_to_background_m: 'station distance', relative_wind_alignment: 'wind alignment',
};
export const domainWarningList = (evaluation) => (evaluation?.domainWarnings || []).map((w) => FEATURE_LABELS[w.feature] || w.feature).join(', ');
