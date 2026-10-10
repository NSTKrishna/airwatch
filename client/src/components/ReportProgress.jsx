// The public status history of a report: Submitted -> Under review -> Inspection assigned -> Resolved,
// or ending at Rejected. Used on the public page and on the citizen's own page.
import { Check, CircleX } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { STATUS_ORDER, fmtDateTime } from '../lib/format.js';

export default function ReportProgress({ status, timeline }) {
  const { t, locale } = useI18n();
  const reached = new Map(timeline.filter((e) => e.toStatus).map((e) => [e.toStatus, e.createdAt]));
  const rejected = status === 'REJECTED';
  // A rejected report ends where it was rejected; later steps never happen.
  const steps = rejected ? [...STATUS_ORDER.filter((s) => reached.has(s)), 'REJECTED'] : STATUS_ORDER;
  return (
    <ol>
      {steps.map((step, i) => {
        const at = reached.get(step);
        const done = Boolean(at);
        const last = i === steps.length - 1;
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
            {!last ? <span className={`absolute top-6 left-[0.6875rem] h-[calc(100%-1.5rem)] w-0.5 ${done && reached.has(steps[i + 1]) ? 'bg-accent' : 'bg-line'}`} aria-hidden /> : null}
            <span className={`relative grid size-6 shrink-0 place-items-center rounded-full border-2 ${done ? (step === 'REJECTED' ? 'border-ink-2 bg-ink-2 text-white' : 'border-accent bg-accent text-white') : 'border-line-strong bg-surface'}`}>
              {done ? (step === 'REJECTED' ? <CircleX className="size-3.5" aria-hidden /> : <Check className="size-3.5" strokeWidth={3} aria-hidden />) : null}
            </span>
            <div className="-mt-0.5">
              <p className={`font-medium ${done ? 'text-ink' : 'text-ink-3'}`}>{t(`status.${step}`)}</p>
              <p className="num text-[0.8125rem] text-ink-2">{done ? fmtDateTime(at, locale) : t('detail.step.pending')}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
