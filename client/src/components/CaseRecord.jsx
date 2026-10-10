// The independent side of a case, shared by the public report page and the reporter's own page:
// where the case stands on three separate counts, what to do next, the tools to take it to
// BMC, the ways to add follow-up, and the evidence trail.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Building2, Check, CircleCheck, CircleDashed, CircleX, ClipboardCheck, Copy, ExternalLink, EyeOff, FileCheck, ImagePlus,
  Landmark, LocateFixed, MessageCircle, MessageSquarePlus, Phone, Scale, Share2, ThumbsUp, TriangleAlert, Users, X,
} from 'lucide-react';
import { api, apiUrl } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { caseUrl, complaintDraft, copyText, shareText } from '../lib/caseText.js';
import { fmtDate, fmtDateTime } from '../lib/format.js';
import { useI18n } from '../lib/i18n.jsx';
import { DemoTag } from './civic.jsx';
import { Button, FormField, Notice, buttonClass } from './ui.jsx';

const CLOSED = new Set(['RESOLVED', 'REJECTED']);
const OFFICIAL_KINDS = new Set(['OFFICIAL_COMPLAINT', 'OFFICIAL_RESPONSE']);
const STALE_DAYS = 7;

// --- Three positions ---

const OFFICIAL_STYLE = {
  NONE: { icon: CircleDashed, cls: 'text-ink-2' },
  REPORTED: { icon: FileCheck, cls: 'text-warn' },
  ACKNOWLEDGED: { icon: BadgeCheck, cls: 'text-accent-strong' },
  ACTION_DOCUMENTED: { icon: BadgeCheck, cls: 'text-ok' },
};
const CITIZEN_STYLE = {
  NONE: { icon: CircleDashed, cls: 'text-ink-2' },
  PERSISTS: { icon: TriangleAlert, cls: 'text-report' },
  DISPUTED: { icon: Scale, cls: 'text-report' },
  IMPROVED: { icon: ThumbsUp, cls: 'text-ok' },
};
const AIRWATCH_ICON = { SUBMITTED: CircleDashed, UNDER_REVIEW: ClipboardCheck, INSPECTION_ASSIGNED: ClipboardCheck, RESOLVED: CircleCheck, REJECTED: CircleX };

function Position({ icon: Icon, label, value, valueClass, children }) {
  return (
    <div className="grid grid-cols-[1.25rem_1fr] gap-x-2.5 py-3 first:pt-0 last:pb-0">
      <Icon className={`mt-0.5 size-5 ${valueClass}`} aria-hidden />
      <div className="min-w-0">
        <dt className="text-[0.8125rem] text-ink-2">{label}</dt>
        <dd className={`font-semibold ${valueClass}`}>{value}</dd>
        <dd className="mt-0.5 text-[0.8125rem] text-ink-2">{children}</dd>
      </div>
    </div>
  );
}

/** AirWatch review, official complaint and residents' observations: three rows that never merge. */
export function CasePositions({ report }) {
  const { t, locale } = useI18n();
  const { official, citizen } = report.positions;
  const o = OFFICIAL_STYLE[official.state];
  const c = CITIZEN_STYLE[citizen.state];
  const filed = official.firstFiledOn ? fmtDate(official.firstFiledOn, locale) : '';
  return (
    <>
      <dl className="divide-y divide-line">
        <Position icon={AIRWATCH_ICON[report.status]} label={t('case.airwatch.label')} value={t(`status.${report.status}`)} valueClass="text-ink">
          {t('case.airwatch.help')}
        </Position>
        <Position icon={o.icon} label={t('case.official.label')} value={t(`case.official.${official.state}`)} valueClass={o.cls}>
          {t(`case.official.help.${official.state}`, { date: filed })}
          {official.daysWithoutResponse >= 1 ? ` ${t('case.official.waiting', { days: official.daysWithoutResponse })}` : ''}
        </Position>
        <Position icon={c.icon} label={t('case.citizen.label')} value={t(`case.citizen.${citizen.state}`)} valueClass={c.cls}>
          {citizen.state === 'NONE' ? t('case.citizen.help.NONE') : (
            <>
              {t(citizen.verified ? 'case.citizen.help.checked' : 'case.citizen.help.unchecked')}{' '}
              <span className="num">{t('case.citizen.counts', citizen.counts)}</span>
            </>
          )}
        </Position>
      </dl>
      {citizen.contradictsClosure ? <div className="mt-3"><Notice tone="warn" icon={Scale}>{t('case.contradiction')}</Notice></div> : null}
    </>
  );
}

/** The single most useful thing to do now, from where the three positions stand. */
export function nextStepKey({ status, positions }) {
  const { official, citizen } = positions;
  if (status === 'REJECTED' && citizen.state === 'NONE') return null;
  if (citizen.state === 'PERSISTS' || citizen.state === 'DISPUTED') {
    if (official.state === 'NONE') return 'next.file';
    return official.daysWithoutResponse >= STALE_DAYS ? 'next.waitingLong' : 'next.persists';
  }
  if (citizen.state === 'IMPROVED') return citizen.verified ? 'next.improved' : 'next.improvedUnchecked';
  if (official.state === 'NONE') return 'next.file';
  if (official.daysWithoutResponse >= STALE_DAYS) return 'next.waitingLong';
  return official.state === 'ACTION_DOCUMENTED' ? 'next.afterAction' : 'next.waiting';
}

export function NextStep({ report }) {
  const { t } = useI18n();
  const key = nextStepKey(report);
  if (!key) return null;
  return <Notice tone="info" icon={ArrowRight} title={t('next.title')}>{t(key, { days: report.positions.official.daysWithoutResponse ?? 0 })}</Notice>;
}

// --- Share ---

export function ShareCase({ report }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = shareText({ report, t });
  const copy = async () => {
    if (await copyText(caseUrl(report.reference))) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  const share = () => navigator.share({ title: report.reference, text }).catch(() => {});
  return (
    <div className="flex flex-wrap gap-2">
      <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className={buttonClass({ variant: 'secondary', size: 'sm' })}>
        <MessageCircle className="size-4" aria-hidden />{t('share.whatsapp')}
      </a>
      {typeof navigator.share === 'function' ? <Button variant="secondary" size="sm" icon={Share2} onClick={share}>{t('share.other')}</Button> : null}
      <Button variant="secondary" size="sm" icon={copied ? Check : Copy} onClick={copy}>
        <span aria-live="polite">{t(copied ? 'share.linkCopied' : 'share.copyLink')}</span>
      </Button>
    </div>
  );
}

// --- Follow-up form ---

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function FileList({ id, files, setFiles, max, label, hint, error }) {
  const { t } = useI18n();
  const input = useRef(null);
  const [problem, setProblem] = useState(null);
  const add = (list) => {
    setProblem(null);
    const next = [...files];
    for (const file of list) {
      if (next.length >= max) break;
      if (file.size > MAX_BYTES) { setProblem(t('report.tooLarge', { name: file.name })); continue; }
      next.push(file);
    }
    setFiles(next);
    if (input.current) input.current.value = '';
  };
  return (
    <FormField label={label} htmlFor={id} hint={hint} error={error || problem}>
      <input ref={input} id={id} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} className="sr-only" onChange={(e) => add(e.target.files)} />
      <ul className="flex flex-wrap gap-2">
        {files.map((file, i) => (
          <li key={`${file.name}-${i}`} className="inline-flex h-11 max-w-full items-center gap-1 rounded-lg border border-line-strong bg-paper pr-1 pl-3 text-[0.8125rem]">
            <span className="truncate">{file.name}</span>
            <button type="button" onClick={() => setFiles(files.filter((_, n) => n !== i))} aria-label={t('report.removePhoto', { name: file.name })}
              className="grid size-9 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-mute-soft"><X className="size-4" aria-hidden /></button>
          </li>
        ))}
        {files.length < max ? (
          <li>
            <label htmlFor={id} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper px-3 text-[0.875rem] font-medium text-accent hover:border-accent">
              <ImagePlus className="size-4.5" aria-hidden />{t('report.addPhoto')}
            </label>
          </li>
        ) : null}
      </ul>
    </FormField>
  );
}

function FollowUpForm({ report, kind: initialKind, channels, onDone, onCancel }) {
  const { t } = useI18n();
  const closed = CLOSED.has(report.status);
  const kinds = ['STILL_UNRESOLVED', 'IMPROVEMENT_OBSERVED', ...(closed ? ['DISPUTE_CLOSURE'] : []), 'NOTE', 'OFFICIAL_COMPLAINT', 'OFFICIAL_RESPONSE'];
  const [kind, setKind] = useState(initialKind);
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState([]);
  const [proof, setProof] = useState([]);
  const [channel, setChannel] = useState('');
  const [reference, setReference] = useState('');
  const [occurredOn, setOccurredOn] = useState(todayLocal());
  const [coords, setCoords] = useState(null);
  const [geo, setGeo] = useState('idle'); // idle | locating | denied
  const [state, setState] = useState({ busy: false, error: null, fields: {} });
  const official = OFFICIAL_KINDS.has(kind);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);

  const locate = () => {
    if (!navigator.geolocation) { setGeo('denied'); return; }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setGeo('idle'); },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 10_000 });
  };

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData();
    form.append('kind', kind);
    if (note.trim()) form.append('note', note.trim());
    if (official) {
      form.append('occurredOn', occurredOn);
      if (channel) form.append('officialChannel', channel);
      if (kind === 'OFFICIAL_COMPLAINT') form.append('officialReference', reference.trim());
      proof.forEach((file) => form.append('acknowledgment', file, file.name));
    } else {
      photos.forEach((file) => form.append('photos', file, file.name));
      if (coords) { form.append('latitude', coords.latitude); form.append('longitude', coords.longitude); }
    }
    setState({ busy: true, error: null, fields: {} });
    try {
      await api.upload(`/complaints/reports/${report.reference}/follow-ups`, form);
      onDone();
    } catch (error) {
      setState({ busy: false, error: Object.keys(error.fields || {}).length ? t('report.fixErrors') : error.message, fields: error.fields || {} });
    }
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-4 rounded-lg border border-line-strong bg-paper/60 p-3.5">
      <h3 ref={heading} tabIndex={-1} className="font-semibold outline-none">{t('action.title')}</h3>
      {state.error ? <Notice tone="flag" title={state.error} /> : null}

      <FormField label={t('form.kind')} htmlFor="fu-kind" error={state.fields.kind}>
        <select id="fu-kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
          {kinds.map((k) => <option key={k} value={k}>{t(`action.${k}`)}</option>)}
        </select>
      </FormField>

      {kind === 'OFFICIAL_COMPLAINT' ? (
        <>
          <FormField label={t('form.channel')} htmlFor="fu-channel" error={state.fields.officialChannel}>
            <select id="fu-channel" className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('form.channelChoose')}</option>
              {channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              <option value="other">{t('form.channel.other')}</option>
            </select>
          </FormField>
          <FormField label={t('form.reference')} htmlFor="fu-reference" hint={t('form.referenceHint')} error={state.fields.officialReference}>
            <input id="fu-reference" type="text" maxLength={60} autoComplete="off" className="field num" value={reference} onChange={(e) => setReference(e.target.value)} />
          </FormField>
        </>
      ) : null}

      {official ? (
        <FormField label={t(kind === 'OFFICIAL_COMPLAINT' ? 'form.filedOn' : 'form.responseOn')} htmlFor="fu-date" error={state.fields.occurredOn}>
          <input id="fu-date" type="date" max={todayLocal()} className="field num" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </FormField>
      ) : null}

      {kind === 'OFFICIAL_COMPLAINT' ? null : (
        <FormField label={t(`form.note.${kind}`)} htmlFor="fu-note" error={state.fields.note}>
          <textarea id="fu-note" rows={3} maxLength={2000} className="field resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      )}

      {official ? (
        <FileList id="fu-document" files={proof} setFiles={setProof} max={1} error={state.fields.acknowledgment}
          label={t(kind === 'OFFICIAL_COMPLAINT' ? 'form.acknowledgment' : 'form.responseFile')} hint={t('form.acknowledgmentHint')} />
      ) : (
        <>
          <FileList id="fu-photos" files={photos} setFiles={setPhotos} max={MAX_PHOTOS} label={t('form.photos')} hint={t('form.photosHint')} error={state.fields.photos} />
          {coords ? (
            <p className="flex items-start gap-2 text-[0.8125rem] text-ok"><CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t('form.locationSet')}</p>
          ) : (
            <div>
              <Button variant="secondary" size="sm" icon={LocateFixed} loading={geo === 'locating'} onClick={locate}>{t('form.location')}</Button>
              <p className="mt-1.5 text-[0.8125rem] text-ink-3">{geo === 'denied' ? t('form.locationDenied') : t('form.locationHint')}</p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={state.busy}>{t('form.submit')}</Button>
        <Button variant="ghost" onClick={onCancel}>{t('form.cancel')}</Button>
      </div>
    </form>
  );
}

const ACTIONS = [
  { kind: 'STILL_UNRESOLVED', icon: TriangleAlert },
  { kind: 'IMPROVEMENT_OBSERVED', icon: ThumbsUp },
  { kind: 'NOTE', icon: MessageSquarePlus },
  { kind: 'DISPUTE_CLOSURE', icon: Scale, closedOnly: true },
];

/**
 * The follow-up actions and, once one is chosen, its form. Any signed-in citizen may add to
 * a case; the case desk checks follow-ups from its own screens instead.
 * `formKind` / `setFormKind` are lifted so the official-complaint kit can open the same form.
 */
export function FollowUpActions({ report, channels, formKind, setFormKind, onChanged }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const location = useLocation();
  const [added, setAdded] = useState(false);
  if (user?.role === 'MUNICIPAL') return null;
  // The form is for signed-in citizens. A visitor never reaches it, whatever asked for it.
  if (formKind && user) {
    return <FollowUpForm key={formKind} report={report} kind={formKind} channels={channels} onCancel={() => setFormKind(null)}
      onDone={() => { setFormKind(null); setAdded(true); onChanged(); }} />;
  }
  return (
    <div>
      {added ? <div className="mb-3"><Notice tone="ok" icon={CircleCheck} title={t('form.added')} /></div> : null}
      {user ? (
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.filter((a) => !a.closedOnly || CLOSED.has(report.status)).map(({ kind, icon }) => (
            <Button key={kind} variant="secondary" icon={icon} className="h-11! justify-start! px-3! text-[0.875rem]! whitespace-normal! text-left leading-tight" onClick={() => { setAdded(false); setFormKind(kind); }}>
              {t(`action.${kind}`)}
            </Button>
          ))}
        </div>
      ) : (
        <Link to="/login" state={{ from: location.pathname }} className={buttonClass({ variant: 'secondary', block: true })}>{t('action.signIn')}</Link>
      )}
      <p className="mt-2 flex items-start gap-1.5 text-[0.8125rem] text-ink-2"><Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('action.anyone')}</p>
    </div>
  );
}

// --- Taking it to BMC ---

/**
 * Everything needed to file the case with BMC without searching for anything: the complaint
 * already written, the official channels with the pages they were checked on, and the way
 * to record the reference number afterwards.
 */
export function OfficialKit({ report, wardOffice, authority, onAddReference, onAddResponse }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const draft = useMemo(() => complaintDraft({ report, wardOffice, authority, t, locale }), [report, wardOffice, authority, t, locale]);
  const filed = report.positions.official.state !== 'NONE';
  const copy = async () => {
    if (await copyText(draft)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  const share = () => navigator.share({ text: draft }).catch(() => {});
  const online = authority.channels.filter((c) => !c.phone && c.key !== 'mpcb-sro' && c.key !== 'ward-office');
  const helpline = authority.channels.find((c) => c.phone);
  const escalate = authority.channels.filter((c) => c.key === 'mpcb-sro' || c.key === 'ward-office');
  const wardPhone = wardOffice?.phone?.split(' (')[0];
  const location = useLocation();

  return (
    <div className="space-y-4 text-[0.875rem]">
      <p className="text-ink-2">{t('kit.intro')}</p>

      <div>
        <h3 className="font-medium">{t('kit.step1')}</h3>
        <textarea readOnly rows={7} aria-label={t('kit.draftLabel')} value={draft} onFocus={(e) => e.target.select()}
          className="mt-1.5 block w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2 text-[0.8125rem] leading-relaxed text-ink" />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" icon={copied ? Check : Copy} onClick={copy}><span aria-live="polite">{t(copied ? 'kit.copied' : 'kit.copy')}</span></Button>
          {typeof navigator.share === 'function' ? <Button variant="secondary" size="sm" icon={Share2} onClick={share}>{t('share.other')}</Button> : null}
        </div>
        {report.description ? null : <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t('kit.describeYourself')}</p>}
      </div>

      <div>
        <h3 className="font-medium">{t('kit.step2')}</h3>
        <ul className="mt-1.5 space-y-2">
          {online.map((c) => (
            <li key={c.key}>
              <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-accent underline">{c.name}<ExternalLink className="size-3.5" aria-hidden /></a>
              <span className="block text-[0.8125rem] text-ink-2">{c.detail}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {helpline ? <a href={`tel:${helpline.phone}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}><Phone className="size-4" aria-hidden />{t('kit.call', { number: helpline.phone })}</a> : null}
          {wardPhone ? (
            <a href={`tel:${wardPhone.replace(/[^\d+]/g, '')}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
              <Building2 className="size-4" aria-hidden /><span className="num">{t('kit.wardControl')} {wardPhone}</span>
            </a>
          ) : null}
        </div>
        <p className="num mt-1.5 text-[0.75rem] text-ink-3">{t('kit.checked', { date: fmtDate(authority.verifiedOn, locale) })}</p>
      </div>

      <div>
        <h3 className="font-medium">{t(filed ? 'kit.step3Filed' : 'kit.step3')}</h3>
        <p className="mt-0.5 text-ink-2">{t(filed ? 'kit.step3FiledBody' : 'kit.step3Body')}</p>
        {user?.role === 'CITIZEN' ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={FileCheck} onClick={onAddReference}>{t('action.OFFICIAL_COMPLAINT')}</Button>
            {filed ? <Button variant="secondary" size="sm" icon={Landmark} onClick={onAddResponse}>{t('action.OFFICIAL_RESPONSE')}</Button> : null}
          </div>
        ) : user ? null : (
          <Link to="/login" state={{ from: location.pathname }} className={`${buttonClass({ variant: 'secondary', size: 'sm' })} mt-2`}>{t('action.signIn')}</Link>
        )}
      </div>

      <div>
        <h3 className="font-medium">{t('kit.escalate')}</h3>
        <ul className="mt-1 space-y-1.5 text-ink-2">
          {escalate.map((c) => (
            <li key={c.key}><a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline">{c.name}</a> · {c.detail}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- Evidence trail ---

const TRACK_STYLE = {
  AIRWATCH: 'border-line-strong bg-mute-soft text-ink-2',
  OFFICIAL: 'border-[#b9d8d3] bg-accent-soft text-accent-strong',
  CITIZEN: 'border-[#f3c9b4] bg-[#fdf0e8] text-report',
  NOTE: 'border-[#f3c9b4] bg-[#fdf0e8] text-report',
};
const CHECK_STYLE = {
  UNCHECKED: { icon: CircleDashed, cls: 'text-ink-2' },
  VERIFIED: { icon: BadgeCheck, cls: 'text-ok' },
  SET_ASIDE: { icon: CircleX, cls: 'text-ink-2' },
};

function TrailEntry({ entry }) {
  const { t, locale } = useI18n();
  if (entry.track === 'AIRWATCH') {
    return (
      <>
        <p className="font-medium">{entry.type === 'SUBMITTED' ? t('trail.event.submitted') : t('trail.event.status', { status: t(`status.${entry.toStatus}`) })}</p>
      </>
    );
  }
  const check = CHECK_STYLE[entry.check];
  const CheckIcon = check.icon;
  return (
    <>
      <p className="font-medium">{t(`trail.kind.${entry.kind}`)} <span className="font-normal text-ink-2">· {t(`trail.by.${entry.by}`)}</span></p>
      {entry.officialReference ? (
        <p className="num mt-0.5 break-all">{t('trail.ref', { reference: entry.officialReference })}{entry.officialChannel ? ` · ${entry.officialChannel}` : ''}{entry.occurredOn ? ` · ${t('trail.filedOn', { date: fmtDate(entry.occurredOn, locale) })}` : ''}</p>
      ) : null}
      {entry.note ? <p className="mt-1 max-w-[65ch] whitespace-pre-line">{entry.note}</p> : null}
      {entry.photos.length ? (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {entry.photos.map((photo, i) => (
            <li key={photo.id} className="overflow-hidden rounded-lg border border-line">
              <a href={apiUrl(photo.url)} target="_blank" rel="noreferrer"><img src={apiUrl(photo.url)} alt={t('trail.photoAlt', { n: i + 1 })} loading="lazy" className="aspect-square w-full object-cover" /></a>
            </li>
          ))}
        </ul>
      ) : null}
      {entry.check === 'UNCHECKED' && (entry.photoCount > 0 || !OFFICIAL_KINDS.has(entry.kind) || entry.kind === 'OFFICIAL_RESPONSE') ? (
        <p className="mt-1 flex items-start gap-1.5 text-ink-2"><EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('trail.withheld', { count: entry.photoCount })}</p>
      ) : null}
      {entry.hasAcknowledgment ? <p className="mt-0.5 text-ink-2">{t('trail.ack')}</p> : null}
      {entry.distanceFromSiteM != null ? <p className="num mt-0.5 text-ink-2">{entry.distanceFromSiteM <= 100 ? t('trail.distance.near') : t('trail.distance.far', { metres: entry.distanceFromSiteM })}</p> : null}
      <p className={`mt-1 flex items-start gap-1.5 ${check.cls}`}>
        <CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>{t(`trail.check.${entry.check}`)}{entry.checkNote ? <span className="text-ink-2">: {entry.checkNote}</span> : null}</span>
      </p>
    </>
  );
}

/** Everything that has happened on the case, oldest first, each entry marked with whose it is. */
export function EvidenceTrail({ report }) {
  const { t, locale } = useI18n();
  const entries = useMemo(() => [
    ...report.timeline.filter((e) => e.toStatus).map((e) => ({ ...e, track: 'AIRWATCH' })),
    ...report.followUps,
  ].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)), [report.timeline, report.followUps]);
  return (
    <ol className="space-y-4">
      {entries.map((entry) => (
        <li key={`${entry.track}-${entry.id}`} className="text-[0.875rem]">
          <p className="mb-1 flex flex-wrap items-center gap-2">
            <span className={`rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase ${TRACK_STYLE[entry.track]}`}>{t(`trail.track.${entry.track}`)}</span>
            <time dateTime={entry.createdAt} className="num text-[0.8125rem] text-ink-2">{fmtDateTime(entry.createdAt, locale)}</time>
            {entry.isDemo ? <DemoTag /> : null}
          </p>
          <TrailEntry entry={entry} />
        </li>
      ))}
    </ol>
  );
}
