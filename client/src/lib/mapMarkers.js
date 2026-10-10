// One marker vocabulary for every map in the app (citizen map, officer overview, case file).
// Each kind of thing has its own shape, so nothing depends on telling two colours apart:
//
//   square            a construction project (public record)
//   badge on a square the DEMO sensor at that project: diamond = flagged, disc = within range,
//                     hatched ring = no assessment
//   pin               a citizen dust report: filled = open, hollow = closed by AirWatch,
//                     with a corner mark when residents say the dust persists
//   ring              a simulated background station (officer maps only)
//
// Every marker sits in a 44 px hit area and carries a white edge and a dark ring, so it
// reads on a light or a dark basemap.
import L from 'leaflet';

const GLYPH = {
  project: '<path d="M5 21V8l7-4 7 4v13"/><path d="M9 21v-5h6v5"/><path d="M9 11h.01M15 11h.01"/>',
  flagged: '<path d="M12 7v6"/><path d="M12 17h.01"/>',
  normal: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  none: '<path d="M7 12h10"/>',
  report: '<path d="M3 11v2l11 4V7L3 11z"/><path d="M14 9.5a3 3 0 0 1 0 5"/><path d="M6 14.5V18h3v-2.5"/>',
  resolved: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  rejected: '<path d="M7 7l10 10M17 7L7 17"/>',
  persists: '<path d="M12 6v7"/><path d="M12 17.5h.01"/>',
};
const svg = (glyph, size, width) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[glyph]}</svg>`;

const HIT = 44;
const icon = (html, anchor = [HIT / 2, HIT / 2]) => L.divIcon({ className: 'mk-icon', html, iconSize: [HIT, HIT], iconAnchor: anchor, tooltipAnchor: [0, -18] });

/**
 * A construction project, with its DEMO sensor status when it has one.
 * @param {{sensor?: 'flagged'|'normal'|'none'|null, approximate?: boolean, selected?: boolean}} options
 *   `sensor: null` draws no badge (no monitor, or the sensor layer is switched off).
 */
export function projectIcon({ sensor = null, approximate = false, selected = false } = {}) {
  const badge = sensor ? `<span class="mk-sensor mk-sensor-${sensor}">${svg(sensor, 11, 3.4)}</span>` : '';
  return icon(`<span class="mk mk-project ${approximate ? 'mk-approximate' : ''} ${selected ? 'mk-selected' : ''}">${svg('project', 16, 2.2)}${badge}</span>`);
}

const CLOSED = { RESOLVED: 'resolved', REJECTED: 'rejected' };

/**
 * A citizen dust report.
 * @param {{status: string, persists?: boolean, selected?: boolean, slot?: number}} options
 *   `slot` fans reports that share a project's position around it (0 = on the point itself).
 */
export function reportIcon({ status, persists = false, selected = false, slot = 0 } = {}) {
  const closed = CLOSED[status];
  const mark = persists ? `<span class="mk-persists">${svg('persists', 10, 3.6)}</span>` : '';
  const html = `<span class="mk mk-report ${closed ? `mk-report-${closed}` : 'mk-report-open'} ${selected ? 'mk-selected' : ''}"><span class="mk-report-glyph">${svg(closed || 'report', 15, closed ? 3 : 2.3)}</span>${mark}</span>`;
  if (!slot) return icon(html, [HIT / 2, HIT - 4]);
  // Reports at a listed project stand in an arc above its square instead of on top of it.
  const angle = (-150 + ((slot - 1) % 5) * 30) * (Math.PI / 180);
  const radius = 34 + Math.floor((slot - 1) / 5) * 26;
  return icon(html, [HIT / 2 - Math.cos(angle) * radius, HIT - 4 - Math.sin(angle) * radius]);
}

/** A simulated background station. */
export const stationIcon = () => icon('<span class="mk mk-station"></span>');

/** Whether residents' follow-up says the problem is still there (a filled corner mark on the pin). */
export const reportPersists = (report) => ['PERSISTS', 'DISPUTED'].includes(report.positions?.citizen.state) || Boolean(report.positions?.citizen.contradictsClosure);

// Ward boundaries: neutral and thin, so they frame the map without competing with markers.
export const WARD_STYLE = {
  pilot: { color: '#44504d', weight: 2, opacity: 0.95, fillColor: '#16201e', fillOpacity: 0.035, className: 'ward-line' },
  active: { color: '#16201e', weight: 3.5, opacity: 1, fillColor: '#16201e', fillOpacity: 0.08, className: 'ward-line' },
  other: { color: '#6f7a77', weight: 1, opacity: 0.85, fillOpacity: 0, dashArray: '2 5', className: 'ward-line' },
};
