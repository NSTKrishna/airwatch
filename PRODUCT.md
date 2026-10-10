# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, Tailwind CSS, React Router, Recharts, React Leaflet; Node.js + Express API; PostgreSQL + Prisma; existing Python FastAPI model service (user-specified).

## Users

- **Citizens** in the pilot wards (K/East, H/East, L and S), mostly on phones, often outdoors next to the site they are worried about, and usually not signed in. They want to know who is building near them, which ward office answers for it, whether dust there is unusual, and what happened to a report.
- **Municipal officers**, desk first with the phone as a usable fallback for inspection notes and evidence in the field. They triage reports, assign inspections, and record findings and corrective action.

## Product Purpose

AirWatch is a public construction-dust accountability map for Mumbai. It shows verified, currently active construction projects taken from public records, the BMC ward office responsible for each place, and the citizen reports filed about them with their full status history. Citizens report construction dust (the only category) with a location, photographs and a description; reviewers work each report through to an outcome on the case desk, and every step shows on the public map.

A status on the AirWatch case desk is AirWatch's own record. To show whether anything really happened, each case carries three positions that are never merged: the AirWatch review, the official BMC complaint, and what residents see on site. The citizen files with BMC themselves from a prepared complaint and the listed official channels, records the reference and acknowledgment, and adds follow-up observations with photographs. Any signed-in resident can add to a public case, so a neighbour or a residents' group can follow up for the reporter. None of this needs anyone at BMC to use AirWatch.

A DEMO monitor stands at each verified project. It receives PM2.5, PM10, temperature and humidity through the same ingestion API a real device would use, and its PM10 is compared with a background reading. An existing Random Forest model estimates the normal difference and adds a calibrated margin; a difference above that dynamic barrier is flagged as an unexpected PM10 excess for review.

## Positioning

The barrier adapts to conditions (background level, weather, wind alignment, distance) instead of applying one fixed threshold, and every flag carries the sensor values and model version it came from.

## Operating Context

Complaint lifecycle: Submitted → Under Review → Inspection Assigned → Resolved / Rejected, with an audit entry for every change. Anomaly alerts and citizen complaints are separate records; a complaint may reference an alert as evidence.

Every report is routed to a ward: by the project it names, else by the citizen's coordinates (point in ward boundary), else by the ward the citizen chose. A report nobody has reviewed is public as a pin and a status only; its text and photographs become public when review starts. A reviewer can take a report off the public map, with a reason, without changing the case.

## Capabilities and Constraints

- A flag is evidence for review. It is never a finding of a violation, of sensor tampering or failure, or of what caused the dust.
- The model is the synthetic Delhi demo model, not validated for Mumbai. It assesses PM10 only; PM2.5 is stored and shown.
- Site monitors, background PM10 and wind are separate sources. Missing context is reported, never filled in, and simulated context is never paired with a real device's reading.
- This is a demonstration, not an official BMC system. Routing happens inside the pilot: no ward office receives anything, and no status is a BMC acknowledgment or action. The interface says so wherever a status is shown.
- Project and ward facts are real and each carries its source URLs and the date it was checked. Sensors and readings are simulated. The two are never presented as the same kind of thing.
- Resolving a case on the AirWatch desk never marks the dust as fixed. The official position moves only on evidence a citizen submitted and a moderator checked, and "on record" means the citizen's copy was checked, never that BMC confirmed anything to AirWatch.
- A follow-up's author is shown only as the reporter or another resident. Uploaded images lose their embedded metadata. An acknowledgment document is never public.
- Elected representatives (corporator, MLA, MP) are listed as representatives only. They are not enforcement authorities and receive nothing from the product.
- Construction dust is the only reporting category in the pilot.
- No model verdict is shown unless the FastAPI model actually returned one. "No assessment" is a first-class state.
- Every device and every reading is currently simulated; every reading is labelled with its source (simulated or authenticated device). A monitor is only attached to a project whose position is known to the street or better.
- The trained model and its calibration are not modified by this product.
- Citizen screens ship in English, Hindi and Marathi. The Hindi and Marathi copy is a first draft and has not been reviewed by a native speaker (open item). Facts quoted from sources (project descriptions, office addresses, department names) stay in the language of the source.
- Municipal screens are English only for now.

## Evidence on Hand

Real: the pilot's construction projects, ward offices, ward boundaries and elected representatives, each from a cited public source (`server/src/data/pilot.js`, `server/src/data/wardBoundaries.json`). Not real: sensors, readings, background and wind data, and the seeded case history, which is stored and shown as demo history. No vendor integration and no link to any BMC system. Do not present anything simulated as measured, or anything recorded here as official.

## Product Principles

1. Say only what the evidence supports: flagged for review, not guilty.
2. Reporting is never gated on the model.
3. Every decision leaves a trail.
4. Simulated is always labelled simulated.
5. No location, name or office detail is shown without a source. What could not be verified is left out.
6. Count outcomes, not submissions: official acknowledgments, documented responses and improvement that residents confirm.

## Accessibility & Inclusion

Citizen flow must work one-handed on a small phone in daylight; status is never conveyed by colour alone; English, Hindi and Marathi.
