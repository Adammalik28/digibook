import { launch, shot, sleep, BASE } from './harness.mjs';
for (const [name, vp, mob] of [['g-desk', { width: 1366, height: 860 }, false], ['g-phone', { width: 390, height: 844 }, true], ['g-tablet', { width: 820, height: 1180 }, true]]) {
  const { browser, page, errors } = await launch({ viewport: vp, isMobile: mob, hasTouch: mob, dpr: mob ? 2 : 1 });
  try {
    await page.goto(BASE + '/');
    await page.waitForSelector('.card .card-open');
    await sleep(300);
    await shot(page, name + '-0-library');
    await page.locator('.card .card-open').first().click();
    await page.waitForSelector('.slot .page.flow .flow-c');
    await sleep(600);
    await shot(page, name + '-1');
    for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await sleep(750); }
    await shot(page, name + '-2');
    console.log(name, await page.textContent('#rPos'), errors.join('\n') || '');
  } finally { await browser.close(); }
}
