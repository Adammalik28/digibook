// PDF reader features on desktop (expects books uploaded by t1).
import { launch, shot, sleep, BASE } from './harness.mjs';
const step = (s) => console.log('\n## ' + s);
const { browser, page, errors } = await launch({ viewport: { width: 1366, height: 860 } });
const pos = () => page.textContent('#rPos');
try {
  await page.goto(BASE + '/');
  await page.waitForSelector('.card .card-open');
  await page.locator('.card[data-kind="pdf"] .card-open').first().click();
  await page.waitForSelector('.slot.R .pdfbox canvas', { timeout: 20000 });
  await sleep(600);
  console.log('restored pos:', await pos());

  step('TOC');
  await page.keyboard.press('t');
  await page.waitForSelector('#panel:not([hidden]) .toc-list button', { timeout: 8000 });
  console.log('toc items:', await page.$$eval('.toc-list button', (b) => b.length), (await page.$$eval('.toc-list button', (b) => b.slice(0, 4).map((x) => x.textContent))).join(' | '));
  await shot(page, 'p07-toc');
  await page.locator('.toc-list button').nth(5).click();
  await sleep(400);
  console.log('after toc click:', await pos());

  step('search');
  await page.keyboard.press('/');
  await page.fill('#searchInput', 'Neraca');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /hasil|Tidak ada/.test(document.querySelector('#panel .hint')?.textContent || ''), null, { timeout: 15000 });
  console.log('search status:', await page.textContent('#panel .hint'));
  await page.locator('.result').nth(2).click();
  await sleep(900);
  console.log('after result click:', await pos(), 'hits drawn:', await page.$$eval('.slot .hl-layer i.hit', (x) => x.length));
  await shot(page, 'p08-search-hit');
  await page.click('#panel .panel-head .icon-btn');

  step('highlight text in PDF');
  const sel = await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.slot.R .textLayer span')].filter((s) => s.textContent.trim().length > 25);
    if (spans.length < 3) return 'no spans';
    const r = document.createRange();
    r.setStart(spans[1].firstChild, 0);
    r.setEnd(spans[2].firstChild, Math.min(15, spans[2].firstChild.length));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return s.toString();
  });
  console.log('selected:', JSON.stringify(sel).slice(0, 120));
  await page.waitForSelector('#selBar:not([hidden])', { timeout: 4000 });
  await shot(page, 'p09-selbar');
  await page.click('#selBar .dot.g');
  await sleep(500);
  console.log('green rects:', await page.$$eval('.slot.R .hl-layer i.g', (x) => x.length));
  await shot(page, 'p10-highlight');

  step('bookmark');
  await page.keyboard.press('b');
  await sleep(400);
  console.log('ribbons:', await page.$$eval('.slot .ribbon', (x) => x.length), 'mark pressed:', await page.getAttribute('#rMark', 'aria-pressed'));

  step('notes panel & export');
  await page.keyboard.press('n');
  await page.waitForSelector('#panel .ann');
  console.log('ann cards:', await page.$$eval('#panel .ann', (x) => x.length));
  await shot(page, 'p11-notes');
  await page.click('#panel button:has-text("Ekspor .md")');
  await sleep(500);
  console.log('downloads:', JSON.stringify(await page.evaluate(() => window.__downloads)).slice(0, 400));
  await page.click('#panel .panel-head .icon-btn');

  step('zoom');
  await page.keyboard.press('z');
  await page.waitForSelector('#zoom:not([hidden]) #zContent canvas', { timeout: 8000 });
  await sleep(300);
  await shot(page, 'p12-zoom');
  await page.keyboard.press('+');
  await sleep(500);
  console.log('zoom level:', await page.textContent('#zLvl'));
  await page.keyboard.press('Escape');
  await sleep(200);
  console.log('zoom hidden:', await page.$eval('#zoom', (z) => z.hidden));

  step('ask claude');
  await page.click('#rAsk');
  await page.waitForSelector('#panel .quick .chip');
  await shot(page, 'p13-ask-empty');
  await page.locator('#panel .quick .chip').first().click();
  await page.waitForFunction(() => /Ringkasan/.test(document.querySelector('#panel .msg.bot .bubble')?.textContent || ''), null, { timeout: 10000 });
  await sleep(600);
  await shot(page, 'p14-ask-answer');
  const prompt = await page.evaluate(() => window.__lastPrompt || '');
  console.log('prompt head:', prompt.slice(0, 260).replace(/\n/g, ' / '));
  await page.click('#panel .panel-head .icon-btn');

  step('settings: paper & layout');
  await page.click('#rType');
  await page.waitForSelector('#panel .paper-opt');
  await page.locator('#panel .paper-opt', { hasText: 'Krem' }).click();
  await sleep(300);
  await shot(page, 'p15-settings-krem');
  await page.locator('#panel .chip', { hasText: '1 halaman' }).click();
  await sleep(700);
  console.log('book class:', await page.$eval('#book', (b) => b.className), await pos());
  await page.locator('#panel .paper-opt', { hasText: 'Malam' }).click();
  await sleep(400);
  await shot(page, 'p16-malam-single');
  await page.locator('#panel .chip', { hasText: 'Otomatis' }).first().click();
  await page.locator('#panel .paper-opt', { hasText: 'Otomatis' }).click();
  await sleep(500);
  await page.click('#panel .panel-head .icon-btn');

  step('drag flip with mouse from edge');
  const box = await page.$eval('#book', (b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
  const y = (box.t + box.b) / 2;
  const before = await pos();
  await page.mouse.move(box.r - 20, y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(box.r - 20 - i * 45, y - i * 2); await sleep(16); }
  await shot(page, 'p17-drag-mid');
  await page.mouse.up();
  await sleep(800);
  console.log('drag flip:', before, '->', await pos());

  step('back to library');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#reader', { state: 'hidden' });
  await sleep(300);
  await shot(page, 'p18-library-continue');
  console.log('continue card:', await page.$eval('#cont', (c) => (c.hidden ? 'hidden' : c.textContent.slice(0, 120))));
} catch (e) {
  console.error('TEST FAILED:', e);
  await shot(page, 'p99-fail');
} finally {
  console.log('\nERRORS:\n' + (errors.join('\n') || '(none)'));
  await browser.close();
}
