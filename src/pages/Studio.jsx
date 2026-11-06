import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sparkles, CloudUpload, FileText, X, Plus, Trash2, Check, Eye, Send, Copy, Download, Printer, WandSparkles, BookOpen, Mail } from 'lucide-react';
import { useStore } from '../store/store.jsx';
import { Modal, Spinner, Field } from '../components/ui.jsx';
import { generateAssessment, hasKey } from '../lib/gemini.js';
import { Q_TYPES, TYPE_META, totalPoints, uid, toLocalInput, DAY } from '../lib/utils.js';
import { toCSV, download } from '../lib/csv.js';

const EXAMPLES = [
  'A 10-question quiz on the water cycle for Grade 6, mostly multiple choice with 2 short answers',
  'Midterm exam covering chapters 3–4 of the attached book, mixed difficulty, include one essay',
  'Homework: 5 fill-in-the-blank questions on Arabic grammar (المبتدأ والخبر)',
  'Exit ticket: 3 quick questions checking today’s lesson on fractions',
];

export function shareLink(id) {
  return `${window.location.origin}${window.location.pathname}#/take/${id}`;
}

export function publishAssessment(db, a) {
  const roster = db.students.filter((s) => a.classIds.includes(s.classId) && (!a.groups?.length || a.groups.includes(s.group)));
  for (const s of roster) {
    if (!db.submissions.some((x) => x.assessmentId === a.id && x.studentId === s.id)) {
      db.submissions.push({ id: uid('sub'), assessmentId: a.id, studentId: s.id, status: 'missing', submittedAt: null, answers: {}, scores: {}, total: null, feedback: '', reviewed: false, late: false });
    }
  }
  return roster.length;
}

export function printAssessment(a, withKey, school) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const qs = a.questions.map((q, i) => `
    <div class="q"><div class="qh"><b>${i + 1}.</b> ${esc(q.prompt)} <span class="pts">(${q.points} pt${q.points > 1 ? 's' : ''})</span></div>
    ${q.type === 'mcq' || q.type === 'tf' ? `<ol type="a">${q.options.map((o) => `<li>${esc(o)}${withKey && o === q.answer ? ' ✔' : ''}</li>`).join('')}</ol>` : ''}
    ${q.type === 'fill' ? `<div class="line"></div>` : ''}
    ${q.type === 'short' ? `<div class="line"></div><div class="line"></div><div class="line"></div>` : ''}
    ${q.type === 'essay' ? Array(8).fill('<div class="line"></div>').join('') : ''}
    ${withKey && !['mcq', 'tf'].includes(q.type) ? `<div class="key"><b>Answer:</b> ${esc(q.answer)}${q.rubric ? `<br><b>Rubric:</b> ${esc(q.rubric)}` : ''}</div>` : ''}
    </div>`).join('');
  const w = window.open('', '_blank');
  w.document.write(`<!doctype html><html><head><title>${esc(a.title)}</title><style>
    body{font-family:Georgia,serif;max-width:760px;margin:32px auto;padding:0 24px;color:#111;line-height:1.5}
    h1{font-size:24px;margin:0} .meta{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px;font-size:14px}
    .q{margin:0 0 20px;break-inside:avoid} .pts{color:#666;font-size:13px} ol{margin:6px 0 0} .line{border-bottom:1px solid #999;height:26px}
    .key{background:#eef8f3;padding:8px 10px;border-radius:6px;margin-top:6px;font-size:13px} .name{margin:8px 0 22px;font-size:14px}
  </style></head><body>
  <div class="meta"><div><div style="font-size:13px;color:#555">${esc(school)}</div><h1>${esc(a.title)}${withKey ? ' — Answer key' : ''}</h1></div><div style="text-align:right">Total: ${totalPoints(a.questions)} pts${a.durationMin ? `<br>Time: ${a.durationMin} min` : ''}</div></div>
  ${withKey ? '' : '<div class="name">Name: ______________________ &nbsp; Class: ________ &nbsp; Date: ________</div>'}
  ${a.instructions ? `<p><i>${esc(a.instructions)}</i></p>` : ''}${qs}
  <script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}

function blankQuestion(type = 'mcq') {
  return { id: uid('q'), type, prompt: '', options: type === 'mcq' ? ['', '', '', ''] : type === 'tf' ? ['True', 'False'] : [], answer: type === 'tf' ? 'True' : '', rubric: '', points: type === 'essay' ? 6 : type === 'short' ? 3 : 1 };
}

export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const { db, update, toast, classMap } = useStore();
  const existing = id ? db.assessments.find((a) => a.id === id) : null;

  // Generator inputs
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState([]);
  const [type, setType] = useState('quiz');
  const [count, setCount] = useState(8);
  const [difficulty, setDifficulty] = useState('mixed');
  const [qtypes, setQtypes] = useState(['mcq', 'tf', 'short']);
  const [classId, setClassId] = useState(db.classes[0]?.id || '');
  const [language, setLanguage] = useState('English');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const fileRef = useRef();

  // Draft being edited
  const [draft, setDraft] = useState(existing ? structuredClone(existing) : null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [published, setPublished] = useState(null);

  useEffect(() => { if (existing) setDraft(structuredClone(existing)); }, [id]); // eslint-disable-line

  const cls = classMap[classId];
  const total = useMemo(() => totalPoints(draft?.questions), [draft]);

  const addFiles = (list) => {
    const arr = [...list].filter((f) => f.size < 18 * 1024 * 1024);
    if (arr.length < list.length) toast('Some files were over 18 MB and were skipped', 'error');
    setFiles((f) => [...f, ...arr]);
  };

  async function onGenerate() {
    if (!prompt.trim() && !files.length) return toast('Describe what you need or upload a document', 'error');
    setBusy(true);
    try {
      const out = await generateAssessment(db.settings, { prompt, type, count, difficulty, qtypes, grade: cls?.grade, subject: cls?.subject, language, files });
      const now = Date.now();
      setDraft({
        id: existing?.id || uid('a'),
        title: out.title, instructions: out.instructions, questions: out.questions, type,
        classIds: classId ? [classId] : [], groups: [], dueDate: new Date(now + 3 * DAY).toISOString(),
        durationMin: type === 'exam' ? 45 : type === 'quiz' ? 20 : 0, status: 'draft', createdAt: new Date(now).toISOString(),
        source: { prompt, files: files.map((f) => f.name) },
      });
      toast(out.demo ? 'Generated in demo mode — add a Gemini key for real AI questions' : `Generated ${out.questions.length} questions`);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const setQ = (qid, patch) => setDraft((d) => ({ ...d, questions: d.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }));
  const removeQ = (qid) => setDraft((d) => ({ ...d, questions: d.questions.filter((q) => q.id !== qid) }));
  const addQ = (t) => setDraft((d) => ({ ...d, questions: [...d.questions, blankQuestion(t)] }));

  function save(status = draft.status) {
    const a = { ...draft, status };
    update((db) => {
      const i = db.assessments.findIndex((x) => x.id === a.id);
      if (i >= 0) db.assessments[i] = a; else db.assessments.unshift(a);
      if (status === 'published') publishAssessment(db, a);
    });
    setDraft(a);
    if (!id) nav(`/studio/${a.id}`, { replace: true });
    return a;
  }

  function startBlank() {
    setDraft({ id: uid('a'), title: 'Untitled quiz', instructions: '', questions: [blankQuestion('mcq')], type: 'quiz', classIds: classId ? [classId] : [], groups: [], dueDate: new Date(Date.now() + 3 * DAY).toISOString(), durationMin: 20, status: 'draft', createdAt: new Date().toISOString(), source: { prompt: '', files: [] } });
  }

  function exportClassera() {
    const rows = draft.questions.map((q, i) => ({
      'Question No': i + 1, 'Question Type': Q_TYPES[q.type], Question: q.prompt,
      'Option A': q.options[0] || '', 'Option B': q.options[1] || '', 'Option C': q.options[2] || '', 'Option D': q.options[3] || '',
      'Correct Answer': q.answer, Mark: q.points,
    }));
    download(`${draft.title.replace(/[^\w]+/g, '_')}_classera_questions.csv`, toCSV(rows));
    toast('Question sheet downloaded — import it into your Classera question bank');
  }

  const issues = draft ? draft.questions.filter((q) => !q.prompt.trim() || ((q.type === 'mcq' || q.type === 'tf') && !q.options.includes(q.answer))).length : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>AI Studio</h1>
          <p className="sub">Generate quizzes, exams, homework and worksheets from a prompt or your own books and documents. Edit everything, then publish to your classes.</p>
        </div>
        {draft && (
          <div className="page-actions">
            <button className="btn" onClick={() => { setDraft(null); nav('/studio'); }}><Plus /> New</button>
          </div>
        )}
      </div>

      <div className="split" style={{ gridTemplateColumns: 'minmax(320px, 0.9fr) minmax(0, 1.5fr)' }}>
        {/* ---------- Generator ---------- */}
        <section className="card card-pad stack" style={{ position: 'sticky', top: 76, gap: 16, maxHeight: 'calc(100vh - 92px)', overflowY: 'auto' }}>
          <div className="row"><WandSparkles size={18} color="var(--brand)" /><h2>Generate</h2>{!hasKey(db.settings) && <span className="badge b-amber" style={{ marginLeft: 'auto' }}>Demo AI</span>}</div>

          <Field label="What do you need?" htmlFor="gen-prompt">
            <textarea id="gen-prompt" className="textarea" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. A 15-question exam on chapter 5 (photosynthesis) for Grade 8, include 2 essay questions and a diagram question…" />
          </Field>
          <div className="row wrap" style={{ gap: 6, marginTop: -8 }}>
            {EXAMPLES.slice(0, 3).map((ex) => <button key={ex} className="chip tiny" style={{ fontWeight: 500 }} onClick={() => setPrompt(ex)}>{ex.slice(0, 38)}…</button>)}
          </div>

          <div className="field">
            <label>Source documents or book chapters <span className="muted" style={{ fontWeight: 500 }}>(optional)</span></label>
            <div
              className={`dropzone ${over ? 'over' : ''}`}
              id="gen-dropzone"
              onClick={() => fileRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
            >
              <CloudUpload />
              <div className="strong small">Drop PDFs, textbook pages, photos or notes</div>
              <div className="tiny muted">PDF, JPG/PNG (scanned pages), TXT/MD · up to 18 MB each</div>
              <input ref={fileRef} type="file" hidden multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv" onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {files.length > 0 && (
              <div className="stack-sm" style={{ marginTop: 6 }}>
                {files.map((f, i) => (
                  <div key={i} className="file-pill">
                    {f.type.startsWith('image/') ? <BookOpen /> : <FileText />}
                    <span className="grow small truncate">{f.name}</span>
                    <span className="tiny muted">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove file"><X /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Field label="Type">
            <div className="seg">
              {Object.entries(TYPE_META).map(([k, v]) => <button key={k} className={type === k ? 'on' : ''} onClick={() => setType(k)}>{v.label}</button>)}
            </div>
          </Field>

          <div className="grid cols-2" style={{ gap: 12 }}>
            <Field label="Class" htmlFor="gen-class">
              <select id="gen-class" className="select" value={classId} onChange={(e) => setClassId(e.target.value)}>
                {db.classes.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.grade}</option>)}
              </select>
            </Field>
            <Field label="Language" htmlFor="gen-lang">
              <select id="gen-lang" className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {['English', 'Arabic', 'French', 'Bilingual (English + Arabic)'].map((l) => <option key={l}>{l}</option>)}
              </select>
            </Field>
            <Field label={`Questions: ${count}`} htmlFor="gen-count">
              <input id="gen-count" type="range" min={3} max={40} value={count} onChange={(e) => setCount(Number(e.target.value))} style={{ accentColor: 'var(--brand)' }} />
            </Field>
            <Field label="Difficulty" htmlFor="gen-diff">
              <select id="gen-diff" className="select" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Easy</option><option value="mixed">Mixed</option><option value="hard">Challenging</option>
              </select>
            </Field>
          </div>

          <Field label="Question types">
            <div className="row wrap" style={{ gap: 6 }}>
              {Object.entries(Q_TYPES).map(([k, v]) => (
                <button key={k} className={`chip ${qtypes.includes(k) ? 'on' : ''}`} onClick={() => setQtypes((q) => q.includes(k) ? (q.length > 1 ? q.filter((x) => x !== k) : q) : [...q, k])}>
                  {qtypes.includes(k) && <Check size={13} />}{v}
                </button>
              ))}
            </div>
          </Field>

          <button className="btn btn-primary" id="gen-submit" onClick={onGenerate} disabled={busy} style={{ height: 44 }}>
            {busy ? <><Spinner /> {files.length ? 'Reading documents & writing questions…' : 'Writing questions…'}</> : <><Sparkles /> Generate {TYPE_META[type].label.toLowerCase()}</>}
          </button>
        </section>

        {/* ---------- Editor ---------- */}
        <section className="stack" style={{ gap: 14 }}>
          {busy && !draft && (
            <div className="card card-pad stack">
              {[0, 1, 2].map((i) => <div key={i} className="stack-sm"><div className="shimmer" style={{ height: 16, width: '70%' }} /><div className="shimmer" style={{ height: 12, width: '45%' }} /><div className="shimmer" style={{ height: 12, width: '55%' }} /></div>)}
            </div>
          )}

          {!draft && !busy && (
            <div className="card" style={{ padding: '56px 32px', textAlign: 'center' }}>
              <div className="icon-tile" style={{ margin: '0 auto 14px', width: 52, height: 52, borderRadius: 16, background: 'var(--brand-100)', color: 'var(--brand-600)' }}><Sparkles size={24} /></div>
              <h2 style={{ fontSize: 20, fontFamily: 'var(--font-serif)', fontWeight: 600 }}>Your assessment will appear here</h2>
              <p className="muted" style={{ maxWidth: 440, margin: '8px auto 20px' }}>Describe what you want, or upload a chapter from your textbook. Gemini writes the questions, answer key and rubric, and you can edit every detail.</p>
              <div className="row wrap" style={{ justifyContent: 'center', gap: 8 }}>
                <button className="btn" onClick={startBlank}><Plus /> Start from scratch</button>
                <button className="btn" onClick={() => setPrompt(EXAMPLES[1])}><BookOpen /> Try a book-based exam</button>
              </div>
            </div>
          )}

          {draft && (
            <>
              <div className="card card-pad stack" style={{ gap: 12 }}>
                <div className="row wrap" style={{ gap: 8 }}>
                  <span className={`badge ${TYPE_META[draft.type].badge}`}>{TYPE_META[draft.type].label}</span>
                  <span className={`badge ${draft.status === 'published' ? 'b-green' : ''}`}>{draft.status === 'published' ? 'Published' : 'Draft'}</span>
                  <span className="badge mono">{draft.questions.length} questions · {total} pts</span>
                  {draft.source?.files?.length > 0 && <span className="badge b-blue"><FileText /> {draft.source.files.length} source file{draft.source.files.length > 1 ? 's' : ''}</span>}
                </div>
                <input className="input" aria-label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ fontSize: 18, fontWeight: 700, height: 44, fontFamily: 'var(--font-serif)' }} />
                <textarea className="textarea" rows={2} aria-label="Instructions" placeholder="Instructions for students…" value={draft.instructions} onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} style={{ minHeight: 60 }} />
              </div>

              {draft.questions.map((q, i) => (
                <div key={q.id} className="q-card" style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                  <div className="row" style={{ alignItems: 'flex-start' }}>
                    <span className="q-num">{i + 1}</span>
                    <textarea className="textarea grow" rows={2} value={q.prompt} placeholder="Question text" onChange={(e) => setQ(q.id, { prompt: e.target.value })} style={{ minHeight: 44 }} aria-label={`Question ${i + 1}`} />
                  </div>
                  <div className="row wrap" style={{ gap: 8, paddingLeft: 36 }}>
                    <select className="select input-sm" style={{ width: 170 }} value={q.type} onChange={(e) => { const t = e.target.value; setQ(q.id, { ...blankQuestion(t), id: q.id, prompt: q.prompt }); }} aria-label="Question type">
                      {Object.entries(Q_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <div className="row" style={{ gap: 6 }}>
                      <input type="number" min={0} className="input input-sm mono" style={{ width: 64 }} value={q.points} onChange={(e) => setQ(q.id, { points: Number(e.target.value) })} aria-label="Points" />
                      <span className="small muted">pts</span>
                    </div>
                    {q.difficulty && <span className="badge">{q.difficulty}</span>}
                    {q.source && <span className="badge b-blue truncate" style={{ maxWidth: 220 }} title={q.source}>{q.source}</span>}
                    <div className="grow" />
                    <button className="btn btn-ghost btn-sm btn-icon btn-danger" onClick={() => removeQ(q.id)} aria-label="Delete question"><Trash2 /></button>
                  </div>

                  <div style={{ paddingLeft: 36 }} className="stack-sm">
                    {(q.type === 'mcq' || q.type === 'tf') && q.options.map((o, oi) => (
                      <div key={oi} className="opt">
                        <button className={`mark-correct ${q.answer === o && o !== '' ? 'on' : ''}`} onClick={() => setQ(q.id, { answer: o })} title="Mark as correct" aria-label="Mark as correct"><Check /></button>
                        {q.type === 'tf' ? <span className="small">{o}</span> : (
                          <>
                            <input className="input input-sm" value={o} placeholder={`Option ${String.fromCharCode(65 + oi)}`} onChange={(e) => {
                              const opts = [...q.options]; const wasAns = q.answer === o; opts[oi] = e.target.value;
                              setQ(q.id, { options: opts, ...(wasAns ? { answer: e.target.value } : {}) });
                            }} />
                            {q.options.length > 2 && <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setQ(q.id, { options: q.options.filter((_, j) => j !== oi) })} aria-label="Remove option"><X /></button>}
                          </>
                        )}
                      </div>
                    ))}
                    {q.type === 'mcq' && q.options.length < 6 && <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setQ(q.id, { options: [...q.options, ''] })}><Plus /> Option</button>}
                    {(q.type === 'fill' || q.type === 'short' || q.type === 'essay') && (
                      <input className="input input-sm" value={q.answer} placeholder={q.type === 'fill' ? 'Correct answer (use / for alternatives)' : 'Model answer'} onChange={(e) => setQ(q.id, { answer: e.target.value })} aria-label="Answer" />
                    )}
                    {(q.type === 'short' || q.type === 'essay') && (
                      <input className="input input-sm" value={q.rubric || ''} placeholder="Rubric for AI grading, e.g. 2 pts definition, 1 pt example" onChange={(e) => setQ(q.id, { rubric: e.target.value })} aria-label="Rubric" />
                    )}
                  </div>
                </div>
              ))}

              <div className="row wrap" style={{ gap: 6 }}>
                <span className="small muted" style={{ marginRight: 4 }}>Add question:</span>
                {Object.entries(Q_TYPES).map(([k, v]) => <button key={k} className="chip" onClick={() => addQ(k)}><Plus size={13} /> {v}</button>)}
              </div>

              <div className="card card-pad row-between wrap" style={{ position: 'sticky', bottom: 16, boxShadow: 'var(--shadow-md)', gap: 10 }}>
                <div className="small muted">{issues > 0 ? <span style={{ color: 'var(--coral-700)' }}>{issues} question{issues > 1 ? 's need' : ' needs'} a prompt or correct answer</span> : 'Looks good. Ready to publish.'}</div>
                <div className="page-actions">
                  <button className="btn btn-sm" onClick={() => printAssessment(draft, false, db.settings.school)} title="Print or save as PDF"><Printer /> Print</button>
                  <button className="btn btn-sm" onClick={() => printAssessment(draft, true, db.settings.school)}><FileText /> Answer key</button>
                  <button className="btn btn-sm" onClick={exportClassera}><Download /> Classera sheet</button>
                  <button className="btn btn-sm" onClick={() => { save(); toast('Draft saved'); }}>Save draft</button>
                  <button className="btn btn-primary btn-sm" id="publish-btn" disabled={issues > 0 || !draft.questions.length} onClick={() => setPublishOpen(true)}><Send /> {draft.status === 'published' ? 'Update & share' : 'Publish & share'}</button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {publishOpen && draft && (
        <PublishModal draft={draft} setDraft={setDraft} onClose={() => setPublishOpen(false)} onPublish={() => {
          const a = save('published');
          setPublishOpen(false);
          setPublished(a);
          toast(`Published to ${a.classIds.map((c) => classMap[c]?.name).join(', ')}`);
        }} />
      )}
      {published && <SharedModal a={published} onClose={() => setPublished(null)} />}
    </>
  );
}

function PublishModal({ draft, setDraft, onClose, onPublish }) {
  const { db } = useStore();
  const groups = [...new Set(db.students.map((s) => s.group))];
  const roster = db.students.filter((s) => draft.classIds.includes(s.classId) && (!draft.groups.length || draft.groups.includes(s.group)));
  const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Modal title="Publish & assign" onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>Cancel</button>
      <button className="btn btn-primary" id="confirm-publish" disabled={!roster.length} onClick={onPublish}><Send /> Assign to {roster.length} students</button>
    </>}>
      <Field label="Assign to classes">
        <div className="row wrap" style={{ gap: 6 }}>
          {db.classes.map((c) => <button key={c.id} className={`chip ${draft.classIds.includes(c.id) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, classIds: toggle(draft.classIds, c.id) })}><span className="dot" style={{ background: c.color }} />{c.name}</button>)}
        </div>
      </Field>
      <Field label="Only these groups (optional)" help="Leave empty to assign to everyone in the selected classes.">
        <div className="row wrap" style={{ gap: 6 }}>
          {groups.map((g) => <button key={g} className={`chip ${draft.groups.includes(g) ? 'on' : ''}`} onClick={() => setDraft({ ...draft, groups: toggle(draft.groups, g) })}>{g}</button>)}
        </div>
      </Field>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label="Due date" htmlFor="pub-due">
          <input id="pub-due" type="datetime-local" className="input" value={toLocalInput(draft.dueDate)} onChange={(e) => setDraft({ ...draft, dueDate: new Date(e.target.value).toISOString() })} />
        </Field>
        <Field label="Time limit (minutes)" htmlFor="pub-dur" help="0 = no limit">
          <input id="pub-dur" type="number" min={0} className="input" value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="banner info small"><BookOpen /> Students get a link to take it online. Objective questions are marked instantly, and open answers go to Auto-correct.</div>
    </Modal>
  );
}

export function SharedModal({ a, onClose }) {
  const { toast, classMap } = useStore();
  const nav = useNavigate();
  const link = shareLink(a.id);
  return (
    <Modal title="Shared with your students 🎉" onClose={onClose} footer={<>
      <button className="btn" onClick={() => window.open(link, '_blank')}><Eye /> Preview as student</button>
      <button className="btn btn-primary" onClick={() => nav(`/messages?assessment=${a.id}`)}><Mail /> Email link to students</button>
    </>}>
      <p className="muted">{a.title} is live for {a.classIds.map((c) => classMap[c]?.name).join(', ')}. Share this link in Classera, WhatsApp or email:</p>
      <div className="row">
        <input className="input mono small" readOnly value={link} onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={() => { navigator.clipboard.writeText(link); toast('Link copied'); }}><Copy /> Copy</button>
      </div>
      <div className="banner small"><Download /> To post it as a Classera assignment, paste the link into a new Classera assignment, or import the “Classera sheet” into your question bank.</div>
    </Modal>
  );
}
