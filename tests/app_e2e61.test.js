// Panels and the visible screen (2.51.5). With a podcast playing, the app keeps running in the background, and iPadOS
// reports a tiny visual viewport during the app switcher, then sends no resize on the way back: PLAN DAY opened as a
// sliver under the top bar. Simulated here (77 px while hidden, nothing on return): the panel now fills the screen.
// And what the measurement is for still works: with the keyboard up (a smaller viewport while typing) the panel sits
// above it, and fills the screen again once the field lets go. Simulated bridge on :8104.
const { chromium } = require('playwright');
const assert = require('assert');
const K = 'k'.repeat(64);
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', timezoneId: 'America/Chicago' });
  await ctx.addInitScript(() => {
    window.__vv = { h: null, hidden: false };
    const vv = window.visualViewport, real = Object.getOwnPropertyDescriptor(VisualViewport.prototype, 'height');
    Object.defineProperty(vv, 'height', { get() { return window.__vv.h != null ? window.__vv.h : real.get.call(vv); } });
    Object.defineProperty(document, 'hidden', { get() { return window.__vv.hidden; } });
    Object.defineProperty(document, 'visibilityState', { get() { return window.__vv.hidden ? 'hidden' : 'visible'; } });
  });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-10-06T09:46:00-05:00'));
  await p.goto('http://localhost:8080/');
  await p.evaluate(k => { localStorage.clear(); localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('today')); }, K);
  await p.reload(); await p.waitForTimeout(1500);
  // into the background with audio playing: hidden, the app switcher shrinks the viewport, a resize lands
  await p.evaluate(() => { window.__vv.hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.__vv.h = 77; visualViewport.dispatchEvent(new Event('resize')); });
  // back: full size again, visible, but iPadOS sends no resize this time
  await p.evaluate(() => { window.__vv.h = null; window.__vv.hidden = false; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(300);
  await p.click('#planBtn').catch(async () => p.click('text=PLAN DAY'));
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => { const s = [...document.querySelectorAll('.scrim')].find(x => !x.hidden); if (!s) return null; const sh = s.querySelector('.sheet'), a = s.getBoundingClientRect(), c = sh.getBoundingClientRect(); return { id: s.id, scrimH: Math.round(a.height), sheetH: Math.round(c.height), vvh: getComputedStyle(document.documentElement).getPropertyValue('--vv-h') }; });
  console.log('open panel:', JSON.stringify(r));
  assert.ok(r && r.id === 'planScrim' && r.scrimH === 820 && r.sheetH > 400, 'the panel fills the screen: ' + JSON.stringify(r));
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);

  // the keyboard: typing in CAPTURE with a 430 px viewport keeps the panel above it; letting go gives the screen back
  await p.click('#capBtn'); await p.waitForSelector('#capText');
  await p.focus('#capText');
  await p.evaluate(() => { window.__vv.h = 430; visualViewport.dispatchEvent(new Event('resize')); });
  const capH = () => p.evaluate(() => Math.round(document.getElementById('capText').closest('.scrim').getBoundingClientRect().height));
  assert.strictEqual(await capH(), 430, 'above the keyboard while typing');
  await p.evaluate(() => { window.__vv.h = null; document.activeElement.blur(); visualViewport.dispatchEvent(new Event('resize')); });
  await p.waitForTimeout(150);
  assert.strictEqual(await capH(), 820, 'the whole screen once the keyboard goes');
  console.log('errors', errs);
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
