import { useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CircleCheck, CircleX, MapPin } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { STATUS_ORDER, fmtDateTime } from '../../lib/format.js';
import { ReadingComparison } from '../../components/Reading.jsx';
import { AuthImage, LoadError, Notice, Panel, SourceTag, Skeleton, StatusPill, VerdictBadge } from '../../components/ui.jsx';

function Progress({ complaint }) {
  const { t, locale } = useI18n();
  const reached = new Map(complaint.timeline.filter((e) => e.toStatus).map((e) => [e.toStatus, e.createdAt]));
  const rejected = complaint.status === 'REJECTED';
  // A rejected report ends where it was rejected; later steps never happen.
  const steps = rejected ? [...STATUS_ORDER.filter((s) => reached.has(s)), 'REJECTED'] : STATUS_ORDER;
  return (
    <ol className="mt-3">
      {steps.map((status, i) => {
        const at = reached.get(status);
        const done = Boolean(at);
        const last = i === steps.length - 1;
        return (
          <li key={status} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? <span className={`absolute top-6 left-[0.6875rem] h-[calc(100%-1.5rem)] w-0.5 ${done && reached.has(steps[i + 1]) ? 'bg-accent' : 'bg-line'}`} aria-hidden /> : null}
            <span className={`relative grid size-6 shrink-0 place-items-center rounded-full border-2 ${done ? (status === 'REJECTED' ? 'border-ink-2 bg-ink-2 text-white' : 'border-accent bg-accent text-white') : 'border-line-strong bg-surface'}`}>
              {done ? (status === 'REJECTED' ? <CircleX className="size-3.5" aria-hidden /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />) : null}
            </span>
            <div className="-mt-0.5">
              <p className={`font-medium ${done ? 'text-ink' : 'text-ink-3'}`}>{t(`status.${status}`)}</p>
              <p className="num text-[0.8125rem] text-ink-2">{done ? fmtDateTime(at, locale) : t('detail.step.pending')}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function ComplaintDetail() {
  const { id } = useParams();
  const { t, locale, place } = useI18n();
  const location = useLocation();
  const { data, error, loading, reload } = useApi(`/complaints/${id}`, { pollMs: 45_000 });
  const c = data?.complaint;
  useEffect(() => { document.title = `${c?.reference || t('complaints.title')} · AirWatch`; }, [c, t]);

  const back = (
    <Link to="/citizen/complaints" className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />{t('complaints.title')}
    </Link>
  );
  if (error && !data) {
    return <div className="mx-auto max-w-2xl space-y-4">{back}{error.status === 404 ? <Notice tone="info" title={t('detail.notFound')} /> : <LoadError error={error} onRetry={reload} />}</div>;
  }
  if (loading && !data) return <div className="mx-auto max-w-2xl space-y-3"><Skeleton className="h-8 w-56" /><Skeleton className="h-48" /><Skeleton className="h-40" /></div>;

  const closed = c.status === 'RESOLVED' || c.status === 'REJECTED';
  const snapshot = c.sensorSnapshot;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {back}
      {location.state?.justSubmitted ? (
        <Notice tone="ok" icon={CircleCheck} title={t('detail.submitted', { reference: c.reference })}>{t('detail.submittedBody')}</Notice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl leading-snug font-semibold tracking-tight">{c.site?.name || c.locationText || t('complaints.unlistedSite')}</h1>
          <p className="num mt-0.5 text-[0.875rem] text-ink-2">{c.reference} · {place(c.locality)}</p>
        </div>
        <StatusPill status={c.status} />
      </div>

      {closed ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="font-semibold">{t('detail.outcome')}</h2>
          <dl className="mt-2 space-y-3 text-[0.9375rem]">
            {c.findings ? <div><dt className="text-[0.8125rem] text-ink-2">{c.status === 'REJECTED' ? t('detail.rejectedReason') : t('detail.findings')}</dt><dd className="whitespace-pre-line">{c.findings}</dd></div> : null}
            {c.correctiveAction ? <div><dt className="text-[0.8125rem] text-ink-2">{t('detail.action')}</dt><dd className="whitespace-pre-line">{c.correctiveAction}</dd></div> : null}
          </dl>
        </Panel>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <h2 className="font-semibold">{t('detail.progress')}</h2>
        <Progress complaint={c} />
      </Panel>

      <Panel className="p-4 sm:p-5">
        <h2 className="font-semibold">{t('detail.yourReport')}</h2>
        <p className="mt-2 max-w-[70ch] whitespace-pre-line">{c.description}</p>
        {(c.locationText || c.latitude != null) ? (
          <p className="mt-3 flex items-start gap-1.5 text-[0.875rem] text-ink-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{c.locationText}{c.locationText && c.latitude != null ? ' · ' : ''}{c.latitude != null ? <span className="num">{c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}</span> : null}</span>
          </p>
        ) : null}
        {c.attachments.length ? (
          <ul className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={t('detail.photos')}>
            {c.attachments.map((a) => (
              <li key={a.id} className="overflow-hidden rounded-lg border border-line"><AuthImage url={a.url} alt={a.filename} className="aspect-square w-full" /></li>
            ))}
          </ul>
        ) : null}
      </Panel>

      {c.anomalyEvidence ? (
        <Panel className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{t('detail.evidence')}</h2>
            <VerdictBadge verdict="flagged" />
          </div>
          <div className="mt-4">
            <ReadingComparison background={c.anomalyEvidence.backgroundValue} site={c.anomalyEvidence.siteValue} evaluation={c.anomalyEvidence} />
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
            <span className="num">{t('monitor.measuredAt', { time: fmtDateTime(c.anomalyEvidence.siteTimestamp, locale) })}</span>
            <SourceTag source={c.anomalyEvidence.dataSource} />
          </p>
          <p className="mt-2 text-[0.8125rem] text-ink-2">{t('verdict.disclaimer')}</p>
        </Panel>
      ) : snapshot ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="font-semibold">{t('detail.snapshot')}</h2>
          <p className="mt-1 text-[0.875rem] text-ink-2">{t('detail.evidenceNone')}</p>
          <div className="mt-4">
            <ReadingComparison background={snapshot.background?.ugm3} site={snapshot.site?.ugm3} pm25={snapshot.site?.pm25Ugm3} evaluation={snapshot.evaluation} />
          </div>
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
            <span className="num">{t('monitor.measuredAt', { time: fmtDateTime(snapshot.site?.timestamp, locale) })}</span>
            <SourceTag source={snapshot.dataSource} />
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
