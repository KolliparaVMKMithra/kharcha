// Kharcha reminder server — Supabase Edge Function "kharcha-reminders"
// Paste this whole file into: Supabase → Edge Functions → Deploy a new function → Via Editor.
// Needs secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. Runs every 10 minutes via pg_cron.
// @ts-nocheck

// ================= Money rules (same as js/rules.js in the app) =================
// Shared money rules. Used by the app, the service worker (offline reminders)
// and the Supabase reminder server, so all three always agree.
// No imports: this file must run in a page, a service worker and Deno.

const EXT = new Set(['lent', 'repay', 'settle-out', 'got-back', 'settle-in']); // money between people, not spending/income
const BUILTIN_CATS = { food: 'Food', snacks: 'Snacks & tea', travel: 'Travel', shopping: 'Shopping', recharge: 'Recharge & bills', education: 'Books & college', fun: 'Movies & fun', health: 'Health', rent: 'Rent & mess', subs: 'Subscriptions', gifts: 'Gifts', other: 'Other' };
const BUILTIN_PEOPLE = { dad: 'Dad', mom: 'Mom' };
const DEFAULT_PREFS = { daily: true, dailyTime: '21:30', bills: true, weekly: true };

const isSplit = (t) => Array.isArray(t.split) && t.split.length > 0;
const r2 = (n) => Math.round(n * 100) / 100;

// How much of transaction t belongs to `who` ('me' or a person id)
function shareOf(t, who) {
  if (!isSplit(t)) return who === 'me' ? t.amount : 0;
  if (t.shares && typeof t.shares === 'object') return +t.shares[who] || 0;
  return t.split.includes(who) ? t.amount / t.split.length : 0;
}
// What a transaction cost *you*
function spendAmt(t) {
  if (t.type === 'expense') return EXT.has(t.categoryId) ? 0 : shareOf(t, 'me');
  if (t.type === 'tripshare') return shareOf(t, 'me'); // a friend paid, you owe your share
  return 0;
}
const incomeAmt = (t) => (t.type === 'income' && !EXT.has(t.categoryId) ? t.amount : 0);

// Balance with each person. Positive = they owe you, negative = you owe them.
function personNets(txns) {
  const net = {};
  const add = (p, v) => { if (p && v) net[p] = (net[p] || 0) + v; };
  for (const t of txns) {
    if (t.deleted) continue;
    if (t.type === 'expense') {
      if (t.categoryId === 'lent' || t.categoryId === 'repay' || t.categoryId === 'settle-out') add(t.personId, t.amount);
      else if (isSplit(t) && !EXT.has(t.categoryId)) for (const p of t.split) if (p !== 'me') add(p, shareOf(t, p));
    } else if (t.type === 'tripshare') add(t.personId, -shareOf(t, 'me'));
    else if (t.type === 'income' && (t.categoryId === 'loan-in' || t.categoryId === 'got-back' || t.categoryId === 'settle-in')) add(t.personId, -t.amount);
  }
  for (const k of Object.keys(net)) net[k] = Math.abs(net[k]) < 0.5 ? 0 : r2(net[k]);
  return net;
}

// ---------- reminders ----------
function localNow(tzOffsetMin, ms = Date.now()) {
  const d = new Date(ms + tzOffsetMin * 60000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), hm: iso.slice(11, 16), dow: d.getUTCDay() };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

// Which reminders could be due right now (cheap check before loading data)
function dueKeys(prefs, now, lastSent = {}) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) };
  const keys = [];
  if (p.daily && now.hm >= p.dailyTime && lastSent.daily !== now.date) keys.push('daily');
  if (p.bills && now.hm >= '09:00' && lastSent.bills !== now.date) keys.push('bills');
  if (p.weekly && now.dow === 0 && now.hm >= '10:00' && lastSent.weekly !== now.date) keys.push('weekly');
  return keys;
}

/**
 * Returns { messages: [{key,title,body,url,tag}], checked: {key: date} }.
 * `checked` should be merged into lastSent after sending so each reminder runs once a day.
 */
function planReminders({ txns = [], recurring = [], people = [], categories = [], budgets = [], prefs = {}, now, lastSent = {} }) {
  const p = { ...DEFAULT_PREFS, ...(prefs || {}) };
  const messages = [];
  const checked = {};
  const live = txns.filter((t) => !t.deleted);
  const pname = (id) => people.find((x) => x.id === id && !x.deleted)?.name || BUILTIN_PEOPLE[id] || 'Someone';
  const cname = (id) => categories.find((c) => c.id === id)?.name || BUILTIN_CATS[id] || 'Other';
  const keys = dueKeys(p, now, lastSent);

  if (keys.includes('daily')) {
    checked.daily = now.date;
    const today = live.filter((t) => t.date === now.date);
    if (!today.length) {
      messages.push({ key: 'daily', tag: 'daily', title: 'Log today’s spending', body: 'Nothing added today yet. Tap to add it now, or hold + in the app and just say it.', url: './?add=expense#/home' });
    } else {
      const sp = today.reduce((a, t) => a + spendAmt(t), 0);
      const monthSp = live.filter((t) => t.date.startsWith(now.date.slice(0, 7))).reduce((a, t) => a + spendAmt(t), 0);
      const ob = budgets.find((b) => b.id === 'overall' && !b.deleted);
      const line = ob ? (ob.amount >= monthSp ? `${inr(ob.amount - monthSp)} left in this month’s budget.` : `${inr(monthSp - ob.amount)} over this month’s budget.`) : `${inr(monthSp)} spent this month so far.`;
      messages.push({ key: 'daily', tag: 'daily', title: sp ? `Today: ${inr(sp)} spent` : 'Nothing spent today', body: `${line} Anything else to add?`, url: './#/activity' });
    }
  }

  if (keys.includes('bills')) {
    checked.bills = now.date;
    const tomorrow = addDays(now.date, 1);
    const due = recurring.filter((b) => !b.deleted && !b.auto && b.next && b.next <= tomorrow).sort((a, b) => a.next.localeCompare(b.next));
    if (due.length) {
      const when = (b) => (b.next < now.date ? 'is overdue' : b.next === now.date ? 'is due today' : 'is due tomorrow');
      const totalDue = due.reduce((a, b) => a + b.amount, 0);
      messages.push(due.length === 1
        ? { key: 'bills', tag: 'bills', title: `${due[0].name} ${inr(due[0].amount)} ${when(due[0])}`, body: 'Tap to open Bills and mark it paid.', url: './#/bills' }
        : { key: 'bills', tag: 'bills', title: `${due.length} bills due, ${inr(totalDue)}`, body: due.slice(0, 4).map((b) => `${b.name} ${inr(b.amount)}`).join(', '), url: './#/bills' });
    }
  }

  if (keys.includes('weekly')) {
    checked.weekly = now.date;
    const from = addDays(now.date, -6);
    const wk = live.filter((t) => t.date >= from && t.date <= now.date);
    const sp = wk.reduce((a, t) => a + spendAmt(t), 0);
    const byCat = {};
    wk.forEach((t) => { const v = spendAmt(t); if (v) byCat[t.categoryId] = (byCat[t.categoryId] || 0) + v; });
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    const nets = Object.entries(personNets(live));
    const owed = nets.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id, v]) => `${pname(id)} owes you ${inr(v)}.`);
    const owe = nets.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]).slice(0, 2).map(([id, v]) => `You owe ${pname(id)} ${inr(-v)}.`);
    if (sp || owed.length || owe.length) {
      const body = [top ? `Most on ${cname(top[0])} (${inr(top[1])}).` : '', ...owed, ...owe].filter(Boolean).join(' ');
      messages.push({ key: 'weekly', tag: 'weekly', title: `Your week: ${inr(sp)} spent`, body: body || 'Tap to see your insights.', url: './#/insights' });
    }
  }
  return { messages, checked };
}

// ================= Web Push (RFC 8291 aes128gcm + VAPID), no libraries =================
const te = new TextEncoder();
function b64u(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
export async function encryptPayload(p256dh: string, auth: string, payload: Uint8Array, fixed?: { asKeys?: CryptoKeyPair; salt?: Uint8Array }): Promise<Uint8Array> {
  const uaPub = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const as = fixed?.asKeys || (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = fixed?.salt || crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(21 + asPub.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPub.length;
  header.set(asPub, 21);
  return concat(header, ct);
}
export async function vapidHeader(endpoint: string, pub: string, priv: string, subject: string): Promise<string> {
  const u = new URL(endpoint);
  const h = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64u(te.encode(JSON.stringify({ aud: `${u.protocol}//${u.host}`, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const p = unb64u(pub);
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), d: priv, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(`${h}.${c}`)));
  return `vapid t=${h}.${c}.${b64u(sig)}, k=${pub}`;
}

// ================= Server =================
const env = (k: string) => (globalThis as any).Deno?.env.get(k) || '';
const SB_URL = env('SUPABASE_URL');
const KEY = env('SUPABASE_SERVICE_ROLE_KEY') || (() => { try { return JSON.parse(env('SUPABASE_SECRET_KEYS')).default; } catch { return ''; } })();
const ANON = env('SUPABASE_ANON_KEY') || KEY;
const VAPID = { pub: env('VAPID_PUBLIC_KEY'), priv: env('VAPID_PRIVATE_KEY'), sub: env('VAPID_SUBJECT') || 'mailto:kharcha@example.com' };
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

function dbHeaders(extra: Record<string, string> = {}) {
  const h: Record<string, string> = { apikey: KEY, 'Content-Type': 'application/json', ...extra };
  if (!KEY.startsWith('sb_')) h.Authorization = `Bearer ${KEY}`;
  return h;
}
async function db(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const r = await fetch(SB_URL + path, { ...init, headers: dbHeaders(init.headers || {}) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${t}`);
  return t ? JSON.parse(t) : null;
}
async function userRecords(uid: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = await db(`/rest/v1/kharcha_records?user_id=eq.${uid}&kind=in.(txns,recurring,people,categories,budgets)&select=kind,data`, { headers: { Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } });
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  const by = (k: string) => out.filter((r) => r.kind === k).map((r) => r.data).filter((d) => !d.deleted);
  return { txns: by('txns'), recurring: by('recurring'), people: by('people'), categories: by('categories'), budgets: by('budgets') };
}
async function send(sub: any, msg: unknown): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, te.encode(JSON.stringify(msg)));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { Authorization: await vapidHeader(sub.endpoint, VAPID.pub, VAPID.priv, VAPID.sub), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
    body,
  });
  if (r.status === 404 || r.status === 410) await db(`/rest/v1/kharcha_push?endpoint=eq.${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => {});
  return r.status;
}

(globalThis as any).Deno?.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (!VAPID.pub || !VAPID.priv) return json({ error: 'Add the VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets first' }, 500);
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body */ }

  // A test sent from the app: only to the signed-in user's own devices
  if (body.test) {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const ur = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${token}` } });
    if (!ur.ok) return json({ error: 'Sign in to sync in the app first' }, 401);
    const user = await ur.json();
    const subs = await db(`/rest/v1/kharcha_push?user_id=eq.${user.id}&select=*`);
    let sent = 0;
    for (const s of subs) if ((await send(s, { title: 'Kharcha reminders work 🎉', body: 'Your reminders will arrive here on time.', url: './#/reminders', tag: 'test' })) < 300) sent++;
    return json({ sent, devices: subs.length });
  }

  // Scheduled run (every 10 minutes from pg_cron)
  const subs = await db('/rest/v1/kharcha_push?select=*');
  const cache = new Map<string, any>();
  let sent = 0;
  for (const s of subs) {
    const now = localNow(s.tz_offset ?? 330);
    const last = s.last_sent || {};
    if (!dueKeys(s.prefs, now, last).length) continue;
    try {
      if (!cache.has(s.user_id)) cache.set(s.user_id, await userRecords(s.user_id));
      const { messages, checked } = planReminders({ ...cache.get(s.user_id), prefs: s.prefs, now, lastSent: last });
      for (const m of messages) if ((await send(s, m)) < 300) sent++;
      await db(`/rest/v1/kharcha_push?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: 'PATCH', body: JSON.stringify({ last_sent: { ...last, ...checked } }) });
    } catch (e) { console.error('reminder failed', (e as Error).message); }
  }
  return json({ devices: subs.length, sent });
});