// Plain-text versions of a case, for use outside AirWatch: the complaint a citizen files
// with BMC, and the message that shares a case link.

export const caseUrl = (reference) => `${window.location.origin}/report/${reference}`;

const placeOf = (report, t) => report.project?.name || report.locationText || t('pub.unlisted');

/**
 * A complaint ready to paste into an official channel. Everything in it comes from the case:
 * the place, the project's public record, the responsible ward office and BMC's own rules.
 * @param {object} report  a report view; `description` may be null when the viewer is not the reporter
 */
export function complaintDraft({ report, wardOffice, authority, t, locale }) {
  const date = new Date(report.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
  const p = report.project;
  const point = p?.latitude != null ? p : report.latitude != null ? report : null;
  const lines = [
    t('draft.to', { ward: report.ward?.name ?? '' }),
    wardOffice?.address ?? null,
    '',
    t('draft.subject', { place: placeOf(report, t) }),
    '',
    t('draft.observed', { date }),
    placeOf(report, t),
    p?.address ?? null,
    p?.developer ? t('draft.developer', { developer: p.developer }) : null,
    p?.registrationNo ? t('draft.register', { authority: p.authority, registration: p.registrationNo }) : null,
    point ? t('draft.map', { url: `https://www.openstreetmap.org/?mlat=${point.latitude}&mlon=${point.longitude}#map=18/${point.latitude}/${point.longitude}` }) : null,
    '',
    t('draft.what'),
    report.description || t('draft.describe'),
    '',
    t('draft.photos'),
    '',
    ...(authority?.requirements?.length ? [t('draft.rules'), ...authority.requirements.slice(0, 4).map((line) => `- ${line}`), ''] : []),
    t('draft.request'),
    '',
    t('draft.record', { url: caseUrl(report.reference) }),
    t('draft.recordNote'),
  ];
  return lines.filter((line) => line !== null).join('\n');
}

/** One message that says where the case stands on all three counts and links to it. */
export function shareText({ report, t }) {
  const p = report.positions;
  return t('share.text', {
    reference: report.reference,
    place: placeOf(report, t),
    airwatch: t(`status.${report.status}`),
    official: t(`case.official.${p.official.state}`),
    citizen: t(`case.citizen.${p.citizen.state}`),
    url: caseUrl(report.reference),
  });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and insecure origins: fall back to a hidden field.
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.append(field);
    field.select();
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  }
}
