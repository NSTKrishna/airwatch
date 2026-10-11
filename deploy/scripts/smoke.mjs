#!/usr/bin/env node
// Smoke test for a running AirWatch stack. Node 20+, no dependencies.
//
//   node deploy/scripts/smoke.mjs --api https://api.example.com                 read-only checks
//   node deploy/scripts/smoke.mjs --api https://localhost:8443 --full           also walks a case end to end
//
// --full signs in with the demo accounts (DEMO_CITIZEN_PASSWORD and DEMO_OFFICER_PASSWORD in
// the environment), files a report with a photograph, takes it through the official-complaint
// and follow-up steps, and ends with the case closed by the desk and disputed by the resident.
// The case it creates is marked as a smoke test and taken off the public map at the end.
//
//   --require-model   fail unless a fresh simulated reading has a Random Forest assessment
//   --web <url>       also check that the frontend answers and serves the app shell
//   --insecure        accept a self-signed certificate (the local stack's own CA)
//   --wait <seconds>  how long to wait for the stack to become ready (default 120)
import { parseArgs } from 'node:util';

const { values: opt } = parseArgs({
  options: {
    api: { type: 'string' }, web: { type: 'string' }, full: { type: 'boolean', default: false },
    'require-model': { type: 'boolean', default: false }, insecure: { type: 'boolean', default: false },
    wait: { type: 'string', default: '120' },
  },
});
if (!opt.api) {
  console.error('usage: smoke.mjs --api <origin of the API> [--web <origin of the frontend>] [--full] [--require-model] [--insecure]');
  process.exit(2);
}
if (opt.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const API = `${opt.api.replace(/\/+$/, '')}/api`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

let failed = 0;
const pass = (name, detail = '') => console.log(`ok    ${name}${detail ? `  (${detail})` : ''}`);
function fail(name, detail) {
  failed += 1;
  console.log(`FAIL  ${name}  ${detail}`);
}
const check = (name, condition, detail = '') => (condition ? pass(name, detail) : fail(name, detail || 'condition not met'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(method, path, { token, json, form, base = API } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (json) headers['content-type'] = 'application/json';
  const response = await fetch(`${base}${path}`, { method, headers, body: json ? JSON.stringify(json) : form, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  const type = response.headers.get('content-type') || '';
  const body = type.includes('json') ? await response.json() : Buffer.from(await response.arrayBuffer());
  return { status: response.status, body, headers: response.headers };
}

async function untilReady() {
  const deadline = Date.now() + Number(opt.wait) * 1000;
  let last = 'no answer';
  while (Date.now() < deadline) {
    try {
      const ready = await call('GET', '/health/ready');
      if (ready.status === 200) return ready.body;
      last = `HTTP ${ready.status} ${JSON.stringify(ready.body)}`;
    } catch (error) {
      last = error.cause?.code || error.message;
    }
    await sleep(3000);
  }
  throw new Error(`the API at ${API} was not ready after ${opt.wait}s: ${last}`);
}

async function readOnly() {
  const ready = await untilReady();
  pass('API is ready', `database up, photographs in ${ready.attachmentStorage}, model ${ready.modelReady ? 'ready' : 'NOT ready'}`);
  check('attachment store answers', ready.attachmentStorageReady === true);
  if (opt['require-model']) {
    if (ready.modelReady === true) pass('model service is ready');
    else fail('model service is ready', 'modelReady is false: is the artifact in place?');
  }

  if (API.startsWith('https://') && !/\/\/(localhost|127\.0\.0\.1)[:/]/.test(API)) {
    const plain = await call('GET', '/health', { base: API.replace('https://', 'http://') }).catch((error) => ({ status: error.message }));
    check('HTTP redirects to HTTPS', [301, 308].includes(plain.status), `got ${plain.status}`);
  }

  const overview = await call('GET', '/public/overview');
  const pilot = overview.body.wards?.filter((w) => w.pilot) ?? [];
  check('public overview lists the pilot wards', overview.status === 200 && pilot.length >= 1, `${pilot.length} pilot wards, ${overview.body.totals?.projects} projects`);
  check('the stack says it is not an official service', overview.body.official === false);
  const methodology = await call('GET', '/public/methodology');
  check('sensors are declared simulated', methodology.status === 200 && methodology.body.monitoring?.simulated === true && methodology.body.monitoring?.physicalDevices === 0);

  const boundaries = await call('GET', '/public/boundaries');
  check('ward boundaries are served', boundaries.status === 200 && boundaries.body.features?.length > 0, `${boundaries.body.features?.length} wards`);

  const signedOut = await call('GET', '/complaints');
  check('private routes refuse a signed-out caller', signedOut.status === 401, `got ${signedOut.status}`);

  // Simulated ingestion: the worker uploads a reading a minute; the newest one should be recent.
  const deadline = Date.now() + 150_000;
  let monitors = [];
  let fresh = [];
  for (;;) {
    const projects = await call('GET', '/public/projects');
    monitors = (projects.body.projects || []).filter((p) => p.monitor?.latest);
    fresh = monitors.filter((p) => Date.now() - new Date(p.monitor.latest.receivedAt) < 5 * 60_000);
    const assessed = fresh.filter((p) => p.monitor.latest.evaluation?.status === 'EVALUATED');
    if (fresh.length && (!opt['require-model'] || assessed.length)) break;
    if (Date.now() > deadline) break;
    await sleep(10_000);
  }
  check('simulated readings are arriving', fresh.length > 0, `${fresh.length} of ${monitors.length} monitors reported in the last 5 minutes`);
  check('every reading is marked SIMULATED', monitors.every((p) => p.monitor.latest.dataSource === 'SIMULATED' && p.monitor.device.provenance === 'SIMULATED'));
  const assessed = fresh.filter((p) => p.monitor.latest.evaluation?.status === 'EVALUATED');
  if (opt['require-model']) {
    const sample = assessed[0]?.monitor.latest.evaluation;
    check('readings carry a Random Forest assessment', assessed.length > 0,
      sample ? `${assessed.length} assessed; e.g. difference ${Number(sample.observedDifference).toFixed(2)} against barrier ${Number(sample.dynamicBarrier).toFixed(2)}, model ${overview.body.model?.version}` : 'no reading was assessed');
    const flagged = assessed.filter((p) => p.monitor.latest.evaluation.isAnomaly).length;
    pass('PM10 flags on the public map right now', `${flagged} flagged, ${assessed.length - flagged} within range`);
  } else {
    pass('model assessments', `${assessed.length} of ${fresh.length} fresh readings assessed (not required for this run)`);
  }

  if (opt.web) {
    const page = await fetch(opt.web, { signal: AbortSignal.timeout(20_000) });
    const html = await page.text();
    check('frontend serves the app shell', page.ok && html.includes('<div id="root">'), `HTTP ${page.status}`);
    const deep = await fetch(`${opt.web.replace(/\/+$/, '')}/report/AW-2026-00001`, { signal: AbortSignal.timeout(20_000) });
    check('frontend rewrites deep links to the app', deep.ok && (await deep.text()).includes('<div id="root">'), `HTTP ${deep.status}`);
    const cors = await fetch(`${API}/public/overview`, { headers: { origin: new URL(opt.web).origin }, signal: AbortSignal.timeout(20_000) });
    check('the API allows the frontend origin', cors.headers.get('access-control-allow-origin') === new URL(opt.web).origin, `allow-origin: ${cors.headers.get('access-control-allow-origin')}`);
  }
}

// Map -> report -> official complaint -> acknowledgment -> follow-up -> independent outcome.
async function fullWorkflow() {
  const { DEMO_CITIZEN_PASSWORD: citizenPassword, DEMO_OFFICER_PASSWORD: officerPassword } = process.env;
  if (!citizenPassword || !officerPassword) {
    fail('demo accounts', 'set DEMO_CITIZEN_PASSWORD and DEMO_OFFICER_PASSWORD (from the stack\'s env file) to run --full');
    return;
  }
  const login = async (email, password) => (await call('POST', '/auth/login', { json: { email, password } })).body.token;
  const citizen = await login('citizen@airwatch.test', citizenPassword);
  const resident = await login('resident@airwatch.test', citizenPassword);
  const officer = await login('officer@airwatch.test', officerPassword);
  check('demo accounts sign in', Boolean(citizen && resident && officer));
  if (!citizen || !resident || !officer) return;

  const projects = (await call('GET', '/public/projects')).body.projects;
  const project = projects.find((p) => p.monitor) ?? projects[0];
  const form = new FormData();
  form.append('projectCode', project.code);
  form.append('description', '[smoke test] Dust blowing from an uncovered debris pile. Automated check, not a real report.');
  form.append('photos', new Blob([PNG], { type: 'image/png' }), 'smoke.png');
  const created = await call('POST', '/complaints', { token: citizen, form });
  check('citizen files a construction-dust report', created.status === 201, `HTTP ${created.status} ${created.status === 201 ? created.body.complaint.reference : JSON.stringify(created.body)}`);
  if (created.status !== 201) return;
  const { id, reference, ward, attachments } = created.body.complaint;
  check('the report is routed to the project\'s ward office', ward?.slug === project.ward.slug, `ward ${ward?.name}`);

  const photo = await call('GET', attachments[0].url.replace(/^\/api/, ''), { token: citizen });
  check('the photograph reads back from the attachment store', photo.status === 200 && photo.body.equals(PNG));
  const early = await call('GET', `/public/reports/${reference}`);
  check('the report has a public page, text withheld until reviewed', early.status === 200 && early.body.report.description === null);

  const step = (json) => call('POST', `/municipal/complaints/${id}/status`, { token: officer, json });
  check('case desk starts the review', (await step({ status: 'UNDER_REVIEW' })).status === 200);
  const publicPhoto = (await call('GET', `/public/reports/${reference}`)).body.report.photos[0];
  check('the photograph is public once reviewed', (await call('GET', publicPhoto.url.replace(/^\/api/, ''))).status === 200);

  const followUp = (token, fields, files = {}) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, String(value));
    for (const [key, name] of Object.entries(files)) body.append(key, new Blob([PNG], { type: 'image/png' }), name);
    return call('POST', `/complaints/reports/${reference}/follow-ups`, { token, form: body });
  };
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const filed = await followUp(citizen, { kind: 'OFFICIAL_COMPLAINT', officialChannel: 'marg-portal', officialReference: `SMOKE-${Date.now()}-NOT-REAL`, occurredOn: today }, { acknowledgment: 'acknowledgment.png' });
  check('citizen records the official complaint and its acknowledgment', filed.status === 201, `HTTP ${filed.status}`);
  const stateOf = async () => (await call('GET', `/public/reports/${reference}`)).body.report;
  check('official position: filed, not yet checked', (await stateOf()).positions.official.state === 'REPORTED');

  const caseFile = async () => (await call('GET', `/municipal/complaints/${id}`, { token: officer })).body;
  const verify = async (kind) => {
    const entry = (await caseFile()).complaint.followUps.find((f) => f.kind === kind);
    return call('POST', `/municipal/follow-ups/${entry.id}/check`, { token: officer, json: { check: 'VERIFIED', note: 'Smoke test.' } });
  };
  check('moderator checks the acknowledgment', (await verify('OFFICIAL_COMPLAINT')).status === 200);
  check('official position: acknowledgment on record', (await stateOf()).positions.official.state === 'ACKNOWLEDGED');

  const inspector = (await call('GET', '/municipal/officers', { token: officer })).body.officers[0];
  check('desk assigns an inspection', (await step({ status: 'INSPECTION_ASSIGNED', officerId: inspector.id, note: 'Smoke test.' })).status === 200);
  const closed = await step({ status: 'RESOLVED', findings: 'Smoke test closure.', correctiveAction: 'None: automated check.' });
  check('desk closes the case as resolved', closed.status === 200, `HTTP ${closed.status}`);

  const still = await followUp(resident, { kind: 'STILL_UNRESOLVED', note: 'Smoke test: a second resident says the dust is still there.' }, { photos: 'site.png' });
  check('another resident adds a follow-up with a photograph', still.status === 201, `HTTP ${still.status}`);
  const dispute = await followUp(citizen, { kind: 'DISPUTE_CLOSURE', note: 'Smoke test: the reporter disputes the closure.' });
  check('the reporter disputes the closure', dispute.status === 201, `HTTP ${dispute.status}`);
  check('moderator checks the dispute', (await verify('DISPUTE_CLOSURE')).status === 200);

  const final = await stateOf();
  check('three positions stay separate: resolved by the desk, acknowledged by BMC, disputed by residents',
    final.status === 'RESOLVED' && final.positions.official.state === 'ACKNOWLEDGED' && final.positions.citizen.state === 'DISPUTED' && final.positions.citizen.contradictsClosure === true,
    `review ${final.status}, official ${final.positions.official.state}, residents ${final.positions.citizen.state}`);

  const hidden = await call('POST', `/municipal/complaints/${id}/visibility`, { token: officer, json: { hidden: true, reason: 'Automated smoke test' } });
  check('the smoke-test case is taken off the public map', hidden.status === 200 && (await call('GET', `/public/reports/${reference}`)).status === 404);
}

try {
  await readOnly();
  if (opt.full) await fullWorkflow();
} catch (error) {
  fail('smoke test aborted', error.message);
}
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
