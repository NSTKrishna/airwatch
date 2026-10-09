// Context providers for the PM10 model.
//
// A site monitor measures PM2.5, PM10, temperature and humidity. The model also
// needs a background PM10 reading and wind, which come from other sources:
//
//   BackgroundProvider.getObservation(station, at, ctx) -> BackgroundReading | null
//     { pm10, unit, interval_seconds, observed_at, provenance, source, instrument? }
//
//   WeatherProvider.getObservation(station, at, ctx) -> WeatherReading | null
//     { wind_speed_ms, wind_direction_deg, wind_direction_convention ('toward' | 'from'),
//       observed_at, provenance, source }
//
// Returning null means "nothing available for that time". Providers must never
// estimate or carry forward a value to avoid returning null.
//
// Site monitors do not use a pull interface: they (or a vendor gateway acting for
// them) push normalized readings to POST /api/v1/devices/readings/batch. A vendor
// that only offers a pull API would be integrated as a small poller that calls
// ingestBatch() in services/ingestion.js with readings mapped to that contract.
// No vendor integration exists yet.
import { config } from '../../config.js';
import { environmentAt } from '../simulatedEnvironment.js';

const unavailable = (name) => ({ name, provenance: null, description: 'Not configured', async getObservation() { return null; } });

const simulatedBackground = {
  name: 'simulated',
  provenance: 'SIMULATED',
  description: 'Simulated background station (synthetic values)',
  async getObservation(station, at, { scenario } = {}) {
    if (scenario === 'BACKGROUND_OUTAGE') return null;
    const env = environmentAt(station.locality.code, at);
    return {
      pm10: env.background,
      unit: 'ug/m3',
      interval_seconds: 60,
      observed_at: env.observedAt.toISOString(),
      provenance: 'SIMULATED',
      source: 'simulated-background',
      instrument: null,
    };
  },
};

const simulatedWeather = {
  name: 'simulated',
  provenance: 'SIMULATED',
  description: 'Simulated wind (synthetic values)',
  async getObservation(station, at, { scenario } = {}) {
    if (scenario === 'WEATHER_OUTAGE') return null;
    const env = environmentAt(station.locality.code, at);
    return {
      wind_speed_ms: env.windSpeed,
      wind_direction_deg: env.windToward,
      wind_direction_convention: 'toward',
      observed_at: env.observedAt.toISOString(),
      provenance: 'SIMULATED',
      source: 'simulated-weather',
    };
  },
};

export const backgroundProvider = { simulated: simulatedBackground, none: unavailable('none') }[config.backgroundProvider];
export const weatherProvider = { simulated: simulatedWeather, none: unavailable('none') }[config.weatherProvider];
