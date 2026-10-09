import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from 'react-leaflet';

const ICONS = {
  flagged: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v5"/><path d="M12 17h.01"/></svg>',
  normal: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  none: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M7 12h10"/></svg>',
};
const PIN_CLASS = { flagged: 'map-pin-flag', normal: 'map-pin-ok', none: 'map-pin-none' };

const siteIcon = (verdict, selected) => L.divIcon({
  className: '',
  html: `<div class="map-pin ${PIN_CLASS[verdict]} ${selected ? 'map-pin-selected' : ''}">${ICONS[verdict]}</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -30],
  tooltipAnchor: [0, -30],
});

const stationIcon = L.divIcon({
  className: '',
  html: '<div class="map-station"><svg width="10" height="10" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="currentColor"/></svg></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  tooltipAnchor: [0, -12],
});

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
 * @param {{sites: Array<{id: string, name: string, latitude: number, longitude: number, verdict: 'flagged'|'normal'|'none'}>,
 *   stations?: Array<{code: string, name: string, latitude: number, longitude: number}>, selectedId?: string,
 *   onSelect?: (id: string) => void, renderPopup?: (site: object) => React.ReactNode, label: string, className?: string}} props
 */
export default function SiteMap({ sites, stations = [], selectedId, onSelect, renderPopup, label, className = 'h-72' }) {
  const points = useMemo(
    () => [...sites, ...stations].map((p) => [p.latitude, p.longitude]),
    [sites, stations]);
  const fitKey = [...sites.map((s) => s.id), ...stations.map((s) => s.code)].join('|');
  const centre = points[0] || [28.6139, 77.209];
  return (
    <div className={`overflow-hidden rounded-(--radius-card) border border-line ${className}`} role="region" aria-label={label}>
      <MapContainer center={centre} zoom={12} scrollWheelZoom={false} className="size-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <FitBounds points={points} fitKey={fitKey} />
        {stations.map((station) => (
          <Marker key={station.code} position={[station.latitude, station.longitude]} icon={stationIcon} keyboard={false}>
            <Tooltip direction="top">{station.name}</Tooltip>
          </Marker>
        ))}
        {sites.map((site) => (
          <Marker key={`${site.id}-${site.verdict}-${site.id === selectedId}`} position={[site.latitude, site.longitude]}
            icon={siteIcon(site.verdict, site.id === selectedId)} title={site.name} alt={site.name}
            zIndexOffset={site.verdict === 'flagged' ? 500 : 0}
            eventHandlers={onSelect ? { click: () => onSelect(site.id) } : undefined}>
            {renderPopup ? <Popup>{renderPopup(site)}</Popup> : <Tooltip direction="top">{site.name}</Tooltip>}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
