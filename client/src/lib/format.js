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

/** flagged | normal | none, from a site's latest observation. */
export function verdictOf(latest) {
  const e = latest?.evaluation;
  if (!e || e.status !== 'EVALUATED') return 'none';
  if (e.isAnomaly && e.active) return 'flagged';
  // An old verdict of either kind is no longer a statement about now.
  if (!e.isAnomaly && Date.now() - new Date(e.evaluatedAt).getTime() < 15 * 60_000) return 'normal';
  return 'none';
}

export const STATUS_ORDER = ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED'];
