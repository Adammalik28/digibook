import { launch, shot, sleep, BASE } from './harness.mjs';
const { browser, page, errors } = await launch({ viewport: { width: 1280, height: 800 } });
try {
  await page.goto(BASE + '/');
  await page.waitForSelector('.card .card-open');
  // library exports
  await page.click('#btnLibMenu');
  await page.locator('.menu button', { hasText: 'Ekspor semua catatan' }).click();
  await sleep(1500);
  await page.click('#btnLibMenu');
  await page.locator('.menu button', { hasText: 'Cadangkan data' }).click();
  await sleep(1500);
  const dl = await page.evaluate(() => window.__downloads.map((d) => d.filename + ' (' + d.size + ')'));
  console.log('downloads:', dl.join(' | '));
  // PDF thumbnails
  await page.locator('.card[data-kind="pdf"] .card-open').first().click();
  await page.waitForSelector('.slot .pdfbox canvas');
  await page.keyboard.press('t');
  await page.locator('#panel .tabs button', { hasText: 'Halaman' }).click();
  await sleep(2500);
  const thumbs = await page.$$eval('#panel .thumb canvas', (cs) => cs.filter((c) => c.width > 0).length);
  console.log('rendered thumbs:', thumbs);
  await shot(page, 'x-thumbs');
  await page.locator('#panel .thumb').nth(9).click();
  await sleep(500);
  console.log('after thumb click:', await page.textContent('#rPos'));
  await page.click('#panel .panel-head .icon-btn');
  // TTS bar
  await page.click('#rMore');
  const hasTts = await page.locator('.menu button', { hasText: 'Bacakan' }).count();
  console.log('tts menu item:', hasTts);
  if (hasTts) { await page.locator('.menu button', { hasText: 'Bacakan' }).click(); await sleep(800); console.log('tts bar visible:', await page.isVisible('#ttsBar'), await page.textContent('#ttsBar')); await shot(page, 'x-tts'); await page.click('#ttsBar button[aria-label="Berhenti membacakan"]'); }
  else await page.keyboard.press('Escape');
  // Ask with selection
  await page.evaluate(() => {
    const spans = [...document.querySelectorAll('.slot.R .textLayer span')].filter((s) => s.textContent.trim().length > 20);
    const r = document.createRange(); r.setStart(spans[0].firstChild, 0); r.setEnd(spans[0].firstChild, spans[0].firstChild.length);
    getSelection().removeAllRanges(); getSelection().addRange(r);
  });
  await page.waitForSelector('#selBar:not([hidden])');
  await page.click('#selBar button[aria-label="Tanya Claude tentang teks ini"]');
  await page.waitForSelector('#panel .ask-ctx');
  console.log('ask ctx chips:', await page.$$eval('#panel .ask-ctx .chip', (c) => c.map((x) => x.textContent + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' ')));
  await page.fill('#askInput', 'Apa maksud kalimat ini?');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => /Ringkasan/.test(document.querySelector('#panel .msg.bot .bubble')?.textContent || ''), null, { timeout: 10000 });
  console.log('prompt has selection:', /Teks terpilih/.test(await page.evaluate(() => window.__lastPrompt)));
  await page.locator('#panel .msg.bot button', { hasText: 'Simpan ke catatan' }).click();
  await sleep(500);
  await page.keyboard.press('n');
  await sleep(500);
  console.log('note cards:', await page.$$eval('#panel .ann .note', (n) => n.length));
  console.log('ERRORS:', errors.join('\n') || '(none)');
} catch (e) { console.error('TEST FAILED', e); await shot(page, 'x99'); } finally { await browser.close(); }
