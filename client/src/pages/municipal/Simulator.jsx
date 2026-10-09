import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { LoadError, Notice, Panel, Skeleton } from '../../components/ui.jsx';

const RESULT_TEXT = {
  EVALUATED: (r) => (r.isAnomaly ? 'Reading uploaded; the model flagged an unexpected PM10 excess' : 'Reading uploaded; the model found it within the expected range'),
  INPUT_REJECTED: (r) => `Reading uploaded and stored, not assessed: ${r.reason}`,
  MODEL_UNAVAILABLE: () => 'Reading uploaded and stored; the model is unavailable, so there is no assessment',
  MODEL_ERROR: () => 'Reading uploaded and stored; the model returned an error, so there is no assessment',
};
const describe = (r) => {
  if (r.notSent) return 'Nothing uploaded: the simulated device is offline';
  if (!r.evaluationStatus) return 'Applies from the next reading';
  return RESULT_TEXT[r.evaluationStatus](r);
};

export default function Simulator() {
  const { data, error, loading, reload } = useApi('/municipal/simulator');
  const [pending, setPending] = useState(null);
  const [results, setResults] = useState({});
  const [failure, setFailure] = useState(null);
  useEffect(() => { document.title = 'Sensor simulator · AirWatch'; }, []);

  const change = async (siteId, scenario) => {
    setPending(siteId);
    setFailure(null);
    try {
      const result = await api.put(`/municipal/simulator/sites/${siteId}`, { scenario });
      setResults((r) => ({ ...r, [siteId]: result }));
      await reload();
    } catch (err) {
      setFailure(err.message);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sensor simulator</h1>
        <p className="mt-1 max-w-[70ch] text-ink-2">
          Each demo site has a simulated monitor that uploads PM2.5, PM10, temperature and humidity through the same authenticated API a physical device uses. Pick a scenario to change what a device sends, or to interrupt the simulated background or wind feed. Any assessment still comes from the model.
        </p>
        {data ? <p className="mt-2 text-[0.875rem] text-ink-2">Background: <span className="font-medium text-ink">{data.sources.background.description}</span>. Wind: <span className="font-medium text-ink">{data.sources.weather.description}</span>.</p> : null}
      </div>
      <Notice tone="warn" icon={FlaskConical} title="Everything on this page is simulated">Changes here affect what citizens and officers see on the dashboards.</Notice>
      {failure ? <Notice tone="flag" title={failure} /> : null}

      {error && !data ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : (
        <>
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-left text-[0.875rem]">
                <thead className="border-b border-line bg-paper text-[0.75rem] text-ink-2">
                  <tr><th scope="col" className="px-4 py-2.5 font-medium">Site</th><th scope="col" className="px-4 py-2.5 font-medium">Scenario</th><th scope="col" className="px-4 py-2.5 font-medium">Result of last change</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.sites.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3"><p className="font-medium">{s.name}</p><p className="num text-[0.8125rem] text-ink-2">{s.locality} · {s.deviceId}</p></td>
                      <td className="px-4 py-3">
                        <select aria-label={`Scenario for ${s.name}`} className="field h-9 w-72 py-0 text-[0.875rem]" value={s.scenario} disabled={pending === s.id}
                          onChange={(e) => change(s.id, e.target.value)}>
                          {data.scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-ink-2" aria-live="polite">
                        {pending === s.id ? 'Uploading a reading…' : results[s.id] ? describe(results[s.id]) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="text-[0.8125rem] text-ink-2">
            {data.enabled ? `Simulated devices sample every minute and upload ${data.batchMinutes > 1 ? `in ${data.batchMinutes}-minute batches` : 'each reading as it is taken'}.` : 'The automatic simulator is off in this process; use "Read sensors now" on the overview or run the simulator worker.'} A flatlined sensor is recognised after ten identical readings. Under normal conditions a site can still be flagged occasionally: the model's calibration accepts roughly a 5% false-alarm rate.
          </p>
        </>
      )}
    </div>
  );
}
