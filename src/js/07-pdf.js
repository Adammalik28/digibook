// ---------- PDF documents: rendering, text layer, links, zoom ----------
class PdfSource {
  static async open(blob) {
    const lib = await need('pdfjs');
    const data = new Uint8Array(await blob.arrayBuffer());
    let pdf;
    try { pdf = await lib.getDocument({ data, ...PDF_OPTS }).promise; } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('PDF ini dikunci kata sandi dan belum bisa dibuka di sini.');
      throw new Error('PDF tidak bisa dibaca. File mungkin rusak.');
    }
    const s = new PdfSource(lib, pdf);
    await s.init();
    return s;
  }
  constructor(lib, pdf) {
    this.kind = 'pdf'; this.lib = lib; this.pdf = pdf; this.N = pdf.numPages;
    this.pageP = new Map(); this.textP = new Map(); this.queue = []; this.running = 0; this.focus = 0;
    this._toc = null; this._chap = null; this.destroyed = false;
  }
  async init() {
    const p = await this.page(0);
    const vp = p.getViewport({ scale: 1 });
    this.aspect = vp.width / vp.height;
    this.labels = await this.pdf.getPageLabels().catch(() => null);
    this.toc().then(() => { if (R.src === this && R.open) updateChromeText(); }).catch(() => {});
  }
  page(i) {
    if (!this.pageP.has(i)) this.pageP.set(i, this.pdf.getPage(i + 1));
    return this.pageP.get(i);
  }
  labelOf(i) { const l = this.labels && this.labels[i]; return l && l !== String(i + 1) ? `${i + 1} (${l})` : String(i + 1); }
  fill(el, i) {
    el.classList.add('pdf');
    el.append(h('div', { class: 'page-ph' }, h('div', { class: 'spin' })));
    el._pdf = { i, done: false, ver: R.layoutVer };
    this.enqueue(el, i);
  }
  enqueue(el, i) { this.queue.push({ el, i }); queueMicrotask(() => this.pump()); }
  prioritize(i) { this.focus = i; }
  pump() {
    while (this.running < 2 && this.queue.length && !this.destroyed) {
      this.queue.sort((a, b) => Math.abs(a.i - this.focus) - Math.abs(b.i - this.focus));
      const job = this.queue.shift();
      if (!R.pages.has(job.i) || R.pages.get(job.i) !== job.el) continue;
      this.running++;
      this.render(job.el, job.i).catch((e) => { if (!(e && e.name === 'RenderingCancelledException')) console.warn('render', e); })
        .finally(() => { this.running--; this.pump(); });
    }
  }
  async render(el, i) {
    const page = await this.page(i);
    if (this.destroyed || el._pdf.ver !== R.layoutVer) return;
    const vp1 = page.getViewport({ scale: 1 });
    const pw = R.pw, ph = R.ph;
    const scale = Math.min(pw / vp1.width, ph / vp1.height);
    const cssW = vp1.width * scale, cssH = vp1.height * scale;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    let rs = dpr;
    const maxPx = 4.5e6;
    if (cssW * cssH * rs * rs > maxPx) rs = Math.sqrt(maxPx / (cssW * cssH));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(cssW * rs); canvas.height = Math.round(cssH * rs);
    const viewport = page.getViewport({ scale });
    const ctx = canvas.getContext('2d', { alpha: false });
    const task = page.render({ canvasContext: ctx, viewport, transform: rs !== 1 ? [rs, 0, 0, rs, 0, 0] : null, background: 'rgb(255,255,255)' });
    el._task = task;
    await task.promise;
    el._task = null;
    if (this.destroyed || el._pdf.ver !== R.layoutVer || !R.pages.has(i)) { canvas.width = canvas.height = 0; return; }
    const box = h('div', { class: 'pdfbox pdf-page-vars', style: { left: ((pw - cssW) / 2).toFixed(1) + 'px', top: ((ph - cssH) / 2).toFixed(1) + 'px', width: cssW.toFixed(1) + 'px', height: cssH.toFixed(1) + 'px' } });
    box.style.setProperty('--scale-factor', String(scale));
    const tl = h('div', { class: 'textLayer' });
    const hl = h('div', { class: 'hl-layer' });
    const links = h('div', { class: 'link-layer' });
    box.append(canvas, hl, tl, links);
    const ph0 = el.querySelector('.page-ph');
    if (ph0) ph0.remove();
    el.prepend(box);
    el._pdf.done = true;
    el._pdf.canvas = canvas;
    // text layer & links (non-blocking for the picture)
    try {
      const tc = await this.textContent(i);
      if (!this.destroyed && tl.isConnected !== undefined) {
        const layer = new this.lib.TextLayer({ textContentSource: tc, container: tl, viewport });
        await layer.render();
        tl.append(h('div', { class: 'endOfContent' }));
      }
    } catch (e) { /* text layer optional */ }
    try {
      const annots = await page.getAnnotations({ intent: 'display' });
      for (const a of annots) {
        if (a.subtype !== 'Link' || !a.rect) continue;
        const r = viewport.convertToViewportRectangle(a.rect);
        const left = Math.min(r[0], r[2]), top = Math.min(r[1], r[3]);
        const st = { left: left + 'px', top: top + 'px', width: Math.abs(r[2] - r[0]) + 'px', height: Math.abs(r[3] - r[1]) + 'px' };
        if (a.url && /^(https?:|mailto:)/i.test(a.url)) links.append(h('a', { href: a.url, target: '_blank', rel: 'noopener', style: st, title: a.url }));
        else if (a.dest) {
          const link = h('a', { href: '#', style: st, title: 'Buka tautan di dokumen' });
          link.addEventListener('click', async (ev) => { ev.preventDefault(); ev.stopPropagation(); const p = await this.destPage(a.dest).catch(() => null); if (p != null) goToPage(p, { animate: true, flash: true }); });
          links.append(link);
        }
      }
    } catch (e) { /* links optional */ }
    decoratePage(el, i);
    if (el.isConnected) this.onShow(el, i);
  }
  textContent(i) {
    if (!this.textP.has(i)) this.textP.set(i, this.page(i).then((p) => p.getTextContent()));
    return this.textP.get(i);
  }
  async textOf(i) {
    const tc = await this.textContent(i);
    let s = '';
    for (const it of tc.items) { if (it.str != null) s += it.str + (it.hasEOL ? '\n' : ''); }
    return s.replace(/[ \t]+\n/g, '\n');
  }
  release(el) {
    if (el._task) { try { el._task.cancel(); } catch (e) { /* ignore */ } }
    const c = el._pdf && el._pdf.canvas;
    if (c) { c.width = 0; c.height = 0; }
  }
  onShow(el, i) {
    // search hits need a laid-out text layer
    const box = el.querySelector('.pdfbox');
    if (!box) return;
    const hl = box.querySelector('.hl-layer');
    hl.querySelectorAll('i.hit').forEach((x) => x.remove());
    if (!R.search) return;
    const tl = box.querySelector('.textLayer');
    if (!tl) return;
    const spans = [...tl.querySelectorAll('span')].filter((s) => s.firstChild && s.firstChild.nodeType === 3);
    if (!spans.length) return;
    let full = '';
    const map = [];
    for (const s of spans) { map.push({ node: s.firstChild, start: full.length }); full += s.firstChild.data; }
    const re = new RegExp(R.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const br = box.getBoundingClientRect();
    if (!br.width) return;
    const locate = (k) => { let lo = 0, hi = map.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (map[mid].start <= k) lo = mid; else hi = mid - 1; } return { node: map[lo].node, off: Math.min(map[lo].node.length, k - map[lo].start) }; };
    let m, count = 0;
    while ((m = re.exec(full)) && count < 80) {
      count++;
      if (!m[0].length) { re.lastIndex++; continue; }
      const a = locate(m.index), b = locate(m.index + m[0].length);
      const rg = document.createRange();
      try { rg.setStart(a.node, a.off); rg.setEnd(b.node, b.off); } catch (e) { continue; }
      for (const r of rg.getClientRects()) {
        if (r.width < 1) continue;
        hl.append(h('i', { class: 'hit', style: { left: ((r.left - br.left) / br.width * 100) + '%', top: ((r.top - br.top) / br.height * 100) + '%', width: (r.width / br.width * 100) + '%', height: (r.height / br.height * 100) + '%' } }));
      }
    }
  }
  decorate(el, i, anns) {
    const box = el.querySelector('.pdfbox');
    if (!box) return;
    const hl = box.querySelector('.hl-layer');
    hl.querySelectorAll('i:not(.hit)').forEach((x) => x.remove());
    for (const a of anns) {
      if (a.type !== 'highlight' || a.page !== i || !a.rects) continue;
      a.rects.forEach((r, k) => {
        hl.append(h('i', { class: (a.color || 'y') + (a.note && k === a.rects.length - 1 ? ' note-dot' : ''), 'data-ann': a.id, title: a.note || '', style: { left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: r[2] * 100 + '%', height: r[3] * 100 + '%' } }));
      });
    }
  }
  rectsFromRange(range, box) {
    const br = box.getBoundingClientRect();
    let rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 1 && r.right > br.left && r.left < br.right && r.bottom > br.top && r.top < br.bottom);
    if (!rects.length) return [];
    const hs = rects.map((r) => r.height).sort((a, b) => a - b);
    const med = hs[Math.floor(hs.length / 2)];
    rects = rects.filter((r) => r.height < med * 2.6);
    // merge pieces on the same line
    const lines = [];
    for (const r of rects.sort((a, b) => a.top - b.top || a.left - b.left)) {
      const L = lines.find((l) => Math.abs(l.top - r.top) < med * 0.5 && r.left <= l.right + med * 0.8);
      if (L) { L.left = Math.min(L.left, r.left); L.right = Math.max(L.right, r.right); L.top = Math.min(L.top, r.top); L.bottom = Math.max(L.bottom, r.bottom); }
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return lines.map((l) => [(l.left - br.left) / br.width, (l.top - br.top) / br.height, (l.right - l.left) / br.width, (l.bottom - l.top) / br.height].map((v) => Math.round(v * 10000) / 10000));
  }
  async destPage(dest) {
    if (!dest) return null;
    let d = dest;
    if (typeof d === 'string') d = await this.pdf.getDestination(d);
    if (!Array.isArray(d) || !d.length) return null;
    const ref = d[0];
    if (typeof ref === 'number') return ref;
    if (ref && typeof ref === 'object') return this.pdf.getPageIndex(ref);
    return null;
  }
  async toc() {
    if (this._toc) return this._toc;
    const ol = await this.pdf.getOutline().catch(() => null);
    const out = [];
    const walk = async (items, level) => {
      for (const it of items || []) {
        const page = await this.destPage(it.dest).catch(() => null);
        out.push({ title: (it.title || '').trim() || '(tanpa judul)', level, page });
        if (it.items && it.items.length && level < 4) await walk(it.items, level + 1);
      }
    };
    await walk(ol, 1);
    this._toc = out;
    this._chap = out.filter((x) => x.page != null && x.level <= 2).sort((a, b) => a.page - b.page);
    return out;
  }
  chapterOf(i) {
    if (!this._chap || !this._chap.length) return '';
    let t = '';
    for (const c of this._chap) { if (c.page <= i) t = c.title; else break; }
    return t;
  }
  nextChapterPage(i) {
    if (!this._chap) return null;
    for (const c of this._chap) if (c.page > i && c.level === 1) return c.page;
    return null;
  }
  anchorOf(i) { return { p: i }; }
  pageOfAnchor(a) { return a && a.p != null ? a.p : null; }
  pctOf(i) { return this.N <= 1 ? 1 : clamp((i + 1) / this.N, 0, 1); }
  async renderThumb(i, canvas, cssW) {
    const page = await this.page(i);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = (cssW * Math.min(2, window.devicePixelRatio || 1)) / vp1.width;
    const vp = page.getViewport({ scale });
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp, background: 'rgb(255,255,255)' }).promise;
  }
  destroy() {
    this.destroyed = true;
    this.queue = [];
    try { this.pdf.loadingTask.destroy(); } catch (e) { /* ignore */ }
  }
}

// ----- zoom view (PDF) -----
const Z = { i: 0, scale: 1, x: 0, y: 0, bw: 0, bh: 0, rendered: 0, pts: new Map(), pinch: null, pan: null, lastTap: 0, task: null, inertia: 0 };
function openZoomAt(cx, cy, scale) {
  if (!R.open || !R.src || R.src.kind !== 'pdf') return;
  const el = document.elementFromPoint(cx, cy);
  const pg = el && el.closest('.page[data-i]');
  let i = pg ? +pg.dataset.i : firstPageOfView(R.view);
  let rel = null;
  const box = pg && pg.querySelector('.pdfbox');
  if (box) { const r = box.getBoundingClientRect(); rel = { x: clamp((cx - r.left) / r.width, 0, 1), y: clamp((cy - r.top) / r.height, 0, 1) }; }
  openZoomPage(i, scale, rel);
}
async function openZoomPage(i, scale = 2, rel) {
  if (!R.src || R.src.kind !== 'pdf') return;
  const zv = $('#zView'), zc = $('#zContent');
  $('#zoom').hidden = false;
  hideSelBar();
  Z.i = i;
  const page = await R.src.page(i);
  const vp1 = page.getViewport({ scale: 1 });
  const vw = zv.clientWidth, vh = zv.clientHeight;
  const a = vp1.width / vp1.height;
  Z.bw = Math.min(vw - 16, (vh - 16) * a); Z.bh = Z.bw / a;
  if (vw < 600) { Z.bw = vw; Z.bh = vw / a; }
  zc.style.width = Z.bw + 'px'; zc.style.height = Z.bh + 'px';
  Z.scale = clamp(scale, 1, 6);
  const fx = rel ? rel.x : 0.5, fy = rel ? rel.y : 0.3;
  Z.x = vw / 2 - fx * Z.bw * Z.scale;
  Z.y = vh / 2 - fy * Z.bh * Z.scale;
  zClamp(); zApply();
  $('#zTitle').textContent = `Hal. ${i + 1} dari ${R.N}`;
  Z.rendered = 0;
  zc.replaceChildren();
  await zRender(true);
}
function zClose() {
  $('#zoom').hidden = true;
  if (Z.task) { try { Z.task.cancel(); } catch (e) { /* ignore */ } }
  const c = $('#zContent canvas'); if (c) { c.width = 0; c.height = 0; }
  $('#zContent').replaceChildren();
  if (R.open && viewOfPage(Z.i) !== R.view) goToPage(Z.i);
  R.els.stage.focus({ preventScroll: true });
}
function zApply() {
  $('#zContent').style.transform = `translate(${Z.x.toFixed(1)}px, ${Z.y.toFixed(1)}px) scale(${Z.scale.toFixed(4)})`;
  $('#zLvl').textContent = Math.round(Z.scale * 100) + '%';
}
function zClamp() {
  const zv = $('#zView');
  const vw = zv.clientWidth, vh = zv.clientHeight;
  const w = Z.bw * Z.scale, hh = Z.bh * Z.scale;
  Z.x = w <= vw ? (vw - w) / 2 : clamp(Z.x, vw - w, 0);
  Z.y = hh <= vh ? (vh - hh) / 2 : clamp(Z.y, vh - hh, 0);
}
const zRenderSoon = debounce(() => zRender(false), 220);
async function zRender(first) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  let target = Z.scale * dpr;
  const maxPx = 12e6;
  if (Z.bw * Z.bh * target * target > maxPx) target = Math.sqrt(maxPx / (Z.bw * Z.bh));
  if (!first && target <= Z.rendered * 1.12 && target >= Z.rendered * 0.5) return;
  const page = await R.src.page(Z.i);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: (Z.bw * target) / vp1.width });
  const c = document.createElement('canvas');
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  if (Z.task) { try { Z.task.cancel(); } catch (e) { /* ignore */ } }
  const myI = Z.i;
  Z.task = page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp, background: 'rgb(255,255,255)' });
  try { await Z.task.promise; } catch (e) { return; }
  Z.task = null;
  if ($('#zoom').hidden || myI !== Z.i) { c.width = c.height = 0; return; }
  const old = $('#zContent canvas');
  if (old) { old.width = 0; old.height = 0; }
  $('#zContent').replaceChildren(c);
  Z.rendered = target;
}
function zZoomAt(cx, cy, ns) {
  const zv = $('#zView').getBoundingClientRect();
  const px = cx - zv.left, py = cy - zv.top;
  ns = clamp(ns, 1, 6);
  const k = ns / Z.scale;
  Z.x = px - (px - Z.x) * k; Z.y = py - (py - Z.y) * k;
  Z.scale = ns;
  zClamp(); zApply(); zRenderSoon();
}
function zGo(d) {
  const n = clamp(Z.i + d, 0, R.N - 1);
  if (n === Z.i) return;
  openZoomPage(n, Z.scale, { x: 0.5, y: 0 });
}
function bindZoom() {
  const zv = $('#zView');
  $('#zClose').onclick = zClose;
  $('#zIn').onclick = () => { const r = zv.getBoundingClientRect(); zZoomAt(r.left + r.width / 2, r.top + r.height / 2, Z.scale * 1.4); };
  $('#zOut').onclick = () => { const r = zv.getBoundingClientRect(); zZoomAt(r.left + r.width / 2, r.top + r.height / 2, Z.scale / 1.4); };
  $('#zPrev').onclick = () => zGo(-1);
  $('#zNext').onclick = () => zGo(1);
  zv.addEventListener('pointerdown', (e) => {
    cancelAnimationFrame(Z.inertia);
    Z.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { zv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    if (Z.pts.size === 2) {
      const [a, b] = [...Z.pts.values()];
      Z.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y), s0: Z.scale };
      Z.pan = null;
    } else if (Z.pts.size === 1) {
      Z.pan = { x: e.clientX, y: e.clientY, x0: Z.x, y0: Z.y, t: performance.now(), hist: [{ x: e.clientX, y: e.clientY, t: performance.now() }], moved: false };
      zv.classList.add('dragging');
    }
  });
  zv.addEventListener('pointermove', (e) => {
    if (!Z.pts.has(e.pointerId)) return;
    Z.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (Z.pinch && Z.pts.size === 2) {
      const [a, b] = [...Z.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zZoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, Z.pinch.s0 * d / Z.pinch.d0);
      return;
    }
    if (Z.pan) {
      const dx = e.clientX - Z.pan.x, dy = e.clientY - Z.pan.y;
      if (Math.hypot(dx, dy) > 6) Z.pan.moved = true;
      Z.x = Z.pan.x0 + dx; Z.y = Z.pan.y0 + dy;
      zClamp(); zApply();
      Z.pan.hist.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (Z.pan.hist.length > 5) Z.pan.hist.shift();
    }
  });
  const up = (e) => {
    Z.pts.delete(e.pointerId);
    if (Z.pts.size < 2) Z.pinch = null;
    zv.classList.remove('dragging');
    const p = Z.pan; Z.pan = null;
    if (!p) return;
    if (!p.moved && e.type === 'pointerup') {
      const now = performance.now();
      if (now - Z.lastTap < 320) { Z.lastTap = 0; zZoomAt(e.clientX, e.clientY, Z.scale > 1.5 ? 1 : 2.5); }
      else Z.lastTap = now;
      return;
    }
    const a = p.hist[0], b = p.hist[p.hist.length - 1];
    const dt = Math.max(1, b.t - a.t);
    let vx = (b.x - a.x) / dt * 16, vy = (b.y - a.y) / dt * 16;
    const step = () => {
      vx *= 0.92; vy *= 0.92;
      if (Math.abs(vx) < 0.3 && Math.abs(vy) < 0.3) return;
      Z.x += vx; Z.y += vy; zClamp(); zApply();
      Z.inertia = requestAnimationFrame(step);
    };
    if (performance.now() - b.t < 80) Z.inertia = requestAnimationFrame(step);
  };
  zv.addEventListener('pointerup', up);
  zv.addEventListener('pointercancel', up);
  zv.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) { zZoomAt(e.clientX, e.clientY, Z.scale * Math.exp(-e.deltaY * 0.01)); return; }
    Z.x -= e.deltaX; Z.y -= e.deltaY; zClamp(); zApply();
  }, { passive: false });
  document.addEventListener('keydown', (e) => {
    if ($('#zoom').hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); zClose(); }
    else if (e.key === '+' || e.key === '=') $('#zIn').click();
    else if (e.key === '-') $('#zOut').click();
    else if (e.key === 'ArrowRight' && Z.scale <= 1.01) zGo(1);
    else if (e.key === 'ArrowLeft' && Z.scale <= 1.01) zGo(-1);
    else if (e.key.startsWith('Arrow')) { const d = 60; Z.x += e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0; Z.y += e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0; zClamp(); zApply(); }
  });
  addEventListener('resize', debounce(() => { if (!$('#zoom').hidden) openZoomPage(Z.i, Z.scale); }, 250));
}
