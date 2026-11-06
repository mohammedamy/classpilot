import { getLang, t } from '../i18n/index.js';

export const uid = (p = 'id') => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
export const subId = (assessmentId, studentId) => `${assessmentId}__${studentId}`;

export const DAY = 86400000;

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

const AV_COLORS = ['hsl(165 50% 36%)', 'hsl(205 60% 44%)', 'hsl(30 75% 48%)', 'hsl(6 60% 52%)', 'hsl(222 35% 38%)', 'hsl(185 50% 36%)', 'hsl(340 45% 48%)', 'hsl(45 70% 42%)'];
export function colorFor(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

const dateLocale = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-US');

export function fmtDate(d, opts = { month: 'short', day: 'numeric' }) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString(dateLocale(), opts);
}
export function fmtTime(d) {
  return new Date(d).toLocaleTimeString(dateLocale(), { hour: 'numeric', minute: '2-digit' });
}
export function fmtDateTime(d) {
  return `${fmtDate(d, { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtTime(d)}`;
}
export function relDays(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(Date.now())) / DAY);
  if (diff === 0) return t('Today');
  if (diff === 1) return t('Tomorrow');
  if (diff === -1) return t('Yesterday');
  if (diff > 1 && diff < 7) return t('In {n} days', { n: diff });
  if (diff < -1 && diff > -7) return t('{n} days ago', { n: -diff });
  return fmtDate(d);
}
export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}
export function startOfWeek(d) {
  const x = new Date(startOfDay(d));
  x.setDate(x.getDate() - x.getDay()); // Sunday-first (common in Classera regions)
  return x.getTime();
}
export function toLocalInput(d) {
  const x = new Date(d);
  const pad = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}T${pad(x.getHours())}:${pad(x.getMinutes())}`;
}

export function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 100);
}
export function letter(p) {
  if (p == null || Number.isNaN(p)) return '—';
  if (p >= 90) return 'A';
  if (p >= 80) return 'B';
  if (p >= 70) return 'C';
  if (p >= 60) return 'D';
  return 'F';
}

export const TYPE_META = {
  quiz: { get label() { return t('Quiz'); }, badge: 'b-blue' },
  exam: { get label() { return t('Exam'); }, badge: 'b-dark' },
  homework: { get label() { return t('Homework'); }, badge: 'b-green' },
  worksheet: { get label() { return t('Worksheet'); }, badge: 'b-amber' },
  project: { get label() { return t('Project'); }, badge: 'b-red' },
};

export const Q_TYPES = {
  get mcq() { return t('Multiple choice'); },
  get tf() { return t('True / False'); },
  get short() { return t('Short answer'); },
  get fill() { return t('Fill in the blank'); },
  get essay() { return t('Essay'); },
};

export function totalPoints(questions = []) {
  return questions.reduce((s, q) => s + (Number(q.points) || 0), 0);
}

export function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
export function fileToText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsText(file);
  });
}

export function fillTemplate(tpl, vars) {
  return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] ?? ''));
}
