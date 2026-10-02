// Reflowable (Word/Markdown/text) reading on desktop: pagination integrity, highlights, relayout.
import { launch, shot, sleep, BASE, dump } from './harness.mjs';
const step = (s) => console.log('\n## ' + s);
const { browser, page, errors } = await launch({ viewport: { width: 1366, height: 860 } });
const pos = () => page.textContent('#rPos');

async function openByTitleAndKind(title, kindWord) {
  await page.locator('.card', { has: page.locator('.card-title', { hasText: title }) }).and(page.locator(`.card[data-kind="${kindWord}"]`)).locator('.card-open').first().click();
  await page.waitForSelector('.slot .page.flow .flow-c', { timeout: 20000 });
  await sleep(500);
}
async function checkAllPages(label) {
  const res = await page.evaluate(async () => {
    const slider = document.querySelector('#slider');
    const N = +slider.max;
    const problems = [];
    const texts = new Map();
    for (let i = 1; i <= N; i++) {
      slider.value = String(i);
      slider.dispatchEvent(new Event('change'));
      await new Promise((r) => setTimeout(r, 30));
      for (const pg of document.querySelectorAll('.slot .page.flow')) {
        const idx = +pg.dataset.i;
        const pc = pg.querySelector('.pc');
        const lastEl = pg.querySelector('.flow-c').lastElementChild;
        const bottom = lastEl ? lastEl.offsetTop + lastEl.offsetHeight : 0;
        if (bottom > pc.clientHeight + 1) problems.push(`page ${idx + 1}: overflow ${bottom - pc.clientHeight}px`);
        const fc = pg.querySelector('.flow-c');
        const clone = fc.cloneNode(true);
        clone.querySelectorAll('[data-rep]').forEach((x) => x.remove());
        texts.set(idx, clone.textContent.replace(/\s+/g, ''));
        if (!clone.textContent.trim() && !fc.querySelector('img')) problems.push(`page ${idx + 1}: empty`);
      }
    }
    const total = [...texts.entries()].sort((a, b) => a[0] - b[0]).map((x) => x[1]).join('');
    return { N, problems, totalLen: total.length, seen: texts.size };
  });
  console.log(`[${label}] pages=${res.N} seen=${res.seen} textLen=${res.totalLen} problems=${res.problems.length}`, res.problems.slice(0, 8).join('; '));
  return res;
}
try {
  await page.goto(BASE + '/');
  await page.waitForSelector('.card .card-open');
  const d = await dump();
  // reference text length of the Word module from its stored content JSON
  const bookDocs = Object.entries(d.db).filter(([k]) => k.startsWith('books/')).map(([k, v]) => ({ id: k.slice(6), ...v }));
  const refLen = {};
  for (const b of bookDocs) {
    if (!b.content || !b.content.id) continue;
    const json = await (await fetch(BASE + '/_blob/' + b.content.id)).json();
    refLen[b.title + '|' + b.kind] = await page.evaluate((html) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.textContent.replace(/\s+/g, '').length; }, json.html);
  }
  console.log('reference text lengths:', JSON.stringify(refLen));

  step('open Word module');
  await openByTitleAndKind('Modul Uji Pustakaku', 'docx');
  await shot(page, 'f01-docx-open');
  console.log('pos:', await pos(), '| book:', await page.$eval('#book', (b) => b.style.width + 'x' + b.style.height + ' ' + b.className));
  const r1 = await checkAllPages('docx default');
  console.log('text coverage vs source:', r1.totalLen, '/', refLen['Modul Uji Pustakaku|docx']);
  await page.evaluate(() => { const s = document.querySelector('#slider'); s.value = '3'; s.dispatchEvent(new Event('change')); });
  await sleep(300);
  await shot(page, 'f02-docx-p3');

  step('highlight in flow page');
  const sel = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.slot.R .flow-c p')].find((x) => x.textContent.length > 120);
    if (!p) return 'no p';
    const tn = [...p.childNodes].find((n) => n.nodeType === 3 && n.length > 60) || p.firstChild;
    const r = document.createRange();
    r.setStart(tn, 10); r.setEnd(tn, 55);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    return s.toString();
  });
  console.log('selected:', sel);
  await page.waitForSelector('#selBar:not([hidden])', { timeout: 4000 });
  await page.click('#selBar .dot.y');
  await sleep(400);
  const marked = await page.$$eval('.slot mark.hl', (m) => m.map((x) => x.textContent).join(''));
  console.log('marked text:', JSON.stringify(marked), 'equal:', marked === sel);
  await shot(page, 'f03-flow-highlight');

  step('bigger font -> relayout keeps position & highlight');
  const before = await pos();
  await page.click('#rType');
  await page.waitForSelector('#panel .stepper');
  for (let i = 0; i < 3; i++) { await page.click('#panel .stepper button[aria-label="Perbesar huruf"]'); await sleep(400); }
  await page.locator('#panel .chip', { hasText: 'Inden seperti buku' }).click();
  await sleep(600);
  await page.click('#panel .panel-head .icon-btn');
  await sleep(300);
  console.log('pos before/after:', before, '=>', await pos());
  const marked2 = await page.$$eval('.slot mark.hl', (m) => m.map((x) => x.textContent).join(''));
  console.log('highlight still visible on current view:', JSON.stringify(marked2));
  await shot(page, 'f04-bigger-font');
  const r2 = await checkAllPages('docx font+3 indent');
  console.log('text coverage vs source:', r2.totalLen, '/', refLen['Modul Uji Pustakaku|docx']);
  // restore defaults
  await page.click('#rType');
  for (let i = 0; i < 3; i++) { await page.click('#panel .stepper button[aria-label="Perkecil huruf"]'); await sleep(300); }
  await page.locator('#panel .chip', { hasText: 'Berjarak' }).click();
  await sleep(400);
  await page.click('#panel .panel-head .icon-btn');

  step('internal link (footnote) navigation');
  const fn = await page.evaluate(async () => {
    const s = document.querySelector('#slider');
    for (let i = 1; i <= +s.max; i++) { s.value = String(i); s.dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 20)); const a = document.querySelector('.slot .fn-ref a'); if (a) return a.getAttribute('href') + ' on ' + document.querySelector('#rPos').textContent; }
    return null;
  });
  console.log('footnote ref found:', fn);
  if (fn) { await page.click('.slot .fn-ref a'); await sleep(900); console.log('after footnote click:', await pos()); await shot(page, 'f05-footnotes'); }

  step('back, open fitur-uji.docx');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#reader', { state: 'hidden' });
  await openByTitleAndKind('Fitur Word Lengkap', 'docx');
  await shot(page, 'f06-fitur-1');
  const r3 = await checkAllPages('fitur');
  console.log('text coverage vs source:', r3.totalLen, '/', refLen['Fitur Word Lengkap|docx']);
  const struct = await page.evaluate(() => {
    const out = [];
    const s = document.querySelector('#slider');
    s.value = '1'; s.dispatchEvent(new Event('change'));
    const fc = [...document.querySelectorAll('.slot .flow-c')];
    for (const f of fc) {
      out.push('tables=' + f.querySelectorAll('table').length + ' colspan=' + f.querySelectorAll('[colspan]').length + ' rowspan=' + f.querySelectorAll('[rowspan]').length + ' ul=' + f.querySelectorAll('ul').length + ' ol=' + f.querySelectorAll('ol').length + ' img=' + f.querySelectorAll('img').length + ' sub=' + f.querySelectorAll('sub').length + ' sup=' + f.querySelectorAll('sup').length + ' links=' + f.querySelectorAll('a[href^="http"]').length + ' bq=' + f.querySelectorAll('blockquote').length);
    }
    return out;
  });
  console.log('structure:', struct.join(' || '));
  await page.evaluate(() => { const s = document.querySelector('#slider'); s.value = '3'; s.dispatchEvent(new Event('change')); });
  await sleep(300);
  await shot(page, 'f07-fitur-2');

  step('markdown & text books');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#reader', { state: 'hidden' });
  await openByTitleAndKind('Modul Uji Pustakaku', 'md');
  await shot(page, 'f08-md');
  const r4 = await checkAllPages('md');
  console.log('text coverage vs source:', r4.totalLen, '/', refLen['Modul Uji Pustakaku|md']);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#reader', { state: 'hidden' });
  await openByTitleAndKind('teks-cp1252', 'txt');
  await shot(page, 'f09-txt');
  const r5 = await checkAllPages('txt');
  console.log('text coverage vs source:', r5.totalLen, '/', refLen['teks-cp1252|txt']);
} catch (e) {
  console.error('TEST FAILED:', e);
  await shot(page, 'f99-fail');
} finally {
  console.log('\nERRORS:\n' + (errors.join('\n') || '(none)'));
  await browser.close();
}
