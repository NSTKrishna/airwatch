# Design

Operate-mode product UI. Light theme chosen for the scene: citizens outdoors on phones in daylight, officers at desks.

- **Type:** IBM Plex Sans with IBM Plex Sans Devanagari (one family covering English and Hindi), fixed rem scale, tabular numerals for all measurements (`num` utility).
- **Surfaces:** warm paper `#f5f4ef`, white work surfaces, a second neutral `#ebe9e1` for municipal navigation.
- **Accent:** deep teal `#0b5d57`, used only for primary actions, current selection and links.
- **Status:** flagged = red with a warning icon; within range = green with a check; no assessment = neutral with a hatch texture. Always icon plus label, never colour alone. "No assessment" must never look like "normal".
- **Simulated data** is tagged in amber wherever readings appear, and in a strip under the header.
- **Charts:** one y-axis each. Background = blue `#2a78d6`, site = orange `#eb6834`, difference = violet, barrier = dashed ink. Locality colours are fixed per locality.
- **Signature element:** the barrier scale in `client/src/components/Reading.jsx` (observed difference as a bar, barrier as a marker, calibrated margin as a band).
- Tokens live in `client/src/index.css` under `@theme`.
