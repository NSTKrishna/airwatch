// Small map for the officer screens. It draws with the same markers as the citizen map
// (lib/mapMarkers.js): a square is a project with its DEMO sensor badge, a pin is a citizen
// report, a ring is a simulated background station.
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { projectIcon, reportIcon, stationIcon } from '../lib/mapMarkers.js';

function FitBounds({ points, fitKey }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView(points[0], 15);
    else map.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 16 });
    // Refit only when the set of places changes, not on every data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

/**
 * @param {{sites: Array<{id: string, name: string, latitude: number, longitude: number, verdict?: 'flagged'|'normal'|'none', report?: {status: string, persists?: boolean}}>,
 *   stations?: Array<{code: string, name: string, latitude: number, longitude: number}>, selectedId?: string,
 *   onSelect?: (id: string) => void, renderPopup?: (site: object) => React.ReactNode, label: string, className?: string}} props
 *   An entry with `report` is drawn as a citizen report pin; otherwise as a project with its sensor badge.
 */
export default function SiteMap({ sites, stations = [], selectedId, onSelect, renderPopup, label, className = 'h-72' }) {
  const points = useMemo(
    () => [...sites, ...stations].map((p) => [p.latitude, p.longitude]),
    [sites, stations]);
  const fitKey = [...sites.map((s) => s.id), ...stations.map((s) => s.code)].join('|');
  const centre = points[0] || [19.076, 72.8777]; // Mumbai
  return (
    <div className={`dust-map overflow-hidden rounded-(--radius-card) border border-line ${className}`} role="region" aria-label={label}>
      <MapContainer center={centre} zoom={12} scrollWheelZoom={false} className="size-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <FitBounds points={points} fitKey={fitKey} />
        {stations.map((station) => (
          <Marker key={station.code} position={[station.latitude, station.longitude]} icon={stationIcon()} keyboard={false}>
            <Tooltip direction="top">{station.name}</Tooltip>
          </Marker>
        ))}
        {sites.map((site) => {
          const selected = site.id === selectedId;
          const icon = site.report
            ? reportIcon({ status: site.report.status, persists: site.report.persists, selected })
            : projectIcon({ sensor: site.verdict ?? null, selected });
          return (
            <Marker key={`${site.id}-${site.verdict}-${site.report?.status}-${selected}`} position={[site.latitude, site.longitude]}
              icon={icon} title={site.name} zIndexOffset={site.verdict === 'flagged' || site.report ? 500 : 0}
              eventHandlers={onSelect ? { click: () => onSelect(site.id) } : undefined}>
              {renderPopup ? <Popup>{renderPopup(site)}</Popup> : <Tooltip direction="top">{site.name}</Tooltip>}
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}
