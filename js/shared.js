import { cat, person, wallet, trip, spendAmt, MODES, INCOME_MODES } from './store.js';
import { esc, money, icon, todayISO, monthLabel } from './ui.js';

export const $ = (s, r = document) => r.querySelector(s);
export const bus = { render: () => {}, go: (r) => { location.hash = '#/' + r; } };
export const ui = {
  month: todayISO().slice(0, 7), insMonth: todayISO().slice(0, 7), repMonth: todayISO().slice(0, 7),
  filter: 'all', q: '', actView: 'list', day: null,
  lastMode: { expense: 'upi', income: 'upi' },
};
try { Object.assign(ui.lastMode, JSON.parse(localStorage.getItem('kharcha.lastMode') || '{}')); } catch (e) { /* ignore */ }
export function rememberMode(type, mode) {
  ui.lastMode[type] = mode;
  try { localStorage.setItem('kharcha.lastMode', JSON.stringify(ui.lastMode)); } catch (e) { /* ignore */ }
}

export const modeLabel = (t) => (t.type === 'income' ? INCOME_MODES[t.mode]?.label : MODES[t.mode]?.label) || '';
export function txTitle(t) {
  if (t.type === 'transfer') return t.note || `${wallet(t.walletId).name} → ${wallet(t.toWalletId).name}`;
  const p = person(t.personId);
  if (t.type === 'tripshare') return t.note || `${p?.name || 'Someone'} paid for ${cat(t.categoryId).name.toLowerCase()}`;
  if (t.type === 'income') return t.note || (p ? (t.categoryId === 'got-back' ? `${p.name} paid you back` : `From ${p.name}`) : cat(t.categoryId).name);
  if (t.categoryId === 'lent' && p) return t.note || `Lent to ${p.name}`;
  if (t.categoryId === 'repay' && p) return t.note || `Repaid ${p.name}`;
  if (t.categoryId === 'settle-out' && p) return t.note || `Settled up with ${p.name}`;
  return t.note || cat(t.categoryId).name;
}
export function txSub(t) {
  if (t.type === 'transfer') return t.note ? `${wallet(t.walletId).name} → ${wallet(t.toWalletId).name}` : 'Moved between wallets';
  const parts = [];
  const p = person(t.personId);
  if (t.type === 'tripshare') { parts.push(`${p?.name || 'Someone'} paid`, `your share ${money(spendAmt(t), { round: true })}`); }
  else {
    if (t.type === 'income' && p && t.note) parts.push(p.name);
    if (t.note || t.type === 'income') parts.push(cat(t.categoryId).name);
    if (t.split && t.split.length > 1) parts.push(`split ${t.split.length} ways`);
    parts.push(modeLabel(t));
  }
  const tr = t.tripId && trip(t.tripId);
  if (tr) parts.push(`${tr.emoji || '🧳'} ${tr.name}`);
  return parts.filter(Boolean).join(', ');
}
export function txRow(t) {
  const c = cat(t.categoryId);
  const p = t.type === 'income' ? person(t.personId) : null;
  const tile = t.type === 'transfer'
    ? `<span class="tile" style="--c:#5B7FA6">${icon('swap', 20)}</span>`
    : p ? `<span class="tile person" style="--c:${p.color}">${esc(p.name[0])}</span>`
      : `<span class="tile" style="--c:${c.color}">${c.icon}</span>`;
  let amt;
  if (t.type === 'expense') amt = `<span class="amt out">${money(-t.amount)}</span>`;
  else if (t.type === 'income') amt = `<span class="amt in">${money(t.amount, { sign: true })}</span>`;
  else if (t.type === 'tripshare') amt = `<span class="amt mv">${money(t.amount)}</span>`;
  else amt = `<span class="amt mv">${money(t.amount)}</span>`;
  return `<button class="row" data-tx="${t.id}">${tile}<span class="row-main"><span class="row-t">${esc(txTitle(t))}</span><span class="row-s">${esc(txSub(t))}</span></span>${amt}</button>`;
}
export function monthSwitch(ym, key) {
  const atNow = ym >= todayISO().slice(0, 7);
  return `<div class="mswitch"><button class="icon-btn" data-mshift="${key}:-1" aria-label="Previous month">${icon('chevL')}</button><span>${monthLabel(ym)}</span><button class="icon-btn" data-mshift="${key}:1" aria-label="Next month" ${atNow ? 'disabled' : ''}>${icon('chevR')}</button></div>`;
}
export const empty = (title, body, cta = '<button class="btn primary" data-add="expense">Add a transaction</button>') => `<div class="empty"><div class="empty-art">🪙</div><h3>${title}</h3><p>${body}</p>${cta || ''}</div>`;
export const back = (to = 'home') => `<a class="icon-btn" href="#/${to}" aria-label="Back">${icon('chevL')}</a>`;
export const pageHead = (title, { backTo = 'more', right = '<span style="width:40px"></span>' } = {}) => `<header class="top simple">${back(backTo)}<h1 class="title">${esc(title)}</h1>${right}</header>`;
