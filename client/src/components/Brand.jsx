import { Languages, LogOut } from 'lucide-react';
import { LANGUAGES, useI18n } from '../lib/i18n.jsx';
import { useAuth } from '../lib/auth.jsx';

export function Logo({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight text-ink ${className}`}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#0b5d57" />
        <path d="M7 20h18M7 14.5h11M7 9h6" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="23" cy="11" r="3" fill="#f2b84b" />
      </svg>
      AirWatch
    </span>
  );
}

export function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t('common.language')} className="inline-flex items-center rounded-lg border border-line-strong bg-surface p-0.5">
      <Languages className="mx-1.5 size-4 text-ink-3" aria-hidden />
      {LANGUAGES.map((l) => (
        <button key={l.code} type="button" lang={l.code} aria-pressed={lang === l.code} onClick={() => setLang(l.code)}
          className={`h-7 rounded-md px-2 text-[0.8125rem] font-medium transition-colors duration-150 ${lang === l.code ? 'bg-accent text-white' : 'text-ink-2 hover:bg-mute-soft'}`}>
          {l.label}
        </button>
      ))}
    </div>
  );
}

export function SignOutButton({ compact = false }) {
  const { signOut } = useAuth();
  const { t } = useI18n();
  return (
    <button type="button" onClick={signOut} title={t('common.signOut')}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[0.8125rem] font-medium text-ink-2 transition-colors duration-150 hover:bg-mute-soft hover:text-ink">
      <LogOut className="size-4" aria-hidden />
      <span className={compact ? 'sr-only' : ''}>{t('common.signOut')}</span>
    </button>
  );
}
