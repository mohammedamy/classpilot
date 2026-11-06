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
import { t, useLang } from '../i18n/index.js';

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
      .map((a) => `${a.title} (${relDays(a.dueDate).toLowerCase()})`).join('; ') || t('nothing due');
    const vars = {
      studentName: s.name.split(' ')[0], studentFullName: s.name, parentName: s.parentName, className: classMap[s.classId]?.name,
      average: st.average == null ? t('not graded yet') : `${st.average}%`, missing: st.missing.length ? st.missing.join(', ') : t('none'),
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
  useLang();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('compose');
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Messages')}</h1>
          <p className="sub">{t('Send personalized emails to students and parents from your Gmail. Each family gets their own child’s average, missing work and what’s coming up.')}</p>
        </div>
        <div className="seg">
          <button className={tab === 'compose' ? 'on' : ''} onClick={() => setTab('compose')}><Mail /> {t('Compose')}</button>
          <button className={tab === 'auto' ? 'on' : ''} onClick={() => setTab('auto')}><Zap /> {t('Automations')}</button>
          <button className={tab === 'sent' ? 'on' : ''} onClick={() => setTab('sent')}><History /> {t('Sent')}</button>
        </div>
      </div>
      {tab === 'compose' && <Compose params={params} />}
      {tab === 'auto' && <Automations />}
      {tab === 'sent' && <Sent />}
    </>
  );
}

function Compose({ params }) {
  const lang = useLang();
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
      setSubject(missing ? t('Reminder: {title} is still missing', { title: a.title }) : t('New in {cls}: {title}', { cls: '{{className}}', title: a.title }));
      const intro = missing
        ? t("I haven't received your {title} yet. Please complete it as soon as possible", { title: a.title })
        : t('Your {title} is now available', { title: a.title });
      setBody(t("Hi {student},\n\n{intro}. It's due {due}.\n\nOpen it here: {link}\n\nGood luck!\n{teacher}", {
        student: '{{studentName}}',
        intro,
        due: fmtDateTime(a.dueDate),
        link: '{{link}}',
        teacher: '{{teacherName}}',
      }));
    } else {
      const tpl = db.templates.find((x) => x.id === (preTemplate || 't_progress'));
      if (tpl) { setSubject(tpl.subject); setBody(tpl.body); }
    }
  }, []); // eslint-disable-line

  const msgs = useMemo(() => buildMessages(store, { audience, classIds, onlyMissing, assessmentId: a?.id, subject, body }), [store, audience, classIds, onlyMissing, a, subject, body, lang]);
  const preview = msgs[0];

  async function aiDraft() {
    if (!aiPrompt.trim()) return;
    setBusy(true);
    try {
      const r = await draftEmail(db.settings, { purpose: aiPrompt, audience, className: classIds.length === 1 ? classMap[classIds[0]]?.name : '', teacherName: db.settings.teacherName });
      setSubject(r.subject); setBody(r.body);
      toast(hasKey(db.settings) ? t('Draft written by Gemini') : t('Draft created (demo mode)'));
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  }

  async function send() {
    if (!msgs.length) return;
    if (!db.settings.googleClientId) {
      toast(t('Connect Gmail in Settings to send. You can download the merge file for now.'), 'error');
      return;
    }
    setSending({ done: 0, total: msgs.length });
    try {
      const r = await sendBulk(db.settings.googleClientId, msgs, (done, total) => setSending({ done, total }));
      update((db) => { db.messages.unshift({ id: uid('m'), subject: subject.replace(/\{\{.*?\}\}/g, '…'), audience, classIds, recipients: r.sent, sentAt: new Date().toISOString(), via: 'Gmail' }); });
      if (r.failed) {
        toast(r.sent === 1
          ? t('Sent {sent} email, {failed} failed', { sent: r.sent, failed: r.failed })
          : t('Sent {sent} emails, {failed} failed', { sent: r.sent, failed: r.failed }), 'error');
      } else {
        toast(r.sent === 1 ? t('Sent 1 email') : t('Sent {n} emails', { n: r.sent }), 'ok');
      }
    } catch (e) { toast(e.message, 'error'); } finally { setSending(null); }
  }

  function exportMerge() {
    download('classpilot_mail_merge.csv', toCSV(msgs.map((m) => ({ To: m.to, Subject: m.subject, Body: m.body }))));
    toast(t('Mail-merge file downloaded'));
  }

  const toggle = (id) => setClassIds(classIds.includes(id) ? classIds.filter((x) => x !== id) : [...classIds, id]);
  const fields = ['studentName', 'parentName', 'className', 'average', 'missing', 'upcoming', 'teacherName', ...(a ? ['link'] : [])];

  return (
    <div className="split">
      <section className="card card-pad stack" style={{ gap: 16 }}>
        <div className="ai-box stack-sm">
          <div className="row"><Sparkles size={16} color="var(--brand)" /><span className="strong small">{t('Draft with AI')}</span></div>
          <div className="row">
            <input className="input" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aiDraft()} placeholder={t('e.g. Remind parents about Thursday’s science fair and ask them to sign the permission slip')} />
            <button className="btn btn-primary" onClick={aiDraft} disabled={busy}>{busy ? <Spinner /> : <Sparkles />} {t('Draft')}</button>
          </div>
        </div>

        <div className="grid cols-2" style={{ gap: 12 }}>
          <Field label={t('Send to')}>
            <div className="seg">
              {[['parents', 'Parents'], ['students', 'Students'], ['both', 'Both']].map(([k, v]) => <button key={k} className={audience === k ? 'on' : ''} onClick={() => setAudience(k)}>{t(v)}</button>)}
            </div>
          </Field>
          <Field label={t('Template')}>
            <select className="select" defaultValue="" onChange={(e) => { const tpl = db.templates.find((x) => x.id === e.target.value); if (tpl) { setSubject(tpl.subject); setBody(tpl.body); setAudience(tpl.audience); } }}>
              <option value="" disabled>{t('Load a template…')}</option>
              {db.templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{t(tpl.name)}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('Classes')}>
          <div className="row wrap" style={{ gap: 6 }}>
            {db.classes.map((c) => <button key={c.id} className={`chip ${classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}
            <label className="checkbox small" style={{ marginInlineStart: 8 }}><input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} /> {a ? t('Only students with missing work on “{title}”', { title: a.title }) : t('Only students with missing work')}</label>
          </div>
        </Field>
        <Field label={t('Subject')}><input className="input" id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label={t('Message')}>
          <textarea className="textarea" id="msg-body" rows={11} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="row wrap" style={{ gap: 5, marginTop: -8 }}>
          <span className="tiny muted">{t('Insert:')}</span>
          {fields.map((f) => <button key={f} className="chip tiny" style={{ padding: '2px 8px' }} onClick={() => setBody((b) => `${b}{{${f}}}`)}>{`{{${f}}}`}</button>)}
        </div>
        <div className="row-between wrap" style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 14, gap: 10 }}>
          <span className="small muted"><Users size={14} style={{ verticalAlign: -2 }} /> {msgs.length === 1 ? t('1 personalized email') : t('{n} personalized emails', { n: msgs.length })}</span>
          <div className="page-actions">
            <button className="btn btn-sm" onClick={exportMerge} disabled={!msgs.length}><Download /> {t('Merge file')}</button>
            <button className="btn btn-sm" onClick={() => setSchedule(true)}><Clock /> {t('Make it weekly')}</button>
            <button className="btn btn-primary btn-sm" id="send-email" onClick={send} disabled={!msgs.length || sending}>{sending ? <><Spinner /> {sending.done}/{sending.total}</> : <><Send className="flip-rtl" /> {t('Send via Gmail')}</>}</button>
          </div>
        </div>
      </section>

      <section className="stack">
        <div className="card">
          <div className="card-head"><h2>{t('Preview')}</h2><span className="hint">{preview ? t('To: {to}', { to: preview.to }) : t('No recipients')}</span></div>
          {preview ? (
            <div className="card-body">
              <div className="strong" style={{ marginBottom: 10 }}>{preview.subject}</div>
              <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, color: 'var(--ink-800)' }}>{preview.body}</div>
            </div>
          ) : <Empty icon={Mail} title={t('No matching recipients')}>{t('Change classes or filters.')}</Empty>}
        </div>
        <div className={`banner ${isGoogleConnected() ? 'ok' : 'info'} small`}><Info /><span>{db.settings.googleClientId ? (isGoogleConnected() ? t('Gmail connected. Emails go out from your account.') : t('You’ll be asked to sign in to Google the first time you send.')) : <>{t('Gmail isn’t set up yet. Add a Google Client ID in Settings, or use the')} <b>{t('Merge file')}</b> {t('with Gmail/Outlook mail merge.')}</>}</span></div>
      </section>
      {schedule && <AutomationModal initial={{ name: subject.replace(/\{\{.*?\}\}/g, '').slice(0, 40) || t('Weekly email'), audience, classIds, subject, body }} onClose={() => setSchedule(false)} />}
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
  useLang();
  const store = useStore();
  const { db, update, toast, classMap } = store;
  const [edit, setEdit] = useState(null);
  const [running, setRunning] = useState(null);

  async function runNow(au) {
    const tpl = db.templates.find((x) => x.id === au.templateId) || au;
    const msgs = buildMessages(store, { audience: au.audience, classIds: au.classIds, onlyMissing: au.onlyMissing, subject: au.subject || tpl.subject, body: au.body || tpl.body });
    setRunning(au.id);
    try {
      let sent = msgs.length, via = 'Gmail';
      if (db.settings.googleClientId) sent = (await sendBulk(db.settings.googleClientId, msgs)).sent;
      else { download(`${au.name.replace(/\W+/g, '_')}_merge.csv`, toCSV(msgs.map((m) => ({ To: m.to, Subject: m.subject, Body: m.body })))); via = 'Merge file'; }
      update((db) => {
        const x = db.automations.find((y) => y.id === au.id); x.lastRun = new Date().toISOString();
        db.messages.unshift({ id: uid('m'), subject: au.name, audience: au.audience, classIds: au.classIds, recipients: sent, sentAt: new Date().toISOString(), via, automation: au.name });
      });
      toast(via === 'Gmail' ? t('{name}: sent {n} emails', { name: t(au.name), n: sent }) : t('{name}: merge file downloaded (connect Gmail to send automatically)', { name: t(au.name) }));
    } catch (e) { toast(e.message, 'error'); } finally { setRunning(null); }
  }

  return (
    <div className="stack">
      <div className="banner info small"><Info /><span>{t('Automations run on schedule while ClassPilot is open, and anything that comes due shows up here so you can send it with one click. To send even when your computer is off, deploy the small backend described in the README.')}</span></div>
      <div className="card">
        <div className="card-head"><h2>{t('Scheduled emails')}</h2><button className="btn btn-sm btn-primary" onClick={() => setEdit({})}><Plus /> {t('New automation')}</button></div>
        <div className="list">
          {db.automations.length === 0 && <Empty icon={Zap} title={t('No automations yet')} />}
          {db.automations.map((au) => {
            const due = isDue(au);
            return (
              <div key={au.id} className="list-row">
                <div className="icon-tile" style={{ background: au.enabled ? 'var(--amber-100)' : 'var(--ink-100)', color: au.enabled ? 'var(--amber-700)' : 'var(--ink-500)' }}><Zap /></div>
                <div className="grow">
                  <div className="row" style={{ gap: 8 }}><span className="strong">{t(au.name)}</span>{due && <span className="badge b-red">{t('Due now')}</span>}</div>
                  <div className="small muted">{t('Every {day} at {time} · to {audience}', { day: t(DAYS[au.day]), time: au.time, audience: t(au.audience) })} · {au.classIds.map((c) => classMap[c]?.name).join(', ')}</div>
                  <div className="tiny muted">{au.enabled ? t('Next: {when}', { when: `${fmtDate(nextRun(au), { weekday: 'short', month: 'short', day: 'numeric' })} ${fmtTime(nextRun(au))}` }) : t('Paused')} · {t('Last run: {when}', { when: au.lastRun ? fmtDateTime(au.lastRun) : t('never') })}</div>
                </div>
                <label className="checkbox small"><input type="checkbox" checked={au.enabled} onChange={() => update((db) => { const x = db.automations.find((y) => y.id === au.id); x.enabled = !x.enabled; })} /> {t('On')}</label>
                <button className={`btn btn-sm ${due ? 'btn-primary' : ''}`} onClick={() => runNow(au)} disabled={running === au.id}>{running === au.id ? <Spinner /> : <Play className="flip-rtl" />} {t('Run now')}</button>
                <button className="btn btn-sm" onClick={() => setEdit(au)}>{t('Edit')}</button>
                <button className="btn btn-sm btn-ghost btn-icon btn-danger" onClick={() => update((db) => { db.automations = db.automations.filter((y) => y.id !== au.id); })} aria-label={t('Delete')}><Trash2 /></button>
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
  useLang();
  const { db, update, toast } = useStore();
  const t0 = db.templates.find((tpl) => tpl.id === (initial.templateId || 't_progress'));
  const [f, setF] = useState({ name: t('Weekly progress report'), audience: 'parents', classIds: db.classes.map((c) => c.id), day: 4, time: '16:00', enabled: true, onlyMissing: false, templateId: initial.subject ? '' : t0?.id, subject: initial.subject || '', body: initial.body || '', ...initial });
  const toggle = (id) => setF({ ...f, classIds: f.classIds.includes(id) ? f.classIds.filter((x) => x !== id) : [...f.classIds, id] });
  function save() {
    update((db) => {
      const i = db.automations.findIndex((x) => x.id === f.id);
      const rec = { ...f, id: f.id || uid('au'), lastRun: f.lastRun || null };
      if (i >= 0) db.automations[i] = rec; else db.automations.push(rec);
    });
    toast(t('Automation saved'));
    onClose();
  }
  return (
    <Modal title={f.id ? t('Edit automation') : t('New automation')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary" onClick={save}>{t('Save')}</button></>}>
      <Field label={t('Name')}><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <div className="grid cols-3" style={{ gap: 12 }}>
        <Field label={t('Every')}><select className="select" value={f.day} onChange={(e) => setF({ ...f, day: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</select></Field>
        <Field label={t('At')}><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
        <Field label={t('To')}><select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="parents">{t('Parents')}</option><option value="students">{t('Students')}</option><option value="both">{t('Both')}</option></select></Field>
      </div>
      <Field label={t('Classes')}><div className="row wrap" style={{ gap: 6 }}>{db.classes.map((c) => <button key={c.id} className={`chip ${f.classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}</div></Field>
      {!initial.subject && (
        <Field label={t('Template')}><select className="select" value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })}>{db.templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{t(tpl.name)}</option>)}</select></Field>
      )}
      {initial.subject && <div className="inset small"><b>{f.subject}</b><div className="muted" style={{ whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>{f.body}</div></div>}
      <label className="checkbox small"><input type="checkbox" checked={f.onlyMissing} onChange={(e) => setF({ ...f, onlyMissing: e.target.checked })} /> {t('Only send for students with missing work')}</label>
    </Modal>
  );
}

function Sent() {
  useLang();
  const { db, classMap } = useStore();
  return (
    <div className="card table-wrap">
      {db.messages.length === 0 ? <Empty icon={Send} title={t('Nothing sent yet')} /> : (
        <table className="table">
          <thead><tr><th>{t('Subject')}</th><th>{t('Audience')}</th><th>{t('Classes')}</th><th className="num">{t('Recipients')}</th><th>{t('Sent')}</th></tr></thead>
          <tbody>
            {db.messages.map((m) => (
              <tr key={m.id}>
                <td><div className="strong small">{m.subject}</div>{m.automation && <div className="tiny muted"><Zap size={11} style={{ verticalAlign: -1 }} /> {t(m.automation)}</div>}</td>
                <td><span className="badge">{t(m.audience)}</span></td>
                <td className="small">{m.classIds.map((c) => classMap[c]?.name).join(', ')}</td>
                <td className="num small strong">{m.recipients}</td>
                <td className="small muted">{fmtDateTime(m.sentAt)} · {t(m.via)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
