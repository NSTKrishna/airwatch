// Ward geometry: which BMC administrative ward a point falls in, and the ward a
// citizen report is routed to. Boundaries are reference data (see data/wardBoundaries.json
// for the source and licence); nothing here is estimated when a point is outside them.
import { readFileSync } from 'node:fs';
import { prisma } from '../db.js';

const collection = JSON.parse(readFileSync(new URL('../data/wardBoundaries.json', import.meta.url), 'utf8'));

const polygonsOf = (geometry) => (geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates]);

const shapes = collection.features.map((feature) => {
  const polygons = polygonsOf(feature.geometry);
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lng, lat] of polygons.flatMap((rings) => rings[0])) {
    west = Math.min(west, lng); east = Math.max(east, lng);
    south = Math.min(south, lat); north = Math.max(north, lat);
  }
  return { code: feature.properties.code, polygons, box: { west, south, east, north } };
});

// Ray casting. Ring vertices are [longitude, latitude].
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const inPolygon = (lng, lat, [outer, ...holes]) => inRing(lng, lat, outer) && !holes.some((hole) => inRing(lng, lat, hole));

/** BMC ward code for a point, or null when it is outside every mapped ward. */
export function wardCodeAt(latitude, longitude) {
  for (const shape of shapes) {
    const { west, south, east, north } = shape.box;
    if (longitude < west || longitude > east || latitude < south || latitude > north) continue;
    if (shape.polygons.some((polygon) => inPolygon(longitude, latitude, polygon))) return shape.code;
  }
  return null;
}

export const boundaryCollection = () => collection;
export const boundarySource = () => collection.source ?? null;

/** Ward row for a point, or null. */
export async function wardAt(latitude, longitude) {
  const code = wardCodeAt(latitude, longitude);
  return code ? prisma.ward.findUnique({ where: { code } }) : null;
}

/** The monitoring area that complaints for a pilot ward are filed under. */
export const localityOfWard = (wardId) => prisma.locality.findFirst({ where: { wardId, active: true }, orderBy: { code: 'asc' } });

export function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}
