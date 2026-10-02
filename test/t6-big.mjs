// Large PDF (chunked storage), cover regeneration, viewer-mode progress on device.
import path from 'node:path';
import { launch, shot, sleep, BASE, DOCS, dump } from './harness.mjs';
const step = (s) => console.log('\n## ' + s);
{
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(BASE + '/');
    await page.waitForSelector('.card .card-open');
    step('upload 48 MiB PDF');
    await page.click('#btnUpload');
    await page.waitForSelector('.dialog .drop');
    const t0 = Date.now();
    await page.setInputFiles('#fileInput', [path.join(DOCS, 'besar-25mb.pdf')]);
    await page.waitForSelector('.uq-status.ok, .uq-status.err', { timeout: 180000 });
    console.log('status:', await page.textContent('.uq-status'), 'in', Date.now() - t0, 'ms');
    await page.click('#upClose');
    const d = await dump();
    const big = Object.entries(d.db).find(([k, v]) => k.startsWith('books/') && v.fileName === 'besar-25mb.pdf');
    console.log('stored file ref:', JSON.stringify(big && big[1].file).slice(0, 200));
    step('open big PDF');
    await page.locator('.card[data-id="' + big[0].slice(6) + '"] .card-open').click();
    await page.waitForSelector('.slot .pdfbox canvas', { timeout: 60000 });
    await sleep(800);
    console.log('pos:', await page.textContent('#rPos'));
    await shot(page, 'b01-big-open');
    await page.keyboard.press('Escape');
    await page.waitForSelector('#reader', { state: 'hidden' });
    step('cover: cloth then first page again');
    const card = page.locator('.card[data-id="' + big[0].slice(6) + '"]');
    await card.locator('.card-menu').click();
    await page.locator('.menu button', { hasText: 'Ubah info' }).click();
    await page.waitForSelector('#edTitle');
    await page.locator('.dialog button', { hasText: 'Pakai sampul kain' }).click();
    await page.locator('.dialog footer .btn', { hasText: 'Simpan' }).click();
    await sleep(800);
    console.log('cover after cloth:', await card.locator('.cover').getAttribute('class'));
    await card.locator('.card-menu').click();
    await page.locator('.menu button', { hasText: 'Ubah info' }).click();
    await page.waitForSelector('#edTitle');
    await page.locator('.dialog button', { hasText: 'Pakai halaman pertama' }).click();
    await page.locator('.dialog footer .btn', { hasText: 'Simpan' }).click();
    await page.waitForFunction((id) => !!document.querySelector(`.card[data-id="${id}"] .cover img`), big[0].slice(6), { timeout: 20000 });
    console.log('cover after first page: has img');
    await shot(page, 'b02-shelf');
    step('delete big book');
    await card.locator('.card-menu').click();
    await page.locator('.menu button', { hasText: 'Hapus buku' }).click();
    await page.locator('.dialog footer .btn', { hasText: 'Hapus' }).click();
    await sleep(1500);
    const d2 = await dump();
    console.log('book deleted:', !Object.keys(d2.db).includes(big[0]), '| assets left:', d2.assets.length, '(before', d.assets.length + ')');
    console.log('ERRORS:', errors.join('\n') || '(none)');
  } catch (e) { console.error('TEST FAILED', e); await shot(page, 'b99-fail'); } finally { await browser.close(); }
}
{
  const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
  try {
    step('viewer mode keeps progress on device');
    await page.goto(BASE + '/');
    await page.waitForSelector('.card .card-open');
    console.log('banner:', await page.textContent('#banner'));
    await page.locator('.card[data-kind="md"] .card-open').first().click();
    await page.waitForSelector('.slot .page.flow');
    await page.keyboard.press('ArrowRight');
    await sleep(900);
    const p1 = await page.textContent('#rPos');
    await page.keyboard.press('b');
    await sleep(400);
    await page.keyboard.press('Escape');
    await sleep(500);
    await page.reload();
    await page.waitForSelector('.card .card-open');
    await page.locator('.card[data-kind="md"] .card-open').first().click();
    await page.waitForSelector('.slot .page.flow');
    await sleep(600);
    console.log('viewer pos before/after reload:', p1, '=>', await page.textContent('#rPos'), '| ribbons:', await page.$$eval('.slot .ribbon', (x) => x.length));
    console.log('ERRORS:', errors.join('\n') || '(none)');
  } catch (e) { console.error('TEST FAILED', e); await shot(page, 'b98-fail'); } finally { await browser.close(); }
}
