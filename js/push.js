// Reminder notifications: permission, local (offline) reminders and the optional push server
import { store } from './store.js';
import * as Sync from './sync.js';
import { DEFAULT_PREFS } from './rules.js';

// Public half of the VAPID key pair. The private half lives only in your Supabase secrets.
export const VAPID_PUBLIC_KEY = 'BMQwsqhuQ51ioJcQZpsQhn1d2g4LTRfVGvrC1puhcBp7y64xnYydwFVRrj9spEyR_8RelDNwDmjzYVjV2TREC1g';
const PUSH_KEY = 'kharcha.push';

export const supported = () => 'Notification' in window && 'serviceWorker' in navigator;
export const pushSupported = () => supported() && 'PushManager' in window;
export const permission = () => (supported() ? Notification.permission : 'unsupported');
export const prefs = () => ({ ...DEFAULT_PREFS, ...(store.get().settings.notify || {}) });
export const serverOn = () => { try { return localStorage.getItem(PUSH_KEY) === 'on'; } catch (e) { return false; } };
const setServer = (on) => { try { on ? localStorage.setItem(PUSH_KEY, 'on') : localStorage.removeItem(PUSH_KEY); } catch (e) { /* ignore */ } };
export const status = { server: serverOn() ? 'on' : 'off', error: '' }; // off | on | missing | error

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
const reg = () => navigator.serviceWorker.ready;

// Copy what the service worker needs into Cache Storage (it cannot read localStorage)
let mirrorT = null;
export function mirror() {
  clearTimeout(mirrorT);
  mirrorT = setTimeout(async () => {
    if (!('caches' in window)) return;
    const s = store.get();
    const pick = (t) => ({ id: t.id, type: t.type, amount: t.amount, date: t.date, categoryId: t.categoryId, personId: t.personId, split: t.split, shares: t.shares });
    const data = {
      txns: s.txns.filter((t) => !t.deleted).map(pick),
      recurring: s.recurring.filter((b) => !b.deleted).map((b) => ({ name: b.name, amount: b.amount, next: b.next, auto: b.auto })),
      people: s.people.filter((p) => !p.deleted).map((p) => ({ id: p.id, name: p.name })),
      categories: s.categories.filter((c) => c.custom).map((c) => ({ id: c.id, name: c.name })),
      budgets: s.budgets.filter((b) => !b.deleted),
      prefs: prefs(), tz: -new Date().getTimezoneOffset(), serverPush: serverOn(),
    };
    try { const c = await caches.open('kharcha-data'); await c.put(new URL('./__data.json', location.href).href, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })); } catch (e) { /* ignore */ }
  }, 800);
}

async function registerPeriodic() {
  try {
    const r = await reg();
    if (!('periodicSync' in r)) return false;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return false;
    await r.periodicSync.register('kharcha-reminders', { minInterval: 60 * 60 * 1000 });
    return true;
  } catch (e) { return false; }
}

// Subscribe this device to the push server (needs sync + the server set up)
export async function connectServer() {
  status.error = '';
  if (!pushSupported() || permission() !== 'granted') { status.server = 'off'; return false; }
  if (!Sync.signedIn()) { status.server = 'off'; status.error = 'Turn on Sync first. The reminder server uses your Supabase project.'; return false; }
  try {
    const r = await reg();
    let sub = await r.pushManager.getSubscription();
    if (!sub) sub = await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    await Sync.upsertPush({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, prefs: prefs(), tz_offset: -new Date().getTimezoneOffset() });
    setServer(true); status.server = 'on'; mirror();
    return true;
  } catch (e) {
    setServer(false);
    status.server = /kharcha_push|relation|schema cache|404/i.test(e.message) ? 'missing' : 'error';
    status.error = status.server === 'missing' ? 'The reminder server isn’t set up yet. Follow the steps below.' : e.message;
    mirror();
    return false;
  }
}

export async function enable() {
  if (!supported()) return 'unsupported';
  const p = await Notification.requestPermission();
  if (p !== 'granted') return p;
  await registerPeriodic();
  if (Sync.signedIn()) await connectServer();
  mirror();
  return p;
}

export async function disable() {
  try {
    const r = await reg();
    const sub = await r.pushManager?.getSubscription();
    if (sub) { await Sync.deletePush(sub.endpoint).catch(() => {}); await sub.unsubscribe(); }
    if ('periodicSync' in r) await r.periodicSync.unregister('kharcha-reminders');
  } catch (e) { /* ignore */ }
  setServer(false); status.server = 'off';
  store.setSetting('notify', { ...prefs(), daily: false, bills: false, weekly: false });
  mirror();
}

// Keep the server copy of your settings and time zone up to date
let prefT = null;
export function pushPrefs() {
  mirror();
  if (!serverOn()) return;
  clearTimeout(prefT);
  prefT = setTimeout(() => connectServer(), 1200);
}

export async function testLocal() {
  const r = await reg();
  await r.showNotification('Kharcha reminders are on', { body: 'This is how your reminders will look.', icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', tag: 'test', data: { url: './#/home' } });
}
export async function testServer() {
  const res = await Sync.invokeFn('kharcha-reminders', { test: true });
  return res;
}

export function init() {
  store.subscribe(() => mirror());
  mirror();
  if (supported() && permission() === 'granted') {
    registerPeriodic();
    if (serverOn() && Sync.signedIn()) connectServer();
  }
}
