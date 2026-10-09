import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, MapPin, Paperclip, Upload } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { fmtDateTime } from '../../lib/format.js';
import { ReadingComparison } from '../../components/Reading.jsx';
import SiteMap from '../../components/SiteMap.jsx';
import { AuthImage, Button, FormField, LoadError, Notice, Panel, SourceTag, Skeleton, StatusPill, VerdictBadge } from '../../components/ui.jsx';

const STATUS_LABEL = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', INSPECTION_ASSIGNED: 'Inspection assigned', RESOLVED: 'Resolved', REJECTED: 'Rejected' };

const AUDIT_TEXT = {
  SUBMITTED: () => 'submitted the complaint',
  STATUS_CHANGED: (e) => `moved it from ${STATUS_LABEL[e.fromStatus]} to ${STATUS_LABEL[e.toStatus]}`,
  OFFICER_ASSIGNED: (e) => `assigned ${e.metadata?.officerName || 'an officer'}`,
  NOTE_ADDED: () => 'added an inspection note',
  EVIDENCE_UPLOADED: (e) => `uploaded ${e.metadata?.files?.length || 1} evidence image${(e.metadata?.files?.length || 1) === 1 ? '' : 's'}`,
  FINDINGS_UPDATED: () => 'updated the draft findings',
};

function SensorEvidence({ complaint }) {
  const anomaly = complaint.anomalyEvidence;
  const snapshot = complaint.sensorSnapshot;
  if (!anomaly && !snapshot) {
    return <p className="mt-2 text-[0.875rem] text-ink-2">No monitored site was named, so no sensor reading was recorded with this complaint.</p>;
  }
  const evaluation = anomaly || snapshot.evaluation;
  const background = anomaly ? anomaly.backgroundValue : snapshot.background?.ugm3;
  const site = anomaly ? anomaly.siteValue : snapshot.site?.ugm3;
  const source = anomaly ? anomaly.dataSource : snapshot.dataSource;
  const warned = (evaluation?.domainWarnings || []).map((w) => w.feature).join(', ');
  const evaluated = evaluation?.status === 'EVALUATED';
  return (
    <div className="mt-3">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VerdictBadge verdict={anomaly ? 'flagged' : evaluated && !evaluation.isAnomaly ? 'normal' : 'none'} />
        <SourceTag source={source} />
        <span className="text-[0.8125rem] text-ink-2">
          {anomaly ? 'Anomaly active when the complaint was filed' : evaluated ? 'No anomaly at filing; reading recorded for reference' : `No assessment at filing: ${evaluation?.reason || 'no reading'}`}
        </span>
      </div>
      <ReadingComparison background={background} site={site} pm25={anomaly ? undefined : snapshot.site?.pm25Ugm3} evaluation={evaluation} />
      {warned ? <div className="mt-4"><Notice tone="warn">Inputs outside the model's trained range: {warned}. Treat this result with extra caution.</Notice></div> : null}
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[0.8125rem] text-ink-2">
        <dt>Site reading at</dt><dd className="num text-ink">{fmtDateTime(anomaly ? anomaly.siteTimestamp : snapshot.site?.timestamp)}</dd>
        <dt>Background reading at</dt><dd className="num text-ink">{fmtDateTime(anomaly ? anomaly.backgroundTimestamp : snapshot.background?.timestamp)}</dd>
        {evaluated ? (
          <>
            <dt>Expected difference</dt><dd className="num text-ink">{evaluation.expectedNormalDifference.toFixed(2)} µg/m³</dd>
            <dt>Calibrated margin</dt><dd className="num text-ink">{evaluation.calibratedMargin.toFixed(2)} µg/m³</dd>
            <dt>Model version</dt><dd className="break-all text-ink">{evaluation.model?.version}</dd>
            <dt>Model inputs</dt>
            <dd className="num text-ink">{Object.entries(evaluation.features || {}).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(' · ')}</dd>
          </>
        ) : null}
      </dl>
      <p className="mt-3 text-[0.8125rem] text-ink-2">{evaluation?.interpretation || 'Evidence for review; not proof of a construction violation'}. The model was trained on synthetic Delhi data and is not validated for Mumbai.</p>
    </div>
  );
}

function Actions({ complaint, allowed, officers, run, busy }) {
  const [officerId, setOfficerId] = useState(complaint.assignedOfficer?.id || '');
  const [note, setNote] = useState('');
  const [findings, setFindings] = useState(complaint.findings || '');
  const [action, setAction] = useState(complaint.correctiveAction || '');
  const [reason, setReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const path = `/municipal/complaints/${complaint.id}`;
  const status = (body) => () => run('status', () => api.post(`${path}/status`, body));
  const officerSelect = (
    <select id="officer" className="field" value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
      <option value="">Choose an officer</option>
      {officers.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  if (allowed.length === 0) {
    return <p className="text-[0.875rem] text-ink-2">This complaint is closed. Notes can still be added to the record below.</p>;
  }

  return (
    <div className="space-y-4">
      {complaint.status === 'SUBMITTED' ? (
        <>
          <p className="text-[0.875rem] text-ink-2">Start the review to take this report out of the new queue.</p>
          <Button block loading={busy === 'status'} onClick={status({ status: 'UNDER_REVIEW' })}>Start review</Button>
        </>
      ) : null}

      {complaint.status === 'UNDER_REVIEW' ? (
        <>
          <FormField label="Inspecting officer" htmlFor="officer">{officerSelect}</FormField>
          <FormField label="Instruction for the inspector" htmlFor="assign-note" optional="(optional)">
            <textarea id="assign-note" rows={2} className="field resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <Button block disabled={!officerId} loading={busy === 'status'} onClick={status({ status: 'INSPECTION_ASSIGNED', officerId, note })}>Assign inspection</Button>
        </>
      ) : null}

      {complaint.status === 'INSPECTION_ASSIGNED' ? (
        <>
          <FormField label="Inspecting officer" htmlFor="officer">
            <div className="flex gap-2">
              {officerSelect}
              <Button variant="secondary" disabled={!officerId || officerId === complaint.assignedOfficer?.id} loading={busy === 'assign'}
                onClick={() => run('assign', () => api.post(`${path}/assign`, { officerId }))}>Reassign</Button>
            </div>
          </FormField>
          <FormField label="Inspection findings" htmlFor="findings">
            <textarea id="findings" rows={4} className="field resize-y" value={findings} onChange={(e) => setFindings(e.target.value)} placeholder="What the inspection found on site" />
          </FormField>
          <FormField label="Corrective action" htmlFor="corrective" hint="Shown to the citizen once the complaint is resolved.">
            <textarea id="corrective" rows={3} className="field resize-y" value={action} onChange={(e) => setAction(e.target.value)} placeholder="What was ordered or done, and any follow-up date" />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={busy === 'findings'} onClick={() => run('findings', () => api.put(`${path}/findings`, { findings, correctiveAction: action }))}>Save draft</Button>
            <Button className="flex-1" icon={CircleCheck} disabled={!findings.trim() || !action.trim()} loading={busy === 'status'}
              onClick={status({ status: 'RESOLVED', findings, correctiveAction: action })}>Resolve complaint</Button>
          </div>
        </>
      ) : null}

      {allowed.includes('REJECTED') ? (
        <div className="border-t border-line pt-4">
          {rejecting ? (
            <div className="space-y-3">
              <FormField label="Reason for rejection" htmlFor="reject-reason" hint="Shown to the citizen.">
                <textarea id="reject-reason" rows={3} className="field resize-y" value={reason} onChange={(e) => setReason(e.target.value)} />
              </FormField>
              <div className="flex gap-2">
                <Button variant="danger" disabled={!reason.trim()} loading={busy === 'status'} onClick={status({ status: 'REJECTED', note: reason })}>Reject complaint</Button>
                <Button variant="ghost" onClick={() => setRejecting(false)}>Cancel</Button>
              </div>
            </div>
          ) : <Button variant="ghost" size="sm" onClick={() => setRejecting(true)}>Reject this complaint…</Button>}
        </div>
      ) : null}
    </div>
  );
}

export default function CaseFile() {
  const { id } = useParams();
  const { data, error, loading, reload, setData } = useApi(`/municipal/complaints/${id}`);
  const officers = useApi('/municipal/officers');
  const [busy, setBusy] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [caption, setCaption] = useState('');
  const [files, setFiles] = useState([]);
  const fileInput = useRef(null);
  const c = data?.complaint;

  useEffect(() => { document.title = `${c?.reference || 'Complaint'} · AirWatch`; }, [c]);

  // Every mutation returns the full updated case, so the page never shows stale state.
  const run = async (key, request) => {
    setBusy(key);
    setActionError(null);
    try {
      setData(await request());
      return true;
    } catch (err) {
      setActionError(err.message);
      if (err.status === 409) reload();
      return false;
    } finally {
      setBusy(null);
    }
  };

  const back = (
    <Link to="/municipal/complaints" className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />Complaints
    </Link>
  );
  if (error && !data) return <div className="space-y-4">{back}{error.status === 404 ? <Notice tone="info" title="This complaint does not exist." /> : <LoadError error={error} onRetry={reload} />}</div>;
  if (loading && !data) return <div className="space-y-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;

  const closed = data.allowedTransitions.length === 0;
  const citizenPhotos = c.attachments.filter((a) => a.kind === 'CITIZEN_PHOTO');
  const inspectionPhotos = c.attachments.filter((a) => a.kind === 'INSPECTION_EVIDENCE');
  const hasPoint = c.latitude != null && c.longitude != null;

  const addNote = async () => {
    if (await run('note', () => api.post(`/municipal/complaints/${id}/notes`, { note: noteText }))) setNoteText('');
  };
  const uploadEvidence = async () => {
    const form = new FormData();
    if (caption.trim()) form.append('caption', caption.trim());
    files.forEach((f) => form.append('files', f, f.name));
    if (await run('evidence', () => api.upload(`/municipal/complaints/${id}/evidence`, form))) {
      setFiles([]);
      setCaption('');
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <div>
      {back}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight">{c.site?.name || c.locationText || 'Unlisted site'}</h1>
          <p className="num mt-1 text-[0.875rem] text-ink-2">{c.reference} · {c.locality.name}{c.site ? ` · ${c.site.code}` : ''} · filed {fmtDateTime(c.createdAt)}</p>
        </div>
        <StatusPill status={c.status} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-5">
          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">Citizen report</h2>
            <p className="mt-2 max-w-[72ch] whitespace-pre-line">{c.description}</p>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-[0.875rem] sm:grid-cols-2">
              <div><dt className="text-[0.8125rem] text-ink-2">Reported by</dt><dd>{c.citizen.name} · <a className="text-accent underline" href={`mailto:${c.citizen.email}`}>{c.citizen.email}</a></dd></div>
              <div>
                <dt className="text-[0.8125rem] text-ink-2">Location</dt>
                <dd className="flex items-start gap-1.5">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
                  <span>{c.site?.address || c.locationText || 'Not described'}{c.site && c.locationText ? ` (${c.locationText})` : ''}{hasPoint ? <span className="num block text-ink-2">{c.latitude.toFixed(5)}, {c.longitude.toFixed(5)}</span> : null}</span>
                </dd>
              </div>
            </dl>
            {citizenPhotos.length ? (
              <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Citizen photographs">
                {citizenPhotos.map((a) => <li key={a.id} className="overflow-hidden rounded-lg border border-line"><AuthImage url={a.url} alt={`Citizen photograph ${a.filename}`} className="aspect-square w-full" /></li>)}
              </ul>
            ) : null}
            {hasPoint ? (
              <div className="mt-4">
                <SiteMap label="Complaint location" className="h-52"
                  sites={[{ id: c.id, name: c.site?.name || 'Reported location', latitude: c.latitude, longitude: c.longitude, verdict: c.hasAnomalyEvidence ? 'flagged' : 'none' }]} />
              </div>
            ) : null}
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">Recorded sensor evidence</h2>
            <SensorEvidence complaint={c} />
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">Inspection evidence</h2>
            {inspectionPhotos.length ? (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {inspectionPhotos.map((a) => (
                  <li key={a.id}>
                    <div className="overflow-hidden rounded-lg border border-line"><AuthImage url={a.url} alt={a.caption || a.filename} className="aspect-square w-full" /></div>
                    <p className="mt-1 text-[0.75rem] text-ink-2">{a.caption || a.filename}<span className="block text-ink-3">{a.uploadedBy} · {fmtDateTime(a.createdAt)}</span></p>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-[0.875rem] text-ink-2">No inspection images have been uploaded yet.</p>}
            {!closed ? (
              <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
                <FormField label="Images" htmlFor="evidence-files" hint="Up to 6 images, 5 MB each">
                  <input ref={fileInput} id="evidence-files" type="file" multiple accept="image/jpeg,image/png,image/webp"
                    className="block w-full text-[0.8125rem] text-ink-2 file:mr-3 file:h-9 file:cursor-pointer file:rounded-lg file:border file:border-solid file:border-line-strong file:bg-surface file:px-3 file:text-[0.8125rem] file:font-medium file:text-ink"
                    onChange={(e) => setFiles([...e.target.files].slice(0, 6))} />
                </FormField>
                <FormField label="Caption" htmlFor="evidence-caption" optional="(optional)">
                  <input id="evidence-caption" type="text" maxLength={300} className="field h-9 py-0" value={caption} onChange={(e) => setCaption(e.target.value)} />
                </FormField>
                <Button variant="secondary" icon={Upload} className="h-9 sm:mt-[1.6875rem]" disabled={!files.length} loading={busy === 'evidence'} onClick={uploadEvidence}>Upload</Button>
              </div>
            ) : null}
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">Audit history</h2>
            <ol className="mt-3 space-y-4">
              {[...c.audit].reverse().map((e) => (
                <li key={e.id} className="grid grid-cols-[auto_1fr] gap-x-3 text-[0.875rem]">
                  <span className="mt-1.5 size-2 rounded-full bg-line-strong" aria-hidden />
                  <div>
                    <p><span className="font-medium">{e.actor?.name || 'System'}</span>{e.actor?.role === 'CITIZEN' ? ' (citizen)' : ''} {AUDIT_TEXT[e.type]?.(e) || e.type}</p>
                    {e.note ? <p className="mt-1 max-w-[72ch] rounded-lg bg-paper px-3 py-2 whitespace-pre-line text-ink-2">{e.note}</p> : null}
                    {e.type === 'EVIDENCE_UPLOADED' && e.metadata?.files ? <p className="mt-0.5 flex items-center gap-1 text-[0.8125rem] text-ink-3"><Paperclip className="size-3" aria-hidden />{e.metadata.files.join(', ')}</p> : null}
                    <p className="num mt-0.5 text-[0.75rem] text-ink-3">{fmtDateTime(e.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6">
          {actionError ? <Notice tone="flag" title={actionError} /> : null}
          <Panel className="p-4">
            <h2 className="font-semibold">{closed ? 'Outcome' : 'Next step'}</h2>
            <dl className="mt-2 mb-4 space-y-1 text-[0.875rem]">
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Assigned to</dt><dd className="text-right font-medium">{c.assignedOfficer?.name || 'Unassigned'}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-2">Last updated</dt><dd className="num text-right">{fmtDateTime(c.updatedAt)}</dd></div>
            </dl>
            {closed ? (
              <dl className="mb-4 space-y-3 border-t border-line pt-3 text-[0.875rem]">
                {c.findings ? <div><dt className="text-[0.8125rem] text-ink-2">{c.status === 'REJECTED' ? 'Reason' : 'Findings'}</dt><dd className="whitespace-pre-line">{c.findings}</dd></div> : null}
                {c.correctiveAction ? <div><dt className="text-[0.8125rem] text-ink-2">Corrective action</dt><dd className="whitespace-pre-line">{c.correctiveAction}</dd></div> : null}
              </dl>
            ) : null}
            <Actions key={`${c.status}-${c.updatedAt}`} complaint={c} allowed={data.allowedTransitions} officers={officers.data?.officers || []} run={run} busy={busy} />
          </Panel>

          <Panel className="p-4">
            <FormField label="Inspection note" htmlFor="note" hint="Internal. Not shown to the citizen.">
              <textarea id="note" rows={3} className="field resize-y" value={noteText} onChange={(e) => setNoteText(e.target.value)} />
            </FormField>
            <Button variant="secondary" className="mt-3" disabled={!noteText.trim()} loading={busy === 'note'} onClick={addNote}>Add note</Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
