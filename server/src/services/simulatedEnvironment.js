// A deterministic, entirely SYNTHETIC "world" for the demonstration: background
// PM10, wind, temperature and humidity around each simulated station.
//
// It exists so the simulated devices, the simulated background provider and the
// simulated weather provider agree with each other. Nothing here is a measurement,
// and none of it is ever paired with a reading from a real device.
import { config } from '../config.js';

const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;

// Rough, illustrative PM10 levels. Not derived from any monitoring record.
const BACKGROUND_MEAN = { 'MUM-KE': 118, 'MUM-HE': 96, 'MUM-S': 88, 'MUM-L': 132 };

export function rng(seedText) {
  const text = `${config.simulator.seed}|${seedText}`;
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export const gaussian = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const round2 = (v) => Math.round(v * 100) / 100;
export const floorToMinute = (date) => new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);

function hourly(localityCode, hourSlot) {
  const rand = rng(`env|${localityCode}|${hourSlot}`);
  const localHour = (((hourSlot + 5.5) % 24) + 24) % 24; // IST
  const daily = Math.cos(((localHour - 15) / 24) * 2 * Math.PI); // +1 mid-afternoon
  return {
    background: clamp((BACKGROUND_MEAN[localityCode] ?? 105) * (1 - 0.12 * daily) + 14 * gaussian(rand), 30, 250),
    temperature: clamp(29 + 3 * daily + 0.8 * gaussian(rand), 20, 37),
    humidity: clamp(74 - 10 * daily + 5 * gaussian(rand), 35, 95),
    windSpeed: clamp(2.4 + 0.9 * daily + 0.6 * gaussian(rand), 0.2, 6),
    windToward: rand() * 360,
  };
}

/** Simulated conditions around a station at a given minute. */
export function environmentAt(localityCode, at) {
  const minute = floorToMinute(at);
  const hourSlot = Math.floor(minute.getTime() / HOUR_MS);
  const a = hourly(localityCode, hourSlot);
  const b = hourly(localityCode, hourSlot + 1);
  const f = (minute.getTime() % HOUR_MS) / HOUR_MS;
  const mix = (key) => a[key] + (b[key] - a[key]) * f;
  const jitter = rng(`env-minute|${localityCode}|${minute.getTime()}`);
  return {
    observedAt: minute,
    background: round2(clamp(mix('background') + 0.8 * gaussian(jitter), 25, 260)),
    temperature: round2(mix('temperature') + 0.1 * gaussian(jitter)),
    humidity: round2(clamp(mix('humidity') + 0.4 * gaussian(jitter), 30, 96)),
    windSpeed: round2(clamp(mix('windSpeed') + 0.08 * gaussian(jitter), 0.1, 6.5)),
    // Direction the wind flows toward, degrees clockwise from north. Held for the hour.
    windToward: round2(a.windToward),
  };
}

/** Simulated normal site-minus-background PM10 difference (slow hourly drift plus small minute noise). */
export function siteDifferenceAt(site, localityCode, at) {
  const minute = floorToMinute(at);
  const env = environmentAt(localityCode, minute);
  const hourSlot = Math.floor(minute.getTime() / HOUR_MS);
  const f = (minute.getTime() % HOUR_MS) / HOUR_MS;
  const drift = (slot) => gaussian(rng(`diff|${site.code}|${slot}`));
  const slow = drift(hourSlot) + (drift(hourSlot + 1) - drift(hourSlot)) * f;
  const fast = gaussian(rng(`diff-minute|${site.code}|${minute.getTime()}`));
  const alignment = Math.cos(((env.windToward - site.siteBearingDeg) * Math.PI) / 180);
  return 9 + 0.05 * env.background + 0.07 * env.temperature - 0.013 * env.humidity - 0.85 * env.windSpeed
    + 3.5 * alignment + 3 * slow + 0.8 * fast;
}
