// Phone-size checks with real touch input (CDP touch events).
import { launch, shot, sleep, BASE } from './harness.mjs';
const step = (s) => console.log('\n## ' + s);
const scheme = process.argv[2] || 'light';
const { browser, page, errors } = await launch({ viewport: { width: 390, height: 844 }, dpr: 2, isMobile: true, hasTouch: true, colorScheme: scheme });
const client = await page.context().newCDPSession(page);
const pos = () => page.textContent('#rPos');
const T = (type, pts) => client.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
async function tap(x, y) { await T('touchStart', [[x, y]]); await sleep(40); await T('touchEnd', []); await sleep(60); }
async function swipe(x1, y1, x2, y2, steps = 12, dur = 240, shotName) {
  await T('touchStart', [[x1, y1]]);
  for (let i = 1; i <= steps; i++) {
    await T('touchMove', [[x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps]]);
    await sleep(dur / steps);
    if (shotName && i === Math.round(steps * 0.6)) await shot(page, shotName);
  }
  await T('touchEnd', []);
}
async function pinch(cx, cy, d0, d1) {
  await T('touchStart', [[cx - d0 / 2, cy], [cx + d0 / 2, cy]]);
  for (let i = 1; i <= 10; i++) { const d = d0 + ((d1 - d0) * i) / 10; await T('touchMove', [[cx - d / 2, cy], [cx + d / 2, cy]]); await sleep(20); }
  await T('touchEnd', []);
}
const P = scheme === 'dark' ? 'k' : 'm';
try {
  step('library on phone');
  await page.goto(BASE + '/');
  await page.waitForSelector('.card .card-open');
  await sleep(400);
  await shot(page, P + '01-library');
  await shot(page, P + '01b-library-full', { fullPage: true });

  step('open PDF on phone');
  await page.locator('.card[data-kind="pdf"] .card-open').first().click();
  await page.waitForSelector('.slot.R .pdfbox canvas', { timeout: 20000 });
  await sleep(700);
  console.log('mode:', await page.$eval('#book', (b) => b.className + ' ' + b.style.width + 'x' + b.style.height), await pos());
  await shot(page, P + '02-pdf');
  const before = await pos();
  await tap(370, 420);
  await sleep(900);
  console.log('tap right edge:', before, '->', await pos());
  await swipe(330, 420, 40, 430, 12, 260, P + '03-swipe-mid');
  await sleep(900);
  console.log('after swipe left:', await pos());
  await swipe(60, 420, 340, 420, 10, 200);
  await sleep(900);
  console.log('after swipe right:', await pos());
  await tap(195, 420);
  await sleep(500);
  console.log('chrome hidden:', await page.$eval('#reader', (r) => r.classList.contains('chrome-hidden')));
  await shot(page, P + '04-chrome-toggle');
  await tap(195, 420);
  await sleep(500);

  step('pinch to zoom');
  await pinch(195, 420, 80, 220);
  await sleep(900);
  console.log('zoom visible:', await page.$eval('#zoom', (z) => !z.hidden), await page.textContent('#zLvl'));
  await shot(page, P + '05-zoom');
  await swipe(200, 500, 120, 300, 8, 150);
  await sleep(400);
  await shot(page, P + '05b-zoom-pan');
  await page.click('#zClose');
  await sleep(300);

  step('menu + navigation sheet');
  await page.click('#rMore');
  await sleep(300);
  await shot(page, P + '06-menu');
  await page.locator('.dialog .menu button', { hasText: 'Daftar isi' }).click();
  await page.waitForSelector('#panel:not([hidden]) .toc-list');
  await sleep(400);
  await shot(page, P + '07-sheet');
  await page.click('#panel .panel-head .icon-btn');
  await sleep(200);

  step('open Word module on phone');
  await page.click('#rBack');
  await page.waitForSelector('#reader', { state: 'hidden' });
  await page.locator('.card[data-kind="docx"]', { has: page.locator('.card-title', { hasText: 'Modul Uji' }) }).locator('.card-open').first().click();
  await page.waitForSelector('.slot .page.flow .flow-c', { timeout: 20000 });
  await sleep(700);
  console.log('docx mode:', await page.$eval('#book', (b) => b.className + ' ' + b.style.width + 'x' + b.style.height), await pos());
  await page.evaluate(() => { const s = document.querySelector('#slider'); s.value = '3'; s.dispatchEvent(new Event('change')); });
  await sleep(400);
  await shot(page, P + '08-docx');
  await swipe(330, 420, 60, 420, 12, 240);
  await sleep(900);
  console.log('docx after swipe:', await pos());
  await shot(page, P + '09-docx-next');
  const sel = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.slot.R .flow-c p')].find((x) => x.textContent.length > 80);
    if (!p) return null;
    const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.length > 40);
    const r = document.createRange(); r.setStart(tn, 0); r.setEnd(tn, 30);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    return getSelection().toString();
  });
  await page.waitForSelector('#selBar:not([hidden])');
  await sleep(200);
  await shot(page, P + '10-selbar');
  await page.evaluate(() => getSelection().removeAllRanges());
  await sleep(300);

  step('settings sheet on phone');
  await page.click('#rType');
  await page.waitForSelector('#panel .papers');
  await sleep(300);
  await shot(page, P + '11-settings');
  await page.click('#panel .panel-head .icon-btn');

  step('rotate to landscape');
  await page.setViewportSize({ width: 844, height: 390 });
  await sleep(1200);
  console.log('landscape mode:', await page.$eval('#book', (b) => b.className + ' ' + b.style.width + 'x' + b.style.height), await pos());
  await shot(page, P + '12-landscape');
  await page.setViewportSize({ width: 390, height: 844 });
  await sleep(1200);
  console.log('back to portrait:', await pos());
} catch (e) {
  console.error('TEST FAILED:', e);
  await shot(page, P + '99-fail');
} finally {
  console.log('\nERRORS:\n' + (errors.join('\n') || '(none)'));
  await browser.close();
}
