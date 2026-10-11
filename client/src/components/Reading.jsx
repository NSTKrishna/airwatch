// Measurement comparison: site vs background, and the review threshold.
import { useI18n } from '../lib/i18n.jsx';
import { fmtNumber } from '../lib/format.js';

/** Bullet-style scale: how far the observed difference sits from the barrier. */
export function BarrierScale({ difference, barrier, expected }) {
  const { t, locale } = useI18n();
  const over = difference > barrier;
  const max = Math.max(barrier, difference, 1) * 1.18;
  const pct = (v) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  const gap = Math.abs(difference - barrier);
  return (
    <div>
      <div className="relative h-9">
        {/* track */}
        <div className="absolute inset-x-0 top-3 h-3 rounded-full bg-mute-soft" />
        {/* range marker leading to the review threshold */}
        <div className="absolute top-3 h-3 bg-line-strong/60" style={{ left: pct(expected), width: `calc(${pct(barrier)} - ${pct(expected)})` }} />
        {/* observed difference */}
        <div className={`absolute left-0 top-3 h-3 rounded-full transition-[width] duration-300 ease-out ${over ? 'bg-flag' : 'bg-accent'}`}
          style={{ width: pct(difference), minWidth: difference > 0 ? 6 : 0 }} />
        {/* barrier marker */}
        <div className="absolute top-0 h-9 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(barrier) }} />
      </div>
      <div className="relative mt-1 h-5 text-[0.75rem] text-ink-2">
        <span className="absolute left-0">0</span>
        <span className="num absolute -translate-x-1/2 font-medium whitespace-nowrap text-ink"
          style={{ left: `clamp(3.5rem, ${pct(barrier)}, calc(100% - 3.5rem))` }}>
          {t('monitor.barrier')} {fmtNumber(barrier, 1, locale)}
        </span>
      </div>
      <p className={`mt-2 text-[0.875rem] font-medium ${over ? 'text-flag' : 'text-ink-2'}`}>
        <span className="num">{t(over ? 'monitor.overBy' : 'monitor.underBy', { amount: `${fmtNumber(gap, 1, locale)} ${t('common.unit')}` })}</span>
      </p>
    </div>
  );
}

export function Metric({ label, value, unit, help, strong = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.8125rem] text-ink-2" title={help}>{label}</dt>
      <dd className={`num mt-0.5 ${strong ? 'text-2xl font-semibold' : 'text-lg font-medium'} text-ink`}>
        {value}{unit ? <span className="ml-1 text-[0.75rem] font-normal text-ink-3">{unit}</span> : null}
      </dd>
    </div>
  );
}

/** Numbers + scale for one evaluation (or a bare reading when there is no verdict). */
export function ReadingComparison({ background, site, pm25, evaluation }) {
  const { t, locale } = useI18n();
  const unit = t('common.unit');
  const n = (v) => fmtNumber(v, 1, locale);
  const evaluated = evaluation?.status === 'EVALUATED';
  return (
    <div className="@container">
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-4 ${pm25 === undefined ? '@md:grid-cols-4' : '@md:grid-cols-3'}`}>
        <Metric strong label={t('monitor.site')} value={n(site)} unit={typeof site === 'number' ? unit : null} />
        {pm25 === undefined ? null : <Metric strong label={t('monitor.pm25')} value={n(pm25)} unit={typeof pm25 === 'number' ? unit : null} help={t('monitor.pm25Note')} />}
        <Metric strong label={t('monitor.background')} value={n(background)} unit={typeof background === 'number' ? unit : null} />
        <Metric label={t('monitor.difference')} unit={unit}
          value={evaluated ? n(evaluation.observedDifference) : (typeof site === 'number' && typeof background === 'number' ? n(site - background) : '–')} />
        {/* The difference and barrier describe PM10 only. */}
        <Metric label={t('monitor.barrier')} unit={evaluated ? unit : null} help={t('monitor.barrierHelp')} value={evaluated ? n(evaluation.dynamicBarrier) : '–'} />
      </dl>
      {evaluated ? (
        <div className="mt-5">
          <BarrierScale difference={evaluation.observedDifference} barrier={evaluation.dynamicBarrier} expected={evaluation.expectedNormalDifference} />
        </div>
      ) : null}
    </div>
  );
}
