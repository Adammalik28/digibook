import path from 'node:path';
import { launch, shot, sleep, BASE, DOCS } from './harness.mjs';
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(BASE + '/');
  await page.waitForSelector('.lib-head');
  await sleep(500);
  await page.setInputFiles('#localInput', [path.join(DOCS, 'fitur-uji.docx')]);
  await page.waitForSelector('.slot .page.flow .flow-c', { timeout: 20000 });
  await sleep(500);
  console.log('temp note:', await page.textContent('#tempNote'), '| title:', await page.textContent('#rTitle'));
  await shot(page, 't-temp');
  const n = (await page.$$('.card')).length;
  await page.click('#tempNote .btn');
  await page.waitForSelector('.uq-status.ok, .uq-status.err, .dialog footer .btn:has-text("Unggah lagi")', { timeout: 30000 });
  if (await page.$('.dialog footer .btn:has-text("Unggah lagi")')) await page.click('.dialog footer .btn:has-text("Unggah lagi")');
  await page.waitForSelector('.uq-status.ok, .uq-status.err', { timeout: 30000 });
  console.log('save from temp:', await page.textContent('.uq-status'));
  await page.click('#upClose');
  await page.keyboard.press('Escape');
  await sleep(600);
  console.log('cards before/after:', n, (await page.$$('.card')).length);
  await page.setInputFiles('#localInput', [path.join(DOCS, 'make_docs.py')]);
  await sleep(600);
  console.log('unsupported toast:', await page.textContent('#toasts'));
  console.log('ERRORS:', errors.join('\n') || '(none)');
} catch (e) { console.error('TEST FAILED', e); await shot(page, 't99'); } finally { await browser.close(); }
