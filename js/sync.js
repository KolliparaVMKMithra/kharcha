// Cloud sync with Supabase (REST, no SDK). Last-write-wins per record.
import { store } from './store.js';

const CFG = 'kharcha.sync';
export const SETUP_SQL = `create table if not exists public.kharcha_records (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  id text not null,
  kind text not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (user_id, id)
);
alter table public.kharcha_records enable row level security;
create policy "own rows" on public.kharcha_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists kharcha_updated on public.kharcha_records (user_id, updated_at);`;

let cfg = loadCfg();
let timer = null;
let running = null;
const subs = new Set();
export const status = { state: 'off', message: '' }; // off | idle | syncing | error

function loadCfg() { try { return JSON.parse(localStorage.getItem(CFG) || '{}'); } catch (e) { return {}; } }
function saveCfg() { try { localStorage.setItem(CFG, JSON.stringify(cfg)); } catch (e) { /* ignore */ } }
function setStatus(state, message = '') { status.state = state; status.message = message; subs.forEach((f) => f(status)); }
export const onStatus = (f) => { subs.add(f); return () => subs.delete(f); };
export const config = () => ({ url: cfg.url || '', key: cfg.key || '', email: cfg.session?.user?.email || '', signedIn: !!cfg.session, lastSync: cfg.lastSync || null });

const base = () => (cfg.url || '').replace(/\/+$/, '');
async function call(path, { method = 'GET', body, auth = true, headers = {} } = {}) {
  const h = { apikey: cfg.key, 'Content-Type': 'application/json', ...headers };
  if (auth) { await ensureToken(); h.Authorization = `Bearer ${cfg.session.access_token}`; }
  const r = await fetch(base() + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const msg = (data && (data.msg || data.message || data.error_description || data.error)) || `Request failed (${r.status})`;
    const err = new Error(msg); err.status = r.status; throw err;
  }
  return data;
}
function keepSession(d) {
  cfg.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000, user: { id: d.user?.id, email: d.user?.email } };
  saveCfg();
}
async function ensureToken() {
  if (!cfg.session) throw new Error('Not signed in');
  if (cfg.session.expires_at - Date.now() > 60e3) return;
  const d = await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: cfg.session.refresh_token } });
  keepSession(d);
}

export function setProject(url, key) {
  url = url.trim(); key = key.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(url)) throw new Error('The project URL should look like https://abcd1234.supabase.co');
  if (key.length < 20) throw new Error('Paste the full anon public key from Project Settings → API');
  cfg.url = url; cfg.key = key; saveCfg();
}
export async function signUp(email, password) {
  const d = await call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } });
  if (d.access_token) { keepSession(d); return { signedIn: true }; }
  return { signedIn: false, confirm: true };
}
export async function signIn(email, password) {
  const d = await call('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email, password } });
  keepSession(d);
  cfg.lastSync = null; saveCfg();
}
export function signOut() { delete cfg.session; cfg.lastSync = null; saveCfg(); setStatus('off'); }
export const signedIn = () => !!(cfg.session && cfg.url && cfg.key);

async function pullAll(since) {
  const out = [];
  const step = 1000;
  for (let from = 0; ; from += step) {
    const q = `/rest/v1/kharcha_records?select=kind,data,updated_at&order=updated_at.asc${since ? `&updated_at=gt.${encodeURIComponent(since)}` : ''}`;
    const rows = await call(q, { headers: { Range: `${from}-${from + step - 1}`, 'Range-Unit': 'items' } });
    out.push(...rows);
    if (rows.length < step) break;
  }
  return out;
}
async function push(records) {
  const uidv = cfg.session.user.id;
  for (let i = 0; i < records.length; i += 400) {
    const batch = records.slice(i, i + 400).map(({ kind, data }) => ({ user_id: uidv, id: `${kind}:${data.id}`, kind, data, updated_at: data.updatedAt || '1970-01-01T00:00:00.000Z' }));
    await call('/rest/v1/kharcha_records?on_conflict=user_id,id', { method: 'POST', body: batch, headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
  }
}

export async function syncNow() {
  if (!signedIn()) return;
  if (running) return running;
  running = (async () => {
    setStatus('syncing');
    try {
      const started = new Date(Date.now() - 2 * 60e3).toISOString(); // small margin for clock drift
      const since = cfg.lastSync;
      const remote = await pullAll(since);
      store.mergeRemote(remote.map((r) => ({ kind: r.kind, data: r.data })));
      const local = store.allRecords().filter(({ data }) => !since || (data.updatedAt || '') > since);
      // skip untouched defaults on first sync so they never overwrite real data
      const toPush = local.filter(({ data }) => (data.updatedAt || '') > '1970-01-02');
      if (toPush.length) await push(toPush);
      cfg.lastSync = started; saveCfg();
      setStatus('idle', `Synced ${new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`);
    } catch (e) {
      setStatus('error', navigator.onLine === false ? 'Offline. Will sync when you are back online.' : e.message);
    } finally { running = null; }
  })();
  return running;
}

// ---------- reminder server (push) ----------
export const PUSH_SQL = `create table if not exists public.kharcha_push (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}',
  tz_offset int not null default 330,
  last_sent jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.kharcha_push enable row level security;
create policy "own push" on public.kharcha_push
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('kharcha-reminders', '*/10 * * * *', $$
  select net.http_post(
    url := '__URL__/functions/v1/kharcha-reminders',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  );
$$);`;
export const pushSql = () => PUSH_SQL.replace('__URL__', base() || 'https://YOUR-PROJECT.supabase.co');
export async function upsertPush(row) {
  if (!signedIn()) throw new Error('Turn on sync first');
  await call('/rest/v1/kharcha_push?on_conflict=endpoint', { method: 'POST', body: [{ ...row, user_id: cfg.session.user.id, updated_at: new Date().toISOString() }], headers: { Prefer: 'resolution=merge-duplicates,return=minimal' } });
}
export async function deletePush(endpoint) {
  if (!signedIn()) return;
  await call(`/rest/v1/kharcha_push?endpoint=eq.${encodeURIComponent(endpoint)}`, { method: 'DELETE' });
}
export async function invokeFn(name, body) {
  return call(`/functions/v1/${name}`, { method: 'POST', body });
}

export function startAutoSync() {
  store.subscribe((_, fromSync) => {
    if (fromSync || !signedIn()) return;
    clearTimeout(timer);
    timer = setTimeout(syncNow, 2500);
  });
  window.addEventListener('online', () => signedIn() && syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && signedIn()) syncNow(); });
  setInterval(() => { if (signedIn() && document.visibilityState === 'visible') syncNow(); }, 60e3);
  if (signedIn()) { setStatus('idle'); syncNow(); }
}