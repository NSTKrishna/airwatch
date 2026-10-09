import { Suspense } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Skeleton } from './ui.jsx';
import { Camera, FileText, FlaskConical, Wind } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { useApi } from '../lib/useApi.js';
import { LanguageToggle, Logo, SignOutButton } from './Brand.jsx';

const TABS = [
  { to: '/citizen', end: true, key: 'nav.monitor', icon: Wind },
  { to: '/citizen/report', key: 'nav.report', icon: Camera },
  { to: '/citizen/complaints', key: 'nav.complaints', icon: FileText },
];

export default function CitizenLayout() {
  const { t } = useI18n();
  const { data: status } = useApi('/system/status');
  const mixed = status?.sensors.devices.real > 0;
  return (
    <div className="min-h-dvh pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Logo />
          <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 md:flex">
            {TABS.map(({ to, end, key }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-[0.9375rem] font-medium transition-colors duration-150 ${isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-2 hover:bg-mute-soft hover:text-ink'}`}>
                {t(key)}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <LanguageToggle />
            <SignOutButton compact />
          </div>
        </div>
        <p className="border-t border-warn-line bg-warn-soft px-4 py-1 text-center text-[0.75rem] text-warn">
          <FlaskConical className="mr-1 inline size-3 -translate-y-px" aria-hidden />{t(mixed ? 'common.mixedSources' : 'common.simulatedLong')}
        </p>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 md:py-8">
        <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>}><Outlet /></Suspense>
      </main>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {TABS.map(({ to, end, key, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to} end={end}
                className={({ isActive }) => `flex h-[4.25rem] flex-col items-center justify-center gap-1 text-[0.75rem] font-medium ${isActive ? 'text-accent-strong' : 'text-ink-2'}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid h-7 w-14 place-items-center rounded-full transition-colors duration-150 ${isActive ? 'bg-accent-soft' : ''}`}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    {t(key)}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
