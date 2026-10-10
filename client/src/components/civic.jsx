// Pieces shared by the public panels: where a fact came from, who is responsible,
// and what is and is not official.
import { BadgeCheck, Building2, ChevronRight, ExternalLink, FlaskConical, Mail, MapPin, Phone } from 'lucide-react';
import { useI18n } from '../lib/i18n.jsx';
import { fmtDate } from '../lib/format.js';

const host = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

/** Links to the public records a fact was taken from, with the date it was checked. */
export function Sources({ urls = [], verifiedOn }) {
  const { t, locale } = useI18n();
  if (!urls.length) return null;
  // Several documents often sit on one site; number them so the links read as distinct.
  const labels = urls.map((url, i) => {
    const name = host(url);
    const same = urls.filter((u) => host(u) === name);
    return same.length > 1 ? `${name} (${urls.slice(0, i + 1).filter((u) => host(u) === name).length})` : name;
  });
  return (
    <p className="text-[0.8125rem] text-ink-2">
      {t('civic.sources')}{' '}
      {urls.map((url, i) => (
        <span key={url}>{i ? ', ' : ''}
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-accent underline">{labels[i]}<ExternalLink className="size-3" aria-hidden /></a>
        </span>
      ))}
      {verifiedOn ? <span className="num"> · {t('civic.checkedOn', { date: fmtDate(verifiedOn, locale) })}</span> : null}
    </p>
  );
}

export function RecordTag({ className = '' }) {
  const { t } = useI18n();
  return (
    <span title={t('civic.record.help')} className={`inline-flex items-center gap-1 rounded-md border border-[#b9d8d3] bg-accent-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap text-accent-strong uppercase ${className}`}>
      <BadgeCheck className="size-3" aria-hidden />{t('civic.record')}
    </span>
  );
}

export function DemoTag({ children, className = '' }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border border-warn-line bg-warn-soft px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap text-warn uppercase ${className}`}>
      <FlaskConical className="size-3" aria-hidden />{children || t('civic.demo')}
    </span>
  );
}

/** The BMC ward office a report is directed to. */
export function WardOffice({ office }) {
  const { t } = useI18n();
  if (!office) return null;
  return (
    <div className="space-y-2 text-[0.875rem]">
      <p className="flex items-center gap-2 font-medium"><Building2 className="size-4 shrink-0 text-ink-3" aria-hidden />{t('civic.wardOffice', { name: office.name })}</p>
      {office.address ? <p className="flex items-start gap-2 text-ink-2"><MapPin className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />{office.address}</p> : null}
      {office.phone ? <p className="flex items-center gap-2"><Phone className="size-4 shrink-0 text-ink-3" aria-hidden /><a className="num font-medium text-accent underline" href={`tel:${office.phone.split(/[,/]/)[0].replace(/[^\d+]/g, '')}`}>{office.phone}</a></p> : null}
      {office.email ? <p className="flex items-center gap-2"><Mail className="size-4 shrink-0 text-ink-3" aria-hidden /><a className="font-medium break-all text-accent underline" href={`mailto:${office.email}`}>{office.email}</a></p> : null}
      <Sources urls={office.sourceUrls} verifiedOn={office.verifiedOn} />
    </div>
  );
}

/** Who deals with construction dust, and how to complain officially. Text comes from the cited sources. */
export function DustAuthority({ authority }) {
  const { t } = useI18n();
  if (!authority) return null;
  return (
    <div className="space-y-2.5 text-[0.875rem]">
      <p>{authority.summary}</p>
      {authority.channels?.length ? (
        <div>
          <p className="font-medium">{t('civic.officialChannels')}</p>
          <ul className="mt-1 space-y-1 text-ink-2">
            {authority.channels.map((c) => (
              <li key={c.name}>
                {c.url ? <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline">{c.name}</a> : <span className="font-medium text-ink">{c.name}</span>}
                {c.detail ? ` · ${c.detail}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {authority.requirements?.length ? (
        <details className="group">
          <summary className="inline-flex list-none items-center gap-1 font-medium text-accent [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform duration-150 group-open:rotate-90" aria-hidden />{t('civic.requirements')}
          </summary>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-ink-2">
            {authority.requirements.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </details>
      ) : null}
      <Sources urls={authority.sourceUrls} verifiedOn={authority.verifiedOn} />
    </div>
  );
}
