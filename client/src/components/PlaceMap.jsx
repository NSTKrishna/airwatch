// A small map for one place: where a report is, or where a new one will go. It uses the
// markers and ward lines of the main map (lib/mapMarkers.js), so a pin or a boundary means
// the same thing on every screen.
import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { GeoJSON, MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import { useApi } from '../lib/useApi.js';
import { WARD_STYLE, projectIcon, reportIcon } from '../lib/mapMarkers.js';

const MUMBAI = [19.1, 72.89];

function Camera({ point, bounds }) {
  const map = useMap();
  const key = point ? `${point.latitude},${point.longitude}` : bounds?.toBBoxString();
  useEffect(() => {
    if (point) map.setView([point.latitude, point.longitude], 15, { animate: false });
    else if (bounds) map.fitBounds(bounds, { padding: [12, 12], animate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/**
 * @param {object} props
 * @param {{latitude: number, longitude: number}|null} [props.project]  drawn as a project square
 * @param {{latitude: number, longitude: number, status?: string, persists?: boolean}|null} [props.report]  drawn as a report pin
 * @param {string|null} [props.wardCode]  the ward the place is in, outlined
 * @param {string[]} [props.pilotCodes]  wards outlined when no ward is chosen yet
 * @param {string} props.label  accessible name of the map
 */
export default function PlaceMap({ project = null, report = null, wardCode = null, pilotCodes = [], label, className = 'h-44' }) {
  const boundaries = useApi('/public/boundaries').data;
  const point = report?.latitude != null ? report : project?.latitude != null ? project : null;
  const bounds = useMemo(() => {
    const codes = wardCode ? [wardCode] : pilotCodes;
    const features = (boundaries?.features || []).filter((f) => codes.includes(f.properties.code));
    return features.length ? L.geoJSON({ type: 'FeatureCollection', features }).getBounds() : null;
  }, [boundaries, wardCode, pilotCodes]);
  const style = (feature) => (feature.properties.code === wardCode ? WARD_STYLE.active
    : pilotCodes.includes(feature.properties.code) ? WARD_STYLE.pilot : WARD_STYLE.other);
  const sameSpot = project && report && Math.abs(project.latitude - report.latitude) < 1e-5 && Math.abs(project.longitude - report.longitude) < 1e-5;

  return (
    <div className={`dust-map overflow-hidden rounded-lg border border-line ${className}`} role="region" aria-label={label}>
      <MapContainer center={MUMBAI} zoom={11} minZoom={10} maxZoom={18} zoomSnap={0.25} scrollWheelZoom={false} zoomControl={false} className="size-full">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
        <Camera point={point} bounds={bounds} />
        {boundaries ? <GeoJSON key={`${wardCode}|${pilotCodes.join()}`} data={boundaries} style={style} interactive={false} /> : null}
        {project?.latitude != null ? <Marker position={[project.latitude, project.longitude]} icon={projectIcon()} interactive={false} keyboard={false} /> : null}
        {report?.latitude != null ? (
          <Marker position={[report.latitude, report.longitude]} interactive={false} keyboard={false} zIndexOffset={500}
            icon={reportIcon({ status: report.status ?? 'SUBMITTED', persists: report.persists, slot: sameSpot ? 1 : 0 })} />
        ) : null}
      </MapContainer>
    </div>
  );
}
