# AirWatch

Construction-site dust monitoring for Mumbai neighbourhoods, with a citizen dashboard and a
municipal case-management dashboard.

A site monitor reports PM2.5 and PM10. AirWatch compares the site's PM10 with a background reading;
an existing Random Forest model estimates the normal site-minus-background difference for current
conditions and adds a calibrated margin. A difference above that dynamic barrier is flagged as an
**unexpected PM10 excess** for review.

> **Demonstration system.** The eight monitoring sites, their devices, the background stations and
> all readings are simulated. They are not real measurements, real construction projects or real
> device installations. This is not an official BMC service.
>
> A flag is evidence for review. It is not proof of a rule violation, of sensor tampering or failure,
> or that the site caused the dust.
>
> The model was trained on synthetic Delhi data. It has not been validated for Mumbai or against real
> instruments. It estimates the current normal PM10 difference; it does not forecast AQI and it does
> not assess PM2.5.

## Layout

| Path | What it is |
| --- | --- |
| `adaptive-aqi-model/` | The existing FastAPI model service (git submodule, unmodified) |
| `server/` | Express API, Prisma schema, device ingestion, simulator, pairing, tests |
| `client/` | React + Vite + Tailwind app |
| `deploy/`, `docker-compose.prod.yml`, `amplify.yml` | AWS deployment files (see `docs/DEPLOY_AWS.md`) |

## How data flows

```
device or simulator ──POST /api/v1/devices/readings/batch──▶ ingestion ──▶ DeviceReading (raw, always stored)
                                                                 │
              background provider ──▶ BackgroundObservation ──┐  │
              weather provider ─────▶ WeatherObservation ─────┼──▶ pairing ──▶ model adapter ──▶ FastAPI /predict
                                                              │                                        │
                                              SensorObservation (pairing record) ◀── AnomalyEvaluation ┘
```

- **Devices** report PM2.5, PM10, temperature and humidity. They authenticate with a per-device
  token; only its SHA-256 hash is stored.
- **Background PM10** and **wind** come from separate providers (`server/src/services/providers/`).
  Today both are simulated. Set `BACKGROUND_PROVIDER=none` or `WEATHER_PROVIDER=none` to run without them.
- **Pairing** (`server/src/services/pairing.js`) only combines the three when they are compatible.
  If anything is missing, stale or incompatible the reading is kept and the evaluation records why;
  no value is ever substituted. Simulated context is never paired with a reading from a real device.
- The **simulator** (`server/src/services/mockSensorProvider.js`) is just another device: it uploads
  over HTTP with device credentials and has no database access of its own.

Every evaluation has one of four statuses. Only `EVALUATED` carries a verdict.

| Status | Meaning |
| --- | --- |
| `EVALUATED` | The model answered: flagged or within range, with sensor values, timestamps and model version |
| `INPUT_REJECTED` | Reading invalid, flatlined, stale, or without compatible background/wind. Model not called |
| `MODEL_UNAVAILABLE` | FastAPI is down or the artifact is not loaded |
| `MODEL_ERROR` | FastAPI returned an error or a malformed response |

### Policies worth knowing

- **Measurement scale.** The model contract is `PM10_instantaneous_demo`. Readings sampled over at
  most 60 s (`INSTANT_MAX_INTERVAL_SECONDS`) are treated as instantaneous. Longer averages are stored
  but never sent to the model, and site and background must be in the same class.
- **Freshness and skew** come from the model's own `/model/info` contract (1 h, 60 s).
- **Out-of-domain inputs.** `server/src/services/modelDomain.js` lists the range of each input in the
  training data. If an input falls outside it the model is still called, and the evaluation carries a
  warning naming the input, shown next to the verdict.
- **Flatline.** Ten identical consecutive readings (`FLATLINE_READINGS`) are treated as a stuck sensor.
- **Publication.** A device's readings reach the citizen dashboard only if it is allowed to publish.
  Newly registered physical devices are withheld by default.

## Device API

Authenticate with `Authorization: Bearer <device token>`.

```bash
curl -X POST https://<api-host>/api/v1/devices/readings/batch \
  -H "Authorization: Bearer $DEVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{
    "device_id": "VENDOR-0001",
    "readings": [
      { "timestamp": "2026-10-09T12:00:00Z", "interval_seconds": 60,
        "pm25": 58.4, "pm10": 142.7, "temperature_c": 30.8, "humidity_pct": 76.2,
        "unit": "ug/m3", "status": "OK" }
    ]
  }'
```

`POST /api/v1/devices/readings` takes one reading with the same fields plus `device_id` at the top level.

| Response | When |
| --- | --- |
| `201` | At least one new reading stored. Body lists `accepted`, `duplicates`, `rejected[]`, `evaluations` |
| `200` | Everything was already stored (a retry). Safe to repeat |
| `400` | Malformed body, unknown fields, missing time zone, more than 120 readings |
| `401` / `403` | Missing or unknown token / disabled device or `device_id` mismatch |
| `413` | Body over 256 kB |
| `422` | No reading acceptable (`ALL_READINGS_REJECTED`), with a reason per reading |
| `429` | More than 120 requests a minute from one device |

Per-reading rejection codes: `TIMESTAMP_IN_FUTURE` (more than 2 min ahead), `TIMESTAMP_TOO_OLD`
(more than 7 days), `UNSUPPORTED_UNIT` (`ug/m3` and `mg/m3` are accepted). A reading with a missing,
negative or implausible PM value is **stored** and marked invalid rather than rejected.

Register a physical device as a municipal user (web: **Devices**, or the API). The token is shown once.

```bash
curl -X POST https://<api-host>/api/municipal/devices -H "Authorization: Bearer $OFFICER_JWT" \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"VENDOR-0001","siteId":"<site id>","manufacturer":"Acme","model":"PM-200","ownerName":"Site contractor"}'
```

Also: `GET /api/municipal/devices`, `PATCH /api/municipal/devices/:id` (status, publication, site,
calibration), `POST /api/municipal/devices/:id/rotate-token`.

No vendor integration exists. A vendor that pushes can use the API above directly; one that only
offers a pull API needs a small poller that calls `ingestBatch()`.

## Local setup

Requires Node 20+, PostgreSQL, and [uv](https://docs.astral.sh/uv/) (or any Python 3.12).
Clone with `git clone --recurse-submodules`.

```bash
# 1. Model service environment. scikit-learn must be exactly 1.3.2.
cd adaptive-aqi-model
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python numpy==1.26.4 pandas==2.1.4 scikit-learn==1.3.2 joblib==1.6.0 \
  "fastapi<1" "pydantic<3" "PyYAML<7" "uvicorn<1" "httpx<1"
cd ..

# 2. Trained artifact (not in git): adaptive-aqi-model/models/delhi_pm10_calibrated.joblib

# 3. Databases and app
createdb airwatch && createdb airwatch_test
cp server/.env.example server/.env      # set DATABASE_URL, JWT_SECRET, SIMULATOR_TOKEN_SECRET
npm run setup                           # install, migrate, seed (repeatable, never deletes)
```

Run in three terminals:

```bash
npm run dev:model   # FastAPI on :8001
npm run dev:api     # Express on :4000, with the embedded device simulator
npm run dev:web     # Vite on :5173
```

Optional demo history (a week of simulated readings evaluated by the real model, plus five sample
complaints): `npm --prefix server run data:load`. It refuses to run if the model is not answering.

Development logins: `citizen@airwatch.test` / `Citizen@123`, `officer@airwatch.test` / `Officer@123`,
`inspector@airwatch.test` / `Officer@123`. Public sign-up always creates a citizen.

To see the whole workflow: as the officer open **Sensor simulator**, set a site to "Construction dust
event", then report that site as the citizen and work the complaint from the municipal inbox.

## Tests

```bash
npm test
```

| File | Covers |
| --- | --- |
| `adapter.test.js` | Mapping to the FastAPI schema, units, freshness, response validation |
| `pairing.test.js` | Missing/stale background, missing wind, averaging periods, provenance, flatline, domain |
| `ingestion.test.js` | Mumbai seed, device registration and auth, single and 15-minute batch uploads, duplicates, invalid values, timestamps, publication, PM2.5, model error statuses |
| `workflow.test.js` | Simulator scenarios, complaint creation with evidence, citizen/municipal permissions, lifecycle and audit trail |
| `live-model.test.js` | The real FastAPI model against its published smoke test. Skipped if the artifact is not loaded |

The HTTP tests use a labelled **test double** of the model (`test/helpers/modelDouble.js`). It is not
in the Docker image, and the API refuses to treat a model that identifies itself as `TEST_DOUBLE` as
ready when `NODE_ENV=production`.

## Complaint lifecycle

`Submitted → Under review → Inspection assigned → Resolved`, with `Rejected` from Under review or
Inspection assigned. Every change writes an audit event in the same transaction. Complaints and
evaluations are separate tables; a complaint only references an evaluation as evidence.

## Known limits

- Everything measured is simulated, including background PM10 and wind. With a real device and no
  approved background and wind source, readings are stored and shown but not evaluated.
- The model is the synthetic Delhi demo model. Flags on Mumbai sites demonstrate the mechanism, not accuracy.
- The earlier Delhi prototype's localities, sites and complaints are kept in the database, inactive.
  Their complaints still appear in the municipal inbox.
- Demo history is evaluated with relabelled timestamps (see `server/scripts/load-demo-data.js`).
- Citizen screens are in English and Hindi; the Hindi is a first draft, and Marathi is not yet offered.
- Images are stored in PostgreSQL; the session token is kept in `localStorage`.
