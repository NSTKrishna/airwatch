// The public map. Marker shapes come from lib/mapMarkers.js and mean the same thing on every
// map in the app: a square is a construction project, the badge on it is its DEMO sensor, a
// pin is a citizen report. A label summarises a ward while zoomed out.
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { verdictOf } from '../lib/format.js';
import { WARD_STYLE, projectIcon, reportIcon, reportPersists } from '../lib/mapMarkers.js';

const PIN_ZOOM = 13; // below this, wards are summarised
const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The badge sits on the ward's label point; the text hangs off the side given, so
// neighbouring wards' labels open away from each other.
const wardIcon = (ward, labels, selected, side) => L.divIcon({
  className: '',
  html: `<div class="map-ward map-ward-${side} ${selected ? 'map-ward-selected' : ''}"><b>${escapeHtml(ward.code)}</b><div><strong>${escapeHtml(labels.projects)}</strong><span>${escapeHtml(labels.reports)}</span></div></div>`,
  iconSize: [0, 0],
});

const OPEN = new Set(['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED']);

// A marker opens on click, and on Enter or Space when it has keyboard focus.
const opens = (open) => ({
  click: open,
  keydown: ({ originalEvent: e }) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    open();
  },
});

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
 * @param {{projects: boolean, sensors: boolean, reports: boolean, wards: boolean}} props.show  layers switched on
 * @param {{project: (p: object, sensor: string|null) => string, report: (r: object) => string}} props.describe  accessible marker names
 */
export default function DustMap({ boundaries, wards, projects, reports, selected, wardSlug, inset, onSelect, wardLabels, label, show, describe }) {
  const [zoom, setZoom] = useState(11);
  const layerRef = useRef(null);
  const pilot = useMemo(() => new Map(wards.filter((w) => w.pilot).map((w) => [w.code, w])), [wards]);

  // Reports that name a project share its position, so each takes a place in an arc above
  // the project's square. Open reports take the nearest places.
  const placedReports = useMemo(() => {
    const taken = new Map();
    const open = (r) => (OPEN.has(r.status) ? 0 : 1);
    return [...reports].filter((r) => r.latitude != null).sort((a, b) => open(a) - open(b)).map((r) => {
      if (!r.project) return { report: r, slot: 0 };
      const slot = (taken.get(r.project.code) || 0) + 1;
      taken.set(r.project.code, slot);
      return { report: r, slot };
    });
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
    if (!ward) return WARD_STYLE.other;
    return ward.slug === wardSlug || ward.slug === selectedWard?.slug ? WARD_STYLE.active : WARD_STYLE.pilot;
  };
  // Leaflet keeps the style it was created with; restyle when the selection changes.
  useEffect(() => { layerRef.current?.setStyle(style); });

  // Zoomed out, wards are summarised. Once a ward is chosen its markers always show, however
  // small the screen makes the fitted view.
  const pinsVisible = zoom >= PIN_ZOOM || Boolean(wardSlug);
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

        {boundaries && show.wards ? (
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
              icon={wardIcon(ward, labels, isSelected, side)} title={ward.name} eventHandlers={opens(() => onSelect('ward', ward.slug))} />
          );
        }) : null}

        {pinsVisible && show.projects ? projects.filter((p) => p.latitude != null).map((p) => {
          const sensor = p.monitor && show.sensors ? verdictOf(p.monitor.latest) : null;
          const isSelected = selected?.type === 'project' && selected.id === p.code;
          return (
            <Marker key={`${p.code}-${sensor}-${isSelected}`} position={[p.latitude, p.longitude]}
              icon={projectIcon({ sensor, approximate: !p.monitor, selected: isSelected })}
              title={describe.project(p, sensor)} zIndexOffset={isSelected ? 900 : 100}
              eventHandlers={opens(() => onSelect('project', p.code))}>
              <Tooltip direction="top">{p.name}</Tooltip>
            </Marker>
          );
        }) : null}

        {pinsVisible && show.reports ? placedReports.map(({ report: r, slot }) => {
          const isSelected = selected?.type === 'report' && selected.id === r.reference;
          const persists = reportPersists(r);
          return (
            <Marker key={`${r.reference}-${r.status}-${persists}-${isSelected}-${slot}`} position={[r.latitude, r.longitude]}
              icon={reportIcon({ status: r.status, persists, selected: isSelected, slot })}
              title={describe.report(r)} zIndexOffset={isSelected ? 1000 : OPEN.has(r.status) ? 400 : 300}
              eventHandlers={opens(() => onSelect('report', r.reference))}>
              <Tooltip direction="top">{describe.report(r)}</Tooltip>
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
