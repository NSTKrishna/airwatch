import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheck, ImagePlus, Info, LocateFixed, Send, TriangleAlert, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtTime, verdictOf } from '../../lib/format.js';
import { Button, FormField, LoadError, Notice, Panel } from '../../components/ui.jsx';

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;
const OTHER = '__other__';

export default function ReportForm() {
  const { t, locale, place } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fileInput = useRef(null);

  const localities = useApi('/localities');
  const [locality, setLocality] = useState(params.get('locality') || '');
  const [siteId, setSiteId] = useState(params.get('site') || '');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState(null);
  const [geo, setGeo] = useState('idle'); // idle | locating | denied
  const [photos, setPhotos] = useState([]); // {file, url}
  const [photoError, setPhotoError] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, fields: {} });

  useEffect(() => { document.title = `${t('report.title')} · AirWatch`; }, [t]);
  useEffect(() => {
    if (!locality && localities.data) setLocality(localities.data.localities[0]?.code || '');
  }, [locality, localities.data]);

  const area = useApi(locality ? `/localities/${locality}` : null);
  const sites = area.data?.sites || [];
  const site = sites.find((s) => s.id === siteId);

  // Revoke preview URLs when the form goes away.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addPhotos = (fileList) => {
    setPhotoError(null);
    const next = [...photos];
    for (const file of fileList) {
      if (next.length >= MAX_PHOTOS) { setPhotoError(t('report.tooMany')); break; }
      if (file.size > MAX_BYTES) { setPhotoError(t('report.tooLarge', { name: file.name })); continue; }
      next.push({ file, url: URL.createObjectURL(file) });
    }
    setPhotos(next);
    if (fileInput.current) fileInput.current.value = '';
  };
  const removePhoto = (index) => {
    URL.revokeObjectURL(photos[index].url);
    setPhotos(photos.filter((_, i) => i !== index));
  };

  const locate = () => {
    if (!navigator.geolocation) { setGeo('denied'); return; }
    setGeo('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => { setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }); setGeo('idle'); },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 10_000 });
  };

  const evidence = useMemo(() => {
    if (!site) return null;
    return verdictOf(site.latest) === 'flagged' ? { flagged: true, time: fmtTime(site.latest.evaluation.evaluatedAt, locale) } : { flagged: false };
  }, [site, locale]);

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData();
    form.append('localityCode', locality);
    if (site) form.append('siteId', site.id);
    form.append('description', description);
    if (locationText.trim()) form.append('locationText', locationText.trim());
    if (coords) { form.append('latitude', coords.latitude); form.append('longitude', coords.longitude); }
    photos.forEach((p) => form.append('photos', p.file, p.file.name));
    setState({ busy: true, error: null, fields: {} });
    try {
      const { complaint } = await api.upload('/complaints', form);
      navigate(`/citizen/complaints/${complaint.id}`, { state: { justSubmitted: true } });
    } catch (error) {
      setState({ busy: false, error: Object.keys(error.fields || {}).length ? t('report.fixErrors') : error.message, fields: error.fields || {} });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (localities.error && !localities.data) return <LoadError error={localities.error} onRetry={localities.reload} />;
  const needsWhere = !site;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('report.title')}</h1>
      <p className="mt-1.5 text-ink-2">{t('report.intro')}</p>

      <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
        {state.error ? <Notice tone="flag" title={state.error} /> : null}

        <Panel className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('report.locality')} htmlFor="locality" error={state.fields.localityCode}>
              <select id="locality" className="field" value={locality} onChange={(e) => { setLocality(e.target.value); setSiteId(''); }}>
                {(localities.data?.localities || []).map((l) => <option key={l.code} value={l.code}>{place(l)}</option>)}
              </select>
            </FormField>
            <FormField label={t('report.site')} htmlFor="site" error={state.fields.siteId}>
              <select id="site" className="field" value={siteId || OTHER} onChange={(e) => setSiteId(e.target.value)}>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={OTHER}>{t('report.siteOther')}</option>
              </select>
            </FormField>
          </div>
          {evidence ? (
            evidence.flagged
              ? <Notice tone="flag" icon={TriangleAlert} title={t('report.evidenceAttached')}>{t('report.evidenceAttachedBody', { time: evidence.time })}</Notice>
              : <Notice tone="info" icon={Info} title={t('report.evidenceNone')}>{t('report.evidenceNoneBody')}</Notice>
          ) : null}
        </Panel>

        <Panel className="p-4 sm:p-5">
          <FormField label={t('report.photos')} htmlFor="photos" hint={t('report.photosHint')} error={state.fields.photos || photoError}>
            <input ref={fileInput} id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only"
              aria-invalid={Boolean(state.fields.photos)} onChange={(e) => addPhotos(e.target.files)} />
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((p, i) => (
                <li key={p.url} className="relative aspect-square overflow-hidden rounded-lg border border-line">
                  <img src={p.url} alt="" className="size-full object-cover" />
                  <button type="button" onClick={() => removePhoto(i)} aria-label={t('report.removePhoto', { name: p.file.name })}
                    className="absolute top-1 right-1 grid size-7 place-items-center rounded-full bg-ink/80 text-white transition-colors duration-150 hover:bg-ink">
                    <X className="size-4" aria-hidden />
                  </button>
                </li>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <li className={photos.length === 0 ? 'col-span-full' : ''}>
                  <label htmlFor="photos"
                    className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-paper text-[0.875rem] font-medium text-accent transition-colors duration-150 hover:border-accent hover:bg-accent-soft/50 ${photos.length === 0 ? 'h-28 flex-col' : 'aspect-square flex-col px-1 text-center text-[0.75rem]'}`}>
                    <ImagePlus className="size-6" strokeWidth={1.6} aria-hidden />{t('report.addPhoto')}
                  </label>
                </li>
              ) : null}
            </ul>
          </FormField>
        </Panel>

        <Panel className="space-y-4 p-4 sm:p-5">
          <FormField label={t('report.description')} htmlFor="description" error={state.fields.description}>
            <textarea id="description" rows={4} maxLength={2000} required className="field resize-y" value={description}
              placeholder={t('report.descriptionPlaceholder')} aria-invalid={Boolean(state.fields.description)}
              onChange={(e) => setDescription(e.target.value)} />
          </FormField>

          <FormField label={needsWhere ? t('report.where') : t('report.whereOptional')} htmlFor="locationText" error={state.fields.locationText || state.fields.latitude}>
            <input id="locationText" type="text" maxLength={300} className="field" value={locationText} placeholder={t('report.wherePlaceholder')}
              aria-invalid={Boolean(state.fields.locationText)} onChange={(e) => setLocationText(e.target.value)} />
          </FormField>

          {coords ? (
            <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ok">
              <CircleCheck className="size-4" aria-hidden />
              <span className="num">{t('report.locationSet', { lat: coords.latitude.toFixed(4), lng: coords.longitude.toFixed(4) })}</span>
              <button type="button" className="font-medium text-ink-2 underline" onClick={() => setCoords(null)}>{t('report.locationClear')}</button>
            </p>
          ) : (
            <div>
              <Button variant="secondary" icon={LocateFixed} loading={geo === 'locating'} onClick={locate}>
                {geo === 'locating' ? t('report.locating') : t('report.useLocation')}
              </Button>
              {geo === 'denied' ? <p className="mt-2 text-[0.8125rem] text-warn">{t('report.locationDenied')}</p> : null}
            </div>
          )}
        </Panel>

        <Button type="submit" size="lg" block icon={Send} loading={state.busy}>{state.busy ? t('report.submitting') : t('report.submit')}</Button>
        <p className="text-center text-[0.8125rem] text-ink-2">{t('verdict.disclaimer')}</p>
      </form>
    </div>
  );
}
