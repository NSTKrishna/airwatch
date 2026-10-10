import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CircleCheck, HardHat, ImagePlus, LocateFixed, Search, Send, X } from 'lucide-react';
import { api } from '../../lib/api.js';
import { useApi } from '../../lib/useApi.js';
import { useI18n } from '../../lib/i18n.jsx';
import { fmtNumber } from '../../lib/format.js';
import { Button, FormField, LoadError, Notice, Panel } from '../../components/ui.jsx';

const MAX_PHOTOS = 4;
const MAX_BYTES = 5 * 1024 * 1024;

function Choice({ checked, onChange, name, value, title, detail }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150 ${checked ? 'border-accent bg-accent-soft/60' : 'border-line-strong bg-surface hover:border-ink-3'}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="mt-1 size-4 shrink-0 accent-(--color-accent)" />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {detail ? <span className="num block text-[0.8125rem] text-ink-2">{detail}</span> : null}
      </span>
    </label>
  );
}

export default function ReportForm() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fileInput = useRef(null);

  const overview = useApi('/public/overview');
  const projects = useApi('/public/projects');
  const [projectCode, setProjectCode] = useState(params.get('project') || '');
  const [wardSlug, setWardSlug] = useState('');
  const [search, setSearch] = useState('');
  const [description, setDescription] = useState('');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState(null);
  const [place, setPlace] = useState(null); // what /public/locate says about the coordinates
  const [geo, setGeo] = useState('idle'); // idle | locating | denied | failed
  const [photos, setPhotos] = useState([]); // {file, url}
  const [photoError, setPhotoError] = useState(null);
  const [state, setState] = useState({ busy: false, error: null, fields: {} });

  useEffect(() => { document.title = `${t('report.title')} · AirWatch`; }, [t]);

  // Revoke preview URLs when the form goes away.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const pilotWards = (overview.data?.wards || []).filter((w) => w.pilot);
  const allProjects = projects.data?.projects || [];
  const project = allProjects.find((p) => p.code === projectCode) || null;
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return allProjects.filter((p) => [p.name, p.developer, p.address, p.registrationNo].some((v) => v?.toLowerCase().includes(q))).slice(0, 6);
  }, [search, allProjects]);

  // The ward the report will go to, in the order the server applies: project, coordinates, chosen ward.
  const ward = project ? pilotWards.find((w) => w.slug === project.ward.slug)
    : place ? place.ward
      : pilotWards.find((w) => w.slug === wardSlug) || null;
  const outsidePilot = !project && place && !place.ward?.pilot;

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
      async (pos) => {
        const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(here);
        try {
          setPlace(await api.get(`/public/locate?lat=${here.latitude}&lng=${here.longitude}`));
          setGeo('idle');
        } catch {
          setGeo('failed');
        }
      },
      () => setGeo('denied'),
      { enableHighAccuracy: true, timeout: 10_000 });
  };
  const clearLocation = () => { setCoords(null); setPlace(null); setGeo('idle'); };

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData();
    if (project) form.append('projectCode', project.code);
    else if (!coords && wardSlug) form.append('wardSlug', wardSlug);
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
      document.querySelector('main')?.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const failed = [overview, projects].find((r) => r.error && !r.data);
  if (failed) return <LoadError error={failed.error} onRetry={failed.reload} />;
  const whereError = state.fields.projectCode || state.fields.latitude || state.fields.wardSlug;

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('report.title')}</h1>
      <p className="mt-1.5 text-ink-2">{t('report.intro')}</p>
      <p className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-line bg-mute-soft px-2 py-1 text-[0.8125rem] text-ink-2">
        <HardHat className="size-3.5" aria-hidden />{t('report.onlyCategory')}
      </p>

      <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
        {state.error ? <Notice tone="flag" title={state.error} /> : null}

        <Panel className="space-y-4 p-4 sm:p-5">
          <h2 className="font-semibold">{t('report.whereHeading')}</h2>

          {project ? (
            <div className="flex items-start gap-3 rounded-lg border border-accent bg-accent-soft/60 px-3 py-2.5">
              <Building2 className="mt-0.5 size-4.5 shrink-0 text-accent-strong" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{project.name}</p>
                <p className="text-[0.8125rem] text-ink-2">{t('ward.title', { name: project.ward.name })}{project.address ? ` · ${project.address}` : ''}</p>
              </div>
              <button type="button" className="shrink-0 text-[0.875rem] font-medium text-ink-2 underline" onClick={() => setProjectCode('')}>{t('report.change')}</button>
            </div>
          ) : (
            <>
              {coords ? (
                <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-ok">
                  <CircleCheck className="size-4" aria-hidden />
                  <span className="num">{t('report.locationSet', { lat: coords.latitude.toFixed(4), lng: coords.longitude.toFixed(4) })}</span>
                  <button type="button" className="font-medium text-ink-2 underline" onClick={clearLocation}>{t('report.locationClear')}</button>
                </p>
              ) : (
                <div>
                  <Button variant="secondary" icon={LocateFixed} loading={geo === 'locating'} onClick={locate}>
                    {geo === 'locating' ? t('report.locating') : t('report.useLocation')}
                  </Button>
                  {geo === 'denied' ? <p className="mt-2 text-[0.8125rem] text-warn">{t('report.locationDenied')}</p> : null}
                </div>
              )}
              {geo === 'failed' ? <p className="text-[0.8125rem] text-warn">{t('report.locateFailed')}</p> : null}

              {place?.ward?.pilot ? (
                <fieldset className="space-y-2">
                  <legend className="mb-1.5 text-[0.8125rem] font-medium">{place.nearbyProjects.length ? t('report.nearby', { ward: place.ward.name }) : t('report.nearbyNone', { ward: place.ward.name })}</legend>
                  {place.nearbyProjects.map((p) => (
                    <Choice key={p.code} name="nearby" value={p.code} checked={false} onChange={() => setProjectCode(p.code)} title={p.name}
                      detail={t('report.distance', { metres: fmtNumber(p.distanceM, 0, locale) })} />
                  ))}
                  {place.nearbyProjects.length ? <Choice name="nearby" value="" checked onChange={() => {}} title={t('report.siteOther')} detail={t('report.siteOtherHelp')} /> : null}
                </fieldset>
              ) : null}
              {outsidePilot ? (
                <Notice tone="warn" title={place.ward ? t('report.outsidePilot', { ward: place.ward.name }) : t('report.outsideMumbai')}>
                  {t('report.pilotWards', { wards: pilotWards.map((w) => w.name).join(', ') })}
                </Notice>
              ) : null}

              <FormField label={t('report.findProject')} htmlFor="project-search" optional={t('report.optional')}>
                <span className="relative block">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
                  <input id="project-search" type="search" className="field pl-9!" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('report.findProjectPlaceholder')} />
                </span>
                {matches.length ? (
                  <ul className="mt-2 divide-y divide-line overflow-hidden rounded-lg border border-line">
                    {matches.map((p) => (
                      <li key={p.code}>
                        <button type="button" className="block w-full px-3 py-2 text-left transition-colors duration-150 hover:bg-paper" onClick={() => { setProjectCode(p.code); setSearch(''); }}>
                          <span className="block font-medium">{p.name}</span>
                          <span className="block text-[0.8125rem] text-ink-2">{t('ward.title', { name: p.ward.name })}{p.registrationNo ? ` · ${p.registrationNo}` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : search.trim().length >= 2 ? <p className="mt-2 text-[0.8125rem] text-ink-2">{t('report.findProjectNone')}</p> : null}
              </FormField>

              {!coords ? (
                <FormField label={t('report.ward')} htmlFor="ward" hint={t('report.wardHint')}>
                  <select id="ward" className="field" value={wardSlug} onChange={(e) => setWardSlug(e.target.value)}>
                    <option value="">{t('report.wardChoose')}</option>
                    {pilotWards.map((w) => <option key={w.slug} value={w.slug}>{w.name}{w.areas ? ` (${w.areas})` : ''}</option>)}
                  </select>
                </FormField>
              ) : null}
            </>
          )}
          {whereError ? <p role="alert" className="text-[0.8125rem] text-flag">{whereError}</p> : null}

          <FormField label={project || coords ? t('report.whereOptional') : t('report.where')} htmlFor="locationText" error={state.fields.locationText}>
            <input id="locationText" type="text" maxLength={300} className="field" value={locationText} placeholder={t('report.wherePlaceholder')}
              aria-invalid={Boolean(state.fields.locationText)} onChange={(e) => setLocationText(e.target.value)} />
          </FormField>

          {ward?.pilot ? (
            <div className="rounded-lg bg-mute-soft px-3 py-2.5 text-[0.875rem]">
              <p className="font-medium">{t('report.routedTo', { ward: ward.name })}</p>
              {ward.office?.address ? <p className="mt-0.5 text-ink-2">{ward.office.address}</p> : null}
              <p className="mt-1.5 text-[0.8125rem] text-ink-2">{t('report.routedNote')}</p>
            </div>
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
          <p className="mt-3 text-[0.8125rem] text-ink-2">{t('report.photosPublic')}</p>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <FormField label={t('report.description')} htmlFor="description" error={state.fields.description}>
            <textarea id="description" rows={4} maxLength={2000} required className="field resize-y" value={description}
              placeholder={t('report.descriptionPlaceholder')} aria-invalid={Boolean(state.fields.description)}
              onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </Panel>

        <Button type="submit" size="lg" block icon={Send} loading={state.busy} disabled={outsidePilot}>{state.busy ? t('report.submitting') : t('report.submit')}</Button>
        <p className="text-center text-[0.8125rem] text-ink-2">{t('pub.notOfficial')}</p>
      </form>
    </div>
  );
}
