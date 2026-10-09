import { useEffect, useState } from 'react';
import {
  CircleCheck, CircleDashed, CircleX, ClipboardCheck, Eye, FlaskConical, Inbox, LoaderCircle, RadioTower, TriangleAlert,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { useI18n } from '../lib/i18n.jsx';

const BUTTON_VARIANTS = {
  primary: 'bg-accent text-white hover:bg-accent-strong active:bg-accent-strong disabled:bg-line-strong disabled:text-ink-3',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink-3 hover:bg-paper disabled:text-ink-3 disabled:hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-mute-soft hover:text-ink disabled:text-ink-3',
  danger: 'bg-surface text-flag border border-flag-line hover:bg-flag-soft disabled:text-ink-3 disabled:border-line',
};
const BUTTON_SIZES = { md: 'h-10 px-4 text-[0.9375rem]', sm: 'h-8 px-3 text-[0.8125rem]', lg: 'h-12 px-5 text-base' };

export function buttonClass({ variant = 'primary', size = 'md', block = false } = {}) {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-colors duration-150 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${block ? 'w-full' : ''}`;
}

export function Button({ variant, size, block, loading = false, icon: Icon, children, className = '', ...props }) {
  return (
    <button type="button" {...props} disabled={props.disabled || loading} aria-busy={loading || undefined}
      className={`${buttonClass({ variant, size, block })} ${className}`}>
      {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function Panel({ as: Tag = 'section', className = '', children, ...props }) {
  return (
    <Tag {...props} className={`rounded-(--radius-card) border border-line bg-surface shadow-(--shadow-card) ${className}`}>
      {children}
    </Tag>
  );
}

export function FormField({ label, htmlFor, hint, error, children, optional }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[0.8125rem] font-medium text-ink">
        {label}{optional ? <span className="ml-1 font-normal text-ink-3">{optional}</span> : null}
      </label>
      {children}
      {error ? <p id={`${htmlFor}-error`} role="alert" className="mt-1.5 flex items-start gap-1.5 text-[0.8125rem] text-flag"><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{error}</p>
        : hint ? <p className="mt-1.5 text-[0.8125rem] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function Notice({ tone = 'flag', title, children, action, icon: Icon = TriangleAlert }) {
  const tones = {
    flag: 'border-flag-line bg-flag-soft text-flag',
    warn: 'border-warn-line bg-warn-soft text-warn',
    ok: 'border-[#bfdcc8] bg-ok-soft text-ok',
    info: 'border-line bg-mute-soft text-ink-2',
  };
  return (
    <div role={tone === 'flag' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-lg border px-3.5 py-3 ${tones[tone]}`}>
      <Icon className="mt-0.5 size-4.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[0.875rem]">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={`text-ink-2 ${title ? 'mt-0.5' : ''}`}>{children}</div> : null}
      </div>
      {action}
    </div>
  );
}

export function LoadError({ error, onRetry }) {
  const { t } = useI18n();
  return (
    <Notice tone="flag" title={t('common.loadError', { message: error?.message || '' })}
      action={onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>{t('common.retry')}</Button> : null} />
  );
}

export const Skeleton = ({ className = '' }) => <div className={`skeleton ${className}`} aria-hidden />;

/** Where a reading came from: SIMULATED, or DEVICE for an authenticated physical monitor. */
export function SourceTag({ source = 'SIMULATED', className = '' }) {
  const { t } = useI18n();
  const real = source === 'DEVICE';
  const Icon = real ? RadioTower : FlaskConical;
  return (
    <span title={t(`source.${real ? 'DEVICE' : 'SIMULATED'}.help`)}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap uppercase ${real ? 'border-[#b9d8d3] bg-accent-soft text-accent-strong' : 'border-warn-line bg-warn-soft text-warn'} ${className}`}>
      <Icon className="size-3" aria-hidden />{t(`source.${real ? 'DEVICE' : 'SIMULATED'}`)}
    </span>
  );
}
export const SimulatedTag = (props) => <SourceTag source="SIMULATED" {...props} />;

const STATUS_STYLE = {
  SUBMITTED: { icon: Inbox, cls: 'bg-mute-soft text-ink-2 border-line' },
  UNDER_REVIEW: { icon: Eye, cls: 'bg-accent-soft text-accent-strong border-[#b9d8d3]' },
  INSPECTION_ASSIGNED: { icon: ClipboardCheck, cls: 'bg-warn-soft text-warn border-warn-line' },
  RESOLVED: { icon: CircleCheck, cls: 'bg-ok-soft text-ok border-[#bfdcc8]' },
  REJECTED: { icon: CircleX, cls: 'bg-surface text-ink-2 border-line-strong' },
};

export function StatusPill({ status }) {
  const { t } = useI18n();
  const { icon: Icon, cls } = STATUS_STYLE[status] || STATUS_STYLE.SUBMITTED;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.8125rem] font-medium whitespace-nowrap ${cls}`}>
      <Icon className="size-3.5" aria-hidden />{t(`status.${status}`)}
    </span>
  );
}

const VERDICT_STYLE = {
  flagged: { icon: TriangleAlert, cls: 'bg-flag text-white border-flag' },
  normal: { icon: CircleCheck, cls: 'bg-ok-soft text-ok border-[#bfdcc8]' },
  none: { icon: CircleDashed, cls: 'bg-mute-soft hatch text-ink-2 border-line-strong' },
};

export function VerdictBadge({ verdict, size = 'md' }) {
  const { t } = useI18n();
  const { icon: Icon, cls } = VERDICT_STYLE[verdict];
  const sizing = size === 'lg' ? 'px-3 py-1 text-[0.9375rem]' : 'px-2.5 py-0.5 text-[0.8125rem]';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border font-semibold whitespace-nowrap ${sizing} ${cls}`}>
      <Icon className={size === 'lg' ? 'size-4.5' : 'size-3.5'} aria-hidden />{t(`verdict.${verdict}`)}
    </span>
  );
}

/** Images sit behind bearer auth, so they are fetched as blobs rather than by <img src>. */
export function AuthImage({ url, alt, className = '' }) {
  const [state, setState] = useState({ src: null, failed: false });
  useEffect(() => {
    let objectUrl;
    let cancelled = false;
    setState({ src: null, failed: false });
    api.blob(url)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ src: objectUrl, failed: false });
      })
      .catch(() => !cancelled && setState({ src: null, failed: true }));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  if (state.failed) {
    return <div className={`grid place-items-center bg-mute-soft text-[0.75rem] text-ink-3 ${className}`}>Image unavailable</div>;
  }
  if (!state.src) return <Skeleton className={className} />;
  return (
    <a href={state.src} target="_blank" rel="noreferrer" className="block">
      <img src={state.src} alt={alt} className={`object-cover ${className}`} />
    </a>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="mx-auto max-w-md px-4 py-12 text-center">
      {Icon ? <Icon className="mx-auto size-8 text-ink-3" strokeWidth={1.5} aria-hidden /> : null}
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-1 text-ink-2">{children}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
