import { Suspense, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Skeleton } from './ui.jsx';
import { ChartNoAxesCombined, CircleCheck, CircleDashed, FlaskConical, Inbox, LayoutDashboard, RadioTower, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { useApi } from '../lib/useApi.js';
import { Logo, SignOutButton } from './Brand.jsx';

const NAV = [
  { to: '/municipal', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/municipal/complaints', label: 'Complaints', icon: Inbox },
  { to: '/municipal/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/municipal/devices', label: 'Devices', icon: RadioTower },
  { to: '/municipal/simulator', label: 'Sensor simulator', icon: SlidersHorizontal },
];

function ModelStatus({ status }) {
  if (!status) return null;
  const ready = status.model.ready;
  return (
    <div className="rounded-lg border border-line-strong bg-surface p-3 text-[0.8125rem]">
      <p className={`flex items-center gap-1.5 font-semibold ${ready ? 'text-ok' : 'text-flag'}`}>
        {ready ? <CircleCheck className="size-4" aria-hidden /> : <CircleDashed className="size-4" aria-hidden />}
        {ready ? 'Model online' : 'Model unavailable'}
      </p>
      <p className="mt-1 break-words text-ink-2">
        {ready ? status.model.version : `${status.model.reason}. Readings are stored without an anomaly assessment.`}
      </p>
      {ready ? <p className="mt-1 text-ink-2">{status.model.limitations}</p> : null}
    </div>
  );
}

export default function MunicipalLayout() {
  const { user } = useAuth();
  const { data: status } = useApi('/system/status', { pollMs: 30_000 });
  // Municipal screens are English-only for now, so shared status labels must match.
  const { lang, setLang } = useI18n();
  useEffect(() => { if (lang !== 'en') setLang('en'); }, [lang, setLang]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="border-b border-line bg-panel lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex h-14 items-center justify-between px-4">
          <Logo />
          <div className="lg:hidden"><SignOutButton compact /></div>
        </div>
        <p className="hidden px-4 pb-3 text-[0.75rem] text-ink-2 lg:block">Mumbai operations demo</p>
        <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ to, end, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => `flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-[0.9375rem] font-medium transition-colors duration-150 ${isActive ? 'bg-surface text-ink shadow-(--shadow-card)' : 'text-ink-2 hover:bg-surface/60 hover:text-ink'}`}>
              <Icon className="size-4.5" aria-hidden />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-3 p-3 lg:block">
          <ModelStatus status={status} />
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="truncate text-[0.875rem] font-medium">{user.name}</p>
              <p className="truncate text-[0.75rem] text-ink-2">{user.email}</p>
            </div>
            <SignOutButton compact />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <p className="border-b border-warn-line bg-warn-soft px-4 py-1 text-[0.75rem] text-warn lg:px-8">
          <FlaskConical className="mr-1 inline size-3 -translate-y-px" aria-hidden />
          Demonstration system, not an official BMC service. {status?.sensors.devices.real ? 'Most monitoring sites are simulated; each reading is labelled with its source.' : 'Monitoring sites, devices and readings are simulated.'}
        </p>
        {status && !status.model.ready ? (
          <p className="border-b border-flag-line bg-flag-soft px-4 py-1.5 text-[0.8125rem] text-flag lg:hidden">
            Model unavailable: {status.model.reason}. No anomaly assessments are being produced.
          </p>
        ) : null}
        <main className="mx-auto max-w-[82rem] px-4 py-5 lg:px-8 lg:py-7">
          <Suspense fallback={<div className="space-y-3"><Skeleton className="h-8 w-48" /><Skeleton className="h-40" /></div>}><Outlet context={{ status }} /></Suspense>
        </main>
      </div>
    </div>
  );
}
