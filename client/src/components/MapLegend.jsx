// What the map's shapes mean. On the citizen map each row is also a layer switch; on the
// officer maps the same rows are shown as a plain key.
import { projectIcon, reportIcon, stationIcon } from '../lib/mapMarkers.js';
import { useI18n } from '../lib/i18n.jsx';

// The swatches are the real markers, so the key can never drift from the map.
const Swatch = ({ icon }) => <span className="mk-swatch" aria-hidden dangerouslySetInnerHTML={{ __html: icon.options.html }} />;
const sensorOnly = (state) => ({ options: { html: projectIcon({ sensor: state }).options.html.match(/<span class="mk-sensor[\s\S]*?<\/span>/)[0] } });

export const LEGEND_ROWS = [
  { layer: 'projects', label: 'legend.project', swatches: [projectIcon()],
    detail: [{ label: 'legend.projectApprox', icon: projectIcon({ approximate: true }) }] },
  { layer: 'sensors', label: 'legend.sensor', swatches: [],
    detail: [
      { label: 'legend.sensor.flagged', icon: sensorOnly('flagged') },
      { label: 'legend.sensor.normal', icon: sensorOnly('normal') },
      { label: 'legend.sensor.none', icon: sensorOnly('none') },
    ] },
  { layer: 'reports', label: 'legend.report', swatches: [reportIcon({ status: 'SUBMITTED' })],
    detail: [
      { label: 'legend.report.closed', icon: reportIcon({ status: 'RESOLVED' }) },
      { label: 'legend.report.persists', icon: reportIcon({ status: 'SUBMITTED', persists: true }) },
    ] },
  { layer: 'wards', label: 'legend.ward', swatches: [], line: true, detail: [] },
  { layer: 'stations', label: 'legend.station', swatches: [stationIcon()], detail: [] },
];

/**
 * @param {{layers: string[], show?: Record<string, boolean>, onToggle?: (layer: string, on: boolean) => void, children?: React.ReactNode}} props
 *   With `onToggle`, each row has a checkbox that shows or hides that layer.
 */
export default function MapLegend({ layers, show, onToggle, children }) {
  const { t } = useI18n();
  return (
    <ul className="space-y-1 text-[0.8125rem] text-ink">
      {LEGEND_ROWS.filter((row) => layers.includes(row.layer)).map((row) => {
        const head = (
          <>
            {row.line ? <span className="mk-swatch" aria-hidden><span className="mk-swatch-line" /></span> : row.swatches.map((icon, i) => <Swatch key={i} icon={icon} />)}
            <span className="font-medium">{t(row.label)}</span>
          </>
        );
        return (
          <li key={row.layer}>
            {onToggle ? (
              <label className="flex min-h-10 cursor-pointer items-center gap-2 sm:min-h-8">
                <input type="checkbox" className="size-4 shrink-0 accent-(--color-ink)" checked={show[row.layer]} onChange={(e) => onToggle(row.layer, e.target.checked)} />
                {head}
              </label>
            ) : <div className="flex items-center gap-2">{head}</div>}
            {row.detail.length ? (
              <ul className={`text-[0.75rem] text-ink-2 ${onToggle ? 'pl-6' : ''}`}>
                {row.detail.map((d) => <li key={d.label} className="flex items-center gap-2"><Swatch icon={d.icon} />{t(d.label)}</li>)}
              </ul>
            ) : null}
          </li>
        );
      })}
      {children}
    </ul>
  );
}
