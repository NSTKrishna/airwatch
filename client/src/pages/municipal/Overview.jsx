import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { ArrowRight, CircleCheck, RefreshCw } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { fmtNumber, fmtRelative, verdictOf } from '../../lib/format.js';
import SiteMap from '../../components/SiteMap.jsx';
import { LocalityTrendChart } from '../../components/charts.jsx';
import { Button, LoadError, Notice, Panel, Skeleton, VerdictBadge } from '../../components/ui.jsx';

function StatStrip({ summary }) {
  const stats = [
    { label: 'Total reports', value: summary.totalReports, to: '/municipal/complaints', note: `${summary.awaitingReview} awaiting review` },
    { label: 'Active anomalies', value: summary.activeAnomalies, to: '#flagged', note: `of ${summary.monitoredSites} monitored sites`, alert: summary.activeAnomalies > 0 },
    { label: 'Pending inspections', value: summary.pendingInspections, to: '/municipal/complaints?status=INSPECTION_ASSIGNED', note: 'assigned, not yet closed' },
    { label: 'Resolved cases', value: summary.resolvedCases, to: '/municipal/complaints?status=RESOLVED', note: `${summary.rejectedCases} rejected` },
  ];
  return (
    <Panel as="dl" className="grid grid-cols-2 divide-line max-lg:[&>*:nth-child(-n+2)]:border-b max-lg:[&>*:nth-child(odd)]:border-r lg:grid-cols-4 lg:divide-x">
      {stats.map((s) => {
        const body = (
          <>
            <dt className="text-[0.8125rem] text-ink-2">{s.label}</dt>
            <dd className={`num mt-1 text-[1.75rem] leading-none font-semibold ${s.alert ? 'text-flag' : 'text-ink'}`}>{s.value}</dd>
            <dd className="mt-1.5 text-[0.75rem] text-ink-3">{s.note}</dd>
          </>
        );
        const cls = 'block border-line px-4 py-4 transition-colors duration-150 hover:bg-paper';
        return s.to.startsWith('#') ? <a key={s.label} href={s.to} className={cls}>{body}</a> : <Link key={s.label} to={s.to} className={cls}>{body}</Link>;
      })}
    </Panel>
  );
}

function SitePopup({ site }) {
  const e = site.latest?.evaluation;
  return (
    <div className="min-w-44">
      <p className="font-semibold">{site.name}</p>
      <p className="text-ink-2">{site.locality.name} ward · {site.code} · DEMO monitor at a verified project</p>
      <div className="mt-1.5"><VerdictBadge verdict={site.verdict} /></div>
      {site.latest ? (
        <p className="num mt-1.5">
          PM10 {fmtNumber(site.latest.site.ugm3)} · PM2.5 {fmtNumber(site.latest.site.pm25Ugm3)} · Background {fmtNumber(site.latest.background.ugm3)} µg/m³
          {e?.status === 'EVALUATED' ? <><br />Difference {fmtNumber(e.observedDifference)} vs barrier {fmtNumber(e.dynamicBarrier)}</> : null}
        </p>
      ) : null}
      <p className="mt-1.5">
        <Link to={`/municipal/complaints?q=${encodeURIComponent(site.code)}`} className="font-medium text-accent underline">
          {site.openComplaints} open complaint{site.openComplaints === 1 ? '' : 's'}
        </Link>
      </p>
    </div>
  );
}

export default function Overview() {
  const { status } = useOutletContext();
  const summary = useApi('/municipal/summary', { pollMs: 30_000 });
  const flagged = useApi('/municipal/flagged-sites', { pollMs: 30_000 });
  const queue = useApi('/municipal/complaints?status=SUBMITTED&pageSize=5', { pollMs: 30_000 });
  const analytics = useApi('/municipal/analytics?hours=6', { pollMs: 60_000 });
  const [sweeping, setSweeping] = useState(false);
  const [sweepError, setSweepError] = useState(null);

  useEffect(() => { document.title = 'Overview · AirWatch'; }, []);

  const sweep = async () => {
    setSweeping(true);
    setSweepError(null);
    try {
      await api.post('/municipal/monitoring/run');
      await Promise.all([summary.reload(), flagged.reload(), analytics.reload()]);
    } catch (error) {
      setSweepError(error.message);
    } finally {
      setSweeping(false);
    }
  };

  const sites = (flagged.data?.sites || []).map((s) => ({ ...s, verdict: verdictOf(s.latest) }));
  const flaggedSites = sites.filter((s) => s.verdict === 'flagged');
  const latestAt = sites.map((s) => s.latest?.receivedAt).filter(Boolean).sort().at(-1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operations overview</h1>
          <p className="mt-0.5 text-[0.875rem] text-ink-2">{latestAt ? `Sensors last read ${fmtRelative(latestAt)}` : 'Waiting for the first sensor sweep'}</p>
        </div>
        <Button variant="secondary" icon={RefreshCw} loading={sweeping} onClick={sweep}>Read sensors now</Button>
      </div>

      {sweepError ? <Notice tone="flag" title={`Sweep failed: ${sweepError}`} /> : null}
      {status && !status.model.ready ? (
        <Notice tone="flag" title="No anomaly assessments are being produced">
          The model service reports: {status.model.reason}. Readings are still recorded, and citizens can still file reports. Nothing is marked normal or flagged until the model responds.
        </Notice>
      ) : null}

      {summary.error && !summary.data ? <LoadError error={summary.error} onRetry={summary.reload} />
        : summary.data ? <StatStrip summary={summary.data} /> : <Skeleton className="h-28" />}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section id="flagged" aria-labelledby="map-heading" className="scroll-mt-6">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="map-heading" className="font-semibold">Monitoring sites</h2>
            <p className="text-[0.8125rem] text-ink-2">{flaggedSites.length} of {sites.length} sites flagged</p>
          </div>
          {flagged.error && !flagged.data ? <LoadError error={flagged.error} onRetry={flagged.reload} />
            : flagged.data ? <SiteMap label="Map of monitored construction sites" className="h-[26rem]" sites={sites} renderPopup={(site) => <SitePopup site={site} />} />
              : <Skeleton className="h-[26rem]" />}
        </section>

        <div className="space-y-5">
          <Panel>
            <h2 className="border-b border-line px-4 py-3 font-semibold">Currently flagged</h2>
            {flaggedSites.length === 0 ? (
              <p className="flex items-start gap-2 px-4 py-4 text-[0.875rem] text-ink-2">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
                {summary.data?.sitesWithoutAssessment === sites.length && sites.length > 0
                  ? 'No site has a current assessment, so nothing can be flagged.'
                  : 'No site is above its dynamic barrier right now.'}
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {flaggedSites.map((s) => (
                  <li key={s.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{s.name}</p>
                        <p className="text-[0.8125rem] text-ink-2">{s.locality.name} · {s.code}</p>
                      </div>
                      <p className="num shrink-0 text-right text-[0.8125rem]">
                        <span className="font-semibold text-flag">+{fmtNumber(s.latest.evaluation.observedDifference - s.latest.evaluation.dynamicBarrier)}</span>
                        <span className="block text-ink-3">over barrier</span>
                      </p>
                    </div>
                    <Link to={`/municipal/complaints?q=${encodeURIComponent(s.code)}`} className="mt-1 inline-block text-[0.8125rem] font-medium text-accent underline">
                      {s.openComplaints} open complaint{s.openComplaints === 1 ? '' : 's'}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-line px-4 py-2.5 text-[0.75rem] text-ink-3">A flag is evidence for review, not a finding of violation.</p>
          </Panel>

          <Panel>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-semibold">New reports</h2>
              <Link to="/municipal/complaints?status=SUBMITTED" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-accent">Open inbox<ArrowRight className="size-3.5" aria-hidden /></Link>
            </div>
            {queue.data?.complaints.length ? (
              <ul className="divide-y divide-line">
                {queue.data.complaints.map((c) => (
                  <li key={c.id}>
                    <Link to={`/municipal/complaints/${c.id}`} className="block px-4 py-3 transition-colors duration-150 hover:bg-paper">
                      <p className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium">{c.site?.name || c.locationText || 'Unlisted site'}</span>
                        <span className="shrink-0 text-[0.75rem] text-ink-3">{fmtRelative(c.createdAt)}</span>
                      </p>
                      <p className="num mt-0.5 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
                        {c.reference} · {c.locality.name}
                        {c.hasAnomalyEvidence ? <VerdictBadge verdict="flagged" /> : null}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : queue.data ? <p className="px-4 py-4 text-[0.875rem] text-ink-2">No reports are waiting for a first review.</p> : <Skeleton className="m-4 h-24" />}
          </Panel>
        </div>
      </div>

      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Average site PM10 by locality, last 6 hours</h2>
          <Link to="/municipal/analytics" className="inline-flex items-center gap-1 text-[0.8125rem] font-medium text-accent">Full analytics<ArrowRight className="size-3.5" aria-hidden /></Link>
        </div>
        <p className="text-[0.8125rem] text-ink-2">µg/m³{analytics.data?.simulated ? ', simulated readings' : ''}</p>
        <div className="mt-3">
          {analytics.data ? (
            analytics.data.series.length > 4
              ? <LocalityTrendChart series={analytics.data.series} localities={analytics.data.localities} />
              : <p className="py-8 text-center text-[0.875rem] text-ink-2">Not enough readings yet to draw a trend.</p>
          ) : analytics.error ? <LoadError error={analytics.error} onRetry={analytics.reload} /> : <Skeleton className="h-64" />}
        </div>
      </Panel>
    </div>
  );
}
