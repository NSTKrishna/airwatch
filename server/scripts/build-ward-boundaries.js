// One-off: turn the source GeoJSON of BMC administrative ward boundaries into the
// compact file the API serves (src/data/wardBoundaries.json).
//
//   node scripts/build-ward-boundaries.js <source.geojson> <source url> <licence> <retrieved YYYY-MM-DD>
//
// Rings are simplified to about 5 m and coordinates rounded to 5 decimals. Each ward gets its
// BMC code, a URL slug, a display name and a label point inside the ward.
import { readFileSync, writeFileSync } from 'node:fs';

const [sourcePath, url, licence, retrieved] = process.argv.slice(2);
if (!sourcePath || !url || !licence || !retrieved) throw new Error('usage: build-ward-boundaries.js <source.geojson> <source url> <licence> <retrieved>');

const TOLERANCE = 0.00005; // degrees, about 5 m
const SUFFIX = { E: 'East', W: 'West', N: 'North', S: 'South', C: 'Central' };
const displayName = (code) => code.replace(/\/([EWNSC])$/, (_, s) => `/${SUFFIX[s]}`);

// Douglas-Peucker on a closed ring of [lng, lat] points.
function simplify(ring) {
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const length = Math.hypot(bx - ax, by - ay) || 1e-12;
    let worst = 0;
    let index = -1;
    // A ring starts and ends on the same point; measure from that point until the ring is split.
    const closed = ax === bx && ay === by;
    for (let i = a + 1; i < b; i += 1) {
      const d = closed ? Math.hypot(ring[i][0] - ax, ring[i][1] - ay)
        : Math.abs((bx - ax) * (ay - ring[i][1]) - (ax - ring[i][0]) * (by - ay)) / length;
      if (d > worst) { worst = d; index = i; }
    }
    if (worst > TOLERANCE) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}

const area = (ring) => ring.reduce((sum, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length];
  return sum + (x * ny - nx * y);
}, 0) / 2;

function centroid(ring) {
  let cx = 0;
  let cy = 0;
  ring.forEach(([x, y], i) => {
    const [nx, ny] = ring[(i + 1) % ring.length];
    const cross = x * ny - nx * y;
    cx += (x + nx) * cross;
    cy += (y + ny) * cross;
  });
  const a = area(ring) * 6;
  return [cx / a, cy / a];
}

const source = JSON.parse(readFileSync(sourcePath, 'utf8'));
const features = source.features.map((feature) => {
  const code = String(feature.properties.name).trim();
  const polygons = (feature.geometry.type === 'MultiPolygon' ? feature.geometry.coordinates : [feature.geometry.coordinates])
    .map((rings) => rings.map(simplify).filter((ring) => ring.length >= 4))
    .filter((rings) => rings.length && Math.abs(area(rings[0])) > 1e-9); // drop slivers
  const largest = polygons.reduce((best, rings) => (Math.abs(area(rings[0])) > Math.abs(area(best[0])) ? rings : best));
  const [lng, lat] = centroid(largest[0]);
  return {
    type: 'Feature',
    properties: { code, slug: code.toLowerCase().replace('/', ''), name: displayName(code), latitude: +lat.toFixed(5), longitude: +lng.toFixed(5) },
    geometry: polygons.length === 1 ? { type: 'Polygon', coordinates: polygons[0] } : { type: 'MultiPolygon', coordinates: polygons },
  };
}).sort((a, b) => a.properties.code.localeCompare(b.properties.code));

const out = {
  type: 'FeatureCollection',
  source: { name: 'BMC administrative ward boundaries', url, licence, retrieved, note: 'Simplified to about 5 m. Not a legal boundary.' },
  features,
};
const target = new URL('../src/data/wardBoundaries.json', import.meta.url);
writeFileSync(target, `${JSON.stringify(out)}\n`);
const points = features.reduce((n, f) => n + JSON.stringify(f.geometry.coordinates).split('],[').length, 0);
console.log(`${features.length} wards, about ${points} vertices, ${(JSON.stringify(out).length / 1024).toFixed(0)} kB`);
