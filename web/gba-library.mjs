// advance: the library menu is drawn as a native 240×160 frame and scaled up with
// hard pixel edges. Transparent DOM controls sit over each drawn row, so keyboard,
// pointer and assistive technology use real buttons. Original UI, no firmware assets.
export const SCREEN = Object.freeze({width: 240, height: 160});
const ROW = 14, TOP = 20, BOTTOM = 146, TABS = [['games', 'Games'], ['settings', 'Settings'], ['add', 'Add game']];
// GBA colours are 15-bit: every channel is a multiple of 8.
const C = {bg: '#101830', panel: '#182850', edge: '#98b8f8', text: '#f8f8f8', dim: '#8898c0',
  bar: '#3060c8', tab: '#203870', tabOn: '#f8d848', tabInk: '#101830', cursor: '#f8d848', note: '#c8d8f8'};
const playable = game => !['blocked', 'unsupported', 'extraction-only'].includes(game.compatibility?.status);
const FONT = '"Noto Sans CJK JP","MS Gothic","DejaVu Sans",sans-serif';

// Text is rasterised at 1:1 and thresholded to on/off pixels, as on a 15-bit LCD.
function pixelText(ctx, text, x, y, color, size = 10, bold = false) {
  const scratch = pixelText.canvas ||= document.createElement('canvas');
  const s = scratch.getContext('2d', {willReadFrequently: true});
  s.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
  const width = Math.max(1, Math.ceil(s.measureText(text).width) + 2), height = size + 4;
  scratch.width = width; scratch.height = height;
  s.font = `${bold ? '700 ' : ''}${size}px ${FONT}`; s.textBaseline = 'top'; s.fillStyle = '#fff'; s.fillText(text, 0, 1);
  const image = s.getImageData(0, 0, width, height), [r, g, b] = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < image.data.length; i += 4) {
    const on = image.data[i + 3] >= 110;
    image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = on ? 255 : 0;
  }
  s.putImageData(image, 0, 0);
  ctx.drawImage(scratch, Math.round(x), Math.round(y));
  return width - 2;
}
function measure(text, size, bold = false) {
  const m = (measure.ctx ||= document.createElement('canvas').getContext('2d'));
  m.font = `${bold ? '700 ' : ''}${size}px ${FONT}`;
  return Math.ceil(m.measureText(text).width);
}
const at = (x, y, w, h) => `left:calc(${x}px * var(--advance-scale));top:calc(${y}px * var(--advance-scale));width:calc(${w}px * var(--advance-scale));height:calc(${h}px * var(--advance-scale))`;
function frame(ctx, x, y, w, h, fill) {
  ctx.fillStyle = C.edge; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
}
function cursor(ctx, x, y) {
  ctx.fillStyle = C.cursor;
  for (let i = 0; i < 4; i++) ctx.fillRect(x + i, y + i, 1, 7 - i * 2);
}
function wrap(ctx, text, width, size) {
  ctx.font = `${size}px ${FONT}`;
  const lines = []; let line = '';
  for (const word of text.split(/(\s+)/)) {
    if (ctx.measureText((line + word).trimEnd()).width > width && line.trim()) { lines.push(line.trim()); line = word.trimStart(); }
    else line += word;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function gbaLibrary(body, games, {launch, soundTest, saveLocation, display, settings, menuMusic, toggleMusic, credit}) {
  const root = document.createElement('section'); root.className = 'advance'; root.setAttribute('aria-label', 'advance library');
  const screen = document.createElement('div'); screen.className = 'advance-screen';
  const canvas = document.createElement('canvas'); canvas.width = SCREEN.width; canvas.height = SCREEN.height; canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  const tabs = document.createElement('div'); tabs.className = 'advance-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Library categories');
  const content = document.createElement('div'); content.className = 'advance-content'; content.id = 'advance-content'; content.setAttribute('role', 'tabpanel');
  screen.append(canvas, tabs, content); root.append(screen); body.append(root);
  let category = 'games', open = null, scroll = 0, focusKey = null, note = '';
  const tabButtons = TABS.map(([id, label], index) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'advance-tab'; b.id = `advance-${id}`; b.textContent = label;
    b.dataset.category = id; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', content.id);
    b.style.cssText = at(4 + index * 78, 3, 76, 13);
    b.onclick = () => show(id); b.onfocus = draw; b.onblur = draw; tabs.append(b); return b;
  });

  function rows() {
    if (category === 'games') {
      const list = [];
      games.forEach((game, index) => {
        list.push({key: `game:${index}`, label: game.title, kind: 'game', expanded: open === index,
          run: () => { open = open === index ? null : index; focusKey = `game:${index}`; build(); }});
        if (open !== index) return;
        if (!playable(game)) { list.push({key: `game:${index}:blocked`, label: 'Not playable yet.', kind: 'info', indent: 1}); return; }
        for (const [label, run] of [['Read / resume', () => launch(game)], ['Start again', () => launch(game, false)],
          ...(game.entries || []).map(entry => [entry.label, () => launch(game, false, entry.id)]),
          ['Sound test', () => soundTest(game)], ['Save location', () => saveLocation(game)]])
          list.push({key: `game:${index}:${label}`, label, kind: 'action', indent: 1, run});
      });
      if (!games.length) list.push({key: 'empty', label: 'No games yet.', kind: 'info'});
      return list;
    }
    if (category === 'settings') {
      const volume = Math.round((menuMusic?.volume ?? 0) * 100);
      return [
        {key: 'display', label: 'Display', kind: 'action', run: display},
        {key: 'reading', label: 'Reading', kind: 'action', run: settings},
        {key: 'music', label: `Music  ${menuMusic?.muted ? 'OFF' : menuMusic?.blocked ? 'PAUSED' : 'ON'}`, kind: 'action', aria: 'Menu music on or off',
          run: () => { toggleMusic?.(); build(); }},
        {key: 'volume', label: `Volume  ${String(volume).padStart(3)}%`, kind: 'action', aria: 'Menu music volume',
          run: () => { menuMusic?.setVolume(((volume + 10) % 110) / 100); build(); }},
        {key: 'credit', label: 'Music credit', kind: 'action', run: () => { note = note ? '' : credit; build(); }},
      ];
    }
    return [{key: 'add', label: 'Add game', kind: 'action', run: () => { note = 'GBA cartridge imports use the local importer. Nothing is uploaded.'; build(); }}];
  }
  let current = [];
  function build() {
    current = rows();
    const focused = document.activeElement;
    content.replaceChildren(); content.setAttribute('aria-labelledby', `advance-${category}`);
    for (const row of current) {
      const node = document.createElement(row.kind === 'info' ? 'p' : 'button');
      node.textContent = row.label; node.dataset.key = row.key; node.className = `advance-row advance-${row.kind}`;
      if (row.aria) node.setAttribute('aria-label', `${row.aria}: ${row.label.split(/\s+/).pop()}`);
      if (row.kind !== 'info') { node.type = 'button'; node.onclick = row.run; node.onfocus = () => { focusKey = row.key; reveal(); draw(); }; node.onblur = draw; }
      if (row.kind === 'game') node.setAttribute('aria-expanded', String(row.expanded));
      content.append(node);
    }
    if (note) { const p = document.createElement('p'); p.className = 'advance-row advance-note'; p.setAttribute('role', 'status'); p.textContent = note; content.append(p); }
    for (const b of tabButtons) { const active = b.dataset.category === category; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; }
    const again = focusKey && content.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
    if (again && (focused === document.body || content.contains(focused) || !focused)) again.focus({preventScroll: true});
    reveal(); draw();
  }
  function reveal() {
    const index = current.findIndex(r => r.key === focusKey), visible = Math.floor((BOTTOM - TOP) / ROW);
    if (index >= 0) { if (index < scroll) scroll = index; if (index >= scroll + visible) scroll = index - visible + 1; }
    scroll = Math.max(0, Math.min(scroll, Math.max(0, current.length - visible)));
    [...content.children].forEach((node, i) => {
      const y = TOP + (i - scroll) * ROW, inside = i >= scroll && y + ROW <= BOTTOM && !node.classList.contains('advance-note');
      node.style.cssText = at(4, y, 232, ROW);
      node.classList.toggle('advance-offscreen', !inside && !node.classList.contains('advance-note'));
    });
  }
  function draw() {
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, SCREEN.width, SCREEN.height);
    TABS.forEach(([id, label], index) => {
      const on = id === category, x = 4 + index * 78;
      frame(ctx, x, 3, 76, 13, on ? C.tabOn : C.tab);
      const w = measure(label, 9, true);
      pixelText(ctx, label, x + Math.floor((76 - w) / 2), 4, on ? C.tabInk : C.note, 9, true);
      if (document.activeElement === tabButtons[index]) { ctx.fillStyle = on ? C.tabInk : C.cursor; ctx.fillRect(x + 3, 13, 70, 1); }
    });
    frame(ctx, 2, TOP - 2, 236, BOTTOM - TOP + 4, C.panel);
    const visible = Math.floor((BOTTOM - TOP) / ROW);
    current.slice(scroll, scroll + visible).forEach((row, i) => {
      const y = TOP + i * ROW, active = row.key === focusKey && content.contains(document.activeElement), x = 14 + (row.indent || 0) * 12;
      if (active) { ctx.fillStyle = C.bar; ctx.fillRect(4, y, 232, ROW); cursor(ctx, x - 9, y + 3); }
      let label = row.label;
      if (row.kind === 'game') label = `${row.expanded ? '▾' : '▸'} ${label}`;
      pixelText(ctx, label, x, y + 1, row.kind === 'info' ? C.dim : C.text, 10, row.kind === 'game');
    });
    if (scroll > 0) { ctx.fillStyle = C.edge; ctx.fillRect(118, TOP - 1, 4, 1); ctx.fillRect(119, TOP - 2, 2, 1); }
    if (scroll + visible < current.length) { ctx.fillStyle = C.edge; ctx.fillRect(118, BOTTOM, 4, 1); ctx.fillRect(119, BOTTOM + 1, 2, 1); }
    if (note) {
      const lines = wrap(ctx, note, 220, 9).slice(0, 3), h = lines.length * 11 + 5, y = BOTTOM - h - 1;
      frame(ctx, 6, y, 228, h, C.bg); lines.forEach((line, i) => pixelText(ctx, line, 11, y + 3 + i * 11, C.note, 9));
    }
    pixelText(ctx, '◀▶ TAB   ▲▼ MOVE   A OK', 6, 149, C.dim, 8);
  }
  function show(id) { category = id; open = null; scroll = 0; note = ''; focusKey = rows()[0]?.key; build(); }

  root.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = TABS.findIndex(([id]) => id === category);
    if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      show(TABS[next][0]); tabButtons[next].focus();
    } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      const targets = [...content.querySelectorAll('button')]; if (!targets.length) return;
      event.preventDefault(); const at = targets.indexOf(document.activeElement);
      if (event.key === 'ArrowUp' && at <= 0) { tabButtons[index].focus(); return; }
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)));
      targets[next].focus();
    } else if (event.key === 'Escape' && open !== null && category === 'games') {
      event.preventDefault(); event.stopPropagation(); focusKey = `game:${open}`; open = null; build();
    }
  });
  // Whole-number magnification when there is room for 2× or more; smaller screens fit exactly.
  const fit = () => {
    const room = Math.min(body.clientWidth - 16, body.clientHeight - 16) > 0 ? Math.min((body.clientWidth - 16) / SCREEN.width, (body.clientHeight - 16) / SCREEN.height) : 1;
    const scale = room >= 2 ? Math.floor(room) : Math.max(1, room);
    root.style.setProperty('--advance-scale', String(scale));
  };
  const observer = new ResizeObserver(fit); observer.observe(body); fit();
  const previous = menuMusic?.onChange; if (menuMusic) menuMusic.onChange = () => { previous?.(); build(); };
  show('games'); tabButtons[0].focus({preventScroll: true});
  return () => { observer.disconnect(); if (menuMusic) menuMusic.onChange = previous; };
}
