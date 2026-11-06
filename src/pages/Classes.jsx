import { useRef, useState } from 'react';
import { Upload, Download, UserPlus, Plus, Search, Trash2, Users, Info } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Avatar, Modal, Empty, Field } from '../components/ui.jsx';
import { parseCSV, toCSV, download, pick } from '../lib/csv.js';
import { uid } from '../lib/utils.js';
import { t, useLang } from '../i18n/index.js';

const COLORS = ['hsl(165 50% 36%)', 'hsl(205 60% 44%)', 'hsl(30 75% 48%)', 'hsl(6 60% 52%)', 'hsl(340 45% 48%)', 'hsl(45 70% 42%)', 'hsl(185 50% 36%)'];
const GROUPS = ['Group A', 'Group B', 'Group C', 'Group D'];

export default function Classes() {
  useLang();
  const { db, update, toast, studentStats } = useStore();
  const [classId, setClassId] = useState(db.classes[0]?.id);
  const [q, setQ] = useState('');
  const [addStudent, setAddStudent] = useState(false);
  const [addClass, setAddClass] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();
  const cls = db.classes.find((c) => c.id === classId);
  const students = db.students.filter((s) => s.classId === classId && (s.name + s.email + s.parentName).toLowerCase().includes(q.toLowerCase()));

  async function onFile(e) {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    const rows = parseCSV(await f.text());
    const mapped = rows.map((r) => ({
      classeraId: pick(r, 'student id', 'id', 'student_id', 'classera id', 'رقم الطالب'),
      name: pick(r, 'student name', 'name', 'full name', 'اسم الطالب'),
      email: pick(r, 'email', 'student email', 'e-mail'),
      parentName: pick(r, 'parent name', 'guardian', 'guardian name', 'ولي الأمر'),
      parentEmail: pick(r, 'parent email', 'guardian email', 'parent e-mail'),
      group: pick(r, 'group', 'section') || 'Group A',
    })).filter((r) => r.name);
    if (!mapped.length) return toast(t('No students found. Check the file has a "Student Name" column.'), 'error');
    setPreview(mapped);
  }

  function confirmImport() {
    let added = 0, updated = 0;
    update((db) => {
      for (const r of preview) {
        const ex = db.students.find((s) => (r.classeraId && s.classeraId === r.classeraId) || (s.name.toLowerCase() === r.name.toLowerCase() && s.classId === classId));
        if (ex) { Object.assign(ex, Object.fromEntries(Object.entries(r).filter(([, v]) => v))); updated++; }
        else { db.students.push({ id: uid('s'), classId, ...r }); added++; }
      }
    });
    toast(t('Imported: {added} added, {updated} updated', { added, updated }));
    setPreview(null);
  }

  function exportRoster() {
    download(`${cls.classeraCode || cls.name}_roster.csv`, toCSV(db.students.filter((s) => s.classId === classId).map((s) => ({ 'Student ID': s.classeraId, 'Student Name': s.name, Email: s.email, 'Parent Name': s.parentName, 'Parent Email': s.parentEmail, Group: s.group }))));
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Classes & students')}</h1>
          <p className="sub">{t('Import your rosters from a Classera export (CSV) and keep parent contacts and groups up to date.')}</p>
        </div>
        <div className="page-actions">
          <button className="btn" onClick={() => setAddClass(true)}><Plus /> {t('New class')}</button>
        </div>
      </div>

      <div className="grid cols-3" style={{ marginBottom: 18 }}>
        {db.classes.map((c) => {
          const n = db.students.filter((s) => s.classId === c.id).length;
          const code = c.classeraCode || '—';
          return (
            <button key={c.id} className="card stat" onClick={() => setClassId(c.id)} style={{ textAlign: 'start', cursor: 'pointer', outline: classId === c.id ? `2px solid ${c.color}` : 'none', outlineOffset: -1, font: 'inherit' }}>
              <div className="label"><span className="dot" style={{ background: c.color, width: 10, height: 10 }} />{c.grade} · {c.subject}</div>
              <div className="value" style={{ fontSize: 24 }}>{c.name}</div>
              <div className="delta">{n === 1 ? t('1 student · Classera {code}', { code }) : t('{n} students · Classera {code}', { n, code })}</div>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="card-head wrap">
          <div className="row"><h2>{t('{className} roster', { className: cls?.name })}</h2><span className="badge">{students.length}</span></div>
          <div className="row wrap" style={{ gap: 6 }}>
            <div className="search" style={{ width: 220 }}><Search /><input className="input input-sm" placeholder={t('Search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <button className="btn btn-sm" onClick={() => fileRef.current.click()} id="import-roster"><Upload /> {t('Import Classera CSV')}</button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
            <button className="btn btn-sm" onClick={exportRoster}><Download /> {t('Export')}</button>
            <button className="btn btn-sm btn-primary" onClick={() => setAddStudent(true)}><UserPlus /> {t('Add student')}</button>
          </div>
        </div>
        <div className="table-wrap">
          {students.length === 0 ? <Empty icon={Users} title={t('No students yet')}>{t('Import a CSV exported from Classera or add students manually.')}</Empty> : (
            <table className="table">
              <thead><tr><th>{t('Student')}</th><th>{t('Parent / guardian')}</th><th>{t('Group')}</th><th>{t('Classera ID')}</th><th className="num">{t('Average')}</th><th className="num">{t('Missing')}</th><th /></tr></thead>
              <tbody>
                {students.map((s) => {
                  const st = studentStats(s.id);
                  return (
                    <tr key={s.id}>
                      <td><div className="row"><Avatar name={s.name} size="sm" /><div><div className="small strong">{s.name}</div><div className="tiny muted">{s.email}</div></div></div></td>
                      <td><div className="small">{s.parentName || '—'}</div><div className="tiny muted">{s.parentEmail}</div></td>
                      <td>
                        <select className="select input-sm" style={{ width: 120 }} value={s.group} onChange={(e) => update((db) => { db.students.find((x) => x.id === s.id).group = e.target.value; })} aria-label={t('Group')}>
                          {GROUPS.map((g) => <option key={g} value={g}>{t(g)}</option>)}
                        </select>
                      </td>
                      <td className="small mono muted">{s.classeraId || '—'}</td>
                      <td className="num"><span className={`badge mono ${st.average == null ? '' : st.average >= 80 ? 'b-green' : st.average >= 60 ? 'b-amber' : 'b-red'}`}>{st.average == null ? '—' : `${st.average}%`}</span></td>
                      <td className="num small strong" style={{ color: st.missing.length ? 'var(--coral-700)' : undefined }}>{st.missing.length}</td>
                      <td><button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => { if (confirm(t('Remove {name}?', { name: s.name }))) update((db) => { db.students = db.students.filter((x) => x.id !== s.id); db.submissions = db.submissions.filter((x) => x.studentId !== s.id); }); }} aria-label={t('Remove student')}><Trash2 /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {addStudent && <StudentModal classId={classId} onClose={() => setAddStudent(false)} />}
      {addClass && <ClassModal onClose={() => setAddClass(false)} onCreated={setClassId} />}
      {preview && (
        <Modal wide title={t('Import {n} students into {className}', { n: preview.length, className: cls.name })} onClose={() => setPreview(null)} footer={<><button className="btn" onClick={() => setPreview(null)}>{t('Cancel')}</button><button className="btn btn-primary" onClick={confirmImport}>{t('Import')}</button></>}>
          <div className="banner info small"><Info /> {t('Existing students (same Classera ID or name) will be updated, not duplicated.')}</div>
          <div className="card table-wrap" style={{ boxShadow: 'none', maxHeight: 340, overflow: 'auto' }}>
            <table className="table"><thead><tr><th>{t('ID')}</th><th>{t('Name')}</th><th>{t('Email')}</th><th>{t('Parent')}</th><th>{t('Parent email')}</th><th>{t('Group')}</th></tr></thead>
              <tbody>{preview.map((r, i) => <tr key={i}><td className="small mono">{r.classeraId}</td><td className="small strong">{r.name}</td><td className="small">{r.email}</td><td className="small">{r.parentName}</td><td className="small">{r.parentEmail}</td><td className="small">{t(r.group)}</td></tr>)}</tbody>
            </table>
          </div>
        </Modal>
      )}
    </>
  );
}

function StudentModal({ classId, onClose }) {
  useLang();
  const { update, toast } = useStore();
  const [f, setF] = useState({ name: '', email: '', parentName: '', parentEmail: '', group: 'Group A', classeraId: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t('Add student')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary" disabled={!f.name} onClick={() => { update((db) => { db.students.push({ id: uid('s'), classId, ...f }); }); toast(t('{name} added', { name: f.name })); onClose(); }}>{t('Add')}</button></>}>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label={t('Full name')}><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label={t('Student email')}><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label={t('Parent name')}><input className="input" value={f.parentName} onChange={set('parentName')} /></Field>
        <Field label={t('Parent email')}><input className="input" type="email" value={f.parentEmail} onChange={set('parentEmail')} /></Field>
        <Field label={t('Classera ID')}><input className="input" value={f.classeraId} onChange={set('classeraId')} /></Field>
        <Field label={t('Group')}><select className="select" value={f.group} onChange={set('group')}>{GROUPS.map((g) => <option key={g} value={g}>{t(g)}</option>)}</select></Field>
      </div>
    </Modal>
  );
}

function ClassModal({ onClose, onCreated }) {
  useLang();
  const { update, toast } = useStore();
  const [f, setF] = useState({ name: '', subject: '', grade: '', classeraCode: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={t('New class')} onClose={onClose} footer={<><button className="btn" onClick={onClose}>{t('Cancel')}</button><button className="btn btn-primary" disabled={!f.name} onClick={() => { const id = uid('c'); update((db) => { db.classes.push({ id, ...f, color: COLORS[db.classes.length % COLORS.length] }); }); toast(t('{name} created', { name: f.name })); onCreated(id); onClose(); }}>{t('Create')}</button></>}>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label={t('Class name')}><input className="input" placeholder={t('e.g. Math 7C')} value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label={t('Subject')}><input className="input" value={f.subject} onChange={set('subject')} /></Field>
        <Field label={t('Grade')}><input className="input" placeholder={t('Grade 7')} value={f.grade} onChange={set('grade')} /></Field>
        <Field label={t('Classera class code')}><input className="input" value={f.classeraCode} onChange={set('classeraCode')} /></Field>
      </div>
    </Modal>
  );
}
