import { useState } from 'react';
import { Download, RefreshCw, ExternalLink, Check, Search, Info, Table } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, Modal, Empty } from '../components/ui.jsx';
import { totalPoints, letter, fmtDateTime, TYPE_META } from '../lib/utils.js';
import { toCSV, download } from '../lib/csv.js';
import { uid } from '../lib/utils.js';

export default function Gradebook() {
  const { db, update, toast } = useStore();
  const [classId, setClassId] = useState(db.classes[0]?.id);
  const [q, setQ] = useState('');
  const [sync, setSync] = useState(false);
  const cls = db.classes.find((c) => c.id === classId);
  const cols = db.assessments.filter((a) => a.status === 'published' && a.classIds.includes(classId)).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const students = db.students.filter((s) => s.classId === classId && s.name.toLowerCase().includes(q.toLowerCase()));
  const subIndex = {};
  for (const s of db.submissions) subIndex[`${s.assessmentId}|${s.studentId}`] = s;
  const unsynced = db.unsynced || {};
  const unsyncedHere = Object.keys(unsynced).filter((sid) => { const s = db.submissions.find((x) => x.id === sid); return s && db.students.find((st) => st.id === s.studentId)?.classId === classId; }).length;

  function setMark(a, student, raw) {
    const max = totalPoints(a.questions);
    const val = raw === '' ? null : Math.max(0, Math.min(max, Number(raw)));
    update((db) => {
      let s = db.submissions.find((x) => x.assessmentId === a.id && x.studentId === student.id);
      if (!s) { s = { id: uid('sub'), assessmentId: a.id, studentId: student.id, answers: {}, scores: {}, feedback: '' }; db.submissions.push(s); }
      if (val == null) { s.total = null; s.status = 'missing'; }
      else { s.total = val; s.status = 'graded'; s.reviewed = true; s.override = true; s.submittedAt = s.submittedAt || new Date().toISOString(); }
      db.unsynced[s.id] = true;
    });
  }

  function rowAvg(st) {
    let e = 0, p = 0;
    for (const a of cols) { const s = subIndex[`${a.id}|${st.id}`]; if (s?.status === 'graded' && s.total != null) { e += s.total; p += totalPoints(a.questions); } }
    return p ? Math.round((e / p) * 100) : null;
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Gradebook</h1>
          <p className="sub">Click any mark to edit it. Changed marks are highlighted until you sync them to Classera.</p>
        </div>
        <div className="page-actions">
          <a className="btn" href={db.settings.classeraUrl} target="_blank" rel="noreferrer"><ExternalLink /> Open Classera</a>
          <button className="btn btn-primary" id="sync-classera" onClick={() => setSync(true)}><RefreshCw /> Sync to Classera {Object.keys(unsynced).length ? `(${Object.keys(unsynced).length})` : ''}</button>
        </div>
      </div>

      <div className="row wrap" style={{ marginBottom: 14, gap: 10 }}>
        <div className="seg">
          {db.classes.map((c) => <button key={c.id} className={classId === c.id ? 'on' : ''} onClick={() => setClassId(c.id)}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}
        </div>
        <div className="search" style={{ width: 240 }}><Search /><input className="input input-sm" placeholder="Find a student" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div className="grow" />
        <span className="legend"><i style={{ background: 'var(--amber-100)' }} /> Changed, not synced</span>
        <span className="legend"><i style={{ background: 'var(--sky-100)' }} /> Waiting for AI correction</span>
        <span className="legend"><i style={{ background: 'var(--coral-100)' }} /> Missing</span>
        {unsyncedHere > 0 && <span className="badge b-amber"><span className="dot" style={{ background: 'var(--amber)' }} /> {unsyncedHere} changed in {cls?.name}</span>}
      </div>

      <div className="card table-wrap gb">
        {cols.length === 0 ? <Empty icon={Table} title="No published assignments for this class" /> : (
          <table className="table">
            <thead>
              <tr>
                <th className="sticky-col" style={{ minWidth: 220 }}>Student</th>
                {cols.map((a) => (
                  <th key={a.id} className="col" title={a.title}>
                    <div className="truncate strong" style={{ maxWidth: 130, margin: '0 auto' }}>{a.title}</div>
                    <div className="tiny muted" style={{ fontWeight: 500 }}><span className={`badge ${TYPE_META[a.type].badge}`} style={{ fontSize: 10, padding: '0 6px' }}>{TYPE_META[a.type].label}</span> /{totalPoints(a.questions)}</div>
                  </th>
                ))}
                <th className="col">Average</th>
              </tr>
            </thead>
            <tbody>
              {students.map((st) => {
                const avg = rowAvg(st);
                return (
                  <tr key={st.id}>
                    <td className="sticky-col"><div className="row"><Avatar name={st.name} size="sm" /><div><div className="small strong">{st.name}</div><div className="tiny muted">Classera ID {st.classeraId}</div></div></div></td>
                    {cols.map((a) => {
                      const s = subIndex[`${a.id}|${st.id}`];
                      const pending = s?.status === 'submitted';
                      const dirty = s && unsynced[s.id];
                      return (
                        <td key={a.id} className="cell">
                          <input
                            key={`${s?.id}-${s?.total}`}
                            className={`mark ${dirty ? 'dirty' : ''} ${s?.total == null ? 'blank' : ''} ${s?.total == null && pending ? 'pending' : ''} ${s?.total == null && s?.status === 'missing' && new Date(a.dueDate) < Date.now() ? 'missing' : ''}`}
                            defaultValue={s?.total ?? ''}
                            placeholder={pending ? 'AI' : s?.status === 'missing' && new Date(a.dueDate) < Date.now() ? 'miss' : '—'}
                            inputMode="decimal"
                            title={dirty ? 'Changed. Not yet synced to Classera' : ''}
                            onBlur={(e) => { if (String(e.target.value) !== String(s?.total ?? '')) setMark(a, st, e.target.value.trim()); }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                            aria-label={`${st.name} ${a.title}`}
                          />
                        </td>
                      );
                    })}
                    <td className="cell"><span className={`badge mono ${avg == null ? '' : avg >= 80 ? 'b-green' : avg >= 60 ? 'b-amber' : 'b-red'}`}>{avg == null ? '—' : `${avg}% · ${letter(avg)}`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {sync && <SyncModal onClose={() => setSync(false)} onDone={() => { update((db) => { db.unsynced = {}; db.lastClasseraSync = new Date().toISOString(); }); toast('Marked as synced with Classera'); setSync(false); }} />}
    </>
  );
}

function SyncModal({ onClose, onDone }) {
  const { db, toast } = useStore();
  const [scope, setScope] = useState('changed');
  const changed = Object.keys(db.unsynced || {});

  function rowsFor(classId) {
    const cols = db.assessments.filter((a) => a.status === 'published' && a.classIds.includes(classId));
    return db.students.filter((s) => s.classId === classId).map((st) => {
      const r = { 'Student ID': st.classeraId, 'Student Name': st.name };
      for (const a of cols) {
        const s = db.submissions.find((x) => x.assessmentId === a.id && x.studentId === st.id);
        r[`${a.title} (/${totalPoints(a.questions)})`] = s?.status === 'graded' ? s.total : '';
      }
      return r;
    });
  }

  function exportChanged() {
    const rows = changed.map((sid) => db.submissions.find((s) => s.id === sid)).filter(Boolean).map((s) => {
      const st = db.students.find((x) => x.id === s.studentId);
      const a = db.assessments.find((x) => x.id === s.assessmentId);
      const cls = db.classes.find((c) => c.id === st?.classId);
      return { 'Class Code': cls?.classeraCode, 'Student ID': st?.classeraId, 'Student Name': st?.name, Assessment: a?.title, Mark: s.total ?? '', 'Out Of': totalPoints(a?.questions), Feedback: Object.values(s.scores || {}).map((x) => x.feedback).filter(Boolean).join(' ') };
    });
    download(`classera_changed_marks_${new Date().toISOString().slice(0, 10)}.csv`, toCSV(rows));
    toast(`Exported ${rows.length} changed marks`);
  }
  function exportFull() {
    for (const c of db.classes) download(`classera_gradebook_${c.classeraCode}.csv`, toCSV(rowsFor(c.id)));
    toast(`Exported ${db.classes.length} class gradebooks`);
  }

  return (
    <Modal title="Sync marks to Classera" onClose={onClose} wide footer={<>
      <button className="btn" onClick={onClose}>Close</button>
      <button className="btn btn-primary" onClick={onDone}><Check /> I’ve uploaded them, mark as synced</button>
    </>}>
      <div className="banner info small"><Info /><span>Classera has no public API, so for now the sync works through Classera’s gradebook <b>Import from Excel/CSV</b>. If your school gets API access, this button can push marks directly.</span></div>
      <div className="seg">
        <button className={scope === 'changed' ? 'on' : ''} onClick={() => setScope('changed')}>Only changed marks ({changed.length})</button>
        <button className={scope === 'full' ? 'on' : ''} onClick={() => setScope('full')}>Full gradebook per class</button>
      </div>
      {scope === 'changed' ? (
        <div className="card table-wrap" style={{ boxShadow: 'none', maxHeight: 280, overflow: 'auto' }}>
          {changed.length === 0 ? <Empty icon={Check} title="Everything is in sync" /> : (
            <table className="table"><thead><tr><th>Student</th><th>Assessment</th><th className="num">Mark</th></tr></thead><tbody>
              {changed.map((sid) => { const s = db.submissions.find((x) => x.id === sid); if (!s) return null; const st = db.students.find((x) => x.id === s.studentId); const a = db.assessments.find((x) => x.id === s.assessmentId); return (
                <tr key={sid}><td className="small strong">{st?.name}</td><td className="small">{a?.title}</td><td className="num small strong">{s.total ?? '—'} / {totalPoints(a?.questions)}</td></tr>
              ); })}
            </tbody></table>
          )}
        </div>
      ) : <p className="small muted">Downloads one CSV per class with Classera student IDs and a column per assessment.</p>}
      <ol className="small" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
        <li>Download the file below.</li>
        <li>In Classera, open <b>Gradebook → Import marks</b> for the class and upload it.</li>
        <li>Come back and click <b>Mark as synced</b>.</li>
      </ol>
      <div className="row"><button className="btn btn-dark" onClick={scope === 'changed' ? exportChanged : exportFull} disabled={scope === 'changed' && !changed.length}><Download /> Download CSV for Classera</button><span className="tiny muted">Last synced {fmtDateTime(db.lastClasseraSync)}</span></div>
    </Modal>
  );
}
