// Gemini client (browser → Gemini API directly with the teacher's own key).
// Falls back to a local "demo mode" generator when no key is configured.
import { fileToBase64, fileToText, uid } from './utils.js';
import { t } from '../i18n/index.js';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', get label() { return t('Gemini 3.8 Flash — best balance (recommended)'); } },
  { id: 'gemini-3.5-flash-lite', get label() { return t('Gemini 3.5 Flash-Lite — fastest, lowest cost'); } },
  { id: 'gemini-4-argon', get label() { return t('Gemini 4 Argon — deepest reasoning'); } },
];

const INLINE_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'text/plain', 'text/markdown', 'text/csv', 'text/html'];

/** Convert uploaded File objects into Gemini parts. */
export async function filesToParts(files = []) {
  const parts = [];
  for (const f of files) {
    const type = f.type || (f.name.endsWith('.md') ? 'text/markdown' : 'text/plain');
    if (type.startsWith('text/') || /\.(txt|md|csv)$/i.test(f.name)) {
      parts.push({ text: `--- Source document: ${f.name} ---\n${await fileToText(f)}` });
    } else if (INLINE_TYPES.includes(type)) {
      parts.push({ inline_data: { mime_type: type, data: await fileToBase64(f) } });
    } else {
      throw new Error(t('"{name}" isn’t supported. Upload PDF, image, or text files (for Word/PowerPoint, export to PDF first).', { name: f.name }));
    }
  }
  return parts;
}

async function callGemini({ key, model, system, parts, json = true, thinking }) {
  const body = {
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { ...(json ? { responseMimeType: 'application/json' } : {}), ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}) },
  };
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || t('Gemini request failed ({status})', { status: res.status }));
  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  if (!json) return text;
  try {
    return JSON.parse(text.replace(/^```json\s*|```$/g, ''));
  } catch {
    throw new Error(t('Gemini returned an unexpected format. Please try again.'));
  }
}

export const hasKey = (settings) => Boolean(settings?.geminiKey?.trim());

/* ------------------------------------------------------------------ */
/* 1. Generate an assessment from a prompt and/or uploaded documents    */
/* ------------------------------------------------------------------ */
export async function generateAssessment(settings, opts) {
  const { prompt, type, count, difficulty, qtypes, grade, subject, language, files = [] } = opts;
  if (!hasKey(settings)) return demoAssessment(opts);

  const system = `You are an expert ${subject || ''} teacher and assessment designer for ${grade || 'school'} students.
Create a high-quality ${type} that is age-appropriate, curriculum-aligned, and unambiguous.
When source documents (textbook chapters, notes, worksheets) are provided, base every question strictly on their content and cite the page/section in "source" when possible.
Write all student-facing text in ${language || 'English'}.
Return ONLY JSON with this shape:
{"title": string, "instructions": string, "questions": [{"type": "mcq"|"tf"|"short"|"fill"|"essay", "prompt": string, "options": string[] (mcq: 4 options; tf: ["True","False"]; others: []), "answer": string (for mcq/tf must exactly equal one option; for fill the missing word(s); for short/essay a model answer), "rubric": string (grading guidance for short/essay; "" otherwise), "points": number, "difficulty": "easy"|"medium"|"hard", "source": string}]}`;

  const ask = `Teacher request: ${prompt || '(no extra instructions — use the documents)'}
Assessment type: ${type}
Number of questions: ${count}
Difficulty: ${difficulty}
Allowed question types: ${qtypes.join(', ')}
${files.length ? `Base the questions on the ${files.length} attached document(s).` : ''}`;

  const parts = [{ text: ask }, ...(await filesToParts(files))];
  const out = await callGemini({ key: settings.geminiKey, model: settings.geminiModel, system, parts, thinking: 'medium' });
  return normalize(out);
}

function normalize(out) {
  const questions = (out.questions || []).map((q) => {
    const type = ['mcq', 'tf', 'short', 'fill', 'essay'].includes(q.type) ? q.type : 'short';
    let options = Array.isArray(q.options) ? q.options.map(String) : [];
    if (type === 'tf') options = ['True', 'False'];
    let answer = String(q.answer ?? '');
    if (type === 'mcq' && options.length && !options.includes(answer)) {
      answer = options.find((o) => o.toLowerCase().trim() === answer.toLowerCase().trim()) || options[0];
    }
    return { id: uid('q'), type, prompt: String(q.prompt || ''), options, answer, rubric: q.rubric || '', points: Number(q.points) || (type === 'essay' ? 6 : type === 'short' ? 3 : 1), difficulty: q.difficulty || 'medium', source: q.source || '' };
  });
  return { title: out.title || 'Untitled assessment', instructions: out.instructions || '', questions };
}

/* ------------------------------------------------------------------ */
/* 2. Auto-correct open-ended answers                                   */
/* ------------------------------------------------------------------ */
export async function gradeOpenEnded(settings, { assessment, items }) {
  // items: [{ key, question, answer }]
  if (!items.length) return {};
  if (!hasKey(settings)) return demoGrade(items);
  const system = `You are a fair, consistent teacher grading student work for "${assessment.title}".
For each item, award points between 0 and the maximum using the rubric and model answer. Give partial credit for partially correct reasoning. Ignore minor spelling mistakes unless spelling is being assessed.
Feedback must be 1–2 encouraging, specific sentences addressed to the student.
Return ONLY JSON: {"results": [{"key": string, "points": number, "feedback": string, "confidence": "high"|"medium"|"low"}]}`;
  const payload = items.map((it) => ({
    key: it.key, question: it.question.prompt, max_points: it.question.points,
    model_answer: it.question.answer, rubric: it.question.rubric || '', student_answer: it.answer || '(blank)',
  }));
  const out = await callGemini({ key: settings.geminiKey, model: settings.geminiModel, system, parts: [{ text: JSON.stringify(payload) }] });
  const map = {};
  for (const r of out.results || []) {
    const it = items.find((i) => i.key === r.key);
    if (!it) continue;
    map[r.key] = { points: Math.max(0, Math.min(it.question.points, Number(r.points) || 0)), feedback: r.feedback || '', confidence: r.confidence || 'medium' };
  }
  return map;
}

/* ------------------------------------------------------------------ */
/* 3. Draft an email                                                    */
/* ------------------------------------------------------------------ */
export async function draftEmail(settings, { purpose, audience, className, teacherName }) {
  if (!hasKey(settings)) {
    return {
      subject: `${className ? className + ': ' : ''}${purpose.split(/[.!?]/)[0].slice(0, 60)}`,
      body: `Dear {{${audience === 'students' ? 'studentName' : 'parentName'}}},\n\n${purpose}\n\n${audience === 'parents' ? "Here is a quick snapshot of {{studentName}}'s progress:\n• Current average: {{average}}\n• Missing work: {{missing}}\n\n" : ''}Thank you,\n${teacherName}`,
    };
  }
  const system = `You write warm, concise, professional school emails for a teacher named ${teacherName}.
You may use these merge fields which will be replaced per recipient: {{studentName}}, {{parentName}}, {{className}}, {{average}}, {{missing}}, {{upcoming}}, {{teacherName}}.
Return ONLY JSON: {"subject": string, "body": string}. Plain text body, no markdown.`;
  return callGemini({ key: settings.geminiKey, model: settings.geminiModel, system, parts: [{ text: `Audience: ${audience}. Class: ${className || 'several classes'}. Purpose: ${purpose}` }] });
}

export async function testKey(settings) {
  const out = await callGemini({ key: settings.geminiKey, model: settings.geminiModel, system: 'Reply with JSON {"ok": true}.', parts: [{ text: 'ping' }] });
  return out?.ok === true;
}

/* ------------------------------------------------------------------ */
/* Demo-mode fallbacks (no API key)                                     */
/* ------------------------------------------------------------------ */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function demoAssessment({ prompt, type, count, qtypes, files = [] }) {
  await wait(1400);
  let corpus = prompt || '';
  for (const f of files) if ((f.type || '').startsWith('text/') || /\.(txt|md)$/i.test(f.name)) corpus += ' ' + (await fileToText(f));
  const onMatch = (prompt || '').match(/\b(?:on|about|covering)\s+(?:the\s+)?(.+?)(?:[:.,;(]|\s+for\s+|\s+with\s+|$)/i);
  const topic = (onMatch?.[1] || files[0]?.name?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || prompt || 'the unit').replace(/^(create|make|generate|write)\s+(an?\s+)?/i, '').trim().slice(0, 60);
  const stop = new Set('the a an and or of to in on for with is are was were be by as at from that this it its into about which what when how why their there these those your you our we they has have had not but can will quiz exam test grade questions question create make generate students student'.split(' '));
  const terms = [...new Set((corpus.toLowerCase().match(/[a-z][a-z-]{4,}/g) || []).filter((w) => !stop.has(w)))].slice(0, 30);
  const term = (i) => terms.length ? terms[i % terms.length] : ['concept', 'process', 'example', 'definition', 'evidence'][i % 5];
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  const makers = {
    mcq: (i) => ({ type: 'mcq', prompt: `Which statement best describes "${term(i)}" in the context of ${topic}?`, options: [`It is the key idea that explains ${term(i + 1)}`, `It has no connection to ${topic}`, `It only applies outside the classroom`, `It is the opposite of ${term(i + 2)}`], answer: `It is the key idea that explains ${term(i + 1)}`, points: 2, rubric: '' }),
    tf: (i) => ({ type: 'tf', prompt: `${cap(term(i))} is an important part of ${topic}.`, options: ['True', 'False'], answer: 'True', points: 1, rubric: '' }),
    fill: (i) => ({ type: 'fill', prompt: `In ${topic}, the term for ________ is "${term(i)}".`, options: [], answer: term(i), points: 2, rubric: '' }),
    short: (i) => ({ type: 'short', prompt: `In two or three sentences, explain how ${term(i)} relates to ${term(i + 3)}.`, options: [], answer: `A complete answer defines ${term(i)}, defines ${term(i + 3)}, and explains the link between them with an example.`, rubric: '1 pt definition, 1 pt link, 1 pt example.', points: 3 }),
    essay: (i) => ({ type: 'essay', prompt: `Write a short paragraph evaluating the importance of ${term(i)} in ${topic}. Use at least one example.`, options: [], answer: 'Clear claim, supporting example, and a concluding sentence.', rubric: 'Claim (2), evidence/example (3), clarity & organisation (3).', points: 8 }),
  };
  const allowed = qtypes.length ? qtypes : ['mcq'];
  const questions = Array.from({ length: count }, (_, i) => ({ id: uid('q'), difficulty: 'medium', source: files[0]?.name || '', ...makers[allowed[i % allowed.length]](i) }));
  const label = { quiz: 'Quiz', exam: 'Exam', homework: 'Homework', worksheet: 'Worksheet', project: 'Project' }[type] || 'Quiz';
  return { title: `${cap(topic)} — ${label}`, instructions: type === 'exam' ? 'Read every question carefully. Show your reasoning on written answers.' : 'Answer all questions.', questions, demo: true };
}

async function demoGrade(items) {
  await wait(900);
  const out = {};
  for (const it of items) {
    const words = (s) => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
    const model = words(it.question.answer), ans = words(it.answer);
    const overlap = model.size ? [...model].filter((w) => ans.has(w)).length / model.size : 0;
    const ratio = Math.min(1, overlap * 1.6 + (ans.size > 6 ? 0.15 : 0));
    const points = Math.round(it.question.points * ratio * 2) / 2;
    out[it.key] = {
      points,
      feedback: ratio > 0.75 ? 'Excellent — accurate and well explained.' : ratio > 0.4 ? 'Good start. Add more specific detail and key vocabulary.' : 'This misses the key idea. Review the lesson notes and try again.',
      confidence: ratio > 0.75 || ratio < 0.2 ? 'high' : 'medium',
    };
  }
  return out;
}
