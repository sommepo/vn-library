// Home: the page before the systems, where global reading statistics live.
// A small personal homepage in the manner of the early-2000s web (original design,
// home.css): a tiled backdrop, a centred page with a serif title, one scrolling line,
// a digit counter, a row of link buttons and a status line. Stats open in place of
// the title block.
import { recentDays } from './statistics.mjs';
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text != null) n.textContent = text; return n; };
const svg = (tag, attrs = {}) => { const n = document.createElementNS(SVG, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const compact = v => new Intl.NumberFormat('en', {notation: v >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1}).format(v);
const hours = ms => { const m = Math.floor(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const rate = t => t.activeMs >= 60000 ? compact(Math.round(t.characters * 3600000 / t.activeMs)) : '—';
const digits = n => n < 100000 ? String(n).padStart(5, '0') : compact(n);

function button(text, onClick, className = '', label) {
  const b = el('button', className, text); b.type = 'button'; b.onclick = onClick; if (label) b.setAttribute('aria-label', label); return b;
}
function metric(value, label, detail) {
  const m = el('div', 'home-metric'); m.title = detail || String(value); m.append(el('strong', '', value), el('small', '', label)); return m;
}
function dayChart(days) {
  const keys = recentDays(30), values = keys.map(k => days[k]?.characters || 0), max = Math.max(0, ...values), W = 300, H = 40;
  const figure = el('figure', 'home-chart'); figure.setAttribute('role', 'img');
  figure.setAttribute('aria-label', `Characters per day, last 30 days. Best day ${max.toLocaleString()}, today ${values.at(-1).toLocaleString()}.`);
  const y = v => max ? H - v / max * (H - 3) : H;
  const drawing = svg('svg', {viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true'});
  drawing.append(svg('line', {x1: 0, x2: W, y1: H - .5, y2: H - .5, class: 'home-chart-base'}),
    svg('polyline', {points: values.map((v, i) => `${(i * W / (keys.length - 1)).toFixed(1)},${y(v).toFixed(1)}`).join(' '), class: 'home-chart-line'}));
  const dot = el('i', 'home-chart-dot'); dot.style.top = `${y(values.at(-1)) / H * 100}%`;
  const plot = el('div', 'home-chart-plot'); plot.append(drawing, dot);
  figure.append(el('figcaption', '', '30 days'), plot);
  return figure;
}

function statsView(total, games, systems, {onClearGame, onClearSystem, onClearAll, onExportBackups, hasBackups}) {
  const view = el('section', 'home-stats'); view.setAttribute('aria-label', 'Statistics');
  const t = total.totals, metrics = el('div', 'home-metrics');
  metrics.append(
    metric(compact(t.characters), 'Chars', `${t.characters.toLocaleString()} characters, all games`),
    metric(hours(t.activeMs), 'Time', `${Math.round(t.activeMs / 60000).toLocaleString()} active minutes`),
    metric(rate(t), 'Per hour', 'Characters per active hour'),
    metric(compact(total.today.characters), 'Today', `${total.today.characters.toLocaleString()} characters today (day starts 04:01)`),
  );
  const manage = el('div', 'home-manage'); manage.hidden = true;
  for (const s of systems) {
    if (!(s.summary.sessions || s.summary.totals.activeMs)) continue;
    const b = button(`${s.label} ×`, () => onClearSystem(s.id), 'home-chip', `Clear ${s.label} statistics`); b.dataset.system = s.id; manage.append(b);
  }
  const all = button('Clear all', onClearAll, 'home-clear-all', 'Clear all statistics'); all.disabled = !games.some(g => g.hasStats); manage.append(all);
  if (hasBackups) manage.append(button('Backups ↓', onExportBackups, 'home-chip', 'Export pre-clear backups'));
  const head = el('div', 'home-games-head'); head.append(el('span', '', 'Games'));
  const toggle = button('Clear…', () => { const on = view.classList.toggle('home-managing'); toggle.setAttribute('aria-pressed', String(on)); manage.hidden = !on; }, 'home-toggle');
  toggle.setAttribute('aria-pressed', 'false'); toggle.disabled = !games.some(g => g.hasStats); head.append(toggle);
  const rows = el('ul', 'home-game-list');
  const listed = games.slice().sort((a, b) => (b.summary.lastActivityAt || 0) - (a.summary.lastActivityAt || 0) || a.title.localeCompare(b.title));
  for (const g of listed) {
    const li = el('li', 'home-game'); li.dataset.game = g.id; li.title = `${g.title} · ${g.systemLabel}`;
    li.append(el('span', 'home-game-title', g.title), el('span', 'home-game-chars', compact(g.summary.totals.characters)), el('span', 'home-game-time', hours(g.summary.totals.activeMs)));
    if (g.hasStats) li.append(button('×', () => onClearGame(g.id), 'home-game-clear', `Clear statistics for ${g.title}`));
    rows.append(li);
  }
  if (!listed.length) rows.append(el('li', 'home-game home-empty', 'No games yet'));
  const list = el('div', 'home-games'); list.append(head, manage, rows);
  view.append(metrics, dayChart(total.days), list);
  return view;
}

export function homePage(body, options) {
  const {systems, games, total, resume, dark, onTheme, onSettings, musicButton, onSystem, view: initialView = 'menu', selected, notice} = options;
  const page = el('section', 'home-view'); page.setAttribute('aria-label', 'Home');

  const top = el('header', 'home-top');
  const readout = el('p', 'home-readout'); readout.title = `${total.today.characters.toLocaleString()} characters today`;
  const counter = el('span', 'home-readout-value'); counter.append(...[...digits(total.today.characters)].map(d => el('i', '', d)));
  readout.append(el('span', 'home-readout-label', 'Today'), counter);
  const tools = el('div', 'home-tools');
  const theme = button(dark ? '☀' : '☾', () => { const d = onTheme(); theme.textContent = d ? '☀' : '☾'; theme.setAttribute('aria-label', d ? 'Light mode' : 'Dark mode'); }, 'home-tool', dark ? 'Light mode' : 'Dark mode');
  if (musicButton) { musicButton.classList.add('home-tool'); tools.append(musicButton); }
  if (onSettings) tools.append(button('Aa', onSettings, 'home-tool', 'Reading settings'));
  tools.append(theme);
  top.append(readout, tools);

  const stage = el('div', 'home-stage'), front = el('div', 'home-front');
  const count = systems.reduce((n, s) => n + s.games, 0), line = `welcome to VN Library ✦ ${count} game${count === 1 ? '' : 's'} ✦ ${compact(total.totals.characters)} characters read ✦ ${hours(total.totals.activeMs)} of reading ✦`;
  const marquee = el('div', 'home-marquee'); marquee.setAttribute('aria-hidden', 'true'); marquee.append(el('span', '', line));
  const rule = el('hr', 'home-rule');
  front.append(el('h2', 'home-title', 'VN Library'), rule, marquee);
  const stats = statsView(total, games, systems, options);
  stage.append(front, stats);

  const items = [];
  if (resume) items.push({key: 'resume', label: 'resume', caption: resume.title, run: resume.onClick});
  for (const s of systems) items.push({key: s.id, system: s.id, label: s.label, caption: `${s.name} · ${s.games} game${s.games === 1 ? '' : 's'}`, run: () => onSystem(s.id)});
  items.push({key: 'stats', label: 'stats', caption: `${compact(total.totals.characters)} chars · ${hours(total.totals.activeMs)}`, run: () => setView(page.classList.contains('home-show-stats') ? 'menu' : 'stats')});
  const menu = el('nav', 'home-menu'); menu.setAttribute('aria-label', 'Main menu'); menu.style.setProperty('--count', items.length);
  const caption = el('p', 'home-caption'); caption.setAttribute('aria-live', 'polite');
  const buttons = items.map((item, i) => {
    const b = button(item.label, item.run, 'home-item'); b.dataset.key = item.key; if (item.system) b.dataset.system = item.system;
    b.addEventListener('pointerenter', () => select(i)); b.addEventListener('focus', () => select(i)); menu.append(b); return b;
  });
  let current = -1;
  function select(i) { current = i; buttons.forEach((b, k) => b.classList.toggle('is-selected', k === i)); caption.textContent = items[i].caption; }
  function setView(next) {
    const open = next === 'stats'; page.classList.toggle('home-show-stats', open); stats.hidden = !open; front.hidden = open;
    buttons.at(-1).setAttribute('aria-pressed', String(open));
    if (open) select(buttons.length - 1);
  }
  // Arrow keys move through the menu from anywhere on Home (left/right, or up/down when stacked).
  const keys = e => {
    if (!page.isConnected || e.altKey || e.ctrlKey || e.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    if (e.target.closest?.('input,select,textarea,.home-stats')) return;
    e.preventDefault(); const i = buttons.indexOf(document.activeElement), n = buttons.length, back = ['ArrowLeft', 'ArrowUp'].includes(e.key);
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : i < 0 ? current : (i + (back ? -1 : 1) + n) % n;
    buttons[next].focus();
  };
  document.addEventListener('keydown', keys);
  page.addEventListener('keydown', e => { if (e.key === 'Escape' && page.classList.contains('home-show-stats')) { e.preventDefault(); e.stopPropagation(); setView('menu'); buttons.at(-1).focus(); } });

  page.append(top, stage, menu, caption);
  body.append(page);
  setView(initialView);
  const start = Math.max(0, items.findIndex(item => item.key === (initialView === 'stats' ? 'stats' : selected)));
  select(start);
  if (notice) caption.textContent = notice;
  return () => { document.removeEventListener('keydown', keys); };
}
