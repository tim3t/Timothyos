// LOG keeps still while you write (2.62.1; simulated bridge 1.10 :8101, PIN 135790; all text invented). Timothy: typing
// or Enter in LOG made the screen jump, to the top in portrait and the bottom in landscape. The editor used to measure
// itself by setting its height to "auto" on every key, which shrank it to 320 px for a moment and the page under the
// caret with it. Now a hidden copy is measured: the editor's height is never "auto" and never drops while text is
// added, the page (portrait) or #content (landscape) stays where it was, and the editor is as tall as its text.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64);

(async () => {
  await fetch('http://127.0.0.1:8101/x/exec?action=unlockreset&key=' + K);   /* app_e2e22 ends on the five-miss lockout */
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[820, 1180], [1180, 820]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8080/');
    await p.evaluate(k => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8101/macros/s/test/exec', key: k })); localStorage.setItem('tos.start.v1', '"today"'); }, K);
    await p.reload(); await p.waitForTimeout(1500);
    await p.click('[data-screen="log"].nav'); await p.waitForTimeout(400);
    for (const k of '135790') await p.click('[data-lpin="' + k + '"]');
    await p.waitForSelector('.cl-text', { timeout: 10000 });
    await p.click('.cl-text');
    await p.keyboard.type(Array.from({ length: 50 }, (_, i) => 'Invented line ' + i + ' of sample writing for the test.').join('\n'));
    await p.waitForTimeout(300);
    const where = () => p.evaluate(() => ({ y: Math.round(scrollY), c: document.getElementById('content').scrollTop, ta: document.querySelector('.cl-text').offsetHeight, doc: document.documentElement.scrollHeight }));
    // watch every height the editor is given while typing at the end of a long entry
    await p.evaluate(() => {
      const ta = document.querySelector('.cl-text'); window.__h = [];
      new MutationObserver(() => window.__h.push(ta.style.height)).observe(ta, { attributes: true, attributeFilter: ['style'] });
    });
    const at0 = await where();
    assert.ok(at0.ta > 1000, 'the editor grew with its text: ' + JSON.stringify(at0));
    assert.ok((w < 860 ? at0.y : at0.c) > 300, 'scrolled down to the caret: ' + JSON.stringify(at0));
    for (const key of ['a', 'b', 'Enter', 'c', 'Enter', 'Enter', 'd']) { await p.keyboard.press(key); await p.waitForTimeout(60); }
    const at1 = await where(), hs = await p.evaluate(() => window.__h);
    assert.ok(!hs.includes('auto'), w + 'x' + h + ': the editor is never set to auto: ' + hs.join(','));
    const px = hs.map(parseFloat);
    assert.ok(px.every((v, i) => i === 0 || v >= px[i - 1]), 'never shorter while adding text: ' + hs.join(','));
    const moved = w < 860 ? at1.y - at0.y : at1.c - at0.c;
    assert.ok(moved >= 0 && moved <= 3 * 30, w + 'x' + h + ': the page only follows the new lines down: ' + JSON.stringify([at0, at1]));
    // the caret mid-screen: typing and Enter leave the page where it is
    const box = await (await p.$('.cl-text')).boundingBox();
    await p.mouse.click(box.x + 200, Math.max(box.y, 0) + Math.round(h / 3)); await p.waitForTimeout(100);
    const at2 = await where();
    for (const key of ['x', 'Enter', 'y']) { await p.keyboard.press(key); await p.waitForTimeout(60); }
    const at3 = await where();
    assert.strictEqual(w < 860 ? at3.y : at3.c, w < 860 ? at2.y : at2.c, w + 'x' + h + ': mid-text, the page doesn\'t move: ' + JSON.stringify([at2, at3]));
    // deleting shrinks the editor to fit again
    await p.keyboard.press('Control+a'); await p.keyboard.type('Short now.'); await p.waitForTimeout(100);
    assert.strictEqual((await where()).ta, 320, 'back to its least height');
    assert.strictEqual(await p.locator('.cl-text').count(), 1, 'one editor (the measuring copy is .cl-mirror)');
    assert.ok(await p.$eval('.cl-mirror', m => getComputedStyle(m).visibility === 'hidden' && m.getAttribute('aria-hidden') === 'true' && getComputedStyle(m).position === 'absolute'), 'the measuring copy is hidden and out of the page flow');
    await ctx.close();
  }
  await b.close();
  console.log('errors', errs);
  console.log('ok app_e2e76');
})().catch(e => { console.error(e); process.exit(1); });
