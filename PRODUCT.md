# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, Tailwind CSS, React Router, Recharts, React Leaflet; Node.js + Express API; PostgreSQL + Prisma; existing Python FastAPI model service (user-specified).

## Users

- **Citizens** in Mumbai localities (Andheri, Bandra, Kurla, Powai), mostly on phones, often outdoors next to the site they are worried about. They want to know whether dust near them is unusual and to report a site with a photo.
- **Municipal officers**, desk first with the phone as a usable fallback for inspection notes and evidence in the field. They triage reports, assign inspections, and record findings and corrective action.

## Product Purpose

AirWatch receives PM2.5 and PM10 from site monitors and compares a site's PM10 with a nearby background reading. An existing Random Forest model estimates the normal difference and adds a calibrated margin; a difference above that dynamic barrier is flagged as an unexpected PM10 excess for review. Citizens can report a site (with or without a flag); officers work each report through to an outcome.

## Positioning

The barrier adapts to conditions (background level, weather, wind alignment, distance) instead of applying one fixed threshold, and every flag carries the sensor values and model version it came from.

## Operating Context

Complaint lifecycle: Submitted → Under Review → Inspection Assigned → Resolved / Rejected, with an audit entry for every change. Anomaly alerts and citizen complaints are separate records; a complaint may reference an alert as evidence.

## Capabilities and Constraints

- A flag is evidence for review. It is never a finding of a violation, of sensor tampering or failure, or of what caused the dust.
- The model is the synthetic Delhi demo model, not validated for Mumbai. It assesses PM10 only; PM2.5 is stored and shown.
- Site monitors, background PM10 and wind are separate sources. Missing context is reported, never filled in, and simulated context is never paired with a real device's reading.
- This is a demonstration, not an official BMC system.
- No model verdict is shown unless the FastAPI model actually returned one. "No assessment" is a first-class state.
- All eight sites, their devices and all readings are currently simulated; every reading is labelled with its source (simulated or authenticated device).
- The trained model and its calibration are not modified by this product.
- Citizen screens ship in English and Hindi. Hindi copy is a first draft and has not been reviewed by a native speaker (open item). Marathi is not yet offered (open item).
- Municipal screens are English only for now.

## Evidence on Hand

No real sensor feed, no vendor integration, no real construction-site registry, no real complaints. Site names and positions are fictional demo locations in real Mumbai areas. Do not present any of it as measured or official.

## Product Principles

1. Say only what the evidence supports: flagged for review, not guilty.
2. Reporting is never gated on the model.
3. Every decision leaves a trail.
4. Simulated is always labelled simulated.

## Accessibility & Inclusion

Citizen flow must work one-handed on a small phone in daylight; status is never conveyed by colour alone; English and Hindi.
