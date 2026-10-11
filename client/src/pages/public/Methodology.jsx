import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { DemoTag } from '../../components/civic.jsx';
import { LoadError, Panel, Skeleton } from '../../components/ui.jsx';

const INPUT_LABELS = {
  background_value: 'Background PM10',
  temperature_c: 'Temperature',
  humidity_pct: 'Humidity',
  wind_speed_ms: 'Wind speed',
  distance_to_background_m: 'Distance to background monitor',
  relative_wind_alignment: 'Wind direction relative to site',
};

function Fact({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return <div className="grid gap-1 border-b border-line py-2 last:border-0 sm:grid-cols-[12rem_1fr] sm:gap-4">
    <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
    <dd className="min-w-0 break-words text-[0.875rem]">{children}</dd>
  </div>;
}

export default function Methodology() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi('/public/methodology');
  const model = data?.model;
  useEffect(() => { document.title = `${t('method.title')} · AirWatch`; }, [t]);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header>
        <p className="mb-2"><Link to="/" className="text-sm font-medium text-accent underline">{t('nav.map')}</Link></p>
        <h1 className="text-2xl font-semibold tracking-tight">{t('method.title')}</h1>
        <p className="mt-2 max-w-[72ch] text-[0.9375rem] text-ink-2">{t('method.intro')}</p>
      </header>

      {error && !data ? <LoadError error={error} onRetry={reload} /> : loading && !data ? <Skeleton className="h-64" /> : model ? (
        <>
          <Panel className="p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{t('method.assessment')}</h2><DemoTag>{t('sensor.tag')}</DemoTag>
              <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${model.available ? 'border-[#bfdcc8] bg-ok-soft text-ok' : 'border-flag-line bg-flag-soft text-flag'}`}>
                {model.available ? t('method.available') : t('method.unavailable')}
              </span>
            </div>
            <p className="mt-3 text-[0.875rem]">{model.scope}</p>
            <p className="mt-2 text-[0.875rem] text-ink-2">{model.limitations}</p>
            <p className="mt-3 text-[0.8125rem] text-ink-2">{t('method.signal')}</p>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">{t('method.monitoring')}</h2>
            <div className="mt-2 divide-y divide-line">
              <Fact label={t('method.demoCount')}>{data.monitoring.simulatedDevices}</Fact>
              <Fact label={t('method.physicalCount')}>{data.monitoring.physicalDevices}</Fact>
            </div>
            <p className="mt-3 text-[0.8125rem] text-ink-2">{t('method.monitoringNote')}</p>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <h2 className="font-semibold">{t('method.trainingRange')}</h2>
            <p className="mt-1 text-[0.8125rem] text-ink-2">{t('method.trainingRangeNote')}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className="border-b border-line text-[0.75rem] text-ink-2"><tr><th className="py-2 pr-3 font-medium">{t('method.input')}</th><th className="py-2 pr-3 font-medium">{t('method.minimum')}</th><th className="py-2 font-medium">{t('method.maximum')}</th></tr></thead>
                <tbody className="divide-y divide-line">{Object.entries(model.trainedDomain || {}).map(([key, range]) => (
                  <tr key={key}><th scope="row" className="py-2 pr-3 font-medium">{INPUT_LABELS[key] || key}</th><td className="num py-2 pr-3">{range[0]}</td><td className="num py-2">{range[1]}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>

          <Panel className="p-4 sm:p-5">
            <details>
              <summary className="cursor-pointer font-semibold text-accent underline">{t('method.fullProvenance')}</summary>
              <dl className="mt-3 divide-y divide-line">
                <Fact label={t('method.version')}><code>{model.version}</code></Fact>
                <Fact label={t('method.algorithm')}>{model.algorithm}</Fact>
                <Fact label={t('method.artifact')}>{model.artifactVersion}</Fact>
                <Fact label={t('method.dataSource')}>{model.dataSource}</Fact>
                <Fact label={t('method.synthetic')}>{String(model.syntheticOnly)}</Fact>
                <Fact label={t('method.measurement')}><code>{JSON.stringify(model.measurement)}</code></Fact>
                <Fact label={t('method.calibration')}><code>{JSON.stringify(model.calibration)}</code></Fact>
                <Fact label={t('method.margin')}>{model.calibratedMargin}</Fact>
                <Fact label={t('method.features')}><code>{JSON.stringify(model.features)}</code></Fact>
              </dl>
            </details>
          </Panel>
        </>
      ) : null}
    </div>
  );
}
