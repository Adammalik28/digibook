// Playwright harness: maps CDN URLs to the locally installed copies of the same versions.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
// Folder node_modules berisi pustaka yang sama versinya dengan CDN (lihat package.json).
// Bisa diganti lewat variabel lingkungan NM=/jalur/ke/node_modules
const NM = process.env.NM || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../node_modules');
const require = createRequire(NM + '/');
const { chromium } = require('playwright');
export const BASE = 'http://localhost:8766';
export const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../testdocs');
export const SHOTS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../out/shots');
fs.mkdirSync(SHOTS, { recursive: true });

function localFor(url) {
  let m = url.match(/^https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[^/]+\/)?[^@/]+)@([^/]+)\/(.+)$/);
  if (m) {
    const [, pkg, ver, rest] = m;
    const pj = JSON.parse(fs.readFileSync(path.join(NM, pkg, 'package.json'), 'utf8'));
    if (pj.version !== ver) throw new Error(`version mismatch for ${pkg}: want ${ver}, local ${pj.version}`);
    return path.join(NM, pkg, rest);
  }
  m = url.match(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jszip\/3\.10\.1\/jszip\.min\.js$/);
  if (m) return path.join(NM, 'jszip/dist/jszip.min.js');
  return null;
}

export async function launch(opts = {}) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({
    viewport: opts.viewport || { width: 1366, height: 860 },
    deviceScaleFactor: opts.dpr || 1,
    isMobile: !!opts.isMobile,
    hasTouch: !!opts.hasTouch,
    colorScheme: opts.colorScheme || 'light',
    reducedMotion: opts.reducedMotion || 'no-preference',
  });
  const cdnHits = [];
  await context.route(/^https:\/\/(cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com)\//, async (route) => {
    const url = route.request().url();
    let file;
    try { file = localFor(url); } catch (e) { console.error(String(e)); }
    if (!file || !fs.existsSync(file)) { console.error('CDN MISS', url); return route.fulfill({ status: 404, body: 'missing' }); }
    cdnHits.push(url);
    await route.fulfill({ status: 200, body: fs.readFileSync(file), headers: { 'content-type': 'text/javascript; charset=utf-8', 'access-control-allow-origin': '*' } });
  });
  await context.route(/^https:\/\/fonts\.googleapis\.com\//, (route) => route.fulfill({ status: 200, body: '/* fonts stub */', headers: { 'content-type': 'text/css' } }));
  await context.route(/^https:\/\/fonts\.gstatic\.com\//, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  return { browser, context, page, errors, cdnHits };
}
export async function reset() { /* data tersimpan di IndexedDB; konteks browser baru selalu kosong */ }
export async function dump() { return {}; }
export async function shot(page, name, opts = {}) { await page.screenshot({ path: path.join(SHOTS, name + '.png'), ...opts }); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
