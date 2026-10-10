import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { BadgeCheck, ChevronRight, FlaskConical, List, Map as MapIcon, Megaphone, Search, TriangleAlert, X } from 'lucide-react';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtDate, verdictOf } from '../../lib/format.js';
import DustMap from '../../components/DustMap.jsx';
import { LoadError, Skeleton, StatusPill, VerdictBadge } from '../../components/ui.jsx';

const OPEN = new Set(['SUBMITTED', 'UNDER_REVIEW', 'INSPECTION_ASSIGNED']);
const WIDE = '(min-width: 1024px)';

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const query = window.matchMedia(WIDE);
    const update = () => setWide(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

function Chip({ active, onClick, children, ...props }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} {...props}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.875rem] font-medium whitespace-nowrap shadow-(--shadow-card) transition-colors duration-150 ${active ? 'border-accent bg-accent text-white' : 'border-line-strong bg-surface text-ink hover:border-ink-3'}`}>
      {children}
    </button>
  );
}

function Legend({ totals, show, setShow }) {
  const { t } = useI18n();
  const Row = ({ swatch, children }) => <li className="flex items-center gap-2">{swatch}<span>{children}</span></li>;
  const pin = (cls) => <span className={`map-pin ${cls} size-4! shrink-0 border!`} aria-hidden />;
  return (
    <details className="group max-w-[17rem] rounded-xl border border-line-strong bg-surface text-[0.8125rem] shadow-(--shadow-card)">
      <summary className="flex list-none items-center gap-2 px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 shrink-0 transition-transform duration-150 group-open:rotate-90" aria-hidden />
        <span className="num">{t('map.summary', { projects: totals.projects, reports: totals.reports })}</span>
      </summary>
      <div className="space-y-3 border-t border-line px-3 py-3 text-ink-2">
        <ul className="space-y-1.5">
          <Row swatch={pin('map-pin-plain')}>{t('map.legend.project')}</Row>
          <Row swatch={pin('map-pin-flag')}>{t('map.legend.flagged')}</Row>
          <Row swatch={pin('map-pin-ok')}>{t('map.legend.normal')}</Row>
          <Row swatch={pin('map-pin-none')}>{t('map.legend.none')}</Row>
          <Row swatch={<span className="map-report map-report-UNDER_REVIEW size-4! shrink-0 border!" aria-hidden />}>{t('map.legend.report')}</Row>
        </ul>
        <p className="flex items-start gap-1.5 text-warn"><FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('map.legend.demo')}</p>
        <div className="flex gap-4">
          {['projects', 'reports'].map((layer) => (
            <label key={layer} className="flex items-center gap-1.5 font-medium text-ink">
              <input type="checkbox" className="size-4 accent-(--color-accent)" checked={show[layer]} onChange={(e) => setShow((s) => ({ ...s, [layer]: e.target.checked }))} />
              {t(`map.layer.${layer}`)}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function ProjectRow({ project, openReports }) {
  const { t } = useI18n();
  const verdict = project.monitor ? verdictOf(project.monitor.latest) : null;
  return (
    <li>
      <Link to={`/project/${project.code}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-paper">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium">{project.name}</span>
          <span className="block truncate text-[0.8125rem] text-ink-2">{[project.developer, project.registrationNo].filter(Boolean).join(' · ') || project.authority}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {verdict ? <VerdictBadge verdict={verdict} /> : <span className="text-[0.8125rem] text-ink-3">{t('project.noMonitor')}</span>}
            {openReports ? <span className="num inline-flex items-center gap-1 text-[0.8125rem] font-medium text-ink"><Megaphone className="size-3.5" aria-hidden />{t('map.openReports', { count: openReports })}</span> : null}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

export function ReportRow({ report }) {
  const { t, locale } = useI18n();
  return (
    <li>
      <Link to={`/report/${report.reference}`} className="flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-paper">
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium">{report.project?.name || report.locationText || t('pub.unlisted')}</span>
          <span className="num block truncate text-[0.8125rem] text-ink-2">{report.reference} · {fmtDate(report.createdAt, locale)}{report.isDemo ? ` · ${t('pub.demoTag')}` : ''}</span>
          <span className="mt-1.5 block"><StatusPill status={report.status} /></span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-ink-3" aria-hidden />
      </Link>
    </li>
  );
}

function ListView({ wards, projects, reports, openByProject, query }) {
  const { t } = useI18n();
  const groups = wards.map((ward) => ({
    ward,
    projects: projects.filter((p) => p.ward.slug === ward.slug),
    reports: reports.filter((r) => r.ward?.slug === ward.slug),
  })).filter((g) => !query || g.projects.length || g.reports.length);

  if (groups.length === 0) return <p className="px-4 py-10 text-center text-ink-2">{t('map.noMatch', { query })}</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-3 pt-28 pb-6 sm:px-4">
      {groups.map(({ ward, projects: wardProjects, reports: wardReports }) => (
        <section key={ward.slug} aria-labelledby={`ward-${ward.slug}`} className="overflow-hidden rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card)">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line px-4 py-3">
            <span className="num grid h-9 min-w-12 place-items-center rounded-lg bg-accent px-2 text-[0.875rem] font-semibold text-white">{ward.code}</span>
            <div className="min-w-0 flex-1">
              <h2 id={`ward-${ward.slug}`} className="truncate font-semibold">{t('ward.title', { name: ward.name })}</h2>
              <p className="num truncate text-[0.8125rem] text-ink-2">{t('map.wardCounts', { projects: wardProjects.length, open: wardReports.filter((r) => OPEN.has(r.status)).length })}</p>
            </div>
            <Link to={`/ward/${ward.slug}`} className="shrink-0 text-[0.875rem] font-medium text-accent underline max-sm:basis-full">{t('ward.officeLink')}</Link>
          </div>
          {wardProjects.length ? <ul className="divide-y divide-line">{wardProjects.map((p) => <ProjectRow key={p.code} project={p} openReports={openByProject.get(p.code) || 0} />)}</ul> : null}
          {wardReports.length ? (
            <>
              <h3 className="border-y border-line bg-paper px-4 py-2 text-[0.8125rem] font-semibold text-ink-2">{t('map.reportsHeading')}</h3>
              <ul className="divide-y divide-line">{wardReports.map((r) => <ReportRow key={r.reference} report={r} />)}</ul>
            </>
          ) : null}
        </section>
      ))}
    </div>
  );
}

export default function MapHome() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wide = useWide();
  const projectMatch = useMatch('/project/:code');
  const reportMatch = useMatch('/report/:reference');
  const wardMatch = useMatch('/ward/:slug');
  const selected = projectMatch ? { type: 'project', id: projectMatch.params.code }
    : reportMatch ? { type: 'report', id: reportMatch.params.reference }
      : wardMatch ? { type: 'ward', id: wardMatch.params.slug } : null;

  const overview = useApi('/public/overview', { pollMs: 60_000 });
  const boundaries = useApi('/public/boundaries');
  const projects = useApi('/public/projects', { pollMs: 30_000 });
  const reports = useApi('/public/reports', { pollMs: 30_000 });

  const [wardSlug, setWardSlug] = useState(null);
  const [view, setView] = useState('map');
  const [search, setSearch] = useState('');
  const [show, setShow] = useState({ projects: true, reports: true });
  const [tall, setTall] = useState(false);

  // A detail panel names the page itself; the map does so only when nothing is selected.
  const hasSelection = Boolean(selected);
  useEffect(() => { if (!hasSelection) document.title = `${t('map.title')} · AirWatch`; }, [t, hasSelection]);
  // Opening a ward's page also narrows the map to it.
  useEffect(() => { if (wardMatch) setWardSlug(wardMatch.params.slug); }, [wardMatch]);
  useEffect(() => { setTall(false); }, [selected?.type, selected?.id]);

  const pilotWards = useMemo(() => (overview.data?.wards || []).filter((w) => w.pilot), [overview.data]);
  const query = search.trim().toLowerCase();
  const visibleProjects = useMemo(() => (projects.data?.projects || []).filter((p) =>
    (!wardSlug || p.ward.slug === wardSlug)
    && (!query || [p.name, p.developer, p.address, p.registrationNo, p.code].some((v) => v?.toLowerCase().includes(query)))), [projects.data, wardSlug, query]);
  const visibleReports = useMemo(() => (reports.data?.reports || []).filter((r) =>
    (!wardSlug || r.ward?.slug === wardSlug)
    && (!query || [r.reference, r.project?.name, r.locationText, r.description].some((v) => v?.toLowerCase().includes(query)))), [reports.data, wardSlug, query]);
  const openByProject = useMemo(() => {
    const counts = new Map();
    for (const r of reports.data?.reports || []) if (r.project && OPEN.has(r.status)) counts.set(r.project.code, (counts.get(r.project.code) || 0) + 1);
    return counts;
  }, [reports.data]);

  const onSelect = useCallback((kind, id) => navigate(`/${kind}/${id}`), [navigate]);
  const wardLabels = useCallback((ward) => ({
    projects: t('map.bubble.projects', { count: ward.counts?.projects ?? 0 }),
    reports: t('map.bubble.reports', { count: ward.counts?.openReports ?? 0 }),
  }), [t]);

  const failed = [overview, projects, reports].find((r) => r.error && !r.data);
  if (failed) return <div className="mx-auto max-w-xl p-4"><LoadError error={failed.error} onRetry={failed.reload} /></div>;

  const loading = !overview.data || !projects.data || !reports.data;
  const totals = wardSlug ? pilotWards.find((w) => w.slug === wardSlug)?.counts : overview.data?.totals;
  const flagged = visibleProjects.filter((p) => p.monitor && verdictOf(p.monitor.latest) === 'flagged').length;
  const chooseWard = (slug) => {
    setWardSlug(slug);
    navigate(slug ? `/ward/${slug}` : '/');
  };
  // Space the detail panel covers, so the map can keep its target in view.
  const inset = !selected ? { right: 0, bottom: 0 } : wide ? { right: 440, bottom: 0 } : { right: 0, bottom: Math.round(window.innerHeight * 0.45) };

  return (
    <div className="absolute inset-0 overflow-hidden">
      {view === 'map' ? (
        loading ? <Skeleton className="size-full rounded-none" /> : (
          <DustMap label={t('map.title')} boundaries={boundaries.data} wards={overview.data.wards} projects={visibleProjects} reports={visibleReports}
            selected={selected} wardSlug={wardSlug} inset={inset} onSelect={onSelect} wardLabels={wardLabels} show={show} />
        )
      ) : (
        <div className="size-full overflow-y-auto bg-paper">
          {loading ? <div className="mx-auto max-w-3xl space-y-3 px-4 pt-28"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
            : <ListView wards={wardSlug ? pilotWards.filter((w) => w.slug === wardSlug) : pilotWards} projects={visibleProjects} reports={visibleReports} openByProject={openByProject} query={search.trim()} />}
        </div>
      )}

      {/* Filters sit over the map and never under the detail panel on wide screens. */}
      <div className={`pointer-events-none absolute inset-x-0 top-0 z-10 space-y-2 p-3 ${selected && wide ? 'lg:right-[27.5rem]' : ''}`}>
        <div className="scroll-quiet pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="group" aria-label={t('map.wardFilter')}>
          <Chip active={!wardSlug} onClick={() => chooseWard(null)}>{t('map.allWards')}</Chip>
          {pilotWards.map((w) => <Chip key={w.slug} active={wardSlug === w.slug} onClick={() => chooseWard(w.slug)}>{w.name}</Chip>)}
        </div>
        <div className="pointer-events-auto flex gap-2">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">{t('map.search')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input type="search" value={search} onChange={(e) => { setSearch(e.target.value); if (e.target.value && view === 'map') setView('list'); }}
              placeholder={t('map.search')} className="field h-10 rounded-full! py-0! pr-9! pl-9! text-[0.875rem] shadow-(--shadow-card)" />
            {search ? (
              <button type="button" onClick={() => setSearch('')} aria-label={t('map.clearSearch')} className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-ink-2 hover:bg-mute-soft">
                <X className="size-4" aria-hidden />
              </button>
            ) : null}
          </label>
          <div role="group" aria-label={t('map.view')} className="ml-auto inline-flex h-10 shrink-0 items-center rounded-full border border-line-strong bg-surface p-1 shadow-(--shadow-card)">
            {[['map', MapIcon], ['list', List]].map(([id, Icon]) => (
              <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[0.8125rem] font-medium transition-colors duration-150 ${view === id ? 'bg-ink text-white' : 'text-ink-2 hover:bg-mute-soft'}`}>
                <Icon className="size-4" aria-hidden />{t(`map.view.${id}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'map' && !loading && !selected ? (
        <div className="absolute bottom-7 left-3 z-10 space-y-2">
          {flagged ? (
            <p className="inline-flex items-center gap-1.5 rounded-full border border-flag-line bg-flag-soft px-3 py-1.5 text-[0.8125rem] font-medium text-flag shadow-(--shadow-card)">
              <TriangleAlert className="size-3.5" aria-hidden />{t('map.flaggedNow', { count: flagged })}
            </p>
          ) : null}
          {totals ? <Legend totals={totals} show={show} setShow={setShow} /> : null}
        </div>
      ) : null}

      {selected ? (
        <aside key={`${selected.type}-${selected.id}`} aria-label={t('map.details')}
          className={`sheet-in absolute z-20 flex flex-col overflow-hidden border-line-strong bg-surface shadow-(--shadow-pop) max-lg:inset-x-0 max-lg:bottom-0 max-lg:rounded-t-2xl max-lg:border-t lg:top-3 lg:right-3 lg:bottom-3 lg:w-[26.5rem] lg:rounded-(--radius-card) lg:border ${tall ? 'max-lg:top-0 max-lg:rounded-none' : 'max-lg:h-[58%]'}`}>
          <Outlet context={{ close: () => navigate('/'), tall, setTall, wide }} />
        </aside>
      ) : null}

      {!loading && !selected && view === 'map' && visibleProjects.length === 0 && query ? (
        <p className="absolute top-32 left-1/2 z-10 -translate-x-1/2 rounded-full border border-line-strong bg-surface px-4 py-2 text-[0.875rem] shadow-(--shadow-card)">{t('map.noMatch', { query: search.trim() })}</p>
      ) : null}
      {!loading && view === 'map' ? <p className="sr-only"><BadgeCheck aria-hidden />{t('map.summary', { projects: visibleProjects.length, reports: visibleReports.length })}</p> : null}
    </div>
  );
}
