// Voice & typed commands: parse natural sentences into transactions, questions or navigation
const NUM_WORDS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const MULT = { hundred: 100, thousand: 1000, k: 1000, lakh: 100000, lakhs: 100000, lac: 100000 };

export const CAT_WORDS = {
  food: ['food', 'lunch', 'dinner', 'breakfast', 'biryani', 'meal', 'meals', 'restaurant', 'swiggy', 'zomato', 'pizza', 'burger', 'dosa', 'idli', 'thali', 'canteen', 'hotel', 'groceries', 'grocery', 'vegetables', 'fruits', 'chicken', 'noodles', 'parotta', 'shawarma'],
  snacks: ['tea', 'chai', 'coffee', 'snack', 'snacks', 'samosa', 'juice', 'ice cream', 'icecream', 'chocolate', 'chips', 'biscuits', 'cool drink', 'puff', 'bakery', 'pani puri'],
  travel: ['travel', 'auto', 'bus', 'cab', 'uber', 'ola', 'rapido', 'taxi', 'train', 'metro', 'petrol', 'diesel', 'fuel', 'flight', 'ticket', 'tickets', 'parking', 'bike'],
  shopping: ['shopping', 'amazon', 'flipkart', 'myntra', 'meesho', 'clothes', 'shirt', 'tshirt', 't-shirt', 'jeans', 'shoes', 'dress', 'watch', 'bag', 'headphones', 'earphones'],
  recharge: ['recharge', 'bill', 'bills', 'electricity', 'wifi', 'internet', 'mobile', 'data pack', 'jio', 'airtel', 'vi', 'broadband', 'gas'],
  education: ['book', 'books', 'xerox', 'photocopy', 'print', 'printout', 'fees', 'fee', 'college', 'exam', 'course', 'pen', 'notebook', 'stationery', 'project', 'record'],
  fun: ['movie', 'movies', 'cinema', 'game', 'games', 'party', 'outing', 'fun', 'bowling', 'concert'],
  health: ['medicine', 'medicines', 'tablet', 'tablets', 'doctor', 'hospital', 'pharmacy', 'medical', 'clinic', 'gym'],
  rent: ['rent', 'mess', 'hostel', 'pg', 'room', 'laundry'],
  subs: ['netflix', 'spotify', 'prime', 'hotstar', 'youtube premium', 'subscription', 'chatgpt', 'claude'],
  gifts: ['gift', 'gifts', 'present', 'birthday'],
};
const MODE_WORDS = { cash: ['cash', 'hand cash', 'in hand'], upi: ['upi', 'gpay', 'google pay', 'phonepe', 'phone pe', 'paytm', 'online', 'scan', 'qr'], card: ['card', 'debit card', 'credit card', 'swipe'], netbanking: ['net banking', 'netbanking'] };
const DAD = ['dad', 'father', 'papa', 'nanna', 'daddy', 'appa', 'pappa', 'pitaji'];
const MOM = ['mom', 'mother', 'amma', 'mummy', 'mum', 'mommy', 'maa', 'mama'];

const has = (s, w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(s);
const hasAny = (s, list) => list.some((w) => has(s, w));

export function parseAmount(raw) {
  let s = raw.toLowerCase().replace(/₹|rs\.?|inr|rupees?|bucks/g, ' ').replace(/(\d),(?=\d)/g, '$1');
  // "2.5k", "2k", "1.2 lakh", "5 thousand", "2 thousand 500"
  const m = s.match(/(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|hundred)?(?:\s*(?:and\s*)?(\d+(?:\.\d+)?)\s*(hundred)?)?/);
  if (m) {
    let v = parseFloat(m[1]) * (m[2] ? MULT[m[2]] : 1);
    if (m[3] && m[2] && MULT[m[2]] >= 1000) v += parseFloat(m[3]) * (m[4] ? 100 : 1);
    else if (m[3] && !m[2]) { /* separate number, ignore */ }
    return Math.round(v * 100) / 100;
  }
  // words: "two thousand five hundred"
  const words = s.replace(/-/g, ' ').split(/\s+/);
  let total = 0, cur = 0, found = false;
  for (const w of words) {
    if (w in NUM_WORDS) { cur += NUM_WORDS[w]; found = true; }
    else if (w === 'hundred' && found) cur = (cur || 1) * 100;
    else if (w in MULT && found) { total += (cur || 1) * MULT[w]; cur = 0; }
    else if (found && w !== 'and') break;
  }
  return found ? total + cur : 0;
}

function findPerson(s, people) {
  if (hasAny(s, DAD)) return people.find((p) => p.id === 'dad') || people.find((p) => /dad|father/i.test(p.name));
  if (hasAny(s, MOM)) return people.find((p) => p.id === 'mom') || people.find((p) => /mom|mother/i.test(p.name));
  return [...people].sort((a, b) => b.name.length - a.name.length).find((p) => has(s, p.name.toLowerCase()));
}
export function guessCategory(s, categories) {
  const custom = categories.filter((c) => c.type === 'expense' && !c.hidden).find((c) => has(s, c.name.toLowerCase()));
  if (custom) return custom.id;
  for (const [id, words] of Object.entries(CAT_WORDS)) if (hasAny(s, words)) return id;
  return null;
}
const guessMode = (s) => { for (const [k, words] of Object.entries(MODE_WORDS)) if (hasAny(s, words)) return k; return null; };
function guessDate(s, today) {
  const d = new Date(today + 'T12:00:00');
  if (has(s, 'day before yesterday')) d.setDate(d.getDate() - 2);
  else if (has(s, 'yesterday')) d.setDate(d.getDate() - 1);
  else return today;
  return d.toISOString().slice(0, 10);
}
// Keep the human part as a note: "biryani with friends"
function noteFrom(raw) {
  let s = ' ' + raw.toLowerCase() + ' ';
  s = s.replace(new RegExp(`\\b(${[...Object.keys(NUM_WORDS), 'hundred', 'thousand', 'lakh', 'lakhs', 'and'].join('|')})\\b(?=(\\s+(${Object.keys(NUM_WORDS).join('|')}|hundred|thousand|lakh|lakhs|and))*\\s+(on|for|rupees|rs)?\\b)`, 'g'), ' ');
  s = s.replace(/₹?\s*\d[\d,]*(\.\d+)?\s*(k|thousand|lakh|lakhs|hundred)?\s*(rupees?|rs\.?|bucks)?/g, ' ')
    .replace(/\b(i |i've |i have |just )?(spent|spend|paid|pay|bought|buy|gave|give|got|received|receive|transferred|sent|withdrew|withdraw|added|add|kharcha)\b/g, ' ')
    .replace(new RegExp(`\\b(with|by|via|using|through|in|on|from)?\\s*(${Object.values(MODE_WORDS).flat().join('|')})\\b`, 'g'), ' ')
    .replace(/\b(day before yesterday|yesterday|today)\b/g, ' ')
    .replace(/^\s*(on|for|at|of|the|a|an|i)\b/g, ' ').replace(/^\s*(on|for|at|of|the|a|an)\b/g, ' ')
    .replace(/\b(rupees|rs)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return s.length > 1 && s.length < 60 ? s[0].toUpperCase() + s.slice(1) : '';
}

/**
 * ctx: { people, trips, categories, today, lastMode: {expense, income} }
 * returns { kind: 'txn', draft } | { kind: 'query', q } | { kind: 'nav', route } | { kind: 'unknown' }
 */
export function parseCommand(raw, ctx) {
  const s = ' ' + raw.toLowerCase().replace(/[?!.]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const nav = [['insight', 'insights'], ['report', 'report'], ['trip', 'trips'], ['budget', 'budgets'], ['goal', 'goals'], ['bill', 'bills'], ['subscription', 'bills'], ['people', 'people'], ['activity', 'activity'], ['transactions', 'activity'], ['history', 'activity'], ['setting', 'settings'], ['home', 'home']];
  if (/^\s*(open|go to|show|take me to)\b/.test(s) && !/\b(how much|what)\b/.test(s)) {
    const hit = nav.find(([w]) => s.includes(w));
    if (hit) return { kind: 'nav', route: hit[1] };
  }

  const isQuestion = /\b(how much|how many|how is|how's|how am i|what('s| is)|show me|tell me|total|balance|left|remaining|did i|budget)\b/.test(s) && !/\b(spent|paid)\s+(₹|rs)?\s*\d/.test(s);
  if (isQuestion) {
    const p = findPerson(s, ctx.people);
    const period = has(s, 'today') ? 'today' : has(s, 'yesterday') ? 'yesterday' : has(s, 'week') ? 'week' : has(s, 'last month') ? 'lastmonth' : has(s, 'year') ? 'year' : has(s, 'month') ? 'month' : null;
    if (/\b(balance|how much (money |cash )?(do )?i have|i have|left|in my (account|bank)|remaining)\b/.test(s) && !/\b(budget|spen[dt])\b/.test(s)) {
      return { kind: 'query', q: { type: 'balance', wallet: has(s, 'cash') ? 'cash' : (has(s, 'bank') || has(s, 'sbi') || has(s, 'account')) ? 'sbi' : null } };
    }
    if (/\bbudget\b/.test(s)) return { kind: 'query', q: { type: 'budget' } };
    if (/\b(owe|owes|loan|borrowed|lent)\b/.test(s)) return { kind: 'query', q: { type: 'owe', personId: p?.id } };
    if (p && /\b(give|gave|given|sent|send|received|got)\b/.test(s)) return { kind: 'query', q: { type: 'fromPerson', personId: p.id, period: period || 'all' } };
    if (/\b(spend|spent|spending|expense|expenses|kharcha)\b/.test(s)) return { kind: 'query', q: { type: 'spent', categoryId: guessCategory(s, ctx.categories), mode: guessMode(s), period: period || 'month' } };
    if (/\b(receive|received|income|got)\b/.test(s)) return { kind: 'query', q: { type: 'received', period: period || 'month' } };
    if (has(s, 'trip')) return { kind: 'nav', route: 'trips' };
  }

  const amount = parseAmount(s);
  if (!amount) return { kind: 'unknown' };
  const date = guessDate(s, ctx.today);
  const trip = ctx.trips.find((t) => !t.archived && has(s, t.name.toLowerCase()));

  // Move between wallets
  if (/\b(withdrew|withdraw|withdrawn|atm)\b/.test(s) || (/\b(moved|move|transfer(red)?|deposit(ed)?)\b/.test(s) && /\b(cash|bank|sbi|account)\b/.test(s) && !findPerson(s, ctx.people))) {
    const toBank = /\b(deposit(ed)?|to (the )?(bank|sbi|account)|into (the )?(bank|sbi|account))\b/.test(s);
    return { kind: 'txn', draft: { type: 'transfer', amount, date, walletId: toBank ? 'cash' : 'sbi', toWalletId: toBank ? 'sbi' : 'cash', note: has(s, 'atm') || /withdr/.test(s) ? 'ATM withdrawal' : toBank ? 'Cash deposit' : '' } };
  }

  const p = findPerson(s, ctx.people);
  const incomeVerb = /\b(received|receive|got|get|credited|came|sent me|gave me|given me|give me|transferred me|paid me|returned)\b/.test(s);
  const lendVerb = /\b(lent|lend|loaned|borrowed by)\b/.test(s);
  const repayVerb = /\b(repaid|repay|paid back|returned to|gave back|give back)\b/.test(s);

  if (repayVerb && p && !/\b(me|my)\b.*\b(back|returned)\b/.test(s.replace(/gave back|paid back/, ''))) {
    return { kind: 'txn', draft: { type: 'expense', amount, date, categoryId: 'repay', personId: p.id, mode: guessMode(s) || ctx.lastMode.expense, note: '' } };
  }
  if (lendVerb && p) {
    return { kind: 'txn', draft: { type: 'expense', amount, date, categoryId: 'lent', personId: p.id, mode: guessMode(s) || ctx.lastMode.expense, note: '' } };
  }
  if (incomeVerb || (p && /\b(from)\b/.test(s))) {
    const m = guessMode(s);
    let categoryId = 'pocket';
    if (/\b(returned|back|paid me back|gave me back|repaid me)\b/.test(s)) categoryId = 'got-back';
    else if (/\b(loan|borrow(ed)?|lend me|lent me)\b/.test(s)) categoryId = 'loan-in';
    else if (has(s, 'gift') || has(s, 'birthday')) categoryId = 'gift-in';
    else if (has(s, 'refund') || has(s, 'cashback')) categoryId = 'refund';
    else if (has(s, 'scholarship') || has(s, 'stipend') || has(s, 'salary')) categoryId = 'scholar';
    else if (!p) categoryId = 'other-in';
    const mode = m === 'cash' ? 'cash' : m === 'netbanking' ? 'bank' : m ? 'upi' : (has(s, 'bank') || has(s, 'account') ? 'bank' : ctx.lastMode.income);
    return { kind: 'txn', draft: { type: 'income', amount, date, personId: p?.id || null, categoryId, mode, note: p ? '' : noteFrom(raw) } };
  }
  const categoryId = guessCategory(s, ctx.categories) || 'other';
  // Splits: "split 900 dinner with Ravi and Kiran", "Ravi paid 600 for movie split with me"
  if (/\b(split|splitting|shared|share it|between us|divide)\b/.test(s)) {
    const named = ctx.people.filter((x) => x.relation !== 'Family' || has(s, x.name.toLowerCase())).filter((x) => has(s, x.name.toLowerCase()));
    const payerP = named.find((x) => new RegExp(`\\b${x.name.toLowerCase()}\\s+(paid|has paid|payed)\\b`).test(s) || new RegExp(`\\bpaid by\\s+${x.name.toLowerCase()}\\b`).test(s));
    if (named.length) {
      let note = noteFrom(raw);
      for (const x of named) note = note.replace(new RegExp(`\\b${x.name}\\b`, 'gi'), ' ');
      note = note.replace(/\b(split|splitting|shared|share it|between us|divide|equally|with me|with|and|me|by)\b/gi, ' ').replace(/^\s*(for|on|of|the|a)\b/i, ' ').replace(/\s+/g, ' ').trim();
      note = note ? note[0].toUpperCase() + note.slice(1) : '';
      return { kind: 'txn', draft: { type: 'expense', amount, date, categoryId, mode: guessMode(s) || ctx.lastMode.expense, note, tripId: trip?.id || null, splitOn: true, split: ['me', ...named.map((x) => x.id)], payer: payerP ? payerP.id : 'me', splitMode: 'equal' } };
    }
  }
  return { kind: 'txn', draft: { type: 'expense', amount, date, categoryId, mode: guessMode(s) || ctx.lastMode.expense, note: noteFrom(raw), tripId: trip?.id || null } };
}

// ---------- speech ----------
export const speechSupported = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
export function listen({ onPartial, onFinal, onError, onEnd }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const r = new SR();
  r.lang = 'en-IN';
  r.interimResults = true;
  r.maxAlternatives = 1;
  r.continuous = false;
  let finalText = '';
  r.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    onPartial && onPartial(finalText + interim);
  };
  r.onerror = (e) => onError && onError(e.error);
  r.onend = () => { if (finalText) onFinal(finalText.trim()); onEnd && onEnd(); };
  r.start();
  return () => { try { r.stop(); } catch (e) { /* ignore */ } };
}
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/₹/g, 'rupees ').replace(/−/g, 'minus '));
    u.lang = 'en-IN';
    const v = speechSynthesis.getVoices().find((x) => x.lang === 'en-IN');
    if (v) u.voice = v;
    u.rate = 1.02;
    speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}