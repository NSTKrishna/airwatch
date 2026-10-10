import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { DustAuthority, RecordTag, Sources, WardOffice } from '../../components/civic.jsx';
import { SheetBody, SheetHeader, SheetSection } from '../../components/Sheet.jsx';
import { LoadError, Notice, Skeleton } from '../../components/ui.jsx';
import { ReportRow } from './MapHome.jsx';

const ROLES = ['MLA', 'MP', 'CORPORATOR'];

function People({ people }) {
  return (
    <ul className="mt-1.5 space-y-1.5 text-[0.875rem]">
      {people.map((p) => (
        <li key={`${p.role}-${p.constituency}`}>
          <span className="font-medium">{p.name}</span>{p.party ? <span className="text-ink-2"> · {p.party}</span> : null}
          <span className="block text-[0.8125rem] text-ink-2">{p.constituency}{p.note ? ` · ${p.note}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}

function Representatives({ people }) {
  const { t } = useI18n();
  if (!people.length) return <p className="text-[0.875rem] text-ink-2">{t('ward.noRepresentatives')}</p>;
  const wardNumber = (p) => Number(/\d+/.exec(p.constituency)?.[0] ?? 0);
  return (
    <div className="space-y-4">
      {ROLES.filter((role) => people.some((p) => p.role === role)).map((role) => {
        const group = people.filter((p) => p.role === role).sort((x, y) => wardNumber(x) - wardNumber(y));
        const sources = <div className="mt-2"><Sources urls={[...new Set(group.map((p) => p.sourceUrl))]} verifiedOn={group[0].verifiedOn} /></div>;
        // A ward has many corporators and this map cannot tell which electoral ward an address is in.
        return role === 'CORPORATOR' ? (
          <details key={role} className="group">
            <summary className="inline-flex list-none items-center gap-1 text-[0.875rem] font-medium text-accent [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden />{t('ward.corporators', { count: group.length })}
            </summary>
            <People people={group} />
            {sources}
          </details>
        ) : (
          <div key={role}>
            <h3 className="text-[0.8125rem] font-medium text-ink-2">{t(`ward.role.${role}`)}</h3>
            <People people={group} />
            {sources}
          </div>
        );
      })}
    </div>
  );
}

export default function WardPanel() {
  const { slug } = useParams();
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi(`/public/wards/${slug}`, { pollMs: 60_000 });
  const w = data?.ward;
  useEffect(() => { if (w) document.title = `${t('ward.title', { name: w.name })} · AirWatch`; }, [w, t]);

  if (error && !data) {
    return <><SheetHeader title={t('ward.notFoundTitle')} /><div className="p-4">{error.status === 404 ? <Notice tone="info" title={t('ward.notFound')} /> : <LoadError error={error} onRetry={reload} />}</div></>;
  }
  if (loading && !data) return <><SheetHeader title={<Skeleton className="h-6 w-40" />} /><div className="space-y-3 p-4"><Skeleton className="h-28" /><Skeleton className="h-40" /></div></>;

  return (
    <>
      <SheetHeader title={t('ward.title', { name: w.name })} subtitle={w.areas} />
      <SheetBody>
        {w.pilot ? null : <div className="p-4"><Notice tone="info" title={t('ward.notPilot')}>{t('ward.notPilotBody')}</Notice></div>}

        {w.office ? (
          <SheetSection title={t('ward.office')} aside={<RecordTag />}>
            <WardOffice office={w.office} />
            {w.note ? <div className="mt-3"><Notice tone="info">{w.note}</Notice></div> : null}
          </SheetSection>
        ) : null}

        <SheetSection title={t('civic.whoHandles')}>
          <DustAuthority authority={data.dustAuthority} />
        </SheetSection>

        {w.pilot ? (
          <SheetSection title={t('ward.representatives')}>
            <p className="mb-3 text-[0.8125rem] text-ink-2">{t('ward.representativesNote')}</p>
            <Representatives people={data.representatives} />
          </SheetSection>
        ) : null}

        {data.projects.length ? (
          <SheetSection title={t('ward.projects', { count: data.projects.length })} flush>
            <ul className="divide-y divide-line border-t border-line">
              {data.projects.map((p) => (
                <li key={p.code}>
                  <Link to={`/project/${p.code}`} className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 hover:bg-paper">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[0.9375rem] font-medium">{p.name}</span>
                      <span className="block truncate text-[0.8125rem] text-ink-2">{[p.developer, p.registrationNo].filter(Boolean).join(' · ') || p.authority}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </SheetSection>
        ) : null}

        {w.pilot ? (
          <SheetSection title={t('ward.reports', { count: data.reports.length })} flush>
            {data.reports.length
              ? <ul className="divide-y divide-line border-t border-line">{data.reports.map((r) => <ReportRow key={r.reference} report={r} />)}</ul>
              : <p className="px-4 text-[0.875rem] text-ink-2">{t('ward.noReports')}</p>}
          </SheetSection>
        ) : null}
      </SheetBody>
    </>
  );
}
