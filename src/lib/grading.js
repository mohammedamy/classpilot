import { gradeOpenEnded } from './gemini.js';

export const isObjective = (q) => ['mcq', 'tf', 'fill'].includes(q.type);

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ');

export function gradeObjective(q, ans) {
  if (ans == null || ans === '') return 0;
  if (q.type === 'fill') {
    // Accept any of several answers separated by "/" or "|"
    const ok = String(q.answer).split(/[|/]/).map(norm);
    return ok.includes(norm(ans)) ? q.points : 0;
  }
  return norm(ans) === norm(q.answer) ? q.points : 0;
}

export function computeTotal(assessment, scores) {
  return assessment.questions.reduce((t, q) => t + (scores[q.id]?.points ?? 0), 0);
}

export function isFullyScored(assessment, scores) {
  return assessment.questions.every((q) => scores[q.id] != null);
}

/**
 * Auto-correct a batch of submissions. Objective questions are scored locally;
 * open-ended ones are sent to Gemini (or the demo grader) in a single batch.
 * Returns a map submissionId -> { scores, total }.
 */
export async function autoCorrect(settings, assessment, submissions) {
  const result = {};
  const items = [];
  for (const sub of submissions) {
    const scores = { ...sub.scores };
    for (const q of assessment.questions) {
      if (isObjective(q)) scores[q.id] = { points: gradeObjective(q, sub.answers[q.id]), auto: true, feedback: '' };
      else if (!scores[q.id] || scores[q.id].auto) items.push({ key: `${sub.id}::${q.id}`, question: q, answer: sub.answers[q.id] });
    }
    result[sub.id] = { scores };
  }
  // Batch in chunks to keep requests small.
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25);
    const graded = await gradeOpenEnded(settings, { assessment, items: chunk });
    for (const it of chunk) {
      const [sid, qid] = it.key.split('::');
      const g = graded[it.key];
      if (g) result[sid].scores[qid] = { points: g.points, feedback: g.feedback, confidence: g.confidence, auto: true };
    }
  }
  for (const sid of Object.keys(result)) result[sid].total = computeTotal(assessment, result[sid].scores);
  return result;
}
