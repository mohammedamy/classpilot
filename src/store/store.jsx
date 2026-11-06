import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeed } from '../lib/seed.js';
import { uid } from '../lib/utils.js';

const KEY = 'classpilot:v1';
const Ctx = createContext(null);

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return buildSeed();
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [toasts, setToasts] = useState([]);
  const timer = useRef();

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => localStorage.setItem(KEY, JSON.stringify(db)), 150);
  }, [db]);

  // Sync across tabs (e.g. the student "take quiz" tab submitting work).
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY && e.newValue) setDb(JSON.parse(e.newValue)); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn) => setDb((prev) => {
    const next = structuredClone(prev);
    fn(next);
    return next;
  }), []);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = uid('t');
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const value = useMemo(() => {
    const byId = (arr) => Object.fromEntries(arr.map((x) => [x.id, x]));
    const classMap = byId(db.classes);
    const studentMap = byId(db.students);
    const assessMap = byId(db.assessments);

    const subsFor = (assessmentId) => db.submissions.filter((s) => s.assessmentId === assessmentId);
    const rosterFor = (a) => db.students.filter((s) => a.classIds.includes(s.classId) && (!a.groups?.length || a.groups.includes(s.group)));

    const studentStats = (studentId) => {
      const subs = db.submissions.filter((s) => s.studentId === studentId);
      let earned = 0, possible = 0;
      const missing = [];
      for (const s of subs) {
        const a = assessMap[s.assessmentId];
        if (!a) continue;
        const pts = a.questions.reduce((t, q) => t + Number(q.points || 0), 0);
        if (s.status === 'graded' && s.total != null) { earned += s.total; possible += pts; }
        if (s.status === 'missing' && new Date(a.dueDate) < Date.now()) missing.push(a.title);
      }
      return { average: possible ? Math.round((earned / possible) * 100) : null, missing, count: subs.length };
    };

    return {
      db, update, toast, toasts,
      classMap, studentMap, assessMap, subsFor, rosterFor, studentStats,
      reset: () => { localStorage.removeItem(KEY); setDb(buildSeed()); },
    };
  }, [db, update, toast, toasts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
