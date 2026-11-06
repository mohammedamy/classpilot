import { useSyncExternalStore } from 'react';

const KEY = 'classpilot:lang';

const modules = import.meta.glob('./ar/*.js', { eager: true });
const AR = Object.assign({}, ...Object.values(modules).map((m) => m.default || m.ar || {}));

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return 'en';
}

function applyDocumentLang(lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

let currentLang = detectInitialLang();
applyDocumentLang(currentLang);

const listeners = new Set();

export function subscribeLang(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLang() {
  return currentLang;
}

export function isRTL() {
  return currentLang === 'ar';
}

export function setLang(lang) {
  const next = lang === 'ar' ? 'ar' : 'en';
  if (next === currentLang) return;
  currentLang = next;
  try { localStorage.setItem(KEY, next); } catch { /* ignore */ }
  applyDocumentLang(next);
  listeners.forEach((fn) => fn(next));
}

export function toggleLang() {
  setLang(currentLang === 'ar' ? 'en' : 'ar');
}

export function useLang() {
  return useSyncExternalStore(subscribeLang, getLang, () => 'en');
}

export function t(key, vars) {
  if (key == null) return '';
  let str = currentLang === 'ar' ? (AR[key] ?? String(key)) : String(key);
  if (vars) {
    str = str.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (_, k) => (vars[k] ?? ''));
  }
  return str;
}
