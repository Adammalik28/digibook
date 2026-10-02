// ---------- document conversion ----------
// Word (.docx) → semantic HTML for reflowable, paginated reading.
const Docx = (() => {
  const kids = (el, name) => { const out = []; if (!el) return out; for (const c of el.children) if (!name || c.localName === name) out.push(c); return out; };
  const kid = (el, name) => { if (!el) return null; for (const c of el.children) if (c.localName === name) return c; return null; };
  const attr = (el, name) => { if (!el || !el.attributes) return null; for (const a of el.attributes) if (a.localName === name) return a.value; return null; };
  const val = (el) => attr(el, 'val');
  const onOff = (el) => { if (!el) return null; const v = val(el); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };
  const deep = (el, name) => (el ? Array.from(el.getElementsByTagNameNS('*', name)) : []);
  const MONO = /courier|consolas|menlo|monaco|mono|source code|lucida console/i;

  function parseXml(s) {
    if (!s) return null;
    const d = new DOMParser().parseFromString(s, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) return null;
    return d;
  }
  function parseRels(doc) {
    const m = new Map();
    if (!doc) return m;
    for (const r of doc.documentElement.children) {
      m.set(attr(r, 'Id'), { type: attr(r, 'Type') || '', target: attr(r, 'Target') || '', external: attr(r, 'TargetMode') === 'External' });
    }
    return m;
  }
  function resolvePath(baseDir, target) {
    if (!target) return '';
    if (target.startsWith('/')) return target.slice(1);
    const parts = (baseDir + target).split('/');
    const out = [];
    for (const p of parts) { if (p === '..') out.pop(); else if (p && p !== '.') out.push(p); }
    return out.join('/');
  }
  function parseStyles(doc) {
    const map = new Map();
    if (!doc) return map;
    for (const s of doc.documentElement.children) {
      if (s.localName !== 'style') continue;
      const id = attr(s, 'styleId');
      const pPr = kid(s, 'pPr'), rPr = kid(s, 'rPr');
      const numPr = pPr && kid(pPr, 'numPr');
      const ol = pPr && kid(pPr, 'outlineLvl');
      const fonts = rPr && kid(rPr, 'rFonts');
      map.set(id, {
        id, type: attr(s, 'type'),
        name: String(val(kid(s, 'name')) || id || '').toLowerCase(),
        basedOn: val(kid(s, 'basedOn')),
        outline: ol ? +val(ol) : null,
        numId: numPr ? val(kid(numPr, 'numId')) : null,
        ilvl: numPr && kid(numPr, 'ilvl') ? +val(kid(numPr, 'ilvl')) : null,
        b: rPr ? onOff(kid(rPr, 'b')) : null,
        i: rPr ? onOff(kid(rPr, 'i')) : null,
        mono: !!(fonts && MONO.test((attr(fonts, 'ascii') || '') + ' ' + (attr(fonts, 'hAnsi') || ''))),
        pageBreakBefore: pPr ? onOff(kid(pPr, 'pageBreakBefore')) : null,
      });
    }
    return map;
  }
  function chain(styles, id) {
    const out = []; const seen = new Set();
    while (id && styles.has(id) && !seen.has(id)) { seen.add(id); const s = styles.get(id); out.push(s); id = s.basedOn; }
    return out;
  }
  function parseNumbering(doc) {
    const abs = new Map(), nums = new Map();
    if (doc) {
      for (const el of doc.documentElement.children) {
        if (el.localName === 'abstractNum') {
          const lv = {};
          for (const l of kids(el, 'lvl')) {
            lv[+attr(l, 'ilvl')] = { fmt: val(kid(l, 'numFmt')) || 'decimal', start: kid(l, 'start') ? +val(kid(l, 'start')) : 1, text: kid(l, 'lvlText') ? (val(kid(l, 'lvlText')) || '') : '' };
          }
          abs.set(attr(el, 'abstractNumId'), lv);
        } else if (el.localName === 'num') {
          const ov = {};
          for (const o of kids(el, 'lvlOverride')) { const so = kid(o, 'startOverride'); ov[+attr(o, 'ilvl')] = so ? +val(so) : null; }
          nums.set(attr(el, 'numId'), { abs: val(kid(el, 'abstractNumId')), ov });
        }
      }
    }
    return {
      level(numId, ilvl) {
        const n = nums.get(String(numId)); if (!n) return null;
        const a = abs.get(n.abs) || {};
        const l = a[ilvl] || a[0];
        if (!l) return null;
        return { ...l, absId: n.abs, startOv: n.ov[ilvl] ?? null, levels: a };
      },
    };
  }
  const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  function roman(n) { let s = ''; for (const [v, r] of ROMAN) while (n >= v) { s += r; n -= v; } return s; }
  function letters(n) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
  function fmtNum(n, fmt) {
    switch (fmt) {
      case 'lowerLetter': return letters(n);
      case 'upperLetter': return letters(n).toUpperCase();
      case 'lowerRoman': return roman(n);
      case 'upperRoman': return roman(n).toUpperCase();
      case 'decimalZero': return String(n).padStart(2, '0');
      case 'bullet': case 'none': return '';
      default: return String(n);
    }
  }
  const SYM = { F0B7: '•', F0A7: '▪', F06C: '●', F0D8: '➢', F076: '❖', F0FC: '✓', F0A8: '□', F06F: '○', F071: '❑', F0E8: '➔', F02D: '–', F0B2: '≥', F0A3: '≤' };

  async function convert(arrayBuffer, onProgress) {
    const JSZip = await need('jszip');
    const zip = await JSZip.loadAsync(arrayBuffer);
    const read = async (p) => { const f = zip.file(p); return f ? f.async('string') : null; };
    let main = 'word/document.xml';
    const rootRels = parseRels(parseXml(await read('_rels/.rels')));
    for (const r of rootRels.values()) if (/\/officeDocument$/.test(r.type)) main = resolvePath('', r.target);
    const xml = await read(main);
    if (!xml) throw new Error('Isi dokumen Word tidak ditemukan. Pastikan file berformat .docx.');
    const doc = parseXml(xml);
    if (!doc) throw new Error('Dokumen Word rusak atau tidak bisa dibaca.');
    const baseDir = main.replace(/[^/]+$/, '');
    const relsFor = async (part) => parseRels(parseXml(await read(baseDir + '_rels/' + part.split('/').pop() + '.rels')));
    const ctx = {
      zip, baseDir,
      rels: await relsFor(main),
      styles: parseStyles(parseXml(await read(baseDir + 'styles.xml'))),
      numbering: parseNumbering(parseXml(await read(baseDir + 'numbering.xml'))),
      images: {}, imgKeys: new Map(), imgJobs: [], imgCount: 0,
      counters: new Map(), seenNum: new Set(),
      notes: { footnote: new Map(), endnote: new Map() }, noteOrder: [], noteRels: new Map(),
      fields: [], warnings: new Set(), pending: [],
    };
    for (const kind of ['footnote', 'endnote']) {
      const nd = parseXml(await read(baseDir + kind + 's.xml'));
      if (!nd) continue;
      ctx.noteRels.set(kind, await relsFor(kind + 's.xml'));
      for (const n of nd.documentElement.children) {
        if (n.localName !== kind) continue;
        const t = attr(n, 'type');
        if (t === 'separator' || t === 'continuationSeparator' || t === 'continuationNotice') continue;
        ctx.notes[kind].set(attr(n, 'id'), n);
      }
    }
    onProgress && onProgress(0.3);
    const body = kid(doc.documentElement, 'body');
    const blocks = convBlocks(kids(body), ctx);
    let html = assemble(blocks);
    // notes at the end
    if (ctx.noteOrder.length) {
      let notesHtml = '<section class="footnotes"><hr><h2>Catatan</h2><ol>';
      for (const n of ctx.noteOrder) {
        const el = ctx.notes[n.kind].get(n.id);
        const saved = ctx.rels; ctx.rels = ctx.noteRels.get(n.kind) || ctx.rels;
        const inner = el ? assemble(convBlocks(kids(el), ctx)) : '';
        ctx.rels = saved;
        notesHtml += `<li id="fn-${n.num}">${inner.replace(/<\/p>\s*$/, '')} <a href="#fnref-${n.num}" aria-label="Kembali ke teks">↩</a>${/<\/p>\s*$/.test(inner) ? '</p>' : ''}</li>`;
      }
      html += notesHtml + '</ol></section>';
    }
    onProgress && onProgress(0.55);
    await Promise.all(ctx.imgJobs);
    html = html.replace(/<img data-img="(im\d+)"([^>]*)>/g, (m, key) => {
      const v = ctx.images[key];
      if (v && typeof v === 'string') return m;
      const what = v && v.ext ? `Gambar format ${v.ext.toUpperCase()} tidak dapat ditampilkan` : 'Gambar tidak tersedia';
      return `<span class="img-missing">[${what}]</span>`;
    });
    for (const [k, v] of Object.entries(ctx.images)) if (typeof v !== 'string') delete ctx.images[k];
    // core properties
    let title = '', author = '';
    const core = parseXml(await read('docProps/core.xml'));
    if (core) {
      title = (deep(core, 'title')[0] || {}).textContent || '';
      author = (deep(core, 'creator')[0] || {}).textContent || '';
    }
    if (/^(python-docx|un-?named|microsoft|administrator|user|admin|pengguna|author|owner)$/i.test(author.trim()) || /docx|openxml/i.test(author)) author = '';
    return { html, images: ctx.images, title: title.trim(), author: author.trim(), warnings: [...ctx.warnings] };
  }

  // ----- blocks -----
  function convBlocks(nodes, ctx) {
    const out = [];
    for (const n of nodes) {
      switch (n.localName) {
        case 'p': convParagraph(n, ctx, out); break;
        case 'tbl': out.push({ t: 'raw', html: convTable(n, ctx) }); break;
        case 'sdt': {
          const pr = kid(n, 'sdtPr');
          const gal = pr ? deep(pr, 'docPartGallery')[0] : null;
          const isToc = gal && /contents/i.test(val(gal) || '');
          const inner = convBlocks(kids(kid(n, 'sdtContent')), ctx);
          if (isToc) inner.forEach((b) => { if (b.t === 'h') { b.t = 'p'; b.cls = 'toc-title'; } });
          out.push(...inner);
          break;
        }
        case 'customXml': case 'smartTag': out.push(...convBlocks(kids(n), ctx)); break;
        case 'AlternateContent': {
          const choice = kid(n, 'Choice'), fb = kid(n, 'Fallback');
          out.push(...convBlocks(kids(choice || fb), ctx));
          break;
        }
        default: break;
      }
    }
    return out;
  }

  function paraInfo(p, ctx) {
    const pPr = kid(p, 'pPr');
    const styleId = pPr ? val(kid(pPr, 'pStyle')) : null;
    const ch = chain(ctx.styles, styleId || 'Normal');
    const name = ch.length ? ch[0].name : '';
    let outline = null;
    const ol = pPr && kid(pPr, 'outlineLvl');
    if (ol) outline = +val(ol);
    else for (const s of ch) if (s.outline != null) { outline = s.outline; break; }
    let numId = null, ilvl = null;
    const np = pPr && kid(pPr, 'numPr');
    if (np) { numId = val(kid(np, 'numId')); ilvl = kid(np, 'ilvl') ? +val(kid(np, 'ilvl')) : null; }
    if (numId == null) for (const s of ch) if (s.numId != null) { numId = s.numId; if (ilvl == null) ilvl = s.ilvl; break; }
    if (ilvl == null) for (const s of ch) if (s.ilvl != null) { ilvl = s.ilvl; break; }
    if (ilvl == null) ilvl = 0;
    const jc = pPr ? val(kid(pPr, 'jc')) : null;
    let pbb = pPr ? onOff(kid(pPr, 'pageBreakBefore')) : null;
    if (pbb == null) for (const s of ch) if (s.pageBreakBefore != null) { pbb = s.pageBreakBefore; break; }
    const sect = pPr && kid(pPr, 'sectPr');
    const sectType = sect && kid(sect, 'type') ? val(kid(sect, 'type')) : 'nextPage';
    const names = ch.map((s) => s.name);
    const mono = ch.some((s) => s.mono);
    return { pPr, name, names, outline, numId: numId === '0' ? null : numId, ilvl, jc, pbb: !!pbb, sectBreak: !!sect && sectType !== 'continuous', mono };
  }

  function headingLevel(info) {
    const nm = info.name;
    if (nm === 'title' || nm === 'judul') return { level: 1, cls: 'title' };
    if (nm === 'subtitle' || nm === 'subjudul') return { sub: true };
    let m = nm.match(/^(?:heading|judul|título|titre|überschrift|kop)\s*(\d)$/);
    if (m) return { level: Math.min(6, +m[1]) };
    if (info.outline != null && info.outline >= 0 && info.outline < 6 && !/^toc|daftar isi|table of contents/.test(nm)) return { level: info.outline + 1 };
    return null;
  }

  function numberLabel(ctx, numId, ilvl) {
    const lv = ctx.numbering.level(numId, ilvl);
    if (!lv) return { lv: null, label: '' };
    const key = lv.absId + ':' + numId;
    let c = ctx.counters.get(lv.absId);
    if (!c) { c = {}; ctx.counters.set(lv.absId, c); }
    const first = !ctx.seenNum.has(numId + ':' + ilvl);
    ctx.seenNum.add(numId + ':' + ilvl);
    const start = lv.startOv != null && first ? lv.startOv : lv.start;
    c[ilvl] = c[ilvl] == null || (lv.startOv != null && first) ? start : c[ilvl] + 1;
    for (const k of Object.keys(c)) if (+k > ilvl) delete c[k];
    let label = lv.text || '';
    label = label.replace(/%(\d)/g, (m, d) => {
      const li = +d - 1;
      const l2 = lv.levels[li] || lv;
      const v = c[li] != null ? c[li] : (l2.start || 1);
      return fmtNum(v, l2.fmt);
    });
    void key;
    return { lv, label, count: c[ilvl] };
  }

  function convParagraph(p, ctx, out) {
    const info = paraInfo(p, ctx);
    const segs = [''];
    const st = { info, ctx, segs, hasContent: false, textLen: 0, mono: true, anyRun: false };
    convInline(kids(p), st);
    // close a hyperlink field still open at paragraph end
    for (const f of ctx.fields) if (f.open) { segs[segs.length - 1] += '</a>'; f.open = false; f.reopen = true; }
    if (info.pbb) out.push({ t: 'pb' });
    const hd = headingLevel(info);
    const isToc = /^(toc|daftar isi)\s*\d?$/.test(info.name) || /^toc \d$/.test(info.name);
    const isQuote = /quote|kutipan/.test(info.name);
    const isCode = /code|source|preformatted|kode/.test(info.name) || (st.anyRun && st.mono && info.mono);
    const isCaption = /caption|keterangan/.test(info.name);
    const align = info.jc === 'center' ? 'al-c' : (info.jc === 'right' || info.jc === 'end') ? 'al-r' : '';
    segs.forEach((html, i) => {
      if (i > 0) out.push({ t: 'pb' });
      html = mergeTags(html.replace(/^(\s|&nbsp;| )+|(\s|&nbsp;| |<br>)+$/g, ''));
      const empty = !html.replace(/<(?!img)[^>]*>/g, '').replace(/&nbsp;| |\s/g, '');
      if (empty) { if (!hd) out.push({ t: 'p', empty: true, html: '' }); return; }
      if (isToc) {
        const lvl = (info.name.match(/(\d)/) || [0, 1])[1];
        out.push({ t: 'p', cls: 'toc toc-' + lvl, html: html.replace(/( |\s)+\d+\s*$/, '') });
        return;
      }
      if (hd && hd.level) {
        let num = '';
        if (info.numId) { const r = numberLabel(ctx, info.numId, info.ilvl); if (r.label && r.lv && r.lv.fmt !== 'bullet' && r.lv.fmt !== 'none') num = `<span class="hnum">${esc(r.label)}</span> `; }
        out.push({ t: 'h', level: hd.level, cls: hd.cls || '', html: num + html });
        return;
      }
      if (hd && hd.sub) { out.push({ t: 'p', cls: 'subtitle', html }); return; }
      if (info.numId && !isCode) {
        const r = numberLabel(ctx, info.numId, info.ilvl);
        if (r.lv && r.lv.fmt !== 'none') {
          const bullet = r.lv.fmt === 'bullet';
          const t = { lowerLetter: 'a', upperLetter: 'A', lowerRoman: 'i', upperRoman: 'I' }[r.lv.fmt] || '1';
          out.push({ t: 'li', list: bullet ? 'ul' : 'ol', olType: bullet ? '' : t, level: info.ilvl, numId: info.numId, start: r.count || 1, html });
          return;
        }
      }
      if (isCode) { out.push({ t: 'code', text: html }); return; }
      if (isQuote) { out.push({ t: 'quote', html }); return; }
      out.push({ t: 'p', cls: [align, isCaption ? 'caption' : ''].filter(Boolean).join(' '), html });
    });
    if (ctx.pending.length) { out.push(...ctx.pending); ctx.pending = []; }
    if (info.sectBreak) out.push({ t: 'pb' });
  }

  function mergeTags(s) {
    let prev;
    do { prev = s; s = s.replace(/<\/(strong|em|u|s|sup|sub|code)><\1>/g, ''); } while (s !== prev);
    return s;
  }

  function runFormat(r, st) {
    const rPr = kid(r, 'rPr');
    const f = { b: false, i: false, u: false, s: false, sup: false, sub: false, code: false, mark: false, caps: false };
    if (rPr) {
      const rs = val(kid(rPr, 'rStyle'));
      for (const s of chain(st.ctx.styles, rs)) {
        if (s.b && f.b === false) f.b = true;
        if (s.i && f.i === false) f.i = true;
        if (s.mono) f.code = true;
        if (/strong|kuat/.test(s.name)) f.b = true;
        if (/emphasis|penekanan/.test(s.name)) f.i = true;
      }
      const b = onOff(kid(rPr, 'b')); if (b != null) f.b = b;
      const i = onOff(kid(rPr, 'i')); if (i != null) f.i = i;
      const u = kid(rPr, 'u'); if (u && val(u) !== 'none') f.u = true;
      if (onOff(kid(rPr, 'strike')) || onOff(kid(rPr, 'dstrike'))) f.s = true;
      const va = val(kid(rPr, 'vertAlign'));
      if (va === 'superscript') f.sup = true; else if (va === 'subscript') f.sub = true;
      const hl = kid(rPr, 'highlight'); if (hl && val(hl) && val(hl) !== 'none') f.mark = true;
      const fonts = kid(rPr, 'rFonts');
      if (fonts && MONO.test((attr(fonts, 'ascii') || '') + (attr(fonts, 'hAnsi') || ''))) f.code = true;
      if (onOff(kid(rPr, 'smallCaps')) || onOff(kid(rPr, 'caps'))) f.caps = true;
    }
    return f;
  }
  function wrapFmt(html, f, inHeading) {
    if (!html) return html;
    if (f.code) html = `<code>${html}</code>`;
    if (f.sup) html = `<sup>${html}</sup>`;
    if (f.sub) html = `<sub>${html}</sub>`;
    if (f.b && !inHeading) html = `<strong>${html}</strong>`;
    if (f.i) html = `<em>${html}</em>`;
    if (f.u) html = `<u>${html}</u>`;
    if (f.s) html = `<s>${html}</s>`;
    if (f.mark) html = `<mark>${html}</mark>`;
    return html;
  }
  function emit(st, html) { st.segs[st.segs.length - 1] += html; }
  function topField(ctx) { return ctx.fields[ctx.fields.length - 1]; }
  function fieldSuppressed(ctx) { return ctx.fields.some((f) => f.phase === 'instr' || (f.phase === 'result' && f.kind === 'hide')); }

  function convInline(nodes, st, linkOpen) {
    const ctx = st.ctx;
    // reopen a hyperlink field that spans paragraphs
    for (const f of ctx.fields) if (f.reopen && f.href) { emit(st, `<a href="${esc(f.href)}"${/^#/.test(f.href) ? '' : ' target="_blank" rel="noopener"'}>`); f.open = true; f.reopen = false; }
    for (const n of nodes) {
      switch (n.localName) {
        case 'r': convRun(n, st); break;
        case 'hyperlink': {
          const rid = attr(n, 'id');
          const anchor = attr(n, 'anchor');
          let href = '';
          if (rid && ctx.rels.has(rid)) href = ctx.rels.get(rid).target;
          if (anchor) href = (href || '') + '#' + (href ? anchor : 'bm-' + anchor);
          if (href && !/^(https?:|mailto:|#)/i.test(href)) href = '';
          if (href && !linkOpen) {
            emit(st, `<a href="${esc(href)}"${href.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>`);
            convInline(kids(n), st, true);
            emit(st, '</a>');
          } else convInline(kids(n), st, linkOpen);
          break;
        }
        case 'fldSimple': {
          const instr = attr(n, 'instr') || '';
          if (/^\s*(PAGE|NUMPAGES|PAGEREF)\b/i.test(instr)) break;
          const m = instr.match(/HYPERLINK\s+(?:\\l\s+)?"([^"]+)"/i);
          if (m && !linkOpen) {
            const href = /\\l/.test(instr) ? '#bm-' + m[1] : m[1];
            if (/^(https?:|mailto:|#)/i.test(href)) { emit(st, `<a href="${esc(href)}"${href.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>`); convInline(kids(n), st, true); emit(st, '</a>'); break; }
          }
          convInline(kids(n), st, linkOpen);
          break;
        }
        case 'ins': case 'moveTo': case 'smartTag': case 'customXml': case 'dir': case 'bdo':
          convInline(kids(n), st, linkOpen); break;
        case 'sdt': convInline(kids(kid(n, 'sdtContent')), st, linkOpen); break;
        case 'bookmarkStart': {
          const name = attr(n, 'name');
          if (name && name !== '_GoBack') emit(st, `<a id="bm-${esc(name)}"></a>`);
          break;
        }
        case 'oMath': case 'oMathPara': {
          const t = deep(n, 't').map((x) => x.textContent).join('');
          if (t) { emit(st, `<em>${esc(t)}</em>`); st.hasContent = true; st.mono = false; }
          break;
        }
        case 'AlternateContent': {
          const choice = kid(n, 'Choice'), fb = kid(n, 'Fallback');
          convInline(kids(choice || fb), st, linkOpen);
          break;
        }
        default: break;
      }
    }
  }

  function convRun(r, st) {
    const ctx = st.ctx;
    const f = runFormat(r, st);
    const inHeading = st.info && headingLevel(st.info) && headingLevel(st.info).level;
    let buf = '';
    const flush = () => { if (buf) { emit(st, wrapFmt(esc(buf), f, inHeading)); buf = ''; } };
    for (const c of r.children) {
      const ln = c.localName;
      if (ln === 'fldChar') {
        flush();
        const t = attr(c, 'fldCharType');
        if (t === 'begin') ctx.fields.push({ phase: 'instr', instr: '', kind: 'show' });
        else if (t === 'separate') {
          const fd = topField(ctx);
          if (fd) {
            fd.phase = 'result';
            const ins = fd.instr.trim();
            if (/^(PAGE|NUMPAGES|PAGEREF|SECTIONPAGES)\b/i.test(ins)) fd.kind = 'hide';
            else {
              const m = ins.match(/^HYPERLINK\s+(\\l\s+)?"([^"]+)"/i);
              if (m) {
                const href = m[1] ? '#bm-' + m[2] : m[2];
                if (/^(https?:|mailto:|#)/i.test(href) && !ctx.fields.slice(0, -1).some((x) => x.open)) { fd.href = href; fd.open = true; emit(st, `<a href="${esc(href)}"${href.startsWith('#') ? '' : ' target="_blank" rel="noopener"'}>`); }
              }
            }
          }
        } else if (t === 'end') {
          const fd = ctx.fields.pop();
          if (fd && fd.open) emit(st, '</a>');
        }
        continue;
      }
      if (ln === 'instrText') { const fd = topField(ctx); if (fd && fd.phase === 'instr') fd.instr += c.textContent; continue; }
      if (fieldSuppressed(ctx)) continue;
      switch (ln) {
        case 't': buf += c.textContent; st.anyRun = true; if (!f.code) st.mono = false; if (c.textContent.trim()) st.hasContent = true; break;
        case 'tab': buf += /^(toc|daftar isi)/.test(st.info.name) ? ' ' : ' '; break;
        case 'br': {
          const type = attr(c, 'type');
          if (type === 'page') { flush(); st.segs.push(''); }
          else if (type === 'column') buf += ' ';
          else { flush(); emit(st, '<br>'); }
          break;
        }
        case 'cr': flush(); emit(st, '<br>'); break;
        case 'noBreakHyphen': buf += '‑'; break;
        case 'softHyphen': buf += '­'; break;
        case 'ptab': buf += ' '; break;
        case 'sym': {
          const code = (attr(c, 'char') || '').toUpperCase();
          let ch = SYM[code];
          if (!ch && code) { let n = parseInt(code, 16); if (n >= 0xf000) n -= 0xf000; ch = n > 31 ? String.fromCharCode(n) : ''; }
          buf += ch || '';
          break;
        }
        case 'drawing': flush(); emit(st, drawing(c, ctx)); st.hasContent = true; break;
        case 'pict': case 'object': flush(); emit(st, vml(c, ctx)); break;
        case 'footnoteReference': case 'endnoteReference': {
          flush();
          const kind = ln === 'footnoteReference' ? 'footnote' : 'endnote';
          const id = attr(c, 'id');
          if (ctx.notes[kind].has(id)) {
            const num = ctx.noteOrder.length + 1;
            ctx.noteOrder.push({ kind, id, num });
            emit(st, `<sup class="fn-ref"><a href="#fn-${num}" id="fnref-${num}">${num}</a></sup>`);
          }
          break;
        }
        case 'AlternateContent': {
          flush();
          const choice = kid(c, 'Choice'), fb = kid(c, 'Fallback');
          const branch = choice && deep(choice, 'drawing').length ? choice : (fb || choice);
          for (const x of kids(branch)) {
            if (x.localName === 'drawing') emit(st, drawing(x, ctx));
            else if (x.localName === 'pict') emit(st, vml(x, ctx));
          }
          break;
        }
        default: break;
      }
    }
    flush();
  }

  function imageTag(ctx, target, alt, w, hgt) {
    const path = resolvePath(ctx.baseDir, target);
    let key = ctx.imgKeys.get(path);
    if (!key) {
      key = 'im' + (++ctx.imgCount);
      ctx.imgKeys.set(path, key);
      ctx.imgJobs.push(loadImage(ctx, key, path));
    }
    const size = w && hgt ? ` width="${Math.round(w)}" height="${Math.round(hgt)}"` : '';
    return `<img data-img="${key}" alt="${esc(alt || '')}"${size}>`;
  }
  async function loadImage(ctx, key, path) {
    const f = ctx.zip.file(path);
    if (!f) { ctx.images[key] = null; return; }
    const ext = (path.split('.').pop() || '').toLowerCase();
    const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp' }[ext];
    if (!mime) { ctx.images[key] = { ext }; ctx.warnings.add('Beberapa gambar berformat ' + ext.toUpperCase() + ' tidak dapat ditampilkan.'); return; }
    let blob = new Blob([await f.async('uint8array')], { type: mime });
    try { blob = await shrinkImage(blob); } catch (e) { /* keep original */ }
    ctx.images[key] = 'data:' + blob.type + ';base64,' + await blobToBase64(blob);
  }
  function drawing(el, ctx) {
    const docPr = deep(el, 'docPr')[0];
    const alt = docPr ? (attr(docPr, 'descr') || attr(docPr, 'title') || '') : '';
    const ext = deep(el, 'extent')[0];
    const w = ext ? (+attr(ext, 'cx') || 0) / 9525 : 0;
    const hh = ext ? (+attr(ext, 'cy') || 0) / 9525 : 0;
    const blip = deep(el, 'blip')[0];
    let out = '';
    if (blip) {
      const rid = attr(blip, 'embed') || attr(blip, 'link');
      const rel = rid && ctx.rels.get(rid);
      if (rel && !rel.external) out += imageTag(ctx, rel.target, alt, w, hh);
    } else if (deep(el, 'chart').length) {
      out += '<span class="img-missing">[Grafik Word tidak dapat ditampilkan — ekspor sebagai gambar atau PDF untuk melihatnya]</span>';
      ctx.warnings.add('Grafik bawaan Word belum dapat ditampilkan.');
    }
    const tb = deep(el, 'txbxContent');
    if (tb.length) {
      const inner = assemble(convBlocks(kids(tb[0]), ctx));
      if (inner.trim()) ctx.pending.push({ t: 'raw', html: `<div class="textbox">${inner}</div>` });
    }
    return out;
  }
  function vml(el, ctx) {
    const im = deep(el, 'imagedata')[0];
    let out = '';
    if (im) {
      const rid = attr(im, 'id');
      const rel = rid && ctx.rels.get(rid);
      const shape = deep(el, 'shape')[0];
      const style = shape ? attr(shape, 'style') || '' : '';
      const pt = (k) => { const m = style.match(new RegExp(k + ':\\s*([\\d.]+)pt')); return m ? +m[1] * 96 / 72 : 0; };
      if (rel && !rel.external) out += imageTag(ctx, rel.target, attr(im, 'title') || '', pt('width'), pt('height'));
    }
    const tb = deep(el, 'txbxContent');
    if (tb.length) {
      const inner = assemble(convBlocks(kids(tb[0]), ctx));
      if (inner.trim()) ctx.pending.push({ t: 'raw', html: `<div class="textbox">${inner}</div>` });
    }
    return out;
  }

  function convTable(tbl, ctx) {
    const rows = [];
    const collectRows = (parent) => {
      for (const c of kids(parent)) {
        if (c.localName === 'tr') rows.push(c);
        else if (c.localName === 'sdt') collectRows(kid(c, 'sdtContent'));
        else if (c.localName === 'customXml') collectRows(c);
      }
    };
    collectRows(tbl);
    const grid = [];
    for (const tr of rows) {
      const trPr = kid(tr, 'trPr');
      const header = !!(trPr && onOff(kid(trPr, 'tblHeader')));
      let col = trPr && kid(trPr, 'gridBefore') ? +val(kid(trPr, 'gridBefore')) : 0;
      const cells = [];
      const collectCells = (parent) => {
        for (const c of kids(parent)) {
          if (c.localName === 'tc') {
            const tcPr = kid(c, 'tcPr');
            const span = tcPr && kid(tcPr, 'gridSpan') ? +val(kid(tcPr, 'gridSpan')) || 1 : 1;
            const vmEl = tcPr && kid(tcPr, 'vMerge');
            const vm = vmEl ? (val(vmEl) === 'restart' ? 'restart' : 'cont') : null;
            let inner = assemble(convBlocks(kids(c), ctx));
            const single = inner.match(/^<p(?: class="[^"]*")?>([\s\S]*)<\/p>$/);
            if (single && !/<p[\s>]/.test(single[1])) inner = single[1];
            cells.push({ col, span, vm, html: inner, rowspan: 1 });
            col += span;
          } else if (c.localName === 'sdt') collectCells(kid(c, 'sdtContent'));
          else if (c.localName === 'customXml') collectCells(c);
        }
      };
      collectCells(tr);
      grid.push({ header, cells });
    }
    // vertical merges
    for (let r = 0; r < grid.length; r++) {
      for (const cell of grid[r].cells) {
        if (cell.vm !== 'restart') continue;
        let k = r + 1;
        while (k < grid.length) {
          const below = grid[k].cells.find((x) => x.col === cell.col);
          if (!below || below.vm !== 'cont') break;
          below.skip = true; cell.rowspan++; k++;
        }
      }
      for (const cell of grid[r].cells) if (cell.vm === 'cont' && !cell.skip) cell.vm = null;
    }
    let lead = 0;
    while (lead < grid.length && grid[lead].header) lead++;
    const rowHtml = (row, tag) => '<tr>' + row.cells.filter((c) => !c.skip).map((c) => `<${tag}${c.span > 1 ? ` colspan="${c.span}"` : ''}${c.rowspan > 1 ? ` rowspan="${c.rowspan}"` : ''}>${c.html || ''}</${tag}>`).join('') + '</tr>';
    let html = '<div class="tw"><table>';
    if (lead) html += '<thead>' + grid.slice(0, lead).map((r) => rowHtml(r, 'th')).join('') + '</thead>';
    html += '<tbody>' + grid.slice(lead).map((r) => rowHtml(r, 'td')).join('') + '</tbody></table></div>';
    return html;
  }

  // Group list items into nested lists; merge code and quote runs.
  function assemble(blocks) {
    let out = '';
    const stack = [];
    const closeTo = (lvl) => { while (stack.length && stack[stack.length - 1].level > lvl) out += '</li></' + stack.pop().tag + '>'; };
    let i = 0;
    let lastEmpty = true;
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.t === 'li') {
        closeTo(b.level);
        let top = stack[stack.length - 1];
        if (top && top.level === b.level && (top.tag !== b.list || top.type !== b.olType)) { out += '</li></' + stack.pop().tag + '>'; top = stack[stack.length - 1]; }
        if (!top || top.level < b.level) {
          const typeAttr = b.list === 'ol' && b.olType && b.olType !== '1' ? ` type="${b.olType}"` : '';
          const startAttr = b.list === 'ol' && b.start > 1 ? ` start="${b.start}"` : '';
          out += `<${b.list}${typeAttr}${startAttr}><li>${b.html}`;
          stack.push({ tag: b.list, level: b.level, type: b.olType });
        } else out += `</li><li>${b.html}`;
        lastEmpty = false; i++; continue;
      }
      closeTo(-1);
      if (b.t === 'code') {
        const lines = [];
        while (i < blocks.length && blocks[i].t === 'code') { lines.push(blocks[i].text.replace(/<br>/g, '\n').replace(/<\/?code>/g, '').replace(/ /g, '    ')); i++; }
        out += `<pre><code>${lines.join('\n')}</code></pre>`;
        lastEmpty = false; continue;
      }
      if (b.t === 'quote') {
        let inner = '';
        while (i < blocks.length && blocks[i].t === 'quote') { inner += `<p>${blocks[i].html}</p>`; i++; }
        out += `<blockquote>${inner}</blockquote>`;
        lastEmpty = false; continue;
      }
      if (b.t === 'pb') { out += '<div class="pb"></div>'; lastEmpty = true; i++; continue; }
      if (b.t === 'p' && b.empty) { if (!lastEmpty) out += '<p class="empty"></p>'; lastEmpty = true; i++; continue; }
      if (b.t === 'h') out += `<h${b.level}${b.cls ? ` class="${b.cls}"` : ''}>${b.html}</h${b.level}>`;
      else if (b.t === 'p') out += `<p${b.cls ? ` class="${b.cls}"` : ''}>${b.html}</p>`;
      else if (b.t === 'raw') out += b.html;
      lastEmpty = false; i++;
    }
    closeTo(-1);
    return out;
  }

  return { convert };
})();

// Downscale very large embedded pictures so books stay light on phones.
async function shrinkImage(blob) {
  if (blob.size < 700 * 1024 || !/^image\/(png|jpeg|webp)$/.test(blob.type) || typeof createImageBitmap !== 'function') return blob;
  const bmp = await createImageBitmap(blob);
  const max = 1800;
  if (bmp.width <= max && blob.size < 2.5 * 1048576) { bmp.close && bmp.close(); return blob; }
  const s = Math.min(1, max / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return out && out.size < blob.size ? out : blob;
}

// ----- Markdown / plain text -----
async function mdToHtml(text) {
  const marked = await need('marked');
  const parse = marked.parse || (marked.marked && marked.marked.parse) || marked;
  let html = parse.call(marked, text, { gfm: true, breaks: false, async: false });
  html = await sanitize(html);
  const t = document.createElement('template');
  t.innerHTML = html;
  for (const tbl of t.content.querySelectorAll('table')) { const w = document.createElement('div'); w.className = 'tw'; tbl.replaceWith(w); w.append(tbl); }
  for (const img of t.content.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!/^data:image\//i.test(src)) {
      const s = document.createElement('span'); s.className = 'img-missing';
      s.textContent = `[Gambar: ${img.getAttribute('alt') || src}]`;
      img.replaceWith(s);
    }
  }
  for (const a of t.content.querySelectorAll('a[href]')) { if (!/^#/.test(a.getAttribute('href'))) { a.target = '_blank'; a.rel = 'noopener'; } }
  return t.innerHTML;
}
function txtToHtml(text) {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const lines = text.split('\n');
  const short = lines.filter((l) => l.length > 0 && l.length <= 82).length / Math.max(1, lines.filter((l) => l.length).length);
  const hardWrapped = short > 0.85;
  let out = '';
  for (const b of blocks) {
    const s = b.trim();
    if (!s) continue;
    if (s.length < 90 && !/\n/.test(s) && (/^(bab|chapter|bagian|part)\s+[\divxlc]+\b/i.test(s) || (s === s.toUpperCase() && /[A-Z]{3}/.test(s)))) { out += `<h2>${esc(s)}</h2>`; continue; }
    const inner = hardWrapped ? esc(s.replace(/\s*\n\s*/g, ' ')) : esc(s).replace(/\n/g, '<br>');
    out += `<p>${inner}</p>`;
  }
  return out;
}
function countWords(html) {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ');
  return (t.match(/[\p{L}\p{N}]+/gu) || []).length;
}

// ----- detect & convert an uploaded file -----
const KIND_LABEL = { pdf: 'PDF', docx: 'Word', md: 'Markdown', txt: 'Teks' };
function detectKind(file) {
  const n = (file.name || '').toLowerCase();
  if (/\.pdf$/.test(n) || file.type === 'application/pdf') return 'pdf';
  if (/\.docx$/.test(n) || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (/\.(md|markdown)$/.test(n) || file.type === 'text/markdown') return 'md';
  if (/\.txt$/.test(n) || file.type === 'text/plain') return 'txt';
  if (/\.doc$/.test(n)) return 'doc';
  if (/\.(epub|odt|rtf|pptx?|xlsx?)$/.test(n)) return 'other';
  return null;
}
function unsupportedText(kind, name) {
  if (kind === 'doc') return 'Format .doc lama belum didukung. Buka di Word lalu simpan sebagai .docx atau PDF.';
  return `Format "${(name.split('.').pop() || '').toUpperCase()}" belum didukung. Gunakan PDF, Word (.docx), Markdown, atau teks (.txt).`;
}
function baseName(name) { return (name || 'Dokumen').replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Dokumen'; }
function cleanTitle(t, fallback) {
  t = String(t || '').replace(/^microsoft (word|powerpoint) - /i, '').replace(/\.(docx?|pdf|pptx?)$/i, '').trim();
  if (!t || /^(untitled|tanpa judul|document\d*|dokumen\d*)$/i.test(t) || t.length > 160) return fallback;
  return t;
}

async function toFlowContent(file, kind, onProgress) {
  let html = '', images = {}, title = '', author = '', warnings = [];
  if (kind === 'docx') {
    const r = await Docx.convert(await file.arrayBuffer(), onProgress);
    html = await sanitize(r.html, { ADD_ATTR: ['target', 'data-img'] });
    images = r.images; title = r.title; author = r.author; warnings = r.warnings;
  } else {
    const text = decodeText(await file.arrayBuffer());
    html = kind === 'md' ? await mdToHtml(text) : txtToHtml(text);
  }
  const strip = (x) => (x || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
  const titleStyled = strip((html.match(/<h1 class="title"[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  const firstH1 = strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1]);
  const ok = (t) => t && t.length >= 2 && t.length < 140;
  if (kind === 'docx') title = ok(titleStyled) ? titleStyled : (cleanTitle(title, '') || (ok(firstH1) ? firstH1 : ''));
  else if (kind === 'md') title = ok(firstH1) ? firstH1 : '';
  else title = '';
  title = cleanTitle(title, baseName(file.name));
  return { content: { v: 1, kind, html, images }, title, author, words: countWords(html), warnings };
}

async function inspectPdf(file) {
  const pdfjs = await need('pdfjs');
  const data = new Uint8Array(await file.arrayBuffer());
  let pdf;
  try { pdf = await pdfjs.getDocument({ data, ...PDF_OPTS }).promise; } catch (e) {
    if (e && e.name === 'PasswordException') throw new Error('PDF ini dikunci kata sandi. Buka kuncinya dulu, lalu unggah lagi.');
    throw new Error('PDF tidak bisa dibaca (file rusak atau bukan PDF).');
  }
  try {
    const meta = await pdf.getMetadata().catch(() => null);
    const page = await pdf.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const scale = 480 / vp1.width;
    const vp = page.getViewport({ scale });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    const cover = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.84));
    const info = meta && meta.info ? meta.info : {};
    return { pages: pdf.numPages, title: cleanTitle(info.Title, baseName(file.name)), author: String(info.Author || '').trim().slice(0, 120), aspect: vp1.width / vp1.height, cover };
  } finally { try { pdf.loadingTask.destroy(); } catch (e) { /* ignore */ } }
}
