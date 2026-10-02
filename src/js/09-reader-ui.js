// ---------- reader UI: panels, bookmarks, highlights, notes, search, settings ----------
const COLORS = [{ id: 'y', label: 'Kuning' }, { id: 'g', label: 'Hijau' }, { id: 'b', label: 'Biru' }, { id: 'p', label: 'Merah muda' }];

function pageOfAnn(a) {
  if (!R.src) return a.page || 0;
  if (R.src.kind === 'pdf') return a.page || 0;
  if (a.anchor) return R.src.pageOfAnchor(a.anchor);
  if (a.range) return R.src.pageOfAnchor({ b: a.range.b1, o: a.range.o1 });
  return a.page || 0;
}
function annsForPage(i) {
  if (R.src && R.src.kind === 'flow') return R.ann.filter((a) => a.type === 'highlight');
  return R.ann.filter((a) => a.page === i);
}
function bookmarksOnPage(i) { return R.ann.filter((a) => a.type === 'bookmark' && pageOfAnn(a) === i); }
function decoratePage(el, i) {
  if (!R.src) return;
  const old = el.querySelector(':scope > .ribbon');
  if (old) old.remove();
  if (bookmarksOnPage(i).length) el.append(h('div', { class: 'ribbon', title: 'Halaman bertanda' }));
  R.src.decorate && R.src.decorate(el, i, annsForPage(i), R.search);
}
function refreshDecor() {
  for (const [i, el] of R.pages) decoratePage(el, i);
  for (const i of visiblePages()) { const el = R.pages.get(i); if (el) R.src.onShow && R.src.onShow(el, i); }
  updateBookmarkUI();
}
function updateBookmarkUI() {
  if (!R.open || !R.src) return;
  const on = visiblePages().some((i) => bookmarksOnPage(i).length);
  const b = $('#rMark');
  b.setAttribute('aria-pressed', String(on));
  b.setAttribute('aria-label', on ? 'Hapus penanda halaman ini' : 'Tandai halaman ini');
  setIcon(b, on ? 'bookmark-fill' : 'bookmark');
}
async function saveAnn(ann) {
  ann.updatedAt = Date.now();
  const i = R.ann.findIndex((x) => x.id === ann.id);
  if (i >= 0) R.ann[i] = ann; else R.ann.push(ann);
  refreshDecor();
  if (Panel.kind === 'nav') Panel.render();
  if (R.temp) return true;
  try { await Store.putAnn(R.bookId, ann); return true; } catch (e) { toast(dbErrorText(e)); return false; }
}
async function removeAnn(id, undo = true) {
  const a = R.ann.find((x) => x.id === id);
  if (!a) return;
  R.ann = R.ann.filter((x) => x.id !== id);
  refreshDecor();
  if (Panel.kind === 'nav') Panel.render();
  if (!R.temp) Store.deleteAnn(R.bookId, id).catch((e) => toast(dbErrorText(e)));
  if (undo) toast(a.type === 'bookmark' ? 'Penanda dihapus.' : a.type === 'note' ? 'Catatan dihapus.' : 'Sorotan dihapus.', { action: 'Urungkan', onAction: () => saveAnn({ ...a }) });
}
function toggleBookmark() {
  if (!R.open || !R.N) return;
  const vis = visiblePages();
  const existing = vis.flatMap((i) => bookmarksOnPage(i));
  if (existing.length) { existing.forEach((b) => removeAnn(b.id, false)); toast('Penanda dihapus.', { ms: 1800 }); return; }
  const i = vis[0];
  const label = R.src.labelOf ? R.src.labelOf(i) : String(i + 1);
  const snippet = '';
  const ann = { id: uid('a'), type: 'bookmark', page: i, anchor: R.src.anchorOf(i), label, text: snippet, createdAt: Date.now() };
  saveAnn(ann);
  R.src.textOf(i).then((t) => { const s = t.replace(/\s+/g, ' ').trim().slice(0, 140); if (s) { ann.text = s; saveAnn(ann); } }).catch(() => {});
  toast('Halaman ' + label + ' ditandai.', { ms: 1800 });
}

// ----- selection toolbar -----
let selRange = null;
function hideSelBar() { const b = $('#selBar'); if (b) b.hidden = true; selRange = null; }
function onSelectionChange() {
  if (!R.open || !R.src) return;
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hideSelBar(); return; }
  const range = sel.getRangeAt(0);
  const node = range.commonAncestorContainer;
  const el = node.nodeType === 1 ? node : node.parentElement;
  if (!el || !R.els.stage.contains(el)) return;
  if (!sel.toString().trim()) return;
  selRange = range.cloneRange();
  showSelBar(range);
}
function showSelBar(range) {
  const bar = $('#selBar');
  bar.replaceChildren();
  for (const c of COLORS) bar.append(h('button', { type: 'button', class: 'dot ' + c.id, 'aria-label': 'Sorot ' + c.label.toLowerCase(), title: 'Sorot ' + c.label.toLowerCase(), onclick: () => addHighlight(c.id, false) }));
  bar.append(h('span', { class: 'sep' }));
  bar.append(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sorot dan beri catatan', title: 'Catatan', onclick: () => addHighlight('y', true) }, icon('note')));
  bar.append(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Salin', title: 'Salin', onclick: async () => { const t = selText(); if (await copyText(t)) toast('Teks disalin.', { ms: 1500 }); else toast('Gagal menyalin.'); } }, icon('copy')));
  if (TTS.supported()) bar.append(h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bacakan teks ini', title: 'Bacakan', onclick: () => { const t = selText(); hideSelBar(); TTS.speakText(t); } }, icon('speaker')));
  bar.hidden = false;
  const rr = range.getBoundingClientRect();
  const host = R.els.reader.getBoundingClientRect();
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let x = rr.left + rr.width / 2 - bw / 2 - host.left;
  x = clamp(x, 8, host.width - bw - 8);
  const touch = isTouchUI();
  let y = touch ? rr.bottom - host.top + 14 : rr.top - host.top - bh - 10;
  if (!touch && y < 60) y = rr.bottom - host.top + 10;
  if (touch && y + bh > host.height - 70) y = rr.top - host.top - bh - 48;
  bar.style.left = x + 'px'; bar.style.top = clamp(y, 8, host.height - bh - 8) + 'px';
}
function selText() { const s = getSelection(); return ((s && s.toString()) || (selRange && selRange.toString()) || '').replace(/\s+\n/g, '\n').trim(); }
async function addHighlight(color, withNote) {
  const sel = getSelection();
  const range = sel && sel.rangeCount && !sel.isCollapsed ? sel.getRangeAt(0) : selRange;
  if (!range) return;
  const raw = sel && sel.rangeCount && !sel.isCollapsed ? sel.toString() : range.toString();
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 1500);
  let ann = null;
  if (R.src.kind === 'flow') {
    const a1 = R.src.anchorFromBoundary(range.startContainer, range.startOffset, 'start');
    const a2 = R.src.anchorFromBoundary(range.endContainer, range.endOffset, 'end');
    if (!a1 || !a2 || (a2.b < a1.b) || (a2.b === a1.b && a2.o <= a1.o)) { toast('Pilih teks di dalam halaman buku.'); return; }
    const page = R.src.pageOfAnchor(a1);
    ann = { id: uid('a'), type: 'highlight', color, text, range: { b1: a1.b, o1: a1.o, b2: a2.b, o2: a2.o }, anchor: a1, page, label: String(page + 1), createdAt: Date.now() };
  } else {
    const startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const pg = startEl && startEl.closest('.page[data-i]');
    const box = pg && pg.querySelector('.pdfbox');
    if (!box) { toast('Pilih teks di dalam halaman.'); return; }
    const i = +pg.dataset.i;
    const rects = R.src.rectsFromRange(range, box);
    if (!rects.length) { toast('Teks ini tidak bisa disorot.'); return; }
    ann = { id: uid('a'), type: 'highlight', color, text, page: i, rects, label: R.src.labelOf(i), createdAt: Date.now() };
  }
  sel && sel.removeAllRanges();
  hideSelBar();
  await saveAnn(ann);
  if (withNote) editNote(ann.id);
}
function openAnnPopover(id, x, y) {
  const a = R.ann.find((v) => v.id === id);
  if (!a) return;
  const items = COLORS.filter((c) => c.id !== a.color).map((c) => ({ icon: 'highlight', label: 'Ubah ke ' + c.label.toLowerCase(), onClick: () => saveAnn({ ...a, color: c.id }) }));
  showMenu({ x, y: y + 12 }, [
    { icon: 'note', label: a.note ? 'Ubah catatan' : 'Tambah catatan', onClick: () => editNote(id) },
    ...items, 'sep',
    { icon: 'copy', label: 'Salin teks', onClick: async () => { if (await copyText(a.text || '')) toast('Teks disalin.', { ms: 1500 }); } },
    { icon: 'trash', label: 'Hapus sorotan', danger: true, onClick: () => removeAnn(id) },
  ].filter(Boolean), { title: a.text ? '“' + a.text.slice(0, 60) + (a.text.length > 60 ? '…' : '') + '”' : 'Sorotan' });
}
function editNote(id, pageForNew) {
  let a = id ? R.ann.find((v) => v.id === id) : null;
  const ta = h('textarea', { class: 'textarea', id: 'noteText', rows: '6', placeholder: 'Tulis catatan…', autofocus: true });
  ta.value = (a && a.note) || '';
  const body = h('div', { class: 'field' });
  if (a && a.text) body.append(h('p', { style: { borderLeft: '4px solid var(--brass)', paddingLeft: '10px', fontSize: '14px' }, text: '“' + a.text.slice(0, 400) + (a.text.length > 400 ? '…' : '') + '”' }));
  body.append(h('label', { class: 'sr', for: 'noteText', text: 'Catatan' }), ta);
  const m = Modal.open({
    title: a ? (a.note ? 'Ubah catatan' : 'Tambah catatan') : 'Catatan halaman ' + ((pageForNew ?? 0) + 1),
    body,
    actions: [
      { label: 'Batal' },
      { label: 'Simpan', kind: 'primary', onClick: async () => {
        const note = ta.value.trim();
        if (a) await saveAnn({ ...a, note });
        else if (note) {
          const i = pageForNew ?? firstPageOfView(R.view);
          await saveAnn({ id: uid('a'), type: 'note', page: i, anchor: R.src.anchorOf(i), label: R.src.labelOf ? R.src.labelOf(i) : String(i + 1), note, text: '', createdAt: Date.now() });
        }
        toast('Catatan disimpan.', { ms: 1500 });
      } },
    ],
  });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); m.el.querySelector('footer .btn.primary').click(); } });
}

// ----- panels -----
const Panel = { kind: null, render: null, refreshCurrent: null, tab: 'toc', cleanup: null };
function openPanel(kind, title, build, opts = {}) {
  if (Panel.cleanup) { try { Panel.cleanup(); } catch (e) { /* ignore */ } Panel.cleanup = null; }
  const el = $('#panel');
  el.className = 'panel' + (opts.tall ? ' tall' : '');
  el.setAttribute('aria-label', title);
  const head = h('div', { class: 'panel-head' }, h('h2', { text: title }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup panel', onclick: closePanel }, icon('x')));
  const grab = h('div', { class: 'grab' });
  el.replaceChildren(grab, head);
  Panel.kind = kind; Panel.render = null; Panel.refreshCurrent = null;
  build(el);
  el.hidden = false;
  bindSheetDrag(el, grab, head);
  hideSelBar();
}
function closePanel() {
  const el = $('#panel');
  if (!el || el.hidden) { Panel.kind = null; return; }
  if (Panel.cleanup) { try { Panel.cleanup(); } catch (e) { /* ignore */ } Panel.cleanup = null; }
  el.hidden = true; el.replaceChildren();
  Panel.kind = null; Panel.render = null; Panel.refreshCurrent = null;
  if (R.open) R.els.stage.focus({ preventScroll: true });
}
function bindSheetDrag(panel, ...handles) {
  for (const hd of handles) {
    hd.addEventListener('pointerdown', (e) => {
      if (!narrow() || e.target.closest('button')) return;
      const y0 = e.clientY;
      let dy = 0;
      const move = (ev) => { dy = Math.max(0, ev.clientY - y0); panel.style.transform = `translateY(${dy}px)`; };
      const up = () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up);
        panel.style.transform = '';
        if (dy > 90) closePanel();
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    });
  }
}

// navigation panel: contents / bookmarks / notes / pages
function openNavPanel(tab) {
  if (!R.src) return;
  Panel.tab = tab || Panel.tab || 'toc';
  openPanel('nav', 'Navigasi', (el) => {
    const tabs = h('div', { class: 'tabs', role: 'tablist' });
    const body = h('div', { class: 'panel-body' });
    const defs = [['toc', 'Daftar isi'], ['marks', 'Penanda'], ['notes', 'Sorotan & catatan']];
    if (R.src.kind === 'pdf') defs.push(['pages', 'Halaman']);
    for (const [id, label] of defs) {
      tabs.append(h('button', { type: 'button', role: 'tab', 'aria-selected': String(Panel.tab === id), onclick: () => { Panel.tab = id; render(); } }, label));
    }
    el.append(tabs, body);
    let thumbObs = null;
    const render = () => {
      for (const b of tabs.children) b.setAttribute('aria-selected', String(defs[[...tabs.children].indexOf(b)][0] === Panel.tab));
      if (thumbObs) { thumbObs.disconnect(); thumbObs = null; }
      body.replaceChildren();
      if (Panel.tab === 'toc') renderToc(body);
      else if (Panel.tab === 'marks') renderMarks(body);
      else if (Panel.tab === 'notes') renderNotes(body);
      else thumbObs = renderThumbs(body);
    };
    Panel.render = render;
    Panel.refreshCurrent = () => {
      const cur = firstPageOfView(R.view);
      if (Panel.tab === 'toc') {
        let best = null;
        for (const b of body.querySelectorAll('.toc-list button')) { b.classList.remove('cur'); if (+b.dataset.page <= cur) best = b; }
        if (best) best.classList.add('cur');
      } else if (Panel.tab === 'pages') {
        for (const t of body.querySelectorAll('.thumb')) t.classList.toggle('cur', +t.dataset.i === cur || +t.dataset.i === lastPageOfView(R.view));
      }
    };
    Panel.cleanup = () => { if (thumbObs) thumbObs.disconnect(); };
    render();
  }, { tall: true });
}
async function renderToc(body) {
  body.append(h('div', { class: 'empty-small' }, h('div', { class: 'spin' })));
  let toc = [];
  try { toc = await R.src.toc(); } catch (e) { toc = []; }
  if (Panel.tab !== 'toc' || !body.isConnected) return;
  body.replaceChildren();
  if (!toc.length) {
    body.append(h('div', { class: 'empty-small' }, icon('list'), h('div', { text: 'Dokumen ini tidak memiliki daftar isi.' }), R.src.kind === 'pdf' ? h('button', { class: 'btn small', type: 'button', text: 'Lihat semua halaman', onclick: () => { Panel.tab = 'pages'; Panel.render(); } }) : null));
    return;
  }
  const ul = h('ul', { class: 'toc-list' });
  for (const t of toc) {
    ul.append(h('li', null, h('button', { type: 'button', class: 'lv' + Math.min(4, t.level), 'data-page': t.page ?? -1, onclick: () => { if (t.page != null) { goToPage(t.page, { flash: true }); if (narrow()) closePanel(); } } },
      h('span', { text: t.title }), h('span', { class: 'pg', text: t.page != null ? String(t.page + 1) : '' }))));
  }
  body.append(ul);
  Panel.refreshCurrent && Panel.refreshCurrent();
  const cur = body.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
}
function annCard(a) {
  const page = pageOfAnn(a);
  const typeLabel = a.type === 'bookmark' ? 'Penanda' : a.type === 'note' ? 'Catatan halaman' : 'Sorotan';
  const card = h('div', { class: 'ann' });
  card.append(h('div', { class: 'ann-top' },
    icon(a.type === 'bookmark' ? 'bookmark' : a.type === 'note' ? 'note' : 'highlight'),
    h('span', { text: `${typeLabel} · Hal. ${page + 1}` }),
    h('span', { text: '· ' + fmtDate(a.updatedAt || a.createdAt) }),
    h('button', { class: 'btn small ghost go', type: 'button', text: 'Buka', onclick: () => { goToPage(page, { flash: true }); if (narrow()) closePanel(); } })));
  if (a.text) card.append(h('q', { class: a.type === 'highlight' ? (a.color || 'y') : '', text: a.text }));
  if (a.note) card.append(h('div', { class: 'note', text: a.note }));
  const acts = h('div', { class: 'ann-actions' });
  if (a.type !== 'bookmark') acts.append(h('button', { class: 'btn small ghost', type: 'button', onclick: () => editNote(a.id) }, icon('edit'), a.note ? 'Ubah' : 'Catatan'));
  acts.append(h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Hapus', onclick: () => removeAnn(a.id) }, icon('trash'), 'Hapus'));
  card.append(acts);
  return card;
}
function renderMarks(body) {
  const list = R.ann.filter((a) => a.type === 'bookmark').sort((a, b) => pageOfAnn(a) - pageOfAnn(b));
  const top = h('div', { class: 'ann-filter' }, h('button', { class: 'btn small', type: 'button', onclick: toggleBookmark }, icon('bookmark'), 'Tandai halaman ini'));
  body.append(top);
  if (!list.length) { body.append(h('div', { class: 'empty-small' }, icon('bookmark'), h('div', { text: 'Belum ada penanda. Ketuk ikon pita di atas atau tekan B.' }))); return; }
  const wrap = h('div', { class: 'ann-list' });
  list.forEach((a) => wrap.append(annCard(a)));
  body.append(wrap);
}
let notesFilter = 'all';
function renderNotes(body) {
  const bar = h('div', { class: 'ann-filter' });
  for (const [id, label] of [['all', 'Semua'], ['highlight', 'Sorotan'], ['note', 'Dengan catatan']]) {
    bar.append(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(notesFilter === id), text: label, onclick: () => { notesFilter = id; Panel.render(); } }));
  }
  body.append(bar);
  const tools = h('div', { class: 'ann-filter' },
    h('button', { class: 'btn small', type: 'button', onclick: () => editNote(null, firstPageOfView(R.view)) }, icon('plus'), 'Catatan halaman'),
    h('button', { class: 'btn small', type: 'button', onclick: () => exportNotes(R.book || { title: R.els.title.textContent }, R.ann) }, icon('download'), 'Ekspor .md'));
  body.append(tools);
  let list = R.ann.filter((a) => a.type !== 'bookmark');
  if (notesFilter === 'highlight') list = list.filter((a) => a.type === 'highlight');
  if (notesFilter === 'note') list = list.filter((a) => a.note);
  list.sort((a, b) => pageOfAnn(a) - pageOfAnn(b) || (a.createdAt || 0) - (b.createdAt || 0));
  if (!list.length) { body.append(h('div', { class: 'empty-small' }, icon('highlight'), h('div', { text: 'Belum ada sorotan. Pilih teks di halaman, lalu pilih warna.' }))); return; }
  const wrap = h('div', { class: 'ann-list' });
  list.forEach((a) => wrap.append(annCard(a)));
  body.append(wrap);
}
function renderThumbs(body) {
  const grid = h('div', { class: 'thumbs' });
  body.append(grid);
  const cur = firstPageOfView(R.view);
  const obs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const t = en.target; obs.unobserve(t);
      const c = t.querySelector('canvas');
      R.src.renderThumb(+t.dataset.i, c, 110).catch(() => {});
    }
  }, { root: body, rootMargin: '300px' });
  for (let i = 0; i < R.N; i++) {
    const c = h('canvas');
    const t = h('button', { class: 'thumb' + (i === cur ? ' cur' : ''), type: 'button', 'data-i': i, 'aria-label': 'Halaman ' + (i + 1), onclick: () => { goToPage(i); if (narrow()) closePanel(); } },
      h('div', { class: 'tbox', style: { '--ar': String(R.src.aspect || 0.707) } }, c), h('span', { text: String(i + 1) }));
    grid.append(t);
    obs.observe(t);
  }
  setTimeout(() => { const el = grid.querySelector('.cur'); if (el) el.scrollIntoView({ block: 'center' }); }, 30);
  return obs;
}

async function exportNotes(book, anns) {
  const list = anns.filter((a) => a.type !== 'bookmark' || a.note).slice().sort((a, b) => (a._page ?? pageOfAnnSafe(a)) - (b._page ?? pageOfAnnSafe(b)));
  const marks = anns.filter((a) => a.type === 'bookmark');
  let md = `# Catatan — ${book.title || 'Buku'}\n\n`;
  if (book.author) md += `Penulis: ${book.author}\n\n`;
  md += `_Diekspor dari DigiBook pada ${fmtDate(Date.now(), true)}._\n\n`;
  if (!list.length && !marks.length) md += 'Belum ada catatan.\n';
  let lastPage = null;
  for (const a of list) {
    const p = (a._page ?? pageOfAnnSafe(a)) + 1;
    if (p !== lastPage) { md += `\n## Halaman ${p}\n\n`; lastPage = p; }
    if (a.text) md += `> ${a.text.replace(/\n/g, '\n> ')}\n\n`;
    if (a.note) md += `${a.note}\n\n`;
    md += `<sub>${a.type === 'note' ? 'Catatan halaman' : 'Sorotan ' + ((COLORS.find((c) => c.id === a.color) || COLORS[0]).label.toLowerCase())} · ${fmtDate(a.updatedAt || a.createdAt)}</sub>\n\n`;
  }
  if (marks.length) {
    md += `\n## Penanda\n\n`;
    for (const b of marks.sort((x, y) => pageOfAnnSafe(x) - pageOfAnnSafe(y))) md += `- Halaman ${pageOfAnnSafe(b) + 1}${b.text ? ' — ' + b.text.slice(0, 100) : ''}\n`;
  }
  const name = `Catatan - ${(book.title || 'Buku').replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 80)}.md`;
  await offerDownload(name, md, md);
}
function pageOfAnnSafe(a) { try { return R.open && R.book && a && R.ann.includes(a) ? pageOfAnn(a) : (a.page || 0); } catch (e) { return a.page || 0; } }
async function offerDownload(filename, data) {
  try {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/octet-stream' }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('File siap: ' + filename, { ms: 2500 });
    return true;
  } catch (e) { toast('Gagal mengunduh file.'); return false; }
}

// ----- search -----
const Search = { gen: 0 };
function openSearchPanel(prefill) {
  if (!R.src) return;
  openPanel('search', 'Cari di buku', (el) => {
    const input = h('input', { class: 'input', type: 'search', id: 'searchInput', placeholder: 'Kata atau frasa…', autocomplete: 'off', enterkeyhint: 'search' });
    input.value = prefill || R.search || '';
    const status = h('div', { class: 'hint', 'aria-live': 'polite' });
    const results = h('div', { class: 'results' });
    const run = () => runSearch(input.value.trim(), results, status);
    const form = h('form', { class: 'search-box', onsubmit: (e) => { e.preventDefault(); run(); } },
      h('label', { class: 'sr', for: 'searchInput', text: 'Kata yang dicari' }), input,
      h('button', { class: 'btn primary', type: 'submit', 'aria-label': 'Cari' }, icon('search')));
    const clear = h('button', { class: 'btn small ghost', type: 'button', text: 'Hapus tanda pencarian', onclick: () => { R.search = ''; Search.gen++; input.value = ''; results.replaceChildren(); status.textContent = ''; refreshDecor(); } });
    const body = h('div', { class: 'panel-body' }, form, h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '6px' } }, status, clear), results);
    el.append(body);
    setTimeout(() => input.focus(), 50);
    if (input.value) run();
    Panel.cleanup = () => { Search.gen++; };
  });
}
async function runSearch(term, results, status) {
  const gen = ++Search.gen;
  results.replaceChildren();
  if (term.length < 2) { status.textContent = 'Ketik minimal 2 huruf.'; return; }
  R.search = term;
  refreshDecor();
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  let count = 0;
  const N = R.N;
  for (let i = 0; i < N; i++) {
    if (gen !== Search.gen || !R.open) return;
    if (i % 4 === 0) { status.textContent = `Mencari… hal. ${i + 1}/${N}`; await sleep(0); }
    let t = '';
    try { t = await R.src.textOf(i); } catch (e) { continue; }
    const flat = t.replace(/\s+/g, ' ');
    re.lastIndex = 0;
    let m, perPage = 0;
    while ((m = re.exec(flat)) && perPage < 3) {
      perPage++; count++;
      const s = Math.max(0, m.index - 50), e = Math.min(flat.length, m.index + m[0].length + 70);
      const snip = h('div');
      snip.append((s > 0 ? '…' : '') + flat.slice(s, m.index), h('mark', { text: m[0] }), flat.slice(m.index + m[0].length, e) + (e < flat.length ? '…' : ''));
      const page = i;
      results.append(h('button', { class: 'result', type: 'button', onclick: () => { goToPage(page, { flash: true }); if (narrow()) closePanel(); } }, h('span', { class: 'pg', text: 'Hal. ' + (page + 1) }), snip));
      if (count >= 300) break;
    }
    if (count >= 300) break;
  }
  if (gen !== Search.gen) return;
  status.textContent = count ? `${count >= 300 ? '300+' : count} hasil untuk “${term}”` : `Tidak ada hasil untuk “${term}”.`;
}

// ----- appearance settings -----
function openSettingsPanel() {
  if (!R.src) return;
  openPanel('settings', 'Tampilan', (el) => {
    const body = h('div', { class: 'panel-body' });
    const s = R.set;
    const set = (k, v, relay) => { R.set[k] = v; applyReaderSettings(); if (relay) relayout(); else if (k === 'pdfInvert' || k === 'paper') refreshDecor(); saveSettingsSoon(); build(); };
    const build = () => {
      body.replaceChildren();
      const papers = h('div', { class: 'papers', role: 'group', 'aria-label': 'Warna kertas' });
      for (const p of PAPERS) {
        papers.append(h('button', { type: 'button', class: 'paper-opt', 'aria-pressed': String(s.paper === p.id), style: { background: p.id === 'auto' ? 'linear-gradient(135deg, #fbfbf8 50%, #1c1f1e 50%)' : p.bg, color: p.id === 'auto' ? '#777' : p.fg }, onclick: () => set('paper', p.id) },
          h('span', null, 'Aa', h('small', { text: p.label }))));
      }
      body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Kertas' }), papers));
      if (R.src.kind === 'flow') {
        const fonts = h('div', { class: 'opt-row' });
        for (const [id, f] of Object.entries(FONTS)) fonts.append(h('button', { type: 'button', class: 'chip font-opt', 'aria-pressed': String(s.font === id), style: { fontFamily: f.css }, text: f.label, onclick: () => { if (f.gf) ensureFont(f.gf); set('font', id, true); } }));
        const size = effectiveFontSize();
        const stepper = h('div', { class: 'stepper' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Perkecil huruf', onclick: () => set('size', clamp(size - 1, 12, 30), true) }, icon('minus')),
          h('output', { text: size + ' px' }),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Perbesar huruf', onclick: () => set('size', clamp(size + 1, 12, 30), true) }, icon('plus')));
        const opts = (key, list) => { const row = h('div', { class: 'opt-row' }); for (const [v, label] of list) row.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s[key] === v), text: label, onclick: () => set(key, v, true) })); return row; };
        body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Huruf' }), fonts, stepper));
        body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Spasi baris' }), opts('lh', [[1.4, 'Rapat'], [1.6, 'Sedang'], [1.8, 'Longgar']])));
        body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Margin' }), opts('margin', [['s', 'Sempit'], ['m', 'Sedang'], ['l', 'Lebar']])));
        body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Perataan & paragraf' }), opts('align', [['auto', 'Otomatis'], ['justify', 'Rata kiri-kanan'], ['left', 'Rata kiri']]), opts('para', [['space', 'Berjarak'], ['indent', 'Inden seperti buku']])));
      }
      const lay = h('div', { class: 'opt-row' });
      for (const [v, label, ic] of [['auto', 'Otomatis', 'book-open'], ['single', '1 halaman', 'single'], ['spread', '2 halaman', 'spread']]) lay.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.layout === v), onclick: () => set('layout', v, true) }, icon(ic), label));
      const fx = h('div', { class: 'opt-row' });
      for (const [v, label] of [['flip', 'Lipat 3D'], ['slide', 'Geser'], ['none', 'Tanpa animasi']]) fx.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.fx === v), text: label, onclick: () => set('fx', v) }));
      body.append(h('div', { class: 'set-group' }, h('h3', { text: 'Tata letak' }), lay, h('h3', { text: 'Efek balik halaman' }), fx));
      const sw = (key, label, hint) => {
        const id = 'sw-' + key;
        const inp = h('input', { type: 'checkbox', id, role: 'switch' });
        inp.checked = !!s[key];
        inp.addEventListener('change', () => { set(key, inp.checked); if (key === 'wake') { if (inp.checked) Wake.on(); else Wake.off(); } if (key === 'sound' && inp.checked) Sound.play(); });
        return h('label', { class: 'switch', for: id }, h('span', null, label, hint ? h('div', { class: 'hint', text: hint }) : null), inp);
      };
      const g = h('div', { class: 'set-group' }, h('h3', { text: 'Lainnya' }),
        sw('tapZones', 'Ketuk tepi untuk membalik halaman', 'Ketuk sisi kiri/kanan layar; ketuk tengah untuk menampilkan menu.'),
        sw('sound', 'Suara kertas saat membalik'),
        navigator.wakeLock ? sw('wake', 'Layar tetap menyala saat membaca') : null,
        R.src.kind === 'pdf' ? sw('pdfInvert', 'Balik warna PDF pada kertas Malam', 'Halaman PDF dibuat gelap saat kertas Malam dipilih.') : null);
      body.append(g);
    };
    build();
    el.append(body);
  });
}

// ----- menus & dialogs -----
function openReaderMenu(anchor) {
  const fsOK = document.fullscreenEnabled;
  showMenu(anchor, [
    { icon: 'list', label: 'Daftar isi & penanda', kbd: 'T', onClick: () => openNavPanel('toc') },
    { icon: 'search', label: 'Cari di buku', kbd: '/', onClick: () => openSearchPanel() },
    { icon: 'highlight', label: 'Sorotan & catatan', kbd: 'N', onClick: () => openNavPanel('notes') },
    TTS.supported() ? { icon: 'speaker', label: TTS.active ? 'Hentikan bacaan' : 'Bacakan halaman', kbd: 'S', onClick: () => TTS.toggle() } : null,
    R.src && R.src.kind === 'pdf' ? { icon: 'zoom-in', label: 'Perbesar halaman', kbd: 'Z', onClick: () => openZoomPage(firstPageOfView(R.view), 2) } : null,
    { icon: 'hash', label: 'Ke halaman…', kbd: 'G', onClick: openGoToPage },
    'sep',
    fsOK ? { icon: document.fullscreenElement ? 'shrink' : 'expand', label: document.fullscreenElement ? 'Keluar layar penuh' : 'Layar penuh', kbd: 'F', onClick: toggleFullscreen } : null,
    { icon: 'focus', label: R.chromeHidden ? 'Tampilkan kontrol' : 'Mode fokus', kbd: 'M', onClick: () => setChrome(!R.chromeHidden) },
    { icon: 'info', label: 'Info buku', onClick: () => R.temp ? toast('Buku ini dibuka sementara.') : showBookDetails(R.bookId) },
    !R.temp && R.book ? { icon: 'download', label: 'Unduh file asli', onClick: () => downloadOriginal(R.book) } : null,
    !isTouchUI() ? { icon: 'keyboard', label: 'Pintasan keyboard', kbd: '?', onClick: showKeyHelp } : null,
  ].filter(Boolean), { title: 'Menu bacaan' });
}
function openGoToPage() {
  if (!R.src) return;
  const inp = h('input', { class: 'input', type: 'number', id: 'gotoInput', min: '1', max: String(R.N), inputmode: 'numeric', autofocus: true });
  inp.value = String(firstPageOfView(R.view) + 1);
  const m = Modal.open({
    title: 'Ke halaman',
    body: h('label', { class: 'field', for: 'gotoInput' }, h('span', { text: `Nomor halaman (1–${R.N})` }), inp),
    actions: [{ label: 'Batal' }, { label: 'Buka', kind: 'primary', onClick: () => { const n = parseInt(inp.value, 10); if (!(n >= 1 && n <= R.N)) { inp.focus(); toast(`Masukkan angka 1 sampai ${R.N}.`); return false; } goToPage(n - 1, { flash: true }); } }],
  });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.el.querySelector('footer .btn.primary').click(); } });
  setTimeout(() => inp.select(), 60);
}
function showKeyHelp() {
  const rows = [
    ['→ / Spasi / PgDn', 'Halaman berikutnya'], ['← / Shift+Spasi / PgUp', 'Halaman sebelumnya'], ['Home / End', 'Halaman pertama / terakhir'],
    ['G', 'Ke halaman tertentu'], ['B', 'Tandai halaman'], ['T', 'Daftar isi'], ['N', 'Sorotan & catatan'], ['/', 'Cari di buku'],
    ['+ / −', 'Ukuran huruf (Word/teks) atau perbesar (PDF)'], ['Z', 'Perbesar halaman PDF'], ['S', 'Bacakan halaman'],
    ['F', 'Layar penuh'], ['M', 'Mode fokus'], ['Esc', 'Tutup panel / kembali ke rak'],
  ];
  const grid = h('div', { class: 'keys' });
  for (const [k, d] of rows) grid.append(h('div', null, ...k.split(' / ').map((x, i) => [i ? ' ' : '', h('kbd', { text: x })])), h('div', { text: d }));
  Modal.open({ title: 'Pintasan keyboard', body: grid, actions: [{ label: 'Tutup', kind: 'primary' }] });
}
