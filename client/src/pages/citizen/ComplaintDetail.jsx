import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CircleCheck, EyeOff, MapPin } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtDate, fmtDateTime } from '../../lib/format.js';
import { reportPersists } from '../../lib/mapMarkers.js';
import { DemoTag, WardOffice } from '../../components/civic.jsx';
import { CasePositions, DemoImageNote, EvidenceTrail, NextStep, OfficialFlow, ShareCase, SiteCheck } from '../../components/CaseRecord.jsx';
import PlaceMap from '../../components/PlaceMap.jsx';
import { ReadingComparison } from '../../components/Reading.jsx';
import { AuthImage, FoldPanel, LoadError, Notice, Panel, SourceTag, Skeleton, StatusPill, VerdictBadge } from '../../components/ui.jsx';

const TARGET_ID = { official: 'official-complaint', site: 'site-check', share: 'share-case' };

export default function ComplaintDetail() {
  const { id } = useParams();
  const { t, locale } = useI18n();
  const location = useLocation();
  const { data, error, loading, reload } = useApi(`/complaints/${id}`, { pollMs: 45_000 });
  const c = data?.complaint;
  const [openStep, setOpenStep] = useState(null);
  useEffect(() => { document.title = `${c?.reference || t('complaints.title')} · AirWatch`; }, [c, t]);

  const back = (
    <Link to="/citizen/complaints" className="inline-flex items-center gap-1 text-[0.875rem] font-medium text-ink-2 hover:text-ink">
      <ArrowLeft className="size-4" aria-hidden />{t('complaints.title')}
    </Link>
  );
  if (error && !data) {
    return <div className="mx-auto max-w-2xl space-y-4">{back}{error.status === 404 ? <Notice tone="info" title={t('detail.notFound')} /> : <LoadError error={error} onRetry={reload} />}</div>;
  }
  if (loading && !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" /><Skeleton className="h-36" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_23rem]"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
      </div>
    );
  }

  const closed = c.status === 'RESOLVED' || c.status === 'REJECTED';
  const snapshot = c.sensorSnapshot;
  const isPublic = Boolean(c.ward) && !c.publicHidden;
  const [lead, ...thumbs] = c.attachments;
  // "What to do next" takes the reader to the part of the page it is about.
  const go = (target) => {
    if (target === 'official') setOpenStep({ step: c.positions.official.state === 'NONE' ? 'send' : 'reply' });
    requestAnimationFrame(() => {
      const el = document.getElementById(TARGET_ID[target]);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="space-y-5">
      {back}
      {location.state?.justSubmitted ? (
        <Notice tone="ok" icon={CircleCheck} title={t('detail.submitted', { reference: c.reference })}>{t('detail.submittedNext')}</Notice>
      ) : null}

      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={c.status} />
            {c.isDemo ? <DemoTag>{t('pub.demoTag')}</DemoTag> : null}
          </div>
          <h1 className="mt-2 text-2xl leading-snug font-semibold tracking-tight">{c.project?.name || c.site?.name || c.locationText || t('complaints.unlistedSite')}</h1>
          <p className="num mt-1 text-[0.875rem] text-ink-2">
            {c.reference} · {c.ward ? t('ward.title', { name: c.ward.name }) : c.locality?.name} · {t('complaints.filed', { time: fmtDate(c.createdAt, locale) })}
          </p>
        </div>
        {/* The case link is what the citizen takes away: it works for anyone, signed in or not. */}
        {isPublic ? (
          <div id="share-case" tabIndex={-1} className="scroll-mt-4 outline-none">
            <p className="mb-1.5 text-[0.8125rem] text-ink-2">{t('detail.caseLinkBody')}</p>
            <ShareCase report={c} />
          </div>
        ) : null}
      </header>
      {c.publicHidden ? <Notice tone="info" icon={EyeOff}>{t('detail.hidden')}</Notice> : null}

      {c.positions ? (
        <Panel className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('case.title')}</h2>
          <CasePositions report={c} columns />
          <div className="mt-4"><NextStep report={c} onGo={go} /></div>
        </Panel>
      ) : null}

      {/* Two columns on a wide screen. On a phone the cards run in one column in `order`:
          evidence and the on-site check first, then the BMC steps, then the record. */}
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start">
        <div className="contents lg:block lg:space-y-5">
          {c.ward && c.status !== 'REJECTED' && c.positions ? (
            <FoldPanel id="official-complaint" tabIndex={-1} className="order-3 outline-none" title={t('kit.title')} summary={t(`case.official.${c.positions.official.state}`)}>
              <OfficialFlow report={c} wardOffice={c.wardOffice} authority={data.dustAuthority} onChanged={reload} openStep={openStep} />
            </FoldPanel>
          ) : null}

          {closed && (c.findings || c.correctiveAction) ? (
            <FoldPanel className="order-4" title={t('case.airwatch.outcome')}>
              <dl className="space-y-3 text-[0.9375rem]">
                {c.findings ? <div><dt className="text-[0.8125rem] text-ink-2">{c.status === 'REJECTED' ? t('detail.rejectedReason') : t('detail.findings')}</dt><dd className="max-w-[70ch] whitespace-pre-line">{c.findings}</dd></div> : null}
                {c.correctiveAction ? <div><dt className="text-[0.8125rem] text-ink-2">{t('detail.action')}</dt><dd className="max-w-[70ch] whitespace-pre-line">{c.correctiveAction}</dd></div> : null}
              </dl>
              <p className="mt-3 text-[0.8125rem] text-ink-2">{t('case.airwatch.outcomeNote')}</p>
            </FoldPanel>
          ) : null}

          <FoldPanel className="order-5" title={t('trail.title')} summary={t('trail.count', { count: c.followUps.length + c.timeline.filter((e) => e.toStatus).length })}>
            <EvidenceTrail report={c} />
            <p className="mt-4 text-[0.8125rem] text-ink-2">{t('pub.notOfficial')}</p>
          </FoldPanel>
        </div>

        <aside className="contents lg:block lg:space-y-5">
          <Panel className="order-1 p-4 sm:p-5">
            <h2 className="font-semibold">{t('detail.yourReport')}</h2>
            {lead ? (
              <div className="mt-3">
                <div className="overflow-hidden rounded-lg border border-line"><AuthImage url={lead.url} alt={t('pub.photoAlt', { n: 1 })} className="aspect-[4/3] w-full" /></div>
                {thumbs.length ? (
                  <ul className="mt-2 grid grid-cols-3 gap-2" aria-label={t('detail.photos')}>
                    {thumbs.map((a, i) => (
                      <li key={a.id} className="overflow-hidden rounded-lg border border-line"><AuthImage url={a.url} alt={t('pub.photoAlt', { n: i + 2 })} className="aspect-square w-full" /></li>
                    ))}
                  </ul>
                ) : null}
                {c.isDemo ? <DemoImageNote className="mt-1.5" /> : null}
              </div>
            ) : null}
            <p className="mt-3 max-w-[70ch] whitespace-pre-line">{c.description}</p>
            {(c.locationText || c.latitude != null) ? (
              <p className="mt-3 flex items-start gap-1.5 text-[0.875rem] text-ink-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>{c.locationText}{c.locationText && c.latitude != null ? ' · ' : ''}{c.latitude != null ? <span className="num">{c.latitude.toFixed(4)}, {c.longitude.toFixed(4)}</span> : null}</span>
              </p>
            ) : null}
            {c.latitude != null ? (
              <div className="mt-3">
                <PlaceMap label={t('detail.mapLabel')} className="h-40 max-lg:hidden" wardCode={c.ward?.code}
                  project={c.project} report={{ latitude: c.latitude, longitude: c.longitude, status: c.status, persists: reportPersists(c) }} />
                {isPublic ? <p className="mt-2 text-[0.875rem]"><Link to={`/report/${c.reference}`} className="font-medium text-accent underline">{t('detail.onMap')}</Link></p> : null}
              </div>
            ) : null}
          </Panel>

          {c.positions ? (
            <Panel id="site-check" tabIndex={-1} className="order-2 scroll-mt-4 p-4 outline-none sm:p-5">
              <h2 className="mb-1.5 font-semibold">{t('site.title')}</h2>
              <SiteCheck report={c} channels={data.dustAuthority.channels} onChanged={reload} />
            </Panel>
          ) : null}

          {c.anomalyEvidence ? (
            <FoldPanel className="order-6" defaultOpen={false} title={t('detail.evidence')} summary={t('verdict.flagged')} aside={<VerdictBadge verdict="flagged" />}>
              <ReadingComparison background={c.anomalyEvidence.backgroundValue} site={c.anomalyEvidence.siteValue} evaluation={c.anomalyEvidence} />
              <p className="mt-4 flex flex-wrap items-center gap-2 text-[0.8125rem] text-ink-2">
                <span className="num">{t('monitor.measuredAt', { time: fmtDateTime(c.anomalyEvidence.siteTimestamp, locale) })}</span>
                <SourceTag source={c.anomalyEvidence.dataSource} />
              </p>
              <p className="mt-2 text-[0.8125rem] text-ink-2">{t('verdict.disclaimer')}</p>
            </FoldPanel>
          ) : snapshot ? (
            <FoldPanel className="order-6" defaultOpen={false} title={t('detail.snapshot')} aside={<SourceTag source={snapshot.dataSource} />}>
              <p className="mb-4 text-[0.875rem] text-ink-2">{t('detail.evidenceNone')}</p>
              <ReadingComparison background={snapshot.background?.ugm3} site={snapshot.site?.ugm3} pm25={snapshot.site?.pm25Ugm3} evaluation={snapshot.evaluation} />
              <p className="num mt-4 text-[0.8125rem] text-ink-2">{t('monitor.measuredAt', { time: fmtDateTime(snapshot.site?.timestamp, locale) })}</p>
            </FoldPanel>
          ) : null}

          {c.wardOffice ? (
            <FoldPanel className="order-7" defaultOpen={false} title={t('pub.routedTo')} summary={t('civic.wardOffice', { name: c.wardOffice.name })}>
              <WardOffice office={c.wardOffice} />
            </FoldPanel>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
