// ---------- small utilities ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTouchUI = () => matchMedia('(hover: none), (pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 820);
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const narrow = () => innerWidth <= 700;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sv == null) continue; if (sk.startsWith('--')) el.style.setProperty(sk, String(sv)); else el.style[sk] = sv; } }
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const NF1 = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1048576) return NF1.format(n / 1024) + ' KB';
  if (n < 1073741824) return NF1.format(n / 1048576) + ' MB';
  return NF1.format(n / 1073741824) + ' GB';
}
const DF = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const DFT = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function fmtDate(ts, withTime) { if (!ts) return '—'; try { return (withTime ? DFT : DF).format(new Date(ts)); } catch (e) { return '—'; } }
function fmtRel(ts) {
  if (!ts) return '';
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'baru saja';
  if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
  if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
  const d = Math.floor(s / 86400);
  if (d === 1) return 'kemarin';
  if (d < 7) return d + ' hari lalu';
  return fmtDate(ts);
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  if (sec < 60) return sec < 30 ? '< 1 mnt' : '1 mnt';
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' mnt';
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh + ' j' + (mm ? ' ' + mm + ' mnt' : '');
}
function dayKey(d = new Date()) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function uid(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function hashStr(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function debounce(fn, ms) {
  let t = 0;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.flush = (...a) => { clearTimeout(t); fn(...a); };
  d.cancel = () => clearTimeout(t);
  return d;
}
function normText(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function plural(n, word) { return `${n.toLocaleString('id-ID')} ${word}`; }

// localStorage, best-effort only (per-device conveniences)
const LS = {
  get(k, def) { try { const v = localStorage.getItem('pk.' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('pk.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  del(k) { try { localStorage.removeItem('pk.' + k); } catch (e) { /* ignore */ } },
};
const DEVICE_ID = (() => { let d = LS.get('device'); if (!d) { d = uid('d'); LS.set('device', d); } return d; })();

// IndexedDB (per-device cache and local-only library); every call may fail
const IDB = (() => {
  let dbp = null;
  const p = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open('digibook', 1); } catch (e) { rej(e); return; }
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const s of ['cache', 'files', 'kv']) if (!d.objectStoreNames.contains(s)) d.createObjectStore(s);
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
      req.onblocked = () => rej(new Error('blocked'));
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  return {
    async get(store, key) { const d = await open(); return p(d.transaction(store).objectStore(store).get(key)); },
    async put(store, key, val) { const d = await open(); return p(d.transaction(store, 'readwrite').objectStore(store).put(val, key)); },
    async del(store, key) { const d = await open(); return p(d.transaction(store, 'readwrite').objectStore(store).delete(key)); },
    async keys(store) { const d = await open(); return p(d.transaction(store).objectStore(store).getAllKeys()); },
    async all(store) { const d = await open(); return p(d.transaction(store).objectStore(store).getAll()); },
    async clear(store) { const d = await open(); return p(d.transaction(store, 'readwrite').objectStore(store).clear()); },
  };
})();

// ---------- binary helpers ----------
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => { const s = String(fr.result); res(s.slice(s.indexOf(',') + 1)); };
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
function base64ToBytes(b64) {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function dataUrlToBlob(url) {
  const i = url.indexOf(',');
  const meta = url.slice(5, i);
  const type = meta.split(';')[0] || 'application/octet-stream';
  if (/;base64/.test(meta)) return new Blob([base64ToBytes(url.slice(i + 1))], { type });
  return new Blob([decodeURIComponent(url.slice(i + 1))], { type });
}
function decodeText(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8).replace(/^﻿/, ''); } catch (e) { /* not utf-8 */ }
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  return new TextDecoder('windows-1252').decode(u8);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    try {
      const ta = h('textarea', { style: { position: 'fixed', left: '-9999px', top: '0' } });
      ta.value = text; document.body.append(ta); ta.select();
      const ok = document.execCommand('copy'); ta.remove(); return ok;
    } catch (e2) { return false; }
  }
}

// ---------- toasts ----------
function toast(msg, opts = {}) {
  const box = $('#toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('div', { class: 't', text: msg }));
  let timer = 0;
  const close = () => { clearTimeout(timer); el.remove(); };
  if (opts.action) {
    el.append(h('button', { type: 'button', text: opts.action, onclick: () => { close(); opts.onAction && opts.onAction(); } }));
  }
  el.append(h('button', { type: 'button', 'aria-label': 'Tutup', onclick: close }, icon('x')));
  box.append(el);
  while (box.children.length > 3) box.firstChild.remove();
  timer = setTimeout(close, opts.ms || (opts.action ? 6500 : 3800));
  return close;
}

// ---------- modal dialogs ----------
const Modal = {
  stack: [],
  open({ title, body, actions = [], wide = false, onClose, sheet = true, label }) {
    const prevFocus = document.activeElement;
    const scrim = h('div', { class: 'scrim' + (sheet ? ' sheet-mode' : '') });
    const dlg = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': label || title });
    const close = (val) => {
      if (!scrim.isConnected) return;
      scrim.remove();
      Modal.stack = Modal.stack.filter((m) => m !== api);
      onClose && onClose(val);
      api._resolve(val);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    };
    const head = h('header', null, h('h2', { text: title }), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Tutup', onclick: () => close(undefined) }, icon('x')));
    const bodyEl = h('div', { class: 'body' });
    if (body) bodyEl.append(body);
    dlg.append(head, bodyEl);
    if (actions.length) {
      const foot = h('footer');
      for (const a of actions) {
        const b = h('button', { type: 'button', class: 'btn ' + (a.kind || ''), text: a.label });
        b.addEventListener('click', async () => {
          if (a.onClick) {
            const r = await a.onClick(api, b);
            if (r === false) return;
          }
          close(a.value);
        });
        if (a.id) b.id = a.id;
        foot.append(b);
      }
      dlg.append(foot);
    }
    scrim.append(dlg);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) scrim._downOnScrim = true; });
    scrim.addEventListener('click', (e) => { if (e.target === scrim && scrim._downOnScrim) close(undefined); scrim._downOnScrim = false; });
    document.body.append(scrim);
    let resolve;
    const result = new Promise((r) => { resolve = r; });
    const api = { el: dlg, body: bodyEl, close, result, _resolve: resolve };
    Modal.stack.push(api);
    setTimeout(() => {
      const f = dlg.querySelector('[autofocus]') || dlg.querySelector('.body input, .body textarea, .body select') || dlg.querySelector('footer .btn.primary') || dlg.querySelector('header .icon-btn');
      f && f.focus({ preventScroll: true });
    }, 30);
    return api;
  },
  top() { return this.stack[this.stack.length - 1]; },
};
function confirmBox({ title, message, ok = 'Ya', cancel = 'Batal', danger = false }) {
  const m = Modal.open({
    title, body: h('p', { text: message }), sheet: true,
    actions: [{ label: cancel, value: false }, { label: ok, kind: danger ? 'danger solid' : 'primary', value: true }],
  });
  return m.result.then((v) => v === true);
}

// ---------- popover menu ----------
let openMenuEl = null;
function closeMenu() { if (openMenuEl) { openMenuEl.remove(); openMenuEl = null; document.removeEventListener('pointerdown', menuOutside, true); } }
function menuOutside(e) { if (openMenuEl && !openMenuEl.contains(e.target)) closeMenu(); }
function showMenu(anchor, items, opts = {}) {
  closeMenu();
  if (narrow() && !opts.popover) {
    // action sheet on phones
    const list = h('div', { class: 'menu', style: { position: 'static', boxShadow: 'none', border: '0', padding: '0', minWidth: '0', maxWidth: 'none', animation: 'none' } });
    let m;
    for (const it of items) {
      if (it === 'sep') { list.append(h('hr')); continue; }
      if (!it || it.hidden) continue;
      list.append(h('button', { type: 'button', class: it.danger ? 'danger' : '', onclick: () => { m.close(); it.onClick && it.onClick(); } }, it.icon ? icon(it.icon) : null, h('span', { text: it.label })));
    }
    m = Modal.open({ title: opts.title || 'Pilihan', body: list });
    return;
  }
  const el = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it === 'sep') { el.append(h('hr')); continue; }
    if (!it || it.hidden) continue;
    el.append(h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', onclick: () => { closeMenu(); it.onClick && it.onClick(); } },
      it.icon ? icon(it.icon) : null, h('span', { text: it.label }), it.kbd ? h('span', { class: 'kbd', text: it.kbd }) : null));
  }
  document.body.append(el);
  let x, y;
  if (anchor && anchor.getBoundingClientRect) {
    const r = anchor.getBoundingClientRect();
    x = r.right - el.offsetWidth; y = r.bottom + 6;
    if (x < 8) x = r.left;
  } else { x = anchor.x; y = anchor.y; }
  x = clamp(x, 8, innerWidth - el.offsetWidth - 8);
  if (y + el.offsetHeight > innerHeight - 8) y = Math.max(8, (anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect().top : y) - el.offsetHeight - 6);
  el.style.left = x + 'px'; el.style.top = y + 'px';
  openMenuEl = el;
  setTimeout(() => document.addEventListener('pointerdown', menuOutside, true), 0);
  const first = el.querySelector('button'); first && first.focus({ preventScroll: true });
  el.addEventListener('keydown', (e) => {
    const btns = $$('button', el); const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(); anchor && anchor.focus && anchor.focus(); }
  });
}
