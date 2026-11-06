import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Video, Copy, ExternalLink, Trash2, Repeat, Mail, CalendarDays, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/store.jsx';
import { Modal, Spinner, Field, ClassDot } from '../components/ui.jsx';
import { DAY, startOfWeek, startOfDay, fmtTime, fmtDate, toLocalInput, uid } from '../lib/utils.js';
import { createMeetEvent, calendarTemplateUrl, demoMeetLink, deleteCalendarEvent } from '../lib/google.js';
import { t, useLang } from '../i18n/index.js';

const START_H = 7, END_H = 19, SLOT = 52;

/** Expand sessions (incl. weekly recurring) into concrete occurrences in [from, to). */
export function occurrencesInRange(sessions, from, to) {
  const out = [];
  for (const s of sessions) {
    const base = new Date(s.start).getTime();
    const dur = s.durationMin * 60000;
    if (s.recurring === 'weekly') {
      let t = base;
      if (t < from) t += Math.ceil((from - t) / (7 * DAY)) * 7 * DAY;
      // DST-safe: re-apply the original wall-clock time
      for (; t < to; t += 7 * DAY) {
        const d = new Date(t); const b = new Date(base);
        d.setHours(b.getHours(), b.getMinutes(), 0, 0);
        if ((s.exceptions || []).includes(startOfDay(d))) continue;
        out.push({ key: `${s.id}@${d.getTime()}`, session: s, start: d.getTime(), end: d.getTime() + dur });
      }
    } else if (base >= from && base < to) {
      out.push({ key: s.id, session: s, start: base, end: base + dur });
    }
  }
  return out;
}

export default function Schedule() {
  const lang = useLang();
  const { db, classMap } = useStore();
  const [week, setWeek] = useState(startOfWeek(Date.now()));
  const [create, setCreate] = useState(null);
  const [open, setOpen] = useState(null);
  const [now, setNow] = useState(Date.now());
  const scroller = useRef();

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (scroller.current) scroller.current.scrollTop = SLOT * 1.5; }, []);

  const days = Array.from({ length: 7 }, (_, i) => week + i * DAY);
  const occ = useMemo(() => occurrencesInRange(db.sessions, week, week + 7 * DAY), [db.sessions, week]);
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const minutesFromStart = (ts) => { const d = new Date(ts); return (d.getHours() - START_H) * 60 + d.getMinutes(); };
  const totalThisWeek = occ.reduce((sum, o) => sum + o.session.durationMin, 0);
  const hoursThisWeek = Math.round(totalThisWeek / 60 * 10) / 10;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Schedule')}</h1>
          <p className="sub">{t('Create online classes with Google Meet or Zoom links, set them to repeat weekly, and invite your students.')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="new-class" onClick={() => { const d = new Date(Math.max(now, week)); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); setCreate({ start: d.getTime() }); }}><Plus /> {t('New online class')}</button>
        </div>
      </div>

      <div className="card">
        <div className="card-head wrap">
          <div className="row">
            <button className="btn btn-sm btn-icon" onClick={() => setWeek(week - 7 * DAY)} aria-label={t('Previous week')}><ChevronLeft className="flip-rtl" /></button>
            <button className="btn btn-sm" onClick={() => setWeek(startOfWeek(Date.now()))}>{t('This week')}</button>
            <button className="btn btn-sm btn-icon" onClick={() => setWeek(week + 7 * DAY)} aria-label={t('Next week')}><ChevronRight className="flip-rtl" /></button>
            <h2 style={{ marginInlineStart: 8 }}>{fmtDate(week, { month: 'long', day: 'numeric' })} – {fmtDate(week + 6 * DAY, { month: 'long', day: 'numeric', year: 'numeric' })}</h2>
          </div>
          <div className="row wrap small muted" style={{ gap: 12 }}>
            <span>{occ.length === 1 ? t('1 class · {hours} h', { hours: hoursThisWeek }) : t('{count} classes · {hours} h', { count: occ.length, hours: hoursThisWeek })}</span>
            {db.classes.map((c) => <span key={c.id} className="row" style={{ gap: 5 }}><ClassDot cls={c} />{c.name}</span>)}
          </div>
        </div>
        <div style={{ overflow: 'auto', maxHeight: '68vh' }} ref={scroller}>
          <div className="cal">
            <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 4, borderBottom: '1px solid var(--ink-100)' }} />
            {days.map((d) => (
              <div key={d} className={`cal-head ${startOfDay(now) === d ? 'today' : ''}`} style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 4 }}>
                <div className="dow">{fmtDate(d, { weekday: 'short' })}</div>
                <div className="dnum">{new Date(d).getDate()}</div>
              </div>
            ))}
            <div>
              {hours.map((h) => <div key={h} style={{ height: SLOT }} className="cal-time">{h === START_H ? '' : fmtTime(new Date(2020, 0, 1, h))}</div>)}
            </div>
            {days.map((d) => {
              const dayOcc = occ.filter((o) => startOfDay(o.start) === d);
              return (
                <div key={d} className="cal-col">
                  {hours.map((h) => <div key={h} className="cal-slot" onClick={() => setCreate({ start: d + h * 3600000 })} title={t('Create class here')} />)}
                  {startOfDay(now) === d && minutesFromStart(now) > 0 && minutesFromStart(now) < (END_H - START_H) * 60 && <div className="cal-now" style={{ top: minutesFromStart(now) / 60 * SLOT }} />}
                  {dayOcc.map((o) => {
                    const cls = classMap[o.session.classId];
                    const top = Math.max(0, minutesFromStart(o.start) / 60 * SLOT);
                    const h = Math.max(26, o.session.durationMin / 60 * SLOT - 3);
                    const past = o.end < now;
                    return (
                      <div key={o.key} className="cal-event" onClick={() => setOpen(o)}
                        style={{ top, height: h, background: `color-mix(in hsl, ${cls?.color || 'gray'} 14%, white)`, color: `color-mix(in hsl, ${cls?.color || 'gray'} 70%, black)`, opacity: past ? 0.6 : 1, boxShadow: `inset ${lang === 'ar' ? -3 : 3}px 0 0 ${cls?.color}` }}>
                        <div className="t truncate">{o.session.title}</div>
                        {h > 34 && <div className="s">{fmtTime(o.start)} · {o.session.platform === 'zoom' ? t('Zoom') : t('Meet')}{o.session.recurring === 'weekly' ? ' · ↻' : ''}</div>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {create && <CreateModal initial={create} onClose={() => setCreate(null)} />}
      {open && <EventModal occ={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function CreateModal({ initial, onClose }) {
  useLang();
  const { db, update, toast, classMap } = useStore();
  const [f, setF] = useState({ classId: db.classes[0].id, title: '', start: toLocalInput(initial.start), durationMin: 45, platform: db.settings.defaultPlatform || 'meet', recurring: 'weekly', invite: true, customLink: '' });
  const [busy, setBusy] = useState(false);
  const cls = classMap[f.classId];
  const title = f.title || t('{className} — Online class', { className: cls?.name });

  async function save() {
    setBusy(true);
    const start = new Date(f.start).toISOString();
    let link = f.customLink.trim(), eventId = null, note = '';
    try {
      if (!link && f.platform === 'meet') {
        if (db.settings.googleClientId) {
          const attendees = f.invite ? db.students.filter((s) => s.classId === f.classId).map((s) => s.email) : [];
          const ev = await createMeetEvent(db.settings.googleClientId, { title, description: t('Online class for {className}. Created with ClassPilot.', { className: cls?.name }), start, durationMin: Number(f.durationMin), attendees, weekly: f.recurring === 'weekly' });
          link = ev.link; eventId = ev.eventId;
          note = f.invite ? t(' · invites sent from Google Calendar') : '';
        } else {
          link = demoMeetLink();
          note = t(' (demo link: connect Google in Settings for real Meet links)');
        }
      }
      if (!link && f.platform === 'zoom') link = db.settings.zoomLink || 'https://zoom.us/';
      update((db) => { db.sessions.push({ id: uid('ses'), classId: f.classId, title, start, durationMin: Number(f.durationMin), platform: f.platform, link, recurring: f.recurring, calendarEventId: eventId }); });
      toast(t('Class scheduled{note}', { note }));
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally { setBusy(false); }
  }

  return (
    <Modal title={t('New online class')} onClose={onClose} footer={<>
      <a className="btn" href={calendarTemplateUrl({ title, description: t('Online class for {className}', { className: cls?.name }), start: new Date(f.start), durationMin: Number(f.durationMin), weekly: f.recurring === 'weekly' })} target="_blank" rel="noreferrer"><CalendarDays /> {t('Open in Google Calendar')}</a>
      <button className="btn btn-primary" id="create-class" onClick={save} disabled={busy}>{busy ? <Spinner /> : <Video />} {t('Create class')}</button>
    </>}>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label={t('Class')}><select className="select" value={f.classId} onChange={(e) => setF({ ...f, classId: e.target.value })}>{db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label={t('Title')}><input className="input" value={f.title} placeholder={t('{className} — Online class', { className: cls?.name })} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
        <Field label={t('Starts')}><input type="datetime-local" className="input" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label={t('Duration')}><select className="select" value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: e.target.value })}>{[30, 40, 45, 50, 60, 90].map((m) => <option key={m} value={m}>{t('{m} minutes', { m })}</option>)}</select></Field>
      </div>
      <Field label={t('Platform')}>
        <div className="seg">
          <button className={f.platform === 'meet' ? 'on' : ''} onClick={() => setF({ ...f, platform: 'meet' })}><Video /> {t('Google Meet')}</button>
          <button className={f.platform === 'zoom' ? 'on' : ''} onClick={() => setF({ ...f, platform: 'zoom' })}><Video /> {t('Zoom')}</button>
        </div>
      </Field>
      <Field label={t('Meeting link (optional)')} help={f.platform === 'meet' ? t('Leave empty to auto-create a Google Meet link through Google Calendar.') : t('Leave empty to use your Zoom room from Settings ({zoom}).', { zoom: db.settings.zoomLink || t('not set') })}>
        <input className="input" value={f.customLink} onChange={(e) => setF({ ...f, customLink: e.target.value })} placeholder={f.platform === 'meet' ? 'https://meet.google.com/…' : 'https://zoom.us/j/…'} />
      </Field>
      <div className="row wrap" style={{ gap: 18 }}>
        <label className="checkbox small"><input type="checkbox" checked={f.recurring === 'weekly'} onChange={(e) => setF({ ...f, recurring: e.target.checked ? 'weekly' : 'none' })} /> <Repeat size={14} /> {t('Repeat weekly')}</label>
        {f.platform === 'meet' && <label className="checkbox small"><input type="checkbox" checked={f.invite} onChange={(e) => setF({ ...f, invite: e.target.checked })} /> {t('Send calendar invites to students')}</label>}
      </div>
      {!db.settings.googleClientId && f.platform === 'meet' && <div className="banner info small"><Info /> {t('Demo mode: a sample Meet link will be created. Add your Google Client ID in Settings to generate real Meet links and calendar invites.')}</div>}
    </Modal>
  );
}

function EventModal({ occ, onClose }) {
  useLang();
  const { db, update, toast, classMap } = useStore();
  const nav = useNavigate();
  const s = occ.session;
  const cls = classMap[s.classId];

  function removeOne() {
    update((db) => { const x = db.sessions.find((y) => y.id === s.id); x.exceptions = [...(x.exceptions || []), startOfDay(occ.start)]; });
    toast(t('This occurrence was cancelled')); onClose();
  }
  async function removeAll() {
    if (s.calendarEventId && db.settings.googleClientId) { try { await deleteCalendarEvent(db.settings.googleClientId, s.calendarEventId); } catch { /* ignore */ } }
    update((db) => { db.sessions = db.sessions.filter((y) => y.id !== s.id); });
    toast(t('Class removed')); onClose();
  }
  return (
    <Modal title={s.title} onClose={onClose} footer={<>
      {s.recurring === 'weekly' && <button className="btn btn-danger" onClick={removeOne}>{t('Cancel this one')}</button>}
      <button className="btn btn-danger" onClick={removeAll}><Trash2 /> {s.recurring === 'weekly' ? t('Delete series') : t('Delete')}</button>
      <a className="btn btn-primary" href={s.link} target="_blank" rel="noreferrer"><ExternalLink /> {t('Join')}</a>
    </>}>
      <div className="row" style={{ gap: 8 }}><ClassDot cls={cls} /><span className="strong">{cls?.name}</span>{s.recurring === 'weekly' && <span className="badge"><Repeat /> {t('Weekly')}</span>}<span className={`badge ${s.platform === 'zoom' ? 'b-blue' : 'b-green'}`}>{s.platform === 'zoom' ? t('Zoom') : t('Google Meet')}</span></div>
      <div className="small muted">{fmtDate(occ.start, { weekday: 'long', month: 'long', day: 'numeric' })} · {fmtTime(occ.start)} – {fmtTime(occ.end)}</div>
      <div className="row"><input className="input mono small" readOnly value={s.link} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => { navigator.clipboard.writeText(s.link); toast(t('Link copied')); }}><Copy /> {t('Copy')}</button></div>
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => {
        sessionStorage.setItem('cp:prefill', JSON.stringify({
          subject: t('Online class: {title}', { title: s.title }),
          body: t('Hi {student},\n\nOur next online class is on {date} at {time}.\nJoin here: {link}\n\nSee you there,\n{teacher}', {
            student: '{{studentName}}',
            date: fmtDate(occ.start, { weekday: 'long', month: 'long', day: 'numeric' }),
            time: fmtTime(occ.start),
            link: s.link,
            teacher: '{{teacherName}}',
          }),
          classIds: [s.classId],
          audience: 'students',
        }));
        nav('/messages?prefill=1');
      }}><Mail /> {t('Email link to {className}', { className: cls?.name })}</button>
    </Modal>
  );
}
