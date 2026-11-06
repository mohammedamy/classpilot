import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Send, Sparkles, Mail, Zap, Plus, Play, Trash2, Clock, Users, Info, Download, History } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Modal, Spinner, Empty, Field } from '../components/ui.jsx';
import { draftEmail, hasKey } from '../lib/gemini.js';
import { isGoogleConnected, sendBulk } from '../lib/google.js';
import { fillTemplate, fmtDate, fmtDateTime, relDays, uid, DAY, startOfWeek, fmtTime } from '../lib/utils.js';
import { toCSV, download } from '../lib/csv.js';
import { shareLink } from './Studio.jsx';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Build one personalised email per recipient. */
export function buildMessages(store, { audience, classIds, onlyMissing, assessmentId, subject, body }) {
  const { db, classMap, studentStats } = store;
  const now = Date.now();
  const out = [];
  for (const s of db.students.filter((x) => classIds.includes(x.classId))) {
    const st = studentStats(s.id);
    if (onlyMissing) {
      if (assessmentId) {
        const sub = db.submissions.find((x) => x.assessmentId === assessmentId && x.studentId === s.id);
        if (!sub || sub.status !== 'missing') continue;
      } else if (!st.missing.length) continue;
    }
    const upcoming = db.assessments
      .filter((a) => a.status === 'published' && a.classIds.includes(s.classId) && new Date(a.dueDate) > now)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)).slice(0, 2)
      .map((a) => `${a.title} (${relDays(a.dueDate).toLowerCase()})`).join('; ') || 'nothing due';
    const vars = {
      studentName: s.name.split(' ')[0], studentFullName: s.name, parentName: s.parentName, className: classMap[s.classId]?.name,
      average: st.average == null ? 'not graded yet' : `${st.average}%`, missing: st.missing.length ? st.missing.join(', ') : 'none',
      upcoming, teacherName: db.settings.teacherName, link: assessmentId ? shareLink(assessmentId) : '',
    };
    const targets = [];
    if (audience !== 'parents') targets.push(s.email);
    if (audience !== 'students' && s.parentEmail) targets.push(s.parentEmail);
    for (const to of targets) out.push({ to, studentId: s.id, subject: fillTemplate(subject, vars), body: fillTemplate(body, vars) });
  }
  return out;
}

export default function Messages() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState('compose');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p className="sub">Send personalized emails to students and parents from your Gmail. Each family gets their own child’s average, missing work and what’s coming up.</p>
        </div>
        <div className="seg">
          <button className={tab === 'compose' ? 'on' : ''} onClick={() => setTab('compose')}><Mail /> Compose</button>
          <button className={tab === 'auto' ? 'on' : ''} onClick={() => setTab('auto')}><Zap /> Automations</button>
          <button className={tab === 'sent' ? 'on' : ''} onClick={() => setTab('sent')}><History /> Sent</button>
        </div>
      </div>
      {tab === 'compose' && <Compose params={params} />}
      {tab === 'auto' && <Automations />}
      {tab === 'sent' && <Sent />}
    </>
  );
}

function Compose({ params }) {
  const store = useStore();
  const { db, update, toast, classMap } = store;
  const preAssess = params.get('assessment');
  const preTemplate = params.get('template');
  const a = preAssess ? db.assessments.find((x) => x.id === preAssess) : null;

  const [audience, setAudience] = useState(preTemplate === 't_missing' ? 'parents' : a ? 'students' : 'parents');
  const [classIds, setClassIds] = useState(a ? a.classIds : db.classes.map((c) => c.id));
  const [onlyMissing, setOnlyMissing] = useState(preTemplate === 't_missing' || params.get('missing') === '1');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(null);
  const [schedule, setSchedule] = useState(false);

  useEffect(() => {
    const pre = params.get('prefill') && JSON.parse(sessionStorage.getItem('cp:prefill') || 'null');
    if (pre) {
      setSubject(pre.subject); setBody(pre.body); setClassIds(pre.classIds); setAudience(pre.audience); setOnlyMissing(false);
    } else if (a) {
      const missing = params.get('missing') === '1';
      setSubject(missing ? `Reminder: ${a.title} is still missing` : `New in {{className}}: ${a.title}`);
      setBody(`Hi {{studentName}},\n\n${missing ? `I haven't received your ${a.title} yet. Please complete it as soon as possible` : `Your ${a.title} is now available`}. It's due ${fmtDateTime(a.dueDate)}.\n\nOpen it here: {{link}}\n\nGood luck!\n{{teacherName}}`);
    } else {
      const t = db.templates.find((x) => x.id === (preTemplate || 't_progress'));
      if (t) { setSubject(t.subject); setBody(t.body); }
    }
  }, []); // eslint-disable-line

  const msgs = useMemo(() => buildMessages(store, { audience, classIds, onlyMissing, assessmentId: a?.id, subject, body }), [store, audience, classIds, onlyMissing, a, subject, body]);
  const preview = msgs[0];

  async function aiDraft() {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    try {
      const r = await draftEmail(db.settings, { purpose: aiPrompt, audience, className: classIds.length === 1 ? classMap[classIds[0]]?.name : '', teacherName: db.settings.teacherName });
      setSubject(r.subject); setBody(r.body);
      toast(hasKey(db.settings) ? 'Draft written by Gemini' : 'Draft created (demo mode)');
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function send() {
    if (!msgs.length) return;
    if (!db.settings.googleClientId) {
      toast('Connect Gmail in Settings to send. You can download the merge file for now.', 'error');
      return;
    }
    setSending({ done: 0, total: msgs.length });
    try {
      const r = await sendBulk(db.settings.googleClientId, msgs, (done, total) => setSending({ done, total }));
      update((db) => { db.messages.unshift({ id: uid('m'), subject: subject.replace(/\{\{.*?\}\}/g, '…'), audience, classIds, recipients: r.sent, sentAt: new Date().toISOString(), via: 'Gmail' }); });
      toast(`Sent ${r.sent} email${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}`, r.failed ? 'error' : 'ok');
    } catch (e) { toast(e.message, 'error'); } finally { setSending(null); }
  }

  function exportMerge() {
    download('classpilot_mail_merge.csv', toCSV(msgs.map((m) => ({ To: m.to, Subject: m.subject, Body: m.body }))));
    toast('Mail-merge file downloaded');
  }

  const toggle = (id) => setClassIds(classIds.includes(id) ? classIds.filter((x) => x !== id) : [...classIds, id]);
  const fields = ['studentName', 'parentName', 'className', 'average', 'missing', 'upcoming', 'teacherName', ...(a ? ['link'] : [])];

  return (
    <div className="split">
      <section className="card card-pad stack" style={{ gap: 16 }}>
        <div className="ai-box stack-sm">
          <div className="row"><Sparkles size={16} color="var(--brand)" /><span className="strong small">Draft with AI</span></div>
          <div className="row">
            <input className="input" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aiDraft()} placeholder="e.g. Remind parents about Thursday’s science fair and ask them to sign the permission slip" />
            <button className="btn btn-primary" onClick={aiDraft} disabled={busy}>{busy ? <Spinner /> : <Sparkles />} Draft</button>
          </div>
        </div>

        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label="Send to">
            <div className="seg">
              {[['parents', 'Parents'], ['students', 'Students'], ['both', 'Both']].map(([k, v]) => <button key={k} className={audience === k ? 'on' : ''} onClick={() => setAudience(k)}>{v}</button>)}
            </div>
          </Field>
          <Field label="Template">
            <select className="select" defaultValue="" onChange={(e) => { const t = db.templates.find((x) => x.id === e.target.value); if (t) { setSubject(t.subject); setBody(t.body); setAudience(t.audience); } }}>
              <option value="" disabled>Load a template…</option>
              {db.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Classes">
          <div className="row wrap" style={{ gap: 6 }}>
            {db.classes.map((c) => <button key={c.id} className={`chip ${classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}
            <label className="checkbox small" style={{ marginLeft: 8 }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> Only students with missing work{a ? ` on “${a.title}”` : ''}</label>
          </div>
        </Field>
        <Field label="Subject"><input className="input" id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message">
          <textarea className="textarea" id="msg-body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="row wrap" style={{ gap: 5, marginTop: -8 }}>
          <span className="tiny muted">Insert:</span>
          {fields.map((f) => <button key={f} className="chip tiny" style={{ padding: '2px 8px' }} onClick={() => setBody((b) => `${b}{{${f}}}`)}>{`{{${f}}}`}</button>)}
        </div>
        <div className="row-between wrap" style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14, gap: 10 }}>
          <span className="small muted"><Users size={14} style={{ verticalAlign: -2 }} /> {msgs.length} personalized email{msgs.length === 1 ? '' : 's'}</span>
          <div className="page-actions">
            <button className="btn btn-sm" onClick={exportMerge} disabled={!msgs.length}><Download /> Merge file</button>
            <button className="btn btn-sm" onClick={() => setSchedule(true)}><Clock /> Make it weekly</button>
            <button className="btn btn-primary btn-sm" id="send-email" onClick={send} disabled={!msgs.length || sending}>{sending ? <><Spinner /> {sending.done}/{sending.total}</> : <><Send /> Send via Gmail</>}</button>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="card">
          <div className="card-head"><h2>Preview</h2><span className="hint">{preview ? `To: ${preview.to}` : 'No recipients'}</span></div>
          {preview ? (
            <div className="card-body">
              <div className="strong" style={{ marginBottom: 10 }}>{preview.subject}</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--ink-800)' }}>{preview.body}</div>
            </div>
          ) : <Empty icon={Mail} title="No matching recipients">Change classes or filters.</Empty>}
        </div>
        <div className={`banner ${isGoogleConnected() ? 'ok' : 'info'} small`}><Info /><span>{db.settings.googleClientId ? (isGoogleConnected() ? 'Gmail connected. Emails go out from your account.' : 'You’ll be asked to sign in to Google the first time you send.') : <>Gmail isn’t set up yet. Add a Google Client ID in Settings, or use the <b>Merge file</b> with Gmail/Outlook mail merge.</>}</span></div>
      </section>
      {schedule && <AutomationModal initial={{ name: subject.replace(/\{\{.*?\}\}/g, '').slice(0, 40) || 'Weekly email', audience, classIds, subject, body }} onClose={() => setSchedule(false)} />}
    </div>
  );
}

function nextRun(a) {
  const now = Date.now();
  const [h, m] = a.time.split(':').map(Number);
  let d = new Date(startOfWeek(now) + a.day * DAY); d.setHours(h, m, 0, 0);
  if (d.getTime() < now) d = new Date(d.getTime() + 7 * DAY);
  return d;
}
function isDue(a) {
  if (!a.enabled) return false;
  const prev = new Date(nextRun(a).getTime() - 7 * DAY);
  return !a.lastRun || new Date(a.lastRun) < prev;
}

function Automations() {
  const store = useStore();
  const { db, update, toast, classMap } = store;
  const [edit, setEdit] = useState(null);
  const [running, setRunning] = useState(null);

  async function runNow(au) {
    const t = db.templates.find((x) => x.id === au.templateId) || au;
    const msgs = buildMessages(store, { audience: au.audience, classIds: au.classIds, onlyMissing: au.onlyMissing, subject: au.subject || t.subject, body: au.body || t.body });
    setRunning(au.id);
    try {
      let sent = msgs.length, via = 'Gmail';
      if (db.settings.googleClientId) sent = (await sendBulk(db.settings.googleClientId, msgs)).sent;
      else { download(`${au.name.replace(/\W+/g, '_')}_merge.csv`, toCSV(msgs.map((m) => ({ To: m.to, Subject: m.subject, Body: m.body })))); via = 'Merge file'; }
      update((db) => {
        const x = db.automations.find((y) => y.id === au.id); x.lastRun = new Date().toISOString();
        db.messages.unshift({ id: uid('m'), subject: au.name, audience: au.audience, classIds: au.classIds, recipients: sent, sentAt: new Date().toISOString(), via, automation: au.name });
      });
      toast(via === 'Gmail' ? `${au.name}: sent ${sent} emails` : `${au.name}: merge file downloaded (connect Gmail to send automatically)`);
    } catch (e) { toast(e.message, 'error'); } finally { setRunning(null); }
  }

  return (
    <div className="stack">
      <div className="banner info small"><Info /><span>Automations run on schedule while ClassPilot is open, and anything that comes due shows up here so you can send it with one click. To send even when your computer is off, deploy the small backend described in the README.</span></div>
      <div className="card">
        <div className="card-head"><h2>Scheduled emails</h2><button className="btn btn-sm btn-primary" onClick={() => setEdit({})}><Plus /> New automation</button></div>
        <div className="list">
          {db.automations.length === 0 && <Empty icon={Zap} title="No automations yet" />}
          {db.automations.map((au) => {
            const due = isDue(au);
            return (
              <div key={au.id} className="list-row">
                <div className="icon-tile" style={{ background: au.enabled ? 'var(--amber-100)' : 'var(--ink-100)', color: au.enabled ? 'var(--amber-700)' : 'var(--ink-500)' }}><Zap /></div>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}><span className="strong">{au.name}</span>{due && <span className="badge b-red">Due now</span>}</div>
                  <div className="small muted">Every {DAYS[au.day]} at {au.time} · to {au.audience} · {au.classIds.map((c) => classMap[c]?.name).join(', ')}</div>
                  <div className="tiny muted">{au.enabled ? `Next: ${fmtDate(nextRun(au), { weekday: 'short', month: 'short', day: 'numeric' })} ${fmtTime(nextRun(au))}` : 'Paused'} · Last run: {au.lastRun ? fmtDateTime(au.lastRun) : 'never'}</div>
                </div>
                <label className="checkbox small"><input type="checkbox" checked={au.enabled} onChange={() => update((db) => { const x = db.automations.find((y) => y.id === au.id); x.enabled = !x.enabled; })} /> On</label>
                <button className={`btn btn-sm ${due ? 'btn-primary' : ''}`} onClick={() => runNow(au)} disabled={running === au.id}>{running === au.id ? <Spinner /> : <Play />} Run now</button>
                <button className="btn btn-sm" onClick={() => setEdit(au)}>Edit</button>
                <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => update((db) => { db.automations = db.automations.filter((y) => y.id !== au.id); })} aria-label="Delete"><Trash2 /></button>
              </div>
            );
          })}
        </div>
      </div>
      {edit && <AutomationModal initial={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AutomationModal({ initial, onClose }) {
  const { db, update, toast } = useStore();
  const t0 = db.templates.find((t) => t.id === (initial.templateId || 't_progress'));
  const [f, setF] = useState({ name: 'Weekly progress report', audience: 'parents', classIds: db.classes.map((c) => c.id), day: 4, time: '16:00', enabled: true, onlyMissing: false, templateId: initial.subject ? '' : t0?.id, subject: initial.subject || '', body: initial.body || '', ...initial });
  const toggle = (id) => setF({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id] });
  function save() {
    update((db) => {
      const i = db.automations.findIndex((x) => x.id === f.id);
      const rec = { ...f, id: f.id || uid('au'), lastRun: f.lastRun || null };
      if (i >= 0) db.automations[i] = rec; else db.automations.push(rec);
    });
    toast('Automation saved');
    onClose();
  }
  return (
    <Modal title={f.id ? 'Edit automation' : 'New automation'} onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid cols-3" style={{ gap: 12 }}>
        <Field label="Every"><select className="select" value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
        <Field label="At"><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label="To"><select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="parents">Parents</option><option value="students">Students</option><option value="both">Both</option></select></Field>
      </div>
      <Field label="Classes"><div className="row wrap" style={{ gap: 6 }}>{db.classes.map((c) => <button key={c.id} className={`chip ${f.classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}</div></Field>
      {!initial.subject && (
        <Field label="Template"><select className="select" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{db.templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      )}
      {initial.subject && <div className="inset small"><b>{f.subject}</b><div className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>{f.body}</div></div>}
      <label className="checkbox small"><input type="checkbox" checked={f.onlyMissing} onChange={(e) => setF({ ...f, onlyMissing: e.target.checked })} /> Only send for students with missing work</label>
    </Modal>
  );
}

function Sent() {
  const { db, classMap } = useStore();
  return (
    <div className="card table-wrap">
      {db.messages.length === 0 ? <Empty icon={Send} title="Nothing sent yet" /> : (
        <table className="table">
          <thead><tr><th>Subject</th><th>Audience</th><th>Classes</th><th className="num">Recipients</th><th>Sent</th></tr></thead>
          <tbody>
            {db.messages.map((m) => (
              <tr key={m.id}>
                <td><div className="strong small">{m.subject}</div>{m.automation && <div className="tiny muted"><Zap size={11} style={{ verticalAlign: -1 }} /> {m.automation}</div>}</td>
                <td><span className="badge">{m.audience}</span></td>
                <td className="small">{m.classIds.map((c) => classMap[c]?.name).join(', ')}</td>
                <td className="num small strong">{m.recipients}</td>
                <td className="small muted">{fmtDateTime(m.sentAt)} · {m.via}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
