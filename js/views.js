import { store, txns, people, cat, person, wallet, trips, trip, goals, recurring, categories, balances, inMonth, sumBy, spent, received, spendAmt, incomeAmt, ledger, allNets, tripStats, budgetStatus, MODES } from './store.js';
import { esc, money, compact, todayISO, toISO, parseISO, monthLabel, shiftMonth, dayLabel, greeting, icon, donut, bars, line, ring, pctColor } from './ui.js';
import { ui, txRow, txTitle, txSub, monthSwitch, empty, pageHead, modeLabel } from './shared.js';
import { config as syncConfig, status as syncStatus, SETUP_SQL, pushSql } from './sync.js';
import * as Push from './push.js';
import { speechSupported } from './voice.js';

const today = () => todayISO();
const curYM = () => today().slice(0, 7);
const fmtDate = (iso, opts = { day: 'numeric', month: 'short' }) => parseISO(iso).toLocaleDateString('en-IN', opts);
const daysUntil = (iso) => Math.round((parseISO(iso) - parseISO(today())) / 864e5);
const dueText = (iso) => { const n = daysUntil(iso); return n < 0 ? `${-n} day${n < -1 ? 's' : ''} overdue` : n === 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due in ${n} days`; };
const personTile = (p, cls = 'sm') => `<span class="tile person ${cls}" style="--c:${p?.color || '#8D9AAE'}">${esc((p?.name || '?')[0])}</span>`;
const fromList = (from) => {
  const max = from[0]?.[1] || 1;
  return `<ul class="from">${from.map(([id, v]) => { const p = person(id); return `<li>${personTile(p)}<span class="fr-n">${esc(p?.name || 'Other sources')}</span><span class="fr-bar"><span style="width:${(v / max) * 100}%;background:${p?.color || '#8D9AAE'}"></span></span><span class="fr-v">${compact(v)}</span></li>`; }).join('')}</ul>`;
};
const meter = (p, color) => `<span class="meter"><span style="width:${Math.min(100, p * 100)}%;background:${color || pctColor(p)}"></span></span>`;

// ---------------- HOME ----------------
export function Home() {
  const s = store.get();
  const b = balances();
  const totalBal = b.sbi + b.cash;
  const month = inMonth(txns(), curYM());
  const sp = spent(month);
  const got = received(month);
  const pos = Math.max(0, b.sbi) + Math.max(0, b.cash);
  const sbiPct = pos ? (Math.max(0, b.sbi) / pos) * 100 : 50;

  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return toISO(d); });
  const all = txns();
  const week = days.map((d) => ({ label: parseISO(d).toLocaleDateString('en-IN', { weekday: 'narrow' }), value: all.filter((t) => t.date === d).reduce((a, t) => a + spendAmt(t), 0) }));
  const weekTotal = week.reduce((a, d) => a + d.value, 0);

  const cats = sumBy(month, (t) => t.categoryId, spendAmt).slice(0, 4);
  const from = sumBy(all, (t) => t.personId || 'other', incomeAmt);
  const recent = all.slice(0, 5);
  const bs = budgetStatus(curYM());
  const due = recurring().filter((r) => !r.auto && daysUntil(r.next) <= 3).slice(0, 3);
  const live = trips().filter((t) => !t.archived && t.start <= today() && (!t.end || t.end >= today()));
  const nets = Object.values(allNets());
  const iOwe = nets.reduce((a, v) => a + (v < 0 ? -v : 0), 0), owesMe = nets.reduce((a, v) => a + (v > 0 ? v : 0), 0);

  return `
  <header class="top">
    <div><p class="hello">${greeting()},</p><h1 class="name">${esc(s.settings.name || 'there')}</h1></div>
    <div class="top-actions">
      <button class="avatar mic" data-voice aria-label="Voice command">${icon('mic', 20)}</button>
      <a class="avatar" href="#/settings" aria-label="Settings">${icon('settings', 20)}</a>
    </div>
  </header>

  <section class="hero" aria-label="Balance">
    <div class="hero-pattern" aria-hidden="true"></div>
    <p class="hero-l">You have</p>
    <p class="hero-amt">${money(totalBal)}</p>
    <div class="split" aria-hidden="true"><span style="width:${sbiPct}%"></span><span style="width:${100 - sbiPct}%"></span></div>
    <div class="hero-wallets">
      <div><span class="dot sbi"></span><span class="hw-l">SBI Bank</span><span class="hw-v">${money(b.sbi)}</span></div>
      <div><span class="dot cash"></span><span class="hw-l">Cash in hand</span><span class="hw-v">${money(b.cash)}</span></div>
    </div>
  </section>

  <div class="quick">
    <button data-add="expense"><span class="q-ic out">${icon('up', 20)}</span>Spent</button>
    <button data-add="income"><span class="q-ic in">${icon('down', 20)}</span>Received</button>
    <button data-split><span class="q-ic mv">${icon('users', 20)}</span>Split</button>
    <button data-voice><span class="q-ic vo">${icon('mic', 20)}</span>Speak</button>
  </div>

  ${due.length ? `<section class="card due">
    <div class="mc-head"><h2>Bills due</h2><a class="link" href="#/bills">All bills</a></div>
    ${due.map((r) => `<div class="due-row"><span class="tile sm" style="--c:${cat(r.categoryId).color}">${cat(r.categoryId).icon}</span><span class="row-main"><span class="row-t">${esc(r.name)}</span><span class="row-s ${daysUntil(r.next) < 0 ? 'warn-t' : ''}">${dueText(r.next)}, ${money(r.amount, { round: true })}</span></span><button class="btn sm primary" data-paybill="${r.id}">Pay</button></div>`).join('')}
  </section>` : ''}

  <section class="card month-card">
    <div class="mc-head"><h2>${monthLabel(curYM()).split(' ')[0]} so far</h2><a href="#/insights" class="link">Insights</a></div>
    <div class="mc-stats">
      <div><span class="lbl">Received</span><span class="v in">${money(got, { round: true })}</span></div>
      <div><span class="lbl">Spent</span><span class="v out">${money(sp, { round: true })}</span></div>
      <div><span class="lbl">Today</span><span class="v">${money(week[6].value, { round: true })}</span></div>
    </div>
    ${bs.overall ? `<a class="budget-line" href="#/budgets"><span class="bl-top"><span>Budget ${money(bs.overall.amount, { round: true })}</span><span class="${bs.overall.spent > bs.overall.amount ? 'warn-t' : 'muted'}">${bs.overall.spent > bs.overall.amount ? `${money(bs.overall.spent - bs.overall.amount, { round: true })} over` : `${money(bs.overall.amount - bs.overall.spent, { round: true })} left`}</span></span>${meter(bs.overall.spent / bs.overall.amount)}</a>` : `<a class="budget-cta" href="#/budgets">${icon('target', 18)} Set a monthly budget</a>`}
  </section>

  ${live.map((t) => { const st = tripStats(t.id); return `<a class="card trip-mini" href="#/trip/${t.id}" style="--c:${t.color || '#0F8FA0'}"><span class="tm-emoji">${t.emoji || '🧳'}</span><span class="row-main"><span class="row-t">${esc(t.name)} is on</span><span class="row-s">Your share ${money(st.mine, { round: true })}${t.budget ? ` of ${money(t.budget, { round: true })} budget` : ''}</span>${t.budget ? meter(st.mine / t.budget) : ''}</span>${icon('chevR', 18)}</a>`; }).join('')}

  ${iOwe || owesMe ? `<a class="card loans-mini" href="#/people">
    <div><span class="lbl">Friends owe you</span><span class="v in">${money(owesMe, { round: true })}</span></div>
    <div><span class="lbl">You owe</span><span class="v out">${money(iOwe, { round: true })}</span></div>
    ${icon('chevR', 18)}
  </a>` : ''}

  <section class="card">
    <div class="mc-head"><h2>Last 7 days</h2><span class="muted">${money(weekTotal, { round: true })} spent</span></div>
    ${bars(week, { highlight: 6, color: 'var(--peacock)' })}
  </section>

  ${cats.length ? `<section class="card">
    <div class="mc-head"><h2>Where it went</h2><span class="muted">This month</span></div>
    <div class="where">
      ${donut(cats.map(([id, v]) => ({ label: cat(id).name, value: v, color: cat(id).color })), { size: 128, thickness: 18, center: compact(sp), sub: 'spent' })}
      <ul class="legend">${cats.map(([id, v]) => `<li><span class="sw" style="background:${cat(id).color}"></span><span class="lg-n">${cat(id).icon} ${esc(cat(id).name)}</span><span class="lg-v">${money(v, { round: true })}</span></li>`).join('')}</ul>
    </div>
  </section>` : ''}

  ${from.length ? `<section class="card"><div class="mc-head"><h2>Money from</h2><a href="#/people" class="link">People</a></div>${fromList(from.slice(0, 4))}</section>` : ''}

  <section class="card list-card">
    <div class="mc-head"><h2>Recent</h2>${recent.length ? '<a href="#/activity" class="link">See all</a>' : ''}</div>
    ${recent.length ? `<div class="rows">${recent.map(txRow).join('')}</div>` : empty('Nothing here yet', `Tap + to log your first expense${speechSupported() ? ', or tap the mic and say "spent 120 on lunch"' : ''}.`)}
  </section>`;
}

// ---------------- ACTIVITY ----------------
function calendar(ym, list) {
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1).getDay(); // 0 Sun
  const offset = (first + 6) % 7; // Monday first
  const n = new Date(y, m, 0).getDate();
  const daily = [...Array(n)].map((_, i) => list.filter((t) => +t.date.slice(8) === i + 1).reduce((a, t) => a + spendAmt(t), 0));
  const max = Math.max(1, ...daily);
  const cells = [...Array(offset)].map(() => '<span></span>');
  for (let d = 1; d <= n; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const v = daily[d - 1];
    const lvl = v ? Math.max(0.12, v / max) : 0;
    cells.push(`<button class="cal-d ${lvl > 0.45 ? 'hot' : ''} ${iso === today() ? 'today' : ''} ${ui.day === iso ? 'on' : ''} ${iso > today() ? 'future' : ''}" data-day="${iso}" style="--a:${lvl}" aria-label="${fmtDate(iso)}: ${money(v)}"><span class="cd-n">${d}</span>${v ? `<span class="cd-v">${compact(v).replace('₹', '')}</span>` : ''}</button>`);
  }
  return `<section class="card cal"><div class="cal-h">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d) => `<span>${d}</span>`).join('')}</div><div class="cal-g">${cells.join('')}</div>
    <div class="cal-legend"><span>Less</span><i style="--a:.12"></i><i style="--a:.4"></i><i style="--a:.7"></i><i style="--a:1"></i><span>More spent</span></div></section>`;
}
export function Activity() {
  const monthAll = inMonth(txns(), ui.month);
  let list = monthAll;
  const sp = spent(list), got = received(list);
  if (ui.day && ui.day.startsWith(ui.month)) list = list.filter((t) => t.date === ui.day);
  if (ui.filter === 'expense') list = list.filter((t) => t.type === 'expense' || t.type === 'tripshare');
  else if (ui.filter !== 'all') list = list.filter((t) => t.type === ui.filter);
  if (ui.q) { const q = ui.q.toLowerCase(); list = list.filter((t) => [txTitle(t), txSub(t), String(t.amount)].join(' ').toLowerCase().includes(q)); }
  const groups = new Map();
  for (const t of list) { if (!groups.has(t.date)) groups.set(t.date, []); groups.get(t.date).push(t); }
  const chip = (v, l) => `<button class="chip ${ui.filter === v ? 'on' : ''}" data-filter="${v}">${l}</button>`;
  const filtered = ui.q || ui.filter !== 'all' || ui.day;
  return `
  <header class="top simple"><h1 class="title">Activity</h1><div class="seg mini">${[['list', icon('list', 18)], ['cal', icon('calendar', 18)]].map(([k, i]) => `<button class="${ui.actView === k ? 'on' : ''}" data-actview="${k}" aria-label="${k === 'list' ? 'List' : 'Calendar'}">${i}</button>`).join('')}</div></header>
  ${monthSwitch(ui.month, 'month')}
  <div class="pills"><span class="pill in">In ${money(got, { round: true })}</span><span class="pill out">Out ${money(sp, { round: true })}</span><span class="pill">Net ${money(got - sp, { round: true, sign: true })}</span></div>
  ${ui.actView === 'cal' ? calendar(ui.month, monthAll) : ''}
  ${ui.day && ui.day.startsWith(ui.month) ? `<div class="dayfilter">Showing ${dayLabel(ui.day)} <button class="chip" data-day="">Show all days ${icon('x', 14)}</button></div>` : ''}
  <label class="search">${icon('search', 18)}<input id="q" type="search" placeholder="Search notes, people, amounts" value="${esc(ui.q)}" autocomplete="off"></label>
  <div class="chips">${chip('all', 'All')}${chip('expense', 'Spent')}${chip('income', 'Received')}${chip('transfer', 'Moves')}</div>
  ${groups.size ? [...groups.entries()].map(([d, items]) => {
    const dayOut = items.reduce((a, t) => a + spendAmt(t), 0);
    return `<section class="day"><div class="day-h"><span>${dayLabel(d)}</span>${dayOut ? `<span class="muted">${money(-dayOut, { round: true })}</span>` : ''}</div><div class="rows card">${items.map(txRow).join('')}</div></section>`;
  }).join('') : empty(filtered ? 'No matches' : `No transactions in ${monthLabel(ui.month).split(' ')[0]}`, filtered ? 'Try a different search, filter or day.' : 'Anything you add for this month shows up here, grouped by day.', filtered ? '' : undefined)}`;
}

// ---------------- INSIGHTS ----------------
export function Insights() {
  const ym = ui.insMonth;
  const all = txns();
  const month = inMonth(all, ym);
  const sp = spent(month), got = received(month);
  const prevSp = spent(inMonth(all, shiftMonth(ym, -1)));
  const [y, m] = ym.split('-').map(Number);
  const nDays = new Date(y, m, 0).getDate();
  const lastDay = ym === curYM() ? +today().slice(8) : nDays;
  const daily = [...Array(nDays)].map((_, i) => month.filter((t) => +t.date.slice(8) === i + 1).reduce((a, t) => a + spendAmt(t), 0));
  const avg = lastDay ? sp / lastDay : 0;
  const peak = daily.reduce((bi, v, i, a) => (v > a[bi] ? i : bi), 0);
  const cats = sumBy(month, (t) => t.categoryId, spendAmt);
  const myExp = month.filter((t) => t.type === 'expense');
  const cash = myExp.filter((t) => t.mode === 'cash').reduce((a, t) => a + spendAmt(t), 0);
  const online = myExp.filter((t) => t.mode !== 'cash').reduce((a, t) => a + spendAmt(t), 0);
  const modes = sumBy(myExp, (t) => t.mode, spendAmt);
  const from = sumBy(month, (t) => t.personId || 'other', incomeAmt);
  const six = [...Array(6)].map((_, i) => shiftMonth(ym, i - 5)).map((k) => { const l = inMonth(all, k); return { label: monthLabel(k, false).split(' ')[0], value: spent(l), value2: received(l) }; });
  const wk = [0, 0, 0, 0, 0, 0, 0];
  month.forEach((t) => { wk[(parseISO(t.date).getDay() + 6) % 7] += spendAmt(t); });
  const top = [...month].filter((t) => spendAmt(t) > 0).sort((a, b) => spendAmt(b) - spendAmt(a)).slice(0, 3);

  const notes = [];
  if (prevSp && sp) { const d = ((sp - prevSp) / prevSp) * 100; notes.push(Math.abs(d) < 3 ? 'Spending is about the same as last month.' : `You spent ${Math.abs(d).toFixed(0)}% ${d > 0 ? 'more' : 'less'} than last month.`); }
  if (cats[0] && sp) notes.push(`${cat(cats[0][0]).name} took ${((cats[0][1] / sp) * 100).toFixed(0)}% of your spending.`);
  if (daily[peak]) notes.push(`Your biggest day was ${fmtDate(`${ym}-${String(peak + 1).padStart(2, '0')}`, { weekday: 'long', day: 'numeric', month: 'short' })} at ${money(daily[peak], { round: true })}.`);
  if (ym === curYM() && sp && lastDay < nDays) notes.push(`At this pace you will spend about ${money(avg * nDays, { round: true })} this month.`);
  if (got && sp) notes.push(got >= sp ? `You kept ${money(got - sp, { round: true })} of what came in.` : `You spent ${money(sp - got, { round: true })} more than you received.`);

  return `
  <header class="top simple"><h1 class="title">Insights</h1><a class="btn ghost sm" href="#/report">${icon('file', 18)} Report</a></header>
  ${monthSwitch(ym, 'insMonth')}
  <div class="stats3">
    <div class="card st"><span class="lbl">Received</span><span class="v in">${compact(got)}</span></div>
    <div class="card st"><span class="lbl">Spent</span><span class="v out">${compact(sp)}</span></div>
    <div class="card st"><span class="lbl">Per day</span><span class="v">${compact(avg)}</span></div>
  </div>
  ${notes.length ? `<section class="card notes">${notes.map((n) => `<p>${esc(n)}</p>`).join('')}</section>` : ''}
  ${sp ? `
  <section class="card">
    <div class="mc-head"><h2>Daily spending</h2><span class="muted">avg ${money(avg, { round: true })}</span></div>
    ${line(daily, { labels: [{ i: 0, t: '1' }, { i: Math.floor(nDays / 2) - 1, t: String(Math.floor(nDays / 2)) }, { i: nDays - 1, t: String(nDays) }] })}
  </section>
  <section class="card">
    <div class="mc-head"><h2>By category</h2></div>
    <div class="cat-donut">${donut(cats.map(([id, v]) => ({ label: cat(id).name, value: v, color: cat(id).color })), { size: 176, thickness: 24, center: money(sp, { round: true }), sub: 'spent' })}</div>
    <ul class="catlist">${cats.map(([id, v]) => `<li><span class="tile sm" style="--c:${cat(id).color}">${cat(id).icon}</span><span class="cl-main"><span class="cl-top"><span>${esc(cat(id).name)}</span><span>${money(v, { round: true })}</span></span>${meter(v / cats[0][1], cat(id).color)}</span><span class="cl-p">${((v / sp) * 100).toFixed(0)}%</span></li>`).join('')}</ul>
  </section>
  <section class="card">
    <div class="mc-head"><h2>Cash vs online</h2></div>
    <div class="cvo"><span style="width:${(cash / (cash + online || 1)) * 100}%"></span><span style="width:${(online / (cash + online || 1)) * 100}%"></span></div>
    <div class="cvo-l"><div><span class="dot cash"></span>Cash <strong>${money(cash, { round: true })}</strong></div><div><span class="dot sbi"></span>Online <strong>${money(online, { round: true })}</strong></div></div>
    <div class="modes">${modes.map(([k, v]) => `<span class="pill">${MODES[k]?.label || k} ${money(v, { round: true })}</span>`).join('')}</div>
  </section>
  <section class="card">
    <div class="mc-head"><h2>By weekday</h2></div>
    ${bars(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((l, i) => ({ label: l, value: wk[i] })), { highlight: wk.indexOf(Math.max(...wk)), color: 'var(--marigold)', height: 130 })}
  </section>
  <section class="card list-card"><div class="mc-head"><h2>Biggest expenses</h2></div><div class="rows">${top.map(txRow).join('')}</div></section>
  ` : `<section class="card">${empty('No spending this month', 'Charts appear here once you log expenses for this month.', '')}</section>`}
  ${from.length ? `<section class="card"><div class="mc-head"><h2>Received from</h2><span class="muted">${money(got, { round: true })}</span></div>${fromList(from)}</section>` : ''}
  <section class="card">
    <div class="mc-head"><h2>Last 6 months</h2><span class="legend-inline"><span><span class="dot inc"></span>In</span><span><span class="dot exp"></span>Out</span></span></div>
    ${bars(six, { color: 'var(--spend)', color2: 'var(--earn)', height: 160 })}
  </section>`;
}

// ---------------- PEOPLE ----------------
export function People() {
  const inc = txns().filter((t) => incomeAmt(t) > 0);
  const nets = allNets();
  const rows = people().map((p) => {
    const mine = inc.filter((t) => t.personId === p.id);
    return { p, net: nets[p.id] || 0, all: mine.reduce((a, t) => a + t.amount, 0), month: mine.filter((t) => t.date.startsWith(curYM())).reduce((a, t) => a + t.amount, 0), n: mine.length, last: mine[0]?.date };
  }).sort((a, b) => b.all - a.all);
  const grand = rows.reduce((a, r) => a + r.all, 0);
  const owed = rows.filter((r) => r.net > 0).reduce((a, r) => a + r.net, 0);
  const owe = rows.filter((r) => r.net < 0).reduce((a, r) => a - r.net, 0);
  const pending = rows.filter((r) => r.net).sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return `
  <header class="top simple"><a class="icon-btn" href="#/more" aria-label="Back">${icon('chevL')}</a><h1 class="title">People</h1><button class="icon-btn" data-addperson aria-label="Add a person">${icon('plus', 20)}</button></header>
  <button class="card split-cta" data-split>${icon('users', 22)}<span class="row-main"><span class="row-t">Split a bill</span><span class="row-s">Dinner, movie, rent. Split it and track who owes whom.</span></span>${icon('chevR', 18)}</button>
  ${pending.length ? `<section class="card">
    <div class="owe-sum"><div><span class="lbl">Friends owe you</span><span class="v in">${money(owed, { round: true })}</span></div><div><span class="lbl">You owe</span><span class="v out">${money(owe, { round: true })}</span></div></div>
    <ul class="bal-list">${pending.map((r) => `<li>${personTile(r.p)}<a class="row-main" href="#/person/${r.p.id}"><span class="row-t">${esc(r.p.name)}</span><span class="row-s ${r.net > 0 ? 'in-t' : 'warn-t'}">${r.net > 0 ? `Owes you ${money(r.net, { round: true })}` : `You owe ${money(-r.net, { round: true })}`}</span></a>${r.net > 0 ? `<button class="btn sm ghost" data-remind="${r.p.id}">Remind</button>` : r.p.upi ? `<button class="btn sm danger-solid" data-payupi="${r.p.id}">Pay</button>` : `<button class="btn sm ghost" data-settleperson="${r.p.id}">Settle</button>`}</li>`).join('')}</ul>
  </section>` : ''}
  ${grand ? `<section class="card people-total">
    <span class="lbl">Received from everyone</span><span class="big">${money(grand, { round: true })}</span>
    <div class="stack">${rows.filter((r) => r.all).map((r) => `<span style="width:${(r.all / grand) * 100}%;background:${r.p.color}" title="${esc(r.p.name)}"></span>`).join('')}</div>
  </section>` : ''}
  <div class="people">${rows.map((r) => `
    <a class="card person-card" href="#/person/${r.p.id}">
      ${personTile(r.p, 'lg')}
      <span class="pc-main"><span class="pc-n">${esc(r.p.name)}</span><span class="pc-s">${r.n ? `${r.n} time${r.n > 1 ? 's' : ''}, last ${dayLabel(r.last).toLowerCase()}` : 'Nothing received yet'}</span>
      ${r.net ? `<span class="pc-tags">${r.net < 0 ? `<span class="tag out">You owe ${money(-r.net, { round: true })}</span>` : `<span class="tag in">Owes you ${money(r.net, { round: true })}</span>`}</span>` : ''}</span>
      <span class="pc-v"><strong>${money(r.all, { round: true })}</strong><span>${r.month ? `${money(r.month, { round: true })} this month` : ''}</span></span>
    </a>`).join('')}</div>
  <p class="hint">Balances include splits, loans and settle-ups. Add a friend’s WhatsApp number and UPI ID (tap them, then edit) to remind them or pay them back in one tap.</p>`;
}

export function PersonView(id) {
  const p = person(id);
  if (!p || p.deleted) return null;
  const all = txns().filter((t) => t.personId === id || (t.split && t.split.includes(id)));
  const inc = all.filter((t) => t.personId === id && incomeAmt(t) > 0);
  const total = inc.reduce((a, t) => a + t.amount, 0);
  const six = [...Array(6)].map((_, i) => shiftMonth(curYM(), i - 5)).map((k) => ({ label: monthLabel(k, false).split(' ')[0], value: inc.filter((t) => t.date.startsWith(k)).reduce((a, t) => a + t.amount, 0) }));
  const cash = inc.filter((t) => t.mode === 'cash').reduce((a, t) => a + t.amount, 0);
  const l = ledger(id);
  const lines = [
    [l.splitOwed, 'Their share of bills you paid', 'in'], [l.splitOwe, 'Your share of bills they paid', 'out'],
    [l.lent, 'You lent them', 'in'], [l.gotBack, 'They paid you back', 'out'],
    [l.borrowed, 'You borrowed', 'out'], [l.repaid, 'You paid back', 'in'],
    [l.settledOut, 'You settled up (paid them)', 'in'], [l.settledIn, 'They settled up (paid you)', 'out'],
  ].filter(([v]) => v > 0.004);
  const head = l.net > 0 ? `${esc(p.name)} owes you` : l.net < 0 ? `You owe ${esc(p.name)}` : 'All settled';
  return `
  <header class="top simple"><a class="icon-btn" href="#/people" aria-label="Back">${icon('chevL')}</a><h1 class="title">${esc(p.name)}</h1><button class="icon-btn" data-editperson="${p.id}" aria-label="Edit">${icon('edit', 20)}</button></header>
  ${lines.length || l.net ? `<section class="card bal-card ${l.net > 0 ? 'pos' : l.net < 0 ? 'neg' : 'zero'}">
    <span class="lbl">${head}</span><span class="big">${l.net ? money(Math.abs(l.net)) : `${icon('check', 26)}`}</span>
    ${lines.length ? `<ul class="bal-lines">${lines.map(([v, t, k]) => `<li><span>${t}</span><span class="${k}-t">${k === 'in' ? '+' : '−'}${money(v, { round: true })}</span></li>`).join('')}</ul>` : ''}
    ${l.net > 0 ? `<div class="two-btn"><button class="btn primary wide" data-remind="${id}">${icon('share', 18)} Remind ${esc(p.name)}</button><button class="btn ghost" data-settleperson="${id}">Got paid</button></div>`
      : l.net < 0 ? `<div class="two-btn">${p.upi ? `<button class="btn danger-solid wide" data-payupi="${id}">Pay ${money(-l.net, { round: true })} by UPI</button>` : ''}<button class="btn ${p.upi ? 'ghost' : 'danger-solid wide'}" data-settleperson="${id}">${p.upi ? 'Paid already' : `Record I paid ${money(-l.net, { round: true })}`}</button></div>${!p.upi ? `<p class="from-note">Add ${esc(p.name)}’s UPI ID (tap ${icon('edit', 14)}) to pay in one tap.</p>` : ''}` : ''}
  </section>` : ''}
  <div class="three-btn">
    <button class="btn ghost" data-split data-with="${id}">${icon('users', 18)} Split a bill</button>
    <button class="btn ghost" data-add="income" data-person="${p.id}">${icon('down', 18)} Received</button>
    <button class="btn ghost" data-lend="${p.id}">${icon('handshake', 18)} Lend</button>
  </div>
  ${total ? `<section class="card person-hero" style="--c:${p.color}">
    ${personTile(p, 'xl')}
    <span class="lbl">Total received from ${esc(p.name)}</span><span class="big">${money(total)}</span>
    <div class="ph-stats"><div><span>${inc.length}</span>times</div><div><span>${compact(cash)}</span>as cash</div><div><span>${compact(total - cash)}</span>online</div></div>
  </section>
  <section class="card"><div class="mc-head"><h2>Money received by month</h2></div>${bars(six, { color: p.color, highlight: 5 })}</section>` : ''}
  <section class="card list-card"><div class="mc-head"><h2>History</h2></div>${all.length ? `<div class="rows">${all.map(txRow).join('')}</div>` : `<p class="muted pad">Nothing recorded with ${esc(p.name)} yet.</p>`}</section>`;
}

// ---------------- MORE ----------------
export function More() {
  const st = syncConfig();
  const tiles = [
    ['people', 'users', 'People & splits', (() => { const n = Object.values(allNets()).filter(Boolean).length; return n ? `${n} pending` : `${people().length} ${people().length === 1 ? 'person' : 'people'}`; })(), '#2B6CB0'],
    ['trips', 'map', 'Trips', `${trips().filter((t) => !t.archived).length} active`, '#0F8FA0'],
    ['budgets', 'target', 'Budgets', budgetStatus(curYM()).overall ? 'This month' : 'Not set', '#E04F64'],
    ['goals', 'sparkle', 'Savings goals', `${goals().length} goal${goals().length === 1 ? '' : 's'}`, '#22A06B'],
    ['bills', 'repeat', 'Bills & subscriptions', recurring().length ? `${recurring().length} saved` : 'None yet', '#7A6FE0'],
    ['report', 'file', 'Reports', 'PDF and Excel', '#F08A4B'],
  ];
  return `
  <header class="top simple"><h1 class="title">More</h1></header>
  <div class="more-grid">${tiles.map(([r, i, t, s, c]) => `<a class="card more-tile" href="#/${r}" style="--c:${c}"><span class="mt-ic">${icon(i, 22)}</span><span class="mt-t">${t}</span><span class="mt-s">${s}</span></a>`).join('')}</div>
  <section class="card more-list">
    <a class="ml-row" href="#/reminders">${icon('bell', 20)}<span><strong>Reminders</strong><span>${Push.permission() === 'granted' ? 'Notifications are on' : 'Daily nudge, bills due, weekly summary'}</span></span>${icon('chevR', 18)}</a>
    <button class="ml-row" data-voice>${icon('mic', 20)}<span><strong>Voice commands</strong><span>Say “spent 200 on lunch” or “how much did I spend this week”</span></span>${icon('chevR', 18)}</button>
    <a class="ml-row" href="#/sync">${icon('cloud', 20)}<span><strong>Sync</strong><span>${st.signedIn ? `On, as ${esc(st.email)}` : 'Use the same data on phone and laptop'}</span></span>${icon('chevR', 18)}</a>
    <a class="ml-row" href="#/categories">${icon('grid', 20)}<span><strong>Categories</strong><span>Add your own categories</span></span>${icon('chevR', 18)}</a>
    <a class="ml-row" href="#/settings">${icon('settings', 20)}<span><strong>Settings</strong><span>Name, theme, PIN lock, balances, backup</span></span>${icon('chevR', 18)}</a>
  </section>`;
}

// ---------------- TRIPS ----------------
export function Trips() {
  const list = trips();
  const card = (t) => {
    const st = tripStats(t.id);
    const live = t.start <= today() && (!t.end || t.end >= today());
    const owed = Object.values(st.net).reduce((a, v) => a + (v > 0 ? v : 0), 0);
    const owe = Object.values(st.net).reduce((a, v) => a + (v < 0 ? -v : 0), 0);
    return `<a class="card trip-card ${t.archived ? 'dim' : ''}" href="#/trip/${t.id}" style="--c:${t.color || '#0F8FA0'}">
      <span class="tc-top"><span class="tm-emoji">${t.emoji || '🧳'}</span><span class="row-main"><span class="row-t">${esc(t.name)}</span><span class="row-s">${fmtDate(t.start)}${t.end ? ` to ${fmtDate(t.end)}` : ''}${live && !t.archived ? ', happening now' : ''}${t.archived ? ', archived' : ''}</span></span><span class="tc-amt">${money(st.mine, { round: true })}<span>your share</span></span></span>
      ${t.budget ? `<span class="tc-budget"><span>${money(t.budget, { round: true })} budget</span>${meter(st.mine / t.budget)}</span>` : ''}
      ${(t.members || []).length ? `<span class="tc-members">${(t.members || []).map((m) => personTile(person(m), 'xs')).join('')}${owed ? `<span class="tag in">Owed ${money(owed, { round: true })}</span>` : ''}${owe ? `<span class="tag out">You owe ${money(owe, { round: true })}</span>` : ''}</span>` : ''}
    </a>`;
  };
  return `
  ${pageHead('Trips', { right: `<button class="btn ghost sm" data-newtrip>${icon('plus', 18)} New</button>` })}
  ${list.length ? `<div class="people">${list.filter((t) => !t.archived).map(card).join('')}</div>
    ${list.some((t) => t.archived) ? `<h2 class="sec-h">Past trips</h2><div class="people">${list.filter((t) => t.archived).map(card).join('')}</div>` : ''}`
    : `<section class="card">${empty('Plan your first trip', 'Set a budget, add the friends going with you, and Kharcha splits shared costs and shows who owes whom.', '<button class="btn primary" data-newtrip>Create a trip</button>')}</section>`}`;
}

export function TripView(id) {
  const t = trip(id);
  if (!t || t.deleted) return null;
  const st = tripStats(id);
  const members = (t.members || []).map(person).filter(Boolean);
  const nights = t.end ? Math.max(1, Math.round((parseISO(t.end) - parseISO(t.start)) / 864e5) + 1) : null;
  return `
  <header class="top simple"><a class="icon-btn" href="#/trips" aria-label="Back">${icon('chevL')}</a><h1 class="title">${esc(t.name)}</h1><button class="icon-btn" data-edittrip="${id}" aria-label="Edit trip">${icon('edit', 20)}</button></header>
  <section class="card trip-hero" style="--c:${t.color || '#0F8FA0'}">
    <span class="th-emoji">${t.emoji || '🧳'}</span>
    <span class="lbl">${fmtDate(t.start, { day: 'numeric', month: 'short', year: 'numeric' })}${t.end ? ` to ${fmtDate(t.end, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}${nights ? `, ${nights} day${nights > 1 ? 's' : ''}` : ''}</span>
    <div class="th-stats"><div><span class="lbl">Your share</span><span class="v">${money(st.mine, { round: true })}</span></div><div><span class="lbl">Group spent</span><span class="v">${money(st.group, { round: true })}</span></div></div>
    ${t.budget ? `<div class="th-budget"><span class="bl-top"><span>Budget ${money(t.budget, { round: true })}</span><span class="${st.mine > t.budget ? 'warn-t' : 'muted'}">${st.mine > t.budget ? `${money(st.mine - t.budget, { round: true })} over` : `${money(t.budget - st.mine, { round: true })} left`}</span></span>${meter(st.mine / t.budget)}</div>` : ''}
  </section>
  <div class="two-btn"><button class="btn primary expense wide" data-add="expense" data-trip="${id}">${icon('plus', 18)} Add trip expense</button>${members.length ? `<button class="btn ghost" data-friendpaid="${id}">Friend paid</button>` : ''}</div>
  ${members.length ? `<section class="card">
    <div class="mc-head"><h2>Balances</h2><span class="muted">with you</span></div>
    <ul class="bal-list">${members.map((p) => { const v = st.net[p.id] || 0; return `<li>${personTile(p)}<span class="row-main"><span class="row-t">${esc(p.name)}</span><span class="row-s ${v > 0 ? 'in-t' : v < 0 ? 'warn-t' : ''}">${v > 0 ? `Owes you ${money(v, { round: true })}` : v < 0 ? `You owe ${money(-v, { round: true })}` : 'All settled'}</span></span>${v ? `<button class="btn sm ${v > 0 ? 'primary income' : 'danger-solid'}" data-settle="${id}:${p.id}:${v}">${v > 0 ? 'Got paid' : 'Pay'}</button>` : `<span class="tag in">${icon('check', 14)}</span>`}</li>`; }).join('')}</ul>
  </section>` : `<p class="hint">Add friends to this trip (tap edit) to split costs with them.</p>`}
  ${st.byCat.length ? `<section class="card"><div class="mc-head"><h2>Where it went</h2></div>
    <div class="where">${donut(st.byCat.map(([c, v]) => ({ label: cat(c).name, value: v, color: cat(c).color })), { size: 120, thickness: 16, center: compact(st.mine), sub: 'your share' })}
    <ul class="legend">${st.byCat.slice(0, 5).map(([c, v]) => `<li><span class="sw" style="background:${cat(c).color}"></span><span class="lg-n">${cat(c).icon} ${esc(cat(c).name)}</span><span class="lg-v">${money(v, { round: true })}</span></li>`).join('')}</ul></div></section>` : ''}
  ${st.byDay.length > 1 ? `<section class="card"><div class="mc-head"><h2>Day by day</h2></div>${bars(st.byDay.map(([d, v]) => ({ label: fmtDate(d, { day: 'numeric' }), value: v })), { color: t.color || 'var(--peacock)', highlight: st.byDay.length - 1 })}</section>` : ''}
  <section class="card list-card"><div class="mc-head"><h2>Expenses</h2></div>${st.list.length ? `<div class="rows">${st.list.map(txRow).join('')}</div>` : `<p class="muted pad">No expenses yet. Anything you add with this trip selected shows up here.</p>`}</section>
  <button class="btn ghost wide" data-archivetrip="${id}">${t.archived ? 'Move back to active trips' : 'Archive this trip'}</button>`;
}

// ---------------- BUDGETS ----------------
export function Budgets() {
  const bs = budgetStatus(curYM());
  const left = new Date(+curYM().slice(0, 4), +curYM().slice(5), 0).getDate() - +today().slice(8) + 1;
  return `
  ${pageHead('Budgets', { right: `<button class="btn ghost sm" data-editbudget="">${icon('plus', 18)} Add</button>` })}
  <p class="muted center">${monthLabel(curYM())}, ${left} day${left > 1 ? 's' : ''} left</p>
  ${bs.overall ? `<button class="card budget-hero" data-editbudget="overall">
    ${ring(bs.overall.spent / bs.overall.amount, { size: 120, thickness: 12, label: `<strong>${Math.round((bs.overall.spent / bs.overall.amount) * 100)}%</strong><em>used</em>` })}
    <span class="bh-main"><span class="lbl">Monthly budget</span><span class="big">${money(bs.overall.amount, { round: true })}</span>
    <span class="row-s">Spent ${money(bs.overall.spent, { round: true })}. ${bs.overall.spent > bs.overall.amount ? `<b class="warn-t">${money(bs.overall.spent - bs.overall.amount, { round: true })} over</b>` : `You can spend about ${money((bs.overall.amount - bs.overall.spent) / left, { round: true })} a day.`}</span></span>
  </button>` : `<section class="card">${empty('Set a monthly budget', 'Pick how much you want to spend this month. Kharcha warns you at 80% and when you go over.', '<button class="btn primary" data-editbudget="overall">Set monthly budget</button>')}</section>`}
  ${bs.cats.length ? `<section class="card"><div class="mc-head"><h2>Category budgets</h2></div>
    <ul class="catlist">${bs.cats.map((b) => { const c = cat(b.id); const p = b.spent / b.amount; return `<li class="tap" data-editbudget="${b.id}"><span class="tile sm" style="--c:${c.color}">${c.icon}</span><span class="cl-main"><span class="cl-top"><span>${esc(c.name)}</span><span>${money(b.spent, { round: true })} <span class="muted">of ${money(b.amount, { round: true })}</span></span></span>${meter(p)}</span><span class="cl-p ${p >= 1 ? 'warn-t' : ''}">${Math.round(p * 100)}%</span></li>`; }).join('')}</ul></section>` : ''}
  <p class="hint">Budgets count your share of expenses. Loans and settle-ups are not counted.</p>`;
}

// ---------------- GOALS ----------------
export function Goals() {
  const list = goals();
  return `
  ${pageHead('Savings goals', { right: `<button class="btn ghost sm" data-editgoal="">${icon('plus', 18)} New</button>` })}
  ${list.length ? `<div class="goal-grid">${list.map((g) => {
    const saved = (g.entries || []).reduce((a, e) => a + e.amount, 0);
    const p = saved / g.target;
    const daysLeft = g.deadline ? daysUntil(g.deadline) : null;
    const perMonth = daysLeft && daysLeft > 0 && saved < g.target ? (g.target - saved) / Math.max(1, daysLeft / 30) : 0;
    return `<section class="card goal" style="--c:${g.color || '#22A06B'}">
      <div class="goal-top">${ring(p, { size: 72, thickness: 8, color: g.color || 'var(--earn)', label: `<span class="g-emoji">${g.emoji || '🎯'}</span>` })}
      <span class="row-main"><span class="row-t">${esc(g.name)}</span><span class="g-amt">${money(saved, { round: true })} <span class="muted">of ${money(g.target, { round: true })}</span></span>
      <span class="row-s">${p >= 1 ? '🎉 Goal reached' : `${Math.round(p * 100)}% there${g.deadline ? `, ${daysLeft >= 0 ? `by ${fmtDate(g.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'deadline passed'}` : ''}`}</span></span>
      <button class="icon-btn" data-editgoal="${g.id}" aria-label="Edit goal">${icon('edit', 18)}</button></div>
      ${perMonth ? `<p class="g-tip">Save about ${money(perMonth, { round: true })} a month to make it.</p>` : ''}
      <div class="two-btn"><button class="btn primary wide" data-goaladd="${g.id}">${icon('plus', 18)} Add savings</button>${saved ? `<button class="btn ghost" data-goaltake="${g.id}">Take out</button>` : ''}</div>
    </section>`;
  }).join('')}</div>` : `<section class="card">${empty('Save for something', 'A new phone, a trip, a laptop. Set a target and add money to it as you save.', '<button class="btn primary" data-editgoal="">Create a goal</button>')}</section>`}
  <p class="hint">Goals track money you set aside. They don't move money out of SBI or cash.</p>`;
}

// ---------------- BILLS ----------------
export function Bills() {
  const list = recurring();
  const monthly = list.reduce((a, b) => a + (b.freq === 'weekly' ? b.amount * 4.33 : b.freq === 'yearly' ? b.amount / 12 : b.amount), 0);
  const freqL = { monthly: 'Every month', weekly: 'Every week', yearly: 'Every year' };
  return `
  ${pageHead('Bills & subscriptions', { right: `<button class="btn ghost sm" data-editbill="">${icon('plus', 18)} Add</button>` })}
  ${list.length ? `<section class="card people-total"><span class="lbl">About this much every month</span><span class="big">${money(monthly, { round: true })}</span></section>
  <section class="card list-card"><div class="rows">${list.map((b) => `<div class="row bill-row"><span class="tile" style="--c:${cat(b.categoryId).color}">${cat(b.categoryId).icon}</span>
    <button class="row-main" data-editbill="${b.id}"><span class="row-t">${esc(b.name)} <span class="muted">${money(b.amount, { round: true })}</span></span><span class="row-s ${daysUntil(b.next) < 0 ? 'warn-t' : ''}">${freqL[b.freq]}, ${b.auto ? `adds itself on ${fmtDate(b.next)}` : dueText(b.next).toLowerCase()}, ${MODES[b.mode]?.label}</span></button>
    ${b.auto ? `<span class="tag">${icon('repeat', 14)} Auto</span>` : `<button class="btn sm primary" data-paybill="${b.id}">Pay</button>`}</div>`).join('')}</div></section>`
    : `<section class="card">${empty('No bills yet', 'Add rent, mess fees, phone recharge or Netflix. Kharcha reminds you when they are due, or adds them for you.', '<button class="btn primary" data-editbill="">Add a bill</button>')}</section>`}`;
}

// ---------------- CATEGORIES ----------------
export function Categories() {
  const sec = (type, title) => `<section class="card"><div class="mc-head"><h2>${title}</h2><button class="btn ghost sm" data-editcat="new:${type}">${icon('plus', 18)} Add</button></div>
    <div class="cats manage">${categories(type).map((c) => `<button class="cat" data-editcat="${c.id}" style="--c:${c.color}"><span>${c.icon}</span>${esc(c.name)}</button>`).join('')}</div></section>`;
  return `${pageHead('Categories')}${sec('expense', 'Spending')}${sec('income', 'Money in')}<p class="hint">Tap a category you added to rename or remove it.</p>`;
}

// ---------------- REPORT ----------------
export function Report() {
  const ym = ui.repMonth;
  const month = inMonth(txns(), ym);
  const sp = spent(month), got = received(month);
  const b = balances();
  const cats = sumBy(month, (t) => t.categoryId, spendAmt);
  const from = sumBy(month, (t) => t.personId || 'other', incomeAmt);
  const modes = sumBy(month.filter((t) => t.type === 'expense'), (t) => t.mode, spendAmt);
  const s = store.get();
  const rowsAsc = [...month].reverse();
  return `
  <div class="no-print">${pageHead('Monthly report', { backTo: 'more' })}${monthSwitch(ym, 'repMonth')}
  <div class="two-btn"><button class="btn primary wide" data-act="pdf">${icon('file', 18)} Save as PDF</button><button class="btn ghost wide" data-act="xlsx">${icon('download', 18)} Excel</button></div></div>
  <article class="card report" id="report">
    <header class="rp-head"><div><span class="rp-brand">₹ Kharcha</span><h2>${monthLabel(ym)} statement</h2><p class="muted">${esc(s.settings.name)}, generated ${fmtDate(today(), { day: 'numeric', month: 'short', year: 'numeric' })}</p></div></header>
    <div class="rp-stats"><div><span class="lbl">Received</span><strong class="in-t">${money(got)}</strong></div><div><span class="lbl">Spent</span><strong class="warn-t">${money(sp)}</strong></div><div><span class="lbl">Saved</span><strong>${money(got - sp)}</strong></div><div><span class="lbl">Balance now</span><strong>${money(b.sbi + b.cash)}</strong></div></div>
    ${cats.length ? `<h3>Spending by category</h3><div class="rp-split">${donut(cats.map(([id, v]) => ({ label: cat(id).name, value: v, color: cat(id).color })), { size: 120, thickness: 18, center: compact(sp), sub: 'spent' })}
      <table class="rp-t"><thead><tr><th>Category</th><th class="r">Amount</th><th class="r">Share</th></tr></thead><tbody>${cats.map(([id, v]) => `<tr><td>${cat(id).icon} ${esc(cat(id).name)}</td><td class="r">${money(v, { round: true })}</td><td class="r">${((v / sp) * 100).toFixed(0)}%</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No spending this month.</p>'}
    ${from.length ? `<h3>Money received</h3><table class="rp-t"><thead><tr><th>From</th><th class="r">Amount</th></tr></thead><tbody>${from.map(([id, v]) => `<tr><td>${esc(person(id)?.name || 'Other sources')}</td><td class="r">${money(v, { round: true })}</td></tr>`).join('')}</tbody></table>` : ''}
    ${modes.length ? `<h3>How you paid</h3><table class="rp-t"><tbody>${modes.map(([k, v]) => `<tr><td>${MODES[k]?.label || k}</td><td class="r">${money(v, { round: true })}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3>All transactions (${month.length})</h3>
    ${month.length ? `<div class="rp-scroll"><table class="rp-t rp-all"><thead><tr><th>Date</th><th>Details</th><th>Mode</th><th class="r">Amount</th></tr></thead><tbody>${rowsAsc.map((t) => `<tr><td>${fmtDate(t.date)}</td><td>${esc(txTitle(t))}<br><span class="muted">${esc(t.type === 'transfer' ? 'Move' : cat(t.categoryId).name)}</span></td><td>${esc(t.type === 'transfer' ? '' : t.type === 'tripshare' ? 'Paid by friend' : modeLabel(t))}</td><td class="r ${t.type === 'income' ? 'in-t' : t.type === 'expense' ? 'warn-t' : ''}">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${money(t.amount)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nothing recorded.</p>'}
  </article>`;
}

// ---------------- SETTINGS ----------------
export function Settings() {
  const s = store.get();
  const theme = s.settings.theme;
  let pinOn = false; try { pinOn = !!localStorage.getItem('kharcha.pin'); } catch (e) { /* ignore */ }
  return `
  ${pageHead('Settings')}
  <section class="card form">
    <label class="field"><span>Your name</span><input id="set-name" value="${esc(s.settings.name)}" autocomplete="given-name"></label>
    <label class="field"><span>Your UPI ID</span><input id="set-upi" value="${esc(s.settings.upi || '')}" placeholder="yourname@oksbi" autocomplete="off" autocapitalize="none"></label>
    <p class="from-note">Added to payment reminders so friends can pay you back easily.</p>
    <div class="field"><span>Appearance</span><div class="seg">${['system', 'light', 'dark'].map((t) => `<button class="${theme === t ? 'on' : ''}" data-theme-set="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div></div>
  </section>
  <a class="card ml-row solo" href="#/reminders">${icon('bell', 20)}<span><strong>Reminders</strong><span>${Push.permission() === 'granted' ? 'Notifications are on' : 'Turn on daily, bill and weekly reminders'}</span></span>${icon('chevR', 18)}</a>
  <section class="card form">
    <h2>PIN lock</h2>
    <p class="muted small">Ask for a 4-digit PIN when the app opens or comes back after a minute.</p>
    ${pinOn ? `<div class="btn-list"><button class="btn ghost" data-act="pin-change">${icon('lock', 18)} Change PIN</button><button class="btn ghost" data-act="pin-off">${icon('x', 18)} Turn off PIN</button></div>` : `<button class="btn primary" data-act="pin-set">${icon('lock', 18)} Set a PIN</button>`}
  </section>
  <section class="card form">
    <h2>Starting balances</h2>
    <p class="muted small">What you had before you started using Kharcha. Your current balance is this plus everything you log.</p>
    ${s.wallets.map((x) => `<label class="field"><span>${x.id === 'sbi' ? icon('bank', 18) : icon('cash', 18)} ${esc(x.name)}</span><span class="money-in"><span>₹</span><input inputmode="decimal" id="open-${x.id}" data-opening="${x.id}" value="${x.opening || ''}" placeholder="0"></span></label>`).join('')}
  </section>
  <section class="card form">
    <h2>Your data</h2>
    <div class="btn-list">
      <a class="btn ghost" href="#/sync">${icon('cloud', 18)} Sync between devices</a>
      <button class="btn ghost" data-act="backup">${icon('download', 18)} Download backup</button>
      <button class="btn ghost" data-act="restore">${icon('upload', 18)} Restore from backup</button>
      <button class="btn ghost" data-act="csv">${icon('file', 18)} Export all to CSV</button>
    </div>
    <input type="file" id="restore-file" accept="application/json,.json" hidden>
  </section>
  <button class="btn danger wide" data-act="reset">${icon('trash', 18)} Erase all data</button>
  <p class="hint center">Kharcha 2.1</p>`;
}

// ---------------- REMINDERS ----------------
export function Reminders() {
  const perm = Push.permission();
  const pr = Push.prefs();
  const sync = syncConfig();
  const st = Push.status;
  const on = perm === 'granted';
  const tg = (key, title, sub, extra = '') => `<div class="rem-row"><button class="toggle ${pr[key] ? 'on' : ''}" data-notify="${key}" ${on ? '' : 'disabled'}><span class="tg-text"><strong>${title}</strong><span>${sub}</span></span><span class="tg-sw"></span></button>${extra}</div>`;
  let top;
  if (perm === 'unsupported') top = `<section class="card">${empty('Notifications aren’t available here', 'Open Kharcha from the installed app on your phone (Chrome → Install app) to get reminders.', '')}</section>`;
  else if (perm === 'denied') top = `<section class="card notif-hero blocked"><span class="nh-ic">${icon('bell', 26)}</span><h2>Notifications are blocked</h2><p class="muted">Long-press the Kharcha icon → App info → Notifications → Allow. Or in Chrome: ⋮ → Settings → Site settings → Notifications, and allow your Kharcha site.</p></section>`;
  else if (!on) top = `<section class="card notif-hero"><span class="nh-ic">${icon('bell', 26)}</span><h2>Get reminders on your phone</h2>
    <ul class="nh-list"><li>A nudge at night to log the day’s spending</li><li>Bills due today or tomorrow</li><li>A Sunday summary with who owes you money</li></ul>
    <button class="btn primary wide" data-act="notif-on">${icon('bell', 18)} Turn on notifications</button></section>`;
  else top = `<section class="card notif-hero on"><span class="nh-ic">${icon('bell', 26)}</span><h2>Notifications are on</h2><p class="muted">${Push.serverOn() ? 'Reminders arrive on time, even when Kharcha is closed.' : 'Reminders work best with the reminder server below.'}</p></section>`;

  const serverCard = perm === 'unsupported' ? '' : Push.serverOn()
    ? `<section class="card"><div class="srv on">${icon('check', 18)}<span><strong>Reminder server connected</strong><span>Your Supabase project sends reminders at the right time.</span></span></div>
       <div class="btn-list"><button class="btn ghost" data-act="push-test">${icon('bell', 18)} Send a test from the server</button></div></section>`
    : `<section class="card form">
      <h2>On-time reminders (optional, 10 minutes)</h2>
      <p class="muted small">Without this, Android decides when Kharcha can check in the background, so reminders can come late or be skipped. With it, your Supabase project sends them at the exact time.</p>
      ${st.error ? `<p class="form-err">${esc(st.error)}</p>` : ''}
      ${!sync.signedIn ? `<a class="btn ghost" href="#/sync">${icon('cloud', 18)} Turn on Sync first</a>` : ''}
      <details class="steps-d"><summary>Show setup steps</summary>
      <ol class="steps">
        <li>In Supabase, open <strong>Edge Functions → Deploy a new function → Via Editor</strong>. Name it <strong>kharcha-reminders</strong>, delete the sample code, paste in the code from <strong>supabase/kharcha-reminders.ts</strong>, and click <strong>Deploy</strong>.</li>
        <li>Open the function’s <strong>Details</strong> tab, turn off <strong>Verify JWT with legacy secret</strong> (“Enforce JWT verification”), and save.</li>
        <li>Open <strong>Edge Functions → Secrets</strong> and add these three:
          <div class="kv"><span>VAPID_PUBLIC_KEY</span><code id="vapid-pub">${esc(Push.VAPID_PUBLIC_KEY)}</code><button class="btn ghost sm" data-copy="vapid-pub">${icon('copy', 16)} Copy</button></div>
          <div class="kv"><span>VAPID_PRIVATE_KEY</span><em>the private key from your chat with Claude. Never put it on GitHub.</em></div>
          <div class="kv"><span>VAPID_SUBJECT</span><code>mailto:your-email@gmail.com</code></div></li>
        <li>Open <strong>SQL Editor</strong>, paste this and click <strong>Run</strong>:
          <pre class="sql" id="push-sql">${esc(pushSql())}</pre><button class="btn ghost sm" data-copy="push-sql">${icon('copy', 16)} Copy SQL</button></li>
        <li>Come back here and tap <strong>Connect this phone</strong>.</li>
      </ol></details>
      <button class="btn primary" data-act="push-connect" ${on && sync.signedIn ? '' : 'disabled'}>${icon('cloud', 18)} Connect this phone</button>
    </section>`;

  return `
  ${pageHead('Reminders')}
  ${top}
  ${perm === 'unsupported' ? '' : `<section class="card form rem ${on ? '' : 'dim'}">
    <h2>What to remind you about</h2>
    ${tg('daily', 'Daily reminder', 'If you haven’t logged anything, it asks you to. If you have, it shows today’s total.', `<label class="rem-time"><span>Time</span><input type="time" id="notify-time" value="${pr.dailyTime}" ${on ? '' : 'disabled'}></label>`)}
    ${tg('bills', 'Bills due', 'At 9 AM on the day before and the day a bill is due.')}
    ${tg('weekly', 'Weekly summary', 'Sunday at 10 AM: what you spent, and who owes whom.')}
    <button class="btn ghost" data-act="notif-test" ${on ? '' : 'disabled'}>${icon('bell', 18)} Show a test notification</button>
  </section>`}
  ${serverCard}
  ${on ? `<button class="btn danger wide" data-act="notif-off">${icon('x', 18)} Turn off all notifications</button>` : ''}`;
}

// ---------------- SYNC ----------------
export function SyncView() {
  const c = syncConfig();
  const stat = syncStatus;
  if (c.signedIn) {
    return `
    ${pageHead('Sync')}
    <section class="card sync-on">
      <span class="sync-ic ${stat.state}">${icon('cloud', 28)}</span>
      <h2>Sync is on</h2>
      <p class="muted">Signed in as ${esc(c.email)}</p>
      <p class="sync-st ${stat.state}" id="sync-status">${stat.state === 'syncing' ? 'Syncing…' : esc(stat.message || (c.lastSync ? 'Up to date' : 'Not synced yet'))}</p>
      <div class="btn-list"><button class="btn primary" data-act="sync-now">${icon('repeat', 18)} Sync now</button><button class="btn ghost" data-act="sync-out">${icon('logout', 18)} Sign out</button></div>
    </section>
    <p class="hint">On your laptop or another phone, open Kharcha, go to Sync, enter the same project details and sign in with the same email. Changes sync within a few seconds.</p>`;
  }
  return `
  ${pageHead('Sync')}
  <section class="card sync-steps">
    <h2>Set up sync once (about 5 minutes)</h2>
    <p class="muted small">Your data goes to your own free Supabase project. Only you can read it.</p>
    <ol class="steps">
      <li>Go to <strong>supabase.com</strong>, sign up free, and click <strong>New project</strong>. Pick any name and password and the Mumbai region.</li>
      <li>In the project, open <strong>SQL Editor</strong>, paste this, and click <strong>Run</strong>:
        <pre class="sql" id="sql">${esc(SETUP_SQL)}</pre><button class="btn ghost sm" data-act="copy-sql">${icon('copy', 16)} Copy SQL</button></li>
      <li>Open <strong>Project Settings → API</strong>. Copy the <strong>Project URL</strong> and the <strong>anon public</strong> key into the boxes below.</li>
      <li>Optional: in <strong>Authentication → Sign In / Providers → Email</strong>, turn off <strong>Confirm email</strong> so you can sign in straight away.</li>
    </ol>
  </section>
  <form class="card form" id="sync-form">
    <label class="field"><span>Project URL</span><input id="sb-url" name="url" placeholder="https://abcd1234.supabase.co" value="${esc(c.url)}" autocomplete="off" inputmode="url"></label>
    <label class="field"><span>Anon public key</span><input id="sb-key" name="key" placeholder="eyJhbGciOi…" value="${esc(c.key)}" autocomplete="off"></label>
    <label class="field"><span>Email</span><input id="sb-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"></label>
    <label class="field"><span>Password for Kharcha sync</span><input id="sb-pass" name="password" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters"></label>
    <p class="form-err" id="sync-err" hidden></p>
    <div class="two-btn"><button class="btn primary wide" type="submit" name="mode" value="in">Sign in</button><button class="btn ghost wide" type="submit" name="mode" value="up">Create account</button></div>
  </form>`;
}

// ---------------- ONBOARDING ----------------
export function Onboarding() {
  return `
  <div class="onb">
    <div class="onb-hero"><div class="hero-pattern" aria-hidden="true"></div><div class="logo">₹</div><h1>Kharcha</h1><p>Know where every rupee comes from and where it goes.</p></div>
    <form class="card form onb-form" id="onb">
      <label class="field"><span>What should we call you?</span><input id="onb-name" name="name" required placeholder="Your name" autocomplete="given-name"></label>
      <label class="field"><span>${icon('bank', 18)} Money in SBI right now</span><span class="money-in"><span>₹</span><input id="onb-sbi" name="sbi" inputmode="decimal" placeholder="0"></span></label>
      <label class="field"><span>${icon('cash', 18)} Cash in hand right now</span><span class="money-in"><span>₹</span><input id="onb-cash" name="cash" inputmode="decimal" placeholder="0"></span></label>
      <button class="btn primary wide" type="submit">Start tracking</button>
      <a class="btn ghost wide" href="#/sync">${icon('cloud', 18)} I already use Kharcha, sign in to sync</a>
    </form>
  </div>`;
}