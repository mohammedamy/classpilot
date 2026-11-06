import { useEffect, useState } from 'react';
import { Globe, LogIn, ShieldCheck } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { isFirebaseEnabled, signInWithGoogle } from '../lib/firebase.js';
import { Spinner } from './ui.jsx';
import { t, toggleLang, useLang } from '../i18n/index.js';

export default function AuthGate({ children }) {
  const { user, setTeacherMode } = useStore();
  const lang = useLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setTeacherMode(true);
    return () => setTeacherMode(false);
  }, [setTeacherMode]);

  if (!isFirebaseEnabled) return children;

  if (user === undefined) {
    return (
      <div className="take" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="row muted"><Spinner /> <span>{t('Loading workspace…')}</span></div>
      </div>
    );
  }

  if (!user) {
    async function login() {
      setBusy(true);
      setErr('');
      try {
        await signInWithGoogle();
      } catch (e) {
        setErr(e?.message || t('Sign-in failed. Please try again.'));
      } finally {
        setBusy(false);
      }
    }

    return (
      <div className="take" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="card card-pad stack" style={{ maxWidth: 440, width: '100%', padding: 32 }}>
          <div className="row-between">
            <div className="row" style={{ gap: 10 }}>
              <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="32" height="32" alt="" />
              <div>
                <div className="brand-name" style={{ color: 'var(--ink-950)' }}>ClassPilot</div>
                <div className="tiny muted">{t('for Classera teachers')}</div>
              </div>
            </div>
            <button type="button" className="lang-switch" onClick={toggleLang} aria-label={t('Switch language')}>
              <Globe /> {lang === 'ar' ? 'English' : 'العربية'}
            </button>
          </div>

          <div style={{ marginTop: 8 }}>
            <h1>{t('Teacher sign-in')}</h1>
            <p className="muted small" style={{ marginTop: 6 }}>
              {t('Sign in with Google to sync your classes, assignments, and student submissions across devices.')}
            </p>
          </div>

          {err && <div className="banner" style={{ fontSize: 12.5 }}>{err}</div>}

          <button className="btn btn-primary" style={{ height: 44 }} onClick={login} disabled={busy}>
            {busy ? <Spinner /> : <LogIn />} {t('Continue with Google')}
          </button>

          <div className="row tiny muted" style={{ gap: 6, justifyContent: 'center' }}>
            <ShieldCheck size={14} />
            <span>{t('Your Gemini API key stays in this browser only.')}</span>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
