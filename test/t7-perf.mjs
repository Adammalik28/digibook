import path from 'node:path';
import { launch, sleep, BASE, DOCS } from './harness.mjs';
for (const vp of [{ width: 1366, height: 860 }, { width: 390, height: 844, mobile: true }]) {
  const { browser, page, errors } = await launch({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.mobile, hasTouch: !!vp.mobile });
  const cdp = await page.context().newCDPSession(page);
  if (vp.mobile) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  try {
    await page.goto(BASE + '/');
    await page.waitForSelector('.card .card-open');
    if (!(await page.$('.card .card-title:text("Modul Besar Uji")'))) {
      await page.click('#btnUpload');
      await page.setInputFiles('#fileInput', [path.join(DOCS, 'besar.docx')]);
      await page.waitForSelector('.uq-status.ok, .uq-status.err', { timeout: 120000 });
      console.log('upload:', await page.textContent('.uq-status'));
      await page.click('#upClose');
    }
    const t0 = Date.now();
    await page.locator('.card', { has: page.locator('.card-title', { hasText: 'Modul Besar Uji' }) }).locator('.card-open').first().click();
    await page.waitForSelector('.slot .page.flow .flow-c', { timeout: 120000 });
    const t1 = Date.now();
    console.log(vp.width + 'px' + (vp.mobile ? ' (4x CPU throttle)' : '') + ': open+paginate', t1 - t0, 'ms ->', await page.textContent('#rPos'));
    const t2 = Date.now();
    await page.keyboard.press('ArrowRight');
    await sleep(700);
    await page.keyboard.press('ArrowRight');
    await sleep(700);
    console.log('two flips ok:', await page.textContent('#rPos'));
    console.log('ERRORS:', errors.join('\n') || '(none)');
  } finally { await browser.close(); }
}
