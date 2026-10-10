# Design

Operate-mode product UI. Light theme chosen for the scene: citizens outdoors on phones in daylight, officers at desks.

- **Type:** IBM Plex Sans with IBM Plex Sans Devanagari (one family covering English and Hindi), fixed rem scale, tabular numerals for all measurements (`num` utility).
- **Surfaces:** warm paper `#f5f4ef`, white work surfaces, a second neutral `#ebe9e1` for municipal navigation.
- **Accent:** deep teal `#0b5d57`, used only for primary actions, current selection and links.
- **Status:** flagged ("Unexpected PM10 excess") = red with a warning icon; within range = green with a check; no assessment = neutral with a hatch texture. Always icon plus label, never colour alone. "No assessment" must never look like "normal".
- **Source tags:** every reading carries its source. Simulated = amber with a flask icon; authenticated device = teal with a tower icon. A strip under the header states that the system is a demonstration.
- **Charts:** one y-axis each. Background = blue `#2a78d6`, site = orange `#eb6834`, difference = violet, barrier = dashed ink. Locality colours are fixed per locality.
- **Signature element:** the barrier scale in `client/src/components/Reading.jsx` (observed difference as a bar, barrier as a marker, calibrated margin as a band).
- **Public map:** the citizen home is a full-bleed map on a pale basemap, with ward chips and search floating over it, a Map/List switch, and one primary action in the bottom bar on phones (Report construction dust). Details open as a bottom sheet on phones and a side panel on wide screens, each with its own URL.
- **Map vocabulary:** three shapes that never swap meaning. A pin is a verified project, and its colour is the DEMO monitor's status (the same red, green and hatched neutral as the verdict badges). A disc is a citizen report away from any listed project, coloured by case status. A label pill summarises a ward while zoomed out. Pilot wards are tinted teal; the other wards are a dashed outline.
- **Record and demo tags:** facts from public records carry a teal "Public record" tag with source links and the date checked. Everything simulated or seeded carries the amber flask tag. A demo sensor block sits on an amber wash so it cannot be read as part of the project record.
- Tokens live in `client/src/index.css` under `@theme`.
