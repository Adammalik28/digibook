// ---------- penyimpanan (semua data tersimpan di perangkat ini) ----------
const P = { mode: 'local' };

function dbErrorText(e) {
  if (e && e.name === 'QuotaExceededError') return 'Penyimpanan perangkat sudah penuh. Hapus beberapa buku atau catatan lalu coba lagi.';
  return 'Gagal menyimpan. Coba lagi.';
}

// Penyimpanan lokal (hanya di perangkat ini, IndexedDB)
class LocalStore {
  constructor() { this.kind = 'local'; this.listeners = { books: new Set(), user: new Set(), ann: new Map() }; this.cache = null; }
  async load() {
    if (this.cache) return this.cache;
    let v = null;
    try { v = await IDB.get('kv', 'store'); } catch (e) { v = null; }
    if (!v) v = LS.get('store', null);
    this.cache = v || { books: {}, user: {}, ann: {} };
    return this.cache;
  }
  async save() {
    const v = this.cache;
    try { await IDB.put('kv', 'store', v); } catch (e) { LS.set('store', v); }
  }
  async emitBooks() { const s = await this.load(); const m = new Map(Object.entries(s.books).map(([id, b]) => [id, { id, ...b }])); this.listeners.books.forEach((cb) => cb(m, { fromCache: false })); }
  async emitUser() {
    const s = await this.load();
    const out = { settings: s.user.settings || null, stats: s.user.stats || null, progress: new Map() };
    for (const [k, v] of Object.entries(s.user)) if (k.startsWith('p_')) out.progress.set(k.slice(2), v);
    this.listeners.user.forEach((cb) => cb(out));
  }
  async emitAnn(bookId) { const s = await this.load(); const list = Object.entries(s.ann[bookId] || {}).map(([id, a]) => ({ id, ...a })); (this.listeners.ann.get(bookId) || new Set()).forEach((cb) => cb(list)); }
  watchBooks(cb) { this.listeners.books.add(cb); this.emitBooks(); return () => this.listeners.books.delete(cb); }
  watchUser(cb) { this.listeners.user.add(cb); this.emitUser(); return () => this.listeners.user.delete(cb); }
  watchAnn(bookId, cb) { if (!this.listeners.ann.has(bookId)) this.listeners.ann.set(bookId, new Set()); this.listeners.ann.get(bookId).add(cb); this.emitAnn(bookId); return () => this.listeners.ann.get(bookId).delete(cb); }
  async putBook(id, data) { const s = await this.load(); s.books[id] = JSON.parse(JSON.stringify(data)); await this.save(); this.emitBooks(); }
  async deleteBook(id) { const s = await this.load(); delete s.books[id]; await this.save(); this.emitBooks(); }
  async putProgress(bookId, data) { const s = await this.load(); s.user['p_' + bookId] = JSON.parse(JSON.stringify(data)); await this.save(); this.emitUser(); }
  async deleteProgress(bookId) { const s = await this.load(); delete s.user['p_' + bookId]; delete s.ann[bookId]; await this.save(); this.emitUser(); }
  async putAnn(bookId, ann) { const s = await this.load(); const { id, ...data } = ann; (s.ann[bookId] ||= {})[id] = JSON.parse(JSON.stringify(data)); await this.save(); this.emitAnn(bookId); }
  async deleteAnn(bookId, annId) { const s = await this.load(); if (s.ann[bookId]) delete s.ann[bookId][annId]; await this.save(); this.emitAnn(bookId); }
  async listAnn(bookId) { const s = await this.load(); return Object.entries(s.ann[bookId] || {}).map(([id, a]) => ({ id, ...a })); }
  async putSettings(data) { const s = await this.load(); s.user.settings = data; await this.save(); this.emitUser(); }
  async putStats(data) { const s = await this.load(); s.user.stats = data; await this.save(); this.emitUser(); }
}

// ---------- penyimpanan file (IndexedDB) ----------
function assetErrorText(e) {
  if (e && e.name === 'QuotaExceededError') return 'Penyimpanan perangkat sudah penuh. Hapus beberapa buku lalu coba lagi.';
  return 'Gagal menyimpan file. Coba lagi.';
}

const Files = {
  kind: 'none', // 'local' bila IndexedDB tersedia
  // Menyimpan blob; mengembalikan referensi {id, type, size}
  async put(blob, type, onProgress) {
    const id = uid('f');
    await IDB.put('files', id, { buf: await blob.arrayBuffer(), type });
    onProgress && onProgress(1);
    return { id, type, size: blob.size };
  },
  async get(ref, onProgress) {
    if (!ref || !ref.id) throw new Error('Referensi file kosong.');
    const v = await IDB.get('files', ref.id);
    if (!v) throw new Error('File tidak ditemukan di perangkat ini.');
    onProgress && onProgress(1);
    return new Blob([v.buf], { type: ref.type || v.type });
  },
  ids(ref) { return ref && ref.id ? [ref.id] : []; },
  async remove(ref) {
    for (const id of this.ids(ref)) { try { await IDB.del('files', id); } catch (e) { /* sudah hilang */ } }
  },
  async usage() {
    try { const all = await IDB.all('files'); return { files: all.length, bytes: all.reduce((s, v) => s + (v.buf ? v.buf.byteLength : 0), 0) }; } catch (e) { return null; }
  },
};
let Store = null;
