// HOLODECK keeps still on a channel change (2.62.1; simulated bridge :8105, relay on RELAY_PORT). Timothy: CH ▲▼ moved
// the TV up and down, so he had to scroll it back to the middle. Redrawing the page let the browser lay it out half built
// and drop the scroll to the top. Now, in portrait (the page scrolls) and landscape (#content scrolls), CH ▲, CH ▼, the
// keypad, a guide row and the guide's own redraws all leave the TV exactly where it was.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8105 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const K = 'k'.repeat(64), U = 'http://127.0.0.1:' + P8105 + '/macros/s/test/exec', R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');

(async () => {
  const b = await chromium.launch(); const errs = [];
  for (const [w, h] of [[820, 1180], [1180, 820]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: true, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
    await quiet(ctx);
    await lane(ctx);
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8080/');
    await p.evaluate(([k, u, r]) => {
      localStorage.clear();
      localStorage.setItem('tos.conn.v1', JSON.stringify({ url: u, key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
      localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
      const pr = Date.now() - 86400000;
      localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: [
        { id: 1, name: 'Test Channel', dir: '/Video/Test Channel', premiere: pr }, { id: 2, name: 'Other Channel', dir: '/Video/Other Channel', premiere: pr },
        { id: 3, name: 'Test Series', dir: '/Video/Test Series', premiere: pr }, { id: 4, name: 'Test Network', dir: '/Video/Test Network', premiere: pr, style: 'network' }], ch: 1, look: 'crt', muted: true }));
    }, [K, U, R]);
    await p.reload(); await settled(p, 1500);
    await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]');
    await p.waitForSelector('.hd-tune:not([disabled])', { timeout: 30000 });
    await p.click('.hd-tune'); await settled(p, 2000);
    await p.evaluate(() => { const r = document.querySelector('.hd-tv').getBoundingClientRect(), c = document.getElementById('content'); if (innerWidth <= 860) window.scrollBy(0, r.top - 100); else c.scrollTop += r.top - 100; });
    await p.waitForTimeout(300);
    const tv = () => p.evaluate(() => ({ top: Math.round(document.querySelector('.hd-tv').getBoundingClientRect().top), y: Math.round(scrollY), c: document.getElementById('content').scrollTop }));
    const t0 = await tv();
    assert.ok((w <= 860 ? t0.y : t0.c) > 50, w + 'x' + h + ': scrolled down to the TV: ' + JSON.stringify(t0));
    const still = async (what) => { await settled(p, 700); const t = await tv(); assert.deepStrictEqual(t, t0, w + 'x' + h + ' ' + what + ': the TV stays put'); };
    await p.click('[data-hd="up"]'); await still('CH ▲');
    await p.click('[data-hd="up"]'); await still('CH ▲ again');
    await p.click('[data-hd="down"]'); await still('CH ▼');
    await p.click('[data-hdkey="3"]'); await settled(p, 1700); await still('keypad 3');
    await p.click('[data-hdkey="last"]'); await still('LAST');
    const row = await p.$('.hd-grow:not([aria-current="true"]) .hd-gch');
    if (row) { await p.evaluate(() => { const r = document.querySelector('.hd-grow:not([aria-current="true"]) .hd-gch'); r.click(); }); await still('a guide row'); }
    await p.click('[data-hd="mute"]'); await still('mute');
    assert.strictEqual(await p.locator('#hdVideo').count(), 1);
    await ctx.close();
  }
  await b.close();
  console.log('errors', errs);
  console.log('ok app_e2e77');
})().catch(e => { console.error(e); process.exit(1); });
