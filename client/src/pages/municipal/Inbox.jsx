import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, Inbox as InboxIcon, Radio, Search, X } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { fmtDateTime } from '../../lib/format.js';
import { Button, EmptyState, LoadError, Panel, Skeleton, StatusPill } from '../../components/ui.jsx';

const STATUSES = ['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED', 'RESOLVED', 'REJECTED'];
const STATUS_LABEL = { SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under review', INSPECTION_ASSIGNED: 'Inspection assigned', RESOLVED: 'Resolved', REJECTED: 'Rejected' };
const FILTER_KEYS = ['q', 'status', 'ward', 'locality', 'assignee', 'anomaly'];
const PAGE_SIZE = 20;

function Select({ label, value, onChange, children }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[0.75rem] font-medium text-ink-2">{label}</span>
      <select className="field h-10 py-0 text-[0.875rem]" value={value} onChange={(e) => onChange(e.target.value)}>{children}</select>
    </label>
  );
}

export default function Inbox() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const overview = useApi('/public/overview');
  const wards = (overview.data?.wards || []).filter((w) => w.pilot);
  const officers = useApi('/municipal/officers');

  useEffect(() => { document.title = 'Complaints · AirWatch'; }, []);

  const setFilter = (key, value) => setParams((prev) => {
    const p = new URLSearchParams(prev);
    if (value) p.set(key, value); else p.delete(key);
    p.delete('page');
    return p;
  }, { replace: true });

  // Debounce typing so each keystroke is not a request.
  useEffect(() => {
    const current = params.get('q') || '';
    if (search.trim() === current) return undefined;
    const timer = setTimeout(() => setFilter('q', search.trim()), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const query = new URLSearchParams();
  FILTER_KEYS.forEach((k) => params.get(k) && query.set(k, params.get(k)));
  const page = Math.max(1, Number(params.get('page')) || 1);
  query.set('page', page);
  query.set('pageSize', PAGE_SIZE);
  const { data, error, loading, reload } = useApi(`/municipal/complaints?${query}`, { pollMs: 30_000 });

  const activeFilters = FILTER_KEYS.filter((k) => params.get(k)).length;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const goto = (n) => setParams((prev) => { const p = new URLSearchParams(prev); p.set('page', n); return p; });

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Complaints</h1>
        {data ? <p className="num text-[0.875rem] text-ink-2">{data.total} {data.total === 1 ? 'complaint' : 'complaints'}{activeFilters ? ' match' : ''}</p> : null}
      </div>

      <Panel className="mt-4 grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="block sm:col-span-2 lg:col-span-1">
          <span className="mb-1 block text-[0.75rem] font-medium text-ink-2">Search</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input type="search" className="field h-10 py-0! pl-9! text-[0.875rem]" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Reference, project, citizen or description" />
          </span>
        </label>
        <Select label="Status" value={params.get('status') || ''} onChange={(v) => setFilter('status', v)}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select label="Ward" value={params.get('ward') || ''} onChange={(v) => setFilter('ward', v)}>
          <option value="">All wards</option>
          {wards.map((w) => <option key={w.slug} value={w.slug}>{w.name}</option>)}
        </Select>
        <Select label="Assigned to" value={params.get('assignee') || ''} onChange={(v) => setFilter('assignee', v)}>
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="unassigned">Unassigned</option>
          {(officers.data?.officers || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
        <Select label="Sensor evidence" value={params.get('anomaly') || ''} onChange={(v) => setFilter('anomaly', v)}>
          <option value="">Any</option>
          <option value="yes">Anomaly attached</option>
          <option value="no">No anomaly attached</option>
        </Select>
        <Button variant="ghost" icon={X} disabled={!activeFilters} onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear</Button>
      </Panel>

      <div className="mt-4">
        {error && !data ? <LoadError error={error} onRetry={reload} />
          : loading && !data ? <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            : data.complaints.length === 0 ? (
              <Panel>
                <EmptyState icon={InboxIcon} title={activeFilters ? 'No complaints match these filters' : 'No complaints yet'}>
                  {activeFilters ? 'Loosen or clear the filters to see more.' : 'Citizen reports appear here as soon as they are submitted.'}
                </EmptyState>
              </Panel>
            ) : (
              <Panel className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[46rem] text-left text-[0.875rem]">
                    <thead className="border-b border-line bg-paper text-[0.75rem] text-ink-2">
                      <tr>
                        {['Reference', 'Project and ward', 'Reported by', 'Evidence', 'Assigned to', 'Status', 'Filed'].map((h) => (
                          <th key={h} scope="col" className="px-4 py-2.5 font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.complaints.map((c) => (
                        <tr key={c.id} className="transition-colors duration-150 hover:bg-paper">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Link to={`/municipal/complaints/${c.id}`} className="num font-medium text-accent underline">{c.reference}</Link>
                          </td>
                          <td className="max-w-64 px-4 py-3">
                            <p className="truncate font-medium">{c.project?.name || c.site?.name || c.locationText || 'Unlisted site'}</p>
                            <p className="truncate text-[0.8125rem] text-ink-2">
                              {c.ward ? `${c.ward.name} ward` : c.locality.name}{c.site ? ` · ${c.site.code}` : ''}{c.isDemo ? ' · demo history' : ''}{c.publicHidden ? ' · hidden from public map' : ''}
                            </p>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{c.citizen.name}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-3 text-ink-2">
                              <span className="num inline-flex items-center gap-1" title="Photographs"><Camera className="size-3.5" aria-hidden />{c.photoCount}</span>
                              {c.hasAnomalyEvidence
                                ? <span className="inline-flex items-center gap-1 font-medium text-flag"><Radio className="size-3.5" aria-hidden />Anomaly</span>
                                : <span className="text-ink-3">No anomaly</span>}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">{c.assignedOfficer?.name || <span className="text-ink-3">Unassigned</span>}</td>
                          <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                          <td className="num px-4 py-3 whitespace-nowrap text-ink-2">{fmtDateTime(c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pages > 1 ? (
                  <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[0.8125rem] text-ink-2">
                    <span className="num">Page {page} of {pages}</span>
                    <span className="flex gap-2">
                      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => goto(page - 1)}>Previous</Button>
                      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => goto(page + 1)}>Next</Button>
                    </span>
                  </div>
                ) : null}
              </Panel>
            )}
      </div>
    </div>
  );
}
