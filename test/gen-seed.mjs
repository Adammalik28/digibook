import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { launch, sleep, BASE, dump, reset } from './harness.mjs';
const SEED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');
await reset();
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(BASE + '/');
  await page.waitForSelector('#empty:not([hidden])');
  await page.click('#btnUpload');
  await page.setInputFiles('#fileInput', [path.join(SEED, 'Panduan Pustakaku.md')]);
  await page.waitForSelector('.uq-status.ok, .uq-status.err', { timeout: 30000 });
  console.log('status:', await page.textContent('.uq-status'));
  const d = await dump();
  const [k, book] = Object.entries(d.db).find(([key]) => key.startsWith('books/'));
  const content = await (await fetch(BASE + '/_blob/' + book.content.id)).text();
  const original = await (await fetch(BASE + '/_blob/' + book.file.id)).text();
  fs.writeFileSync(path.join(SEED, 'panduan-content.json'), content);
  fs.writeFileSync(path.join(SEED, 'panduan-original.md'), original);
  fs.writeFileSync(path.join(SEED, 'panduan-book.json'), JSON.stringify(book, null, 1));
  console.log('book doc:', JSON.stringify(book).slice(0, 600));
  console.log('content bytes:', content.length, 'original bytes:', original.length);
  console.log('ERRORS:', errors.join('\n') || '(none)');
} finally { await browser.close(); }
