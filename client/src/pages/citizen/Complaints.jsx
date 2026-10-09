import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, FileText, Plus, Radio } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtDate } from '../../lib/format.js';
import { EmptyState, LoadError, Panel, Skeleton, StatusPill, buttonClass } from '../../components/ui.jsx';

export default function MyComplaints() {
  const { t, locale, place } = useI18n();
  const { data, error, loading, reload } = useApi('/complaints', { pollMs: 45_000 });
  useEffect(() => { document.title = `${t('complaints.title')} · AirWatch`; }, [t]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('complaints.title')}</h1>
        <Link to="/citizen/report" className={buttonClass({ size: 'sm' })}><Plus className="size-4" aria-hidden />{t('complaints.new')}</Link>
      </div>

      <div className="mt-5">
        {error && !data ? <LoadError error={error} onRetry={reload} />
          : loading && !data ? <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
            : data.complaints.length === 0 ? (
              <Panel>
                <EmptyState icon={FileText} title={t('complaints.empty')}
                  action={<Link to="/citizen/report" className={buttonClass()}>{t('monitor.reportOther')}</Link>}>
                  {t('complaints.emptyBody')}
                </EmptyState>
              </Panel>
            ) : (
              <Panel as="ul" className="divide-y divide-line overflow-hidden">
                {data.complaints.map((c) => (
                  <li key={c.id}>
                    <Link to={`/citizen/complaints/${c.id}`} className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-150 hover:bg-paper">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{c.site?.name || c.locationText || t('complaints.unlistedSite')}</p>
                        <p className="num mt-0.5 text-[0.8125rem] text-ink-2">{c.reference} · {place(c.locality)} · {t('complaints.filed', { time: fmtDate(c.createdAt, locale) })}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <StatusPill status={c.status} />
                          {c.hasAnomalyEvidence ? (
                            <span className="inline-flex items-center gap-1 text-[0.75rem] text-ink-2"><Radio className="size-3.5" aria-hidden />{t('complaints.withEvidence')}</span>
                          ) : null}
                        </div>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
                    </Link>
                  </li>
                ))}
              </Panel>
            )}
      </div>
    </div>
  );
}
