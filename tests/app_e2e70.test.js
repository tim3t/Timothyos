// HOLODECK REMOTE AND GUIDE (2.57; simulated relay on RELAY_PORT, invented channels): the channels fold to one line by
// default, naming how many, the commercials and anything that needs a look (a folder that can't be reached); the guide
// has a row per channel; a tap on a channel or a show with the TV off tunes in to that channel; with more channels than
// fit, AUTO-SCROLL rolls the rows slowly, a touch holds it, and it's remembered; at phone width the guide scrolls
// sideways inside its box with the channel column in place, the keypad goes to six keys a row, and the page never
// scrolls sideways.
const { chromium } = require('playwright');
const { quiet, settled } = require('./lib/settle');
const { lane, P8104 } = require('./lib/lane');   // this lane's copy of each simulated server (run.sh)
const assert = require('assert');
const D = __dirname + '/out/', K = 'k'.repeat(64), R = 'http://127.0.0.1:' + (process.env.RELAY_PORT || '8110');
const txt = async (p, sel) => (await p.innerText(sel)).replace(/\s+/g, ' ').trim();
const until = async (fn, ms = 10000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise(r => setTimeout(r, 150)); } };

(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1180, height: 820 }, timezoneId: 'America/Chicago', serviceWorkers: 'block' });
  await quiet(ctx);
  await lane(ctx);
  const p = await ctx.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:8080/');
  await p.evaluate(([k, r]) => {
    localStorage.clear();
    localStorage.setItem('tos.conn.v1', JSON.stringify({ url: 'http://127.0.0.1:' + P8104 + '/macros/s/test/exec', key: k })); localStorage.setItem('tos.start.v1', JSON.stringify('bridge'));
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
  await p.dispatchEvent('#hdTgBody', 'pointerdown'); const held = (await body()).top; await settled(p, 800);
  assert.ok(Math.abs((await body()).top - held) <= 1, 'a touch holds it');
  assert.strictEqual(await p.evaluate(() => JSON.parse(localStorage.getItem('tos.holo.v1')).gauto), true, 'remembered');

  // ---- 2.70: endless. The rows again below the last channel, out of VoiceOver's and Tab's way; the roll passes the last
  // channel straight into channel 1 with no pause or jump back; scrolling by hand loops too; a tap on the repeat tunes in
  await p.click('[data-hd="gauto"]'); await p.click('[data-hd="gauto"]');   // off and on: the hold is released
  const loop = () => p.evaluate(() => { const b = document.getElementById('hdTgBody'), cp = document.getElementById('hdGLoop'), r0 = b.querySelector('.hd-tgin > .hd-grow');
    return cp && !cp.hidden ? { lh: cp.offsetTop - r0.offsetTop, top: b.scrollTop, rows: cp.querySelectorAll('.hd-grow').length, hidden: cp.getAttribute('aria-hidden'), tabs: [...cp.querySelectorAll('button')].every(x => x.tabIndex === -1) } : null; });
  const L0 = await until(loop);
  assert.deepStrictEqual([L0.rows, L0.hidden, L0.tabs], [7, 'true', true], 'the repeat: every channel again, hidden from VoiceOver and Tab');
  await p.$eval('#hdTgBody', (e, h) => { e.scrollTop = h - 25; }, L0.lh);   // just before channel 1 comes round again
  const seen = []; for (let i = 0; i < 30; i++) { seen.push((await loop()).top); await p.waitForTimeout(100); }
  const back = seen.findIndex((t, i) => i && t < seen[i - 1]);
  console.log('rolling past the last channel:', seen.join(' '));
  assert.ok(back > 0 && seen[back] < 20, 'it rolled on into channel 1');
  assert.ok(seen.slice(back + 1).some(t => t > seen[back]), 'and kept rolling, no pause at the foot');
  assert.ok(seen.slice(0, back).every((t, i) => !i || t >= seen[i - 1]), 'no jump back to the top before it');
  await p.$eval('#hdTgBody', (e, h) => { e.scrollTop = h + 12; }, L0.lh); await p.waitForTimeout(150);
  assert.ok((await loop()).top < 40, 'scrolled by hand past the last channel: into channel 1');
  await p.click('#hdGLoop .hd-grow:nth-of-type(2) .hd-gch');   // channel 2, in the repeat
  await until(async () => (await txt(p, '#eyebrow')).includes('· CH 2 · SAMPLE 2'));
  await p.click('[data-hd="tune"]');   // off
  await p.click('[data-hd="gauto"]');
  assert.strictEqual(await p.$('#hdGLoop'), null, 'AUTO-SCROLL off: no repeat');
  await p.setViewportSize({ width: 1180, height: 820 });

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
