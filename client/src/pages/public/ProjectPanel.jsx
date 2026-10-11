import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, ChevronRight, Clock, Droplets, Thermometer } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtNumber, fmtRelative, fmtTime, noAssessmentReason, verdictOf } from '../../lib/format.js';
import { DifferenceChart, ParticulateChart, SERIES, SingleSeriesChart } from '../../components/charts.jsx';
import { DemoTag, RecordTag, Sources } from '../../components/civic.jsx';
import { Metric, ReadingComparison } from '../../components/Reading.jsx';
import { SheetBody, SheetHeader, SheetSection } from '../../components/Sheet.jsx';
import { LoadError, Notice, Skeleton, VerdictBadge, buttonClass } from '../../components/ui.jsx';
import { ReportRow } from './MapHome.jsx';

const RANGES = [6, 24, 72, 168];

function Fact({ label, children }) {
  if (!children) return null;
  return <div className="grid grid-cols-[7.5rem_1fr] gap-x-3"><dt className="text-ink-2">{label}</dt><dd className="min-w-0 break-words">{children}</dd></div>;
}

function Monitor({ monitor }) {
  const { t, locale } = useI18n();
  const [hours, setHours] = useState(24);
  const history = useApi(`/public/sites/${monitor.siteId}/history?hours=${hours}`, { pollMs: 60_000 });
  const latest = monitor.latest;
  const evaluation = latest?.evaluation;
  const verdict = verdictOf(latest);
  const evaluated = evaluation?.status === 'EVALUATED';
  const why = noAssessmentReason({ withheld: monitor.withheld, latest });
  const points = history.data?.points || [];
  const n = (v, digits = 1) => fmtNumber(v, digits, locale);

  return (
    <>
      <div className={`-mx-4 -mt-4 px-4 py-4 ${verdict === 'flagged' ? 'bg-flag-soft' : 'bg-warn-soft/45'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[0.9375rem] font-semibold">{t('sensor.title')}</h2>
          <DemoTag>{t('sensor.tag')}</DemoTag>
        </div>
        <p className="mt-1 text-[0.8125rem] text-ink-2">{t('sensor.notice', { id: monitor.device?.deviceId || '' })}</p>
        <div className="mt-3"><VerdictBadge verdict={verdict} size="lg" /></div>
        <p className="mt-2 text-[0.875rem]">
          {verdict === 'flagged' ? t('verdict.flaggedLong') : verdict === 'normal' ? t('verdict.normalLong') : t(`verdict.reason.${why.key}`, why.vars)}
        </p>
        {verdict === 'flagged' ? <p className="mt-1 text-[0.8125rem] text-ink-2">{t('verdict.disclaimer')}</p> : null}
      </div>

      {latest ? (
        <div className="pt-4">
          <ReadingComparison background={latest.background.ugm3} site={latest.site.ugm3} pm25={latest.site.pm25Ugm3} evaluation={verdict === 'none' && evaluated ? null : evaluation} />
          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4">
            <Metric label={<span className="inline-flex items-center gap-1"><Thermometer className="size-3.5" aria-hidden />{t('sensor.temperature')}</span>} value={n(latest.weather.temperatureC)} unit="°C" />
            <Metric label={<span className="inline-flex items-center gap-1"><Droplets className="size-3.5" aria-hidden />{t('sensor.humidity')}</span>} value={n(latest.weather.humidityPct, 0)} unit="%" />
          </dl>
          {evaluation?.domainWarnings?.length ? <Notice tone="warn">This demo reading is outside supported conditions. Treat it as a signal for review.</Notice> : null}
          <p className="mt-4 inline-flex items-center gap-1 text-[0.8125rem] text-ink-2">
            <Clock className="size-3.5" aria-hidden />{t('monitor.measuredAt', { time: `${fmtTime(latest.site.timestamp, locale)} (${fmtRelative(latest.site.timestamp, locale)})` })}
          </p>
        </div>
      ) : null}

      <div className="mt-5 border-t border-line pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[0.9375rem] font-semibold">{t('sensor.history')}</h3>
          <div role="group" aria-label={t('sensor.range')} className="inline-flex rounded-lg border border-line-strong p-0.5">
            {RANGES.map((h) => (
              <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)}
                className={`num h-7 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors duration-150 ${hours === h ? 'bg-accent text-white' : 'text-ink-2 hover:bg-mute-soft'}`}>
                {h < 48 ? t('sensor.hours', { count: h }) : t('sensor.days', { count: h / 24 })}
              </button>
            ))}
          </div>
        </div>
        {history.error && !history.data ? <div className="mt-3"><LoadError error={history.error} onRetry={history.reload} /></div>
          : history.loading && !history.data ? <Skeleton className="mt-3 h-48" />
            : points.length < 2 ? <p className="mt-2 text-[0.875rem] text-ink-2">{t('monitor.noHistory')}</p>
              : (
                <div className="mt-3 space-y-5">
                  <figure>
                    <figcaption className="text-[0.8125rem] text-ink-2">{t('sensor.chartParticulate')} ({t('common.unit')})</figcaption>
                    <ParticulateChart points={points} height={200}
                      labels={{ site: t('monitor.site'), pm25: t('monitor.pm25'), background: t('monitor.background'), flagged: t('verdict.flagged') }} />
                  </figure>
                  {points.some((p) => p.barrier != null) ? (
                    <figure>
                      <figcaption className="text-[0.8125rem] text-ink-2">{t('monitor.chartDifference')} ({t('common.unit')})</figcaption>
                      <DifferenceChart points={points} height={180} labels={{ difference: t('monitor.difference'), barrier: t('monitor.barrier'), flagged: t('verdict.flagged') }} />
                      <p className="num mt-1 text-[0.8125rem] text-ink-2">{t('sensor.flagCount', { count: points.reduce((sum, p) => sum + (p.anomalies || 0), 0) })}</p>
                    </figure>
                  ) : null}
                  <figure>
                    <figcaption className="text-[0.8125rem] text-ink-2">{t('sensor.temperature')} (°C)</figcaption>
                    <SingleSeriesChart points={points} dataKey="temperature" label={t('sensor.temperature')} unit="°C" color={SERIES.temperature} />
                  </figure>
                  <figure>
                    <figcaption className="text-[0.8125rem] text-ink-2">{t('sensor.humidity')} (%)</figcaption>
                    <SingleSeriesChart points={points} dataKey="humidity" label={t('sensor.humidity')} unit="%" color={SERIES.humidity} />
                  </figure>
                </div>
              )}
      </div>

      <details className="group mt-4 text-[0.8125rem]">
        <summary className="inline-flex list-none items-center gap-1 font-medium text-accent [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden />{t('monitor.details')}
        </summary>
        <ul className="mt-2 space-y-1.5 text-ink-2">
          <li>{t('sensor.background', { distance: fmtNumber(monitor.background.distanceM, 0, locale) })}</li>
          <li>{t('monitor.pm25Note')}</li>
          <li>{t('monitor.barrierHelp')}</li>
          <li><Link className="font-medium text-accent underline" to="/methodology">{t('method.link')}</Link></li>
        </ul>
      </details>
    </>
  );
}

export default function ProjectPanel() {
  const { code } = useParams();
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi(`/public/projects/${code}`, { pollMs: 30_000 });
  const p = data?.project;
  useEffect(() => { if (p) document.title = `${p.name} · AirWatch`; }, [p]);

  if (error && !data) {
    return <><SheetHeader title={t('project.notFoundTitle')} /><div className="p-4">{error.status === 404 ? <Notice tone="info" title={t('project.notFound')} /> : <LoadError error={error} onRetry={reload} />}</div></>;
  }
  if (loading && !data) return <><SheetHeader title={<Skeleton className="h-6 w-56" />} /><div className="space-y-3 p-4"><Skeleton className="h-28" /><Skeleton className="h-56" /></div></>;

  return (
    <>
      <SheetHeader title={p.name} subtitle={<Link to={`/ward/${p.ward.slug}`} className="font-medium text-accent underline">{t('ward.title', { name: p.ward.name })}</Link>} />
      <SheetBody>
        <SheetSection title={t('project.record')} aside={<RecordTag />}>
          {p.description ? <p className="mb-3 text-[0.875rem]">{p.description}</p> : null}
          <dl className="space-y-1.5 text-[0.875rem]">
            <Fact label={t('project.developer')}>{p.developer}</Fact>
            <Fact label={t('project.register')}>{[p.authority, p.registrationNo].filter(Boolean).join(' · ')}</Fact>
            <Fact label={t('project.category')}>{t(`project.category.${p.category}`)}</Fact>
            <Fact label={t('project.address')}>{p.address}</Fact>
            <Fact label={t('project.status')}>{p.status}</Fact>
            <Fact label={t('project.completion')}>{p.proposedCompletion}</Fact>
            <Fact label={t('project.position')}>{p.latitude != null ? t(`project.precision.${p.coordinatePrecision || 'site'}`) : t('project.precision.none')}</Fact>
          </dl>
          <div className="mt-3"><Sources urls={p.sourceUrls} verifiedOn={p.verifiedOn} /></div>
        </SheetSection>

        <SheetSection>
          {p.monitor ? <Monitor key={p.monitor.siteId} monitor={p.monitor} /> : <p className="text-[0.875rem] text-ink-2">{t('project.noMonitorLong')}</p>}
        </SheetSection>

        <SheetSection title={t('project.reports', { count: data.reports.length })} flush>
          {data.reports.length
            ? <ul className="divide-y divide-line border-t border-line">{data.reports.map((r) => <ReportRow key={r.reference} report={r} />)}</ul>
            : <p className="px-4 text-[0.875rem] text-ink-2">{t('project.noReports')}</p>}
        </SheetSection>
      </SheetBody>
      <div className="shrink-0 border-t border-line bg-paper/70 p-3">
        <Link to={`/citizen/report?project=${p.code}`} className={buttonClass({ block: true, size: 'lg' })}><Camera className="size-4.5" aria-hidden />{t('project.reportHere')}</Link>
      </div>
    </>
  );
}
