import { store, txns, people, cat, person, wallet, trips, trip, goals, recurring, categories, balances, inMonth, spent, spendAmt, incomeAmt, received, ledger, budgetStatus, activeTrip, payBill, COLORS, MODES, INCOME_MODES } from './store.js';
import { esc, money, compact, todayISO, nowTime, parseISO, dayLabel, icon, toast, openSheet, shiftMonth } from './ui.js';
import { $, bus, ui, rememberMode, txTitle, modeLabel } from './shared.js';
import { parseCommand, listen, speak, speechSupported } from './voice.js';

const EMOJIS = ['🏖️', '🏔️', '🚆', '✈️', '🏕️', '🎒', '🛕', '🌊', '🎉', '📱', '💻', '🎧', '🏍️', '👟', '🎓', '📚', '🎁', '🏠', '💍', '🎮', '📷', '⌚', '🧳', '🎯', '🍕', '☕', '🚗', '💊', '🐶', '🌱', '🎸', '⚽'];
const chipRow = (items, sel, attr) => `<div class="chips tight">${items.map(([v, l]) => `<button class="chip ${sel === v ? 'on' : ''}" data-${attr}="${v}">${l}</button>`).join('')}</div>`;
const emojiRow = (sel) => `<div class="emoji-row">${EMOJIS.map((e) => `<button class="em ${sel === e ? 'on' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>`;
const colorRow = (sel) => `<div class="color-row">${COLORS.map((c) => `<button class="clr ${sel === c ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('')}</div>`;
const sheetFrame = (title, body, foot) => `<div class="sheet-inner"><div class="sheet-head"><h2 class="sheet-title">${title}</h2><button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div><div class="sheet-body">${body}</div><div class="sheet-foot">${foot}</div></div>`;
const amountInput = (v, id = 'amt') => `<label class="amount"><span class="cur">₹</span><input id="${id}" inputmode="decimal" placeholder="0" value="${v ?? ''}" autocomplete="off" aria-label="Amount"></label>`;
function fitAmount(root) { const a = $('#amt', root); if (a) a.style.width = Math.max(1, a.value.length) * 0.62 + 0.2 + 'em'; }
function cleanAmount(e) {
  if (e.target.id !== 'amt' && e.target.dataset.money === undefined) return;
  e.target.value = e.target.value.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}
const shake = (el) => { if (!el) return; el.classList.add('shake'); el.focus(); setTimeout(() => el.classList.remove('shake'), 400); };
const peopleChips = (sel, attr = 'pp', { other = false, add = true, multi = false } = {}) => `<div class="chips tight">${people().map((p) => `<button class="chip person-chip ${(multi ? sel.includes(p.id) : sel === p.id) ? 'on' : ''}" data-${attr}="${p.id}" style="--c:${p.color}"><span class="pdot">${esc(p.name[0])}</span>${esc(p.name)}</button>`).join('')}${other ? `<button class="chip ${!sel ? 'on' : ''}" data-${attr}="">Other source</button>` : ''}${add ? `<button class="chip add" data-newperson>${icon('plus', 16)} New person</button>` : ''}</div>`;

// ---------- confirm ----------
export function ask(title, body, okLabel, danger = true) {
  return new Promise((resolve) => {
    let done = false;
    openSheet(`<div class="sheet-inner"><div class="sheet-body ask"><h2 class="sheet-title">${esc(title)}</h2><p class="muted">${esc(body)}</p></div>
      <div class="sheet-foot"><button class="btn ghost wide" data-close>Cancel</button><button class="btn ${danger ? 'danger-solid' : 'primary'} wide" data-ok>${esc(okLabel)}</button></div></div>`, (sheet, close) => {
      sheet.addEventListener('click', (e) => { if (e.target.closest('[data-ok]')) { done = true; close(); resolve(true); } });
      sheet.parentElement.addEventListener('click', (e) => { if (!done && (e.target.closest('[data-close]') || e.target.classList.contains('sheet-bg'))) resolve(false); });
    });
  });
}

// ---------- budget alerts ----------
function budgetAlert(before, rec) {
  if (rec.type !== 'expense' && rec.type !== 'tripshare') return '';
  const ym = rec.date.slice(0, 7);
  if (ym !== todayISO().slice(0, 7)) return '';
  const after = budgetStatus(ym);
  const cross = (b, a, name) => {
    if (!b || !a) return '';
    const pb = b.spent / b.amount, pa = a.spent / a.amount;
    if (pb < 1 && pa >= 1) return `${name} budget is used up`;
    if (pb < 0.8 && pa >= 0.8) return `${Math.round(pa * 100)}% of your ${name.toLowerCase()} budget used`;
    return '';
  };
  const c = cross(before.cats.find((x) => x.id === rec.categoryId), after.cats.find((x) => x.id === rec.categoryId), cat(rec.categoryId).name);
  return cross(before.overall, after.overall, 'Monthly') || c;
}

// Build + save a transaction from a draft (used by the add sheet and by voice)
export function commitTxn(d, { editing = false } = {}) {
  const amt = Math.round(parseFloat(d.amount) * 100) / 100;
  const rec = { id: d.id, type: d.type, amount: amt, date: d.date || todayISO(), time: d.time || nowTime(), note: (d.note || '').trim() };
  if (d.type === 'expense') {
    const c = cat(d.categoryId);
    Object.assign(rec, { categoryId: d.categoryId, mode: d.mode, walletId: MODES[d.mode].wallet, personId: c.needsPerson || c.id === 'settle-out' ? d.personId || null : null, tripId: d.tripId || null, split: d.tripId && !c.ext && d.split && d.split.length > 1 ? d.split : null });
    rememberMode('expense', d.mode);
  } else if (d.type === 'income') {
    Object.assign(rec, { categoryId: d.categoryId, mode: d.mode, walletId: INCOME_MODES[d.mode].wallet, personId: d.personId || null, tripId: d.categoryId === 'settle-in' ? d.tripId : null });
    rememberMode('income', d.mode);
  } else if (d.type === 'tripshare') {
    Object.assign(rec, { categoryId: d.categoryId, personId: d.personId, tripId: d.tripId, split: d.split, mode: null, walletId: null });
  } else {
    Object.assign(rec, { walletId: d.walletId, toWalletId: d.toWalletId, mode: null, categoryId: null, personId: null });
  }
  const before = budgetStatus(rec.date.slice(0, 7));
  store.saveTxn(rec);
  const alert = budgetAlert(before, rec);
  const msg = editing ? 'Changes saved' : rec.type === 'expense' ? `Expense of ${money(amt)} added` : rec.type === 'income' ? `${money(amt)} received added` : rec.type === 'tripshare' ? 'Shared expense added' : `${money(amt)} moved`;
  toast(alert ? `${msg}. ${alert}` : msg, alert ? 'warn' : '');
  return rec;
}

// ---------- add / edit ----------
export function openAdd({ type = 'expense', tx = null, personId = null, tripId = null, draft = null } = {}) {
  if (tx && tx.type === 'tripshare') return openFriendPaid({ tx });
  const editing = !!tx;
  const src = tx || draft;
  const d = src ? { split: null, ...src } : { type, amount: '', date: todayISO(), time: nowTime(), note: '', mode: ui.lastMode[type === 'income' ? 'income' : 'expense'], categoryId: type === 'income' ? 'pocket' : 'food', personId: type === 'income' ? (personId || people()[0]?.id || null) : null, walletId: 'sbi', toWalletId: 'cash', tripId: type === 'expense' ? (tripId || activeTrip()?.id || null) : null, split: null };
  if (!d.time) d.time = nowTime();
  if (d.type === 'income' && !INCOME_MODES[d.mode]) d.mode = 'upi';
  if (d.type === 'expense' && !MODES[d.mode]) d.mode = 'upi';
  if (d.type === 'transfer') { d.walletId = d.walletId || 'sbi'; d.toWalletId = d.toWalletId || 'cash'; }

  const body = () => {
    const b = balances();
    const date = `<div class="row2"><label class="field"><span>Date</span><input type="date" id="date" value="${d.date}" max="${todayISO()}"></label><label class="field"><span>Time</span><input type="time" id="time" value="${d.time || ''}"></label></div>`;
    const note = `<label class="field"><span>Note</span><input id="note" value="${esc(d.note)}" placeholder="${d.type === 'expense' ? 'e.g. Biryani with friends' : d.type === 'income' ? 'e.g. Hostel fee for October' : 'e.g. ATM withdrawal'}" maxlength="80"></label>`;
    let mid = '';
    const c = cat(d.categoryId);
    if (d.type === 'expense') {
      const w = MODES[d.mode]?.wallet || 'sbi';
      const avail = b[w] + (editing && tx.type === 'expense' && tx.walletId === w ? tx.amount : 0);
      const tr = d.tripId ? trip(d.tripId) : null;
      const openTrips = trips().filter((t) => !t.archived || t.id === d.tripId);
      const members = tr ? (tr.members || []).filter((m) => person(m)) : [];
      const split = d.split && d.split.length ? d.split : ['me'];
      mid = c.hidden ? `<div class="locked-cat"><span class="tile sm" style="--c:${c.color}">${c.icon}</span>${esc(c.name)}${d.personId ? ` with ${esc(person(d.personId)?.name || '')}` : ''}</div>`
        : `<div class="field"><span>Category</span><div class="cats">${categories('expense').map((x) => `<button class="cat ${d.categoryId === x.id ? 'on' : ''}" data-cat="${x.id}" style="--c:${x.color}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('')}</div></div>`;
      if (c.needsPerson) mid += `<div class="field"><span>${d.categoryId === 'lent' ? 'Lent to' : 'Repaid to'}</span>${peopleChips(d.personId, 'pp')}</div>`;
      mid += `<div class="field"><span>Paid with</span>${chipRow(Object.entries(MODES).map(([k, m]) => [k, m.label]), d.mode, 'mode')}
        <p class="from-note ${(+d.amount || 0) > avail ? 'warn' : ''}">${w === 'cash' ? icon('cash', 16) : icon('bank', 16)} From ${wallet(w).name}, ${money(avail)} available</p></div>`;
      if (openTrips.length && !c.ext) {
        mid += `<div class="field"><span>Trip</span><div class="chips tight"><button class="chip ${!d.tripId ? 'on' : ''}" data-trip="">No trip</button>${openTrips.map((t) => `<button class="chip ${d.tripId === t.id ? 'on' : ''}" data-trip="${t.id}">${t.emoji || '🧳'} ${esc(t.name)}</button>`).join('')}</div></div>`;
        if (tr && members.length) {
          const n = split.length;
          mid += `<div class="field"><span>Split with</span><div class="chips tight"><button class="chip ${split.includes('me') ? 'on' : ''}" data-split="me">Me</button>${members.map((m) => { const p = person(m); return `<button class="chip person-chip ${split.includes(m) ? 'on' : ''}" data-split="${m}" style="--c:${p.color}"><span class="pdot">${esc(p.name[0])}</span>${esc(p.name)}</button>`; }).join('')}<button class="chip add" data-splitall>Everyone</button></div>
          <p class="from-note">${n > 1 ? `${money((+d.amount || 0) / n)} each. ${split.includes('me') ? 'Your share counts as your spending; the rest is owed to you.' : 'You paid for them, so all of it is owed to you.'}` : 'Only you. Tap friends to split this equally.'}</p></div>`;
        }
      }
    } else if (d.type === 'income') {
      const w = INCOME_MODES[d.mode]?.wallet || 'sbi';
      if (c.hidden) mid = `<div class="locked-cat"><span class="tile sm" style="--c:${c.color}">${c.icon}</span>${esc(c.name)} from ${esc(person(d.personId)?.name || '')}</div>`;
      else mid = `<div class="field"><span>From</span>${peopleChips(d.personId, 'pp', { other: true })}</div>
        <div class="field"><span>What is it</span>${chipRow(categories('income').map((x) => [x.id, `${x.icon} ${esc(x.name)}`]), d.categoryId, 'cat')}</div>`;
      mid += `<div class="field"><span>Received as</span>${chipRow(Object.entries(INCOME_MODES).map(([k, m]) => [k, m.label]), d.mode, 'mode')}
        <p class="from-note">${w === 'cash' ? icon('cash', 16) : icon('bank', 16)} Goes to ${wallet(w).name}</p></div>`;
    } else {
      mid = `<div class="field"><span>Move</span><div class="move">
        <div class="mv-w"><span class="mv-l">From</span><strong>${wallet(d.walletId).name}</strong><span class="muted small">${money(b[d.walletId])}</span></div>
        <button class="icon-btn swapper" data-swapwallets aria-label="Swap direction">${icon('swap', 20)}</button>
        <div class="mv-w"><span class="mv-l">To</span><strong>${wallet(d.toWalletId).name}</strong><span class="muted small">${money(b[d.toWalletId])}</span></div>
      </div><p class="from-note">${d.walletId === 'sbi' ? 'Use this for ATM withdrawals.' : 'Use this when you deposit cash into SBI.'}</p></div>`;
    }
    const lockedType = editing || c.hidden;
    const seg = lockedType ? `<h2 class="sheet-title">${editing ? 'Edit' : 'Record'} ${d.type === 'expense' ? (c.hidden ? 'payment' : 'expense') : d.type === 'income' ? 'money received' : 'move'}</h2>` : `<div class="seg big">${[['expense', 'Spent'], ['income', 'Received'], ['transfer', 'Move']].map(([k, l]) => `<button class="${d.type === k ? 'on ' + k : ''}" data-type="${k}">${l}</button>`).join('')}</div>`;
    return `<div class="sheet-head">${seg}${!editing && speechSupported() ? `<button class="icon-btn" data-voice-in aria-label="Speak instead">${icon('mic', 20)}</button>` : ''}<button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="sheet-body">${amountInput(d.amount)}${mid}${date}${note}</div>
      <div class="sheet-foot">${editing ? `<button class="btn danger-ghost" data-deltx aria-label="Delete">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide ${d.type}" data-save>${editing ? 'Save changes' : d.type === 'expense' ? (c.hidden || c.ext ? 'Save payment' : 'Add expense') : d.type === 'income' ? 'Add money received' : 'Move money'}</button></div>`;
  };

  openSheet('<div class="sheet-inner"></div>', (sheet, close) => {
    const inner = $('.sheet-inner', sheet);
    const capture = () => {
      const a = $('#amt', inner); if (a) d.amount = a.value;
      const n = $('#note', inner); if (n) d.note = n.value;
      const dt = $('#date', inner); if (dt) d.date = dt.value || todayISO();
      const tm = $('#time', inner); if (tm) d.time = tm.value;
    };
    const draw = (focus) => { const st = $('.sheet-body', inner)?.scrollTop || 0; inner.innerHTML = body(); fitAmount(inner); $('.sheet-body', inner).scrollTop = st; if (focus) setTimeout(() => $('#amt', inner)?.focus(), 260); };
    draw(!editing && !draft);
    inner.addEventListener('input', (e) => {
      cleanAmount(e);
      if (e.target.id !== 'amt') return;
      fitAmount(inner);
      d.amount = e.target.value;
      const note = $('.from-note', inner);
      if (d.type === 'expense' && note) {
        const w = MODES[d.mode].wallet;
        const avail = balances()[w] + (editing && tx.type === 'expense' && tx.walletId === w ? tx.amount : 0);
        note.classList.toggle('warn', (+e.target.value || 0) > avail);
      }
    });
    inner.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      capture();
      const ds = t.dataset;
      if (ds.type) {
        d.type = ds.type;
        d.mode = d.type === 'income' ? ui.lastMode.income : ui.lastMode.expense;
        if (d.type === 'income' && !INCOME_MODES[d.mode]) d.mode = 'upi';
        if (d.type === 'expense' && !MODES[d.mode]) d.mode = 'upi';
        d.categoryId = d.type === 'income' ? 'pocket' : 'food';
        d.personId = d.type === 'income' ? (d.personId || people()[0]?.id || null) : null;
        d.tripId = d.type === 'expense' ? (d.tripId || activeTrip()?.id || null) : null;
        draw();
      } else if (ds.cat) {
        d.categoryId = ds.cat;
        if (cat(ds.cat).needsPerson && !d.personId) d.personId = people().find((p) => p.relation === 'Friend')?.id || people()[0]?.id || null;
        if (d.type === 'expense' && !cat(ds.cat).needsPerson) d.personId = null;
        draw();
      } else if (ds.mode) { d.mode = ds.mode; draw(); }
      else if (ds.pp !== undefined) { d.personId = ds.pp || null; draw(); }
      else if (ds.trip !== undefined) { d.tripId = ds.trip || null; d.split = null; draw(); }
      else if (ds.split) {
        const s = new Set(d.split && d.split.length ? d.split : ['me']);
        s.has(ds.split) ? s.delete(ds.split) : s.add(ds.split);
        d.split = s.size ? [...s] : ['me']; draw();
      } else if ('splitall' in ds) { d.split = ['me', ...(trip(d.tripId)?.members || [])]; draw(); }
      else if ('newperson' in ds) openPersonEdit(null, (id) => { d.personId = id; draw(); });
      else if ('swapwallets' in ds) { [d.walletId, d.toWalletId] = [d.toWalletId, d.walletId]; draw(); }
      else if ('voiceIn' in ds) { close(); setTimeout(() => openVoice(), 300); }
      else if ('deltx' in ds) {
        ask('Delete this transaction?', `${money(+d.amount || 0)} on ${dayLabel(d.date).toLowerCase()} will be removed and your balances will update.`, 'Delete').then((ok) => { if (ok) { store.deleteTxn(d.id); close(); toast('Transaction deleted'); bus.render(); } });
      } else if ('save' in ds) {
        if (!(parseFloat(d.amount) > 0)) return shake($('#amt', inner));
        if (cat(d.categoryId).needsPerson && !d.personId) { toast('Pick who this is with'); return; }
        commitTxn(d, { editing });
        close(); bus.render();
      }
    });
  });
}

// ---------- friend paid (shared trip cost, no wallet effect) ----------
export function openFriendPaid({ tripId = null, tx = null } = {}) {
  const editing = !!tx;
  const tr0 = trip(tripId || tx?.tripId);
  const members = (tr0?.members || []).filter((m) => person(m));
  const d = tx ? { ...tx } : { type: 'tripshare', amount: '', date: todayISO(), time: nowTime(), note: '', tripId: tr0?.id, personId: members[0], categoryId: 'food', split: ['me', ...members] };
  const body = () => {
    const n = (d.split || []).length || 1;
    return `${amountInput(d.amount)}
    <div class="field"><span>Paid by</span><div class="chips tight">${members.map((m) => { const p = person(m); return `<button class="chip person-chip ${d.personId === m ? 'on' : ''}" data-payer="${m}" style="--c:${p.color}"><span class="pdot">${esc(p.name[0])}</span>${esc(p.name)}</button>`; }).join('')}</div></div>
    <div class="field"><span>Category</span><div class="cats">${categories('expense').filter((c) => !c.ext).map((x) => `<button class="cat ${d.categoryId === x.id ? 'on' : ''}" data-cat="${x.id}" style="--c:${x.color}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('')}</div></div>
    <div class="field"><span>Split between</span><div class="chips tight"><button class="chip ${d.split.includes('me') ? 'on' : ''}" data-split="me">Me</button>${members.map((m) => { const p = person(m); return `<button class="chip person-chip ${d.split.includes(m) ? 'on' : ''}" data-split="${m}" style="--c:${p.color}"><span class="pdot">${esc(p.name[0])}</span>${esc(p.name)}</button>`; }).join('')}</div>
    <p class="from-note">${d.split.includes('me') ? `Your share is ${money((+d.amount || 0) / n)}. You will owe ${esc(person(d.personId)?.name || 'them')} this.` : 'You are not part of this one, so you owe nothing.'} Your SBI and cash don't change.</p></div>
    <div class="row2"><label class="field"><span>Date</span><input type="date" id="date" value="${d.date}" max="${todayISO()}"></label><label class="field"><span>Time</span><input type="time" id="time" value="${d.time || ''}"></label></div>
    <label class="field"><span>Note</span><input id="note" value="${esc(d.note)}" placeholder="e.g. Hotel for 2 nights" maxlength="80"></label>`;
  };
  openSheet(sheetFrame(editing ? 'Edit shared expense' : `A friend paid${tr0 ? ` on ${esc(tr0.name)}` : ''}`, '', `${editing ? `<button class="btn danger-ghost" data-deltx aria-label="Delete">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide transfer" data-save>${editing ? 'Save changes' : 'Add shared expense'}</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const capture = () => { d.amount = $('#amt', sheet).value; d.note = $('#note', sheet).value; d.date = $('#date', sheet).value || todayISO(); d.time = $('#time', sheet).value; };
    const draw = () => { const st = bodyEl.scrollTop; bodyEl.innerHTML = body(); fitAmount(sheet); bodyEl.scrollTop = st; };
    draw(); if (!editing) setTimeout(() => $('#amt', sheet)?.focus(), 260);
    sheet.addEventListener('input', (e) => { cleanAmount(e); if (e.target.id === 'amt') fitAmount(sheet); });
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if (ds.payer || ds.cat || ds.split) capture();
      if (ds.payer) { d.personId = ds.payer; draw(); }
      else if (ds.cat) { d.categoryId = ds.cat; draw(); }
      else if (ds.split) { const s = new Set(d.split); s.has(ds.split) ? s.delete(ds.split) : s.add(ds.split); d.split = s.size ? [...s] : ['me']; draw(); }
      else if ('deltx' in ds) ask('Delete this shared expense?', 'Trip balances will update.', 'Delete').then((ok) => { if (ok) { store.deleteTxn(d.id); close(); toast('Deleted'); bus.render(); } });
      else if ('save' in ds) {
        capture();
        if (!(parseFloat(d.amount) > 0)) return shake($('#amt', sheet));
        if (!d.personId) return toast('Pick who paid');
        commitTxn(d, { editing }); close(); bus.render();
      }
    });
  });
}

// ---------- people ----------
export function openPersonEdit(id, onSaved) {
  const p = id ? person(id) : { name: '', relation: 'Friend' };
  openSheet(sheetFrame(id ? 'Edit person' : 'Add a person', `<label class="field"><span>Name</span><input id="pname" value="${esc(p.name)}" placeholder="e.g. Ravi" maxlength="30"></label>
    <div class="field"><span>Relation</span>${chipRow(['Family', 'Friend', 'Relative', 'Roommate', 'Other'].map((r) => [r, r]), p.relation, 'rel')}</div>
    ${id ? `<div class="field"><span>Colour</span>${colorRow(p.color)}</div>` : ''}`,
  `${id ? `<button class="btn danger-ghost" data-delp aria-label="Remove">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savep>${id ? 'Save changes' : 'Add person'}</button>`), (sheet, close) => {
    let rel = p.relation, color = p.color;
    setTimeout(() => $('#pname', sheet)?.focus(), 260);
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.rel) { rel = t.dataset.rel; sheet.querySelectorAll('[data-rel]').forEach((b) => b.classList.toggle('on', b === t)); }
      if (t.dataset.color) { color = t.dataset.color; sheet.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === t)); }
      if ('savep' in t.dataset) {
        const name = $('#pname', sheet).value.trim();
        if (!name) return shake($('#pname', sheet));
        const rec = store.savePerson({ ...(id ? { id, color } : {}), name, relation: rel });
        close(); toast(id ? 'Changes saved' : `${name} added`);
        if (onSaved) onSaved(rec.id); else bus.render();
      }
      if ('delp' in t.dataset) ask(`Remove ${p.name}?`, 'Money already recorded with them stays in your history.', 'Remove').then((ok) => { if (ok) { store.deletePerson(id); close(); toast(`${p.name} removed`); bus.go('people'); } });
    });
  });
}

// ---------- trips ----------
export function openTripEdit(id) {
  const t0 = id ? trip(id) : null;
  const d = t0 ? { ...t0, members: [...(t0.members || [])] } : { name: '', emoji: '🏖️', start: todayISO(), end: '', budget: '', members: [], color: COLORS[8] };
  const body = () => `<label class="field"><span>Trip name</span><input id="tname" value="${esc(d.name)}" placeholder="e.g. Goa with college gang" maxlength="40"></label>
    <div class="field"><span>Icon</span>${emojiRow(d.emoji)}</div>
    <div class="row2 even"><label class="field"><span>Starts</span><input type="date" id="tstart" value="${d.start}"></label><label class="field"><span>Ends</span><input type="date" id="tend" value="${d.end || ''}"></label></div>
    <label class="field"><span>Your budget for this trip (optional)</span><span class="money-in"><span>₹</span><input id="tbudget" data-money inputmode="decimal" value="${d.budget || ''}" placeholder="0"></span></label>
    <div class="field"><span>Who's going with you</span>${peopleChips(d.members, 'mem', { multi: true })}<p class="from-note">Add friends to split costs and see who owes whom.</p></div>
    <div class="field"><span>Colour</span>${colorRow(d.color)}</div>`;
  openSheet(sheetFrame(id ? 'Edit trip' : 'New trip', '', `${id ? `<button class="btn danger-ghost" data-deltrip aria-label="Delete trip">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savetrip>${id ? 'Save changes' : 'Create trip'}</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const capture = () => { d.name = $('#tname', sheet).value; d.start = $('#tstart', sheet).value || todayISO(); d.end = $('#tend', sheet).value; d.budget = $('#tbudget', sheet).value; };
    const draw = () => { const st = bodyEl.scrollTop; bodyEl.innerHTML = body(); bodyEl.scrollTop = st; };
    draw(); if (!id) setTimeout(() => $('#tname', sheet)?.focus(), 260);
    sheet.addEventListener('input', cleanAmount);
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if (ds.emoji || ds.mem || ds.color || 'newperson' in ds) capture();
      if (ds.emoji) { d.emoji = ds.emoji; draw(); }
      else if (ds.color) { d.color = ds.color; draw(); }
      else if (ds.mem) { d.members = d.members.includes(ds.mem) ? d.members.filter((m) => m !== ds.mem) : [...d.members, ds.mem]; draw(); }
      else if ('newperson' in ds) openPersonEdit(null, (pid) => { d.members.push(pid); draw(); });
      else if ('deltrip' in ds) ask(`Delete ${d.name}?`, 'The trip is removed. Its expenses stay in your history.', 'Delete trip').then((ok) => { if (ok) { store.remove('trips', id); txns().filter((x) => x.tripId === id).forEach((x) => store.saveTxn({ ...x, tripId: null, split: null })); close(); toast('Trip deleted'); bus.go('trips'); } });
      else if ('savetrip' in ds) {
        capture();
        if (!d.name.trim()) return shake($('#tname', sheet));
        if (d.end && d.end < d.start) { toast('The end date is before the start date'); return; }
        const rec = store.save('trips', { ...d, name: d.name.trim(), budget: parseFloat(d.budget) || 0 });
        close(); toast(id ? 'Trip saved' : `${rec.name} created`);
        if (!id) bus.go('trip/' + rec.id); else bus.render();
      }
    });
  });
}
export function settle(tripId, pid, v) {
  const p = person(pid);
  if (v > 0) openAdd({ draft: { type: 'income', amount: Math.round(v * 100) / 100, date: todayISO(), categoryId: 'settle-in', personId: pid, tripId, mode: ui.lastMode.income, note: '' } });
  else openAdd({ draft: { type: 'expense', amount: Math.round(-v * 100) / 100, date: todayISO(), categoryId: 'settle-out', personId: pid, tripId, mode: ui.lastMode.expense, note: '' } });
  void p;
}

// ---------- budgets ----------
export function openBudgetEdit(id) {
  const existing = id ? store.get().budgets.find((b) => b.id === id && !b.deleted) : null;
  let sel = id || (store.get().budgets.some((b) => b.id === 'overall' && !b.deleted) ? null : 'overall');
  const used = new Set(store.get().budgets.filter((b) => !b.deleted).map((b) => b.id));
  const lastMonth = (cid) => { const l = inMonth(txns(), shiftMonth(todayISO().slice(0, 7), -1)); return cid === 'overall' ? spent(l) : l.filter((t) => t.categoryId === cid).reduce((a, t) => a + spendAmt(t), 0); };
  const body = () => `${id ? `<div class="locked-cat">${id === 'overall' ? `${icon('target', 18)} Whole month` : `<span class="tile sm" style="--c:${cat(id).color}">${cat(id).icon}</span>${esc(cat(id).name)}`}</div>`
    : `<div class="field"><span>Budget for</span><div class="cats">${[['overall', '🎯', 'Whole month', '#0F6273'], ...categories('expense').filter((c) => !c.ext).map((c) => [c.id, c.icon, c.name, c.color])].filter(([k]) => !used.has(k)).map(([k, i, n, c]) => `<button class="cat ${sel === k ? 'on' : ''}" data-bsel="${k}" style="--c:${c}"><span>${i}</span>${esc(n)}</button>`).join('')}</div></div>`}
    ${amountInput(existing?.amount || '')}
    ${sel ? `<p class="from-note center-t">Last month you spent ${money(lastMonth(sel), { round: true })} on ${sel === 'overall' ? 'everything' : esc(cat(sel).name.toLowerCase())}.</p>` : ''}`;
  openSheet(sheetFrame(id ? 'Edit budget' : 'Add a budget', '', `${id ? `<button class="btn danger-ghost" data-delbudget aria-label="Remove budget">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savebudget>Save budget</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const draw = () => { const v = $('#amt', sheet)?.value; bodyEl.innerHTML = body(); if (v) $('#amt', sheet).value = v; fitAmount(sheet); };
    draw(); setTimeout(() => $('#amt', sheet)?.focus(), 260);
    sheet.addEventListener('input', (e) => { cleanAmount(e); fitAmount(sheet); });
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.bsel) { sel = t.dataset.bsel; draw(); }
      if ('delbudget' in t.dataset) { store.remove('budgets', id); close(); toast('Budget removed'); bus.render(); }
      if ('savebudget' in t.dataset) {
        const v = parseFloat($('#amt', sheet).value);
        if (!sel) return toast('Pick what this budget is for');
        if (!(v > 0)) return shake($('#amt', sheet));
        store.save('budgets', { id: sel, amount: v, deleted: false }); close(); toast('Budget saved'); bus.render();
      }
    });
  });
}

// ---------- goals ----------
export function openGoalEdit(id) {
  const g0 = id ? goals().find((g) => g.id === id) : null;
  const d = g0 ? { ...g0 } : { name: '', emoji: '💻', target: '', deadline: '', color: COLORS[2], entries: [] };
  const body = () => `<label class="field"><span>Saving for</span><input id="gname" value="${esc(d.name)}" placeholder="e.g. New laptop" maxlength="40"></label>
    <div class="field"><span>Icon</span>${emojiRow(d.emoji)}</div>
    <label class="field"><span>Target amount</span><span class="money-in"><span>₹</span><input id="gtarget" data-money inputmode="decimal" value="${d.target || ''}" placeholder="60000"></span></label>
    <label class="field"><span>By when (optional)</span><input type="date" id="gdate" value="${d.deadline || ''}" min="${todayISO()}"></label>
    <div class="field"><span>Colour</span>${colorRow(d.color)}</div>`;
  openSheet(sheetFrame(id ? 'Edit goal' : 'New savings goal', '', `${id ? `<button class="btn danger-ghost" data-delgoal aria-label="Delete goal">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savegoal>${id ? 'Save changes' : 'Create goal'}</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const capture = () => { d.name = $('#gname', sheet).value; d.target = $('#gtarget', sheet).value; d.deadline = $('#gdate', sheet).value; };
    const draw = () => { const st = bodyEl.scrollTop; bodyEl.innerHTML = body(); bodyEl.scrollTop = st; };
    draw(); if (!id) setTimeout(() => $('#gname', sheet)?.focus(), 260);
    sheet.addEventListener('input', cleanAmount);
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if (ds.emoji) { capture(); d.emoji = ds.emoji; draw(); }
      else if (ds.color) { capture(); d.color = ds.color; draw(); }
      else if ('delgoal' in ds) ask(`Delete ${d.name}?`, 'The goal and its savings history are removed. Your balances do not change.', 'Delete goal').then((ok) => { if (ok) { store.remove('goals', id); close(); toast('Goal deleted'); bus.render(); } });
      else if ('savegoal' in ds) {
        capture();
        if (!d.name.trim()) return shake($('#gname', sheet));
        if (!(parseFloat(d.target) > 0)) return shake($('#gtarget', sheet));
        store.save('goals', { ...d, name: d.name.trim(), target: parseFloat(d.target) }); close(); toast(id ? 'Goal saved' : 'Goal created'); bus.render();
      }
    });
  });
}
export function openGoalMoney(id, take = false) {
  const g = goals().find((x) => x.id === id);
  const saved = (g.entries || []).reduce((a, e) => a + e.amount, 0);
  openSheet(sheetFrame(take ? `Take out of ${esc(g.name)}` : `Add to ${esc(g.name)}`, `${amountInput('')}<p class="from-note center-t">${money(saved, { round: true })} saved so far, ${money(Math.max(0, g.target - saved), { round: true })} to go.</p>`,
    `<button class="btn primary wide ${take ? 'expense' : 'income'}" data-gsave>${take ? 'Take out' : 'Add savings'}</button>`), (sheet, close) => {
    fitAmount(sheet); setTimeout(() => $('#amt', sheet)?.focus(), 260);
    sheet.addEventListener('input', (e) => { cleanAmount(e); fitAmount(sheet); });
    sheet.addEventListener('click', (e) => {
      if (!e.target.closest('[data-gsave]')) return;
      let v = parseFloat($('#amt', sheet).value);
      if (!(v > 0)) return shake($('#amt', sheet));
      if (take) v = -Math.min(v, saved);
      const entries = [...(g.entries || []), { date: todayISO(), amount: v }];
      store.save('goals', { ...g, entries });
      close();
      const now = saved + v;
      toast(!take && now >= g.target && saved < g.target ? `🎉 You reached ${g.name}!` : take ? `${money(-v)} taken out` : `${money(v)} added to ${g.name}`);
      bus.render();
    });
  });
}

// ---------- bills ----------
export function openBillEdit(id) {
  const b0 = id ? recurring().find((x) => x.id === id) : null;
  const d = b0 ? { ...b0 } : { name: '', amount: '', categoryId: 'subs', mode: ui.lastMode.expense, freq: 'monthly', next: todayISO(), auto: false };
  const body = () => `<label class="field"><span>Name</span><input id="bname" value="${esc(d.name)}" placeholder="e.g. Netflix, Mess fee, Jio recharge" maxlength="40"></label>
    ${amountInput(d.amount)}
    <div class="field"><span>Category</span><div class="cats">${categories('expense').filter((c) => !c.ext).map((x) => `<button class="cat ${d.categoryId === x.id ? 'on' : ''}" data-cat="${x.id}" style="--c:${x.color}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('')}</div></div>
    <div class="field"><span>Repeats</span>${chipRow([['weekly', 'Every week'], ['monthly', 'Every month'], ['yearly', 'Every year']], d.freq, 'freq')}</div>
    <label class="field"><span>Next due</span><input type="date" id="bnext" value="${d.next}"></label>
    <div class="field"><span>Paid with</span>${chipRow(Object.entries(MODES).map(([k, m]) => [k, m.label]), d.mode, 'mode')}</div>
    <button class="toggle ${d.auto ? 'on' : ''}" data-auto><span class="tg-text"><strong>Add it automatically</strong><span>Logs the expense on the due date. Turn off to get a reminder with a Pay button instead.</span></span><span class="tg-sw"></span></button>`;
  openSheet(sheetFrame(id ? 'Edit bill' : 'Add a bill', '', `${id ? `<button class="btn danger-ghost" data-delbill aria-label="Delete bill">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savebill>${id ? 'Save changes' : 'Add bill'}</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const capture = () => { d.name = $('#bname', sheet).value; d.amount = $('#amt', sheet).value; d.next = $('#bnext', sheet).value || todayISO(); };
    const draw = () => { const st = bodyEl.scrollTop; bodyEl.innerHTML = body(); fitAmount(sheet); bodyEl.scrollTop = st; };
    draw(); if (!id) setTimeout(() => $('#bname', sheet)?.focus(), 260);
    sheet.addEventListener('input', (e) => { cleanAmount(e); fitAmount(sheet); });
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return; const ds = t.dataset;
      if (ds.cat || ds.freq || ds.mode || 'auto' in ds) capture();
      if (ds.cat) { d.categoryId = ds.cat; draw(); }
      else if (ds.freq) { d.freq = ds.freq; draw(); }
      else if (ds.mode) { d.mode = ds.mode; draw(); }
      else if ('auto' in ds) { d.auto = !d.auto; draw(); }
      else if ('delbill' in ds) ask(`Delete ${d.name}?`, 'Expenses already logged for it stay in your history.', 'Delete').then((ok) => { if (ok) { store.remove('recurring', id); close(); toast('Bill deleted'); bus.render(); } });
      else if ('savebill' in ds) {
        capture();
        if (!d.name.trim()) return shake($('#bname', sheet));
        if (!(parseFloat(d.amount) > 0)) return shake($('#amt', sheet));
        store.save('recurring', { ...d, name: d.name.trim(), amount: parseFloat(d.amount) });
        close(); toast(id ? 'Bill saved' : 'Bill added'); bus.render();
      }
    });
  });
}
export function payBillNow(id) {
  const b = recurring().find((x) => x.id === id);
  if (!b) return;
  ask(`Pay ${b.name}?`, `${money(b.amount)} will be logged as spent with ${MODES[b.mode].label} today, and the next due date moves ahead.`, 'Mark as paid', false).then((ok) => {
    if (!ok) return;
    payBill(b, todayISO());
    toast(`${b.name} paid`); bus.render();
  });
}

// ---------- categories ----------
export function openCatEdit(key) {
  const isNew = key.startsWith('new:');
  const c0 = isNew ? { name: '', icon: '🍿', color: COLORS[3], type: key.split(':')[1] } : cat(key);
  const custom = isNew || c0.custom;
  const d = { ...c0 };
  const body = () => `<label class="field"><span>Name</span><input id="cname" value="${esc(d.name)}" placeholder="e.g. Gym, Pets, Petrol" maxlength="24"></label>
    <div class="field"><span>Icon</span>${emojiRow(d.icon)}</div><div class="field"><span>Colour</span>${colorRow(d.color)}</div>`;
  openSheet(sheetFrame(isNew ? 'New category' : 'Edit category', '', `${!isNew && custom ? `<button class="btn danger-ghost" data-delcat aria-label="Delete category">${icon('trash', 18)}</button>` : ''}<button class="btn primary wide" data-savecat>${isNew ? 'Add category' : 'Save changes'}</button>`), (sheet, close) => {
    const bodyEl = $('.sheet-body', sheet);
    const draw = () => { d.name = $('#cname', sheet)?.value ?? d.name; bodyEl.innerHTML = body(); };
    draw();
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.emoji) { d.icon = t.dataset.emoji; draw(); }
      else if (t.dataset.color) { d.color = t.dataset.color; draw(); }
      else if ('delcat' in t.dataset) ask(`Delete ${d.name}?`, 'Past transactions keep it. You just won’t see it when adding new ones.', 'Delete').then((ok) => { if (ok) { store.remove('categories', d.id); close(); bus.render(); } });
      else if ('savecat' in t.dataset) {
        const name = $('#cname', sheet).value.trim();
        if (!name) return shake($('#cname', sheet));
        store.save('categories', { ...d, name, custom });
        close(); toast(isNew ? `${name} added` : 'Saved'); bus.render();
      }
    });
  });
}

// ---------- PIN ----------
async function hashPin(pin) {
  const data = new TextEncoder().encode('kharcha-pin:' + pin);
  if (crypto?.subtle) { const h = await crypto.subtle.digest('SHA-256', data); return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join(''); }
  let h = 5381; for (const b of data) h = ((h << 5) + h + b) >>> 0; return 'x' + h.toString(16);
}
export const pinSet = () => { try { return !!localStorage.getItem('kharcha.pin'); } catch (e) { return false; } };
export const checkPin = async (pin) => { try { return (await hashPin(pin)) === localStorage.getItem('kharcha.pin'); } catch (e) { return false; } };
export function keypad(el, { title, sub, onDone, extra = '' }) {
  let v = '';
  const draw = (err = false) => {
    el.innerHTML = `<div class="kp"><div class="kp-logo">₹</div><h2>${esc(title)}</h2><p class="muted ${err ? 'warn-t' : ''}">${esc(sub)}</p>
      <div class="kp-dots ${err ? 'shake' : ''}">${[0, 1, 2, 3].map((i) => `<span class="${i < v.length ? 'on' : ''}"></span>`).join('')}</div>
      <div class="kp-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-k="${n}">${n}</button>`).join('')}<span></span><button data-k="0">0</button><button data-k="del" aria-label="Delete digit">${icon('backspace', 24)}</button></div>${extra}</div>`;
  };
  draw();
  el.addEventListener('click', async (e) => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    if (k === 'del') v = v.slice(0, -1); else if (v.length < 4) v += k;
    draw();
    if (v.length === 4) { const pin = v; v = ''; const ok = await onDone(pin); if (ok === false) { sub = 'Wrong PIN. Try again.'; draw(true); } }
  });
  return { setSub: (s) => { sub = s; v = ''; draw(); } };
}
export function openPinSetup(mode = 'set') {
  openSheet('<div class="sheet-inner"><div class="sheet-head"><span style="flex:1"></span><button class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div><div class="sheet-body kp-wrap"></div></div>', (sheet, close) => {
    const wrap = $('.kp-wrap', sheet);
    let step = mode === 'set' ? 'new' : 'current';
    let first = '';
    const kp = keypad(wrap, {
      title: mode === 'off' ? 'Turn off PIN' : mode === 'change' ? 'Change PIN' : 'Set a PIN',
      sub: step === 'current' ? 'Enter your current PIN' : 'Choose a 4-digit PIN',
      onDone: async (pin) => {
        if (step === 'current') {
          if (!(await checkPin(pin))) return false;
          if (mode === 'off') { try { localStorage.removeItem('kharcha.pin'); } catch (e) { /* ignore */ } close(); toast('PIN turned off'); bus.render(); return true; }
          step = 'new'; kp.setSub('Choose a new 4-digit PIN'); return true;
        }
        if (step === 'new') { first = pin; step = 'confirm'; kp.setSub('Enter it again to confirm'); return true; }
        if (pin !== first) { step = 'new'; kp.setSub('The PINs did not match. Choose a PIN again.'); return true; }
        try { localStorage.setItem('kharcha.pin', await hashPin(pin)); } catch (e) { /* ignore */ }
        close(); toast('PIN set. Kharcha will ask for it when it opens.'); bus.render(); return true;
      },
    });
  });
}

// ---------- voice ----------
const PERIODS = {
  today: ['today', () => { const t = todayISO(); return (d) => d === t; }],
  yesterday: ['yesterday', () => { const y = new Date(Date.now() - 864e5); const s = new Date(y - y.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return (d) => d === s; }],
  week: ['in the last 7 days', () => { const y = new Date(Date.now() - 6 * 864e5); const s = new Date(y - y.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); return (d) => d >= s; }],
  month: ['this month', () => { const m = todayISO().slice(0, 7); return (d) => d.startsWith(m); }],
  lastmonth: ['last month', () => { const m = shiftMonth(todayISO().slice(0, 7), -1); return (d) => d.startsWith(m); }],
  year: ['this year', () => { const y = todayISO().slice(0, 4); return (d) => d.startsWith(y); }],
  all: ['in total', () => () => true],
};
export function answer(q) {
  const b = balances();
  if (q.type === 'balance') {
    if (q.wallet === 'cash') return `You have ${money(b.cash)} cash in hand.`;
    if (q.wallet === 'sbi') return `You have ${money(b.sbi)} in SBI.`;
    return `You have ${money(b.sbi + b.cash)} in total: ${money(b.sbi)} in SBI and ${money(b.cash)} cash in hand.`;
  }
  const [label, mk] = PERIODS[q.period] || PERIODS.month;
  const inP = mk();
  if (q.type === 'spent') {
    let list = txns().filter((t) => inP(t.date));
    if (q.categoryId) list = list.filter((t) => t.categoryId === q.categoryId);
    if (q.mode) list = list.filter((t) => t.mode === q.mode);
    const v = spent(list);
    return `You spent ${money(v, { round: true })}${q.categoryId ? ` on ${cat(q.categoryId).name.toLowerCase()}` : ''}${q.mode ? ` with ${MODES[q.mode].label}` : ''} ${label}.`;
  }
  if (q.type === 'received') return `You received ${money(received(txns().filter((t) => inP(t.date))), { round: true })} ${label}.`;
  if (q.type === 'fromPerson') {
    const p = person(q.personId);
    const v = txns().filter((t) => t.personId === q.personId && inP(t.date)).reduce((a, t) => a + incomeAmt(t), 0);
    return `${p.name} gave you ${money(v, { round: true })} ${label}.`;
  }
  if (q.type === 'owe') {
    const list = q.personId ? [person(q.personId)] : people();
    const parts = list.map((p) => ({ p, l: ledger(p.id) })).filter((x) => x.l.iOwe || x.l.owesMe).map(({ p, l }) => [l.iOwe ? `you owe ${p.name} ${money(l.iOwe, { round: true })}` : '', l.owesMe ? `${p.name} owes you ${money(l.owesMe, { round: true })}` : ''].filter(Boolean).join(' and '));
    return parts.length ? parts.join('. ').replace(/^./, (c) => c.toUpperCase()) + '.' : 'No loans pending. You are all square.';
  }
  if (q.type === 'budget') {
    const bs = budgetStatus(todayISO().slice(0, 7));
    if (!bs.overall) return 'You have not set a monthly budget yet. Open Budgets to set one.';
    const left = bs.overall.amount - bs.overall.spent;
    return left >= 0 ? `You have ${money(left, { round: true })} left from your ${money(bs.overall.amount, { round: true })} budget this month.` : `You are ${money(-left, { round: true })} over your monthly budget.`;
  }
  return 'Sorry, I did not get that.';
}
function draftSummary(d) {
  if (d.type === 'transfer') return { title: `Move ${money(d.amount)}`, sub: `${wallet(d.walletId).name} → ${wallet(d.toWalletId).name}`, cls: 'transfer' };
  const c = cat(d.categoryId);
  if (d.type === 'income') return { title: `Received ${money(d.amount)}`, sub: [person(d.personId)?.name ? `from ${person(d.personId).name}` : '', c.name, INCOME_MODES[d.mode]?.label, d.date !== todayISO() ? dayLabel(d.date) : ''].filter(Boolean).join(', '), cls: 'income', icon: c.icon };
  return { title: `${c.ext ? '' : 'Spent '}${money(d.amount)}${c.ext ? ` ${c.name.toLowerCase()}` : ''}`, sub: [c.ext && person(d.personId) ? person(d.personId).name : c.name, d.note, MODES[d.mode]?.label, d.tripId ? `${trip(d.tripId)?.emoji || ''} ${trip(d.tripId)?.name}` : '', d.date !== todayISO() ? dayLabel(d.date) : ''].filter(Boolean).join(', '), cls: 'expense', icon: c.icon };
}
export function openVoice() {
  const can = speechSupported();
  openSheet(sheetFrame('Voice', `<div class="voice">
    ${can ? `<button class="mic-big" data-mic aria-label="Start listening"><span class="mic-pulse"></span>${icon('mic', 34)}</button><p class="v-state" id="v-state">Tap the mic and speak</p>` : '<p class="v-state">Voice input isn’t available in this browser. Type a command instead.</p>'}
    <p class="v-heard" id="v-heard"></p>
    <div id="v-result"></div>
    <form class="v-type" id="v-form"><input id="v-text" placeholder="Or type, e.g. spent 120 on auto" autocomplete="off" enterkeyhint="go"><button class="icon-btn" type="submit" aria-label="Run command">${icon('chevR', 20)}</button></form>
    <div class="v-examples"><p class="lbl">Try saying</p>${['Spent 250 on biryani with cash', 'Dad sent me 3000', 'Withdrew 2000 from ATM', 'Lent 500 to Ravi', 'How much did I spend this week?', 'What is my balance?', 'How is my budget?', 'Open trips'].map((x) => `<button class="chip" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
  </div>`, ''), (sheet, close) => {
    $('.sheet-foot', sheet).remove();
    let stop = null;
    const state = $('#v-state', sheet), heard = $('#v-heard', sheet), result = $('#v-result', sheet);
    let pending = null;
    const run = (text) => {
      heard.textContent = `“${text}”`;
      const s = store.get();
      const res = parseCommand(text, { people: people(), trips: trips(), categories: s.categories.filter((c) => !c.deleted), today: todayISO(), lastMode: ui.lastMode });
      if (res.kind === 'nav') { close(); bus.go(res.route); speak('Opening ' + res.route); return; }
      if (res.kind === 'query') {
        const a = answer(res.q);
        result.innerHTML = `<div class="v-answer">${icon('sparkle', 20)}<p>${esc(a)}</p></div>`;
        speak(a); return;
      }
      if (res.kind === 'txn') {
        pending = res.draft;
        const sm = draftSummary(pending);
        result.innerHTML = `<div class="v-card ${sm.cls}"><span class="tile">${sm.icon || icon('swap', 20)}</span><span class="row-main"><span class="row-t">${esc(sm.title)}</span><span class="row-s">${esc(sm.sub)}</span></span></div>
          <div class="two-btn"><button class="btn ghost wide" data-vedit>${icon('edit', 18)} Change</button><button class="btn primary wide ${sm.cls}" data-vsave>${icon('check', 18)} Save</button></div>`;
        speak(`${sm.title}. ${sm.sub}. Say save or tap save.`.replace(/, /g, ', '));
        return;
      }
      result.innerHTML = `<div class="v-answer warn">${icon('mic', 20)}<p>I couldn't find an amount or question in that. Try “spent 120 on auto” or “how much did I spend today”.</p></div>`;
    };
    const start = () => {
      if (stop) { stop(); return; }
      result.innerHTML = ''; heard.textContent = '';
      if (pending) pending = null;
      sheet.classList.add('listening'); state.textContent = 'Listening…';
      try {
        stop = listen({
          onPartial: (t) => { heard.textContent = t; },
          onFinal: (t) => {
            if (/^\s*(save|yes|ok|okay|confirm|done)\s*$/i.test(t) && pending) { $('[data-vsave]', sheet)?.click(); return; }
            run(t);
          },
          onError: (err) => { state.textContent = err === 'not-allowed' || err === 'service-not-allowed' ? 'Microphone access is blocked. Allow it in Chrome site settings, or type below.' : err === 'no-speech' ? 'I didn’t hear anything. Tap the mic and try again.' : err === 'network' ? 'Voice needs internet. Type your command below instead.' : 'Voice stopped. Tap the mic to try again.'; },
          onEnd: () => { stop = null; sheet.classList.remove('listening'); if (state.textContent === 'Listening…') state.textContent = 'Tap the mic to speak again'; },
        });
      } catch (e) { sheet.classList.remove('listening'); state.textContent = 'Could not start the microphone. Type below instead.'; }
    };
    sheet.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if ('mic' in t.dataset) start();
      else if (t.dataset.ex) run(t.dataset.ex);
      else if ('vsave' in t.dataset && pending) {
        if (cat(pending.categoryId).needsPerson && !pending.personId) { close(); setTimeout(() => openAdd({ draft: pending }), 300); return; }
        commitTxn(pending); pending = null; close(); bus.render();
      } else if ('vedit' in t.dataset && pending) { const p = pending; close(); setTimeout(() => openAdd({ draft: p }), 300); }
      else if ('close' in t.dataset && stop) stop();
    });
    $('#v-form', sheet).addEventListener('submit', (e) => { e.preventDefault(); const v = $('#v-text', sheet).value.trim(); if (v) { run(v); $('#v-text', sheet).value = ''; } });
    if (can) setTimeout(start, 350);
  });
}
