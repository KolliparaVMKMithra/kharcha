// Shared UI helpers: formatting, icons, charts
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
export const money = (n, { sign = false, round = false } = {}) => {
  const v = Math.abs(n);
  const s = (round ? inr0 : inr).format(v);
  return `${n < 0 ? '−' : sign && n > 0 ? '+' : ''}₹${s}`;
};
export const compact = (n) => {
  const v = Math.abs(n);
  if (v >= 1e7) return `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (v >= 1e5) return `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (v >= 1e3) return `₹${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return `₹${Math.round(n)}`;
};

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};
export const nowTime = () => new Date().toTimeString().slice(0, 5);
export const toISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
export const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const monthLabel = (ym, long = true) => parseISO(ym + '-01').toLocaleDateString('en-IN', { month: long ? 'long' : 'short', year: 'numeric' });
export const shiftMonth = (ym, n) => { const d = parseISO(ym + '-01'); d.setMonth(d.getMonth() + n); return toISO(d).slice(0, 7); };
export function dayLabel(iso) {
  const t = todayISO();
  const y = toISO(new Date(Date.now() - 864e5));
  if (iso === t) return 'Today';
  if (iso === y) return 'Yesterday';
  return parseISO(iso).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}
export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// Icons (stroke icons, 24 grid)
const P = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h14V9.5"/><path d="M10 20v-6h4v6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bank: '<path d="M3 9.5 12 4l9 5.5"/><path d="M4 20h16M6 10v8M10 10v8M14 10v8M18 10v8"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  swap: '<path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>', chevR: '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>', up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5"/><path d="M4 15v5h16v-5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 15v5h16v-5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  repeat: '<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9a3 3 0 0 1 3-3h14"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v2a3 3 0 0 1-3 3h-14"/>',
  check: '<path d="M4.5 12.5 9.5 17.5 19.5 6.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3"/>',
  logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H15"/>',
  handshake: '<path d="M3 12.5 7.5 8l4 1.5 3-2.5 6.5 5.5"/><path d="M7 15.5l2 2c.6.6 1.5.6 2.1 0l.4-.4"/><path d="M10 13l2.6 2.6c.6.6 1.5.6 2.1 0l.3-.3M13 11l2.8 2.8c.6.6 1.5.6 2.1 0L21 10.5"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7z"/>',
  backspace: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="m11.5 9.5 5 5M16.5 9.5l-5 5"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z"/><path d="M10 21h4"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4"/>',
  wallet: '<path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V6a2 2 0 0 1 2-2h11"/><circle cx="16.5" cy="13.5" r="1.2"/>',
};
export const icon = (name, size = 22) => `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

// ---------- Charts (SVG) ----------
export function donut(segments, { size = 168, thickness = 22, center = '', sub = '' } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  const gap = segments.length > 1 ? 3 : 0;
  const arcs = total ? segments.map((s) => {
    const len = Math.max(0, (s.value / total) * c - gap);
    const el = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${s.color}" stroke-width="${thickness}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" stroke-linecap="butt"><title>${esc(s.label)}: ${money(s.value)}</title></circle>`;
    off += (s.value / total) * c;
    return el;
  }).join('') : `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--line)" stroke-width="${thickness}"/>`;
  return `<div class="donut" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)">${arcs}</svg>
    <div class="donut-c"><strong>${center}</strong><span>${sub}</span></div></div>`;
}

export function bars(data, { height = 150, color = 'var(--spend)', highlight = -1, labelEvery = 1, color2 } = {}) {
  // data: [{label, value, value2?}]
  const w = 320, padB = 22, padT = 18;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.value2 || 0)));
  const slot = w / data.length;
  const dual = data.some((d) => d.value2 != null);
  const bw = Math.min(dual ? 11 : 22, slot * (dual ? 0.32 : 0.6));
  const ih = height - padB - padT;
  const rows = data.map((d, i) => {
    const x = i * slot + slot / 2;
    const h1 = (d.value / max) * ih;
    const g = [];
    const bar = (xx, hh, col, val) => `<rect x="${xx - bw / 2}" y="${padT + ih - Math.max(hh, val ? 2 : 0)}" width="${bw}" height="${Math.max(hh, val ? 2 : 0)}" rx="${Math.min(4, bw / 2)}" fill="${col}"><title>${esc(d.label)}: ${money(val)}</title></rect>`;
    if (dual) {
      g.push(bar(x - bw / 2 - 1.5, (d.value2 / max) * ih, color2, d.value2));
      g.push(bar(x + bw / 2 + 1.5, h1, color, d.value));
    } else {
      g.push(bar(x, h1, i === highlight ? color : `color-mix(in srgb, ${color} 38%, transparent)`, d.value));
      if (i === highlight && d.value) g.push(`<text x="${x}" y="${padT + ih - h1 - 6}" class="bar-val" text-anchor="middle">${compact(d.value)}</text>`);
    }
    if (i % labelEvery === 0) g.push(`<text x="${x}" y="${height - 6}" class="axis" text-anchor="middle">${esc(d.label)}</text>`);
    return g.join('');
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" style="height:${height}px"><line x1="0" x2="${w}" y1="${padT + ih + .5}" y2="${padT + ih + .5}" stroke="var(--line)"/>${rows}</svg>`;
}

export function line(values, { height = 140, color = 'var(--peacock)', labels = [] } = {}) {
  const w = 320, padB = 20, padT = 14;
  const max = Math.max(1, ...values);
  const ih = height - padB - padT;
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, padT + ih - (v / max) * ih]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${d} L ${w} ${padT + ih} L 0 ${padT + ih} Z`;
  const lab = labels.map((l) => l && `<text x="${Math.min(w - 8, Math.max(8, l.i * step))}" y="${height - 4}" class="axis" text-anchor="middle">${esc(l.t)}</text>`).join('');
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg class="chart" viewBox="0 0 ${w} ${height}" preserveAspectRatio="none" style="height:${height}px">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>${lab}</svg>`;
}

export function ring(pct, { size = 64, thickness = 7, color = 'var(--peacock)', label = '' } = {}) {
  const r = (size - thickness) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  const col = pct >= 1 ? 'var(--spend)' : pct >= 0.8 ? 'var(--marigold)' : color;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="transform:rotate(-90deg)"><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="var(--surface-2)" stroke-width="${thickness}"/><circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${col}" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${c * p} ${c}"/></svg><span>${label}</span></div>`;
}
export const pctColor = (p) => (p >= 1 ? 'var(--spend)' : p >= 0.8 ? 'var(--marigold)' : 'var(--earn)');

// ---------- Toast & sheet ----------
export function toast(msg, kind = '') {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, kind === 'warn' ? 4200 : 2400);
}

export function openSheet(html, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${html}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('locked');
  const close = () => {
    wrap.classList.remove('open');
    document.body.classList.remove('locked');
    setTimeout(() => wrap.remove(), 280);
  };
  wrap.querySelector('.sheet-bg').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  requestAnimationFrame(() => wrap.classList.add('open'));
  onMount && onMount(wrap.querySelector('.sheet'), close);
  return close;
}