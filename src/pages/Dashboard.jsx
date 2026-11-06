import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, CheckCheck, Video, ClipboardList, TriangleAlert, RefreshCw, Users, ArrowRight, Zap, Clock, Table } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, ClassDot, Progress, Empty } from '../components/ui.jsx';
import { DAY, fmtDate, fmtTime, relDays, startOfDay, startOfWeek, TYPE_META, pct } from '../lib/utils.js';
import { occurrencesInRange } from './Schedule.jsx';

export default function Dashboard() {
  const { db, classMap, subsFor, rosterFor, studentStats } = useStore();
  const nav = useNavigate();
  const now = Date.now();
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const lastName = db.settings.teacherName.split(' ').slice(-1)[0];
  const title = db.settings.teacherName.split(' ')[0];

  const toGrade = db.submissions.filter((s) => s.status === 'submitted');
  const overdueMissing = db.submissions.filter((s) => s.status === 'missing' && new Date(db.assessments.find((a) => a.id === s.assessmentId)?.dueDate) < now);
  const unsynced = Object.keys(db.unsynced || {}).length;

  const todays = occurrencesInRange(db.sessions, startOfDay(now), startOfDay(now) + DAY).sort((a, b) => a.start - b.start);
  const upcoming = db.assessments
    .filter((a) => a.status === 'published' && new Date(a.dueDate) > now - 4 * DAY && new Date(a.dueDate) < now + 10 * DAY)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const graded = db.submissions.filter((s) => s.status === 'graded');
  const avg = graded.length ? Math.round(graded.reduce((t, s) => {
    const a = db.assessments.find((x) => x.id === s.assessmentId);
    const max = a.questions.reduce((m, q) => m + q.points, 0);
    return t + (s.total / max) * 100;
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
    { label: 'Waiting to be corrected', value: toGrade.length, icon: CheckCheck, tone: ['var(--sky-100)', 'var(--sky-700)'], to: '/grading', sub: 'Open answers need AI review' },
    { label: 'Missing work', value: overdueMissing.length, icon: TriangleAlert, tone: ['var(--coral-100)', 'var(--coral-700)'], to: '/assignments', sub: 'Past due, not submitted' },
    { label: 'Average score', value: `${avg}%`, icon: Users, tone: ['var(--brand-100)', 'var(--brand-600)'], to: '/gradebook', sub: `Across ${graded.length} graded submissions` },
    { label: 'Marks to sync', value: unsynced, icon: RefreshCw, tone: ['var(--amber-100)', 'var(--amber-700)'], to: '/gradebook', sub: `Last Classera sync ${relDays(db.lastClasseraSync).toLowerCase()}` },
  ];

  return (
    <>
      <section className="hero" style={{ marginBottom: 20 }}>
        <div className="row-between wrap" style={{ alignItems: 'flex-end', gap: 20 }}>
          <div>
            <div className="small" style={{ color: 'hsl(163 52% 70%)', fontWeight: 600 }}>{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
            <h1 style={{ marginTop: 6 }}>{greet}, {title} {lastName}</h1>
            <p className="sub" style={{ marginTop: 8, maxWidth: 560 }}>
              You have <b style={{ color: '#fff' }}>{todays.length} online {todays.length === 1 ? 'class' : 'classes'}</b> today,{' '}
              <b style={{ color: '#fff' }}>{toGrade.length} submissions</b> to correct and{' '}
              <b style={{ color: '#fff' }}>{unsynced} marks</b> waiting to go to Classera.
            </p>
          </div>
          <div className="page-actions">
            <button className="btn" id="hero-correct" onClick={() => nav('/grading')}><CheckCheck /> Auto-correct</button>
            <button className="btn btn-primary" id="hero-create" onClick={() => nav('/studio')}><Sparkles /> Create with AI</button>
          </div>
        </div>
      </section>

      <div className="grid cols-4" style={{ marginBottom: 20 }}>
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card stat" style={{ color: 'inherit', textDecoration: 'none' }}>
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
              <h2>Today’s online classes</h2>
              <Link to="/schedule" className="small strong">Open schedule <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>
            </div>
            {todays.length === 0 ? (
              <Empty icon={Video} title="No online classes today">Use Schedule to create a Meet or Zoom class.</Empty>
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
                        <div className="small muted row" style={{ gap: 6 }}><ClassDot cls={cls} /> {cls?.name} · {fmtTime(o.start)} – {fmtTime(o.end)} · {o.session.platform === 'zoom' ? 'Zoom' : 'Google Meet'}</div>
                      </div>
                      {live && <span className="badge b-red">Live now</span>}
                      {past ? <span className="badge">Ended</span> : (
                        <a className={`btn btn-sm ${live ? 'btn-primary' : ''}`} href={o.session.link} target="_blank" rel="noreferrer">Join</a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Assignments due soon</h2>
              <Link to="/assignments" className="small strong">All assignments <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>
            </div>
            {upcoming.length === 0 ? <Empty icon={ClipboardList} title="Nothing due">Create a quiz in AI Studio.</Empty> : (
              <div className="list">
                {upcoming.map((a) => {
                  const subs = subsFor(a.id);
                  const roster = rosterFor(a);
                  const done = subs.filter((s) => s.status !== 'missing').length;
                  const p = pct(done, roster.length);
                  const overdue = new Date(a.dueDate) < now;
                  return (
                    <Link key={a.id} to={`/assignments/${a.id}`} className="list-row" style={{ color: 'inherit', textDecoration: 'none' }}>
                      <div className="grow">
                        <div className="row" style={{ gap: 8 }}>
                          <span className="strong truncate">{a.title}</span>
                          <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
                        </div>
                        <div className="small muted" style={{ marginTop: 2 }}>
                          {a.classIds.map((c) => classMap[c]?.name).join(', ')} · <span style={{ color: overdue ? 'var(--coral-700)' : undefined }}>{overdue ? 'Was due' : 'Due'} {relDays(a.dueDate).toLowerCase()}</span>
                        </div>
                      </div>
                      <div style={{ width: 140 }}>
                        <div className="row-between tiny muted" style={{ marginBottom: 4 }}><span>{done}/{roster.length} submitted</span><span className="mono">{p}%</span></div>
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
            <div className="card-head"><h2>Students needing attention</h2><span className="hint">Missing work or under 60%</span></div>
            {attention.length === 0 ? <Empty icon={Users} title="Everyone is on track" /> : (
              <div className="list">
                {attention.map(({ s, st }) => (
                  <div key={s.id} className="list-row">
                    <Avatar name={s.name} size="sm" />
                    <div className="grow">
                      <div className="strong small truncate">{s.name}</div>
                      <div className="tiny muted truncate">{classMap[s.classId]?.name} · {st.missing.length} missing</div>
                    </div>
                    <span className={`badge ${st.average == null ? '' : st.average < 60 ? 'b-red' : 'b-amber'} mono`}>{st.average == null ? '—' : `${st.average}%`}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--ink-100)' }}>
              <Link to="/messages?template=t_missing" className="btn btn-sm" style={{ width: '100%' }}>Email these parents</Link>
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Automations</h2><Link to="/messages" className="small strong">Manage</Link></div>
            <div className="list">
              {nextAuto.length === 0 && <Empty icon={Zap} title="No active automations" />}
              {nextAuto.map((a) => (
                <div key={a.id} className="list-row">
                  <div className="icon-tile" style={{ background: 'var(--amber-100)', color: 'var(--amber-700)' }}><Zap /></div>
                  <div className="grow">
                    <div className="strong small">{a.name}</div>
                    <div className="tiny muted"><Clock size={11} style={{ verticalAlign: -1 }} /> Next: {fmtDate(a.next, { weekday: 'short', month: 'short', day: 'numeric' })} at {fmtTime(a.next)}</div>
                  </div>
                </div>
              ))}
              <div className="list-row">
                <div className="icon-tile" style={{ background: 'var(--ink-100)', color: 'var(--ink-700)' }}><Table /></div>
                <div className="grow">
                  <div className="strong small">Classera marks export</div>
                  <div className="tiny muted">{unsynced} changed {unsynced === 1 ? 'mark' : 'marks'} · last {fmtDate(db.lastClasseraSync)}</div>
                </div>
                <Link to="/gradebook" className="btn btn-sm">Sync</Link>
              </div>
            </div>
          </section>

          {toGrade.length > 0 && (
            <section className="ai-box">
              <div className="row" style={{ marginBottom: 8 }}><Sparkles size={18} color="var(--brand)" /><h3>AI is ready to correct</h3></div>
              <p className="small muted" style={{ marginBottom: 12 }}>
                {toGrade.length} submissions across {new Set(toGrade.map((s) => s.assessmentId)).size} assignments have open answers waiting. Gemini will score them with your rubric, then you review.
              </p>
              <button className="btn btn-primary btn-sm" onClick={() => nav('/grading')}>Review & correct</button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
