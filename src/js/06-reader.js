// ---------- reader core: layout, page-turn engine, gestures, progress ----------
const READER_DEFAULTS = {
  paper: 'auto', font: 'literata', size: 0, lh: 1.6, margin: 'm', align: 'auto', para: 'space',
  layout: 'auto', fx: 'flip', pdfInvert: true, tapZones: true, sound: false, wake: true,
};
const FONTS = {
  literata: { label: 'Literata', css: '"Literata", Georgia, serif' },
  sourceserif: { label: 'Source Serif', css: '"Source Serif 4", Georgia, serif', gf: 'Source+Serif+4:ital,opsz,wght@0,8..60,400..700;1,8..60,400' },
  atkinson: { label: 'Atkinson', css: '"Atkinson Hyperlegible", system-ui, sans-serif' },
  lexend: { label: 'Lexend', css: '"Lexend", system-ui, sans-serif', gf: 'Lexend:wght@300..600' },
  system: { label: 'Sistem', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};
const PAPERS = [
  { id: 'auto', label: 'Otomatis', fg: 'var(--paper-ink)', bg: 'var(--paper)' },
  { id: 'putih', label: 'Putih', bg: '#fbfbf8', fg: '#1d1f1c', vars: { '--paper': '#fbfbf8', '--paper-ink': '#1d1f1c', '--paper-mute': '#6b6f68', '--paper-rule': '#d8dad3', '--paper-link': '#275b9e', '--paper-code': '#eff0eb', '--hl-blend': 'multiply' } },
  { id: 'krem', label: 'Krem', bg: '#f4ecdc', fg: '#382c1f', vars: { '--paper': '#f4ecdc', '--paper-ink': '#382c1f', '--paper-mute': '#7b6a55', '--paper-rule': '#dccdb3', '--paper-link': '#7a4b16', '--paper-code': '#ebe1cc', '--hl-blend': 'multiply' } },
  { id: 'abu', label: 'Abu', bg: '#e1e3de', fg: '#222624', vars: { '--paper': '#e1e3de', '--paper-ink': '#222624', '--paper-mute': '#5d635f', '--paper-rule': '#c6cac3', '--paper-link': '#2d5c88', '--paper-code': '#d6d9d3', '--hl-blend': 'multiply' } },
  { id: 'malam', label: 'Malam', bg: '#1c1f1e', fg: '#cdd3cf', vars: { '--paper': '#1c1f1e', '--paper-ink': '#cdd3cf', '--paper-mute': '#8a948f', '--paper-rule': '#343a37', '--paper-link': '#8fb8e8', '--paper-code': '#262a28', '--hl-blend': 'screen' } },
];
const MARGINS = { s: [5.5, 6], m: [8, 9], l: [11, 12.5] }; // [inner %, outer %] of page width

const S = { books: new Map(), progress: new Map(), settings: null, stats: null, booksLoaded: false, userLoaded: false };
const DEVICE_KEYS = ['size', 'layout'];
function readerSettings() {
  const synced = { ...((S.settings && S.settings.reader) || LS.get('reader', {})) };
  for (const k of DEVICE_KEYS) delete synced[k];
  return { ...READER_DEFAULTS, ...synced, ...LS.get('readerLocal', {}) };
}
const saveSettingsSoon = debounce(() => {
  const synced = { ...R.set };
  const local = {};
  for (const k of DEVICE_KEYS) { local[k] = R.set[k]; delete synced[k]; }
  LS.set('readerLocal', local);
  LS.set('reader', synced);
  const data = { ...(S.settings || {}), reader: synced, updatedAt: Date.now() };
  S.settings = data;
  Store && Store.putSettings(data).catch(() => {});
}, 900);

const R = {
  open: false, bookId: null, book: null, temp: false, src: null, N: 0,
  mode: 'single', view: 0, pw: 0, ph: 0, layoutVer: 0, layoutKey: '',
  pages: new Map(), useClock: 0, anim: null, queued: 0,
  chromeHidden: false, docked: false, set: { ...READER_DEFAULTS },
  ann: [], annUnsub: null, search: '', progress: null, openedAt: 0,
  els: {}, busy: false, dwell: [], pageEnteredAt: 0,
};

function initReaderDom() {
  const e = R.els;
  e.reader = $('#reader'); e.stage = $('#stage'); e.book = $('#book'); e.measure = $('#measure');
  e.top = $('#rTop'); e.bottom = $('#rBottom'); e.title = $('#rTitle'); e.sub = $('#rSub');
  e.pos = $('#rPos'); e.eta = $('#rEta'); e.slider = $('#slider'); e.tip = $('#scrubTip');
  e.loading = $('#readerLoading'); e.loadingText = $('#loadingText'); e.loadingBar = $('#loadingBar');
  e.book.innerHTML = '';
  e.edgeL = h('div', { class: 'edges l' }); e.edgeR = h('div', { class: 'edges r' });
  e.shadow = h('div', { class: 'book-shadow' });
  e.slotL = h('div', { class: 'slot L' }); e.slotR = h('div', { class: 'slot R' });
  e.book.append(e.shadow, e.edgeL, e.edgeR, e.slotL, e.slotR);
  $('#rBack').onclick = () => closeReader();
  $('#rPrev').onclick = () => turn(-1);
  $('#rNext').onclick = () => turn(1);
  $('#navPrev').onclick = () => turn(-1);
  $('#navNext').onclick = () => turn(1);
  $('#rMark').onclick = () => toggleBookmark();
  $('#rToc').onclick = () => openNavPanel('toc');
  $('#rSearch').onclick = () => openSearchPanel();
  $('#rType').onclick = () => openSettingsPanel();
  $('#rMore').onclick = (ev) => openReaderMenu(ev.currentTarget);
  bindSlider();
  bindGestures();
  addEventListener('resize', debounce(() => { if (R.open) relayout(); }, 180));
  if (window.visualViewport) visualViewport.addEventListener('resize', debounce(() => { if (R.open) relayout(); }, 220));
  document.addEventListener('keydown', onReaderKey);
  document.addEventListener('visibilitychange', () => {
    if (!R.open) return;
    if (document.visibilityState === 'hidden') { Reading.flush(); if (!R.temp) saveProgress(); }
    else { Reading.touch(); Wake.on(); }
  });
  addEventListener('pagehide', () => { if (R.open) { Reading.flush(); if (!R.temp) saveProgress(); } });
  document.addEventListener('selectionchange', debounce(onSelectionChange, 160));
}

// ----- settings application -----
function applyReaderSettings() {
  const s = R.set, el = R.els.reader;
  const paper = PAPERS.find((p) => p.id === s.paper) || PAPERS[0];
  for (const p of PAPERS) if (p.vars) for (const k of Object.keys(p.vars)) el.style.removeProperty(k);
  if (paper.vars) for (const [k, v] of Object.entries(paper.vars)) el.style.setProperty(k, v);
  el.dataset.paper = paper.id;
  const isPdf = !!(R.src && R.src.kind === 'pdf');
  el.classList.toggle('pdf-invert', isPdf && paper.id === 'malam' && !!s.pdfInvert);
  el.classList.toggle('pdf-dim', isPdf && paper.id === 'auto' && isDarkUI());
  const f = FONTS[s.font] || FONTS.literata;
  if (f.gf) ensureFont(f.gf);
  el.style.setProperty('--rf', f.css);
  el.style.setProperty('--rs', effectiveFontSize() + 'px');
  el.style.setProperty('--rlh', String(s.lh));
  setAlignVars();
  el.style.setProperty('--pgap', s.para === 'indent' ? '0' : (0.62 * s.lh / 1.6).toFixed(2) + 'em');
}
function setAlignVars() {
  const s = R.set, el = R.els.reader;
  let just = s.align === 'justify';
  if (s.align === 'auto' && R.pw) {
    const g = flowGeometry(R.pw, R.ph);
    just = (R.pw - g.pi - g.po) / effectiveFontSize() >= 21;
  }
  el.style.setProperty('--ralign', just ? 'justify' : 'left');
  el.style.setProperty('--ralign-last', just ? 'justify' : 'auto');
  el.style.setProperty('--rhy', just ? 'auto' : 'manual');
}
function isDarkUI() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
function effectiveFontSize() { return R.set.size || (innerWidth < 600 ? 17 : (R.mode === 'single' && innerWidth >= 740 && innerWidth < 1100 && isTouchUI()) ? 19.5 : 18.5); }
const loadedFonts = new Set();
function ensureFont(spec) {
  if (loadedFonts.has(spec)) return;
  loadedFonts.add(spec);
  const l = document.createElement('link');
  l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + spec + '&display=swap';
  l.onload = () => { if (R.open && R.src && R.src.kind === 'flow') { document.fonts && document.fonts.ready.then(() => relayout(true)); } };
  document.head.append(l);
}

// ----- geometry -----
function computeLayout() {
  const st = R.els.stage;
  const W = st.clientWidth, H = st.clientHeight;
  const small = W < 600;
  const pad = small ? 6 : 22;
  const aw = W - pad * 2 - (small ? 0 : 20), ah = H - pad * 2;
  const pref = R.set.layout;
  let mode, pw, ph;
  if (R.src.kind === 'pdf') {
    const a = R.src.aspect || 0.707;
    const ph1 = Math.min(ah, aw / a), ph2 = Math.min(ah, aw / (2 * a));
    const spreadOK = ph2 * a >= 230 && (R.src.N || 0) > 1;
    mode = pref === 'single' ? 'single' : pref === 'spread' ? (spreadOK ? 'spread' : 'single') : (spreadOK && ph2 >= ph1 * 0.8 ? 'spread' : 'single');
    ph = Math.floor(mode === 'spread' ? ph2 : ph1);
    pw = Math.floor(ph * a);
  } else {
    let pw2 = Math.min(aw / 2, 620);
    if (ah * 0.75 >= 330) pw2 = Math.min(pw2, ah * 0.75);
    const spreadOK = pw2 >= 300;
    mode = pref === 'single' ? 'single' : pref === 'spread' ? (spreadOK ? 'spread' : 'single') : (spreadOK && W / H >= 1.15 && pw2 >= 330 ? 'spread' : 'single');
    if (mode === 'spread') { pw = Math.floor(pw2); ph = Math.floor(ah); } else {
      pw = Math.floor(small ? aw : Math.min(aw, 700));
      if (!small && ah * 0.8 >= 360) pw = Math.min(pw, Math.floor(ah * 0.8));
      ph = Math.floor(ah);
    }
  }
  return { mode, pw: Math.max(120, pw), ph: Math.max(160, ph) };
}
function flowGeometry(pw, ph) {
  const [inner, outer] = MARGINS[R.set.margin] || MARGINS.m;
  const small = pw < 420;
  const pi = Math.round(pw * (small ? inner * 0.75 : inner) / 100);
  const po = Math.round(pw * (small ? outer * 0.75 : outer) / 100);
  const short = ph < 460;
  const pt = Math.round(short ? 10 : Math.max(14, ph * 0.045)), pb = Math.round(short ? 8 : Math.max(12, ph * 0.035));
  return { pi, po, pt, pb, rhH: short ? 18 : 26, folioH: short ? 16 : 22 };
}
function applyGeometryVars(target, g) {
  target.style.setProperty('--pi', g.pi + 'px');
  target.style.setProperty('--po', g.po + 'px');
  target.style.setProperty('--pt', g.pt + 'px');
  target.style.setProperty('--pb', g.pb + 'px');
  target.style.setProperty('--rh-h', g.rhH + 'px');
  target.style.setProperty('--folio-h', g.folioH + 'px');
}

async function relayout(force) {
  if (!R.open || !R.src) return;
  const lay = computeLayout();
  const flowKey = R.src.kind === 'flow' ? [R.set.font, effectiveFontSize(), R.set.lh, R.set.margin, R.set.align, R.set.para].join('|') : '';
  const key = [lay.mode, lay.pw, lay.ph, flowKey].join('/');
  if (!force && key === R.layoutKey) return;
  const anchorPage = R.N ? firstPageOfView(R.view) : 0;
  const anchor = R.readAnchor || (R.N && R.src.anchorOf ? R.src.anchorOf(anchorPage) : null);
  cancelAnim();
  R.layoutKey = key;
  R.layoutVer++;
  R.mode = lay.mode; R.pw = lay.pw; R.ph = lay.ph;
  const b = R.els.book;
  b.classList.toggle('single', R.mode === 'single');
  b.style.width = (R.mode === 'spread' ? R.pw * 2 : R.pw) + 'px';
  b.style.height = R.ph + 'px';
  b.style.perspective = Math.round(Math.max(1600, R.pw * 6)) + 'px';
  for (const el of R.pages.values()) R.src.release && R.src.release(el);
  R.pages.clear();
  if (R.src.kind === 'flow') {
    const g = flowGeometry(R.pw, R.ph);
    applyGeometryVars(R.els.reader, g);
    setAlignVars();
    R.els.reader.style.setProperty('--ch', (R.ph - g.pt - g.pb - g.rhH - g.folioH) + 'px');
    const showBar = R.src.blocks.length > 400;
    if (showBar) setLoading(true, 'Menyusun halaman…', 0);
    await R.src.paginate(R.pw, R.ph, (p) => showBar && setLoading(true, 'Menyusun halaman…', p), key);
    if (showBar) setLoading(false);
    R.N = R.src.N;
  } else {
    R.N = R.src.N;
  }
  const target = anchor && R.src.pageOfAnchor ? R.src.pageOfAnchor(anchor) : anchorPage;
  R.view = viewOfPage(clamp(target, 0, R.N - 1));
  renderView();
  afterView(false);
}

// ----- views -----
function viewCount() { return R.mode === 'spread' ? Math.floor(R.N / 2) + 1 : R.N; }
function viewPages(v) {
  if (R.mode !== 'spread') return [null, v];
  const l = 2 * v - 1, r = 2 * v;
  return [l >= 0 && l < R.N ? l : null, r < R.N ? r : null];
}
function viewOfPage(i) { return R.mode === 'spread' ? Math.floor((i + 1) / 2) : i; }
function firstPageOfView(v) { const [l, r] = viewPages(v); return l != null ? l : r; }
function lastPageOfView(v) { const [l, r] = viewPages(v); return r != null ? r : l; }
function visiblePages() { const [l, r] = viewPages(R.view); return [l, r].filter((x) => x != null); }

function pageEl(i) {
  let el = R.pages.get(i);
  if (!el) {
    el = h('div', { class: 'page', 'data-i': i });
    el._ver = R.layoutVer;
    R.pages.set(i, el);
    R.src.fill(el, i);
    el.append(h('div', { class: 'corner-hint' }));
    decoratePage(el, i);
  }
  el._used = ++R.useClock;
  return el;
}
function place(slot, el, side) {
  if (!el) { slot.replaceChildren(); return; }
  el.dataset.side = side;
  if (el.parentNode !== slot || slot.childNodes.length !== 1) slot.replaceChildren(el);
}
function renderView() {
  const e = R.els;
  e.book.querySelectorAll('.leaf, .cast').forEach((x) => x.remove());
  const [l, r] = viewPages(R.view);
  if (R.mode === 'spread') {
    place(e.slotL, l != null ? pageEl(l) : null, 'l');
    place(e.slotR, r != null ? pageEl(r) : null, 'r');
  } else {
    e.slotL.replaceChildren();
    place(e.slotR, pageEl(R.view), 'r');
  }
}
function updateEdges() {
  const e = R.els;
  if (R.mode !== 'spread' || R.N < 4) { e.book.style.setProperty('--edge-l', '0px'); e.book.style.setProperty('--edge-r', '0px'); }
  else {
    const max = Math.min(11, 3 + R.N / 25);
    const before = firstPageOfView(R.view) / R.N;
    e.book.style.setProperty('--edge-l', (before > 0 ? Math.max(1.5, max * before) : 0).toFixed(1) + 'px');
    e.book.style.setProperty('--edge-r', (Math.max(0, max * (1 - lastPageOfView(R.view) / Math.max(1, R.N - 1)))).toFixed(1) + 'px');
  }
  const [l, r] = viewPages(R.view);
  if (R.mode === 'spread') {
    e.shadow.style.left = l == null ? '50%' : '0';
    e.shadow.style.right = r == null ? '50%' : '0';
  } else { e.shadow.style.left = '0'; e.shadow.style.right = '0'; }
}

function afterView(changed) {
  if (!R.open) return;
  if (changed) { R.prevView = R.curView; R.curView = R.view; R.readAnchor = R.src.anchorOf ? R.src.anchorOf(firstPageOfView(R.view)) : null; }
  const first = firstPageOfView(R.view), last = lastPageOfView(R.view);
  updateEdges();
  updateChromeText();
  updateBookmarkUI();
  for (const i of visiblePages()) { const el = R.pages.get(i); if (el) R.src.onShow && R.src.onShow(el, i); }
  if (changed) {
    const now = performance.now();
    if (R.pageEnteredAt) R.dwell.push((now - R.pageEnteredAt) / 1000 / Math.max(1, visiblePages().length));
    if (R.dwell.length > 30) R.dwell.shift();
    R.pageEnteredAt = now;
    Reading.touch(true);
    if (!R.temp) saveProgressSoon();
    TTS.onViewChanged && TTS.onViewChanged();
    if (last >= R.N - 1 && !R.temp && R.prevView === R.view - 1) maybeFinish();
  }
  prefetch();
  void first;
  if (Panel.kind === 'nav') Panel.refreshCurrent && Panel.refreshCurrent();
}
function prefetch() {
  const keep = new Set();
  const span = R.src.kind === 'pdf' ? 2 : 3;
  for (let d = -span; d <= span; d++) {
    const v = R.view + d;
    if (v < 0 || v >= viewCount()) continue;
    for (const i of viewPages(v)) if (i != null) keep.add(i);
  }
  const order = [...keep].sort((a, b) => Math.abs(a - firstPageOfView(R.view)) - Math.abs(b - firstPageOfView(R.view)));
  for (const i of order) pageEl(i);
  const limit = R.src.kind === 'pdf' ? 12 : 30;
  if (R.pages.size > limit) {
    const entries = [...R.pages.entries()].filter(([i, el]) => !keep.has(i) && !el.isConnected).sort((a, b) => a[1]._used - b[1]._used);
    for (const [i, el] of entries.slice(0, R.pages.size - limit)) { R.src.release && R.src.release(el); R.pages.delete(i); }
  }
  R.src.prioritize && R.src.prioritize(firstPageOfView(R.view));
}

// ----- chrome -----
function updateChromeText() {
  const e = R.els;
  const first = firstPageOfView(R.view), last = lastPageOfView(R.view);
  const label = (i) => (R.src.labelOf ? R.src.labelOf(i) : String(i + 1));
  const range = first === last ? label(first) : `${label(first)}–${label(last)}`;
  const pct = Math.round(R.src.pctOf(last) * 100);
  e.pos.textContent = `Hal. ${range} dari ${R.N} · ${pct}%`;
  const ch = R.src.chapterOf ? R.src.chapterOf(first) : '';
  e.sub.textContent = ch || (R.book && R.book.author) || '';
  e.slider.max = String(Math.max(1, R.N));
  if (!e.slider._drag) e.slider.value = String(first + 1);
  e.slider.style.setProperty('--p', (R.N > 1 ? (first / (R.N - 1)) * 100 : 100) + '%');
  e.eta.textContent = etaText(last);
}
function secsPerPage() {
  const vals = R.dwell.filter((s) => s > 4 && s < 600).sort((a, b) => a - b);
  if (vals.length >= 3) return vals[Math.floor(vals.length / 2)];
  if (R.src.kind === 'flow' && R.src.wordsPerPage) return Math.max(20, R.src.wordsPerPage() / 200 * 60);
  return 70;
}
function etaText(last) {
  const left = R.N - 1 - last;
  if (left <= 0) return 'Halaman terakhir';
  const spp = secsPerPage();
  let txt = '± ' + fmtDur(left * spp) + ' lagi';
  const next = R.src.nextChapterPage ? R.src.nextChapterPage(last) : null;
  if (next != null && next > last + 1 && next - last - 1 < left) txt = '± ' + fmtDur((next - last - 1) * spp) + ' di bab ini · ' + txt;
  return txt;
}
function setChrome(hidden) {
  R.chromeHidden = hidden;
  R.els.reader.classList.toggle('chrome-hidden', hidden);
}
function toggleChrome() { setChrome(!R.chromeHidden); }
function setLoading(on, text, p) {
  const e = R.els;
  e.loading.hidden = !on;
  if (!on) return;
  if (text) e.loadingText.textContent = text;
  if (p == null) e.loadingBar.hidden = true;
  else { e.loadingBar.hidden = false; e.loadingBar.firstElementChild.style.width = Math.round(p * 100) + '%'; }
}

function bindSlider() {
  const s = R.els.slider, tip = R.els.tip;
  const show = () => {
    const i = +s.value - 1;
    const ch = R.src && R.src.chapterOf ? R.src.chapterOf(i) : '';
    tip.textContent = `Hal. ${i + 1}${ch ? ' · ' + ch : ''}`;
    tip.hidden = false;
    const ratio = R.N > 1 ? i / (R.N - 1) : 0;
    tip.style.left = `calc(${ratio * 100}% + ${(0.5 - ratio) * 18}px)`;
    s.style.setProperty('--p', ratio * 100 + '%');
  };
  s.addEventListener('pointerdown', () => { s._drag = true; });
  s.addEventListener('input', show);
  s.addEventListener('change', () => { s._drag = false; tip.hidden = true; goToPage(+s.value - 1); });
  s.addEventListener('pointerup', () => { s._drag = false; setTimeout(() => { tip.hidden = true; }, 600); });
  s.addEventListener('keydown', (e) => e.stopPropagation());
}

// ----- navigation -----
function canGo(dir) { const v = R.view + dir; return v >= 0 && v < viewCount(); }
function effectiveFx() { return reducedMotion() ? 'none' : R.set.fx; }
function setView(v, opts = {}) {
  v = clamp(v, 0, Math.max(0, viewCount() - 1));
  const changed = v !== R.view;
  R.view = v;
  if (!opts.placed) renderView();
  afterView(changed);
}
function goToPage(i, opts = {}) {
  if (!R.open) return;
  i = clamp(i | 0, 0, R.N - 1);
  const v = viewOfPage(i);
  if (v === R.view) { if (opts.flash) flashPage(i); return; }
  cancelAnim();
  if (opts.animate && Math.abs(v - R.view) === 1) { turn(v - R.view); return; }
  setView(v);
  if (opts.flash) flashPage(i);
}
function flashPage(i) {
  const el = R.pages.get(i);
  if (!el) return;
  el.animate([{ filter: 'brightness(.93)' }, { filter: 'none' }], { duration: 500 });
}
function nudge(dir) {
  const b = R.els.book;
  b.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-dir * 10}px)` }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' });
  if (dir > 0 && R.N) toast('Ini halaman terakhir.', { ms: 1600 });
}
async function turn(dir) {
  if (!R.open || !R.N) return;
  if (R.anim) { if (R.anim.drag) return; R.queued = clamp((Math.sign(R.queued) === dir ? R.queued : 0) + dir, -6, 6); R.anim.hurry = true; return; }
  if (!canGo(dir)) { R.queued = 0; nudge(dir); return; }
  hideSelBar();
  const fx = effectiveFx();
  if (fx === 'none') { Sound.play(); setView(R.view + dir); return; }
  const f = fx === 'flip' ? beginFlip(dir) : beginSlide(dir);
  if (R.queued) f.hurry = true;
  R.anim = f;
  Sound.play();
  await f.run(1, f.ms);
  f.commit();
  R.anim = null;
  setView(f.to, { placed: true });
  if (R.queued) { const q = R.queued; const d = Math.sign(q); R.queued = q - d; if (!canGo(d)) R.queued = 0; turn(d); }
}
function cancelAnim() {
  const f = R.anim;
  if (!f) return;
  cancelAnimationFrame(f.raf);
  R.anim = null;
  R.queued = 0;
  f.dispose && f.dispose();
  renderView();
}

const FLIP_MS = 640;
function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function easeOut(x) { return 1 - Math.pow(1 - x, 3); }

function animateT(f, target, ms, ease) {
  return new Promise((res) => {
    const from = f.t;
    if (ms <= 0 || Math.abs(target - from) < 0.001) { f.setT(target); res(); return; }
    let prev = performance.now(), elapsed = 0;
    const step = (now) => {
      elapsed += Math.max(0, now - prev) * (f.hurry ? 2.6 : 1);
      prev = now;
      const k = Math.min(1, elapsed / ms);
      f.setT(from + (target - from) * ease(k));
      if (k < 1) f.raf = requestAnimationFrame(step); else res();
    };
    f.raf = requestAnimationFrame(step);
  });
}

function beginFlip(dir) {
  const e = R.els;
  const from = R.view, to = from + dir;
  const spread = R.mode === 'spread';
  const [fl, fr] = viewPages(from), [tl, tr] = viewPages(to);
  const leaf = h('div', { class: 'leaf' });
  const front = h('div', { class: 'face front' }), back = h('div', { class: 'face back' });
  leaf.append(front, back);
  const cast = h('div', { class: 'cast' });
  leaf.style.width = R.pw + 'px';
  leaf.style.left = (spread ? R.pw : 0) + 'px';
  let frontPage = null, backPage = null;
  if (spread) {
    if (dir > 0) { frontPage = fr != null ? pageEl(fr) : null; backPage = tl != null ? pageEl(tl) : null; }
    else { frontPage = tr != null ? pageEl(tr) : null; backPage = fl != null ? pageEl(fl) : null; }
  } else {
    frontPage = dir > 0 ? pageEl(from) : pageEl(to);
  }
  if (frontPage) { frontPage.dataset.side = 'r'; front.append(frontPage); } else front.classList.add('paperback');
  if (backPage) { backPage.dataset.side = 'l'; back.append(backPage); } else {
    back.classList.add('paperback');
    if (!spread && frontPage && R.src.kind === 'flow') {
      const ghost = h('div', { class: 'ghost' });
      const c = frontPage.cloneNode(true); c.style.position = 'absolute';
      ghost.append(c); back.append(ghost);
    }
  }
  if (spread) {
    if (dir > 0) place(e.slotR, tr != null ? pageEl(tr) : null, 'r');
    else place(e.slotL, tl != null ? pageEl(tl) : null, 'l');
  } else if (dir > 0) place(e.slotR, pageEl(to), 'r');
  e.book.append(leaf, cast);
  const pw = R.pw, spineX = spread ? R.pw : 0;
  const f = {
    leaf, front, back, cast, from, to, dir, t: 0, ms: FLIP_MS, raf: 0, hurry: false,
    setT(t) {
      f.t = t;
      const a = dir > 0 ? -180 * t : -180 * (1 - t);
      leaf.style.transform = `rotateY(${a.toFixed(2)}deg)`;
      const p = -a / 180;
      const s = Math.sin(Math.PI * p);
      front.style.setProperty('--shade', (s * 0.85).toFixed(3));
      back.style.setProperty('--shade', (s * 0.85).toFixed(3));
      const edge = pw * Math.cos(Math.PI * p);
      const w = 70 * s;
      if (edge >= 0) { cast.style.left = (spineX + edge) + 'px'; cast.style.background = `linear-gradient(to right, rgb(0 0 0 / ${(0.3 * s).toFixed(3)}), transparent)`; }
      else { cast.style.left = (spineX + edge - w) + 'px'; cast.style.background = `linear-gradient(to left, rgb(0 0 0 / ${(0.3 * s).toFixed(3)}), transparent)`; }
      cast.style.width = w + 'px';
      cast.style.opacity = '1';
      if (!spread) {
        // single page: fade the leaf as it swings past the spine, off the page
        const fade = p > 0.55 ? Math.max(0, 1 - (p - 0.55) / 0.45) : 1;
        front.style.opacity = back.style.opacity = fade.toFixed(3);
      }
    },
    run(target, ms) { return animateT(f, target, ms == null ? FLIP_MS : ms, f.drag ? easeOut : easeInOut); },
    commit() {
      if (spread) {
        if (dir > 0) place(e.slotL, backPage, 'l');
        else place(e.slotR, frontPage, 'r');
      } else if (dir < 0) place(e.slotR, frontPage, 'r');
      leaf.remove(); cast.remove();
      for (const p of [frontPage, backPage]) if (p) { p.style.opacity = ''; }
    },
    cancel() {
      if (spread) {
        if (dir > 0) place(e.slotR, frontPage, 'r');
        else place(e.slotL, backPage, 'l');
      } else if (dir > 0) place(e.slotR, frontPage, 'r');
      leaf.remove(); cast.remove();
    },
    dispose() { leaf.remove(); cast.remove(); },
  };
  f.setT(0);
  return f;
}

function beginSlide(dir) {
  const e = R.els;
  const from = R.view, to = from + dir;
  const b = e.book;
  const W = b.offsetWidth;
  let swapped = false;
  const f = {
    from, to, dir, t: 0, ms: 300, raf: 0, hurry: false,
    setT(t) {
      f.t = t;
      if (t < 0.5) {
        if (swapped) { swapped = false; R.view = from; renderView(); }
        const k = t / 0.5;
        b.style.transform = `translateX(${(-dir * k * W * 0.35).toFixed(1)}px)`;
        b.style.opacity = String(1 - k * 0.9);
      } else {
        if (!swapped) { swapped = true; R.view = to; renderView(); }
        const k = (1 - t) / 0.5;
        b.style.transform = `translateX(${(dir * k * W * 0.35).toFixed(1)}px)`;
        b.style.opacity = String(1 - k * 0.9);
      }
    },
    run(target, ms) { return animateT(f, target, ms == null ? f.ms : ms, f.drag ? easeOut : easeInOut); },
    commit() { b.style.transform = ''; b.style.opacity = ''; if (!swapped) { R.view = to; renderView(); } R.view = from; },
    cancel() { b.style.transform = ''; b.style.opacity = ''; R.view = from; renderView(); },
    dispose() { b.style.transform = ''; b.style.opacity = ''; R.view = from; },
  };
  return f;
}

// ----- gestures -----
const G = { pts: new Map(), down: null, drag: null, pinch: null, lastTap: 0, tapTimer: 0, wheel: 0, wheelLock: 0 };
function hasStageSelection() {
  const s = getSelection();
  if (!s || s.isCollapsed || !s.rangeCount) return false;
  const n = s.anchorNode;
  return !!(n && R.els.stage.contains(n.nodeType === 1 ? n : n.parentNode));
}
function edgeZone(x) {
  const r = R.els.book.getBoundingClientRect();
  if (x < r.left) return -1;
  if (x > r.right) return 1;
  const z = Math.min(90, r.width * (R.mode === 'spread' ? 0.09 : 0.16));
  if (x < r.left + z) return -1;
  if (x > r.right - z) return 1;
  return 0;
}
function dragProgress(d, x) {
  const dx = x - d.x;
  const travel = R.mode === 'spread' ? R.pw * 1.25 : R.pw * 0.85;
  const lin = clamp((d.dir > 0 ? -dx : dx) / travel, 0, 1);
  return effectiveFx() === 'flip' ? Math.acos(1 - 2 * lin) / Math.PI : lin;
}
function bindGestures() {
  const st = R.els.stage;
  st.addEventListener('pointerdown', (e) => {
    if (!R.open || !R.N) return;
    G.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pts.size === 2) {
      if (G.drag && G.drag.f) { const f = G.drag.f; G.drag = null; f.cancel(); R.anim = null; }
      G.down = null;
      if (R.src.kind === 'pdf') {
        const [a, b] = [...G.pts.values()];
        G.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      }
      return;
    }
    if (G.pts.size > 2 || e.button > 0) return;
    const t = e.target;
    const interactive = !!t.closest('a[href], button, input, textarea, select, .hl-layer i, mark.hl');
    const inText = !!t.closest('.pc, .textLayer');
    const d = G.down = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, interactive, inText, edge: edgeZone(e.clientX), moved: false, hist: [{ x: e.clientX, t: performance.now() }], selectOnly: false };
    if (e.pointerType === 'mouse' && inText && !d.edge) d.selectOnly = true;
    if (e.pointerType !== 'mouse') d.lp = setTimeout(() => { if (G.down === d && !d.moved) d.selectOnly = true; }, 420);
    Reading.touch();
  });
  st.addEventListener('pointermove', (e) => {
    if (G.pts.has(e.pointerId)) G.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (G.pinch && G.pts.size === 2) {
      const [a, b] = [...G.pts.values()];
      const sc = Math.hypot(a.x - b.x, a.y - b.y) / G.pinch.d0;
      if (sc > 1.12) {
        const p = G.pinch; G.pinch = null;
        openZoomAt(p.mx, p.my, clamp(sc * 1.4, 1.5, 4));
      }
      return;
    }
    const d = G.down;
    if (!d || d.id !== e.pointerId) {
      if (e.pointerType === 'mouse' && !e.buttons) hoverHint(e.clientX);
      return;
    }
    if (d.selectOnly) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.hist.push({ x: e.clientX, t: performance.now() });
    if (d.hist.length > 6) d.hist.shift();
    if (!G.drag) {
      if (Math.hypot(dx, dy) > 9) d.moved = true;
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      if (hasStageSelection()) return;
      clearTimeout(d.lp);
      const dir = dx < 0 ? 1 : -1;
      if (R.anim) return;
      if (!canGo(dir)) { G.drag = { dir, blocked: true }; return; }
      hideSelBar();
      if (effectiveFx() === 'none') { G.drag = { dir, none: true }; return; }
      const f = effectiveFx() === 'flip' ? beginFlip(dir) : beginSlide(dir);
      f.drag = true; R.anim = f;
      G.drag = { dir, f, x: d.x };
      try { st.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    if (G.drag && G.drag.f) G.drag.f.setT(dragProgress(G.drag, e.clientX));
  });
  const up = async (e) => {
    G.pts.delete(e.pointerId);
    if (G.pts.size < 2) G.pinch = null;
    const d = G.down;
    if (!d || d.id !== e.pointerId) return;
    G.down = null;
    clearTimeout(d.lp);
    const g = G.drag; G.drag = null;
    if (g) {
      if (g.blocked) { nudge(g.dir); return; }
      if (g.none) { if (e.type === 'pointerup') { Sound.play(); setView(R.view + g.dir); } return; }
      const f = g.f;
      const hist = d.hist;
      const a = hist[0], b = hist[hist.length - 1];
      const v = (b.x - a.x) / Math.max(1, b.t - a.t);
      const fling = g.dir > 0 ? v < -0.35 : v > 0.35;
      const back = g.dir > 0 ? v > 0.3 : v < -0.3;
      const complete = e.type === 'pointerup' && !back && (f.t > 0.3 || fling);
      if (complete) {
        Sound.play();
        await f.run(1, Math.max(120, (1 - f.t) * FLIP_MS * 0.75));
        f.commit(); R.anim = null; setView(f.to, { placed: true });
      } else {
        await f.run(0, Math.max(100, f.t * FLIP_MS * 0.6));
        f.cancel(); R.anim = null;
      }
      return;
    }
    if (e.type !== 'pointerup' || d.moved || d.selectOnly || performance.now() - d.t > 450) return;
    handleTap(e, d);
  };
  st.addEventListener('pointerup', up);
  st.addEventListener('pointercancel', up);
  st.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hoverHint(null); });
  st.addEventListener('wheel', (e) => {
    if (!R.open) return;
    if ((e.ctrlKey || e.metaKey) && R.src.kind === 'pdf') { e.preventDefault(); if (e.deltaY < 0) openZoomAt(e.clientX, e.clientY, 2); return; }
    if (e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const now = performance.now();
    G.wheel += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (now < G.wheelLock) { G.wheel = 0; return; }
    if (Math.abs(G.wheel) > 55) { turn(G.wheel > 0 ? 1 : -1); G.wheel = 0; G.wheelLock = now + 420; }
  }, { passive: false });
  st.addEventListener('dblclick', (e) => {
    if (R.src && R.src.kind === 'pdf' && !e.target.closest('a')) { e.preventDefault(); openZoomAt(e.clientX, e.clientY, 2.2); }
  });
  st.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (a && R.src && R.src.kind === 'flow') { e.preventDefault(); const p = R.src.pageOfId(a.getAttribute('href').slice(1)); if (p != null) goToPage(p, { animate: true, flash: true }); }
    const m = e.target.closest('mark.hl, .hl-layer i[data-ann]');
    if (m && !G.drag) { e.preventDefault(); openAnnPopover(m.dataset.ann, e.clientX, e.clientY); }
  });
}
let hintEl = null;
function hoverHint(x) {
  if (hintEl) { hintEl.classList.remove('hot'); hintEl = null; }
  if (x == null || !R.open) return;
  const z = edgeZone(x);
  if (!z || !canGo(z)) return;
  const slot = R.mode === 'spread' ? (z < 0 ? R.els.slotL : R.els.slotR) : R.els.slotR;
  const p = slot.firstElementChild;
  if (p && (R.mode === 'spread' || z > 0)) { p.classList.add('hot'); hintEl = p; }
  R.els.stage.style.cursor = z ? 'pointer' : '';
}
function handleTap(e, d) {
  if (d.interactive) return;
  if (hasStageSelection()) { getSelection().removeAllRanges(); hideSelBar(); return; }
  if (Panel.kind && narrow()) { closePanel(); return; }
  if (d.type === 'mouse') { if (d.edge && R.set.tapZones !== false) turn(d.edge); return; }
  const r = R.els.stage.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width;
  if (R.set.tapZones && x < 0.28) { turn(-1); return; }
  if (R.set.tapZones && x > 0.72) { turn(1); return; }
  const now = performance.now();
  if (R.src.kind === 'pdf' && now - G.lastTap < 320) { clearTimeout(G.tapTimer); G.lastTap = 0; openZoomAt(e.clientX, e.clientY, 2.2); return; }
  G.lastTap = now;
  clearTimeout(G.tapTimer);
  G.tapTimer = setTimeout(toggleChrome, R.src.kind === 'pdf' ? 300 : 0);
}

function onReaderKey(e) {
  if (!R.open || $('#zoom').hidden === false) return;
  if (Modal.top() || openMenuEl) return;
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;
  const k = e.key;
  if (k === 'Escape') {
    if (!$('#selBar').hidden) { hideSelBar(); getSelection().removeAllRanges(); return; }
    if (Panel.kind) { closePanel(); return; }
    if (document.fullscreenElement) return;
    closeReader(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) {
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'f') { e.preventDefault(); openSearchPanel(); }
    return;
  }
  const map = {
    ArrowRight: () => turn(1), ArrowDown: () => turn(1), PageDown: () => turn(1), ' ': () => turn(e.shiftKey ? -1 : 1),
    ArrowLeft: () => turn(-1), ArrowUp: () => turn(-1), PageUp: () => turn(-1),
    Home: () => goToPage(0), End: () => goToPage(R.N - 1),
    b: toggleBookmark, t: () => openNavPanel('toc'), n: () => openNavPanel('notes'), '/': openSearchPanel,
    f: toggleFullscreen, m: () => setChrome(!R.chromeHidden), s: () => TTS.toggle(),
    z: () => { if (R.src.kind === 'pdf') openZoomPage(firstPageOfView(R.view), 2); },
    '+': () => stepFont(1), '=': () => stepFont(1), '-': () => stepFont(-1), '?': showKeyHelp, g: openGoToPage,
  };
  const fn = map[k] || map[k.toLowerCase && k.toLowerCase()];
  if (fn) { e.preventDefault(); fn(); Reading.touch(); }
}
function stepFont(d) {
  if (!R.src) return;
  if (R.src.kind === 'pdf') { openZoomPage(firstPageOfView(R.view), d > 0 ? 2 : 1); return; }
  R.set.size = clamp(Math.round((effectiveFontSize() + d) * 2) / 2, 12, 30);
  applyReaderSettings(); relayout(); saveSettingsSoon();
  toast('Ukuran huruf ' + R.set.size + ' px', { ms: 1200 });
}
async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (e) { toast('Layar penuh tidak tersedia di tampilan ini.'); }
}

// ----- page sound & wake lock -----
const Sound = {
  ctx: null,
  play() {
    if (!R.set.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = this.ctx || new AC();
      const c = this.ctx, dur = 0.26;
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) { const t = i / d.length; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2) * Math.min(1, t * 14) * (0.6 + 0.4 * Math.sin(t * 40)); }
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
      const g = c.createGain(); g.gain.value = 0.16;
      src.connect(bp); bp.connect(g); g.connect(c.destination); src.start();
    } catch (e) { /* audio optional */ }
  },
};
const Wake = {
  lock: null,
  async on() {
    if (!R.open || !R.set.wake || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } catch (e) { this.lock = null; }
  },
  off() { try { this.lock && this.lock.release(); } catch (e) { /* ignore */ } this.lock = null; },
};

// ----- reading time & progress -----
const Reading = {
  acc: 0, pages: 0, last: 0, lastAct: 0, timer: 0,
  start() { this.acc = 0; this.pages = 0; this.last = performance.now(); this.lastAct = performance.now(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 15000); },
  tick() {
    const now = performance.now();
    if (document.visibilityState === 'visible' && now - this.lastAct < 180000) this.acc += (now - this.last) / 1000;
    this.last = now;
  },
  touch(turned) { this.tick(); this.lastAct = performance.now(); if (turned) { this.pages++; if (this.acc >= 30 || this.pages >= 8) this.flush(); } },
  stop() { this.tick(); this.flush(); clearInterval(this.timer); },
  flush() {
    this.tick();
    const secs = Math.round(this.acc), pages = this.pages;
    if (R.temp || !R.bookId || (secs < 3 && !pages)) return;
    this.acc -= secs; this.pages = 0;
    Store && Store.addStats(R.bookId, secs, pages).catch(() => {});
  },
};
function aggregateStats(stats) {
  const out = { days: {}, pages: {}, books: {} };
  const devs = (stats && stats.devs) || {};
  for (const d of Object.values(devs)) {
    for (const [k, v] of Object.entries(d.days || {})) out.days[k] = (out.days[k] || 0) + (+v || 0);
    for (const [k, v] of Object.entries(d.pages || {})) out.pages[k] = (out.pages[k] || 0) + (+v || 0);
    for (const [k, v] of Object.entries(d.books || {})) out.books[k] = (out.books[k] || 0) + (+v || 0);
  }
  return out;
}
function saveProgress() {
  if (!R.open || R.temp || !R.bookId || !R.N) return;
  const i = firstPageOfView(R.view), last = lastPageOfView(R.view);
  const prev = R.progress || S.progress.get(R.bookId) || {};
  const today = dayKey();
  const days = { ...(prev.days || {}) };
  const d = days[today] ? [...days[today]] : [i + 1, last + 1];
  d[0] = Math.min(d[0], i + 1); d[1] = Math.max(d[1], last + 1);
  days[today] = d;
  const keys = Object.keys(days).sort();
  while (keys.length > 60) delete days[keys.shift()];
  const pct = R.src.pctOf(last);
  const data = {
    bookId: R.bookId, kind: R.src.kind, page: i, pages: R.N, pct: Math.round(pct * 1000) / 1000,
    anchor: R.src.anchorOf(i), lastOpenedAt: R.openedAt, updatedAt: Date.now(), dev: DEVICE_ID,
    status: prev.status === 'done' || R.finished ? 'done' : 'reading', fav: !!prev.fav, days,
  };
  if (prev.doneAt || data.status === 'done') data.doneAt = prev.doneAt || Date.now();
  R.progress = data;
  S.progress.set(R.bookId, data);
  Store.putProgress(R.bookId, data).catch((e) => { if (!R._warnedSave) { R._warnedSave = true; toast(dbErrorText(e)); } });
}
const saveProgressSoon = debounce(saveProgress, 800);
function maybeFinish() {
  const prev = R.progress || S.progress.get(R.bookId) || {};
  R.finished = true;
  if (prev.status === 'done' || R._finishedToast) return;
  R._finishedToast = true;
  setTimeout(() => toast('Anda sampai di halaman terakhir. Buku ditandai selesai.', { ms: 4200 }), 500);
}
function onRemoteProgress(p) {
  if (!R.open || R.temp || !p || p.dev === DEVICE_ID) return;
  if (R.progress && p.updatedAt <= R.progress.updatedAt) return;
  const page = R.src.pageOfAnchor && p.anchor ? R.src.pageOfAnchor(p.anchor) : p.page;
  if (page == null || viewOfPage(page) === R.view) return;
  R.progress = p;
  toast(`Dibaca di perangkat lain sampai hal. ${page + 1}.`, { action: 'Lompat', onAction: () => goToPage(page) });
}

// ----- open / close -----
async function openReader(opts) {
  // opts: { book, bookId } or { temp: true, file, kind }
  if (R.open) await closeReader(true);
  hideSelBar();
  closePanel();
  R.set = readerSettings();
  R.open = true; R.temp = !!opts.temp; R.bookId = opts.bookId || null; R.book = opts.book || null;
  R.N = 0; R.view = 0; R.layoutKey = ''; R.pages.clear(); R.ann = []; R.search = ''; R.dwell = []; R.pageEnteredAt = 0;
  R.readAnchor = null;
  R.progress = R.bookId ? S.progress.get(R.bookId) || null : null; R._finishedToast = false; R._warnedSave = false; R.finished = false; R.prevView = -1; R.curView = -1;
  R.openedAt = Date.now();
  const e = R.els;
  e.reader.hidden = false;
  document.body.classList.add('reading');
  R.docked = !isTouchUI() && innerWidth >= 700;
  e.reader.classList.toggle('docked', R.docked);
  setChrome(false);
  e.title.textContent = (R.book && R.book.title) || (opts.file && baseName(opts.file.name)) || 'Buku';
  e.sub.textContent = '';
  e.pos.textContent = '—'; e.eta.textContent = '';
  e.slotL.replaceChildren(); e.slotR.replaceChildren();
  setLoading(true, 'Membuka buku…', null);
  applyReaderSettings();
  try {
    if (!R.temp && !S.userLoaded) {
      for (let k = 0; k < 40 && !S.userLoaded; k++) await sleep(75);
      R.progress = S.progress.get(R.bookId) || null;
      R.set = readerSettings();
      applyReaderSettings();
    }
    let src;
    const kind = R.temp ? opts.kind : R.book.kind;
    if (kind === 'pdf') {
      const blob = R.temp ? opts.file : await Files.get(R.book.file, (p) => setLoading(true, 'Mengunduh buku…', p));
      setLoading(true, 'Menyiapkan halaman…', null);
      src = await PdfSource.open(blob);
    } else {
      let content;
      if (R.temp) content = opts.content;
      else {
        const blob = await Files.get(R.book.content, (p) => setLoading(true, 'Mengunduh buku…', p));
        content = JSON.parse(await blob.text());
      }
      setLoading(true, 'Menyusun halaman…', null);
      src = new FlowSource(content, R.book || { title: e.title.textContent });
      if (!R.temp && R.book.content) src.cacheId = R.bookId + ':' + (R.book.content.id || (R.book.content.parts || []).join('+')) + ':' + (R.book.updatedAt || 0);
      await src.init();
    }
    if (!R.open) { src.destroy && src.destroy(); return; }
    R.src = src;
    applyReaderSettings();
    await nextFrame();
    await relayout(true);
    // restore position
    const p = R.progress;
    if (p && !opts.page) {
      let page = p.anchor && R.src.pageOfAnchor ? R.src.pageOfAnchor(p.anchor) : p.page;
      if (page == null || !(page >= 0)) page = 0;
      if (page >= R.N) page = R.N - 1;
      setView(viewOfPage(page));
    } else if (opts.page != null) setView(viewOfPage(opts.page));
    setLoading(false);
    R.pageEnteredAt = performance.now();
    if (!R.temp) {
      R.annUnsub = Store.watchAnn(R.bookId, (list) => { R.ann = list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); refreshDecor(); if (Panel.kind === 'nav') Panel.render(); });
      saveProgress();
    }
    Reading.start();
    Wake.on();
    if (R.temp) showTempNote(opts);
    else $('#tempNote').hidden = true;
    if (isTouchUI()) setTimeout(() => { if (R.open && !Panel.kind) setChrome(true); }, 2200);
    R.els.stage.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    setLoading(false);
    const msg = err && err.code === 'missing' ? 'File buku ini sudah tidak ada di penyimpanan.' : (err && err.message) || 'Buku tidak bisa dibuka.';
    toast(msg, { ms: 6000 });
    closeReader(true);
  }
}
function showTempNote(opts) {
  const n = $('#tempNote');
  n.replaceChildren(h('span', { text: 'Dibuka sementara — tidak tersimpan di rak.' }));
  n.append(h('button', { class: 'btn small primary', type: 'button', text: 'Simpan ke rak', onclick: () => { n.hidden = true; startUpload([opts.file]); } }));
  n.hidden = false;
}
async function closeReader(silent) {
  if (!R.open) return;
  if (!R.temp) { saveProgressSoon.cancel(); saveProgress(); }
  Reading.stop();
  TTS.stop();
  Wake.off();
  cancelAnim();
  closePanel();
  hideSelBar();
  if (R.annUnsub) { R.annUnsub(); R.annUnsub = null; }
  for (const el of R.pages.values()) R.src && R.src.release && R.src.release(el);
  R.pages.clear();
  if (R.src && R.src.destroy) R.src.destroy();
  R.src = null; R.open = false; R.N = 0;
  R.els.slotL.replaceChildren(); R.els.slotR.replaceChildren();
  R.els.reader.hidden = true;
  $('#tempNote').hidden = true;
  $('#zoom').hidden = true;
  document.body.classList.remove('reading');
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!silent) Lib.render();
}
