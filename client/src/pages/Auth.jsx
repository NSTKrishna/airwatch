import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { homeFor, useAuth } from '../lib/auth.jsx';
import { useI18n } from '../lib/i18n.jsx';
import { LanguageToggle, Logo } from '../components/Brand.jsx';
import { Button, FormField, Notice } from '../components/ui.jsx';

function AuthShell({ title, children, footer }) {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4">
      <header className="flex h-14 items-center justify-between">
        <Logo />
        <LanguageToggle />
      </header>
      <main className="grid flex-1 items-center gap-10 py-8 md:grid-cols-[1fr_24rem]">
        <div className="max-w-md">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-4xl">{t('app.tagline')}</h1>
          <p className="mt-4 text-base text-ink-2">{t('auth.intro')}</p>
          <p className="mt-6 text-[0.875rem] text-ink-2">{t('verdict.disclaimer')}</p>
        </div>
        <div className="rounded-(--radius-card) border border-line bg-surface p-5 shadow-(--shadow-card) sm:p-6">
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
          <div className="mt-5 border-t border-line pt-4 text-[0.875rem] text-ink-2">{footer}</div>
        </div>
      </main>
    </div>
  );
}

function useAuthForm(action) {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState({ busy: false, error: null, fields: {} });
  const submit = async (values) => {
    setState({ busy: true, error: null, fields: {} });
    try {
      const user = await action(values);
      const from = location.state?.from;
      const home = homeFor(user);
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (error) {
      setState({ busy: false, error: error.message, fields: error.fields || {} });
    }
  };
  return { ...state, submit };
}

const DEMO = [
  { key: 'auth.demoCitizen', email: 'citizen@airwatch.test', password: 'Citizen@123' },
  { key: 'auth.demoOfficer', email: 'officer@airwatch.test', password: 'Officer@123' },
];

export function Login() {
  const { user, signIn } = useAuth();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const form = useAuthForm(() => signIn(email, password));
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <AuthShell title={t('auth.signInTitle')}
      footer={<><p>{t('auth.noAccount')} <Link className="font-medium text-accent underline" to="/register">{t('auth.createOne')}</Link></p><p className="mt-2">{t('auth.municipalNote')}</p></>}>
      <form className="mt-4 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
        {form.error && !Object.keys(form.fields).length ? <Notice tone="flag" title={form.error} /> : null}
        <FormField label={t('auth.email')} htmlFor="email" error={form.fields.email}>
          <input id="email" type="email" autoComplete="email" inputMode="email" required className="field" value={email}
            aria-invalid={Boolean(form.fields.email)} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label={t('auth.password')} htmlFor="password" error={form.fields.password}>
          <input id="password" type="password" autoComplete="current-password" required className="field" value={password}
            aria-invalid={Boolean(form.fields.password)} onChange={(e) => setPassword(e.target.value)} />
        </FormField>
        <Button type="submit" block size="lg" loading={form.busy}>{form.busy ? t('auth.signingIn') : t('auth.signIn')}</Button>
      </form>
      {import.meta.env.DEV ? (
        <div className="mt-5 rounded-lg bg-mute-soft p-3">
          <p className="text-[0.8125rem] font-medium text-ink-2">{t('auth.demo')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DEMO.map((d) => (
              <Button key={d.email} variant="secondary" size="sm" onClick={() => { setEmail(d.email); setPassword(d.password); }}>{t(d.key)}</Button>
            ))}
          </div>
        </div>
      ) : null}
    </AuthShell>
  );
}

export function Register() {
  const { user, register } = useAuth();
  const { t } = useI18n();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const form = useAuthForm(() => register(values));
  const bind = (name) => ({
    id: name, className: 'field', value: values[name], 'aria-invalid': Boolean(form.fields[name]),
    onChange: (e) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  if (user) return <Navigate to={homeFor(user)} replace />;
  return (
    <AuthShell title={t('auth.registerTitle')}
      footer={<p>{t('auth.haveAccount')} <Link className="font-medium text-accent underline" to="/login">{t('auth.signInLink')}</Link></p>}>
      <form className="mt-4 space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); form.submit(); }}>
        {form.error && !Object.keys(form.fields).length ? <Notice tone="flag" title={form.error} /> : null}
        <FormField label={t('auth.name')} htmlFor="name" error={form.fields.name}>
          <input {...bind('name')} type="text" autoComplete="name" required />
        </FormField>
        <FormField label={t('auth.email')} htmlFor="email" error={form.fields.email}>
          <input {...bind('email')} type="email" autoComplete="email" inputMode="email" required />
        </FormField>
        <FormField label={t('auth.password')} htmlFor="password" hint={t('auth.passwordHint')} error={form.fields.password}>
          <input {...bind('password')} type="password" autoComplete="new-password" required minLength={8} />
        </FormField>
        <Button type="submit" block size="lg" loading={form.busy}>{form.busy ? t('auth.registering') : t('auth.register')}</Button>
      </form>
    </AuthShell>
  );
}
