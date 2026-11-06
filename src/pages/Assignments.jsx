import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Sparkles, ChevronLeft, Search, Send, Copy, Pencil, Eye, CalendarDays, Users, Check, Trash2, ClipboardList, CheckCheck, Mail } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, ClassDot, Modal, Progress, StatusBadge, Empty, Field } from '../components/ui.jsx';
import { fmtDateTime, relDays, TYPE_META, pct, totalPoints, uid, toLocalInput, DAY } from '../lib/utils.js';
import { publishAssessment, shareLink } from './Studio.jsx';

export default function Assignments() {
  const { id } = useParams();
  return id ? <Detail id={id} /> : <List />;
}

function List() {
  const { db, classMap, subsFor, rosterFor } = useStore();
  const nav = useNavigate();
  const [cls, setCls] = useState('all');
  const [status, setStatus] = useState('active');
  const [q, setQ] = useState('');
  const [quick, setQuick] = useState(false);
  const [bulk, setBulk] = useState(false);
  const now = Date.now();

  const rows = db.assessments
    .filter((a) => cls === 'all' || a.classIds.includes(cls))
    .filter((a) => status === 'all' || (status === 'draft' ? a.status === 'draft' : status === 'active' ? a.status === 'published' && new Date(a.dueDate) > now - 7 * DAY : a.status === 'published' && new Date(a.dueDate) <= now))
    .filter((a) => a.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Assignments</h1>
          <p className="sub">See every assignment across your classes: who submitted, who's missing, and what still needs marking.</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setBulk(true)} id="bulk-assign"><Users /> Bulk assign</button>
          <button className="btn" onClick={() => setQuick(true)} id="quick-assign"><Plus /> Quick assignment</button>
          <button className="btn btn-primary" onClick={() => nav('/studio')}><Sparkles /> Create with AI</button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 14, gap: 10 }}>
        <div className="seg">
          {[['active', 'Active'], ['past', 'Past due'], ['draft', 'Drafts'], ['all', 'All']].map(([k, v]) => <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>{v}</button>)}
        </div>
        <select className="select input-sm" style={{ width: 180 }} value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Filter by class">
          <option value="all">All classes</option>
          {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="search grow" style={{ maxWidth: 320 }}><Search /><input className="input input-sm" placeholder="Search assignments" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="card table-wrap">
        {rows.length === 0 ? <Empty icon={ClipboardList} title="No assignments here">Try another filter or create one with AI.</Empty> : (
          <table className="table">
            <thead><tr><th>Assignment</th><th>Classes</th><th>Due</th><th style={{ width: 200 }}>Submitted</th><th>To grade</th><th className="num">Avg</th></tr></thead>
            <tbody>
              {rows.map((a) => {
                const subs = subsFor(a.id);
                const roster = rosterFor(a);
                const done = subs.filter((s) => s.status !== 'missing').length;
                const toGrade = subs.filter((s) => s.status === 'submitted').length;
                const graded = subs.filter((s) => s.status === 'graded');
                const max = totalPoints(a.questions) || 1;
                const avg = graded.length ? Math.round(graded.reduce((t, s) => t + s.total / max, 0) / graded.length * 100) : null;
                const overdue = new Date(a.dueDate) < now;
                return (
                  <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => nav(a.status === 'draft' ? `/studio/${a.id}` : `/assignments/${a.id}`)}>
                    <td>
                      <div className="row" style={{ gap: 8 }}><span className="strong">{a.title}</span><span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>{a.status === 'draft' && <span className="badge">Draft</span>}</div>
                      <div className="tiny muted">{a.questions.length} questions · {totalPoints(a.questions)} pts{a.groups?.length ? ` · ${a.groups.join(', ')}` : ''}</div>
                    </td>
                    <td><div className="row wrap" style={{ gap: 4 }}>{a.classIds.map((c) => <span key={c} className="badge"><ClassDot cls={classMap[c]} />{classMap[c]?.name}</span>)}</div></td>
                    <td className="small" style={{ color: overdue && a.status !== 'draft' ? 'var(--coral-700)' : undefined, whiteSpace: 'nowrap' }}>{relDays(a.dueDate)}</td>
                    <td>{a.status === 'draft' ? <span className="muted small">Not published</span> : <><div className="row-between tiny muted" style={{ marginBottom: 4 }}><span>{done}/{roster.length}</span><span>{pct(done, roster.length)}%</span></div><Progress value={pct(done, roster.length)} /></>}</td>
                    <td>{toGrade > 0 ? <span className="badge b-blue">{toGrade}</span> : <span className="muted">—</span>}</td>
                    <td className="num strong">{avg == null ? <span className="muted">—</span> : `${avg}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {quick && <QuickAssign onClose={() => setQuick(false)} />}
      {bulk && <BulkAssign onClose={() => setBulk(false)} />}
    </>
  );
}

function QuickAssign({ onClose }) {
  const { db, update, toast } = useStore();
  const [f, setF] = useState({ title: '', type: 'homework', classIds: [db.classes[0].id], groups: [], points: 10, due: toLocalInput(Date.now() + 2 * DAY), instructions: '' });
  const toggle = (k, v) => setF({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] });
  const groups = [...new Set(db.students.map((s) => s.group))];
  function save() {
    const a = {
      id: uid('a'), title: f.title || 'Untitled assignment', type: f.type, classIds: f.classIds, groups: f.groups, dueDate: new Date(f.due).toISOString(), durationMin: 0, status: 'published',
      questions: [{ id: uid('q'), type: 'essay', prompt: f.instructions || f.title, answer: '', rubric: '', points: Number(f.points) }], instructions: f.instructions, createdAt: new Date().toISOString(), source: { prompt: '', files: [] },
    };
    let n = 0;
    update((db) => { db.assessments.unshift(a); n = publishAssessment(db, a); });
    toast(`Assigned to ${n || 'selected'} students`);
    onClose();
  }
  return (
    <Modal title="Quick assignment" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!f.classIds.length}><Send /> Assign</button></>}>
      <p className="small muted" style={{ marginTop: -4 }}>For paper homework, projects, or anything you want to track and mark without building questions.</p>
      <Field label="Title"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Lab report: Density of liquids" autoFocus /></Field>
      <Field label="Instructions"><textarea className="textarea" rows={3} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
      <div className="grid cols-3" style={{ gap: 12 }}>
        <Field label="Type"><select className="select" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
        <Field label="Points"><input type="number" className="input" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value })} /></Field>
        <Field label="Due"><input type="datetime-local" className="input" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
      </div>
      <Field label="Classes"><div className="row wrap" style={{ gap: 6 }}>{db.classes.map((c) => <button key={c.id} className={`chip ${f.classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle('classIds', c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}</div></Field>
      <Field label="Groups (optional)"><div className="row wrap" style={{ gap: 6 }}>{groups.map((g) => <button key={g} className={`chip ${f.groups.includes(g) ? 'on' : ''}`} onClick={() => toggle('groups', g)}>{g}</button>)}</div></Field>
    </Modal>
  );
}

function BulkAssign({ onClose }) {
  const { db, update, toast } = useStore();
  const [picked, setPicked] = useState([]);
  const [classIds, setClassIds] = useState([]);
  const [due, setDue] = useState(toLocalInput(Date.now() + 3 * DAY));
  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  function go() {
    let total = 0;
    update((db) => {
      for (const id of picked) {
        const a = db.assessments.find((x) => x.id === id);
        a.classIds = [...new Set([...a.classIds, ...classIds])];
        a.status = 'published';
        a.dueDate = new Date(due).toISOString();
        total += publishAssessment(db, a);
      }
    });
    toast(`${picked.length} assignment${picked.length > 1 ? 's' : ''} assigned (${total} student slots)`);
    onClose();
  }
  return (
    <Modal wide title="Bulk assign" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={!picked.length || !classIds.length} onClick={go}><Send /> Assign {picked.length || ''}</button></>}>
      <Field label="1. Pick assignments (drafts or existing)">
        <div className="card" style={{ maxHeight: 260, overflow: 'auto', boxShadow: 'none' }}>
          {db.assessments.map((a) => (
            <label key={a.id} className={`list-row clickable ${picked.includes(a.id) ? 'selected' : ''}`}>
              <input type="checkbox" className="checkbox" checked={picked.includes(a.id)} onChange={() => toggle(picked, setPicked, a.id)} style={{ accentColor: 'var(--brand)' }} />
              <span className="grow strong small">{a.title}</span>
              <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
              <span className="badge">{a.status}</span>
            </label>
          ))}
        </div>
      </Field>
      <Field label="2. Assign to classes">
        <div className="row wrap" style={{ gap: 6 }}>{db.classes.map((c) => <button key={c.id} className={`chip ${classIds.includes(c.id) ? 'on' : ''}`} onClick={() => toggle(classIds, setClassIds, c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}</div>
      </Field>
      <Field label="3. Due date"><input type="datetime-local" className="input" style={{ maxWidth: 260 }} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
    </Modal>
  );
}

function Detail({ id }) {
  const { db, update, toast, classMap, studentMap, subsFor, rosterFor } = useStore();
  const nav = useNavigate();
  const a = db.assessments.find((x) => x.id === id);
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState([]);
  const [extend, setExtend] = useState(false);

  const subs = useMemo(() => (a ? subsFor(a.id) : []), [a, subsFor]);
  if (!a) return <Empty icon={ClipboardList} title="Assignment not found"><Link to="/assignments">Back to assignments</Link></Empty>;
  const roster = rosterFor(a);
  const max = totalPoints(a.questions);
  const counts = { all: subs.length, missing: subs.filter((s) => s.status === 'missing').length, submitted: subs.filter((s) => s.status === 'submitted').length, graded: subs.filter((s) => s.status === 'graded').length };
  const shown = subs.filter((s) => filter === 'all' || s.status === filter).sort((x, y) => (studentMap[x.studentId]?.name || '').localeCompare(studentMap[y.studentId]?.name || ''));
  const allSel = shown.length > 0 && shown.every((s) => sel.includes(s.id));

  function bulk(action) {
    if (!sel.length) return;
    update((db) => {
      for (const sid of sel) {
        const s = db.submissions.find((x) => x.id === sid);
        if (action === 'submitted' && s.status === 'missing') { s.status = 'submitted'; s.submittedAt = new Date().toISOString(); s.paper = true; }
        if (action === 'missing') { s.status = 'missing'; s.submittedAt = null; s.answers = {}; s.scores = {}; s.total = null; }
        if (action === 'excuse') { s.status = 'graded'; s.excused = true; s.total = max; s.reviewed = true; }
      }
    });
    toast(`Updated ${sel.length} student${sel.length > 1 ? 's' : ''}`);
    setSel([]);
  }

  return (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/assignments')} style={{ marginBottom: 10, marginLeft: -8 }}><ChevronLeft /> Assignments</button>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <span className={`badge ${TYPE_META[a.type].badge}`}>{TYPE_META[a.type].label}</span>
            {a.classIds.map((c) => <span key={c} className="badge"><ClassDot cls={classMap[c]} />{classMap[c]?.name}</span>)}
            {a.groups?.map((g) => <span key={g} className="badge b-blue">{g}</span>)}
          </div>
          <h1>{a.title}</h1>
          <p className="sub"><CalendarDays size={14} style={{ verticalAlign: -2 }} /> Due {fmtDateTime(a.dueDate)} · {a.questions.length} questions · {max} pts{a.durationMin ? ` · ${a.durationMin} min` : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => { navigator.clipboard.writeText(shareLink(a.id)); toast('Student link copied'); }}><Copy /> Copy link</button>
          <button className="btn" onClick={() => window.open(shareLink(a.id), '_blank')}><Eye /> Student view</button>
          <button className="btn" onClick={() => nav(`/studio/${a.id}`)}><Pencil /> Edit</button>
          <button className="btn btn-primary" onClick={() => nav(`/grading/${a.id}`)} disabled={!counts.submitted}><CheckCheck /> Correct {counts.submitted || ''}</button>
        </div>
      </div>

      <div className="grid cols-4" style={{ marginBottom: 18 }}>
        {[['Assigned', roster.length], ['Submitted', counts.submitted + counts.graded], ['Missing', counts.missing], ['Graded', counts.graded]].map(([l, v]) => (
          <div key={l} className="card stat"><div className="label">{l}</div><div className="value mono">{v}</div></div>
        ))}
      </div>

      <div className="card">
        <div className="card-head wrap">
          <div className="seg">
            {[['all', 'All'], ['missing', 'Missing'], ['submitted', 'To grade'], ['graded', 'Graded']].map(([k, v]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => { setFilter(k); setSel([]); }}>{v} <span className="muted mono">{counts[k]}</span></button>)}
          </div>
          <div className="row wrap" style={{ gap: 6 }}>
            {sel.length > 0 && <span className="small muted">{sel.length} selected</span>}
            <button className="btn btn-sm" disabled={!sel.length} onClick={() => bulk('submitted')}><Check /> Mark handed in</button>
            <button className="btn btn-sm" disabled={!sel.length} onClick={() => bulk('excuse')}>Excuse</button>
            <button className="btn btn-sm" disabled={!sel.length} onClick={() => bulk('missing')}><Trash2 /> Reset</button>
            <button className="btn btn-sm" onClick={() => setExtend(true)}><CalendarDays /> Extend due</button>
            <button className="btn btn-sm" onClick={() => nav(`/messages?assessment=${a.id}&missing=1`)}><Mail /> Remind missing</button>
          </div>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? [] : shown.map((s) => s.id))} style={{ accentColor: 'var(--brand)' }} aria-label="Select all" /></th>
              <th>Student</th><th>Status</th><th>Submitted</th><th className="num">Score</th>
            </tr></thead>
            <tbody>
              {shown.map((s) => {
                const st = studentMap[s.studentId];
                if (!st) return null;
                return (
                  <tr key={s.id}>
                    <td><input type="checkbox" checked={sel.includes(s.id)} onChange={() => setSel(sel.includes(s.id) ? sel.filter((x) => x !== s.id) : [...sel, s.id])} style={{ accentColor: 'var(--brand)' }} aria-label={`Select ${st.name}`} /></td>
                    <td><div className="row"><Avatar name={st.name} size="sm" /><div><div className="strong small">{st.name}</div><div className="tiny muted">{classMap[st.classId]?.name} · {st.group}</div></div></div></td>
                    <td><StatusBadge sub={s} dueDate={a.dueDate} />{s.excused && <span className="badge" style={{ marginLeft: 4 }}>Excused</span>}{s.paper && <span className="badge" style={{ marginLeft: 4 }}>Paper</span>}</td>
                    <td className="small muted">{s.submittedAt ? fmtDateTime(s.submittedAt) : '—'}</td>
                    <td className="num strong">{s.total != null ? `${s.total} / ${max}` : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {extend && <ExtendModal a={a} onClose={() => setExtend(false)} onSave={(d) => { update((db) => { db.assessments.find((x) => x.id === a.id).dueDate = d; }); toast('Due date updated'); setExtend(false); }} />}
    </>
  );
}

function ExtendModal({ a, onClose, onSave }) {
  const [d, setD] = useState(toLocalInput(Math.max(Date.now(), new Date(a.dueDate).getTime()) + 2 * DAY));
  return (
    <Modal title="Extend due date" onClose={onClose} footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => onSave(new Date(d).toISOString())}>Save</button></>}>
      <Field label="New due date"><input type="datetime-local" className="input" value={d} onChange={(e) => setD(e.target.value)} /></Field>
    </Modal>
  );
}
