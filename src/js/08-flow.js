// ---------- reflowable documents (Word, Markdown, text): pagination & anchors ----------
const BLOCK_TAGS = /^(P|H[1-6]|UL|OL|DIV|PRE|BLOCKQUOTE|TABLE|HR|SECTION|FIGURE|DL|ASIDE|HEADER|FOOTER|ARTICLE|NAV|DETAILS|ADDRESS)$/;
const UNWRAP_TAGS = /^(SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|DETAILS)$/;

function plainLen(el) {
  let n = 0;
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement && t.parentElement.closest('[data-rep]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  while (w.nextNode()) n += w.currentNode.length;
  return n;
}
function textNodesOf(el) {
  const out = [];
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement && t.parentElement.closest('[data-rep]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  while (w.nextNode()) out.push(w.currentNode);
  return out;
}
// wrap [from, to) (character offsets within el's plain text) in elements made by mk()
function wrapRange(el, from, to, mk) {
  let pos = 0;
  for (const t of textNodesOf(el)) {
    const s = pos, e = pos + t.length;
    pos = e;
    if (e <= from || s >= to) continue;
    let node = t;
    const a = Math.max(0, from - s), b = Math.min(t.length, to - s);
    if (b <= a) continue;
    if (a > 0) node = node.splitText(a);
    if (b - a < node.length) node.splitText(b - a);
    const m = mk();
    node.parentNode.insertBefore(m, node);
    m.append(node);
  }
}

const FLOW_CACHE = new Map();
class FlowSource {
  constructor(content, book) {
    this.kind = 'flow';
    this.content = content;
    this.book = book || {};
    this.urls = [];
    this.pages = [];
    this.N = 0;
  }
  async init() {
    let html = this.content.html || '';
    html = await sanitize(html, { ADD_ATTR: ['target', 'data-img'] });
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const imgs = this.content.images || {};
    this.imgUrl = new Map();
    for (const img of tpl.content.querySelectorAll('img')) {
      const key = img.getAttribute('data-img');
      if (key) {
        const v = imgs[key];
        let u = this.imgUrl.get(key);
        if (!u && typeof v === 'string' && v.startsWith('data:')) {
          try { u = URL.createObjectURL(dataUrlToBlob(v)); this.urls.push(u); } catch (e) { u = null; }
        } else if (!u && typeof v === 'string' && v.startsWith('/_blob/')) u = v;
        if (u) { this.imgUrl.set(key, u); img.src = u; }
        else img.replaceWith(h('span', { class: 'img-missing', text: '[Gambar tidak tersedia]' }));
      }
      img.loading = 'eager';
      img.decoding = 'async';
    }
    // normalise to a flat list of top-level blocks
    const blocks = [];
    let inline = null;
    const flush = () => { if (inline && (inline.textContent.trim() || inline.querySelector('img'))) blocks.push(inline); inline = null; };
    const visit = (nodes, extraClass) => {
      for (const n of [...nodes]) {
        if (n.nodeType === 3) { if (!n.textContent.trim()) continue; (inline ||= document.createElement('p')).append(n); continue; }
        if (n.nodeType !== 1) continue;
        if (!BLOCK_TAGS.test(n.tagName)) { (inline ||= document.createElement('p')).append(n); continue; }
        flush();
        const isWrapperDiv = n.tagName === 'DIV' && !/\b(tw|textbox|pb)\b/.test(n.className) && n.children.length;
        if ((UNWRAP_TAGS.test(n.tagName) || isWrapperDiv) && n.children.length) { visit(n.childNodes, n.classList.contains('footnotes') ? 'footnotes' : extraClass); continue; }
        if (n.tagName === 'TABLE') { const w = document.createElement('div'); w.className = 'tw'; w.append(n); blocks.push(w); continue; }
        if (extraClass) n.classList.add(extraClass);
        blocks.push(n);
      }
      flush();
    };
    visit(tpl.content.childNodes, '');
    if (!blocks.length) blocks.push(h('p', { text: '(Dokumen kosong)' }));
    blocks.forEach((b, i) => { b.dataset.b = String(i); });
    this.blocks = blocks;
    this.cum = [0];
    for (const b of blocks) this.cum.push(this.cum[this.cum.length - 1] + plainLen(b));
    this.total = Math.max(1, this.cum[this.cum.length - 1]);
    this.words = (blocks.map((b) => b.textContent).join(' ').match(/[\p{L}\p{N}]+/gu) || []).length;
    this.headings = [];
    this.idMap = new Map();
    blocks.forEach((b, i) => {
      if (/^H[1-6]$/.test(b.tagName)) { const t = b.textContent.replace(/\s+/g, ' ').trim(); if (t) this.headings.push({ b: i, level: +b.tagName[1], title: t }); }
      if (b.id) this.idMap.set(b.id, i);
      for (const x of b.querySelectorAll('[id]')) this.idMap.set(x.id, i);
    });
    const c1 = this.headings.filter((x) => x.level === 1).length, c2 = this.headings.filter((x) => x.level === 2).length;
    this.chapterLevel = c1 >= 2 ? 1 : c2 >= 2 ? 2 : 0;
    const chapters = this.headings.filter((x) => this.chapterLevel && x.level <= this.chapterLevel).length;
    this.breakChapters = chapters > 0 && this.total / chapters >= 1800;
    // preload pictures so measurements are right
    const pics = [];
    for (const b of blocks) for (const img of b.querySelectorAll('img')) pics.push(img);
    await Promise.race([Promise.all(pics.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()))), sleep(4000)]);
  }
  fcClass() { return 'flow-c' + (R.set.para === 'indent' ? ' indent' : ''); }
  async paginate(pw, ph, onProgress, cacheKey) {
    this._gen = (this._gen || 0) + 1;
    const gen = this._gen;
    const ck = cacheKey && this.cacheId ? this.cacheId + '|' + cacheKey + '|' + this.fcClass() : null;
    if (ck && FLOW_CACHE.has(ck)) {
      const c = FLOW_CACHE.get(ck);
      FLOW_CACHE.delete(ck); FLOW_CACHE.set(ck, c);
      this.pages = c.pages; this.N = c.pages.length; this._text = new Map();
      return;
    }
    const m = R.els.measure;
    m.className = 'page flow';
    m.dataset.side = 'r';
    m.style.width = pw + 'px'; m.style.height = ph + 'px';
    const pc = h('div', { class: 'pc' });
    const fc = h('div', { class: this.fcClass(), lang: 'id' });
    pc.append(fc);
    m.replaceChildren(h('div', { class: 'rh' }, h('span', { text: 'A' })), pc, h('div', { class: 'folio', text: '1' }));
    try { await Promise.race([document.fonts ? document.fonts.ready : Promise.resolve(), sleep(1500)]); } catch (e) { /* ignore */ }
    const limit = pc.clientHeight;
    const pages = [];
    let chapter = '';
    let cur = { nodes: [], chapter, chapterStart: false };
    const items = this.blocks.map((b) => ({ src: b }));
    const isH = (n) => /^H[1-6]$/.test(n.tagName);
    const fits = (n) => n.offsetTop + n.offsetHeight <= limit + 0.5;
    const commit = (allowCarry) => {
      let carry = null;
      if (allowCarry && cur.nodes.length > 1) {
        const last = cur.nodes[cur.nodes.length - 1];
        if (isH(last)) { carry = last; cur.nodes.pop(); }
      }
      if (cur.nodes.length) {
        const f = cur.nodes[0];
        cur.start = { b: +f.dataset.b, o: +(f.dataset.o || 0) };
        pages.push(cur);
      }
      fc.replaceChildren();
      cur = { nodes: [], chapter, chapterStart: false };
      return carry;
    };
    let qi = 0, t0 = performance.now();
    while (qi < items.length) {
      if (performance.now() - t0 > 14) {
        onProgress && onProgress(qi / items.length);
        await new Promise((r) => setTimeout(r, 0));
        if (gen !== this._gen) return;
        t0 = performance.now();
      }
      const it = items[qi];
      const node = it.node || (it.node = it.src.cloneNode(true));
      if (node.classList.contains('pb')) { if (cur.nodes.length) commit(false); qi++; continue; }
      if (it.src && isH(node) && this.chapterLevel && +node.tagName[1] <= this.chapterLevel) {
        chapter = node.textContent.replace(/\s+/g, ' ').trim();
        if (this.breakChapters) {
          if (cur.nodes.length) commit(false);
          cur.chapter = chapter; cur.chapterStart = true;
          if (+node.tagName[1] === this.chapterLevel && pages.length) node.classList.add('chapter-open');
        } else if (!cur.nodes.length) cur.chapter = chapter;
      }
      fc.append(node);
      if (fits(node)) { cur.nodes.push(node); qi++; continue; }
      const split = this.trySplit(node, limit, cur.nodes.length > 0);
      if (split) {
        fc.replaceChild(split.head, node);
        if (fits(split.head)) {
          cur.nodes.push(split.head);
          const carry = commit(false);
          items[qi] = { node: split.tail };
          if (carry) items.splice(qi, 0, { node: carry });
          continue;
        }
        fc.replaceChild(node, split.head);
      }
      fc.removeChild(node);
      if (!cur.nodes.length) { fc.append(node); cur.nodes.push(node); qi++; commit(false); continue; }
      const carry = commit(true);
      if (carry) items.splice(qi, 0, { node: carry });
    }
    if (cur.nodes.length) commit(false);
    fc.replaceChildren();
    if (!pages.length) pages.push({ nodes: [h('p', { text: '' })], start: { b: 0, o: 0 }, chapter: '', chapterStart: false });
    this.pages = pages;
    this.N = pages.length;
    this._text = new Map();
    if (ck) { FLOW_CACHE.set(ck, { pages }); while (FLOW_CACHE.size > 4) FLOW_CACHE.delete(FLOW_CACHE.keys().next().value); }
    onProgress && onProgress(1);
  }
  trySplit(node, limit, hasContent) {
    const tag = node.tagName;
    if (/^H[1-6]$|^HR$|^FIGURE$|^IMG$/.test(tag)) return null;
    if (node.classList.contains('tw')) return this.splitTable(node, limit);
    if (tag === 'UL' || tag === 'OL') return this.splitList(node, limit, hasContent);
    return this.splitText(node, limit, hasContent);
  }
  splitText(node, limit, hasContent) {
    const texts = [];
    let total = 0;
    for (const t of textNodesOf(node)) if (t.length) { texts.push({ t, s: total }); total += t.length; }
    if (total < 2) return null;
    const base = node.offsetParent || node.parentNode;
    const pcTop = base.getBoundingClientRect().top;
    const rng = document.createRange();
    const loc = (k) => {
      let lo = 0, hi = texts.length - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (texts[mid].s <= k) lo = mid; else hi = mid - 1; }
      return { t: texts[lo].t, off: k - texts[lo].s };
    };
    const bottom = (k) => {
      const { t, off } = loc(k);
      rng.setStart(t, off); rng.setEnd(t, Math.min(t.length, off + 1));
      const rs = rng.getClientRects();
      const r = rs.length ? rs[rs.length - 1] : rng.getBoundingClientRect();
      return r.bottom - pcTop;
    };
    const search = (lim, hiIdx) => {
      let lo = 0, hi = hiIdx, best = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (bottom(mid) <= lim + 0.5) { best = mid; lo = mid + 1; } else hi = mid - 1; }
      return best;
    };
    let best = search(limit, total - 1);
    if (best < 0) return null;
    const lh = parseFloat(getComputedStyle(node).lineHeight) || 24;
    const b0 = bottom(0);
    const headLines = Math.round((bottom(best) - b0) / lh) + 1;
    const totalLines = Math.round((bottom(total - 1) - b0) / lh) + 1;
    if (headLines < 2 && hasContent && totalLines >= 2) return null;
    if (totalLines - headLines < 2 && headLines >= 3) {
      const b2 = search(bottom(best) - lh * 0.6, best);
      if (b2 >= 0) best = b2;
    }
    let k = best + 1;
    if (k >= total) return null;
    const text = texts.map((x) => x.t.data).join('');
    if (!/\s/.test(text[k - 1]) && !/\s/.test(text[k])) {
      let j = k;
      while (j > 0 && !/\s/.test(text[j - 1])) j--;
      if (j > 0) k = j;
    }
    if (k <= 0 || k >= total) return null;
    return this.cutAt(node, loc, k);
  }
  cutAt(node, loc, k) {
    const { t, off } = loc(k);
    const r1 = document.createRange(); r1.setStart(node, 0); r1.setEnd(t, off);
    const r2 = document.createRange(); r2.setStart(t, off); r2.setEnd(node, node.childNodes.length);
    const head = node.cloneNode(false), tail = node.cloneNode(false);
    head.append(r1.cloneContents()); tail.append(r2.cloneContents());
    tail.removeAttribute('id');
    head.classList.add('split-head');
    tail.classList.remove('split-head'); tail.classList.add('split-tail');
    if (node.dataset.b != null) tail.dataset.o = String((+node.dataset.o || 0) + k);
    return { head, tail };
  }
  splitList(node, limit, hasContent) {
    const items = [...node.children].filter((c) => c.tagName === 'LI');
    if (!items.length) return this.splitText(node, limit, hasContent);
    const pcTop = (node.offsetParent || node.parentNode).getBoundingClientRect().top;
    let k = -1;
    for (let i = 0; i < items.length; i++) { if (items[i].getBoundingClientRect().bottom - pcTop <= limit + 0.5) k = i; else break; }
    let liSplit = null;
    const next = items[k + 1];
    if (next) {
      const lh = parseFloat(getComputedStyle(next).lineHeight) || 24;
      if (next.getBoundingClientRect().top - pcTop + lh * 2 <= limit) liSplit = this.splitText(next, limit, true);
    }
    if (k < 0 && !liSplit) return null;
    const head = node.cloneNode(false), tail = node.cloneNode(false);
    items.slice(0, k + 1).forEach((li) => head.append(li.cloneNode(true)));
    let rest = items.slice(k + 1);
    if (liSplit) { head.append(liSplit.head); liSplit.tail.classList.add('cont'); tail.append(liSplit.tail); rest = rest.slice(1); }
    rest.forEach((li) => tail.append(li.cloneNode(true)));
    if (!tail.children.length || !head.children.length) return null;
    if (node.tagName === 'OL') tail.setAttribute('start', String((+node.getAttribute('start') || 1) + k + 1));
    tail.removeAttribute('id');
    head.classList.add('split-head');
    tail.classList.remove('split-head'); tail.classList.add('split-tail');
    tail.dataset.o = String((+node.dataset.o || 0) + plainLen(head));
    return { head, tail };
  }
  splitTable(node, limit) {
    const table = node.querySelector('table');
    if (!table) return null;
    const rows = [...table.querySelectorAll(':scope > tbody > tr, :scope > tr')];
    const pcTop = (node.offsetParent || node.parentNode).getBoundingClientRect().top;
    let k = -1;
    for (let i = 0; i < rows.length; i++) { if (rows[i].getBoundingClientRect().bottom - pcTop <= limit + 0.5) k = i; else break; }
    if (k < 0 || k >= rows.length - 1) return null;
    const mk = (rs, rep) => {
      const w = node.cloneNode(false), t = table.cloneNode(false);
      if (table.tHead) { const th = table.tHead.cloneNode(true); if (rep) th.setAttribute('data-rep', '1'); t.append(th); }
      const tb = document.createElement('tbody');
      rs.forEach((r) => tb.append(r.cloneNode(true)));
      t.append(tb); w.append(t);
      return w;
    };
    const head = mk(rows.slice(0, k + 1), false), tail = mk(rows.slice(k + 1), true);
    head.classList.add('split-head');
    tail.classList.remove('split-head'); tail.classList.add('split-tail');
    tail.dataset.o = String((+node.dataset.o || 0) + plainLen(head));
    return { head, tail };
  }
  fill(el, i) {
    const pg = this.pages[i];
    el.classList.add('flow');
    if (!pg) return;
    const rh = h('div', { class: 'rh' });
    if (!pg.chapterStart) rh.append(h('span', { class: 'rh-l', text: this.book.title || '' }), h('span', { class: 'rh-r', text: pg.chapter || this.book.title || '' }));
    const pc = h('div', { class: 'pc selectable' });
    const fc = h('div', { class: this.fcClass(), lang: 'id' });
    for (const n of pg.nodes) fc.append(n.cloneNode(true));
    for (const img of fc.querySelectorAll('img[data-img]')) { const u = this.imgUrl && this.imgUrl.get(img.getAttribute('data-img')); if (u && img.getAttribute('src') !== u) img.src = u; }
    pc.append(fc);
    el.append(rh, pc, h('div', { class: 'folio', text: String(i + 1) }));
  }
  decorate(el, i, anns, term) {
    const fc = el.querySelector('.flow-c');
    if (!fc) return;
    for (const m of fc.querySelectorAll('mark.hl, mark.hit, mark.tts')) m.replaceWith(...m.childNodes);
    fc.normalize();
    const parts = [...fc.querySelectorAll('[data-b]')];
    for (const a of anns) {
      if (a.type !== 'highlight' || !a.range) continue;
      const { b1, o1, b2, o2 } = a.range;
      for (const part of parts) {
        const b = +part.dataset.b, o = +(part.dataset.o || 0);
        if (b < b1 || b > b2) continue;
        const len = plainLen(part);
        const from = Math.max(0, (b === b1 ? o1 : 0) - o), to = Math.min(len, (b === b2 ? o2 : Infinity) - o);
        if (to > from) wrapRange(part, from, to, () => h('mark', { class: 'hl ' + (a.color || 'y') + (a.note ? ' has-note' : ''), 'data-ann': a.id }));
      }
    }
    if (term) {
      const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      for (const part of parts) {
        const txt = textNodesOf(part).map((t) => t.data).join('');
        const hits = [];
        let m;
        while ((m = re.exec(txt)) && hits.length < 60) { hits.push([m.index, m.index + m[0].length]); if (!m[0].length) re.lastIndex++; }
        for (let k = hits.length - 1; k >= 0; k--) wrapRange(part, hits[k][0], hits[k][1], () => h('mark', { class: 'hit' }));
      }
    }
  }
  // character anchor for a DOM boundary inside a rendered page
  anchorFromBoundary(container, offset, which) {
    const el = container.nodeType === 1 ? container : container.parentElement;
    const r = document.createRange();
    try { r.setStart(container, offset); r.collapse(true); } catch (e) { return null; }
    const part = el && el.closest('[data-b]');
    if (!part) {
      const fc = el && (el.closest('.flow-c') || (el.querySelector && el.querySelector('.flow-c')));
      if (!fc) return null;
      const parts = [...fc.querySelectorAll(':scope > [data-b]')];
      if (which === 'start') {
        for (const p of parts) if (r.comparePoint(p, 0) >= 0) return { b: +p.dataset.b, o: +(p.dataset.o || 0) };
        return null;
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        if (r.comparePoint(p, p.childNodes.length) <= 0) return { b: +p.dataset.b, o: +(p.dataset.o || 0) + plainLen(p) };
      }
      return null;
    }
    let k = 0;
    for (const t of textNodesOf(part)) {
      if (t === container) { k += offset; break; }
      if (r.comparePoint(t, t.length) <= 0) k += t.length; else break;
    }
    return { b: +part.dataset.b, o: +(part.dataset.o || 0) + k };
  }
  pageOfAnchor(a) {
    if (!a || a.b == null || !this.pages.length) return 0;
    let lo = 0, hi = this.pages.length - 1, ans = 0;
    const ao = a.o || 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const s = this.pages[mid].start;
      if (s.b < a.b || (s.b === a.b && s.o <= ao)) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  }
  pageOfId(id) { const b = this.idMap.get(id); return b == null ? null : this.pageOfAnchor({ b, o: 0 }); }
  anchorOf(i) { const p = this.pages[clamp(i, 0, this.N - 1)]; return p ? { ...p.start } : { b: 0, o: 0 }; }
  pctOf(i) {
    if (i >= this.N - 1) return 1;
    const s = this.pages[i + 1].start;
    return clamp((this.cum[s.b] + s.o) / this.total, 0, 1);
  }
  chapterOf(i) { const p = this.pages[i]; return p ? p.chapter : ''; }
  nextChapterPage(i) { for (let k = i + 1; k < this.N; k++) if (this.pages[k].chapterStart) return k; return null; }
  wordsPerPage() { return this.words / Math.max(1, this.N); }
  async textOf(i) {
    if (!this._text) this._text = new Map();
    if (this._text.has(i)) return this._text.get(i);
    const p = this.pages[i];
    const t = p ? p.nodes.map((n) => textNodesOf(n).map((x) => x.data).join('')).join('\n\n') : '';
    this._text.set(i, t);
    return t;
  }
  async toc() {
    return this.headings.filter((x) => x.level <= 3).map((x) => ({ title: x.title, level: x.level, page: this.pageOfAnchor({ b: x.b, o: 0 }) }));
  }
  destroy() { this._gen = (this._gen || 0) + 1; for (const u of this.urls) URL.revokeObjectURL(u); this.urls = []; }
}
