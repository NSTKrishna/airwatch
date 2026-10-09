import { useEffect, useState } from 'react';
import { useApi } from '../../lib/useApi.js';
import { fmtNumber } from '../../lib/format.js';
import { CountBars, LocalityBarChart, LocalityTrendChart } from '../../components/charts.jsx';
import { LoadError, Panel, SimulatedTag, Skeleton } from '../../components/ui.jsx';

const RANGES = [{ hours: 6, label: '6 hours' }, { hours: 24, label: '24 hours' }, { hours: 72, label: '3 days' }, { hours: 168, label: '7 days' }];
const STATUS_LABEL = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', INSPECTION_ASSIGNED: 'Inspection assigned', RESOLVED: 'Resolved', REJECTED: 'Rejected' };

export default function Analytics() {
  const [hours, setHours] = useState(24);
  const { data, error, loading, reload } = useApi(`/municipal/analytics?hours=${hours}`, { pollMs: 60_000 });
  useEffect(() => { document.title = 'Analytics · AirWatch'; }, []);
  const rangeLabel = RANGES.find((r) => r.hours === hours).label;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 flex items-center gap-2 text-[0.875rem] text-ink-2">Concentrations in µg/m³ {data?.simulated ? <SimulatedTag /> : null}</p>
        </div>
        <div role="group" aria-label="Time range" className="inline-flex rounded-lg border border-line-strong bg-surface p-0.5">
          {RANGES.map((r) => (
            <button key={r.hours} type="button" aria-pressed={hours === r.hours} onClick={() => setHours(r.hours)}
              className={`h-8 rounded-md px-3 text-[0.8125rem] font-medium transition-colors duration-150 ${hours === r.hours ? 'bg-accent text-white' : 'text-ink-2 hover:bg-mute-soft'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error && !data ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <><Skeleton className="h-72" /><Skeleton className="h-64" /></> : (
        <>
          <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Panel className="p-4 sm:p-5">
              <h2 className="font-semibold">Average site PM10 over time, by locality</h2>
              <p className="text-[0.8125rem] text-ink-2">Last {rangeLabel}, {data.bucketMinutes}-minute averages</p>
              <div className="mt-3">
                {data.series.length > 4 ? <LocalityTrendChart series={data.series} localities={data.localities} height={280} />
                  : <p className="py-10 text-center text-[0.875rem] text-ink-2">Not enough readings in this range yet.</p>}
              </div>
            </Panel>
            <Panel className="p-4 sm:p-5">
              <h2 className="font-semibold">Site vs background PM10</h2>
              <p className="text-[0.8125rem] text-ink-2">Mean over the last {rangeLabel}</p>
              <div className="mt-3"><LocalityBarChart localities={data.localities} height={280} /></div>
            </Panel>
          </div>

          <Panel className="overflow-hidden">
            <h2 className="px-4 pt-4 font-semibold sm:px-5">Locality summary</h2>
            <p className="px-4 pb-3 text-[0.8125rem] text-ink-2 sm:px-5">Readings from the last {rangeLabel}; complaints are all-time. An anomalous reading is one PM10 evaluation above its dynamic barrier, not a confirmed violation. PM2.5 is not assessed by the model.</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[58rem] text-[0.875rem]">
                <thead className="border-y border-line bg-paper text-[0.75rem] text-ink-2">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left font-medium sm:px-5">Locality</th>
                    {['Background PM10', 'Site PM10', 'Site PM2.5', 'Avg difference', 'Avg barrier', 'Evaluated', 'Anomalous', 'Anomaly rate', 'Not assessed', 'Complaints', 'Open', 'Resolved'].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="num divide-y divide-line">
                  {data.localities.map((l) => (
                    <tr key={l.code}>
                      <th scope="row" className="px-4 py-3 text-left font-medium sm:px-5">{l.name}</th>
                      <td className="px-3 py-3 text-right">{fmtNumber(l.avgBackground)}</td>
                      <td className="px-3 py-3 text-right">{fmtNumber(l.avgSite)}</td>
                      <td className="px-3 py-3 text-right">{fmtNumber(l.avgPm25)}</td>
                      <td className="px-3 py-3 text-right">{fmtNumber(l.avgDifference)}</td>
                      <td className="px-3 py-3 text-right">{fmtNumber(l.avgBarrier)}</td>
                      <td className="px-3 py-3 text-right">{l.evaluated}</td>
                      <td className={`px-3 py-3 text-right ${l.anomalies ? 'font-semibold text-flag' : ''}`}>{l.anomalies}</td>
                      <td className="px-3 py-3 text-right">{l.evaluated ? `${fmtNumber((l.anomalies / l.evaluated) * 100)}%` : '–'}</td>
                      <td className="px-3 py-3 text-right text-ink-2">{l.notAssessed}</td>
                      <td className="px-3 py-3 text-right">{l.complaints.total}</td>
                      <td className="px-3 py-3 text-right">{l.complaints.open}</td>
                      <td className="px-3 py-3 text-right">{l.complaints.resolved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel className="p-4 sm:p-5">
              <h2 className="mb-4 font-semibold">Complaints by status</h2>
              <CountBars rows={Object.entries(data.complaintsByStatus).map(([k, v]) => ({ label: STATUS_LABEL[k], value: v }))} />
            </Panel>
            <Panel className="p-4 sm:p-5">
              <h2 className="mb-4 font-semibold">Anomalous readings by locality</h2>
              <CountBars rows={data.localities.map((l) => ({ label: l.name, value: l.anomalies }))} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
