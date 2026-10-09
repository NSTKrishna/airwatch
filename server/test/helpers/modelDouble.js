// TEST DOUBLE for the FastAPI model service. It reproduces the HTTP contract of
// adaptive-aqi-model (api/main.py, api/schemas.py, src/barrier.py) with a fixed
// "expected difference" instead of the Random Forest, so the workflow test can
// run without the trained artifact. It exists only inside the test suite and
// identifies itself as TEST_DOUBLE in every stored model version.
import http from 'node:http';

const MEASUREMENT = { type: 'PM10', unit: 'ug/m3', scale_id: 'PM10_instantaneous_demo', max_age_seconds: 3600, max_timestamp_skew_seconds: 60, max_future_seconds: 5 };
const FEATURES = ['background_value', 'temperature_c', 'humidity_pct', 'wind_speed_ms', 'distance_to_background_m', 'relative_wind_alignment'];
const EXPECTED = 14;
const MARGIN = 16; // generous so only injected dust events cross the barrier

export async function startModelDouble() {
  const state = { ready: true, predictCalls: [], failNext: null };
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'GET' && req.url === '/model/info') {
      return send(200, {
        ready: state.ready,
        reason: state.ready ? null : 'Model artifact is missing',
        configuration: {
          measurement: MEASUREMENT,
          features: FEATURES.map((name) => ({ name, source: name, transform: 'identity' })),
          preprocessing: { imputation: null },
          calibration: { method: 'residual_quantile', quantile: 0.95, min_samples: 100 },
        },
        algorithm: state.ready ? 'TEST_DOUBLE' : null,
        artifact_version: state.ready ? 1 : null,
        data_source: state.ready ? 'TEST_DOUBLE' : null,
        synthetic_only: state.ready ? true : null,
        calibrated_margin: state.ready ? MARGIN : null,
      });
    }
    if (req.method === 'POST' && req.url === '/predict') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        if (!state.ready) return send(503, { detail: 'Model artifact is missing' });
        const body = JSON.parse(raw);
        state.predictCalls.push(body);
        // One-shot failure injection for error-path tests.
        if (state.failNext) {
          const mode = state.failNext;
          state.failNext = null;
          return mode === 'malformed' ? send(200, { is_anomaly: 'yes' }) : send(mode, { detail: 'Model pipeline could not produce a valid prediction' });
        }
        const extra = Object.keys(body).filter((k) => !['background', 'site', 'features'].includes(k));
        if (extra.length || FEATURES.some((f) => typeof body.features?.[f] !== 'number')) return send(422, { detail: 'Schema mismatch' });
        const difference = body.site.value - body.background.value;
        send(200, {
          observed_difference: difference,
          expected_normal_difference: EXPECTED,
          calibrated_margin: MARGIN,
          dynamic_barrier: EXPECTED + MARGIN,
          is_anomaly: difference > EXPECTED + MARGIN,
          measurement_type: MEASUREMENT.type, unit: MEASUREMENT.unit, scale_id: MEASUREMENT.scale_id,
          background_timestamp: body.background.timestamp, site_timestamp: body.site.timestamp,
          interpretation: 'Evidence for review; not proof of a construction violation',
          data_source: 'TEST_DOUBLE', synthetic_only: true,
        });
      });
      return undefined;
    }
    return send(404, { detail: 'Not Found' });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { state, url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((r) => server.close(r)) };
}
