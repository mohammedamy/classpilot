import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, CircleCheck, Send, ArrowRight } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { gradeObjective, isObjective, computeTotal } from '../lib/grading.js';
import { totalPoints, fmtDateTime, TYPE_META } from '../lib/utils.js';
import { Field } from '../components/ui.jsx';

export default function TakeQuiz() {
  const { id } = useParams();
  const { db, update, classMap } = useStore();
  const a = db.assessments.find((x) => x.id === id);
  const [studentId, setStudentId] = useState('');
  const [started, setStarted] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(null);
  const [left, setLeft] = useState(null);

  const roster = useMemo(() => (a ? db.students.filter((s) => a.classIds.includes(s.classId) && (!a.groups?.length || a.groups.includes(s.group))) : []), [a, db.students]);

  useEffect(() => {
    if (!started || !a?.durationMin || done) return;
    const t = setInterval(() => {
      const rem = Math.max(0, started + a.durationMin * 60000 - Date.now());
      setLeft(rem);
      if (rem === 0) submit();
    }, 500);
    return () => clearInterval(t);
  }, [started, done]); // eslint-disable-line

  if (!a || a.status !== 'published') {
    return <div className="take"><div className="take-inner"><div className="card card-pad" style={{ textAlign: 'center' }}><h1>This link isn’t active</h1><p className="muted" style={{ marginTop: 8 }}>Ask your teacher for a new link.</p></div></div></div>;
  }

  const max = totalPoints(a.questions);
  const answered = a.questions.filter((q) => (answers[q.id] ?? '') !== '').length;

  function submit() {
    const scores = {};
    for (const q of a.questions) if (isObjective(q)) scores[q.id] = { points: gradeObjective(q, answers[q.id]), auto: true, feedback: '' };
    const allObjective = a.questions.every(isObjective);
    const total = computeTotal(a, scores);
    const late = Date.now() > new Date(a.dueDate).getTime();
    update((db) => {
      let s = db.submissions.find((x) => x.assessmentId === a.id && x.studentId === studentId);
      if (!s) { s = { id: `sub_${a.id}_${studentId}`, assessmentId: a.id, studentId }; db.submissions.push(s); }
      Object.assign(s, { answers, scores, submittedAt: new Date().toISOString(), late, status: allObjective ? 'graded' : 'submitted', total: allObjective ? total : null, reviewed: false });
      if (allObjective) db.unsynced[s.id] = true;
    });
    setDone({ objective: total, objectiveMax: a.questions.filter(isObjective).reduce((t, q) => t + q.points, 0), pending: !allObjective });
  }

  const student = db.students.find((s) => s.id === studentId);
  const prior = studentId && db.submissions.find((x) => x.assessmentId === a.id && x.studentId === studentId && x.status !== 'missing');
  const mm = left != null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : null;

  return (
    <div className="take">
      <div className="take-inner">
        <div className="row" style={{ marginBottom: 22 }}>
          <img src="/favicon.svg" width="26" height="26" alt="" />
          <span className="small strong">{db.settings.school}</span>
          <span className="grow" />
          {started && !done && mm && <span className={`badge ${left < 60000 ? 'b-red' : 'b-dark'} mono`} style={{ fontSize: 13, padding: '4px 12px' }}><Clock /> {mm}</span>}
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
            <span className="badge">{a.classIds.map((c) => classMap[c]?.name).join(', ')}</span>
          </div>
          <h1>{a.title}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>{a.questions.length} questions · {max} points{a.durationMin ? ` · ${a.durationMin} minutes` : ''} · Due {fmtDateTime(a.dueDate)}</p>
          {a.instructions && <p style={{ marginTop: 12 }}>{a.instructions}</p>}
        </div>

        {done ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <CircleCheck size={44} color="var(--brand)" />
            <h1 style={{ marginTop: 10 }}>Submitted. Well done, {student?.name.split(' ')[0]}!</h1>
            {done.objectiveMax > 0 && <p style={{ marginTop: 10, fontSize: 16 }}>Auto-marked score: <b className="mono">{done.objective} / {done.objectiveMax}</b></p>}
            {done.pending && <p className="muted" style={{ marginTop: 6 }}>Your written answers will be marked by your teacher soon.</p>}
          </div>
        ) : !started ? (
          <div className="card card-pad stack">
            <Field label="Who are you?">
              <select className="select" id="take-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Select your name…</option>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {prior && <div className="banner small">You already submitted this on {fmtDateTime(prior.submittedAt)}. Submitting again will replace your answers.</div>}
            <button className="btn btn-primary" id="take-start" style={{ height: 44 }} disabled={!studentId} onClick={() => setStarted(Date.now())}>Start <ArrowRight /></button>
          </div>
        ) : (
          <div className="stack">
            {a.questions.map((q, i) => (
              <div key={q.id} className="card take-q stack" style={{ gap: 12 }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="q-num">{i + 1}</span>
                  <div className="grow strong" style={{ fontSize: 15 }}>{q.prompt}</div>
                  <span className="tiny muted">{q.points} pt{q.points > 1 ? 's' : ''}</span>
                </div>
                {(q.type === 'mcq' || q.type === 'tf') && (
                  <div className="stack-sm">
                    {q.options.map((o) => (
                      <div key={o} className={`take-opt ${answers[q.id] === o ? 'on' : ''}`} role="radio" aria-checked={answers[q.id] === o} tabIndex={0}
                        onClick={() => setAnswers({ ...answers, [q.id]: o })} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setAnswers({ ...answers, [q.id]: o })}>
                        <span className="radio" /> <span>{o}</span>
                      </div>
                    ))}
                  </div>
                )}
                {q.type === 'fill' && <input className="input" placeholder="Your answer" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                {(q.type === 'short' || q.type === 'essay') && <textarea className="textarea" rows={q.type === 'essay' ? 8 : 3} placeholder="Write your answer…" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
              </div>
            ))}
            <div className="card card-pad row-between" style={{ position: 'sticky', bottom: 16, boxShadow: 'var(--shadow-md)' }}>
              <span className="small muted">{answered} of {a.questions.length} answered</span>
              <button className="btn btn-primary" id="take-submit" onClick={() => { if (answered < a.questions.length && !confirm('Some questions are unanswered. Submit anyway?')) return; submit(); }}><Send /> Submit</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
