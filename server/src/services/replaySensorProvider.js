// Sensor source that replays the synthetic Delhi PM10 demo dataset
// (delhi_four_site_pm10_synthetic.csv) as if it were a live feed.
//
// The dataset holds 180 days of hourly readings for one background/site pair per
// locality. The current hour is mapped onto the dataset cyclically, keeping the
// hour of day aligned, and the reading is relabelled with the current time (the
// model repository's own API smoke test does the same). Values are SYNTHETIC:
// nothing here is a real measurement.
import { readFileSync } from 'node:fs';
import { config } from '../config.js';
import { prisma } from '../db.js';
import { DATA_SOURCE, SCENARIOS } from './mockSensorProvider.js';

const HOUR_MS = 3_600_000;
const REQUIRED = ['timestamp_utc', 'location_id', 'background_station_id', 'construction_site_id', 'measurement_type', 'unit',
  'background_value', 'site_value', 'temperature_c', 'humidity_pct', 'wind_speed_ms', 'wind_direction_deg', 'status_label'];

let dataset = null;

function loadDataset() {
  if (dataset) return dataset;
  let text;
  try {
    text = readFileSync(config.datasetCsvPath, 'utf8');
  } catch {
    throw new Error(`SENSOR_PROVIDER=replay needs the dataset CSV at ${config.datasetCsvPath} (set DATASET_CSV_PATH)`);
  }
  const [headerLine, ...lines] = text.trim().split(/\r?\n/);
  const header = headerLine.split(',');
  const missing = REQUIRED.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`Dataset CSV is missing columns: ${missing.join(', ')}`);
  const col = Object.fromEntries(header.map((name, i) => [name, i]));
  const byLocation = new Map();
  let start = Infinity;
  for (const line of lines) {
    const cells = line.split(','); // the dataset has no quoted fields
    const time = Date.parse(cells[col.timestamp_utc].replace(' ', 'T'));
    start = Math.min(start, time);
    const row = {
      time,
      timestampUtc: cells[col.timestamp_utc],
      backgroundSensor: cells[col.background_station_id],
      siteSensor: cells[col.construction_site_id],
      pollutant: cells[col.measurement_type],
      unit: cells[col.unit],
      background: Number(cells[col.background_value]),
      site: Number(cells[col.site_value]),
      temperature: Number(cells[col.temperature_c]),
      humidity: Number(cells[col.humidity_pct]),
      windSpeed: Number(cells[col.wind_speed_ms]),
      windToward: Number(cells[col.wind_direction_deg]), // dataset convention: direction the wind flows toward
      label: cells[col.status_label],
    };
    const key = cells[col.location_id];
    if (!byLocation.has(key)) byLocation.set(key, []);
    byLocation.get(key).push(row);
  }
  for (const rows of byLocation.values()) rows.sort((a, b) => a.time - b.time);
  dataset = { byLocation, startHour: Math.floor(start / HOUR_MS) };
  return dataset;
}

function rowFor(localityCode, at) {
  const { byLocation, startHour } = loadDataset();
  const rows = byLocation.get(localityCode);
  if (!rows) return null;
  const index = (((Math.floor(at.getTime() / HOUR_MS) - startHour) % rows.length) + rows.length) % rows.length;
  return rows[index];
}

function toPair(row, scenario, at) {
  const observedAt = at.toISOString();
  const pair = {
    data_source: DATA_SOURCE,
    simulated: true,
    scenario,
    replayed_from: { dataset: 'delhi_four_site_pm10_synthetic.csv', timestamp_utc: row.timestampUtc, status_label: row.label },
    pollutant: row.pollutant,
    averaging: 'instantaneous',
    background: { sensor_id: row.backgroundSensor, value: row.background, unit: row.unit, observed_at: observedAt },
    site: { sensor_id: row.siteSensor, value: row.site, unit: row.unit, observed_at: observedAt },
    weather: {
      temperature_c: row.temperature,
      humidity_pct: row.humidity,
      wind_speed_ms: row.windSpeed,
      wind_direction_deg: row.windToward,
      wind_direction_convention: 'toward',
      observed_at: observedAt,
    },
  };
  // Operator-injected scenarios sit on top of the dataset reading.
  if (scenario === 'DUST_EVENT') pair.site.value = Math.round((row.site + 80) * 100) / 100;
  if (scenario === 'STALE_SENSOR') pair.site.observed_at = new Date(at.getTime() - 2 * HOUR_MS).toISOString();
  if (scenario === 'INCOMPATIBLE_UNIT') pair.site.unit = 'AQI';
  return pair;
}

export const replaySensorProvider = {
  name: 'replay',
  dataSource: DATA_SOURCE,
  description: 'Replay of the synthetic Delhi PM10 demo dataset (hourly, relabelled with the current time)',
  init: loadDataset,
  /** @param {{id: string, locality: {code: string}}} site */
  async getPairedReading(site, at = new Date(), { ignoreScenario = false } = {}) {
    const row = rowFor(site.locality.code, at);
    if (!row) throw new Error(`Dataset has no readings for locality ${site.locality.code}`);
    let scenario = 'NORMAL';
    if (!ignoreScenario) {
      const state = await prisma.simulatorState.findUnique({ where: { siteId: site.id } });
      if (state && SCENARIOS[state.scenario]) scenario = state.scenario;
    }
    return toPair(row, scenario, at);
  },
};
