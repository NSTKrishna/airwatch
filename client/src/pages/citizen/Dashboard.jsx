import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronRight, Clock, TriangleAlert } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { domainWarningList, fmtNumber, fmtRelative, fmtTime, noAssessmentReason, verdictOf } from '../../lib/format.js';
import SiteMap from '../../components/SiteMap.jsx';
import { DifferenceChart, LevelsChart } from '../../components/charts.jsx';
import { ReadingComparison } from '../../components/Reading.jsx';
import { LoadError, Notice, Panel, SourceTag, Skeleton, VerdictBadge, buttonClass } from '../../components/ui.jsx';

const TREND_HOURS = 3;

function LocalityPicker({ localities, selected, onSelect }) {
  const { t, place } = useI18n();
  return (
    <div role="radiogroup" aria-label={t('monitor.chooseLocality')} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {localities.map((l) => {
        const active = l.code === selected;
        return (
          <button key={l.code} type="button" role="radio" aria-checked={active} onClick={() => onSelect(l.code)}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors duration-150 ${active ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface text-ink hover:border-ink-3'}`}>
            <span className="block text-[0.9375rem] font-semibold">{place(l)}</span>
            <span className={`mt-0.5 flex items-center gap-1 text-[0.75rem] ${active ? 'text-white/85' : l.activeAnomalies ? 'font-medium text-flag' : 'text-ink-2'}`}>
              {l.activeAnomalies ? <TriangleAlert className="size-3" aria-hidden /> : null}
              {l.activeAnomalies ? t('monitor.flaggedCount', { count: l.activeAnomalies }) : t('monitor.noneFlagged')}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SiteRow({ site, selected, onSelect }) {
  const { t, locale } = useI18n();
  const verdict = verdictOf(site.latest);
  return (
    <li>
      <button type="button" onClick={() => onSelect(site.id)} aria-current={selected || undefined}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 ${selected ? 'bg-accent-soft/60' : 'hover:bg-paper'}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{site.name}</span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <VerdictBadge verdict={verdict} />
            {site.latest?.site.ugm3 != null ? (
              <span className="num text-[0.8125rem] text-ink-2">PM10 {fmtNumber(site.latest.site.ugm3, 0, locale)} · PM2.5 {fmtNumber(site.latest.site.pm25Ugm3, 0, locale)} {t('common.unit')}</span>
            ) : null}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  );
}

function SiteDetail({ site }) {
  const { t, locale } = useI18n();
  const history = useApi(`/sites/${site.id}/history?hours=${TREND_HOURS}`, { pollMs: 60_000 });
  const latest = site.latest;
  const evaluation = latest?.evaluation;
  const verdict = verdictOf(latest);
  const evaluated = evaluation?.status === 'EVALUATED';
  const why = noAssessmentReason(site);
  const warned = verdict !== 'none' ? domainWarningList(evaluation) : '';
  const points = history.data?.points || [];
  const hasTrend = points.length >= 2;

  return (
    <Panel aria-labelledby="site-heading" className="overflow-hidden">
      <div className={`px-4 py-4 sm:px-5 ${verdict === 'flagged' ? 'bg-flag-soft' : ''}`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h2 id="site-heading" className="text-lg leading-snug font-semibold">{site.name}</h2>
            <p className="text-[0.875rem] text-ink-2">{site.address}{site.simulated ? ` · ${t('monitor.demoSite')}` : ''}</p>
          </div>
          <VerdictBadge verdict={verdict} size="lg" />
        </div>
        <p className="mt-3 text-[0.9375rem] text-ink">
          {verdict === 'flagged' ? t('verdict.flaggedLong')
            : verdict === 'normal' ? t('verdict.normalLong')
              : t(`verdict.reason.${why.key}`, why.vars)}
        </p>
        {verdict === 'flagged' ? <p className="mt-1 text-[0.8125rem] text-ink-2">{t('verdict.disclaimer')}</p> : null}
      </div>

      {latest ? (
        <div className="border-t border-line px-4 py-4 sm:px-5">
          <ReadingComparison background={latest.background.ugm3} site={latest.site.ugm3} pm25={latest.site.pm25Ugm3} evaluation={verdict === 'none' && evaluated ? null : evaluation} />
          {warned ? <div className="mt-4"><Notice tone="warn">{t('verdict.domainWarning', { list: warned })}</Notice></div> : null}
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[0.8125rem] text-ink-2">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{t('monitor.measuredAt', { time: `${fmtTime(latest.site.timestamp, locale)} (${fmtRelative(latest.site.timestamp, locale)})` })}</span>
            <SourceTag source={latest.dataSource} />
          </p>
          <details className="group mt-3 text-[0.8125rem]">
            <summary className="inline-flex list-none items-center gap-1 font-medium text-accent [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden />{t('monitor.details')}
            </summary>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-2">
              {evaluated ? (
                <>
                  <dt>{t('monitor.expected')}</dt><dd className="num text-ink">{fmtNumber(evaluation.expectedNormalDifference, 1, locale)} {t('common.unit')}</dd>
                  <dt>{t('monitor.margin')}</dt><dd className="num text-ink">{fmtNumber(evaluation.calibratedMargin, 1, locale)} {t('common.unit')}</dd>
                  <dt>{t('monitor.model')}</dt><dd className="break-all text-ink">{evaluation.model?.version}</dd>
                </>
              ) : null}
              {site.device ? <dt className="col-span-2">{t('monitor.device', { id: site.device.deviceId, seconds: site.device.samplingIntervalSeconds })}</dt> : null}
              <dt className="col-span-2">{t('monitor.station', { station: site.station.name, distance: fmtNumber(site.distanceToBackgroundM, 0, locale) })}</dt>
              {latest.weather.source ? <dt className="col-span-2">{t('monitor.windFrom', { source: latest.weather.source })}</dt> : null}
              <dd className="col-span-2">{t('monitor.pm25Note')}</dd>
              <dd className="col-span-2">{t('monitor.barrierHelp')}</dd>
              <dd className="col-span-2">{t('monitor.modelNote')}</dd>
            </dl>
          </details>
        </div>
      ) : null}

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <h3 className="text-[0.9375rem] font-semibold">{t('monitor.trend', { hours: TREND_HOURS })}</h3>
        {history.loading && !history.data ? <Skeleton className="mt-3 h-48" />
          : !hasTrend ? <p className="mt-2 text-[0.875rem] text-ink-2">{t('monitor.noHistory')}</p>
            : (
              <div className="mt-2 space-y-5">
                {points.some((p) => p.barrier != null) ? (
                  <figure>
                    <figcaption className="text-[0.8125rem] text-ink-2">{t('monitor.chartDifference')} ({t('common.unit')})</figcaption>
                    <DifferenceChart points={points} labels={{ difference: t('monitor.difference'), barrier: t('monitor.barrier'), flagged: t('verdict.flagged') }} height={190} />
                  </figure>
                ) : null}
                <figure>
                  <figcaption className="text-[0.8125rem] text-ink-2">{t('monitor.chartLevels')} ({t('common.unit')})</figcaption>
                  <LevelsChart points={points} labels={{ site: t('monitor.site'), background: t('monitor.background') }} height={190} />
                </figure>
              </div>
            )}
      </div>

      <div className="border-t border-line bg-paper/60 px-4 py-3 sm:px-5">
        <Link to={`/citizen/report?locality=${site.locality.code}&site=${site.id}`} className={buttonClass({ block: true, size: 'lg' })}>
          <Camera className="size-4.5" aria-hidden />{t('monitor.reportSite')}
        </Link>
      </div>
    </Panel>
  );
}

export default function CitizenDashboard() {
  const { t, locale, place } = useI18n();
  const [params, setParams] = useSearchParams();
  const detailRef = useRef(null);
  const localities = useApi('/localities', { pollMs: 30_000 });
  const code = params.get('locality') || localities.data?.localities[0]?.code || null;
  const area = useApi(code ? `/localities/${code}` : null, { pollMs: 30_000 });

  const sites = area.data?.sites || [];
  // Default to a flagged site when there is one: that is what the visitor came to see.
  const selectedId = params.get('site') && sites.some((s) => s.id === params.get('site'))
    ? params.get('site')
    : (sites.find((s) => verdictOf(s.latest) === 'flagged') || sites[0])?.id;
  const selected = sites.find((s) => s.id === selectedId);

  const select = (next, scroll) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      Object.entries(next).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
      return p;
    }, { replace: true });
    if (scroll && window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  useEffect(() => { document.title = `${t('nav.monitor')} · AirWatch`; }, [t]);

  if (localities.error && !localities.data) return <LoadError error={localities.error} onRetry={localities.reload} />;

  const localityName = place(area.data?.locality);
  const latestAt = sites.map((s) => s.latest?.receivedAt).filter(Boolean).sort().at(-1);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('monitor.title')}</h1>
        {latestAt ? <p className="text-[0.8125rem] text-ink-2">{t('common.updated', { time: fmtRelative(latestAt, locale) })}</p> : null}
      </div>

      <div className="mt-4">
        {localities.data ? <LocalityPicker localities={localities.data.localities} selected={code} onSelect={(c) => select({ locality: c, site: null })} />
          : <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[3.75rem]" />)}</div>}
      </div>

      {area.error && !area.data ? <div className="mt-5"><LoadError error={area.error} onRetry={area.reload} /></div> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <div className="space-y-4">
          {area.data ? (
            <>
              <SiteMap label={t('monitor.map', { locality: localityName })} className="h-64 sm:h-80"
                sites={sites.map((s) => ({ ...s, verdict: verdictOf(s.latest) }))} stations={area.data.stations}
                selectedId={selectedId} onSelect={(id) => select({ site: id }, true)} />
              <p className="flex flex-wrap gap-x-4 gap-y-1 text-[0.75rem] text-ink-2">
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-flag" />{t('verdict.flagged')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-ok" />{t('verdict.normal')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#6b7572]" />{t('verdict.none')}</span>
                <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] border-2 border-series-1 bg-surface" />{t('monitor.legend.station')}</span>
              </p>
              <Panel aria-label={t('monitor.sitesIn', { locality: localityName })}>
                <h2 className="border-b border-line px-4 py-2.5 text-[0.8125rem] font-semibold text-ink-2">{t('monitor.sitesIn', { locality: localityName })}</h2>
                <ul className="divide-y divide-line">
                  {sites.map((s) => <SiteRow key={s.id} site={s} selected={s.id === selectedId} onSelect={(id) => select({ site: id }, true)} />)}
                </ul>
              </Panel>
            </>
          ) : area.loading ? <><Skeleton className="h-64 sm:h-80" /><Skeleton className="h-36" /></> : null}

        </div>

        <div ref={detailRef} className="scroll-mt-28 lg:sticky lg:top-28 lg:row-span-2">
          {selected ? <SiteDetail key={selected.id} site={selected} /> : area.loading ? <Skeleton className="h-96" /> : null}
        </div>

        <div className="rounded-(--radius-card) border border-dashed border-line-strong px-4 py-4 lg:col-start-1">
          <p className="font-medium">{t('monitor.reportAnyway')}</p>
          <p className="mt-0.5 text-[0.875rem] text-ink-2">{t('monitor.reportAnywayBody')}</p>
          <Link to={`/citizen/report${code ? `?locality=${code}` : ''}`} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} mt-3`}>
            <Camera className="size-4" aria-hidden />{t('monitor.reportOther')}
          </Link>
        </div>
      </div>
    </div>
  );
}
