// The independent side of a case, shared by the public report panel and the reporter's own page:
// where the case stands on three separate counts, what to do next, the steps that take it to
// BMC, the on-site check, and the evidence trail.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronDown, CircleCheck, CircleDashed, CircleX, ClipboardCheck, Copy, ExternalLink, EyeOff, FileCheck,
  ImagePlus, Landmark, LocateFixed, MessageCircle, MessageSquarePlus, Phone, Scale, Share2, ThumbsUp, TriangleAlert, Users, X,
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

// Whose position it is, in the colours the evidence trail uses for the same three voices.
const SWATCH = { AIRWATCH: 'bg-ink-3', OFFICIAL: 'bg-accent', CITIZEN: 'bg-report' };

function Position({ track, icon: Icon, label, value, valueClass, columns, children }) {
  return (
    <div className={`grid grid-cols-[1.25rem_1fr] gap-x-2.5 py-3 first:pt-0 last:pb-0 ${columns ? 'lg:px-5 lg:py-0 lg:first:pl-0 lg:last:pr-0' : ''}`}>
      <Icon className={`mt-0.5 size-5 ${valueClass}`} aria-hidden />
      <div className="min-w-0">
        <dt className="flex items-center gap-1.5 text-[0.8125rem] text-ink-2"><span className={`size-2 shrink-0 rounded-[2px] ${SWATCH[track]}`} aria-hidden />{label}</dt>
        <dd className={`font-semibold ${valueClass}`}>{value}</dd>
        <dd className="mt-0.5 text-[0.8125rem] text-ink-2">{children}</dd>
      </div>
    </div>
  );
}

/**
 * AirWatch review, official complaint and residents' observations: three positions that never
 * merge. `columns` sets them side by side on a wide screen; they are always rows on a phone.
 */
export function CasePositions({ report, columns = false }) {
  const { t, locale } = useI18n();
  const { official, citizen } = report.positions;
  const o = OFFICIAL_STYLE[official.state];
  const c = CITIZEN_STYLE[citizen.state];
  const filed = official.firstFiledOn ? fmtDate(official.firstFiledOn, locale) : '';
  return (
    <>
      <dl className={`divide-y divide-line ${columns ? 'lg:grid lg:grid-cols-3 lg:divide-x lg:divide-y-0' : ''}`}>
        <Position track="AIRWATCH" columns={columns} icon={AIRWATCH_ICON[report.status]} label={t('case.airwatch.label')} value={t(`status.${report.status}`)} valueClass="text-ink">
          {t('case.airwatch.help')}
        </Position>
        <Position track="OFFICIAL" columns={columns} icon={o.icon} label={t('case.official.label')} value={t(`case.official.${official.state}`)} valueClass={o.cls}>
          {t(`case.official.help.${official.state}`, { date: filed })}
          {official.daysWithoutResponse >= 1 ? ` ${t('case.official.waiting', { days: official.daysWithoutResponse })}` : ''}
        </Position>
        <Position track="CITIZEN" columns={columns} icon={c.icon} label={t('case.citizen.label')} value={t(`case.citizen.${citizen.state}`)} valueClass={c.cls}>
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

// The part of the page each next step is about: the BMC steps, the on-site check, or sharing.
const NEXT_TARGET = {
  'next.file': 'official', 'next.waiting': 'site', 'next.waitingLong': 'official', 'next.afterAction': 'site',
  'next.persists': 'share', 'next.improvedUnchecked': 'site', 'next.improved': 'site',
};

/** `onGo(target)` turns the advice into a button that takes the reader to that part of the page. */
export function NextStep({ report, onGo }) {
  const { t } = useI18n();
  const key = nextStepKey(report);
  if (!key) return null;
  const target = NEXT_TARGET[key];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-lg border border-line bg-mute-soft px-3.5 py-3">
      <ArrowRight className="size-4.5 shrink-0 self-start text-accent-strong sm:mt-0.5" aria-hidden />
      <p className="min-w-0 flex-1 basis-64 text-[0.875rem]">
        <span className="font-semibold">{t('next.title')}</span>{' '}
        <span className="text-ink-2">{t(key, { days: report.positions.official.daysWithoutResponse ?? 0 })}</span>
      </p>
      {onGo ? <Button size="sm" className="max-sm:w-full" onClick={() => onGo(target)}>{t(`next.go.${target}`)}</Button> : null}
    </div>
  );
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
// Today's date in Mumbai, as YYYY-MM-DD: the server judges "not in the future" by the same calendar.
const todayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

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

/** The form for one kind of follow-up. What is asked depends on the kind, never on a chooser. */
function FollowUpForm({ report, kind, channels, onDone, onCancel }) {
  const { t } = useI18n();
  const uid = useId();
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
  const form = useRef(null);
  useEffect(() => { form.current?.querySelector('input:not([type=file]), textarea, select')?.focus({ preventScroll: true }); }, []);

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
    <form ref={form} noValidate onSubmit={submit} aria-label={t(`action.${kind}`)} className="space-y-4 rounded-lg border border-line-strong bg-paper/60 p-3.5">
      {state.error ? <Notice tone="flag" title={state.error} /> : null}
      {state.fields.kind ? <Notice tone="flag" title={state.fields.kind} /> : null}

      {kind === 'OFFICIAL_COMPLAINT' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FormField label={t('form.reference')} htmlFor={`${uid}-reference`} hint={t('form.referenceHint')} error={state.fields.officialReference}>
              <input id={`${uid}-reference`} type="text" maxLength={60} autoComplete="off" className="field num" value={reference} onChange={(e) => setReference(e.target.value)} />
            </FormField>
          </div>
          <FormField label={t('form.channel')} htmlFor={`${uid}-channel`} error={state.fields.officialChannel}>
            <select id={`${uid}-channel`} className="field" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('form.channelChoose')}</option>
              {channels.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
              <option value="other">{t('form.channel.other')}</option>
            </select>
          </FormField>
          <FormField label={t('form.filedOn')} htmlFor={`${uid}-date`} error={state.fields.occurredOn}>
            <input id={`${uid}-date`} type="date" max={todayLocal()} className="field num" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
          </FormField>
        </div>
      ) : null}

      {kind === 'OFFICIAL_RESPONSE' ? (
        <FormField label={t('form.responseOn')} htmlFor={`${uid}-date`} error={state.fields.occurredOn}>
          <input id={`${uid}-date`} type="date" max={todayLocal()} className="field num sm:max-w-56" value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </FormField>
      ) : null}

      {kind === 'OFFICIAL_COMPLAINT' ? null : (
        <FormField label={t(`form.note.${kind}`)} htmlFor={`${uid}-note`} error={state.fields.note}>
          <textarea id={`${uid}-note`} rows={3} maxLength={2000} className="field resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
        </FormField>
      )}

      {official ? (
        <FileList id={`${uid}-document`} files={proof} setFiles={setProof} max={1} error={state.fields.acknowledgment}
          label={t(kind === 'OFFICIAL_COMPLAINT' ? 'form.acknowledgment' : 'form.responseFile')} hint={t('form.acknowledgmentHint')} />
      ) : (
        <>
          <FileList id={`${uid}-photos`} files={photos} setFiles={setPhotos} max={MAX_PHOTOS} label={t('form.photos')} hint={t('form.photosHint')} error={state.fields.photos} />
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
        {onCancel ? <Button variant="ghost" onClick={onCancel}>{t('form.cancel')}</Button> : null}
      </div>
    </form>
  );
}

const SignInToAdd = () => {
  const { t } = useI18n();
  const location = useLocation();
  return <Link to="/login" state={{ from: location.pathname }} className={buttonClass({ variant: 'secondary', size: 'sm' })}>{t('action.signIn')}</Link>;
};

// --- The on-site check ---

const SITE_ACTIONS = [
  { kind: 'STILL_UNRESOLVED', icon: TriangleAlert, on: 'border-report bg-[#fdf0e8] text-report' },
  { kind: 'IMPROVEMENT_OBSERVED', icon: ThumbsUp, on: 'border-ok bg-ok-soft text-ok' },
];

/**
 * What residents record about the site itself: the answer to "did anything change?", which no
 * status set by AirWatch or BMC can give. Any signed-in citizen may add to a case; the case
 * desk checks follow-ups from its own screens instead.
 */
export function SiteCheck({ report, channels, onChanged, owner = false }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const [kind, setKind] = useState(null);
  const [added, setAdded] = useState(false);
  if (user?.role === 'MUNICIPAL') return null;
  const actions = SITE_ACTIONS;
  return (
    <div>
      {added ? <div className="mb-3"><Notice tone="ok" icon={CircleCheck} title={t('form.added')} /></div> : null}
      <p className="text-[0.875rem] text-ink-2">{t('site.question')}</p>
      {user ? (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2" role="group" aria-label={t('site.title')}>
            {actions.map(({ kind: k, icon: Icon, on }) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setAdded(false); setKind(kind === k ? null : k); }}
                className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-left text-[0.875rem] leading-tight font-medium transition-colors duration-150 ${kind === k ? on : 'border-line-strong bg-surface text-ink hover:border-ink-3 hover:bg-paper'}`}>
                <Icon className="size-4 shrink-0" aria-hidden />{t(`action.${k}`)}
              </button>
            ))}
          </div>
          {kind ? (
            <div className="mt-3">
              <FollowUpForm key={kind} report={report} kind={kind} channels={channels} onCancel={() => setKind(null)}
                onDone={() => { setKind(null); setAdded(true); onChanged(); }} />
            </div>
          ) : null}
        </>
      ) : <div className="mt-2.5"><SignInToAdd /></div>}
      <p className="mt-2.5 flex items-start gap-1.5 text-[0.8125rem] text-ink-2"><Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t('action.anyone')}</p>
      {owner && CLOSED.has(report.status) ? <div className="mt-3 rounded-lg border border-line bg-paper p-3 text-sm"><strong>{t('detail.closureDispute')}</strong><p className="mt-1 text-ink-2">{t('detail.closureDisputeHelp')}</p><Button variant="secondary" size="sm" className="mt-2" onClick={() => { setAdded(false); setKind(kind === 'DISPUTE_CLOSURE' ? null : 'DISPUTE_CLOSURE'); }}>{t('detail.disputeClosure')}</Button></div> : null}
    </div>
  );
}

// --- Taking it to BMC ---

const STEP_MARK = {
  done: 'border-[#bfdcc8] bg-ok-soft text-ok',
  current: 'border-accent bg-accent text-white',
  todo: 'border-line-strong bg-surface text-ink-2',
};

function Step({ n, state, title, summary, open, onToggle, last = false, children }) {
  const { t } = useI18n();
  const id = useId();
  return (
    <li className="relative pl-10">
      {last ? null : <span className="absolute top-8 bottom-0 left-[0.8125rem] w-px bg-line" aria-hidden />}
      <span className={`absolute top-1 left-0 grid size-7 place-items-center rounded-full border text-[0.8125rem] font-semibold ${STEP_MARK[state]}`} aria-hidden>
        {state === 'done' ? <Check className="size-4" strokeWidth={2.6} /> : n}
      </span>
      <h3>
        <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle} className="flex min-h-9 w-full items-start gap-2 py-1 text-left">
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{title}</span>
            <span className="sr-only"> ({t(`flow.state.${state}`)})</span>
            {summary ? <span className="num block text-[0.8125rem] break-words text-ink-2">{summary}</span> : null}
          </span>
          <ChevronDown className={`mt-1 size-4.5 shrink-0 text-ink-2 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
        </button>
      </h3>
      <div id={id} hidden={!open} className="space-y-3 pt-1.5 pb-5 text-[0.875rem]">{children}</div>
      {open ? null : <div className={last ? '' : 'pb-3'} />}
    </li>
  );
}

function OfficialEntry({ entry }) {
  const { t, locale } = useI18n();
  const check = CHECK_STYLE[entry.check];
  const CheckIcon = check.icon;
  return (
    <li className="rounded-lg border border-line bg-paper/60 px-3 py-2">
      {entry.officialReference ? <p className="num font-medium break-all">{t('trail.ref', { reference: entry.officialReference })}</p> : null}
      <p className="num text-[0.8125rem] text-ink-2">
        {[entry.officialChannel, entry.occurredOn ? t('trail.filedOn', { date: fmtDate(entry.occurredOn, locale) }) : null].filter(Boolean).join(' · ')}
      </p>
      {entry.note ? <p className="mt-1 max-w-[65ch] whitespace-pre-line">{entry.note}</p> : null}
      <p className={`mt-1 flex items-start gap-1.5 text-[0.8125rem] ${check.cls}`}><CheckIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t(`trail.check.${entry.check}`)}</p>
    </li>
  );
}

/**
 * The official complaint as three steps: send the prepared text to BMC, save the reference
 * number BMC gives, record what BMC replies. Each step shows what is already on the case and
 * holds its own short form, so nothing has to be found elsewhere on the page.
 * `openStep` lets the page open a step from outside (the "what to do next" button).
 */
export function OfficialFlow({ report, wardOffice, authority, onChanged, openStep }) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const citizen = user?.role === 'CITIZEN';
  const { official } = report.positions;
  const filings = report.followUps.filter((f) => f.kind === 'OFFICIAL_COMPLAINT' && f.check !== 'SET_ASIDE');
  const replies = report.followUps.filter((f) => f.kind === 'OFFICIAL_RESPONSE' && f.check !== 'SET_ASIDE');
  const filed = official.state !== 'NONE';
  const current = !filed ? 'send' : replies.length === 0 ? 'reply' : null;
  const [open, setOpen] = useState(current);
  const [adding, setAdding] = useState(null); // 'reference' | 'reply'
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (openStep?.step) setOpen(openStep.step); }, [openStep]);
  const toggle = (step) => setOpen(open === step ? null : step);
  const draft = useMemo(() => complaintDraft({ report, wardOffice, authority, t, locale }), [report, wardOffice, authority, t, locale]);
  const copy = async () => {
    if (await copyText(draft)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };
  const share = () => navigator.share({ text: draft }).catch(() => {});
  const done = () => { setAdding(null); onChanged(); };
  const online = authority.channels.filter((c) => !c.phone && c.key !== 'mpcb-sro' && c.key !== 'ward-office');
  const helpline = authority.channels.find((c) => c.phone);
  const escalate = authority.channels.filter((c) => c.key === 'mpcb-sro' || c.key === 'ward-office');
  const wardPhone = wardOffice?.phone?.split(' (')[0];
  const latest = filings.at(-1);

  return (
    <div>
      <p className="mb-4 text-[0.875rem] text-ink-2">{t('kit.intro')}</p>
      <ol>
        <Step n={1} state={filed ? 'done' : 'current'} title={t('flow.send')} open={open === 'send'} onToggle={() => toggle('send')}>
          <div>
            <textarea readOnly rows={6} aria-label={t('kit.draftLabel')} value={draft} onFocus={(e) => e.target.select()}
              className="block w-full resize-y rounded-lg border border-line-strong bg-paper px-3 py-2 text-[0.8125rem] leading-relaxed text-ink" />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" icon={copied ? Check : Copy} onClick={copy}><span aria-live="polite">{t(copied ? 'kit.copied' : 'kit.copy')}</span></Button>
              {typeof navigator.share === 'function' ? <Button variant="secondary" size="sm" icon={Share2} onClick={share}>{t('share.other')}</Button> : null}
            </div>
            {report.description ? null : <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t('kit.describeYourself')}</p>}
          </div>
          <div>
            <p className="font-medium">{t('flow.where')}</p>
            <ul className="mt-1.5 grid gap-2 sm:grid-cols-2">
              {online.map((c) => (
                <li key={c.key} className="rounded-lg border border-line px-3 py-2">
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
          {citizen && !filed ? <Button variant="secondary" size="sm" icon={ArrowRight} onClick={() => setOpen('reference')}>{t('flow.sent')}</Button> : null}
        </Step>

        <Step n={2} state={filed ? 'done' : open === 'reference' ? 'current' : 'todo'} title={t('flow.reference')}
          summary={latest?.officialReference ? t('trail.ref', { reference: latest.officialReference }) : null}
          open={open === 'reference'} onToggle={() => toggle('reference')}>
          {filings.length ? <ul className="space-y-2">{filings.map((entry) => <OfficialEntry key={entry.id} entry={entry} />)}</ul> : null}
          <p className="text-ink-2">{t('kit.step3Body')}</p>
          {!citizen ? (user ? null : <SignInToAdd />)
            : !filed || adding === 'reference' ? <FollowUpForm report={report} kind="OFFICIAL_COMPLAINT" channels={authority.channels} onDone={done} onCancel={filed ? () => setAdding(null) : null} />
              : <Button variant="secondary" size="sm" icon={FileCheck} onClick={() => setAdding('reference')}>{t('flow.addAnother')}</Button>}
        </Step>

        <Step n={3} last state={replies.length ? 'done' : filed ? 'current' : 'todo'} title={t('flow.reply')}
          summary={replies.length ? t('case.official.ACTION_DOCUMENTED') : official.daysWithoutResponse >= 1 ? t('case.official.waiting', { days: official.daysWithoutResponse }) : null}
          open={open === 'reply'} onToggle={() => toggle('reply')}>
          {replies.length ? <ul className="space-y-2">{replies.map((entry) => <OfficialEntry key={entry.id} entry={entry} />)}</ul> : null}
          {!filed ? <p className="text-ink-2">{t('flow.replyLocked')}</p>
            : !citizen ? (user ? null : <SignInToAdd />)
              : adding === 'reply' ? <FollowUpForm report={report} kind="OFFICIAL_RESPONSE" channels={authority.channels} onDone={done} onCancel={() => setAdding(null)} />
                : <Button variant="secondary" size="sm" icon={Landmark} onClick={() => setAdding('reply')}>{t('action.OFFICIAL_RESPONSE')}</Button>}
          {filed ? (
            <div>
              <p className="font-medium">{t('kit.escalate')}</p>
              <ul className="mt-1 space-y-1.5 text-ink-2">
                {escalate.map((c) => (
                  <li key={c.key}><a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline">{c.name}</a> · {c.detail}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Step>
      </ol>
    </div>
  );
}

// --- Photographs ---

/** What is said under any image that came with the demo data. */
export function DemoImageNote({ className = '' }) {
  const { t } = useI18n();
  return <p className={`flex items-start gap-1.5 text-[0.75rem] text-warn ${className}`}><DemoTag className="shrink-0" /><span>{t('demo.imageNote')}</span></p>;
}

/**
 * Public photographs: the first one large when `lead` is set, the rest as thumbnails.
 * `demo` marks them as illustrative images from the demo data, not evidence from a site.
 * @param {{photos: Array<{id: string, src: string, alt: string}>, demo?: boolean, lead?: boolean, label?: string}} props
 */
export function PhotoGrid({ photos, demo = false, lead = false, label, className = '' }) {
  if (photos.length === 0) return null;
  const [first, ...rest] = lead ? photos : [null, ...photos];
  const tile = (photo, shape) => (
    <a href={photo.src} target="_blank" rel="noreferrer" className="relative block overflow-hidden rounded-lg border border-line bg-mute-soft">
      <img src={photo.src} alt={photo.alt} loading="lazy" className={`w-full object-cover ${shape}`} />
    </a>
  );
  return (
    <div className={className}>
      {first ? tile(first, 'aspect-[4/3]') : null}
      {rest.length ? (
        <ul className={`grid grid-cols-3 gap-2 ${first ? 'mt-2' : ''}`} aria-label={label}>
          {rest.map((photo) => <li key={photo.id}>{tile(photo, 'aspect-square')}</li>)}
        </ul>
      ) : null}
      {demo ? <DemoImageNote className="mt-1.5" /> : null}
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
        <PhotoGrid className="mt-2 max-w-md" demo={entry.isDemo}
          photos={entry.photos.map((photo, i) => ({ id: photo.id, src: apiUrl(photo.url), alt: t('trail.photoAlt', { n: i + 1 }) }))} />
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
    <ol>
      {entries.map((entry, i) => (
        <li key={`${entry.track}-${entry.id}`} className="relative pb-5 pl-6 text-[0.875rem] last:pb-0">
          {i === entries.length - 1 ? null : <span className="absolute top-3 bottom-0 left-[0.3125rem] w-px bg-line" aria-hidden />}
          <span className={`absolute top-1.5 left-0 size-[0.6875rem] rounded-[3px] ring-2 ring-surface ${SWATCH[entry.track] ?? SWATCH.CITIZEN}`} aria-hidden />
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
