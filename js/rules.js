// Shared money rules. Used by the app, the service worker (offline reminders)
// and the Supabase reminder server, so all three always agree.
// No imports: this file must run in a page, a service worker and Deno.

export const EXT = new Set(['lent', 'repay', 'settle-out', 'got-back', 'settle-in']); // money between people, not spending/income
export const BUILTIN_CATS = { food: 'Food', snacks: 'Snacks & tea', travel: 'Travel', shopping: 'Shopping', recharge: 'Recharge & bills', education: 'Books & college', fun: 'Movies & fun', health: 'Health', rent: 'Rent & mess', subs: 'Subscriptions', gifts: 'Gifts', other: 'Other' };
export const BUILTIN_PEOPLE = { dad: 'Dad', mom: 'Mom' };
export const DEFAULT_PREFS = { daily: true, dailyTime: '21:30', bills: true, weekly: true };

const isSplit = (t) => Array.isArray(t.split) && t.split.length > 0;
const r2 = (n) => Math.round(n * 100) / 100;

// How much of transaction t belongs to `who` ('me' or a person id)
export function shareOf(t, who) {
  if (!isSplit(t)) return who === 'me' ? t.amount : 0;
  if (t.shares && typeof t.shares === 'object') return +t.shares[who] || 0;
  return t.split.includes(who) ? t.amount / t.split.length : 0;
}
// What a transaction cost *you*
export function spendAmt(t) {
  if (t.type === 'expense') return EXT.has(t.categoryId) ? 0 : shareOf(t, 'me');
  if (t.type === 'tripshare') return shareOf(t, 'me'); // a friend paid, you owe your share
  return 0;
}
export const incomeAmt = (t) => (t.type === 'income' && !EXT.has(t.categoryId) ? t.amount : 0);

// Balance with each person. Positive = they owe you, negative = you owe them.
export function personNets(txns) {
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
export function localNow(tzOffsetMin, ms = Date.now()) {
  const d = new Date(ms + tzOffsetMin * 60000);
  const iso = d.toISOString();
  return { date: iso.slice(0, 10), hm: iso.slice(11, 16), dow: d.getUTCDay() };
}
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

// Which reminders could be due right now (cheap check before loading data)
export function dueKeys(prefs, now, lastSent = {}) {
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
export function planReminders({ txns = [], recurring = [], people = [], categories = [], budgets = [], prefs = {}, now, lastSent = {} }) {
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
