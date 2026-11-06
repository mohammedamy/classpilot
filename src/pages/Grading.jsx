import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Sparkles, ChevronLeft, CheckCheck, Check, Bot, CircleCheck, ArrowRight, Inbox, TriangleAlert } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, Empty, Spinner, StatusBadge } from '../components/ui.jsx';
import { autoCorrect, computeTotal, isObjective } from '../lib/grading.js';
import { hasKey } from '../lib/gemini.js';
import { Q_TYPES, TYPE_META, totalPoints, fmtDateTime } from '../lib/utils.js';
import { t, useLang } from '../i18n/index.js';

export default function Grading() {
  useLang();
  const { id } = useParams();
  return id ? <Review id={id} /> : <Overview />;
}

function useCorrector() {
  const { db, update, toast } = useStore();
  const [running, setRunning] = useState(null);
  async function run(a, subs) {
    const eligible = subs.filter((s) => s.status === 'submitted' && !s.paper);
    if (!eligible.length) return toast(t('Nothing to auto-correct here'), 'error');
    setRunning(a.id);
    try {
      const res = await autoCorrect(db.settings, a, eligible);
      update((db) => {
        for (const [sid, r] of Object.entries(res)) {
          const s = db.submissions.find((x) => x.id === sid);
          s.scores = r.scores; s.total = r.total; s.status = 'graded'; s.reviewed = false;
          db.unsynced[sid] = true;
        }
      });
      const suffix = hasKey(db.settings) ? '' : ` ${t('(demo grader)')}`;
      toast((eligible.length === 1 ? t('Corrected 1 submission for “{title}”', { title: a.title }) : t('Corrected {n} submissions for “{title}”', { n: eligible.length, title: a.title })) + suffix);
    } catch (e) {
      toast(t(e.message), 'error');
    } finally {
      setRunning(null);
    }
  }
  return { running, run };
}

function Overview() {
  useLang();
  const { db, subsFor, classMap } = useStore();
  const nav = useNavigate();
  const { running, run } = useCorrector();
  const [all, setAll] = useState(false);

  const rows = db.assessments.filter((a) => a.status === 'published').map((a) => {
    const subs = subsFor(a.id);
    return { a, subs, toCorrect: subs.filter((s) => s.status === 'submitted').length, toReview: subs.filter((s) => s.status === 'graded' && !s.reviewed && !s.excused).length, reviewed: subs.filter((s) => s.status === 'graded' && s.reviewed).length };
  }).sort((x, y) => (y.toCorrect + y.toReview) - (x.toCorrect + x.toReview));

  const totalToCorrect = rows.reduce((sum, r) => sum + r.toCorrect, 0);
  const totalToReview = rows.reduce((sum, r) => sum + r.toReview, 0);

  async function correctAll() {
    setAll(true);
    for (const r of rows) if (r.toCorrect) await run(r.a, r.subs);
    setAll(false);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Auto-correct')}</h1>
          <p className="sub">{t('Objective questions are marked instantly. Gemini scores open answers using your model answer and rubric. You review and approve every mark before it goes to Classera.')}</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" id="correct-all" disabled={!totalToCorrect || all} onClick={correctAll}>
            {all ? <><Spinner /> {t('Correcting…')}</> : <><Sparkles /> {totalToCorrect ? t('Correct all {n}', { n: totalToCorrect }) : t('Correct all')}</>}
          </button>
        </div>
      </div>

      {!hasKey(db.settings) && (
        <div className="banner" style={{ marginBottom: 16 }}><TriangleAlert /><span className="grow">{t('Running the')} <b>{t('demo grader')}</b> {t('(keyword matching).')} <Link to="/settings">{t('Add your Gemini API key')}</Link> {t('for real AI grading with feedback.')}</span></div>
      )}

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        <div className="card stat"><div className="label">{t('Waiting for AI')}</div><div className="value mono">{totalToCorrect}</div><div className="delta">{t('Submitted, not yet scored')}</div></div>
        <div className="card stat"><div className="label">{t('Needs your review')}</div><div className="value mono">{totalToReview}</div><div className="delta">{t('Scored by AI, not yet approved')}</div></div>
        <div className="card stat"><div className="label">{t('Approved')}</div><div className="value mono">{rows.reduce((sum, r) => sum + r.reviewed, 0)}</div><div className="delta">{t('Ready for Classera')}</div></div>
      </div>

      <div className="card">
        <div className="list">
          {rows.length === 0 && <Empty icon={Inbox} title={t('Nothing published yet')} />}
          {rows.map(({ a, subs, toCorrect, toReview, reviewed }) => (
            <div key={a.id} className="list-row clickable" onClick={() => nav(`/grading/${a.id}`)}>
              <div className="icon-tile" style={{ background: toCorrect ? 'var(--sky-100)' : toReview ? 'var(--amber-100)' : 'var(--brand-100)', color: toCorrect ? 'var(--sky-700)' : toReview ? 'var(--amber-700)' : 'var(--brand-600)' }}>
                {toCorrect ? <Bot /> : toReview ? <CheckCheck /> : <CircleCheck />}
              </div>
              <div className="grow">
                <div className="row" style={{ gap: 8 }}><span className="strong">{a.title}</span><span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span></div>
                <div className="small muted">{a.classIds.map((c) => classMap[c]?.name).join(', ')} · {t('{open} open-ended of {total}', { open: a.questions.filter((q) => !isObjective(q)).length, total: a.questions.length })}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {toCorrect > 0 && <span className="badge b-blue">{t('{n} to correct', { n: toCorrect })}</span>}
                {toReview > 0 && <span className="badge b-amber">{t('{n} to review', { n: toReview })}</span>}
                {!toCorrect && !toReview && <span className="badge b-green">{t('{n} approved', { n: reviewed })}</span>}
              </div>
              {toCorrect > 0 && (
                <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); run(a, subs); }} disabled={running === a.id}>
                  {running === a.id ? <Spinner /> : <Sparkles />} {t('Correct')}
                </button>
              )}
              <ArrowRight size={16} color="var(--ink-400)" className="flip-rtl" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function Review({ id }) {
  useLang();
  const { db, update, toast, studentMap, subsFor } = useStore();
  const nav = useNavigate();
  const { running, run } = useCorrector();
  const a = db.assessments.find((x) => x.id === id);
  const subs = useMemo(() => (a ? subsFor(a.id).filter((s) => s.status !== 'missing') : []), [a, subsFor]);
  const [tab, setTab] = useState('review');
  const [cur, setCur] = useState(null);

  const lists = {
    correct: subs.filter((s) => s.status === 'submitted'),
    review: subs.filter((s) => s.status === 'graded' && !s.reviewed && !s.excused),
    done: subs.filter((s) => s.status === 'graded' && (s.reviewed || s.excused)),
  };
  const shown = lists[tab];

  useEffect(() => {
    if (!lists.review.length && lists.correct.length && tab === 'review') setTab('correct');
  }, [lists.review.length, lists.correct.length]); // eslint-disable-line
  useEffect(() => {
    if (!shown.find((s) => s.id === cur)) setCur(shown[0]?.id || null);
  }, [tab, shown.length]); // eslint-disable-line

  if (!a) return <Empty title={t('Assignment not found')} />;
  const max = totalPoints(a.questions);
  const sub = subs.find((s) => s.id === cur);
  const student = sub && studentMap[sub.studentId];
  const aiCount = lists.correct.filter((s) => !s.paper).length;

  function setScore(qid, patch) {
    update((db) => {
      const s = db.submissions.find((x) => x.id === sub.id);
      s.scores[qid] = { ...(s.scores[qid] || { points: 0, feedback: '' }), ...patch, auto: false };
      s.total = computeTotal(a, s.scores);
      if (a.questions.every((q) => s.scores[q.id])) s.status = 'graded';
      db.unsynced[s.id] = true;
    });
  }

  function approve(next = true) {
    update((db) => {
      const s = db.submissions.find((x) => x.id === sub.id);
      for (const q of a.questions) if (!s.scores[q.id]) s.scores[q.id] = { points: 0, feedback: '', auto: false };
      s.total = computeTotal(a, s.scores); s.status = 'graded'; s.reviewed = true; db.unsynced[s.id] = true;
    });
    toast(t('Approved {name}: {score}/{max}', { name: student.name, score: computeTotal(a, sub.scores), max }));
    if (next) {
      const i = shown.findIndex((s) => s.id === sub.id);
      const n = shown[i + 1] || shown[i - 1];
      setCur(n?.id || null);
    }
  }

  function approveConfident() {
    let n = 0;
    update((db) => {
      for (const s of db.submissions) {
        if (s.assessmentId !== a.id || s.status !== 'graded' || s.reviewed) continue;
        const low = Object.values(s.scores).some((x) => x.confidence === 'low');
        if (!low) { s.reviewed = true; n++; }
      }
    });
    toast(t('Approved {n} submissions; low-confidence ones are left for you', { n }));
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/grading')} style={{ marginBottom: 10, marginInlineStart: -8 }}><ChevronLeft className="flip-rtl" /> {t('Auto-correct')}</button>
      <div className="page-head">
        <div>
          <h1>{a.title}</h1>
          <p className="sub">{t('{waiting} waiting for AI · {review} to review · {approved} approved', { waiting: lists.correct.length, review: lists.review.length, approved: lists.done.length })}</p>
        </div>
        <div className="page-actions">
          {lists.review.length > 0 && <button className="btn" onClick={approveConfident}><CheckCheck /> {t('Approve all confident')}</button>}
          <button className="btn btn-primary" disabled={!aiCount || running} onClick={() => run(a, subs)}>{running ? <><Spinner /> {t('Correcting…')}</> : <><Sparkles /> {aiCount ? t('AI-correct {n}', { n: aiCount }) : t('AI-correct')}</>}</button>
        </div>
      </div>

      <div className="split" style={{ gridTemplateColumns: 'minmax(240px, 300px) minmax(0, 1fr)' }}>
        <div className="card" style={{ position: 'sticky', top: 76 }}>
          <div className="card-head" style={{ padding: 10 }}>
            <div className="seg" style={{ width: '100%' }}>
              {[['correct', t('Queue')], ['review', t('Review')], ['done', t('Done')]].map(([k, v]) => <button key={k} style={{ flex: 1, justifyContent: 'center' }} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{v} <span className="muted mono">{lists[k].length}</span></button>)}
            </div>
          </div>
          <div className="list" style={{ maxHeight: '62vh', overflow: 'auto' }}>
            {shown.length === 0 && <Empty icon={CircleCheck} title={t('All clear')} />}
            {shown.map((s) => {
              const st = studentMap[s.studentId];
              const low = Object.values(s.scores || {}).some((x) => x.confidence === 'low');
              return (
                <div key={s.id} className={`list-row clickable ${s.id === cur ? 'selected' : ''}`} onClick={() => setCur(s.id)} style={{ padding: '10px 14px' }}>
                  <Avatar name={st?.name} size="sm" />
                  <div className="grow"><div className="small strong truncate">{st?.name}</div><div className="tiny muted">{s.paper ? t('Paper, enter marks') : low ? t('Low AI confidence') : s.late ? t('Late') : fmtDateTime(s.submittedAt)}</div></div>
                  {s.total != null && <span className="badge mono">{s.total}/{max}</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="stack">
          {!sub ? <div className="card"><Empty icon={CheckCheck} title={t('Select a submission')}>{t('Pick a student on the left to review their answers.')}</Empty></div> : (
            <>
              <div className="card card-pad row-between wrap">
                <div className="row"><Avatar name={student.name} /><div><div className="strong">{student.name}</div><div className="small muted">{t('Submitted {date}', { date: sub.submittedAt ? fmtDateTime(sub.submittedAt) : '—' })} <StatusBadge sub={sub} dueDate={a.dueDate} /></div></div></div>
                <div className="row" style={{ gap: 16 }}>
                  <div style={{ textAlign: 'end' }}><div className="tiny muted strong">{t('TOTAL')}</div><div className="mono" style={{ fontFamily: 'var(--font-serif)', fontSize: 26, fontWeight: 600 }}>{computeTotal(a, sub.scores)}<span className="muted" style={{ fontSize: 16 }}> / {max}</span></div></div>
                  <button className="btn btn-primary" id="approve-btn" onClick={() => approve(true)}><Check /> {sub.reviewed ? t('Save') : t('Approve & next')}</button>
                </div>
              </div>

              {a.questions.map((q, i) => {
                const sc = sub.scores?.[q.id];
                const ans = sub.answers?.[q.id];
                const right = sc && sc.points >= q.points;
                const wrong = sc && sc.points === 0;
                return (
                  <div key={q.id} className="card card-pad stack" style={{ gap: 10 }}>
                    <div className="row" style={{ alignItems: 'flex-start' }}>
                      <span className="q-num">{i + 1}</span>
                      <div className="grow">
                        <div className="strong">{q.prompt}</div>
                        <div className="tiny muted" style={{ marginTop: 2 }}>{Q_TYPES[q.type]} · {t('{pts} pts', { pts: q.points })}</div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <input type="number" min={0} max={q.points} step={0.5} className="input input-sm mono" style={{ width: 70, textAlign: 'center', fontWeight: 700, background: right ? 'var(--brand-50)' : wrong ? 'var(--coral-100)' : sc ? 'var(--amber-100)' : undefined }}
                          value={sc?.points ?? ''} placeholder="—" onChange={(e) => setScore(q.id, { points: Math.max(0, Math.min(q.points, Number(e.target.value))) })} aria-label={t('Score for question {n}', { n: i + 1 })} />
                        <span className="small muted">/ {q.points}</span>
                      </div>
                    </div>
                    <div className="grid cols-2" style={{ gap: 10, paddingInlineStart: 36 }}>
                      <div className="inset"><div className="tiny strong muted" style={{ marginBottom: 4 }}>{t('STUDENT ANSWER')}</div><div className="small" style={{ whiteSpace: 'pre-wrap' }}>{ans || <i className="muted">{sub.paper ? t('Paper submission') : t('No answer')}</i>}</div></div>
                      <div className="inset" style={{ background: 'var(--brand-50)', borderColor: 'hsl(160 40% 88%)' }}><div className="tiny strong muted" style={{ marginBottom: 4 }}>{isObjective(q) ? t('CORRECT ANSWER') : t('MODEL ANSWER')}</div><div className="small">{q.answer || <i className="muted">—</i>}</div>{q.rubric && <div className="tiny muted" style={{ marginTop: 6 }}><b>{t('Rubric:')}</b> {q.rubric}</div>}</div>
                    </div>
                    {!isObjective(q) && (
                      <div style={{ paddingInlineStart: 36 }} className="stack-sm">
                        <div className="row" style={{ gap: 6 }}>
                          <Bot size={14} color="var(--brand)" /><span className="tiny strong muted">{t('FEEDBACK TO STUDENT')}</span>
                          {sc?.confidence && <span className={`badge ${sc.confidence === 'low' ? 'b-red' : sc.confidence === 'medium' ? 'b-amber' : 'b-green'}`}>{sc.confidence === 'low' ? t('AI confidence: low') : sc.confidence === 'medium' ? t('AI confidence: medium') : sc.confidence === 'high' ? t('AI confidence: high') : t('AI confidence: {level}', { level: sc.confidence })}</span>}
                          {sc && !sc.auto && <span className="badge">{t('Edited by you')}</span>}
                        </div>
                        <textarea className="textarea" rows={2} style={{ minHeight: 52 }} value={sc?.feedback || ''} placeholder={t('Feedback…')} onChange={(e) => setScore(q.id, { feedback: e.target.value, points: sc?.points ?? 0 })} />
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </>
  );
}
