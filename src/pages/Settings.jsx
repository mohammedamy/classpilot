import { useEffect, useRef, useState } from 'react';
import { KeyRound, Bot, CalendarDays, Video, School, Database, Check, ExternalLink, Download, Upload, RefreshCw, PlugZap, Cloud, Globe, Trash2, LogOut, Copy } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { GEMINI_MODELS, testKey } from '../lib/gemini.js';
import { connectGoogle, isGoogleConnected } from '../lib/google.js';
import {
  isFirebaseEnabled,
  isBuildFirebase,
  firebaseConfig,
  signOutUser,
  saveRuntimeFirebaseConfig,
  clearRuntimeFirebaseConfig,
} from '../lib/firebase.js';
import firestoreRulesText from '../../firestore.rules?raw';
import { download } from '../lib/csv.js';
import { buildSeed } from '../lib/seed.js';
import { t, setLang, useLang } from '../i18n/index.js';

function Section({ icon: Icon, title, desc, children }) {
  return (
    <section className="card">
      <div className="card-head" style={{ alignItems: 'flex-start' }}>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <div className="icon-tile" style={{ background: 'var(--paper-2)', color: 'var(--ink-700)' }}><Icon /></div>
          <div><h2>{title}</h2><div className="small muted">{desc}</div></div>
        </div>
      </div>
      <div className="card-body stack">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { db, update, toast, reset, startEmpty, user, syncState } = useStore();
  const lang = useLang();
  const [s, setS] = useState(db.settings);
  const [testing, setTesting] = useState(false);
  const [gConn, setGConn] = useState(isGoogleConnected());
  const [fbSnippet, setFbSnippet] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    setS(db.settings);
  }, [db.settings]);

  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  function save() {
    update((d) => { d.settings = { ...s }; });
    toast(t('Settings saved'));
  }

  async function test() {
    setTesting(true);
    try {
      await testKey(s);
      toast(t('Gemini is connected ✓'));
      update((d) => { d.settings = { ...s }; });
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setTesting(false);
    }
  }

  async function google() {
    try {
      await connectGoogle(s.googleClientId);
      setGConn(true);
      update((d) => { d.settings = { ...s }; });
      toast(t('Google account connected'));
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  function connectFb() {
    if (!saveRuntimeFirebaseConfig(fbSnippet)) {
      toast(t('Could not find apiKey, projectId, and appId in that snippet.'), 'error');
    }
  }

  async function copyRules() {
    await navigator.clipboard.writeText(firestoreRulesText);
    toast(t('Firestore security rules copied'));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Settings')}</h1>
          <p className="sub">{t('Connect your AI, cloud database, and Google accounts. Your Gemini key stays in this browser only.')}</p>
        </div>
        <div className="page-actions"><button className="btn btn-primary" disabled={!dirty} onClick={save}><Check /> {t('Save changes')}</button></div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 18 }}>
          <Section icon={School} title={t('Profile & language')} desc={t('Used in emails, printed exams, and interface language.')}>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label={t('Your name')}><input className="input" value={s.teacherName} onChange={set('teacherName')} /></Field>
              <Field label={t('School')}><input className="input" value={s.school} onChange={set('school')} /></Field>
            </div>
            <Field label={t('Interface language')}>
              <div className="seg">
                <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}><Globe /> English</button>
                <button type="button" className={lang === 'ar' ? 'on' : ''} onClick={() => setLang('ar')}><Globe /> العربية (RTL)</button>
              </div>
            </Field>
          </Section>

          <Section icon={Bot} title={t('Google Gemini')} desc={t('Powers quiz and exam generation, auto-correction and email drafting.')}>
            <Field label={t('API key')} help={<>{t('Get a free key at')} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio <ExternalLink size={11} /></a>. {t('Without a key, ClassPilot runs in demo mode.')}</>}>
              <div className="row">
                <input className="input mono" type="password" id="gemini-key" placeholder="AIza…" value={s.geminiKey} onChange={set('geminiKey')} autoComplete="off" />
                <button className="btn" onClick={test} disabled={!s.geminiKey || testing}>{testing ? <Spinner /> : <PlugZap />} {t('Test')}</button>
              </div>
            </Field>
            <Field label={t('Model')}>
              <select className="select" value={s.geminiModel} onChange={set('geminiModel')}>{GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </Field>
          </Section>

          <Section icon={School} title={t('Classera')} desc={t('Roster import and marks export use Classera’s CSV/Excel import and export.')}>
            <Field label={t('Your Classera URL')}><input className="input" value={s.classeraUrl} onChange={set('classeraUrl')} /></Field>
            <div className="inset small muted">{t('Classera doesn’t offer a public API. If your school obtains partner API credentials, ClassPilot can push marks and assignments directly.')}</div>
          </Section>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <Section icon={Cloud} title={t('Firebase cloud & student devices')} desc={t('Syncs your workspace across devices and lets students submit quizzes from their own phones or laptops.')}>
            {isFirebaseEnabled ? (
              <div className="stack-sm">
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${syncState === 'error' ? 'b-red' : 'b-green'}`}><Check /> {syncState === 'error' ? t('Sync error') : t('Firebase connected')}</span>
                  <span className="badge mono">{firebaseConfig.projectId}</span>
                  <button type="button" className="btn btn-sm" onClick={copyRules}><Copy /> {t('Copy Firestore rules')}</button>
                  {!isBuildFirebase && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={clearRuntimeFirebaseConfig}>{t('Disconnect')}</button>
                  )}
                </div>
                {user && (
                  <div className="row-between inset small" style={{ marginTop: 6 }}>
                    <div>
                      <div className="strong">{user.displayName || t('Signed-in teacher')}</div>
                      <div className="muted tiny">{user.email}</div>
                    </div>
                    <button className="btn btn-sm" onClick={signOutUser}><LogOut /> {t('Sign out')}</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="stack">
                <Field
                  label={t('Firebase Web App config')}
                  help={t('In Firebase Console → Build → Authentication (enable Google) & Firestore Database (paste rules below), then copy your Web App firebaseConfig snippet here.')}
                >
                  <textarea
                    className="textarea mono small"
                    rows={4}
                    dir="ltr"
                    placeholder={'const firebaseConfig = {\n  apiKey: "AIza...",\n  projectId: "your-project",\n  appId: "1:..."\n};'}
                    value={fbSnippet}
                    onChange={(e) => setFbSnippet(e.target.value)}
                  />
                </Field>
                <div className="row wrap">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!fbSnippet.trim()} onClick={connectFb}>
                    <PlugZap /> {t('Connect Firebase')}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={copyRules}>
                    <Copy /> {t('Copy Firestore rules')}
                  </button>
                  <a className="btn btn-sm" href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
                    Firebase Console <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </Section>

          <Section icon={CalendarDays} title={t('Google Workspace')} desc={t('Google Calendar + Meet for online classes, Gmail for sending emails.')}>
            <Field label={t('OAuth Client ID')} help={t('Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Add this site’s address as an authorized JavaScript origin, and enable the Calendar and Gmail APIs.')}>
              <input className="input mono small" placeholder="1234-abc.apps.googleusercontent.com" value={s.googleClientId} onChange={set('googleClientId')} />
            </Field>
            <div className="row">
              <button className="btn" onClick={google} disabled={!s.googleClientId}><KeyRound /> {gConn ? t('Reconnect Google') : t('Connect Google account')}</button>
              {gConn ? <span className="badge b-green"><Check /> {t('Connected')}</span> : <span className="badge">{t('Not connected')}</span>}
            </div>
          </Section>

          <Section icon={Video} title={t('Online classes')} desc={t('Defaults for new classes in Schedule.')}>
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label={t('Default platform')}>
                <select className="select" value={s.defaultPlatform} onChange={set('defaultPlatform')}><option value="meet">{t('Google Meet')}</option><option value="zoom">{t('Zoom')}</option></select>
              </Field>
              <Field label={t('Your Zoom meeting link')} help={t('Personal Meeting Room link')}><input className="input" value={s.zoomLink} onChange={set('zoomLink')} /></Field>
            </div>
          </Section>

          <Section icon={Database} title={t('Data')} desc={isFirebaseEnabled ? t('Export a JSON backup, clear sample data to start fresh, or restore the demo workspace.') : t('Everything is stored in this browser. Back it up or move it to another computer.')}>
            <div className="row wrap">
              <button className="btn btn-sm" onClick={() => download(`classpilot_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...db, settings: { ...db.settings, geminiKey: '' } }, null, 2), 'application/json')}><Download /> {t('Back up')}</button>
              <button className="btn btn-sm" onClick={() => fileRef.current.click()}><Upload /> {t('Restore')}</button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
                const f = e.target.files[0]; if (!f) return;
                try {
                  const data = JSON.parse(await f.text());
                  if (!data.students || !data.assessments) throw new Error();
                  update((d) => { Object.assign(d, data, { settings: { ...data.settings, geminiKey: d.settings.geminiKey } }); });
                  toast(t('Backup restored'));
                } catch {
                  toast(t('That file isn’t a ClassPilot backup'), 'error');
                }
              }} />
              <button className="btn btn-sm" onClick={() => { if (confirm(t('Clear all demo classes, students, and assignments to start with an empty workspace?'))) { startEmpty(); toast(t('Workspace cleared — ready for your classes')); } }}><Trash2 /> {t('Start empty')}</button>
              <button className="btn btn-sm btn-danger" onClick={() => { if (confirm(t('Reset everything to the demo data?'))) { reset(); setS({ ...buildSeed().settings, geminiKey: s.geminiKey }); toast(t('Demo data restored')); } }}><RefreshCw /> {t('Reset demo data')}</button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
