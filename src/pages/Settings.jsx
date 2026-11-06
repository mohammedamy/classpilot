import { useRef, useState } from 'react';
import { KeyRound, Bot, CalendarDays, Video, School, Database, Check, ExternalLink, Download, Upload, RefreshCw, PlugZap } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Field, Spinner } from '../components/ui.jsx';
import { GEMINI_MODELS, testKey } from '../lib/gemini.js';
import { connectGoogle, isGoogleConnected } from '../lib/google.js';
import { download } from '../lib/csv.js';
import { buildSeed } from '../lib/seed.js';

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
  const { db, update, toast, reset } = useStore();
  const [s, setS] = useState(db.settings);
  const [testing, setTesting] = useState(false);
  const [gConn, setGConn] = useState(isGoogleConnected());
  const fileRef = useRef();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const dirty = JSON.stringify(s) !== JSON.stringify(db.settings);

  function save() { update((db) => { db.settings = { ...s }; }); toast('Settings saved'); }

  async function test() {
    setTesting(true);
    try { await testKey(s); toast('Gemini is connected ✓'); update((db) => { db.settings = { ...s }; }); }
    catch (e) { toast(e.message, 'error'); } finally { setTesting(false); }
  }

  async function google() {
    try { await connectGoogle(s.googleClientId); setGConn(true); update((db) => { db.settings = { ...s }; }); toast('Google account connected'); }
    catch (e) { toast(e.message, 'error'); }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Connect your AI and Google accounts. Keys stay in this browser and only go to Google’s APIs.</p>
        </div>
        <div className="page-actions"><button className="btn btn-primary" disabled={!dirty} onClick={save}><Check /> Save changes</button></div>
      </div>

      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack" style={{ gap: 18 }}>
          <Section icon={School} title="Profile" desc="Used in emails, printed exams and reports.">
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label="Your name"><input className="input" value={s.teacherName} onChange={set('teacherName')} /></Field>
              <Field label="School"><input className="input" value={s.school} onChange={set('school')} /></Field>
            </div>
          </Section>

          <Section icon={Bot} title="Google Gemini" desc="Powers quiz and exam generation, auto-correction and email drafting.">
            <Field label="API key" help={<>Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio <ExternalLink size={11} /></a>. Without a key, ClassPilot runs in demo mode.</>}>
              <div className="row">
                <input className="input mono" type="password" id="gemini-key" placeholder="AIza…" value={s.geminiKey} onChange={set('geminiKey')} autoComplete="off" />
                <button className="btn" onClick={test} disabled={!s.geminiKey || testing}>{testing ? <Spinner /> : <PlugZap />} Test</button>
              </div>
            </Field>
            <Field label="Model">
              <select className="select" value={s.geminiModel} onChange={set('geminiModel')}>{GEMINI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            </Field>
          </Section>

          <Section icon={School} title="Classera" desc="Roster import and marks export use Classera’s CSV/Excel import and export.">
            <Field label="Your Classera URL"><input className="input" value={s.classeraUrl} onChange={set('classeraUrl')} /></Field>
            <div className="inset small muted">Classera doesn’t offer a public API. If your school can get partner API credentials, ClassPilot can push marks and assignments directly. The sync code is isolated so this can be added later.</div>
          </Section>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <Section icon={CalendarDays} title="Google Workspace" desc="Google Calendar + Meet for online classes, Gmail for sending emails.">
            <Field label="OAuth Client ID" help="Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application). Add this site’s address as an authorized JavaScript origin, and enable the Calendar and Gmail APIs.">
              <input className="input mono small" placeholder="1234-abc.apps.googleusercontent.com" value={s.googleClientId} onChange={set('googleClientId')} />
            </Field>
            <div className="row">
              <button className="btn" onClick={google} disabled={!s.googleClientId}><KeyRound /> {gConn ? 'Reconnect Google' : 'Connect Google account'}</button>
              {gConn ? <span className="badge b-green"><Check /> Connected</span> : <span className="badge">Not connected</span>}
            </div>
          </Section>

          <Section icon={Video} title="Online classes" desc="Defaults for new classes in Schedule.">
            <div className="grid cols-2" style={{ gap: 12 }}>
              <Field label="Default platform">
                <select className="select" value={s.defaultPlatform} onChange={set('defaultPlatform')}><option value="meet">Google Meet</option><option value="zoom">Zoom</option></select>
              </Field>
              <Field label="Your Zoom meeting link" help="Personal Meeting Room link"><input className="input" value={s.zoomLink} onChange={set('zoomLink')} /></Field>
            </div>
          </Section>

          <Section icon={Database} title="Data" desc="Everything is stored in this browser. Back it up or move it to another computer.">
            <div className="row wrap">
              <button className="btn btn-sm" onClick={() => download(`classpilot_backup_${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ ...db, settings: { ...db.settings, geminiKey: '' } }, null, 2), 'application/json')}><Download /> Back up</button>
              <button className="btn btn-sm" onClick={() => fileRef.current.click()}><Upload /> Restore</button>
              <input ref={fileRef} type="file" accept=".json" hidden onChange={async (e) => {
                const f = e.target.files[0]; if (!f) return;
                try { const data = JSON.parse(await f.text()); if (!data.students || !data.assessments) throw new Error(); update((db) => { Object.assign(db, data, { settings: { ...data.settings, geminiKey: db.settings.geminiKey } }); }); toast('Backup restored'); }
                catch { toast('That file isn’t a ClassPilot backup', 'error'); }
              }} />
              <button className="btn btn-sm btn-danger" onClick={() => { if (confirm('Reset everything to the demo data?')) { reset(); setS(buildSeed().settings); toast('Demo data restored'); } }}><RefreshCw /> Reset demo data</button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
