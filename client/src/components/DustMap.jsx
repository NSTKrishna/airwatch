// The public map. Three kinds of thing are drawn and they never share a shape:
//   pin    a verified construction project (colour = its DEMO monitor's status)
//   disc   a citizen report that names no listed project
//   label  a ward summary, shown instead of pins while zoomed out
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { verdictOf } from '../lib/format.js';

const PIN_ZOOM = 13; // below this, wards are summarised
const GLYPH = {
  flagged: '<path d="M12 8v5"/><path d="M12 17h.01"/>',
  normal: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  none: '<path d="M7 12h10"/>',
  plain: '<path d="M6 21V8l6-4 6 4v13"/><path d="M10 21v-5h4v5"/>',
  report: '<path d="M3 11v2l11 4V7L3 11z"/><path d="M14 9.5a3 3 0 0 1 0 5"/><path d="M6 14.5V18h3v-2.5"/>',
};
const svg = (glyph, size = 14, width = 3) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${GLYPH[glyph]}</svg>`;
const PIN_CLASS = { flagged: 'map-pin-flag', normal: 'map-pin-ok', none: 'map-pin-none', plain: 'map-pin-plain' };

const projectIcon = (kind, selected, openReports) => L.divIcon({
  className: '',
  html: `<div class="map-pin ${PIN_CLASS[kind]} ${selected ? 'map-pin-selected' : ''}" style="position:relative">${svg(kind, 14, kind === 'plain' ? 2.4 : 3)}${openReports ? `<span class="map-pin-count">${openReports}</span>` : ''}</div>`,
  iconSize: [30, 30], iconAnchor: [15, 30], tooltipAnchor: [0, -30],
});
const reportIcon = (status, selected) => L.divIcon({
  className: '',
  html: `<div class="map-report map-report-${status} ${selected ? 'map-report-selected' : ''}">${svg('report', 13, 2.4)}</div>`,
  iconSize: [26, 26], iconAnchor: [13, 13], tooltipAnchor: [0, -14],
});
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The badge sits on the ward's label point; the text hangs off the side given, so
// neighbouring wards' labels open away from each other.
const wardIcon = (ward, labels, selected, side) => L.divIcon({
  className: '',
  html: `<div class="map-ward map-ward-${side} ${selected ? 'map-ward-selected' : ''}"><b>${escapeHtml(ward.code)}</b><div><strong>${escapeHtml(labels.projects)}</strong><span>${escapeHtml(labels.reports)}</span></div></div>`,
  iconSize: [0, 0],
});

const OPEN = new Set(['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED']);

function ZoomWatcher({ onZoom }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

/** Moves the map when the selection or the ward filter changes, never on a data refresh. */
function Camera({ focus, bounds, inset }) {
  const map = useMap();
  const key = focus ? `p:${focus.latitude},${focus.longitude}` : bounds ? `b:${bounds.toBBoxString()}` : '';
  useEffect(() => {
    if (!key) return;
    // Keep the target clear of the detail panel (right on wide screens, bottom on phones).
    const padding = { paddingTopLeft: [24, 72], paddingBottomRight: [24 + inset.right, 24 + inset.bottom] };
    if (focus) map.flyToBounds(L.latLng(focus.latitude, focus.longitude).toBounds(500), { ...padding, maxZoom: 16, duration: 0.6 });
    else map.flyToBounds(bounds, { ...padding, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * @param {object} props
 * @param {object|null} props.boundaries  GeoJSON of ward boundaries
 * @param {Array} props.wards  overview wards (with counts for pilot wards)
 * @param {Array} props.projects  projects, each with an optional `monitor`
 * @param {Array} props.reports  public reports
 * @param {{type: 'project'|'report'|'ward', id: string}|null} props.selected
 * @param {string|null} props.wardSlug  ward filter
 * @param {{right: number, bottom: number}} props.inset  space covered by the detail panel, px
 * @param {(kind: string, id: string) => void} props.onSelect
 * @param {(ward: object) => {projects: string, reports: string}} props.wardLabels
 */
export default function DustMap({ boundaries, wards, projects, reports, selected, wardSlug, inset, onSelect, wardLabels, label, show }) {
  const [zoom, setZoom] = useState(11);
  const layerRef = useRef(null);
  const pilot = useMemo(() => new Map(wards.filter((w) => w.pilot).map((w) => [w.code, w])), [wards]);

  const openByProject = useMemo(() => {
    const counts = new Map();
    for (const r of reports) if (r.project && OPEN.has(r.status)) counts.set(r.project.code, (counts.get(r.project.code) || 0) + 1);
    return counts;
  }, [reports]);

  const wardBounds = useMemo(() => {
    const out = new Map();
    for (const feature of boundaries?.features || []) out.set(feature.properties.code, L.geoJSON(feature).getBounds());
    return out;
  }, [boundaries]);

  const pilotBounds = useMemo(() => {
    let all = null;
    for (const [code, b] of wardBounds) if (pilot.has(code)) all = all ? all.extend(b) : L.latLngBounds(b.getSouthWest(), b.getNorthEast());
    return all;
  }, [wardBounds, pilot]);

  const filterWard = wards.find((w) => w.slug === wardSlug);
  const focusItem = selected?.type === 'project' ? projects.find((p) => p.code === selected.id)
    : selected?.type === 'report' ? reports.find((r) => r.reference === selected.id) : null;
  const focus = focusItem?.latitude != null ? focusItem : null;
  const selectedWard = selected?.type === 'ward' ? wards.find((w) => w.slug === selected.id) : null;
  const bounds = focus ? null : wardBounds.get((selectedWard || filterWard)?.code) || pilotBounds;

  const style = (feature) => {
    const ward = pilot.get(feature.properties.code);
    const active = ward && (ward.slug === wardSlug || ward.slug === selectedWard?.slug);
    if (!ward) return { color: '#5f6a67', weight: 1.2, opacity: 0.8, fillColor: '#16201e', fillOpacity: 0.02, dashArray: '3 4' };
    return { color: '#0b5d57', weight: active ? 2.5 : 1.5, fillColor: '#0b5d57', fillOpacity: active ? 0.12 : 0.06 };
  };
  // Leaflet keeps the style it was created with; restyle when the selection changes.
  useEffect(() => { layerRef.current?.setStyle(style); });

  const pinsVisible = zoom >= PIN_ZOOM;
  const midLongitude = [...pilot.values()].reduce((sum, w) => sum + (w.longitude ?? 0), 0) / (pilot.size || 1);
  const centre = [19.1, 72.89];

  return (
    <div className="dust-map size-full" role="region" aria-label={label}>
      <MapContainer center={centre} zoom={11} minZoom={10} maxZoom={19} zoomSnap={0.25} zoomControl={false} className="size-full" maxBounds={[[18.85, 72.7], [19.32, 73.1]]} maxBoundsViscosity={0.8}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <ZoomWatcher onZoom={setZoom} />
        <ZoomButtons />
        {bounds || focus ? <Camera focus={focus} bounds={bounds} inset={inset} /> : null}

        {boundaries ? (
          <GeoJSON ref={layerRef} data={boundaries} style={style}
            attribution={boundaries.source ? `Ward boundaries: <a href="${escapeHtml(boundaries.source.url)}">DataMeet</a> (${escapeHtml(boundaries.source.licence.split(' (')[0])})` : undefined}
            onEachFeature={(feature, layer) => {
              const ward = pilot.get(feature.properties.code);
              if (ward) layer.on('click', () => onSelect('ward', ward.slug));
              else layer.bindTooltip(`${feature.properties.name}`, { sticky: true, direction: 'top' });
            }} />
        ) : null}

        {!pinsVisible ? [...pilot.values()].filter((w) => w.latitude != null).map((ward) => {
          const labels = wardLabels(ward);
          const side = ward.longitude < midLongitude ? 'left' : 'right';
          const isSelected = ward.slug === selectedWard?.slug || ward.slug === wardSlug;
          return (
            <Marker key={`${ward.slug}-${labels.projects}-${labels.reports}-${isSelected}`} position={[ward.latitude, ward.longitude]}
              icon={wardIcon(ward, labels, isSelected, side)} title={ward.name} eventHandlers={{ click: () => onSelect('ward', ward.slug) }} />
          );
        }) : null}

        {pinsVisible && show.projects ? projects.filter((p) => p.latitude != null).map((p) => {
          const kind = p.monitor ? verdictOf(p.monitor.latest) : 'plain';
          const isSelected = selected?.type === 'project' && selected.id === p.code;
          const open = openByProject.get(p.code) || 0;
          return (
            <Marker key={`${p.code}-${kind}-${isSelected}-${open}`} position={[p.latitude, p.longitude]} icon={projectIcon(kind, isSelected, open)}
              title={p.name} alt={p.name} zIndexOffset={isSelected ? 900 : kind === 'flagged' ? 500 : 100}
              eventHandlers={{ click: () => onSelect('project', p.code) }}>
              <Tooltip direction="top">{p.name}</Tooltip>
            </Marker>
          );
        }) : null}

        {pinsVisible && show.reports ? reports.filter((r) => !r.project && r.latitude != null).map((r) => {
          const isSelected = selected?.type === 'report' && selected.id === r.reference;
          return (
            <Marker key={`${r.reference}-${r.status}-${isSelected}`} position={[r.latitude, r.longitude]} icon={reportIcon(r.status, isSelected)}
              title={r.reference} alt={r.reference} zIndexOffset={isSelected ? 900 : 0}
              eventHandlers={{ click: () => onSelect('report', r.reference) }}>
              <Tooltip direction="top">{r.reference}</Tooltip>
            </Marker>
          );
        }) : null}
      </MapContainer>
    </div>
  );
}

function ZoomButtons() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.zoom({ position: 'bottomright' });
    control.addTo(map);
    return () => control.remove();
  }, [map]);
  return null;
}
