import { store, txns, cat, person, wallet, trips, processRecurring, inMonth, sumBy, spent, received, spendAmt, incomeAmt, MODES } from './store.js';
import { todayISO, shiftMonth, monthLabel, toast } from './ui.js';
import { $, bus, ui, txTitle, modeLabel } from './shared.js';
import * as V from './views.js';
import * as S from './sheets.js';
import * as Sync from './sync.js';

const app = $('#app');

// ---------- theme ----------
function applyTheme() {
  const t = store.get().settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name=theme-color]')?.setAttribute('content', dark ? '#0B1520' : '#F2F4F8');
}

// ---------- router ----------
const ROUTES = {
  home: V.Home, activity: V.Activity, insights: V.Insights, more: V.More, people: V.People, person: V.PersonView,
  trips: V.Trips, trip: V.TripView, budgets: V.Budgets, goals: V.Goals, bills: V.Bills, categories: V.Categories,
  report: V.Report, settings: V.Settings, sync: V.SyncView,
};
const TAB_OF = { home: 'home', activity: 'activity', insights: 'insights', report: 'insights' };
function route() { const [name, arg] = (location.hash.replace(/^#\/?/, '') || 'home').split('/'); return { name, arg }; }
let lastKey = '';
function render() {
  applyTheme();
  const nav = $('#nav');
  const { name, arg } = route();
  const onboarded = store.get().settings.onboarded;
  if (!onboarded && name !== 'sync') { nav.hidden = true; app.innerHTML = V.Onboarding(); lastKey = 'onb'; return; }
  nav.hidden = !onboarded;
  let html = (ROUTES[name] || V.Home)(arg);
  if (html === null) { location.hash = '#/' + (name === 'trip' ? 'trips' : 'people'); return; }
  if (!onboarded) html = html.replace(/href="#\/more"/, 'href="#/home"');
  const key = name + (arg || '');
  const y = window.scrollY;
  app.innerHTML = html;
  if (key !== lastKey) { window.scrollTo(0, 0); app.classList.remove('enter'); void app.offsetWidth; app.classList.add('enter'); }
  else window.scrollTo(0, y);
  lastKey = key;
  const tab = TAB_OF[name] || 'more';
  nav.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
}
bus.render = render;
bus.go = (r) => { if (location.hash === '#/' + r) render(); else location.hash = '#/' + r; };

// ---------- exports ----------
function download(name, data, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const rowOf = (t) => ({
  Date: t.date, Time: t.time || '', Type: { expense: 'Spent', income: 'Received', transfer: 'Move', tripshare: 'Friend paid' }[t.type],
  Amount: t.amount, 'Your share': t.type === 'expense' || t.type === 'tripshare' ? Math.round(spendAmt(t) * 100) / 100 : '',
  Category: t.categoryId ? cat(t.categoryId).name : '', Mode: t.type === 'tripshare' ? '' : modeLabel(t),
  Wallet: t.walletId ? wallet(t.walletId).name : '', 'To wallet': t.toWalletId ? wallet(t.toWalletId).name : '',
  Person: person(t.personId)?.name || '', Trip: trips().find((x) => x.id === t.tripId)?.name || '', Note: t.note || '', Details: t.date ? txTitle(t) : '',
});
function exportCSV(list = txns(), name = `kharcha-${todayISO()}.csv`) {
  const rows = list.slice().reverse().map(rowOf);
  const head = Object.keys(rowOf({ type: 'expense', amount: 0, date: '' }));
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  download(name, '﻿' + [head.map(q).join(','), ...rows.map((r) => head.map((h) => q(r[h])).join(','))].join('\n'), 'text/csv');
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}
async function exportXLSX() {
  const ym = ui.repMonth;
  const month = inMonth(txns(), ym);
  try {
    if (!window.XLSX) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
    const X = window.XLSX;
    const wb = X.utils.book_new();
    const summary = [
      ['Kharcha statement', monthLabel(ym)], [],
      ['Received', received(month)], ['Spent (your share)', Math.round(spent(month))], ['Saved', Math.round(received(month) - spent(month))], [],
      ['Category', 'Spent'], ...sumBy(month, (t) => t.categoryId, spendAmt).map(([c, v]) => [cat(c).name, Math.round(v)]), [],
      ['Received from', 'Amount'], ...sumBy(month, (t) => t.personId || 'other', incomeAmt).map(([p, v]) => [person(p)?.name || 'Other sources', v]), [],
      ['Paid with', 'Amount'], ...sumBy(month.filter((t) => t.type === 'expense'), (t) => t.mode, spendAmt).map(([m, v]) => [MODES[m]?.label || m, Math.round(v)]),
    ];
    const ws1 = X.utils.aoa_to_sheet(summary); ws1['!cols'] = [{ wch: 24 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, ws1, 'Summary');
    const ws2 = X.utils.json_to_sheet(month.slice().reverse().map(rowOf)); ws2['!cols'] = [12, 7, 11, 10, 10, 18, 12, 14, 12, 12, 14, 26, 30].map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws2, 'Transactions');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(txns().slice().reverse().map(rowOf)), 'All time');
    X.writeFile(wb, `kharcha-${ym}.xlsx`);
    toast('Excel file saved');
  } catch (e) {
    exportCSV(month, `kharcha-${ym}.csv`);
    toast('Saved as CSV, which Excel opens. Connect to the internet for a full .xlsx file.');
  }
}

// ---------- PIN lock ----------
let locked = false;
let hiddenAt = 0;
function lock() {
  if (!S.pinSet() || locked) return;
  locked = true;
  const el = document.createElement('div');
  el.className = 'lock';
  document.body.appendChild(el);
  document.body.classList.add('locked');
  S.keypad(el, {
    title: 'Kharcha is locked', sub: 'Enter your PIN',
    extra: '<button class="link kp-forgot" data-forgot>Forgot PIN?</button>',
    onDone: async (pin) => {
      if (!(await S.checkPin(pin))) return false;
      locked = false; el.classList.add('out'); document.body.classList.remove('locked'); setTimeout(() => el.remove(), 250);
      return true;
    },
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-forgot]')) {
      const msg = Sync.signedIn() ? 'Erase this phone, then sign in to sync again to get your data back. Your synced data stays safe.' : 'The only way in is to erase everything on this phone. Download a backup regularly so you never lose data.';
      el.querySelector('.kp-forgot').outerHTML = `<div class="kp-reset"><p class="muted small">${msg}</p><button class="btn danger-solid sm" data-wipe>Erase and start over</button></div>`;
    }
    if (e.target.closest('[data-wipe]')) {
      try { localStorage.removeItem('kharcha.pin'); } catch (er) { /* ignore */ }
      store.reset(); Sync.signOut(); locked = false; el.remove(); document.body.classList.remove('locked'); location.hash = '#/home'; render();
    }
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > 60e3) lock();
});

// ---------- events ----------
const ACTIONS = '[data-add],[data-tx],[data-mshift],[data-filter],[data-addperson],[data-editperson],[data-theme-set],[data-act],[data-voice],[data-actview],[data-day],[data-newtrip],[data-edittrip],[data-friendpaid],[data-settle],[data-archivetrip],[data-editbudget],[data-editgoal],[data-goaladd],[data-goaltake],[data-editbill],[data-paybill],[data-editcat],[data-repay],[data-gotback],[data-lend]';
document.addEventListener('click', async (e) => {
  const t = e.target.closest(ACTIONS);
  if (!t || t.closest('.sheet') || t.closest('.lock')) return;
  const ds = t.dataset;
  if (ds.add) S.openAdd({ type: ds.add, personId: ds.person || null, tripId: ds.trip || null });
  else if (ds.tx) S.openAdd({ tx: txns().find((x) => x.id === ds.tx) });
  else if (ds.mshift) { const [k, n] = ds.mshift.split(':'); ui[k] = shiftMonth(ui[k], +n); if (k === 'month') ui.day = null; render(); }
  else if (ds.filter) { ui.filter = ds.filter; render(); }
  else if (ds.actview) { ui.actView = ds.actview; if (ds.actview === 'list') ui.day = null; render(); }
  else if (ds.day !== undefined) { ui.day = ds.day && ui.day !== ds.day ? ds.day : null; render(); }
  else if ('voice' in ds) S.openVoice();
  else if ('addperson' in ds) S.openPersonEdit(null);
  else if (ds.editperson) S.openPersonEdit(ds.editperson);
  else if (ds.lend) S.openAdd({ draft: { type: 'expense', amount: '', date: todayISO(), categoryId: 'lent', personId: ds.lend, mode: ui.lastMode.expense, note: '' } });
  else if (ds.repay) S.openAdd({ draft: { type: 'expense', amount: +ds.amt, date: todayISO(), categoryId: 'repay', personId: ds.repay, mode: ui.lastMode.expense, note: '' } });
  else if (ds.gotback) S.openAdd({ draft: { type: 'income', amount: +ds.amt, date: todayISO(), categoryId: 'got-back', personId: ds.gotback, mode: ui.lastMode.income, note: '' } });
  else if ('newtrip' in ds) S.openTripEdit(null);
  else if (ds.edittrip) S.openTripEdit(ds.edittrip);
  else if (ds.friendpaid) S.openFriendPaid({ tripId: ds.friendpaid });
  else if (ds.settle) { const [tid, pid, v] = ds.settle.split(':'); S.settle(tid, pid, +v); }
  else if (ds.archivetrip) { const tr = trips().find((x) => x.id === ds.archivetrip); store.save('trips', { ...tr, archived: !tr.archived }); toast(tr.archived ? 'Trip is active again' : 'Trip archived'); render(); }
  else if (ds.editbudget !== undefined) S.openBudgetEdit(ds.editbudget || null);
  else if (ds.editgoal !== undefined) S.openGoalEdit(ds.editgoal || null);
  else if (ds.goaladd) S.openGoalMoney(ds.goaladd);
  else if (ds.goaltake) S.openGoalMoney(ds.goaltake, true);
  else if (ds.editbill !== undefined) S.openBillEdit(ds.editbill || null);
  else if (ds.paybill) S.payBillNow(ds.paybill);
  else if (ds.editcat) S.openCatEdit(ds.editcat);
  else if (ds.themeSet) { store.setSetting('theme', ds.themeSet); render(); }
  else if (ds.act) {
    const a = ds.act;
    if (a === 'backup') { download(`kharcha-backup-${todayISO()}.json`, JSON.stringify(store.get(), null, 1), 'application/json'); toast('Backup downloaded'); }
    else if (a === 'restore') $('#restore-file').click();
    else if (a === 'csv') { exportCSV(); toast('Exported to CSV'); }
    else if (a === 'xlsx') exportXLSX();
    else if (a === 'pdf') { toast('Pick “Save as PDF” as the printer'); setTimeout(() => window.print(), 500); }
    else if (a === 'reset') { if (await S.ask('Erase all data?', 'Every transaction, person, trip and balance on this phone will be deleted. Download a backup first if you might need it.', 'Erase everything')) { store.reset(); location.hash = '#/home'; render(); } }
    else if (a === 'pin-set') S.openPinSetup('set');
    else if (a === 'pin-change') S.openPinSetup('change');
    else if (a === 'pin-off') S.openPinSetup('off');
    else if (a === 'sync-now') { await Sync.syncNow(); render(); }
    else if (a === 'sync-out') { if (await S.ask('Sign out of sync?', 'Your data stays on this phone. It just stops syncing.', 'Sign out', false)) { Sync.signOut(); render(); } }
    else if (a === 'copy-sql') {
      try { await navigator.clipboard.writeText(Sync.SETUP_SQL); toast('SQL copied'); }
      catch (er) { const r = document.createRange(); r.selectNodeContents($('#sql')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast('Selected. Copy it from the menu.'); }
    }
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    ui.q = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.closest('.sheet')) return;
  if (e.target.id === 'set-name') { store.setSetting('name', e.target.value.trim()); toast('Name saved'); }
  if (e.target.dataset.opening) { store.setOpening(e.target.dataset.opening, parseFloat(e.target.value.replace(/[^\d.]/g, '')) || 0); toast('Balance updated'); }
  if (e.target.id === 'restore-file' && e.target.files[0]) {
    e.target.files[0].text().then(async (txt) => {
      try {
        const data = JSON.parse(txt);
        if (!data.txns || !data.wallets) throw new Error('bad');
        if (await S.ask('Restore this backup?', `It has ${data.txns.filter((t) => !t.deleted).length} transactions and replaces what is on this phone now.`, 'Restore', false)) { store.replace(data); toast('Backup restored'); render(); }
      } catch (err) { toast('That file is not a Kharcha backup'); }
    });
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id === 'onb') {
    e.preventDefault();
    const f = new FormData(e.target);
    store.onboard({ name: f.get('name').trim(), sbi: parseFloat(f.get('sbi')) || 0, cash: parseFloat(f.get('cash')) || 0 });
    location.hash = '#/home'; render();
    toast('All set. Tap + or the mic to log your first expense.');
  }
  if (e.target.id === 'sync-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    const mode = e.submitter?.value || 'in';
    const wasOnboarded = store.get().settings.onboarded;
    const err = $('#sync-err');
    const btns = e.target.querySelectorAll('button'); btns.forEach((b) => { b.disabled = true; });
    err.hidden = true;
    try {
      Sync.setProject(f.get('url'), f.get('key'));
      const email = String(f.get('email')).trim(), pass = String(f.get('password'));
      if (!email || pass.length < 6) throw new Error('Enter your email and a password of at least 6 characters.');
      if (mode === 'up') {
        const r = await Sync.signUp(email, pass);
        if (!r.signedIn) { err.hidden = false; err.className = 'form-ok'; err.textContent = 'Account created. Check your email to confirm it, then tap Sign in. (Or turn off “Confirm email” in Supabase, step 4.)'; btns.forEach((b) => { b.disabled = false; }); return; }
      } else await Sync.signIn(email, pass);
      await Sync.syncNow();
      if (Sync.status.state === 'error') throw new Error(Sync.status.message);
      toast('Sync is on');
      location.hash = wasOnboarded ? '#/sync' : '#/home';
      render();
    } catch (ex) {
      err.hidden = false; err.className = 'form-err';
      err.textContent = /Invalid login/i.test(ex.message) ? 'Wrong email or password.' : /relation .* does not exist|kharcha_records/i.test(ex.message) ? 'The table is missing. Run the SQL from step 2 in your Supabase project.' : /Failed to fetch|NetworkError|Load failed/i.test(ex.message) ? 'Could not reach Supabase. Check the project URL and your internet.' : ex.message;
      btns.forEach((b) => { b.disabled = false; });
    }
  }
});
window.addEventListener('hashchange', render);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

// FAB: tap = add, long-press = voice
const fab = $('#fab');
let pressT = null, longFired = false;
fab.addEventListener('pointerdown', () => { longFired = false; pressT = setTimeout(() => { longFired = true; navigator.vibrate?.(20); S.openVoice(); }, 500); });
['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => fab.addEventListener(ev, () => clearTimeout(pressT)));
fab.addEventListener('click', () => { if (!longFired) S.openAdd({ type: 'expense' }); });
fab.addEventListener('contextmenu', (e) => e.preventDefault());

Sync.onStatus(() => { if ($('#sync-status') && !document.querySelector('.sheet-wrap')) render(); });

// ---------- boot ----------
const added = processRecurring();
render();
lock();
if (added) toast(`${added} bill${added > 1 ? 's were' : ' was'} added automatically`);
Sync.startAutoSync();
if (location.search.includes('voice')) setTimeout(() => S.openVoice(), 400);
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js').catch(() => {});
