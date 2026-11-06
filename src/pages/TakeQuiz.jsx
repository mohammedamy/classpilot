import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { Clock, CircleCheck, Send, ArrowRight, Globe, LogIn, LogOut } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { gradeObjective, isObjective, computeTotal } from '../lib/grading.js';
import { totalPoints, fmtDateTime, TYPE_META, subId } from '../lib/utils.js';
import { isFirebaseEnabled, firestore, onAuthChange, signInWithGoogle, signOutUser } from '../lib/firebase.js';
import { Field, Spinner } from '../components/ui.jsx';
import { t, toggleLang, useLang } from '../i18n/index.js';

export default function TakeQuiz() {
  return isFirebaseEnabled ? <CloudTakeQuiz /> : <LocalTakeQuiz />;
}

function TopHeader({ school, started, done, left, rightExtra }) {
  const lang = useLang();
  const mm = left != null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}` : null;
  return (
    <div className="row" style={{ marginBottom: 22 }}>
      <img src={`${import.meta.env.BASE_URL}favicon.svg`} width="26" height="26" alt="" />
      {school && <span className="small strong">{school}</span>}
      <span className="grow" />
      {started && !done && mm && (
        <span className={`badge ${left < 60000 ? 'b-red' : 'b-dark'} mono`} style={{ fontSize: 13, padding: '4px 12px' }}>
          <Clock /> {mm}
        </span>
      )}
      {rightExtra}
      <button type="button" className="lang-switch" onClick={toggleLang} aria-label={t('Switch language')}>
        <Globe /> {lang === 'ar' ? 'English' : 'العربية'}
      </button>
    </div>
  );
}

function QuestionList({ a, answers, setAnswers, onSubmit, busy }) {
  const answered = a.questions.filter((q) => (answers[q.id] ?? '') !== '').length;
  return (
    <div className="stack">
      {a.questions.map((q, i) => (
        <div key={q.id} className="card take-q stack" style={{ gap: 12 }}>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="q-num">{i + 1}</span>
            <div className="grow strong" style={{ fontSize: 15 }}>{q.prompt}</div>
            <span className="tiny muted">{t('{n} pts', { n: q.points })}</span>
          </div>
          {(q.type === 'mcq' || q.type === 'tf') && (
            <div className="stack-sm">
              {q.options.map((o) => (
                <div
                  key={o}
                  className={`take-opt ${answers[q.id] === o ? 'on' : ''}`}
                  role="radio"
                  aria-checked={answers[q.id] === o}
                  tabIndex={0}
                  onClick={() => setAnswers({ ...answers, [q.id]: o })}
                  onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setAnswers({ ...answers, [q.id]: o })}
                >
                  <span className="radio" /> <span>{o}</span>
                </div>
              ))}
            </div>
          )}
          {q.type === 'fill' && (
            <input className="input" placeholder={t('Your answer')} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          )}
          {(q.type === 'short' || q.type === 'essay') && (
            <textarea className="textarea" rows={q.type === 'essay' ? 8 : 3} placeholder={t('Write your answer…')} value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
          )}
        </div>
      ))}
      <div className="card card-pad row-between" style={{ position: 'sticky', bottom: 16, boxShadow: 'var(--shadow-md)' }}>
        <span className="small muted">{t('{answered} of {total} answered', { answered, total: a.questions.length })}</span>
        <button
          className="btn btn-primary"
          id="take-submit"
          disabled={busy}
          onClick={() => {
            if (answered < a.questions.length && !confirm(t('Some questions are unanswered. Submit anyway?'))) return;
            onSubmit();
          }}
        >
          {busy ? <Spinner /> : <Send />} {t('Submit')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cloud mode (Firebase Auth + public/{id} + submissions/{id}__{sid})  */
/* ------------------------------------------------------------------ */
function CloudTakeQuiz() {
  const { id } = useParams();
  const [authUser, setAuthUser] = useState(undefined);
  const [loading, setLoading] = useState(false);
  const [pub, setPub] = useState(null);
  const [prior, setPrior] = useState(null);
  const [priorExists, setPriorExists] = useState(false);
  const [errorKind, setErrorKind] = useState(null); // 'inactive' | 'not_roster' | 'error'
  const [errorMsg, setErrorMsg] = useState('');
  const [started, setStarted] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [left, setLeft] = useState(null);

  useEffect(() => onAuthChange((u) => setAuthUser(u)), []);

  useEffect(() => {
    if (!authUser) {
      setPub(null);
      setPrior(null);
      setErrorKind(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorKind(null);
    (async () => {
      try {
        const pubSnap = await getDoc(doc(firestore, 'public', id));
        if (cancelled) return;
        if (!pubSnap.exists()) {
          setErrorKind('inactive');
          return;
        }
        const data = pubSnap.data();
        const email = (authUser.email || '').trim().toLowerCase();
        const sid = data.roster?.[email];
        if (!sid) {
          setErrorKind('not_roster');
          return;
        }
        setPub(data);
        const sSnap = await getDoc(doc(firestore, 'submissions', subId(id, sid)));
        if (cancelled) return;
        setPriorExists(sSnap.exists());
        if (sSnap.exists() && sSnap.data().status !== 'missing') {
          setPrior(sSnap.data());
          if (sSnap.data().answers) setAnswers(sSnap.data().answers);
        } else {
          setPrior(null);
        }
      } catch (e) {
        if (cancelled) return;
        if (e?.code === 'permission-denied') setErrorKind('not_roster');
        else {
          setErrorKind('error');
          setErrorMsg(e?.message || '');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser, id]);

  useEffect(() => {
    if (!started || !pub?.durationMin || done) return undefined;
    const iv = setInterval(() => {
      const rem = Math.max(0, started + pub.durationMin * 60000 - Date.now());
      setLeft(rem);
      if (rem === 0) submitCloud();
    }, 500);
    return () => clearInterval(iv);
  }, [started, done]); // eslint-disable-line

  async function submitCloud() {
    if (submitting || !pub || !authUser) return;
    setSubmitting(true);
    try {
      const email = (authUser.email || '').trim().toLowerCase();
      const studentId = pub.roster[email];
      const studentName = pub.rosterNames?.[email] || authUser.displayName || email;
      const docId = subId(id, studentId);
      const subRef = doc(firestore, 'submissions', docId);
      const submittedAt = new Date().toISOString();
      const late = Date.now() > new Date(pub.dueDate).getTime();

      if (priorExists) {
        await updateDoc(subRef, {
          answers,
          submittedAt,
          status: 'submitted',
          late,
          email,
          studentName,
        });
      } else {
        await setDoc(subRef, {
          id: docId,
          assessmentId: id,
          studentId,
          teacherUid: pub.teacherUid,
          email,
          studentName,
          answers,
          submittedAt,
          status: 'submitted',
          late,
        });
      }
      setDone(true);
    } catch (e) {
      alert(e?.message || t('Could not submit your answers. Please check your connection and try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  if (authUser === undefined || loading) {
    return (
      <div className="take">
        <div className="take-inner">
          <TopHeader />
          <div className="card card-pad row" style={{ justifyContent: 'center', padding: 40 }}>
            <Spinner /> <span className="muted">{t('Loading assignment…')}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="take">
        <div className="take-inner">
          <TopHeader />
          <div className="card card-pad stack" style={{ textAlign: 'center', padding: 36, alignItems: 'center' }}>
            <h1>{t('Sign in to start your assignment')}</h1>
            <p className="muted" style={{ maxWidth: 420 }}>
              {t('Use the school Google account registered with your teacher so your work is linked to your name.')}
            </p>
            <button className="btn btn-primary" style={{ height: 44, marginTop: 8 }} onClick={() => signInWithGoogle().catch((e) => alert(e.message))}>
              <LogIn /> {t('Sign in with Google')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const signOutBtn = (
    <button type="button" className="btn btn-ghost btn-sm" onClick={signOutUser} title={authUser.email}>
      <LogOut size={14} /> {t('Switch account')}
    </button>
  );

  if (errorKind === 'inactive') {
    return (
      <div className="take">
        <div className="take-inner">
          <TopHeader rightExtra={signOutBtn} />
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <h1>{t('This link isn’t active')}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{t('Ask your teacher for a new link.')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (errorKind === 'not_roster' || errorKind === 'error' || !pub) {
    return (
      <div className="take">
        <div className="take-inner">
          <TopHeader rightExtra={signOutBtn} />
          <div className="card card-pad stack" style={{ textAlign: 'center', alignItems: 'center', padding: 32 }}>
            <h1>{errorKind === 'not_roster' ? t('Account not on this class roster') : t('Could not open assignment')}</h1>
            <p className="muted" style={{ maxWidth: 460 }}>
              {errorKind === 'not_roster'
                ? t('You are signed in as {email}, which isn’t listed for this assignment (or the link is inactive). Switch to your student email or ask your teacher to check your email in ClassPilot.', { email: authUser.email })
                : (errorMsg || t('Please try again in a moment.'))}
            </p>
            <button className="btn" onClick={signOutUser}><LogOut /> {t('Try another Google account')}</button>
          </div>
        </div>
      </div>
    );
  }

  const email = (authUser.email || '').trim().toLowerCase();
  const studentName = pub.rosterNames?.[email] || authUser.displayName || email;
  const max = totalPoints(pub.questions);

  return (
    <div className="take">
      <div className="take-inner">
        <TopHeader school={pub.school} started={started} done={done} left={left} rightExtra={signOutBtn} />

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className={`badge ${TYPE_META[pub.type]?.badge || ''}`}>{TYPE_META[pub.type]?.label || pub.type}</span>
            {pub.classNames?.length > 0 && <span className="badge">{pub.classNames.join(', ')}</span>}
          </div>
          <h1>{pub.title}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            {t('{n} questions · {pts} points', { n: pub.questions.length, pts: max })}
            {pub.durationMin ? ` · ${t('{min} minutes', { min: pub.durationMin })}` : ''}
            {' · '}{t('Due {date}', { date: fmtDateTime(pub.dueDate) })}
          </p>
          {pub.instructions && <p style={{ marginTop: 12 }}>{pub.instructions}</p>}
        </div>

        {done ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <CircleCheck size={44} color="var(--brand)" />
            <h1 style={{ marginTop: 10 }}>{t('Submitted. Well done, {name}!', { name: studentName.split(' ')[0] })}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{t('Your answers have been sent to your teacher. Results will appear once your teacher releases marks.')}</p>
          </div>
        ) : prior?.status === 'graded' ? (
          <div className="card card-pad stack" style={{ textAlign: 'center', padding: 36 }}>
            <CircleCheck size={42} color="var(--brand)" style={{ margin: '0 auto' }} />
            <h1>{t('Your work has been graded')}</h1>
            <p style={{ fontSize: 18 }}>{t('Score')}: <b className="mono">{prior.total} / {max}</b></p>
            {prior.feedback && <div className="inset small">{prior.feedback}</div>}
          </div>
        ) : !started ? (
          <div className="card card-pad stack">
            <div className="inset small">
              <span className="muted">{t('Student')}:</span> <b>{studentName}</b> <span className="muted">({authUser.email})</span>
            </div>
            {prior && (
              <div className="banner small">
                {t('You already submitted this on {date}. Submitting again will replace your answers.', { date: fmtDateTime(prior.submittedAt) })}
              </div>
            )}
            <button className="btn btn-primary" id="take-start" style={{ height: 44 }} onClick={() => setStarted(Date.now())}>
              {t('Start')} <ArrowRight className="flip-rtl" />
            </button>
          </div>
        ) : (
          <QuestionList a={pub} answers={answers} setAnswers={setAnswers} onSubmit={submitCloud} busy={submitting} />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Local / Demo mode (shares browser storage with teacher preview)     */
/* ------------------------------------------------------------------ */
function LocalTakeQuiz() {
  const { id } = useParams();
  const { db, update, classMap } = useStore();
  const a = db.assessments.find((x) => x.id === id);
  const [studentId, setStudentId] = useState('');
  const [started, setStarted] = useState(null);
  const [answers, setAnswers] = useState({});
  const [done, setDone] = useState(null);
  const [left, setLeft] = useState(null);

  const roster = useMemo(
    () => (a ? db.students.filter((s) => a.classIds.includes(s.classId) && (!a.groups?.length || a.groups.includes(s.group))) : []),
    [a, db.students],
  );

  useEffect(() => {
    if (!started || !a?.durationMin || done) return undefined;
    const iv = setInterval(() => {
      const rem = Math.max(0, started + a.durationMin * 60000 - Date.now());
      setLeft(rem);
      if (rem === 0) submit();
    }, 500);
    return () => clearInterval(iv);
  }, [started, done]); // eslint-disable-line

  if (!a || a.status !== 'published') {
    return (
      <div className="take">
        <div className="take-inner">
          <TopHeader />
          <div className="card card-pad" style={{ textAlign: 'center' }}>
            <h1>{t('This link isn’t active')}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{t('Ask your teacher for a new link.')}</p>
          </div>
        </div>
      </div>
    );
  }

  const max = totalPoints(a.questions);

  function submit() {
    const scores = {};
    for (const q of a.questions) {
      if (isObjective(q)) scores[q.id] = { points: gradeObjective(q, answers[q.id]), auto: true, feedback: '' };
    }
    const allObjective = a.questions.every(isObjective);
    const total = computeTotal(a, scores);
    const late = Date.now() > new Date(a.dueDate).getTime();
    update((d) => {
      let s = d.submissions.find((x) => x.assessmentId === a.id && x.studentId === studentId);
      if (!s) {
        s = { id: subId(a.id, studentId), assessmentId: a.id, studentId };
        d.submissions.push(s);
      }
      Object.assign(s, {
        answers,
        scores,
        submittedAt: new Date().toISOString(),
        late,
        status: allObjective ? 'graded' : 'submitted',
        total: allObjective ? total : null,
        reviewed: false,
      });
      if (allObjective) d.unsynced[s.id] = true;
    });
    setDone({
      objective: total,
      objectiveMax: a.questions.filter(isObjective).reduce((tot, q) => tot + q.points, 0),
      pending: !allObjective,
    });
  }

  const student = db.students.find((s) => s.id === studentId);
  const prior = studentId && db.submissions.find((x) => x.assessmentId === a.id && x.studentId === studentId && x.status !== 'missing');

  return (
    <div className="take">
      <div className="take-inner">
        <TopHeader school={db.settings.school} started={started} done={done} left={left} />

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
            <span className="badge">{a.classIds.map((c) => classMap[c]?.name).join(', ')}</span>
          </div>
          <h1>{a.title}</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            {t('{n} questions · {pts} points', { n: a.questions.length, pts: max })}
            {a.durationMin ? ` · ${t('{min} minutes', { min: a.durationMin })}` : ''}
            {' · '}{t('Due {date}', { date: fmtDateTime(a.dueDate) })}
          </p>
          {a.instructions && <p style={{ marginTop: 12 }}>{a.instructions}</p>}
        </div>

        {done ? (
          <div className="card card-pad" style={{ textAlign: 'center', padding: 40 }}>
            <CircleCheck size={44} color="var(--brand)" />
            <h1 style={{ marginTop: 10 }}>{t('Submitted. Well done, {name}!', { name: student?.name.split(' ')[0] || '' })}</h1>
            {done.objectiveMax > 0 && (
              <p style={{ marginTop: 10, fontSize: 16 }}>
                {t('Auto-marked score')}: <b className="mono">{done.objective} / {done.objectiveMax}</b>
              </p>
            )}
            {done.pending && <p className="muted" style={{ marginTop: 6 }}>{t('Your written answers will be marked by your teacher soon.')}</p>}
          </div>
        ) : !started ? (
          <div className="card card-pad stack">
            <Field label={t('Who are you?')}>
              <select className="select" id="take-student" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">{t('Select your name…')}</option>
                {roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            {prior && (
              <div className="banner small">
                {t('You already submitted this on {date}. Submitting again will replace your answers.', { date: fmtDateTime(prior.submittedAt) })}
              </div>
            )}
            <button className="btn btn-primary" id="take-start" style={{ height: 44 }} disabled={!studentId} onClick={() => setStarted(Date.now())}>
              {t('Start')} <ArrowRight className="flip-rtl" />
            </button>
          </div>
        ) : (
          <QuestionList a={a} answers={answers} setAnswers={setAnswers} onSubmit={submit} busy={false} />
        )}
      </div>
    </div>
  );
}
