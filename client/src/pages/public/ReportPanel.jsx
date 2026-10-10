import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ChevronRight, CircleCheck, EyeOff, MapPin, Radio } from 'lucide-react';
import { apiUrl } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtRelative } from '../../lib/format.js';
import { CasePositions, EvidenceTrail, FollowUpActions, NextStep, OfficialKit, ShareCase } from '../../components/CaseRecord.jsx';
import { DemoTag, WardOffice } from '../../components/civic.jsx';
import { SheetBody, SheetHeader, SheetSection } from '../../components/Sheet.jsx';
import { LoadError, Notice, Skeleton, StatusPill } from '../../components/ui.jsx';

export default function ReportPanel() {
  const { reference } = useParams();
  const { t, locale } = useI18n();
  const location = useLocation();
  // Polled so a change made on the case desk, or by another resident, shows up without a reload.
  const { data, error, loading, reload } = useApi(`/public/reports/${encodeURIComponent(reference)}`, { pollMs: 15_000 });
  const [formKind, setFormKind] = useState(null);
  const r = data?.report;
  useEffect(() => { document.title = `${reference} · AirWatch`; }, [reference]);

  if (error && !data) {
    return <><SheetHeader title={reference} /><div className="p-4">{error.status === 404 ? <Notice tone="info" title={t('pub.notFound')}>{t('pub.notFoundBody')}</Notice> : <LoadError error={error} onRetry={reload} />}</div></>;
  }
  if (loading && !data) return <><SheetHeader title={reference} /><div className="space-y-3 p-4"><Skeleton className="h-24" /><Skeleton className="h-48" /></div></>;

  const closed = r.status === 'RESOLVED' || r.status === 'REJECTED';
  const openForm = (kind) => {
    setFormKind(kind);
    requestAnimationFrame(() => document.getElementById('case-actions')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  return (
    <>
      <SheetHeader title={r.project?.name || r.locationText || t('pub.unlisted')}
        subtitle={<span className="num">{r.reference} · {t('common.updated', { time: fmtRelative(r.updatedAt, locale) })}</span>}>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusPill status={r.status} />
          {r.isDemo ? <DemoTag>{t('pub.demoTag')}</DemoTag> : null}
        </div>
      </SheetHeader>
      <SheetBody>
        {location.state?.justSubmitted ? (
          <div className="p-4"><Notice tone="ok" icon={CircleCheck} title={t('detail.submitted', { reference: r.reference })}>{t('pub.submittedBody')}</Notice></div>
        ) : null}

        <SheetSection title={t('case.title')}>
          <CasePositions report={r} />
          <div className="mt-3"><NextStep report={r} /></div>
        </SheetSection>

        <SheetSection title={formKind ? null : t('action.title')}>
          <div id="case-actions" className="scroll-mt-3">
            <FollowUpActions report={r} channels={data.dustAuthority.channels} formKind={formKind} setFormKind={setFormKind} onChanged={reload} />
          </div>
          {formKind ? null : (
            <div className="mt-4 border-t border-line pt-3">
              <h3 className="mb-2 text-[0.8125rem] font-medium text-ink-2">{t('share.title')}</h3>
              <ShareCase report={r} />
            </div>
          )}
        </SheetSection>

        {r.status === 'REJECTED' ? null : (
          <SheetSection>
            <details className="group" open={r.positions.official.state === 'NONE'}>
              <summary className="flex list-none items-center gap-1.5 text-[0.9375rem] font-semibold [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" aria-hidden />{t('kit.title')}
              </summary>
              <div className="mt-3">
                <OfficialKit report={r} wardOffice={r.wardOffice} authority={data.dustAuthority}
                  onAddReference={() => openForm('OFFICIAL_COMPLAINT')} onAddResponse={() => openForm('OFFICIAL_RESPONSE')} />
              </div>
            </details>
          </SheetSection>
        )}

        <SheetSection title={t('trail.title')}>
          <EvidenceTrail report={r} />
          <p className="mt-4 text-[0.8125rem] text-ink-2">{t('pub.notOfficial')}</p>
        </SheetSection>

        {closed && (r.findings || r.correctiveAction) ? (
          <SheetSection title={t('case.airwatch.outcome')}>
            <dl className="space-y-3 text-[0.875rem]">
              {r.findings ? <div><dt className="text-[0.8125rem] text-ink-2">{r.status === 'REJECTED' ? t('detail.rejectedReason') : t('detail.findings')}</dt><dd className="whitespace-pre-line">{r.findings}</dd></div> : null}
              {r.correctiveAction ? <div><dt className="text-[0.8125rem] text-ink-2">{t('detail.action')}</dt><dd className="whitespace-pre-line">{r.correctiveAction}</dd></div> : null}
            </dl>
            <p className="mt-3 text-[0.8125rem] text-ink-2">{t('case.airwatch.outcomeNote')}</p>
          </SheetSection>
        ) : null}

        <SheetSection title={t('pub.whatWasReported')}>
          {r.description ? <p className="max-w-[65ch] text-[0.9375rem] whitespace-pre-line">{r.description}</p>
            : <p className="flex items-start gap-2 text-[0.875rem] text-ink-2"><EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />{t('pub.withheld', { count: r.photoCount })}</p>}
          {r.photos.length ? (
            <ul className="mt-3 grid grid-cols-3 gap-2" aria-label={t('pub.photos')}>
              {r.photos.map((photo, i) => (
                <li key={photo.id} className="overflow-hidden rounded-lg border border-line">
                  <a href={apiUrl(photo.url)} target="_blank" rel="noreferrer"><img src={apiUrl(photo.url)} alt={t('pub.photoAlt', { n: i + 1 })} loading="lazy" className="aspect-square w-full object-cover" /></a>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 flex items-start gap-1.5 text-[0.8125rem] text-ink-2">
            <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {r.project ? <Link to={`/project/${r.project.code}`} className="font-medium text-accent underline">{r.project.name}</Link> : t('pub.approximate')}
          </p>
          {r.hasSensorFlag ? <p className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] text-ink-2"><Radio className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('pub.sensorFlag')}</p> : null}
        </SheetSection>

        <SheetSection title={t('pub.routedTo')}>
          <WardOffice office={r.wardOffice} />
          {r.ward ? <p className="mt-3 text-[0.875rem]"><Link to={`/ward/${r.ward.slug}`} className="font-medium text-accent underline">{t('pub.wardLink')}</Link></p> : null}
        </SheetSection>
      </SheetBody>
    </>
  );
}
