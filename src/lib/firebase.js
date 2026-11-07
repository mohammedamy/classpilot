import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const FB_STORAGE_KEY = 'classpilot:firebaseConfig';

function toB64Url(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(b64) {
  const pad = b64.replace(/-/g, '+').replace(/_/g, '/');
  return decodeURIComponent(escape(atob(pad + '==='.slice((pad.length + 3) % 4))));
}

export function parseFirebaseSnippet(raw = '') {
  const text = String(raw).trim();
  if (!text) return null;
  const fields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
  try {
    const obj = JSON.parse(text);
    if (obj && obj.apiKey && obj.projectId && obj.appId) {
      const cfg = Object.fromEntries(fields.map((k) => [k, String(obj[k] || '').trim()]));
      if (!cfg.authDomain) cfg.authDomain = `${cfg.projectId}.firebaseapp.com`;
      return cfg;
    }
  } catch { /* fall through to JS snippet parser */ }

  const out = {};
  for (const k of fields) {
    const m = text.match(new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`));
    out[k] = m ? m[1].trim() : '';
  }
  if (!out.authDomain && out.projectId) out.authDomain = `${out.projectId}.firebaseapp.com`;
  if (out.apiKey && out.projectId && out.appId) return out;
  return null;
}

function readUrlFirebaseConfig() {
  if (typeof window === 'undefined') return null;
  try {
    const hashQuery = window.location.hash.includes('?') ? window.location.hash.slice(window.location.hash.indexOf('?')) : '';
    const params = new URLSearchParams(hashQuery || window.location.search);
    const fb = params.get('fb');
    if (!fb) return null;
    const d = JSON.parse(fromB64Url(fb));
    if (d?.k && d?.p && d?.a) {
      return {
        apiKey: d.k,
        authDomain: d.d || `${d.p}.firebaseapp.com`,
        projectId: d.p,
        storageBucket: '',
        messagingSenderId: '',
        appId: d.a,
      };
    }
  } catch { /* ignore malformed param */ }
  return null;
}

function readStoredFirebaseConfig() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(FB_STORAGE_KEY);
    return raw ? parseFirebaseSnippet(raw) : null;
  } catch {
    return null;
  }
}

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const isBuildFirebase = Boolean(envConfig.apiKey && envConfig.projectId && envConfig.appId);
const urlConfig = !isBuildFirebase ? readUrlFirebaseConfig() : null;
const storedConfig = !isBuildFirebase && !urlConfig ? readStoredFirebaseConfig() : null;

export const firebaseConfig = isBuildFirebase
  ? envConfig
  : (urlConfig || storedConfig || envConfig);

export const firebaseSource = isBuildFirebase ? 'env' : urlConfig ? 'url' : storedConfig ? 'local' : 'none';

export const isFirebaseEnabled = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId,
);

export function saveRuntimeFirebaseConfig(snippet) {
  const parsed = parseFirebaseSnippet(snippet);
  if (!parsed) return false;
  localStorage.setItem(FB_STORAGE_KEY, JSON.stringify(parsed));
  window.location.reload();
  return true;
}

export function clearRuntimeFirebaseConfig() {
  localStorage.removeItem(FB_STORAGE_KEY);
  window.location.reload();
}

export function encodeShareFirebaseParam() {
  if (!isFirebaseEnabled || isBuildFirebase) return '';
  const payload = {
    k: firebaseConfig.apiKey,
    d: firebaseConfig.authDomain || `${firebaseConfig.projectId}.firebaseapp.com`,
    p: firebaseConfig.projectId,
    a: firebaseConfig.appId,
  };
  return `?fb=${toB64Url(JSON.stringify(payload))}`;
}

let app = null;
let auth = null;
let firestore = null;

if (isFirebaseEnabled) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);
}

export { app, auth, firestore };

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase is not configured.');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(auth, provider);
  return cred.user;
}

export async function signOutUser() {
  if (!auth) return;
  await signOut(auth);
}

export function onAuthChange(cb) {
  if (!auth) {
    cb(null);
    return () => {};
  }
  return onAuthStateChanged(auth, cb);
}
