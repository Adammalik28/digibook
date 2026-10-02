import path from 'node:path';
import { launch, reset, dump, shot, sleep, BASE, DOCS } from './harness.mjs';

const step = (s) => console.log('\n## ' + s);
await reset();
const { browser, page, errors, cdnHits } = await launch({ viewport: { width: 1366, height: 860 } });
try {
  step('load library');
  await page.goto(BASE + '/');
  await page.waitForSelector('#empty:not([hidden])', { timeout: 15000 });
  await shot(page, 'd01-empty');
  console.log('sync label:', await page.textContent('#syncState'));

  step('upload 5 files');
  await page.click('#btnUpload');
  await page.waitForSelector('.dialog .drop');
  await page.setInputFiles('#fileInput', ['modul-uji.pdf', 'modul-uji.docx', 'fitur-uji.docx', 'modul-uji.md', 'teks-cp1252.txt'].map((f) => path.join(DOCS, f)));
  await page.waitForFunction(() => document.querySelectorAll('.uq-status.ok, .uq-status.err').length === 5, null, { timeout: 90000 });
  const statuses = await page.$$eval('.uq-item', (els) => els.map((e) => e.querySelector('.uq-name').textContent + ' => ' + e.querySelector('.uq-status').textContent));
  console.log(statuses.join('\n'));
  await shot(page, 'd02-upload');
  await page.click('#upClose');
  await sleep(300);
  await shot(page, 'd03-shelf');
  const d = await dump();
  console.log('books:', Object.keys(d.db).filter((k) => k.startsWith('books/')).length, 'assets:', d.assets.map((a) => a.type + ':' + a.size).join(', '));

  step('open PDF');
  await page.locator('.card', { has: page.locator('.card-meta', { hasText: 'PDF' }) }).locator('.card-open').first().click();
  await page.waitForSelector('#reader:not([hidden])');
  await page.waitForSelector('.slot.R .pdfbox canvas', { timeout: 20000 });
  await sleep(800);
  await shot(page, 'd04-reader-open');
  console.log('pos:', await page.textContent('#rPos'), '| title:', await page.textContent('#rTitle'));
  console.log('book size:', await page.$eval('#book', (b) => b.style.width + ' x ' + b.style.height + ' ' + b.className));

  step('flip forward with key, capture mid-flip');
  await page.keyboard.press('ArrowRight');
  await sleep(260);
  await shot(page, 'd05-flip-mid');
  await sleep(700);
  await shot(page, 'd06-after-flip');
  console.log('pos:', await page.textContent('#rPos'));
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(80); }
  await sleep(1800);
  console.log('pos after 3 quick flips:', await page.textContent('#rPos'));
} catch (e) {
  console.error('TEST FAILED:', e);
  await shot(page, 'd99-fail');
} finally {
  console.log('\nERRORS:\n' + (errors.join('\n') || '(none)'));
  console.log('CDN hits:', cdnHits.length);
  await browser.close();
}
