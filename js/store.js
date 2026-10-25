// Kharcha data store — localStorage, sync-ready (every record has id, updatedAt, deleted)
import { EXT, shareOf, spendAmt as ruleSpend, incomeAmt as ruleIncome, personNets } from './rules.js';
const KEY = 'kharcha.v1';
const EPOCH = '1970-01-01T00:00:00.000Z'; // seeds are "oldest" so synced data always wins over defaults
export const COLLECTIONS = ['wallets', 'people', 'categories', 'txns', 'trips', 'budgets', 'goals', 'recurring'];

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

export const MODES = {
  cash: { label: 'Cash', wallet: 'cash' },
  upi: { label: 'UPI', wallet: 'sbi' },
  card: { label: 'Card', wallet: 'sbi' },
  netbanking: { label: 'Net banking', wallet: 'sbi' },
};
export const INCOME_MODES = {
  cash: { label: 'In cash', wallet: 'cash' },
  upi: { label: 'UPI', wallet: 'sbi' },
  bank: { label: 'Bank transfer', wallet: 'sbi' },
};

// ext = money that moves between you and a person (loans, settle-ups); not counted as spending or income
const SEED_CATEGORIES = [
  ['food', 'Food', '🍛', '#F08A4B', 'expense'], ['snacks', 'Snacks & tea', '☕', '#C98A5E', 'expense'],
  ['travel', 'Travel', '🛺', '#3E8ED0', 'expense'], ['shopping', 'Shopping', '🛍️', '#D45A9A', 'expense'],
  ['recharge', 'Recharge & bills', '📱', '#7A6FE0', 'expense'], ['education', 'Books & college', '📚', '#2E9E8F', 'expense'],
  ['fun', 'Movies & fun', '🎬', '#E4566B', 'expense'], ['health', 'Health', '💊', '#4CAF7A', 'expense'],
  ['rent', 'Rent & mess', '🏠', '#8C7B6B', 'expense'], ['subs', 'Subscriptions', '🔁', '#5B7FA6', 'expense'],
  ['gifts', 'Gifts', '🎁', '#E2A93B', 'expense'], ['other', 'Other', '✨', '#8D9AAE', 'expense'],
  ['lent', 'Lent to someone', '🤲', '#0F8FA0', 'expense', { ext: true, needsPerson: true }],
  ['repay', 'Repaid a loan', '↩️', '#A06CD5', 'expense', { ext: true, needsPerson: true }],
  ['settle-out', 'Settle-up', '🧾', '#5B7FA6', 'expense', { ext: true, hidden: true }],
  ['pocket', 'Pocket money', '💸', '#22A06B', 'income'], ['gift-in', 'Gift', '🎁', '#E2A93B', 'income'],
  ['loan-in', 'Loan (to repay)', '🤝', '#E4566B', 'income'], ['refund', 'Refund', '↩️', '#3E8ED0', 'income'],
  ['scholar', 'Scholarship / stipend', '🎓', '#7A6FE0', 'income'], ['other-in', 'Other', '✨', '#8D9AAE', 'income'],
  ['got-back', 'Got money back', '🔙', '#0F8FA0', 'income', { ext: true }],
  ['settle-in', 'Settle-up', '🧾', '#5B7FA6', 'income', { ext: true, hidden: true }],
].map(([id, name, icon, color, type, extra]) => ({ id, name, icon, color, type, ...(extra || {}), updatedAt: EPOCH }));

export const COLORS = ['#2B6CB0', '#D45A9A', '#22A06B', '#F08A4B', '#7A6FE0', '#2E9E8F', '#E4566B', '#C98A5E', '#0F8FA0', '#A06CD5'];

function fresh() {
  return {
    version: 2,
    settings: { id: 'settings', name: '', theme: 'system', onboarded: false, upi: '', notify: { daily: true, dailyTime: '21:30', bills: true, weekly: true }, updatedAt: EPOCH },
    wallets: [
      { id: 'sbi', name: 'SBI Bank', kind: 'bank', opening: 0, color: '#4C8BE8', updatedAt: EPOCH },
      { id: 'cash', name: 'Cash in hand', kind: 'cash', opening: 0, color: '#F4A93B', updatedAt: EPOCH },
    ],
    people: [
      { id: 'dad', name: 'Dad', relation: 'Family', color: COLORS[0], updatedAt: EPOCH },
      { id: 'mom', name: 'Mom', relation: 'Family', color: COLORS[1], updatedAt: EPOCH },
    ],
    categories: SEED_CATEGORIES.map((c) => ({ ...c })),
    txns: [], trips: [], budgets: [], goals: [], recurring: [],
  };
}

function migrate(s) {
  const f = fresh();
  for (const k of COLLECTIONS) if (!Array.isArray(s[k])) s[k] = [];
  if (!s.settings) s.settings = f.settings;
  s.settings.id = 'settings';
  if (!s.settings.notify) s.settings.notify = { ...f.settings.notify };
  if (s.settings.upi === undefined) s.settings.upi = '';
  // add new built-in categories; refresh flags on existing built-ins
  for (const c of SEED_CATEGORIES) {
    const ex = s.categories.find((x) => x.id === c.id);
    if (!ex) s.categories.push({ ...c });
    else Object.assign(ex, { ext: c.ext, needsPerson: c.needsPerson, hidden: c.hidden, ...(c.ext ? { name: c.name } : {}) });
  }
  s.version = 2;
  return s;
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate(JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
  return fresh();
}
function persist(fromSync = false) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  listeners.forEach((fn) => fn(state, fromSync));
}

export const store = {
  get: () => state,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  replace(next) { state = migrate(next); persist(); },
  reset() { state = fresh(); persist(); },

  // generic collection ops
  save(kind, rec) {
    const r = { ...rec, updatedAt: now() };
    if (!r.id) { r.id = uid(); r.createdAt = now(); state[kind].push(r); }
    else if (state[kind].some((x) => x.id === r.id)) state[kind] = state[kind].map((x) => (x.id === r.id ? { ...x, ...r } : x));
    else { r.createdAt = r.createdAt || now(); state[kind].push(r); }
    persist();
    return r;
  },
  remove(kind, id) {
    state[kind] = state[kind].map((x) => (x.id === id ? { ...x, deleted: true, updatedAt: now() } : x));
    persist();
  },
  // sync: apply remote records (last write wins)
  mergeRemote(records) {
    let changed = 0;
    for (const { kind, data } of records) {
      if (kind === 'settings') {
        if ((data.updatedAt || '') > (state.settings.updatedAt || '')) { state.settings = { ...data }; changed++; }
        continue;
      }
      if (!state[kind]) continue;
      const i = state[kind].findIndex((x) => x.id === data.id);
      if (i < 0) { state[kind].push(data); changed++; }
      else if ((data.updatedAt || '') > (state[kind][i].updatedAt || '')) { state[kind][i] = data; changed++; }
    }
    if (changed) { migrate(state); persist(true); }
    return changed;
  },
  allRecords() {
    const out = [{ kind: 'settings', data: state.settings }];
    for (const k of COLLECTIONS) for (const r of state[k]) out.push({ kind: k, data: r });
    return out;
  },

  onboard({ name, sbi, cash }) {
    state.settings = { ...state.settings, name, onboarded: true, updatedAt: now() };
    state.wallets = state.wallets.map((w) => ({ ...w, opening: w.id === 'sbi' ? +sbi || 0 : +cash || 0, updatedAt: now() }));
    persist();
  },
  setSetting(k, v) { state.settings = { ...state.settings, [k]: v, updatedAt: now() }; persist(); },
  setOpening(id, amount) {
    state.wallets = state.wallets.map((w) => (w.id === id ? { ...w, opening: +amount || 0, updatedAt: now() } : w));
    persist();
  },

  saveTxn(t) { return store.save('txns', { ...t, amount: Math.round(+t.amount * 100) / 100 }); },
  deleteTxn(id) { store.remove('txns', id); },
  savePerson(p) {
    const color = p.color || COLORS[state.people.length % COLORS.length];
    return store.save('people', { ...p, color });
  },
  deletePerson(id) { store.remove('people', id); },
};

// ---------- selectors ----------
const live = (k) => state[k].filter((x) => !x.deleted);
export const txns = () => live('txns').sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')) || (b.createdAt || '').localeCompare(a.createdAt || ''));
export const people = () => live('people');
export const trips = () => live('trips').sort((a, b) => (b.start || '').localeCompare(a.start || ''));
export const goals = () => live('goals');
export const recurring = () => live('recurring').sort((a, b) => a.next.localeCompare(b.next));
export const budgets = () => live('budgets');
export const cat = (id) => state.categories.find((c) => c.id === id) || { id: 'other', name: 'Other', icon: '✨', color: '#8D9AAE' };
export const person = (id) => state.people.find((p) => p.id === id);
export const wallet = (id) => state.wallets.find((w) => w.id === id) || { name: '' };
export const trip = (id) => state.trips.find((t) => t.id === id);
export const categories = (type, { all = false } = {}) => state.categories.filter((c) => c.type === type && !c.deleted && (all || !c.hidden));
export const isExt = (t) => EXT.has(t.categoryId);

export function balances() {
  const b = Object.fromEntries(state.wallets.map((w) => [w.id, +w.opening || 0]));
  for (const t of txns()) {
    if (t.type === 'income') b[t.walletId] += t.amount;
    else if (t.type === 'expense') b[t.walletId] -= t.amount;
    else if (t.type === 'transfer') { b[t.walletId] -= t.amount; b[t.toWalletId] += t.amount; }
  }
  return b;
}

export { shareOf, personNets };
// What this transaction cost *you* (your share), used for all spending stats
export const spendAmt = ruleSpend;
export const incomeAmt = ruleIncome;

export const monthKey = (d) => d.slice(0, 7);
export const inMonth = (list, ym) => list.filter((t) => t.date.startsWith(ym));
export function sumBy(list, keyFn, valFn = (t) => t.amount) {
  const m = new Map();
  for (const t of list) { const v = valFn(t); if (!v) continue; const k = keyFn(t); m.set(k, (m.get(k) || 0) + v); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
export const spent = (list) => list.reduce((s, t) => s + spendAmt(t), 0);
export const received = (list) => list.reduce((s, t) => s + incomeAmt(t), 0);
export const spends = (list) => list.filter((t) => spendAmt(t) > 0);

// Everything between you and one person: loans, splits and settle-ups
export const allNets = () => personNets(txns());
export function ledger(pid) {
  const l = { borrowed: 0, repaid: 0, lent: 0, gotBack: 0, splitOwed: 0, splitOwe: 0, settledIn: 0, settledOut: 0 };
  for (const t of txns()) {
    if (t.type === 'expense') {
      if (t.personId === pid && t.categoryId === 'lent') l.lent += t.amount;
      else if (t.personId === pid && t.categoryId === 'repay') l.repaid += t.amount;
      else if (t.personId === pid && t.categoryId === 'settle-out') l.settledOut += t.amount;
      else if (!isExt(t) && t.split && t.split.includes(pid)) l.splitOwed += shareOf(t, pid);
    } else if (t.type === 'tripshare' && t.personId === pid) l.splitOwe += shareOf(t, 'me');
    else if (t.type === 'income' && t.personId === pid) {
      if (t.categoryId === 'loan-in') l.borrowed += t.amount;
      else if (t.categoryId === 'got-back') l.gotBack += t.amount;
      else if (t.categoryId === 'settle-in') l.settledIn += t.amount;
    }
  }
  l.net = allNets()[pid] || 0;
  l.owesMe = Math.max(0, l.net);
  l.iOwe = Math.max(0, -l.net);
  return l;
}

// Trip totals and who owes whom within the trip (positive net = they owe you)
export function tripStats(id) {
  const list = txns().filter((t) => t.tripId === id);
  const s = { list, group: 0, mine: 0, net: personNets(list), byCat: [], byDay: [] };
  for (const t of list) {
    if ((t.type === 'expense' && !isExt(t)) || t.type === 'tripshare') s.group += t.amount;
    s.mine += spendAmt(t);
  }
  s.byCat = sumBy(list, (t) => t.categoryId, spendAmt);
  s.byDay = sumBy(list, (t) => t.date, spendAmt).sort((a, b) => a[0].localeCompare(b[0]));
  return s;
}
export const activeTrip = (date = todayISO()) => trips().find((t) => !t.archived && t.start <= date && (!t.end || t.end >= date));

export function budgetStatus(ym) {
  const month = inMonth(txns(), ym);
  const bs = budgets();
  const overall = bs.find((b) => b.id === 'overall');
  return {
    overall: overall ? { amount: overall.amount, spent: spent(month) } : null,
    cats: bs.filter((b) => b.id !== 'overall').map((b) => ({ id: b.id, amount: b.amount, spent: month.filter((t) => t.categoryId === b.id).reduce((a, t) => a + spendAmt(t), 0) })).sort((a, b) => b.spent / b.amount - a.spent / a.amount),
  };
}

export function advanceDate(iso, freq) {
  const [y, m, d] = iso.split('-').map(Number);
  let dt;
  if (freq === 'weekly') dt = new Date(y, m - 1, d + 7);
  else if (freq === 'yearly') dt = new Date(y + 1, m - 1, d);
  else { dt = new Date(y, m, 1); dt.setDate(Math.min(d, new Date(y, m + 1, 0).getDate())); }
  return new Date(dt.getTime() - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
}
export function payBill(b, date = b.next) {
  const tx = store.saveTxn({ type: 'expense', amount: b.amount, date, time: '09:00', categoryId: b.categoryId, mode: b.mode, walletId: MODES[b.mode].wallet, note: b.name, billId: b.id });
  store.save('recurring', { ...b, next: advanceDate(b.next, b.freq) });
  return tx;
}
// Auto-add bills marked "add automatically" that are due
export function processRecurring() {
  const t = todayISO();
  let n = 0;
  for (let guard = 0; guard < 60; guard++) {
    const due = recurring().find((b) => b.auto && b.next <= t);
    if (!due) break;
    payBill(due); n++;
  }
  return n;
}