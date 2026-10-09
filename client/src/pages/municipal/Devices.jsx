import { useEffect, useState } from 'react';
import { CircleCheck, Copy, KeyRound, Plus } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { fmtDate, fmtRelative } from '../../lib/format.js';
import { Button, FormField, LoadError, Notice, Panel, Skeleton, SourceTag } from '../../components/ui.jsx';

const EMPTY = { deviceId: '', siteId: '', manufacturer: '', model: '', ownerName: '', samplingIntervalSeconds: 60, calibratedAt: '', calibrationNote: '' };

function TokenNotice({ issued, onDismiss }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(issued.token);
      setCopied(true);
    } catch { /* clipboard unavailable: the token is selectable below */ }
  };
  return (
    <Notice tone="ok" icon={KeyRound} title={`Token for ${issued.deviceId}. Copy it now: it is not stored and cannot be shown again.`}
      action={<Button variant="secondary" size="sm" onClick={onDismiss}>Done</Button>}>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="num block max-w-full overflow-x-auto rounded-md border border-line bg-surface px-2 py-1 text-[0.8125rem] text-ink select-all">{issued.token}</code>
        <Button variant="secondary" size="sm" icon={copied ? CircleCheck : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
      <p className="mt-2">The device sends it as <code className="text-ink">Authorization: Bearer &lt;token&gt;</code> to <code className="text-ink">POST /api/v1/devices/readings/batch</code>.</p>
    </Notice>
  );
}

function RegisterForm({ sites, onRegistered, onCancel }) {
  const [values, setValues] = useState(EMPTY);
  const [state, setState] = useState({ busy: false, error: null, fields: {} });
  const bind = (name) => ({
    id: name, className: 'field', value: values[name], 'aria-invalid': Boolean(state.fields[name]),
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  const submit = async (event) => {
    event.preventDefault();
    setState({ busy: true, error: null, fields: {} });
    try {
      onRegistered(await api.post('/municipal/devices', { ...values, samplingIntervalSeconds: Number(values.samplingIntervalSeconds) }));
    } catch (error) {
      setState({ busy: false, error: Object.keys(error.fields || {}).length ? null : error.message, fields: error.fields || {} });
    }
  };
  return (
    <Panel as="form" className="p-4 sm:p-5" noValidate onSubmit={submit}>
      <h2 className="font-semibold">Register a physical monitor</h2>
      <p className="mt-1 max-w-[70ch] text-[0.875rem] text-ink-2">
        The site's simulated device is switched off when a physical monitor is registered there. Readings from the new device stay off the citizen dashboard until you allow publication.
      </p>
      {state.error ? <div className="mt-3"><Notice tone="flag" title={state.error} /></div> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Device ID" htmlFor="deviceId" hint="As configured on the device" error={state.fields.deviceId}><input {...bind('deviceId')} type="text" required /></FormField>
        <FormField label="Site" htmlFor="siteId" error={state.fields.siteId}>
          <select {...bind('siteId')} required>
            <option value="">Choose a site</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
          </select>
        </FormField>
        <FormField label="Owner or operator" htmlFor="ownerName" error={state.fields.ownerName}><input {...bind('ownerName')} type="text" required /></FormField>
        <FormField label="Manufacturer" htmlFor="manufacturer" error={state.fields.manufacturer}><input {...bind('manufacturer')} type="text" required /></FormField>
        <FormField label="Model" htmlFor="model" error={state.fields.model}><input {...bind('model')} type="text" required /></FormField>
        <FormField label="Sampling interval (seconds)" htmlFor="samplingIntervalSeconds" error={state.fields.samplingIntervalSeconds}><input {...bind('samplingIntervalSeconds')} type="number" min="1" /></FormField>
        <FormField label="Last calibrated" htmlFor="calibratedAt" optional="(optional)" error={state.fields.calibratedAt}><input {...bind('calibratedAt')} type="date" /></FormField>
        <div className="sm:col-span-2">
          <FormField label="Calibration note" htmlFor="calibrationNote" optional="(optional)" error={state.fields.calibrationNote}><input {...bind('calibrationNote')} type="text" maxLength={500} /></FormField>
        </div>
      </div>
      <div className="mt-5 flex gap-2">
        <Button type="submit" loading={state.busy}>Register and issue token</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </Panel>
  );
}

export default function Devices() {
  const { data, error, loading, reload } = useApi('/municipal/devices', { pollMs: 30_000 });
  const sites = useApi('/sites');
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState(null);
  useEffect(() => { document.title = 'Devices · AirWatch'; }, []);

  const act = async (key, request) => {
    setBusy(key);
    setFailure(null);
    try {
      const result = await request();
      if (result?.token) setIssued({ token: result.token, deviceId: result.device.deviceId });
      await reload();
    } catch (err) {
      setFailure(err.message);
    } finally {
      setBusy(null);
    }
  };
  const patch = (d, body) => act(`${d.id}:${Object.keys(body)[0]}`, () => api.patch(`/municipal/devices/${d.id}`, body));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Devices</h1>
          <p className="mt-1 max-w-[70ch] text-[0.875rem] text-ink-2">
            Simulated devices and physical monitors upload through the same authenticated API. No vendor integration is connected yet; a registered device or gateway only needs its token.
          </p>
        </div>
        {adding ? null : <Button icon={Plus} onClick={() => setAdding(true)}>Register device</Button>}
      </div>

      {issued ? <TokenNotice issued={issued} onDismiss={() => setIssued(null)} /> : null}
      {failure ? <Notice tone="flag" title={failure} /> : null}
      {adding ? (
        <RegisterForm sites={sites.data?.sites || []} onCancel={() => setAdding(false)}
          onRegistered={(result) => { setIssued({ token: result.token, deviceId: result.device.deviceId }); setAdding(false); reload(); }} />
      ) : null}

      {error && !data ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-80" /> : (
        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-left text-[0.875rem]">
              <thead className="border-b border-line bg-paper text-[0.75rem] text-ink-2">
                <tr>{['Device', 'Source', 'Site', 'Make and owner', 'Calibration', 'Last upload', 'Public display', 'Status', ''].map((h, i) => <th key={h || i} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.devices.map((d) => {
                  const simulated = d.provenance === 'SIMULATED';
                  return (
                    <tr key={d.id} className={d.status === 'DISABLED' ? 'text-ink-3' : ''}>
                      <td className="px-4 py-3"><p className="num font-medium whitespace-nowrap text-ink">{d.deviceId}</p><p className="num text-[0.75rem] text-ink-3">token …{d.tokenHint} · every {d.samplingIntervalSeconds} s</p></td>
                      <td className="px-4 py-3"><SourceTag source={d.provenance} /></td>
                      <td className="px-4 py-3"><p>{d.site.name}</p><p className="text-[0.75rem] text-ink-3">{d.site.locality} · {d.site.code}</p></td>
                      <td className="px-4 py-3"><p>{d.manufacturer} {d.model}</p><p className="text-[0.75rem] text-ink-3">{d.ownerName}</p></td>
                      <td className="max-w-48 px-4 py-3 text-[0.8125rem]">{d.calibratedAt ? fmtDate(d.calibratedAt) : simulated ? 'Not applicable' : 'Not recorded'}{d.calibrationNote && !simulated ? <span className="block text-ink-3">{d.calibrationNote}</span> : null}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{d.lastSeenAt ? fmtRelative(d.lastSeenAt) : 'Never'}{d.lastReportedStatus && d.lastReportedStatus !== 'OK' ? <span className="block text-[0.75rem] font-medium text-flag">{d.lastReportedStatus}</span> : null}</td>
                      <td className="px-4 py-3">
                        <label className="inline-flex items-center gap-2 whitespace-nowrap">
                          <input type="checkbox" className="size-4 accent-(--color-accent)" checked={d.publishAllowed} disabled={busy === `${d.id}:publishAllowed`}
                            onChange={(e) => patch(d, { publishAllowed: e.target.checked })} />
                          {d.publishAllowed ? 'Shown to citizens' : 'Withheld'}
                        </label>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{d.status === 'ACTIVE' ? 'Active' : 'Disabled'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" size="sm" loading={busy === `${d.id}:status`}
                            onClick={() => patch(d, { status: d.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' })}>{d.status === 'ACTIVE' ? 'Disable' : 'Enable'}</Button>
                          {simulated ? null : (
                            <Button variant="ghost" size="sm" loading={busy === `${d.id}:rotate`}
                              onClick={() => act(`${d.id}:rotate`, () => api.post(`/municipal/devices/${d.id}/rotate-token`))}>New token</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
