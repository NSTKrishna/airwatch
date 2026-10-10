import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, EyeOff, MapPin } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtDateTime } from '../../lib/format.js';
import { WardOffice } from '../../components/civic.jsx';
import { CasePositions, EvidenceTrail, FollowUpActions, NextStep, OfficialKit, ShareCase } from '../../components/CaseRecord.jsx';
import { caseUrl } from '../../lib/caseText.js';
import { ReadingComparison } from '../../components/Reading.jsx';
import { AuthImage, LoadError, Notice, Panel, SourceTag, Skeleton, StatusPill, VerdictBadge } from '../../components/ui.jsx';

export default function ComplaintDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const location = useLocation();
  const { data, error, loading, reload } = useApi(`/complaints/${id}`, { pollMs: 45_000 });
  const c = data?.complaint;
  const [formKind, setFormKind] = useState(null);
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
  const openForm = (kind) => {
    setFormKind(kind);
    requestAnimationFrame(() => document.getElementById('case-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {back}
      {location.state?.justSubmitted ? (
        <Notice tone="ok" icon={CircleCheck} title={t('detail.submitted', { reference: c.reference })}>{t('detail.submittedNext')}</Notice>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl leading-snug font-semibold tracking-tight">{c.project?.name || c.site?.name || c.locationText || t('complaints.unlistedSite')}</h1>
          <p className="num mt-0.5 text-[0.875rem] text-ink-2">{c.reference} · {c.ward ? t('ward.title', { name: c.ward.name }) : c.locality?.name}</p>
        </div>
        <StatusPill status={c.status} />
      </div>

      {/* The case link is what the citizen takes away: it works for anyone, signed in or not. */}
      {c.ward && !c.publicHidden ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="font-semibold">{t('detail.caseLink')}</h2>
          <p className="mt-1 text-[0.875rem] text-ink-2">{t('detail.caseLinkBody')}</p>
          <p className="num mt-2 break-all"><Link to={`/report/${c.reference}`} className="font-medium text-accent underline">{caseUrl(c.reference)}</Link></p>
          <div className="mt-3"><ShareCase report={c} /></div>
        </Panel>
      ) : c.publicHidden ? (
        <Notice tone="info" icon={EyeOff}>{t('detail.hidden')}</Notice>
      ) : null}

      {c.positions ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('case.title')}</h2>
          <CasePositions report={c} />
          <div className="mt-3"><NextStep report={c} /></div>
        </Panel>
      ) : null}

      {c.ward && c.status !== 'REJECTED' ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-2 font-semibold">{t('kit.title')}</h2>
          <OfficialKit report={c} wardOffice={c.wardOffice} authority={data.dustAuthority}
            onAddReference={() => openForm('OFFICIAL_COMPLAINT')} onAddResponse={() => openForm('OFFICIAL_RESPONSE')} />
        </Panel>
      ) : null}

      {c.positions ? (
        <Panel id="case-actions" className="scroll-mt-4 p-4 sm:p-5">
          {formKind ? null : <h2 className="mb-3 font-semibold">{t('action.title')}</h2>}
          <FollowUpActions report={c} channels={data.dustAuthority.channels} formKind={formKind} setFormKind={setFormKind} onChanged={reload} />
        </Panel>
      ) : null}

      <Panel className="p-4 sm:p-5">
        <h2 className="mb-3 font-semibold">{t('trail.title')}</h2>
        <EvidenceTrail report={c} />
        <p className="mt-4 text-[0.8125rem] text-ink-2">{t('pub.notOfficial')}</p>
      </Panel>

      {closed && (c.findings || c.correctiveAction) ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="font-semibold">{t('case.airwatch.outcome')}</h2>
          <dl className="mt-2 space-y-3 text-[0.9375rem]">
            {c.findings ? <div><dt className="text-[0.8125rem] text-ink-2">{c.status === 'REJECTED' ? t('detail.rejectedReason') : t('detail.findings')}</dt><dd className="whitespace-pre-line">{c.findings}</dd></div> : null}
            {c.correctiveAction ? <div><dt className="text-[0.8125rem] text-ink-2">{t('detail.action')}</dt><dd className="whitespace-pre-line">{c.correctiveAction}</dd></div> : null}
          </dl>
          <p className="mt-3 text-[0.8125rem] text-ink-2">{t('case.airwatch.outcomeNote')}</p>
        </Panel>
      ) : null}

      {c.wardOffice ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-2.5 font-semibold">{t('pub.routedTo')}</h2>
          <WardOffice office={c.wardOffice} />
        </Panel>
      ) : null}

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
