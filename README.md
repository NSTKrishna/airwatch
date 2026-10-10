# AirWatch

A construction-dust accountability map for Mumbai: a public citizen map of verified construction
projects, the ward office responsible for each, simulated dust monitoring, citizen dust reports and
a municipal case-management dashboard that works each report through to an outcome.

The pilot covers four BMC administrative wards (K/East, H/East, L and S). Mumbai-wide coverage is
the next phase; the other wards are already loaded with their boundaries and are switched on by
adding verified data (see [Reference data](#reference-data)).

A monitor reports PM2.5, PM10, temperature and humidity. AirWatch compares the site's PM10 with a
background reading; an existing Random Forest model estimates the normal site-minus-background
difference for current conditions and adds a calibrated margin. A difference above that dynamic
barrier is flagged as an **unexpected PM10 excess** for review.

> **Demonstration system. Two kinds of information, never mixed.**
>
> *Real, from cited public records:* the construction projects (name, developer, register number,
> position), ward boundaries, ward offices and elected representatives. Each carries its source
> URLs and the date it was checked.
>
> *Simulated:* every monitoring device (all are labelled DEMO), the background stations, wind, and
> all readings. No device is installed at any project, and no project's developer has anything to
> do with them. The seeded case history is demo history and is labelled as such.
>
> This is not an official BMC service. A report is routed to a ward office inside this system only:
> nothing is sent to BMC, and a status recorded here is not a BMC acknowledgment or action.
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
| `server/src/data/` | Reference data: pilot wards, verified projects, representatives, ward boundaries |
| `client/` | React + Vite + Tailwind app: public map, citizen reporting, municipal case desk |
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

## The citizen map

The map at `/` needs no account. It reads `GET /api/public/*`, which exposes only what anyone may
see:

| Endpoint | Returns |
| --- | --- |
| `/public/overview` | Wards with counts, model and sensor status, who handles construction dust |
| `/public/boundaries` | Ward boundaries as GeoJSON |
| `/public/projects`, `/public/projects/:code` | Verified projects, each with its DEMO monitor and latest reading |
| `/public/sites/:id/history?hours=` | PM10, PM2.5, background, temperature, humidity and PM10 flags, up to 7 days |
| `/public/wards/:slug` | Ward office, elected representatives, projects and reports |
| `/public/reports`, `/public/reports/:reference` | Citizen reports and their public status history |
| `/public/locate?lat=&lng=` | The ward a point is in and the projects around it |

Filing a report needs a citizen account, and construction dust is the only category. A report is
routed to a ward by the project it names, else by the citizen's coordinates (point in ward
boundary), else by the ward the citizen chose. Coordinates outside the pilot wards are refused with
the reason.

What the public sees of a report:

- **Not yet reviewed:** a pin and its status. The description and photographs are withheld.
- **Under review onward:** the description, the citizen's photographs and the status history.
- **Closed:** the inspection findings and corrective action, or the reason for rejection.
- **Never:** the citizen, any officer, internal notes or inspection photographs. A report that
  names no project is placed to about 100 m.

A reviewer can take a report off the public map with a reason (`POST
/api/municipal/complaints/:id/visibility`). That is moderation only: the case and its status are
untouched, the citizen still sees it, and the change is written to the audit trail.

## Reference data

Everything about real places lives in two files and reaches the database through the seed:

- `server/src/data/pilot.js`: the pilot wards (office, representatives), the verified projects, and
  who handles construction dust. Every record has `sourceUrls` and `verifiedOn`. A project also
  says how its position was obtained (`coordinateSource`) and how precise it is
  (`coordinatePrecision`: `site`, `street` or `locality`).
- `server/src/data/wardBoundaries.json`: the 24 administrative ward boundaries, built from the
  source named inside the file by `server/scripts/build-ward-boundaries.js`. The source is
  DataMeet's Mumbai ward data, licensed CC BY-SA 2.5 India: the map credits it, and the derived
  file stays under the same licence.

Rules the seed and the tests enforce: a project must lie inside the boundary of the ward it names;
a DEMO monitor is attached only where the position is known to the street or better; a project
with no verified position is listed but not mapped. Nothing is estimated to fill a gap.

To extend the pilot to another ward, add the ward (with its sources) and its verified projects to
`pilot.js` and run `npm --prefix server run db:seed`. The seed creates the monitoring area, a DEMO
monitor and a simulated background station per project. To replace a DEMO monitor with an
authorized real one, register the device against the same site (see below); the simulated stand-in
is switched off automatically.

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

Optional demo history (a week of simulated readings evaluated by the real model, plus labelled demo
cases at the pilot's projects across every stage of the lifecycle): `npm --prefix server run
data:load`. The readings need the model to be answering; `-- --no-readings` loads the case history
alone.

Development logins: `citizen@airwatch.test` / `Citizen@123`, `officer@airwatch.test` / `Officer@123`,
`inspector@airwatch.test` / `Officer@123`. Public sign-up always creates a citizen.

To see the whole workflow: open the map signed out and pick a project. As the officer open **Sensor
simulator** and set that project to "Construction dust event". As the citizen, report dust at the
project, then work the complaint from the municipal inbox and watch its public page
(`/report/AW-...`) follow each step.

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
| `public.test.js` | Public map API, reference-data integrity (sources, projects inside their ward), ward routing, the citizen to case desk to public status loop, what stays private, moderation |
| `live-model.test.js` | The real FastAPI model against its published smoke test. Skipped if the artifact is not loaded |

The HTTP tests use a labelled **test double** of the model (`test/helpers/modelDouble.js`). It is not
in the Docker image, and the API refuses to treat a model that identifies itself as `TEST_DOUBLE` as
ready when `NODE_ENV=production`.

## Complaint lifecycle

`Submitted → Under review → Inspection assigned → Resolved`, with `Rejected` from Under review or
Inspection assigned. Every change writes an audit event in the same transaction. Complaints and
evaluations are separate tables; a complaint only references an evaluation as evidence. Each
complaint records the ward it was routed to and the project it names, and its status changes are
the public status history shown on the map.

## Known limits

- Everything measured is simulated, including background PM10 and wind. With a real device and no
  approved background and wind source, readings are stored and shown but not evaluated.
- Project and ward facts were checked on the dates stored with them and will go stale: completion
  dates slip, officers and representatives change. Nothing refreshes them automatically.
- Elected representatives are listed only where a source confirmed them. They are shown as
  representatives, not as enforcement authorities.
- Ward boundaries are simplified open data, not a legal boundary. A report filed within a few
  metres of a boundary can be routed to the neighbouring ward.
- The model is the synthetic Delhi demo model. Flags on Mumbai sites demonstrate the mechanism, not accuracy.
- Earlier prototypes' localities and fictional demo sites are kept in the database, inactive. Their
  complaints still appear in the municipal inbox and have no ward.
- Demo history is evaluated with relabelled timestamps (see `server/scripts/load-demo-data.js`).
- Citizen screens are in English, Hindi and Marathi. The Hindi and Marathi are first drafts that a
  native speaker has not reviewed. Facts quoted from sources stay in the source's language.
- Images are stored in PostgreSQL; the session token is kept in `localStorage`.
