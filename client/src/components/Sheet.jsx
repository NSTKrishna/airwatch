// Chrome shared by the map's detail panels: a bottom sheet on phones, a side panel on wide screens.
import { useOutletContext } from 'react-router-dom';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';

export function SheetHeader({ title, subtitle, children }) {
  const { t } = useI18n();
  const { close, tall, setTall, wide } = useOutletContext();
  return (
    <header className="shrink-0 border-b border-line px-4 pt-3 pb-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className={`text-lg leading-snug font-semibold tracking-tight ${tall ? '' : 'max-lg:line-clamp-2'}`}>{title}</h1>
          {subtitle ? <p className="mt-0.5 text-[0.8125rem] text-ink-2">{subtitle}</p> : null}
        </div>
        {wide ? null : (
          <button type="button" onClick={() => setTall(!tall)} aria-label={t(tall ? 'sheet.collapse' : 'sheet.expand')} aria-expanded={tall}
            className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-mute-soft">
            {tall ? <ChevronDown className="size-5" aria-hidden /> : <ChevronUp className="size-5" aria-hidden />}
          </button>
        )}
        <button type="button" onClick={close} aria-label={t('sheet.close')}
          className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-mute-soft">
          <X className="size-5" aria-hidden />
        </button>
      </div>
      {children}
    </header>
  );
}

export const SheetBody = ({ children }) => <div className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overscroll-contain">{children}</div>;

/** `flush` lets a list run edge to edge while the heading keeps the gutter. */
export const SheetSection = ({ title, aside, children, flush = false, className = '' }) => (
  <section className={`py-4 ${flush ? '' : 'px-4'} ${className}`}>
    {title ? (
      <div className={`mb-2.5 flex flex-wrap items-center justify-between gap-2 ${flush ? 'px-4' : ''}`}>
        <h2 className="text-[0.9375rem] font-semibold">{title}</h2>
        {aside}
      </div>
    ) : null}
    {children}
  </section>
);
