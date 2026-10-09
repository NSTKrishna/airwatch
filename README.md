# AirWatch

Citizen and municipal platform for monitoring construction-site PM10 against a background reading.
An existing Random Forest model estimates the normal site-minus-background difference and adds a
calibrated margin; a reading above that dynamic barrier is flagged for review.

> A flag is evidence for review. It is never a finding that a site broke a rule.
> All sensor readings are currently **simulated**.

## Layout

| Path | What it is |
| --- | --- |
| `adaptive-aqi-model/` | The existing FastAPI model service (git submodule, unmodified) |
| `server/` | Express API, Prisma schema, mock sensors, monitoring pipeline, tests |
| `client/` | React + Vite + Tailwind app (citizen and municipal dashboards) |

## One-time setup

The model service is a git submodule, so clone with `git clone --recurse-submodules` (or run `git submodule update --init` afterwards).

Requires Node 20+, PostgreSQL, and [uv](https://docs.astral.sh/uv/) (or any Python 3.12).

```bash
# 1. Model service environment. scikit-learn must be exactly 1.3.2: the artifact loader rejects other versions.
cd adaptive-aqi-model
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python numpy==1.26.4 pandas==2.1.4 scikit-learn==1.3.2 joblib==1.6.0 \
  "fastapi<1" "pydantic<3" "PyYAML<7" "uvicorn<1" "httpx<1"
cd ..

# 2. Trained artifact (not in git). Copy it from where it was trained:
#    adaptive-aqi-model/models/delhi_pm10_calibrated.joblib
#    Expected SHA-256: c49aad720d9682400f532aa849409d6700ca8d8cfcb7b6df275b309f1daa363c
shasum -a 256 adaptive-aqi-model/models/delhi_pm10_calibrated.joblib

# 3. Dataset (not in git). The sensor feed replays it:
cp /path/to/delhi_four_site_pm10_synthetic.csv server/data/

# 4. Databases and app
createdb airwatch && createdb airwatch_test
cp server/.env.example server/.env      # set DATABASE_URL and a random JWT_SECRET
npm run setup

# 5. With the model service running (see Run), load a week of history and sample complaints
npm --prefix server run data:load
```

If the artifact is unavailable it can be rebuilt with the model repository's own pipeline, which is
deterministic. Write the reports outside the repo so tracked files stay untouched, then confirm the
result with `npm test` (`live-model.test.js` compares it with the published smoke test):

```bash
cd adaptive-aqi-model
.venv/bin/python -m src.run_demo --data /path/to/delhi_four_site_pm10_synthetic.csv \
  --serving-config /tmp/aqi-rebuild/config.yaml --reports /tmp/aqi-rebuild/reports
```

## Run

Three terminals:

```bash
npm run dev:model   # FastAPI on :8001
npm run dev:api     # Express on :4000
npm run dev:web     # Vite on :5173
```

Demo accounts (development seed only):

| Role | Email | Password |
| --- | --- | --- |
| Citizen | `citizen@airwatch.test` | `Citizen@123` |
| Municipal officer | `officer@airwatch.test` | `Officer@123` |
| Municipal inspector | `inspector@airwatch.test` | `Officer@123` |

Public sign-up always creates a citizen. Municipal accounts come from the seed.

To see the whole workflow: sign in as the officer, open **Sensor simulator**, set a site to
"Injected construction dust episode", then sign in as the citizen and report that site.
The dataset also contains its own incidents, so sites get flagged without any override.

## How model integration works

`server/src/services/modelAdapter.js` maps sensor payloads to the FastAPI `/predict` schema
(`background`, `site`, `features`). The measurement contract and the required feature list are read
from `GET /model/info` at runtime.

Before calling the model, the adapter checks units (µg/m³ and mg/m³ are converted, anything else is
rejected), pollutant and averaging period, reading age, timestamp skew, and that every model input is
present. It never imputes a missing value.

Every attempt is stored in `AnomalyEvaluation` with one of four statuses:

| Status | Meaning |
| --- | --- |
| `EVALUATED` | The model answered. Verdict, sensor values, timestamps and model version are stored. |
| `INPUT_REJECTED` | Readings were stale, mismatched or incompatible. The model was not called. |
| `MODEL_UNAVAILABLE` | FastAPI is down or the artifact is not loaded. No verdict exists. |
| `MODEL_ERROR` | FastAPI returned an error or a malformed response. No verdict exists. |

Only `EVALUATED` rows carry a verdict. The UI shows every other status as "No assessment".

## Complaint lifecycle

`Submitted → Under review → Inspection assigned → Resolved`, with `Rejected` available from
Under review or Inspection assigned. Assigning an inspection needs an officer; resolving needs findings
and a corrective action; rejecting needs a reason. Every change writes a `ComplaintEvent` in the same
transaction. Complaints and anomaly evaluations are separate tables; a complaint only references an
evaluation as evidence.

## Tests

```bash
npm test
```

- `adapter.test.js`: request mapping, unit conversion, freshness checks, response validation.
- `workflow.test.js`: the full citizen-to-municipal flow over HTTP against `airwatch_test`, using a
  clearly labelled **test double** of the model service (`test/helpers/modelDouble.js`). The double is
  never used outside the test suite.
- `live-model.test.js`: runs against the real FastAPI service and compares its answer with the model
  repository's published smoke test. Skipped until the artifact is loaded.

## Known limits

- Sensor data is simulated. `SENSOR_PROVIDER=replay` replays the synthetic dataset hour by hour, mapped
  cyclically onto the current date and relabelled with the current time; `mock` generates readings with
  no dataset. A real provider implements the same `getPairedReading(site)` shape.
- History loaded by `data:load` is the dataset run through the real model: each past hour is sent with a
  current timestamp (the model rejects old ones) and stored against the hour it represents.
- The demo complaints created by `data:load` start with "Demo report:" and use placeholder images.
- There is one monitored site per locality, matching the dataset.
- Hindi copy is a first draft and needs review by a native speaker.
- Uploaded images are stored in PostgreSQL (`Attachment.data`), which suits a pilot, not high volume.
- The JWT is kept in `localStorage`; move to an httpOnly cookie before a public launch.
