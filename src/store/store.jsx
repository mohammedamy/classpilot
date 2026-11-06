import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch } from 'firebase/firestore';
import { buildSeed, DEFAULT_TEMPLATES } from '../lib/seed.js';
import { uid, subId } from '../lib/utils.js';
import { isObjective, gradeObjective, computeTotal } from '../lib/grading.js';
import { firestore, isFirebaseEnabled, onAuthChange } from '../lib/firebase.js';

const KEY = 'classpilot:v1';
const GEMINI_KEY = 'classpilot:geminiKey';
const SUBCOLS = ['classes', 'students', 'assessments', 'sessions', 'templates', 'messages', 'automations'];

const Ctx = createContext(null);

function migrateLocal(data) {
  if (!data || !Array.isArray(data.submissions)) return data;
  const idMap = {};
  for (const s of data.submissions) {
    const canonical = subId(s.assessmentId, s.studentId);
    if (s.id !== canonical) {
      idMap[s.id] = canonical;
      s.id = canonical;
    }
  }
  if (data.unsynced && Object.keys(idMap).length) {
    const nextUnsynced = {};
    for (const [k, v] of Object.entries(data.unsynced)) nextUnsynced[idMap[k] || k] = v;
    data.unsynced = nextUnsynced;
  }
  return data;
}

function getLocalGeminiKey(fallback = '') {
  try {
    return localStorage.getItem(GEMINI_KEY) ?? fallback ?? '';
  } catch {
    return fallback || '';
  }
}

function saveLocalGeminiKey(val) {
  try {
    localStorage.setItem(GEMINI_KEY, val || '');
  } catch { /* ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = migrateLocal(JSON.parse(raw));
      const gk = getLocalGeminiKey(parsed.settings?.geminiKey);
      if (gk) saveLocalGeminiKey(gk);
      parsed.settings = { ...buildSeed().settings, ...parsed.settings, geminiKey: gk };
      return parsed;
    }
  } catch { /* ignore */ }
  const seed = buildSeed();
  seed.settings.geminiKey = getLocalGeminiKey('');
  return seed;
}

function cleanForFirestore(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(cleanForFirestore);
  const out = {};
  for (const [k, val] of Object.entries(v)) {
    if (val !== undefined) out[k] = cleanForFirestore(val);
  }
  return out;
}

function stableJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(',')}}`;
}

function buildPublicDoc(db, a, teacherUid) {
  const classMap = Object.fromEntries((db.classes || []).map((c) => [c.id, c]));
  const rosterStudents = (db.students || []).filter(
    (s) => a.classIds.includes(s.classId) && (!a.groups?.length || a.groups.includes(s.group)),
  );
  const roster = {};
  const rosterNames = {};
  for (const s of rosterStudents) {
    const em = (s.email || '').trim().toLowerCase();
    if (em) {
      roster[em] = s.id;
      rosterNames[em] = s.name;
    }
  }
  return cleanForFirestore({
    id: a.id,
    teacherUid,
    school: db.settings?.school || '',
    title: a.title,
    type: a.type,
    instructions: a.instructions || '',
    durationMin: Number(a.durationMin) || 0,
    dueDate: a.dueDate,
    classNames: (a.classIds || []).map((cid) => classMap[cid]?.name).filter(Boolean),
    questions: (a.questions || []).map((q) => ({
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      options: q.options || [],
      points: Number(q.points) || 0,
    })),
    roster,
    rosterNames,
  });
}

function buildSubDoc(db, s, teacherUid) {
  const st = (db.students || []).find((x) => x.id === s.studentId);
  const id = s.id || subId(s.assessmentId, s.studentId);
  const { teacherUid: _t, ...rest } = s;
  return cleanForFirestore({
    answers: {},
    scores: {},
    total: null,
    feedback: '',
    reviewed: false,
    late: false,
    submittedAt: null,
    ...rest,
    id,
    teacherUid,
    email: (s.email || st?.email || '').trim().toLowerCase(),
    studentName: s.studentName || st?.name || '',
  });
}

function refFromKey(teacherUid, key) {
  const [prefix, id] = key.split(':');
  if (prefix === 'sub') return doc(firestore, 'submissions', id);
  if (prefix === 'pub') return doc(firestore, 'public', id);
  return doc(firestore, 'teachers', teacherUid, prefix, id);
}

/** Auto-score objective questions on incoming student submissions. */
function autoGradeIncoming(assessments, submissions, unsynced) {
  const assessMap = Object.fromEntries((assessments || []).map((a) => [a.id, a]));
  let changed = false;
  const nextUnsynced = { ...(unsynced || {}) };
  const nextSubs = submissions.map((raw) => {
    const a = assessMap[raw.assessmentId];
    if (!a || raw.status !== 'submitted') return raw;
    const stamp = raw.submittedAt || 'initial';
    const needsObj = a.questions.some((q) => isObjective(q) && raw.scores?.[q.id] == null) || (raw.submittedAt && raw.autoGradedAt && raw.autoGradedAt !== stamp);
    const allObj = a.questions.length > 0 && a.questions.every(isObjective);
    if (!needsObj && !allObj) return raw;

    const scores = { ...(raw.scores || {}) };
    for (const q of a.questions) {
      if (isObjective(q)) {
        scores[q.id] = { points: gradeObjective(q, raw.answers?.[q.id]), auto: true, feedback: '' };
      }
    }
    const updated = { ...raw, scores, autoGradedAt: stamp };
    if (allObj) {
      updated.status = 'graded';
      updated.total = computeTotal(a, scores);
      nextUnsynced[updated.id] = true;
    }
    changed = true;
    return updated;
  });
  return { submissions: changed ? nextSubs : submissions, unsynced: nextUnsynced, changed };
}

async function pushDiffToFirestore(teacherUid, db, syncedMap) {
  const desired = new Map();
  const metaData = cleanForFirestore({
    settings: { ...db.settings, geminiKey: '' },
    unsynced: db.unsynced || {},
    lastClasseraSync: db.lastClasseraSync || null,
  });
  desired.set('meta', { ref: doc(firestore, 'teachers', teacherUid), data: metaData });

  for (const col of SUBCOLS) {
    for (const item of db[col] || []) {
      const data = cleanForFirestore(item);
      desired.set(`${col}:${item.id}`, { ref: doc(firestore, 'teachers', teacherUid, col, item.id), data });
    }
  }
  for (const s of db.submissions || []) {
    const data = buildSubDoc(db, s, teacherUid);
    desired.set(`sub:${data.id}`, { ref: doc(firestore, 'submissions', data.id), data });
  }
  for (const a of (db.assessments || []).filter((x) => x.status === 'published')) {
    const data = buildPublicDoc(db, a, teacherUid);
    desired.set(`pub:${a.id}`, { ref: doc(firestore, 'public', a.id), data });
  }

  const ops = [];
  for (const [k, { ref, data }] of desired.entries()) {
    const json = stableJson(data);
    if (syncedMap.get(k) !== json) ops.push({ type: 'set', key: k, ref, data, json });
  }
  for (const k of syncedMap.keys()) {
    if (k !== 'meta' && !desired.has(k)) {
      ops.push({ type: 'del', key: k, ref: refFromKey(teacherUid, k), prev: syncedMap.get(k) });
    }
  }
  if (!ops.length) return false;

  const backup = new Map();
  for (const op of ops) {
    backup.set(op.key, syncedMap.get(op.key));
    if (op.type === 'set') syncedMap.set(op.key, op.json);
    else syncedMap.delete(op.key);
  }

  try {
    for (let i = 0; i < ops.length; i += 400) {
      const batch = writeBatch(firestore);
      for (const op of ops.slice(i, i + 400)) {
        if (op.type === 'set') batch.set(op.ref, op.data);
        else batch.delete(op.ref);
      }
      await batch.commit();
    }
    return true;
  } catch (err) {
    for (const [k, v] of backup.entries()) {
      if (v === undefined) syncedMap.delete(k);
      else syncedMap.set(k, v);
    }
    throw err;
  }
}

export function StoreProvider({ children }) {
  const [db, setDb] = useState(load);
  const [toasts, setToasts] = useState([]);
  const [user, setUser] = useState(isFirebaseEnabled ? undefined : null);
  const [teacherMode, setTeacherMode] = useState(false);
  const [syncState, setSyncState] = useState(isFirebaseEnabled ? 'connecting' : 'local');

  const timer = useRef();
  const dbRef = useRef(db);
  dbRef.current = db;
  const lastSynced = useRef(new Map());
  const cloudReady = useRef(false);

  const toast = useCallback((msg, kind = 'ok') => {
    const id = uid('t');
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  // Observe Firebase Auth state
  useEffect(() => {
    if (!isFirebaseEnabled) return undefined;
    return onAuthChange((u) => setUser(u));
  }, []);

  // Persist Gemini key locally in browser only
  useEffect(() => {
    saveLocalGeminiKey(db.settings?.geminiKey || '');
  }, [db.settings?.geminiKey]);

  // Bootstrap + live sync for signed-in teacher
  useEffect(() => {
    if (!isFirebaseEnabled || !teacherMode || !user) {
      cloudReady.current = false;
      return undefined;
    }

    let cancelled = false;
    const unsubs = [];
    lastSynced.current = new Map();
    cloudReady.current = false;
    setSyncState('syncing');

    (async () => {
      try {
        const metaRef = doc(firestore, 'teachers', user.uid);
        const metaSnap = await getDoc(metaRef);
        if (cancelled) return;

        if (!metaSnap.exists()) {
          // First login with empty cloud account: upload current local workspace
          await pushDiffToFirestore(user.uid, dbRef.current, lastSynced.current);
        } else {
          const [colSnaps, subSnap, pubSnap] = await Promise.all([
            Promise.all(SUBCOLS.map((c) => getDocs(collection(firestore, 'teachers', user.uid, c)))),
            getDocs(query(collection(firestore, 'submissions'), where('teacherUid', '==', user.uid))),
            getDocs(query(collection(firestore, 'public'), where('teacherUid', '==', user.uid))),
          ]);
          if (cancelled) return;

          const meta = metaSnap.data() || {};
          lastSynced.current.set('meta', stableJson(cleanForFirestore({
            settings: { ...meta.settings, geminiKey: '' },
            unsynced: meta.unsynced || {},
            lastClasseraSync: meta.lastClasseraSync || null,
          })));

          const remote = {
            version: 1,
            settings: {
              ...buildSeed().settings,
              ...(meta.settings || {}),
              geminiKey: getLocalGeminiKey(dbRef.current.settings?.geminiKey),
            },
            unsynced: meta.unsynced || {},
            lastClasseraSync: meta.lastClasseraSync || null,
          };

          SUBCOLS.forEach((col, idx) => {
            const items = colSnaps[idx].docs.map((d) => ({ id: d.id, ...d.data() }));
            for (const it of items) lastSynced.current.set(`${col}:${it.id}`, stableJson(cleanForFirestore(it)));
            remote[col] = items;
          });

          const rawSubs = subSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          for (const s of rawSubs) lastSynced.current.set(`sub:${s.id}`, stableJson(cleanForFirestore(s)));

          for (const p of pubSnap.docs) {
            lastSynced.current.set(`pub:${p.id}`, stableJson(cleanForFirestore({ id: p.id, ...p.data() })));
          }

          const graded = autoGradeIncoming(remote.assessments, rawSubs, remote.unsynced);
          remote.submissions = graded.submissions;
          remote.unsynced = graded.unsynced;

          setDb(remote);
        }

        if (cancelled) return;
        cloudReady.current = true;
        setSyncState('synced');

        // Real-time listeners
        unsubs.push(onSnapshot(metaRef, (snap) => {
          if (!snap.exists()) return;
          const m = snap.data() || {};
          const normMeta = cleanForFirestore({
            settings: { ...m.settings, geminiKey: '' },
            unsynced: m.unsynced || {},
            lastClasseraSync: m.lastClasseraSync || null,
          });
          const json = stableJson(normMeta);
          if (lastSynced.current.get('meta') === json) return;
          lastSynced.current.set('meta', json);
          setDb((prev) => ({
            ...prev,
            settings: { ...prev.settings, ...(m.settings || {}), geminiKey: prev.settings.geminiKey },
            unsynced: m.unsynced || {},
            lastClasseraSync: m.lastClasseraSync || null,
          }));
        }));

        for (const col of SUBCOLS) {
          unsubs.push(onSnapshot(collection(firestore, 'teachers', user.uid, col), (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const seen = new Set();
            let diff = false;
            for (const it of items) {
              const k = `${col}:${it.id}`;
              seen.add(k);
              const j = stableJson(cleanForFirestore(it));
              if (lastSynced.current.get(k) !== j) {
                lastSynced.current.set(k, j);
                diff = true;
              }
            }
            for (const k of [...lastSynced.current.keys()]) {
              if (k.startsWith(`${col}:`) && !seen.has(k)) {
                lastSynced.current.delete(k);
                diff = true;
              }
            }
            if (diff) setDb((prev) => ({ ...prev, [col]: items }));
          }));
        }

        unsubs.push(onSnapshot(
          query(collection(firestore, 'submissions'), where('teacherUid', '==', user.uid)),
          (snap) => {
            const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
            const seen = new Set();
            let diff = false;
            for (const s of items) {
              const k = `sub:${s.id}`;
              seen.add(k);
              const j = stableJson(cleanForFirestore(s));
              if (lastSynced.current.get(k) !== j) {
                lastSynced.current.set(k, j);
                diff = true;
              }
            }
            for (const k of [...lastSynced.current.keys()]) {
              if (k.startsWith('sub:') && !seen.has(k)) {
                lastSynced.current.delete(k);
                diff = true;
              }
            }
            if (!diff) return;
            setDb((prev) => {
              const res = autoGradeIncoming(prev.assessments, items, prev.unsynced);
              return { ...prev, submissions: res.submissions, unsynced: res.unsynced };
            });
          },
        ));
      } catch (err) {
        console.error('Firestore sync bootstrap failed:', err);
        if (!cancelled) setSyncState('error');
      }
    })();

    return () => {
      cancelled = true;
      cloudReady.current = false;
      unsubs.forEach((u) => u());
    };
  }, [teacherMode, user]);

  // Persist changes (localStorage always cached; Firestore diff when signed in)
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(db));
      } catch { /* ignore */ }
      if (isFirebaseEnabled && teacherMode && user && cloudReady.current) {
        try {
          setSyncState('syncing');
          await pushDiffToFirestore(user.uid, db, lastSynced.current);
          setSyncState('synced');
        } catch (err) {
          console.error('Firestore write failed:', err);
          setSyncState('error');
        }
      }
    }, isFirebaseEnabled && teacherMode && user ? 250 : 150);
    return () => clearTimeout(timer.current);
  }, [db, teacherMode, user]);

  // Sync across tabs in local mode
  useEffect(() => {
    if (isFirebaseEnabled) return undefined;
    const onStorage = (e) => {
      if (e.key === KEY && e.newValue) setDb(migrateLocal(JSON.parse(e.newValue)));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn) => setDb((prev) => {
    const next = structuredClone(prev);
    fn(next);
    return next;
  }), []);

  const startEmpty = useCallback(() => {
    setDb((prev) => ({
      ...prev,
      classes: [],
      students: [],
      assessments: [],
      submissions: [],
      sessions: [],
      templates: DEFAULT_TEMPLATES,
      messages: [],
      automations: [],
      unsynced: {},
      lastClasseraSync: null,
    }));
  }, []);

  const reset = useCallback(() => {
    localStorage.removeItem(KEY);
    const seed = buildSeed();
    seed.settings.geminiKey = getLocalGeminiKey('');
    setDb(seed);
  }, []);

  const value = useMemo(() => {
    const byId = (arr) => Object.fromEntries((arr || []).map((x) => [x.id, x]));
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
        const pts = a.questions.reduce((tot, q) => tot + Number(q.points || 0), 0);
        if (s.status === 'graded' && s.total != null) { earned += s.total; possible += pts; }
        if (s.status === 'missing' && new Date(a.dueDate) < Date.now()) missing.push(a.title);
      }
      return { average: possible ? Math.round((earned / possible) * 100) : null, missing, count: subs.length };
    };

    return {
      db, update, toast, toasts,
      classMap, studentMap, assessMap, subsFor, rosterFor, studentStats,
      reset, startEmpty,
      user, syncState, setTeacherMode,
    };
  }, [db, update, toast, toasts, reset, startEmpty, user, syncState]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
