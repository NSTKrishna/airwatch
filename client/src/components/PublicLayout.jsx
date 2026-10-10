// Shell for everything a citizen sees. The map is readable signed out; filing a
// report and "my reports" ask for an account.
import { Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Camera, CircleUserRound, FileText, FlaskConical, LogIn, Map as MapIcon, Search } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LanguageToggle, Logo, SignOutButton } from './Brand.jsx';
import { Skeleton, buttonClass } from './ui.jsx';

const REPORT = '/citizen/report';
const MINE = '/citizen/complaints';

export default function PublicLayout() {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const officer = user?.role === 'MUNICIPAL';
  const links = [
    { to: '/', end: true, label: t('nav.map'), icon: MapIcon },
    { to: '/track', label: t('nav.track'), icon: Search },
    ...(officer ? [] : [{ to: MINE, label: t('nav.complaints'), icon: FileText }]),
  ];
  const navClass = ({ isActive }) => `rounded-lg px-3 py-1.5 text-[0.9375rem] font-medium transition-colors duration-150 ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-mute-soft hover:text-ink'}`;
  // The map owns the "/" subtree (project, report and ward panels live inside it).
  const onMap = !['/track', '/citizen'].some((prefix) => location.pathname.startsWith(prefix));

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 shrink-0 border-b border-line bg-paper">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
          <Link to="/" aria-label={t('app.name')}><Logo /></Link>
          <nav aria-label="Primary" className="ml-5 hidden items-center gap-1 md:flex">
            {links.map(({ to, end, label }) => <NavLink key={to} to={to} end={end} className={(s) => navClass({ isActive: to === '/' ? onMap : s.isActive })}>{label}</NavLink>)}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageToggle />
            {officer ? <Link to="/municipal" className={`${buttonClass({ variant: 'secondary', size: 'sm' })} max-sm:hidden`}>{t('nav.caseDesk')}</Link> : null}
            {officer ? null : <Link to={REPORT} className={`${buttonClass({ size: 'sm' })} max-md:hidden`}><Camera className="size-4" aria-hidden />{t('nav.reportDust')}</Link>}
            {user ? <SignOutButton compact /> : (
              <Link to="/login" state={{ from: location.pathname }} title={t('auth.signIn')}
                className="inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-medium text-ink-2 transition-colors duration-150 hover:bg-mute-soft hover:text-ink sm:h-8 sm:min-w-0">
                <LogIn className="size-4" aria-hidden /><span className="max-sm:sr-only">{t('auth.signIn')}</span>
              </Link>
            )}
          </div>
        </div>
        <p className="border-t border-warn-line bg-warn-soft px-3 py-1 text-center text-[0.75rem] leading-snug text-warn">
          <FlaskConical className="mr-1 inline size-3 -translate-y-px" aria-hidden />{t('common.pilotStrip')}
        </p>
      </header>

      <main className={`min-h-0 flex-1 ${onMap ? 'relative' : 'overflow-y-auto'}`}>
        <Suspense fallback={<div className="mx-auto max-w-2xl space-y-3 p-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>}>
          {onMap ? <Outlet /> : <div className="mx-auto max-w-5xl px-4 py-5 md:py-8"><Outlet /></div>}
        </Suspense>
      </main>

      <nav aria-label="Primary" className="z-30 flex shrink-0 items-center gap-2 border-t border-line bg-surface px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:hidden">
        {links.map(({ to, end, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={end} aria-label={label} title={label}
            className={(s) => `grid size-12 shrink-0 place-items-center rounded-xl border transition-colors duration-150 ${(to === '/' ? onMap : s.isActive) ? 'border-accent bg-accent-soft text-accent-strong' : 'border-line-strong text-ink-2'}`}>
            <Icon className="size-5" aria-hidden />
          </NavLink>
        ))}
        {officer
          ? <Link to="/municipal" className={`${buttonClass({ variant: 'secondary', size: 'lg' })} min-w-0 flex-1`}><CircleUserRound className="size-4.5" aria-hidden />{t('nav.caseDesk')}</Link>
          : <Link to={REPORT} className={`${buttonClass({ size: 'lg' })} min-w-0 flex-1`}><Camera className="size-4.5" aria-hidden /><span className="truncate">{t('nav.reportDustShort')}</span></Link>}
      </nav>
    </div>
  );
}
