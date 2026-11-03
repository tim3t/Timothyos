// HOLODECK REMOTE AND GUIDE (2.57; simulated relay on RELAY_PORT, invented channels): the channels fold to one line by
// default, naming how many, the commercials and anything that needs a look (a folder that can't be reached); the guide
// has a row per channel; a tap on a channel or a show with the TV off tunes in to that channel; with more channels than
// fit, AUTO-SCROLL rolls the rows slowly, a touch holds it, and it's remembered; at phone width the guide scrolls
// sideways inside its box with the channel column in place, the keypad goes to six keys a row, and the page never
// scrolls sideways.
const { chromium } = require('playwright');
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:8104/macros/s/test/exec', key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
    localStorage.setItem('tos.nas.v1', JSON.stringify({ url: r, token: 'relay-test-token' })); localStorage.setItem('tos.pins.v1', JSON.stringify(['today', 'holodeck']));
    const d = Date.now() - 3600e3, dirs = ['Test Channel', 'Test Series', 'Test Network', 'Test Channel', 'Test Series', 'Test Channel', 'Not There'];
    localStorage.setItem('tos.holo.v1', JSON.stringify({ chans: dirs.map((x, i) => ({ id: i + 1, name: 'Sample ' + (i + 1), dir: '/Video/' + x, premiere: d - i * 7000, style: x === 'Test Network' ? 'network' : 'order' })), ch: 1, look: 'clean', muted: true }));
  }, [K, R]);
  await p.reload(); await p.waitForSelector('[data-screen="holodeck"].nav');
  await p.click('[data-screen="holodeck"].nav'); await p.waitForSelector('.hd-arch'); await p.click('[data-hdprog="visual"]'); await p.waitForSelector('.hd-tg');

  // ---- the channels, folded by default: one line that still names a problem
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 0);
  assert.strictEqual(await p.getAttribute('[data-hd="chans"]', 'aria-expanded'), 'false');
  await p.waitForFunction(() => /NEEDS A LOOK/.test(document.getElementById('hdCSum').textContent), null, { timeout: 15000 });
  assert.strictEqual(await txt(p, '#hdCSum'), '7 CHANNELS · NO COMMERCIALS · 1 NEEDS A LOOK');
  assert.strictEqual(await p.$$eval('.hd-grow', e => e.length), 7, 'a row per channel');
  await p.waitForFunction(() => /CAN'T REACH THE FOLDER/.test(document.querySelectorAll('.hd-grow')[6].innerText), null, { timeout: 15000 });

  // ---- a tap in the guide with the TV off: that channel, on air
  await p.waitForFunction(() => document.querySelectorAll('.hd-grow')[2].querySelector('.hd-gc.live'), null, { timeout: 20000 });
  await p.click('.hd-grow:nth-of-type(4) .hd-gc.live');
  await p.waitForFunction(() => { const v = document.getElementById('hdVideo'); return v && /Test Network/.test(decodeURIComponent(v.getAttribute('src') || '')) && v.currentTime > 0; }, null, { timeout: 15000 });
  assert.ok((await txt(p, '#eyebrow')).includes('· CH 3 · SAMPLE 3 · ON AIR'));
  assert.strictEqual(await p.getAttribute('.hd-grow:nth-of-type(4)', 'aria-current'), 'true');
  assert.strictEqual(await p.$$eval('.hd-key', e => e.length), 12);
  assert.ok(await p.isEnabled('[data-hdkey="last"]'), 'LAST: back to channel 1');
  await p.click('[data-hd="tune"]');   // off

  // ---- AUTO-SCROLL: more channels than fit; it rolls, a touch holds it, it's remembered
  const body = () => p.$eval('#hdTgBody', e => ({ top: e.scrollTop, room: e.scrollHeight - e.clientHeight }));
  await p.setViewportSize({ width: 1180, height: 520 }); await p.waitForTimeout(300);
  assert.ok((await body()).room > 20, 'the rows scroll inside the guide');
  assert.strictEqual(await p.getAttribute('[data-hd="gauto"]', 'aria-pressed'), 'false', 'off unless turned on');
  await p.click('[data-hd="gauto"]');
  assert.strictEqual(await p.getAttribute('[data-hd="gauto"]', 'aria-pressed'), 'true');
  await until(async () => (await body()).top > 8);
  await p.dispatchEvent('#hdTgBody', 'pointerdown'); const held = (await body()).top; await p.waitForTimeout(800);
  assert.ok(Math.abs((await body()).top - held) <= 1, 'a touch holds it');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).gauto), true, 'remembered');
  await p.click('[data-hd="gauto"]'); await p.setViewportSize({ width: 1180, height: 820 });

  // ---- open the channels: today's rows, remembered
  await p.click('[data-hd="chans"]');
  assert.strictEqual(await p.$$eval('.hd-chan', e => e.length), 7);
  assert.ok(await p.isVisible('[data-hd="pick"]') && await p.isVisible('.hd-ads'));
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).copen), true);
  await p.screenshot({ path: D + 'e70-holodeck.png', fullPage: true });

  // ---- phone width: the guide scrolls sideways in its box, the channel column stays; the page doesn't
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  assert.ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways page scroll');
  const x0 = await p.$eval('.hd-gch', e => e.getBoundingClientRect().left);
  await p.$eval('#hdTgBody', e => { e.scrollLeft = 200; }); await p.waitForTimeout(100);
  assert.ok(await p.$eval('#hdTgBody', e => e.scrollLeft > 100), 'the guide scrolls sideways');
  assert.ok(Math.abs((await p.$eval('.hd-gch', e => e.getBoundingClientRect().left)) - x0) < 2, 'the channel column stays put');
  assert.strictEqual(await p.$eval('.hd-keys', e => getComputedStyle(e).gridTemplateColumns.split(' ').length), 6);
  await p.screenshot({ path: D + 'e70-phone.png', fullPage: true });

  assert.deepStrictEqual(errs, []);
  await b.close();
  console.log('e2e70 HOLODECK remote and guide: OK');
})().catch(e => { console.error(e); process.exit(1); });
