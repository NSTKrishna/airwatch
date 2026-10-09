# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, Tailwind CSS, React Router, Recharts, React Leaflet; Node.js + Express API; PostgreSQL + Prisma; existing Python FastAPI model service (user-specified).

## Users

- **Citizens** in Delhi localities (Rohini, Dwarka, Okhla, Anand Vihar), mostly on phones, often outdoors next to the site they are worried about. They want to know whether dust near them is unusual and to report a site with a photo.
- **Municipal officers**, desk first with the phone as a usable fallback for inspection notes and evidence in the field. They triage reports, assign inspections, and record findings and corrective action.

## Product Purpose

AirWatch compares a construction site's PM10 reading with a nearby background reading. An existing Random Forest model estimates the normal difference and adds a calibrated margin; a reading above that dynamic barrier is flagged as an anomaly for review. Citizens can report a site (with or without a flag); officers work each report through to an outcome.

## Positioning

The barrier adapts to conditions (background level, weather, wind alignment, distance) instead of applying one fixed threshold, and every flag carries the sensor values and model version it came from.

## Operating Context

Complaint lifecycle: Submitted → Under Review → Inspection Assigned → Resolved / Rejected, with an audit entry for every change. Anomaly alerts and citizen complaints are separate records; a complaint may reference an alert as evidence.

## Capabilities and Constraints

- An anomaly is evidence for review, never a finding that a site broke the law.
- No model verdict is shown unless the FastAPI model actually returned one. "No assessment" is a first-class state.
- Sensor data is currently simulated and must be labelled as such wherever it appears.
- The trained model and its calibration are not modified by this product.
- Citizen screens ship in English and Hindi. Hindi copy is a first draft and has not been reviewed by a native speaker (open item).
- Municipal screens are English only for now.

## Evidence on Hand

No real sensor feed, no real construction-site registry, no real complaints. Site names and positions are illustrative. Do not present any of it as measured or official.

## Product Principles

1. Say only what the evidence supports: flagged for review, not guilty.
2. Reporting is never gated on the model.
3. Every decision leaves a trail.
4. Simulated is always labelled simulated.

## Accessibility & Inclusion

Citizen flow must work one-handed on a small phone in daylight; status is never conveyed by colour alone; English and Hindi.
