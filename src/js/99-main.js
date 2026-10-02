// ---------- boot ----------
// This device's slice of the reading statistics (each device writes only its own subtree).
const Mine = {
  data: null,
  add(bookId, secs, pages) {
    if (!this.data) this.data = JSON.parse(JSON.stringify((((S.stats || {}).devs || {})[DEVICE_ID]) || {}));
    const d = this.data, t = dayKey();
    d.days = d.days || {}; d.pages = d.pages || {}; d.books = d.books || {};
    d.days[t] = Math.round((d.days[t] || 0) + secs);
    d.pages[t] = (d.pages[t] || 0) + pages;
    d.books[bookId] = Math.round((d.books[bookId] || 0) + secs);
    const keys = Object.keys(d.days).sort();
    while (keys.length > 400) { const k = keys.shift(); delete d.days[k]; delete d.pages[k]; }
    d.t = Date.now();
    return JSON.parse(JSON.stringify(d));
  },
};
function mergeDeep(base, patch) {
  const out = base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  for (const [k, v] of Object.entries(patch)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergeDeep(out[k], v) : v;
  return out;
}
LocalStore.prototype.addStats = async function (bookId, secs, pages) {
  const s = await this.load();
  const patch = { devs: { [DEVICE_ID]: Mine.add(bookId, secs, pages) } };
  s.user.stats = mergeDeep(s.user.stats, patch);
  S.stats = s.user.stats;
  await this.save();
};

async function boot() {
  hydrateIcons(document);
  initReaderDom();
  bindZoom();
  Lib.init();
  Lib.setSyncLabel();
  let idbOK = false;
  try { await IDB.keys('kv'); idbOK = true; } catch (e) { idbOK = false; }
  Files.kind = idbOK ? 'local' : 'none';
  Store = new LocalStore();
  Lib.setSyncLabel();
  Lib.renderBanner();
  Store.watchBooks((m) => {
    S.books = m;
    S.booksLoaded = true;
    if (R.open && !R.temp && R.bookId && !m.has(R.bookId)) { toast('Buku ini sudah dihapus dari rak.'); closeReader(); return; }
    if (R.open && !R.temp && R.bookId && m.has(R.bookId)) { R.book = m.get(R.bookId); R.els.title.textContent = R.book.title; }
    Lib.render();
  }, (e) => { console.warn('books', e); toast('Rak tidak bisa dimuat: ' + dbErrorText(e)); S.booksLoaded = true; Lib.render(); });
  Store.watchUser((u) => {
    S.settings = u.settings;
    S.stats = u.stats;
    S.progress = u.progress;
    S.userLoaded = true;
    if (R.open && R.bookId) onRemoteProgress(u.progress.get(R.bookId));
    Lib.render();
  }, (e) => { console.warn('user', e); S.userLoaded = true; });
  const mo = new MutationObserver(() => { if (R.open) { applyReaderSettings(); refreshDecor(); } });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (R.open) { applyReaderSettings(); refreshDecor(); } });
}

boot().catch((e) => { console.error(e); toast('Gagal memulai aplikasi. Muat ulang halaman.'); });
