import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { LoadError, Notice, Panel, Skeleton } from '../../components/ui.jsx';

const RESULT_TEXT = {
  EVALUATED: (r) => (r.isAnomaly ? 'Model flagged the next reading as an anomaly' : 'Model assessed the next reading as within range'),
  INPUT_REJECTED: () => 'Reading rejected before inference; no verdict produced',
  MODEL_UNAVAILABLE: () => 'Model unavailable; reading stored without a verdict',
  MODEL_ERROR: () => 'Model returned an error; no verdict produced',
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
          AirWatch has no live sensor feed yet. This page controls the mock sensors so the full workflow can be tested: pick a scenario for a site and the next reading follows it. The simulator only produces readings; any verdict still comes from the model.
        </p>
      </div>
      <Notice tone="warn" icon={FlaskConical} title="Everything on this page is simulated">Changes here affect what citizens and officers see on the dashboards.</Notice>
      {failure ? <Notice tone="flag" title={failure} /> : null}

      {error && !data ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-96" /> : (
        <>
          <Panel className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-[0.875rem]">
                <thead className="border-b border-line bg-paper text-[0.75rem] text-ink-2">
                  <tr><th scope="col" className="px-4 py-2.5 font-medium">Site</th><th scope="col" className="px-4 py-2.5 font-medium">Scenario</th><th scope="col" className="px-4 py-2.5 font-medium">Result of last change</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.sites.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3"><p className="font-medium">{s.name}</p><p className="text-[0.8125rem] text-ink-2">{s.locality} · {s.code}</p></td>
                      <td className="px-4 py-3">
                        <select aria-label={`Scenario for ${s.name}`} className="field h-9 w-56 py-0 text-[0.875rem]" value={s.scenario} disabled={pending === s.id}
                          onChange={(e) => change(s.id, e.target.value)}>
                          {data.scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.description}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-ink-2" aria-live="polite">
                        {pending === s.id ? 'Reading sensors…' : results[s.id] ? RESULT_TEXT[results[s.id].evaluationStatus](results[s.id]) : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <p className="text-[0.8125rem] text-ink-2">
            Sensors are read automatically every {data.monitorIntervalSeconds || '–'} seconds. A normal scenario can still occasionally cross the barrier: the model's calibration accepts roughly a 5% false-alarm rate on baseline readings.
          </p>
        </>
      )}
    </div>
  );
}
