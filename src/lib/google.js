// Google Workspace integration (Calendar + Meet + Gmail) using Google Identity Services.
// Requires an OAuth Client ID (Web application) with this app's origin authorised.
import { fillTemplate } from './utils.js';
import { t } from '../i18n/index.js';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ');

let token = null;
let tokenExp = 0;
let gisPromise = null;

function loadGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = res;
      s.onerror = () => rej(new Error(t('Could not load Google sign-in.')));
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

export const isGoogleConnected = () => Boolean(token && Date.now() < tokenExp);

export async function connectGoogle(clientId) {
  if (!clientId) throw new Error(t('Add your Google OAuth Client ID in Settings first.'));
  await loadGIS();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (resp) => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        token = resp.access_token;
        tokenExp = Date.now() + (Number(resp.expires_in) - 60) * 1000;
        resolve(true);
      },
      error_callback: (e) => reject(new Error(e?.message || t('Google sign-in was cancelled.'))),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

async function ensureToken(clientId) {
  if (!isGoogleConnected()) await connectGoogle(clientId);
  return token;
}

async function gfetch(clientId, url, init = {}) {
  const tk = await ensureToken(clientId);
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || t('Google API error ({status})', { status: res.status }));
  return data;
}

/** Create a Calendar event with an auto-generated Google Meet link. */
export async function createMeetEvent(clientId, { title, description, start, durationMin, attendees = [], weekly = false }) {
  const startD = new Date(start);
  const endD = new Date(startD.getTime() + durationMin * 60000);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const body = {
    summary: title,
    description,
    start: { dateTime: startD.toISOString(), timeZone: tz },
    end: { dateTime: endD.toISOString(), timeZone: tz },
    attendees: attendees.map((email) => ({ email })),
    conferenceData: { createRequest: { requestId: `cp-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    ...(weekly ? { recurrence: ['RRULE:FREQ=WEEKLY'] } : {}),
  };
  const ev = await gfetch(clientId, 'https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all', { method: 'POST', body: JSON.stringify(body) });
  const link = ev.hangoutLink || ev.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri || '';
  return { eventId: ev.id, link, htmlLink: ev.htmlLink };
}

export async function deleteCalendarEvent(clientId, eventId) {
  const t = await ensureToken(clientId);
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
}

function b64url(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const encodeHeader = (s) => `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;

/** Send one plain-text email through the teacher's Gmail account. */
export async function sendGmail(clientId, { to, subject, body, cc }) {
  const raw = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ].filter((x) => x !== null).join('\r\n');
  return gfetch(clientId, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', body: JSON.stringify({ raw: b64url(raw) }) });
}

/** Send personalised messages; returns { sent, failed }. */
export async function sendBulk(clientId, messages, onProgress) {
  let sent = 0, failed = 0;
  for (const m of messages) {
    try { await sendGmail(clientId, m); sent++; } catch (e) { failed++; console.warn(e); }
    onProgress?.(sent + failed, messages.length);
  }
  return { sent, failed };
}

export { fillTemplate };

/** No-OAuth fallback: open a pre-filled Google Calendar event (teacher clicks "Add Google Meet"). */
export function calendarTemplateUrl({ title, description, start, durationMin, weekly }) {
  const f = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const end = new Date(new Date(start).getTime() + durationMin * 60000);
  const p = new URLSearchParams({ action: 'TEMPLATE', text: title, details: description || '', dates: `${f(start)}/${f(end)}` });
  if (weekly) p.set('recur', 'RRULE:FREQ=WEEKLY');
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Make a pseudo Meet code for demo mode. */
export function demoMeetLink() {
  const r = (n) => Array.from({ length: n }, () => 'abcdefghijkmnopqrstuvwxyz'[Math.floor(Math.random() * 25)]).join('');
  return `https://meet.google.com/${r(3)}-${r(4)}-${r(3)}`;
}
