// ---------- library: shelf, uploads, details ----------
const CLOTH = ['#2b5a49', '#7a2e2a', '#23395b', '#7d611c', '#4b3a63', '#3f4a52', '#5c3d2e', '#2f5f6b'];
const MAX_FILE = 150 * 1048576;

function bookStatus(b) {
  const p = S.progress.get(b.id);
  if (p && p.status === 'done') return 'done';
  if (p && ((p.pct || 0) > 0 || (p.page || 0) > 0)) return 'reading';
  return 'new';
}
function canAddBooks() { return Files.kind === 'local'; }
function canEditBooks() { return true; }
function kindMeta(b) {
  const k = KIND_LABEL[b.kind] || b.kind;
  if (b.kind === 'pdf' && b.pages) return `${k} · ${b.pages} hlm`;
  if (b.words) return `${k} · ${b.words >= 1000 ? NF1.format(b.words / 1000) + 'rb' : b.words} kata`;
  return k;
}
const localCoverUrls = new Map();
function coverEl(b, opts = {}) {
  const p = S.progress.get(b.id) || {};
  const st = bookStatus(b);
  const gen = () => {
    const c = CLOTH[(b.coverColor != null ? b.coverColor : hashStr(b.title || b.id)) % CLOTH.length];
    return h('div', { class: 'cover gen cloth', style: { '--c': c } },
      h('div', null, h('div', { class: 'ct', text: b.title || 'Tanpa judul' }), h('div', { class: 'orn' }), b.author ? h('div', { class: 'ca', text: b.author }) : null),
      h('div', { class: 'cf', text: KIND_LABEL[b.kind] || '' }));
  };
  let el;
  if (b.cover) {
    const ar = clamp(b.coverAspect || 0.7, 0.5, 1.4);
    el = h('div', { class: 'cover', style: { aspectRatio: String(ar) } });
    const img = h('img', { alt: '', loading: 'lazy', decoding: 'async' });
    img.onerror = () => { const g = gen(); g.append(...el.querySelectorAll('.ribbon-peek, .done-stamp, .fav-star')); el.replaceWith(g); };
    const u = localCoverUrls.get(b.cover);
    if (u) img.src = u;
    else Files.get({ id: b.cover }).then((blob) => { const url = URL.createObjectURL(blob); localCoverUrls.set(b.cover, url); img.src = url; }).catch(() => img.onerror());
    el.append(img);
  } else el = gen();
  if (!opts.plain) {
    if (st === 'reading') el.append(h('div', { class: 'ribbon-peek', title: 'Sedang dibaca' }));
    if (st === 'done') el.append(h('div', { class: 'stamp done-stamp', text: 'Selesai' }));
    if (p.fav) el.append(h('div', { class: 'fav-star', title: 'Favorit' }, icon('star-fill')));
  }
  return el;
}

const Lib = {
  ui: { q: '', filter: 'all', shelf: null, sort: LS.get('sort', 'recent'), view: LS.get('view', 'grid') },
  init() {
    $('#btnUpload').onclick = () => Up.open();
    $('#btnOpenLocal').onclick = () => $('#localInput').click();
    $('#btnLibMenu').onclick = (e) => openLibMenu(e.currentTarget);
    $('#fileInput').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) startUpload(fs); });
    $('#localInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) openLocalFile(f); });
    const q = $('#q');
    q.addEventListener('input', debounce(() => { this.ui.q = q.value; this.render(); }, 120));
    const sort = $('#sortSel');
    sort.value = this.ui.sort;
    sort.addEventListener('change', () => { this.ui.sort = sort.value; LS.set('sort', sort.value); this.render(); });
    $('#viewGrid').onclick = () => { this.ui.view = 'grid'; LS.set('view', 'grid'); this.render(); };
    $('#viewList').onclick = () => { this.ui.view = 'list'; LS.set('view', 'list'); this.render(); };
    // drag & drop anywhere on the library
    let dragDepth = 0;
    addEventListener('dragenter', (e) => { if (R.open || !e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return; dragDepth++; $('#libMain').classList.add('drop-glow'); });
    addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#libMain').classList.remove('drop-glow'); });
    addEventListener('dragover', (e) => { if (!R.open && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
    addEventListener('drop', (e) => {
      if (R.open || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); dragDepth = 0; $('#libMain').classList.remove('drop-glow');
      if (Up.m && Up.m.el.isConnected) return;
      if (canAddBooks()) startUpload([...e.dataTransfer.files]); else openLocalFile(e.dataTransfer.files[0]);
    });
    document.addEventListener('keydown', (e) => {
      if (R.open || Modal.top() || /INPUT|TEXTAREA|SELECT/.test((e.target && e.target.tagName) || '')) return;
      if (e.key === '/') { e.preventDefault(); q.focus(); }
    });
    this.renderSkeleton();
  },
  renderSkeleton() {
    const shelf = $('#shelf');
    shelf.className = 'shelf';
    shelf.replaceChildren();
    for (let i = 0; i < 6; i++) shelf.append(h('div', { class: 'card', 'aria-hidden': 'true' }, h('div', { class: 'slotc' }, h('div', { class: 'cover skel', style: { aspectRatio: '2/3' } })), h('div', { class: 'board' }), h('div', { class: 'card-body' }, h('div', { class: 'skel', style: { height: '12px', width: '80%' } }), h('div', { class: 'skel', style: { height: '10px', width: '50%' } }))));
  },
  setSyncLabel() {
    const el = $('#syncState');
    let cls = '', txt = 'Menyiapkan rak…';
    cls = 'local'; txt = Files.kind === 'local' ? 'Tersimpan di perangkat ini saja' : 'Mode baca sementara';
    el.replaceChildren(h('span', { class: 'sync-dot ' + cls }), txt);
    $('#btnUpload').hidden = !canAddBooks();
  },
  renderBanner() {
    const b = $('#banner');
    let msg = null;
    if (Files.kind !== 'local') msg = [h('b', { text: 'Penyimpanan tidak tersedia. ' }), 'Anda tetap bisa membaca file dari perangkat dengan tombol “Buka file”, tetapi tidak ada yang disimpan.'];
    b.hidden = !msg;
    if (msg) b.replaceChildren(icon('info'), h('div', null, ...msg));
  },
  filtered() {
    const all = [...S.books.values()];
    const q = normText(this.ui.q.trim());
    let list = all.filter((b) => {
      if (q && !normText([b.title, b.author, b.shelf, (b.tags || []).join(' '), b.fileName, b.desc].join(' ')).includes(q)) return false;
      const st = bookStatus(b);
      const p = S.progress.get(b.id) || {};
      switch (this.ui.filter) {
        case 'reading': return st === 'reading';
        case 'new': return st === 'new';
        case 'done': return st === 'done';
        case 'fav': return !!p.fav;
        case 'shelf': return (b.shelf || '') === this.ui.shelf;
        default: return true;
      }
    });
    const lastRead = (b) => { const p = S.progress.get(b.id); return p ? (p.lastOpenedAt || p.updatedAt || 0) : 0; };
    const by = {
      recent: (a, b) => (lastRead(b) - lastRead(a)) || ((b.addedAt || 0) - (a.addedAt || 0)),
      added: (a, b) => (b.addedAt || 0) - (a.addedAt || 0),
      title: (a, b) => (a.title || '').localeCompare(b.title || '', 'id', { sensitivity: 'base', numeric: true }),
      author: (a, b) => (a.author || '~').localeCompare(b.author || '~', 'id', { sensitivity: 'base' }) || (a.title || '').localeCompare(b.title || '', 'id'),
      progress: (a, b) => ((S.progress.get(b.id) || {}).pct || 0) - ((S.progress.get(a.id) || {}).pct || 0),
    }[this.ui.sort] || ((a, b) => 0);
    list.sort(by);
    return { all, list };
  },
  render() {
    if (R.open) return;
    this.setSyncLabel();
    this.renderBanner();
    if (!S.booksLoaded) return;
    const { all, list } = this.filtered();
    this.renderContinue(all);
    this.renderStats();
    this.renderFilters(all);
    $('#viewGrid').setAttribute('aria-pressed', String(this.ui.view === 'grid'));
    $('#viewList').setAttribute('aria-pressed', String(this.ui.view === 'list'));
    $('#countLabel').textContent = list.length === all.length ? plural(all.length, 'buku') : `${list.length} dari ${plural(all.length, 'buku')}`;
    $('#countLabel').parentElement.hidden = all.length === 0;
    const shelf = $('#shelf');
    shelf.className = 'shelf' + (this.ui.view === 'list' ? ' list' : '');
    shelf.replaceChildren(...list.map((b) => this.card(b)));
    const empty = $('#empty');
    if (!all.length) { empty.hidden = false; this.renderEmpty(empty); }
    else if (!list.length) {
      empty.hidden = false;
      empty.replaceChildren(h('h2', { text: 'Tidak ada buku yang cocok' }), h('p', { text: 'Coba kata kunci lain atau tampilkan semua buku.' }),
        h('button', { class: 'btn', type: 'button', text: 'Tampilkan semua', onclick: () => { this.ui.filter = 'all'; this.ui.q = ''; $('#q').value = ''; this.render(); } }));
    } else empty.hidden = true;
  },
  renderEmpty(empty) {
    const art = h('div', { class: 'empty-art', 'aria-hidden': 'true' }, h('div', { class: 'eboard' }));
    const spec = [[18, 26, 86, '#2b5a49'], [48, 22, 98, '#7a2e2a'], [74, 30, 78, '#23395b'], [108, 20, 92, '#7d611c']];
    for (const [x, w, hh, c] of spec) art.append(h('div', { class: 'eb cloth', style: { left: x + 'px', width: w + 'px', height: hh + 'px', '--c': c } }));
    art.append(h('div', { class: 'eb cloth', style: { left: '136px', width: '22px', height: '84px', '--c': '#4b3a63', transform: 'rotate(14deg)', transformOrigin: 'bottom left' } }));
    const kids = [art, h('h2', { text: 'Rak Anda masih kosong' }),
      h('p', { text: 'Unggah PDF, Word (.docx), Markdown, atau teks. Buku tersimpan di perangkat ini, lengkap dengan posisi baca terakhir.' })];
    const row = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' } });
    if (canAddBooks()) row.append(h('button', { class: 'btn primary', type: 'button', onclick: () => Up.open() }, icon('upload'), 'Unggah dokumen'));
    row.append(h('button', { class: 'btn', type: 'button', onclick: () => $('#localInput').click() }, icon('book-open'), 'Buka file tanpa menyimpan'));
    kids.push(row);
    empty.replaceChildren(...kids);
  },
  card(b) {
    const p = S.progress.get(b.id) || {};
    const st = bookStatus(b);
    const pct = Math.round((p.pct || 0) * 100);
    let meta = kindMeta(b);
    if (st === 'reading') meta = `${pct}% · ${fmtRel(p.lastOpenedAt || p.updatedAt)}`;
    else if (st === 'done') meta = 'Selesai dibaca';
    const body = h('div', { class: 'card-body' },
      h('div', { class: 'card-title', text: b.title || 'Tanpa judul' }),
      h('div', { class: 'card-meta', text: b.author && this.ui.view === 'list' ? `${b.author} · ${meta}` : meta }));
    if (st === 'reading') body.append(h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': 'Progres baca' }, h('i', { style: { width: Math.max(2, pct) + '%' } })));
    const card = h('div', { class: 'card', 'data-kind': b.kind, 'data-id': b.id },
      h('div', { class: 'slotc' }, coverEl(b)),
      h('div', { class: 'board' }),
      body,
      h('button', { class: 'card-open', type: 'button', 'aria-label': (st === 'reading' ? 'Lanjutkan membaca ' : 'Baca ') + (b.title || 'buku'), onclick: () => openBook(b.id) }),
      h('button', { class: 'card-menu', type: 'button', 'aria-label': 'Pilihan untuk ' + (b.title || 'buku'), onclick: (e) => { e.stopPropagation(); bookMenu(b.id, e.currentTarget); } }, icon('more')));
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); bookMenu(b.id, { x: e.clientX, y: e.clientY }); });
    return card;
  },
  renderContinue(all) {
    const box = $('#cont');
    const cands = all.map((b) => ({ b, p: S.progress.get(b.id) })).filter((x) => x.p && x.p.status !== 'done' && ((x.p.pct || 0) > 0 || (x.p.page || 0) > 0))
      .sort((a, b) => (b.p.lastOpenedAt || b.p.updatedAt || 0) - (a.p.lastOpenedAt || a.p.updatedAt || 0));
    if (!cands.length || this.ui.q) { box.hidden = true; return; }
    const { b, p } = cands[0];
    const pct = Math.round((p.pct || 0) * 100);
    const pageTxt = b.kind === 'pdf' ? `Hal. ${(p.page || 0) + 1} dari ${p.pages || b.pages || '?'}` : `Hal. ${(p.page || 0) + 1}`;
    box.className = 'cont-card';
    box.replaceChildren(
      h('div', { class: 'cover-mini' }, coverEl(b, { plain: true })),
      h('div', { style: { minWidth: 0 } },
        h('div', { class: 'label', text: 'Lanjutkan membaca' }),
        h('h2', { text: b.title || 'Tanpa judul' }),
        h('div', { class: 'meta num', text: `${pageTxt} · ${pct}% · ${fmtRel(p.lastOpenedAt || p.updatedAt)}` }),
        h('div', { class: 'row' }, h('div', { class: 'bar' }, h('i', { style: { width: Math.max(2, pct) + '%' } })), h('button', { class: 'btn primary', type: 'button', onclick: () => openBook(b.id) }, icon('book-open'), 'Lanjutkan'))),
      h('div', { class: 'stamp', text: fmtDate(p.lastOpenedAt || p.updatedAt) }));
    box.hidden = false;
  },
  renderStats() {
    const box = $('#stats');
    const agg = aggregateStats(S.stats);
    const keys = Object.keys(agg.days);
    if (!keys.length) { box.hidden = true; return; }
    const today = new Date();
    const week = [];
    let weekSecs = 0;
    for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); const k = dayKey(d); const v = agg.days[k] || 0; weekSecs += v; week.push({ d, v }); }
    let streak = 0;
    const d = new Date(today);
    if ((agg.days[dayKey(d)] || 0) < 60) d.setDate(d.getDate() - 1);
    while ((agg.days[dayKey(d)] || 0) >= 60) { streak++; d.setDate(d.getDate() - 1); }
    const done = [...S.books.values()].filter((b) => bookStatus(b) === 'done').length;
    const max = Math.max(60, ...week.map((w) => w.v));
    const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const bars = h('div', { class: 'week', role: 'img', 'aria-label': 'Waktu baca 7 hari terakhir' });
    for (const w of week) bars.append(h('div', { title: `${fmtDate(w.d)}: ${fmtDur(w.v)}` }, h('i', { class: w.v ? '' : 'zero', style: { height: Math.max(2, Math.round((w.v / max) * 40)) + 'px' } }), h('span', { text: names[w.d.getDay()] })));
    box.replaceChildren(
      h('div', { class: 'stat' }, h('b', { class: 'num', text: fmtDur(agg.days[dayKey()] || 0) }), h('span', { text: 'hari ini' })),
      h('div', { class: 'stat' }, h('b', { class: 'num', text: fmtDur(weekSecs) }), h('span', { text: '7 hari terakhir' })),
      h('div', { class: 'stat' }, h('b', { class: 'num', text: String(streak) }), h('span', { text: 'hari beruntun' })),
      h('div', { class: 'stat' }, h('b', { class: 'num', text: String(done) }), h('span', { text: 'buku selesai' })),
      bars);
    box.hidden = false;
  },
  renderFilters(all) {
    const nav = $('#filters');
    const count = (fn) => all.filter(fn).length;
    const defs = [
      ['all', 'Semua', all.length],
      ['reading', 'Sedang dibaca', count((b) => bookStatus(b) === 'reading')],
      ['new', 'Belum dibaca', count((b) => bookStatus(b) === 'new')],
      ['done', 'Selesai', count((b) => bookStatus(b) === 'done')],
      ['fav', 'Favorit', count((b) => (S.progress.get(b.id) || {}).fav)],
    ];
    nav.replaceChildren();
    for (const [id, label, n] of defs) {
      if (id !== 'all' && !n && this.ui.filter !== id) continue;
      nav.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(this.ui.filter === id), onclick: () => { this.ui.filter = id; this.ui.shelf = null; this.render(); } }, label, h('span', { class: 'count', text: String(n) })));
    }
    const shelves = [...new Set(all.map((b) => (b.shelf || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'id'));
    for (const s of shelves) {
      nav.append(h('button', { type: 'button', class: 'chip', 'aria-pressed': String(this.ui.filter === 'shelf' && this.ui.shelf === s), onclick: () => { this.ui.filter = 'shelf'; this.ui.shelf = s; this.render(); } }, icon('folder'), s, h('span', { class: 'count', text: String(count((b) => (b.shelf || '') === s)) })));
    }
    nav.hidden = all.length === 0;
  },
};

function openBook(id, page) {
  const b = S.books.get(id);
  if (!b) { toast('Buku tidak ditemukan.'); return; }
  openReader({ book: b, bookId: id, page });
}
async function openLocalFile(file) {
  const kind = detectKind(file);
  if (!kind || kind === 'doc' || kind === 'other') { toast(unsupportedText(kind, file.name), { ms: 6000 }); return; }
  if (kind === 'pdf') { openReader({ temp: true, kind: 'pdf', file }); return; }
  const close = toast('Menyiapkan dokumen…', { ms: 20000 });
  try {
    const r = await toFlowContent(file, kind);
    close();
    openReader({ temp: true, kind: 'flow', file, content: r.content, book: { title: r.title, author: r.author } });
  } catch (e) { close(); toast((e && e.message) || 'Dokumen tidak bisa dibuka.', { ms: 6000 }); }
}

// ----- per-book actions -----
function setProgressFields(bookId, patch) {
  const prev = S.progress.get(bookId) || { bookId, page: 0, pct: 0, updatedAt: 0 };
  const data = { ...prev, ...patch, bookId, updatedAt: Date.now(), dev: DEVICE_ID };
  S.progress.set(bookId, data);
  Lib.render();
  return Store.putProgress(bookId, data).catch((e) => toast(dbErrorText(e)));
}
function bookMenu(id, anchor) {
  const b = S.books.get(id);
  if (!b) return;
  const p = S.progress.get(id) || {};
  const st = bookStatus(b);
  const userOK = true;
  showMenu(anchor, [
    { icon: 'book-open', label: st === 'reading' ? 'Lanjutkan membaca' : 'Baca', onClick: () => openBook(id) },
    st === 'reading' ? { icon: 'refresh', label: 'Baca dari awal', onClick: () => openBook(id, 0) } : null,
    { icon: 'info', label: 'Detail buku', onClick: () => showBookDetails(id) },
    canEditBooks() ? { icon: 'edit', label: 'Ubah info & sampul', onClick: () => editBook(id) } : null,
    userOK ? { icon: p.fav ? 'star-fill' : 'star', label: p.fav ? 'Hapus dari favorit' : 'Jadikan favorit', onClick: () => setProgressFields(id, { fav: !p.fav }) } : null,
    userOK ? (st === 'done'
      ? { icon: 'refresh', label: 'Tandai belum selesai', onClick: () => setProgressFields(id, { status: 'reading', doneAt: null }) }
      : { icon: 'check', label: 'Tandai selesai', onClick: () => setProgressFields(id, { status: 'done', doneAt: Date.now() }) }) : null,
    { icon: 'download', label: 'Unduh file asli', onClick: () => downloadOriginal(b) },
    userOK ? { icon: 'note', label: 'Ekspor catatan (.md)', onClick: async () => exportNotes(b, await Store.listAnn(id).catch(() => [])) } : null,
    canEditBooks() ? 'sep' : null,
    canEditBooks() ? { icon: 'trash', label: 'Hapus buku', danger: true, onClick: () => deleteBook(id) } : null,
  ].filter(Boolean), { title: b.title });
}
async function downloadOriginal(b) {
  const close = toast('Menyiapkan file…', { ms: 30000 });
  try {
    let blob = await Files.get(b.file);
    const ext = { pdf: 'pdf', docx: 'docx', md: 'md', txt: 'txt' }[b.kind] || 'bin';
    let name = b.fileName || (b.title || 'buku') + '.' + ext;
    if (!new RegExp('\\.' + ext + '$', 'i').test(name)) name = name.replace(/\.[^.]+$/, '') + '.' + ext;
    close();
    await offerDownload(name, blob);
  } catch (e) { close(); toast((e && e.message) || 'File asli tidak bisa diambil.'); }
}
async function deleteBook(id) {
  const b = S.books.get(id);
  if (!b) return;
  const ok = await confirmBox({ title: 'Hapus buku ini?', message: `“${b.title}” beserta file, progres baca, penanda, dan catatan Anda akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.`, ok: 'Hapus', danger: true });
  if (!ok) return;
  const close = toast('Menghapus…', { ms: 30000 });
  try {
    await Store.deleteBook(id);
    S.books.delete(id);
    Lib.render();
    const refs = [b.file, b.content, b.cover ? { id: b.cover } : null, ...((b.extra || []).map((x) => ({ id: x })))].filter(Boolean);
    for (const r of refs) await Files.remove(r);
    const anns = await Store.listAnn(id).catch(() => []);
    for (const a of anns) await Store.deleteAnn(id, a.id).catch(() => {});
    await Store.deleteProgress(id).catch(() => {});
    S.progress.delete(id);
    close();
    toast('Buku dihapus.');
    Lib.render();
  } catch (e) { close(); toast(dbErrorText(e)); }
}
function editBook(id) {
  const b = S.books.get(id);
  if (!b) return;
  const draft = { ...b, tags: [...(b.tags || [])] };
  const t = h('input', { class: 'input', id: 'edTitle', value: b.title || '' });
  const a = h('input', { class: 'input', id: 'edAuthor', value: b.author || '', placeholder: 'Opsional' });
  const shelves = [...new Set([...S.books.values()].map((x) => (x.shelf || '').trim()).filter(Boolean))];
  const dl = h('datalist', { id: 'shelfList' }, ...shelves.map((s) => h('option', { value: s })));
  const s = h('input', { class: 'input', id: 'edShelf', value: b.shelf || '', list: 'shelfList', placeholder: 'mis. Saham, Kuliah, Fiksi' });
  const tg = h('input', { class: 'input', id: 'edTags', value: (b.tags || []).join(', '), placeholder: 'pisahkan dengan koma' });
  const d = h('textarea', { class: 'textarea', id: 'edDesc', rows: '3', placeholder: 'Catatan singkat tentang buku ini (opsional)' });
  d.value = b.desc || '';
  const sw = h('div', { class: 'swatches', role: 'group', 'aria-label': 'Warna sampul' });
  const prev = h('div', { style: { width: '84px' } });
  const drawPrev = () => { prev.replaceChildren(coverEl({ ...draft, title: t.value || draft.title, author: a.value }, { plain: true })); };
  const drawSw = () => {
    sw.replaceChildren();
    CLOTH.forEach((c, i) => sw.append(h('button', { type: 'button', class: 'swatch cloth', style: { '--c': c }, 'aria-label': 'Warna ' + (i + 1), 'aria-pressed': String((draft.coverColor ?? hashStr(draft.title || draft.id) % CLOTH.length) === i), onclick: () => { draft.coverColor = i; drawSw(); drawPrev(); } })));
  };
  drawSw(); drawPrev();
  t.addEventListener('input', drawPrev); a.addEventListener('input', drawPrev);
  let newCover = null, firstPage = false;
  const coverBtns = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } });
  const drawCoverPrev = () => {
    if (draft.cover === 'firstpage') prev.replaceChildren(h('div', { class: 'cover', style: { aspectRatio: '0.72', background: '#fff', color: '#555', display: 'grid', placeItems: 'center', fontSize: '12px' } }, 'Halaman 1'));
    else if (draft.cover !== 'pending') drawPrev();
  };
  const drawCoverBtns = () => {
    sw.hidden = !!draft.cover;
    coverBtns.replaceChildren(h('button', { class: 'btn small', type: 'button', onclick: () => pickCover() }, icon('image'), 'Pakai gambar sendiri'));
    if (draft.cover) coverBtns.append(h('button', { class: 'btn small ghost', type: 'button', onclick: () => { draft.cover = null; newCover = null; firstPage = false; drawPrev(); drawCoverBtns(); } }, 'Pakai sampul kain'));
    else if (b.kind === 'pdf') coverBtns.append(h('button', { class: 'btn small ghost', type: 'button', onclick: () => { draft.cover = 'firstpage'; newCover = null; firstPage = true; drawCoverPrev(); drawCoverBtns(); } }, 'Pakai halaman pertama'));
  };
  const pickCover = () => {
    const inp = $('#coverInput');
    inp.onchange = async () => {
      const f = inp.files[0]; inp.value = '';
      if (!f) return;
      if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) { toast('Pilih gambar PNG, JPG, WebP, atau GIF.'); return; }
      let blob = f;
      try { blob = await shrinkCover(f); } catch (e) { blob = f; }
      newCover = blob; firstPage = false;
      draft.cover = 'pending';
      const url = URL.createObjectURL(blob);
      const im = new Image(); im.onload = () => { draft.coverAspect = im.naturalWidth / im.naturalHeight; prev.replaceChildren(h('div', { class: 'cover', style: { aspectRatio: String(clamp(draft.coverAspect, 0.5, 1.4)) } }, h('img', { src: url, alt: '' }))); }; im.src = url;
      drawCoverBtns();
    };
    inp.click();
  };
  drawCoverBtns();
  const body = h('div', { style: { display: 'grid', gap: '14px' } },
    h('label', { class: 'field', for: 'edTitle' }, h('span', { text: 'Judul' }), t),
    h('label', { class: 'field', for: 'edAuthor' }, h('span', { text: 'Penulis' }), a),
    h('div', { class: 'grid2' }, h('label', { class: 'field', for: 'edShelf' }, h('span', { text: 'Rak' }), s, dl), h('label', { class: 'field', for: 'edTags' }, h('span', { text: 'Label' }), tg)),
    h('label', { class: 'field', for: 'edDesc' }, h('span', { text: 'Deskripsi' }), d),
    h('div', { class: 'field' }, h('span', { text: 'Sampul' }), h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-start' } }, prev, h('div', { style: { display: 'grid', gap: '10px' } }, sw, coverBtns))));
  Modal.open({
    title: 'Ubah info buku', body, wide: true,
    actions: [{ label: 'Batal' }, { label: 'Simpan', kind: 'primary', onClick: async (m, btn) => {
      const title = t.value.trim();
      if (!title) { toast('Judul tidak boleh kosong.'); t.focus(); return false; }
      btn.disabled = true;
      try {
        const next = { ...b, title, author: a.value.trim(), shelf: s.value.trim(), tags: tg.value.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 12), desc: d.value.trim().slice(0, 2000), coverColor: draft.coverColor ?? b.coverColor, updatedAt: Date.now() };
        delete next.id;
        const oldCover = b.cover;
        if (newCover) { const ref = await Files.put(newCover, newCover.type || 'image/jpeg'); next.cover = ref.id; next.coverAspect = draft.coverAspect || 0.7; }
        else if (firstPage) {
          const blob = await Files.get(b.file);
          const info = await inspectPdf(new File([blob], b.fileName || 'buku.pdf', { type: 'application/pdf' }));
          const ref = await Files.put(info.cover, 'image/jpeg');
          next.cover = ref.id; next.coverAspect = info.aspect;
        } else if (!draft.cover) next.cover = null;
        await Store.putBook(id, next);
        S.books.set(id, { id, ...next });
        if (oldCover && oldCover !== next.cover) Files.remove({ id: oldCover });
        toast('Info buku disimpan.');
        Lib.render();
      } catch (e) { btn.disabled = false; toast(e && e.code ? (e.code in { too_large: 1, unsupported_type: 1, quota_or_state: 1 } ? assetErrorText(e) : dbErrorText(e)) : 'Gagal menyimpan.'); return false; }
    } }],
  });
}
async function shrinkCover(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 600 / bmp.width);
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const out = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  return out || file;
}
async function showBookDetails(id) {
  const b = S.books.get(id);
  if (!b) return;
  const p = S.progress.get(id) || {};
  const agg = aggregateStats(S.stats);
  const secs = agg.books[id] || 0;
  const st = bookStatus(b);
  const year = new Date(b.addedAt || Date.now()).getFullYear();
  const kv = h('dl', { class: 'kv' });
  const row = (k, v) => { if (v == null || v === '') return; kv.append(h('dt', { text: k }), h('dd', { text: v })); };
  row('Penulis', b.author);
  row('Format', KIND_LABEL[b.kind] || b.kind);
  row(b.kind === 'pdf' ? 'Halaman' : 'Panjang', b.kind === 'pdf' ? String(b.pages || '—') : (b.words ? plural(b.words, 'kata') : null));
  row('Ukuran file', fmtBytes(b.fileSize));
  row('Nama file', b.fileName);
  row('Rak', b.shelf);
  row('Label', (b.tags || []).join(', '));
  row('Ditambahkan', fmtDate(b.addedAt));
  row('No. induk', b.seq ? `${String(b.seq).padStart(4, '0')}/${year}` : null);
  row('Status', st === 'done' ? 'Selesai' : st === 'reading' ? `Sedang dibaca · ${Math.round((p.pct || 0) * 100)}%` : 'Belum dibaca');
  row('Waktu baca', secs ? fmtDur(secs) : null);
  row('Terakhir dibuka', p.lastOpenedAt ? fmtDate(p.lastOpenedAt, true) : null);
  const left = h('div', null, coverEl(b));
  const right = h('div', { style: { display: 'grid', gap: '10px', minWidth: 0 } }, h('h3', { style: { margin: 0, fontFamily: 'var(--font-display)', fontSize: '20px', lineHeight: 1.2, overflowWrap: 'anywhere' }, text: b.title }), kv);
  if (b.desc) right.append(h('p', { text: b.desc }));
  const body = h('div', { style: { display: 'grid', gap: '16px' } }, h('div', { class: 'details' }, left, right));
  const days = Object.entries(p.days || {}).sort((x, y) => (x[0] < y[0] ? 1 : -1)).slice(0, 12);
  if (days.length) {
    const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MEI', 'JUN', 'JUL', 'AGU', 'SEP', 'OKT', 'NOV', 'DES'];
    const stamps = h('div', { class: 'card-stamps' });
    for (const [k, r] of days) { const [y, m, d] = k.split('-'); stamps.append(h('div', { class: 'stamp', text: `${d} ${MON[+m - 1]} ${y} · hlm ${r[0]}${r[1] !== r[0] ? '–' + r[1] : ''}` })); }
    body.append(h('div', { class: 'field' }, h('span', { text: 'Kartu baca' }), stamps));
  }
  const actions = [{ label: 'Tutup' }];
  if (canEditBooks()) actions.unshift({ label: 'Ubah', onClick: () => { setTimeout(() => editBook(id), 0); } });
  actions.push({ label: st === 'reading' ? 'Lanjutkan' : 'Baca', kind: 'primary', onClick: () => { if (!R.open || R.bookId !== id) setTimeout(() => openBook(id), 0); } });
  Modal.open({ title: 'Detail buku', body, actions, wide: true });
}

// ----- uploads -----
function startUpload(files) {
  if (!canAddBooks()) { toast('Penyimpanan tidak tersedia. Gunakan “Buka file”.'); return; }
  Up.open();
  Up.add(files);
}
const Up = {
  m: null, list: null, queue: [], running: false, shelf: '', foot: null,
  open() {
    if (!canAddBooks()) { toast('Penyimpanan tidak tersedia. Gunakan “Buka file”.'); return; }
    if (this.m && this.m.el.isConnected) return;
    const drop = h('div', { class: 'drop', role: 'button', tabindex: '0', 'aria-label': 'Pilih file untuk diunggah' },
      icon('upload'), h('b', { text: 'Pilih atau seret file ke sini' }), h('span', { class: 'hint', text: 'PDF, Word (.docx), Markdown (.md), atau teks (.txt). Bisa beberapa sekaligus.' }));
    drop.onclick = () => $('#fileInput').click();
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('#fileInput').click(); } };
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); drop.classList.remove('over'); this.add([...e.dataTransfer.files]); });
    const shelves = [...new Set([...S.books.values()].map((x) => (x.shelf || '').trim()).filter(Boolean))];
    const sh = h('input', { class: 'input', id: 'upShelf', list: 'upShelfList', placeholder: 'Tanpa rak', value: this.shelf });
    sh.addEventListener('input', () => { this.shelf = sh.value.trim(); });
    this.list = h('div', { class: 'uq', 'aria-live': 'polite' });
    const body = h('div', { style: { display: 'grid', gap: '14px' } }, drop,
      h('label', { class: 'field', for: 'upShelf' }, h('span', { text: 'Masukkan ke rak (opsional)' }), sh, h('datalist', { id: 'upShelfList' }, ...shelves.map((s) => h('option', { value: s })))),
      this.list,
      h('p', { class: 'hint', text: 'Batas 20 MB per file tersimpan langsung; file lebih besar dipecah otomatis. Word dan teks diubah agar hurufnya bisa diatur ulang; file aslinya tetap disimpan dan bisa diunduh.' }));
    this.m = Modal.open({ title: 'Unggah ke rak', body, wide: true, actions: [{ label: 'Tutup', kind: 'primary', id: 'upClose' }], onClose: () => { this.m = null; } });
  },
  add(files) {
    for (const f of files) {
      const kind = detectKind(f);
      const row = {
        el: null, status: h('div', { class: 'uq-status', text: 'Menunggu…' }), bar: h('div', { class: 'uq-bar ind' }, h('i')), act: h('div'),
      };
      row.el = h('div', { class: 'uq-item' }, h('div', { class: 'uq-ico ' + (kind || ''), text: (f.name.split('.').pop() || '?').toUpperCase().slice(0, 4) }),
        h('div', { style: { minWidth: 0 } }, h('div', { class: 'uq-name', text: f.name }), row.status, row.bar), row.act);
      if (this.list) this.list.append(row.el);
      this.queue.push({ file: f, kind, row });
    }
    this.run();
  },
  async run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      await this.process(job);
    }
    this.running = false;
  },
  async process({ file, kind, row }) {
    const step = (t, p) => { row.status.textContent = t; row.status.className = 'uq-status'; if (p == null) { row.bar.className = 'uq-bar ind'; row.bar.firstChild.style.width = ''; } else { row.bar.className = 'uq-bar'; row.bar.firstChild.style.width = Math.round(p * 100) + '%'; } };
    const fail = (msg) => { row.status.textContent = msg; row.status.className = 'uq-status err'; row.bar.hidden = true; };
    const uploaded = [];
    try {
      if (!kind || kind === 'doc' || kind === 'other') { fail(unsupportedText(kind, file.name)); return; }
      if (!file.size) { fail('File kosong.'); return; }
      if (file.size > MAX_FILE) { fail('File lebih dari 150 MB. Kompres atau pisahkan dulu.'); return; }
      const dup = [...S.books.values()].find((b) => b.fileName === file.name && b.fileSize === file.size);
      if (dup) {
        step('File yang sama sudah ada di rak…', null);
        const again = await confirmBox({ title: 'File sudah ada', message: `“${file.name}” sudah ada di rak sebagai “${dup.title}”. Tetap unggah salinan baru?`, ok: 'Unggah lagi' });
        if (!again) { fail('Dilewati — sudah ada di rak.'); return; }
      }
      step('Membaca isi…', null);
      let info = null, flow = null;
      if (kind === 'pdf') info = await inspectPdf(file);
      else flow = await toFlowContent(file, kind, (p) => step('Mengubah dokumen…', p * 0.5));
      const id = uid('b');
      const mime = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', md: 'text/markdown', txt: 'text/plain' }[kind];
      step('Mengunggah…', 0);
      let original = file;
      if (kind === 'md' || kind === 'txt') original = new Blob([decodeText(await file.arrayBuffer())], { type: mime });
      const fileRef = await Files.put(original, mime, (p) => step('Mengunggah file…', p * (flow ? 0.5 : 0.85)));
      uploaded.push(fileRef);
      let coverId = null, contentRef = null;
      const extra = [];
      if (info && info.cover) { const c = await Files.put(info.cover, 'image/jpeg'); coverId = c.id; uploaded.push(c); }
      if (flow) {
        const json = JSON.stringify(flow.content);
        step('Menyimpan isi buku…', 0.6);
        contentRef = await Files.put(new Blob([json], { type: 'application/json' }), 'application/json', (p) => step('Menyimpan isi buku…', 0.6 + p * 0.3));
        uploaded.push(contentRef);
      }
      step('Memasukkan ke rak…', 0.95);
      const seq = Math.max(0, ...[...S.books.values()].map((b) => b.seq || 0)) + 1;
      const title = (info ? info.title : flow.title) || baseName(file.name);
      const book = {
        title, author: (info ? info.author : flow.author) || '', kind,
        fileName: file.name, fileSize: file.size, mime,
        file: fileRef, content: contentRef, cover: coverId, coverAspect: info ? info.aspect : null,
        pages: info ? info.pages : null, words: flow ? flow.words : null,
        shelf: this.shelf || '', tags: [], desc: '', coverColor: hashStr(title + file.size) % CLOTH.length,
        seq, addedAt: Date.now(), updatedAt: Date.now(), extra,
      };
      await Store.putBook(id, book);
      S.books.set(id, { id, ...book });
      row.status.textContent = flow && flow.warnings.length ? 'Tersimpan. ' + flow.warnings.join(' ') : 'Tersimpan di rak.';
      row.status.className = 'uq-status ok';
      row.bar.hidden = true;
      row.act.replaceChildren(h('button', { class: 'btn small primary', type: 'button', text: 'Baca', onclick: () => { if (this.m) this.m.close(); openBook(id); } }));
      Lib.render();
    } catch (e) {
      console.error(e);
      for (const r of uploaded) Files.remove(r).catch(() => {});
      const msg = e && e.name === 'QuotaExceededError' ? assetErrorText(e) : (e && e.message) || 'Gagal memproses file.';
      fail(msg);
    }
  },
};

// ----- library menu: storage, export, backup, about -----
function openLibMenu(anchor) {
  showMenu(anchor, [
    { icon: 'device', label: 'Penyimpanan & data', onClick: showStorage },
    S.books.size ? { icon: 'note', label: 'Ekspor semua catatan (.md)', onClick: exportAllNotes } : null,
    S.books.size ? { icon: 'download', label: 'Cadangkan data (.json)', onClick: backupData } : null,
    !isTouchUI() ? { icon: 'keyboard', label: 'Pintasan keyboard', onClick: showKeyHelp } : null,
    { icon: 'info', label: 'Tentang DigiBook', onClick: showAbout },
  ].filter(Boolean), { title: 'Menu' });
}
async function showStorage() {
  const body = h('div', { style: { display: 'grid', gap: '16px' } }, h('div', { class: 'empty-small' }, h('div', { class: 'spin' })));
  const m = Modal.open({ title: 'Penyimpanan & data', body, actions: [{ label: 'Tutup', kind: 'primary' }] });
  const u = await Files.usage();
  body.replaceChildren();
  if (u) body.append(h('div', { class: 'meter' }, h('b', { text: 'Penyimpanan di perangkat ini' }), h('div', { class: 'hint num', text: `${fmtBytes(u.bytes)} · ${u.files} file` })));
  body.append(h('p', { class: 'hint', text: 'Semua data tersimpan di peramban perangkat ini. Menghapus data situs akan menghapus rak ini, jadi buat cadangan dari menu bila perlu.' }));
}
async function exportAllNotes() {
  const close = toast('Mengumpulkan catatan…', { ms: 30000 });
  let md = `# Semua catatan DigiBook\n\n_Diekspor ${fmtDate(Date.now(), true)}._\n`;
  let n = 0;
  for (const b of [...S.books.values()].sort((a, c) => (a.title || '').localeCompare(c.title || '', 'id'))) {
    const anns = await Store.listAnn(b.id).catch(() => []);
    const items = anns.filter((a) => a.type !== 'bookmark' || a.note).sort((a, c) => (a.page || 0) - (c.page || 0));
    if (!items.length) continue;
    md += `\n\n# ${b.title}\n`;
    for (const a of items) {
      n++;
      md += `\n**Hal. ${(a.page || 0) + 1}**\n\n`;
      if (a.text) md += `> ${a.text.replace(/\n/g, '\n> ')}\n\n`;
      if (a.note) md += `${a.note}\n`;
    }
  }
  close();
  if (!n) { toast('Belum ada sorotan atau catatan untuk diekspor.'); return; }
  await offerDownload(`Catatan DigiBook ${dayKey()}.md`, md, md);
}
async function backupData() {
  const close = toast('Menyiapkan cadangan…', { ms: 30000 });
  const out = { app: 'DigiBook', version: 1, exportedAt: new Date().toISOString(), books: [], progress: {}, annotations: {}, stats: S.stats || null, settings: S.settings || null };
  for (const b of S.books.values()) {
    out.books.push(b);
    if (S.progress.has(b.id)) out.progress[b.id] = S.progress.get(b.id);
    out.annotations[b.id] = await Store.listAnn(b.id).catch(() => []);
  }
  close();
  const json = JSON.stringify(out, null, 1);
  await offerDownload(`Cadangan DigiBook ${dayKey()}.json`, json, json);
}
function showAbout() {
  const body = h('div', { style: { display: 'grid', gap: '12px' } },
    h('p', { text: 'DigiBook adalah perpustakaan pribadi untuk dokumen Anda: unggah sekali, lalu baca seperti buku. Posisi baca, penanda, sorotan, dan catatan tersimpan di perangkat ini.' }),
    h('p', null, h('b', { text: 'Format: ' }), 'PDF tampil persis seperti aslinya (bisa diperbesar). Word (.docx), Markdown, dan teks disusun ulang menjadi halaman buku, sehingga ukuran huruf, margin, dan warna kertas bisa diatur.'),
    h('p', null, h('b', { text: 'Cara membalik halaman: ' }), 'geser halaman ke kiri/kanan, ketuk tepi layar, gunakan tombol panah, atau gulir mouse. Ketuk bagian tengah untuk memunculkan menu.'),
    h('p', null, h('b', { text: 'Privasi: ' }), 'semua buku, catatan, dan progres baca hanya tersimpan di peramban Anda dan tidak dikirim ke server mana pun.'),
    h('p', { class: 'hint', text: 'Mesin PDF: PDF.js (Mozilla). Huruf: Literata, Atkinson Hyperlegible, Courier Prime (Google Fonts).' }));
  Modal.open({ title: 'Tentang DigiBook', body, actions: [{ label: 'Tutup', kind: 'primary' }] });
}
