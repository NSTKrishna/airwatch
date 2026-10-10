// Shared bootstrap for the HTTP test files: model test double, a clean test
// database seeded with the Mumbai reference data, and the real Express app.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { startModelDouble } from './modelDouble.js';

const serverDir = fileURLToPath(new URL('../..', import.meta.url));

// 1x1 PNG.
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const TABLES = ['ComplaintEvent', 'Attachment', 'FollowUp', 'Complaint', 'AnomalyEvaluation', 'SensorObservation', 'DeviceReading', 'IngestionBatch',
  'BackgroundObservation', 'WeatherObservation', 'Device', 'SimulatorState', 'Site', 'Station', 'Locality', 'Project', 'Representative', 'Ward', 'User'];

export async function startStack(extraEnv = {}) {
  const testDbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL.replace(/\/airwatch(\?|$)/, '/airwatch_test$1');
  assert.notEqual(testDbUrl, process.env.DATABASE_URL, 'refusing to run tests against the development database');

  const model = await startModelDouble();
  Object.assign(process.env, {
    NODE_ENV: 'test', DATABASE_URL: testDbUrl, MODEL_API_URL: model.url, SIMULATOR_ENABLED: 'false',
    SIMULATOR_TOKEN_SECRET: 'test-only-simulator-secret-0123456789abcdef', SIMULATOR_SEED: 'test-seed',
    BACKGROUND_PROVIDER: 'simulated', WEATHER_PROVIDER: 'simulated', ...extraEnv,
  });
  delete process.env.SIMULATOR_INGEST_URL;
  const env = { ...process.env };
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { cwd: serverDir, env, stdio: 'pipe' });
  const { prisma } = await import('../../src/db.js');
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(',')} RESTART IDENTITY CASCADE`);
  const seed = () => execFileSync('node', ['prisma/seed.js'], { cwd: serverDir, env, stdio: 'pipe' }).toString();
  seed();

  const { createApp } = await import('../../src/app.js');
  const simulator = await import('../../src/services/mockSensorProvider.js');
  const server = createApp().listen(0);
  const origin = `http://127.0.0.1:${server.address().port}`;
  simulator.setIngestBaseUrl(origin);
  const base = `${origin}/api`;

  async function api(method, path, { token, json, form, raw, headers: extra } = {}) {
    const headers = { ...extra };
    if (token) headers.authorization = `Bearer ${token}`;
    if (json !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
    const response = await fetch(`${base}${path}`, { method, headers, body: raw ?? (json !== undefined ? JSON.stringify(json) : form) });
    const type = response.headers.get('content-type') || '';
    return { status: response.status, body: type.includes('json') ? await response.json() : await response.arrayBuffer(), headers: response.headers };
  }

  const login = async (email, password) => (await api('POST', '/auth/login', { json: { email, password } })).body.token;
  const tokens = {
    citizen: await login('citizen@airwatch.test', 'Citizen@123'),
    officer: await login('officer@airwatch.test', 'Officer@123'),
  };
  const sites = await prisma.site.findMany({ include: { devices: true, locality: true, project: true }, orderBy: { code: 'asc' } });
  // The seeded places come from the pilot's reference data, so tests address them by position:
  // the n-th monitored project of the w-th pilot ward (both in code order).
  const localityCodes = [...new Set(sites.map((s) => s.locality.code))];
  const siteIn = (w, n = 0) => {
    const site = sites.filter((s) => s.locality.code === localityCodes[w])[n];
    assert.ok(site, `the pilot data needs a monitored project ${n + 1} in ward ${w + 1}`);
    return site;
  };

  return {
    api, model, prisma, tokens, sites, siteIn, localityCodes, simulator, seed,
    resetModelCache: async () => (await import('../../src/services/modelClient.js')).resetModelInfoCache(),
    async close() {
      server.close();
      await prisma.$disconnect();
      await model.close();
    },
  };
}

export function complaintForm(fields, files = [{ name: 'dust.png', data: PNG, type: 'image/png' }]) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, String(v));
  for (const f of files) form.append('photos', new Blob([f.data], { type: f.type }), f.name);
  return form;
}
