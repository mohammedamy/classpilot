import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, CheckCheck, Video, ClipboardList, TriangleAlert, RefreshCw, Users, ArrowRight, Zap, Clock, Table } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, ClassDot, Progress, Empty } from '../components/ui.jsx';
import { DAY, fmtDate, fmtTime, relDays, startOfDay, startOfWeek, TYPE_META, pct } from '../lib/utils.js';
import { t, useLang } from '../i18n/index.js';
import { occurrencesInRange } from './Schedule.jsx';

function richHero(tpl, slots) {
  return tpl.split(/(\{\w+\})/g).map((part, i) => {
    const m = part.match(/^\{(\w+)\}$/);
    return m && m[1] in slots ? <b key={i} style={{ color: '#fff' }}>{slots[m[1]]}</b> : part;
  });
}

export default function Dashboard() {
  useLang();
  const { db, classMap, subsFor, rosterFor, studentStats } = useStore();
  const nav = useNavigate();
  const now = Date.now();
  const hour = new Date().getHours();
  const greetKey = hour < 12 ? 'Good morning, {name}' : hour < 17 ? 'Good afternoon, {name}' : 'Good evening, {name}';
  const nameParts = db.settings.teacherName.trim().split(/\s+/);
  const shortName = nameParts.length > 1 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : nameParts[0];

  const toGrade = db.submissions.filter((s) => s.status === 'submitted');
  const overdueMissing = db.submissions.filter((s) => s.status === 'missing' && new Date(db.assessments.find((a) => a.id === s.assessmentId)?.dueDate) < now);
  const unsynced = Object.keys(db.unsynced || {}).length;

  const todays = occurrencesInRange(db.sessions, startOfDay(now), startOfDay(now) + DAY).sort((a, b) => a.start - b.start);
  const upcoming = db.assessments
    .filter((a) => a.status === 'published' && new Date(a.dueDate) > now - 4 * DAY && new Date(a.dueDate) < now + 10 * DAY)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const graded = db.submissions.filter((s) => s.status === 'graded');
  const avg = graded.length ? Math.round(graded.reduce((sum, s) => {
    const a = db.assessments.find((x) => x.id === s.assessmentId);
    const max = a.questions.reduce((m, q) => m + q.points, 0);
    return sum + (s.total / max) * 100;
  }, 0) / graded.length) : 0;

  const attention = db.students
    .map((s) => ({ s, st: studentStats(s.id) }))
    .filter(({ st }) => st.missing.length >= 2 || (st.average != null && st.average < 60))
    .sort((a, b) => b.st.missing.length - a.st.missing.length || (a.st.average ?? 100) - (b.st.average ?? 100))
    .slice(0, 5);

  const nextAuto = db.automations.filter((a) => a.enabled).map((a) => {
    const [h, m] = a.time.split(':').map(Number);
    let d = new Date(startOfWeek(now) + a.day * DAY); d.setHours(h, m, 0, 0);
    if (d.getTime() < now) d = new Date(d.getTime() + 7 * DAY);
    return { ...a, next: d };
  });

  const stats = [
    { label: t('Waiting to be corrected'), value: toGrade.length, icon: CheckCheck, tone: ['var(--sky-100)', 'var(--sky-700)'], to: '/grading', sub: t('Open answers need AI review') },
    { label: t('Missing work'), value: overdueMissing.length, icon: TriangleAlert, tone: ['var(--coral-100)', 'var(--coral-700)'], to: '/assignments', sub: t('Past due, not submitted') },
    { label: t('Average score'), value: `${avg}%`, icon: Users, tone: ['var(--brand-100)', 'var(--brand-600)'], to: '/gradebook', sub: t('Across {n} graded submissions', { n: graded.length }) },
    { label: t('Marks to sync'), value: unsynced, icon: RefreshCw, tone: ['var(--amber-100)', 'var(--amber-700)'], to: '/gradebook', sub: t('Last Classera sync {when}', { when: relDays(db.lastClasseraSync).toLowerCase() }) },
  ];

  const classesSlot = todays.length === 1 ? t('1 online class') : t('{n} online classes', { n: todays.length });
  const subsSlot = toGrade.length === 1 ? t('1 submission') : t('{n} submissions', { n: toGrade.length });
  const marksSlot = unsynced === 1 ? t('1 mark') : t('{n} marks', { n: unsynced });

  return (
    <>
      <section className="hero" style={{ marginBottom: 20 }}>
        <div className="row-between wrap" style={{ alignItems: 'flex-end', gap: 20 }}>
          <div>
            <div className="small" style={{ color: 'hsl(163 52% 70%)', fontWeight: 600 }}>{fmtDate(now, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <h1 style={{ marginTop: 6 }}>{t(greetKey, { name: shortName })}</h1>
            <p className="sub" style={{ marginTop: 8, maxWidth: 560 }}>
              {richHero(t('You have {classes} today, {submissions} to correct and {marks} waiting to go to Classera.'), {
                classes: classesSlot,
                submissions: subsSlot,
                marks: marksSlot,
              })}
            </p>
          </div>
          <div className="page-actions">
            <button className="btn" id="hero-correct" onClick={() => nav('/grading')}><CheckCheck /> {t('Auto-correct')}</button>
            <button className="btn btn-primary" id="hero-create" onClick={() => nav('/studio')}><Sparkles /> {t('Create with AI')}</button>
          </div>
        </div>
      </section>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {stats.map((s, i) => (
          <Link key={i} to={s.to} className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div className="label"><span className="ico" style={{ background: s.tone[0], color: s.tone[1] }}><s.icon size={16} /></span>{s.label}</div>
            <div className="value mono">{s.value}</div>
            <div className="delta">{s.sub}</div>
          </Link>
        ))}
      </div>

      <div className="split">
        <div className="stack" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head">
              <h2>{t('Today’s online classes')}</h2>
              <Link to="/schedule" className="small strong">{t('Open schedule')} <ArrowRight size={13} className="flip-rtl" style={{ verticalAlign: -2 }} /></Link>
            </div>
            {todays.length === 0 ? (
              <Empty icon={Video} title={t('No online classes today')}>{t('Use Schedule to create a Meet or Zoom class.')}</Empty>
            ) : (
              <div className="list">
                {todays.map((o) => {
                  const cls = classMap[o.session.classId];
                  const live = now >= o.start && now <= o.end;
                  const past = now > o.end;
                  return (
                    <div key={o.key} className="list-row">
                      <div className="icon-tile" style={{ background: o.session.platform === 'zoom' ? 'var(--sky-100)' : 'var(--brand-100)', color: o.session.platform === 'zoom' ? 'var(--sky-700)' : 'var(--brand-600)' }}><Video /></div>
                      <div className="grow">
                        <div className="strong truncate">{o.session.title}</div>
                        <div className="small muted row" style={{ gap: 6 }}><ClassDot cls={cls} /> {cls?.name} · {fmtTime(o.start)} – {fmtTime(o.end)} · {o.session.platform === 'zoom' ? t('Zoom') : t('Google Meet')}</div>
                      </div>
                      {live && <span className="badge b-red">{t('Live now')}</span>}
                      {past ? <span className="badge">{t('Ended')}</span> : (
                        <a className={`btn btn-sm ${live ? 'btn-primary' : ''}`} href={o.session.link} target="_blank" rel="noreferrer">{t('Join')}</a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{t('Assignments due soon')}</h2>
              <Link to="/assignments" className="small strong">{t('All assignments')} <ArrowRight size={13} className="flip-rtl" style={{ verticalAlign: -2 }} /></Link>
            </div>
            {upcoming.length === 0 ? <Empty icon={ClipboardList} title={t('Nothing due')}>{t('Create a quiz in AI Studio.')}</Empty> : (
              <div className="list">
                {upcoming.map((a) => {
                  const subs = subsFor(a.id);
                  const roster = rosterFor(a);
                  const done = subs.filter((s) => s.status !== 'missing').length;
                  const p = pct(done, roster.length);
                  const overdue = new Date(a.dueDate) < now;
                  const when = relDays(a.dueDate).toLowerCase();
                  return (
                    <Link key={a.id} to={`/assignments/${a.id}`} className="list-row" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="grow">
                        <div className="row" style={{ gap: 8 }}>
                          <span className="strong truncate">{a.title}</span>
                          <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
                        </div>
                        <div className="small muted" style={{ marginTop: 2 }}>
                          {a.classIds.map((c) => classMap[c]?.name).join(', ')} · <span style={{ color: overdue ? 'var(--coral-700)' : undefined }}>{overdue ? t('Was due {when}', { when }) : t('Due {when}', { when })}</span>
                        </div>
                      </div>
                      <div style={{ width: 140 }}>
                        <div className="row-between tiny muted" style={{ marginBottom: 4 }}><span>{t('{done}/{total} submitted', { done, total: roster.length })}</span><span className="mono">{p}%</span></div>
                        <Progress value={p} color={p < 50 && overdue ? 'var(--coral)' : undefined} />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <section className="card">
            <div className="card-head"><h2>{t('Students needing attention')}</h2><span className="hint">{t('Missing work or under 60%')}</span></div>
            {attention.length === 0 ? <Empty icon={Users} title={t('Everyone is on track')} /> : (
              <div className="list">
                {attention.map(({ s, st }) => (
                  <div key={s.id} className="list-row">
                    <Avatar name={s.name} size="sm" />
                    <div className="grow">
                      <div className="strong small truncate">{s.name}</div>
                      <div className="tiny muted truncate">{classMap[s.classId]?.name} · {t('{n} missing', { n: st.missing.length })}</div>
                    </div>
                    <span className={`badge ${st.average == null ? '' : st.average < 60 ? 'b-red' : 'b-amber'} mono`}>{st.average == null ? '—' : `${st.average}%`}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ink-100)' }}>
              <Link to="/messages?template=t_missing" className="btn btn-sm" style={{ width: '100%' }}>{t('Email these parents')}</Link>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>{t('Automations')}</h2><Link to="/messages" className="small strong">{t('Manage')}</Link></div>
            <div className="list">
              {nextAuto.length === 0 && <Empty icon={Zap} title={t('No active automations')} />}
              {nextAuto.map((a) => (
                <div key={a.id} className="list-row">
                  <div className="icon-tile" style={{ background: 'var(--amber-100)', color: 'var(--amber-700)' }}><Zap /></div>
                  <div className="grow">
                    <div className="strong small">{a.name}</div>
                    <div className="tiny muted"><Clock size={11} style={{ verticalAlign: -1 }} /> {t('Next: {date} at {time}', { date: fmtDate(a.next, { weekday: 'short', month: 'short', day: 'numeric' }), time: fmtTime(a.next) })}</div>
                  </div>
                </div>
              ))}
              <div className="list-row">
                <div className="icon-tile" style={{ background: 'var(--ink-100)', color: 'var(--ink-700)' }}><Table /></div>
                <div className="grow">
                  <div className="strong small">{t('Classera marks export')}</div>
                  <div className="tiny muted">{unsynced === 1 ? t('1 changed mark · last {date}', { date: fmtDate(db.lastClasseraSync) }) : t('{n} changed marks · last {date}', { n: unsynced, date: fmtDate(db.lastClasseraSync) })}</div>
                </div>
                <Link to="/gradebook" className="btn btn-sm">{t('Sync')}</Link>
              </div>
            </div>
          </section>

          {toGrade.length > 0 && (
            <section className="ai-box">
              <div className="row" style={{ marginBottom: 8 }}><Sparkles size={18} color="var(--brand)" /><h3>{t('AI is ready to correct')}</h3></div>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {t('{subs} submissions across {assigns} assignments have open answers waiting. Gemini will score them with your rubric, then you review.', {
                  subs: toGrade.length,
                  assigns: new Set(toGrade.map((s) => s.assessmentId)).size,
                })}
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => nav('/grading')}>{t('Review & correct')}</button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
