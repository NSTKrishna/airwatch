// Range of each model input in the data the Random Forest was trained on
// (delhi_four_site_pm10_synthetic.csv, the synthetic Delhi demo dataset: minimum
// and maximum over all rows). A forest cannot extrapolate, so an input outside
// these ranges gets the prediction of the nearest training region.
//
// Policy: evaluate anyway, but attach a warning naming each out-of-range input.
// The warning is stored with the evaluation and shown wherever the verdict is shown.
export const TRAINED_DOMAIN = Object.freeze({
  background_value: [28.6, 259.5],
  temperature_c: [5.0, 37.7],
  humidity_pct: [17.0, 96.0],
  wind_speed_ms: [0.1, 6.5],
  distance_to_background_m: [240, 410],
  relative_wind_alignment: [-1, 1],
});

/** @returns {Array<{feature: string, value: number, min: number, max: number}>} */
export function domainWarnings(features) {
  const warnings = [];
  for (const [feature, value] of Object.entries(features || {})) {
    const range = TRAINED_DOMAIN[feature];
    if (!range || typeof value !== 'number') continue;
    if (value < range[0] || value > range[1]) warnings.push({ feature, value, min: range[0], max: range[1] });
  }
  return warnings;
}
