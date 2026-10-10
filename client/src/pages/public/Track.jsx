import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../../lib/auth.jsx';
import { useI18n } from '../../lib/i18n.jsx';
import { Button, FormField, Panel } from '../../components/ui.jsx';

const REFERENCE = /^AW-\d{4}-\d{1,9}$/i;

export default function Track() {
  const { t } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);
  useEffect(() => { document.title = `${t('track.title')} · AirWatch`; }, [t]);

  const submit = (event) => {
    event.preventDefault();
    const reference = value.trim().toUpperCase();
    if (!REFERENCE.test(reference)) { setError(t('track.invalid')); return; }
    navigate(`/report/${reference}`);
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t('track.title')}</h1>
      <p className="mt-1.5 text-ink-2">{t('track.intro')}</p>
      <Panel as="form" className="mt-5 space-y-4 p-4 sm:p-5" noValidate onSubmit={submit}>
        <FormField label={t('track.reference')} htmlFor="reference" hint={t('track.hint')} error={error}>
          <input id="reference" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} className="field num uppercase placeholder:normal-case"
            value={value} placeholder="AW-2026-00042" aria-invalid={Boolean(error)} onChange={(e) => { setValue(e.target.value); setError(null); }} />
        </FormField>
        <Button type="submit" block size="lg" icon={Search}>{t('track.submit')}</Button>
      </Panel>
      {user?.role === 'MUNICIPAL' ? null : (
        <p className="mt-4 text-[0.875rem] text-ink-2">
          {t('track.mine')} <Link to="/citizen/complaints" className="font-medium text-accent underline">{t('nav.complaints')}</Link>
        </p>
      )}
    </div>
  );
}
